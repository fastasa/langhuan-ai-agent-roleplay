import { describe, expect, it, vi } from 'vitest'
import { createAgentRuntimeJournalEvent } from '../../../src/app/agentRuntime/runtimeJournal.ts'
import {
  createPersistedAgentRuntimeJournalAdapter,
  listPersistedAgentRuntimeJournalRuns,
  preparePersistedAgentRuntimeJournal
} from '../../../src/repositories/agentRuntimeJournalRepository.ts'

function response(ok, data, status = ok ? 200 : 500) {
  return { ok, status, json: vi.fn(async () => data) }
}

describe('persisted agent runtime journal adapter', () => {
  it('可直接 append 单个 envelope，并按编码后的 runId 读取', async () => {
    const event = createAgentRuntimeJournalEvent({
      runId: 'run/a b', seq: 1, kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z', payload: { metadata: { agent: 'xingyi' } }
    })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(true, { event, idempotent: false }, 201))
      .mockResolvedValueOnce(response(true, { events: [event] }))
    const adapter = createPersistedAgentRuntimeJournalAdapter({ fetchImpl })

    await adapter.append(event)
    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/data/agent-runtime-journal/runs/run%2Fa%20b/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    })
    await expect(adapter.read('run/a b')).resolves.toEqual([event])
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/data/agent-runtime-journal/runs/run%2Fa%20b/events')
  })

  it('把 409 与非法读取结果变成 adapter 错误，不静默恢复坏事件', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(false, { error: '同一 seq checksum 冲突' }, 409))
      .mockResolvedValueOnce(response(true, { events: [{ runId: 'run_1', seq: 1, checksum: 'bad' }] }))
    const adapter = createPersistedAgentRuntimeJournalAdapter({ fetchImpl })
    const event = createAgentRuntimeJournalEvent({
      runId: 'run_1', seq: 1, kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z', payload: {}
    })
    await expect(adapter.append(event)).rejects.toThrow('checksum 冲突')
    await expect(adapter.read('run_1')).rejects.toThrow('包含无效事件')
  })

  it('断线或 5xx 时原样重发同一 envelope，由服务端 checksum 幂等收口', async () => {
    const event = createAgentRuntimeJournalEvent({
      runId: 'retry_run', seq: 1, kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z', payload: {}
    })
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection reset after commit'))
      .mockResolvedValueOnce(response(true, { event, idempotent: true }))
    const adapter = createPersistedAgentRuntimeJournalAdapter({ fetchImpl, appendRetries: 1 })
    await adapter.append(event)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0]).toEqual(fetchImpl.mock.calls[1])

    const serverRetry = vi.fn()
      .mockResolvedValueOnce(response(false, { error: 'temporary' }, 503))
      .mockResolvedValueOnce(response(true, { event, idempotent: false }, 201))
    await createPersistedAgentRuntimeJournalAdapter({ fetchImpl: serverRetry, appendRetries: 1 }).append(event)
    expect(serverRetry).toHaveBeenCalledTimes(2)
  })

  it('fresh 绑定确认 runId 唯一，并可直接作为 runtime journal 配置', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(true, { events: [] }))
    const binding = await preparePersistedAgentRuntimeJournal({
      runId: 'fresh_run',
      metadata: { profileDigest: 'profile-v1' },
      fetchImpl
    })
    expect(binding).toMatchObject({
      runId: 'fresh_run', initialSeq: 0,
      metadata: { profileDigest: 'profile-v1' }, recovery: null
    })
    expect(typeof binding.adapter.append).toBe('function')

    const existing = createAgentRuntimeJournalEvent({
      runId: 'fresh_run', seq: 1, kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z', payload: {}
    })
    const collisionFetch = vi.fn().mockResolvedValue(response(true, { events: [existing] }))
    await expect(preparePersistedAgentRuntimeJournal({
      runId: 'fresh_run', fetchImpl: collisionFetch
    })).rejects.toThrow('runId 已存在')
  })

  it('resume 从最后 seq 继续，并拒绝不存在或已经完成的 run', async () => {
    const started = createAgentRuntimeJournalEvent({
      runId: 'resume_run', seq: 1, kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z', payload: { metadata: { profileDigest: 'profile-v1' } }
    })
    const assistant = createAgentRuntimeJournalEvent({
      runId: 'resume_run', seq: 2, kind: 'assistant.completed',
      timestamp: '2026-08-18T00:00:01.000Z', payload: {}, completionAnchor: true
    })
    const resumeFetch = vi.fn().mockResolvedValue(response(true, { events: [started, assistant] }))
    const binding = await preparePersistedAgentRuntimeJournal({
      runId: 'resume_run', mode: 'resume', fetchImpl: resumeFetch
    })
    expect(binding.initialSeq).toBe(2)
    expect(binding.recovery).toMatchObject({ runId: 'resume_run', lastSeq: 2, runCompleted: false, autoReplayAllowed: false })

    const missingFetch = vi.fn().mockResolvedValue(response(true, { events: [] }))
    await expect(preparePersistedAgentRuntimeJournal({
      runId: 'missing_run', mode: 'resume', fetchImpl: missingFetch
    })).rejects.toThrow('不存在')

    const completed = createAgentRuntimeJournalEvent({
      runId: 'resume_run', seq: 3, kind: 'run.completed',
      timestamp: '2026-08-18T00:00:02.000Z', payload: { terminalReason: 'completed' }, completionAnchor: true
    })
    const completedFetch = vi.fn().mockResolvedValue(response(true, { events: [started, assistant, completed] }))
    await expect(preparePersistedAgentRuntimeJournal({
      runId: 'resume_run', mode: 'resume', fetchImpl: completedFetch
    })).rejects.toThrow('已完成')
  })

  it('按 status/limit 发现最近运行摘要，客户端契约明确禁止自动 replay', async () => {
    const summary = {
      runId: 'run_incomplete',
      lastSeq: 7,
      lastTimestamp: '2026-08-18T00:00:07.000Z',
      profileId: 'tidiao.director-round',
      runtimeVersion: 'director-v1',
      runCompleted: false,
      pendingTools: [],
      outcomeUnknownTools: [],
      autoReplayAllowed: false
    }
    const fetchImpl = vi.fn().mockResolvedValue(response(true, { runs: [summary] }))

    await expect(listPersistedAgentRuntimeJournalRuns({ limit: 5, fetchImpl })).resolves.toEqual([summary])
    expect(fetchImpl).toHaveBeenCalledWith('/api/data/agent-runtime-journal/runs?status=incomplete&limit=5')
  })

  it('列表接口拒绝缺少 runs、非法摘要和服务端错误', async () => {
    await expect(listPersistedAgentRuntimeJournalRuns({
      fetchImpl: vi.fn().mockResolvedValue(response(true, {}))
    })).rejects.toThrow('缺少 runs 数组')
    await expect(listPersistedAgentRuntimeJournalRuns({
      fetchImpl: vi.fn().mockResolvedValue(response(true, {
        runs: [{ runId: 'bad', lastSeq: 1, autoReplayAllowed: true }]
      }))
    })).rejects.toThrow('包含无效摘要')
    await expect(listPersistedAgentRuntimeJournalRuns({
      status: 'all',
      fetchImpl: vi.fn().mockResolvedValue(response(false, { error: 'scope denied' }, 403))
    })).rejects.toThrow('scope denied')
  })
})
