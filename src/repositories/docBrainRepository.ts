import { API } from '../config/api'
import { normalizeRelationSystemState } from '../app/relationSystem'
import { normalizeDocLibraryV1ToV2 } from '../app/docLibraryTreeMigration'
import { buildDocLibraryTreeDiffReport } from '../app/docLibraryTreeDiffReport'
import { normalizeUnitSemanticType } from '../app/unitSemanticTypes'
import type {
  BrainCompileSourceState,
  BrainDocumentType,
  BrainDocumentRecord,
  BrainDocumentSourceMeta,
  DocLibraryStateSnapshot,
  BrainPublicCompilePage,
  BrainNeuronKind,
  BrainNeuronRecord,
  BrainRecallCandidateCard,
  BrainVersionState,
  SillyTavernWorldbookApplyResult,
  SillyTavernWorldbookImportConflictStrategy,
  SillyTavernWorldbookImportPreview,
  WorldDraftApplyResult,
  WorldDraftImportPreview,
  WorldDraftResolutionMap,
  CharacterBrainPathPrefix,
  Character,
  CharacterGroup,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders,
  ServerData
} from '../types'

export interface ResolvedDocBrainState {
  documents: BrainDocumentRecord[]
  brainNeurons: BrainNeuronRecord[]
  hasDocuments: boolean
  hasBrainNeurons: boolean
}

export interface DocBrainStateTarget {
  documents: { value: BrainDocumentRecord[] }
  brainNeurons: { value: BrainNeuronRecord[] }
}

export interface DocBrainSnapshotPayload {
  documents?: ServerData['documents']
  documentTreeOrders?: ServerData['documentTreeOrders']
  brainNeurons?: ServerData['brainNeurons']
}

const DEFAULT_DOCUMENT_TYPE: BrainDocumentType = 'generic_markdown'
const DEFAULT_NEURON_KIND: BrainNeuronKind = 'public_reference'
const DEFAULT_VERSION_STATE: BrainVersionState = 'pending'
const DEFAULT_COMPILE_SOURCE_STATE: BrainCompileSourceState = 'needs_review'
let docLibraryStateCache: DocLibraryStateSnapshot | null = null
let docLibraryStateRequest: Promise<DocLibraryStateSnapshot> | null = null
let docLibraryStateCacheVersion = 0

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function toTextOrFallback(value: unknown, fallback = ''): string {
  const normalized = toText(value, '').trim()
  return normalized || fallback
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [trimmed]
    } catch {
      return [trimmed]
    }
  }
  return []
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      const parsed = JSON.parse(trimmed)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function toSourceMeta(value: unknown): BrainDocumentSourceMeta | undefined {
  const record = toRecord(value)
  if (!record) return undefined
  const provider = toText(record.provider).trim()
  const sourceFileName = toText(record.sourceFileName ?? record.source_file_name).trim()
  if (!provider || !sourceFileName) return undefined
  return {
    provider,
    sourceFileName,
    sourceFilePath: toText(record.sourceFilePath ?? record.source_file_path).trim() || undefined,
    sourceEntryUid: toText(record.sourceEntryUid ?? record.source_entry_uid).trim() || undefined,
    sourceEntryKey: toText(record.sourceEntryKey ?? record.source_entry_key).trim() || undefined,
    sourceEntryHash: toText(record.sourceEntryHash ?? record.source_entry_hash).trim() || undefined,
    importedAt: toText(record.importedAt ?? record.imported_at).trim() || new Date().toISOString(),
    updatedFromSourceAt: toText(record.updatedFromSourceAt ?? record.updated_from_source_at).trim() || undefined
  }
}

function toCompileSourceState(value: unknown): BrainCompileSourceState {
  const raw = String(value || '').trim()
  if (raw === 'manual_confirmed' || raw === 'ai_pending' || raw === 'needs_review') return raw
  return DEFAULT_COMPILE_SOURCE_STATE
}

export function normalizeBrainPublicCompilePage(input: unknown, fallback: {
  summary: string
  tags: string[]
  updatedAt: string
}): BrainPublicCompilePage {
  const record = toRecord(input) || {}
  const summary = toText(record.summary, fallback.summary)
  const explicitTags = toStringArray(record.tags)
  return {
    summary,
    tags: explicitTags.length ? explicitTags : fallback.tags,
    relationHints: toStringArray(record.relationHints ?? record.relation_hints),
    sourceState: toCompileSourceState(record.sourceState ?? record.source_state),
    updatedAt: buildTimestamp(record.updatedAt ?? record.updated_at ?? fallback.updatedAt)
  }
}

function toDocumentType(value: unknown): BrainDocumentType {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_DOCUMENT_TYPE
  return raw as BrainDocumentType
}

function toNeuronKind(value: unknown): BrainNeuronKind {
  const raw = String(value || '').trim()
  if (!raw) return DEFAULT_NEURON_KIND
  return raw as BrainNeuronKind
}

function toVersionState(value: unknown): BrainVersionState {
  return String(value || '').trim() === 'confirmed' ? 'confirmed' : DEFAULT_VERSION_STATE
}

function buildTimestamp(value: unknown): string {
  const text = String(value || '').trim()
  return text || new Date().toISOString()
}

export function normalizeBrainDocumentRecord(input: unknown, index = 0): BrainDocumentRecord {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const createdAt = buildTimestamp(record.createdAt ?? record.created_at)
  const updatedAt = buildTimestamp(record.updatedAt ?? record.updated_at ?? createdAt)
  const documentId = toTextOrFallback(
    record.documentId ?? record.document_id ?? record.id ?? record.stableId ?? record.stable_id,
    `document_${index}`
  )
  const stableId = toTextOrFallback(record.stableId ?? record.stable_id ?? documentId, documentId)
  const documentType = toDocumentType(
    record.documentType ?? record.document_type ?? record.kind ?? record.documentKind ?? record.document_kind
  )
  const summary = toText(record.summary, '')
  const tags = toStringArray(record.tags)

  return {
    documentId,
    id: documentId,
    stableId,
    title: toText(record.title, '未命名文档'),
    displayPath: toText(record.displayPath ?? record.display_path, '/未分类/未命名.md'),
    documentType,
    kind: documentType,
    semanticType: normalizeUnitSemanticType(record.semanticType ?? record.semantic_type),
    summary,
    tags,
    content: toText(record.content, ''),
    publicCompilePage: normalizeBrainPublicCompilePage(record.publicCompilePage ?? record.public_compile_page, {
      summary,
      tags,
      updatedAt
    }),
    sourceDocumentIds: toStringArray(record.sourceDocumentIds ?? record.source_document_ids),
    relatedNeuronIds: toStringArray(record.relatedNeuronIds ?? record.related_neuron_ids),
    sourceMeta: toSourceMeta(record.sourceMeta ?? record.source_meta),
    versionState: toVersionState(record.versionState ?? record.version_state),
    createdAt,
    updatedAt
  }
}

export function normalizeBrainDocumentRecords(records: unknown[]): BrainDocumentRecord[] {
  return (Array.isArray(records) ? records : []).map((item, index) => normalizeBrainDocumentRecord(item, index))
}

export function normalizeBrainNeuronRecord(input: unknown, index = 0): BrainNeuronRecord {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const createdAt = buildTimestamp(record.createdAt ?? record.created_at)
  const updatedAt = buildTimestamp(record.updatedAt ?? record.updated_at ?? createdAt)

  return {
    brainNeuronId: toText(record.brainNeuronId ?? record.brain_neuron_id, `brain_neuron_${index}`),
    neuronKind: toNeuronKind(record.neuronKind ?? record.neuron_kind),
    displayPath: toText(record.displayPath ?? record.display_path, '/未分类/未命名神经元.md'),
    title: toText(record.title, '未命名神经元'),
    summary: toText(record.summary, ''),
    tags: toStringArray(record.tags),
    sourceDocumentIds: toStringArray(record.sourceDocumentIds ?? record.source_document_ids),
    relatedNeuronIds: toStringArray(record.relatedNeuronIds ?? record.related_neuron_ids),
    content: toText(record.content, ''),
    versionState: toVersionState(record.versionState ?? record.version_state),
    createdAt,
    updatedAt
  }
}

export function normalizeBrainNeuronRecords(records: unknown[]): BrainNeuronRecord[] {
  return (Array.isArray(records) ? records : []).map((item, index) => normalizeBrainNeuronRecord(item, index))
}

export function resolveDocBrainState(input: unknown): ResolvedDocBrainState {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const rawDocuments = Array.isArray(data.documents) ? data.documents : []
  const rawBrainNeurons = Array.isArray(data.brainNeurons) ? data.brainNeurons : []

  return {
    documents: normalizeBrainDocumentRecords(rawDocuments),
    brainNeurons: normalizeBrainNeuronRecords(rawBrainNeurons),
    hasDocuments: Array.isArray(data.documents),
    hasBrainNeurons: Array.isArray(data.brainNeurons)
  }
}

export function applyResolvedDocBrainState(target: DocBrainStateTarget, resolved: ResolvedDocBrainState): void {
  if (resolved.hasDocuments) {
    target.documents.value = resolved.documents
  }
  if (resolved.hasBrainNeurons) {
    target.brainNeurons.value = resolved.brainNeurons
  }
}

export function extractDocBrainSnapshotPayload(data: ServerData | DocBrainSnapshotPayload): DocBrainSnapshotPayload {
  const root = data && typeof data === 'object' ? data : {}
  return {
    documents: Array.isArray(root.documents) ? root.documents : [],
    documentTreeOrders: root.documentTreeOrders && typeof root.documentTreeOrders === 'object'
      ? root.documentTreeOrders as Record<string, string[]>
      : {},
    brainNeurons: Array.isArray(root.brainNeurons) ? root.brainNeurons : []
  }
}

export function createBrainRecallCandidateCard(record: BrainNeuronRecord): BrainRecallCandidateCard {
  return {
    id: record.brainNeuronId,
    k: record.neuronKind,
    p: record.displayPath,
    t: record.title,
    s: record.summary,
    tags: Array.isArray(record.tags) ? record.tags : [],
    u: record.updatedAt,
    src: Array.isArray(record.sourceDocumentIds) ? record.sourceDocumentIds : [],
    relationHints: [],
    relatedNodeIds: Array.isArray(record.relatedNeuronIds) ? record.relatedNeuronIds : [],
    isRecallable: true
  }
}

export function buildBrainRecallCandidateCards(records: BrainNeuronRecord[]): BrainRecallCandidateCard[] {
  return (Array.isArray(records) ? records : [])
    .map((record) => createBrainRecallCandidateCard(record))
    .sort((left, right) => String(right.u || '').localeCompare(String(left.u || '')))
}

export function createDocumentCompileCandidateCard(record: BrainDocumentRecord): BrainRecallCandidateCard {
  const compilePage = record.publicCompilePage || normalizeBrainPublicCompilePage(undefined, {
    summary: record.summary,
    tags: record.tags,
    updatedAt: record.updatedAt
  })
  return {
    id: `compile:${record.documentId}`,
    k: 'public_compile_page',
    p: record.displayPath,
    t: record.title,
    s: compilePage.summary || record.summary,
    tags: Array.from(new Set([...(record.tags || []), ...(compilePage.tags || [])])),
    u: compilePage.updatedAt || record.updatedAt,
    src: [record.documentId],
    relationHints: record.publicCompilePage?.relationHints || [],
    relatedNodeIds: record.relatedNeuronIds || [],
    isRecallable: true
  }
}

export function buildDocumentCompileCandidateCards(records: BrainDocumentRecord[]): BrainRecallCandidateCard[] {
  return (Array.isArray(records) ? records : [])
    .map((record) => createDocumentCompileCandidateCard(record))
    .sort((left, right) => String(right.u || '').localeCompare(String(left.u || '')))
}

function resolveCharacterGroupId(character: Character | null | undefined): string {
  return String(character?.groupId ?? character?.group_id ?? '').trim()
}

function resolveCharacterGroupParentId(group: CharacterGroup | null | undefined): string {
  const parentRecord = group as (CharacterGroup & { parentId?: string; parent_id?: string }) | null | undefined
  return String(parentRecord?.parentId ?? parentRecord?.parent_id ?? '').trim()
}

export function buildCharacterGroupChain(
  groupId: string,
  characterGroups: CharacterGroup[] = []
): string[] {
  const normalizedGroupId = String(groupId || '').trim()
  if (!normalizedGroupId || normalizedGroupId === 'default') return ['未分组']

  const groupMap = new Map(
    (Array.isArray(characterGroups) ? characterGroups : [])
      .map((item) => [String(item?.id || '').trim(), item] as const)
      .filter(([id]) => Boolean(id))
  )
  const visited = new Set<string>()
  const chain: string[] = []
  let currentId = normalizedGroupId

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const currentGroup = groupMap.get(currentId)
    if (!currentGroup) break

    const currentName = String(currentGroup.name || '').trim()
    if (currentName && currentId !== 'default') {
      chain.unshift(currentName)
    }

    const parentId = resolveCharacterGroupParentId(currentGroup)
    if (!parentId || parentId === currentId || parentId === 'default') {
      break
    }
    currentId = parentId
  }

  return chain.length > 0 ? chain : ['未分组']
}

export function buildCharacterBrainPathPrefix(
  character: Character | null | undefined,
  characterGroups: CharacterGroup[] = []
): CharacterBrainPathPrefix | null {
  if (!character?.id) return null

  const groupId = resolveCharacterGroupId(character)
  const characterName = String(character.name || '').trim() || '未命名角色'
  const groupChain = buildCharacterGroupChain(groupId, characterGroups)

  return {
    characterId: String(character.id),
    characterName,
    groupChain,
    displayPrefix: `/${groupChain.join('/')}/${characterName}`
  }
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(fallbackMessage)
  }
  return await response.json() as T
}

async function sendJson(url: string, method: string, body: unknown, fallbackMessage: string): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = typeof payload?.error === 'string' ? payload.error : ''
    } catch {
      detail = ''
    }
    throw new Error(detail ? `${fallbackMessage}：${detail}` : fallbackMessage)
  }
}

function normalizeManualTreeOrders(input: unknown): Record<string, string[]> {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : []
      ])
      .filter(([key]) => Boolean(key))
  )
}

function normalizeDocTreeNodes(input: unknown): DocTreeNodeRecord[] {
  return Array.isArray(input)
    ? input
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as DocTreeNodeRecord)
    : []
}

function normalizeDocTreeOrders(input: unknown): DocTreeOrders {
  return normalizeManualTreeOrders(input)
}

function normalizeDocLibrarySchemaVersion(input: unknown) {
  return Number(input) === 2 ? 2 : 1
}

function normalizeDocLibraryTreeDiffReport(input: unknown): DocLibraryTreeDiffReport | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const blockerCount = Number(record.blockerCount || 0)
  const warningCount = Number(record.warningCount || 0)
  return {
    generatedAt: toText(record.generatedAt, new Date().toISOString()),
    treeSource: record.treeSource === 'field' ? 'field' : 'path',
    blockerCount,
    warningCount,
    documentPathMismatchCount: Number(record.documentPathMismatchCount || 0),
    manualOrderMismatchCount: Number(record.manualOrderMismatchCount || 0),
    missingDocumentNodeCount: Number(record.missingDocumentNodeCount || 0),
    extraDocumentNodeCount: Number(record.extraDocumentNodeCount || 0),
    issues: Array.isArray(record.issues)
      ? record.issues
        .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : null)
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          severity: item.severity === 'warning' ? 'warning' as const : 'blocker' as const,
          code: toText(item.code),
          message: toText(item.message),
          documentId: toText(item.documentId).trim() || undefined,
          bucketId: toText(item.bucketId).trim() || undefined,
          expected: toText(item.expected).trim() || undefined,
          actual: toText(item.actual).trim() || undefined
        }))
        .filter((item) => item.code && item.message)
      : [],
    canUseFieldTree: record.canUseFieldTree === true || blockerCount === 0
  }
}

function normalizeDocLibraryPayload(payload: Record<string, unknown>): DocLibraryStateSnapshot {
  const baseState: DocLibraryStateSnapshot = {
    schemaVersion: normalizeDocLibrarySchemaVersion(payload.schemaVersion),
    documents: Array.isArray(payload.documents)
      ? payload.documents.map((item, index) => normalizeBrainDocumentRecord(item, index))
      : [],
    manualTreeOrders: normalizeManualTreeOrders(payload.manualTreeOrders),
    relationSystemState: normalizeRelationSystemState(payload.relationSystemState)
  }
  const treeNodes = normalizeDocTreeNodes(payload.treeNodes)
  const treeOrders = normalizeDocTreeOrders(payload.treeOrders)
  if (baseState.schemaVersion === 2 && treeNodes.length > 0) {
    const normalizedTreeOrders = treeOrders
    return {
      ...baseState,
      treeNodes,
      treeOrders: normalizedTreeOrders,
      treeMigrationMeta: payload.treeMigrationMeta && typeof payload.treeMigrationMeta === 'object'
        ? payload.treeMigrationMeta as DocLibraryStateSnapshot['treeMigrationMeta']
        : undefined,
      treeDiffReport: normalizeDocLibraryTreeDiffReport(payload.treeDiffReport) || buildDocLibraryTreeDiffReport({
        documents: baseState.documents,
        manualTreeOrders: baseState.manualTreeOrders,
        treeNodes,
        treeOrders: normalizedTreeOrders,
        treeSource: 'field'
      })
    }
  }
  try {
    const normalized = normalizeDocLibraryV1ToV2(baseState)
    return {
      ...normalized,
      treeDiffReport: buildDocLibraryTreeDiffReport({
        documents: normalized.documents,
        manualTreeOrders: normalized.manualTreeOrders,
        treeNodes: normalized.treeNodes,
        treeOrders: normalized.treeOrders,
        treeSource: 'path'
      })
    }
  } catch (error) {
    return {
      ...baseState,
      schemaVersion: 1,
      treeNodes: [],
      treeOrders: {},
      treeMigrationMeta: {
        treeSource: 'path',
        generatedAt: new Date().toISOString(),
        hasBlockingIssues: true,
        auditReportPath: `client-normalize-error:${(error as Error).message}`
      },
      treeDiffReport: normalizeDocLibraryTreeDiffReport({
        treeSource: 'path',
        blockerCount: 1,
        warningCount: 0,
        issues: [{
          severity: 'blocker',
          code: 'client_normalize_failed',
          message: (error as Error).message
        }],
        canUseFieldTree: false
      })
    }
  }
}

function cloneDocLibraryStateSnapshot(snapshot: DocLibraryStateSnapshot): DocLibraryStateSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DocLibraryStateSnapshot
}

export async function fetchDocLibraryState(options: { force?: boolean } = {}): Promise<DocLibraryStateSnapshot> {
  if (!options.force && docLibraryStateCache) {
    return cloneDocLibraryStateSnapshot(docLibraryStateCache)
  }
  if (!options.force && docLibraryStateRequest) {
    return cloneDocLibraryStateSnapshot(await docLibraryStateRequest)
  }
  const requestCacheVersion = docLibraryStateCacheVersion
  docLibraryStateRequest = (async () => {
    const response = await fetch(API.DOC_LIBRARY)
    const payload = await readJson<Record<string, unknown>>(response, '加载文档库失败')
    const normalized = normalizeDocLibraryPayload(payload)
    if (requestCacheVersion === docLibraryStateCacheVersion) {
      docLibraryStateCache = cloneDocLibraryStateSnapshot(normalized)
    }
    return normalized
  })()
  try {
    return cloneDocLibraryStateSnapshot(await docLibraryStateRequest)
  } finally {
    docLibraryStateRequest = null
  }
}

export async function prefetchDocLibraryState(): Promise<void> {
  await fetchDocLibraryState().then(() => undefined)
}

export function invalidateDocLibraryStateCache(): void {
  docLibraryStateCacheVersion += 1
  docLibraryStateCache = null
}

export async function saveDocLibraryState(payload: DocLibraryStateSnapshot): Promise<void> {
  let normalizedPayload = payload.schemaVersion === 2 && Array.isArray(payload.treeNodes)
    ? payload
    : payload
  if (normalizedPayload.schemaVersion !== 2 || !Array.isArray(normalizedPayload.treeNodes)) {
    normalizedPayload = normalizeDocLibraryV1ToV2(payload)
    normalizedPayload = {
      ...normalizedPayload,
      treeDiffReport: buildDocLibraryTreeDiffReport({
        documents: normalizedPayload.documents,
        manualTreeOrders: normalizedPayload.manualTreeOrders,
        treeNodes: normalizedPayload.treeNodes,
        treeOrders: normalizedPayload.treeOrders,
        treeSource: 'path'
      })
    }
  } else if (!normalizedPayload.treeDiffReport) {
    normalizedPayload = {
      ...normalizedPayload,
      treeDiffReport: buildDocLibraryTreeDiffReport({
        documents: normalizedPayload.documents,
        manualTreeOrders: normalizedPayload.manualTreeOrders,
        treeNodes: normalizedPayload.treeNodes,
        treeOrders: normalizedPayload.treeOrders || {},
        treeSource: 'field'
      })
    }
  }
  const blockerCount = Number(normalizedPayload.treeDiffReport?.blockerCount || 0)
  if (normalizedPayload.schemaVersion !== 2 || !Array.isArray(normalizedPayload.treeNodes) || blockerCount > 0) {
    const issue = normalizedPayload.treeDiffReport?.issues?.[0]
    throw new Error(`文档库保存被字段树护栏拒绝：${issue?.message || '字段树差异报告存在阻断项'}`)
  }
  await sendJson(API.DOC_LIBRARY, 'PUT', {
    schemaVersion: normalizeDocLibrarySchemaVersion(normalizedPayload.schemaVersion),
    documents: Array.isArray(normalizedPayload.documents) ? normalizedPayload.documents : [],
    manualTreeOrders: normalizeManualTreeOrders(normalizedPayload.manualTreeOrders),
    treeNodes: normalizeDocTreeNodes(normalizedPayload.treeNodes),
    treeOrders: normalizeDocTreeOrders(normalizedPayload.treeOrders),
    treeMigrationMeta: normalizedPayload.treeMigrationMeta,
    treeDiffReport: normalizedPayload.treeDiffReport,
    relationSystemState: normalizeRelationSystemState(normalizedPayload.relationSystemState)
  }, '保存文档库失败')
  docLibraryStateCacheVersion += 1
  docLibraryStateCache = cloneDocLibraryStateSnapshot(normalizedPayload)
}

export async function previewSillyTavernWorldbookImport(): Promise<SillyTavernWorldbookImportPreview> {
  const response = await fetch(API.SILLYTAVERN_WORLDBOOK_PREVIEW, { method: 'POST' })
  return await readJson<SillyTavernWorldbookImportPreview>(response, '预览 SillyTavern 世界书失败')
}

export async function applySillyTavernWorldbookImport(
  conflictStrategy: SillyTavernWorldbookImportConflictStrategy = 'skip'
): Promise<SillyTavernWorldbookApplyResult> {
  const response = await fetch(API.SILLYTAVERN_WORLDBOOK_APPLY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conflictStrategy })
  })
  const result = await readJson<SillyTavernWorldbookApplyResult>(response, '导入 SillyTavern 世界书失败')
  invalidateDocLibraryStateCache()
  return result
}

async function postWorldDraftJson<T>(url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = typeof payload?.error === 'string' ? payload.error : ''
    } catch {
      detail = ''
    }
    throw new Error(detail ? `${fallbackMessage}：${detail}` : fallbackMessage)
  }
  return await response.json() as T
}

export async function previewWorldDraftImport(contract: unknown): Promise<WorldDraftImportPreview> {
  return await postWorldDraftJson<WorldDraftImportPreview>(
    API.WORLD_DRAFT_IMPORT_PREVIEW,
    { contract },
    '预览世界观导入稿失败'
  )
}

export async function applyWorldDraftImport(
  contract: unknown,
  resolutions: WorldDraftResolutionMap
): Promise<WorldDraftApplyResult> {
  const result = await postWorldDraftJson<WorldDraftApplyResult>(
    API.WORLD_DRAFT_IMPORT_APPLY,
    { contract, resolutions },
    '导入世界观导入稿失败'
  )
  invalidateDocLibraryStateCache()
  return result
}

export async function fetchBrainNeurons(): Promise<BrainNeuronRecord[]> {
  const response = await fetch(API.BRAIN_NEURONS)
  const rows = await readJson<unknown[]>(response, '加载角色大脑失败')
  return Array.isArray(rows) ? rows.map((item, index) => normalizeBrainNeuronRecord(item, index)) : []
}

export async function saveBrainNeurons(records: BrainNeuronRecord[]): Promise<void> {
  await sendJson(API.BRAIN_NEURONS, 'PUT', records, '保存角色大脑失败')
}
