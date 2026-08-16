import { describe, expect, it } from 'vitest'

import {
  buildProjectionWritebackMergePrompt,
  buildProjectionWritebackSplitPrompt,
  normalizeProjectionWritebackMatchOutput,
  normalizeProjectionWritebackMergeOutput,
  normalizeProjectionWritebackSplitOutput,
  scoreProjectionWritebackTextSimilarity
} from '../../../src/app/personalityProjectionWriteback.ts'

describe('personalityProjectionWriteback', () => {
  it('builds the split prompt from selected projections only', () => {
    const prompt = buildProjectionWritebackSplitPrompt({
      characterName: '星依',
      projections: [{
        id: 'projection_1',
        messageId: 12,
        text: '用户告诉星依，今天晚上要整理书房。',
        speakerName: '用户',
        startEnv: '时间：晚上',
        endEnv: '时间：晚上'
      }]
    })

    expect(prompt.messages).toHaveLength(2)
    expect(prompt.finalPrompt).toContain('输出 JSON')
    expect(prompt.finalPrompt).toContain('projection_1')
    expect(prompt.finalPrompt).toContain('星依')
    // 轨迹写入硬要求：摘要与正文都必须带事件发生的日期与地点
    expect(prompt.finalPrompt).toContain('summary 与 content 都必须写明事件发生的时间（精确到日期）与地点')
    expect(prompt.finalPrompt).toContain('时间统一写到具体日期')
  })

  it('builds the merge prompt and keeps the date/location requirement', () => {
    const prompt = buildProjectionWritebackMergePrompt({
      characterName: '星依',
      event: {
        id: 'event_a',
        title: '整理书房',
        summary: '2026-06-08 在家中书房，用户和星依确认晚上整理书房。',
        content: '2026-06-08 晚上在家中书房，用户告诉星依要整理书房。',
        sourceProjectionIds: ['projection_1']
      },
      target: {
        id: 'trace_1',
        title: '书房整理',
        summary: '此前约定整理书房。',
        content: '用户提出要整理书房。'
      }
    })

    expect(prompt.messages).toHaveLength(2)
    expect(prompt.finalPrompt).toContain('融合后的摘要与正文都必须保留事件发生的时间（写到日期）与地点')
    expect(prompt.finalPrompt).toContain('含日期与地点')
  })

  it('normalizes split events and keeps only allowed source projections', () => {
    const events = normalizeProjectionWritebackSplitOutput(`{
      "events": [{
        "id": "event_a",
        "title": "整理书房",
        "summary": "用户和星依确认晚上整理书房。",
        "content": "用户告诉星依，晚上要整理书房。",
        "sourceProjectionIds": ["projection_1", "projection_x"]
      }]
    }`, ['projection_1'])

    expect(events).toEqual([expect.objectContaining({
      id: 'event_a',
      title: '整理书房',
      sourceProjectionIds: ['projection_1']
    })])
  })

  it('normalizes merge and match model outputs with fallbacks', () => {
    expect(() => normalizeProjectionWritebackMergeOutput('不是 JSON', {
      id: 'event_a',
      title: '新事件',
      summary: '摘要',
      content: '正文',
      sourceProjectionIds: ['projection_1']
    })).toThrow()

    expect(normalizeProjectionWritebackMergeOutput('{}', {
      id: 'event_a',
      title: '新事件',
      summary: '摘要',
      content: '正文',
      sourceProjectionIds: ['projection_1']
    })).toEqual({ title: '新事件', summary: '摘要', content: '正文' })

    expect(normalizeProjectionWritebackMatchOutput('{"targetId":"event_1","reason":"相同事项"}', ['event_1']).targetId).toBe('event_1')
    expect(() => normalizeProjectionWritebackMatchOutput('{"targetId":"event_x"}', ['event_1'])).toThrow()
  })

  it('scores similar projection and event text higher than unrelated text', () => {
    const close = scoreProjectionWritebackTextSimilarity('用户和星依晚上整理书房', '星依确认晚上整理书房的安排')
    const far = scoreProjectionWritebackTextSimilarity('用户和星依晚上整理书房', '早餐菜单换成豆浆')

    expect(close).toBeGreaterThan(far)
    expect(close).toBeGreaterThan(0)
  })
})
