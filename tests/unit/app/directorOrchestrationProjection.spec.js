import { describe, expect, it } from 'vitest'
import { requireDirectorOrchestrationProjection } from '../../../src/app/agentContext/directorOrchestrationProjection'

function bundle({ sourceVersion = 'revision-1', viewRevision = 'revision-1', sessionId = 's1', projectionSessionId = 's1', include = true } = {}) {
  return {
    agentKind: 'tidiao', recipeVersion: 'v1', generatedAt: 'now',
    scope: { userId: 'u1', workspaceId: 'default', sessionId }, perspective: { kind: 'system_director' }, omitted: [],
    projections: include ? [{
      status: 'available',
      projection: {
        kind: 'orchestration.workspace', schemaVersion: 'v1', sourceRef: `chat-session:${projectionSessionId}:orchestration-workspace`,
        sourceVersion, generatedAt: 'now', scope: { userId: 'u1', workspaceId: 'default', sessionId: projectionSessionId },
        classification: 'session_truth', visibility: 'director_only', perspective: { kind: 'system_director' }, truncated: false, warnings: [],
        value: {
          scope: { userId: 'u1', workspaceId: 'default', sessionId: projectionSessionId, sessionTitle: '测试', worldId: '', viewRevision },
          curtain: { value: {}, sourceRef: 'curtain', version: 0, updatedAt: '', scope: 'session', visibility: 'participants' },
          candidates: [], presences: [], relevantNarrativeSeeds: [], statusCatalog: [], sessionOverride: null, lastCommittedScenario: null
        }
      }
    }] : []
  }
}

describe('提调结构化编排快照', () => {
  it('直接返回上下文携带的同版本投影，不依赖渲染文本搜索', () => {
    expect(requireDirectorOrchestrationProjection(bundle()).scope.viewRevision).toBe('revision-1')
  })

  it('缺少必需投影时明确失败', () => {
    expect(() => requireDirectorOrchestrationProjection(bundle({ include: false }))).toThrow('缺少结构化编排投影')
  })

  it('结构化来源版本损坏或跨会话时明确失败', () => {
    expect(() => requireDirectorOrchestrationProjection(bundle({ sourceVersion: 'revision-old' }))).toThrow('版本无效')
    expect(() => requireDirectorOrchestrationProjection(bundle({ projectionSessionId: 's2' }))).toThrow('会话作用域不一致')
  })
})
