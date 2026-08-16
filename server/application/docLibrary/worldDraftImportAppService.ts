import {
  buildWorldDraftPreview,
  mergeWorldDraftDocuments,
  parseWorldDraftContract
} from '../../../src/app/worldDraftImport.js'
import type {
  BrainDocumentRecord,
  WorldDraftApplyResult,
  WorldDraftImportPreview,
  WorldDraftResolutionMap
} from '../../../src/types/index.js'
import { normalizeBrainDocumentReplaceRow } from '../character/brainRecordNormalizer.js'
import { fieldTreeToPathTree, pathTreeToFieldTree } from '../../../src/app/docLibraryTreeMigration.js'
import { buildDocLibraryTreeDiffReport } from '../../../src/app/docLibraryTreeDiffReport.js'

// 世界观导入稿增量导入通道：contract JSON → preview（新增/冲突）→ 用户逐条决议 → apply 增量合并。
// 全程只从 [...existingDocuments] 增量出发，绝不走 replaceState 全量替换。
// 字段树审计门与 sillyTavernWorldbookImportAppService 属联动能力，后续若用户要求统一修改，两处同步改。

type DocumentRepository = {
  getDocuments: () => any[]
  replaceDocuments: (rows: ReturnType<typeof normalizeBrainDocumentReplaceRow>[]) => void
  getManualTreeOrders?: () => Record<string, string[]>
  getSchemaVersion?: () => number
  getTreeNodes?: () => unknown[]
  getTreeOrders?: () => Record<string, string[]>
  replaceManualTreeOrders?: (orders: Record<string, string[]>) => void
  replaceSchemaVersion?: (schemaVersion: number) => void
  replaceTreeNodes?: (treeNodes: unknown[]) => void
  replaceTreeOrders?: (treeOrders: Record<string, string[]>) => void
  replaceTreeMigrationMeta?: (treeMigrationMeta: Record<string, unknown>) => void
  replaceTreeDiffReport?: (treeDiffReport: Record<string, unknown>) => void
}

export function createWorldDraftImportAppService(repository: DocumentRepository) {
  function parseContractOrThrow(payload: Record<string, unknown>) {
    const parsed = parseWorldDraftContract(payload?.contract ?? payload)
    if (!parsed.ok) throw new Error(`世界观导入稿解析失败：${parsed.error}`)
    return parsed.contract
  }

  // v1 display_path / 手工排序桶都可能残留历史噪声（多篇文档同路径的旧占位名「新桠.md/1.md」、
  // 字段树时代未回写的旧排序桶等），v2 字段树才是结构与排序真值。这里在冲突匹配/字段树重建前：
  // ①用存储字段树反推路径与排序桶（不再信旧 v1 桶）；②反推仍撞车的路径组（反推按设计沿用 legacy
  // 文件名）用该文档字段树节点的标题重命名文件名。只动撞车组、其余路径一律不变；apply 落库即顺带修复坏数据。
  // 与 sillyTavernWorldbookImportAppService 的差异：那边未做此归一，若它也被历史噪声拦，需同款接入（联动标注）。
  function readExistingStateWithFieldTreeTruth(): {
    documents: BrainDocumentRecord[]
    manualTreeOrders: Record<string, string[]>
  } {
    const existingDocuments = repository.getDocuments() as BrainDocumentRecord[]
    const treeNodes = repository.getTreeNodes?.()
    if (repository.getSchemaVersion?.() !== 2 || !Array.isArray(treeNodes) || !treeNodes.length) {
      return {
        documents: existingDocuments,
        manualTreeOrders: normalizeTreeOrders(repository.getManualTreeOrders?.())
      }
    }
    // 不传 manualTreeOrders：让转换函数从字段树自建排序桶（v2 排序真值），旧 v1 桶弃用
    const converted = fieldTreeToPathTree({
      documents: existingDocuments,
      treeNodes: treeNodes as any[],
      treeOrders: repository.getTreeOrders?.() || {}
    })
    return {
      documents: repairDuplicateDisplayPaths(
        converted.documents as BrainDocumentRecord[],
        treeNodes as Array<Record<string, unknown>>
      ),
      manualTreeOrders: normalizeTreeOrders(converted.manualTreeOrders)
    }
  }

  function preview(payload: Record<string, unknown> = {}): WorldDraftImportPreview {
    const contract = parseContractOrThrow(payload)
    const existingState = readExistingStateWithFieldTreeTruth()
    return buildWorldDraftPreview(contract, { existingDocuments: existingState.documents })
  }

  function apply(payload: Record<string, unknown> = {}): WorldDraftApplyResult {
    const contract = parseContractOrThrow(payload)
    const resolutions = normalizeResolutions(payload?.resolutions)
    const now = new Date().toISOString()
    const existingState = readExistingStateWithFieldTreeTruth()
    const existingDocuments = existingState.documents

    const merged = mergeWorldDraftDocuments({ contract, resolutions, existingDocuments, now })

    // 旧排序桶只做排序提示（保留用户手工顺序，新文档追加）；正式排序桶由重建后的字段树反推，保证与树自洽
    const fieldTreeState = buildFieldTreeState(merged.nextDocuments, existingState.manualTreeOrders, now)

    repository.replaceDocuments(merged.nextDocuments.map((item, index) => normalizeBrainDocumentReplaceRow(item, index)))
    repository.replaceManualTreeOrders?.(fieldTreeState.manualTreeOrders)
    repository.replaceSchemaVersion?.(2)
    repository.replaceTreeNodes?.(fieldTreeState.treeNodes)
    repository.replaceTreeOrders?.(fieldTreeState.treeOrders)
    repository.replaceTreeMigrationMeta?.(fieldTreeState.treeMigrationMeta)
    repository.replaceTreeDiffReport?.(fieldTreeState.treeDiffReport)

    return {
      ok: true,
      world: contract.world,
      addedCount: merged.addedCount,
      overwrittenCount: merged.overwrittenCount,
      editedCount: merged.editedCount,
      skippedCount: merged.skippedCount,
      documentCount: merged.nextDocuments.length,
      outcomes: merged.outcomes
    }
  }

  return { preview, apply }
}

// 反推后仍同路径的文档组：文件名改为「字段树节点标题.md」（同层节点标题即结构真值），仍撞则加序号。
function repairDuplicateDisplayPaths(
  documents: BrainDocumentRecord[],
  treeNodes: Array<Record<string, unknown>>
): BrainDocumentRecord[] {
  const titleByDocumentId = new Map<string, string>()
  treeNodes.forEach((node) => {
    if (node?.nodeKind === 'document' && node.documentId) {
      titleByDocumentId.set(String(node.documentId), String(node.title || '').trim())
    }
  })

  const countByPath = new Map<string, number>()
  documents.forEach((document) => {
    const key = normalizePathKey(document.displayPath)
    countByPath.set(key, (countByPath.get(key) || 0) + 1)
  })
  if (![...countByPath.values()].some((count) => count > 1)) return documents

  const takenPaths = new Set(
    documents
      .filter((document) => (countByPath.get(normalizePathKey(document.displayPath)) || 0) <= 1)
      .map((document) => normalizePathKey(document.displayPath))
  )
  return documents.map((document) => {
    const key = normalizePathKey(document.displayPath)
    if ((countByPath.get(key) || 0) <= 1) return document
    const parentPath = key.split('/').slice(0, -1).join('/')
    const title = titleByDocumentId.get(String(document.documentId || document.id))
      || String(document.title || '').trim()
      || '未命名'
    const baseName = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || '未命名'
    let candidate = `${parentPath}/${baseName}.md`
    let suffix = 2
    while (takenPaths.has(normalizePathKey(candidate))) {
      candidate = `${parentPath}/${baseName}-${suffix}.md`
      suffix += 1
    }
    takenPaths.add(normalizePathKey(candidate))
    return { ...document, displayPath: candidate }
  })
}

function normalizePathKey(value: unknown): string {
  const segments = String(value || '').split('/').map((segment) => segment.trim()).filter(Boolean)
  return segments.length ? `/${segments.join('/')}` : ''
}

function normalizeResolutions(input: unknown): WorldDraftResolutionMap {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const resolutions: WorldDraftResolutionMap = {}
  for (const [draftKey, rawValue] of Object.entries(source)) {
    const value = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : null
    if (!draftKey.trim() || !value) continue
    const action = value.action === 'overwrite' ? 'overwrite' : 'skip'
    resolutions[draftKey.trim()] = {
      action,
      content: typeof value.content === 'string' ? value.content : undefined,
      summary: typeof value.summary === 'string' ? value.summary : undefined,
      tags: Array.isArray(value.tags) ? value.tags.map((item) => String(item ?? '').trim()).filter(Boolean) : undefined,
      relationHints: Array.isArray(value.relationHints)
        ? value.relationHints.map((item) => String(item ?? '').trim()).filter(Boolean)
        : undefined
    }
  }
  return resolutions
}

function buildFieldTreeState(
  documents: BrainDocumentRecord[],
  orderingHint: Record<string, string[]>,
  generatedAt: string
) {
  const converted = pathTreeToFieldTree({
    documents,
    manualTreeOrders: orderingHint,
    generatedAt
  })
  // 规范排序桶从重建后的树反推：旧桶不含本次新增/改名条目，直接比对必然不一致（审计门要求逐桶全等）
  const manualTreeOrders = fieldTreeToPathTree({
    documents,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders
  }).manualTreeOrders
  const treeDiffReport = buildDocLibraryTreeDiffReport({
    documents,
    manualTreeOrders,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders,
    treeSource: 'path'
  })
  if (treeDiffReport.blockerCount > 0) {
    const issue = treeDiffReport.issues[0]
    throw new Error(`世界观导入稿未通过字段树检查：${issue?.message || '字段树差异报告存在阻断项'}`)
  }
  return {
    manualTreeOrders,
    treeNodes: converted.treeNodes,
    treeOrders: converted.treeOrders,
    treeMigrationMeta: converted.treeMigrationMeta,
    treeDiffReport
  }
}

function normalizeTreeOrders(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        String(key || '').trim(),
        Array.isArray(value)
          ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
          : []
      ])
      .filter(([key]) => Boolean(key))
  )
}
