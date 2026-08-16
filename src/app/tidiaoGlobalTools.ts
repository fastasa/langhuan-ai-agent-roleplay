/**
 * 提调「全局通用能力工具池」工具工厂集 —— 单一来源文件（全部提调工具定义收口一处）。
 *
 * 机制（接缝重构·2026-06-30 后现役真相）：每个工具是一个**工厂函数**（`createXxxTool(ctx)`），收该工具专属的
 * **当轮 context 入参**（类型见 {@link ./tidiaoToolBusinessContext}·必填字段无 `?`），execute **闭包捕获**它——
 * 不再读运行时 `ctx.business`。各 loop（单聊纠偏/精修 + 群聊导演 + 回复编排/演员 + 旁白 subagent）启动时按
 * 「当轮接缝在位与否」调相关工厂、`new ToolRegistry([...])` 建**自己的工具集**（见各 harness 装配段）；registry
 * 成员＝当轮真有 context 的工具——取代旧「单例存全 23 工具 + B3(requiresBusiness/presentBusinessFields) 门控隐藏」，
 * 越权 toolsearch 目录与旧 B3 等价、零回归。漏传 context 变**编译期错**（根治旧三处人工对账隐身失败）。
 *
 * 动态 schema（recallCharacterBrain 候选清单 / generatePlanBatch 单计划模式）：context 工厂期已知 → schema 工厂期
 * 直接造静态（不再 schemaFactory）。searchDirectorMemory 是全局自包含 createSearchAppendLogTool（不在本模块·loop 直接装配）。
 *
 * 边界铁律：纯逻辑 `runTidiaoXxx` / 接缝类型 / U5 directorMode 口径一字不动；本模块只管 ToolDefinition 包装层。
 */

import { type ToolDefinition, type ToolExecutionResult } from './agentRuntime/toolRegistry'
import type {
  TidiaoReadChatMessageToolContext,
  TidiaoEditChatMessageToolContext,
  TidiaoMessagePromptToolContext,
  TidiaoMessageProjectionToolContext,
  TidiaoRetrievalToolContext,
  TidiaoRecallCharacterBrainToolContext,
  TidiaoResearchDispatchContext,
  TidiaoMapWorkDispatchContext,
  TidiaoEscalateCorrectionToolContext,
  TidiaoResumeOrchestrationToolContext,
  TidiaoRegenerateFromPromptToolContext,
  TidiaoScenarioContext,
  TidiaoDecisionContext,
  TidiaoReplyPlanContext,
  TidiaoCurtainSceneContext,
  TidiaoNarrationContext,
  TidiaoScriptContext,
  TidiaoRetryContext,
  TidiaoStatusSystemToolContext,
  TidiaoNarrativeSeedReadContext,
  TidiaoNarrativeSeedWriteContext,
  TidiaoStatusScopeSignalContext
} from './tidiaoToolBusinessContext'
import { renderNarrativeSeedDetail } from './narrativeSeedDirectorContext'
import {
  NARRATIVE_SEED_AUTHOR_FIELDS,
  NARRATIVE_SEED_LINK_TYPES,
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  pickNarrativeSeedAuthorFields,
  validateCompleteNarrativeSeedAuthoring
} from '../../shared/narrativeSeedAuthoring'
import {
  SUBAGENT_TIMEOUT_SCHEMA_PROPERTY,
  resolveSubagentTimeout,
  validateSubagentTimeoutMinutes
} from './subagentTimeoutPolicy'
// 状态系统（积木骨架计划批次5·2026-07-08）：解析/合并/渲染纯函数与星依工具同一份单一真值（联动能力：
// 名称解析口径、values 合并语义、总览渲染改动两侧同生效）；外部更新事件让打开中的状态面板实时重载。
// 融入计划批次4（2026-07-10）：建卡两件套提调版复用星依同一套模板字段归一/schema/字段真值（联动能力）。
import {
  buildStatusPanelValues,
  renderStatusSystemOverview,
  resolvePanelFields,
  resolveStatusSystemItem,
  readTemplateFields,
  readTemplateFieldRows,
  applyStatusPanelFieldPatches,
  TEMPLATE_FIELD_SCHEMA,
  STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT
} from './xingyiStatusSystemTools'
import { parseStatusPanelReference } from '../../shared/statusPanelReference'
import type { ChatStatusPanel, ChatStatusPanelTemplate } from '../types'
// 剧本（2026-07-06·subagent 形态）：提调侧字段一览（工具 brief 用·格式级）+ 改动字段 diff（回执只报字段名不吐内容）。
// 批次3（2026-07-07 范式优化）：prompt 构造/输出解析已随接缝升 input 级迁去 runSubagent（spec 化），
// 本模块不再 import buildScriptwriterMessages/parseScriptwriterOutput（value 单向不变·类型 ScriptwriterResult 编译期擦除）。
import { parseChatFloorRefs, type ChatFloorRef } from './chatMessageFloor'
import { runTidiaoReadChatMessages, TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME } from './tidiaoChatMessageTools'
import {
  runTidiaoEditChatMessage,
  runTidiaoAppendChatMessage,
  TIDIAO_EDIT_CHAT_MESSAGE_TOOL_NAME,
  TIDIAO_APPEND_CHAT_MESSAGE_TOOL_NAME,
  type TidiaoEditOutcome
} from './tidiaoChatMessageEditTools'
import {
  runTidiaoReadMessagePrompt,
  runTidiaoEditMessagePrompt,
  TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME,
  TIDIAO_EDIT_MESSAGE_PROMPT_TOOL_NAME
} from './tidiaoMessagePromptTools'
import {
  runTidiaoReadMessageProjection,
  runTidiaoMarkReproject,
  TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME,
  TIDIAO_REPROJECT_MESSAGE_TOOL_NAME
} from './tidiaoMessageProjectionTools'
import { normalizeRetrievalQueries, runTidiaoSemanticRecall, runTidiaoTextSearch, runTidiaoFetchUnit } from './tidiaoRetrievalTools'
import { tidiaoToolBriefFields } from './tidiaoToolContract'
import { TIDIAO_RETRIEVAL_CONTRACTS } from './tidiaoRetrievalContract'
// 纠偏领域类型（regenerate 记录形态）。import type 仅类型层、编译期擦除——与 correctionLoop 的 value-import（本模块工厂 +
// 下方三个工具名常量）构成「值单向（correctionLoop→本模块）+ 类型反向（本模块→correctionLoop·擦除）」，无运行时循环。
import type { TidiaoCorrectionRegeneration } from './tidiaoCorrectionLoop'
// R1-B B5-2 item2b 编排工具进池：回复编排计划工具的领域类型。前组定义在 personalityPlanOrchestrator（纯逻辑家·无运行时循环）；
// 后组定义在 replyPlanOrchestratorHarness——本模块对 harness 仅类型层引用（擦除），harness 对本模块是 value-import（工厂 +
// buildDegradedReviewResult），构成「值单向 + 类型反向」无运行时循环，同 correctionLoop 范式。
import type {
  GeneratePlanBatchToolCall,
  ReviewPlanCandidatesToolCall,
  ReplyPlanCandidate
} from './personalityPlanOrchestrator'
import type {
  ReplyPlanBatchToolResult,
  ReplyPlanReviewToolResult,
  ReplyPlanCurtainSceneUpdateToolCall,
  ReplyPlanOrchestratorLoopBudget
} from './replyPlanOrchestratorHarness'
// R1-B B5-2 item2c 旁白两件套进池：旁白调用构造的纯归一 helper（value 单向 import·单一真值源）+ 领域类型（擦除）。
// personalityNarrationSubagent 不反向 value-import 本模块（它只 type-import tidiaoToolBusinessContext），无运行时循环。
import {
  normalizeScore,
  normalizeInformationBearing,
  normalizeConfirmedNarrationKind,
  type PersonalityNarrationCall,
  type PersonalityNarrationPlacement,
  type PersonalityNarrationSubagentProfile
} from './personalityNarrationSubagent'
// 语义表登记需要（2026-07-07 范式优化批次1）：searchDirectorMemory 是全局自包含工具（定义在 agentState），
// 名字也要进语义表——value 单向 import 常量，无运行时循环（searchAppendLogTool 不引本模块）。
import { SEARCH_APPEND_LOG_TOOL_NAME } from './agentState/searchAppendLogTool'

// ── 工具名常量（canonical 家·B2 从 correctionLoop 迁来·correctionLoop 改 re-export 保向后兼容） ──
/** 下策升级工具机器名（提调判定要重判情境重排时调用）。 */
export const TIDIAO_ESCALATE_CORRECTION_TOOL_NAME = 'escalateCorrection'
/** 中策「据新提示词重生成」工具机器名（重生成接缝 P3 注入；缺省不注册）。 */
export const TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME = 'regenerateFromPrompt'
/** 批次B「没把握先问用户」工具机器名（始终注册；提调不确定时调用 → loop 进「提问态」收束等用户答复）。 */
export const TIDIAO_ASK_USER_TOOL_NAME = 'askUser'
/** 续回统筹信号工具机器名（2026-07-08 停止=中断保留闭环·resumeSeam 在位=聊天内纠偏轮才注册；外部轮不挂）。 */
export const TIDIAO_RESUME_ORCHESTRATION_TOOL_NAME = 'resumeOrchestration'
/** 真机五验④（2026-07-05）·重试失败子工作流工具机器名（retrySeam 在位=本轮有失败单元时才注册）。 */
export const TIDIAO_RETRY_FAILED_WORKFLOW_TOOL_NAME = 'retryFailedWorkflow'

// ── R1-B B5-2 item2 决策/定向工具机器名（canonical 家·从 groupDirectorHarness 内联收口进全局池） ──
/** 判情境工具机器名（轮级提调挑 code 读情境写法·下发给分镜复用）。 */
export const TIDIAO_READ_SCENARIO_SKILL_TOOL_NAME = 'readScenarioSkill'
/** 逐个定出场角色方向工具机器名（一次一个角色·按出场顺序）。 */
export const TIDIAO_ADD_CAST_DIRECTION_TOOL_NAME = 'addCastDirection'
/** 纠偏轮按上一轮已定方向批量补生成指定角色消息，不重新排方向。 */
export const TIDIAO_REGENERATE_CAST_FROM_DIRECTIONS_TOOL_NAME = 'regenerateCastFromDirections'
/** 改一个已定过方向的出场角色本轮方向工具机器名（2026-07-07·分镜方向修改·仅方向真要变时用）。 */
export const TIDIAO_REVISE_CAST_DIRECTION_TOOL_NAME = 'reviseCastDirection'
/** 收尾本轮工具机器名（所有角色方向定完后结束这一轮）。 */
export const TIDIAO_FINISH_ROUND_TOOL_NAME = 'finishRound'

// ── 批次F（2026-07-03·层6 TODO 引擎）todo 两件套机器名 ──
/** 写 todo 工具机器名（一次可写多条·分轮级/跨轮）。 */

// ── 剧本（2026-07-06·用户拍板「剧本=编剧 subagent·提调只拿本轮指导」）工具机器名 ──
/** 问编剧工具机器名（把本轮信息交给编剧 subagent：它先修订剧本、再返回本轮编排指导）。 */
export const TIDIAO_CONSULT_SCRIPT_TOOL_NAME = 'consultScript'

// ── R1-B B5-2 item2c 旁白两件套机器名（canonical 家·从 personalityNarrationSubagent kit 收口进全局池） ──
/** 读旁白 skill 内容本体工具机器名（提调据此写旁白生成提示词）。 */
export const TIDIAO_READ_NARRATION_SKILL_TOOL_NAME = 'readNarrationSkill'
/** 确认旁白调用工具机器名（提交 generatedPrompt 定本轮旁白方向）。 */
export const TIDIAO_CONFIRM_NARRATION_CALL_TOOL_NAME = 'confirmNarrationCall'
/** 改一条已确认旁白的生成方向工具机器名（2026-07-07·分镜方向修改·仅方向真要变时用）。 */
export const TIDIAO_REVISE_NARRATION_DIRECTION_TOOL_NAME = 'reviseNarrationDirection'

// ── R1-B B5-2 item2b 编排工具机器名（canonical 家·从 replyPlanOrchestratorHarness 内联收口进全局池） ──
/** 按反应类别+强度生成候选计划工具机器名（台词生成链路核心）。 */
export const TIDIAO_GENERATE_PLAN_BATCH_TOOL_NAME = 'generatePlanBatch'
/** 评审候选计划取前三工具机器名（本地 ReRanker）。 */
export const TIDIAO_REVIEW_PLAN_CANDIDATES_TOOL_NAME = 'reviewPlanCandidates'
/** 静默改帷幕时间地点工具机器名（用户明确快进/改地点意图时）。 */
export const TIDIAO_UPDATE_CURTAIN_SCENE_TOOL_NAME = 'updateCurtainScene'

// ── 状态系统（积木骨架计划批次5·2026-07-08）工具机器名 ──
/** 读当前会话状态系统全貌工具机器名（只读·改状态前拿准确名称）。 */
export const TIDIAO_READ_STATUS_PANELS_TOOL_NAME = 'readStatusPanels'
/** 读取本轮已召回的一条世界级叙事种子完整因果与知情边界（只读）。 */
export const TIDIAO_READ_NARRATIVE_SEED_TOOL_NAME = 'readNarrativeSeed'
export const TIDIAO_CREATE_NARRATIVE_SEED_TOOL_NAME = 'createNarrativeSeed'
export const TIDIAO_UPDATE_NARRATIVE_SEED_TOOL_NAME = 'updateNarrativeSeed'
/** 更新一张状态栏字段值工具机器名（剧情造成的状态变化落账·合并更新只给要改的键）。 */
export const TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME = 'updateStatusPanel'
/** 按工具名取手册工具机器名（元工具）。 */
export const TIDIAO_GET_TOOL_MANUAL_TOOL_NAME = 'getToolManual'

// ── 采风钻取（状态系统融入提调计划批次2·2026-07-10）工具机器名 ──
/** 派「采风」钻取员工具机器名（统筹专属·手头三渠道不够写本轮时派子 agent 去查·可同轮多发并行）。 */
export const TIDIAO_DISPATCH_RESEARCH_TOOL_NAME = 'dispatchResearch'

// ── 绘舆作图（地图系统批5·2026-07-11）工具机器名 ──
/** 派「绘舆」作图员工具机器名（统筹+纠偏·剧情出现地图信号时派子 agent 更新舆图并带回格局摘要）。 */
export const TIDIAO_DISPATCH_MAP_WORK_TOOL_NAME = 'dispatchMapWork'

// ── 提调建状态栏 + scope 确认（状态系统融入提调计划批次4·2026-07-10）工具机器名 ──
// 与星依侧同名工具外观一致（跨 harness 不冲突·知识库/用户心智同一套），但门控不同：
// 星依走 confirmWrite 写确认门；提调走 scope 确认门——confirmStatusScope 挂起弹卡，用户确认后的
// 续跑轮才注册建卡两件套（registry 不进=越权也搜不到，同批次3 下架范式）。
/** 建状态栏前请求用户确认范围工具机器名（signal·统筹未确认轮专属·调用即挂起本轮弹 scope 卡）。 */
export const TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME = 'confirmStatusScope'
/** 设计/修改状态栏模板工具机器名（提调版·仅 scope 确认续跑轮注册）。 */
export const TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME = 'saveStatusTemplate'
/** 实例化/更新状态栏工具机器名（提调版·仅 scope 确认续跑轮注册）。 */
export const TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME = 'saveStatusPanel'

// ── 工具改动语义表（2026-07-07 范式优化批次1·单一真值）──────────────────────────
//
// 无动作硬门（noop-done-gate）的推导真值：本轮「是否做过事」不再靠各接缝手工挂观测位
// （curtainSceneTouched/retryAttempted/scriptTouched 已退役），改为「成功的 world 工具执行=做过事」统一推导。
// 判定式（见 isTidiaoToolResultActed）：`acted ?? (status==='success' && semantics==='world')`——
// 静态语义是「可能改世界」，个别工具在 ToolExecutionResult.acted 按实际结果修正（如 consultScript 只有
// revised=true 才算、retryFailedWorkflow 发起过重试就算）。
//
// 四种语义：
// - world（改世界）：执行成功即算「本轮做过事」——改消息/提示词/投影/帷幕/剧本/生成类都在此桶。
// - self（自我管理）：todo 两件套——**不算**做过事（硬门本来就是防「只写 todo 不干活」，语义不能松）。
// - read（只读）：读取/检索/取手册——不算做过事。
// - signal（终态/流程信号）：askUser/escalateCorrection/finishRound——有各自 holder/收尾路径，不进 world 桶
//   （计划书原定三分类，实施时发现这三个塞进哪一类都失真，增设本桶；硬门判定只看 world，行为不变）。
//
// ⚠️ 范式护栏（契约测试 tidiaoToolMutationSemantics.spec 兜底）：**新增任何提调工具必须同批在此登记**——
// 两个提调 loop（纠偏/统筹）建工具集前会经 assertTidiaoToolMutationSemanticsRegistered 校验，漏登记=启动即抛错+测试红。
export type TidiaoToolMutationSemantic = 'world' | 'self' | 'read' | 'signal'

export const TIDIAO_TOOL_MUTATION_SEMANTICS: Record<string, TidiaoToolMutationSemantic> = {
  // 只读族（读取/检索·不算做过事）
  [TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME]: 'read',
  [TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME]: 'read',
  [TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME]: 'read',
  [TIDIAO_READ_SCENARIO_SKILL_TOOL_NAME]: 'read',
  [TIDIAO_READ_NARRATION_SKILL_TOOL_NAME]: 'read',
  [SEARCH_APPEND_LOG_TOOL_NAME]: 'read',
  recallSemantic: 'read',
  searchWorldText: 'read',
  fetchUnitDetail: 'read',
  recallCharacterBrain: 'read',
  [TIDIAO_GET_TOOL_MANUAL_TOOL_NAME]: 'read',
  [TIDIAO_READ_STATUS_PANELS_TOOL_NAME]: 'read',
  [TIDIAO_READ_NARRATIVE_SEED_TOOL_NAME]: 'read',
  [TIDIAO_CREATE_NARRATIVE_SEED_TOOL_NAME]: 'world',
  [TIDIAO_UPDATE_NARRATIVE_SEED_TOOL_NAME]: 'world',
  [TIDIAO_DISPATCH_RESEARCH_TOOL_NAME]: 'read', // 派采风钻取=只读取证（采风全只读·结论进回执不改世界）
  [TIDIAO_DISPATCH_MAP_WORK_TOOL_NAME]: 'world', // ※acted=绘舆真交稿（ok）——派了但作图失败不算做过事
  // 改世界族（成功即算做过事；带※者在 execute 里按实际结果给 acted 修正）
  [TIDIAO_EDIT_CHAT_MESSAGE_TOOL_NAME]: 'world',
  [TIDIAO_APPEND_CHAT_MESSAGE_TOOL_NAME]: 'world',
  [TIDIAO_EDIT_MESSAGE_PROMPT_TOOL_NAME]: 'world',
  [TIDIAO_REPROJECT_MESSAGE_TOOL_NAME]: 'world',
  [TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME]: 'world',
  [TIDIAO_CONFIRM_NARRATION_CALL_TOOL_NAME]: 'world',
  [TIDIAO_REVISE_NARRATION_DIRECTION_TOOL_NAME]: 'world',
  [TIDIAO_ADD_CAST_DIRECTION_TOOL_NAME]: 'world',
  [TIDIAO_REGENERATE_CAST_FROM_DIRECTIONS_TOOL_NAME]: 'world',
  [TIDIAO_REVISE_CAST_DIRECTION_TOOL_NAME]: 'world',
  [TIDIAO_UPDATE_CURTAIN_SCENE_TOOL_NAME]: 'world',
  [TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME]: 'world',
  [TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME]: 'world', // 提调版建卡两件套（批次4·scope 确认续跑轮专属）
  [TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME]: 'world',
  [TIDIAO_RETRY_FAILED_WORKFLOW_TOOL_NAME]: 'world', // ※acted=发起过重试（全失败也算尝试·无单元可试不算）
  [TIDIAO_CONSULT_SCRIPT_TOOL_NAME]: 'world', // ※acted=revised（只问不改本不算做过事）
  [TIDIAO_GENERATE_PLAN_BATCH_TOOL_NAME]: 'world',
  [TIDIAO_REVIEW_PLAN_CANDIDATES_TOOL_NAME]: 'world',
  // 终态/流程信号族（holder/收尾专属路径·不进 world 桶）
  [TIDIAO_ESCALATE_CORRECTION_TOOL_NAME]: 'signal',
  [TIDIAO_ASK_USER_TOOL_NAME]: 'signal',
  [TIDIAO_RESUME_ORCHESTRATION_TOOL_NAME]: 'signal', // 与 escalateCorrection 同桶同 acted 口径（终止本 loop、交回系统执行）
  [TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME]: 'signal', // 与 askUser 同桶（写 holder 即 halt·挂起弹卡等用户确认）
  [TIDIAO_FINISH_ROUND_TOOL_NAME]: 'signal'
}

/** 语义表推导「本次工具执行是否真的改了世界」：结果级 acted 修正优先，缺省=成功的 world 工具即算。
 *  消费方：纠偏 loop 无动作收尾硬门（acted recorder hook）。error/blocked 结果除非显式 acted:true 否则不算。 */
export function isTidiaoToolResultActed(result: {
  toolName: string
  status?: string
  acted?: boolean
}): boolean {
  if (typeof result.acted === 'boolean') return result.acted
  return result.status === 'success' && TIDIAO_TOOL_MUTATION_SEMANTICS[result.toolName] === 'world'
}

/** 范式护栏（契约·两个提调 loop 建工具集前必过）：注册集里每个工具名都必须在语义表登记，
 *  漏登记直接抛错点名——新工具忘登记时任何跑该 loop 的 spec 立刻红，不会静默漏进硬门推导。 */
export function assertTidiaoToolMutationSemanticsRegistered(tools: Array<{ name: string }>): void {
  const missing = tools
    .map((tool) => String(tool?.name || '').trim())
    .filter((name) => name && !TIDIAO_TOOL_MUTATION_SEMANTICS[name])
  if (missing.length) {
    throw new Error(
      `工具改动语义表缺登记：${missing.join('、')}——新增提调工具必须同批在 TIDIAO_TOOL_MUTATION_SEMANTICS`
      + '（tidiaoGlobalTools）登记 world/self/read/signal 语义（无动作硬门的推导真值）。'
    )
  }
}

// ── 自包含小工具（render / error / number·从各 loop 收口·去重一份） ──

/** 统一错误结果（与 replyPlan toolError 同口径）。 */
function toolError(
  type: NonNullable<ToolExecutionResult['error']>['type'],
  message: string,
  details: Record<string, unknown> = {}
): ToolExecutionResult {
  return {
    status: 'error',
    content: message,
    details,
    error: { type, message, retryable: type === 'EXPECTATION_MISMATCH', details }
  }
}

function readNumberArg(value: unknown): number | undefined {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

/** 读会话楼层结果 → 模型可读文本（统一**带 messageId** 版·坑①②统一基准·原群聊/回复编排已带·单聊一并受益）。 */
function renderChatMessageReads(reads: ReturnType<typeof runTidiaoReadChatMessages>['reads']): string {
  if (!reads.length) return '未识别到楼层引用（请用「角色N / 旁白M」，可带范围如「角色3-5」）。'
  return reads
    .map((read) => {
      if (!read.matched) {
        return `【${read.ref}】未找到（${read.kind === 'narration' ? '旁白' : '角色'}消息共 ${read.total} 条）。`
      }
      const who = read.speakerName ? `${read.speakerName}·` : ''
      return `【${read.ref}｜${who}messageId=${read.messageId}】\n${read.content || '（空消息）'}`
    })
    .join('\n\n')
}

/** 精修结果分类 → 模型可读的下一步提示（错误也输出、引导自纠）。 */
function renderEditOutcome(ref: string, outcome: TidiaoEditOutcome, occurrences: number, content: string): string {
  switch (outcome) {
    case 'applied':
      return `「${ref}」原文已精修。当前内容：${content}`
    case 'not-found':
      return `「${ref}」里未找到要替换的旧片段——从你手上它的最新原文（上一次改动回执带的「当前内容」或【4·已读资料】里的全文）取一段连续原文作 oldText 重试；两处都没有时才用 readChatMessage 读一次。`
    case 'ambiguous':
      return `「${ref}」里这段旧片段出现了 ${occurrences} 处，不唯一——请给更长的、能唯一定位的连续片段，或设 replaceAll:true 全替换。`
    case 'empty-old':
      return `oldText 不能为空——请给出要替换的旧片段。`
    case 'no-op':
      return `「${ref}」的新片段与旧片段相同，没有变化——若不需要改这条就略过它。`
    default:
      return `「${ref}」精修未生效。`
  }
}

/** 改提示词结果分类 → 模型可读的下一步提示（中策语义：改的是提示词文本）。 */
function renderPromptEditOutcome(ref: string, outcome: TidiaoEditOutcome, occurrences: number, promptText: string): string {
  switch (outcome) {
    case 'applied':
      return `「${ref}」的提示词已改。当前提示词：${promptText}`
    case 'not-found':
      return `「${ref}」的提示词里未找到要替换的旧片段——从你手上它的最新提示词（上一次改动回执带的「当前提示词」或【4·已读资料】里的全文）取一段连续原文作 oldText 重试；两处都没有时才用 readMessagePrompt 读一次。`
    case 'ambiguous':
      return `「${ref}」的提示词里这段旧片段出现了 ${occurrences} 处，不唯一——请给更长的唯一片段，或设 replaceAll:true 全替换。`
    case 'empty-old':
      return `oldText 不能为空——请给出提示词里要替换的旧片段。`
    case 'no-op':
      return `「${ref}」的新片段与旧片段相同，提示词没有变化——若不需要改它就略过。`
    default:
      return `「${ref}」改提示词未生效。`
  }
}

/** 取料命中 → 模型可读文本（命中带标题/相似度/unitId + 片段，未命中提示）。四 loop 收口一份。 */
function renderRetrievalHits(hits: Array<{ unitId: string; title: string; snippet: string; score?: number; matchedQueries?: string[] }>): string {
  if (!hits.length) return '未命中任何世界素材。'
  return hits
    .map((hit, index) => {
      const score = typeof hit.score === 'number' ? `（相似度 ${hit.score.toFixed(3)}）` : ''
      // 多关键词检索才有 matchedQueries（单关键词不标注），标出本条命中了哪些词
      const matched = hit.matchedQueries?.length ? `（命中：${hit.matchedQueries.join('、')}）` : ''
      return `${index + 1}. ${hit.title || hit.unitId}${score}${matched} [unitId=${hit.unitId}]\n   ${hit.snippet || ''}`.trimEnd()
    })
    .join('\n')
}

// ── 读改原文族 ──

/** 读会话原文（M2）。接缝重构：工厂收 {@link TidiaoReadChatMessageToolContext} 闭包捕获（readContext 必填·漏传编译期错）。 */
export function createReadChatMessageTool(ctx: TidiaoReadChatMessageToolContext): ToolDefinition {
  return {
    name: TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME),
    fieldLifecycle: { reads: 'searchable' },
      validateArgs: (args) => {
        const references = Array.isArray(args.references) ? args.references : []
        return String(args.query ?? args.ref ?? '').trim() || args.reference || args.messageId || references.length
          ? null
          : 'readChatMessage 缺少 query（楼层引用）或 reference/messageId（稳定消息引用）'
      },
    execute: (toolCall) => {
      const budgetError = ctx.consumeRetrievalBudget?.()
      if (budgetError) return budgetError
        const query = String(toolCall.args.query ?? toolCall.args.ref ?? '').trim()
        const references = [
          ...(Array.isArray(toolCall.args.references) ? toolCall.args.references : []),
          ...(toolCall.args.reference ? [toolCall.args.reference] : []),
          ...(toolCall.args.messageId ? [toolCall.args.messageId] : [])
        ]
        const result = runTidiaoReadChatMessages({ ...(query ? { query } : {}), ...(references.length ? { references } : {}) }, ctx.readContext)
      const reason = String(toolCall.args.reason || '').trim()
      const matchedCount = result.reads.filter((read) => read.matched).length
      ctx.recordRetrievalDecision?.({ tool: TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME, query, ...(reason ? { reason } : {}), hitCount: matchedCount })
      return {
        content: renderChatMessageReads(result.reads),
        details: { kind: 'chatMessage', query, reason, expectation: toolCall.expectation, matchedCount, reads: result.reads }
      }
    }
  }
}

/** 锚定精修改原文（M3）。接缝重构：工厂收 {@link TidiaoEditChatMessageToolContext} 闭包捕获（editContext 必填·onEditTargeted/onEditCommitted 缺省 no-op）。 */
export function createEditChatMessageTool(ctx: TidiaoEditChatMessageToolContext): ToolDefinition {
  return {
    name: TIDIAO_EDIT_CHAT_MESSAGE_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_EDIT_CHAT_MESSAGE_TOOL_NAME),
    validateArgs: (args) => {
      if (!String(args.ref ?? '').trim()) return 'editChatMessage 缺少 ref（楼层引用，如「角色2」）'
      if (typeof args.oldText !== 'string' || !args.oldText.length) return 'editChatMessage 缺少 oldText（要替换的旧片段）'
      if (typeof args.newText !== 'string') return 'editChatMessage 缺少 newText（新片段，可为空串表示删除）'
      return null
    },
    execute: async (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      const oldText = String(toolCall.args.oldText ?? '')
      const newText = String(toolCall.args.newText ?? '')
      const replaceAll = Boolean(toolCall.args.replaceAll)
      const result = runTidiaoEditChatMessage({ ref, oldText, newText, replaceAll }, ctx.editContext)
      const edit = result.edit
      if (!edit) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      if (!edit.matched) {
        return {
          content: `「${edit.ref}」不存在（${edit.kind === 'narration' ? '旁白' : '角色'}消息共 ${edit.total} 条），请核对楼层号。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${edit.ref} 越界` }
        }
      }
      const content = renderEditOutcome(edit.ref, edit.outcome, edit.occurrences, edit.content)
      if (edit.outcome === 'applied') {
        // 段级光带高亮（2026-07-11 起纠偏/精修两条支路都装配）：oldText 此刻仍在展示正文里、可定位。
        ctx.onEditTargeted?.({ messageId: edit.messageId, ref: edit.ref, oldText })
        // 即时落库（批次1）：改完即把该消息当前完整内容交出去落库（await，写完再继续），中途停也已保留。
        await ctx.onEditCommitted?.({ messageId: edit.messageId, ref: edit.ref, content: edit.content })
        return { content, details: { kind: 'chatMessageEdit', ref: edit.ref, messageId: edit.messageId, outcome: edit.outcome } }
      }
      return { content, status: 'error', error: { type: 'INVALID_ARGUMENT', message: content, retryable: false } }
    }
  }
}

/** 精准追加结果分类 → 模型可读的下一步提示（追加语义：afterText 是锚点而非被替换片段）。 */
function renderAppendOutcome(ref: string, outcome: TidiaoEditOutcome, occurrences: number, content: string): string {
  switch (outcome) {
    case 'applied':
      return `「${ref}」已补写新内容。当前内容：${content}`
    case 'not-found':
      return `「${ref}」里未找到 afterText 锚点——从你手上它的最新原文取一段连续原文作锚点重试；若就是要补到消息末尾，直接不传 afterText。`
    case 'ambiguous':
      return `「${ref}」里这段 afterText 锚点出现了 ${occurrences} 处，不唯一——请给更长的、能唯一定位的连续片段。`
    case 'no-op':
      return `text 不能为空——请写出要补写的内容（模仿该消息已有文风、从断点自然接续）。`
    default:
      return `「${ref}」补写未生效。`
  }
}

/** 精准增加内容（2026-07-07·补完截断消息）。与 editChatMessage 共用 {@link TidiaoEditChatMessageToolContext}：
 *  同一工作副本累积、同一 collectEdits 写回、同一 onEditCommitted 即时落库——只增不改，改/删走 editChatMessage。 */
export function createAppendChatMessageTool(ctx: TidiaoEditChatMessageToolContext): ToolDefinition {
  return {
    name: TIDIAO_APPEND_CHAT_MESSAGE_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_APPEND_CHAT_MESSAGE_TOOL_NAME),
    validateArgs: (args) => {
      if (!String(args.ref ?? '').trim()) return 'appendChatMessage 缺少 ref（楼层引用，如「角色2」）'
      if (typeof args.text !== 'string' || !args.text.length) return 'appendChatMessage 缺少 text（要补写的新内容，不能为空）'
      return null
    },
    execute: async (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      const text = String(toolCall.args.text ?? '')
      const afterText = String(toolCall.args.afterText ?? '')
      const result = runTidiaoAppendChatMessage({ ref, text, ...(afterText ? { afterText } : {}) }, ctx.editContext)
      const edit = result.edit
      if (!edit) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      if (!edit.matched) {
        return {
          content: `「${edit.ref}」不存在（${edit.kind === 'narration' ? '旁白' : '角色'}消息共 ${edit.total} 条），请核对楼层号。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${edit.ref} 越界` }
        }
      }
      const content = renderAppendOutcome(edit.ref, edit.outcome, edit.occurrences, edit.content)
      if (edit.outcome === 'applied') {
        // 段级光带高亮（2026-07-11 起纠偏/精修两条支路都装配·仅锚点插入可定位——末尾追加无在屏旧片段可锚，不上报）。
        if (afterText) ctx.onEditTargeted?.({ messageId: edit.messageId, ref: edit.ref, oldText: afterText })
        // 即时落库：补完即把该消息当前完整内容交出去落库（await，写完再继续），中途停也已保留。
        await ctx.onEditCommitted?.({ messageId: edit.messageId, ref: edit.ref, content: edit.content })
        return { content, details: { kind: 'chatMessageEdit', ref: edit.ref, messageId: edit.messageId, outcome: edit.outcome } }
      }
      return { content, status: 'error', error: { type: 'INVALID_ARGUMENT', message: content, retryable: false } }
    }
  }
}

// ── 读改提示词族（中策·单聊纠偏专属·单点收口） ──

/** 中策读提示词（P1）。接缝重构：工厂收 {@link TidiaoMessagePromptToolContext} 闭包捕获（promptContext 必填）。 */
export function createReadMessagePromptTool(ctx: TidiaoMessagePromptToolContext): ToolDefinition {
  return {
    name: TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME),
    validateArgs: (args) =>
      String(args.ref ?? '').trim() ? null : 'readMessagePrompt 缺少 ref（楼层引用，如「角色2」）',
    execute: async (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      // 批次E：接缝允许懒取（统筹 loop 按需 fetch promptLog），run 已转 async；纠偏预取桶同步实现行为不变。
      const result = await runTidiaoReadMessagePrompt({ ref }, ctx.promptContext)
      // 2026-07-06 真机修：未命中也要给可执行口径——旧文案只说「无提示词可读」，提调走中策撞死后直接沉默收尾。
      const content = result.reads.length
        ? result.reads.map((read) => read.matched
            ? `【${read.ref}｜${read.speakerName || ''} 的提示词】\n${read.promptText || '（空提示词）'}`
            : `【${read.ref}】无提示词可读（${read.kind === 'narration' ? '旁白' : '角色'}消息共 ${read.total} 条）。先核对楼层号是否写对；若楼层没错，说明这条消息没有已存的生成提示词——改提示词/按提示词重生成对它走不通，要调整它就直接用 editChatMessage 改原文，或换其他可用策略，不要就此不了了之。`).join('\n\n')
        : '未识别到楼层引用（请用「角色N / 旁白M」）。'
      return { content, details: { kind: 'messagePromptRead', ref, reads: result.reads } }
    }
  }
}

/** 中策改提示词（P1）。接缝重构：工厂收 {@link TidiaoMessagePromptToolContext} 闭包捕获（promptContext 必填）。 */
export function createEditMessagePromptTool(ctx: TidiaoMessagePromptToolContext): ToolDefinition {
  return {
    name: TIDIAO_EDIT_MESSAGE_PROMPT_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_EDIT_MESSAGE_PROMPT_TOOL_NAME),
    validateArgs: (args) => {
      if (!String(args.ref ?? '').trim()) return 'editMessagePrompt 缺少 ref（楼层引用，如「角色2」）'
      if (typeof args.oldText !== 'string' || !args.oldText.length) return 'editMessagePrompt 缺少 oldText（提示词里要替换的旧片段）'
      if (typeof args.newText !== 'string') return 'editMessagePrompt 缺少 newText（新片段，可为空串表示删除）'
      return null
    },
    execute: (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      const oldText = String(toolCall.args.oldText ?? '')
      const newText = String(toolCall.args.newText ?? '')
      const replaceAll = Boolean(toolCall.args.replaceAll)
      const result = runTidiaoEditMessagePrompt({ ref, oldText, newText, replaceAll }, ctx.promptContext)
      const edit = result.edit
      if (!edit) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      if (!edit.matched) {
        return {
          content: `「${edit.ref}」无提示词可改（${edit.kind === 'narration' ? '旁白' : '角色'}消息共 ${edit.total} 条），请核对楼层号。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${edit.ref} 越界` }
        }
      }
      const content = renderPromptEditOutcome(edit.ref, edit.outcome, edit.occurrences, edit.promptText)
      if (edit.outcome === 'applied') {
        return { content, details: { kind: 'messagePromptEdit', ref: edit.ref, messageId: edit.messageId, outcome: edit.outcome } }
      }
      return { content, status: 'error', error: { type: 'INVALID_ARGUMENT', message: content, retryable: false } }
    }
  }
}

// ── 读投影族（群聊只读 + 单聊纠偏/精修·收口统一） ──

/** 读消息投影。坑①②统一：base 取单聊形态（!matched→可重试错误·引导自纠）+ 群聊侧 `read`(searchable)/留痕一并并入·details superset。 */
export function createReadMessageProjectionTool(ctx: TidiaoMessageProjectionToolContext): ToolDefinition {
  return {
    name: TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME),
    fieldLifecycle: { read: 'searchable' },
    validateArgs: (args) =>
      String(args.ref ?? '').trim() ? null : 'readMessageProjection 缺少 ref（楼层引用，如「角色2」）',
    execute: (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      const read = runTidiaoReadMessageProjection({ ref }, ctx.projectionContext).read
      // 群聊侧原行为=不论命中与否都留痕（query=ref）；单聊侧不装配→no-op。
      ctx.recordRetrievalDecision?.({ tool: TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME, query: ref })
      if (!read) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      if (!read.matched) {
        return {
          content: `「${read.ref}」不存在（${read.kind === 'narration' ? '旁白' : '角色'}消息共 ${read.total} 条），请核对楼层号。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${read.ref} 越界` }
        }
      }
      if (!read.hasProjection) {
        return {
          content: `「${read.ref}」当前还没有客观事实投影（状态：${read.status || '无'}）。若这条已改动且需要投影，可用 reprojectMessage 标记重投影。`,
          details: { kind: 'messageProjectionRead', ref: read.ref, messageId: read.messageId, hasProjection: false, read }
        }
      }
      const detailLines = [`「${read.ref}｜${read.speakerName || ''}」当前投影：`, `客观事实：${read.objectiveFact}`]
      if (read.startEnvText || read.endEnvText) detailLines.push(`环境：${read.startEnvText || '（未知）'} → ${read.endEnvText || '（未知）'}`)
      if (read.changedText) detailLines.push(`变化：${read.changedText}`)
      return { content: detailLines.join('\n'), details: { kind: 'messageProjectionRead', ref: read.ref, messageId: read.messageId, hasProjection: true, read } }
    }
  }
}

/** 标记重投（单聊纠偏/精修·群聊不挂=只读不改）。content 统一为情境中性「保存后...」。 */
export function createReprojectMessageTool(ctx: TidiaoMessageProjectionToolContext): ToolDefinition {
  return {
    name: TIDIAO_REPROJECT_MESSAGE_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_REPROJECT_MESSAGE_TOOL_NAME),
    validateArgs: (args) =>
      String(args.ref ?? '').trim() ? null : 'reprojectMessage 缺少 ref（楼层引用，如「角色2」）',
    execute: (toolCall) => {
      const ref = String(toolCall.args.ref ?? '').trim()
      const mark = runTidiaoMarkReproject({ ref }, ctx.projectionContext).mark
      if (!mark) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      if (!mark.matched) {
        return {
          content: `「${mark.ref}」不存在（${mark.kind === 'narration' ? '旁白' : '角色'}消息共 ${mark.total} 条），请核对楼层号。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${mark.ref} 越界` }
        }
      }
      return {
        content: `已标记「${mark.ref}」需要重投影——保存后会基于新原文自动重新生成它的投影。`,
        details: { kind: 'messageReproject', ref: mark.ref, messageId: mark.messageId }
      }
    }
  }
}

// ── 取料三件套（群聊导演 + 回复编排·收口统一·预算/落池/留痕全走可选回调） ──

function retrievalBriefOf(toolName: string): string {
  // 取料三件套契约（whenToUse 唯一真值源·与各 loop 同口径 find）。
  return TIDIAO_RETRIEVAL_CONTRACTS.find((contract) => contract.toolName === toolName)?.whenToUse || toolName
}

/** 语义召回。details superset {kind,query,reason,expectation,hitCount,hits}·hits searchable·预算/落池可选。 */
export function createRecallSemanticTool(ctx: TidiaoRetrievalToolContext): ToolDefinition {
  return {
    name: 'recallSemantic',
    brief: retrievalBriefOf('recallSemantic'),
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '单个检索意图或关键词（与 queries 至少给一个）。一次只放一个意图，不要把多个概念拼成一句话互相稀释。' },
        queries: { type: 'array', items: { type: 'string' }, description: '多个检索意图/关键词（可选，最多 8 项）：每项一个独立意图，各自召回后同一单位取最高分合并去重。多个不相干概念请用本参数分项给。' },
        topK: { type: 'number', description: '取回条数上限（可选，默认 6，最多 20）。' },
        reason: { type: 'string', description: '为何取这料（可选，简短，供审计）。' }
      }
    },
    fieldLifecycle: { hits: 'searchable' },
    validateArgs: (args) => normalizeRetrievalQueries({ query: args.query, queries: args.queries }).length
      ? null
      : 'recallSemantic 缺少检索词（单个意图填 query，多个意图填 queries 数组，至少给一个）',
    execute: async (toolCall) => {
      const budgetError = ctx.consumeRetrievalBudget?.()
      if (budgetError) return budgetError
      const queries = normalizeRetrievalQueries({ query: toolCall.args.query, queries: toolCall.args.queries })
      const query = queries.join('｜') // 审计/展示口径：多词用「｜」连成一条
      const topK = readNumberArg(toolCall.args.topK ?? toolCall.args.top_k)
      const result = await runTidiaoSemanticRecall({ queries, topK }, ctx.retrievalContext)
      const reason = String(toolCall.args.reason || '').trim()
      ctx.recordRetrievalDecision?.({ tool: 'recallSemantic', query, ...(reason ? { reason } : {}), hitCount: result.hits.length })
      // 3d：世界料只查文档库 → 命中追加进世界池（群聊装配·回复编排不装配→no-op）。
      ctx.recallPoolAppend?.world(result.hits.map((hit) => ({ unitId: hit.unitId, title: hit.title, summary: hit.snippet, score: hit.score })))
      return {
        content: renderRetrievalHits(result.hits),
        details: { kind: 'semantic', query, queries, reason, expectation: toolCall.expectation, hitCount: result.hits.length, hits: result.hits }
      }
    }
  }
}

/** 世界书文本检索。details superset {kind,query,regex,reason,expectation,hitCount,hits}。 */
export function createSearchWorldTextTool(ctx: TidiaoRetrievalToolContext): ToolDefinition {
  return {
    name: 'searchWorldText',
    brief: retrievalBriefOf('searchWorldText'),
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '单个要精确命中的专名/术语/地名/道具名或关键词（与 queries 至少给一个，字面匹配）。❌不要用空格把多个词拼在一起——那会按整串匹配几乎必然搜空，多个词请改用 queries。' },
        queries: { type: 'array', items: { type: 'string' }, description: '多个关键词（可选，最多 8 项）：每项一个词，任一命中即返回（OR），命中条目会标注命中了哪些词。搜多个专名、或同一概念的不同写法（如「酒馆」「客栈」）时用它一次搜完。' },
        regex: { type: 'boolean', description: '是否把每个关键词当正则解释（可选，默认字面匹配）。如「酒馆|客栈」的或匹配现在可直接用 queries 分项，不必写正则。' },
        limit: { type: 'number', description: '返回条数上限（可选，默认 8，最多 30）。' },
        reason: { type: 'string', description: '为何搜这个词（可选，简短，供审计）。' }
      }
    },
    fieldLifecycle: { hits: 'searchable' },
    validateArgs: (args) => normalizeRetrievalQueries({ query: args.query, queries: args.queries }).length
      ? null
      : 'searchWorldText 缺少检索词（单个词填 query，多个词填 queries 数组，至少给一个）',
    execute: (toolCall) => {
      const budgetError = ctx.consumeRetrievalBudget?.()
      if (budgetError) return budgetError
      const queries = normalizeRetrievalQueries({ query: toolCall.args.query, queries: toolCall.args.queries })
      const query = queries.join('｜') // 审计/展示口径：多词用「｜」连成一条
      const limit = readNumberArg(toolCall.args.limit)
      const regex = Boolean(toolCall.args.regex)
      const result = runTidiaoTextSearch({ queries, regex, limit }, ctx.retrievalContext)
      const reason = String(toolCall.args.reason || '').trim()
      ctx.recordRetrievalDecision?.({ tool: 'searchWorldText', query, ...(reason ? { reason } : {}), hitCount: result.hits.length })
      ctx.recallPoolAppend?.world(result.hits.map((hit) => ({ unitId: hit.unitId, title: hit.title, summary: hit.snippet, score: hit.score })))
      return {
        content: renderRetrievalHits(result.hits),
        details: { kind: 'textSearch', query, queries, regex, reason, expectation: toolCall.expectation, hitCount: result.hits.length, hits: result.hits }
      }
    }
  }
}

/** 定点读取世界单位。details superset {kind,unitId,level,reason,expectation,contentLength,unit}·unit searchable。 */
export function createFetchUnitDetailTool(ctx: TidiaoRetrievalToolContext): ToolDefinition {
  return {
    name: 'fetchUnitDetail',
    brief: retrievalBriefOf('fetchUnitDetail'),
    schema: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: '要读取的单位 id（必填，取自前一步 searchWorldText/recallSemantic 命中的 unitId，必须一字不差原样复制；可能形如 doc:doc-xxx 或短码 u#xxx）。' },
        level: { type: 'string', enum: ['summary', 'body'], description: '取摘要还是正文（可选，默认 summary，确有必要再取 body）。' },
        reason: { type: 'string', description: '为何读它（可选，简短，供审计）。' }
      },
      required: ['unitId']
    },
    fieldLifecycle: { unit: 'searchable' },
    validateArgs: (args) => String(args.unitId ?? args.unit_id ?? '').trim() ? null : 'fetchUnitDetail 缺少 unitId',
    execute: (toolCall) => {
      const budgetError = ctx.consumeRetrievalBudget?.()
      if (budgetError) return budgetError
      const unitId = String(toolCall.args.unitId ?? toolCall.args.unit_id ?? '').trim()
      const level = String(toolCall.args.level || '').trim() === 'body' ? 'body' : 'summary'
      const result = runTidiaoFetchUnit({ unitId, level }, ctx.retrievalContext)
      if (!result) return toolError('TOOL_RUNTIME_ERROR', `未找到单位 ${unitId}`, { unitId, level })
      const reason = String(toolCall.args.reason || '').trim()
      // 定点读取无检索词，用命中单位标题（无标题回退 unitId）作为编排带展示的 query。
      ctx.recordRetrievalDecision?.({ tool: 'fetchUnitDetail', query: result.title || result.unitId, ...(reason ? { reason } : {}) })
      // 3d：定点读取的世界单位也追加进世界池（按 level 落正文/摘要·群聊装配·回复编排不装配→no-op）。
      ctx.recallPoolAppend?.world([result.level === 'body'
        ? { unitId: result.unitId, title: result.title, body: result.content }
        : { unitId: result.unitId, title: result.title, summary: result.content }])
      return {
        content: `【${result.title || result.unitId}· ${result.level === 'body' ? '正文' : '摘要'}】\n${result.content || '（无内容）'}`,
        details: {
          kind: 'fetch',
          unitId: result.unitId,
          level: result.level,
          reason,
          expectation: toolCall.expectation,
          contentLength: result.content.length,
          unit: { unitId: result.unitId, title: result.title, level: result.level, content: result.content }
        }
      }
    }
  }
}

/** 召回角色大脑（群聊导演专属·范围受限铁律）。接缝重构：候选清单工厂期闭包捕获已知 → schema 工厂期用 candidates.text 直接造静态（去 schemaFactory）。 */
function buildRecallCharacterBrainSchema(castList: string | undefined): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      characterId: {
        type: 'string',
        description: castList
          ? `要追加召回的出场角色 characterId（必填，须是本轮候选之一：${castList}）。`
          : '要追加召回的出场角色 characterId（必填，须是本轮出场候选之一）。'
      },
      query: { type: 'string', description: '要召回的检索意图或关键词（必填）。一次只放一个意图；有多个不相干意图请分多次调用，不要拼成一句话互相稀释。' },
      topK: { type: 'number', description: '取回条数上限（可选）。' }
    },
    required: ['characterId', 'query']
  }
}
export function createRecallCharacterBrainTool(ctx: TidiaoRecallCharacterBrainToolContext): ToolDefinition {
  return {
    name: 'recallCharacterBrain',
    brief: '当某出场角色开局预备的资料不够、需要更多他自身记忆/认知时，按该角色 characterId + 检索意图追加召回他**自己的大脑+公共区**（绝不查别人、绝不查世界文档库）。结果补进该角色资料池，本轮后续他的发言可用。',
    // 接缝重构：候选清单工厂期已知 → schema 工厂期用 candidates.text 直接造静态（无候选=中性 schema·去 schemaFactory）。
    schema: buildRecallCharacterBrainSchema(ctx.candidates.text || undefined),
    fieldLifecycle: { hits: 'searchable' },
    // 候选校验仍在 execute（validateArgs 无 args 外数据·只留 characterId/query 必填·候选/越界校验读闭包 ctx.candidates）。
    validateArgs: (args) => {
      if (!String(args.characterId ?? args.character_id ?? '').trim()) return 'recallCharacterBrain 缺少 characterId'
      if (!String(args.query || '').trim()) return 'recallCharacterBrain 缺少 query'
      return null
    },
    execute: async (toolCall) => {
      const characterId = String(toolCall.args.characterId ?? toolCall.args.character_id ?? '').trim()
      const query = String(toolCall.args.query || '').trim()
      if (!ctx.candidates.set.has(characterId)) {
        const message = `characterId=${characterId} 不在本轮出场候选内；可用：${ctx.candidates.text}`
        return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message } }
      }
      const topK = readNumberArg(toolCall.args.topK ?? toolCall.args.top_k)
      const hits = await ctx.recallCharacter(characterId, query, topK)
      ctx.recordRetrievalDecision?.({ tool: 'recallCharacterBrain', query })
      return { content: renderRetrievalHits(hits), details: { hits } }
    }
  }
}

/** 派「采风」钻取员（dispatchResearch·统筹专属·状态系统融入提调计划批次2·2026-07-10）。
 *  接缝重构范式：工厂收 {@link TidiaoResearchDispatchContext} 闭包捕获；dispatch 由管线装配
 *  （采风小 loop 运行+回执渲染都在管线/caifengSubagent 侧收口，本工厂零依赖采风模块）。
 *  同轮可发多个（互不依赖的缺口一次派全）——统筹 loop 已把本工具列入 concurrency 白名单整批并发。 */
export function createDispatchResearchTool(ctx: TidiaoResearchDispatchContext): ToolDefinition {
  return {
    name: TIDIAO_DISPATCH_RESEARCH_TOOL_NAME,
    // 内部 await ctx.dispatch(...) 派发「采风」钻取子 agent 跑一整条 loop，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '手头三渠道（对话可见历史/资料池/角色状态栏）不够写本轮时，派「采风」钻取员去查证——它能读消息原文/搜整份投影/检索文档库/召回角色大脑/读状态栏详情（含顺「引用」查物品组织）。给它明确的任务标题+逐条任务书（要查什么、以什么为准算查到）；多个互不依赖的缺口就同轮发多个 dispatchResearch 并行钻取，别串行等。结论带出处回到回执里。可用 timeoutMinutes 为复杂调查主动延长时限；超时不等于没有资料。',
    schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '钻取任务短标题（必填·显示在运行卡上，如「查元英的佩剑来历」）。一个任务只管一个主题；多个主题分多次派。' },
        instructions: { type: 'string', description: '任务书（必填·逐条列出）：每条写清要查什么、以什么为准算查到（验收标准）。已知线索（楼层号/单位名/角色名）一并写给它，省它摸索。' },
        focus: { type: 'string', description: '建议钻取方向（可选，如「先 searchChatProjection 搜投影再读原文」「文档库找组织设定」「readStatusPanels 顺引用查武器」）。' },
        timeoutMinutes: SUBAGENT_TIMEOUT_SCHEMA_PROPERTY
      },
      required: ['task', 'instructions']
    },
    validateArgs: (args) => {
      if (!String(args.task || '').trim()) return 'dispatchResearch 缺少 task（任务短标题）'
      if (!String(args.instructions || '').trim()) return 'dispatchResearch 缺少 instructions（逐条任务书+验收标准）'
      const timeoutError = validateSubagentTimeoutMinutes(args.timeoutMinutes)
      if (timeoutError) return timeoutError
      return null
    },
    execute: async (toolCall) => {
      const input = {
        task: String(toolCall.args.task || '').trim(),
        instructions: String(toolCall.args.instructions || '').trim(),
        ...(String(toolCall.args.focus || '').trim() ? { focus: String(toolCall.args.focus).trim() } : {}),
        ...(toolCall.args.timeoutMinutes !== undefined
          ? { timeoutMinutes: resolveSubagentTimeout(toolCall.args.timeoutMinutes).timeoutMinutes }
          : {})
      }
      // 采风失败不算工具错误（工具执行本身成功·失败信息与重派引导在回执正文里），不标 status:'error'
      // ——避免触发 runtime 同错熔断把「查不到」误当基础设施故障。
      const outcome = await ctx.dispatch(input)
      return { content: outcome.content, details: { kind: 'caifengDispatch', ok: outcome.ok, ...(outcome.details || {}) } }
    }
  }
}

/** 派「绘舆」作图员（dispatchMapWork·统筹+纠偏·地图系统批5·2026-07-11）。
 *  与 dispatchResearch 同构：工厂收 {@link TidiaoMapWorkDispatchContext} 闭包捕获；dispatch 由管线装配
 *  （绘舆小 loop 运行+回执渲染都在管线/huiyuSubagent 侧收口，本工厂零依赖绘舆模块）。
 *  渐进式披露层2（计划书「绘舆上下文渐进式披露」节）：本 brief/schema 教「怎么派」——给剧情事实不给坐标。
 *  批D（笔刷约束系统·阶段管线）：mode 必填三选一，与星依侧 dispatchMapWork 同口径；staged 为
 *  stage-per-dispatch（每次派发只做当前阶段一个分段，回执引导你用 askUser 问用户后带参重派）。 */
export function createDispatchMapWorkTool(ctx: TidiaoMapWorkDispatchContext): ToolDefinition {
  return {
    name: TIDIAO_DISPATCH_MAP_WORK_TOOL_NAME,
    // 内部 await ctx.dispatch(...) 派发「绘舆」作图子 agent 跑一整条 loop（staged 模式还会内联等用户确认卡），
    // 耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '剧情出现地图信号（角色位置移动/新地点·建筑·地标首次落名/队伍进入未探索区域）时，派「绘舆」作图员更新世界舆图。'
      + '任务书只给剧情事实：谁从哪到哪、新地点相对既有地物的方位与距离描述（如「临澜城以北半日路程」）、地形观感——不要给坐标，坐标绘舆读图后自己定。'
      + '必填 mode 三选一：造新图/整片区域大改用 "staged"（阶段制：地形→水系→人文，每次派发只推进一个分段，回执会告诉你下一步该用 askUser 问用户什么、拿到答复后带什么参数重派）；'
      + '单个地标/角色移动/已有格局上的小增量用 "draw"（直接落笔）；拿不准用 "draft"（绘舆先拟格局草案带回给你，你转述给用户确认后再派 draw 落笔）。'
      + '交稿回执带回更新后的地图格局摘要，供你续写剧情时引用方位与距离。',
    schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '作图任务短标题（必填·显示在运行卡上，如「一行人抵达临澜城」「新增玄岳山道」）。' },
        instructions: { type: 'string', description: '任务书（必填·剧情事实逐条）：谁移动了（从哪到哪）/新地点叫什么、相对哪个既有地物什么方位多远（用「半日路程≈20~30km」「一箭之地≈150m」这类量级描述）/地形观感（山势/水域/城镇规模）。不给坐标。' },
        mode: {
          type: 'string',
          enum: ['draft', 'draw', 'staged'],
          description: 'mode 三选一（必填）：造新图/整片区域大改="staged"（阶段制分段推进，每段之间按回执引导用 askUser 问用户再重派）；单个地标/角色移动/小增量="draw"（直接落笔）；拿不准或想先看格局草案="draft"（草案带回给你转述确认）。'
        },
        stagedStep: {
          type: 'string',
          enum: ['draft', 'draw', 'confirmStage'],
          description: '仅 mode:"staged" 用（可选·首次派发不传=从草案分段开始）：上一次 staged 回执会明确告诉你下次该传哪个值——"draw"=草案已获用户确认去落笔；"confirmStage"=把用户对阶段收尾确认卡的答复带回来处理。'
        },
        confirmAnswer: {
          type: 'string',
          description: '仅 stagedStep:"confirmStage" 用：用户对阶段收尾确认卡的原始回复文本（确认标签/驳回标签/自由修改意见，原样转交不要改写）。'
        },
        override: {
          type: 'string',
          enum: ['terraform'],
          description: '高门槛改造通道（可选）：要改动已被阶段收尾锁定的内容（削山/改河道/拆城等）时传 "terraform"——首次派发回执会给确认卡问题，你用 askUser 问用户批准后再带 stagedStep:"draw"+override 重派。普通作画不要传。'
        },
        focus: { type: 'string', description: '建议方向（可选，如「先挪角色位置再补画新地点」「只扩探索范围不加地物」）。' }
      },
      required: ['task', 'instructions', 'mode']
    },
    validateArgs: (args) => {
      if (!String(args.task || '').trim()) return 'dispatchMapWork 缺少 task（任务短标题）'
      if (!String(args.instructions || '').trim()) return 'dispatchMapWork 缺少 instructions（剧情事实任务书）'
      const mode = String(args.mode || '')
      if (mode !== 'draft' && mode !== 'draw' && mode !== 'staged') return 'dispatchMapWork 缺少或非法的 mode（必须是 "draft"/"draw"/"staged"——拿不准选 "draft"）'
      if (args.stagedStep !== undefined && !['draft', 'draw', 'confirmStage'].includes(String(args.stagedStep))) {
        return 'dispatchMapWork 的 stagedStep 只接受 "draft"/"draw"/"confirmStage"（按上一次 staged 回执的指引传）'
      }
      if (args.override !== undefined && String(args.override) !== 'terraform') return 'dispatchMapWork 的 override 只接受 "terraform"（普通作画不要传 override）'
      return null
    },
    execute: async (toolCall) => {
      const stagedStep = String(toolCall.args.stagedStep || '')
      const confirmAnswer = String(toolCall.args.confirmAnswer || '')
      const input = {
        task: String(toolCall.args.task || '').trim(),
        instructions: String(toolCall.args.instructions || '').trim(),
        mode: toolCall.args.mode as 'draft' | 'draw' | 'staged',
        ...(stagedStep === 'draft' || stagedStep === 'draw' || stagedStep === 'confirmStage' ? { stagedStep: stagedStep as 'draft' | 'draw' | 'confirmStage' } : {}),
        ...(confirmAnswer ? { confirmAnswer } : {}),
        ...(toolCall.args.override === 'terraform' ? { override: 'terraform' as const } : {}),
        ...(String(toolCall.args.focus || '').trim() ? { focus: String(toolCall.args.focus).trim() } : {})
      }
      // 绘舆失败/会话未挂世界不算工具错误（回执正文如实说明·避免同错熔断误判基础设施故障）；
      // acted 结果级修正：真交稿（ok）才算「本轮做过事」，派了没画成不算。
      const outcome = await ctx.dispatch(input)
      return {
        content: outcome.content,
        details: { kind: 'huiyuDispatch', ok: outcome.ok, ...(outcome.details || {}) },
        acted: outcome.ok
      }
    }
  }
}

// ── 纠偏决策信号族（单聊纠偏专属·写 ctx.business.collectors） ──

/** 下策升级：记录原因 + 引导收尾，交 pipeline 转 replan。接缝重构：工厂收 {@link TidiaoEscalateCorrectionToolContext} 闭包捕获。 */
export function createEscalateCorrectionTool(ctx: TidiaoEscalateCorrectionToolContext): ToolDefinition {
  return {
    name: TIDIAO_ESCALATE_CORRECTION_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_ESCALATE_CORRECTION_TOOL_NAME),
    validateArgs: (args) =>
      String(args.reason ?? '').trim() ? null : 'escalateCorrection 缺少 reason（升级原因，一句人话）',
    execute: (toolCall) => {
      const reason = String(toolCall.args.reason ?? '').trim()
      ctx.escalateHolder.escalation = { reason }
      return {
        content: '已记录升级到下策（重判情境、重排这一轮）的请求，原因已收到。请输出 { "done": true } 结束本轮，由系统转交重排。',
        details: { kind: 'correctionEscalate', reason }
      }
    }
  }
}

/** 没把握先问用户：把提问信息装进统一「人在环上」信封（halt 模式），回执携带 awaitingUser——
 *  引擎据此以 terminalReason='awaiting-user' 收束本 loop（见 agentRuntime/runtime.ts），答复由 pipeline
 *  喂进新的纠偏 loop 续接（2026-07-12 架构审查批C：迁移自「holder+halt hook」旧机制——不再自己写 holder、
 *  不再自定义 afterToolResult halt hook，节流也随之简化：引擎「同轮只认第一个」天然取代旧「本轮已提问一次」拦截）。
 *  与 xingyiAskUserTool（blocking 模式·浏览器侧同轮 await 用户）是同名两态双实现，本工具专属 halt 模式，互不干扰。 */
export function createAskUserTool(): ToolDefinition {
  return {
    name: TIDIAO_ASK_USER_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_ASK_USER_TOOL_NAME),
    validateArgs: (args) =>
      String(args.question ?? '').trim() ? null : 'askUser 缺少 question（要问用户的问题，一句人话）',
    execute: (toolCall) => {
      const question = String(toolCall.args.question ?? '').trim()
      const rawOptions = Array.isArray(toolCall.args.options) ? toolCall.args.options : []
      const options = rawOptions.map((opt) => String(opt ?? '').trim()).filter(Boolean)
      const recommended = String(toolCall.args.recommended ?? '').trim()
      return {
        content: '已记录你的问题，本轮先停下来等用户答复——请收尾结束本轮（done），不要自己替用户决定。',
        details: { kind: 'correctionAskUser', question },
        awaitingUser: {
          kind: 'choice',
          title: question,
          options: options.map((label) => ({ label })),
          ...(recommended ? { recommended } : {}),
          source: { agent: 'tidiao-correction', toolName: TIDIAO_ASK_USER_TOOL_NAME }
        }
      }
    }
  }
}

/** 续回统筹信号（2026-07-08 停止=中断保留闭环）：记录续接请求 + 引导收尾，交 pipeline 仿 escalate 整轮范式
 *  带保留上下文重进统筹续做（不删已有消息）。工厂收 {@link TidiaoResumeOrchestrationToolContext} 闭包捕获。 */
export function createResumeOrchestrationTool(ctx: TidiaoResumeOrchestrationToolContext): ToolDefinition {
  return {
    name: TIDIAO_RESUME_ORCHESTRATION_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_RESUME_ORCHESTRATION_TOOL_NAME),
    execute: (toolCall) => {
      const instruction = String(toolCall.args.instruction ?? '').trim()
      ctx.resumeHolder.resume = { instruction }
      return {
        content: '已记录续回统筹的请求。请输出 { "done": true } 结束本轮，由系统带着已保留的决策流与消息重新进入统筹阶段续做剩余部分。',
        details: { kind: 'correctionResumeOrchestration', instruction }
      }
    }
  }
}

/** 中策 in-loop 重生成：据该消息当前提示词调正常回复模型重生成新正文，记录供 pipeline 写回。接缝重构：工厂收 {@link TidiaoRegenerateFromPromptToolContext} 闭包捕获。 */
export function createRegenerateFromPromptTool(ctx: TidiaoRegenerateFromPromptToolContext): ToolDefinition {
  return {
    name: TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME,
    ...tidiaoToolBriefFields(TIDIAO_REGENERATE_FROM_PROMPT_TOOL_NAME),
    validateArgs: (args) =>
      String(args.ref ?? '').trim() ? null : 'regenerateFromPrompt 缺少 ref（楼层引用，如「角色2」）',
    execute: async (toolCall) => {
      const promptContext = ctx.promptContext
      const seam = ctx.regenerateSeam
      const regenerations = ctx.regenerations
      const raw = String(toolCall.args.ref ?? '').trim()
      const refs = parseChatFloorRefs(raw)
      const ref: ChatFloorRef | undefined = refs[0]
      if (!ref) {
        return { content: '未识别到楼层引用（请用「角色N / 旁白M」）。', status: 'error', error: { type: 'INVALID_ARGUMENT', message: '未识别到楼层引用' } }
      }
      const read = await promptContext.readPromptByFloor(ref.kind, ref.index)
      if (!read || !read.matched) {
        const total = promptContext.floorTotal(ref.kind)
        return {
          content: `「${raw}」无提示词可重生成（${ref.kind === 'narration' ? '旁白' : '角色'}消息共 ${total} 条），请核对楼层号或先用 editMessagePrompt 改提示词。`,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: `${raw} 无提示词` }
        }
      }
      const result = await seam({
        ref: read.ref,
        kind: read.kind,
        index: read.index,
        messageId: read.messageId,
        speakerName: read.speakerName,
        promptText: read.promptText
      })
      const content = String(result?.content ?? '')
      // 覆盖式记录：同一条多次重生成只留最后一次（pipeline 据此写回新版本）。
      const existing = regenerations.findIndex((r) => r.kind === read.kind && r.index === read.index)
      const record: TidiaoCorrectionRegeneration = {
        ref: read.ref,
        kind: read.kind,
        index: read.index,
        messageId: read.messageId,
        speakerName: read.speakerName,
        content
      }
      if (existing >= 0) regenerations[existing] = record
      else regenerations.push(record)
      return { content: `「${read.ref}」已据新提示词重生成。新内容：${content}`, details: { kind: 'correctionRegen', ref: read.ref, messageId: read.messageId } }
    }
  }
}

// ── R1-B B5-2 item2 决策/定向工具族（群聊轮级提调专属·写 ctx.business.decision·从 groupDirectorHarness 内联收口） ──
// 决策工具深绑 loop 编排态 decisionState/校验数据，B5-2 item2 把它们解耦进 ctx.business.decision（共享引用收集态 + 校验数据 +
// 挂镜回调），定义收口进全局池——让跨 loop 越权调用可行（如编辑 loop 重跑某角色分镜）。候选/排除/重复/情境查体校验因
// validateArgs 无 ctx，全部在 execute 读 biz.decision 判定（同 recallCharacterBrain B1+B4 范式）。U5 决策口径冻结·仅搬载体。

/** 简短 INVALID_ARGUMENT 错误结果（决策工具校验下移 execute 用·content=message·与原内联校验回执同形）。 */
function decisionInvalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message } }
}

// ── R1-B B5-2 item2c 判情境工具（readScenarioSkill 两版收口同名·读统一 ctx.business.scenario 接缝） ──
// 群聊导演 decision 版（旧读 biz.decision·写 decision.state）+ 演员 replyPlan 版（旧读 state.config.scenarios·元工具
// 预算 + 挂载摘要）收口成单一定义。两版差异（code 规范化 / 预算 / 挂载摘要 / 写回 state 语义 / 错误文案）全封装进
// 各 loop 装配的 scenario 接缝实现（normalizeCode/readBody/applyResult/notFoundMessage/mountedDigest?/consumeBudget?），
// execute 单一（修根因·统一协议·非 business 分支胶水）。U5 判情境口径冻结·仅统一载体。

/** 判情境/读情境正文（两版收口·接缝重构：工厂收 {@link TidiaoScenarioContext} 闭包捕获）。 */
export function createReadScenarioSkillTool(ctx: TidiaoScenarioContext): ToolDefinition {
  return {
    name: TIDIAO_READ_SCENARIO_SKILL_TOOL_NAME,
    brief: '判定/读取本轮情境：从可用情境清单里挑最匹配的一个 code，读它的情境写法正文（轮级提调据此定本轮共用情境、下发给出场角色；单角色编排据此规划生成）。',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '可用情境清单里的情境机器名（必填）。' },
        expectation: { type: 'string', description: '可选·你期望读到什么。' }
      },
      required: ['code']
    },
    validateArgs: (args) => String(args.code ?? '').trim() ? null : 'readScenarioSkill 缺少 code（情境机器名）',
    execute: (toolCall) => {
      const s = ctx
      // 元工具预算闸门（演员有 metaCalls·群聊导演缺省=不限）：超预算消费即返回错误结果。
      const budgetError = s.consumeBudget?.()
      if (budgetError) return budgetError
      const code = s.normalizeCode(String(toolCall.args.code ?? ''))
      const body = s.readBody(code)
      // 写回当轮 state（两版语义差异封装进 applyResult 实现：群聊导演命中才写·演员 body 空也写 scenario）。
      s.applyResult(code, body)
      if (!body) {
        const message = s.notFoundMessage(code)
        return { content: message, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, details: { scenarioCode: code } } }
      }
      // 挂载提示词摘要 #7（演员有·拼进 content + details；群聊导演缺省=无摘要）。
      const digest = s.mountedDigest?.(code)
      // 定界说明（群聊导演·2026-07-04）：只拼喂模型 content，details.body/applyResult 保持纯正文（下发分镜不带说明）。
      const parts = [body, ...(digest ? [digest] : []), ...(s.contentSuffix ? [s.contentSuffix] : [])]
      return {
        content: parts.join('\n\n'),
        details: { scenarioCode: code, body, ...(digest ? { mountedPromptDigest: digest } : {}) }
      }
    }
  }
}

/** 定一个出场角色的本轮方向（F1·一次一个角色·候选/排除/重复校验下移 execute 读 biz.decision）。 */
export function createAddCastDirectionTool(ctx: TidiaoDecisionContext): ToolDefinition {
  return {
    name: TIDIAO_ADD_CAST_DIRECTION_TOOL_NAME,
    brief: '定一个出场角色的本轮方向：一次只定一个角色（characterId + 大致怎么回应/态度/动作方向，不写台词），按出场顺序逐个调用。',
    schema: {
      type: 'object',
      properties: {
        characterId: { type: 'string', description: '候选名单里的角色 characterId（必填）。' },
        direction: { type: 'string', description: '这一轮该角色大致怎么回应/态度/动作方向（必填，不写台词原文）。' },
        // 批B·人格模型按需直通道（2026-07-13）：判断权在提调（下面两个参数），路由=硬代码分流；不进 required——
        // 缺省（不传 planMode）=personality，零回归。
        planMode: {
          type: 'string',
          enum: ['direct', 'personality'],
          description: '本轮该角色的计划方式（每个方向都要定）：direct=日常问候/普通接话/平静情境——你顺手把这条回复的计划直接写进 plan，角色照计划直接写正文（快，省两次模型调用）；personality=情绪激动/冲突关键/亲密危险等靠近边界/剧情转折重头戏——角色走完整人格计划链路（慢而稳）。拿不准填 personality。'
        },
        plan: {
          type: 'string',
          description: 'planMode=direct 时必填·你替该角色直写的本轮回复计划（第三视角、约50字）：只描述他/她接下来应呈现的动作、神态、态度、语气和表达意图，不写完整台词、不写引号对白、不写第一人称独白。'
        }
      },
      required: ['characterId', 'direction']
    },
    // 候选/排除/重复校验需读当轮候选名单+已定 cast（validateArgs 无 args 外数据）→ 下移 execute；这里只留 characterId 必填。
    validateArgs: (args) => String(args.characterId ?? '').trim() ? null : 'addCastDirection 缺少 characterId',
    execute: (toolCall) => {
      const d = ctx
      const characterId = String(toolCall.args.characterId ?? '').trim()
      if (!d.candidateSet.has(characterId)) return decisionInvalid(`characterId 不在候选名单：${characterId}`)
      if (d.excludedSet.has(characterId)) return decisionInvalid(`该角色已被排除，不能出场：${characterId}`)
      if (d.state.cast.some((e) => e.characterId === characterId)) return decisionInvalid(`该角色本轮已定过方向：${characterId}`)
      const direction = String(toolCall.args.direction ?? '').replace(/\s+/g, ' ').trim()
      // 批B：非法枚举值一律当 personality（拿不准即走慢路径兜底，不放弱模型走出坏路径）。
      const rawPlanMode = String(toolCall.args.planMode ?? '').trim()
      const planMode: 'direct' | 'personality' = rawPlanMode === 'direct' ? 'direct' : 'personality'
      const plan = String(toolCall.args.plan ?? '').replace(/\s+/g, ' ').trim()
      if (planMode === 'direct' && !plan) return decisionInvalid('planMode=direct 必须同时给 plan：direct 计划要由你直写这条回复的计划')
      d.state.cast.push({ characterId, direction, ...(planMode === 'direct' ? { planMode: 'direct' as const, plan } : {}) })
      const label = d.candidateNameById.get(characterId) || characterId
      d.onCastAdded?.({ characterId, direction, label })
      return { content: `已定 ${label} 的本轮方向。` }
    }
  }
}

/** 复用上一轮已定方向，批量把指定角色重新排入生成队列；纠偏补漏专用，不重写方向。 */
export function createRegenerateCastFromDirectionsTool(ctx: {
  decision: TidiaoDecisionContext
  directionByCharacterId: Map<string, string>
}): ToolDefinition {
  return {
    name: TIDIAO_REGENERATE_CAST_FROM_DIRECTIONS_TOOL_NAME,
    brief: '用户指出上一轮已排方向的某些角色没有生成消息时，用本工具一次选中全部缺失角色，原样复用上一轮方向并重新生成。不要重判情境、不要重写方向、不要逐个调用 addCastDirection。',
    schema: {
      type: 'object',
      properties: {
        characterIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 12,
          description: '需要按上一轮既有方向补生成的全部角色 characterId。'
        }
      },
      required: ['characterIds']
    },
    validateArgs: (args) => Array.isArray(args.characterIds) && args.characterIds.length
      ? null
      : 'regenerateCastFromDirections 缺少 characterIds（至少一个角色）',
    execute: (toolCall) => {
      const ids = [...new Set((Array.isArray(toolCall.args.characterIds) ? toolCall.args.characterIds : [])
        .map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 12)
      if (!ids.length) return decisionInvalid('至少选择一个需要补生成的角色')
      for (const characterId of ids) {
        if (!ctx.decision.candidateSet.has(characterId)) return decisionInvalid(`characterId 不在候选名单：${characterId}`)
        if (ctx.decision.excludedSet.has(characterId)) return decisionInvalid(`该角色已被排除，不能补生成：${characterId}`)
        if (ctx.decision.state.cast.some((entry) => entry.characterId === characterId)) return decisionInvalid(`该角色本轮已经排入生成：${characterId}`)
        if (!String(ctx.directionByCharacterId.get(characterId) || '').trim()) return decisionInvalid(`找不到该角色上一轮已定方向：${characterId}`)
      }
      const labels: string[] = []
      for (const characterId of ids) {
        const direction = String(ctx.directionByCharacterId.get(characterId) || '').trim()
        const label = ctx.decision.candidateNameById.get(characterId) || characterId
        ctx.decision.state.cast.push({ characterId, direction })
        ctx.decision.onCastAdded?.({ characterId, direction, label })
        labels.push(label)
      }
      return {
        content: `已按上一轮既有方向把 ${labels.join('、')} 排入定点补生成；收尾后系统会逐个生成消息。`,
        details: { characterIds: ids, reusedDirections: true }
      }
    }
  }
}

/** 改一个已定过方向的出场角色本轮方向（2026-07-07·分镜方向修改）：只有你自己判断这个角色的方向真的需要变时
 *  才调用——不是每次纠偏都要改，用户的纠偏原文不能直接当新方向抄进来，要先想清楚新方向该怎么写、和旧方向有实质差异。 */
export function createReviseCastDirectionTool(ctx: TidiaoDecisionContext): ToolDefinition {
  return {
    name: TIDIAO_REVISE_CAST_DIRECTION_TOOL_NAME,
    brief: '改一个已经用 addCastDirection 定过方向的出场角色的本轮方向：仅在你判断这个角色的方向真的需要改变时才调用（比如据纠偏重新考虑后这一镜该往不同方向走），不要为了回应每一次纠偏就顺手调用；新方向必须是你自己重新想清楚写出的，不能把用户纠偏原文直接当方向。',
    schema: {
      type: 'object',
      properties: {
        characterId: { type: 'string', description: '候选名单里的角色 characterId（必填，必须是本轮已用 addCastDirection 定过方向的角色）。' },
        direction: { type: 'string', description: '这一轮该角色新的大致怎么回应/态度/动作方向（必填，不写台词原文；应与旧方向有实质差异，不是简单重复或微调措辞）。' },
        reason: { type: 'string', description: '可选·为什么要改这一镜方向的一句话说明（会记入决策流，如「据纠偏，该角色这轮态度应更强硬」）。' },
        // 批B：该角色原本是 direct 计划时，改方向必须同步重写 plan（防旧 plan 与新方向脱节残留）。
        plan: { type: 'string', description: '可选·仅当该角色原本 planMode=direct 时才需要：新方向对应的重写后本轮回复计划（第三视角、约50字，口径同 addCastDirection 的 plan）；该角色是 direct 计划却不带本参数会被拒绝。' }
      },
      required: ['characterId', 'direction']
    },
    validateArgs: (args) =>
      (String(args.characterId ?? '').trim() && String(args.direction ?? '').trim())
        ? null
        : 'reviseCastDirection 缺少 characterId 或 direction',
    execute: (toolCall) => {
      const d = ctx
      const characterId = String(toolCall.args.characterId ?? '').trim()
      const entry = d.state.cast.find((e) => e.characterId === characterId)
      if (!entry) return decisionInvalid(`该角色本轮还没定过方向，不能改：${characterId}（应先用 addCastDirection 定方向）`)
      const direction = String(toolCall.args.direction ?? '').replace(/\s+/g, ' ').trim()
      if (direction === entry.direction) return decisionInvalid('新方向与原方向相同，没有实质变化——若不需要改这一镜就不要调用 reviseCastDirection')
      const plan = String(toolCall.args.plan ?? '').replace(/\s+/g, ' ').trim()
      // 批B：direct 条目改方向必须同步给新 plan，防旧 plan 残留与新方向脱节；非 direct 条目传了 plan 直接忽略（不报错）。
      if (entry.planMode === 'direct') {
        if (!plan) return decisionInvalid('该角色是 direct 计划，改方向必须同步重写 plan：请把这条回复的新计划一并写进 plan 参数')
        entry.plan = plan
      }
      entry.direction = direction
      const label = d.candidateNameById.get(characterId) || characterId
      const reason = String(toolCall.args.reason ?? '').replace(/\s+/g, ' ').trim()
      d.onCastRevised?.({ characterId, direction, label, reason })
      return { content: `已改 ${label} 的本轮方向。` }
    }
  }
}

/** 收尾本轮（F1·普通统筹至少定一个角色；轮后补演可只落账/旁白；业务硬门统一在此拦截）。 */
export function createFinishRoundTool(ctx: TidiaoDecisionContext): ToolDefinition {
  // 剧本「无本拦一次」硬门状态（2026-07-06·同上轮级闭包计数）。
  let emptyScriptGateTripped = false
  return {
    name: TIDIAO_FINISH_ROUND_TOOL_NAME,
    brief: ctx.allowEmptyCast
      ? '收尾轮后补演：必要的种子结算、状态同步、旁白或角色补演都完成后调用；本轮确实只需落账或旁白时可以没有角色方向。'
      : '收尾本轮：所有出场角色方向都定完后调用，结束这一轮（可附一句本轮情境小结）。在还没定任何角色方向前不要调用。',
    schema: {
      type: 'object',
      properties: {
        situation: { type: 'string', description: '可选·本轮情境一句话小结。' }
      }
    },
    // 「finishRound 前必须至少定一个角色」需读当轮已定 cast（validateArgs 无 args 外数据）→ 下移 execute。
    validateArgs: () => null,
    execute: (toolCall) => {
      const d = ctx
      if (!d.allowEmptyCast && !d.state.cast.length) return decisionInvalid('finishRound 前必须至少用 addCastDirection 定一个出场角色')
      // 剧本硬门（2026-07-06·用户拍板「每轮先读剧本」·subagent 形态）：本轮还没问过编剧就想收尾 → 拒一次，
      // 要求先 consultScript 拿本轮编排指导；只拦一次防死锁（同「只拦一声不吭」精神）。发起过调用即算问过
      //（编剧临时失败不锁死收尾）。剧本接缝不在位（hasConsultedScript 缺省）＝不校验，行为不变。
      if (d.hasConsultedScript && !d.hasConsultedScript() && !emptyScriptGateTripped) {
        emptyScriptGateTripped = true
        return decisionInvalid('本轮还没派编剧：先用 consultScript 把用户本轮表达、上一轮实际新增事实与观察变化交给编剧。工具会立即确认派发，不需要等待回报；确认后继续统筹再 finishRound。')
      }
      const businessGateError = d.validateBeforeFinish?.()
      if (businessGateError) return decisionInvalid(businessGateError)
      d.state.finished = true
      d.state.finishSituation = String(toolCall.args.situation ?? '').replace(/\s+/g, ' ').trim()
      d.state.finishUnfinished = ''
      return { content: '本轮统筹完成。' }
    }
  }
}

// 剧本咨询只派异步叙事种子分析；世界种子写入另走正式工具，旧会话路线不再进入运行时。
export function createConsultScriptTool(ctx: TidiaoScriptContext): ToolDefinition {
  return {
    name: TIDIAO_CONSULT_SCRIPT_TOOL_NAME,
    brief: '异步派遣编剧分析本轮对叙事种子的影响。调用立即返回，不等待编剧；回报会在后续模型边界以“已确认事实/候选判断/建议动作”三栏进入收件箱。每轮必须派一次，但不要原地等待或重复调用。',
    schema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '本轮必要信息（必填）：用户这轮说了/做了什么、上一轮实际发生的输出要点（谁说了什么关键内容、剧情推进到哪）、你观察到的变化。编剧看不到聊天记录，全靠这段话。' },
        asks: { type: 'string', description: '可选：要编剧重点判断的触发、冲突、失效、加速、延迟或新元素。用户明确要求改剧本时，不在这里覆盖旧整本；应把要求转成叙事种子写操作。' }
      },
      required: ['brief']
    },
    validateArgs: (args) => (String(args.brief ?? '').trim()
      ? null
      : 'consultScript 缺少 brief（把用户这轮的表达、上一轮实际新增输出的要点、你观察到的变化带给编剧）'),
    execute: (toolCall) => {
      const brief = String(toolCall.args.brief ?? '').trim()
      const asks = String(toolCall.args.asks ?? '').trim()
      ctx.holder.consulted = true
      try {
        const { callId } = ctx.dispatchScriptwriter({ brief, ...(asks ? { asks } : {}) })
        return {
          content: `编剧分析已异步派发（callId=${callId}）。不要等待或重复派发；继续统筹。若结果及时到达，会在下一次模型调用前以【异步编剧回报】注入；若本轮已结束，则留到下一轮。`,
          details: { kind: 'directorScriptConsult', dispatched: true, callId },
          acted: false
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: `编剧派发失败：${message}。可重试一次；再失败就凭现有信息继续统筹（不阻断收尾）。`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true }
        }
      }
    }
  }
}

// ── R1-B B5-2 item2c 旁白两件套（readNarrationSkill/confirmNarrationCall 收口同名·读统一 ctx.business.narration 接缝） ──
// 原 createNarrationToolKit 的闭包动态态（profiles 解析 / 已读态 / 确认收集态 / 预算 / 三 loop 投影 wrapping）解耦进
// business.narration（{@link TidiaoNarrationContext}·由各 loop 入口 buildNarrationBusinessContext 装配）。校验需读当轮
// profiles/已读态（validateArgs 无 ctx）→ 全下移 execute（同 decision/recallCharacterBrain 范式）。createNarrationToolKit
// 暂留路径 B 子 agent（runPersonalityNarrationSubagent·下一 item 退役）·两处共用同一套解析/二分类真值不漂移。

/** 旁白调用确认校验失败回执（INVALID_ARGUMENT·与原 kit validateArgs 字符串报错同效·校验下移 execute）。 */
function narrationInvalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message } }
}

const narrationText = (value: unknown): string => String(value ?? '').trim()

/** 读旁白 skill 内容本体（容错解析 profileId/profileIds → 拼内容·写已读态·校验下移 execute 读 biz.narration）。 */
export function createReadNarrationSkillTool(ctx: TidiaoNarrationContext): ToolDefinition {
  return {
    name: TIDIAO_READ_NARRATION_SKILL_TOOL_NAME,
    brief: '读取一个或多个旁白 skill 的内容本体，供旁白 subagent 写生成提示词。',
    schema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '要读的旁白 skill 的 id（必填，也可传名称；读多个时可改用 profileIds）' },
        profileIds: { type: 'array', items: { type: 'string' }, description: '要读的多个旁白 skill 的 id（替代 profileId 用）' }
      },
      // 2026-07-06 真机修：弱模型基本只按 required 填参——把 profileId 标 required 让它第一次就带上；
      // 执行层校验仍是「profileId/profileIds 二选一」宽容口径（只传 profileIds 照样通过），不与 schema 冲突。
      required: ['profileId']
    },
    execute: (toolCall) => {
      const n = ctx
      const { ids, unresolved } = n.resolveProfileIds((toolCall.args || {}) as Record<string, unknown>)
      // 缺参也要给可执行口径（2026-07-05 真机：光说「缺少」模型会不带参数盲重试烧预算）：直接列可用清单。
      if (!ids.length && !unresolved.length) return narrationInvalid(`readNarrationSkill 缺少 profileId 或 profileIds；可用：${n.availableHint}，请用括号前的 id 或括号里的名称`)
      // 容错解析后仍一个都对不上才算失败：错误信息直接列出可用 id 和名称，喂到模型能一次修正。
      if (!ids.length) return narrationInvalid(`未知旁白 skill id：${unresolved.join('、')}；可用：${n.availableHint}，请用括号前的 id 或括号里的名称`)
      ids.forEach((profileId) => n.readProfileIds.add(profileId))
      return {
        content: ids.map((profileId) => {
          const profile = n.profileById(profileId)!
          return [
            `skill：${profile.name}`,
            `触发描述：${profile.triggerDescription || '未填写'}`,
            '内容本体：',
            profile.content || '未填写'
          ].join('\n')
        }).join('\n\n'),
        details: { profileIds: ids }
      }
    }
  }
}

/** 确认旁白调用（必须先读 skill·提交 generatedPrompt 定方向·校验+构造下移 execute 读 biz.narration·onConfirmed 投影）。 */
export function createConfirmNarrationCallTool(ctx: TidiaoNarrationContext): ToolDefinition {
  return {
    name: TIDIAO_CONFIRM_NARRATION_CALL_TOOL_NAME,
    brief: '确认调用旁白生成链路，并提交 subagent 根据已读 skill 写好的生成提示词。',
    schema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: '要确认的旁白 skill 的 id（必填·须先 readNarrationSkill 读过；确认多个时可改用 profileIds）' },
        profileIds: { type: 'array', items: { type: 'string' }, description: '要确认的多个旁白 skill 的 id（替代 profileId 用）' },
        narrationKind: { type: 'string', enum: ['environment', 'appearance', 'event_push'], description: '旁白类别（可选·缺省取所选 skill 的类别；注意这是类别不是 skill 标识，skill 用 profileId 指定）。' },
        informationBearing: { type: 'boolean', description: '是否信息承载旁白（推进剧情/引入事实=true；纯氛围描写=false，可选）。' },
        reason: { type: 'string', description: '确认生成该旁白的具体理由，一句人话（必填·会展示给用户）。' },
        score: { type: 'number', description: '本旁白的把握分 0~1（可选）。' },
        // 批次4（2026-07-07 范式优化）：generatedPrompt 写法口径沉到 schema（原在各 loop 纲领复述）。
        generatedPrompt: { type: 'string', description: '这段旁白唯一的完整生成指令（必填·至少 40 字·写给旁白生成模型看）：写清场景与时间地点、要呈现的变化/氛围、感官细节侧重和篇幅要求，直接可执行；不要提工具/内部链路。' },
        // 旁白穿插（2026-07-06 用户拍板「旁白不必总在开头」）：统筹轮锚点经 ctx.resolveInsertAfter 解析成 placement；
        // 纠偏轮沿用楼层引用语义（loop 自己在 onConfirmed 里解析·两套锚点语义不混）。
        insertAfter: { type: 'string', description: '插入位置锚点（可选·缺省=开场，即所有角色回复之前）。统筹轮：填「收尾」=本轮最后一位角色说完之后；填某出场角色的 characterId 或名称=紧跟该角色本轮说完之后（承接其言行/引入变数）。纠偏轮：填楼层引用「角色N」或「旁白M」=插在该楼层之后。' }
      },
      // 2026-07-06 真机修：profileId 升 required（弱模型只按 required 填参、又把同名的 narrationKind 当 skill 标识
      // → 连错 10+ 次）；执行层校验仍是「二选一」宽容口径（只传 profileIds 照样通过）。
      required: ['profileId', 'reason', 'generatedPrompt']
    },
    execute: (toolCall) => {
      const n = ctx
      const args = (toolCall.args || {}) as Record<string, unknown>
      const { ids: profileIds, unresolved } = n.resolveProfileIds(args)
      // 缺参也要给可执行口径（2026-07-05 真机：连错 7 次盲重试烧掉大半预算的根因就是这句只说「缺少」）。
      if (!profileIds.length && !unresolved.length) return narrationInvalid(`confirmNarrationCall 缺少 profileId 或 profileIds；可用：${n.availableHint}，请用括号前的 id 或括号里的名称重发`)
      if (!profileIds.length) return narrationInvalid(`未知旁白 skill id：${unresolved.join('、')}；可用：${n.availableHint}，请用括号前的 id 或括号里的名称`)
      const unread = profileIds.find((profileId) => !n.readProfileIds.has(profileId))
      if (unread) return narrationInvalid(`confirmNarrationCall 必须先读取 skill：${n.profileById(unread)?.name || unread}`)
      // 理由必须由模型自己写（过程轨对外展示），不允许落到内置兜底句。
      if (!narrationText(args.reason)) return narrationInvalid('confirmNarrationCall 缺少 reason：必须写出确认生成该旁白的具体理由')
      const prompt = narrationText(args.generatedPrompt ?? (args as { generated_prompt?: unknown }).generated_prompt)
      // 2026-07-04 真机修：报错必须给出可执行口径（旧文案「缺少足够完整」让模型只能盲猜反复重试烧预算）。
      if (prompt.length < 40) {
        return narrationInvalid(
          `generatedPrompt 太短（当前 ${prompt.length} 字，至少 40 字）：请一次性提交给旁白生成模型的完整生成指令——写清场景与时间地点、要呈现的变化/氛围、感官细节侧重和篇幅要求，直接可执行，不要只写一句概括。`
        )
      }
      const callKey = profileIds.join('|')
      if (n.calls.some((call) => call.profileIds.join('|') === callKey)) return narrationInvalid(`重复确认旁白 skill：${callKey}`)
      if (n.calls.length >= n.maxCalls) return narrationInvalid(`本轮最多确认 ${n.maxCalls} 个旁白`)
      // 旁白穿插：统筹轮解析 insertAfter 锚点（解析器在位才解析；锚点对不上候选即回执引导重发，不静默落开场）。
      const insertAfterRaw = narrationText(args.insertAfter ?? (args as { insert_after?: unknown }).insert_after)
      let placement: PersonalityNarrationPlacement | undefined
      if (insertAfterRaw && n.resolveInsertAfter) {
        const resolved = n.resolveInsertAfter(insertAfterRaw)
        if (resolved.error) return narrationInvalid(resolved.error)
        placement = resolved.placement
      }
      const profiles = profileIds.map((profileId) => n.profileById(profileId)).filter(Boolean) as PersonalityNarrationSubagentProfile[]
      const firstProfile = profiles[0]
      const call: PersonalityNarrationCall = {
        profileIds,
        profileNames: profiles.map((profile) => profile.name),
        narrationKind: normalizeConfirmedNarrationKind(args.narrationKind ?? (args as { narration_kind?: unknown }).narration_kind, firstProfile),
        informationBearing: normalizeInformationBearing(args.informationBearing ?? (args as { information_bearing?: unknown }).information_bearing),
        reason: narrationText(args.reason) || '旁白 subagent 判断本轮适合插入旁白。',
        score: normalizeScore(args.score),
        generatedPrompt: narrationText(args.generatedPrompt ?? (args as { generated_prompt?: unknown }).generated_prompt),
        ...(placement ? { placement } : {})
      }
      n.calls.push(call)
      // confirmNarrationCall 成功后的投影副作用（各 loop noteNarrationShot / narrationPlacements wrapping 回调化）。
      n.onConfirmed?.(call, args)
      return {
        content: `已确认生成旁白：${call.profileNames.join('、')}`,
        details: { call }
      }
    }
  }
}

/** 改一条已确认旁白的生成方向（2026-07-07·分镜方向修改）：只有你自己判断这条旁白的方向真的需要改变时才调用，
 *  不是每次纠偏都要改；插入位置、旁白类别、二分类都不变，只改这条旁白最终生成时用的 generatedPrompt。
 *  只能改「正文还没生成」的旁白（本轮 loop 收尾后才真正生成正文，调用时机天然安全）。 */
export function createReviseNarrationDirectionTool(ctx: TidiaoNarrationContext): ToolDefinition {
  return {
    name: TIDIAO_REVISE_NARRATION_DIRECTION_TOOL_NAME,
    brief: '改一条本轮已用 confirmNarrationCall 确认过的旁白的生成方向：仅在你判断这条旁白的方向真的需要改变时才调用（比如据纠偏重新考虑后这条旁白该往不同方向写），不要为了回应每一次纠偏就顺手调用；新方向必须是你自己重新想清楚写出的完整生成指令，不能把用户纠偏原文直接当方向。只改生成内容，不改这条旁白的插入位置。',
    schema: {
      type: 'object',
      properties: {
        narrationIndex: { type: 'number', description: '要修改的是本轮第几条已确认的旁白（1 起计数，即「旁白1」「旁白2」里的序号；只有一条旁白时填 1）。必填。' },
        generatedPrompt: { type: 'string', description: '这条旁白新的完整生成指令（必填·至少 40 字，写法同 confirmNarrationCall 的 generatedPrompt：写清场景与时间地点、要呈现的变化/氛围、感官细节侧重和篇幅要求；应与旧指令有实质差异，不是简单重复或微调措辞）。' },
        reason: { type: 'string', description: '可选·为什么要改这条旁白方向的一句话说明（会记入决策流）。' }
      },
      required: ['narrationIndex', 'generatedPrompt']
    },
    validateArgs: (args) =>
      (readNumberArg(args.narrationIndex) !== undefined && String(args.generatedPrompt ?? '').trim())
        ? null
        : 'reviseNarrationDirection 缺少 narrationIndex 或 generatedPrompt',
    execute: (toolCall) => {
      const n = ctx
      const args = (toolCall.args || {}) as Record<string, unknown>
      const index = Math.trunc(Number(args.narrationIndex)) - 1
      if (!n.calls.length) return narrationInvalid('本轮还没有已确认的旁白，无法修改——应先用 confirmNarrationCall 确认一条旁白')
      if (index < 0 || index >= n.calls.length) {
        const list = n.calls.map((call, i) => `旁白${i + 1}：${call.profileNames.join('、')}`).join('；')
        return narrationInvalid(`narrationIndex 超出范围（本轮共 ${n.calls.length} 条已确认旁白：${list}）`)
      }
      const prompt = narrationText(args.generatedPrompt ?? (args as { generated_prompt?: unknown }).generated_prompt)
      if (prompt.length < 40) {
        return narrationInvalid(
          `generatedPrompt 太短（当前 ${prompt.length} 字，至少 40 字）：请一次性提交给旁白生成模型的完整生成指令——写清场景与时间地点、要呈现的变化/氛围、感官细节侧重和篇幅要求，直接可执行，不要只写一句概括。`
        )
      }
      const call = n.calls[index]
      if (prompt === call.generatedPrompt) return narrationInvalid('新生成指令与原指令相同，没有实质变化——若不需要改这条旁白就不要调用 reviseNarrationDirection')
      call.generatedPrompt = prompt
      const reason = String(args.reason ?? '').replace(/\s+/g, ' ').trim()
      n.onRevised?.(call, index, reason)
      return { content: `已改第 ${index + 1} 条旁白的生成方向。` }
    }
  }
}

// ── R1-B B5-2 item2b 编排工具族（回复编排专属·写 ctx.business.replyPlan·从 replyPlanOrchestratorHarness 内联收口） ──
// 编排工具深绑 loop 生成态（candidates/计数/budget/directorAcc/input 接缝），B5-2 item2b 把生成态解耦进 ctx.business.replyPlan
// （共享引用收集态 + loop 专属操作回调 + 校验下移 execute），定义收口进全局池——让跨 loop 越权调用可行（如编辑 loop 重跑某角色分镜）。
// 下面 7 个纯 transform 从 harness 迁来唯一家（harness 不再用的 6 个已删·buildDegradedReviewResult 因自动评审仍用·harness 反向 import）。

/** generatePlanBatch 原始 args → 规范调用（callId 透传保签名一致·未用）。 */
function toGenerateToolCall(callId: string, args: Record<string, unknown>, expectation = ''): GeneratePlanBatchToolCall {
  return {
    tool: 'generatePlanBatch',
    strategy: String(args.strategy || '').trim(),
    strategyLabel: String(args.strategyLabel ?? args.strategy_label ?? '').trim(),
    intensities: Array.isArray(args.intensities) ? args.intensities.map((item) => String(item || '').trim()).filter(Boolean) : [],
    planPrompt: String(args.planPrompt ?? args.plan_prompt ?? '').trim(),
    ...(expectation ? { expectation } : {}),
    promptLogId: String(args.promptLogId ?? args.prompt_log_id ?? '').trim() || undefined
  }
}

/** generatePlanBatch 原始 args → 规范调用组（合并生成协议 2026-07-08）：
 *  正式口径是 batches 数组一次带全部反应类别；旧平铺单类别参数（存量自定义提示词/情境正文还教旧写法）
 *  归一化成单元素组走同一条路，不留双协议分支。 */
function toGenerateToolCalls(callId: string, args: Record<string, unknown>, expectation = ''): GeneratePlanBatchToolCall[] {
  const rawBatches = Array.isArray(args.batches) ? args.batches : null
  if (rawBatches && rawBatches.length > 0) {
    return rawBatches.map((item) => toGenerateToolCall(
      callId,
      item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {},
      expectation
    ))
  }
  return [toGenerateToolCall(callId, args, expectation)]
}

/** reviewPlanCandidates 原始 args → 规范调用（candidateIds 含 '*' 时展开成全部候选 id）。 */
function toReviewToolCall(
  callId: string,
  args: Record<string, unknown>,
  candidates: ReplyPlanCandidate[],
  expectation = ''
): ReviewPlanCandidatesToolCall {
  const rawIds = Array.isArray(args.candidateIds) ? args.candidateIds : []
  const candidateIds = rawIds.map((item) => String(item || '').trim()).filter(Boolean)
  return {
    tool: 'reviewPlanCandidates',
    candidateIds: candidateIds.includes('*') ? candidates.map((candidate) => candidate.id) : candidateIds,
    ...(expectation ? { expectation } : {}),
    promptLogId: String(args.promptLogId ?? args.prompt_log_id ?? '').trim() || undefined
  }
}

/** updateCurtainScene 原始 args → 规范调用（多别名容错·空串归 undefined）。 */
function toCurtainSceneUpdateToolCall(
  args: Record<string, unknown>,
  expectation = ''
): ReplyPlanCurtainSceneUpdateToolCall {
  return {
    tool: 'updateCurtainScene',
    targetTime: String(args.targetTime ?? args.target_time ?? args.time ?? '').trim() || undefined,
    targetLocation: String(args.targetLocation ?? args.target_location ?? args.location ?? '').trim() || undefined,
    locationLarge: String(args.locationLarge ?? args.location_large ?? args.large ?? '').trim() || undefined,
    locationMiddle: String(args.locationMiddle ?? args.location_middle ?? args.middle ?? '').trim() || undefined,
    locationSmall: String(args.locationSmall ?? args.location_small ?? args.small ?? '').trim() || undefined,
    mapSheetId: String(args.mapSheetId ?? args.map_sheet_id ?? args.sheetId ?? args.sheet_id ?? '').trim() || undefined,
    mapFeatureId: String(args.mapFeatureId ?? args.map_feature_id ?? args.featureId ?? args.feature_id ?? '').trim() || undefined,
    targetWeather: String(args.targetWeather ?? args.target_weather ?? args.weather ?? '').trim() || undefined,
    reason: String(args.reason ?? args.intent ?? '').trim() || undefined,
    ...(expectation ? { expectation } : {})
  }
}

/** generatePlanBatch 参数校验（缺类别/强度/超强度上限/缺任务提示词）→ 错误文案（空串=合法）。 */
function describeGenerateArgError(toolCall: GeneratePlanBatchToolCall, budget: ReplyPlanOrchestratorLoopBudget): string {
  if (!toolCall.strategy.trim() || !toolCall.strategyLabel.trim()) return 'generatePlanBatch 缺少反应类别机器名或展示名'
  if (toolCall.intensities.length === 0) return 'generatePlanBatch 缺少强度列表'
  if (toolCall.intensities.length > budget.maxIntensitiesPerStrategy) return 'generatePlanBatch 强度数量超过预算'
  if (!toolCall.planPrompt.trim()) return 'generatePlanBatch 缺少任务提示词'
  return ''
}

/** 合并生成协议参数校验：逐组校验 + 组间 strategy 唯一（空串=合法）。 */
function describeGenerateCallsArgError(calls: GeneratePlanBatchToolCall[], budget: ReplyPlanOrchestratorLoopBudget): string {
  const seenStrategies = new Set<string>()
  for (const call of calls) {
    const groupError = describeGenerateArgError(call, budget)
    if (groupError) return calls.length > 1 ? `batches 中类别 ${call.strategy || call.strategyLabel || '(未命名)'}：${groupError}` : groupError
    if (seenStrategies.has(call.strategy)) return `generatePlanBatch batches 内 strategy 重复：${call.strategy}（同一次调用内每个反应类别只能出现一次）`
    seenStrategies.add(call.strategy)
  }
  return ''
}

/** generatePlanBatch 成功回执文案（逐类别候选数 + 候选 id 列表）。 */
function renderGenerateResultText(calls: GeneratePlanBatchToolCall[], candidates: ReplyPlanCandidate[]): string {
  const ids = candidates.map((candidate) => candidate.id).join('、')
  const groupSummary = calls
    .map((call) => `${call.strategyLabel || call.strategy} ${call.intensities.length} 条`)
    .join('；')
  return `已一次生成 ${candidates.length} 条候选（${groupSummary}）：${ids}`
}

/** 错误详情里的 batches 摘要（逐组声明），供 hooks/审计读取。 */
function describeGenerateCallDetails(calls: GeneratePlanBatchToolCall[]): Record<string, unknown> {
  return {
    batches: calls.map((call) => ({
      strategy: call.strategy,
      strategyLabel: call.strategyLabel,
      intensities: call.intensities,
      planPrompt: call.planPrompt
    })),
    // 兼容读取器（hooks readStrategy/readPlanPrompt 等）：多组时给拼接摘要，单组时与旧口径等价。
    strategy: calls.map((call) => call.strategy).filter(Boolean).join('+'),
    strategyLabel: calls.map((call) => call.strategyLabel || call.strategy).filter(Boolean).join('+'),
    intensities: calls.length === 1 ? calls[0].intensities : calls.flatMap((call) => call.intensities),
    planPrompt: calls.map((call) => call.planPrompt).filter(Boolean).join(' ／ ')
  }
}

/** 评审降级结果（本地 ReRanker 不可用时按候选顺序取前三·标注降级原因）。harness 自动评审亦 value-import 本函数。 */
export function buildDegradedReviewResult(candidates: ReplyPlanCandidate[], reason: string): ReplyPlanReviewToolResult {
  const normalized = candidates.map((candidate, index) => ({
    ...candidate,
    id: String(candidate.id || `plan_${index + 1}`),
    content: String(candidate.content || ''),
    strategy: String(candidate.strategy || ''),
    intensity: String(candidate.intensity || '')
  }))
  return {
    scoredCandidates: normalized,
    topPlans: normalized.slice(0, 3),
    diagnostics: { degraded: true, degradeReason: reason }
  }
}

/** 从错误消息里解析实际候选数（命中失败回执的诊断·解析不出回 -1）。 */
function readActualCandidateCountFromErrorMessage(message: string): number {
  const match = String(message || '').match(/当前(?:只有|返回|生成)?\s*(\d+)\s*条/)
    || String(message || '').match(/actual(?:CandidateCount)?[=:：]\s*(\d+)/i)
  return match ? Number(match[1]) : -1
}

/** 按反应类别+强度生成候选计划（台词生成链路核心·校验下移 execute 复刻 generateErrorCount 副作用）。
 *  合并生成协议（2026-07-08）：一个生成轮只调用一次，batches 数组一次性带上全部反应类别；
 *  接缝重构：singlePlanOnly 工厂期闭包捕获已知 → schema 工厂期直接造静态。硬校验仍在 execute 读 state。 */
function buildGeneratePlanBatchSchema(singlePlanOnly: boolean): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      batches: {
        type: 'array',
        description: singlePlanOnly
          ? '反应类别组列表（必填；普通召回单计划模式必须恰好 1 项，且该项 intensities 恰好 1 个强度）。'
          : '反应类别组列表（必填）：一次性列出全部反应类别，每项一个类别；一个生成轮只调用本工具一次，不要逐类拆成多次调用。',
        items: {
          type: 'object',
          properties: {
            strategy: { type: 'string', description: '该类别的机器名（必填；同一次调用内唯一）。' },
            strategyLabel: { type: 'string', description: '该类别的中文展示名（必填）。' },
            intensities: {
              type: 'array',
              items: { type: 'string' },
              description: singlePlanOnly
                ? '强度档位列表（必填；普通召回单计划模式必须恰好 1 个）。'
                : '该类别的强度档位列表，每档产出一条候选计划（必填，如 ["low","medium","high"]）。'
            },
            planPrompt: { type: 'string', description: '给计划模型的第三视角行动计划任务说明（必填；不写完整台词或可直接发送的对白；必须体现该类别独有的反应焦点）。' }
          },
          required: ['strategy', 'strategyLabel', 'intensities', 'planPrompt']
        }
      }
    },
    required: ['batches']
  }
}
export function createGeneratePlanBatchTool(ctx: TidiaoReplyPlanContext): ToolDefinition {
  return {
    name: TIDIAO_GENERATE_PLAN_BATCH_TOOL_NAME,
    brief: '一次性生成全部候选计划：batches 数组每项一个反应类别，一个生成轮只调用一次（普通召回单计划模式时恰好 1 项且 intensities 恰好 1 个）。',
    // 接缝重构：singlePlanOnly 工厂期已知 → schema 工厂期直接造静态（缺 schema 会被 toOpenAiTools 兜底成无参数函数→必失败）。
    schema: buildGeneratePlanBatchSchema(ctx.state.singlePlanOnly),
    // 校验下移 execute（原 validateArgs 读 state.singlePlanOnly/budget·带 generateErrorCount 副作用·读闭包 ctx）。
    execute: async (toolCall) => {
      const rp = ctx
      const state = rp.state
      // 合并生成协议：batches 数组一次带全部类别；旧平铺单类别参数归一化成单元素组走同一路。
      const calls = toGenerateToolCalls(toolCall.callId, toolCall.args, toolCall.expectation)
      let argError = ''
      if (state.singlePlanOnly && calls.length !== 1) {
        argError = `普通召回单计划模式：batches 必须恰好 1 项，当前 ${calls.length} 项`
      } else if (state.singlePlanOnly && calls[0].intensities.length !== 1) {
        argError = `普通召回单计划模式：generatePlanBatch 的 intensities 必须恰好 1 个，当前 ${calls[0].intensities.length} 个`
      } else {
        argError = describeGenerateCallsArgError(calls, state.budget)
      }
      if (argError) {
        // 参数校验失败也计入生成失败：失败轮回退模型驱动评审，不自动收束（与原 validateArgs 副作用一致）。
        state.generateErrorCount += 1
        return toolError('INVALID_ARGUMENT', argError, { args: toolCall.args })
      }
      await rp.notifyScenarioResolved()
      // 预算按类别组数计（与旧「每类别一次调用」口径等价，防 batches 无限膨胀）。
      state.generateCalls += calls.length
      if (state.generateCalls > state.budget.maxGeneratePlanBatchCalls) {
        return toolError('BUDGET_EXCEEDED', '超出计划批次生成预算')
      }
      const expectedTotal = calls.reduce((sum, call) => sum + call.intensities.length, 0)
      let result: ReplyPlanBatchToolResult
      try {
        result = await rp.runGeneratePlanBatch(calls)
      } catch (error) {
        // 取消信号原样抛出：abort 不是生成失败，绝不能吞成可重试错误（否则触发 hook 重试风暴 + abort 无法冒泡）。
        if (rp.isAbortError(error)) throw error
        state.generateErrorCount += 1
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('EXPECTATION_MISMATCH', message || '候选计划生成失败', {
          ...describeGenerateCallDetails(calls),
          expectedCandidateCount: expectedTotal,
          actualCandidateCount: readActualCandidateCountFromErrorMessage(message),
          thrown: true
        })
      }
      if (result.candidates.length !== expectedTotal) {
        state.generateErrorCount += 1
        return toolError('EXPECTATION_MISMATCH', `候选数量 ${result.candidates.length} 与全部类别强度总数 ${expectedTotal} 不一致。`, {
          ...describeGenerateCallDetails(calls),
          expectedCandidateCount: expectedTotal,
          actualCandidateCount: result.candidates.length,
          promptLogId: result.promptLogId
        })
      }
      // 按声明顺序拆回「每类别一条记录」：内部真值不变（审计面板/strategyMatrix/分镜方向零改动）。
      let cursor = 0
      for (const call of calls) {
        const groupCandidates = result.candidates.slice(cursor, cursor + call.intensities.length)
        cursor += call.intensities.length
        call.promptLogId = result.promptLogId
        state.candidates.push(...groupCandidates)
        state.planToolCalls.push(call)
        // 遗留3 收口：分镜角色镜方向取「导演下给生成模型的 planPrompt」实时更新（noteCastDirection 只认首个权威方向）。
        rp.noteCastDirection?.(call.planPrompt)
      }
      return {
        content: renderGenerateResultText(calls, result.candidates),
        details: {
          ...describeGenerateCallDetails(calls),
          expectedCandidateCount: expectedTotal,
          actualCandidateCount: result.candidates.length,
          candidateCountByStrategy: Object.fromEntries(calls.map((call) => [call.strategy, call.intensities.length])),
          candidateIds: result.candidates.map((candidate) => candidate.id),
          promptLogId: result.promptLogId
        }
      }
    }
  }
}

/** 评审候选计划取前三（本地 ReRanker·失败按候选顺序降级·不整轮崩溃）。 */
export function createReviewPlanCandidatesTool(ctx: TidiaoReplyPlanContext): ToolDefinition {
  return {
    name: TIDIAO_REVIEW_PLAN_CANDIDATES_TOOL_NAME,
    brief: '评审候选计划并输出前三计划。',
    schema: {
      type: 'object',
      properties: {
        candidateIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要评审的候选计划 id 列表；用 ["*"] 表示评审目前已生成的全部候选（必填）。'
        }
      },
      required: ['candidateIds']
    },
    validateArgs: (args) => Array.isArray(args.candidateIds) && args.candidateIds.length > 0 ? null : 'reviewPlanCandidates 缺少 candidateIds',
    execute: async (toolCall) => {
      const rp = ctx
      const state = rp.state
      state.reviewCalls += 1
      if (state.reviewCalls > state.budget.maxReviewPlanCandidatesCalls) {
        return toolError('BUDGET_EXCEEDED', '超出候选评审预算')
      }
      if (state.candidates.length < state.budget.minCandidatesForReview) {
        return toolError('EXPECTATION_MISMATCH', '当前没有可评审候选计划')
      }
      const call = toReviewToolCall(toolCall.callId, toolCall.args, state.candidates, toolCall.expectation)
      let result: ReplyPlanReviewToolResult
      try {
        result = await rp.runReviewPlanCandidates(call, state.candidates)
      } catch (error) {
        // 取消信号原样抛出；其余按评审降级处理（不让评审失败拖崩整轮）。
        if (rp.isAbortError(error)) throw error
        const reason = error instanceof Error ? error.message : String(error)
        result = buildDegradedReviewResult(state.candidates, reason)
        state.reviewResult = result
        state.planToolCalls.push(call)
        rp.onReviewDegraded?.(reason)
        return {
          content: `本地 ReRanker 评审未能运行，已按候选顺序降级产出前三计划`,
          details: {
            candidateIds: call.candidateIds,
            scoredCandidateCount: result.scoredCandidates.length,
            topPlanIds: result.topPlans.map((plan) => plan.id),
            degraded: true,
            degradeReason: reason
          }
        }
      }
      call.promptLogId = result.promptLogId
      state.reviewResult = result
      state.planToolCalls.push(call)
      return {
        content: `已评审 ${call.candidateIds.length} 条候选计划`,
        details: {
          candidateIds: call.candidateIds,
          scoredCandidateCount: result.scoredCandidates.length,
          topPlanIds: result.topPlans.map((plan) => plan.id),
          promptLogId: result.promptLogId,
          diagnostics: result.diagnostics ?? {}
        }
      }
    }
  }
}

/** 帷幕地点合法格式（2026-07-07 用户拍板·唯一口径）：大/中/小三段递进，每段必须是正经地点名词。
 *  真机反例：帷幕曾被写成「镜面方向掠过的一缕说不清的凉意 / 晦暗残影 / IVE后台化妆间」——大/中两段是气氛描写不是地点。 */
export const CURTAIN_LOCATION_FORMAT_HINT = '帷幕地点固定为大/中/小三段递进（小地点在中地点里、中地点在大地点里）：大地点=洲或国家（如「亚洲」「韩国」「大唐」，架空世界用同级的大陆/王国/位面）；中地点=城市（如「首尔」「长安」）；小地点=村/镇/街道或具体场所（如「明洞大街」「后台化妆间」，可以没有正式名字，如「无名小摊」「废屋」，但必须是实际存在的地方）。每段都必须是能回答「在哪儿」的地点名词，绝不能是气氛、光影、感受、比喻或描写句（「晦暗残影」「说不清的凉意」都不是地点）；拿不准就不要提交地点。'

/** 拦「明显是描写句/句子」的帷幕地点段（带标点、超长、长「的」字描写句）；语义级把关靠工具描述与纲领。 */
function findIllegalCurtainLocationPart(parts: string[]): string {
  for (const raw of parts) {
    const value = String(raw || '').trim()
    if (!value) continue
    if (/[。！？；!?;，,]/.test(value)) return value
    if (value.length > 20) return value
    if (value.length >= 12 && value.includes('的')) return value
  }
  return ''
}

/** 改帷幕时间/地点/天气及可选精确世界坐标（用户明确快进/改地点/改天气意图时·元工具预算）。
 *  2026-06-29：requiresBusiness 从 replyPlan 改挂专属 curtainScene 字段（解耦·见 TidiaoCurtainSceneContext），
 *  并新增 targetWeather 维度——回复编排 loop 与纠偏 loop 各装 curtainScene 接缝即可调用。 */
export function createUpdateCurtainSceneTool(ctx: TidiaoCurtainSceneContext): ToolDefinition {
  return {
    name: TIDIAO_UPDATE_CURTAIN_SCENE_TOOL_NAME,
    brief: '当用户明确表达快进时间、改变地点或改变天气意图时，修改当前会话帷幕的时间/地点/天气。若已通过当前世界地图工具确认精确图纸或要素，可同时提交 mapSheetId/mapFeatureId；服务端会校验世界归属。只在当前输入有明确意图、且地点确实改变并写成正经地点名称时调用。地点固定大/中/小三段递进：大=洲或国家、中=城市、小=村/镇/街道或具体场所（可无正式名，如「无名小摊」「废屋」）；每段都是地点名词，不是气氛或描写。',
    schema: {
      type: 'object',
      properties: {
        targetTime: { type: 'string', description: '快进到的目标时间（可选；时间/地点/天气至少给一项）。' },
        targetLocation: { type: 'string', description: '改变到的目标地点完整名（可选；与三段地点二选一）。多段时用「 / 」分隔并按大→中→小排列，如「韩国 / 首尔 / IVE后台化妆间」。' },
        locationLarge: { type: 'string', description: '大地点（可选）：洲或国家级，如「亚洲」「韩国」「大唐」；架空世界用同级概念（大陆/王国/位面）。必须是地点名词，不能是气氛或描写。' },
        locationMiddle: { type: 'string', description: '中地点（可选）：城市级，如「首尔」「长安」；必须位于大地点之内。必须是地点名词，不能是气氛或描写。' },
        locationSmall: { type: 'string', description: '小地点（可选）：村/镇/街道或具体场所，如「明洞大街」「后台化妆间」「无名小摊」「废屋」；必须位于中地点之内，可以没有正式名字，但必须是实际存在的地方。' },
        mapSheetId: { type: 'string', description: '可选精确图纸 id。只允许填写已经从当前会话世界地图上下文或读图工具确认的 id；拿不准不填。' },
        mapFeatureId: { type: 'string', description: '可选精确地图要素 id。只允许填写已经从当前会话世界地图上下文或读图工具确认的 id；服务端会反推并校验图纸，拿不准不填。' },
        targetWeather: { type: 'string', description: '改变到的目标天气（可选，如「晴」「小雨」「大雪」；写正经天气词，拿不准就不要提交）。' },
        reason: { type: 'string', description: '改变时间/地点/天气的简短理由（可选，供审计）。' }
      }
    },
    validateArgs: (args) => {
      const time = String(args.targetTime ?? args.target_time ?? '').trim()
      const location = String(args.targetLocation ?? args.target_location ?? args.locationLarge ?? args.location_large ?? args.locationMiddle ?? args.location_middle ?? args.locationSmall ?? args.location_small ?? '').trim()
      const weather = String(args.targetWeather ?? args.target_weather ?? args.weather ?? '').trim()
      const mapSheetId = String(args.mapSheetId ?? args.map_sheet_id ?? args.sheetId ?? args.sheet_id ?? '').trim()
      const mapFeatureId = String(args.mapFeatureId ?? args.map_feature_id ?? args.featureId ?? args.feature_id ?? '').trim()
      if (!time && !location && !weather && !mapSheetId && !mapFeatureId) return 'updateCurtainScene 至少需要目标时间、地点、天气或已确认的地图图纸/要素引用之一'
      // 占位词不允许写入帷幕地点真值：拿不准地点是否改变时应直接不提交地点
      if (location && /^(未知|未命中|未明确|未设置|未指定|无|不详|暂无)$/i.test(location)) {
        return 'targetLocation 不能是“未知/未命中/未明确”这类占位词；拿不准地点是否改变就不要提交 targetLocation'
      }
      if (weather && /^(未知|未命中|未明确|未设置|未指定|无|不详|暂无)$/i.test(weather)) {
        return 'targetWeather 不能是“未知/未命中/未明确”这类占位词；拿不准天气是否改变就不要提交 targetWeather'
      }
      // 地点段格式硬校验（2026-07-07）：明显是句子/描写的段拒收，错误信息重述合法格式让模型改写重交
      const locationParts = [
        String(args.locationLarge ?? args.location_large ?? args.large ?? ''),
        String(args.locationMiddle ?? args.location_middle ?? args.middle ?? ''),
        String(args.locationSmall ?? args.location_small ?? args.small ?? ''),
        ...String(args.targetLocation ?? args.target_location ?? args.location ?? '').split(/[/｜|]/)
      ]
      const illegalPart = findIllegalCurtainLocationPart(locationParts)
      if (illegalPart) {
        return `地点段「${illegalPart}」不是合法地点。${CURTAIN_LOCATION_FORMAT_HINT}`
      }
      return null
    },
    execute: async (toolCall) => {
      const cs = ctx
      // 元工具预算闸门：回复编排 loop 消费 state.metaCalls（超预算返回错误结果）；纠偏 loop 不限=缺省 no-op。
      const overBudget = cs.consumeBudget ? cs.consumeBudget() : null
      if (overBudget) return overBudget
      const call = toCurtainSceneUpdateToolCall(toolCall.args, toolCall.expectation)
      try {
        const result = await cs.updateCurtainScene(call)
        // 结果留痕：回复编排写 state.curtainSceneUpdate 供情境收束通知；纠偏 loop 缺省=不留。
        cs.recordResult?.(result)
        return {
          content: result.notice || (result.changed ? '帷幕已更新。' : '帷幕未变化。'),
          details: { call, result }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', message || '帷幕修改失败', { call })
      }
    }
  }
}

/** 真机五验④（2026-07-05·用户拍板「通用重试工具」）：重跑本轮生成失败的子工作流。
 *  单元清单/参数快照的家在 roundRetryUnits.ts；真正的重跑执行器由 pipeline 经 TidiaoRetryContext 注入
 * （那里才有 runSingleChat / 旁白生成链路等依赖）。缺省重试全部失败单元——用户说「重试」通常指全部。 */
export function createRetryFailedWorkflowTool(ctx: TidiaoRetryContext): ToolDefinition {
  return {
    name: TIDIAO_RETRY_FAILED_WORKFLOW_TOOL_NAME,
    brief: '重跑本轮生成失败的子工作流（旁白正文生成 / 某角色消息生成）。用户要求「重试/继续把消息生出来」时调用；不带 unitId=重试全部失败单元。',
    schema: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: '要重试的失败单元 id（可选；缺省=重试全部失败单元）。' }
      }
    },
    execute: async (toolCall) => {
      const args = toolCall.args as Record<string, unknown>
      const requested = String(args.unitId ?? args.unit_id ?? '').trim()
      const units = ctx.listUnits()
      if (!units.length) {
        // acted:false（批次1）：没有单元可试=没做事，不让「空重试成功回执」骗过无动作硬门。
        return { content: '本轮没有待重试的失败单元（可能已全部重试成功）。', details: { units: [] }, acted: false }
      }
      const targets = requested ? units.filter((unit) => unit.id === requested) : units
      if (!targets.length) {
        return toolError(
          'INVALID_ARGUMENT',
          `没有找到失败单元「${requested}」；当前失败单元：${units.map((unit) => `${unit.id}（${unit.label}）`).join('、')}`
        )
      }
      const lines: string[] = []
      let okCount = 0
      for (const unit of targets) {
        try {
          const result = await ctx.retryUnit(unit.id)
          if (result.ok) okCount += 1
          lines.push(`${unit.label}：${result.message}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || '')
          lines.push(`${unit.label}：重试执行异常——${message || '未知错误'}`)
        }
      }
      const content = `重试完成（成功 ${okCount}/${targets.length}）：\n${lines.join('\n')}`
      // acted:true（批次1）：重试**尝试本身**算「本轮做过事」（成败已在决策流如实呈现·取代退役的 retryAttempted
      // 观测位）——全失败的 error 结果也显式标 acted，硬门不误拦「只重跑了子工作流但没跑成」的合法轮。
      return okCount > 0
        ? { content, details: { requested: requested || '(全部)', results: lines }, acted: true }
        : { ...toolError('TOOL_RUNTIME_ERROR', content), acted: true }
    }
  }
}

// ── 状态系统两件套（积木骨架计划批次5·2026-07-08 用户拍板「状态栏主写手=提调」）────────────
// 读/改当前会话的状态栏（状态系统=模板定骨架+实例装状态·用户「状态」面板与星依工具同一份服务端真值）。
// 接缝=TidiaoStatusSystemToolContext（管线 buildTidiaoStatusSystemSeam 装配·repository=chatRepository 六函数）。

/** 读当前会话状态系统全貌（只读）。 */
export function createReadStatusPanelsTool(ctx: TidiaoStatusSystemToolContext): ToolDefinition {
  return {
    name: TIDIAO_READ_STATUS_PANELS_TOOL_NAME,
    brief: '读当前会话状态系统全貌，或沿 status_panel 结构引用展开一张状态栏的完整字段与引用关系（只读）。',
    schema: {
      type: 'object',
      properties: {
        reference: {
          type: 'object',
          description: '可选；从 status.panels 投影原样传入的状态栏结构引用。省略则读取全貌。',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['status_panel'] },
            sessionId: { type: 'string' },
            panelId: { type: 'string' }
          },
          required: ['kind', 'sessionId', 'panelId']
        }
      }
    },
    validateArgs: (args) => {
      if (args.reference === undefined || args.reference === null) return null
      const reference = parseStatusPanelReference(args.reference)
      if (!reference) return 'readStatusPanels.reference 不是合法 status_panel 结构引用'
      if (reference.sessionId !== ctx.sessionId) return '状态栏引用不属于当前会话，禁止跨会话下钻'
      return null
    },
    execute: async (toolCall) => {
      try {
        const [templates, panels, tempEntities] = await Promise.all([
          ctx.repository.fetchTemplates(ctx.sessionId),
          ctx.repository.fetchPanels(ctx.sessionId),
          ctx.repository.fetchTempEntities(ctx.sessionId).catch(() => [])
        ])
        const reference = toolCall.args.reference ? parseStatusPanelReference(toolCall.args.reference) : null
        if (reference && reference.sessionId !== ctx.sessionId) return toolError('INVALID_ARGUMENT', '状态栏引用不属于当前会话，禁止跨会话下钻')
        if (reference && !panels.some((panel) => panel.id === reference.panelId)) {
          return toolError('INVALID_ARGUMENT', `引用的状态栏不存在或当前不可见：${reference.panelId}`)
        }
        return {
          content: renderStatusSystemOverview({
            sessionTitle: '当前会话',
            templates,
            panels,
            characterOptions: ctx.characterOptions || [],
            tempEntities,
            emptyHint: '本会话还没有任何状态栏。状态栏由用户或星依创建（用「/整理X」整理临时实体时也会自动带一张）；没有状态栏就不用管状态同步，正常编排即可。',
            ...(reference ? { focusPanelId: reference.panelId } : {})
          }),
          details: { templateCount: templates.length, panelCount: reference ? 1 : panels.length, ...(reference ? { reference } : {}) }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', `读取状态系统失败：${message}`)
      }
    }
  }
}

/** 只允许展开本轮硬代码召回集合；远处种子即使猜中 id 也拒绝。 */
export function createReadNarrativeSeedTool(ctx: TidiaoNarrativeSeedReadContext): ToolDefinition {
  return {
    name: TIDIAO_READ_NARRATIVE_SEED_TOOL_NAME,
    brief: '读取“本轮相关叙事种子”摘要里某一条的完整描述、因果、参与者、关系、时间地点和知情边界。只读；不能把预期后果当成已发生事实。',
    schema: {
      type: 'object',
      properties: {
        seedId: { type: 'string', description: '摘要中给出的叙事种子 id。只能读取本轮已召回的 id。' }
      },
      required: ['seedId']
    },
    validateArgs: (args) => String(args.seedId || '').trim() ? null : 'readNarrativeSeed 缺少 seedId',
    execute: async (toolCall) => {
      const seedId = String(toolCall.args.seedId || '').trim()
      if (!ctx.allowedSeedIds.has(seedId)) {
        return toolError('INVALID_ARGUMENT', '这条种子不在本轮确定性召回集合内，不能越过当前世界与相关性范围读取。')
      }
      try {
        const seed = await ctx.readSeed(seedId)
        ctx.recordRetrievalDecision?.({ tool: TIDIAO_READ_NARRATIVE_SEED_TOOL_NAME, query: seedId, hitCount: 1 })
        return { content: renderNarrativeSeedDetail(seed), details: { seedId } }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', `读取叙事种子失败：${message || '未知错误'}`)
      }
    }
  }
}

const NARRATIVE_SEED_WRITE_PROPERTIES = {
  type: { type: 'string', enum: [...NARRATIVE_SEED_TYPES], description: '种子类型。' },
  title: { type: 'string', description: '具体、可辨认的短标题。' },
  description: { type: 'string', description: '当前局势与戏剧问题；只写因果线，不预写用户会做什么。' },
  cause: { type: 'string', description: '这条因果线由什么已发生事实或明确设定产生。' },
  currentProgress: { type: 'string', description: '当前已确认进展；尚未推进也要明确写出。' },
  expectedOutcome: { type: 'string', description: '未来可能兑现的变化；不是事实，也不是预写的无人干预后果。' },
  startTime: { type: 'string', description: '开始进入判断的时点；优先 ISO 8601，虚构历法写完整日期与时刻。超过后由编剧现场判断。' },
  mapFeatureId: { type: 'string', description: '只填已核实的精确地图要素 id；没有时显式填空字符串。地图图纸由代码自动绑定。' },
  locationText: { type: 'string', description: '严格使用“大地点/中地点/小地点”三段格式，例如“中国/上海/外滩钟楼”。' },
  impactScope: { type: 'string', description: '会影响的人物、关系、地点或世界状态，自由文本。' },
  status: { type: 'string', enum: [...NARRATIVE_SEED_STATUSES], description: '生命周期状态；ready_to_trigger 只由帷幕时钟越过 startTime 时自动写入，不要手工伪造。' },
  visibilityMode: { type: 'string', enum: [...NARRATIVE_SEED_VISIBILITY_MODES] },
  allowFrontstage: { type: 'boolean', description: '是否允许地点或影响范围命中当前帷幕时进入前台。' },
  participants: {
    type: 'array', description: '关联参与者；没有时显式填 []。',
    items: { type: 'object', additionalProperties: false, properties: {
      participantType: { type: 'string', enum: [...NARRATIVE_SEED_PARTICIPANT_TYPES] },
      participantId: { type: 'string' }, displayName: { type: 'string' }, relationRole: { type: 'string' }
    }, required: ['participantType'] }
  },
  links: {
    type: 'array', description: '与既有种子的关系；没有时显式填 []。',
    items: { type: 'object', additionalProperties: false, properties: {
      targetSeedId: { type: 'string' }, relationType: { type: 'string', enum: [...NARRATIVE_SEED_LINK_TYPES] }
    }, required: ['targetSeedId', 'relationType'] }
  },
  evidenceSummary: { type: 'string', description: '本次写入依据；用户明确指令请原样摘要。' }
} as const

/** 用户明确改剧本时的新正式写链：直接新建世界级叙事种子，不再覆盖会话旧整本。 */
export function createCreateNarrativeSeedTool(ctx: TidiaoNarrativeSeedWriteContext): ToolDefinition {
  return {
    name: TIDIAO_CREATE_NARRATIVE_SEED_TOOL_NAME,
    brief: '在当前世界建立一条新的正式叙事种子。15 个模型字段全部必填；空引用用空字符串/空数组显式表达。不得提交无人干预后果、预计触发、超期复查或地图图纸 id。计划与预期不能冒充已发生事实。',
    schema: { type: 'object', additionalProperties: false, properties: NARRATIVE_SEED_WRITE_PROPERTIES, required: [...NARRATIVE_SEED_AUTHOR_FIELDS] },
    validateArgs: (args) => {
      const errors = validateCompleteNarrativeSeedAuthoring(args)
      return errors.length ? `createNarrativeSeed 必填字段校验失败：${errors.join('；')}` : null
    },
    execute: async (toolCall) => {
      try {
        const seed = await ctx.createSeed({
          ...toolCall.args,
          lastModifiedSource: 'director',
          sourceSessionId: ctx.sessionId,
          sourceDirectorRunId: ctx.directorRunId
        })
        return { content: `已建立叙事种子「${String(seed.title || toolCall.args.title)}」（seedId=${String(seed.id || '')}，version=${Number(seed.version || 1)}）。`, details: { seedId: seed.id, version: seed.version }, acted: true }
      } catch (error) {
        return toolError('TOOL_RUNTIME_ERROR', `创建叙事种子失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

/** 乐观锁更新正式种子；先读详情拿 version，避免迟到回报覆盖新事实。 */
export function createUpdateNarrativeSeedTool(ctx: TidiaoNarrativeSeedWriteContext): ToolDefinition {
  return {
    name: TIDIAO_UPDATE_NARRATIVE_SEED_TOOL_NAME,
    brief: '更新一条当前世界的正式叙事种子。必须先 readNarrativeSeed 复核详情与 version，再只提交要改的字段；迟到回报不得覆盖较新版本。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { seedId: { type: 'string' }, expectedVersion: { type: 'number' }, ...NARRATIVE_SEED_WRITE_PROPERTIES },
      required: ['seedId', 'expectedVersion']
    },
    validateArgs: (args) => !String(args.seedId || '').trim()
      ? 'updateNarrativeSeed 缺少 seedId'
      : (!Number.isInteger(Number(args.expectedVersion)) || Number(args.expectedVersion) < 1 ? 'updateNarrativeSeed 的 expectedVersion 必须是正整数' : null),
    execute: async (toolCall) => {
      const seedId = String(toolCall.args.seedId || '').trim()
      try {
        const current = await ctx.readSeed(seedId)
        if (Number(current.version || 0) !== Number(toolCall.args.expectedVersion)) {
          return toolError('INVALID_ARGUMENT', `叙事种子版本已变化：当前 version=${Number(current.version || 0)}，请重读后再提交。`)
        }
        const completeSeed = {
          ...pickNarrativeSeedAuthorFields(current),
          ...pickNarrativeSeedAuthorFields(toolCall.args)
        }
        const completenessErrors = validateCompleteNarrativeSeedAuthoring(completeSeed)
        if (completenessErrors.length) {
          return toolError('INVALID_ARGUMENT', `更新后的叙事种子仍有必填缺口：${completenessErrors.join('；')}。请补齐这些字段后在本轮重交。`)
        }
        const { seedId: _seedId, ...patch } = toolCall.args
        const seed = await ctx.updateSeed(seedId, {
          ...patch,
          lastModifiedSource: 'director',
          sourceSessionId: ctx.sessionId,
          sourceDirectorRunId: ctx.directorRunId
        })
        return { content: `已更新叙事种子「${String(seed.title || seedId)}」（version=${Number(seed.version || 0)}）。`, details: { seedId, version: seed.version }, acted: true }
      } catch (error) {
        return toolError('TOOL_RUNTIME_ERROR', `更新叙事种子失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

/** 更新一张状态栏的字段值（world·剧情造成的状态变化落账）。 */
export function createUpdateStatusPanelTool(ctx: TidiaoStatusSystemToolContext): ToolDefinition {
  return {
    name: TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME,
    brief: '把一张状态栏的字段改到位：剧情造成的状态变化（金钱增减/物品得失/位置移动/情绪起伏/资源产出消耗/等级提升等）用它落账。合并更新——values 只给要改的字段键，没提到的字段保持不变。',
    schema: {
      type: 'object',
      properties: {
        panel: { type: 'string', description: '目标状态栏的名称或 id（必填·以 readStatusPanels 输出为准，别凭记忆拼名字）。' },
        values: {
          type: 'object',
          description: '要改的字段（必填·key=模板字段 key）：number 给新数字、list 给完整数组、ref 给状态栏名称数组、text/binding 给字符串；asset 只能沿用已有的正式资产引用对象。'
        },
        reason: { type: 'string', description: '一句话说明这次改动对应的剧情（可选·审计用）。' }
      },
      required: ['panel', 'values']
    },
    validateArgs: (args) => {
      if (!String(args.panel || '').trim()) return 'updateStatusPanel 缺少 panel（状态栏名称或 id）'
      const values = args.values
      if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values as Record<string, unknown>).length) {
        return 'updateStatusPanel 的 values 必须是非空对象（key=要改的字段 key）'
      }
      return null
    },
    execute: async (toolCall) => {
      try {
        const [templates, panels] = await Promise.all([
          ctx.repository.fetchTemplates(ctx.sessionId),
          ctx.repository.fetchPanels(ctx.sessionId)
        ])
        const resolved = resolveStatusSystemItem(panels, String(toolCall.args.panel || ''), '状态栏')
        if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
        const panel = resolved.item
        const template = templates.find((item) => item.id === panel.templateId) || null
        // 批次B：字段真值=实例快照优先（旧实例回退模板）；有快照时模板缺失也能更新
        const fields = resolvePanelFields(panel, template)
        if (!fields.length) return toolError('TOOL_RUNTIME_ERROR', `状态栏「${panel.name}」没有字段定义（实例无快照且模板已不存在），无法按字段更新。`)
        const built = buildStatusPanelValues({
          fields,
          provided: toolCall.args.values as Record<string, unknown>,
          existingValues: panel.values || {},
          panels,
          selfPanelId: panel.id
        })
        if ('error' in built) return toolError('INVALID_ARGUMENT', built.error)
        const saved = await ctx.repository.savePanel(ctx.sessionId, {
          id: panel.id,
          templateId: panel.templateId,
          name: panel.name,
          hostType: panel.hostType,
          hostId: panel.hostId,
          values: built.values,
          expectedVersion: panel.version,
          source: 'tidiao'
        })
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT))
        return {
          content: `已更新状态栏「${saved.name}」：${built.changedLines.join('；')}。`,
          details: { panelId: saved.id, changed: built.changedLines }
        }
      } catch (error) {
        // 服务端 400/409 中文报错原样透传（字段校验/宿主约束都靠它·据报错修参重试）
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', `更新状态栏失败：${message}`)
      }
    }
  }
}

// ── 提调建状态栏 + scope 确认（融入计划批次4·2026-07-10）────────────────────────
// 建卡管线与星依 saveStatusTemplate/saveStatusPanel 同一套纯函数（readTemplateFieldRows/buildStatusPanelValues/
// resolveStatusSystemItem·联动能力：那边归一/校验口径改这边同生效），差异只在门控：
// 星依=confirmWrite 每写必弹；提调=scope 确认门——confirmStatusScope 挂起弹卡（用户亲手选角色/对话/文档库范围），
// 确认后的续跑轮才注册建卡两件套，工具内不再重复弹确认（范围已由用户确认·指令随续跑轮注入）。

/** 建状态栏前请求用户确认范围（signal·统筹专属，advisory 模式·2026-07-10 已非阻塞化）：调用当场登记
 *  scope 确认请求、给用户递一张不打断当前轮的确认卡，模型继续照常跑完本轮编排；用户确认后由后台按已确认
 *  范围建栏，不经引擎 halt/terminate（旧「挂起弹卡」注释已过时，见 execute 内 requestScopeConfirm 实际行为）。 */
export function createTidiaoConfirmStatusScopeTool(ctx: TidiaoStatusScopeSignalContext): ToolDefinition {
  return {
    name: TIDIAO_CONFIRM_STATUS_SCOPE_TOOL_NAME,
    brief: '当前主要角色尚无状态栏时必须启动造册；用户明确要建栏或剧情出现值得长期管理的新对象/信息时也可使用。本工具请求用户确认造册范围：'
      + '①要记录什么、给谁或作为哪种独立对象 ②取料参考哪些对话 ③可以查文档库的哪些范围。分类和覆盖范围完全由用户决定，不得按角色/物品/建筑预设强制补栏。调用后会给用户弹范围确认卡，但**不打断你**——'
      + '主要角色只要求必须发起造册，字段结构仍由用户确认。你继续照常排完本轮的戏，不用等确认；用户确认后建栏由后台专人完成，建好后你下轮自然能在状态栏段看到。'
      + '一次盘点出多个缺栏主要角色时，用 characterHints 一次把他们全部提交；前台会逐人确认，全部选完后后台只启动一次批量造册。不要循环单角色调用。同一个角色用户拒绝过就别再请求。',
    schema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', description: '这次要记录和管理什么（简短，展示在确认卡顶部）。' },
        characterHint: { type: 'string', description: '兼容单角色：你判断的目标角色名（可选·卡片据此预选宿主角色）。' },
        characterHints: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12, description: '批量角色：本轮一次盘点出的全部缺栏主要角色名。多个角色必须一次提交，不要逐个调工具。' },
        sessionHint: { type: 'string', description: '你判断资料主要在哪个对话（可选·卡片据此预选参考对话；缺省=当前对话）。' }
      },
      required: ['purpose']
    },
    validateArgs: (args) => (String(args.purpose || '').trim() ? null : 'confirmStatusScope 缺少 purpose（这次要建什么）'),
    execute: (toolCall) => {
      const characterHints = Array.isArray(toolCall.args.characterHints)
        ? [...new Set(toolCall.args.characterHints.map((name) => String(name || '').trim()).filter(Boolean))].slice(0, 12)
        : []
      const request = {
        purpose: String(toolCall.args.purpose || '').trim(),
        ...(String(toolCall.args.characterHint || '').trim() ? { characterHint: String(toolCall.args.characterHint).trim() } : {}),
        ...(characterHints.length ? { characterHints } : {}),
        ...(String(toolCall.args.sessionHint || '').trim() ? { sessionHint: String(toolCall.args.sessionHint).trim() } : {})
      }
      // 批次B（非阻塞）：登记交给管线闭包（防重/拒绝检查+写全局 pending 弹卡）；拒绝原因原样回执。
      const rejection = ctx.requestScopeConfirm(request)
      if (rejection) return toolError('TOOL_RUNTIME_ERROR', rejection)
      return {
        content: characterHints.length > 1
          ? '已把这批对象的逐人范围确认卡递给用户——不用等确认，继续照常完成本轮编排。用户全部选择完后，后台会一次批量造册。'
          : '已把范围确认卡递给用户——不用等确认，继续照常完成本轮编排。用户确认后建栏会由后台专人按已确认范围完成，你下轮自然能看到新状态栏。',
        details: { requested: true, count: Math.max(1, characterHints.length) }
      }
    }
  }
}

/** 设计/修改状态栏模板（提调版·world·scope 确认续跑轮专属）：与星依 saveStatusTemplate 同名同参（去 session/confirmWrite）。 */
export function createTidiaoSaveStatusTemplateTool(ctx: TidiaoStatusSystemToolContext): ToolDefinition {
  return {
    name: TIDIAO_SAVE_STATUS_TEMPLATE_TOOL_NAME,
    brief: '设计或修改当前会话状态系统的模板（字段骨架）：kind 是用户自定义分类，不是系统枚举。新建=给 name+kind+fields；更新既有模板=给 template 指定目标，其余只给要改的。没有合适模板时先设计骨架，再实例化一张或多张状态栏。',
    schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: '要更新的既有模板名称或 id（缺省=新建模板）。' },
        name: { type: 'string', description: '模板名称（新建必填，如「角色状态栏」「宗门状态栏」）。' },
        kind: { type: 'string', description: '用户自定义分类（新建必填；可按当前世界观和管理需求自由命名）。' },
        description: { type: 'string', description: '模板说明（可选）。' },
        fields: { ...TEMPLATE_FIELD_SCHEMA, description: '字段定义数组（新建必填；更新时给了就整组覆盖，不给则保持不变）。' },
        reason: { type: 'string', description: '为何做这次设计（可选，简短，供审计）。' }
      }
    },
    validateArgs: (args) => {
      const isUpdate = Boolean(String(args.template || '').trim())
      if (!isUpdate) {
        if (!String(args.name || '').trim()) return 'saveStatusTemplate 新建模板缺少 name'
        if (!String(args.kind || '').trim()) return 'saveStatusTemplate 新建模板缺少 kind（如 character/organization/building）'
        if (!readTemplateFieldRows(args.fields).length) return 'saveStatusTemplate 新建模板缺少 fields（至少 1 个字段定义）'
      } else if (!String(args.name || '').trim() && !String(args.kind || '').trim() && args.description === undefined && !Array.isArray(args.fields)) {
        return 'saveStatusTemplate 更新模板至少要给一个修改项（name/kind/description/fields）'
      }
      return null
    },
    execute: async (toolCall) => {
      try {
        const templates = await ctx.repository.fetchTemplates(ctx.sessionId)
        const targetRaw = String(toolCall.args.template || '').trim()
        let existing: ChatStatusPanelTemplate | null = null
        if (targetRaw) {
          const resolved = resolveStatusSystemItem(templates, targetRaw, '模板')
          if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
          existing = resolved.item
        }
        const fieldRows = Array.isArray(toolCall.args.fields)
          ? readTemplateFieldRows(toolCall.args.fields)
          : readTemplateFields(existing).map((field) => ({ ...field }))
        const saved = await ctx.repository.saveTemplate(ctx.sessionId, {
          ...(existing ? { id: existing.id } : {}),
          name: String(toolCall.args.name || '').trim() || existing?.name || '',
          kind: String(toolCall.args.kind || '').trim() || existing?.kind || '',
          description: toolCall.args.description === undefined ? String(existing?.description || '') : String(toolCall.args.description || ''),
          fields: fieldRows as ChatStatusPanelTemplate['fields'],
          createdBy: 'agent',
          expectedVersion: existing?.version || 0
        })
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT))
        return {
          content: `${existing ? '更新' : '新建'}状态栏模板成功：「${saved.name}」（kind=${saved.kind}·id=${saved.id}），字段 ${readTemplateFields(saved).length} 个。模板是种子——接着用 saveStatusPanel 实例化状态栏。`,
          details: { templateId: saved.id, ok: true }
        }
      } catch (error) {
        // 服务端 400/409 中文报错原样透传（字段校验都靠它·据报错修参重试）
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', `保存状态栏模板失败：${message}`)
      }
    }
  }
}

/** 实例化/更新状态栏（提调版·world·scope 确认续跑轮专属）：与星依 saveStatusPanel 同名同参（去 session/confirmWrite）。 */
export function createTidiaoSaveStatusPanelTool(ctx: TidiaoStatusSystemToolContext): ToolDefinition {
  return {
    name: TIDIAO_SAVE_STATUS_PANEL_TOOL_NAME,
    brief: '实例化或更新一个状态栏：新建必须给用途 description；更新可用 fieldPatches 按稳定 key 修改旧实例字段标题、单位或说明，当前值保持不变。values 未提到的保持不变。'
      + '建在当前会话；宿主=用户已确认范围里的对象（会话角色=hostType session_character + host=角色名；用户/玩家本人=hostType user、无需 host）。',
    schema: {
      type: 'object',
      properties: {
        panel: { type: 'string', description: '要更新的既有状态栏名称或 id（缺省=新建）。' },
        template: { type: 'string', description: '模板名称或 id（新建必填；更新时忽略）。' },
        name: { type: 'string', description: '状态栏名称（新建必填，通常=实体名，如角色名/组织名）。' },
        description: { type: 'string', description: '这张状态栏具体记录什么。新建必填；普通数值变化不用改，只有用途或字段语义变化导致旧摘要不再匹配时才更新。' },
        hostType: { type: 'string', enum: ['session_character', 'temp_entity', 'user', 'none'], description: '宿主类型：session_character=本会话角色 / temp_entity=会话临时实体 / user=用户本人 / none=独立实体（更新时不给则保持不变）。' },
        host: { type: 'string', description: '宿主名称或 id（hostType=session_character/temp_entity 时必填，user/none 不需要；角色按会话成员名解析）。' },
        fieldPatches: {
          type: 'array',
          description: '只用于更新旧实例：按稳定字段 key 修改标题、单位或说明；不改 key/valueType，也不会清空当前值。',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              label: { type: 'string', description: '新的字段标题（可选；不能为空）。' },
              unit: { type: 'string', description: '新的独立单位（可选；空字符串表示清除单位）。' },
              description: { type: 'string', description: '新的字段说明（可选；空字符串表示清除说明）。' }
            },
            required: ['key']
          }
        },
        values: { type: 'object', description: '字段值（key=模板字段 key）：number 给数字、list 给字符串数组、ref 给其他状态栏的名称数组、binding/text 给字符串。更新时只给要改的键。' },
        reason: { type: 'string', description: '为何写入（可选，简短，供审计）。' }
      }
    },
    validateArgs: (args) => {
      const isUpdate = Boolean(String(args.panel || '').trim())
      if (!isUpdate) {
        if (!String(args.template || '').trim()) return 'saveStatusPanel 新建状态栏缺少 template（模板名称或 id）'
        if (!String(args.name || '').trim()) return 'saveStatusPanel 新建状态栏缺少 name'
        if (!String(args.description || '').trim()) return 'saveStatusPanel 新建状态栏缺少 description（说明这张栏记录什么）'
        if (Array.isArray(args.fieldPatches) && args.fieldPatches.length) return 'saveStatusPanel 新建状态栏不能使用 fieldPatches；请在模板 fields 中定义单位'
      } else if (args.fieldPatches !== undefined && (!Array.isArray(args.fieldPatches) || !args.fieldPatches.length)) {
        return 'saveStatusPanel 的 fieldPatches 必须是非空数组'
      }
      const hostType = String(args.hostType || '').trim()
      if (hostType && !['session_character', 'temp_entity', 'user', 'none'].includes(hostType)) {
        return 'saveStatusPanel 的 hostType 必须是 session_character/temp_entity/user/none'
      }
      if ((hostType === 'session_character' || hostType === 'temp_entity') && !String(args.host || '').trim()) {
        return `saveStatusPanel 宿主类型是 ${hostType} 时必须给 host（宿主名称或 id）`
      }
      return null
    },
    execute: async (toolCall) => {
      try {
        const [templates, panels] = await Promise.all([
          ctx.repository.fetchTemplates(ctx.sessionId),
          ctx.repository.fetchPanels(ctx.sessionId)
        ])
        const panelRaw = String(toolCall.args.panel || '').trim()
        let existing: ChatStatusPanel | null = null
        if (panelRaw) {
          const resolved = resolveStatusSystemItem(panels, panelRaw, '状态栏')
          if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
          existing = resolved.item
        }
        // 模板：更新沿用既有；新建按名称/id 解析
        let template: ChatStatusPanelTemplate | null = null
        if (existing) {
          template = templates.find((item) => item.id === existing?.templateId) || null
          if (!template) return toolError('TOOL_RUNTIME_ERROR', `状态栏「${existing.name}」的模板已不存在`)
        } else {
          const resolved = resolveStatusSystemItem(templates, String(toolCall.args.template || ''), '模板')
          if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
          template = resolved.item
        }
        // 宿主：不给则沿用既有（新建缺省 none）；角色按会话成员解析、临时实体按会话临时实体解析
        const hostType = (String(toolCall.args.hostType || '').trim() || existing?.hostType || 'none') as ChatStatusPanel['hostType']
        let hostId = existing?.hostId || ''
        if (String(toolCall.args.hostType || '').trim() || !existing) {
          if (hostType === 'session_character') {
            const resolved = resolveStatusSystemItem(ctx.characterOptions || [], String(toolCall.args.host || ''), '会话角色')
            if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
            hostId = String(resolved.item.participantId || resolved.item.id || '').trim()
          } else if (hostType === 'temp_entity') {
            const entities = await ctx.repository.fetchTempEntities(ctx.sessionId)
            const resolved = resolveStatusSystemItem(entities, String(toolCall.args.host || ''), '临时实体')
            if ('error' in resolved) return toolError('INVALID_ARGUMENT', resolved.error)
            hostId = resolved.item.id
          } else {
            hostId = ''
          }
        }
        // 字段真值与星依同口径：更新按实例快照（旧实例回退模板）；新建按模板字段（服务端拷贝快照）
        const fields = existing ? resolvePanelFields(existing, template) : readTemplateFields(template)
        const patched = existing && toolCall.args.fieldPatches !== undefined
          ? applyStatusPanelFieldPatches(fields, toolCall.args.fieldPatches)
          : null
        if (patched && 'error' in patched) return toolError('INVALID_ARGUMENT', patched.error)
        const nextFields = patched && 'fields' in patched ? patched.fields : fields
        const provided = (toolCall.args.values && typeof toolCall.args.values === 'object' && !Array.isArray(toolCall.args.values))
          ? toolCall.args.values as Record<string, unknown>
          : {}
        const built = buildStatusPanelValues({
          fields: nextFields,
          provided,
          existingValues: existing?.values || {},
          panels,
          ...(existing ? { selfPanelId: existing.id } : {})
        })
        if ('error' in built) return toolError('INVALID_ARGUMENT', built.error)
        const saved = await ctx.repository.savePanel(ctx.sessionId, {
          ...(existing ? { id: existing.id } : {}),
          templateId: template.id,
          name: String(toolCall.args.name || '').trim() || existing?.name || '',
          description: toolCall.args.description === undefined
            ? String(existing?.description || template.description || '')
            : String(toolCall.args.description || '').trim(),
          hostType,
          hostId,
          values: built.values,
          ...(patched && 'fields' in patched ? { fields: patched.fields } : {}),
          expectedVersion: existing?.version || 0,
          source: 'tidiao'
        })
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT))
        return {
          content: `${existing ? '更新' : '新建'}状态栏成功：「${saved.name}」（模板=${template.name}·id=${saved.id}）${patched && 'changedLines' in patched ? `，已修改字段设置：${patched.changedLines.join('；')}` : ''}${built.changedLines.length ? `，已写入：${built.changedLines.join('；')}` : ''}。`,
          details: { panelId: saved.id, ok: true, fieldPatches: patched && 'changedLines' in patched ? patched.changedLines : [] }
        }
      } catch (error) {
        // 服务端 400/409 中文报错原样透传（宿主约束/引用完整性都靠它·据报错修参重试）
        const message = error instanceof Error ? error.message : String(error || '')
        return toolError('TOOL_RUNTIME_ERROR', `保存状态栏失败：${message}`)
      }
    }
  }
}

/** 按工具名取手册（元工具·绑定 state.config.tools 经 getToolManual 回调）。 */
export function createGetToolManualTool(ctx: TidiaoReplyPlanContext): ToolDefinition {
  return {
    name: TIDIAO_GET_TOOL_MANUAL_TOOL_NAME,
    brief: '按工具名取回该工具的 manual。',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要取手册的目标工具机器名（必填）。' }
      },
      required: ['name']
    },
    validateArgs: (args) => String(args.name || '').trim() ? null : 'getToolManual 缺少 name',
    execute: (toolCall) => {
      const rp = ctx
      const state = rp.state
      state.metaCalls += 1
      if (state.metaCalls > state.budget.maxMetaToolCalls) {
        return toolError('BUDGET_EXCEEDED', '超出元工具调用预算')
      }
      const name = String(toolCall.args.name || '').trim()
      const manual = rp.getToolManual(name)
      if (!manual) return toolError('TOOL_RUNTIME_ERROR', `未找到工具 ${name} 的手册`, { name })
      return {
        content: manual,
        details: { name, manual }
      }
    }
  }
}

// ── 接缝重构（2026-06-30）：退役「单一全局 registry 单例 + B3 门控隐藏」 ──
// 旧机制＝module-level 单例存全 23 无参工具 + 各 loop 靠 presentBusinessFields(B3) 隐藏缺接缝者。
// 新机制＝各 loop 启动时按「当轮接缝在位与否」调上面的工厂建自己的 ToolRegistry（见各 harness 装配段）——
// 工厂收 context 入参、闭包捕获，漏传变编译期错；registry 成员＝真有 context 的工具（越权目录与旧 B3 等价·零回归）。
// 故不再需要 module-level 单例（含 per-run 闭包态的工具无法安全共享单例）。工具定义仍集中本文件（单一来源）。

/**
 * R1-B item7（协议层·越权话术·单一真值源）：把 deferred 模式 runtime 下发的「全局可搜目录」toolCatalog
 * 渲染成一段告知协议——告诉模型「除了上面已激活、带参数格式可直接调的工具，本轮还有这些工具可用，但要先
 * 用 toolsearch(query) 把它们搜出来拿到参数格式，下一轮才能直接调」。三条 deferred loop（群聊导演/编辑/演员）
 * 的 callOrchestrator 共用·拼到 system 协议末尾（关闭 item5/6 残留的「下发了 catalog 却没告知 toolsearch」真机 gap）。
 * toolCatalog 为空（非延迟模式/无目录）返回空串·调用方据此跳过。旁白 subagent 为聚焦 2 工具非延迟 pass·不下发本协议。
 */
export function buildToolsearchOverrideProtocol(
  toolCatalog: Array<{ name: string; brief: string; recommended: boolean }> | undefined
): string {
  const list = Array.isArray(toolCatalog) ? toolCatalog : []
  if (!list.length) return ''
  const lines = list.map((tool) => `- ${tool.name}${tool.recommended ? '（常用）' : ''}：${tool.brief}`)
  return [
    '【全局工具目录·越权可搜】除了上面已激活、带参数格式可以直接调用的工具，本轮你还可以用下面这些工具；它们没有随附参数格式，必须先用 toolsearch 把它们搜出来拿到参数格式，下一轮才能直接调用：',
    ...lines,
    '用法：先发起原生函数调用 toolsearch（参数 query 填你想做的事或工具能力关键词，例如「读提示词」「搜导演记忆」「旁白」），它会返回匹配工具的名字、说明和参数格式；拿到后下一轮即可直接调用这些工具。标「常用」的是本情景推荐工具，其余是越权补充——只在确有需要时搜，不要为搜而搜。'
  ].join('\n')
}
