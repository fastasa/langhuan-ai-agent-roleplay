/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockChatStore = {
  currentAbortController: null,
  setAbortController: vi.fn((controller) => {
    mockChatStore.currentAbortController = controller
  })
}

const mockSettingStore = {}
const mockCharStore = {}
const mockResourceStore = {}

vi.mock('../../../src/stores/chatStore.ts', () => ({
  useChatStore: () => mockChatStore
}))

vi.mock('../../../src/stores/settingStore.ts', () => ({
  useSettingStore: () => mockSettingStore
}))

vi.mock('../../../src/stores/characterStore.ts', () => ({
  useCharacterStore: () => mockCharStore
}))

vi.mock('../../../src/stores/resourceStore.ts', () => ({
  useResourceStore: () => mockResourceStore
}))

vi.mock('../../../src/app/chatProjection.ts', () => ({
  createChatProjection: () => ({})
}))

vi.mock('../../../src/app/settingsProjection.ts', () => ({
  createSettingsProjection: () => ({})
}))

import { useAI } from '../../../src/composables/useAI.ts'

describe('useAI runtime control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChatStore.currentAbortController = null
  })

  it('流式调用会通过正式入口设置并清理中断控制器', async () => {
    const encoder = new TextEncoder()
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name) => {
          if (name === 'X-Used-Model') return encodeURIComponent('test-model')
          if (name === 'X-Used-Preset') return encodeURIComponent('默认预设')
          return ''
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        }
      })
    }))

    const ai = useAI()
    const result = await ai.callAIStream(
      [{ role: 'user', content: '你好' }],
      {},
      vi.fn(),
      { onModelInfo: vi.fn() }
    )

    expect(result).toBe('你好')
    expect(mockChatStore.setAbortController).toHaveBeenCalledTimes(2)
    expect(mockChatStore.setAbortController.mock.calls[0][0]).toBeInstanceOf(AbortController)
    expect(mockChatStore.setAbortController.mock.calls[1][0]).toBeNull()
  })

  it('流式调用在 thinking disabled 时不向界面传回 reasoning 内容', async () => {
    const encoder = new TextEncoder()
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: (name) => {
          if (name === 'X-Used-Model') return encodeURIComponent('gemini-3.1-pro-preview-thinking')
          if (name === 'X-Used-Preset') return encodeURIComponent('Gemini')
          return ''
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"很长的思考"}}]}\n'))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"正式回复"}}]}\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n'))
          controller.close()
        }
      })
    }))

    const onChunk = vi.fn()
    const ai = useAI()
    const result = await ai.callAIStream(
      [{ role: 'user', content: '你好' }],
      { thinking: 'disabled' },
      onChunk,
      { onModelInfo: vi.fn() }
    )

    expect(result).toBe('正式回复')
    expect(onChunk.mock.calls.map((call) => call[0]).join('')).toBe('正式回复')
  })
})
