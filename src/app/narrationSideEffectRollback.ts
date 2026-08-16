/**
 * 批次5c：已落库副作用回滚——删除本轮中断/取消时产生的半成品旁白消息。
 *
 * 背景：提调链路里「信息承载旁白」会即时落库（addMessage）。一旦本轮被编排带停止/取消/失败，
 * 这些已落库旁白就成了 DB 孤儿，还会残留在还原后的旧消息底部（用户实跑观察到的现象）。
 * 本工具把它们纳入「失败回滚」：先等旁白支线收束（避免漏删 abort 瞬间正在落库的那条），再逐条删。
 *
 * 纯逻辑、可测：删除动作由调用方注入（管线传 chatStore.deleteMessage）。
 */
export async function rollbackPersistedNarrationMessages(
  messageIds: number[],
  deleteMessage: ((messageId: number) => Promise<void> | void) | undefined,
  narrationCompletion?: Promise<unknown> | null
): Promise<number[]> {
  // 先等旁白支线 settle：abort 时旁白生成会随 abortSignal 收束，等它结束才能保证 messageIds 收齐。
  if (narrationCompletion) {
    try {
      await narrationCompletion
    } catch {
      /* 旁白支线自身失败/被取消不影响回滚 */
    }
  }
  if (typeof deleteMessage !== 'function') return []
  const deleted: number[] = []
  for (const id of messageIds) {
    if (!(Number.isFinite(id) && id > 0)) continue
    try {
      await deleteMessage(id)
      deleted.push(id)
    } catch (error) {
      console.warn('回滚半成品旁白失败:', error)
    }
  }
  return deleted
}
