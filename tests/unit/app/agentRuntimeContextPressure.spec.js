import { describe, expect, it } from 'vitest'
import {
  estimateConservativeContextTokens,
  measureContextPressure,
  readProviderContextUsage
} from '../../../src/app/agentRuntime/contextPressure.ts'

describe('agentRuntime · provider usage 锚定上下文压力计', () => {
  it('CJK、emoji 与 JSON 结构采用比普通 ASCII 更保守的估算', () => {
    const ascii = estimateConservativeContextTokens('abcdefghij')
    const cjk = estimateConservativeContextTokens('天地玄黄宇宙洪荒日月')
    const emoji = estimateConservativeContextTokens('😀😀😀😀😀😀😀😀😀😀')
    const json = estimateConservativeContextTokens('{"a":{"b":[1,2,3]}}')

    expect(cjk).toBeGreaterThan(ascii)
    expect(emoji).toBeGreaterThan(ascii)
    expect(json).toBeGreaterThan(estimateConservativeContextTokens('abcdefghijklmnopqrstu'))
  })

  it('provider inputTokens 是总量锚点，cache read/write 只作子集诊断、不重复相加', () => {
    const anchorSurface = '{"messages":["旧"]}'
    const currentSurface = `${anchorSurface}{"tool":"新增结果"}`
    const measured = measureContextPressure({
      contextWindowTokens: 1000,
      thresholdRatio: 0.8,
      anchorSurface,
      currentSurface,
      providerUsage: { inputTokens: 600, cacheReadTokens: 500, cacheWriteTokens: 100 }
    })

    expect(measured.source).toBe('provider-anchor')
    expect(measured.anchorInputTokens).toBe(600)
    expect(measured.projectedTokens).toBe(600 + measured.surfaceDeltaTokens)
    expect(measured.projectedTokens).toBeLessThan(800)
    expect(measured.cacheReadTokens).toBe(500)
    expect(measured.cacheWriteTokens).toBe(100)
    expect(measured.underPressure).toBe(false)
  })

  it('provider 未回 inputTokens 时以缓存分项之和作保守下界；没有 usage 时退回本地估算', () => {
    const cacheOnly = measureContextPressure({
      contextWindowTokens: 100,
      anchorSurface: 'a',
      currentSurface: 'ab',
      providerUsage: { cacheReadTokens: 70, cacheWriteTokens: 10 }
    })
    expect(cacheOnly.source).toBe('provider-anchor')
    expect(cacheOnly.anchorInputTokens).toBe(80)
    expect(cacheOnly.underPressure).toBe(true)

    const local = measureContextPressure({
      contextWindowTokens: 100,
      currentSurface: '中文'.repeat(80)
    })
    expect(local.source).toBe('local-estimate')
    expect(local.anchorInputTokens).toBeNull()
    expect(local.underPressure).toBe(true)
  })

  it('输出 reserve 计入总压力，并识别现有 provider usage 方言', () => {
    const usage = readProviderContextUsage({
      usage: {
        prompt_tokens: 700,
        cache_read_input_tokens: 450,
        prompt_tokens_details: { cache_write_tokens: 25 }
      }
    })
    expect(usage).toEqual({ inputTokens: 700, cacheReadTokens: 450, cacheWriteTokens: 25 })

    const measured = measureContextPressure({
      contextWindowTokens: 1000,
      thresholdRatio: 0.8,
      reserveTokens: 200,
      anchorSurface: 'same',
      currentSurface: 'same',
      providerUsage: usage
    })
    expect(measured.thresholdTokens).toBe(800)
    expect(measured.pressureTokens).toBe(900)
    expect(measured.underPressure).toBe(true)
  })
})
