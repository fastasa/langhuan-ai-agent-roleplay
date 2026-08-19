import { API } from '../config/api'
import {
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG,
  type ReplyPlanOrchestratorConfig
} from '../app/personalityPlanOrchestrator'

/**
 * 情境提示词编排配置的前端读写。文档库负责编辑，编排审计侧栏只读展示。
 * 配置全局且极少变更，发送链路用模块级缓存避免每轮发送都打一次网络。
 */

let cachedEffectivePromise: Promise<ReplyPlanOrchestratorConfig> | null = null
let cachedEffectiveProtocolVersion = ''
const ORCHESTRATOR_CONFIG_PROTOCOL_VERSION = 'plan-batch-merged-v4'
/** 合并生成协议（2026-07-08）前的旧情境正文话术：命中即原位替换成 batches 口径（保留用户其余自定义内容）。 */
const STALE_PER_STRATEGY_CALL_PHRASE = '为每一类调用一次 generatePlanBatch'
const MERGED_BATCH_CALL_PHRASE = '只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项'
const STALE_REPLY_PLAN_REVIEW_END_INSTRUCTION = '评审执行后本轮编排即结束'
const CURTAIN_SCENE_TOOL_NAME = 'updateCurtainScene'

function normalizeEffectiveOrchestratorConfig(config: ReplyPlanOrchestratorConfig | null): ReplyPlanOrchestratorConfig {
  if (!config) return DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG
  const systemPrompt = String(config.systemPrompt || '').trim()
  const configTools = Array.isArray(config.tools) ? config.tools : []
  const hasCurtainSceneTool = configTools.some((tool) => String(tool?.name || '').trim() === CURTAIN_SCENE_TOOL_NAME)
  const hasCurtainSceneProtocol = systemPrompt.includes(CURTAIN_SCENE_TOOL_NAME)
    && systemPrompt.includes('快进时间')
    && systemPrompt.includes('改变地点')
    // v2：地点修改护栏（必须确认地点确实改变 + 正经地点名称 + 禁止占位词），旧提示词缺这段就强制升级
    && systemPrompt.includes('正经地点名称')
  // 批次4 去融合后的协议升级判定：旧 synthesize 协议（含 synthesizeReviewedPlans）或缺少 expressionMix
  // 的占比前移协议（批次2 引入）都视为过期，强制回到最新默认提示词；旧的结束语残留也升级。
  // 帷幕时间地点工具是判情境阶段的硬协议，不能只靠工具合并补齐工具名，否则旧 systemPrompt 会继续让模型跳过修改。
  // 批次1d-A：缺取料三件套指引（旧 systemPrompt 没有「取料三件套」段）即强制升级到最新默认，
  // 让老配置的提调也拿到取料能力说明。取料工具本身由下方 defaultTools 合并自动补齐，无需单独判定。
  const hasRetrievalGuidance = systemPrompt.includes('取料三件套')
  // 合并生成协议（2026-07-08）：旧 systemPrompt 还在教「每个反应类别各发一次 generatePlanBatch」，缺 batches 口径就强制升级。
  const hasMergedBatchProtocol = systemPrompt.includes('batches')
  const needsProtocolUpgrade = systemPrompt.includes('synthesizeReviewedPlans')
    || !systemPrompt.includes('expressionMix')
    || systemPrompt.includes(STALE_REPLY_PLAN_REVIEW_END_INSTRUCTION)
    || !hasCurtainSceneTool
    || !hasCurtainSceneProtocol
    || !hasRetrievalGuidance
    || !hasMergedBatchProtocol
  const defaultTools = Array.isArray(DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.tools)
    ? DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.tools
    : []
  const requiredToolNames = new Set(defaultTools.map((tool) => String(tool.name || '').trim()).filter(Boolean))
  const extraTools = Array.isArray(config.tools)
    ? config.tools.filter((tool) => {
      const name = String(tool?.name || '').trim()
      return name && !requiredToolNames.has(name)
    })
    : []
  return {
    ...config,
    systemPrompt: needsProtocolUpgrade
      ? DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.systemPrompt
      : systemPrompt,
    scenarios: Array.isArray(config.scenarios)
      ? config.scenarios.map((scenario) => ({
        ...scenario,
        // 情境正文老话术升级（合并生成协议）：命中旧句式就原位替换，保留用户其余自定义内容。
        body: String(scenario?.body || '').split(STALE_PER_STRATEGY_CALL_PHRASE).join(MERGED_BATCH_CALL_PHRASE),
        mountedPrompts: Array.isArray(scenario?.mountedPrompts)
          ? scenario.mountedPrompts.map((prompt) => ({ ...prompt }))
          : []
      }))
      : [],
    tools: [
      ...defaultTools.map((tool) => ({ ...tool })),
      ...extraTools.map((tool) => ({ ...tool }))
    ]
  }
}

async function fetchOrchestratorConfigRaw(endpoint: string = API.ORCHESTRATOR_CONFIG): Promise<ReplyPlanOrchestratorConfig | null> {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error('加载编排配置失败')
  const text = await response.text()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ReplyPlanOrchestratorConfig : null
  } catch {
    return null
  }
}

/** 编辑器用：读后端原值，null 表示从未保存过（UI 回退默认 seed 展示）。 */
export async function fetchOrchestratorConfig(): Promise<ReplyPlanOrchestratorConfig | null> {
  return fetchOrchestratorConfigRaw()
}

/** 发送链路用：取有效配置，未保存则回退默认 seed；带缓存，失败也回退默认 seed 不阻断回复。 */
export async function loadEffectiveOrchestratorConfig(): Promise<ReplyPlanOrchestratorConfig> {
  if (!cachedEffectivePromise || cachedEffectiveProtocolVersion !== ORCHESTRATOR_CONFIG_PROTOCOL_VERSION) {
    cachedEffectiveProtocolVersion = ORCHESTRATOR_CONFIG_PROTOCOL_VERSION
    cachedEffectivePromise = fetchOrchestratorConfigRaw(API.ORCHESTRATOR_CONFIG_EFFECTIVE)
      .then((config) => normalizeEffectiveOrchestratorConfig(config))
      .catch(() => DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG)
  }
  return cachedEffectivePromise
}

/** 保存本地编排配置；成功后失效缓存，让下一轮发送读到新配置。 */
export async function saveOrchestratorConfig(config: ReplyPlanOrchestratorConfig): Promise<ReplyPlanOrchestratorConfig> {
  const response = await fetch(API.ORCHESTRATOR_CONFIG, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
  if (!response.ok) {
    let message = '保存编排配置失败'
    try {
      const body = await response.json()
      if (body?.error) message = String(body.error)
    } catch {
      // 忽略解析失败，沿用默认错误文案
    }
    throw new Error(message)
  }
  invalidateOrchestratorConfigCache()
  const saved = await response.json().catch(() => config)
  return (saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : config) as ReplyPlanOrchestratorConfig
}

/** 失效缓存（保存后或需要强制刷新时调用）。 */
export function invalidateOrchestratorConfigCache() {
  cachedEffectivePromise = null
  cachedEffectiveProtocolVersion = ''
}
