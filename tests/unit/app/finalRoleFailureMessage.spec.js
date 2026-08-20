import { describe, expect, it } from 'vitest'
import {
  buildFinalRoleFailureMessage,
  classifyEmptyFinalReplyError
} from '../../../src/app/finalRoleFailureMessage.ts'

describe('finalRoleFailureMessage', () => {
  it('空模型返回被归类成人话错误，不泄露发送链路字段名', () => {
    const error = classifyEmptyFinalReplyError({
      returnedText: '',
      streamedText: '',
      normalizedReply: '',
      cleanedReply: '',
      visibleReply: ''
    })

    expect(error).toBe('模型原始返回为空：没有收到任何正文。')
    expect(error).not.toContain('returnedText')
    expect(error).not.toContain('streamedText')
  })

  it('失败仍生成归属原角色的普通聊天消息，不再生成 narration_debug', () => {
    const message = buildFinalRoleFailureMessage({
      error: '模型原始返回为空：没有收到任何正文。',
      speakerName: '宋青黛',
      speakerTargetId: 'char_song',
      model: 'gemini-test',
      time: '12:00:00'
    })

    expect(message).toMatchObject({
      role: 'assistant',
      messageKind: 'chat',
      message_kind: 'chat',
      name: '宋青黛',
      memberName: '宋青黛',
      speakerTargetId: 'char_song',
      includeInContext: false,
      model: 'gemini-test'
    })
    expect(message.content).toContain('【角色消息生成失败】')
    expect(message.content).toContain('按原提示词重试')
    expect(message.content).not.toContain('最终回复诊断')
    expect(message.content).not.toContain('```json')
  })
})
