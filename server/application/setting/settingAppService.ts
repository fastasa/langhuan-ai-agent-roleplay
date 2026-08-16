import { settingRepository } from '../../repositories/settingRepository.js'
import { DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG } from '../../../src/app/personalityPlanOrchestrator.js'

const CONFIG_ENDPOINT_KEYS = [
  'weather_api_key',
  'weather_api_domain',
  'currentTime',
  'currentWeather',
  'currentLocation',
  'weatherDetail',
  'locationHistory',
  'weatherHistory',
  'darkMode',
  'aiEvaluationEnabled',
  'aiProviderMode',
  'summaryPrompt',
  'bigSummaryPrompt',
  'dailyReportPrompt',
  'chatSummaryPresetName',
  'chatSummaryModel',
  'agentModelConfigs',
  'workspaceTarget',
  'workspaceSessionId',
  'recentMarkTypes',
  'userLevel',
  'dailyActivity'
]

const CONFIG_ENDPOINT_KEY_SET = new Set(CONFIG_ENDPOINT_KEYS)

// 本地编排配置（system scope 单条 JSON）
const REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY = 'replyPlanOrchestratorConfig'
const STALE_REPLY_PLAN_REVIEW_END_INSTRUCTION = '评审执行后本轮编排即结束'
const UNIQUE_REPLY_PLAN_STRATEGY_INSTRUCTION = '同一生成轮内 strategy 必须唯一'
const CURTAIN_SCENE_TOOL_NAME = 'updateCurtainScene'

function normalizeReplyPlanOrchestratorProtocol(config: Record<string, any>) {
  const systemPrompt = String(config.systemPrompt ?? '').trim()
  const configTools = Array.isArray(config.tools) ? config.tools : []
  const hasCurtainSceneTool = configTools.some((tool: any) => String(tool?.name || '').trim() === CURTAIN_SCENE_TOOL_NAME)
  const hasCurtainSceneProtocol = systemPrompt.includes(CURTAIN_SCENE_TOOL_NAME)
    && systemPrompt.includes('快进时间')
    && systemPrompt.includes('改变地点')
    // v2：地点修改护栏（必须确认地点确实改变 + 正经地点名称 + 禁止占位词），旧提示词缺这段就强制升级
    && systemPrompt.includes('正经地点名称')
  // 批次4 去融合后的协议升级判定：旧 synthesize 协议或缺少 expressionMix 的占比前移协议都视为过期。
  // 帷幕时间地点工具属于判情境阶段硬协议，旧配置缺工具或缺规则文本时也必须升级。
  const needsProtocolUpgrade = systemPrompt.includes('synthesizeReviewedPlans')
    || !systemPrompt.includes('expressionMix')
    || !systemPrompt.includes(UNIQUE_REPLY_PLAN_STRATEGY_INSTRUCTION)
    || systemPrompt.includes(STALE_REPLY_PLAN_REVIEW_END_INSTRUCTION)
    || !hasCurtainSceneTool
    || !hasCurtainSceneProtocol
  const defaultTools = Array.isArray(DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.tools)
    ? DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.tools
    : []
  const requiredToolNames = new Set(defaultTools.map((tool: any) => String(tool.name || '').trim()).filter(Boolean))
  const extraTools = (Array.isArray(config.tools) ? config.tools : [])
    .filter((tool: any) => {
      const name = String(tool?.name || '').trim()
      return name && !requiredToolNames.has(name)
    })
  return {
    ...config,
    systemPrompt: needsProtocolUpgrade
      ? DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.systemPrompt
      : systemPrompt,
    tools: [
      ...defaultTools.map((tool: any) => ({ ...tool })),
      ...extraTools
    ]
  }
}

function normalizeScenarioMountedPrompts(promptsRaw: unknown) {
  if (!Array.isArray(promptsRaw)) return []
  const seenIds = new Set<string>()
  return promptsRaw.map((prompt: any, index) => {
    const rawId = String(prompt?.id ?? '').trim()
    const baseId = rawId || `mounted_prompt_${index + 1}`
    let id = baseId
    let suffix = 2
    while (seenIds.has(id)) {
      id = `${baseId}_${suffix}`
      suffix += 1
    }
    seenIds.add(id)
    const orderIndex = Number(prompt?.orderIndex)
    return {
      id,
      title: String(prompt?.title ?? '').trim() || '挂载提示词',
      content: String(prompt?.content ?? '').trim(),
      // #7：保留描述（给提调读情境后看），否则保存时服务端会把描述抹掉。
      description: String(prompt?.description ?? '').trim(),
      enabled: prompt?.enabled !== false,
      orderIndex: Number.isFinite(orderIndex) ? orderIndex : 2.1 + index / 100,
      createdAt: String(prompt?.createdAt ?? prompt?.created_at ?? '').trim(),
      updatedAt: String(prompt?.updatedAt ?? prompt?.updated_at ?? '').trim()
    }
  })
}

// 结构归一化：只保留协议字段，避免脏数据落库；空配置返回 null（前端回退默认 seed）
function normalizeReplyPlanOrchestratorConfigPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, any>
  const systemPrompt = String(record.systemPrompt ?? '').trim()
  const scenariosRaw = Array.isArray(record.scenarios) ? record.scenarios : []
  const seenCodes = new Set<string>()
  const scenarios = scenariosRaw.map((scenario: any) => {
    const code = String(scenario?.code ?? '').trim().toLowerCase()
    if (!code || seenCodes.has(code)) return null
    seenCodes.add(code)
    // 触发描述（短，路由用）+ 正文（自然语言，按需读）；兼容旧 description 字段回填 trigger
    const trigger = String(scenario?.trigger ?? scenario?.description ?? '').trim()
    const body = String(scenario?.body ?? '').trim()
    const mountedPrompts = normalizeScenarioMountedPrompts(scenario?.mountedPrompts)
    return { code, label: String(scenario?.label ?? code).trim() || code, trigger, body, mountedPrompts }
  }).filter(Boolean)
  // 渐进式工具注册表：只保留协议字段
  const toolsRaw = Array.isArray(record.tools) ? record.tools : []
  const seenToolNames = new Set<string>()
  const tools = toolsRaw.map((tool: any) => {
    const name = String(tool?.name ?? '').trim()
    if (!name || seenToolNames.has(name)) return null
    seenToolNames.add(name)
    const kind = tool?.kind === 'meta' ? 'meta' : 'plan'
    return { name, kind, brief: String(tool?.brief ?? '').trim(), manual: String(tool?.manual ?? '').trim() }
  }).filter(Boolean)
  if (!systemPrompt && scenarios.length === 0) return null
  return normalizeReplyPlanOrchestratorProtocol({ systemPrompt, scenarios, tools })
}

export function createSettingAppService(repository = settingRepository) {
  return {
    getWeatherKey(): string {
      const row = repository.getConfigValue('weather_api_key')
      return row?.value || ''
    },
    getWeatherDomain(): string {
      const row = repository.getConfigValue('weather_api_domain')
      return row?.value || 'devapi.qweather.com'
    },
    updateWeatherConfig(payload: Record<string, any>) {
      if (payload.apiKey !== undefined) {
        repository.upsertConfigValue('weather_api_key', payload.apiKey)
      }
      if (payload.domain !== undefined) {
        repository.upsertConfigValue('weather_api_domain', payload.domain)
      }
      return { ok: true }
    },
    getConfigMap() {
      const rows = repository.listConfigByKeys(CONFIG_ENDPOINT_KEYS)
      const config: Record<string, unknown> = {}
      for (const row of rows) {
        try {
          config[row.key] = JSON.parse(row.value)
        } catch {
          config[row.key] = row.value
        }
      }
      return config
    },
    updateConfig(payload: Record<string, any>) {
      const { currentTime, currentWeather, currentLocation, ...rest } = payload
      const toStr = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)
      const rejectedKeys = Object.keys(payload || {}).filter((key) => (
        !CONFIG_ENDPOINT_KEY_SET.has(key)
      ))
      if (rejectedKeys.length) {
        return {
          ok: false,
          status: 400,
          error: '配置字段不允许写入',
          rejectedKeys
        }
      }
      if (currentTime !== undefined) {
        repository.upsertConfigValue('currentTime', toStr(currentTime))
      }
      if (currentWeather !== undefined) {
        repository.upsertConfigValue('currentWeather', toStr(currentWeather))
      }
      if (currentLocation !== undefined) {
        repository.upsertConfigValue('currentLocation', toStr(currentLocation))
      }
      for (const [key, value] of Object.entries(rest)) {
        repository.upsertConfigValue(key, toStr(value))
      }
      return { ok: true }
    },
    // 读取全局编排配置；未保存过返回 null，由前端回退默认 seed
    getReplyPlanOrchestratorConfig() {
      const row = repository.getConfigValue(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY, { scope: 'system' })
        || repository.getConfigValue(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY)
        || ('getConfigValueAnyScope' in repository && typeof repository.getConfigValueAnyScope === 'function'
          ? repository.getConfigValueAnyScope(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY)
          : undefined)
      if (!row?.value) return null
      try {
        return normalizeReplyPlanOrchestratorConfigPayload(JSON.parse(row.value))
      } catch {
        return null
      }
    },
    // 读取「当前用户有效」编排配置：用户级覆盖优先，回退全局 system 基线；未保存过返回 null，由前端回退默认 seed。
    // 与 getReplyPlanOrchestratorConfig（供本地编辑器读取基线）区分：本方法供聊天发送链路读运行时真值。
    getEffectiveReplyPlanOrchestratorConfig() {
      const row = repository.getEffectiveConfigValue
        && typeof repository.getEffectiveConfigValue === 'function'
        ? repository.getEffectiveConfigValue(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY)
        : repository.getConfigValue(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY, { scope: 'system' })
      if (!row?.value) return null
      try {
        return normalizeReplyPlanOrchestratorConfigPayload(JSON.parse(row.value))
      } catch {
        return null
      }
    },
    // 写入本地编排配置，结构归一化后落 system scope。
    updateReplyPlanOrchestratorConfig(payload: Record<string, any>) {
      const config = normalizeReplyPlanOrchestratorConfigPayload(payload)
      if (!config) {
        return { ok: false, status: 400, error: '编排配置格式错误：至少需要总提示词或一个情境' }
      }
      repository.upsertConfigValue(REPLY_PLAN_ORCHESTRATOR_CONFIG_KEY, JSON.stringify(config), { scope: 'system' })
      return { ok: true, data: config }
    }
  }
}

export const settingAppService = createSettingAppService()
