import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateChatMessageBySessionId } from '../../../src/repositories/chatRepository'

const mocks = vi.hoisted(() => ({
  createChatMessage: vi.fn(),
  createChatMessageBySessionId: vi.fn(),
  fetchChatSessionBundle: vi.fn(),
  fetchChatSessionBundleById: vi.fn(),
  deleteChatSessionsByIds: vi.fn(),
  settingStore: {
    currentTime: '现实时间 5月4日',
    currentWeather: '晴，26°C',
    currentLocation: '现实地点'
  }
}))

vi.mock('../../../src/stores/characterStore', () => ({
  useCharacterStore: () => ({
    getCharacter: vi.fn(() => null)
  })
}))

vi.mock('../../../src/stores/settingStore', () => ({
  useSettingStore: () => mocks.settingStore
}))

vi.mock('../../../src/repositories/settingRepository', () => ({
  saveConfigSnapshot: vi.fn(() => Promise.resolve())
}))

vi.mock('../../../src/repositories/chatRepository', () => ({
  archiveChatSessionById: vi.fn(),
  buildChatSessionPatch: vi.fn((changes) => changes),
  clearChatMessageList: vi.fn(),
  clearChatMessageListBySessionId: vi.fn(),
  createChatMessage: mocks.createChatMessage,
  createChatMessageBySessionId: mocks.createChatMessageBySessionId,
  createChatTargetEntity: (targetId) => ({ id: String(targetId || '').trim(), kind: 'char' }),
  deleteChatSessionById: vi.fn(),
  deleteChatSessionsByIds: mocks.deleteChatSessionsByIds,
  fetchChatSessionBundle: mocks.fetchChatSessionBundle,
  fetchChatSessionBundleById: mocks.fetchChatSessionBundleById,
  getChatSessionVirtualScene: (session) => ({
    virtualSceneName: session?.virtualSceneName ?? session?.virtual_scene_name ?? '',
    virtualSceneDesc: session?.virtualSceneDesc ?? session?.virtual_scene_desc ?? '',
    virtualLocation: session?.virtualLocation ?? session?.virtual_location ?? '',
    virtualLocationLarge: session?.virtualLocationLarge ?? session?.virtual_location_large ?? '',
    virtualLocationMiddle: session?.virtualLocationMiddle ?? session?.virtual_location_middle ?? '',
    virtualLocationSmall: session?.virtualLocationSmall ?? session?.virtual_location_small ?? '',
    virtualRealLocation: session?.virtualRealLocation ?? session?.virtual_real_location ?? '',
    virtualTime: session?.virtualTime ?? session?.virtual_time ?? '',
    virtualTimeAnchor: session?.virtualTimeAnchor ?? session?.virtual_time_anchor ?? 0,
    virtualTimeBase: session?.virtualTimeBase ?? session?.virtual_time_base ?? 0,
    virtualTimeRate: session?.virtualTimeRate ?? session?.virtual_time_rate ?? 1,
    virtualWeather: session?.virtualWeather ?? session?.virtual_weather ?? '',
    virtualWeatherMode: session?.virtualWeatherMode ?? session?.virtual_weather_mode ?? 'real'
  }),
  getChatSessionVirtualSceneDesc: (session) => session?.virtualSceneDesc ?? session?.virtual_scene_desc ?? '',
  getChatSessionVirtualSceneName: (session) => session?.virtualSceneName ?? session?.virtual_scene_name ?? '',
  removeChatMessage: vi.fn(),
  removeChatMessageBySessionId: vi.fn(),
  resolveChatSessionTargetId: (session) => String(session?.targetId ?? session?.target_id ?? session?.id ?? ''),
  saveChatSessionPatch: vi.fn(),
  saveChatSessionPatchById: vi.fn(),
  startNewChatSession: vi.fn(),
  updateChatMessage: vi.fn(),
  updateChatMessageBySessionId: vi.fn()
}))

function createDeps(session) {
  return {
    currentChatTarget: ref('char_1'),
    currentSession: ref(session),
    currentMessages: ref([]),
    sessionMessagesCache: ref({}),
    pendingPersistedMessages: ref({}),
    localStreamingMessages: ref({}),
    chatTargets: ref({}),
    chatSessions: ref({ [session.id]: session }),
    chatMessages: ref({}),
    summaryLibrary: ref([]),
    smallSummaries: ref([]),
    bigSummaries: ref([]),
    chatArchives: ref([]),
    normalizeTargetId: (targetId) => String(targetId || '').trim(),
    normalizeMessage: vi.fn((message) => message),
    normalizeMessageForTarget: vi.fn((_targetId, message) => message),
    normalizeSession: vi.fn((nextSession) => nextSession),
    refreshCurrentMessages: vi.fn(),
    upsertCachedMessage: vi.fn(),
    removeCachedMessage: vi.fn(),
    getCachedMessages: vi.fn(() => []),
    buildDisplayMessages: vi.fn(() => []),
    setWorkspaceCurrentTarget: vi.fn((targetId) => targetId),
    flushPendingPersistedMessages: vi.fn(),
    switchRequestSeqRef: ref(0),
    sessionSwitchLoadingId: ref('')
  }
}

describe('chatStoreMessageRemoteActions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T08:00:00+08:00'))
    vi.clearAllMocks()
    mocks.createChatMessage.mockResolvedValue(41)
    mocks.createChatMessageBySessionId.mockResolvedValue(42)
    mocks.fetchChatSessionBundle.mockReset()
    mocks.fetchChatSessionBundleById.mockReset()
    mocks.deleteChatSessionsByIds.mockReset()
    mocks.settingStore.currentTime = '现实时间 5月4日'
    mocks.settingStore.currentWeather = '晴，26°C'
    mocks.settingStore.currentLocation = '现实地点'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the current session curtain scene when old addMessage callers omit env fields', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      virtualTime: '旧文本不是真实当前帷幕时间',
      virtualTimeBase: new Date('2026-05-09T13:20:00+08:00').getTime(),
      virtualTimeAnchor: Date.now(),
      virtualTimeRate: 0,
      virtualLocationLarge: '德文郡',
      virtualLocationMiddle: '旧宅',
      virtualLocationSmall: '书房',
      virtualWeather: '小雨',
      virtualWeatherMode: 'custom'
    }
    const actions = createChatStoreMessageRemoteActions(createDeps(session))

    await actions.addMessage('char_1', {
      role: 'assistant',
      content: '窗外雨还没停。'
    }, { sessionId: 'session_1' })

    expect(mocks.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      envDate: '2026年5月9日 周六 13:20:00',
      envWeather: '小雨',
      envLocation: '德文郡 / 旧宅 / 书房'
    }))
  })

  it('refreshSessionMeta 静默重读会话帷幕并局部更新当前会话', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = { id: 'session_1', targetId: 'char_1', virtualLocationLarge: '旧地点', virtualTimeBase: 100, virtualTimeAnchor: 200, virtualTimeRate: 1 }
    const deps = createDeps(session)
    mocks.fetchChatSessionBundleById.mockResolvedValue({
      session: { id: 'session_1', targetId: 'char_1', virtualLocationLarge: '日本', virtualLocationMiddle: '沼谷', virtualLocationSmall: '街道', virtualTime: '2026-07-20T20:55:34', virtualTimeBase: 300, virtualTimeAnchor: 400, virtualTimeRate: 2 },
      participants: [{ id: 'p1', participantTargetId: 'char_1' }]
    })
    const actions = createChatStoreMessageRemoteActions(deps)

    await actions.refreshSessionMeta('session_1')

    expect(mocks.fetchChatSessionBundleById).toHaveBeenCalledWith('session_1', { limit: 1 })
    expect(deps.currentSession.value).toMatchObject({
      virtualLocationLarge: '日本', virtualLocationMiddle: '沼谷', virtualLocationSmall: '街道',
      virtualTime: '2026-07-20T20:55:34', virtualTimeBase: 300, virtualTimeAnchor: 400, virtualTimeRate: 2,
      participants: [{ id: 'p1', participantTargetId: 'char_1' }]
    })
    expect(deps.chatSessions.value.session_1.virtualLocationLarge).toBe('日本')
  })

  it('editMessage 附件回填（带图乐观发送·2026-07-11）：透传服务端 updateChatMessageBySessionId，并镜像本地缓存 attachments/attachmentsJson 双键', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = { id: 'session_1', targetId: 'char_1' }
    const deps = createDeps(session)
    const message = {
      id: 5,
      role: 'user',
      content: '你看这张图',
      attachments: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', captionStatus: 'pending' }]
    }
    deps.currentMessages.value = [message]
    const actions = createChatStoreMessageRemoteActions(deps)

    const mergedAttachments = [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', captionStatus: 'done', caption: '一只猫坐在窗台上' }]
    await actions.editMessage('session_1', 5, { attachments: mergedAttachments })

    expect(updateChatMessageBySessionId).toHaveBeenCalledWith('session_1', 5, { attachments: mergedAttachments })
    // 本地缓存/当前消息列表同步镜像（不用等下一次刷新才看到 caption），两个键都写：
    // attachments 是本地乐观消息本来就用的键，attachmentsJson 是经 toCamel 的服务端读侧键。
    expect(message.attachments).toEqual(mergedAttachments)
    expect(message.attachmentsJson).toEqual(mergedAttachments)
  })

  it('switchSession 乐观跳转（2026-07-11）：fetch 完成前先从本地 chatSessions 缓存切 currentSession/currentChatTarget，sessionSwitchLoadingId 置位、currentMessages 保持旧值不清空', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const sessionA = { id: 'session_a', targetId: 'char_a' }
    const sessionB = { id: 'session_b', targetId: 'char_b', title: '会话B' }
    const deps = createDeps(sessionA)
    deps.chatSessions.value = { session_a: sessionA, session_b: sessionB }
    deps.currentMessages.value = [{ id: 1, role: 'user', content: '旧会话消息' }]
    let resolveFetch
    mocks.fetchChatSessionBundleById.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve }))

    const actions = createChatStoreMessageRemoteActions(deps)
    const switchPromise = actions.switchSession('session_b')

    // 乐观阶段（fetch 尚未 resolve）：已切到 B 的元数据 + 置位 loading id，旧消息未被清空（由 UI 骨架分支遮住）。
    // ref() 会把对象包一层响应式 Proxy，故用 toEqual 比内容而非 toBe 比引用。
    expect(deps.currentSession.value).toEqual(sessionB)
    expect(deps.currentChatTarget.value).toBe('char_b')
    expect(deps.sessionSwitchLoadingId.value).toBe('session_b')
    expect(deps.currentMessages.value).toEqual([{ id: 1, role: 'user', content: '旧会话消息' }])

    resolveFetch({
      session: sessionB,
      participants: [],
      messages: [{ id: 9, sessionId: 'session_b', role: 'user', content: '新会话消息' }],
      pageInfo: { hasMore: false }
    })
    await switchPromise

    expect(deps.sessionSwitchLoadingId.value).toBe('')
    expect(deps.currentSession.value.id).toBe('session_b')
  })

  it('switchSession 失败：回滚乐观切换前的 currentSession/currentChatTarget，清 sessionSwitchLoadingId，并仍然向上抛出错误（沿用现有错误处理）', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const sessionA = { id: 'session_a', targetId: 'char_a' }
    const sessionB = { id: 'session_b', targetId: 'char_b' }
    const deps = createDeps(sessionA)
    deps.chatSessions.value = { session_a: sessionA, session_b: sessionB }
    deps.currentChatTarget.value = 'char_a'
    mocks.fetchChatSessionBundleById.mockRejectedValueOnce(new Error('网络错误'))

    const actions = createChatStoreMessageRemoteActions(deps)
    await expect(actions.switchSession('session_b')).rejects.toThrow('网络错误')

    expect(deps.currentSession.value).toEqual(sessionA)
    expect(deps.currentChatTarget.value).toBe('char_a')
    expect(deps.sessionSwitchLoadingId.value).toBe('')
  })

  it('loads older messages before the oldest loaded message id', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      participants: []
    }
    const deps = createDeps(session)
    deps.buildDisplayMessages = vi.fn((_targetId, sessionId) => deps.sessionMessagesCache.value[sessionId] || [])
    mocks.fetchChatSessionBundleById
      .mockResolvedValueOnce({
        session,
        participants: [],
        messages: [
          { id: 81, sessionId: 'session_1', role: 'user', content: '近一点' },
          { id: 82, sessionId: 'session_1', role: 'assistant', content: '近一点回复' }
        ],
        pageInfo: { hasMore: true, oldestMessageId: 81 }
      })
      .mockResolvedValueOnce({
        session,
        participants: [],
        messages: [
          { id: 1, sessionId: 'session_1', role: 'user', content: '第一句' },
          { id: 2, sessionId: 'session_1', role: 'assistant', content: '第一句回复' }
        ],
        pageInfo: { hasMore: false, oldestMessageId: 1 }
      })

    const actions = createChatStoreMessageRemoteActions(deps)
    await actions.switchSession('session_1')

    expect(mocks.fetchChatSessionBundleById).toHaveBeenNthCalledWith(1, 'session_1', { limit: 80 })
    expect(deps.currentSession.value._hasOlderMessages).toBe(true)
    expect(deps.currentSession.value._oldestLoadedMessageId).toBe(81)

    await expect(actions.loadOlderMessages('session_1')).resolves.toBe(true)

    expect(mocks.fetchChatSessionBundleById).toHaveBeenNthCalledWith(2, 'session_1', {
      limit: 80,
      beforeId: 81
    })
    expect(deps.sessionMessagesCache.value.session_1.map((message) => message.id)).toEqual([1, 2, 81, 82])
    expect(deps.currentSession.value._hasOlderMessages).toBe(false)
    expect(deps.currentSession.value._oldestLoadedMessageId).toBe(1)
  })

  it('uses the rendered oldest message id when loading older messages manually', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      participants: [],
      _hasOlderMessages: true,
      _oldestLoadedMessageId: 1
    }
    const deps = createDeps(session)
    deps.sessionMessagesCache.value.session_1 = [
      { id: 81, sessionId: 'session_1', role: 'user', content: '近一点' }
    ]
    deps.buildDisplayMessages = vi.fn((_targetId, sessionId) => deps.sessionMessagesCache.value[sessionId] || [])
    mocks.fetchChatSessionBundleById.mockResolvedValueOnce({
      session,
      participants: [],
      messages: [
        { id: 79, sessionId: 'session_1', role: 'assistant', content: '更早回复' },
        { id: 80, sessionId: 'session_1', role: 'user', content: '更早一句' }
      ],
      pageInfo: { hasMore: true, oldestMessageId: 79 }
    })

    const actions = createChatStoreMessageRemoteActions(deps)

    await expect(actions.loadOlderMessages('session_1', 81)).resolves.toBe(true)

    expect(mocks.fetchChatSessionBundleById).toHaveBeenCalledWith('session_1', {
      limit: 80,
      beforeId: 81
    })
    expect(deps.sessionMessagesCache.value.session_1.map((message) => message.id)).toEqual([79, 80, 81])
    expect(deps.currentSession.value._oldestLoadedMessageId).toBe(79)
  })

  it('exposes older-message loading through the combined remote actions', async () => {
    const { createChatStoreRemoteActions } = await import('../../../src/app/chatStoreRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      participants: [],
      _hasOlderMessages: true
    }
    const deps = createDeps(session)
    deps.sessionMessagesCache.value.session_1 = [
      { id: 81, sessionId: 'session_1', role: 'user', content: '近一点' }
    ]
    mocks.fetchChatSessionBundleById.mockResolvedValueOnce({
      session,
      participants: [],
      messages: [
        { id: 80, sessionId: 'session_1', role: 'assistant', content: '更早回复' }
      ],
      pageInfo: { hasMore: true, oldestMessageId: 80 }
    })

    const actions = createChatStoreRemoteActions(deps)

    await expect(actions.loadOlderMessages('session_1', 81)).resolves.toBe(true)
    expect(mocks.fetchChatSessionBundleById).toHaveBeenCalledWith('session_1', {
      limit: 80,
      beforeId: 81
    })
  })

  it('keeps reply pipeline mode camel and snake fields synchronized after session updates', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      replyPipelineMode: 'normal_recall',
      reply_pipeline_mode: 'normal_recall'
    }
    const deps = createDeps(session)
    const actions = createChatStoreMessageRemoteActions(deps)

    await actions.updateSession('char_1', { replyPipelineMode: 'pure_prompt' })

    expect(deps.currentSession.value.replyPipelineMode).toBe('pure_prompt')
    expect(deps.currentSession.value.reply_pipeline_mode).toBe('pure_prompt')
    expect(deps.chatSessions.value.session_1.replyPipelineMode).toBe('pure_prompt')
    expect(deps.chatSessions.value.session_1.reply_pipeline_mode).toBe('pure_prompt')
  })

  it('keeps force narration camel and snake fields synchronized after session updates', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      narrationForceEnabled: false,
      narration_force_enabled: 0
    }
    const deps = createDeps(session)
    const actions = createChatStoreMessageRemoteActions(deps)

    await actions.updateSession('char_1', { narrationForceEnabled: true })

    expect(deps.currentSession.value.narrationForceEnabled).toBe(true)
    expect(deps.currentSession.value.narration_force_enabled).toBe(1)
    expect(deps.chatSessions.value.session_1.narrationForceEnabled).toBe(true)
    expect(deps.chatSessions.value.session_1.narration_force_enabled).toBe(1)
  })

  it('keeps explicit message environment fields when callers already provide them', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const session = {
      id: 'session_1',
      targetId: 'char_1',
      virtualTimeBase: new Date('2026-05-09T13:20:00+08:00').getTime(),
      virtualTimeAnchor: Date.now(),
      virtualTimeRate: 0,
      virtualWeather: '小雨',
      virtualWeatherMode: 'custom'
    }
    const actions = createChatStoreMessageRemoteActions(createDeps(session))

    await actions.addMessage('char_1', {
      role: 'assistant',
      content: '保留上层快照。',
      envDate: '上层日期',
      envWeather: '上层天气',
      envLocation: '上层地点'
    }, { sessionId: 'session_1' })

    expect(mocks.createChatMessageBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      envDate: '上层日期',
      envWeather: '上层天气',
      envLocation: '上层地点'
    }))
  })

  it('deletes multiple sessions through one batch request and clears all local projections', async () => {
    const { createChatStoreMessageRemoteActions } = await import('../../../src/app/chatStoreMessageRemoteActions')
    const sessionA = { id: 'session_a', targetId: 'char_a' }
    const sessionB = { id: 'session_b', targetId: 'char_b' }
    const deps = createDeps(sessionB)
    deps.chatSessions.value = { session_a: sessionA, session_b: sessionB }
    deps.sessionMessagesCache.value = {
      session_a: [{ id: 1 }],
      session_b: [{ id: 2 }]
    }
    deps.localStreamingMessages.value = { session_a: [{ id: 'stream_a' }], session_b: [{ id: 'stream_b' }] }
    deps.pendingPersistedMessages.value = { session_a: [{ id: 'pending_a' }], session_b: [{ id: 'pending_b' }] }
    const actions = createChatStoreMessageRemoteActions(deps)

    await actions.deleteSessions(['session_a', 'session_b'])

    expect(mocks.deleteChatSessionsByIds).toHaveBeenCalledTimes(1)
    expect(mocks.deleteChatSessionsByIds).toHaveBeenCalledWith(['session_a', 'session_b'])
    expect(deps.chatSessions.value).toEqual({})
    expect(deps.sessionMessagesCache.value).toEqual({})
    expect(deps.localStreamingMessages.value).toEqual({})
    expect(deps.pendingPersistedMessages.value).toEqual({})
    expect(deps.currentSession.value).toBeNull()
    expect(deps.currentMessages.value).toEqual([])
  })
})
