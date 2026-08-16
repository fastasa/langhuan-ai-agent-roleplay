import { describe, expect, it } from 'vitest'
import {
  hasCharacterPersonalityModel,
  normalizeChatReplyPipelineMode,
  normalizeChatSessionReplyPipelineMode,
  normalizeCharacterReplyPipelineModeOverride,
  resolveConfiguredReplyPipelineMode,
  resolveSessionReplyPipelineMode,
  resolveReplyPipelineMode
} from '../../../src/app/chatReplyPipelineMode.ts'

describe('chatReplyPipelineMode', () => {
  it('retires legacy CAPS session values to normal recall', () => {
    expect(normalizeChatReplyPipelineMode('caps')).toBe('normal_recall')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'caps_network' },
      character: {}
    })).toBe('normal_recall')
  })

  it('keeps character normal recall overriding a retired CAPS session default', () => {
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'caps_network' },
      character: { replyPipelineModeOverride: 'normal_recall' }
    })).toBe('normal_recall')
  })

  it('retires legacy CAPS character overrides to follow session', () => {
    expect(normalizeCharacterReplyPipelineModeOverride('caps')).toBe('follow_session')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'normal_recall' },
      character: { reply_pipeline_mode_override: 'caps_network' }
    })).toBe('normal_recall')
  })

  it('supports personality model as a session mode and character override', () => {
    expect(normalizeChatReplyPipelineMode('personality')).toBe('personality_model')
    expect(resolveSessionReplyPipelineMode({
      reply_pipeline_mode: 'message_projection'
    })).toBe('personality_model')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'normal_recall' },
      character: { replyPipelineModeOverride: 'personality_model', personalityModelPath: 'personality-models/char_1' }
    })).toBe('personality_model')
  })

  // 无模型兜底（2026-07-06 用户拍板）：选了人格模型链路但角色没上传 ONNX 模型 → 有效模式回退普通召回。
  it('falls back to normal recall when personality model is selected but the character has no model', () => {
    expect(hasCharacterPersonalityModel({ personalityModelPath: 'personality-models/char_1' })).toBe(true)
    expect(hasCharacterPersonalityModel({ personality_model_path: 'personality-models/char_2' })).toBe(true)
    expect(hasCharacterPersonalityModel({ personalityModelPath: '  ' })).toBe(false)
    expect(hasCharacterPersonalityModel(null)).toBe(false)

    // 会话级人格模型 + 无模型角色 → 回退；配置态仍报 personality_model 供可见提示用。
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'personality_model' },
      character: { id: 'char_1' }
    })).toBe('normal_recall')
    expect(resolveConfiguredReplyPipelineMode({
      session: { replyPipelineMode: 'personality_model' },
      character: { id: 'char_1' }
    })).toBe('personality_model')

    // 角色覆盖人格模型 + 无模型 → 回退；角色解析失败（null）同样按无模型兜底。
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'normal_recall' },
      character: { replyPipelineModeOverride: 'personality_model' }
    })).toBe('normal_recall')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'personality_model' },
      character: null
    })).toBe('normal_recall')

    // 有模型不回退；snake_case 模型路径同样有效；pure_prompt 不受兜底影响。
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'personality_model' },
      character: { personality_model_path: 'personality-models/char_2' }
    })).toBe('personality_model')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'pure_prompt' },
      character: { id: 'char_1' }
    })).toBe('pure_prompt')
  })

  it('normalizes unknown character override values to follow session', () => {
    expect(normalizeCharacterReplyPipelineModeOverride('')).toBe('follow_session')
    expect(normalizeCharacterReplyPipelineModeOverride('session')).toBe('follow_session')
    expect(normalizeCharacterReplyPipelineModeOverride('strange')).toBe('follow_session')
  })

  it('supports pure prompt as a session mode only', () => {
    expect(normalizeChatReplyPipelineMode('pure')).toBe('pure_prompt')
    expect(resolveSessionReplyPipelineMode({
      replyPipelineMode: 'normal_recall',
      reply_pipeline_mode: 'pure_prompt'
    })).toBe('pure_prompt')
    expect(resolveReplyPipelineMode({
      session: { replyPipelineMode: 'normal_recall', reply_pipeline_mode: 'pure_prompt' },
      character: { replyPipelineModeOverride: 'normal_recall' }
    })).toBe('pure_prompt')
    expect(normalizeCharacterReplyPipelineModeOverride('pure_prompt')).toBe('follow_session')
  })

  it('keeps fast reply as a session orchestration mode while characters reuse normal recall', () => {
    expect(normalizeChatSessionReplyPipelineMode('fast')).toBe('fast_reply')
    expect(resolveSessionReplyPipelineMode({ reply_pipeline_mode: 'fast_reply' })).toBe('fast_reply')
    expect(resolveConfiguredReplyPipelineMode({
      session: { replyPipelineMode: 'fast_reply' },
      character: { id: 'char_1' }
    })).toBe('normal_recall')
  })
})
