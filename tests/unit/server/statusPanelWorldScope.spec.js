import initSqlJs from 'sql.js'
import { describe, expect, it, vi } from 'vitest'
import { createChatRepository } from '../../../server/repositories/chatRepository.ts'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

// 状态系统世界级归属（地图系统批3）：双表 world_id 双轨读写 + 归属解析单点 + 并入世界。

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

function createStatusPanelTables(db) {
  db.exec(`
    CREATE TABLE chat_status_panel_templates (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      fields_json TEXT DEFAULT '[]',
      presentation_json TEXT DEFAULT '',
      created_by TEXT DEFAULT 'user',
      world_id TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
    CREATE TABLE chat_status_panel_events (
      id TEXT NOT NULL,
      panel_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      world_id TEXT DEFAULT '',
      event_type TEXT NOT NULL,
      from_version INTEGER NOT NULL DEFAULT 0,
      to_version INTEGER NOT NULL DEFAULT 0,
      patch_json TEXT DEFAULT '{}',
      source TEXT DEFAULT 'user_manual',
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT ''
    );
    CREATE TABLE chat_status_panels (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      host_type TEXT DEFAULT 'none',
      host_id TEXT DEFAULT '',
      values_json TEXT DEFAULT '{}',
      fields_json TEXT DEFAULT '',
      presentation_json TEXT DEFAULT '',
      world_id TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
  `)
}

function templateRow(id, sessionId, worldId = '', overrides = {}) {
  return {
    id,
    sessionId,
    kind: 'character',
    name: `模板${id}`,
    description: '',
    fieldsJson: '[]',
    createdBy: 'user',
    worldId,
    status: 'active',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides
  }
}

function panelRow(id, sessionId, templateId, worldId = '', overrides = {}) {
  return {
    id,
    sessionId,
    templateId,
    name: `面板${id}`,
    hostType: 'none',
    hostId: '',
    valuesJson: '{}',
    fieldsJson: '',
    worldId,
    status: 'active',
    version: 1,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides
  }
}

describe('repository 双轨读写（真 sql.js）', () => {
  it('会话级读只见 world_id 为空的行；世界级读跨会话按 world_id 汇合', async () => {
    const { db } = await createSqlJsWrapper()
    createStatusPanelTables(db)
    const repository = createChatRepository(db)

    repository.upsertStatusPanelTemplate(templateRow('tpl_local', 'session_1'))
    repository.upsertStatusPanelTemplate(templateRow('tpl_world', 'session_1', 'world_1'))
    repository.upsertStatusPanel(panelRow('panel_local', 'session_1', 'tpl_local'))
    repository.upsertStatusPanel(panelRow('panel_w1', 'session_1', 'tpl_world', 'world_1'))
    repository.upsertStatusPanel(panelRow('panel_w2', 'session_2', 'tpl_world', 'world_1'))
    repository.upsertStatusPanel(panelRow('panel_sc1', 'session_1', 'tpl_world', 'world_1', { hostType: 'session_character', hostId: 'participant_1' }))
    repository.upsertStatusPanel(panelRow('panel_sc2', 'session_2', 'tpl_world', 'world_1', { hostType: 'session_character', hostId: 'participant_2' }))

    // 会话级：只看到自己会话且未并入世界的行
    expect(repository.listStatusPanelTemplates('session_1').map((item) => item.id)).toEqual(['tpl_local'])
    expect(repository.listStatusPanels('session_1').map((item) => item.id)).toEqual(['panel_local'])
    // 世界实体/独立面板按世界跨会话汇合；session_character 同世界也只能看本会话世界线。
    expect(repository.listStatusPanels('session_1', 'world_1').map((item) => item.id).sort()).toEqual(['panel_sc1', 'panel_w1', 'panel_w2'])
    expect(repository.findStatusPanelById('session_1', 'panel_w2', 'world_1')?.id).toBe('panel_w2')
    expect(repository.findStatusPanelById('session_1', 'panel_sc2', 'world_1')).toBeFalsy()
    expect(repository.findStatusPanelById('session_2', 'panel_sc2', 'world_1')?.id).toBe('panel_sc2')
    // 归属互不越界
    expect(repository.findStatusPanelById('session_1', 'panel_w1')).toBeFalsy()
    expect(repository.findStatusPanelById('session_1', 'panel_local', 'world_1')).toBeFalsy()
  })

  it('世界级删除可从任一挂同世界的会话发起；计数按归属隔离', async () => {
    const { db } = await createSqlJsWrapper()
    createStatusPanelTables(db)
    const repository = createChatRepository(db)

    repository.upsertStatusPanelTemplate(templateRow('tpl_world', 'session_1', 'world_1'))
    repository.upsertStatusPanel(panelRow('panel_w1', 'session_1', 'tpl_world', 'world_1'))

    expect(repository.countStatusPanelsByTemplateId('session_2', 'tpl_world', 'world_1')).toBe(1)
    expect(repository.countStatusPanelsByTemplateId('session_2', 'tpl_world')).toBe(0)
    // 从 session_2（同世界另一会话）删除世界级面板
    expect(repository.deleteStatusPanel('session_2', 'panel_w1', 'world_1')).toBe(1)
    expect(repository.listStatusPanels('session_1', 'world_1')).toHaveLength(0)
  })

  it('assignWorldToSessionStatusPanels 只并入本会话会话级行，已属世界的行不动', async () => {
    const { db } = await createSqlJsWrapper()
    createStatusPanelTables(db)
    const repository = createChatRepository(db)

    repository.upsertStatusPanelTemplate(templateRow('tpl_local', 'session_1'))
    repository.upsertStatusPanel(panelRow('panel_local', 'session_1', 'tpl_local'))
    repository.upsertStatusPanel(panelRow('panel_other', 'session_2', 'tpl_local'))
    repository.upsertStatusPanel(panelRow('panel_w', 'session_1', 'tpl_local', 'world_9'))

    const moved = repository.assignWorldToSessionStatusPanels('session_1', 'world_1')
    expect(moved).toEqual({ templates: 1, panels: 1 })
    expect(repository.listStatusPanels('session_1', 'world_1').map((item) => item.id)).toEqual(['panel_local'])
    // 别的会话的会话级行、已属其他世界的行都不动
    expect(repository.listStatusPanels('session_2').map((item) => item.id)).toEqual(['panel_other'])
    expect(repository.listStatusPanels('session_1', 'world_9').map((item) => item.id)).toEqual(['panel_w'])
  })

})

// ── service 归属解析单点（mock 仓储，语义与真 repository 双轨一致）──
function createWorldScopeService() {
  const sessions = new Map([
    ['session_a', { id: 'session_a', world_id: 'world_1' }],
    ['session_b', { id: 'session_b', world_id: 'world_1' }],
    ['session_plain', { id: 'session_plain', world_id: '' }]
  ])
  const templates = new Map()
  const panels = new Map()
  const events = []
  const matchScope = (row, sessionId, worldId) => (
    worldId ? row.worldId === worldId : (row.sessionId === sessionId && !row.worldId)
  )
  const chatRepository = {
    getSessionById: vi.fn((sessionId) => sessions.get(sessionId) || null),
    updateSessionById: vi.fn((sessionId, fields) => {
      const session = sessions.get(sessionId)
      if (session) Object.assign(session, fields)
      return true
    }),
    findWorldById: vi.fn((worldId) => (worldId === 'world_1' ? { id: 'world_1', name: '测试世界' } : null)),
    listStatusPanelTemplates: vi.fn((sessionId, worldId = '') => [...templates.values()].filter((row) => matchScope(row, sessionId, worldId))),
    findStatusPanelTemplateById: vi.fn((sessionId, templateId, worldId = '') => {
      const row = templates.get(templateId)
      return row && matchScope(row, sessionId, worldId) ? row : null
    }),
    upsertStatusPanelTemplate: vi.fn((row) => { templates.set(row.id, { ...row, worldId: row.worldId || '' }) }),
    deleteStatusPanelTemplate: vi.fn((sessionId, templateId, worldId = '') => {
      const row = templates.get(templateId)
      if (!row || !matchScope(row, sessionId, worldId)) return 0
      return templates.delete(templateId) ? 1 : 0
    }),
    countStatusPanelsByTemplateId: vi.fn((sessionId, templateId, worldId = '') => (
      [...panels.values()].filter((row) => row.templateId === templateId && matchScope(row, sessionId, worldId)).length
    )),
    listStatusPanels: vi.fn((sessionId, worldId = '') => [...panels.values()].filter((row) => matchScope(row, sessionId, worldId))),
    findStatusPanelById: vi.fn((sessionId, panelId, worldId = '') => {
      const row = panels.get(panelId)
      return row && matchScope(row, sessionId, worldId) ? row : null
    }),
    upsertStatusPanel: vi.fn((row) => { panels.set(row.id, { ...row, worldId: row.worldId || '' }) }),
    insertStatusPanel: vi.fn((row) => { panels.set(row.id, { ...row, worldId: row.worldId || '' }); return 1 }),
    updateStatusPanelAtVersion: vi.fn((row) => {
      const current = panels.get(row.id)
      if (!current || current.version !== row.expectedVersion) return 0
      panels.set(row.id, { ...current, ...row, version: current.version + 1, worldId: row.worldId || '' })
      return 1
    }),
    findStatusPanelEventByIdempotencyKey: vi.fn((key) => events.find((event) => event.idempotencyKey === key) || null),
    insertStatusPanelEvent: vi.fn((event) => { events.push(event) }),
    runStatusPanelTransaction: vi.fn((operation) => operation()),
    deleteStatusPanel: vi.fn((sessionId, panelId, worldId = '') => {
      const row = panels.get(panelId)
      if (!row || !matchScope(row, sessionId, worldId)) return 0
      return panels.delete(panelId) ? 1 : 0
    }),
    deleteStatusPanelAtVersion: vi.fn((sessionId, panelId, worldId = '', expectedVersion) => {
      const row = panels.get(panelId)
      if (!row || !matchScope(row, sessionId, worldId) || row.version !== expectedVersion) return 0
      return panels.delete(panelId) ? 1 : 0
    }),
    assignWorldToSessionStatusPanels: vi.fn((sessionId, worldId) => {
      let movedTemplates = 0
      let movedPanels = 0
      for (const row of templates.values()) {
        if (row.sessionId === sessionId && !row.worldId) { row.worldId = worldId; movedTemplates += 1 }
      }
      for (const row of panels.values()) {
        if (row.sessionId === sessionId && !row.worldId) { row.worldId = worldId; movedPanels += 1 }
      }
      return { templates: movedTemplates, panels: movedPanels }
    }),
    findWorldEntityById: vi.fn((worldId, entityId) => (
      worldId === 'world_1' && entityId === 'entity_1'
        ? { id: entityId, worldId, name: '铜叶子旅店' }
        : null
    ))
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
  return { service, templates, panels }
}

const SIMPLE_FIELDS = [{ key: 'mood', label: '情绪', valueType: 'text' }]

describe('service 归属解析单点', () => {
  it('挂世界会话建的模板/实例自动落世界级，另一挂同世界会话可见可写', () => {
    const { service } = createWorldScopeService()

    const template = service.saveStatusPanelTemplateBySessionId('session_a', {
      kind: 'character', name: '角色状态栏', fields: SIMPLE_FIELDS
    }).data
    expect(template.worldId).toBe('world_1')

    const panel = service.saveStatusPanelBySessionId('session_a', {
      templateId: template.id, name: '柳如烟', hostType: 'none', expectedVersion: 0, idempotencyKey: 'world-create-1'
    }).data
    expect(panel.worldId).toBe('world_1')

    // session_b（同世界）可见同一套
    const seenFromB = service.listStatusPanelsBySessionId('session_b')
    expect(seenFromB.data.items.map((item) => item.id)).toEqual([panel.id])
    expect(seenFromB.data.worldId).toBe('world_1')

    // session_b 直接改世界级实例的值
    const updated = service.saveStatusPanelBySessionId('session_b', {
      id: panel.id, templateId: template.id, name: '柳如烟', hostType: 'none', values: { mood: '欣喜' }, expectedVersion: 1, idempotencyKey: 'world-update-1'
    })
    expect(updated.ok).toBe(true)

    // 未挂世界的会话看不到世界级内容
    expect(service.listStatusPanelsBySessionId('session_plain').data.items).toHaveLength(0)
  })

  it('未挂世界会话保持会话级现状；世界级引用只能指向同世界面板', () => {
    const { service } = createWorldScopeService()

    const plainTemplate = service.saveStatusPanelTemplateBySessionId('session_plain', {
      kind: 'character', name: '会话级模板', fields: SIMPLE_FIELDS
    }).data
    expect(plainTemplate.worldId).toBe('')
    const plainPanel = service.saveStatusPanelBySessionId('session_plain', {
      templateId: plainTemplate.id, name: '本地面板', hostType: 'none', expectedVersion: 0, idempotencyKey: 'plain-create-1'
    }).data

    // 世界级会话建 ref 字段模板，引用会话级面板 id 必须被拒（归属域隔离）
    const refTemplate = service.saveStatusPanelTemplateBySessionId('session_a', {
      kind: 'organization', name: '组织', fields: [{ key: 'members', label: '成员', valueType: 'ref' }]
    }).data
    const rejected = service.saveStatusPanelBySessionId('session_a', {
      templateId: refTemplate.id, name: '组织甲', hostType: 'none', values: { members: [plainPanel.id] }, expectedVersion: 0, idempotencyKey: 'ref-reject-1'
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.status).toBe(400)
  })

  it('首次挂世界自动升格：会话级内容并入世界、立即可见、无遗留', () => {
    const { service } = createWorldScopeService()

    // 未挂世界时建的会话级内容
    const template = service.saveStatusPanelTemplateBySessionId('session_plain', {
      kind: 'character', name: '旧模板', fields: SIMPLE_FIELDS
    }).data
    service.saveStatusPanelBySessionId('session_plain', {
      templateId: template.id, name: '旧面板', hostType: 'none', expectedVersion: 0, idempotencyKey: 'legacy-create-1'
    })

    // 挂上世界：自动把本会话创建来源的模板+实例迁进世界级（不再留 pending 等手动并入）
    const attached = service.attachWorldToSessionBySessionId('session_plain', { worldId: 'world_1' })
    expect(attached.ok).toBe(true)
    const listed = service.listStatusPanelsBySessionId('session_plain')
    expect(listed.data.worldId).toBe('world_1')
    expect(listed.data.items.map((item) => item.name)).toEqual(['旧面板'])
    expect(listed.data.pendingSessionScopeCount).toBe(0)
    // 同世界的 session_a 也看到了自动并入的面板
    expect(service.listStatusPanelsBySessionId('session_a').data.items.map((item) => item.name)).toContain('旧面板')
  })

  it('世界资产不跟会话漂移：解绑后留在原世界，同世界其他会话仍可见', () => {
    const { service } = createWorldScopeService()

    // session_a 挂在 world_1，建一套世界级内容
    const template = service.saveStatusPanelTemplateBySessionId('session_a', {
      kind: 'character', name: '世界模板', fields: SIMPLE_FIELDS
    }).data
    const panel = service.saveStatusPanelBySessionId('session_a', {
      templateId: template.id, name: '世界面板', hostType: 'none', expectedVersion: 0, idempotencyKey: 'world-asset-create-1'
    }).data
    expect(panel.worldId).toBe('world_1')
    // session_b（同世界）此刻能看到
    expect(service.listStatusPanelsBySessionId('session_b').data.items.map((item) => item.name)).toContain('世界面板')

    // 解世界：世界级内容仍属于 world_1，不迁回会话级
    const detached = service.attachWorldToSessionBySessionId('session_a', { detach: true })
    expect(detached.ok).toBe(true)
    const listed = service.listStatusPanelsBySessionId('session_a')
    expect(listed.data.worldId).toBe('')
    expect(listed.data.items).toHaveLength(0)
    expect(service.listStatusPanelsBySessionId('session_b').data.items.map((item) => item.name)).toContain('世界面板')
  })

  it('状态栏可绑定同世界实体，跨世界或不存在的实体会被拒绝', () => {
    const { service } = createWorldScopeService()
    const template = service.saveStatusPanelTemplateBySessionId('session_a', {
      kind: 'building', name: '建筑状态', fields: SIMPLE_FIELDS
    }).data

    const saved = service.saveStatusPanelBySessionId('session_a', {
      templateId: template.id,
      name: '旅店状态',
      hostType: 'world_entity',
      hostId: 'entity_1',
      expectedVersion: 0,
      idempotencyKey: 'world-entity-create-1'
    })
    expect(saved.ok).toBe(true)
    expect(saved.data).toMatchObject({ worldId: 'world_1', hostType: 'world_entity', hostId: 'entity_1' })

    const rejected = service.saveStatusPanelBySessionId('session_a', {
      templateId: template.id,
      name: '错误绑定',
      hostType: 'world_entity',
      hostId: 'entity_missing',
      expectedVersion: 0,
      idempotencyKey: 'world-entity-reject-1'
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.status).toBe(404)
  })
})
