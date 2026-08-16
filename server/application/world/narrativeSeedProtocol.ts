export {
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES
} from '../../../shared/narrativeSeedAuthoring.js'

import {
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES
} from '../../../shared/narrativeSeedAuthoring.js'

export const NARRATIVE_SEED_EVENT_TYPES = [
  'created',
  'updated',
  'status_changed',
  'time_gate_reached',
  'progress_recorded',
  'predicted_effect',
  'fact_committed',
  'migrated',
  'review_flagged',
  'transformed'
] as const

export type NarrativeSeedType = (typeof NARRATIVE_SEED_TYPES)[number]
export type NarrativeSeedStatus = (typeof NARRATIVE_SEED_STATUSES)[number]
export type NarrativeSeedLinkType = (typeof NARRATIVE_SEED_LINK_TYPES)[number]
export type NarrativeSeedParticipantType = (typeof NARRATIVE_SEED_PARTICIPANT_TYPES)[number]
export type NarrativeSeedVisibilityMode = (typeof NARRATIVE_SEED_VISIBILITY_MODES)[number]
export type NarrativeSeedEventType = (typeof NARRATIVE_SEED_EVENT_TYPES)[number]

export type NarrativeSeedParticipantInput = {
  id?: string
  participantType: NarrativeSeedParticipantType
  participantId?: string
  displayName?: string
  relationRole?: string
}

export type NarrativeSeedLinkInput = {
  id?: string
  targetSeedId: string
  relationType: NarrativeSeedLinkType
}

export type NarrativeSeedWriteInput = {
  id?: string
  type?: NarrativeSeedType
  title?: string
  description?: string
  cause?: string
  currentProgress?: string
  expectedOutcome?: string
  startTime?: string
  lastAdvancedAt?: string
  mapFeatureId?: string
  locationText?: string
  impactScope?: string
  status?: NarrativeSeedStatus
  visibilityMode?: NarrativeSeedVisibilityMode
  visibility?: Record<string, unknown>
  allowFrontstage?: boolean
  lastModifiedSource?: string
  participants?: NarrativeSeedParticipantInput[]
  links?: NarrativeSeedLinkInput[]
  expectedVersion?: number
  evidenceSummary?: string
  sourceSessionId?: string
  sourceMessageId?: number
  sourceDirectorRunId?: string
  sourceAgentRunId?: string
}

/** 双阶段影响提交：predicted_effect 只追加预测事件；fact_committed 才可推进正式进度/状态。 */
export type NarrativeSeedImpactInput = {
  eventType: 'predicted_effect' | 'fact_committed'
  expectedVersion?: number
  effectSummary?: string
  comparisonOutcome?: 'occurred' | 'partial' | 'not_occurred' | 'opposite'
  currentProgress?: string
  status?: NarrativeSeedStatus
  lastAdvancedAt?: string
  startTime?: string
  evidenceSummary?: string
  sourceSessionId?: string
  sourceMessageId?: number
  sourceDirectorRunId?: string
  sourceAgentRunId?: string
  idempotencyKey?: string
}
