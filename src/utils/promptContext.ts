import { API } from '../config/api'
import { fetchEventStackToday } from '../repositories/metaRepository'

export const CHAT_HISTORY_PLACEHOLDER = '{chat_history}'
export const CURRENT_USER_NAME_PLACEHOLDER = '{current_user_name}'
export const CURRENT_USER_INPUT_PLACEHOLDER = '{current_user_input}'
export const TASK_SYSTEM_CONTEXT_PLACEHOLDER = '{task_system_context}'
export const EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER = '{event_stack_recent_context}'
export const CHARACTER_BRAIN_RECALL_PLACEHOLDER = '{character_brain_recall}'
export const CHARACTER_PROFILE_RECALL_PLACEHOLDER = '{character_profile_recall}'
export const CHARACTER_GENERAL_RECALL_PLACEHOLDER = '{character_general_recall}'
export const CHARACTER_ARRANGEMENT_RECALL_PLACEHOLDER = '{character_arrangement_recall}'
export const CHARACTER_EXPRESSION_RECALL_PLACEHOLDER = '{character_expression_recall}'
export const CURRENT_STATUS_PROMPT_TEMPLATE = '当前时间：{time}\n{location}\n{weather}'

export const DEFAULT_CURRENT_USER_INPUT_TEMPLATE = [
  '【本轮用户输入｜最高优先级】',
  `说话人：${CURRENT_USER_NAME_PLACEHOLDER}`,
  '原文：',
  CURRENT_USER_INPUT_PLACEHOLDER
].join('\n')

type PromptMessageLite = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function buildCurrentUserInputBlock(rawText: unknown, speakerName: unknown = '用户'): string {
  return renderCurrentUserInputTemplate(DEFAULT_CURRENT_USER_INPUT_TEMPLATE, rawText, speakerName)
}

export function renderCurrentUserInputTemplate(template: unknown, rawText: unknown, speakerName: unknown = '用户'): string {
  const text = String(rawText || '').trim()
  if (!text) return ''
  const safeSpeakerName = String(speakerName || '').trim() || '用户'
  const source = String(template || '').trim() || DEFAULT_CURRENT_USER_INPUT_TEMPLATE
  return source
    .split(CURRENT_USER_NAME_PLACEHOLDER).join(safeSpeakerName)
    .split(CURRENT_USER_INPUT_PLACEHOLDER).join(text)
    .trim()
}

export function buildCurrentUserInputPromptMessage(rawText: unknown, speakerName: unknown = '用户'): PromptMessageLite | null {
  const content = buildCurrentUserInputBlock(rawText, speakerName)
  return content ? { role: 'user', content } : null
}

type TimerMarkLike = {
  id?: string
  type?: string
  note?: string
  time?: number
  createdAt?: string
  isStart?: boolean
  tagId?: string
}

type TimerStateLike = {
  isRunning?: boolean
  startTime?: number | null
  accumulatedTime?: number
  marks?: TimerMarkLike[]
}

type TaskLike = {
  id?: string
  title?: string
  type?: string
  status?: string
  pointsReward?: number
  points_reward?: number
  expReward?: number
  exp_reward?: number
  deadline?: string
  description?: string
  assignerName?: string
  assigner_name?: string
  publishNote?: string
  publish_note?: string
  completionNote?: string
  completion_note?: string
  category?: string
  orderIndex?: number
  order_index?: number
  createdAt?: number | string
  created_at?: string
  timerState?: TimerStateLike | string
  timer_state?: TimerStateLike | string
}

type EventStackItemLike = {
  id?: string
  date?: string
  taskId?: string
  taskName?: string
  taskType?: string
  status?: string
  expReward?: number
  durationSeconds?: number
  timeAxis?: string
  notes?: string
  ticketsUsed?: Record<string, number>
  ticketsExchanged?: Record<string, number>
  pointsDelta?: number
  moneyDelta?: number
  timeBlocks?: string | Record<string, unknown> | Array<unknown>
  realLocation?: string
  realWeather?: string
  realTime?: string
  timelineJson?: Array<{ label?: string; time?: number; isStart?: boolean; note?: string; color?: string }>
  createdAt?: string
}

type RecentEventStackDayResult = {
  events?: EventStackItemLike[]
  summary?: {
    totalPoints?: number
    totalMoney?: number
    ticketChanges?: Record<string, { used?: number; exchanged?: number }>
  }
  date?: string
  error?: string
}

function formatDuration(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatSignedNumber(value: unknown, suffix = ''): string {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return `0${suffix}`
  return `${num > 0 ? '+' : ''}${num}${suffix}`
}

function toLocalDateKey(input: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())}`
}

function shiftDate(base: Date, offsetDays: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + offsetDays)
  return next
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeTimerState(task: TaskLike): TimerStateLike {
  const raw = task.timerState ?? task.timer_state
  const state = safeJsonParse<TimerStateLike>(raw, typeof raw === 'object' && raw ? raw as TimerStateLike : {})
  return {
    isRunning: Boolean(state?.isRunning),
    startTime: typeof state?.startTime === 'number' ? state.startTime : null,
    accumulatedTime: Number(state?.accumulatedTime || 0),
    marks: Array.isArray(state?.marks) ? state.marks : []
  }
}

function formatTaskTimeline(marks: TimerMarkLike[]): string {
  if (!marks.length) return '无时间轴记录'
  return marks
    .map((mark, index) => {
      const time = Number(mark?.time || 0)
      const parts = [
        `${index + 1}. ${mark?.type || '未命名标签'}`,
        `时间=${formatDuration(time)}`,
        mark?.isStart ? '节点=开始' : '节点=结束',
        mark?.note ? `备注=${String(mark.note).trim()}` : '',
        mark?.tagId ? `标签ID=${String(mark.tagId).trim()}` : '',
        mark?.createdAt ? `记录时间=${String(mark.createdAt).trim()}` : ''
      ].filter(Boolean)
      return parts.join(' | ')
    })
    .join('\n')
}

function formatTaskDetails(task: TaskLike, index: number): string {
  const timerState = normalizeTimerState(task)
  const elapsedMs = Number(timerState.accumulatedTime || 0)
  const marks = Array.isArray(timerState.marks) ? timerState.marks : []
  return [
    `任务 ${index + 1}`,
    `ID：${String(task.id || '') || '无'}`,
    `标题：${String(task.title || '') || '未命名任务'}`,
    `类型：${String(task.type || '') || '未设置'}`,
    `状态：${String(task.status || '') || '未设置'}`,
    `分类：${String(task.category || '') || '未分类'}`,
    `奖励点数：${Number(task.pointsReward ?? task.points_reward ?? 0)}`,
    `奖励经验：${Number(task.expReward ?? task.exp_reward ?? 0)}`,
    `截止时间：${String(task.deadline || '') || '无'}`,
    `发布人：${String(task.assignerName ?? task.assigner_name ?? '') || '无'}`,
    `发布时间：${String(task.createdAt ?? task.created_at ?? '') || '无'}`,
    `发布备注：${String(task.publishNote ?? task.publish_note ?? '') || '无'}`,
    `完成备注：${String(task.completionNote ?? task.completion_note ?? '') || '无'}`,
    `任务描述：${String(task.description || '') || '无'}`,
    `计时状态：${timerState.isRunning ? '进行中' : '已暂停或未开始'}`,
    `累计时长：${formatDuration(elapsedMs)}`,
    `时间轴记录数：${marks.length}`,
    '时间轴详情：',
    formatTaskTimeline(marks)
  ].join('\n')
}

function isTaskVisibleForAiContext(task: TaskLike): boolean {
  const status = String(task.status || '').trim().toLowerCase()
  return status === '' || status === 'active' || status === 'pending'
}

async function fetchTaskSystemContext(): Promise<string> {
  const response = await fetch(API.TASKS)
  if (!response.ok) {
    throw new Error('读取任务系统信息失败')
  }
  const tasks = await response.json() as TaskLike[]
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return '任务系统信息：当前没有任务。'
  }

  const visibleTasks = tasks.filter(isTaskVisibleForAiContext)
  if (visibleTasks.length === 0) {
    return '任务系统信息：当前没有进行中的任务。'
  }

  const sortedTasks = [...visibleTasks].sort((a, b) => {
    const orderA = Number(a.orderIndex ?? a.order_index ?? 0)
    const orderB = Number(b.orderIndex ?? b.order_index ?? 0)
    if (orderA !== orderB) return orderA - orderB
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
  })

  return [
    `任务系统信息：共 ${sortedTasks.length} 个任务。`,
    ...sortedTasks.map((task, index) => formatTaskDetails(task, index))
  ].join('\n\n')
}

function formatEventTimeline(
  timelineJson: EventStackItemLike['timelineJson']
): string {
  if (!Array.isArray(timelineJson) || timelineJson.length === 0) return '无时间轴记录'
  return timelineJson
    .map((item, index) => {
      const parts = [
        `${index + 1}. ${String(item?.label || '未命名节点')}`,
        `时间=${formatDuration(Number(item?.time || 0))}`,
        item?.isStart ? '节点=开始' : '节点=过程或结束',
        item?.note ? `备注=${String(item.note).trim()}` : '',
        item?.color ? `颜色=${String(item.color).trim()}` : ''
      ].filter(Boolean)
      return parts.join(' | ')
    })
    .join('\n')
}

function formatEventItem(event: EventStackItemLike, index: number): string {
  return [
    `记录 ${index + 1}`,
    `ID：${String(event.id || '') || '无'}`,
    `日期：${String(event.date || '') || '无'}`,
    `关联任务ID：${String(event.taskId || '') || '无'}`,
    `名称：${String(event.taskName || '') || '未命名记录'}`,
    `类型：${String(event.taskType || '') || '未设置'}`,
    `状态：${String(event.status || '') || '无'}`,
    `经验变化：${Number(event.expReward || 0)}`,
    `耗时：${formatDuration(Number(event.durationSeconds || 0) * 1000)}`,
    `点数变化：${formatSignedNumber(event.pointsDelta, '点')}`,
    `金钱变化：${formatSignedNumber(event.moneyDelta, '元')}`,
    `时间块：${event.timeBlocks ? (typeof event.timeBlocks === 'string' ? event.timeBlocks : JSON.stringify(event.timeBlocks)) : '无'}`,
    `真实时间：${String(event.realTime || '') || '无'}`,
    `真实地点：${String(event.realLocation || '') || '无'}`,
    `真实天气：${String(event.realWeather || '') || '无'}`,
    `备注：${String(event.notes || '') || '无'}`,
    `文字时间轴：${String(event.timeAxis || '') || '无'}`,
    '结构化时间轴：',
    formatEventTimeline(event.timelineJson)
  ].join('\n')
}

type TicketChangeSummary = Record<string, { used?: number; exchanged?: number }>

function hasRecordMap(record: Record<string, number> | undefined): boolean {
  return Boolean(record && typeof record === 'object' && Object.keys(record).length > 0)
}

function hasTicketChangeSummary(summary: TicketChangeSummary | undefined): boolean {
  if (!summary || typeof summary !== 'object') return false
  return Object.values(summary).some((change) => Number(change?.used || 0) > 0 || Number(change?.exchanged || 0) > 0)
}

function mergeTicketRecord(
  target: TicketChangeSummary,
  record: Record<string, number> | undefined,
  key: 'used' | 'exchanged'
) {
  if (!record || typeof record !== 'object') return
  Object.entries(record).forEach(([name, count]) => {
    const amount = Number(count || 0)
    if (!Number.isFinite(amount) || amount <= 0) return
    if (!target[name]) target[name] = { used: 0, exchanged: 0 }
    target[name][key] = Number(target[name][key] || 0) + amount
  })
}

function buildTicketChangesFromEvents(events: EventStackItemLike[]): TicketChangeSummary {
  const ticketChanges: TicketChangeSummary = {}
  events.forEach((event) => {
    mergeTicketRecord(ticketChanges, event.ticketsUsed, 'used')
    mergeTicketRecord(ticketChanges, event.ticketsExchanged, 'exchanged')
  })
  return ticketChanges
}

function formatTicketChangeList(
  ticketChanges: TicketChangeSummary,
  key: 'used' | 'exchanged'
): string {
  const entries = Object.entries(ticketChanges)
    .map(([name, change]) => [name, Number(change?.[key] || 0)] as const)
    .filter(([, count]) => count > 0)
  if (entries.length === 0) return '无'
  return entries.map(([name, count]) => `${name}=${count}张`).join('，')
}

function formatTicketChangeSummary(date: string, ticketChanges: TicketChangeSummary): string {
  if (!hasTicketChangeSummary(ticketChanges)) return `票据记录：日期=${date}；兑换：无；使用：无`
  return [
    `票据记录：日期=${date}`,
    `兑换：${formatTicketChangeList(ticketChanges, 'exchanged')}`,
    `使用：${formatTicketChangeList(ticketChanges, 'used')}`
  ].join('；')
}

function isTicketOnlyResourceEvent(event: EventStackItemLike): boolean {
  return String(event.taskType || '') === 'resource'
    && (hasRecordMap(event.ticketsUsed) || hasRecordMap(event.ticketsExchanged))
    && !event.timeBlocks
}

function formatDayLabel(index: number, date: string): string {
  if (index === 0) return `今天（${date}）`
  if (index === 1) return `昨天（${date}）`
  if (index === 2) return `前天（${date}）`
  return date
}

function formatContextError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]+/g, '').trim().slice(0, 120) || '未知错误'
}

async function fetchRecentEventStackContext(): Promise<string> {
  const baseDate = new Date()
  const dateKeys = [0, -1, -2].map((offset) => toLocalDateKey(shiftDate(baseDate, offset)))
  const results = await Promise.all(dateKeys.map(async (date) => {
    try {
      return await fetchEventStackToday(date) as RecentEventStackDayResult
    } catch (error) {
      return { date, error: formatContextError(error) } satisfies RecentEventStackDayResult
    }
  }))

  const lines = ['事栈信息：包含今天、昨天、前天的全部记录。']
  results.forEach((result, index) => {
    const date = String(result?.date || dateKeys[index])
    if (result?.error) {
      lines.push([
        formatDayLabel(index, date),
        `这一天的事栈读取失败：${result.error}`
      ].join('\n'))
      return
    }
    const events = Array.isArray(result?.events) ? result.events : []
    const summary = result?.summary || {}
    const ticketChanges = hasTicketChangeSummary(summary.ticketChanges)
      ? summary.ticketChanges as TicketChangeSummary
      : buildTicketChangesFromEvents(events)
    const visibleEvents = events.filter((event) => !isTicketOnlyResourceEvent(event))

    lines.push([
      formatDayLabel(index, date),
      `总记录数：${events.length}`,
      `点数合计：${formatSignedNumber(summary.totalPoints, '点')}`,
      `金钱合计：${formatSignedNumber(summary.totalMoney, '元')}`,
      formatTicketChangeSummary(date, ticketChanges),
      ...(visibleEvents.length
        ? visibleEvents.map((event, eventIndex) => formatEventItem(event, eventIndex))
        : hasTicketChangeSummary(ticketChanges)
          ? ['除票据汇总外，这一天没有其他事栈记录。']
        : ['这一天没有事栈记录。'])
    ].join('\n'))
  })
  return lines.join('\n\n')
}

async function buildDynamicContextMap(promptMessages: PromptMessageLite[]): Promise<Record<string, string>> {
  const systemContents = promptMessages
    .filter((item) => item.role === 'system')
    .map((item) => String(item.content || ''))
  const needsTaskContext = systemContents.some((content) => content.includes(TASK_SYSTEM_CONTEXT_PLACEHOLDER))
  const needsEventStackContext = systemContents.some((content) => content.includes(EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER))

  const [taskContext, eventStackContext] = await Promise.all([
    needsTaskContext
      ? fetchTaskSystemContext().catch((error) => `任务系统信息读取失败：${error instanceof Error ? error.message : String(error)}`)
      : Promise.resolve(''),
    needsEventStackContext
      ? fetchRecentEventStackContext().catch((error) => `事栈信息读取失败：${error instanceof Error ? error.message : String(error)}`)
      : Promise.resolve('')
  ])

  return {
    [TASK_SYSTEM_CONTEXT_PLACEHOLDER]: taskContext,
    [EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER]: eventStackContext
  }
}

export async function resolveDynamicPromptMessages(promptMessages: PromptMessageLite[]): Promise<PromptMessageLite[]> {
  const contextMap = await buildDynamicContextMap(promptMessages)
  const result: PromptMessageLite[] = []

  for (const item of promptMessages) {
    const content = String(item.content || '').trim()
    const resolvedContent = content
      .split(TASK_SYSTEM_CONTEXT_PLACEHOLDER).join(String(contextMap[TASK_SYSTEM_CONTEXT_PLACEHOLDER] || '').trim())
      .split(EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER).join(String(contextMap[EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER] || '').trim())
      .trim()
    if (content.includes(TASK_SYSTEM_CONTEXT_PLACEHOLDER) || content.includes(EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER)) {
      if (resolvedContent) result.push({ ...item, content: resolvedContent })
      continue
    }
    result.push(item)
  }

  return result
}
