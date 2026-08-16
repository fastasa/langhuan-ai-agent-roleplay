import type {
  AgentTranscript,
  ReplyTaskSchedulerSnapshot,
  ToolCallMessage,
  ToolResultMessage
} from '../agentRuntime/types'

const readScenarioCall: ToolCallMessage<{ code: string }> = {
  kind: 'toolCall',
  callId: 'call_read_scenario_001',
  toolName: 'readScenarioSkill',
  stage: 'scenario-routing',
  args: { code: 'pressure' },
  expectation: '读取 pressure 情境正文，确认包含反应类别、强度档和候选生成要求。',
  requestedAtTurn: 0
}

const readScenarioResult: ToolResultMessage<{ scenarioCode: string; bodyContains: string[] }> = {
  kind: 'toolResult',
  callId: readScenarioCall.callId,
  toolName: readScenarioCall.toolName,
  stage: readScenarioCall.stage,
  status: 'success',
  content: 'pressure 情境正文已读取：包含 aggressive / defensive / freeze / avoid 四类反应与 low / medium / high 三档。',
  details: {
    scenarioCode: 'pressure',
    bodyContains: ['aggressive', 'defensive', 'freeze', 'avoid', 'low', 'medium', 'high']
  }
}

const generateCall: ToolCallMessage<{
  strategy: string
  strategyLabel: string
  intensities: string[]
  planPrompt: string
}> = {
  kind: 'toolCall',
  callId: 'call_generate_aggressive_001',
  toolName: 'generatePlanBatch',
  stage: 'plan-generation',
  args: {
    strategy: 'aggressive',
    strategyLabel: '进攻性',
    intensities: ['low', 'medium', 'high'],
    planPrompt: '压力下生成进攻性反应计划，分别体现低中高三档；只写第三视角行动计划，不写完整台词。'
  },
  expectation: '返回 3 条非空候选计划，强度与 low / medium / high 一一对应，正文不包含完整台词。',
  requestedAtTurn: 1
}

const generateResult: ToolResultMessage<{ candidateIds: string[]; strategy: string }> = {
  kind: 'toolResult',
  callId: generateCall.callId,
  toolName: generateCall.toolName,
  stage: generateCall.stage,
  status: 'success',
  content: '进攻性已生成 3 条候选：aggressive_low、aggressive_medium、aggressive_high。',
  details: {
    strategy: 'aggressive',
    candidateIds: ['aggressive_low', 'aggressive_medium', 'aggressive_high']
  }
}

const reviewCall: ToolCallMessage<{ candidateIds: string[] }> = {
  kind: 'toolCall',
  callId: 'call_review_001',
  toolName: 'reviewPlanCandidates',
  stage: 'plan-review',
  args: { candidateIds: ['aggressive_low', 'aggressive_medium', 'aggressive_high'] },
  expectation: '返回全部候选的有限数值原始分，并给出可直接交给最终回复阶段的前三计划。',
  requestedAtTurn: 2
}

const reviewResult: ToolResultMessage<{ scoredCandidateCount: number; topPlanIds: string[]; readyForFinalReply: boolean }> = {
  kind: 'toolResult',
  callId: reviewCall.callId,
  toolName: reviewCall.toolName,
  stage: reviewCall.stage,
  status: 'success',
  content: '评审完成，前三计划可用于最终回复：aggressive_medium、aggressive_low、aggressive_high。',
  details: {
    scoredCandidateCount: 3,
    topPlanIds: ['aggressive_medium', 'aggressive_low', 'aggressive_high'],
    readyForFinalReply: true
  }
}

export const REPLY_PLAN_AGENT_BATCH0_SCHEDULER_FIXTURE: ReplyTaskSchedulerSnapshot = {
  kind: 'replyTaskScheduler',
  boundary: 'outside-agent-runtime',
  note: '发送、编辑重跑、角色重试先统一产生 ReplyTask；单个 ReplyTask 内部才进入 AgentRuntime。',
  tasks: [
    {
      id: 'reply_task_new_message_001',
      source: 'new-user-message',
      sessionId: 'session_001',
      anchorMessageId: 'user_message_001',
      targetCharacterId: 'character_xingyi'
    },
    {
      id: 'reply_task_retry_001',
      source: 'role-message-retry',
      sessionId: 'session_001',
      anchorMessageId: 'user_message_001',
      targetCharacterId: 'character_xingyi'
    }
  ]
}

export const REPLY_PLAN_AGENT_BATCH0_TRANSCRIPT_FIXTURE: AgentTranscript = {
  kind: 'agentTranscript',
  agentName: 'ReplyPlanAgent',
  runtimeVersion: 'batch0-protocol-draft',
  initialActiveTools: ['readScenarioSkill'],
  history: [
    { kind: 'chat', role: 'user', content: '开始一次回复计划 Agent 任务。' },
    {
      kind: 'modelMessage',
      role: 'assistant',
      content: '判断为 pressure，先读取情境正文。',
      parsed: { scenario: 'pressure' }
    },
    readScenarioCall,
    readScenarioResult,
    {
      kind: 'modelMessage',
      role: 'assistant',
      content: '根据 pressure 正文生成进攻性候选，并给出本轮表达占比。',
      parsed: { scenario: 'pressure', expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 } }
    },
    generateCall,
    generateResult,
    {
      kind: 'modelMessage',
      role: 'assistant',
      content: '候选满足预期，进入评审。',
      parsed: { scenario: 'pressure' }
    },
    reviewCall,
    reviewResult
  ],
  terminalReason: 'terminated-by-hook',
  budget: {
    maxTurns: 6,
    maxToolCalls: 9,
    usedTurns: 3,
    usedToolCalls: 3,
    maxHookInjectedTokens: 1200,
    usedHookInjectedTokens: 220
  },
  turns: [
    {
      turnIndex: 0,
      stage: 'scenario-routing',
      activeTools: ['readScenarioSkill'],
      modelMessage: {
        kind: 'modelMessage',
        role: 'assistant',
        content: '判断为 pressure，先读取情境正文。',
        parsed: { scenario: 'pressure' }
      },
      toolCalls: [readScenarioCall],
      toolResults: [readScenarioResult],
      hookEvents: [
        {
          kind: 'hookEvent',
          id: 'replyPlan.skillRead.afterResult',
          lifecycle: 'afterToolResult',
          stage: 'scenario-routing',
          toolName: 'readScenarioSkill',
          callId: readScenarioCall.callId,
          priority: 20,
          effects: ['patchToolResult', 'setActiveTools', 'injectMessage', 'writeTrace'],
          summary: '清洗情境正文，下一轮只开放 generatePlanBatch。'
        }
      ],
      nextTurnPatches: [
        {
          kind: 'nextTurnPatch',
          id: 'patch_after_read_scenario_001',
          sourceHookId: 'replyPlan.skillRead.afterResult',
          stage: 'plan-generation',
          activeTools: ['generatePlanBatch'],
          injectMessages: [
            {
              role: 'user',
              purpose: 'stage-instruction',
              content: '已读取 pressure 情境正文；下一轮只能基于当前情境正文调用 generatePlanBatch。'
            }
          ]
        }
      ]
    },
    {
      turnIndex: 1,
      stage: 'plan-generation',
      activeTools: ['generatePlanBatch'],
      modelMessage: {
        kind: 'modelMessage',
        role: 'assistant',
        content: '根据 pressure 正文生成进攻性候选，并给出本轮表达占比。',
        parsed: { scenario: 'pressure', expressionMix: { action: 40, dialogue: 35, expression: 20, innerState: 5, narration: 0 } }
      },
      toolCalls: [generateCall],
      toolResults: [generateResult],
      hookEvents: [
        {
          kind: 'hookEvent',
          id: 'replyPlan.planGeneration.afterResult',
          lifecycle: 'afterToolResult',
          stage: 'plan-generation',
          toolName: 'generatePlanBatch',
          callId: generateCall.callId,
          priority: 30,
          effects: ['patchToolResult', 'injectMessage', 'writeTrace'],
          summary: '只保留候选 ID、类别、强度和校准任务。'
        }
      ],
      nextTurnPatches: [
        {
          kind: 'nextTurnPatch',
          id: 'patch_after_generate_001',
          sourceHookId: 'replyPlan.planGeneration.afterResult',
          stage: 'plan-review',
          activeTools: ['reviewPlanCandidates'],
          injectMessages: [
            {
              role: 'user',
              purpose: 'calibration',
              content: '先对照 expectation 判断候选数量、强度和正文边界是否满足预期；满足后调用 reviewPlanCandidates。'
            }
          ]
        }
      ]
    },
    {
      turnIndex: 2,
      stage: 'plan-review',
      activeTools: ['reviewPlanCandidates'],
      modelMessage: {
        kind: 'modelMessage',
        role: 'assistant',
        content: '候选满足预期，进入评审。',
        parsed: { scenario: 'pressure' }
      },
      toolCalls: [reviewCall],
      toolResults: [reviewResult],
      hookEvents: [
        {
          kind: 'hookEvent',
          id: 'replyPlan.planReview.afterResult',
          lifecycle: 'afterToolResult',
          stage: 'plan-review',
          toolName: 'reviewPlanCandidates',
          callId: reviewCall.callId,
          priority: 20,
          effects: ['patchToolResult', 'injectMessage', 'setActiveTools', 'terminate', 'writeTrace'],
          summary: '评审成功即终点（批次4 去融合）：收束工具循环，把前三计划与表达占比交给最终回复阶段。'
        },
        {
          kind: 'hookEvent',
          id: 'runtime.afterTurn.trace',
          lifecycle: 'afterTurn',
          stage: 'final-reply-prep',
          priority: 100,
          effects: ['writeTrace'],
          summary: '写入结构化 transcript，不再把文本工具结果当主协议。'
        }
      ],
      nextTurnPatches: [
        {
          kind: 'nextTurnPatch',
          id: 'patch_after_review_001',
          sourceHookId: 'replyPlan.planReview.afterResult',
          stage: 'final-reply-prep',
          activeTools: [],
          injectMessages: [
            {
              role: 'user',
              purpose: 'tool-result-context',
              content: '最终回复阶段只读取前三计划、表达占比与必要情境，不得读取候选全集或 ReRanker 分数细节。'
            }
          ],
          terminate: true
        }
      ]
    }
  ]
}
