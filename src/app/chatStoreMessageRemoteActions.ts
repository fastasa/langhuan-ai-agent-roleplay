import { useCharacterStore } from '../stores/characterStore'
import { useSettingStore } from '../stores/settingStore'
import { createChatEntityState } from './chatEntityState'
import type { ChatMessageWriteOptions, ChatStoreRemoteActionDeps, EditMessagePayload } from './chatStoreRemoteActionTypes'
import {
  buildChatSessionPatch,
  clearChatSessionContextById,
  clearChatMessageList,
  clearChatMessageListBySessionId,
  archiveChatSessionById,
  createChatMessage,
  createChatMessageBySessionId,
  deleteChatSessionById,
  deleteChatSessionsByIds,
  fetchChatSessionBundle,
  fetchChatSessionBundleById,
  removeChatMessage,
  removeChatMessageBySessionId,
  saveChatSessionPatch,
  saveChatSessionPatchById,
  startNewChatSession,
  updateChatMessage,
  updateChatMessageBySessionId
} from '../repositories/chatRepository'
import { saveConfigSnapshot } from '../repositories/settingRepository'
import { buildMessageEnvironmentSnapshot } from '../utils/messageEnvironment'
import { isClientDebugFlagEnabled } from '../utils/debugFlags'
import { normalizeChatSessionReplyPipelineMode } from './chatReplyPipelineMode'

const CHAT_MESSAGE_PAGE_SIZE = 80

export function createChatStoreMessageRemoteActions(deps: ChatStoreRemoteActionDeps) {
  const entityState = createChatEntityState({
    sessionMessagesCache: deps.sessionMessagesCache,
    chatTargets: deps.chatTargets,
    chatSessions: deps.chatSessions,
    chatMessages: deps.chatMessages,
    normalizeTargetId: deps.normalizeTargetId,
    normalizeSession: deps.normalizeSession,
    normalizeMessageForTarget: deps.normalizeMessageForTarget
  })

  function readLoadedSummaryIds(session: any): string[] {
    const raw = session?.loadedSummaryIds ?? session?.loaded_summary_ids
    if (Array.isArray(raw)) {
      return raw.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (!trimmed) return []
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed)
          ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
          : [trimmed]
      } catch {
        return [trimmed]
      }
    }
    return []
  }

  function logSummarySessionTrace(stage: string, targetId: string, session: any, extra: Record<string, unknown> = {}) {
    if (!isClientDebugFlagEnabled('summary-trace')) return
    console.info('[summary-trace][client]', {
      stage,
      targetId,
      sessionId: String(session?.id ?? ''),
      loadedSummaryIds: readLoadedSummaryIds(session),
      updatedAt: String(session?.updatedAt ?? session?.updated_at ?? ''),
      ...extra
    })
  }

  function resolveSessionIdForWrite(targetId: string, explicitSessionId = ''): string {
    const requestedSessionId = String(explicitSessionId || '').trim()
    if (requestedSessionId) return requestedSessionId
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const currentSession = deps.currentSession.value
    if (currentSession?.id && String(currentSession.id || '').trim() === normalizedTargetId) {
      return String(currentSession.id)
    }
    if (deps.chatSessions.value?.[normalizedTargetId]) {
      return normalizedTargetId
    }
    if (
      currentSession?.id
      && normalizedTargetId
      && normalizedTargetId === deps.normalizeTargetId(deps.currentChatTarget.value)
    ) {
      return String(currentSession.id)
    }
    const matchedSession = Object.values(deps.chatSessions.value || {}).find((session: any) => {
      const target = deps.normalizeTargetId(String(session?.targetId ?? session?.target_id ?? ''))
      return target === normalizedTargetId
    }) as any
    return String(matchedSession?.id || '')
  }

  function resolveTargetIdForSession(sessionId: string, fallbackTargetId: string): string {
    const session = deps.chatSessions.value?.[sessionId] || deps.currentSession.value
    return deps.normalizeTargetId(String(session?.targetId ?? session?.target_id ?? (fallbackTargetId || '')))
  }

  function readOldestMessageId(messages: any[]): number {
    const ids = (Array.isArray(messages) ? messages : [])
      .map((message) => Number(message?.id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)
    return ids.length ? Math.min(...ids) : 0
  }

  function buildPagedSession(session: any, pageInfo: any, messages: any[]) {
    const oldestMessageId = Number(pageInfo?.oldestMessageId || 0) || readOldestMessageId(messages)
    return {
      ...session,
      _hasOlderMessages: Boolean(pageInfo?.hasMore),
      _oldestLoadedMessageId: oldestMessageId,
      _loadingOlderMessages: false
    }
  }

  function mergeEarlierMessages(existing: any[], earlier: any[]): any[] {
    const map = new Map<number | string, any>()
    for (const message of [...(Array.isArray(earlier) ? earlier : []), ...(Array.isArray(existing) ? existing : [])]) {
      const rawId = message?.id
      const key = rawId === undefined || rawId === null || rawId === ''
        ? `local:${String(message?._localStreamingKey || Math.random())}`
        : Number(rawId) || String(rawId)
      map.set(key, message)
    }
    return Array.from(map.values()).sort((a, b) => {
      const left = Number(a?.id || 0)
      const right = Number(b?.id || 0)
      if (left && right) return left - right
      return 0
    })
  }

  function resolveSessionForMessageEnvironment(sessionId: string, targetId: string): any {
    const normalizedSessionId = String(sessionId || '').trim()
    if (normalizedSessionId) {
      const cachedSession = deps.chatSessions.value?.[normalizedSessionId]
      if (cachedSession) return cachedSession
      const currentSession = deps.currentSession.value
      if (String(currentSession?.id || '') === normalizedSessionId) return currentSession
    }

    const currentSession = deps.currentSession.value
    if (!currentSession) return null
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionTargetId = deps.normalizeTargetId(String(currentSession?.targetId ?? currentSession?.target_id ?? ''))
    if (normalizedTargetId && sessionTargetId === normalizedTargetId) return currentSession
    return null
  }

  async function switchChat(targetId: string): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const requestSeq = ++deps.switchRequestSeqRef.value
    deps.currentChatTarget.value = normalizedTargetId
    deps.setWorkspaceCurrentTarget(normalizedTargetId)
    entityState.registerTarget(normalizedTargetId)
    const data = await fetchChatSessionBundle(normalizedTargetId, { limit: CHAT_MESSAGE_PAGE_SIZE })
    if (requestSeq !== deps.switchRequestSeqRef.value || deps.currentChatTarget.value !== normalizedTargetId) {
      return
    }
    logSummarySessionTrace('switch-chat:fetched', normalizedTargetId, data.session, {
      requestSeq,
      messageCount: Array.isArray(data.messages) ? data.messages.length : 0
    })
    deps.currentSession.value = entityState.upsertSession(buildPagedSession(data.session, data.pageInfo, data.messages || []))
    const sessionId = String(deps.currentSession.value?.id || normalizedTargetId)
    if (normalizedTargetId) {
      void saveConfigSnapshot({
        workspaceTarget: normalizedTargetId,
        workspaceSessionId: sessionId
      }).catch((error) => {
        console.warn('保存当前聊天会话失败:', error)
      })
    }
    const charStore = useCharacterStore()
    const singleTargetName = (!normalizedTargetId.startsWith('group_') && !normalizedTargetId.startsWith('crowd_'))
      ? (charStore.getCharacter(normalizedTargetId)?.name || '')
      : ''
    const normalizedMessages = (data.messages || []).map((message: any) => {
      if (!message.name) {
        if (message.memberName) {
          message.name = message.memberName
        } else if ((message.role === 'assistant' || message.role === normalizedTargetId) && singleTargetName) {
          message.name = singleTargetName
        }
      }
      return deps.normalizeMessageForTarget(normalizedTargetId, message)
    })
    entityState.replaceMessagesForSession(sessionId, normalizedTargetId, normalizedMessages)
    deps.currentMessages.value = deps.buildDisplayMessages(normalizedTargetId, sessionId)
    deps.flushPendingPersistedMessages(sessionId)
  }

  async function switchSession(sessionId: string): Promise<void> {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) {
      deps.currentChatTarget.value = ''
      deps.setWorkspaceCurrentTarget('')
      deps.currentSession.value = null
      deps.currentMessages.value = []
      deps.sessionSwitchLoadingId.value = ''
      void saveConfigSnapshot({ workspaceTarget: '', workspaceSessionId: '' }).catch((error) => {
        console.warn('清空当前聊天会话失败:', error)
      })
      return
    }
    const requestSeq = ++deps.switchRequestSeqRef.value

    // 会话切换乐观跳转（2026-07-11）：点击立即换标题/高亮（从本地缓存 chatSessions 取该会话元数据——
    // 侧栏能渲染出这行，说明本地缓存里一定已有），消息区交给 UI 骨架屏遮罩；fetch 真数据到位再整体替换。
    // 不清 currentMessages——旧消息由骨架分支（sessionSwitchLoadingId）遮住，避免连锁 watcher/内容一帧闪现。
    const previousSession = deps.currentSession.value
    const previousTargetId = deps.currentChatTarget.value
    const cachedSession = deps.chatSessions.value?.[normalizedSessionId] || null
    deps.sessionSwitchLoadingId.value = normalizedSessionId
    if (cachedSession) {
      deps.currentSession.value = cachedSession
      const cachedTargetId = resolveTargetIdForSession(normalizedSessionId, String(cachedSession?.targetId ?? cachedSession?.target_id ?? ''))
      if (cachedTargetId) {
        deps.currentChatTarget.value = cachedTargetId
        deps.setWorkspaceCurrentTarget(cachedTargetId)
        entityState.registerTarget(cachedTargetId)
      }
    }

    let data
    try {
      data = await fetchChatSessionBundleById(normalizedSessionId, { limit: CHAT_MESSAGE_PAGE_SIZE })
    } catch (error) {
      // fetch 失败：恢复乐观切换前的 currentSession/currentChatTarget，清 loading id，骨架不会永远挂着
      //（仅在本次 requestSeq 仍是最新时才回滚——若期间又发生了更新的切换，回滚会踩到新切换头上）。
      if (requestSeq === deps.switchRequestSeqRef.value) {
        deps.currentSession.value = previousSession
        deps.currentChatTarget.value = previousTargetId
        deps.setWorkspaceCurrentTarget(previousTargetId)
        if (deps.sessionSwitchLoadingId.value === normalizedSessionId) deps.sessionSwitchLoadingId.value = ''
      }
      throw error
    }
    if (requestSeq !== deps.switchRequestSeqRef.value) return
    deps.currentSession.value = entityState.upsertSession(buildPagedSession({
      ...data.session,
      participants: Array.isArray(data.participants) ? data.participants : data.session?.participants || []
    }, data.pageInfo, data.messages || []))
    const normalizedTargetId = resolveTargetIdForSession(normalizedSessionId, String(data.session?.targetId ?? data.session?.target_id ?? ''))
    deps.currentChatTarget.value = normalizedTargetId
    deps.setWorkspaceCurrentTarget(normalizedTargetId)
    entityState.registerTarget(normalizedTargetId)
    void saveConfigSnapshot({
      workspaceTarget: normalizedTargetId,
      workspaceSessionId: normalizedSessionId
    }).catch((error) => {
      console.warn('保存当前聊天会话失败:', error)
    })
    const normalizedMessages = (data.messages || []).map((message: any) => deps.normalizeMessageForTarget(normalizedTargetId, message))
    entityState.replaceMessagesForSession(normalizedSessionId, normalizedTargetId, normalizedMessages)
    deps.currentMessages.value = deps.buildDisplayMessages(normalizedTargetId, normalizedSessionId)
    deps.flushPendingPersistedMessages(normalizedSessionId)
    if (deps.sessionSwitchLoadingId.value === normalizedSessionId) deps.sessionSwitchLoadingId.value = ''
  }

  async function refreshSessionMeta(sessionId: string): Promise<void> {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return
    const data = await fetchChatSessionBundleById(normalizedSessionId, { limit: 1 })
    const nextSession = entityState.upsertSession({
      ...data.session,
      participants: Array.isArray(data.participants) ? data.participants : data.session?.participants || []
    })
    if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
      deps.currentSession.value = {
        ...deps.currentSession.value,
        ...nextSession
      }
    }
  }

  async function loadOlderMessages(sessionId?: string, beforeIdOverride?: number): Promise<boolean> {
    const normalizedSessionId = String(sessionId || deps.currentSession.value?.id || '').trim()
    if (!normalizedSessionId) return false
    const currentSession = deps.chatSessions.value?.[normalizedSessionId] || deps.currentSession.value
    if (!currentSession?._hasOlderMessages || currentSession?._loadingOlderMessages) return false
    const existingMessages = deps.sessionMessagesCache.value?.[normalizedSessionId] || []
    const beforeId = Number(beforeIdOverride || 0) || Number(currentSession?._oldestLoadedMessageId || 0) || readOldestMessageId(existingMessages)
    if (!beforeId) return false
    const loadingSession = { ...currentSession, _loadingOlderMessages: true }
    deps.chatSessions.value[normalizedSessionId] = loadingSession
    if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
      deps.currentSession.value = loadingSession
    }
    try {
      const data = await fetchChatSessionBundleById(normalizedSessionId, {
        limit: CHAT_MESSAGE_PAGE_SIZE,
        beforeId
      })
      const normalizedTargetId = resolveTargetIdForSession(normalizedSessionId, String(data.session?.targetId ?? data.session?.target_id ?? ''))
      const normalizedMessages = (data.messages || []).map((message: any) => deps.normalizeMessageForTarget(normalizedTargetId, message))
      const mergedMessages = mergeEarlierMessages(existingMessages, normalizedMessages)
      entityState.replaceMessagesForSession(normalizedSessionId, normalizedTargetId, mergedMessages)
      const nextSession = buildPagedSession({
        ...currentSession,
        ...data.session,
        participants: Array.isArray(data.participants) ? data.participants : currentSession?.participants || data.session?.participants || []
      }, data.pageInfo, mergedMessages)
      deps.chatSessions.value[normalizedSessionId] = nextSession
      if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
        deps.currentSession.value = nextSession
        deps.currentMessages.value = deps.buildDisplayMessages(normalizedTargetId, normalizedSessionId)
      }
      return normalizedMessages.length > 0
    } catch (error) {
      const resetSession = { ...(deps.chatSessions.value?.[normalizedSessionId] || currentSession), _loadingOlderMessages: false }
      deps.chatSessions.value[normalizedSessionId] = resetSession
      if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
        deps.currentSession.value = resetSession
      }
      console.warn('加载更早聊天消息失败:', error)
      return false
    }
  }

  function scheduleSessionTitleRefresh(sessionId: string): void {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return
    for (const delay of [1200, 3500]) {
      globalThis.setTimeout(() => {
        void refreshSessionMeta(normalizedSessionId).catch((error) => {
          console.warn('刷新会话标题失败:', error)
        })
      }, delay)
    }
  }

  async function addMessage(targetId: string, msg: Record<string, any>, options?: ChatMessageWriteOptions): Promise<number> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId, options?.sessionId)
    const settingStore = useSettingStore()
    const envSnapshot = buildMessageEnvironmentSnapshot({
      currentTime: settingStore.currentTime,
      currentWeather: settingStore.currentWeather,
      currentLocation: settingStore.currentLocation,
      currentSession: resolveSessionForMessageEnvironment(sessionId, normalizedTargetId),
      createdAt: new Date().toISOString()
    })
    const payload = {
      ...msg,
      envDate: String(msg.envDate ?? msg.env_date ?? envSnapshot.envDate ?? ''),
      envWeather: String(msg.envWeather ?? msg.env_weather ?? envSnapshot.envWeather ?? ''),
      envLocation: String(msg.envLocation ?? msg.env_location ?? envSnapshot.envLocation ?? ''),
      memberName: msg.memberName || msg.name || '',
      versionList: Array.isArray(msg.versionList) ? msg.versionList : [],
      activeVersionIndex: Number.isInteger(msg.activeVersionIndex) ? msg.activeVersionIndex : 0
    }
    const messageId = sessionId
      ? await createChatMessageBySessionId(sessionId, payload)
      : await createChatMessage(normalizedTargetId, payload)
    if (!options?.skipLocalSync) {
      deps.upsertCachedMessage(sessionId || normalizedTargetId, { ...payload, id: messageId })
      deps.refreshCurrentMessages(sessionId || normalizedTargetId)
    }
    if (sessionId && String(msg.role || '') === 'user') {
      scheduleSessionTitleRefresh(sessionId)
    }
    return messageId
  }

  async function editMessage(targetId: string, msgId: number, payload: string | EditMessagePayload): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId)
    const normalizedPayload = typeof payload === 'string' ? { content: payload } : payload
    if (sessionId) {
      await updateChatMessageBySessionId(sessionId, msgId, normalizedPayload as unknown as Record<string, unknown>)
    } else {
      await updateChatMessage(normalizedTargetId, msgId, normalizedPayload as unknown as Record<string, unknown>)
    }

    const currentMessage = deps.currentMessages.value.find((message) => message.id === msgId)
    const cachedMessage = deps.getCachedMessages(sessionId || normalizedTargetId).find((message) => message.id === msgId)

    const applyChanges = (targetMessage?: any) => {
      if (!targetMessage) return
      if (normalizedPayload.content !== undefined) targetMessage.content = normalizedPayload.content
      if (normalizedPayload.time !== undefined) targetMessage.time = normalizedPayload.time
      if (normalizedPayload.envDate !== undefined) {
        targetMessage.envDate = normalizedPayload.envDate
        targetMessage.env_date = normalizedPayload.envDate
      }
      if (normalizedPayload.envWeather !== undefined) {
        targetMessage.envWeather = normalizedPayload.envWeather
        targetMessage.env_weather = normalizedPayload.envWeather
      }
      if (normalizedPayload.envLocation !== undefined) {
        targetMessage.envLocation = normalizedPayload.envLocation
        targetMessage.env_location = normalizedPayload.envLocation
      }
      if (normalizedPayload.model !== undefined) targetMessage.model = normalizedPayload.model
      if (normalizedPayload.memberName !== undefined) {
        targetMessage.memberName = normalizedPayload.memberName
        targetMessage.member_name = normalizedPayload.memberName
      }
      if (normalizedPayload.crowdName !== undefined) {
        targetMessage.crowdName = normalizedPayload.crowdName
        targetMessage.crowd_name = normalizedPayload.crowdName
      }
      if (normalizedPayload.autoWriteHidden !== undefined) {
        const hidden = Boolean(normalizedPayload.autoWriteHidden)
        targetMessage.autoWriteHidden = hidden
        targetMessage.auto_write_hidden = hidden
      }
      if (normalizedPayload.autoWriteHiddenAt !== undefined) {
        targetMessage.autoWriteHiddenAt = normalizedPayload.autoWriteHiddenAt
        targetMessage.auto_write_hidden_at = normalizedPayload.autoWriteHiddenAt
      }
      if (normalizedPayload.autoWriteBatchId !== undefined) {
        targetMessage.autoWriteBatchId = normalizedPayload.autoWriteBatchId
        targetMessage.auto_write_batch_id = normalizedPayload.autoWriteBatchId
      }
      if (normalizedPayload.autoWriteHiddenReason !== undefined) {
        targetMessage.autoWriteHiddenReason = normalizedPayload.autoWriteHiddenReason
        targetMessage.auto_write_hidden_reason = normalizedPayload.autoWriteHiddenReason
      }
      if (normalizedPayload.focusedActionVisibility !== undefined) {
        targetMessage.focusedActionVisibility = normalizedPayload.focusedActionVisibility
        targetMessage.focused_action_visibility = normalizedPayload.focusedActionVisibility
      }
      if (normalizedPayload.versionList !== undefined) {
        targetMessage.versionList = normalizedPayload.versionList
        targetMessage.versionsJson = normalizedPayload.versionList
        targetMessage.versions_json = normalizedPayload.versionList
      }
      if (normalizedPayload.activeVersionIndex !== undefined) {
        targetMessage.activeVersionIndex = normalizedPayload.activeVersionIndex
        targetMessage.active_version_index = normalizedPayload.activeVersionIndex
      }
      // 带图乐观发送（2026-07-11）：caption 后台补完回填——两个键都写，同 readMessageAttachments 双键读取口径
      // （attachments 是本地乐观消息用的键，attachmentsJson 是经 toCamel 的服务端读侧键，见 chatAttachments.ts）。
      if (normalizedPayload.attachments !== undefined) {
        targetMessage.attachments = normalizedPayload.attachments
        targetMessage.attachmentsJson = normalizedPayload.attachments
      }
      deps.normalizeMessage(targetMessage)
    }

    applyChanges(currentMessage)
    if (cachedMessage && cachedMessage !== currentMessage) {
      applyChanges(cachedMessage)
    }
    deps.refreshCurrentMessages(sessionId || normalizedTargetId)
  }

  async function deleteMessage(targetId: string, msgId: number): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId)
    if (sessionId) {
      await removeChatMessageBySessionId(sessionId, msgId)
    } else {
      await removeChatMessage(normalizedTargetId, msgId)
    }
    deps.removeCachedMessage(sessionId || normalizedTargetId, msgId)
    deps.refreshCurrentMessages(sessionId || normalizedTargetId)
  }

  async function clearMessages(targetId: string): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId)
    const isCurrentTarget = normalizedTargetId === deps.normalizeTargetId(deps.currentChatTarget.value)
    const previousMessages = isCurrentTarget ? [...deps.currentMessages.value] : []
    if (isCurrentTarget) {
      deps.currentMessages.value = []
    }
    try {
      if (sessionId) {
        await clearChatMessageListBySessionId(sessionId)
      } else {
        await clearChatMessageList(normalizedTargetId)
      }
    } catch (error) {
      console.error('清空聊天失败')
      if (isCurrentTarget) {
        deps.currentMessages.value = previousMessages
      }
      throw error
    }
    entityState.clearMessagesForSession(sessionId || normalizedTargetId)
    delete deps.localStreamingMessages.value[sessionId || normalizedTargetId]
    delete deps.pendingPersistedMessages.value[sessionId || normalizedTargetId]
  }

  async function clearSessionContext(targetId: string, options: {
    clearSessionTemporaryCharacters?: boolean
  } = {}): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId)
    const isCurrentTarget = normalizedTargetId === deps.normalizeTargetId(deps.currentChatTarget.value)
    const previousMessages = isCurrentTarget ? [...deps.currentMessages.value] : []
    if (isCurrentTarget) {
      deps.currentMessages.value = []
    }
    try {
      if (sessionId) {
        await clearChatSessionContextById(sessionId, options)
      } else {
        await clearChatMessageList(normalizedTargetId)
      }
    } catch (error) {
      console.error('清空对话失败')
      if (isCurrentTarget) {
        deps.currentMessages.value = previousMessages
      }
      throw error
    }
    entityState.clearMessagesForSession(sessionId || normalizedTargetId)
    delete deps.localStreamingMessages.value[sessionId || normalizedTargetId]
    delete deps.pendingPersistedMessages.value[sessionId || normalizedTargetId]
  }

  async function updateSession(targetId: string, changes: Record<string, any>): Promise<void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const sessionId = resolveSessionIdForWrite(normalizedTargetId)
    const apiPatch = buildChatSessionPatch(changes)
    logSummarySessionTrace('update-session:before-save', normalizedTargetId, deps.currentSession.value, {
      changes: apiPatch
    })
    if (sessionId) {
      await saveChatSessionPatchById(sessionId, apiPatch)
    } else {
      await saveChatSessionPatch(normalizedTargetId, apiPatch)
    }
    const isCurrentSession = sessionId && String(deps.currentSession.value?.id || '') === sessionId
    const isCurrentTarget = normalizedTargetId === deps.normalizeTargetId(deps.currentChatTarget.value)
    if (deps.currentSession.value && (isCurrentSession || isCurrentTarget)) {
      const localPatch: Record<string, any> = { ...changes }
      const replyModeSource = changes.replyPipelineMode ?? changes.reply_pipeline_mode ?? apiPatch.reply_pipeline_mode
      if (replyModeSource !== undefined) {
        const replyMode = normalizeChatSessionReplyPipelineMode(replyModeSource)
        localPatch.replyPipelineMode = replyMode
        localPatch.reply_pipeline_mode = replyMode
      }
      const forceNarrationSource = changes.narrationForceEnabled ?? changes.narration_force_enabled ?? apiPatch.narration_force_enabled
      if (forceNarrationSource !== undefined) {
        const enabled = forceNarrationSource === true || forceNarrationSource === 1 || forceNarrationSource === '1' || forceNarrationSource === 'true'
        localPatch.narrationForceEnabled = enabled
        localPatch.narration_force_enabled = enabled ? 1 : 0
      }
      Object.assign(deps.currentSession.value, localPatch)
      entityState.upsertSession(deps.currentSession.value)
      logSummarySessionTrace('update-session:after-save', normalizedTargetId, deps.currentSession.value)
    }
  }

  async function renameSession(sessionId: string, title: string): Promise<void> {
    const normalizedSessionId = String(sessionId || '').trim()
    const nextTitle = String(title || '').replace(/\s+/g, '').trim().slice(0, 15)
    if (!normalizedSessionId || !nextTitle) return
    await saveChatSessionPatchById(normalizedSessionId, { title: nextTitle })
    const session = deps.chatSessions.value?.[normalizedSessionId]
    if (session) {
      Object.assign(session, { title: nextTitle })
      entityState.upsertSession(session)
    }
    if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
      Object.assign(deps.currentSession.value, { title: nextTitle })
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return
    await deleteChatSessionById(normalizedSessionId)
    if (deps.chatSessions.value && typeof deps.chatSessions.value === 'object') {
      delete deps.chatSessions.value[normalizedSessionId]
    }
    entityState.clearMessagesForSession(normalizedSessionId)
    delete deps.localStreamingMessages.value[normalizedSessionId]
    delete deps.pendingPersistedMessages.value[normalizedSessionId]
    if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
      deps.currentSession.value = null
      deps.currentMessages.value = []
    }
  }

  async function deleteSessions(sessionIds: string[]): Promise<void> {
    const normalizedSessionIds = Array.from(new Set(
      (Array.isArray(sessionIds) ? sessionIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ))
    if (!normalizedSessionIds.length) return
    if (normalizedSessionIds.length === 1) {
      await deleteSession(normalizedSessionIds[0])
      return
    }

    await deleteChatSessionsByIds(normalizedSessionIds)
    const deletedIds = new Set(normalizedSessionIds)
    for (const sessionId of normalizedSessionIds) {
      if (deps.chatSessions.value && typeof deps.chatSessions.value === 'object') {
        delete deps.chatSessions.value[sessionId]
      }
      entityState.clearMessagesForSession(sessionId)
      delete deps.localStreamingMessages.value[sessionId]
      delete deps.pendingPersistedMessages.value[sessionId]
    }
    if (deletedIds.has(String(deps.currentSession.value?.id || ''))) {
      deps.currentSession.value = null
      deps.currentMessages.value = []
    }
  }

  async function archiveSession(sessionId: string): Promise<void> {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return
    const archive = await archiveChatSessionById(normalizedSessionId)
    const existingSession = deps.chatSessions.value?.[normalizedSessionId] || deps.currentSession.value
    const archivedSession = entityState.upsertSession({
      ...(existingSession || {}),
      id: normalizedSessionId,
      targetId: existingSession?.targetId ?? existingSession?.target_id ?? archive?.targetId ?? normalizedSessionId,
      target_id: existingSession?.target_id ?? existingSession?.targetId ?? archive?.targetId ?? normalizedSessionId,
      isArchived: true,
      is_archived: true,
      archiveName: archive?.name ?? existingSession?.archiveName ?? existingSession?.archive_name ?? '',
      archive_name: archive?.name ?? existingSession?.archive_name ?? existingSession?.archiveName ?? '',
      archiveCategory: archive?.category ?? existingSession?.archiveCategory ?? existingSession?.archive_category ?? '',
      archive_category: archive?.category ?? existingSession?.archive_category ?? existingSession?.archiveCategory ?? '',
      linkedArchiveId: normalizedSessionId,
      linked_archive_id: normalizedSessionId,
      sourceTargetId: archive?.sourceTargetId ?? existingSession?.sourceTargetId ?? existingSession?.source_target_id ?? existingSession?.targetId ?? existingSession?.target_id ?? normalizedSessionId,
      source_target_id: archive?.sourceTargetId ?? existingSession?.source_target_id ?? existingSession?.sourceTargetId ?? existingSession?.target_id ?? existingSession?.targetId ?? normalizedSessionId
    })
    if (String(deps.currentSession.value?.id || '') === normalizedSessionId) {
      deps.currentSession.value = archivedSession
    }
    deps.chatArchives.value = [archive, ...(Array.isArray(deps.chatArchives.value) ? deps.chatArchives.value.filter((item) => String(item?.id || '') !== String(archive?.id || '')) : [])]
  }

  async function startNewChat(targetId: string): Promise<string | void> {
    const normalizedTargetId = deps.normalizeTargetId(targetId)
    const data = await startNewChatSession(normalizedTargetId)
    const session = entityState.upsertSession(data.session)
    const sessionId = String(session?.id || data.session?.id || '').trim()
    if (sessionId) {
      await switchSession(sessionId)
      return sessionId
    }
  }

  return {
    switchChat,
    switchSession,
    refreshSessionMeta,
    loadOlderMessages,
    addMessage,
    editMessage,
    deleteMessage,
    clearMessages,
    clearSessionContext,
    updateSession,
    renameSession,
    deleteSession,
    deleteSessions,
    archiveSession,
    startNewChat
  }
}
