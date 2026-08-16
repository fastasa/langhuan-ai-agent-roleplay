export type PersonalityKernelGuardDimensionKey =
  | 'emotionalStability'
  | 'socialTrust'
  | 'boundarySensitivity'
  | 'controlNeed'
  | 'approvalSensitivity'
  | 'expressiveness'
  | 'conflictStyle'
  | 'initiative'
  | string

export interface PersonalityKernelGuardDimension {
  key: PersonalityKernelGuardDimensionKey
  baseline: number
  lowerBound: number
  upperBound: number
  meaning: string
}

export interface PersonalityKernelReactionPolicy {
  id: string
  situationTags: string[]
  appraisal: string
  emotionTendency: string
  actionTendency: string
  expressionTendency: string
  boundaryRule?: string
  trustRule?: string
  reboundRule?: string
  baseWeight: number
  lowerWeight: number
  upperWeight: number
  promptSentence: string
}

export interface PersonalityKernel {
  characterId: string
  version: number
  sourceTextHash: string
  stableSummary: string
  guardDimensions: PersonalityKernelGuardDimension[]
  reactionPolicies: PersonalityKernelReactionPolicy[]
}

export type PersonalityKernelParseStatus = 'parsed' | 'skipped' | 'failed'

export interface PersonalityKernelParseResult {
  status: PersonalityKernelParseStatus
  reason: string
  sourceTextHash?: string
  kernel?: PersonalityKernel
  rawOutput?: string
}
