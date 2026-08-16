import type { OrchestrationCommandEnvelope } from '../../shared/orchestrationWorkspace'

export type PresenceProposalForFactCommit = {
  participantId: string
  expectedVersion: number
  proposalEventId: string
  speakerNames: string[]
}

export function shouldCommitNarrativeFact(comparisonOutcome: string) {
  return comparisonOutcome === 'occurred' || comparisonOutcome === 'partial'
}

/**
 * 只把正式落库的 assistant 楼层当作在场证据；未命中的 proposal 必须取消，不能升级成事实。
 * commit 幂等键锚定用户轮，重新生成不会重复推进；cancel 锚定导演 run，只收束本次 proposal。
 */
export function buildPresenceFactOperations(input: {
  sessionId: string
  worldId: string
  directorRunId: string
  anchorMessageId: number
  proposals: PresenceProposalForFactCommit[]
  actualMessages: Array<{ id: number; speaker: string }>
}): OrchestrationCommandEnvelope[] {
  const speakers = input.actualMessages.map((message) => ({ id: message.id, name: message.speaker.trim().toLocaleLowerCase() }))
  return input.proposals.map((proposal) => {
    const evidenceMessage = speakers.find((message) => message.name && proposal.speakerNames.includes(message.name))
    return {
      command: evidenceMessage ? 'commitPresenceTransition' : 'cancelPresenceTransition',
      sessionId: input.sessionId,
      worldId: input.worldId,
      targetRef: { kind: 'session_character', participantId: proposal.participantId },
      expectedVersion: proposal.expectedVersion,
      idempotencyKey: evidenceMessage
        ? `presence-fact:${input.anchorMessageId}:${proposal.participantId}`
        : `presence-cancel:${input.directorRunId}:${proposal.participantId}`,
      source: {
        ...(evidenceMessage ? { sourceMessageId: String(evidenceMessage.id) } : {}),
        sourceDirectorRunId: input.directorRunId,
        evidenceSummary: evidenceMessage
          ? `角色消息 ${evidenceMessage.id} 已正式落库，确认本轮在场`
          : '本轮没有该角色的正式落库消息，取消预计登场'
      },
      payload: evidenceMessage ? { toState: 'present' } : { proposalEventId: proposal.proposalEventId }
    }
  })
}
