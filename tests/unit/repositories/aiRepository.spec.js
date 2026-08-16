import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDirectorRoundUsageTotals,
  requestAiChatResponse,
  requestAiImageGeneration,
  requestAiWebSearch
} from '../../../src/repositories/aiRepository.ts'

describe('aiRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('统一通过 AI 聊天正式入口发起请求', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    })
    vi.stubGlobal('fetch', fetch)

    const response = await requestAiChatResponse({
      messages: [{ role: 'user', content: '你好' }],
      presetName: '默认预设',
      model: 'test-model',
      maxTokens: 512,
      stream: true,
      meta: {
        logLabel: '测试日志'
      }
    })

    expect(response.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('/api/ai/chat')
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'POST'
    }))
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual(expect.objectContaining({
      maxTokens: 512
    }))
  })

  it('生图请求走专用入口并返回已登记附件', async () => {
    const attachment = { id: 'chat_gen_1', kind: 'image', url: '/chat-images/chat_gen_1.png', mime: 'image/png' }
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attachment, model: 'gpt-5.4', presetName: 'Codex桥' })
    })
    vi.stubGlobal('fetch', fetch)

    const result = await requestAiImageGeneration({ prompt: '画猫', presetName: 'Codex桥', modelUsageSlotId: 'balanced' })

    expect(result.attachment).toEqual(attachment)
    expect(fetch).toHaveBeenCalledWith('/api/ai/images/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ prompt: '画猫', presetName: 'Codex桥', modelUsageSlotId: 'balanced' })
    }))
  })

  it('联网搜索走专用只读入口并保留有效来源', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '联网结论',
        sources: [
          { title: '官方资料', url: 'https://example.com/latest' },
          { title: '无效来源', url: 'javascript:alert(1)' }
        ],
        model: 'gpt-5.4',
        presetName: 'Codex桥'
      })
    })
    vi.stubGlobal('fetch', fetch)

    const result = await requestAiWebSearch({ query: '最新资料', presetName: 'Codex桥', modelUsageSlotId: 'balanced' })

    expect(result.answer).toBe('联网结论')
    expect(result.sources).toEqual([{ title: '官方资料', url: 'https://example.com/latest' }])
    expect(fetch).toHaveBeenCalledWith('/api/ai/web/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ query: '最新资料', presetName: 'Codex桥', modelUsageSlotId: 'balanced' })
    }))
  })

  // 缓存可见性（2026-07-07）：坞底部条要显示缓存命中量，round 汇总接口回包需原样带出 cacheReadTokens/cacheCreationTokens。
  it('fetchDirectorRoundUsageTotals 透传缓存拆分字段', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        inputTokens: 667956,
        outputTokens: 17150,
        totalTokens: 685106,
        cacheReadTokens: 500000,
        cacheCreationTokens: 40000,
        callCount: 24
      })
    })
    vi.stubGlobal('fetch', fetch)

    const totals = await fetchDirectorRoundUsageTotals('round:session_a:1')
    expect(totals).toMatchObject({
      inputTokens: 667956,
      outputTokens: 17150,
      totalTokens: 685106,
      cacheReadTokens: 500000,
      cacheCreationTokens: 40000,
      callCount: 24
    })
  })

  it('fetchDirectorRoundUsageTotals 缺 roundId 时不发请求、直接回空值（含缓存字段 0）', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const totals = await fetchDirectorRoundUsageTotals('')
    expect(fetch).not.toHaveBeenCalled()
    expect(totals).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      callCount: 0
    })
  })
})
