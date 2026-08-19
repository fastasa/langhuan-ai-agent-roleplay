import { describe, expect, it } from 'vitest'
import {
  buildPersonalityRerankerPairInputs,
  buildReplyPlanOrchestratorPrompt,
  buildReviewPlanCandidatesInput,
  createPressureScenarioBody,
  deriveStrategyMatrixFromToolCalls,
  getReplyPlanToolManual,
  normalizeReplyPlanOrchestratorOutput,
  parseReplyPlanWordCountAdvice,
  DEFAULT_REPLY_PLAN_WORD_COUNT_ADVICE,
  resolveReplyPlanOrchestrationScenarioCode,
  readReplyPlanScenarioBody,
  readReplyPlanScenarioMountedPromptDigest,
  validateReplyPlanOrchestration,
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG,
  DEFAULT_REPLY_PLAN_ORCHESTRATOR_TOOLS
} from '../../../src/app/personalityPlanOrchestrator.ts'

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

describe('personalityPlanOrchestrator', () => {
  it('默认 seed 包含 10 个情境，并让每种特殊状态映射到明确的决策分叉', () => {
    const scenarios = DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG.scenarios
    expect(scenarios.map((scenario) => scenario.code)).toEqual([
      'pressure', 'nsfw', 'anger', 'awkward', 'sadness',
      'fear', 'jealousy', 'guilt', 'excitement', 'fatigue'
    ])

    const pressure = createPressureScenarioBody()
    expect(pressure).toContain('进攻性（aggressive）')
    expect(pressure).toContain('防御性（defensive）')
    expect(pressure).toContain('僵住（freeze）')
    expect(pressure).toContain('逃避（avoid）')
    expect(pressure).toContain('low / medium / high')

    const expectedStrategies = {
      nsfw: ['主动（initiate）', '回应（reciprocate）', '克制（restrain）', '拒绝（refuse）'],
      anger: ['爆发（confront）', '压抑（suppress）', '疏离（withdraw）', '转化（redirect）'],
      awkward: ['掩饰（cover）', '转移（deflect）', '自嘲（self_deprecate）', '僵住（freeze）'],
      sadness: ['倾诉（seek_support）', '独处（withdraw）', '强撑（mask）', '沉浸（grieve）'],
      fear: ['对抗（fight）', '逃离（flight）', '僵住（freeze）', '求援（seek_help）'],
      jealousy: ['争取（compete）', '试探（probe）', '掩饰（hide）', '疏远（withdraw）'],
      guilt: ['补偿（repair）', '坦白（confess）', '逃避（avoid）', '合理化（justify）'],
      excitement: ['分享（share）', '行动（act）', '庆祝（celebrate）', '克制（contain）'],
      fatigue: ['休息（rest）', '强撑（push）', '简化（simplify）', '烦躁（irritable）']
    }
    for (const [code, strategies] of Object.entries(expectedStrategies)) {
      const scenario = scenarios.find((item) => item.code === code)
      expect(scenario).toBeTruthy()
      expect(scenario.body).toContain('只调用一次 generatePlanBatch')
      expect(scenario.body).toContain('low / medium / high')
      expect(scenario.body).toContain('planPrompt 只写给计划模型的第三视角行动计划任务说明')
      for (const strategy of strategies) expect(scenario.body).toContain(strategy)
    }
    expect(scenarios.find((scenario) => scenario.code === 'nsfw').trigger).toContain('仅成年角色')
    expect(scenarios.find((scenario) => scenario.code === 'nsfw').body).toContain('不因进入 NSFW 情境就自动产生欲望或同意')
    expect(scenarios.some((scenario) => scenario.code === 'joy')).toBe(false)
  })

  it('strategyMatrix 由 generatePlanBatch 工具调用派生', () => {
    const matrix = deriveStrategyMatrixFromToolCalls([
      ...pressureGenerateCalls(),
      { tool: 'reviewPlanCandidates', candidateIds: ['*'] }
    ])
    expect(matrix).toHaveLength(4)
    expect(matrix.map((item) => item.strategy)).toEqual(['aggressive', 'defensive', 'freeze', 'avoid'])
    for (const item of matrix) {
      expect(item.intensities).toEqual(['low', 'medium', 'high'])
      expect(item.planPrompt).not.toHaveLength(0)
    }
  })

  it('normalize 忽略模型预声明的 strategyMatrix，改由 toolCalls 派生', () => {
    const orchestration = normalizeReplyPlanOrchestratorOutput(JSON.stringify({
      scenario: 'pressure',
      strategyMatrix: [{ strategy: 'stale', strategyLabel: '过期', intensities: ['x'], planPrompt: '过期' }],
      toolCalls: pressureGenerateCalls(),
      orchestrationSummary: '压力'
    }))
    expect(orchestration.strategyMatrix.map((item) => item.strategy)).toEqual([
      'aggressive', 'defensive', 'freeze', 'avoid'
    ])
  })

  it('按工具调用直接校验白名单、预算和参数边界', () => {
    const issues = validateReplyPlanOrchestration({
      scenario: 'pressure',
      strategyMatrix: [],
      toolCalls: [
        ...pressureGenerateCalls(),
        { tool: 'shell', command: 'npm run dev' },
        { tool: 'reviewPlanCandidates', candidateIds: [] }
      ],
      orchestrationSummary: '压力场景编排测试'
    }, {
      budget: {
        maxGeneratePlanBatchCalls: 3,
        maxReviewPlanCandidatesCalls: 1,
        maxTotalToolCalls: 5,
        maxIntensitiesPerStrategy: 3,
        minCandidatesForReview: 1
      }
    })

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unknown_tool',
        'too_many_generate_calls',
        'review_without_candidates'
      ])
    )
    expect(issues.every((issue) => issue.blocking)).toBe(true)
  })

  it('没有任何 generatePlanBatch 时阻断', () => {
    const issues = validateReplyPlanOrchestration({
      scenario: 'pressure',
      strategyMatrix: [],
      toolCalls: [{ tool: 'reviewPlanCandidates', candidateIds: ['plan-1'] }],
      orchestrationSummary: '缺少计划工具'
    })
    expect(issues.map((issue) => issue.code)).toContain('no_plan_tool_calls')
  })

  it('保持 ReRanker 输入为已整合情境和单个候选计划', () => {
    const reviewInput = buildReviewPlanCandidatesInput({
      compressedContext: '已整合情境',
      candidates: [
        {
          id: 'candidate-1',
          strategy: 'aggressive',
          strategyLabel: '进攻性',
          intensity: 'low',
          content: '角色略微前倾，压住情绪，用更短的动作表达不满。'
        }
      ]
    })
    const rerankerInputs = buildPersonalityRerankerPairInputs(reviewInput)

    expect(Object.keys(rerankerInputs[0]).sort()).toEqual(['candidateId', 'plan', 'situation'])
    expect(rerankerInputs[0]).toMatchObject({
      situation: '已整合情境',
      plan: '角色略微前倾，压住情绪，用更短的动作表达不满。',
      candidateId: 'candidate-1'
    })
    expect(rerankerInputs[0]).not.toHaveProperty('strategy')
    expect(rerankerInputs[0]).not.toHaveProperty('toolCalls')
  })

  it('接受合法压力编排记录（纯工具序列）', () => {
    const generateCalls = pressureGenerateCalls()
    const candidates = generateCalls.flatMap((call) =>
      call.intensities.map((intensity) => ({
        id: `${call.strategy}-${intensity}`,
        strategy: call.strategy,
        strategyLabel: call.strategyLabel,
        intensity,
        content: `${call.strategyLabel} ${intensity} 候选计划`
      }))
    )

    const issues = validateReplyPlanOrchestration({
      scenario: 'pressure',
      strategyMatrix: deriveStrategyMatrixFromToolCalls(generateCalls),
      toolCalls: [
        ...generateCalls,
        { tool: 'reviewPlanCandidates', candidateIds: candidates.map((candidate) => candidate.id) }
      ],
      candidates,
      orchestrationSummary: '压力场景 4x3 编排完成'
    })

    expect(issues).toEqual([])
  })

  it('默认编排提示词只注入情境触发清单（trigger）+ 全部工具 brief（含元工具）', () => {
    const trace = buildReplyPlanOrchestratorPrompt({ compressedContext: '已整合情境' })
    const system = trace.messages[0].content
    expect(system).toContain('LANGHUAN.md 根宪法')
    expect(system).toContain('ReplyPlanOrchestrator')
    expect(system).toContain('可用情境')
    expect(system).toContain('pressure（压力）')
    expect(system).toContain('nsfw（NSFW）')
    expect(system).toContain('excitement（兴奋）')
    expect(system).toContain('fatigue（疲惫）')
    // 批次 2 多轮渐进式：只注 trigger 触发描述，body 正文不再全量注入
    expect(system).toContain('被外部观察时触发')               // 来自 pressure 的 trigger
    expect(system).not.toContain('进攻性（aggressive）')        // body 正文不再注入
    // 结构化 runtime 协议 + 元工具进可用工具清单
    expect(system).toContain('结构化 Agent Runtime')
    expect(system).toContain('toolResult')
    expect(system).toContain('expectation')
    expect(system).toContain('校准')
    expect(system).toContain('不符合预期')
    expect(system).toContain('并同时做两类环境判断')
    expect(system).toContain('本轮时间、地点是否相对上一条可见消息发生变化')
    expect(system).toContain('情境权重规则')
    expect(system).toContain('必须优先依据「当前用户输入」和跳转后的当前场景判定情境')
    expect(system).toContain('不能因为上一条可见消息属于强压力、亲密、危险或其它特殊情境，就沿用旧情境 code')
    expect(system).toContain('若输入里存在场景变化提醒')
    expect(system).toContain('不得继续沿用跳转前的特殊尺度、强冲突或强情绪反应')
    // 批次4 去融合：不再有 synthesizeReviewedPlans；合并生成协议（2026-07-08）：生成轮只发一次 generatePlanBatch（batches 带全部类别）+ 顶层 expressionMix
    expect(system).not.toContain('synthesizeReviewedPlans')
    expect(system).toContain('expressionMix')
    expect(system).toContain('只发起一次 generatePlanBatch')
    expect(system).toContain('batches 内 strategy 必须唯一')
    expect(system).toContain('不能复制同一类别或同一句 planPrompt')
    expect(system).toContain('可用工具')
    expect(system).toContain('- generatePlanBatch：')
    expect(system).not.toContain('- synthesizeReviewedPlans：')
    expect(system).toContain('- readScenarioSkill：')
    expect(system).toContain('- getToolManual：')
  })

  it('编排器输入包含场景变化提醒，供判情境与后续 planPrompt 使用', () => {
    const trace = buildReplyPlanOrchestratorPrompt({
      characterName: '星依',
      compressedContext: '投影事实：用户重新开口。',
      currentUserInput: '你怎么不说话了？',
      sceneChangeNotice: '上一条可见消息环境：时间=周一夜晚，地点=宅邸 / 书房\n本次用户输入开始环境：时间=周四清晨，地点=宅邸 / 庭院'
    })
    const user = trace.messages[1].content
    expect(user).toContain('场景变化提醒：')
    expect(user).toContain('上一条可见消息环境：时间=周一夜晚')
    expect(user).toContain('本次用户输入开始环境：时间=周四清晨')
    expect(user.indexOf('场景变化提醒：')).toBeLessThan(user.indexOf('已整合情境：'))
  })

  it('场景跳转后提示词要求旧强情境降权并优先判断当前输入', () => {
    const trace = buildReplyPlanOrchestratorPrompt({
      characterName: '星依',
      compressedContext: '上一条投影：角色仍处在强冲突情境。当前投影：已进入新地点。',
      currentUserInput: '早上好。',
      sceneChangeNotice: '上一条可见消息环境：时间=深夜，地点=旧宅 / 卧室\n本次用户输入开始环境：时间=三天后清晨，地点=学校 / 教室'
    })
    const finalPrompt = trace.finalPrompt
    expect(finalPrompt).toContain('情境权重规则')
    expect(finalPrompt).toContain('旧投影里的强情绪、强冲突、特殊尺度或上一轮情境只能作为历史背景')
    expect(finalPrompt).toContain('必须优先依据「当前用户输入」和跳转后的当前场景判定情境')
    expect(finalPrompt).toContain('当前用户输入：早上好。')
    expect(finalPrompt).toContain('本次用户输入开始环境：时间=三天后清晨')
  })

  it('自定义编排配置注入新情境触发描述并覆盖默认系统提示词', () => {
    const trace = buildReplyPlanOrchestratorPrompt({ compressedContext: '已整合情境' }, {
      systemPrompt: '自定义编排规则',
      scenarios: [
        {
          code: 'calm',
          label: '平静',
          trigger: '低张力日常',
          body: '平静情境下角色以安抚为主，调用 generatePlanBatch 生成安抚类计划。'
        }
      ],
      tools: []
    })
    const system = trace.messages[0].content
    expect(system).toContain('自定义编排规则')
    expect(system).toContain('calm（平静）')
    expect(system).toContain('低张力日常')      // trigger 注入
    expect(system).not.toContain('安抚')         // body 正文按需读取，不进清单
    expect(system).not.toContain('pressure（压力）')
  })

  it('空系统提示词回退默认规则文本', () => {
    const trace = buildReplyPlanOrchestratorPrompt({ compressedContext: '已整合情境' }, { systemPrompt: '', scenarios: [], tools: [] })
    expect(trace.messages[0].content).toContain('ReplyPlanOrchestrator')
  })

  it('元工具纯函数：按 code 读情境正文、按名取工具手册', () => {
    const scenarios = [
      { code: 'pressure', label: '压力', trigger: '高压', body: '压力正文' }
    ]
    expect(readReplyPlanScenarioBody(scenarios, 'PRESSURE')).toBe('压力正文')
    expect(readReplyPlanScenarioBody(scenarios, 'unknown')).toBe('')
    expect(getReplyPlanToolManual(DEFAULT_REPLY_PLAN_ORCHESTRATOR_TOOLS, 'generatePlanBatch')).toContain('调用格式')
    expect(getReplyPlanToolManual(DEFAULT_REPLY_PLAN_ORCHESTRATOR_TOOLS, 'getToolManual')).toContain('getToolManual')
  })

  it('#7 挂载提示词描述摘要：启用项按序给出标题+描述；无描述回退原文；停用/无挂载返回空', () => {
    const scenarios = [{
      code: 'joy', label: '喜悦', trigger: '开心', body: '喜悦正文',
      mountedPrompts: [
        { id: 'm1', title: '明亮文风', content: '原文A 很长很长', description: '让语气更轻盈明亮', enabled: true, orderIndex: 2.1 },
        { id: 'm2', title: '停用项', content: '不该出现', description: '停用', enabled: false, orderIndex: 2.2 },
        { id: 'm3', title: '无描述项', content: '原文C', enabled: true, orderIndex: 2.3 }
      ]
    }]
    const digest = readReplyPlanScenarioMountedPromptDigest(scenarios, 'JOY')
    expect(digest).toContain('明亮文风：让语气更轻盈明亮')
    expect(digest).toContain('无描述项（未填描述，原文：原文C）')
    expect(digest).not.toContain('停用项')
    // 无挂载提示词的情境返回空串。
    expect(readReplyPlanScenarioMountedPromptDigest([{ code: 'calm', body: 'x' }], 'calm')).toBe('')
  })

  it('从 runtime trace 的 readScenarioSkill 结果解析真实命中情境', () => {
    const code = resolveReplyPlanOrchestrationScenarioCode({
      scenario: '',
      transcript: {
        turns: [{
          toolResults: [{
            toolName: 'readScenarioSkill',
            status: 'success',
            details: { scenarioCode: 'NSFW' }
          }]
        }]
      }
    })

    expect(code).toBe('nsfw')
  })

  it('情境解析优先使用已读取 skill，避免顶层 scenario 漏写或写错导致挂载失效', () => {
    const code = resolveReplyPlanOrchestrationScenarioCode({
      scenario: 'custom',
      turns: [{
        scenario: 'nsfw',
        toolResults: [{
          tool: 'readScenarioSkill',
          resultText: 'NSFW 情境正文',
          isError: false,
          blocked: false
        }]
      }]
    })

    expect(code).toBe('nsfw')
  })

})

describe('parseReplyPlanWordCountAdvice（建议字数区间解析）', () => {
  it('合法 {min,max} 保留（≥500）；snake_case / minWords 变体也识别', () => {
    expect(parseReplyPlanWordCountAdvice({ min: 800, max: 1200 })).toEqual({ min: 800, max: 1200 })
    expect(parseReplyPlanWordCountAdvice({ min_words: 600, max_words: 900 })).toEqual({ min: 600, max: 900 })
    expect(parseReplyPlanWordCountAdvice({ minWords: 700, maxWords: 700 })).toEqual({ min: 700, max: 700 })
  })

  it('低于硬下限 500 一律抬到 500（禁止少于 500 字）', () => {
    expect(parseReplyPlanWordCountAdvice({ min: 300, max: 500 })).toEqual({ min: 500, max: 500 })
    expect(parseReplyPlanWordCountAdvice({ min: 200, max: 400 })).toEqual({ min: 500, max: 500 })
    expect(parseReplyPlanWordCountAdvice({ min: 300, max: 800 })).toEqual({ min: 500, max: 800 })
  })

  it('单值（数字/字符串）按同值上下限展开，并受硬下限约束', () => {
    expect(parseReplyPlanWordCountAdvice(900)).toEqual({ min: 900, max: 900 })
    expect(parseReplyPlanWordCountAdvice('360')).toEqual({ min: 500, max: 500 })
  })

  it('min>max、超界、非整数、空值一律返回 null', () => {
    expect(parseReplyPlanWordCountAdvice({ min: 500, max: 300 })).toBeNull()
    expect(parseReplyPlanWordCountAdvice({ min: 0, max: 500 })).toBeNull()
    expect(parseReplyPlanWordCountAdvice({ min: 300, max: 9000 })).toBeNull()
    expect(parseReplyPlanWordCountAdvice({ min: 300.5, max: 500 })).toBeNull()
    expect(parseReplyPlanWordCountAdvice(null)).toBeNull()
    expect(parseReplyPlanWordCountAdvice({})).toBeNull()
  })

  it('默认区间为 800–1200（约 1000 字）', () => {
    expect(DEFAULT_REPLY_PLAN_WORD_COUNT_ADVICE).toEqual({ min: 800, max: 1200 })
  })
})
