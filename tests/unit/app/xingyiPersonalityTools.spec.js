import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCalibratePersonalityTool,
  createGenerateTrainingQuestionnaireTool,
  createXingyiPersonalityTools,
  pickCalibrationDataset,
  resolveXingyiPersonalityCharacter
} from '../../../src/app/xingyiPersonalityTools.ts'
import {
  personalityTrainingApi,
  runPersonalityQuestionnaireGeneration
} from '../../../src/app/personalityTrainingWorkflow.ts'

// 内核解析独立打桩：校准工具容忍解析失败（kernel=null 继续），不在本 spec 里驱动真解析
vi.mock('../../../src/app/personalityKernelParser.ts', () => ({
  runPersonalityKernelParser: vi.fn(async () => ({ status: 'skipped', reason: '', sourceTextHash: '' }))
}))

// 出题核心打桩（HTTP api 保留原对象引用供 spyOn；出题真跑要几十次模型调用，不进单测）
vi.mock('../../../src/app/personalityTrainingWorkflow.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    runPersonalityQuestionnaireGeneration: vi.fn()
  }
})

const CALIBRATION_OUTPUT = JSON.stringify({
  traits: [{
    dimensionKey: 'socialTrust',
    status: 'adjust',
    newScore: 200,
    before: '警觉怀疑为主',
    after: '对熟人更信任开放',
    conflict: true,
    evidence: [{ kind: 'pos', text: '样本里她主动回应了善意', sampleId: 'q001' }]
  }],
  revisedPersonality: '新的性格正文：警觉但对熟人信任开放。'
})

function buildDataset(overrides = {}) {
  return {
    datasetId: 'ds1',
    characterId: 'char-1',
    title: '数据集A',
    sourceKind: 'profile',
    status: 'ready',
    dimensionPlan: [],
    questionGroups: [{
      id: 'q001',
      question: '被陌生人搭话时她会怎么做？',
      dimension: '信任开放',
      difficulty: 'normal',
      candidates: [
        { id: 'A', text: '先观察再简短回应', label: 'A' },
        { id: 'B', text: '直接热情攀谈', label: 'B' }
      ]
    }],
    answers: { q001: { candidateId: 'A', reviewState: 'confirmed' } },
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

function createCtx(overrides = {}) {
  return {
    confirmWrite: vi.fn(async () => true),
    callAI: vi.fn(async () => CALIBRATION_OUTPUT),
    loadAgentConfig: () => null,
    listCharacters: () => [{ id: 'char-1', name: '小依' }, { id: 'char-2', name: '阿岚' }],
    readCharacter: () => ({ id: 'char-1', personality: '旧性格：警觉怀疑为主。' }),
    updateCharacterPersonality: vi.fn(async () => {}),
    ...overrides
  }
}

function toolCall(args) {
  return { id: 'call_1', name: 'x', args }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveXingyiPersonalityCharacter（角色名解析）', () => {
  const characters = [
    { id: 'char-1', name: '小依' },
    { id: 'char-2', name: '阿岚' },
    { id: 'char-3', name: '阿岚·影' }
  ]

  it('精确 id / 精确名字 / 唯一子串依序命中', () => {
    expect(resolveXingyiPersonalityCharacter(characters, 'char-2').character?.name).toBe('阿岚')
    expect(resolveXingyiPersonalityCharacter(characters, '小依').character?.id).toBe('char-1')
    expect(resolveXingyiPersonalityCharacter(characters, '影').character?.id).toBe('char-3')
  })

  it('歧义/未命中给可读候选或提示', () => {
    const ambiguous = resolveXingyiPersonalityCharacter(characters, '阿岚')
    // 精确名字命中唯一「阿岚」优先，不算歧义
    expect(ambiguous.character?.id).toBe('char-2')
    const partial = resolveXingyiPersonalityCharacter([...characters, { id: 'char-4', name: '小依依' }], '依')
    expect(partial.error).toContain('匹配到多个角色')
    expect(resolveXingyiPersonalityCharacter(characters, '不存在').error).toContain('没有找到')
    expect(resolveXingyiPersonalityCharacter(characters, '').error).toContain('缺少角色名字')
  })
})

describe('pickCalibrationDataset（校准依据数据集挑选）', () => {
  it('按更新时间新→旧取第一个有已确认样本的数据集', () => {
    const older = buildDataset({ datasetId: 'ds-old', updatedAt: '2026-06-01T00:00:00.000Z' })
    const newerNoSamples = buildDataset({ datasetId: 'ds-new', answers: {}, updatedAt: '2026-07-02T00:00:00.000Z' })
    const picked = pickCalibrationDataset([older, newerNoSamples])
    expect(picked?.dataset.datasetId).toBe('ds-old')
    expect(picked?.samples).toHaveLength(1)
    expect(picked?.samples[0]).toMatchObject({ id: 'q001', chosenPlan: '先观察再简短回应', rejectedPlans: ['直接热情攀谈'] })
  })

  it('全部无样本返回 null', () => {
    expect(pickCalibrationDataset([buildDataset({ answers: {} })])).toBeNull()
    expect(pickCalibrationDataset([])).toBeNull()
  })
})

describe('calibratePersonality（性格校准工具）', () => {
  it('confirmWrite 缺失：硬门拒绝，不发起任何请求', async () => {
    const ctx = createCtx({ confirmWrite: undefined })
    const listSpy = vi.spyOn(personalityTrainingApi, 'listDatasets')
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.status).toBe('error')
    expect(result.content).toContain('确认通道未接入')
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('角色没有已确认样本：成功态如实说，不调模型不写回', async () => {
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([buildDataset({ answers: {} })])
    const ctx = createCtx()
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('还没有已确认的训练样本')
    expect(ctx.callAI).not.toHaveBeenCalled()
    expect(ctx.updateCharacterPersonality).not.toHaveBeenCalled()
  })

  it('上策全链：样本→校准→确认卡片→写回性格正文', async () => {
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([buildDataset()])
    const ctx = createCtx()
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('已据 1 条样本校准')
    expect(result.content).toContain('调整 1')
    expect(ctx.confirmWrite).toHaveBeenCalledTimes(1)
    const confirmLines = ctx.confirmWrite.mock.calls[0][0].lines.join('\n')
    expect(confirmLines).toContain('小依')
    expect(confirmLines).toContain('新的性格正文')
    expect(ctx.updateCharacterPersonality).toHaveBeenCalledWith('char-1', '新的性格正文：警觉但对熟人信任开放。')
  })

  it('用户取消确认：返回已取消成功态，不写回', async () => {
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([buildDataset()])
    const ctx = createCtx({ confirmWrite: vi.fn(async () => false) })
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.status).toBeUndefined()
    expect(result.details?.denied).toBe(true)
    expect(ctx.updateCharacterPersonality).not.toHaveBeenCalled()
  })

  it('修订与原文一致：无需修改，不弹确认不写回', async () => {
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([buildDataset()])
    const ctx = createCtx({
      readCharacter: () => ({ id: 'char-1', personality: '新的性格正文：警觉但对熟人信任开放。' })
    })
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('无需修改')
    expect(ctx.confirmWrite).not.toHaveBeenCalled()
    expect(ctx.updateCharacterPersonality).not.toHaveBeenCalled()
  })

  it('角色名歧义/未命中：INVALID_ARGUMENT 带候选', async () => {
    const ctx = createCtx({
      listCharacters: () => [{ id: 'a', name: '同名' }, { id: 'b', name: '同名' }]
    })
    const result = await createCalibratePersonalityTool(ctx).execute(toolCall({ characterName: '同名' }))
    expect(result.status).toBe('error')
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('同名(a)')
  })
})

describe('generateTrainingQuestionnaire（训练出题工具）', () => {
  it('用户取消确认：不创建数据集草稿', async () => {
    const createSpy = vi.spyOn(personalityTrainingApi, 'createDatasetDraft')
    const ctx = createCtx({ confirmWrite: vi.fn(async () => false) })
    const result = await createGenerateTrainingQuestionnaireTool(ctx).execute(toolCall({ characterName: '小依' }))
    expect(result.details?.denied).toBe(true)
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('上策全链：建草稿→出题→存题，不在交卷后追加清答案写入', async () => {
    const draftDataset = buildDataset({ datasetId: 'ds-new', promptSnapshot: { finalPrompt: '出题提示词' }, questionGroups: [], answers: {} })
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([])
    const createSpy = vi.spyOn(personalityTrainingApi, 'createDatasetDraft').mockResolvedValue(draftDataset)
    const saveSpy = vi.spyOn(personalityTrainingApi, 'saveDatasetQuestionnaire').mockResolvedValue({ ...draftDataset, title: '数据集B' })
    const answersSpy = vi.spyOn(personalityTrainingApi, 'saveDatasetAnswers').mockResolvedValue(draftDataset)
    runPersonalityQuestionnaireGeneration.mockResolvedValue({
      dimensionPlan: [{ id: 'd01', name: '信任开放' }],
      questionGroups: [{ id: 'q001' }, { id: 'q002' }],
      evaluationQuestions: [{ id: 'eval001' }]
    })
    const ctx = createCtx()
    const result = await createGenerateTrainingQuestionnaireTool(ctx).execute(toolCall({ characterName: '小依' }))

    expect(result.status).toBeUndefined()
    expect(result.content).toContain('2 道训练题')
    expect(result.content).toContain('1 道冻结评测题')
    expect(createSpy).toHaveBeenCalledWith('char-1', {})
    expect(runPersonalityQuestionnaireGeneration).toHaveBeenCalledWith(expect.objectContaining({
      finalPrompt: '出题提示词',
      characterName: '小依'
    }))
    const savePayload = saveSpy.mock.calls[0][2]
    expect(savePayload.promptSnapshot.lastGenerationFailure).toBeNull()
    expect(savePayload.promptSnapshot.lastGenerationSuccess).toMatchObject({ questionGroupCount: 2, evaluationQuestionCount: 1 })
    expect(answersSpy).not.toHaveBeenCalled()
  })

  it('出题失败：失败诊断落进 promptSnapshot、报错说明草稿已创建', async () => {
    const draftDataset = buildDataset({ datasetId: 'ds-fail', promptSnapshot: { finalPrompt: 'P' }, questionGroups: [], answers: {} })
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([])
    vi.spyOn(personalityTrainingApi, 'createDatasetDraft').mockResolvedValue(draftDataset)
    const saveSpy = vi.spyOn(personalityTrainingApi, 'saveDatasetQuestionnaire').mockResolvedValue(draftDataset)
    runPersonalityQuestionnaireGeneration.mockRejectedValue(new Error('模型输出不是 JSON'))
    const ctx = createCtx()
    const result = await createGenerateTrainingQuestionnaireTool(ctx).execute(toolCall({ characterName: '小依' }))

    expect(result.status).toBe('error')
    expect(result.content).toContain('模型输出不是 JSON')
    expect(result.content).toContain('续跑检查点仍保留')
    const failurePayload = saveSpy.mock.calls[0][2]
    expect(failurePayload.promptSnapshot.lastGenerationFailure).toMatchObject({ message: '模型输出不是 JSON' })
  })

  it('已有中断检查点时续跑原数据集，不再新建草稿', async () => {
    const checkpointDataset = buildDataset({
      datasetId: 'ds-resume',
      status: 'questionnaire_generating',
      promptSnapshot: {
        finalPrompt: 'P',
        questionnaireGenerationCheckpoint: {
          schemaVersion: 1,
          status: 'in_progress',
          stage: 'training_batch',
          targetTrainingGroupCount: 90,
          targetEvaluationQuestionCount: 24,
          completedTrainingCount: 10,
          completedEvaluationCount: 0,
          evaluationQuestions: [],
          savedAt: '2026-07-23T00:00:00.000Z'
        }
      }
    })
    vi.spyOn(personalityTrainingApi, 'listDatasets').mockResolvedValue([checkpointDataset])
    const createSpy = vi.spyOn(personalityTrainingApi, 'createDatasetDraft')
    vi.spyOn(personalityTrainingApi, 'saveDatasetQuestionnaire').mockResolvedValue(checkpointDataset)
    const answersSpy = vi.spyOn(personalityTrainingApi, 'saveDatasetAnswers').mockResolvedValue(checkpointDataset)
    runPersonalityQuestionnaireGeneration.mockResolvedValue({
      dimensionPlan: [],
      questionGroups: checkpointDataset.questionGroups,
      evaluationQuestions: []
    })

    await createGenerateTrainingQuestionnaireTool(createCtx()).execute(toolCall({ characterName: '小依' }))

    expect(createSpy).not.toHaveBeenCalled()
    expect(runPersonalityQuestionnaireGeneration).toHaveBeenCalledWith(expect.objectContaining({
      resumeDraft: expect.objectContaining({ questionGroups: checkpointDataset.questionGroups })
    }))
    expect(answersSpy).not.toHaveBeenCalled()
  })
})

describe('createXingyiPersonalityTools（全家桶装配）', () => {
  it('两件套按序装配', () => {
    const tools = createXingyiPersonalityTools(createCtx())
    expect(tools.map((tool) => tool.name)).toEqual(['calibratePersonality', 'generateTrainingQuestionnaire'])
  })
})
