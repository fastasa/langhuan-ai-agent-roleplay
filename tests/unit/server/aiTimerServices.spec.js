import { describe, expect, it, vi } from 'vitest'
import { createAiAppService, callInternalAIJson } from '../../../server/application/ai/aiAppService.js'
import { createTimerAppService } from '../../../server/application/timer/timerAppService.js'

function createDbStub(overrides = {}) {
  return {
    prepare(sql) {
      const handler = overrides[sql] || {}
      return {
        all: handler.all || vi.fn(() => []),
        get: handler.get || vi.fn(() => undefined),
        run: handler.run || vi.fn()
      }
    }
  }
}

describe('ai and timer app services', () => {
  it('ai service reads default preset and returns success upstream', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
          name: 'default',
          base_url: 'https://api.example.com',
          api_key: 'secret-key',
          model: 'gpt-test',
          available_models: '[]',
          is_default: 1,
          fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true)

    expect(result.error).toBeUndefined()
    expect(result.model).toBe('gpt-test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ai service supports GLM provider base url without adding extra v1 path', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
          name: 'glm',
          base_url: 'https://open.bigmodel.cn/api/paas/v4',
          api_key: 'glm-key',
          model: 'glm-5.1',
          available_models: '[]',
          max_tokens: 2048,
          temperature: 0.7,
          is_default: 1,
          fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.error).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    expect(body.max_tokens).toBe(2048)
    expect(body.max_completion_tokens).toBeUndefined()
  })

  it('ai service sends DeepSeek thinking disabled when requested', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'deepseek',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        api_key: 'deepseek-key',
        model: 'deepseek-v4-flash',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.error).toBeUndefined()
    expect(body.max_tokens).toBe(128)
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('ai service queues repeated calls to the same model by min interval', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T00:00:00.000Z'))
    try {
      const repository = {
        getDefaultPreset: vi.fn(() => ({
          name: 'queued-deepseek',
          provider_type: 'deepseek',
          base_url: 'https://api.deepseek.example',
          api_key: 'deepseek-key',
          model: 'deepseek-queued-model',
          available_models: '[]',
          max_tokens: 512,
          temperature: 0.7,
          is_default: 1,
          fallback_preset: '',
          min_interval: 2
        })),
        getPresetByName: vi.fn()
      }
      const fetchMock = vi.fn(async () => ({
        ok: true,
        body: { getReader: () => ({ read: async () => ({ done: true }) }) }
      }))
      const service = createAiAppService(repository, fetchMock, {})

      await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '第一次' }], false, undefined, {})
      const second = service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '第二次' }], false, undefined, {})

      await Promise.resolve()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await second
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ai service sends GLM thinking disabled when requested', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'glm',
        provider_type: 'glm',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'glm-key',
        model: 'glm-5.1',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.error).toBeUndefined()
    expect(body.max_tokens).toBe(128)
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('ai service sends Qwen enable_thinking false when requested', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'qwen',
        provider_type: 'openai-compatible',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        api_key: 'qwen-key',
        model: 'qwen3-plus',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.enable_thinking).toBe(false)
    expect(body.prompt_cache_key).toBeUndefined()
    expect(body.prompt_cache_options).toBeUndefined()
  })

  it('ai service sends OpenRouter reasoning exclusion when requested', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'openrouter',
        provider_type: 'openai-compatible',
        base_url: 'https://openrouter.ai/api/v1',
        api_key: 'openrouter-key',
        model: 'deepseek/deepseek-r1',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.reasoning).toEqual({ effort: 'none', exclude: true })
  })

  it('ai service sends OpenAI reasoning_effort none when requested for reasoning models', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'openai',
        provider_type: 'openai-compatible',
        base_url: 'https://api.openai.com/v1',
        api_key: 'openai-key',
        model: 'gpt-5.1',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.reasoning_effort).toBe('none')
  })

  it('官方 OpenAI GPT-5.6 提调请求带稳定 cache key，并在 system 末尾设置显式断点', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'openai',
        provider_type: 'openai-compatible',
        base_url: 'https://api.openai.com/v1',
        api_key: 'openai-key',
        model: 'gpt-5.6',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      ensureUserEntitlement: vi.fn(() => undefined),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [
        { role: 'system', content: '稳定的提调系统前缀' },
        { role: 'user', content: '本轮动态内容' }
      ],
      false,
      undefined,
      {
        userId: 'user-1',
        sessionId: 'session-1',
        feature: 'agent',
        profileId: 'tidiao.director-round',
        tools: [{ type: 'function', function: { name: 'read_status', parameters: { type: 'object' } } }]
      }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.prompt_cache_key).toMatch(/^lh:[a-f0-9]{64}$/)
    expect(body.prompt_cache_options).toEqual({ mode: 'explicit' })
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: [{
        type: 'text',
        text: '稳定的提调系统前缀',
        prompt_cache_breakpoint: { mode: 'explicit' }
      }]
    })
    expect(body.messages[1]).toEqual({ role: 'user', content: '本轮动态内容' })
  })

  it('ai service sends Gemini disabled reasoning effort when requested for supported flash models', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'gemini',
        provider_type: 'openai-compatible',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        api_key: 'gemini-key',
        model: 'gemini-2.5-flash',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.reasoning_effort).toBe('none')
  })

  it('ai service lowers Gemini 3.1 Pro thinking when thinking output is disabled', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'gemini',
        provider_type: 'openai-compatible',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        api_key: 'gemini-key',
        model: 'gemini-3.1-pro-preview-thinking',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'role_message', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.reasoning_effort).toBe('low')
  })

  it('ai service sends MiniMax reasoning split when requested', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'minimax',
        provider_type: 'minimax',
        base_url: 'https://api.minimax.io/v1',
        api_key: 'minimax-key',
        model: 'MiniMax-M2.7',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.reasoning_split).toBe(true)
  })

  it('ai service retries DeepSeek request without thinking when provider rejects the option', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'deepseek',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        api_key: 'deepseek-key',
        model: 'deepseek-v4-flash',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.thinking) {
        return { ok: false, status: 400, text: async () => '{"error":"unsupported thinking"}' }
      }
      return {
        ok: true,
        body: { getReader: () => ({ read: async () => ({ done: true }) }) }
      }
    })
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: 'C01 | ?' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body)

    expect(result.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(firstBody.thinking).toEqual({ type: 'disabled' })
    expect(retryBody.thinking).toBeUndefined()
  })

  it('ai service does not send thinking option to providers without thinking control', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'openai',
        provider_type: 'openai-compatible',
        base_url: 'https://api.example.com/v1',
        api_key: 'openai-key',
        model: 'gpt-test',
        available_models: '[]',
        max_tokens: 512,
        temperature: 0.7,
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: '你好' }],
      false,
      undefined,
      { feature: 'agent', maxTokens: 128, thinking: 'disabled' }
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(body.thinking).toBeUndefined()
  })

  it('ai service calls GLM embeddings endpoint with configured dimensions', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        id: 'embedding_1',
        name: '智谱嵌入',
        provider_type: 'glm',
        capability: 'embedding',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'glm-key',
        model: 'embedding-3',
        embedding_dimension: 512
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(() => ({
        id: 'embedding_1',
        name: '智谱嵌入',
        provider_type: 'glm',
        capability: 'embedding',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        encrypted_api_key: 'plain:Z2xtLWtleQ==',
        model: 'embedding-3',
        embedding_dimension: 512,
        max_tokens: 4096,
        temperature: 1,
        prompt_price_per_million_cents: 50,
        completion_price_per_million_cents: 0,
        fallback_preset_id: '',
        enabled: 1,
        is_default: 1
      }))
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        model: 'embedding-3',
        object: 'list',
        data: [{ index: 0, object: 'embedding', embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 }
      })
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.createEmbeddings({ input: ['惊雨的记忆标签'] })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/paas/v4/embeddings')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer glm-key')
    expect(body.model).toBe('embedding-3')
    expect(body.input).toEqual(['惊雨的记忆标签'])
    expect(body.dimensions).toBe(512)
  })

  it('ai service can call embeddings with a selected local preset id', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(() => ({
        id: 'embedding_selected',
        name: '指定嵌入',
        provider_type: 'glm',
        capability: 'embedding',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'selected-key',
        model: 'embedding-3',
        embedding_dimension: 256
      })),
      getManagedPresetByName: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      getManagedPresetById: vi.fn(() => ({
        id: 'embedding_selected',
        name: '指定嵌入',
        provider_type: 'glm',
        capability: 'embedding',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        encrypted_api_key: 'plain:c2VsZWN0ZWQta2V5',
        model: 'embedding-3',
        embedding_dimension: 256,
        max_tokens: 4096,
        temperature: 1,
        prompt_price_per_million_cents: 50,
        completion_price_per_million_cents: 0,
        fallback_preset_id: '',
        enabled: 1,
        is_default: 0
      }))
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        model: 'embedding-3',
        data: [{ index: 0, object: 'embedding', embedding: [0.4, 0.8] }],
        usage: { prompt_tokens: 4, completion_tokens: 0, total_tokens: 4 }
      })
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.createEmbeddings({
      presetId: 'embedding_selected',
      input: '最近三轮上下文'
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.ok).toBe(true)
    expect(result.presetId).toBe('embedding_selected')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer selected-key')
    expect(body.dimensions).toBe(256)
    expect(repository.getDefaultPreset).not.toHaveBeenCalled()
  })

  it('ai service does not expose a provider-managed preset catalogue', () => {
    const repository = {
      listManagedPresets: vi.fn(() => [
        {
          id: 'embedding_1',
          name: '智谱嵌入',
          provider_type: 'glm',
          capability: 'embedding',
          model: 'embedding-3',
          embedding_dimension: 512,
          enabled: 1,
          is_default: 1
        },
        {
          id: 'chat_1',
          name: '聊天',
          provider_type: 'glm',
          capability: 'chat',
          model: 'glm-5.1',
          embedding_dimension: 0,
          enabled: 1,
          is_default: 0
        },
        {
          id: 'disabled_embedding',
          name: '停用嵌入',
          provider_type: 'glm',
          capability: 'embedding',
          model: 'embedding-3',
          embedding_dimension: 512,
          enabled: 0,
          is_default: 0
        }
      ])
    }
    const service = createAiAppService(repository, vi.fn(), {})

    expect(service.listManagedPresetMetadata).toBeUndefined()
  })

  it('ai service does not use embedding-only preset for chat calls', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(() => ({
        id: 'embedding_1',
        name: '智谱嵌入',
        provider_type: 'glm',
        capability: 'embedding',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        encrypted_api_key: 'plain:Z2xtLWtleQ==',
        model: 'embedding-3',
        embedding_dimension: 512,
        max_tokens: 4096,
        temperature: 1,
        enabled: 1,
        is_default: 0
      }))
    }
    const fetchMock = vi.fn()
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback('智谱嵌入', undefined, [{ role: 'user', content: '你好' }], true)

    expect(result.error).toBe('未找到 API 预设，请先在设置中配置')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ai service uses the locally configured default preset', async () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'custom-default',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'glm-key',
        model: 'glm-5.1',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(() => ({
        id: 'managed_1',
        name: 'Ddeepseek',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        encrypted_api_key: 'plain:bWFuYWdlZC1rZXk=',
        model: 'deepseek-v4-flash',
        max_tokens: 4096,
        temperature: 1,
        prompt_price_per_million_cents: 0,
        completion_price_per_million_cents: 0,
        fallback_preset_id: '',
        enabled: 1,
        is_default: 0
      })),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        chat_enabled: 1,
        agent_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0 })),
      insertUsageLedger
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true, undefined, {
      userId: 'user_1',
      feature: 'role_message'
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(result.error).toBeUndefined()
    expect(result.presetId).toBeUndefined()
    expect(result.presetName).toBe('custom-default')
    expect(result.model).toBe('glm-5.1')
    expect(result.managedPreset).toBeUndefined()
    expect(body.model).toBe('glm-5.1')
    expect(repository.getDefaultPreset).toHaveBeenCalled()
    expect(insertUsageLedger).not.toHaveBeenCalled()
    expect(service.recordActualChatUsage(result.usageLedger, { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      presetName: 'custom-default',
      model: 'glm-5.1',
      inputTokens: 11,
      outputTokens: 7
    }))
  })

  // 缓存可见性（2026-07-07）：只有 Claude Code 订阅桥的 usage 会带 cache_read/cache_creation
  // input_tokens 拆分，需原样透传进账本，不能被吞掉、也不能污染没有该字段的普通 provider。
  it('threads cache_read/cache_creation input tokens from usage into the ledger when present', async () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'custom-default',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'glm-key',
        model: 'glm-5.1',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(() => ({
        id: 'managed_1',
        name: 'Ddeepseek',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        encrypted_api_key: '',
        model: 'deepseek-v4-flash',
        enabled: 1,
        is_default: 1,
        capability: 'chat'
      })),
      ensureUserEntitlement: vi.fn(() => ({
        default_preset_id: 'managed_1',
        chat_enabled: 1,
        agent_enabled: 1,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0 })),
      insertUsageLedger
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true, undefined, {
      userId: 'user_1',
      feature: 'agent_task'
    })
    expect(service.recordActualChatUsage(result.usageLedger, {
      prompt_tokens: 70000,
      completion_tokens: 3000,
      total_tokens: 73000,
      cache_read_input_tokens: 65000,
      cache_creation_input_tokens: 4000
    })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 70000,
      outputTokens: 3000,
      cacheReadTokens: 65000,
      cacheCreationTokens: 4000
    }))
  })

  // P2 批 E4（2026-07-12·缓存命中可观测化）：OpenAI 及一切 OpenAI 兼容协议（含 GLM/MiniMax，
  // GPT-5.6+ 同时用 cache_write_tokens 报告显式/隐式缓存写入。
  it('normalizeActualUsageTokens 归一 OpenAI cached_tokens 与 cache_write_tokens', () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      insertUsageLedger
    }
    const service = createAiAppService(repository, vi.fn(), {})
    const context = {
      userId: 'user_1',
      feature: 'role_message',
      preset: { name: 'p', base_url: 'https://api.openai.com', prompt_price_per_million_cents: 0, completion_price_per_million_cents: 0 },
      model: 'gpt-test'
    }

    expect(service.recordActualChatUsage(context, {
      prompt_tokens: 1000,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 120 }
    })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 1000,
      outputTokens: 50,
      cacheReadTokens: 800,
      cacheCreationTokens: 120,
      errorCode: ''
    }))
  })

  // DeepSeek 方言：prompt_cache_hit_tokens（命中）/prompt_cache_miss_tokens（未命中，未直接使用——
  // prompt_tokens = hit + miss，inputTokens 口径已隐含），同样无 cache_creation 概念。
  it('normalizeActualUsageTokens 归一 DeepSeek 方言 prompt_cache_hit_tokens', () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      insertUsageLedger
    }
    const service = createAiAppService(repository, vi.fn(), {})
    const context = {
      userId: 'user_1',
      feature: 'role_message',
      preset: { name: 'p', base_url: 'https://api.deepseek.com', prompt_price_per_million_cents: 0, completion_price_per_million_cents: 0 },
      model: 'deepseek-chat'
    }

    expect(service.recordActualChatUsage(context, {
      prompt_tokens: 900,
      completion_tokens: 40,
      prompt_cache_hit_tokens: 700,
      prompt_cache_miss_tokens: 200
    })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 900,
      outputTokens: 40,
      cacheReadTokens: 700,
      cacheCreationTokens: 0,
      errorCode: ''
    }))
  })

  // 方言优先级：Anthropic 原生字段（含 claude-code 桥）存在时优先，不误取同一 usage 对象里
  // 可能同时出现的 DeepSeek/OpenAI 方言字段（正常业务不会同时出现，这里只验证「取第一个非空」的顺序）。
  it('normalizeActualUsageTokens 在多方言字段并存时优先取 Anthropic 原生字段', () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      insertUsageLedger
    }
    const service = createAiAppService(repository, vi.fn(), {})
    const context = {
      userId: 'user_1',
      feature: 'agent_task',
      preset: { name: 'p', base_url: 'https://x.example.com', prompt_price_per_million_cents: 0, completion_price_per_million_cents: 0 },
      model: 'test-model'
    }

    expect(service.recordActualChatUsage(context, {
      prompt_tokens: 500,
      completion_tokens: 20,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 10,
      prompt_cache_hit_tokens: 999,
      prompt_tokens_details: { cached_tokens: 888 }
    })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      cacheReadTokens: 300,
      cacheCreationTokens: 10
    }))
  })

  it('agent-scoped activity keeps its detailed feature in usage ledger', async () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'custom-default',
        base_url: 'https://open.bigmodel.cn/api/paas/v4',
        api_key: 'glm-key',
        model: 'glm-5.1',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn((id) => id === 'agent_preset'
        ? {
            id: 'agent_preset',
            name: 'Agent Preset',
            provider_type: 'deepseek',
            capability: 'chat',
            base_url: 'https://api.deepseek.com',
            encrypted_api_key: 'plain:YWdlbnQta2V5',
            model: 'deepseek-agent',
            max_tokens: 4096,
            temperature: 1,
            prompt_price_per_million_cents: 0,
            completion_price_per_million_cents: 0,
            fallback_preset_id: '',
            enabled: 1,
            is_default: 0
          }
        : undefined),
      getDefaultManagedPreset: vi.fn(),
      // 额度四档化：事件候选这类未标槽位的调用回退校书 balanced 档，吃该档预设与模型覆写。
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        balanced_preset_id: 'agent_preset',
        balanced_model: 'deepseek-agent-override',
        fast_enabled: 1,
        balanced_enabled: 1,
        smart_enabled: 1,
        embedding_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0 })),
      insertUsageLedger
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '生成候选' }], true, undefined, {
      userId: 'user_1',
      feature: 'event_candidate',
      maxTokens: 128
    })

    expect(result.error).toBeUndefined()
    expect(result.presetId).toBeUndefined()
    expect(result.model).toBe('glm-5.1')
    expect(repository.getDefaultPreset).toHaveBeenCalled()
    expect(insertUsageLedger).not.toHaveBeenCalled()
    expect(service.recordActualChatUsage(result.usageLedger, { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'event_candidate',
      presetName: 'custom-default',
      model: 'glm-5.1',
      inputTokens: 9,
      outputTokens: 3
    }))
  })

  // P0 记账收口（2026-07-12）：recordActualChatUsage 此前在 usage 缺失/格式不认识时直接 return false、
  // 一行都不写；现在始终写一条 success 行（token 记 0），errorCode 借用做「usage 缺失」标记，
  // 保证服务端内部调用即便拿不到 usage 也照样计入额度基数，不再被 hard_stop 系统性绕过。
  it('recordActualChatUsage 在 usage 缺失/不认识格式时仍写 0-token success 行并标记 usage_missing', () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      insertUsageLedger
    }
    const service = createAiAppService(repository, vi.fn(), {})
    const context = {
      userId: 'user_1',
      feature: 'agent',
      preset: { name: 'p', base_url: 'https://x.example.com', prompt_price_per_million_cents: 0, completion_price_per_million_cents: 0 },
      model: 'gpt-test'
    }

    expect(service.recordActualChatUsage(context, undefined)).toBe(true)
    expect(service.recordActualChatUsage(context, { foo: 'bar' })).toBe(true)
    expect(insertUsageLedger).toHaveBeenCalledTimes(2)
    for (const call of insertUsageLedger.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        status: 'success',
        inputTokens: 0,
        outputTokens: 0,
        errorCode: 'usage_missing'
      }))
    }
  })

  // callInternalAIJson 收口 8 处服务端内部调用点（消息投影/起标题等）共用的成功记账路径：
  // 内部固定 stream=false 调 callAIWithFallback → 读 upstream.json() → 成功必写 success 账本行。
  it('callInternalAIJson 内部调用成功后写入一条 success 账本行并回传解析后的 json', async () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      // getPresetConfig 在 context.userId 有值时会先查按用户走的额度/托管预设分支；这里不测那条分支，
      // 让它们统统落空以便回退到上面的 getDefaultPreset()（与「不指定用户」的默认路径行为一致）。
      ensureUserEntitlement: vi.fn(() => undefined),
      getDefaultManagedPreset: vi.fn(() => undefined),
      insertUsageLedger
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好' } }],
        usage: { prompt_tokens: 12, completion_tokens: 5 }
      })
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await callInternalAIJson(
      service,
      undefined,
      undefined,
      [{ role: 'user', content: '你好' }],
      undefined,
      { userId: 'user_1', feature: 'agent' }
    )

    expect(result.error).toBeUndefined()
    expect(result.jsonParseError).toBeUndefined()
    expect(result.json?.choices?.[0]?.message?.content).toBe('你好')
    expect(insertUsageLedger).toHaveBeenCalledTimes(1)
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      inputTokens: 12,
      outputTokens: 5,
      errorCode: ''
    }))
  })

  it('callInternalAIJson 在 provider 不回 usage 时仍写 0-token success 行（不再静默漏记）', async () => {
    const insertUsageLedger = vi.fn()
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      // getPresetConfig 在 context.userId 有值时会先查按用户走的额度/托管预设分支；这里不测那条分支，
      // 让它们统统落空以便回退到上面的 getDefaultPreset()（与「不指定用户」的默认路径行为一致）。
      ensureUserEntitlement: vi.fn(() => undefined),
      getDefaultManagedPreset: vi.fn(() => undefined),
      insertUsageLedger
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '好的' } }] }) // 无 usage 字段
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await callInternalAIJson(
      service,
      undefined,
      undefined,
      [{ role: 'user', content: 'hi' }],
      undefined,
      { userId: 'user_1', feature: 'agent' }
    )

    expect(result.json?.choices?.[0]?.message?.content).toBe('好的')
    expect(insertUsageLedger).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      inputTokens: 0,
      outputTokens: 0,
      errorCode: 'usage_missing'
    }))
  })

  it('does not apply hidden account request budgets in the local workspace', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        chat_enabled: 1,
        agent_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn((_userId, period) => period === 'day'
        ? { spentCents: 0, tokens: 0, requests: 1 }
        : { spentCents: 0, tokens: 0, requests: 0 }),
      summarizeRecentErrors: vi.fn(() => ({ errorCount: 0, latestErrorAt: '' })),
      insertUsageLedger: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {
      LANGHUAN_AI_DAILY_REQUEST_LIMIT: '1',
      LANGHUAN_AI_DAILY_TOKEN_LIMIT: '0'
    })

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true, undefined, {
      userId: 'user_1',
      role: 'user'
    })

    expect(result.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps local preset execution independent from legacy account roles', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'local',
        default_preset_id: '',
        chat_enabled: 1,
        agent_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 9999999, requests: 9999 })),
      summarizeRecentErrors: vi.fn(() => ({ errorCount: 99, latestErrorAt: new Date().toISOString() })),
      insertUsageLedger: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {
      LANGHUAN_AI_DAILY_REQUEST_LIMIT: '1',
      LANGHUAN_AI_DAILY_TOKEN_LIMIT: '1',
      LANGHUAN_AI_ERROR_THRESHOLD: '1'
    })

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true, undefined, {
      userId: 'local'
    })

    expect(result.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not apply hidden account cooldowns in the local workspace', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        chat_enabled: 1,
        agent_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0, requests: 0 })),
      summarizeRecentErrors: vi.fn(() => ({ errorCount: 3, latestErrorAt: new Date().toISOString() })),
      insertUsageLedger: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    }))
    const service = createAiAppService(repository, fetchMock, {
      LANGHUAN_AI_DAILY_REQUEST_LIMIT: '0',
      LANGHUAN_AI_DAILY_TOKEN_LIMIT: '0',
      LANGHUAN_AI_ERROR_THRESHOLD: '3',
      LANGHUAN_AI_ERROR_WINDOW_MS: '600000',
      LANGHUAN_AI_ERROR_COOLDOWN_MS: '300000'
    })

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], true, undefined, {
      userId: 'user_1',
      role: 'user'
    })

    expect(result.error).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports local upstream errors without exposing API keys', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({
        id: 'local_1',
        name: '本地预设',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        api_key: 'managed-key',
        model: 'deepseek-secret-model',
        max_tokens: 4096,
        temperature: 1
      })),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn(),
      getManagedPresetById: vi.fn(),
      getDefaultManagedPreset: vi.fn(() => ({
        id: 'managed_1',
        name: 'Managed DeepSeek',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com',
        encrypted_api_key: 'plain:bWFuYWdlZC1rZXk=',
        model: 'deepseek-secret-model',
        max_tokens: 4096,
        temperature: 1,
        prompt_price_per_million_cents: 0,
        completion_price_per_million_cents: 0,
        fallback_preset_id: '',
        enabled: 1,
        is_default: 1
      })),
      ensureUserEntitlement: vi.fn(() => ({
        user_id: 'user_1',
        default_preset_id: '',
        chat_enabled: 1,
        agent_enabled: 1,
        daily_limit_cents: 0,
        monthly_limit_cents: 0,
        monthly_token_limit: 0,
        hard_stop_enabled: 1
      })),
      summarizeUsage: vi.fn(() => ({ spentCents: 0, tokens: 0, requests: 0 })),
      summarizeRecentErrors: vi.fn(() => ({ errorCount: 0, latestErrorAt: '' })),
      insertUsageLedger: vi.fn()
    }
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'model deepseek-secret-model not found' } })
    }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], false, undefined, {
      userId: 'user_1',
      role: 'user'
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('deepseek-secret-model')
    expect(result.error).not.toContain('managed-key')
  })

  it('ai service returns fetchModels error when preset missing', async () => {
    const service = createAiAppService({
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn()
    }, vi.fn(), {})
    const result = await service.fetchModels({ presetName: 'missing' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })

  it('ai service rejects direct model-list baseUrl for normal user route', async () => {
    const fetchMock = vi.fn()
    const service = createAiAppService({
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn()
    }, fetchMock, {})

    const result = await service.fetchModels({
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: 'secret-key'
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ai service blocks unsafe model-list outbound URL before fetch', async () => {
    const fetchMock = vi.fn()
    const service = createAiAppService({
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(),
      getManagedPresetByName: vi.fn()
    }, fetchMock, {})

    const result = await service.fetchModels({
      baseUrl: 'http://169.254.169.254',
      apiKey: 'secret-key',
      allowDirectConfig: true
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toMatch(/内网|本机|云元数据/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ai service redacts upstream secrets from model-list errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'bad key sk-1234567890abcdef1234567890abcd token=abc' } })
    }))
    const service = createAiAppService({
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(() => ({
        name: 'default',
        base_url: 'https://api.example.com',
        api_key: 'secret-key',
        model: 'gpt-test',
        available_models: '[]',
        is_default: 1,
        fallback_preset: ''
      })),
      getManagedPresetByName: vi.fn()
    }, fetchMock, {})

    const result = await service.fetchModels({ presetName: 'default' })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('[redacted]')
    expect(result.error).not.toContain('sk-123456')
  })

  it('ai service returns the main preset error without trying fallback preset', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn((name) => {
        if (name === 'main') {
          return {
            name: 'main',
            base_url: 'https://main.example.com',
            api_key: 'main-key',
            model: 'main-model',
            available_models: '[]',
            is_default: 0,
            fallback_preset: 'Deepseek'
          }
        }
        if (name === 'Deepseek') {
          return {
            name: 'Deepseek',
            base_url: 'https://api.deepseek.com',
            api_key: 'deepseek-key',
            model: 'deepseek-chat',
            available_models: '[]',
            is_default: 0,
            fallback_preset: ''
          }
        }
        return undefined
      })
    }
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body)
      if (body.model === 'other-provider-model') {
        return { ok: false, status: 400, text: async () => '{"error":"bad model"}' }
      }
      return {
        ok: true,
        body: { getReader: () => ({ read: async () => ({ done: true }) }) }
      }
    })
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.callAIWithFallback('main', 'other-provider-model', [{ role: 'user', content: '你好' }], true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(repository.getPresetByName).toHaveBeenCalledWith('main')
    expect(repository.getPresetByName).not.toHaveBeenCalledWith('Deepseek')
    expect(result.error).toContain('预设 main 调用失败')
    expect(result.model).toBe('other-provider-model')
  })

  it('timer service creates, pauses, resumes and deletes timer through service layer', () => {
    const repository = {
      ensureTable: vi.fn(() => false),
      listTimers: vi.fn(() => []),
      upsertTimer: vi.fn(),
      updateTimerAfterDone: vi.fn(),
      updateTimerAfterPause: vi.fn(),
      updateTimerAfterResume: vi.fn(),
      deleteTimer: vi.fn(),
      replaceTimers: vi.fn()
    }
    const service = createTimerAppService(repository, { system: vi.fn(), error: vi.fn() })

    const created = service.createTimer({ id: 'timer_1', ticketId: 'ticket_1', ticketName: '电影票', durationMs: 5000 })
    expect(created.ok).toBe(true)
    expect(service.listTimers()).toHaveLength(1)

    const paused = service.pauseTimer('timer_1')
    expect(paused.ok).toBe(true)
    expect(paused.data.paused).toBe(true)

    const resumed = service.resumeTimer('timer_1')
    expect(resumed.ok).toBe(true)
    expect(resumed.data.paused).toBe(false)

    const removed = service.deleteTimer('timer_1')
    expect(removed.ok).toBe(true)
    expect(service.listTimers()).toHaveLength(0)
  })
})
