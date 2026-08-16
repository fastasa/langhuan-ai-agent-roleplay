import { describe, expect, it, vi } from 'vitest'
import { createNarrativeSeedAppService } from '../../../server/application/world/narrativeSeedAppService.js'
import db from '../../../server/db.js'

function createRepositoryFixture({ visibleWorldIds = ['world_a'] } = {}) {
  const worlds = new Map([
    ['world_a', { id: 'world_a', name: '世界 A', defaultMapSheetId: 'sheet_a' }],
    ['world_b', { id: 'world_b', name: '世界 B' }]
  ])
  const sessions = new Map([
    ['session_a', {
      id: 'session_a',
      worldId: 'world_a',
      virtualLocationSheetId: 'sheet_a',
      virtualLocationFeatureId: 'feature_a',
      virtualLocation: '旧钟楼',
      virtualTime: '2026-07-15T12:00:00.000Z'
    }],
    ['session_b', { id: 'session_b', worldId: 'world_b' }]
  ])
  const sheets = new Map([
    ['sheet_a', { id: 'sheet_a', worldId: 'world_a' }],
    ['sheet_b', { id: 'sheet_b', worldId: 'world_b' }]
  ])
  const features = new Map([
    ['feature_a', { id: 'feature_a', worldId: 'world_a', sheetId: 'sheet_a' }],
    ['feature_b', { id: 'feature_b', worldId: 'world_b', sheetId: 'sheet_b' }]
  ])
  const seeds = new Map()
  const participants = new Map()
  const links = new Map()
  const events = new Map()
  const configs = new Map()
  const repository = {
    findWorldById: vi.fn((id) => visibleWorldIds.includes(id) ? worlds.get(id) || null : null),
    findSessionById: vi.fn((id) => sessions.get(id) || null),
    listSessionParticipants: vi.fn((id) => id === 'session_a'
      ? [{ participantTargetId: 'char_a', participantType: 'char' }]
      : []),
    findMapSheetById: vi.fn((id) => sheets.get(id) || null),
    findMapFeatureById: vi.fn((id) => features.get(id) || null),
    listSeeds: vi.fn((worldId) => [...seeds.values()].filter((row) => row.worldId === worldId)),
    findSeedById: vi.fn((id) => seeds.get(id) || null),
    listParticipants: vi.fn((id) => participants.get(id) || []),
    listLinks: vi.fn((id) => links.get(id) || []),
    listWorldLinks: vi.fn((worldId) => [...links.values()].flat().filter((row) => row.worldId === worldId)),
    listEvents: vi.fn((id) => events.get(id) || []),
    getConfig: vi.fn((id) => configs.get(id) || null),
    insertSeed: vi.fn((row) => seeds.set(row.id, { ...row })),
    updateSeedOptimistic: vi.fn((seedId, worldId, version, row) => {
      const current = seeds.get(seedId)
      if (!current || current.worldId !== worldId || current.version !== version) return 0
      seeds.set(seedId, { ...row, version: version + 1 })
      return 1
    }),
    deleteSeedOptimistic: vi.fn((seedId, worldId, version) => {
      const current = seeds.get(seedId)
      if (!current || current.worldId !== worldId || current.version !== version) return 0
      seeds.delete(seedId); participants.delete(seedId); links.delete(seedId); events.delete(seedId)
      for (const [sourceId, rows] of links) links.set(sourceId, rows.filter((row) => row.targetSeedId !== seedId))
      return 1
    }),
    replaceParticipants: vi.fn((seedId, _worldId, rows) => participants.set(seedId, rows.map((row) => ({ ...row, seedId })))),
    replaceLinks: vi.fn((seedId, worldId, rows) => links.set(seedId, rows.map((row) => ({ ...row, worldId, sourceSeedId: seedId })))),
    appendEvent: vi.fn((row) => events.set(row.seedId, [...(events.get(row.seedId) || []), { ...row, diff: undefined, diffJson: JSON.stringify(row.diff || {}) }])),
    insertConfig: vi.fn((row) => configs.set(row.worldId, { ...row, version: 1 })),
    updateConfigOptimistic: vi.fn((worldId, version, row) => {
      const current = configs.get(worldId)
      if (!current || current.version !== version) return 0
      configs.set(worldId, { ...row, version: version + 1 })
      return 1
    }),
    transaction: vi.fn((run) => run())
  }
  return { repository, seeds, events, configs, sessions }
}

const formalSeedInput = (patch = {}) => ({
  type: 'foreshadow',
  title: '旧钟楼的秘密',
  description: '旧钟楼里留着一条尚未兑现的因果线。',
  cause: '角色已经在钟楼附近发现异常痕迹。',
  currentProgress: '异常痕迹已出现，来源尚未确认。',
  expectedOutcome: '角色介入后可能揭开钟楼机关的真相。',
  startTime: '2026-07-15T10:00:00.000Z',
  mapFeatureId: '',
  locationText: '世界A/旧城/旧钟楼',
  impactScope: '旧钟楼、周边街区与当前会话参与者',
  status: 'dormant',
  visibilityMode: 'director_only',
  allowFrontstage: false,
  participants: [],
  links: [],
  sourceSessionId: 'session_a',
  ...patch
})

describe('世界叙事种子服务', () => {
  it('正式 data scope 使用固定本地工作区', () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const worldId = `world_local_${suffix}`
    const service = createNarrativeSeedAppService()
    db.prepare('INSERT INTO worlds (id, name, description, status) VALUES (?, ?, ?, ?)')
      .run(worldId, '本地世界', '', 'active')

    const created = service.createSeed(worldId, formalSeedInput({ title: '本地种子', sourceSessionId: '' }))
    expect(created.ok).toBe(true)
    expect(service.listSeeds(worldId).data.items).toEqual([
      expect.objectContaining({ title: '本地种子' })
    ])
  })

  it('固定协议并拒绝跨世界地图引用、跨世界关系与不可见账号世界', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)

    expect(service.protocol().data.types).toContain('foreshadow')
    expect(service.createSeed('world_b', formalSeedInput({ title: '越权' })).status).toBe(404)
    expect(service.createSeed('world_a', formalSeedInput({
      type: 'world_change', title: '模型不许写图纸',
      mapSheetId: 'sheet_b'
    }))).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('mapSheetId') })

    const other = { id: 'seed_b', worldId: 'world_b', version: 1 }
    repository.findSeedById.mockImplementation((id) => id === 'seed_b' ? other : null)
    expect(service.createSeed('world_a', formalSeedInput({
      title: '跨世界关系',
      links: [{ targetSeedId: 'seed_b', relationType: 'depends_on' }]
    }))).toMatchObject({ ok: false, status: 400 })
  })

  it('新建种子强制 15 个模型字段完整，并校验三段地点格式', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const missing = formalSeedInput()
    delete missing.startTime
    expect(service.createSeed('world_a', missing)).toMatchObject({
      ok: false,
      status: 400,
      error: expect.stringContaining('startTime')
    })
    expect(service.createSeed('world_a', formalSeedInput({ locationText: '旧城钟楼' }))).toMatchObject({
      ok: false,
      status: 400,
      error: expect.stringContaining('大地点/中地点/小地点')
    })
  })

  it('创建时写当前状态与 created 账本；更新必须走乐观锁并追加状态事件', () => {
    const { repository, seeds, events } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const created = service.createSeed('world_a', formalSeedInput({
      type: 'countdown',
      title: '城门关闭',
      mapFeatureId: 'feature_a',
      participants: [{ participantType: 'freeform', displayName: '守门人' }]
    }))

    expect(created.ok).toBe(true)
    expect(created.data.mapSheetId).toBe('sheet_a')
    expect(created.data.version).toBe(1)
    expect(created.data.events[0].eventType).toBe('created')

    const seedId = created.data.id
    expect(service.updateSeed('world_a', seedId, { expectedVersion: 99, status: 'active' }).status).toBe(409)
    const updated = service.updateSeed('world_a', seedId, {
      expectedVersion: 1,
      status: 'active',
      currentProgress: '钟楼已响第一遍',
      evidenceSummary: '用户真实消息已落库'
    })
    expect(updated.ok).toBe(true)
    expect(updated.data.version).toBe(2)
    expect(seeds.get(seedId).status).toBe('active')
    expect(events.get(seedId).at(-1)).toMatchObject({ eventType: 'status_changed', fromStatus: 'dormant', toStatus: 'active' })
  })

  it('按流动帷幕时间自动把越时种子切为待引爆，并以时间门事件幂等留账', () => {
    const { repository, sessions, seeds, events } = createRepositoryFixture()
    const anchor = Date.parse('2026-07-20T16:00:00+08:00')
    Object.assign(sessions.get('session_a'), {
      virtualTime: '2026-07-20T16:00:00+08:00',
      virtualTimeBase: anchor,
      virtualTimeAnchor: anchor,
      virtualTimeRate: 1,
      dynamicWorldEnabled: false
    })
    const service = createNarrativeSeedAppService(repository)
    const seed = service.createSeed('world_a', formalSeedInput({
      title: '镜头里的张元英',
      status: 'active',
      startTime: '2026-07-20T16:30:00+08:00'
    })).data

    const first = service.syncTimeGatesForSession('session_a', { nowMs: anchor + 3.5 * 60 * 60 * 1000 })
    expect(first).toMatchObject({ ok: true, data: { transitionedCount: 1, transitionedSeedIds: [seed.id] } })
    expect(seeds.get(seed.id)).toMatchObject({ status: 'ready_to_trigger', version: 2, lastModifiedSource: 'system:curtain-clock' })
    expect(events.get(seed.id).at(-1)).toMatchObject({
      eventType: 'time_gate_reached',
      fromStatus: 'active',
      toStatus: 'ready_to_trigger'
    })
    expect(JSON.parse(events.get(seed.id).at(-1).diffJson)).toMatchObject({ overdueByMs: 3 * 60 * 60 * 1000, factCommitted: false })

    const second = service.syncTimeGatesForSession('session_a', { nowMs: anchor + 4 * 60 * 60 * 1000 })
    expect(second.data.transitionedCount).toBe(0)
    expect(events.get(seed.id).filter((event) => event.eventType === 'time_gate_reached')).toHaveLength(1)
  })

  it('预计影响只写事件，事实提交才推进状态，并按幂等键去重', () => {
    const { repository, events, seeds } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const seed = service.createSeed('world_a', formalSeedInput({ title: '缺失的齿轮', status: 'active' })).data

    const predicted = service.recordImpact('world_a', seed.id, {
      eventType: 'predicted_effect',
      effectSummary: '本轮计划可能让守钟人承认齿轮去向',
      idempotencyKey: 'predict_run_1',
      sourceSessionId: 'session_a',
      sourceMessageId: 10,
      sourceDirectorRunId: 'run_1'
    })
    expect(predicted.ok).toBe(true)
    expect(seeds.get(seed.id)).toMatchObject({ status: 'active', version: 1 })
    expect(events.get(seed.id).at(-1)).toMatchObject({ eventType: 'predicted_effect', sourceMessageId: 10 })

    const committed = service.recordImpact('world_a', seed.id, {
      eventType: 'fact_committed',
      expectedVersion: 1,
      comparisonOutcome: 'occurred',
      effectSummary: '守钟人实际承认已经藏起齿轮',
      currentProgress: '守钟人已承认藏起齿轮',
      status: 'triggered',
      evidenceSummary: '角色消息 #12',
      sourceMessageId: 12,
      idempotencyKey: 'fact_anchor_10_seed'
    })
    expect(committed.data).toMatchObject({ status: 'triggered', currentProgress: '守钟人已承认藏起齿轮', version: 2 })
    expect(events.get(seed.id).at(-1)).toMatchObject({ eventType: 'fact_committed', sourceMessageId: 12 })
    const eventCount = events.get(seed.id).length
    expect(service.recordImpact('world_a', seed.id, {
      eventType: 'fact_committed', expectedVersion: 1, comparisonOutcome: 'occurred',
      effectSummary: '重复提交', sourceMessageId: 12, idempotencyKey: 'fact_anchor_10_seed'
    }).ok).toBe(true)
    expect(events.get(seed.id)).toHaveLength(eventCount)
  })

  it('事实提交拒绝无版本或无证据结论，预测也不能夹带正式状态推进', () => {
    const { repository, seeds } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const seed = service.createSeed('world_a', formalSeedInput({ title: '午夜钟声', status: 'active' })).data
    expect(service.recordImpact('world_a', seed.id, {
      eventType: 'fact_committed', comparisonOutcome: 'occurred', effectSummary: '计划如此', idempotencyKey: 'bad'
    }).status).toBe(400)
    service.recordImpact('world_a', seed.id, {
      eventType: 'predicted_effect', effectSummary: '可能响钟', status: 'resolved', idempotencyKey: 'prediction_only'
    })
    expect(seeds.get(seed.id)).toMatchObject({ status: 'active', version: 1 })
  })

  it('世界剧本配置同样使用版本冲突协议', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)

    expect(service.getConfig('world_a').data.version).toBe(0)
    expect(service.saveConfig('world_a', { expectedVersion: 1, content: '信任与背叛' }).status).toBe(409)
    expect(service.saveConfig('world_a', { expectedVersion: 0, content: '信任与背叛' }).data.version).toBe(1)
    expect(service.saveConfig('world_a', { expectedVersion: 1, content: '慢热' }).data.version).toBe(2)
  })

  it('确定性取料按时间、精确地点、参与者、依赖与状态筛选，并标出知情边界', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const due = service.createSeed('world_a', formalSeedInput({
      type: 'countdown',
      title: '钟楼午夜关闭',
      startTime: '2026-07-15T11:00:00.000Z',
      visibilityMode: 'public'
    })).data
    const exactPlace = service.createSeed('world_a', formalSeedInput({
      type: 'foreshadow',
      title: '钟楼暗门',
      mapFeatureId: 'feature_a',
      visibilityMode: 'director_only'
    })).data
    const participant = service.createSeed('world_a', formalSeedInput({
      type: 'relationship_change',
      title: '甲的迟疑',
      participants: [{ participantType: 'character', participantId: 'char_a', displayName: '甲' }],
      visibilityMode: 'custom',
      visibility: { knownByParticipantIds: [], hiddenFromParticipantIds: ['char_a'] }
    })).data
    service.createSeed('world_a', formalSeedInput({
      type: 'world_change', title: '远方海啸', locationText: '海外/群岛/北岸', startTime: '2026-07-16T12:00:00.000Z'
    }))
    service.createSeed('world_a', formalSeedInput({ type: 'foreshadow', title: '已经解决', status: 'resolved', mapFeatureId: 'feature_a' }))
    const blocked = service.createSeed('world_a', formalSeedInput({
      type: 'offscreen_process',
      title: '尚未满足的后续',
      mapFeatureId: 'feature_a',
      links: [{ targetSeedId: due.id, relationType: 'depends_on' }]
    })).data

    const selected = service.selectRelevantSeeds('world_a', {
      sessionId: 'session_a',
      userText: '甲走进旧钟楼',
      limit: 8
    })

    expect(selected.ok).toBe(true)
    expect(selected.data.deterministic).toBe(true)
    expect(selected.data.items.map((item) => item.id)).toEqual(expect.arrayContaining([due.id, exactPlace.id, participant.id]))
    expect(selected.data.items.map((item) => item.id)).not.toContain(blocked.id)
    expect(selected.data.items.map((item) => item.title)).not.toContain('远方海啸')
    expect(selected.data.items.map((item) => item.title)).not.toContain('已经解决')
    expect(selected.data.items.find((item) => item.id === exactPlace.id)).toMatchObject({
      knowledgeBoundary: '仅提调可知',
      relevanceReasons: expect.arrayContaining(['命中当前帷幕精确地点'])
    })
    expect(selected.data.items.find((item) => item.id === participant.id).knowledgeBoundary).toContain('仅提调')
  })

  it('确定性取料拒绝未挂目标世界的会话，避免跨世界或全库召回', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    expect(service.selectRelevantSeeds('world_a', { sessionId: 'session_b', userText: '看看' })).toMatchObject({
      ok: false,
      status: 400
    })
  })

  it('后台演化只在开关开启时按到期时间取最多三条，并硬判当前帷幕影响', () => {
    const { repository, sessions } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    for (let index = 0; index < 5; index += 1) {
      service.createSeed('world_a', formalSeedInput({
        type: 'offscreen_process',
        title: `到期线 ${index}`,
        startTime: `2026-07-15T0${index + 1}:00:00.000Z`,
        mapFeatureId: index === 0 ? 'feature_a' : '',
        allowFrontstage: index === 0
      }))
    }
    service.createSeed('world_a', formalSeedInput({ title: '未来线', startTime: '2026-07-16T12:00:00.000Z' }))

    expect(service.selectOverdueSeeds('world_a', { sessionId: 'session_a', limit: 99 }).data).toMatchObject({ enabled: false, items: [] })
    sessions.get('session_a').dynamicWorldEnabled = true
    const selected = service.selectOverdueSeeds('world_a', { sessionId: 'session_a', limit: 99 })
    expect(selected.data.limit).toBe(3)
    expect(selected.data.items).toHaveLength(3)
    expect(selected.data.items[0]).toMatchObject({ title: '到期线 0', affectsCurrentCurtain: true })
    expect(selected.data.items.map((item) => item.title)).not.toContain('未来线')
  })

  it('已经在本次到期点之后推进过的种子不会连续每轮重复扫描', () => {
    const { repository, sessions } = createRepositoryFixture()
    sessions.get('session_a').dynamicWorldEnabled = true
    const service = createNarrativeSeedAppService(repository)
    service.createSeed('world_a', formalSeedInput({
      title: '已处理开始线', startTime: '2026-07-15T10:00:00.000Z', lastAdvancedAt: '2026-07-15T11:00:00.000Z'
    }))
    expect(service.selectOverdueSeeds('world_a', { sessionId: 'session_a' }).data.items).toEqual([])
  })

  it('后台事实提交可以把持续演化线的下一开始时间推到未来', () => {
    const { repository, sessions } = createRepositoryFixture()
    sessions.get('session_a').dynamicWorldEnabled = true
    const service = createNarrativeSeedAppService(repository)
    const seed = service.createSeed('world_a', formalSeedInput({ title: '巡逻队逼近', status: 'active', startTime: '2026-07-15T10:00:00.000Z' })).data
    expect(service.selectOverdueSeeds('world_a', { sessionId: 'session_a' }).data.items).toHaveLength(1)
    const readySeed = service.getSeed('world_a', seed.id).data
    expect(readySeed).toMatchObject({ status: 'ready_to_trigger', version: 2 })
    const evolved = service.recordImpact('world_a', seed.id, {
      eventType: 'fact_committed', expectedVersion: readySeed.version, comparisonOutcome: 'occurred',
      effectSummary: '巡逻队已抵达外街', currentProgress: '抵达外街', status: 'active',
      lastAdvancedAt: '2026-07-15T12:00:00.000Z', startTime: '2026-07-16T12:00:00.000Z',
      idempotencyKey: 'background:due:seed', sourceMessageId: 12
    })
    expect(evolved.data).toMatchObject({ startTime: '2026-07-16T12:00:00.000Z', version: 3 })
    expect(service.selectOverdueSeeds('world_a', { sessionId: 'session_a' }).data.items).toEqual([])
  })

  it('迁移预览只盘点显式提交的 localStorage 快照，不写库且不伪造已退役候选', () => {
    const { repository } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const preview = service.previewLegacyMigration('world_a', {
      legacyScripts: [
        {
          sessionId: 'session_a',
          script: {
            theme: '自由与责任',
            nextBeat: '玩家进入钟楼',
            foreshadows: [{ id: 'f1', text: '钟楼里缺了一枚齿轮', status: '已埋', fireWhen: '午夜' }],
            cast: [{ name: '守钟人', hidden: '他私藏了齿轮' }]
          }
        },
        { sessionId: 'session_b', script: { theme: '不应串入' } }
      ]
    })

    expect(preview.ok).toBe(true)
    expect(preview.data).toMatchObject({ readOnly: true, writesPerformed: 0 })
    expect(preview.data.legacyScripts.proposedSeeds).toHaveLength(2)
    expect(preview.data.legacyScripts.proposedSeeds[0].status).toBe('review_required')
    expect(preview.data.legacyEventCandidates).toMatchObject({ sourceStatus: 'retired', availableCount: 0 })
    expect(preview.data.conflicts).toContainEqual(expect.objectContaining({ sessionId: 'session_b', code: 'SESSION_WORLD_MISMATCH' }))
    expect(repository.insertSeed).not.toHaveBeenCalled()
    expect(repository.appendEvent).not.toHaveBeenCalled()
  })

  it('人工确认后原子迁移勾选候选，并以 migrated 事件保留来源', () => {
    const { repository, seeds, events } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const legacyScripts = [{ sessionId:'session_a', script:{ foreshadows:[{ id:'f1', text:'井盖下的旧钥匙', status:'已埋', fireWhen:'停电时' }] } }]
    expect(service.executeLegacyMigration('world_a', { legacyScripts, selectedSeedIndexes:[0] })).toMatchObject({ ok:false, status:400 })
    const migrated = service.executeLegacyMigration('world_a', { legacyScripts, selectedSeedIndexes:[0], confirmed:true })
    expect(migrated).toMatchObject({ ok:true, data:{ migratedCount:1, transaction:'committed' } })
    const seedId = migrated.data.createdIds[0]
    expect(seeds.get(seedId)).toMatchObject({ title:'井盖下的旧钥匙', status:'review_required', lastModifiedSource:'legacy_migration' })
    expect(events.get(seedId)[0]).toMatchObject({ eventType:'migrated', sourceSessionId:'session_a' })
  })

  it('用户删除必须匹配版本，并清理该种子的关系和账本', () => {
    const { repository, seeds, events } = createRepositoryFixture()
    const service = createNarrativeSeedAppService(repository)
    const created = service.createSeed('world_a', formalSeedInput({ title:'应被删除的伏笔' })).data
    expect(service.deleteSeed('world_a', created.id, { expectedVersion:99 })).toMatchObject({ ok:false, status:409 })
    expect(service.deleteSeed('world_a', created.id, { expectedVersion:1 })).toMatchObject({ ok:true, data:{ deleted:true } })
    expect(seeds.has(created.id)).toBe(false); expect(events.has(created.id)).toBe(false); expect(repository.deleteSeedOptimistic).toHaveBeenCalledOnce()
  })
})
