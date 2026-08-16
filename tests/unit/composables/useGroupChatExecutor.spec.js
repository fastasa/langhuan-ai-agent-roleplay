import { describe, it, expect, vi } from 'vitest'
import { useGroupChatExecutor } from '../../../src/composables/useGroupChatExecutor.ts'

async function waitForExpectation(assertion, attempts = 20) {
  let lastError
  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await Promise.resolve()
    }
  }
  throw lastError
}

describe('useGroupChatExecutor', () => {
  it('群聊正式入库时保留已经归一化后的思维链', async () => {
    const addMessage = vi.fn(async () => 101)
    const finalizeLocalStreamingMessage = vi.fn(() => true)
    const upsertLocalStreamingMessage = vi.fn()
    const onStreamingText = vi.fn()

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '路人' }],
      buildChatMessages: () => [{ role: 'user', content: '你好' }],
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        onChunk?.('<think>先想一想</think>\n星依：正式回复')
        return '<think>先想一想</think>\n星依：正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText,
      upsertLocalStreamingMessage,
      finalizeLocalStreamingMessage,
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false
    })

    await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你好',
      replyOrder: [{ characterId: 'c1', mustReply: true }]
    })

    expect(addMessage).toHaveBeenCalledTimes(1)
    expect(addMessage.mock.calls[0][1].content).toBe('<think>先想一想</think>\n正式回复')
    expect(finalizeLocalStreamingMessage).toHaveBeenCalled()
  })

  it('群聊保存含长思维链消息失败时会改存可见正文并继续绑定日志', async () => {
    const addMessage = vi.fn()
      .mockRejectedValueOnce(new Error('payload too large'))
      .mockResolvedValueOnce(120)
    const bindPromptLogMessage = vi.fn()
    const finalizeLocalStreamingMessage = vi.fn(() => true)

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }],
      buildChatMessages: () => [{ role: 'user', content: '你好' }],
      getAIOptions: () => ({}),
      callAIStream: async (_messages, options, onChunk) => {
        await options.onPromptPrepared?.({
          messages: _messages,
          finalPrompt: 'final prompt',
          preparedAt: '2026-05-16T00:00:00.000Z'
        })
        onChunk?.('<think>很长的思考</think>\n星依：正式回复')
        return '<think>很长的思考</think>\n星依：正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage: vi.fn(),
      finalizeLocalStreamingMessage,
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false,
      createPromptLog: vi.fn(async () => 'prompt-log'),
      bindPromptLogMessage
    })

    const replyCount = await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你好',
      replyOrder: [{ characterId: 'c1', mustReply: true }]
    })

    expect(replyCount).toBe(1)
    expect(addMessage).toHaveBeenCalledTimes(2)
    expect(addMessage.mock.calls[1][1].content).toBe('正式回复')
    expect(bindPromptLogMessage).toHaveBeenCalledWith('group_test', 'prompt-log', 120, expect.objectContaining({
      speakerTargetId: 'c1'
    }))
    expect(finalizeLocalStreamingMessage.mock.calls.at(-1)?.[1].content).toBe('正式回复')
  })

  it('群聊按当前角色提取后如果只剩思维链，会保留原始归一化结果', async () => {
    const addMessage = vi.fn(async () => 102)

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '路人' }],
      buildChatMessages: () => [{ role: 'user', content: '你好' }],
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        onChunk?.('<think>先想一想</think>\n路人：别的内容')
        return '<think>先想一想</think>\n路人：别的内容'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage: vi.fn(),
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false
    })

    await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你好',
      replyOrder: [{ characterId: 'c1', mustReply: true }]
    })

    expect(addMessage).toHaveBeenCalledTimes(1)
    expect(addMessage.mock.calls[0][1].content).toBe('<think>先想一想</think>\n路人：别的内容')
  })

  it('群聊角色召回后收到停止请求时，不再启动该角色输出流', async () => {
    let stopRequested = false
    const callAIStream = vi.fn()
    const addMessage = vi.fn()
    const upsertLocalStreamingMessage = vi.fn()

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }],
      buildChatMessages: async () => {
        stopRequested = true
        return [{ role: 'user', content: '停在召回后' }]
      },
      getAIOptions: () => ({}),
      callAIStream,
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage,
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => stopRequested
    })

    const replyCount = await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '停在召回后',
      replyOrder: [{ characterId: 'c1', mustReply: true }]
    })

    expect(replyCount).toBe(0)
    expect(callAIStream).not.toHaveBeenCalled()
    expect(upsertLocalStreamingMessage).not.toHaveBeenCalled()
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('群聊地点门禁阻止某个角色时，只跳过该角色并继续后续角色', async () => {
    const addMessage = vi.fn(async () => 103)
    const buildChatMessages = vi.fn(async (charId) => [{ role: 'user', content: `给 ${charId}` }])
    const prepareSpeakerRecall = vi.fn(async () => {})
    const shouldAllowSpeaker = vi.fn(async ({ speakerTargetId }) => speakerTargetId !== 'c1')
    const onReplyOrderUpdated = vi.fn()

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '路人' }],
      buildChatMessages,
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        onChunk?.('路人：正式回复')
        return '路人：正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage: vi.fn(),
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false,
      shouldAllowSpeaker,
      onReplyOrderUpdated
    })

    const replyCount = await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    expect(replyCount).toBe(1)
    expect(shouldAllowSpeaker).toHaveBeenCalledTimes(2)
    expect(prepareSpeakerRecall).toHaveBeenCalledTimes(1)
    expect(buildChatMessages).toHaveBeenCalledTimes(1)
    expect(buildChatMessages).toHaveBeenCalledWith('c2', '你们说说', undefined, 'c2', { skipPrepareRecall: true })
    expect(addMessage).toHaveBeenCalledTimes(1)
    expect(onReplyOrderUpdated).toHaveBeenCalledWith(['c2'])
  })

  it('群聊首位角色确认的共享召回卡会复用于后续角色，后续角色只做私有召回', async () => {
    const sharedCard = {
      card: {
        id: 'observable_user',
        k: 'observable_profile',
        p: '/当前会话/可观察人物/用户',
        t: '用户的可观察外貌',
        s: '银白短发。',
        tags: ['外貌'],
        u: '2026-05-16T00:00:00.000Z',
        relationHints: [],
        isRecallable: true,
        bodyText: '银白短发，左眼下有小痣。'
      },
      readDecision: 'body_required'
    }
    const prepareSpeakerRecall = vi.fn(async (speakerTargetId, options) => {
      if (speakerTargetId === 'c1') {
        options?.onSharedCards?.([sharedCard])
      }
    })
    const buildChatMessages = vi.fn(async (charId) => [{ role: 'user', content: `给 ${charId}` }])
    const addMessage = vi.fn(async (_targetId, message) => message.name === '星依' ? 201 : 202)

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '惊雨' }],
      buildChatMessages,
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        onChunk?.('正式回复')
        return '正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage: vi.fn(),
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false
    })

    const replyCount = await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    expect(replyCount).toBe(2)
    expect(prepareSpeakerRecall).toHaveBeenCalledTimes(2)
    expect(prepareSpeakerRecall.mock.calls[0][1]?.characterOnly).toBe(false)
    expect(prepareSpeakerRecall.mock.calls[1][1]?.characterOnly).toBe(true)
    expect(prepareSpeakerRecall.mock.calls[1][1]?.sharedCards).toEqual([sharedCard])
    expect(buildChatMessages).toHaveBeenCalledTimes(2)
    expect(buildChatMessages.mock.calls.every((call) => call[4]?.skipPrepareRecall === true)).toBe(true)
  })

  it('多人并行准备下一位召回时，消息只绑定自己的召回活动', async () => {
    let currentRecallActivity = null
    const makeRecallActivity = (speakerTargetId) => ({
      id: `run-${speakerTargetId}`,
      characterName: speakerTargetId,
      status: 'completed',
      startedAt: '2026-05-16T00:00:00.000Z',
      completedAt: '2026-05-16T00:00:01.000Z',
      events: []
    })
    const prepareSpeakerRecall = vi.fn(async (speakerTargetId) => {
      currentRecallActivity = makeRecallActivity(speakerTargetId)
      return { recallActivity: currentRecallActivity }
    })
    const bindPromptLogMessage = vi.fn(async (_targetId, _logId, _assistantMessageId, context) => {
      return {
        boundRecallId: context?.recallActivity?.id,
        currentRecallId: currentRecallActivity?.id
      }
    })
    const bindingChecks = []
    bindPromptLogMessage.mockImplementation(async (_targetId, _logId, _assistantMessageId, context) => {
      bindingChecks.push({
        boundRecallId: context?.recallActivity?.id,
        currentRecallId: currentRecallActivity?.id,
        speakerTargetId: context?.speakerTargetId
      })
    })

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '惊雨' }],
      buildChatMessages: async (charId) => [{ role: 'user', content: `给 ${charId}` }],
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        await _options.onPromptPrepared?.({
          messages: _messages,
          finalPrompt: 'final prompt',
          preparedAt: '2026-05-16T00:00:00.000Z'
        })
        await Promise.resolve()
        onChunk?.('正式回复')
        return '正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage: vi.fn(async (_targetId, message) => message.name === '星依' ? 301 : 302),
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage: vi.fn(),
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false,
      createPromptLog: vi.fn(async () => 'prompt-log'),
      bindPromptLogMessage
    })

    await executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    expect(bindingChecks).toHaveLength(2)
    expect(bindingChecks[0]).toEqual({
      boundRecallId: 'run-c1',
      currentRecallId: 'run-c2',
      speakerTargetId: 'c1'
    })
    expect(bindingChecks[1]).toMatchObject({
      boundRecallId: 'run-c2',
      speakerTargetId: 'c2'
    })
  })

  it('当前角色流式输出时，下一位角色开始召回会先显示本地 loading 消息', async () => {
    let resolveSecondRecallStarted
    let resolveSecondRecall
    const secondRecallStarted = new Promise((resolve) => {
      resolveSecondRecallStarted = resolve
    })
    const secondRecallRelease = new Promise((resolve) => {
      resolveSecondRecall = resolve
    })
    const upsertLocalStreamingMessage = vi.fn()
    const prepareSpeakerRecall = vi.fn(async (speakerTargetId, options) => {
      const activity = {
        id: `run-${speakerTargetId}`,
        characterName: speakerTargetId,
        status: 'running',
        startedAt: '2026-05-16T00:00:00.000Z',
        events: []
      }
      if (speakerTargetId === 'c2') {
        options?.onActivityStarted?.(activity)
        resolveSecondRecallStarted()
        await secondRecallRelease
      }
      return {
        recallActivity: {
          ...activity,
          status: 'completed',
          completedAt: '2026-05-16T00:00:01.000Z'
        }
      }
    })
    let streamCallCount = 0

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '惊雨' }],
      buildChatMessages: async (charId) => [{ role: 'user', content: `给 ${charId}` }],
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        streamCallCount += 1
        if (streamCallCount === 1) {
          await secondRecallStarted
        }
        onChunk?.('正式回复')
        return '正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage: vi.fn(async (_targetId, message) => message.name === '星依' ? 401 : 402),
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage,
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false
    })

    const execution = executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    await secondRecallStarted
    expect(upsertLocalStreamingMessage).toHaveBeenCalledWith(
      expect.stringContaining('group-recall-group_test-c2'),
      expect.objectContaining({
        name: '惊雨',
        _recallLoading: true,
        _recallActivityRunId: 'run-c2'
      })
    )

    resolveSecondRecall()
    await execution
  })

  it('当前角色完成后才启动下一位召回时，不再在已完成回复下方插入等待 loading', async () => {
    let releaseSecondGate
    const secondGate = new Promise((resolve) => {
      releaseSecondGate = resolve
    })
    const upsertLocalStreamingMessage = vi.fn()
    const addMessage = vi.fn(async (_targetId, message) => message.name === '星依' ? 501 : 502)
    const shouldAllowSpeaker = vi.fn(async ({ speakerTargetId }) => {
      if (speakerTargetId === 'c2') {
        await secondGate
      }
      return true
    })
    const prepareSpeakerRecall = vi.fn(async (speakerTargetId, options) => {
      const activity = {
        id: `run-${speakerTargetId}`,
        characterName: speakerTargetId,
        status: 'running',
        startedAt: '2026-05-16T00:00:00.000Z',
        events: []
      }
      if (speakerTargetId === 'c2') {
        options?.onActivityStarted?.(activity)
      }
      return {
        recallActivity: {
          ...activity,
          status: 'completed',
          completedAt: '2026-05-16T00:00:01.000Z'
        }
      }
    })
    let streamCallCount = 0

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '惊雨' }],
      buildChatMessages: async (charId) => [{ role: 'user', content: `给 ${charId}` }],
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async (_messages, _options, onChunk) => {
        streamCallCount += 1
        onChunk?.('正式回复')
        return '正式回复'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage,
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage,
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage: vi.fn(),
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false,
      shouldAllowSpeaker
    })

    const execution = executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    await waitForExpectation(() => expect(addMessage).toHaveBeenCalledTimes(1))
    releaseSecondGate()
    await execution

    const loadingKeys = upsertLocalStreamingMessage.mock.calls
      .filter((call) => String(call[0] || '').includes('group-recall-group_test-c2'))
    expect(loadingKeys).toHaveLength(0)
    expect(streamCallCount).toBe(2)
    expect(addMessage).toHaveBeenCalledTimes(2)
  })

  it('当前角色输出失败时会清理下一位已经召回完成的等待消息', async () => {
    let resolveSecondRecallStarted
    let resolveSecondRecall
    const secondRecallStarted = new Promise((resolve) => {
      resolveSecondRecallStarted = resolve
    })
    const secondRecallRelease = new Promise((resolve) => {
      resolveSecondRecall = resolve
    })
    const upsertLocalStreamingMessage = vi.fn()
    const removeLocalStreamingMessage = vi.fn()
    const prepareSpeakerRecall = vi.fn(async (speakerTargetId, options) => {
      const activity = {
        id: `run-${speakerTargetId}`,
        characterName: speakerTargetId,
        status: 'running',
        startedAt: '2026-05-16T00:00:00.000Z',
        events: []
      }
      if (speakerTargetId === 'c2') {
        options?.onActivityStarted?.(activity)
        resolveSecondRecallStarted()
        await secondRecallRelease
      }
      return {
        recallActivity: {
          ...activity,
          status: 'completed',
          completedAt: '2026-05-16T00:00:01.000Z'
        }
      }
    })
    let streamCallCount = 0

    const executor = useGroupChatExecutor({
      getCharacters: () => [{ id: 'c1', name: '星依' }, { id: 'c2', name: '惊雨' }],
      buildChatMessages: async (charId) => [{ role: 'user', content: `给 ${charId}` }],
      prepareSpeakerRecall,
      getAIOptions: () => ({}),
      callAIStream: async () => {
        streamCallCount += 1
        if (streamCallCount === 1) {
          await secondRecallStarted
          throw new Error('第一位角色输出失败')
        }
        return '不应该输出'
      },
      normalizeReplyProbability: () => 1,
      cleanAiPrefix: (text) => text,
      detectLocationChange: () => ({ content: '', newLocation: null }),
      addMessage: vi.fn(),
      onStreamingText: vi.fn(),
      upsertLocalStreamingMessage,
      finalizeLocalStreamingMessage: vi.fn(() => true),
      removeLocalStreamingMessage,
      appendPersistedMessage: vi.fn(),
      onPersistedMessageWhileTargetLoading: vi.fn(),
      onProgress: vi.fn(),
      onLocationChange: vi.fn(),
      onCharacterError: vi.fn(),
      shouldStop: () => false
    })

    const execution = executor.executeGroupChat({
      targetId: 'group_test',
      userText: '你们说说',
      replyOrder: [
        { characterId: 'c1', mustReply: true },
        { characterId: 'c2', mustReply: true }
      ]
    })

    await secondRecallStarted
    const secondRecallKey = upsertLocalStreamingMessage.mock.calls
      .map((call) => String(call[0] || ''))
      .find((key) => key.includes('group-recall-group_test-c2'))
    expect(secondRecallKey).toBeTruthy()

    resolveSecondRecall()
    const replyCount = await execution

    expect(replyCount).toBe(0)
    expect(removeLocalStreamingMessage).toHaveBeenCalledWith(secondRecallKey)
    expect(streamCallCount).toBe(1)
  })
})
