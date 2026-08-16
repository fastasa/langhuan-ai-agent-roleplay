import { describe, expect, it } from 'vitest'
import { resolveSessionCharacter } from '../../../src/app/sessionCharacterState.ts'

describe('sessionCharacterState', () => {
  it('follow_main 返回主真值，独立模式只返回服务端已解析的分支角色', () => {
    const main = { id: 'char_1', name: '惊雨', desc: '主真值' }
    expect(resolveSessionCharacter({
      participants: [{ participantTargetId: 'char_1', participantType: 'char', characterStateMode: 'follow_main' }]
    }, 'char_1', main)).toBe(main)

    const branch = { id: 'char_1', name: '惊雨', desc: '会话分支' }
    expect(resolveSessionCharacter({
      participants: [{
        participantTargetId: 'char_1', participantType: 'char', characterStateMode: 'independent_snapshot', resolvedCharacter: branch
      }]
    }, 'char_1', main)).toBe(branch)
  })

  it('独立模式缺失服务端分支投影时不静默回退主真值', () => {
    expect(resolveSessionCharacter({
      participants: [{ participantTargetId: 'char_1', participantType: 'char', characterStateMode: 'independent_snapshot' }]
    }, 'char_1', { id: 'char_1', desc: '主真值' })).toBeNull()
  })
})
