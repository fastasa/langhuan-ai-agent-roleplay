/**
 * 编剧独立 agent harness（地图与剧本工作区专业Agent计划批B）。
 *
 * 与 xingyiAgentHarness.ts 同一范式（runAgentRuntime 直接组装，不经过 runXingyiAgent/dispatchScriptwriter）：
 * - 对话式：一轮结束即"模型给出自然语言正文"，允许零写只读问答（不像 narrativeSeedWorkspaceAgent.ts 那样
 *   必须 submit 否则判失败——那套「批量submit」外壳与"允许零写"的产品要求冲突，本文件改用三个独立写工具，
 *   新建/删除和高风险字段修改过 confirmWrite 硬门；低风险正文补写仍走版本锁与事件账本，模型可以只回答不调任何工具，
 *   continuationGate 只在"说了要做却没调工具"时才续轮）。
 * - 复用 narrativeSeedWorkspaceAgent.ts 的内容而非外壳：剧作知识通过 manifest Skill 装配器常驻加载、
 *   shared/narrativeSeedAuthoring.ts 的字段白名单与完整性校验、chatRepository.ts 的正式写 API 全部原样复用。
 * - 会话/运行状态归属：不属于本文件——由 useWorkspaceAgentController.ts 持有 scope 状态、调用本 harness。
 */

import type { AgentRuntimeMessage, AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import { createSessionSubagentControlCapability } from './agentRuntime/subagentControl'
import type { AgentTranscript } from './agentRuntime/types'
import type { ToolDefinition } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel, type ConfirmWriteChannel } from './agentRuntime/interactionContract'
import { invalidArgs, runtimeError, runWorkspaceAgentRuntime } from './agentHarnessShared'
import type { AgentTurnStreamController } from './agentTurnStream'
import { assembleAgentSkillSupply } from './agentSupply'
import {
  NARRATIVE_SEED_HIGH_RISK_AUTHOR_FIELDS,
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  pickNarrativeSeedAuthorFields,
  validateCompleteNarrativeSeedAuthoring
} from '../../shared/narrativeSeedAuthoring'

export const SCRIPTWRITER_AGENT_NAME = '编剧'

export interface ScriptwriterHistoryMessage { role: 'user' | 'assistant'; content: string }

export interface ScriptwriterOrchestratorRequest {
  messages: AgentRuntimeMessage[]
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  turnIndex: number
}

export interface ScriptwriterWriteApi {
  createNarrativeSeed(worldId: string, input: Record<string, unknown>): Promise<Record<string, any>>
  updateNarrativeSeed(worldId: string, seedId: string, input: Record<string, unknown>): Promise<Record<string, any>>
  deleteNarrativeSeed(worldId: string, seedId: string, expectedVersion: number): Promise<void>
}

export interface RunScriptwriterAgentInput {
  userText: string
  history?: ScriptwriterHistoryMessage[]
  /** AgentContext 配方渲染出的完整原始可见上下文；Harness 不再自行拼世界、角色、状态或种子。 */
  contextBlock: string
  worldId: string
  /** 当前世界全部种子详情快照（含 id/version/author字段），由调用方在发起本轮前拉好。 */
  seeds: Array<Record<string, unknown>>
  /** 审计：写入时标记来源聊天（工作区打开它的那个聊天会话id），不作会话归属真值。 */
  sourceSessionId?: string
  callOrchestrator: (request: ScriptwriterOrchestratorRequest) => Promise<{ content: string; toolCalls: unknown[] } | null>
  confirmWrite?: ConfirmWriteChannel
  writeApi: ScriptwriterWriteApi
  /** 写成功后回调（供调用方触发 NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT 通知右侧面板重读）。 */
  onSeedsChanged?: () => void
  /** 当世界种子数>50、调用方只预拉了精简摘要时，提供按需读取单条种子完整详情的能力
   *  （readNarrativeSeedDetail 工具用它补全 participants/links 后才允许改/删）。 */
  fetchSeedDetail?: (seedId: string) => Promise<Record<string, unknown>>
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  initialDeferredActiveTools?: readonly string[]
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  turnStream?: AgentTurnStreamController
  signal?: AbortSignal
  budget?: { maxTurns?: number; maxToolCalls?: number }
}

export interface RunScriptwriterAgentResult {
  reply: string
  terminalReason: string
  transcript: AgentTranscript
}

function clip(text: string, limit = 60): string {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

const textSchema = (description: string) => ({ type: 'string', description })

/** 种子可写字段 schema（与 narrativeSeedWorkspaceAgent.ts 的 patchSchema 同一份字段定义内容，
 *  但该常量未导出、且本文件是"单条写"而非"批量patch"外壳，故按同一字段语义重新声明，不是简单复制黏贴）。 */
const SEED_FIELD_PROPERTIES = {
  type: { type: 'string', enum: [...NARRATIVE_SEED_TYPES], description: '种子类型；伏笔=foreshadow，倒计时=countdown，幕后推进=offscreen_process，威胁/机会=threat_or_opportunity，承诺/债务=promise_or_debt，关系变化=relationship_change，世界变化=world_change。' },
  title: textSchema('具体、可辨认的短标题；例如"钟楼地下的第二把钥匙"。'),
  description: textSchema('当前局势、可接触的戏剧问题与边界；不写死玩家解法。'),
  cause: textSchema('让种子成立的已发生事实、明确设定或来源因果。'),
  currentProgress: textSchema('此刻已经推进到哪里；未推进也要明确写"尚未启动"，不得把计划写成已发生。'),
  expectedOutcome: textSchema('种子未来可能兑现成什么变化；保持候选语气，不预写无人干预后果。'),
  startTime: textSchema('开始进入判断的时点；优先 ISO 8601（如 2026-07-15T20:30:00+08:00），虚构历法则写完整世界内日期与时刻。'),
  mapFeatureId: textSchema('只填写正式上下文已核实的地图要素 id；没有精确要素时显式填写空字符串。'),
  locationText: textSchema('严格使用"大地点/中地点/小地点"三段格式，例如"中国/上海/外滩钟楼"。'),
  impactScope: textSchema('自由文本说明会影响的人物、关系、地点或世界状态。'),
  status: { type: 'string', enum: [...NARRATIVE_SEED_STATUSES], description: '未发生但正在推进通常用 active；尚未启动用 dormant；ready_to_trigger 只由帷幕时间越界自动产生；不得无证据写 triggered/resolved。' },
  visibilityMode: { type: 'string', enum: [...NARRATIVE_SEED_VISIBILITY_MODES], description: '幕后秘密通常为 director_only；相关者知情为 participants；共同事实为 public；复杂差异才用 custom。' },
  allowFrontstage: { type: 'boolean', description: '是否允许确定性取料进入前台角色上下文。' },
  participants: {
    type: 'array', maxItems: 100, description: '可选关联，不是创建门槛；没有关联项时显式填写 []。',
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        participantType: { type: 'string', enum: [...NARRATIVE_SEED_PARTICIPANT_TYPES] },
        participantId: textSchema('正式角色/实体 id；freeform 可省略。'),
        displayName: textSchema('显示名；freeform 必填。'),
        relationRole: textSchema('在此种子中的作用。')
      },
      required: ['participantType']
    }
  },
  links: {
    type: 'array', maxItems: 100, description: '只可引用统一原始可见上下文中已存在的 targetSeedId；没有关系时显式填写 []。',
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        targetSeedId: textSchema('已存在的目标 seedId。'),
        relationType: { type: 'string', enum: [...NARRATIVE_SEED_LINK_TYPES] }
      },
      required: ['targetSeedId', 'relationType']
    }
  }
} as const

interface ScriptwriterToolContext {
  worldId: string
  seeds: Array<Record<string, unknown>>
  confirmWrite?: ConfirmWriteChannel
  writeApi: ScriptwriterWriteApi
  sourceSessionId?: string
  onSeedsChanged?: () => void
  fetchSeedDetail?: (seedId: string) => Promise<Record<string, unknown>>
}

/** 版本冲突判定：优先读 chatRepository.ensureOk 抛出的 error.status（服务端409），
 *  文本兜底只认服务端真实文案「版本冲突」，不再用过宽的 409/version/expectedVersion 误判正常报错文案
 *  （如某次转换失败消息里若恰好带数字409，旧文本正则会误判）。 */
function isVersionConflict(error: unknown): boolean {
  if ((error as { status?: number } | null)?.status === 409) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /版本冲突/.test(message)
}

function createReadNarrativeSeedDetailTool(ctx: ScriptwriterToolContext): ToolDefinition {
  return {
    name: 'readNarrativeSeedDetail',
    brief: '读取指定 seedId 的完整种子详情（含 version、cause、currentProgress、participants、links 等完整字段）。'
      + '当前种子列表条目较多时，统一原始可见上下文可能只提供精简信息（缺少 participants/links），'
      + '修改或删除某条种子前，如果它缺少 participants/links 字段，必须先调用本工具读到完整详情。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { seedId: textSchema('必填。只能使用统一原始可见上下文中已存在的 id。') },
      required: ['seedId']
    },
    execute: async (call) => {
      const seedId = String((call.args as Record<string, unknown>).seedId || '').trim()
      const currentIndex = ctx.seeds.findIndex((seed) => String(seed.id || '') === seedId)
      if (currentIndex < 0) return invalidArgs(`找不到 seedId「${seedId}」，请只引用统一原始可见上下文里已存在的种子。`)
      if (!ctx.fetchSeedDetail) return runtimeError('当前环境未提供读取种子详情的能力，请直接基于已有的精简信息判断，或告知用户暂时无法读取完整详情。')
      try {
        const detail = await ctx.fetchSeedDetail(seedId)
        ctx.seeds[currentIndex] = { ...detail, id: seedId }
        return { content: `已读取种子「${String(detail.title || '')}」的完整详情。`, status: 'success', details: { seed: detail } }
      } catch (error) {
        return runtimeError(`读取种子详情失败：${(error as Error).message}`)
      }
    }
  }
}

function createCreateNarrativeSeedTool(ctx: ScriptwriterToolContext): ToolDefinition {
  return {
    name: 'createNarrativeSeed',
    longRunning: true,
    brief: '新建一条世界叙事种子（写操作，会先弹确认卡）。仅在现有种子无法承载新因果时使用。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: SEED_FIELD_PROPERTIES,
      required: ['type', 'title', 'description', 'cause', 'currentProgress', 'expectedOutcome', 'startTime', 'mapFeatureId', 'locationText', 'impactScope', 'status', 'visibilityMode', 'allowFrontstage', 'participants', 'links']
    },
    execute: async (call) => {
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '新建剧本种子')!
      const patch = pickNarrativeSeedAuthorFields(call.args as Record<string, unknown>)
      const errors = validateCompleteNarrativeSeedAuthoring(patch)
      if (errors.length) return invalidArgs(`新建种子未通过校验：${errors.join('；')}`)
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '新建剧本种子',
        lines: [`类型：${String(patch.type || '')}`, `标题：${String(patch.title || '')}`, `状态：${String(patch.status || '')}`]
      }, '新建剧本种子')
      if (denied) return denied
      try {
        const created = await ctx.writeApi.createNarrativeSeed(ctx.worldId, {
          ...patch,
          ...(ctx.sourceSessionId ? { sourceSessionId: ctx.sourceSessionId } : {})
        })
        ctx.seeds.push({ ...patch, id: created?.id, version: created?.version ?? 1 })
        ctx.onSeedsChanged?.()
        return { content: `已新建种子「${String(patch.title)}」（id=${String(created?.id || '')}）。`, status: 'success' }
      } catch (error) {
        return runtimeError(`新建种子失败：${(error as Error).message}`)
      }
    }
  }
}

function createUpdateNarrativeSeedTool(ctx: ScriptwriterToolContext): ToolDefinition {
  return {
    name: 'updateNarrativeSeed',
    longRunning: true,
    brief: '按 seedId 精确修改已有种子的任意模型字段；未提供的字段保持不变。类型/标题/起因/时间地点/影响范围/状态/可见性/前台资格/参与者/关系属于高风险字段，会先弹确认卡；description/currentProgress/expectedOutcome 在版本锁与账本下可直接补写。只能引用统一原始可见上下文里已存在的 seedId。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { seedId: textSchema('必填。只能使用统一原始可见上下文中已存在的 id。'), ...SEED_FIELD_PROPERTIES },
      required: ['seedId']
    },
    execute: async (call) => {
      const seedId = String((call.args as Record<string, unknown>).seedId || '').trim()
      const currentIndex = ctx.seeds.findIndex((seed) => String(seed.id || '') === seedId)
      if (currentIndex < 0) return invalidArgs(`找不到 seedId「${seedId}」，请只引用统一原始可见上下文里已存在的种子。`)
      const current = ctx.seeds[currentIndex]
      if (current.participants === undefined || current.links === undefined) {
        return invalidArgs(`种子「${String(current.title || seedId)}」当前只有精简信息（缺少 participants/links），请先调用 readNarrativeSeedDetail 读取完整详情后再修改。`)
      }
      const { seedId: _drop, ...rest } = call.args as Record<string, unknown>
      const patch = pickNarrativeSeedAuthorFields(rest)
      if (!Object.keys(patch).length) return invalidArgs('没有提供任何要修改的字段。')
      const merged = { ...pickNarrativeSeedAuthorFields(current), ...patch }
      const errors = validateCompleteNarrativeSeedAuthoring(merged)
      if (errors.length) return invalidArgs(`修改未通过校验：${errors.join('；')}`)
      const expectedVersion = Number(current.version || 0)
      const highRiskFields = Object.keys(patch).filter((key) => (NARRATIVE_SEED_HIGH_RISK_AUTHOR_FIELDS as readonly string[]).includes(key))
      if (highRiskFields.length) {
        if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '修改剧本高风险字段')!
        const denied = await askConfirmWrite(ctx.confirmWrite, {
          title: '确认剧本高风险修改',
          lines: [
            `标题：${String(current.title || '')}`,
            `高风险字段：${highRiskFields.join('、')}`,
            ...Object.keys(patch).map((key) => `${key} → ${clip(String((patch as Record<string, unknown>)[key]))}`)
          ]
        }, '修改剧本高风险字段')
        if (denied) return denied
      }
      try {
        const updated = await ctx.writeApi.updateNarrativeSeed(ctx.worldId, seedId, {
          ...patch,
          expectedVersion,
          ...(ctx.sourceSessionId ? { sourceSessionId: ctx.sourceSessionId } : {})
        })
        ctx.seeds[currentIndex] = { ...merged, id: seedId, version: updated?.version ?? expectedVersion + 1 }
        ctx.onSeedsChanged?.()
        return { content: `已修改种子「${String(current.title || '')}」。`, status: 'success' }
      } catch (error) {
        const message = (error as Error).message || ''
        return isVersionConflict(error)
          ? runtimeError('修改失败：这条种子已被其他操作改动（版本冲突），请重新确认最新内容后再改。', true)
          : runtimeError(`修改失败：${message}`)
      }
    }
  }
}

function createDeleteNarrativeSeedTool(ctx: ScriptwriterToolContext): ToolDefinition {
  return {
    name: 'deleteNarrativeSeed',
    longRunning: true,
    brief: '按 seedId 删除一条已有种子（写操作，会先弹确认卡，且带删除风险警示）。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { seedId: textSchema('必填。只能使用统一原始可见上下文中已存在的 id。') },
      required: ['seedId']
    },
    execute: async (call) => {
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '删除剧本种子')!
      const seedId = String((call.args as Record<string, unknown>).seedId || '').trim()
      const currentIndex = ctx.seeds.findIndex((seed) => String(seed.id || '') === seedId)
      if (currentIndex < 0) return invalidArgs(`找不到 seedId「${seedId}」，请只引用统一原始可见上下文里已存在的种子。`)
      const current = ctx.seeds[currentIndex]
      if (current.participants === undefined || current.links === undefined) {
        return invalidArgs(`种子「${String(current.title || seedId)}」当前只有精简信息（缺少 participants/links），请先调用 readNarrativeSeedDetail 读取完整详情后再删除。`)
      }
      const expectedVersion = Number(current.version || 0)
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '删除剧本种子',
        lines: [`标题：${String(current.title || '')}`, '删除后不可恢复，请确认这条种子确实不再需要。']
      }, '删除剧本种子')
      if (denied) return denied
      try {
        await ctx.writeApi.deleteNarrativeSeed(ctx.worldId, seedId, expectedVersion)
        ctx.seeds.splice(currentIndex, 1)
        ctx.onSeedsChanged?.()
        return { content: `已删除种子「${String(current.title || '')}」。`, status: 'success' }
      } catch (error) {
        const message = (error as Error).message || ''
        return isVersionConflict(error)
          ? runtimeError('删除失败：这条种子已被其他操作改动（版本冲突），请重新确认最新内容后再删。', true)
          : runtimeError(`删除失败：${message}`)
      }
    }
  }
}

export async function runScriptwriterAgent(input: RunScriptwriterAgentInput): Promise<RunScriptwriterAgentResult> {
  const contextBlock = String(input.contextBlock || '').trim()
  if (!contextBlock) throw new Error('编剧统一原始可见上下文为空，已拒绝启动')
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'scriptwriter.workspace' })
  // 本轮内部可变快照：写成功后原地更新 id/version，支持同一轮内连续操作引用最新版本（不依赖调用方重新拉取）。
  const seeds = input.seeds.map((seed) => ({ ...seed }))
  const ctx: ScriptwriterToolContext = {
    worldId: input.worldId,
    seeds,
    confirmWrite: input.confirmWrite,
    writeApi: input.writeApi,
    sourceSessionId: input.sourceSessionId,
    onSeedsChanged: input.onSeedsChanged,
    fetchSeedDetail: input.fetchSeedDetail
  }
  const tools: ToolDefinition[] = [
    createCreateNarrativeSeedTool(ctx),
    createUpdateNarrativeSeedTool(ctx),
    createDeleteNarrativeSeedTool(ctx),
    createReadNarrativeSeedDetailTool(ctx)
  ]
  const systemContent = [
    '你是世界剧本叙事种子管理 Agent（编剧），只负责当前世界的叙事种子。世界级种子是唯一剧情因果真值，不写 arc、章节路线或 nextBeat。',
    '你既可以只读回答用户关于当前世界种子的问题（不调用任何写工具，直接给出分析和回复），也可以在用户明确要求增删改时调用对应工具。用户没有要求修改时，绝不能为了"完成任务"而擅自调用写工具，也不能编造已发生事实。',
    '更新/删除只能引用统一原始可见上下文里已存在的 seedId；新建只在现有种子无法承载新因果时使用。',
    '不得把计划当已发生事实；没有证据不要擅自把 status 设为 triggered/resolved。关系只使用 depends_on/conflicts_with/caused_by/transforms_into/replaces。',
    '严格使用"大地点/中地点/小地点"三段格式书写 locationText。mapFeatureId 没有精确核实的地图要素时填空字符串。participants/links 没有内容时显式填 []。',
    '当世界的种子数量较多时，统一原始可见上下文里的部分种子可能只提供精简信息（标题等基础字段，缺少 participants/links）；如果你要修改或删除的种子缺少这些字段，必须先调用 readNarrativeSeedDetail 读取完整详情，再继续操作。',
    skillAssembly.layers['0']
  ].filter(Boolean).join('\n\n')

  const historyMessages = input.history ?? []
  const messages: AgentRuntimeMessage[] = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((message): AgentRuntimeMessage => ({ role: message.role, content: message.content })),
    {
      role: 'user',
      content: `【统一原始可见上下文】\n${contextBlock}\n\n【用户输入】\n${input.userText}`
    }
  ]

  return runWorkspaceAgentRuntime({
    profileId: 'scriptwriter.workspace',
    skillAssembly,
    agentName: SCRIPTWRITER_AGENT_NAME,
    gateId: 'scriptwriter-continuation-gate',
    nudgeActionHint: '核对/确认/修改',
    messages,
    tools,
    callOrchestrator: input.callOrchestrator,
    signal: input.signal,
    ...(input.sourceSessionId
      ? { subagentControl: createSessionSubagentControlCapability(input.sourceSessionId) }
      : {}),
    onProgress: input.onProgress,
    initialTaskTodo: input.initialTaskTodo,
    initialDeferredActiveTools: input.initialDeferredActiveTools,
    onDeferredActiveToolsChange: input.onDeferredActiveToolsChange,
    onTaskTodoChange: input.onTaskTodoChange,
    turnStream: input.turnStream,
    budget: input.budget
  })
}
