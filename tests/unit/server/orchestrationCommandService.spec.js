import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/db.js', () => ({
  default: {
    prepare() { throw new Error('测试必须显式注入内存数据库') },
    exec() { throw new Error('测试必须显式注入内存数据库') },
    _save() {}
  }
}))

import { createOrchestrationCommandRepository } from '../../../server/repositories/orchestrationCommandRepository.js'
import { runInSavepoint } from '../../../server/repositories/sqliteSavepoint.js'
import { createOrchestrationCommandService } from '../../../server/application/orchestration/orchestrationCommandService.js'

function envelope(command, targetRef, overrides = {}) {
  return {
    command,
    sessionId: 'session_1',
    worldId: 'world_1',
    targetRef,
    expectedVersion: 0,
    idempotencyKey: `key:${command}:${JSON.stringify(targetRef)}`,
    source: { sourceMessageId: '10', sourceDirectorRunId: 'run_1', evidenceSummary: '真实消息证据' },
    payload: {},
    ...overrides
  }
}

function projection(db) {
  return {
    read() {
      const count = db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total
      return {
        ok: true,
        data: {
          workspace: { scope: { worldId: 'world_1', viewRevision: `revision_${count}` } },
          director: { scope: { worldId: 'world_1', viewRevision: `revision_${count}` } }
        }
      }
    }
  }
}

function createHarness(options = {}) {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, curtain_version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE domain_facts (id TEXT PRIMARY KEY, kind TEXT NOT NULL);
    CREATE TABLE domain_events (id TEXT PRIMARY KEY, kind TEXT NOT NULL);
    CREATE TABLE chat_orchestration_command_operations (
      idempotency_key TEXT NOT NULL,
      session_id TEXT NOT NULL,
      world_id TEXT DEFAULT '',
      command_name TEXT NOT NULL,
      target_ref_json TEXT NOT NULL DEFAULT '{}',
      request_hash TEXT NOT NULL,
      result_version INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, idempotency_key)
    );
  `)
  db.prepare('INSERT INTO chat_sessions (id) VALUES (?)').run('session_1')
  const repository = createOrchestrationCommandRepository(db)
  let sequence = 0
  const presence = {
    set(_sessionId, input) {
      return runInSavepoint(db, 'presence_test', () => {
        db.prepare('INSERT INTO domain_facts (id, kind) VALUES (?, ?)').run(input.participantId, 'presence')
        return { ok: true, data: { presence: { version: 1 } } }
      })
    },
    propose(_sessionId, input) {
      sequence += 1
      const id = `proposal_${sequence}`
      db.prepare('INSERT INTO domain_events (id, kind) VALUES (?, ?)').run(id, 'proposed')
      return { ok: true, data: { presence: null, event: { id, eventType: 'proposed' } } }
    },
    commit(_sessionId, input) {
      db.prepare('INSERT INTO domain_facts (id, kind) VALUES (?, ?)').run(input.participantId, 'committed')
      return { ok: true, data: { presence: { version: 1 }, event: { id: `commit_${input.participantId}` } } }
    },
    cancel: vi.fn(() => ({ ok: true, data: { presence: null, event: { id: 'cancel_1' } } }))
  }
  const materials = {
    saveOverride: vi.fn(() => ({ ok: true, data: { narrativeOverride: { version: 1 } } })),
    saveTask: vi.fn(() => ({ ok: true, data: { task: { version: 1 } } })),
    saveDirective(_sessionId, input) {
      if (options.failDirective) return { ok: false, status: 409, error: '私密指令版本已变化', details: { code: 'ORCHESTRATION_VERSION_CONFLICT' } }
      db.prepare('INSERT INTO domain_facts (id, kind) VALUES (?, ?)').run(input.id, 'directive')
      return { ok: true, data: { directive: { version: 1 } } }
    }
  }
  const seeds = {
    saveConfig: vi.fn(() => ({ ok: true, data: { version: 4 } })),
    createSeed: vi.fn(() => ({ ok: true, data: { version: 1 } })),
    updateSeed: vi.fn(() => ({ ok: true, data: { version: 2 } })),
    deleteSeed: vi.fn(() => ({ ok: true, data: { deleted: true } })),
    recordImpact: vi.fn(() => ({ ok: true, data: { version: 2 } }))
  }
  const workspace = {
    saveStatusPanelTemplateBySessionId: vi.fn((_sessionId, input) => {
      if (options.failStatusTemplate) return { ok: false, status: 409, error: '模板版本冲突', details: { code: 'ORCHESTRATION_VERSION_CONFLICT' } }
      db.prepare('INSERT INTO domain_facts (id, kind) VALUES (?, ?)').run(input.id, 'status_template')
      return { ok: true, data: { version: input.expectedVersion + 1 } }
    }),
    saveStatusPanelBySessionId: vi.fn((_sessionId, input) => {
      if (options.failStatusPanel && input.id === options.failStatusPanel) return { ok: false, status: 409, error: '状态栏写入失败', details: { code: 'ORCHESTRATION_VERSION_CONFLICT' } }
      db.prepare('INSERT INTO domain_facts (id, kind) VALUES (?, ?)').run(input.id, 'status_panel')
      return { ok: true, data: { version: input.expectedVersion + 1 } }
    }),
    updateChatSessionById: vi.fn(() => ({ ok: true, data: { ok: true } }))
  }
  return {
    db,
    materials,
    seeds,
    workspace,
    service: createOrchestrationCommandService({ repository, presence, materials, seeds, workspace, projection: projection(db) })
  }
}

function execute(service, operations) {
  return service.execute({ userId: 'user_1', workspaceId: 'default', sessionId: 'session_1', request: { operations } })
}

describe('统一编排命令服务', () => {
  it('跨领域成功时一次提交，返回分区版本、proposal 引用与提交后 viewRevision', () => {
    const { db, service } = createHarness()
    const result = execute(service, [
      envelope('proposePresenceTransition', { kind: 'session_character', participantId: 'p1' }, { payload: { toState: 'present' } })
    ])
    expect(result).toMatchObject({
      ok: true,
      data: {
        viewRevision: 'revision_0',
        operations: [
          { command: 'proposePresenceTransition', version: 0, resultRef: 'proposal_1' }
        ]
      }
    })
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_events').get().total).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_orchestration_command_operations').get().total).toBe(1)
  })

  it('已退役的持久私密指令命令会在写入前拒绝', () => {
    const { db, service } = createHarness({ failDirective: true })
    const result = execute(service, [
      envelope('setCharacterPresence', { kind: 'session_character', participantId: 'p1' }, { payload: { presenceState: 'present' } }),
      envelope('createDirective', { kind: 'directive', directiveId: 'd1' }, { payload: { content: '失败', scope: 'session', status: 'active' } })
    ])
    expect(result).toMatchObject({ ok: false, status: 400, details: { code: 'ORCHESTRATION_INVALID_COMMAND' } })
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_orchestration_command_operations').get().total).toBe(0)
  })

  it('相同业务 payload 重放直接读账本，不重复写；同键改 payload 明确冲突', () => {
    const { db, service } = createHarness()
    const original = envelope('setCharacterPresence', { kind: 'session_character', participantId: 'p1' }, {
      idempotencyKey: 'fact:10:p1', payload: { presenceState: 'present' }
    })
    expect(execute(service, [original]).ok).toBe(true)
    const replay = { ...original, expectedVersion: 99, source: { sourceDirectorRunId: 'run_2', evidenceSummary: '重新生成证据' } }
    expect(execute(service, [replay])).toMatchObject({ ok: true, data: { operations: [{ version: 1 }] } })
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total).toBe(1)

    const collision = { ...replay, payload: { presenceState: 'offstage' } }
    expect(execute(service, [collision])).toMatchObject({
      ok: false, status: 409, details: { code: 'ORCHESTRATION_IDEMPOTENCY_CONFLICT' }
    })
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total).toBe(1)
  })

  it('targetRef、世界范围与版本错误不会被统一入口吞掉', () => {
    const { service } = createHarness()
    expect(execute(service, [envelope('setCharacterPresence', { kind: 'directive', directiveId: 'd1' })])).toMatchObject({
      ok: false, status: 400, details: { code: 'ORCHESTRATION_INVALID_TARGET_REF' }
    })
    expect(execute(service, [envelope('setCharacterPresence', { kind: 'session_character', participantId: 'p1' }, { worldId: 'world_2' })])).toMatchObject({
      ok: false, status: 409, details: { code: 'ORCHESTRATION_SCOPE_MISMATCH' }
    })
    expect(execute(service, [envelope('setCharacterPresence', { kind: 'session_character', participantId: 'p1' }, { expectedVersion: -1 })])).toMatchObject({ ok: false, status: 400 })
  })

  it('帷幕有独立乐观版本，陈旧写入整批回滚', () => {
    const { db, service, workspace } = createHarness()
    const first = envelope('updateCurtainScene', { kind: 'curtain', sessionId: 'session_1' }, {
      idempotencyKey: 'curtain:1', payload: { virtualSceneName: '新场景' }
    })
    expect(execute(service, [first])).toMatchObject({ ok: true, data: { operations: [{ version: 1 }] } })
    expect(db.prepare('SELECT curtain_version FROM chat_sessions WHERE id = ?').get('session_1').curtain_version).toBe(1)

    const stale = { ...first, idempotencyKey: 'curtain:2', payload: { virtualSceneName: '陈旧覆盖' } }
    expect(execute(service, [stale])).toMatchObject({
      ok: false, status: 409, details: { code: 'ORCHESTRATION_VERSION_CONFLICT' }
    })
    expect(db.prepare('SELECT curtain_version FROM chat_sessions WHERE id = ?').get('session_1').curtain_version).toBe(1)
    expect(workspace.updateChatSessionById).toHaveBeenCalledTimes(2)
  })

  it('种子事实 payload 走 fact_committed 适配器，不降级为普通 patch', () => {
    const { service, seeds } = createHarness()
    const result = execute(service, [envelope('updateNarrativeSeed', { kind: 'narrative_seed', seedId: 'seed_1' }, {
      expectedVersion: 1,
      payload: { eventType: 'fact_committed', comparisonOutcome: 'partial', effectSummary: '只发生一部分' }
    })])
    expect(result).toMatchObject({ ok: true, data: { operations: [{ version: 2 }] } })
    expect(seeds.recordImpact).toHaveBeenCalledTimes(1)
    expect(seeds.updateSeed).not.toHaveBeenCalled()
  })

  it('世界剧本基调也通过统一命令与版本锁写回原领域', () => {
    const { service, seeds } = createHarness()
    const result = execute(service, [envelope('saveWorldNarrativeConfig', { kind: 'narrative_config', worldId: 'world_1' }, {
      expectedVersion: 3, payload: { theme: '成长', longTermTendency: '兑现旧约' }
    })])
    expect(result).toMatchObject({ ok: true, data: { operations: [{ version: 4 }] } })
    expect(seeds.saveConfig).toHaveBeenCalledWith('world_1', expect.objectContaining({ expectedVersion: 3, theme: '成长' }))
  })

  it('一次事务可以创建一个自由分类模板和多张带用途摘要的状态栏', () => {
    const { db, service, workspace } = createHarness()
    const result = execute(service, [
      envelope('saveStatusPanelTemplate', { kind: 'status_panel_template', templateId: 'tpl_tools' }, {
        idempotencyKey: 'status:template:tools',
        payload: { kind: '建筑用具', name: '工地器具模板', description: '定义工地器具的结构', fields: [{ key: 'condition', label: '状况', valueType: 'text' }] }
      }),
      envelope('saveStatusPanel', { kind: 'status_panel', panelId: 'panel_hammer' }, {
        idempotencyKey: 'status:panel:hammer',
        payload: { templateId: 'tpl_tools', name: '羊角锤', description: '记录羊角锤的所在位置与损耗', hostType: 'none', values: { condition: '完好' } }
      }),
      envelope('saveStatusPanel', { kind: 'status_panel', panelId: 'panel_drill' }, {
        idempotencyKey: 'status:panel:drill',
        payload: { templateId: 'tpl_tools', name: '冲击钻', description: '记录冲击钻的电量与使用状态', hostType: 'none', values: { condition: '待充电' } }
      })
    ])
    expect(result).toMatchObject({ ok: true, data: { operations: [
      { command: 'saveStatusPanelTemplate', version: 1 },
      { command: 'saveStatusPanel', version: 1 },
      { command: 'saveStatusPanel', version: 1 }
    ] } })
    expect(db.prepare('SELECT kind, COUNT(*) AS total FROM domain_facts GROUP BY kind ORDER BY kind').all()).toEqual([
      { kind: 'status_panel', total: 2 },
      { kind: 'status_template', total: 1 }
    ])
    expect(workspace.saveStatusPanelBySessionId).toHaveBeenCalledTimes(2)
  })

  it('批量状态栏中任意一张失败时模板和前序状态栏一起回滚', () => {
    const { db, service } = createHarness({ failStatusPanel: 'panel_bad' })
    const result = execute(service, [
      envelope('saveStatusPanelTemplate', { kind: 'status_panel_template', templateId: 'tpl_custom' }, {
        idempotencyKey: 'rollback:template', payload: { kind: '用户随手分组', name: '自由模板', fields: [{ key: 'note', label: '备注', valueType: 'text' }] }
      }),
      envelope('saveStatusPanel', { kind: 'status_panel', panelId: 'panel_ok' }, {
        idempotencyKey: 'rollback:panel:ok', payload: { templateId: 'tpl_custom', name: '第一张', description: '记录第一张', hostType: 'none', values: {} }
      }),
      envelope('saveStatusPanel', { kind: 'status_panel', panelId: 'panel_bad' }, {
        idempotencyKey: 'rollback:panel:bad', payload: { templateId: 'tpl_custom', name: '第二张', description: '记录第二张', hostType: 'none', values: {} }
      })
    ])
    expect(result).toMatchObject({ ok: false, status: 409, details: { code: 'ORCHESTRATION_VERSION_CONFLICT' } })
    expect(db.prepare('SELECT COUNT(*) AS total FROM domain_facts').get().total).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS total FROM chat_orchestration_command_operations').get().total).toBe(0)
  })
})
