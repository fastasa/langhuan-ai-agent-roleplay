import { describe, expect, it, vi } from 'vitest'
import { runAgentRuntime as runAgentRuntimeBase } from '../../../src/app/agentRuntime/runtime.ts'
import { ToolRegistry } from '../../../src/app/agentRuntime/toolRegistry.ts'
import {
  AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION,
  createAgentRuntimeJournalCallbackAdapter,
  createAgentRuntimeJournalEvent,
  createAgentRuntimeJournalRecorder,
  recoverAgentRuntimeJournal,
  recoverAgentRuntimeJournalFromAdapter,
  verifyAgentRuntimeJournalEvent
} from '../../../src/app/agentRuntime/runtimeJournal.ts'

const runAgentRuntime = (input) => runAgentRuntimeBase({ ...input, taskTodoMode: 'disabled' })
const fixedNow = () => '2026-08-18T10:00:00.000Z'

describe('agentRuntime · append-only journal envelope / recovery', () => {
  it('schemaVersion、checksum 与 completionAnchor 稳定，payload 对象键顺序不影响 checksum', () => {
    const first = createAgentRuntimeJournalEvent({
      runId: 'run-1',
      seq: 1,
      kind: 'tool.completed',
      timestamp: fixedNow(),
      payload: { toolName: 'read', callId: 'c1', details: { z: 1, a: 2 } },
      completionAnchor: true
    })
    const second = createAgentRuntimeJournalEvent({
      runId: 'run-1',
      seq: 1,
      kind: 'tool.completed',
      timestamp: fixedNow(),
      payload: { details: { a: 2, z: 1 }, callId: 'c1', toolName: 'read' },
      completionAnchor: true
    })

    expect(first.schemaVersion).toBe(AGENT_RUNTIME_JOURNAL_SCHEMA_VERSION)
    expect(first.checksum).toBe(second.checksum)
    expect(first.completionAnchor).toBe('run-1:1:tool.completed')
    expect(verifyAgentRuntimeJournalEvent(first)).toBe(true)
    expect(verifyAgentRuntimeJournalEvent({ ...first, payload: { ...first.payload, toolName: 'tampered' } })).toBe(false)
  })

  it('recorder 串行追加；单次 adapter 失败只记审计缺口，不阻断后续事件', async () => {
    const persisted = []
    const failures = []
    const adapter = createAgentRuntimeJournalCallbackAdapter({
      append: vi.fn(async (event) => {
        if (event.seq === 2) throw new Error('disk unavailable')
        persisted.push(event)
      })
    })
    const recorder = createAgentRuntimeJournalRecorder({
      runId: 'run-fail-soft', adapter, now: fixedNow, onAppendFailure: (failure) => failures.push(failure)
    })
    recorder.append('run.started')
    recorder.append('tool.started', { callId: 'c1', toolName: 'write' })
    recorder.append('run.completed', {}, { completionAnchor: true })
    await recorder.flush()

    expect(adapter.append).toHaveBeenCalledTimes(3)
    expect(persisted.map((event) => event.seq)).toEqual([1, 3])
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ seq: 2, kind: 'tool.started', message: 'disk unavailable' })
    expect(recorder.snapshot()).toMatchObject({ runId: 'run-fail-soft', lastSeq: 3 })
  })

  it('只读恢复列出 pending/outcomeUnknown，校验损坏事件，并永远禁止自动重放', async () => {
    const events = [
      createAgentRuntimeJournalEvent({ runId: 'recover-1', seq: 1, kind: 'run.started', timestamp: fixedNow() }),
      createAgentRuntimeJournalEvent({
        runId: 'recover-1', seq: 2, kind: 'tool.started', timestamp: fixedNow(),
        payload: { callId: 'pending-write', toolName: 'writeWorld', mayHaveSideEffects: true }
      }),
      createAgentRuntimeJournalEvent({
        runId: 'recover-1', seq: 3, kind: 'tool.started', timestamp: fixedNow(),
        payload: { callId: 'timeout-write', toolName: 'upload', mayHaveSideEffects: true }
      }),
      createAgentRuntimeJournalEvent({
        runId: 'recover-1', seq: 4, kind: 'tool.timed_out', timestamp: fixedNow(),
        payload: { callId: 'timeout-write', toolName: 'upload', outcomeUnknown: true }, completionAnchor: true
      })
    ]
    events.push({ ...events[3], seq: 5 }) // checksum 故意不重算

    const recovered = recoverAgentRuntimeJournal(events, 'recover-1')
    expect(recovered.pendingTools.map((tool) => tool.callId)).toEqual(['pending-write'])
    expect(recovered.outcomeUnknownTools.map((tool) => tool.callId)).toEqual(['pending-write', 'timeout-write'])
    expect(recovered.tools.every((tool) => tool.autoReplayAllowed === false)).toBe(true)
    expect(recovered.autoReplayAllowed).toBe(false)
    expect(recovered.rejectedEvents).toEqual([{ index: 4, reason: 'checksum-or-schema-invalid' }])

    const adapter = { append: vi.fn(), read: vi.fn(async () => events.slice(0, 4)) }
    const viaAdapter = await recoverAgentRuntimeJournalFromAdapter(adapter, 'recover-1')
    expect(viaAdapter.pendingTools).toHaveLength(1)
    expect(adapter.read).toHaveBeenCalledWith('recover-1')
  })
})

describe('runAgentRuntime · 可选 journal 接入', () => {
  it('记录完整工具 started/completed、assistant/run completion anchors，默认路径不需要 journal', async () => {
    const persisted = []
    let startedBeforeExecute = false
    const registry = new ToolRegistry([{
      name: 'echo', brief: '回显', execute: (call) => {
        startedBeforeExecute = persisted.some((event) => event.kind === 'tool.started')
        return { content: `echo:${call.args.text}`, details: { kept: true } }
      }
    }])
    const result = await runAgentRuntime({
      agentName: 'JournalAgent',
      messages: [{ role: 'user', content: 'start' }],
      toolRegistry: registry,
      initialActiveTools: ['echo'],
      budget: { maxTurns: 2, maxToolCalls: 2 },
      journal: {
        runId: 'runtime-1', adapter: { append: (event) => { persisted.push(event) } }, now: fixedNow,
        metadata: { profileId: 'test-profile', personaDigest: 'persona-v1', toolCatalogDigest: 'tools-v1' }
      },
      callModel: ({ turnIndex }) => turnIndex === 0
        ? { content: '我要调用工具', toolCalls: [{ callId: 'c1', toolName: 'echo', args: { text: 'ok' } }] }
        : { content: '完成', toolCalls: [], done: true }
    })

    expect(result.transcript.terminalReason).toBe('done')
    expect(startedBeforeExecute).toBe(true)
    expect(persisted.map((event) => event.kind)).toEqual([
      'run.started', 'assistant.completed', 'tool.started', 'tool.completed', 'assistant.completed', 'run.completed'
    ])
    const started = persisted.find((event) => event.kind === 'tool.started')
    const completed = persisted.find((event) => event.kind === 'tool.completed')
    expect(started.payload).toMatchObject({ callId: 'c1', toolName: 'echo', status: 'started', args: { text: 'ok' } })
    expect(completed.payload).toMatchObject({
      callId: 'c1', status: 'completed', runtimeStatus: 'success',
      content: 'echo:ok', details: { kept: true }
    })
    expect(completed.completionAnchor).toBeTruthy()
    expect(result.journalState).toMatchObject({ runId: 'runtime-1', lastSeq: 6, appendFailures: [] })
    expect(persisted.every(verifyAgentRuntimeJournalEvent)).toBe(true)
    expect(recoverAgentRuntimeJournal(persisted, 'runtime-1').runMetadata).toEqual({
      personaDigest: 'persona-v1', profileId: 'test-profile', toolCatalogDigest: 'tools-v1'
    })

    const withoutJournal = await runAgentRuntime({
      agentName: 'NoJournal', messages: [{ role: 'user', content: 'hi' }],
      toolRegistry: new ToolRegistry(), initialActiveTools: [], budget: { maxTurns: 1, maxToolCalls: 0 },
      callModel: () => ({ content: 'ok', toolCalls: [], done: true })
    })
    expect(withoutJournal).not.toHaveProperty('journalState')
  })

  it('adapter append 失败不吞主运行，并通过 onEvent 产生 journal-error 审计事件', async () => {
    const fidelity = []
    const result = await runAgentRuntime({
      agentName: 'FailSoftJournal', messages: [{ role: 'user', content: 'hi' }],
      toolRegistry: new ToolRegistry(), initialActiveTools: [], budget: { maxTurns: 1, maxToolCalls: 0 },
      journal: { runId: 'runtime-fail', adapter: { append: async () => { throw new Error('journal offline') } }, now: fixedNow },
      onEvent: (event) => fidelity.push(event),
      callModel: () => ({ content: 'still works', toolCalls: [], done: true })
    })

    expect(result.transcript.terminalReason).toBe('done')
    expect(result.messages.at(-1).content).toBe('still works')
    expect(result.journalState.appendFailures.length).toBeGreaterThan(0)
    expect(fidelity.some((event) => event.kind === 'journal-error' && event.message === 'journal offline')).toBe(true)
  })

  it('副作用工具超时写入 timed_out + outcomeUnknown，并可由只读恢复识别', async () => {
    vi.useFakeTimers()
    try {
      const persisted = []
      const registry = new ToolRegistry([{
        name: 'writePossibly', brief: '可能写入', timeoutMs: 25, mayHaveSideEffects: true,
        execute: () => new Promise(() => {})
      }])
      const runPromise = runAgentRuntime({
        agentName: 'TimeoutJournal', messages: [{ role: 'user', content: 'write' }],
        toolRegistry: registry, initialActiveTools: ['writePossibly'],
        budget: { maxTurns: 1, maxToolCalls: 1 },
        journal: { runId: 'timeout-journal', adapter: { append: (event) => { persisted.push(event) } }, now: fixedNow },
        callModel: () => ({ toolCalls: [{ callId: 'write-c1', toolName: 'writePossibly', args: {} }], done: true })
      })
      await vi.advanceTimersByTimeAsync(25)
      const result = await runPromise
      const timedOut = persisted.find((event) => event.kind === 'tool.timed_out')

      expect(result.transcript.turns[0].toolResults[0].error.type).toBe('TOOL_TIMEOUT')
      expect(timedOut.payload).toMatchObject({
        callId: 'write-c1', toolName: 'writePossibly', status: 'timed_out', outcomeUnknown: true
      })
      expect(timedOut.completionAnchor).toBeTruthy()
      expect(recoverAgentRuntimeJournal(persisted, 'timeout-journal').outcomeUnknownTools)
        .toEqual([expect.objectContaining({ callId: 'write-c1', status: 'timed_out', autoReplayAllowed: false })])
    } finally {
      vi.useRealTimers()
    }
  })
})
