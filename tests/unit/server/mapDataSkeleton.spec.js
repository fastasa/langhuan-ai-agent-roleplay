import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'
import { createChatRepository } from '../../../server/repositories/chatRepository.ts'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

// 地图数据骨架（地图系统批4）：chat_map_sheets + chat_map_features 只挂 world_id（无双轨），
// 读=弹窗/绘舆共用 bundle，写=批量校验后统一落库。

async function createSqlJsWrapper() {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  return {
    db: {
      exec(sql) {
        raw.exec(sql)
      },
      prepare(sql) {
        return {
          all(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const rows = []
            while (stmt.step()) rows.push(stmt.getAsObject())
            stmt.free()
            return rows
          },
          get(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            const row = stmt.step() ? stmt.getAsObject() : undefined
            stmt.free()
            return row
          },
          run(...params) {
            const stmt = raw.prepare(sql)
            if (params.length) stmt.bind(params)
            stmt.step()
            stmt.free()
            return { changes: raw.getRowsModified() }
          }
        }
      }
    }
  }
}

// UNIQUE(id) 模拟正式表 UNIQUE(user_id, workspace_id, id)（测试 wrapper 绕过 scope 注入层），
// 否则 INSERT OR REPLACE 无约束可撞会退化成纯插入
function createMapTables(db) {
  db.exec(`
    CREATE TABLE chat_map_sheets (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      name TEXT NOT NULL,
      explored_json TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      UNIQUE(id)
    );
    CREATE TABLE chat_map_features (
      id TEXT NOT NULL,
      sheet_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      category TEXT DEFAULT '',
      name TEXT DEFAULT '',
      layer TEXT DEFAULT 'terrain',
      geometry_json TEXT DEFAULT '',
      style_json TEXT DEFAULT '',
      links_json TEXT DEFAULT '',
      meta_json TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      UNIQUE(id)
    );
  `)
}

function sheetRow(id, worldId, overrides = {}) {
  return {
    id,
    worldId,
    name: `图纸${id}`,
    exploredJson: '',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides
  }
}

function featureRow(id, sheetId, worldId, overrides = {}) {
  return {
    id,
    sheetId,
    worldId,
    kind: 'marker',
    category: 'building',
    name: `要素${id}`,
    layer: 'civic',
    geometryJson: JSON.stringify({ pts: [[100, 100]] }),
    styleJson: '',
    linksJson: '',
    metaJson: '',
    status: 'active',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...overrides
  }
}

describe('repository 地图双表（真 sql.js）', () => {
  it('图纸/要素按 world_id 隔离；图纸按 created_at 升序（第一张=主图纸）', async () => {
    const { db } = await createSqlJsWrapper()
    createMapTables(db)
    const repository = createChatRepository(db)

    repository.upsertMapSheet(sheetRow('sheet_b', 'world_1', { createdAt: '2026-07-11T02:00:00.000Z' }))
    repository.upsertMapSheet(sheetRow('sheet_a', 'world_1', { createdAt: '2026-07-11T01:00:00.000Z' }))
    repository.upsertMapSheet(sheetRow('sheet_other', 'world_2'))
    repository.upsertMapFeature(featureRow('feat_1', 'sheet_a', 'world_1'))
    repository.upsertMapFeature(featureRow('feat_other', 'sheet_other', 'world_2'))

    expect(repository.listMapSheets('world_1').map((item) => item.id)).toEqual(['sheet_a', 'sheet_b'])
    expect(repository.listMapFeaturesByWorld('world_1').map((item) => item.id)).toEqual(['feat_1'])
    expect(repository.findMapSheetById('sheet_other')?.worldId).toBe('world_2')
    // 跨世界查不到（world_id 同查）
    expect(repository.findMapFeatureById('feat_other', 'world_1')).toBeFalsy()
    expect(repository.findMapFeatureById('feat_other', 'world_2')?.id).toBe('feat_other')
  })

  it('listWorldMapSheetCounts：按 world_id 分组计数，软删图纸不计入（星依世界寻址批·2026-07-13·listWorlds 附带展示）', async () => {
    const { db } = await createSqlJsWrapper()
    createMapTables(db)
    const repository = createChatRepository(db)

    repository.upsertMapSheet(sheetRow('sheet_a', 'world_1'))
    repository.upsertMapSheet(sheetRow('sheet_b', 'world_1'))
    repository.upsertMapSheet(sheetRow('sheet_c', 'world_1', { status: 'deleted' }))
    repository.upsertMapSheet(sheetRow('sheet_d', 'world_2'))

    const counts = repository.listWorldMapSheetCounts()
    const byWorld = Object.fromEntries(counts.map((row) => [row.worldId, row.total]))
    expect(byWorld.world_1).toBe(2)
    expect(byWorld.world_2).toBe(1)
  })

  it('要素软删：删后读不到但行还在（持久痕迹）；重复删/跨世界删=0', async () => {
    const { db } = await createSqlJsWrapper()
    createMapTables(db)
    const repository = createChatRepository(db)

    repository.upsertMapFeature(featureRow('feat_1', 'sheet_a', 'world_1'))

    expect(repository.deleteMapFeature('feat_1', 'world_2')).toBe(0)
    expect(repository.deleteMapFeature('feat_1', 'world_1')).toBe(1)
    expect(repository.deleteMapFeature('feat_1', 'world_1')).toBe(0)
    expect(repository.listMapFeaturesByWorld('world_1')).toHaveLength(0)
    // 软删：行仍在表里（getAll 快照口径带 deleted 行原样导出）
    expect(db.prepare('SELECT status FROM chat_map_features WHERE id = ?').get('feat_1')?.status).toBe('deleted')
  })

  it('upsert 同 id 覆盖（INSERT OR REPLACE 全列带上，world_id/JSON 列不丢）', async () => {
    const { db } = await createSqlJsWrapper()
    createMapTables(db)
    const repository = createChatRepository(db)

    repository.upsertMapFeature(featureRow('feat_1', 'sheet_a', 'world_1', {
      linksJson: JSON.stringify({ panelId: 'panel_1' })
    }))
    repository.upsertMapFeature(featureRow('feat_1', 'sheet_a', 'world_1', {
      name: '改名后',
      linksJson: JSON.stringify({ panelId: 'panel_1' })
    }))

    const rows = repository.listMapFeaturesByWorld('world_1')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('改名后')
    expect(rows[0].worldId).toBe('world_1')
    // toCamel 对 {/[ 开头的字符串自动 JSON.parse——repository 读出的 JSON 列是对象（service 继承回写有专门归一）
    expect(rows[0].linksJson).toEqual({ panelId: 'panel_1' })
  })
})

// ── service 层（mock 仓储，语义与真 repository 一致）──
// 读侧回行模拟 dbUtils.toCamel：JSON 列（{/[ 开头字符串）被自动 parse 成对象——
// service 增量更新继承原行时必须能吃对象行（真环境就是这样），这里不模拟就测不到那颗雷
function simulateToCamel(row) {
  if (!row) return row
  const out = { ...row }
  for (const key of ['exploredJson', 'geometryJson', 'styleJson', 'linksJson', 'metaJson']) {
    const value = out[key]
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        out[key] = JSON.parse(value)
      } catch {
        /* 保留原串 */
      }
    }
  }
  return out
}

function createMapService() {
  const worlds = new Map([['world_1', { id: 'world_1', name: '沧澜大陆' }]])
  const sheets = new Map()
  const features = new Map()
  const chatRepository = {
    getSessionById: vi.fn(() => null),
    findWorldById: vi.fn((worldId) => worlds.get(worldId) || null),
    listMapSheets: vi.fn((worldId) => [...sheets.values()].filter((row) => row.worldId === worldId && row.status !== 'deleted').map(simulateToCamel)),
    findMapSheetById: vi.fn((sheetId) => {
      const row = sheets.get(sheetId)
      return row && row.status !== 'deleted' ? simulateToCamel(row) : null
    }),
    upsertMapSheet: vi.fn((row) => { sheets.set(row.id, { ...row }) }),
    setWorldDefaultMapSheet: vi.fn((worldId, sheetId, updatedAt) => {
      const world = worlds.get(worldId)
      if (!world) return 0
      world.defaultMapSheetId = sheetId
      world.updatedAt = updatedAt
      return 1
    }),
    listMapFeaturesByWorld: vi.fn((worldId) => [...features.values()].filter((row) => row.worldId === worldId && row.status !== 'deleted').map(simulateToCamel)),
    findMapFeatureById: vi.fn((featureId, worldId) => {
      const row = features.get(featureId)
      return row && row.worldId === worldId && row.status !== 'deleted' ? simulateToCamel(row) : null
    }),
    upsertMapFeature: vi.fn((row) => { features.set(row.id, { ...row }) }),
    deleteMapFeature: vi.fn((featureId, worldId) => {
      const row = features.get(featureId)
      if (!row || row.worldId !== worldId || row.status === 'deleted') return 0
      row.status = 'deleted'
      return 1
    })
  }
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
    persist: vi.fn()
  })
  return { service, sheets, features, worlds, chatRepository }
}

const EXPLORED_PTS = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]

describe('service 地图数据骨架', () => {
  it('第一张图自动成为显式默认，bundle 返回同一 defaultMapSheetId', () => {
    const { service, worlds, chatRepository } = createMapService()
    const first = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    const second = service.saveWorldMapSheet('world_1', { name: '异位面' }).data

    expect(first.id).not.toBe(second.id)
    expect(worlds.get('world_1').defaultMapSheetId).toBe(first.id)
    expect(chatRepository.setWorldDefaultMapSheet).toHaveBeenCalledTimes(1)
    expect(service.getWorldMapBundle('world_1').data.defaultMapSheetId).toBe(first.id)
  })

  it('世界不存在：读写删全部 404', () => {
    const { service } = createMapService()
    expect(service.getWorldMapBundle('world_missing').status).toBe(404)
    expect(service.saveWorldMapSheet('world_missing', { name: '主世界' }).status).toBe(404)
    expect(service.saveWorldMapFeatures('world_missing', { items: [{}] }).status).toBe(404)
    expect(service.deleteWorldMapFeature('world_missing', 'feat_1').status).toBe(404)
  })

  it('建图纸→批量上要素→bundle 按图纸分组返回（JSON 列 parse 成对象）', () => {
    const { service } = createMapService()

    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界', explored: { pts: EXPLORED_PTS } }).data
    expect(sheet.explored.pts).toHaveLength(4)

    const saved = service.saveWorldMapFeatures('world_1', {
      items: [
        {
          id: 'mt-xuanyue', sheetId: sheet.id, kind: 'region', category: 'mountain', name: '玄岳山脉', layer: 'terrain',
          geometry: { pts: [[100, 100], [300, 80], [500, 200]], spine: [[120, 120], [480, 180]], elevationM: 2800 },
          style: { labelMode: 'sprawl' }
        },
        {
          id: 'char-liu', sheetId: sheet.id, kind: 'marker', category: 'character', name: '柳如烟', layer: 'civic',
          geometry: { pts: [[400, 400]] },
          links: { panelId: 'panel_liu', hostType: 'character', hostId: 'char_liu' },
          meta: { originSessionId: 'session_1' }
        }
      ]
    })
    expect(saved.ok).toBe(true)
    expect(saved.data.saved).toBe(2)

    const bundle = service.getWorldMapBundle('world_1').data
    expect(bundle.world.id).toBe('world_1')
    expect(bundle.sheets).toHaveLength(1)
    expect(bundle.sheets[0].features.map((item) => item.id).sort()).toEqual(['char-liu', 'mt-xuanyue'])
    const mountain = bundle.sheets[0].features.find((item) => item.id === 'mt-xuanyue')
    expect(mountain.geometry.pts).toHaveLength(3)
    expect(mountain.geometry.spine).toHaveLength(2)
    // 海拔真值（地图视觉大改批1）：geometry.elevationM 随 pts/spine 一起落库+读回，非法/未给不写入
    expect(mountain.geometry.elevationM).toBe(2800)
    expect(mountain.style).toEqual({ labelMode: 'sprawl' })
    const character = bundle.sheets[0].features.find((item) => item.id === 'char-liu')
    expect(character.links.panelId).toBe('panel_liu')
    expect(character.meta.originSessionId).toBe('session_1')
    // 未给 elevationM 的要素不写入该键（marker 本就不带海拔真值·渲染端按类目缺省表兜底）
    expect(character.geometry.elevationM).toBeUndefined()
  })

  it('校验闸门：kind/layer/geometry/sheet 归属非法都 400，且整批不落库', () => {
    const { service, features } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data

    // region 少于 3 点
    expect(service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: sheet.id, kind: 'region', name: '残面', geometry: { pts: [[0, 0], [1, 1]] } }]
    }).status).toBe(400)
    // kind 非法
    expect(service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: sheet.id, kind: 'circle', name: '非法类', geometry: { pts: [[0, 0]] } }]
    }).status).toBe(400)
    // layer 非法
    expect(service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: sheet.id, kind: 'marker', layer: 'sky', name: '非法层', geometry: { pts: [[0, 0]] } }]
    }).status).toBe(400)
    // sheetId 不属于本世界
    expect(service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: 'sheet_ghost', kind: 'marker', name: '幽灵纸', geometry: { pts: [[0, 0]] } }]
    }).status).toBe(400)
    // 新建缺 geometry
    expect(service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: sheet.id, kind: 'marker', name: '没形状' }]
    }).status).toBe(400)
    // 批内第二条非法 → 第一条也不落（整批原子）
    const mixed = service.saveWorldMapFeatures('world_1', {
      items: [
        { sheetId: sheet.id, kind: 'marker', name: '合法', geometry: { pts: [[0, 0]] } },
        { sheetId: sheet.id, kind: 'region', name: '非法', geometry: { pts: [[0, 0]] } }
      ]
    })
    expect(mixed.status).toBe(400)
    expect(features.size).toBe(0)
  })

  it('增量更新：带 id 缺省字段继承原行；图纸 explored 键缺省保留、null 清空', () => {
    const { service } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界', explored: { pts: EXPLORED_PTS } }).data

    service.saveWorldMapFeatures('world_1', {
      items: [{
        id: 'feat_keep', sheetId: sheet.id, kind: 'marker', category: 'building', name: '海风客栈',
        geometry: { pts: [[10, 10]] }, style: { minScale: 0.11 }
      }]
    })
    // 只改名字：geometry/style 继承原行
    const updated = service.saveWorldMapFeatures('world_1', {
      items: [{ id: 'feat_keep', name: '海风客栈（翻修）' }]
    })
    expect(updated.ok).toBe(true)
    const row = updated.data.items[0]
    expect(row.name).toBe('海风客栈（翻修）')
    expect(row.geometry.pts).toEqual([[10, 10]])
    expect(row.style).toEqual({ minScale: 0.11 })

    // 图纸：不带 explored 键=保留
    const renamed = service.saveWorldMapSheet('world_1', { id: sheet.id, name: '主世界·改' }).data
    expect(renamed.explored.pts).toHaveLength(4)
    // explored: null=清空
    const cleared = service.saveWorldMapSheet('world_1', { id: sheet.id, explored: null }).data
    expect(cleared.explored).toBeNull()
    // 带 id 但不存在的图纸=404（防手滑静默新建）
    expect(service.saveWorldMapSheet('world_1', { id: 'sheet_ghost', name: '幽灵' }).status).toBe(404)
  })

  it('删要素：本世界软删成功，再次删/删不存在=404', () => {
    const { service } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    service.saveWorldMapFeatures('world_1', {
      items: [{ id: 'feat_gone', sheetId: sheet.id, kind: 'marker', name: '哨塔', geometry: { pts: [[5, 5]] } }]
    })

    expect(service.deleteWorldMapFeature('world_1', 'feat_gone').ok).toBe(true)
    expect(service.deleteWorldMapFeature('world_1', 'feat_gone').status).toBe(404)
    expect(service.getWorldMapBundle('world_1').data.sheets[0].features).toHaveLength(0)
  })
})
