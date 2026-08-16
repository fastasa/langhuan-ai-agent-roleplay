import { describe, expect, it } from 'vitest'
import { assemblePromptFromMessages, assemblePromptFromSources } from '../../../src/app/promptAssemblyPipeline.ts'

describe('promptAssemblyPipeline', () => {
  it('按来源顺序生成模型消息、日志区块和审计摘要', () => {
    const result = assemblePromptFromSources({
      mode: 'personality_model',
      policy: { id: 'personality-final', defaultRole: 'system' },
      sources: [
        {
          id: 'current_input',
          title: '当前用户输入',
          kind: 'current_user_input',
          role: 'user',
          content: '用户说继续。',
          orderIndex: 30
        },
        {
          id: 'prompt_library',
          title: '提示词库系统提示词',
          kind: 'prompt_library',
          content: '你只能扮演星依。',
          orderIndex: 10
        },
        {
          id: 'scenario_mounted',
          title: '情境挂载提示词',
          kind: 'scenario_mounted',
          content: '使用更轻快的短句。',
          orderIndex: 20
        }
      ]
    })

    expect(result.messages).toEqual([
      { role: 'system', content: '你只能扮演星依。' },
      { role: 'system', content: '使用更轻快的短句。' },
      { role: 'user', content: '用户说继续。' }
    ])
    expect(result.promptBlocks).toEqual([
      { role: 'system', title: '提示词库系统提示词', content: '你只能扮演星依。' },
      { role: 'system', title: '情境挂载提示词', content: '使用更轻快的短句。' },
      { role: 'user', title: '当前用户输入', content: '用户说继续。' }
    ])
    expect(result.trace).toEqual(expect.objectContaining({
      mode: 'personality_model',
      policyId: 'personality-final',
      sourceCount: 3,
      messageCount: 3,
      promptBlockCount: 3
    }))
    expect(result.trace.sources.map((source) => source.id)).toEqual([
      'prompt_library',
      'scenario_mounted',
      'current_input'
    ])
  })

  it('区分模型可见和日志可见，避免日志重新拼一份假提示词', () => {
    const result = assemblePromptFromSources({
      mode: 'normal_recall',
      sources: [
        {
          id: 'role_rule',
          title: '角色规则',
          kind: 'prompt_library',
          role: 'system',
          content: '保持角色身份。'
        },
        {
          id: 'debug_note',
          title: '调试说明',
          kind: 'runtime_notice',
          role: 'system',
          content: '只进日志，不发给模型。',
          modelVisible: false,
          logVisible: true
        },
        {
          id: 'hidden_empty',
          title: '空来源',
          kind: 'manual',
          role: 'system',
          content: '   '
        }
      ]
    })

    expect(result.messages).toEqual([
      { role: 'system', content: '保持角色身份。' }
    ])
    expect(result.promptBlocks).toEqual([
      { role: 'system', title: '角色规则', content: '保持角色身份。' },
      { role: 'system', title: '调试说明', content: '只进日志，不发给模型。' }
    ])
    expect(result.trace.modelVisibleSourceCount).toBe(1)
    expect(result.trace.logVisibleSourceCount).toBe(2)
    expect(result.trace.sources.find((source) => source.id === 'debug_note')).toEqual(expect.objectContaining({
      modelVisible: false,
      logVisible: true,
      contentLength: '只进日志，不发给模型。'.length
    }))
  })

  it('支持由放置策略合并相邻同角色消息，同时保留来源级日志块', () => {
    const result = assemblePromptFromSources({
      mode: 'personality_model',
      policy: {
        id: 'personality-system-user',
        mergeAdjacentSameRole: true
      },
      sources: [
        {
          id: 'identity',
          title: '身份底座',
          kind: 'character_identity',
          role: 'system',
          content: '你将以星依的身份回复。'
        },
        {
          id: 'prompt_library',
          title: '提示词库系统提示词',
          kind: 'prompt_library',
          role: 'system',
          content: '注意文风。'
        },
        {
          id: 'current_input',
          title: '当前用户输入',
          kind: 'current_user_input',
          role: 'user',
          content: '继续。'
        }
      ]
    })

    expect(result.messages).toEqual([
      { role: 'system', content: '你将以星依的身份回复。\n\n注意文风。' },
      { role: 'user', content: '继续。' }
    ])
    expect(result.promptBlocks.map((block) => block.title)).toEqual([
      '身份底座',
      '提示词库系统提示词',
      '当前用户输入'
    ])
    expect(result.trace.messages).toEqual([
      {
        role: 'system',
        sourceIds: ['identity', 'prompt_library'],
        contentLength: '你将以星依的身份回复。\n\n注意文风。'.length
      },
      {
        role: 'user',
        sourceIds: ['current_input'],
        contentLength: '继续。'.length
      }
    ])
  })

  it('相同 orderIndex 时保持输入顺序，不用 id 重新排序', () => {
    const result = assemblePromptFromSources({
      sources: [
        { id: 'z_source', title: '后字母来源', role: 'system', content: '第一段', orderIndex: 1 },
        { id: 'a_source', title: '前字母来源', role: 'system', content: '第二段', orderIndex: 1 }
      ]
    })

    expect(result.messages.map((message) => message.content)).toEqual(['第一段', '第二段'])
    expect(result.trace.sources.map((source) => source.id)).toEqual(['z_source', 'a_source'])
  })

  it('可以从最终 messages 同源派生 promptBlocks 和 trace', () => {
    const result = assemblePromptFromMessages([
      { role: 'system', content: '系统规则' },
      { role: 'user', content: '用户输入' }
    ], {
      mode: 'normal_recall',
      policyId: 'final-messages',
      sourceKind: 'manual'
    })

    expect(result.messages).toEqual([
      { role: 'system', content: '系统规则' },
      { role: 'user', content: '用户输入' }
    ])
    expect(result.promptBlocks).toEqual([
      { role: 'system', title: '系统区块 1', content: '系统规则' },
      { role: 'user', title: '用户区块 2', content: '用户输入' }
    ])
    expect(result.trace).toEqual(expect.objectContaining({
      mode: 'normal_recall',
      policyId: 'final-messages',
      messageCount: 2,
      promptBlockCount: 2
    }))
  })
})
