import { describe, expect, it } from 'vitest'
import { buildPostRoundDirectorDirective } from '../../../src/app/postRoundDirectorDirective.ts'

describe('postRoundDirectorDirective', () => {
  it('快速回复轮后核对已落库角色正文，允许补演但禁止重演', () => {
    const text = buildPostRoundDirectorDirective({ triggerKind: 'fast_reply', suppressAudienceOutputs: false })
    expect(text).toContain('快速回复后的轮后审计与补演')
    expect(text).toContain('快速角色正文已经正式落库')
    expect(text).toContain('不能重复招呼或重演')
  })

  it('公开动作轮后专门核对动作结果，不冒充快速角色回复', () => {
    const text = buildPostRoundDirectorDirective({ triggerKind: 'focused_action', suppressAudienceOutputs: false })
    expect(text).toContain('公开动作后的轮后审计')
    expect(text).toContain('动作原文与正式消息模型生成的动作结果已经落库')
    expect(text).not.toContain('快速角色正文')
    expect(text).toContain('不要把公开等同于必须安排角色回复')
  })

  it('私密动作轮后只许后台落账，禁止任何新可见输出', () => {
    const text = buildPostRoundDirectorDirective({ triggerKind: 'focused_action', suppressAudienceOutputs: true })
    expect(text).toContain('私密动作后的轮后核账')
    expect(text).toContain('不得安排任何角色回复')
    expect(text).toContain('不得新增旁白')
  })
})
