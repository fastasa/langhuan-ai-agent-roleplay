import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'
import { createChatRepository } from '../../../server/repositories/chatRepository.ts'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

// 地图版本历史（批L·2026-07-12）：world_map_change_log 表——要素写入口（批量存/删）每笔变更日志，
// op=add/update/delete，snapshot_json=操作后快照（delete=删除前最后快照），run_key/run_label=派发运行标识
// （缺省 'manual'），每 world 只保留最近 500 行。查询按 run 分组（相邻同 run_key 归组）最多 50 组。
// 结构仿 mapDataSkeleton.spec.js：repository 用真 sql.js，service 用 mock 仓储。

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

// UNIQUE(id) 模拟正式表 UNIQUE(user_id, workspace_id, id)（测试 wrapper 绕过 scope 注入层）
function createChangeLogTable(db) {
  db.exec(`
    CREATE TABLE world_map_change_log (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      run_key TEXT DEFAULT 'manual',
      run_label TEXT DEFAULT '',
      op TEXT NOT NULL,
      feature_id TEXT NOT NULL,
      snapshot_json TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      UNIQUE(id)
    );
  `)
}

function logRow(id, worldId, overrides = {}) {
  return {
    id,
    worldId,
    runKey: 'manual',
    runLabel: '',
    op: 'add',
    featureId: `feat_${id}`,
    snapshotJson: JSON.stringify({ id: `feat_${id}`, kind: 'marker', geometry: { pts: [[1, 1]] } }),
    createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides
  }
}

describe('repository 地图版本历史（真 sql.js）', () => {
  it('insert + list：按 created_at DESC, id DESC 返回，且按 world_id 隔离', async () => {
    const { db } = await createSqlJsWrapper()
    createChangeLogTable(db)
    const repository = createChatRepository(db)

    repository.insertMapChangeLog(logRow('log_a', 'world_1', { createdAt: '2026-07-12T01:00:00.000Z' }))
    repository.insertMapChangeLog(logRow('log_b', 'world_1', { createdAt: '2026-07-12T02:00:00.000Z' }))
    repository.insertMapChangeLog(logRow('log_other', 'world_2'))

    const rows = repository.listMapChangeLog('world_1')
    expect(rows.map((row) => row.id)).toEqual(['log_b', 'log_a'])
    expect(rows[0].worldId).toBe('world_1')
    // toCamel 对 { 开头字符串自动 parse：snapshot_json 读出即对象
    expect(rows[0].snapshotJson).toMatchObject({ kind: 'marker' })
    expect(repository.listMapChangeLog('world_2')).toHaveLength(1)
  })

  it('同一毫秒批量写入靠 id 尾部序号稳定排序（created_at 相同）', async () => {
    const { db } = await createSqlJsWrapper()
    createChangeLogTable(db)
    const repository = createChatRepository(db)

    const at = '2026-07-12T03:00:00.000Z'
    repository.insertMapChangeLog(logRow('map_log_1_000001_aa', 'world_1', { createdAt: at }))
    repository.insertMapChangeLog(logRow('map_log_1_000002_bb', 'world_1', { createdAt: at }))

    const rows = repository.listMapChangeLog('world_1')
    expect(rows.map((row) => row.id)).toEqual(['map_log_1_000002_bb', 'map_log_1_000001_aa'])
  })

  it('prune：每 world 只留最近 keep 行，只删本表且不跨世界误删', async () => {
    const { db } = await createSqlJsWrapper()
    createChangeLogTable(db)
    const repository = createChatRepository(db)

    for (let i = 1; i <= 8; i++) {
      repository.insertMapChangeLog(logRow(`log_${String(i).padStart(2, '0')}`, 'world_1', {
        createdAt: `2026-07-12T0${Math.min(i, 9)}:00:00.000Z`
      }))
    }
    repository.insertMapChangeLog(logRow('log_keep_other', 'world_2'))

    const removed = repository.pruneMapChangeLog('world_1', 3)
    expect(removed).toBe(5)
    const rows = repository.listMapChangeLog('world_1')
    expect(rows.map((row) => row.id)).toEqual(['log_08', 'log_07', 'log_06'])
    // world_2 的行不受影响
    expect(repository.listMapChangeLog('world_2')).toHaveLength(1)
    // 行数不超过 keep 时 prune 是 no-op
    expect(repository.pruneMapChangeLog('world_1', 3)).toBe(0)
  })
})

// ── service 层（mock 仓储，语义与真 repository 一致）──
function simulateToCamel(row) {
  if (!row) return row
  const out = { ...row }
  for (const key of ['exploredJson', 'geometryJson', 'styleJson', 'linksJson', 'metaJson', 'snapshotJson']) {
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
  const changeLogs = []
  const chatRepository = {
    getSessionById: vi.fn(() => null),
    findWorldById: vi.fn((worldId) => worlds.get(worldId) || null),
    listMapSheets: vi.fn((worldId) => [...sheets.values()].filter((row) => row.worldId === worldId && row.status !== 'deleted').map(simulateToCamel)),
    findMapSheetById: vi.fn((sheetId) => {
      const row = sheets.get(sheetId)
      return row && row.status !== 'deleted' ? simulateToCamel(row) : null
    }),
    upsertMapSheet: vi.fn((row) => { sheets.set(row.id, { ...row }) }),
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
    }),
    insertMapChangeLog: vi.fn((row) => { changeLogs.push({ ...row }) }),
    // 真 repository 是 created_at DESC, id DESC；mock 里 push 顺序即时间顺序，倒序返回等价
    listMapChangeLog: vi.fn((worldId) => [...changeLogs].filter((row) => row.worldId === worldId).reverse().map(simulateToCamel)),
    pruneMapChangeLog: vi.fn(() => 0)
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
  return { service, chatRepository, changeLogs }
}

describe('service 地图版本历史：写入口打日志', () => {
  it('批量存要素：新建=add、带 id 更新=update，snapshot=操作后快照，runMeta 透传', () => {
    const { service, chatRepository, changeLogs } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data

    // 第一批：两条新建（带派发标识）
    const first = service.saveWorldMapFeatures('world_1', {
      runMeta: { runKey: 'huiyu-1', runLabel: '画玄岳山脉' },
      items: [
        { id: 'mt-a', sheetId: sheet.id, kind: 'region', category: 'mountain', name: '玄岳', layer: 'terrain', geometry: { pts: [[0, 0], [10, 0], [10, 10]] } },
        { sheetId: sheet.id, kind: 'marker', category: 'building', name: '客栈', geometry: { pts: [[5, 5]] } }
      ]
    })
    expect(first.ok).toBe(true)
    expect(changeLogs).toHaveLength(2)
    expect(changeLogs[0]).toMatchObject({ worldId: 'world_1', runKey: 'huiyu-1', runLabel: '画玄岳山脉', op: 'add', featureId: 'mt-a' })
    expect(changeLogs[1].op).toBe('add')
    // snapshot=操作后快照（projectMapFeatureRow 视图形状，几何已 parse）
    const snapshotA = JSON.parse(changeLogs[0].snapshotJson)
    expect(snapshotA).toMatchObject({ id: 'mt-a', kind: 'region', name: '玄岳' })
    expect(snapshotA.geometry.pts).toHaveLength(3)

    // 第二批：同 id 增量更新 → op=update；不带 runMeta → 'manual'
    service.saveWorldMapFeatures('world_1', { items: [{ id: 'mt-a', name: '玄岳（更名）' }] })
    expect(changeLogs).toHaveLength(3)
    expect(changeLogs[2]).toMatchObject({ runKey: 'manual', runLabel: '', op: 'update', featureId: 'mt-a' })
    expect(JSON.parse(changeLogs[2].snapshotJson).name).toBe('玄岳（更名）')

    // 每次写入都触发本表修剪（500 行帽）
    expect(chatRepository.pruneMapChangeLog).toHaveBeenCalledWith('world_1', 500)
  })

  it('校验失败整批不落库时不写任何日志', () => {
    const { service, changeLogs } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    const bad = service.saveWorldMapFeatures('world_1', {
      items: [{ sheetId: sheet.id, kind: 'region', name: '残面', geometry: { pts: [[0, 0], [1, 1]] } }]
    })
    expect(bad.status).toBe(400)
    expect(changeLogs).toHaveLength(0)
  })

  it('删要素：op=delete、snapshot=删除前最后快照、runMeta 从 query 透传', () => {
    const { service, changeLogs } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    service.saveWorldMapFeatures('world_1', {
      items: [{ id: 'feat_gone', sheetId: sheet.id, kind: 'marker', name: '哨塔', geometry: { pts: [[5, 5]] } }]
    })

    const result = service.deleteWorldMapFeature('world_1', 'feat_gone', { runKey: 'huiyu-2', runLabel: '拆除哨塔' })
    expect(result.ok).toBe(true)
    const deleteLog = changeLogs[changeLogs.length - 1]
    expect(deleteLog).toMatchObject({ op: 'delete', featureId: 'feat_gone', runKey: 'huiyu-2', runLabel: '拆除哨塔' })
    expect(JSON.parse(deleteLog.snapshotJson)).toMatchObject({ id: 'feat_gone', name: '哨塔' })

    // 删不存在的要素：404 且不写日志
    const before = changeLogs.length
    expect(service.deleteWorldMapFeature('world_1', 'feat_gone').status).toBe(404)
    expect(changeLogs).toHaveLength(before)
  })
})

describe('service 地图版本历史：分组查询', () => {
  it('世界不存在=404；相邻同 runKey 归组、计数正确、runLabel 取组内首个非空', () => {
    const { service } = createMapService()
    expect(service.getWorldMapChangeLog('world_missing').status).toBe(404)

    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    // run huiyu-1：两加一改
    service.saveWorldMapFeatures('world_1', {
      runMeta: { runKey: 'huiyu-1', runLabel: '画地形' },
      items: [
        { id: 'a', sheetId: sheet.id, kind: 'marker', name: '甲', geometry: { pts: [[0, 0]] } },
        { id: 'b', sheetId: sheet.id, kind: 'marker', name: '乙', geometry: { pts: [[1, 1]] } }
      ]
    })
    service.saveWorldMapFeatures('world_1', {
      runMeta: { runKey: 'huiyu-1', runLabel: '画地形' },
      items: [{ id: 'a', name: '甲·改' }]
    })
    // 手动散修一笔
    service.saveWorldMapFeatures('world_1', {
      items: [{ id: 'c', sheetId: sheet.id, kind: 'marker', name: '丙', geometry: { pts: [[2, 2]] } }]
    })
    // run huiyu-2：删一笔
    service.deleteWorldMapFeature('world_1', 'b', { runKey: 'huiyu-2', runLabel: '拆乙' })

    const data = service.getWorldMapChangeLog('world_1').data
    expect(data.worldId).toBe('world_1')
    // 时间倒序：huiyu-2 → manual → huiyu-1
    expect(data.groups.map((group) => group.runKey)).toEqual(['huiyu-2', 'manual', 'huiyu-1'])
    const [g2, gManual, g1] = data.groups
    expect(g2.counts).toEqual({ add: 0, update: 0, delete: 1 })
    expect(g2.runLabel).toBe('拆乙')
    expect(g2.items[0].snapshot).toMatchObject({ id: 'b', name: '乙' })
    expect(gManual.counts).toEqual({ add: 1, update: 0, delete: 0 })
    expect(g1.counts).toEqual({ add: 2, update: 1, delete: 0 })
    expect(g1.runLabel).toBe('画地形')
    expect(g1.items).toHaveLength(3)
    // groupId=组内最新一行 id（稳定标识）
    expect(g1.groupId).toBe(g1.items[0].id)
  })

  it('最多返回最近 50 组（更早的组整组丢弃）', () => {
    const { service } = createMapService()
    const sheet = service.saveWorldMapSheet('world_1', { name: '主世界' }).data
    for (let i = 1; i <= 55; i++) {
      service.saveWorldMapFeatures('world_1', {
        runMeta: { runKey: `run-${i}`, runLabel: `批次${i}` },
        items: [{ id: `f_${i}`, sheetId: sheet.id, kind: 'marker', name: `要素${i}`, geometry: { pts: [[i, i]] } }]
      })
    }
    const data = service.getWorldMapChangeLog('world_1').data
    expect(data.groups).toHaveLength(50)
    // 最近的在前：run-55 … run-6
    expect(data.groups[0].runKey).toBe('run-55')
    expect(data.groups[49].runKey).toBe('run-6')
  })
})
