import { parseRelationHintReference } from './relationHintReference'

export type UnitBodyMarkdownEntry = {
  target: string
  targetTitle: string
  targetRefId: string
  subtitle: string
  summary: string
  tags: string[]
  confirmed: boolean
  content: string
  rawMarkdown: string
}

export type UnitBodyMarkdownWarning = {
  code: 'missing_target_ref' | 'duplicate_target' | 'empty_body'
  target?: string
  message: string
}

export type UnitBodyMarkdownImportResult = {
  entries: UnitBodyMarkdownEntry[]
  warnings: UnitBodyMarkdownWarning[]
}

const TARGET_COMMENT_PATTERN = /<!--\s*target\s*:\s*([^>]+?)\s*-->/giu
const FIELD_LINE_PATTERN = /^[-*]\s*([^：:]+)[：:]\s*(.*?)\s*$/u

export function parseUnitBodyMarkdownBatch(input: string): UnitBodyMarkdownImportResult {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { entries: [], warnings: [] }

  const targetMatches = Array.from(text.matchAll(TARGET_COMMENT_PATTERN))
  if (!targetMatches.length) return { entries: [], warnings: [] }

  const entries: UnitBodyMarkdownEntry[] = []
  const warnings: UnitBodyMarkdownWarning[] = []
  const seenTargetRefIds = new Set<string>()

  targetMatches.forEach((match, index) => {
    const rawTarget = String(match[1] || '').trim()
    const blockStart = match.index || 0
    const nextStart = index + 1 < targetMatches.length ? targetMatches[index + 1].index || text.length : text.length
    const rawMarkdown = text.slice(blockStart, nextStart).trim()
    const targetRef = parseRelationHintReference(rawTarget)
    const targetRefId = String(targetRef.refId || '').trim()
    const targetTitle = String(targetRef.title || '').trim()

    if (!targetRefId) {
      warnings.push({
        code: 'missing_target_ref',
        target: rawTarget,
        message: `批量正文目标缺少正式 ID：${rawTarget || '空'}`
      })
      return
    }
    if (seenTargetRefIds.has(targetRefId)) {
      warnings.push({
        code: 'duplicate_target',
        target: rawTarget,
        message: `批量正文目标重复：${rawTarget}`
      })
      return
    }

    const parsed = parseUnitBodyMarkdown(rawMarkdown)
    if (!parsed.content) {
      warnings.push({
        code: 'empty_body',
        target: rawTarget,
        message: `批量正文目标没有可导入正文：${rawTarget}`
      })
      return
    }

    seenTargetRefIds.add(targetRefId)
    entries.push({
      target: rawTarget,
      targetTitle,
      targetRefId,
      rawMarkdown,
      ...parsed
    })
  })

  return { entries, warnings }
}

export function parseUnitBodyMarkdown(input: string): Omit<UnitBodyMarkdownEntry, 'target' | 'targetTitle' | 'targetRefId' | 'rawMarkdown'> {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  const fields = collectFields(text)
  return {
    subtitle: firstNonEmpty(fields.get('副标题'), fields.get('标题')),
    summary: firstNonEmpty(fields.get('简短摘要'), fields.get('摘要')),
    tags: normalizeList(fields.get('标签')),
    confirmed: normalizeConfirmed(fields.get('正式性')),
    content: collectBody(text)
  }
}

function collectFields(markdown: string) {
  const fields = new Map<string, string>()
  const fieldBlock = collectSection(markdown, '字段')
  fieldBlock.split('\n').forEach((line) => {
    const match = line.match(FIELD_LINE_PATTERN)
    if (!match) return
    fields.set(match[1].trim(), match[2].trim())
  })
  return fields
}

function collectBody(markdown: string) {
  const sectionBody = collectSection(markdown, '正文')
  const fallback = sectionBody || markdown.replace(TARGET_COMMENT_PATTERN, '')
  return fallback
    .replace(/^#\s+琅嬛批量正文\s*$/gm, '')
    .replace(/^#\s+琅嬛正文\s*$/gm, '')
    .replace(/^##\s+字段\s*$/gm, '')
    .replace(/^[-*]\s*([^：:]+)[：:]\s*(.*?)\s*$/gmu, '')
    .trim()
}

function collectSection(markdown: string, title: string) {
  const headingPattern = new RegExp(`^#{2,4}\\s+${escapeRegExp(title)}\\s*$`, 'mu')
  const match = markdown.match(headingPattern)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const rest = markdown.slice(start)
  const next = rest.search(/^#{2,4}\s+/m)
  return (next >= 0 ? rest.slice(0, next) : rest).trim()
}

function normalizeList(value = '') {
  return Array.from(new Set(String(value || '')
    .split(/\n|、|，|,|；|;/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter((item) => item && item !== '无')))
}

function normalizeConfirmed(value = '') {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  return !['unconfirmed', 'pending', 'false', '待确认'].includes(text)
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
