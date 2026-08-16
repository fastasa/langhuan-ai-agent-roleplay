import { describe, expect, it } from 'vitest'

import {
  buildProjectionFirstMessageView,
  isProjectionFirstEligibleMessage
} from '../../../src/app/projectionFirstMessageView.ts'

describe('projectionFirstMessageView', () => {
  it('uses objective projection fact instead of raw message content', () => {
    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '原文很长，里面还有闲聊。', name: '用户' },
        { id: 2, session_id: 'session_1', role: 'assistant', content: '还没投影的回复。', name: '星依' }
      ],
      projections: [{
        id: 'projection_1',
        messageId: 1,
        status: 'complete',
        speakerName: '用户',
        objectiveFact: '用户告诉星依一件已经确认的事。',
        startEnv: { time: '上午', location: '书房' },
        endEnv: { time: '上午', location: '书房' },
        changed: { time: false, location: false },
        createdAt: '2026-06-08T01:00:00.000Z'
      }]
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      messageId: 1,
      projectionId: 'projection_1',
      content: '用户告诉星依一件已经确认的事。',
      fact: '用户告诉星依一件已经确认的事。',
      fallbackSource: 'projection',
      needsProjectionRun: false
    })
    expect(result.items[0].content).not.toContain('原文很长')
    expect(result.items[1]).toMatchObject({
      messageId: 2,
      content: '还没投影的回复。',
      fallbackSource: 'missing_projection_message_fallback',
      needsProjectionRun: true
    })
    expect(result.fallbackJobs.map((job) => job.messageId)).toEqual([2])
  })

  it('uses failed projection fallback text without marking the projection as successful', () => {
    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages: [{ id: 3, session_id: 'session_1', role: 'assistant', content: '原始失败消息。', name: '星依' }],
      projections: [{
        id: 'projection_failed_3',
        messageId: 3,
        status: 'failed',
        speakerName: '星依',
        fallbackCleanText: '清洗后的失败兜底。',
        failureReason: '缺少事实行',
        startEnvJson: '{"time":"夜里"}',
        endEnvJson: '{"time":"夜里"}',
        changedJson: '{"time":false,"location":false}',
        createdAt: '2026-06-08T02:00:00.000Z'
      }]
    })

    expect(result.items[0]).toMatchObject({
      projectionId: 'projection_failed_3',
      projectionStatus: 'failed',
      content: '清洗后的失败兜底。',
      fallbackSource: 'projection_failed_fallback',
      fallbackReason: '缺少事实行',
      needsProjectionRun: true
    })
    expect(result.fallbackJobs[0]).toMatchObject({
      messageId: 3,
      fallbackSource: 'projection_failed_fallback',
      fallbackReason: '缺少事实行'
    })
  })

  // 输入框图片上传计划批4：本函数按固定字段清单重构消息，之前没摘 attachments 字段——
  // formatHistoryMessage/renderDirectorVisibleHistory 读的历史消息全部经这里过一遍，漏摘会让附件 note 全链失效。
  it('carries the source message attachments through for both the projection and missing-projection branches', () => {
    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages: [
        {
          id: 1,
          session_id: 'session_1',
          role: 'user',
          content: '看看这张图',
          name: '用户',
          attachmentsJson: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }]
        },
        {
          id: 2,
          session_id: 'session_1',
          role: 'user',
          content: '没有投影也带图',
          name: '用户',
          attachments: [{ id: 'a2', kind: 'image', url: '/chat-images/a2.png', mime: 'image/png' }]
        }
      ],
      projections: [{
        id: 'projection_1',
        messageId: 1,
        status: 'complete',
        speakerName: '用户',
        objectiveFact: '用户给星依看了一张猫的照片。',
        createdAt: '2026-06-08T01:00:00.000Z'
      }]
    })

    expect(result.items[0].attachments).toEqual([{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }])
    // 未带投影（buildMissingProjectionView 分支）同样摘出 attachments（乐观回显字段名 attachments 未走 toCamel）。
    expect(result.items[1].attachments).toEqual([{ id: 'a2', kind: 'image', url: '/chat-images/a2.png', mime: 'image/png' }])
  })

  it('无附件消息 attachments 落空数组，不留 undefined', () => {
    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages: [{ id: 1, session_id: 'session_1', role: 'user', content: '没有图', name: '用户' }]
    })
    expect(result.items[0].attachments).toEqual([])
  })

  it('limits fallback to the current window while always keeping explicit current messages', () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      session_id: 'session_1',
      role: index % 2 ? 'assistant' : 'user',
      content: `消息 ${index + 1}`,
      name: index % 2 ? '星依' : '用户'
    }))

    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages,
      windowSize: 2,
      currentMessageIds: [1]
    })

    expect(result.items.map((item) => item.messageId)).toEqual([1, 24, 25])
    expect(result.fallbackJobs.map((job) => job.messageId)).toEqual([1, 24, 25])
  })

  it('视图层按 role 收口私密指令剥离：用户消息剥离【【…】】，角色双层独白完整保留', () => {
    const result = buildProjectionFirstMessageView({
      sessionId: 'session_1',
      characterId: 'char_xingyi',
      messages: [
        { id: 1, session_id: 'session_1', role: 'user', content: '我们走吧【【提调：让她主动表白】】', name: '用户' },
        { id: 2, session_id: 'session_1', role: 'assistant', content: '他笑了笑【【她其实早就猜到了】】', name: '星依' }
      ],
      projections: []
    })

    // 用户消息：私密指令必须被剥离，绝不能泄漏到投影上下文
    expect(result.items[0].content).toBe('我们走吧')
    expect(result.items[0].content).not.toContain('提调')
    // 角色消息：双层括号是内心独白，必须完整保留
    expect(result.items[1].content).toBe('他笑了笑【【她其实早就猜到了】】')
  })

  it('excludes messages that cannot enter semantic projection context', () => {
    expect(isProjectionFirstEligibleMessage({ id: 1, role: 'system', content: 'system' })).toBe(false)
    expect(isProjectionFirstEligibleMessage({ id: 2, role: 'assistant', messageKind: 'narration_debug', content: 'debug' })).toBe(false)
    expect(isProjectionFirstEligibleMessage({ id: 3, role: 'assistant', messageKind: 'caps_reply', content: 'caps' })).toBe(false)
    expect(isProjectionFirstEligibleMessage({ id: 4, role: 'assistant', content: 'hidden', autoWriteHidden: true })).toBe(false)
    expect(isProjectionFirstEligibleMessage({ id: 5, role: 'assistant', messageKind: 'narration', content: '正式旁白' })).toBe(true)
  })
})
