/**
 * @vitest-environment jsdom
 */
// normalizeAiTokenUsage 缓存读方言映射（2026-07-12·缓存命中进 subagent 运行卡的数据链补段）：
// 与服务端 aiAppService.extractCacheReadTokens（P2 批 E4）同口径联动——Anthropic → DeepSeek → OpenAI
// 三方言，第一个非空生效。服务端同款用例在 tests/unit/server/aiTimerServices.spec.js，改方言表两处同步。
import { describe, expect, it } from 'vitest'
import { normalizeAiTokenUsage } from '../../../src/utils/aiUsage.js'

describe('normalizeAiTokenUsage · 缓存读方言映射', () => {
  it('OpenAI GPT-5.6 同时归一缓存读与 cache_write_tokens', () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 700, cache_write_tokens: 200 }
    })
    expect(usage.cacheReadTokens).toBe(700)
    expect(usage.cacheCreationTokens).toBe(200)
  })

  it('Anthropic 原生形状（订阅桥归一后即此形状）：cache_read_input_tokens / cache_creation_input_tokens', () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 50
    })
    expect(usage.cacheReadTokens).toBe(500)
    expect(usage.cacheCreationTokens).toBe(50)
  })

  it('DeepSeek 方言：prompt_cache_hit_tokens 映射为 cacheReadTokens', () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 600
    })
    expect(usage.cacheReadTokens).toBe(600)
    expect(usage.cacheCreationTokens).toBeUndefined()
  })

  it('OpenAI 及兼容协议方言：prompt_tokens_details.cached_tokens 映射为 cacheReadTokens', () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 800 }
    })
    expect(usage.cacheReadTokens).toBe(800)
  })

  it('多方言并存：优先取 Anthropic 原生字段（与服务端 extractCacheReadTokens 同序）', () => {
    const usage = normalizeAiTokenUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      cache_read_input_tokens: 500,
      prompt_cache_hit_tokens: 600,
      prompt_tokens_details: { cached_tokens: 700 }
    })
    expect(usage.cacheReadTokens).toBe(500)
  })

  it('无任何缓存方言字段：cacheReadTokens 缺省不带（展示端按不显示处理）', () => {
    const usage = normalizeAiTokenUsage({ prompt_tokens: 1000, completion_tokens: 100 })
    expect(usage.promptTokens).toBe(1000)
    expect(usage.cacheReadTokens).toBeUndefined()
  })
})
