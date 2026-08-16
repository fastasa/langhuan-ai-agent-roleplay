import { normalizeUnitSemanticType } from './unitSemanticTypes'
import type {
  BrainDocumentRecord,
  BrainDocumentType,
  UnitSemanticType,
  WorldDraftContract,
  WorldDraftContractParseResult,
  WorldDraftContractUnit,
  WorldDraftConflictMatchKind,
  WorldDraftImportPreview,
  WorldDraftImportTreeNode,
  WorldDraftMergeResult,
  WorldDraftPreviewUnit,
  WorldDraftResolutionMap
} from '../types'
import { WORLD_DRAFT_FORMAT_VERSION, WORLD_DRAFT_PROVIDER } from '../types/worldDraftImport'

// 世界观导入稿纯逻辑：contract JSON 校验 → 文档草稿 → 冲突预览 → 逐条决议增量合并。
// 契约真值：docs/features/doc-library/世界观导入稿格式.md。
// 与 sillyTavernWorldbookImport.ts 属联动能力（同款合并语义/树预览/哈希），后续若用户要求统一修改，两处同步改。

export function parseWorldDraftContract(input: unknown): WorldDraftContractParseResult {
  const root = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null
  if (!root) return { ok: false, error: '导入稿不是合法的 JSON 对象。' }
  if (Number(root.formatVersion) !== WORLD_DRAFT_FORMAT_VERSION) {
    return { ok: false, error: `不支持的导入稿协议版本：${String(root.formatVersion)}（只认 ${WORLD_DRAFT_FORMAT_VERSION}）。` }
  }
  if (String(root.provider || '') !== WORLD_DRAFT_PROVIDER) {
    return { ok: false, error: `导入稿 provider 不是 ${WORLD_DRAFT_PROVIDER}，不是世界观导入稿。` }
  }
  const world = cleanPathSegment(root.world)
  if (!world || world === '未命名') return { ok: false, error: '导入稿缺少世界观名（world）。' }
  const rawUnits = Array.isArray(root.units) ? root.units : []
  if (!rawUnits.length) return { ok: false, error: '导入稿没有任何单位（units 为空）。' }

  const units: WorldDraftContractUnit[] = []
  const seenPaths = new Set<string>()
  for (let index = 0; index < rawUnits.length; index += 1) {
    const raw = rawUnits[index] && typeof rawUnits[index] === 'object'
      ? rawUnits[index] as Record<string, unknown>
      : null
    if (!raw) return { ok: false, error: `第 ${index + 1} 个单位不是对象。` }
    const path = normalizeUnitPath(raw.path)
    if (!path) return { ok: false, error: `第 ${index + 1} 个单位缺少 path。` }
    const pathKey = path.toLowerCase()
    if (seenPaths.has(pathKey)) return { ok: false, error: `单位路径重复：${path}` }
    seenPaths.add(pathKey)
    units.push({
      path,
      title: String(raw.title || '').trim() || defaultUnitTitle(path, world),
      semanticType: normalizeUnitSemanticType(raw.semanticType),
      summary: String(raw.summary ?? ''),
      tags: toStringArray(raw.tags),
      relationHints: toStringArray(raw.relationHints),
      sourceId: String(raw.sourceId || '').trim() || null,
      content: String(raw.content ?? '')
    })
  }
  return {
    ok: true,
    contract: {
      formatVersion: WORLD_DRAFT_FORMAT_VERSION,
      provider: WORLD_DRAFT_PROVIDER,
      world,
      generatedAt: String(root.generatedAt || '').trim() || undefined,
      units
    }
  }
}

export function buildWorldDraftKey(world: string, unit: Pick<WorldDraftContractUnit, 'path' | 'sourceId'>): string {
  if (unit.sourceId) return `source:${unit.sourceId}`
  return `path:${normalizeStandardPath(`${world}/${unit.path}`)}`
}

export function buildWorldDraftDocumentDraft(
  contract: WorldDraftContract,
  unit: WorldDraftContractUnit,
  importedAt: string
): BrainDocumentRecord {
  const draftKey = buildWorldDraftKey(contract.world, unit)
  const documentId = `wdraft_doc_${stableHash(`${WORLD_DRAFT_PROVIDER}:${contract.world}:${draftKey}`)}`
  const documentType = documentTypeForSemanticType(unit.semanticType)
  const summary = unit.summary.trim() || buildSummaryFromContent(unit.content, unit.title)
  return {
    documentId,
    id: documentId,
    stableId: unit.sourceId || documentId,
    title: unit.title,
    displayPath: normalizeStandardPath(`${contract.world}/${unit.path}`),
    documentType,
    kind: documentType,
    semanticType: unit.semanticType,
    summary,
    tags: unit.tags,
    content: unit.content,
    publicCompilePage: {
      summary,
      tags: unit.tags,
      relationHints: unit.relationHints,
      sourceState: 'manual_confirmed',
      updatedAt: importedAt
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    sourceMeta: {
      provider: WORLD_DRAFT_PROVIDER,
      sourceFileName: unit.path,
      sourceEntryUid: draftKey,
      importedAt
    },
    versionState: 'confirmed',
    createdAt: importedAt,
    updatedAt: importedAt
  }
}

type ExistingMatch = { index: number; matchKind: WorldDraftConflictMatchKind }

function findExistingMatch(
  documents: BrainDocumentRecord[],
  unit: WorldDraftContractUnit,
  draft: BrainDocumentRecord
): ExistingMatch | null {
  // 命中优先级：源ID 直配（库导出再导回）> sourceMeta 同源三键（导入稿重导）> displayPath 相同。
  if (unit.sourceId) {
    const index = documents.findIndex((item) => item.stableId === unit.sourceId || item.documentId === unit.sourceId)
    if (index >= 0) return { index, matchKind: 'source_id' }
  }
  const draftMeta = draft.sourceMeta
  const metaIndex = documents.findIndex((item) => (
    Boolean(item.sourceMeta?.provider)
      && item.sourceMeta?.provider === draftMeta?.provider
      && item.sourceMeta?.sourceFileName === draftMeta?.sourceFileName
      && item.sourceMeta?.sourceEntryUid === draftMeta?.sourceEntryUid
  ))
  if (metaIndex >= 0) return { index: metaIndex, matchKind: 'source_meta' }
  const pathIndex = documents.findIndex((item) => normalizeStandardPath(item.displayPath) === normalizeStandardPath(draft.displayPath))
  if (pathIndex >= 0) return { index: pathIndex, matchKind: 'display_path' }
  return null
}

export function buildWorldDraftPreview(
  contract: WorldDraftContract,
  options: { existingDocuments?: BrainDocumentRecord[]; importedAt?: string } = {}
): WorldDraftImportPreview {
  const importedAt = options.importedAt || new Date().toISOString()
  const existingDocuments = options.existingDocuments || []
  const warnings: string[] = []
  const seenDraftKeys = new Set<string>()
  const units: WorldDraftPreviewUnit[] = []

  for (const unit of contract.units) {
    const draft = buildWorldDraftDocumentDraft(contract, unit, importedAt)
    const draftKey = buildWorldDraftKey(contract.world, unit)
    if (seenDraftKeys.has(draftKey)) {
      warnings.push(`同批内去重键重复（后者以先者结果为基准处理）：${unit.path}`)
    }
    seenDraftKeys.add(draftKey)
    if (!unit.content.trim()) warnings.push(`正文为空：${unit.path}`)

    const match = findExistingMatch(existingDocuments, unit, draft)
    units.push({
      draftKey,
      status: match ? 'conflict' : 'new',
      matchKind: match?.matchKind,
      displayPath: draft.displayPath,
      path: unit.path,
      incoming: {
        title: unit.title,
        semanticType: unit.semanticType,
        summary: draft.summary,
        tags: unit.tags,
        relationHints: unit.relationHints,
        content: unit.content
      },
      existing: match
        ? snapshotExisting(existingDocuments[match.index])
        : undefined
    })
  }

  const conflictCount = units.filter((item) => item.status === 'conflict').length
  return {
    world: contract.world,
    units,
    tree: buildPreviewTree(units, contract.world),
    warnings,
    stats: {
      unitCount: units.length,
      newCount: units.length - conflictCount,
      conflictCount,
      warningCount: warnings.length
    }
  }
}

function snapshotExisting(document: BrainDocumentRecord) {
  const compilePage = document.publicCompilePage
  return {
    documentId: document.documentId || document.id,
    title: document.title,
    semanticType: document.semanticType,
    summary: compilePage?.summary || document.summary || '',
    tags: Array.isArray(compilePage?.tags) && compilePage.tags.length ? compilePage.tags : (document.tags || []),
    relationHints: compilePage?.relationHints || [],
    content: document.content || '',
    updatedAt: document.updatedAt
  }
}

export function mergeWorldDraftDocuments(input: {
  contract: WorldDraftContract
  resolutions?: WorldDraftResolutionMap
  existingDocuments: BrainDocumentRecord[]
  now?: string
}): WorldDraftMergeResult {
  const now = input.now || new Date().toISOString()
  const resolutions = input.resolutions || {}
  const nextDocuments = [...input.existingDocuments]
  const outcomes: WorldDraftMergeResult['outcomes'] = []
  let addedCount = 0
  let overwrittenCount = 0
  let editedCount = 0
  let skippedCount = 0

  for (const unit of input.contract.units) {
    const draft = buildWorldDraftDocumentDraft(input.contract, unit, now)
    const draftKey = buildWorldDraftKey(input.contract.world, unit)
    const match = findExistingMatch(nextDocuments, unit, draft)

    if (!match) {
      nextDocuments.push(draft)
      addedCount += 1
      outcomes.push({ draftKey, displayPath: draft.displayPath, title: draft.title, outcome: 'added' })
      continue
    }

    const resolution = resolutions[draftKey]
    if (!resolution || resolution.action === 'skip') {
      skippedCount += 1
      outcomes.push({ draftKey, displayPath: draft.displayPath, title: draft.title, outcome: 'skipped' })
      continue
    }

    const edited = applyResolutionEdits(draft, resolution)
    const current = nextDocuments[match.index]
    nextDocuments[match.index] = {
      ...edited.draft,
      // 覆盖保库版身份与创建时间，displayPath 也保库版（冲突对象即库里那条，路径不因导入稿移动）
      id: current.id || current.documentId,
      documentId: current.documentId || current.id,
      stableId: current.stableId || edited.draft.stableId,
      displayPath: current.displayPath || edited.draft.displayPath,
      createdAt: current.createdAt || edited.draft.createdAt,
      updatedAt: now,
      sourceMeta: {
        ...edited.draft.sourceMeta!,
        importedAt: current.sourceMeta?.provider === WORLD_DRAFT_PROVIDER
          ? (current.sourceMeta?.importedAt || now)
          : now,
        updatedFromSourceAt: now
      }
    }
    overwrittenCount += 1
    if (edited.hasEdits) editedCount += 1
    outcomes.push({
      draftKey,
      displayPath: nextDocuments[match.index].displayPath,
      title: edited.draft.title,
      outcome: edited.hasEdits ? 'edited_overwritten' : 'overwritten'
    })
  }

  return { nextDocuments, outcomes, addedCount, overwrittenCount, editedCount, skippedCount }
}

function applyResolutionEdits(
  draft: BrainDocumentRecord,
  resolution: { content?: unknown; summary?: unknown; tags?: unknown; relationHints?: unknown }
): { draft: BrainDocumentRecord; hasEdits: boolean } {
  const content = typeof resolution.content === 'string' ? resolution.content : undefined
  const summary = typeof resolution.summary === 'string' ? resolution.summary : undefined
  const tags = Array.isArray(resolution.tags) ? toStringArray(resolution.tags) : undefined
  const relationHints = Array.isArray(resolution.relationHints) ? toStringArray(resolution.relationHints) : undefined
  const hasEdits = content !== undefined || summary !== undefined || tags !== undefined || relationHints !== undefined
  if (!hasEdits) return { draft, hasEdits: false }
  const nextSummary = summary ?? draft.summary
  const nextTags = tags ?? draft.tags
  return {
    hasEdits: true,
    draft: {
      ...draft,
      content: content ?? draft.content,
      summary: nextSummary,
      tags: nextTags,
      publicCompilePage: {
        ...draft.publicCompilePage!,
        summary: nextSummary,
        tags: nextTags,
        relationHints: relationHints ?? draft.publicCompilePage!.relationHints
      }
    }
  }
}

function buildPreviewTree(units: WorldDraftPreviewUnit[], world: string): WorldDraftImportTreeNode[] {
  const root: WorldDraftImportTreeNode[] = []
  const folderMap = new Map<string, WorldDraftImportTreeNode>()
  const ensureFolder = (segments: string[]): WorldDraftImportTreeNode | null => {
    if (!segments.length) return null
    const key = `/${segments.join('/')}`
    const existing = folderMap.get(key)
    if (existing) return existing
    const node: WorldDraftImportTreeNode = {
      id: `folder:${stableHash(key)}`,
      kind: 'folder',
      title: segments[segments.length - 1] || world,
      displayPath: key,
      children: []
    }
    folderMap.set(key, node)
    const parent = ensureFolder(segments.slice(0, -1))
    if (parent) parent.children.push(node)
    else root.push(node)
    return node
  }

  units.forEach((unit) => {
    const segments = unit.displayPath.split('/').map((item) => item.trim()).filter(Boolean)
    const parent = ensureFolder(segments.slice(0, -1))
    const node: WorldDraftImportTreeNode = {
      id: `document:${unit.draftKey}`,
      kind: 'document',
      title: unit.incoming.title,
      displayPath: unit.displayPath,
      children: []
    }
    if (parent) parent.children.push(node)
    else root.push(node)
  })

  sortTreeNodes(root)
  return root
}

function sortTreeNodes(nodes: WorldDraftImportTreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
    return left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
  nodes.forEach((node) => sortTreeNodes(node.children))
}

function documentTypeForSemanticType(semanticType: UnitSemanticType): BrainDocumentType {
  if (semanticType === 'world' || semanticType === 'region' || semanticType === 'terrain' || semanticType === 'settlement') {
    return 'worldview_place'
  }
  if (semanticType === 'organization' || semanticType === 'polity' || semanticType === 'lineage' || semanticType === 'role_identity') {
    return 'worldview_organization'
  }
  if (semanticType === 'species') return 'worldview_biology'
  if (semanticType === 'item' || semanticType === 'resource') return 'worldview_item'
  if (semanticType === 'law_system') return 'worldview_rule'
  return 'generic_markdown'
}

function defaultUnitTitle(path: string, world: string): string {
  const segments = path.split('/').filter(Boolean)
  const fileName = segments[segments.length - 1] || ''
  if (fileName.toLowerCase() === 'index.md') {
    return segments.length <= 1 ? `${world}概览` : `${segments[segments.length - 2]}概览`
  }
  return fileName.replace(/\.md$/i, '') || '未命名'
}

function buildSummaryFromContent(content: string, fallback: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/[*_`>#-]/g, '').trim())
    .find(Boolean)
  return (firstLine || fallback).slice(0, 120)
}

function normalizeUnitPath(value: unknown): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/')
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function cleanPathSegment(value: unknown): string {
  const text = String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || '未命名'
}

function normalizeStandardPath(value: unknown): string {
  const segments = String(value || '').split('/').map((segment) => segment.trim()).filter(Boolean)
  return segments.length ? `/${segments.join('/')}` : ''
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
