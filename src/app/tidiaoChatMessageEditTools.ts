/**
 * 提调「锚定精修」工具逻辑 —— 提调真·导演 loop 重构计划书 批次 M3。
 *
 * 让提调按 UI 楼层号（「角色N / 旁白M」）对会话里某条消息做「旧片段→新片段」精准 splice，
 * 只动目标段、其余不动（整条重写 = 退化情形）。学 Claude Code 的 Edit/str_replace：
 * oldText 必须在当前内容里**唯一命中**（多处需显式 replaceAll，未命中报错让模型换更长的唯一片段）。
 *
 * 与 M2 读会话工具（{@link ./tidiaoChatMessageTools}）成对：M2 只读带回原文 + messageId 作锚，
 * 本模块对内存工作副本做精改、累积「messageId→最终内容」，**loop 收束后由 pipeline/ops 统一写回新版本**
 * （复用 versionList，可切版本回滚）；DB 写不进 loop。
 *
 * 复用同一接缝范式：纯运行逻辑 + 注入接缝 {@link TidiaoChatMessageEditContext}（数据从哪来 + 工作副本归属解耦）。
 * 楼层号解析复用 {@link parseChatFloorRefs}（与前端/ M2 同一套编号）。
 */

import {
  classifyChatFloorKind,
  formatChatFloorRef,
  parseChatFloorRefs,
  type ChatFloorRef,
  type ChatFloorRefKind
} from './chatMessageFloor'

/** 一次 str_replace 编辑请求（模型每次只改一个唯一片段）。 */
export interface TidiaoStrReplaceEdit {
  /** 要被替换的旧片段（必须在当前内容里唯一出现，除非 replaceAll）。 */
  oldText: string
  /** 替换后的新片段（可为空串=删除该片段）。 */
  newText: string
  /** 同一片段多处出现时是否全替换；缺省 false（多处不唯一即报 ambiguous 让模型给更长片段）。 */
  replaceAll?: boolean
}

/** str_replace 结果分类。 */
export type TidiaoEditOutcome =
  | 'applied'    // 已替换
  | 'not-found'  // oldText 未命中
  | 'ambiguous'  // oldText 多处命中且未 replaceAll
  | 'empty-old'  // oldText 为空（不允许）
  | 'no-op'      // oldText === newText，无变化

export interface TidiaoStrReplaceResult {
  outcome: TidiaoEditOutcome
  /** 命中处数（ambiguous 时 >1，not-found 时 0）。 */
  occurrences: number
  /** 应用后的新内容（仅 applied 与 content 变化；其余原样返回入参 content）。 */
  content: string
}

/** 出现次数（用 split 计数，避免正则转义；oldText 非空时调用）。 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  return haystack.split(needle).length - 1
}

/**
 * 纯 str_replace：oldText 必须在 content 中唯一出现（除非 replaceAll 全替换）。
 * - oldText 空 → empty-old（不允许整段精修靠空锚）。
 * - 0 处 → not-found；>1 处且非 replaceAll → ambiguous（让模型给更长的唯一片段）。
 * - oldText===newText 或替换后无变化 → no-op。
 */
export function applyStrReplace(content: string, edit: TidiaoStrReplaceEdit): TidiaoStrReplaceResult {
  const source = String(content ?? '')
  const oldText = String(edit?.oldText ?? '')
  const newText = String(edit?.newText ?? '')
  if (!oldText) return { outcome: 'empty-old', occurrences: 0, content: source }
  const occurrences = countOccurrences(source, oldText)
  if (occurrences === 0) return { outcome: 'not-found', occurrences: 0, content: source }
  if (occurrences > 1 && !edit.replaceAll) return { outcome: 'ambiguous', occurrences, content: source }
  if (oldText === newText) return { outcome: 'no-op', occurrences, content: source }
  const next = edit.replaceAll
    ? source.split(oldText).join(newText)
    : source.replace(oldText, newText)
  if (next === source) return { outcome: 'no-op', occurrences, content: source }
  return { outcome: 'applied', occurrences, content: next }
}

/** 一次精准追加请求（2026-07-07·补完截断消息）：text 必填；afterText 缺省=追加到消息末尾，给了则在该唯一锚点后插入。 */
export interface TidiaoAppendEdit {
  /** 要追加的新内容（提调按该消息已有文风续写；不能为空）。 */
  text: string
  /** 插入锚点：该消息当前内容里唯一出现的连续片段，新内容插在它后面；缺省=追加到末尾。 */
  afterText?: string
}

/**
 * 纯追加语义（与 applyStrReplace 同族）：
 * - text 空 → no-op（没有内容可补）。
 * - afterText 缺省/空 → 直接拼接到内容末尾（截断补完的主路径）。
 * - afterText 给了 → 必须唯一命中（0 处 not-found、>1 处 ambiguous，让模型换更长锚点），新内容插在锚点后。
 */
export function applyAppend(content: string, edit: TidiaoAppendEdit): TidiaoStrReplaceResult {
  const source = String(content ?? '')
  const text = String(edit?.text ?? '')
  const afterText = String(edit?.afterText ?? '')
  if (!text) return { outcome: 'no-op', occurrences: 0, content: source }
  if (!afterText) return { outcome: 'applied', occurrences: 0, content: source + text }
  const occurrences = countOccurrences(source, afterText)
  if (occurrences === 0) return { outcome: 'not-found', occurrences: 0, content: source }
  if (occurrences > 1) return { outcome: 'ambiguous', occurrences, content: source }
  return { outcome: 'applied', occurrences, content: source.replace(afterText, afterText + text) }
}

/** 一条精修工具执行结果（命中楼层=带 outcome/新内容；未命中楼层=matched:false 供模型据 total 自纠引用）。 */
export interface TidiaoChatMessageEdit {
  /** 规范化引用文案，如「角色2」。 */
  ref: string
  kind: ChatFloorRefKind
  index: number
  /** 该种类楼层总数（即便未命中也回报，便于提调判断越界）。 */
  total: number
  /** 楼层是否命中到一条消息。 */
  matched: boolean
  /** 稳定 DB id（未命中为 0）。 */
  messageId: number
  speakerName: string
  /** str_replace 结果分类（楼层未命中时为 'not-found' 占位、matched=false）。 */
  outcome: TidiaoEditOutcome
  occurrences: number
  /** 精修后当前内容（applied 时为新内容；其余为现内容）。 */
  content: string
}

/** 某条被改过的消息的最终态（loop 收束后 pipeline 取出，逐条作新版本写回）。 */
export interface TidiaoChatMessageEditCommit {
  kind: ChatFloorRefKind
  index: number
  messageId: number
  speakerName: string
  ref: string
  /** 应用了若干次 splice 后的最终内容。 */
  content: string
  /** 本条累计成功精修次数。 */
  editCount: number
}

/** 锚定精修接缝：把「会话消息从哪来 + 工作副本归属」从工具逻辑里抽出来；工厂用当前会话消息列表实现。 */
export interface TidiaoChatMessageEditContext {
  /** 对某楼层消息做一次 str_replace（在工作副本上）；楼层越界/不存在返回 null。 */
  editByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoStrReplaceEdit): TidiaoChatMessageEdit | null
  /** 对某楼层消息做一次精准追加（在工作副本上·与 editByFloor 同一副本累积）；楼层越界/不存在返回 null。 */
  appendByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoAppendEdit): TidiaoChatMessageEdit | null
  /** 某种类楼层总数（供未命中时回报）。 */
  floorTotal(kind: ChatFloorRefKind): number
  /** loop 收束后取累积改动（仅返回真改过的消息，供逐条作新版本写回）。 */
  collectEdits(): TidiaoChatMessageEditCommit[]
}

/** M3 工具机器名（harness 注册 + activeTools 门控用）。 */
export const TIDIAO_EDIT_CHAT_MESSAGE_TOOL_NAME = 'editChatMessage'

/** 精准追加工具机器名（2026-07-07·补完截断消息；与 editChatMessage 共用工作副本/落库链路）。 */
export const TIDIAO_APPEND_CHAT_MESSAGE_TOOL_NAME = 'appendChatMessage'

// 工具说明收口（批次 C）：本工具「何时用 + 参数 schema」已迁至 tidiaoToolContract.ts 唯一真值源，不在此另写。

export interface TidiaoEditChatMessageRequest {
  /** 楼层引用（单条），如「角色2」。多目标由模型分多次调用，每次一条。 */
  ref: string
  oldText: string
  newText: string
  replaceAll?: boolean
}

export interface TidiaoEditChatMessageResult {
  /** 解析出的目标楼层的精修结果（无可解析引用时为 null）。 */
  edit: TidiaoChatMessageEdit | null
}

/**
 * 解析楼层引用（取首个）→ 在工作副本上做一次 str_replace。
 * 无可解析引用返回 { edit: null }（调用方据此报「未识别楼层引用」）；
 * 楼层越界返回 matched:false + total（让模型知道「角色7」不存在，共 N 条）。
 */
export function runTidiaoEditChatMessage(
  request: TidiaoEditChatMessageRequest,
  context: TidiaoChatMessageEditContext
): TidiaoEditChatMessageResult {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const ref: ChatFloorRef | undefined = refs[0]
  if (!ref) return { edit: null }
  const editInput: TidiaoStrReplaceEdit = {
    oldText: String(request?.oldText ?? ''),
    newText: String(request?.newText ?? ''),
    ...(request?.replaceAll ? { replaceAll: true } : {})
  }
  const hit = context.editByFloor(ref.kind, ref.index, editInput)
  if (hit) return { edit: hit }
  return {
    edit: {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: '',
      outcome: 'not-found',
      occurrences: 0,
      content: ''
    }
  }
}

export interface TidiaoAppendChatMessageRequest {
  /** 楼层引用（单条），如「角色2」。 */
  ref: string
  text: string
  afterText?: string
}

/**
 * 精准追加：解析楼层引用（取首个）→ 在工作副本上追加/锚点插入（与 runTidiaoEditChatMessage 同一返回口径）。
 * 无可解析引用返回 { edit: null }；楼层越界返回 matched:false + total。
 */
export function runTidiaoAppendChatMessage(
  request: TidiaoAppendChatMessageRequest,
  context: TidiaoChatMessageEditContext
): TidiaoEditChatMessageResult {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const ref: ChatFloorRef | undefined = refs[0]
  if (!ref) return { edit: null }
  const appendInput: TidiaoAppendEdit = {
    text: String(request?.text ?? ''),
    ...(request?.afterText ? { afterText: String(request.afterText) } : {})
  }
  const hit = context.appendByFloor(ref.kind, ref.index, appendInput)
  if (hit) return { edit: hit }
  return {
    edit: {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: '',
      outcome: 'not-found',
      occurrences: 0,
      content: ''
    }
  }
}

/** 工厂依赖的最小消息形状（兼容 ChatMessage 与运行态 Record）。 */
interface ChatMessageEditSource {
  id?: unknown
  content?: unknown
  name?: unknown
  memberName?: unknown
  role?: unknown
  messageKind?: unknown
  message_kind?: unknown
}

function readMessageId(message: ChatMessageEditSource): number {
  const raw = Number(message?.id ?? 0)
  return Number.isFinite(raw) ? raw : 0
}

function readSpeakerName(message: ChatMessageEditSource, kind: ChatFloorRefKind): string {
  const name = String(message?.name ?? message?.memberName ?? '').trim()
  if (name) return name
  return kind === 'narration' ? '旁白' : ''
}

/** 本地分类（角色/旁白可改；调试与用户消息返回 null 不入桶）。 */
function classifyEditKind(message: ChatMessageEditSource): ChatFloorRefKind | null {
  const kind = classifyChatFloorKind(message)
  return kind === 'role' || kind === 'narration' ? kind : null
}

/** 单条消息的工作副本（持当前内容 + 累计改动次数）。 */
interface EditWorkingCopy {
  message: ChatMessageEditSource
  messageId: number
  speakerName: string
  content: string
  editCount: number
}

/**
 * 用当前会话消息列表造锚定精修接缝。
 * 楼层编号复用 {@link assignChatFloorNumbers} 口径（与前端/ M2 同一套），调试楼层不可改、不挤占角色/旁白序号。
 * 工作副本在内存里逐次 splice，不触 DB；改动经 collectEdits 交 pipeline 收束后写回新版本。
 */
export function createTidiaoChatMessageEditContext(
  messages: ReadonlyArray<ChatMessageEditSource>
): TidiaoChatMessageEditContext {
  const list = Array.isArray(messages) ? messages : []
  const buckets: Record<ChatFloorRefKind, EditWorkingCopy[]> = { role: [], narration: [] }
  for (const message of list) {
    const kind = classifyEditKind(message)
    if (kind === 'role' || kind === 'narration') {
      buckets[kind].push({
        message,
        messageId: readMessageId(message),
        speakerName: readSpeakerName(message, kind),
        content: String(message?.content ?? ''),
        editCount: 0
      })
    }
  }
  const totals: Record<ChatFloorRefKind, number> = {
    role: buckets.role.length,
    narration: buckets.narration.length
  }
  // 精修/追加共用：定位楼层工作副本 → 应用变换 → applied 才更新副本并计数（进 collectEdits）。
  const applyOnFloor = (
    kind: ChatFloorRefKind,
    index: number,
    transform: (content: string) => TidiaoStrReplaceResult
  ): TidiaoChatMessageEdit | null => {
    const bucket = buckets[kind]
    if (!bucket || index <= 0 || index > bucket.length) return null
    const copy = bucket[index - 1]
    const result = transform(copy.content)
    if (result.outcome === 'applied') {
      copy.content = result.content
      copy.editCount += 1
    }
    return {
      ref: formatChatFloorRef({ kind, index }),
      kind,
      index,
      total: bucket.length,
      matched: true,
      messageId: copy.messageId,
      speakerName: copy.speakerName,
      outcome: result.outcome,
      occurrences: result.occurrences,
      content: copy.content
    }
  }
  return {
    floorTotal(kind: ChatFloorRefKind): number {
      return totals[kind] ?? 0
    },
    editByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoStrReplaceEdit): TidiaoChatMessageEdit | null {
      return applyOnFloor(kind, index, (content) => applyStrReplace(content, edit))
    },
    appendByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoAppendEdit): TidiaoChatMessageEdit | null {
      return applyOnFloor(kind, index, (content) => applyAppend(content, edit))
    },
    collectEdits(): TidiaoChatMessageEditCommit[] {
      const commits: TidiaoChatMessageEditCommit[] = []
      ;(['role', 'narration'] as ChatFloorRefKind[]).forEach((kind) => {
        buckets[kind].forEach((copy, idx) => {
          if (copy.editCount <= 0) return
          commits.push({
            kind,
            index: idx + 1,
            messageId: copy.messageId,
            speakerName: copy.speakerName,
            ref: formatChatFloorRef({ kind, index: idx + 1 }),
            content: copy.content,
            editCount: copy.editCount
          })
        })
      })
      return commits
    }
  }
}
