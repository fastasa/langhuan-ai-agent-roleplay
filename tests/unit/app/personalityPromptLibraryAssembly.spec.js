import { describe, expect, it } from 'vitest'
import { CHAT_HISTORY_PLACEHOLDER } from '../../../src/utils/promptContext.ts'
import { buildPersonalityPromptLibraryAssembly } from '../../../src/app/personalityPromptLibraryAssembly.ts'

describe('personalityPromptLibraryAssembly', () => {
  it('只从提示词库消息中收集 system 来源并保持顺序', () => {
    const result = buildPersonalityPromptLibraryAssembly({
      promptMessages: [
        { role: 'system', content: '身份约束' },
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: '当前输入模板不应进入人格模型 system' },
        { role: 'system', content: '表达约束' }
      ]
    })

    expect(result.systemPrompt).toBe('身份约束\n\n表达约束')
    expect(result.assembly.messages).toEqual([
      { role: 'system', content: '身份约束\n\n表达约束' }
    ])
    expect(result.assembly.promptBlocks).toEqual([
      { role: 'system', title: '提示词库系统提示词 1', content: '身份约束' },
      { role: 'system', title: '提示词库系统提示词 2', content: '表达约束' }
    ])
  })

  it('把命中情境挂载正文标记为 scenario_mounted 来源', () => {
    const result = buildPersonalityPromptLibraryAssembly({
      scenarioMountedPromptText: '挂载文风原文',
      promptMessages: [
        { role: 'system', content: '身份约束' },
        { role: 'system', content: '挂载文风原文' }
      ]
    })

    expect(result.systemPrompt).toBe('身份约束\n\n挂载文风原文')
    expect(result.assembly.trace.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title
    }))).toEqual([
      { id: 'prompt_library_1', kind: 'prompt_library', title: '提示词库系统提示词 1' },
      { id: 'scenario_mounted_2', kind: 'scenario_mounted', title: '情境挂载提示词' }
    ])
  })
})
