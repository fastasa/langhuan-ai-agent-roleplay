import type { Ref } from 'vue'
import type { ChatImageAttachment } from '../utils/chatAttachments'

export type EditMessagePayload = {
  content?: string
  time?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  model?: string
  memberName?: string
  crowdName?: string
  autoWriteHidden?: boolean | number
  autoWriteHiddenAt?: string
  autoWriteBatchId?: string
  autoWriteHiddenReason?: string
  focusedActionVisibility?: 'private' | 'public'
  versionList?: Array<{
    content: string
    time?: string
    model?: string
    memberName?: string
    crowdName?: string
    createdAt?: string
  }>
  activeVersionIndex?: number
  /** 带图乐观发送（2026-07-11）：caption 后台补完后整组回填——不是增量 patch，调用方自己持有当前完整附件数组。 */
  attachments?: ChatImageAttachment[]
}

export type ChatMessageWriteOptions = {
  skipLocalSync?: boolean
  sessionId?: string
}

export type ChatStoreRemoteActionDeps = {
  currentChatTarget: Ref<string>
  currentSession: Ref<any>
  currentMessages: Ref<any[]>
  sessionMessagesCache: Ref<Record<string, any[]>>
  pendingPersistedMessages: Ref<Record<string, any[]>>
  localStreamingMessages: Ref<Record<string, any[]>>
  chatTargets: Ref<Record<string, any>>
  chatSessions: Ref<Record<string, any>>
  chatMessages: Ref<Record<string, any[]>>
  summaryLibrary: Ref<any[]>
  smallSummaries: Ref<any[]>
  bigSummaries: Ref<any[]>
  chatArchives: Ref<any[]>
  normalizeTargetId: (targetId: string) => string
  normalizeMessage: (message: any) => any
  normalizeMessageForTarget: (targetId: string, message: any) => any
  normalizeSession: (session: any) => any
  refreshCurrentMessages: (targetId: string) => void
  upsertCachedMessage: (targetId: string, message: any) => void
  removeCachedMessage: (targetId: string, msgId: number) => void
  getCachedMessages: (targetId: string) => any[]
  buildDisplayMessages: (targetId: string, sessionId?: string) => any[]
  setWorkspaceCurrentTarget: (targetId: string) => string
  flushPendingPersistedMessages: (targetId: string) => void
  switchRequestSeqRef: { value: number }
  /** 会话切换乐观跳转（2026-07-11）：正在切换中的目标 sessionId（空串=无切换在途），驱动消息区骨架屏。 */
  sessionSwitchLoadingId: Ref<string>
}
