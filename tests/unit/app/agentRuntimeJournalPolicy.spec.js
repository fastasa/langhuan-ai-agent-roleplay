import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgentRuntimeJournalEvent } from '../../../src/app/agentRuntime/runtimeJournal.ts'
import {
  buildAgentRuntimeJournalRunId,
  prepareAgentRuntimeJournalForHarness
} from '../../../src/app/agentRuntimeJournalPolicy.ts'

const FORMAL_HARNESS_FILES = [
  'agentHarnessShared.ts',
  'groupDirectorHarness.ts',
  'personalityNarrationSubagent.ts',
  'replyPlanOrchestratorHarness.ts',
  'subagentLoop.ts',
  'tidiaoCorrectionLoop.ts',
  'xingyiAgentHarness.ts'
]

function response(ok, data, status = ok ? 200 : 500) {
  return { ok, status, json: vi.fn(async () => data) }
}

function readAppSource(fileName) {
  return readFileSync(resolve(process.cwd(), 'src/app', fileName), 'utf8')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('agentRuntimeJournalPolicy', () => {
  it('用现有身份组成可追溯前缀，并用唯一尾码隔离 speaker/重试', () => {
    const speakerA = buildAgentRuntimeJournalRunId({
      profileId: 'role_reply.plan-orchestration',
      runtimeVersion: 'reply-plan-v1',
      traceIds: ['director-7', 'speaker-a'],
      uniqueToken: 'unique-1'
    })
    const speakerB = buildAgentRuntimeJournalRunId({
      profileId: 'role_reply.plan-orchestration',
      runtimeVersion: 'reply-plan-v1',
      traceIds: ['director-7', 'speaker-b'],
      uniqueToken: 'unique-1'
    })
    const retryA = buildAgentRuntimeJournalRunId({
      profileId: 'role_reply.plan-orchestration',
      runtimeVersion: 'reply-plan-v1',
      traceIds: ['director-7', 'speaker-a'],
      uniqueToken: 'unique-2'
    })

    expect(speakerA).toContain('director-7:speaker-a:unique-1')
    expect(speakerA).not.toBe(speakerB)
    expect(speakerA).not.toBe(retryA)
    expect(buildAgentRuntimeJournalRunId({
      profileId: 'x'.repeat(400),
      runtimeVersion: 'y'.repeat(400),
      traceIds: ['z'.repeat(400)],
      uniqueToken: 'bounded'
    }).length).toBeLessThanOrEqual(220)
  })

  it('测试环境未注入 fetch 时禁用持久 journal，不发相对网络请求', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const prepared = await prepareAgentRuntimeJournalForHarness({
      profileId: 'test.profile',
      runtimeVersion: 'test-v1',
      uniqueToken: 'test-guard'
    })

    expect(prepared.journal).toBeUndefined()
    expect(prepared.audit.status).toBe('disabled-test')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fresh 成功时装配 runtime journal，并只透传调用方已有 digest', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(true, { events: [] }))
    const prepared = await prepareAgentRuntimeJournalForHarness({
      profileId: 'tidiao.director-round',
      runtimeVersion: 'director-v1',
      traceIds: ['session-1', 'director-1'],
      uniqueToken: 'fresh-1',
      digests: {
        personaDigest: '',
        promptSupplyDigest: 'prompt-existing',
        toolCatalogDigest: 'tools-existing'
      },
      fetchImpl
    })

    expect(prepared.audit.status).toBe('enabled')
    expect(prepared.journal).toMatchObject({
      runId: prepared.runId,
      initialSeq: 0,
      metadata: {
        profileId: 'tidiao.director-round',
        runtimeVersion: 'director-v1',
        promptSupplyDigest: 'prompt-existing',
        toolCatalogDigest: 'tools-existing'
      }
    })
    expect(prepared.journal?.metadata).not.toHaveProperty('personaDigest')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fresh 网络失败降级为无 journal 并留下结构化 warning，不阻断调用方', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const audits = []
    const prepared = await prepareAgentRuntimeJournalForHarness({
      profileId: 'xingyi.global',
      runtimeVersion: 'agent-runtime-batch1',
      uniqueToken: 'offline',
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('network offline')),
      onAudit: (audit) => audits.push(audit)
    })

    expect(prepared.journal).toBeUndefined()
    expect(prepared.audit).toMatchObject({ status: 'prepare-failed', stage: 'prepare' })
    expect(audits.at(-1)).toMatchObject({ status: 'prepare-failed', message: 'network offline' })
    expect(warning).toHaveBeenCalledOnce()
  })

  it('运行中首次 append 失败会告警并打开断路器，后续事件不再反复访问网络', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(true, { events: [] }))
      .mockRejectedValueOnce(new TypeError('append offline'))
    const audits = []
    const prepared = await prepareAgentRuntimeJournalForHarness({
      profileId: 'test.profile',
      runtimeVersion: 'test-v1',
      uniqueToken: 'append-fail',
      fetchImpl,
      appendRetries: 0,
      onAudit: (audit) => audits.push(audit)
    })
    const event = createAgentRuntimeJournalEvent({
      runId: prepared.runId,
      seq: 1,
      kind: 'run.started',
      timestamp: '2026-08-18T00:00:00.000Z',
      payload: {}
    })

    await expect(prepared.journal?.adapter.append(event)).rejects.toThrow('append offline')
    await expect(prepared.journal?.adapter.append({ ...event, seq: 2 })).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(audits.at(-1)).toMatchObject({ status: 'append-failed', stage: 'append' })
    expect(warning).toHaveBeenCalledOnce()
  })

  it('七个正式 runtime 调用层都准备并按可用性传入 journal', () => {
    for (const fileName of FORMAL_HARNESS_FILES) {
      const source = readAppSource(fileName)
      expect(source, fileName).toContain("from './agentRuntimeJournalPolicy'")
      expect(source, fileName).toContain('prepareAgentRuntimeJournalForHarness({')
      expect(source, fileName).toContain('journalPreparation.journal')
    }
  })

  it('subagent grace 使用主 runId 的独立后缀并准备全新的 seq 空间', () => {
    const source = readAppSource('subagentLoop.ts')
    expect(source.match(/prepareAgentRuntimeJournalForHarness\(\{/g)).toHaveLength(2)
    expect(source).toContain('runId: `${journalPreparation.runId}:grace`')
    expect(source).toContain('journal: graceJournalPreparation.journal')
    expect(source).toContain('runId: graceJournalPreparation.runId')
  })
})
