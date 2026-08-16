import type { ChatMessage, SessionTemporaryEntityKind } from '../types'

export const NARRATION_MESSAGE_KIND = 'narration'
export const DEFAULT_NARRATION_FREQUENCY = 'standard'
export const DEFAULT_NARRATION_TEMPERATURE = 'standard'
export const DEFAULT_NARRATION_PROFILE_ID = 'environment'

export type BuiltinNarrationKind = 'environment' | 'appearance' | 'event_push'
export type NarrationKind = BuiltinNarrationKind | 'custom'
export type NarrationFrequency = 'silent' | 'standard' | 'active'
export type NarrationTemperature = 'documentary' | 'light' | 'standard' | 'open' | 'bloom'
export type NarrationModelTier = 'rule' | 'quick' | 'standard' | 'strong'
export type NarrationQuickJudgeTag =
  | 'scene_shift'
  | 'time_shift'
  | 'weather_shift'
  | 'new_action'
  | 'external_motion'
  | 'appearance_focus'
  | 'low_information'
  | 'stagnation'

export const NARRATION_FREQUENCY_OPTIONS: Array<{ value: NarrationFrequency; label: string }> = [
  { value: 'silent', label: '静默' },
  { value: 'standard', label: '标准' },
  { value: 'active', label: '活跃' }
]

export const NARRATION_TEMPERATURE_OPTIONS: Array<{ value: NarrationTemperature; label: string }> = [
  { value: 'documentary', label: '纪实' },
  { value: 'light', label: '轻描' },
  { value: 'standard', label: '标准' },
  { value: 'open', label: '开阔' },
  { value: 'bloom', label: '盛放' }
]

export const NARRATION_KIND_OPTIONS: Array<{ value: NarrationKind; label: string }> = [
  { value: 'environment', label: '环境' },
  { value: 'appearance', label: '人物在场' },
  { value: 'event_push', label: '事件推进' },
  { value: 'custom', label: '自定义' }
]

export interface NarrationProfile {
  id: string
  name: string
  triggerDescription: string
  content: string
}

export interface NarrationPlan {
  shouldInsert: boolean
  narrationKind: BuiltinNarrationKind
  reasons: string[]
  modelTier: NarrationModelTier
  frequency: NarrationFrequency
  temperature: NarrationTemperature
  candidateBatchId?: string
  profileId?: string
  profileName?: string
  score?: number
  skipReason?: string
  debug?: Record<string, unknown>
}

export interface NarrationQuickJudgeResult {
  tags: NarrationQuickJudgeTag[]
  confidence: number
  summary?: string
  recommendedKind?: BuiltinNarrationKind | 'none'
}

export interface NarrationAgentRouteConfig {
  quickJudgePresetName: string
  quickJudgeModel: string
  narrativeBeatPresetName: string
  narrativeBeatModel: string
  narrationGenerationPresetName: string
  narrationGenerationModel: string
}

export interface NarrativeRecallEvidence {
  documentId: string
  title: string
  displayPath: string
  documentType: string
  semanticType?: string
  sourceType?: 'document' | 'session_temporary_entity'
  temporaryEntityKind?: SessionTemporaryEntityKind
  score: number
  ruleScore?: number
  embeddingScore?: number
  includeScore?: number
  expandScore?: number
  readDecision?: 'summary_only' | 'full_content'
  reason: string
  summary?: string
  excerpt?: string
  fullContent?: string
  judgeReason?: string
}

export interface NarrationMessage extends ChatMessage {
  messageKind: typeof NARRATION_MESSAGE_KIND
  message_kind: typeof NARRATION_MESSAGE_KIND
}

export function isNarrationMessage(message: Partial<ChatMessage> | null | undefined): message is NarrationMessage {
  return String(message?.messageKind ?? message?.message_kind ?? '').trim() === NARRATION_MESSAGE_KIND
}

export function normalizeNarrationFrequency(value: unknown): NarrationFrequency {
  const raw = String(value || '').trim()
  return raw === 'silent' || raw === 'active' ? raw : DEFAULT_NARRATION_FREQUENCY
}

export function normalizeNarrationTemperature(value: unknown): NarrationTemperature {
  const raw = String(value || '').trim()
  if (raw === 'documentary' || raw === 'light' || raw === 'open' || raw === 'bloom') return raw
  return DEFAULT_NARRATION_TEMPERATURE
}

// 批次3 C：本函数提供「默认旁白 skill 写作指南」（profile.content 缺省值），由提调旁白 subagent 读取后
// 结合当前情境动态写出本轮旁白提示词，不再作为可直接喂正文模型的「成品提示词」。
// 这里只描述各类旁白追求的写作效果与风格要点；格式护栏（不输出 JSON/不替角色说话/优先聊天记录等）
// 统一由 narrationGeneration.buildSystemPrompt 注入，本处不重复，避免旧版三套重复长文本与旧词。
export function getDefaultNarrationPromptPrefix(kind: NarrationKind = 'environment'): string {
  if (kind === 'event_push') {
    return [
      '事件推进旁白：让当前场景自然浮现一个可被角色回应的新变化。',
      '承接聊天记录里已有的场景、氛围、人物状态与剧情进展，新变化要像情节的自然延伸，而非强行插入。',
      '可借环境异动、旁人反应、物件变化、声音光影、空间调度、局势暗示等方式让事件浮现，营造悬念、压迫或转折感。',
      '只推进外部世界与次要人物，不替主要角色新增动作、对白、决定或心理活动。'
    ].join('\n')
  }
  if (kind === 'appearance') {
    return [
      '人物在场旁白：聚焦人物的外貌、衣着、姿态、神态与可见在场状态。',
      '只在角色已有动作姿势的基础上细致刻画与延展，不新增动作、不改变姿势位置、不推进剧情。',
      '可写外貌细节、动作余韵、静止中的张力与受环境影响的细微变化；不写任何语言、对白或心理独白。',
      '语言细腻有画面感，句式长短有变化，像镜头停在人物身上放大已有状态。'
    ].join('\n')
  }
  if (kind === 'custom') {
    return '按本旁白 skill 的主题与风格，写一段可见旁白正文。'
  }
  return [
    '环境旁白：写当前地点、时间、天气与空间氛围。',
    '从视觉、听觉、气味、触感、光影、温度、空间层次、动静变化等角度展开具体细节，不堆砌“美丽/安静/昏暗/热闹”这类笼统词。',
    '可加入风动、光移、远声、气味变化等细微动态让画面鲜活；句式长短有变化，避免相同结构连续出现。',
    '让环境既被看见，也能让人感到它的情绪、季节、时间与隐藏氛围。'
  ].join('\n')
}

export function buildNarrationPromptLockedPreview(kind: NarrationKind = 'environment'): string {
  return [
    '{{当前时间}}',
    '{{当前天气}}',
    '{{当前地点}}',
    '{{场景变化提醒}}',
    '{{聊天记录}}',
    '{{文档库环境资料}}',
    '{{用户待润色内容或命中角色资料}}',
    '{{字数限制}}'
  ].filter(Boolean).join('\n')
}

function defaultProbabilityForFrequency(frequency: NarrationFrequency): number {
  if (frequency === 'active') return 45
  if (frequency === 'silent') return 0
  return 25
}

export function normalizeNarrationProbability(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback
  return !(value === false || value === 0 || value === '0' || value === 'false')
}

export function normalizeNarrationKind(value: unknown): NarrationKind {
  const raw = String(value || '').trim()
  if (raw === 'appearance' || raw === 'event_push' || raw === 'custom') return raw
  return 'environment'
}

export function normalizeBuiltinNarrationKind(value: unknown): BuiltinNarrationKind {
  const raw = String(value || '').trim()
  if (raw === 'appearance' || raw === 'event_push') return raw
  return 'environment'
}

function defaultNameForKind(kind: NarrationKind): string {
  if (kind === 'event_push') return '事件推进'
  if (kind === 'appearance') return '人物描写'
  if (kind === 'custom') return '自定义旁白'
  return '环境描写'
}

export function getDefaultNarrationTriggerDescription(kind: NarrationKind = 'environment'): string {
  if (kind === 'event_push') {
    return '当当前场景需要出现外部事件、世界变化、线索推进、危机逼近或能被角色回应的新变化时读取。'
  }
  if (kind === 'appearance') {
    return '当聊天窗口里有人物外貌、衣着、姿态、神态或可见在场状态值得被细致刻画时读取。'
  }
  if (kind === 'custom') {
    return '当当前上下文命中这个自定义旁白 skill 的主题、风格或场景要求时读取。'
  }
  return '当当前场景的时间、天气、地点、空间氛围或环境细节需要被补足，让角色回复前有清晰舞台感时读取。'
}

function defaultIdForKind(kind: NarrationKind): string {
  if (kind === 'event_push') return 'event_push'
  if (kind === 'appearance') return 'appearance'
  if (kind === 'custom') return `custom_${Date.now().toString(36)}`
  return 'environment'
}

export function createDefaultNarrationProfile(input: {
  kind?: NarrationKind
  frequency?: unknown
  temperature?: unknown
} = {}): NarrationProfile {
  const kind = normalizeNarrationKind(input.kind)
  return {
    id: defaultIdForKind(kind),
    name: defaultNameForKind(kind),
    triggerDescription: getDefaultNarrationTriggerDescription(kind),
    content: getDefaultNarrationPromptPrefix(kind)
  }
}

export function normalizeNarrationProfile(raw: unknown, index = 0): NarrationProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const kind = normalizeNarrationKind(source.kind || source.id)
  const id = String(source.id || '').trim() || `narration_${kind}_${index + 1}`
  const name = String(source.name || '').trim() || NARRATION_KIND_OPTIONS.find((item) => item.value === kind)?.label || '旁白'
  const triggerDescription = String(
    source.triggerDescription
      ?? source.trigger_description
      ?? source.description
      ?? source.keyword
      ?? ''
  ).trim() || getDefaultNarrationTriggerDescription(kind)
  const content = String(
    source.content
      ?? source.body
      ?? source.promptContent
      ?? source.prompt_content
      ?? source.promptPrefix
      ?? source.prompt_prefix
      ?? ''
  ).trim() || getDefaultNarrationPromptPrefix(kind)
  return {
    id,
    name: name || defaultNameForKind(kind),
    triggerDescription,
    content
  }
}

export function normalizeNarrationProfiles(value: unknown, fallback: {
  frequency?: unknown
  temperature?: unknown
} = {}): NarrationProfile[] {
  let raw = value
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) raw = []
    else {
      try {
        raw = JSON.parse(text)
      } catch {
        raw = []
      }
    }
  }
  const profiles = Array.isArray(raw)
    ? raw.map((item, index) => normalizeNarrationProfile(item, index)).filter((item): item is NarrationProfile => Boolean(item))
    : []
  const usedBuiltin = new Set<string>()
  const customProfiles: NarrationProfile[] = []
  const byBuiltin = new Map<BuiltinNarrationKind, NarrationProfile>()
  profiles.forEach((profile) => {
    const kind = normalizeNarrationKind(profile.id)
    if (kind === 'custom' || !['environment', 'appearance', 'event_push'].includes(profile.id)) {
      customProfiles.push(profile)
      return
    }
    const builtinKind = normalizeBuiltinNarrationKind(profile.id)
    if (usedBuiltin.has(builtinKind)) return
    usedBuiltin.add(builtinKind)
    byBuiltin.set(builtinKind, { ...profile, id: defaultIdForKind(builtinKind), name: profile.name || defaultNameForKind(builtinKind) })
  })
  const builtins: BuiltinNarrationKind[] = ['environment', 'appearance', 'event_push']
  return [
    ...builtins.map((kind) => byBuiltin.get(kind) || createDefaultNarrationProfile({ ...fallback, kind })),
    ...customProfiles
  ]
}

export function serializeNarrationProfiles(value: unknown, fallback: {
  frequency?: unknown
  temperature?: unknown
} = {}): string {
  return JSON.stringify(normalizeNarrationProfiles(value, fallback))
}

export function findNarrationProfileByKind(value: unknown, kind: BuiltinNarrationKind, fallback: {
  frequency?: unknown
  temperature?: unknown
} = {}): NarrationProfile {
  return normalizeNarrationProfiles(value, fallback).find((profile) => profile.id === kind) || createDefaultNarrationProfile({ ...fallback, kind })
}

export function shouldNarrationProfileEnterContext(profile: Partial<NarrationProfile> | null | undefined): boolean {
  return true
}
