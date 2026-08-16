import { describe, expect, it, vi } from 'vitest'
import {
  PERSONALITY_KERNEL_GUARD_DEFINITIONS,
  buildPersonalityKernelParserAiOptions,
  buildPersonalityKernelParserPrompt,
  createPersonalitySourceHash,
  normalizePersonalityKernelParserOutput,
  runPersonalityKernelParser
} from '../../../src/app/personalityKernelParser.ts'

function buildModelOutput(policyLines = [
  '请求|边界被尊重|她会先判断请求是否越界，再决定给多少回应|警觉但愿意听|先给有限帮助并保留余地|语气克制，先确认条件|如果继续施压会收紧边界|被尊重后信任小幅上升|再次被命令会迅速变硬|1200|-1200|1200|她会先确认边界，再给出有限回应。',
  '挑战|公开评价|她会把挑战理解成对能力和体面的检验|紧张、要强，容易防御|先解释依据，必要时反击|措辞更冷，强调事实|不接受把质疑变成人身评价|公平质疑会保留合作可能|被嘲讽后会减少透露|300|-600|800|她面对质疑时会先守住体面，再用证据回应。',
  '安抚|私下照顾|她会判断对方是否真的理解她的压力|戒备下降，委屈浮上来|先软化语气，再试探性接近|表达会更细、更低声|仍不接受过度追问隐私|持续稳定照顾会缓慢提升信任|如果安抚变成控制会后退|-100|-500|500|她在被温和安抚时会慢慢放松，但仍保留最后边界。',
  '威胁|越界|她会把威胁视为必须立刻处理的风险|害怕、愤怒和高度警觉|后撤、切断信息或寻求控制点|语气变短，拒绝解释太多|不接受逼迫交出弱点|信任急剧下降|之后很难快速恢复|900|100|1000|她被威胁时会优先保护自己，并迅速收紧表达。'
]) {
  return [
    '稳定摘要：',
    '她温顺但防御强，重视秩序和体面。她会把不安转成准备和复盘。',
    '',
    '护栏：',
    '情绪稳定|1400|-1400|1400|容易紧张但会维持表面平稳',
    '信任开放|-300|-900|300|慢热且需要连续证据',
    '边界敏感|650|0|1000|私人空间被触碰时反应很快',
    '控制需求|500|-100|900|需要计划和可预期关系',
    '评价敏感|700|100|1000|会把公开评价内化成自我压力',
    '表达外显|-200|-800|300|多数时候克制，不主动外露',
    '冲突直接|100|-600|700|先缓冲，必要时会正面回应',
    '主动性|-100|-700|400|更习惯等待确认后行动',
    '',
    '反应策略：',
    ...policyLines
  ].join('\n')
}

describe('personalityKernelParser', () => {
  it('builds a parser prompt with stable boundary rules', () => {
    const prompt = buildPersonalityKernelParserPrompt({
      characterId: 'char_xueyun',
      characterName: '雪允',
      personalityText: '温顺外壳下的防御性。'
    })

    expect(prompt).toContain('角色 ID：char_xueyun')
    expect(prompt).toContain('情绪稳定')
    expect(prompt).toContain('反应策略')
    expect(prompt).toContain('不要输出 JSON')
    expect(prompt).not.toContain('stableSummary')
    expect(prompt).toContain('温顺外壳')
  })

  it('normalizes text table output into a clamped kernel', () => {
    const result = normalizePersonalityKernelParserOutput(buildModelOutput(), {
      characterId: 'char_xueyun',
      personalityText: '温顺外壳下的防御性。',
      version: 1
    })

    expect(result.status).toBe('parsed')
    expect(result.kernel?.sourceTextHash).toBe(createPersonalitySourceHash('温顺外壳下的防御性。'))
    expect(result.kernel?.guardDimensions).toHaveLength(PERSONALITY_KERNEL_GUARD_DEFINITIONS.length)
    expect(result.kernel?.guardDimensions[0]).toMatchObject({
      key: 'emotionalStability',
      baseline: 1000,
      lowerBound: -1000,
      upperBound: 1000
    })
    expect(result.kernel?.reactionPolicies[0].situationTags).toEqual(['request', 'boundary_respected'])
    expect(result.kernel?.reactionPolicies[0].baseWeight).toBe(1000)
  })

  it('fails when usable reaction policies are too few', () => {
    const result = normalizePersonalityKernelParserOutput(buildModelOutput([
      '请求|边界被尊重|她会先判断请求是否越界|警觉但愿意听|先给有限帮助|语气克制|继续施压会收紧边界|被尊重后信任小幅上升|被命令会迅速变硬|120|-500|500|她会先确认边界，再给出有限回应。'
    ]), {
      characterId: 'char_xueyun',
      personalityText: '温顺外壳下的防御性。'
    })

    expect(result.status).toBe('failed')
    expect(result.reason).toContain('有效反应策略')
  })

  it('rejects JSON-shaped output because the parser expects text sections', () => {
    const result = normalizePersonalityKernelParserOutput(JSON.stringify({
      stableSummary: '她稳定、警觉。',
      reactionPolicies: []
    }), {
      characterId: 'char_xueyun',
      personalityText: '温顺外壳下的防御性。'
    })

    expect(result.status).toBe('failed')
    expect(result.reason).toContain('文本格式')
  })

  it('uses the quick judge slot and agent feature', async () => {
    const callAI = vi.fn(async () => buildModelOutput())
    const result = await runPersonalityKernelParser({
      characterId: 'char_xueyun',
      characterName: '雪允',
      personalityText: '温顺外壳下的防御性。',
      callAI
    })

    expect(result.status).toBe('parsed')
    expect(callAI).toHaveBeenCalledTimes(1)
    expect(callAI.mock.calls[0][1]).toMatchObject({
      feature: 'agent',
      logLabel: 'personality-kernel-parser',
      usageLabel: '人格内核解析'
    })
  })

  it('skips empty personality text without calling AI', async () => {
    const callAI = vi.fn()
    const result = await runPersonalityKernelParser({
      characterId: 'char_xueyun',
      personalityText: '',
      callAI
    })

    expect(result.status).toBe('skipped')
    expect(callAI).not.toHaveBeenCalled()
  })

  it('builds explicit AI options for usage tracking', () => {
    expect(buildPersonalityKernelParserAiOptions(null)).toMatchObject({
      stream: false,
      feature: 'agent',
      placeLabel: '人格内核解析'
    })
  })
})
