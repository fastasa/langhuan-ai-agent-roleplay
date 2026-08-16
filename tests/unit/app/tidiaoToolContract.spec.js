import { describe, expect, it } from 'vitest'
import {
  TIDIAO_TOOL_CONTRACTS,
  getTidiaoToolContract,
  tidiaoToolBriefFields
} from '../../../src/app/tidiaoToolContract.ts'
import { runTidiaoCorrectionLoop } from '../../../src/app/tidiaoCorrectionLoop.ts'
import { createTidiaoChatMessageReadContext } from '../../../src/app/tidiaoChatMessageTools.ts'
import { createTidiaoChatMessageEditContext } from '../../../src/app/tidiaoChatMessageEditTools.ts'
import { createTidiaoMessagePromptContext } from '../../../src/app/tidiaoMessagePromptTools.ts'
import { createTidiaoMessageProjectionContext } from '../../../src/app/tidiaoMessageProjectionTools.ts'

describe('提调工具契约（批次 C·工具说明收口·单一真值源）', () => {
  it('十一个工具契约齐全（含批次B 问用户 + 2026-07-07 补写消息 + 2026-07-08 续回统筹），机器名唯一覆盖整族', () => {
    expect(TIDIAO_TOOL_CONTRACTS.map((c) => c.toolName).sort()).toEqual([
      'appendChatMessage',
      'askUser',
      'editChatMessage',
      'editMessagePrompt',
      'escalateCorrection',
      'readChatMessage',
      'readMessageProjection',
      'readMessagePrompt',
      'regenerateFromPrompt',
      'reprojectMessage',
      'resumeOrchestration'
    ])
  })

  it('续回统筹契约（2026-07-08）：instruction 可选（纯继续可不填），说明带「继续/接续」「已有消息全部保留」口径', () => {
    const resume = getTidiaoToolContract('resumeOrchestration')
    expect(resume.schema.required).toEqual([])
    expect(resume.schema.properties.instruction.type).toBe('string')
    expect(resume.whenToUse).toContain('继续')
    expect(resume.whenToUse).toContain('已有消息全部保留')
  })

  it('askUser 契约：question 必填、options/recommended 可选', () => {
    const ask = getTidiaoToolContract('askUser')
    expect(ask.schema.required).toEqual(['question'])
    expect(ask.schema.properties.options.type).toBe('array')
    expect(ask.whenToUse).toContain('拿不准')
  })

  it('每个契约都有非空 whenToUse 与 object schema（防被兜底成空参数）', () => {
    for (const contract of TIDIAO_TOOL_CONTRACTS) {
      expect(contract.whenToUse.length).toBeGreaterThan(0)
      expect(contract.label.length).toBeGreaterThan(0)
      expect(contract.schema.type).toBe('object')
      expect(typeof contract.schema.properties).toBe('object')
      expect(Array.isArray(contract.schema.required)).toBe(true)
    }
  })

  it('改原文/改提示词的 schema 必含 ref/oldText/newText', () => {
    for (const name of ['editChatMessage', 'editMessagePrompt']) {
      expect(getTidiaoToolContract(name).schema.required).toEqual(['ref', 'oldText', 'newText'])
    }
  })

  it('补写消息契约：ref/text 必填、afterText 可选，说明带文风模仿与截断补完口径', () => {
    const append = getTidiaoToolContract('appendChatMessage')
    expect(append.schema.required).toEqual(['ref', 'text'])
    expect(append.schema.properties.afterText.type).toBe('string')
    expect(append.whenToUse).toContain('截断')
    expect(append.whenToUse).toContain('文风')
    // 精准修改同样要求模仿目标消息文风（2026-07-07 用户拍板）。
    expect(getTidiaoToolContract('editChatMessage').whenToUse).toContain('文风')
  })

  it('getTidiaoToolContract 取不到时抛错（不静默回退空说明）', () => {
    expect(getTidiaoToolContract('readChatMessage').toolName).toBe('readChatMessage')
    expect(() => getTidiaoToolContract('不存在')).toThrow()
  })

  it('tidiaoToolBriefFields 返回与契约同源的 brief/schema', () => {
    const fields = tidiaoToolBriefFields('escalateCorrection')
    const contract = getTidiaoToolContract('escalateCorrection')
    expect(fields.brief).toBe(contract.whenToUse)
    expect(fields.schema).toBe(contract.schema)
  })
})

describe('纠偏 loop 工具说明确从契约取（收口防漂移）', () => {
  it('注册的每个工具 brief/schema 恒等于契约（含投影两件套 + 重生成）', async () => {
    const messages = [
      { id: 1, role: 'user', content: '今晚天气不错' },
      { id: 2, role: 'assistant', name: '阿澈', content: '是啊，凉风正好。' }
    ]
    const promptSources = [
      { kind: 'role', index: 1, messageId: 2, speakerName: '阿澈', promptText: '请用阿澈的口吻回应。' }
    ]
    let captured = []
    await runTidiaoCorrectionLoop({
      brief: { instruction: '随便', targets: [{ ref: '角色1', speakerName: '阿澈', originalText: '是啊，凉风正好。' }] },
      readContext: createTidiaoChatMessageReadContext(messages),
      editContext: createTidiaoChatMessageEditContext(messages),
      promptContext: createTidiaoMessagePromptContext(promptSources),
      projectionContext: createTidiaoMessageProjectionContext([]),
      // 注入重生成接缝 → regenerateFromPrompt 也注册，凑齐全部 9 个工具。
      regenerateFromEditedPrompt: () => ({ content: '新正文' }),
      callModel: ({ toolBriefs }) => {
        captured = toolBriefs
        // 不做任何工具调用直接收尾；本测试只校验工具说明来源，不关心 loop 终态（会抛「没做出纠偏」）。
        return JSON.stringify({ thought: 'x', done: true })
      }
    }).catch(() => {})

    // 防漂移：只校验「契约族」的 10 个经典编辑工具（9 + 始终注册的 askUser）brief/schema 恒等于契约（防再各处另写）。
    // R1-B deferred 模式起，runtime 会向 briefs 注入内置元工具 toolsearch（无契约·运行时件）；它不属契约族，过滤掉再比对。
    // 同理：若纠偏 loop 装配了全局池工具（如 updateCurtainScene·自带 brief/schema 非契约源），也不在此契约族断言范围内。
    const contractTools = captured.filter((tool) => TIDIAO_TOOL_CONTRACTS.some((c) => c.toolName === tool.name))
    expect(contractTools.length).toBe(10)
    for (const tool of contractTools) {
      const contract = getTidiaoToolContract(tool.name)
      expect(tool.brief).toBe(contract.whenToUse)
      expect(tool.schema).toBe(contract.schema)
    }
  })
})
