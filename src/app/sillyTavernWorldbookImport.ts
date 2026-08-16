import type {
  BrainDocumentRecord,
  BrainDocumentSourceMeta,
  BrainDocumentType,
  UnitSemanticType,
  SillyTavernWorldbookEntry,
  SillyTavernWorldbookFileInput,
  SillyTavernWorldbookImportDocumentDraft,
  SillyTavernWorldbookImportParseResult,
  SillyTavernWorldbookImportPreview,
  SillyTavernWorldbookImportTreeNode,
  SillyTavernWorldbookImportWarning
} from '../types'

type ImportBuildOptions = {
  importedAt?: string
  existingDocuments?: BrainDocumentRecord[]
}

const PROVIDER = 'sillytavern_worldbook'
const ROOT_TITLE = '亚什基诺'
const ROOT_FILE_BASE_NAME = 'Ashkino亚什基诺'

export function buildSillyTavernWorldbookPreview(
  files: SillyTavernWorldbookFileInput[],
  options: ImportBuildOptions = {}
): SillyTavernWorldbookImportParseResult {
  const safeFiles = Array.isArray(files) ? files : []
  if (!safeFiles.length) {
    return fail('没有找到可导入的 SillyTavern 世界书 JSON。')
  }

  const importedAt = options.importedAt || new Date().toISOString()
  const documents: SillyTavernWorldbookImportDocumentDraft[] = []
  const warnings: SillyTavernWorldbookImportWarning[] = []

  for (const file of safeFiles) {
    const parsed = parseWorldbookFile(file, importedAt)
    if (!parsed.ok) return parsed
    documents.push(...parsed.documents)
    warnings.push(...parsed.warnings)
  }

  const conflicts = collectImportConflicts(documents, options.existingDocuments || [])
  const allWarnings = [...warnings, ...conflicts]
  const preview: SillyTavernWorldbookImportPreview = {
    rootTitle: ROOT_TITLE,
    files: safeFiles.map((file) => normalizeText(file.fileName)).filter(Boolean),
    documents,
    tree: buildPreviewTree(documents),
    warnings: allWarnings,
    conflicts,
    stats: {
      fileCount: safeFiles.length,
      documentCount: documents.length,
      warningCount: allWarnings.length,
      conflictCount: conflicts.length
    }
  }
  return { ok: true, preview }
}

function parseWorldbookFile(file: SillyTavernWorldbookFileInput, importedAt: string):
  | { ok: true; documents: SillyTavernWorldbookImportDocumentDraft[]; warnings: SillyTavernWorldbookImportWarning[] }
  | Extract<SillyTavernWorldbookImportParseResult, { ok: false }> {
  const fileName = normalizeText(file.fileName, '未命名世界书.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(String(file.content || ''))
  } catch (error) {
    return fail(`JSON 语法错误：${(error as Error).message}`, fileName)
  }

  const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  const entries = root.entries && typeof root.entries === 'object' && !Array.isArray(root.entries)
    ? root.entries as Record<string, unknown>
    : null
  if (!entries) return fail('世界书 JSON 缺少 entries 对象。', fileName, 'entries')

  const themeTitle = resolveThemeTitle(fileName)
  const documents: SillyTavernWorldbookImportDocumentDraft[] = []
  const warnings: SillyTavernWorldbookImportWarning[] = []
  const sortedEntries = Object.entries(entries).sort(([left], [right]) => sortEntryKey(left, right))

  sortedEntries.forEach(([entryKey, rawEntry], index) => {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      warnings.push({
        code: 'invalid_entry',
        message: '已跳过不是对象的世界书条目。',
        fileName,
        entryUid: entryKey
      })
      return
    }

    const entry = rawEntry as SillyTavernWorldbookEntry
    const uid = normalizeText(entry.uid ?? entryKey, String(index))
    const title = resolveEntryTitle(entry, uid)
    const content = normalizeText(entry.content)
    const keys = [...toStringArray(entry.key), ...toStringArray(entry.keysecondary)]
    const category = classifyEntry(title, keys, content)
    const displayPath = buildDisplayPath(themeTitle, category.folderTitle, title)
    const sourceMeta = buildSourceMeta(file, entry, uid, entryKey, importedAt)
    const documentType = category.documentType
    const documentId = `stwb_doc_${stableHash(`${sourceMeta.provider}:${sourceMeta.sourceFileName}:${sourceMeta.sourceEntryUid}`)}`

    if (!normalizeText(entry.comment) && keys.length === 0) {
      warnings.push({
        code: 'empty_title',
        message: '条目没有 comment 或 key，已使用 uid 生成临时标题。',
        fileName,
        entryUid: uid,
        displayPath
      })
    }
    if (!content) {
      warnings.push({
        code: 'empty_content',
        message: '条目正文为空，导入预览中会保留空文档。',
        fileName,
        entryUid: uid,
        displayPath
      })
    }

    documents.push({
      documentId,
      id: documentId,
      stableId: documentId,
      title,
      displayPath,
      documentType,
      kind: documentType,
      semanticType: semanticTypeForImportCategory(category.folderTitle, documentType),
      summary: buildSummary(content, title),
      tags: Array.from(new Set([category.folderTitle, ...keys].filter(Boolean))),
      content,
      sourceDocumentIds: [],
      relatedNeuronIds: [],
      sourceMeta,
      versionState: 'confirmed',
      createdAt: importedAt,
      updatedAt: importedAt,
      importCategory: category.folderTitle,
      importThemeTitle: themeTitle || ROOT_TITLE
    })
  })

  return { ok: true, documents, warnings }
}

function buildSourceMeta(
  file: SillyTavernWorldbookFileInput,
  entry: SillyTavernWorldbookEntry,
  uid: string,
  entryKey: string,
  importedAt: string
): BrainDocumentSourceMeta {
  const sourceEntryKey = toStringArray(entry.key)[0] || normalizeText(entry.comment) || entryKey
  return {
    provider: PROVIDER,
    sourceFileName: normalizeText(file.fileName, '未命名世界书.json'),
    sourceFilePath: normalizeText(file.filePath) || undefined,
    sourceEntryUid: uid,
    sourceEntryKey,
    sourceEntryHash: stableHash(`${sourceEntryKey}\n${normalizeText(entry.content)}`),
    importedAt
  }
}

function collectImportConflicts(
  documents: SillyTavernWorldbookImportDocumentDraft[],
  existingDocuments: BrainDocumentRecord[]
): SillyTavernWorldbookImportWarning[] {
  const warnings: SillyTavernWorldbookImportWarning[] = []
  const sourceMap = new Map<string, SillyTavernWorldbookImportDocumentDraft>()
  const pathMap = new Map<string, SillyTavernWorldbookImportDocumentDraft>()

  for (const document of documents) {
    const sourceKey = getSourceConflictKey(document)
    const oldBySource = sourceMap.get(sourceKey)
    if (oldBySource) {
      warnings.push(buildConflictWarning('duplicate_source', document, `与同批条目 ${oldBySource.title} 来源重复。`))
    }
    sourceMap.set(sourceKey, document)

    const oldByPath = pathMap.get(normalizeStandardPath(document.displayPath))
    if (oldByPath) {
      warnings.push(buildConflictWarning('duplicate_display_path', document, `与同批条目 ${oldByPath.title} 路径重复。`))
    }
    pathMap.set(normalizeStandardPath(document.displayPath), document)
  }

  const existingSourceKeys = new Set(existingDocuments.map(getSourceConflictKey).filter(Boolean))
  const existingPaths = new Set(existingDocuments.map((item) => normalizeStandardPath(item.displayPath)).filter(Boolean))
  documents.forEach((document) => {
    if (existingSourceKeys.has(getSourceConflictKey(document))) {
      warnings.push(buildConflictWarning('duplicate_source', document, '已有文档来自同一个世界书条目。'))
    } else if (existingPaths.has(normalizeStandardPath(document.displayPath))) {
      warnings.push(buildConflictWarning('duplicate_display_path', document, '已有文档使用同一个世界树路径。'))
    }
  })

  return warnings
}

function buildConflictWarning(
  code: 'duplicate_source' | 'duplicate_display_path',
  document: SillyTavernWorldbookImportDocumentDraft,
  message: string
): SillyTavernWorldbookImportWarning {
  return {
    code,
    message,
    fileName: document.sourceMeta.sourceFileName,
    entryUid: document.sourceMeta.sourceEntryUid,
    displayPath: document.displayPath
  }
}

function getSourceConflictKey(document: Pick<BrainDocumentRecord, 'sourceMeta' | 'displayPath' | 'title'>): string {
  const meta = document.sourceMeta
  if (meta?.provider && meta?.sourceFileName && meta?.sourceEntryUid) {
    return `${meta.provider}:${meta.sourceFileName}:${meta.sourceEntryUid}`
  }
  return ''
}

function buildPreviewTree(documents: SillyTavernWorldbookImportDocumentDraft[]): SillyTavernWorldbookImportTreeNode[] {
  const root: SillyTavernWorldbookImportTreeNode[] = []
  const folderMap = new Map<string, SillyTavernWorldbookImportTreeNode>()
  const ensureFolder = (segments: string[], fullPath: string): SillyTavernWorldbookImportTreeNode => {
    const key = normalizeStandardPath(fullPath)
    const existing = folderMap.get(key)
    if (existing) return existing
    const node: SillyTavernWorldbookImportTreeNode = {
      id: `folder:${stableHash(key)}`,
      kind: 'folder',
      title: segments[segments.length - 1] || ROOT_TITLE,
      displayPath: key,
      children: []
    }
    folderMap.set(key, node)
    if (segments.length <= 1) {
      root.push(node)
    } else {
      const parentSegments = segments.slice(0, -1)
      const parent = ensureFolder(parentSegments, `/${parentSegments.join('/')}`)
      parent.children.push(node)
    }
    return node
  }

  documents.forEach((document) => {
    const segments = splitPath(document.displayPath)
    const folderSegments = segments.slice(0, -1)
    const parent = ensureFolder(folderSegments, `/${folderSegments.join('/')}`)
    parent.children.push({
      id: `document:${document.documentId}`,
      kind: 'document',
      title: document.title,
      displayPath: document.displayPath,
      documentId: document.documentId,
      children: []
    })
  })

  sortTreeNodes(root)
  return root
}

function sortTreeNodes(nodes: SillyTavernWorldbookImportTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
  nodes.forEach((node) => sortTreeNodes(node.children))
}

function classifyEntry(title: string, keys: string[], content: string): { folderTitle: string; documentType: BrainDocumentType } {
  const text = `${title} ${keys.join(' ')} ${content.slice(0, 160)}`.toLowerCase()
  if (includesAny(text, ['概述', '核心', '世界观背景'])) return { folderTitle: '概述', documentType: 'generic_markdown' }
  if (includesAny(text, ['地理', '平原', '山', '河谷', '地图'])) return { folderTitle: '地理', documentType: 'worldview_place' }
  if (includesAny(text, ['生物', '兽', '文明物种'])) return { folderTitle: '生物', documentType: 'worldview_biology' }
  if (includesAny(text, ['人物', '角色']) || /[·•]/.test(title)) return { folderTitle: '人物', documentType: 'generic_markdown' }
  if (includesAny(text, ['文明', '组织', '帝国', '城邦'])) return { folderTitle: '文明与组织', documentType: 'worldview_organization' }
  return { folderTitle: '条目', documentType: 'generic_markdown' }
}

function semanticTypeForImportCategory(folderTitle: string, documentType: BrainDocumentType): UnitSemanticType {
  if (folderTitle === '地理' || documentType === 'worldview_place') return 'region'
  if (folderTitle === '生物' || documentType === 'worldview_biology') return 'species'
  if (folderTitle === '人物') return 'character'
  if (folderTitle === '文明与组织' || documentType === 'worldview_organization') return 'organization'
  return 'other'
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()))
}

function resolveEntryTitle(entry: SillyTavernWorldbookEntry, uid: string): string {
  return normalizeText(entry.comment)
    || toStringArray(entry.key)[0]
    || toStringArray(entry.keysecondary)[0]
    || `世界书条目-${uid}`
}

function resolveThemeTitle(fileName: string): string {
  const baseName = normalizeText(fileName).replace(/\.json$/i, '')
  if (baseName === ROOT_FILE_BASE_NAME) return ''
  if (baseName.startsWith('Ash')) return baseName.slice(3) || baseName
  return baseName || '未命名世界书'
}

function buildDisplayPath(themeTitle: string, categoryTitle: string, title: string): string {
  const folders = [ROOT_TITLE, themeTitle, categoryTitle].map(cleanPathSegment).filter(Boolean)
  return `/${[...folders, `${cleanPathSegment(title)}.md`].join('/')}`
}

function buildSummary(content: string, fallback: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/[*_`>#-]/g, '').trim())
    .find(Boolean)
  return (firstLine || fallback).slice(0, 120)
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  if (typeof value === 'string') return [value.trim()].filter(Boolean)
  return []
}

function normalizeText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

function cleanPathSegment(value: unknown): string {
  const text = normalizeText(value, '未命名')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || '未命名'
}

function normalizeStandardPath(value: unknown): string {
  const segments = splitPath(String(value || ''))
  return segments.length ? `/${segments.join('/')}` : ''
}

function splitPath(value: string): string[] {
  return String(value || '').split('/').map((segment) => segment.trim()).filter(Boolean)
}

function sortEntryKey(left: string, right: string): number {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return left.localeCompare(right)
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function fail(message: string, fileName = '', path = ''): Extract<SillyTavernWorldbookImportParseResult, { ok: false }> {
  return {
    ok: false,
    error: {
      message,
      fileName: fileName || undefined,
      path: path || undefined
    }
  }
}
