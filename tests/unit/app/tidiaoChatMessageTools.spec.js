import { describe, expect, it } from 'vitest'
import {
  createTidiaoChatMessageReadContext,
  runTidiaoReadChatMessages
} from '../../../src/app/tidiaoChatMessageTools.ts'

function sampleMessages() {
  return [
    { id: 1, role: 'user', content: '今晚天气不错' },
    { id: 2, role: 'assistant', name: '阿澈', content: '是啊，凉风正好。' },
    { id: 3, role: 'assistant', messageKind: 'narration', content: '窗外月色清冷。' },
    { id: 4, role: 'assistant', messageKind: 'narration_debug', content: '【调试】旁白草稿' },
    { id: 5, role: 'assistant', name: '阿澈', content: '要不要出去走走？' }
  ]
}

describe('tidiaoChatMessageTools（批次 M2 读会话消息）', () => {
  it('按楼层号读到原文 + 稳定 messageId（角色/旁白各自独立编号）', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    const role2 = runTidiaoReadChatMessages({ query: '角色消息2' }, ctx)
    expect(role2.reads).toEqual([
      { ref: '角色2', kind: 'role', index: 2, total: 2, matched: true, messageId: 5, speakerName: '阿澈', content: '要不要出去走走？' }
    ])
    const narration1 = runTidiaoReadChatMessages({ query: '旁白1' }, ctx)
    expect(narration1.reads[0]).toMatchObject({ ref: '旁白1', matched: true, messageId: 3, speakerName: '旁白', content: '窗外月色清冷。' })
  })

  it('调试消息不可读、不挤占角色/旁白序号', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    // 角色只有 2 条（id=2、id=5），旁白只有 1 条（id=3，调试 id=4 不算）
    expect(ctx.floorTotal('role')).toBe(2)
    expect(ctx.floorTotal('narration')).toBe(1)
  })

  it('范围 + 多目标一次读多条', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    const result = runTidiaoReadChatMessages({ query: '角色1-2、旁白1' }, ctx)
    expect(result.reads.map((r) => r.ref)).toEqual(['角色1', '角色2', '旁白1'])
    expect(result.reads.every((r) => r.matched)).toBe(true)
    expect(result.reads[0].messageId).toBe(2)
  })

  it('投影给出的稳定 messageId 可直接读取，不依赖会随显示变化的楼层号', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    const result = runTidiaoReadChatMessages({
      references: [{ kind: 'chat_message', sessionId: 'session_a', messageId: 5 }]
    }, ctx)
    expect(result.reads).toEqual([
      { ref: '角色2', kind: 'role', index: 2, total: 2, matched: true, messageId: 5, speakerName: '阿澈', content: '要不要出去走走？' }
    ])
  })

  it('越界引用回报 matched:false + total（供提调自纠）', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    const result = runTidiaoReadChatMessages({ query: '角色7' }, ctx)
    expect(result.reads).toEqual([
      { ref: '角色7', kind: 'role', index: 7, total: 2, matched: false, messageId: 0, speakerName: '', content: '' }
    ])
  })

  it('无可解析楼层引用返回空 reads', () => {
    const ctx = createTidiaoChatMessageReadContext(sampleMessages())
    expect(runTidiaoReadChatMessages({ query: '随便改改' }, ctx).reads).toEqual([])
  })

  it('空会话：floorTotal 为 0、读取未命中', () => {
    const ctx = createTidiaoChatMessageReadContext([])
    expect(ctx.floorTotal('role')).toBe(0)
    expect(ctx.readByFloor('role', 1)).toBeNull()
  })
})
