/**
 * 聊天消息「版本化写回」纯核心（批次3b 抽取·2026-07-04 陈星依总agent计划 §5.2 批次3b-②）。
 *
 * 由来：精修/纠偏上策写回的版本语义原先只活在 useChatMessageOps.writeMessagePrecisionEditVersion
 * （活动会话 UI 通道）。批次3b 星依 dispatchTidiaoCorrection 要对「任意会话」做同一种版本化写回
 * （updateChatMessageBySessionId 通道），为不造第二条写回真值，把纯语义抽到这里共用：
 * - 版本列表归一：无 versionList 的旧消息先把当前内容补成第 1 版（不丢原文）；
 * - reuseLatest：同一轮里同一条消息第二次起的改动复用本轮已建的最新版本（不每步堆版本）；
 * - 载荷字段集固定：content/time/model/memberName/crowdName/versionList/activeVersionIndex。
 *
 * 联动标注：useChatMessageOps（normalizeVersionList / writeMessagePrecisionEditVersion）与
 * xingyiTidiaoDispatchTools 的会话级写回都经本核心构建载荷；改版本语义只改这里，两处入口自动一致。
 */

/** 版本条目：允许携带未知扩展字段（reuseLatest 更新时原样保留）。 */
export type ChatMessageEditVersionEntry = Record<string, unknown> & {
  content?: unknown
  time?: unknown
}

/** 写回源消息行（活动会话内存对象 / 会话 bundle 原始行都满足此结构子集）。 */
export interface ChatMessageEditVersionSourceRow {
  content?: string | null
  time?: string
  model?: string
  memberName?: string
  name?: string
  crowdName?: string
  versionList?: unknown
  activeVersionIndex?: unknown
}

/** 版本化写回载荷（updateChatMessageBySessionId / chatStore.editMessage 两通道同一份字段集）。 */
export interface ChatMessageEditVersionPayload {
  content: string
  time: string
  model: string
  memberName: string
  crowdName: string
  versionList: ChatMessageEditVersionEntry[]
  activeVersionIndex: number
}

/** 版本列表归一：已有 versionList 原样返回；旧消息（空列表）把当前内容补成第 1 版。 */
export function normalizeChatMessageEditVersionList(
  message?: ChatMessageEditVersionSourceRow | null
): ChatMessageEditVersionEntry[] {
  const versionList = Array.isArray(message?.versionList)
    ? message.versionList as ChatMessageEditVersionEntry[]
    : []
  if (versionList.length > 0) return versionList
  if (!message) return []
  return [{
    content: String(message.content || ''),
    time: message.time || '',
    model: message.model || '',
    memberName: message.memberName || message.name || '',
    crowdName: message.crowdName || '',
    createdAt: new Date().toISOString()
  }]
}

/**
 * 构建一次「改原文 → 新版本」的写回载荷。
 * options.reuseLatest=true 时不追加新版本，而是更新「最近一个版本」的内容
 * （同一条消息在一轮纠偏/精修里多次改时复用本轮已建的那个新版本；首次写应传 false 追加）。
 */
export function buildChatMessageEditVersionPayload(
  message: ChatMessageEditVersionSourceRow,
  newContent: string,
  options: { reuseLatest?: boolean } = {}
): ChatMessageEditVersionPayload {
  const previousVersions = normalizeChatMessageEditVersionList(message)
  const time = new Date().toLocaleTimeString()
  const nextVersionList = options.reuseLatest && previousVersions.length
    ? previousVersions.map((item, itemIndex) =>
        itemIndex === previousVersions.length - 1 ? { ...item, content: newContent, time } : item)
    : [
        ...previousVersions,
        {
          content: newContent,
          time,
          model: message.model || '',
          memberName: message.memberName || '',
          crowdName: message.crowdName || '',
          createdAt: new Date().toISOString()
        }
      ]
  return {
    content: newContent,
    time,
    model: message.model || '',
    memberName: message.memberName || '',
    crowdName: message.crowdName || '',
    versionList: nextVersionList,
    activeVersionIndex: nextVersionList.length - 1
  }
}
