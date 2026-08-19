import { describe, expect, it } from 'vitest'
import { buildReplySituationDependencySnapshot } from '../../../src/app/replySituationDependencySnapshot'

function fixture() {
  const item = (sourceRef, version, value = {}) => ({
    sourceRef, version, value, updatedAt: `t${version}`, scope: 'session', visibility: 'participants'
  })
  const workspace = {
    scope: { userId: 'u', workspaceId: 'w', sessionId: 's', sessionTitle: '', worldId: 'world', viewRevision: 'ignored' },
    world: { narrativeConfig: item('config', 1), narrativeSeeds: [item('seed:b', 2), item('seed:a', 1)], worldEntities: [] },
    scene: { curtain: item('curtain', 3, { time: '午时' }), mapRefs: [] },
    castRoster: [{
      participantId: 'p1', characterId: 'c1', displayName: '甲', characterStateMode: 'follow_main', characterBranchId: '',
      presence: { participantId: 'p1', worldId: 'world', state: 'present', version: 2 }, statusPanelRefs: []
    }],
    statusPanels: [item('panel:1', 4)],
    orchestration: { sessionOverride: null, lastCommittedScenario: null },
    recentRound: null, timeline: [], conflicts: []
  }
  const director = {
    scope: workspace.scope, curtain: workspace.scene.curtain, candidates: [], presences: [],
    relevantNarrativeSeeds: workspace.world.narrativeSeeds, statusCatalog: [], sessionOverride: null, lastCommittedScenario: null
  }
  return { workspace, director }
}

describe('reply situation dependency snapshot', () => {
  it('相同正式真值忽略数组输入顺序并产生同一指纹', () => {
    const first = fixture()
    const second = fixture()
    second.workspace.world.narrativeSeeds.reverse()
    expect(buildReplySituationDependencySnapshot(first)).toEqual(buildReplySituationDependencySnapshot(second))
  })

  it('帷幕、人格或提示词修订变化会改变对应分量和总指纹', () => {
    const base = fixture()
    const first = buildReplySituationDependencySnapshot({ ...base, personalityRevision: 'p1', promptPresetRevision: 'q1' })
    base.workspace.scene.curtain = { ...base.workspace.scene.curtain, version: 4 }
    const second = buildReplySituationDependencySnapshot({ ...base, personalityRevision: 'p2', promptPresetRevision: 'q1' })
    expect(second.fingerprint).not.toBe(first.fingerprint)
    expect(second.values.curtain).not.toBe(first.values.curtain)
    expect(second.values.personality).not.toBe(first.values.personality)
    expect(second.values.promptPreset).toBe(first.values.promptPreset)
  })
})
