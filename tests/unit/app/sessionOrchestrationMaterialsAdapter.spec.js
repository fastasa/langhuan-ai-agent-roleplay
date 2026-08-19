/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const repository = vi.hoisted(() => ({
  executeOrchestrationCommands: vi.fn(),
  fetchSessionOrchestrationMaterials: vi.fn(),
  saveSessionNarrativeOverride: vi.fn(),
  saveSessionOrchestrationState: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository', () => repository)

import {
  INVALIDATED_REPLY_SITUATION_CODE,
  createReplySituationCheckpointFromMaterialsState,
  getHydratedLastScenario,
  invalidateFormalSessionScenario,
  loadSessionOrchestrationMaterials,
  saveFormalSessionScenario,
  sessionOrchestrationMaterialsWrites
} from '../../../src/app/sessionOrchestrationMaterialsAdapter'

const emptyServerBundle = {
  sessionId: 'session_1', worldId: 'world_1', narrativeOverride: null, tasks: [], directives: [], state: null
}

const formalState = {
  id: 'state_1', sessionId: 'session_v2', worldId: 'world_1',
  scenarioCode: 'quiet_chat', scenarioLabel: '闲聊', scenarioSummary: '仍在客厅聊天',
  anchorMessageId: '101', sourceArtifactId: 'artifact_1', version: 3,
  source: 'director_artifact', createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:01:00.000Z'
}

describe('session orchestration materials adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('服务端成功时即使为空也不复活旧缓存', async () => {
    repository.fetchSessionOrchestrationMaterials.mockResolvedValue(emptyServerBundle)
    const result = await loadSessionOrchestrationMaterials('session_1')
    expect(result).toEqual({ materials: emptyServerBundle, source: 'server' })
  })

  it('服务端读取失败时直接失败，不再复活旧缓存', async () => {
    repository.fetchSessionOrchestrationMaterials.mockRejectedValue(new Error('offline'))
    await expect(loadSessionOrchestrationMaterials('session_1')).rejects.toThrow('offline')
  })

  it('新写入口只调用服务端，不双写 localStorage', async () => {
    window.localStorage.setItem('sentinel', 'keep')
    repository.saveSessionNarrativeOverride.mockResolvedValue({ id: 'override_1' })
    await sessionOrchestrationMaterialsWrites.saveNarrativeOverride('session_1', { content: '正式偏好', expectedVersion: 0 })
    expect(repository.saveSessionNarrativeOverride).toHaveBeenCalledWith('session_1', { content: '正式偏好', expectedVersion: 0 })
    expect(window.localStorage.getItem('sentinel')).toBe('keep')
  })

  it('把正式状态的消息锚、产物锚和版本映射到 v2 检查点', () => {
    expect(createReplySituationCheckpointFromMaterialsState(formalState, {
      fingerprint: 'scene-v7',
      values: { curtain: 7, presence: 'presence-v4' }
    })).toEqual({
      code: 'quiet_chat', label: '闲聊', summary: '仍在客厅聊天',
      anchor: {
        messageId: '101', sourceArtifactId: 'artifact_1', stateVersion: 3,
        updatedAt: '2026-08-18T00:01:00.000Z'
      },
      dependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { curtain: 7, presence: 'presence-v4' }
      }
    })
  })

  it('重新水合时从正式状态 JSON 恢复依赖快照，旧状态与坏 JSON 安全降级', () => {
    expect(createReplySituationCheckpointFromMaterialsState({
      ...formalState,
      dependencySnapshotJson: JSON.stringify({
        fingerprint: 'scene-v7',
        values: { curtain: 7, chatProjection: 101 }
      })
    })).toMatchObject({
      dependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { curtain: 7, chatProjection: 101 }
      }
    })
    expect(createReplySituationCheckpointFromMaterialsState({
      ...formalState,
      dependencySnapshotJson: '{not-json'
    })).not.toHaveProperty('dependencySnapshot')
    expect(createReplySituationCheckpointFromMaterialsState(formalState)).not.toHaveProperty('dependencySnapshot')
  })

  it('正式情境写入时把依赖快照一并持久化，并在当前进程保留依赖快照', async () => {
    repository.fetchSessionOrchestrationMaterials.mockResolvedValue({
      ...emptyServerBundle,
      sessionId: 'session_v2'
    })
    await loadSessionOrchestrationMaterials('session_v2')
    repository.saveSessionOrchestrationState.mockResolvedValue(formalState)

    await saveFormalSessionScenario('session_v2', {
      code: 'quiet_chat', label: '闲聊', summary: '仍在客厅聊天',
      anchorMessageId: '101', sourceArtifactId: 'artifact_1',
      dependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { curtain: 7, presence: 'presence-v4' }
      }
    })

    expect(repository.saveSessionOrchestrationState).toHaveBeenCalledWith('session_v2', {
      scenarioCode: 'quiet_chat', scenarioLabel: '闲聊', scenarioSummary: '仍在客厅聊天',
      anchorMessageId: '101', sourceArtifactId: 'artifact_1', expectedVersion: 0,
      source: 'director_artifact',
      dependencySnapshot: {
        fingerprint: 'scene-v7',
        values: { curtain: 7, presence: 'presence-v4' }
      }
    })
    expect(getHydratedLastScenario('session_v2')).toMatchObject({
      code: 'quiet_chat',
      anchor: { messageId: '101', sourceArtifactId: 'artifact_1', stateVersion: 3 },
      dependencySnapshot: { fingerprint: 'scene-v7', values: { curtain: 7, presence: 'presence-v4' } }
    })
  })

  it('显式失效会持久化 tombstone，当前进程和重新水合后都不能复活旧检查点', async () => {
    const sessionId = 'session_invalidate'
    const currentState = { ...formalState, sessionId }
    repository.fetchSessionOrchestrationMaterials.mockResolvedValueOnce({
      ...emptyServerBundle,
      sessionId,
      state: currentState
    })
    await loadSessionOrchestrationMaterials(sessionId)
    expect(getHydratedLastScenario(sessionId)?.code).toBe('quiet_chat')

    const invalidatedState = {
      ...currentState,
      scenarioCode: INVALIDATED_REPLY_SITUATION_CODE,
      scenarioLabel: '',
      scenarioSummary: '本轮尚未完成',
      anchorMessageId: '202',
      sourceArtifactId: '',
      source: 'reply_situation_invalidated',
      version: 4
    }
    repository.saveSessionOrchestrationState.mockResolvedValueOnce(invalidatedState)
    await invalidateFormalSessionScenario(sessionId, {
      anchorMessageId: '202',
      reason: '本轮尚未完成'
    })

    expect(repository.saveSessionOrchestrationState).toHaveBeenCalledWith(sessionId, {
      scenarioCode: INVALIDATED_REPLY_SITUATION_CODE,
      scenarioLabel: '',
      scenarioSummary: '本轮尚未完成',
      anchorMessageId: '202',
      sourceArtifactId: '',
      expectedVersion: 3,
      source: 'reply_situation_invalidated',
      dependencySnapshot: { values: {} }
    })
    expect(getHydratedLastScenario(sessionId)).toBeNull()

    repository.fetchSessionOrchestrationMaterials.mockResolvedValueOnce({
      ...emptyServerBundle,
      sessionId,
      state: invalidatedState
    })
    await loadSessionOrchestrationMaterials(sessionId)
    expect(getHydratedLastScenario(sessionId)).toBeNull()
  })

  it('结果未知或版本冲突时会重读正式版本并再次持久化 tombstone', async () => {
    const sessionId = 'session_invalidate_retry'
    const currentState = { ...formalState, sessionId }
    const refreshedState = { ...currentState, version: 4, scenarioCode: 'possibly_saved' }
    const invalidatedState = {
      ...currentState,
      scenarioCode: INVALIDATED_REPLY_SITUATION_CODE,
      scenarioLabel: '',
      scenarioSummary: '保存失败后强制失效',
      anchorMessageId: '303',
      sourceArtifactId: '',
      source: 'reply_situation_invalidated',
      version: 5
    }
    repository.fetchSessionOrchestrationMaterials
      .mockResolvedValueOnce({ ...emptyServerBundle, sessionId, state: currentState })
      .mockResolvedValueOnce({ ...emptyServerBundle, sessionId, state: refreshedState })
    await loadSessionOrchestrationMaterials(sessionId)
    repository.saveSessionOrchestrationState
      .mockRejectedValueOnce(new Error('version conflict'))
      .mockResolvedValueOnce(invalidatedState)

    await invalidateFormalSessionScenario(sessionId, {
      anchorMessageId: '303',
      reason: '保存失败后强制失效',
      force: true
    })

    expect(repository.fetchSessionOrchestrationMaterials).toHaveBeenCalledTimes(2)
    expect(repository.saveSessionOrchestrationState).toHaveBeenNthCalledWith(1, sessionId, expect.objectContaining({
      expectedVersion: 3,
      scenarioCode: INVALIDATED_REPLY_SITUATION_CODE
    }))
    expect(repository.saveSessionOrchestrationState).toHaveBeenNthCalledWith(2, sessionId, expect.objectContaining({
      expectedVersion: 4,
      scenarioCode: INVALIDATED_REPLY_SITUATION_CODE
    }))
    expect(getHydratedLastScenario(sessionId)).toBeNull()
  })

  it('缺少水合资料或正式锚点时拒绝静默保存', async () => {
    await expect(saveFormalSessionScenario('session_not_hydrated', {
      code: 'quiet_chat',
      anchorMessageId: '1'
    })).rejects.toThrow('必须先水合')

    const sessionId = 'session_missing_anchor'
    repository.fetchSessionOrchestrationMaterials.mockResolvedValueOnce({
      ...emptyServerBundle,
      sessionId
    })
    await loadSessionOrchestrationMaterials(sessionId)
    await expect(saveFormalSessionScenario(sessionId, { code: 'quiet_chat' }))
      .rejects.toThrow('必须关联')
  })
})
