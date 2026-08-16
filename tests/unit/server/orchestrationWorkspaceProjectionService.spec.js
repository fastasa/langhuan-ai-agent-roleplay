import { describe, expect, it } from 'vitest'
import { createOrchestrationWorkspaceProjectionService } from '../../../server/application/orchestration/orchestrationWorkspaceProjectionService.ts'

function makeRepository(overrides = {}) {
  const presences = [
    { participantId: 'p1', presenceState: 'present', version: 2, updatedAt: '2026-07-16T01:00:00.000Z' },
    { participantId: 'p2', presenceState: 'offstage', version: 4, updatedAt: '2026-07-16T02:00:00.000Z' }
  ]
  return {
    findSessionById: () => ({
      id: 's1', title: '测试会话', worldId: 'w1', userId: 'u1', workspaceId: 'ws1',
      virtualTime: '2026-07-16T13:15:12', virtualTimeAnchor: 1784178000000,
      virtualTimeBase: 1784188512000, virtualTimeRate: 0.5,
      virtualWeather: '薄雾', virtualWeatherMode: 'custom', updatedAt: '2026-07-16T00:00:00.000Z'
    }),
    listCharacterParticipants: () => [
      { id: 'p1', participantTargetId: 'c1', characterStateMode: 'follow_main', characterBranchId: '' },
      { id: 'p2', participantTargetId: 'c2', characterStateMode: 'follow_main', characterBranchId: '' },
      { id: 'p3', participantTargetId: 'c3', characterStateMode: 'follow_main', characterBranchId: '' }
    ],
    findCharacterById: (id) => ({ id, name: `角色${id.slice(1)}` }),
    listPresences: () => presences,
    listPendingPresenceTransitions: () => [],
    listRecentPresenceFacts: () => [{ id:'pe1',participantId:'p1',fromState:'unknown',toState:'present',evidenceSummary:'角色消息已落库',sourceMessageId:'8',createdAt:'2026-07-16T10:30:00.000Z' }],
    listRecentMessages: () => [{ id:8,role:'assistant',memberName:'角色1',content:'我已经到了。',createdAt:'2026-07-16T10:31:00.000Z' }],
    listRecentNarrativeSeedFacts: () => [{ id:'se1',seedId:'seed1',seedTitle:'暗线',evidenceSummary:'伏笔已经部分发生',sourceMessageId:'8',createdAt:'2026-07-16T10:32:00.000Z' }],
    findNarrativeConfig: () => ({ worldId: 'w1', content: '主题', version: 3, updatedAt: '2026-07-16T03:00:00.000Z' }),
    listNarrativeSeeds: () => [{ id: 'seed1', type: 'arc', title: '暗线', status: 'active', version: 5, updatedAt: '2026-07-16T04:00:00.000Z' }],
    listWorldEntities: () => [{ id: 'e1', kind: 'place', name: '庭院', version: 2, updatedAt: '2026-07-16T05:00:00.000Z' }],
    listStatusPanels: () => [{ id: 'sp1', name: '状态', description: '记录用户自定的现场状态', templateKind: '任意分类', hostType: 'session_character', hostId: 'p1', valuesJson: '{"hp":9}', fieldsJson: '[{"key":"hp","label":"体力","valueType":"number"}]', version: 6, updatedAt: '2026-07-16T06:00:00.000Z' }],
    findNarrativeOverride: () => ({ id: 'o1', content: '本会话偏向克制', version: 2, updatedAt: '2026-07-16T07:00:00.000Z' }),
    findOrchestrationState: () => ({ id: 'os1', scenarioCode: 'quiet', scenarioSummary: '静夜', version: 3, updatedAt: '2026-07-16T10:00:00.000Z' }),
    findRecentRoundArtifact: () => ({ id: 'a1', attemptId: 'run1', artifactKind: 'director', messageId: 8, payloadJson: '{}', createdAt: '2026-07-16T11:00:00.000Z' }),
    ...overrides,
    __presences: presences
  }
}

const input = { userId: 'u1', workspaceId: 'ws1', sessionId: 's1', userText: '继续' }

describe('OrchestrationWorkspaceProjectionService', () => {
  it('工作台与提调共享 viewRevision/sourceRef/version', () => {
    const result = createOrchestrationWorkspaceProjectionService(makeRepository()).read(input)
    expect(result.ok).toBe(true)
    expect(result.data.director.scope.viewRevision).toBe(result.data.workspace.scope.viewRevision)
    expect(result.data.director.relevantNarrativeSeeds[0]).toEqual(result.data.workspace.world.narrativeSeeds[0])
    expect(result.data.workspace.timeline.map((entry) => entry.value.kind)).toEqual(expect.arrayContaining(['message','presence_fact','seed_fact','status_update']))
    expect(result.data.workspace.scene.curtain.value).toMatchObject({
      time: '2026-07-16T13:15:12', timeAnchor: 1784178000000,
      timeBase: 1784188512000, timeRate: 0.5, weather: '薄雾', weatherMode: 'custom'
    })
  })

  it('正常排除离场，强制点名只标 forced_offstage 且不改变在场账本', () => {
    const repository = makeRepository()
    const before = structuredClone(repository.__presences)
    const normal = createOrchestrationWorkspaceProjectionService(repository).read(input)
    expect(normal.data.director.candidates.map((item) => item.characterId)).toEqual(['c1', 'c3'])
    expect(normal.data.director.candidates.find((item) => item.characterId === 'c3')?.reason).toBe('unknown_compatibility')
    const forced = createOrchestrationWorkspaceProjectionService(repository).read(input, { forcedCharacterIds: ['c2'] })
    expect(forced.data.director.candidates.find((item) => item.characterId === 'c2')).toMatchObject({ participantId: 'p2', presenceState: 'offstage', reason: 'forced_offstage' })
    expect(repository.__presences).toEqual(before)
  })

  it('只投影尚未提交或取消的预计登退场', () => {
    const result = createOrchestrationWorkspaceProjectionService(makeRepository({
      listPendingPresenceTransitions: () => [{
        id: 'proposal-1', participantId: 'p2', transition: 'enter', toState: 'present',
        version: 1, createdAt: '2026-07-16T02:30:00.000Z'
      }]
    })).read(input)
    expect(result.data.workspace.castRoster[1].pendingTransition).toMatchObject({
      value: { eventId: 'proposal-1', transition: 'enter', toState: 'present' },
      scope: 'round'
    })
  })

  it('无世界会话严格返回空世界资料，不借旧世界回退', () => {
    let worldReads = 0
    const repository = makeRepository({
      findSessionById: () => ({ id: 's1', title: '无世界', worldId: '', userId: 'u1', workspaceId: 'ws1' }),
      findNarrativeConfig: () => { worldReads += 1; return { worldId: 'stale' } },
      listNarrativeSeeds: () => { worldReads += 1; return [{ id: 'stale' }] },
      listWorldEntities: () => { worldReads += 1; return [{ id: 'stale' }] },
      listPresences: () => []
    })
    const result = createOrchestrationWorkspaceProjectionService(repository).read(input)
    expect(result.ok).toBe(true)
    expect(result.data.workspace.world).toMatchObject({ narrativeConfig: null, narrativeSeeds: [], worldEntities: [] })
    expect(result.data.director.relevantNarrativeSeeds).toEqual([])
    expect(worldReads).toBe(0)
  })

  it('提调投影保持硬字符预算并保留版本锚', () => {
    const huge = Array.from({ length: 80 }, (_, index) => ({
      id: `sp${index}`, name: `状态${index}`, hostType: 'session_character', hostId: 'p1',
      valuesJson: JSON.stringify({ note: '很长的状态'.repeat(400) }), version: index + 1, updatedAt: '2026-07-16T12:00:00.000Z'
    }))
    const result = createOrchestrationWorkspaceProjectionService(makeRepository({ listStatusPanels: () => huge })).read(input, { maxPromptChars: 8000 })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.data.director).length).toBeLessThanOrEqual(8000)
    expect(result.data.workspace.statusPanels).toHaveLength(80)
    expect(result.data.workspace.statusPanels[0].value.values.note.length).toBeGreaterThan(1000)
    expect(result.data.director.statusCatalog[0].value).toMatchObject({ kind: '', description: '', fields: [] })
    expect(result.data.director.statusCatalog[0].value).not.toHaveProperty('values')
    expect(result.data.director.scope.viewRevision).toMatch(/^[a-f0-9]{24}$/)
  })

  it('所有待引爆种子优先进入提调投影，数量上限与字符预算都不能把其中任何一条裁掉', () => {
    const readySeeds = Array.from({ length: 12 }, (_, index) => ({
      id: `ready-${index}`,
      type: 'event',
      title: `待引爆${index}`,
      description: '完整因果需要提调按 id 再读取。'.repeat(30),
      currentProgress: '已经越过时间门',
      expectedOutcome: '仍只是候选结果',
      status: 'ready_to_trigger',
      startTime: '2026-07-16T08:00:00.000Z',
      version: index + 1,
      updatedAt: '2026-07-16T12:00:00.000Z'
    }))
    const hugePanels = Array.from({ length: 40 }, (_, index) => ({
      id: `sp${index}`, name: `状态${index}`, description: '很长的状态用途'.repeat(80),
      hostType: 'session_character', hostId: 'p1', fieldsJson: '[]', version: index + 1,
      updatedAt: '2026-07-16T12:00:00.000Z'
    }))
    const result = createOrchestrationWorkspaceProjectionService(makeRepository({
      listNarrativeSeeds: () => [
        { id: 'ordinary', type: 'arc', title: '普通种子', status: 'active', version: 1, updatedAt: '2026-07-16T11:00:00.000Z' },
        ...readySeeds
      ],
      listStatusPanels: () => hugePanels
    })).read(input, { maxPromptChars: 8000 })

    expect(result.ok).toBe(true)
    expect(result.data.director.relevantNarrativeSeeds.map((entry) => entry.value.id)).toEqual(readySeeds.map((seed) => seed.id))
    expect(result.data.director.relevantNarrativeSeeds.every((entry) => entry.value.status === 'ready_to_trigger')).toBe(true)
    expect(JSON.stringify(result.data.director).length).toBeLessThanOrEqual(8000)
  })
})
