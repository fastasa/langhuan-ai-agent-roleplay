import { extractChatSummarySnapshotPayload, normalizeChatTargetId, resolveChatSessionTargetId } from '../repositories/chatRepository'
import { resolveChatSessionByTargetId } from './chatCurrentState'
import { createChatEntityState } from './chatEntityState'

type ApplyChatSnapshotDeps = {
  summaryLibrary: { value: any[] }
  smallSummaries: { value: any[] }
  bigSummaries: { value: any[] }
  chatArchives?: { value: any[] }
  currentChatTarget: { value: string }
  workspaceCurrentTarget: { value: string }
  currentSession: { value: any }
  currentMessages: { value: any[] }
  sessionMessagesCache: { value: Record<string, any[]> }
  chatTargets: { value: Record<string, any> }
  chatSessions: { value: Record<string, any> }
  chatMessages: { value: Record<string, any[]> }
  normalizeTargetId: (targetId: string) => string
  normalizeMessageForTarget: (targetId: string, message: any) => any
  normalizeSession: (session: any) => any
  setWorkspaceCurrentTarget: (targetId: string) => string
  buildDisplayMessages: (targetId: string, sessionId?: string) => any[]
}

type ApplyChatSnapshotInput = import('../repositories/chatRepository').ChatSnapshotPayload

export function createChatSnapshotApplier(deps: ApplyChatSnapshotDeps) {
  const entityState = createChatEntityState({
    sessionMessagesCache: deps.sessionMessagesCache,
    chatTargets: deps.chatTargets,
    chatSessions: deps.chatSessions,
    chatMessages: deps.chatMessages,
    normalizeTargetId: deps.normalizeTargetId,
    normalizeSession: deps.normalizeSession,
    normalizeMessageForTarget: deps.normalizeMessageForTarget
  })

  function attachParticipantsToSessions(sessions: any[], participants: any[]) {
    if (!Array.isArray(sessions)) return []
    const participantsBySession = new Map<string, any[]>()
    ;(Array.isArray(participants) ? participants : []).forEach((participant: any) => {
      const sessionId = String(participant?.sessionId ?? participant?.session_id ?? '').trim()
      if (!sessionId) return
      participantsBySession.set(sessionId, [...(participantsBySession.get(sessionId) || []), participant])
    })
    return sessions.map((session: any) => {
      const sessionId = String(session?.id || '').trim()
      const sessionParticipants = participantsBySession.get(sessionId)
      return sessionParticipants ? { ...session, participants: sessionParticipants } : session
    })
  }

  function resolveChatSessionBySessionId(sessionId: string) {
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return null
    return deps.chatSessions.value?.[normalizedSessionId] || null
  }

  function applyCurrentSession(session: any) {
    if (!session) return false
    const currentSession = entityState.upsertSession(session)
    if (!currentSession) return false
    const targetId = resolveChatSessionTargetId(currentSession)
    deps.currentSession.value = currentSession
    deps.currentChatTarget.value = targetId
    deps.setWorkspaceCurrentTarget(targetId)
    entityState.registerTarget(targetId)
    deps.currentMessages.value = deps.buildDisplayMessages(targetId, String(currentSession.id || ''))
    return true
  }

  return function applyChatSnapshot(data: ApplyChatSnapshotInput) {
    entityState.ensureContainers()
    const hasSessionSnapshot = Array.isArray(data.chatSessions)
    const chatSessions = attachParticipantsToSessions(data.chatSessions || [], data.chatSessionParticipants || [])

    const summarySnapshot = extractChatSummarySnapshotPayload(data)
    deps.summaryLibrary.value = Array.isArray(summarySnapshot.summaryLibrary) ? summarySnapshot.summaryLibrary : []
    deps.smallSummaries.value = Array.isArray(summarySnapshot.smallSummaries) ? summarySnapshot.smallSummaries : []
    deps.bigSummaries.value = Array.isArray(summarySnapshot.bigSummaries) ? summarySnapshot.bigSummaries : []

    if (Array.isArray(data.chatMessages)) {
      const groupedCache: Record<string, any[]> = {}
      data.chatMessages.forEach((message: any) => {
        const sessionId = deps.normalizeTargetId(String(message?.session_id || message?.sessionId || ''))
        if (!sessionId) return
        if (!Array.isArray(groupedCache[sessionId])) groupedCache[sessionId] = []
        groupedCache[sessionId].push(message)
      })
      entityState.replaceGroupedMessages(groupedCache)
    }

    if (typeof data.currentChatTarget === 'string') {
      deps.currentChatTarget.value = deps.normalizeTargetId(data.currentChatTarget)
      deps.setWorkspaceCurrentTarget(deps.currentChatTarget.value)
      entityState.registerTarget(deps.currentChatTarget.value)
    }

    if (data.currentSession) {
      if (Array.isArray(data.chatSessions)) {
        entityState.replaceSessions(chatSessions)
      }
      const currentSessionWithParticipants = attachParticipantsToSessions([data.currentSession], data.chatSessionParticipants || [])[0] || data.currentSession
      deps.currentSession.value = entityState.upsertSession(currentSessionWithParticipants)
      if (!deps.currentChatTarget.value) {
        deps.currentChatTarget.value = resolveChatSessionTargetId(deps.currentSession.value)
      }
      if (!deps.workspaceCurrentTarget.value) {
        deps.setWorkspaceCurrentTarget(resolveChatSessionTargetId(deps.currentSession.value))
      }
    } else if (Array.isArray(data.chatSessions) && deps.currentChatTarget.value) {
      entityState.replaceSessions(chatSessions)
      const matchedSession = chatSessions.find((session: any) => {
        return resolveChatSessionTargetId(session) === deps.normalizeTargetId(deps.currentChatTarget.value)
      })
      if (matchedSession) {
        deps.currentSession.value = entityState.upsertSession(matchedSession)
      }
    } else if (Array.isArray(data.chatSessions)) {
      entityState.replaceSessions(chatSessions)
      chatSessions.forEach((session: any) => {
        const targetId = normalizeChatTargetId(String(session?.targetId ?? session?.target_id ?? session?.id ?? ''))
        if (!targetId) return
        entityState.registerTarget(targetId)
      })
    }

    if (hasSessionSnapshot) {
      const sessions = Object.values(deps.chatSessions.value || {})
      const workspaceSessionId = String(data.workspaceSessionId || '').trim()
      const sessionFromSnapshot = resolveChatSessionBySessionId(workspaceSessionId)
      if (applyCurrentSession(sessionFromSnapshot)) return

      const targetIds = sessions
        .map((session: any) => deps.normalizeTargetId(resolveChatSessionTargetId(session)))
        .filter(Boolean)
      const currentTarget = deps.normalizeTargetId(deps.currentChatTarget.value || deps.workspaceCurrentTarget.value || '')
      const nextTarget = currentTarget && targetIds.includes(currentTarget)
        ? currentTarget
        : targetIds[0] || ''
      if (nextTarget) {
        deps.currentChatTarget.value = nextTarget
        deps.setWorkspaceCurrentTarget(nextTarget)
        deps.currentSession.value = resolveChatSessionByTargetId({
          targetId: nextTarget,
          currentChatTarget: nextTarget,
          workspaceCurrentTarget: nextTarget,
          currentSession: deps.currentSession.value,
          chatSessions: deps.chatSessions.value,
          normalizeTargetId: deps.normalizeTargetId
        })
        deps.currentMessages.value = deps.buildDisplayMessages(nextTarget, String(deps.currentSession.value?.id || ''))
      } else {
        deps.currentChatTarget.value = ''
        deps.workspaceCurrentTarget.value = ''
        deps.currentSession.value = null
        deps.currentMessages.value = []
      }
    }

    if (Array.isArray(data.currentMessages)) {
      const normalizedTarget = deps.normalizeTargetId(deps.currentChatTarget.value)
      const normalizedMessages = data.currentMessages.map((message: any) =>
        deps.normalizeMessageForTarget(normalizedTarget, message)
      )
      if (normalizedTarget) {
        const sessionId = String(deps.currentSession.value?.id || normalizedTarget)
        entityState.replaceMessagesForSession(sessionId, normalizedTarget, normalizedMessages)
        deps.currentMessages.value = deps.buildDisplayMessages(normalizedTarget, sessionId)
      } else {
        deps.currentMessages.value = normalizedMessages
      }
    } else if (deps.currentChatTarget.value) {
      deps.currentMessages.value = deps.buildDisplayMessages(deps.currentChatTarget.value, String(deps.currentSession.value?.id || ''))
    }
  }
}
