import { describe, expect, it } from 'vitest'
import { resolveXingyiSessionCandidate } from '../../../src/app/xingyiSessionContext.ts'

const candidates = [
  { sessionId:'s1', sessionTitle:'咒术回战', characterOptions:[{id:'c1',name:'五条悟'}] },
  { sessionId:'s2', sessionTitle:'咒术回战', characterOptions:[{id:'c2',name:'三轮霞'},{id:'c3',name:'庵歌姬'}] }
]

describe('resolveXingyiSessionCandidate', () => {
  it('sessionId 精确命中不受同名标题影响', () => {
    expect(resolveXingyiSessionCandidate(candidates, 's2').context?.sessionId).toBe('s2')
  })

  it('同名标题不猜测并返回成员与 sessionId 候选', () => {
    const result = resolveXingyiSessionCandidate(candidates, '咒术回战')
    expect(result.context).toBeUndefined()
    expect(result.error).toContain('不能替用户猜')
    expect(result.error).toContain('五条悟')
    expect(result.error).toContain('三轮霞、庵歌姬')
    expect(result.error).toContain('sessionId s2')
  })
})
