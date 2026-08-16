import { describe, expect, it, vi } from 'vitest'
import {
  renderRelevantNarrativeSeedsBlock,
  renderNarrativeSeedDetail
} from '../../../src/app/narrativeSeedDirectorContext.ts'
import { buildGroupDirectorMessages } from '../../../src/app/groupDirectorPass.ts'
import { createReadNarrativeSeedTool, createCreateNarrativeSeedTool, createUpdateNarrativeSeedTool } from '../../../src/app/tidiaoGlobalTools.ts'
import { fetchNarrativeSeedDetail, fetchRelevantNarrativeSeeds } from '../../../src/repositories/chatRepository.ts'

describe('提调叙事种子只读接线', () => {
  const bundle = {
    worldId: 'world_a',
    sessionId: 'session_a',
    deterministic: true,
    scannedCount: 4,
    items: [{
      id: 'seed_clock',
      type: 'countdown',
      title: '钟楼午夜关闭',
      currentProgress: '钟声已经响过两次',
      expectedOutcome: '',
      startTime: '午夜',
      locationText: '东陆/旧城/旧钟楼',
      impactScope: '旧钟楼与周边城门',
      status: 'active',
      allowFrontstage: false,
      knowledgeBoundary: '仅提调可知',
      relevanceScore: 145,
      relevanceReasons: ['命中当前帷幕精确地点', '叙事时间文字命中']
    }]
  }

  it('摘要明确是候选判断、保留知情边界，并进入提调真实 user 层', () => {
    const block = renderRelevantNarrativeSeedsBlock(bundle)
    const messages = buildGroupDirectorMessages({
      userText: '继续往钟楼里走',
      candidates: [{ characterId: 'char_a', name: '甲' }],
      forcedCharacterIds: [],
      excludedCharacterIds: []
    }, { narrativeSeedsBlock: block })

    expect(block).toContain('候选判断')
    expect(block).toContain('不是已发生事实')
    expect(block).toContain('仅提调可知')
    expect(messages[1].content).toContain('钟楼午夜关闭')
    expect(messages[0].content).not.toContain('钟楼午夜关闭')
  })

  it('空召回显式禁止回退其它世界或硬拉远处种子', () => {
    const block = renderRelevantNarrativeSeedsBlock({ ...bundle, items: [] })
    expect(block).toContain('不得回退到其它世界')
    expect(block).toContain('远处种子')
  })

  it('待引爆摘要显示已越过时长，要求本轮退出状态但不把预期后果当事实', () => {
    const block = renderRelevantNarrativeSeedsBlock({
      ...bundle,
      items: [{
        ...bundle.items[0],
        status: 'ready_to_trigger',
        startTime: '2026-07-20T16:30:00+08:00',
        currentCurtainTime: '2026-07-20T19:34:00+08:00',
        overdueByMs: 3 * 60 * 60 * 1000 + 4 * 60 * 1000
      }]
    })

    expect(block).toContain('状态：待引爆')
    expect(block).toContain('已越过：3小时4分钟')
    expect(block).toContain('原种子必须在本轮结算并退出该状态')
    expect(block).toContain('用 updateNarrativeSeed 让原种子退出 ready_to_trigger')
    expect(block).toContain('预期后果仍需核证')
  })

  it('按需读取工具只允许本轮召回 id，完整详情继续区分预期与事实', async () => {
    const readSeed = vi.fn(async () => ({
      id: 'seed_clock',
      title: '钟楼午夜关闭',
      type: 'countdown',
      status: 'active',
      version: 2,
      description: '钟楼机关会在午夜封闭城门。',
      expectedOutcome: '城门关闭',
      visibilityMode: 'director_only',
      allowFrontstage: false,
      participants: [],
      links: [],
      visibility: {}
    }))
    const tool = createReadNarrativeSeedTool({ allowedSeedIds: new Set(['seed_clock']), readSeed })
    const rejected = await tool.execute({ args: { seedId: 'seed_far' } })
    const accepted = await tool.execute({ args: { seedId: 'seed_clock' } })

    expect(rejected.error?.type).toBe('INVALID_ARGUMENT')
    expect(readSeed).toHaveBeenCalledTimes(1)
    expect(accepted.content).toContain('预期后果：城门关闭')
    expect(accepted.content).toContain('不得把预期后果当成已发生事实')
    expect(renderNarrativeSeedDetail(await readSeed('seed_clock'))).toContain('仅提调可知的信息')
  })

  it('客户端只向目标世界 relevant 端点提交会话和本轮文本，详情走单种子端点', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        worldId: 'world_a', sessionId: 'session_a', deterministic: true, scannedCount: 2, items: bundle.items
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'seed_clock', title: '钟楼午夜关闭' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const selected = await fetchRelevantNarrativeSeeds('world_a', { sessionId: 'session_a', userText: '继续走', limit: 8 })
      const detail = await fetchNarrativeSeedDetail('world_a', 'seed_clock')
      expect(selected.items[0]).toMatchObject({ id: 'seed_clock', knowledgeBoundary: '仅提调可知' })
      expect(detail.title).toBe('钟楼午夜关闭')
      expect(fetchMock.mock.calls[0][0]).toBe('/api/data/worlds/world_a/narrative-seeds/relevant')
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sessionId: 'session_a', userText: '继续走', limit: 8 })
      expect(fetchMock.mock.calls[1][0]).toBe('/api/data/worlds/world_a/narrative-seeds/seed_clock')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('用户明确改剧本走世界种子 create/update 写链，并携带会话与 directorRunId 审计来源', async () => {
    const fullSeed = {
      type:'foreshadow',title:'旧信伏笔',description:'抽屉里有一封未寄出的信',cause:'角色已经发现抽屉被动过',
      currentProgress:'信仍在抽屉里',expectedOutcome:'信件可能揭开旧关系',startTime:'2026-07-15T13:00:00Z',mapFeatureId:'',
      locationText:'东陆/旧城/钟楼书房',impactScope:'钟楼书房与相关角色关系',status:'active',visibilityMode:'director_only',
      allowFrontstage:true,participants:[],links:[]
    }
    const createSeed = vi.fn(async (payload) => ({ id: 'seed_new', version: 1, ...payload }))
    const readSeed = vi.fn(async () => ({ id: 'seed_clock', version: 2, ...fullSeed, title:'钟楼午夜关闭' }))
    const updateSeed = vi.fn(async (_id, payload) => ({ id: 'seed_clock', title: '钟楼午夜关闭', version: 3, ...payload }))
    const ctx = { worldId: 'world_a', sessionId: 'session_a', directorRunId: 'run_a', createSeed, readSeed, updateSeed }
    const createTool = createCreateNarrativeSeedTool(ctx)
    expect(createTool.validateArgs(fullSeed)).toBeNull()
    expect(createTool.validateArgs({ title:'漏字段' })).toContain('缺少字段')
    const created = await createTool.execute({ args: fullSeed })
    expect(created.acted).toBe(true)
    expect(createSeed).toHaveBeenCalledWith(expect.objectContaining({
      title: '旧信伏笔', lastModifiedSource: 'director', sourceSessionId: 'session_a', sourceDirectorRunId: 'run_a'
    }))
    const conflict = await createUpdateNarrativeSeedTool(ctx).execute({ args: { seedId: 'seed_clock', expectedVersion: 1, status: 'triggered' } })
    expect(conflict.error?.type).toBe('INVALID_ARGUMENT')
    expect(updateSeed).not.toHaveBeenCalled()
    const updated = await createUpdateNarrativeSeedTool(ctx).execute({ args: { seedId: 'seed_clock', expectedVersion: 2, status: 'triggered' } })
    expect(updated.acted).toBe(true)
    expect(updateSeed).toHaveBeenCalledWith('seed_clock', expect.objectContaining({ expectedVersion: 2, status: 'triggered', sourceDirectorRunId: 'run_a' }))
  })
})
