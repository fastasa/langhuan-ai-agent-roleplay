import { computed, ref } from 'vue'
import { countChatSessionCharacterParticipants, createChatSession, fetchSessionTemporaryCharacters, getChatSessionVirtualScene, getChatStoreActiveSessionId, getChatStoreActiveTargetId, getChatStoreCurrentMessages, getChatStoreCurrentSession, getChatStoreSessionSwitchLoadingId, getChatStoreTyping, normalizeChatSessionCharacterParticipants, normalizeChatTargetId, readChatStoreValue, resolveChatTargetKind, runChatMessageProjectionBySessionId, runChatProjectionWritebackBySessionId } from '../../repositories/chatRepository'
import { API } from '../../config/api'
import { setRecallActivitySidebarOpen, useRecallTraceState } from '../../app/recallTraceState'
import type { LocalArchiveModuleName } from './localArchiveShared'
import type {
  ApiPresetFormUpdatePayload,
  ChatPanelActions,
  ChatSessionRow,
  ChatPanelViewModel,
  LocalArchiveSyncPanelActions,
  LocalArchiveSyncPanelViewModel,
  EnvironmentActions,
  EnvironmentViewModel,
  PromptPresetDragPayload,
  PromptPresetReorderPayload,
  TaskPanelActions,
  TaskPanelTab,
  TaskPanelViewModel,
  TransactionPanelActions,
  TransactionPanelViewModel
} from '../../types/panelContracts'
import { AI_PROVIDER_TEMPLATES } from '../../../shared/aiProviders'
import { AGENT_SESSION_KINDS } from '../../../shared/agentSessionKinds'
import {
  formatVirtualSceneInputValue,
  parseVirtualSceneDisplayTime,
  resolveVirtualSceneTime
} from '../../utils/virtualScene'
import { extractSessionTemporaryCharacterField } from '../../app/sessionTemporaryCharacterCommand'
import { registerXingyiFunctionProvider } from '../../app/xingyiFunctionBridge'
import { resolveChatSessionTitle } from '../../app/chatHeaderTitle'

function readStoreRecord<T>(input: T | { value: T } | undefined): T | undefined {
  return readChatStoreValue(input)
}

function readMaybeRef<T>(input: T | { value: T } | null | undefined): T | undefined {
  return readChatStoreValue(input as T | { value: T } | undefined)
}

function setRefValue(target: unknown, value: unknown) {
  if (target && typeof target === 'object' && 'value' in target) {
    ;(target as { value: unknown }).value = value
  }
}

function assignApiPresetFormField<K extends ApiPresetFormUpdatePayload['key']>(
  form: Record<K, ApiPresetFormUpdatePayload['value']>,
  payload: { key: K; value: ApiPresetFormUpdatePayload['value'] }
) {
  form[payload.key] = payload.value
}

function findEntityByTargetId(items: any[], targetId: string, prefix = '') {
  const normalizedTargetId = normalizeChatTargetId(targetId)
  return (Array.isArray(items) ? items : []).find((item) => {
    const id = String(item?.id || '').trim()
    return id === normalizedTargetId || (prefix ? `${prefix}${id}` === normalizedTargetId : false)
  }) || null
}

function readEntityMembers(entity: any): unknown[] {
  const rawMembers = entity?.members ?? entity?.memberIds ?? entity?.member_ids ?? []
  if (Array.isArray(rawMembers)) return rawMembers
  if (typeof rawMembers !== 'string') return []
  try {
    const parsed = JSON.parse(rawMembers)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function countEntityParticipants(targetKind: string, entity: any): number {
  if (targetKind !== 'group') return 1
  const ids = readEntityMembers(entity)
    .map((item) => String((item as any)?.characterId ?? (item as any)?.id ?? item ?? '').trim())
    .filter(Boolean)
  return new Set(ids).size
}

function readSceneTimeRate(value: unknown, fallback = 1): number {
  if (value === '' || value === null || value === undefined) return fallback
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function readRecallActivityLabel(status: string | undefined): string {
  if (status === 'running') return '正在召回'
  if (status === 'failed') return '召回失败'
  if (status === 'completed') return '召回记录'
  return '召回记录'
}

function sanitizeChatSessionTitle(value: unknown): string {
  return String(value || '')
    .replace(/[「」『』“”"'`]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 15)
}

function stripPairedRenderMarks(content: string): string {
  return content
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/（([^（）\n]+)）/g, '$1')
    .replace(/\(([^()\n]+)\)/g, '$1')
}

function formatSessionPreview(content: unknown): string {
  const normalized = String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<affection>[\s\S]*?<\/affection>/gi, '')
  return stripPairedRenderMarks(normalized)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
}

function buildChatSessionRows(ctx: any): ChatSessionRow[] {
  const sessions = readStoreRecord<Record<string, any>>(ctx.chatStore?.entities?.chatSessions) || {}
  const messagesRecord = readStoreRecord<Record<string, any[]>>(ctx.chatStore?.entities?.chatMessages) || {}
  return Object.values(sessions)
    .map((session: any): ChatSessionRow | null => {
      const sessionId = String(session?.id || '').trim()
      // 星依总agent / 工作区专业Agent（编剧、舆图师、鉴心）会话只在各自浮坞/工作区承载，不进联系人侧栏
      if ((AGENT_SESSION_KINDS as readonly string[]).includes(String(session?.kind || ''))) return null
      const targetId = normalizeChatTargetId(String(session?.targetId ?? session?.target_id ?? sessionId))
      if (!sessionId || !targetId) return null
      const isArchived = Boolean(session?.isArchived ?? session?.is_archived)
      const targetKind = resolveChatTargetKind(targetId)
      if (targetKind === 'unknown') return null
      const kind = targetKind === 'crowd' ? 'crowd' : 'session'
      const entity = targetKind === 'character'
        ? findEntityByTargetId(ctx.charStore?.characters, targetId)
        : targetKind === 'group'
          ? findEntityByTargetId(ctx.charStore?.groups, targetId, 'group_')
          : findEntityByTargetId(ctx.charStore?.crowds, targetId, 'crowd_')
      const participantCount = countChatSessionCharacterParticipants(session) || countEntityParticipants(targetKind, entity)
      const rowKind: ChatSessionRow['kind'] = kind === 'crowd' ? 'crowd' : 'session'
      const messages = messagesRecord[sessionId] || []
      const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : null
      // bootstrap 快照不带消息正文（懒加载），未打开过的会话回落到快照自带的最后消息元数据
      const sessionLastMessagePreview = String(session?.lastMessagePreview ?? session?.last_message_preview ?? '')
      const sessionMessageCount = Number(session?.messageCount ?? session?.message_count ?? 0) || 0
      const updatedAt = String(session?.updatedAt ?? session?.updated_at ?? lastMessage?.createdAt ?? lastMessage?.created_at ?? lastMessage?.time ?? session?.lastMessageAt ?? session?.last_message_at ?? '')
      const title = String(session?.title || entity?.name || ctx.getTargetName?.(targetId) || '').trim()
      const sessionAvatarPath = String(session?.conversationAvatarPath ?? session?.conversation_avatar_path ?? '').trim()
      const sessionEmoji = String(session?.conversationEmoji ?? session?.conversation_emoji ?? '').trim()
      return {
        sessionId,
        targetId,
        kind: rowKind,
        isArchived,
        title: title || (rowKind === 'crowd' ? '未知群众角色' : '未知会话'),
        // 「N人」展示=角色参与者+用户本人（2026-07-10 拍板）；participantCount 判断口径不变（>=2 才算多人会话）。
        label: participantCount >= 2 ? `${participantCount + 1}人` : '',
        preview: formatSessionPreview(lastMessage ? lastMessage.content : sessionLastMessagePreview) || '暂无消息',
        updatedAt,
        avatarPath: sessionAvatarPath || String(entity?.avatarPath || entity?.avatar_path || ''),
        emoji: sessionEmoji || String(entity?.emoji || ''),
        participantCount,
        messageCount: (Array.isArray(messages) && messages.length > 0) ? messages.length : sessionMessageCount
      }
    })
    .filter((row): row is ChatSessionRow => Boolean(row))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function toggleEvaluation(ctx: any) {
  ctx.settingStore.aiEvaluationEnabled = !ctx.settingStore.aiEvaluationEnabled
  if (typeof ctx.settingEnvironmentService?.saveEnvironment === 'function') {
    ctx.settingEnvironmentService.saveEnvironment().catch(() => {})
  }
}

function runConfirmedAction(
  ctx: any,
  options: {
    title: string
    message: string
    confirmText?: string
    onConfirm: () => unknown
  }
) {
  const {
    title,
    message,
    confirmText = '确认',
    onConfirm
  } = options

  if (typeof ctx.openConfirmDialog === 'function') {
    ctx.openConfirmDialog(title, message, () => {
      if (ctx.confirmDialog && typeof ctx.confirmDialog === 'object') {
        ctx.confirmDialog.confirmText = confirmText
      }
      onConfirm()
    })
    if (ctx.confirmDialog && typeof ctx.confirmDialog === 'object') {
      ctx.confirmDialog.confirmText = confirmText
    }
    return
  }

  const showConfirmDialogRef = ctx.showConfirmDialog
  if (showConfirmDialogRef && ctx.confirmDialog && typeof ctx.confirmDialog === 'object') {
    ctx.confirmDialog.title = title
    ctx.confirmDialog.message = message
    ctx.confirmDialog.confirmText = confirmText
    ctx.confirmDialog.onConfirm = onConfirm
    showConfirmDialogRef.value = true
    return
  }

  ctx.toast?.('确认弹窗暂时不可用，操作已拦截', 'warning')
}

function readBrainAgentConfig(ctx: any) {
  const configs = Array.isArray(ctx.settingStore?.agentModelConfigs) ? ctx.settingStore.agentModelConfigs : []
  return configs.find((item: any) => String(item?.id || '').trim() === 'brain_agent') || null
}

function appendManualSummaryDebugMessage(ctx: any, input: {
  sessionId: string
  targetId: string
  content: string
}) {
  const content = String(input.content || '').trim()
  if (!content) return
  const message = {
    id: `debug_chat_summary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'assistant',
    messageKind: 'narration_debug',
    message_kind: 'narration_debug',
    name: '总结调试',
    memberName: '总结调试',
    content,
    time: new Date().toLocaleTimeString(),
    _targetId: input.targetId,
    _sessionId: input.sessionId
  }
  const targetKey = input.sessionId || input.targetId
  if (typeof ctx.chatStore?.queuePendingPersistedMessage === 'function') {
    ctx.chatStore.queuePendingPersistedMessage(targetKey, message)
  } else {
    const messages = getChatStoreCurrentMessages(ctx.chatStore)
    if (Array.isArray(messages)) messages.push(message)
  }
  ctx.scrollToBottom?.()
}

function startSummaryAgentNotice(ctx: any, input: {
  message: string
  step: string
  sourceLabel?: string
  sourceCharacterId?: string
}) {
  return ctx.workspaceRuntimeStore?.startAgentTaskNotice?.({
    title: '总结对话',
    message: input.message,
    sourceLabel: input.sourceLabel || '总结链路',
    sourceCharacterId: input.sourceCharacterId || '',
    step: input.step
  }) || ''
}

function updateSummaryAgentNotice(ctx: any, id: string, input: {
  message: string
  step: string
  status?: 'running' | 'waiting'
  detail?: string
}) {
  ctx.workspaceRuntimeStore?.updateAgentTaskNotice?.({
    id,
    message: input.message,
    step: input.step,
    status: input.status || 'running',
    detail: input.detail || ''
  })
}

function completeSummaryAgentNotice(ctx: any, id: string, input: {
  message: string
  step: string
  detail?: string
}) {
  ctx.workspaceRuntimeStore?.completeAgentTaskNotice?.({
    id,
    message: input.message,
    step: input.step,
    detail: input.detail || ''
  })
}

function failSummaryAgentNotice(ctx: any, id: string, input: {
  message: string
  step: string
  error?: unknown
  detail?: string
}) {
  ctx.workspaceRuntimeStore?.failAgentTaskNotice?.({
    id,
    message: input.message,
    step: input.step,
    error: input.error || input.detail || input.message,
    detail: input.detail || ''
  })
}

function hasActiveChatReplyTask(ctx: any): boolean {
  if (getChatStoreTyping(ctx.chatStore)) return true
  const foregroundTask = readMaybeRef<any>(ctx.workspaceRuntimeStore?.foregroundChatTaskRun)
  if (!foregroundTask) return false
  const label = String(foregroundTask.label || '').trim()
  return label === '角色回复' || label.includes('人格网络')
}

function stopActiveChatReplyTaskForSummary(ctx: any): boolean {
  const foregroundTask = readMaybeRef<any>(ctx.workspaceRuntimeStore?.foregroundChatTaskRun)
  const label = String(foregroundTask?.label || '').trim()
  const shouldStopForeground = Boolean(foregroundTask)
    && (label === '角色回复' || label.includes('人格网络'))
    && typeof ctx.workspaceRuntimeStore?.stopForegroundChatTaskRun === 'function'
  if (shouldStopForeground) {
    ctx.workspaceRuntimeStore.stopForegroundChatTaskRun()
    return true
  }
  if (getChatStoreTyping(ctx.chatStore) && typeof ctx.workspaceRuntimeStore?.stopForegroundChatTaskRun === 'function') {
    return Boolean(ctx.workspaceRuntimeStore.stopForegroundChatTaskRun())
  }
  return false
}

function getCharacterDisplayName(ctx: any, characterId: string) {
  const id = String(characterId || '').trim()
  if (!id) return ''
  const fromGetter = typeof ctx.charStore?.getCharacter === 'function' ? ctx.charStore.getCharacter(id) : null
  if (fromGetter?.name) return String(fromGetter.name)
  const fromList = Array.isArray(ctx.charStore?.characters)
    ? ctx.charStore.characters.find((item: any) => String(item?.id || '').trim() === id)
    : null
  return String(fromList?.name || ctx.getTargetName?.(id) || id).trim()
}

function resolveProjectionWritebackCharacterOptions(ctx: any, session: any, targetId: string) {
  const participants = normalizeChatSessionCharacterParticipants(session)
    .map((item) => String(item.characterId || '').trim())
    .filter(Boolean)
  const fallbackId = normalizeChatTargetId(targetId)
  const ids = participants.length ? participants : (fallbackId && !fallbackId.startsWith('group_') && !fallbackId.startsWith('crowd_') ? [fallbackId] : [])
  const seen = new Set<string>()
  return ids
    .filter((id) => {
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((id) => ({
      id,
      name: getCharacterDisplayName(ctx, id) || id
    }))
}

function requestManualProjectionWritebackCharacters(ctx: any, options: Array<{ id: string; name: string }>): string[] {
  if (!options.length) return []
  if (options.length === 1) return [options[0].id]
  const message = [
    '请选择要写入轨迹的角色编号，可用逗号分隔多个角色：',
    '',
    ...options.map((item, index) => `${index + 1}. ${item.name}（${item.id}）`)
  ].join('\n')
  const promptFn = typeof ctx.prompt === 'function'
    ? ctx.prompt
    : (typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt.bind(window) : null)
  const answer = promptFn ? String(promptFn(message, '1') || '').trim() : '1'
  if (!answer) return []
  const byId = new Map(options.map((item) => [item.id, item]))
  const selected = new Set<string>()
  answer
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((token) => {
      const index = Number(token)
      if (Number.isInteger(index) && index >= 1 && index <= options.length) {
        selected.add(options[index - 1].id)
        return
      }
      if (byId.has(token)) selected.add(token)
    })
  return Array.from(selected)
}

function summarizeProjectionWritebackResult(result: Record<string, unknown>) {
  const status = String(result?.status || '').trim()
  if (status === 'skipped') return String(result.reason || '可见投影未达到写入窗口。')
  const hiddenCount = Number(result.hiddenProjectionCount || 0)
  const successCount = Array.isArray(result.successEventIds) ? result.successEventIds.length : 0
  const failedCount = Array.isArray(result.failedEvents) ? result.failedEvents.length : 0
  return `状态：${status || 'unknown'}；写入 ${successCount} 个事件；隐藏 ${hiddenCount} 条角色可见投影；失败 ${failedCount} 项。`
}

async function runProjectionWritebackForCharacters(ctx: any, input: {
  sessionId: string
  targetId: string
  characterIds: string[]
  runKind: 'manual' | 'auto'
  sourceMessageId?: number
}) {
  const uniqueCharacterIds = Array.from(new Set((input.characterIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
  const results: Array<{ characterId: string; characterName: string; result: Record<string, unknown> | null; error?: unknown }> = []
  if (input.sourceMessageId && input.sourceMessageId > 0) {
    try {
      await runChatMessageProjectionBySessionId(input.sessionId, input.sourceMessageId)
    } catch (error) {
      console.warn('写轨迹前补消息投影失败:', error)
    }
  }
  for (const characterId of uniqueCharacterIds) {
    const characterName = getCharacterDisplayName(ctx, characterId) || characterId
    try {
      const result = await runChatProjectionWritebackBySessionId(input.sessionId, {
        characterId,
        runKind: input.runKind
      })
      results.push({ characterId, characterName, result })
    } catch (error) {
      results.push({ characterId, characterName, result: null, error })
    }
  }
  return results
}

function buildSummaryConfirmMessage(characterOptions: Array<{ id: string; name: string }>) {
  const characterCount = characterOptions.length
  const roleLine = characterCount > 1
    ? `当前会话检测到 ${characterCount} 个可写入角色，确认后会继续选择写入对象。`
    : '当前会话检测到 1 个可写入角色，确认后会直接写入该角色。'
  return [
    '这会按角色可见投影整理当前对话，并写入对应角色轨迹。',
    roleLine,
    '写入成功后，已处理投影会从待写窗口隐藏，避免重复整理。'
  ].join('\n')
}

async function runConfirmedChatSummaryToTrace(ctx: any) {
  const session = getChatStoreCurrentSession(ctx.chatStore)
  const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
  const targetId = getChatStoreActiveTargetId(ctx.chatStore)
  if (!sessionId || !targetId) {
    ctx.toast?.('先打开一个会话再总结对话', 'warning')
    return
  }
  if (hasActiveChatReplyTask(ctx) && stopActiveChatReplyTaskForSummary(ctx)) {
    ctx.toast?.('已停止当前角色回复，改为执行总结对话', 'info')
  }
  if (ctx.chatSummaryWriting?.value) return
  if (ctx.chatSummaryWriting) ctx.chatSummaryWriting.value = true
  if (ctx.chatSummaryWritingText) ctx.chatSummaryWritingText.value = '正在按角色写入投影轨迹'
  const summaryNoticeId = startSummaryAgentNotice(ctx, {
    message: '正在准备总结对话',
    step: '启动总结'
  })
  let formatNarrationDebugBlock = (title: string, lines: string[]) => `【${title}】${lines.filter(Boolean).join('；')}`
  try {
    ;({ formatNarrationDebugBlock } = await import('../../app/narrationDebugFormat'))
    const characterOptions = resolveProjectionWritebackCharacterOptions(ctx, session, targetId)
    const selectedCharacterIds = requestManualProjectionWritebackCharacters(ctx, characterOptions)
    if (!selectedCharacterIds.length) {
      completeSummaryAgentNotice(ctx, summaryNoticeId, {
        message: '未选择写入角色',
        step: '已取消'
      })
      appendManualSummaryDebugMessage(ctx, {
        sessionId,
        targetId,
        content: formatNarrationDebugBlock('总结对话', ['已取消：没有选择要写入轨迹的角色。'])
      })
      return
    }
    const selectedNames = selectedCharacterIds
      .map((id) => getCharacterDisplayName(ctx, id) || id)
      .join('、')
    updateSummaryAgentNotice(ctx, summaryNoticeId, {
      message: '正在按角色写入投影轨迹',
      step: '投影写轨迹'
    })
    appendManualSummaryDebugMessage(ctx, {
      sessionId,
      targetId,
      content: formatNarrationDebugBlock('总结对话', [`开始写入：选中角色 ${selectedNames || '未命名角色'}，使用当前角色可见投影写入轨迹。`])
    })
    const results = await runProjectionWritebackForCharacters(ctx, {
      sessionId,
      targetId,
      characterIds: selectedCharacterIds,
      runKind: 'manual'
    })
    const failed = results.filter((item) => item.error || String(item.result?.status || '') === 'failed')
    const skipped = results.filter((item) => String(item.result?.status || '') === 'skipped')
    const detailLines = results.map((item) => {
      if (item.error) return `${item.characterName}：异常：${item.error instanceof Error ? item.error.message : String(item.error)}`
      return `${item.characterName}：${summarizeProjectionWritebackResult(item.result || {})}`
    })
    appendManualSummaryDebugMessage(ctx, {
      sessionId,
      targetId,
      content: formatNarrationDebugBlock('总结对话', [
        failed.length ? '完成但有失败角色' : skipped.length === results.length ? '未写入：所选角色都未达到写入窗口。' : '完成：投影写轨迹已执行。',
        ...detailLines
      ])
    })
    if (failed.length) {
      failSummaryAgentNotice(ctx, summaryNoticeId, {
        message: '总结对话写轨迹部分失败',
        step: '投影写轨迹失败',
        detail: detailLines.join('\n')
      })
    } else {
      completeSummaryAgentNotice(ctx, summaryNoticeId, {
        message: skipped.length === results.length ? '没有可写入的投影窗口' : '总结对话完成',
        step: skipped.length === results.length ? '无需写入' : '投影轨迹已写入',
        detail: detailLines.join('\n')
      })
    }
  } catch (error) {
    appendManualSummaryDebugMessage(ctx, {
      sessionId,
      targetId,
      content: formatNarrationDebugBlock('总结对话', [`异常：${error instanceof Error ? error.message : String(error)}`])
    })
    failSummaryAgentNotice(ctx, summaryNoticeId, {
      message: '总结对话异常',
      step: '总结异常',
      error
    })
  } finally {
    if (ctx.chatSummaryWriting) ctx.chatSummaryWriting.value = false
    if (ctx.chatSummaryWritingText) ctx.chatSummaryWritingText.value = ''
  }
}

async function summarizeChatToTrace(ctx: any) {
  const session = getChatStoreCurrentSession(ctx.chatStore)
  const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
  const targetId = getChatStoreActiveTargetId(ctx.chatStore)
  if (!sessionId || !targetId) {
    ctx.toast?.('先打开一个会话再总结对话', 'warning')
    return
  }
  if (ctx.chatSummaryWriting?.value) return
  const characterOptions = resolveProjectionWritebackCharacterOptions(ctx, session, targetId)
  if (!characterOptions.length) {
    ctx.toast?.('当前会话没有可写入轨迹的角色', 'warning')
    return
  }
  if (typeof ctx.openConfirmDialog !== 'function') {
    ctx.toast?.('确认弹窗不可用，无法开始总结对话', 'error')
    return
  }
  ctx.openConfirmDialog(
    '总结对话',
    buildSummaryConfirmMessage(characterOptions),
    () => { void runConfirmedChatSummaryToTrace(ctx) },
    { confirmText: '开始写入', size: 'md' }
  )
}

function resolveManualNarrationTaskLabel(options: { kind?: 'environment' | 'appearance' | 'event_push'; profileId?: string; candidateId?: string }) {
  if (options.candidateId) return '事件候选推进退役'
  if (options.profileId) return '自定义旁白生成'
  if (options.kind === 'environment') return '环境旁白生成'
  if (options.kind === 'appearance') return '人物旁白生成'
  return '事件旁白生成'
}

function createManualNarrationAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('旁白生成已停止。', 'AbortError') as unknown as Error
  }
  const error = new Error('旁白生成已停止。')
  error.name = 'AbortError'
  return error
}

function isManualNarrationAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError')
}

function startManualNarrationTaskRun(ctx: any, input: {
  targetId: string
  sessionId: string
  options: { kind?: 'environment' | 'appearance' | 'event_push'; profileId?: string; candidateId?: string }
}) {
  if (typeof ctx.workspaceRuntimeStore?.startChatTaskRun !== 'function') {
    return { id: '', controller: null as AbortController | null }
  }
  const controller = new AbortController()
  const run = ctx.workspaceRuntimeStore.startChatTaskRun({
    taskKind: 'narrationGenerate',
    label: resolveManualNarrationTaskLabel(input.options),
    targetId: input.targetId,
    sessionId: input.sessionId,
    abortController: controller,
    foreground: !input.options.candidateId
  })
  return {
    id: String(run?.id || ''),
    controller: (run?.abortController || controller) as AbortController | null
  }
}

function isManualNarrationTaskActive(ctx: any, taskRunId: string) {
  if (!taskRunId) return true
  if (typeof ctx.workspaceRuntimeStore?.isChatTaskRunActive !== 'function') return true
  return ctx.workspaceRuntimeStore.isChatTaskRunActive(taskRunId)
}

function assertManualNarrationTaskActive(ctx: any, taskRunId: string) {
  if (!isManualNarrationTaskActive(ctx, taskRunId)) {
    throw createManualNarrationAbortError()
  }
}

function completeManualNarrationTaskRun(ctx: any, taskRunId: string) {
  if (taskRunId && isManualNarrationTaskActive(ctx, taskRunId)) {
    ctx.workspaceRuntimeStore?.completeChatTaskRun?.(taskRunId)
  }
}

function failManualNarrationTaskRun(ctx: any, taskRunId: string, error: unknown) {
  if (taskRunId && isManualNarrationTaskActive(ctx, taskRunId)) {
    ctx.workspaceRuntimeStore?.failChatTaskRun?.(taskRunId, error)
  }
}

function parseNarrationRoleAliases(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {}
  return text.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean)
}

async function buildManualNarrationRoleAppearanceProfiles(ctx: any, sessionId: string) {
  const alias = ctx.currentAlias?.value || {}
  const userProfile = ctx.charStore?.userProfile || {}
  const aliasName = String(alias?.name || '').trim()
  const userName = String(userProfile?.name || userProfile?.displayName || '').trim()
  const userAppearance = String(alias?.appearance ?? userProfile?.appearance ?? '').trim()
  const currentUserProfile = userAppearance
    ? {
      source: 'userAlias',
      name: aliasName || userName || '我',
      aliases: Array.from(new Set([userName, '我', '用户'].map((item) => String(item || '').trim()).filter((item) => item && item !== (aliasName || userName || '我')))),
      description: String(alias?.desc ?? userProfile?.desc ?? '').trim(),
      appearance: userAppearance
    }
    : null
  const formalProfiles = (Array.isArray(ctx.charStore?.characters) ? ctx.charStore.characters : [])
    .map((character: any) => ({
      source: 'formal',
      name: String(character?.name || '').trim(),
      aliases: parseNarrationRoleAliases(character?.nicknames),
      description: String(character?.desc ?? character?.description ?? '').trim(),
      appearance: String(character?.appearance ?? '').trim()
    }))
    .filter((profile: any) => profile.name)
  const temporaryCharacters = sessionId
    ? await fetchSessionTemporaryCharacters(sessionId).catch(() => [])
    : []
  const temporaryProfiles = temporaryCharacters
    .filter((character: any) => character?.status !== 'deleted')
    .map((character: any) => {
      const markdown = String(character?.markdown || '').trim()
      const identity = extractSessionTemporaryCharacterField(markdown, '身份或称呼')
      const situation = extractSessionTemporaryCharacterField(markdown, '当前处境')
      return {
        source: 'sessionTemporary',
        name: String(character?.name || '').trim(),
        aliases: parseNarrationRoleAliases(character?.aliases ?? character?.aliasesJson ?? character?.aliases_json),
        description: [identity, situation].map((item) => item.trim()).filter(Boolean).join('\n\n'),
        appearance: extractSessionTemporaryCharacterField(markdown, '外貌与可见特征'),
        markdown: markdown.slice(0, 1600)
      }
    })
    .filter((profile: any) => profile.name)
  return [currentUserProfile, ...formalProfiles, ...temporaryProfiles].filter(Boolean)
}

async function triggerManualNarration(ctx: any, options: { kind?: 'environment' | 'appearance' | 'event_push'; profileId?: string; candidateBatchId?: string; candidateId?: string } = {}) {
  const session = getChatStoreCurrentSession(ctx.chatStore)
  const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
  const targetId = getChatStoreActiveTargetId(ctx.chatStore)
  if (!sessionId || !targetId) {
    ctx.toast?.('先打开一个会话再让旁白推进', 'warning')
    return
  }
  if (options.candidateBatchId || options.candidateId) {
    ctx.toast?.('事件候选推进链路已退役；请直接生成正式旁白，旁白写入后会进入投影。', 'info')
    return
  }
  const narrationGenerateTaskRun = startManualNarrationTaskRun(ctx, { targetId, sessionId, options })
  const previousStreamingSpeakerName = String(ctx.currentStreamingSpeakerName?.value || '')
  const previousStreamingTargetId = String(ctx.currentStreamingTargetId?.value || '')
  try {
    if (ctx.currentStreamingSpeakerName) {
      ctx.currentStreamingSpeakerName.value = '旁白'
    }
    if (ctx.currentStreamingTargetId) {
      ctx.currentStreamingTargetId.value = targetId
    }
    const messages = getChatStoreCurrentMessages(ctx.chatStore) || []
    const { runManualNarrationCommand } = await import('../../app/manualNarrationCommand')
    const roleAppearanceProfiles = options.kind === 'appearance'
      ? await buildManualNarrationRoleAppearanceProfiles(ctx, sessionId)
      : []
    assertManualNarrationTaskActive(ctx, narrationGenerateTaskRun.id)
    const result = await runManualNarrationCommand({
      session: session || { id: sessionId, targetId },
      messages,
      documents: ctx.charStore?.documents || [],
      agentConfig: readBrainAgentConfig(ctx),
      callAI: ctx.callAI,
      abortSignal: narrationGenerateTaskRun.controller?.signal,
      narrationKind: options.kind,
      narrationProfileId: options.profileId,
      roleAppearanceProfiles
    })
    assertManualNarrationTaskActive(ctx, narrationGenerateTaskRun.id)
    const progressedWithoutNarration = false
    if (result.skipped || !result.messageId) {
      ctx.toast?.('旁白这轮没有写入', 'info')
      completeManualNarrationTaskRun(ctx, narrationGenerateTaskRun.id)
    } else {
      await ctx.chatStore?.switchSession?.(sessionId)
      // 旧轮末虚拟地点扫描（virtual_scene_location_scan）已退场（2026-06-10）：
      // 旁白消息的场景变化由内嵌投影与编排器 updateCurtainScene 处理。
      if (result.messageId) {
        const characterOptions = resolveProjectionWritebackCharacterOptions(ctx, getChatStoreCurrentSession(ctx.chatStore), targetId)
        void runProjectionWritebackForCharacters(ctx, {
          sessionId,
          targetId,
          sourceMessageId: Number(result.messageId),
          characterIds: characterOptions.map((item) => item.id),
          runKind: 'auto'
        }).catch((error) => console.warn('旁白写入后投影写轨迹失败:', error))
      }
      ctx.toast?.(options.profileId ? '自定义旁白已写入' : options.kind === 'environment' ? '环境旁白已写入' : options.kind === 'appearance' ? '人物描写旁白已写入' : '事件旁白已写入', 'success')
      completeManualNarrationTaskRun(ctx, narrationGenerateTaskRun.id)
      ctx.scrollToBottom?.()
    }
  } catch (error) {
    if (isManualNarrationAbortError(error)) {
      return
    }
    failManualNarrationTaskRun(ctx, narrationGenerateTaskRun.id, error)
    console.error('手动生成旁白失败:', error)
    ctx.toast?.(`旁白生成失败: ${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    if (ctx.currentStreamingSpeakerName) {
      ctx.currentStreamingSpeakerName.value = previousStreamingSpeakerName
    }
    if (ctx.currentStreamingTargetId) {
      ctx.currentStreamingTargetId.value = previousStreamingTargetId
    }
  }
}

export function buildEnvironmentBridge(ctx: any) {
  const effectiveScene = computed(() => ctx.currentScene?.value || null)
  const activeSession = computed(() => getChatStoreCurrentSession(ctx.chatStore) || null)
  const sessionScene = computed(() => getChatSessionVirtualScene(activeSession.value))
  const trimSceneText = (value: unknown) => String(value ?? '').trim()
  const composeSceneLocationLabel = (large: unknown, middle: unknown, small: unknown, legacy = '') => {
    const largeText = trimSceneText(large)
    const middleText = trimSceneText(middle)
    const smallText = trimSceneText(small)
    const legacyText = trimSceneText(legacy)
    const tail = smallText || (!largeText && !middleText ? legacyText : '')
    const parts = [largeText, middleText, tail].filter(Boolean)
    if (parts.length) return parts.join(' / ')
    return legacyText
  }
  const splitSceneLocationLabel = (value: unknown) => trimSceneText(value)
    .split(/\s*(?:\/|／|｜|\||>|＞)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
  const resolveEditableSceneLocationParts = (scene: Record<string, unknown>) => {
    let large = trimSceneText(scene.virtualLocationLarge)
    let middle = trimSceneText(scene.virtualLocationMiddle)
    let small = trimSceneText(scene.virtualLocationSmall)
    const legacy = trimSceneText(scene.virtualLocation)
    if (!large && !middle && small && splitSceneLocationLabel(small).length > 1) {
      const parts = splitSceneLocationLabel(small)
      large = parts[0] || ''
      middle = parts[1] || ''
      small = parts.slice(2).join(' / ')
    } else if (!large && !middle && !small && legacy) {
      const parts = splitSceneLocationLabel(legacy)
      if (parts.length >= 3) {
        large = parts[0]
        middle = parts[1]
        small = parts.slice(2).join(' / ')
      } else if (parts.length === 2) {
        large = parts[0]
        middle = parts[1]
      } else {
        small = legacy
      }
    }
    return { large, middle, small, legacy }
  }
  const effectiveWeather = computed(() => String(effectiveScene.value?.weather || ctx.settingStore.currentWeather || ''))
  const effectiveWeatherDetail = computed(() => {
    const scene = effectiveScene.value
    if (scene?.usesVirtualWeather) {
      return {
        ...(ctx.settingStore.weatherDetail || {}),
        text: String(scene.weather || ''),
        temp: ''
      }
    }
    return ctx.settingStore.weatherDetail || null
  })
  const environmentViewModel = computed<EnvironmentViewModel>(() => ({
    currentLocation: String(effectiveScene.value?.location || effectiveScene.value?.realLocation || ''),
    currentLocationLarge: String(sessionScene.value?.virtualLocationLarge || ''),
    currentLocationMiddle: String(sessionScene.value?.virtualLocationMiddle || ''),
    currentLocationSmall: String(sessionScene.value?.virtualLocationSmall || ''),
    currentTime: String(effectiveScene.value?.time || ctx.settingStore.currentTime || ''),
    timeRate: readSceneTimeRate(effectiveScene.value?.timeRate),
    weatherDetail: effectiveWeatherDetail.value,
    weatherText: String(effectiveWeatherDetail.value?.text || effectiveWeather.value).split(/[，,]/)[0].replace(/\s*\d+°?C?\s*$/, '').trim() || '天气',
    temperatureText: ctx.getTemperatureFromWeather(effectiveWeather.value),
    isLoadingLocation: Boolean(ctx.isLoadingLocation.value),
    isLoadingWeather: Boolean(ctx.isLoadingWeather.value),
    editingLocation: Boolean(ctx.editingLocation.value),
    tempLocation: String(ctx.tempLocation.value || ''),
    tempLocationLarge: String(ctx.tempLocationLarge?.value || ''),
    tempLocationMiddle: String(ctx.tempLocationMiddle?.value || ''),
    tempLocationSmall: String(ctx.tempLocationSmall?.value || ''),
    showWeatherDetail: Boolean(ctx.showWeatherDetail.value)
  }))
  const editCurtainLocation = () => {
    const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(activeSession.value?.id || '').trim()
    if (!sessionId) {
      ctx.editLocation?.()
      return
    }
    const scene = sessionScene.value || {}
    const { large, middle, small, legacy } = resolveEditableSceneLocationParts(scene)
    if (ctx.tempLocationLarge) ctx.tempLocationLarge.value = large
    if (ctx.tempLocationMiddle) ctx.tempLocationMiddle.value = middle
    if (ctx.tempLocationSmall) ctx.tempLocationSmall.value = small
    ctx.tempLocation.value = composeSceneLocationLabel(large, middle, small, legacy)
    ctx.editingLocation.value = true
  }
  const saveCurtainLocation = async () => {
    const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(activeSession.value?.id || '').trim()
    if (!sessionId || typeof ctx.chatStore?.updateSession !== 'function') {
      ctx.saveLocation?.()
      return
    }
    const locationLarge = trimSceneText(ctx.tempLocationLarge?.value)
    const locationMiddle = trimSceneText(ctx.tempLocationMiddle?.value)
    const locationSmall = trimSceneText(ctx.tempLocationSmall?.value)
    const virtualLocation = composeSceneLocationLabel(locationLarge, locationMiddle, locationSmall, '')
    await ctx.chatStore.updateSession(sessionId, {
      virtualLocationLarge: locationLarge,
      virtualLocationMiddle: locationMiddle,
      virtualLocationSmall: locationSmall,
      virtualLocation
    })
    ctx.tempLocation.value = virtualLocation
    ctx.editingLocation.value = false
    ctx.toast?.(virtualLocation ? '帷幕地点已保存' : '帷幕地点已清空', 'success')
  }
  const cancelCurtainLocationEdit = () => {
    ctx.editingLocation.value = false
  }
  const toggleSceneTimePaused = async () => {
    const session = getChatStoreCurrentSession(ctx.chatStore) || null
    const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
    if (!sessionId || typeof ctx.chatStore?.updateSession !== 'function') return
    const rawRate = readSceneTimeRate(session?.virtualTimeRate ?? session?.virtual_time_rate ?? effectiveScene.value?.timeRate)
    const nextPaused = rawRate > 0
    const settledTime = resolveVirtualSceneTime(session, Date.now())
      || String(effectiveScene.value?.time || ctx.settingStore.currentTime || '')
    const settledDate = parseVirtualSceneDisplayTime(settledTime)
    const settledBase = settledDate.getTime()
    const virtualTimeBase = Number.isFinite(settledBase) && settledBase !== 0
      ? settledBase
      : Date.now()
    await ctx.chatStore.updateSession(sessionId, {
      virtualTime: formatVirtualSceneInputValue(virtualTimeBase),
      virtualTimeBase,
      virtualTimeAnchor: Date.now(),
      virtualTimeRate: nextPaused ? 0 : 1
    })
    ctx.toast?.(nextPaused ? '帷幕时间已暂停' : '帷幕时间继续流动', 'success')
  }
  const environmentActions: EnvironmentActions = {
    editLocation: editCurtainLocation,
    saveLocation: saveCurtainLocation,
    cancelLocationEdit: cancelCurtainLocationEdit,
    updateTempLocation: (value: string) => { ctx.tempLocation.value = String(value || '') },
    updateTempLocationLarge: (value: string) => { if (ctx.tempLocationLarge) ctx.tempLocationLarge.value = String(value || '') },
    updateTempLocationMiddle: (value: string) => { if (ctx.tempLocationMiddle) ctx.tempLocationMiddle.value = String(value || '') },
    updateTempLocationSmall: (value: string) => { if (ctx.tempLocationSmall) ctx.tempLocationSmall.value = String(value || '') },
    syncWeather: () => ctx.syncWeather(String(effectiveScene.value?.weatherQueryLocation || '')),
    toggleSceneTimePaused,
    toggleWeatherDetail: () => { ctx.showWeatherDetail.value = !ctx.showWeatherDetail.value },
    closeWeatherDetail: () => { ctx.showWeatherDetail.value = false },
    syncTime: ctx.updateCurrentTime
  }
  return {
    environmentViewModel,
    environmentActions
  }
}

export function buildChatBridge(ctx: any) {
  const contactUndoStack = ref<Array<{ characters: any[]; characterGroups: any[]; groups: any[]; crowds: any[] }>>([])
  const contactRedoStack = ref<Array<{ characters: any[]; characterGroups: any[]; groups: any[]; crowds: any[] }>>([])
  const recallTraceState = useRecallTraceState()

  // 星依批次2（联动标注·双入口一真值）：总结对话能力注册进星依功能桥。
  // 核心链路与「总结对话」按钮同源（resolveProjectionWritebackCharacterOptions + runProjectionWritebackForCharacters）；
  // 差异只在交互面：按钮走确认弹窗+window.prompt 选角色，星依走浮坞确认卡片（角色由工具参数指定）。
  // 聊天桥是 app 壳生命周期，注册后不注销（重复 build 时覆盖注册，语义等价）。
  registerXingyiFunctionProvider('chatSummary', {
    getContext: () => {
      const session = getChatStoreCurrentSession(ctx.chatStore)
      const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
      const targetId = getChatStoreActiveTargetId(ctx.chatStore)
      if (!sessionId || !targetId) return null
      return {
        sessionId,
        sessionTitle: resolveChatSessionTitle(session, readMaybeRef(ctx.currentChatTitle) || '当前会话'),
        characterOptions: resolveProjectionWritebackCharacterOptions(ctx, session, targetId)
      }
    },
    runSummary: async (characterIds: string[]) => {
      const session = getChatStoreCurrentSession(ctx.chatStore)
      const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
      const targetId = getChatStoreActiveTargetId(ctx.chatStore)
      if (!sessionId || !targetId) return { ok: false, message: '当前没有打开中的会话，总结没有执行。' }
      if (ctx.chatSummaryWriting?.value) return { ok: false, message: '总结对话正在进行中，等当前这次完成再试。' }
      if (ctx.chatSummaryWriting) ctx.chatSummaryWriting.value = true
      try {
        const results = await runProjectionWritebackForCharacters(ctx, {
          sessionId,
          targetId,
          characterIds,
          runKind: 'manual'
        })
        const failed = results.filter((item) => item.error || String(item.result?.status || '') === 'failed')
        const lines = results.map((item) => {
          if (item.error) return `${item.characterName}：异常：${item.error instanceof Error ? item.error.message : String(item.error)}`
          return `${item.characterName}：${summarizeProjectionWritebackResult(item.result || {})}`
        })
        return { ok: failed.length === 0, message: lines.join('\n') || '没有产生任何写入结果。' }
      } finally {
        if (ctx.chatSummaryWriting) ctx.chatSummaryWriting.value = false
      }
    }
  })

  const switchSession = (sessionId: string) => {
    const handler = ctx.switchSession || ctx.chatStore?.switchSession
    if (typeof handler === 'function') {
      return handler.call(ctx.chatStore || ctx, sessionId)
    }
    return undefined
  }

  const cloneContactSnapshot = () => ({
    characters: Array.isArray(ctx.charStore.characters) ? ctx.charStore.characters.map((item: any) => ({ ...item })) : [],
    characterGroups: Array.isArray(ctx.charStore.characterGroups) ? ctx.charStore.characterGroups.map((item: any) => ({ ...item })) : [],
    groups: Array.isArray(ctx.charStore.groups) ? ctx.charStore.groups.map((item: any) => ({ ...item })) : [],
    crowds: Array.isArray(ctx.charStore.crowds) ? ctx.charStore.crowds.map((item: any) => ({ ...item })) : []
  })

  const pushContactHistory = () => {
    contactUndoStack.value = [...contactUndoStack.value.slice(-39), cloneContactSnapshot()]
    contactRedoStack.value = []
  }

  const applyContactSnapshot = (snapshot: { characters: any[]; characterGroups: any[]; groups: any[]; crowds: any[] }) => {
    ctx.charStore.characters = snapshot.characters.map((item: any) => ({ ...item }))
    ctx.charStore.characterGroups = snapshot.characterGroups.map((item: any) => ({ ...item }))
    ctx.charStore.groups = snapshot.groups.map((item: any) => ({ ...item }))
    ctx.charStore.crowds = snapshot.crowds.map((item: any) => ({ ...item }))
  }

  const resolveCharacterFromValue = (value: unknown) => {
    const raw = String(value || '').trim()
    if (!raw || raw.startsWith('group_') || raw.startsWith('crowd_')) return null

    if (typeof ctx.charStore?.getCharacter === 'function') {
      const direct = ctx.charStore.getCharacter(raw)
      if (direct) return direct
    }

    const characters = Array.isArray(ctx.charStore?.characters) ? ctx.charStore.characters : []
    return characters.find((item: any) => item?.id === raw || item?.name === raw) || null
  }

  const openCharacterSettings = (payload?: { char?: any; nameOrId?: string }) => {
    const candidates = [
      payload?.char,
      payload?.nameOrId,
      payload?.char?.id,
      payload?.char?.name,
      ctx.currentCharacter.value,
      ctx.currentCharacter.value?.id,
      ctx.currentCharacter.value?.name,
      getChatStoreActiveTargetId(ctx.chatStore)
    ]

    const resolvedCharacter = candidates
      .map((item) => resolveCharacterFromValue(item) || (item && typeof item === 'object' && item.id ? item : null))
      .find(Boolean) || null

    if (resolvedCharacter && typeof ctx.editCharacter === 'function') {
      ctx.editCharacter(resolvedCharacter)
      ctx.showCharacterEditor.value = true
      return true
    }

    const stringCandidates = candidates
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item || '').trim())
      .filter(Boolean)

    if (typeof ctx.openCharSettingsByName === 'function') {
      for (const candidate of stringCandidates) {
        if (ctx.openCharSettingsByName(candidate)) {
          return true
        }
      }
    }

    if (resolvedCharacter) {
      ctx.showCharacterEditor.value = true
      return true
    }

    return false
  }

  const normalizeContactItems = (items: Array<{ kind: string; id: string }> | unknown) => (
    Array.isArray(items)
      ? items
        .map((item) => {
          const kind = String(item?.kind || '') as 'char' | 'group' | 'crowd'
          const rawId = String(item?.id || '').trim()
          const id = kind === 'group'
            ? (rawId.startsWith('group_group_') ? rawId.replace(/^group_/, '') : rawId)
            : kind === 'crowd'
              ? (rawId.startsWith('crowd_crowd_') ? rawId.replace(/^crowd_/, '') : rawId)
              : rawId
          return { kind, id }
        })
        .filter((item) => item.id && (item.kind === 'char' || item.kind === 'group' || item.kind === 'crowd'))
      : []
  )

  const sortByOrderIndex = <T extends Record<string, any>>(items: T[]) => (
    [...items].sort((left, right) => {
      const leftOrder = Number(left?.orderIndex ?? left?.order_index ?? Number.MAX_SAFE_INTEGER)
      const rightOrder = Number(right?.orderIndex ?? right?.order_index ?? Number.MAX_SAFE_INTEGER)
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'zh-Hans-CN')
    })
  )

  const resequenceOrderIndex = async <T extends Record<string, any>>(
    items: T[],
    persist: (id: string, changes: Record<string, unknown>) => Promise<unknown>
  ) => {
    await Promise.all(items.map((item, index) => persist(String(item.id || ''), { orderIndex: index + 1 })))
  }

  const syncDraggedGroupToForms = (kind: 'char' | 'group' | 'crowd', ids: string[], nextGroupId: string) => {
    const normalizedGroupId = String(nextGroupId || 'default').trim() || 'default'
    if (kind === 'char') {
      if (ids.includes(String(ctx.charEditForm?.id || '').trim())) {
        ctx.charEditForm.group = normalizedGroupId
      }
      return
    }
    if (kind === 'group') {
      if (ids.includes(String(ctx.groupEditForm?.id || '').trim())) {
        ctx.groupEditForm.groupId = normalizedGroupId
      }
      if (ids.includes(String(ctx.editingGroupId?.value || '').trim())) {
        ctx.groupForm.groupId = normalizedGroupId
      }
      return
    }
    if (ids.includes(String(ctx.editingCrowdId?.value || '').trim())) {
      ctx.crowdForm.groupId = normalizedGroupId
    }
  }

  const reorderCharacterGroups = async (
    draggedIds: string[],
    targetId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    const source = sortByOrderIndex(
      (Array.isArray(ctx.charStore.characterGroups) ? ctx.charStore.characterGroups : [])
        .filter((item: any) => String(item?.id || '').trim() !== 'default')
    )
    const movingSet = new Set(draggedIds)
    const remaining = source.filter((item: any) => !movingSet.has(String(item?.id || '')))
    const dragged = source.filter((item: any) => movingSet.has(String(item?.id || '')))
    const targetIndex = remaining.findIndex((item: any) => String(item?.id || '') === targetId)
    if (!dragged.length || targetIndex < 0) return
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    remaining.splice(insertIndex, 0, ...dragged)
    const nextGroups = remaining.map((item: any, index: number) => ({
      ...item,
      orderIndex: index + 1
    }))
    const defaultGroup = (Array.isArray(ctx.charStore.characterGroups) ? ctx.charStore.characterGroups : [])
      .find((item: any) => String(item?.id || '').trim() === 'default')
    ctx.charStore.characterGroups = defaultGroup
      ? [defaultGroup, ...nextGroups]
      : nextGroups
    await Promise.all(nextGroups.map((item: any, index: number) => ctx.charStore.updateCharGroup(String(item.id || ''), {
      orderIndex: index + 1
    })))
  }

  const reorderContactCollection = async (
    kind: 'group' | 'crowd',
    draggedIds: string[],
    targetId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    const source = kind === 'group'
      ? sortByOrderIndex(Array.isArray(ctx.charStore.groups) ? ctx.charStore.groups : [])
      : sortByOrderIndex(Array.isArray(ctx.charStore.crowds) ? ctx.charStore.crowds : [])
    const movingSet = new Set(draggedIds)
    const remaining = source.filter((item: any) => !movingSet.has(String(item?.id || '')))
    const dragged = source.filter((item: any) => movingSet.has(String(item?.id || '')))
    const targetIndex = remaining.findIndex((item: any) => String(item?.id || '') === targetId)
    if (!dragged.length || targetIndex < 0) return
    const targetGroupId = String(remaining[targetIndex]?.groupId ?? remaining[targetIndex]?.group_id ?? 'default').trim() || 'default'
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    remaining.splice(insertIndex, 0, ...dragged.map((item: any) => ({
      ...item,
      groupId: targetGroupId,
      group_id: targetGroupId
    })))
    if (kind === 'group') {
      remaining.forEach((item: any, index: number) => {
        item.orderIndex = index + 1
      })
      ctx.charStore.groups = remaining
      syncDraggedGroupToForms('group', draggedIds, targetGroupId)
      await Promise.all(remaining.map((item: any, index: number) => ctx.charStore.updateGroup(String(item.id || ''), {
        orderIndex: index + 1
      })))
    } else {
      remaining.forEach((item: any, index: number) => {
        item.orderIndex = index + 1
      })
      ctx.charStore.crowds = remaining
      syncDraggedGroupToForms('crowd', draggedIds, targetGroupId)
      await Promise.all(remaining.map((item: any, index: number) => ctx.charStore.updateCrowd(String(item.id || ''), {
        orderIndex: index + 1
      })))
    }
  }

  const reorderCharacters = async (
    draggedIds: string[],
    targetId: string,
    position: 'before' | 'after' = 'before'
  ) => {
    const characters = sortByOrderIndex(Array.isArray(ctx.charStore.characters) ? ctx.charStore.characters : [])
    const movingSet = new Set(draggedIds)
    const remaining = characters.filter((item: any) => !movingSet.has(String(item?.id || '')))
    const dragged = characters.filter((item: any) => movingSet.has(String(item?.id || '')))
    const targetIndex = remaining.findIndex((item: any) => String(item?.id || '') === targetId)
    if (!dragged.length || targetIndex < 0) return
    const target = remaining[targetIndex]
    const targetGroupId = String(target?.groupId ?? target?.group_id ?? 'default').trim() || 'default'
    const nextCharacters = [...remaining]
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
    nextCharacters.splice(insertIndex, 0, ...dragged.map((item: any) => ({
      ...item,
      groupId: targetGroupId,
      group_id: targetGroupId
    })))
    nextCharacters.forEach((item: any, index: number) => {
      item.orderIndex = index + 1
      item.groupId = String(item.groupId ?? item.group_id ?? 'default').trim() || 'default'
      item.group_id = item.groupId
    })
    ctx.charStore.characters = nextCharacters
    syncDraggedGroupToForms('char', draggedIds, targetGroupId)
    await Promise.all(nextCharacters.map((item: any, index: number) => ctx.charStore.updateCharacter(String(item.id || ''), {
      groupId: String(item.groupId ?? item.group_id ?? 'default').trim() || 'default',
      orderIndex: index + 1
    })))
  }

  const moveContactsToGroupBottom = async (
    kind: 'char' | 'group' | 'crowd',
    draggedIds: string[],
    targetGroupId: string
  ) => {
    const normalizedGroupId = String(targetGroupId || 'default').trim() || 'default'
    if (kind === 'char') {
      const source = sortByOrderIndex(Array.isArray(ctx.charStore.characters) ? ctx.charStore.characters : [])
      const movingSet = new Set(draggedIds)
      const moving = source.filter((item: any) => movingSet.has(String(item?.id || '')))
      const staying = source.filter((item: any) => !movingSet.has(String(item?.id || '')))
      const before = staying.filter((item: any) => String(item?.groupId ?? item?.group_id ?? 'default').trim() !== normalizedGroupId)
      const sameGroup = staying.filter((item: any) => String(item?.groupId ?? item?.group_id ?? 'default').trim() === normalizedGroupId)
      const next = [
        ...before,
        ...sameGroup,
        ...moving.map((item: any) => ({ ...item, groupId: normalizedGroupId, group_id: normalizedGroupId }))
      ]
      next.forEach((item: any, index: number) => {
        item.orderIndex = index + 1
        item.groupId = String(item.groupId ?? item.group_id ?? 'default').trim() || 'default'
        item.group_id = item.groupId
      })
      ctx.charStore.characters = next
      syncDraggedGroupToForms('char', draggedIds, normalizedGroupId)
      await Promise.all(next.map((item: any, index: number) => ctx.charStore.updateCharacter(String(item.id || ''), {
        groupId: String(item.groupId ?? item.group_id ?? 'default').trim() || 'default',
        orderIndex: index + 1
      })))
      return
    }
    const source = kind === 'group'
      ? sortByOrderIndex(Array.isArray(ctx.charStore.groups) ? ctx.charStore.groups : [])
      : sortByOrderIndex(Array.isArray(ctx.charStore.crowds) ? ctx.charStore.crowds : [])
    const movingSet = new Set(draggedIds)
    const moving = source.filter((item: any) => movingSet.has(String(item?.id || '')))
    const staying = source.filter((item: any) => !movingSet.has(String(item?.id || '')))
    const before = staying.filter((item: any) => String(item?.groupId ?? item?.group_id ?? 'default').trim() !== normalizedGroupId)
    const sameGroup = staying.filter((item: any) => String(item?.groupId ?? item?.group_id ?? 'default').trim() === normalizedGroupId)
    const next = [
      ...before,
      ...sameGroup,
      ...moving.map((item: any) => ({ ...item, groupId: normalizedGroupId, group_id: normalizedGroupId }))
    ]
    next.forEach((item: any, index: number) => {
      item.orderIndex = index + 1
      item.groupId = String(item.groupId ?? item.group_id ?? 'default').trim() || 'default'
      item.group_id = item.groupId
    })
    if (kind === 'group') {
      ctx.charStore.groups = next
      syncDraggedGroupToForms('group', draggedIds, normalizedGroupId)
      await Promise.all(next.map((item: any, index: number) => ctx.charStore.updateGroup(String(item.id || ''), {
        groupId: String(item.groupId ?? item.group_id ?? 'default').trim() || 'default',
        orderIndex: index + 1
      })))
      return
    }
    ctx.charStore.crowds = next
    syncDraggedGroupToForms('crowd', draggedIds, normalizedGroupId)
    await Promise.all(next.map((item: any, index: number) => ctx.charStore.updateCrowd(String(item.id || ''), {
      groupId: String(item.groupId ?? item.group_id ?? 'default').trim() || 'default',
      orderIndex: index + 1
    })))
  }

  const chatActions: ChatPanelActions = {
    getCharactersByGroup: ctx.getCharactersByGroup,
    updateSidebarOpen: (value: boolean) => { ctx.sidebarOpen.value = Boolean(value) },
    toggleGroupCollapse: ctx.toggleGroupCollapse,
    switchChat: ctx.switchChat,
    switchSession,
    loadOlderMessages: (sessionId?: string, beforeId?: number) => ctx.chatStore?.loadOlderMessages?.(sessionId, beforeId),
    openCharGroupManager: (kind = 'char') => {
      ctx.charGroupEditForm.id = ''
      ctx.charGroupEditForm.name = ''
      ctx.charGroupEditForm.kind = kind === 'group' || kind === 'crowd' ? kind : 'char'
      ctx.charGroupEditForm.memberIds = []
      ctx.showCharGroupManager.value = true
    },
    editCharGroup: ({ kind, groupId }) => {
      const normalizedKind = kind === 'group' || kind === 'crowd' ? kind : 'char'
      const normalizedGroupId = String(groupId || '').trim()
      const targetGroup = (Array.isArray(ctx.charStore.characterGroups) ? ctx.charStore.characterGroups : [])
        .find((item: any) => String(item?.id || '').trim() === normalizedGroupId)
      if (!targetGroup || normalizedGroupId === 'default') return
      const resolveEntityGroupId = (item: any) => String(item?.groupId ?? item?.group_id ?? item?.group ?? '').trim()
      const sourceItems = normalizedKind === 'group'
        ? (Array.isArray(ctx.charStore.groups) ? ctx.charStore.groups : [])
        : normalizedKind === 'crowd'
          ? (Array.isArray(ctx.charStore.crowds) ? ctx.charStore.crowds : [])
          : (Array.isArray(ctx.charStore.characters) ? ctx.charStore.characters : [])
      ctx.charGroupEditForm.id = normalizedGroupId
      ctx.charGroupEditForm.name = String(targetGroup?.name || '')
      ctx.charGroupEditForm.kind = normalizedKind
      ctx.charGroupEditForm.memberIds = sourceItems
        .filter((item: any) => resolveEntityGroupId(item) === normalizedGroupId)
        .map((item: any) => String(item?.id || '').trim())
        .filter(Boolean)
      ctx.showCharGroupManager.value = true
    },
    openAddCharacter: (groupId, options) => {
      Object.assign(ctx.newCharForm, {
        name: '',
        emoji: '',
        gender: '',
        age: 0,
        desc: '',
        appearance: '',
        speakingStyle: '',
        personality: '',
        outfit: '',
        hobbies: '',
        abilities: '',
        experience: '',
        worldview: '',
        background: '',
        group: '',
        avatar: '',
        defaultPreset: '',
        defaultModel: '',
        roleTemperature: '',
        roleMaxTokens: '',
        roleThinking: '',
        replyPipelineModeOverride: 'follow_session',
        nicknames: [],
        currentActivities: [],
        locations: [],
        schedule: {},
        yearlySchedule: [],
        relationships: {},
        brainDocuments: {}
      })
      ctx.newCharForm.group = String(groupId || '').trim()
      ctx.showAddCharacter.value = true
      if (options?.collapseSidebar !== false) {
        ctx.sidebarOpen.value = false
      }
    },
    openCreateGroup: (groupId) => {
      ctx.editingGroupId.value = null
      ctx.groupForm.name = ''
      ctx.groupForm.emoji = ''
      ctx.groupForm.avatarPath = ''
      ctx.groupForm.members = []
      ctx.groupForm.groupId = ''
      ctx.groupForm.groupId = String(groupId || '').trim()
      ctx.showCreateGroup.value = true
      ctx.sidebarOpen.value = false
    },
    openCrowdEditor: (groupId) => {
      ctx.editingCrowdId.value = null
      ctx.crowdForm.name = ''
      ctx.crowdForm.emoji = ''
      ctx.crowdForm.nickname = ''
      ctx.crowdForm.members = []
      ctx.crowdForm.locations = ''
      ctx.crowdForm.apiPreset = ''
      ctx.crowdForm.groupId = ''
      ctx.crowdForm.groupId = String(groupId || '').trim()
      ctx.showCrowdEditor.value = true
      ctx.sidebarOpen.value = false
    },
    openUserEditor: () => { ctx.showUserEditor.value = true; ctx.sidebarOpen.value = false },
    saveWorkspaceData: async () => {
      try {
        const response = await fetch(API.SAVE_WORKSPACE, { method: 'POST' })
        if (!response.ok) throw new Error(await response.text())
        ctx.toast('全部数据已保存', 'success')
      } catch (error) {
        console.error('保存全部数据失败:', error)
        ctx.toast('保存失败，请稍后再试', 'error')
        throw error
      }
    },
    openChatHistory: async () => {
      await ctx.chatStore.loadChatArchives?.()
      ctx.showConversationManager.value = true
      ctx.sidebarOpen.value = false
    },
    openChatSessionCreator: () => {
      if (typeof ctx.openChatSessionCreator === 'function') {
        ctx.openChatSessionCreator()
      }
    },
    renameChatSession: async (sessionId, title) => {
      const normalizedSessionId = String(sessionId || '').trim()
      const nextTitle = sanitizeChatSessionTitle(title)
      if (!normalizedSessionId || !nextTitle) return
      await ctx.chatStore.renameSession?.(normalizedSessionId, nextTitle)
      ctx.toast?.('会话已重命名', 'success')
    },
    deleteChatSession: async (sessionId) => {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!normalizedSessionId) return
      runConfirmedAction(ctx, {
        title: '删除会话',
        message: '删除后会同步清理这条会话的消息和提示词日志，不能恢复。',
        confirmText: '删除',
        onConfirm: async () => {
          await ctx.chatStore.deleteSession?.(normalizedSessionId)
          ctx.toast?.('会话已删除', 'success')
        }
      })
    },
    deleteChatSessions: async (sessionIds) => {
      const ids = (Array.isArray(sessionIds) ? sessionIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
      if (!ids.length) return
      if (ids.length === 1) {
        await chatActions.deleteChatSession?.(ids[0])
        return
      }
      runConfirmedAction(ctx, {
        title: '删除会话',
        message: `将删除选中的 ${ids.length} 条会话，并同步清理它们的消息和提示词日志，不能恢复。`,
        confirmText: '删除',
        onConfirm: async () => {
          await ctx.chatStore.deleteSessions?.(ids)
          ctx.toast?.(`已删除 ${ids.length} 条会话`, 'success')
        }
      })
    },
    archiveChatSession: async (sessionId) => {
      const normalizedSessionId = String(sessionId || '').trim()
      if (!normalizedSessionId) return
      await ctx.chatStore.archiveSession?.(normalizedSessionId)
      ctx.toast?.('会话已归档', 'success')
    },
    toggleDarkMode: () => { ctx.settingStore.toggleDarkMode() },
    editGroup: ctx.editGroup,
    editCrowd: ctx.editCrowd,
    openContactSort: () => {
      ctx.showCharGroupManager.value = true
    },
    reorderContacts: async (payload) => {
      pushContactHistory()
      const items = normalizeContactItems(payload?.items)
      const targetKind = String(payload?.target?.kind || '') as 'char' | 'group' | 'crowd'
      const targetId = String(payload?.target?.id || '').trim()
      const targetGroupId = String(payload?.targetGroupId || '').trim()
      const position = payload?.position === 'after' ? 'after' : 'before'
      if (!items.length) return
      const kinds = new Set(items.map((item) => item.kind))
      if (kinds.size !== 1) return
      const onlyKind = items[0].kind
      if (targetGroupId) {
        await moveContactsToGroupBottom(onlyKind, items.map((item) => item.id), targetGroupId)
        return
      }
      if (!targetId || onlyKind !== targetKind) return
      if (onlyKind === 'char') {
        await reorderCharacters(items.map((item) => item.id), targetId, position)
        return
      }
      if (onlyKind === 'group' || onlyKind === 'crowd') {
        await reorderContactCollection(onlyKind, items.map((item) => item.id), targetId, position)
      }
    },
    createGroupFromContacts: async (items) => {
      const normalizedItems = normalizeContactItems(items)
      const charIds = normalizedItems.filter((item) => item.kind === 'char').map((item) => item.id)
      if (!charIds.length || charIds.length !== normalizedItems.length) return
      const characters = (Array.isArray(ctx.charStore.characters) ? ctx.charStore.characters : [])
        .filter((item: any) => charIds.includes(String(item?.id || '')))
      const sessionName = characters.map((item: any) => String(item?.name || '').trim()).filter(Boolean).slice(0, 2).join('、') || '新会话'
      const bundle = await createChatSession({
        targetId: charIds[0],
        targetType: 'char',
        // 默认标题人数=角色+用户本人（与 useCharacterManagement.buildDefaultSessionTitle 同口径·联动能力）。
        title: characters.length > 2 ? `${sessionName}等${characters.length + 1}人` : sessionName,
        participants: charIds.map((id, index) => ({
          targetId: id,
          targetType: 'char',
          displayName: String(characters.find((item: any) => String(item?.id || '') === id)?.name || id),
          displayOrder: index,
          role: 'member',
          probability: 100
        }))
      })
      const sessionId = String(bundle?.session?.id || '').trim()
      if (sessionId) await ctx.chatStore.switchSession?.(sessionId)
      ctx.toast?.('会话已创建', 'success')
    },
    deleteCharGroup: async (groupId) => {
      const safeGroupId = String(groupId || '').trim()
      const group = (Array.isArray(ctx.charStore.characterGroups) ? ctx.charStore.characterGroups : [])
        .find((item: any) => String(item?.id || '').trim() === safeGroupId)
      if (!group || safeGroupId === 'default') return
      runConfirmedAction(ctx, {
        title: '确认删除分组',
        message: `删除分组“${String(group.name || '未命名分组')}”后，原成员会回到默认分组。确定继续吗？`,
        confirmText: '删除',
        onConfirm: async () => {
          pushContactHistory()
          await ctx.charStore.deleteCharGroup(safeGroupId)
        }
      })
    },
    reorderCharacterGroups: async (payload) => {
      const draggedIds = Array.isArray(payload?.draggedIds)
        ? payload.draggedIds.map((item) => String(item || '').trim()).filter(Boolean)
        : []
      const targetId = String(payload?.targetId || '').trim()
      if (!draggedIds.length || !targetId) return
      pushContactHistory()
      await reorderCharacterGroups(draggedIds, targetId, payload?.position === 'after' ? 'after' : 'before')
    },
    undoContactOps: async () => {
      const previous = contactUndoStack.value[contactUndoStack.value.length - 1]
      if (!previous) return
      contactUndoStack.value = contactUndoStack.value.slice(0, -1)
      contactRedoStack.value = [...contactRedoStack.value, cloneContactSnapshot()]
      applyContactSnapshot(previous)
    },
    redoContactOps: async () => {
      const next = contactRedoStack.value[contactRedoStack.value.length - 1]
      if (!next) return
      contactRedoStack.value = contactRedoStack.value.slice(0, -1)
      contactUndoStack.value = [...contactUndoStack.value, cloneContactSnapshot()]
      applyContactSnapshot(next)
    },
    deleteContacts: async (items) => {
      const normalizedItems = normalizeContactItems(items)
      if (!normalizedItems.length) return
      const label = normalizedItems.length > 1 ? `这 ${normalizedItems.length} 个组别元素` : '这个组别元素'
      runConfirmedAction(ctx, {
        title: '确认删除',
        message: `确定删除${label}吗？`,
        confirmText: '删除',
        onConfirm: async () => {
          pushContactHistory()
          const deletingCurrentTarget = normalizedItems.some((item) => item.id === String(ctx.chatStore?.currentTarget || ctx.currentTarget?.value || ''))
          await ctx.charStore.deleteContactsBatch(normalizedItems)

          if (deletingCurrentTarget) {
            await ctx.switchChat('')
          }
        }
      })
    },
    importCharacterCoreMarkdown: async (payload) => {
      const characterId = String(payload?.characterId || '').trim()
      const changes = payload?.changes && typeof payload.changes === 'object' ? payload.changes : null
      if (!characterId || !changes) return
      const current = ctx.charStore.characters.find((item: any) => String(item?.id || '').trim() === characterId)
      if (!current) {
        ctx.toast?.('未找到角色，无法导入 Markdown', 'error')
        return
      }
      if (changes.brainDocuments && typeof changes.brainDocuments === 'object' && !Array.isArray(changes.brainDocuments)) {
        const currentDocuments = current.brainDocuments && typeof current.brainDocuments === 'object' && !Array.isArray(current.brainDocuments)
          ? current.brainDocuments
          : (() => {
              try {
                const parsed = JSON.parse(String(current.brain_documents || '{}'))
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
              } catch {
                return {}
              }
            })()
        changes.brainDocuments = { ...currentDocuments, ...changes.brainDocuments }
        changes.brain_documents = JSON.stringify(changes.brainDocuments)
      }
      pushContactHistory()
      await ctx.charStore.updateCharacter(characterId, changes as any)
      ctx.toast?.(`角色 Markdown 已导入：${String((changes as any).name || current.name || '角色')}`, 'success')
    },
    transferChat: ctx.transferCurrentChat,
    openCharacterEditor: (char?: any) => {
      openCharacterSettings({ char })
    },
    openCurtainPanel: ctx.openCurtainPanel,
    // 帷幕场景设置 / 马甲选择直达入口（移动端帷幕抽屉使用，弹窗与写入复用桌面同一套）
    openSceneEditor: ctx.openSceneEditor,
    openAliasSelector: ctx.openAliasSelector,
    openPromptLogPanel: (messageId?: number) => {
      ctx.openPromptLogPanel(messageId)
      setRefValue(ctx.showSessionTemporaryCharactersPanel, false)
      setRecallActivitySidebarOpen(false)
    },
    closePromptLogPanel: () => {
      setRefValue(ctx.showPromptLogPanel, false)
      setRefValue(ctx.promptLogFocusMessageId, 0)
    },
    updateDynamicWorldEnabled: async (enabled: boolean) => {
      const session = getChatStoreCurrentSession(ctx.chatStore)
      const sessionId = getChatStoreActiveSessionId(ctx.chatStore) || String(session?.id || '').trim()
      if (!sessionId || typeof ctx.chatStore?.updateSession !== 'function') return
      await ctx.chatStore.updateSession(sessionId, {
        dynamicWorldEnabled: Boolean(enabled),
        dynamic_world_enabled: Boolean(enabled) ? 1 : 0
      })
    },
    openSessionTemporaryCharactersPanel: () => {
      setRefValue(ctx.showSessionTemporaryCharactersPanel, true)
      setRefValue(ctx.showPromptLogPanel, false)
      setRecallActivitySidebarOpen(false)
    },
    closeSessionTemporaryCharactersPanel: () => {
      setRefValue(ctx.showSessionTemporaryCharactersPanel, false)
    },
    openRecallActivityPanel: () => setRecallActivitySidebarOpen(true),
    unloadSummary: (summaryId: string) => { if (summaryId) ctx.chatStore.unloadSummary(summaryId) },
    openCharSettings: (charNameOrId: string) => {
      openCharacterSettings({ nameOrId: charNameOrId })
    },
    openFullscreenImage: (image: string) => { ctx.fullscreenImage.value = image },
    updateEditingMessageContent: (value: string) => { ctx.editingMessageContent.value = value },
    cancelEditMessage: ctx.cancelEditMessage,
    saveEditMessage: ctx.saveEditMessage,
    saveAndRegenerate: ctx.saveAndRegenerate,
    // 批次5b：导演模式纠偏继续/取消/输入。
    updateCorrectionText: ctx.updateCorrectionText,
    continueCorrection: ctx.continueCorrection,
    cancelCorrection: ctx.cancelCorrection,
    startEditMessage: ctx.startEditMessage,
    deleteMessage: ctx.deleteMessage,
    regenerateMessage: ctx.regenerateMsg,
    applyDirectorPrecisionEdits: ctx.applyDirectorPrecisionEdits,
    selectMessageVersion: (index: number, nextIndex: number) => ctx.selectMessageVersion(index, nextIndex),
    copyMessage: ctx.copyMessage,
    toggleMessagePromptVisibility: ctx.toggleMessagePromptVisibility,
    togglePlusMenu: ctx.togglePlusMenu,
    clearCurrentChat: ctx.clearCurrentChat,
    requestClearCurrentChatContext: ctx.requestClearCurrentChatContext,
    addMentionChar: ctx.addMentionChar,
    removeMentionChar: ctx.removeMentionChar,
    toggleExcludeChar: ctx.toggleExcludeChar,
    sendChat: ctx.commandSendChat,
    triggerManualNarration: (options?: { kind?: 'environment' | 'appearance' | 'event_push'; profileId?: string; candidateBatchId?: string; candidateId?: string }) => triggerManualNarration(ctx, options || {}),
    abortChat: ctx.abortChat,
    openChatSummary: () => { void summarizeChatToTrace(ctx) },
    toggleEvaluation: () => toggleEvaluation(ctx),
    inputChatText: ctx.onInputChatText,
    // 图片附件（批4）：与 chatInputText 同层同源，Ref 上直接持有函数（ctx.xxx 已是函数本体，非需要 .value 的 Ref）。
    handleImageAttachmentPaste: (event: ClipboardEvent) => Boolean(ctx.handleImageAttachmentPaste?.(event)),
    handleImageAttachmentDrop: (event: DragEvent) => { ctx.handleImageAttachmentDrop?.(event) },
    handleImageAttachmentDragOver: (event: DragEvent) => { ctx.handleImageAttachmentDragOver?.(event) },
    removeImageAttachment: (id: string) => { ctx.removeImageAttachment?.(id) },
    retryImageAttachmentUpload: (id: string) => { ctx.retryImageAttachmentUpload?.(id) },
    setMenuContainerRef: ctx.setMenuContainerRef,
    setChatInputRef: ctx.setChatInputRef,
    updatePlusMenuOpen: (value: boolean) => { ctx.plusMenuOpen.value = Boolean(value) },
    updateAtMenuOpen: (value: boolean) => { ctx.atMenuOpen.value = Boolean(value) },
    clearMentionSelected: () => { ctx.mentionSelectedChars.value = [] }
  }

  return {
    chatViewModel: computed<ChatPanelViewModel>(() => ({
      sidebarOpen: Boolean(ctx.sidebarOpen.value),
      collapsedGroups: ctx.collapsedGroups,
      ungroupedCharacters: ctx.ungroupedCharacters.value,
      characters: ctx.charStore.characters,
      characterGroups: ctx.charStore.characterGroups,
      groups: ctx.charStore.groups,
      crowds: ctx.charStore.crowds,
      chatSessionRows: buildChatSessionRows(ctx),
      activeSessionId: String(ctx.chatPanelViewModel.value.activeChatSessionId || getChatStoreActiveSessionId(ctx.chatStore) || ''),
      userProfile: ctx.charStore.userProfile || {},
      currentTarget: ctx.chatPanelViewModel.value.activeChatTargetId,
      currentChatTitle: ctx.currentChatTitle.value,
      loadedSummaryCount: Number(ctx.loadedSummaryCount.value || 0),
      loadedSummaryItems: ctx.loadedSummaryItems.value,
      isBootLoading: Boolean(ctx.isBootLoading.value),
      isTyping: getChatStoreTyping(ctx.chatStore),
      hasForegroundChatTask: Boolean(readMaybeRef(ctx.workspaceRuntimeStore?.foregroundChatTaskRun)),
      foregroundChatTaskLabel: String((readMaybeRef<any>(ctx.workspaceRuntimeStore?.foregroundChatTaskRun)?.label || '')).trim(),
      runningChatTaskCount: Array.isArray(readMaybeRef<any[]>(ctx.workspaceRuntimeStore?.runningChatTaskRuns))
        ? readMaybeRef<any[]>(ctx.workspaceRuntimeStore?.runningChatTaskRuns)?.length || 0
        : 0,
      currentCharacter: ctx.currentCharacter.value,
      currentSession: getChatStoreCurrentSession(ctx.chatStore),
      currentScene: ctx.currentScene.value,
      currentAlias: ctx.currentAlias.value,
      currentMessages: ctx.chatPanelViewModel.value.displayMessages,
      hasOlderMessages: Boolean(getChatStoreCurrentSession(ctx.chatStore)?._hasOlderMessages),
      loadingOlderMessages: Boolean(getChatStoreCurrentSession(ctx.chatStore)?._loadingOlderMessages),
      // 会话切换乐观跳转（2026-07-11）：正在切换中即渲染消息区骨架屏（旧消息不清空，由骨架分支纯遮罩）。
      isSessionSwitching: Boolean(getChatStoreSessionSwitchLoadingId(ctx.chatStore)),
      editingMessageIndex: ctx.editingMessageIndex.value,
      editingMessageContent: ctx.editingMessageContent.value,
      regeneratingMessageIndex: ctx.regeneratingMessageIndex.value,
      currentCharacterAvatar: ctx.currentCharacterAvatar.value,
      streamingText: ctx.streamingText.value,
      currentStreamingSpeakerName: ctx.currentStreamingSpeakerName.value,
      currentStreamingTargetId: ctx.currentStreamingTargetId.value,
      environmentNarrationLoading: Boolean(ctx.environmentNarrationLoading?.value),
      plannedGroupSpeakers: ctx.plannedGroupSpeakers.value,
      plusMenuOpen: Boolean(ctx.plusMenuOpen.value),
      atMenuOpen: Boolean(ctx.atMenuOpen.value),
      chatInputText: String(ctx.chatInputText.value || ''),
      pendingImageAttachments: Array.isArray(ctx.pendingImageAttachments?.value) ? ctx.pendingImageAttachments.value : [],
      mentionSelectedChars: ctx.mentionSelectedChars.value,
      mentionExcludedChars: ctx.mentionExcludedChars.value,
      filteredAtCharacters: ctx.filteredAtCharacters.value,
      evaluationEnabled: Boolean(ctx.settingsPanelViewModel.value?.aiEvaluationEnabled),
      recallActivityVisible: Boolean(recallTraceState.activity.value),
      recallActivityStatus: recallTraceState.activity.value?.status || 'idle',
      recallActivityLabel: readRecallActivityLabel(recallTraceState.activity.value?.status),
      promptLogPanelOpen: Boolean(ctx.showPromptLogPanel?.value),
      promptLogFocusMessageId: Number(ctx.promptLogFocusMessageId?.value || 0),
      chatSummaryWriting: Boolean(ctx.chatSummaryWriting?.value),
      chatSummaryWritingText: String(ctx.chatSummaryWritingText?.value || ''),
      sessionTemporaryCharactersPanelOpen: Boolean(ctx.showSessionTemporaryCharactersPanel?.value),
      darkMode: Boolean(ctx.settingsPanelViewModel.value?.isDarkMode)
    })),
    chatActions
  }
}

export function buildTransactionBridge(ctx: any) {
  const transactionPanelViewModel = computed<TransactionPanelViewModel>(() => ({
    operations: Array.isArray(ctx.runtimeTransactions.value) ? ctx.runtimeTransactions.value : [],
    isExecuting: Boolean(ctx.transactionExecuting.value),
    hasTaskTimeline: typeof ctx.hasTaskTimeline === 'function' ? ctx.hasTaskTimeline : () => false,
    getTaskTimelineNodes: typeof ctx.getTaskTimelineNodes === 'function' ? ctx.getTaskTimelineNodes : () => [],
    formatTimerTime: typeof ctx.formatTimerTime === 'function' ? ctx.formatTimerTime : () => '',
    getTaskElapsedTime: typeof ctx.getTaskElapsedTime === 'function' ? ctx.getTaskElapsedTime : () => 0
  }))
  const transactionPanelActions: TransactionPanelActions = {
    clear: ctx.commandClearTransactions,
    confirm: ctx.commandConfirmTransactions,
    confirmOne: ctx.commandConfirmTransactionAt,
    remove: ctx.commandRemoveTransactionAt,
    clearTransactions: ctx.commandClearTransactions,
    confirmTransactions: ctx.commandConfirmTransactions,
    confirmTransaction: ctx.commandConfirmTransactionAt,
    removeTransaction: ctx.commandRemoveTransactionAt
  }

  return {
    transactionPanelViewModel,
    transactionPanelActions
  }
}

export function buildTaskBridge(ctx: any) {
  const taskPanelActions: TaskPanelActions = {
    dispatchAiTask: ctx.commandDispatchAiTask,
    updateExpandedTaskId: (value: string | null) => { ctx.expandedTaskId.value = value },
    updateTaskAssignerChar: (value: string) => { ctx.taskAssignerChar.value = value },
    updateTaskLoadContact: (value: string) => { ctx.taskLoadContact.value = value },
    startTask: ctx.commandStartTaskTimer,
    pauseTask: ctx.commandPauseTaskTimer,
    resetTask: ctx.commandResetTaskTimer,
    updateCustomMarkType: (value: string) => { ctx.customMarkType.value = value || '' },
    updateCustomMarkNote: (value: string) => { ctx.customMarkNote.value = value || '' },
    addTaskMark: ctx.commandAddTaskMark,
    openTagManager: () => { ctx.showTagManager.value = true },
    useCustomTag: ctx.useCustomTag,
    quickMark: ({ type, taskId }: { type: string; taskId: string }) => {
      ctx.customMarkType.value = type || ''
      ctx.commandAddTaskMark(taskId)
    },
    completeTask: ctx.commandCompleteTaskWithPause,
    failTask: ctx.commandQueueTaskFailure,
    deleteTask: ctx.commandDeleteTask,
    updateCurrentTaskTab: (value: TaskPanelTab) => { ctx.currentTaskTab.value = value || 'all' },
    updateNewTaskName: (value: string) => { ctx.newTaskName.value = value || '' },
    updateNewTaskDesc: (value: string) => { ctx.newTaskDesc.value = value || '' },
    updateNewTaskReward: (value: string) => { ctx.newTaskReward.value = value || '' },
    updateNewTaskCategory: (value: string) => { ctx.newTaskCategory.value = value || '' },
    updateNewTaskBonus: (value: string) => { ctx.newTaskBonus.value = value || '' },
    addCustomTask: ctx.commandAddCustomTask
  }
  return {
    taskPanelViewModel: computed<TaskPanelViewModel>(() => ({
      sections: ctx.sections,
      userLevel: ctx.taskPanelMeta.value.userLevel,
      dailyActivity: ctx.taskPanelMeta.value.dailyActivity,
      recentMarkTypes: ctx.taskPanelMeta.value.recentMarkTypes,
      assignerOptions: ctx.charStore.characters,
      loadContactCharacters: ctx.charStore.characters,
      loadContactGroups: ctx.charStore.groups,
      filteredTasks: ctx.filteredTasks.value,
      hasTaskTimeline: ctx.hasTaskTimeline,
      getTaskTimelineNodes: ctx.getTaskTimelineNodes,
      formatTimerTime: ctx.taskStore.formatTimerTime,
      getTaskElapsedTime: ctx.taskStore.getTaskElapsedTime,
      isTaskExpired: ctx.taskStore.isTaskExpired,
      formatResetTime: ctx.taskStore.formatResetTime,
      updateTask: ctx.taskStore.updateTask,
      isRequestingTask: ctx.isRequestingTask.value,
      expandedTaskId: ctx.expandedTaskId.value,
      customMarkType: ctx.customMarkType.value,
      customMarkNote: ctx.customMarkNote.value,
      customTags: ctx.customTags.value,
      currentTaskTab: ctx.currentTaskTab.value,
      newTaskName: ctx.newTaskName.value,
      newTaskDesc: ctx.newTaskDesc.value,
      newTaskReward: ctx.newTaskReward.value,
      newTaskCategory: ctx.newTaskCategory.value,
      newTaskBonus: ctx.newTaskBonus.value,
      taskAssignerChar: ctx.taskAssignerChar.value,
      taskLoadContact: ctx.taskLoadContact.value
    })),
    taskPanelActions
  }
}

export function buildLocalArchiveSyncBridge(ctx: any) {
  const localArchiveSyncPanelActions: LocalArchiveSyncPanelActions = {
    updateLocalArchiveLabel: (value: string) => { ctx.localArchiveLabel.value = String(value || '') },
    updateLocalArchiveNote: (value: string) => { ctx.localArchiveNote.value = String(value || '') },
    updateSelectedSyncModules: ctx.setSelectedSyncModules,
    refreshLocalArchiveSaves: () => (ctx.localArchiveCommands?.archive?.loadSaves || ctx.loadLocalArchiveSaves)(),
    selectLocalArchiveSlot: (name: string) => (ctx.localArchiveCommands?.archive?.selectSave || ctx.selectLocalArchiveSave)(name),
    openLocalArchive: () => (ctx.localArchiveCommands?.availability?.open || ctx.openLocalArchive)(),
    initializeLocalArchive: () => (ctx.localArchiveCommands?.availability?.initialize || ctx.initializeLocalArchive)(),
    localArchiveUpload: (payload?: { name?: string; modules?: LocalArchiveModuleName[] }) => (ctx.localArchiveCommands?.archive?.upload || ctx.commandLocalArchiveUpload)(payload?.name, payload?.modules),
    localArchiveDownload: (payload?: { name?: string; modules?: LocalArchiveModuleName[] }) => (ctx.localArchiveCommands?.archive?.download || ctx.commandLocalArchiveDownload)(payload?.name, payload?.modules),
    createLocalArchiveSave: (payload: { name: string; note: string; modules?: LocalArchiveModuleName[] }) => (ctx.localArchiveCommands?.archive?.createSave || ctx.commandCreateLocalArchiveSave)(payload.name, payload.note, payload.modules),
    updateLocalArchiveSaveNote: (payload: { name: string; note: string }) => (ctx.localArchiveCommands?.archive?.updateSaveNote || ctx.commandUpdateLocalArchiveSaveNote)(payload.name, payload.note),
    renameLocalArchiveSave: (payload: { oldName: string; nextName: string }) => (ctx.localArchiveCommands?.archive?.renameSave || ctx.commandRenameLocalArchiveSave)(payload.oldName, payload.nextName),
    deleteLocalArchiveSave: (name: string) => runConfirmedAction(ctx, {
      title: '删除本机存档',
      message: `确定删除本机存档「${name}」吗？删除后本机服务对应分片也会一起移除。`,
      confirmText: '删除',
      onConfirm: () => (ctx.localArchiveCommands?.archive?.deleteSave || ctx.commandDeleteLocalArchiveSave)(name)
    }),
    closeLocalArchive: ctx.closeLocalArchive
  }
  return {
    localArchiveSyncPanelViewModel: computed<LocalArchiveSyncPanelViewModel>(() => ({
      sections: ctx.sections,
      localArchiveAvailable: ctx.localArchiveAvailable.value,
      localArchiveName: ctx.localArchiveName.value,
      localArchiveLabel: ctx.localArchiveLabel.value,
      localArchiveNote: ctx.localArchiveNote.value,
      localArchiveSaves: ctx.localArchiveSaves.value,
      selectedLocalArchiveSlot: ctx.selectedLocalArchiveSlot.value,
      selectedSyncModules: ctx.selectedSyncModules.value,
      localArchiveModuleDefinitions: ctx.localArchiveModuleDefinitions.value,
      localArchiveActionState: ctx.localArchiveActionState.value,
      isSyncing: Boolean(ctx.localArchiveSync?.isSyncing?.value),
      isRestoringArchive: Boolean(ctx.localArchiveSync?.isRestoringArchive?.value),
      error: String(ctx.localArchiveSync?.error?.value || '')
    })),
    localArchiveSyncPanelActions
  }
}

export function buildResourceBridge(ctx: any) {
  const addTransaction = (
    ctx.addTransaction
    || ctx.commandAddTransaction
    || ctx.transactionActions?.addTransaction
  )

  return {
    resourcePanelViewModel: computed(() => ({
      points: ctx.resourceStore.points,
      money: Number(ctx.resourceStore.money || 0),
      bigTime: ctx.resourceStore.bigTimeCount,
      smallTime: ctx.resourceStore.smallTimeCount,
      goldTickets: ctx.getGoldTicketCount(),
      canExchangePoints: ctx.resourceStore.bigTimeCount > 0 || ctx.resourceStore.smallTimeCount > 0
    })),
    resourcePanelActions: {
      addBigTime: () => addTransaction?.('兑换大时间块', '+1大时间块', { type: 'bigTime' }),
      addSmallTime: () => addTransaction?.('兑换小时间块', '+1小时间块', { type: 'smallTime' }),
      exchangePoints: () => addTransaction?.(
        '兑换点数',
        `${ctx.resourceStore.bigTimeCount}大 ${ctx.resourceStore.smallTimeCount}小 = ${ctx.resourceStore.bigTimeCount * 10 + ctx.resourceStore.smallTimeCount * 2}点`,
        { type: 'convertPoints' }
      ),
      spendMoney: () => { ctx.showSpendMoney.value = true }
    }
  }
}

export function buildTicketBridge(ctx: any) {
  return {
    ticketPanelViewModel: computed(() => ({
      sections: ctx.sections,
      categories: ctx.resourceStore.categories,
      points: ctx.resourceStore.points,
      filteredTickets: ctx.filteredTickets.value,
      currentTicketCategory: ctx.currentTicketCategory.value,
      getTicketTimers: (ticketId: string) => {
        const list = ctx.timerComposable?.getTicketTimers?.(ticketId)
        return Array.isArray(list) ? list : []
      },
      getTicketTimerCount: (ticketId: string) => Number(ctx.timerComposable?.getTicketTimerCount?.(ticketId) || 0),
      formatRemaining: (remainingMs: number) => ctx.timerComposable?.formatRemaining?.(remainingMs) || '0秒'
    })),
    ticketPanelActions: {
      updateCurrentTicketCategory: (value: string) => { ctx.currentTicketCategory.value = value || '全部' },
      openCategoryEditor: ctx.openCategoryEditor,
      openBatchExchange: (ticket: any) => {
        ctx.batchTicket.value = ticket
        ctx.batchAmount.value = 1
        ctx.showBatchExchange.value = true
      },
      openBatchUse: (ticket: any) => {
        ctx.batchTicket.value = ticket
        ctx.batchAmount.value = 1
        ctx.showBatchUse.value = true
      },
      editTicket: ctx.openEditTicket,
      openAddTicket: () => { ctx.showAddTicket.value = true },
      pauseTicketTimer: (timerId: string) => ctx.timerComposable?.pauseTimer?.(timerId),
      resumeTicketTimer: (timerId: string) => ctx.timerComposable?.resumeTimer?.(timerId)
    }
  }
}

export function buildApiConfigBridge(ctx: any) {
  return {
    apiConfigPanelViewModel: computed(() => ({
      sections: ctx.sections,
      apiPresets: ctx.settingStore.apiPresets,
      apiProviderTemplates: AI_PROVIDER_TEMPLATES.map((item) => ({ id: item.type, name: item.label })),
      defaultPresetName: ctx.settingsPanelViewModel.value?.defaultPresetName || ctx.settingStore.defaultPreset?.name || '',
      aiProviderMode: ctx.settingStore.aiProviderMode,
      apiPresetCount: ctx.settingsPanelViewModel.value?.apiPresetCount || ctx.settingStore.apiPresets.length,
      currentApiPresetIndex: ctx.currentApiPresetIndex.value,
      apiPresetForm: ctx.apiPresetForm,
      showEditApiPreset: ctx.showEditApiPreset.value,
      isLoadingModels: ctx.isLoadingModels.value,
      isTestingApi: ctx.isTestingApi.value,
      modelList: ctx.modelList.value,
      weatherApiKey: ctx.weatherApiKey.value,
      weatherApiDomain: ctx.weatherApiDomain.value,
      agentModelConfigs: ctx.settingStore.agentModelConfigs
    })),
    apiConfigPanelActions: {
      loadApiPreset: ctx.loadApiPreset,
      addNewApiPreset: ctx.addNewApiPreset,
      setAiProviderMode: (mode: 'custom' | 'langhuan') => ctx.settingStore.setAiProviderMode(mode),
      updateApiPresetForm: (payload: ApiPresetFormUpdatePayload) => {
        assignApiPresetFormField(ctx.apiPresetForm, payload)
      },
      applyProviderTemplate: ctx.applyProviderTemplate,
      loadModels: ctx.loadModels,
      saveApiPreset: ctx.commandSaveApiPreset,
      setDefaultPreset: (name: string) => ctx.settingStore.setDefaultPreset(name),
      deleteCurrentApiPreset: () => {
        ctx.settingStore.deleteApiPreset(ctx.apiPresetForm.originalName || ctx.apiPresetForm.name)
        ctx.loadApiPreset(0)
      },
      testApiConnection: ctx.testApiConnection,
      updateWeatherApiKey: (value: string) => { ctx.weatherApiKey.value = value || '' },
      updateWeatherApiDomain: (value: string) => { ctx.weatherApiDomain.value = value || '' },
      saveWeatherApiConfig: ctx.commandSaveWeatherApiConfig,
      updateAgentModelConfig: ({ id, changes }: { id: string; changes: Record<string, unknown> }) => {
        ctx.settingStore.updateAgentModelConfig(id, changes)
      },
      saveAgentModelConfig: async () => {
        try {
          await ctx.settingStore.saveAgentModelConfigs()
          ctx.toast?.('Agent配置已保存', 'success')
        } catch (err) {
          ctx.toast?.(`Agent配置保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
        }
      }
    }
  }
}

export function buildPresetManagerBridge(ctx: any) {
  return {
    presetManagerPanelViewModel: computed(() => ({
      sections: ctx.sections,
      presetSceneFilter: ctx.presetSceneFilter.value,
      filteredPresets: ctx.filteredPresets.value,
      getOriginalIndex: ctx.getOriginalIndex,
      isLockedPreset: (preset: any) => Boolean(ctx.settingStore?.isLockedPromptPresetId?.(String(preset?.id || '')))
    })),
    presetManagerPanelActions: {
      updatePresetSceneFilter: (value: string) => { ctx.presetSceneFilter.value = value || '' },
      showPresetVars: () => { ctx.showPresetVars.value = true },
      resetPresetToDefault: ctx.resetPresetToDefault,
      exportPromptPresets: () => ctx.settingStore.exportPromptPresets(),
      importPromptPresetsFromFile: (file: File) => ctx.settingStore.importPromptPresetsFromFile(file),
      dragPresetStart: ({ index, event }: PromptPresetDragPayload) => ctx.dragPresetStart(index, event),
      dragPresetDrop: ctx.dragPresetDrop,
      reorderPromptPresets: async ({ draggedIndexes, targetIndex, position }: PromptPresetReorderPayload) => {
        const source = Array.isArray(ctx.settingStore.promptPresets) ? [...ctx.settingStore.promptPresets] : []
        const movingIndexSet = new Set(
          (Array.isArray(draggedIndexes) ? draggedIndexes : [])
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item >= 0 && item < source.length)
        )
        const safeTargetIndex = Number(targetIndex)
        if (!movingIndexSet.size || !Number.isInteger(safeTargetIndex) || safeTargetIndex < 0 || safeTargetIndex >= source.length) return
        if (movingIndexSet.has(safeTargetIndex)) return
        const moving = source.filter((_item, index) => movingIndexSet.has(index))
        const remaining = source.filter((_item, index) => !movingIndexSet.has(index))
        const target = source[safeTargetIndex]
        const targetIndexInRemaining = remaining.indexOf(target)
        if (!moving.length || targetIndexInRemaining < 0) return
        const insertIndex = position === 'after' ? targetIndexInRemaining + 1 : targetIndexInRemaining
        remaining.splice(insertIndex, 0, ...moving)
        remaining.forEach((item: any, index: number) => {
          item.orderIndex = index
        })
        ctx.settingStore.promptPresets = remaining
        await ctx.settingStore.savePromptPresetOrder()
      },
      editPromptPreset: ctx.editPromptPreset,
      togglePresetEnabled: ctx.togglePromptPresetEnabled,
      deletePromptPreset: (index: number) => { ctx.settingStore.deletePromptPreset(index) },
      addPromptPreset: ctx.addPromptPreset
    }
  }
}

export function buildDataManageBridge(ctx: any) {
  return {
    dataManagePanelViewModel: computed(() => ({
      sections: ctx.sections
    })),
    dataManagePanelActions: {
      exportData: () => (ctx.localArchiveCommands?.data?.exportAll || ctx.exportAllData)(),
      importData: () => { ctx.importFileInput.value?.click() },
      resetData: () => runConfirmedAction(ctx, {
        title: '重置全部数据',
        message: '确定要重置全部数据吗？此操作会清空当前工作区内容，并立即刷新页面。',
        confirmText: '确认重置',
        onConfirm: () => (ctx.localArchiveCommands?.data?.resetAll || ctx.commandResetAllData)()
      })
    }
  }
}
