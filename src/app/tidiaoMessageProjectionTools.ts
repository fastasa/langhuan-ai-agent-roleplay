/**
 * 提调「读/重投消息投影」工具逻辑 —— 提调真·导演 loop 重构计划书 批次 M3 配套（用户 2026-06-21）。
 *
 * 给精修 loop 配套：提调精改原消息后，要判断这条消息的【客观事实投影】是否还匹配改后的新原文——
 * 投影是抽给其他角色/旁白读的客观事实摘要（谁对谁做了什么、时间地点），原文改动大就会过时。
 * 本模块给提调两件套：
 *  - readMessageProjection：按楼层号读某条消息当前投影事实（判断是否过时用）。
 *  - reprojectMessage：按楼层号**标记**某条消息需要重投影（不直接改投影、不写 DB）。
 *
 * 重投采用「重新生成」（用户 2026-06-21 拍板）：本模块只在内存里标记哪些楼层消息要重投；
 * loop 收束、精修写回 DB 后，由 pipeline/ops 对标记的 messageId 调 runChatMessageProjectionBySessionId
 * 基于新内容自动重跑投影生成（AI 重提炼客观事实/环境变化/可见性）。提调只判断要不要重投，不手写投影内容。
 *
 * 与 M2 读会话（{@link ./tidiaoChatMessageTools}）/ M3 精修（{@link ./tidiaoChatMessageEditTools}）同一接缝范式：
 * 纯运行逻辑 + 注入接缝 {@link TidiaoMessageProjectionContext}（投影数据从哪来 + 重投标记归属解耦）。
 * 楼层映射（按 role/narration 分桶，调试与用户消息不入桶）与 read/edit 同口径，三处属联动能力，改楼层映射需同步。
 */

import {
  assignChatFloorNumbers,
  classifyChatFloorKind,
  formatChatFloorRef,
  parseChatFloorRefs,
  type ChatFloorRef,
  type ChatFloorRefKind
} from './chatMessageFloor'

/** 工具机器名（harness 注册 + activeTools 门控用）。 */
export const TIDIAO_READ_MESSAGE_PROJECTION_TOOL_NAME = 'readMessageProjection'
export const TIDIAO_REPROJECT_MESSAGE_TOOL_NAME = 'reprojectMessage'

// 工具说明收口（批次 C）：读投影/标记重投「何时用 + 参数 schema」已迁至 tidiaoToolContract.ts 唯一真值源，不在此另写。

/** 投影源数据的最小形状（兼容 ChatPersonalityModelObservationProjection 与运行态 Record）。 */
export interface TidiaoProjectionSource {
  objectiveFact?: unknown
  startEnv?: unknown
  endEnv?: unknown
  changed?: unknown
  status?: unknown
}

/** 一条读投影结果（命中楼层=带投影事实；未命中楼层=matched:false 供模型据 total 自纠引用）。 */
export interface TidiaoMessageProjectionRead {
  ref: string
  kind: ChatFloorRefKind
  index: number
  total: number
  matched: boolean
  messageId: number
  speakerName: string
  /** 该消息是否已有可用投影事实（objectiveFact 非空）。 */
  hasProjection: boolean
  status: string
  objectiveFact: string
  /** 起始/结束环境的人话渲染（时间/地点/天气，空则空串）。 */
  startEnvText: string
  endEnvText: string
  /** 时间/地点变化的人话渲染。 */
  changedText: string
}

/** 一条重投标记结果（命中=已标记；未命中楼层=matched:false 供模型据 total 自纠引用）。 */
export interface TidiaoMessageReprojectMark {
  ref: string
  kind: ChatFloorRefKind
  index: number
  total: number
  matched: boolean
  messageId: number
  speakerName: string
}

/** 待重投目标（loop 收束后 pipeline 取出，对其 messageId 重跑投影生成）。 */
export interface TidiaoReprojectTarget {
  messageId: number
  ref: string
  speakerName: string
}

/** 读/重投投影接缝：把「投影数据从哪来 + 重投标记归属」从工具逻辑里抽出来；工厂用当前会话消息 + 投影表实现。 */
export interface TidiaoMessageProjectionContext {
  /** 按楼层读一条消息的当前投影；楼层越界/不存在返回 null（由调用方据 total 回报未命中）。 */
  readProjectionByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessageProjectionRead | null
  /** 标记某楼层消息需要重投影（在内存集合上）；楼层越界/不存在返回 null。 */
  markReprojectByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessageReprojectMark | null
  /** 某种类楼层总数（供未命中时回报）。 */
  floorTotal(kind: ChatFloorRefKind): number
  /** loop 收束后取累积重投目标（按 messageId 去重）。 */
  collectReprojectTargets(): TidiaoReprojectTarget[]
}

/** 环境对象 → 人话（时间/地点/天气，全空返回空串）。 */
function renderEnv(env: unknown): string {
  if (!env || typeof env !== 'object') return ''
  const e = env as Record<string, unknown>
  const parts: string[] = []
  const time = String(e.time ?? '').trim()
  const location = String(e.location ?? '').trim()
  const weather = String(e.weather ?? '').trim()
  if (time) parts.push(`时间：${time}`)
  if (location) parts.push(`地点：${location}`)
  if (weather) parts.push(`天气：${weather}`)
  return parts.join('，')
}

/** 变化标记 → 人话。 */
function renderChanged(changed: unknown): string {
  if (!changed || typeof changed !== 'object') return ''
  const c = changed as Record<string, unknown>
  const flags: string[] = []
  if (c.time) flags.push('时间')
  if (c.location) flags.push('地点')
  return flags.length ? `${flags.join('、')}发生变化` : '无时间/地点变化'
}

export interface TidiaoReadMessageProjectionRequest {
  /** 楼层引用（单条），如「角色2」。 */
  ref: string
}

export interface TidiaoReadMessageProjectionResult {
  /** 解析出的目标楼层的读投影结果（无可解析引用时为 null）。 */
  read: TidiaoMessageProjectionRead | null
}

/**
 * 解析楼层引用（取首个）→ 读其当前投影。
 * 无可解析引用返回 { read: null }（调用方据此报「未识别楼层引用」）；楼层越界返回 matched:false + total。
 */
export function runTidiaoReadMessageProjection(
  request: TidiaoReadMessageProjectionRequest,
  context: TidiaoMessageProjectionContext
): TidiaoReadMessageProjectionResult {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const ref: ChatFloorRef | undefined = refs[0]
  if (!ref) return { read: null }
  const hit = context.readProjectionByFloor(ref.kind, ref.index)
  if (hit) return { read: hit }
  return {
    read: {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: '',
      hasProjection: false,
      status: '',
      objectiveFact: '',
      startEnvText: '',
      endEnvText: '',
      changedText: ''
    }
  }
}

export interface TidiaoReprojectMessageRequest {
  /** 楼层引用（单条），如「角色2」。 */
  ref: string
}

export interface TidiaoReprojectMessageResult {
  /** 解析出的目标楼层的标记结果（无可解析引用时为 null）。 */
  mark: TidiaoMessageReprojectMark | null
}

/**
 * 解析楼层引用（取首个）→ 标记其需要重投影。
 * 无可解析引用返回 { mark: null }；楼层越界返回 matched:false + total（不计入重投目标）。
 */
export function runTidiaoMarkReproject(
  request: TidiaoReprojectMessageRequest,
  context: TidiaoMessageProjectionContext
): TidiaoReprojectMessageResult {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const ref: ChatFloorRef | undefined = refs[0]
  if (!ref) return { mark: null }
  const hit = context.markReprojectByFloor(ref.kind, ref.index)
  if (hit) return { mark: hit }
  return {
    mark: {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: ''
    }
  }
}

/** 工厂依赖的最小消息形状（兼容 ChatMessage 与运行态 Record）。 */
interface ChatMessageProjectionFloorSource {
  id?: unknown
  content?: unknown
  name?: unknown
  memberName?: unknown
  role?: unknown
  messageKind?: unknown
  message_kind?: unknown
}

function readMessageId(message: ChatMessageProjectionFloorSource): number {
  const raw = Number(message?.id ?? 0)
  return Number.isFinite(raw) ? raw : 0
}

function readSpeakerName(message: ChatMessageProjectionFloorSource, kind: ChatFloorRefKind): string {
  const name = String(message?.name ?? message?.memberName ?? '').trim()
  if (name) return name
  return kind === 'narration' ? '旁白' : ''
}

/** 本地分类（角色/旁白可读投影；调试与用户消息返回 null 不入桶，与 read/edit 同口径）。 */
function classifyProjectionKind(message: ChatMessageProjectionFloorSource): ChatFloorRefKind | null {
  const kind = classifyChatFloorKind(message)
  return kind === 'role' || kind === 'narration' ? kind : null
}

/**
 * 用当前会话消息列表 + 投影表（messageId→投影）造读/重投投影接缝。
 * 楼层编号复用 {@link parseChatFloorRefs} 同口径（与前端/ M2 / M3 同一套），调试楼层不入桶、不挤占角色/旁白序号。
 * projectionByMessageId 取「每条消息最新一条投影」（调用方按 created_at 时序覆盖，与 useSessionProjectionBatch 同口径）。
 */
export function createTidiaoMessageProjectionContext(
  messages: ReadonlyArray<ChatMessageProjectionFloorSource>,
  projectionByMessageId: ReadonlyMap<number, TidiaoProjectionSource>
): TidiaoMessageProjectionContext {
  const list = Array.isArray(messages) ? messages : []
  const buckets: Record<ChatFloorRefKind, ChatMessageProjectionFloorSource[]> = { role: [], narration: [] }
  for (const message of list) {
    const kind = classifyProjectionKind(message)
    if (kind === 'role' || kind === 'narration') buckets[kind].push(message)
  }
  const totals: Record<ChatFloorRefKind, number> = {
    role: buckets.role.length,
    narration: buckets.narration.length
  }
  const projMap: ReadonlyMap<number, TidiaoProjectionSource> =
    projectionByMessageId instanceof Map ? projectionByMessageId : new Map()
  // 重投标记按 messageId 去重（同条标记多次只算一次）。
  const marked = new Map<number, TidiaoReprojectTarget>()
  return {
    floorTotal(kind: ChatFloorRefKind): number {
      return totals[kind] ?? 0
    },
    readProjectionByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessageProjectionRead | null {
      const bucket = buckets[kind]
      if (!bucket || index <= 0 || index > bucket.length) return null
      const message = bucket[index - 1]
      const messageId = readMessageId(message)
      const speakerName = readSpeakerName(message, kind)
      const proj = projMap.get(messageId)
      const objectiveFact = String(proj?.objectiveFact ?? '').trim()
      return {
        ref: formatChatFloorRef({ kind, index }),
        kind,
        index,
        total: bucket.length,
        matched: true,
        messageId,
        speakerName,
        hasProjection: Boolean(objectiveFact),
        status: String(proj?.status ?? '').trim(),
        objectiveFact,
        startEnvText: renderEnv(proj?.startEnv),
        endEnvText: renderEnv(proj?.endEnv),
        changedText: renderChanged(proj?.changed)
      }
    },
    markReprojectByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessageReprojectMark | null {
      const bucket = buckets[kind]
      if (!bucket || index <= 0 || index > bucket.length) return null
      const message = bucket[index - 1]
      const messageId = readMessageId(message)
      const speakerName = readSpeakerName(message, kind)
      const ref = formatChatFloorRef({ kind, index })
      if (messageId > 0) marked.set(messageId, { messageId, ref, speakerName })
      return { ref, kind, index, total: bucket.length, matched: true, messageId, speakerName }
    },
    collectReprojectTargets(): TidiaoReprojectTarget[] {
      return Array.from(marked.values())
    }
  }
}

/** 渲染器依赖的最小消息形状（在楼层源形状上补 role/content，供用户消息分流与原文兜底）。 */
type DirectorRecentContextMessage = ChatMessageProjectionFloorSource & { role?: unknown; content?: unknown }

/**
 * 批次4-投影 A：渲染提调开局「投影态」最近上下文（替代 buildGroupCastRecentContext 的 4×80 截断原文）。
 * 取最近 maxMessages 条消息：
 *  - 角色/旁白楼层 → 用客观事实投影（objectiveFact + 结束环境/时间地点变化），让提调默认据已确立事实判方向；
 *  - 该楼层尚无投影事实（objectiveFact 空）→ 兜底回退原文截断，避免提调对该楼层失明；
 *  - 用户消息无投影 → 保留「用户（扮演X）」原文标签维持场景连续（与 buildGroupCastRecentContext 同口径）。
 * 楼层号复用 {@link assignChatFloorNumbers}，与提调 readMessageProjection 同一套编号，便于模型据「角色N/旁白M」回查原文。
 */
export function renderDirectorProjectionRecentContext(
  messages: ReadonlyArray<DirectorRecentContextMessage>,
  context: TidiaoMessageProjectionContext,
  maxMessages = 8
): string {
  const list = Array.isArray(messages) ? messages : []
  const floorMap = assignChatFloorNumbers(list)
  const lines: string[] = []
  for (const message of list.slice(-maxMessages)) {
    const record = message as Record<string, unknown>
    const role = String(record.role ?? '').trim()
    const rawName = String(record.name ?? record.memberName ?? '').trim()
    const rawContent = String(record.content ?? '').replace(/\s+/g, ' ').slice(0, 80)
    if (role === 'user') {
      // 用户消息不入楼层桶、无投影：保留显式「用户（扮演X）」标签，否则提调会把用户人设当陌生角色去楼层里空找。
      const who = rawName ? `用户（扮演${rawName}）` : '用户'
      if (rawContent) lines.push(`${who}：${rawContent}`)
      continue
    }
    const floor = floorMap.get(message)
    if (!floor || (floor.kind !== 'role' && floor.kind !== 'narration')) continue
    const ref = formatChatFloorRef({ kind: floor.kind, index: floor.index })
    const who = rawName || (floor.kind === 'narration' ? '旁白' : '')
    const read = context.readProjectionByFloor(floor.kind, floor.index)
    if (read && read.hasProjection) {
      const env: string[] = []
      if (read.endEnvText) env.push(read.endEnvText)
      if (read.changedText && read.changedText !== '无时间/地点变化') env.push(read.changedText)
      const envText = env.length ? `（${env.join('；')}）` : ''
      lines.push(`${ref}${who ? `·${who}` : ''}：${read.objectiveFact}${envText}`)
    } else if (rawContent) {
      // 兜底：该楼层尚无投影事实（未生成/失败），回退原文截断，避免提调对该楼层失明。
      lines.push(`${ref}${who ? `·${who}` : ''}：${rawContent}`)
    }
  }
  return lines.join('\n')
}
