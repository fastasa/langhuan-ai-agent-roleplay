import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  invalidateOrchestratorConfigCache,
  loadEffectiveOrchestratorConfig
} from '../../../src/repositories/orchestratorConfigRepository.ts'
import { DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG } from '../../../src/app/personalityPlanOrchestrator.ts'

/** 造一份「除合并生成协议外全部现代 marker 齐备」的旧 systemPrompt（不含 batches 口径）。 */
function buildLegacySystemPrompt({ withBatches = false } = {}) {
  return [
    '自定义编排规则开头。',
    '生成轮给出 expressionMix 五项占比。',
    withBatches
      ? '读到正文后只发起一次 generatePlanBatch，用 batches 数组一次带全部反应类别。'
      : '读到正文后为每个反应类别各发起一次 generatePlanBatch。',
    '命中快进时间或改变地点意图时调用 updateCurtainScene，目标必须是正经地点名称。',
    '取料三件套按需调用。'
  ].join('\n')
}

function stubFetchWithConfig(config) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify(config)
  })))
}

describe('orchestratorConfigRepository·合并生成协议升级门（2026-07-08）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    invalidateOrchestratorConfigCache()
  })

  it('存量 systemPrompt 缺 batches 口径 → 强制升级回默认提示词（含合并生成协议）', async () => {
    invalidateOrchestratorConfigCache()
    stubFetchWithConfig({
      systemPrompt: buildLegacySystemPrompt(),
      scenarios: [],
      tools: [{ name: 'updateCurtainScene', kind: 'meta', brief: 'x', manual: 'y' }]
    })
    const config = await loadEffectiveOrchestratorConfig()
    expect(config.systemPrompt).toBe(DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.systemPrompt)
    expect(config.systemPrompt).toContain('只发起一次 generatePlanBatch')
    expect(config.systemPrompt).toContain('batches')
  })

  it('存量 systemPrompt 已含 batches 口径且其余 marker 齐备 → 保留用户自定义', async () => {
    invalidateOrchestratorConfigCache()
    const customPrompt = buildLegacySystemPrompt({ withBatches: true })
    stubFetchWithConfig({
      systemPrompt: customPrompt,
      scenarios: [],
      tools: [{ name: 'updateCurtainScene', kind: 'meta', brief: 'x', manual: 'y' }]
    })
    const config = await loadEffectiveOrchestratorConfig()
    expect(config.systemPrompt).toBe(customPrompt)
  })

  it('情境正文旧话术「为每一类调用一次 generatePlanBatch」原位替换成 batches 口径，其余自定义内容保留', async () => {
    invalidateOrchestratorConfigCache()
    stubFetchWithConfig({
      systemPrompt: buildLegacySystemPrompt({ withBatches: true }),
      scenarios: [{
        code: 'custom',
        label: '自定义',
        trigger: '触发描述',
        body: '自定义情境下，角色在两类反应间选择；为每一类调用一次 generatePlanBatch，强度取 low / high 两档：\n- 甲类。\n- 乙类。'
      }],
      tools: [{ name: 'updateCurtainScene', kind: 'meta', brief: 'x', manual: 'y' }]
    })
    const config = await loadEffectiveOrchestratorConfig()
    const body = config.scenarios[0].body
    expect(body).not.toContain('为每一类调用一次 generatePlanBatch')
    expect(body).toContain('只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项')
    expect(body).toContain('强度取 low / high 两档')
    expect(body).toContain('- 甲类。')
  })

  it('默认 seed 情境正文已是 batches 口径（压力/喜悦）', () => {
    for (const scenario of DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.scenarios) {
      expect(scenario.body).toContain('只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项')
      expect(scenario.body).not.toContain('为每一类调用一次 generatePlanBatch')
    }
  })
})
