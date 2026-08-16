import type { BrainDocumentRecord, UnitSemanticType } from './docBrain'

// 世界观导入稿通道（worlds/ md → contract JSON → 增量导入文档库）。
// 契约真值：docs/features/doc-library/世界观导入稿格式.md；改 schema 必须同步 GUI（scripts/world-draft-gui/）与后端。

export const WORLD_DRAFT_PROVIDER = 'langhuan_world_draft'
export const WORLD_DRAFT_FORMAT_VERSION = 1

export interface WorldDraftContractUnit {
  /** 相对世界观根的路径，含文件名（index.md=概览） */
  path: string
  title: string
  semanticType: UnitSemanticType
  summary: string
  tags: string[]
  relationHints: string[]
  /** 来自文档库导出的 stableId；有它就能精确认出库里同一单位 */
  sourceId: string | null
  content: string
}

export interface WorldDraftContract {
  formatVersion: number
  provider: string
  world: string
  generatedAt?: string
  units: WorldDraftContractUnit[]
}

export type WorldDraftContractParseResult =
  | { ok: true; contract: WorldDraftContract }
  | { ok: false; error: string }

/** 冲突判定命中方式：sourceId 直配库文档 / sourceMeta 同源三键 / displayPath 相同 */
export type WorldDraftConflictMatchKind = 'source_id' | 'source_meta' | 'display_path'

export interface WorldDraftPreviewUnitExisting {
  documentId: string
  title: string
  semanticType?: UnitSemanticType
  summary: string
  tags: string[]
  relationHints: string[]
  content: string
  updatedAt: string
}

export interface WorldDraftPreviewUnit {
  draftKey: string
  status: 'new' | 'conflict'
  matchKind?: WorldDraftConflictMatchKind
  displayPath: string
  path: string
  incoming: {
    title: string
    semanticType: UnitSemanticType
    summary: string
    tags: string[]
    relationHints: string[]
    content: string
  }
  existing?: WorldDraftPreviewUnitExisting
}

// 与 SillyTavernWorldbookImportTreeNode 联动能力：结构一致，若用户要求统一修改，两处同步改。
export interface WorldDraftImportTreeNode {
  id: string
  kind: 'folder' | 'document'
  title: string
  displayPath: string
  children: WorldDraftImportTreeNode[]
}

export interface WorldDraftImportPreview {
  world: string
  units: WorldDraftPreviewUnit[]
  tree: WorldDraftImportTreeNode[]
  warnings: string[]
  stats: {
    unitCount: number
    newCount: number
    conflictCount: number
    warningCount: number
  }
}

export type WorldDraftConflictAction = 'skip' | 'overwrite'

/** 逐条冲突决议：overwrite 可携带编辑字段=「修改再覆盖」；路径与标题不可改 */
export interface WorldDraftConflictResolution {
  action: WorldDraftConflictAction
  content?: string
  summary?: string
  tags?: string[]
  relationHints?: string[]
}

export type WorldDraftResolutionMap = Record<string, WorldDraftConflictResolution>

export type WorldDraftUnitOutcome = 'added' | 'overwritten' | 'edited_overwritten' | 'skipped'

export interface WorldDraftMergeResult {
  nextDocuments: BrainDocumentRecord[]
  outcomes: Array<{ draftKey: string; displayPath: string; title: string; outcome: WorldDraftUnitOutcome }>
  addedCount: number
  overwrittenCount: number
  editedCount: number
  skippedCount: number
}

export interface WorldDraftApplyResult {
  ok: true
  world: string
  addedCount: number
  overwrittenCount: number
  editedCount: number
  skippedCount: number
  documentCount: number
  outcomes: WorldDraftMergeResult['outcomes']
}
