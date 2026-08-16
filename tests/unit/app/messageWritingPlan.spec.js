import { describe, expect, it } from 'vitest'
import {
  buildTidiaoMessageWritingPlanMessages,
  parseMessageWritingPlanOutput
} from '../../../src/app/messageWritingPlan.ts'

describe('messageWritingPlan', () => {
  it('提调只收到写作规划任务，并严格交付内容计划、表达占比和建议字数', () => {
    const messages = buildTidiaoMessageWritingPlanMessages({
      mode: 'focused_action',
      currentInput: '观察桌上的药瓶',
      contextBlock: '药房桌面有一只没有标签的药瓶。',
      taskInstruction: '描写药瓶当前可见细节',
      focus: '外形、标签和摆放位置'
    })
    const prompt = messages.map((message) => message.content).join('\n')
    expect(prompt).toContain('只负责三件事')
    expect(prompt).toContain('不写用户最终看到的正文')
    expect(prompt).toContain('expressionMix')
    expect(prompt).toContain('wordCountAdvice')
    expect(prompt).toContain('角色计划与方向：性格第一')
    expect(prompt).toContain('角色性格是最高优先级的创作判断')
    expect(prompt.match(/角色计划与方向：性格第一/g)).toHaveLength(1)
    expect(prompt.match(/观察桌上的药瓶/g)).toHaveLength(1)
    expect(prompt).not.toContain('[消息投影]')
  })

  it('严格解析写作计划，不接受缺占比、错误合计或正文式非 JSON 输出', () => {
    expect(parseMessageWritingPlanOutput(JSON.stringify({
      content: '第三视角描写擦拭盐霜的动作与剑刃恢复光泽的即时结果。',
      expressionMix: { action: 55, dialogue: 0, expression: 5, innerState: 5, narration: 35 },
      wordCountAdvice: { min: 500, max: 700 }
    }))).toEqual({
      content: '第三视角描写擦拭盐霜的动作与剑刃恢复光泽的即时结果。',
      expressionMix: { action: 55, dialogue: 0, expression: 5, innerState: 5, narration: 35 },
      wordCountAdvice: { min: 500, max: 700 }
    })
    expect(() => parseMessageWritingPlanOutput('{"content":"写结果"}')).toThrow('表达占比无效')
    expect(() => parseMessageWritingPlanOutput(JSON.stringify({
      content: '写结果',
      expressionMix: { action: 50, dialogue: 30, expression: 20, innerState: 10, narration: 10 },
      wordCountAdvice: { min: 500, max: 700 }
    }))).toThrow('表达占比无效')
    expect(() => parseMessageWritingPlanOutput('这里直接写一段正文。')).toThrow('必须只输出 JSON 对象')
  })
})
