import { describe, expect, it } from 'vitest'
import { buildPublicMilestoneRewritePrompt, readLatestPublicRecallMilestoneText } from '../../../src/app/recallPublicMilestones.ts'

describe('recallPublicMilestones', () => {
  it('公开过程润色提示词携带角色简介和性格，并禁止默认风格兜底与 OOC', () => {
    const prompt = buildPublicMilestoneRewritePrompt({
      characterName: '惊雨',
      characterDescription: '宿舍里的安静室友，习惯把关心藏在行动里。',
      characterPersonality: '谨慎、温柔但不直白。',
      speakingStyleSummary: '',
      milestones: [{
        id: 'recent',
        title: '我先接住最近几轮对话',
        text: '我先把近几轮对话收拢起来。',
        status: 'completed',
        sourceEventIds: ['event_recent']
      }]
    })

    expect(prompt).toContain('角色简介：宿舍里的安静室友，习惯把关心藏在行动里。')
    expect(prompt).toContain('角色性格：谨慎、温柔但不直白。')
    expect(prompt).toContain('说话风格摘要：')
    expect(prompt).not.toContain('自然、简短、克制')
    expect(prompt).not.toContain('短句，像')
    expect(prompt).toContain('必须严格扮演该角色来生成标题和文案，禁止 OOC')
  })

  it('召回运行中不把 summary 完成文案当作当前副标题', () => {
    const text = readLatestPublicRecallMilestoneText({
      status: 'running',
      publicMilestones: [
        {
          id: 'read',
          title: '我把能用的记忆取出来',
          text: '我还在读取最终确认的资料。',
          status: 'completed'
        },
        {
          id: 'summary',
          title: '我把这次要带进回复的东西收好',
          text: '我已经整理好本轮会用到的参考内容。',
          status: 'completed'
        }
      ]
    })

    expect(text).toBe('我还在读取最终确认的资料。')
    expect(text).not.toContain('已经整理好')
  })

  it('召回运行中优先显示仍在 started 的公开步骤', () => {
    const text = readLatestPublicRecallMilestoneText({
      status: 'running',
      publicMilestones: [
        {
          id: 'read',
          title: '我把能用的记忆取出来',
          text: '我还在读取最终确认的资料。',
          status: 'completed'
        },
        {
          id: 'judge',
          title: '我挑挑哪些线索真的贴题',
          text: '我还在逐批挑一遍贴题线索。',
          status: 'started'
        },
        {
          id: 'summary',
          title: '我把这次要带进回复的东西收好',
          text: '我已经整理好本轮会用到的参考内容。',
          status: 'completed'
        }
      ]
    })

    expect(text).toBe('我还在逐批挑一遍贴题线索。')
  })

  it('空召回活动不读取 publicMilestones 并返回空文案', () => {
    expect(readLatestPublicRecallMilestoneText(undefined)).toBe('')
    expect(readLatestPublicRecallMilestoneText(null)).toBe('')
  })
})
