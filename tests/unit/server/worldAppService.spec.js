import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

// 世界（跨会话共享一等实体·地图系统批2 + 世界管理页P1）：worlds CRUD 全量 + 会话挂世界三模式
// （挂已有/一键创建并挂/解绑）+ 世界挂文档库。真值口径见
function createWorldService() {
  const worlds = new Map()
  const sessions = new Map([
    ['session_1', { id: 'session_1', world_id: '', title: '会话甲' }],
    ['session_2', { id: 'session_2', world_id: '', title: '会话乙' }]
  ])
  const mapSheetCounts = new Map()
  const statusPanelCounts = new Map()
  const narrativeSeedCounts = new Map()
  const mapSheets = new Map()
  const mapFeatures = new Map()
  const participantsBySession = new Map()
  const docLinks = new Map()
  const chatRepository = {
    getSessionById: vi.fn((sessionId) => sessions.get(sessionId) || null),
    updateSessionById: vi.fn((sessionId, fields) => {
      const session = sessions.get(sessionId)
      if (session) Object.assign(session, fields)
      return true
    }),
    listWorlds: vi.fn(() => [...worlds.values()].filter((row) => row.status !== 'deleted')),
    // 与真 repository 同口径：软删的世界对 findWorldById 不可见
    findWorldById: vi.fn((worldId) => {
      const world = worlds.get(worldId)
      return world && world.status !== 'deleted' ? world : null
    }),
    upsertWorld: vi.fn((row) => { worlds.set(row.id, { ...row }) }),
    updateWorld: vi.fn((worldId, row) => {
      const world = worlds.get(worldId)
      if (!world) return 0
      Object.assign(world, row)
      return 1
    }),
    setWorldDefaultMapSheet: vi.fn((worldId, sheetId, updatedAt) => {
      const world = worlds.get(worldId)
      if (!world) return 0
      world.defaultMapSheetId = sheetId
      world.updatedAt = updatedAt
      return 1
    }),
    softDeleteWorld: vi.fn((worldId, updatedAt) => {
      const world = worlds.get(worldId)
      if (!world) return 0
      world.status = 'deleted'
      world.updatedAt = updatedAt
      return 1
    }),
    listWorldSessionCounts: vi.fn(() => {
      const counts = new Map()
      for (const session of sessions.values()) {
        const worldId = String(session.world_id || '')
        if (!worldId) continue
        counts.set(worldId, (counts.get(worldId) || 0) + 1)
      }
      return [...counts.entries()].map(([worldId, total]) => ({ worldId, total }))
    }),
    listSessionsByWorldId: vi.fn((worldId) => [...sessions.values()]
      .filter((session) => session.world_id === worldId)
      .map((session) => ({ id: session.id, title: session.title || '' }))),
    detachSessionsFromWorld: vi.fn((worldId) => {
      let count = 0
      for (const session of sessions.values()) {
        if (session.world_id === worldId) {
          session.world_id = ''
          count += 1
        }
      }
      return count
    }),
    countMapSheetsByWorldId: vi.fn((worldId) => mapSheetCounts.get(worldId) || 0),
    countStatusPanelsByWorldId: vi.fn((worldId) => statusPanelCounts.get(worldId) || 0),
    countNarrativeSeedsByWorldId: vi.fn((worldId) => narrativeSeedCounts.get(worldId) || 0),
    listMapSheets: vi.fn((worldId) => mapSheets.get(worldId) || []),
    findMapSheetById: vi.fn((sheetId) => [...mapSheets.values()].flat().find((sheet) => sheet.id === sheetId) || null),
    findMapFeatureById: vi.fn((featureId, worldId) => {
      const feature = mapFeatures.get(featureId)
      return feature && feature.worldId === worldId ? feature : null
    }),
    listSessionColumns: vi.fn(() => [
      'id', 'world_id', 'virtual_scene_world_id', 'virtual_location', 'virtual_location_large',
      'virtual_location_middle', 'virtual_location_small', 'virtual_location_sheet_id',
      'virtual_location_feature_id', 'virtual_time', 'virtual_weather', 'updated_at'
    ].map((name) => ({ name }))),
    listSessionParticipants: vi.fn((sessionId) => participantsBySession.get(sessionId) || []),
    listSessionParticipantsBySessionIds: vi.fn((sessionIds) => sessionIds.flatMap((sessionId) => participantsBySession.get(sessionId) || [])),
    listWorldDocLinks: vi.fn((worldId) => docLinks.get(worldId) || []),
    replaceWorldDocLinks: vi.fn((worldId, rows) => {
      docLinks.set(worldId, rows.map((row) => row.documentId))
    })
  }
  const persist = vi.fn()
  const service = createWorkspaceChatAppService({
    chatRepository,
    logger: { error: vi.fn() },
    normalizeChatTargetId: vi.fn((value) => value),
    repairLegacyChatTarget: vi.fn((value) => value),
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: vi.fn((value) => value),
    repairOrphanChatArchives: vi.fn(),
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: vi.fn((value) => value),
    cloneSessionMessages: vi.fn(),
    persist
  })
  return { service, chatRepository, worlds, sessions, mapSheetCounts, statusPanelCounts, narrativeSeedCounts, mapSheets, mapFeatures, participantsBySession, docLinks, persist }
}

describe('世界：创建与列表', () => {
  it('创建世界：名称必填、≤50 字；成功落库并 persist', () => {
    const { service, worlds, persist } = createWorldService()

    expect(service.createWorld({ name: '' }).status).toBe(400)
    expect(service.createWorld({ name: '一'.repeat(51) }).status).toBe(400)
    expect(persist).not.toHaveBeenCalled()

    const created = service.createWorld({ name: ' 沧澜大陆 ', description: '批2 样例世界' })
    expect(created.ok).toBe(true)
    expect(created.data.name).toBe('沧澜大陆')
    expect(created.data.id).toMatch(/^world_/)
    expect(worlds.size).toBe(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('listWorlds 附带每个世界的会话数 sessionCount', () => {
    const { service } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data
    service.attachWorldToSessionBySessionId('session_1', { worldId: world.id })
    service.attachWorldToSessionBySessionId('session_2', { worldId: world.id })

    const listed = service.listWorlds()
    expect(listed.ok).toBe(true)
    expect(listed.data.items).toHaveLength(1)
    expect(listed.data.items[0]).toMatchObject({ id: world.id, sessionCount: 2 })
  })
})

describe('世界：会话挂接三模式', () => {
  it('挂已有世界：会话不存在 404、世界不存在 404、成功写 world_id', () => {
    const { service, sessions } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data

    expect(service.attachWorldToSessionBySessionId('session_missing', { worldId: world.id }).status).toBe(404)
    expect(service.attachWorldToSessionBySessionId('session_1', { worldId: 'world_missing' }).status).toBe(404)
    expect(sessions.get('session_1').world_id).toBe('')

    const attached = service.attachWorldToSessionBySessionId('session_1', { worldId: world.id })
    expect(attached.ok).toBe(true)
    expect(attached.data.world.id).toBe(world.id)
    expect(attached.data.session.worldId).toBe(world.id)
    expect(attached.data.session.worldDocLibraryDocumentIds).toEqual([])
    expect(sessions.get('session_1').world_id).toBe(world.id)
  })

  it('一键创建并挂：无 worldId 时用 name 创建新世界并原子挂上；名称为空 400 且不写 world_id', () => {
    const { service, worlds, sessions } = createWorldService()

    expect(service.attachWorldToSessionBySessionId('session_1', { name: '' }).status).toBe(400)
    expect(worlds.size).toBe(0)
    expect(sessions.get('session_1').world_id).toBe('')

    const attached = service.attachWorldToSessionBySessionId('session_1', { name: '云中界', description: '一键创建' })
    expect(attached.ok).toBe(true)
    expect(attached.data.world.name).toBe('云中界')
    expect(worlds.size).toBe(1)
    expect(sessions.get('session_1').world_id).toBe(attached.data.world.id)
  })

  it('detach 解绑：world_id 清空、world 返回 null；世界本身保留', () => {
    const { service, worlds, sessions } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data
    service.attachWorldToSessionBySessionId('session_1', { worldId: world.id })
    expect(sessions.get('session_1').world_id).toBe(world.id)

    const detached = service.attachWorldToSessionBySessionId('session_1', { detach: true })
    expect(detached.ok).toBe(true)
    expect(detached.data.world).toBeNull()
    expect(detached.data.session.worldId).toBe('')
    expect(detached.data.session.worldDocLibraryDocumentIds).toEqual([])
    expect(sessions.get('session_1').world_id).toBe('')
    expect(worlds.size).toBe(1)
  })

  it('帷幕按世界归属遮蔽：首次挂入收养旧切片，换世界不串场，挂回原世界恢复', () => {
    const { service, sessions } = createWorldService()
    const worldA = service.createWorld({ name: '世界 A' }).data
    const worldB = service.createWorld({ name: '世界 B' }).data
    Object.assign(sessions.get('session_1'), { virtual_location: '旧宅 / 书房', virtual_time: '傍晚' })

    const attachedA = service.attachWorldToSessionBySessionId('session_1', { worldId: worldA.id })
    expect(attachedA.data.session.virtualLocation).toBe('旧宅 / 书房')
    expect(sessions.get('session_1').virtual_scene_world_id).toBe(worldA.id)

    const switchedB = service.attachWorldToSessionBySessionId('session_1', { worldId: worldB.id })
    expect(switchedB.data.session.virtualLocation).toBe('')
    expect(switchedB.data.session.virtualTime).toBe('')
    expect(sessions.get('session_1').virtual_location).toBe('旧宅 / 书房')

    const restoredA = service.attachWorldToSessionBySessionId('session_1', { worldId: worldA.id })
    expect(restoredA.data.session.virtualLocation).toBe('旧宅 / 书房')
    expect(restoredA.data.session.virtualTime).toBe('傍晚')
  })

  it('帷幕地图引用由服务端校验世界归属；要素可反推图纸，无世界拒绝非空引用', () => {
    const { service, sessions, mapSheets, mapFeatures } = createWorldService()
    const worldA = service.createWorld({ name: '世界 A' }).data
    const worldB = service.createWorld({ name: '世界 B' }).data
    mapSheets.set(worldA.id, [{ id: 'sheet_a', name: 'A 图', worldId: worldA.id }])
    mapSheets.set(worldB.id, [{ id: 'sheet_b', name: 'B 图', worldId: worldB.id }])
    mapFeatures.set('feature_a', { id: 'feature_a', worldId: worldA.id, sheetId: 'sheet_a' })
    service.attachWorldToSessionBySessionId('session_1', { worldId: worldA.id })

    expect(service.updateChatSessionById('session_1', { virtualLocationSheetId: 'sheet_b' }).status).toBe(400)
    expect(service.updateChatSessionById('session_2', { virtualLocationSheetId: 'sheet_a' }).status).toBe(400)

    const saved = service.updateChatSessionById('session_1', {
      virtualLocation: '港口',
      virtualLocationFeatureId: 'feature_a'
    })
    expect(saved.ok).toBe(true)
    expect(sessions.get('session_1')).toMatchObject({
      virtual_scene_world_id: worldA.id,
      virtual_location_sheet_id: 'sheet_a',
      virtual_location_feature_id: 'feature_a'
    })
  })
})

describe('世界：改名/简介（P1）', () => {
  it('世界不存在 404；名称超长 400；成功改名+简介并 persist', () => {
    const { service, worlds, persist } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data

    expect(service.updateWorldById('world_missing', { name: '新名' }).status).toBe(404)
    expect(service.updateWorldById(world.id, { name: '一'.repeat(51) }).status).toBe(400)
    expect(service.updateWorldById(world.id, { name: '' }).status).toBe(400)

    persist.mockClear()
    const updated = service.updateWorldById(world.id, { name: ' 新沧澜 ', description: '改写后的简介' })
    expect(updated.ok).toBe(true)
    expect(updated.data.world.name).toBe('新沧澜')
    expect(updated.data.world.description).toBe('改写后的简介')
    expect(worlds.get(world.id).name).toBe('新沧澜')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('默认图纸只能指向本世界，详情返回统一的有效默认图纸', () => {
    const { service, mapSheets } = createWorldService()
    const worldA = service.createWorld({ name: '世界 A' }).data
    const worldB = service.createWorld({ name: '世界 B' }).data
    mapSheets.set(worldA.id, [
      { id: 'sheet_a1', name: '旧大陆', worldId: worldA.id },
      { id: 'sheet_a2', name: '新大陆', worldId: worldA.id }
    ])
    mapSheets.set(worldB.id, [{ id: 'sheet_b1', name: '异界', worldId: worldB.id }])

    expect(service.getWorldDetailById(worldA.id).data.defaultMapSheetId).toBe('sheet_a1')
    expect(service.updateWorldById(worldA.id, { defaultMapSheetId: 'sheet_b1' }).status).toBe(400)

    const updated = service.updateWorldById(worldA.id, { defaultMapSheetId: 'sheet_a2' })
    expect(updated.ok).toBe(true)
    expect(updated.data.world.defaultMapSheetId).toBe('sheet_a2')
    expect(service.getWorldDetailById(worldA.id).data.defaultMapSheetId).toBe('sheet_a2')
  })
})

describe('世界：软删（P1）', () => {
  it('世界下有地图 409 reason=maps；世界下有世界级状态面板 409 reason=statusPanels', () => {
    const { service, mapSheetCounts, statusPanelCounts } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data

    mapSheetCounts.set(world.id, 2)
    const mapsBlocked = service.deleteWorldById(world.id)
    expect(mapsBlocked.status).toBe(409)
    expect(mapsBlocked.reason).toBe('maps')
    expect(mapsBlocked.count).toBe(2)

    mapSheetCounts.set(world.id, 0)
    statusPanelCounts.set(world.id, 3)
    const panelsBlocked = service.deleteWorldById(world.id)
    expect(panelsBlocked.status).toBe(409)
    expect(panelsBlocked.reason).toBe('statusPanels')
    expect(panelsBlocked.count).toBe(3)
  })

  it('世界下有叙事种子时拒绝删除，避免世界账本成为孤儿', () => {
    const { service, narrativeSeedCounts } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data
    narrativeSeedCounts.set(world.id, 2)

    const blocked = service.deleteWorldById(world.id)
    expect(blocked).toMatchObject({ status: 409, reason: 'narrativeSeeds', count: 2 })
  })

  it('通过护栏：挂载会话全部解绑+清挂载文档+软删+persist；返回解绑会话数；世界随后 404', () => {
    const { service, worlds, sessions, docLinks, persist } = createWorldService()
    const world = service.createWorld({ name: '沧澜大陆' }).data
    service.attachWorldToSessionBySessionId('session_1', { worldId: world.id })
    service.attachWorldToSessionBySessionId('session_2', { worldId: world.id })
    docLinks.set(world.id, ['doc_1', 'doc_2'])

    persist.mockClear()
    const deleted = service.deleteWorldById(world.id)
    expect(deleted.ok).toBe(true)
    expect(deleted.data.detachedSessionCount).toBe(2)
    expect(sessions.get('session_1').world_id).toBe('')
    expect(sessions.get('session_2').world_id).toBe('')
    expect(docLinks.get(world.id)).toEqual([])
    expect(worlds.get(world.id).status).toBe('deleted')
    expect(persist).toHaveBeenCalledTimes(1)

    // 世界已软删：findWorldById 过滤，后续读/删都 404
    expect(service.getWorldDetailById(world.id).status).toBe(404)
    expect(service.deleteWorldById(world.id).status).toBe(404)
  })
})

describe('世界：详情取料（P1）', () => {
  it('世界不存在 404；返回地图/挂载会话/出场角色去重集合/挂载文档', () => {
    const { service, mapSheets, participantsBySession, docLinks } = createWorldService()
    expect(service.getWorldDetailById('world_missing').status).toBe(404)

    const world = service.createWorld({ name: '沧澜大陆' }).data
    service.attachWorldToSessionBySessionId('session_1', { worldId: world.id })
    service.attachWorldToSessionBySessionId('session_2', { worldId: world.id })
    mapSheets.set(world.id, [
      { id: 'sheet_1', name: '主世界', worldId: world.id, createdAt: '', updatedAt: '', exploredJson: '' }
    ])
    participantsBySession.set('session_1', [
      { participantType: 'char', participantTargetId: 'char_a' },
      { participantType: 'char', participantTargetId: 'char_b' }
    ])
    participantsBySession.set('session_2', [
      { participantType: 'char', participantTargetId: 'char_b' },
      { participantType: 'group', participantTargetId: 'group_x' }
    ])
    docLinks.set(world.id, ['doc_1', 'doc_2'])

    const detail = service.getWorldDetailById(world.id)
    expect(detail.ok).toBe(true)
    expect(detail.data.world.id).toBe(world.id)
    expect(detail.data.maps).toEqual([{ id: 'sheet_1', name: '主世界' }])
    expect(detail.data.sessions).toEqual([
      { id: 'session_1', name: '会话甲' },
      { id: 'session_2', name: '会话乙' }
    ])
    // 群聊成员不展开：group_x 不进 characterIds；char_b 跨会话去重只出现一次
    expect([...detail.data.characterIds].sort()).toEqual(['char_a', 'char_b'])
    expect(detail.data.docLinks).toEqual(['doc_1', 'doc_2'])
  })
})

describe('世界：挂文档库（P1）', () => {
  it('世界不存在 404；全量替换去重；超过 500 上限 400；二次替换是覆盖不是叠加', () => {
    const { service, docLinks } = createWorldService()
    expect(service.replaceWorldDocLinksById('world_missing', { documentIds: ['doc_1'] }).status).toBe(404)

    const world = service.createWorld({ name: '沧澜大陆' }).data
    const replaced = service.replaceWorldDocLinksById(world.id, { documentIds: ['doc_1', 'doc_2', 'doc_1', ' doc_3 '] })
    expect(replaced.ok).toBe(true)
    expect(replaced.data.documentIds).toEqual(['doc_1', 'doc_2', 'doc_3'])
    expect(docLinks.get(world.id)).toEqual(['doc_1', 'doc_2', 'doc_3'])

    service.replaceWorldDocLinksById(world.id, { documentIds: ['doc_9'] })
    expect(docLinks.get(world.id)).toEqual(['doc_9'])

    const overCap = Array.from({ length: 501 }, (_, index) => `doc_${index}`)
    expect(service.replaceWorldDocLinksById(world.id, { documentIds: overCap }).status).toBe(400)
  })
})
