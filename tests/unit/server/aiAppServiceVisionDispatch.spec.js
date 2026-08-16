import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// 图片双通道分流（输入框图片上传计划批2）：aiAppService 按 preset.supports_vision 把 image_url
// content part 内联成 data URI 或拍平成文本。CHAT_IMAGE_DIR 指到临时目录（不碰真实 chat-images/
// 真库，仿 chatImageStorage.spec.js 同款隔离），canServeStoredPath 用可控 mock 模拟 uploads 台账门禁。
const CHAT_IMAGE_TEST_DIR = join(tmpdir(), 'langhuan-ai-app-service-vision-dispatch-spec')

// default 导出是给 aiRepository.ts 顶层 `createAiRepository(database = db)` 兜底用的假单例
// （本测试全程注入自己的 repository mock，从不真调它的方法，占位对象足够）。
vi.mock('../../../server/db', () => ({ CHAT_IMAGE_DIR: CHAT_IMAGE_TEST_DIR, default: {} }))

const canServeStoredPathMock = vi.fn(() => true)
vi.mock('../../../server/repositories/uploadRepository.js', () => ({
  uploadRepository: { canServeStoredPath: (...args) => canServeStoredPathMock(...args) }
}))

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

const { createAiAppService } = await import('../../../server/application/ai/aiAppService.js')
const { callClaudeCodeBridge } = await import('../../../server/application/ai/claudeCodeBridge.js')

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function makePreset(overrides = {}) {
  return {
    name: '普通',
    provider_type: 'openai-compatible',
    base_url: 'https://api.example.com',
    api_key: 'sk-x',
    model: 'gpt-test',
    available_models: '[]',
    is_default: 1,
    fallback_preset: '',
    ...overrides
  }
}

function makeContentMessages(imageUrl = '/chat-images/test.png') {
  return [
    { role: 'system', content: '你是助手' },
    {
      role: 'user',
      content: [
        { type: 'text', text: '这张图是什么' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ]
}

function makeCapturingFetch() {
  let capturedBody = null
  const fetchImpl = vi.fn(async (_url, init) => {
    capturedBody = JSON.parse(init.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  })
  return { fetchImpl, getCapturedBody: () => capturedBody }
}

function findUserMessage(body) {
  return body.messages.find((message) => message.role === 'user')
}

// 并发令牌池按账号身份(baseUrl+apiKey)共享、跨用例持久（modelConcurrencyGate.ts），
// 令牌只在 upstream body 被读完时才释放——测试必须消费 result.upstream，否则同账号后续
// 用例会排队等一个永远不会被释放的令牌（真机路由/投影同款消费习惯，仿 appServices.spec.js）。
async function callAndDrain(service, messages, context) {
  const result = await service.callAIWithFallback(undefined, undefined, messages, false, undefined, context)
  if (result.upstream) await result.upstream.json().catch(() => null)
  return result
}

describe('aiAppService 图片双通道分流（批2）', () => {
  beforeAll(() => {
    mkdirSync(CHAT_IMAGE_TEST_DIR, { recursive: true })
    writeFileSync(join(CHAT_IMAGE_TEST_DIR, 'test.png'), PNG_BYTES)
  })

  afterAll(() => {
    rmSync(CHAT_IMAGE_TEST_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    canServeStoredPathMock.mockReset()
    canServeStoredPathMock.mockReturnValue(true)
  })

  it('supports_vision=1 预设：image_url 相对路径内联成 data URI', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    const result = await callAndDrain(service, makeContentMessages())

    expect(result.error).toBeFalsy()
    const userMessage = findUserMessage(getCapturedBody())
    expect(Array.isArray(userMessage.content)).toBe(true)
    const textPart = userMessage.content.find((part) => part.type === 'text')
    const imagePart = userMessage.content.find((part) => part.type === 'image_url')
    expect(textPart.text).toBe('这张图是什么')
    expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/)
    expect(canServeStoredPathMock).toHaveBeenCalledWith('chat-images/test.png')
  })

  it('supports_vision=0（缺省）预设：content 数组拍平成纯字符串，图片换占位文字', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset()), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    await callAndDrain(service, makeContentMessages())

    const userMessage = findUserMessage(getCapturedBody())
    expect(typeof userMessage.content).toBe('string')
    expect(userMessage.content).toContain('这张图是什么')
    expect(userMessage.content).toContain('不支持识图')
  })

  it('providerType=claude-code：image parts 原样透传（不内联、不拍平），交给订阅桥自己渲染成 @路径（2026-07-11 订阅桥识图改造）', async () => {
    const repository = {
      getDefaultPreset: vi.fn(() => makePreset({
        provider_type: 'claude-code',
        base_url: 'claude-code://local',
        model: 'sonnet',
        supports_vision: 0 // 特意给 0：claude-code 分支不依赖这个勾选，桥本体天然识图
      })),
      getPresetByName: vi.fn()
    }
    const service = createAiAppService(repository, vi.fn(), {})

    await callAndDrain(service, makeContentMessages())

    expect(callClaudeCodeBridge).toHaveBeenCalledTimes(1)
    const bridgeInput = callClaudeCodeBridge.mock.calls[0][0]
    const userMessage = bridgeInput.messages.find((message) => message.role === 'user')
    expect(Array.isArray(userMessage.content)).toBe(true)
    const textPart = userMessage.content.find((part) => part.type === 'text')
    const imagePart = userMessage.content.find((part) => part.type === 'image_url')
    expect(textPart.text).toBe('这张图是什么')
    expect(imagePart.image_url.url).toBe('/chat-images/test.png')
  })

  it('路径穿越（basename 剥离后与原值不同）→ 降级为占位文本，不读取任意文件', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    await callAndDrain(service, makeContentMessages('/chat-images/../../etc/passwd'))

    const userMessage = findUserMessage(getCapturedBody())
    expect(userMessage.content.some((part) => part.type === 'image_url')).toBe(false)
    expect(userMessage.content.some((part) => part.type === 'text' && part.text === '[图片已失效]')).toBe(true)
  })

  it('外部 http(s) URL（非 /chat-images/ 前缀）→ 降级为占位文本（防 SSRF）', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    await callAndDrain(service, makeContentMessages('https://evil.example.com/x.png'))

    const userMessage = findUserMessage(getCapturedBody())
    expect(userMessage.content.some((part) => part.type === 'image_url')).toBe(false)
    expect(userMessage.content.some((part) => part.type === 'text' && part.text === '[图片已失效]')).toBe(true)
  })

  it('canServeStoredPath 返回 false（未登记/未过审的路径）→ 降级为占位文本', async () => {
    canServeStoredPathMock.mockReturnValue(false)
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    await callAndDrain(service, makeContentMessages())

    const userMessage = findUserMessage(getCapturedBody())
    expect(userMessage.content.some((part) => part.type === 'text' && part.text === '[图片已失效]')).toBe(true)
  })

  it('文件不存在（登记通过但已被清理）→ 降级为占位文本，不抛错', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    const result = await callAndDrain(service, makeContentMessages('/chat-images/missing.png'))

    expect(result.error).toBeFalsy()
    const userMessage = findUserMessage(getCapturedBody())
    expect(userMessage.content.some((part) => part.type === 'text' && part.text === '[图片已失效]')).toBe(true)
  })

  it('纯字符串 content 的消息不受影响（绝大多数现有调用零改动）', async () => {
    const repository = { getDefaultPreset: vi.fn(() => makePreset({ supports_vision: 1 })), getPresetByName: vi.fn() }
    const { fetchImpl, getCapturedBody } = makeCapturingFetch()
    const service = createAiAppService(repository, fetchImpl, {})

    await callAndDrain(service, [{ role: 'user', content: '普通文字消息' }])

    const userMessage = findUserMessage(getCapturedBody())
    expect(userMessage.content).toBe('普通文字消息')
  })
})
