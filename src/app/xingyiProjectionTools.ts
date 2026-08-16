/**
 * 星依「读/搜对话投影」工具（状态系统取料闭环计划批次1）——自包含只读工具工厂（R1 工厂闭包范式）。
 *
 * 两件套（createXingyiProjectionTools 一把装配，harness 无条件直挂——只读、不需 confirmWrite）：
 * - readChatProjection：读当前打开会话的对话投影全貌（每条消息抽出的【客观事实】：谁对谁做了什么/时间地点变化）。
 *   投影很长时只给最近 N 条 + 高声提示改用搜索精确取，省消耗（用户描述的「投影超额就搜」工作流）。
 * - searchChatProjection：多关键词（queries 数组·任一命中即算·口径同 searchWorldText/recallSemantic）搜投影，
 *   投影长时用它精确取相关片段。搜不到如实说。
 *
 * 真值边界：
 * - 作用域=当前打开的会话（对话级）；会话上下文缺省读 chatSummary 桥（与状态系统/总结对话同一份活动会话真值）。
 * - 数据源=fetchChatPersonalityModelObservationsBySessionId（只读观察投影表·每条带 messageId/speakerName/
 *   objectiveFact/startEnv/endEnv/changed/status）；同一消息多条投影（多次尝试）取最新（后者覆盖=最新，
 *   与 useSessionProjectionBatch 同口径）。本工具只读不写。
 * - 用途=辅助星依整理状态栏/角色/物品/组织/设定（先读投影再落笔）；投影是客观事实摘要，非逐字原文。
 *
 * 三态结果文案范式与 xingyiStatusSystemTools / xingyiFunctionTools 一致（联动标注：统一改时多处同步）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import type { ChatPersonalityModelObservationProjection } from '../repositories/chatRepository'
import { fetchChatPersonalityModelObservationsBySessionId } from '../repositories/chatRepository'
import { createChatMessageReference } from '../../shared/chatMessageReference'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContext,
  type XingyiSessionContextSeam,
  type XingyiSessionResolveOutcome
} from './xingyiSessionContext'

export interface XingyiProjectionToolContext extends XingyiSessionContextSeam {
  /** 投影数据接缝：缺省=观察投影表只读拉取；测试注内存 mock。 */
  fetchProjections?: (sessionId: string) => Promise<ChatPersonalityModelObservationProjection[]>
}

// 读全貌超额阈值：总条数 > READ_TOTAL_THRESHOLD 时只给最近 READ_RECENT_LIMIT 条 + 提示改搜索。
const READ_TOTAL_THRESHOLD = 60
const READ_RECENT_LIMIT = 40
const MAX_QUERIES = 8
const SEARCH_LIMIT_DEFAULT = 20
const SEARCH_LIMIT_MAX = 50

function defaultFetchProjections(sessionId: string): Promise<ChatPersonalityModelObservationProjection[]> {
  return fetchChatPersonalityModelObservationsBySessionId(sessionId).then((page) => page.projections)
}

// ── 三态结果文案（联动标注：与 xingyiStatusSystemTools 同款范式，统一改时多处同步）──

function noActiveSessionResult(): ToolExecutionResult {
  return {
    content: '现在没有打开中的会话。读对话投影是对话级能力：可以先打开要参考的会话，'
      + '或先用 listChatContacts 看会话清单，再给本工具的 session 参数指定要读哪个对话的投影。',
    details: { providerMissing: true }
  }
}

/** 取会话上下文：命中返回 { context }，否则返回 { result }（无活动会话三态 / 指定会话解析失败 error）。 */
async function resolveSessionOrResult(
  ctx: XingyiProjectionToolContext,
  sessionArg: unknown
): Promise<{ context: XingyiSessionContext } | { result: ToolExecutionResult }> {
  const outcome: XingyiSessionResolveOutcome = await resolveXingyiSessionForCall(ctx, sessionArg)
  if ('context' in outcome) return { context: outcome.context }
  if ('error' in outcome) return { result: invalidArgumentResult(outcome.error) }
  return { result: noActiveSessionResult() }
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

// ── 投影渲染 ──

/** 环境对象 → 人话（时间/地点/天气，全空返回空串）。与 tidiaoMessageProjectionTools.renderEnv 同口径。 */
function renderEnv(env: unknown): string {
  if (!env || typeof env !== 'object') return ''
  const e = env as Record<string, unknown>
  const parts: string[] = []
  const time = String(e.time ?? '').trim()
  const location = String(e.location ?? '').trim()
  const weather = String(e.weather ?? '').trim()
  if (time) parts.push(`时间：${time}`)
  if (location) parts.push(`地点：${location}`)
  if (weather) parts.push(`天气：${weather}`)
  return parts.join('，')
}

/** 变化标记 → 人话（只在确有变化时返回，无变化返回空串·不占位）。 */
function renderChanged(changed: unknown): string {
  if (!changed || typeof changed !== 'object') return ''
  const c = changed as Record<string, unknown>
  const flags: string[] = []
  if (c.time) flags.push('时间')
  if (c.location) flags.push('地点')
  return flags.length ? `${flags.join('、')}变化` : ''
}

function speakerLabel(projection: ChatPersonalityModelObservationProjection): string {
  const name = String(projection.speakerName || '').trim()
  if (name) return name
  return String(projection.messageKind || '') === 'narration' ? '旁白' : '角色'
}

function projectionFactText(projection: ChatPersonalityModelObservationProjection): string {
  return String(projection.objectiveFact || '').trim() || String(projection.fallbackCleanText || '').trim()
}

/** 一条投影 → 展示行：`#<messageId> [说话人] 客观事实（结束环境；变化）`。 */
function renderProjectionLine(projection: ChatPersonalityModelObservationProjection, sessionId: string): string {
  const envParts: string[] = []
  const endEnv = renderEnv(projection.endEnv)
  if (endEnv) envParts.push(endEnv)
  const changed = renderChanged(projection.changed)
  if (changed) envParts.push(changed)
  const envText = envParts.length ? `（${envParts.join('；')}）` : ''
  const fact = projectionFactText(projection) || '（该消息尚无投影事实）'
  const reference = createChatMessageReference(sessionId, projection.messageId)
  return `#${reference.messageId} [${speakerLabel(projection)}] ${fact}${envText} ref=${JSON.stringify(reference)}`
}

/** 同一 messageId 多条投影（多次尝试）取最新（观察表按时序返回·后者覆盖=最新）+ 按 messageId 升序。 */
function latestProjectionsSorted(
  projections: ChatPersonalityModelObservationProjection[]
): ChatPersonalityModelObservationProjection[] {
  const byMessageId = new Map<number, ChatPersonalityModelObservationProjection>()
  for (const projection of Array.isArray(projections) ? projections : []) {
    const messageId = Number(projection?.messageId || 0)
    if (messageId > 0) byMessageId.set(messageId, projection)
  }
  return Array.from(byMessageId.values()).sort((a, b) => Number(a.messageId || 0) - Number(b.messageId || 0))
}

/** 关键词读取：合并 queries 数组 + 单 query，去空去重，最多 MAX_QUERIES 个。 */
function readQueries(args: Record<string, unknown>): string[] {
  const list: string[] = []
  if (Array.isArray(args.queries)) list.push(...args.queries.map((item) => String(item ?? '').trim()))
  const single = String(args.query ?? '').trim()
  if (single) list.push(single)
  return Array.from(new Set(list.filter(Boolean))).slice(0, MAX_QUERIES)
}

// ── 两件套工具 ──

/** 读对话投影全貌（只读）：辅助整理状态栏/角色/物品/组织设定前先看已确立的客观事实。 */
export function createReadChatProjectionTool(ctx: XingyiProjectionToolContext): ToolDefinition {
  const fetchProjections = ctx.fetchProjections ?? defaultFetchProjections
  return {
    name: 'readChatProjection',
    brief: '读当前打开会话的「对话投影」（每条消息抽出的客观事实：谁对谁做了什么、时间地点变化）。'
      + '整理状态栏/角色/物品/组织/设定前先读它拿准剧情事实。投影很长时只给最近若干条，'
      + '要看更早或找特定内容改用 searchChatProjection 精确取。缺省读当前打开会话；没打开或要读别的对话时给 session 指定。（只读）',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '要读的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。' }
      }
    },
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      try {
        const sorted = latestProjectionsSorted(await fetchProjections(context.sessionId))
        if (!sorted.length) {
          return {
            content: `会话「${context.sessionTitle}」还没有任何对话投影（可能是新会话，或投影还没生成）。`,
            details: { total: 0 }
          }
        }
        const total = sorted.length
        const overflow = total > READ_TOTAL_THRESHOLD
        const shown = overflow ? sorted.slice(-READ_RECENT_LIMIT) : sorted
        const lines = shown.map((projection) => renderProjectionLine(projection, context.sessionId))
        const header = `会话「${context.sessionTitle}」的对话投影（客观事实·共 ${total} 条${overflow ? `·只列最近 ${shown.length} 条` : ''}）：`
        const notice = overflow
          ? `\n\n（投影较长，上面只给了最近 ${shown.length} 条。要看更早或找特定内容，请用 searchChatProjection 按关键词精确取，省消耗。）`
          : ''
        return {
          content: `${header}\n${lines.join('\n')}${notice}`,
          details: {
            total,
            shown: shown.length,
            overflow,
            references: shown.map((projection) => createChatMessageReference(context.sessionId, projection.messageId))
          }
        }
      } catch (error) {
        return runFailureResult('读取对话投影', error)
      }
    }
  }
}

/** 多关键词搜对话投影（只读）：投影长时精确取相关片段。 */
export function createSearchChatProjectionTool(ctx: XingyiProjectionToolContext): ToolDefinition {
  const fetchProjections = ctx.fetchProjections ?? defaultFetchProjections
  return {
    name: 'searchChatProjection',
    brief: '按关键词搜当前会话的对话投影（客观事实/说话人/时间地点），投影太长时用它精确取相关片段省消耗。'
      + `多个关键词放 queries 数组分项给（任一命中即算，最多 ${MAX_QUERIES} 个），不要用空格拼成一个长串。搜不到就如实说。（只读）`,
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '单个关键词（与 queries 二选一或并用）。' },
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: `多个关键词（任一命中即算，最多 ${MAX_QUERIES} 个）。比单串更好命中，优先用它。`
        },
        limit: { type: 'number', description: `最多返回几条命中（默认 ${SEARCH_LIMIT_DEFAULT}，最多 ${SEARCH_LIMIT_MAX}，取最近的）。` },
        session: { type: 'string', description: '要搜的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。' }
      }
    },
    validateArgs: (args) => (readQueries(args).length ? null : 'searchChatProjection 需要 query 或 queries（至少一个关键词）'),
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      const queries = readQueries(toolCall.args)
      if (!queries.length) return invalidArgumentResult('searchChatProjection 需要 query 或 queries（至少一个关键词）')
      const limitNum = Number(toolCall.args.limit)
      const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), SEARCH_LIMIT_MAX) : SEARCH_LIMIT_DEFAULT
      try {
        const sorted = latestProjectionsSorted(await fetchProjections(context.sessionId))
        const lowered = queries.map((query) => query.toLowerCase())
        const hits = sorted.filter((projection) => {
          const haystack = [
            speakerLabel(projection),
            projectionFactText(projection),
            renderEnv(projection.startEnv),
            renderEnv(projection.endEnv)
          ].join(' ').toLowerCase()
          return lowered.some((query) => haystack.includes(query))
        })
        if (!hits.length) {
          return {
            content: `会话「${context.sessionTitle}」的对话投影里没有搜到关键词「${queries.join('、')}」相关的内容。可以换个说法再搜，或用 readChatProjection 看看全貌。`,
            details: { total: 0 }
          }
        }
        const shown = hits.slice(-limit)
        const lines = shown.map((projection) => renderProjectionLine(projection, context.sessionId))
        const countText = hits.length > shown.length ? `命中 ${hits.length} 条，只列最近 ${shown.length} 条` : `命中 ${hits.length} 条`
        return {
          content: `在会话「${context.sessionTitle}」的对话投影里搜「${queries.join('、')}」（${countText}）：\n${lines.join('\n')}`,
          details: {
            total: hits.length,
            shown: shown.length,
            references: shown.map((projection) => createChatMessageReference(context.sessionId, projection.messageId))
          }
        }
      } catch (error) {
        return runFailureResult('搜索对话投影', error)
      }
    }
  }
}

/** 批次1 读/搜对话投影两件套：harness 一把装配。 */
export function createXingyiProjectionTools(ctx: XingyiProjectionToolContext = {}): ToolDefinition[] {
  return [
    createReadChatProjectionTool(ctx),
    createSearchChatProjectionTool(ctx)
  ]
}
