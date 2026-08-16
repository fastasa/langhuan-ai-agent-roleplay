import { beforeEach, describe, expect, it, vi } from 'vitest'

const { canServeStoredPathMock } = vi.hoisted(() => ({ canServeStoredPathMock: vi.fn(() => true) }))
vi.mock('../../../server/repositories/uploadRepository.js', () => ({
  uploadRepository: { canServeStoredPath: canServeStoredPathMock }
}))

const { saveGeneratedChatImageBase64Mock } = vi.hoisted(() => ({
  saveGeneratedChatImageBase64Mock: vi.fn(() => ({ ok: true, id: 'chat_gen_1', url: '/chat-images/chat_gen_1.png', mime: 'image/png', size: 256 }))
}))
vi.mock('../../../server/repositories/chatImageStorage.js', () => ({
  guessChatImageMimeFromFilename: vi.fn(() => 'image/png'),
  saveGeneratedChatImageBase64: saveGeneratedChatImageBase64Mock
}))

vi.mock('../../../server/application/ai/codexSubscriptionBridge.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    listCodexSubscriptionBridgeModels: vi.fn(async () => [{ id: 'gpt-5.4' }, { id: 'gpt-5.4-mini' }]),
    generateCodexSubscriptionImage: vi.fn(async () => ({
      image: { result: 'iVBORw0KGgo=', revisedPrompt: '月下白猫' },
      usage: { inputTokens: 4, outputTokens: 2 }
    })),
    searchCodexSubscriptionWeb: vi.fn(async () => ({
      answer: '联网结论',
      sources: [{ title: '官方资料', url: 'https://example.com/latest' }],
      searches: [{ id: 'search-1', query: '最新资料' }],
      usage: { inputTokens: 5, outputTokens: 3 }
    })),
    callCodexSubscriptionBridge: vi.fn(async () => new Response(JSON.stringify({
      choices: [{ index: 0, message: { role: 'assistant', content: 'Codex 桥回复' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }
})

import { createAiAppService } from '../../../server/application/ai/aiAppService.js'
import {
  callCodexSubscriptionBridge,
  generateCodexSubscriptionImage,
  listCodexSubscriptionBridgeModels,
  searchCodexSubscriptionWeb
} from '../../../server/application/ai/codexSubscriptionBridge.js'

function makeCodexPreset() {
  return {
    name: 'Codex 订阅桥',
    provider_type: 'codex-subscription',
    base_url: 'codex://local',
    api_key: '',
    model: 'default',
    available_models: '[]',
    is_default: 1,
    fallback_preset: ''
  }
}

describe('aiAppService × codex-subscription 订阅桥分流', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canServeStoredPathMock.mockReturnValue(true)
  })

  it('Codex 预设在 HTTP 外呼前短路，并把 tools 与 signal 交给桥', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => makeCodexPreset()),
      getPresetByName: vi.fn(),
      getDefaultManagedPreset: vi.fn(),
      ensureUserEntitlement: vi.fn()
    }
    const fetchMock = vi.fn()
    const service = createAiAppService(repository, fetchMock, {})
    const controller = new AbortController()

    const result = await service.callAIWithFallback(
      undefined,
      undefined,
      [{ role: 'user', content: '你好' }],
      false,
      undefined,
      {
        userId: 'user-1', sessionId: 'session-1', feature: 'group_director',
        tools: [{ type: 'function', function: { name: 'write_todo' } }], toolChoice: 'auto', signal: controller.signal, effort: 'high', serviceTier: 'fast', thinking: 'enabled'
      }
    )

    expect(result.error).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(callCodexSubscriptionBridge).toHaveBeenCalledTimes(1)
    expect(callCodexSubscriptionBridge.mock.calls[0][0]).toEqual(expect.objectContaining({
      model: 'default',
      effort: 'high',
      serviceTier: 'fast',
      thinking: 'enabled',
      continuityKey: JSON.stringify({ version: 2, userId: 'user-1', sessionId: 'session-1', feature: 'group_director', profileId: '' }),
      tools: expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: 'write_todo' }) })]),
      signal: controller.signal
    }))
    expect((await result.upstream.json()).choices[0].message.content).toBe('Codex 桥回复')
  })

  it('桥异常进入既有统一错误口径，不泄漏为未捕获异常', async () => {
    callCodexSubscriptionBridge.mockRejectedValueOnce(new Error('本机尚未 codex login'))
    const repository = { getDefaultPreset: vi.fn(() => makeCodexPreset()), getPresetByName: vi.fn() }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.callAIWithFallback(undefined, undefined, [{ role: 'user', content: '你好' }], false)

    expect(result.status).toBe(500)
    expect(result.error).toContain('本机尚未 codex login')
  })

  it('图片 part 原样交给 Codex 桥，不受 supports_vision 勾选影响', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => ({ ...makeCodexPreset(), supports_vision: 0 })),
      getPresetByName: vi.fn()
    }
    const service = createAiAppService(repository, vi.fn(), {})
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image_url', image_url: { url: '/chat-images/probe.png' } }
      ]
    }]

    const result = await service.callAIWithFallback(undefined, undefined, messages, false)
    await result.upstream.json()

    const userMessage = callCodexSubscriptionBridge.mock.calls[0][0].messages[0]
    expect(userMessage.content[1].image_url.url).toBe('/chat-images/probe.png')
  })

  it('直连配置与已存预设都动态读取当前账号模型目录', async () => {
    const repository = { getDefaultPreset: vi.fn(), getPresetByName: vi.fn(() => makeCodexPreset()) }
    const service = createAiAppService(repository, vi.fn(), {})

    const direct = await service.fetchModels({
      providerType: 'codex-subscription', baseUrl: 'codex://local', apiKey: '', allowDirectConfig: true
    })
    const saved = await service.fetchModels({ presetName: 'Codex 订阅桥' })

    expect(direct.ok).toBe(true)
    expect(saved.ok).toBe(true)
    expect(direct.data.data.map((item) => item.id)).toEqual(['gpt-5.4', 'gpt-5.4-mini'])
    expect(listCodexSubscriptionBridgeModels).toHaveBeenCalledTimes(2)
  })

  it('生图只走 Codex 订阅桥，并把校验落库后的结果返回为聊天附件', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makeCodexPreset()), getPresetByName: vi.fn() }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.generateImage({ prompt: '画一只月下白猫', model: 'gpt-5.4' })

    expect(result.ok).toBe(true)
    expect(generateCodexSubscriptionImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: '画一只月下白猫', model: 'gpt-5.4' }))
    expect(saveGeneratedChatImageBase64Mock).toHaveBeenCalledWith('iVBORw0KGgo=')
    expect(result.attachment).toEqual(expect.objectContaining({
      id: 'chat_gen_1', kind: 'image', url: '/chat-images/chat_gen_1.png', caption: '月下白猫', captionStatus: 'done'
    }))
  })

  it('联网搜索只走 Codex 订阅桥，并返回带来源的只读结果', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makeCodexPreset()), getPresetByName: vi.fn() }
    const service = createAiAppService(repository, vi.fn(), {})

    const result = await service.searchWeb({ query: '最新资料', model: 'gpt-5.4' })

    expect(result.ok).toBe(true)
    expect(searchCodexSubscriptionWeb).toHaveBeenCalledWith(expect.objectContaining({ query: '最新资料', model: 'gpt-5.4' }))
    expect(result.answer).toBe('联网结论')
    expect(result.sources).toEqual([{ title: '官方资料', url: 'https://example.com/latest' }])
  })

  it('普通预设仍走原 HTTP models 端点', async () => {
    const repository = {
      getDefaultPreset: vi.fn(),
      getPresetByName: vi.fn(() => ({
        name: '普通', provider_type: 'openai-compatible', base_url: 'https://api.example.com', api_key: 'sk-x',
        model: 'gpt-test', available_models: '[]', is_default: 0, fallback_preset: ''
      }))
    }
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: 'gpt-test' }] }) }))
    const service = createAiAppService(repository, fetchMock, {})

    const result = await service.fetchModels({ presetName: '普通' })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
