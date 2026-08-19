/**
 * 角色大脑 AI 多轮召回管线
 *
 * 依赖：
 * - characterBrainRecallPrompts.ts  — 判断提示词构建
 * - characterBrainRecall.ts         — 候选卡投影
 * - characterBrain.ts               — 正文读取
 *
 * callAI 由 useAI.ts 注入，避免循环依赖。
 */

import type { AgentModelConfig, BrainDocumentRecord, BrainRecallCandidateCard, Character, ChatSessionTemporaryEntity, UserProfile } from '../types'
import type { DocLibraryRecallStructureOptions } from './characterBrainRecallStructure'
import { buildDocLibraryRecallStructureView } from './characterBrainRecallStructure'
import type {
  RecallActivityMetrics,
  InputIntentSnapshot,
  RecallActivityEvent,
  RecallActivityCandidateRef,
  RecallCandidateGenerationMode,
  RecallCandidateJudgment,
  RecallCandidateScoreBreakdown,
  RecallReadDecision,
  RecallPipelineResult,
  RecallRoundTrace,
  RecallTokenUsage,
  RecallActivityUnitRef
} from '../types/docBrain'
import { buildCharacterBrainRecallCandidateCards } from './characterBrainRecall'
import { buildCleanRecallPromptBlock } from './characterBrainRecallPromptBlock'
import { readRecallContentText } from './unitContentPort'
import type { RecallEmbeddingVectorCache } from './recallEmbeddingCache'
import { buildEmbeddingCacheScope } from '../utils/modelUsageConfig'

type MessageLike = {
  role?: string
  name?: string
  memberName?: string
  member_name?: string
  messageKind?: string
  message_kind?: string
  content?: string
  text?: string
}
type AiCallResult = string | {
  text?: string | null
  content?: string | null
  model?: string
  presetName?: string
  usage?: unknown
} | null
type EmbeddingCallResult = number[][] | {
  vectors?: number[][] | null
  data?: Array<{ embedding?: unknown; index?: number }> | null
  model?: string
  presetName?: string
  usage?: unknown
} | null
type CallAI = (messages: { role: string; content: string }[]) => Promise<AiCallResult>
export type CallEmbedding = (input: string[]) => Promise<EmbeddingCallResult>
type RecallPipelineOptions = {
  agentConfig?: Pick<AgentModelConfig, 'recallCandidateMode' | 'recallContentStrategy' | 'intentSnapshotMode' | 'enabled' | 'embeddingPresetId' | 'embeddingModel' | 'embeddingDimensions'> | null
  userProfile?: Partial<UserProfile> | null
  otherCharacters?: Array<Pick<Character, 'id' | 'name' | 'nicknames' | 'appearance'>> | null
  currentDate?: Date
  bodyBudgetChars?: number
  docLibraryStructure?: DocLibraryRecallStructureOptions
  sessionTemporaryEntities?: ChatSessionTemporaryEntity[]
  includeCandidateChanges?: boolean
  includeObservableProfiles?: boolean
  includeSessionTemporaryEntities?: boolean
  includeCharacterLocationArrangements?: boolean
  fixedCandidateRound?: number
  /** 候选裁判轮上限（1-5）：不传默认 5；聊天回复链路收紧为 3 以压缩长尾耗时。 */
  maxLoopRounds?: number
  preconfirmedCards?: BrainRecallCandidateCard[]
  preconfirmedReadDecisions?: Record<string, RecallReadDecision>
  onConfirmedCards?: (payload: {
    cards: BrainRecallCandidateCard[]
    readDecisions: Record<string, RecallReadDecision>
    contentMap: Map<string, string>
  }) => void
  embedTexts?: CallEmbedding
  fallbackJudgeAI?: CallAI
  intentSnapshotAI?: CallAI
  candidateJudgeAI?: CallAI
  embeddingVectorCache?: RecallEmbeddingVectorCache
  embeddingCacheScope?: string
  onActivityEvent?: (event: RecallActivityEvent) => void
  activityRunId?: string
  abortSignal?: AbortSignal
}

const TEMPORARY_ENTITY_KIND_LABELS: Record<string, string> = {
  character: '角色',
  building: '建筑',
  region: '地理区域',
  faction: '势力',
  item: '物品'
}

const MAX_RECALL_LOOP_ROUNDS = 5
const DEFAULT_CANDIDATE_LIMIT = 50
const INCLUDE_SUMMARY_SCORE_THRESHOLD = 0.4
const INCLUDE_BODY_SCORE_THRESHOLD = 0.6
const INCLUDE_SUMMARY_SCORE_MIN_THRESHOLD = 0.2
const INCLUDE_BODY_SCORE_MIN_THRESHOLD = 0.4
const EXPAND_SCORE_THRESHOLD = 0.48
const SCHEDULE_ACTIVATION_SUMMARY_SCORE = INCLUDE_SUMMARY_SCORE_THRESHOLD + 0.04
const EMBEDDING_FIRST_PRIMARY_LIMIT = 24
const PARALLEL_EMBEDDING_GUARD_LIMIT = 10
const CORE_GUARD_LIMIT = 12
const TRACE_GUARD_LIMIT = 6
const STRUCTURE_GUARD_LIMIT = 6
const WORLD_DOMAIN_GUARD_LIMIT = 8
const BASELINE_CORE_GUARD_LIMIT = 5
const OBSERVABLE_PROFILE_GUARD_LIMIT = 4
const LLM_JUDGMENT_CHUNK_SIZE = 8
/** 轮内裁判分块并发上限：聊天回复链路里召回与编排器、旁白陪跑、嵌入调用并行，
 *  共享浏览器同域 ≈6 连接预算（见 replyPlanOrchestratorHarness 的并发注释），必须留余量，不得占满。 */
const RECALL_JUDGE_CHUNK_CONCURRENCY = 3
const RECALL_PRIORITY_BY_ROUND: Record<number, BrainRecallCandidateCard['recallPriorityMark']> = {
  1: 's',
  2: 'a',
  3: 'b',
  4: 'c'
}
const RECALL_PRIORITY_DECAY: Record<'s' | 'a' | 'b' | 'c', 'a' | 'b' | 'c' | ''> = {
  s: 'a',
  a: 'b',
  b: 'c',
  c: ''
}
const RUNTIME_USER_ANCHOR_CAP = 0.08
const RUNTIME_OTHER_ANCHOR_CAP = 0.06
const RUNTIME_WORLD_ENTITY_CAP = 0.05
const AGENT_SCORE_DELTA_POSITIVE_CAP = 0.2
const AGENT_SCORE_DELTA_NEGATIVE_CAP = 0.06

function normalizeFixedCandidateRound(value: unknown): number {
  const round = Math.floor(Number(value || 0))
  if (!Number.isFinite(round) || round <= 0) return 0
  return Math.min(MAX_RECALL_LOOP_ROUNDS, Math.max(1, round))
}

/** 轮上限收紧：未传或非法时回退硬上限 5；聊天回复链路传 3（角色大脑校准脚本不传，保持 5）。 */
function normalizeMaxLoopRounds(value: unknown): number {
  const rounds = Math.floor(Number(value || 0))
  if (!Number.isFinite(rounds) || rounds <= 0) return MAX_RECALL_LOOP_ROUNDS
  return Math.min(MAX_RECALL_LOOP_ROUNDS, Math.max(1, rounds))
}

/** 简单并发池：按 limit 并发执行任务；任一任务抛错（如召回中止）立即向外传播。 */
async function runWithConcurrencyLimit(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (nextIndex < tasks.length) {
      const task = tasks[nextIndex]
      nextIndex += 1
      await task()
    }
  })
  await Promise.all(workers)
}

type RuntimeAnchorContext = {
  userNames: string[]
  otherRoleNames: string[]
}

type ObservableProfileOption = {
  id: string
  name: string
  nicknames?: string
  appearance?: string
  inScene?: boolean
  subjectType: 'user' | 'character'
}

type RecallJudgeResult<T extends { id: string }> = {
  judgments: T[]
  model?: string
  presetName?: string
  usage?: RecallTokenUsage
  rawTextPreview?: string
}

// ── 工具 ─────────────────────────────────────────────────────────────────────

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function formatPromptScoreValue(value: unknown): string {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return ''
  const rounded = Math.round(numberValue * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function stripAssistantThoughtBlocks(value: unknown): string {
  return toText(value)
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think>[\s\S]*$/gi, ' ')
    .trim()
}

function recallMessageText(message: MessageLike): string {
  const text = message.content ?? message.text
  return message.role === 'assistant'
    ? stripAssistantThoughtBlocks(text)
    : toText(text).trim()
}

function recallMessageKind(message: MessageLike): string {
  return toText(message.messageKind ?? message.message_kind, 'chat').trim() || 'chat'
}

function recallSpeakerName(message: MessageLike, fallback: string): string {
  return toText(message.name ?? message.memberName ?? message.member_name, fallback).trim() || fallback
}

/** 按真实聊天轮次收集最近 N 轮消息 */
export function collectMessagesByRounds<T extends { role?: string }>(messages: T[], roundCount: number): T[] {
  if (!messages.length || roundCount <= 0) return []
  const userIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') userIndices.push(i)
  }
  if (!userIndices.length) return messages
  const recentUserIndices = userIndices.slice(-roundCount)
  const startIndex = userIndices[0] === recentUserIndices[0] ? 0 : recentUserIndices[0]
  return messages.slice(startIndex)
}

/** 召回上下文构建：使用调用方传入的当前可见消息，不在这里再按轮次截断。 */
export function buildRecallContext(messages: MessageLike[]): string {
  const recent = messages
    .filter((message) => recallMessageKind(message) !== 'narration_debug')
  if (!recent.length) return '（无最近对话记录）'
  return recent.map((m) => {
    const role = m.role === 'assistant'
      ? recallSpeakerName(m, 'AI')
      : recallSpeakerName(m, '用户')
    const text = recallMessageText(m).slice(0, 1000)
    return `${role}：${text}`
  }).join('\n')
}

function nowIso(): string {
  return new Date().toISOString()
}

function throwIfRecallAborted(options: RecallPipelineOptions): void {
  if (options.abortSignal?.aborted) {
    const error = new Error('召回已停止')
    error.name = 'AbortError'
    throw error
  }
}

function makeActivityRecorder(options: RecallPipelineOptions) {
  const runId = options.activityRunId || `recall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const events: RecallActivityEvent[] = []
  const started = new Map<string, RecallActivityEvent>()
  let seq = 0
  const emit = (event: RecallActivityEvent) => {
    events.push(event)
    options.onActivityEvent?.(event)
  }
  return {
    runId,
    events,
    start(stepKey: string, stepLabel: string, input?: unknown, parallelGroup?: string): string {
      seq += 1
      const id = `${runId}:${seq}:${stepKey}`
      const event: RecallActivityEvent = {
        id,
        runId,
        stepKey,
        stepLabel,
        status: 'started',
        parallelGroup,
        startedAt: nowIso(),
        input
      }
      started.set(id, event)
      emit(event)
      return id
    },
    complete(id: string, output?: unknown, metrics?: RecallActivityMetrics) {
      const startEvent = started.get(id)
      const completedAt = nowIso()
      const startedAt = startEvent?.startedAt || completedAt
      emit({
        id: `${id}:completed`,
        runId,
        stepKey: startEvent?.stepKey || id,
        stepLabel: startEvent?.stepLabel || id,
        status: 'completed',
        parallelGroup: startEvent?.parallelGroup,
        startedAt,
        completedAt,
        durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
        input: startEvent?.input,
        output,
        metrics
      })
      started.delete(id)
    },
    fail(id: string, error: unknown, metrics?: RecallActivityMetrics) {
      const startEvent = started.get(id)
      const completedAt = nowIso()
      const startedAt = startEvent?.startedAt || completedAt
      emit({
        id: `${id}:failed`,
        runId,
        stepKey: startEvent?.stepKey || id,
        stepLabel: startEvent?.stepLabel || id,
        status: 'failed',
        parallelGroup: startEvent?.parallelGroup,
        startedAt,
        completedAt,
        durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
        input: startEvent?.input,
        metrics,
        error: error instanceof Error ? error.message : String(error)
      })
      started.delete(id)
    }
  }
}

function normalizeRecallUsage(usage: unknown): RecallTokenUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const source = usage as Record<string, unknown>
  const toCount = (value: unknown) => {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
  }
  const promptTokens = toCount(source.promptTokens ?? source.prompt_tokens)
  const completionTokens = toCount(source.completionTokens ?? source.completion_tokens)
  const totalTokens = toCount(source.totalTokens ?? source.total_tokens) || promptTokens + completionTokens
  if (!promptTokens && !completionTokens && !totalTokens) return undefined
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costText: typeof source.costText === 'string' ? source.costText : undefined
  }
}

function mergeRecallUsages(usages: Array<RecallTokenUsage | undefined>): RecallTokenUsage | undefined {
  const valid = usages.filter((item): item is RecallTokenUsage => Boolean(item))
  if (!valid.length) return undefined
  return valid.reduce<RecallTokenUsage>((sum, item) => ({
    promptTokens: sum.promptTokens + item.promptTokens,
    completionTokens: sum.completionTokens + item.completionTokens,
    totalTokens: sum.totalTokens + (item.totalTokens || item.promptTokens + item.completionTokens)
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 })
}

function appendUniqueJudgments<T extends { id: string }>(base: T[], additions: T[]): T[] {
  const byId = new Map(base.map((item) => [item.id, item]))
  for (const item of additions) byId.set(item.id, item)
  return [...byId.values()]
}

function normalizeAiCallResult(result: AiCallResult): {
  text: string | null
  model?: string
  presetName?: string
  usage?: RecallTokenUsage
} {
  if (typeof result === 'string' || result === null) return { text: result }
  if (!result || typeof result !== 'object') return { text: null }
  return {
    text: typeof result.text === 'string' || result.text === null
      ? result.text
      : typeof result.content === 'string'
        ? result.content
        : null,
    model: result.model,
    presetName: result.presetName,
    usage: normalizeRecallUsage(result.usage)
  }
}

function normalizeEmbeddingCallResult(result: EmbeddingCallResult): {
  vectors: number[][] | null
  model?: string
  presetName?: string
  usage?: RecallTokenUsage
} {
  if (Array.isArray(result)) {
    return { vectors: result.filter(Array.isArray).map((vector) => vector.map(Number)) }
  }
  if (!result || typeof result !== 'object') return { vectors: null }
  const vectors = Array.isArray(result.vectors)
    ? result.vectors
    : Array.isArray(result.data)
      ? result.data
          .slice()
          .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
          .map((item) => Array.isArray(item.embedding) ? item.embedding.map(Number) : [])
      : null
  return {
    vectors: vectors ? vectors.filter(Array.isArray).map((vector) => vector.map(Number)) : null,
    model: result.model,
    presetName: result.presetName,
    usage: normalizeRecallUsage(result.usage)
  }
}

function uniqueStrings(values: string[], limit = 24): string[] {
  const result: string[] = []
  for (const value of values) {
    const text = value.trim()
    if (text && !result.includes(text)) result.push(text)
    if (result.length >= limit) break
  }
  return result
}

const EXPLICIT_TERM_STOP_PATTERNS = [
  /^(用户|AI|的事吗|的吗|什么|为什么|为何|怎么|那个|这个|一些|一点|真正|当前|本轮)$/,
  /^那么重要$/,
  /还记得/,
  /^如果有人/,
  /才懂这$/,
  /为什么.*(对她|对他)?$/,
  /^那件事/,
  /的事吗$/,
  /吗$/,
  /呢$/,
  /什么$/
]

function cleanExplicitTerm(value: string): string {
  return value
    .replace(/^(用户|AI)[：:]/, '')
    .replace(/[？?！!，,。；;：:\s]+/g, '')
    .trim()
}

function isUsefulExplicitTerm(value: string): boolean {
  const term = cleanExplicitTerm(value)
  if (term.length < 2 || term.length > 14) return false
  if (EXPLICIT_TERM_STOP_PATTERNS.some((pattern) => pattern.test(term))) return false
  if (/^(她|他|它|他们|她们|我们|你们)$/.test(term)) return false
  return true
}

function extractExplicitTerms(text: string): string[] {
  const focusedPhrases = [
    ...text.match(/[“"]([^”"]{2,18})[”"]/g)?.map((item) => item.replace(/[“”"]/g, '')) || [],
    ...text.match(/第一次[^，。？！?]{0,16}(?:家书|写信|信件|档案室|老人)/g) || [],
    ...text.match(/帮[^，。？！?]{0,10}(?:老人|别人|对方)[^，。？！?]{0,10}(?:写家书|写信|整理家书)/g) || [],
    ...text.match(/(?:写家书|整理家书|代写书信|档案室|旧资料|重要转折|长期影响|真正的学者|退开|学者)/g) || []
  ].map(cleanExplicitTerm)
  const cn = (text.match(/[\u4e00-\u9fa5]{2,8}/g) || [])
    .map(cleanExplicitTerm)
    .filter(isUsefulExplicitTerm)
  const en = text.match(/[A-Za-z][A-Za-z0-9_-]{1,24}/g) || []
  const timeWords = text.match(/\d{2,4}年|\d{1,2}月|\d{1,2}日|今天|现在|刚才|以前|后来|最近|明天|昨天/g) || []
  return uniqueStrings([...timeWords, ...focusedPhrases, ...cn, ...en], 32)
}

function lastUserText(messages: MessageLike[]): string {
  const last = messages.slice().reverse().find((message) => message.role === 'user' && recallMessageKind(message) !== 'narration_debug')
  return last ? recallMessageText(last) : ''
}

function resolveSnapshotUserName(options?: Pick<RecallPipelineOptions, 'userProfile'>): string {
  const userProfile = options?.userProfile || {}
  return toText(
    userProfile.name
      || userProfile.displayName
      || (userProfile as Record<string, unknown>).nickname
      || '用户'
  ).trim() || '用户'
}

function buildCurrentUserInputContext(messages: MessageLike[], options?: Pick<RecallPipelineOptions, 'userProfile'>): string {
  const userText = lastUserText(messages)
  if (!userText) return '（无本轮用户输入）'
  return `${resolveSnapshotUserName(options)}：${userText}`
}

function inferTargetSubject(text: string, context: string): string {
  if (/惊雨|小雨/.test(text)) return '惊雨'
  if (/[她他]/.test(text)) {
    const names = context.match(/惊雨|小雨/g) || []
    if (names.length) return '惊雨'
    return '当前角色'
  }
  const explicitName = text.match(/[\u4e00-\u9fa5]{2,4}(?=为什么|怎么|记得|会|是|的)/)?.[0]
  return explicitName && !/^(真正|如果|有人|这个|那个)$/.test(explicitName) ? explicitName : ''
}

function inferTargetEvent(text: string): string {
  const patterns = [
    /(?:听到|有人说|随口说)[^，。？！?]{0,24}(?:退开|躲开|沉默|不安)/,
    /第一次[^，。？！?]{0,16}(?:家书|写信|信件)/,
    /帮[^，。？！?]{0,10}(?:老人|别人|对方)[^，。？！?]{0,10}(?:写家书|写信|整理家书)/,
    /(?:写家书|整理家书|代写书信|整理旧资料|提档案室)/
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[0]
    if (match) return cleanExplicitTerm(match)
  }
  return ''
}

type WorldIntentDomain = NonNullable<InputIntentSnapshot['worldDomains']>[number]
type RoleIntentDomain = NonNullable<InputIntentSnapshot['roleDomains']>[number]

interface StructuredIntentClassification {
  worldIntentLevel: NonNullable<InputIntentSnapshot['worldIntentLevel']>
  worldDomains: WorldIntentDomain[]
  roleIntentLevel: NonNullable<InputIntentSnapshot['roleIntentLevel']>
  roleDomains: RoleIntentDomain[]
  mixedRoleWorldIntent: boolean
}

function classifyStructuredIntent(text: string, flags: {
  hasPast: boolean
  hasWhy: boolean
  hasSetting: boolean
  hasTime: boolean
  hasRelation: boolean
  hasChange: boolean
  hasObjectFeeling: boolean
  hasInteractionReaction: boolean
  hasChangeInquiry: boolean
  hasBeliefSource: boolean
  hasWorldAffectsRoleAction: boolean
  isSpecificEvent: boolean
  explicitTermCount: number
}): StructuredIntentClassification {
  const worldDomains = uniqueStrings([
    /世界|地理|地图|地名|地点|地方|大陆|大洲|海洋|大洋|海流|洋流|潮流|潮汐|山脉|国家|帝国|首都|区域|城市/.test(text) ? 'geography' : '',
    /教育|学院|大学|学舍|学者|考试|分流/.test(text) ? 'education' : '',
    /制度|体系|规则|概念|阶层|等级|律法|资格/.test(text) ? 'rule_system' : '',
    /城市|城区|功能区|分区|聚居|定居|建筑|设施/.test(text) ? 'settlement' : '',
    /自然|危险|风险|气候|灾害|洪水|雪崩|滑坡|风暴|高原|山地/.test(text) ? 'natural_risk' : '',
    /司能|能量|异能|能力体系|力量体系/.test(text) ? 'energy_system' : '',
    /社会|组织|机构|职业|岗位|出路|人生路径|身份制度|资源分配/.test(text) ? 'social_structure' : '',
    /旅行|路线|通行|迁徙|路程|交通|边境/.test(text) ? 'travel_context' : ''
  ] as WorldIntentDomain[], 8)
  const roleDomains = uniqueStrings([
    flags.hasPast || flags.isSpecificEvent ? 'personal_event' : '',
    flags.hasWhy || flags.hasChange ? 'motivation' : '',
    flags.hasSetting ? 'profile' : '',
    flags.hasRelation || flags.hasInteractionReaction ? 'relationship' : '',
    flags.hasTime && !flags.hasPast ? 'current_state' : '',
    flags.hasObjectFeeling || /物品|东西|带着|拿着|衣物|饰品|工具|痕迹|随身|衣服|衣着|包|扣|纸/.test(text) ? 'object_detail' : ''
  ] as RoleIntentDomain[], 8)
  const settingQuestion = /什么样|是什么|为什么|怎么|哪里|哪边|几块|几片|差别|差了什么|影响|需要担心|设定|规则|体系|制度|背景/.test(text)
  const worldIntentLevel: StructuredIntentClassification['worldIntentLevel'] = worldDomains.length >= 2 || (worldDomains.length >= 1 && settingQuestion)
    ? 'strong'
    : worldDomains.length >= 1
      ? 'weak'
      : 'none'
  const roleIntentLevel: StructuredIntentClassification['roleIntentLevel'] = roleDomains.length >= 2 || flags.hasWhy || flags.isSpecificEvent
    ? 'strong'
    : roleDomains.length >= 1 || flags.explicitTermCount > 0
      ? 'weak'
      : 'none'
  return {
    worldIntentLevel,
    worldDomains: worldDomains as WorldIntentDomain[],
    roleIntentLevel,
    roleDomains: roleDomains as RoleIntentDomain[],
    mixedRoleWorldIntent: worldIntentLevel !== 'none' && roleIntentLevel !== 'none'
  }
}

export function buildInputIntentSnapshot(messages: MessageLike[], options: Pick<RecallPipelineOptions, 'userProfile'> = {}): InputIntentSnapshot {
  const context = buildCurrentUserInputContext(messages, options)
  const userText = lastUserText(messages)
  const text = context.replace(/\s+/g, ' ')
  const terms = extractExplicitTerms(text)
  const hasTime = /今天|现在|刚才|以前|后来|最近|明天|昨天|\d{2,4}年|\d{1,2}月|\d{1,2}日/.test(text)
  const hasPast = /以前|过去|那次|当年|后来|曾经|回忆|记得/.test(text)
  const hasObjectFeeling = /(?:物品|东西|衣物|衣服|衣着|饰品|随身|包|扣|纸|工具|痕迹)[^。？！?]{0,24}(?:感觉|意义|象征|舍不得|珍惜|重要|喜欢|在意|对[她他]来说)|(?:感觉|意义|象征|舍不得|珍惜|重要|喜欢|在意)[^。？！?]{0,24}(?:物品|东西|衣物|衣服|衣着|饰品|随身|包|扣|纸|工具|痕迹)/.test(text)
  const hasInteractionReaction = /(?:如果|假如|突然|有人|我|你)[^。？！?]{0,30}(?:送|夸|问|追问|靠近|请求|要求|提起|说|指出)[^。？！?]{0,30}(?:会|怎么|是否|高兴|不安|回应|反应|退开|沉默)|(?:会|怎么)[^。？！?]{0,18}(?:回应|反应|高兴|不安|退开|沉默)/.test(text)
  const hasChangeInquiry = /(?:哪一步|什么时候开始|从[^。？！?]{1,24}到|开始变得|变得|变化|转变|后来怎么|一步开始)/.test(text)
  const hasBeliefSource = /(?:这句话|这句|说法|信念|想法|习惯|口头禅|为什么[^。？！?]{0,12}(?:说|觉得|相信)|从哪里来|哪里来的|由来|来源)/.test(text)
  const hasWorldAffectsRoleAction = /(?:会不会|是否|能不能|会|可能)[^。？！?]{0,24}(?:影响|阻碍|耽误|改变)[^。？！?]{0,24}(?:寄|送|回|旅行|去|到|联系|通信|行动|安排|见|值班)|(?:影响|阻碍|耽误|改变)[^。？！?]{0,24}(?:寄|送|回|旅行|去|到|联系|通信|行动|安排|见|值班)/.test(text)
  const hasChange = /变化|变成|后来|为什么会|怎么会|原因|动机/.test(text) || hasChangeInquiry
  const hasRelation = /关系|喜欢|讨厌|认识|信任|背叛|亲近|疏远|谁|送|夸奖|追问|秘密|人情/.test(text) || hasInteractionReaction
  const hasWhy = /为什么|原因|动机|怎么会|为何|从哪里来|哪里来的|由来|来源/.test(text) || hasBeliefSource
  const hasSetting = /设定|身份|性格|能力|背景|习惯|规则|世界|制度|体系/.test(text)
  const targetSubject = inferTargetSubject(userText || text, context)
  const targetEvent = inferTargetEvent(userText || text)
  const isSpecificEvent = Boolean(targetEvent) || /第一次|那次|这件事|那件事|某次/.test(text)
  const structuredIntent = classifyStructuredIntent(text, {
    hasPast,
    hasWhy,
    hasSetting,
    hasTime,
    hasRelation,
    hasChange,
    hasObjectFeeling,
    hasInteractionReaction,
    hasChangeInquiry,
    hasBeliefSource,
    hasWorldAffectsRoleAction,
    isSpecificEvent,
    explicitTermCount: terms.length
  })
  const hasStrongWorldIntent = structuredIntent.worldIntentLevel === 'strong'
  const hasAnyWorldIntent = structuredIntent.worldIntentLevel !== 'none'
  const intentTypes = uniqueStrings([
    hasWhy ? '动机解释' : '',
    hasPast ? '旧事件回忆' : '',
    hasStrongWorldIntent ? '世界设定查找' : '',
    hasSetting ? '设定解释' : '',
    hasObjectFeeling ? '物品情感意义' : '',
    hasInteractionReaction ? '互动反应判断' : '',
    hasChangeInquiry ? '变化过程追问' : '',
    hasBeliefSource ? '信念来源追问' : '',
    hasWorldAffectsRoleAction ? '世界条件影响角色行动' : '',
    hasTime && !hasPast ? '当前状态' : '',
    hasRelation ? '关系判断' : '',
    terms.length ? '事实查找' : '普通闲聊'
  ])
  const questionFocus = uniqueStrings([
    hasPast ? '事件经过' : '',
    hasWhy ? '为什么重要' : '',
    hasWhy ? '原因意义' : '',
    hasObjectFeeling ? '物品对角色的意义' : '',
    hasInteractionReaction ? '角色会怎样反应' : '',
    hasChangeInquiry ? '变化发生在哪一步' : '',
    hasBeliefSource ? '信念或习惯从哪里来' : '',
    hasWorldAffectsRoleAction ? '外部条件是否影响角色行动' : '',
    hasChange || hasWhy ? '长期影响' : '',
    hasRelation ? '关系变化' : ''
  ], 8)
  const granularity: InputIntentSnapshot['granularity'] = isSpecificEvent
    ? 'specific_event'
    : hasRelation
      ? 'relationship'
      : hasTime && !hasPast
        ? 'current_state'
        : hasSetting
          ? 'profile'
          : terms.length
            ? 'topic'
            : 'unknown'
  const abstractionLevel = hasWhy || hasSetting ? 0.72 : hasRelation ? 0.52 : terms.length >= 6 ? 0.34 : 0.22
  const temporalFocus: InputIntentSnapshot['temporalFocus'] = hasChange
    ? 'change'
    : hasPast
      ? 'past_event'
      : hasTime
        ? 'current'
        : 'none'
  const relationFocus: InputIntentSnapshot['relationFocus'] = hasRelation ? 'strong' : /和|对|向|给/.test(text) ? 'weak' : 'none'
  const ruleWeightHints = uniqueStrings([
    hasPast || hasChange ? 'prefer_trace' : '',
    hasSetting || hasWhy ? 'prefer_core' : '',
    hasRelation ? 'prefer_relation' : '',
    hasTime ? 'prefer_time' : '',
    hasAnyWorldIntent ? 'prefer_world' : '',
    abstractionLevel > 0.6 ? 'prefer_expansion' : ''
  ])
  const primaryRecallNeeds = uniqueStrings([
    granularity === 'specific_event' || hasPast ? '具体轨迹事件' : '',
    granularity === 'current_state' ? '当前状态资料' : '',
    hasRelation ? '关系资料' : '',
    hasObjectFeeling ? '物品细节资料' : '',
    hasInteractionReaction ? '互动反应资料' : '',
    hasChangeInquiry ? '变化过程资料' : '',
    hasBeliefSource ? '信念来源资料' : '',
    hasWorldAffectsRoleAction ? '世界条件资料' : '',
    hasWhy && !hasSetting ? '动机相关核心资料' : '',
    hasStrongWorldIntent ? '世界来源认知资料' : '',
    hasSetting && !hasPast && !hasStrongWorldIntent ? '核心设定资料' : ''
  ], 8)
  const secondaryRecallNeeds = uniqueStrings([
    hasWhy ? '经历' : '',
    hasWhy ? '性格' : '',
    hasWhy ? '能力或价值观' : '',
    hasObjectFeeling ? '情感来源' : '',
    hasObjectFeeling ? '相关旧经历' : '',
    hasObjectFeeling ? '相关习惯' : '',
    hasInteractionReaction ? '性格和背景' : '',
    hasChangeInquiry ? '关键经历' : '',
    hasBeliefSource ? '职业或生活经历' : '',
    hasWorldAffectsRoleAction ? '角色相关行动资料' : '',
    structuredIntent.mixedRoleWorldIntent && hasWhy ? '角色处境' : '',
    hasRelation ? '相关人物资料' : ''
  ], 8)
  const negativeRecallHints = uniqueStrings([
    granularity === 'specific_event' || hasWhy ? '外貌' : '',
    granularity === 'specific_event' || hasWhy ? '穿着' : '',
    (granularity === 'specific_event' || hasWhy) && structuredIntent.worldIntentLevel === 'none' ? '世界地理' : '',
    (granularity === 'specific_event' || hasWhy) && !structuredIntent.worldDomains.some((domain) => domain === 'education' || domain === 'rule_system') ? '制度设定' : ''
  ], 8)
  const expansionHint = granularity === 'specific_event'
    ? '如果候选只概括提到目标事件，应展开寻找更具体节点；如果摘要已经说明事件经过和意义，可直入。'
    : abstractionLevel > 0.6
      ? '如果候选摘要只给宽泛结论，应展开或转入更细资料。'
      : ''
  return {
    intentTypes,
    abstractionLevel,
    temporalFocus,
    relationFocus,
    worldIntentLevel: structuredIntent.worldIntentLevel,
    worldDomains: structuredIntent.worldDomains,
    roleIntentLevel: structuredIntent.roleIntentLevel,
    roleDomains: structuredIntent.roleDomains,
    mixedRoleWorldIntent: structuredIntent.mixedRoleWorldIntent,
    targetSubject,
    targetEvent,
    questionFocus,
    granularity,
    primaryRecallNeeds,
    secondaryRecallNeeds,
    negativeRecallHints,
    expansionHint,
    explicitTerms: terms,
    queryTextForEmbedding: uniqueStrings([
      ...intentTypes,
      targetSubject,
      targetEvent,
      ...questionFocus,
      ...primaryRecallNeeds,
      ...secondaryRecallNeeds,
      ...terms
    ], 18).join(' '),
    ruleWeightHints
  }
}

function parseReadDecision(value: unknown): RecallReadDecision | null {
  if (
    value === 'summary_only'
    || value === 'body_required'
    || value === 'body_if_budget'
    || value === 'skip_body'
  ) return value
  return null
}

function adjustedThreshold(base: number, minimum: number, agentIncludeDelta: number | undefined): number {
  const positiveDelta = Math.max(0, Number(agentIncludeDelta || 0))
  return Math.max(minimum, base - positiveDelta)
}

function includeSummaryThreshold(score: RecallCandidateScoreBreakdown | undefined): number {
  return adjustedThreshold(INCLUDE_SUMMARY_SCORE_THRESHOLD, INCLUDE_SUMMARY_SCORE_MIN_THRESHOLD, score?.agentIncludeDelta)
}

function includeBodyThreshold(score: RecallCandidateScoreBreakdown | undefined): number {
  return adjustedThreshold(INCLUDE_BODY_SCORE_THRESHOLD, INCLUDE_BODY_SCORE_MIN_THRESHOLD, score?.agentIncludeDelta)
}

function readDecisionFromIncludeScore(score: RecallCandidateScoreBreakdown | undefined): RecallReadDecision {
  return (score?.includeScore ?? score?.candidateBaseScore ?? 0) >= includeBodyThreshold(score)
    ? 'body_required'
    : 'summary_only'
}

function readDecisionFromScheduleActivation(card: BrainRecallCandidateCard): RecallReadDecision {
  if (card.scheduleActivation?.level === 'body') return 'body_required'
  return 'summary_only'
}

function isMustScheduleActivationCard(card: BrainRecallCandidateCard): boolean {
  return Boolean(card.scheduleActivation?.active && card.scheduleActivation.priority === 'must')
}

function isRoleBrainRecallPriorityCard(card: BrainRecallCandidateCard): boolean {
  return card.k === 'character_core'
    || card.k === 'character_soul'
    || card.k === 'character_trace'
    || card.k === 'character_arrangement'
}

function buildRecallPriorityUpdates(
  cards: BrainRecallCandidateCard[],
  confirmedIds: Set<string>
): Record<string, 's' | 'a' | 'b' | 'c' | ''> {
  const updates: Record<string, 's' | 'a' | 'b' | 'c' | ''> = {}
  for (const card of cards) {
    if (!isRoleBrainRecallPriorityCard(card)) continue
    if (confirmedIds.has(card.id)) {
      updates[card.id] = 's'
      continue
    }
    const mark = card.recallPriorityMark
    if (mark) {
      updates[card.id] = RECALL_PRIORITY_DECAY[mark]
    }
  }
  return updates
}

function buildCardEmbeddingText(card: BrainRecallCandidateCard): string {
  return [
    `类型：${card.k}`,
    `标题：${card.t}`,
    card.p ? `路径：${card.p}` : '',
    card.retrievalProfileText ? `检索画像：${card.retrievalProfileText}` : '',
    card.s ? `摘要：${card.s}` : '',
    card.tags?.length ? `标签：${card.tags.join('、')}` : '',
    card.relationHints?.length ? `关系提示：${card.relationHints.join('；')}` : ''
  ].filter(Boolean).join('\n').slice(0, 1800)
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildRecallEmbeddingCacheKey(scope: string, text: string): string {
  return `${scope || 'default'}:${stableHash(text)}`
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed.map((item) => toText(item).trim()).filter(Boolean) : []
  } catch {
    return trimmed.split(/[,\n，、]/).map((item) => item.trim()).filter(Boolean)
  }
}

function buildSessionTemporaryEntityRecallCards(items: ChatSessionTemporaryEntity[] = []): BrainRecallCandidateCard[] {
  const cards: BrainRecallCandidateCard[] = []
  for (const item of Array.isArray(items) ? items : []) {
      const id = toText(item.id).trim()
      const name = toText(item.name).trim()
      const markdown = toText(item.markdown).trim()
      if (!id || !name || !markdown || toText(item.status || 'active').trim() === 'deleted') continue
      const kind = toText(item.kind || 'character').trim() || 'character'
      const kindLabel = TEMPORARY_ENTITY_KIND_LABELS[kind] || '临时资料'
      const aliases = toStringArray(item.aliases ?? item.aliasesJson ?? item.aliases_json)
      const tags = uniqueStrings([
        kindLabel,
        ...toStringArray(item.tags ?? item.tagsJson ?? item.tags_json),
        ...aliases
      ], 18)
      const updatedAt = toText(item.updatedAt ?? item.updated_at ?? item.createdAt ?? item.created_at).trim()
      const summary = [
        `会话临时${kindLabel}：${name}`,
        aliases.length ? `别名：${aliases.join('、')}` : '',
        tags.length ? `标签：${tags.join('、')}` : ''
      ].filter(Boolean).join('；')
      cards.push({
        id: `session-temp-entity:${id}`,
        k: 'session_temporary_entity' as const,
        p: `/会话临时资料/${kindLabel}/${name}`,
        t: name,
        s: summary,
        tags,
        u: updatedAt || new Date(0).toISOString(),
        src: [id],
        relationHints: [],
        relatedNodeIds: [],
        retrievalProfileText: [
          `标题：${name}`,
          `类型：${kindLabel}`,
          aliases.length ? `别名：${aliases.join('、')}` : '',
          tags.length ? `标签：${tags.join('、')}` : ''
        ].filter(Boolean).join('\n').slice(0, 600),
        baselineRecallBoost: 0.08,
        evidenceReasons: ['session_temporary_entity'],
        isRecallable: true,
        bodyText: markdown
      })
  }
  return cards
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length)
  if (!length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < length; i++) {
    const l = Number(left[i] || 0)
    const r = Number(right[i] || 0)
    dot += l * r
    leftNorm += l * l
    rightNorm += r * r
  }
  if (!leftNorm || !rightNorm) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

export async function scoreCardsByEmbedding(
  compressedContext: string,
  cards: BrainRecallCandidateCard[],
  embedTexts?: CallEmbedding,
  vectorCache?: RecallEmbeddingVectorCache,
  cacheScope = 'default'
): Promise<{
  scores: Map<string, number>
  calls: RecallActivityMetrics[]
  usageTotal?: RecallTokenUsage
  cacheHits: number
  cacheMisses: number
}> {
  if (!embedTexts || !cards.length) return { scores: new Map(), calls: [], cacheHits: 0, cacheMisses: 0 }
  const calls: RecallActivityMetrics[] = []
  let cacheHits = 0
  let cacheMisses = 0
  try {
    const queryResult = normalizeEmbeddingCallResult(await embedTexts([compressedContext]))
    calls.push({
      model: queryResult.model,
      presetName: queryResult.presetName,
      usage: queryResult.usage,
      callCount: 1
    })
    const queryVector = Array.isArray(queryResult.vectors?.[0]) ? queryResult.vectors[0] : null
    if (!queryVector) return { scores: new Map(), calls, usageTotal: mergeRecallUsages(calls.map((call) => call.usage)), cacheHits, cacheMisses }
    const scores = new Map<string, number>()
    for (let i = 0; i < cards.length; i += 64) {
      const batch = cards.slice(i, i + 64)
      const cardTexts = batch.map(buildCardEmbeddingText)
      const cachedVectors = cardTexts.map((text) => {
        const cached = vectorCache?.getVector(buildRecallEmbeddingCacheKey(cacheScope, text)) || null
        if (cached) cacheHits += 1
        else cacheMisses += 1
        return cached
      })
      const missing = cardTexts
        .map((text, index) => ({ text, index }))
        .filter((item) => !cachedVectors[item.index])
      let batchCallMetrics: RecallActivityMetrics | null = null
      if (missing.length) {
        const batchResult = normalizeEmbeddingCallResult(await embedTexts(missing.map((item) => item.text)))
        batchCallMetrics = {
          model: batchResult.model,
          presetName: batchResult.presetName,
          usage: batchResult.usage,
          callCount: 1
        }
        if (Array.isArray(batchResult.vectors)) {
          missing.forEach((item, missingIndex) => {
            const vector = batchResult.vectors?.[missingIndex]
            if (Array.isArray(vector)) {
              cachedVectors[item.index] = vector
              vectorCache?.setVector(buildRecallEmbeddingCacheKey(cacheScope, item.text), vector)
            }
          })
        }
      }
      calls.push({
        model: batchCallMetrics?.model,
        presetName: batchCallMetrics?.presetName,
        usage: batchCallMetrics?.usage,
        callCount: missing.length ? 1 : 0
      })
      batch.forEach((card, index) => {
        const vector = cachedVectors[index]
        if (Array.isArray(vector)) scores.set(card.id, cosineSimilarity(queryVector, vector))
      })
    }
    return { scores, calls, usageTotal: mergeRecallUsages(calls.map((call) => call.usage)), cacheHits, cacheMisses }
  } catch {
    return { scores: new Map(), calls, usageTotal: mergeRecallUsages(calls.map((call) => call.usage)), cacheHits, cacheMisses }
  }
}

function cardSearchText(card: BrainRecallCandidateCard): string {
  return [
    card.t,
    card.p,
    card.retrievalProfileText,
    card.s,
    card.tags.join(' '),
    card.relationHints.join(' '),
    card.eventDate || '',
    card.u || ''
  ].join(' ').toLowerCase()
}

function isWorldSourcedCognitionCard(card: BrainRecallCandidateCard): boolean {
  return card.k === 'character_soul' && /(?:^|\/)世界树(?:\/|$)/u.test(card.p || '')
}

function inferWorldDomainsFromCard(card: BrainRecallCandidateCard): WorldIntentDomain[] {
  const text = cardSearchText(card)
  return uniqueStrings([
    /世界|地理|地图|地名|大陆|大洲|海洋|大洋|海流|洋流|潮流|潮汐|山脉|国家|帝国|首都|区域/.test(text) ? 'geography' : '',
    /教育|学院|大学|学舍|学者|考试|分流|课程/.test(text) ? 'education' : '',
    /制度|体系|规则|概念|阶层|等级|律法|资格/.test(text) ? 'rule_system' : '',
    /城市|城区|功能区|分区|聚居|定居|建筑|设施/.test(text) ? 'settlement' : '',
    /自然|危险|风险|气候|灾害|洪水|雪崩|滑坡|风暴|高原|山地/.test(text) ? 'natural_risk' : '',
    /司能|能量|异能|能力体系|力量体系/.test(text) ? 'energy_system' : '',
    /社会|组织|机构|职业|岗位|出路|人生路径|身份制度|资源分配/.test(text) ? 'social_structure' : '',
    /旅行|路线|通行|迁徙|路程|交通|边境/.test(text) ? 'travel_context' : ''
  ] as WorldIntentDomain[], 8) as WorldIntentDomain[]
}

function hasWorldRecallIntent(snapshot: InputIntentSnapshot): boolean {
  const excludesWorld = (snapshot.negativeRecallHints || []).some((hint) => /世界地理|制度设定/u.test(hint))
  if (snapshot.worldIntentLevel === 'strong') return true
  if (snapshot.worldIntentLevel === 'weak' && snapshot.mixedRoleWorldIntent && !excludesWorld) return true
  return false
}

function hasWorldDomainMatch(card: BrainRecallCandidateCard, snapshot: InputIntentSnapshot): boolean {
  const domains = snapshot.worldDomains || []
  if (!domains.length) return false
  const cardDomains = inferWorldDomainsFromCard(card)
  return cardDomains.some((domain) => domains.includes(domain))
}

function hasDirectIntentEvidence(card: BrainRecallCandidateCard, snapshot: InputIntentSnapshot): boolean {
  const searchText = cardSearchText(card)
  const targetHits = [snapshot.targetSubject, snapshot.targetEvent]
    .filter((term): term is string => Boolean(term))
    .some((term) => searchText.includes(term.toLowerCase()))
  const explicitHits = (snapshot.explicitTerms || []).filter((term) => searchText.includes(term.toLowerCase())).length
  return targetHits || explicitHits >= 2
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function quantile(values: number[], ratio: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * ratio))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sorted[lowerIndex]
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

function calibrateEmbeddingScores(rawScores: Map<string, number>): Map<string, number> {
  const values = [...rawScores.values()].filter((value) => Number.isFinite(value))
  if (!values.length) return new Map()
  const low = quantile(values, 0.1)
  const median = quantile(values, 0.5)
  const high = quantile(values, 0.9)
  const observedSpan = Math.max(0.001, high - low)
  const minimumHalfSpan = Math.max(0.035, observedSpan * 0.35)
  const lowAnchor = Math.min(low, median - minimumHalfSpan)
  const highAnchor = Math.max(high, median + minimumHalfSpan)
  const lowerSpan = Math.max(0.001, median - lowAnchor)
  const upperSpan = Math.max(0.001, highAnchor - median)
  const upperNormalizer = 1 - Math.exp(-1)
  const result = new Map<string, number>()
  for (const [id, raw] of rawScores) {
    if (!Number.isFinite(raw)) {
      result.set(id, 0)
      continue
    }
    if (raw < lowAnchor) {
      const belowRatio = (lowAnchor - raw) / lowerSpan
      result.set(id, clamp01(0.1 * Math.exp(-belowRatio * 1.35)))
      continue
    }
    if (raw < median) {
      const lowerRatio = clamp01((raw - lowAnchor) / lowerSpan)
      result.set(id, clamp01(0.1 + Math.pow(lowerRatio, 1.1) * 0.22))
      continue
    }
    const upperRatio = Math.max(0, (raw - median) / upperSpan)
    if (upperRatio <= 1) {
      const distanceCurve = (1 - Math.exp(-upperRatio)) / upperNormalizer
      result.set(id, clamp01(0.32 + distanceCurve * 0.26))
      continue
    }
    const extremeCurve = 1 - Math.exp(-(upperRatio - 1) * 0.45)
    result.set(id, Math.min(0.7, clamp01(0.58 + extremeCurve * 0.12)))
  }
  return result
}

function normalizeCompilePageScore(value: unknown): number {
  if (!Number.isFinite(Number(value))) return 0
  return clamp01(Number(value) / 100)
}

function normalizeNameLikeTerm(value: unknown): string {
  return toText(value).trim()
}

function splitNameLikeTerms(value: unknown): string[] {
  return toText(value)
    .split(/[\n,，、;；/|]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueRuntimeTerms(values: unknown[], limit = 16): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = normalizeNameLikeTerm(value)
    if (!text || text.length < 2 || text === '用户' || text === '用户') continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function buildRuntimeAnchorContext(
  currentCharacter: Character,
  options: RecallPipelineOptions
): RuntimeAnchorContext {
  const userProfile = options.userProfile || {}
  const userNames = uniqueRuntimeTerms([
    userProfile.displayName,
    userProfile.name,
    ...splitNameLikeTerms((userProfile as Record<string, unknown>).nicknames)
  ], 6)
  const currentCharacterId = toText((currentCharacter as unknown as Record<string, unknown>).id)
  const otherRoleNames = uniqueRuntimeTerms((options.otherCharacters || [])
    .filter((character) => toText(character.id) !== currentCharacterId)
    .flatMap((character) => [
      character.name,
      ...splitNameLikeTerms(character.nicknames)
    ]), 16)
  return { userNames, otherRoleNames }
}

function buildObservableProfiles(
  currentCharacter: Character,
  options: RecallPipelineOptions
): ObservableProfileOption[] {
  const result: ObservableProfileOption[] = []
  const currentCharacterId = toText((currentCharacter as unknown as Record<string, unknown>).id).trim()
  const userProfile = options.userProfile || {}
  const userAppearance = toText(userProfile.appearance).trim()
  if (userAppearance) {
    result.push({
      id: toText(userProfile.name || userProfile.displayName || 'user').trim() || 'user',
      name: toText(userProfile.name || userProfile.displayName, '用户').trim() || '用户',
      nicknames: toText((userProfile as Record<string, unknown>).nicknames),
      appearance: userAppearance,
      inScene: true,
      subjectType: 'user'
    })
  }
  for (const character of options.otherCharacters || []) {
    const subjectId = toText(character.id).trim()
    if (!subjectId || subjectId === currentCharacterId) continue
    const appearance = toText(character.appearance).trim()
    if (!appearance) continue
    result.push({
      id: subjectId,
      name: toText(character.name, '角色').trim() || '角色',
      nicknames: toText(character.nicknames),
      appearance,
      inScene: true,
      subjectType: 'character'
    })
  }
  return result
}

function buildRecallCardsForOptions(
  character: Character,
  documents: BrainDocumentRecord[],
  options: RecallPipelineOptions
): BrainRecallCandidateCard[] {
  const cards = buildCharacterBrainRecallCandidateCards(character, documents, {
    currentDate: options.currentDate,
    docLibraryStructure: options.docLibraryStructure,
    observableProfiles: options.includeObservableProfiles === false
      ? []
      : buildObservableProfiles(character, options),
    includeCandidateChanges: options.includeCandidateChanges,
    includeObservableProfiles: options.includeObservableProfiles
  })
  const filteredCards = options.includeCharacterLocationArrangements === false
    ? cards.filter((card) => card.k !== 'character_arrangement')
    : cards
  if (options.includeSessionTemporaryEntities === false) return filteredCards
  return filteredCards.concat(buildSessionTemporaryEntityRecallCards(options.sessionTemporaryEntities || []))
}

function mergePreconfirmedCards(
  cards: BrainRecallCandidateCard[],
  preconfirmedCards: BrainRecallCandidateCard[] = []
): BrainRecallCandidateCard[] {
  if (!preconfirmedCards.length) return cards
  const byId = new Map(cards.map((card) => [card.id, card]))
  for (const card of preconfirmedCards) {
    if (!card?.id || byId.has(card.id)) continue
    byId.set(card.id, card)
  }
  return [...byId.values()]
}

function cardRuntimeAnchorText(card: BrainRecallCandidateCard): string {
  return [
    card.s,
    ...(card.tags || []),
    card.k
  ].join(' ').toLowerCase()
}

function countRuntimeTermHits(text: string, terms: string[]): number {
  if (!text || !terms.length) return 0
  return terms.filter((term) => text.includes(term.toLowerCase())).length
}

function inferWorldEntityHits(card: BrainRecallCandidateCard): number {
  const text = cardRuntimeAnchorText(card)
  const tagHits = (card.tags || []).filter((tag) => /地点|地方|地名|城市|国家|地区|区域|组织|势力|机构|学院|家族|王国|帝国|公会|教团|军团|商会/u.test(tag)).length
  const typeHit = /worldview_place|worldview_organization|organization|settlement|region|polity|地点|地方|地名|城市|国家|组织|势力|机构|学院|家族|王国|帝国|公会|教团|军团|商会/u.test(text) ? 1 : 0
  return tagHits + typeHit
}

function buildCompileScoreDefaults(
  card: BrainRecallCandidateCard,
  runtimeAnchors: RuntimeAnchorContext
) {
  const directBase = normalizeCompilePageScore(card.compileScore?.scoreDirectBase)
  const expandBase = normalizeCompilePageScore(card.compileScore?.scoreExpandBase)
  const selfAnchor = normalizeCompilePageScore(card.compileScore?.scoreSelfAnchor)
  const userAnchor = normalizeCompilePageScore(card.compileScore?.scoreUserAnchor)
  const otherAnchor = normalizeCompilePageScore(card.compileScore?.scoreOtherAnchor)
  const runtimeText = cardRuntimeAnchorText(card)
  const runtimeUserAnchor = clamp01(Math.min(userAnchor, RUNTIME_USER_ANCHOR_CAP) * Math.min(1, countRuntimeTermHits(runtimeText, runtimeAnchors.userNames)))
  const runtimeOtherAnchor = clamp01(Math.min(otherAnchor, RUNTIME_OTHER_ANCHOR_CAP) * Math.min(1, countRuntimeTermHits(runtimeText, runtimeAnchors.otherRoleNames)))
  const observableInSceneBoost = card.k === 'observable_profile' && (card.subjectType === 'user' || card.subjectType === 'character')
    ? 0.04
    : 0
  const runtimeWorldEntity = clamp01(Math.min(RUNTIME_WORLD_ENTITY_CAP, inferWorldEntityHits(card) * 0.025))
  const anchorTotal = clamp01(selfAnchor + runtimeUserAnchor + runtimeOtherAnchor + observableInSceneBoost + runtimeWorldEntity)
  return {
    directBase,
    expandBase,
    selfAnchor,
    userAnchor,
    otherAnchor,
    runtimeUserAnchor,
    runtimeOtherAnchor,
    observableInSceneBoost,
    runtimeWorldEntity,
    anchorTotal
  }
}

function scoreCardByRules(
  card: BrainRecallCandidateCard,
  snapshot: InputIntentSnapshot,
  runtimeAnchors: RuntimeAnchorContext
): RecallCandidateScoreBreakdown {
  const searchText = cardSearchText(card)
  const matchedTerms = snapshot.explicitTerms.filter((term) => searchText.includes(term.toLowerCase()))
  const baselineRecallBoost = clamp01(card.baselineRecallBoost || 0)
  const compileDefaults = buildCompileScoreDefaults(card, runtimeAnchors)
  const typeBoost = (
    snapshot.ruleWeightHints.includes('prefer_trace') && card.k === 'character_trace'
  ) || (
    snapshot.ruleWeightHints.includes('prefer_core') && card.k === 'character_core'
  ) || (
    snapshot.ruleWeightHints.includes('prefer_relation') && card.relationHints.length > 0
  )
  const ruleMatchScore = clamp01((matchedTerms.length / Math.max(3, snapshot.explicitTerms.length || 1)) + (typeBoost ? 0.24 : 0))
  const temporalRuleScore = clamp01(
    snapshot.temporalFocus === 'none'
      ? 0
      : card.k === 'character_trace' || card.eventDate || /今天|现在|最近|过去|后来/.test(searchText)
        ? 0.78
        : 0.16
  )
  const relationRuleScore = clamp01(
    snapshot.relationFocus === 'none'
      ? 0
      : card.relationHints.length || card.relatedNodeIds?.length
        ? 0.82
        : 0.18
  )
  const structurePriorityScore = clamp01(
    card.structureChildCount
      ? Math.min(0.8, 0.18 + card.structureChildCount / 20)
      : card.structureDepth !== undefined && card.structureDepth <= 2
        ? 0.24
        : 0.08
  )
  const includeScore = clamp01(
    ruleMatchScore * 0.45
    + temporalRuleScore * 0.10
    + relationRuleScore * 0.10
    + structurePriorityScore * 0.05
    + baselineRecallBoost
    + compileDefaults.directBase
    + compileDefaults.anchorTotal
  )
  const expandScore = clamp01(
    ruleMatchScore * 0.24
    + relationRuleScore * 0.08
    + structurePriorityScore * 0.18
    + compileDefaults.expandBase
    + compileDefaults.anchorTotal * 0.5
  )
  return {
      ruleMatchScore,
      embeddingIntentScore: 0,
      temporalRuleScore,
      relationRuleScore,
      structurePriorityScore,
      baselineRecallBoost,
      compileDirectBaseScore: compileDefaults.directBase,
      compileExpandBaseScore: compileDefaults.expandBase,
      selfAnchorScore: compileDefaults.selfAnchor,
      userAnchorScore: compileDefaults.userAnchor,
      otherAnchorScore: compileDefaults.otherAnchor,
      runtimeUserAnchorScore: compileDefaults.runtimeUserAnchor,
      runtimeOtherAnchorScore: compileDefaults.runtimeOtherAnchor,
      runtimeWorldEntityScore: compileDefaults.runtimeWorldEntity,
      compileAnchorScore: compileDefaults.anchorTotal,
      includeScore,
      expandScore,
      candidateBaseScore: includeScore
    }
  }

function applyScheduleActivationScores(
  cards: BrainRecallCandidateCard[],
  scores: Map<string, RecallCandidateScoreBreakdown>
): Map<string, RecallCandidateScoreBreakdown> {
  const next = new Map(scores)
  for (const card of cards) {
    const activation = card.scheduleActivation
    if (!activation?.active) continue
    const base = next.get(card.id)
    if (!base) continue
    const scheduleActivationScore = clamp01(activation.score)
    const targetIncludeScore = activation.priority === 'must'
      ? 1
      : Math.max(SCHEDULE_ACTIVATION_SUMMARY_SCORE, scheduleActivationScore)
    const includeScore = clamp01(Math.max(base.includeScore, targetIncludeScore))
    next.set(card.id, {
      ...base,
      scheduleActivationScore,
      includeScore,
      candidateBaseScore: includeScore
    })
  }
  return next
}

function cardRuntimeId(card: BrainRecallCandidateCard): string {
  return card.structureRuntimeId || card.id
}

function findCardByIdOrRuntimeId(cards: BrainRecallCandidateCard[], id: string): BrainRecallCandidateCard | undefined {
  return cards.find((card) => card.id === id || cardRuntimeId(card) === id)
}

function buildUnitRef(
  cards: BrainRecallCandidateCard[],
  scoreMap: Map<string, RecallCandidateScoreBreakdown>,
  id: string,
  readDecisions?: Record<string, RecallReadDecision>,
  contentMap?: Map<string, string>
): RecallActivityUnitRef {
  const card = findCardByIdOrRuntimeId(cards, id)
  const cardId = card?.id || id
  return {
    id: cardId,
    title: card?.t || id,
    ownerCharacterId: card?.ownerCharacterId,
    contentText: contentMap?.get(cardId) || '',
    summary: card?.s,
    readDecision: readDecisions?.[cardId],
    score: scoreMap.get(cardId)?.candidateBaseScore
  }
}

function buildCandidateRef(card: BrainRecallCandidateCard): RecallActivityCandidateRef {
  return {
    id: card.id,
    title: card.t || card.id
  }
}

function mergeCandidateScores(
  ruleScores: Map<string, RecallCandidateScoreBreakdown>,
  embeddingScores: Map<string, number>,
  mode: RecallCandidateGenerationMode,
  cards: BrainRecallCandidateCard[] = []
): Map<string, RecallCandidateScoreBreakdown> {
  const result = new Map<string, RecallCandidateScoreBreakdown>()
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const calibratedEmbeddingScores = calibrateEmbeddingScores(embeddingScores)
  const ids = new Set([...ruleScores.keys(), ...embeddingScores.keys()])
  for (const id of ids) {
    const base = ruleScores.get(id) || {
      ruleMatchScore: 0,
      rawEmbeddingScore: undefined,
      embeddingIntentScore: 0,
      temporalRuleScore: 0,
      relationRuleScore: 0,
      structurePriorityScore: 0,
      baselineRecallBoost: 0,
      compileDirectBaseScore: 0,
      compileExpandBaseScore: 0,
      selfAnchorScore: 0,
      userAnchorScore: 0,
      otherAnchorScore: 0,
      runtimeUserAnchorScore: 0,
      runtimeOtherAnchorScore: 0,
      runtimeWorldEntityScore: 0,
      compileAnchorScore: 0,
      scheduleActivationScore: 0,
      includeScore: 0,
      expandScore: 0,
      candidateBaseScore: 0
    }
    const rawEmbeddingScore = embeddingScores.get(id)
    const hasEmbeddingScore = embeddingScores.has(id)
    const embeddingIntentScore = calibratedEmbeddingScores.get(id) ?? 0
    const card = cardById.get(id)
    const hasExpandableChildren = Boolean(card?.structureChildCount)
    const manualDirectScore = clamp01(base.compileDirectBaseScore + base.compileAnchorScore)
    const manualExpandScore = clamp01(base.compileExpandBaseScore + base.compileAnchorScore * 0.5)
    const includeScore = mode === 'rules_first'
      ? hasEmbeddingScore
        ? clamp01(base.includeScore * 0.48 + embeddingIntentScore * 0.34 + manualDirectScore * 0.24 + base.ruleMatchScore * 0.04 + base.temporalRuleScore * 0.03 + base.relationRuleScore * 0.03)
        : base.includeScore
      : mode === 'embedding_first'
        ? hasEmbeddingScore
          ? clamp01(base.includeScore * 0.24 + embeddingIntentScore * 0.56 + manualDirectScore * 0.20 + base.ruleMatchScore * 0.02 + base.temporalRuleScore * 0.01 + base.relationRuleScore * 0.01)
          : base.includeScore
        : hasEmbeddingScore
          ? clamp01(base.includeScore * 0.34 + embeddingIntentScore * 0.46 + manualDirectScore * 0.35 + base.ruleMatchScore * 0.02 + base.temporalRuleScore * 0.02 + base.relationRuleScore * 0.02)
          : base.includeScore
    const expandScore = mode === 'rules_first'
      ? hasEmbeddingScore
        ? clamp01(base.expandScore * 0.55 + embeddingIntentScore * (hasExpandableChildren ? 0.25 : 0.08) + manualExpandScore * 0.18 + base.structurePriorityScore * 0.08 + base.relationRuleScore * 0.04)
        : base.expandScore
      : mode === 'embedding_first'
        ? hasEmbeddingScore
          ? clamp01(base.expandScore * 0.22 + embeddingIntentScore * (hasExpandableChildren ? 0.58 : 0.16) + manualExpandScore * 0.14 + base.structurePriorityScore * 0.12 + base.relationRuleScore * 0.04)
          : base.expandScore
        : hasEmbeddingScore
          ? clamp01(base.expandScore * 0.35 + embeddingIntentScore * (hasExpandableChildren ? 0.45 : 0.12) + manualExpandScore * 0.22 + base.structurePriorityScore * 0.12 + base.relationRuleScore * 0.04)
          : base.expandScore
    result.set(id, {
      ...base,
      ruleInitialIncludeScore: base.includeScore,
      ruleInitialExpandScore: base.expandScore,
      rawEmbeddingScore,
      embeddingIntentScore,
      scheduleActivationScore: base.scheduleActivationScore || 0,
      includeScore,
      expandScore,
      candidateBaseScore: includeScore
    })
  }
  return result
}

function applyAgentScoreCorrections(
  scores: Map<string, RecallCandidateScoreBreakdown>,
  judgments: RecallCandidateJudgment[]
): Map<string, RecallCandidateScoreBreakdown> {
  const next = new Map(scores)
  for (const judgment of judgments) {
    const score = next.get(judgment.id)
    if (!score) continue
    const includeDelta = clampScoreDelta(judgment.includeScoreDelta)
    const expandDelta = clampScoreDelta(judgment.expandScoreDelta)
    if (!includeDelta && !expandDelta) continue
    const includeScore = clamp01(score.includeScore + includeDelta)
    const expandScore = clamp01(score.expandScore + expandDelta)
    next.set(judgment.id, {
      ...score,
      agentIncludeDelta: clampScoreDelta((score.agentIncludeDelta || 0) + includeDelta),
      agentExpandDelta: clampScoreDelta((score.agentExpandDelta || 0) + expandDelta),
      includeScore,
      expandScore,
      candidateBaseScore: includeScore
    })
  }
  return next
}

function applyWorldSourceIntentGate(
  cards: BrainRecallCandidateCard[],
  scores: Map<string, RecallCandidateScoreBreakdown>,
  snapshot: InputIntentSnapshot
): Map<string, RecallCandidateScoreBreakdown> {
  if (hasWorldRecallIntent(snapshot)) return scores
  const next = new Map(scores)
  for (const card of cards) {
    if (!isWorldSourcedCognitionCard(card)) continue
    if (hasDirectIntentEvidence(card, snapshot)) continue
    const score = next.get(card.id)
    if (!score) continue
    next.set(card.id, {
      ...score,
      embeddingIntentScore: 0,
      structurePriorityScore: 0,
      baselineRecallBoost: 0,
      includeScore: 0,
      expandScore: 0,
      candidateBaseScore: 0
    })
  }
  return next
}

function buildWorldDomainGuardCards(
  candidates: { card: BrainRecallCandidateCard; score: number }[],
  scores: Map<string, RecallCandidateScoreBreakdown>,
  snapshot: InputIntentSnapshot,
  limit = WORLD_DOMAIN_GUARD_LIMIT
): BrainRecallCandidateCard[] {
  if (snapshot.worldIntentLevel === 'none' || !(snapshot.worldDomains || []).length) return []
  return candidates
    .filter((item) => isWorldSourcedCognitionCard(item.card))
    .filter((item) => hasWorldDomainMatch(item.card, snapshot) || hasDirectIntentEvidence(item.card, snapshot))
    .sort((a, b) => {
      const leftEmbedding = scores.get(a.card.id)?.embeddingIntentScore ?? 0
      const rightEmbedding = scores.get(b.card.id)?.embeddingIntentScore ?? 0
      const leftDirect = hasDirectIntentEvidence(a.card, snapshot) ? 1 : 0
      const rightDirect = hasDirectIntentEvidence(b.card, snapshot) ? 1 : 0
      const leftDomain = hasWorldDomainMatch(a.card, snapshot) ? 1 : 0
      const rightDomain = hasWorldDomainMatch(b.card, snapshot) ? 1 : 0
      return rightDirect - leftDirect
        || rightDomain - leftDomain
        || rightEmbedding - leftEmbedding
        || b.score - a.score
    })
    .slice(0, limit)
    .map((item) => item.card)
}

function normalizeRecallCandidateKeyword(value: unknown): string {
  return toText(value)
    .replace(/\[\[|\]\]/g, '')
    .replace(/[@#].*$/u, '')
    .trim()
    .toLowerCase()
}

function isWeakRecallCandidateKeyword(value: string): boolean {
  if (!value) return true
  if (/^(核心|灵魂|轨迹|分组|理解|资料|角色|事件|安排|当前|相关|普通|必须)$/u.test(value)) return true
  if (/^[a-z0-9_-]{1,2}$/iu.test(value)) return true
  return value.length < 2
}

function buildRecallCandidateKeywords(card: BrainRecallCandidateCard): string[] {
  return uniqueStrings([
    card.t,
    ...(card.tags || []),
    ...(card.relationHints || []).map((hint) => hint.replace(/^\[\[/u, '').replace(/\]\].*$/u, '')),
    ...toText(card.p).split(/[\/\\]/u)
  ].map(normalizeRecallCandidateKeyword).filter((item) => !isWeakRecallCandidateKeyword(item)), 18)
}

function hasDirectKeywordHit(card: BrainRecallCandidateCard, directHitText: string): boolean {
  if (!directHitText) return false
  return buildRecallCandidateKeywords(card).some((keyword) => directHitText.includes(keyword))
}

function resolveSectionRootId(card: BrainRecallCandidateCard): string {
  if (card.k === 'character_core') return 'brain:see_me'
  if (card.k === 'character_soul') return 'brain:cognition'
  return ''
}

function resolveSectionDepth(card: BrainRecallCandidateCard, cardByRuntimeId: Map<string, BrainRecallCandidateCard>): number | null {
  const rootId = resolveSectionRootId(card)
  if (!rootId) return null
  let depth = 1
  let parentId = card.parentRuntimeId || ''
  const seen = new Set<string>([card.structureRuntimeId || card.id])
  while (parentId) {
    if (parentId === rootId) return depth
    if (seen.has(parentId)) return null
    seen.add(parentId)
    const parent = cardByRuntimeId.get(parentId)
    if (!parent) return null
    parentId = parent.parentRuntimeId || ''
    depth += 1
  }
  return null
}

function parseRecallDate(value: unknown): Date | null {
  const text = toText(value).trim()
  const match = text.match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})/u)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBeforeCurrent(cardDateText: unknown, currentDate: Date): number | null {
  const cardDate = parseRecallDate(cardDateText)
  if (!cardDate || Number.isNaN(currentDate.getTime())) return null
  const current = new Date(0)
  current.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
  current.setHours(0, 0, 0, 0)
  return Math.floor((current.getTime() - cardDate.getTime()) / 86400000)
}

function isTraceCardInRoundWindow(card: BrainRecallCandidateCard, round: number, currentDate: Date): boolean {
  if (card.k !== 'character_trace' && card.k !== 'character_arrangement') return false
  const days = daysBeforeCurrent(card.eventDate, currentDate)
  if (days === null || days < 0) return false
  if (round === 1) return days <= 7
  if (round === 2) return days > 7 && days <= 30
  if (round === 3) return days > 30 && days <= 365
  const windowStart = 365 + (round - 4) * 365 * 3
  const windowEnd = windowStart + 365 * 3
  return days > windowStart && days <= windowEnd
}

function isFirstRoundSharedCard(card: BrainRecallCandidateCard): boolean {
  return card.k === 'session_temporary_entity' || card.k === 'observable_profile'
}

function isCardInRoundCandidatePool(
  card: BrainRecallCandidateCard,
  round: number,
  context: {
    cardByRuntimeId: Map<string, BrainRecallCandidateCard>
    currentDate: Date
    directHitText: string
  }
): boolean {
  if (hasDirectKeywordHit(card, context.directHitText)) return true
  const roundPriority = RECALL_PRIORITY_BY_ROUND[round]
  if (roundPriority && card.recallPriorityMark === roundPriority) return true
  if (round === 1 && isFirstRoundSharedCard(card)) return true
  if (card.k === 'character_core' || card.k === 'character_soul') {
    if (card.recallPriorityMark) return false
    return resolveSectionDepth(card, context.cardByRuntimeId) === round
  }
  return isTraceCardInRoundWindow(card, round, context.currentDate)
}

function sortPooledCandidateCards(
  candidates: { card: BrainRecallCandidateCard; score: number; directHit: boolean }[],
  scores: Map<string, RecallCandidateScoreBreakdown>,
  mode: RecallCandidateGenerationMode,
  snapshot: InputIntentSnapshot,
  limit = DEFAULT_CANDIDATE_LIMIT
): BrainRecallCandidateCard[] {
  const directHitCards = candidates
    .filter((item) => item.directHit)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.card)
  const scoredCandidates = candidates.map((item) => ({ card: item.card, score: item.score }))

  const result: BrainRecallCandidateCard[] = []
  const addCards = (items: BrainRecallCandidateCard[]) => {
    for (const card of items) {
      if (result.some((item) => item.id === card.id)) continue
      result.push(card)
      if (result.length >= limit) break
    }
  }
  const byBaseScore = scoredCandidates
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((item) => item.card)
  const byEmbeddingScore = scoredCandidates
    .slice()
    .sort((a, b) => {
      const left = scores.get(a.card.id)?.embeddingIntentScore ?? 0
      const right = scores.get(b.card.id)?.embeddingIntentScore ?? 0
      return right - left || b.score - a.score
    })
    .map((item) => item.card)
  const byCoreScore = scoredCandidates
    .filter((item) => item.card.k === 'character_core')
    .sort((a, b) => b.score - a.score)
    .map((item) => item.card)
  const byBaselineCoreGuard = scoredCandidates
    .filter((item) => item.card.k === 'character_core' && (item.card.baselineRecallBoost || 0) > 0)
    .sort((a, b) => (
      (b.card.baselineRecallBoost || 0) - (a.card.baselineRecallBoost || 0)
      || b.score - a.score
    ))
    .map((item) => item.card)
  const byObservableProfileGuard = scoredCandidates
    .filter((item) => item.card.k === 'observable_profile')
    .sort((a, b) => (
      (b.card.baselineRecallBoost || 0) - (a.card.baselineRecallBoost || 0)
      || (scores.get(b.card.id)?.embeddingIntentScore ?? 0) - (scores.get(a.card.id)?.embeddingIntentScore ?? 0)
      || b.score - a.score
    ))
    .map((item) => item.card)
  const byTraceScore = scoredCandidates
    .filter((item) => item.card.k === 'character_trace')
    .sort((a, b) => b.score - a.score)
    .map((item) => item.card)
  const byActiveSchedule = scoredCandidates
    .filter((item) => item.card.scheduleActivation?.active)
    .sort((a, b) => (
      (b.card.scheduleActivation?.score || 0) - (a.card.scheduleActivation?.score || 0)
      || b.score - a.score
    ))
    .map((item) => item.card)
  const byStructureScore = scoredCandidates
    .filter((item) => (item.card.structureChildCount || 0) > 0)
    .sort((a, b) => (
      b.score - a.score
      || (b.card.structureChildCount || 0) - (a.card.structureChildCount || 0)
    ))
    .map((item) => item.card)
  const byWorldDomainGuard = buildWorldDomainGuardCards(scoredCandidates, scores, snapshot)

  if (mode === 'embedding_first') {
    addCards(directHitCards)
    addCards(byActiveSchedule)
    addCards(byEmbeddingScore.slice(0, EMBEDDING_FIRST_PRIMARY_LIMIT))
    addCards(byWorldDomainGuard)
    addCards(byObservableProfileGuard.slice(0, OBSERVABLE_PROFILE_GUARD_LIMIT))
    addCards(byBaselineCoreGuard.slice(0, BASELINE_CORE_GUARD_LIMIT))
    addCards(byCoreScore.slice(0, CORE_GUARD_LIMIT))
    addCards(byTraceScore.slice(0, TRACE_GUARD_LIMIT))
    addCards(byStructureScore.slice(0, STRUCTURE_GUARD_LIMIT))
    addCards(byBaseScore)
    return result
  }

  if (mode === 'parallel_merge') {
    addCards(directHitCards)
    addCards(byActiveSchedule)
    addCards(byBaseScore.slice(0, limit - PARALLEL_EMBEDDING_GUARD_LIMIT - TRACE_GUARD_LIMIT - WORLD_DOMAIN_GUARD_LIMIT))
    addCards(byEmbeddingScore.slice(0, PARALLEL_EMBEDDING_GUARD_LIMIT))
    addCards(byWorldDomainGuard)
    addCards(byObservableProfileGuard.slice(0, OBSERVABLE_PROFILE_GUARD_LIMIT))
    addCards(byBaselineCoreGuard.slice(0, BASELINE_CORE_GUARD_LIMIT))
    addCards(byCoreScore.slice(0, CORE_GUARD_LIMIT))
    addCards(byTraceScore.slice(0, TRACE_GUARD_LIMIT))
    addCards(byStructureScore.slice(0, STRUCTURE_GUARD_LIMIT))
    addCards(byBaseScore)
    return result
  }

  addCards(directHitCards)
  addCards(byActiveSchedule)
  addCards(byBaseScore.slice(0, limit - CORE_GUARD_LIMIT - TRACE_GUARD_LIMIT))
  addCards(byWorldDomainGuard)
  addCards(byObservableProfileGuard.slice(0, OBSERVABLE_PROFILE_GUARD_LIMIT))
  addCards(byBaselineCoreGuard.slice(0, BASELINE_CORE_GUARD_LIMIT))
  addCards(byCoreScore.slice(0, CORE_GUARD_LIMIT))
  addCards(byTraceScore.slice(0, TRACE_GUARD_LIMIT))
  addCards(byStructureScore.slice(0, STRUCTURE_GUARD_LIMIT))
  addCards(byBaseScore)
  return result
}

function selectCandidateCards(
  cards: BrainRecallCandidateCard[],
  scores: Map<string, RecallCandidateScoreBreakdown>,
  alreadyJudged: Set<string>,
  round: number,
  mode: RecallCandidateGenerationMode,
  snapshot: InputIntentSnapshot,
  context: {
    cardByRuntimeId: Map<string, BrainRecallCandidateCard>
    currentDate: Date
    directHitText: string
  },
  limit = DEFAULT_CANDIDATE_LIMIT
): BrainRecallCandidateCard[] {
  const candidates = cards
    .filter((card) => !alreadyJudged.has(card.id))
    .filter((card) => isCardInRoundCandidatePool(card, round, context))
    .map((card) => ({
      card,
      score: scores.get(card.id)?.candidateBaseScore ?? 0,
      directHit: hasDirectKeywordHit(card, context.directHitText)
    }))

  return sortPooledCandidateCards(candidates, scores, mode, snapshot, limit)
}

function normalizeCandidateJudgmentItem(item: Record<string, unknown>): RecallCandidateJudgment {
  const id = toText(item.id).trim()
  const decision = toText(item.decision).trim()
  const parsedIncludeScoreDelta = normalizeAgentScoreDelta(item.includeScoreDelta ?? item.directCorrection ?? item.directDelta ?? item.includeDelta)
  const includeScoreDelta = parsedIncludeScoreDelta !== undefined
    ? parsedIncludeScoreDelta
    : decision === 'direct'
      ? 0.2
      : decision === 'reject'
        ? -0.2
        : undefined
  const parsedExpandScoreDelta = normalizeAgentScoreDelta(item.expandScoreDelta ?? item.expandCorrection ?? item.expandDelta)
    const rawExpandScoreDelta = parsedExpandScoreDelta !== undefined
    ? parsedExpandScoreDelta
    : decision === 'expand'
      ? 0.2
      : undefined
  const expandScoreDelta = rawExpandScoreDelta === undefined ? undefined : Math.max(0, rawExpandScoreDelta)
  const includeDecision: RecallCandidateJudgment['includeDecision'] = decision === 'direct'
    ? 'confirm'
    : decision === 'reject'
      ? 'reject'
      : item.includeDecision === 'confirm' || item.includeDecision === 'reject' ? item.includeDecision : 'uncertain'
  const expandDecision: RecallCandidateJudgment['expandDecision'] = decision === 'expand'
    ? 'expand'
    : decision === 'direct' || decision === 'reject'
      ? 'no_expand'
      : item.expandDecision === 'expand' || item.expandDecision === 'no_expand' ? item.expandDecision : 'uncertain'
  const summaryQuality: RecallCandidateJudgment['summaryQuality'] = item.summaryQuality === 'generic' || item.summaryQuality === 'missing_specific_fact' ? item.summaryQuality : 'enough'
  const readNeed: RecallCandidateJudgment['readNeed'] = item.readNeed === 'full_content' || item.readNeed === 'summary_only' ? item.readNeed : 'uncertain'
  const evidenceReasonCodes = Array.isArray(item.evidenceReasonCodes)
    ? item.evidenceReasonCodes.map((value) => toText(value)).map((x) => x.trim()).filter(Boolean).slice(0, 8)
    : toText(item.reason).trim() ? [toText(item.reason).trim().slice(0, 24)] : []
  return {
    id,
    includeDecision,
    expandDecision,
    summaryQuality,
    readNeed,
    evidenceReasonCodes,
    includeScoreDelta,
    expandScoreDelta,
    legacyDirectDecision: decision === 'direct',
    confidence: clamp01(Number(item.confidence ?? (decision === 'uncertain' ? 0.58 : 0.82)))
  }
}

function clampScoreDelta(value: number | undefined): number {
  if (!Number.isFinite(Number(value))) return 0
  return Math.max(-AGENT_SCORE_DELTA_NEGATIVE_CAP, Math.min(AGENT_SCORE_DELTA_POSITIVE_CAP, Number(value)))
}

function normalizeAgentScoreDelta(value: unknown): number | undefined {
  if (typeof value === 'number') return clampScoreDelta(value)
  const text = toText(value).trim()
  if (!text) return undefined
  if (/^(?:same|keep|保持|不变|0)$/iu.test(text)) return 0
  if (/^(?:tiny|trace|极轻|极弱|微|low|minor|small|小|轻微|low_mid|slight|偏低|稍有)$/iu.test(text)) return 0.09
  if (/^(?:medium|mid|中等|中)$/iu.test(text)) return 0.12
  if (/^(?:medium_high|strong|偏高|较强|明显)$/iu.test(text)) return 0.15
  if (/^(?:high|very_strong|高|很强|强相关)$/iu.test(text)) return 0.18
  if (/^(?:max|critical|最高|极强|直接命中)$/iu.test(text)) return 0.2
  if (/^(?:minus_tiny|微降|极轻降低|minus_low|降低|小降|轻微降低|minus_low_mid|稍降|偏低降低|minus_medium|中降|中等降低|minus_medium_high|明显降低|较强降低|minus_high|强降|严重误导|minus_max|极强降低|完全无关|严重污染)$/iu.test(text)) return -AGENT_SCORE_DELTA_NEGATIVE_CAP
  const numeric = Number(text.replace('%', ''))
  if (!Number.isFinite(numeric)) return undefined
  const normalized = Math.abs(numeric) > 1 ? numeric / 100 : numeric
  return clampScoreDelta(normalized)
}

function parseFixedLineScoreCorrectionItems(
  raw: string,
  codeToId: Map<string, string>
): Record<string, unknown>[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(C\d{2,})\s*[|｜]\s*([^|｜]+)\s*[|｜]\s*([^|｜]+)\s*[|｜]\s*(.*)$/i)
      if (!match) return []
      const code = match[1].toUpperCase()
      const id = codeToId.get(code)
      if (!id) return []
      return [{
        id,
        code,
        includeScoreDelta: normalizeAgentScoreDelta(match[2]),
        expandScoreDelta: normalizeAgentScoreDelta(match[3]),
        reason: match[4].trim()
      }]
    })
}

function parseCandidateJudgmentItems(rawItems: unknown[], candidateIds: Set<string>): RecallCandidateJudgment[] {
  return rawItems
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(normalizeCandidateJudgmentItem)
    .filter((item) => candidateIds.has(item.id))
}

function parseFixedLineDecisionItems(
  raw: string,
  codeToId: Map<string, string>,
  allowedDecisions: Set<string>
): Record<string, unknown>[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(C\d{2,})\s*[|｜]\s*([a-z_]+)\s*[|｜]\s*(.*)$/i)
      if (!match) return []
      const code = match[1].toUpperCase()
      const decision = match[2].toLowerCase()
      const id = codeToId.get(code)
      if (!id || !allowedDecisions.has(decision)) return []
      return [{
        id,
        code,
        decision,
        reason: match[3].trim()
      }]
    })
}

function parsePartialCandidateJudgments(raw: string, candidateIds: Set<string>, codeToId = new Map<string, string>()): RecallCandidateJudgment[] {
  const items = raw.match(/\{[^{}]*"(?:id|code)"\s*:\s*"[^"]+"[^{}]*\}/g) || []
  return parseCandidateJudgmentItems(
    items.flatMap((item) => {
      try {
        const parsed = JSON.parse(item) as Record<string, unknown>
        const code = toText(parsed.code).trim()
        const mappedId = codeToId.get(code)
        return [mappedId ? { ...parsed, id: mappedId } : parsed]
      } catch {
        return []
      }
    }),
    candidateIds
  )
}

function parseCandidateJudgments(raw: string | null, candidateIds: Set<string>, codeToId = new Map<string, string>()): RecallCandidateJudgment[] {
  if (!raw) return []
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      const scoreCorrectionItems = parseFixedLineScoreCorrectionItems(raw, codeToId)
      if (scoreCorrectionItems.length) return parseCandidateJudgmentItems(scoreCorrectionItems, candidateIds)
      const lineItems = parseFixedLineDecisionItems(raw, codeToId, new Set(['direct', 'expand', 'reject', 'uncertain']))
      if (lineItems.length) return parseCandidateJudgmentItems(lineItems, candidateIds)
      return parsePartialCandidateJudgments(raw, candidateIds, codeToId)
    }
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const rawItems = Array.isArray(parsed.judgments) ? parsed.judgments : []
    const normalizedItems = rawItems.map((item) => {
      if (!item || typeof item !== 'object') return item
      const record = item as Record<string, unknown>
      const code = toText(record.code).trim()
      const mappedId = codeToId.get(code)
      return mappedId ? { ...record, id: mappedId } : record
    })
    return parseCandidateJudgmentItems(normalizedItems, candidateIds)
  } catch {
    const patchedRaw = [...codeToId.entries()].reduce((text, [code, id]) => {
      return text.replace(new RegExp(`"code"\\s*:\\s*"${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'), `"id":"${id}"`)
    }, raw)
    return parsePartialCandidateJudgments(patchedRaw, candidateIds, codeToId)
  }
}

function readLegacyStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => toText(item).trim()).filter(Boolean) : []
}

function readLegacyNumber(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export async function runRecallJudgmentRound(
  input: {
    round: number
    compressedContext: string
    candidateCards: BrainRecallCandidateCard[]
    alreadyConfirmedIds?: string[]
  },
  callAI: CallAI
): Promise<{
  confirmed: string[]
  pending: string[]
  needMoreRounds: boolean
  confidence?: number
  marginalGain?: number
  stopReason?: string
  readDecisions: Record<string, RecallReadDecision>
}> {
  const candidateIds = new Set(input.candidateCards.map((card) => card.id))
  const result = normalizeAiCallResult(await callAI([{ role: 'user', content: input.compressedContext }]))
  if (!result.text) {
    return { confirmed: [], pending: [], needMoreRounds: false, readDecisions: {} }
  }
  try {
    const match = result.text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('invalid_json')
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const confirmed = readLegacyStringList(parsed.confirmed).filter((id) => candidateIds.has(id))
    const pending = readLegacyStringList(parsed.pending).filter((id) => candidateIds.has(id))
    const readDecisionSource = parsed.readDecision && typeof parsed.readDecision === 'object'
      ? parsed.readDecision as Record<string, unknown>
      : {}
    const readDecisions = Object.fromEntries(Object.entries(readDecisionSource)
      .filter(([id]) => candidateIds.has(id))
      .map(([id, value]) => [id, parseReadDecision(value) || 'summary_only']))
    return {
      confirmed,
      pending,
      needMoreRounds: parsed.needMoreRounds === true,
      confidence: readLegacyNumber(parsed.confidence),
      marginalGain: readLegacyNumber(parsed.marginalGain),
      stopReason: toText(parsed.stopReason).trim() || undefined,
      readDecisions
    }
  } catch {
    return { confirmed: [], pending: [], needMoreRounds: false, readDecisions: {} }
  }
}

function intentSnapshotForJudgment(snapshot: InputIntentSnapshot): string {
  const explicitTerms = snapshot.explicitTerms
    .map((term) => term.trim())
    .filter((term) => term && term !== '用户')
    .slice(0, 8)
  const temporalText: Record<InputIntentSnapshot['temporalFocus'], string> = {
    current: '当前状态',
    past_event: '旧事件',
    change: '变化原因',
    none: '无明显时间指向'
  }
  const granularityText: Record<NonNullable<InputIntentSnapshot['granularity']>, string> = {
    specific_event: '具体事件',
    topic: '主题解释',
    profile: '角色资料',
    relationship: '关系变化',
    current_state: '当前状态',
    unknown: '未明确'
  }
  const relationText: Record<InputIntentSnapshot['relationFocus'], string> = {
    none: '不是关系问题',
    weak: '关系是辅助背景',
    strong: '重点是关系变化'
  }
  const extensibilityText: Record<NonNullable<InputIntentSnapshot['intentExtensibility']>, string> = {
    low: '低，只按本轮输入的直接需求判断',
    medium: '中，可少量补角色稳定背景',
    high: '高，可补必要背景，但仍不能覆盖本轮输入'
  }
  const explainNeed = snapshot.abstractionLevel >= 0.68 ? '高，需要原因、意义、动机或长期影响' : snapshot.abstractionLevel >= 0.4 ? '中，需要事实加少量解释' : '低，优先找直接事实'
  return [
    snapshot.currentInputCompression ? `本轮输入：${snapshot.currentInputCompression}` : '',
    snapshot.recentContextCompression ? `最近上下文：${snapshot.recentContextCompression}` : '',
    `用户想要：${snapshot.intentTypes.join('、') || '未识别'}`,
    snapshot.targetSubject ? `目标对象：${snapshot.targetSubject}` : '',
    snapshot.targetEvent ? `目标事件：${snapshot.targetEvent}` : '',
    snapshot.questionFocus?.length ? `问题焦点：${snapshot.questionFocus.join('、')}` : '',
    snapshot.granularity ? `资料粒度：${granularityText[snapshot.granularity]}` : '',
    `时间指向：${temporalText[snapshot.temporalFocus]}`,
    `解释需求：${explainNeed}`,
    `关系需求：${relationText[snapshot.relationFocus]}`,
    snapshot.primaryRecallNeeds?.length ? `优先需要：${snapshot.primaryRecallNeeds.join('、')}` : '',
    snapshot.secondaryRecallNeeds?.length ? `辅助需要：${snapshot.secondaryRecallNeeds.join('、')}` : '',
    snapshot.negativeRecallHints?.length ? `应排除：${snapshot.negativeRecallHints.join('、')}` : '',
    snapshot.intentExtensibility ? `意图延展：${extensibilityText[snapshot.intentExtensibility]}` : '',
    snapshot.intentExtensionReason ? `延展依据：${snapshot.intentExtensionReason}` : '',
    `明确线索：${explicitTerms.length ? explicitTerms.join('、') : '无'}`
  ].filter(Boolean).join('\n')
}

function buildCandidateJudgmentPrompt(
  snapshot: InputIntentSnapshot,
  candidateCards: BrainRecallCandidateCard[],
  scoreMap: Map<string, RecallCandidateScoreBreakdown>
): { prompt: string; codeToId: Map<string, string> } {
  const codeToId = new Map<string, string>()
  const rows = candidateCards.map((card, index) => {
    const code = `C${String(index + 1).padStart(2, '0')}`
    codeToId.set(code, card.id)
    const includeScore = scoreMap.get(card.id)?.includeScore ?? scoreMap.get(card.id)?.candidateBaseScore ?? 0
    return `${code}｜当前直入分：${formatPromptScoreValue(includeScore) || '0'}｜摘要：${(card.s || card.t || '无摘要').slice(0, 160)}`
  }).join('\n')
  const prompt = `你会看到一段“用户本轮想知道什么”的说明，以及若干条“资料摘要”。

你的任务：
根据用户本轮想知道什么，以及每条资料摘要的内容，给每条资料摘要选择一个结果。

结果只能选四种：
- direct：这条摘要里的内容已经能直接帮助回答用户本轮问题。
- expand：这条摘要只是相关的宽泛概述，需要继续查看更具体的资料。
- uncertain：这条摘要有相关线索，但只凭摘要还不能确定是否应该使用。
- reject：这条摘要和用户本轮问题关系不够，或者不值得继续查看。

你现在只做分数修正，不决定流程停止。直入修正表示这条资料本身应不应该更接近最终回答，展开修正表示这条资料下级是否值得继续查看。
每条资料带有“当前直入分”，表示系统在你修正前认为这条资料进入本轮回答参考的可能性。分数越高，越接近最终进入参考；但它只供辅助，不能替代你按本轮问题和摘要内容判断。

评分标准：
- 0：摘要和本轮问题已经被当前分数准确表达，不需要修正；如果候选和本轮输入意图无关，绝对不能写 0，必须写负分。
- 0.09：有一点相关线索，或能帮助寒暄、短互动的角色基调、称呼关系、语气连续性。
- 0.12：摘要明确提供本轮需要的角色、关系、地点、组织、事件或物品线索。
- 0.15：摘要很可能进入本轮回答，或父级摘要明显提示下级藏着关键子项。
- 0.18：摘要直接回答本轮问题，或不展开就很可能漏掉核心资料。
- 0.20：摘要高度命中本轮输入意图，是本轮回答或继续展开的关键资料。
- 直入负分：摘要看似相关但对本轮回答无用、和输入意图无关、或会误导时，直入修正只能写 -0.06；当前直入分越高但越不相关，越应该扣，但单次扣分不得超过 -0.06。

直入修正只看“这条摘要本身是否能进入本轮回答参考”；展开修正只看“这条摘要是否提示下级还有必要继续查看”。两者可以不同，也可以都为 0。
展开修正暂时不能写负数；不值得展开就写 0，只通过直入修正扣分。
如果本轮输入是问候、寒暄、短互动或没有明确事实对象，角色的说话风格、性格、简介、称呼关系、当前状态这类稳定资料可以给 0.09 或 0.12；不要因为“没有事实问题”一律写 0。

用户本轮想知道什么：
${intentSnapshotForJudgment(snapshot)}

判断优先级：
1. 先看“本轮输入”和最近上下文本身，判断资料能否帮助当前回复。
2. 再看目标对象、问题焦点、明确线索和意图延展，它们只是辅助检索信号，不能替代本轮输入。
3. 如果本轮输入是角色短互动、无知提问、问候或承接句，角色简介、说话风格、性格、当前可观察外貌这类稳定资料可以加分；不要只因为资料“不是事件本身”就判无关。
4. 如果候选属于当前说话角色的稳定资料，且能约束语气、身份、反应方式或 OOC 防线，至少按弱相关处理，除非摘要明确与当前回复相冲突。

资料摘要：
${rows || '无'}

输出格式：
每条资料摘要必须输出一行，格式固定为：
编号 | 直入修正 | 展开修正 | 简短依据

强制要求：
- 必须给每一个编号都输出一行，不能漏。
- 编号只能使用资料摘要中出现的编号。
- 直入修正只能写 -0.06、0、0.09、0.12、0.15、0.18、0.20；展开修正只能写 0、0.09、0.12、0.15、0.18、0.20。
- 候选与输入意图无关时必须写负直入修正，不能写 0 或正数。
- 不要因为资料出现用户名字、其他角色名、地点或组织势力就给很高分；只在摘要本身确实相关时轻微修正。
- 简短依据不超过 20 个字。
- 只按本轮问题和摘要内容判断，不需要知道任何系统流程。
- 不要输出标题行。
- 禁止输出 <think>、思考过程或分析过程。
- 不要输出解释、分析过程或额外文字。`
  return { prompt, codeToId }
}

async function judgeCandidateChunk(
  snapshot: InputIntentSnapshot,
  candidateCards: BrainRecallCandidateCard[],
  scoreMap: Map<string, RecallCandidateScoreBreakdown>,
  callAI: CallAI
): Promise<RecallJudgeResult<RecallCandidateJudgment>> {
  const { prompt, codeToId } = buildCandidateJudgmentPrompt(snapshot, candidateCards, scoreMap)
  const result = normalizeAiCallResult(await callAI([{ role: 'user', content: prompt }]))
  return {
    judgments: parseCandidateJudgments(result.text, new Set(candidateCards.map((card) => card.id)), codeToId),
    model: result.model,
    presetName: result.presetName,
    usage: result.usage,
    rawTextPreview: result.text ? result.text.slice(0, 800) : ''
  }
}

const SMART_INTENT_ALLOWED_GRANULARITY = new Set(['specific_event', 'topic', 'profile', 'relationship', 'current_state', 'unknown'])
const SMART_INTENT_EXTENSIBILITY: Record<string, InputIntentSnapshot['intentExtensibility']> = {
  '低': 'low',
  low: 'low',
  '中': 'medium',
  medium: 'medium',
  mid: 'medium',
  '高': 'high',
  high: 'high'
}

function buildSmartIntentSnapshotPrompt(currentInputContext: string, ruleSnapshot: InputIntentSnapshot): string {
  return `你是角色资料召回前的输入意图快照助手。

你的任务：
只基于本轮用户输入，生成几行自然语言快照，帮助后续嵌入检索和候选裁判理解“用户本轮想知道什么”。

本轮用户输入：
${currentInputContext || '（无本轮用户输入）'}

规则快照参考：
${JSON.stringify({
  targetSubject: ruleSnapshot.targetSubject,
  targetEvent: ruleSnapshot.targetEvent,
  questionFocus: ruleSnapshot.questionFocus,
  primaryRecallNeeds: ruleSnapshot.primaryRecallNeeds,
  secondaryRecallNeeds: ruleSnapshot.secondaryRecallNeeds,
  explicitTerms: ruleSnapshot.explicitTerms
}, null, 2)}

只输出下面 4 行，不输出 JSON、标题、代码块或思考过程：
最近三轮压缩：一到两句话，非格式化自然语言。
本轮输入压缩：一到两句话；少于 30 字时可直接保留原句。
意图延展性：低 / 中 / 高。
延展依据：一句话说明为什么需要或不需要继续补背景。

约束：
- 不要编造专名。
- 不要给用户输入定分类；只压缩本轮语义和可检索重点。
- 不要读取、复述或推断系统审计信息、调试旁白、模型中间判断或规则快判。
- 普通问候如果需要保持当前角色身份、语气或关系，意图延展性应为中或高；如果只是复制、确认或改字，才是低。
- 字段要短，避免长句。`
}

function parseSmartIntentLineMap(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^([^:：]{2,12})[:：]\s*(.+)$/u)
    if (!match) continue
    result[match[1].trim()] = match[2].trim()
  }
  return result
}

function parseSmartIntentExtensibility(value: string): InputIntentSnapshot['intentExtensibility'] {
  const key = value.trim().toLowerCase()
  return SMART_INTENT_EXTENSIBILITY[key] || SMART_INTENT_EXTENSIBILITY[value.trim()] || 'medium'
}

function parseSmartIntentNaturalSnapshot(raw: string, ruleSnapshot: InputIntentSnapshot): InputIntentSnapshot | null {
  const map = parseSmartIntentLineMap(raw)
  const recentContextCompression = toText(map['最近三轮压缩']).trim()
  const currentInputCompression = toText(map['本轮输入压缩']).trim()
  if (!recentContextCompression && !currentInputCompression) return null
  const intentExtensibility = parseSmartIntentExtensibility(toText(map['意图延展性']).trim())
  const queryTextForEmbedding = uniqueStrings([
    currentInputCompression,
    intentExtensibility === 'high' ? '需要角色身份 语气 关系 背景' : '',
    intentExtensibility === 'medium' ? '需要少量角色背景' : '',
    ...ruleSnapshot.explicitTerms
  ], 8).join(' ').slice(0, 120)
  return {
    ...ruleSnapshot,
    intentTypes: [],
    recentContextCompression,
    currentInputCompression,
    intentExtensibility,
    intentExtensionReason: toText(map['延展依据']).trim().slice(0, 90),
    explicitTerms: ruleSnapshot.explicitTerms,
    queryTextForEmbedding: queryTextForEmbedding || ruleSnapshot.queryTextForEmbedding
  }
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value.map((item) => toText(item).trim()).filter(Boolean), limit)
}

function parseSmartIntentSnapshot(raw: string | null, ruleSnapshot: InputIntentSnapshot): InputIntentSnapshot | null {
  if (!raw) return null
  const naturalSnapshot = parseSmartIntentNaturalSnapshot(raw, ruleSnapshot)
  if (naturalSnapshot) return naturalSnapshot
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const granularity = toText(parsed.granularity).trim()
    const explicitTerms = asStringArray(parsed.explicitTerms, 8)
    const primaryRecallNeeds = asStringArray(parsed.primaryRecallNeeds, 5)
    const secondaryRecallNeeds = asStringArray(parsed.secondaryRecallNeeds, 5)
    const questionFocus = asStringArray(parsed.questionFocus, 4)
    const queryTextForEmbedding = toText(parsed.queryTextForEmbedding).trim()
    const mergedQuery = queryTextForEmbedding || uniqueStrings([
      toText(parsed.targetSubject),
      toText(parsed.targetEvent),
      ...questionFocus,
      ...primaryRecallNeeds,
      ...secondaryRecallNeeds,
      ...explicitTerms
    ], 16).join(' ')
    return {
      ...ruleSnapshot,
      targetSubject: toText(parsed.targetSubject).trim().slice(0, 24) || ruleSnapshot.targetSubject,
      targetEvent: toText(parsed.targetEvent).trim().slice(0, 40) || ruleSnapshot.targetEvent,
      questionFocus: questionFocus.length ? questionFocus : ruleSnapshot.questionFocus,
      granularity: SMART_INTENT_ALLOWED_GRANULARITY.has(granularity)
        ? granularity as NonNullable<InputIntentSnapshot['granularity']>
        : ruleSnapshot.granularity,
      primaryRecallNeeds: primaryRecallNeeds.length ? primaryRecallNeeds : ruleSnapshot.primaryRecallNeeds,
      secondaryRecallNeeds: secondaryRecallNeeds.length ? secondaryRecallNeeds : ruleSnapshot.secondaryRecallNeeds,
      negativeRecallHints: asStringArray(parsed.negativeRecallHints, 4),
      expansionHint: toText(parsed.expansionHint).trim().slice(0, 90) || ruleSnapshot.expansionHint,
      explicitTerms: explicitTerms.length ? explicitTerms : ruleSnapshot.explicitTerms,
      queryTextForEmbedding: mergedQuery.slice(0, 120) || ruleSnapshot.queryTextForEmbedding,
      ruleWeightHints: ruleSnapshot.ruleWeightHints
    }
  } catch {
    return null
  }
}

async function buildSmartInputIntentSnapshot(
  currentInputContext: string,
  ruleSnapshot: InputIntentSnapshot,
  callAI: CallAI
): Promise<{
  snapshot: InputIntentSnapshot | null
  model?: string
  presetName?: string
  usage?: RecallTokenUsage
  rawTextPreview?: string
}> {
  const prompt = buildSmartIntentSnapshotPrompt(currentInputContext, ruleSnapshot)
  const result = normalizeAiCallResult(await callAI([{ role: 'user', content: prompt }]))
  return {
    snapshot: parseSmartIntentSnapshot(result.text, ruleSnapshot),
    model: result.model,
    presetName: result.presetName,
    usage: result.usage,
    rawTextPreview: result.text ? result.text.slice(0, 800) : ''
  }
}

// ── 正文读取 ──────────────────────────────────────────────────────────────────

/**
 * 读取 confirmed 卡片的真实正文。
 * 返回 id → 正文字符串的 Map，无正文的卡片映射到空字符串。
 */
export function readConfirmedCardContents(
  character: Character,
  documents: BrainDocumentRecord[],
  confirmedIds: string[],
  allCards: BrainRecallCandidateCard[],
  options: {
    readDecisions?: Record<string, RecallReadDecision>
    bodyBudgetChars?: number
  } = {}
): Map<string, string> {
  const cardById = new Map(allCards.map((c) => [c.id, c]))
  const result = new Map<string, string>()
  let remainingBudget = options.bodyBudgetChars ?? Number.POSITIVE_INFINITY

  for (const id of confirmedIds) {
    const card = cardById.get(id)
    if (!card) { result.set(id, ''); continue }
    const decision = card.k === 'session_temporary_entity'
      ? 'body_required'
      : options.readDecisions?.[id] || 'body_required'
    if (decision === 'summary_only' || decision === 'skip_body') {
      result.set(id, '')
      continue
    }

    if (
      card.k === 'character_core'
      || card.k === 'character_soul'
      || card.k === 'character_trace'
      || card.k === 'character_arrangement'
      || card.k === 'public_compile_page'
      || card.k === 'observable_profile'
      || card.k === 'session_temporary_entity'
    ) {
      const text = card.k === 'character_arrangement'
        ? (card.bodyText || readRecallContentText(character, documents, card) || card.s)
        : card.k === 'observable_profile'
          ? (card.bodyText || card.s)
        : card.k === 'session_temporary_entity'
          ? (card.bodyText || card.s)
        : (card.bodyText || readRecallContentText(character, documents, card))
      if (decision === 'body_if_budget' && text.length > remainingBudget) {
        result.set(id, '')
        continue
      }
      result.set(id, text)
      if (Number.isFinite(remainingBudget)) remainingBudget = Math.max(0, remainingBudget - text.length)
    } else {
      // candidate_change 等：摘要即主内容，不额外读正文
      result.set(id, '')
    }
  }
  return result
}

// ── 最终组装 ──────────────────────────────────────────────────────────────────

/**
 * 组装最终提示词里的干净召回片段。
 * 这里只放角色扮演会用到的内容，不写轮次、读取理由、来源链或审计字段。
 */
export function assembleRecallPromptBlock(
  characterName: string,
  result: RecallPipelineResult,
  allCards: BrainRecallCandidateCard[],
  contentMap: Map<string, string>
): string {
  const cardById = new Map(allCards.map((c) => [c.id, c]))
  const confirmedIds = [
    ...allCards
      .filter(isMustScheduleActivationCard)
      .map((card) => card.id),
    ...result.confirmedIds
  ]
  const confirmedCards = [...new Set(confirmedIds)]
    .map((id) => cardById.get(id))
    .filter((c): c is BrainRecallCandidateCard => Boolean(c && c.k !== 'candidate_change'))

  return buildCleanRecallPromptBlock(characterName, confirmedCards, contentMap)
}

function mergeMustScheduleReadDecisions(
  allCards: BrainRecallCandidateCard[],
  readDecisions: Record<string, RecallReadDecision> = {}
): Record<string, RecallReadDecision> {
  const next = { ...readDecisions }
  for (const card of allCards) {
    if (card.k === 'session_temporary_entity') {
      next[card.id] = 'body_required'
      continue
    }
    if (!isMustScheduleActivationCard(card)) continue
    next[card.id] = readDecisionFromScheduleActivation(card)
  }
  return next
}

export function formatRecallTraceForPromptLog(result: RecallPipelineResult): string {
  const lines: string[] = [
    '【角色大脑召回 trace】',
    `轮次数：${result.roundsCompleted}`,
    `确认 ID：${result.confirmedIds.join('、') || '无'}`,
    `结构来源：${result.structureTreeSource || 'none'}`,
    ''
  ]
  if (result.compressedContext) {
    lines.push('## 召回上下文', result.compressedContext, '')
  }
  if (result.intentSnapshot) {
    lines.push('## 输入意图快照', JSON.stringify(result.intentSnapshot, null, 2), '')
  }
  lines.push('## 轮次记录')
  for (const round of result.rounds) {
    lines.push(
      `### 第 ${round.round} 轮`,
      `投递：${round.inputCardTitles.join('、') || '无'}`,
      `确认：${round.confirmedTitles.join('、') || '无'}`,
      `继续：${round.needMoreRounds === undefined ? '未声明' : round.needMoreRounds ? '是' : '否'}`,
      `置信度：${round.confidence ?? '未声明'}`,
      `边际收益：${round.marginalGain ?? '未声明'}`,
      `理由：${round.stopReason || '未声明'}`
    )
    const decisions = Object.entries(round.readDecisions || {})
    if (decisions.length) {
      lines.push(`读取决定：${decisions.map(([id, decision]) => `${id}=${decision}`).join('、')}`)
    }
    lines.push('')
  }
  if (result.activityEvents?.length) {
    lines.push('## 原始召回活动事件')
    for (const event of result.activityEvents) {
      lines.push(JSON.stringify(event))
    }
  }
  return lines.join('\n').trim()
}

function buildRecallUsageTotal(modelCallMetrics: RecallActivityMetrics[]): RecallTokenUsage | undefined {
  const embeddingUsage = modelCallMetrics
    .filter((item) => item.usageTotal)
    .map((item) => item.usageTotal)
  const singleCallUsage = modelCallMetrics
    .filter((item) => !item.usageTotal)
    .map((item) => item.usage)
  return mergeRecallUsages([...embeddingUsage, ...singleCallUsage])
}

// ── 多轮召回主流程 ────────────────────────────────────────────────────────────

/**
 * 多轮 AI 召回主流程。
 *
 * 每轮只保留确认、继续展开与边界债状态；不再运行额外待定复核队列。
 */
export async function runMultiRoundRecallPipeline(
  character: Character,
  documents: BrainDocumentRecord[],
  recentMessages: MessageLike[],
  callAI: CallAI,
  options: RecallPipelineOptions = {}
): Promise<RecallPipelineResult> {
  const activity = makeActivityRecorder(options)
  throwIfRecallAborted(options)
  const contextEventId = activity.start('input_context', '收集最近三轮上下文', {
    recentMessageCount: recentMessages.length
  })
  const compressedContext = buildRecallContext(recentMessages)
  activity.complete(contextEventId, { compressedContext })
  const runtimeAnchors = buildRuntimeAnchorContext(character, options)

  throwIfRecallAborted(options)
  const currentInputContext = buildCurrentUserInputContext(recentMessages, options)
  const ruleIntentSnapshot = buildInputIntentSnapshot(recentMessages, options)
  let intentSnapshot = ruleIntentSnapshot
  const modelCallMetrics: RecallActivityMetrics[] = []
  if (options.agentConfig?.intentSnapshotMode === 'smart') {
    const smartIntentEventId = activity.start('smart_input_intent_snapshot', '智能生成输入意图快照', {
      currentInputContext
    })
    try {
      throwIfRecallAborted(options)
      const smartResult = await buildSmartInputIntentSnapshot(currentInputContext, ruleIntentSnapshot, options.intentSnapshotAI || callAI)
      throwIfRecallAborted(options)
      if (smartResult.snapshot) {
        intentSnapshot = smartResult.snapshot
        const callMetrics: RecallActivityMetrics = {
          model: smartResult.model,
          presetName: smartResult.presetName,
          usage: smartResult.usage,
          callCount: 1
        }
        modelCallMetrics.push(callMetrics)
        activity.complete(smartIntentEventId, {
          intentSnapshot,
          rawTextPreview: smartResult.rawTextPreview
        }, callMetrics)
      } else {
        const callMetrics: RecallActivityMetrics = {
          model: smartResult.model,
          presetName: smartResult.presetName,
          usage: smartResult.usage,
          callCount: 1
        }
        modelCallMetrics.push(callMetrics)
        activity.complete(smartIntentEventId, {
          fallback: 'rules',
          reason: '智能快照解析失败',
          rawTextPreview: smartResult.rawTextPreview
        }, callMetrics)
      }
    } catch (error) {
      activity.fail(smartIntentEventId, error)
    }
  } else {
    const intentEventId = activity.start('input_intent_snapshot', '规则生成输入意图快照', {
      currentInputContext
    })
    activity.complete(intentEventId, ruleIntentSnapshot)
  }

  const structureEventId = activity.start('recall_structure_view', '构建只读召回结构视图', {
    documentCount: documents.length
  })
  const allCards = buildRecallCardsForOptions(character, documents, options)
  throwIfRecallAborted(options)
  const structureTreeSource = options.docLibraryStructure
    ? buildDocLibraryRecallStructureView(documents, options.docLibraryStructure).treeSource
    : (allCards.some((card) => card.treeSource === 'fieldTree') ? 'fieldTree' : allCards.some((card) => card.treeSource === 'pathTree') ? 'pathTree' : 'none')
  activity.complete(structureEventId, {
    totalCards: allCards.length,
    structureTreeSource,
    cards: allCards.map((card) => ({
      id: card.id,
      title: card.t,
      kind: card.k,
      parentRuntimeId: card.parentRuntimeId,
      structureChildCount: card.structureChildCount,
      treeSource: card.treeSource,
      scheduleActivation: card.scheduleActivation,
      evidenceReasons: card.evidenceReasons
    }))
  })

  if (!allCards.length) {
    return {
      compressedContext,
      intentSnapshot,
      confirmedIds: [],
      readDecisions: {},
      roundsCompleted: 0,
      rounds: [],
      structureTreeSource: 'none',
      recallPriorityUpdates: {},
      activityEvents: activity.events
    }
  }
  const mode = options.agentConfig?.recallCandidateMode || 'parallel_merge'
  const cardById = new Map(allCards.map((card) => [card.id, card]))
  const cardByRuntimeId = new Map(allCards.map((card) => [card.structureRuntimeId || card.id, card]))
  const ruleEventId = activity.start('candidate_rules_score', '规则候选打分', {
    mode,
    candidateCount: allCards.length,
    intentSnapshot
  }, 'candidate-generation')
  const ruleScores = new Map(allCards.map((card) => [card.id, scoreCardByRules(card, intentSnapshot, runtimeAnchors)]))
  activity.complete(ruleEventId, {
    scores: [...ruleScores.entries()].map(([id, score]) => ({
      id,
      title: cardById.get(id)?.t || id,
      ...score
    }))
  })

  const embeddingEventId = activity.start('candidate_embedding_score', '嵌入候选打分', {
    queryTextForEmbedding: intentSnapshot.queryTextForEmbedding,
    candidateCount: allCards.length
  }, 'candidate-generation')
  let embeddingScores = new Map<string, number>()
  try {
    throwIfRecallAborted(options)
    const embeddingResult = await scoreCardsByEmbedding(
      intentSnapshot.queryTextForEmbedding || compressedContext,
      allCards,
      options.embedTexts,
      options.embeddingVectorCache,
      options.embeddingCacheScope || buildEmbeddingCacheScope(options.agentConfig)
    )
    throwIfRecallAborted(options)
    embeddingScores = embeddingResult.scores
    const calibratedEmbeddingScores = calibrateEmbeddingScores(embeddingScores)
    modelCallMetrics.push({
      model: embeddingResult.calls.find((call) => call.model)?.model,
      presetName: embeddingResult.calls.find((call) => call.presetName)?.presetName,
      usageTotal: embeddingResult.usageTotal,
      callCount: embeddingResult.calls.length
    })
    activity.complete(embeddingEventId, {
      calibration: {
        method: 'batch_quantile_saturation',
        note: '归一嵌入按本轮候选原始余弦的批内分布做饱和型校准：低分压低，高分抬高但越高增益越缓，不再使用 (cos+1)/2 平移。'
      },
      scores: [...embeddingScores.entries()].map(([id, score]) => ({
        id,
        title: cardById.get(id)?.t || id,
        rawEmbeddingScore: score,
        embeddingIntentScore: calibratedEmbeddingScores.get(id) ?? 0,
        score
      })),
      cacheHits: embeddingResult.cacheHits,
      cacheMisses: embeddingResult.cacheMisses
    }, {
      model: embeddingResult.calls.find((call) => call.model)?.model,
      presetName: embeddingResult.calls.find((call) => call.presetName)?.presetName,
      usageTotal: embeddingResult.usageTotal,
      callCount: embeddingResult.calls.reduce((sum, call) => sum + (call.callCount || 0), 0),
      cacheHits: embeddingResult.cacheHits,
      cacheMisses: embeddingResult.cacheMisses
    })
  } catch (error) {
    activity.fail(embeddingEventId, error)
  }

  const mergeEventId = activity.start('candidate_merge', '合并候选分数', {
    mode,
    ruleScoreCount: ruleScores.size,
    embeddingScoreCount: embeddingScores.size
  })
  let scoreMap = applyScheduleActivationScores(allCards, applyWorldSourceIntentGate(
    allCards,
    mergeCandidateScores(ruleScores, embeddingScores, mode, allCards),
    intentSnapshot
  ))
  activity.complete(mergeEventId, {
    scores: [...scoreMap.entries()]
      .sort((a, b) => b[1].candidateBaseScore - a[1].candidateBaseScore)
      .slice(0, 80)
      .map(([id, score]) => ({
        id,
        title: cardById.get(id)?.t || id,
        ...score
      }))
  })

  const directHitText = uniqueStrings([
    lastUserText(recentMessages),
    ...(intentSnapshot.explicitTerms || []),
    intentSnapshot.queryTextForEmbedding
  ], 24).join(' ').toLowerCase()
  const allConfirmedIds = new Set<string>()
  const readDecisions: Record<string, RecallReadDecision> = {}
  const rounds: RecallRoundTrace[] = []
  const judgedIds = new Set<string>()
  let frontierDebt = 1

  const chunkRetryCards = (cards: BrainRecallCandidateCard[], size: number): BrainRecallCandidateCard[][] => {
    const chunks: BrainRecallCandidateCard[][] = []
    for (let i = 0; i < cards.length; i += size) chunks.push(cards.slice(i, i + size))
    return chunks
  }

  const runRetryWithFallback = async <T extends { id: string }>(
    retryChunk: BrainRecallCandidateCard[],
    judge: (call: CallAI) => Promise<RecallJudgeResult<T>>,
    buildRetryEventLabel: (modeLabel: string, retryIndex: number) => string,
    buildRetryEventKey: (modeKey: string, retryIndex: number) => string,
    buildRetryInput: (mode: 'batch_8' | 'batch_8_flash_then_pro', retryChunkIndex: number, retryChunkCount: number) => Record<string, unknown>,
    stepGroup: string,
    retryIndex: number,
    retryChunkIndex: number,
    retryChunkCount: number
  ): Promise<T[]> => {
    const runOnePass = async (
      activeCallAI: CallAI,
      retryMode: 'batch_8' | 'batch_8_flash_then_pro',
      modeLabel: string,
      modeKey: string
    ) => {
      const retryEventId = activity.start(
        buildRetryEventKey(modeKey, retryIndex),
        buildRetryEventLabel(modeLabel, retryIndex),
        buildRetryInput(retryMode, retryChunkIndex, retryChunkCount),
        stepGroup
      )
      try {
        const retryResult = await judge(activeCallAI)
        throwIfRecallAborted(options)
        const retryMetrics: RecallActivityMetrics = {
          model: retryResult.model,
          presetName: retryResult.presetName,
          usage: retryResult.usage,
          callCount: 1
        }
        modelCallMetrics.push(retryMetrics)
        activity.complete(retryEventId, {
          judgments: retryResult.judgments,
          rawTextPreview: retryResult.rawTextPreview,
          retryMode,
          retryChunkIndex,
          retryChunkCount,
          model: retryResult.model,
          presetName: retryResult.presetName,
          usage: retryResult.usage
        }, retryMetrics)
        return retryResult.judgments
      } catch (error) {
        activity.fail(retryEventId, error)
        return []
      }
    }

    const primaryJudgments = await runOnePass(options.candidateJudgeAI || callAI, 'batch_8', '8组缺项补判', 'retry_flash')
    if (!options.fallbackJudgeAI) return primaryJudgments
    const primaryJudgedIds = new Set(primaryJudgments.map((item) => item.id))
    const stillMissingCards = retryChunk.filter((card) => !primaryJudgedIds.has(card.id))
    if (!stillMissingCards.length) return primaryJudgments
    const fallbackJudgments = await runOnePass(
      options.fallbackJudgeAI,
      'batch_8_flash_then_pro',
      '8组缺项补判 pro兜底',
      'retry_pro'
    )
    return appendUniqueJudgments(primaryJudgments, fallbackJudgments)
  }

  const completeMissingCandidateJudgments = async (
    initialJudgments: RecallCandidateJudgment[],
    chunk: BrainRecallCandidateCard[],
    stepKey: string,
    retryIndex: number
  ): Promise<RecallCandidateJudgment[]> => {
    const judgedIds = new Set(initialJudgments.map((judgment) => judgment.id))
    const missingCards = chunk.filter((card) => !judgedIds.has(card.id))
    if (!missingCards.length) return initialJudgments
    const retryChunks = chunkRetryCards(missingCards, LLM_JUDGMENT_CHUNK_SIZE)
    const retryResults = await Promise.all(retryChunks.map(async (retryChunk, retryChunkIndex) => {
      throwIfRecallAborted(options)
      return runRetryWithFallback(
        retryChunk,
        (activeCallAI) => judgeCandidateChunk(intentSnapshot, retryChunk, scoreMap, activeCallAI),
        (modeLabel, currentRetryIndex) => `${stepKey} ${modeLabel} ${currentRetryIndex}`,
        (modeKey, currentRetryIndex) => `${stepKey}_${modeKey}_${currentRetryIndex}`,
        (retryMode, currentRetryChunkIndex, currentRetryChunkCount) => ({
          retryOf: stepKey,
          retryChunkIndex: currentRetryChunkIndex,
          retryChunkCount: currentRetryChunkCount,
          candidateIds: retryChunk.map((card) => card.id),
          reason: 'missing_decision',
          retryMode
        }),
        stepKey,
        retryIndex,
        retryChunkIndex + 1,
        retryChunks.length
      )
    }))
    return appendUniqueJudgments(initialJudgments, retryResults.flat())
  }

  for (const card of allCards.filter((item) => item.k === 'candidate_change')) {
    allConfirmedIds.add(card.id)
    readDecisions[card.id] = 'summary_only'
  }
  const mustScheduleCards = allCards.filter(isMustScheduleActivationCard)
  for (const card of mustScheduleCards) {
    allConfirmedIds.add(card.id)
    readDecisions[card.id] = readDecisionFromScheduleActivation(card)
    judgedIds.add(card.id)
  }
  if (mustScheduleCards.length) {
    const mustEventId = activity.start('schedule_must_confirm', '确认必须激活安排', {
      candidateIds: mustScheduleCards.map((card) => card.id)
    })
    activity.complete(mustEventId, {
      confirmed: mustScheduleCards.map((card) => ({
        id: card.id,
        title: card.t,
        activation: card.scheduleActivation,
        readDecision: readDecisions[card.id]
      }))
    }, {
      confirmedUnits: mustScheduleCards.map((card) => buildUnitRef(allCards, scoreMap, card.id, readDecisions))
    })
  }

  const preconfirmedCards = options.preconfirmedCards || []
  const finalCardsForShared = mergePreconfirmedCards(allCards, preconfirmedCards)
  for (const card of preconfirmedCards) {
    if (!card?.id) continue
    allConfirmedIds.add(card.id)
    readDecisions[card.id] = options.preconfirmedReadDecisions?.[card.id]
      || (card.k === 'session_temporary_entity' ? 'body_required' : 'summary_only')
  }
  if (preconfirmedCards.length) {
    const reusedEventId = activity.start('preconfirmed_shared_recall', '复用已确认共享资料', {
      candidateIds: preconfirmedCards.map((card) => card.id)
    })
    activity.complete(reusedEventId, {
      confirmed: preconfirmedCards.map((card) => ({
        id: card.id,
        title: card.t,
        kind: card.k,
        readDecision: readDecisions[card.id]
      }))
    }, {
      confirmedUnits: preconfirmedCards.map((card) => buildUnitRef(finalCardsForShared, scoreMap, card.id, readDecisions))
    })
  }

  const fixedCandidateRound = normalizeFixedCandidateRound(options.fixedCandidateRound)
  const maxLoopRounds = normalizeMaxLoopRounds(options.maxLoopRounds)
  const firstLoopRound = fixedCandidateRound || 1
  const lastLoopRound = fixedCandidateRound || maxLoopRounds

  // 边界债只看本次允许跑到的轮次（lastLoopRound），超过上限的候选池不再当作"未来候选"
  const hasFutureRoundCandidates = (nextRound: number) => {
    for (let round = nextRound; round <= lastLoopRound; round += 1) {
      const found = allCards.some((card) => (
        !judgedIds.has(card.id)
        && isCardInRoundCandidatePool(card, round, { cardByRuntimeId, currentDate: options.currentDate || new Date(), directHitText })
      ))
      if (found) return true
    }
    return false
  }

  for (let round = firstLoopRound; round <= lastLoopRound && frontierDebt > 0; round += 1) {
    throwIfRecallAborted(options)
    const selectEventId = activity.start(`loop_${round}_candidate_select`, `第 ${round} 轮选择候选`, {
      frontierDebt,
      alreadyJudgedIds: [...judgedIds],
      priorityMark: RECALL_PRIORITY_BY_ROUND[round] || '',
      directHitText
    })
    const thisRoundCards = selectCandidateCards(
      allCards,
      scoreMap,
      judgedIds,
      round,
      mode,
      intentSnapshot,
      { cardByRuntimeId, currentDate: options.currentDate || new Date(), directHitText }
    )
    activity.complete(selectEventId, {
      candidates: thisRoundCards.map((card) => ({
        id: card.id,
        title: card.t,
        score: scoreMap.get(card.id)?.candidateBaseScore ?? 0,
        parentRuntimeId: card.parentRuntimeId,
        structureChildCount: card.structureChildCount,
        recallPriorityMark: card.recallPriorityMark,
        directKeywordHit: hasDirectKeywordHit(card, directHitText)
      }))
    })
    if (!thisRoundCards.length) {
      frontierDebt = fixedCandidateRound ? 0 : hasFutureRoundCandidates(round + 1) ? 1 : 0
      continue
    }

    const chunkSize = Math.min(LLM_JUDGMENT_CHUNK_SIZE, thisRoundCards.length)
    const chunks: BrainRecallCandidateCard[][] = []
    for (let i = 0; i < thisRoundCards.length; i += chunkSize) chunks.push(thisRoundCards.slice(i, i + chunkSize))
    // 轮内分块并发裁判：各块候选集互不相交、分数修正只作用于本块卡片，
    // 且 scoreMap 的读-改-写是同步块（无 await 间隔），单线程并发下不会互相覆盖；
    // 轮与轮之间仍保持串行（边界债依赖上一轮结果）。
    const chunkJudgments: RecallCandidateJudgment[][] = chunks.map(() => [])
    await runWithConcurrencyLimit(chunks.map((chunk, index) => async () => {
      throwIfRecallAborted(options)
      const chunkEventId = activity.start(`loop_${round}_llm_judgment_${index + 1}`, `第 ${round} 轮候选裁判 ${index + 1}`, {
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        candidateIds: chunk.map((card) => card.id),
        candidateRefs: chunk.map(buildCandidateRef)
      }, chunks.length > 1 ? `loop-${round}-llm-judgment` : undefined)
      try {
        const scoreBeforeJudgment = new Map(
          chunk.map((card) => {
            const score = scoreMap.get(card.id)
            return [card.id, {
              includeScoreBefore: score?.includeScore ?? score?.candidateBaseScore ?? 0,
              expandScoreBefore: score?.expandScore ?? score?.candidateBaseScore ?? 0
            }]
          })
        )
        const result = await judgeCandidateChunk(intentSnapshot, chunk, scoreMap, options.candidateJudgeAI || callAI)
        throwIfRecallAborted(options)
        result.judgments = await completeMissingCandidateJudgments(
          result.judgments,
          chunk,
          `loop_${round}_llm_judgment`,
          index + 1
        )
        chunkJudgments[index] = result.judgments
        scoreMap = applyAgentScoreCorrections(scoreMap, result.judgments)
        const judgmentsWithScores = result.judgments.map((judgment) => {
          const before = scoreBeforeJudgment.get(judgment.id)
          const after = scoreMap.get(judgment.id)
          return {
            ...judgment,
            includeScoreBefore: before?.includeScoreBefore,
            expandScoreBefore: before?.expandScoreBefore,
            includeScoreAfter: after?.includeScore ?? after?.candidateBaseScore,
            expandScoreAfter: after?.expandScore ?? after?.candidateBaseScore
          }
        })
        const callMetrics: RecallActivityMetrics = {
          model: result.model,
          presetName: result.presetName,
          usage: result.usage,
          callCount: 1
        }
        modelCallMetrics.push(callMetrics)
        activity.complete(chunkEventId, {
          judgments: judgmentsWithScores,
          rawTextPreview: result.rawTextPreview,
          model: result.model,
          presetName: result.presetName,
          usage: result.usage
        }, callMetrics)
      } catch (error) {
        throwIfRecallAborted(options)
        activity.fail(chunkEventId, error)
        chunkJudgments[index] = []
      }
    }), RECALL_JUDGE_CHUNK_CONCURRENCY)
    const judgments = chunkJudgments.flat()
    const judgmentById = new Map(judgments.map((judgment) => [judgment.id, judgment]))
    for (const judgment of judgments) judgedIds.add(judgment.id)

    const nextExpandParentIds = new Set<string>()
    const roundConfirmedIds: string[] = []
    const expandOnlyIds: string[] = []
    for (const card of thisRoundCards) {
      const judgment = judgmentById.get(card.id)
      const score = scoreMap.get(card.id)
      const hasActiveSchedule = Boolean(card.scheduleActivation?.active)
      const includeScore = score?.includeScore ?? score?.candidateBaseScore ?? 0
      const expandRejected = judgment?.expandDecision === 'no_expand'
      const summaryThreshold = includeSummaryThreshold(score)
      const shouldConfirm = (
        (hasActiveSchedule && (score?.scheduleActivationScore ?? 0) >= SCHEDULE_ACTIVATION_SUMMARY_SCORE)
        ||
        includeScore >= summaryThreshold
      )
      const hasChildren = (card.structureChildCount || 0) > 0
      const shouldExpand = !expandRejected && (
        (judgment?.expandDecision === 'expand' && hasChildren)
        || ((score?.expandScore ?? score?.candidateBaseScore ?? 0) >= EXPAND_SCORE_THRESHOLD && hasChildren && judgment?.summaryQuality !== 'enough')
      )
      if (shouldConfirm) {
        allConfirmedIds.add(card.id)
        roundConfirmedIds.push(card.id)
        readDecisions[card.id] = card.k === 'session_temporary_entity'
          ? 'body_required'
          : hasActiveSchedule
            ? readDecisionFromScheduleActivation(card)
            : readDecisionFromIncludeScore(score)
      }
      if (shouldExpand) {
        nextExpandParentIds.add(card.structureRuntimeId || card.id)
        expandOnlyIds.push(card.id)
      }
    }
    throwIfRecallAborted(options)

    const loopEventId = activity.start(`loop_${round}_boundary_update`, `第 ${round} 轮更新边界债`, {
      confirmedIds: roundConfirmedIds,
      expandParentIds: [...nextExpandParentIds]
    })
    const frontierDebtBefore = frontierDebt
    const unresolvedChildren = allCards.filter((card) => card.parentRuntimeId && nextExpandParentIds.has(card.parentRuntimeId) && !judgedIds.has(card.id)).length
    frontierDebt = Math.min(9, nextExpandParentIds.size + Math.ceil(unresolvedChildren / 12))
    const boundaryMetrics: RecallActivityMetrics = {
      round,
      directUnits: roundConfirmedIds.map((id) => buildUnitRef(allCards, scoreMap, id, readDecisions)),
      expandedUnits: [...nextExpandParentIds].map((id) => buildUnitRef(allCards, scoreMap, id, readDecisions)),
      frontierDebtBefore,
      frontierDebtAfter: fixedCandidateRound ? 0 : hasFutureRoundCandidates(round + 1) ? 1 : 0,
      unresolvedChildren,
      stopAllowed: !hasFutureRoundCandidates(round + 1) || round >= lastLoopRound
    }
    frontierDebt = boundaryMetrics.frontierDebtAfter || 0
    activity.complete(loopEventId, {
      frontierDebt,
      unresolvedChildren,
      stopAllowed: frontierDebt <= 0 || round >= lastLoopRound,
      directUnits: boundaryMetrics.directUnits,
      expandedUnits: boundaryMetrics.expandedUnits,
      expandOnlyIds
    }, boundaryMetrics)

    const needMoreRounds = !fixedCandidateRound && frontierDebt > 0 && round < lastLoopRound
    const confidence = judgments.length
      ? clamp01(judgments.reduce((sum, item) => sum + item.confidence, 0) / judgments.length)
      : undefined
    const marginalGain = clamp01(frontierDebt / 9)
    const stopReason = needMoreRounds ? '边界债仍要求继续展开' : '边界债允许停止'
    rounds.push({
      round,
      inputCardTitles: thisRoundCards.map((card) => card.t),
      confirmedTitles: roundConfirmedIds.map((id) => cardById.get(id)?.t ?? id),
      needMoreRounds,
      confidence,
      marginalGain,
      stopReason,
      readDecisions: Object.fromEntries(roundConfirmedIds.map((id) => [id, readDecisions[id]]))
    })
  }

  const readEventId = activity.start('confirmed_content_read', '确认区内容读取决策', {
    strategy: 'score_threshold',
    summaryThreshold: INCLUDE_SUMMARY_SCORE_THRESHOLD,
    bodyThreshold: INCLUDE_BODY_SCORE_THRESHOLD,
    summaryMinThreshold: INCLUDE_SUMMARY_SCORE_MIN_THRESHOLD,
    bodyMinThreshold: INCLUDE_BODY_SCORE_MIN_THRESHOLD,
    confirmedIds: [...allConfirmedIds],
    readDecisions
  })
  const finalCards = mergePreconfirmedCards(allCards, preconfirmedCards)
  const confirmedContentMap = readConfirmedCardContents(character, documents, [...allConfirmedIds], finalCards, {
    readDecisions,
    bodyBudgetChars: options.bodyBudgetChars ?? 6000
  })
  const confirmedUnits = [...allConfirmedIds].map((id) => buildUnitRef(finalCards, scoreMap, id, readDecisions, confirmedContentMap))
  const recallPriorityUpdates = buildRecallPriorityUpdates(finalCards, allConfirmedIds)
  const usageTotal = buildRecallUsageTotal(modelCallMetrics)
  activity.complete(readEventId, {
    confirmed: confirmedUnits
  }, {
    confirmedUnits,
    usageTotal,
    callCount: modelCallMetrics.reduce((sum, item) => sum + (item.callCount || 0), 0)
  })

  const summaryEventId = activity.start('recall_metrics_summary', '召回指标汇总', {
    roundCount: rounds.length
  })
  activity.complete(summaryEventId, {
    roundsCompleted: rounds.length,
    confirmedUnits,
    usageTotal,
    modelCalls: modelCallMetrics
  }, {
    confirmedUnits,
    usageTotal,
    callCount: modelCallMetrics.reduce((sum, item) => sum + (item.callCount || 0), 0)
  })

  return {
    compressedContext,
    intentSnapshot,
    confirmedIds: [...allConfirmedIds],
    readDecisions,
    roundsCompleted: rounds.length,
    rounds,
    structureTreeSource,
    recallPriorityUpdates,
    activityEvents: activity.events
  }
}

// ── 对外主入口 ────────────────────────────────────────────────────────────────

/**
 * 异步 AI 召回提示词块主入口。
 * 无消息或 AI 失败时由调用方（useAI.ts）自行回退到本地版本。
 *
 * @param onRecallTrace 可视化追踪回调（后续 UI 层接入，当前传 undefined 即可）
 */
export async function buildAIRecallPromptBlock(
  character: Character,
  documents: BrainDocumentRecord[],
  recentMessages: MessageLike[],
  callAI: CallAI,
  onRecallTrace?: (result: RecallPipelineResult) => void,
  options: RecallPipelineOptions = {}
): Promise<string> {
  const preconfirmedCards = options.includeCharacterLocationArrangements === false
    ? (options.preconfirmedCards || []).filter((card) => card.k !== 'character_arrangement')
    : (options.preconfirmedCards || [])
  const runtimeOptions = {
    ...options,
    preconfirmedCards
  }
  const allCards = mergePreconfirmedCards(
    buildRecallCardsForOptions(character, documents, runtimeOptions),
    preconfirmedCards
  )
  const result = await runMultiRoundRecallPipeline(character, documents, recentMessages, callAI, runtimeOptions)

  // 触发追踪回调（后续 UI 层接入此口子）
  onRecallTrace?.(result)

  const readDecisions = mergeMustScheduleReadDecisions(allCards, result.readDecisions)
  const confirmedIds = [
    ...allCards
      .filter(isMustScheduleActivationCard)
      .map((card) => card.id),
    ...result.confirmedIds
  ]

  if (!confirmedIds.length) return ''

  const cardById = new Map(allCards.map((card) => [card.id, card] as const))
  const contentMap = readConfirmedCardContents(character, documents, [...new Set(confirmedIds)], allCards, {
    readDecisions,
    bodyBudgetChars: options.bodyBudgetChars ?? 6000
  })
  options.onConfirmedCards?.({
    cards: [...new Set(confirmedIds)]
      .map((id) => cardById.get(id))
      .filter((card): card is BrainRecallCandidateCard => Boolean(card)),
    readDecisions,
    contentMap
  })
  const characterName = toText((character as unknown as Record<string, unknown>).name, '未命名角色')
  return assembleRecallPromptBlock(characterName, { ...result, readDecisions }, allCards, contentMap)
}
