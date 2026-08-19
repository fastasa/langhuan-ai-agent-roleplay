import { describe, expect, it } from 'vitest'
import {
  PromptAssemblyValidationError,
  assemblePromptFromMessages,
  assemblePromptFromSources
} from '../../../src/app/promptAssemblyPipeline.ts'

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

  it('strict 默认关闭，旧调用仍会宽松归一非法字段并稳定保留同序输入', () => {
    const result = assemblePromptFromSources({
      sources: [
        { id: 'first', role: 'invalid-role', kind: 'unknown-kind', content: '第一段', orderIndex: 'bad' },
        { id: 'second', role: 'system', kind: 'manual', content: '第二段', orderIndex: 0 }
      ]
    })

    expect(result.sources.map((source) => ({ id: source.id, role: source.role, kind: source.kind }))).toEqual([
      { id: 'first', role: 'system', kind: 'other' },
      { id: 'second', role: 'system', kind: 'manual' }
    ])
    expect(result.trace.strict).toBe(false)
  })

  it.each([
    {
      name: '非法 role',
      code: 'prompt_source_invalid_role',
      fragmentId: 'bad_role',
      sources: [{ id: 'bad_role', role: 'tool', kind: 'manual', content: '正文' }]
    },
    {
      name: '非法 kind',
      code: 'prompt_source_invalid_kind',
      fragmentId: 'bad_kind',
      sources: [{ id: 'bad_kind', role: 'system', kind: 'not-a-kind', content: '正文' }]
    },
    {
      name: '非法 orderIndex',
      code: 'prompt_source_invalid_order',
      fragmentId: 'bad_order',
      sources: [{ id: 'bad_order', role: 'system', kind: 'manual', content: '正文', orderIndex: '1' }]
    },
    {
      name: '重复 id',
      code: 'prompt_source_duplicate_id',
      fragmentId: 'duplicated',
      sources: [
        { id: 'duplicated', role: 'system', kind: 'manual', content: '第一段' },
        { id: 'duplicated', role: 'user', kind: 'manual', content: '第二段' }
      ]
    },
    {
      name: '显式顺序冲突',
      code: 'prompt_source_order_conflict',
      fragmentId: 'second',
      sources: [
        { id: 'first', role: 'system', kind: 'manual', content: '第一段', orderIndex: 10 },
        { id: 'second', role: 'user', kind: 'manual', content: '第二段', orderIndex: 10 }
      ]
    },
    {
      name: '未解析模板变量',
      code: 'prompt_source_unresolved_template_variable',
      fragmentId: 'template',
      sources: [{ id: 'template', role: 'system', kind: 'manual', content: '你好，{{ characterName }}。' }]
    }
  ])('strict 对$name fail-fast，并返回稳定 code 和 fragmentId', ({ sources, code, fragmentId }) => {
    try {
      assemblePromptFromSources({ strict: true, sources })
      throw new Error('预期 strict 校验失败')
    } catch (error) {
      expect(error).toBeInstanceOf(PromptAssemblyValidationError)
      expect(error).toMatchObject({ code, fragmentId })
    }
  })

  it('基于最终规范化有序 fragments 生成确定 digest，且不受 metadata 和输入排列影响', () => {
    const first = assemblePromptFromSources({
      strict: true,
      metadata: { generatedAt: '2026-08-18T12:00:00Z' },
      sources: [
        { id: 'user', kind: 'current_user_input', role: 'user', content: '继续。', orderIndex: 20, metadata: { traceTime: 1 } },
        { id: 'system', kind: 'manual', role: 'system', content: '保持身份。', orderIndex: 10, metadata: { traceTime: 1 } }
      ]
    })
    const second = assemblePromptFromSources({
      strict: true,
      metadata: { generatedAt: '2030-01-01T00:00:00Z' },
      sources: [
        { id: 'system', kind: 'manual', role: 'system', content: '保持身份。', orderIndex: 10, metadata: { traceTime: 999 } },
        { id: 'user', kind: 'current_user_input', role: 'user', content: '继续。', orderIndex: 20, metadata: { traceTime: 999 } }
      ]
    })

    expect(first.identity).toEqual(second.identity)
    expect(first.identity).toEqual(expect.objectContaining({
      schemaVersion: 'prompt-assembly-fragments-v1',
      digest: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/)
    }))
    expect(first.trace.assemblyDigest).toBe(first.identity.digest)
    expect(first.identity.fragments.map((fragment) => fragment.id)).toEqual(['system', 'user'])
  })

  it('任一规范化 fragment 内容变化都会改变 assembly digest', () => {
    const before = assemblePromptFromSources({
      strict: true,
      sources: [{ id: 'system', kind: 'manual', role: 'system', content: '版本一', orderIndex: 0 }]
    })
    const after = assemblePromptFromSources({
      strict: true,
      sources: [{ id: 'system', kind: 'manual', role: 'system', content: '版本二', orderIndex: 0 }]
    })

    expect(after.identity.digest).not.toBe(before.identity.digest)
  })

  it('assemblePromptFromMessages 也能 opt-in strict，而不会先吞掉非法 role', () => {
    expect(() => assemblePromptFromMessages([
      { role: 'tool', content: '工具正文' }
    ], { strict: true, idPrefix: 'formal' })).toThrowError(expect.objectContaining({
      code: 'prompt_source_invalid_role',
      fragmentId: 'formal_1'
    }))
  })
})
