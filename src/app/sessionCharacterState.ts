export type SessionCharacterStateMode = 'follow_main' | 'independent_snapshot'

function text(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeSessionCharacterStateMode(value: unknown): SessionCharacterStateMode {
  return text(value) === 'independent_snapshot' ? 'independent_snapshot' : 'follow_main'
}

export function findSessionCharacterParticipant(session: unknown, characterId: string): Record<string, any> | null {
  const id = text(characterId).replace(/^character[_:-]/, '')
  const participants = Array.isArray((session as any)?.participants) ? (session as any).participants : []
  return participants.find((participant: Record<string, any>) => {
    const type = text(participant.participantType ?? participant.participant_type ?? 'char') || 'char'
    const targetId = text(
      participant.participantTargetId
      ?? participant.participant_target_id
      ?? participant.targetId
      ?? participant.target_id
    ).replace(/^character[_:-]/, '')
    return type === 'char' && targetId === id
  }) || null
}

export function resolveSessionCharacter<T extends Record<string, any>>(
  session: unknown,
  characterId: string,
  mainCharacter: T | null | undefined
): T | null {
  const participant = findSessionCharacterParticipant(session, characterId)
  const mode = normalizeSessionCharacterStateMode(
    participant?.characterStateMode ?? participant?.character_state_mode
  )
  if (mode === 'follow_main') return mainCharacter || null
  const resolved = participant?.resolvedCharacter ?? participant?.resolved_character
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return null
  return resolved as T
}
