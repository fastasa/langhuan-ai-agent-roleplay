export const CHARACTER_SNAPSHOT_STATE_FIELDS = [
  'gender', 'age', 'desc', 'appearance', 'outfit', 'personality', 'hobbies', 'abilities',
  'experience', 'worldview', 'background', 'speakingStyle', 'schedule', 'yearlySchedule',
  'currentActivities', 'relationships', 'brainLinks', 'brainDocuments', 'brainCognitionNodes',
  'brainTraceNodes', 'brainTrajectoryMeta', 'brainPinnedOffsets', 'brainNodePositions',
  'brainCandidateChanges', 'personalityKernel', 'affection', 'locations'
] as const

export type CharacterSnapshotStateField = typeof CHARACTER_SNAPSHOT_STATE_FIELDS[number]
export type CharacterSnapshotState = Partial<Record<CharacterSnapshotStateField, unknown>>

export const CHARACTER_SNAPSHOT_FIELD_ALIASES: Record<CharacterSnapshotStateField, readonly string[]> = {
  gender: ['gender'], age: ['age'], desc: ['desc'], appearance: ['appearance'], outfit: ['outfit'],
  personality: ['personality'], hobbies: ['hobbies'], abilities: ['abilities'], experience: ['experience'],
  worldview: ['worldview'], background: ['background'], speakingStyle: ['speakingStyle', 'speaking_style'],
  schedule: ['schedule'], yearlySchedule: ['yearlySchedule', 'yearly_schedule'],
  currentActivities: ['currentActivities', 'current_activities'], relationships: ['relationships'],
  brainLinks: ['brainLinks', 'brain_links'], brainDocuments: ['brainDocuments', 'brain_documents'],
  brainCognitionNodes: ['brainCognitionNodes', 'brain_cognition_nodes'],
  brainTraceNodes: ['brainTraceNodes', 'brain_trace_nodes'],
  brainTrajectoryMeta: ['brainTrajectoryMeta', 'brain_trajectory_meta'],
  brainPinnedOffsets: ['brainPinnedOffsets', 'brain_pinned_offsets'],
  brainNodePositions: ['brainNodePositions', 'brain_node_positions'],
  brainCandidateChanges: ['brainCandidateChanges', 'brain_candidate_changes'],
  personalityKernel: ['personalityKernel', 'personality_kernel'], affection: ['affection'], locations: ['locations']
}

function readFirstOwn(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  }
  return undefined
}

export function pickCharacterSnapshotState(source: Record<string, unknown>): CharacterSnapshotState {
  const state: CharacterSnapshotState = {}
  for (const field of CHARACTER_SNAPSHOT_STATE_FIELDS) {
    const value = readFirstOwn(source, CHARACTER_SNAPSHOT_FIELD_ALIASES[field])
    if (value !== undefined) state[field] = value
  }
  return state
}

export function applyCharacterSnapshotState<T extends Record<string, unknown>>(
  character: T,
  state: CharacterSnapshotState
): T {
  const next: Record<string, unknown> = { ...character }
  for (const field of CHARACTER_SNAPSHOT_STATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(state, field)) continue
    const value = state[field]
    for (const alias of CHARACTER_SNAPSHOT_FIELD_ALIASES[field]) next[alias] = value
  }
  return next as T
}
