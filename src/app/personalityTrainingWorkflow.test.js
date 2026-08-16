import { describe, expect, it, vi } from 'vitest'
import {
  buildCompletedPersonalityCalibrationReviewPromptSnapshot,
  buildPersonalityQuestionBatchPromptSnapshot,
  countResolvedQuestionAnswers,
  findPersonalityQuestionDesignViolations,
  findPersonalityQuestionDiversityViolations,
  parsePersonalityQuestionnaireOutput,
  reconcilePersonalityCalibrationPromptAfterQuestionDeletion,
  resolvePersonalityQuestionAnswer,
  resolvePersonalityQuestionDimension,
  runPersonalityQuestionnaireGeneration,
  summarizePersonalityAdaptiveCalibration
} from './personalityTrainingWorkflow.ts'

function question(id) {
  return {
    id,
    question: `情境 ${id}`,
    dimension: '稳定特质',
    difficulty: 'standard',
    scenarioType: `情境类型-${id}`,
    pressureLevel: 'low',
    diversityNote: '与历史题在事件机制上不同',
    candidates: [
      { id: 'A', text: `计划 ${id}-A`, label: 'A' },
      { id: 'B', text: `计划 ${id}-B`, label: 'B' },
      { id: 'C', text: `计划 ${id}-C`, label: 'C' }
    ],
    presetAnswerId: 'A',
    sourceHints: []
  }
}

function batchQuestions(prefix, count) {
  return Array.from({ length: count }, (_, index) => question(`${prefix}${index + 1}`))
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('personalityTrainingWorkflow questionnaire generation', () => {
  it('spreads every 20 training questions across all nine dimensions before two rotating probes', () => {
    const dimensionPlan = Array.from({ length: 9 }, (_, index) => ({
      id: `d${index + 1}`,
      name: `维度${index + 1}`,
      targetTrainingCount: index < 2 ? 3 : 2,
      targetEvaluationCount: 0
    }))
    const dimensions = Array.from({ length: 20 }, (_, index) => (
      resolvePersonalityQuestionDimension('', dimensionPlan, index + 1, 'training')
    ))
    const counts = Object.fromEntries(dimensionPlan.map((item) => [
      item.name,
      dimensions.filter((name) => name === item.name).length
    ]))
    expect(counts).toEqual({
      维度1: 3,
      维度2: 3,
      维度3: 2,
      维度4: 2,
      维度5: 2,
      维度6: 2,
      维度7: 2,
      维度8: 2,
      维度9: 2
    })
    expect(dimensions.slice(0, 9)).toEqual(dimensionPlan.map((item) => item.name))
  })

  it('counts only human-confirmed choices and suggests stopping after two reviewed rounds reach 90 percent', () => {
    const questions = Array.from({ length: 40 }, (_, index) => question(`q${index + 1}`))
    const answers = Object.fromEntries(questions.map((item, index) => [
      item.id,
      { candidateId: index < 36 ? 'A' : 'B', reviewState: 'confirmed' }
    ]))
    const review = (roundNumber) => ({
      roundNumber,
      questionStart: (roundNumber - 1) * 20 + 1,
      questionEnd: roundNumber * 20,
      confirmedCount: 20,
      presetHitCount: roundNumber === 1 ? 20 : 16,
      presetHitRate: roundNumber === 1 ? 1 : 0.8,
      assessment: 'stable',
      summary: '本轮理解稳定。',
      stableTraits: [],
      contextualTraits: [],
      possibleContradictions: [],
      reviewedAt: '2026-07-24T00:00:00.000Z'
    })
    const summary = summarizePersonalityAdaptiveCalibration({
      questionGroups: questions,
      answers,
      promptSnapshot: { adaptiveCalibrationReviews: [review(1), review(2)] }
    })

    expect(summary.rollingPresetHitRate).toBe(0.9)
    expect(summary.canSuggestStop).toBe(true)

    const withoutOneConfirmation = summarizePersonalityAdaptiveCalibration({
      questionGroups: questions,
      answers: { ...answers, q40: undefined },
      promptSnapshot: { adaptiveCalibrationReviews: [review(1)] }
    })
    expect(withoutOneConfirmation.rounds[1].complete).toBe(false)
    expect(withoutOneConfirmation.rounds[1].confirmedCount).toBe(19)
  })

  it('persists a calibration review without changing the question target, then advances by an arbitrary batch size', () => {
    const dataset = {
      promptSnapshot: { targetTrainingGroupCount: 40, adaptiveCalibrationReviews: [] },
      questionGroups: Array.from({ length: 40 }, (_, index) => question(`q${index + 1}`))
    }
    const review = {
      roundNumber: 1,
      questionStart: 1,
      questionEnd: 20,
      confirmedCount: 20,
      presetHitCount: 18,
      presetHitRate: 0.9,
      assessment: 'stable',
      summary: '第一轮正式复盘。',
      stableTraits: ['谨慎'],
      contextualTraits: [],
      possibleContradictions: []
    }

    const reviewedSnapshot = buildCompletedPersonalityCalibrationReviewPromptSnapshot({ dataset, review })
    expect(reviewedSnapshot.targetTrainingGroupCount).toBe(40)
    expect(reviewedSnapshot.adaptiveCalibrationReviews).toHaveLength(1)

    const nextSnapshot = buildPersonalityQuestionBatchPromptSnapshot({
      dataset: { ...dataset, promptSnapshot: reviewedSnapshot },
      questionCount: 50
    })
    expect(nextSnapshot.targetTrainingGroupCount).toBe(90)
    expect(nextSnapshot.adaptiveCalibrationReviews).toHaveLength(1)
  })

  it('deleting from a later round preserves earlier reviews and clears stale generation checkpoints', () => {
    const review = (roundNumber) => ({
      roundNumber,
      questionStart: (roundNumber - 1) * 20 + 1,
      questionEnd: roundNumber * 20,
      confirmedCount: 20,
      presetHitCount: 18,
      presetHitRate: 0.9,
      assessment: 'stable',
      summary: `第 ${roundNumber} 轮稳定`,
      stableTraits: [],
      contextualTraits: [],
      possibleContradictions: [],
      reviewedAt: '2026-07-24T00:00:00.000Z'
    })
    const result = reconcilePersonalityCalibrationPromptAfterQuestionDeletion({
      promptSnapshot: {
        targetTrainingGroupCount: 90,
        adaptiveCalibrationReviews: [review(1), review(2), review(3)],
        adaptiveCalibrationContext: '旧上下文',
        questionnaireGenerationCheckpoint: { status: 'completed', pendingTrainingBatches: [[question('q41')]] }
      },
      firstDeletedQuestionNumber: 41,
      remainingQuestionCount: 40
    })

    expect(result.targetTrainingGroupCount).toBe(40)
    expect(result.adaptiveCalibrationReviews.map((item) => item.roundNumber)).toEqual([1, 2])
    expect(result.adaptiveCalibrationContext).toContain('第 2 轮稳定')
    expect(result.adaptiveCalibrationContext).not.toContain('第 3 轮稳定')
    expect(result.questionnaireGenerationCheckpoint).toBeNull()
  })

  it('normalizes candidate plan fields into text and requires three candidates', () => {
    const parsed = parsePersonalityQuestionnaireOutput(JSON.stringify({
      questionGroups: [{
        id: 'q001',
        question: '用户临时取消约定，只留下一句简短解释。',
        dimension: '关系边界',
        difficulty: 'standard',
        candidates: [
          { id: 'A', plan: '先确认是否有急事，再说清自己被影响。' },
          { id: 'B', plan: '立刻装作完全不在意。' },
          { id: 'C', plan: '连续追问并要求补偿。' }
        ]
      }]
    }))

    expect(parsed.questionGroups[0].candidates).toHaveLength(3)
    expect(parsed.questionGroups[0].candidates[0].text).toContain('先确认')
  })

  it('marks malformed half-json as likely truncated', () => {
    expect(() => parsePersonalityQuestionnaireOutput('{"questionGroups":[{"id":"q001","question":"x","candidates":['))
      .toThrow('可能被截断')
  })

  it('requires every newly generated question to provide a valid preset answer', () => {
    const invalid = question('q001')
    delete invalid.presetAnswerId
    expect(() => parsePersonalityQuestionnaireOutput(JSON.stringify({ questionGroups: [invalid] }), {
      expectedQuestionGroups: 1,
      requirePresetAnswer: true
    })).toThrow('缺少有效题目')

    const parsed = parsePersonalityQuestionnaireOutput(JSON.stringify({
      questionGroups: [{ ...question('q002'), preset_answer_id: 'B', presetAnswerId: undefined }]
    }), { expectedQuestionGroups: 1, requirePresetAnswer: true })
    expect(parsed.questionGroups[0].presetAnswerId).toBe('B')
  })

  it('maps dimension ids and blank dimensions back to planned names', () => {
    const dimensionPlan = [
      { id: 'd01', name: '稳定特质', targetTrainingCount: 1, targetEvaluationCount: 1 },
      { id: 'd02', name: '关系边界', targetTrainingCount: 1, targetEvaluationCount: 1 }
    ]
    const parsed = parsePersonalityQuestionnaireOutput(JSON.stringify({
      questionGroups: [
        { ...question('raw-1'), dimension: 'd01' },
        { ...question('raw-2'), dimension: '' }
      ]
    }), {
      dimensionPlan,
      expectedQuestionGroups: 2,
      startIndex: 1
    })

    expect(parsed.questionGroups.map((group) => group.dimension)).toEqual(['稳定特质', '关系边界'])
    expect(parsed.questionGroups[0]).toMatchObject({
      scenarioType: '情境类型-raw-1',
      pressureLevel: 'low',
      diversityNote: '与历史题在事件机制上不同'
    })
    expect(resolvePersonalityQuestionDimension('d02', dimensionPlan, 2, 'training')).toBe('关系边界')
  })

  it('generates questionnaire in small batches and merges the result', async () => {
    const callAI = vi.fn(async (messages) => {
      const prompt = messages[0].content
      if (prompt.includes('只做维度规划')) {
        return JSON.stringify({
          dimensionPlan: [
            { id: 'd01', name: '稳定特质', targetTrainingCount: 12, targetEvaluationCount: 5, focus: '稳定反应' }
          ]
        })
      }
      if (prompt.includes('只生成训练题')) {
        const count = prompt.includes('共 10 道') ? 10 : 2
        return JSON.stringify({ questionGroups: batchQuestions(prompt.includes('第 11 到第 12 题') ? 'q11-' : 'q', count) })
      }
      if (prompt.includes('只生成冻结评测题')) {
        return JSON.stringify({ evaluationQuestions: batchQuestions('eval', 5) })
      }
      throw new Error('unexpected prompt')
    })

    const progress = []
    const checkpoints = []
    const result = await runPersonalityQuestionnaireGeneration({
      finalPrompt: '角色资料:\n- 角色名: 星依',
      promptSnapshot: {
        basePrompt: '角色资料:\n- 角色名: 星依',
        targetTrainingGroupCount: 12,
        targetEvaluationQuestionCount: 5
      },
      characterName: '星依',
      agentConfig: {},
      callAI,
      onProgress: (item) => progress.push(item),
      onCheckpoint: (draft, checkpoint) => checkpoints.push({
        training: draft.questionGroups.length,
        evaluation: draft.evaluationQuestions.length,
        checkpoint
      })
    })

    expect(callAI).toHaveBeenCalledTimes(3)
    expect(result.questionGroups).toHaveLength(12)
    expect(result.questionGroups.map((group) => group.id)).toEqual([
      'q001', 'q002', 'q003', 'q004', 'q005', 'q006',
      'q007', 'q008', 'q009', 'q010', 'q011', 'q012'
    ])
    expect(result.evaluationQuestions).toHaveLength(5)
    expect(progress.at(-1)).toMatchObject({ label: '评测题已落库 5/5' })
    expect(checkpoints.map((item) => [item.training, item.evaluation])).toEqual([
      [0, 0],
      [10, 0],
      [12, 0],
      [12, 5]
    ])
    expect(callAI.mock.calls.find(([messages]) => messages[0].content.includes('只生成训练题'))[0][0].content)
      .toContain('共情关照与个人边界')
    expect(callAI.mock.calls.find(([messages]) => messages[0].content.includes('只生成训练题'))[0][0].content)
      .toContain('【人格问卷情境设计协议 v8】')
    expect(callAI.mock.calls.find(([messages]) => messages[0].content.includes('只生成训练题'))[0][0].content)
      .toContain('presetAnswerId')
    const firstTrainingPrompt = callAI.mock.calls.find(([messages]) => messages[0].content.includes('只生成训练题'))[0][0].content
    expect(firstTrainingPrompt).toContain('scenarioType')
    expect(firstTrainingPrompt).toContain('pressureLevel')
    expect(firstTrainingPrompt).toContain('diversityNote')
    expect(firstTrainingPrompt).toContain('pressureLevel=high')
    expect(firstTrainingPrompt.match(/complexity=simple/g)).toHaveLength(9)
    expect(firstTrainingPrompt.match(/complexity=complex/g)).toHaveLength(1)
  })

  it('resumes from persisted batches without regenerating completed questions', async () => {
    const existing = batchQuestions('old', 10).map((item, index) => ({ ...item, id: `q${String(index + 1).padStart(3, '0')}` }))
    const callAI = vi.fn(async (messages) => {
      const prompt = messages[0].content
      if (prompt.includes('只生成训练题')) return JSON.stringify({ questionGroups: batchQuestions('new', 2) })
      if (prompt.includes('只生成冻结评测题')) return JSON.stringify({ evaluationQuestions: batchQuestions('eval', 1) })
      throw new Error('dimension plan should be resumed')
    })
    const result = await runPersonalityQuestionnaireGeneration({
      finalPrompt: '角色资料',
      promptSnapshot: { targetTrainingGroupCount: 12, targetEvaluationQuestionCount: 1 },
      characterName: '星依',
      agentConfig: {},
      callAI,
      resumeDraft: {
        dimensionPlan: [{ id: 'd01', name: '稳定特质', targetTrainingCount: 12, targetEvaluationCount: 1 }],
        questionGroups: existing,
        evaluationQuestions: []
      }
    })

    expect(callAI).toHaveBeenCalledTimes(2)
    expect(callAI.mock.calls[0][0][0].content).toContain('第 11 到第 12 题')
    expect(callAI.mock.calls[0][0][0].content).toContain('情境=情境 old1')
    expect(callAI.mock.calls[0][0][0].content).not.toContain('候选：A=计划 old1-A')
    expect(result.questionGroups.slice(0, 10)).toEqual(existing)
    expect(result.questionGroups.map((item) => item.id).at(-1)).toBe('q012')
  })

  it('starts independent ten-question batches concurrently and checkpoints out-of-order returns', async () => {
    const batches = new Map([
      [1, deferred()],
      [11, deferred()],
      [21, deferred()]
    ])
    const checkpoints = []
    const callAI = vi.fn((messages) => {
      const prompt = messages[0].content
      const match = prompt.match(/请生成第 (\d+) 到第/)
      const start = Number(match?.[1] || 0)
      const batch = batches.get(start)
      if (!batch) throw new Error(`unexpected batch ${start}`)
      return batch.promise
    })

    const resultPromise = runPersonalityQuestionnaireGeneration({
      finalPrompt: '角色资料',
      promptSnapshot: {
        basePrompt: '角色资料',
        targetTrainingGroupCount: 30,
        targetEvaluationQuestionCount: 0
      },
      characterName: '星依',
      agentConfig: {},
      callAI,
      onCheckpoint: (draft, checkpoint) => checkpoints.push({
        training: draft.questionGroups.length,
        pendingStarts: (checkpoint.pendingTrainingBatches || []).map((batch) => batch[0]?.id)
      })
    })

    await vi.waitFor(() => expect(callAI).toHaveBeenCalledTimes(3))
    batches.get(21).resolve(JSON.stringify({ questionGroups: batchQuestions('late-', 10) }))
    await vi.waitFor(() => {
      expect(checkpoints.some((item) => item.training === 0 && item.pendingStarts.includes('q021'))).toBe(true)
    })

    batches.get(1).resolve(JSON.stringify({ questionGroups: batchQuestions('first-', 10) }))
    await vi.waitFor(() => expect(checkpoints.some((item) => item.training === 10)).toBe(true))
    batches.get(11).resolve(JSON.stringify({ questionGroups: batchQuestions('middle-', 10) }))

    const result = await resultPromise
    expect(result.questionGroups).toHaveLength(30)
    expect(result.questionGroups[0].id).toBe('q001')
    expect(result.questionGroups.at(-1).id).toBe('q030')
    expect(checkpoints.filter((item) => item.training > 0).map((item) => item.training)).toEqual([10, 20, 30])
  })

  it('restores an out-of-order pending batch without calling the model again', async () => {
    const existing = batchQuestions('saved-', 10).map((item, index) => ({
      ...item,
      id: `q${String(index + 1).padStart(3, '0')}`
    }))
    const pending = batchQuestions('pending-', 10).map((item, index) => ({
      ...item,
      id: `q${String(index + 11).padStart(3, '0')}`
    }))
    const callAI = vi.fn()

    const result = await runPersonalityQuestionnaireGeneration({
      finalPrompt: '角色资料',
      promptSnapshot: {
        basePrompt: '角色资料',
        targetTrainingGroupCount: 20,
        targetEvaluationQuestionCount: 0
      },
      characterName: '星依',
      agentConfig: {},
      callAI,
      resumeDraft: {
        dimensionPlan: [{ id: 'd01', name: '稳定特质', targetTrainingCount: 20, targetEvaluationCount: 0 }],
        questionGroups: existing,
        evaluationQuestions: [],
        pendingTrainingBatches: [pending]
      }
    })

    expect(callAI).not.toHaveBeenCalled()
    expect(result.questionGroups).toHaveLength(20)
    expect(result.questionGroups.at(-1).id).toBe('q020')
  })

  it('stops unfinished provider calls at the five-minute deadline and keeps the resume message explicit', async () => {
    vi.useFakeTimers()
    try {
      const callAI = vi.fn((_messages, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      }))
      const resultPromise = runPersonalityQuestionnaireGeneration({
        finalPrompt: '角色资料',
        promptSnapshot: {
          basePrompt: '角色资料',
          targetTrainingGroupCount: 10,
          targetEvaluationQuestionCount: 0
        },
        characterName: '星依',
        agentConfig: {},
        callAI
      })
      const rejection = expect(resultPromise).rejects.toThrow('超过 5 分钟')

      await vi.advanceTimersByTimeAsync(0)
      expect(callAI).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps projection-grounded chat samples factual and does not create evaluation batches for a zero target', async () => {
    const prompts = []
    const callAI = vi.fn(async (messages) => {
      const prompt = messages[0].content
      prompts.push(prompt)
      if (prompt.includes('只做维度规划')) {
        return JSON.stringify({
          dimensionPlan: [{ id: 'd01', name: '稳定特质', targetTrainingCount: 2, targetEvaluationCount: 0 }]
        })
      }
      if (prompt.includes('只生成训练题')) return JSON.stringify({ questionGroups: batchQuestions('chat', 2) })
      throw new Error('zero evaluation target must not generate evaluation questions')
    })

    const result = await runPersonalityQuestionnaireGeneration({
      finalPrompt: '会话投影事实',
      promptSnapshot: {
        promptKind: 'personality_chat_sample_generation',
        targetTrainingGroupCount: 2,
        targetEvaluationQuestionCount: 0
      },
      characterName: '星依',
      agentConfig: {},
      callAI
    })

    expect(callAI).toHaveBeenCalledTimes(2)
    expect(result.evaluationQuestions).toEqual([])
    expect(prompts[1]).toContain('不得补造投影里没有的人物、资源、选项、转折或后续事件')
    expect(prompts[1]).not.toContain('本批题目情境分配')
  })

  it('uses a valid preset as the formal fallback while preserving manual priority', () => {
    const group = question('q001')
    expect(resolvePersonalityQuestionAnswer(group, {})).toEqual({ candidateId: 'A', source: 'preset' })
    expect(resolvePersonalityQuestionAnswer(group, {
      q001: { candidateId: 'B', reviewState: 'confirmed' }
    })).toEqual({ candidateId: 'B', source: 'confirmed' })
    expect(countResolvedQuestionAnswers([group], {})).toEqual({
      confirmed: 0, preset: 1, resolved: 1, unresolved: 0
    })
  })

  it('detects repeated long openings before a generated batch can be checkpointed', () => {
    const first = {
      ...question('q001'),
      question: '暴雨冲垮山路后，塞西莉亚与同行者被困在不断进水的地下通道里，救援条件突然改变。'
    }
    const repeated = {
      ...question('q002'),
      question: '暴雨冲垮山路后，塞西莉亚与三名学生被困在不断进水的地下通道里，出口突然封闭。'
    }
    expect(findPersonalityQuestionDiversityViolations([repeated], [first])).toContain('q002 与 q001 的开场或危机机制过于相似')
  })

  it('requires diversity audit metadata and rejects a repeated type-pressure pair in one dimension', () => {
    const first = {
      ...question('q001'),
      scenarioType: '公开分歧',
      pressureLevel: 'medium'
    }
    const repeatedPair = {
      ...question('q002'),
      question: '团队会议中有人不同意角色的普通安排。',
      scenarioType: '公开分歧',
      pressureLevel: 'medium',
      diversityNote: '声称表达不同'
    }
    expect(findPersonalityQuestionDiversityViolations(
      [repeatedPair],
      [first],
      { requireAuditMetadata: true }
    )).toContain('q002 与 q001 在同一维度重复使用 scenarioType=公开分歧、pressureLevel=medium')

    const missingAudit = { ...question('q003'), scenarioType: '', pressureLevel: undefined, diversityNote: '' }
    expect(findPersonalityQuestionDiversityViolations(
      [missingAudit],
      [],
      { requireAuditMetadata: true }
    )).toEqual(expect.arrayContaining([
      'q003 缺少 scenarioType，无法审计情境类型差异',
      'q003 的 pressureLevel 必须是 low/medium/high',
      'q003 缺少 diversityNote，未说明相对历史题的类型/程度差异'
    ]))
  })

  it('rejects turns in simple positions and allows at most the designated tenth item to be complex', () => {
    const simpleWithTwist = {
      ...question('q001'),
      question: '朋友邀请角色吃饭，随后又说只有答应另一件事才能参加。'
    }
    expect(findPersonalityQuestionDesignViolations([simpleWithTwist], 1))
      .toContain('q001 应为简单题，但题干包含转折或连续变化')
    expect(findPersonalityQuestionDesignViolations([simpleWithTwist], 10)).toEqual([])
  })

  it('rejects long simple stems and candidates so quick-answer items stay short', () => {
    const longSimple = {
      ...question('q001'),
      question: '这是一个很长但没有转折的背景。'.repeat(7),
      candidates: [
        { id: 'A', text: '心里平静，表面正常回应。'.repeat(6), label: 'A' },
        { id: 'B', text: '心里犹豫，表面暂时等待。', label: 'B' },
        { id: 'C', text: '心里好奇，表面直接询问。', label: 'C' }
      ]
    }
    expect(findPersonalityQuestionDesignViolations([longSimple], 1)).toEqual(expect.arrayContaining([
      'q001 应为简单题，但题干超过 80 个字符',
      'q001 的候选 A 超过 60 个字符，不利于快速作答'
    ]))
  })

  it('rejects an A/B-only scenario or a candidate that invents an unprovided C option', () => {
    const closedTwoChoices = {
      ...question('q001'),
      question: '角色只能在方案 A 和方案 B 之间选择。',
      candidates: [
        { id: 'A', text: '心里谨慎，表面选择方案 A。', label: 'A' },
        { id: 'B', text: '心里犹豫，表面选择方案 B。', label: 'B' },
        { id: 'C', text: '心里轻松，表面改选方案 C。', label: 'C' }
      ]
    }
    expect(findPersonalityQuestionDesignViolations([closedTwoChoices], 1)).toEqual(expect.arrayContaining([
      'q001 的题干只列出 A/B；显式列方案时必须把第三个方案写入题干',
      'q001 的候选 C 引用了题干未提供的 C 选项或第三条路'
    ]))
  })

  it('rewrites a fact-breaking batch before it can enter a checkpoint', async () => {
    const invalid = {
      ...question('bad'),
      question: '角色只能在方案 A 和方案 B 之间选择。',
      candidates: [
        { id: 'A', text: '心里谨慎，表面选择方案 A。', label: 'A' },
        { id: 'B', text: '心里犹豫，表面选择方案 B。', label: 'B' },
        { id: 'C', text: '心里轻松，表面选择方案 C。', label: 'C' }
      ]
    }
    const valid = {
      ...question('good'),
      question: '朋友邀请角色参加一个小型聚会。'
    }
    const prompts = []
    const callAI = vi.fn(async (messages) => {
      prompts.push(messages[0].content)
      return JSON.stringify({ questionGroups: [callAI.mock.calls.length === 1 ? invalid : valid] })
    })
    const checkpoints = []

    const result = await runPersonalityQuestionnaireGeneration({
      finalPrompt: '角色资料',
      promptSnapshot: {
        basePrompt: '角色资料',
        targetTrainingGroupCount: 1,
        targetEvaluationQuestionCount: 0
      },
      characterName: '星依',
      agentConfig: {},
      callAI,
      onCheckpoint: (draft) => checkpoints.push(draft.questionGroups.map((item) => item.question))
    })

    expect(callAI).toHaveBeenCalledTimes(2)
    expect(prompts[1]).toContain('上一版未通过题目质量硬门')
    expect(prompts[1]).toContain('题干只列出 A/B')
    expect(result.questionGroups[0].question).toBe(valid.question)
    expect(checkpoints.flat()).not.toContain(invalid.question)
  })
})
