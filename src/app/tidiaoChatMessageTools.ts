/**
 * 提调「读会话任意消息」工具逻辑 —— 提调真·导演 loop 重构计划书 批次 M2。
 *
 * 让提调按 UI 楼层号（「角色N / 旁白M」，含范围「角色3-5」）读会话里任意一条角色/旁白消息原文，
 * 复用取料三件套同一范式：纯运行逻辑 + 注入接缝 {@link TidiaoChatMessageReadContext}（数据从哪来解耦），
 * harness 端把它折成 `readChatMessage` 工具。楼层号解析复用 {@link parseChatFloorRefs}（与前端同一套编号）。
 *
 * 只读边界：本模块只读不写。带回原文 + 楼层号 + 稳定 messageId，作为后续 M3「锚定精修（str_replace 写回版本）」
 * 的定位锚（位置信息 = messageId + 完整原文，供精修工具精准 splice）。
 */

import {
  classifyChatFloorKind,
  formatChatFloorRef,
  parseChatFloorRefs,
  type ChatFloorRef,
  type ChatFloorRefKind
} from './chatMessageFloor'

/** 一条楼层读取结果（命中=带原文，未命中=matched:false 供提调据 total 自纠引用）。 */
export interface TidiaoChatMessageRead {
  /** 规范化引用文案，如「角色2」。 */
  ref: string
  kind: ChatFloorRefKind
  index: number
  /** 该种类楼层总数（即便未命中也回报，便于提调判断越界）。 */
  total: number
  matched: boolean
  /** 稳定 DB id（未命中为 0）。 */
  messageId: number
  speakerName: string
  /** 消息当前生效版本原文（未命中为空串）。 */
  content: string
}

/** 读会话消息接缝：把「会话消息从哪来」从工具逻辑里抽出来；工厂用当前会话消息列表实现。 */
export interface TidiaoChatMessageReadContext {
  /** 按楼层种类 + 序号读一条；越界/不存在返回 null（但仍由调用方据 total 回报未命中）。 */
  readByFloor(kind: ChatFloorRefKind, index: number): TidiaoChatMessageRead | null
  /** 某种类楼层总数（供未命中时回报）。 */
  floorTotal(kind: ChatFloorRefKind): number
  /** 稳定引用读取；供投影搜索结果把结构化 messageId 直接交给详情工具。 */
  readByMessageId(messageId: number): TidiaoChatMessageRead | null
}

/** M2 工具机器名（harness 注册 + activeTools 门控用）。 */
export const TIDIAO_READ_CHAT_MESSAGE_TOOL_NAME = 'readChatMessage'

// 工具说明收口（批次 C）：本工具「何时用 + 参数 schema」已迁至 tidiaoToolContract.ts 唯一真值源，不在此另写。

export interface TidiaoReadChatMessagesRequest {
  /** 提调/用户的楼层指令，如「角色消息2」「角色3-5、旁白2」。 */
  query?: string
  /** 统一结构引用或 messageId；与 query 可并用。 */
  references?: unknown[]
}

export interface TidiaoReadChatMessagesResult {
  reads: TidiaoChatMessageRead[]
}

/**
 * 解析楼层指令 → 逐条读取。无可解析引用返回空 reads（调用方据此报「未识别楼层引用」）。
 * 未命中的引用也保留（matched:false + total），让提调知道「角色7」不存在（共 5 条）。
 */
export function runTidiaoReadChatMessages(
  request: TidiaoReadChatMessagesRequest,
  context: TidiaoChatMessageReadContext
): TidiaoReadChatMessagesResult {
  const refs = parseChatFloorRefs(String(request?.query || ''))
  const reads: TidiaoChatMessageRead[] = []
  const seenMessageIds = new Set<number>()
  for (const raw of Array.isArray(request?.references) ? request.references : []) {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const messageId = Number(record?.messageId ?? record?.id ?? raw)
    if (!Number.isInteger(messageId) || messageId <= 0 || seenMessageIds.has(messageId)) continue
    const hit = context.readByMessageId(messageId)
    if (hit) {
      reads.push(hit)
      seenMessageIds.add(messageId)
    } else {
      reads.push({ ref: `#${messageId}`, kind: 'role', index: 0, total: 0, matched: false, messageId, speakerName: '', content: '' })
    }
  }
  reads.push(...refs.map((ref: ChatFloorRef) => {
    const hit = context.readByFloor(ref.kind, ref.index)
    if (hit) {
      if (seenMessageIds.has(hit.messageId)) return null
      seenMessageIds.add(hit.messageId)
      return hit
    }
    return {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: '',
      content: ''
    }
  }).filter((item): item is TidiaoChatMessageRead => Boolean(item)))
  return { reads }
}

/** 工厂依赖的最小消息形状（兼容 ChatMessage 与运行态 Record）。 */
interface ChatMessageReadSource {
  id?: unknown
  content?: unknown
  name?: unknown
  memberName?: unknown
  role?: unknown
  messageKind?: unknown
  message_kind?: unknown
}

function readMessageId(message: ChatMessageReadSource): number {
  const raw = Number(message?.id ?? 0)
  return Number.isFinite(raw) ? raw : 0
}

function readSpeakerName(message: ChatMessageReadSource, kind: ChatFloorRefKind): string {
  const name = String(message?.name ?? message?.memberName ?? '').trim()
  if (name) return name
  return kind === 'narration' ? '旁白' : ''
}

/**
 * 用当前会话消息列表造读会话消息接缝。
 * 楼层编号复用 {@link assignChatFloorNumbers}（与前端同一套），调试楼层不可读、不挤占角色/旁白序号。
 */
export function createTidiaoChatMessageReadContext(
  messages: ReadonlyArray<ChatMessageReadSource>
): TidiaoChatMessageReadContext {
  const list = Array.isArray(messages) ? messages : []
  // 自建按种类的有序桶（不依赖 Map 对象引用键，运行态消息可能被复制），与 assignChatFloorNumbers 同口径计数。
  const buckets: Record<ChatFloorRefKind, ChatMessageReadSource[]> = { role: [], narration: [] }
  for (const message of list) {
    const kind = classifyReadKind(message)
    if (kind === 'role' || kind === 'narration') buckets[kind].push(message)
  }
  const totals: Record<ChatFloorRefKind, number> = {
    role: buckets.role.length,
    narration: buckets.narration.length
  }
  const byMessageId = new Map<number, { message: ChatMessageReadSource; kind: ChatFloorRefKind; index: number }>()
  for (const kind of ['role', 'narration'] as const) {
    buckets[kind].forEach((message, index) => {
      const messageId = readMessageId(message)
      if (messageId > 0) byMessageId.set(messageId, { message, kind, index: index + 1 })
    })
  }
  return {
    floorTotal(kind: ChatFloorRefKind): number {
      return totals[kind] ?? 0
    },
    readByFloor(kind: ChatFloorRefKind, index: number): TidiaoChatMessageRead | null {
      const bucket = buckets[kind]
      if (!bucket || index <= 0 || index > bucket.length) return null
      const message = bucket[index - 1]
      return {
        ref: formatChatFloorRef({ kind, index }),
        kind,
        index,
        total: bucket.length,
        matched: true,
        messageId: readMessageId(message),
        speakerName: readSpeakerName(message, kind),
        content: String(message?.content ?? '').trim()
      }
    },
    readByMessageId(messageId: number): TidiaoChatMessageRead | null {
      const hit = byMessageId.get(Number(messageId))
      if (!hit) return null
      return {
        ref: formatChatFloorRef({ kind: hit.kind, index: hit.index }),
        kind: hit.kind,
        index: hit.index,
        total: buckets[hit.kind].length,
        matched: true,
        messageId: readMessageId(hit.message),
        speakerName: readSpeakerName(hit.message, hit.kind),
        content: String(hit.message?.content ?? '').trim()
      }
    }
  }
}

/** 本地分类（角色/旁白可读；调试与用户消息返回 null 不入桶）。 */
function classifyReadKind(message: ChatMessageReadSource): ChatFloorRefKind | null {
  const kind = classifyChatFloorKind(message)
  return kind === 'role' || kind === 'narration' ? kind : null
}
