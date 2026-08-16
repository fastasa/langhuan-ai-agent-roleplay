/**
 * 提调「读/改提示词」工具逻辑 —— 提调真·导演 loop 重构计划书 批次 P1（纠偏中策）。
 *
 * 纠偏三策里的**中策**：提调读这条消息已存的**提示词**（promptLog 组装文本）→ 按 str_replace「旧片段→新片段」
 * 精改提示词文字 → 由 pipeline 用**正常最终回复模型**据新提示词重生成正文（P3 接缝）→ 新版本写回。
 *
 * 与上策（{@link ./tidiaoChatMessageEditTools} 改消息**原文**）的区别：本模块改的是**提示词**、不直接产出正文，
 * 需经模型据新提示词重生成；故本模块只负责「读提示词 + str_replace 改提示词工作副本 + 累积改动」，
 * **不调模型、不写库**——重生成与写回由 pipeline/ops 在 loop 收束后收口（P3）。
 *
 * 复用同一接缝范式：纯运行逻辑 + 注入接缝 {@link TidiaoMessagePromptContext}（提示词从哪来 + 工作副本归属解耦）。
 * 提示词文本不在消息对象里（在独立 promptLog），故接缝由 pipeline 预取目标消息的 promptLog 后建桶注入。
 * 楼层号解析复用 {@link parseChatFloorRefs}（与前端/ M2/M3 同一套编号）；str_replace 复用 {@link applyStrReplace}。
 */

import {
  formatChatFloorRef,
  parseChatFloorRefs,
  type ChatFloorRef,
  type ChatFloorRefKind
} from './chatMessageFloor'
import {
  applyStrReplace,
  type TidiaoEditOutcome,
  type TidiaoStrReplaceEdit
} from './tidiaoChatMessageEditTools'

/** 一条目标消息的提示词来源（pipeline 预取 promptLog 后提供）。 */
export interface TidiaoMessagePromptSource {
  kind: ChatFloorRefKind
  /** 该种类楼层序号（1 起，与前端/ M2/M3 同口径）。 */
  index: number
  messageId: number
  speakerName: string
  /** 该消息已存的提示词文本（promptLog 组装，提调读/改的对象）。 */
  promptText: string
}

/** 读提示词工具一条结果（命中楼层=带提示词文本；未命中=matched:false + total 供模型自纠引用）。 */
export interface TidiaoMessagePromptRead {
  ref: string
  kind: ChatFloorRefKind
  index: number
  total: number
  matched: boolean
  messageId: number
  speakerName: string
  /** 该消息提示词文本（未命中为空串）。 */
  promptText: string
}

/** 改提示词工具一条结果（含 str_replace 分类 + 改后提示词文本）。 */
export interface TidiaoMessagePromptEdit {
  ref: string
  kind: ChatFloorRefKind
  index: number
  total: number
  matched: boolean
  messageId: number
  speakerName: string
  outcome: TidiaoEditOutcome
  occurrences: number
  /** 改后当前提示词文本（applied 为新文本；其余为现文本）。 */
  promptText: string
}

/** 某条被改过提示词的最终态（loop 收束后 pipeline 取出，据新提示词重生成正文 + 新版本写回）。 */
export interface TidiaoMessagePromptEditCommit {
  kind: ChatFloorRefKind
  index: number
  messageId: number
  speakerName: string
  ref: string
  /** 应用了若干次 splice 后的最终提示词文本（pipeline 据此重生成正文）。 */
  promptText: string
  /** 本条累计成功改提示词次数。 */
  editCount: number
}

/** 读/改提示词接缝：把「提示词从哪来 + 工作副本归属」从工具逻辑里抽出来；pipeline 用预取的 promptLog 建桶实现。
 *  批次E（2026-07-03·层4）：readPromptByFloor 允许返回 Promise——统筹 loop 面对全历史不预取，
 *  改「提调真调工具时按楼层懒 fetch 该消息 promptLog」；纠偏侧预取桶实现（同步返回）不受影响。 */
export interface TidiaoMessagePromptContext {
  /** 按楼层读某消息提示词文本；楼层越界/无来源返回 null。允许异步（懒取实现按需 fetch）。 */
  readPromptByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessagePromptRead | null | Promise<TidiaoMessagePromptRead | null>
  /** 对某楼层消息提示词做一次 str_replace（在工作副本上）；楼层越界/无来源返回 null。 */
  editPromptByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoStrReplaceEdit): TidiaoMessagePromptEdit | null
  /** 某种类楼层总数（供未命中时回报；pipeline 可传消息总数，缺省按来源桶大小）。 */
  floorTotal(kind: ChatFloorRefKind): number
  /** loop 收束后取累积改动（仅返回真改过提示词的消息，供逐条据新提示词重生成 + 新版本写回）。 */
  collectPromptEdits(): TidiaoMessagePromptEditCommit[]
}

/** 中策读提示词工具机器名（harness 注册 + activeTools 门控用）。 */
export const TIDIAO_READ_MESSAGE_PROMPT_TOOL_NAME = 'readMessagePrompt'
/** 中策改提示词工具机器名。 */
export const TIDIAO_EDIT_MESSAGE_PROMPT_TOOL_NAME = 'editMessagePrompt'

// 工具说明收口（批次 C）：读/改提示词「何时用 + 参数 schema」已迁至 tidiaoToolContract.ts 唯一真值源，不在此另写。

export interface TidiaoReadMessagePromptRequest {
  /** 楼层引用，可多目标（如「角色2、旁白3」「角色3-5」）。 */
  ref: string
}

export interface TidiaoReadMessagePromptResult {
  reads: TidiaoMessagePromptRead[]
}

/**
 * 解析楼层引用（可多条）→ 逐条读提示词文本。
 * 无可解析引用返回 { reads: [] }（调用方据此报「未识别楼层引用」）；
 * 楼层越界/无预取来源返回 matched:false + total（让模型知道该楼层不可读、共 N 条）。
 */
export async function runTidiaoReadMessagePrompt(
  request: TidiaoReadMessagePromptRequest,
  context: TidiaoMessagePromptContext
): Promise<TidiaoReadMessagePromptResult> {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const reads: TidiaoMessagePromptRead[] = await Promise.all(refs.map(async (ref) => {
    const hit = await context.readPromptByFloor(ref.kind, ref.index)
    if (hit) return hit
    return {
      ref: formatChatFloorRef(ref),
      kind: ref.kind,
      index: ref.index,
      total: context.floorTotal(ref.kind),
      matched: false,
      messageId: 0,
      speakerName: '',
      promptText: ''
    }
  }))
  return { reads }
}

export interface TidiaoEditMessagePromptRequest {
  /** 楼层引用（单条），如「角色2」。多目标由模型分多次调用，每次一条。 */
  ref: string
  oldText: string
  newText: string
  replaceAll?: boolean
}

export interface TidiaoEditMessagePromptResult {
  /** 解析出的目标楼层的改提示词结果（无可解析引用时为 null）。 */
  edit: TidiaoMessagePromptEdit | null
}

/**
 * 解析楼层引用（取首个）→ 在提示词工作副本上做一次 str_replace。
 * 无可解析引用返回 { edit: null }；楼层越界/无来源返回 matched:false + total。
 */
export function runTidiaoEditMessagePrompt(
  request: TidiaoEditMessagePromptRequest,
  context: TidiaoMessagePromptContext
): TidiaoEditMessagePromptResult {
  const refs = parseChatFloorRefs(String(request?.ref || ''))
  const ref: ChatFloorRef | undefined = refs[0]
  if (!ref) return { edit: null }
  const editInput: TidiaoStrReplaceEdit = {
    oldText: String(request?.oldText ?? ''),
    newText: String(request?.newText ?? ''),
    ...(request?.replaceAll ? { replaceAll: true } : {})
  }
  const hit = context.editPromptByFloor(ref.kind, ref.index, editInput)
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
      promptText: ''
    }
  }
}

/** 单条提示词工作副本（持当前提示词文本 + 累计改动次数）。 */
interface PromptWorkingCopy {
  messageId: number
  speakerName: string
  promptText: string
  editCount: number
}

/**
 * 用 pipeline 预取的目标消息提示词来源造读/改提示词接缝。
 * 来源已带 kind/index（pipeline 由楼层引用 + promptLog fetch 解析），本工厂按 kind 桶 + index 定位。
 * 工作副本在内存里逐次 splice，不触模型/DB；改动经 collectPromptEdits 交 pipeline 收束后据新提示词重生成 + 新版本写回。
 * totals 可选：传消息总数用于未命中回报（缺省按来源桶大小）。
 */
export function createTidiaoMessagePromptContext(
  sources: ReadonlyArray<TidiaoMessagePromptSource>,
  totals?: Partial<Record<ChatFloorRefKind, number>>,
  options?: {
    /** 2026-07-06 懒取兜底（真机修「无提示词可读」死胡同）：纠偏装配此前只预取「纠偏发起目标」一条的
     *  promptLog，纲领却告诉提调「要改的可能是其他消息」——提调定位到别的楼层想走中策就撞死。
     *  传入本回调后，未预取楼层按需取该消息 promptLog；命中即**落工作副本桶**——后续
     *  editPromptByFloor/regenerateFromPrompt/collectPromptEdits 与预取来源完全同一套语义。
     *  统筹侧沿用自己的只读懒取实现（pipeline directorMessagePromptContext），不经本参数。 */
    lazyFetch?: (kind: ChatFloorRefKind, index: number) => Promise<TidiaoMessagePromptSource | null>
  }
): TidiaoMessagePromptContext {
  // 注意：不要用 Array.isArray 守卫 —— 它会把 ReadonlyArray 窄化成 any[]，丢掉 source 的类型。
  const list: ReadonlyArray<TidiaoMessagePromptSource> = sources ?? []
  const buckets: Record<ChatFloorRefKind, Record<number, PromptWorkingCopy>> = { role: {}, narration: {} }
  for (const source of list) {
    const kind = source?.kind
    const index = Number(source?.index ?? 0)
    if ((kind !== 'role' && kind !== 'narration') || !Number.isFinite(index) || index <= 0) continue
    buckets[kind][index] = {
      messageId: Number(source?.messageId ?? 0) || 0,
      speakerName: String(source?.speakerName ?? '').trim(),
      promptText: String(source?.promptText ?? ''),
      editCount: 0
    }
  }
  const sourceCount = (kind: ChatFloorRefKind): number => Object.keys(buckets[kind]).length
  const totalFor = (kind: ChatFloorRefKind): number => {
    const provided = totals?.[kind]
    return typeof provided === 'number' && provided >= 0 ? provided : sourceCount(kind)
  }
  const readFromBucket = (kind: ChatFloorRefKind, index: number): TidiaoMessagePromptRead | null => {
    const copy = buckets[kind]?.[index]
    if (!copy) return null
    return {
      ref: formatChatFloorRef({ kind, index }),
      kind,
      index,
      total: totalFor(kind),
      matched: true,
      messageId: copy.messageId,
      speakerName: copy.speakerName,
      promptText: copy.promptText
    }
  }
  // 懒取未命中缓存：同一楼层查过没有就不再重复 fetch（轮内多次读同层零开销）。
  const lazyMisses = new Set<string>()
  return {
    floorTotal(kind: ChatFloorRefKind): number {
      return totalFor(kind)
    },
    readPromptByFloor(kind: ChatFloorRefKind, index: number): TidiaoMessagePromptRead | null | Promise<TidiaoMessagePromptRead | null> {
      const hit = readFromBucket(kind, index)
      if (hit) return hit
      const lazyFetch = options?.lazyFetch
      const missKey = `${kind}:${index}`
      if (!lazyFetch || lazyMisses.has(missKey)) return null
      return (async () => {
        let source: TidiaoMessagePromptSource | null = null
        try {
          source = await lazyFetch(kind, index)
        } catch {
          // fetch 失败按「无提示词」处理（不阻断 loop），记 miss 不再重试。
        }
        const promptText = String(source?.promptText ?? '')
        if (!source || !promptText.trim()) {
          lazyMisses.add(missKey)
          return null
        }
        buckets[kind][index] = {
          messageId: Number(source.messageId ?? 0) || 0,
          speakerName: String(source.speakerName ?? '').trim(),
          promptText,
          editCount: 0
        }
        return readFromBucket(kind, index)
      })()
    },
    editPromptByFloor(kind: ChatFloorRefKind, index: number, edit: TidiaoStrReplaceEdit): TidiaoMessagePromptEdit | null {
      const copy = buckets[kind]?.[index]
      if (!copy) return null
      const result = applyStrReplace(copy.promptText, edit)
      if (result.outcome === 'applied') {
        copy.promptText = result.content
        copy.editCount += 1
      }
      return {
        ref: formatChatFloorRef({ kind, index }),
        kind,
        index,
        total: totalFor(kind),
        matched: true,
        messageId: copy.messageId,
        speakerName: copy.speakerName,
        outcome: result.outcome,
        occurrences: result.occurrences,
        promptText: copy.promptText
      }
    },
    collectPromptEdits(): TidiaoMessagePromptEditCommit[] {
      const commits: TidiaoMessagePromptEditCommit[] = []
      ;(['role', 'narration'] as ChatFloorRefKind[]).forEach((kind) => {
        Object.keys(buckets[kind])
          .map((key) => Number(key))
          .sort((a, b) => a - b)
          .forEach((index) => {
            const copy = buckets[kind][index]
            if (!copy || copy.editCount <= 0) return
            commits.push({
              kind,
              index,
              messageId: copy.messageId,
              speakerName: copy.speakerName,
              ref: formatChatFloorRef({ kind, index }),
              promptText: copy.promptText,
              editCount: copy.editCount
            })
          })
      })
      return commits
    }
  }
}
