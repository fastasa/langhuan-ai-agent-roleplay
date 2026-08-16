// 统一 state 协议 · 检索兜底工具（R3-4 · event sourcing 三件套之③「retrieval 检索」）。
//
// 定位：
// 压缩投影（R3-3）把更早内容折叠出了喂模型的视图，但原始事件仍保真在 append log（R3-2/R3-2b）。
// 本工具让提调能按关键词把折叠出去的历史事件/更早消息/工具结果**搜回**——直接根治 P10「回忆失败」里的
// (a) 呈现层不暴露可检索性 + (b) 检索语义不清：投影标注「可检索」，提调用本工具搜回确实在库的历史。
//
// 自包含（用户约定·新工具自包含模块）：本模块只依赖 appendLog 的 searchAppendLog/renderAppendLogEvent +
// toolRegistry 类型，不反向耦合任何 harness；groupDirectorHarness / 纠偏 loop 各一行 register 即可接入。
// 与现役读工具的边界：readChatMessage 读「会话原文楼层」、readMessageProjection 读「某楼投影事实」、
// 取料三件套查「知识库/角色大脑」；本工具只搜「提调自己这条带的运行记忆」（决策/工具结果/报错/消息），互不重叠。

import type { ToolDefinition } from '../agentRuntime/toolRegistry'
import { renderAppendLogEvent, searchAppendLog } from './appendLog'
import type { AppendLogEventType } from './appendLogTypes'

/** 工具机器名（注册 + 编排带工具条标签对齐用）。 */
export const SEARCH_APPEND_LOG_TOOL_NAME = 'searchDirectorMemory'

const VALID_EVENT_TYPES: AppendLogEventType[] = ['message', 'toolCall', 'toolResult', 'error', 'decision']
const VALID_TYPE_SET = new Set<AppendLogEventType>(VALID_EVENT_TYPES)

/** 批次I（2026-07-04·rg 式精读）：单条命中渲染超过此长度即切「命中行±N 行窗口」，不再整条全文回喂。 */
const HIT_FULLTEXT_LIMIT = 400
/** 命中行上下各带几行（rg -C 语义）。 */
const HIT_CONTEXT_LINES = 2
/** 一次调用最多接受的关键词个数（多关键词 2026-07-08）。
 *  联动：与 tidiaoRetrievalTools.ts 的 normalizeRetrievalQueries 同语义（本模块按约定自包含，不引那边）；
 *  归一化口径若要改，两处要同步。 */
const MAX_QUERIES = 8

/** 归一化多关键词入参：合并 query + queries、去空白、按小写去重、截断到上限（联动见 MAX_QUERIES 注释）。 */
function normalizeQueries(query: unknown, queries: unknown): string[] {
  const raw = [
    String(query ?? '').trim(),
    ...(Array.isArray(queries) ? queries.map((q) => String(q ?? '').trim()) : [])
  ].filter(Boolean)
  const seen = new Set<string>()
  const result: string[] = []
  for (const q of raw) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(q)
    if (result.length >= MAX_QUERIES) break
  }
  return result
}

/**
 * 批次I·rg 式精读窗口：超长事件（如归档进层4 后被折叠的消息原文/提示词原文）不整条回喂，
 * 只返回「首个命中行 ±N 行」的窗口 + 定位标注——精确读某一部分、防搜回结果自身再撑爆 prompt
 * （窗口天然短 → 也不会再被层4 归档机制套娃归档）。query 空/全文不长/找不到命中行时原样返回。
 */
export function renderEventHitWindow(fullLine: string, query: string): string {
  const full = String(fullLine || '')
  const q = String(query || '').trim().toLowerCase()
  if (!q || full.length <= HIT_FULLTEXT_LIMIT) return full
  const lines = full.split('\n')
  if (lines.length <= 1 + HIT_CONTEXT_LINES * 2) return full
  const hitIndexes = lines.reduce<number[]>((acc, line, index) => {
    if (line.toLowerCase().includes(q)) acc.push(index)
    return acc
  }, [])
  if (!hitIndexes.length) return full
  const first = hitIndexes[0]
  const from = Math.max(0, first - HIT_CONTEXT_LINES)
  const to = Math.min(lines.length - 1, first + HIT_CONTEXT_LINES)
  const head = lines[0].startsWith('#') ? `${lines[0].split('〕')[0]}〕` : ''
  const window = lines.slice(Math.max(from, head ? 1 : 0), to + 1).join('\n')
  return [
    `${head}（全文 ${full.length} 字·命中 ${hitIndexes.length} 处·以下为首个命中段 第 ${from + 1}-${to + 1} 行/共 ${lines.length} 行·换关键词可定位其它段）`,
    window
  ].join('\n')
}

/**
 * 创建「检索自身历史记忆」提调工具（R3-4）。
 * - query：单个关键词（人话子串匹配，大小写不敏感）；空 query = 取最近 N 条（按时序回看）。
 * - queries：多关键词（2026-07-08）数组，任一命中即算（OR）。
 * - types：可选，限定事件类型（decision 决策 / toolResult 工具结果 / error 报错 / message 消息 / toolCall 工具调用）。
 * - limit：可选，返回条数上限（默认 20）。
 * 命中事件渲染成人话行喂模型（content）+ 结构化保真进 details.hits（标 searchable，不每轮重喂）。
 */
export function createSearchAppendLogTool(): ToolDefinition {
  return {
    name: SEARCH_APPEND_LOG_TOOL_NAME,
    brief: '检索你自己这条提调带至今的历史记忆——按关键词搜回此前折叠出视图的更早消息、你的决策、工具调用结果或报错。'
      + '当你感觉「之前好像处理过 / 提到过 / 查过这个，但现在视图里看不到」时用它把原始记录搜回，而不是凭空假设或重新来过。'
      + '多个关键词请放 queries 数组（每项一个词，任一命中即算），❌不要用空格拼进同一个 query——那会按整串匹配几乎必然搜空。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '单个关键词或人话片段（子串匹配，大小写不敏感）。留空且不给 queries 则返回最近若干条历史事件。❌多个词不要用空格拼在这里，请改用 queries。' },
        queries: { type: 'array', items: { type: 'string' }, description: '多个关键词（可选，最多 8 项）：每项一个词/短语，任一命中即返回（OR）。搜多个线索时用它一次搜完。' },
        types: {
          type: 'array',
          items: { type: 'string', enum: VALID_EVENT_TYPES },
          description: '可选·限定事件类型：decision=你的决策｜toolResult=工具结果｜error=报错｜message=消息｜toolCall=工具调用。不填=全部。'
        },
        limit: { type: 'number', description: '可选·返回条数上限（默认 20，取最近的）。' }
      }
    },
    // 结构化保真（R3-1）：命中 hits 标 searchable（content 已喂模型、结构化进 log 可再检索、不每轮重喂）。
    fieldLifecycle: { hits: 'searchable' },
    execute: (toolCall) => {
      const keywords = normalizeQueries(toolCall.args.query, toolCall.args.queries)
      const rawTypes = Array.isArray(toolCall.args.types) ? toolCall.args.types : []
      const types = rawTypes
        .map((t) => String(t || '').trim() as AppendLogEventType)
        .filter((t) => VALID_TYPE_SET.has(t))
      const limitNum = Number(toolCall.args.limit)
      const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 50) : 20
      const events = searchAppendLog(keywords, { ...(types.length ? { types } : {}), limit })
      if (!events.length) {
        return {
          content: keywords.length
            ? `没有搜到与「${keywords.join('」「')}」相关的历史记录（这条带至今的记忆里确实没有，请按现有信息处理或换个关键词）。`
            : '这条提调带至今还没有可检索的历史记录。',
          details: { hits: [] }
        }
      }
      // 批次I·rg 式精读：超长命中只回「命中行±2 行窗口」（带定位标注），短命中原样——精确读某一部分、不撑爆 prompt。
      // 2026-07-04 真机修：命中全是自身工具流水（toolCall/toolResult 留痕）时显式标注——真机复现提调把
      // 「搜到自己此前的 fetchUnitDetail 调用记录」误当成资料反复检索空转；提示它这不是世界资料/角色记忆。
      const allSelfOperational = events.every((event) => event.type === 'toolCall' || event.type === 'toolResult')
      const selfOperationalNote = allSelfOperational
        ? '\n（注意：以上命中全是你自己 loop 的操作流水留痕（工具调用/工具结果记录），不是角色记忆或世界资料。要世界正文请直接用 searchWorldText / fetchUnitDetail 重新取，要角色记忆用 recallCharacterBrain，不要继续在这里搜。）'
        : ''
      // 多关键词时每条命中用「自己实际命中的那个词」定位精读窗口（不同事件可能由不同词命中）。
      const pickHitKeyword = (line: string): string => {
        const lower = line.toLowerCase()
        return keywords.find((keyword) => lower.includes(keyword.toLowerCase())) || keywords[0] || ''
      }
      return {
        content: `搜到 ${events.length} 条历史记录：\n${events.map((event) => {
          const line = renderAppendLogEvent(event)
          return renderEventHitWindow(line, pickHitKeyword(line))
        }).join('\n')}${selfOperationalNote}`,
        details: { hits: events }
      }
    }
  }
}
