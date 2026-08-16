import { describe, expect, it } from 'vitest'
import { buildSummaryTranscriptLines } from '../../../src/utils/summaryTranscript.ts'

describe('summaryTranscript', () => {
  it('会在聊天记录中标出日期和天气变化', () => {
    const lines = buildSummaryTranscriptLines({
      messages: [
        {
          role: 'user',
          content: '早上出门了',
          created_at: '2026-04-09T08:00:00+08:00'
        },
        {
          role: 'assistant',
          content: '中午到公司了',
          created_at: '2026-04-09T12:30:00+08:00'
        },
        {
          role: 'user',
          content: '第二天继续开会',
          created_at: '2026-04-10T09:00:00+08:00'
        }
      ],
      weatherHistory: [
        { timestamp: Date.parse('2026-04-09T10:00:00+08:00'), weather: '小雨' }
      ]
    })

    expect(lines).toEqual([
      '1. [2026-04-09 08:00] 用户：早上出门了',
      '【天气变化提醒】2026-04-09 10:00 起天气变为 小雨，请按变化后的天气理解后续聊天内容。',
      '2. [2026-04-09 12:30] 助手：中午到公司了',
      '【日期变化提醒】从这里开始，日期切换为 2026-04-10，请按新日期理解后续聊天内容。',
      '3. [2026-04-10 09:00] 用户：第二天继续开会'
    ])
  })

  it('会在聊天记录中标出地点变化', () => {
    const lines = buildSummaryTranscriptLines({
      messages: [
        {
          role: 'user',
          content: '准备出发',
          created_at: '2026-04-09T08:00:00+08:00'
        },
        {
          role: 'user',
          content: '已经到图书馆了',
          created_at: '2026-04-09T09:30:00+08:00'
        }
      ],
      locationHistory: [
        { timestamp: Date.parse('2026-04-09T09:00:00+08:00'), from: '家里', to: '图书馆' }
      ]
    })

    expect(lines).toEqual([
      '1. [2026-04-09 08:00] 用户：准备出发',
      '【地点变化提醒】2026-04-09 09:00 起地点变为 图书馆，请按变化后的地点理解后续聊天内容。',
      '2. [2026-04-09 09:30] 用户：已经到图书馆了'
    ])
  })
})
