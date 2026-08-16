import { describe, expect, it } from 'vitest'
import {
  buildFocusedActionJudgeMessages,
  buildFocusedActionFinalMessages,
  parseFocusedActionJudgeOutput
} from '../../../src/app/focusedActionPrompt.ts'

describe('focusedActionPrompt', () => {
  it('书童只用简约格式判断隐私、回复形式和立即任务，不写正文', () => {
    expect(() => buildFocusedActionJudgeMessages('   ', '')).toThrow('动作输入不能为空')
    const messages = buildFocusedActionJudgeMessages('观察桌上的药瓶', '地点：药房\n最近发生：桌面有一只没有标签的药瓶。')
    const prompt = messages.map((message) => message.content).join('\n')
    expect(prompt).toContain('你是动作输入书童')
    expect(prompt).toContain('private | narration | 立即任务 | 描写重点')
    expect(prompt.match(/观察桌上的药瓶/g)).toHaveLength(1)
    expect(prompt).not.toContain('状态栏、剧本、种子')
    expect(prompt).not.toContain('配方：')
    expect(prompt).not.toContain('来源：')
    expect(prompt).not.toContain('输出 JSON')
  })

  it('严格解析书童的一行判断，错误结构不静默猜测', () => {
    expect(parseFocusedActionJudgeOutput('private | narration | 描写药瓶当前可见细节 | 聚焦外形、标签和摆放位置')).toEqual({
      visibility: 'private', responseKind: 'narration', instruction: '描写药瓶当前可见细节', focus: '聚焦外形、标签和摆放位置'
    })
    expect(parseFocusedActionJudgeOutput('public | answer | 回答当前门是否打开 | 只依据现场事实').responseKind).toBe('answer')
    expect(() => parseFocusedActionJudgeOutput('我觉得应该写一段旁白')).toThrow('书童动作判断格式无效')
    expect(() => parseFocusedActionJudgeOutput('unknown | narration | 写结果 | 看细节')).toThrow('书童动作判断可见性无效')
  })

  it('正式消息模型结合用户提示词库、提调计划、表达占比和字数建议生成动作结果', () => {
    const messages = buildFocusedActionFinalMessages({
      actionText: '观察桌上的药瓶',
      contextBlock: '【当前场景】\n地点：药房\n\n【最近发生的事】\n桌面有一只没有标签的药瓶。',
      decision: parseFocusedActionJudgeOutput('private | narration | 描写药瓶当前可见细节 | 聚焦外形、标签和摆放位置'),
      promptLibrarySystemPrompt: '禁用套话；使用克制的悬疑文风。',
      writingPlan: {
        content: '第三视角写清药瓶外形、无标签状态与桌面位置，不让现场角色察觉观察。',
        expressionMix: { action: 10, dialogue: 0, expression: 0, innerState: 10, narration: 80 },
        wordCountAdvice: { min: 500, max: 650 }
      }
    })
    const prompt = messages.map((message) => message.content).join('\n')
    expect(prompt).toContain('你是正式消息生成模型')
    expect(prompt).toContain('【提示词库系统提示词】\n禁用套话；使用克制的悬疑文风。')
    expect(prompt).toContain('【回复计划】')
    expect(prompt).toContain('动作 10%')
    expect(prompt).toContain('旁白 80%')
    expect(prompt).toContain('500–650 字')
    expect(prompt).toContain('描写药瓶当前可见细节')
    expect(prompt).toContain('聚焦外形、标签和摆放位置')
    expect(prompt.match(/观察桌上的药瓶/g)).toHaveLength(1)
    expect(prompt).toContain('[消息投影]')
    expect(prompt).toContain('[/消息投影]')
    expect(prompt).not.toContain('[动作可见性]')
    expect(prompt).not.toContain('配方：')
    expect(prompt).not.toContain('来源：')
    expect(prompt).not.toContain('状态栏、剧本、种子')
    expect(prompt).not.toContain('标记硬性格式')
    expect(prompt).not.toContain('你是提调')
  })
})
