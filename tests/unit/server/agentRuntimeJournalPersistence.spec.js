import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { createAgentRuntimeJournalEvent } from '../../../src/app/agentRuntime/runtimeJournal.ts'
import { createAgentRuntimeJournalRepository } from '../../../server/repositories/agentRuntimeJournalRepository.ts'
import {
  AGENT_RUNTIME_JOURNAL_LIMITS,
  createAgentRuntimeJournalAppService
} from '../../../server/application/agentRuntimeJournal/agentRuntimeJournalAppService.ts'

const scope = { userId: 'user_1', workspaceId: 'workspace_1' }

async function createService() {
  const SQL = await initSqlJs()
  const raw = new SQL.Database()
  raw.exec(`
    CREATE TABLE agent_runtime_journal_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      schema_version INTEGER NOT NULL,
      kind TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      completion_anchor TEXT NOT NULL DEFAULT '',
      checksum TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      user_id TEXT DEFAULT '',
      workspace_id TEXT DEFAULT 'local',
      UNIQUE(user_id, workspace_id, run_id, seq)
    );
  `)
  const database = {
    prepare(sql) {
      return {
        all(...params) {
          const statement = raw.prepare(sql)
          if (params.length) statement.bind(params)
          const rows = []
          while (statement.step()) rows.push(statement.getAsObject())
          statement.free()
          return rows
        },
        get(...params) {
          const statement = raw.prepare(sql)
          if (params.length) statement.bind(params)
          const row = statement.step() ? statement.getAsObject() : null
          statement.free()
          return row
        },
        run(...params) {
          const statement = raw.prepare(sql)
          if (params.length) statement.bind(params)
          statement.step()
          statement.free()
          return { changes: raw.getRowsModified() }
        }
      }
    }
  }
  const repository = createAgentRuntimeJournalRepository(database)
  return { raw, repository, service: createAgentRuntimeJournalAppService(repository) }
}

function event(seq, input = {}) {
  return createAgentRuntimeJournalEvent({
    runId: input.runId || 'run_1',
    seq,
    kind: input.kind || 'assistant.completed',
    timestamp: input.timestamp || `2026-08-18T00:00:0${seq}.000Z`,
    payload: input.payload || { text: `event-${seq}` },
    completionAnchor: input.completionAnchor ?? true
  })
}

describe('agent runtime journal persistence', () => {
  it('只追加单事件，并按 seq 升序读取原始 envelope', async () => {
    const { repository, service } = await createService()
    const second = event(2)
    const first = event(1, { kind: 'run.started', completionAnchor: false })
    expect(service.append(scope, second.runId, second)).toMatchObject({ ok: true, status: 201 })
    expect(service.append(scope, first.runId, first)).toMatchObject({ ok: true, status: 201 })

    const result = service.read(scope, 'run_1')
    expect(result).toMatchObject({ ok: true, data: { events: [{ seq: 1 }, { seq: 2 }] } })
    expect(result.data.events).toEqual([first, second])
    expect(repository).not.toHaveProperty('update')
    expect(repository).not.toHaveProperty('delete')
  })

  it('同 checksum 重复写幂等，不同 checksum 返回 409 且不覆盖原事件', async () => {
    const { service } = await createService()
    const original = event(1, { payload: { value: 'original' } })
    const conflict = event(1, { payload: { value: 'conflict' } })
    expect(service.append(scope, 'run_1', original)).toMatchObject({ ok: true, status: 201, data: { idempotent: false } })
    expect(service.append(scope, 'run_1', original)).toMatchObject({ ok: true, status: 200, data: { idempotent: true } })
    expect(service.append(scope, 'run_1', conflict)).toMatchObject({ ok: false, status: 409 })
    expect(service.read(scope, 'run_1').data.events).toEqual([original])
  })

  it('按 user/workspace 隔离相同 runId 与 seq', async () => {
    const { service } = await createService()
    const first = event(1, { payload: { owner: 'one' } })
    const second = event(1, { payload: { owner: 'two' } })
    const otherScope = { userId: 'user_2', workspaceId: 'workspace_2' }
    expect(service.append(scope, 'run_1', first).ok).toBe(true)
    expect(service.append(otherScope, 'run_1', second).ok).toBe(true)
    expect(service.read(scope, 'run_1').data.events).toEqual([first])
    expect(service.read(otherScope, 'run_1').data.events).toEqual([second])
  })

  it('严格拒绝未知字段、路径漂移、坏 checksum 与超限 payload', async () => {
    const { service } = await createService()
    const valid = event(1)
    expect(service.append(scope, 'other-run', valid)).toMatchObject({ ok: false, status: 400 })
    expect(service.append(scope, 'run_1', { ...valid, extra: true })).toMatchObject({ ok: false, status: 400 })
    expect(service.append(scope, 'run_1', { ...valid, checksum: 'fnv1a32:00000000' })).toMatchObject({ ok: false, status: 400 })

    const oversized = event(3, { payload: { text: 'x'.repeat(AGENT_RUNTIME_JOURNAL_LIMITS.payloadBytes + 1) } })
    expect(service.append(scope, 'run_1', oversized)).toMatchObject({ ok: false, status: 400 })
    expect(service.read(scope, 'run_1').data.events).toEqual([])
  })

  it('默认发现最近未完成 run，并用 recover 生成待确认工具摘要', async () => {
    const { service } = await createService()
    const incompleteStart = event(1, {
      runId: 'run_incomplete',
      kind: 'run.started',
      completionAnchor: false,
      timestamp: '2026-08-18T00:00:01.000Z',
      payload: { metadata: { profileId: 'tidiao.director-round', runtimeVersion: 'director-v1' } }
    })
    const pendingTool = event(2, {
      runId: 'run_incomplete',
      kind: 'tool.started',
      completionAnchor: false,
      timestamp: '2026-08-18T00:00:02.000Z',
      payload: { callId: 'call-1', toolName: 'writeState', mayHaveSideEffects: true }
    })
    const completedStart = event(1, {
      runId: 'run_completed',
      kind: 'run.started',
      completionAnchor: false,
      timestamp: '2026-08-18T00:00:03.000Z',
      payload: { metadata: { profileId: 'xingyi.global', runtimeVersion: 'xingyi-v1' } }
    })
    const completed = event(2, {
      runId: 'run_completed',
      kind: 'run.completed',
      timestamp: '2026-08-18T00:00:04.000Z',
      payload: { terminalReason: 'done' }
    })
    for (const item of [incompleteStart, pendingTool, completedStart, completed]) {
      expect(service.append(scope, item.runId, item).ok).toBe(true)
    }

    const defaultResult = service.list(scope)
    expect(defaultResult).toMatchObject({
      ok: true,
      status: 200,
      data: {
        runs: [{
          runId: 'run_incomplete',
          lastSeq: 2,
          lastTimestamp: '2026-08-18T00:00:02.000Z',
          profileId: 'tidiao.director-round',
          runtimeVersion: 'director-v1',
          runCompleted: false,
          pendingTools: [{ callId: 'call-1', toolName: 'writeState', status: 'pending' }],
          outcomeUnknownTools: [{ callId: 'call-1', outcomeUnknown: true }],
          autoReplayAllowed: false
        }]
      }
    })
    expect(service.list(scope, 'completed', 10).data.runs.map((run) => run.runId)).toEqual(['run_completed'])
    expect(service.list(scope, 'all', 10).data.runs.map((run) => run.runId)).toEqual([
      'run_completed',
      'run_incomplete'
    ])
    expect(service.list(scope, 'all', 1).data.runs.map((run) => run.runId)).toEqual(['run_completed'])
  })

  it('列表参数严格校验上限，并隔离 scope、排除 recover 校验失败的 run', async () => {
    const { repository, service } = await createService()
    const valid = event(1, {
      runId: 'valid_run',
      kind: 'run.started',
      completionAnchor: false,
      payload: { metadata: { profileId: 'test.profile', runtimeVersion: 'v1' } }
    })
    expect(service.append(scope, valid.runId, valid).ok).toBe(true)
    const corrupt = { ...event(1, { runId: 'corrupt_run', kind: 'run.started', completionAnchor: false }), checksum: 'fnv1a32:00000000' }
    repository.append(scope.userId, scope.workspaceId, corrupt)
    const otherScope = { userId: 'other', workspaceId: 'other' }
    expect(service.append(otherScope, 'other_run', event(1, {
      runId: 'other_run', kind: 'run.started', completionAnchor: false
    })).ok).toBe(true)

    expect(service.list(scope, 'all', 10).data.runs.map((run) => run.runId)).toEqual(['valid_run'])
    expect(service.list(scope, 'unknown', 10)).toMatchObject({ ok: false, status: 400 })
    expect(service.list(scope, 'all', 0)).toMatchObject({ ok: false, status: 400 })
    expect(service.list(scope, 'all', AGENT_RUNTIME_JOURNAL_LIMITS.maxListLimit + 1)).toMatchObject({ ok: false, status: 400 })
    expect(service.list(scope, 'all', '1.5')).toMatchObject({ ok: false, status: 400 })
    expect(service.list({ userId: '', workspaceId: '' }, 'all', 10)).toMatchObject({ ok: false, status: 400 })
  })
})
