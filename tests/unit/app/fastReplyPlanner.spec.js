import { describe, expect, it } from 'vitest'
import { buildFastReplyPlanningHint, planFastReplySpeakers } from '../../../src/app/fastReplyPlanner.ts'

const candidates = [
  { participantId: 'p1', characterId: 'c1', displayName: '甲', presenceState: 'present', reason: 'present' },
  { participantId: 'p2', characterId: 'c2', displayName: '乙', presenceState: 'unknown', reason: 'unknown_compatibility' },
  { participantId: 'p3', characterId: 'c3', displayName: '丙', presenceState: 'offstage', reason: 'forced_offstage' }
]

describe('fastReplyPlanner', () => {
  it('only samples formal present candidates and never falls back to unknown or offstage', () => {
    expect(planFastReplySpeakers({ candidates, random: () => 0.99 })).toMatchObject([
      { characterId: 'c1', displayName: '甲' }
    ])
    expect(planFastReplySpeakers({ candidates: candidates.slice(1), random: () => 0 })).toEqual([])
  })

  it('keeps a forced present mention even when its probability is zero', () => {
    expect(planFastReplySpeakers({
      candidates,
      probabilitiesByCharacterId: { c1: 0 },
      forcedCharacterIds: ['c1'],
      random: () => 0.99
    })[0]).toMatchObject({ characterId: 'c1', forced: true, order: 0 })
  })

  it('builds a planning hint for Tidiao that tells later speakers to continue persisted replies', () => {
    const hint = buildFastReplyPlanningHint({ speakerName: '乙', userText: '走进房间', priorSpeakerNames: ['甲'] })
    expect(hint).toContain('本轮已有这些角色先发言：甲')
    expect(hint).not.toContain('用户本轮输入：走进房间')
    expect(hint).not.toContain('全局提调')
    expect(hint).not.toContain('候选计划')
  })
})
