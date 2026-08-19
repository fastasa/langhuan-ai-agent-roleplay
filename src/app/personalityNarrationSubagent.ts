import { runAgentRuntime, type AgentRuntimeMessage, type ParsedAgentModelOutput } from './agentRuntime/runtime'
import { buildAgentRuntimeContextPolicy } from './agentRuntimeContextPolicy'
import { prepareAgentRuntimeJournalForHarness } from './agentRuntimeJournalPolicy'
import type { AgentRuntimeHistoryMessage, AgentTranscript, ToolCallMessage } from './agentRuntime/types'
import { type BuiltinNarrationKind, type NarrationProfile } from './narrationProtocol'
// R1-B B5-2 item2c：旁白两件套解耦——buildNarrationBusinessContext 产出统一接缝（工具定义已迁全局 tidiaoGlobalTools·读本接缝）。
import type { TidiaoNarrationContext } from './tidiaoToolBusinessContext'
// R1-B 旁白降格方案A：旁白 subagent 退役自建 createNarrationToolKit，改走单一全局池 + 统一接缝（与导演/演员/编辑 loop 同源）。
// 良性循环 import：tidiaoGlobalTools 反向 import 本文件的 normalizeScore 等纯函数（hoisted）；单例/常量仅在函数体调用时访问。
import { createReadNarrationSkillTool, createConfirmNarrationCallTool } from './tidiaoGlobalTools'
import { ToolRegistry } from './agentRuntime/toolRegistry'
import { assembleAgentSkillSupply, resolveAgentRuntimeToolSupply } from './agentSupply'
// 旁白 generatedPrompt 编写指南（四处共用同一份）已收进 agentProtocols 集中目录（用户 2026-06-29），此处只引用。
import { NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE } from './agentProtocols'
import { DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL } from './directorDirective'

type CallModel = (request: {
  messages: AgentRuntimeMessage[]
  history: AgentRuntimeHistoryMessage[]
  activeTools: string[]
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  turnIndex: number
}) => Promise<unknown> | unknown

export interface PersonalityNarrationSubagentProfile {
  id: string
  name: string
  triggerDescription: string
  content: string
}

export interface PersonalityNarrationSubagentInput {
  characterName?: string
  scenario?: string
  compressedContext: string
  currentUserInput?: string
  sceneChangeNotice?: string
  forceNarration?: boolean
  forcedNarrationNotice?: string
  /** 方案 B：提调整轮统筹 pass 给本轮旁白的方向（真注入旁白生成）——subagent 据此 + 选中 skill 写本轮旁白提示词。 */
  roundNarrationDirective?: string
  /** D5：用户私密提调指令【【…】】（只管本轮·只给提调看）。旁白 subagent 是提调旁白臂，要据此调整旁白方向，
   *  但绝不能把指令文字/含义写进 generatedPrompt 或旁白正文。与单聊对齐（单聊旁白决策在指令可见的编排器 loop 内）；
   *  群聊统筹失败/兜底时这是旁白唯一的指令影响来源，消除「兜底本轮旁白无注入」的半失效面。缺省=无私密指令。 */
  userDirectorDirectives?: string[]
  profiles: PersonalityNarrationSubagentProfile[]
  maxCalls?: number
  signal?: AbortSignal
  callModel: CallModel
}

/** 旁白插入锚点（2026-07-06 旁白穿插·用户拍板「旁白不必总在开头」）：
 *  round_start=开场（用户消息后·所有角色回复前·缺省）；after_speaker=紧跟锚点角色本轮最后一条消息之后
 *  （生成时能看到该角色实际说了什么——用于承接其言行、引入变数、人物进退场）；round_end=本轮收尾
 *  （最后一条角色消息之后）。锚点角色最终没发言时管线兜底改在轮末生成（不丢提调安排的剧情内容）。 */
export interface PersonalityNarrationPlacement {
  anchor: 'round_start' | 'after_speaker' | 'round_end'
  /** anchor=after_speaker 时的锚点角色（characterId 是真值·name 只作展示）。 */
  speakerCharacterId?: string
  speakerName?: string
}

export interface PersonalityNarrationCall {
  profileIds: string[]
  profileNames: string[]
  narrationKind: BuiltinNarrationKind
  /** 批次2 二分类语义标注（§4.4，仅作标注供审计与角色承接判断，本批不做串/并行性能分流）：
   *  true=信息承载（引入角色需据此反应的新信息）；false=纯描写（仅烘托环境/氛围/外貌速写）。
   *  保守判定：拿不准算信息承载（默认 true）。串行承接落地见批次3。 */
  informationBearing: boolean
  reason: string
  score: number
  generatedPrompt: string
  /** 旁白穿插（2026-07-06）：插入锚点。缺省=round_start（开场·与历史行为一致）。
   *  统筹轮由 confirmNarrationCall.insertAfter 经 resolveInsertAfter 解析写入；纠偏轮不用本字段
   *  （纠偏楼层引用另走 TidiaoCorrectionNarrationPlacement·两套锚点语义不混）。 */
  placement?: PersonalityNarrationPlacement
}

/** 旁白穿插：round_start 子集判定（缺省/未知锚点都算开场·与历史行为一致）。
 *  管线首发言者一次性起跑只吃本子集；after_speaker/round_end 走轮级穿插 flush（useChatSendPipeline）。 */
export function isRoundStartNarrationCall(call: Pick<PersonalityNarrationCall, 'placement'>): boolean {
  const anchor = call.placement?.anchor
  return anchor !== 'after_speaker' && anchor !== 'round_end'
}

/** 旁白穿插：按锚点从待生成队列里取本段该生成的旁白。speakerCharacterId 非空=只取锚在该角色之后的
 *  after_speaker 子集；null=轮末段（round_end 子集 + 锚点角色最终没发言的 after_speaker 兜底全收）。
 *  纯函数，供 useChatSendPipeline flushRoundInterleavedNarration 用（可单测·联动能力）。 */
export function partitionInterleavedNarrationCalls<T extends Pick<PersonalityNarrationCall, 'placement'>>(
  pending: T[],
  speakerCharacterId: string | null
): { matched: T[]; rest: T[] } {
  const matched: T[] = []
  const rest: T[] = []
  for (const call of Array.isArray(pending) ? pending : []) {
    const isMatch = speakerCharacterId
      ? call.placement?.anchor === 'after_speaker' && call.placement?.speakerCharacterId === speakerCharacterId
      : true
    if (isMatch) matched.push(call)
    else rest.push(call)
  }
  return { matched, rest }
}

/** 旁白穿插：统筹轮 insertAfter 锚点解析器工厂（candidates=本轮出场候选）。纯函数、供 groupDirectorHarness
 *  装配进 TidiaoNarrationContext.resolveInsertAfter；错误文案带可用清单（模型能一次修正）。 */
export function buildDirectorNarrationInsertAfterResolver(
  candidates: Array<{ characterId: string; name: string }>
): (raw: string) => { placement?: PersonalityNarrationPlacement; error?: string } {
  const list = Array.isArray(candidates) ? candidates : []
  return (raw: string) => {
    const text = String(raw || '').trim()
    if (!text) return {}
    if (text === '开场' || text === '开头' || text === 'round_start') return { placement: { anchor: 'round_start' } }
    if (text === '收尾' || text === '结尾' || text === '轮末' || text === 'round_end') return { placement: { anchor: 'round_end' } }
    const hit = list.find((c) => c.characterId === text || c.name === text)
    if (hit) return { placement: { anchor: 'after_speaker', speakerCharacterId: hit.characterId, speakerName: hit.name } }
    return {
      error: `insertAfter 锚点「${text}」对不上本轮出场候选；可用：开场、收尾、或某个候选角色（${list.map((c) => `${c.characterId}（${c.name}）`).join('、') || '无候选'}），请修正后重发`
    }
  }
}

export interface PersonalityNarrationSubagentResult {
  calls: PersonalityNarrationCall[]
  transcript: AgentTranscript
  /** calls 为空时模型给出的「本轮不插入旁白」理由；过程轨旁白步对外展示用。 */
  skipReason: string
}

/**
 * 信息承载旁白串行先行排序（单聊导演 loop 与群聊 per-speaker subagent 共用·联动能力）：
 * informationBearing!==false（保守默认 true）的「信息承载」旁白排前，需先生成+落投影，
 * 让同轮角色回复能承接其投影；informationBearing===false 的「纯描写」旁白排后、可随后台并行不拖慢。
 * 返回 ordered（按先行→后置排好的全量 calls）+ infoBearingCount（信息承载条数，作串行闸门计数上限）。
 * 纯函数（无副作用），供 useChatSendPipeline 单聊 startDirectorNarrationCompletion / 群聊 narration subagent completion 段共用——
 * 任一处调整串行口径时务必同步另一处。 */
export function orderNarrationCallsInfoBearingFirst<T extends { informationBearing?: boolean }>(
  calls: T[]
): { ordered: T[]; infoBearingCount: number } {
  const list = Array.isArray(calls) ? calls : []
  const infoBearing = list.filter((call) => call.informationBearing !== false)
  const pureDescriptive = list.filter((call) => call.informationBearing === false)
  return { ordered: [...infoBearing, ...pureDescriptive], infoBearingCount: infoBearing.length }
}

interface ConfirmNarrationCallArgs {
  profileId?: string
  profileIds?: unknown[]
  profile_ids?: unknown[]
  narrationKind?: string
  narration_kind?: string
  informationBearing?: unknown
  information_bearing?: unknown
  reason?: string
  score?: number
  generatedPrompt?: string
  generated_prompt?: string
}

interface ReadNarrationSkillArgs {
  profileId?: string
  profileIds?: unknown[]
  profile_ids?: unknown[]
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

// R1-B B5-2 item2c：旁白调用构造的纯归一 helper export 给全局工厂（tidiaoGlobalTools confirmNarrationCall execute 单向 import·单一真值源避漂移）。
export function normalizeScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0.8
  return Math.max(0, Math.min(1, num))
}

function parseJsonObjectLoose(output: unknown): Record<string, any> {
  if (output && typeof output === 'object' && !Array.isArray(output)) return output as Record<string, any>
  const raw = String(output ?? '').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return {}
    try {
      return JSON.parse(match[0])
    } catch {
      return {}
    }
  }
}

function normalizeProfiles(profiles: PersonalityNarrationSubagentProfile[]): PersonalityNarrationSubagentProfile[] {
  const seen = new Set<string>()
  return (Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile && toText(profile.id) && toText(profile.name))
    .filter((profile) => {
      const id = toText(profile.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
}

const BUILTIN_NARRATION_IDS = new Set(['environment', 'appearance', 'event_push'])

interface ProfileSelector {
  profile: PersonalityNarrationSubagentProfile
  /** 暴露给模型的简单 id：内置保留语义 id，自定义统一改成 custom1/custom2…，避免模型复制不动 narration_xxx 长串。 */
  selector: string
}

/** 给每个 profile 分配一个模型易抄的 selector：内置沿用 environment/appearance/event_push，自定义按出现顺序编号。 */
function assignProfileSelectors(profiles: PersonalityNarrationSubagentProfile[]): ProfileSelector[] {
  let customCount = 0
  return profiles.map((profile) => {
    const id = toText(profile.id)
    const selector = BUILTIN_NARRATION_IDS.has(id) ? id : `custom${++customCount}`
    return { profile, selector }
  })
}

/** 归一化 id 文本：忽略大小写、空白、下划线和连字符，吸收模型常见的格式抖动。 */
function normalizeRefKey(value: unknown): string {
  return toText(value).toLowerCase().replace(/[\s_\-]+/g, '')
}

/** 容错解析模型给的 profileId：按 selector / 真实 id / 名称 三路匹配，名称再做包含匹配，
 *  只有一个 skill 时任何写法都归到它——收敛模型臆造 default、传中文名、大小写不一致导致的读取失败。 */
function buildProfileRefResolver(selectors: ProfileSelector[]): (raw: unknown) => string | null {
  const exact = new Map<string, string>()
  for (const { profile, selector } of selectors) {
    exact.set(normalizeRefKey(selector), profile.id)
    exact.set(normalizeRefKey(profile.id), profile.id)
    const nameKey = normalizeRefKey(profile.name)
    if (nameKey) exact.set(nameKey, profile.id)
  }
  return (raw: unknown) => {
    const key = normalizeRefKey(raw)
    if (!key) return null
    const hit = exact.get(key)
    if (hit) return hit
    for (const { profile } of selectors) {
      const nameKey = normalizeRefKey(profile.name)
      if (nameKey && (nameKey.includes(key) || key.includes(nameKey))) return profile.id
    }
    if (selectors.length === 1) return selectors[0].profile.id
    return null
  }
}

/** 给模型看的可用 skill 列表提示：selector(名称)，错误信息和兜底引导都用它。 */
function formatAvailableProfiles(selectors: ProfileSelector[]): string {
  return selectors.map(({ profile, selector }) => `${selector}（${profile.name}）`).join('、')
}

function formatProfile(selector: string, profile: PersonalityNarrationSubagentProfile): string {
  return [
    `- id=${selector}`,
    `名称=${profile.name}`,
    `触发描述=${profile.triggerDescription || '未填写'}`
  ].filter(Boolean).join('；')
}

/** 导演 loop 旁白说明书（O-C2 修复，2026-06-20）：把「可用旁白 skill 清单 + profileId 用法」抽成单一真值，
 *  供轮级导演旁白决策（groupDirectorHarness/groupDirectorPass）复用——
 *  与独立 subagent 用同一套 assignProfileSelectors/formatProfile 逻辑，避免「导演模式没说明书 → 模型靠猜 profileId」。
 *  返回 available（可用清单：selector（名称）、…）+ detail（逐条 id/名称/触发描述）。入参 profiles 需已 normalize。 */
export function buildDirectorNarrationSkillGuide(profiles: PersonalityNarrationSubagentProfile[]): {
  available: string
  detail: string
} {
  const selectors = assignProfileSelectors(normalizeProfiles(profiles))
  return {
    available: formatAvailableProfiles(selectors),
    detail: selectors.map(({ profile, selector }) => formatProfile(selector, profile)).join('\n') || '无'
  }
}

// NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE（四处共用的旁白 generatedPrompt 编写指南）
// 已搬到 agentProtocols/narrationProtocols.ts（见顶部 import），改措辞去那里改。

/**
 * D5：用户私密提调指令在旁白 subagent 的禁泄露注入块。旁白是提调的旁白臂，要据私密指令调整旁白方向，
 * 但 generatedPrompt 会喂给不带禁泄露护栏的正文模型、旁白正文会展示给用户和角色，所以护栏由本块承担：
 * 只让指令影响「是否插旁白/聚焦什么/基调」，绝不让指令文字/含义现身于 generatedPrompt 或旁白正文。
 * 与单聊编排器的 buildUserDirectorDirectiveProtocol 同源语义（那处旁白决策在 loop 内、天然遵守），群聊旁白独立 subagent 故单列。
 * directives 为空时返回空串（调用处 filter 掉，不出现该块）。
 */
export function buildNarrationUserDirectiveProtocol(directives: string[] | undefined): string {
  const list = (Array.isArray(directives) ? directives : [])
    .map((item) => toText(item).trim())
    .filter((item) => item.length > 0)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')
  if (!list) return ''
  return [
    '【用户私密指令·只给提调看】用户本轮用双层方括号给提调下了只有你能看到的私密安排：',
    list,
    DIRECTOR_DIRECTIVE_HIGHEST_PRIORITY_PROTOCOL,
    '① 必须让这轮「是否插入旁白、旁白聚焦谁做什么、营造什么基调」完整落实私密安排，不能只口头确认或自行稀释。',
    '② 绝不能把这条指令的文字、含义或「用户下过私密指令」这件事写进 generatedPrompt 或旁白正文——旁白正文会展示给用户和角色、角色并不知情，只让它影响旁白方向，不让它现身于任何文字。'
  ].join('\n')
}

export function buildPersonalityNarrationSubagentMessages(input: Omit<PersonalityNarrationSubagentInput, 'callModel' | 'signal'>): AgentRuntimeMessage[] {
  const maxCalls = Math.max(1, Math.min(3, Math.round(Number(input.maxCalls || 2) || 2)))
  const profiles = normalizeProfiles(input.profiles)
  const selectors = assignProfileSelectors(profiles)
  const forceNarration = input.forceNarration === true
  return [
    {
      role: 'system',
      content: [
        '你是人格模型回复链路里的旁白陪跑 subagent。',
        '你的任务不是写旁白正文，而是先判断是否值得插入少量旁白，再读取相关旁白 skill，最后给正式旁白生成链路写一段生成提示词。',
        '工具顺序固定：先调用 readNarrationSkill 读取一个或多个旁白 skill；确认需要生成时，再调用 confirmNarrationCall，并把你写好的 generatedPrompt 交给外层生成链路。',
        '不要直接输出旁白正文，不要替角色回复，不要解释工具协议。',
        forceNarration
          ? `本轮会话帷幕时间或地点已经按用户意图被修改；你必须至少确认 1 个旁白，最多确认 ${maxCalls} 个旁白，用来让用户读到这个变化。`
          : `最多确认 ${maxCalls} 个旁白。若当前上下文没有值得插入的旁白，输出 {"done":true,"toolCalls":[],"reason":"..."}，reason 必填：用一句话写出基于当前上下文的具体判断依据（例如哪段对话还在原地推进、缺少什么可承接的变化），不要写空泛套话。`,
        '优先选择能承接时间地点跳转、环境变化、人物状态、外部动静或信息停滞的旁白；不要为了凑数插入空泛氛围。',
        '事件推进旁白必须有可承接的新变化；环境和人物描写只能补空间、气氛、姿态和可见状态，不得替用户或主要角色做决定或说话。',
        '每次 confirmNarrationCall 都要判定本段旁白的二分类并用 informationBearing 标注：信息承载（informationBearing=true）= 引入角色需要据此反应的新信息（如出现新人物、新动静、关键变化）；纯描写（informationBearing=false）= 只烘托环境、氛围或外貌速写、不引入角色必须反应的新信息。拿不准时一律按信息承载处理（informationBearing 省略或填 true）。',
        '只允许读取下方列出的 skill：profileId 优先逐字使用列表里 id= 后面的值（例如 id=environment 就传 "environment"，id=custom1 就传 "custom1"），不存在 default、auto 之类的通用 id；若一时拿不准，也可以直接填该 skill 的名称。',
        NARRATION_GENERATED_PROMPT_AUTHORING_GUIDE
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `当前回复角色：${toText(input.characterName) || '未知'}`,
        `已判定情境：${toText(input.scenario) || '未记录'}`,
        input.sceneChangeNotice ? `场景变化提醒：\n${input.sceneChangeNotice}` : '',
        forceNarration && input.forcedNarrationNotice ? `强制旁白原因：\n${input.forcedNarrationNotice}` : '',
        // 方案 B：提调本轮统筹给旁白的方向，作为「写什么」的导演指导（仍要结合选中 skill 的写作要求生成本轮提示词）。
        toText(input.roundNarrationDirective) ? `本轮导演旁白安排（请据此方向 + 选中 skill 写本轮旁白提示词）：\n${toText(input.roundNarrationDirective)}` : '',
        // D5：用户私密提调指令（禁泄露护栏见上块）——据此调整旁白方向，绝不写进 generatedPrompt/旁白正文。
        buildNarrationUserDirectiveProtocol(input.userDirectorDirectives),
        '',
        '旁白 skill 触发描述：',
        selectors.map(({ profile, selector }) => formatProfile(selector, profile)).join('\n') || '无',
        '',
        '最近 8 条聊天投影与当前上下文：',
        input.compressedContext || '暂无上下文。',
        '',
        `当前用户输入：${toText(input.currentUserInput) || '无'}`
      ].filter(Boolean).join('\n')
    }
  ]
}

function parseSubagentOutput(output: unknown, turnIndex: number): ParsedAgentModelOutput {
  const parsed = parseJsonObjectLoose(output)
  const rawToolCalls = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : (Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [])
  const toolCalls: ParsedAgentModelOutput['toolCalls'] = []
  rawToolCalls.forEach((item: unknown, index: number) => {
    const record = item && typeof item === 'object' ? item as Record<string, any> : {}
    const toolName = toText(record.tool || record.name || record.toolName || record.tool_name)
    if (toolName !== 'confirmNarrationCall' && toolName !== 'readNarrationSkill') return
    const args = record.args && typeof record.args === 'object' ? record.args as Record<string, unknown> : record
    toolCalls.push({
      callId: toText(record.callId || record.call_id) || `personality_narration_${turnIndex + 1}_${index + 1}`,
      toolName,
      stage: toolName === 'readNarrationSkill' ? 'narration-skill-read' : 'narration-routing',
      args,
      expectation: toText(record.expectation),
      requestedAtTurn: turnIndex
    })
  })
  return {
    stage: rawToolCalls.some((item: unknown) => toText((item as Record<string, any>)?.tool || (item as Record<string, any>)?.name || (item as Record<string, any>)?.toolName || (item as Record<string, any>)?.tool_name) === 'readNarrationSkill')
      ? 'narration-skill-read'
      : 'narration-routing',
    done: parsed.done !== false,
    content: JSON.stringify(parsed),
    parsed,
    toolCalls
  }
}

/**
 * R1-B B5-2 item2c：旁白两件套统一接缝装配（旁白降格方案A 后唯一真值）。把 profileId 容错解析 / 可用清单 / 已读态 /
 * 确认收集态 / 预算 / 确认投影回调，组装成 TidiaoNarrationContext 喂给 ctx.business.narration——工具定义已迁全局
 * tidiaoGlobalTools（createReadNarrationSkillTool/createConfirmNarrationCallTool 读本接缝）。四处入口共用：群聊导演 /
 * 演员 / 编辑 loop（onConfirmed 承接各自的 noteNarrationShot / narrationPlacements wrapping）+ 旁白 subagent
 * （方案A 后亦走本接缝 + 全局池·无 onConfirmed·只收集 calls）。入参 profiles 需已 normalizeProfiles 且非空。
 */
export function buildNarrationBusinessContext(
  profiles: PersonalityNarrationSubagentProfile[],
  maxCalls: number,
  onConfirmed?: (call: PersonalityNarrationCall, args: Record<string, unknown>) => void,
  // 旁白穿插（2026-07-06）：统筹轮传 insertAfter 锚点解析器（buildDirectorNarrationInsertAfterResolver）；
  // 纠偏/演员/subagent loop 缺省不传——纠偏楼层引用仍走 onConfirmed args 自解析，零回归。
  resolveInsertAfter?: (raw: string) => { placement?: PersonalityNarrationPlacement; error?: string },
  // 分镜方向修改（2026-07-07）：reviseNarrationDirection 成功改写 generatedPrompt 后的投影副作用
  // （各 loop 承接 acc.reviseNarrationShotDirection）；缺省不传＝不注册该工具（旁白 subagent 独立路径不挂）。
  onRevised?: (call: PersonalityNarrationCall, index: number, reason: string) => void
): TidiaoNarrationContext {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  const selectors = assignProfileSelectors(profiles)
  const resolveProfileRef = buildProfileRefResolver(selectors)
  const availableHint = formatAvailableProfiles(selectors)
  return {
    resolveProfileIds: (args) => {
      const ids: string[] = []
      const unresolved: string[] = []
      for (const raw of normalizeProfileIdsFromArgs(args as ReadNarrationSkillArgs | ConfirmNarrationCallArgs)) {
        const hit = resolveProfileRef(raw)
        if (hit) {
          if (!ids.includes(hit)) ids.push(hit)
        } else {
          unresolved.push(raw)
        }
      }
      return { ids, unresolved }
    },
    availableHint,
    profileById: (id) => byId.get(id),
    readProfileIds: new Set<string>(),
    calls: [],
    maxCalls,
    ...(onConfirmed ? { onConfirmed } : {}),
    ...(resolveInsertAfter ? { resolveInsertAfter } : {}),
    ...(onRevised ? { onRevised } : {})
  }
}

/**
 * 强制旁白兜底工厂（O-C2 抽取，2026-06-20 旁白纳入 loop）：当本轮「强制旁白」但模型该确认却没确认时，
 * 据情境生成一条兜底旁白调用（generatedPrompt 把本轮场景变化/提调安排编进提示词，skill 本体仅作风格参考）。
 * 独立 subagent 与导演 loop harness 共用同一套兜底真值，避免两处各写一份漂移。profiles 需已 normalize；空则返回 null。
 */
export function buildForcedNarrationFallbackCall(
  profiles: PersonalityNarrationSubagentProfile[],
  opts: { forcedNarrationNotice?: string; sceneChangeNotice?: string; roundNarrationDirective?: string } = {}
): PersonalityNarrationCall | null {
  const fallbackProfile = chooseForcedNarrationProfile(profiles)
  if (!fallbackProfile) return null
  const forcedSceneNotice = toText(opts.forcedNarrationNotice || opts.sceneChangeNotice)
  // 方案 B：强制兜底也带上提调本轮旁白方向（真注入），不只承接场景变化。
  const directorDirective = toText(opts.roundNarrationDirective)
  return {
    profileIds: [fallbackProfile.id],
    profileNames: [fallbackProfile.name],
    narrationKind: normalizeConfirmedNarrationKind('', fallbackProfile),
    // 强制旁白用于承接帷幕时间/地点变化，属引入角色需反应的新信息 → 信息承载。
    informationBearing: true,
    reason: directorDirective || forcedSceneNotice || '帷幕时间或地点已经按用户意图改变，需要用旁白承接。',
    score: 1,
    generatedPrompt: [
      directorDirective ? `本轮提调对旁白的安排：${directorDirective}` : '本轮帷幕时间或地点已经按用户意图改变。',
      forcedSceneNotice ? `本轮场景变化：${forcedSceneNotice}` : '',
      '请据此写一段可直接写入聊天记录的旁白正文：',
      '写什么内容：承接最近一条聊天投影里刚发生的事，把这次时间/地点变化写成现场可感知的具体画面，不要只写“时间过去了/场景变了”这类空话。',
      '聚焦哪个角色：以最近在场、最受这次变化影响的角色为主，描写其可见姿态、神态与处境；不替任何角色说话或做决定。',
      '表达占比：环境与外部动静约 50%、人物可见神态约 35%、细节动作约 15%。',
      '文风与字数：与当前场景基调一致，调动声音/光影/温度/气味等至少两类感官，句式长短交错、不堆同一类词；这是填充在角色话语之间的大段旁白，分成多个自然段落层层铺陈，约 500–2000 字、据场景轻重浮动，不要压成一两句。',
      '边界：不要推翻已发生的事实，也不要暴露任何内部链路。'
    ].filter(Boolean).join('\n')
  }
}

export async function runPersonalityNarrationSubagent(input: PersonalityNarrationSubagentInput): Promise<PersonalityNarrationSubagentResult> {
  const skillSupply = await assembleAgentSkillSupply({ profileId: 'role_reply.personality-narration' })
  const profiles = normalizeProfiles(input.profiles)
  const maxCalls = Math.max(1, Math.min(3, Math.round(Number(input.maxCalls || 2) || 2)))
  if (!profiles.length) {
    return {
      calls: [],
      skipReason: '当前会话没有可用的旁白 skill。',
      transcript: {
        kind: 'agentTranscript',
        agentName: 'PersonalityNarrationSubagent',
        runtimeVersion: 'personality-narration-subagent-v1',
        initialActiveTools: [],
        promptSupplyTrace: [...skillSupply.trace],
        history: [],
        turns: [],
        budget: { maxTurns: 0, maxToolCalls: 0, usedTurns: 0, usedToolCalls: 0 },
        terminalReason: 'done'
      }
    }
  }
  // 接缝重构 Step1（2026-06-30·结构 pivot·行为不变）：旁白 subagent 启动时只调旁白两件套工厂建自己的工具集
  // （取代「引用全局工具单例 + B3 门控隐藏其余工具」）；统一接缝 buildNarrationBusinessContext 仍走 ctx.business.narration
  // （Step1 工厂暂无参·后续 Step 改闭包捕获）。聚焦 2 工具 pass·无需越权 → 不开 deferred（非延迟仅下发这两个带 schema）。
  const narrationCtx = buildNarrationBusinessContext(profiles, maxCalls)
  const calls = narrationCtx.calls
  const subagentMessages = buildPersonalityNarrationSubagentMessages({ ...input, profiles, maxCalls })
  const toolRegistry = new ToolRegistry([createReadNarrationSkillTool(narrationCtx), createConfirmNarrationCallTool(narrationCtx)])
  const toolSupply = resolveAgentRuntimeToolSupply('role_reply.personality-narration', toolRegistry)
  const runtimeVersion = 'personality-narration-subagent-v1'
  const journalPreparation = await prepareAgentRuntimeJournalForHarness({
    profileId: 'role_reply.personality-narration',
    runtimeVersion,
    traceIds: [input.characterName]
  })
  const runtimeResult = await runAgentRuntime({
    agentName: 'PersonalityNarrationSubagent',
    runtimeVersion,
    messages: subagentMessages,
    contextPressure: buildAgentRuntimeContextPolicy({
      scope: 'role_reply.personality-narration',
      runId: journalPreparation.runId,
      goal: input.currentUserInput || input.roundNarrationDirective || input.scenario,
      messages: subagentMessages
    }),
    ...(journalPreparation.journal ? { journal: journalPreparation.journal } : {}),
    toolRegistry,
    initialActiveTools: toolSupply.initialActiveTools,
    recommendedTools: toolSupply.recommendedTools,
    deferredToolMode: toolSupply.deferredToolMode,
    promptSupplyTrace: skillSupply.trace,
    toolSupplyDiagnostics: toolSupply.diagnostics,
    budget: { maxTurns: 3, maxToolCalls: maxCalls * 2 },
    signal: input.signal,
    callModel: input.callModel,
    parseModelOutput: parseSubagentOutput
  })
  if (input.forceNarration === true && calls.length === 0) {
    // 批次3 C / O-C2：强制兜底（模型该确认却没确认）统一走 buildForcedNarrationFallbackCall 工厂，
    // 让独立 subagent 与导演 loop harness 共用同一套「据情境生成」的兜底逻辑，不各写一份。
    const fallbackCall = buildForcedNarrationFallbackCall(profiles, {
      forcedNarrationNotice: input.forcedNarrationNotice,
      sceneChangeNotice: input.sceneChangeNotice,
      roundNarrationDirective: input.roundNarrationDirective
    })
    if (fallbackCall) calls.push(fallbackCall)
  }
  let skipReason = ''
  if (!calls.length) {
    skipReason = readNarrationSkipReason(runtimeResult.transcript)
    // 理由必须由模型自己写：协议要求 reason 必填，模型漏写时单独追问一轮补齐，不直接落内置兜底句。
    if (!skipReason) {
      skipReason = await askNarrationSkipReasonFollowUp(input.callModel, subagentMessages, runtimeResult.transcript)
    }
    // 读 skill 全部失败（如 profileId 不合法）导致没生成时，结论必须如实标注是读取失败，
    // 不能把"模型本想生成"的描述包装成正常的不生成判断——过程轨结论会误导排查。
    if (hasFailedSkillReadWithoutSuccess(runtimeResult.transcript)) {
      skipReason = `旁白 skill 读取失败（profileId 不合法，未读到任何旁白 skill），本轮未能生成旁白。模型原始说明：${skipReason || '未给出'}`
    }
  }
  return {
    calls,
    skipReason,
    transcript: runtimeResult.transcript
  }
}

/** 是否存在"读 skill 失败且整轮没有任何一次成功读取"：用于把 skip 结论如实标注为读取失败。 */
function hasFailedSkillReadWithoutSuccess(transcript: AgentTranscript): boolean {
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : []
  let failed = false
  for (const turn of turns) {
    const toolResults = Array.isArray(turn?.toolResults) ? turn.toolResults : []
    for (const result of toolResults) {
      if (String(result?.toolName || '').trim() !== 'readNarrationSkill') continue
      if (String(result?.status || '').trim() === 'success') return false
      failed = true
    }
  }
  return failed
}

/** 从 transcript 倒序取模型最后一次给出的 reason（不生成旁白时模型按协议必填）。 */
function readNarrationSkipReason(transcript: AgentTranscript): string {
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : []
  for (let i = turns.length - 1; i >= 0; i--) {
    const parsed = turns[i]?.modelMessage?.parsed as Record<string, unknown> | undefined
    const reason = toText(parsed?.reason ?? (parsed as Record<string, unknown> | undefined)?.skip_reason)
    if (reason) return reason
  }
  return ''
}

/** 模型判定不生成旁白却漏写 reason 时的补齐追问：带上原始任务与模型上一轮输出，只要一句具体理由。
 *  追问也失败时返回空串，由外层管线兜底（兜底句应当极少出现）。 */
async function askNarrationSkipReasonFollowUp(
  callModel: CallModel,
  baseMessages: AgentRuntimeMessage[],
  transcript: AgentTranscript
): Promise<string> {
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : []
  const lastAssistantText = toText(turns[turns.length - 1]?.modelMessage?.content)
  try {
    const output = await callModel({
      messages: [
        ...baseMessages,
        ...(lastAssistantText ? [{ role: 'assistant' as const, content: lastAssistantText }] : []),
        {
          role: 'user' as const,
          content: '你刚才判断本轮不插入旁白，但没有给出理由。请基于当前上下文，用一句话写出不插入旁白的具体判断依据（不要空泛套话），只输出 {"reason":"..."}。'
        }
      ],
      history: [],
      activeTools: [],
      toolBriefs: [],
      turnIndex: turns.length
    })
    const reason = toText(parseJsonObjectLoose(output).reason)
    if (reason) return reason
    const raw = toText(output)
    // 模型直接回纯文本理由也接受（不带 JSON 壳且长度合理）
    if (raw && !raw.startsWith('{') && raw.length <= 200) return raw
    return ''
  } catch {
    return ''
  }
}

function normalizeProfileIdsFromArgs(args: ReadNarrationSkillArgs | ConfirmNarrationCallArgs): string[] {
  const raw = [
    toText((args as ConfirmNarrationCallArgs).profileId),
    ...(((args as ConfirmNarrationCallArgs).profileIds || (args as ConfirmNarrationCallArgs).profile_ids || []) as unknown[])
      .map((item) => toText(item))
  ].filter(Boolean)
  // 2026-07-06 真机修（同名陷阱）：内置旁白 skill 的 id 与 narrationKind 枚举取值空间恰好同名
  // （environment/appearance/event_push），弱模型（deepseek）会认定 narrationKind 已指明 skill、
  // 只填它不填 profileId → 同错连撞 10+ 次。缺 profileId 时兜底把 narrationKind 交同一 resolver 解析：
  // 内置 skill 直接命中；自定义 skill 对不上则走「未知 id + 可用清单」报错（仍是可执行口径）。
  if (!raw.length) {
    const record = args as Record<string, unknown>
    const kindRef = toText(record.narrationKind ?? record.narration_kind)
    if (kindRef) raw.push(kindRef)
  }
  return Array.from(new Set(raw))
}

/** 二分类保守默认（§4.4）：只有模型明确判定纯描写（false / "false"）才为 false；省略、拿不准一律算信息承载（true）。 */
export function normalizeInformationBearing(value: unknown): boolean {
  return !(value === false || value === 'false')
}

export function normalizeConfirmedNarrationKind(value: unknown, profile: PersonalityNarrationSubagentProfile | null | undefined): BuiltinNarrationKind {
  const raw = toText(value)
  if (raw === 'appearance' || raw === 'event_push') return raw
  if (profile?.id === 'appearance' || profile?.id === 'event_push') return profile.id
  return 'environment'
}

function chooseForcedNarrationProfile(
  profiles: PersonalityNarrationSubagentProfile[]
): PersonalityNarrationSubagentProfile | null {
  return profiles.find((profile) => profile.id === 'event_push')
    || profiles.find((profile) => profile.id === 'environment')
    || profiles.find((profile) => profile.id === 'appearance')
    || profiles[0]
    || null
}
