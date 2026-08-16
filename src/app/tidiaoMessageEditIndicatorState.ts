// 提调「锚定精修」消息级状态指示运行态（提调修改消息·状态提示 批次 B1）。
//
// 定位：精修 loop（tidiaoPrecisionEditLoop）进行中时，要在**被改的那条消息正文上**给出可见提示——
// 给正在改的那段原文(oldText)画圆角底色 + 斜向光带（CSS `.tidiao-pe-shimmer`），让用户知道提调在改哪一段。
// 与轮级载体 directorStream（决策流/分镜，挂在用户消息与回复之间）是两条互补的指示：
// - directorStream：提调整体在干嘛（判段/读原文/精改）。
// - 本模块：具体改到哪条消息的哪一段（消息级、段级高亮）。
//
// 数据形态：messageId → 当前正在改的片段(oldText)列表。
// - 列表为空（loop 刚起、还没锁定具体段）：该条不高亮。
// - 列表有段但渲染时在正文里定位不到：调用方整条退化高亮（见 renderChatMarkdownWithPrecisionShimmer）。
//
// 边界（B1 范围）：纯运行态、不落库；只承载单聊精修（群聊精修后续）。messageId 为 DB 全局唯一，
// 故按 messageId 直接索引即可；sessionId 仅作归属记录与跨会话清理判断。
// B2 才把精修 loop 的真实 editChatMessage 信号接到本模块（begin/setSegment/clear）。

import { ref } from 'vue'

export interface TidiaoPrecisionEditIndicator {
  sessionId: string
  /** messageId → 当前正在改的片段(oldText)列表。 */
  segmentsByMessageId: Record<number, string[]>
}

const activeIndicator = ref<TidiaoPrecisionEditIndicator | null>(null)

/** 当前精修指示（响应式，供 Vue 组件 import 渲染）。 */
export { activeIndicator as activeTidiaoPrecisionEditIndicator }

function normalizeMessageId(messageId: unknown): number {
  const n = Number(messageId)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** loop 启动：登记本轮要精修的目标消息（段列表先空，待 setSegment 填）。 */
export function beginTidiaoPrecisionEdit(sessionId: string, messageIds: ReadonlyArray<number>): void {
  const map: Record<number, string[]> = {}
  for (const id of Array.isArray(messageIds) ? messageIds : []) {
    const n = normalizeMessageId(id)
    if (n) map[n] = []
  }
  activeIndicator.value = { sessionId: String(sessionId || ''), segmentsByMessageId: map }
}

/** 模型锁定某条消息的某段 oldText：把该段加入对应消息的高亮列表（去重、整份替换触发响应式）。 */
export function setTidiaoPrecisionEditSegment(messageId: number, segment: string): void {
  const indicator = activeIndicator.value
  if (!indicator) return
  const n = normalizeMessageId(messageId)
  if (!n) return
  const seg = String(segment || '')
  if (!seg) return
  const current = indicator.segmentsByMessageId[n] || []
  if (current.includes(seg)) return
  activeIndicator.value = {
    ...indicator,
    segmentsByMessageId: { ...indicator.segmentsByMessageId, [n]: [...current, seg] }
  }
}

/** loop 结束/取消：清除指示。 */
export function clearTidiaoPrecisionEdit(): void {
  activeIndicator.value = null
}

/** 取某条消息当前正在改的片段（无指示/非目标返回空数组）。 */
export function getTidiaoPrecisionEditSegments(messageId: number): string[] {
  const indicator = activeIndicator.value
  if (!indicator) return []
  const n = normalizeMessageId(messageId)
  if (!n) return []
  return indicator.segmentsByMessageId[n] || []
}

/** 是否存在进行中的精修指示（组件渲染早退守卫，避免无精修时多算）。 */
export function hasActiveTidiaoPrecisionEdit(): boolean {
  return !!activeIndicator.value
}
