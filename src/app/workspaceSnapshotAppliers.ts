import { normalizeSettingsServerPayload } from '../repositories/settingRepository'
import { applyResolvedDocBrainState, resolveDocBrainState } from '../repositories/docBrainRepository'
import { applyResolvedCharacterState, resolveCharacterState } from '../repositories/characterRepository'
import { buildChatDisplayMessages, resolveChatSessionByTargetId } from './chatCurrentState'
import { createChatSnapshotApplier } from './chatSnapshotApplier'
import {
  normalizeChatMessageForTarget,
  normalizeChatSession,
  normalizeChatTargetId,
  resolveChatSessionTargetId
} from '../repositories/chatRepository'
import type { WorkspaceSnapshotV1 } from '../types/workspace'
import type { ChatMessage, UserProfile, Task } from '../types'

type WorkspaceDomainPartition = Partial<WorkspaceSnapshotV1>
type UnknownRecord = Record<string, unknown>
type WorkspaceCharacter = UnknownRecord & {
  id?: string
  name?: string
  group?: string
  groupId?: string
  group_id?: string
  avatarPath?: string
  avatar_path?: string
  avatar?: string
}
type WorkspaceGroupMember = {
  characterId?: string
  character_id?: string
  charId?: string
  char_id?: string
  id?: string
  name?: string
  characterName?: string
  character_name?: string
  probability?: number
  replyChance?: number
  chance?: number
}
type WorkspaceGroup = UnknownRecord & {
  id?: string
  name?: string
  avatarPath?: string
  avatar_path?: string
  members?: WorkspaceGroupMember[] | string
}
type WorkspaceCrowd = UnknownRecord & {
  members?: unknown[] | string
  apiPreset?: string
  defaultPreset?: string
  default_preset?: string
  apiConfig?: { preset?: string }
}
type WorkspaceTask = UnknownRecord & {
  timerState?: unknown
  timer_state?: unknown
}
type WorkspaceUserProfile = UnknownRecord & {
  avatarPath?: string
}
type MutableStoreLike = Record<string, unknown>
type ChatCurrentStateLike = MutableStoreLike & {
  currentChatTarget?: string
  workspaceCurrentTarget?: string
  currentSession?: unknown
  currentMessages?: ChatMessage[]
  getWorkspaceCurrentTarget?: () => string
  setWorkspaceCurrentTarget?: (targetId: string) => string
}
type ChatRuntimeStateLike = MutableStoreLike & {
  sessionMessagesCache?: Record<string, ChatMessage[]>
  pendingPersistedMessages?: Record<string, ChatMessage[]>
  localStreamingMessages?: Record<string, ChatMessage[]>
}
type ChatEntityStateLike = MutableStoreLike & {
  chatSessions?: Record<string, unknown>
}
type SnapshotApplierDeps = {
  resourceStore: MutableStoreLike
  charStore: MutableStoreLike
  chatStore: MutableStoreLike & {
    entities?: ChatEntityStateLike
    current?: ChatCurrentStateLike
    runtime?: ChatRuntimeStateLike
    summaries?: MutableStoreLike
    getWorkspaceCurrentTarget?: () => string
  }
  settingStore: MutableStoreLike
  taskStore: MutableStoreLike
}

function toSafeNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function normalizeCharacterAvatarPath(path?: string): string {
  if (!path) return ''
  const trimmed = String(path).trim()
  if (!trimmed) return ''
  const invalidAvatarHost = trimmed.match(/^https?:\/\/avatars\/(.+)$/i)
  if (invalidAvatarHost?.[1]) {
    return '/' + invalidAvatarHost[1].replace(/^\/+/, '')
  }
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    return '/' + trimmed.replace(/^\/+/, '')
  }
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed
}

function normalizeCharacterShape(char: WorkspaceCharacter | unknown) {
  if (!char || typeof char !== 'object') return char
  const normalizedChar = char as WorkspaceCharacter
  const groupValue = normalizedChar.groupId ?? normalizedChar.group_id ?? normalizedChar.group ?? ''
  const normalizedAvatar = normalizeCharacterAvatarPath(normalizedChar.avatarPath ?? normalizedChar.avatar_path ?? normalizedChar.avatar)
  return {
    ...normalizedChar,
    avatarPath: normalizedAvatar,
    avatar_path: normalizedAvatar,
    group: groupValue,
    groupId: groupValue,
    group_id: groupValue
  }
}

function normalizeGroupShape(group: WorkspaceGroup | unknown, characters: WorkspaceCharacter[]) {
  if (!group || typeof group !== 'object') return group
  const normalizedGroup = group as WorkspaceGroup
  const normalizedAvatar = normalizeCharacterAvatarPath(normalizedGroup.avatarPath ?? normalizedGroup.avatar_path)
  let members = normalizedGroup.members ?? []
  if (typeof members === 'string') {
    try {
      members = JSON.parse(members)
    } catch {
      members = []
    }
  }
  if (Array.isArray(members)) {
    members = members.map((member) => {
      const probability = Number(member?.probability ?? member?.replyChance ?? member?.chance ?? 100) || 100
      const rawCharacterId = String(member?.characterId ?? member?.character_id ?? member?.charId ?? member?.char_id ?? member?.id ?? '').trim()
      const rawName = String(member?.name ?? member?.characterName ?? member?.character_name ?? member ?? '').trim()
      const matchedCharacter = characters.find((item) => item.id === rawCharacterId || item.id === rawName || item.name === rawName)
      return {
        characterId: matchedCharacter?.id || rawCharacterId || '',
        probability
      }
    })
  }
  return {
    ...normalizedGroup,
    members,
    avatarPath: normalizedAvatar,
    avatar_path: normalizedAvatar
  }
}

function normalizeCrowdShape(crowd: WorkspaceCrowd | unknown) {
  if (!crowd || typeof crowd !== 'object') return crowd
  const normalizedCrowd = crowd as WorkspaceCrowd
  let members = normalizedCrowd.members ?? []
  if (typeof members === 'string') {
    try {
      members = JSON.parse(members)
    } catch {
      members = []
    }
  }
  const preset = String(normalizedCrowd.apiPreset ?? normalizedCrowd.defaultPreset ?? normalizedCrowd.default_preset ?? normalizedCrowd.apiConfig?.preset ?? '').trim()
  return {
    ...normalizedCrowd,
    members,
    defaultPreset: preset,
    default_preset: preset,
    apiPreset: preset,
    apiConfig: preset ? { preset } : undefined
  }
}

function normalizeTaskTimerState(timerState: unknown) {
  if (timerState && typeof timerState === 'object') {
    const state = timerState as Record<string, unknown>
    return {
      isRunning: Boolean(state.isRunning),
      startTime: typeof state.startTime === 'number' ? state.startTime : null,
      accumulatedTime: typeof state.accumulatedTime === 'number' ? state.accumulatedTime : 0,
      marks: Array.isArray(state.marks) ? state.marks : []
    }
  }
  return {
    isRunning: false,
    startTime: null,
    accumulatedTime: 0,
    marks: []
  }
}

function createMutableValueAdapter<T>(
  target: MutableStoreLike,
  key: string
): { value: T } {
  return {
    get value() {
      return target[key] as T
    },
    set value(nextValue) {
      target[key] = nextValue
    }
  }
}

function readStoreValue<T>(input: unknown): T | undefined {
  if (input && typeof input === 'object' && 'value' in input) {
    return (input as { value: T }).value
  }
  return input as T | undefined
}

export function createWorkspaceSnapshotAppliers({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore
}: SnapshotApplierDeps) {
  const chatEntities = chatStore?.entities
  const chatCurrent = chatStore?.current
  const chatRuntime = chatStore?.runtime
  const chatSummaries = chatStore?.summaries

  const getStoreValue = <T>(group: MutableStoreLike | undefined, key: string, fallback?: T): T | undefined => {
    return readStoreValue<T>(group?.[key]) ?? fallback
  }

  const setStoreValue = (group: MutableStoreLike | undefined, key: string, nextValue: unknown, fallbackTarget?: MutableStoreLike) => {
    if (group && typeof group === 'object' && key in group) {
      group[key] = nextValue
    }
    if (fallbackTarget && typeof fallbackTarget === 'object') {
      fallbackTarget[key] = nextValue
    }
  }

  const applyChatSnapshot = createChatSnapshotApplier({
    summaryLibrary: createMutableValueAdapter<unknown[]>(chatSummaries || chatStore, 'summaryLibrary'),
    smallSummaries: createMutableValueAdapter<unknown[]>(chatSummaries || chatStore, 'smallSummaries'),
    bigSummaries: createMutableValueAdapter<unknown[]>(chatSummaries || chatStore, 'bigSummaries'),
    currentChatTarget: createMutableValueAdapter<string>(chatCurrent || chatStore, 'currentChatTarget'),
    workspaceCurrentTarget: createMutableValueAdapter<string>(chatCurrent || chatStore, 'workspaceCurrentTarget'),
    currentSession: createMutableValueAdapter<unknown>(chatCurrent || chatStore, 'currentSession'),
    currentMessages: createMutableValueAdapter<unknown[]>(chatCurrent || chatStore, 'currentMessages'),
    sessionMessagesCache: createMutableValueAdapter<Record<string, unknown[]>>(chatRuntime || chatStore, 'sessionMessagesCache'),
    chatTargets: createMutableValueAdapter<Record<string, unknown>>(chatEntities || chatStore, 'chatTargets'),
    chatSessions: createMutableValueAdapter<Record<string, unknown>>(chatEntities || chatStore, 'chatSessions'),
    chatMessages: createMutableValueAdapter<Record<string, unknown[]>>(chatEntities || chatStore, 'chatMessages'),
    normalizeTargetId: normalizeChatTargetId,
    normalizeMessageForTarget: normalizeChatMessageForTarget,
    normalizeSession: normalizeChatSession,
    setWorkspaceCurrentTarget: (targetId: string) => {
      const normalizedTargetId = normalizeChatTargetId(targetId)
      if (typeof chatCurrent?.setWorkspaceCurrentTarget === 'function') {
        return chatCurrent.setWorkspaceCurrentTarget(normalizedTargetId)
      }
      return normalizedTargetId
    },
    buildDisplayMessages: (targetId: string, sessionId?: string) => buildChatDisplayMessages({
      targetId,
      sessionId,
      sessionMessagesCache: getStoreValue(chatRuntime, 'sessionMessagesCache', {}),
      pendingPersistedMessages: getStoreValue(chatRuntime, 'pendingPersistedMessages', {}),
      localStreamingMessages: getStoreValue(chatRuntime, 'localStreamingMessages', {}),
      normalizeTargetId: normalizeChatTargetId,
      normalizeMessageForTarget: normalizeChatMessageForTarget
    })
  })

  function applyResourcePartition(partition: WorkspaceDomainPartition) {
    if (partition.resources) {
      resourceStore.points = toSafeNumber(partition.resources.points)
      resourceStore.bigTimeCount = toSafeNumber(partition.resources.bigTimeCount)
      resourceStore.smallTimeCount = toSafeNumber(partition.resources.smallTimeCount)
      resourceStore.money = toSafeNumber(partition.resources.money)
    }
    if (Array.isArray(partition.tickets)) {
      resourceStore.tickets = partition.tickets
    }
    if (Array.isArray(partition.ticketCategories)) {
      resourceStore.ticketCategories = partition.ticketCategories
      const names = partition.ticketCategories.map((item) => item.name).filter(Boolean)
      if (Array.isArray(resourceStore.categories) && names.length > 0) {
        resourceStore.categories = names
      }
    }
    if (Array.isArray(partition.history)) {
      resourceStore.history = partition.history
    }
  }

  function applyCharacterPartition(partition: WorkspaceDomainPartition) {
    const resolvedCharacterState = resolveCharacterState(partition)
    applyResolvedCharacterState({
      characters: createMutableValueAdapter(charStore, 'characters'),
      characterGroups: createMutableValueAdapter(charStore, 'characterGroups'),
      groups: createMutableValueAdapter(charStore, 'groups'),
      crowds: createMutableValueAdapter(charStore, 'crowds'),
      aliases: createMutableValueAdapter(charStore, 'aliases'),
      userProfile: createMutableValueAdapter(charStore, 'userProfile')
    }, resolvedCharacterState)

    applyDocBrainPartition(partition)
  }

  function applyDocBrainPartition(partition: WorkspaceDomainPartition) {
    const resolvedDocBrainState = resolveDocBrainState(partition)
    applyResolvedDocBrainState({
      documents: createMutableValueAdapter(charStore, 'documents'),
      brainNeurons: createMutableValueAdapter(charStore, 'brainNeurons')
    }, resolvedDocBrainState)
  }

  function applyChatPartition(partition: WorkspaceDomainPartition) {
    applyChatSnapshot({
      workspaceTarget: partition.workspaceTarget,
      workspaceSessionId: partition.workspaceSessionId,
      currentChatTarget: partition.workspaceTarget,
      summaryLibrary: partition.summaryLibrary,
      smallSummaries: partition.smallSummaries,
      bigSummaries: partition.bigSummaries,
      chatSessions: partition.chatSessions,
      chatSessionParticipants: partition.chatSessionParticipants,
      chatMessages: partition.chatMessages
    })
    applyDocBrainPartition(partition)

    const workspaceSessionId = String(partition.workspaceSessionId || '').trim()
    const sessionRecord = workspaceSessionId
      ? (getStoreValue<Record<string, unknown>>(chatEntities, 'chatSessions', {}) || {})[workspaceSessionId]
      : null
    const sessionTarget = sessionRecord ? normalizeChatTargetId(resolveChatSessionTargetId(sessionRecord)) : ''
    const workspaceTarget = sessionTarget || (typeof chatStore.getWorkspaceCurrentTarget === 'function'
      ? normalizeChatTargetId(chatStore.getWorkspaceCurrentTarget())
      : normalizeChatTargetId(String(
          chatCurrent?.getWorkspaceCurrentTarget?.()
          || getStoreValue(chatCurrent, 'workspaceCurrentTarget')
          || getStoreValue(chatCurrent, 'currentChatTarget')
          || ''
        )))

    if (workspaceTarget) {
      const currentSession = sessionRecord || resolveChatSessionByTargetId({
        targetId: workspaceTarget,
        currentChatTarget: workspaceTarget,
        workspaceCurrentTarget: workspaceTarget,
        currentSession: getStoreValue(chatCurrent, 'currentSession', null),
        chatSessions: getStoreValue(chatEntities, 'chatSessions', {}),
        normalizeTargetId: normalizeChatTargetId
      })
      const currentMessages = buildChatDisplayMessages({
        targetId: workspaceTarget,
        sessionId: String((currentSession as any)?.id || ''),
        sessionMessagesCache: getStoreValue(chatRuntime, 'sessionMessagesCache', {}),
        pendingPersistedMessages: getStoreValue(chatRuntime, 'pendingPersistedMessages', {}),
        localStreamingMessages: getStoreValue(chatRuntime, 'localStreamingMessages', {}),
        normalizeTargetId: normalizeChatTargetId,
        normalizeMessageForTarget: normalizeChatMessageForTarget
      })
      setStoreValue(chatCurrent, 'currentChatTarget', workspaceTarget, chatStore)
      setStoreValue(chatCurrent, 'workspaceCurrentTarget', workspaceTarget, chatStore)
      setStoreValue(chatCurrent, 'currentSession', currentSession, chatStore)
      setStoreValue(chatCurrent, 'currentMessages', currentMessages, chatStore)
    }
  }

  async function applySettingsPartition(partition: WorkspaceDomainPartition) {
    const settings = normalizeSettingsServerPayload(partition)

    if (Array.isArray(settings.apiPresets)) {
      if (typeof settingStore.apiPresets !== 'undefined') {
        settingStore.apiPresets = settings.apiPresets
      }
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'defaultPreset')) {
      settingStore.defaultPreset = settings.defaultPreset
        ? { ...settings.defaultPreset, isDefault: true }
        : null
    }
    if (typeof settings.aiProviderMode === 'string') {
      settingStore.aiProviderMode = settings.aiProviderMode
    }
    if (Array.isArray(settings.promptPresets)) {
      settingStore.promptPresets = settings.promptPresets
      if (typeof settingStore.ensureBuiltinPromptPresets === 'function') {
        await settingStore.ensureBuiltinPromptPresets()
      }
    }
    if (typeof settings.summaryPrompt === 'string') settingStore.summaryPrompt = settings.summaryPrompt
    if (typeof settings.bigSummaryPrompt === 'string') settingStore.bigSummaryPrompt = settings.bigSummaryPrompt
    if (typeof settings.dailyReportPrompt === 'string') settingStore.dailyReportPrompt = settings.dailyReportPrompt
    if (typeof settings.chatSummaryPresetName === 'string') settingStore.chatSummaryPresetName = settings.chatSummaryPresetName
    if (typeof settings.chatSummaryModel === 'string') settingStore.chatSummaryModel = settings.chatSummaryModel
    if (Array.isArray(settings.agentModelConfigs)) settingStore.agentModelConfigs = settings.agentModelConfigs
    if (typeof settings.aiEvaluationEnabled === 'boolean') settingStore.aiEvaluationEnabled = settings.aiEvaluationEnabled
    if (typeof settings.currentTime === 'string') settingStore.currentTime = settings.currentTime
    if (typeof settings.currentWeather === 'string') settingStore.currentWeather = settings.currentWeather
    if (typeof settings.currentLocation === 'string') settingStore.currentLocation = settings.currentLocation
    settingStore.weatherDetail = settings.weatherDetail && typeof settings.weatherDetail === 'object'
      ? settings.weatherDetail
      : null
    if (Array.isArray(settings.locationHistory)) settingStore.locationHistory = settings.locationHistory
    if (Array.isArray(settings.weatherHistory)) settingStore.weatherHistory = settings.weatherHistory
    if (typeof settings.darkMode === 'boolean') {
      settingStore.darkMode = settings.darkMode
      localStorage.setItem('langhuan_dark_mode', String(settings.darkMode))
    }
  }

  function applyTaskPartition(partition: WorkspaceDomainPartition) {
    if (Array.isArray(partition.tasks)) {
      taskStore.tasks = partition.tasks.map((task) => ({
        ...task,
        timerState: normalizeTaskTimerState((task as unknown as WorkspaceTask).timerState || (task as unknown as WorkspaceTask).timer_state)
      }))
    }
    if (Array.isArray(partition.taskLogs)) {
      taskStore.taskLogs = partition.taskLogs
    }
    if (Array.isArray(partition.dailyReports)) {
      taskStore.dailyReports = partition.dailyReports
    }
    if (Array.isArray(partition.recentMarkTypes)) {
      taskStore.recentMarkTypes = partition.recentMarkTypes
    }
    if (partition.userLevel) {
      taskStore.userLevel = { ...(taskStore.userLevel || {}), ...partition.userLevel }
    }
    if (partition.dailyActivity) {
      taskStore.dailyActivity = { ...(taskStore.dailyActivity || {}), ...partition.dailyActivity }
    }
    if (typeof taskStore.checkDailyReset === 'function') {
      taskStore.checkDailyReset()
    }
    if (typeof taskStore.checkTaskReset === 'function') {
      taskStore.checkTaskReset()
    }
  }

  return {
    applyResourcePartition,
    applyCharacterPartition,
    applyChatPartition,
    applySettingsPartition,
    applyTaskPartition
  }
}
