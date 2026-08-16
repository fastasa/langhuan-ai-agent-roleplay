import { chatRepository } from '../../repositories/chatRepository.js'
import { personalityTrainingRepository } from '../../repositories/personalityTrainingRepository.js'
import { buildPersonalityChatSamplePrompt } from './personalityQuestionnairePrompt.js'
import { isAgentSessionKind } from '../../../shared/agentSessionKinds.js'

type Row = Record<string, any>

// 聊天记录持续优化（第 6 批）真值边界：
// 1. UI 只展示消息原文供用户人工判断；训练材料一律来自消息投影的 objective_fact，原文不进 prompt。
// 2. 投影读取固定走 listVisibleMessageProjectionsForCharacter：按当前角色可见性过滤，
//    多人会话里其他角色不该知道的投影不会被读到。
// 3. 投影失败 / 未生成 / 对该角色不可见的消息不会自动进入训练，只能补投影后重选。

const MAX_CANDIDATE_MESSAGES = 200

function text(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value)
}

export type ChatMessageCandidate = {
  sessionId: string
  sessionTitle: string
  messageId: number
  time: string
  role: string
  speakerName: string
  text: string
  projection: {
    state: 'ok' | 'none' | 'fail' | 'running' | 'hidden'
    failureReason: string
  }
}

type ProjectionLookup = {
  visibleFactByMessage: Map<number, Row>
  latestByMessage: Map<number, Row>
  hiddenMessageIds: Set<number>
}

function buildProjectionLookups(sessionIds: string[], characterId: string): Map<string, ProjectionLookup> {
  const lookups = new Map(sessionIds.map((sessionId) => [sessionId, {
    visibleFactByMessage: new Map<number, Row>(),
    latestByMessage: new Map<number, Row>(),
    hiddenMessageIds: new Set<number>()
  }] as const))
  for (const projection of chatRepository.listVisibleMessageProjectionsForCharacterBySessionIds(sessionIds, characterId) as Row[]) {
    const sessionId = text(projection.sessionId ?? projection.session_id)
    const messageId = Number(projection.messageId ?? projection.message_id ?? 0)
    if (messageId > 0) lookups.get(sessionId)?.visibleFactByMessage.set(messageId, projection)
  }
  for (const projection of chatRepository.listMessageProjectionsBySessionIds(sessionIds) as Row[]) {
    const sessionId = text(projection.sessionId ?? projection.session_id)
    const messageId = Number(projection.messageId ?? projection.message_id ?? 0)
    if (messageId > 0) lookups.get(sessionId)?.latestByMessage.set(messageId, projection)
  }
  for (const visibility of chatRepository.listMessageProjectionVisibilityBySessionIds(sessionIds) as Row[]) {
    if (text(visibility.characterId ?? visibility.character_id) !== characterId) continue
    if (text(visibility.visibility) !== 'hidden') continue
    const sessionId = text(visibility.sessionId ?? visibility.session_id)
    const messageId = Number(visibility.messageId ?? visibility.message_id ?? 0)
    if (messageId > 0) lookups.get(sessionId)?.hiddenMessageIds.add(messageId)
  }
  return lookups
}

function projectionStateForMessage(lookup: ProjectionLookup, messageId: number): ChatMessageCandidate['projection'] {
  const visible = lookup.visibleFactByMessage.get(messageId)
  if (visible && text(visible.objectiveFact ?? visible.objective_fact).trim()) {
    return { state: 'ok', failureReason: '' }
  }
  if (lookup.hiddenMessageIds.has(messageId) && !visible) {
    return { state: 'hidden', failureReason: '该消息投影对当前角色不可见，不能用于训练' }
  }
  const latest = lookup.latestByMessage.get(messageId)
  if (!latest) return { state: 'none', failureReason: '' }
  const status = text(latest.status)
  if (status === 'failed') {
    return { state: 'fail', failureReason: text(latest.failureReason ?? latest.failure_reason, '投影生成失败') }
  }
  if (status === 'running') {
    return { state: 'running', failureReason: '' }
  }
  // 投影完成但缺该角色的可见性记录或客观事实为空：按待生成处理，提示补投影
  return { state: 'none', failureReason: '' }
}

function listSessionsForCharacter(characterId: string): Row[] {
  const sessions = chatRepository.getAllSessions() as Row[]
  const participantRows = chatRepository.getAllSessionParticipants() as Row[]
  const sessionIdsWithCharacter = new Set(
    participantRows
      .filter((row) => text(row.participantTargetId ?? row.participant_target_id) === characterId)
      .map((row) => text(row.sessionId ?? row.session_id))
  )
  return sessions.filter((session) => {
    if (text(session.isArchived ?? session.is_archived) === '1') return false
    // 星依总agent/工作区专业Agent会话不属于角色聊天，训练取样兜底排除（名单唯一真值=shared/agentSessionKinds.ts）
    if (isAgentSessionKind(session.kind)) return false
    const sessionId = text(session.id)
    return text(session.targetId ?? session.target_id) === characterId || sessionIdsWithCharacter.has(sessionId)
  })
}

export function listChatMessageCandidates(input: {
  characterId: string
  characterName: string
  sessionId?: string
}) {
  const characterId = text(input.characterId).trim()
  const sessions = listSessionsForCharacter(characterId)
  const sessionInfos = sessions.map((session) => ({
    sessionId: text(session.id),
    title: text(session.title, '未命名会话'),
    updatedAt: text(session.updatedAt ?? session.updated_at)
  }))

  const targetSessionIds = text(input.sessionId).trim()
    ? sessionInfos.filter((session) => session.sessionId === text(input.sessionId).trim()).map((session) => session.sessionId)
    : sessionInfos.map((session) => session.sessionId)

  const targetSessionIdSet = new Set(targetSessionIds)
  const sessionInfoById = new Map(sessionInfos.map((session) => [session.sessionId, session] as const))
  const projectionLookups = buildProjectionLookups(targetSessionIds, characterId)
  const messages: ChatMessageCandidate[] = []
  const rows = chatRepository.getMessagesBySessionIds(targetSessionIds) as Row[]
  for (const row of rows) {
      const sessionId = text(row.sessionId ?? row.session_id)
      if (!targetSessionIdSet.has(sessionId) || text(row.messageKind ?? row.message_kind, 'chat') !== 'chat') continue
      const sessionTitle = sessionInfoById.get(sessionId)?.title || '未命名会话'
      const lookup = projectionLookups.get(sessionId)
      if (!lookup) continue
      const messageId = Number(row.id || 0)
      if (!messageId) continue
      messages.push({
        sessionId,
        sessionTitle,
        messageId,
        time: text(row.time ?? row.createdAt ?? row.created_at),
        role: text(row.role),
        speakerName: text(row.memberName ?? row.member_name) || (text(row.role) === 'assistant' ? text(input.characterName, '角色') : '用户'),
        text: text(row.content),
        projection: projectionStateForMessage(lookup, messageId)
      })
  }

  messages.sort((a, b) => (b.time || '').localeCompare(a.time || '') || b.messageId - a.messageId)
  return {
    sessions: sessionInfos,
    messages: messages.slice(0, MAX_CANDIDATE_MESSAGES),
    truncated: messages.length > MAX_CANDIDATE_MESSAGES
  }
}

export function createChatSampleDraft(input: {
  characterId: string
  character: Row
  selections: Array<{ sessionId: string; messageIds: number[] }>
}) {
  const characterId = text(input.characterId).trim()
  const selections = Array.isArray(input.selections) ? input.selections : []
  if (!selections.length) throw new Error('请选择至少一条消息')

  const usableItems: Array<{ fact: string; speakerName: string; sessionTitle: string; time: string; sessionId: string; messageId: number; projectionId: string }> = []
  const skipped: Array<{ sessionId: string; messageId: number; reason: string }> = []
  const sessionIds = Array.from(new Set(selections.map((selection) => text(selection.sessionId).trim()).filter(Boolean)))
  const sessionById = new Map((chatRepository.getSessionsByIds(sessionIds) as Row[]).map((session) => [text(session.id), session] as const))
  const projectionLookups = buildProjectionLookups(sessionIds, characterId)

  for (const selection of selections) {
    const sessionId = text(selection.sessionId).trim()
    if (!sessionId) continue
    const session = sessionById.get(sessionId)
    const sessionTitle = text(session?.title, '未命名会话')
    const lookup = projectionLookups.get(sessionId)
    if (!lookup) continue
    for (const rawMessageId of (Array.isArray(selection.messageIds) ? selection.messageIds : [])) {
      const messageId = Number(rawMessageId || 0)
      if (!messageId) continue
      const visible = lookup.visibleFactByMessage.get(messageId)
      const fact = text(visible?.objectiveFact ?? visible?.objective_fact).trim()
      if (visible && fact) {
        usableItems.push({
          fact,
          speakerName: text(visible.speakerName ?? visible.speaker_name),
          sessionTitle,
          time: text(visible.createdAt ?? visible.created_at),
          sessionId,
          messageId,
          projectionId: text(visible.id)
        })
      } else {
        const state = projectionStateForMessage(lookup, messageId)
        const reason = state.state === 'fail'
          ? `投影失败：${state.failureReason}`
          : state.state === 'hidden'
            ? '投影对当前角色不可见'
            : state.state === 'running'
              ? '投影生成中'
              : '尚未生成投影'
        skipped.push({ sessionId, messageId, reason })
      }
    }
  }

  if (!usableItems.length) {
    throw new Error('所选消息没有可用投影；请先补投影或换一批消息（投影失败的消息不会自动进入训练）')
  }

  const promptSnapshot = buildPersonalityChatSamplePrompt({
    character: input.character,
    projectionItems: usableItems
  })

  const dataset = personalityTrainingRepository.createDatasetDraft({
    characterId,
    title: `${text(input.character?.name, '角色')} 聊天优化批次`,
    sourceKind: 'chat_projection_selection',
    sourceSummary: {
      createdBy: 'chat_projection_selection',
      selectedMessageCount: usableItems.length + skipped.length,
      usableProjectionCount: usableItems.length,
      skipped,
      sourceRefs: usableItems.map((item) => ({
        type: 'chat_message_projection',
        sessionId: item.sessionId,
        messageId: item.messageId,
        projectionId: item.projectionId
      }))
    },
    promptSnapshot,
    dimensionPlan: []
  })

  return {
    dataset,
    usableCount: usableItems.length,
    skipped
  }
}
