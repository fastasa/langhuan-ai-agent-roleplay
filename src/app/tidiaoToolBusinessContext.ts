/**
 * 提调工具「per-tool 当轮 context」类型集 —— 接缝重构（2026-06-30·工厂闭包捕获机制）。
 *
 * 机制：每个提调工具工厂（`createXxxTool(ctx)`·见 {@link ./tidiaoGlobalTools}）收**本工具专属的当轮 context**
 * 入参、execute 闭包捕获——不再读运行时 `ctx.business`。本文件定义这些 per-tool context 类型（必填字段无 `?`：
 * 漏传变编译期错，根治旧「business 装配 / presentBusinessFields / requiresBusiness 三处人工对账漏一处即运行时隐身失败」）。
 *
 * 边界（关键·别破）：`agentRuntime/`（ToolRegistry/runtime）是 **agent 无关通用件**，绝不 import 本文件里的提调业务类型。
 * 各 loop 启动时按「当轮接缝在位与否」调相关工厂、传对应 context，`new ToolRegistry([...])` 建自己的工具集；
 * registry 成员＝当轮真有 context 的工具（越权 toolsearch 目录与旧 B3 门控等价·零回归）。
 *
 * 两类 context：①小工具用「读改原文/提示词/投影/取料/recall/纠偏信号」轻量 context（下方前半段）；
 * ②深绑 loop 编排态的工具用 decision/replyPlan/curtainScene/scenario/narration sub-context（下方后半段·loop 入口装配自身实现）。
 */

import type { TidiaoChatMessageReadContext } from './tidiaoChatMessageTools'
import type { TidiaoChatMessageEditContext } from './tidiaoChatMessageEditTools'
import type { TidiaoMessagePromptContext } from './tidiaoMessagePromptTools'
import type { TidiaoMessageProjectionContext } from './tidiaoMessageProjectionTools'
import type { TidiaoRetrievalContext } from './tidiaoRetrievalTools'
// 取料预算闸门回调返回工具结果（超预算的错误结果或 null）。business→agentRuntime 单向引用合法（反向禁止）。
import type { ToolExecutionResult } from './agentRuntime/toolRegistry'
// 3d 追加召回落池接缝（群聊导演 loop 取料命中按容器追加进本轮资料池）。import type 仅类型层、编译期擦除，
// 与 groupDirectorHarness 的 `import type { TidiaoToolBusinessContext }` 构成类型层循环（TS 允许、无运行时循环）。
import type { GroupDirectorRecallPoolAppend } from './groupDirectorHarness'
// R1-B B5-2 item2 决策工具解耦：决策态收集的角色方向条目（与 RoundDirectorScript.cast 同结构）。import type 仅类型层。
import type { RoundDirectorCastEntry } from './groupDirectorPass'
// 剧本（2026-07-06）：会话级剧本类型（updateScript 收集态·统筹轮注入/修订）。import type 仅类型层。
// 批次3（2026-07-07 范式优化）：编剧接缝升 input 级（spec 化·messages 构造/模型调用/解析统一在 runSubagent）。
// 编剧只经异步叙事分析接缝进入，不反向依赖本业务 context。
import type { NarrativeScriptwriterDispatchInput } from './narrativeScriptwriterSubagent'
// 状态系统（积木骨架计划批次5·2026-07-08）：仓储接口与星依工具同一份（xingyiStatusSystemTools·类型层擦除）。
import type { XingyiStatusSystemRepository } from './xingyiStatusSystemTools'
// R1-B B5-2 item2b 编排工具解耦：回复编排计划工具的领域类型。GeneratePlanBatchToolCall/ReviewPlanCandidatesToolCall/
// ReplyPlanCandidate/ReplyPlanOrchestratorToolCall 定义在 personalityPlanOrchestrator（纯逻辑家）；
// ReplyPlanBatchToolResult/ReplyPlanReviewToolResult/ReplyPlanCurtainSceneUpdate* /ReplyPlanOrchestratorLoopBudget
// 定义在 replyPlanOrchestratorHarness——后者与本文件 `import type { TidiaoToolBusinessContext }` 构成类型层循环
// （TS 允许、编译期擦除、无运行时循环，同 GroupDirectorRecallPoolAppend 范式）。
import type {
  GeneratePlanBatchToolCall,
  ReviewPlanCandidatesToolCall,
  ReplyPlanCandidate,
  ReplyPlanOrchestratorToolCall
} from './personalityPlanOrchestrator'
import type {
  ReplyPlanBatchToolResult,
  ReplyPlanReviewToolResult,
  ReplyPlanCurtainSceneUpdateToolCall,
  ReplyPlanCurtainSceneUpdateResult,
  ReplyPlanOrchestratorLoopBudget
} from './replyPlanOrchestratorHarness'
// 纠偏 loop 的累加器/重生成接缝领域类型。import type 仅类型层引用、编译期擦除，与 tidiaoCorrectionLoop 的
// `import type { TidiaoToolBusinessContext }` 构成类型层循环（TS 允许、无运行时循环）。B2 收口时这些纠偏领域类型
// 若迁到更中心位置，可消除本处临时循环。
import type {
  TidiaoCorrectionEscalation,
  TidiaoCorrectionResume,
  TidiaoCorrectionRegeneration,
  TidiaoCorrectionRegenRequest,
  TidiaoCorrectionRegenResult
} from './tidiaoCorrectionLoop'
// R1-B B5-2 item2c narration 解耦：旁白 skill profile / 已确认旁白调用领域类型。import type 仅类型层、编译期擦除
// （personalityNarrationSubagent 是独立旁白模块·不反向 import 本文件·无运行时循环）。
import type {
  PersonalityNarrationSubagentProfile,
  PersonalityNarrationCall,
  PersonalityNarrationPlacement
} from './personalityNarrationSubagent'

// ── 接缝重构（2026-06-30）：per-tool 当轮 context 类型（工厂闭包捕获·取代 ctx.business 袋子） ──
// 各工具工厂收下面对应的 context 入参、闭包捕获；各 loop 启动时按接缝在位与否调工厂建自己的工具集。
// 必填字段（无 `?`）漏传变编译期错——根治旧「business 装配 / presentBusinessFields / requiresBusiness 三处对账漏一处则运行时隐身失败」。

/** 取料决策留痕回调（读会话/读投影/取料三件套/recallCharacterBrain 命中后发一条·各 loop 适配本地收集器 push）。 */
export type TidiaoRetrievalDecisionRecorder = (decision: { tool: string; query: string; reason?: string; hitCount?: number }) => void
/** 取料预算闸门回调（消费一次：超预算返回错误结果，否则 null·仅设了预算的 loop 装配）。 */
export type TidiaoRetrievalBudgetGate = () => ToolExecutionResult | null

/** 读会话原文工具（readChatMessage）当轮 context。 */
export interface TidiaoReadChatMessageToolContext {
  /** 读会话原文接缝（必填）。 */
  readContext: TidiaoChatMessageReadContext
  /** 取料预算闸门（仅回复编排有独立预算时装配·缺省=不限）。 */
  consumeRetrievalBudget?: TidiaoRetrievalBudgetGate
  /** 取料决策留痕（缺省=不留痕）。 */
  recordRetrievalDecision?: TidiaoRetrievalDecisionRecorder
}

/** 读改提示词工具（readMessagePrompt/editMessagePrompt·中策·单聊纠偏专属）当轮 context。 */
export interface TidiaoMessagePromptToolContext {
  /** 读/改提示词接缝（必填）。 */
  promptContext: TidiaoMessagePromptContext
}

/** 读投影/标记重投工具（readMessageProjection/reprojectMessage）当轮 context。 */
export interface TidiaoMessageProjectionToolContext {
  /** 读投影 / 标记重投接缝（必填）。 */
  projectionContext: TidiaoMessageProjectionContext
  /** 取料决策留痕（群聊导演读投影留痕·reproject 不用·缺省=不留痕）。 */
  recordRetrievalDecision?: TidiaoRetrievalDecisionRecorder
}

/** 下策升级工具（escalateCorrection·单聊纠偏专属）当轮 context（escalate holder 共享引用·loop 收尾读 escalation）。 */
export interface TidiaoEscalateCorrectionToolContext {
  escalateHolder: { escalation: TidiaoCorrectionEscalation | null }
}

/** 续回统筹信号工具（resumeOrchestration·纠偏轮专属·2026-07-08 停止=中断保留闭环）当轮 context
 *（resume holder 共享引用·loop 收尾读·与 escalateCorrection 同为「终止本 loop、交回系统执行」的信号工具）。 */
export interface TidiaoResumeOrchestrationToolContext {
  resumeHolder: { resume: TidiaoCorrectionResume | null }
}

/** 中策重生成工具（regenerateFromPrompt·单聊纠偏专属）当轮 context。 */
export interface TidiaoRegenerateFromPromptToolContext {
  /** 读提示词接缝（据消息当前提示词调正常回复模型重生成·必填）。 */
  promptContext: TidiaoMessagePromptContext
  /** 中策重生成接缝（必填）。 */
  regenerateSeam: (request: TidiaoCorrectionRegenRequest) => Promise<TidiaoCorrectionRegenResult> | TidiaoCorrectionRegenResult
  /** 重生成累加器（共享引用·覆盖式记录·loop 收尾据此写回新版本）。 */
  regenerations: TidiaoCorrectionRegeneration[]
}

/** 召回角色大脑工具（recallCharacterBrain·群聊导演专属·范围受限铁律）当轮 context。
 *  schema 在工厂期用 candidates.text 直接造静态（不再 schemaFactory·闭包捕获后候选清单工厂期已知）。 */
export interface TidiaoRecallCharacterBrainToolContext {
  /** 本轮出场候选名单（set=校验 characterId 是否本轮候选·text=候选清单文案·schema 描述/校验失败提示用·必填）。 */
  candidates: { set: Set<string>; text: string }
  /** 按角色 characterId + 检索意图追加召回他自己大脑+公共区（绝不查别人/文档库·必填·= recallPoolAppend.recallCharacter）。 */
  recallCharacter: (characterId: string, query: string, topK?: number) => Promise<Array<{ unitId: string; title: string; snippet: string; score?: number }>>
  /** 取料决策留痕（缺省=不留痕）。 */
  recordRetrievalDecision?: TidiaoRetrievalDecisionRecorder
}

/** 派「采风」钻取工具（dispatchResearch·统筹专属·状态系统融入提调计划批次2）当轮 context。
 *  dispatch=管线装配的采风运行接缝（runCaifengResearch+回执渲染在管线侧收口——本类型不 import 采风模块，
 *  保持 tidiaoGlobalTools→caifengSubagent 零依赖·无循环）。返回已渲染好的回执文本+成败标记。 */
export interface TidiaoResearchDispatchContext {
  dispatch: (input: { task: string; instructions: string; focus?: string; timeoutMinutes?: number }) => Promise<{
    content: string
    ok: boolean
    details?: Record<string, unknown>
  }>
}

/** 派「绘舆」作图工具（dispatchMapWork·统筹+纠偏·地图系统批5·2026-07-11）当轮 context。
 *  dispatch=管线装配的绘舆运行接缝（runHuiyuMapWork+回执渲染在管线/huiyuSubagent 侧收口——同 research
 *  范式零依赖）。会话未挂世界的判定也在接缝闭包内（回执如实说明「未加入世界无法作图」·不标工具错误）。
 *  批D（笔刷约束系统·阶段管线）：mode 三选一（draft 草案直返/draw 直落笔/staged 阶段制 stage-per-dispatch）；
 *  staged 的每次派发只做当前阶段的一个分段（stagedStep：缺省 draft→draw→confirmStage），回执引导提调
 *  用自己的 askUser 问用户拿答复后带参重新派发——阶段状态由 meta.confirmedAtStage 跨调用自持，无嵌套挂起。 */
export interface TidiaoMapWorkDispatchContext {
  dispatch: (input: {
    task: string
    instructions: string
    focus?: string
    mode: 'draft' | 'draw' | 'staged'
    stagedStep?: 'draft' | 'draw' | 'confirmStage'
    confirmAnswer?: string
    override?: 'terraform'
  }) => Promise<{
    content: string
    ok: boolean
    details?: Record<string, unknown>
  }>
}

/** 取料三件套工具（recallSemantic/searchWorldText/fetchUnitDetail）当轮 context。 */
export interface TidiaoRetrievalToolContext {
  /** 取料三件套接缝（必填）。 */
  retrievalContext: TidiaoRetrievalContext
  /** 取料预算闸门（仅回复编排有独立预算时装配·缺省=不限）。 */
  consumeRetrievalBudget?: TidiaoRetrievalBudgetGate
  /** 取料决策留痕（缺省=不留痕）。 */
  recordRetrievalDecision?: TidiaoRetrievalDecisionRecorder
  /** 3d 追加召回落池接缝（仅群聊导演 recallRoundPool ON 时装配·世界料命中落世界池·缺省=不落池）。 */
  recallPoolAppend?: GroupDirectorRecallPoolAppend
}

/** 锚定精修改原文工具（editChatMessage）当轮 context。 */
export interface TidiaoEditChatMessageToolContext {
  /** 锚定精修接缝（必填）。 */
  editContext: TidiaoChatMessageEditContext
  /** 精修目标信号回调（B2 段级光带高亮·2026-07-11 起纠偏/精修两条支路都装配，谁调了编辑工具谁点亮·缺省 no-op）。 */
  onEditTargeted?: (target: { messageId: number; ref: string; oldText: string }) => void
  /** 即时落库回调（每成功精改一条即上抛改后完整内容·缺省 no-op）。 */
  onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>
}

/** R1-B B5-2 item2：群聊轮级提调决策工具的收集态（共享引用·loop 收尾据此组装 RoundDirectorScript）。
 *  从 groupDirectorHarness 的 DirectorDecisionState 解耦上来——决策工具进全局池后由 ctx.business 承载，不再闭包捕获。 */
export interface TidiaoDecisionState {
  /** 提调判定的情境 skill code + body（轮级共用，下发给分镜）。 */
  scenarioCode: string
  scenarioBody: string
  /** 逐个 addCastDirection 累积的有序出场角色 + 方向。 */
  cast: RoundDirectorCastEntry[]
  /** finishRound 是否调用过 + 收尾情境小结。 */
  finished: boolean
  finishSituation: string
  /** 批次F·逃生舱留痕：finishRound 带 unfinished（未完成项+原因）强制收尾时的说明原文（未带=空串）。 */
  finishUnfinished: string
}

/** R1-B B5-2 item2：决策工具当轮上下文（readScenarioSkill/addCastDirection/finishRound 的校验数据 + 收集态 + 回调）。
 *  候选/排除/重复/情境查体校验因 validateArgs 无 ctx，全部在 execute 读本对象判定（同 recallCharacterBrain B1+B4 范式）。 */
export interface TidiaoDecisionContext {
  // item2c：readScenarioBody/availableScenarioCodes 已移到统一 TidiaoScenarioContext（readScenarioSkill 两版收口）。
  /** addCastDirection 校验：本轮出场候选集。 */
  candidateSet: Set<string>
  /** addCastDirection：characterId → 角色名（挂镜 label / 回执文案用）。 */
  candidateNameById: Map<string, string>
  /** addCastDirection 校验：已被排除不能出场的角色集。 */
  excludedSet: Set<string>
  /** 收集态（共享引用·loop 收尾读同一对象组装剧本）。 */
  state: TidiaoDecisionState
  /** addCastDirection 成功后挂角色镜（缺省 no-op·仅导演带模式装配）。 */
  onCastAdded?: (entry: { characterId: string; direction: string; label: string }) => void
  /** reviseCastDirection 成功后改角色镜方向（缺省 no-op·仅导演带模式装配）。 */
  onCastRevised?: (entry: { characterId: string; direction: string; label: string; reason: string }) => void
  /** 剧本硬门（2026-07-06 用户拍板「统筹每轮先读剧本」·subagent 形态）：返回本轮是否已用 consultScript 问过编剧
   *  （发起过调用即算·编剧临时失败不锁死收尾）。没问过时第一次 finishRound 被拒并要求先 consultScript；
   *  只拦一次防死锁。缺省（剧本接缝不在位）=不校验。 */
  hasConsultedScript?: () => boolean
  /** 轮后补演允许只落账或只挂旁白，不强制重复安排角色。普通前置统筹仍必须至少定一个角色。 */
  allowEmptyCast?: boolean
  /** finishRound 前的业务硬门；返回非空文案即拒绝收尾。用于强制结清待引爆种子等不可带出本轮的债务。 */
  validateBeforeFinish?: () => string | null
}

/** 世界剧本 Agent 调用工具（consultScript）的当轮 context。
 * holder 只记录本轮是否已经派遣；正式结果经持久异步事件箱返回，并落世界叙事种子真值。 */
export interface TidiaoScriptContext {
  holder: { consulted: boolean }
  /** 叙事种子合并计划批次3：只派发，不等待。结果进入持久异步事件收件箱。 */
  dispatchScriptwriter: (input: NarrativeScriptwriterDispatchInput) => { callId: string }
}

/** R1-B B5-2 item2b：回复编排工具的生成态可变切片（共享引用·loop 收尾据此读候选/计划调用序列）。
 *  从 ReplyPlanRuntimeState 上提的「编排工具读写到的字段」结构子集——入口直接把整个 ReplyPlanRuntimeState 当本接口传
 *  （结构兼容·额外字段忽略），故工具写入的计数/累加器收尾仍读得到。预算/单计划标志只读、计数态读写。 */
export interface TidiaoReplyPlanState {
  /** 提调下发/读到的本轮情境 code + body（readScenarioSkill 留 loop，但 curtain/生成轮收尾仍读它）。 */
  scenario: string
  scenarioBody: string
  /** 元工具（updateCurtainScene/getToolManual/readScenarioSkill）累计调用次数（独立元工具预算）。 */
  metaCalls: number
  /** generatePlanBatch 成功/失败计数（generateErrorCount>0 回退模型驱动评审，不自动收束）。 */
  generateCalls: number
  generateErrorCount: number
  /** reviewPlanCandidates 累计调用次数。 */
  reviewCalls: number
  /** 候选计划累加器（generatePlanBatch 每批 push·评审/收尾读同一引用）。 */
  candidates: ReplyPlanCandidate[]
  /** 计划工具调用序列（generate/review 各 push 一条·收尾装配审计）。 */
  planToolCalls: ReplyPlanOrchestratorToolCall[]
  /** 评审结果（reviewPlanCandidates/自动评审写·收尾读）。 */
  reviewResult: ReplyPlanReviewToolResult | null
  /** 帷幕时间地点修改结果（updateCurtainScene 写·情境收束通知/收尾读）。 */
  curtainSceneUpdate: ReplyPlanCurtainSceneUpdateResult | null
  /** 单计划模式（normal_recall）：generatePlanBatch 的 intensities 必须恰好 1 个（校验下移 execute 用）。 */
  singlePlanOnly: boolean
  /** 各项调用上限（元工具/计划批次/强度/评审/最小评审候选数）。 */
  budget: ReplyPlanOrchestratorLoopBudget
}

/** R1-B B5-2 item2b：回复编排工具当轮上下文（4 编排工具的生成态共享引用 + loop 专属操作回调）。
 *  纯 transform（toGenerateToolCall/describeGenerateArgError/renderGenerateResultText/buildDegradedReviewResult 等）
 *  无 loop 绑定、由 tidiaoGlobalTools 直接 value-import 复用，不进本上下文；本上下文只承载「需绑定 loop 当轮 input/config/
 *  directorAcc/signal」的操作（同 item2a readScenarioBody/onCastAdded 回调范式）。 */
export interface TidiaoReplyPlanContext {
  /** 生成态收集（共享引用·loop 收尾读同一对象）。 */
  state: TidiaoReplyPlanState
  /** getToolManual：按工具名查手册（绑定 state.config.tools；命中返回 manual·未命中 null）。 */
  getToolManual: (name: string) => string | null
  /** generatePlanBatch 接缝（绑定 input.generatePlanBatch；合并生成协议 2026-07-08：一次调用收全部类别组、
   *  一次计划模型调用产出全部候选；旧平铺单类别调用归一化成单元素数组走同一路）。 */
  runGeneratePlanBatch: (calls: GeneratePlanBatchToolCall[]) => Promise<ReplyPlanBatchToolResult>
  /** reviewPlanCandidates 接缝（绑定 input.reviewPlanCandidates；本地 ReRanker 评审候选）。 */
  runReviewPlanCandidates: (call: ReviewPlanCandidatesToolCall, candidates: ReplyPlanCandidate[]) => Promise<ReplyPlanReviewToolResult>
  /** 评审降级留痕（绑定 input.onReviewDegraded；缺省 no-op）。 */
  onReviewDegraded?: (reason: string) => void
  /** 情境收束尽早通知（绑定 notifyScenarioResolvedIfNeeded(state)·非纯·触 input.onScenarioResolved）。 */
  notifyScenarioResolved: () => Promise<void>
  /** generatePlanBatch 成功后取「下给生成模型的 planPrompt」实时更新角色镜方向（绑定 directorAcc?.noteCastDirection·缺省 no-op）。 */
  noteCastDirection?: (planPrompt: string) => void
  /** 中止判定（绑定 input.signal + ABORTED_MESSAGE/AbortError）：取消信号原样抛出、不吞成可重试错误。 */
  isAbortError: (error: unknown) => boolean
}

/** 帷幕修改工具（updateCurtainScene）当轮上下文（2026-06-29 从 replyPlan 解耦）：单一定义 execute 只读本接缝，
 *  两条 loop 各装配自身实现——回复编排 loop 带元工具预算闸门 + 结果留痕（写 state.curtainSceneUpdate 供情境收束），
 *  纠偏 loop 只带写帷幕回调（不限预算/不留痕）。与 TidiaoScenarioContext.consumeBudget 同范式。 */
export interface TidiaoCurtainSceneContext {
  /** 真正写会话帷幕真值的接缝（外层 pipeline 提供：单聊/群聊均改当前会话帷幕时间/地点/天气）。 */
  updateCurtainScene: (call: ReplyPlanCurtainSceneUpdateToolCall) => ReplyPlanCurtainSceneUpdateResult | Promise<ReplyPlanCurtainSceneUpdateResult>
  /** 元工具预算闸门（回复编排消费 state.metaCalls·超预算返回错误结果；纠偏 loop 不限=缺省 no-op）。 */
  consumeBudget?: () => ToolExecutionResult | null
  /** 结果留痕（回复编排写 state.curtainSceneUpdate 供情境收束通知/收尾读；纠偏 loop 缺省=不留）。 */
  recordResult?: (result: ReplyPlanCurtainSceneUpdateResult) => void
}

/** R1-B B5-2 item2c：判情境工具（readScenarioSkill）统一接缝——两版同名定义（群聊导演 decision 版 + 演员 replyPlan 版）
 *  收口成单一定义读本接缝。两版历史差异（code 规范化 / 元工具预算 / 挂载摘要 / 写回 state 语义 / 错误文案）全封装进
 *  各 loop 的接缝实现，工具 execute 单一（修根因·统一协议·非 business 分支胶水）。 */
export interface TidiaoScenarioContext {
  /** 规范化模型给的 raw code（群聊导演=trim·演员=trim+toLowerCase·两版差异保真）。 */
  normalizeCode: (rawCode: string) => string
  /** 按规范 code 查情境正文（命中返回 body·未命中 null）。群聊导演=decision.readScenarioBody·演员=readReplyPlanScenarioBody(config.scenarios)。 */
  readBody: (code: string) => string | null
  /** 写回当轮 state（封装两版写回语义差异：群聊导演命中才写 scenarioCode/Body 无条件覆盖·未命中不写；
   *  演员先写 scenario=code〈首次·body 空也写〉再有条件写 scenarioBody）。execute 在查体后无条件调一次、传 body|null。 */
  applyResult: (code: string, body: string | null) => void
  /** 未命中错误文案（群聊导演带可用清单·演员「未找到情境 X 的正文」·两版文案保真）。 */
  notFoundMessage: (code: string) => string
  /** 命中正文后取挂载提示词摘要（演员 #7·拼进 content + details.mountedPromptDigest；群聊导演缺省→无摘要）。 */
  mountedDigest?: (code: string) => string | undefined
  /** 元工具预算闸门（演员 metaCalls·超预算返回错误结果·消费一次；群聊导演缺省 no-op=不限）。 */
  consumeBudget?: () => ToolExecutionResult | null
  /** 命中正文后追加在喂模型 content 尾部的定界说明（不进 details.body、不进 applyResult——正文真值不被污染，
   *  下发给分镜的 scenarioBody 仍是纯正文）。群聊导演用它标注「正文里的 generatePlanBatch 等工具指令
   *  是给下游演员 loop 的、不在提调这层」，根治 2026-07-04 提调被情境正文带偏只取料不决策的真机事故；
   *  演员 loop 缺省不传=零变化。 */
  contentSuffix?: string
}

/** 真机五验④（2026-07-05）·重试失败子工作流接缝：注册表摘要 + 执行器（pipeline 注入·那里才有生成链路依赖）。
 *  纠偏 loop 装配在位即注册 retryFailedWorkflow 工具；单元清单/重跑参数快照的家在 roundRetryUnits.ts。 */
export interface TidiaoRetryContext {
  /** 列当前轮失败单元摘要（提调据此决定重试哪个）。 */
  listUnits: () => Array<{ id: string; kind: string; label: string; lastError: string; attempts: number }>
  /** 重跑一个失败单元：成功即从注册表移除；失败放回并带回人话原因。 */
  retryUnit: (unitId: string) => Promise<{ ok: boolean; message: string }>
}

/** R1-B B5-2 item2c：旁白两件套（readNarrationSkill/confirmNarrationCall）统一接缝——把 createNarrationToolKit 的
 *  闭包动态态（profiles 解析 / 已读态 / 确认收集态 / 预算 / 三 loop 投影 wrapping）解耦进 business，工具定义进单一
 *  registry（同 decision/replyPlan 范式·validateArgs 校验下移 execute 读本接缝）。三条 loop 入口各装配。 */
export interface TidiaoNarrationContext {
  /** 容错解析模型给的 profile id/名称 → {ids（去重·解析成功）, unresolved（对不上的原值·报错引导用）}。 */
  resolveProfileIds: (args: Record<string, unknown>) => { ids: string[]; unresolved: string[] }
  /** 可用 profiles 清单文案（未知 id 错误提示用·availableHint）。 */
  availableHint: string
  /** profileId → profile（readNarrationSkill 拼内容本体 / confirmNarrationCall 取名与默认旁白类型）。 */
  profileById: (id: string) => PersonalityNarrationSubagentProfile | undefined
  /** 已读 skill 集（readNarrationSkill 成功写入 / confirmNarrationCall 校验「必须先读」·共享引用收集态）。 */
  readProfileIds: Set<string>
  /** 已确认旁白调用收集（confirmNarrationCall push·校验重复 / 预算·loop 收尾读同一引用）。 */
  calls: PersonalityNarrationCall[]
  /** 本轮最多确认几个旁白（confirmNarrationCall 预算闸门·maxCalls）。 */
  maxCalls: number
  /** confirmNarrationCall 成功 push 后的投影副作用（三 loop 的 noteNarrationShot / narrationPlacements wrapping 回调化·缺省 no-op）。
   *  入参 call=刚 push 的旁白调用（noteNarrationShot 用）·args=本次 toolCall.args（纠偏 loop resolveNarrationPlacement 用 insertAfter）。 */
  onConfirmed?: (call: PersonalityNarrationCall, args: Record<string, unknown>) => void
  /** 旁白穿插（2026-07-06）：统筹轮 insertAfter 锚点解析——「开场/收尾/角色名或characterId」→ call.placement；
   *  返回 error=锚点对不上候选（execute 以 INVALID_ARGUMENT 回执引导重发）。缺省（纠偏/演员/subagent loop）=
   *  不解析、不写 placement——纠偏的楼层引用锚点仍走 onConfirmed args 自解析（两套锚点语义不混）。 */
  resolveInsertAfter?: (raw: string) => { placement?: PersonalityNarrationPlacement; error?: string }
  /** reviseNarrationDirection 成功改写某条已确认旁白的 generatedPrompt 后的投影副作用（改旁白镜方向·缺省 no-op）。
   *  入参 index=被改的旁白在 calls 里的下标（0 起，与「第几条旁白」的人话序号 index+1 对应）；reason=模型给的改动说明（可空）。 */
  onRevised?: (call: PersonalityNarrationCall, index: number, reason: string) => void
}

/** 状态系统（积木骨架计划批次5·2026-07-08）：提调轮内读/改状态栏接缝。
 *  sessionId=当前会话；repository=状态系统仓储（管线装配=chatRepository 六函数·与星依工具同一份服务端真值）；
 *  characterOptions=会话成员（宿主名渲染用·可空则宿主显示退化成 id）。装配函数=tidiaoCorrectionAssembly
 *  的 buildTidiaoStatusSystemSeam；统筹/纠偏两 loop 接缝在位即注册 readStatusPanels/updateStatusPanel。
 *  融入计划批次4（2026-07-10）起：统筹 scope 确认续跑轮的建卡两件套（saveStatusTemplate/saveStatusPanel
 *  提调版）也吃本接缝（characterOptions 兼作 host=角色 的解析候选）。 */
export interface TidiaoStatusSystemToolContext {
  sessionId: string
  repository: XingyiStatusSystemRepository
  characterOptions?: Array<{ id: string; name: string; participantId?: string }>
}

/** 本轮硬代码召回到的世界级叙事种子只读接缝；allowedSeedIds 防止工具越过召回集合枚举远处种子。 */
export interface TidiaoNarrativeSeedReadContext {
  allowedSeedIds: Set<string>
  readSeed: (seedId: string) => Promise<Record<string, any>>
  recordRetrievalDecision?: TidiaoRetrievalDecisionRecorder
}

export interface TidiaoNarrativeSeedWriteContext {
  worldId: string
  sessionId: string
  directorRunId: string
  readSeed: (seedId: string) => Promise<Record<string, any>>
  createSeed: (input: Record<string, unknown>) => Promise<Record<string, any>>
  updateSeed: (seedId: string, input: Record<string, unknown>) => Promise<Record<string, any>>
}

/** 提调建状态栏前 scope 确认（并行编排计划批次B·2026-07-10 非阻塞化，取代批次4 挂起 holder 形态）：
 *  confirmStatusScope 工具经本接缝把请求交给管线（写全局 pending 弹卡）——**不终止统筹 loop**，
 *  统筹继续排戏；用户确认后由管线 handler 派「造册」子agent后台建栏，取消则记拒绝。 */
export interface TidiaoStatusScopeSignalContext {
  /** 登记 scope 确认请求（管线闭包：防重/拒绝检查+写 tidiaoStatusScopeState pending 弹卡）。
   *  返回 null=登记成功；返回文案=不能登记的原因（已有待确认卡/用户已拒绝过该目标），工具原样回执给模型。 */
  requestScopeConfirm: (request: import('./xingyiStatusScopeTool').XingyiStatusScopeRequest) => string | null
}
