import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'
import { createReplyPlanAgentHookRegistry } from '../../../src/app/replyPlanAgent/hooks.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })

function makeToolRegistry() {
  return new ToolRegistry([
    {
      name: 'generatePlanBatch',
      brief: '生成候选计划',
      validateArgs: (args) => Array.isArray(args.intensities) && args.intensities.length > 0 ? null : 'generatePlanBatch 必须提供 intensities',
      execute: (toolCall) => {
        const strategy = String(toolCall.args.strategy || 'unknown')
        const intensities = Array.isArray(toolCall.args.intensities) ? toolCall.args.intensities : []
        const forceMismatch = toolCall.args.forceMismatch === true
        const candidateIds = (forceMismatch ? intensities.slice(0, 1) : intensities).map((intensity) => `${strategy}_${intensity}`)
        return {
          content: `${strategy} 生成 ${candidateIds.length} 条候选`,
          details: {
            strategy,
            candidateIds
          }
        }
      }
    },
    {
      name: 'reviewPlanCandidates',
      brief: '评审候选计划',
      execute: () => ({
        content: '评审完成',
        details: {
          scoredCandidateCount: 3,
          topPlanIds: ['aggressive_medium', 'aggressive_low', 'aggressive_high']
        }
      })
    }
  ])
}

function generateCall(extra = {}) {
  return {
    callId: extra.callId || 'call_generate',
    toolName: 'generatePlanBatch',
    stage: 'plan-generation',
    args: {
      strategy: 'aggressive',
      strategyLabel: '进攻性',
      intensities: ['low', 'medium', 'high'],
      planPrompt: '生成进攻性低中高三档候选。',
      ...extra.args
    },
    expectation: '返回 3 条候选，并与 low / medium / high 一一对应。'
  }
}

describe('replyPlanAgent 阶段 hook 批次 3', () => {
  it('候选生成不符合 expectation 时注入修复提示，第二轮可重试同类工具', async () => {
    const callModel = vi.fn(({ turnIndex }) => {
      if (turnIndex === 0) {
        return {
          stage: 'plan-generation',
          toolCalls: [generateCall({ callId: 'call_generate_bad', args: { forceMismatch: true } })],
          done: false
        }
      }
      return {
        stage: 'plan-generation',
        toolCalls: [generateCall({ callId: 'call_generate_fixed' })],
        done: true
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeToolRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['generatePlanBatch'],
      budget: { maxTurns: 2, maxToolCalls: 4 },
      callModel
    })

    expect(callModel.mock.calls[0][0].activeTools).toEqual(['generatePlanBatch'])
    expect(callModel.mock.calls[1][0].activeTools).toEqual(['generatePlanBatch'])
    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      callId: 'call_generate_bad',
      status: 'error',
      error: { type: 'EXPECTATION_MISMATCH' }
    })
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planGeneration.afterResult',
      activeTools: ['generatePlanBatch'],
      requestRetry: {
        callId: 'call_generate_bad',
        toolName: 'generatePlanBatch',
        errorType: 'EXPECTATION_MISMATCH'
      }
    })
    expect(transcript.turns[1].toolResults[0]).toMatchObject({
      callId: 'call_generate_fixed',
      status: 'success',
      details: expect.objectContaining({ calibrationRequired: true })
    })
  })

  it('同一类型同一提示词候选数量连续失败三次后，要求编排器调整提示词', async () => {
    const callModel = vi.fn(({ turnIndex, activeTools }) => {
      expect(activeTools).toEqual(['generatePlanBatch'])
      return {
        stage: 'plan-generation',
        toolCalls: [generateCall({
          callId: `call_generate_bad_${turnIndex}`,
          args: {
            forceMismatch: true,
            strategy: 'defensive',
            strategyLabel: '防御性',
            planPrompt: '生成防御性低中高三档候选。'
          }
        })],
        done: false
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeToolRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['generatePlanBatch'],
      budget: { maxTurns: 3, maxToolCalls: 6 },
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(3)
    const thirdResult = transcript.turns[2].toolResults[0]
    expect(thirdResult).toMatchObject({
      status: 'error',
      details: expect.objectContaining({
        strategy: 'defensive',
        strategyLabel: '防御性',
        originalPlanPrompt: '生成防御性低中高三档候选。',
        expectedCandidateCount: 3,
        actualCandidateCount: 1,
        failureCount: 3,
        requiresPlanPromptAdjustment: true
      })
    })
    expect(transcript.turns[2].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planGeneration.afterResult',
      activeTools: ['generatePlanBatch', 'getToolManual'],
      requestRetry: {
        toolName: 'generatePlanBatch',
        errorType: 'EXPECTATION_MISMATCH'
      }
    })
    expect(transcript.turns[2].nextTurnPatches[0].injectMessages[0].content).toContain('连续失败 3 次')
    expect(transcript.turns[2].nextTurnPatches[0].injectMessages[0].content).toContain('原 planPrompt：生成防御性低中高三档候选。')
    expect(transcript.turns[2].nextTurnPatches[0].injectMessages[0].content).toContain('调整该类型的 planPrompt')
  })

  it('候选生成阶段未发起 generatePlanBatch 时立刻注入修复提示并继续等待该工具调用', async () => {
    const callModel = vi.fn(({ turnIndex, activeTools }) => {
      if (turnIndex === 0) {
        expect(activeTools).toEqual(['generatePlanBatch', 'getToolManual'])
        return {
          stage: 'plan-generation',
          toolCalls: [{
            callId: 'call_manual_only',
            toolName: 'getToolManual',
            stage: 'manual-reading',
            args: { name: 'generatePlanBatch' },
            expectation: '读取 generatePlanBatch 手册。'
          }],
          done: false
        }
      }
      expect(activeTools).toEqual(['generatePlanBatch', 'getToolManual'])
      return {
        stage: 'plan-generation',
        toolCalls: [generateCall({ callId: 'call_generate_after_missing' })],
        done: true
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeToolRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['generatePlanBatch', 'getToolManual'],
      budget: { maxTurns: 2, maxToolCalls: 4 },
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(2)
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planGeneration.missingToolCall',
      activeTools: ['generatePlanBatch', 'getToolManual'],
      requestRetry: {
        toolName: 'generatePlanBatch',
        errorType: 'EXPECTATION_MISMATCH'
      }
    })
    expect(transcript.turns[0].nextTurnPatches[0].injectMessages[0].content).toContain('下一轮必须调用 generatePlanBatch')
    expect(transcript.turns[0].toolCalls).toEqual([])
    expect(transcript.turns[0].toolResults).toEqual([])
    expect(transcript.turns[1].toolCalls.map((call) => call.toolName)).toEqual(['generatePlanBatch'])
    expect(transcript.turns[1].toolResults[0]).toMatchObject({
      callId: 'call_generate_after_missing',
      status: 'success'
    })
  })

  it('候选生成阶段连续三轮未发起 generatePlanBatch 后终止编排', async () => {
    const callModel = vi.fn(({ activeTools }) => {
      expect(activeTools).toEqual(['generatePlanBatch', 'getToolManual'])
      return {
        stage: 'plan-generation',
        toolCalls: [],
        done: false
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeToolRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['generatePlanBatch', 'getToolManual'],
      budget: { maxTurns: 4, maxToolCalls: 4 },
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(3)
    expect(transcript.terminalReason).toBe('terminated-by-hook')
    expect(transcript.turns[2].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planGeneration.missingToolCall',
      activeTools: [],
      terminate: true,
      requestRetry: {
        toolName: 'generatePlanBatch',
        errorType: 'EXPECTATION_MISMATCH'
      }
    })
    expect(transcript.turns[2].nextTurnPatches[0].injectMessages[0].content).toContain('连续 3 轮没有发起 generatePlanBatch')
    expect(transcript.turns[2].nextTurnPatches[0].injectMessages[0].content).toContain('工具调用缺失')
  })

  it('reviewPlanCandidates 成功后由 hook 直接收束工具循环（批次4 去融合，评审为终点）', async () => {
    const callModel = vi.fn(({ turnIndex, activeTools }) => {
      expect(turnIndex).toBe(0)
      expect(activeTools).toEqual(['reviewPlanCandidates'])
      return {
        stage: 'plan-review',
        toolCalls: [{
          callId: 'call_review',
          toolName: 'reviewPlanCandidates',
          stage: 'plan-review',
          args: { candidateIds: ['aggressive_low', 'aggressive_medium', 'aggressive_high'] },
          expectation: '返回前三计划。'
        }],
        done: false
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeToolRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['reviewPlanCandidates'],
      budget: { maxTurns: 3, maxToolCalls: 4 },
      callModel
    })

    // 去融合后：评审成功即终点，hook 终止工具循环，不再进入第二轮。
    expect(callModel).toHaveBeenCalledTimes(1)
    expect(transcript.terminalReason).toBe('terminated-by-hook')
    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      toolName: 'reviewPlanCandidates',
      status: 'success',
      content: '评审完成，前三计划可用于最终回复：aggressive_medium、aggressive_low、aggressive_high',
      details: { readyForFinalReply: true }
    })
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planReview.afterResult',
      activeTools: [],
      terminate: true
    })
  })

  it('reviewPlanCandidates 缺少 topPlanIds 时由 hook 要求重试，不直接收束', async () => {
    const toolRegistry = new ToolRegistry([
      {
        name: 'reviewPlanCandidates',
        brief: '评审候选计划',
        execute: () => ({ content: '评审完成', details: { scoredCandidateCount: 3, topPlanIds: [] } })
      }
    ])
    const callModel = vi.fn(() => ({
      stage: 'plan-review',
      toolCalls: [{
        callId: 'call_review',
        toolName: 'reviewPlanCandidates',
        stage: 'plan-review',
        args: { candidateIds: ['*'] },
        expectation: '返回前三计划。'
      }],
      done: false
    }))

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry,
      hookRegistry: createReplyPlanAgentHookRegistry(),
      initialActiveTools: ['reviewPlanCandidates'],
      budget: { maxTurns: 2, maxToolCalls: 4 },
      callModel
    })

    expect(transcript.turns[0].toolResults[0]).toMatchObject({
      status: 'error',
      error: { type: 'EXPECTATION_MISMATCH' }
    })
    expect(transcript.turns[0].nextTurnPatches[0]).toMatchObject({
      sourceHookId: 'replyPlan.planReview.afterResult',
      activeTools: ['reviewPlanCandidates'],
      requestRetry: { toolName: 'reviewPlanCandidates', errorType: 'EXPECTATION_MISMATCH' }
    })
  })

  // ── 导演模式生成兜底（Bug C 修复，用户 2026-06-20 真机）：旁白决策步/getToolManual 抖动 activeTools
  //    会让旧 missing 判据计数被重置、永不触发，模型空手收尾 → generateCalls=0 报错。导演模式改稳定判据。 ──
  function makeDirectorRegistry() {
    return new ToolRegistry([
      {
        name: 'readScenarioSkill',
        brief: '读取情境 skill 正文',
        validateArgs: (args) => String(args.code || '').trim() ? null : 'readScenarioSkill 缺少 code',
        execute: (toolCall) => ({ content: `情境 ${toolCall.args.code} 正文`, details: { scenarioCode: toolCall.args.code } })
      },
      {
        name: 'readNarrationSkill',
        brief: '读旁白写法',
        execute: () => ({ content: '旁白写法本体', details: {} })
      },
      {
        name: 'generatePlanBatch',
        brief: '生成候选计划',
        validateArgs: (args) => Array.isArray(args.intensities) && args.intensities.length > 0 ? null : 'generatePlanBatch 必须提供 intensities',
        execute: (toolCall) => {
          const strategy = String(toolCall.args.strategy || 'unknown')
          const intensities = Array.isArray(toolCall.args.intensities) ? toolCall.args.intensities : []
          return { content: `${strategy} 生成 ${intensities.length} 条候选`, details: { strategy, candidateIds: intensities.map((i) => `${strategy}_${i}`) } }
        }
      }
    ])
  }

  it('导演模式：情境已读后模型空手收尾（无 toolCalls/done），兜底拦回并要求真发 generatePlanBatch，不终止', async () => {
    const callModel = vi.fn(({ turnIndex }) => {
      if (turnIndex === 0) {
        return { stage: 'scenario-routing', toolCalls: [{ callId: 'c_scn', toolName: 'readScenarioSkill', stage: 'scenario-routing', args: { code: 'nsfw' } }], done: false }
      }
      if (turnIndex === 1) {
        // 模型以为「三批候选已发出、在等结果」，实则没把 generatePlanBatch 放进 toolCalls，试图收尾。
        return { stage: 'plan-generation', thought: '三批候选已发出，等结果返回', toolCalls: [], done: true }
      }
      // 被兜底拦回后，这一轮真发 generatePlanBatch。
      return {
        stage: 'plan-generation',
        toolCalls: [generateCall({ callId: 'c_gen_real' })],
        done: true
      }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeDirectorRegistry(),
      hookRegistry: createReplyPlanAgentHookRegistry({ directorMode: true }),
      initialActiveTools: ['readScenarioSkill', 'generatePlanBatch', 'getToolManual'],
      budget: { maxTurns: 4, maxToolCalls: 6 },
      callModel
    })

    // turn1 空手收尾被兜底拦回：missingToolCall patch + requestRetry，但不 terminate。
    const patch = transcript.turns[1].nextTurnPatches.find((p) => p.sourceHookId === 'replyPlan.planGeneration.missingToolCall')
    expect(patch).toMatchObject({ requestRetry: { toolName: 'generatePlanBatch', errorType: 'EXPECTATION_MISMATCH' } })
    expect(patch.terminate).toBeUndefined()
    expect(patch.injectMessages[0].content).toContain('同步工具')
    // loop 没有因空 toolCalls 提前收束，继续到 turn2 真发 generatePlanBatch。
    expect(transcript.turns[2].toolCalls.map((c) => c.toolName)).toEqual(['generatePlanBatch'])
    expect(transcript.turns[2].toolResults[0]).toMatchObject({ callId: 'c_gen_real', status: 'success' })
    expect(transcript.terminalReason).not.toBe('terminated-by-hook')
  })

  it('导演模式：判情境后走旁白决策步（有工具调用）不被兜底误伤', async () => {
    const callModel = vi.fn(({ turnIndex }) => {
      if (turnIndex === 0) {
        return { stage: 'scenario-routing', toolCalls: [{ callId: 'c_scn', toolName: 'readScenarioSkill', stage: 'scenario-routing', args: { code: 'nsfw' } }], done: false }
      }
      if (turnIndex === 1) {
        // 合法旁白中间步：有 toolCall、还没发 generatePlanBatch，但不应被判「空手收尾」而拦回。
        return { stage: 'narration-skill-read', toolCalls: [{ callId: 'c_narr', toolName: 'readNarrationSkill', stage: 'narration-skill-read', args: { profileId: 'environment' } }], done: false }
      }
      return { stage: 'plan-generation', toolCalls: [generateCall({ callId: 'c_gen' })], done: true }
    })

    const { transcript } = await runAgentRuntime({
      agentName: 'ReplyPlanAgent',
      messages: [],
      toolRegistry: makeDirectorRegistry(),
      // item6 退役 openToolGate：旁白工具改由 retrievalToolNames（镜像真实演员 auxToolNames）进各阶段 activeTools 而可调。
      hookRegistry: createReplyPlanAgentHookRegistry({ directorMode: true, retrievalToolNames: ['readNarrationSkill'] }),
      initialActiveTools: ['readScenarioSkill', 'generatePlanBatch', 'getToolManual', 'readNarrationSkill'],
      budget: { maxTurns: 4, maxToolCalls: 6 },
      callModel
    })

    // 旁白步那一轮不应出现 missing 兜底 patch。
    expect(transcript.turns[1].nextTurnPatches.some((p) => p.sourceHookId === 'replyPlan.planGeneration.missingToolCall')).toBe(false)
    // 旁白工具正常执行。
    expect(transcript.turns[1].toolResults[0]).toMatchObject({ callId: 'c_narr', status: 'success' })
    expect(transcript.turns[2].toolCalls.map((c) => c.toolName)).toEqual(['generatePlanBatch'])
  })
})
