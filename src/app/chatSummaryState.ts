import { computed } from 'vue'
import { getChatSessionLoadedSummaryIds, setChatSessionLoadedSummaryIds } from '../repositories/chatRepository'
import { buildChatSummaryExportPayload } from '../repositories/chatRepository'
import { isClientDebugFlagEnabled } from '../utils/debugFlags'

type MutableValue<T> = { value: T }

type ChatSummaryStateDeps = {
  summaryLibrary: MutableValue<any[]>
  summaryIdCounter: MutableValue<number>
  currentSession: MutableValue<any>
  currentChatTarget: MutableValue<string>
  getCurrentSession?: () => any
  getActiveTargetId?: () => string
  updateSession: (targetId: string, changes: Record<string, any>) => Promise<void>
}

export function createChatSummaryState(deps: ChatSummaryStateDeps) {
  function resolveCurrentSession(): any {
    return deps.getCurrentSession?.() || deps.currentSession.value || null
  }

  function resolveActiveTargetId(): string {
    return String(deps.getActiveTargetId?.() || deps.currentChatTarget.value || '')
  }

  const summaryTags = computed(() => {
    const tags = new Set(['日常', '重要', '剧情', '设定'])
    deps.summaryLibrary.value.forEach((summary) => {
      if (Array.isArray(summary?.tags)) {
        summary.tags.forEach((tag: string) => tags.add(tag))
      }
    })
    return [...tags]
  })

  function exportSummaries(): void {
    const data = buildChatSummaryExportPayload(deps.summaryLibrary.value, deps.summaryIdCounter.value)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `琅嬛_总结库_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function logSummarySlotTrace(stage: string, targetId: string, session: any, payload: Record<string, unknown>) {
    if (!isClientDebugFlagEnabled('summary-trace')) return
    console.info('[summary-trace][slot]', {
      stage,
      targetId,
      sessionId: String(session?.id || ''),
      loadedSummaryIds: getChatSessionLoadedSummaryIds(session),
      ...payload
    })
  }

  function loadSummary(summaryId: string): void {
    const currentSession = resolveCurrentSession()
    const activeTargetId = resolveActiveTargetId()
    if (!currentSession || !activeTargetId) return
    const loadedSummaryIds = getChatSessionLoadedSummaryIds(currentSession)
    if (loadedSummaryIds.includes(summaryId)) return
    const previousLoadedSummaryIds = [...loadedSummaryIds]
    loadedSummaryIds.push(summaryId)
    setChatSessionLoadedSummaryIds(currentSession, loadedSummaryIds)
    logSummarySlotTrace('load-summary', activeTargetId, currentSession, {
      summaryId,
      previousLoadedSummaryIds,
      nextLoadedSummaryIds: loadedSummaryIds
    })
    deps.updateSession(activeTargetId, { loadedSummaryIds }).catch((err) => {
      console.error('加载总结到会话失败:', err)
    })
  }

  function unloadSummary(summaryId: string): void {
    const currentSession = resolveCurrentSession()
    const activeTargetId = resolveActiveTargetId()
    if (!currentSession || !activeTargetId) return
    const loadedSummaryIds = getChatSessionLoadedSummaryIds(currentSession)
    const nextLoadedSummaryIds = loadedSummaryIds.filter((id) => id !== summaryId)
    setChatSessionLoadedSummaryIds(currentSession, nextLoadedSummaryIds)
    logSummarySlotTrace('unload-summary', activeTargetId, currentSession, {
      summaryId,
      previousLoadedSummaryIds: loadedSummaryIds,
      nextLoadedSummaryIds
    })
    deps.updateSession(activeTargetId, { loadedSummaryIds: nextLoadedSummaryIds }).catch((err) => {
      console.error('从会话卸载总结失败:', err)
    })
  }

  async function removeLoadedSummaryReference(summaryId: string): Promise<void> {
    const currentSession = resolveCurrentSession()
    const activeTargetId = resolveActiveTargetId()
    if (!currentSession || !summaryId || !activeTargetId) return
    const loadedSummaryIds = getChatSessionLoadedSummaryIds(currentSession)
    if (!loadedSummaryIds.includes(summaryId)) return
    const nextLoadedSummaryIds = loadedSummaryIds.filter((id) => id !== summaryId)
    setChatSessionLoadedSummaryIds(currentSession, nextLoadedSummaryIds)
    await deps.updateSession(activeTargetId, { loadedSummaryIds: nextLoadedSummaryIds })
  }

  function getLoadedSummaryIds(): string[] {
    const currentSession = resolveCurrentSession()
    return getChatSessionLoadedSummaryIds(currentSession)
  }

  return {
    summaryTags,
    exportSummaries,
    loadSummary,
    unloadSummary,
    removeLoadedSummaryReference,
    getLoadedSummaryIds
  }
}
