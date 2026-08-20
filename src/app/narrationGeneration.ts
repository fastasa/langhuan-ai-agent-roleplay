import type { ChatMessage, ChatPromptLogBlock, ChatSession } from '../types'
import type { UserNarrationRoleProfile } from './manualNarrationCommand'
import type { NarrationPlan } from './narrationProtocol'
import {
  NARRATION_MESSAGE_KIND,
  shouldNarrationProfileEnterContext,
  type BuiltinNarrationKind,
  type NarrationAgentRouteConfig,
  type NarrationKind,
  type NarrationProfile,
  type NarrativeRecallEvidence
} from './narrationProtocol'
import { buildNarrationRoundText, type NarrationProjectionFactLookup } from './narrationOrchestrator'
import { resolveEffectiveVirtualScene } from '../utils/virtualScene'
import { buildLatestSceneChangePromptNotice } from './sceneChangePromptNotice'
import { stripAiThoughtContent } from '../utils/aiOutput'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'
import {
  buildEmbeddedMessageProjectionInstruction,
  parseEmbeddedMessageProjectionOutput
} from './messageProjectionAgent'
import { buildChatSessionWorldAgentContextPrompt } from './chatSessionWorldAgentContext'

export interface NarrationGenerationAgentConfig {
  presetName?: string
  recallModel?: string
  recallMaxTokens?: number
  disableRecallThinking?: boolean
  narrationGenerationPresetName?: string
  narrationGenerationModel?: string
}

export interface NarrationGenerationInput {
  session: Partial<ChatSession> & { sessionId?: string; session_id?: string }
  plan: NarrationPlan
  messages: ChatMessage[]
  continuityMessages?: ChatMessage[]
  // 旁白上下文投影优先（chat 文档 line 38/41）：消息级 objectiveFact 查找表，
  // 「聊天记录」按 messageId 命中 fact 即用投影、未命中兜底原文；缺省则全兜底原文(向后兼容)。
  projectionFactByMessageId?: NarrationProjectionFactLookup
  recallEvidence?: NarrativeRecallEvidence[]
  agentConfig?: NarrationGenerationAgentConfig | NarrationAgentRouteConfig | null
  callAI?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: Record<string, unknown>) => Promise<string | null>
  abortSignal?: AbortSignal
  now?: string
  sceneChangeNotice?: string
  /** 当前命中情境的挂载提示词；与角色消息使用同一份情境配置真值。 */
  scenarioMountedPromptText?: string
  skipCandidateArchive?: boolean
  narrationProfile?: NarrationProfile | null
  agentAuthoredPrompt?: {
    profileIds?: string[]
    profileNames?: string[]
    content: string
    reason?: string
  }
  roleAppearanceProfiles?: UserNarrationRoleProfile[]
  userNarrationPatch?: {
    mode: 'direct' | 'agent_supplement'
    content: string
    roleProfile?: UserNarrationRoleProfile
  }
  /** 正式消息来源标记；只用于消息/提示词审计，不改变旁白业务表。 */
  messageSourceKind?: 'focused_action'
}

export interface NarrationGenerationResult {
  ok: boolean
  skipped?: boolean
  skipReason?: string
  content: string
  messagePayload?: Record<string, unknown>
  promptTrace?: NarrationPromptTrace
  embeddedProjectionText?: string
  embeddedProjectionError?: string
  embeddedProjectionRequired?: boolean
  degradation?: {
    stage: string
    message: string
  }
}

export interface NarrationPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: ChatPromptLogBlock[]
  options: Record<string, unknown>
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function isPromptHidden(message: Partial<ChatMessage> | Record<string, unknown>): boolean {
  const hidden = (message as Record<string, unknown>).autoWriteHidden ?? (message as Record<string, unknown>).auto_write_hidden
  return hidden === true || hidden === 1 || hidden === '1' || hidden === 'true'
}

function resolveSessionId(session: NarrationGenerationInput['session']): string {
  return toText(session.id ?? session.sessionId ?? session.session_id)
}

function collectNarrationPromptMessages(messages: ChatMessage[]): ChatMessage[] {
  const usable = (Array.isArray(messages) ? messages : [])
    .filter((message) => String(message?.messageKind ?? message?.message_kind ?? '').trim() !== 'narration_debug')
    .filter((message) => !isPromptHidden(message))
  if (usable.length <= 1) return usable
  const triggerIndex = usable.length - 1
  const userIndexes = usable
    .map((message, index) => message.role === 'user' ? index : -1)
    .filter((index) => index >= 0 && index <= triggerIndex)
  if (!userIndexes.length) return usable.slice(Math.max(0, usable.length - 4))
  const lastUserIndex = userIndexes[userIndexes.length - 1]
  const previousUserIndex = userIndexes.length >= 2 ? userIndexes[userIndexes.length - 2] : lastUserIndex
  return usable.slice(previousUserIndex, triggerIndex + 1)
}

function resolveEnv(messages: ChatMessage[], session: NarrationGenerationInput['session']) {
  const latest = [...messages].reverse().find((message) => toText(message.envDate ?? message.env_date) || toText(message.envWeather ?? message.env_weather) || toText(message.envLocation ?? message.env_location))
  const scene = resolveEffectiveVirtualScene(session as any, null, Date.now())
  return {
    envDate: toText(scene?.time ?? session.virtualTime ?? session.virtual_time ?? latest?.envDate ?? latest?.env_date),
    envWeather: toText(session.virtualWeather ?? session.virtual_weather ?? latest?.envWeather ?? latest?.env_weather),
    envLocation: toText(scene?.location ?? session.virtualLocation ?? session.virtual_location ?? latest?.envLocation ?? latest?.env_location)
  }
}

// 旁白输出机制帧（批次3·彻底接管，2026-06-21）：与写作风格无关的极小护栏——身份 + 直接输出正文 + [消息投影] 格式。
// 「写什么/怎么写/各维度占比」全部下放给提调写进 generatedPrompt，本帧不再注入任何写作方向或风格要求（脏提示词根因）。
function buildNarrationMechanismFrame(): string {
  return [
    '这是一段旁白，不是用户发言，也不是任何角色说话。',
    '直接写旁白正文，不要输出标题、解释、列表、JSON 或思考过程。',
    buildEmbeddedMessageProjectionInstruction('本条旁白')
  ].join('\n')
}

// 动态世界直接/间接影响补丁：事件推进旁白专用的上下文信号（来自地点快判 locationImpactMode），
// 属真实场景信号而非通用写作护栏——提调路径与兜底路径在事件推进旁白带该信号时都需附上。无信号返回空串。
function buildDynamicWorldImpactPatch(input?: NarrationGenerationInput): string {
  const impactMode = toText((input?.plan?.debug as Record<string, unknown> | undefined)?.locationImpactMode)
  if (impactMode === 'indirect') {
    return [
      '动态世界间接影响补丁：',
      '本次事件已经在帷幕时间发生，但地点快判认为它不直接冲入当前地点。',
      '仍然必须写成当前场景能感知到的间接变化，例如传闻、广播、信使、远处异动、天象或环境异常、人群反应、交通/物品变化、势力动作留下的余波。',
      '不能写成“没有影响”，也不能让事件像后台记录一样静默完成。'
    ].join('\n')
  }
  if (impactMode === 'direct') {
    return [
      '动态世界直接影响补丁：',
      '本次事件已经在帷幕时间发生，并且会影响当前场景。',
      '必须把事件写成现场可直接感知的新变化，让后续角色能立刻接住。'
    ].join('\n')
  }
  return ''
}

function buildSystemPrompt(kind: NarrationKind, input?: NarrationGenerationInput) {
  const effectiveKind = normalizeNarrationProfileKind(input?.narrationProfile, kind)
  const editablePrefix = toText(input?.agentAuthoredPrompt?.content)
  // 批次3 彻底接管 + 末尾高权重（2026-06-21）：自动旁白的写作指令完全由提调编写，且**移到用户段最末尾**（见 buildUserPrompt）
  // 以拿到最高权重；system 段只放与本轮无关的稳定机制帧（身份/输出格式/[消息投影]），并明确告诉模型以末尾那段为准。
  if (editablePrefix && !input?.userNarrationPatch) {
    return [
      buildNarrationMechanismFrame(),
      '本轮的具体写作要求见用户消息最后的「本轮旁白写作指令」，必须严格以那一段为准。'
    ].join('\n')
  }
  // —— 无提调指令的兜底路径（手动重生成 / 用户待润色 agent_supplement / 命中角色名）：保留自包含写作指令 ——
  // 篇幅句：旁白是填充在角色话语之间的大段内容（约 500–2000 字）。带用户待润色/角色名命中补丁时，
  // 篇幅以补丁自身要求为准（草稿篇幅 / 短反应），不套大段区间，避免与补丁自相矛盾。
  const lengthRequirement = input?.userNarrationPatch
    ? '正文部分写一段可直接写入聊天记录的中文旁白，篇幅以上面补丁的要求为准。'
    : '正文部分写一段可直接写入聊天记录的中文旁白——旁白是填充在角色话语之间的大段内容，请分成多个自然段落层层铺陈，约 500–2000 字，不要只写一句气氛收束或压成一两句。'
  const outputRequirement = [
    lengthRequirement,
    '句式、感官、意象和动作节奏要多样化，避免连续重复同一类天气词、地点词、光影词或句子开头。',
    '保持文学性，但必须写出可感知的空间层次、声音 / 气味 / 温度 / 物件细节中的至少两类。',
    buildEmbeddedMessageProjectionInstruction('本条旁白')
  ].join('\n')
  const userDraftPatch = input?.userNarrationPatch?.mode === 'agent_supplement'
    ? [
      '',
      '用户待润色内容补丁：',
      '本轮不是自由生成旁白，而是把用户提供的待润色内容改写成可见旁白正文。',
      '用户待润色内容的事实、视角、节奏和意图优先；聊天记录和环境资料只用于修正矛盾、补足空间感和保持上下文一致。',
      '不要新增与用户输入无关的新事件，不要改变用户输入里已经明确的人物、动作、地点或结果。'
    ].join('\n')
    : ''
  const roleHitPatch = input?.userNarrationPatch?.roleProfile
    ? [
      '',
      '角色名命中补丁：',
      '本轮用户输入只命中了当前会话中的一个角色名，不是要求这个角色开口说话。',
      '必须参考命中角色的简介和外貌资料，写可见旁白正文。',
      '只允许生成环境描写、动作描写和神态描写；动作与神态只能略写，作为场景中的短反应。',
      '禁止生成角色的语言描写、台词、内心独白、转述发言、说话声、语气词或任何引号内容。',
      '不得替用户或角色做新的行动决定，不得把角色资料改写成设定说明。'
    ].join('\n')
    : ''
  // 兜底路径无 generatedPrompt（或与用户命令补丁同存）：editablePrefix 已在函数顶部声明，
  // 这里沿用 `editablePrefix || fallbackTask`，无提调指令时退化为 fallbackTask 精简任务句。
  const fallbackTask = effectiveKind === 'event_push'
    ? '写一段事件推进旁白，给当前场景引入一个可被角色回应的新变化。'
    : effectiveKind === 'appearance'
      ? '写一段外貌、动作、神态或衣着相关旁白。'
      : effectiveKind === 'custom'
        ? '按本旁白 skill 的主题与风格，写一段可见旁白正文。'
        : '写一段环境、时间、天气、地点或氛围相关旁白。'
  if (effectiveKind === 'event_push') {
    const dynamicWorldPatch = buildDynamicWorldImpactPatch(input)
    return [
      editablePrefix || fallbackTask,
      '不要输出标题、解释、列表、JSON 或思考过程。',
      '不要改写已经发生的事实，要自然写成当前可承接的变化。',
      '如果环境资料与聊天记录存在矛盾，必须优先遵循聊天记录；可以根据聊天记录轻微调整外部动静细节，但不得推翻已发生事实。',
      '事件推进旁白必须让场景出现新的可回应变化：外部消息、人物行动、环境异动、矛盾压力、线索暴露或选择逼近，至少命中其一。',
      '必须能让下一条角色回复接住并行动；不要只写氛围、停顿、余韵或抽象情绪。',
      dynamicWorldPatch,
      userDraftPatch,
      roleHitPatch,
      '',
      outputRequirement
    ].filter(Boolean).join('\n')
  }
  if (effectiveKind === 'custom') {
    return [
      editablePrefix || fallbackTask,
      '旁白不是用户发言，也不是任何角色说话。',
      '不要输出标题、解释、列表、JSON 或思考过程。',
      outputRequirement
    ].filter(Boolean).join('\n')
  }
  return [
    editablePrefix || fallbackTask,
    '旁白不是用户发言，也不是任何角色说话。',
    '不要输出标题、解释、列表、JSON 或思考过程。',
    effectiveKind === 'environment'
      ? '只写环境、时间、天气、地点或氛围，不要推动剧情，不要制造新事件，不要替用户或角色做行动决定。'
      : '不要改写已经发生的事实；只能把外部动静自然写成当前可承接的场景变化。',
    effectiveKind === 'environment'
      ? '如果文档库环境资料与聊天记录存在矛盾，必须优先遵循聊天记录，只取能支撑当前地点氛围的资料。'
      : '如果环境资料与聊天记录存在矛盾，必须优先遵循聊天记录；可以根据聊天记录轻微调整外部动静细节，但不得推翻已发生事实。',
    userDraftPatch,
    roleHitPatch,
    outputRequirement
  ].filter(Boolean).join('\n')
}

function formatNarrationRoleProfileForPrompt(profile: UserNarrationRoleProfile | undefined): string {
  if (!profile) return ''
  const aliases = Array.isArray(profile.aliases)
    ? profile.aliases.map((item) => toText(item)).filter(Boolean)
    : []
  return [
    `名称：${profile.name || '未记录'}`,
    aliases.length ? `别名：${aliases.join('、')}` : '',
    `资料来源：${profile.source === 'sessionTemporary' ? '当前会话临时角色' : profile.source === 'userAlias' ? '当前用户马甲或用户资料' : '当前会话正式角色'}`,
    profile.description ? `简介：${profile.description}` : '简介：未记录',
    profile.appearance ? `外貌：${profile.appearance}` : '外貌：未记录',
    profile.source === 'sessionTemporary' && profile.markdown
      ? ['临时角色资料摘录：', profile.markdown].join('\n')
      : ''
  ].filter(Boolean).join('\n')
}

function cropPromptText(value: unknown, maxLength = 800): string {
  const text = toText(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function escapePromptName(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readPromptMessageSpeaker(message: ChatMessage): string {
  const kind = String(message?.messageKind ?? message?.message_kind ?? '').trim()
  if (kind === 'narration' || kind === 'narration_debug') return ''
  return String(
    message.role === 'user'
      ? (message.name || message.memberName || message.member_name || '')
      : (message.memberName ?? message.member_name ?? message.name ?? '')
  ).trim()
}

function listNarrationRoleNames(profile: UserNarrationRoleProfile): string[] {
  const names = [
    profile.name,
    ...(Array.isArray(profile.aliases) ? profile.aliases : [])
  ].map((item) => toText(item)).filter(Boolean)
  return Array.from(new Set(names))
}

function isNarrationRoleProfileInPrompt(profile: UserNarrationRoleProfile, promptMessages: ChatMessage[], promptText: string): boolean {
  const names = listNarrationRoleNames(profile)
  if (!names.length) return false
  const speakerNames = new Set(promptMessages.map(readPromptMessageSpeaker).filter(Boolean))
  if (names.some((name) => speakerNames.has(name))) return true
  return names.some((name) => {
    if ([...name].length < 2) return false
    if (/[\p{Script=Han}]/u.test(name)) return promptText.includes(name)
    return new RegExp(`(^|[^A-Za-z0-9_])${escapePromptName(name)}([^A-Za-z0-9_]|$)`, 'u').test(promptText)
  })
}

function formatPromptRoleAppearanceProfiles(input: {
  effectiveKind: NarrationKind
  roleAppearanceProfiles?: UserNarrationRoleProfile[]
  promptMessages: ChatMessage[]
  promptText: string
}): string {
  if (input.effectiveKind !== 'appearance') return ''
  const seen = new Set<string>()
  const matched = (Array.isArray(input.roleAppearanceProfiles) ? input.roleAppearanceProfiles : [])
    .filter((profile) => profile && typeof profile === 'object')
    .filter((profile) => isNarrationRoleProfileInPrompt(profile, input.promptMessages, input.promptText))
    .filter((profile) => {
      const key = `${profile.source}:${toText(profile.name)}:${toText(profile.appearance)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
  if (!matched.length) return ''
  return [
    '聊天记录出场人物外貌：',
    '以下外貌来自当前会话正式角色资料、会话临时角色资料或当前用户马甲 / 用户资料，只对应上方“聊天记录”里已经出现的人物；人物描写旁白必须优先使用这些外貌正文，不得另造相反特征。',
    ...matched.map((profile, index) => {
      const aliases = Array.isArray(profile.aliases)
        ? profile.aliases.map((item) => toText(item)).filter(Boolean)
        : []
      return [
        `人物 ${index + 1}：${profile.name || '未命名人物'}`,
        aliases.length ? `别名：${aliases.join('、')}` : '',
        `资料来源：${profile.source === 'sessionTemporary' ? '当前会话临时角色' : profile.source === 'userAlias' ? '当前用户马甲或用户资料' : '当前会话正式角色'}`,
        `外貌正文：${cropPromptText(profile.appearance) || '未记录'}`,
        profile.description ? `简介：${cropPromptText(profile.description, 300)}` : ''
      ].filter(Boolean).join('\n')
    })
  ].join('\n')
}

function formatRecallEvidenceForPrompt(input: NarrationGenerationInput) {
  const evidence = (input.recallEvidence || [])
    .filter((item): item is NarrativeRecallEvidence => Boolean(item && typeof item === 'object' && 'documentId' in item))
    .slice(0, 3)
  if (!evidence.length) return '无'
  return evidence.map((item, index) => {
    if (item.sourceType === 'session_temporary_entity' && item.readDecision === 'full_content') {
      const body = toText(item.fullContent || item.summary || item.excerpt)
      return [
        `资料 ${index + 1}：会话临时资料`,
        body ? `正文：${body}` : ''
      ].filter(Boolean).join('\n')
    }
    return [
      `资料 ${index + 1}：${item.title || item.documentId}`,
      item.displayPath ? `路径：${item.displayPath}` : '',
      item.documentType || item.semanticType ? `类型：${[item.documentType, item.semanticType].filter(Boolean).join(' / ')}` : '',
      Number.isFinite(Number(item.score)) ? `分数：${Number(item.score).toFixed(3)}` : '',
      item.summary ? `摘要：${item.summary}` : '',
      item.excerpt ? `摘录：${item.excerpt}` : '',
      item.reason ? `采用理由：${item.reason}` : ''
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

function readNarrationProfileField(message: ChatMessage, camel: string, snake: string): string {
  return toText((message as unknown as Record<string, unknown>)[camel] ?? (message as unknown as Record<string, unknown>)[snake])
}

const NARRATION_CONTINUITY_BATCH_PREFIX = 'narration_continuity:'

function readAutoWriteBatchId(message: ChatMessage): string {
  return readNarrationProfileField(message, 'autoWriteBatchId', 'auto_write_batch_id')
}

function readAutoWriteHiddenReason(message: ChatMessage): string {
  return readNarrationProfileField(message, 'autoWriteHiddenReason', 'auto_write_hidden_reason')
}

export function buildNarrationContinuityBatchId(profile: NarrationProfile | null | undefined): string {
  return ''
}

function isSameNarrationProfile(message: ChatMessage, profile: NarrationProfile | null | undefined): boolean {
  if (!profile?.id) return false
  const messageProfileId = readNarrationProfileField(message, 'narrationProfileId', 'narration_profile_id')
  if (messageProfileId) return messageProfileId === profile.id
  const messageProfileKind = readNarrationProfileField(message, 'narrationProfileKind', 'narration_profile_kind')
  const messageProfileName = readNarrationProfileField(message, 'narrationProfileName', 'narration_profile_name')
  const profileKind = normalizeNarrationProfileKind(profile, 'environment')
  return Boolean(messageProfileKind && messageProfileName && messageProfileKind === profileKind && messageProfileName === profile.name)
}

function canUseSameProfileNarrationForContinuity(message: ChatMessage, profile: NarrationProfile): boolean {
  if (!isSameNarrationProfile(message, profile)) return false
  if (!isPromptHidden(message)) return true
  const continuityBatchId = buildNarrationContinuityBatchId(profile)
  if (continuityBatchId && readAutoWriteBatchId(message) === continuityBatchId) return true
  return readAutoWriteHiddenReason(message) === 'narration_profile_excluded'
}

function collectRecentSameProfileNarrationTexts(input: NarrationGenerationInput): string[] {
  return []
}

function formatRecentSameProfileNarrations(input: NarrationGenerationInput): string {
  const recentTexts = collectRecentSameProfileNarrationTexts(input)
  if (!recentTexts.length) return ''
  return [
    '同类旁白连续性参考：',
    '以下只包含同一旁白类型最近两条成品原文；只用于保持节奏、视角和意象连续。若它们与本轮聊天记录冲突，必须优先遵循本轮聊天记录。',
    ...recentTexts.map((text, index) => `原文 ${index + 1}：\n${text}`)
  ].join('\n')
}

export function buildNarrationContinuityMarkerUpdates(input: {
  messages?: ChatMessage[]
  narrationProfile?: NarrationProfile | null
  newMessageId?: number
  newMessagePayload?: Record<string, unknown> | null
}): Array<{ messageId: number; autoWriteBatchId: string }> {
  const profile = input.narrationProfile
  const continuityBatchId = buildNarrationContinuityBatchId(profile)
  if (!profile || !continuityBatchId) return []
  const messages = Array.isArray(input.messages) ? [...input.messages] : []
  if (input.newMessageId && input.newMessagePayload) {
    messages.push({ ...(input.newMessagePayload as Record<string, unknown>), id: input.newMessageId } as unknown as ChatMessage)
  }
  const candidates = messages
    .filter((message) => String(message?.messageKind ?? message?.message_kind ?? '').trim() === NARRATION_MESSAGE_KIND)
    .filter((message) => isSameNarrationProfile(message, profile))
    .filter((message) => isPromptHidden(message))
    .filter((message) => readAutoWriteBatchId(message) === continuityBatchId || readAutoWriteHiddenReason(message) === 'narration_profile_excluded')
    .filter((message) => Number.isFinite(Number(message.id)) && Number(message.id) > 0)
  const latestIds = new Set(candidates.slice(-2).map((message) => Number(message.id)))
  const updates: Array<{ messageId: number; autoWriteBatchId: string }> = []
  candidates.forEach((message) => {
    const expectedBatchId = latestIds.has(Number(message.id)) ? continuityBatchId : ''
    if (readAutoWriteBatchId(message) !== expectedBatchId) {
      updates.push({ messageId: Number(message.id), autoWriteBatchId: expectedBatchId })
    }
  })
  return updates
}

function buildUserPrompt(input: NarrationGenerationInput) {
  const effectiveKind = normalizeNarrationProfileKind(input.narrationProfile, input.plan.narrationKind)
  const env = resolveEnv(input.messages, input.session)
  const sceneChangeNotice = toText(input.sceneChangeNotice) || buildLatestSceneChangePromptNotice(input.messages as any[], input.session as any)
  const recentSameProfileNarrations = formatRecentSameProfileNarrations(input)
  const promptMessages = collectNarrationPromptMessages(input.messages)
  const promptChatText = buildNarrationRoundText(promptMessages, input.projectionFactByMessageId) || '无'
  const promptRoleAppearances = formatPromptRoleAppearanceProfiles({
    effectiveKind,
    roleAppearanceProfiles: input.roleAppearanceProfiles,
    promptMessages,
    promptText: promptChatText
  })
  // 末尾高权重指令块（2026-06-21）：自动旁白路径下，提调写的本轮写作指令（generatedPrompt）放到用户消息最末尾，
  // 紧贴聊天记录之后、最高权重位；事件推进的动态世界直接/间接影响信号随之附上。
  const hasDirectorInstruction = Boolean(toText(input.agentAuthoredPrompt?.content)) && !input.userNarrationPatch
  const directorInstructionTail = hasDirectorInstruction
    ? [
      '',
      '本轮旁白写作指令（最高优先级·请严格按这一段写，胜过前面任何通用说明）：',
      toText(input.agentAuthoredPrompt?.content),
      effectiveKind === 'event_push' ? buildDynamicWorldImpactPatch(input) : '',
      '请只输出这段旁白的正文（随后按系统要求附 [消息投影]），内容、聚焦角色、占比、文风与字数都以上面这段指令为准。'
    ].filter(Boolean).join('\n')
    : ''
  return [
    `当前时间：${formatNarrationCurrentTime(env.envDate, input.now)}`,
    `当前天气：${env.envWeather || '未记录'}`,
    `当前地点：${env.envLocation || '未记录'}`,
    sceneChangeNotice ? ['', '场景变化提醒：', sceneChangeNotice].join('\n') : '',
    '',
    '聊天记录：',
    promptChatText,
    promptRoleAppearances ? ['', promptRoleAppearances].join('\n') : '',
    '文档库环境资料：',
    formatRecallEvidenceForPrompt(input),
    input.userNarrationPatch?.roleProfile
      ? [
        '',
        '命中角色资料：',
        formatNarrationRoleProfileForPrompt(input.userNarrationPatch.roleProfile)
      ].join('\n')
      : '',
    input.userNarrationPatch?.mode === 'agent_supplement'
      ? [
        '',
        '用户待润色内容：',
        input.userNarrationPatch.content,
        '',
        '补丁任务：',
        '请严格依照上面的用户待润色内容写旁白，只做文学润色、上下文校准和必要的环境细节补足。'
      ].join('\n')
      : '',
    input.userNarrationPatch?.roleProfile
      ? [
        '',
        '角色名命中任务：',
        `请围绕“${input.userNarrationPatch.roleProfile.name}”写一段可直接写入聊天记录的旁白。`,
        '必须使用上方简介和外貌作为人物可见依据；只写环境、动作和神态，动作与神态略写；禁止写台词、说话声、内心独白或转述发言。'
      ].join('\n')
      : '',
    '',
    // 批次3 彻底接管 + 末尾高权重（2026-06-21）：有提调指令时，任务行让位给文末的「本轮旁白写作指令」块（最高权重位）；
    // 无提调指令的兜底/用户命令路径保留各自任务行。
    hasDirectorInstruction
      ? ''
      : input.userNarrationPatch?.roleProfile
      ? '任务：请输出可直接写入聊天记录的角色在场旁白正文。'
      : effectiveKind === 'custom'
        ? `任务：请按照“${input.narrationProfile?.name || '自定义旁白'}”的旁白 skill，输出可直接写入聊天记录的旁白正文。`
      : effectiveKind === 'event_push'
      ? '任务：请输出可直接写入聊天记录的事件推进旁白正文。它必须引入可被角色回应的新变化，不能只是环境描写、情绪余韵或总结刚才的话。'
      : effectiveKind === 'environment'
        ? '任务：请输出可直接写入聊天记录的纯环境旁白正文。只描写当前地点、时间、天气和氛围，不要推进剧情；描写角度、感官细节和句式要尽量多样，不要重复堆同一种雨声、灯光或空气描写。'
        : '请输出可直接写入聊天记录的旁白正文。',
    recentSameProfileNarrations ? ['', recentSameProfileNarrations].join('\n') : '',
    // 提调指令搬到整个用户消息最末尾：紧贴聊天记录之后、模型生成之前，拿最高权重；事件推进的动态世界信号一并附在这里。
    directorInstructionTail
  ].join('\n')
}

function readTimeWithSeconds(value: string | undefined): string {
  const text = toText(value)
  const isoMatch = text.match(/T(\d{2}:\d{2}:\d{2})/)
  if (isoMatch) return isoMatch[1]
  const timeMatch = text.match(/(\d{1,2}:\d{2}:\d{2})/)
  if (timeMatch) return timeMatch[1]
  const date = text ? new Date(text) : null
  if (date && !Number.isNaN(date.getTime())) {
    return [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0')
    ].join(':')
  }
  return ''
}

function formatNarrationCurrentTime(envDate: string, now: string | undefined): string {
  const dateText = toText(envDate)
  if (/\d{1,2}:\d{2}:\d{2}/.test(dateText)) return dateText
  const timeText = readTimeWithSeconds(now)
  if (dateText && timeText) return `${dateText} ${timeText}`
  return dateText || toText(now) || '未记录'
}

function buildAgentOptions(agentConfig: NarrationGenerationInput['agentConfig']) {
  // 批次3（2026-07-08 槽位收束）：旁白归校书档；旧旁白槽默认 0.8/800/disabled 落调用点覆写（行为不变）。
  const options = buildTaskModelAiOptions(agentConfig as any, 'narrationMessage', { temperature: 0.8, maxTokens: 800, thinking: 'disabled' })
  return {
    ...options,
    maxTokens: Math.max(360, Number(options.maxTokens || 800)),
    temperature: options.temperature,
    feature: 'narration',
    logLabel: 'narration-generation',
    usageLabel: '旁白生成',
    placeLabel: '旁白生成',
    placeType: 'chat'
  }
}

function formatPromptBlocks(messages: NarrationPromptTrace['messages']): ChatPromptLogBlock[] {
  return messages.map((message, index) => ({
    role: message.role,
    title: `${message.role === 'system' ? '系统' : message.role === 'user' ? '用户' : '助手'}区块 ${index + 1}`,
    content: String(message.content || '')
  }))
}

export function buildNarrationPromptTrace(input: NarrationGenerationInput): NarrationPromptTrace {
  const systemPrompt = [
    buildSystemPrompt(input.plan.narrationKind, input),
    buildChatSessionWorldAgentContextPrompt(input.session)
  ].join('\n\n')
  const messages: NarrationPromptTrace['messages'] = [
    { role: 'system', content: systemPrompt },
    ...(toText(input.scenarioMountedPromptText)
      ? [{ role: 'system' as const, content: `情境挂载提示词：\n${toText(input.scenarioMountedPromptText)}` }]
      : []),
    { role: 'user', content: buildUserPrompt(input) }
  ]
  return {
    messages,
    finalPrompt: messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n'),
    promptBlocks: formatPromptBlocks(messages),
    options: {
      ...buildAgentOptions(input.agentConfig),
      temperature: resolveNumericNarrationTemperature(input.plan.temperature)
    }
  }
}

function normalizeNarrationProfileKind(profile: NarrationProfile | null | undefined, fallback: NarrationKind): NarrationKind {
  const id = toText(profile?.id)
  if (id === 'appearance' || id === 'event_push') return id
  if (id && id !== 'environment') return 'custom'
  return fallback || 'environment'
}

function resolveNumericNarrationTemperature(value: unknown): number {
  const raw = String(value || '').trim()
  if (raw === 'documentary') return 0.35
  if (raw === 'light') return 0.55
  if (raw === 'open') return 0.9
  if (raw === 'bloom') return 1.05
  return 0.75
}

function sanitizeNarrationContent(value: unknown): string {
  return toText(value)
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim()
}

function isInvalidNarrationContent(content: string): boolean {
  const text = toText(content)
  if (!text) return true
  if (/^\[API调用失败[:：]/.test(text)) return true
  if (/^\s*[{[]/.test(text)) return true
  if (/^#{1,6}\s+/m.test(text)) return true
  if (/^\s*[-*]\s+/m.test(text)) return true
  if (/请输出|只输出|不要输出|JSON|思考过程|可编辑材料|工程指令/.test(text)) return true
  if (/^围绕[“"「]?[^，。；;]{0,40}[”"」]?，?(?:引入|写一段|生成|加入)/.test(text)) return true
  if (/例如.*(?:让角色|不直接改写|传讯|物件异动|路人反应)/.test(text)) return true
  return false
}

function buildEventPushFallbackNarration(input: NarrationGenerationInput): string {
  const env = resolveEnv(input.messages, input.session)
  const location = env.envLocation || '街边'
  const weatherPrefix = env.envWeather ? `${env.envWeather}里，` : ''
  const context = buildNarrationRoundText(collectNarrationPromptMessages(input.messages), input.projectionFactByMessageId)
  if (/信|急讯|传讯|消息|门口|门前/.test(context)) {
    return `${weatherPrefix}${location}的喧声短暂低了下去，有人从街角匆匆走近，手里护着一封被风雨压皱的信。`
  }
  if (/声响|远处|动静|路人|街角|物件/.test(context)) {
    return `${weatherPrefix}${location}远处忽然传来一阵轻微的响动，像有什么事正从人群边缘慢慢靠近。`
  }
  return `${weatherPrefix}${location}的人群忽然朝同一个方向让开，几句压低的议论从街口传来，像是有什么新消息正越过停住的对话逼近眼前。`
}

function buildFallbackNarration(input: NarrationGenerationInput): string {
  const env = resolveEnv(input.messages, input.session)
  if (input.plan.narrationKind === 'event_push') {
    return buildEventPushFallbackNarration(input)
  }
  if (input.plan.narrationKind === 'appearance') {
    return '短暂的停顿里，眼前人的神情和动作被此刻的光线轻轻托住，像是把还没说出口的话先压在了眉眼之间。'
  }
  const parts = [env.envLocation, env.envWeather, env.envDate].filter(Boolean).join('，')
  return parts
    ? `${parts}。周围的气息安静地铺开，让刚才的话有了可以停驻的地方。`
    : '周围短暂安静下来，刚才的话像余波一样留在空气里，等着下一句回应把它接住。'
}

export function buildNarrationMessagePayload(input: NarrationGenerationInput, content: string): Record<string, unknown> {
  const env = resolveEnv(input.messages, input.session)
  const now = input.now || new Date().toISOString()
  const visibleContent = stripAiThoughtContent(content)
  const includeInContext = shouldNarrationProfileEnterContext(input.narrationProfile)
  const continuityBatchId = includeInContext ? '' : buildNarrationContinuityBatchId(input.narrationProfile)
  return {
    role: 'assistant',
    messageKind: NARRATION_MESSAGE_KIND,
    message_kind: NARRATION_MESSAGE_KIND,
    content: visibleContent,
    name: '旁白',
    time: now,
    envDate: env.envDate,
    env_date: env.envDate,
    envWeather: env.envWeather,
    env_weather: env.envWeather,
    envLocation: env.envLocation,
    env_location: env.envLocation,
    image: '',
    model: toText((input.agentConfig as Record<string, unknown> | null | undefined)?.narrationGenerationModel || (input.agentConfig as Record<string, unknown> | null | undefined)?.recallModel),
    crowdName: '',
    memberName: '旁白',
    narrationProfileId: input.narrationProfile?.id || input.plan.profileId || '',
    narration_profile_id: input.narrationProfile?.id || input.plan.profileId || '',
    narrationProfileName: input.narrationProfile?.name || input.plan.profileName || '',
    narration_profile_name: input.narrationProfile?.name || input.plan.profileName || '',
    narrationProfileKind: normalizeNarrationProfileKind(input.narrationProfile, input.plan.narrationKind),
    narration_profile_kind: normalizeNarrationProfileKind(input.narrationProfile, input.plan.narrationKind),
    ...(input.messageSourceKind ? {
      messageSourceKind: input.messageSourceKind,
      message_source_kind: input.messageSourceKind
    } : {}),
    includeInContext,
    include_in_context: includeInContext,
    autoWriteHidden: includeInContext ? undefined : true,
    auto_write_hidden: includeInContext ? undefined : true,
    autoWriteBatchId: includeInContext ? undefined : continuityBatchId || undefined,
    auto_write_batch_id: includeInContext ? undefined : continuityBatchId || undefined,
    autoWriteHiddenReason: includeInContext ? undefined : 'narration_profile_excluded',
    auto_write_hidden_reason: includeInContext ? undefined : 'narration_profile_excluded',
    versionsJson: [],
    activeVersionIndex: 0,
    createdAt: now
  }
}

export async function generateNarrationContent(input: NarrationGenerationInput): Promise<NarrationGenerationResult> {
  if (input.abortSignal?.aborted) throw createNarrationAbortError()
  if (!input.plan.shouldInsert) {
    return { ok: true, skipped: true, skipReason: input.plan.skipReason || 'plan_skipped', content: '' }
  }
  const userNarrationPatch = input.userNarrationPatch
  if (userNarrationPatch?.mode === 'direct' && !userNarrationPatch.roleProfile) {
    const content = sanitizeNarrationContent(userNarrationPatch.content)
    if (!content || /^\[API调用失败[:：]/.test(content)) {
      return { ok: false, skipped: true, skipReason: 'empty_user_narration', content: '' }
    }
    return {
      ok: true,
      content,
      messagePayload: buildNarrationMessagePayload(input, content)
    }
  }
  const promptTrace = buildNarrationPromptTrace(input)
  let content = ''
  let embeddedProjectionText = ''
  let embeddedProjectionError = ''
  let embeddedProjectionRequired = false
  let degradation: NarrationGenerationResult['degradation']
  if (input.callAI) {
    try {
      const rawOutput = await input.callAI(promptTrace.messages, {
        ...promptTrace.options,
        signal: input.abortSignal
      })
      const parsed = parseEmbeddedMessageProjectionOutput(rawOutput)
      embeddedProjectionText = parsed.projectionText
      embeddedProjectionError = parsed.error
      embeddedProjectionRequired = true
      content = sanitizeNarrationContent(parsed.visibleText)
      if (input.abortSignal?.aborted) throw createNarrationAbortError()
      if (isInvalidNarrationContent(content)) throw new Error('模型没有输出合格的旁白正文。')
    } catch (error) {
      degradation = {
        stage: 'narration_generation',
        message: error instanceof Error ? error.message : String(error)
      }
      if (userNarrationPatch?.mode === 'agent_supplement') {
        return {
          ok: false,
          skipped: true,
          skipReason: degradation.message,
          content: '',
          promptTrace,
          degradation
        }
      }
      embeddedProjectionText = ''
      embeddedProjectionError = ''
      embeddedProjectionRequired = false
      content = buildFallbackNarration(input)
    }
  } else {
    degradation = {
      stage: 'narration_generation',
      message: '未提供旁白生成 Agent 调用入口，已使用本地旁白兜底。'
    }
    if (userNarrationPatch?.mode === 'agent_supplement') {
      return {
        ok: false,
        skipped: true,
        skipReason: degradation.message,
        content: '',
        promptTrace,
        degradation
      }
    }
    embeddedProjectionRequired = false
    content = buildFallbackNarration(input)
  }
  const messagePayload = buildNarrationMessagePayload(input, content)
  return {
    ok: true,
    content,
    messagePayload,
    promptTrace,
    embeddedProjectionText,
    embeddedProjectionError,
    embeddedProjectionRequired,
    degradation
  }
}

function createNarrationAbortError(): Error {
  const error = new Error('旁白生成已停止')
  error.name = 'AbortError'
  return error
}
