/**
 * 「造册」建状态栏 subagent（提调并行编排计划批次B·2026-07-10 用户拍板）。
 *
 * 定位：提调盘点发现某角色缺状态栏 → confirmStatusScope 弹卡（非阻塞·统筹继续排戏）→ 用户确认范围后，
 * 管线把任务书（buildZaoceBrief 产物：目的+已确认角色/对话/文档范围+禁令）交给造册；造册在自己的干净
 * 小上下文里读料→选/设计模板→实例化面板→submitPanels 交稿。建栏全程不占统筹主窗口、不拖慢出戏。
 *
 * 形态：与采风（caifengSubagent）同款 runAgentRuntime 独立小 loop。基础制作 Skill 常驻，进阶正文按 selector
 * 读取；工具集=采风只读集 + 进阶读取网关 + applyStatusPanelBatch 原子写入 + submitPanels 完成出口。批量 mutation
 * 成功只回逐项 receipt，不自动 terminate；旧逐张保存工具不再进入造册 registry。UI 复用 subagentRunStatus 运行卡，
 * subagentId=`zaoce:<taskKey>`。模型=balanced 校书档（modelTaskTiers 'zaoceBuild'·管线注入）。
 *
 * 铁律：只查任务书已确认的对话与文档范围（软约束口径与星依 scope/批次4 一致）；不编造设定；
 * 状态栏建在当前会话、宿主=已确认角色；完成后由管线 dispatch STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT 刷 UI
 * （本模块保持纯逻辑，不碰 DOM 事件）。
 */

import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import { buildCaifengToolset, type CaifengToolsetDeps } from './caifengSubagent'
import {
  ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME,
  createZaoceApplyStatusPanelBatchTool,
  type ZaoceStatusBatchToolContext
} from './zaoceStatusBatchTool'
import {
  assembleAgentSkillSupply,
  type AgentSkillActivationRequest,
  type AgentSkillSupplyAssembly
} from './agentSupply'

export const ZAOCE_SUBAGENT_ID_PREFIX = 'zaoce'
export const ZAOCE_SUBAGENT_LABEL = '造册'
export const ZAOCE_SUBMIT_TOOL_NAME = 'submitPanels'
export const ZAOCE_ADVANCED_SKILL_TOOL_NAME = 'readZaoceAdvancedSkill'

/** 造册预算：建栏任务必须收敛（读料+建模板+建面板+交稿·与采风同刻度）；死循环兜底=超时。 */
const ZAOCE_BUDGET = { maxTurns: 12, maxToolCalls: 24 }
const ZAOCE_NUDGE_MAX = 2

export interface ZaoceBuildResult {
  ok: boolean
  /** 给用户看的完成摘要（建了什么、字段依据什么填的）。 */
  summary: string
  /** 建/改的状态栏（或模板）名称列表。 */
  panels: string[]
  /** 失败原因（ok=false 才有：超时/超预算/没交稿/被停止）。 */
  error?: string
  /** 同类任务可直接横向比较的真实运行指标；token/cache 数字只采信模型供应商 usage。 */
  metrics: ZaoceBuildMetrics
}

export interface ZaoceBuildMetrics {
  firstEffectiveOutputMs: number | null
  totalDurationMs: number
  loopDurationMs: number
  modelTurns: number
  skillReadCount: number
  toolCalls: number
  usageReported: boolean
  promptTokens: number | null
  completionTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  retryCount: number
}

function emptyZaoceBuildMetrics(): ZaoceBuildMetrics {
  return {
    firstEffectiveOutputMs: null,
    totalDurationMs: 0,
    loopDurationMs: 0,
    modelTurns: 0,
    skillReadCount: 0,
    toolCalls: 0,
    usageReported: false,
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
    retryCount: 0
  }
}

/** 角色与边界属于 Agent 常驻核；具体造册方法由 manifest 的 resident Skill 供给，避免两份正文漂移。 */
export const ZAOCE_SYSTEM_PROMPT_BASE = [
  '你是「造册」——琅嬛聊天区提调（导演）的建状态栏专员。用户已经在范围确认卡上确认了这次建栏的范围（角色/参考对话/文档库范围），任务书就在下面；你的唯一职责是按已确认范围把状态栏建好，然后交稿。',
  '',
  '铁律：',
  '- 只查任务书确认的对话与文档库范围，禁止引入范围外资料，禁止编造设定。',
  '- 建状态栏与设计模板之外不做任何修改：不改消息、不动文档、不碰其他角色的状态栏。',
  '- 不要漫游：围绕要填的字段取料，查到就收；同一个查询别重复发。',
  '- 任务要求总览、图表、资源看板或图片槽时，先按目录读取对应进阶小节，再把受控 presentation 与字段/实例放在同一原子批提交；不要输出任意代码或样式。'
].join('\n')

/** 兼容旧 import 名；这里只代表常驻角色核，不再包含造册方法正文。 */
export const ZAOCE_SYSTEM_PROMPT = ZAOCE_SYSTEM_PROMPT_BASE

export function buildZaoceSystemPrompt(skillAssembly: AgentSkillSupplyAssembly): string {
  return [
    ZAOCE_SYSTEM_PROMPT_BASE,
    skillAssembly.layers['0'],
    skillAssembly.layers['1'] ? `【可按需读取的 Skill 目录】\n${skillAssembly.layers['1']}` : ''
  ].filter((part) => String(part || '').trim()).join('\n\n')
}

function buildZaoceUserMessage(contextBlock: string, brief: string, skillAssembly: AgentSkillSupplyAssembly): string {
  return [
    `【统一原始可见上下文】\n${contextBlock}`,
    skillAssembly.layers['4'] ? `【4·已读资料】\n${skillAssembly.layers['4']}` : '',
    brief
  ].filter((part) => String(part || '').trim()).join('\n\n')
}

/** 运行卡任务名提取（UI 用）：从 status.input（=buildZaoceBrief 产物·tidiaoStatusScopeState）首行
 *  「【建栏任务】xxx」抽标题；抽不到回退空串（UI 显示默认「建状态栏」）。 */
export function extractZaoceTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【建栏任务】(.*)$/)
  return match ? match[1].trim() : ''
}

/** 进阶正文读取仍经过 manifest 授权与 loader；简单任务只看到目录和工具名，不加载正文。 */
export function createReadZaoceAdvancedSkillTool(): ToolDefinition {
  return {
    name: ZAOCE_ADVANCED_SKILL_TOOL_NAME,
    brief: '仅在基础造册规则不够时读取一个进阶小节。制作总览先读 visual_carrier_selection；分类图表读 categorical_chart；资源看板读 resource_dashboard；富媒体读 rich_media_scaffold。',
    schema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          enum: ['advanced_template', 'cross_panel_reference', 'rich_media_scaffold', 'visual_carrier_selection', 'categorical_chart', 'resource_dashboard'],
          description: '要读取的准确进阶小节键。'
        }
      },
      required: ['selector']
    },
    validateArgs: (args) => (String(args.selector || '').trim() ? null : 'readZaoceAdvancedSkill 缺少 selector'),
    execute: async (toolCall) => {
      const selector = String(toolCall.args.selector || '').trim()
      const assembly = await assembleAgentSkillSupply({
        profileId: 'zaoce.status-panel',
        activations: [{
          skillId: 'zaoce.advanced-authoring',
          activation: 'model_tool',
          selector,
          reason: `造册模型按需读取 ${selector}`
        }]
      })
      const body = String(assembly.layers['4'] || '').trim()
      if (!body) {
        const message = `没有找到造册进阶小节：${selector}`
        return {
          content: message,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message, retryable: true },
          details: { kind: 'zaoceAdvancedSkill', selector, promptSupplyTrace: assembly.trace }
        }
      }
      return {
        content: `【4·已读资料】\n${body}`,
        details: { kind: 'zaoceAdvancedSkill', selector, promptSupplyTrace: assembly.trace },
        lifecycle: { kind: 'durable', selector: 'durable', promptSupplyTrace: 'searchable' }
      }
    }
  }
}

export type ZaoceToolsetDeps = Omit<CaifengToolsetDeps, 'statusSystem'> & {
  /** 同一份正式状态上下文同时供只读目录与原子批写，避免读写 scope 漂移。 */
  batchContext: ZaoceStatusBatchToolContext
}

/** 造册工具集：采风只读集 + 进阶按需读取 + 原子批量写入。旧逐张 save 工具不再进入造册 registry。 */
export function buildZaoceToolset(deps: ZaoceToolsetDeps): ToolDefinition[] {
  const batchTool = createZaoceApplyStatusPanelBatchTool(deps.batchContext) as unknown as ToolDefinition
  return [
    ...buildCaifengToolset({ ...deps, statusSystem: deps.batchContext }),
    createReadZaoceAdvancedSkillTool(),
    batchTool
  ]
}

/** 交稿工具（造册私有·只活在造册 registry，不进提调语义表）。 */
function createSubmitPanelsTool(
  holder: { result: ZaoceBuildResult | null },
  writeState: { successfulPanelWrites: number; panelNames: string[] }
): ToolDefinition {
  return {
    name: ZAOCE_SUBMIT_TOOL_NAME,
    brief: '至少一次 applyStatusPanelBatch 已真实写入状态栏后才能交稿（唯一收尾方式）：summary 写做了什么、关键字段依据什么资料填的；panels 可省略，系统会从真实批写回执自动带出本轮建/改的状态栏名。没有适配模板时应原创模板并继续建栏，不能用 submitPanels 放弃任务。',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '完成摘要（必填）：建了什么状态栏/模板、关键字段的取值依据；建不成写明卡在哪。' },
        panels: {
          type: 'array',
          items: { type: 'string' },
          description: '可选；本轮已真实建/改的状态栏名称列表。系统最终以 applyStatusPanelBatch 的真实回执为准。'
        }
      },
      required: ['summary']
    },
    validateArgs: (args) => {
      if (!String(args.summary || '').trim()) return 'submitPanels 缺少 summary（完成摘要）'
      if (writeState.successfulPanelWrites < 1) return '本轮还没有任何状态栏被 applyStatusPanelBatch 成功写入，不能交稿；没有现成模板时请在同一批里提交原创 template + panels'
      return null
    },
    execute: (toolCall) => {
      const submittedPanels = (Array.isArray(toolCall.args.panels) ? toolCall.args.panels : [])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
      const panels = writeState.panelNames.length ? [...writeState.panelNames] : submittedPanels
      if (writeState.successfulPanelWrites < 1 || !panels.length) {
        return {
          content: '交稿被拒绝：必须先真实写入至少一个状态栏；没有现成模板时请原创模板并与 panels 同批提交。',
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: '造册尚未写入状态栏，不能交稿', retryable: true }
        }
      }
      holder.result = { ok: true, summary: String(toolCall.args.summary || '').trim(), panels, metrics: emptyZaoceBuildMetrics() }
      return { content: '已收到建栏交稿，任务结束。', details: { kind: 'zaoceSubmit' } }
    }
  }
}

export interface RunZaoceBuildDeps {
  sessionId: string
  /** AgentContext zaoce 配方渲染出的完整原始可见上下文。 */
  contextBlock: string
  /** 运行卡键（如 `zaoce:1`·会话内自增）。 */
  taskKey: string
  /** 造册工具集（buildZaoceToolset 产物）。 */
  tools: ToolDefinition[]
  /** 斜杠命令/按钮等已经给出准确任务类型时，由同一次主模型调用直接预装命中小节，不加分类调用。 */
  skillActivations?: readonly AgentSkillActivationRequest[]
  /** balanced 校书档模型调用（管线 buildDeferredLoopModelCall taskId='zaoceBuild' 注入·返回带 usage）。 */
  callModel: (request: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  }) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>
  signal?: AbortSignal
}

function modelToolCallName(call: unknown): string {
  const item = call && typeof call === 'object' ? call as Record<string, any> : {}
  return String(item.toolName ?? item.name ?? item.function?.name ?? '').trim()
}

/** 跑一次造册建栏小 loop：runSubagentLoop 收编骨架（begin/end 运行卡+空转续轮门+交稿即 terminate+usage 累加），
 *  submitPanels 交稿即 terminate → 回结果。永不抛错（结果如实带 ok/error）；abort 时返回 ok:false。 */
export async function runZaoceBuild(brief: string, deps: RunZaoceBuildDeps): Promise<ZaoceBuildResult> {
  const startedAt = Date.now()
  const metrics = emptyZaoceBuildMetrics()
  const contextBlock = String(deps.contextBlock || '').trim()
  if (!contextBlock) {
    metrics.totalDurationMs = Date.now() - startedAt
    return { ok: false, summary: '', panels: [], error: '造册统一原始可见上下文为空，已拒绝启动', metrics }
  }
  const skillAssembly = await assembleAgentSkillSupply({
    profileId: 'zaoce.status-panel',
    ...(deps.skillActivations ? { activations: deps.skillActivations } : {})
  })
  const preloadedSkillReads = skillAssembly.trace.filter((entry) => entry.layer === '4' && entry.loadState === 'loaded').length
  const holder: { result: ZaoceBuildResult | null } = { result: null }
  const writeState = { successfulPanelWrites: 0, panelNames: [] as string[] }
  const guardedTools: ToolDefinition[] = deps.tools.map((tool) => {
    if (tool.name !== ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME) return tool
    return {
      ...tool,
      execute: async (toolCall, ctx) => {
        const result = await tool.execute(toolCall, ctx)
        if (result.status !== 'error') {
          const receipts = Array.isArray((result.details as Record<string, unknown> | undefined)?.receipts)
            ? (result.details as { receipts: Array<Record<string, unknown>> }).receipts
            : []
          const panelReceipts = receipts.filter((receipt) => receipt.kind === 'panel')
          writeState.successfulPanelWrites += panelReceipts.length
          for (const receipt of panelReceipts) {
            const name = String(receipt.name || receipt.targetId || '').trim()
            if (name && !writeState.panelNames.includes(name)) writeState.panelNames.push(name)
          }
        }
        return result
      }
    }
  })
  const loopResult = await runSubagentLoop({
    sessionId: deps.sessionId,
    subagentId: `${ZAOCE_SUBAGENT_ID_PREFIX}:${deps.taskKey}`,
    loggedInput: brief,
    presentation: {
      label: '造册',
      icon: 'list-checks',
      runningVerb: '建栏中',
      title: extractZaoceTaskTitle(brief) || '状态栏制作'
    },
    agentName: 'ZaoceBuildAgent',
    profileId: 'zaoce.status-panel',
    runtimeVersion: 'zaoce-build-runtime-v1',
    messages: [
      { role: 'system', content: buildZaoceSystemPrompt(skillAssembly) },
      { role: 'user', content: buildZaoceUserMessage(contextBlock, brief, skillAssembly) }
    ],
    tools: guardedTools,
    skillAssembly,
    submitTool: createSubmitPanelsTool(holder, writeState),
    submitToolName: ZAOCE_SUBMIT_TOOL_NAME,
    isSubmitted: () => Boolean(holder.result),
    guardSubmitTerminate: true,
    nudgeId: 'zaoce-empty-turn-nudge',
    nudgeMaxCount: ZAOCE_NUDGE_MAX,
    buildNudgeText: () => '你这一步没有发起任何工具调用，而建栏任务还没交稿：光在正文里说建好了不算完成。状态栏建好了就立刻调用 submitPanels 交稿（summary 写清做了什么与取值依据）；还没建就继续按流程做——查现状/定模板/取料/建卡。',
    submitTerminateId: 'zaoce-submit-terminate',
    submitTerminateSummary: '造册已交稿，收束建栏 loop',
    // 交稿宽限轮（批K）：预算尽/超时/收束没交稿时，强制给一次"只许 submitPanels"的补救机会。
    submitGrace: {
      submitToolName: ZAOCE_SUBMIT_TOOL_NAME,
      buildNudge: (reason, failureHint) => [
        reason === 'budget' ? '建栏预算（轮数/工具调用数）已经用尽' : reason === 'timeout' ? '建栏时间已经用尽' : '你已经收束却始终没有交稿',
        '，这是最后的交稿机会：立即调用 submitPanels，用目前已经建好的内容交稿——summary 写清已建了什么、取值依据什么、哪些没建完。已建的状态栏都已真实落库，不交稿它们就成了没人认领的孤儿。不要调用任何其他工具，不要再继续建卡。',
        ...(failureHint ? [`\n上次交稿失败原因：${failureHint}——修正参数后重新提交。`] : [])
      ].join('')
    },
    budget: ZAOCE_BUDGET,
    timeoutMs: SUBAGENT_LOOP_TIMEOUT_MS,
    ...(deps.signal ? { signal: deps.signal } : {}),
    callModel: deps.callModel,
    isEffectiveOutput: (response) => response.toolCalls.some((call) => (
      modelToolCallName(call) === ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME
    )),
    onNoSubmit: (reason, detail) => {
      const reasonText = (reason === 'timeout'
        ? '建栏超时（30 分钟）'
        : reason === 'aborted'
          ? '建栏被停止'
          : '造册没有调用 submitPanels 交稿（结果未结构化提交）')
        + (detail?.graceFailed ? '；宽限轮补交稿也未成功' : '')
      holder.result = { ok: false, summary: '', panels: [], error: reasonText, metrics: emptyZaoceBuildMetrics() }
    },
    onCatchError: (message) => {
      holder.result = { ok: false, summary: '', panels: [], error: `建栏运行失败：${message}`, metrics: emptyZaoceBuildMetrics() }
    },
    buildEndPayload: () => {
      const outcome = holder.result as ZaoceBuildResult
      return {
        ok: outcome.ok,
        ...(outcome.ok ? {} : { error: outcome.error || '建栏失败' }),
        ...(outcome.summary ? { output: outcome.summary } : {})
      }
    }
  })
  metrics.firstEffectiveOutputMs = loopResult.metrics.firstEffectiveOutputMs
  metrics.loopDurationMs = loopResult.metrics.totalDurationMs
  metrics.totalDurationMs = Date.now() - startedAt
  metrics.modelTurns = loopResult.metrics.modelTurns
  metrics.skillReadCount = preloadedSkillReads + loopResult.toolResults.filter((result) => (
    result.toolName === ZAOCE_ADVANCED_SKILL_TOOL_NAME && result.status === 'success'
  )).length
  metrics.toolCalls = loopResult.metrics.toolCalls
  metrics.retryCount = loopResult.metrics.retryCount
  metrics.usageReported = loopResult.metrics.usageReported
  if (loopResult.metrics.usage) {
    metrics.promptTokens = loopResult.metrics.usage.promptTokens
    metrics.completionTokens = loopResult.metrics.usage.completionTokens
    metrics.cacheReadTokens = loopResult.metrics.cacheReadReported ? (loopResult.metrics.usage.cacheReadTokens ?? 0) : null
    metrics.cacheCreationTokens = loopResult.metrics.cacheCreationReported ? (loopResult.metrics.usage.cacheCreationTokens ?? 0) : null
  }
  return { ...(holder.result as ZaoceBuildResult), metrics }
}
