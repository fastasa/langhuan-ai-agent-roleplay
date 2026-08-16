import type { UnitViewCompilePage } from './unitView'

export type UnitContentPortDomain =
  | 'docLibrary'
  | 'characterCore'
  | 'characterSoul'
  | 'characterTrace'
  | 'characterArrangement'

export type UnitContentPortKind =
  | 'markdown'
  | 'form'
  | 'group'
  | 'reference'
  | 'schedule'
  | 'system'

export interface UnitContentEffectiveVersion {
  title: string
  summary: string
  body: string
  formText?: string
  compilePage?: UnitViewCompilePage
}

export interface UnitContentPendingVersion {
  mode: 'create' | 'update'
  confirmed?: UnitContentEffectiveVersion
  pending: UnitContentEffectiveVersion
  reason?: string
  createdAt?: string
  createdBy?: string
}

export interface UnitContentPort {
  unitId: string
  sourceId: string
  domain: UnitContentPortDomain
  contentKind: UnitContentPortKind
  title: string
  parentId?: string
  sourcePath?: string
  summary: string
  tags: string[]
  relationHints: string[]
  body: string
  formText?: string
  hasCompilePage: boolean
  hasBody: boolean
  recallableInChat: boolean
  browsable: boolean
  importableToBrain: boolean
  writableByAI: boolean
  effectiveVersion: UnitContentEffectiveVersion
  pendingVersion?: UnitContentPendingVersion
  metadata?: Record<string, unknown>
}
