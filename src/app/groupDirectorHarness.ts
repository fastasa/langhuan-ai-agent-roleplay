/**
 * 群聊导演「真 loop」骨架 —— 提调扩展群聊 批次 D1。
 *
 * 把现役群聊统筹 pass（一次性 callAI 盲判）升格为复用 {@link runAgentRuntime} 底座的 harness loop：
 * 提调可先用「读会话楼层 readChatMessage / 读消息投影 readMessageProjection」核对客观事实，再输出整轮剧本，
 * 让剧本 grounding 到真实历史/客观事实而非盲判。**产出仍是 RoundDirectorScript**（群聊导演形状，不套单聊一条计划）。
 *
 * 复用边界（D0 核对·权威）：
 * - 底座复用 `runAgentRuntime` + `ToolRegistry` + 原生 function-calling，不复用单聊 `runReplyPlanOrchestratorHarness`（语义不符）。
 * - 工具复用纯逻辑 `runTidiaoReadChatMessages` / `runTidiaoReadMessageProjection` + session 级接缝（与单聊精修/纠偏 loop 同口径）。
 * - 提调只读不改原文：只挂 readChatMessage + readMessageProjection，**不挂 reprojectMessage**（标记重投是改原文 loop 的事）。
 *
 * 编排带载体：loop 的工具步骤（读楼层/读投影）经决策流落进新带 TidiaoDirectorStreamBand 的 tool 工具条
 * （与单聊一致）；thoughts 仍是模型的实时旁述（唯一一份）。
 * 一轮一条硬约束：决策流（thoughts + 工具步骤）全部聚合进这一条剧本，绝不每角色各出一条。
 */

import { runAgentRuntime, type AgentRuntimeMessage } from './agentRuntime/runtime'
import { createSessionSubagentControlCapability } from './agentRuntime/subagentControl'
// R3-2：把 runtime 上抛的保真事件 append 进当前活动 append log（pipeline 已按 runId 起 log；无活动 log 时 append 自动空操作）。
import { feedAppendLogFromFidelityEvent } from './agentState/appendLogFeed'
// P2 批 E2（2026-07-12 架构审查·规则常量单真值化）：「必须真发起原生函数调用才生效」核心句单点收编，见该文件注释。
import { TOOL_CALL_REALITY_RULE } from './agentProtocols/sharedRules'
// option C（2026-07-01·发送时留存真实 prompt）：拼好 messages 后把真实 prompt 存进活动 log，供查看器「喂模型原文」忠实显示。
import { renderDirectorPromptText, setActiveDirectorPrompt } from './agentState/appendLog'
import { SEARCH_APPEND_LOG_TOOL_NAME, createSearchAppendLogTool } from './agentState/searchAppendLogTool'
import { ToolRegistry, type ToolDefinition } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply, resolveAgentRuntimeToolSupply } from './agentSupply'
import {
  createTidiaoDirectorStreamAccumulator,
  directorKindFromStage
} from './tidiaoDirectorStreamAccumulator'
import type { TidiaoDirectorStream, TidiaoDecisionKind, TidiaoStreamTool } from './tidiaoDirectorStream'
import {
  assembleGroupDirectorMessages,
  buildGroupDirectorPromptParts,
  parseGroupDirectorOutput,
  renderDirectorCallableToolsBlock,
  DIRECTOR_LOOP_TIMEOUT_MS,
  type GroupDirectorPassInput,
  type RoundDirectorCastEntry,
  type RoundDirectorScript
} from './groupDirectorPass'
// 批次D（2026-07-02·层5 动态提示词）：每 turn 重建 prompt 时把当轮保真事件渲染成「本轮操作日志」进层5 尾部。
// 批次E（2026-07-03·层4 已读资料）+ H2（2026-07-04 收口）：日志行截断 + 超长全文挪层4 的收集逻辑
// 收进共享 createDirectorRoundLogCollector（统筹/纠偏两 loop 同一套·联动能力·勿再内联重写）。
import { createDirectorRoundLogCollector } from './directorRoundLog'
// 真机修②（2026-07-03·空转 nudge）：决策 loop 里模型「光吐 thought 不调工具」时注入提醒续轮，不再直接收尾判败。
import { HookRegistry } from './agentRuntime/hookRegistry'
import { createEmptyTurnContinuationGate } from './agentRuntime/continuationGate'
// 支线②·提调知识库：运行时读取 + 渐进披露（身份/过程输出口吻/聊天区环境/能力清单）。
// 增量4：buildTidiaoKnowledgeIndex 单取 2.0 速览索引给层1「可调用资料」（层0知识块改 includeEnvIndex:false 不重复）。
import {
  buildTidiaoKnowledgeInjection,
  buildTidiaoKnowledgeIndex,
  matchTidiaoEnvironmentManualSelectors
} from './agentKnowledge/tidiaoKnowledge'
import { renderChatSessionWorldAgentContext, type ChatSessionWorldAgentContext } from './chatSessionWorldAgentContext'
import {
  readReplyPlanScenarioBody,
  renderReplyPlanScenarioGuide,
  type ReplyPlanScenarioConfig
} from './personalityPlanOrchestrator'
import {
  buildDirectorNarrationSkillGuide,
  // R1-B B5-2 item2c：旁白两件套解耦——工具定义已迁全局 tidiaoGlobalTools，本 loop 改用 buildNarrationBusinessContext 装配 ctx.business.narration。
  buildNarrationBusinessContext,
  // 旁白穿插（2026-07-06）：insertAfter 锚点解析器工厂（开场/收尾/候选角色 → placement）。
  buildDirectorNarrationInsertAfterResolver,
  type PersonalityNarrationCall,
  type PersonalityNarrationSubagentProfile
} from './personalityNarrationSubagent'
import {
  type TidiaoChatMessageReadContext,
  TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME
} from './tidiaoChatMessageTools'
import {
  type TidiaoMessageProjectionContext,
  TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME
} from './tidiaoMessageProjectionTools'
// 批次E·层4：readMessagePrompt 接进统筹 loop（拍板①=只读历史消息已存 promptLog·懒取接缝由管线装配）。
import {
  type TidiaoMessagePromptContext,
  TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME
} from './tidiaoMessagePromptTools'
// 接缝重构（2026-06-30）：工具从「运行时读 ctx.business」改「工厂闭包捕获 context」——本 loop 启动时按接缝在位调工厂建自己的工具集。
// 融入计划批次3（2026-07-10 用户拍板）：取料三件套（recallSemantic/searchWorldText/fetchUnitDetail）与
// recallCharacterBrain 已从统筹本体下架移交「采风」子 agent（buildCaifengToolset 装配同款工厂+同一份接缝·落池共享），
// 统筹重取料一律 dispatchResearch；轻量单点读（readChatMessage/readMessageProjection/searchDirectorMemory）保留。
// ⚠️ 单聊回复编排 loop（replyPlanOrchestratorHarness）的三件套不在本口径内、维持原样。
import {
  createReadChatMessageTool,
  createReadMessageProjectionTool,
  createReprojectMessageTool,
  createReadScenarioSkillTool,
  createAddCastDirectionTool,
  createReviseCastDirectionTool,
  createFinishRoundTool,
  createReadNarrationSkillTool,
  createConfirmNarrationCallTool,
  createReviseNarrationDirectionTool,
  createReadMessagePromptTool,
  createUpdateCurtainSceneTool,
  createConsultScriptTool,
  createReadStatusPanelsTool,
  createReadNarrativeSeedTool,
  createCreateNarrativeSeedTool,
  createUpdateNarrativeSeedTool,
  createUpdateStatusPanelTool,
  createDispatchResearchTool,
  // 绘舆作图派发（地图系统批5·2026-07-11）：剧情地图信号→派绘舆更新舆图并带回格局摘要。
  createDispatchMapWorkTool,
  // 建状态栏 scope 确认（批次4 挂起→并行编排计划批次B 非阻塞化 2026-07-10）：弹卡不打断统筹；
  // 建卡两件套已迁「造册」子agent工具集（zaoceSubagent.buildZaoceToolset），统筹不再注册。
  createTidiaoConfirmStatusScopeTool,
  TIDIAO_DISPATCH_RESEARCH_TOOL_NAME,
  TIDIAO_DISPATCH_MAP_WORK_TOOL_NAME,
  // 串行压缩计划批D（2026-07-13）：判情境进并发白名单——execute 纯读（写域=当轮内存 scenario 标量，
  // 与白名单其他工具不相交，见 createReadScenarioSkillTool 实查注释）。
  TIDIAO_READ_SCENARIO_SKILL_TOOL_NAME,
  // 批次1（2026-07-07 范式优化）：工具集建 registry 前过语义表登记护栏（漏登记=启动即抛·契约测试兜底）。
  assertTidiaoToolMutationSemanticsRegistered,
  TIDIAO_CONSULT_SCRIPT_TOOL_NAME,
  TIDIAO_READ_STATUS_PANELS_TOOL_NAME,
  TIDIAO_READ_NARRATIVE_SEED_TOOL_NAME,
  TIDIAO_CREATE_NARRATIVE_SEED_TOOL_NAME,
  TIDIAO_UPDATE_NARRATIVE_SEED_TOOL_NAME,
  TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME,
  TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME
} from './tidiaoGlobalTools'
// 世界剧本接缝：提调只派遣编剧 Agent，结果落世界叙事种子正式真值。
import {
  ackDeferredAgentEvents,
  activateDeferredAgentRun,
  claimDeferredAgentEvents,
  closeDeferredAgentRun,
  releaseDeferredAgentEvents,
  renderDeferredScriptwriterEvents
} from './deferredAgentEventQueue'
// R1-B 门槛1：通用能力工具 execute 从「闭包捕获接缝/收集器/候选名单」改为「读 ctx.business」（断言成提调业务上下文聚合接口）。
import type { TidiaoDecisionState, TidiaoNarrationContext, TidiaoScenarioContext, TidiaoDecisionContext, TidiaoScriptContext, TidiaoCurtainSceneContext, TidiaoStatusSystemToolContext, TidiaoNarrativeSeedReadContext, TidiaoNarrativeSeedWriteContext, TidiaoResearchDispatchContext, TidiaoMapWorkDispatchContext, TidiaoStatusScopeSignalContext } from './tidiaoToolBusinessContext'

/** 群聊导演 loop 预算（旧一次性剧本路径）：grounding 用，几轮足够；超出由 runtime 在步骤边界收束。 */
const GROUP_DIRECTOR_LOOP_BUDGET = { maxTurns: 6, maxToolCalls: 10 }

/** 决策 loop 不用固定工具步数截断正常统筹，死循环由硬超时与空转 nudge 收束。 */
const GROUP_DIRECTOR_DECISION_UNLIMITED = 1_000_000
const GROUP_DIRECTOR_DECISION_LOOP_BUDGET = { maxTurns: GROUP_DIRECTOR_DECISION_UNLIMITED, maxToolCalls: GROUP_DIRECTOR_DECISION_UNLIMITED }

/** 互不依赖的采风、编剧咨询与情境读取允许同轮并发。 */
export const GROUP_DIRECTOR_CONCURRENT_TOOLS = [
  TIDIAO_DISPATCH_RESEARCH_TOOL_NAME,
  TIDIAO_CONSULT_SCRIPT_TOOL_NAME,
  TIDIAO_READ_SCENARIO_SKILL_TOOL_NAME
] as const

export const GROUP_DIRECTOR_CONCURRENCY_LIMIT = 3

/**
 * 3d 追加召回落池接缝：取料命中按容器追加进本轮资料池缓存（recallRoundPool ON 时提供）。
 * 融入计划批次3（2026-07-10）：统筹本体三件套/recallCharacterBrain 已下架，本接缝不再进 harness input——
 * 现役消费方=管线 buildCaifengDispatchSeam→采风工具集（buildCaifengToolset）：采风调三件套命中经 world() 落世界池、
 * 调 recallCharacterBrain 经 recallCharacter() 落该角色池（与统筹同一份会话池·落池副作用共享），本轮后续注入即可见。
 * - world：三件套（docLibraryOnly·世界知识）命中后回调，调用方转 doc_library 卡 appendWorldPoolCards（世界料只查文档库）。
 * - recallCharacter：按角色「自己大脑+公共区」追加召回（绝不查别人/文档库），调用方 appendCharacterPoolCards(X) 落其池。
 */
export interface GroupDirectorRecallPoolAppend {
  world: (hits: Array<{ unitId: string; title?: string; summary?: string; body?: string; score?: number }>) => void
  recallCharacter?: (characterId: string, query: string, topK?: number) => Promise<Array<{ unitId: string; title: string; snippet: string; score?: number }>>
}

export interface GroupDirectorHarnessInput {
  /** 异步 Agent 收件箱的正式寻址键；聊天主链必须同时提供。 */
  sessionId?: string
  directorRunId?: string
  /** 统筹 pass 的纯输入（候选/forced/excluded/最近上下文/场景/基调/私密指令/用户输入）。 */
  passInput: GroupDirectorPassInput
  /** 候选 characterId 集合（cast 校验用，与 passInput.candidates 对应）。 */
  candidateIds: string[]
  /** 按 tidiao 配方生成的统一原始可见上下文；在位时取代聊天/世界/状态/种子的手拼提示块。 */
  agentContextBlock?: string
  /** 当前编排会话的服务端世界 read model 投影；重建 prompt 时复用同一稳定 system 区块。 */
  sessionWorldContext?: ChatSessionWorldAgentContext
  /** 读会话楼层接缝（session 级）：存在即注册并激活 readChatMessage。 */
  chatMessageReadContext?: TidiaoChatMessageReadContext | null
  /** 读消息投影接缝（session 级）：存在即注册并激活 readMessageProjection（只读，不挂 reproject）。 */
  projectionContext?: TidiaoMessageProjectionContext | null
  /** 批次E·层4：读消息提示词接缝（拍板①=历史消息已存 promptLog·管线装懒取实现）：存在即注册 readMessagePrompt。
   *  统筹**只读不改**——不注册 editMessagePrompt（改提示词仍归纠偏中策）；读回全文经层4 容器进重建 prompt。 */
  messagePromptContext?: TidiaoMessagePromptContext | null
  /** 世界剧本接缝：在位即注册 consultScript；工具只派遣编剧 Agent，异步结果进入持久事件箱，
   *  最终变更由世界叙事种子正式 API 以乐观版本锁提交。提调不读写历史会话剧本缓存。 */
  scriptSeam?: {
    dispatchScriptwriter: TidiaoScriptContext['dispatchScriptwriter']
  } | null
  /** F1·决策 loop：会话级编排器情境清单（提调轮级 readScenarioSkill 判情境、下发给分镜复用）。
   *  非空时进入「决策工具序列」模式（提调分步判情境/定旁白/逐角色定方向/收尾）；缺省则走旧一次性 JSON 剧本路径。 */
  scenarios?: ReplyPlanScenarioConfig[] | null
  /** 帷幕校准接缝（2026-07-04 用户拍板·仅决策 loop 模式生效）：在位即注册 updateCurtainScene + 纲领追加步骤 2.5——
   *  剧情自然发生时空跳变（如穿越）时统筹判情境顺手改帷幕真值（此前只有演员/纠偏侧「用户明确指令」才改，剧情跳变没人管）。
   *  接缝=管线 applyPersonalityCurtainSceneUpdate 同款（写会话虚拟场景字段）。缺省不注册，行为不变。 */
  updateCurtainScene?: TidiaoCurtainSceneContext['updateCurtainScene'] | null
  /** 状态系统接缝（积木骨架计划批次5·2026-07-08 用户拍板「状态栏主写手=提调」·仅决策 loop 模式生效）：
   *  在位即注册 readStatusPanels/updateStatusPanel + 纲领追加步骤 4c「同步状态」——剧情造成的状态变化
   *  （金钱/物品/位置/情绪/资源/等级）由统筹随轮落账。接缝=装配核心 buildTidiaoStatusSystemSeam
   *  （chatRepository 真值直写·与「状态」面板、星依工具同一份服务端真值）。缺省不注册，行为不变。 */
  statusSystem?: TidiaoStatusSystemToolContext | null
  /** F1/F3·决策 loop：会话旁白 skill profiles（提调定旁白时用旁白两件套 readNarrationSkill/confirmNarrationCall 挑 profileId、
   *  拼进 system 清单）。缺省（无旁白 skill）则提调不挑旁白、narrationCalls 空——want=false 真无旁白。 */
  narrationProfiles?: PersonalityNarrationSubagentProfile[] | null
  /** 3b-3·提调可见各池 grounding 块（renderDirectorVisiblePoolsBlock 产出）：非空即注入提调 messages 供据各角色已掌握资料定方向，
   *  并追加方向护栏。缺省（recallRoundPool 开关关/池空）不注入，行为不变。 */
  poolVisibilityBlock?: string
  /** 状态栏短目录块（renderDirectorStatusPanelsBlock 产出·管线开局据 statusSystem 接缝取数渲染）：
   *  只含用途与结构轮廓，不含当前值；命中后由 readStatusPanels 按需展开。 */
  statusPanelsBlock?: string
  /** 世界级种子批次2：硬代码筛出的本轮候选摘要；只给提调，不下发角色侧。 */
  narrativeSeedsBlock?: string
  /** 摘要非空时注册按 id 展开详情的只读工具；工具只能读本轮召回集合。 */
  narrativeSeedReadContext?: TidiaoNarrativeSeedReadContext | null
  /** 当前会话挂世界时开放正式种子写链；用户明确改剧本不再覆盖旧整本。 */
  narrativeSeedWriteContext?: TidiaoNarrativeSeedWriteContext | null
  /** 本轮确定性召回里已经越过时间门的种子；finishRound 前必须逐条更新并退出 ready_to_trigger。 */
  readyToTriggerSeedIds?: string[]
  /** 每条待引爆种子被召回时的当前流动帷幕时间；防止改回仍会立刻越界的 active/dormant/pending_effect 假退出。 */
  readyToTriggerCurrentTimeBySeedId?: Record<string, string>
  /** 快速回复后的第二阶段提调：允许只落账/旁白，也允许把必要角色补演真正追加到本轮。 */
  postRoundSupplement?: boolean
  /** 采风钻取接缝（状态系统融入提调计划批次2·2026-07-10·仅决策 loop 模式生效）：在位即注册 dispatchResearch——
   *  统筹手头三渠道不够时派「采风」子 agent（balanced 校书档小 loop）去查证；同轮多发整批并发（concurrency 白名单）。
   *  dispatch 由管线装配（buildCaifengDispatchSeam：工具集+模型调用+运行卡埋点收口在管线/caifengSubagent 侧）。
   *  缺省不注册，行为不变。 */
  researchSeam?: TidiaoResearchDispatchContext | null
  /** 绘舆作图派发接缝（地图系统批5·2026-07-11·仅决策 loop 模式生效）：在位即注册 dispatchMapWork——
   *  剧情出现地图信号（角色移动/新地点/进迷雾区）时派「绘舆」子 agent（balanced 校书档小 loop）更新舆图，
   *  交稿带回格局摘要。dispatch 由管线装配（buildHuiyuDispatchSeam：工具集+模型调用+运行卡+会话未挂世界
   *  判定收口在管线/huiyuSubagent 侧）。缺省不注册，行为不变。 */
  mapWorkSeam?: TidiaoMapWorkDispatchContext | null
  /** 提调建状态栏 scope 确认（并行编排计划批次B·2026-07-10 非阻塞化·仅决策 loop + statusSystem 在位生效）：
   *  接缝在位即注册 confirmStatusScope——工具经接缝把请求交管线（写全局 pending 弹卡），**不终止统筹 loop**，
   *  提调继续排戏；确认后建栏由「造册」子agent后台完成（见 tidiaoStatusScopeState 头注释）。
   *  防重/拒绝检查在接缝闭包内（已有待确认卡/用户拒绝过→工具回执拒绝理由）。缺省不注册，行为不变。 */
  scopeSeam?: TidiaoStatusScopeSignalContext | null
  /** 上一轮情境（并进提调主判·轻判变没变）：管线据 sessionId 从正式编排资料读出、
   *  renderLastScenarioBlock 渲染后传入；仅 decisionTools 模式注入 user 侧。缺省/空串=不注入，行为不变。
   *  纠偏整轮重排（replanText）由管线控制不传（本就要不沿用上一轮情境）。 */
  lastScenarioBlock?: string
  /** 旧上轮剧本摘要兼容输入已退役；缺省/空串不注入。 */
  scriptDigestBlock?: string
  /** 历次用户 OOC 私密指令（跨轮累积）：管线据 sessionId 从服务端正式编排资料读出、
   *  renderDirectorDirectiveHistoryBlock 渲染后传入；非空即注入「5·提调带信息流」层。缺省/空串=不注入。 */
  directiveHistoryBlock?: string
  /** 批次4-投影 A（灰度开关 directorProjectionContext ON）：开局 recentContext 已喂投影态客观事实，
   *  grounding 协议/决策 loop step 1 切「默认读投影、原文仅按需」。缺省（关）行为不变。 */
  projectionFirst?: boolean
  /** E1·实时决策流接缝（导演模式）：存在即把 loop 的 per-turn 旁述 + 工具步骤实时折叠成 TidiaoDirectorStream 整份上抛，
   *  收束据剧本补整轮角色镜/旁白镜 + 计划旁述决策。不传则维持 D 批纯产 RoundDirectorScript（行为零变化）。 */
  onDirectorStream?: (stream: TidiaoDirectorStream) => void
  /** 批次4·A 前置决策：loop 启动前 seed 到决策流最前的决策（如开局并行召回各角色资料池/世界知识池）。
   *  仅 onDirectorStream 存在（导演带模式）时生效；填池在本 harness 之前 await 完，故以「已完成 ✓」形态领头。 */
  preludeDecisions?: Array<{ kind: TidiaoDecisionKind; text: string; tool?: TidiaoStreamTool }>
  /** 批次D·directorPromptRebuild（用户 2026-07-02 拍板·默认 ON）：每 turn 无视 runtime append-only messages，
   *  从「层0-3/池开局分段（恒定） + 层5 开局内容 + 当轮操作日志（保真事件渲染·实时增长）」重建完整 system+user 发模型——
   *  层5 成为结构化「提调带聊天记录」而非 raw transcript。false（真机对照 hatch）＝回旧 append-only 原样转发。
   *  ⚠️ 重建后不再回发 assistant(tool_calls)+role:'tool' 原生配对（协议合法·每次请求独立），工具 schema 仍经 toolBriefs
   *  下发不受影响；本 loop 无 injectMessages 生产者（2026-07-02 盘点：仅单聊 replyPlanAgent hooks 在用），重建不丢注入。 */
  promptRebuild?: boolean
  signal?: AbortSignal
  /** 原生 function-calling 模型调用：toolBriefs→tools 由调用方装配，返回 { content, toolCalls }。 */
  callOrchestrator: (request: {
    messages: AgentRuntimeMessage[]
    activeTools: string[]
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    // R1-B item7：deferred 模式全局可搜目录（name+brief·recommended 标常用）——callModel 透传给 callOrchestrator 渲染越权话术进协议。
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
    turnIndex: number
    toolEpoch: number
    toolEpochTurnIndex: number
  }) => Promise<{ content: string; toolCalls: unknown[] }>
}

export interface GroupDirectorHarnessResult {
  /** 解析出的整轮剧本（含 retrieval 决策）；模型没产出合法剧本时为 null（管线据此回退确定性 cast 兜底）。 */
  script: RoundDirectorScript | null
  /** F3·旁白彻底归提调：提调 loop confirmNarrationCall 收集的旁白调用（含 generatedPrompt），
   *  管线据此在轮级（首发言者一次）复用 startDirectorNarrationCompletion 生成旁白正文。
   *  提调说不要旁白（没调 confirmNarrationCall）/旧 JSON 路径/无旁白 skill 时为空数组——want=false 真无旁白。 */
  narrationCalls: PersonalityNarrationCall[]
}

/** F3·群聊提调旁白确认上限（与单聊导演 loop 默认 maxCalls 对齐，kit 内再钳到 1~3）。 */
const GROUP_DIRECTOR_NARRATION_MAX_CALLS = 2

// F1·决策 loop 收集态 = {@link TidiaoDecisionState}（R1-B B5-2 item2 上提到 tidiaoToolBusinessContext·决策工具进全局池后
// 经 ctx.business.decision 承载·不再本 loop 私有）。旁白由旁白两件套 narrationKit 单独收集进 narrationKit.calls，不进本收集态。

/** 构造群聊导演 loop 的工具集（按接缝/情境清单存在与否门控）。
 *  批次3（2026-07-10 融入计划）：取料三件套/recallCharacterBrain 已下架移交采风（本函数不再入列·工厂保留供
 *  buildCaifengToolset），统筹重取料走 dispatchResearch；轻量单点读（读会话/读投影/searchDirectorMemory）保留。
 *  **决策工具**（readScenarioSkill/addCastDirection/finishRound）R1-B B5-2 item2 已收口进全局自包含池·读 ctx.business.decision
 *  （§10 Q1「决策工具留各 loop」已被用户 B5-2 全做推翻）；当轮决策上下文由入口装配进 business.decision。
 *  **旁白两件套**（readNarrationSkill/confirmNarrationCall）R1-B B5-2 item2c 已收口进全局自包含池·读 ctx.business.narration；
 *  本函数装配 narrationCtx（onConfirmed=acc 在时 noteNarrationShot 更新已挂旁白镜），入口装配进 business.narration。 */
function buildGroupDirectorTools(
  input: GroupDirectorHarnessInput,
  acc: ReturnType<typeof createTidiaoDirectorStreamAccumulator> | null
): { hasDecisionTools: boolean; narrationCtx: TidiaoNarrationContext | null } {
  // F1·决策工具序列（情境清单存在才在位）：提调分步判情境/逐角色定方向/收尾。当轮决策上下文由入口装配进 business.decision。
  const scenarios = Array.isArray(input.scenarios) ? input.scenarios : []
  const hasDecisionTools = scenarios.length > 0
  // 旧绘舆 AI 写入口已冻结：提调即使仍收到兼容 mapWorkSeam，也不再注册 dispatchMapWork。
  // F3·旁白彻底归提调：决策 loop + 旁白 skill 存在时，提调用旁白两件套产出 PersonalityNarrationCall（旁白「写什么」彻底在
  // 提调这一层定·私密指令护栏天然生效）。工具定义在全局池·读 ctx.business.narration；onConfirmed 承接确认投影——确认成功即用
  // noteNarrationShot 更新 attachTool 已挂的旁白镜。缺旁白 skill / 旧 JSON 路径时为 null——管线 narrationCalls 空·want=false。
  let narrationCtx: TidiaoNarrationContext | null = null
  const narrationProfiles = Array.isArray(input.narrationProfiles) ? input.narrationProfiles : []
  if (hasDecisionTools && narrationProfiles.length) {
    narrationCtx = buildNarrationBusinessContext(
      narrationProfiles,
      GROUP_DIRECTOR_NARRATION_MAX_CALLS,
      acc ? (call) => acc.noteNarrationShot(call) : undefined,
      // 旁白穿插（2026-07-06）：统筹轮 insertAfter 锚点解析器（开场/收尾/候选角色 → placement），
      // 候选=本轮出场候选名单（与 addCastDirection 同源）；管线据 placement 决定开场起跑还是穿插 flush。
      buildDirectorNarrationInsertAfterResolver(input.passInput.candidates || []),
      // 分镜方向修改（2026-07-07）：reviseNarrationDirection 成功后改已挂旁白镜方向。
      acc ? (call, index, reason) => acc.reviseNarrationShotDirection(index, call.generatedPrompt, reason) : undefined
    )
  }
  return { hasDecisionTools, narrationCtx }
}

/**
 * 跑一轮群聊导演 loop：grounding（按需读楼层/读投影）→ 输出整轮剧本。
 * 收束后从各轮模型 content 里（从后往前）解析首个合法剧本；解析不到返回 { script: null }。
 * 工具步骤回填进 script.retrieval（方案 B 编排带载体）。
 */
export async function runGroupDirectorHarness(
  input: GroupDirectorHarnessInput
): Promise<GroupDirectorHarnessResult> {
  const retrievalDecisions: Array<{ tool: string; query: string }> = []
  // F1·决策 loop 收集态：决策工具产出在此累积，收束后组装成 RoundDirectorScript。
  // R1-B B5-2 item2：决策工具已进全局池·经 ctx.business.decision.state 写本对象（共享引用·收尾仍读得到）。
  const decisionState: TidiaoDecisionState = {
    scenarioCode: '', scenarioBody: '', cast: [], finished: false, finishSituation: '', finishUnfinished: ''
  }
  // E1 实时决策流：接缝存在即建累加器（无 characterName——群聊整轮多角色镜由决策工具增量 addShot，不挂单聊单角色镜）。
  // F1：累加器先于工具创建，决策工具 execute 据它增量挂镜（旁白/角色镜随决策实时出现、逐条真流式）。
  const directorAcc = input.onDirectorStream
    ? createTidiaoDirectorStreamAccumulator({ onStream: input.onDirectorStream })
    : null
  // 批次4·A：loop 启动前先把前置决策（开局并行召回）seed 进决策流最前，作为「已完成 ✓」的第一条。
  if (directorAcc && input.preludeDecisions?.length) {
    for (const prelude of input.preludeDecisions) directorAcc.seedDecision(prelude)
  }
  const { hasDecisionTools, narrationCtx } = buildGroupDirectorTools(input, directorAcc)
  const decisionScenarios = Array.isArray(input.scenarios) ? input.scenarios : []
  // R1-B 门槛1：通用能力工具当轮接缝/收集器/落池/候选名单装配进 business（recordRetrievalDecision 与上方本地
  // retrievalDecisions 共享同一引用 → 收尾仍读得到工具写入回填 script.retrieval）；runtime 透传给每次工具 execute 的 ctx.business。
  const castForRecall = input.passInput.candidates || []
  const pendingReadySeedIds = new Set(
    (input.readyToTriggerSeedIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  )
  const timeGatedStatuses = new Set(['dormant', 'active', 'pending_effect'])
  const noteReadySeedState = (seedId: string, seed: Record<string, any> | null | undefined) => {
    const status = String(seed?.status || '').trim()
    if (status === 'ready_to_trigger') return
    if (timeGatedStatuses.has(status)) {
      const currentTime = Date.parse(String(input.readyToTriggerCurrentTimeBySeedId?.[seedId] || ''))
      const nextStartTime = Date.parse(String(seed?.startTime || ''))
      // 改回仍会被当前帷幕立即越过的推进态，不算真正退出待引爆。
      if (Number.isFinite(currentTime) && Number.isFinite(nextStartTime) && nextStartTime <= currentTime) return
    }
    pendingReadySeedIds.delete(seedId)
  }
  const narrativeSeedReadContext: TidiaoNarrativeSeedReadContext | null = input.narrativeSeedReadContext
    ? {
        ...input.narrativeSeedReadContext,
        readSeed: async (seedId) => {
          const seed = await input.narrativeSeedReadContext!.readSeed(seedId)
          noteReadySeedState(seedId, seed)
          return seed
        }
      }
    : null
  const narrativeSeedWriteContext: TidiaoNarrativeSeedWriteContext | null = input.narrativeSeedWriteContext
    ? {
        ...input.narrativeSeedWriteContext,
        readSeed: async (seedId) => {
          const seed = await input.narrativeSeedWriteContext!.readSeed(seedId)
          noteReadySeedState(seedId, seed)
          return seed
        },
        updateSeed: async (seedId, patch) => {
          const seed = await input.narrativeSeedWriteContext!.updateSeed(seedId, patch)
          noteReadySeedState(seedId, seed)
          return seed
        }
      }
    : null
  // 接缝重构：取料决策留痕回调提为局部 const——已迁工厂（readChat）经入参闭包捕获，未迁工具暂仍读 ctx.business（同一引用）。
  const recordRetrievalDecision = (decision: { tool: string; query: string }) => { retrievalDecisions.push({ tool: decision.tool, query: decision.query }) }
  // 接缝重构 Step8：判情境工具统一接缝（readScenarioSkill 群聊导演 decision 派生实现）+ 决策工具当轮上下文（候选/排除/收集态共享引用 +
  // 挂镜回调）提为局部 const——决策清单存在才装配，工厂闭包捕获（见 directorTools 装配）。U5 决策口径冻结·仅搬载体：
  // normalizeCode=trim（不 lowerCase·群聊导演原版口径）·readBody 查情境清单·applyResult 命中才写 decisionState·notFoundMessage 带可用清单·无元工具预算/挂载摘要。
  // decisionState 同一引用，收尾据它组装剧本；候选/排除/重复/情境查体校验全在工具 execute 读本 ctx。
  const scenarioCtx: TidiaoScenarioContext | null = hasDecisionTools ? {
    normalizeCode: (raw: string) => raw.trim(),
    readBody: (code: string) => readReplyPlanScenarioBody(decisionScenarios, code) ?? null,
    applyResult: (code: string, body: string | null) => {
      if (body) { decisionState.scenarioCode = code; decisionState.scenarioBody = body }
    },
    notFoundMessage: (code: string) => `未知情境 code：${code}；可用：${decisionScenarios.map((s) => s.code).filter(Boolean).join('、')}`,
    // 定界说明（2026-07-04 真机事故根治）：情境正文是写给下游演员 loop 的（内含 generatePlanBatch/planPrompt
    // 等那层的工具指令），提调读了会误以为「计划由下游自动做」→ 整轮只取料不决策 → cast 空回退兜底。
    // 只拼进喂模型 content；scenarioBody 下发分镜仍是纯正文（tidiaoGlobalTools readScenarioSkill 保证）。
    contentSuffix: input.postRoundSupplement
      ? `【注意·以上正文是给下游角色分镜/演员用的写法参考】其中提到的 generatePlanBatch、planPrompt 等工具不在你这一层。这是轮后收束：继续审计已落库内容、落账并结算待引爆种子；只有真缺可见结果时才 confirmNarrationCall 或 addCastDirection，否则可零角色 finishRound。${TOOL_CALL_REALITY_RULE}`
      : `【注意·以上正文是给下游角色分镜/演员用的写法参考】其中提到的 generatePlanBatch、planPrompt 等工具不在你这一层，你无法也无需调用。判定完情境后，你必须继续自己完成本轮编排：用 addCastDirection 逐个定出场角色方向（不写台词），需要旁白就 confirmNarrationCall，最后 finishRound 收尾——${TOOL_CALL_REALITY_RULE}`
  } : null
  // 剧本（2026-07-06·subagent 形态）：holder=当轮收集态（current=编剧私有剧本·consulted=本轮是否已问过编剧）；
  // 仅决策 loop 模式装配（剧本语义绑统筹每轮节奏）；不在位＝零注册零校验，行为不变。
  const scriptCtx: TidiaoScriptContext | null = hasDecisionTools && input.scriptSeam ? {
    holder: { consulted: false },
    dispatchScriptwriter: input.scriptSeam.dispatchScriptwriter
  } : null
  const decisionCtx: TidiaoDecisionContext | null = hasDecisionTools ? {
    candidateSet: new Set(castForRecall.map((c) => c.characterId)),
    candidateNameById: new Map(castForRecall.map((c) => [c.characterId, c.name] as [string, string])),
    excludedSet: new Set(input.passInput.excludedCharacterIds || []),
    state: decisionState,
    ...(directorAcc ? {
      onCastAdded: (entry: { characterId: string; direction: string; label: string }) =>
        directorAcc.addShot({ kind: 'character', label: entry.label, characterId: entry.characterId, ...(entry.direction ? { direction: entry.direction } : {}) }),
      // 分镜方向修改（2026-07-07）：reviseCastDirection 成功后改已挂角色镜方向。
      onCastRevised: (entry: { characterId: string; direction: string; label: string; reason: string }) =>
        directorAcc.reviseCastShotDirection(entry.label, entry.direction, entry.reason)
    } : {}),
    // 剧本「本轮没问过编剧拦一次」硬门（2026-07-06）：发起过 consultScript 即算问过（编剧临时失败不锁死收尾）。
    ...(scriptCtx ? { hasConsultedScript: () => scriptCtx.holder.consulted } : {}),
    allowEmptyCast: input.postRoundSupplement === true,
    validateBeforeFinish: () => pendingReadySeedIds.size
      ? `仍有待引爆种子没有结算并真正退出 ready_to_trigger：${[...pendingReadySeedIds].join('、')}。逐条 readNarrativeSeed 核对后，用 updateNarrativeSeed 写入本轮实际影响与新状态；若改回 active/dormant/pending_effect，startTime 必须晚于当前流动帷幕，否则会立刻再次待引爆。不得原样保留到下一轮。`
      : null
  } : null

  // 接缝重构（2026-06-30）：群聊轮级提调启动时按「接缝在位与否」调工厂建自己的工具集（取代「引用全局工具单例 + B3 门控隐藏」）。
  // 工厂收 context 入参、闭包捕获，registry 成员＝当轮真有 context 的工具（越权目录与旧 B3 等价）：
  // searchDirectorMemory 恒在；读会话/读投影(含重投·重投虽不入 recommendedTools 但越权可搜)/
  // 决策三件套(判情境+定方向+收尾)/旁白两件套 按各自 context 在位纳入。
  // 批次3（2026-07-10）：取料三件套/recallCharacterBrain 不再装配（registry 都不进=越权也搜不到·彻底下架），
  // 重取料由 dispatchResearch 派采风（同款工厂在 buildCaifengToolset 装配·同一份接缝落池共享）。
  const directorTools: ToolDefinition[] = [createSearchAppendLogTool()]
  if (input.chatMessageReadContext) directorTools.push(createReadChatMessageTool({ readContext: input.chatMessageReadContext, recordRetrievalDecision }))
  if (input.projectionContext) directorTools.push(
    createReadMessageProjectionTool({ projectionContext: input.projectionContext, recordRetrievalDecision }),
    createReprojectMessageTool({ projectionContext: input.projectionContext })
  )
  // 批次E·层4：只挂读提示词（editMessagePrompt 不注册·统筹不改提示词）。
  if (input.messagePromptContext) directorTools.push(createReadMessagePromptTool({ promptContext: input.messagePromptContext }))
  if (scenarioCtx && decisionCtx) directorTools.push(createReadScenarioSkillTool(scenarioCtx), createAddCastDirectionTool(decisionCtx), createReviseCastDirectionTool(decisionCtx), createFinishRoundTool(decisionCtx))
  if (narrationCtx) directorTools.push(createReadNarrationSkillTool(narrationCtx), createConfirmNarrationCallTool(narrationCtx), createReviseNarrationDirectionTool(narrationCtx))
  // 剧本 consultScript（决策模式 + 剧本接缝在位）：问编剧拿本轮编排指导（整本剧本不进提调上下文）。
  if (scriptCtx) directorTools.push(createConsultScriptTool(scriptCtx))
  // 帷幕校准（决策模式 + 接缝在位）：无预算闸门（统筹一轮最多改一两次·runtime maxToolCalls 兜底）、不留痕（带上工具条已可见）。
  if (hasDecisionTools && input.updateCurtainScene) directorTools.push(createUpdateCurtainSceneTool({ updateCurtainScene: input.updateCurtainScene }))
  // 状态系统两件套（批次5·决策模式 + 接缝在位）：剧情造成的状态变化由统筹随轮落账（readStatusPanels 只读拿名称·updateStatusPanel 合并更新）。
  if (hasDecisionTools && input.statusSystem) directorTools.push(createReadStatusPanelsTool(input.statusSystem), createUpdateStatusPanelTool(input.statusSystem))
  if (hasDecisionTools && narrativeSeedReadContext) {
    directorTools.push(createReadNarrativeSeedTool({ ...narrativeSeedReadContext, recordRetrievalDecision }))
  }
  if (hasDecisionTools && narrativeSeedWriteContext) {
    directorTools.push(createCreateNarrativeSeedTool(narrativeSeedWriteContext), createUpdateNarrativeSeedTool(narrativeSeedWriteContext))
  }
  // 建状态栏 scope 确认（批次B·非阻塞）：工具经管线接缝登记请求（写全局 pending 弹卡·防重/拒绝检查在闭包内），
  // 统筹照常继续；建卡两件套已迁「造册」子agent工具集。
  if (hasDecisionTools && input.statusSystem && input.scopeSeam) {
    directorTools.push(createTidiaoConfirmStatusScopeTool(input.scopeSeam))
  }
  // 采风钻取（融入计划批次2·决策模式 + 接缝在位）：dispatch 闭包=管线装配的采风小 loop（工厂零依赖采风模块）。
  if (hasDecisionTools && input.researchSeam) directorTools.push(createDispatchResearchTool(input.researchSeam))
  // 旧绘舆工具保留为离线兼容工厂，但不进入任何提调 runtime registry。
  // 批次1·范式护栏：建 registry 前先过语义表登记校验——新工具漏登记=这里直接抛（任何跑本 loop 的 spec 立刻红）。
  assertTidiaoToolMutationSemanticsRegistered(directorTools)
  const toolRegistry = new ToolRegistry(directorTools)

  // 协议仅当对应工具真注册时才追加，避免叫模型用没注册的工具：
  // grounding=有读楼层/读投影；research=采风接缝在位（批次3 取代旧 retrieval=三件套）。
  const hasReadTools = Boolean(input.chatMessageReadContext || input.projectionContext)
  const hasResearch = Boolean(hasDecisionTools && input.researchSeam)
  const hasMapWork = false
  // D3 自主协议：只要有任一 grounding/采风查证能力（loop 路径），就追加「自主重规划/自主收尾」——
  // 自主重规划要基于核对结果，无任何工具时退化为盲判一次产出、谈不上自主，故不追加。
  const hasGroundingCapability = hasReadTools || hasResearch
  // 支线②·提调知识库渐进披露：恒注入身份+口吻+能力清单，按当轮用户话/提调指令/场景命中补对应环境小节。
  // 增量4：2.0 速览索引改由层1承载（includeEnvIndex:false），此块不再带索引，避免层0层1重复。
  // 批D·D2（2026-07-12·缓存重排）：返回值拆两块——knowledgeBlock（恒定）仍前置进 system；
  // knowledgeMatchedBlock（命中环境节·随语料变化）改传给 assembleGroupDirectorMessages 的第五参，
  // 收进 user 侧层4 的按需知识子块（不再跟着 knowledgeBlock 一起前置进 system，避免打掉跨轮缓存）。
  const knowledgeInput = {
    userText: input.passInput.userText,
    directives: input.passInput.directorDirectives,
    sceneContext: input.passInput.sceneContext,
  }
  const { constantBlock: knowledgeBlock } = buildTidiaoKnowledgeInjection({}, { includeEnvIndex: false })
  // 批次1B：沿用现役关键词选择器只负责给出准确小节 key，正文必须重新经过 manifest 授权后的
  // assembleAgentSkillSupply loader 装配并落 4 层；不再把旧 helper 返回的正文直接喂模型。
  const matchedEnvironmentSelectors = matchTidiaoEnvironmentManualSelectors(knowledgeInput)
  const runtimeProfileId = input.postRoundSupplement ? 'tidiao.post-round' : 'tidiao.director-round'
  const directorSkillSupply = await assembleAgentSkillSupply({
    profileId: runtimeProfileId,
    ...(matchedEnvironmentSelectors.length
      ? {
          activations: matchedEnvironmentSelectors.map((selector) => ({
            skillId: 'tidiao.environment-manual',
            activation: 'code_prefetch' as const,
            selector,
            reason: 'director_input_section_match'
          }))
        }
      : {})
  })
  const knowledgeMatchedBlock = directorSkillSupply.layers['4']
  // 批次1B：registry 是本轮已授权工具全集；manifest commonTools 只定义首轮高频 schema。
  // 与真实 registry 取交集会滤掉暂不在位/误写的 commonTool，其余授权工具只进 toolCatalog，
  // 必须先 toolsearch，下一轮才激活。
  const directorToolSupply = resolveAgentRuntimeToolSupply(runtimeProfileId, toolRegistry)
  const callableToolsBlock = renderDirectorCallableToolsBlock(toolRegistry.listBriefs(directorToolSupply.initialActiveTools), { toolsearchFirst: true })
  const knowledgeIndexBlock = [directorSkillSupply.layers['1'], buildTidiaoKnowledgeIndex()].filter(Boolean).join('\n\n')
  const unifiedContextBlock = String(input.agentContextBlock || '').trim()
  const worldContextBlock = !unifiedContextBlock && input.sessionWorldContext
    ? renderChatSessionWorldAgentContext(input.sessionWorldContext)
    : ''
  const promptPassInput = unifiedContextBlock
    ? { ...input.passInput, recentContext: undefined, sceneContext: undefined }
    : input.passInput
  const promptParts = buildGroupDirectorPromptParts(promptPassInput, {
    grounding: hasReadTools,
    // 批次3：采风接缝在位时①决策纲领步骤1 升「知识盘点」②追加知识钻取协议（派采风口径·取代旧三件套协议）。
    researchTool: hasResearch,
    // 地图系统批5：绘舆接缝在位时追加地图信号协议（角色移动/新地点/进迷雾区→派绘舆·渐进式披露层1 触发句）。
    mapTool: hasMapWork,
    autonomy: hasGroundingCapability,
    // 实时旁述协议仅 stream 路径追加：教提调每步发起函数调用时吐一句话 thought（决策旁述实时上抛）。
    liveNarration: Boolean(directorAcc),
    // F1·决策 loop：情境清单存在即走分步决策工具序列，并拼入可用情境/旁白 skill 清单。
    decisionTools: hasDecisionTools,
    ...(input.postRoundSupplement ? { postRoundSupplement: true } : {}),
    // 帷幕校准：接缝在位时决策纲领追加步骤 2.5（剧情时空跳变/用户明确要求才改·拿不准不改）。
    ...(hasDecisionTools && input.updateCurtainScene ? { curtainTool: true } : {}),
    // 剧本：接缝在位时决策纲领追加步骤 0.5「问编剧拿本轮编排指导」（每轮必做·整本不进提调上下文）。
    ...(scriptCtx ? { scriptTool: true } : {}),
    // 状态系统（批次5）：接缝在位时决策纲领追加步骤 4c「同步状态」（剧情状态变化随轮落账·没有状态栏不硬造）。
    ...(hasDecisionTools && input.statusSystem ? { statusTool: true } : {}),
    // 建状态栏 scope 确认（批次B·非阻塞）：接缝在位时盘点补「没有状态栏的角色→请求确认（弹卡后继续排戏）」。
    ...(hasDecisionTools && input.statusSystem && input.scopeSeam ? { statusScopeTool: true } : {}),
    ...(hasDecisionTools ? { scenarioGuide: renderReplyPlanScenarioGuide(input.scenarios || []) } : {}),
    ...(hasDecisionTools && input.narrationProfiles?.length
      ? { narrationGuide: buildDirectorNarrationSkillGuide(input.narrationProfiles).detail }
      : {}),
    // 3b-3·提调可见各池：非空即注入定方向依据 + 方向护栏（buildGroupDirectorMessages 内据非空追加 guard）。
    ...(String(input.poolVisibilityBlock || '').trim() ? { poolVisibilityBlock: input.poolVisibilityBlock } : {}),
    // 状态系统融入批次1：当前对话状态栏 MD 常驻块，非空即注入层2 与层3 之间（buildGroupDirectorPromptParts 内收口）。
    ...(!unifiedContextBlock && String(input.statusPanelsBlock || '').trim() ? { statusPanelsBlock: input.statusPanelsBlock } : {}),
    ...(!unifiedContextBlock && String(input.narrativeSeedsBlock || '').trim() ? { narrativeSeedsBlock: input.narrativeSeedsBlock } : {}),
    ...(worldContextBlock ? { worldContextBlock } : {}),
    // 批次4-投影 A：projectionFirst 时 grounding 协议/决策 step1 切「默认读投影、原文仅按需」。
    ...(input.projectionFirst ? { projectionFirst: true } : {}),
    // 支线②·提调知识库：非空即前置到 system 最前（buildGroupDirectorMessages 内据非空前置）。
    ...(knowledgeBlock ? { knowledgeBlock } : {}),
    // 倾向迁移批次1（2026-07-10）：编排倾向不再进统筹层0——第一消费者=编剧（scriptSeam 接缝注入）。
    // 批次 C·上一轮情境：非空即注入 user 侧（buildGroupDirectorMessages 内据 decisionTools+非空注入）。
    ...(!unifiedContextBlock && String(input.lastScenarioBlock || '').trim() ? { lastScenarioBlock: input.lastScenarioBlock } : {}),
    // 串行压缩批A：层2【上轮剧本摘要】——提调判 deviation 的依据（consultScript brief 引导对照它判断）。
    ...(String(input.scriptDigestBlock || '').trim() ? { scriptDigestBlock: input.scriptDigestBlock } : {}),
    // 增量 3·历次 OOC 私密指令（跨轮累积）：非空即注入 5·提调带信息流（buildGroupDirectorMessages 内据非空注入）。
    ...(!unifiedContextBlock && String(input.directiveHistoryBlock || '').trim() ? { directiveHistoryBlock: input.directiveHistoryBlock } : {}),
    // 增量 4·层1可调用资料总览：工具清单恒有（searchDirectorMemory 恒注册）+ 知识库 2.0 索引，非空即置于 1·可调用资料层最前。
    ...(callableToolsBlock ? { callableToolsBlock } : {}),
    ...(knowledgeIndexBlock ? { knowledgeIndexBlock } : {})
  })
  if (unifiedContextBlock) {
    promptParts.leadingSections.push(`【统一原始可见上下文】\n${unifiedContextBlock}`)
  }

  // 批次1P：命中知识节（knowledgeMatchedBlock）第五参传入——收进层4的按需知识子块，仍在层6之前。
  const messages = assembleGroupDirectorMessages(promptParts, '', '', knowledgeMatchedBlock)

  // option C：发送时把这一轮真实拼好的 prompt（system 纲领/协议 + user 舞台/名单/聊天历史/诉求/资料池）
  // 留存进活动 append log，供 state 查看器「喂模型原文」忠实显示（无活动 log 时空操作）。
  // 批次D：重建路径下 callModel 每 turn 会用「最新重建 prompt」刷新这份留存（查看器始终看到最后真实发出的那份）。
  setActiveDirectorPrompt('', renderDirectorPromptText(messages))

  // 批次D·层5 动态提示词：当轮操作日志按「已渲染行」有序累积（保真事件逐条渲染入列·与 append log 同源同序），
  // 重建 prompt 时直接 join。轮级容器（本 harness 一次调用=一轮），不混跨轮（跨轮记忆走 bandMemory/OOC 累积·两者不混）。
  // 用行而非事件数组：真机修② 的空转提醒要按发生时序插进日志（事件数组塞不进非 runtime 事件）。
  const promptRebuildEnabled = input.promptRebuild !== false
  // 批次E·层4 已读资料 + 层5 操作日志（H2 收口为共享 collector·统筹/纠偏同一套）：
  // 成功结果折叠后 >120 字 → 层5 日志行截 120（标注指向层4）、逐字全文（保换行）归层4 轮级容器；
  // ≤120 字的结果层5 已完整可见、不重复占位。容器一 harness 一份=一轮，下轮新建自然清空。
  const roundLog = createDirectorRoundLogCollector()

  // 真机修②（2026-07-03·空转 nudge·根治「提调未产出有效剧本→回退兜底」最常见成因）：
  // runtime 通用收尾语义=「模型一轮不发任何工具调用即认为做完」，对决策 loop 太宽松——真机复现：模型第 3 步只吐
  // thought 没调工具 → loop 直接收束 → cast 空 → 判失败回退兜底。决策模式下挂 afterModelMessage hook：
  // 模型空转（无工具调用）且还没 finishRound 时，注入一条纠正提示并续轮（injectMessages 即 continuation patch），
  // 限 2 次防对话死循环；超限仍空转则按原语义自然收束、如实报失败。OFF 重建路径下注入消息直接进 messages 生效；
  // ON 重建路径下注入消息会被重建覆盖，故同时把提醒按时序插进 roundLogLines（重建 prompt 里加粗可见）——两路都生效。
  const DECISION_NUDGE_MAX = 2
  // 真机三验（2026-07-04 晚）：模型可能在末尾连续纯旁述把 2 次提醒烧完仍不调工具（gemini 两轮复现）。
  // cast 已有时维持 2 次（收尾提醒够用）；cast 仍空时放宽到 4 次——宁多烧几次调用也把这轮救回，
  // 死循环兜底=20 分钟硬超时（2026-07-05 预算已放开，不再靠 maxTurns 掐断）。
  const DECISION_NUDGE_MAX_CAST_EMPTY = 4
  // 真机修③（2026-07-04·取料空转 nudge·补真机复现的第二形态）：模型每步都在勤奋调工具（取料/检索），
  // 但连续多步不碰任何决策工具（判情境/定方向/旁白/收尾），最后旁述一句「交给生成链路」直接收场 →
  // cast 空回退兜底。真机修② 只管「一步没调工具」，管不住这种「勤奋地跑偏」。连续 4 步无决策进展、
  // 且还没定过任何角色方向时注入纠正（限 2 次·计数独立于空转 nudge），两路（OFF 直注入 / ON 重建日志行）同真机修②。
  const DECISION_PROGRESS_TOOLS = new Set(['readScenarioSkill', 'addCastDirection', 'confirmNarrationCall', 'finishRound'])
  const RETRIEVAL_STREAK_THRESHOLD = 4
  const RETRIEVAL_NUDGE_MAX = 2
  let retrievalStreak = 0
  let retrievalNudgeCount = 0
  // 真机修④（2026-07-04 二验·旁白死循环形态）：旁白两件套也算「决策进展」，模型可以整轮忙旁白
  //（含反复被参数校验退回重试）却始终不定角色方向 → cast 空照样兜底，③管不住。到死线轮次还没定过
  // 任何角色方向就硬提醒（限 2 次·独立计数）；本步已在调 addCastDirection/finishRound 时不打扰（cast 是
  // afterModelMessage 时点值·工具还没执行）。
  const CAST_DEADLINE_TURN = 6
  const CAST_DEADLINE_NUDGE_MAX = 2
  let castDeadlineNudgeCount = 0
  // 批次1B：toolsearch 只是 schema 发现轮，不算一次业务决策步；否则低频工具每次先搜都会提前触发
  // “连续取料”与角色方向死线，等于把渐进披露本身误判成编排空转。
  let decisionToolTurnCount = 0
  // 内核统一批 B2（2026-07-09·用户「抽共享内核彻底统一」）：把「空转续轮」那一层改用共享内核
  // createEmptyTurnContinuationGate（与星依同一台引擎）；提调专属的「有工具调用时·取料空转/角色方向死线」
  // 进展护栏拆成独立 hook（只在本轮有工具调用时生效，空转交给共享续轮门）。两 hook 按 calls 数量互斥、不冲突。
  const emptyTurnNudgeRegistry = hasDecisionTools ? new HookRegistry([
    // 批次B（2026-07-10）：批次4 的 halt-after-status-scope hook 已退役——confirmStatusScope 非阻塞化后
    // 弹卡不再终止统筹，提调继续排完本轮（工具回执已点破「不用等确认」）。
    // ① 空转续轮门（共享内核）：零工具调用且还没 finishRound 时注入续做提示续轮。
    //    终止=decisionState.finished；限次动态（cast 有 2/空 4）；文案动态；onNudge 推进重建日志行（ON 重建路径可见）。
    createEmptyTurnContinuationGate({
      id: 'group-director-empty-turn-nudge',
      isFinished: () => decisionState.finished,
      maxNudges: () => input.postRoundSupplement
        ? DECISION_NUDGE_MAX
        : (decisionState.cast.length ? DECISION_NUDGE_MAX : DECISION_NUDGE_MAX_CAST_EMPTY),
      buildNudge: () => input.postRoundSupplement
        ? `轮后任务还没收尾：请继续核对已落库事实、更新确实变化的状态/帷幕/种子，只在真有缺口时补演；不需要补演就直接调用 finishRound。${TOOL_CALL_REALITY_RULE}`
        : decisionState.cast.length
          ? '你这一步没有发起任何工具调用，但本轮还没收尾：所有角色方向定完后必须真调用 finishRound 才算结束，请直接发起下一个决策工具调用。'
          : `你这一步没有发起任何工具调用，而本轮还没定任何角色方向：${TOOL_CALL_REALITY_RULE}请直接发起下一个还没做的决策工具的原生函数调用（如 confirmNarrationCall / addCastDirection / finishRound）。`,
      onNudge: (note) => roundLog.pushLine(`- **系统提醒：${note}**`)
    }),
    // ② 提调专属·有工具调用时的进展护栏（真机修③取料空转 + 真机修④角色方向死线）：只在本轮有工具调用时生效。
    {
      id: 'group-director-progress-nudge',
      lifecycle: 'afterModelMessage',
      run: (event) => {
        if (decisionState.finished) return undefined
        const calls = event.modelToolCalls ?? []
        if (calls.length === 0) return undefined // 空转交给①共享续轮门
        // 注意：afterModelMessage 拿到的是原始 toolCalls——原生形态工具名在 function.name，旧形态在 toolName/tool/name。
        const callNames = calls.map((call) => {
          const fn = call?.function
          const nativeName = fn && typeof fn === 'object' ? (fn as { name?: unknown }).name : undefined
          return String(call?.toolName ?? call?.tool ?? call?.name ?? nativeName ?? '').trim()
        })
        const businessCallNames = callNames.filter((name) => name !== 'toolsearch')
        if (businessCallNames.length === 0) return undefined
        decisionToolTurnCount += 1
        // 真机修③：本步有工具调用 → 看是不是决策进展；连续跑偏到阈值且 cast 仍空才提醒。
        const hasProgress = businessCallNames.some((name) => DECISION_PROGRESS_TOOLS.has(name))
        retrievalStreak = hasProgress ? 0 : retrievalStreak + 1
        if (input.postRoundSupplement) {
          if (hasProgress) return undefined
          if (retrievalStreak < RETRIEVAL_STREAK_THRESHOLD || retrievalNudgeCount >= RETRIEVAL_NUDGE_MAX) return undefined
          retrievalNudgeCount += 1
          retrievalStreak = 0
          const note = `你已经连续多步只在取料/检索，轮后收束还没产生正式决定。资料够用就立即更新需落账的状态/帷幕/种子，只在真有缺口时补演，然后 finishRound；无需强行添加角色方向。${TOOL_CALL_REALITY_RULE}`
          roundLog.pushLine(`- **系统提醒：${note}**`)
          return {
            summary: `轮后取料空转提醒 ${retrievalNudgeCount}/${RETRIEVAL_NUDGE_MAX}：连续 ${RETRIEVAL_STREAK_THRESHOLD} 步无收束决定`,
            injectMessages: [{ role: 'user', content: note, purpose: 'calibration' }]
          }
        }
        if (decisionState.cast.length) return undefined
        // 真机修④·角色方向死线（优先于③：不管在忙什么，过死线没 cast 就先拽回来）。
        const isCastingNow = businessCallNames.includes('addCastDirection') || businessCallNames.includes('finishRound')
        if (!isCastingNow && decisionToolTurnCount > CAST_DEADLINE_TURN && castDeadlineNudgeCount < CAST_DEADLINE_NUDGE_MAX) {
          castDeadlineNudgeCount += 1
          const note = '本轮已经过了大半，你还没定过任何一个出场角色方向。旁白/取料都只是铺垫，不定角色方向这一轮就等于没排——请现在就用 addCastDirection 定第一个出场角色（characterId + 大致怎么回应，不写台词），全部定完后 finishRound 收尾。'
          roundLog.pushLine(`- **系统提醒：${note}**`)
          return {
            summary: `角色方向死线提醒 ${castDeadlineNudgeCount}/${CAST_DEADLINE_NUDGE_MAX}：第 ${event.turnIndex} 轮仍无任何角色方向，注入纠正`,
            injectMessages: [{ role: 'user', content: note, purpose: 'calibration' }]
          }
        }
        if (hasProgress) return undefined
        if (retrievalStreak < RETRIEVAL_STREAK_THRESHOLD || retrievalNudgeCount >= RETRIEVAL_NUDGE_MAX) return undefined
        retrievalNudgeCount += 1
        retrievalStreak = 0
        const note = `你已经连续多步只在取料/检索，还没定过任何角色方向。资料够用就立刻开始决策：用 addCastDirection 逐个定出场角色方向（不写台词），需要旁白就 confirmNarrationCall，最后 finishRound 收尾。取料本身不产出任何剧本；${TOOL_CALL_REALITY_RULE}`
        roundLog.pushLine(`- **系统提醒：${note}**`)
        return {
          summary: `取料空转提醒 ${retrievalNudgeCount}/${RETRIEVAL_NUDGE_MAX}：连续 ${RETRIEVAL_STREAK_THRESHOLD} 步无决策工具调用，注入继续提示`,
          injectMessages: [{ role: 'user', content: note, purpose: 'calibration' }]
        }
      }
    }
  ]) : undefined

  const deferredSessionId = String(input.sessionId || '')
  const deferredRunId = String(input.directorRunId || '')
  if (deferredSessionId && deferredRunId) activateDeferredAgentRun(deferredSessionId, deferredRunId)
  const runtimeResult = await runAgentRuntime({
    agentName: 'GroupDirectorAgent',
    runtimeVersion: 'group-director-agent-runtime-v1',
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    // 批次1B：registry 保留已授权全集；首轮只激活 manifest 高频集，其余经 toolsearch 按需激活。
    toolRegistry,
    deferredToolMode: directorToolSupply.deferredToolMode,
    // 缓存收口：首次 toolsearch 后一次性装载本 profile 当轮 registry 的完整授权集，随后冻结。
    // registry 已经过能力/接缝门控，不扩大权限；只消除逐工具增长导致的 schema 前缀反复失效。
    deferredToolEpochMode: 'full-authorized-after-first-search',
    recommendedTools: directorToolSupply.recommendedTools,
    initialActiveTools: directorToolSupply.initialActiveTools,
    toolSupplyDiagnostics: directorToolSupply.diagnostics,
    promptSupplyTrace: directorSkillSupply.trace,
    // F1：决策 loop 不设步数上限（2026-07-05 放开·硬停交 20 分钟超时）；旧一次性剧本路径维持原预算。
    budget: hasDecisionTools ? GROUP_DIRECTOR_DECISION_LOOP_BUDGET : GROUP_DIRECTOR_LOOP_BUDGET,
    timeoutMs: DIRECTOR_LOOP_TIMEOUT_MS,
    signal: input.signal,
    ...(deferredSessionId
      ? { subagentControl: createSessionSubagentControlCapability(deferredSessionId) }
      : {}),
    // 同轮并发（融入计划批次2 起·并行编排计划批次A扩编 2026-07-10）：白名单机制=本轮所有 toolCall 都命中才并发，
    // 混发名单外工具自动回退串行·单调用不触发——天然安全故**恒配**（不再挂 researchSeam 条件）。
    concurrency: { limit: GROUP_DIRECTOR_CONCURRENCY_LIMIT, tools: [...GROUP_DIRECTOR_CONCURRENT_TOOLS] },
    // E1：loop 每步真模型产出（per-turn thought）+ 工具开始/结束实时折叠成决策流快照整份上抛。
    ...(directorAcc ? { onProgress: (event) => directorAcc.onRuntimeProgress(event) } : {}),
    // 真机修②：决策模式挂空转 nudge hook（deferred 模式 runtime 会再叠内置 toolsearch 激活 hook·互不影响）。
    ...(emptyTurnNudgeRegistry ? { hookRegistry: emptyTurnNudgeRegistry } : {}),
    // R3-2：保真事件喂入 append log（与 onProgress 视图分离）。append 进 pipeline 起的活动 log；无活动 log 自动空操作。
    // R3-2/3/5：保真事件统一喂入 append log（lifecycle 透传 + 报错进 state），收口在 feedAppendLogFromFidelityEvent。
    // 批次D/E（H2 收口共享 collector）：同一事件逐条渲染日志行（截120·标注指向层4）+ 超长全文归层4 容器。
    onEvent: (event) => {
      roundLog.ingest(event)
      feedAppendLogFromFidelityEvent(event, toolRegistry)
    },
    callModel: async ({
      messages: turnMessages,
      activeTools,
      toolBriefs,
      toolCatalog,
      turnIndex,
      toolEpoch,
      toolEpochTurnIndex
    }) => {
      if (input.signal?.aborted) throw createGroupDirectorAbortError()
      // 批次D·每 turn 重建（directorPromptRebuild 默认 ON）：turn>0（已有日志行）时无视 runtime append-only messages，
      // 用「恒定分段 + 当轮操作日志」重建 system+user 发模型——层0-3/池逐字不变（保 KV 前缀缓存），
      // 层5 尾部追加结构化日志 + 收束句切续轮语义（别复述已做步骤·真机修①）。OFF＝旧路原样转发（真机对照）。
      // 批次E：层4 已读资料（超长结果逐字全文）插层3 后层5 前；层5 日志行已按 120 截（超长全文只在层4 一份）。
      // 批D·D2：命中知识节随每 turn 重建同样带上（knowledgeMatchedBlock 本轮内不变·随本次 harness 调用固定）。
      const rebuilt = promptRebuildEnabled && roundLog.hasLines()
        ? assembleGroupDirectorMessages(promptParts, roundLog.renderLog(), roundLog.renderReadMaterials(), knowledgeMatchedBlock)
        : null
      const claimedEvents = deferredSessionId && deferredRunId
        ? claimDeferredAgentEvents(deferredSessionId, deferredRunId)
        : []
      const deferredBlock = renderDeferredScriptwriterEvents(claimedEvents)
      const baseMessages = rebuilt ?? turnMessages
      const outboundMessages = deferredBlock
        ? [...baseMessages, { role: 'user' as const, content: deferredBlock }]
        : baseMessages
      if (rebuilt || deferredBlock) {
        // option C + 批次3：查看器保存真正出站的 prompt，异步回报不能只活在运行时内存。
        setActiveDirectorPrompt('', renderDirectorPromptText(outboundMessages))
      }
      try {
        const response = await input.callOrchestrator({
          messages: outboundMessages,
          activeTools,
          toolBriefs,
          toolCatalog,
          turnIndex,
          toolEpoch,
          toolEpochTurnIndex
        })
        if (claimedEvents.length) ackDeferredAgentEvents(deferredSessionId, deferredRunId, claimedEvents.map((event) => event.id))
        return response
      } catch (error) {
        if (claimedEvents.length) releaseDeferredAgentEvents(deferredSessionId, deferredRunId, claimedEvents.map((event) => event.id))
        throw error
      }
    }
  }).finally(() => {
    if (deferredSessionId && deferredRunId) closeDeferredAgentRun(deferredSessionId, deferredRunId)
  })

  if (input.signal?.aborted || runtimeResult.transcript.terminalReason === 'aborted') {
    throw createGroupDirectorAbortError()
  }

  // F1·决策 loop 组装：决策工具定过出场角色即据决策态组装剧本（情境/旁白/各角色方向逐步收集而来）；
  // 否则（旧路径或模型没用决策工具）回退「从后往前解析 JSON 剧本」。
  // F3：旁白彻底归提调——旁白调用从 narrationCtx.calls 取（含 generatedPrompt）；script.narration {want,direction}
  // 仅作旧 band 兼容载体（want=有无旁白调用、direction 取首条理由）；真正的旁白正文由管线轮级据 narrationCalls 生成。
  const narrationCalls: PersonalityNarrationCall[] = narrationCtx ? narrationCtx.calls : []
  let script: RoundDirectorScript | null = null
  let assembledFromDecisions = false
  if (hasDecisionTools && (decisionState.cast.length || (input.postRoundSupplement && decisionState.finished))) {
    const thoughts = collectDirectorThoughts(runtimeResult.transcript)
    script = {
      situation: decisionState.finishSituation || thoughts[0] || decisionState.scenarioCode || '',
      narration: { want: narrationCalls.length > 0, direction: narrationCalls[0]?.reason || '' },
      cast: decisionState.cast,
      thoughts,
      ...(decisionState.scenarioCode ? { scenarioCode: decisionState.scenarioCode } : {}),
      ...(decisionState.scenarioBody ? { scenarioBody: decisionState.scenarioBody } : {})
    }
    assembledFromDecisions = true
  } else {
    const turns = runtimeResult.transcript.turns
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const content = String(turns[i]?.modelMessage?.content || '')
      const parsed = parseGroupDirectorOutput(content, input.candidateIds)
      if (parsed) { script = parsed; break }
    }
  }
  if (script && retrievalDecisions.length) {
    // 工具步骤去重（同 tool+query 只记一次）后回填 retrieval（旧 band 兼容载体；新带取料已在决策流工具条）。
    const seen = new Set<string>()
    script.retrieval = retrievalDecisions.filter((d) => {
      const key = `${d.tool}|${d.query}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // 收束相位 + 决策流补全（批次B：scope 挂起特判已退役——confirmStatusScope 非阻塞，统筹照常走到这里收尾）：
  // - 决策 loop 路径：决策（per-turn thought）+ 分镜（决策工具增量 addShot）已实时折叠，收束只置 done，不再 seed（避免重复）。
  // - 旧 JSON 路径：收束据剧本一次性补 thoughts/cast/旁白镜（seedStreamFromScript）。
  if (directorAcc) {
    if (script) {
      if (!assembledFromDecisions) seedStreamFromScript(directorAcc, script, input.passInput.candidates)
      directorAcc.setPhase('done')
    } else {
      // 无合法剧本：管线据 script=null 回退确定性 cast 兜底；决策流如实标失败（不空挂 running）。
      directorAcc.fail('提调未产出有效剧本，本轮回退兜底')
    }
  }
  return { script, narrationCalls }
}

/** 从 transcript 各轮模型 content 里按序抽出 thought（决策 loop 每步一句导演旁述）；去空、限 12 条，供旧 band 兼容 thoughts。 */
function collectDirectorThoughts(transcript: { turns: Array<{ modelMessage?: { content?: string } }> }): string[] {
  const out: string[] = []
  for (const turn of transcript.turns || []) {
    const content = String(turn?.modelMessage?.content || '').trim()
    if (!content) continue
    try {
      const match = content.match(/\{[\s\S]*\}/)
      const obj = JSON.parse(match ? match[0] : content)
      const thought = String(obj?.thought ?? '').replace(/\s+/g, ' ').trim()
      if (thought) out.push(thought)
    } catch {
      // 非 JSON content 跳过（决策 loop content 恒为 {"thought":...}）。
    }
    if (out.length >= 12) break
  }
  return out
}

/** 收束补整轮剧本进决策流累加器：thoughts→计划旁述决策（空则回退 situation）、cast→角色镜（带方向）、narration.want→旁白镜。
 *  分镜方向直接挂在镜上（与单聊「方向挂角色镜」同形态）；候选 characterId→名称用 passInput.candidates 映射。 */
function seedStreamFromScript(
  acc: NonNullable<ReturnType<typeof createTidiaoDirectorStreamAccumulator>>,
  script: RoundDirectorScript,
  candidates: GroupDirectorPassInput['candidates']
): void {
  const nameById = new Map(candidates.map((c) => [c.characterId, c.name]))
  const lines = script.thoughts.length ? script.thoughts : (script.situation ? [script.situation] : [])
  for (const line of lines) acc.noteDecision(directorKindFromStage('unknown', line), line)
  if (script.narration.want) {
    acc.addShot({ kind: 'narration', label: '旁白', ...(script.narration.direction ? { direction: script.narration.direction } : {}) })
  }
  for (const entry of script.cast) {
    const label = nameById.get(entry.characterId) || entry.characterId
    acc.addShot({ kind: 'character', label, characterId: entry.characterId, ...(entry.direction ? { direction: entry.direction } : {}) })
  }
}

const GROUP_DIRECTOR_ABORTED_MESSAGE = '群聊导演编排已取消'

/** 取消错误统一带 name='AbortError'，与全链路 isAbortError 判定一致（不弹错误 toast）。 */
function createGroupDirectorAbortError(): Error {
  const error = new Error(GROUP_DIRECTOR_ABORTED_MESSAGE)
  error.name = 'AbortError'
  return error
}
