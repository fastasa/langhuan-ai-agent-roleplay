import { describe, expect, it } from 'vitest'
import { useGroupReplyPlan } from '../../../src/composables/useGroupReplyPlan.ts'

const groupMembers = [
  { characterId: 'char_xingyi', probability: 0.2 },
  { characterId: 'char_yun', probability: 0.2 }
]

const characters = [
  { id: 'char_xingyi', name: '星依', nicknames: ['女儿'] },
  { id: 'char_yun', name: '云灯', nicknames: [] }
]

function buildReplyPlan(overrides = {}) {
  const { buildReplyPlan } = useGroupReplyPlan()
  return buildReplyPlan({
    userText: '',
    groupMembers,
    characters,
    mentionSelectedChars: [],
    mentionExcludedChars: [],
    ...overrides
  })
}

describe('useGroupReplyPlan', () => {
  it('forces a formal role to reply when @name is followed by whitespace', () => {
    const plan = buildReplyPlan({ userText: '@星依 看这里' })

    expect(plan[0]).toMatchObject({ characterId: 'char_xingyi', mustReply: true })
  })

  it('forces a formal role to reply when @name is at input end', () => {
    const plan = buildReplyPlan({ userText: '轮到 @星依' })

    expect(plan[0]).toMatchObject({ characterId: 'char_xingyi', mustReply: true })
  })

  it('does not force reply when @name is immediately followed by body text', () => {
    const plan = buildReplyPlan({ userText: '@星依继续说' })
    const xingyi = plan.find(item => item.characterId === 'char_xingyi')

    expect(xingyi?.mustReply).toBe(false)
  })

  it('lets explicit menu selection win over text parsing and probability order', () => {
    const plan = buildReplyPlan({
      userText: '@星依 看这里',
      mentionSelectedChars: ['char_yun']
    })

    expect(plan).toEqual([{ characterId: 'char_yun', mustReply: true }])
  })

  it('keeps excluded roles out of strict @ matches', () => {
    const plan = buildReplyPlan({
      userText: '@星依 看这里',
      mentionExcludedChars: ['char_xingyi']
    })

    expect(plan.some(item => item.characterId === 'char_xingyi')).toBe(false)
  })
})
