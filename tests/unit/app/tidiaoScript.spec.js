import { describe, expect, it } from 'vitest'
import {
  TIDIAO_SCRIPT_SCHEMA_VERSION,
  TIDIAO_TOOL_PACKAGES,
  TIDIAO_CORE_TOOLS,
  buildTidiaoScript,
  isTidiaoScriptCurrent,
  normalizeTidiaoScript
} from '../../../src/app/tidiaoScript.ts'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

function orchestration(overrides = {}) {
  return {
    scenario: 'pressure',
    strategyMatrix: [{ strategy: 'aggressive', strategyLabel: '进攻性', intensities: ['medium'], planPrompt: 'p' }],
    toolCalls: [{ tool: 'generatePlanBatch', strategy: 'aggressive', strategyLabel: '进攻性', intensities: ['medium'], planPrompt: 'p' }],
    candidates: [{ id: 'aggressive_medium', strategy: 'aggressive', intensity: 'medium', content: '计划正文' }],
    expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
    orchestrationSummary: '本轮压力情境',
    ...overrides
  }
}

describe('TidiaoScript 协议升格汇编', () => {
  it('把现役 ReplyPlanOrchestration 字段平移到剧本对应块', () => {
    const script = buildTidiaoScript({
      mode: 'personality_model',
      orchestration: orchestration(),
      topPlans: [{ id: 'aggressive_medium', strategy: 'aggressive', intensity: 'medium', content: '计划正文' }],
      sceneChange: { changed: true, notice: '从客厅到屋外', curtainUpdate: { patch: { location: '屋外' } } }
    })
    expect(script.schemaVersion).toBe(TIDIAO_SCRIPT_SCHEMA_VERSION)
    expect(script.mode).toBe('personality_model')
    expect(script.situation.scenario).toBe('pressure')
    expect(script.situation.sceneChange).toEqual({ changed: true, notice: '从客厅到屋外', curtainUpdate: { patch: { location: '屋外' } } })
    expect(script.writingDecision.expressionMix).toEqual({ action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 })
    expect(script.plans.candidates).toHaveLength(1)
    expect(script.plans.topPlans).toHaveLength(1)
    expect(script.plans.strategyMatrix).toHaveLength(1)
    expect(script.plans.toolCalls).toHaveLength(1)
    expect(script.trace.orchestrationSummary).toBe('本轮压力情境')
  })

  it('现役链路尚未产出的下游字段一律落空占位（不假装完成）', () => {
    const script = buildTidiaoScript({
      mode: 'personality_model',
      orchestration: orchestration(),
      topPlans: []
    })
    expect(script.retrieval.decisions).toEqual([])
    expect(script.cast).toEqual([])
    expect(script.narration).toEqual([])
    expect(script.writingDecision.dimensions).toEqual([])
    expect(script.trace.thoughts).toEqual([])
    expect(script.situation.sceneChange.changed).toBe(false)
  })

  it('normal_recall 无 expressionMix 时豁免为 null', () => {
    const script = buildTidiaoScript({
      mode: 'normal_recall',
      orchestration: orchestration({ expressionMix: undefined }),
      topPlans: []
    })
    expect(script.mode).toBe('normal_recall')
    expect(script.writingDecision.expressionMix).toBeNull()
  })
})

describe('TidiaoScript 持久化归一与升级判定', () => {
  it('isTidiaoScriptCurrent 只认当前协议版本', () => {
    expect(isTidiaoScriptCurrent({ schemaVersion: TIDIAO_SCRIPT_SCHEMA_VERSION })).toBe(true)
    expect(isTidiaoScriptCurrent({ schemaVersion: 'tidiao-script-v0' })).toBe(false)
    expect(isTidiaoScriptCurrent(null)).toBe(false)
    expect(isTidiaoScriptCurrent({})).toBe(false)
  })

  it('归一旧 ReplyPlanOrchestration 形态：scenario/expressionMix/diagnostics 顶层兼容', () => {
    const legacy = {
      scenario: 'joy',
      expressionMix: { action: 10, dialogue: 50, expression: 20, innerState: 20, narration: 0 },
      candidates: [{ id: 'a', strategy: 's', intensity: 'medium', content: 'c' }],
      strategyMatrix: [{ strategy: 's', strategyLabel: 'S', intensities: ['medium'], planPrompt: 'p' }],
      toolCalls: [],
      orchestrationSummary: '旧记录',
      diagnostics: { degraded: true }
    }
    const script = normalizeTidiaoScript(legacy, 'personality_model')
    expect(script.schemaVersion).toBe(TIDIAO_SCRIPT_SCHEMA_VERSION)
    expect(script.situation.scenario).toBe('joy')
    expect(script.writingDecision.expressionMix).toEqual(legacy.expressionMix)
    expect(script.plans.candidates).toHaveLength(1)
    expect(script.plans.strategyMatrix).toHaveLength(1)
    expect(script.trace.orchestrationSummary).toBe('旧记录')
    expect(script.meta.degraded).toBe(true)
  })

  it('归一非法对象回退为空壳剧本', () => {
    const script = normalizeTidiaoScript('not an object')
    expect(script.schemaVersion).toBe(TIDIAO_SCRIPT_SCHEMA_VERSION)
    expect(script.situation.scenario).toBe('')
    expect(script.plans.candidates).toEqual([])
    expect(script.writingDecision.expressionMix).toBeNull()
  })

  it('归一已是当前版本的剧本时保留下游字段', () => {
    const current = buildTidiaoScript({
      mode: 'personality_model',
      orchestration: orchestration(),
      topPlans: [],
      writingDimensions: { dimensions: ['环境描写'], reason: '进新场景' }
    })
    current.retrieval.decisions.push({ kind: 'fetch', query: '大厅设定', reason: '角色不知屋内' })
    const normalized = normalizeTidiaoScript(current)
    expect(normalized.writingDecision.dimensions).toEqual(['环境描写'])
    expect(normalized.retrieval.decisions).toHaveLength(1)
  })
})

describe('提调工具包边界（§4.6）', () => {
  it('按世界能力切四个包，现役 active / 规划中 planned 标注清晰', () => {
    const ids = TIDIAO_TOOL_PACKAGES.map((pkg) => pkg.id)
    expect(ids).toEqual(['worldChange', 'retrieval', 'narration', 'cast'])
    const worldChange = TIDIAO_TOOL_PACKAGES.find((pkg) => pkg.id === 'worldChange')
    expect(worldChange.status).toBe('active')
    expect(worldChange.tools).toContain('updateCurtainScene')
    expect(TIDIAO_TOOL_PACKAGES.find((pkg) => pkg.id === 'retrieval').plannedBatch).toBe(1)
    expect(TIDIAO_TOOL_PACKAGES.find((pkg) => pkg.id === 'narration').plannedBatch).toBe(2)
    expect(TIDIAO_TOOL_PACKAGES.find((pkg) => pkg.id === 'cast').plannedBatch).toBe(6)
  })

  it('编排原语（元工具/计划产出）不混入四个世界能力包', () => {
    const packageTools = new Set(TIDIAO_TOOL_PACKAGES.flatMap((pkg) => pkg.tools))
    for (const tool of [...TIDIAO_CORE_TOOLS.meta, ...TIDIAO_CORE_TOOLS.planProduction]) {
      expect(packageTools.has(tool)).toBe(false)
    }
    expect(TIDIAO_CORE_TOOLS.planProduction).toContain('generatePlanBatch')
  })
})

describe('提调有界舞台（正式化现有自研有界 loop）', () => {
  it('空转：模型立即收束的有界 loop 干净终止于 done，且不超步数预算', async () => {
    const budget = { maxTurns: 6, maxToolCalls: 6, maxMetaToolCalls: 6 }
    const result = await runAgentRuntime({
      agentName: 'TidiaoBoundedStageSmoke',
      runtimeVersion: 'tidiao-bounded-stage-smoke',
      messages: [{ role: 'system', content: '提调有界舞台空转' }],
      toolRegistry: new ToolRegistry([]),
      initialActiveTools: [],
      budget,
      callModel: () => '{}',
      parseModelOutput: () => ({ stage: 'done', done: true, content: '{}', parsed: {}, toolCalls: [] })
    })
    expect(result.transcript.terminalReason).toBe('done')
    expect(result.transcript.turns.length).toBeLessThanOrEqual(budget.maxTurns)
    expect(result.transcript.turns.length).toBe(1)
  })

  it('预算上限：模型永不收束时，工具调用触顶即 budget-exceeded（有界保证）', async () => {
    const budget = { maxTurns: 20, maxToolCalls: 2, maxMetaToolCalls: 6 }
    let modelCalls = 0
    const result = await runAgentRuntime({
      agentName: 'TidiaoBoundedStageBudget',
      runtimeVersion: 'tidiao-bounded-stage-budget',
      messages: [{ role: 'system', content: '提调有界舞台预算' }],
      toolRegistry: new ToolRegistry([
        { name: 'noop', brief: '空操作', execute: () => ({ content: 'ok', details: {} }) }
      ]),
      initialActiveTools: ['noop'],
      budget,
      callModel: () => { modelCalls += 1; return '{}' },
      parseModelOutput: () => ({ stage: 'noop', done: false, content: '{}', parsed: {}, toolCalls: [{ tool: 'noop', args: {} }] })
    })
    expect(result.transcript.terminalReason).toBe('budget-exceeded')
    // 没跑满 20 轮即被预算提前收束（证明有界）；模型最多比工具上限多 1 轮去「发现」预算耗尽
    expect(result.transcript.turns.length).toBeLessThan(budget.maxTurns)
    expect(modelCalls).toBeLessThanOrEqual(budget.maxToolCalls + 1)
  })
})
