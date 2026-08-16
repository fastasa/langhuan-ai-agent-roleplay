import { describe, expect, it, vi } from 'vitest'
import { createPersonalityTrainingAgentTools } from '../../../src/app/personalityTrainingAgentTools.ts'

function question(id, text) {
  return {
    id,
    question: text,
    dimension: '同理心',
    difficulty: 'hard',
    scenarioType: `旧情境类型-${id}`,
    pressureLevel: Number(id.replace(/\D/g, '')) % 3 === 0 ? 'high' : Number(id.replace(/\D/g, '')) % 2 === 0 ? 'medium' : 'low',
    diversityNote: '旧题既有审计记录',
    candidates: [
      { id: `${id}_a`, label: 'A', text: '先保护无辜者，同时承担后续代价。' },
      { id: `${id}_b`, label: 'B', text: '先保住自己的位置，再寻找补救机会。' },
      { id: `${id}_c`, label: 'C', text: '公开规则与风险，把决定交给所有人。' }
    ],
    presetAnswerId: `${id}_a`
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createFixture(questionCount = 10, options = {}) {
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const item = question(`q${index + 1}`, `第 ${index + 1} 题原文`)
    return options.interleavedDimensions
      ? { ...item, dimension: `维度${(index % 9) + 1}` }
      : item
  })
  const state = {
    questions,
    answers: {
      q1: { candidateId: 'q1_b', reviewState: 'confirmed' },
      q3: { skipped: true, reviewState: 'skipped' }
    },
    snapshot: {
      characterId: 'char_1',
      characterName: '塞西莉亚',
      personalityText: '原本安静而谨慎。',
      activeStepId: 'answer',
      dataset: {
        datasetId: 'dataset_1',
        title: '草稿',
        status: 'questionnaire_ready',
        totalQuestions: questionCount,
        answeredQuestions: questionCount,
        skippedQuestions: 0,
        unansweredQuestions: 0,
        confirmedQuestions: 1,
        presetQuestions: Math.max(0, questionCount - 1)
      },
      calibration: null,
      evaluationSet: null,
      backgroundTasks: [],
      trainingRuns: [],
      modelVersions: []
    },
    personality: '原本安静而谨慎。'
  }
  const provider = {
    readSnapshot: vi.fn(async () => clone(state.snapshot)),
    readQuestions: vi.fn(async () => ({ resourceId: 'dataset_1', questions: clone(state.questions), answers: clone(state.answers) })),
    deleteQuestions: vi.fn(async (_scope, questionIds) => {
      const targetIds = new Set(questionIds)
      state.questions = state.questions.filter((item) => !targetIds.has(item.id))
      state.answers = Object.fromEntries(Object.entries(state.answers).filter(([questionId]) => !targetIds.has(questionId)))
      return { resourceId: 'dataset_1', questions: clone(state.questions), answers: clone(state.answers) }
    }),
    saveQuestions: vi.fn(async (_scope, questions) => {
      state.questions = clone(questions)
      return { resourceId: 'dataset_1', questions: clone(state.questions), answers: clone(state.answers) }
    }),
    saveAnswers: vi.fn(async (_scope, answers) => {
      state.answers = clone(answers)
      return { resourceId: 'dataset_1', questions: clone(state.questions), answers: clone(state.answers) }
    }),
    startQuestionnaireGeneration: vi.fn(async (mode, correctionBrief, questionCount) => ({ taskId: 'task_1', status: 'running', mode, correctionBrief, questionCount })),
    recordCalibrationRoundReview: vi.fn(async (review) => {
      const savedReview = { ...clone(review), reviewedAt: '2026-07-25T00:00:00.000Z' }
      const existingReviews = state.snapshot.calibration?.reviews || []
      state.snapshot.calibration = {
        ...(state.snapshot.calibration || {}),
        reviews: [...existingReviews.filter((item) => item.roundNumber !== savedReview.roundNumber), savedReview]
      }
      return { datasetId: 'dataset_1', roundNumber: review.roundNumber, status: 'recorded' }
    }),
    startQuestionBatch: vi.fn(async (questionCount) => ({ taskId: 'task_next', status: 'running', questionCount })),
    startFrozenEvaluationGeneration: vi.fn(async (questionCount) => ({ taskId: 'task_eval_questions', status: 'running', questionCount })),
    readCharacterPersonality: vi.fn(async () => ({
      characterId: 'char_1',
      characterName: '塞西莉亚',
      personality: state.personality
    })),
    saveCharacterPersonality: vi.fn(async (personality) => {
      state.personality = personality
      return { characterId: 'char_1', characterName: '塞西莉亚', personality }
    }),
    precheckTraining: vi.fn(async () => ({ ok: true, canTrain: true, failureStage: '', failureReason: '', checks: [] })),
    startTraining: vi.fn(async () => ({ runId: 'run_1', characterId: 'char_1', backend: 'local', status: 'running' })),
    listTrainingRuns: vi.fn(async () => []),
    getTrainingRun: vi.fn(async (runId) => ({ runId, characterId: 'char_1', backend: 'local', status: 'running' })),
    getTrainingRunLog: vi.fn(async (runId) => ({ runId, log: '日志' })),
    cancelTraining: vi.fn(async (runId) => ({ runId, characterId: 'char_1', backend: 'local', status: 'cancelled' })),
    startEvaluation: vi.fn(async () => ({ taskId: 'eval_1', status: 'running' })),
    installModelVersion: vi.fn(),
    deleteModelVersion: vi.fn(),
    onChanged: vi.fn()
  }
  return { state, provider }
}

function findTool(tools, name) {
  const tool = tools.find((item) => item.name === name)
  if (!tool) throw new Error(`missing tool ${name}`)
  return tool
}

async function execute(tool, args) {
  return tool.execute({ callId: 'call_1', name: tool.name, args }, { turnIndex: 1 })
}

describe('鉴心工具面', () => {
  it('完整注册读题、改题、答案、出题、训练、评测与版本工具', () => {
    const { provider } = createFixture()
    const names = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }).map((tool) => tool.name)
    expect(names).toEqual([
      'readPersonalityTrainingWorkspace',
      'readPersonalityTrainingQuestions',
      'readFullPersonalityQuestionHistory',
      'deletePersonalityTrainingQuestions',
      'patchPersonalityTrainingQuestions',
      'setPersonalityTrainingAnswers',
      'rewriteCharacterPersonality',
      'completePersonalityCalibrationRound',
      'startPersonalityQuestionBatch',
      'generatePersonalityFrozenEvaluation',
      'startPersonalityQuestionnaireGeneration',
      'managePersonalityTrainingRun',
      'startPersonalityEvaluation',
      'managePersonalityModelVersion'
    ])
  })

  it('派遣设问时把上一份失败诊断的定向纠错传给后台任务', async () => {
    const { provider } = createFixture()
    const confirmWrite = vi.fn(async () => true)
    const tool = findTool(
      createPersonalityTrainingAgentTools({ provider, confirmWrite }),
      'startPersonalityQuestionnaireGeneration'
    )
    const result = await execute(tool, {
      mode: 'resume',
      correctionBrief: 'q076：删除第二次变化，只保留一个决策点。'
    })
    expect(result.status).toBe('success')
    expect(result.content).toContain('已派遣设问')
    expect(result.content).toContain('【设问后台回报】')
    expect(provider.startQuestionnaireGeneration).toHaveBeenCalledWith(
      'resume',
      'q076：删除第二次变化，只保留一个决策点。',
      undefined
    )
  })

  it('新问卷可在一次设问派遣中明确生成 100 题', async () => {
    const { provider } = createFixture()
    const tool = findTool(
      createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }),
      'startPersonalityQuestionnaireGeneration'
    )

    const result = await execute(tool, { mode: 'create_new', questionCount: 100 })

    expect(result.status).toBe('success')
    expect(result.content).toContain('100 道')
    expect(provider.startQuestionnaireGeneration).toHaveBeenCalledWith('create_new', '', 100)
  })

  it('分页读题同时返回人工答案、预设代选和有效答案来源', async () => {
    const { provider } = createFixture()
    const tool = findTool(createPersonalityTrainingAgentTools({ provider }), 'readPersonalityTrainingQuestions')
    const result = await execute(tool, { scope: 'training', answerState: 'all', start: 1, limit: 10 })

    expect(result.status).toBe('success')
    expect(result.details.returnedQuestions).toEqual([
      expect.objectContaining({ questionNumber: 1, questionId: 'q1', presetAnswerId: 'q1_a', answerState: 'confirmed', effectiveAnswerId: 'q1_b', effectiveAnswerSource: 'confirmed' }),
      expect.objectContaining({ questionNumber: 2, questionId: 'q2', answerState: 'preset', effectiveAnswerId: 'q2_a', effectiveAnswerSource: 'preset', userAnswer: null }),
      expect.objectContaining({ questionNumber: 3, questionId: 'q3', answerState: 'preset', effectiveAnswerId: 'q3_a', effectiveAnswerSource: 'preset' }),
      ...Array(7).fill(expect.objectContaining({ answerState: 'preset' }))
    ])
  })

  it('全量历史工具一次返回所有训练题，并建立改题查重门', async () => {
    const { provider } = createFixture()
    const tools = createPersonalityTrainingAgentTools({ provider })
    const tool = findTool(tools, 'readFullPersonalityQuestionHistory')
    const result = await execute(tool, {})

    expect(result.status).toBe('success')
    expect(result.details.totalQuestions).toBe(10)
    expect(result.content).toContain('训练题 #1 q1')
    expect(result.content).toContain('训练题 #10 q10')
    expect(result.content).toContain('情境类型=')
    expect(result.content).toContain('压力程度=')
    expect(result.content).not.toContain('先保护无辜者')
  })

  it('可一次删除全部没有人工确认的题，并保留人工题与人工答案', async () => {
    const { state, provider } = createFixture()
    const confirmWrite = vi.fn(async () => true)
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite }), 'deletePersonalityTrainingQuestions')
    const result = await execute(tool, {
      scope: 'training',
      selectionMode: 'all_without_human_answer'
    })

    expect(result.status).toBe('success')
    expect(result.details.deleted).toHaveLength(9)
    expect(result.details.deletedConfirmedCount).toBe(0)
    expect(result.details.remainingQuestionCount).toBe(1)
    expect(state.questions.map((item) => item.id)).toEqual(['q1'])
    expect(state.answers).toEqual({ q1: { candidateId: 'q1_b', reviewState: 'confirmed' } })
    expect(provider.deleteQuestions).toHaveBeenCalledWith('training', [
      'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'
    ])
  })

  it('人工已确认题也允许删除，只在确认摘要中明确警示', async () => {
    const { state, provider } = createFixture()
    const confirmWrite = vi.fn(async () => true)
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite }), 'deletePersonalityTrainingQuestions')
    const result = await execute(tool, {
      scope: 'training',
      selectionMode: 'specified',
      questionNumbers: [1]
    })

    expect(result.status).toBe('success')
    expect(result.details.deletedConfirmedCount).toBe(1)
    expect(state.questions.some((item) => item.id === 'q1')).toBe(false)
    expect(state.answers.q1).toBeUndefined()
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('仍允许删除')
  })

  it('拒绝 2-9 题的模糊批次，只接受精确 1 题、同维度 10 题或完整 20 题轮次', async () => {
    const { provider } = createFixture()
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'patchPersonalityTrainingQuestions')
    const result = await execute(tool, {
      scope: 'training',
      changes: [{ questionId: 'q2', question: '新题 2' }, { questionId: 'q3', question: '新题 3' }]
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('连续完整 20 题训练轮次')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
  })

  it('改写题干前没有全量读取历史时拒绝写入', async () => {
    const { provider } = createFixture()
    const tool = findTool(
      createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }),
      'patchPersonalityTrainingQuestions'
    )
    const result = await execute(tool, {
      scope: 'training',
      changes: [{
        questionId: 'q2',
        question: '朋友私下请求你临时帮忙。',
        scenarioType: '私下求助',
        pressureLevel: 'low',
        diversityNote: '相对 q2 改为私下求助'
      }]
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('readFullPersonalityQuestionHistory')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
  })

  it('全量读取后仍拒绝同维度重复的情境类型与压力程度组合', async () => {
    const { provider } = createFixture()
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true })
    await execute(findTool(tools, 'readFullPersonalityQuestionHistory'), {})
    const result = await execute(findTool(tools, 'patchPersonalityTrainingQuestions'), {
      scope: 'training',
      changes: [{
        questionId: 'q2',
        question: '面对另一项轻度请求，你准备怎样回应？',
        scenarioType: '旧情境类型-q1',
        pressureLevel: 'low',
        diversityNote: '声称与 q1 不同'
      }]
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('重复使用 scenarioType')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
  })

  it('同一维度完整 10 题可整批修改并保持候选 ID/三选项结构', async () => {
    const { state, provider } = createFixture()
    const confirmWrite = vi.fn(async () => true)
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite })
    await execute(findTool(tools, 'readFullPersonalityQuestionHistory'), {})
    const tool = findTool(tools, 'patchPersonalityTrainingQuestions')
    const result = await execute(tool, {
      scope: 'training',
      includeAnswered: true,
      changes: state.questions.map((item, index) => ({
        questionId: item.id,
        question: `第 ${index + 1} 个不同的非日常情境`,
        scenarioType: `新情境类型-${index + 1}`,
        pressureLevel: ['low', 'medium', 'high'][index % 3],
        diversityNote: `相对 ${item.id} 改为不同事件机制`,
        ...(item.id === 'q2' ? {
          candidatePatches: [{ candidateId: 'q2_a', text: '先救人，并接受自己会失去晋升机会。' }],
          presetAnswerId: 'q2_a'
        } : {})
      }))
    })

    expect(result.status).toBe('success')
    expect(result.details.changed).toHaveLength(10)
    expect(state.questions[0].question).toBe('第 1 个不同的非日常情境')
    expect(state.questions[1].question).toBe('第 2 个不同的非日常情境')
    expect(state.questions[1].candidates.map((candidate) => candidate.id)).toEqual(['q2_a', 'q2_b', 'q2_c'])
    expect(state.questions[1].candidates).toHaveLength(3)
    expect(state.questions[1].presetAnswerId).toBe('q2_a')
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(provider.saveQuestions).toHaveBeenCalledTimes(1)
  })

  it('第四轮第 61—80 题可跨维度原子重写，保留人工答案且全量历史不倾倒候选', async () => {
    const { state, provider } = createFixture(80, { interleavedDimensions: true })
    state.answers = {
      q61: { candidateId: 'q61_b', reviewState: 'confirmed' },
      q62: { candidateId: 'q62_a', reviewState: 'confirmed' },
      q63: { candidateId: 'q63_c', reviewState: 'confirmed' },
      q64: { candidateId: 'q64_b', reviewState: 'confirmed' }
    }
    state.snapshot.dataset.confirmedQuestions = 4
    state.snapshot.dataset.presetQuestions = 76
    const stems = [
      '临时停电时，邻居敲门借手电。',
      '同事误把你的功劳报给了自己。',
      '聚会中一位新人始终没人搭话。',
      '已排好的休息日突然收到加班请求。',
      '朋友想借走你珍藏但易损的物品。',
      '团队投票结果与你的判断相反。',
      '公开展示前发现队友漏掉关键步骤。',
      '陌生城市里你的手机只剩少量电量。',
      '家人当众替你承诺了一件事。',
      '共享物品被别人损坏却无人承认。',
      '刚学的新游戏要求立刻选择高风险路线。',
      '亲近的人隐瞒了与你有关的小事。',
      '会议上的规则明显对新人更苛刻。',
      '你意外获得一笔可自由支配的奖金。',
      '朋友争吵后深夜来问你能否陪聊。',
      '约会对象想公开尚未说好的关系。',
      '竞赛中你发现对手误解了一条规则。',
      '临近截止时同伴请求你接手他的部分。',
      '群聊里有人用玩笑贬低你的爱好。',
      '旅行途中同行者突然想改去陌生路线。'
    ]
    const confirmWrite = vi.fn(async () => true)
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite })
    const history = await execute(findTool(tools, 'readFullPersonalityQuestionHistory'), {})

    expect(history.status).toBe('success')
    expect(history.details.totalQuestions).toBe(80)
    expect(history.content).toContain('训练题 #80 q80')
    expect(history.content).not.toContain('先保护无辜者')
    expect(history.content.length).toBeLessThan(30000)

    const result = await execute(findTool(tools, 'patchPersonalityTrainingQuestions'), {
      scope: 'training',
      includeAnswered: true,
      changes: state.questions.slice(60, 80).map((item, index) => ({
        questionId: item.id,
        question: stems[index],
        scenarioType: `第四轮原创机制-${index + 1}`,
        pressureLevel: ['low', 'medium', 'high'][index % 3],
        diversityNote: `相对旧第 ${index + 61} 题更换事件机制`,
        candidatePatches: [
          { candidateId: `${item.id}_a`, text: '先按直觉立即表态，并承担相应结果。' },
          { candidateId: `${item.id}_b`, text: '先问清关键信息，再给出明确选择。' },
          { candidateId: `${item.id}_c`, text: '暂不介入，保留自己的原有安排。' }
        ],
        presetAnswerId: `${item.id}_b`
      }))
    })

    expect(result.status).toBe('success')
    expect(result.details.changed).toHaveLength(20)
    expect(provider.saveQuestions).toHaveBeenCalledTimes(1)
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(state.questions[59].question).toBe('第 60 题原文')
    expect(state.questions[60]).toMatchObject({
      question: stems[0],
      scenarioType: '第四轮原创机制-1',
      pressureLevel: 'low',
      presetAnswerId: 'q61_b'
    })
    expect(state.questions[79]).toMatchObject({
      question: stems[19],
      scenarioType: '第四轮原创机制-20',
      pressureLevel: 'medium',
      presetAnswerId: 'q80_b'
    })
    expect(state.answers).toEqual({
      q61: { candidateId: 'q61_b', reviewState: 'confirmed' },
      q62: { candidateId: 'q62_a', reviewState: 'confirmed' },
      q63: { candidateId: 'q63_c', reviewState: 'confirmed' },
      q64: { candidateId: 'q64_b', reviewState: 'confirmed' }
    })
  })

  it('20 题批次若不对应一个完整轮次则拒绝写入', async () => {
    const { state, provider } = createFixture(40, { interleavedDimensions: true })
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true })
    await execute(findTool(tools, 'readFullPersonalityQuestionHistory'), {})
    const result = await execute(findTool(tools, 'patchPersonalityTrainingQuestions'), {
      scope: 'training',
      changes: state.questions.slice(1, 21).map((item, index) => ({
        questionId: item.id,
        question: `错位轮次新题 ${index + 1}`,
        scenarioType: `错位机制-${index + 1}`,
        pressureLevel: ['low', 'medium', 'high'][index % 3],
        diversityNote: `相对旧题更换为错位机制 ${index + 1}`
      }))
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('必须恰好覆盖一个连续完整校准轮次')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
  })

  it('确认期间目标题被其它操作修改时整批拒绝，不用旧快照覆盖', async () => {
    const { state, provider } = createFixture()
    const confirmWrite = vi.fn(async () => {
      state.questions[1].question = '用户刚刚手工改过的新版本'
      return true
    })
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite })
    await execute(findTool(tools, 'readFullPersonalityQuestionHistory'), {})
    const tool = findTool(tools, 'patchPersonalityTrainingQuestions')
    const result = await execute(tool, {
      scope: 'training',
      changes: [{
        questionId: 'q2',
        question: 'Agent 的旧方案',
        scenarioType: '私下求助',
        pressureLevel: 'medium',
        diversityNote: '相对 q2 改为私下求助'
      }]
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('全量题目历史已经变化')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
    expect(state.questions[1].question).toBe('用户刚刚手工改过的新版本')
  })

  it('出题任务运行中硬阻断题目 patch，避免 checkpoint 覆盖人工修改', async () => {
    const { state, provider } = createFixture()
    state.snapshot.backgroundTasks = [{
      key: 'task-key', taskId: 'task_1', kind: 'questionnaire_generation', characterId: 'char_1', resourceId: 'dataset_1',
      status: 'running', progress: { label: '训练题已落库 20/90' }, error: '', startedAt: '2026-07-23', finishedAt: ''
    }]
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'patchPersonalityTrainingQuestions')
    const result = await execute(tool, { scope: 'training', changes: [{ questionId: 'q2', question: '新题' }] })

    expect(result.status).toBe('error')
    expect(result.content).toContain('checkpoint 可能覆盖修改')
    expect(provider.saveQuestions).not.toHaveBeenCalled()
  })

  it('正式答案与预设答案分离：答案工具按明确指令写 candidateId 并保留其它题答案', async () => {
    const { state, provider } = createFixture()
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'setPersonalityTrainingAnswers')
    const result = await execute(tool, { scope: 'training', answers: [{ questionId: 'q2', candidateId: 'q2_c' }] })

    expect(result.status).toBe('success')
    expect(state.answers.q1).toEqual({ candidateId: 'q1_b', reviewState: 'confirmed' })
    expect(state.answers.q2).toEqual({ candidateId: 'q2_c', reviewState: 'confirmed', skipped: false })
    expect(state.questions[1].presetAnswerId).toBe('q2_a')
  })

  it('只用人工确认题作证据，整体替换并重读核验角色 personality 字段', async () => {
    const { state, provider } = createFixture()
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'rewriteCharacterPersonality')
    const result = await execute(tool, {
      personality: '她安静务实，不热衷社交；对在意的人更有耐心，也愿意直接处理重要误会。',
      evidenceQuestionIds: ['q1'],
      reason: '人工选择显示她的疏离与关照会随关系远近自然变化'
    })

    expect(result.status).toBe('success')
    expect(state.personality).toContain('安静务实')
    expect(provider.saveCharacterPersonality).toHaveBeenCalledTimes(1)
    expect(provider.readCharacterPersonality).toHaveBeenCalledTimes(3)
  })

  it('拒绝把只有预设代选的题当作性格重写证据', async () => {
    const { provider } = createFixture()
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'rewriteCharacterPersonality')
    const result = await execute(tool, {
      personality: '新的完整性格。',
      evidenceQuestionIds: ['q2'],
      reason: '测试'
    })

    expect(result.status).toBe('error')
    expect(result.content).toContain('尚未人工确认')
    expect(provider.saveCharacterPersonality).not.toHaveBeenCalled()
  })

  it('20 题全部人工确认后只记录正式复盘，不隐式启动下一轮', async () => {
    const { state, provider } = createFixture()
    state.questions = Array.from({ length: 20 }, (_, index) => question(`q${index + 1}`, `第 ${index + 1} 题原文`))
    state.answers = Object.fromEntries(state.questions.map((item, index) => [
      item.id,
      { candidateId: index < 18 ? `${item.id}_a` : `${item.id}_b`, reviewState: 'confirmed' }
    ]))
    state.snapshot.dataset.totalQuestions = 20
    state.snapshot.dataset.confirmedQuestions = 20
    state.snapshot.dataset.presetQuestions = 0
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'completePersonalityCalibrationRound')
    const result = await execute(tool, {
      assessment: 'richer',
      summary: '关系远近让她表现不同，但核心仍然稳定。',
      stableTraits: ['安静务实'],
      contextualTraits: ['对亲近者更有耐心'],
      possibleContradictions: []
    })

    expect(result.status).toBe('success')
    expect(result.content).toContain('18/20')
    expect(result.content).toContain('本次没有生成或追加题目')
    expect(provider.recordCalibrationRoundReview).toHaveBeenCalledWith(expect.objectContaining({
      roundNumber: 1,
      presetHitCount: 18,
      confirmedCount: 20
    }))
    expect(provider.startQuestionBatch).not.toHaveBeenCalled()
  })

  it('正式复盘后只有用户明确调用独立工具才启动新批次，未指定时推荐 20 题', async () => {
    const { state, provider } = createFixture()
    state.questions = Array.from({ length: 20 }, (_, index) => question(`q${index + 1}`, `第 ${index + 1} 题原文`))
    state.answers = Object.fromEntries(state.questions.map((item) => [
      item.id,
      { candidateId: `${item.id}_a`, reviewState: 'confirmed' }
    ]))
    state.snapshot.dataset.totalQuestions = 20
    state.snapshot.dataset.confirmedQuestions = 20
    state.snapshot.dataset.presetQuestions = 0
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true })
    const reviewResult = await execute(findTool(tools, 'completePersonalityCalibrationRound'), {
      assessment: 'stable',
      summary: '本轮人格理解已经稳定。',
      stableTraits: ['安静务实'],
      contextualTraits: [],
      possibleContradictions: []
    })
    expect(reviewResult.status).toBe('success')

    const result = await execute(findTool(tools, 'startPersonalityQuestionBatch'), {})

    expect(result.status).toBe('success')
    expect(result.content).toContain('共 20 道')
    expect(provider.startQuestionBatch).toHaveBeenCalledTimes(1)
    expect(provider.startQuestionBatch).toHaveBeenCalledWith(20)
  })

  it('第八轮 0/20 且从未复盘时，用户可在一个设问任务里追加 50 题', async () => {
    const { state, provider } = createFixture(160, { interleavedDimensions: true })
    state.answers = {}
    state.snapshot.dataset.totalQuestions = 160
    state.snapshot.dataset.confirmedQuestions = 0
    state.snapshot.dataset.presetQuestions = 160
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true })

    const result = await execute(findTool(tools, 'startPersonalityQuestionBatch'), { questionCount: 50 })

    expect(result.status).toBe('success')
    expect(result.content).toContain('共 50 道')
    expect(result.details.targetQuestionCount).toBe(210)
    expect(provider.startQuestionBatch).toHaveBeenCalledTimes(1)
    expect(provider.startQuestionBatch).toHaveBeenCalledWith(50)
  })

  it('当前题数不在 20 题边界时仍可一次追加 100 题', async () => {
    const { state, provider } = createFixture(50, { interleavedDimensions: true })
    state.snapshot.dataset.totalQuestions = 50
    const tools = createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true })

    const result = await execute(findTool(tools, 'startPersonalityQuestionBatch'), { questionCount: 100 })

    expect(result.status).toBe('success')
    expect(result.content).toContain('第 51-150 题')
    expect(provider.startQuestionBatch).toHaveBeenCalledWith(100)
  })

  it('所有轮次确认并复盘后，用户可单独启动冻结评测题生成', async () => {
    const { state, provider } = createFixture()
    state.questions = Array.from({ length: 20 }, (_, index) => question(`q${index + 1}`, `第 ${index + 1} 题原文`))
    state.answers = Object.fromEntries(state.questions.map((item) => [
      item.id,
      { candidateId: `${item.id}_a`, reviewState: 'confirmed' }
    ]))
    state.snapshot.dataset.totalQuestions = 20
    state.snapshot.calibration = {
      roundSize: 20,
      rounds: [],
      reviews: [{
        roundNumber: 1,
        questionStart: 1,
        questionEnd: 20,
        confirmedCount: 20,
        presetHitCount: 20,
        presetHitRate: 1,
        assessment: 'stable',
        summary: '人格已经稳定。',
        stableTraits: ['安静务实'],
        contextualTraits: [],
        possibleContradictions: [],
        reviewedAt: '2026-07-24T00:00:00.000Z'
      }],
      nextReviewRoundNumber: 2,
      canReviewNextRound: false,
      rollingPresetHitRate: null,
      targetPresetHitRate: 0.9,
      targetWindowRounds: 2,
      canSuggestStop: false
    }
    const tool = findTool(createPersonalityTrainingAgentTools({ provider, confirmWrite: async () => true }), 'generatePersonalityFrozenEvaluation')
    const result = await execute(tool, { reason: '用户认为角色理解已经稳定' })

    expect(result.status).toBe('success')
    expect(provider.startFrozenEvaluationGeneration).toHaveBeenCalledWith(24)
  })
})
