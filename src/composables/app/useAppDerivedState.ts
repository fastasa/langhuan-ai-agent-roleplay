import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import {
  getChatSessionBoundAlias,
  getChatStoreActiveTargetId,
  getChatStoreCurrentSession,
  normalizeChatSessionCharacterParticipants,
  normalizeChatTargetId
} from '../../repositories/chatRepository'
import {
  getVirtualTimeTickIntervalMs,
  parseVirtualSceneDisplayTime,
  resolveEffectiveVirtualScene
} from '../../utils/virtualScene'
import { createChatProjection } from '../../app/chatProjection'
import { resolveChatSessionTitle } from '../../app/chatHeaderTitle'
import { createSettingsProjection } from '../../app/settingsProjection'
import {
  loadSessionTemporaryCharactersIntoCache,
  sessionTemporaryCharactersBySessionId,
  toSessionTemporaryCharacterMentionId
} from '../../app/sessionTemporaryCharactersState'

interface SessionLike {
  title?: string
  virtualSceneName?: string
  virtualSceneDesc?: string
  virtualLocation?: string
  virtualRealLocation?: string
  virtualTime?: string
  virtualTimeAnchor?: number
  virtualTimeBase?: number
  virtualTimeRate?: number
  virtualWeather?: string
  virtualWeatherMode?: string
  boundAlias?: string
  loadedSummaryIds?: string[] | string
}

function hasSettledVirtualTimeBase(value: unknown): boolean {
  const base = Number(value)
  return Number.isFinite(base) && base !== 0
}

interface CharacterLike {
  id: string
  name: string
  avatarPath?: string | null
  group?: string
  groupId?: string
  group_id?: string
  emoji?: string
  desc?: string
  description?: string
  kind?: string
}

interface AliasLike {
  id: string
  name?: string
}

interface TicketLike {
  category?: string
  categoryId?: string
  category_id?: string
}

interface TaskLike {
  id?: string
  type?: string
  status?: string
  orderIndex?: number
  order_index?: number
  createdAt?: number
  created_at?: string
  timerState?: {
    isRunning?: boolean
  }
}

interface UseAppDerivedStateContext {
  chatStore: {
    current?: {
      currentChatTarget?: string | { value: string }
      workspaceCurrentTarget?: string | { value: string }
      currentSession?: SessionLike | null | { value: SessionLike | null }
      currentMessages?: Array<{ role: string; content: string; name?: string }> | { value: Array<{ role: string; content: string; name?: string }> }
      getActiveTargetId?: () => string
      getWorkspaceCurrentTarget?: () => string
      getCurrentSession?: () => SessionLike | null
    }
    currentChatTarget: string
    workspaceCurrentTarget?: string
    activeChatTargetId?: string
    currentSession: SessionLike | null
    currentMessages: Array<{ role: string; content: string; name?: string }>
    getActiveTargetId?: () => string
    getWorkspaceCurrentTarget?: () => string
    getCurrentSession?: () => SessionLike | null
  }
  charStore: {
    aliases: AliasLike[]
    characters: CharacterLike[]
    getCharacter: (id: string) => CharacterLike | null
  }
  resourceStore: {
    tickets: TicketLike[]
    categories: Array<string | { name?: string }>
  }
  taskStore: {
    tasks: TaskLike[]
    getTaskElapsedTime: (id: string) => number
    userLevel?: {
      level?: number
      exp?: number
      expToNext?: number
      dailyActive?: number
    }
    dailyActivity?: {
      completedCount?: number
      targetCount?: number
    }
    recentMarkTypes?: string[]
  }
  settingStore: unknown
  currentTaskTab?: Ref<string>
  currentTicketCategory?: Ref<string>
  atSearchText?: Ref<string>
  getTargetName: (target: string) => string
  normalizeAvatarUrl: (url: string) => string
}

export function useAppDerivedState({
  chatStore,
  charStore,
  resourceStore,
  taskStore,
  settingStore,
  currentTaskTab,
  currentTicketCategory,
  atSearchText,
  getTargetName,
  normalizeAvatarUrl
}: UseAppDerivedStateContext) {
  const defaultAppTitle = '\u7405\u5B1B'
  const allCategoryLabel = '\u5168\u90E8'
  const readRefText = (input: Ref<string> | undefined, fallback = '') => String(input?.value || fallback)
  const readTicketCategory = (ticket: TicketLike): string => ticket.category || ticket.categoryId || ticket.category_id || ''
  const chatProjection = createChatProjection({ chatStore, charStore })
  const settingsProjection = createSettingsProjection({ settingStore })
  const getResolvedTargetId = () => getChatStoreActiveTargetId(chatStore)
  const getResolvedSession = () => getChatStoreCurrentSession(chatStore)
  const sceneClockTick = ref(Date.now())
  let sceneClockTimer: ReturnType<typeof setTimeout> | null = null
  let sceneClockActive = false
  function stopSceneClockTimer() {
    sceneClockActive = false
    if (sceneClockTimer !== null) {
      clearTimeout(sceneClockTimer)
      sceneClockTimer = null
    }
  }
  function getSceneClockIntervalMs() {
    const session = getResolvedSession()
    const base = Number((session as any)?.virtualTimeBase ?? (session as any)?.virtual_time_base ?? 0) || 0
    const virtualTime = String((session as any)?.virtualTime || (session as any)?.virtual_time || '')
    const rate = Number((session as any)?.virtualTimeRate ?? (session as any)?.virtual_time_rate ?? 1)
    return hasSettledVirtualTimeBase(base) || virtualTime ? getVirtualTimeTickIntervalMs(rate) : 1000
  }
  function startSceneClockTimer() {
    if (typeof window === 'undefined') return
    sceneClockActive = true
    stopSceneClockTimer()
    sceneClockActive = true
    sceneClockTick.value = Date.now()
    const scheduleNextTick = () => {
      if (!sceneClockActive) return
      sceneClockTick.value = Date.now()
      if (!sceneClockActive) return
      sceneClockTimer = setTimeout(scheduleNextTick, getSceneClockIntervalMs())
    }
    sceneClockTimer = setTimeout(scheduleNextTick, getSceneClockIntervalMs())
  }
  if (getCurrentInstance()) {
    onMounted(() => {
      startSceneClockTimer()
    })
  } else {
    startSceneClockTimer()
  }
  onUnmounted(() => {
    stopSceneClockTimer()
  })

  const currentChatTitle = computed(() => {
    const target = chatProjection.chatPanelViewModel.value.activeChatTargetId
    if (!target) return defaultAppTitle
    return resolveChatSessionTitle(getResolvedSession(), getTargetName(target))
  })

  const currentCharacter = computed(() => {
    const target = getResolvedTargetId()
    if (!target || target.startsWith('group_') || target.startsWith('crowd_')) return null
    return charStore.getCharacter(target)
  })

  const currentCharacterAvatar = computed(() => {
    const c = currentCharacter.value
    if (!c) return null
    if (c.avatarPath) return normalizeAvatarUrl(c.avatarPath)
    return null
  })

  const currentMessages = computed(() => {
    return chatProjection.displayMessages.value || []
  })

  const currentScene = computed(() => {
    return resolveEffectiveVirtualScene(getResolvedSession(), settingStore as any, sceneClockTick.value)
  })

  watch(
    () => {
      const session = getResolvedSession()
      return {
        id: String((session as any)?.id || ''),
        virtualTime: String((session as any)?.virtualTime || (session as any)?.virtual_time || ''),
        virtualTimeBase: Number((session as any)?.virtualTimeBase ?? (session as any)?.virtual_time_base ?? 0) || 0,
        virtualTimeAnchor: Number((session as any)?.virtualTimeAnchor ?? (session as any)?.virtual_time_anchor ?? 0) || 0,
        virtualTimeRate: Number((session as any)?.virtualTimeRate ?? (session as any)?.virtual_time_rate ?? 1)
      }
    },
    ({ id, virtualTime, virtualTimeBase, virtualTimeAnchor, virtualTimeRate }) => {
      if (!id || !virtualTime || hasSettledVirtualTimeBase(virtualTimeBase) || virtualTimeAnchor > 0) return
      const parsed = parseVirtualSceneDisplayTime(virtualTime)
      const parsedTime = parsed.getTime()
      if (!Number.isFinite(parsedTime) || parsedTime === 0) return
      if (typeof (chatStore as any).updateSession !== 'function') return
      void (chatStore as any).updateSession(id, {
        virtualTimeBase: parsedTime,
        virtualTimeAnchor: Date.now(),
        virtualTimeRate
      })
    },
    { immediate: true }
  )

  const currentBoundAlias = computed(() => {
    return getChatSessionBoundAlias(getResolvedSession())
  })

  const currentAlias = computed(() => {
    const id = currentBoundAlias.value
    if (!id) return null
    return charStore.aliases.find((a) => a.id === id) || null
  })

  const loadedSummaryCount = computed(() => {
    return chatProjection.loadedSummaryBadges.value.length
  })

  watch(
    () => String((getResolvedSession() as any)?.id || ''),
    (sessionId) => {
      if (!sessionId) return
      void loadSessionTemporaryCharactersIntoCache(sessionId).catch((error) => {
        console.warn('读取会话临时角色失败:', error)
      })
    },
    { immediate: true }
  )

  const resolveCharacterGroupId = (character: CharacterLike | null | undefined) => {
    return String(character?.groupId ?? character?.group_id ?? character?.group ?? '').trim()
  }

  const ungroupedCharacters = computed(() => {
    return charStore.characters.filter((character) => {
      const groupId = resolveCharacterGroupId(character)
      return !groupId || groupId === 'default'
    })
  })

  const allTicketCategories = computed(() => {
    const cats = new Set<string>([allCategoryLabel])
    resourceStore.tickets.forEach((t) => {
      const category = readTicketCategory(t)
      if (category) cats.add(category)
    })
    resourceStore.categories.forEach((c) => {
      const category = typeof c === 'string' ? c : c.name || ''
      if (category) cats.add(category)
    })
    return [...cats]
  })

  const filteredTickets = computed(() => {
    const selectedCategory = readRefText(currentTicketCategory, allCategoryLabel)
    if (selectedCategory === allCategoryLabel) return resourceStore.tickets
    return resourceStore.tickets.filter((t) => readTicketCategory(t) === selectedCategory)
  })

  const filteredAtCharacters = computed(() => {
    const session = getResolvedSession()
    // 提及候选只取当前会话成员：正式角色读会话 participants；单聊或旧 group_/crowd_ 主目标按主目标兜底（与会话成员头像同口径）
    const participantIds = normalizeChatSessionCharacterParticipants(session)
      .map((item) => item.characterId)
      .filter(Boolean)
    const fallbackId = normalizeChatTargetId(getResolvedTargetId())
    const sessionCharacterIds = new Set<string>(
      participantIds.length
        ? participantIds
        : (fallbackId && !fallbackId.startsWith('group_') && !fallbackId.startsWith('crowd_') ? [fallbackId] : [])
    )
    let chars: CharacterLike[] = charStore.characters.filter((char) => sessionCharacterIds.has(char.id))
    const sessionId = String((session as any)?.id || '')
    const sessionTemporaryCharacters = (sessionTemporaryCharactersBySessionId.value[sessionId] || [])
      .filter((item) => item.status !== 'deleted')
      .map((item) => {
        const markdown = String(item.markdown || '').replace(/\s+/g, ' ').trim()
        const aliases = String(item.aliases_json || item.aliasesJson || '').replace(/[\[\]"]/g, '').trim()
        return {
          id: toSessionTemporaryCharacterMentionId(item.id),
          name: item.name,
          emoji: '@',
          kind: 'sessionTemporary',
          desc: markdown || aliases
        }
      })
    chars = [...chars, ...sessionTemporaryCharacters]
    const keyword = readRefText(atSearchText).trim().toLowerCase()
    if (!keyword) return chars
    return chars.filter((c) => c.name.toLowerCase().includes(keyword))
  })

  const filteredTasks = computed(() => {
    const taskTab = readRefText(currentTaskTab, 'all')
    return (taskStore.tasks || [])
      .filter((t) => {
        if (taskTab === 'daily' && t.type !== 'daily') return false
        if (taskTab === 'longterm' && t.type !== 'longterm') return false
        if (taskTab === 'bounty' && t.type !== 'bounty') return false
        return t.status === 'active' || t.status === 'pending' || !t.status
      })
      .sort((a, b) => {
        const runningDiff = Number(Boolean(b.timerState?.isRunning)) - Number(Boolean(a.timerState?.isRunning))
        if (runningDiff !== 0) return runningDiff

        const orderA = Number(a.orderIndex ?? a.order_index ?? Number.MAX_SAFE_INTEGER)
        const orderB = Number(b.orderIndex ?? b.order_index ?? Number.MAX_SAFE_INTEGER)
        if (orderA !== orderB) return orderA - orderB

        const typeOrder: Record<string, number> = { bounty: 0, longterm: 1, daily: 2 }
        const typeDiff = (typeOrder[String(a.type)] ?? 3) - (typeOrder[String(b.type)] ?? 3)
        if (typeDiff !== 0) return typeDiff

        const createdAtA = Number(a.createdAt || new Date(String(a.created_at || 0)).getTime() || 0)
        const createdAtB = Number(b.createdAt || new Date(String(b.created_at || 0)).getTime() || 0)
        return createdAtA - createdAtB
      })
  })

  const pendingTasks = computed(() => {
    return (taskStore.tasks || []).filter((t) => t.status === 'pending' || !t.status || t.status === 'active')
  })

  const mobileTasks = computed(() => {
    return (taskStore.tasks || [])
      .filter((task) => task.status === 'active' || task.status === 'pending' || !task.status)
      .map((task) => ({
        ...task,
        elapsedMs: task.id ? taskStore.getTaskElapsedTime(task.id) : 0
      }))
  })

  const taskPanelMeta = computed(() => ({
    userLevel: {
      level: Number(taskStore.userLevel?.level || 1),
      exp: Number(taskStore.userLevel?.exp || 0),
      expToNext: Math.max(1, Number(taskStore.userLevel?.expToNext || 1)),
      dailyActive: Number(taskStore.userLevel?.dailyActive || 0)
    },
    dailyActivity: {
      completedCount: Number(taskStore.dailyActivity?.completedCount || 0),
      targetCount: Number(taskStore.dailyActivity?.targetCount || 0)
    },
    recentMarkTypes: Array.isArray(taskStore.recentMarkTypes) ? taskStore.recentMarkTypes : []
  }))

  return {
    currentChatTitle,
    currentCharacter,
    currentCharacterAvatar,
    currentMessages,
    currentScene,
    currentBoundAlias,
    currentAlias,
    loadedSummaryCount,
    ungroupedCharacters,
    allTicketCategories,
    filteredTickets,
    filteredAtCharacters,
    filteredTasks,
    pendingTasks,
    mobileTasks,
    taskPanelMeta,
    chatPanelViewModel: chatProjection.chatPanelViewModel,
    settingsPanelViewModel: settingsProjection.settingsPanelViewModel
  }
}
