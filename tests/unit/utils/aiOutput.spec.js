import { describe, it, expect } from 'vitest'
import { normalizeAiOutput, normalizeAiOutputText, stripAiThoughtContentForRequest } from '../../../src/utils/aiOutput.ts'

describe('aiOutput', () => {
  it('会把 reasoning_content 和正文中的 think 合并成一段思维链', () => {
    const result = normalizeAiOutput(
      '第一段思考',
      '<think>第二段思考</think>\n正式回复'
    )

    expect(result).toBe('<think>第一段思考\n\n第二段思考</think>\n正式回复')
  })

  it('遇到重复思维链时会去重，避免 deepseek 显示两段', () => {
    const result = normalizeAiOutput(
      '重复思考',
      '<think>重复思考</think>\n正式回复'
    )

    expect(result).toBe('<think>重复思考</think>\n正式回复')
  })

  it('对已归一化文本再次处理时保持单段思维链', () => {
    const result = normalizeAiOutputText('<think>统一后的思考</think>\n正式回复')

    expect(result).toBe('<think>统一后的思考</think>\n正式回复')
  })

  it('发送给 AI 前会裁掉助手历史里的思考过程', () => {
    expect(stripAiThoughtContentForRequest({
      role: 'assistant',
      content: '<think>不要再喂给模型</think>\n正式回复'
    })).toEqual({
      role: 'assistant',
      content: '正式回复'
    })
    expect(stripAiThoughtContentForRequest({
      role: 'user',
      content: '<think>用户原文不在这里裁</think>\n问题'
    })).toEqual({
      role: 'user',
      content: '<think>用户原文不在这里裁</think>\n问题'
    })
  })
})
