import { describe, expect, it } from 'vitest'
import { buildModelUsageAiOptions, normalizeModelUsageConfigs } from '../../../src/utils/modelUsageConfig.ts'

// 批次3（2026-07-08 槽位收束 9→4）：本 spec 锁「平铺 legacy 字段/更旧别名 → 三文本槽」归一口径；
// 九槽数组→四槽的迁移回退链在 src/utils/modelUsageConfig.test.js 另有全套用例。
describe('modelUsageConfig（四槽归一）', () => {
  it('把旧平铺字段归一到三文本槽：校书←balanced链、书童←快判链、掌阁←narrativeBeat(高量)链', () => {
    const configs = normalizeModelUsageConfigs({
      presetName: 'Balanced',
      recallModel: 'balanced-model',
      recallMaxTokens: 640,
      disableRecallThinking: false,
      narrationQuickJudgePresetName: 'Quick',
      narrationQuickJudgeModel: 'quick-model',
      narrativeBeatPresetName: 'Power',
      narrativeBeatModel: 'power-model',
      narrativeBeatMaxTokens: 9000
    })

    expect(configs.map((item) => item.id)).toEqual(['fast', 'balanced', 'message', 'smart'])
    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fast', presetName: 'Quick', model: 'quick-model', maxTokens: 256, thinking: 'disabled' }),
      expect.objectContaining({ id: 'balanced', presetName: 'Balanced', model: 'balanced-model', maxTokens: 640, thinking: 'enabled' }),
      expect.objectContaining({ id: 'message', presetName: 'Balanced', model: 'balanced-model', maxTokens: 640, thinking: 'enabled' }),
      // 掌阁：高智平铺为空 → 回退高量平铺链（narrativeBeat*），maxTokens 不压缩。
      expect.objectContaining({ id: 'smart', presetName: 'Power', model: 'power-model', maxTokens: 9000 })
    ]))
  })

  it('优先读取数组槽位（含更旧 quickJudge/power 别名）并按调用槽位生成 AI 选项', () => {
    const agentConfig = {
      presetName: 'Legacy',
      recallModel: 'legacy-model',
      recallMaxTokens: 640,
      modelUsageConfigs: [
        { id: 'quickJudge', label: '快判模型', presetName: 'Quick', model: 'quick-model', temperature: 0.1, effort: 'low', maxTokens: 128, thinking: 'disabled' },
        { id: 'balanced', label: '均衡模型', presetName: 'Balanced', model: 'balanced-model', temperature: 0.6, effort: 'medium', maxTokens: 900, thinking: 'enabled' },
        { id: 'power', label: '高能模型', presetName: 'Power', model: 'power-model', temperature: 0.9, effort: 'high', maxTokens: 12000, thinking: 'disabled' }
      ]
    }

    expect(buildModelUsageAiOptions(agentConfig, 'fast')).toEqual({
      modelUsageSlotId: 'fast',
      presetName: 'Quick',
      model: 'quick-model',
      temperature: 0.1,
      // 槽位 effort 作为默认值；具体 Agent 对话仍可临时覆盖。
      effort: 'low',
      maxTokens: 128,
      thinking: 'disabled'
    })
    expect(buildModelUsageAiOptions(agentConfig, 'smart', { maxTokens: 8192, effort: 'xhigh' })).toEqual({
      modelUsageSlotId: 'smart',
      presetName: 'Power',
      model: 'power-model',
      temperature: 0.9,
      effort: 'xhigh',
      maxTokens: 8192,
      thinking: 'disabled'
    })
  })

  it('已按四槽保存（数组含新 id）时以槽位自身为准，允许显式保存为空', () => {
    const configs = normalizeModelUsageConfigs({
      narrationQuickJudgePresetName: 'LegacyQuick',
      narrationQuickJudgeModel: 'legacy-quick',
      modelUsageConfigs: [
        { id: 'fast', label: '书童', presetName: '', model: '', temperature: 0.2, maxTokens: 300, thinking: 'disabled' }
      ]
    })

    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'fast',
        presetName: '',
        model: '',
        maxTokens: 300
      })
    ]))
  })

  it('Fast 作为槽位参数归一并随所有该槽调用下传', () => {
    const agentConfig = {
      modelUsageConfigs: [
        { id: 'balanced', label: '校书', presetName: 'Codex桥', model: 'gpt-5.4', temperature: 0.7, maxTokens: 1024, thinking: 'enabled', serviceTier: 'fast' }
      ]
    }

    expect(normalizeModelUsageConfigs(agentConfig).find((item) => item.id === 'balanced'))
      .toMatchObject({ serviceTier: 'fast' })
    expect(buildModelUsageAiOptions(agentConfig, 'balanced'))
      .toMatchObject({ presetName: 'Codex桥', model: 'gpt-5.4', serviceTier: 'fast' })
  })

  it('Codex 努力程度随槽位保存并允许单次对话显式回到模型默认', () => {
    const agentConfig = {
      modelUsageConfigs: [
        { id: 'balanced', label: '校书', presetName: 'Codex桥', model: 'gpt-5.6-sol', temperature: 0.7, maxTokens: 1024, thinking: 'disabled', effort: 'xhigh' }
      ]
    }

    expect(buildModelUsageAiOptions(agentConfig, 'balanced')).toMatchObject({ effort: 'xhigh' })
    expect(buildModelUsageAiOptions(agentConfig, 'balanced', { effort: '' })).toMatchObject({ effort: '' })
  })
})
