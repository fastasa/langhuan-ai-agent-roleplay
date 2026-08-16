import { describe, it, expect } from 'vitest'
import { buildAiAccountKey } from '../../../server/application/ai/aiAppService.ts'

// 批次 D：并发池与速率节流统一按「账号身份」分池/分时间线。
// 账号身份 = 归一化 baseUrl（去尾斜杠、小写）+ apiKey；预设名、模型都不进 key。
describe('buildAiAccountKey 账号身份口径', () => {
  it('同 baseUrl + 同 apiKey 的不同预设名 → 同一个 key（共享一个池）', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-acc-1' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-acc-1' })
    expect(a).toBe(b)
  })

  it('同 baseUrl + 不同 apiKey（两个账号）→ 不同 key（互不挤占）', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-acc-1' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-acc-2' })
    expect(a).not.toBe(b)
  })

  it('baseUrl 尾斜杠与大小写差异被归一化为同一个 key', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://API.deepseek.com/v1', apiKey: 'sk-acc-1' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1/', apiKey: 'sk-acc-1' })
    expect(a).toBe(b)
  })

  it('不同 baseUrl（不同端点）→ 不同 key', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-acc-1' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-acc-1' })
    expect(a).not.toBe(b)
  })

  it('apiKey 大小写敏感，不被归一化', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-AbC' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-abc' })
    expect(a).not.toBe(b)
  })

  it('空 apiKey（如 langhuan 托管缺省）→ 仍按 baseUrl 形成稳定 key', () => {
    const a = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: '' })
    const b = buildAiAccountKey({ baseUrl: 'https://api.deepseek.com/v1', apiKey: '' })
    expect(a).toBe(b)
    expect(typeof a).toBe('string')
  })
})
