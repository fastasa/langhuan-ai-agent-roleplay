import type { UnitView } from '../types/unitView'
import { findPredicateDictionaryMatch } from './relationPredicateDictionary'
import {
  getUnitRelationRefId,
  parseRelationHintReference
} from './relationHintReference'
import { buildUnitTreeJsonPayload, type UnitTreeJsonNode } from './unitTreeJsonExport'

export type CompactRelationCode = `u${number}`
export type CompactRelationPromptVersion = 'v1' | 'v2'

export interface CompactRelationMappingEntry {
  code: CompactRelationCode
  unitId: string
  refId: string
  title: string
}

export interface CompactRelationExportMapping {
  exportId: string
  sourceLabel: string
  createdAt: string
  entries: CompactRelationMappingEntry[]
}

export interface BuildCompactRelationMarkdownInput {
  units: UnitView[]
  rootUnitIds: string[]
  sourceLabel?: string
  exportedAt?: string
  exportId?: string
  promptVersion?: CompactRelationPromptVersion
}

export interface BuildCompactRelationMarkdownResult {
  markdown: string
  mapping: CompactRelationExportMapping
}

export interface ParseCompactRelationMarkdownWarning {
  code: 'missing_export_id' | 'unknown_export_id' | 'invalid_line' | 'unknown_code' | 'invalid_predicate' | 'self_relation'
  line?: string
  message: string
}

export interface ParseCompactRelationMarkdownResult {
  exportId: string
  relationHintsByUnitId: Map<string, string[]>
  warnings: ParseCompactRelationMarkdownWarning[]
}

const COMPACT_CODE_PATTERN = /^u[1-9][0-9]{0,3}$/
const COMPACT_RELATION_LINE_PATTERN = /^(u[1-9][0-9]{0,3})\s+(\S+)\s+(u[1-9][0-9]{0,3})$/
const EXPORT_ID_PATTERN = /^exportId[:：]\s*([A-Za-z0-9_-]+)\s*$/im

export function buildCompactRelationMarkdown(input: BuildCompactRelationMarkdownInput): BuildCompactRelationMarkdownResult {
  const payload = buildUnitTreeJsonPayload(input)
  const nodes = payload.roots.flatMap((root) => flattenTree(root))
    .filter((node) => node.unitType !== 'root')
    .filter((node) => String(node.title || '').trim())
    .slice(0, 9999)
  const sourceLabel = String(input.sourceLabel || payload.sourceLabel || '未命名单位').trim() || '未命名单位'
  const createdAt = input.exportedAt || payload.exportedAt || new Date().toISOString()
  const exportId = normalizeExportId(input.exportId) || createCompactRelationExportId(createdAt)
  const promptVersion = normalizePromptVersion(input.promptVersion)
  const mappingEntries = nodes.map((node, index): CompactRelationMappingEntry => ({
    code: `u${index + 1}` as CompactRelationCode,
    unitId: node.unitId,
    refId: getUnitRelationRefId(node as unknown as UnitView),
    title: String(node.title || '').trim()
  })).filter((entry) => entry.unitId && entry.refId && entry.title)
  const codeByRefKey = buildCodeByRefKey(mappingEntries)
  const codeByUnitId = new Map(mappingEntries.map((entry) => [entry.unitId, entry.code] as const))
  const lines: string[] = [
    '# 琅嬛关系整合材料',
    `exportId: ${exportId}`,
    `promptVersion: ${promptVersion}`,
    '',
    ...buildCompactRelationPromptLines(promptVersion),
    '',
    '## 单位',
  ]

  nodes.forEach((node) => {
    const code = codeByUnitId.get(node.unitId)
    if (!code) return
    lines.push(
      '',
      `${code} ${String(node.title || '').trim()}`,
      formatCompactSummary(node),
      ...formatCompactExistingRelations(node, code, codeByRefKey)
    )
  })

  lines.push(
    '',
    '## 输出要求',
    `只输出下面格式，不要写标题解释之外的多余文字。exportId 必须原样保留为 ${exportId}。`,
    '',
    '# 琅嬛关系整合结果',
    `exportId: ${exportId}`,
    '```text',
    'u源 谓词 u目标',
    '```'
  )

  return {
    markdown: lines.join('\n'),
    mapping: {
      exportId,
      sourceLabel,
      createdAt,
      entries: mappingEntries
    }
  }
}

function buildCompactRelationPromptLines(promptVersion: CompactRelationPromptVersion) {
  return promptVersion === 'v2' ? buildCompactRelationPromptV2Lines() : buildCompactRelationPromptV1Lines()
}

function buildCompactRelationPromptV1Lines() {
  return [
    '## 任务',
    '根据下面的单位摘要和已有关系，补充能让不同目录、不同类型、不同区域的单位互相联动的关系提示。',
    '本材料不是树目录复述任务；树父子结构只用于浏览和排序，不是关系提示证据。',
    '',
    '## 材料格式',
    '每个单位块之间空一行。单位块第一行是“代号 标题”，第二行是摘要，第三行开始是已有关系；没有已有关系时写“无”。',
    '代号只能使用 u1 到 u9999，不能有空格，不能改写，不能新增材料里没有的代号。',
    '摘要如果带有“本页描述”“本页记录”“本文介绍”“该文档说明”等模板口吻，请忽略这种页面指称，只看里面的实体事实。',
    '',
    '## 输出规则',
    '只输出“# 琅嬛关系整合结果”、原样 exportId 和一个 text 代码块，不要写解释、标题列表、单位原名或正式 ID。',
    '关系行只能写三段：源代号 谓词 目标代号。三段之间用一个空格分隔，例如：u2 控制 u5。',
    '谓词不能有空格，只能使用：包含、位于、相邻、源自、控制、活动于、隶属于、敌对、同盟、影响、亲属、信仰、产出、贸易、传承、相关。',
    '不要输出不确定、推测、比喻、泛泛而谈的关系；没有足够证据时宁可少写。',
    '不要重复已有关系，不要输出同义重复或反向重复；同一对单位只保留归一后最有信息量的一条。',
    '不要因为一个单位在另一个单位的目录下面，就输出“父级 包含 子级”或“子级 隶属于 父级”。',
    '只有摘要或已有关系明确表达组成、归属、管辖、地理覆盖等语义时，才允许输出“包含”或“隶属于”。',
    '优先发现跨枝、跨类型、跨区域关系，例如控制、活动于、产出、贸易、信仰、影响、相邻、同盟、敌对。'
  ]
}

function buildCompactRelationPromptV2Lines() {
  return [
    '## 任务',
    '根据下面的单位摘要和已有关系，补充具体、立体、复杂、优美的关系网络，让不同目录、不同类型、不同区域的单位在关系视图中互相照见。',
    '本材料不是树目录复述任务；树父子结构只用于浏览和排序，不是关系提示证据。你的任务是从摘要事实和已有关系中抽取语义网，而不是重写目录。',
    '',
    '## 材料格式',
    '每个单位块之间空一行。单位块第一行是“代号 标题”，第二行是摘要，第三行开始是已有关系；没有已有关系时写“无”。',
    '代号只能使用 u1 到 u9999，不能有空格，不能改写，不能新增材料里没有的代号。',
    '摘要如果带有“本页描述”“本页记录”“本文介绍”“该文档说明”等模板口吻，请忽略这种页面指称，只看里面的实体事实。',
    '代号只是短引用。判断关系时请同时使用代号后的标题和摘要语义，不要因为代号抽象就停止跨块比对。',
    '',
    '## 输出规则',
    '只输出“# 琅嬛关系整合结果”、原样 exportId 和一个 text 代码块，不要写解释、标题列表、单位原名或正式 ID。',
    '关系行只能写三段：源代号 谓词 目标代号。三段之间用一个空格分隔，例如：u2 控制 u5。',
    '谓词不能有空格，只能使用：包含、位于、相邻、源自、控制、活动于、隶属于、敌对、同盟、影响、亲属、信仰、产出、贸易、传承、相关。',
    '不要输出不确定、推测、比喻、泛泛而谈的关系；但摘要中明确出现位置、来源、控制、用途、生产、栖息、威胁、依赖、教育、贸易、信仰、制度归属、生态影响、资源支撑时，必须尽量转成关系。',
    '不要重复已有关系，不要输出同义重复或反向重复；同一对单位只保留归一后最有信息量的一条。',
    '不要因为一个单位在另一个单位的目录下面，就输出“父级 包含 子级”或“子级 隶属于 父级”。',
    '只有摘要或已有关系明确表达组成、归属、管辖、地理覆盖等语义时，才允许输出“包含”或“隶属于”。',
    '',
    '## 扫描步骤',
    '请先在内部逐类审计，不要把审计过程写出来：',
    '1. 地理与地理：大陆、海洋、山脉、盆地、河流、森林、洞窟、气候之间的位于、相邻、源自、影响。',
    '2. 地理与势力：政体、城市、机构、军工、商业、教育系统活动于、控制、影响哪些区域或资源。',
    '3. 资源与势力：木材、石材、矿产、地热、水文、农业空间如何产出、影响或支撑城市、工业、军事、贸易。',
    '4. 生物与区域：生物栖息、活动、威胁、被狩猎、被训练、被医疗或工业利用时，优先写活动于、影响、产出、相关。',
    '5. 制度与人群：教育、考试、学院、大学、委员会、学士等级之间的控制、影响、隶属、传承。',
    '6. 能力与制度：能、司能、肺能、星人、学院、军官、学者、帝国统治之间的影响、传承、相关。',
    '7. 跨海与世界尺度：大陆和海洋之间的相邻、阻隔、航运、贸易、探索风险。',
    '',
    '## 谓词折算',
    '如果你想到的自然语言谓词不在词典里，请折算为最接近的合法谓词：',
    '栖息于、驻扎于、分布于、出现于、发生于 -> 活动于。',
    '支撑、服务、塑造、催生、威胁、污染、促进、限制、依赖 -> 影响。',
    '提供、生产、开采、产材、出产、可提取 -> 产出。',
    '管理、审批、审查、统辖、掌控、垄断 -> 控制。',
    '属于、下设、设在、作为分部、服务某体系 -> 隶属于。',
    '围绕、靠近、夹在、分隔、环绕、毗邻 -> 相邻或位于，按摘要事实选择更精确者。',
    '知识延续、教育培养、研究积累、文化象征 -> 传承或影响，优先选择更具体者。',
    '只在没有更具体谓词时才使用“相关”。',
    '',
    '## 完整度目标',
    '本任务追求高质量关系网，不追求极少量安全样例。对于几十个单位的材料，如果证据充足，通常应输出数十条关系；少于 30 条前，请在内部复查是否漏掉地理、资源、生物、制度、势力之间的明显跨枝关系。',
    '不要为了凑数量编造关系；但不要因为关系是中层、间接、跨类型就放弃。摘要明确说 A 影响、提供、位于、控制、服务、栖息、来源于 B 时，应当输出。'
  ]
}

export function parseCompactRelationMarkdown(
  input: string,
  mapping: CompactRelationExportMapping | null | undefined
): ParseCompactRelationMarkdownResult {
  const text = String(input || '').replace(/\r\n/g, '\n').trim()
  const exportId = normalizeExportId(text.match(EXPORT_ID_PATTERN)?.[1] || '')
  const warnings: ParseCompactRelationMarkdownWarning[] = []
  if (!exportId) {
    warnings.push({ code: 'missing_export_id', message: '关系整合 Markdown 缺少 exportId。' })
  }
  if (!mapping || normalizeExportId(mapping.exportId) !== exportId) {
    warnings.push({ code: 'unknown_export_id', message: '没有找到本次导出批次映射，不能还原短代号。' })
    return { exportId, relationHintsByUnitId: new Map(), warnings }
  }

  const entryByCode = new Map(mapping.entries.map((entry) => [entry.code, entry] as const))
  const relationHintsByUnitId = new Map<string, string[]>()
  collectCompactRelationLines(text).forEach((rawLine) => {
    const line = normalizeCompactRelationLine(rawLine)
    const match = line.match(COMPACT_RELATION_LINE_PATTERN)
    if (!match) {
      if (/^(?:[-*]\s*)?u[0-9]/.test(rawLine)) {
        warnings.push({ code: 'invalid_line', line: rawLine, message: `关系行格式无效：${rawLine}` })
      }
      return
    }
    const sourceCode = match[1] as CompactRelationCode
    const predicate = match[2]
    const targetCode = match[3] as CompactRelationCode
    const source = entryByCode.get(sourceCode)
    const target = entryByCode.get(targetCode)
    if (!source || !target) {
      warnings.push({ code: 'unknown_code', line, message: `关系行使用了不存在的代号：${line}` })
      return
    }
    if (source.code === target.code) {
      warnings.push({ code: 'self_relation', line, message: `关系行不能指向自身：${line}` })
      return
    }
    if (!findPredicateDictionaryMatch(predicate)) {
      warnings.push({ code: 'invalid_predicate', line, message: `关系行使用了非法谓词：${predicate}` })
      return
    }
    const hint = `${formatCompactRelationEndpoint(source)}_${predicate}_${formatCompactRelationEndpoint(target)}`
    const list = relationHintsByUnitId.get(source.unitId) || []
    if (!list.includes(hint)) list.push(hint)
    relationHintsByUnitId.set(source.unitId, list)
  })

  return { exportId, relationHintsByUnitId, warnings }
}

export function saveCompactRelationExportMapping(mapping: CompactRelationExportMapping) {
  const storage = getBrowserStorage()
  if (!storage) return
  const all = readCompactRelationExportMappings()
    .filter((item) => item.exportId !== mapping.exportId)
  all.unshift(mapping)
  storage.setItem(getCompactRelationStorageKey(), JSON.stringify(all.slice(0, 20)))
}

export function loadCompactRelationExportMapping(exportId: string): CompactRelationExportMapping | null {
  const normalized = normalizeExportId(exportId)
  if (!normalized) return null
  return readCompactRelationExportMappings().find((item) => item.exportId === normalized) || null
}

export function readCompactRelationExportMappings(): CompactRelationExportMapping[] {
  const storage = getBrowserStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(getCompactRelationStorageKey()) || '[]')
    return Array.isArray(parsed) ? parsed.map(normalizeMapping).filter(Boolean) as CompactRelationExportMapping[] : []
  } catch {
    return []
  }
}

export function extractCompactRelationExportId(input: string): string {
  return normalizeExportId(String(input || '').match(EXPORT_ID_PATTERN)?.[1] || '')
}

function normalizeMapping(value: unknown): CompactRelationExportMapping | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as CompactRelationExportMapping
  const exportId = normalizeExportId(raw.exportId)
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry) => ({
        code: normalizeCompactCode(entry.code) as CompactRelationCode,
        unitId: String(entry.unitId || '').trim(),
        refId: String(entry.refId || '').trim(),
        title: String(entry.title || '').trim()
      })).filter((entry) => entry.code && entry.unitId && entry.refId && entry.title)
    : []
  if (!exportId || !entries.length) return null
  return {
    exportId,
    sourceLabel: String(raw.sourceLabel || '').trim(),
    createdAt: String(raw.createdAt || '').trim(),
    entries
  }
}

function collectCompactRelationLines(text: string) {
  const fenceMatches = Array.from(text.matchAll(/```(?:text)?\n([\s\S]*?)```/g))
  const source = fenceMatches.length ? fenceMatches.map((match) => match[1]).join('\n') : text
  return source.split('\n').map((line) => line.trim()).filter(Boolean)
}

function normalizeCompactRelationLine(line: string) {
  return String(line || '')
    .trim()
    .replace(/^(?:[-*]\s+|[0-9]+[.)、]\s*)/, '')
    .replace(/[。；;，,]$/, '')
    .trim()
}

function formatCompactRelationEndpoint(entry: CompactRelationMappingEntry) {
  return `[[${entry.title}@${entry.refId}]]`
}

function formatCompactSummary(node: UnitTreeJsonNode) {
  const summary = String(node.compilePage?.summary || '').replace(/\s+/g, ' ').trim()
  if (summary) return summary
  const body = String(node.body || '').replace(/\s+/g, ' ').trim()
  return body ? body.slice(0, 240) : '无摘要'
}

function formatCompactExistingRelations(
  node: UnitTreeJsonNode,
  currentCode: CompactRelationCode,
  codeByRefKey: Map<string, CompactRelationCode>
) {
  const hints = Array.isArray(node.compilePage?.relationHints) ? node.compilePage.relationHints : []
  const lines = hints
    .map((hint) => formatCompactExistingRelationHint(String(hint || '').trim(), currentCode, codeByRefKey))
    .filter(Boolean) as string[]
  return lines.length ? Array.from(new Set(lines)) : ['无']
}

function formatCompactExistingRelationHint(
  hint: string,
  currentCode: CompactRelationCode,
  codeByRefKey: Map<string, CompactRelationCode>
) {
  if (!hint) return ''
  const strong = hint.match(/^\[\[(.+?)\]\]_(.+?)_\[\[(.+?)\]\]$/)
  if (strong) {
    const sourceCode = resolveCodeForReference(strong[1], codeByRefKey)
    const targetCode = resolveCodeForReference(strong[3], codeByRefKey)
    const predicate = String(strong[2] || '').trim()
    if (!sourceCode || !targetCode || !predicate) return ''
    return `${sourceCode} ${predicate} ${targetCode}`
  }
  const weak = hint.match(/^\[\[(.+?)\]\]$/)
  if (weak) {
    const targetCode = resolveCodeForReference(weak[1], codeByRefKey)
    if (!targetCode) return ''
    return `${currentCode} 相关 ${targetCode}`
  }
  return ''
}

function resolveCodeForReference(input: string, codeByRefKey: Map<string, CompactRelationCode>) {
  const reference = parseRelationHintReference(input)
  if (reference.refId) {
    const byRef = codeByRefKey.get(`ref:${reference.refId}`)
    if (byRef) return byRef
  }
  return codeByRefKey.get(`title:${reference.title}`) || ''
}

function buildCodeByRefKey(entries: CompactRelationMappingEntry[]) {
  const map = new Map<string, CompactRelationCode>()
  const titleCounts = new Map<string, number>()
  entries.forEach((entry) => {
    titleCounts.set(entry.title, (titleCounts.get(entry.title) || 0) + 1)
  })
  entries.forEach((entry) => {
    map.set(`ref:${entry.refId}`, entry.code)
    if (titleCounts.get(entry.title) === 1) map.set(`title:${entry.title}`, entry.code)
  })
  return map
}

function flattenTree(node: UnitTreeJsonNode): UnitTreeJsonNode[] {
  return [node, ...node.children.flatMap((child) => flattenTree(child))]
}

function createCompactRelationExportId(createdAt: string) {
  const stamp = String(createdAt || new Date().toISOString())
    .replace(/[^0-9A-Za-z]/g, '')
    .slice(0, 14)
  return `rel-${stamp || Date.now().toString(36)}`
}

function normalizeExportId(value: unknown) {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '')
}

function normalizeCompactCode(value: unknown) {
  const code = String(value || '').trim()
  return COMPACT_CODE_PATTERN.test(code) ? code : ''
}

function normalizePromptVersion(value: unknown): CompactRelationPromptVersion {
  return value === 'v2' ? 'v2' : 'v1'
}

function getCompactRelationStorageKey() {
  return 'langhuan:compact-relation-export-mappings'
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage || null
  } catch {
    return null
  }
}
