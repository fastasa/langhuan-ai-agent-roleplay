/**
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 用真实形态的 orchestration payload mock 仓库读取
const fetchMock = vi.fn()
vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  fetchChatPersonalityModelObservationsBySessionId: (...args) => fetchMock(...args)
}))

// mock 全局编排配置仓库：提示词树展示并可编辑这份全局配置
const saveOrchestratorConfigMock = vi.fn(async (config) => config)
vi.mock('../../../src/repositories/orchestratorConfigRepository.ts', () => ({
  fetchOrchestratorConfig: async () => ({
    systemPrompt: '编排规则',
    scenarios: [
      {
        code: 'pressure',
        label: '压力',
        trigger: '高压',
        body: '压力情境正文：进攻/防御/僵住/逃避各分低中高三档。',
        mountedPrompts: [
          { id: 'style_1', title: '边界文风', content: '短句更冷一点。', enabled: true, orderIndex: 2.1 }
        ]
      },
      {
        code: 'nsfw',
        label: 'NSFW',
        trigger: '成人向创作场景',
        body: 'NSFW 情境正文：按情境选择表达强度。',
        mountedPrompts: [
          { id: 'style_nsfw', title: 'NSFW文风', content: '使用指定文风。', enabled: true, orderIndex: 2.1 }
        ]
      }
    ],
    tools: [
      { name: 'generatePlanBatch', kind: 'plan', brief: '按反应类别生成候选', manual: '调用格式：{"tool":"generatePlanBatch"...}' },
      { name: 'readScenarioSkill', kind: 'meta', brief: '按 code 读情境正文', manual: '调用格式：{"tool":"readScenarioSkill","code":"..."}' }
    ]
  }),
  saveOrchestratorConfig: (...args) => saveOrchestratorConfigMock(...args),
  loadEffectiveOrchestratorConfig: async () => ({ systemPrompt: '', scenarios: [] }),
  invalidateOrchestratorConfigCache: () => {}
}))

import PersonalityModelOrchestrationAuditPanel from '../../../src/components/app/chat/PersonalityModelOrchestrationAuditPanel.vue'

function buildStrategy(strategy, label) {
  return { strategy, strategyLabel: label, intensities: ['low', 'medium', 'high'], planPrompt: `${label} 计划提示词` }
}

function buildGenerateCall(strategy, label, promptLogId) {
  return { tool: 'generatePlanBatch', strategy, strategyLabel: label, intensities: ['low', 'medium', 'high'], planPrompt: `${label} 计划提示词`, promptLogId }
}

// 模拟真实链路写入 trace 的 orchestration（candidates 运行时带 score；topPlans 为同级字段）
function buildOrchestrationPayload() {
  const cats = [
    ['aggressive', '进攻性'],
    ['defensive', '防御性'],
    ['freeze', '僵住'],
    ['avoid', '逃避']
  ]
  const candidates = []
  for (const [strategy, label] of cats) {
    for (const [int, score] of [['low', 0.5], ['medium', strategy === 'defensive' ? 0.88 : 0.6], ['high', 0.55]]) {
      candidates.push({ id: `${strategy}_${int}`, strategy, strategyLabel: label, intensity: int, content: `${label}·${int} 计划正文`, score })
    }
  }
  return {
    speakerName: '张元英',
    messageId: 33,
    rerankerDiagnostics: { candidateCount: 12, distinctEncodedInputCount: 12, uniqueScoreCount: 12 },
    candidatePlans: candidates,
    topPlans: [
      { id: 'defensive_medium', score: 0.88, content: '防御性中档：先稳住边界。' },
      { id: 'aggressive_medium', score: 0.81, content: '进攻性中档：给出一句明确回击。' },
      { id: 'freeze_low', score: 0.7, content: '僵住低档：保留一瞬停顿。' }
    ],
    // 批次4 去融合：表达占比唯一真值来自编排器生成轮
    expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 },
    orchestration: {
      scenario: 'pressure',
      strategyMatrix: cats.map(([s, l]) => buildStrategy(s, l)),
      toolCalls: [
        ...cats.map(([s, l], i) => buildGenerateCall(s, l, `plog_${i}`)),
        { tool: 'reviewPlanCandidates', candidateIds: ['*'], promptLogId: 'plog_review' }
      ],
      candidates,
      orchestrationSummary: '情境判定为 pressure，四类反应各生成低/中/高三档共 12 条，评审后选定防御性·中。',
      promptLogId: 'plog_orchestrator',
      reviewPromptLogId: 'plog_review',
      narrationSubagent: {
        called: true,
        messageIds: [500],
        readSkills: [
          { profileId: 'environment', profileName: '环境描写', triggerDescription: '时间地点明显变化，需要承接空间氛围时读取。', source: 'read_tool' },
          { profileId: 'appearance', profileName: '人物描写', triggerDescription: '人物可见姿态和状态需要被看见时读取。', source: 'read_tool' }
        ],
        confirmedCalls: [
          { profileIds: ['environment'], profileNames: ['环境描写'], narrationKind: 'environment', reason: '时间跳转明显。' }
        ],
        terminalReason: 'done'
      },
      expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 },
      transcript: {
        kind: 'agentTranscript',
        agentName: 'ReplyPlanAgent',
        runtimeVersion: 'reply-plan-agent-runtime-v1',
        initialActiveTools: ['readScenarioSkill', 'getToolManual'],
        budget: { maxTurns: 8, maxToolCalls: 20, usedTurns: 3, usedToolCalls: 7 },
        terminalReason: 'terminated-by-hook',
        turns: [
          {
            turnIndex: 0,
            stage: 'scenario-routing',
            activeTools: ['readScenarioSkill', 'getToolManual'],
            modelMessage: { kind: 'modelMessage', role: 'assistant', content: '{}', parsed: { thought: '本轮情境判断：用户输入是高压、带有性强迫追踪味的亲密行为，角色处于被要求、被侵入后的边界回撤细节也要完整显示' } },
            toolCalls: [{ kind: 'toolCall', callId: 'c1', toolName: 'readScenarioSkill', stage: 'scenario-routing', args: { code: 'pressure' }, expectation: '读取情境正文', requestedAtTurn: 0 }],
            toolResults: [{ kind: 'toolResult', callId: 'c1', toolName: 'readScenarioSkill', stage: 'scenario-routing', status: 'success', content: '情境 skill 正文已读取', details: { scenarioCode: 'pressure' } }],
            hookEvents: [{ kind: 'hookEvent', id: 'reply-plan-scenario-read', lifecycle: 'afterToolResult', stage: 'scenario-routing', toolName: 'readScenarioSkill', callId: 'c1', priority: 10, effects: ['setActiveTools'], summary: '情境已读取，允许生成计划。' }],
            nextTurnPatches: [{ kind: 'nextTurnPatch', id: 'p1', sourceHookId: 'reply-plan-scenario-read', stage: 'scenario-routing', injectMessages: [], activeTools: ['generatePlanBatch', 'getToolManual'] }]
          },
          {
            turnIndex: 1,
            stage: 'plan-review',
            activeTools: ['generatePlanBatch', 'getToolManual'],
            modelMessage: { kind: 'modelMessage', role: 'assistant', content: '{}', parsed: { thought: '据正文展开四类三档并评审' } },
            toolCalls: [],
            toolResults: [
              { kind: 'toolResult', callId: 'c2', toolName: 'generatePlanBatch', stage: 'plan-generation', status: 'success', content: '生成候选', details: {} },
              { kind: 'toolResult', callId: 'c3', toolName: 'reviewPlanCandidates', stage: 'plan-review', status: 'success', content: '评审完成', details: { topPlanIds: ['defensive_medium'] } }
            ],
            hookEvents: [{ kind: 'hookEvent', id: 'reply-plan-review-next', lifecycle: 'afterToolResult', stage: 'plan-review', toolName: 'reviewPlanCandidates', callId: 'c3', priority: 10, effects: ['setActiveTools', 'injectMessage'], summary: '评审完成，下一轮进入融合。' }],
            nextTurnPatches: [{ kind: 'nextTurnPatch', id: 'p2', sourceHookId: 'reply-plan-review-next', stage: 'plan-review', injectMessages: [], activeTools: ['synthesizeReviewedPlans'] }]
          },
          {
            turnIndex: 2,
            stage: 'plan-synthesis',
            activeTools: ['synthesizeReviewedPlans'],
            modelMessage: { kind: 'modelMessage', role: 'assistant', content: '{}', parsed: { thought: '融合前三计划' } },
            toolCalls: [],
            toolResults: [{ kind: 'toolResult', callId: 'c4', toolName: 'synthesizeReviewedPlans', stage: 'plan-synthesis', status: 'success', content: '融合完成', details: { finalReplyGuide: '回复时动作描写略多。' } }],
            hookEvents: [{ kind: 'hookEvent', id: 'reply-plan-synthesis-finish', lifecycle: 'afterToolResult', stage: 'plan-synthesis', toolName: 'synthesizeReviewedPlans', callId: 'c4', priority: 10, effects: ['patchToolResult', 'terminate'], summary: '融合完成，准备最终回复。' }],
            nextTurnPatches: [{ kind: 'nextTurnPatch', id: 'p3', sourceHookId: 'reply-plan-synthesis-finish', stage: 'plan-synthesis', injectMessages: [], terminate: true }]
          }
        ]
      },
      turns: [
        { turnIndex: 0, thought: '先读情境正文', scenario: 'pressure', toolResults: [
          { tool: 'readScenarioSkill', resultText: '压力情境正文：进攻/防御/僵住/逃避各分低中高三档。', isError: false, blocked: false }
        ] },
        { turnIndex: 1, thought: '据正文展开四类三档并评审', scenario: 'pressure', toolResults: [
          { tool: 'generatePlanBatch', resultText: '进攻性 已生成 3 条候选', isError: false, blocked: false },
          { tool: 'reviewPlanCandidates', resultText: '已评审 12 条候选计划', isError: false, blocked: false }
        ] }
      ]
    }
  }
}

function buildPage() {
  return {
    sessionId: 'session_1',
    projections: [],
    visibility: [],
    attempts: [],
    traces: [{ id: 'trace_1', createdAt: '2026-05-16T13:05:24.000Z', messageId: 33, payload: buildOrchestrationPayload() }]
  }
}

describe('PersonalityModelOrchestrationAuditPanel', () => {
  afterEach(() => {
    fetchMock.mockReset()
    document.body.innerHTML = ''
  })

  it('选中对应消息时按真实 orchestration 字段渲染分区与多轮轨迹', async () => {
    fetchMock.mockResolvedValue(buildPage())
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: 33 }
    })
    await flushPromises()

    const html = wrapper.html()
    // scenario 与中文名
    expect(html).toContain('pressure')
    expect(html).toContain('压力')
    // 编排器输出：真实工具调用映射（4 次 generatePlanBatch）
    expect(html).toContain('generatePlanBatch')
    expect(html).toContain('×4')
    // 候选计划总数（12 条）
    expect(html).toContain('12')
    // 编排器输出：已读取提示词行 + 情境说明 note（取自全局配置 trigger）
    expect(html).toContain('已读取提示词')
    expect(html).toContain('LANGHUAN.md')
    expect(html).toContain('高压')
    expect(html).toContain('旁白读取')
    expect(html).toContain('环境描写')
    expect(html).toContain('人物描写')
    // 最终选中计划以 ★ 标出（星格热区已删，候选证据改由「最终选中 + 多轮轨迹」表达）
    expect(html).toContain('★')
    // 批次4 去融合：前三计划 + 表达占比（不再有融合结果/主次计划/最终回复指导）
    expect(html).toContain('前三计划 + 占比')
    expect(html).not.toContain('融合结果')
    expect(html).toContain('defensive_medium')
    expect(html).toContain('aggressive_medium')
    expect(html).toContain('freeze_low')
    expect(html).toContain('动作')
    expect(html).toContain('40%')
    // 运行时轨迹分区：紧凑展示阶段、工具短标签、hook 与下一轮门控
    expect(html).toContain('运行时轨迹')
    expect(html).toContain('判情境')
    expect(html).toContain('被侵入后的边界回撤细节也要完整显示')
    expect(html).toContain('读情境 ok')
    expect(html).toContain('hook 门控')
    expect(html).toContain('下轮 生成/手册')
    expect(html).toContain('hook 收束')
    // 可调用工具白名单（默认展开分区）
    expect(html).toContain('reviewPlanCandidates')
  })

  it('重复候选 id 的历史 trace 只把 topPlans 三条标记为送入回复模型', async () => {
    const page = buildPage()
    const duplicateCandidates = []
    for (const batch of [1, 2, 3]) {
      for (const [intensity, score] of [['low', 0.2 + batch / 100], ['medium', 0.5 + batch / 100], ['high', 0.8 + batch / 100]]) {
        duplicateCandidates.push({
          id: `obedient_${intensity}`,
          strategy: 'obedient',
          strategyLabel: '亲密顺从',
          intensity,
          content: `第${batch}批 ${intensity} 计划正文`,
          score
        })
      }
    }
    page.traces[0].payload.candidatePlans = duplicateCandidates
    page.traces[0].payload.topPlans = duplicateCandidates.slice(6, 9)
    page.traces[0].payload.orchestration.strategyMatrix = [
      { strategy: 'obedient', strategyLabel: '亲密顺从', intensities: ['low', 'medium', 'high'], planPrompt: '生成亲密顺从三档候选。' },
      { strategy: 'obedient', strategyLabel: '亲密顺从', intensities: ['low', 'medium', 'high'], planPrompt: '生成亲密顺从三档候选。' },
      { strategy: 'obedient', strategyLabel: '亲密顺从', intensities: ['low', 'medium', 'high'], planPrompt: '生成亲密顺从三档候选。' }
    ]
    page.traces[0].payload.orchestration.toolCalls = [
      ...page.traces[0].payload.orchestration.strategyMatrix.map((item) => ({ tool: 'generatePlanBatch', ...item })),
      { tool: 'reviewPlanCandidates', candidateIds: ['*'], promptLogId: 'plog_review' }
    ]
    page.traces[0].payload.orchestration.candidates = duplicateCandidates

    fetchMock.mockResolvedValue(page)
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: 33 }
    })
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('3 个计划送入回复模型')
    expect(html).not.toContain('9 个计划送入回复模型')
  })

  it('选中没有编排记录的消息时进入 none 态', async () => {
    fetchMock.mockResolvedValue(buildPage())
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: 999 }
    })
    await flushPromises()

    expect(wrapper.html()).toContain('无编排记录')
  })

  it('未选中消息时默认展示 session 级编排记录列表', async () => {
    fetchMock.mockResolvedValue(buildPage())
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: null }
    })
    await flushPromises()

    const html = wrapper.html()
    expect(html).toContain('本会话编排记录')
    expect(html).toContain('张元英')
  })

  it('展开提示词树展示本地可编辑配置并以圆点标注本轮已读', async () => {
    fetchMock.mockResolvedValue(buildPage())
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: 33 }
    })
    await flushPromises()

    // 默认收起，找到「提示词树」分区头并展开（展开后内嵌只读共享组件异步自加载配置）
    const promptHeader = wrapper.findAll('.sec-h2').find((header) => header.text().includes('提示词树'))
    expect(promptHeader).toBeTruthy()
    await promptHeader.trigger('click')
    await flushPromises()

    const html = wrapper.html()
    // 只读树结构：LANGHUAN.md / 总提示词 / 情境skill 文件夹 / 单文件情境 / 挂载提示词 / 可调用工具
    expect(html).toContain('LANGHUAN.md')
    expect(html).toContain('回复编排器总提示词')
    expect(html).toContain('情境skill')
    expect(html).toContain('边界文风')
    expect(html).toContain('可调用工具')
    // 本轮命中情境（pressure）以 olive 圆点（.tn-read）标注
    expect(wrapper.find('.tn-read').exists()).toBe(true)
    // 单机工作区直接开放编辑入口，不再依赖角色或后台。
    expect(html).toContain('新建情境skill')
    expect(wrapper.find('.tn-act').exists()).toBe(true)
  })

  it('提示词树的小绿点能从 runtime 已读取情境解析，不依赖顶层 scenario 字段', async () => {
    const page = buildPage()
    page.traces[0].payload.orchestration.scenario = ''
    page.traces[0].payload.orchestration.transcript.turns[0].toolResults[0].details.scenarioCode = 'nsfw'
    page.traces[0].payload.orchestration.turns[0].scenario = 'nsfw'
    fetchMock.mockResolvedValue(page)
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: 33 }
    })
    await flushPromises()

    const promptHeader = wrapper.findAll('.sec-h2').find((header) => header.text().includes('提示词树'))
    await promptHeader.trigger('click')
    await flushPromises()

    const scenarioNode = wrapper.findAll('.tn').find((node) => node.text().includes('nsfw') && node.text().includes('NSFW'))
    expect(scenarioNode).toBeTruthy()
    expect(scenarioNode.find('.tn-read').exists()).toBe(true)
  })

  // 编辑能力由本地提示词树编辑器承载；审计侧栏只验证只读视图（见上一条）。

  // 批次I·编排入口：runtimeOrchestration 入参 → 不依赖 messageId/持久化 trace 直接渲染（loop 期编排可见）。
  it('runtimeOrchestration 运行态入参：无持久化 trace 也按编排字段直接渲染', async () => {
    fetchMock.mockResolvedValue({ sessionId: 'session_1', projections: [], visibility: [], attempts: [], traces: [] })
    const wrapper = mount(PersonalityModelOrchestrationAuditPanel, {
      props: { sessionId: 'session_1', selectedMessageId: null, runtimeOrchestration: buildOrchestrationPayload() }
    })
    await flushPromises()

    const html = wrapper.html()
    // 即便 traces 为空（loop 期消息未落库），运行态编排仍直渲：scenario / 候选 / 前三计划 / 占比
    expect(html).toContain('pressure')
    expect(html).toContain('压力')
    expect(html).toContain('前三计划 + 占比')
    expect(html).toContain('defensive_medium')
    expect(html).toContain('40%')
  })
})
