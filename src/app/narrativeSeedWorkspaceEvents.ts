export const NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT = 'langhuan:narrative-seeds-external-updated'

export interface NarrativeSeedsExternalUpdatedDetail {
  worldId: string
  sessionId: string
}

export function notifyNarrativeSeedsExternalUpdated(detail: NarrativeSeedsExternalUpdatedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NarrativeSeedsExternalUpdatedDetail>(
    NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT,
    { detail }
  ))
}

/**
 * 剧本工作台只能在星依最终回复完成落库尝试后刷新，避免列表先变化、结尾话还没说完。
 * 剧本写操作本身已在调用本函数前逐项 await 完成。
 */
export async function notifyNarrativeSeedsExternalUpdatedAfterPersistence(
  persistence: Promise<unknown>,
  detail: NarrativeSeedsExternalUpdatedDetail
): Promise<void> {
  await persistence
  notifyNarrativeSeedsExternalUpdated(detail)
}
