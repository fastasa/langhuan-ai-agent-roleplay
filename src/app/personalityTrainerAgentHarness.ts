import type { AgentRuntimeMessage, AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import type { AgentTranscript } from './agentRuntime/types'
import type { ConfirmWriteChannel } from './agentRuntime/interactionContract'
import type { AgentSubagentWaitCapability } from './agentRuntime/subagentWait'
import type { AgentSubagentControlCapability } from './agentRuntime/subagentControl'
import type { AgentTurnStreamController } from './agentTurnStream'
import { runWorkspaceAgentRuntime, type WorkspaceAgentOrchestratorRequest } from './agentHarnessShared'
import { assembleAgentSkillSupply } from './agentSupply'
import { assemblePromptFromSources, type PromptAssemblyTrace } from './promptAssemblyPipeline'
import {
  createPersonalityTrainingAgentTools,
  renderPersonalityTrainingWorkspaceSnapshot,
  type PersonalityTrainingAgentProvider
} from './personalityTrainingAgentTools'
import { renderPersonalityQuestionnaireDesignProtocol } from '../../shared/personalityQuestionnaireDesign'

export const JIANXIN_AGENT_NAME = '鉴心'

export const PERSONALITY_TRAINER_SYSTEM_PROMPT = [
  '你是角色级专业 Agent「鉴心」，负责理解和校准当前角色的人格问卷、角色性格正文、训练、评测和模型版本工作区。你不是总 Agent 星依，也不扮演正在训练的角色。',
  '问卷生成由后台子 Agent「设问」执行。你调用 startPersonalityQuestionnaireGeneration 只是在后台派遣设问，不能把 running 说成完成；用户停止你或关闭工作台不会停止设问。派遣后若还有不依赖设问的核对、整理、预处理或其它 TODO，就继续做；只有确认当前剩余事项全部依赖设问结果时，才调用 waitForSubagentReport 主动静默候报。禁止用 readPersonalityTrainingWorkspace 反复轮询同一个 running 状态。',
  '你拥有当前父会话的子 Agent 控制工具。需要核对时先调用 listSubagents；新要求与当前制卷兼容时用 sendSubagentMessage 在安全边界追加；用户要求停止、缩小题量或新要求会推翻当前任务时，用 interruptSubagent 单独停止设问。停止进入终态后，重新读取正式题数与检查点，把修改后的要求写进 correctionBrief，再调用原派遣工具启动新任务。禁止再声称“没有可用的取消接口”，也禁止把旧 taskId 的晚到结果当作新任务交卷。',
  '收到会话中的【设问后台回报】后，以它和工作区 lastGenerationFailure.diagnostic 为准：成功再推进检查/答题；失败则提炼具体题号、违规规则和改写约束，通过 correctionBrief 重新派遣续跑，不能原样重复一次 resume。',
  '你必须以工具返回的正式数据为准。回答现状先读工作区；改题先用 readFullPersonalityQuestionHistory 全量读取训练题和冻结评测题，再分页读取目标题的答案详情。只读目标题不能替代全量查重；历史变化后必须重新全量读取。写后根据工具的重读核验回执如实报告。',
  '用户要求删题时使用 deletePersonalityTrainingQuestions：可以删除任意现有题，也可以一次删除所有没有人工 confirmed 答案的题。删除人工已确认题不是禁止项，但会连同人工答案一起删除并影响该轮复盘，必须在确认摘要里提醒用户后再执行。',
  '用户没有要求修改时只读回答，不为了表现主动而写入。人工选择优先；没有人工选择时，合法预设答案就是正式默认答案。',
  '生成批量与校准观察窗是两件事：一次设问派遣可以生成任意正整数道题，用户未指定时推荐 20 道；用户明确要 50、100 或其它数量时，必须在一个 startPersonalityQuestionBatch 调用里按原数派遣，不得擅自拆成多次 20 题。正式复盘仍按连续 20 题观察窗推进，末尾不足 20 题只表示该观察窗尚未完整，不阻断后续继续生成。',
  '不要把前后不同自动判成用户答错。先区分“关系远近或处境不同带来的更丰满表现”与“同类情境下真正冲突”；可能矛盾要交给下一轮探针澄清。',
  '如果本轮形成了新的稳定理解，可先用 rewriteCharacterPersonality 整体重写角色 personality 字段，再生成下一轮。正文要短、自然、有弹性；不要追加补丁，不堆条件、边界、例外或性格标签。',
  '口头复盘只是给用户看的分析，不等于代码层复盘完成。用户要复盘且当前 20 题全部人工确认、已经形成结论时，应调用 completePersonalityCalibrationRound 把结论正式记录；这个工具只记录复盘，绝不生成题目。写入成功后必须明确说“正式复盘已记录，本次没有生成题目”。复盘是推荐校准动作，不是继续生成训练题的硬门槛。',
  '用户明确要求“继续生成/再出一批”时，调用 startPersonalityQuestionBatch；questionCount 使用用户明确数量，未指定才用推荐值 20。用户给出总题数目标时，先读取当前正式题数，用“目标总数 - 当前题数”作为本次 questionCount，一次派完剩余数量；不要按 20 题循环派遣。允许在已有未复盘或不足 20 题的观察窗后继续追加，不得为了继续出题伪造复盘。设问成功回报会恢复原 TODO并核对是否达到目标；达到后立即停止，没有明确剩余目标时不得擅自追加。90% 只是鉴心预设命中率的收束提示，不是模型评测准确率或自动停止条件。',
  '冻结评测题不能在首轮提前生成。只有用户明确认为人格已稳定，并且所有已生成轮次都已人工确认和复盘后，才调用 generatePersonalityFrozenEvaluation；它必须以最新角色性格正文和历轮复盘出题。',
  '理解用户对人格的自然语言修正时抓住语义与选择规律，不依赖题面的具体人名、地点或表层词语。新题或改写题必须填写具体 scenarioType、low/medium/high pressureLevel 和 diversityNote；同维度的“情境类型 + 压力程度”组合不能与全量历史重复。批量修改要让同一特质在不同的简单单线情境里自然体现，覆盖深度交给多题综合，不靠单题堆转折，也不能机械复制一句标签。',
  '你可以在长操作中先发一句简短、具体的过程消息给用户看，但发完必须立即调用下一步工具，不能把过程消息当最终答复停住。能在同一个模型回复里附带下一步工具调用时，就同轮调用。',
  '已经开始作答的轮次默认锁定题面和 presetAnswerId；本轮纠正用于下一轮新题，不回改当前轮来抬高命中率。仅当用户明确要求修复具体坏题时，才按精确 1 题处理。',
  '如果用户明确要求重写整轮，即使其中已有人工答案，也先说明旧命中率会失去可比性，再全量读取一次历史，并用 patchPersonalityTrainingQuestions 的 includeAnswered=true 在一次调用中原子提交连续完整 20 题。不得拆成逐题或两个 10 题写入；整轮写入失败时不得把部分题宣称为完成。',
  '任何工具只要返回失败、取消、跳过、running 或部分完成，就不得描述成全部完成。需要继续分批时，说明本批范围和剩余范围。'
].join('\n')

export interface PersonalityTrainerHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface RunPersonalityTrainerAgentInput {
  userText: string
  history?: PersonalityTrainerHistoryMessage[]
  provider: PersonalityTrainingAgentProvider
  callOrchestrator: (request: WorkspaceAgentOrchestratorRequest) => Promise<{ content: string; toolCalls: unknown[] } | null>
  confirmWrite?: ConfirmWriteChannel
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  onIntermediateMessage?: (message: { content: string; turnIndex: number }) => void | Promise<void>
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  initialDeferredActiveTools?: readonly string[]
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  /** 宿主验证设问仍在后台运行且终态会回投当前会话后，才允许鉴心主动静默候报。 */
  subagentWait?: AgentSubagentWaitCapability
  subagentControl?: AgentSubagentControlCapability
  turnStream?: AgentTurnStreamController
  signal?: AbortSignal
  budget?: { maxTurns?: number; maxToolCalls?: number }
}

export interface RunPersonalityTrainerAgentResult {
  reply: string
  terminalReason: string
  transcript: AgentTranscript
  promptAssemblyTrace: PromptAssemblyTrace
}

export async function runPersonalityTrainerAgent(
  input: RunPersonalityTrainerAgentInput
): Promise<RunPersonalityTrainerAgentResult> {
  const userText = String(input.userText || '').trim()
  if (!userText) throw new Error('鉴心用户输入为空，已拒绝启动')
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'personality_trainer.workspace' })
  const snapshot = await input.provider.readSnapshot()
  if (!String(snapshot.characterId || '').trim()) throw new Error('鉴心没有当前角色，已拒绝启动')

  const history = (input.history || []).filter((message) => String(message.content || '').trim())
  const prompt = assemblePromptFromSources({
    mode: 'other',
    policy: { id: 'personality-trainer-workspace-v1', mergeAdjacentSameRole: false },
    sources: [
      {
        id: 'personality_trainer_core',
        title: '鉴心常驻核与工作规范',
        kind: 'manual',
        role: 'system',
        orderIndex: 0,
        content: [PERSONALITY_TRAINER_SYSTEM_PROMPT, skillAssembly.layers['0']].filter(Boolean).join('\n\n')
      },
      {
        id: 'personality_questionnaire_design_protocol',
        title: '人格问卷情境设计协议真值',
        kind: 'manual',
        role: 'system',
        orderIndex: 1,
        content: renderPersonalityQuestionnaireDesignProtocol()
      },
      ...history.map((message, index) => ({
        id: `personality_trainer_history_${index + 1}`,
        title: `鉴心历史 ${index + 1}`,
        kind: 'history' as const,
        role: message.role,
        orderIndex: 10 + index,
        content: message.content
      })),
      {
        id: 'personality_training_workspace_snapshot',
        title: '当前人格训练工作区正式摘要',
        kind: 'personality_context',
        role: 'user',
        orderIndex: 1000,
        content: `【当前人格训练工作区正式摘要】\n${renderPersonalityTrainingWorkspaceSnapshot(snapshot)}`,
        metadata: { characterId: snapshot.characterId }
      },
      {
        id: 'personality_trainer_current_user_input',
        title: '当前用户输入',
        kind: 'current_user_input',
        role: 'user',
        orderIndex: 1001,
        content: `【用户输入】\n${userText}`
      }
    ]
  })
  const messages = prompt.messages.map((message): AgentRuntimeMessage => ({
    role: message.role,
    content: message.content
  }))
  const tools = createPersonalityTrainingAgentTools({
    provider: input.provider,
    confirmWrite: input.confirmWrite
  })
  const result = await runWorkspaceAgentRuntime({
    profileId: 'personality_trainer.workspace',
    skillAssembly,
    agentName: JIANXIN_AGENT_NAME,
    gateId: 'personality-trainer-continuation-gate',
    nudgeActionHint: '读取/核对/修改/训练/评测',
    messages,
    tools,
    callOrchestrator: input.callOrchestrator,
    signal: input.signal,
    onProgress: input.onProgress,
    onIntermediateMessage: input.onIntermediateMessage,
    initialTaskTodo: input.initialTaskTodo,
    initialDeferredActiveTools: input.initialDeferredActiveTools,
    onDeferredActiveToolsChange: input.onDeferredActiveToolsChange,
    onTaskTodoChange: input.onTaskTodoChange,
    subagentWait: input.subagentWait,
    subagentControl: input.subagentControl,
    turnStream: input.turnStream,
    ...(input.budget ? { budget: input.budget } : {})
  })
  return { ...result, promptAssemblyTrace: prompt.trace }
}
