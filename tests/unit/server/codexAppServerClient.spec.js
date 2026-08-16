import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/db', () => ({ CHAT_IMAGE_DIR: 'C:\\tmp\\langhuan-images', default: {} }))

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock, default: { spawn: spawnMock } }))

const { CodexAppServerClient } = await import('../../../server/application/ai/codexSubscriptionBridge.js')

function createFakeAppServer({ completeTurns = true, imageTurn = false, webSearchTurn = false, startThreads = true } = {}) {
  const child = new EventEmitter()
  child.killed = false
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdout.setEncoding = vi.fn()
  child.stderr.setEncoding = vi.fn()
  child.kill = vi.fn(() => { child.killed = true })
  const requests = []

  const emit = (message) => queueMicrotask(() => child.stdout.emit('data', `${JSON.stringify(message)}\n`))
  child.stdin = {
    write: vi.fn((line) => {
      const message = JSON.parse(String(line))
      requests.push(message)
      if (message.method === 'initialized') return true
      if (message.method === 'initialize') emit({ id: message.id, result: { userAgent: 'fake' } })
      else if (message.method === 'account/read') emit({ id: message.id, result: { account: { type: 'chatgpt' }, requiresOpenaiAuth: true } })
      else if (message.method === 'model/list') emit({ id: message.id, result: { data: [{
        id: 'catalog', model: 'gpt-test', hidden: false, isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'fast' }, { reasoningEffort: 'high', description: 'deep' }],
        defaultReasoningEffort: 'high',
        additionalSpeedTiers: ['fast'],
        serviceTiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed, increased usage' }],
        defaultServiceTier: 'standard'
      }], nextCursor: null } })
      else if (message.method === 'modelProvider/capabilities/read') emit({ id: message.id, result: { namespaceTools: true, imageGeneration: true, webSearch: true } })
      else if (message.method === 'thread/start' && startThreads) emit({ id: message.id, result: { thread: { id: 'thread-1' } } })
      else if (message.method === 'turn/start') {
        emit({ id: message.id, result: { turn: { id: 'turn-1' } } })
        if (completeTurns) {
          if (imageTurn) {
            emit({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'imageGeneration', id: 'image-1', status: 'completed', revisedPrompt: '一只猫', result: 'iVBORw0KGgo=' } } })
          } else if (webSearchTurn) {
            emit({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: {
              type: 'webSearch', id: 'search-1', query: '最新资料', action: { type: 'search' },
              results: [{ title: '官方资料', url: 'https://example.com/latest' }]
            } } })
            emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '检索结论' } })
          } else {
            emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '你好' } })
          }
          emit({ method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'reason-1', summaryIndex: 0, delta: '先分析。' } })
          emit({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread-1', turnId: 'turn-1', tokenUsage: { last: { inputTokens: 4, cachedInputTokens: 1, outputTokens: 2, reasoningOutputTokens: 0 } } } })
          emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null } } })
        }
      } else if (message.method === 'turn/interrupt') emit({ id: message.id, result: {} })
      else if (message.method === 'thread/delete') emit({ id: message.id, result: {} })
      return true
    })
  }
  return { child, requests }
}

describe('CodexAppServerClient JSON-RPC 契约', () => {
  it('初始化后校验 ChatGPT 登录态，并读取动态模型列表', async () => {
    const fake = createFakeAppServer()
    spawnMock.mockReturnValueOnce(fake.child)
    const client = new CodexAppServerClient()

    await expect(client.listModels()).resolves.toEqual([{
      id: 'gpt-test',
      isDefault: true,
      supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'fast' }, { reasoningEffort: 'high', description: 'deep' }],
      defaultReasoningEffort: 'high',
      additionalSpeedTiers: ['fast'],
      serviceTiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed, increased usage' }],
      defaultServiceTier: 'standard'
    }])

    const [, args, options] = spawnMock.mock.calls.at(-1)
    expect(args).toEqual(expect.arrayContaining([
      'app-server', '--stdio',
      '-c', 'web_search="disabled"',
      '-c', 'features.plugins=false',
      '-c', 'features.apps=false',
      '-c', 'features.browser_use=false',
      '-c', 'features.computer_use=false',
      '-c', 'features.in_app_browser=false'
    ]))
    expect(args).not.toContain('mcp_servers={}')
    expect(options).toEqual(expect.objectContaining({ windowsHide: true }))
    expect(fake.requests.map((item) => item.method)).toEqual(expect.arrayContaining(['initialize', 'initialized', 'account/read', 'model/list']))
  })

  it('turn 事件收集最终文本与 usage', async () => {
    const fake = createFakeAppServer()
    spawnMock.mockReturnValueOnce(fake.child)
    const client = new CodexAppServerClient()

    const result = await client.runTurn({
      model: 'default',
      baseInstructions: 'base',
      developerInstructions: 'dev',
      input: [{ type: 'text', text: '你好', text_elements: [] }],
      effort: 'high',
      serviceTier: 'priority',
      summary: 'auto'
    })

    expect(result).toEqual(expect.objectContaining({ threadId: 'thread-1', turnId: 'turn-1', finalMessage: '你好' }))
    expect(result.reasoningContent).toBe('先分析。')
    expect(result.usage).toEqual(expect.objectContaining({ inputTokens: 4, cachedInputTokens: 1, outputTokens: 2 }))
    const threadStart = fake.requests.find((item) => item.method === 'thread/start')
    expect(threadStart.params).toEqual(expect.objectContaining({
      runtimeWorkspaceRoots: [], approvalPolicy: 'never', permissions: ':read-only',
      ephemeral: true, environments: [], selectedCapabilityRoots: [], dynamicTools: [], serviceTier: 'priority'
    }))
    expect(threadStart.params).not.toHaveProperty('config')
    const turnStart = fake.requests.find((item) => item.method === 'turn/start')
    expect(turnStart.params).toEqual(expect.objectContaining({ effort: 'high', serviceTier: 'priority', summary: 'auto' }))
  })

  it('读取 provider 生图能力，并收集 imageGeneration 结果', async () => {
    const fake = createFakeAppServer({ imageTurn: true })
    spawnMock.mockReturnValueOnce(fake.child)
    const client = new CodexAppServerClient()

    await expect(client.readCapabilities()).resolves.toEqual({ imageGeneration: true, webSearch: true })
    const result = await client.runTurn({
      model: 'default', baseInstructions: 'base', developerInstructions: 'dev',
      input: [{ type: 'text', text: '画猫', text_elements: [] }], summary: 'none'
    })

    expect(result.finalMessage).toBe('')
    expect(result.generatedImages).toEqual([{ result: 'iVBORw0KGgo=', revisedPrompt: '一只猫' }])
  })

  it('独立 cached 客户端只放行原生 web search，并收集检索事件', async () => {
    const fake = createFakeAppServer({ webSearchTurn: true })
    spawnMock.mockReturnValueOnce(fake.child)
    const client = new CodexAppServerClient({ webSearchMode: 'cached' })

    const result = await client.runTurn({
      model: 'default', baseInstructions: 'base', developerInstructions: 'dev',
      input: [{ type: 'text', text: '最新资料', text_elements: [] }], summary: 'none'
    })

    const [, args] = spawnMock.mock.calls.at(-1)
    expect(args).toContain('web_search="cached"')
    expect(args).toContain('features.plugins=false')
    expect(result.finalMessage).toBe('检索结论')
    expect(result.webSearches).toEqual([expect.objectContaining({ query: '最新资料' })])
  })

  it('AbortSignal 映射为 turn/interrupt，并以 AbortError 结束', async () => {
    const fake = createFakeAppServer({ completeTurns: false })
    spawnMock.mockReturnValueOnce(fake.child)
    const client = new CodexAppServerClient()
    const controller = new AbortController()
    const pending = client.runTurn({
      model: 'gpt-test', baseInstructions: 'base', developerInstructions: 'dev',
      input: [{ type: 'text', text: '你好', text_elements: [] }], summary: 'none', signal: controller.signal
    })
    await vi.waitFor(() => expect(fake.requests.some((item) => item.method === 'turn/start')).toBe(true))

    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(fake.requests.some((item) => item.method === 'turn/interrupt')).toBe(true))
  })

  it('thread/start 超时后终止异常 App Server，避免迟到线程与 MCP 子进程继续堆积', async () => {
    vi.stubEnv('LANGHUAN_CODEX_THREAD_START_TIMEOUT_MS', '20')
    try {
      const fake = createFakeAppServer({ startThreads: false })
      spawnMock.mockReturnValueOnce(fake.child)
      const client = new CodexAppServerClient()

      const pending = client.runTurn({
        model: 'default', baseInstructions: 'base', developerInstructions: 'dev',
        input: [{ type: 'text', text: '你好', text_elements: [] }], summary: 'none'
      })

      await expect(pending).rejects.toThrow(/thread\/start（已终止异常桥进程/)
      expect(fake.child.kill).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
