/**
 * 提调「纠偏三策统一」导演 loop —— 提调真·导演 loop 重构计划书 批次 P2。
 *
 * 把「给提调一条纠偏」升级为提调自主按 上→中→下 择优的**统一**纠偏 loop（替代「纠偏续跑只会走下策重排」）：
 *   - 上策（最省）：直接精改原文（M2 readChatMessage + M3 editChatMessage）——情境/方向都对、只改字句措辞。
 *   - 中策（其次）：改这条消息的**提示词**（P1 readMessagePrompt + editMessagePrompt）——改原文不够、情境没错、
 *     只要调这条消息的生成方向/要点；改完由**正常最终回复模型**据新提示词重生成（重生成接缝 P3 注入，
 *     本 loop 只负责提调改提示词文本；P2 缺省不注册重生成工具，改完即收束交 pipeline 重生成）。
 *   - 下策（最贵）：escalateCorrection 升级信号——连情境都判错，整轮要重判情境重排，交系统现役 replan 链路。
 *
 * 系统协议**软引导**「从最省的够用方案开始自己选」（非硬路由）；提调可在 thought 里解释为何升级到中/下策。
 *
 * 本 loop **不写库、不调正常回复模型**（除非 P3 注入重生成接缝）：收束后据提调实际落在哪一策返回三类终态之一——
 *   - direct-edit：上策原文改动（edits），pipeline/ops 作新版本写回（复用 versionList，可回滚）；
 *   - prompt-regen：中策提示词改动（promptEdits）+（可选 in-loop）重生成结果（regenerations），
 *     pipeline 据新提示词用正常回复模型重生成 + 新版本写回；
 *   - escalate：下策升级信号（escalation.reason），pipeline 路由到现役 regenerateAssistantViaDirector/replan。
 *
 * 软停/超时：与精修 loop 同口径——signal aborted / paused-for-correction / timeout → fail 累加器并抛 AbortError/超时错误，
 * 交上层挂起纠偏（复用 J/K 链路）。
 *
 * 【R1-B B5-2 item1 真合并·单一编辑入口（用户 2026-06-28 拍板）】本 loop 现在是琅嬛唯一的「编辑 loop」：
 *   - 默认（precisionOnly 缺省/false）= 纠偏三策择优（上策改原文 / 中策改提示词重生成 / 下策升级重排 + 新增旁白 + 没把握先问）。
 *   - precisionOnly:true = 「锚定精修」子模式——退役的 runTidiaoPrecisionEditLoop 整体并入这里：只读改原文+投影、用精修协议、
 *     收尾按精修语义（无改动即失败抛错，不走 chat-only/strategy 择优），不装配提示词/重生成/escalate/askUser/旁白能力
 *     （它们经 B3 门控自动隐藏+不可调）。精修 bar 的 pipeline 入口改路由到本 loop（precisionOnly:true）。
 * 边界：两子模式共用 M2/M3 工具与累加器；所有精修分支都 gated 在 precisionOnly 后，纠偏链路逐字不受影响（零回归）。
 */

import { runAgentRuntime, type AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import { HookRegistry } from './agentRuntime/hookRegistry'
// 接缝重构（2026-06-30）：单一全局 registry 单例（TIDIAO_GLOBAL_TOOL_REGISTRY）已退役（见 tidiaoGlobalTools.ts 顶部退役说明），
// 本 loop 改按「当轮接缝在位与否」调工厂各自 new 自己的 ToolRegistry（工厂定义集中 tidiaoGlobalTools.ts，见其工厂清单）；
// 工具名常量（escalate/regenerate/askUser·canonical 家在此）+ TIDIAO_BUSINESS_FIELD（B3 能力 token）仍按名引用。
// 运行时为「correctionLoop→globalTools」单向值依赖；globalTools→correctionLoop 只 import type（编译期擦除）·无运行时环。
import {
  // 接缝重构（2026-06-30）：工具从「运行时读 ctx.business」改「工厂闭包捕获 context」——本 loop 启动时调工厂建自己的工具集。
  createReadChatMessageTool,
  createEditChatMessageTool,
  createAppendChatMessageTool,
  createReadMessagePromptTool,
  createEditMessagePromptTool,
  createReadMessageProjectionTool,
  createReprojectMessageTool,
  createEscalateCorrectionTool,
  createAskUserTool,
  createResumeOrchestrationTool,
  createRegenerateFromPromptTool,
  createUpdateCurtainSceneTool,
  createReadNarrationSkillTool,
  createConfirmNarrationCallTool,
  createReviseNarrationDirectionTool,
  createAddCastDirectionTool,
  createRegenerateCastFromDirectionsTool,
  createReviseCastDirectionTool,
  createConsultScriptTool,
  createReadStatusPanelsTool,
  createUpdateStatusPanelTool,
  createDispatchMapWorkTool,
  createRetryFailedWorkflowTool,
  // 批次1（2026-07-07 范式优化）：无动作硬门 acted 改语义表推导（isTidiaoToolResultActed）+
  // 工具集建 registry 前过语义表登记护栏（assertTidiaoToolMutationSemanticsRegistered·漏登记=启动即抛）。
  isTidiaoToolResultActed,
  assertTidiaoToolMutationSemanticsRegistered,
  TIDIAO_REGENERATE_CAST_FROM_DIRECTIONS_TOOL_NAME,
  TIDIAO_CONSULT_SCRIPT_TOOL_NAME,
  TIDIAO_ESCALATE_CORRECTION_TOOL_NAME,
  TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME,
  TIDIAO_ASK_USER_TOOL_NAME,
  TIDIAO_RESUME_ORCHESTRATION_TOOL_NAME,
  TIDIAO_UPDATE_CURTAIN_SCENE_TOOL_NAME,
  TIDIAO_RETRY_FAILED_WORKFLOW_TOOL_NAME,
  TIDIAO_READ_STATUS_PANELS_TOOL_NAME,
  TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME,
  TIDIAO_DISPATCH_MAP_WORK_TOOL_NAME
} from './tidiaoGlobalTools'
import { createSearchAppendLogTool } from './agentState/searchAppendLogTool'
import { ToolRegistry, type ToolDefinition } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply, resolveAgentRuntimeToolSupply } from './agentSupply'
// 工具名常量 canonical 家已迁 tidiaoGlobalTools；本文件 re-export 保持对外 API 不变（spec 等仍 import 自本模块）。
export { TIDIAO_ESCALATE_CORRECTION_TOOL_NAME, TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME, TIDIAO_ASK_USER_TOOL_NAME }
import { feedAppendLogFromFidelityEvent } from './agentState/appendLogFeed'
// option C（2026-07-01·发送时留存真实 prompt）：拼好 messages 后把真实 prompt 存进活动 log，供查看器「喂模型原文」忠实显示。
// 真机六验·同轮互通（2026-07-05）：getAppendLogEvents 取活动容器保真事件（管线已 restore 基线）回放进层5。
import { getAppendLogEvents, renderDirectorPromptText, setActiveDirectorPrompt } from './agentState/appendLog'
// U5：纠偏导演补提调知识库注入，与轮级提调 runGroupDirectorHarness 口径一致。
// 批次O（2026-07-03·纠偏并入统一 0-6）：知识库 2.0 速览索引改由层1 承载（与统筹 harness 同口径·层0 知识块 includeEnvIndex:false）。
import {
  buildTidiaoKnowledgeInjection,
  buildTidiaoKnowledgeIndex,
  matchTidiaoEnvironmentManualSelectors
} from './agentKnowledge/tidiaoKnowledge'
// 剧情倾向（倾向迁移批次1 后=执行层保留注入）：纠偏/精修直接改消息内容需要基调，空则零注入。
import { renderDirectorPrefBlock } from './orchestrationMaterialPresentation'
import type { AgentTranscript } from './agentRuntime/types'
import {
  createTidiaoDirectorStreamAccumulator,
  type TidiaoDirectorStreamAccumulator
} from './tidiaoDirectorStreamAccumulator'
import type { TidiaoDirectorStream, TidiaoPrecisionEditBrief, TidiaoStreamShotInput } from './tidiaoDirectorStream'
import { parseChatFloorRefs, type ChatFloorRef, type ChatFloorRefKind } from './chatMessageFloor'
import type { TidiaoChatMessageReadContext } from './tidiaoChatMessageTools'
import type {
  TidiaoChatMessageEditCommit,
  TidiaoChatMessageEditContext
} from './tidiaoChatMessageEditTools'
import type {
  TidiaoMessagePromptContext,
  TidiaoMessagePromptEditCommit
} from './tidiaoMessagePromptTools'
import type {
  TidiaoMessageProjectionContext,
  TidiaoReprojectTarget
} from './tidiaoMessageProjectionTools'
import {
  buildDirectorNarrationSkillGuide,
  // R1-B B5-2 item2c：旁白两件套解耦——工具定义已迁全局 tidiaoGlobalTools，本 loop 改用 buildNarrationBusinessContext 装配 ctx.business.narration。
  buildNarrationBusinessContext,
  type PersonalityNarrationCall,
  type PersonalityNarrationSubagentProfile
} from './personalityNarrationSubagent'
// R1-B 门槛1：工具 execute 从「闭包捕获当轮接缝/累加器」改为「读 ctx.business」（断言成提调业务上下文聚合接口）。
import type { TidiaoNarrationContext, TidiaoRetryContext, TidiaoDecisionContext, TidiaoScriptContext, TidiaoStatusSystemToolContext, TidiaoMapWorkDispatchContext } from './tidiaoToolBusinessContext'
// 剧本（2026-07-07·提调框改剧本）：剧本类型（字段一览已随批次4「用法沉工具」只留 consultScript brief，纲领不再引用）。
// H2（2026-07-04·纠偏升 0-6）：层5 操作日志/层4 已读资料共享收集器（与统筹 harness 同一套）+ 层标题/协议句真值 +
// 层6 渲染。groupDirectorPass 不反向 import 本模块（值单向），无运行时环。
import { DIRECTOR_ROUND_LOG_SECTION_TITLE, createDirectorRoundLogCollector } from './directorRoundLog'
// 层0 任务化（2026-07-05 用户拍板·取代批次O「user 侧注入块」）：纠偏/精修轮 system 层0 =
// 知识库（身份/口吻·不带统筹能力清单）+ **本任务专属纲领**（buildTidiaoCorrectionDirectiveBlock /
// buildTidiaoPrecisionEditDirectiveBlock）+ 编排倾向——统筹那份决策主纲领（判情境→finishRound）整段撤出纠偏轮，
// 不再把任务纲领拼在 user 侧层6 之后（真机复现：模型读完统筹纲领+全勾 todo 误判「已完成」提前收束）。
// 层1 仍用统筹同一渲染器出本轮真注册工具清单（能力真值）。
import {
  DIRECTOR_LAYER_HEADER,
  renderDirectorCallableToolsBlock,
  // 批D·D1（2026-07-12·装配合一）：assembleGroupDirectorMessages 是唯一装配真值，本文件的开局装配/
  // 重建装配（原手抄同构版 assembleRebuiltCorrectionMessages）全部改调它，见各自调用处注释。
  // DIRECTOR_READ_MATERIALS_GUIDE 不再需要本文件直接引用（层4 段落拼装已收进共享函数内部）。
  assembleGroupDirectorMessages,
  DIRECTOR_LOOP_TIMEOUT_MS
} from './groupDirectorPass'
// 帷幕修改工具（updateCurtainScene）接缝领域类型——纠偏 loop 据 input.updateCurtainScene 装配 business.curtainScene。
// import type 仅类型层、编译期擦除，与 replyPlanOrchestratorHarness 不构成运行时循环。
import type { ReplyPlanCurtainSceneUpdateToolCall, ReplyPlanCurtainSceneUpdateResult } from './replyPlanOrchestratorHarness'

/** 纠偏 loop 放开步数/调用上限，唯一硬停=20 分钟超时（与导演 loop 同口径·真值见 DIRECTOR_LOOP_TIMEOUT_MS）。 */
const CORRECTION_UNLIMITED = 1_000_000

const ABORTED_MESSAGE = '提调纠偏已取消'

function createAbortedError(): Error {
  const error = new Error(ABORTED_MESSAGE)
  error.name = 'AbortError'
  return error
}

/** 提调本轮纠偏落在哪一策。Q3 新增 'create-narration'（写一段本轮还没有的新旁白）。
 *  R1-A 新增 'chat-only'（提调判断用户这一轮只是提问/闲聊·不需要改任何消息 → 直接回答收尾）：
 *  这是「提调栏输入进决策流让提调自主决策」的合法决策结果之一（拍板②），不是失败——
 *  根治 P14：协议(:318-324)早已让提调对提问直接回答，但旧终态分类器把「没做纠偏动作」误判失败抛错、
 *  上层弹误导红字（与 P25 同族·终态层误判）。提调回答经决策流 thought 呈现（累加器 :274 已收）。
 *  注意：strategy 只是「主策」标签；narrationCreations 作为顶层结果可与上/中策并存
 *  （既改角色字句又加旁白时 strategy 仍标上策，narrationCreations 照样返回，由 ops 各自落地）。 */
/** 2026-07-08 新增 'resume-orchestration'（续回统筹·停止=中断保留闭环）：用户要求继续被中断的统筹轮且需要
 *  统筹阶段能力时，提调调 resumeOrchestration → loop 收尾返回本策，pipeline 仿 escalate 整轮范式带保留上下文
 *  重进统筹续做剩余部分（不删已有消息）。 */
export type TidiaoCorrectionStrategy = 'direct-edit' | 'prompt-regen' | 'escalate' | 'create-narration' | 'create-cast' | 'ask-user' | 'chat-only' | 'resume-orchestration'

/** 下策升级信号（提调判定情境判错、要整轮重判重排）。 */
export interface TidiaoCorrectionEscalation {
  /** 提调给出的升级原因（人话，pipeline 转交 replan 时可带上）。 */
  reason: string
}

/** 续回统筹信号（2026-07-08）：提调判定用户要继续被中断的统筹轮（instruction=续接补充指令·空串=纯继续）。 */
export interface TidiaoCorrectionResume {
  instruction: string
}

/** 批次B「没把握先问用户」：提调拿不准时发起的提问（问题 + 带推荐的选项），交上层进「提问态」等用户答复。 */
export interface TidiaoCorrectionAskUser {
  /** 一句人话的问题。 */
  question: string
  /** 给用户的 2~4 个具体可选项（可空）。 */
  options: string[]
  /** 提调最推荐的选项 + 一句理由（可空）。 */
  recommended?: string
}

/** 中策 in-loop 重生成请求（P3 注入接缝据此调正常回复模型；request 带该消息当前提示词工作副本）。 */
export interface TidiaoCorrectionRegenRequest {
  ref: string
  kind: ChatFloorRefKind
  index: number
  messageId: number
  speakerName: string
  /** 该消息当前提示词（已含本轮 editMessagePrompt 的改动）。 */
  promptText: string
}

/** 中策 in-loop 重生成结果（接缝产出的新正文）。 */
export interface TidiaoCorrectionRegenResult {
  content: string
}

/** 中策 in-loop 重生成的一条记录（pipeline 收束后可直接作新版本写回，免再重生成一次）。 */
export interface TidiaoCorrectionRegeneration {
  ref: string
  kind: ChatFloorRefKind
  index: number
  messageId: number
  speakerName: string
  content: string
}

/** Q3 新旁白插入位置（由提调自己决定）：缺省由 pipeline 接缝兜底（插在轮锚点＝被纠偏消息前·铺场）。 */
export interface TidiaoCorrectionNarrationPlacement {
  /** 插在该 messageId 之后（提调用「角色N/旁白M」楼层引用指定时由 loop 解析得到）；缺省=接缝默认。 */
  insertAfterMessageId?: number
}

/** Q3 新旁白生成接缝（pipeline 注入）：据提调确认的旁白调用 + 插入位置生成旁白正文并写库。 */
export interface TidiaoCorrectionNarrationResult {
  content: string
  messageId?: number
}

/** Q3 新旁白创建记录（loop 收尾据 kit.calls 调接缝生成；ops 据此刷新列表，正文已由接缝写库）。 */
export interface TidiaoCorrectionNarrationCreation {
  content: string
  messageId?: number
  profileId: string
  profileName: string
  narrationKind: PersonalityNarrationCall['narrationKind']
  informationBearing: boolean
  placement: TidiaoCorrectionNarrationPlacement
}

/** 2026-07-06（用户拍板「统筹工具给纠偏」）：纠偏轮生成的新角色消息（addCastDirection 定方向 → 收尾经 castSeam 生成）。 */
export interface TidiaoCorrectionCastCreation {
  characterId: string
  speakerName: string
  direction: string
  /** 生成是否成功（失败不炸整轮纠偏，逐条记结果）。 */
  ok: boolean
  message?: string
  messageId?: number
}

/** 2026-07-06：纠偏轮「生成新角色消息」接缝（与 Q3 旁白 generateNarration 同范式）——
 *  candidates=会话成员候选（addCastDirection 校验/回执用）；generate=对每条已定方向用正常角色链路生成一条新消息
 *  （管线实现=runSingleChat + 方向注入，与统筹分镜同一生成路）。精修子模式不挂。 */
export interface TidiaoCorrectionCastSeam {
  candidates: Array<{ characterId: string; name: string }>
  /** 上一轮已经排好的角色方向；供缺消息时定点复用，不经重新规划。 */
  priorDirections?: Array<{ characterId: string; name: string; direction: string }>
  generate: (entry: { characterId: string; direction: string; label: string }) => Promise<{ ok?: boolean; message?: string; messageId?: number }>
}

export interface TidiaoCorrectionLoopInput {
  /** 纠偏 brief：instruction（用户这次的纠偏指令）+ targets（当前在屏消息楼层/说话人/原文，供提调锚定）。 */
  brief: TidiaoPrecisionEditBrief
  /** 读会话消息接缝（M2）：上策锚定 oldText / 理解目标原文。 */
  readContext: TidiaoChatMessageReadContext
  /** 锚定精修接缝（M3）：上策在内存工作副本上改原文，累积改动。 */
  editContext: TidiaoChatMessageEditContext
  /** 读/改提示词接缝（P1）：中策在提示词工作副本上 str_replace，累积改动。
   *  R1-B B5-2 item1：纠偏模式必传；precisionOnly 精修子模式不需要（缺省=不挂中策提示词能力）。 */
  promptContext?: TidiaoMessagePromptContext
  /**
   * 读/重投投影接缝（2026-06-21）：上策改原文后，提调判断投影是否过时→标记重投。
   * 缺省=不挂投影工具（向后兼容旧调用/测试，零回归）；存在则注册 readMessageProjection / reprojectMessage 两件套，
   * 收束后由 collectReprojectTargets 取标记目标，交 pipeline/ops 写回 DB 后重跑投影生成。
   * 与精修 loop 共用同一接缝模块 {@link ./tidiaoMessageProjectionTools}，两处属联动能力。
   */
  projectionContext?: TidiaoMessageProjectionContext
  /** 中策重生成接缝（P3 注入正常最终回复模型）：提调调 regenerateFromPrompt 时据该消息当前提示词重生成新正文。
   *  缺省（P2）不注册重生成工具——中策改完提示词即收束，由 pipeline 收束后据 promptEdits 重生成。 */
  regenerateFromEditedPrompt?: (
    request: TidiaoCorrectionRegenRequest
  ) => Promise<TidiaoCorrectionRegenResult> | TidiaoCorrectionRegenResult
  /** 改帷幕时间/地点/天气接缝（2026-06-29）：用户在纠偏栏明确要求改帷幕（如「把帷幕时间改到下午三点」）时，
   *  提调调 updateCurtainScene → 由本接缝写当前会话帷幕真值。缺省=不装配帷幕能力（updateCurtainScene 经 B3 门控隐藏+不可调）。
   *  与回复编排 loop 共用同一工具定义（全局池），但纠偏 loop 不限元工具预算、不留 state.curtainSceneUpdate。 */
  updateCurtainScene?: (
    call: ReplyPlanCurtainSceneUpdateToolCall
  ) => Promise<ReplyPlanCurtainSceneUpdateResult> | ReplyPlanCurtainSceneUpdateResult
  /** Q3 旁白接缝：本会话可用旁白 skill profiles（需已 normalize）。与 generateNarration 同时提供才纳入旁白能力——
   *  注册 readNarrationSkill+confirmNarrationCall、协议加「新增旁白」段，让提调能写新旁白提示词。缺省=不注册、零回归。 */
  narrationProfiles?: PersonalityNarrationSubagentProfile[]
  /** Q3 旁白：本轮最多新增几条旁白（钳到 1~3，缺省 2）。 */
  narrationMaxCalls?: number
  /** Q3 新旁白生成接缝（pipeline 注入正常旁白链路）：据提调确认的旁白调用 + 插入位置生成旁白正文并写库。
   *  与 narrationProfiles 同时提供才生效；loop 收尾对每条 confirmNarrationCall 调一次，结果落 narrationCreations。 */
  generateNarration?: (
    call: PersonalityNarrationCall,
    placement: TidiaoCorrectionNarrationPlacement
  ) => Promise<TidiaoCorrectionNarrationResult> | TidiaoCorrectionNarrationResult
  /** 调编排模型出每轮 JSON（{ thought, toolCalls, done }）；由 pipeline 用现役模型调用基建提供。 */
  callModel: (request: {
    // role 含 'tool'：runtime 原生感知回灌会把工具结果以 role:'tool' 消息喂回（批3 接原生时实际产出）。
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    history: unknown[]
    activeTools: string[]
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    // R1-B item7：deferred 模式全局可搜目录——pipeline callModel 据此渲染 toolsearch 越权话术进协议。
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
    turnIndex: number
    toolEpoch: number
    toolEpochTurnIndex: number
  }) => Promise<unknown> | unknown
  signal?: AbortSignal
  /** 软停（停止→纠偏）：每轮起点检查，true 即步骤边界干净收束。 */
  shouldPause?: () => boolean
  /** 提调带跨轮记忆（2026-06-22）：本条带子至今的历史摘要——历次用户指令、读过/改过哪些楼层、改成什么、报错、
   *  上一轮提问与用户答复。由 pipeline 据已落库 carryOver 用 renderTidiaoBandMemory 渲染后注入；
   *  缺省/空串=首次纠偏无历史，不加记忆块（行为同旧、零回归）。让「一个提调带 = 一次有记忆的会话」。 */
  bandMemory?: string
  /** 统一 Agent 原始可见上下文。存在时替代本 loop 自行拼装的场景、可见历史与上轮情境块；
   *  旧字段仅保留给尚未迁移的兼容调用，不能与本块同时注入模型。 */
  agentContextBlock?: string
  /** 会话剧情倾向（真值=服务端正式编排资料）：
   *  非空时进层0 总纲领倾向块。由管线据 sessionId 读出后传入。缺省/空串=不追加。
   *  批次O：精修子模式同样注入（并入统一 0-6 框架·不再豁免）。 */
  directorPref?: string
  /** 批次O（2026-07-03·层2 当前情境·与统筹同构）：「现在 时间·地点·天气」场景锚（管线用帷幕快照现算传入）。
   *  非空即注入【2·当前情境】层；缺省/空串=该层不出现（旧调用/测试零回归）。 */
  sceneContext?: string
  /** 批次O·层2 上一轮情境承接块（renderLastScenarioBlock 产物）：纠偏轮它就是「本轮已判情境」真值，
   *  让提调不用再猜当前情境。非空即并入【2·当前情境】层；缺省/空串=不注入。 */
  lastScenarioBlock?: string
  /** 批次C（2026-07-02·层3 半持久=loop 启动按最新库态重建）：「3·对话可见历史」投影全景——
   *  由管线在纠偏入口用 renderDirectorVisibleHistory 按**当前最新消息列表+投影**现算后传入（含本轮刚生成的消息），
   *  修「纠偏时提调看不到本轮」缺口。非空即注入（带【3·对话可见历史】层标题）；
   *  缺省/空串=不注入（旧调用/测试零回归）。批次O：精修子模式同样注入（并入统一 0-6 框架·不再豁免）。 */
  visibleHistory?: string
  /** 导演流回调：每步快照实时上抛轮级载体（决策流 + 分镜 + 工具条）。 */
  onDirectorStream?: (stream: TidiaoDirectorStream) => void
  /**
   * 即时落库回调（批次1·2026-06-22）：上策每成功改一条消息原文（editChatMessage applied）后，
   * 当场上抛该消息改后完整内容，由调用方立刻写回 DB——中途停止/异常终止时已改的也已落库。
   * 中策「按提示词重生成」的即时落库在 pipeline 的 regenerateFromEditedPrompt 接缝里做（那里才有 promptLog）。
   */
  onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>
  /** R1-B B5-2 item1 真合并·精修子模式（用户 2026-06-28 拍板）：true 时本 loop 退化为「锚定精修」——
   *  只读改原文+投影、用精修协议、收尾按精修语义（无改动即失败抛错），替代退役的 runTidiaoPrecisionEditLoop。
   *  提示词/重生成/escalate/askUser/旁白全不装配（business 缺对应字段 → B3 自动门控隐藏+不可调）。 */
  precisionOnly?: boolean
  /** 精修子模式段级光带回调（B2 状态提示·对应退役精修 loop 的 onEditTargeted）：每成功精改一段即上抛 oldText，
   *  供被改消息的段级光带高亮。装配进 business.onEditTargeted（纠偏模式不传=不画段级光带，行为不变）。 */
  onEditTargeted?: (target: { messageId: number; ref: string; oldText: string }) => void
  /** 真机五验④（2026-07-05）·重试失败子工作流接缝：本轮有生成失败的子工作流（旁白/角色消息没生出来）时由
   *  管线注入——注册 retryFailedWorkflow 工具 + 协议追加失败单元清单，让提调能真正重跑生成、不再「假装做到/说做不到」。
   *  缺省=不装配（无失败单元·旧调用/测试零回归）；精修子模式不挂。 */
  retrySeam?: TidiaoRetryContext | null
  /** 续回统筹开关（2026-07-08 停止=中断保留闭环）：true 时注册 resumeOrchestration 信号工具——用户要求继续
   *  被中断的统筹轮且需要统筹阶段能力时，提调据此收尾交回统筹（pipeline 仿 escalate 整轮范式续跑·不删消息）。
   *  仅聊天内纠偏入口传 true；**外部轮 runner 不注入**（无管线活体链路可续跑）；缺省=不注册（旧调用/测试零回归）；
   *  精修子模式不挂。 */
  resumeSeam?: boolean
  /** 2026-07-06（用户拍板「统筹工具给纠偏」）·生成新角色消息接缝：在位即注册统筹同名 addCastDirection——
   *  提调对候选角色定方向（characterId + direction），loop 收尾对每条方向调 generate 用正常角色链路生成一条
   *  新消息并写库（同 Q3 旁白范式：编排达标后才生成）。缺省=不挂（旧调用/测试零回归）；精修子模式不挂。 */
  castSeam?: TidiaoCorrectionCastSeam | null
  /** 世界剧本接缝：用户要求改剧本时把原话派给编剧 Agent；Agent 通过世界叙事种子正式 API 提交，
   *  不再读取或写入历史会话剧本缓存。纠偏轮按需调用，不设置“每轮必问”硬门。 */
  scriptSeam?: {
    dispatchScriptwriter: TidiaoScriptContext['dispatchScriptwriter']
  } | null
  /** 状态系统接缝（积木骨架计划批次5·2026-07-08）：在位即注册 readStatusPanels/updateStatusPanel——
   *  用户在提调框指名改状态（「把沈青梧的灵石改成100」「物品里加一把剑」）或纠偏引发状态变化时，
   *  提调直接改状态栏真值（与「状态」面板、星依工具同一份服务端真值）。装配=buildTidiaoStatusSystemSeam
   *  （与统筹 harness 同接缝·联动能力）。缺省=不挂（旧调用/测试零回归）；精修子模式不挂。 */
  statusSeam?: TidiaoStatusSystemToolContext | null
  /** 绘舆作图派发接缝（地图系统批5·2026-07-11）：在位即注册统筹同名 dispatchMapWork——纠偏改动引发地点变化
   *  （改出角色移动/新地点/进迷雾区）或用户指名改地图时，派「绘舆」更新舆图并带回格局摘要。装配=管线
   *  buildHuiyuDispatchSeam（与统筹 harness 同接缝·联动能力）。缺省=不挂（旧调用/测试零回归）；精修子模式不挂。 */
  mapWorkSeam?: TidiaoMapWorkDispatchContext | null
  /** H2·每 turn 重建 0-6 prompt（与统筹 `directorPromptRebuild` 同一开关同语义·管线透传）：
   *  turn>0 时无视 runtime append-only messages，用「system 恒定 + 层2/层3/层4/层5(当轮操作日志)/层6 + 注入块 + 续轮收束句」
   *  重建发模型——工具读回的超长结果只在层4 一份、层5 截 120 字，根治纠偏轮 state 膨胀；
   *  并每 turn 刷新 setActiveDirectorPrompt（查看器/落库快照始终是最新真实 prompt）。
   *  false=旧 append-only 原样（真机对照）。批次O：精修子模式同样重建（并入统一 0-6·不再豁免）。 */
  promptRebuild?: boolean
}

export interface TidiaoCorrectionLoopResult {
  /** 提调本轮择优落在哪一策。 */
  strategy: TidiaoCorrectionStrategy
  /** 上策：直接精修原文的累积改动（strategy==='direct-edit' 时非空）。 */
  edits: TidiaoChatMessageEditCommit[]
  /** 中策：改提示词的累积改动（strategy==='prompt-regen' 时非空，pipeline 据此用正常模型重生成）。 */
  promptEdits: TidiaoMessagePromptEditCommit[]
  /** 中策：in-loop 重生成结果（仅 P3 注入重生成接缝且提调调用了 regenerateFromPrompt 时非空）。 */
  regenerations: TidiaoCorrectionRegeneration[]
  /** 下策：升级重判情境重排的信号（strategy==='escalate' 时非空）。 */
  escalation: TidiaoCorrectionEscalation | null
  /** 续回统筹（2026-07-08）：strategy==='resume-orchestration' 时的续接补充指令（可空串=纯继续）。 */
  resumeInstruction?: string
  /** 批次B：提调本轮「没把握先问用户」发起的提问（strategy==='ask-user' 时非空，上层据此进提问态等答复）。 */
  askUser: TidiaoCorrectionAskUser | null
  /** Q3：本轮新增的旁白（接缝已写库；可与上/中策并存，ops 据此刷新列表）。 */
  narrationCreations: TidiaoCorrectionNarrationCreation[]
  /** 2026-07-06：本轮新增的角色消息（castSeam 已写库；可与上/中策并存）。 */
  castCreations: TidiaoCorrectionCastCreation[]
  /** 提调标记需要重投影的消息（无投影接缝时为空），供 pipeline/ops 写回 DB 后逐条重跑投影生成。 */
  reprojectTargets: TidiaoReprojectTarget[]
  /** R1-A：strategy==='chat-only' 时，提调对用户提问的最终回答人话（取自最后一条决策 thought）；其余策略为空。
   *  回答本就经决策流 thought 呈现（累加器已收），此字段供上层/测试取用，不强依赖。 */
  chatAnswer?: string
  transcript: AgentTranscript
}

/** 构造「纠偏任务纲领」（2026-07-05 层0 任务化·用户拍板）——纠偏轮 system 层0 的任务专属主纲领：
 *  层0 = 知识库（身份/口吻）+ 本块 + 编排倾向，统筹决策纲领不再进纠偏轮（见 runTidiaoCorrectionLoop 装配）。
 *  批次O 时本块曾作 user 侧注入段拼在层6 之后，真机复现「纲领在最尾+统筹纲领在层0」导致职责混淆提前收束，故上移。
 *  目标消息**不再**整段塞进 prompt（硬塞目标会在「要改的其实是更早/其他消息」时误导提调）——
 *  指令发起位置只在层5 加粗用户行里作弱标注，提调要看原文自己 readChatMessage（进层4），层3 全景+本轮分界足以定位。
 *  倾向块（directorPref）/知识库/历史记忆均不再由本块承载（分别归层0 / 层0 / OFF 对照路径的独立段）。 */
export function buildTidiaoCorrectionDirectiveBlock(
  options: {
    hasRegenerateTool?: boolean
    /** 投影接缝存在时追加「上策改原文后判断投影是否过时→标记重投」说明。 */
    hasProjectionTools?: boolean
    /** 改帷幕接缝存在时追加「改帷幕时间/地点/天气」说明（updateCurtainScene）。 */
    hasCurtainSceneTool?: boolean
    /** 2026-07-07：剧本接缝在位时追加「改剧本」段（consultScript directive 转达用户修改指令给编剧）。 */
    hasScriptTool?: boolean
    /** 批次5（2026-07-08）：状态系统接缝在位时追加「改状态栏」段（readStatusPanels/updateStatusPanel）。 */
    hasStatusTool?: boolean
    /** 地图系统批5（2026-07-11）：绘舆接缝在位时追加「地图信号」段（dispatchMapWork·渐进式披露层1 触发句）。 */
    hasMapTool?: boolean
    /** 2026-07-08：续回统筹工具在位时追加「继续被中断的统筹」段（resumeOrchestration 交回统筹阶段续做）。 */
    hasResumeTool?: boolean
    /** Q3：旁白接缝存在时追加「新增旁白」段（读旁白 skill→写新旁白提示词→生成新旁白消息）。 */
    narrationProfiles?: PersonalityNarrationSubagentProfile[]
    narrationMaxCalls?: number
    /** 2026-07-06：castSeam 在位时追加「生成新角色消息」段（addCastDirection 定方向→收尾生成新消息）。 */
    castCandidates?: Array<{ characterId: string; name: string }>
    /** 上一轮已定且可直接复用的方向；存在时注册定点补生成工具。 */
    priorCastDirections?: Array<{ characterId: string; name: string; direction: string }>
    /** 真机五验④：本轮失败单元摘要（retrySeam 在位时传入）——协议追加「重试失败的子工作流」段 + 清单。 */
    retryUnits?: Array<{ id: string; label: string; lastError: string }>
  } = {}
): string {
  const castCandidates = Array.isArray(options.castCandidates) ? options.castCandidates : []
  const priorCastDirections = Array.isArray(options.priorCastDirections) ? options.priorCastDirections : []
  const hasCastTool = castCandidates.length > 0
  const lines: string[] = []
  lines.push('【纠偏任务纲领·你本轮的职责】你这一轮的任务**只有一个**：处理用户的纠偏——用户对会话里已生成的消息提出了纠偏/调整意见（见【5·提调带信息流】末尾加粗的【用户纠偏】行），你要在三种策略里**自己择优**修好它。'
    // 2026-07-06 castSeam 在位时 addCastDirection 真注册了——「统筹工具都没注册」的旧口径要按在位能力如实表述，
    // 否则模型看到能力段又看到「没注册」自相矛盾。
    + (hasCastTool
        ? '本轮不是统筹编排：判情境（readScenarioSkill）和 finishRound 那套统筹流程本轮**没有注册**（【5·提调带信息流】里若有它们的调用记录，那是之前统筹轮留下的历史，不代表本轮已完成）；需要新旁白/新角色消息时用下面能力段里真注册的工具；按下面的方式工作。'
        : '本轮不是统筹编排：判情境→定旁白→逐个定角色方向→finishRound 那套统筹流程与工具本轮**都没有注册**（【5·提调带信息流】里若有它们的调用记录，那是之前统筹轮留下的历史，不代表本轮已完成）；按下面的方式工作。')
    // 2026-07-08 续回统筹在位时补一句：与「统筹没注册」不矛盾——需要统筹能力时经 resumeOrchestration 交回统筹阶段。
    + (options.hasResumeTool
        ? '若用户要求的是**继续被中断的统筹任务**且剩余部分需要统筹能力，用下面能力段里的 resumeOrchestration 交回统筹阶段续做。'
        : '')
    + '收尾方式=输出 { "thought": "收尾人话", "done": true }，不是 finishRound。')
  lines.push('若用户行带「发起自 某楼层」标注，那只是用户发起本次操作时所在的消息，不代表要改的就是它——实际要改哪条、要不要改，一律以指令内容为准（可能指向更早的消息、其他消息，也可能什么都不用改）。')
  // 先判断意图：用户这一轮未必是要改东西，也可能只是问你/闲聊。纯问答直接回答收尾，别动工具、别浪费 token。
  // 根因——协议此前把每轮都硬框成「一次纠偏，必须修」，导致「你刚刚改了什么」这类提问也被当任务去 readChatMessage / askUser。
  lines.push('【先判断：是要你改东西，还是在问你/闲聊】动手前先看清用户这一轮到底要什么。'
    + '如果用户其实没有让你改任何消息，只是在问你问题、确认刚才发生了什么、或随口聊一句（例如「你刚刚改了什么」「为什么报错」「这条是谁说的」），'
    + '就**直接依据【5·提调带信息流】的操作日志与【3·对话可见历史】，用一段人话把答案写进 thought 回答他，然后输出 { "thought": "你的回答", "done": true } 收尾**——'
    + '这种情况下不要调用任何读取/修改工具、不要改任何消息、也不要用 askUser，别白白浪费 token。回答可以写完整，不受下面导演旁述「40 字内」的限制。'
    + '只有当用户确实是在要求调整某条消息时，才进入下面的三策。')
  lines.push('三种策略，从**最省的够用方案**开始自己判断该用哪一种（能上策就别中策，能中策就别下策）：')
  lines.push('【上策·最省·改原文】如果用户的意见只是要改原文的某个字句、措辞、细节，且这条消息的情境与方向本来都对——用 editChatMessage 把旧片段换成新片段。'
    + '如果是这条消息**输出被截断没写完**、或要在原文基础上精准补一段新内容——用 appendChatMessage 由你亲自续写补完：补截断时先看清最后一句断在哪里，接着写完它；拿不准原本要写什么方向时可先 readMessagePrompt 看它当初的生成提示词。'
    + '无论改还是补，你写的文字都必须**模仿这条消息已有的文风文法**（用词、句式、叙述人称、节奏），与前后文自然衔接、读不出改动痕迹。'
    + '不重新生成，最快。原文以你手上最新的为准：改动工具的回执会带**改后全文**、【4·已读资料】里也留着你读过的内容，都有就直接用；只有两处都没有这条消息的最新原文时，才用 readChatMessage 读一次。')
  lines.push('【中策·改提示词重生成】如果改原文不够（要调这条消息的生成方向/要点、需要重写），但情境判断没错——用 readMessagePrompt 读这条消息当初的提示词、editMessagePrompt 改提示词文字。'
    + (options.hasRegenerateTool
        ? '改完提示词后用 regenerateFromPrompt 让系统据新提示词用正常回复模型重生成这条消息（你可以看到重生成结果，不满意可继续调）。'
          + '如果用户只是要你「按原提示重新生成/再出一版」、并不需要改提示词，可以**直接**用 regenerateFromPrompt 按现有提示词重生成，不必先改提示词。'
        : '改完提示词后系统会用正常回复模型据新提示词重生成这条消息（不是你来写正文）。'))
  lines.push('【下策·最贵·重判情境重排】如果连情境都判错了（这一轮整体要重判情境、推翻重排）——用 escalateCorrection 给出原因，交系统重判情境、重新编排这一轮。这是最彻底也最贵的，只在上、中两策都救不了时才用。')
  // 2026-07-08 续回统筹（停止=中断保留闭环）：resumeSeam 在位时追加——用户「继续」被中断统筹轮的正路，
  // 与 escalate（推翻重排）语义不同：resume=保留一切、只做剩余部分。
  if (options.hasResumeTool) {
    lines.push('【继续被中断的统筹】如果用户要求的是继续/接续上一轮被中断或没做完的统筹编排（如中途点了停止，现在说「继续」），且剩余部分需要统筹阶段能力（安排未出场角色、旁白、收尾）——用 resumeOrchestration 交回统筹阶段续做，已有消息、决策流和待办全部保留，统筹只做尚未完成的部分。'
      + '这不是推翻重排（那是 escalateCorrection）；若只是某条消息被截断要补完，仍优先上策 appendChatMessage 就地补，不必切回统筹。调用后输出 { "done": true } 收尾即可。')
  }
  // 真机五验④：本轮有生成失败的子工作流时，把失败单元清单直接写进协议——用户说「重试」时提调有真工具可用，
  // 不再「没有对应消息可改 → 什么都不做直接收尾」或拿改原文硬凑。
  const retryUnits = Array.isArray(options.retryUnits) ? options.retryUnits : []
  if (retryUnits.length) {
    lines.push('【重试失败的子工作流·本轮有生成失败】本轮统筹已完成，但下列消息生成子工作流**失败了**（对应消息没有生出来）。'
      + '用户要求「重试」「继续生成」「把消息生出来」时，直接调 retryFailedWorkflow 真正重跑生成（不指定单元=重试全部）。'
      + '这不属于三策改消息——不要用改原文/编正文去假装完成，也不要说做不到。失败单元清单：')
    for (const unit of retryUnits) {
      const err = String(unit.lastError || '').trim()
      lines.push(`- ${unit.id}：${unit.label}${err ? `（上次报错：${err}）` : ''}`)
    }
  }
  if (options.hasCurtainSceneTool) {
    // 帷幕=右上角那组独立的虚拟时间/地点/天气字段，不是消息正文。用户要改它时用 updateCurtainScene 改会话帷幕真值。
    // 批次4（2026-07-07 范式优化）：地点三段格式/参数细节沉进工具 brief+schema+validateArgs（CURTAIN_LOCATION_FORMAT_HINT
    // 单一口径·校验失败回执会重述格式），纲领只留「何时用+判断准则」。
    lines.push('【改帷幕时间/地点/天气】如果用户要你改的是右上角「帷幕」那组虚拟时间、地点或天气（如「把帷幕时间改到下午三点」「换到海边」「天气改成下雨」），'
      + '这不是改某条消息，而是用 updateCurtainScene 改当前会话的帷幕真值：只提交确实要改的那几项，地点/天气写正经名称——气氛、光影、感受、比喻都不是地点；'
      + '拿不准是否真的改变就不要提交那一项。改帷幕可以和上/中策动消息并存。')
  }
  // 2026-07-07（用户拍板「提调框改剧本」）：scriptSeam 在位时追加「改剧本」段——用户对剧本本身的修改要求
  // 经 consultScript.directive 原话转达给编剧 subagent 执行；提调只懂格式（字段一览）、不掌整本内容。
  if (options.hasScriptTool) {
    // 批次4（2026-07-07 范式优化）：字段一览（SCRIPT_FIELDS_HINT_FOR_DIRECTOR）与参数用法已在 consultScript
    // 工具 brief/schema 承载（层1 清单+原生下发），纲领不再复述——只留「何时用+转达原话+边界」策略。
    lines.push('【异步编剧分析】用户要你评估剧情因果、伏笔触发或后台事件时，可以用 consultScript 派编剧分析。'
      + '它只会立即确认派发，结果进入后续轮次的异步收件箱；不要等待、不要重复调用，也不要宣称已经修改剧本。'
      + '用户明确要求修改剧本/伏笔时，正式写入应走世界级叙事种子工具链；本纠偏接缝没有种子写工具时要如实说明，不能回退覆盖旧整本。')
  }
  // 批次5（2026-07-08 用户拍板「状态栏主写手=提调」）：statusSeam 在位时追加「改状态栏」段——
  // 参数用法在工具 brief+schema（范式规矩④·纲领只留「何时用+边界」策略）。
  if (options.hasStatusTool) {
    lines.push('【改状态栏】状态系统是用户按世界观和管理需要自由构筑的结构化状态（「状态」面板可见），分类不限于角色/组织/建筑/区域/物品，**也不是聊天消息**。'
      + '如果用户要改的是某个实体的状态（如「把沈青梧的灵石改成100」「物品里加一把剑」「宗门声望降一点」），'
      + '或你的纠偏改动让剧情事实变了、对应状态也该跟着变——先 readStatusPanels 看有哪些状态栏和字段，再用 updateStatusPanel 改到位（只给要改的字段键）。'
      + '改状态可以和三策、其他能力并存；没有对应状态栏的实体不用硬造，用户没提状态且剧情事实没变就不要调它。')
  }
  // 地图系统批5（2026-07-11 用户拍板）：绘舆接缝在位时追加「地图信号」段——渐进式披露层1，与统筹纲领同口径
  // （角色移动/新地点落名/进迷雾区→派绘舆·给剧情事实不给坐标·回执带格局摘要），细节住工具 schema 与绘舆知识库。
  if (options.hasMapTool) {
    lines.push('【地图信号·派「绘舆」更新舆图】如果你的纠偏改动或用户指令造成了地图级变化——①角色位置移动（改出了进出场所/启程/抵达）；②新地点/建筑/地标首次落名；③队伍进入未探索区域——用 dispatchMapWork 派「绘舆」作图员更新世界舆图。'
      + '任务书只给剧情事实（谁从哪到哪、新地点相对既有地物的方位与距离描述），不给坐标——坐标绘舆读图后自己定；交稿回执带回更新后的地图格局摘要，后续叙事的方位距离以它为准。'
      + '派绘舆可以和三策、其他能力并存；没有地图级变化就不要调它。')
  }
  // 批次B「没把握先问用户」长期知识：不确定时先问、给推荐，绝不瞎猜硬做。本协议始终带（askUser 始终注册）。
  lines.push('【没把握先问·重要原则】动手前先确认你真的清楚要做什么。遇到这些情况不要自己猜，先用 askUser 问用户、并给出带推荐的选项，等用户答复再动手：'
    + '①目标有歧义（例如用户说「旁白」，但既可能指会话里独立的「旁白M」楼层消息、也可能指某条角色消息开头那段环境/场景描写——这两种都可能，拿不准就问）；'
    + '②同一句指令有多种合理做法；③用户的要求可能越界、或与当前消息现状明显冲突；④你找不到用户指代的那条消息/对象。'
    + 'askUser 的 question 写一句人话问题，options 给 2~4 个具体可选项，recommended 写你最推荐的那个 + 一句理由。问完本轮就停下等答复，本轮最多问一次；能自己判断清楚时不要滥用提问。')
  // 批次A「旁白指代自主定位」长期知识：收到「旁白…」类指令先扫楼层定位，别默认在屏 target 就是旁白。
  // 根因——用户点在角色4 上发「旁白扩充500字」，提调拿到 target=角色4 直接硬改了角色4。本协议始终带。
  lines.push('【旁白指代自主定位】当用户的纠偏意见提到「旁白」（如「把旁白扩充到500字」「旁白改委婉点」），'
    + '**不要默认用户发起位置的那条消息就是旁白**——「旁白」可能指两种东西：①会话里一条独立的「旁白M」楼层消息；'
    + '②某条角色消息开头那段环境/场景描写（夹在角色台词之前的环境铺陈）。判断指代先看【3·对话可见历史】全景（不用挨条读原文），动手改前再读目标那一条的原文锚定 oldText：'
    + '命中独立的「旁白M」楼层 → 直接用 editChatMessage 改那条旁白；'
    + '只有角色消息开头有内嵌环境段、没有独立旁白楼层 → 用 editChatMessage 把那段环境描写作 oldText 精准替换（只动开头那段环境，别动后面的角色台词）；'
    + '两种都存在、或都找不到、或拿不准用户指哪个 → 走上面的 askUser 问用户，options 给「①独立旁白楼层 ②角色N开头的环境描写段」，recommended 按用户措辞更像哪个来推荐。')
  if (options.hasProjectionTools) {
    // 投影=抽给其他角色/旁白读的客观事实摘要；上策改大了原文它会过时。是否重投由提调自己判断（用户 2026-06-21）。
    lines.push('【改完原文后·判断投影】走上策用 editChatMessage 改完某条消息的原文后，判断它的【客观事实投影】是否还匹配新原文：投影是抽给其他角色/旁白读的客观事实摘要（谁对谁做了什么、时间地点）。只是措辞润色、事实没变就不用动；若改动较大（发生的事、对象、动作、时间或地点变了），先用 readMessageProjection 读它当前投影确认，再用 reprojectMessage 标记这条需要重投影——重投影会在纠偏保存后基于新原文自动重新生成，你只需判断要不要重投并标记，不用自己写投影内容。要不要重投由你自己判断。')
  }
  // Q3 新增旁白能力：旁白接缝存在时追加「新增旁白」段，让提调能写一段本轮还没有的全新旁白（区别于改已有旁白字句/提示词）。
  const narrationProfiles = Array.isArray(options.narrationProfiles) ? options.narrationProfiles : []
  const hasNarrationTool = narrationProfiles.length > 0
  if (hasNarrationTool) {
    const maxCalls = Math.max(1, Math.min(3, Math.round(Number(options.narrationMaxCalls || 2) || 2)))
    const guide = buildDirectorNarrationSkillGuide(narrationProfiles)
    // 批次4（2026-07-07 范式优化）：generatedPrompt 写法细节沉进工具 schema description（校验回执也带口径），
    // 纲领只留「何时用+边界+插入位置语义」；可用 skill 清单是会话动态上下文（非用法）保留。
    lines.push(`【新增旁白】如果用户要你加一段本轮还没有的旁白（如「来一段描写夜色/某角色泡温泉」），先用 readNarrationSkill 读对应旁白写法，再用 confirmNarrationCall 提交这段旁白完整的生成提示词（写给旁白生成模型看的完整任务、别提工具/内部链路），最多 ${maxCalls} 条。这是新增一条旁白消息，不是去改角色消息的提示词；你也可以顺带用上/中策动角色消息。`)
    lines.push(`旁白插入位置由你决定：不指定=插在被纠偏消息之前（铺场）；要插在某楼层之后就在 insertAfter 给楼层引用（如「角色1」）。`)
    lines.push(`可用的旁白 skill 只有：${guide.available}。profileId 必须逐字用「括号前的 id」（如 environment / appearance / event_push / custom1），不要用角色名或编造 default/auto。`)
    lines.push(guide.detail)
    lines.push('如果你自己判断某条本轮刚确认的旁白方向真的需要改（不是每次纠偏都要改），用 reviseNarrationDirection 改；不要把用户纠偏原文直接当新方向。')
  }
  // 2026-07-06（用户拍板「统筹工具给纠偏」）：castSeam 在位时追加「生成新角色消息」能力段——
  // 与统筹同名 addCastDirection（模型对它的工具知识两轮通用），收尾后经接缝用正常角色链路生成。
  if (hasCastTool) {
    if (priorCastDirections.length) {
      lines.push(`【上一轮漏消息·定点补生成】如果用户说上一轮已经排了方向、但某些角色最终没有生成消息，直接用 ${TIDIAO_REGENERATE_CAST_FROM_DIRECTIONS_TOOL_NAME} 一次选中用户点名的全部缺失角色。必须原样复用下面既有方向，不重判情境、不重新规划、不改方向，也不要改用 addCastDirection：${priorCastDirections.map((item) => `${item.name}（${item.characterId}）：${item.direction}`).join('；')}。`)
    }
    lines.push(`【生成新角色消息】如果用户要某个角色**新回一条消息**/补一个反应（不是改已有消息，例如「让张三回应这件事」「角色们对刚才的事表个态」），用 addCastDirection 定该角色的本轮方向（方向写他大致怎么回应/态度/动作，不写台词原文）；每个角色各一次调用（多个角色可同轮并发）、同一角色只定一次，若自己判断该方向真的需要改再用 reviseCastDirection（不是每次纠偏都要改，别把用户纠偏原文直接当新方向）。你收尾（done:true）后，系统会为每个已定方向的角色用正常角色链路各生成一条新消息，不用你写正文。候选角色只有：${castCandidates.map((c) => `${c.name}（${c.characterId}）`).join('、')}，characterId 必须逐字用括号里的 id。可以和上/中策、新增旁白并存。`)
  }
  lines.push('工作方式：每一轮都用一句导演口吻的人话 thought 旁述（让用户看见你在做什么、为什么选这一策；thought 40 字内、不写工具机器名/工程黑话）。'
    + '**并联省轮**：互不依赖的动作并在同一轮输出里一起发起（一次多个函数调用·按列出顺序执行）。'
    + '**不要重复读取**：读过的原文/提示词都留在【4·已读资料】里，改动工具的回执本身就是改后真值——不要再调读取工具去“确认改没改成”，读取只发生在「要动手改、且手上没有这条内容的最新版」时。')
  // 批次4（2026-07-07 范式优化·用户拍板「策略留纲领·用法沉工具」）：逐工具参数枚举墙退役——
  // 每个工具的参数与用法以工具 brief（层1 清单）+ 原生下发的参数 schema 为准（tidiaoToolContract 单一真值），
  // 纲领只保留输出格式契约与收束方式。后人别再往这里加「（参数 …）」——加段先过纲领预算锁（tidiaoCharterBudget.spec）。
  const editLine =
    '输出格式：工具一律走原生函数调用（function calling）——每轮 content 只输出一个 JSON 对象承载旁述与收尾：{ "thought": "一句导演人话", "done": false }，不要把工具写进 JSON 里。'
    + '每个工具怎么调、参数怎么填，以【1·可调用资料】清单里各工具自己的说明和随请求下发的参数 schema 为准。'
    + '调 askUser 问完输出 { "thought": "等用户答复", "done": true } 收束本轮；修好后输出 { "thought": "收尾人话", "done": true } 并不再发起任何函数调用。'
  lines.push(editLine)
  return lines.join('\n')
}

/** 构造「锚定精修任务纲领」（2026-07-05 层0 任务化·与纠偏纲领同范式上移 system 层0）——
 *  取代旧 buildTidiaoPrecisionEditProtocol 独立 system 协议（R1-B 真合并时从退役精修 loop 移入的那份）。
 *  与纠偏块同范式：不再整段塞目标消息原文（指令发起位置只在层5 加粗用户行弱标注），工具收窄与「无改动即失败」
 *  收尾语义保持不变（那是代码层语义，不靠提示词）。includeProjectionTools=true 时追加「改完判断投影→标记重投」一步。 */
export function buildTidiaoPrecisionEditDirectiveBlock(
  options: { includeProjectionTools?: boolean } = {}
): string {
  const includeProjectionTools = Boolean(options.includeProjectionTools)
  const lines: string[] = []
  lines.push('【锚定精修任务纲领·你本轮的职责】你这一轮的任务**只有一个**：用户要你精改会话里已存在的某条/某几条消息的某一段，其余原样不动（改哪条、改什么见【5·提调带信息流】末尾加粗的【用户精修】行，以指令内容为准；若带「发起自 某楼层」标注，那只是用户发起操作时所在的消息，实际目标仍以指令为准）。'
    + '本轮不是统筹编排：判情境→定旁白→逐个定角色方向→finishRound 那套统筹流程与工具本轮**都没有注册**（【5·提调带信息流】里若有它们的调用记录，那是之前统筹轮留下的历史，不代表本轮已完成）；只做锚定改字。'
    + '收尾方式=输出 { "thought": "收尾人话", "done": true }，不是 finishRound。')
  lines.push('工作方式（每一轮都用一句导演口吻的人话 thought 旁述，让用户看见你在做什么；thought 40 字内、不写工具机器名/工程黑话。互不依赖的动作可同轮一起发起）：')
  lines.push('1. 手上没有目标消息最新原文时（【4·已读资料】和改动回执里都没有），才用 readChatMessage 读一次，确认要改哪一段；读过的不要重复读。')
  lines.push('2. 用 editChatMessage 做「旧片段→新片段」精改：只动需要改的那一段，其余原样保留；改出的文字必须模仿这条消息已有的文风文法（用词、句式、人称、节奏），与前后文自然衔接。')
  lines.push('3. 若目标消息是**输出被截断没写完**、或要补一段新内容：用 appendChatMessage 由你亲自续写补完，补写文字同样模仿该消息已有文风、从断点自然接续、读不出接缝。')
  lines.push('4. 把用户要求的目标都改完即结束，不要改用户没要求的部分。')
  if (includeProjectionTools) {
    // 投影=抽给其他角色/旁白读的客观事实摘要；原文改大了它会过时。是否重投由提调自己判断（用户 2026-06-21）。
    lines.push('5. 改完某条消息后，判断它的【客观事实投影】是否还匹配改后的新原文：投影是抽给其他角色/旁白读的客观事实摘要（谁对谁做了什么、时间地点）。若只是措辞润色、客观事实没变，投影不用动；若改动较大（发生的事、对象、动作、时间或地点变了），先用 readMessageProjection 读它当前投影确认，再用 reprojectMessage 标记这条需要重投影——重投影会在精修保存后基于新原文自动重新生成，你只需判断要不要重投并标记，不用自己写投影内容。要不要重投由你自己判断。')
  }
  // 批次4（2026-07-07 范式优化）：逐工具参数枚举退役——参数以工具 brief+schema 为准，纲领只留输出格式契约。
  lines.push('输出格式：工具一律走原生函数调用（function calling）——每轮 content 只输出一个 JSON 对象承载旁述与收尾：{ "thought": "一句导演人话", "done": false }，不要把工具写进 JSON 里；每个工具怎么调、参数怎么填，以【1·可调用资料】清单里各工具自己的说明和随请求下发的参数 schema 为准。全部处理完后输出 { "thought": "收尾人话", "done": true } 并不再发起任何函数调用。')
  return lines.join('\n')
}

/** 目标消息 → 预置分镜（loop 启动即可见，标出本轮在改哪一镜）。
 *  注意：**不要**把 brief.instruction（用户的纠偏指令原话）写进分镜 direction——分镜方向是「提调导演这一轮时定的方向」，
 *  只有提调自己改这一镜方向时才该变。早期把指令塞进 direction 会经 mergeCarryOver 覆盖掉提调原方向、
 *  无原带时还直接把分镜显示成用户指令文字（用户 2026-06-30 报「我的输入把角色分镜覆盖了」即此）。
 *  预置镜只带角色身份：有原带时由 mergeCarryOver 保留提调原方向，无原带时分镜只显示角色名。
 *  用户的纠偏指令改走决策流（作为一条 correction「用户消息」决策，见 correctChatMessageViaDirector）。 */
function targetsToInitialShots(brief: TidiaoPrecisionEditBrief): TidiaoStreamShotInput[] {
  const targets = Array.isArray(brief.targets) ? brief.targets : []
  return targets.map((target) => {
    const isNarration = target.ref.startsWith('旁白')
    const label = String(target.speakerName || '').trim() || target.ref
    return {
      kind: isNarration ? 'narration' : 'character',
      label
    } as TidiaoStreamShotInput
  })
}

/** Q3：解析提调给某条新旁白指定的插入位置。confirmNarrationCall.args.insertAfter 是楼层引用「角色N/旁白M」，
 *  解析成对应消息 messageId（插在其后）；缺省/无效返回空 placement（接缝兜底插在轮锚点·铺场）。 */
function resolveNarrationPlacement(
  args: Record<string, unknown>,
  readContext: TidiaoChatMessageReadContext
): TidiaoCorrectionNarrationPlacement {
  const raw = String((args as Record<string, unknown>).insertAfter ?? (args as Record<string, unknown>).insert_after ?? '').trim()
  if (!raw) return {}
  const ref: ChatFloorRef | undefined = parseChatFloorRefs(raw)[0]
  if (!ref) return {}
  const read = readContext.readByFloor(ref.kind, ref.index)
  if (!read || !read.matched || !Number(read.messageId)) return {}
  return { insertAfterMessageId: Number(read.messageId) }
}

/**
 * 跑一轮纠偏三策统一 loop。
 * 收束后据提调实际落在哪一策返回三类终态之一；三策都没动且未升级时抛错（让上层 toast「未做出纠偏」）。
 */
export async function runTidiaoCorrectionLoop(
  input: TidiaoCorrectionLoopInput
): Promise<TidiaoCorrectionLoopResult> {
  // R1-B B5-2 item1 真合并·精修子模式：所有精修分支都 gated 在此开关后，纠偏链路逐字不受影响。
  const precisionOnly = input.precisionOnly === true
  const profileId = precisionOnly ? 'tidiao.precision' : 'tidiao.correction'
  const acc: TidiaoDirectorStreamAccumulator = createTidiaoDirectorStreamAccumulator({
    initialShots: targetsToInitialShots(input.brief),
    ...(input.onDirectorStream ? { onStream: input.onDirectorStream } : {})
  })

  const escalateHolder: { escalation: TidiaoCorrectionEscalation | null } = { escalation: null }
  // 批C（2026-07-12 架构审查·人在环上通道统一）：askUser 从「holder+halt hook」迁到引擎 halt 原语——
  // 引擎收到工具结果 awaitingUser 标记后原生以 terminalReason='awaiting-user' 收束 loop（见 agentRuntime/runtime.ts），
  // 本 loop 不再自己写 holder、不再自定义 afterToolResult halt hook。这里只留一个布尔标记，供下面两处护栏 hook
  // 判断「本轮是否已发起过提问」（与下方 tidiao-correction-ask-user-recorder 配套写入）；最终返回的 askUser 字段
  // 改在下方收尾段直接由 runtimeResult.pendingInteraction 映射构造（strategy:'ask-user' 对外形状逐字节不变）。
  let askUserRequested = false
  // 续回统筹（2026-07-08）：resumeSeam 在位（聊天内纠偏入口）才注册；holder 与 escalate 同范式，收尾读。
  const resumeEnabled = !precisionOnly && input.resumeSeam === true
  const resumeHolder: { resume: TidiaoCorrectionResume | null } = { resume: null }
  const regenerations: TidiaoCorrectionRegeneration[] = []
  const hasRegenerateTool = typeof input.regenerateFromEditedPrompt === 'function'
  // R1-A：提调最后一句人话 thought（chat-only 终态据它作 chatAnswer），由 onProgress 持续更新。
  let lastDirectorThought = ''

  // Q3 旁白接缝：profiles 非空 + 生成接缝存在才纳入「新增旁白」能力。
  const narrationProfiles = Array.isArray(input.narrationProfiles) ? input.narrationProfiles : []
  const narrationEnabled = narrationProfiles.length > 0 && typeof input.generateNarration === 'function'
  const narrationMaxCalls = Math.max(1, Math.min(3, Math.round(Number(input.narrationMaxCalls || 2) || 2)))
  // 提调给某条新旁白指定的插入位置（confirmNarrationCall.args.insertAfter 楼层引用 → messageId）；
  // 按确认顺序对应到第 N 条旁白 call。2026-07-06 旁白穿插后 schema 已声明 insertAfter（统筹轮锚点语义）；
  // 纠偏轮不装配 resolveInsertAfter → 全局工具不写 call.placement，本 loop 仍在此按楼层引用自解析（两套锚点语义不混）。
  const narrationPlacements: TidiaoCorrectionNarrationPlacement[] = []
  // 精修子模式不挂旁白能力（只读改原文+投影）。R1-B B5-2 item2c：工具定义已迁全局池·读 ctx.business.narration；
  // onConfirmed 承接原 confirmNarrationCall.execute wrapping——确认成功即按 insertAfter 记 placement（与 call 同序对齐）
  // + 把该条旁白投影给累加器挂旁白镜（O-C3 同范式）。narrationActive 时装配 narrationCtx 传 business.narration。
  const narrationActive = !precisionOnly && narrationEnabled
  const narrationCtx: TidiaoNarrationContext | null = narrationActive
    ? buildNarrationBusinessContext(
        narrationProfiles,
        narrationMaxCalls,
        (call, args) => {
          narrationPlacements.push(resolveNarrationPlacement(args, input.readContext))
          acc.noteNarrationShot(call)
        },
        // 纠偏轮不装配 insertAfter 锚点解析器（楼层引用仍走 onConfirmed args 自解析，与统筹轮两套语义不混）。
        undefined,
        // 分镜方向修改（2026-07-07）：reviseNarrationDirection 成功后改已挂旁白镜方向。
        (call, index, reason) => acc.reviseNarrationShotDirection(index, call.generatedPrompt, reason)
      )
    : null

  // 2026-07-06（用户拍板「统筹工具给纠偏」）·生成新角色消息：castSeam 在位（精修子模式不挂）即构造最小决策
  // 上下文喂统筹同名 addCastDirection——候选=会话成员、无排除；cast 收集态供收尾逐条生成；onCastAdded 挂角色镜。
  const castSeam = !precisionOnly && input.castSeam && input.castSeam.candidates.length && typeof input.castSeam.generate === 'function'
    ? input.castSeam
    : null
  const castCtx: TidiaoDecisionContext | null = castSeam
    ? {
        candidateSet: new Set(castSeam.candidates.map((c) => c.characterId)),
        candidateNameById: new Map(castSeam.candidates.map((c) => [c.characterId, c.name])),
        excludedSet: new Set<string>(),
        state: { scenarioCode: '', scenarioBody: '', cast: [], finished: false, finishSituation: '', finishUnfinished: '' },
        onCastAdded: (entry) => acc.addShot({ kind: 'character', label: entry.label, characterId: entry.characterId, direction: entry.direction }),
        // 分镜方向修改（2026-07-07）：reviseCastDirection 成功后改已挂角色镜方向。
        onCastRevised: (entry) => acc.reviseCastShotDirection(entry.label, entry.direction, entry.reason)
      }
    : null
  const priorCastDirectionByCharacterId = new Map(
    (castSeam?.priorDirections || [])
      .map((entry) => [String(entry.characterId || '').trim(), String(entry.direction || '').trim()] as const)
      .filter(([characterId, direction]) => characterId && direction)
  )

  const hasProjectionTools = Boolean(input.projectionContext)
  // 无动作收尾硬门·acted 推导位（批次1·2026-07-07 范式优化）：三个手工观测位（curtainSceneTouched/
  // retryAttempted/scriptTouched）退役——本轮「是否做过事」统一由 afterToolResult recorder hook 按
  // 工具改动语义表推导（成功的 world 工具=做过事；consultScript/retryFailedWorkflow 带结果级 acted 修正），
  // 新工具进语义表即自动被硬门认得，不再手工挂位。
  let worldActed = false
  // 批次5（2026-07-08）·状态系统接缝（精修子模式不挂）：注册统筹同名 readStatusPanels/updateStatusPanel。
  const statusCtx = !precisionOnly && input.statusSeam ? input.statusSeam : null
  // 地图系统批5（2026-07-11）·绘舆接缝（精修子模式不挂）：注册统筹同名 dispatchMapWork。
  // 旧绘舆 AI 写入口已冻结：兼容 seam 不再进入纠偏工具注册表。
  const mapWorkCtx = null
  // 剧本接缝（精修子模式不挂）：注册统筹同名 consultScript（onChanged=管线即时写回接缝原样透传）。
  // 纠偏轮不挂 finishRound「没问过编剧」硬门（收尾走 done:true）——按需调用，用户没提剧本就不调。
  const scriptSeamRaw = !precisionOnly && input.scriptSeam ? input.scriptSeam : null
  const scriptCtx: TidiaoScriptContext | null = scriptSeamRaw
    ? {
        holder: { consulted: false },
        dispatchScriptwriter: scriptSeamRaw.dispatchScriptwriter
      }
    : null
  // 真机五验④·重试失败子工作流接缝（管线注入·精修子模式不挂）：在位即注册工具 + 协议追加失败单元清单。
  // 「重试尝试本身算做过事」由工具自己的 acted 修正承载（批次1），接缝直接透传不再 wrap。
  const retryCtx: TidiaoRetryContext | null = !precisionOnly && input.retrySeam ? input.retrySeam : null

  // 编辑 loop 启动时按「当轮接缝在位与否」调工厂建真实权限 registry；首轮高频 schema 与低频目录
  // 不再在这里维护第二份编辑桶，统一由当前运行 profile 的 manifest 与 registry 交集决定。
  // 工厂收 context 入参、闭包捕获，registry 成员＝当轮真有 context 的工具（越权目录与旧 B3 等价）：
  // searchDirectorMemory 恒在（越权检索兜底）；读改原文恒在；读投影/重投仅 projectionContext；
  // 纠偏模式（!precisionOnly）加读改提示词（promptContext）+ escalate/askUser，重生成仅有重生成接缝+promptContext、改帷幕仅 updateCurtainScene；
  // 旁白两件套仅 narrationCtx。精修子模式自动收窄到「读改原文 + 读投影/重投」（= 退役精修 loop 的四件套·U5 口径冻结）。
  // 改原文/补写共用同一 context（同一工作副本累积 + 同一即时落库回调）。
  const editToolCtx = {
    editContext: input.editContext,
    ...(input.onEditCommitted ? { onEditCommitted: input.onEditCommitted } : {}),
    // 段级光带纠偏与精修两条支路都接入（2026-07-11：新真值=谁调了编辑工具谁点亮，不再按 precisionOnly 门控）。
    ...(input.onEditTargeted ? { onEditTargeted: input.onEditTargeted } : {})
  }
  const correctionTools: ToolDefinition[] = [
    createSearchAppendLogTool(),
    createReadChatMessageTool({ readContext: input.readContext }),
    createEditChatMessageTool(editToolCtx),
    // 精准增加内容（2026-07-07）：补完截断消息/精准插段，与 editChatMessage 恒在同注册。
    createAppendChatMessageTool(editToolCtx)
  ]
  if (input.projectionContext) correctionTools.push(
    createReadMessageProjectionTool({ projectionContext: input.projectionContext }),
    createReprojectMessageTool({ projectionContext: input.projectionContext })
  )
  if (!precisionOnly) {
    // 读改提示词改 input.promptContext 门控（工厂要求 promptContext 必填·比原 presentBusinessFields 无条件 push 更准确·
    // 纠偏模式实际恒带 promptContext·行为不变）。
    if (input.promptContext) correctionTools.push(
      createReadMessagePromptTool({ promptContext: input.promptContext }),
      createEditMessagePromptTool({ promptContext: input.promptContext })
    )
    correctionTools.push(
      createEscalateCorrectionTool({ escalateHolder }),
      createAskUserTool()
    )
    // 2026-07-08·续回统筹（resumeSeam 在位·信号工具与 escalate 同范式：记录 holder + 引导收尾）。
    if (resumeEnabled) correctionTools.push(createResumeOrchestrationTool({ resumeHolder }))
    // 重生成改 input.regenerateFromEditedPrompt + input.promptContext 双门控（工厂要求两者必填·= 原 hasRegenerateTool + promptContext 恒在·行为不变）。
    if (input.regenerateFromEditedPrompt && input.promptContext) correctionTools.push(createRegenerateFromPromptTool({
      promptContext: input.promptContext,
      regenerateSeam: input.regenerateFromEditedPrompt,
      regenerations
    }))
    // 纠偏 loop 只带写帷幕回调，不限元工具预算（consumeBudget 缺省）、不留 state（recordResult 缺省）；
    // 帷幕-only 轮不被无动作硬门误拦由语义表承载（updateCurtainScene=world·成功即算，批次1 起不再 wrap 观测位）。
    if (input.updateCurtainScene) {
      correctionTools.push(createUpdateCurtainSceneTool({ updateCurtainScene: input.updateCurtainScene }))
    }
    // 真机五验④·重试失败子工作流（本轮有失败单元时管线才注入 retrySeam）。
    if (retryCtx) correctionTools.push(createRetryFailedWorkflowTool(retryCtx))
  }
  if (narrationCtx) correctionTools.push(createReadNarrationSkillTool(narrationCtx), createConfirmNarrationCallTool(narrationCtx), createReviseNarrationDirectionTool(narrationCtx))
  // 2026-07-06·生成新角色消息（castSeam 在位·统筹同名 addCastDirection·收尾经接缝生成）。
  if (castCtx) {
    if (priorCastDirectionByCharacterId.size) correctionTools.push(createRegenerateCastFromDirectionsTool({
      decision: castCtx,
      directionByCharacterId: priorCastDirectionByCharacterId
    }))
    correctionTools.push(createAddCastDirectionTool(castCtx), createReviseCastDirectionTool(castCtx))
  }
  // 2026-07-07·改剧本（scriptSeam 在位·统筹同名 consultScript·directive 转达用户修改指令给编剧）。
  if (scriptCtx) correctionTools.push(createConsultScriptTool(scriptCtx))
  // 批次5（2026-07-08）·状态系统两件套（statusSeam 在位·统筹同名·精修子模式不挂）：用户指名改状态时直接改状态栏真值。
  if (statusCtx) correctionTools.push(createReadStatusPanelsTool(statusCtx), createUpdateStatusPanelTool(statusCtx))
  // 地图系统批5（2026-07-11）·绘舆派发（mapWorkSeam 在位·统筹同名·精修子模式不挂）：纠偏引发地图级变化时派绘舆。
  if (mapWorkCtx) correctionTools.push(createDispatchMapWorkTool(mapWorkCtx))
  // 批次1·范式护栏：建 registry 前先过语义表登记校验——新工具漏登记=这里直接抛（任何跑本 loop 的 spec 立刻红）。
  assertTidiaoToolMutationSemanticsRegistered(correctionTools)
  const toolRegistry = new ToolRegistry(correctionTools)
  // 批次1B：纠偏/精修继续复用同一编辑 loop，但运行供给必须按模式显式选择 profile。
  // Skill 只按 manifest 装配，本接缝不重新加载 AgentContext；工具 registry 仍是当轮真实权限上限，
  // manifest 仅决定首轮 common schema 与延迟目录，并把缺口留进 transcript diagnostics。
  const toolSupply = resolveAgentRuntimeToolSupply(profileId, toolRegistry)

  // ── 层0 任务化（2026-07-05 用户拍板·取代批次O「user 侧注入块」）：纠偏/精修 prompt 仍走统一 0-6 框架，
  // 但层0 按任务装配：知识库（身份/口吻·不带统筹能力清单，能力真值=层1 本轮真注册工具）+ **本任务专属纲领**
  // （纠偏三策/锚定精修）+ 编排倾向。统筹那份决策主纲领（判情境→finishRound）不再进纠偏轮 system——
  // 真机复现：统筹纲领在层0、任务纲领垫底层6 之后，模型职责混淆、对着全勾 todo 误判「已完成」提前收束。
  const unifiedContextBlock = String(input.agentContextBlock || '').trim()
  const sceneContext = unifiedContextBlock ? '' : String(input.sceneContext || '').trim()
  // 环境命中只在授权前计算 selector，不读取正文；命中正文必须经 manifest grant + 正式 Skill loader
  // 装入第4层。恒定身份/口吻块用空输入构造，彻底退出旧的命中正文直喂路径。
  const environmentManualSelectors = matchTidiaoEnvironmentManualSelectors({
    userText: input.brief?.instruction,
    ...(sceneContext ? { sceneContext } : {})
  })
  const skillAssembly = await assembleAgentSkillSupply({
    profileId,
    activations: environmentManualSelectors.map((selector) => ({
      skillId: 'tidiao.environment-manual',
      activation: 'code_prefetch' as const,
      selector,
      reason: 'correction_environment_match'
    }))
  })
  const { constantBlock: knowledgeBlock } = buildTidiaoKnowledgeInjection(
    {},
    { includeEnvIndex: false, includeCapability: false }
  )
  // 任务纲领（层0 主纲领）：纠偏=三策择优；精修=锚定改字。工具收窄/收尾语义仍在代码层。
  const directiveBlock = precisionOnly
    ? buildTidiaoPrecisionEditDirectiveBlock({ includeProjectionTools: hasProjectionTools })
    : buildTidiaoCorrectionDirectiveBlock({
        hasRegenerateTool,
        hasProjectionTools,
        hasCurtainSceneTool: Boolean(input.updateCurtainScene),
        hasScriptTool: Boolean(scriptCtx),
        hasStatusTool: Boolean(statusCtx),
        hasMapTool: Boolean(mapWorkCtx),
        hasResumeTool: resumeEnabled,
        ...(narrationCtx ? { narrationProfiles, narrationMaxCalls } : {}),
        ...(retryCtx ? { retryUnits: retryCtx.listUnits() } : {}),
        ...(castSeam ? {
          castCandidates: castSeam.candidates,
          ...(castSeam.priorDirections?.length ? { priorCastDirections: castSeam.priorDirections } : {})
        } : {})
      })
  let outline = [skillAssembly.layers['0'], directiveBlock].filter(Boolean).join('\n\n')
  const prefBlock = renderDirectorPrefBlock(input.directorPref || '')
  if (prefBlock) outline = `${outline}\n\n${prefBlock}`
  if (knowledgeBlock) outline = `${knowledgeBlock}\n\n${outline}`
  const callableParts: string[] = []
  // 层1 清单真值=本轮真注册工具（listBriefs ∩ 编辑桶）；searchDirectorMemory 等越权工具不进清单、仍走 toolsearch 目录。
  const callableToolsBlock = renderDirectorCallableToolsBlock(toolRegistry.listBriefs(toolSupply.recommendedTools), { toolsearchFirst: true })
  if (callableToolsBlock) callableParts.push(callableToolsBlock)
  const knowledgeIndexBlock = buildTidiaoKnowledgeIndex()
  if (knowledgeIndexBlock) callableParts.push(`可按需展开的知识库（下面各环境小节相关时会自动补细节）：\n${knowledgeIndexBlock}`)
  if (skillAssembly.layers['1']) callableParts.push(skillAssembly.layers['1'])
  let system = `${DIRECTOR_LAYER_HEADER.outline}\n${outline}`
  if (callableParts.length) system = `${system}\n\n${DIRECTOR_LAYER_HEADER.callable}\n${callableParts.join('\n\n')}`
  // 批次1P：统一上下文是轮级动态业务投影，必须留在 user 动态段，不能击穿 system 稳定前缀。
  const unifiedContextSection = unifiedContextBlock ? `【统一原始可见上下文】\n${unifiedContextBlock}` : ''

  // 层2·当前情境（与统筹同构）：现在时间/地点/天气 + 上一轮已判情境承接（纠偏轮它就是「本轮情境」真值）。
  const lastScenarioBlock = unifiedContextBlock ? '' : String(input.lastScenarioBlock || '').trim()
  const sceneInner = [sceneContext ? `当前场景：${sceneContext}` : '', lastScenarioBlock].filter(Boolean).join('\n')
  const sceneSection = sceneInner ? `${DIRECTOR_LAYER_HEADER.scene}\n${sceneInner}` : ''
  // 层3·对话可见历史（批次C·半持久=本 loop 启动时管线按最新库态现算传入·含本轮刚生成的消息）。
  const visibleHistory = unifiedContextBlock ? '' : String(input.visibleHistory || '').trim()
  const visibleHistorySection = visibleHistory
    ? `${DIRECTOR_LAYER_HEADER.history}\n（整场对话对你可见的消息全景·正文为客观事实投影、无投影为原文·含本轮刚生成的消息。判断用户指代哪条消息/当前情境时先看这里。）\n${visibleHistory}`
    : ''
  // 用户指令行（层5 加粗末行 + 开局段共用）：只弱标注「发起自」楼层引用，**不塞目标消息原文**（批次O 拍板：
  // 硬塞目标会在「要改的其实是更早/其他消息」时误导提调；原文由提调自己 readChatMessage 读进层4）。
  const instruction = String(input.brief?.instruction || '').trim()
  const originRefs = (Array.isArray(input.brief?.targets) ? input.brief.targets : [])
    .map((t) => `${t.ref}${String(t.speakerName || '').trim() ? `（${String(t.speakerName).trim()}）` : ''}`)
    .join('、')
  const instructionLine = instruction
    ? `**【${precisionOnly ? '用户精修' : '用户纠偏'}${originRefs ? `·发起自 ${originRefs}` : ''}】${instruction}**`
    : ''
  // 跨轮记忆（OFF 对照路径专用·重建 ON 时管线传空串）：层5 原样回放取代压缩记忆（真机六验），OFF 无层5 才注入。
  const bandMemory = String(input.bandMemory || '').trim()
  const bandMemorySection = bandMemory
    ? [
        '【本提调带历史记忆·你在这条带子里之前已经做过的事】下面是同一条提调带（＝同一次连续会话）里你之前每一步的决策、调用过的工具、读到/改到的内容、出现的报错，以及用户历次的指令和你与用户的问答。这就是你的记忆，请当成你自己刚刚做过的事来对待——用户问「还记不记得刚才改了什么」时，照它如实回答，不要说「没保留上下文」：',
        bandMemory,
        '（以上是历史记忆。下面是用户这一次的新要求。）'
      ].join('\n')
    : ''
  // 开局装配（runtime 审计真值 + OFF 对照路径实发）：system + user（层3/统一投影→层2→记忆→用户指令行→层4按需知识→层6→开工收束句）。
  // 层0 任务化：任务纲领已上移 system 层0，user 末尾只留一句指回纲领的开工句。
  // 批D·D1（2026-07-12·装配合一）：改调共享 assembleGroupDirectorMessages——本装配没有层5，
  // streamInner 省略（整段跳过不硬造空层5）；记忆/指令行塞进 leadingSections，末句走 closing。
  // 批D·D2（2026-07-12·缓存重排）：leadingSections 内层2/层3 对调（历史近似 append-only 更稳定该更靠前，
  // 情境每轮变故后置）；层6 改经 todoBlock 第四参传入（不再手拼带标题字符串塞进 leadingSections——此前
  // 塞法把层6 错放在「记忆/指令行」之前，违反「层6 压轴」铁律）；命中知识节经 matchedKnowledge 第五参传入，
  // 现在由共享装配器收进层4，再落在层6之前。字节等价（D1 部分）/结构断言（D2 新行为）见 groupDirectorAssembly.spec.js。
  const messages: Array<{ role: 'system' | 'user'; content: string }> = assembleGroupDirectorMessages({
    system,
    leadingSections: [visibleHistorySection, unifiedContextSection, sceneSection, bandMemorySection, instructionLine].filter(Boolean),
    closing: '请按【0·总纲领】处理用户这次的意见；全部处理完按纲领格式收尾（done:true）。'
  }, '', '', skillAssembly.layers['4'])
  // H2（2026-07-04·纠偏升 0-6）：与统筹 harness 同一套共享收集器——层5 日志行（成功结果截 120·标注指向层4）+
  // 层4 容器（超长逐字全文·同参重读覆盖）。批次O：精修子模式同样重建（并入统一 0-6·不再豁免）。
  const promptRebuildEnabled = input.promptRebuild !== false
  const roundLog = createDirectorRoundLogCollector()
  // 重建装配：system 恒定不变（保 KV 前缀缓存·层0 已含任务纲领）；
  // user＝层3/统一投影 → 层2 → 层5(当轮操作日志) → 层4(含命中知识) → 层6 → 续轮收束句。
  // 批次2（2026-07-08·缓存断面）：层4 物理后置到层5 之后——层5 严格 append-only（稳定前缀），层4 是滑窗突变层，
  // 旧序层4 一变就把层5 的前缀缓存整段打掉（与统筹 assembleGroupDirectorMessages 同一份实现，层序改动只此一处）。
  // 批次1P：leadingSections 内层2/层3 仍按缓存稳定性排列；命中知识节经 matchedKnowledge 第五参收进层4。
  // 层5 段头用 DIRECTOR_ROUND_LOG_SECTION_TITLE（单一真值）——查看器识别到即不再拼重复的「本轮往来」段（真机修③同口径）。
  // 批D·D1：改调共享装配函数——streamInner 塞「层5 段头+当轮操作日志」（指令行已由下方 pushLine 内嵌进日志本身，
  // 故 roundLog 参恒传空串，避免共享函数再往 streamInner 后面重复追加一份日志段）；closing 塞纠偏专属口径句
  // （「已发生 vs 未处理」）。
  const assembleRebuiltCorrectionMessages = (): Array<{ role: 'system' | 'user'; content: string }> => {
    const readMaterials = roundLog.renderReadMaterials()
    // 真机七验（2026-07-06 用户诊断·口径矛盾根治）：旧句笼统说「层5=已经完成的步骤」，而用户纠偏/精修指令
    // 恰好就加粗殿后在层5 里——弱模型读出「纠偏已完成」直接 done，纠偏静默失效。现役口径必须区分：
    // 工具调用记录=已发生（勿原样重复）；加粗指令行=尚未处理的新任务。统筹轮那句（groupDirectorPass）无此矛盾
    //（统筹层5 里没有用户指令行），保持原样。
    return assembleGroupDirectorMessages({
      system,
      leadingSections: [visibleHistorySection, unifiedContextSection, sceneSection].filter(Boolean),
      streamInner: `${DIRECTOR_ROUND_LOG_SECTION_TITLE}\n${roundLog.renderLog()}`,
      closing: `【5·提调带信息流】是操作日志：已成功的工具调用不要原样重复。**末尾加粗的【${precisionOnly ? '用户精修' : '用户纠偏'}】行是用户刚提出、尚未处理的新指令**——它出现在日志里只代表「收到」，不代表已完成；处理完它（或向用户说明做不了）才允许收尾（done:true）。`
    }, '', readMaterials, skillAssembly.layers['4'])
  }
  // 真机五验①+六验·同轮互通：层5 不新起空日志，先把本条带已落保真层的历史事件（统筹轮全部步骤 + 历次纠偏 +
  // 失败报错·管线已 restore 进活动容器）**原样回放**进层5，再把用户这次的指令作加粗末行追加——纠偏/精修直接站在
  // 统筹信息流的延续上，超长结果同步归档层4。hasLines() 从 turn 0 就为真 → callModel 第一轮起就走 0-6 重建、
  // 层5 段头恒在，查看器识别到段头即只显示真实 prompt。容器空（旧调用/单测/无带）时只有指令首行，零回归。
  if (promptRebuildEnabled) {
    for (const event of getAppendLogEvents()) roundLog.ingestAppendLogEvent(event)
    if (instructionLine) roundLog.pushLine(`- ${instructionLine}`)
  }
  // option C：发送时把这一轮真实拼好的 prompt 留存进活动 append log，供 state 查看器「喂模型原文」忠实显示
  //（无活动 log 时空操作）。重建路径存重建装配版（自含层5 段头）；OFF 存 append-only 开局版（对照路径原样）。
  // H2：重建路径下 callModel 每 turn 用「最新重建 prompt」刷新这份留存（查看器始终看到最后真实发出的那份）。
  setActiveDirectorPrompt('', renderDirectorPromptText(
    promptRebuildEnabled && roundLog.hasLines() ? assembleRebuiltCorrectionMessages() : messages
  ))

  // 收尾硬门计数（整轮只拦一次·done-todo-gate 与 noop-done-gate 共用同一逃生舱：第二次收尾放行，
  // 允许模型带说明收尾，但不允许一声不吭溜走，也不叠双提醒把模型逼进死循环）。
  let doneGateNudged = false
  // 无动作收尾硬门·哪一步在请求收束：done:true 或整步零工具调用都会让 runtime 收束（runtime :631 两个出口），
  // 两个静默出口都要看住。由下方 recorder hook 每步刷新。
  let doneRequestedTurn = -1
  let noCallsTurn = -1

  // askUser 一次即停（批C·2026-07-12 迁移）：askUser 工具执行成功即带 awaitingUser 标记，
  // 引擎原生以 terminalReason='awaiting-user' 收束 loop（不再需要自定义 afterToolResult halt hook）——
  // 本 hook 只做「记录」：askUser 成功即置位 askUserRequested，供下面两处护栏 hook 判断本轮是否已发起过提问。
  // 精修子模式不注册 askUser，无需本 recorder（passing undefined → runtime 用空 HookRegistry，行为同退役精修 loop）。
  const hookRegistry = precisionOnly ? undefined : new HookRegistry([{
    id: 'tidiao-correction-ask-user-recorder',
    lifecycle: 'afterToolResult',
    appliesTo: { toolName: TIDIAO_ASK_USER_TOOL_NAME, status: 'success' },
    run: () => {
      askUserRequested = true
      return undefined
    }
  }, {
    // 无动作收尾硬门·acted 推导（批次1·2026-07-07 范式优化）：每个工具结果按语义表推导「是否改了世界」——
    // 成功的 world 工具即算（结果级 acted 修正优先，如 consultScript 只算 revised、retryFailedWorkflow 尝试即算）。
    // 取代旧「三策收集器逐个数 + 三个手工观测位」：新工具登记进语义表即自动被硬门认得。
    id: 'tidiao-correction-acted-recorder',
    lifecycle: 'afterToolResult',
    run: (event) => {
      if (event.toolResult && isTidiaoToolResultActed(event.toolResult)) worldActed = true
      return undefined
    }
  }, {
    // 无动作收尾硬门·观测位记录：哪一步在请求收束（done:true 或零工具调用）。
    // 真正的拦截在下方 afterTurn hook——那时本步工具已执行完，改动收集器读到的是准的（「读原文+done 同一步发」也逃不掉）。
    id: 'tidiao-correction-noop-done-recorder',
    lifecycle: 'afterModelMessage',
    run: (event) => {
      const callCount = (event.modelToolCalls ?? []).length
      noCallsTurn = callCount === 0 ? event.turnIndex : -1
      if ((event.modelMessage?.parsed as { done?: unknown } | undefined)?.done === true) doneRequestedTurn = event.turnIndex
      return undefined
    }
  }, {
    // 无动作收尾硬门（2026-07-06 真机「纠偏没效果」根治·同日七验收紧）：模型没落任何纠偏动作（改原文/改提示词/
    // 重生成/新旁白/新角色消息/重投影/改帷幕/重试子工作流/升级/提问全无）就要收束 → 一律拦一次注入提醒续轮。
    // 首版曾留「全程零工具=纯问答不拦」口子，真机七验模型被旧层5 口径误导「纠偏已完成」、0 工具直接 done 正好从
    // 这个口子溜走（静默失效第二次复发）——现役不再区分：纯问答被拦时把回答写进 thought 再 done 一次即可（多一次
    // 小调用，换纠偏永不静默溜走）。第二次收尾放行，避免死循环。
    id: 'tidiao-correction-noop-done-gate',
    lifecycle: 'afterTurn',
    run: (event) => {
      if (doneGateNudged) return undefined
      if (event.turnIndex !== doneRequestedTurn && event.turnIndex !== noCallsTurn) return undefined
      if (escalateHolder.escalation || askUserRequested || resumeHolder.resume) return undefined
      // 批次1：acted 判断改语义表推导（acted recorder hook 按工具执行结果实时累积）——
      // 覆盖面与旧「三策收集器 + 三观测位」逐项等价（改原文/补写/改提示词/重生成/新旁白/新角色消息/
      // 重投影/改帷幕/重试子工作流/改剧本），且新 world 工具登记进语义表即自动纳入。
      if (worldActed) return undefined
      doneGateNudged = true
      const note = '你这一轮还没有做过任何纠偏动作就要收尾。【5·提调带信息流】末尾加粗的用户指令是**尚未处理的新任务**，不是已完成记录——'
        + `如果该改，现在就动手：字句问题用 editChatMessage 改原文；内容被截断/要补写用 appendChatMessage 续写补完；生成方向/要点问题用 readMessagePrompt/editMessagePrompt 改提示词${hasRegenerateTool ? '、再用 regenerateFromPrompt 重生成' : ''}${scriptCtx ? '；需要评估伏笔/因果影响可用 consultScript 异步派编剧，但它不会直接修改正式种子' : ''}；情境整体判错用 escalateCorrection 升级；拿不准用 askUser 问清楚。`
        + '如果用户这一轮确实只是提问/闲聊、或你判断确实什么都不用改：把回答或理由写进 thought，再输出 done:true 即可收尾。'
      roundLog.pushLine(`- **系统提醒：${note}**`)
      return {
        summary: '纠偏无动作硬门：收束时本轮没做过任何纠偏动作，拦一次注入提醒',
        injectMessages: [{ role: 'user', content: note, purpose: 'calibration' }]
      }
    }
  }])

  const runtimeResult = await runAgentRuntime({
    agentName: precisionOnly ? 'TidiaoPrecisionEditAgent' : 'TidiaoCorrectionAgent',
    runtimeVersion: precisionOnly ? 'tidiao-precision-edit-loop-v1' : 'tidiao-correction-loop-v1',
    messages,
    // 接缝重构 Step1：本 loop 自建 toolRegistry（按接缝在位调工厂·见上）+ deferred 模式——recommendedTools（编辑桶 9 常用·
    // 初始激活带 schema）+ toolsearch 越权决定可见/可调。registry 成员＝当轮真有 context 的工具（取代 B3 隐藏·越权目录等价）。
    toolRegistry,
    deferredToolMode: toolSupply.deferredToolMode,
    // 纠偏/精修与统筹同口径：首次检索后装载本轮完整授权 registry 并冻结工具信封。
    deferredToolEpochMode: 'full-authorized-after-first-search',
    recommendedTools: toolSupply.recommendedTools,
    initialActiveTools: toolSupply.initialActiveTools,
    promptSupplyTrace: skillAssembly.trace,
    toolSupplyDiagnostics: toolSupply.diagnostics,
    hookRegistry,
    budget: { maxTurns: CORRECTION_UNLIMITED, maxToolCalls: CORRECTION_UNLIMITED },
    timeoutMs: DIRECTOR_LOOP_TIMEOUT_MS,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.shouldPause ? { shouldPause: input.shouldPause } : {}),
    // H2·每 turn 重建（与统筹 directorPromptRebuild 同开关）：turn>0（已有日志行）时无视 runtime append-only
    // messages，用「system 恒定 + 层3/4/5/6 + 续轮收束句」重建发模型——超长工具结果只在层4 一份、层5 截 120，
    // 根治纠偏轮 prompt/state 膨胀；同时刷新 prompt 留存（查看器/落库快照始终最新）。OFF/精修＝旧路原样转发。
    callModel: (request) => {
      if (promptRebuildEnabled && roundLog.hasLines()) {
        const rebuilt = assembleRebuiltCorrectionMessages()
        setActiveDirectorPrompt('', renderDirectorPromptText(rebuilt))
        return input.callModel({ ...request, messages: rebuilt })
      }
      return input.callModel(request)
    },
    onProgress: (event: AgentRuntimeProgressEvent) => {
      // 批C 迁移备注：askUser 触发的 halt 收束（terminalReason='awaiting-user'）不在 runtime 的通用「异常终止」
      // 通告名单里（只有 terminated-by-hook/budget-exceeded/timeout 会发那条 notice），故这里不再需要吞掉误导中止行。
      // R1-A：记下提调最后一句人话 thought，chat-only 终态（只回答不纠偏）据它作 chatAnswer。
      if (event.kind === 'thought') {
        const t = String(event.thought || '').trim()
        if (t) lastDirectorThought = t
      }
      acc.onRuntimeProgress(event)
    },
    // R3-2/3/5：纠偏 loop 自身保真事件喂入 append log（消息/工具调用/结果 + 报错进 state），与群/单 harness 同口径。
    // H2：同一事件进共享收集器（层5 日志行 + 层4 超长归档），重建 prompt 的数据源（与 append log 同源同序）。
    onEvent: (event) => {
      if (promptRebuildEnabled) roundLog.ingest(event)
      feedAppendLogFromFidelityEvent(event, toolRegistry)
    }
  })

  const reason = runtimeResult.transcript.terminalReason
  if (input.signal?.aborted || reason === 'aborted' || reason === 'paused-for-correction') {
    acc.fail(precisionOnly ? '提调精修已取消' : ABORTED_MESSAGE)
    throw createAbortedError()
  }
  if (reason === 'timeout') {
    acc.fail(precisionOnly ? '提调精修运行超过 20 分钟，已自动截止' : '提调纠偏运行超过 20 分钟，已自动截止')
    throw new Error(precisionOnly
      ? '提调精修失败：运行超过 20 分钟，已自动截止这一轮。'
      : '提调纠偏失败：运行超过 20 分钟，已自动截止这一轮。')
  }

  // R1-B B5-2 item1 真合并·精修子模式收尾（= 退役精修 loop 的收尾语义）：取累积改动 + 重投标记，
  // 无任何改动且非取消时抛错（让上层 toast「精修未改动」）；不走纠偏的 chat-only/strategy 择优。
  if (precisionOnly) {
    const precisionEdits = input.editContext.collectEdits()
    const precisionReproject = input.projectionContext ? input.projectionContext.collectReprojectTargets() : []
    if (!precisionEdits.length && !precisionReproject.length) {
      acc.fail('本轮没有改动任何内容')
      throw new Error('提调精修失败：本轮没有对任何消息做出改动。')
    }
    acc.setPhase('done')
    return {
      strategy: 'direct-edit',
      edits: precisionEdits,
      promptEdits: [],
      regenerations: [],
      escalation: null,
      askUser: null,
      narrationCreations: [],
      castCreations: [],
      reprojectTargets: precisionReproject,
      transcript: runtimeResult.transcript
    }
  }

  const edits = input.editContext.collectEdits()
  const promptEdits = input.promptContext ? input.promptContext.collectPromptEdits() : []

  // 中策兜底：提调改了提示词但没自己调 regenerateFromPrompt → 若注入了重生成接缝，自动据改后提示词补一次重生成
  //（中策必产出新正文；提调显式调过的同一条不重复补）。无接缝时（P2 缺省）改完提示词即收束、交 pipeline 收束后重生成。
  if (hasRegenerateTool && input.regenerateFromEditedPrompt && promptEdits.length) {
    for (const pe of promptEdits) {
      if (regenerations.some((r) => r.kind === pe.kind && r.index === pe.index)) continue
      const out = await input.regenerateFromEditedPrompt({
        ref: pe.ref,
        kind: pe.kind,
        index: pe.index,
        messageId: pe.messageId,
        speakerName: pe.speakerName,
        promptText: pe.promptText
      })
      regenerations.push({
        ref: pe.ref,
        kind: pe.kind,
        index: pe.index,
        messageId: pe.messageId,
        speakerName: pe.speakerName,
        content: String(out?.content ?? '')
      })
    }
  }

  // Q3 新增旁白：loop 内 confirmNarrationCall 确认的每条旁白，收尾据接缝生成正文并写库（编排达标后才生成）。
  // narrationCreations 作顶层结果，可与上/中策并存（既加旁白又改角色字句）。
  const narrationCreations: TidiaoCorrectionNarrationCreation[] = []
  if (narrationCtx && input.generateNarration && narrationCtx.calls.length) {
    for (let i = 0; i < narrationCtx.calls.length; i += 1) {
      const call = narrationCtx.calls[i]
      const placement = narrationPlacements[i] || {}
      const out = await input.generateNarration(call, placement)
      narrationCreations.push({
        content: String(out?.content ?? ''),
        ...(Number(out?.messageId) ? { messageId: Number(out!.messageId) } : {}),
        profileId: call.profileIds[0] || '',
        profileName: call.profileNames[0] || '旁白',
        narrationKind: call.narrationKind,
        informationBearing: call.informationBearing,
        placement
      })
    }
  }

  // 2026-07-06 生成新角色消息：loop 内 addCastDirection 定下的每条方向，收尾经 castSeam 用正常角色链路生成并写库
  // （同 Q3 旁白范式：编排达标后才生成）。单条失败不炸整轮——逐条记结果，与上/中策/新增旁白并存。
  const castCreations: TidiaoCorrectionCastCreation[] = []
  if (castCtx && castSeam && castCtx.state.cast.length) {
    for (const entry of castCtx.state.cast) {
      const label = castCtx.candidateNameById.get(entry.characterId) || entry.characterId
      try {
        const out = await castSeam.generate({ characterId: entry.characterId, direction: entry.direction, label })
        castCreations.push({
          characterId: entry.characterId,
          speakerName: label,
          direction: entry.direction,
          ok: out?.ok !== false,
          ...(out?.message ? { message: String(out.message) } : {}),
          ...(Number(out?.messageId) ? { messageId: Number(out!.messageId) } : {})
        })
      } catch (error) {
        castCreations.push({
          characterId: entry.characterId,
          speakerName: label,
          direction: entry.direction,
          ok: false,
          message: error instanceof Error ? error.message : String(error || '')
        })
      }
    }
  }

  const reprojectTargets = input.projectionContext ? input.projectionContext.collectReprojectTargets() : []

  // 批C（2026-07-12 架构审查·halt 原语迁移）：askUser 的提问信封改由引擎 pendingInteraction 携带——
  // 只在 terminalReason==='awaiting-user' 时非空，据此逆映射回旧口径 TidiaoCorrectionAskUser
  // （title→question、options[].label→options、recommended→recommended），strategy:'ask-user' 对外形状不变。
  const pendingAskUser: TidiaoCorrectionAskUser | null =
    runtimeResult.transcript.terminalReason === 'awaiting-user' && runtimeResult.pendingInteraction
      ? {
          question: runtimeResult.pendingInteraction.title,
          options: (runtimeResult.pendingInteraction.options ?? []).map((option) => option.label),
          ...(runtimeResult.pendingInteraction.recommended ? { recommended: runtimeResult.pendingInteraction.recommended } : {})
        }
      : null

  // 批次B「没把握先问用户」终态优先：提调调过 askUser（拿不准、先问）→ 不当「没做出纠偏」失败，
  // 返回 ask-user 终态，由 pipeline 进「提问态」（复用软停链路：写提问 pending + 决策流转 correcting）等用户答复。
  // 即便提调问前已即时落库过个别改动（onEditCommitted 已落库、不丢），仍以「先问」为本轮主终态。
  if (pendingAskUser) {
    acc.setPhase('done')
    return {
      strategy: 'ask-user',
      edits,
      promptEdits,
      regenerations,
      escalation: escalateHolder.escalation,
      askUser: pendingAskUser,
      narrationCreations,
      castCreations,
      reprojectTargets,
      transcript: runtimeResult.transcript
    }
  }

  // 终态择优分类：下策升级是提调最终决定（即便先试过上/中也以升级为准）→ 其次上策改原文 → 再次中策 → 再次新增旁白。
  // 中策含「改提示词」与「按原提示直接重生成」两形态：promptEdits 或 regenerations 任一非空都算 prompt-regen
  // （用户要的「跳过改提示词直接重生成」即 promptEdits 空、regenerations 非空这条）。
  // create-narration 只是「主策」标签：narrationCreations 始终作顶层结果返回，与上/中策并存时 strategy 仍标上/中。
  let strategy: TidiaoCorrectionStrategy | null = null
  // 续回统筹（2026-07-08）优先：用户明确要继续被中断的统筹轮，即便提调顺手做过局部改动也以交回统筹为终态。
  if (resumeHolder.resume) strategy = 'resume-orchestration'
  else if (escalateHolder.escalation) strategy = 'escalate'
  else if (edits.length) strategy = 'direct-edit'
  else if (promptEdits.length || regenerations.length) strategy = 'prompt-regen'
  else if (narrationCreations.length) strategy = 'create-narration'
  else if (castCreations.length) strategy = 'create-cast'

  // R1-A：strategy=null = 提调跑完(done·非 aborted/timeout，已在 :817-825 提前抛)、却没做任何纠偏动作。
  // 这不是失败，而是「提调判断用户只是提问/闲聊，直接回答收尾」的合法决策结果（协议 :318-324 早已如此引导）。
  // 根治 P14：旧实现此处抛「提调纠偏失败」→ 上层 catch 弹误导红字（与 P25 同族·终态层误判）。
  // 改为返回 chat-only 成功终态：提调回答已经决策流 thought 呈现（累加器 :274 收），acc 收尾为 done(非 failed)。
  // 2026-07-06 配合无动作收尾硬门：模型动过工具却零动作的收束在 loop 内已被拦过一次，仍坚持才落到这里
  //（=真问答，或模型已在 thought 里向用户说明了不改的理由），chat-only 不再吞掉真纠偏。
  if (!strategy) {
    acc.setPhase('done')
    return {
      strategy: 'chat-only',
      edits,
      promptEdits,
      regenerations,
      escalation: null,
      askUser: null,
      narrationCreations,
      castCreations,
      reprojectTargets,
      ...(lastDirectorThought ? { chatAnswer: lastDirectorThought } : {}),
      transcript: runtimeResult.transcript
    }
  }

  acc.setPhase('done')
  return {
    strategy,
    edits,
    promptEdits,
    regenerations,
    escalation: escalateHolder.escalation,
    // 续回统筹（2026-07-08）：续接补充指令随终态带回（pipeline 据此拼续跑 replanText）。
    ...(resumeHolder.resume ? { resumeInstruction: resumeHolder.resume.instruction } : {}),
    askUser: null,
    narrationCreations,
    castCreations,
    reprojectTargets,
    transcript: runtimeResult.transcript
  }
}
