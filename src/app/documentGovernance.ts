import type { BrainDocumentRecord, BrainDocumentSourceMeta, BrainPublicCompilePage } from '../types'

export type DocumentGovernanceSeverity = 'low' | 'medium' | 'high'

export interface DocumentGovernanceCategoryRule {
  category: string
  keywords: string[]
}

export interface DocumentGovernanceHeading {
  level: number
  title: string
}

export interface DocumentGovernanceSection {
  title: string
  content: string
  index: number
}

export interface DocumentGovernanceIndexChildInfo {
  title: string
  displayPath: string
  summary: string
}

export interface DocumentGovernanceAuditItem {
  documentId: string
  title: string
  displayPath: string
  sourceFileName: string
  sourceEntryUid: string
  contentLength: number
  headingCount: number
  h1Count: number
  maxHeadingLevel: number
  startsWithDeepHeading: boolean
  hasHeadingLevelJump: boolean
  category: string
  suggestedPath: string
  problemTags: string[]
  actions: string[]
  severity: DocumentGovernanceSeverity
  publicCompileStatus: 'complete' | 'missing' | 'incomplete'
  publicCompileDraft: BrainPublicCompilePage
}

export interface DocumentGovernanceAuditReport {
  generatedAt: string
  profileId: string
  profileLabel: string
  documents: DocumentGovernanceAuditItem[]
  stats: {
    total: number
    high: number
    medium: number
    low: number
    splitCandidates: number
    mergeCandidates: number
    markdownNeedsFix: number
    categoryNeedsMove: number
    compileNeedsFill: number
  }
}

export interface DocumentGovernanceResult {
  documents: BrainDocumentRecord[]
  stats: {
    inputDocuments: number
    outputDocuments: number
    normalizedDocuments: number
    splitParents: number
    createdChildren: number
  }
}

export interface DocumentGovernanceHelpers {
  cleanText(value: unknown): string
  cleanTitle(value: string, fallback?: string): string
  cleanPathSegment(value: string): string
  splitPath(value: string): string[]
  stripMarkdown(value: string): string
  cleanSemanticText(value: string, fallback?: string): string
  extractSemanticSummary(content: string, fallback: string): string
  extractSemanticBody(content: string): string
  normalizeBodyMarkdown(content: string): string
  readHeadingTitle(line: string): string
  stableHash(input: string): string
}

export interface DocumentGovernanceProfile {
  id: string
  label: string
  rootPath: string
  categories: string[]
  categoryRules: DocumentGovernanceCategoryRule[]
  fallbackCategory: string
  documentMatches(document: BrainDocumentRecord): boolean
  reportTitle?: string
  reportScope?: string
  templateHeadingTitles?: string[]
  titleCleanupLabels?: string[]
  stripTitleFragments?: Array<string | RegExp>
  highPriorityProblemTags?: string[]
  normalizeTitle?: (
    title: string,
    document: BrainDocumentRecord,
    helpers: DocumentGovernanceHelpers
  ) => string
  inferCategory?: (
    document: BrainDocumentRecord,
    headings: DocumentGovernanceHeading[],
    context: DocumentGovernanceProfileContext
  ) => string | undefined
  resolveThemeSegment?: (
    document: BrainDocumentRecord,
    segments: string[],
    context: DocumentGovernanceProfileContext
  ) => string
  sourceChainProblem?: (document: BrainDocumentRecord) => string | undefined
  buildCompileDraft?: (
    document: BrainDocumentRecord,
    category: string,
    headings: DocumentGovernanceHeading[],
    context: DocumentGovernanceProfileContext
  ) => BrainPublicCompilePage
}

export interface DocumentGovernanceProfileContext {
  profile: DocumentGovernanceProfile
  generatedAt: string
  helpers: DocumentGovernanceHelpers
}

const EMOJI_RE = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu
const DEFAULT_TEMPLATE_HEADING_TITLES = new Set(['概述', '概要', '正文', '关联', '关联条目', '子条目', '子文档索引', '原始来源说明'])
const DEFAULT_TITLE_CLEANUP_LABELS = ['精简版', '详细版', '史诗修订版', '黄金时代版', 'V[\\d.]+']

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function cleanText(value: unknown): string {
  return toText(value).replace(/\s+/g, ' ').trim()
}

function makeTemplateHeadingTitles(profile: DocumentGovernanceProfile): Set<string> {
  return new Set([
    ...DEFAULT_TEMPLATE_HEADING_TITLES,
    ...(profile.templateHeadingTitles || [])
  ])
}

function splitPath(value: string): string[] {
  return value.split('/').map((part) => part.trim()).filter(Boolean)
}

function buildTitleCleanupRegex(profile: DocumentGovernanceProfile): RegExp {
  const labels = profile.titleCleanupLabels?.length ? profile.titleCleanupLabels : DEFAULT_TITLE_CLEANUP_LABELS
  return new RegExp(`\\s*[\\(（](${labels.join('|')})[\\)）]\\s*`, 'gi')
}

function cleanTitleWithProfile(profile: DocumentGovernanceProfile, value: string, fallback = '未命名文档'): string {
  let cleaned = cleanText(value)
    .replace(EMOJI_RE, '')
    .replace(/[`*_#>]/g, '')
    .replace(/[【】]/g, '')
    .replace(buildTitleCleanupRegex(profile), ' ')
    .replace(/\s*[\(（][^()（）]{1,80}[\)）]\s*/g, ' ')
    .replace(/^(第?[一二三四五六七八九十\d]+[、.．]\s*)+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const fragment of profile.stripTitleFragments || []) {
    cleaned = typeof fragment === 'string'
      ? cleaned.split(fragment).join('')
      : cleaned.replace(fragment, '')
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

function cleanPathSegmentWithProfile(profile: DocumentGovernanceProfile, value: string): string {
  return cleanTitleWithProfile(profile, value)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '未命名'
}

function replacePathFileName(profile: DocumentGovernanceProfile, path: string, title: string): string {
  const segments = splitPath(path)
  if (!segments.length) return `/${cleanPathSegmentWithProfile(profile, title)}.md`
  segments[segments.length - 1] = `${cleanPathSegmentWithProfile(profile, title)}.md`
  return `/${segments.join('/')}`
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#|]/g, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripVisibleSourceNoise(profile: DocumentGovernanceProfile, value: string): string {
  const templateHeadingPattern = Array.from(makeTemplateHeadingTitles(profile))
    .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  return value
    .replace(/^>\s*(来源|状态)：.*$/gim, '')
    .replace(/来源：SillyTavern[^。；\n]*/gi, '')
    .replace(/状态：(已规范|已编译|已拆分|待整理)(\s*\/\s*(已规范|已编译|已拆分|待整理))*/gi, '')
    .replace(new RegExp(`\\b(${templateHeadingPattern})\\b`, 'g'), ' ')
    .replace(/\[\[[^\]]+\]\]/g, ' ')
}

function cleanSemanticTextWithProfile(profile: DocumentGovernanceProfile, value: string, fallback = ''): string {
  return cleanText(stripMarkdown(stripVisibleSourceNoise(profile, value)) || fallback)
}

function readHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s+/)
  return match ? match[1].length : 0
}

function readHeadingTitleWithProfile(profile: DocumentGovernanceProfile, line: string): string {
  return cleanTitleWithProfile(profile, line.replace(/^#{1,6}\s+/, ''))
}

function collectHeadings(profile: DocumentGovernanceProfile, content: string): DocumentGovernanceHeading[] {
  const templateHeadings = makeTemplateHeadingTitles(profile)
  return Array.from(content.matchAll(/^(#{1,6})\s+(.+)$/gm)).map((match) => ({
    level: match[1].length,
    title: cleanText(match[2].replace(/[*_`]/g, ''))
  })).filter((item) => !templateHeadings.has(item.title))
}

function hasEmoji(value: string): boolean {
  return /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/u.test(value)
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

function createHelpers(profile: DocumentGovernanceProfile): DocumentGovernanceHelpers {
  return {
    cleanText,
    cleanTitle: (value, fallback) => cleanTitleWithProfile(profile, value, fallback),
    cleanPathSegment: (value) => cleanPathSegmentWithProfile(profile, value),
    splitPath,
    stripMarkdown,
    cleanSemanticText: (value, fallback) => cleanSemanticTextWithProfile(profile, value, fallback),
    extractSemanticSummary: (content, fallback) => extractSemanticSummary(profile, content, fallback),
    extractSemanticBody: (content) => extractSemanticBody(profile, content),
    normalizeBodyMarkdown: (content) => normalizeBodyMarkdown(profile, content),
    readHeadingTitle: (line) => readHeadingTitleWithProfile(profile, line),
    stableHash
  }
}

function inferTargetCategory(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  headings: DocumentGovernanceHeading[],
  context: DocumentGovernanceProfileContext
): string {
  const existingCategory = splitPath(document.displayPath).find((segment) => profile.categories.includes(segment))
  if (document.sourceMeta?.sourceEntryUid?.includes('#') && existingCategory) return existingCategory
  const customCategory = profile.inferCategory?.(document, headings, context)
  if (customCategory && profile.categories.includes(customCategory)) return customCategory

  const text = [
    document.title,
    document.displayPath,
    document.sourceMeta?.sourceEntryKey || '',
    ...(document.tags || []),
    ...headings.slice(0, 12).map((item) => item.title),
    document.summary,
    document.content.slice(0, 800)
  ].join(' ').toLowerCase()

  for (const rule of profile.categoryRules) {
    if (includesAny(text, rule.keywords)) return rule.category
  }
  return profile.fallbackCategory
}

function defaultResolveThemeSegment(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  segments: string[]
): string {
  const current = segments[1] || ''
  if (current && !['核心', '概述', '条目', '未命名', ...profile.categories].includes(current)) return current
  const fileName = document.sourceMeta?.sourceFileName || ''
  return fileName.replace(/\.(json|md|markdown)$/i, '')
}

function buildSuggestedPath(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  category: string,
  context: DocumentGovernanceProfileContext
): string {
  const segments = splitPath(document.displayPath)
  const title = cleanPathSegmentWithProfile(profile, document.title.replace(/\.(md|markdown)$/i, ''))
  const theme = profile.resolveThemeSegment
    ? profile.resolveThemeSegment(document, segments, context)
    : defaultResolveThemeSegment(profile, document, segments)
  const folder = theme ? [profile.rootPath, theme, category] : [profile.rootPath, category]
  return `${folder.join('/')}/${title}.md`
}

function isCategoryAligned(displayPath: string, category: string): boolean {
  return splitPath(displayPath).includes(category)
}

function getCompileStatus(compilePage: BrainPublicCompilePage | undefined): 'complete' | 'missing' | 'incomplete' {
  if (!compilePage) return 'missing'
  const hasSummary = cleanText(compilePage.summary).length >= 80
  const hasTags = (compilePage.tags || []).length >= 3
  const hasRelations = (compilePage.relationHints || []).length >= 1
  if (!hasSummary && !hasTags && !hasRelations) return 'missing'
  return hasSummary && hasTags && hasRelations ? 'complete' : 'incomplete'
}

function collectEntities(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  headings: DocumentGovernanceHeading[],
  category: string
): string[] {
  const values = [
    document.title,
    ...(document.tags || []),
    ...(document.sourceMeta?.sourceEntryKey ? [document.sourceMeta.sourceEntryKey] : []),
    ...headings.slice(0, 10).map((item) => item.title)
  ]
  const entities = values
    .flatMap((value) => cleanText(value).split(/[，,、；;：:（）()【】\[\]\s]+/))
    .map((value) => value.replace(/^(一|二|三|四|五|六|七|八|九|十)[、.．]/, '').trim())
    .filter((value) => value.length >= 2 && value.length <= 16)
    .filter((value) => !['精简版', '详细版', '概述', '概要', '正文', '核心', category].includes(value))
  return Array.from(new Set([document.title, ...entities])).slice(0, 12)
}

function ensureMinText(value: string, fallback: string, minLength: number): string {
  const text = cleanText(value || fallback)
  if (text.length >= minLength) return text
  return cleanText(`${text}。${fallback}`).slice(0, Math.max(minLength, 160))
}

function buildCompileDraft(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  category: string,
  headings: DocumentGovernanceHeading[],
  context: DocumentGovernanceProfileContext
): BrainPublicCompilePage {
  const customDraft = profile.buildCompileDraft?.(document, category, headings, context)
  if (customDraft) return customDraft
  const plain = cleanSemanticTextWithProfile(profile, document.content, document.summary || document.title)
  const summary = ensureMinText(plain || document.summary || document.title, `${document.title}是${profile.label}中的${category}资料。`, 80).slice(0, 360)
  const relatedEntities = collectEntities(profile, document, headings, category)
  const theme = profile.resolveThemeSegment
    ? profile.resolveThemeSegment(document, splitPath(document.displayPath), context)
    : defaultResolveThemeSegment(profile, document, splitPath(document.displayPath))
  const normalizedEntities = Array.from(new Set([
    document.title,
    category,
    theme,
    ...relatedEntities
  ].filter(Boolean))).slice(0, 12)
  const tags = Array.from(new Set([
    profile.label,
    category,
    ...(theme ? [theme] : []),
    ...(document.tags || []),
    ...normalizedEntities.slice(0, 4)
  ].filter(Boolean))).slice(0, 8)
  const relationHints = Array.from(new Set([
    ...normalizedEntities
      .slice(1, 6)
      .map((entity) => `[[${entity}]]`)
  ])).slice(0, 6)
  return {
    summary,
    tags,
    relationHints,
    sourceState: 'manual_confirmed',
    updatedAt: context.generatedAt
  }
}

function severityFromProblems(profile: DocumentGovernanceProfile, problemTags: string[]): DocumentGovernanceSeverity {
  const highTags = profile.highPriorityProblemTags || ['超长待拆分', '公共编译层缺失', '来源链缺失']
  if (problemTags.some((tag) => highTags.includes(tag))) return 'high'
  if (problemTags.length >= 3) return 'medium'
  return 'low'
}

function auditDocument(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  context: DocumentGovernanceProfileContext
): DocumentGovernanceAuditItem {
  const content = toText(document.content)
  const headings = collectHeadings(profile, content)
  const levels = headings.map((item) => item.level)
  const h1Count = levels.filter((level) => level === 1).length
  const maxHeadingLevel = levels.length ? Math.max(...levels) : 0
  const hasHeadingLevelJump = levels.some((level, index) => index > 0 && level - levels[index - 1] > 1)
  const startsWithDeepHeading = Boolean(levels[0] && levels[0] > 1)
  const category = inferTargetCategory(profile, document, headings, context)
  const suggestedPath = buildSuggestedPath(profile, document, category, context)
  const compileStatus = getCompileStatus(document.publicCompilePage)
  const isDerivedSection = Boolean(document.sourceMeta?.sourceEntryUid?.includes('#'))
  const problemTags: string[] = []
  const actions: string[] = []
  const sourceProblem = profile.sourceChainProblem?.(document)

  if (sourceProblem) problemTags.push(sourceProblem)
  if (!document.displayPath.startsWith(profile.rootPath)) problemTags.push(`路径不在${profile.label}根下`)
  if (hasEmoji(document.title)) problemTags.push('标题含表情')
  if (/精简版|详细版|\(.+\)|（.+）/.test(document.title)) problemTags.push('标题含版本或括号说明')
  if (h1Count !== 1) problemTags.push(h1Count === 0 ? '缺少一级标题' : '多个一级标题')
  if (startsWithDeepHeading) problemTags.push('开篇标题层级过深')
  if (hasHeadingLevelJump) problemTags.push('标题层级跳跃')
  if (content.length > 5000) problemTags.push('超长待拆分')
  if (content.length < 300) problemTags.push('过短待合并')
  if (!isDerivedSection && headings.length > 8 && content.length > 2500) problemTags.push('多主题嫌疑')
  if (!isCategoryAligned(document.displayPath, category)) problemTags.push('分类建议调整')
  if (compileStatus === 'missing') problemTags.push('公共编译层缺失')
  if (compileStatus === 'incomplete') problemTags.push('公共编译层不完整')

  if (problemTags.some((tag) => ['缺少一级标题', '多个一级标题', '开篇标题层级过深', '标题层级跳跃', '标题含表情', '标题含版本或括号说明'].includes(tag))) {
    actions.push('规范化 Markdown')
  }
  if (problemTags.includes('超长待拆分') || problemTags.includes('多主题嫌疑')) actions.push('进入拆分候选')
  if (problemTags.includes('过短待合并')) actions.push('进入合并候选')
  if (problemTags.includes('分类建议调整')) actions.push('移动到分类结构')
  if (compileStatus !== 'complete') actions.push('生成公共编译层')
  if (!actions.length) actions.push('保留并复核')

  return {
    documentId: document.documentId,
    title: document.title,
    displayPath: document.displayPath,
    sourceFileName: document.sourceMeta?.sourceFileName || '',
    sourceEntryUid: document.sourceMeta?.sourceEntryUid || '',
    contentLength: content.length,
    headingCount: headings.length,
    h1Count,
    maxHeadingLevel,
    startsWithDeepHeading,
    hasHeadingLevelJump,
    category,
    suggestedPath,
    problemTags,
    actions,
    severity: severityFromProblems(profile, problemTags),
    publicCompileStatus: compileStatus,
    publicCompileDraft: buildCompileDraft(profile, document, category, headings, context)
  }
}

export function filterGovernanceDocuments(
  profile: DocumentGovernanceProfile,
  documents: BrainDocumentRecord[]
): BrainDocumentRecord[] {
  return (Array.isArray(documents) ? documents : []).filter((document) => profile.documentMatches(document))
}

export function auditGovernanceDocuments(
  profile: DocumentGovernanceProfile,
  documents: BrainDocumentRecord[],
  generatedAt = new Date().toISOString()
): DocumentGovernanceAuditReport {
  const context: DocumentGovernanceProfileContext = {
    profile,
    generatedAt,
    helpers: createHelpers(profile)
  }
  const items = filterGovernanceDocuments(profile, documents)
    .map((document) => auditDocument(profile, document, context))
    .sort((left, right) => left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN'))
  return {
    generatedAt,
    profileId: profile.id,
    profileLabel: profile.label,
    documents: items,
    stats: {
      total: items.length,
      high: items.filter((item) => item.severity === 'high').length,
      medium: items.filter((item) => item.severity === 'medium').length,
      low: items.filter((item) => item.severity === 'low').length,
      splitCandidates: items.filter((item) => item.actions.includes('进入拆分候选')).length,
      mergeCandidates: items.filter((item) => item.actions.includes('进入合并候选')).length,
      markdownNeedsFix: items.filter((item) => item.actions.includes('规范化 Markdown')).length,
      categoryNeedsMove: items.filter((item) => item.actions.includes('移动到分类结构')).length,
      compileNeedsFill: items.filter((item) => item.actions.includes('生成公共编译层')).length
    }
  }
}

export function renderGovernanceAuditReport(
  profile: DocumentGovernanceProfile,
  report: DocumentGovernanceAuditReport
): string {
  const lines: string[] = [
    profile.reportTitle || `${profile.label}文档体检报告`,
    '',
    `> 生成时间：${report.generatedAt}`,
    `> 范围：${profile.reportScope || `文档库中 \`${profile.rootPath}\` 路径相关文档。`}`,
    '> 说明：本报告只诊断和给出建议，不移动、不拆分、不删除正式文档。',
    '',
    '## 总览',
    '',
    `- 文档总数：${report.stats.total}`,
    `- 高优先级：${report.stats.high}`,
    `- 中优先级：${report.stats.medium}`,
    `- 低优先级：${report.stats.low}`,
    `- 拆分候选：${report.stats.splitCandidates}`,
    `- 合并候选：${report.stats.mergeCandidates}`,
    `- Markdown 需规范：${report.stats.markdownNeedsFix}`,
    `- 分类建议调整：${report.stats.categoryNeedsMove}`,
    `- 公共编译层需补齐：${report.stats.compileNeedsFill}`,
    '',
    '## 分类覆盖',
    ''
  ]

  for (const category of profile.categories) {
    const count = report.documents.filter((item) => item.category === category).length
    lines.push(`- ${category}：${count}`)
  }

  lines.push('', '## 文档明细', '')
  report.documents.forEach((item, index) => {
    lines.push(
      `### ${index + 1}. ${item.title}`,
      '',
      `- 当前路径：${item.displayPath}`,
      `- 建议路径：${item.suggestedPath}`,
      `- 来源：${item.sourceFileName || '未知'} / entry ${item.sourceEntryUid || '未知'}`,
      `- 字数：${item.contentLength}`,
      `- 标题：共 ${item.headingCount} 个，一级标题 ${item.h1Count} 个，最深 ${item.maxHeadingLevel} 级`,
      `- 建议分类：${item.category}`,
      `- 优先级：${item.severity}`,
      `- 问题标签：${item.problemTags.length ? item.problemTags.join('，') : '无明显问题'}`,
      `- 建议动作：${item.actions.join('，')}`,
      `- 公共编译层：${item.publicCompileStatus}`,
      '',
      '公共编译层草稿：',
      '',
      `- 摘要：${item.publicCompileDraft.summary}`,
      `- 标签：${item.publicCompileDraft.tags.join('，')}`,
      `- 关系提示：${item.publicCompileDraft.relationHints.join('；') || '待补充'}`,
      ''
    )
  })

  return `${lines.join('\n')}\n`
}

function shiftHeadings(profile: DocumentGovernanceProfile, content: string, offset: number): string {
  const headingLevels = Array.from(content.matchAll(/^(#{1,6})\s+.+$/gm)).map((match) => match[1].length)
  const minLevel = headingLevels.length ? Math.min(...headingLevels) : 1
  return content.replace(/^(#{1,6})\s+(.+)$/gm, (_, marks: string, title: string) => {
    const level = Math.min(6, Math.max(3, marks.length - minLevel + 2 + offset))
    return `${'#'.repeat(level)} ${cleanTitleWithProfile(profile, title)}`
  })
}

function extractLastSection(profile: DocumentGovernanceProfile, content: string, sectionTitle: string): string {
  const lines = content.split(/\r?\n/)
  const matches = lines
    .map((line, index) => ({
      index,
      level: readHeadingLevel(line),
      title: readHeadingTitleWithProfile(profile, line)
    }))
    .filter((item) => item.level > 0 && item.title === sectionTitle)
  if (!matches.length) return ''
  const target = matches[matches.length - 1]
  const collected: string[] = []
  for (let index = target.index + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const level = readHeadingLevel(line)
    if (level > 0 && level <= target.level) break
    collected.push(line)
  }
  return collected.join('\n').trim()
}

function extractSemanticSummary(profile: DocumentGovernanceProfile, content: string, fallback: string): string {
  const summarySection = extractLastSection(profile, content, '概述') || extractLastSection(profile, content, '概要')
  const summary = cleanSemanticTextWithProfile(profile, summarySection, fallback)
  if (summary) return summary
  return cleanSemanticTextWithProfile(profile, extractSemanticBody(profile, content), fallback)
}

function extractSemanticBody(profile: DocumentGovernanceProfile, content: string): string {
  const bodySection = extractLastSection(profile, content, '正文')
  const cleanedBody = stripVisibleSourceNoise(profile, bodySection || content)
  const lines = cleanedBody
    .split(/\r?\n/)
    .filter((line) => !/^>\s*(来源|状态)：/i.test(line.trim()))
  const next = lines.join('\n').trim()
  return next || stripVisibleSourceNoise(profile, content).trim()
}

function normalizeBodyMarkdown(profile: DocumentGovernanceProfile, content: string): string {
  const templateHeadings = makeTemplateHeadingTitles(profile)
  const body = extractSemanticBody(profile, content)
  const lines = body
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^>\s*(来源|状态)：/i.test(trimmed)) return false
      if (/^---+$/.test(trimmed)) return false
      if (/^-\s*相关(地点|文明|人物|事件)：?\s*$/u.test(trimmed)) return false
      if (/^-\s*：/.test(trimmed)) return false
      if (/^本页保留为父级索引页/.test(trimmed)) return false
      const headingTitle = readHeadingTitleWithProfile(profile, trimmed)
      return !templateHeadings.has(headingTitle)
    })
  const joined = lines.join('\n').trim()
  return repairHeadingLevels(joined || body || '')
}

function removeLeadingHeading(content: string, title: string): string {
  const lines = content.split(/\r?\n/)
  if (!lines.length) return ''
  if (/^#{1,6}\s+/.test(lines[0] || '')) {
    lines.shift()
  }
  return lines.join('\n').trim() || stripMarkdown(content) || title
}

function repairHeadingLevels(content: string): string {
  let previousLevel = 0
  return content.replace(/^(#{1,6})\s+(.+)$/gm, (_, marks: string, title: string) => {
    const rawLevel = marks.length
    const level = previousLevel && rawLevel - previousLevel > 1
      ? previousLevel + 1
      : rawLevel
    previousLevel = level
    return `${'#'.repeat(level)} ${title}`
  })
}

function splitIntoSections(profile: DocumentGovernanceProfile, content: string): DocumentGovernanceSection[] {
  const templateHeadings = makeTemplateHeadingTitles(profile)
  const normalizedContent = normalizeBodyMarkdown(profile, content)
  const lines = normalizedContent.split(/\r?\n/)
  const headingLines = lines
    .map((line, index) => ({ line, index, level: readHeadingLevel(line) }))
    .filter((item) => item.level > 0 && item.level <= 4 && !templateHeadings.has(readHeadingTitleWithProfile(profile, item.line)))
  if (headingLines.length < 2) return []
  const levels = Array.from(new Set(headingLines.map((item) => item.level))).sort((left, right) => left - right)
  const splitLevel = levels.find((level) => headingLines.filter((item) => item.level === level).length >= 2)
  if (!splitLevel) return []
  const splitPoints = headingLines.filter((item) => item.level === splitLevel)
  if (splitPoints.length < 2) return []

  return splitPoints.map((point, index) => {
    const next = splitPoints[index + 1]
    const sectionLines = lines.slice(point.index, next ? next.index : undefined)
    return {
      title: readHeadingTitleWithProfile(profile, point.line) || `分节 ${index + 1}`,
      content: sectionLines.join('\n').trim(),
      index: index + 1
    }
  }).filter((section) => stripMarkdown(section.content).length >= 80)
}

function splitIntoParagraphChunks(profile: DocumentGovernanceProfile, content: string, title: string): DocumentGovernanceSection[] {
  const normalizedContent = normalizeBodyMarkdown(profile, content)
  const plain = stripMarkdown(normalizedContent)
  if (plain.length <= 5000) return []
  const paragraphs = normalizedContent.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  const pushCurrent = () => {
    if (!current.trim()) return
    chunks.push(current.trim())
    current = ''
  }

  for (const paragraph of paragraphs.length ? paragraphs : [content]) {
    if (paragraph.length > 3600) {
      pushCurrent()
      for (let index = 0; index < paragraph.length; index += 3000) {
        chunks.push(paragraph.slice(index, index + 3000).trim())
      }
      continue
    }
    if (current && current.length + paragraph.length > 3600) pushCurrent()
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  pushCurrent()

  return chunks
    .filter((chunk) => stripMarkdown(chunk).length >= 300)
    .map((chunk, index) => ({
      title: `${title} 第${index + 1}部分`,
      content: chunk,
      index: index + 1
    }))
}

function buildSummary(profile: DocumentGovernanceProfile, content: string, fallback: string): string {
  const plain = extractSemanticSummary(profile, content, fallback)
  return (plain || fallback).slice(0, 240)
}

function buildIndexOverview(title: string, childDocuments: DocumentGovernanceIndexChildInfo[]): string {
  const childTitles = childDocuments.map((child) => child.title)
  if (!childTitles.length) return `${title}的核心设定整理于本页。`
  const preview = childTitles.slice(0, 6).join('、')
  return `${title}的设定已按主题拆为多个子条目，当前索引覆盖${preview}${childTitles.length > 6 ? '等内容' : ''}。`
}

function buildNormalizedContent(profile: DocumentGovernanceProfile, document: BrainDocumentRecord, title: string, status: string): string {
  const rawBody = normalizeBodyMarkdown(profile, document.content)
  const shifted = shiftHeadings(profile, removeLeadingHeading(rawBody, title).trim(), 1).trim()
  const summary = extractSemanticSummary(profile, document.content, title)
  return repairHeadingLevels([
    `# ${title}`,
    '',
    '## 概述',
    '',
    summary,
    '',
    '## 正文',
    '',
    shifted || summary || status
  ].join('\n'))
}

function buildIndexContent(title: string, childDocuments: DocumentGovernanceIndexChildInfo[]): string {
  const summary = buildIndexOverview(title, childDocuments)
  return repairHeadingLevels([
    `# ${title}`,
    '',
    '## 概述',
    '',
    summary,
    '',
    '## 子条目',
    '',
    ...childDocuments.map((child) => `- ${child.title}：${child.summary || child.title}`)
  ].join('\n'))
}

function buildSectionContent(
  profile: DocumentGovernanceProfile,
  parent: BrainDocumentRecord,
  title: string,
  section: DocumentGovernanceSection
): string {
  const body = normalizeBodyMarkdown(profile, removeLeadingHeading(section.content, section.title))
  const shifted = shiftHeadings(profile, body, 1).trim()
  const summary = extractSemanticSummary(profile, section.content, title)
  return repairHeadingLevels([
    `# ${title}`,
    '',
    '## 概述',
    '',
    summary,
    '',
    '## 正文',
    '',
    shifted || summary
  ].join('\n'))
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildChildId(parent: BrainDocumentRecord, section: DocumentGovernanceSection): string {
  return `${parent.documentId}_section_${stableHash(`${section.index}:${section.title}`)}`
}

function buildChildSourceMeta(parent: BrainDocumentRecord, section: DocumentGovernanceSection, now: string): BrainDocumentSourceMeta | undefined {
  if (!parent.sourceMeta) return undefined
  return {
    ...parent.sourceMeta,
    sourceEntryUid: `${parent.sourceMeta.sourceEntryUid || parent.documentId}#${section.index}`,
    sourceEntryKey: section.title,
    sourceEntryHash: stableHash(`${parent.sourceMeta.sourceEntryHash || parent.documentId}:${section.index}:${section.title}`),
    updatedFromSourceAt: now
  }
}

function sectionDepth(document: BrainDocumentRecord): number {
  return (document.sourceMeta?.sourceEntryUid?.match(/#/g) || []).length
}

function uniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path)
    return path
  }
  const withoutExt = path.replace(/\.md$/i, '')
  let index = 2
  while (usedPaths.has(`${withoutExt}-${index}.md`)) index += 1
  const nextPath = `${withoutExt}-${index}.md`
  usedPaths.add(nextPath)
  return nextPath
}

function applyCompilePages(
  profile: DocumentGovernanceProfile,
  documents: BrainDocumentRecord[],
  now: string
): BrainDocumentRecord[] {
  const report = auditGovernanceDocuments(profile, documents, now)
  const compileMap = new Map(report.documents.map((item) => [item.documentId, item.publicCompileDraft]))
  return documents.map((document) => {
    const compilePage = compileMap.get(document.documentId)
    return compilePage ? {
      ...document,
      publicCompilePage: compilePage,
      summary: compilePage.summary || document.summary,
      tags: Array.from(new Set([...(document.tags || []), ...(compilePage.tags || [])])),
      updatedAt: now
    } : document
  })
}

function normalizeDocumentTitle(
  profile: DocumentGovernanceProfile,
  document: BrainDocumentRecord,
  context: DocumentGovernanceProfileContext
): string {
  const normalized = profile.normalizeTitle?.(document.title, document, context.helpers)
  return normalized || cleanTitleWithProfile(profile, document.title)
}

export function buildGovernedDocuments(
  profile: DocumentGovernanceProfile,
  documents: BrainDocumentRecord[],
  now = new Date().toISOString()
): DocumentGovernanceResult {
  const context: DocumentGovernanceProfileContext = {
    profile,
    generatedAt: now,
    helpers: createHelpers(profile)
  }
  const targetDocuments = filterGovernanceDocuments(profile, documents)
  const targetIds = new Set(targetDocuments.map((document) => document.documentId))
  const audit = auditGovernanceDocuments(profile, documents, now)
  const auditMap = new Map(audit.documents.map((item) => [item.documentId, item]))
  const usedPaths = new Set(documents.filter((document) => !targetIds.has(document.documentId)).map((document) => document.displayPath))
  const groupMap = new Map<string, BrainDocumentRecord[]>()
  for (const document of targetDocuments) {
    const sourceFileName = document.sourceMeta?.sourceFileName || ''
    const sourceUid = document.sourceMeta?.sourceEntryUid || document.documentId
    const rootUid = sourceUid.split('#')[0]
    const key = `${sourceFileName}::${rootUid}`
    const group = groupMap.get(key) || []
    group.push(document)
    groupMap.set(key, group)
  }
  const projectedPathMap = new Map<string, string>()
  const projectedTitleMap = new Map<string, string>()
  const branchBaseMap = new Map<string, string>()
  const sortedTargetDocuments = [...targetDocuments].sort((left, right) => {
    const leftDepth = sectionDepth(left)
    const rightDepth = sectionDepth(right)
    if (leftDepth !== rightDepth) return leftDepth - rightDepth
    return left.displayPath.localeCompare(right.displayPath, 'zh-Hans-CN')
  })

  for (const document of sortedTargetDocuments) {
    const auditItem = auditMap.get(document.documentId)
    if (!auditItem) continue
    const title = normalizeDocumentTitle(profile, document, context)
    const sourceFileName = document.sourceMeta?.sourceFileName || ''
    const sourceUid = document.sourceMeta?.sourceEntryUid || document.documentId
    const rootUid = sourceUid.split('#')[0]
    const groupKey = `${sourceFileName}::${rootUid}`
    const group = groupMap.get(groupKey) || []
    const hasExistingDescendants = group.some((item) => (item.sourceMeta?.sourceEntryUid || item.documentId).includes('#'))
    const isRootSource = sourceUid === rootUid
    let targetPath = uniquePath(replacePathFileName(profile, auditItem.suggestedPath, title), usedPaths)

    if (isRootSource && hasExistingDescendants) {
      branchBaseMap.set(groupKey, targetPath.replace(/\.md$/i, ''))
    } else if (!isRootSource) {
      const branchBase = branchBaseMap.get(groupKey)
      if (branchBase) targetPath = uniquePath(`${branchBase}/${cleanPathSegmentWithProfile(profile, title)}.md`, usedPaths)
    }

    projectedTitleMap.set(document.documentId, title)
    projectedPathMap.set(document.documentId, targetPath)
  }

  const nextTargetDocuments: BrainDocumentRecord[] = []
  let normalizedDocuments = 0
  let splitParents = 0
  let createdChildren = 0

  for (const document of sortedTargetDocuments) {
    const auditItem = auditMap.get(document.documentId)
    if (!auditItem) continue
    const title = projectedTitleMap.get(document.documentId) || normalizeDocumentTitle(profile, document, context)
    const targetPath = projectedPathMap.get(document.documentId) || uniquePath(replacePathFileName(profile, auditItem.suggestedPath, title), usedPaths)
    const sourceFileName = document.sourceMeta?.sourceFileName || ''
    const sourceUid = document.sourceMeta?.sourceEntryUid || document.documentId
    const rootUid = sourceUid.split('#')[0]
    const groupKey = `${sourceFileName}::${rootUid}`
    const group = groupMap.get(groupKey) || []
    const hasExistingDescendants = group.some((item) => {
      const uid = item.sourceMeta?.sourceEntryUid || item.documentId
      return uid !== rootUid && uid.startsWith(`${rootUid}#`)
    })
    const isRootSource = sourceUid === rootUid

    if (isRootSource && hasExistingDescendants) {
      const childDocuments = group
        .filter((item) => item.documentId !== document.documentId)
        .sort((left, right) => (left.sourceMeta?.sourceEntryUid || '').localeCompare(right.sourceMeta?.sourceEntryUid || '', 'zh-Hans-CN'))
        .map((item) => ({
          title: projectedTitleMap.get(item.documentId) || normalizeDocumentTitle(profile, item, context),
          displayPath: projectedPathMap.get(item.documentId) || item.displayPath,
          summary: extractSemanticSummary(profile, item.content, item.title).slice(0, 120)
        }))
      nextTargetDocuments.push({
        ...document,
        title,
        displayPath: targetPath,
        summary: buildIndexOverview(title, childDocuments),
        content: buildIndexContent(title, childDocuments),
        updatedAt: now
      })
      normalizedDocuments += 1
      continue
    }

    const headingSections = auditItem.actions.includes('进入拆分候选') ? splitIntoSections(profile, document.content) : []
    const sections = headingSections.length >= 2 ? headingSections : splitIntoParagraphChunks(profile, document.content, title)
    const shouldSplit = isRootSource && !hasExistingDescendants && sections.length >= 2
    const baseDocument: BrainDocumentRecord = {
      ...document,
      title,
      displayPath: targetPath,
      updatedAt: now
    }

    if (shouldSplit) {
      const parentBasePath = targetPath.replace(/\.md$/i, '')
      const childDocuments = sections.map((section) => {
        const childTitle = cleanTitleWithProfile(profile, section.title, `${title}分节${section.index}`)
        const childId = buildChildId(document, section)
        const childPath = uniquePath(`${parentBasePath}/${cleanPathSegmentWithProfile(profile, childTitle)}.md`, usedPaths)
        return {
          ...document,
          documentId: childId,
          id: childId,
          stableId: childId,
          title: childTitle,
          displayPath: childPath,
          summary: buildSummary(profile, section.content, childTitle),
          content: buildSectionContent(profile, document, childTitle, section),
          sourceMeta: buildChildSourceMeta(document, section, now),
          sourceDocumentIds: [document.documentId],
          relatedNeuronIds: document.relatedNeuronIds || [],
          createdAt: now,
          updatedAt: now
        } satisfies BrainDocumentRecord
      })
      nextTargetDocuments.push({
        ...baseDocument,
        summary: buildIndexOverview(title, childDocuments.map((child) => ({
          title: child.title,
          displayPath: child.displayPath,
          summary: child.summary || child.title
        }))),
        content: buildIndexContent(title, childDocuments.map((child) => ({
          title: child.title,
          displayPath: child.displayPath,
          summary: child.summary || child.title
        }))),
        sourceDocumentIds: Array.from(new Set([...(document.sourceDocumentIds || []), ...childDocuments.map((child) => child.documentId)])),
        updatedAt: now
      })
      nextTargetDocuments.push(...childDocuments)
      splitParents += 1
      createdChildren += childDocuments.length
      normalizedDocuments += 1 + childDocuments.length
    } else {
      nextTargetDocuments.push({
        ...baseDocument,
        content: buildNormalizedContent(profile, document, title, '已整理'),
        summary: extractSemanticSummary(profile, document.content, title).slice(0, 240),
        updatedAt: now
      })
      normalizedDocuments += 1
    }
  }

  const nonTargetDocuments = documents.filter((document) => !targetIds.has(document.documentId))
  const governedDocuments = applyCompilePages(profile, [...nonTargetDocuments, ...nextTargetDocuments], now)
  return {
    documents: governedDocuments,
    stats: {
      inputDocuments: targetDocuments.length,
      outputDocuments: nextTargetDocuments.length,
      normalizedDocuments,
      splitParents,
      createdChildren
    }
  }
}
