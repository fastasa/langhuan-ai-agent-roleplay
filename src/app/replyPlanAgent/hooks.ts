import { HookRegistry, type HookDefinition, type HookResult, type HookRuntimeEvent } from '../agentRuntime/hookRegistry'
import type { ToolResultMessage } from '../agentRuntime/types'
import type { ReplyWorkflowMode } from '../chatReplyPipelineMode'

/** 回复计划 hook 配置：mode 决定情境读取后的下一步指令与生成成功后的收束方式。
 *  personality_model（默认）：多计划 + expressionMix + 评审；normal_recall：单计划生成成功即收束。 */
export interface ReplyPlanAgentHookOptions {
  mode?: ReplyWorkflowMode
  /** 取料三件套工具名（§4.5）：存在即在判情境→生成阶段的 activeTools 后追加，让提调全程可按需取料；
   *  缺省（旧链路/测试）为空数组，activeTools 与升格前完全一致。 */
  retrievalToolNames?: string[]
  /** 导演模式（真·导演 loop）：true 时 planGenerationMissing 兜底改用稳定判据（情境已读且尚未生成任何候选时，
   *  模型试图空手/done 收尾就拦回，不依赖会被旁白步/getToolManual 抖动重置的 activeTools 状态机；
   *  且不设 3 轮 terminate 上限——导演模式靠 20 分钟硬超时兜底）。缺省=旧链路判据，零回归。 */
  directorMode?: boolean
}

export const REPLY_PLAN_AGENT_STAGE_HOOK_IDS = {
  scenarioSkillResult: 'replyPlan.scenarioSkill.afterResult',
  curtainSceneUpdateResult: 'replyPlan.curtainSceneUpdate.afterResult',
  manualError: 'replyPlan.manual.errorRepair',
  planGenerationMissing: 'replyPlan.planGeneration.missingToolCall',
  planGenerationResult: 'replyPlan.planGeneration.afterResult',
  planGenerationError: 'replyPlan.planGeneration.errorRepair',
  planGenerationInvalidArgs: 'replyPlan.planGeneration.invalidArgsRepair',
  planReviewResult: 'replyPlan.planReview.afterResult'
} as const

interface PlanGenerationFailureRecord {
  count: number
  reasons: string[]
  originalPrompt: string
  strategy: string
  strategyLabel: string
  expectedCount: number
  actualCount: number
}

export function createReplyPlanAgentHookRegistry(options: ReplyPlanAgentHookOptions = {}): HookRegistry {
  return new HookRegistry(createReplyPlanAgentHooks(options))
}

export function createReplyPlanAgentHooks(options: ReplyPlanAgentHookOptions = {}): HookDefinition[] {
  const singlePlanOnly = options.mode === 'normal_recall'
  const directorMode = options.directorMode === true
  // 取料工具名：空数组时下面的 [...base, ...retrievalToolNames] 等于 base，老用例 activeTools 断言不变。
  const retrievalToolNames = Array.isArray(options.retrievalToolNames) ? options.retrievalToolNames : []
  const generationFailures = new Map<string, PlanGenerationFailureRecord>()
  let missingGeneratePlanBatchRounds = 0
  // 导演模式稳定判据用：情境是否已读成功、是否已成功生成过任何候选。不受 activeTools 抖动影响。
  let scenarioReadDone = false
  let generatedAnyPlan = false
  // 参数校验失败按轮计数（同轮多个失败调用只记一次），连续 3 轮仍不合法则终止编排。
  let invalidArgsRounds = 0
  let lastInvalidArgsTurn = -1
  return [
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.scenarioSkillResult,
      lifecycle: 'afterToolResult',
      priority: 20,
      appliesTo: { toolName: 'readScenarioSkill', status: 'success' },
      run: ({ toolResult }) => {
        const result = requireToolResult(toolResult)
        scenarioReadDone = true
        return {
          summary: singlePlanOnly
            ? '情境 skill 读取成功，下一轮生成单个回复计划后结束编排。'
            : '情境 skill 读取成功，下一轮开放候选生成工具。',
          // 不覆盖 content：toolResult 正文（情境 skill body）必须原样进入下一轮 messages，
          // 模型要据正文自拟 strategy/planPrompt；占位句曾把正文挡在模型视野外（盲打根因之一）。
          patchToolResult: {
            details: {
              ...result.details,
              scenarioSkillReady: true
            }
          },
          injectMessages: [
            {
              role: 'user',
              purpose: 'stage-instruction',
              content: singlePlanOnly
                ? '已读取情境 skill 正文；如果当前用户输入明确要求快进时间或改变地点，且你尚未调用 updateCurtainScene，请先调用 updateCurtainScene；否则下一轮请以该情境正文为参考，只调用一次 generatePlanBatch 生成一个回复计划：intensities 必须恰好包含 1 个强度，planPrompt 描述角色接下来应呈现的动作、神态、态度、语气和表达意图。本模式没有评审阶段，也不需要给出 expressionMix；计划生成成功后编排即结束。'
                : '已读取情境 skill 正文；如果当前用户输入明确要求快进时间或改变地点，且你尚未调用 updateCurtainScene，请先调用 updateCurtainScene；否则下一轮请在同一轮里一次性为该情境正文描述的每个反应类别各发起一次 generatePlanBatch 原生函数调用，并在这一轮 content JSON 顶层给出 expressionMix（action/dialogue/expression/innerState/narration 五项整数合计 100）；这一轮不要调用 reviewPlanCandidates。'
            }
          ],
          activeTools: ['generatePlanBatch', 'updateCurtainScene', 'getToolManual', ...retrievalToolNames]
        }
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.curtainSceneUpdateResult,
      lifecycle: 'afterToolResult',
      priority: 21,
      appliesTo: { toolName: 'updateCurtainScene', status: 'success' },
      run: ({ toolResult }) => {
        const result = requireToolResult(toolResult)
        return {
          summary: '帷幕时间地点修改工具已返回，下一轮开放候选生成工具。',
          patchToolResult: {
            content: result.content || '帷幕时间地点修改工具已完成。',
            details: {
              ...result.details,
              curtainSceneReady: true
            }
          },
          injectMessages: [
            {
              role: 'user',
              purpose: 'stage-instruction',
              content: '帷幕时间地点修改工具已完成；下一轮生成候选计划时，planPrompt 必须承接这次时间或地点变化，不要让角色像仍停留在旧时间旧地点一样直接接话。'
            }
          ],
          activeTools: ['generatePlanBatch', 'getToolManual', ...retrievalToolNames]
        }
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.manualError,
      lifecycle: 'afterToolResult',
      priority: 30,
      appliesTo: { toolName: 'getToolManual', status: 'error' },
      run: ({ toolResult }) => {
        const result = requireToolResult(toolResult)
        return {
          summary: '工具手册读取失败，要求修正工具名后重试。',
          injectMessages: [
            {
              role: 'user',
              purpose: 'error-repair',
              content: `getToolManual 调用失败：${result.error?.message || result.content}。请重新发起 getToolManual 原生函数调用（参数 name 填要查的工具名，如 generatePlanBatch）修正工具名后重试，不要跳过失败直接进入候选生成。`
            }
          ],
          requestRetry: {
            callId: result.callId,
            toolName: result.toolName,
            errorType: result.error?.type || 'TOOL_RUNTIME_ERROR',
            reason: '工具手册读取失败，需要先修正元工具参数。'
          },
          activeTools: ['getToolManual']
        }
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.planGenerationMissing,
      lifecycle: 'afterModelMessage',
      priority: 25,
      run: (event) => {
        // 导演模式专属稳定判据（用户 2026-06-20 真机修复）：旧 activeTools 判据会被旁白决策步、
        // getToolManual（manualError hook 把 activeTools 收成 ['getToolManual']）等抖动重置计数，
        // 导致兜底永不触发、模型空手收尾 → generateCalls=0 报「未发起任何计划生成」。
        // 改判据：情境已读、尚未发起过 generatePlanBatch 时，若模型这一轮试图「空手或 done 收尾」就拦回；
        // 旁白/取料/查手册等有工具调用的合法中间步一律放行；不设 3 轮上限，靠 20 分钟硬超时兜底。
        if (directorMode) {
          if (hasModelToolCall(event, 'generatePlanBatch')) {
            generatedAnyPlan = true
            return undefined
          }
          if (!scenarioReadDone || generatedAnyPlan) return undefined
          const wrappingUpEmptyHanded = (event.modelToolCalls?.length ?? 0) === 0
            || event.modelMessage?.parsed?.done === true
          if (!wrappingUpEmptyHanded) return undefined
          return buildDirectorMissingGeneratePlanBatchRepair()
        }
        const requiresGeneratePlanBatch = event.activeTools.includes('generatePlanBatch') && !event.activeTools.includes('reviewPlanCandidates')
        if (!requiresGeneratePlanBatch) {
          missingGeneratePlanBatchRounds = 0
          return undefined
        }
        if (hasModelToolCall(event, 'generatePlanBatch')) {
          missingGeneratePlanBatchRounds = 0
          return undefined
        }
        missingGeneratePlanBatchRounds += 1
        return buildMissingGeneratePlanBatchRepair(missingGeneratePlanBatchRounds)
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.planGenerationResult,
      lifecycle: 'afterToolResult',
      priority: 20,
      appliesTo: { toolName: 'generatePlanBatch', stage: 'plan-generation', status: 'success' },
      run: ({ toolCall, toolResult }) => {
        invalidArgsRounds = 0
        lastInvalidArgsTurn = -1
        return handlePlanGenerationSuccess(toolCall?.args ?? {}, requireToolResult(toolResult), generationFailures, singlePlanOnly)
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.planGenerationError,
      lifecycle: 'afterToolResult',
      priority: 30,
      appliesTo: { toolName: 'generatePlanBatch', stage: 'plan-generation', errorType: 'EXPECTATION_MISMATCH' },
      run: ({ toolCall, toolResult }) => handlePlanGenerationMismatch(toolCall?.args ?? {}, requireToolResult(toolResult), generationFailures)
    },
    {
      // 参数校验失败（INVALID_ARGUMENT，如单计划模式 intensities 不为 1）：
      // 没有这条 hook 时该错误既不重试也不终止，模型盲打到回合耗尽后以 generateCalls=0 失败。
      // 不按 stage 过滤：混合 toolCalls 轮里 stage 可能落在 scenario-routing。
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.planGenerationInvalidArgs,
      lifecycle: 'afterToolResult',
      priority: 30,
      appliesTo: { toolName: 'generatePlanBatch', errorType: 'INVALID_ARGUMENT' },
      run: (event) => {
        const result = requireToolResult(event.toolResult)
        if (event.turnIndex !== lastInvalidArgsTurn) {
          lastInvalidArgsTurn = event.turnIndex
          invalidArgsRounds += 1
        }
        const isTerminalFailure = invalidArgsRounds >= 3
        if (isTerminalFailure) {
          return {
            summary: 'generatePlanBatch 参数连续 3 轮校验失败，终止编排。',
            injectMessages: [
              {
                role: 'user',
                purpose: 'error-repair',
                content: `generatePlanBatch 参数已连续 3 轮校验失败，编排失败并终止。最近一次失败原因：${result.error?.message || result.content}`
              }
            ],
            terminate: true
          }
        }
        return {
          summary: `generatePlanBatch 参数校验失败（第 ${invalidArgsRounds}/3 轮），要求修正参数后重试。`,
          injectMessages: [
            {
              role: 'user',
              purpose: 'error-repair',
              content: [
                `generatePlanBatch 参数校验失败：${result.error?.message || result.content}`,
                singlePlanOnly
                  ? '当前为普通召回单计划模式：下一轮只发起一次 generatePlanBatch 原生函数调用，batches 必须恰好 1 项且其 intensities 恰好包含 1 个强度，例如参数 batches=[{"strategy":"steady","strategyLabel":"沉稳回应","intensities":["medium"],"planPrompt":"..."}]、expectation="返回 1 条回复计划"。'
                  : '请修正 batches（每项含 strategy/strategyLabel/intensities/planPrompt，同一次调用内 strategy 唯一）后重试；需要精确格式时先调用 getToolManual。'
              ].join('\n')
            }
          ],
          requestRetry: {
            callId: result.callId,
            toolName: result.toolName,
            errorType: 'INVALID_ARGUMENT',
            reason: 'generatePlanBatch 参数校验失败，需要修正参数。'
          },
          activeTools: ['generatePlanBatch', 'getToolManual']
        }
      }
    },
    {
      id: REPLY_PLAN_AGENT_STAGE_HOOK_IDS.planReviewResult,
      lifecycle: 'afterToolResult',
      priority: 20,
      appliesTo: { toolName: 'reviewPlanCandidates', stage: 'plan-review', status: 'success' },
      run: ({ toolResult }) => handlePlanReviewSuccess(requireToolResult(toolResult))
    }
  ]
}

function requireToolResult(toolResult: ToolResultMessage | undefined): ToolResultMessage {
  if (!toolResult) throw new Error('replyPlanAgent hook 缺少 toolResult')
  return toolResult
}

function hasModelToolCall(event: HookRuntimeEvent, toolName: string): boolean {
  return (event.modelToolCalls ?? []).some((toolCall) => {
    const rawName = String(toolCall.toolName ?? toolCall.tool ?? toolCall.name ?? '').trim()
    return rawName === toolName
  })
}

/** 导演模式生成兜底（用户 2026-06-20 真机修复）：情境已读、还没真正发起 generatePlanBatch，
 *  模型却试图空手/done 收尾时拦回——注入强提醒并 requestRetry 阻止 loop 因空 toolCalls 自然收束。
 *  不 terminate、不收窄 activeTools（导演模式 recommendedTools 已覆盖全部在位工具，效果等同已退役的 openToolGate「全可见」）；
 *  唯一硬停交 20 分钟超时。 */
function buildDirectorMissingGeneratePlanBatchRepair(): HookResult {
  return {
    summary: '导演模式：尚未生成任何候选计划就试图收尾，要求先真正发起 generatePlanBatch。',
    injectMessages: [
      {
        role: 'user',
        purpose: 'error-repair',
        content: [
          '你还没有真正发起 generatePlanBatch——前面 thought 里说的「候选计划已发出 / 在等结果」并不会真的生成计划，因为你没有真正发起 generatePlanBatch 原生函数调用。',
          'generatePlanBatch 是同步工具：必须真正发起它的原生函数调用，它的结果才会在下一轮以 toolResult 返回给你（光在 content 的 thought 里写「已发出」不会执行任何工具）。',
          '现在请立即发起一次 generatePlanBatch 原生函数调用，用 batches 数组一次性带上正文描述的全部反应类别（每项 strategy/strategyLabel/intensities/planPrompt 自拟），并在这份 content JSON 顶层给出 expressionMix；不要再只用文字说「已发出」，也不要在没有任何候选计划时就 done 或收尾。'
        ].join('\n')
      }
    ],
    requestRetry: {
      toolName: 'generatePlanBatch',
      errorType: 'EXPECTATION_MISMATCH',
      reason: '导演模式尚未发起 generatePlanBatch 就试图收尾。'
    }
  }
}

function buildMissingGeneratePlanBatchRepair(failureCount: number): HookResult {
  const isTerminalFailure = failureCount >= 3
  return {
    summary: isTerminalFailure
      ? '候选生成阶段连续 3 轮未发起 generatePlanBatch，终止编排。'
      : `候选生成阶段第 ${failureCount}/3 轮未发起 generatePlanBatch，要求下一轮必须调用。`,
    injectMessages: [
      {
        role: 'user',
        purpose: 'error-repair',
        content: isTerminalFailure
          ? [
              '候选生成阶段已经连续 3 轮没有发起 generatePlanBatch，编排失败并终止。',
              '失败原因：编排器进入候选生成阶段后，没有按协议发出 generatePlanBatch 工具调用。',
              '这不是候选数量不匹配，而是工具调用缺失；必须调整编排器提示词，让它在该阶段先调用 generatePlanBatch，再进入评审或融合。'
            ].join('\n')
          : [
              `候选生成阶段第 ${failureCount}/3 轮没有发起 generatePlanBatch。`,
              '下一轮必须调用 generatePlanBatch，不能直接 done、不能进入 reviewPlanCandidates、不能只输出自然语言计划。',
              'generatePlanBatch 参数必须包含 batches（每项含 strategy、strategyLabel、intensities、planPrompt，一次带全部反应类别）和 expectation；拿到 generatePlanBatch 结果后再根据 hook 校准继续。'
            ].join('\n')
      }
    ],
    requestRetry: {
      toolName: 'generatePlanBatch',
      errorType: 'EXPECTATION_MISMATCH',
      reason: isTerminalFailure
        ? '候选生成阶段连续 3 轮未发起 generatePlanBatch。'
        : '候选生成阶段未发起 generatePlanBatch。'
    },
    activeTools: isTerminalFailure ? [] : ['generatePlanBatch', 'getToolManual'],
    ...(isTerminalFailure ? { terminate: true } : {})
  }
}

function handlePlanGenerationSuccess(
  args: Record<string, unknown>,
  toolResult: ToolResultMessage,
  generationFailures: Map<string, PlanGenerationFailureRecord>,
  singlePlanOnly = false
): HookResult {
  // 合并生成协议：batches 形态取各组强度总数；旧平铺形态沿用 intensities 长度。
  const expectedCount = Array.isArray(args.intensities)
    ? args.intensities.length
    : (Array.isArray(args.batches)
        ? args.batches.reduce((sum: number, group: any) => sum + (Array.isArray(group?.intensities) ? group.intensities.length : 0), 0)
        : undefined)
  const candidateIds = Array.isArray(toolResult.details?.candidateIds)
    ? toolResult.details.candidateIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  const strategy = readStrategy(args, toolResult.details)
  const planPrompt = readPlanPrompt(args, toolResult.details)
  if (expectedCount !== undefined && candidateIds.length !== expectedCount) {
    const failureKey = buildPlanGenerationFailureKey(strategy, planPrompt)
    const record = rememberPlanGenerationFailure(generationFailures, failureKey, args, toolResult, expectedCount, candidateIds.length)
    if (record.count >= 3) {
      return buildPromptAdjustmentAfterRepeatedGenerationFailure(toolResult, record)
    }
    return {
      summary: '候选数量与强度数量不一致，标记为 expectation mismatch。',
      patchToolResult: {
        status: 'error',
        content: `候选数量 ${candidateIds.length} 与强度数量 ${expectedCount} 不一致。`,
        details: {
          ...toolResult.details,
          expectedCandidateCount: expectedCount,
          actualCandidateCount: candidateIds.length
        },
        error: {
          type: 'EXPECTATION_MISMATCH',
          message: `候选数量 ${candidateIds.length} 与强度数量 ${expectedCount} 不一致。`,
          retryable: true,
          details: {
            expectedCandidateCount: expectedCount,
            actualCandidateCount: candidateIds.length
          }
        }
      },
      injectMessages: [
        {
          role: 'user',
          purpose: 'error-repair',
          content: `generatePlanBatch 未满足 expectation：候选数量 ${candidateIds.length} 与强度数量 ${expectedCount} 不一致。请修正 planPrompt/intensities/strategy 后重试。`
        }
      ],
      requestRetry: {
        callId: toolResult.callId,
        toolName: toolResult.toolName,
        errorType: 'EXPECTATION_MISMATCH',
        reason: '候选数量与强度数量不一致。'
      },
      activeTools: ['generatePlanBatch']
    }
  }
  clearGenerationFailure(generationFailures, strategy, planPrompt)
  // singlePlanOnly（normal_recall）：单计划生成成功即编排终点——没有评审阶段，直接收束工具循环，
  // 与人格模型评审成功收束（handlePlanReviewSuccess）保持同一种 terminate 语义。
  if (singlePlanOnly) {
    return {
      summary: '普通召回单计划生成成功，收束编排交给最终回复阶段。',
      patchToolResult: {
        content: '回复计划已生成，编排结束；该计划直接进入最终回复。',
        details: {
          ...toolResult.details,
          expectedCandidateCount: expectedCount,
          actualCandidateCount: candidateIds.length,
          candidateCountByStrategy: strategy ? { [strategy]: candidateIds.length } : {},
          readyForFinalReply: true
        }
      },
      activeTools: [],
      terminate: true
    }
  }
  return {
    summary: '候选生成成功，注入语义校准任务。',
    patchToolResult: {
      content: `候选生成成功：${candidateIds.length} 条候选进入校准。`,
      details: {
        ...toolResult.details,
        expectedCandidateCount: expectedCount,
        actualCandidateCount: candidateIds.length,
        candidateCountByStrategy: strategy ? { [strategy]: candidateIds.length } : {},
        calibrationRequired: true
      }
    },
    injectMessages: [
      {
        role: 'user',
        purpose: 'calibration',
        content: '请先对照 toolCall.expectation 校准候选数量、强度对应关系和正文边界；满足后再进入 reviewPlanCandidates。'
      }
    ],
    activeTools: ['generatePlanBatch', 'reviewPlanCandidates']
  }
}

function handlePlanGenerationMismatch(
  args: Record<string, unknown>,
  toolResult: ToolResultMessage,
  generationFailures: Map<string, PlanGenerationFailureRecord>
): HookResult {
  const details = toolResult.details ?? {}
  const expectedCount = readExpectedCount(args, details)
  const actualCount = readActualCount(details)
  const strategy = readStrategy(args, details)
  const planPrompt = readPlanPrompt(args, details)
  const failureKey = buildPlanGenerationFailureKey(strategy, planPrompt)
  const record = rememberPlanGenerationFailure(generationFailures, failureKey, args, toolResult, expectedCount, actualCount)
  if (record.count >= 3) {
    return buildPromptAdjustmentAfterRepeatedGenerationFailure(toolResult, record)
  }
  return {
    summary: `候选生成数量不符合要求，${record.strategyLabel || record.strategy || '当前类型'} 第 ${record.count}/3 次失败，要求按原提示词重试。`,
    patchToolResult: {
      details: {
        ...details,
        strategy: record.strategy,
        strategyLabel: record.strategyLabel,
        originalPlanPrompt: record.originalPrompt,
        expectedCandidateCount: record.expectedCount,
        actualCandidateCount: record.actualCount,
        failureCount: record.count,
        failureReasons: record.reasons
      }
    },
    injectMessages: [
      {
        role: 'user',
        purpose: 'error-repair',
        content: [
          `generatePlanBatch 未满足数量要求：${toolResult.error?.message || toolResult.content}`,
          `类型：${record.strategyLabel || record.strategy || '未命名类型'}`,
          `期望数量：${record.expectedCount}，实际数量：${formatCount(record.actualCount)}。`,
          `失败次数：${record.count}/3。`,
          '请依照原 planPrompt 重试同一类型，必须返回与 intensities 一一对应的固定数量候选。',
          `原 planPrompt：${record.originalPrompt || '未提供'}`
        ].join('\n')
      }
    ],
    requestRetry: {
      callId: toolResult.callId,
      toolName: toolResult.toolName,
      errorType: 'EXPECTATION_MISMATCH',
      reason: '候选生成数量与该类型声明的固定数量不一致。'
    },
    activeTools: ['generatePlanBatch']
  }
}

function buildPromptAdjustmentAfterRepeatedGenerationFailure(
  toolResult: ToolResultMessage,
  record: PlanGenerationFailureRecord
): HookResult {
  return {
    summary: `${record.strategyLabel || record.strategy || '当前类型'} 候选生成连续 3 次失败，要求编排器调整提示词。`,
    patchToolResult: {
      status: 'error',
      content: `${record.strategyLabel || record.strategy || '当前类型'} 候选生成连续 3 次数量不匹配，必须调整 planPrompt 后再生成。`,
      details: {
        ...toolResult.details,
        strategy: record.strategy,
        strategyLabel: record.strategyLabel,
        originalPlanPrompt: record.originalPrompt,
        expectedCandidateCount: record.expectedCount,
        actualCandidateCount: record.actualCount,
        failureCount: record.count,
        failureReasons: record.reasons,
        requiresPlanPromptAdjustment: true
      },
      error: {
        type: 'EXPECTATION_MISMATCH',
        message: `${record.strategyLabel || record.strategy || '当前类型'} 候选生成连续 3 次数量不匹配，必须调整 planPrompt 后再生成。`,
        retryable: true,
        details: {
          strategy: record.strategy,
          strategyLabel: record.strategyLabel,
          originalPlanPrompt: record.originalPrompt,
          expectedCandidateCount: record.expectedCount,
          actualCandidateCount: record.actualCount,
          failureCount: record.count,
          failureReasons: record.reasons,
          requiresPlanPromptAdjustment: true
        }
      }
    },
    injectMessages: [
      {
        role: 'user',
        purpose: 'error-repair',
        content: [
          'generatePlanBatch 同一类型候选生成已经连续失败 3 次，不能继续用原提示词盲重试。',
          `失败类型：${record.strategyLabel || record.strategy || '未命名类型'}。`,
          `固定数量要求：${record.expectedCount} 条，最近一次实际返回：${formatCount(record.actualCount)} 条。`,
          '三次失败原因：',
          ...record.reasons.map((reason, index) => `${index + 1}. ${reason}`),
          `原 planPrompt：${record.originalPrompt || '未提供'}`,
          '请编排器调整该类型的 planPrompt，明确要求模型输出固定数量、逐条编号、与 intensities 一一对应；调整后再调用 generatePlanBatch。'
        ].join('\n')
      }
    ],
    requestRetry: {
      callId: toolResult.callId,
      toolName: toolResult.toolName,
      errorType: 'EXPECTATION_MISMATCH',
      reason: '同一类型同一提示词已连续 3 次数量不匹配，需要编排器调整提示词。'
    },
    activeTools: ['generatePlanBatch', 'getToolManual']
  }
}

function rememberPlanGenerationFailure(
  generationFailures: Map<string, PlanGenerationFailureRecord>,
  failureKey: string,
  args: Record<string, unknown>,
  toolResult: ToolResultMessage,
  expectedCount: number,
  actualCount: number
): PlanGenerationFailureRecord {
  const details = toolResult.details ?? {}
  const current = generationFailures.get(failureKey)
  const reason = toolResult.error?.message || toolResult.content || '候选生成数量不匹配'
  const record: PlanGenerationFailureRecord = current ?? {
    count: 0,
    reasons: [],
    originalPrompt: readPlanPrompt(args, details),
    strategy: readStrategy(args, details),
    strategyLabel: readStrategyLabel(args, details),
    expectedCount,
    actualCount
  }
  record.count += 1
  record.actualCount = actualCount
  record.expectedCount = expectedCount
  record.reasons.push(reason)
  if (record.reasons.length > 3) record.reasons = record.reasons.slice(-3)
  generationFailures.set(failureKey, record)
  return record
}

function clearGenerationFailure(
  generationFailures: Map<string, PlanGenerationFailureRecord>,
  strategy: string,
  planPrompt: string
): void {
  generationFailures.delete(buildPlanGenerationFailureKey(strategy, planPrompt))
}

function buildPlanGenerationFailureKey(strategy: string, planPrompt: string): string {
  return `${strategy || 'unknown'}::${planPrompt || 'no_prompt'}`
}

/** 合并生成协议：args.batches 形态时把各组字段拼接成摘要（失败追踪 key/文案用）。 */
function readBatchesField(args: Record<string, unknown>, field: 'strategy' | 'strategyLabel' | 'planPrompt', separator: string): string {
  if (!Array.isArray(args.batches)) return ''
  return args.batches
    .map((group: any) => String(group?.[field] ?? group?.[field === 'strategyLabel' ? 'strategy_label' : field === 'planPrompt' ? 'plan_prompt' : field] ?? '').trim())
    .filter(Boolean)
    .join(separator)
}

function readStrategy(args: Record<string, unknown>, details: Record<string, unknown> = {}): string {
  return String(details.strategy ?? args.strategy ?? '').trim() || readBatchesField(args, 'strategy', '+')
}

function readStrategyLabel(args: Record<string, unknown>, details: Record<string, unknown> = {}): string {
  return String(details.strategyLabel ?? args.strategyLabel ?? args.strategy_label ?? '').trim() || readBatchesField(args, 'strategyLabel', '+')
}

function readPlanPrompt(args: Record<string, unknown>, details: Record<string, unknown> = {}): string {
  return String(details.planPrompt ?? details.originalPlanPrompt ?? args.planPrompt ?? args.plan_prompt ?? '').trim() || readBatchesField(args, 'planPrompt', ' ／ ')
}

function readExpectedCount(args: Record<string, unknown>, details: Record<string, unknown> = {}): number {
  const detailCount = Number(details.expectedCandidateCount)
  if (Number.isFinite(detailCount) && detailCount >= 0) return detailCount
  if (Array.isArray(args.intensities)) return args.intensities.length
  if (Array.isArray(args.batches)) {
    return args.batches.reduce((sum: number, group: any) => sum + (Array.isArray(group?.intensities) ? group.intensities.length : 0), 0)
  }
  return 0
}

function readActualCount(details: Record<string, unknown> = {}): number {
  const detailCount = Number(details.actualCandidateCount)
  if (Number.isFinite(detailCount) && detailCount >= 0) return detailCount
  if (Array.isArray(details.candidateIds)) return details.candidateIds.length
  return -1
}

function formatCount(count: number): string {
  return count >= 0 ? String(count) : '未知'
}

function handlePlanReviewSuccess(toolResult: ToolResultMessage): HookResult {
  const topPlanIds = Array.isArray(toolResult.details?.topPlanIds)
    ? toolResult.details.topPlanIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (topPlanIds.length === 0) {
    return {
      summary: '评审成功结果缺少前三计划，要求重试评审。',
      patchToolResult: {
        status: 'error',
        content: 'reviewPlanCandidates 未返回可用于融合的 topPlanIds。',
        error: {
          type: 'EXPECTATION_MISMATCH',
          message: 'reviewPlanCandidates 未返回可用于融合的 topPlanIds。',
          retryable: true
        }
      },
      requestRetry: {
        callId: toolResult.callId,
        toolName: toolResult.toolName,
        errorType: 'EXPECTATION_MISMATCH',
        reason: '缺少可融合的前三计划。'
      },
      activeTools: ['reviewPlanCandidates']
    }
  }
  // 批次4 去融合：评审成功即为编排终点，收束工具循环，把前三计划与表达占比交给最终回复阶段。
  return {
    summary: '评审成功，前三计划与表达占比已就绪，收束工具循环交给最终回复阶段。',
    patchToolResult: {
      content: `评审完成，前三计划可用于最终回复：${topPlanIds.join('、')}`,
      details: {
        ...toolResult.details,
        readyForFinalReply: true
      }
    },
    injectMessages: [
      {
        role: 'user',
        purpose: 'tool-result-context',
        content: '最终回复阶段只读取前三计划、表达占比与必要情境，不得读取候选全集或 ReRanker 分数细节。'
      }
    ],
    activeTools: [],
    terminate: true
  }
}
