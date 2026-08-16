/**
 * subagent 运行状态（2026-07-07 范式优化批次3·由编剧专属 scriptwriterRunStatus 泛化而来，旧模块已退役不留 wrapper）。
 *
 * 语义：纯内存响应式（不落任何存储·刷新即清）——反映「本次应用运行里某 subagent 模型调用」的实况，
 * 按 `(sessionId, subagentId)` 键控（编剧 id 见 narrativeScriptwriterSubagent）：
 * - 埋点在 `runSubagentLoop`（subagentLoop.ts·架构审查 P2 批 E1 薄骨架）：发起前 begin、收尾（成功/失败/异常
 *   都会走到）后 end——新 subagent 走 runSubagentLoop(spec) 即自动获得状态实况，无需自己手抄埋点。
 * - 消费方（编剧）：提调带「剧本」入口的运行中脉冲点与活秒表
 *   + 决策流 sticky 编剧卡（input/output 即内部信息流真值）。
 * - 秒表：模块级 ticker 只在有运行中的 subagent 时跳（500ms 自增 subagentRunTick），组件依赖它重算 elapsed。
 * - 状态只覆盖模型调用段（解析失败仍显 done——失败详情走工具回执层5，不在此重复建口径）。
 * 联动能力：状态口径若改（如加「解析失败」态），带「剧本」入口、面板状态条、决策流编剧卡三处同步。
 */

import { ref } from 'vue'

const MAX_ERROR_TEXT = 200
/** 内部信息流单侧文本上限（纯内存·防超长 prompt 撑爆；编剧入参含整本剧本+brief，通常几 KB）。 */
const MAX_IO_TEXT = 20000
/** 状态条目上限（纯内存·防长会话堆积，超出淘汰最早开始的）。 */
const MAX_ENTRIES = 50

/** 缓存可见性（2026-07-07）：与 subagentSpec.SubagentModelUsage 结构相同但故意不共享 import
 *  （两模块都明确「不依赖外层」的边界铁律，鸭子类型足够）。 */
export interface SubagentRunUsage {
  promptTokens: number
  completionTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

/** 共享运行条所需的最小自描述元数据。业务宿主不再按子 Agent 名手写第二份展示表。 */
export interface SubagentRunPresentation {
  label: string
  icon: string
  runningVerb: string
  title: string
}

/** 工作流时间线条目（批G·2026-07-12）：运行卡展开态的「第N轮/工具调用」流水。
 *  kind='turn' 是轮次分隔（label=「第 N 轮」）；kind='tool' 是一次工具调用（label=工具名，
 *  detail=参数摘要≤120字，status 缺省=运行中/未定，'success'/'error'=已定）。
 *  durationMs（批I·性能瓶颈定位）：工具行=settle 时按 at 差值回填；轮行=下一个轮标记追加时或
 *  endSubagentRun 时回填该轮总时长；未落定缺省不显示。
 *  联动：形状与 xingyiTurnStreamState 的条目（星依浮坞自己的轮流水）同构，改形状两处同步。 */
export interface SubagentRunTimelineEntry {
  kind: 'turn' | 'tool'
  label: string
  detail?: string
  status?: 'success' | 'error'
  at: number
  durationMs?: number
}

/** 时间线封顶：只保留最近 80 条（防长 loop 内存膨胀；超出淘汰最早的）。 */
const MAX_TIMELINE_ENTRIES = 80

export interface SubagentRunStatus {
  state: 'running' | 'done' | 'error' | 'cancelled'
  /** 本次运行开始时刻（Date.now）。 */
  startedAt: number
  /** 结束时刻（running 时缺省）。 */
  endedAt?: number
  /** 本次运行耗时（running 时缺省）。 */
  durationMs?: number
  /** 失败原因（error 时才有·钳制长度）。 */
  error?: string
  /** 交给 subagent 的原文（user 消息全文·「内部信息流」入侧·钳制长度）。 */
  input?: string
  /** subagent 原始返回（「内部信息流」出侧·成功才有·钳制长度）。 */
  output?: string
  /** 本次运行消耗的 token（含结构化调用重试的累加值·running 时缺省）。 */
  usage?: SubagentRunUsage
  /** 工作流时间线（批G）：loop 运行中实时追加、结束后保留供回看；封顶最近 80 条。 */
  timeline?: SubagentRunTimelineEntry[]
  /** 由 runner 在 begin 时写入；结束后原样保留，供任意同会话 Agent 宿主复用统一运行条。 */
  presentation?: SubagentRunPresentation
}

/** key = `${sessionId}::${subagentId}`。整体替换写入保证响应式。 */
const statusMap = ref<Record<string, SubagentRunStatus>>({})

function statusKey(sessionId: string, subagentId: string): string {
  return `${sessionId}::${subagentId}`
}

/** 活秒表：有 subagent 运行中时每 500ms 自增；组件 computed 依赖它即可让「已运行 Ns」持续走动。 */
export const subagentRunTick = ref(0)
let tickTimer: ReturnType<typeof setInterval> | null = null

function hasRunning(): boolean {
  return Object.values(statusMap.value).some((entry) => entry.state === 'running')
}

function syncTicker(): void {
  if (hasRunning()) {
    if (!tickTimer) tickTimer = setInterval(() => { subagentRunTick.value += 1 }, 500)
  } else if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function trimEntries(map: Record<string, SubagentRunStatus>): Record<string, SubagentRunStatus> {
  const keys = Object.keys(map)
  if (keys.length <= MAX_ENTRIES) return map
  const sorted = keys.sort((a, b) => (map[a].startedAt - map[b].startedAt))
  for (const key of sorted.slice(0, keys.length - MAX_ENTRIES)) delete map[key]
  return map
}

/** 内部信息流文本归一：保留换行（展开区 pre-wrap 原样显示），只裁长度。 */
function clampIoText(value: unknown): string {
  return String(value ?? '').trim().slice(0, MAX_IO_TEXT)
}

/** subagent 调用发起（runSubagent 统一埋点）；input=交给 subagent 的原文（内部信息流入侧）。 */
export function beginSubagentRun(
  sessionId: string,
  subagentId: string,
  extras?: { input?: string; presentation?: SubagentRunPresentation }
): void {
  const sid = String(sessionId || '').trim()
  const aid = String(subagentId || '').trim()
  if (!sid || !aid) return
  const input = clampIoText(extras?.input)
  statusMap.value = trimEntries({
    ...statusMap.value,
    [statusKey(sid, aid)]: {
      state: 'running',
      startedAt: Date.now(),
      ...(input ? { input } : {}),
      ...(extras?.presentation ? { presentation: { ...extras.presentation } } : {})
    }
  })
  syncTicker()
}

/** 回填最近一条「未落定」轮行的耗时（批I）：新轮标记追加或 loop 结束时调用，durationMs=now-at。
 *  纯就地辅助——在调用方持有的 timeline 副本上改，不负责写回 statusMap。 */
function backfillOpenTurnDuration(timeline: SubagentRunTimelineEntry[], now: number): void {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index]
    if (item.kind === 'turn') {
      if (item.durationMs === undefined) timeline[index] = { ...item, durationMs: Math.max(0, now - item.at) }
      return
    }
  }
}

/** 追加一条工作流时间线条目（批G·subagentLoop 的 onProgress 映射调用）：at 由本函数补打；
 *  超过封顶（80 条）淘汰最早的；未 begin（无状态条目）时 no-op。整体替换写入保证响应式。
 *  批I：追加新轮标记（kind='turn'）时顺带回填上一轮行的总时长。 */
export function appendSubagentRunTimeline(
  sessionId: string,
  subagentId: string,
  entry: Omit<SubagentRunTimelineEntry, 'at'>
): void {
  const key = statusKey(String(sessionId || '').trim(), String(subagentId || '').trim())
  const current = statusMap.value[key]
  if (!current) return
  const now = Date.now()
  const timeline = [...(current.timeline || [])]
  if (entry.kind === 'turn') backfillOpenTurnDuration(timeline, now)
  timeline.push({ ...entry, at: now })
  if (timeline.length > MAX_TIMELINE_ENTRIES) timeline.splice(0, timeline.length - MAX_TIMELINE_ENTRIES)
  statusMap.value = { ...statusMap.value, [key]: { ...current, timeline } }
}

/** 把「最近一条同名且未定态」的工具条目落定为 success/error（工具一行 running→done/error，
 *  与提调坞工具条同形式），并按 at 差值回填该行耗时（批I）；找不到（如已被封顶淘汰）则退化为
 *  追加一条已定态条目（无起点可算、不带耗时），保证结果不丢。 */
export function settleSubagentRunTimelineTool(
  sessionId: string,
  subagentId: string,
  toolName: string,
  status: 'success' | 'error'
): void {
  const key = statusKey(String(sessionId || '').trim(), String(subagentId || '').trim())
  const current = statusMap.value[key]
  if (!current) return
  const timeline = [...(current.timeline || [])]
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index]
    if (item.kind === 'tool' && item.label === toolName && !item.status) {
      timeline[index] = { ...item, status, durationMs: Math.max(0, Date.now() - item.at) }
      statusMap.value = { ...statusMap.value, [key]: { ...current, timeline } }
      return
    }
  }
  appendSubagentRunTimeline(sessionId, subagentId, { kind: 'tool', label: toolName, status })
}

/** subagent 调用结束（成功/失败都要调，否则秒表停不下来）；output=原始返回（内部信息流出侧）。 */
export function endSubagentRun(
  sessionId: string,
  subagentId: string,
  result: { ok: boolean; cancelled?: boolean; error?: string; output?: string; usage?: SubagentRunUsage }
): void {
  const key = statusKey(String(sessionId || '').trim(), String(subagentId || '').trim())
  const current = statusMap.value[key]
  if (!current) return
  const endedAt = Date.now()
  const errorText = String(result.error || '').replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_TEXT)
  const output = clampIoText(result.output)
  // 批G：工作流时间线随 end 保留（结束后运行卡展开仍可回看）；批I：末轮行的总时长在此回填。
  const timeline = current.timeline?.length ? [...current.timeline] : null
  if (timeline) backfillOpenTurnDuration(timeline, endedAt)
  statusMap.value = {
    ...statusMap.value,
    [key]: {
      state: result.ok ? 'done' : result.cancelled ? 'cancelled' : 'error',
      startedAt: current.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - current.startedAt),
      ...(current.input ? { input: current.input } : {}),
      ...(output ? { output } : {}),
      ...(result.ok || !errorText ? {} : { error: errorText }),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(timeline ? { timeline } : {}),
      ...(current.presentation ? { presentation: { ...current.presentation } } : {})
    }
  }
  syncTicker()
}

/** 读某会话某 subagent 的运行状态（组件 computed 里调用即响应式；无记录返回 null）。 */
export function getSubagentRunStatus(sessionId: string, subagentId: string): SubagentRunStatus | null {
  const sid = String(sessionId || '').trim()
  const aid = String(subagentId || '').trim()
  return (sid && aid && statusMap.value[statusKey(sid, aid)]) || null
}

/** 列某会话某前缀的全部运行状态（采风并行多卡：subagentId=`caifeng:<n>` 按 `caifeng:` 前缀取·按开始时刻升序）。
 *  组件 computed 里调用即响应式；prefix 需带分隔冒号语义（如 'caifeng:'），防误匹配同名开头的其他 subagent。 */
export function listSubagentRunStatuses(
  sessionId: string,
  subagentIdPrefix: string
): Array<{ subagentId: string; status: SubagentRunStatus }> {
  const sid = String(sessionId || '').trim()
  const prefix = String(subagentIdPrefix || '').trim()
  if (!sid || !prefix) return []
  const keyPrefix = `${sid}::${prefix}`
  return Object.entries(statusMap.value)
    .filter(([key]) => key.startsWith(keyPrefix))
    .map(([key, status]) => ({ subagentId: key.slice(sid.length + 2), status }))
    .sort((a, b) => a.status.startedAt - b.status.startedAt)
}

/** 列出一个会话内全部子 Agent 运行状态。工作区共享对话壳用它自动渲染自描述运行条。 */
export function listAllSubagentRunStatuses(
  sessionId: string
): Array<{ subagentId: string; status: SubagentRunStatus }> {
  const sid = String(sessionId || '').trim()
  if (!sid) return []
  const keyPrefix = `${sid}::`
  return Object.entries(statusMap.value)
    .filter(([key]) => key.startsWith(keyPrefix))
    .map(([key, status]) => ({ subagentId: key.slice(keyPrefix.length), status }))
    .sort((a, b) => a.status.startedAt - b.status.startedAt)
}

/** 耗时人话化：<100ms 显示 '<0.1s'（毫秒级工具真实存在，不再显示成疑似坏了的 '0.0s'）；
 *  60s 内一位小数，超过用 m+s。 */
export function formatSubagentRunDuration(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 100) return '<0.1s'
  const seconds = clamped / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}

/** 测试专用：清空状态与秒表。 */
export function resetSubagentRunStatusForTest(): void {
  statusMap.value = {}
  subagentRunTick.value = 0
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}
