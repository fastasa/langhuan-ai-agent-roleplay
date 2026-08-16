import { describe, expect, it } from 'vitest'
import { buildPresenceFactOperations, shouldCommitNarrativeFact } from '../../../src/app/orchestrationFactReconciliation'

const proposals = [
  { participantId: 'p1', expectedVersion: 0, proposalEventId: 'proposal_1', speakerNames: ['甲'] },
  { participantId: 'p2', expectedVersion: 3, proposalEventId: 'proposal_2', speakerNames: ['乙'] }
]

describe('编排事实核对', () => {
  it('proposal 阶段不产生事实命令；零落库时全部取消', () => {
    const operations = buildPresenceFactOperations({
      sessionId: 's1', worldId: 'w1', directorRunId: 'run1', anchorMessageId: 10,
      proposals, actualMessages: []
    })
    expect(operations.map((item) => item.command)).toEqual(['cancelPresenceTransition', 'cancelPresenceTransition'])
    expect(operations.map((item) => item.payload.proposalEventId)).toEqual(['proposal_1', 'proposal_2'])
  })

  it('部分落库只提交有证据的角色，其余 proposal 同批取消', () => {
    const operations = buildPresenceFactOperations({
      sessionId: 's1', worldId: 'w1', directorRunId: 'run1', anchorMessageId: 10,
      proposals, actualMessages: [{ id: 11, speaker: '甲' }]
    })
    expect(operations).toMatchObject([
      { command: 'commitPresenceTransition', idempotencyKey: 'presence-fact:10:p1', source: { sourceMessageId: '11' }, payload: { toState: 'present' } },
      { command: 'cancelPresenceTransition', idempotencyKey: 'presence-cancel:run1:p2', payload: { proposalEventId: 'proposal_2' } }
    ])
  })

  it('重新生成沿用用户轮锚的事实幂等键，run 变化不重复推进', () => {
    const build = (directorRunId) => buildPresenceFactOperations({
      sessionId: 's1', worldId: 'w1', directorRunId, anchorMessageId: 10,
      proposals: proposals.slice(0, 1), actualMessages: [{ id: directorRunId === 'run1' ? 11 : 12, speaker: '甲' }]
    })[0]
    expect(build('run1').idempotencyKey).toBe('presence-fact:10:p1')
    expect(build('run2').idempotencyKey).toBe('presence-fact:10:p1')
  })

  it('种子 only occurred/partial 可提交，not_occurred/opposite 均不写事实', () => {
    expect(shouldCommitNarrativeFact('occurred')).toBe(true)
    expect(shouldCommitNarrativeFact('partial')).toBe(true)
    expect(shouldCommitNarrativeFact('not_occurred')).toBe(false)
    expect(shouldCommitNarrativeFact('opposite')).toBe(false)
  })
})
