import { describe, expect, it, vi } from 'vitest'
import { runPersonalityTrainerAgent } from '../../../src/app/personalityTrainerAgentHarness.ts'

function provider() {
  return {
    readSnapshot: vi.fn(async () => ({
      characterId: 'char_1', characterName: '塞西莉亚', personalityText: '安静而务实。', activeStepId: 'answer',
      dataset: { datasetId: 'dataset_1', title: '草稿', status: 'questionnaire_ready', totalQuestions: 90, answeredQuestions: 5, skippedQuestions: 0, unansweredQuestions: 85 },
      calibration: null, evaluationSet: null, backgroundTasks: [], trainingRuns: [], modelVersions: []
    })),
    readQuestions: vi.fn(), saveQuestions: vi.fn(), saveAnswers: vi.fn(),
    startQuestionnaireGeneration: vi.fn(), recordCalibrationRoundReview: vi.fn(), startQuestionBatch: vi.fn(), startFrozenEvaluationGeneration: vi.fn(),
    readCharacterPersonality: vi.fn(), saveCharacterPersonality: vi.fn(),
    precheckTraining: vi.fn(), startTraining: vi.fn(),
    listTrainingRuns: vi.fn(), getTrainingRun: vi.fn(), getTrainingRunLog: vi.fn(), cancelTraining: vi.fn(),
    startEvaluation: vi.fn(), installModelVersion: vi.fn(), deleteModelVersion: vi.fn()
  }
}

describe('runPersonalityTrainerAgent', () => {
  it('独立 profile 常驻装配人格训练规范，动态 prompt 只放摘要不倾倒整卷', async () => {
    const formalProvider = provider()
    const callOrchestrator = vi.fn(async () => ({ content: '还剩 85 题未回答。我可以按未回答范围继续校准。', toolCalls: [] }))
    const result = await runPersonalityTrainerAgent({
      userText: '我还剩哪些题？',
      history: [{ role: 'assistant', content: '上一轮我们讨论过善良的边界。' }],
      provider: formalProvider,
      callOrchestrator
    })

    expect(result.reply).toContain('还剩 85 题')
    expect(result.transcript.promptSupplyTrace).toContainEqual(expect.objectContaining({
      profileId: 'personality_trainer.workspace',
      skillId: 'personality_trainer.workflow',
      layer: '0',
      loadState: 'loaded'
    }))
    const messages = callOrchestrator.mock.calls[0][0].messages
    expect(messages[0].content).toContain('【常驻 Skill｜鉴心工作规范】')
    expect(messages[0].content).toContain('后台子 Agent「设问」')
    expect(messages[0].content).toContain('还有不依赖设问的核对、整理、预处理或其它 TODO，就继续做')
    expect(messages[0].content).toContain('禁止用 readPersonalityTrainingWorkspace 反复轮询')
    expect(messages[0].content).toContain('默认目标是尚未人工确认的题')
    expect(messages[0].content).toContain('readFullPersonalityQuestionHistory')
    expect(messages[0].content).toContain('一次调用中原子提交连续完整 20 题')
    expect(messages[0].content).toContain('复盘是推荐校准动作，不是继续生成训练题的硬门槛')
    expect(messages[0].content).toContain('一次设问派遣可以生成任意正整数道题')
    expect(messages[0].content).toContain('startPersonalityQuestionBatch')
    expect(messages[0].content).toContain('不要按 20 题循环派遣')
    expect(messages[1].content).toContain('【人格问卷情境设计协议 v8】')
    expect(messages[1].content).toContain('不预写后果、创伤反应、保护方案')
    expect(messages[1].content).toContain('每连续 10 题固定 9 道简单题')
    expect(messages.some((message) => message.content.includes('85 未解决'))).toBe(true)
    expect(messages.some((message) => message.content.includes('【用户输入】\n我还剩哪些题？'))).toBe(true)
    expect(messages.at(-1).content).toContain('【6·当前任务 TODO】')
    expect(messages.map((message) => message.content).join('\n')).not.toContain('第 1 题完整题干')
    expect(result.promptAssemblyTrace.policyId).toBe('personality-trainer-workspace-v1')
    expect(result.transcript.budget.maxTurns).toBeNull()
    expect(result.transcript.budget.maxToolCalls).toBeNull()
  })

  it('缺少角色正式作用域时在模型调用前拒绝启动', async () => {
    const formalProvider = provider()
    formalProvider.readSnapshot.mockResolvedValue({
      characterId: '', characterName: '', personalityText: '', dataset: null, calibration: null, evaluationSet: null,
      backgroundTasks: [], trainingRuns: [], modelVersions: []
    })
    const callOrchestrator = vi.fn()

    await expect(runPersonalityTrainerAgent({
      userText: '开始吧', provider: formalProvider, callOrchestrator
    })).rejects.toThrow('没有当前角色')
    expect(callOrchestrator).not.toHaveBeenCalled()
  })

  it('过程消息先展示后自动续轮，不把“读取后再汇总”误当最终答复', async () => {
    const interim = vi.fn()
    const callOrchestrator = vi.fn()
      .mockResolvedValueOnce({
        content: '现在最后读取工作区摘要，核对整体答题数量与后台状态后再汇总。',
        toolCalls: []
      })
      .mockResolvedValueOnce({
        content: '已经核对完成：当前有效答案 90 题，后台任务已结束。',
        toolCalls: []
      })

    const result = await runPersonalityTrainerAgent({
      userText: '修改完后核对并汇总',
      provider: provider(),
      callOrchestrator,
      onIntermediateMessage: ({ content }) => interim(content)
    })

    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(interim).toHaveBeenCalledWith(expect.stringContaining('读取工作区摘要'))
    expect(result.reply).toContain('已经核对完成')
  })

  it('宿主授予候报权限后，鉴心可自行静默等待设问，不生成重复等待回复', async () => {
    const validate = vi.fn(() => ({
      ok: true,
      runningTaskIds: ['questionnaire_generation-1']
    }))
    const callOrchestrator = vi.fn(async ({ toolBriefs }) => {
      expect(toolBriefs.map((tool) => tool.name)).toContain('waitForSubagentReport')
      return {
        content: '',
        toolCalls: [{
          id: 'wait-1',
          type: 'function',
          function: {
            name: 'waitForSubagentReport',
            arguments: JSON.stringify({
              taskIds: ['questionnaire_generation-1'],
              reason: '阶段复盘已经完成，剩余题量核验只能等待设问交卷'
            })
          }
        }]
      }
    })

    const result = await runPersonalityTrainerAgent({
      userText: '设问在后台跑，没别的事就静默等回报',
      provider: provider(),
      callOrchestrator,
      subagentWait: { validate }
    })

    expect(result.terminalReason).toBe('awaiting-subagent')
    expect(result.reply).toBe('')
    expect(validate).toHaveBeenCalledTimes(1)
    expect(callOrchestrator).toHaveBeenCalledTimes(1)
  })
})
