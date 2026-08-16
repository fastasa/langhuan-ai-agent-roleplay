import { describe, expect, it, vi } from 'vitest'

// mock 桥模块：本文件只验证 aiAppService 的分流与模型列表，不真 spawn claude
vi.mock('../../../server/application/ai/claudeCodeBridge.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    callClaudeCodeBridge: vi.fn(async () => new Response(JSON.stringify({
      choices: [{ index: 0, message: { role: 'assistant', content: '桥回复' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
})

import { createAiAppService } from '../../../server/application/ai/aiAppService.js'
import { callClaudeCodeBridge } from '../../../server/application/ai/claudeCodeBridge.js'

function makeClaudeCodePreset() {
  return {
    name: '星依桥',
    provider_type: 'claude-code',
    base_url: 'claude-code://local',
    api_key: '',
    model: 'sonnet',
    available_models: '[]',
    is_default: 1,
    fallback_preset: ''
  }
}

describe('aiAppService × claude-code 订阅桥分流', () => {
  it('claude-code 预设短路进桥，不外呼 HTTP', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => makeClaudeCodePreset()),
      getPresetByName: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      ensureUserEntitlement: vi.fn()
    }
    const fetchMock = vi.fn()
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: '你好' }],
      false,
      undefined,
      {
        userId: 'user-1', sessionId: 'session-1', feature: 'role_message',
        tools: [{ type: 'function', function: { name: 'write_todo' } }], toolChoice: 'auto', effort: 'xhigh', thinking: 'enabled'
      }
    )

    expect(result.error).toBeUndefined()
    expect(result.model).toBe('sonnet')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(callClaudeCodeBridge).toHaveBeenCalledTimes(1)
    const bridgeInput = callClaudeCodeBridge.mock.calls[0][0]
    expect(bridgeInput.model).toBe('sonnet')
    expect(bridgeInput.effort).toBe('xhigh')
    expect(bridgeInput.thinking).toBe('enabled')
    expect(bridgeInput.tools).toHaveLength(1)
    expect(JSON.parse(bridgeInput.continuityKey)).toEqual({
      version: 2, userId: 'user-1', sessionId: 'session-1', feature: 'role_message', profileId: ''
    })
    const data = await result.upstream.json()
    expect(data.choices[0].message.content).toBe('桥回复')
  })

  it('桥抛错时走既有统一报错口径（异常不外溢）', async () => {
    callClaudeCodeBridge.mockRejectedValueOnce(new Error('未找到 claude 命令'))
    const repository = {
      getDefaultPreset: vi.fn(() => makeClaudeCodePreset()),
      getPresetByName: vi.fn()
    }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], false)

    expect(result.error).toContain('未找到 claude 命令')
    expect(result.status).toBe(500)
  })

  it('fetchModels 直连配置：claude-code 免密钥返回固定列表', async () => {
    const repository = { getDefaultPreset: vi.fn(), getPresetByName: vi.fn() }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.fetchModels({
      providerType: 'claude-code',
      baseUrl: 'claude-code://local',
      apiKey: '',
      allowDirectConfig: true
    })

    expect(result.ok).toBe(true)
    expect(result.data.data.map((item) => item.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
  })

  it('fetchModels 走已存预设：claude-code 预设同样返回固定列表', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(() => makeClaudeCodePreset())
    }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.fetchModels({ presetName: '星依桥' })

    expect(result.ok).toBe(true)
    expect(result.data.data).toHaveLength(4)
  })

  it('普通预设不受影响：仍走 HTTP models 端点', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(() => ({
        name: '普通',
        provider_type: 'openai-compatible',
        base_url: 'https://api.example.com',
        api_key: 'sk-x',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 0,
        fallback_preset: ''
      }))
    }
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: 'gpt-test' }] }) }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.fetchModels({ presetName: '普通' })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
