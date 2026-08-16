import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendChatCollectionItem,
  buildChatSessionPatch,
  buildChatSummaryExportPayload,
  createChatRecallActivityLogBySessionId,
  copyChatMessagesToTarget,
  extractChatSnapshotPayload,
  extractChatSummarySnapshotPayload
  ,
  deleteWorldMapFeatureRemote,
  fetchWorldMapChangeLog,
  loadAllChatRecallActivityLogsBySessionId,
  normalizeChatSession,
  normalizeSessionTemporaryEntity,
  patchChatCollectionItem,
  prependChatCollectionItem,
  removeChatArchiveItems,
  removeChatCollectionItem,
  saveWorldMapFeaturesRemote,
  uploadChatImage
} from '../../../src/repositories/chatRepository.ts'

describe('chatRepository session patch helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('把会话驼峰字段转换成接口补丁字段', () => {
    expect(buildChatSessionPatch({
      loadedSummaryIds: ['s1'],
      virtualSceneName: '场景A',
      virtualLocationLarge: '国家',
      virtualLocationMiddle: '城市',
      virtualLocationSmall: '街道',
      boundAlias: 'alias_1',
      narrationForceEnabled: true,
      replyPipelineMode: 'caps_network'
    })).toEqual(expect.objectContaining({
      loaded_summary_ids: ['s1'],
      virtual_scene_name: '场景A',
      virtual_location_large: '国家',
      virtual_location_middle: '城市',
      virtual_location_small: '街道',
      virtual_location: '国家 / 城市 / 街道',
      bound_alias: 'alias_1',
      narration_force_enabled: 1,
      reply_pipeline_mode: 'normal_recall'
    }))
  })

  it('规范化会话时同步纯净回复双字段', () => {
    expect(normalizeChatSession({
      id: 'session_1',
      targetId: 'char_1',
      narration_force_enabled: 1,
      replyPipelineMode: 'pure_prompt'
    })).toMatchObject({
      narrationForceEnabled: true,
      narration_force_enabled: 1,
      replyPipelineMode: 'pure_prompt',
      reply_pipeline_mode: 'pure_prompt'
    })
  })

  it('规范化会话时保留世界 id，并去重世界文档只读投影', () => {
    expect(normalizeChatSession({
      id: 'session_world',
      world_id: ' world_1 ',
      worldDocLibraryDocumentIds: ['doc_a', ' doc_a ', 'doc_b', '']
    })).toMatchObject({
      worldId: 'world_1',
      world_id: 'world_1',
      worldDocLibraryDocumentIds: ['doc_a', 'doc_b']
    })
  })

  it('从服务端整包数据里提取聊天快照载荷', () => {
    expect(extractChatSnapshotPayload({
      currentChatTarget: 'char_1',
      chatSessions: [{ id: 'session_1', target_id: 'char_1' }],
      chatSessionTemporaryEntities: [{ id: 'entity_1', sessionId: 'session_1', kind: 'region', name: '旧港区' }],
      chatMessages: [{ id: 1, session_id: 'char_1', role: 'user', content: '你好', time: '', image: '', model: '', created_at: '' }]
    })).toEqual(expect.objectContaining({
      currentChatTarget: 'char_1',
      chatSessions: [{ id: 'session_1', target_id: 'char_1' }],
      chatSessionTemporaryEntities: [{ id: 'entity_1', sessionId: 'session_1', kind: 'region', name: '旧港区' }],
      chatMessages: [{ id: 1, session_id: 'char_1', role: 'user', content: '你好', time: '', image: '', model: '', created_at: '' }]
    }))
  })

  it('规范化统一临时实体的 JSON 字段', () => {
    expect(normalizeSessionTemporaryEntity({
      id: 'entity_1',
      session_id: 'session_1',
      kind: 'region',
      name: '旧港区',
      aliases_json: '["港口"]',
      tags_json: '["地点"]',
      source_ledger_json: '[{"source":"manual"}]',
      persisted_target_json: '{"documentId":"doc_1"}'
    })).toEqual(expect.objectContaining({
      id: 'entity_1',
      sessionId: 'session_1',
      kind: 'region',
      name: '旧港区',
      aliases: ['港口'],
      tags: ['地点'],
      sourceLedger: [{ source: 'manual' }],
      persistedTarget: { documentId: 'doc_1' }
    }))
  })

  it('单独提取聊天总结快照和导出载荷', () => {
    expect(extractChatSummarySnapshotPayload({
      summaryLibrary: [{ id: 'sum_1' }],
      smallSummaries: [{ id: 'small_1' }],
      bigSummaries: [{ id: 'big_1' }],
      chatSessions: [{ id: 'session_1' }]
    })).toEqual({
      summaryLibrary: [{ id: 'sum_1' }],
      smallSummaries: [{ id: 'small_1' }],
      bigSummaries: [{ id: 'big_1' }]
    })

    expect(buildChatSummaryExportPayload([{ id: 'sum_1' }], 3)).toEqual({
      summaryLibrary: [{ id: 'sum_1' }],
      summaryIdCounter: 3
    })
  })

  it('统一处理聊天集合的增删改', () => {
    expect(prependChatCollectionItem([{ id: 'b' }], { id: 'a' })).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(appendChatCollectionItem([{ id: 'a' }], { id: 'b' })).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(patchChatCollectionItem([{ id: 'a', name: '旧' }], 'a', { name: '新' })).toEqual([{ id: 'a', name: '新' }])
    expect(removeChatCollectionItem([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }])
    expect(removeChatArchiveItems([{ id: 'a' }, { id: 'b' }], ['b'])).toEqual([{ id: 'a' }])
  })

  it('创建召回活动日志时保留服务端返回的消息绑定字段', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'recall_log_1',
        sessionId: 'session_1',
        pageIndex: 1,
        entryIndex: 1,
        inputMessageId: 10,
        assistantMessageId: 12,
        activity: { id: 'run_1', events: [] },
        createdAt: '2026-05-16T00:00:00.000Z'
      })
    })))

    const result = await createChatRecallActivityLogBySessionId('session_1', {
      inputMessageId: 10,
      assistantMessageId: 12,
      activity: { id: 'run_1', events: [] }
    })

    expect(result.id).toBe('recall_log_1')
    expect(result.inputMessageId).toBe(10)
    expect(result.assistantMessageId).toBe(12)
    expect(result.activity).toEqual({ id: 'run_1', events: [] })
  })

  it('上传聊天图片时把 data URI 提交到 /api/data/chat-images 并返回基础字段', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'chat_img_1', url: '/chat-images/chat_img_1.png', mime: 'image/png', size: 128 })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadChatImage('data:image/png;base64,aGVsbG8=', '截图.png')

    expect(fetchMock).toHaveBeenCalledWith('/api/data/chat-images', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ dataUri: 'data:image/png;base64,aGVsbG8=', name: '截图.png' })
    }))
    expect(result).toEqual({ id: 'chat_img_1', url: '/chat-images/chat_img_1.png', mime: 'image/png', size: 128 })
  })
})

// ── 地图版本历史（批L·2026-07-12）：写函数 runMeta 透传 + 历史查询归一 ──
describe('chatRepository 地图写 runMeta 透传', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saveWorldMapFeaturesRemote：runMeta 进请求体；不传时体内不带 runMeta 键', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }))
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: 'f1', name: '要素' }]
    await saveWorldMapFeaturesRemote('world_1', items, { runKey: 'huiyu-1', runLabel: '画山' })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/data/worlds/world_1/map/features', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ items, runMeta: { runKey: 'huiyu-1', runLabel: '画山' } })
    }))

    await saveWorldMapFeaturesRemote('world_1', items)
    expect(fetchMock).toHaveBeenLastCalledWith('/api/data/worlds/world_1/map/features', expect.objectContaining({
      body: JSON.stringify({ items })
    }))
  })

  it('deleteWorldMapFeatureRemote：runMeta 走 query 透传（DELETE 请求体不可靠），不传则无 query', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)

    await deleteWorldMapFeatureRemote('world_1', 'feat_1', { runKey: 'huiyu-2', runLabel: '拆 塔' })
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/data/worlds/world_1/map/features/feat_1?runKey=huiyu-2&runLabel=%E6%8B%86%20%E5%A1%94',
      { method: 'DELETE' }
    )

    await deleteWorldMapFeatureRemote('world_1', 'feat_1')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/data/worlds/world_1/map/features/feat_1', { method: 'DELETE' })
  })

  it('fetchWorldMapChangeLog：分组结构归一（计数缺省 0、items 缺省空数组）', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        groups: [
          {
            groupId: 'log_9', runKey: 'huiyu-1', runLabel: '画地形',
            startedAt: '2026-07-12T01:00:00.000Z', endedAt: '2026-07-12T01:05:00.000Z',
            counts: { add: 2, update: 1, delete: 0 },
            items: [{ id: 'log_9', op: 'add', featureId: 'f1', snapshot: { kind: 'region' }, createdAt: '2026-07-12T01:05:00.000Z' }]
          },
          { groupId: 'log_1', runKey: 'manual' }
        ]
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const groups = await fetchWorldMapChangeLog('world_1')
    expect(fetchMock).toHaveBeenCalledWith('/api/data/worlds/world_1/map/change-log')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      groupId: 'log_9', runKey: 'huiyu-1', runLabel: '画地形',
      counts: { add: 2, update: 1, delete: 0 }
    })
    expect(groups[0].items[0]).toMatchObject({ op: 'add', featureId: 'f1', snapshot: { kind: 'region' } })
    expect(groups[1]).toMatchObject({ runKey: 'manual', counts: { add: 0, update: 0, delete: 0 }, items: [] })
  })

  it('召回日志共享 loader 受控并发并按页序稳定合并', async () => {
    let active = 0
    let maxActive = 0
    const fetchMock = vi.fn(async (url) => {
      const page = Number(new URL(`http://localhost${url}`).searchParams.get('page') || 1)
      if (page > 1) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, (6 - page) * 2))
        active -= 1
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ page, totalPages: 5, entries: [{ id: `log_${page}` }] })
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await loadAllChatRecallActivityLogsBySessionId('session_1', { concurrency: 2 })

    expect(items.map((item) => item.id)).toEqual(['log_1', 'log_2', 'log_3', 'log_4', 'log_5'])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(maxActive).toBe(2)
  })

  it('召回日志共享 loader 把 AbortSignal 传到所有分页请求并中止旧加载', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn((url, options = {}) => {
      const page = Number(new URL(`http://localhost${url}`).searchParams.get('page') || 1)
      if (page === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ page: 1, totalPages: 3, entries: [{ id: 'log_1' }] })
        })
      }
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const loading = loadAllChatRecallActivityLogsBySessionId('session_1', { signal: controller.signal, concurrency: 2 })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    controller.abort()

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls.every(([, options]) => options?.signal === controller.signal)).toBe(true)
  })

  it('复制消息只发一次批量请求并保留输入顺序与扩展字段', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, count: 2 }) }))
    vi.stubGlobal('fetch', fetchMock)

    await copyChatMessagesToTarget('char_1', [
      { role: 'user', content: '第一条', env_date: '7月16日', attachments_json: '[{"id":"a"}]' },
      { role: 'assistant', content: '第二条', member_name: '星依', versions_json: ['旧稿'] }
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/data/chat/char_1/messages/batch-copy')
    const body = JSON.parse(options.body)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]).toEqual(expect.objectContaining({ content: '第一条', envDate: '7月16日', attachmentsJson: '[{"id":"a"}]' }))
    expect(body.messages[1]).toEqual(expect.objectContaining({ content: '第二条', memberName: '星依', versionList: ['旧稿'] }))
  })
})
