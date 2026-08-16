/**
 * 会话楼层号共享真值 —— 提调真·导演 loop 重构计划书 批次 M2。
 *
 * 背景：UI 给每条消息显示「角色 N/总数」「旁白 M/总数」楼层号（桌面 ChatMessageStream.vue /
 * 移动 MobileChatThread.vue 各算一份）。批次 M 要让提调按「角色N/旁白M（含范围）」读会话消息，
 * 必须**复用同一套楼层号、不另造编号**（计划书 §378）。
 *
 * 本模块抽出「楼层分类 + 顺序编号」的纯逻辑，三端共用：
 * - 桌面/移动 Vue：messageFloorMap 的计数循环改调 {@link assignChatFloorNumbers}（各自 classify 原样不动，行为零变化）。
 * - 后端 M2 工具：用默认 {@link classifyChatFloorKind}（复刻前端口径）解析「角色N/旁白M」→ 定位消息。
 *
 * 联动维护：若以后改楼层分类规则（什么算旁白/角色/调试），桌面 ChatMessageStream.vue `getMessageFloorKind`、
 * 移动 MobileChatThread.vue `getMessageFloorKind`、本模块 `classifyChatFloorKind` 三处需同步，否则提调读到的
 * 楼层号会与用户看到的标签错位。
 */

import { isNarrationMessage } from './narrationProtocol'

/** 楼层种类：角色正文 / 旁白 / 旁白调试（调试不参与提调可读引用，但独立计数、不挤占角色/旁白序号）。 */
export type ChatFloorKind = 'role' | 'narration' | 'debug'

export interface ChatFloorInfo {
  kind: ChatFloorKind
  /** 同种类内 1 起顺序号（与 UI 显示一致）。 */
  index: number
  /** 同种类总数。 */
  total: number
}

/** 提调可引用的楼层种类（不含调试）。 */
export type ChatFloorRefKind = 'role' | 'narration'

export interface ChatFloorRef {
  kind: ChatFloorRefKind
  index: number
}

/** 楼层分类所需的最小消息形状（兼容 ChatMessage 与 Vue ChatMessageViewModel）。 */
interface FloorMessageLike {
  role?: unknown
  name?: unknown
  memberName?: unknown
  messageKind?: unknown
  message_kind?: unknown
}

const NARRATION_DEBUG_KIND = 'narration_debug'

/** 旁白调试判定（与前端口径一致：messageKind===narration_debug 或名称为「旁白调试」）。 */
export function isChatFloorNarrationDebug(message: FloorMessageLike | null | undefined): boolean {
  const kind = String(message?.messageKind ?? message?.message_kind ?? '').trim()
  const name = String(message?.name ?? message?.memberName ?? '').trim()
  return kind === NARRATION_DEBUG_KIND || name === '旁白调试'
}

/** 旁白判定（与前端口径一致：messageKind===narration 或名称为「旁白」，含名称兜底）。 */
export function isChatFloorNarration(message: FloorMessageLike | null | undefined): boolean {
  if (isNarrationMessage(message as never)) return true
  const name = String(message?.name ?? message?.memberName ?? '').trim()
  return name === '旁白'
}

/**
 * 楼层分类（后端默认口径，复刻前端 getMessageFloorKind）：
 * 调试 > 旁白 > 角色（assistant）> 不参与楼层（用户/其它，返回 ''）。
 */
export function classifyChatFloorKind(message: FloorMessageLike | null | undefined): ChatFloorKind | '' {
  if (isChatFloorNarrationDebug(message)) return 'debug'
  if (isChatFloorNarration(message)) return 'narration'
  if (String(message?.role ?? '').trim() === 'assistant') return 'role'
  return ''
}

/**
 * 给一组消息按楼层种类顺序编号 —— 三端共用的计数真值。
 * @param classify 分类函数；缺省用 {@link classifyChatFloorKind}。前端传各自的 getMessageFloorKind
 *                 以**保持原有分类行为不变**，仅复用此处的 index/total 计数循环。
 * 返回 Map（按消息对象引用键，与原前端实现一致），未参与楼层的消息不入表。
 */
export function assignChatFloorNumbers<T>(
  messages: readonly T[],
  classify: (message: T) => ChatFloorKind | '' = (message) => classifyChatFloorKind(message as FloorMessageLike)
): Map<T, ChatFloorInfo> {
  const totals: Record<ChatFloorKind, number> = { role: 0, narration: 0, debug: 0 }
  for (const message of messages) {
    const kind = classify(message)
    if (kind) totals[kind] += 1
  }
  const seen: Record<ChatFloorKind, number> = { role: 0, narration: 0, debug: 0 }
  const map = new Map<T, ChatFloorInfo>()
  for (const message of messages) {
    const kind = classify(message)
    if (!kind) continue
    seen[kind] += 1
    map.set(message, { kind, index: seen[kind], total: totals[kind] })
  }
  return map
}

/** 提调引用一次最多展开多少条楼层（防「角色1-9999」灌爆，渐进式暴露）。 */
export const CHAT_FLOOR_REF_MAX = 20

const FULLWIDTH_DIGIT_OFFSET = 0xff10 - 0x30

/** 全角数字→半角（用户可能输入「角色３」）。 */
function normalizeDigits(input: string): string {
  return input.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET))
}

// 匹配「角色2 / 角色消息2 / 旁白3 / 角色3-5 / 角色3到5」等；范围分隔支持 - ~ 到 至。
const FLOOR_REF_PATTERN = /(角色|旁白)(?:消息)?\s*(\d+)(?:\s*(?:[-~]|到|至)\s*(\d+))?/g

/** 楼层标签文案（与 UI「角色 N/旁白 M」一致，去掉总数后缀供引用回显）。 */
export function formatChatFloorRef(ref: ChatFloorRef): string {
  return `${ref.kind === 'narration' ? '旁白' : '角色'}${ref.index}`
}

/**
 * 解析提调/用户指令里的楼层引用（支持单条、范围、多目标、混合种类），按出现顺序去重、整体截断到上限。
 * 例：「角色消息2」→[{role,2}]；「角色3-5、旁白2」→[{role,3},{role,4},{role,5},{narration,2}]。
 */
export function parseChatFloorRefs(input: string): ChatFloorRef[] {
  const text = normalizeDigits(String(input || ''))
  const refs: ChatFloorRef[] = []
  const seen = new Set<string>()
  const push = (kind: ChatFloorRefKind, index: number) => {
    if (!Number.isInteger(index) || index <= 0) return
    const key = `${kind}:${index}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push({ kind, index })
  }
  for (const match of text.matchAll(FLOOR_REF_PATTERN)) {
    if (refs.length >= CHAT_FLOOR_REF_MAX) break
    const kind: ChatFloorRefKind = match[1] === '旁白' ? 'narration' : 'role'
    const from = Number(match[2])
    const to = match[3] !== undefined ? Number(match[3]) : from
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    for (let i = start; i <= end; i += 1) {
      if (refs.length >= CHAT_FLOOR_REF_MAX) break
      push(kind, i)
    }
  }
  return refs
}
