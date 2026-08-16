import { describe, expect, it } from 'vitest'
import {
  ORCHESTRATION_ERROR_CODES,
  OrchestrationProtocolError,
  applyPresenceEventToCurrent,
  assertOrchestrationCommandEnvelope,
  assertOrchestrationProjectionWorldScope,
  createSessionCharacterTargetRef,
  resolveSessionCharacterStateTarget,
  selectDirectorOrchestrationCandidates
} from '../../../shared/orchestrationWorkspace.js'

function presence(overrides = {}) {
  return {
    participantId: 'participant_1',
    worldId: 'world_1',
    state: 'unknown',
    version: 3,
    ...overrides
  }
}

function projection(overrides = {}) {
  return {
    scope: {
      userId: 'user_1',
      workspaceId: 'default',
      sessionId: 'session_1',
      sessionTitle: '测试会话',
      worldId: '',
      viewRevision: 'view_1'
    },
    world: { narrativeConfig: null, narrativeSeeds: [], worldEntities: [] },
    scene: {
      curtain: { value: {}, sourceRef: 'session:session_1', version: 1, updatedAt: '', scope: 'session', visibility: 'user' },
      mapRefs: []
    },
    castRoster: [],
    statusPanels: [],
    orchestration: { sessionOverride: null, lastCommittedScenario: null },
    recentRound: null,
    timeline: [],
    conflicts: [],
    ...overrides
  }
}

describe('剧本统一编排共享协议', () => {
  it('会话成员是在场候选上限，不能用 presence 记录凭空制造成员', () => {
    const candidates = selectDirectorOrchestrationCandidates({
      participantIds: ['member_present', 'member_unknown', 'member_offstage'],
      presenceByParticipantId: {
        member_present: 'present',
        member_unknown: 'unknown',
        member_offstage: 'offstage',
        non_member_present: 'present'
      }
    })

    expect(candidates).toEqual([
      { participantId: 'member_present', presenceState: 'present', reason: 'present' },
      { participantId: 'member_unknown', presenceState: 'unknown', reason: 'unknown_compatibility' }
    ])
  })

  it('离场角色只有被强制点名时才交给提调判断，仍不静默改为在场', () => {
    expect(selectDirectorOrchestrationCandidates({
      participantIds: ['member_offstage'],
      presenceByParticipantId: { member_offstage: 'offstage' },
      forcedParticipantIds: ['member_offstage']
    })).toEqual([
      { participantId: 'member_offstage', presenceState: 'offstage', reason: 'forced_offstage' }
    ])
  })

  it('独立快照状态只解析到当前分支；缺分支必须失败，不能回退主线', () => {
    expect(resolveSessionCharacterStateTarget({
      participantId: 'participant_1',
      characterId: 'character_1',
      characterStateMode: 'independent_snapshot',
      characterBranchId: 'branch_1'
    })).toEqual({
      kind: 'character_branch',
      characterId: 'character_1',
      branchId: 'branch_1',
      participantId: 'participant_1'
    })

    expect(() => resolveSessionCharacterStateTarget({
      participantId: 'participant_1',
      characterId: 'character_1',
      characterStateMode: 'independent_snapshot',
      characterBranchId: ''
    })).toThrowError(expect.objectContaining({ code: ORCHESTRATION_ERROR_CODES.missingCharacterBranch }))
  })

  it('预计登退场只进事件账本，不修改当前在场事实或版本', () => {
    const current = presence({ state: 'offstage' })
    const next = applyPresenceEventToCurrent(current, {
      eventType: 'proposed',
      provisional: true,
      transition: 'enter',
      toState: 'present'
    }, 3)

    expect(next).toEqual(current)
    expect(next).not.toBe(current)
  })

  it('正式在场提交必须经过 expectedVersion，陈旧写入返回统一冲突码', () => {
    expect(() => applyPresenceEventToCurrent(presence(), {
      eventType: 'committed',
      provisional: false,
      transition: 'enter',
      toState: 'present'
    }, 2)).toThrowError(expect.objectContaining({ code: ORCHESTRATION_ERROR_CODES.versionConflict }))

    expect(applyPresenceEventToCurrent(presence(), {
      eventType: 'committed',
      provisional: false,
      transition: 'enter',
      toState: 'present'
    }, 3)).toEqual(expect.objectContaining({ state: 'present', version: 4 }))
  })

  it('无世界会话的统一投影禁止携带世界种子或实体', () => {
    expect(() => assertOrchestrationProjectionWorldScope(projection())).not.toThrow()
    expect(() => assertOrchestrationProjectionWorldScope(projection({
      world: {
        narrativeConfig: null,
        narrativeSeeds: [{ value: {}, sourceRef: 'seed:1', version: 1, updatedAt: '', scope: 'world', visibility: 'director_only' }],
        worldEntities: []
      }
    }))).toThrowError(expect.objectContaining({ code: ORCHESTRATION_ERROR_CODES.worldScopeViolation }))
  })

  it('命令只接受正式 targetRef、版本、幂等键与证据，不接受无审计裸写', () => {
    const command = {
      command: 'setCharacterPresence',
      sessionId: 'session_1',
      worldId: '',
      targetRef: createSessionCharacterTargetRef('participant_1'),
      expectedVersion: 0,
      idempotencyKey: 'manual:session_1:participant_1:1',
      source: { evidenceSummary: '用户在工作台确认角色已在场' },
      payload: { state: 'present' }
    }
    expect(() => assertOrchestrationCommandEnvelope(command)).not.toThrow()
    expect(() => assertOrchestrationCommandEnvelope({
      ...command,
      idempotencyKey: '',
      source: { evidenceSummary: '' }
    })).toThrowError(OrchestrationProtocolError)
  })
})
