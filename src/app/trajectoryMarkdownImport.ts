export type TrajectoryMarkdownImportGranularity = 'multiYear' | 'year' | 'month' | 'day'
export type TrajectoryMarkdownImportDayTarget = 'overview' | 'event' | 'arrangement'

export type TrajectoryMarkdownImportActivationRule = {
  date?: string
  startTime?: string
  endTime?: string
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  prewarmMinutes?: number
  graceMinutes?: number
}

export type TrajectoryMarkdownImportRecallPolicy = {
  level?: 'summary' | 'body'
  priority?: 'normal' | 'must'
}

export type TrajectoryMarkdownImportEntry = {
  granularity: TrajectoryMarkdownImportGranularity
  title: string
  subtitle: string
  time: string
  startDate: string
  endDate: string
  mountPath: string
  relatedEntities: string[]
  tags: string[]
  summary: string
  confirmed: boolean
  dayTarget: TrajectoryMarkdownImportDayTarget
  activationRule?: TrajectoryMarkdownImportActivationRule
  recallPolicy?: TrajectoryMarkdownImportRecallPolicy
  content: string
  rawMarkdown: string
}

export type TrajectoryMarkdownImportWarning = {
  code: 'missing_time' | 'invalid_granularity' | 'empty_body'
  title?: string
  message: string
}

export type TrajectoryMarkdownImportResult = {
  entries: TrajectoryMarkdownImportEntry[]
  warnings: TrajectoryMarkdownImportWarning[]
}

export type TrajectoryRootImportValidationResult =
  | { ok: true }
  | { ok: false; message: string }

const ENTRY_HEADING_PATTERN = /^###\s+(.+?)\s*$/gm
const FIELD_LINE_PATTERN = /^[-*]\s*([^：:]+)[：:]\s*(.*?)\s*$/u

export function parseTrajectoryMarkdown(input: string): TrajectoryMarkdownImportResult {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { entries: [], warnings: [] }

  const headings = Array.from(text.matchAll(ENTRY_HEADING_PATTERN))
  const entries: TrajectoryMarkdownImportEntry[] = []
  const warnings: TrajectoryMarkdownImportWarning[] = []

  headings.forEach((heading, index) => {
    const headingText = String(heading[1] || '').trim()
    const start = heading.index || 0
    const end = index + 1 < headings.length ? headings[index + 1].index || text.length : text.length
    const rawMarkdown = text.slice(start, end).trim()
    const parsedHeading = parseEntryHeading(headingText)
    const fields = collectEntryFields(rawMarkdown)
    const body = collectEntryBody(rawMarkdown)
    const time = normalizeTimeText(fields.get('时间') || parsedHeading.time)
    const mountPath = fields.get('建议挂载') || parsedHeading.mountPath || ''
    const granularity = resolveImportGranularity(
      fields.get('粒度') || parsedHeading.granularity,
      mountPath,
      time
    )
    if (!granularity) {
      warnings.push({
        code: 'invalid_granularity',
        title: parsedHeading.title,
        message: `轨迹正文条目粒度无法识别：${headingText || '空标题'}`
      })
      return
    }

    if (!time) {
      warnings.push({
        code: 'missing_time',
        title: parsedHeading.title,
        message: `轨迹正文条目缺少时间：${parsedHeading.title || headingText || '未命名条目'}`
      })
      return
    }
    const range = buildDateRange(granularity, time)
    if (!range) {
      warnings.push({
        code: 'missing_time',
        title: parsedHeading.title,
        message: `轨迹正文条目时间格式不受支持：${time}`
      })
      return
    }
    if (!body) {
      warnings.push({
        code: 'empty_body',
        title: parsedHeading.title,
        message: `轨迹正文条目没有正文：${parsedHeading.title || time}`
      })
      return
    }

    const dayTarget = granularity === 'day'
      ? resolveDayImportTarget(fields.get('导入为') || fields.get('单位类型') || fields.get('建议挂载') || parsedHeading.mountPath)
      : 'overview'
    entries.push({
      granularity,
      title: parsedHeading.title || fields.get('标题') || time,
      subtitle: normalizeSummary(fields.get('副标题')),
      time,
      startDate: range.startDate,
      endDate: range.endDate,
      mountPath,
      relatedEntities: normalizeList(fields.get('涉及对象')),
      tags: normalizeList(fields.get('标签')),
      summary: normalizeSummary(fields.get('简短摘要')),
      confirmed: normalizeConfirmed(fields.get('正式性')),
      dayTarget,
      activationRule: dayTarget === 'arrangement'
        ? normalizeArrangementActivationRule(fields.get('激活规则'), range.startDate)
        : undefined,
      recallPolicy: dayTarget === 'arrangement'
        ? normalizeArrangementRecallPolicy(fields.get('召回策略'))
        : undefined,
      content: body,
      rawMarkdown
    })
  })

  return { entries: sortTrajectoryEntries(entries), warnings }
}

export function validateTrajectoryRootImportBirthDate(
  entries: TrajectoryMarkdownImportEntry[],
  birthDate: string
): TrajectoryRootImportValidationResult {
  const normalizedBirthDate = String(birthDate || '').trim()
  if (!normalizedBirthDate) {
    return { ok: false, message: '先在轨迹根节点设置角色出生日期。' }
  }
  const firstDay = entries
    .filter((entry) => entry.granularity === 'day')
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0]
  if (!firstDay) {
    return { ok: false, message: '从轨迹根导入正文时，材料里至少需要一个日桠作为第一天。' }
  }
  if (firstDay.startDate !== normalizedBirthDate) {
    return {
      ok: false,
      message: `轨迹根导入要求第一天等于出生日期：当前出生日期是 ${normalizedBirthDate}，材料第一天是 ${firstDay.startDate}。`
    }
  }
  return { ok: true }
}

function parseEntryHeading(value: string) {
  const parts = String(value || '').split('｜').map((part) => part.trim()).filter(Boolean)
  const [granularity = '', title = '', ...rest] = parts
  const result = { granularity, title, time: '', mountPath: '' }
  rest.forEach((part) => {
    const pair = part.match(/^([^：:]+)[：:]\s*(.+)$/u)
    if (!pair) {
      if (!result.time && looksLikeTimeText(part)) result.time = part
      return
    }
    const key = pair[1].trim()
    const nextValue = pair[2].trim()
    if (key === '起止' || key === '日期' || key === '时间') result.time = nextValue
    if (key === '建议挂载') result.mountPath = nextValue
  })
  return result
}

function collectEntryFields(markdown: string) {
  const fields = new Map<string, string>()
  const fieldBlock = collectSubsection(markdown, '字段')
  fieldBlock.split('\n').forEach((line) => {
    const match = line.match(FIELD_LINE_PATTERN)
    if (!match) return
    fields.set(match[1].trim(), match[2].trim())
  })
  return fields
}

function collectEntryBody(markdown: string) {
  return collectSubsection(markdown, '正文')
    .replace(/^这里写.+$/gm, '')
    .trim()
}

function collectSubsection(markdown: string, title: string) {
  const pattern = new RegExp(`^####\\s+${escapeRegExp(title)}\\s*$`, 'mu')
  const match = markdown.match(pattern)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const rest = markdown.slice(start)
  const next = rest.search(/^####\s+/m)
  return (next >= 0 ? rest.slice(0, next) : rest).trim()
}

function normalizeGranularity(value: string): TrajectoryMarkdownImportGranularity | '' {
  const text = String(value || '').trim()
  if (/^(10年枝|十年枝|多年枝|multiYear)$/i.test(text)) return 'multiYear'
  if (/^(年枝|year)$/i.test(text)) return 'year'
  if (/^(月枝|month)$/i.test(text)) return 'month'
  if (/^(日桠|day|日)$/i.test(text)) return 'day'
  return ''
}

function resolveImportGranularity(
  rawGranularity: string,
  mountPath: string,
  time: string
): TrajectoryMarkdownImportGranularity | '' {
  const primary = normalizeGranularity(rawGranularity)
  const mounted = normalizeGranularity(mountPath)
  const fullDateRange = parseFullDateRange(time)
  if (fullDateRange && getImportYear(fullDateRange.startDate) !== getImportYear(fullDateRange.endDate)) {
    if (!primary || primary === 'year' || mounted === 'multiYear') return 'multiYear'
  }
  return primary || mounted
}

function normalizeTimeText(value: string) {
  return String(value || '')
    .trim()
    .replace(/\s*(?:至|—|~|～)\s*/g, '-')
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/-+/g, '-')
    .replace(/-$/g, '')
}

function getImportYear(date: string) {
  return Number(String(date || '').slice(0, 4))
}

function buildDateRange(granularity: TrajectoryMarkdownImportGranularity, time: string) {
  const fullDateRange = parseFullDateRange(time)
  if (fullDateRange && granularity !== 'day') return fullDateRange
  if (granularity === 'day') {
    const date = parseDate(time)
    return date ? { startDate: date, endDate: date } : null
  }
  if (granularity === 'month') {
    const match = time.match(/^(\d{1,6})-(\d{1,2})$/)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    if (!year || month < 1 || month > 12) return null
    const startDate = `${padYear(year)}-${pad2(month)}-01`
    return { startDate, endDate: `${padYear(year)}-${pad2(month)}-31` }
  }
  if (granularity === 'year') {
    const year = Number(time.match(/^\d{1,6}$/)?.[0] || 0)
    return year ? { startDate: `${padYear(year)}-01-01`, endDate: `${padYear(year)}-12-31` } : null
  }
  const range = time.match(/^(\d{1,6})-(\d{1,6})$/)
  if (!range) return null
  const startYear = Number(range[1])
  const endYear = Number(range[2])
  if (!startYear || !endYear || endYear < startYear) return null
  return { startDate: `${padYear(startYear)}-01-01`, endDate: `${padYear(endYear)}-12-31` }
}

function looksLikeTimeText(value: string) {
  return /^\d{1,6}(?:-\d{1,2}(?:-\d{1,2})?)?(?:\s*(?:至|—|~|～)\s*\d{1,6}(?:-\d{1,2}(?:-\d{1,2})?)?)?$/.test(String(value || '').trim())
}

function parseFullDateRange(value: string) {
  const match = String(value || '').match(/^(\d{1,6}-\d{1,2}-\d{1,2})-(\d{1,6}-\d{1,2}-\d{1,2})$/)
  if (!match) return null
  const startDate = parseDate(match[1])
  const endDate = parseDate(match[2])
  if (!startDate || !endDate || endDate < startDate) return null
  return { startDate, endDate }
}

function parseDate(value: string) {
  const match = value.match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${padYear(year)}-${pad2(month)}-${pad2(day)}`
}

function normalizeList(value = '') {
  return Array.from(new Set(String(value || '')
    .split(/\n|、|，|,|；|;/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter((item) => item && item !== '无')))
}

function normalizeSummary(value = '') {
  return String(value || '').trim()
}

function normalizeConfirmed(value = '') {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  return !['unconfirmed', 'pending', 'false', '待确认'].includes(text)
}

function resolveDayImportTarget(value = ''): TrajectoryMarkdownImportDayTarget {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return 'event'
  if (/安排|schedule|arrangement/.test(text)) return 'arrangement'
  if (/事件|event/.test(text)) return 'event'
  if (/概览|overview|日枝正文|日枝|当天概览/.test(text)) return 'overview'
  return 'event'
}

function normalizeArrangementActivationRule(value = '', fallbackDate = ''): TrajectoryMarkdownImportActivationRule {
  const text = String(value || '').trim()
  const date = parseDate(text.match(/日期\s*([0-9]{1,6}[-年][0-9]{1,2}[-月][0-9]{1,2})/u)?.[1]
    ?.replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '') || '') || fallbackDate
  const allDay = /全天\s*(?:true|是|yes)?|是否全天\s*(?:true|是|yes)/iu.test(text)
  const startTime = allDay ? '' : normalizeClockText(text.match(/开始\s*([0-2]?\d:[0-5]\d)/u)?.[1] || '')
  const endTime = allDay ? '' : normalizeClockText(text.match(/结束\s*([0-2]?\d:[0-5]\d)/u)?.[1] || '')
  return {
    date,
    recurrence: normalizeArrangementRecurrence(text.match(/重复\s*([A-Za-z]+|一次|单次|每天|每日|每周|每月|每年)/u)?.[1] || ''),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    prewarmMinutes: normalizeImportMinutes(text.match(/提前\s*(\d+)\s*分钟/u)?.[1]),
    graceMinutes: normalizeImportMinutes(text.match(/宽限\s*(\d+)\s*分钟/u)?.[1])
  }
}

function normalizeArrangementRecallPolicy(value = ''): TrajectoryMarkdownImportRecallPolicy {
  const text = String(value || '').trim()
  return {
    level: /正文|body/i.test(text) ? 'body' : 'summary',
    priority: /必须|must/i.test(text) ? 'must' : 'normal'
  }
}

function normalizeArrangementRecurrence(value = ''): NonNullable<TrajectoryMarkdownImportActivationRule['recurrence']> {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'daily' || text === '每天' || text === '每日') return 'daily'
  if (text === 'weekly' || text === '每周') return 'weekly'
  if (text === 'monthly' || text === '每月') return 'monthly'
  if (text === 'yearly' || text === '每年') return 'yearly'
  return 'once'
}

function normalizeClockText(value = '') {
  const match = String(value || '').trim().match(/^([0-2]?\d):([0-5]\d)$/u)
  if (!match) return ''
  const hour = Number(match[1])
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return ''
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

function normalizeImportMinutes(value: string | undefined) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function sortTrajectoryEntries(entries: TrajectoryMarkdownImportEntry[]) {
  return [...entries].sort((left, right) => {
    const dateOrder = left.startDate.localeCompare(right.startDate)
    if (dateOrder) return dateOrder
    return granularityOrder(left.granularity) - granularityOrder(right.granularity)
  })
}

function granularityOrder(value: TrajectoryMarkdownImportGranularity) {
  return value === 'multiYear' ? 0 : value === 'year' ? 1 : value === 'month' ? 2 : 3
}

function padYear(value: number) {
  return String(Math.max(0, Math.floor(value))).padStart(4, '0')
}

function pad2(value: number) {
  return String(Math.max(1, Math.floor(value))).padStart(2, '0')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
