/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useChatMessageOps } from '../../../src/composables/app/useChatMessageOps.ts'
import { CHAT_HISTORY_PLACEHOLDER, DEFAULT_CURRENT_USER_INPUT_TEMPLATE } from '../../../src/utils/promptContext.ts'
import {
  createChatGenerationAttemptArtifactBySessionId,
  createChatGenerationAttemptBySessionId,
  fetchProjectionFirstMessageViewBySessionId,
  runChatMessageProjectionBySessionId
} from '../../../src/repositories/chatRepository.ts'
import {
  clearRecallTrace,
  setCurrentRecallActivity,
  setRecallActivityPanelBinding,
  setRecallActivitySidebarOpen,
  startRecallActivity,
  useRecallTraceState
} from '../../../src/app/recallTraceState.ts'
import {
  getPendingCorrection,
  setPendingCorrection,
  clearPendingCorrection
} from '../../../src/app/chatCorrectionState.ts'

vi.mock('../../../src/repositories/chatRepository.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createChatGenerationAttemptArtifactBySessionId: vi.fn(),
    createChatGenerationAttemptBySessionId: vi.fn(),
    updateChatGenerationAttemptBySessionId: vi.fn(),
    fetchLatestChatGenerationAttemptByAnchor: vi.fn(),
    fetchProjectionFirstMessageViewBySessionId: vi.fn(),
    runChatMessageProjectionBySessionId: vi.fn(),
    updateChatMessageBySessionId: vi.fn()
  }
})

describe('useChatMessageOps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchProjectionFirstMessageViewBySessionId).mockResolvedValue(undefined)
    vi.mocked(runChatMessageProjectionBySessionId).mockResolvedValue({ ok: true, data: { projection: { status: 'complete' } } })
    clearRecallTrace()
  })

  it('组装角色消息时会把情境挂载提示词透传给提示词库序列', async () => {
    const buildPromptMessages = vi.fn(() => [{ role: 'system', content: '系统提示词' }])
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore: {
        currentChatTarget: 'char_1',
        isTyping: false,
        getActiveTargetId: vi.fn(() => 'char_1'),
        getActiveSessionId: vi.fn(() => 'session_char_1'),
        setTyping: vi.fn(),
        setCurrentMessageModel: vi.fn(),
        addMessage: vi.fn(),
        deleteMessage: vi.fn(),
        editMessage: vi.fn()
      },
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages: ref([]),
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    await messageOps.buildChatMessages('char_1', '你好', [], 'char_1', {
      skipPrepareRecall: true,
      scenarioMountedPromptText: '挂载文风原文'
    })

    expect(buildPromptMessages).toHaveBeenCalledWith('char_1', 'chat', expect.objectContaining({
      scenarioMountedPromptText: '挂载文风原文'
    }))
  })

  it('重新生成优先使用正式入口控制目标和生成态', async () => {
    const currentMessages = ref([{
      id: 11,
      role: 'assistant',
      content: '旧回复',
      memberName: '星依'
    }])

    const chatStore = {
      currentChatTarget: 'legacy_target',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(async (_messages, _options, onChunk, extra) => {
        extra?.onModelInfo?.('test-model')
        onChunk?.('新回复')
        return '新回复'
      }),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      runGroupChatReplay: vi.fn()
    })

    await messageOps.regenerateMsg(0)

    expect(chatStore.getActiveTargetId).toHaveBeenCalled()
    expect(chatStore.setTyping).toHaveBeenCalledWith(true)
    expect(chatStore.setTyping).toHaveBeenLastCalledWith(false)
    expect(chatStore.setCurrentMessageModel).toHaveBeenCalledWith('test-model')
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 11, expect.objectContaining({
      content: '新回复',
      model: 'test-model'
    }))
  })

  it('动作旁白重新生成沿消息正式类型回到提调，不进入普通旁白生成', async () => {
    const currentMessages = ref([
      { id: 101, role: 'user', content: '观察敌人', messageSourceKind: 'focused_action', focusedActionGroupId: 'action_1', focusedActionVisibility: 'private' },
      { id: 102, role: 'assistant', content: '旧描写', name: '旁白', messageKind: 'narration', messageSourceKind: 'focused_action', focusedActionGroupId: 'action_1', focusedActionVisibility: 'private' }
    ])
    const regenerateFocusedAction = vi.fn(async () => true)
    const callAIStream = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ id: 'char_1', name: '星依' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore: {
        currentChatTarget: 'char_1', isTyping: false,
        getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_char_1'),
        setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn()
      },
      settingStore: { presetSendCount: 20, defaultPreset: { name: '默认' }, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' })) },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text), buildSystemPrompt: vi.fn(() => ''),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn(), regenerateFocusedAction
    })

    await messageOps.regenerateMsg(1, 'prompt_replay')

    expect(regenerateFocusedAction).toHaveBeenCalledWith(102)
    expect(callAIStream).not.toHaveBeenCalled()
  })

  it('旁白消息重新生成只更新正式旁白消息，不再同步旧承接批次', async () => {
    const currentMessages = ref([
      { id: 101, role: 'user', content: '门外怎么了？', envLocation: '旧街', envWeather: '小雨' },
      {
        id: 102,
        role: 'assistant',
        content: '旧旁白',
        name: '旁白',
        memberName: '旁白',
        messageKind: 'narration',
        narrationProfileKind: 'event_push',
        envLocation: '旧街',
        envWeather: '小雨'
      }
    ])
    const fetchMock = vi.fn(async (_url, options = {}) => {
      const method = options.method || 'GET'
      if (method === 'GET') return { ok: true, json: async () => ({}) }
      if (method === 'POST') {
        return { ok: true, json: async () => ({ id: 'prompt_log_1' }) }
      }
      if (method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (method === 'PUT') {
        return { ok: true, json: async () => ({ item: { id: 'committed_batch_1' } }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (messages, _options, onChunk, extra) => {
      extra?.onModelInfo?.('narrator-pro')
      onChunk?.('新旁白')
      expect(messages.map((message) => message.content).join('\n')).toContain('事件推进旁白必须让场景出现新的可回应变化')
      expect(messages.map((message) => message.content).join('\n')).not.toContain('急讯抵达')
      return '新旁白'
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        agentModelConfigs: [{
          id: 'brain_agent',
          narrationGenerationPresetName: 'Narrator',
          narrationGenerationModel: 'narrator-pro'
        }],
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '普通聊天系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新旁白', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 102, expect.objectContaining({
      content: '新旁白',
      messageKind: 'narration',
      memberName: '旁白',
      model: 'narrator-pro'
    }))
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/prompt-logs/by-message/102') && call[1]?.method === 'DELETE')).toBe(true)
    expect(callAIStream.mock.calls[0][0].map((message) => message.content).join('\n')).not.toContain('普通聊天系统提示')
  })

  it('普通消息重新生成会先清理旧提示词日志再写入新的提示词日志', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const fetchMock = vi.fn(async (_url, options = {}) => {
      const method = options.method || 'GET'
      if (method === 'POST') {
        return { ok: true, json: async () => ({ id: 'prompt_log_new' }) }
      }
      if (method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (method === 'PUT') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(async () => 203),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, options, onChunk, extra) => {
      await options?.onPromptPrepared?.({
        messages: [],
        finalPrompt: '普通聊天提示词',
        promptBlocks: [{ role: 'system', title: '系统区块 1', content: '普通聊天提示词' }],
        preparedAt: '2026-05-10T01:00:00.000Z'
      })
      extra?.onModelInfo?.('test-model')
      onChunk?.('新回复')
      return '新回复'
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/prompt-logs/by-message/202') && call[1]?.method === 'DELETE')).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/prompt-logs') && call[1]?.method === 'POST')).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/bind-message') && call[1]?.method === 'PUT')).toBe(true)
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 202, expect.objectContaining({
      content: '新回复',
      model: 'test-model'
    }))
  })

  it('批次 M1a：单聊角色消息重试改道导演 loop——经 regenerateAssistantViaDirector 拿正文走版本写回，不直连 callAIStream', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const fetchMock = vi.fn(async (_url, options = {}) => {
      const method = options.method || 'GET'
      if (method === 'DELETE' || method === 'PUT') return { ok: true, json: async () => ({ ok: true }) }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn()
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '导演正文', model: '导演模型', promptLogId: 'dir_log_1' }))

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream,
      regenerateAssistantViaDirector,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '导演正文', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    // 改道导演 loop：拿被重试消息 id；不再直连 callAIStream。
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(202, {})
    expect(callAIStream).not.toHaveBeenCalled()
    // 正文走现有版本写回（editMessage + versionList）。
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 202, expect.objectContaining({
      content: '导演正文',
      model: '导演模型'
    }))
    // 返回的 promptLogId 走既有绑定（PUT bind-message）。
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/bind-message') && call[1]?.method === 'PUT')).toBe(true)
  })

  it('批次 M1a：导演重试返回 null（软停/取消）时不写回、不报错', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const toast = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector: vi.fn(async () => null),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    // 软停/取消：不写回、不报错。
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  // 批次2·步骤1 重试回归基线（退役靶心·先锁现役行为再动刀）：
  // 群聊（target=group_*→isMultiCharacterSession）里对某条角色消息点重试，regenerateMsg 走
  // useDirectorRetry=false 分支 → 老 callAIStream 直连重试（不进提调/导演 loop），也不走整轮 runGroupChatReplay。
  // 批次2 把单/群重试统一成「演员活-only 轻量重跑」后此路退役；本基线保留作动刀前后逐字对比锚，
  // 退役落地时本测试应翻新为「走演员活唯一入口」并断言可见产物逐字一致（与批次1 步骤1 同范式）。
  it('U2 转正基线：群聊单条角色消息重试进提调（无定向重掷能力时落完整导演 loop，退役老 callAIStream 直连）', async () => {
    // U2（2026-06-28·Option 2）：去 !multiCharacterSession 门后，群聊普通重试也进 regenerateAssistantViaDirector
    //   （它本就 speaker 感知）。本块无注入 regenerateAssistantViaDirectedRecast → 直接落完整导演 loop；老 callAIStream 直连退役。
    const currentMessages = ref([
      { id: 301, role: 'user', content: '大家好' },
      { id: 302, role: 'assistant', content: '旧群聊回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'group_1',
      activeChatSessionId: 'session_g1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'group_1'),
      getActiveSessionId: vi.fn(() => 'session_g1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_g1', targetId: 'group_1' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, _options, onChunk, extra) => {
      extra?.onModelInfo?.('group-model')
      onChunk?.('不该被调到')
      return '不该被调到'
    })
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '提调导演正文', model: 'dir-model', promptLogId: 'dir_g1', directorStream: null }))
    const runGroupChatReplay = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'group-model' })) },
      callAIStream,
      regenerateAssistantViaDirector,
      runGroupChatReplay,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '提调导演正文', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    // U2 转正：群聊单条重试=完整导演 loop，退役老 callAIStream 直连、不进整轮 replay。
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(302, {})
    expect(callAIStream).not.toHaveBeenCalled()
    expect(runGroupChatReplay).not.toHaveBeenCalled()
    // 多角色分支写回带 speaker memberName（公共版本写回 multiCharacterSession 分支）。
    expect(chatStore.editMessage).toHaveBeenCalledWith('group_1', 302, expect.objectContaining({
      content: '提调导演正文',
      memberName: '星依',
      model: 'dir-model'
    }))
  })

  // 批次2·步骤2c 退役靶心翻新（开关 ON + 有原轮方向源时由 regenerateAssistantViaDirectedRecast 提供，模拟定向重掷可用）。
  function makeGroupRecastOps(overrides = {}) {
    const currentMessages = ref([
      { id: 301, role: 'user', content: '大家好' },
      { id: 302, role: 'assistant', content: '旧群聊回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'group_1',
      activeChatSessionId: 'session_g1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'group_1'),
      getActiveSessionId: vi.fn(() => 'session_g1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_g1', targetId: 'group_1' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, _options, onChunk, extra) => {
      extra?.onModelInfo?.('group-model')
      onChunk?.('降级老路正文')
      return '降级老路正文'
    })
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'group-model' })) },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '降级老路正文', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn(),
      ...overrides
    })
    return { messageOps, chatStore, callAIStream, currentMessages }
  }

  it('批次2·步骤2c：群聊单条重试有原轮方向源时走定向重掷——退役老 callAIStream 直连、不进导演 loop/不进整轮 replay', async () => {
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'recast', replyText: '定向重掷新正文', model: 'recast-model', promptLogId: 'recast_log_1' }))
    const regenerateAssistantViaDirector = vi.fn()
    const runGroupChatReplay = vi.fn()
    const { messageOps, chatStore, callAIStream } = makeGroupRecastOps({
      regenerateAssistantViaDirectedRecast,
      regenerateAssistantViaDirector,
      runGroupChatReplay
    })

    await messageOps.regenerateMsg(1)

    // 定向重掷接管：退役老 callAIStream 直连、不进完整导演 loop、不进整轮 replay。
    expect(regenerateAssistantViaDirectedRecast).toHaveBeenCalledWith(302)
    expect(callAIStream).not.toHaveBeenCalled()
    expect(regenerateAssistantViaDirector).not.toHaveBeenCalled()
    expect(runGroupChatReplay).not.toHaveBeenCalled()
    // 正文走现有版本写回，群聊带 speaker memberName。
    expect(chatStore.editMessage).toHaveBeenCalledWith('group_1', 302, expect.objectContaining({
      content: '定向重掷新正文',
      memberName: '星依',
      model: 'recast-model'
    }))
  })

  it('U2 转正：群聊单条重试无方向源（unavailable）时落完整导演 loop（不再老 callAIStream 直连）', async () => {
    // U2（Option 2）：无源群聊重试不再降级老直连，而是落 regenerateAssistantViaDirector 重跑一轮提调定方向。
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'unavailable' }))
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '无源重跑提调正文', model: 'dir-model', promptLogId: 'dir_g2', directorStream: null }))
    const { messageOps, chatStore, callAIStream } = makeGroupRecastOps({ regenerateAssistantViaDirectedRecast, regenerateAssistantViaDirector })

    await messageOps.regenerateMsg(1)

    // 无源：定向重掷被询问→unavailable→落完整导演 loop（进提调，不走老 callAIStream）。
    expect(regenerateAssistantViaDirectedRecast).toHaveBeenCalledWith(302)
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(302, {})
    expect(callAIStream).not.toHaveBeenCalled()
    expect(chatStore.editMessage).toHaveBeenCalledWith('group_1', 302, expect.objectContaining({
      content: '无源重跑提调正文',
      memberName: '星依',
      model: 'dir-model'
    }))
  })

  it('批次2·步骤2b：定向重掷软停（softstop）时不写回、保留旧版本', async () => {
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'softstop' }))
    const { messageOps, chatStore, callAIStream } = makeGroupRecastOps({ regenerateAssistantViaDirectedRecast })

    await messageOps.regenerateMsg(1)

    expect(regenerateAssistantViaDirectedRecast).toHaveBeenCalledWith(302)
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(callAIStream).not.toHaveBeenCalled()
  })

  it('批次2·步骤2b 分流：带重试意见时不走定向重掷，仍走现役导演 loop（regenerateAssistantViaDirector）', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'recast', replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '按意见改后的正文', model: 'dir-model', promptLogId: '', directorStream: null }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirectedRecast,
      regenerateAssistantViaDirector,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1, 'recall', { instruction: '改委婉点' })

    // 带意见=分流到现役导演 loop，定向重掷一次不调。
    expect(regenerateAssistantViaDirectedRecast).not.toHaveBeenCalled()
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ instruction: '改委婉点' }))
  })

  it('U2 转正：群聊带意见重试也进提调（导演 loop + retryBrief），不走定向重掷/不走老 callAIStream', async () => {
    // U2（Option 2）：群聊带意见重试与单聊同口径——分流到 regenerateAssistantViaDirector 带 instruction。
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'recast', replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '群聊按意见改后的正文', model: 'dir-model', promptLogId: '', directorStream: null }))
    const { messageOps, callAIStream } = makeGroupRecastOps({ regenerateAssistantViaDirectedRecast, regenerateAssistantViaDirector })

    await messageOps.regenerateMsg(1, 'recall', { instruction: '群聊改委婉点' })

    expect(regenerateAssistantViaDirectedRecast).not.toHaveBeenCalled()
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(302, expect.objectContaining({ instruction: '群聊改委婉点' }))
    expect(callAIStream).not.toHaveBeenCalled()
  })

  it('U2 边界：pure-prompt 群聊会话重试仍走 else 老 callAIStream 直连（shouldUseReplyWorkflowReply=false·提调不接管）', async () => {
    // U2（Option 2）：else 老 callAIStream 直连保留作纯净回复兜底——pure_prompt 与群聊正交，pure-prompt 群聊重试不进提调。
    const currentMessages = ref([
      { id: 301, role: 'user', content: '大家好' },
      { id: 302, role: 'assistant', content: '旧群聊回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'group_1',
      activeChatSessionId: 'session_g1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'group_1'),
      getActiveSessionId: vi.fn(() => 'session_g1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_g1', targetId: 'group_1', replyPipelineMode: 'pure_prompt' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, _options, onChunk, extra) => {
      extra?.onModelInfo?.('group-model')
      onChunk?.('纯净回复群聊正文')
      return '纯净回复群聊正文'
    })
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '不该被调到', model: 'm', promptLogId: '', directorStream: null }))
    const regenerateAssistantViaDirectedRecast = vi.fn(async () => ({ status: 'recast', replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'group-model' })) },
      callAIStream,
      regenerateAssistantViaDirector,
      regenerateAssistantViaDirectedRecast,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '纯净回复群聊正文', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    // pure-prompt：提调两入口都不接管，走 else 老 callAIStream 直连，群聊带 memberName。
    expect(regenerateAssistantViaDirector).not.toHaveBeenCalled()
    expect(regenerateAssistantViaDirectedRecast).not.toHaveBeenCalled()
    expect(callAIStream).toHaveBeenCalled()
    expect(chatStore.editMessage).toHaveBeenCalledWith('group_1', 302, expect.objectContaining({
      content: '纯净回复群聊正文',
      memberName: '星依'
    }))
  })

  it('批次 M3：applyDirectorPrecisionEdits 把每条精修改动作新版本写回（多条各自落版本）', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' },
      { id: 203, role: 'assistant', messageKind: 'narration', content: '窗外月色清冷。' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1' })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const editChatMessagesViaDirector = vi.fn(async () => ({
      edits: [
        { messageId: 202, ref: '角色1', speakerName: '星依', content: '是啊，夜色正好。' },
        { messageId: 203, ref: '旁白1', speakerName: '旁白', content: '窗外月色温柔。' }
      ]
    }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      editChatMessagesViaDirector,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    const ok = await messageOps.applyDirectorPrecisionEdits('角色1、旁白1 改一下')
    expect(ok).toBe(true)
    // 即时落库（批次1）：精修入口透传 onEditCommitted 回调给 pipeline，使每步当场写回。
    expect(editChatMessagesViaDirector).toHaveBeenCalledWith('角色1、旁白1 改一下', expect.objectContaining({ onEditCommitted: expect.any(Function) }))
    // 各自作新版本写回：角色消息 202 + 旁白 203 各一次 editMessage。
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 202, expect.objectContaining({ content: '是啊，夜色正好。', activeVersionIndex: expect.any(Number) }))
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 203, expect.objectContaining({ content: '窗外月色温柔。' }))
    // 内存消息也同步更新为新版本内容。
    expect(currentMessages.value[1].content).toBe('是啊，夜色正好。')
    expect(currentMessages.value[2].content).toBe('窗外月色温柔。')
  })

  it('精修接续落库（用户 2026-06-20）：把累加快照接续落到最近一轮角色消息——内存回填 _processTrace + 写 clean_retry directorStream artifact', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    vi.mocked(createChatGenerationAttemptBySessionId).mockResolvedValue({ id: 'attempt_edit_1' })
    vi.mocked(createChatGenerationAttemptArtifactBySessionId).mockResolvedValue(undefined)
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const snapshot = {
      phase: 'done', currentAction: '',
      decisions: [{ id: 'd1', kind: 'situation', text: '判断为闲聊' }, { id: 'r1', kind: 'note', text: '据用户精修：角色1 改委婉点' }],
      shots: [{ id: 's1', kind: 'character', label: '星依', order: 1, direction: '附和用户' }]
    }
    const editChatMessagesViaDirector = vi.fn(async () => ({
      edits: [{ messageId: 202, ref: '角色1', speakerName: '星依', content: '是啊，夜色正好。' }],
      directorStream: snapshot,
      anchorAssistantMessageId: 202
    }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      editChatMessagesViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    const ok = await messageOps.applyDirectorPrecisionEdits('角色1 改委婉点')
    expect(ok).toBe(true)
    // 内存回填：最近一轮角色消息（202）的 _processTrace 带上接续后的导演带快照（刷新前即显示）。
    expect(currentMessages.value[1]._processTrace.directorStream).toEqual(snapshot)
    // 跨刷新：写 clean_retry artifact（只带 directorStream、锚 202），刷新后该轮历史复原走新带。
    expect(createChatGenerationAttemptArtifactBySessionId).toHaveBeenCalledWith('session_1', expect.objectContaining({
      artifactKind: 'clean_retry',
      messageId: 202,
      payload: { processSummary: { steps: {}, directorStream: snapshot } }
    }))
  })

  it('批次 M3：精修返回 null（软停/取消/无目标）时不写回、返回 false', async () => {
    const currentMessages = ref([{ id: 202, role: 'assistant', content: '旧', memberName: '星依' }])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({})), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      editChatMessagesViaDirector: vi.fn(async () => null),
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })
    const ok = await messageOps.applyDirectorPrecisionEdits('角色1 改')
    expect(ok).toBe(false)
    expect(chatStore.editMessage).not.toHaveBeenCalled()
  })

  it('智能二选一（#1）：纠偏栏不带楼层号 → 对上一轮角色消息纠偏续跑（regenerateAssistantViaDirector 带 correctionText），不走精修', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '附和正文', model: '导演模型', promptLogId: '' }))
    const editChatMessagesViaDirector = vi.fn(async () => ({ edits: [] }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector,
      editChatMessagesViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '附和正文', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('大小姐心情好，会附和我')
    // 无楼层号：走纠偏续跑（导演重试 + correctionText），不调精修。
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ correctionText: '大小姐心情好，会附和我' }))
    expect(editChatMessagesViaDirector).not.toHaveBeenCalled()
  })

  it('批次P3a：纠偏栏自由文本 → 三策 loop 择中策(prompt-regen) → 重生成正文作新版本写回，不回退重排', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'prompt-regen',
      edits: [],
      regenerations: [{ messageId: 202, ref: '角色1', speakerName: '星依', content: '按原提示重出的新正文', promptLogId: 'log_new' }],
      escalation: null,
      anchorAssistantMessageId: 202
    }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector,
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('按原提示再出一版')
    // 先走三策 loop（带被纠偏消息 id 202 + 纠偏文本）
    expect(correctChatMessageViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ correctionText: '按原提示再出一版' }))
    // 中策重生成正文作新版本写回到 202，不回退现役整轮重排
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 202, expect.objectContaining({ content: '按原提示重出的新正文', activeVersionIndex: expect.any(Number) }))
    expect(currentMessages.value[1].content).toBe('按原提示重出的新正文')
    expect(regenerateAssistantViaDirector).not.toHaveBeenCalled()
  })

  // 批次1(D)·续接带原始指令：异常终止/刷新后（无内存挂起态）输入「继续」→ 读回已落库的用户原始纠偏指令，
  // 高权重回灌进续接指令 + 显式以 userInstruction 透传纯原始指令（防把续接说明当原始指令再存、防嵌套）。
  it('批次1(D)：无挂起态输入「继续」→ 读回原始指令、高权重回灌 + userInstruction 透传纯原始指令', async () => {
    clearPendingCorrection()
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'prompt-regen', edits: [],
      regenerations: [{ messageId: 202, ref: '角色1', speakerName: '星依', content: '扩写后的新正文', promptLogId: 'log_new' }],
      escalation: null, anchorAssistantMessageId: 202
    }))
    const resolveDirectorOriginalInstruction = vi.fn(async () => '旁白文字扩充到500字')
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      correctChatMessageViaDirector,
      resolveDirectorOriginalInstruction,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('继续')
    // 读回原始指令（按目标消息 202）
    expect(resolveDirectorOriginalInstruction).toHaveBeenCalledWith(202)
    // 续接指令高权重回灌原始指令原话；userInstruction 透传纯原始指令（防嵌套）
    const [calledTargetId, calledOptions] = correctChatMessageViaDirector.mock.calls[0]
    expect(calledTargetId).toBe(202)
    expect(calledOptions.userInstruction).toBe('旁白文字扩充到500字')
    expect(calledOptions.correctionText).toContain('旁白文字扩充到500字')
    expect(calledOptions.correctionText).toContain('最高优先')
  })

  // 批次1(D)·重试路径补接：重试某条消息软停（pending.retryInstruction 持原始重试意见）后输入「继续」→
  // 续接把原始重试意见高权重回灌（不丢用户的命令）、续跑仍走重试方法并带上原始 instruction。
  it('批次1(D)：askUser 提问态下输入「继续」→ 原始指令高权重回灌 + 续跑锚定挂起轮目标消息', async () => {
    clearPendingCorrection()
    const currentMessages = ref([
      { id: 201, role: 'user', content: '上一句' },
      { id: 202, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async (_url, options = {}) => {
      const method = options.method || 'GET'
      if (method === 'DELETE' || method === 'PUT') return { ok: true, json: async () => ({ ok: true }) }
      return { ok: true, json: async () => ({}) }
    }))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {}),
      clearLocalStreamingMessages: vi.fn()
    }
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'direct-edit', edits: [], regenerations: [], escalation: null, reprojectTargets: []
    }))
    // 批次1(D)：pending.correction 为空时从已落库带捞回原始指令。
    const resolveDirectorOriginalInstruction = vi.fn(async () => '把语气改委婉')
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      correctChatMessageViaDirector,
      resolveDirectorOriginalInstruction,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    // askUser 提问态留下的挂起态：correctionTargetMessageId=202、correction 为空（原始指令在已落库带里）。
    setPendingCorrection({
      sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 201, anchorIndex: 0,
      baseUserContent: '上一句', parentAttemptId: '', replacedMessageIds: [], correction: '',
      correctionTargetMessageId: 202
    })

    await messageOps.applyDirectorPrecisionEdits('继续')
    // 续跑走三策 loop 锚定挂起轮目标消息；correctionText 带高权重续接框架（含捞回的原话）。
    expect(correctChatMessageViaDirector).toHaveBeenCalled()
    const [calledId, calledOptions] = correctChatMessageViaDirector.mock.calls[0]
    expect(calledId).toBe(202)
    expect(calledOptions.correctionText).toContain('把语气改委婉')
    expect(calledOptions.correctionText).toContain('最高优先')
    expect(calledOptions.userInstruction).toBe('把语气改委婉')
  })

  it('B3：中策重生成那一步触发 onRegenerateBegin → 目标消息切到重试占位（regeneratingMessageIndex+typing），写回后复位', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    // 捕获「重生成那一步」时的占位状态：onRegenerateBegin 应已把目标消息(202，索引1)设进占位并 setTyping(true)。
    let midFlight = null
    const correctChatMessageViaDirector = vi.fn(async (_id, options) => {
      options.onRegenerateBegin?.(202)
      midFlight = {
        index: messageOps.regeneratingMessageIndex.value,
        typingTrue: chatStore.setTyping.mock.calls.some((c) => c[0] === true)
      }
      return {
        strategy: 'prompt-regen',
        edits: [],
        regenerations: [{ messageId: 202, ref: '角色1', speakerName: '星依', content: '占位回填的新正文', promptLogId: 'log_new' }],
        escalation: null,
        anchorAssistantMessageId: 202
      }
    })
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('按原提示再出一版')
    // 重生成那一步：目标消息(202)被切到重试占位（索引1）、typing 已置 true
    expect(midFlight).not.toBeNull()
    expect(midFlight.index).toBe(1)
    expect(midFlight.typingTrue).toBe(true)
    // 写回新版本后占位复位：index 归 -1、typing 收 false
    expect(messageOps.regeneratingMessageIndex.value).toBe(-1)
    expect(chatStore.setTyping).toHaveBeenLastCalledWith(false)
    expect(currentMessages.value[1].content).toBe('占位回填的新正文')
  })

  it('B4：中策重生成结果为空 → 不写回（保留原内容=回退）+ 顶部错误提示，绝不静默清空', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const toast = vi.fn()
    const correctChatMessageViaDirector = vi.fn(async (_id, options) => {
      options.onRegenerateBegin?.(202)
      return {
        strategy: 'prompt-regen',
        edits: [],
        regenerations: [{ messageId: 202, ref: '角色1', speakerName: '星依', content: '   ', promptLogId: 'log_new' }],
        escalation: null,
        anchorAssistantMessageId: 202
      }
    })
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast, currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('按原提示再出一版')
    // 空正文不写回：editMessage 没被调用，原消息内容保持不变（回退）
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(currentMessages.value[1].content).toBe('是啊，凉风正好。')
    // 顶部错误提示
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('保留原内容'), 'error')
    // 占位复位
    expect(messageOps.regeneratingMessageIndex.value).toBe(-1)
  })

  it('B4：重生成那一步抛错 → 顶部错误提示 + 保留原消息 + 占位复位，不二次回退 replan', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const toast = vi.fn()
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const correctChatMessageViaDirector = vi.fn(async (_id, options) => {
      options.onRegenerateBegin?.(202)
      throw new Error('模型重生成超时')
    })
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector,
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast, currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    // 不应把异常抛回组件层（避免未捕获 rejection）
    await expect(messageOps.applyDirectorPrecisionEdits('按原提示再出一版')).resolves.not.toThrow()
    // 顶部错误提示 + 原消息保留 + 不二次回退 replan
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('提调纠偏失败'), 'error')
    expect(currentMessages.value[1].content).toBe('是啊，凉风正好。')
    expect(regenerateAssistantViaDirector).not.toHaveBeenCalled()
    // 占位复位：index 归 -1、typing 收 false
    expect(messageOps.regeneratingMessageIndex.value).toBe(-1)
    expect(chatStore.setTyping).toHaveBeenLastCalledWith(false)
  })

  it('批次P3a：三策 loop 升级到下策(escalate) → 回退现役整轮重判情境重排', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '重排后的正文', model: 'm', promptLogId: '' }))
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'escalate',
      edits: [],
      regenerations: [],
      escalation: { reason: '情境判错，要重排' }
    }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector,
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '重排后的正文', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('这根本不该是闲聊')
    expect(correctChatMessageViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ correctionText: '这根本不该是闲聊' }))
    // 下策升级 → 回退现役整轮重判情境重排（regenerateAssistantViaDirector 带 correctionText 续跑）
    expect(regenerateAssistantViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ correctionText: '这根本不该是闲聊' }))
  })

  it('Batch 1：群聊 escalate 已就地整轮无缝重排(escalationHandledInline) → 不再冷启动 regenerateAssistantViaDirector', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '今晚天气不错' },
      { id: 202, role: 'assistant', content: '是啊，凉风正好。', memberName: '星依' }
    ])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    // pipeline 已在本 run 内整轮重排完成（删旧+重判情境+逐角色重排），ops 据 escalationHandledInline 当已处理。
    const regenerateAssistantViaDirector = vi.fn(async () => ({ replyText: '不该被调到', model: 'm', promptLogId: '' }))
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'escalate',
      edits: [],
      regenerations: [],
      escalation: { reason: '情境判错，要重排' },
      escalationHandledInline: true
    }))
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      regenerateAssistantViaDirector,
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(), currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await messageOps.applyDirectorPrecisionEdits('这根本不该是闲聊')
    expect(correctChatMessageViaDirector).toHaveBeenCalledWith(202, expect.objectContaining({ correctionText: '这根本不该是闲聊' }))
    // 已就地无缝重排 → 绝不再走冷启动单条重生成
    expect(regenerateAssistantViaDirector).not.toHaveBeenCalled()
  })

  it('提调自由文本会忽略旧 narration_debug；没有角色楼层时仍锚到用户消息启动正式 Agent 轮', async () => {
    const currentMessages = ref([
      { id: 201, role: 'user', content: '刚才为什么失败了？' },
      { id: 202, role: 'assistant', messageKind: 'narration_debug', content: '旧调试详情' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1', activeChatSessionId: 'session_1', isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
      setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
      addMessage: vi.fn(), deleteMessage: vi.fn(), editMessage: vi.fn(async () => {})
    }
    const correctChatMessageViaDirector = vi.fn(async () => ({
      strategy: 'chat-only',
      edits: [],
      regenerations: [],
      escalation: null,
      narrationCreations: [],
      reprojectTargets: []
    }))
    const toast = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: { getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })), characters: [{ id: 'char_1', name: '星依' }] },
      chatStore,
      settingStore: { defaultPreset: { name: '默认预设' }, presetSendCount: 20, currentLocation: '', getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' })) },
      callAIStream: vi.fn(),
      correctChatMessageViaDirector,
      cleanAiPrefix: vi.fn((text) => text), buildSystemPrompt: vi.fn(() => ''), buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast, currentMessages, currentScene: ref('chat'), streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn()
    })

    await expect(messageOps.applyDirectorPrecisionEdits('你看见我这句话了吗？')).resolves.toBe(true)

    expect(correctChatMessageViaDirector).toHaveBeenCalledWith(201, expect.objectContaining({
      correctionText: '你看见我这句话了吗？',
      anchorMessageId: 201,
      allowUnanchoredChat: true
    }))
    expect(correctChatMessageViaDirector).not.toHaveBeenCalledWith(202, expect.anything())
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('还没有可纠偏'), 'warning')
  })

  it('删除消息优先使用正式目标入口', () => {
    const currentMessages = ref([{ id: 22, role: 'assistant', content: '待删除' }])
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => onConfirm())

    const chatStore = {
      currentChatTarget: 'legacy_target',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_2'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(),
        characters: []
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({}))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      openConfirmDialog,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      runGroupChatReplay: vi.fn()
    })

    messageOps.deleteMessage(0)

    expect(openConfirmDialog).toHaveBeenCalledWith('删除消息', '确定删除这条消息吗？删除后无法恢复。', expect.any(Function))
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_2', 22)
  })

  it('没有 setTyping 时会回写聊天运行态分组入口', async () => {
    const currentMessages = ref([{
      id: 31,
      role: 'assistant',
      content: '旧回复',
      memberName: '星依'
    }])

    const runtimeTyping = ref(false)
    const chatStore = {
      current: {
        currentChatTarget: ref('char_3'),
        getActiveTargetId: vi.fn(() => 'char_3')
      },
      runtime: {
        isTyping: runtimeTyping
      },
      currentChatTarget: 'legacy_target',
      isTyping: false,
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_3', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(async (_messages, _options, onChunk, extra) => {
        extra?.onModelInfo?.('test-model')
        onChunk?.('新回复')
        return '新回复'
      }),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      runGroupChatReplay: vi.fn()
    })

    await messageOps.regenerateMsg(0)

    expect(chatStore.current.getActiveTargetId).toHaveBeenCalled()
    expect(runtimeTyping.value).toBe(false)
  })

  it('发送给 AI 前会把同一角色的连续历史输出合成一条消息', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '', [
      { role: 'assistant', name: '星依', content: '第一句。' },
      { role: 'assistant', name: '星依', content: '星依：第二句。' },
      { role: 'user', name: '用户', content: '收到。' }
    ])

    expect(messages).toEqual([
      { role: 'assistant', content: '星依：第一句。\n\n第二句。' },
      { role: 'user', content: '用户：收到。' },
      {
        role: 'user',
        content: expect.stringContaining('【本轮用户输入｜最高优先级】')
      }
    ])
    expect(messages.at(-1).content).toContain('原文：\n收到。')
    expect(messages.at(-1).content).not.toContain('规则：')
  })

  it('发送给 AI 的角色历史不会携带 think 思考过程', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '继续', [
      { role: 'assistant', name: '星依', content: '<think>这里是角色思考，不能进入下一轮提示词</think>\n星依：正式回复。' },
      { role: 'user', name: '用户', content: '继续' }
    ])
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(joined).not.toContain('<think>')
    expect(joined).not.toContain('这里是角色思考')
    expect(joined).toContain('星依：正式回复。')
    expect(messages.at(-1).content).toContain('原文：\n继续')
  })

  it('历史用户消息带附件时（点B）追加 caption 文字，一律不带原生图（省 token）', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    // attachmentsJson（驼峰、已解析数组）是真实生产形状：chatStore.currentMessages 经服务端 toCamel 转换
    // （DB 列 attachments_json → 驼峰键 attachmentsJson，且值自动 JSON.parse 成数组），不是 attachments_json 字符串。
    const messages = await messageOps.buildChatMessages('char_1', '继续', [
      {
        role: 'user',
        name: '用户',
        content: '看看这张图',
        attachmentsJson: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }]
      }
    ])

    const historyMessage = messages.find((message) => typeof message.content === 'string' && message.content.startsWith('用户：'))
    expect(historyMessage.content).toBe('用户：看看这张图\n[图片1：一只猫]')
    // 历史消息一律纯文字，不出现 parts 数组（当轮才带原生图，见 useAI.ts）。
    expect(typeof historyMessage.content).toBe('string')
  })

  it('发送给 AI 的角色历史不会携带旁白调试审计消息', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '继续', [
      { role: 'user', name: '用户', content: '前往河谷' },
      { role: 'assistant', name: '旁白快判', messageKind: 'narration_debug', content: '是' },
      { role: 'assistant', name: '星依', content: '到了。' }
    ])
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(joined).toContain('用户：前往河谷')
    expect(joined).toContain('星依：到了。')
    expect(joined).not.toContain('旁白快判')
    expect(joined).not.toContain('\n是')
  })

  it('普通召回和最终提示词共用 projection-first 消息视图', async () => {
    vi.mocked(fetchProjectionFirstMessageViewBySessionId).mockResolvedValue({
      sessionId: 'session_1',
      characterId: 'char_1',
      windowSize: 23,
      fallbackJobs: [],
      items: [
        {
          id: 7,
          sessionId: 'session_1',
          messageId: 7,
          projectionId: 'proj_7',
          projectionStatus: 'complete',
          role: 'assistant',
          messageKind: 'chat',
          speakerName: '星依',
          name: '星依',
          memberName: '星依',
          content: '投影事实：星依发现旧桥密信。',
          fact: '投影事实：星依发现旧桥密信。',
          startEnv: {},
          endEnv: {},
          changed: {},
          fallbackSource: 'projection',
          fallbackReason: '',
          needsProjectionRun: false
        },
        {
          id: 8,
          sessionId: 'session_1',
          messageId: 8,
          projectionId: 'proj_8',
          projectionStatus: 'complete',
          role: 'user',
          messageKind: 'chat',
          speakerName: '用户',
          name: '用户',
          memberName: '用户',
          content: '投影事实：用户继续追问。',
          fact: '投影事实：用户继续追问。',
          startEnv: {},
          endEnv: {},
          changed: {},
          fallbackSource: 'projection',
          fallbackReason: '',
          needsProjectionRun: false
        }
      ]
    })
    const prepareAIRecall = vi.fn(async () => {})
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn(),
      prepareAIRecall
    })

    const messages = await messageOps.buildChatMessages('char_1', '继续', [
      { id: 7, role: 'assistant', name: '星依', content: '第四轮还在明文。' },
      { id: 8, role: 'user', name: '用户', content: '继续' }
    ])
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(fetchProjectionFirstMessageViewBySessionId).toHaveBeenCalledWith('session_1', {
      characterId: 'char_1',
      windowSize: 23,
      currentMessageIds: [8]
    })
    expect(prepareAIRecall).toHaveBeenCalledWith('char_1', expect.objectContaining({
      visibleMessagesOverride: expect.arrayContaining([
        expect.objectContaining({ messageId: 7, content: '投影事实：星依发现旧桥密信。', fallbackSource: 'projection' }),
        expect.objectContaining({ messageId: 8, content: '投影事实：用户继续追问。', fallbackSource: 'projection' })
      ])
    }))
    expect(joined).toContain('星依：投影事实：星依发现旧桥密信。')
    expect(joined).toContain('用户：投影事实：用户继续追问。')
    expect(joined).not.toContain('第四轮还在明文。')
  })

  it('地点快判更新后会把地点变化提醒插入普通聊天提示词', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        virtualLocationLarge: '维斯珂',
        virtualLocationMiddle: '街道',
        virtualLocationSmall: '河谷',
        virtualLocation: '维斯珂 / 街道 / 河谷'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '继续', [
      { role: 'user', name: '用户', content: '前往河谷', envLocation: '维斯珂 / 街道 / 街口' },
      { role: 'assistant', name: '旁白场景分析', messageKind: 'narration_debug', content: '场景转换判断：\n时间变化：否\n当前时间：未变\n地点变化：是\n当前大地点：维斯珂\n当前中地点：街道\n当前小地点：河谷\n当前地点：维斯珂 / 街道 / 河谷\n依据：用户前往河谷' }
    ])
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(joined).toContain('【地点变化提醒】')
    expect(joined).toContain('上一地点：维斯珂 / 街道 / 街口')
    expect(joined).toContain('当前地点：维斯珂 / 街道 / 河谷')
    expect(joined).toContain('本次生成聊天区内容时，必须以当前地点为准')
    expect(joined.indexOf('【地点变化提醒】')).toBeLessThan(joined.indexOf('【本轮用户输入｜最高优先级】'))
    expect(joined).not.toContain('旁白场景分析')
  })

  it('发送给 AI 的最后一条消息会明确标出本轮用户输入', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '星依' } : null),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '星依' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '包子豆浆吧？', [
      { role: 'user', name: '用户', content: '好困，但是画完这个单子就有100块钱。' },
      { role: 'assistant', name: '星依', content: '用户加油。' },
      { role: 'user', name: '用户', content: '好呀，谢谢宝们的提醒，至于早上吃啥……吃点包子豆浆吧？咋样星依？' }
    ])

    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('【本轮用户输入｜最高优先级】')
    })
    expect(messages.at(-1).content).toContain('说话人：用户')
    expect(messages.at(-1).content).toContain('原文：\n包子豆浆吧？')
    expect(messages.at(-1).content).not.toContain('100块钱')
  })

  it('空召回构建可以跳过本轮用户输入占位，避免同一句变成新发言', async () => {
    const currentMessages = ref([])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn((id) => id === 'char_1' ? { id, name: '薇尔莉特' } : null),
        characters: [{ id: 'char_1', name: '薇尔莉特' }]
      },
      chatStore,
      settingStore: {
        presetSendCount: 20,
        defaultPreset: { name: '默认' },
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: vi.fn(() => [
        { role: 'system', content: CHAT_HISTORY_PLACEHOLDER },
        { role: 'user', content: DEFAULT_CURRENT_USER_INPUT_TEMPLATE }
      ]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn((id) => id === 'char_1' ? '薇尔莉特' : id),
      scrollToBottom: vi.fn()
    })

    const messages = await messageOps.buildChatMessages('char_1', '不要离开我', [
      { id: 123, role: 'user', name: '用户', content: '不要离开我' },
      { role: 'assistant', name: '薇尔莉特', content: '我听见了。' }
    ], 'char_1', {
      skipPrepareRecall: true,
      forceEmptyRecall: true,
      forceEmptyRoleProfile: true,
      suppressCurrentUserInputTemplate: true
    })
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(joined).not.toContain('【本轮用户输入｜最高优先级】')
    expect(joined.match(/不要离开我/g)).toHaveLength(1)
    expect(messages.at(-1)).toEqual({
      role: 'assistant',
      content: '薇尔莉特：我听见了。'
    })
  })

  it('重新生成遇到空回复时不覆盖原消息，并提示用户重试', async () => {
    const currentMessages = ref([{
      id: 41,
      role: 'assistant',
      content: '原回复',
      memberName: '星依'
    }])
    const toast = vi.fn()
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(async () => ''),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(0)

    expect(chatStore.clearStopRequest).toHaveBeenCalled()
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('模型没有返回可显示的回复，请稍后重试或换个预设', 'warning')
  })

  it('按原提示词重试会复用消息绑定提示词日志而不重新装配召回', async () => {
    const currentMessages = ref([{
      id: 45,
      role: 'assistant',
      content: '原回复',
      memberName: '星依'
    }])
    const fetchMock = vi.fn(async (url, options = {}) => {
      const method = options.method || 'GET'
      if (String(url).includes('/prompt-logs/locate/45')) {
        return {
          ok: true,
          json: async () => ({
            logId: 'prompt_log_old',
            page: 1,
            entry: {
              id: 'prompt_log_old',
              sessionId: 'session_1',
              speakerName: '星依',
              targetId: 'char_1',
              finalPrompt: '旧完整提示词',
              promptBlocks: [
                { role: 'system', title: '系统', content: '旧系统提示' },
                { role: 'user', title: '用户', content: '旧用户提示' }
              ],
              createdAt: '2026-05-10T01:00:00.000Z'
            }
          })
        }
      }
      if (String(url).includes('/prompt-logs') && method === 'POST') {
        return { ok: true, json: async () => ({ id: 'prompt_log_replay' }) }
      }
      if (String(url).includes('/prompt-logs/by-message/45') && method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (String(url).includes('/bind-message') && method === 'PUT') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'personality_model'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const buildPromptMessages = vi.fn(() => [{ role: 'system', content: '新装配提示词' }])
    const callAIStream = vi.fn(async (messages, options, onChunk, extra) => {
      expect(messages).toEqual([
        { role: 'system', content: '旧系统提示' },
        { role: 'user', content: '旧用户提示' }
      ])
      await options?.onPromptPrepared?.({
        messages,
        finalPrompt: '重放提示词',
        promptBlocks: [
          { role: 'system', title: '系统区块 1', content: '旧系统提示' },
          { role: 'user', title: '用户区块 2', content: '旧用户提示' }
        ],
        preparedAt: '2026-05-10T01:01:00.000Z'
      })
      extra?.onModelInfo?.('test-model')
      onChunk?.('重放新回复')
      return '重放新回复'
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(0, 'prompt_replay')

    expect(buildPromptMessages).not.toHaveBeenCalled()
    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 45, expect.objectContaining({
      content: '重放新回复',
      model: 'test-model'
    }))
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/prompt-logs/by-message/45') && call[1]?.method === 'DELETE')).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/bind-message') && call[1]?.method === 'PUT')).toBe(true)
    expect(runChatMessageProjectionBySessionId).toHaveBeenCalledWith('session_1', 45, { promptLogMode: 'background' })
  })

  it('CAPS 角色消息按原提示词重试会被退役保护拦截', async () => {
    const currentMessages = ref([
      { id: 70, role: 'user', content: '刚才那句换个说法。' },
      { id: 71, role: 'assistant', messageKind: 'narration_debug', content: '编码单元调试' },
      {
        id: 72,
        role: 'assistant',
        content: '旧 CAPS 回复',
        memberName: '张元英',
        messageKind: 'caps_reply',
        message_kind: 'caps_reply'
      }
    ])
    const fetchMock = vi.fn(async (url, options = {}) => {
      const method = options.method || 'GET'
      if (String(url).includes('/prompt-logs/locate/72')) {
        return {
          ok: true,
          json: async () => ({
            logId: 'caps_prompt_log_old',
            page: 1,
            entry: {
              id: 'caps_prompt_log_old',
              sessionId: 'session_1',
              speakerName: '张元英',
              targetId: 'char_1',
              finalPrompt: 'CAPS 最终回复提示词',
              promptBlocks: [
                { role: 'system', title: '系统', content: 'CAPS 最终系统提示' },
                { role: 'user', title: '用户', content: 'CAPS 网络产物补丁 + 本轮回复要求' }
              ],
              createdAt: '2026-05-10T01:00:00.000Z'
            }
          })
        }
      }
      if (String(url).includes('/prompt-logs') && method === 'POST') {
        return { ok: true, json: async () => ({ id: 'caps_prompt_log_replay' }) }
      }
      if (String(url).includes('/prompt-logs/by-message/72') && method === 'DELETE') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      if (String(url).includes('/bind-message') && method === 'PUT') {
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const resendUserMessage = vi.fn(async () => {})
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'caps_network'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (messages, options, onChunk, extra) => {
      expect(messages).toEqual([
        { role: 'system', content: 'CAPS 最终系统提示' },
        { role: 'user', content: 'CAPS 网络产物补丁 + 本轮回复要求' }
      ])
      await options?.onPromptPrepared?.({
        messages,
        finalPrompt: 'CAPS 重放提示词',
        promptBlocks: [
          { role: 'system', title: '系统区块 1', content: 'CAPS 最终系统提示' },
          { role: 'user', title: '用户区块 2', content: 'CAPS 网络产物补丁 + 本轮回复要求' }
        ],
        preparedAt: '2026-05-10T01:01:00.000Z'
      })
      extra?.onModelInfo?.('test-model')
      onChunk?.('只改最终角色回复')
      return '只改最终角色回复'
    })
    const callAI = vi.fn(async () => JSON.stringify({
      characterFrames: [{
        characterId: 'char_1',
        hasEmotionChange: true,
        sourceMessageIds: ['70', '72'],
        impactScope: 'direct',
        situationTags: ['retry'],
        pressureLevel: 'small',
        relationshipSignal: '不该由 CAPS 提示词重放触发',
        reason: 'CAPS 提示词重放不进入旧情绪潮汐。'
      }]
    }))

    const toast = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '张元英' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAI,
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: vi.fn(() => [{ role: 'system', content: '不应重新装配普通召回' }]),
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '张元英'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    await messageOps.regenerateMsg(2, 'prompt_replay')

    expect(resendUserMessage).not.toHaveBeenCalled()
    expect(chatStore.deleteMessage).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(callAIStream).not.toHaveBeenCalled()
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('已退役'), 'warning')
    expect(callAI).not.toHaveBeenCalled()
    expect(runChatMessageProjectionBySessionId).not.toHaveBeenCalled()
    expect(currentMessages.value[1].content).toBe('编码单元调试')
  })

  it('编辑后重新生成会删除被编辑消息下方全部消息', async () => {
    const currentMessages = ref([
      { id: 51, role: 'user', content: '改前' },
      { id: 52, role: 'assistant', content: '旧回复一' },
      { id: 53, role: 'user', content: '旧追问' },
      { id: 54, role: 'assistant', content: '旧回复二' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(async () => 55),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, _options, onChunk) => {
      onChunk?.('新回复')
      return '新回复'
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '改后'
    await messageOps.saveAndRegenerate()

    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 51, '改后')
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 52)
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 53)
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 54)
    expect(callAIStream.mock.calls[0][0].map((message) => message.content).join('\n')).not.toContain('旧回复')
    expect(currentMessages.value).toHaveLength(1)
    expect(chatStore.addMessage).toHaveBeenCalledWith('char_1', expect.objectContaining({
      role: 'assistant',
      content: '新回复'
    }), expect.objectContaining({ sessionId: '' }))
  })

  it('保存并重新生成缺少当前聊天目标时会提示而不是静默无反应', async () => {
    const currentMessages = ref([
      { id: 81, role: 'user', content: '改前' },
      { id: 82, role: 'assistant', content: '旧回复' }
    ])
    const toast = vi.fn()
    const chatStore = {
      currentChatTarget: '',
      isTyping: false,
      getActiveTargetId: vi.fn(() => ''),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => ({ firstMessageId: 83 }))

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '改后'
    await messageOps.saveAndRegenerate()

    expect(toast).toHaveBeenCalledWith('当前会话还没准备好，请重新选择聊天对象后再试。', 'warning')
    expect(chatStore.editMessage).not.toHaveBeenCalled()
    expect(chatStore.deleteMessage).not.toHaveBeenCalled()
    expect(resendUserMessage).not.toHaveBeenCalled()
  })

  it('保存并重新生成编辑状态失效时会提示而不是静默无反应', async () => {
    const toast = vi.fn()
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore: {
        currentChatTarget: 'char_1',
        isTyping: false,
        getActiveTargetId: vi.fn(() => 'char_1'),
        setTyping: vi.fn(),
        setCurrentMessageModel: vi.fn(),
        clearStopRequest: vi.fn(),
        addMessage: vi.fn(),
        deleteMessage: vi.fn(),
        editMessage: vi.fn()
      },
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast,
      currentMessages: ref([{ id: 91, role: 'user', content: '原文' }]),
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    messageOps.editingMessageContent.value = '改后'
    await messageOps.saveAndRegenerate()

    expect(toast).toHaveBeenCalledWith('这条消息的编辑状态已失效，请重新点编辑后再保存并重新生成。', 'warning')
  })

  it('编辑用户消息并重新生成可委托发送管线重跑以触发环境快判', async () => {
    const currentMessages = ref([
      { id: 91, role: 'user', content: '改前' },
      { id: 92, role: 'assistant', content: '旧回复' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => {
      // 默认会话即 normal_recall：重放时旧消息已从显示中消失，但 DB 删除要等重放成功之后。
      expect(currentMessages.value).toHaveLength(1)
      expect(chatStore.deleteMessage).not.toHaveBeenCalled()
      return { firstMessageId: 200, assistantMessageIds: [200] }
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '前往河谷'
    await messageOps.saveAndRegenerate()

    expect(chatStore.editMessage).toHaveBeenCalledWith('char_1', 91, '前往河谷')
    // 重放成功后才删库（两种工作流模式统一的“先隐藏、成功后删库”路径）。
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 92)
    expect(resendUserMessage).toHaveBeenCalledWith('前往河谷', 91, { parentAttemptId: '', replacedMessageIds: [92] })
    expect(chatStore.addMessage).not.toHaveBeenCalled()
    expect(currentMessages.value).toHaveLength(1)
  })

  it('普通召回重试失败时回滚隐藏的旧回复（与人格模型同一保护路径）', async () => {
    const currentMessages = ref([
      { id: 121, role: 'user', content: '继续' },
      { id: 122, role: 'assistant', content: '旧普通召回回复', memberName: '星依' },
      { id: 123, role: 'narration', content: '旧旁白', memberName: '' }
    ])
    const toast = vi.fn()
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'normal_recall'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => {
      expect(currentMessages.value).toHaveLength(1)
      expect(chatStore.deleteMessage).not.toHaveBeenCalled()
      return { assistantMessageIds: [] }
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '继续'
    await messageOps.saveAndRegenerate()

    expect(resendUserMessage).toHaveBeenCalledWith('继续', 121, { parentAttemptId: '', replacedMessageIds: [122, 123] })
    expect(chatStore.deleteMessage).not.toHaveBeenCalled()
    expect(currentMessages.value).toHaveLength(3)
    expect(toast).toHaveBeenCalledWith('重新生成失败，已保留原回复。', 'warning')
  })

  // 批次5 5a 补丁3：用户主动停止重试 → pipeline 识别 abort 返回空结果（无新回复），
  // 这里应静默还原原回复，不弹「重新生成失败」（停止不是失败）。
  it('用户主动停止重试时静默还原、不弹「重新生成失败」', async () => {
    const currentMessages = ref([
      { id: 121, role: 'user', content: '继续' },
      { id: 122, role: 'assistant', content: '旧普通召回回复', memberName: '星依' },
      { id: 123, role: 'narration', content: '旧旁白', memberName: '' }
    ])
    const toast = vi.fn()
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      stopRequested: true, // 用户已点停止
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'normal_recall'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => ({ assistantMessageIds: [] }))

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '继续'
    await messageOps.saveAndRegenerate()

    // 仍回滚还原原回复，但不报失败
    expect(currentMessages.value).toHaveLength(3)
    expect(toast).not.toHaveBeenCalledWith('重新生成失败，已保留原回复。', 'warning')
  })

  it('人格模型重试失败时保留旧角色回复', async () => {
    const currentMessages = ref([
      { id: 101, role: 'user', content: '继续' },
      { id: 102, role: 'assistant', content: '旧人格模型回复', memberName: '星依' }
    ])
    const sessionMessagesCache = {
      session_1: [...currentMessages.value]
    }
    const chatMessages = {
      session_1: [...currentMessages.value]
    }
    const toast = vi.fn()
    const chatStore = {
      current: {
        currentMessages
      },
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'personality_model'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {}),
      runtime: {
        sessionMessagesCache
      },
      entities: {
        chatMessages
      }
    }
    const resendUserMessage = vi.fn(async () => {
      expect(currentMessages.value).toEqual([
        { id: 101, role: 'user', content: '继续' }
      ])
      expect(chatStore.runtime.sessionMessagesCache.session_1).toEqual([
        { id: 101, role: 'user', content: '继续' }
      ])
      expect(chatStore.entities.chatMessages.session_1).toEqual([
        { id: 101, role: 'user', content: '继续' }
      ])
      expect(chatStore.deleteMessage).not.toHaveBeenCalled()
      return { assistantMessageIds: [] }
    })

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '继续'
    await messageOps.saveAndRegenerate()

    expect(resendUserMessage).toHaveBeenCalledWith('继续', 101, { parentAttemptId: '', replacedMessageIds: [102] })
    expect(chatStore.deleteMessage).not.toHaveBeenCalled()
    expect(currentMessages.value).toEqual([
      { id: 101, role: 'user', content: '继续' },
      { id: 102, role: 'assistant', content: '旧人格模型回复', memberName: '星依' }
    ])
    expect(chatStore.runtime.sessionMessagesCache.session_1).toEqual([
      { id: 101, role: 'user', content: '继续' },
      { id: 102, role: 'assistant', content: '旧人格模型回复', memberName: '星依' }
    ])
    expect(chatStore.entities.chatMessages.session_1).toEqual([
      { id: 101, role: 'user', content: '继续' },
      { id: 102, role: 'assistant', content: '旧人格模型回复', memberName: '星依' }
    ])
    expect(toast).toHaveBeenCalledWith('重新生成失败，已保留原回复。', 'warning')
  })

  it('人格模型重试成功后再替换旧角色回复', async () => {
    const currentMessages = ref([
      { id: 111, role: 'user', content: '继续' },
      { id: 112, role: 'assistant', content: '旧人格模型回复', memberName: '星依' },
      { id: 113, role: 'assistant', content: '旧后续回复', memberName: '星依' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      getCurrentSession: vi.fn(() => ({
        id: 'session_1',
        targetId: 'char_1',
        replyPipelineMode: 'personality_model'
      })),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => ({ firstMessageId: 200, assistantMessageIds: [200] }))

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '继续'
    await messageOps.saveAndRegenerate()

    expect(resendUserMessage).toHaveBeenCalledWith('继续', 111, { parentAttemptId: '', replacedMessageIds: [112, 113] })
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 112)
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 113)
    expect(currentMessages.value).toEqual([
      { id: 111, role: 'user', content: '继续' }
    ])
  })

  it('编辑用户消息并重新生成前会先停止并清空旧回复链路', async () => {
    const currentMessages = ref([
      { id: 93, role: 'user', content: '改前' },
      { id: 94, role: 'assistant', content: '旧回复' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      stopGeneration: vi.fn(),
      clearLocalStreamingMessages: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const resendUserMessage = vi.fn(async () => {})

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref('旧流式内容'),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn(),
      resendUserMessage
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '改后'
    await messageOps.saveAndRegenerate()

    expect(chatStore.stopGeneration).toHaveBeenCalled()
    expect(chatStore.clearLocalStreamingMessages).toHaveBeenCalled()
    expect(resendUserMessage).toHaveBeenCalledWith('改后', 93, { parentAttemptId: '', replacedMessageIds: [94] })
  })

  it('角色消息重新生成时会让当前绑定的召回面板重新开始', async () => {
    startRecallActivity({ id: 'old_recall_run', characterName: '星依' })
    setCurrentRecallActivity({
      id: 'old_recall_run',
      characterName: '星依',
      status: 'completed',
      startedAt: '2026-05-09T10:00:00.000Z',
      events: []
    })
    setRecallActivityPanelBinding({ sessionId: 'session_1', messageId: 61 })
    setRecallActivitySidebarOpen(true)

    const currentMessages = ref([
      { id: 60, role: 'user', content: '上一句' },
      { id: 61, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(async (_messages, _options, onChunk) => {
        onChunk?.('新回复')
        return '新回复'
      }),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    const recallState = useRecallTraceState()
    expect(recallState.panelBinding.value).toBeNull()
    expect(recallState.activity.value).toBeNull()
    expect(recallState.sidebarOpen.value).toBe(true)
  })

  it('情绪潮汐停用后角色消息重新生成不会补写潮汐证据', async () => {
    const currentMessages = ref([
      { id: 60, role: 'user', content: '你还好吗？', name: '用户' },
      { id: 61, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAI = vi.fn(async () => JSON.stringify({
      characterFrames: [{
        characterId: 'char_1',
        hasEmotionChange: true,
        sourceMessageIds: ['60', '61'],
        impactScope: 'direct',
        situationTags: ['care'],
        pressureLevel: 'small',
        relationshipSignal: '被关心后放松',
        reason: '星依被关心后态度缓和。'
      }]
    }))

    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        agentModelConfigs: [{ id: 'brain_agent' }],
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAI,
      callAIStream: vi.fn(async (_messages, _options, onChunk) => {
        onChunk?.('新回复')
        return '新回复'
      }),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    expect(callAI).not.toHaveBeenCalled()
  })

  it('角色消息生成优先使用角色卡预设而不是 Agent 角色消息槽位预设', async () => {
    const currentMessages = ref([
      { id: 64, role: 'user', content: '上一句' },
      { id: 65, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const getCurrentApiConfig = vi.fn((presetName) => ({
      name: presetName,
      model: `${presetName}-model`
    }))
    const callAIStream = vi.fn(async (_messages, _options, onChunk, extra) => {
      extra?.onModelInfo?.('role-card-preset-model')
      onChunk?.('新回复')
      return '新回复'
    })
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({
          defaultPreset: 'role-card-preset',
          defaultModel: ''
        })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: 'global-preset' },
        presetSendCount: 20,
        currentLocation: '',
        agentModelConfigs: [{
          id: 'brain_agent',
          modelUsageConfigs: [
            { id: 'roleMessage', presetName: 'quick-judge-preset', model: 'quick-judge-model', temperature: 0.3, maxTokens: 256, thinking: 'disabled' }
          ]
        }],
        getCurrentApiConfig
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    expect(getCurrentApiConfig).toHaveBeenCalledWith('role-card-preset')
    // 批次3（2026-07-08 槽位收束）：角色消息槽退役归校书档，参数由调用点覆写定死（temp1/4096/enabled·
    // 角色级 roleTemperature 等覆写仍优先，见下一用例）；角色卡预设优先的口径不变。
    expect(callAIStream.mock.calls[0][1]).toEqual(expect.objectContaining({
      presetName: 'role-card-preset',
      model: 'role-card-preset-model',
      temperature: 1,
      maxTokens: 4096,
      thinking: 'enabled'
    }))
  })

  it('角色个人参数会覆盖全局角色消息运行参数', async () => {
    const currentMessages = ref([
      { id: 74, role: 'user', content: '上一句' },
      { id: 75, role: 'assistant', content: '旧回复', memberName: '星依' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_1',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_1'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn(async () => {})
    }
    const callAIStream = vi.fn(async (_messages, _options, onChunk) => {
      onChunk?.('新回复')
      return '新回复'
    })
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({
          defaultPreset: 'role-card-preset',
          defaultModel: 'role-card-model',
          roleTemperature: 0.55,
          roleMaxTokens: 1200,
          roleThinking: 'disabled'
        })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: 'global-preset' },
        presetSendCount: 20,
        currentLocation: '',
        agentModelConfigs: [{
          id: 'brain_agent',
          modelUsageConfigs: [
            { id: 'roleMessage', presetName: 'role-slot-preset', model: 'role-slot-model', temperature: 1.2, maxTokens: 4096, thinking: 'enabled' }
          ]
        }],
        getCurrentApiConfig: vi.fn((presetName) => ({
          name: presetName,
          model: 'preset-default-model'
        }))
      },
      callAIStream,
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    await messageOps.regenerateMsg(1)

    expect(callAIStream.mock.calls[0][1]).toEqual(expect.objectContaining({
      presetName: 'role-card-preset',
      model: 'role-card-model',
      temperature: 0.55,
      maxTokens: 1200,
      thinking: 'disabled'
    }))
  })

  it('编辑用户消息并重新生成时会清掉被替换消息的召回面板绑定', async () => {
    setCurrentRecallActivity({
      id: 'old_recall_run',
      characterName: '星依',
      status: 'completed',
      startedAt: '2026-05-09T10:00:00.000Z',
      events: []
    })
    setRecallActivityPanelBinding({ sessionId: 'session_2', messageId: 72 })
    setRecallActivitySidebarOpen(true)

    const currentMessages = ref([
      { id: 71, role: 'user', content: '改前' },
      { id: 72, role: 'assistant', content: '旧回复' }
    ])
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_2',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_2'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      clearStopRequest: vi.fn(),
      addMessage: vi.fn(async () => 73),
      deleteMessage: vi.fn(async () => {}),
      editMessage: vi.fn(async () => {})
    }
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(() => ({ defaultPreset: '默认预设' })),
        characters: [{ id: 'char_1', name: '星依' }]
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({ name: '默认预设', model: 'test-model' }))
      },
      callAIStream: vi.fn(async (_messages, _options, onChunk) => {
        onChunk?.('新回复')
        return '新回复'
      }),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => '系统提示'),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '新回复', newLocation: null })),
      toast: vi.fn(),
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    messageOps.startEditMessage(0)
    messageOps.editingMessageContent.value = '改后'
    await messageOps.saveAndRegenerate()

    const recallState = useRecallTraceState()
    expect(recallState.panelBinding.value).toBeNull()
    expect(recallState.activity.value).toBeNull()
    expect(recallState.sidebarOpen.value).toBe(true)
  })

  it('删除当前绑定消息时会关闭召回面板', () => {
    setCurrentRecallActivity({
      id: 'old_recall_run',
      characterName: '星依',
      status: 'completed',
      startedAt: '2026-05-09T10:00:00.000Z',
      events: []
    })
    setRecallActivityPanelBinding({ sessionId: 'session_3', messageId: 81 })
    setRecallActivitySidebarOpen(true)

    const currentMessages = ref([{ id: 81, role: 'assistant', content: '待删除' }])
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => onConfirm())
    const chatStore = {
      currentChatTarget: 'char_1',
      activeChatSessionId: 'session_3',
      isTyping: false,
      getActiveTargetId: vi.fn(() => 'char_1'),
      getActiveSessionId: vi.fn(() => 'session_3'),
      setTyping: vi.fn(),
      setCurrentMessageModel: vi.fn(),
      addMessage: vi.fn(),
      deleteMessage: vi.fn(),
      editMessage: vi.fn()
    }
    const messageOps = useChatMessageOps({
      charStore: {
        getCharacter: vi.fn(),
        characters: []
      },
      chatStore,
      settingStore: {
        defaultPreset: { name: '默认预设' },
        presetSendCount: 20,
        currentLocation: '',
        getCurrentApiConfig: vi.fn(() => ({}))
      },
      callAIStream: vi.fn(),
      cleanAiPrefix: vi.fn((text) => text),
      buildSystemPrompt: vi.fn(() => ''),
      buildPromptMessages: undefined,
      detectLocationChange: vi.fn(() => ({ content: '', newLocation: null })),
      toast: vi.fn(),
      openConfirmDialog,
      currentMessages,
      currentScene: ref('chat'),
      streamingText: ref(''),
      getTargetName: vi.fn(() => '星依'),
      scrollToBottom: vi.fn()
    })

    messageOps.deleteMessage(0)

    const recallState = useRecallTraceState()
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('char_1', 81)
    expect(recallState.panelBinding.value).toBeNull()
    expect(recallState.activity.value).toBeNull()
    expect(recallState.sidebarOpen.value).toBe(false)
  })

  // ---- 提调挂起态（现役来源=askUser 提问态）：继续 / 取消 ----
  // 停止统一（2026-07-04）：旧「编排带停止→挂起等纠偏」系列（suspendedForCorrection/rollback/commit/
  // retryMessageId/editRefsText）已退役，挂起态只剩提调 askUser 提问态一个来源。
  describe('提调挂起态（askUser 提问态）继续/取消', () => {
    beforeEach(() => clearPendingCorrection())

    function buildOpsForPending({ correctChatMessageViaDirector, resendUserMessage, clearLocalStreamingMessages } = {}) {
      const chatStore = {
        currentChatTarget: 'char_1', activeChatSessionId: 'session_1',
        getActiveTargetId: vi.fn(() => 'char_1'), getActiveSessionId: vi.fn(() => 'session_1'),
        getCurrentSession: vi.fn(() => ({ id: 'session_1', targetId: 'char_1', replyPipelineMode: 'normal_recall' })),
        clearLocalStreamingMessages: clearLocalStreamingMessages || vi.fn(),
        setTyping: vi.fn(), setCurrentMessageModel: vi.fn(), clearStopRequest: vi.fn(),
        addMessage: vi.fn(), deleteMessage: vi.fn(async () => {}), editMessage: vi.fn(async () => {})
      }
      const messageOps = useChatMessageOps({
        charStore: { getCharacter: vi.fn(() => ({})), characters: [{ id: 'char_1', name: '星依' }] },
        chatStore, settingStore: { getCurrentApiConfig: vi.fn(() => ({})) },
        callAIStream: vi.fn(), cleanAiPrefix: vi.fn((t) => t), buildSystemPrompt: vi.fn(() => ''),
        detectLocationChange: vi.fn(() => ({})), toast: vi.fn(),
        currentMessages: ref([
          { id: 121, role: 'user', content: '今晚天气不错' },
          { id: 122, role: 'assistant', content: '旧回复', memberName: '星依' }
        ]),
        currentScene: ref('chat'), streamingText: ref(''),
        getTargetName: vi.fn(() => '星依'), scrollToBottom: vi.fn(),
        ...(resendUserMessage ? { resendUserMessage } : {}),
        ...(correctChatMessageViaDirector ? { correctChatMessageViaDirector } : {})
      })
      return { messageOps, chatStore }
    }

    it('askUser 提问态续跑：把「提问 + 用户答复」织进指令、回到三策 loop 锚定该消息续跑', async () => {
      setPendingCorrection({
        sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 121, anchorIndex: -1,
        baseUserContent: '今晚天气不错', parentAttemptId: '', replacedMessageIds: [], correction: '不让老人出场',
        correctionTargetMessageId: 122, askedQuestion: '要不要让老人出场？'
      })
      const correctChatMessageViaDirector = vi.fn(async () => ({
        strategy: 'direct-edit', edits: [], regenerations: [], escalation: null, reprojectTargets: []
      }))
      const resendUserMessage = vi.fn(async () => ({ firstMessageId: 200, assistantMessageIds: [200] }))
      const { messageOps } = buildOpsForPending({ correctChatMessageViaDirector, resendUserMessage })

      await messageOps.continueCorrection()

      expect(correctChatMessageViaDirector).toHaveBeenCalledTimes(1)
      const [calledId, calledOptions] = correctChatMessageViaDirector.mock.calls[0]
      expect(calledId).toBe(122)
      expect(calledOptions.correctionText).toContain('你上一轮没把握，向用户提了问')
      expect(calledOptions.correctionText).toContain('要不要让老人出场？')
      expect(calledOptions.correctionText).toContain('不让老人出场')
      // 三策已接手 → 不再回退用户消息重跑。
      expect(resendUserMessage).not.toHaveBeenCalled()
      expect(getPendingCorrection()).toBeNull()
    })

    it('三策不可用 → 回退 resendUserMessage 以挂起轮的 baseUserContent 重跑（correctionText=原始答复）', async () => {
      setPendingCorrection({
        sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 121, anchorIndex: -1,
        baseUserContent: '今晚天气不错', parentAttemptId: 'a1', replacedMessageIds: [122], correction: '不让老人出场',
        correctionTargetMessageId: 122
      })
      const resendUserMessage = vi.fn(async () => ({ firstMessageId: 200, assistantMessageIds: [200] }))
      const { messageOps } = buildOpsForPending({ resendUserMessage })

      await messageOps.continueCorrection()

      expect(resendUserMessage).toHaveBeenCalledWith('今晚天气不错', 121, { parentAttemptId: 'a1', replacedMessageIds: [122], correctionText: '不让老人出场' })
      expect(getPendingCorrection()).toBeNull()
    })

    // 橄榄绿提调框统一入口（2026-06-22）：挂起态（问用户提问态）由橄榄绿框提交收尾。
    it('橄榄绿框统一入口：有挂起态时提交答复 → 收尾续跑该挂起轮（continueCorrection），不起新纠偏', async () => {
      setPendingCorrection({
        sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 121, anchorIndex: -1,
        baseUserContent: '今晚天气不错', parentAttemptId: '', replacedMessageIds: [], correction: '',
        correctionTargetMessageId: 122, askedQuestion: '大小姐要不要附和？'
      })
      const correctChatMessageViaDirector = vi.fn(async () => ({
        strategy: 'direct-edit', edits: [], regenerations: [], escalation: null, reprojectTargets: []
      }))
      const { messageOps } = buildOpsForPending({ correctChatMessageViaDirector })

      const ok = await messageOps.applyDirectorPrecisionEdits('大小姐改成附和我')

      expect(ok).toBe(true)
      // 走挂起轮续跑：锚定挂起轮记的目标消息 + 织入提问语境，而非按「最后一条可纠偏消息」另起新纠偏。
      expect(correctChatMessageViaDirector).toHaveBeenCalledTimes(1)
      const [calledId, calledOptions] = correctChatMessageViaDirector.mock.calls[0]
      expect(calledId).toBe(122)
      expect(calledOptions.correctionText).toContain('大小姐要不要附和？')
      expect(calledOptions.correctionText).toContain('大小姐改成附和我')
      expect(getPendingCorrection()).toBeNull()
    })

    it('取消：清挂起态 + 移除占位带', () => {
      const clearLocalStreamingMessages = vi.fn()
      setPendingCorrection({
        sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 121, anchorIndex: -1,
        baseUserContent: '今晚天气不错', parentAttemptId: '', replacedMessageIds: [], correction: '',
        correctionTargetMessageId: 122
      })
      const { messageOps } = buildOpsForPending({ clearLocalStreamingMessages })

      messageOps.cancelCorrection()

      expect(clearLocalStreamingMessages).toHaveBeenCalled()
      expect(getPendingCorrection()).toBeNull()
    })

    it('防御：无锚定消息的挂起（不该出现）→ continueCorrection 直接取消、不续跑', async () => {
      setPendingCorrection({
        sessionId: 'session_1', targetId: 'char_1', anchorMessageId: 121, anchorIndex: -1,
        baseUserContent: '今晚天气不错', parentAttemptId: '', replacedMessageIds: [], correction: '答复'
      })
      const correctChatMessageViaDirector = vi.fn(async () => ({ strategy: 'direct-edit', edits: [], regenerations: [], escalation: null }))
      const resendUserMessage = vi.fn(async () => ({}))
      const { messageOps } = buildOpsForPending({ correctChatMessageViaDirector, resendUserMessage })

      await messageOps.continueCorrection()

      expect(correctChatMessageViaDirector).not.toHaveBeenCalled()
      expect(resendUserMessage).not.toHaveBeenCalled()
      expect(getPendingCorrection()).toBeNull()
    })
  })
})
