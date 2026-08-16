import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_TEMPLATES,
  getAiProviderTemplate,
  getKeylessAiProviderHint,
  isKeylessAiProvider,
  normalizeAiProviderType
} from '../../../shared/aiProviders.js'

describe('AI provider registry', () => {
  it('登记 Codex 订阅桥模板，并沿用免密钥正式门禁', () => {
    const template = getAiProviderTemplate('codex-subscription')

    expect(normalizeAiProviderType('codex-subscription')).toBe('codex-subscription')
    expect(AI_PROVIDER_TEMPLATES.some((item) => item.type === 'codex-subscription')).toBe(true)
    expect(template).toEqual(expect.objectContaining({
      label: 'Codex（订阅桥）',
      baseUrl: 'codex://local',
      model: 'default'
    }))
    expect(isKeylessAiProvider('codex-subscription')).toBe(true)
    expect(getKeylessAiProviderHint('codex-subscription')).toContain('ChatGPT 登录态')
  })

  it('普通 provider 仍要求密钥，Claude 订阅桥行为不变', () => {
    expect(isKeylessAiProvider('openai-compatible')).toBe(false)
    expect(isKeylessAiProvider('claude-code')).toBe(true)
    expect(getKeylessAiProviderHint('claude-code')).toContain('Claude Code 登录态')
  })

  it('登记 AGY 订阅桥模板，并复用本机 Google 登录态的免密钥门禁', () => {
    const template = getAiProviderTemplate('agy-subscription')

    expect(normalizeAiProviderType('agy-subscription')).toBe('agy-subscription')
    expect(template).toEqual(expect.objectContaining({
      label: 'AGY（订阅桥）',
      baseUrl: 'agy://local',
      model: 'default'
    }))
    expect(isKeylessAiProvider('agy-subscription')).toBe(true)
    expect(getKeylessAiProviderHint('agy-subscription')).toContain('Google 登录态')
  })
})
