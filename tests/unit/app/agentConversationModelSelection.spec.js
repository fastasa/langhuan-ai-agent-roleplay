import { describe, expect, it } from 'vitest'
import {
  buildAgentConversationModelAiOptions,
  createDefaultAgentConversationModelSelection,
  normalizeAgentConversationModelSelection
} from '../../../src/app/agentConversationModelSelection.ts'

describe('Agent conversation model selection', () => {
  it('星依和三类专业 Agent 默认都保持现役掌阁主循环', () => {
    for (const kind of ['xingyi', 'scriptwriter', 'cartographer', 'personality_trainer']) {
      expect(createDefaultAgentConversationModelSelection(kind)).toEqual({
        slotId: 'smart',
        effort: ''
      })
    }
  })

  it('只接受书童/校书/掌阁，非法 effort 回到模型默认', () => {
    expect(normalizeAgentConversationModelSelection({ slotId: 'balanced', effort: 'xhigh' }, 'xingyi'))
      .toEqual({ slotId: 'balanced', effort: 'xhigh' })
    expect(normalizeAgentConversationModelSelection({ slotId: 'message', effort: '危险 空格' }, 'scriptwriter'))
      .toEqual({ slotId: 'smart', effort: '' })
  })

  it('对话选择覆盖静态任务档，并把 effort 只注入本次 Agent 主循环', () => {
    const options = buildAgentConversationModelAiOptions({
      modelUsageConfigs: [{
        id: 'fast',
        label: '书童',
        presetName: 'Quick',
        model: 'quick-model',
        temperature: 0.2,
        maxTokens: 256,
        thinking: 'disabled',
        serviceTier: 'fast'
      }]
    }, {
      slotId: 'fast',
      effort: 'high'
    }, {
      temperature: 0.4,
      maxTokens: 4096,
      thinking: 'enabled'
    })

    expect(options).toEqual({
      modelUsageSlotId: 'fast',
      presetName: 'Quick',
      model: 'quick-model',
      temperature: 0.4,
      effort: 'high',
      serviceTier: 'fast',
      maxTokens: 4096,
      thinking: 'enabled'
    })
  })
})
