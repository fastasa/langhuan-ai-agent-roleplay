import { describe, expect, it } from 'vitest'
import { buildModelUsageAiOptions, normalizeModelUsageConfigs } from './modelUsageConfig.ts'
import { MODEL_TASK_TIERS, buildTaskModelAiOptions } from './modelTaskTiers.ts'

// 批次3（2026-07-08 槽位收束 9→4）：读侧迁移链回归锁——旧九槽/更旧 power/quickJudge 别名/平铺 legacy 字段
// 都要按用户拍板回退链落进 书童fast/校书balanced/掌阁smart；已迁移（数组含 fast/smart）则严格按新 id 取。
describe('modelUsageConfig（五槽迁移）', () => {
  it('默认四文本槽：书童/校书/执笔/掌阁（编目=嵌入走独立链路）', () => {
    const configs = normalizeModelUsageConfigs(null)
    expect(configs.map((item) => item.id)).toEqual(['fast', 'balanced', 'message', 'smart'])
    expect(configs.map((item) => item.label)).toEqual(['书童', '校书', '执笔', '掌阁'])
  })

  it('九槽迁移：校书←旧均衡；掌阁←旧高智；书童←旧快判1（各取原条目全套参数）', () => {
    const configs = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'quickJudge1', presetName: '快判预设', model: 'quick-model', temperature: 0.15, maxTokens: 300, thinking: 'disabled' },
        { id: 'balanced', presetName: '均衡预设', model: 'balanced-model', temperature: 0.65, maxTokens: 900, thinking: 'disabled' },
        { id: 'highIntelligence', presetName: '推理预设', model: 'reasoning-model', temperature: 0.3, maxTokens: 1200, thinking: 'enabled' },
        { id: 'highVolume', presetName: '长文预设', model: 'long-model', temperature: 0.8, maxTokens: 8192, thinking: 'disabled' }
      ]
    })
    expect(configs.find((item) => item.id === 'fast')).toMatchObject({ presetName: '快判预设', model: 'quick-model', maxTokens: 300 })
    expect(configs.find((item) => item.id === 'balanced')).toMatchObject({ presetName: '均衡预设', model: 'balanced-model', temperature: 0.65 })
    // 高智优先于高量。
    expect(configs.find((item) => item.id === 'smart')).toMatchObject({ presetName: '推理预设', model: 'reasoning-model', thinking: 'enabled' })
  })

  it('回退链：校书←均衡空则编排再空则星依；掌阁←高智空则高量（含更旧 power 别名）', () => {
    const configs = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'balanced', presetName: '', model: '' },
        { id: 'orchestration', presetName: '编排预设', model: 'orch-model', temperature: 0.25, maxTokens: 1800, thinking: 'disabled' },
        { id: 'power', presetName: '旧高能预设', model: 'legacy-power-model', temperature: 0.9, maxTokens: 7000, thinking: 'disabled' }
      ]
    })
    expect(configs.find((item) => item.id === 'balanced')).toMatchObject({ presetName: '编排预设', model: 'orch-model', temperature: 0.25 })
    expect(configs.find((item) => item.id === 'smart')).toMatchObject({ presetName: '旧高能预设', model: 'legacy-power-model', maxTokens: 7000 })
  })

  it('回退链末位：编排也空时校书吃旧星依槽', () => {
    const configs = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'xingyi', presetName: '星依预设', model: 'xingyi-model', temperature: 0.6, maxTokens: 4096, thinking: 'enabled' }
      ]
    })
    expect(configs.find((item) => item.id === 'balanced')).toMatchObject({ presetName: '星依预设', model: 'xingyi-model' })
  })

  it('已迁移（数组含新 id）：严格按新 id 取，显式清空不被旧编排值抢回', () => {
    const configs = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'fast', presetName: '', model: '' },
        { id: 'balanced', presetName: '', model: '' },
        { id: 'smart', presetName: '', model: '' },
        // 库里残留的旧条目（读侧迁移不删库内旧字段）不得再被认领。
        { id: 'orchestration', presetName: '编排预设', model: 'orch-model' }
      ]
    })
    expect(configs.find((item) => item.id === 'balanced')).toMatchObject({ presetName: '', model: '' })
  })

  it('新增执笔槽会继承既有校书配置，显式保存 message 后成为独立真值', () => {
    const inherited = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'fast', presetName: '', model: '' },
        { id: 'balanced', presetName: '校书预设', model: 'balanced-model', temperature: 0.6, maxTokens: 2048, thinking: 'disabled' },
        { id: 'smart', presetName: '', model: '' }
      ]
    })
    expect(inherited.find((item) => item.id === 'message')).toMatchObject({
      presetName: '校书预设', model: 'balanced-model', temperature: 0.6, maxTokens: 2048
    })

    const explicit = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'fast', presetName: '', model: '' },
        { id: 'balanced', presetName: '校书预设', model: 'balanced-model' },
        { id: 'message', presetName: '', model: '', temperature: 0.7, maxTokens: 1024, thinking: 'disabled' },
        { id: 'smart', presetName: '', model: '' }
      ]
    })
    expect(explicit.find((item) => item.id === 'message')).toMatchObject({ presetName: '', model: '' })
  })

  it('更旧平铺 legacy 字段仍可回读（第3代链·quickJudge*→书童）', () => {
    const options = buildModelUsageAiOptions({
      narrationQuickJudgePresetName: '快判旧预设',
      narrationQuickJudgeModel: 'quick-legacy-model'
    }, 'fast')
    expect(options).toMatchObject({
      modelUsageSlotId: 'fast',
      presetName: '快判旧预设',
      model: 'quick-legacy-model'
    })
  })

  it('旧角色/旁白槽收敛为单一执笔槽，快判2 不再产出', () => {
    const configs = normalizeModelUsageConfigs({
      modelUsageConfigs: [
        { id: 'roleMessage', presetName: '角色预设', model: 'role-model' },
        { id: 'narrationMessage', presetName: '旁白预设', model: 'narration-model' },
        { id: 'quickJudge2', presetName: '快判2预设', model: 'quick-2-model' }
      ]
    })
    expect(configs.map((item) => item.id)).toEqual(['fast', 'balanced', 'message', 'smart'])
    expect(configs.find((item) => item.id === 'message')).toMatchObject({ presetName: '角色预设', model: 'role-model' })
  })
})

// 任务分级表：档位口径锁死（改档只动表·调用点不点名槽位）。
describe('modelTaskTiers（任务分级表）', () => {
  it('分级表档位=用户拍板口径', () => {
    expect(MODEL_TASK_TIERS).toEqual({
      // 2026-07-10 状态系统融入提调计划：统筹升掌阁（directorLoop 一个 id 管统筹/纠偏/精修三处同升）。
      directorLoop: 'smart',
      replyRouteJudge: 'fast',
      focusedActionJudge: 'fast',
      replyPlanMain: 'balanced',
      replyPlanLite: 'balanced',
      roleMessage: 'message',
      narrationMessage: 'message',
      rimworldText: 'fast',
      xingyiAgent: 'smart',
      soulAutoWrite: 'smart',
      langhuanAssist: 'smart',
      personalityCalibration: 'smart',
      personalityTraining: 'smart',
      kernelParse: 'fast',
      recallJudge: 'balanced',
      recallFormat: 'fast',
      messageProjection: 'fast',
      xingyiDiary: 'balanced',
      improvCharacterExtract: 'smart',
      projectionWriteback: 'balanced',
      sessionTempProfile: 'balanced',
      // 统筹派遣 subagent 小 loop（采风=融入计划批次2·造册=并行编排批次B·绘舆=地图系统批5）：校书档。
      caifengResearch: 'balanced',
      zaoceBuild: 'balanced',
      // 编剧咨询小 loop（剧本系统优化批次3·2026-07-10 升真 loop 入本表）：创作型=掌阁档（沿旧 spec 拍板）。
      scriptwriterConsult: 'smart',
      mapDraw: 'balanced',
      imageCaption: 'balanced'
    })
  })

  it('buildTaskModelAiOptions：角色消息走执笔档并保留调用点参数覆写', () => {
    const options = buildTaskModelAiOptions({
      modelUsageConfigs: [
        { id: 'message', presetName: '执笔预设', model: 'writer-model', temperature: 0.7, maxTokens: 1024, thinking: 'disabled' }
      ]
    }, 'roleMessage', { temperature: 1, maxTokens: 4096, thinking: 'enabled' })
    expect(options).toMatchObject({
      modelUsageSlotId: 'message',
      presetName: '执笔预设',
      model: 'writer-model',
      temperature: 1,
      maxTokens: 4096,
      thinking: 'enabled'
    })
  })
})
