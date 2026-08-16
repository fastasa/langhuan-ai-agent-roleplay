import { describe, expect, it } from 'vitest'
import {
  assignChatFloorNumbers,
  classifyChatFloorKind,
  formatChatFloorRef,
  parseChatFloorRefs,
  CHAT_FLOOR_REF_MAX
} from '../../../src/app/chatMessageFloor.ts'

describe('chatMessageFloor（批次 M2 楼层号共享真值）', () => {
  it('classifyChatFloorKind：调试 > 旁白 > 角色 > 不参与', () => {
    expect(classifyChatFloorKind({ role: 'assistant', name: '阿澈' })).toBe('role')
    expect(classifyChatFloorKind({ role: 'assistant', messageKind: 'narration' })).toBe('narration')
    expect(classifyChatFloorKind({ role: 'assistant', name: '旁白' })).toBe('narration')
    expect(classifyChatFloorKind({ role: 'assistant', messageKind: 'narration_debug' })).toBe('debug')
    expect(classifyChatFloorKind({ role: 'assistant', name: '旁白调试' })).toBe('debug')
    expect(classifyChatFloorKind({ role: 'user', content: '你好' })).toBe('')
  })

  it('assignChatFloorNumbers：角色/旁白各自 1 起独立编号，调试不挤占角色/旁白序号', () => {
    const messages = [
      { id: 1, role: 'user', content: 'hi' },
      { id: 2, role: 'assistant', name: '阿澈', content: 'A1' },
      { id: 3, role: 'assistant', messageKind: 'narration', content: 'N1' },
      { id: 4, role: 'assistant', messageKind: 'narration_debug', content: 'D1' },
      { id: 5, role: 'assistant', name: '阿澈', content: 'A2' }
    ]
    const map = assignChatFloorNumbers(messages)
    expect(map.get(messages[0])).toBeUndefined() // 用户不入表
    expect(map.get(messages[1])).toEqual({ kind: 'role', index: 1, total: 2 })
    expect(map.get(messages[2])).toEqual({ kind: 'narration', index: 1, total: 1 })
    expect(map.get(messages[3])).toEqual({ kind: 'debug', index: 1, total: 1 })
    expect(map.get(messages[4])).toEqual({ kind: 'role', index: 2, total: 2 })
  })

  it('assignChatFloorNumbers：name-only 旁白（无 messageKind）也归旁白楼层（统一后移动端补齐的兜底，与桌面/后端同口径）', () => {
    const messages = [
      { id: 1, role: 'assistant', name: '阿澈', content: 'A1' },
      { id: 2, role: 'assistant', name: '旁白', content: '只有名称标记的旁白' },
      { id: 3, role: 'assistant', name: '阿澈', content: 'A2' }
    ]
    const map = assignChatFloorNumbers(messages)
    expect(map.get(messages[0])).toEqual({ kind: 'role', index: 1, total: 2 })
    expect(map.get(messages[1])).toEqual({ kind: 'narration', index: 1, total: 1 })
    expect(map.get(messages[2])).toEqual({ kind: 'role', index: 2, total: 2 })
  })

  it('assignChatFloorNumbers：可传自定义 classify（前端口径保持原样）', () => {
    const messages = [{ x: 1 }, { x: 2 }, { x: 3 }]
    const classify = (m) => (m.x === 2 ? '' : 'role')
    const map = assignChatFloorNumbers(messages, classify)
    expect(map.get(messages[0])).toEqual({ kind: 'role', index: 1, total: 2 })
    expect(map.get(messages[1])).toBeUndefined()
    expect(map.get(messages[2])).toEqual({ kind: 'role', index: 2, total: 2 })
  })

  it('parseChatFloorRefs：单条 / 含「消息」字 / 旁白', () => {
    expect(parseChatFloorRefs('角色2')).toEqual([{ kind: 'role', index: 2 }])
    expect(parseChatFloorRefs('角色消息2')).toEqual([{ kind: 'role', index: 2 }])
    expect(parseChatFloorRefs('旁白3')).toEqual([{ kind: 'narration', index: 3 }])
  })

  it('parseChatFloorRefs：范围 + 多目标 + 混合种类，按出现顺序去重', () => {
    expect(parseChatFloorRefs('角色3-5、旁白2')).toEqual([
      { kind: 'role', index: 3 },
      { kind: 'role', index: 4 },
      { kind: 'role', index: 5 },
      { kind: 'narration', index: 2 }
    ])
    // 范围倒序也归一；重复去重
    expect(parseChatFloorRefs('角色5到3，角色4')).toEqual([
      { kind: 'role', index: 3 },
      { kind: 'role', index: 4 },
      { kind: 'role', index: 5 }
    ])
  })

  it('parseChatFloorRefs：全角数字归一、整体截断到上限', () => {
    expect(parseChatFloorRefs('角色３')).toEqual([{ kind: 'role', index: 3 }])
    expect(parseChatFloorRefs('角色1-999')).toHaveLength(CHAT_FLOOR_REF_MAX)
  })

  it('parseChatFloorRefs：无楼层引用返回空', () => {
    expect(parseChatFloorRefs('随便改改')).toEqual([])
    expect(parseChatFloorRefs('')).toEqual([])
  })

  it('formatChatFloorRef：回显文案', () => {
    expect(formatChatFloorRef({ kind: 'role', index: 2 })).toBe('角色2')
    expect(formatChatFloorRef({ kind: 'narration', index: 3 })).toBe('旁白3')
  })
})
