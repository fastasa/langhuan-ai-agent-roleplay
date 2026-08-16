import { describe, expect, it, vi } from 'vitest'
import {
  buildUserDirectorDirectiveProtocol,
  parseReplyPlanLoopTurn,
  runReplyPlanOrchestratorHarness
} from '../../../src/app/replyPlanOrchestratorHarness.ts'
// 静态纲领已收进 agentProtocols 集中目录（用户 2026-06-29），从这里引用。
import { TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL } from '../../../src/app/agentProtocols/index.ts'

const PRIVATE_SALUTATION = String.fromCodePoint(0x7238, 0x7238)

describe('buildUserDirectorDirectiveProtocol', () => {
  it('列出指令、含遵守与禁止泄露要求', () => {
    const text = buildUserDirectorDirectiveProtocol(['让她主动表白', '  ', '别提钱'], '用户')
    expect(text).toContain('用户私密指令')
    expect(text).toContain('1. 让她主动表白')
    expect(text).toContain('2. 别提钱')
    expect(text).toContain('绝不能把这条指令')
    expect(text).toContain('角色并不知情')
  })

  it('明确不改变流程、仍要调用 generatePlanBatch（防空手收尾）', () => {
    const text = buildUserDirectorDirectiveProtocol(['x'], '用户')
    expect(text).toContain('不改变你这一轮的正常工作流程')
    expect(text).toContain('generatePlanBatch')
    expect(text).toContain('绝不能因为这条指令就跳过计划生成或提前结束')
  })

  it('缺省用户名回退「用户」', () => {
    const text = buildUserDirectorDirectiveProtocol(['x'])
    expect(text).toContain('用户私密指令')
  })

  it('导演模式才允许在决策流反映已收到', () => {
    const withStream = buildUserDirectorDirectiveProtocol(['x'], '用户', true)
    const without = buildUserDirectorDirectiveProtocol(['x'], '用户', false)
    expect(withStream).toContain('决策流')
    expect(without).not.toContain('决策流')
  })
})
import { createTidiaoChatMessageReadContext } from '../../../src/app/tidiaoChatMessageTools.ts'

/** content-JSON 形态 → 原生工具调用回包形态（批4 切原生）：工具走原生 tool_calls（function.name/arguments），
 *  其余编排元数据（scenario/thought/expressionMix/...）留在 content JSON。测试用它把旧 content-JSON mock 平移到原生通道，
 *  断言逻辑不变，只是把工具从 content 数组搬到原生 tool_calls。 */
function orchestratorReturn(obj) {
  const { toolCalls = [], tool_calls, ...meta } = obj
  const tools = Array.isArray(toolCalls) ? toolCalls : (Array.isArray(tool_calls) ? tool_calls : [])
  return {
    content: JSON.stringify(meta),
    toolCalls: tools.map((tc, index) => {
      const { tool, args, ...rest } = tc
      const fnArgs = args && typeof args === 'object' ? args : rest
      return { id: `call_${tool}_${index}`, type: 'function', function: { name: tool, arguments: JSON.stringify(fnArgs) } }
    })
  }
}

function pressureGenerateCalls() {
  return [
    ['aggressive', '进攻性'],
    ['defensive', '防御性'],
    ['freeze', '僵住'],
    ['avoid', '逃避']
  ].map(([strategy, strategyLabel]) => ({
    tool: 'generatePlanBatch',
    strategy,
    strategyLabel,
    intensities: ['low', 'medium', 'high'],
    planPrompt: `${strategyLabel}计划提示词`
  }))
}

// 合法表达占比（五项整数合计 100），用于编排器生成轮顶层 expressionMix。
function mix() {
  return { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 }
}

// 合并生成协议（2026-07-08）：接缝一次收全部类别组（数组）；旧式逐类调用=单元素数组，计数断言不变。
function makeGenerate() {
  return vi.fn(async (toolCalls) => ({
    promptLogId: `prompt_${toolCalls.map((toolCall) => toolCall.strategy).join('_')}`,
    candidates: toolCalls.flatMap((toolCall) => toolCall.intensities.map((intensity) => ({
      id: `${toolCall.strategy}_${intensity}`,
      strategy: toolCall.strategy,
      strategyLabel: toolCall.strategyLabel,
      intensity,
      content: `${toolCall.strategyLabel} ${intensity} 计划`
    })))
  }))
}

function makeReview() {
  return vi.fn(async (_toolCall, candidates) => ({
    promptLogId: 'review_prompt',
    scoredCandidates: candidates.map((candidate, index) => ({ ...candidate, score: 20 - index })),
    topPlans: candidates.slice(0, 3).map((candidate, index) => ({ ...candidate, score: 20 - index })),
    diagnostics: { candidateCount: candidates.length }
  }))
}

// 批次1d-A：取料三件套接缝 stub（鹿角厅一条世界素材）。
function makeRetrievalContext() {
  return {
    scoreCandidatesForQuery: vi.fn(async () => [
      { unitId: 'u1', title: '鹿角厅', summary: '大厅挂满鹿角', score: 0.9 }
    ]),
    resolveUnit: vi.fn((unitId) => unitId === 'u1'
      ? { title: '鹿角厅', summary: '大厅挂满鹿角', body: '长桌尽头坐着一个老人。' }
      : null),
    listSearchableUnits: vi.fn(() => [
      { unitId: 'u1', title: '鹿角厅', summary: '大厅挂满鹿角', text: '长桌尽头坐着一个老人。' }
    ])
  }
}

describe('replyPlanOrchestratorHarness（AgentRuntime adapter）', () => {
  it('按 AgentRuntime 执行 read -> generate/review，评审成功即收束（批次4 去融合）', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools, messages }) => {
      if (turnIndex === 0) {
        expect(messages[0].content.match(/【当前会话世界上下文】/g)).toHaveLength(1)
        expect(messages[0].content).toContain('当前世界：维斯珂')
        expect(messages[0].content).toContain('角色计划与方向：性格第一')
        expect(messages[0].content).toContain('角色性格是最高优先级的创作判断')
        expect(messages[0].content.match(/角色计划与方向：性格第一/g)).toHaveLength(1)
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境',
          toolCalls: [{
            tool: 'readScenarioSkill',
            code: 'pressure',
            expectation: '拿到压力情境正文，并确认正文包含反应类别和强度要求。'
          }],
          done: false
        })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '根据情境生成候选并评审',
        toolCalls: [
          ...pressureGenerateCalls(),
          { tool: 'reviewPlanCandidates', candidateIds: ['*'], expectation: '评审全部候选并返回前三计划。' }
        ],
        // 编排器生成轮顶层产出表达占比，作为最终回复唯一真值。
        expressionMix: { action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 },
        // 与表达占比并排的建议字数区间（≥ 硬下限 500）。
        wordCountAdvice: { min: 800, max: 1200 },
        orchestrationSummary: '压力场景按四类三档展开。',
        done: false
      })
    })
    const onScenarioResolved = vi.fn()

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      sessionWorldContext: {
        mounted: true,
        world: { id: 'world_1', name: '维斯珂' },
        documentScope: { ids: ['doc_secret'], count: 1 },
        entities: { count: 0, items: [] },
        defaultMapSheet: null,
        curtain: null
      },
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      onScenarioResolved
    })

    expect(onScenarioResolved).toHaveBeenCalledTimes(1)
    expect(onScenarioResolved).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'pressure',
      scenarioBody: expect.stringContaining('压力')
    }))
    // 旁白支线提前启动真值：情境正文轮的工具结果处理完、下一轮模型调用前就收束情境，
    // 不等编排器第二轮模型返回（更不等 generatePlanBatch）。
    expect(onScenarioResolved.mock.invocationCallOrder[0]).toBeLessThan(callOrchestrator.mock.invocationCallOrder[1])
    expect(generatePlanBatch).toHaveBeenCalledTimes(4)
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
    // 去融合后评审即终点：read + generate/review 两轮收束，不再有 synthesize 轮。
    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.candidates).toHaveLength(12)
    expect(result.scoredCandidates).toHaveLength(12)
    expect(result.topPlans).toHaveLength(3)
    expect(result).not.toHaveProperty('planSynthesis')
    expect(result.transcript.turns.flatMap((turn) => turn.toolCalls).map((call) => call.toolName)).not.toContain('synthesizeReviewedPlans')
    expect(JSON.stringify(result.transcript.history)).not.toContain('[工具结果]')
    expect(result.orchestration.toolCalls.map((call) => call.promptLogId)).toEqual([
      'prompt_aggressive',
      'prompt_defensive',
      'prompt_freeze',
      'prompt_avoid',
      'review_prompt'
    ])
    // 表达占比唯一真值来自编排器生成轮（50/20/20/10/0），直接驱动最终回复。
    expect(result.expressionMix).toEqual({ action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 })
    expect(result.orchestration.expressionMix).toEqual(result.expressionMix)
    // 建议字数与表达占比同处取自生成轮顶层，透传到结果与 orchestration。
    expect(result.wordCountAdvice).toEqual({ min: 800, max: 1200 })
    expect(result.orchestration.wordCountAdvice).toEqual({ min: 800, max: 1200 })
  })

  it('F2 群聊分镜吃提调情境：providedScenario 存在时不激活 readScenarioSkill、情境正文注入提示词、turn0 直接进生成轮、单轮收束', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const onScenarioResolved = vi.fn()
    let turn0Messages = null
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools, messages, toolCatalog }) => {
      // F2 真值：提调已下发情境 → 首轮即开放生成轮，readScenarioSkill 不在 activeTools（分镜不再自己判情境）。
      expect(turnIndex).toBe(0)
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
      expect(activeTools).not.toContain('readScenarioSkill')
      expect(toolCatalog).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'generatePlanBatch', recommended: true }),
        expect.objectContaining({ name: 'reviewPlanCandidates', recommended: true }),
        expect.objectContaining({ name: 'getToolManual', recommended: true })
      ]))
      turn0Messages = messages
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '提调已下发情境，直接据它生成候选并评审',
        toolCalls: [
          ...pressureGenerateCalls(),
          { tool: 'reviewPlanCandidates', candidateIds: ['*'], expectation: '评审全部候选并返回前三计划。' }
        ],
        expressionMix: mix(),
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      // F2：提调轮级判好的情境 code+body 下发给分镜（跳过 readScenarioSkill）。
      providedScenario: { code: 'pressure', body: '压力情境正文：四类反应（进攻/防御/僵住/逃避），各三档强度。' },
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      onScenarioResolved
    })

    // 单轮收束：没有独立判情境轮，generate+review 同轮 → callOrchestrator 仅一次。
    expect(callOrchestrator).toHaveBeenCalledTimes(1)
    // 情境正文作为一条消息注入提示词，模型首轮即可见（不靠 readScenarioSkill 工具结果）。
    expect(JSON.stringify(turn0Messages)).toContain('压力情境正文：四类反应')
    expect(JSON.stringify(turn0Messages)).toContain('无需再判情境')
    // 情境收束据预置 scenarioBody 即时触发（旁白陪跑支线据此起跑），下发的 code/body 透传。
    expect(onScenarioResolved).toHaveBeenCalledTimes(1)
    expect(onScenarioResolved).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'pressure',
      scenarioBody: expect.stringContaining('压力情境正文')
    }))
    // orchestration.scenario = 下发的 code（供最终回复挂载提示词解析）。
    expect(result.orchestration.scenario).toBe('pressure')
    expect(result.transcript.initialActiveTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual'])
    expect(result.transcript.promptSupplyTrace).toEqual([
      expect.objectContaining({
        profileId: 'role_reply.plan-orchestration',
        skillId: 'tidiao.environment-manual',
        layer: '1',
        loadState: 'catalog_only'
      })
    ])
    expect(result.transcript.toolSupplyDiagnostics).toEqual([
      expect.objectContaining({
        profileId: 'role_reply.plan-orchestration',
        toolName: 'readScenarioSkill'
      }),
      expect.objectContaining({
        profileId: 'role_reply.plan-orchestration',
        toolName: 'updateCurtainScene'
      })
    ])
    expect(generatePlanBatch).toHaveBeenCalledTimes(4)
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
    expect(result.topPlans).toHaveLength(3)
  })

  it('缺少表达占比补救：模型自调评审却从没给合法 expressionMix 时，发起 completePlanMetadata 补齐轮，正常收尾不再 throw', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    let completeCalls = 0
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      // 补齐轮：只激活 completePlanMetadata，模型据反馈补齐五项整数合计 100 的表达占比 + 建议字数。
      if (activeTools.includes('completePlanMetadata')) {
        completeCalls += 1
        return orchestratorReturn({
          thought: '刚才漏给了表达占比，补一份',
          toolCalls: [{
            tool: 'completePlanMetadata',
            action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0,
            wordCountAdvice: { min: 800, max: 1200 }
          }],
          done: false
        })
      }
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure', thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      // 生成 + 自调评审，但 content 顶层始终不给 expressionMix（复现「评审路径②漏给占比」）。
      return orchestratorReturn({
        scenario: 'pressure', thought: '生成候选并评审',
        toolCalls: [
          ...pressureGenerateCalls(),
          { tool: 'reviewPlanCandidates', candidateIds: ['*'], expectation: '评审全部候选并返回前三计划。' }
        ],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    // 补齐轮恰好触发一次，且收尾拿到模型补齐的合法占比与建议字数（不伪造、不 throw）。
    expect(completeCalls).toBe(1)
    expect(result.expressionMix).toEqual({ action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 })
    expect(result.orchestration.expressionMix).toEqual(result.expressionMix)
    expect(result.wordCountAdvice).toEqual({ min: 800, max: 1200 })
    expect(generatePlanBatch).toHaveBeenCalledTimes(4)
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
  })

  it('缺少表达占比补救：补齐轮模型仍只给非法占比（合计≠100）时，不伪造默认值、最终 throw', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (activeTools.includes('completePlanMetadata')) {
        // 故意给合计 90 的非法占比：harness 校验拒绝、绝不拍默认值。
        return orchestratorReturn({
          thought: '补占比',
          toolCalls: [{ tool: 'completePlanMetadata', action: 40, dialogue: 30, expression: 10, innerState: 10, narration: 0 }],
          done: false
        })
      }
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure', thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure', thought: '生成候选并评审',
        toolCalls: [
          ...pressureGenerateCalls(),
          { tool: 'reviewPlanCandidates', candidateIds: ['*'], expectation: '评审全部候选并返回前三计划。' }
        ],
        done: false
      })
    })

    await expect(runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })).rejects.toThrow('补齐轮也未能取得')
  })

  it('2026-06-17 评审降级：本地 ReRanker 抛错时不再整轮崩溃，按候选顺序降级出前三计划并上报降级原因', async () => {
    const generatePlanBatch = makeGenerate()
    // 复现用户报修：移动端本地 ReRanker（wasm/模型包）跑不动，评审一启动就抛错。
    const reviewPlanCandidates = vi.fn(async () => { throw new Error('ReRanker 模型加载失败：ort-wasm 拉取超时') })
    const onReviewDegraded = vi.fn()
    const onStageProgress = vi.fn()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到压力情境正文。' }],
          done: false
        })
      }
      // 生成轮只发候选 + 顶层 expressionMix，不显式调用 reviewPlanCandidates：
      // 由 harness 在下一次 callModel 入口自动触发评审（2026-06-12 自动评审）。
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '生成候选，等系统自动评审',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 },
        orchestrationSummary: '压力场景按四类三档展开。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      onReviewDegraded,
      onStageProgress,
      onScenarioResolved: vi.fn()
    })

    // 没有抛错、正常收束；评审只调用一次（抛错后不再重试）。
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
    // 降级回调带上真实原因，供过程轨如实标注。
    expect(onReviewDegraded).toHaveBeenCalledTimes(1)
    expect(onReviewDegraded.mock.calls[0][0]).toContain('ReRanker 模型加载失败')
    // 降级后按候选自身顺序产出前三计划，最终回复仍可继续。
    expect(result.topPlans).toHaveLength(3)
    expect(result.scoredCandidates).toHaveLength(12)
    expect(result.diagnostics).toMatchObject({ degraded: true })
    expect(String(result.diagnostics.degradeReason)).toContain('ReRanker 模型加载失败')
    // 表达占比仍来自编排器生成轮，不受评审降级影响。
    expect(result.expressionMix).toEqual({ action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 })
    // 评审步收口为 done（保持工作流存活），不是 failed（不再让过程轨整条消失）。
    const reviewProgress = onStageProgress.mock.calls.map((args) => args[0]).filter((event) => event.step === 'review')
    expect(reviewProgress.some((event) => event.status === 'done')).toBe(true)
    expect(reviewProgress.some((event) => event.status === 'failed')).toBe(false)
  })

  it('批次G·导演模式：自动评审在决策流投影成一条带工具条的评审决策（不再只两条、不重复）', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const snapshots = []
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '这是闲聊放松的情境，先读写法',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      // 生成轮发候选 + 顶层 expressionMix，不显式调用评审 → harness 自动触发评审。
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '让她顺着话头温柔接一句',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      onScenarioResolved: vi.fn(),
      onDirectorStream: (stream) => snapshots.push(stream)
    })

    const finalStream = snapshots[snapshots.length - 1]
    expect(finalStream.phase).toBe('done')
    // 评审决策可见：恰好一条 review 决策、带 reviewPlanCandidates 工具条收成 done（不重复）。
    const reviewDecisions = finalStream.decisions.filter((d) => d.kind === 'review')
    expect(reviewDecisions).toHaveLength(1)
    expect(reviewDecisions[0].tool).toMatchObject({ tool: 'reviewPlanCandidates', status: 'done' })
    expect(reviewDecisions[0].tool.resultPreview).toContain('挑出前')
    // 决策流不再只两条：判情境 + 生成 + 评审都在。
    expect(finalStream.decisions.length).toBeGreaterThanOrEqual(3)
    expect(finalStream.decisions.some((d) => d.kind === 'situation')).toBe(true)
    expect(finalStream.decisions.some((d) => d.kind === 'generate')).toBe(true)
    // 遗留3：角色镜方向取 generatePlanBatch 的 planPrompt（要回复什么内容），不再借生成步 thought。
    // （并发批完成顺序不保证，断言「是某条 planPrompt」而非固定哪一条——重点是不再是生成步 thought。）
    const charShot = finalStream.shots.find((s) => s.kind === 'character')
    expect(charShot.label).toBe('林雪云')
    expect(charShot.direction).toContain('计划提示词')
    expect(charShot.direction).not.toBe('让她顺着话头温柔接一句')
  })

  it('批次G·导演模式：评审降级投影成 done 工具条 + 降级摘要（不误报错）', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = vi.fn(async () => { throw new Error('ReRanker 模型加载失败') })
    const snapshots = []
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '生成候选',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      onScenarioResolved: vi.fn(),
      onReviewDegraded: vi.fn(),
      onDirectorStream: (stream) => snapshots.push(stream)
    })

    const finalStream = snapshots[snapshots.length - 1]
    const reviewDecisions = finalStream.decisions.filter((d) => d.kind === 'review')
    expect(reviewDecisions).toHaveLength(1)
    // 降级不是死失败：工具条 done + 降级摘要。
    expect(reviewDecisions[0].tool).toMatchObject({ tool: 'reviewPlanCandidates', status: 'done' })
    expect(reviewDecisions[0].tool.resultPreview).toContain('降级')
  })

  it('停止纠偏（2026-06-20）：导演软停 shouldPause 触发后 harness 抛 AbortError、当前步跑完不进生成', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    let pauseChecks = 0
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure', thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure', thought: '生成候选',
        toolCalls: pressureGenerateCalls(), expressionMix: mix(), done: false
      })
    })
    let caught
    try {
      await runReplyPlanOrchestratorHarness({
        characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
        callOrchestrator, generatePlanBatch, reviewPlanCandidates,
        onScenarioResolved: vi.fn(),
        onDirectorStream: vi.fn(),
        // 第 0 轮起点放行、第 1 轮起点请求软停
        shouldPause: () => { pauseChecks += 1; return pauseChecks > 1 }
      })
    } catch (e) { caught = e }
    // 软停以 AbortError 收束，复用全链路 isAbortError 走「挂起纠偏」分支（出纠偏框，不报生成失败）。
    expect(caught?.name).toBe('AbortError')
    // 软停拦在第 1 轮起点：第 0 轮读情境跑完，生成步从未进入。
    expect(generatePlanBatch).not.toHaveBeenCalled()
  })

  it('停止纠偏（2026-06-20）：生成步抛 AbortError 时按取消处理（不吞成生成失败、不重试风暴）', async () => {
    const controller = new AbortController()
    const abortErr = new Error('生成已停止'); abortErr.name = 'AbortError'
    // 模拟硬取消：生成步的模型调用被 abort，抛 AbortError，同时取消信号置位。
    const generatePlanBatch = vi.fn(async () => { controller.abort(); throw abortErr })
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure', thought: '先读情境',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到情境正文。' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure', thought: '生成候选',
        toolCalls: pressureGenerateCalls(), expressionMix: mix(), done: false
      })
    })
    let caught
    try {
      await runReplyPlanOrchestratorHarness({
        characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
        signal: controller.signal,
        callOrchestrator, generatePlanBatch, reviewPlanCandidates, onScenarioResolved: vi.fn()
      })
    } catch (e) { caught = e }
    // abort 被当成取消（AbortError）冒泡，而不是「编排失败」生成错误。
    expect(caught?.name).toBe('AbortError')
    // 不重试风暴：生成步只在这一批被调用（4 个反应类别），未被反复重发。
    expect(generatePlanBatch.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('批次K·自主重排：导演模式 + replanBrief 时系统提示词追加纠偏自主重规划协议（含上一轮方向 + 纠偏文本）', async () => {
    let turn0SystemPrompt = ''
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        turn0SystemPrompt = messages[0].content
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '用户说大小姐心情好，那我把她改成顺着附和',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '让她顺着话头温柔接一句',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      onDirectorStream: vi.fn(),
      replanBrief: {
        correctionText: '大小姐今天心情好，会附和我',
        priorSituation: '这是闲聊放松的情境',
        priorDirections: [{ castName: '大小姐', direction: '嗤之以鼻' }]
      }
    })

    expect(turn0SystemPrompt).toContain('【纠偏自主重规划】')
    expect(turn0SystemPrompt).toContain('大小姐→嗤之以鼻')
    expect(turn0SystemPrompt).toContain('大小姐今天心情好，会附和我')
    expect(turn0SystemPrompt).toContain('「据纠偏重排」')
  })

  it('批次K·自主重排：无 replanBrief（普通导演轮）不追加重规划协议；非导演模式即便带 replanBrief 也不追加', async () => {
    let directorPrompt = ''
    let nonDirectorPrompt = ''
    const minimalLoop = (capture) => vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        capture(messages[0].content)
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    // 导演模式但无 replanBrief：不追加。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { directorPrompt = text }),
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      onDirectorStream: vi.fn()
    })
    expect(directorPrompt).not.toContain('【纠偏自主重规划】')

    // 非导演模式（无 onDirectorStream）即便带 replanBrief 也不追加（gated 在 directorMode）。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { nonDirectorPrompt = text }),
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      replanBrief: {
        correctionText: '大小姐今天心情好，会附和我',
        priorDirections: [{ castName: '大小姐', direction: '嗤之以鼻' }]
      }
    })
    expect(nonDirectorPrompt).not.toContain('【纠偏自主重规划】')
  })

  it('批次M1b·重试：导演模式 + retryBrief（带意见）时系统提示词追加重试协议（含原文 + 意见 + 按意见改这条）', async () => {
    let turn0SystemPrompt = ''
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        turn0SystemPrompt = messages[0].content
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      onDirectorStream: vi.fn(),
      retryBrief: { originalText: '她冷淡地点了点头。', instruction: '让她语气软一点' }
    })

    expect(turn0SystemPrompt).toContain('【重试这条消息】')
    expect(turn0SystemPrompt).toContain('她冷淡地点了点头。')
    expect(turn0SystemPrompt).toContain('让她语气软一点')
    // 缺省使用中性称呼，并确保私人环境中的特殊称呼不会进入公开版提示词。
    expect(turn0SystemPrompt).toContain('按用户意见改这条')
    expect(turn0SystemPrompt).not.toContain(`按${PRIVATE_SALUTATION}意见改这条`)
  })

  it('传 userName 时重试/重规划协议使用传入名称，不回退中性或私人称呼', async () => {
    let turn0SystemPrompt = ''
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        turn0SystemPrompt = messages[0].content
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云',
      userName: '陈先生',
      compressedContext: '已整合情境',
      currentUserInput: '今天晚上天气不错',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      onDirectorStream: vi.fn(),
      retryBrief: { originalText: '她冷淡地点了点头。', instruction: '让她语气软一点' }
    })

    expect(turn0SystemPrompt).toContain('按陈先生意见改这条')
    expect(turn0SystemPrompt).not.toContain('按用户意见改这条')
    expect(turn0SystemPrompt).not.toContain(`按${PRIVATE_SALUTATION}意见改这条`)
  })

  it('批次M1b·重试：无意见 retryBrief 追加「揣测重试意图」；无 retryBrief / 非导演模式均不追加', async () => {
    const captures = { guess: '', none: '', nonDirector: '' }
    const minimalLoop = (capture) => vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        capture(messages[0].content)
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    // 导演模式 + 无意见 retryBrief：追加揣测意图。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.guess = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn(),
      retryBrief: { originalText: '她冷淡地点了点头。' }
    })
    expect(captures.guess).toContain('【重试这条消息】')
    expect(captures.guess).toContain('揣测重试意图')

    // 导演模式但无 retryBrief：不追加。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.none = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
    })
    expect(captures.none).not.toContain('【重试这条消息】')

    // 非导演模式（无 onDirectorStream）即便带 retryBrief 也不追加（gated 在 directorMode）。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.nonDirector = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      retryBrief: { originalText: '她冷淡地点了点头。', instruction: '让她语气软一点' }
    })
    expect(captures.nonDirector).not.toContain('【重试这条消息】')
  })

  it('#5 主动取料倾向：导演模式 + retrievalContext 时追加放低取料门槛协议；缺接缝 / 非导演模式均不追加', async () => {
    const captures = { eager: '', noSeam: '', nonDirector: '' }
    const minimalLoop = (capture) => vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        capture(messages[0].content)
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    // 导演模式 + 取料接缝：追加主动取料倾向协议。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.eager = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn(),
      retrievalContext: makeRetrievalContext()
    })
    expect(captures.eager).toContain('【主动取料倾向】')
    expect(captures.eager).toContain('放低取料门槛')

    // 导演模式但无取料接缝：不追加（避免叫模型用没注册的工具）。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.noSeam = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
    })
    expect(captures.noSeam).not.toContain('【主动取料倾向】')

    // 非导演模式（无 onDirectorStream）即便带取料接缝也不追加（gated 在 directorMode）。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop((text) => { captures.nonDirector = text }),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(),
      retrievalContext: makeRetrievalContext()
    })
    expect(captures.nonDirector).not.toContain('【主动取料倾向】')
  })

  it('支线②·U5：导演模式补 searchDirectorMemory（进常驻 activeTools）；演员活（无 onDirectorStream）不补', async () => {
    const captures = { director: [], actor: [] }
    const minimalLoop = (bucket) => vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        bucket.push(...activeTools)
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    // 导演模式（onDirectorStream 存在=单聊续跑当导演）：searchDirectorMemory 进常驻 activeTools，与轮级提调/纠偏 loop 口径一致。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop(captures.director),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
    })
    expect(captures.director).toContain('searchDirectorMemory')

    // 演员活（无 onDirectorStream·directorStream:false 吃 providedScenario）：不补检索兜底，零污染演员计划编排。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop(captures.actor),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn()
    })
    expect(captures.actor).not.toContain('searchDirectorMemory')
  })

  // 批D·D2（2026-07-12·缓存重排）：提调知识库命中环境节撤出 system，改成 providedScenario 之后单独一条
  // user 消息（本 harness 没有 0-6 装配，没有独立层6，直接落在消息队列末尾）。恒定块仍前置进 system 最前。
  describe('批D·D2·提调知识库命中环境节新位置', () => {
    // 标记串取 2.4 帷幕小节正文独有的一句（2.0 速览索引里的一句话摘要不含这句，可安全拿来断言 system 不含命中内容）。
    const CURTAIN_BODY_ONLY = '改帷幕 ≠ 改消息原文里的时间词'

    it('currentUserInput 命中「帷幕」环境节（如「天气」）：system 不含命中正文；命中块作为独立 user 消息落在队列末尾并带区块头', async () => {
      let turn0Messages = null
      const result = await runReplyPlanOrchestratorHarness({
        characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
        callOrchestrator: vi.fn(async ({ turnIndex, messages }) => {
          if (turnIndex === 0) turn0Messages = messages
          if (turnIndex === 0) return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
          return orchestratorReturn({
            scenario: 'pressure', toolCalls: pressureGenerateCalls(),
            expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 }, done: false
          })
        }),
        generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
        onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
      })
      const system = turn0Messages[0]
      const tail = turn0Messages[turn0Messages.length - 1]
      expect(system.content).not.toContain(CURTAIN_BODY_ONLY)
      expect(tail.role).toBe('user')
      expect(tail.content).toContain('〔知识库按需节·本轮命中〕')
      expect(tail.content).toContain(CURTAIN_BODY_ONLY)
      expect(result.transcript.promptSupplyTrace).toEqual(expect.arrayContaining([
        expect.objectContaining({
          profileId: 'role_reply.plan-orchestration',
          skillId: 'tidiao.environment-manual',
          layer: '1',
          loadState: 'catalog_only'
        }),
        expect.objectContaining({
          profileId: 'role_reply.plan-orchestration',
          skillId: 'tidiao.environment-manual',
          layer: '4',
          loadState: 'loaded',
          selector: '2.4'
        })
      ]))
    })

    it('未命中环境节时只保留稳定 Skill 目录，不提前展开任何层4正文', async () => {
      let turn0Messages = null
      const result = await runReplyPlanOrchestratorHarness({
        characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '请自然回应',
        callOrchestrator: vi.fn(async ({ turnIndex, messages }) => {
          if (turnIndex === 0) turn0Messages = messages
          if (turnIndex === 0) return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
          return orchestratorReturn({
            scenario: 'pressure', toolCalls: pressureGenerateCalls(),
            expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 }, done: false
          })
        }),
        generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
        onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
      })

      expect(turn0Messages[0].content).toContain('tidiao.environment-manual')
      expect(turn0Messages[0].content).not.toContain(CURTAIN_BODY_ONLY)
      expect(turn0Messages.some((message) => message.content.includes('〔知识库按需节·本轮命中〕'))).toBe(false)
      expect(result.transcript.promptSupplyTrace).toEqual([
        expect.objectContaining({
          profileId: 'role_reply.plan-orchestration',
          skillId: 'tidiao.environment-manual',
          layer: '1',
          loadState: 'catalog_only'
        })
      ])
      expect(result.transcript.promptSupplyTrace.some((entry) => entry.layer === '4')).toBe(false)
    })

    it('两次调用只改 currentUserInput（命中不同环境节）：system 字符串逐字节相等', async () => {
      const runWith = async (currentUserInput) => {
        let turn0Messages = null
        await runReplyPlanOrchestratorHarness({
          characterName: '林雪云', compressedContext: '已整合情境', currentUserInput,
          callOrchestrator: vi.fn(async ({ turnIndex, messages }) => {
            if (turnIndex === 0) turn0Messages = messages
            if (turnIndex === 0) return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
            return orchestratorReturn({
              scenario: 'pressure', toolCalls: pressureGenerateCalls(),
              expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 }, done: false
            })
          }),
          generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
          onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
        })
        return turn0Messages[0].content
      }
      const systemA = await runWith('今天晚上天气不错') // 命中 2.4（帷幕/天气）
      const systemB = await runWith('这一轮的回复链路走得挺顺') // 命中 2.1（不同环境节）
      expect(systemA).toBe(systemB)
      expect(systemA).not.toContain(CURTAIN_BODY_ONLY)
    })
  })

  it('R2-0 演员纲领：演员模式先注入性格优先规则再注入演员纲领；导演模式不重复演员纲领', async () => {
    const systems = { director: '', actor: '' }
    const minimalLoop = (key) => vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        systems[key] = messages[0].content
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: pressureGenerateCalls(),
        expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
        done: false
      })
    })

    // 演员模式（无 onDirectorStream·directorStream:false）：先装配提调知识唯一源里的性格优先规则，再进入演员纲领与编排器基础提示词。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop('actor'),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview()
    })
    expect(systems.actor).toContain('演员纲领')
    expect(systems.actor).toContain('上下文投影由发送链路准备好喂给你')
    expect(systems.actor.startsWith('### 1.4 角色计划与方向：性格第一')).toBe(true)
    expect(systems.actor.indexOf('角色计划与方向：性格第一')).toBeLessThan(systems.actor.indexOf('【演员纲领'))
    expect(systems.actor.match(/角色计划与方向：性格第一/g)).toHaveLength(1)

    // 导演模式（onDirectorStream 存在=单聊续跑当导演）：不注入演员纲领（导演级用知识库注入，见 U5）。
    await runReplyPlanOrchestratorHarness({
      characterName: '林雪云', compressedContext: '已整合情境', currentUserInput: '今天晚上天气不错',
      callOrchestrator: minimalLoop('director'),
      generatePlanBatch: makeGenerate(), reviewPlanCandidates: makeReview(),
      onScenarioResolved: vi.fn(), onDirectorStream: vi.fn()
    })
    expect(systems.director).not.toContain('演员纲领')
    expect(systems.director.match(/角色计划与方向：性格第一/g)).toHaveLength(1)
  })

  it('R2-2 候选生成真实失败 → 收尾抛精确错误（哪一步+真因），取代笼统「未发起生成」', async () => {
    // 生成工具真实运行失败（execute 抛错=TOOL_RUNTIME_ERROR），全程零候选 → generateCalls=0。
    const generatePlanBatch = vi.fn(async () => { throw new Error('生成模型连接超时') })
    const reviewPlanCandidates = makeReview()
    // providedScenario 直奔生成轮（跳 readScenarioSkill）；每轮只发起 generatePlanBatch（均失败）。
    const callOrchestrator = vi.fn(async () => orchestratorReturn({
      scenario: 'pressure',
      toolCalls: [{ tool: 'generatePlanBatch', strategy: 'steady', strategyLabel: '沉稳', intensities: ['medium'], planPrompt: '沉稳回应', expectation: '返回 1 条候选。' }],
      expressionMix: { action: 40, dialogue: 30, expression: 20, innerState: 10, narration: 0 },
      done: false
    }))

    let err
    try {
      await runReplyPlanOrchestratorHarness({
        characterName: '星依', compressedContext: '已整合情境', currentUserInput: '别逼我。',
        providedScenario: { code: 'pressure', body: '压力情境正文。' },
        callOrchestrator, generatePlanBatch, reviewPlanCandidates
      })
    } catch (e) { err = e }
    // 精确：点名「候选计划生成失败」+ 真因，不再是笼统「编排器必须至少发起一次 generatePlanBatch」。
    expect(String(err?.message)).toContain('候选计划生成失败')
    expect(String(err?.message)).toContain('生成模型连接超时')
    expect(String(err?.message)).not.toContain('必须至少发起一次')
    // 不即时熔断、不误杀：评审本就因零候选不触发（这里确认没被调），但失败不靠 terminate loop。
    expect(reviewPlanCandidates).not.toHaveBeenCalled()
  })

  it('读情境轮可按用户意图修改帷幕，并在计划生成前把变化交给旁白支线', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const updateCurtainScene = vi.fn(async () => ({
      changed: true,
      notice: '【帷幕时间地点已按用户意图静默更新】\n时间：周一 -> 三天后清晨\n地点：旧屋 -> 旅店门口',
      previous: { time: '周一', location: '旧屋' },
      next: { time: '三天后清晨', location: '旅店门口' },
      patch: { virtualTime: '三天后清晨', virtualLocation: '旅店门口' },
      undoPatch: { virtualTime: '周一', virtualLocation: '旧屋' }
    }))
    const onScenarioResolved = vi.fn()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '用户要求快进三天后换到旅店门口。',
          toolCalls: [
            { tool: 'readScenarioSkill', code: 'pressure' },
            {
              tool: 'updateCurtainScene',
              targetTime: '三天后清晨',
              targetLocation: '旅店门口',
              reason: '用户明确要求快进三天后到旅店门口'
            }
          ],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '帷幕修改已完成，再生成候选。',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '完成。'
      })
    })

    await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      updateCurtainScene,
      onScenarioResolved
    })

    expect(updateCurtainScene).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'updateCurtainScene',
      targetTime: '三天后清晨',
      targetLocation: '旅店门口',
      reason: '用户明确要求快进三天后到旅店门口'
    }))
    expect(onScenarioResolved).toHaveBeenCalledTimes(1)
    expect(onScenarioResolved).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'pressure',
      curtainSceneUpdate: expect.objectContaining({ changed: true }),
      sceneChangeNotice: expect.stringContaining('帷幕时间地点已按用户意图静默更新')
    }))
    expect(onScenarioResolved.mock.invocationCallOrder[0]).toBeLessThan(generatePlanBatch.mock.invocationCallOrder[0])
  })

  it('真多轮：先 readScenarioSkill 读情境正文，后续轮次通过结构化 history 获得 toolResult', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    let turn = 0
    const callOrchestrator = vi.fn(async ({ messages }) => {
      turn += 1
      if (turn === 1) {
        expect(messages.map((message) => message.content).join('\n')).not.toContain('[工具结果]')
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境',
          toolCalls: [{
            tool: 'readScenarioSkill',
            code: 'pressure',
            expectation: '拿到压力情境正文，并确认正文包含反应类别和强度要求。'
          }],
          done: false
        })
      }
      expect(messages.map((message) => message.content).join('\n')).not.toContain('[工具结果]')
      // 修复编排器盲打：readScenarioSkill 的正文必须进入下一轮 messages，模型据正文自拟 strategy/planPrompt。
      const historyText = JSON.stringify(messages)
      expect(historyText).toContain('进攻性（aggressive）')
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '据正文展开四类三档。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    // 去融合后：read + generate/review 两轮收束。
    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(generatePlanBatch).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(result.transcript.history)).toContain('进攻性（aggressive）')
    expect(JSON.stringify(result.transcript.history)).not.toContain('[工具结果]')
    // 兼容审计 turns 只保留摘要；结构化正文留在 transcript/history。
    const metaResults = result.turns.flatMap((record) => record.toolResults).filter((item) => item.tool === 'readScenarioSkill')
    expect(metaResults).toHaveLength(1)
    // toolResult 正文保留情境 body（不再被占位句覆盖），模型与审计看到同一份真值。
    expect(metaResults[0].resultText).toContain('进攻性（aggressive）')
    expect(result.orchestration.scenario).toBe('pressure')
    expect(result.orchestration.orchestrationSummary).toBe('据正文展开四类三档。')
  })

  it('getToolManual 元工具按需取回工具手册并写入结构化 history', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    let turn = 0
    const callOrchestrator = vi.fn(async () => {
      turn += 1
      if (turn === 1) {
        return orchestratorReturn({ toolCalls: [{ tool: 'getToolManual', name: 'generatePlanBatch' }], done: false })
      }
      if (turn === 2) {
        return orchestratorReturn({ toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '完成。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    const manualResults = result.turns.flatMap((record) => record.toolResults).filter((item) => item.tool === 'getToolManual')
    expect(manualResults).toHaveLength(1)
    expect(manualResults[0].resultText).toContain('调用格式')
    expect(result.scoredCandidates).toHaveLength(12)
  })

  it('getToolManual 兼容 args.toolName 作为要读取的目标工具名', () => {
    const turn = parseReplyPlanLoopTurn(orchestratorReturn({
      toolCalls: [{ tool: 'getToolManual', args: { toolName: 'generatePlanBatch' } }]
    }))

    expect(turn.toolCalls).toEqual([{ tool: 'getToolManual', name: 'generatePlanBatch' }])
  })

  it('候选批次数量不匹配时不污染候选池，必须先重试再评审', async () => {
    const reviewPlanCandidates = makeReview()
    const generatePlanBatch = vi.fn(async (toolCalls) => {
      const [toolCall] = toolCalls
      return {
        promptLogId: `prompt_${toolCall.strategy}_${generatePlanBatch.mock.calls.length}`,
        candidates: toolCall.intensities
          .slice(0, generatePlanBatch.mock.calls.length === 1 ? 2 : toolCall.intensities.length)
          .map((intensity) => ({
            id: `${toolCall.strategy}_${intensity}`,
            strategy: toolCall.strategy,
            strategyLabel: toolCall.strategyLabel,
            intensity,
            content: `${toolCall.strategyLabel} ${intensity} 计划`
          }))
      }
    })
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }] })
      }
      if (turnIndex === 1) {
        expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [
            {
              tool: 'generatePlanBatch',
              strategy: 'defensive',
              strategyLabel: '防御性',
              intensities: ['low', 'medium', 'high'],
              planPrompt: '生成防御性三档候选。',
              expectation: '返回 3 条候选。'
            },
            { tool: 'reviewPlanCandidates', candidateIds: ['*'] }
          ],
          expressionMix: mix(),
          done: false
        })
      }
      if (turnIndex === 2) {
        expect(activeTools).toEqual(['generatePlanBatch', 'toolsearch'])
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{
            tool: 'generatePlanBatch',
            strategy: 'defensive',
            strategyLabel: '防御性',
            intensities: ['low', 'medium', 'high'],
            planPrompt: '修正后重新生成防御性三档候选。',
            expectation: '返回 3 条候选。'
          }],
          done: false
        })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'reviewPlanCandidates', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        orchestrationSummary: '修复后再评审。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    expect(generatePlanBatch).toHaveBeenCalledTimes(2)
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(['defensive_low', 'defensive_medium', 'defensive_high'])
    expect(result.transcript.turns[1].toolResults).toHaveLength(1)
    expect(result.transcript.turns[1].toolResults[0]).toMatchObject({
      status: 'error',
      error: { type: 'EXPECTATION_MISMATCH' }
    })
  })

  it('未知工具会阻断收束，不执行计划工具', async () => {
    const generatePlanBatch = vi.fn()
    await expect(runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator: vi.fn(async () => orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'shell', command: 'npm run dev' }],
        orchestrationSummary: '错误'
      })),
      generatePlanBatch,
      reviewPlanCandidates: vi.fn()
    })).rejects.toThrow('回复计划编排失败')
    expect(generatePlanBatch).not.toHaveBeenCalled()
  })

  it('已取消的信号在轮次开始前收束 loop', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      signal: controller.signal,
      callOrchestrator: vi.fn(async () => orchestratorReturn({ toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }] })),
      generatePlanBatch: vi.fn(),
      reviewPlanCandidates: vi.fn()
    })).rejects.toThrow('已取消')
  })

  // 批次5 5a 补丁：用户主动停止抛出的取消错误必须 name==='AbortError'，
  // 让全链路 isAbortError / err?.name==='AbortError' 判定识别它，不被当成生成失败弹错误 toast。
  it('取消错误 name 为 AbortError（供全链路 abort 判定识别）', async () => {
    const controller = new AbortController()
    controller.abort()
    let caught = null
    try {
      await runReplyPlanOrchestratorHarness({
        compressedContext: '已整合情境',
        signal: controller.signal,
        callOrchestrator: vi.fn(async () => orchestratorReturn({ toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }] })),
        generatePlanBatch: vi.fn(),
        reviewPlanCandidates: vi.fn()
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught.name).toBe('AbortError')
  })

  it('onStageProgress 按候选生成 → 评审上报 running/done（去融合后评审为终点）', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        done: false
      })
    })
    const events = []
    await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onStageProgress: (event) => events.push(event)
    })

    // 读情境（scenario-routing）先映射到 scenario 步；生成候选才进入 plan 步。
    expect(events).toContainEqual({ step: 'scenario', status: 'running' })
    expect(events).toContainEqual({ step: 'scenario', status: 'done' })
    expect(events).toContainEqual({ step: 'plan', status: 'running' })
    expect(events).toContainEqual({ step: 'plan', status: 'done' })
    expect(events).toContainEqual({ step: 'review', status: 'running' })
    expect(events).toContainEqual({ step: 'review', status: 'done' })
    // 去融合后不再有 merge 步骤
    expect(events).not.toContainEqual({ step: 'merge', status: 'running' })
    expect(events).not.toContainEqual({ step: 'merge', status: 'done' })
    // 完成顺序：scenario done -> plan done -> review done
    const scenarioDone = events.findIndex((e) => e.step === 'scenario' && e.status === 'done')
    const planDone = events.findIndex((e) => e.step === 'plan' && e.status === 'done')
    const reviewDone = events.findIndex((e) => e.step === 'review' && e.status === 'done')
    expect(scenarioDone).toBeLessThan(planDone)
    expect(planDone).toBeLessThan(reviewDone)
  })

  it('候选数量不匹配触发重试时，onStageProgress 上报 plan retry（不暴露技术字段）', async () => {
    const generatePlanBatch = vi.fn(async (toolCalls) => {
      const [toolCall] = toolCalls
      return {
        promptLogId: `prompt_${generatePlanBatch.mock.calls.length}`,
        candidates: toolCall.intensities
          .slice(0, generatePlanBatch.mock.calls.length === 1 ? 2 : toolCall.intensities.length)
          .map((intensity) => ({ id: `${toolCall.strategy}_${intensity}`, strategy: toolCall.strategy, strategyLabel: toolCall.strategyLabel, intensity, content: 'x' }))
      }
    })
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }] })
      if (turnIndex === 1) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [
          { tool: 'generatePlanBatch', strategy: 'defensive', strategyLabel: '防御性', intensities: ['low', 'medium', 'high'], planPrompt: '生成防御性三档候选。' },
          { tool: 'reviewPlanCandidates', candidateIds: ['*'] }
        ], expressionMix: mix(), done: false })
      }
      if (turnIndex === 2) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [
          { tool: 'generatePlanBatch', strategy: 'defensive', strategyLabel: '防御性', intensities: ['low', 'medium', 'high'], planPrompt: '修正后重新生成。' }
        ], done: false })
      }
      return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['*'] }], done: false })
    })
    const events = []
    await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: makeReview(),
      onStageProgress: (event) => events.push(event)
    })

    expect(events).toContainEqual({ step: 'plan', status: 'retry' })
    // 重试后最终仍点亮完成
    expect(events).toContainEqual({ step: 'plan', status: 'done' })
    const planRetry = events.findIndex((e) => e.step === 'plan' && e.status === 'retry')
    const planDone = events.map((e, i) => ({ e, i })).filter(({ e }) => e.step === 'plan' && e.status === 'done').pop().i
    expect(planRetry).toBeLessThan(planDone)
  })

  it('parseReplyPlanLoopTurn 解析每轮 JSON 工具调用与收束标志', () => {
    const turn = parseReplyPlanLoopTurn(orchestratorReturn({
      scenario: 'joy',
      thought: '分享',
      toolCalls: [{ tool: 'readScenarioSkill', code: 'JOY', expectation: '读取喜悦情境正文。' }],
      done: false,
      orchestrationSummary: ''
    }))
    expect(turn.scenario).toBe('joy')
    expect(turn.thought).toBe('分享')
    expect(turn.done).toBe(false)
    expect(turn.toolCalls).toEqual([{ tool: 'readScenarioSkill', code: 'joy', expectation: '读取喜悦情境正文。' }])
  })

  it('parseReplyPlanLoopTurn 解析顶层 expressionMix：合计 100 才保留，否则 null', () => {
    const ok = parseReplyPlanLoopTurn(orchestratorReturn({
      scenario: 'pressure',
      toolCalls: [],
      expressionMix: { action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 }
    }))
    expect(ok.expressionMix).toEqual({ action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 })
    const bad = parseReplyPlanLoopTurn(orchestratorReturn({
      toolCalls: [],
      expressionMix: { action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 10 }
    }))
    expect(bad.expressionMix).toBeNull()
  })

  it('parseReplyPlanLoopTurn 解析顶层 wordCountAdvice：合法区间保留，min>max 或超界返回 null', () => {
    const ok = parseReplyPlanLoopTurn(orchestratorReturn({
      scenario: 'pressure', toolCalls: [], wordCountAdvice: { min: 800, max: 1200 }
    }))
    expect(ok.wordCountAdvice).toEqual({ min: 800, max: 1200 })
    // 低于硬下限 500 → 抬到 500。
    const floored = parseReplyPlanLoopTurn(orchestratorReturn({
      scenario: 'pressure', toolCalls: [], wordCountAdvice: { min: 300, max: 500 }
    }))
    expect(floored.wordCountAdvice).toEqual({ min: 500, max: 500 })
    const bad = parseReplyPlanLoopTurn(orchestratorReturn({
      toolCalls: [], wordCountAdvice: { min: 600, max: 300 }
    }))
    expect(bad.wordCountAdvice).toBeNull()
    const none = parseReplyPlanLoopTurn(orchestratorReturn({ toolCalls: [] }))
    expect(none.wordCountAdvice).toBeNull()
  })

  it('批次2：纯生成轮（仅 generatePlanBatch）整批并发执行，单轮含全部计划工具调用', async () => {
    let active = 0
    let maxActive = 0
    const generatePlanBatch = vi.fn(async (toolCalls) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return {
        promptLogId: `prompt_${toolCalls.map((toolCall) => toolCall.strategy).join('_')}`,
        candidates: toolCalls.flatMap((toolCall) => toolCall.intensities.map((intensity) => ({
          id: `${toolCall.strategy}_${intensity}`,
          strategy: toolCall.strategy,
          strategyLabel: toolCall.strategyLabel,
          intensity,
          content: `${toolCall.strategyLabel} ${intensity} 计划`
        })))
      }
    })
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        // 纯生成轮：只发 4 个 generatePlanBatch（不混 review），命中并发白名单 → 整批并发
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: pressureGenerateCalls(),
          expressionMix: { action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 },
          done: false
        })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'reviewPlanCandidates', 'toolsearch'])
      return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['*'] }], orchestrationSummary: '据正文展开四类三档。', done: false })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: makeReview()
    })

    expect(maxActive).toBeGreaterThan(1) // 4 个 generatePlanBatch 整批并发（串行时恒为 1）
    expect(generatePlanBatch).toHaveBeenCalledTimes(4)
    // 单轮 transcript 含全部 4 个 generatePlanBatch
    const genTurn = result.transcript.turns.find(
      (turn) => turn.toolCalls.filter((call) => call.toolName === 'generatePlanBatch').length === 4
    )
    expect(genTurn).toBeTruthy()
    expect(result.candidates).toHaveLength(12)
    expect(result.expressionMix).toEqual({ action: 50, dialogue: 20, expression: 20, innerState: 10, narration: 0 })
  })

  it('normal_recall 单计划：评审工具不注册、单计划生成成功即收束、expressionMix 豁免为 null', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = vi.fn()
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
      // 单计划：一次 generatePlanBatch、intensities 恰好 1 个、不给 expressionMix、不调用评审。
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{
          tool: 'generatePlanBatch',
          strategy: 'single_reply',
          strategyLabel: '单计划',
          intensities: ['default'],
          planPrompt: '以情境为参考生成一个回复计划。'
        }],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    expect(reviewPlanCandidates).not.toHaveBeenCalled()
    // 生成成功后 hook terminate 收束：read + generate 共两轮，没有评审轮。
    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(1)
    expect(result.scoredCandidates).toHaveLength(1)
    expect(result.topPlans).toHaveLength(1)
    expect(result.topPlans[0].content).toContain('单计划')
    expect(result.expressionMix).toBeNull()
    expect(result.orchestration.expressionMix).toBeUndefined()
    // 普通召回单计划模式同样豁免建议字数：结果为 null、orchestration 不带该字段（最终回复按默认区间兜底）。
    expect(result.wordCountAdvice).toBeNull()
    expect(result.orchestration.wordCountAdvice).toBeUndefined()
    expect(result.diagnostics).toBeUndefined()
    const toolNames = result.transcript.turns.flatMap((turn) => turn.toolCalls).map((call) => call.toolName)
    expect(toolNames).not.toContain('reviewPlanCandidates')
  })

  it('normal_recall 单计划：intensities 多于 1 个被 harness 参数校验拦下，修正为单计划后才执行', async () => {
    const generatePlanBatch = makeGenerate()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        // 违反单计划协议：3 个强度，应被 validateArgs 拦下、不执行回调。
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{
            tool: 'generatePlanBatch',
            strategy: 'aggressive',
            strategyLabel: '进攻性',
            intensities: ['low', 'medium', 'high'],
            planPrompt: '生成三档候选。'
          }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{
          tool: 'generatePlanBatch',
          strategy: 'single_reply',
          strategyLabel: '单计划',
          intensities: ['default'],
          planPrompt: '修正为单计划。'
        }],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: vi.fn()
    })

    // 三强度那次没有进入业务回调：单计划由 harness 预算与参数校验双重限制，不靠提示词。
    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(1)
    expect(result.topPlans).toHaveLength(1)
  })

  it('normal_recall 单计划：系统提示词包含单计划硬性协议（不靠 hook 注入口头要求）', async () => {
    let turn0SystemPrompt = ''
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        turn0SystemPrompt = messages[0].content
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'generatePlanBatch', strategy: 'single_reply', strategyLabel: '单计划', intensities: ['default'], planPrompt: '单计划。' }],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: vi.fn()
    })

    expect(turn0SystemPrompt).toContain('【普通召回单计划硬性协议】')
    expect(turn0SystemPrompt).toContain('恰好包含 1 个强度')
    expect(result.prompt.finalPrompt).toContain('【普通召回单计划硬性协议】')
    // 人格模型不受影响：默认模式系统提示词没有单计划协议块（见下一个用例的反向断言由默认用例覆盖）。
  })

  it('模型可见性：toolResult 与 hook 注入指令必须进入下一轮 messages（修复编排器盲打）', async () => {
    let turn1Messages = []
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      turn1Messages = messages
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'generatePlanBatch', strategy: 'single_reply', strategyLabel: '单计划', intensities: ['default'], planPrompt: '单计划。' }],
        done: false
      })
    })

    await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: vi.fn()
    })

    // 切原生工具调用：整份 messages（含 assistant.tool_calls 与 role:'tool' 结果）序列化校验可见性。
    const serialized = JSON.stringify(turn1Messages)
    const contentJoined = turn1Messages.map((message) => message.content).join('\n')
    // 原生回灌：工具调用进 assistant.tool_calls 的 function.name，工具结果进 role:'tool' 消息正文。
    expect(serialized).toContain('readScenarioSkill')
    expect(serialized).toContain('"role":"tool"')
    // readScenarioSkill 的工具结果（含情境正文）必须对模型可见。
    expect(contentJoined).toContain('进攻性（aggressive）')
    // hook 注入的单计划阶段指令必须对模型可见。
    expect(contentJoined).toContain('只调用一次 generatePlanBatch')
  })

  it('INVALID_ARGUMENT 修复 hook：参数校验失败的原因与修正示例反馈给模型后重试成功', async () => {
    const generatePlanBatch = makeGenerate()
    let repairMessages = []
    const callOrchestrator = vi.fn(async ({ turnIndex, messages }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{ tool: 'generatePlanBatch', strategy: 'aggressive', strategyLabel: '进攻性', intensities: ['low', 'medium', 'high'], planPrompt: '三档候选。' }],
          done: false
        })
      }
      repairMessages = messages
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'generatePlanBatch', strategy: 'single_reply', strategyLabel: '单计划', intensities: ['default'], planPrompt: '修正为单计划。' }],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: vi.fn()
    })

    const serialized = JSON.stringify(repairMessages)
    expect(serialized).toContain('参数校验失败')
    expect(serialized).toContain('恰好 1 个')
    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(1)
  })

  it('INVALID_ARGUMENT 连续 3 轮仍不合法：终止编排并显式失败', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      // 模型始终不修正：每轮都发多强度调用。
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{ tool: 'generatePlanBatch', strategy: 'aggressive', strategyLabel: '进攻性', intensities: ['low', 'medium', 'high'], planPrompt: '三档候选。' }],
        done: false
      })
    })

    await expect(runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: vi.fn()
    })).rejects.toThrow('必须至少发起一次 generatePlanBatch')
    // turn0 读情境 + 3 轮无效参数（第 3 轮触发 terminate），不会跑满 maxTurns。
    expect(callOrchestrator).toHaveBeenCalledTimes(4)
  })

  it('personality_model 评审由系统自动触发：生成齐备后不再多跑编排确认轮（2026-06-12 提速）', async () => {
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      // 生成轮一次性发出全部计划 + 顶层 expressionMix；模型试图直接 done 跳过评审，
      // 评审仍由 harness 自动触发兜底——PM 评审必达，但不再需要模型确认轮。
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: turnIndex === 1 ? pressureGenerateCalls() : [],
        expressionMix: mix(),
        done: true
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates
    })

    // 编排模型只跑读情境 + 生成两轮；评审由系统自动触发恰好一次
    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(reviewPlanCandidates).toHaveBeenCalledTimes(1)
    const reviewToolCall = result.orchestration.toolCalls.find((call) => call.tool === 'reviewPlanCandidates')
    expect(reviewToolCall?.autoTriggered).toBe(true)
    expect(result.topPlans.length).toBeGreaterThan(0)
    expect(result.expressionMix).toBeTruthy()
  })

  it('批次2：生成轮缺少合法 expressionMix 时显式失败', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      // 故意不给 expressionMix
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        done: false
      })
    })

    await expect(runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview()
    })).rejects.toThrow('expressionMix')
  })

  it('批次1d-A：提供 retrievalContext 时取料三件套被激活、可调用，结果进 transcript', async () => {
    const retrievalContext = makeRetrievalContext()
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools, toolCatalog }) => {
      if (turnIndex === 0) {
        // 判情境轮即激活三件套（接在原元工具之后）。
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'recallSemantic', 'searchWorldText', 'fetchUnitDetail', 'toolsearch'])
        expect(toolCatalog.find((tool) => tool.name === 'readScenarioSkill')?.recommended).toBe(true)
        expect(toolCatalog.find((tool) => tool.name === 'searchWorldText')?.recommended).toBe(false)
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境并查不认识的专名',
          toolCalls: [
            { tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到压力情境正文' },
            { tool: 'searchWorldText', query: '鹿角厅', reason: '用户提到不认识的专名', expectation: '命中含该专名的世界素材' }
          ],
          done: false
        })
      }
      // 生成轮：取料工具仍激活，模型可继续按需取料。
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'recallSemantic', 'searchWorldText', 'fetchUnitDetail', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '据正文展开四类三档。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '我们进鹿角厅吧。',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates,
      retrievalContext
    })

    // 文本搜索真正调用了接缝（扫描同一份世界素材）。
    expect(retrievalContext.listSearchableUnits).toHaveBeenCalled()
    // 取料结果作为 toolResult 进入结构化 history，模型据此可写进 planPrompt。
    expect(JSON.stringify(result.transcript.history)).toContain('鹿角厅')
    // 取料不打断正常编排：四类三档候选 + 评审前三仍正常产出。
    expect(result.candidates).toHaveLength(12)
    expect(result.topPlans).toHaveLength(3)
    // 批次3 D4：取料决策装配进 orchestration.retrieval，供编排带「取料」里程碑展示。
    expect(result.orchestration.retrieval).toEqual([
      { tool: 'searchWorldText', query: '鹿角厅', reason: '用户提到不认识的专名', hitCount: expect.any(Number) }
    ])
  })

  it('批次3 D5：每轮模型 thought 经 onThought 实时上抛（实时旁述）', async () => {
    const thoughts = []
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境并查专名',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到压力情境正文' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        thought: '据正文生成候选并评审',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '据正文展开四类三档。',
        done: false
      })
    })
    await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '别逼我。',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      onThought: (event) => thoughts.push(event.thought)
    })
    expect(thoughts).toContain('先读情境并查专名')
    expect(thoughts).toContain('据正文生成候选并评审')
  })

  it('批次3 D4：未取料时 orchestration.retrieval 省略（不出空数组）', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到压力情境正文' }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '据正文展开四类三档。',
        done: false
      })
    })
    const result = await runReplyPlanOrchestratorHarness({
      characterName: '星依',
      compressedContext: '已整合情境',
      currentUserInput: '继续。',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview()
    })
    expect(result.orchestration.retrieval).toBeUndefined()
  })

  it('批次 M2：提供 chatMessageReadContext 时 readChatMessage 被激活、按楼层号读到原文', async () => {
    const chatMessageReadContext = createTidiaoChatMessageReadContext([
      { id: 11, role: 'user', content: '今晚天气不错' },
      { id: 12, role: 'assistant', name: '阿澈', content: '是啊，凉风正好。' },
      { id: 13, role: 'assistant', name: '阿澈', content: '要不要出去走走？' }
    ])
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        // 判情境轮即激活读会话消息工具（接在元工具之后）。
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'readChatMessage', 'toolsearch'])
        return orchestratorReturn({
          scenario: 'pressure',
          thought: '先读情境，再读被指代的那条角色消息原文',
          toolCalls: [
            { tool: 'readScenarioSkill', code: 'pressure', expectation: '拿到压力情境正文' },
            { tool: 'readChatMessage', query: '角色消息2', reason: '用户要改这条', expectation: '拿到角色2原文' }
          ],
          done: false
        })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'readChatMessage', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        orchestrationSummary: '据原文展开四类三档。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      characterName: '阿澈',
      compressedContext: '已整合情境',
      currentUserInput: '角色消息2 改一下。',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview(),
      chatMessageReadContext
    })

    // 读到的是「角色 2」=第二条角色消息原文（旁白/用户不挤占角色序号）。
    expect(JSON.stringify(result.transcript.history)).toContain('要不要出去走走？')
    expect(JSON.stringify(result.transcript.history)).toContain('messageId=13')
    // 读会话消息决策装配进 orchestration.retrieval，供编排带过程条展示。
    expect(result.orchestration.retrieval).toEqual([
      { tool: 'readChatMessage', query: '角色消息2', reason: '用户要改这条', hitCount: 1 }
    ])
    expect(result.topPlans).toHaveLength(3)
  })

  it('批次 M2：缺 chatMessageReadContext 时不激活 readChatMessage（activeTools 与升格前一致）', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        done: false
      })
    })
    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview()
    })
    expect(result.topPlans).toHaveLength(3)
  })

  it('批次1d-A：缺 retrievalContext 时不激活取料工具（activeTools 与升格前一致）', async () => {
    const callOrchestrator = vi.fn(async ({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        expect(activeTools).toEqual(['readScenarioSkill', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'updateCurtainScene', 'getToolManual', 'toolsearch'])
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [...pressureGenerateCalls(), { tool: 'reviewPlanCandidates', candidateIds: ['*'] }],
        expressionMix: mix(),
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch: makeGenerate(),
      reviewPlanCandidates: makeReview()
    })
    expect(result.topPlans).toHaveLength(3)
  })

  it('Bug B：TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL 点破同步语义、禁止只在 thought 说已发出', () => {
    expect(TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL).toContain('同步工具')
    expect(TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL).toContain('原生函数调用')
    expect(TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL).toContain('已发出')
  })

  // ── 合并生成协议（2026-07-08）：一次 generatePlanBatch 带 batches 全部类别 → 接缝只调一次、一次生成全部候选 ──

  function pressureBatchesCall() {
    return {
      tool: 'generatePlanBatch',
      args: {
        batches: pressureGenerateCalls().map(({ tool, ...group }) => group),
        expectation: '一次返回全部类别×强度的候选'
      }
    }
  }

  it('合并生成：batches 一次带 4 类 → 接缝只调 1 次收 4 组，候选 12 条且内部真值仍按每类别一条记录', async () => {
    const generatePlanBatch = makeGenerate()
    const reviewPlanCandidates = makeReview()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [pressureBatchesCall()],
        expressionMix: mix(),
        wordCountAdvice: { min: 800, max: 1200 },
        orchestrationSummary: '压力场景一次生成四类三档。',
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates
    })

    // 接缝只调 1 次，且一次收到全部 4 组（对比旧协议 4 次调用 4 份全量情境）。
    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(generatePlanBatch.mock.calls[0][0]).toHaveLength(4)
    expect(generatePlanBatch.mock.calls[0][0].map((call) => call.strategy)).toEqual(['aggressive', 'defensive', 'freeze', 'avoid'])
    expect(result.candidates).toHaveLength(12)
    // 内部真值：planToolCalls / strategyMatrix 仍是每类别一条记录（审计面板/分镜方向零改动）。
    expect(result.orchestration.strategyMatrix).toHaveLength(4)
    expect(result.orchestration.toolCalls.filter((call) => call.tool === 'generatePlanBatch')).toHaveLength(4)
    expect(result.topPlans).toHaveLength(3)
    expect(result.expressionMix).toEqual(mix())
  })

  it('合并生成：总候选数与全部类别强度总数不一致 → EXPECTATION_MISMATCH 整批重试后成功', async () => {
    const generatePlanBatch = vi.fn(async (toolCalls) => {
      const full = toolCalls.flatMap((toolCall) => toolCall.intensities.map((intensity) => ({
        id: `${toolCall.strategy}_${intensity}`,
        strategy: toolCall.strategy,
        strategyLabel: toolCall.strategyLabel,
        intensity,
        content: `${toolCall.strategyLabel} ${intensity} 计划`
      })))
      return {
        promptLogId: `prompt_${generatePlanBatch.mock.calls.length}`,
        // 第一次少一条（11/12）触发数量硬校验，第二次给全。
        candidates: generatePlanBatch.mock.calls.length === 1 ? full.slice(0, full.length - 1) : full
      }
    })
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [pressureBatchesCall()], expressionMix: mix(), done: false })
      }
      if (turnIndex === 2) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [pressureBatchesCall()], done: false })
      }
      return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['*'] }], done: false })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: makeReview()
    })

    expect(generatePlanBatch).toHaveBeenCalledTimes(2)
    // 第一次数量不齐：不污染候选池（12 条全来自第二次）。
    expect(result.candidates).toHaveLength(12)
    const mismatchTurn = result.transcript.turns.find((turn) =>
      turn.toolResults?.some((toolResult) => toolResult.error?.type === 'EXPECTATION_MISMATCH'))
    expect(mismatchTurn).toBeTruthy()
  })

  it('合并生成：batches 内 strategy 重复 → INVALID_ARGUMENT 拦下不进接缝，修正后成功', async () => {
    const generatePlanBatch = makeGenerate()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        const dupGroups = pressureGenerateCalls().map(({ tool, ...group }) => group)
        dupGroups[1] = { ...dupGroups[0] } // 复制同一类别凑数 → strategy 重复
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{ tool: 'generatePlanBatch', args: { batches: dupGroups } }],
          expressionMix: mix(),
          done: false
        })
      }
      if (turnIndex === 2) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [pressureBatchesCall()], done: false })
      }
      return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['*'] }], done: false })
    })

    const result = await runReplyPlanOrchestratorHarness({
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: makeReview()
    })

    // 重复 strategy 那次被参数校验拦下，接缝只被修正后的那次调用。
    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(12)
    const invalidTurn = result.transcript.turns.find((turn) =>
      turn.toolResults?.some((toolResult) => toolResult.error?.type === 'INVALID_ARGUMENT'))
    expect(invalidTurn).toBeTruthy()
  })

  it('合并生成：normal_recall 单计划模式 batches 恰好 1 项 1 强度可走、2 项被拦', async () => {
    const generatePlanBatch = makeGenerate()
    const callOrchestrator = vi.fn(async ({ turnIndex }) => {
      if (turnIndex === 0) {
        return orchestratorReturn({ scenario: 'pressure', toolCalls: [{ tool: 'readScenarioSkill', code: 'pressure' }], done: false })
      }
      if (turnIndex === 1) {
        // 违反单计划协议：batches 两项 → INVALID_ARGUMENT。
        return orchestratorReturn({
          scenario: 'pressure',
          toolCalls: [{
            tool: 'generatePlanBatch',
            args: {
              batches: [
                { strategy: 'a', strategyLabel: '甲', intensities: ['medium'], planPrompt: '甲计划。' },
                { strategy: 'b', strategyLabel: '乙', intensities: ['medium'], planPrompt: '乙计划。' }
              ]
            }
          }],
          done: false
        })
      }
      return orchestratorReturn({
        scenario: 'pressure',
        toolCalls: [{
          tool: 'generatePlanBatch',
          args: { batches: [{ strategy: 'single_reply', strategyLabel: '单计划', intensities: ['default'], planPrompt: '单计划。' }] }
        }],
        done: false
      })
    })

    const result = await runReplyPlanOrchestratorHarness({
      mode: 'normal_recall',
      compressedContext: '已整合情境',
      callOrchestrator,
      generatePlanBatch,
      reviewPlanCandidates: vi.fn()
    })

    expect(generatePlanBatch).toHaveBeenCalledTimes(1)
    expect(result.candidates).toHaveLength(1)
    expect(result.topPlans).toHaveLength(1)
  })
})
