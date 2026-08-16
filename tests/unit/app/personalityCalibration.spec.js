import { describe, expect, it } from 'vitest'

import {
  buildPersonalityCalibrationPrompt,
  normalizePersonalityCalibrationOutput,
  runPersonalityCalibration,
  scoreToPosition
} from '../../../src/app/personalityCalibration.ts'

const KERNEL = {
  characterId: 'c1',
  version: 1,
  sourceTextHash: 'h',
  stableSummary: '稳定摘要',
  guardDimensions: [
    { key: 'expressiveness', baseline: -400, lowerBound: -800, upperBound: 200, meaning: '表达外显' },
    { key: 'conflictStyle', baseline: 0, lowerBound: -500, upperBound: 500, meaning: '冲突直接' }
  ],
  reactionPolicies: []
}

const SAMPLES = [
  { id: 'q1', dimension: '表达外显', situation: '被熟人长消息倾诉', chosenPlan: '愿意坦白表达情绪', rejectedPlans: ['冷淡转移话题'] },
  { id: 'q2', dimension: '冲突直接', situation: '直播事故被追问', chosenPlan: '正面回应', rejectedPlans: ['回避'], polarity: 'pos' }
]

const PERSONALITY = '张元英平时克制含蓄，很少外露情绪；遇到冲突倾向回避缓冲。'

describe('personalityCalibration · 刻度', () => {
  it('scoreToPosition 把 -1000~1000 线性映射到 0~1', () => {
    expect(scoreToPosition(-1000)).toBe(0)
    expect(scoreToPosition(0)).toBe(0.5)
    expect(scoreToPosition(1000)).toBe(1)
    expect(scoreToPosition(-400)).toBe(0.3)
  })
})

describe('personalityCalibration · 提示词', () => {
  it('提示词包含原性格正文、样本ID、内核维度与 revisedPersonality 指令', () => {
    const prompt = buildPersonalityCalibrationPrompt({
      characterName: '张元英',
      personalityText: PERSONALITY,
      samples: SAMPLES,
      kernel: KERNEL
    })
    expect(prompt).toContain('张元英平时克制含蓄')
    expect(prompt).toContain('样本ID q1')
    expect(prompt).toContain('正例(更像角色)：愿意坦白表达情绪')
    expect(prompt).toContain('反例(不像角色)：冷淡转移话题')
    expect(prompt).toContain('expressiveness（表达外显）')
    expect(prompt).toContain('"revisedPersonality"')
    expect(prompt).toContain('必须整体重写')
    expect(prompt).toContain('不做追加式补丁')
  })
})

describe('personalityCalibration · 归一模型输出', () => {
  it('已知维度用固定轴与中文名，oldPos 取内核基线，newPos 取建议分，并解析整段修改后性格', () => {
    const raw = JSON.stringify({
      traits: [
        {
          dimensionKey: 'expressiveness',
          status: 'adjust',
          newScore: 300,
          before: '克制含蓄',
          after: '建议在亲近的人面前更外放',
          conflict: true,
          evidence: [
            { kind: 'pos', text: '坦白表达情绪', sampleId: 'q1' },
            { kind: 'bogus', text: '非法极性回退正例' }
          ]
        }
      ],
      revisedPersonality: '张元英在亲近的人面前愿意外放表达情绪；遇到冲突倾向回避缓冲。'
    })
    const result = normalizePersonalityCalibrationOutput(raw, { kernel: KERNEL })
    expect(result.status).toBe('ok')
    expect(result.revisedPersonality).toContain('愿意外放表达情绪')
    expect(result.traits).toHaveLength(1)
    const trait = result.traits[0]
    expect(trait.dim).toBe('表达外显')
    expect(trait.axisLabels).toEqual(['克制含蓄', '外放表达'])
    expect(trait.oldPos).toBe(0.3) // baseline -400
    expect(trait.newPos).toBe(0.65) // newScore 300
    expect(trait.conflict).toBe(true)
    expect(trait.evidence).toHaveLength(2)
    expect(trait.evidence[1].kind).toBe('pos') // 非法极性回退 pos
    expect(result.summary.adjust).toBe(1)
  })

  it('status=new 时 oldPos 为 null、before 留空，custom 维度用模型给的轴与名；支持代码块包裹', () => {
    const raw = '```json\n' + JSON.stringify({
      traits: [
        {
          dimensionKey: 'custom',
          dim: '幽默感',
          status: 'new',
          newScore: 600,
          axisLabels: ['严肃', '爱开玩笑'],
          after: '样本显示她其实爱开玩笑',
          evidence: [{ kind: 'quiz', text: '多次选了俏皮回应', sampleId: 'q2' }]
        }
      ],
      revisedPersonality: '……她其实爱开玩笑。'
    }) + '\n```'
    const result = normalizePersonalityCalibrationOutput(raw, { kernel: KERNEL })
    const trait = result.traits[0]
    expect(trait.dimensionKey).toBe('custom')
    expect(trait.dim).toBe('幽默感')
    expect(trait.axisLabels).toEqual(['严肃', '爱开玩笑'])
    expect(trait.oldPos).toBeNull()
    expect(trait.before).toBe('')
    expect(trait.newPos).toBe(0.8)
    expect(result.summary.new).toBe(1)
    expect(result.revisedPersonality).toContain('爱开玩笑')
  })

  it('非法 JSON 归一为 failed', () => {
    const result = normalizePersonalityCalibrationOutput('不是 JSON', { kernel: KERNEL })
    expect(result.status).toBe('failed')
    expect(result.traits).toHaveLength(0)
    expect(result.revisedPersonality).toBe('')
  })
})

describe('personalityCalibration · run 入口', () => {
  it('无样本时 skipped', async () => {
    const result = await runPersonalityCalibration({ personalityText: PERSONALITY, samples: [], callAI: async () => '{}' })
    expect(result.status).toBe('skipped')
  })

  it('缺少 callAI 时 failed', async () => {
    const result = await runPersonalityCalibration({ personalityText: PERSONALITY, samples: SAMPLES })
    expect(result.status).toBe('failed')
  })

  it('正常调用：把提示词送入 callAI 并归一其 JSON 输出', async () => {
    let seenPrompt = ''
    const callAI = async (messages) => {
      seenPrompt = messages[0].content
      return JSON.stringify({
        traits: [{ dimensionKey: 'conflictStyle', status: 'keep', after: '与样本一致' }],
        revisedPersonality: '改写后的整段性格。'
      })
    }
    const result = await runPersonalityCalibration({ characterName: '张元英', personalityText: PERSONALITY, samples: SAMPLES, kernel: KERNEL, callAI })
    expect(seenPrompt).toContain('样本ID q2')
    expect(seenPrompt).toContain('张元英平时克制含蓄')
    expect(result.status).toBe('ok')
    expect(result.traits[0].dim).toBe('冲突直接')
    expect(result.summary.keep).toBe(1)
    expect(result.revisedPersonality).toBe('改写后的整段性格。')
  })

  it('API 调用失败串识别为 failed', async () => {
    const result = await runPersonalityCalibration({ personalityText: PERSONALITY, samples: SAMPLES, callAI: async () => '[API调用失败: 超时]' })
    expect(result.status).toBe('failed')
  })
})
