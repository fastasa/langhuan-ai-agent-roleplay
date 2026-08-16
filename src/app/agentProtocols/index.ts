/**
 * 提调系统「纲领」集中入口（agentProtocols 集中目录）。
 *
 * 背景（用户 2026-06-29 拍板）：提调手底下各条 loop 的「纲领/提纲」原本散在 4 个 .ts 文件里各写各的，
 * 续接时容易把旧框定当真相而漂移。本目录把**静态纲领**（纯文字、可直接改措辞的那批）真搬到一处，
 * 各 loop 反过来从这里引用（其他地方要用就从本入口 import）；**动态模板函数**（带 ${}/分支/brief，
 * 本质是代码、搬不动）留在原 loop 文件，由下方 PROTOCOL_CATALOG 用自然语言登记它在哪、干什么，方便检索。
 *
 * 这就是用户要的「活引用·方案 A」：内容只此一处真值，改完重新构建即生效，且保留类型检查。
 *
 * ⚠️ 维护铁律：本目录是叶子层，各 *Protocols.ts 只导出字符串、禁止 import 任何 app loop 文件；
 *    PROTOCOL_CATALOG 用字符串登记动态函数（不 import 它们），避免循环依赖。
 *    新增/改名任何纲领时，同轮更新 PROTOCOL_CATALOG，别让清单和代码脱节。
 */

// ───────────────────────── 静态纲领 barrel re-export（唯一真值源就在这三份）─────────────────────────
export {
  GROUP_DIRECTOR_GROUNDING_PROTOCOL,
  GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST,
  GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL,
  GROUP_DIRECTOR_MAP_DISPATCH_PROTOCOL,
  GROUP_DIRECTOR_AUTONOMY_PROTOCOL,
  GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL,
  GROUP_DIRECTOR_POOL_GUARD_PROTOCOL,
  DIRECTOR_SYSTEM_PROMPT
} from './groupDirectorProtocols'

export {
  NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL,
  REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL,
  REPLY_PLAN_ACTOR_CHARTER,
  TIDIAO_DIRECTOR_NARRATION_PROTOCOL,
  TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL,
  TIDIAO_DIRECTOR_RETRIEVAL_EAGERNESS_PROTOCOL,
  EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL
} from './replyPlanProtocols'

export { NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE } from './narrationProtocols'

// ───────────────────────── 纲领总览索引（静态 + 动态，给人看的导览）─────────────────────────

/** 纲领所属 loop。 */
export type ProtocolLoop =
  | '群聊导演'
  | '单聊回复编排/导演'
  | '纠偏三策'
  | '旁白'
  | '编剧 subagent'
  | '演员/候选生成'
  | '提调知识库'

/** static=纯文字静态纲领，已搬到本目录、可直接改措辞；dynamic=带插值/分支的模板函数，留在原文件、改要动代码。 */
export type ProtocolKind = 'static' | 'dynamic'

/** 一条纲领的登记项。 */
export interface ProtocolCatalogEntry {
  /** 常量名 / 函数名（dynamic 项写函数签名要点）。 */
  name: string
  /** 属于哪条 loop。 */
  loop: ProtocolLoop
  /** static（已搬本目录）/ dynamic（留原文件）。 */
  kind: ProtocolKind
  /** 在哪个文件（static 指向本目录文件；dynamic 指向原 loop 文件，按符号名跳转，不写行号以免漂移）。 */
  location: string
  /** 中文自然语言：这条纲领是干什么的。 */
  purpose: string
}

/**
 * 提调系统全部纲领总览。static 的点 location 进本目录改文字即可；dynamic 的照 location 跳到那个函数看/改。
 * 这是「一眼看全所有 loop 提纲」的导览表——结构性判断请以本表 + 实查代码为准。
 */
export const PROTOCOL_CATALOG: ProtocolCatalogEntry[] = [
  // ── 群聊导演 loop ──
  { name: 'GROUP_DIRECTOR_GROUNDING_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '导演下剧本前，可先用读楼层/读投影核对客观事实再产剧本（loop 路径追加）。' },
  { name: 'GROUP_DIRECTOR_GROUNDING_PROTOCOL_PROJECTION_FIRST', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: 'grounding 的「投影优先」变体：开局已是投影摘要，默认读投影、原文仅按需，省掉开局一串读原文。' },
  { name: 'GROUP_DIRECTOR_RESEARCH_DISPATCH_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '知识钻取（批次3 取代旧取料三件套协议）：重取料派「采风」dispatchResearch（读原文/搜投影/文档库/角色大脑/状态栏），多缺口同轮并行；角色料按归属落池的隔离铁律。' },
  { name: 'GROUP_DIRECTOR_MAP_DISPATCH_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '地图信号（地图系统批5·渐进式披露层1）：角色移动/新地点落名/进迷雾区→派「绘舆」dispatchMapWork（给剧情事实不给坐标），交稿带回地图格局摘要供后续叙事引用方位距离。' },
  { name: 'GROUP_DIRECTOR_AUTONOMY_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '把先前设想当初判，据核对到的事实自主推翻重规划整轮剧本，信息够了就自主收尾。' },
  { name: 'GROUP_DIRECTOR_LIVE_NARRATION_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '实时旁述：每步发函数调用时在 content 放一句 thought 边想边说，最后一轮才出完整剧本 JSON。' },
  { name: 'GROUP_DIRECTOR_POOL_GUARD_PROTOCOL', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: '资料池按角色隔离护栏：给 X 的方向只用 X 池+公共信息，世界池只进旁白，鼓励用信息差造张力。' },
  { name: 'DIRECTOR_SYSTEM_PROMPT', loop: '群聊导演', kind: 'static', location: 'agentProtocols/groupDirectorProtocols.ts', purpose: 'legacy 一次性 pass 兜底：无工具时让导演一次性 JSON 出整轮剧本（thoughts/situation/narration/cast）。' },
  { name: 'buildDirectorDecisionLoopSystemPrompt(projectionFirst, curtainTool, scriptTool, statusTool, researchTool)', loop: '群聊导演', kind: 'dynamic', location: 'groupDirectorPass.ts', purpose: '现役主路：把「一次性出剧本」改成「分步决策工具序列」system 提示词；projectionFirst 时 step1 切投影优先；researchTool（采风接缝在位）时 step1 升「知识盘点」必做判断（批次3）。2026-07-07 范式优化批次4 起遵守「策略留纲领·用法沉工具」分层（参数用法以工具 brief+schema 为准·帷幕三段格式详解已下沉），长度受纲领预算锁约束（tidiaoCharterBudget.spec）。' },
  { name: 'buildGroupDirectorMessages(...)', loop: '群聊导演', kind: 'dynamic', location: 'groupDirectorPass.ts', purpose: '统筹 pass 的消息组装器：据 grounding/researchTool/autonomy/liveNarration 等开关把上面各静态协议拼进 system+user。' },

  // ── 单聊回复编排 / 提调导演 loop ──
  { name: 'NORMAL_RECALL_SINGLE_PLAN_SYSTEM_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: 'normal_recall 单计划模式硬性协议：只调一次 generatePlanBatch、单强度、无评审、成功即收尾。' },
  { name: 'REPLY_PLAN_OUTPUT_BREVITY_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '输出瘦身硬约束 + 工具走原生函数调用（不写进 JSON toolCalls）；压短 thought/orchestrationSummary/planPrompt。' },
  { name: 'REPLY_PLAN_ACTOR_CHARTER', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '演员纲领·职责边界：演员只演本角色这一轮，不判情境/不挂旁白/不碰上下文投影，全局统筹归提调。' },
  { name: 'TIDIAO_DIRECTOR_NARRATION_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '导演模式：把每轮 thought 写成导演口吻人话决策（进决策流），不写工程黑话/工具机器名。' },
  { name: 'TIDIAO_DIRECTOR_TOOL_EXECUTION_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '点破工具是同步执行：必须真发起原生函数调用才生效，没生成候选前不许 done/收尾（修空手收尾 bug）。' },
  { name: 'TIDIAO_DIRECTOR_RETRIEVAL_EAGERNESS_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '放低取料门槛：遇到稍拿不准的专名/背景就先快速取一次料再定方向；常规料仍由框架供给。' },
  { name: 'EXPRESSION_MIX_REMEDIATION_SYSTEM_PROTOCOL', loop: '单聊回复编排/导演', kind: 'static', location: 'agentProtocols/replyPlanProtocols.ts', purpose: '表达占比补齐轮：收尾缺合法 expressionMix 时，只发起一次 completePlanMetadata 补五项占比。' },
  { name: 'buildTidiaoDirectorReplanProtocol(brief, userName)', loop: '单聊回复编排/导演', kind: 'dynamic', location: 'replyPlanOrchestratorHarness.ts', purpose: '批次K 自主重排：据纠偏 brief 让导演重读情境、推翻重排，第一句 thought 写成「据纠偏重排」决策。' },
  { name: 'buildTidiaoDirectorRetryProtocol(brief, userName)', loop: '单聊回复编排/导演', kind: 'dynamic', location: 'replyPlanOrchestratorHarness.ts', purpose: '批次M1b 重试：把本轮理解为重写某条已存在消息，按用户意见/揣测意图改，第一句 thought 对应表述。' },
  { name: 'buildUserDirectorDirectiveProtocol(directives, userName, directorMode)', loop: '单聊回复编排/导演', kind: 'dynamic', location: 'replyPlanOrchestratorHarness.ts', purpose: '用户私密提调指令（双层方括号）：本轮遵守但绝不泄露到剧情产出；不改正常流程，导演模式可在决策流点明已收到。' },
  { name: 'buildReplyPlanOrchestratorPrompt(...)', loop: '单聊回复编排/导演', kind: 'dynamic', location: 'personalityPlanOrchestrator.ts', purpose: '回复编排器核心 system 组装器：拼出本地可编辑的编排工作流总规则，上面各 harness 协议追加其后。' },

  // ── 纠偏三策 loop ──
  { name: 'buildTidiaoCorrectionDirectiveBlock(...)', loop: '纠偏三策', kind: 'dynamic', location: 'tidiaoCorrectionLoop.ts', purpose: '纠偏任务纲领（2026-07-05 层0 任务化·上移 system 层0，取代批次O user 侧注入块；统筹决策纲领不再进纠偏轮）：上/中/下策怎么选 + 没把握先问；含旁白指代自主定位、改原文后判投影过时重投、可选新增旁白段。不塞目标消息原文。2026-07-07 范式优化批次4 起只写决策策略——逐工具参数枚举/字段一览/地点三段详解全部下沉工具 brief+schema（tidiaoToolContract 等单一真值），长度受纲领预算锁约束（tidiaoCharterBudget.spec）。' },
  { name: 'buildTidiaoPrecisionEditDirectiveBlock(...)', loop: '纠偏三策', kind: 'dynamic', location: 'tidiaoCorrectionLoop.ts', purpose: '锚定精修任务纲领（2026-07-05 层0 任务化·上移 system 层0，替代旧独立精修协议）：按锚点精确改某段，不全量重写。批次4 起参数用法以工具 brief+schema 为准，长度受纲领预算锁约束。' },

  // ── 旁白 loop / subagent ──
  { name: 'NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE', loop: '旁白', kind: 'static', location: 'agentProtocols/narrationProtocols.ts', purpose: '旁白 generatedPrompt 编写指南（六样必写）：群聊/单聊/独立 subagent/强制兜底四处共用同一份，防漂移。' },
  { name: 'buildPersonalityNarrationSubagentMessages(...)', loop: '旁白', kind: 'dynamic', location: 'personalityNarrationSubagent.ts', purpose: '独立旁白 subagent 系统提示词组装：协议核心（强制兜底/不兜底两版）+ 编写指南 + 私密指令护栏。' },
  { name: 'buildNarrationUserDirectiveProtocol(directives)', loop: '旁白', kind: 'dynamic', location: 'personalityNarrationSubagent.ts', purpose: 'D5：用户私密指令在旁白 subagent 的禁泄露注入块，只让指令影响方向、绝不现身于 generatedPrompt/旁白正文。' },
  { name: 'buildDirectorNarrationSkillGuide(profiles)', loop: '旁白', kind: 'dynamic', location: 'personalityNarrationSubagent.ts', purpose: '列出可用旁白 skill 清单与必填参数，供导演决策协议拼入，避免模型猜 profileId 试错烧轮次。' },
  { name: 'buildForcedNarrationFallbackCall(...)', loop: '旁白', kind: 'dynamic', location: 'personalityNarrationSubagent.ts', purpose: '强制兜底：forceNarration 时据情境直接生成一份兜底旁白调用，保证该轮有旁白。' },

  // ── 编剧 subagent（剧本·2026-07-06 起·范式优化批次6 补登记）──
  { name: 'NarrativeScriptwriterAgent', loop: '编剧 subagent', kind: 'dynamic', location: 'narrativeScriptwriterSubagent.ts', purpose: '正常聊天 consultScript 的非阻塞分析 Agent；只交已确认事实、候选判断、建议动作三栏，结果进迟到收件箱，不写 arc/章节/nextBeat，也不直接改世界真值。' },
  { name: 'NarrativeSeedWorkspaceAgent', loop: '编剧 subagent', kind: 'dynamic', location: 'narrativeSeedWorkspaceAgent.ts', purpose: '星依显式派遣的世界种子管理 Agent；基于当前世界正式种子生成字段级增删改方案，写入前由星依确认，执行时继续经过世界归属、版本锁和正式 API。' },

  // ── 演员 / 候选生成（回复管线下游）──
  { name: 'buildPersonalityCandidatePlanPrompt(...)', loop: '演员/候选生成', kind: 'dynamic', location: 'personalityModelContext.ts', purpose: '单角色本轮候选回复计划生成提示词（演员侧产物）。' },
  { name: 'buildPersonalityRerankerPrompt(...)', loop: '演员/候选生成', kind: 'dynamic', location: 'personalityModelContext.ts', purpose: '候选计划评审 ReRanker 提示词：给多个候选打分排序。' },
  { name: 'buildPersonalityFinalPrompt(...)', loop: '演员/候选生成', kind: 'dynamic', location: 'personalityModelContext.ts', purpose: '据选定计划生成最终角色回复正文的提示词。' },

  // ── 提调知识库（全局共享身份/能力注入）──
  { name: 'buildTidiaoKnowledgeInjection(...)', loop: '提调知识库', kind: 'dynamic', location: 'agentKnowledge/tidiaoKnowledge.ts', purpose: '提调身份/口吻/聊天区环境/能力清单注入；群聊导演 harness 与单聊导演模式、纠偏导演共用，口径一致。' }
]
