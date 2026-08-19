/**
 * 陈星依总 agent harness（批次1 地基+唤出 · 批次2 功能工具化）。
 *
 * 架构：
 * 复用通用引擎 runAgentRuntime（deferredToolMode + 内置 toolsearch），星依自装工具池——
 * 批次1 挂只读取料三件套（文档库-only 检索接缝，脱离聊天会话可用）；
 * 批次2 挂功能工具四件（生成编译页/优化关系/生成角色/总结对话，经 xingyiFunctionBridge 复用按钮同款核心，
 * 全部过 confirmWrite 写确认门）；批次3 接指挥提调的 dispatch 工具；
 * 批次4 接角色人格两件（性格校准/训练出题，自包含直挂，见 xingyiPersonalityTools）。
 *
 * 接缝设计：
 * - callOrchestrator 由调用方（星依浮坞）注入：真实实现走 useAI().callAIWithTools +
 *   buildTaskModelAiOptions(agentConfig, 'xingyiAgent')（批次3 槽位收束·校书档）+ feature:'xingyi'；测试注入 mock。
 * - retrieval 依赖（documents/embedTexts/vectorCache）由调用方注入，与召回链路同源；
 *   星依是全局语境，documents 应传全量文档库（不是会话白名单裁剪版）。
 * - 会话持久不在本文件：harness 只管一轮「用户输入 → 星依回复」，历史由调用方带入。
 */

import { createXingyiKnowledgeTools } from './agentKnowledge/xingyiKnowledge'
import { createXingyiDiaryReadTools } from './xingyiDiaryReadTools'
import type { AgentRuntimeMessage, AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import type { AgentSubagentControlCapability } from './agentRuntime/subagentControl'
import { runAgentRuntime } from './agentRuntime/runtime'
import { buildAgentRuntimeContextPolicy } from './agentRuntimeContextPolicy'
import { prepareAgentRuntimeJournalForHarness } from './agentRuntimeJournalPolicy'
import { extractAgentRuntimeReply, isAgentTurnUnfinished } from './agentHarnessShared'
import {
  formatAttachmentNote,
  readMessageAttachments,
  type AIContentPart,
  type ChatImageAttachment
} from '../utils/chatAttachments'
import { ToolRegistry } from './agentRuntime/toolRegistry'
import {
  assembleAgentSkillSupply,
  resolveAgentRuntimeToolSupply,
  type AgentSkillActivationRequest
} from './agentSupply'
import { HookRegistry } from './agentRuntime/hookRegistry'
import { createEmptyTurnContinuationGate } from './agentRuntime/continuationGate'
// 工作流时间线归因修复（2026-07-12·与 subagentLoop.ts 同构）：模型调用前置埋点直接写星依浮坞轮流水单例，
// 见下方 callModel 包装注释。
import { appendXingyiTurnStreamEntry, markXingyiTurnIfNew, settleXingyiTurnStreamTool } from './xingyiTurnStreamState'
// P2 批 E2（2026-07-12 架构审查·规则常量单真值化）：「必须真发起原生函数调用才生效」核心句单点收编，见该文件注释。
import { TOOL_CALL_REALITY_RULE } from './agentProtocols/sharedRules'
import {
  buildToolsearchOverrideProtocol,
  createFetchUnitDetailTool,
  createRecallSemanticTool,
  createSearchWorldTextTool
} from './tidiaoGlobalTools'
import { createTidiaoDocLibraryRetrievalContext } from './tidiaoRetrievalContextFactory'
import type { TidiaoRetrievalContext } from './tidiaoRetrievalTools'
import { createXingyiFunctionTools, type XingyiWriteConfirm } from './xingyiFunctionTools'
import { createXingyiStatusSystemTools } from './xingyiStatusSystemTools'
import { createXingyiProjectionTools } from './xingyiProjectionTools'
import { createXingyiCharacterBrainTools, type XingyiCharacterBrainProvider } from './xingyiCharacterBrainTools'
import { createXingyiCharacterGroupTools, type XingyiCharacterGroupProvider } from './xingyiCharacterGroupTools'
import { createXingyiBatchCharacterTools, type XingyiBatchCharacterProvider } from './xingyiBatchCharacterTools'
import {
  createXingyiAskUserTools,
  type XingyiAskUser
} from './xingyiAskUserTool'
import { createXingyiStatusScopeTools, type XingyiStatusScopeConfirm } from './xingyiStatusScopeTool'
import type { XingyiSessionResolver } from './xingyiSessionContext'
import { createXingyiPersonalityTools, type XingyiPersonalityToolContext } from './xingyiPersonalityTools'
import { createXingyiUnitCrudTools, type XingyiUnitCrudToolContext } from './xingyiUnitCrudTools'
import { createXingyiAliasTools, type XingyiAliasToolContext } from './xingyiAliasTools'
import { createXingyiTidiaoDispatchTools, type XingyiTidiaoDispatchContext } from './xingyiTidiaoDispatchTools'
import { createXingyiCurtainSceneTool, type XingyiCurtainSceneToolContext } from './xingyiCurtainSceneTools'
import { createXingyiDispatchScriptwriterTool, type XingyiScriptwriterDispatchContext } from './xingyiScriptwriterDispatchTools'
import {
  createXingyiDispatchZaoceStatusDesignTool,
  type XingyiZaoceStatusDesignContext
} from './xingyiZaoceStatusDesignTools'
import {
  createXingyiDeleteMapFeaturesTool,
  createXingyiDispatchMapWorkTool,
  createXingyiListWorldsTool,
  createXingyiReadWorldMapTool,
  type XingyiMapWorkDispatchContext
} from './xingyiMapDispatchTools'
import { createXingyiDispatchResearchTool, type XingyiResearchDispatchContext } from './xingyiResearchDispatchTools'
import { createXingyiImageGenerationTools, type XingyiImageGenerationContext } from './xingyiImageGenerationTool'
import { createXingyiWebSearchTool, type XingyiWebSearchContext } from './xingyiWebSearchTool'
import { createReadXingyiDocLibraryEditingSkillTool } from './xingyiDocLibraryEditingSkill'
import { createReadXingyiRelationHintSkillTool } from './xingyiRelationHintSkill'
import {
  createXingyiConversationAvatarTools,
  type XingyiReadableAvatarImage,
  type XingyiConversationAvatarProvider
} from './xingyiConversationAvatarTools'
import {
  createXingyiConversationMemberTools,
  type XingyiConversationMemberProvider
} from './xingyiConversationMemberTools'
import { XINGYI_AGENT_NAME, XINGYI_CHARTER } from './xingyiCharter'

export { XINGYI_AGENT_NAME }

export interface XingyiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  /** 附件（输入框图片上传计划批5）：仅供 readMessageAttachments 统一读取——渲染层（浮坞气泡缩略图）与
   *  本文件历史 note 追加共用同一份，不另开一套解析。历史消息一律不带原生图，只在 content 后追加
   *  formatAttachmentNote 纯文字（见下方 messages 组装），content 本身类型恒为 string。 */
  attachments?: ChatImageAttachment[]
}

/** 星依侧模型调用请求 messages 项：content 允许 string 或（当轮原生图升级后）parts 数组。
 *  与 AgentRuntimeMessage 的差异只在 content 类型——runAgentRuntime 内部引擎（messages/history/hook）
 *  全程假设 content 是 string（见 agentRuntime/types.ts AgentRuntimeHistoryMessage），parts 数组只能
 *  在「即将发给模型」的这一份快照上短暂存在（见 upgradeXingyiCurrentUserMessage），不能塞回引擎本身。 */
export interface XingyiOrchestratorMessage extends Omit<AgentRuntimeMessage, 'content'> {
  content: string | AIContentPart[]
}

/** 星依侧模型调用请求：与提调各 loop 的 callOrchestrator 同构（messages + toolBriefs → {content, toolCalls}）。 */
export interface XingyiOrchestratorRequest {
  messages: XingyiOrchestratorMessage[]
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  /** 已授权但尚未激活的目录只含 name/brief；recommended 只是高频标记，不是权限。 */
  toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  /** 用户明确要求联网时首轮强制 searchWeb；其它情境仍由模型自行判断是否调用工具。 */
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  turnIndex: number
}

export interface RunXingyiAgentInput {
  /** 本轮用户输入（必填）。 */
  userText: string
  /** 星依会话历史（调用方按需截断后带入，直接进 prompt）。 */
  history?: XingyiHistoryMessage[]
  /** 本轮图片附件（输入框图片上传计划批5·浮坞注入）：只用来把「当轮」user 消息升级成原生 image parts
   *  （见 upgradeXingyiCurrentUserMessage），历史轮附件走 XingyiHistoryMessage.attachments 纯文字 note。 */
  attachments?: ChatImageAttachment[]
  /** 取料接缝（缺省=空文档库）。浮坞传 useAI().buildTidiaoRetrievalContext('', { docLibraryOnly:true, allDocuments:true })，
   *  与召回链路同源 embedding/缓存；星依全局语境用 allDocuments 全量文档库、不吃会话白名单。 */
  retrievalContext?: TidiaoRetrievalContext
  /** 按 xingyi 配方生成的活动会话统一上下文；在位时取代单独世界投影。 */
  agentContextBlock?: string
  /** 已由斜杠命令、按钮或上一轮 Skill 读取工具明确选中的按需正文；缺省只装配 manifest 目录，不按用户文本猜测或全文加载。 */
  skillActivations?: readonly AgentSkillActivationRequest[]
  /** 模型调用接缝（浮坞注真实 callAIWithTools / 测试注 mock）。 */
  callOrchestrator: (request: XingyiOrchestratorRequest) => Promise<{ content: string; toolCalls: unknown[] } | null>
  /** 写操作确认门（浮坞注入=弹确认卡片）。缺省时功能工具一律拒绝执行写操作——硬门，不靠纲领口头约束。 */
  confirmWrite?: XingyiWriteConfirm
  /** 指挥提调接缝（批次3b·浮坞注入 runner deps/联系人清单等）。缺省=指挥提调工具不装配（测试/无接线环境）。
   *  confirmWrite 不在此处重复注入——装配时统一取上面的 confirmWrite（同一道确认门）。 */
  tidiaoDispatch?: Omit<XingyiTidiaoDispatchContext, 'confirmWrite'>
  /** 当前会话帷幕修改接缝。缺省不装配；写确认统一取顶层 confirmWrite。 */
  curtainScene?: Omit<XingyiCurtainSceneToolContext, 'confirmWrite'>
  /** 派遣编剧接缝：对指定会话开立/修订剧本；写确认统一取顶层 confirmWrite。 */
  scriptwriterDispatch?: Omit<XingyiScriptwriterDispatchContext, 'confirmWrite' | 'resolveSessionContext'>
  /** 派遣造册重构既有状态栏总览；星依只交目标和人话任务，presentation 写权仍只在造册。 */
  zaoceStatusDesign?: Omit<XingyiZaoceStatusDesignContext, 'confirmWrite' | 'resolveSessionContext'>
  /** 派绘舆作图接缝（地图系统批6+星依世界寻址/删除批·浮坞注入 dispatch/dispatchToWorld/listWorlds/readWorldMapSummary
   *  执行体）。缺省=dispatchMapWork/listWorlds/readWorldMap/deleteMapFeatures 四件工具都不装配（测试/无接线环境）。
   *  resolveSessionContext 不在此处重复注入——装配时统一取上面的 resolveSessionContext（同一套会话解析）。 */
  mapWork?: Omit<XingyiMapWorkDispatchContext, 'resolveSessionContext' | 'getSessionContext'>
  /** 派采风钻探接缝（地图严谨协作与运行卡计划批2·浮坞注入 dispatch 执行体）。缺省=dispatchResearch 工具不装配（测试/无接线环境）。
   *  resolveSessionContext 不在此处重复注入——装配时统一取上面的 resolveSessionContext（同一套会话解析），与 mapWork 同构。 */
  research?: Omit<XingyiResearchDispatchContext, 'resolveSessionContext' | 'getSessionContext'>
  /** 角色人格工具接缝（批次4·浮坞注入 callAI/角色存取等）。缺省=人格两件不装配（测试/无接线环境）。
   *  confirmWrite 同上统一取顶层（同一道确认门）。 */
  personality?: Omit<XingyiPersonalityToolContext, 'confirmWrite'>
  /** 单位增删改移动接缝（2026-07-07 单位工具计划·浮坞注入领域适配器）。缺省=七件套不装配。
   *  confirmWrite 同上统一取顶层（同一道确认门）。 */
  unitCrud?: Omit<XingyiUnitCrudToolContext, 'confirmWrite'>
  /** 读本地日记接缝。缺省=读日记两件不装配。 */
  diary?: Record<string, never>
  /** 用户资料读取与马甲管理接缝（浮坞注入 charStore/chatStore 包装 provider）。缺省=五件套不装配（测试/无接线环境）。
   *  confirmWrite 与 resolveSessionContext 不在此处重复注入——装配时统一取顶层（同一道确认门/同一套会话解析）。 */
  aliasManage?: Omit<XingyiAliasToolContext, 'confirmWrite' | 'getSessionContext' | 'resolveSessionContext'>
  /** 读角色大脑接缝（取料闭环计划批次2·浮坞注入 charStore 角色只读 provider）。缺省=读角色大脑工具不装配。
   *  只读、星依管理专用（碰 06-22 知识隔离红线但用户已准）——不改星依取料隔离，只额外提供显式角色大脑只读口子。 */
  characterBrain?: XingyiCharacterBrainProvider
  /** 角色分组管理接缝：读取全量分组成员，并经正式 Store 做建改删、批量移组和排序。 */
  characterGroups?: XingyiCharacterGroupProvider
  /** 多角色并行生成接缝：每条链路独立生成并正式落库，不经过角色编辑弹窗共享表单。 */
  batchCharacters?: XingyiBatchCharacterProvider
  /** 显式会话解析器（取料闭环计划批次3·浮坞注入）：把 session 参数（会话名/联系人名/targetId/sessionId）
   *  解析成完整上下文，让状态系统/读投影工具能操作非活动会话。缺省=不接入（给了 session 会如实报未接入）。 */
  resolveSessionContext?: XingyiSessionResolver
  /** 询问用户接缝（内核统一批·批C·浮坞注入=弹选择卡片）。缺省=askUser 工具在池但执行期如实报不可用。 */
  askUser?: XingyiAskUser
  /** 建状态栏前确认取料范围接缝（2026-07-09·浮坞注入=弹 scope 卡：角色单选+对话多选+文档库范围树选）。
   *  缺省=confirmStatusScope 工具在池但执行期如实报不可用。 */
  confirmStatusScope?: XingyiStatusScopeConfirm
  /** Codex 订阅桥原生生图接缝。缺省不装配，避免没有执行后端时让模型误以为自己能画图。 */
  imageGeneration?: Omit<XingyiImageGenerationContext, 'onGenerated'>
  /** Codex 订阅桥原生联网搜索接缝。缺省不装配；接缝在场时作为 common tool 首轮直接下发 schema。 */
  webSearch?: XingyiWebSearchContext
  /** 创建会话、设置头像与读取头像接缝；写头像图片来自本轮附件，读头像图片由 harness 临时注入下一轮视觉输入。 */
  conversationAvatar?: XingyiConversationAvatarProvider
  /** 已有会话成员增删接缝；读取并替换正式 participants，不维护平行成员真值。 */
  conversationMembers?: XingyiConversationMemberProvider
  /** 过程轨回调（工具开始/结果/思考），浮坞用来渲染"星依在干嘛"。 */
  onProgress?: (event: AgentRuntimeProgressEvent) => void
  /** 星依先向用户报进度、随后继续执行时，把这句立即送入同一对话并持久化。 */
  onIntermediateMessage?: (message: { content: string; turnIndex: number }) => void | Promise<void>
  /** 当前对话已保存的 runtime TODO；停止后补充消息时原样续接，显式新对话不传。 */
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  /** 当前对话已通过 toolsearch 激活的业务工具；runtime 会重新与真实 registry 取交集。 */
  initialDeferredActiveTools?: readonly string[]
  /** 当前对话经 toolsearch 激活的业务工具集合发生变化时同步保存。 */
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  /** 当前对话的 runtime TODO 快照；宿主只负责展示，不解析模型文本猜进度。 */
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  /** 星依自己派出的跨会话子 Agent 控制面。 */
  subagentControl?: AgentSubagentControlCapability
  signal?: AbortSignal
  budget?: { maxTurns?: number; maxToolCalls?: number }
}

export interface RunXingyiAgentResult {
  /** 给用户看的最终回复（自然文本）。 */
  reply: string
  terminalReason: string
  /** 本轮 generateImage 工具真实生成并已登记的图片；由浮坞挂到最终 assistant 消息附件。 */
  attachments: ChatImageAttachment[]
}

/** 「模型思考」工作流时间线行标签（耗时归因错位修复·2026-07-12）：与 subagentLoop.ts 同一字面量，改动两处同步。 */
const XINGYI_TIMELINE_MODEL_THINKING_LABEL = '模型思考'

/** 明确的公网操作意图必须落成真实 searchWeb 调用，不能只靠模型“有搜索欲望”。
 *  冷门/时效/重大主张仍由常驻纲领和工具 brief 判断；这里只锁用户已经说清楚的公网请求。 */
export function shouldRequireXingyiWebSearch(userText: string): boolean {
  const text = String(userText || '').trim()
  if (!text) return false
  if (/(?:不要|别|不用|无需|禁止)\s*(?:再\s*)?(?:联网|上网|网上搜|查网页|打开网页)/i.test(text)) return false
  const webAction = /(?:联网|上网)\s*(?:搜索|搜(?!索)|查找|查(?!找)|检索|找|看看|看一下|看)(?!\s*的?\s*(?:能力|功能|工具|入口|实现|代码|欲望|问题|为什么|怎么))|(?:网上|网络上)\s*(?:搜|查|找)|(?:搜索|检索|查找|打开|浏览)\s*(?:一下|下|这个|该)?\s*(?:网页|网站|网址|链接)|web\s*search|browse\s+(?:the\s+)?web|look\s+it\s+up\s+online/i
  if (webAction.test(text)) return true
  return /https?:\/\/\S+/i.test(text)
    && /(?:打开|查看|看看|阅读|访问|分析|总结|搜索|检索|查找)/i.test(text)
}

/** 把 toolsearch 越权话术拼进首条 system 消息。
 *  联动标注：与 useChatSendPipeline.ts 的 withToolsearchOverrideProtocol 是同一逻辑（那处是模块私有函数无法复用）；
 *  若用户要求统一修改越权话术注入方式，两处要同步改。 */
function withXingyiToolsearchProtocol(
  messages: AgentRuntimeMessage[],
  toolCatalog: Array<{ name: string; brief: string; recommended: boolean }> | undefined
): AgentRuntimeMessage[] {
  const block = buildToolsearchOverrideProtocol(toolCatalog)
  if (!block) return messages
  const systemIndex = messages.findIndex((message) => message.role === 'system')
  if (systemIndex < 0) return messages
  return messages.map((message, index) => (
    index === systemIndex ? { ...message, content: `${message.content}\n\n${block}` } : message
  ))
}

/** 通道A·当轮原生图（输入框图片上传计划批5）：把「当轮真实用户消息」的 content 从纯文本升级为
 *  parts 数组（text part 追加 formatAttachmentNote + 每图一个 image_url part）。
 *
 *  ⚠️ 不复用批4 chatAttachments.ts::upgradeCurrentUserMessageWithAttachments 的「找最后一条 role:'user'
 *  消息」启发式——那是给一次性 prompt 组装（useAI.ts::callAI/callAIStream）设计的，星依走的是多轮工具循环
 *  （runAgentRuntime），continuationGate 续做提示等 hook 也会在循环中途注入新的 role:'user' 消息，多轮后
 *  「最后一条 user」会漂到续做提示上而不是真实用户输入。改用「构造时就确定、全程不变」的固定下标定位——
 *  = 1 个 system + history.length，assistant/tool_call/续做提示都只会 push 到它后面，不会插到前面
 *  （agentRuntime/runtime.ts 内部全程只 push，无 unshift/splice-at-start）。
 *
 *  每轮 callModel 都对 turnMessages 的全新快照（messages.map(m=>({...m}))）做这一步、生成的 parts 数组
 *  只用于「发给模型的这一份」，从不写回 runAgentRuntime 内部 messages（callModel 返回值只有
 *  {content, toolCalls}）——runtime 自身的 messages/history 永远保持 string，parts 不因续轮累加或复制。 */
function upgradeXingyiCurrentUserMessage(
  messages: AgentRuntimeMessage[],
  targetIndex: number,
  attachments: ChatImageAttachment[] | null | undefined
): XingyiOrchestratorMessage[] {
  const list = Array.isArray(attachments) ? attachments : []
  const target = messages[targetIndex]
  if (!list.length || !target || target.role !== 'user') return messages
  const parts: AIContentPart[] = [
    { type: 'text', text: `${target.content}${formatAttachmentNote(list)}` },
    ...list.map((attachment): AIContentPart => ({ type: 'image_url', image_url: { url: attachment.url } }))
  ]
  return messages.map((message, index) => (index === targetIndex ? { ...message, content: parts } : message))
}

/**
 * viewAvatar 的图片只进入紧随工具结果的这一轮模型请求：不写 runtime/history，不把 data URI 放进工具正文，
 * 也不在后续轮反复携带。每张图片前放目标标签，保证多头像同轮读取时模型不会把归属看串。
 */
function appendXingyiAvatarViews(
  messages: XingyiOrchestratorMessage[],
  images: XingyiReadableAvatarImage[]
): XingyiOrchestratorMessage[] {
  if (!images.length) return messages
  const parts: AIContentPart[] = [
    { type: 'text', text: '【刚读取的正式头像原图】请直接观察下面图片；每张图前的标签就是其正式归属。\n' }
  ]
  for (const image of images) {
    parts.push({ type: 'text', text: `\n${image.label}\n` })
    parts.push({ type: 'image_url', image_url: { url: image.dataUrl } })
  }
  return [...messages, { role: 'user', content: parts }]
}

export async function runXingyiAgent(input: RunXingyiAgentInput): Promise<RunXingyiAgentResult> {
  const retrievalContext = input.retrievalContext ?? createTidiaoDocLibraryRetrievalContext({})
  const generatedAttachments: ChatImageAttachment[] = []
  const pendingAvatarViews: XingyiReadableAvatarImage[] = []
  let hasReadRelationHintSkill = false
  const relationHintSkillAccess = {
    hasRead: () => hasReadRelationHintSkill,
    markRead: () => { hasReadRelationHintSkill = true }
  }
  // 工具池 = 只读取料三件套（批次1）+ 功能工具四件（批次2/2.5·写操作全过 confirmWrite 确认门；
  //   editUnitCompilePage 已于 2026-07-11 迁入单位工具九件套·页面无关）
  // + 指挥提调四件（批次3b·tidiaoDispatch 接缝在场才装配：会话定位两只读 + dispatch 写 + searchDirectorMemory）
  // + 角色人格两件（批次4·personality 接缝在场才装配：性格校准 + 训练出题，自包含直挂）
  const tools = [
    createRecallSemanticTool({ retrievalContext }),
    createSearchWorldTextTool({ retrievalContext }),
    createFetchUnitDetailTool({ retrievalContext }),
    ...createXingyiKnowledgeTools(),
    createReadXingyiDocLibraryEditingSkillTool(),
    createReadXingyiRelationHintSkillTool(relationHintSkillAccess),
    ...createXingyiFunctionTools({
      ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
      hasReadRelationHintSkill: relationHintSkillAccess.hasRead
    }),
    // 状态系统四件套（积木骨架计划批次3）：自包含直挂——会话上下文读 chatSummary 桥、写路径 chatRepository 真值直写，
    // 不需要浮坞额外接缝；confirmWrite 统一取顶层同一道确认门。
    ...createXingyiStatusSystemTools({
      ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
      // 批次3：显式会话解析器在场则透传，让状态工具能按 session 参数操作非活动会话。
      ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
    }),
    // 读/搜对话投影两件套（取料闭环计划批次1）：只读、自包含——会话上下文读 chatSummary 桥、
    // 数据源 fetchChatPersonalityModelObservationsBySessionId 只读拉取（批次3 加 session 覆盖需 resolveSessionContext）。
    ...createXingyiProjectionTools({
      ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
    }),
    // 读角色大脑（取料闭环计划批次2·characterBrain 接缝在场才装配）：只读、星依管理专用。
    ...(input.characterBrain ? createXingyiCharacterBrainTools({ provider: input.characterBrain }) : []),
    ...(input.characterGroups ? createXingyiCharacterGroupTools({
      provider: input.characterGroups,
      ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
    }) : []),
    ...(input.batchCharacters ? createXingyiBatchCharacterTools({
      provider: input.batchCharacters,
      ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
    }) : []),
    // 询问用户做选择（内核统一批·批C）：始终装配——让模型知道"拿不准可以问用户"；askUser 通道缺省缺失时执行期如实报不可用。
    ...createXingyiAskUserTools({ ...(input.askUser ? { askUser: input.askUser } : {}) }),
    ...(input.imageGeneration
      ? createXingyiImageGenerationTools({
          ...input.imageGeneration,
          onGenerated: (attachment) => { generatedAttachments.push(attachment) }
        })
      : []),
    ...(input.webSearch ? [createXingyiWebSearchTool(input.webSearch)] : []),
    ...(input.conversationAvatar
      ? createXingyiConversationAvatarTools({
          provider: input.conversationAvatar,
          listImages: () => [
            ...(input.attachments || []).map((attachment) => ({
              id: attachment.id,
              url: attachment.url,
              label: attachment.originalName || '用户上传图片',
              source: 'user' as const
            })),
            ...generatedAttachments.map((attachment) => ({
              id: attachment.id,
              url: attachment.url,
              label: attachment.originalName || '星依生成图片',
              source: 'generated' as const
            }))
          ],
          onAvatarViewed: (image) => {
            if (pendingAvatarViews.length >= 4) return false
            pendingAvatarViews.push(image)
            return true
          },
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
        })
      : []),
    ...(input.conversationMembers
      ? createXingyiConversationMemberTools({
          provider: input.conversationMembers,
          ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {}),
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
        })
      : []),
    // 建状态栏前确认取料范围（2026-07-09）：始终装配——软约束靠纲领要求先调；confirmStatusScope 通道缺省缺失时执行期如实报不可用。
    ...createXingyiStatusScopeTools({ ...(input.confirmStatusScope ? { confirmStatusScope: input.confirmStatusScope } : {}) }),
    ...(input.curtainScene
      ? [createXingyiCurtainSceneTool({
          ...input.curtainScene,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
        })]
      : []),
    ...(input.tidiaoDispatch
      ? createXingyiTidiaoDispatchTools({
          ...input.tidiaoDispatch,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
        })
      : []),
    ...(input.scriptwriterDispatch
      ? [createXingyiDispatchScriptwriterTool({
          ...input.scriptwriterDispatch,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
          ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
        })]
      : []),
    ...(input.zaoceStatusDesign
      ? [createXingyiDispatchZaoceStatusDesignTool({
          ...input.zaoceStatusDesign,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
          ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
        })]
      : []),
    // 派绘舆/地图管理四件套（地图系统批6+世界寻址+删除·mapWork 接缝在场才装配）：session 参数复用同一套
    // resolveSessionContext，缺省=当前活动会话（与状态系统/投影两件套同口径）；listWorlds/readWorldMap
    // 与 deleteMapFeatures 同一接缝在场即一并装配——读、画、删共享同一世界寻址真值，不另开旁路。
    ...(input.mapWork
      ? [
          createXingyiDispatchMapWorkTool({
            ...input.mapWork,
            ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
          }),
          createXingyiListWorldsTool(input.mapWork),
          createXingyiReadWorldMapTool({
            ...input.mapWork,
            ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
          }),
          createXingyiDeleteMapFeaturesTool({
            ...input.mapWork,
            ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
            ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
          })
        ]
      : []),
    // 派采风钻探（地图严谨协作与运行卡计划批2·research 接缝在场才装配）：session 参数同口径复用同一套
    // resolveSessionContext，缺省=当前活动会话（与 mapWork/状态系统/投影两件套同口径）。
    ...(input.research
      ? [createXingyiDispatchResearchTool({
          ...input.research,
          ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
        })]
      : []),
    ...(input.personality
      ? createXingyiPersonalityTools({
          ...input.personality,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {})
        })
      : []),
    ...(input.unitCrud
      ? createXingyiUnitCrudTools({
          ...input.unitCrud,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
          hasReadRelationHintSkill: relationHintSkillAccess.hasRead
        })
      : []),
    // 读用户日记两件（2026-07-18 星依读日记批·diary 接缝在场才装配）：全只读——「日记是什么、
    // 什么时候该读」写在工具 brief 里恒在星依视野内，读不读由模型自行判断，不往每轮上下文塞日记内容。
    ...(input.diary ? createXingyiDiaryReadTools() : []),
    // 用户资料读取 + 马甲四件套（aliasManage 接缝在场才装配）：读用户资料/读马甲/建改/删/切换；
    // confirmWrite 统一取顶层同一道确认门，session 定位复用同一个 resolveSessionContext。
    ...(input.aliasManage
      ? createXingyiAliasTools({
          ...input.aliasManage,
          ...(input.confirmWrite ? { confirmWrite: input.confirmWrite } : {}),
          ...(input.resolveSessionContext ? { resolveSessionContext: input.resolveSessionContext } : {})
        })
      : [])
  ]
  const toolRegistry = new ToolRegistry(tools)
  const xingyiToolSupply = resolveAgentRuntimeToolSupply('xingyi.global', toolRegistry)
  const xingyiSkillSupply = await assembleAgentSkillSupply({
    profileId: 'xingyi.global',
    ...(input.skillActivations ? { activations: input.skillActivations } : {})
  })
  // 历史消息带原生图（输入框图片上传计划批5）：一律不带原生图（省 token，当轮才带）——附件读
  // readMessageAttachments（键名统一探测口径）后转 formatAttachmentNote 纯文字追加，content 仍是 string。
  const historyMessages = input.history ?? []
  const agentContextBlock = String(input.agentContextBlock || '').trim()
  const charterWithSkillCatalog = [
    XINGYI_CHARTER,
    xingyiSkillSupply.layers['1'] ? `【1·可调用资料】\n${xingyiSkillSupply.layers['1']}` : ''
  ].filter(Boolean).join('\n\n')
  const systemContent = agentContextBlock
    ? `${charterWithSkillCatalog}\n\n【统一原始可见上下文】\n${agentContextBlock}`
    : charterWithSkillCatalog
  const activatedSkillMessage = xingyiSkillSupply.layers['4']
    ? { role: 'user' as const, content: `【4·已读资料】\n${xingyiSkillSupply.layers['4']}` }
    : null
  const messages: AgentRuntimeMessage[] = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((message): AgentRuntimeMessage => ({
      role: message.role,
      content: `${message.content}${formatAttachmentNote(readMessageAttachments(message))}`
    })),
    ...(activatedSkillMessage ? [activatedSkillMessage] : []),
    { role: 'user', content: input.userText }
  ]
  // 当轮真实用户消息的固定下标（system + history + 可选层4 Skill 正文）：见 upgradeXingyiCurrentUserMessage 注释。
  const currentUserMessageIndex = 1 + historyMessages.length + (activatedSkillMessage ? 1 : 0)

  // 连续工作护栏（内核统一批·共享内核 createEmptyTurnContinuationGate）：星依空转一轮（没调任何工具）
  // 但正文还在说「接下来我去做 X」时，注入续做提示并续轮，让它一口气把多步任务做完再回复；限次防死循环。
  const continuationGate = new HookRegistry([
    createEmptyTurnContinuationGate({
      id: 'xingyi-continuation-gate',
      maxNudges: 3,
      isFinished: (event) => !isAgentTurnUnfinished(String(event.modelMessage?.content ?? '')),
      buildNudge: () => '你这一步只说了话，没有真正调用任何工具。如果你还有没做完的事（比如你刚说要去读消息/核对/继续建状态栏/接着做下一步），'
        + `就现在直接调用对应的工具去做，一步步做完，不要只说「稍等/接下来我去做」就停下——${TOOL_CALL_REALITY_RULE}`
        + '如果确实全部做完了，就正常给用户最终答复（这一步不用再调工具）。'
    })
  ])

  const runtimeVersion = 'agent-runtime-batch1'
  const journalPreparation = await prepareAgentRuntimeJournalForHarness({
    profileId: 'xingyi.global',
    runtimeVersion,
    traceIds: [XINGYI_AGENT_NAME]
  })
  const runtimeResult = await runAgentRuntime({
    agentName: XINGYI_AGENT_NAME,
    runtimeVersion,
    messages,
    contextPressure: buildAgentRuntimeContextPolicy({
      scope: 'xingyi.global',
      runId: journalPreparation.runId,
      goal: input.userText,
      messages
    }),
    ...(journalPreparation.journal ? { journal: journalPreparation.journal } : {}),
    toolRegistry,
    hookRegistry: continuationGate,
    initialActiveTools: xingyiToolSupply.initialActiveTools,
    recommendedTools: xingyiToolSupply.recommendedTools,
    deferredToolMode: xingyiToolSupply.deferredToolMode,
    toolSupplyDiagnostics: xingyiToolSupply.diagnostics,
    promptSupplyTrace: xingyiSkillSupply.trace,
    // 正式星依默认不设固定回合/业务工具次数；TODO 未清零就继续。
    // 显式 budget 只供测试或确有外部成本边界的调用方，用户中止、等待用户与真实阻断仍按各自终态收束。
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    ...(input.onIntermediateMessage ? { onIntermediateMessage: input.onIntermediateMessage } : {}),
    ...(input.initialTaskTodo !== undefined ? { initialTaskTodo: input.initialTaskTodo } : {}),
    ...(input.initialDeferredActiveTools
      ? { initialDeferredActiveTools: input.initialDeferredActiveTools }
      : {}),
    ...(input.onDeferredActiveToolsChange
      ? { onDeferredActiveToolsChange: input.onDeferredActiveToolsChange }
      : {}),
    ...(input.onTaskTodoChange ? { onTaskTodoChange: input.onTaskTodoChange } : {}),
    ...(input.subagentControl ? { subagentControl: input.subagentControl } : {}),
    callModel: async ({ messages: turnMessages, toolBriefs, toolCatalog, turnIndex }) => {
      const protocolMessages = withXingyiToolsearchProtocol(turnMessages, toolCatalog)
      // 通道A·当轮原生图升级放在这里（不走 useAI.ts 的 currentAttachments 选项——批4只给 callAIWithTools
      // 挂了类型没做实现，星依走的正是 callAIWithTools，传了也会被静默忽略）：每轮都对 protocolMessages
      // 的新快照重做一次，parts 数组只存在于这一次 callOrchestrator 调用里，见函数注释。
      const messagesWithCurrentAttachments = upgradeXingyiCurrentUserMessage(protocolMessages, currentUserMessageIndex, input.attachments)
      const avatarViews = pendingAvatarViews.splice(0, pendingAvatarViews.length)
      const sentMessages = appendXingyiAvatarViews(messagesWithCurrentAttachments, avatarViews)
      const requiresWebSearch = turnIndex === 0
        && shouldRequireXingyiWebSearch(input.userText)
        && toolBriefs.some((tool) => tool.name === 'searchWeb')
      // 工作流时间线归因修复（2026-07-12·与 subagentLoop.ts trackedCallModel 同构）：轮标记 + 「模型思考」
      // 未定行必须在真正发起模型调用之前打（onProgress 首事件在模型调用**结束后**才发，靠它打轮标记会
      // 把耗时错位记进下一轮），调用结束/抛错后落定。
      markXingyiTurnIfNew(turnIndex)
      appendXingyiTurnStreamEntry({ kind: 'tool', label: XINGYI_TIMELINE_MODEL_THINKING_LABEL })
      try {
        const result = await input.callOrchestrator({
          messages: sentMessages,
          toolBriefs,
          toolCatalog,
          ...(requiresWebSearch
            ? { toolChoice: { type: 'function' as const, function: { name: 'searchWeb' } } }
            : {}),
          turnIndex
        })
        settleXingyiTurnStreamTool(XINGYI_TIMELINE_MODEL_THINKING_LABEL, 'success')
        return { content: result?.content ?? '', toolCalls: result?.toolCalls ?? [] }
      } catch (error) {
        settleXingyiTurnStreamTool(XINGYI_TIMELINE_MODEL_THINKING_LABEL, 'error')
        throw error
      }
    }
  })
  const { transcript } = runtimeResult

  return {
    reply: extractAgentRuntimeReply(runtimeResult),
    terminalReason: transcript.terminalReason,
    attachments: generatedAttachments
  }
}
