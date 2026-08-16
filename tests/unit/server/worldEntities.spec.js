import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'
import db from '../../../server/db.js'
import { withDataScope } from '../../../server/localWorkspace.js'
import { createChatRepository } from '../../../server/repositories/chatRepository.ts'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'
import { readChatSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/readChats.js'
import { applyChatSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/restoreChats.js'

function createWorldEntitiesTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS world_entities (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases_json TEXT DEFAULT '[]',
      markdown TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      source_ledger_json TEXT DEFAULT '[]',
      map_sheet_id TEXT DEFAULT '',
      map_feature_id TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, id)
    );
  `)
}

function createWorldEntityService() {
  const worlds = new Map([
    ['world_a', { id: 'world_a', name: '甲世界', status: 'active' }],
    ['world_b', { id: 'world_b', name: '乙世界', status: 'active' }]
  ])
  const entities = new Map()
  const sheets = new Map([
    ['sheet_a', { id: 'sheet_a', worldId: 'world_a' }],
    ['sheet_b', { id: 'sheet_b', worldId: 'world_b' }]
  ])
  const features = new Map([
    ['feature_a', { id: 'feature_a', worldId: 'world_a', sheetId: 'sheet_a' }]
  ])
  const repository = {
    findWorldById: vi.fn((id) => worlds.get(id) || null),
    listWorldEntities: vi.fn((worldId) => [...entities.values()].filter((item) => item.worldId === worldId && item.status !== 'deleted')),
    findWorldEntityById: vi.fn((worldId, id) => {
      const item = entities.get(id)
      return item?.worldId === worldId && item.status !== 'deleted' ? item : null
    }),
    upsertWorldEntity: vi.fn((row) => entities.set(row.id, { ...row })),
    softDeleteWorldEntity: vi.fn((worldId, id, updatedAt) => {
      const item = entities.get(id)
      if (!item || item.worldId !== worldId || item.status === 'deleted') return 0
      item.status = 'deleted'
      item.updatedAt = updatedAt
      item.version += 1
      return 1
    }),
    countWorldEntitiesByWorldId: vi.fn((worldId) => [...entities.values()].filter((item) => item.worldId === worldId && item.status !== 'deleted').length),
    findMapSheetById: vi.fn((id) => sheets.get(id) || null),
    findMapFeatureById: vi.fn((id, worldId) => {
      const item = features.get(id)
      return item?.worldId === worldId ? item : null
    })
  }
  const persist = vi.fn()
  const service = createWorkspaceChatAppService({
    chatRepository: repository,
    logger: { error: vi.fn() },
    normalizeChatTargetId: (value) => value,
    repairLegacyChatTarget: (value) => value,
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: (value) => value,
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: (value) => value,
    cloneSessionMessages: vi.fn(),
    persist
  })
  return { service, entities, persist }
}

describe('世界实体 P4-1 服务边界', () => {
  it('按世界隔离读写，并校验地图引用只能来自同一世界', () => {
    const { service, persist } = createWorldEntityService()
    expect(service.saveWorldEntityByWorldId('world_a', { kind: 'character', name: '错误角色' }).status).toBe(400)
    expect(service.saveWorldEntityByWorldId('world_a', { kind: 'location', name: '越界地点', mapSheetId: 'sheet_b' }).status).toBe(400)

    const created = service.saveWorldEntityByWorldId('world_a', {
      kind: 'location',
      name: '白塔港',
      mapFeatureId: 'feature_a',
      tags: ['港口']
    })
    expect(created.ok).toBe(true)
    expect(created.data).toMatchObject({ worldId: 'world_a', mapSheetId: 'sheet_a', mapFeatureId: 'feature_a', version: 1 })
    expect(service.listWorldEntitiesByWorldId('world_a').data.items).toHaveLength(1)
    expect(service.listWorldEntitiesByWorldId('world_b').data.items).toHaveLength(0)
    expect(persist).toHaveBeenCalledTimes(1)

    expect(service.saveWorldEntityByWorldId('world_a', { id: created.data.id, markdown: '旧版本覆盖', expectedVersion: 9 }).status).toBe(409)
    const updated = service.saveWorldEntityByWorldId('world_a', { id: created.data.id, markdown: '港湾城市', expectedVersion: 1 })
    expect(updated.data).toMatchObject({ kind: 'location', name: '白塔港', markdown: '港湾城市', version: 2 })
    const worldDeleteBlocked = service.deleteWorldById('world_a')
    expect(worldDeleteBlocked).toMatchObject({ status: 409, reason: 'worldEntities', count: 1 })

    expect(service.deleteWorldEntityByWorldId('world_b', created.data.id).status).toBe(404)
    expect(service.deleteWorldEntityByWorldId('world_a', created.data.id).ok).toBe(true)
    expect(service.listWorldEntitiesByWorldId('world_a').data.items).toHaveLength(0)
  })
})

describe('世界实体 P4-1 数据地基', () => {
  it('迁移可重复执行并保持跨世界仓储隔离', async () => {
    const SQL = await initSqlJs()
    const raw = new SQL.Database()
    const wrapper = {
      exec: (sql) => raw.exec(sql),
      prepare: (sql) => ({
        all: (...params) => {
          const stmt = raw.prepare(sql)
          if (params.length) stmt.bind(params)
          const rows = []
          while (stmt.step()) rows.push(stmt.getAsObject())
          stmt.free()
          return rows
        },
        get: (...params) => {
          const stmt = raw.prepare(sql)
          if (params.length) stmt.bind(params)
          const row = stmt.step() ? stmt.getAsObject() : undefined
          stmt.free()
          return row
        },
        run: (...params) => {
          const stmt = raw.prepare(sql)
          if (params.length) stmt.bind(params)
          stmt.step()
          stmt.free()
          return { changes: raw.getRowsModified() }
        }
      })
    }
    createWorldEntitiesTable(wrapper)
    createWorldEntitiesTable(wrapper)
    const repository = createChatRepository(wrapper)
    repository.upsertWorldEntity({
      id: 'entity_a', worldId: 'world_a', kind: 'item', name: '古剑', aliasesJson: '[]', markdown: '',
      tagsJson: '[]', sourceLedgerJson: '[]', mapSheetId: '', mapFeatureId: '', status: 'active', version: 1,
      createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z'
    })
    expect(repository.listWorldEntities('world_a').map((item) => item.id)).toEqual(['entity_a'])
    expect(repository.listWorldEntities('world_b')).toEqual([])
    expect(repository.findWorldEntityById('world_b', 'entity_a')).toBeFalsy()
  })

  it('完整工作区快照可往返恢复世界实体', () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const userId = `world_entity_snapshot_${suffix}`
    withDataScope({ userId, role: 'user', workspaceId: 'default' }, () => {
      const repository = createChatRepository(db)
      const worldId = `world_${suffix}`
      db.prepare('INSERT INTO worlds (id, name, description, status) VALUES (?, ?, ?, ?)')
        .run(worldId, '实体快照世界', '', 'active')
      repository.upsertWorldEntity({
        id: `entity_${suffix}`, worldId, kind: 'organization', name: '巡夜司', aliasesJson: '["夜司"]', markdown: '负责夜巡',
        tagsJson: '["组织"]', sourceLedgerJson: '[]', mapSheetId: '', mapFeatureId: '', status: 'active', version: 2,
        createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T01:00:00.000Z'
      })
      const snapshot = readChatSnapshotPartition(repository, { includeAllChats: true })
      expect(snapshot.worldEntities).toHaveLength(1)
      repository.replaceWorldEntities([])
      expect(repository.listWorldEntities(worldId)).toEqual([])
      applyChatSnapshotPartition(repository, snapshot)
      expect(repository.listWorldEntities(worldId)[0]).toMatchObject({ name: '巡夜司', version: 2 })
    })
  })
})
