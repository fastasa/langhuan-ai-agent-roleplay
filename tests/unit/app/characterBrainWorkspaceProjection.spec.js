import { describe, expect, it } from 'vitest'
import {
  buildCharacterBrainWorkspaceProjection,
  getCharacterBrainProjectionNodeById,
  resolveUnitRelationProjectionNodeId
} from '../../../src/app/characterBrainWorkspaceProjection'
import { buildCharacterBrainUnitView, buildDocLibraryUnitView } from '../../../src/app/unitViewAdapters'

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '陈星依',
    gender: '女',
    age: '18',
    emoji: '星',
    desc: '会整理结构。',
    appearance: '银发。',
    outfit: '',
    personality: '不惯着人。',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speakingStyle: '直接。',
    nicknames: '星依',
    defaultPreset: '默认',
    defaultModel: 'test-model',
    ttsVoice: 'voice-a',
    avatarPath: '',
    groupId: 'group_1',
    brainLinks: {},
    brain_links: '{}',
    brainDocuments: {},
    brain_documents: '{}',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainTrajectoryMeta: { birthDate: '', zeroNote: '' },
    brain_trajectory_meta: '{"birthDate":"","zeroNote":""}',
    ...overrides
  }
}

describe('characterBrainWorkspaceProjection', () => {
  it('projects CharacterBrainWorkspace nodes from role tree parent ids', () => {
    const character = createCharacter()
    const { units } = buildCharacterBrainUnitView(character)
    const detailNodes = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'brain:detail_info',
      minDensity: 0
    })

    expect(detailNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'brain:root', title: '陈星依' }),
      expect.objectContaining({ id: 'brain:see_me', title: '核心', parentId: 'brain:root' }),
      expect.objectContaining({ id: 'brain:detail_info', title: '详细信息', parentId: 'brain:see_me' }),
      expect.objectContaining({ id: 'brain:appearance', title: '外貌特征', parentId: 'brain:detail_info' })
    ]))
  })

  it('follows new role tree parents without changing the renderer', () => {
    const character = createCharacter()
    const result = buildCharacterBrainUnitView(character)
    const detailInfoUnit = result.units.find((unit) => unit.sourceId === 'brain:detail_info')
    const movedUnits = result.units.map((unit) => (
      unit.sourceId === 'brain:personality'
        ? { ...unit, parentId: detailInfoUnit?.unitId }
        : unit
    ))
    const detailNodes = buildCharacterBrainWorkspaceProjection(character, movedUnits, {
      focusId: 'brain:detail_info',
      minDensity: 0
    })

    expect(detailNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'brain:detail_info', title: '详细信息' }),
      expect.objectContaining({ id: 'brain:personality', title: '性格', parentId: 'brain:detail_info' })
    ]))
    expect(getCharacterBrainProjectionNodeById(character, movedUnits, 'brain:personality')).toMatchObject({
      id: 'brain:personality',
      parentId: 'brain:detail_info'
    })
  })

  it('projects document library units into brain workspace nodes without changing document ids', () => {
    const character = createCharacter({ id: 'doc-library-relation', name: '世界树' })
    const { units } = buildDocLibraryUnitView([
      {
        documentId: 'doc_geo',
        id: 'doc_geo',
        title: '亚什基诺世界地理',
        displayPath: '/亚什基诺/地理与区域/亚什基诺世界地理.md',
        content: '正文',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      }
    ])
    const focusUnit = units.find((unit) => unit.sourceId === 'doc_geo')
    const focusId = resolveUnitRelationProjectionNodeId(focusUnit, character.id)
    const nodes = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId,
      minDensity: 0
    })

    expect(focusId).toBe('unit:doc:doc_geo')
    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'brain:root', title: '世界树' }),
      expect.objectContaining({ title: '亚什基诺', parentId: 'brain:root' }),
      expect.objectContaining({ id: 'unit:doc:doc_geo', title: '亚什基诺世界地理' })
    ]))
    expect(focusUnit?.unitId).toBe('doc:doc_geo')
  })

  it('renders document world clusters as disconnected forest roots', () => {
    const character = createCharacter({ id: 'doc-library-relation', name: '世界树' })
    const units = [
      { unitId: 'root', domain: 'docLibrary', unitType: 'root', contentKind: 'group', title: '世界树', status: 'normal' },
      { unitId: 'cluster-a', domain: 'docLibrary', unitType: 'cluster', contentKind: 'group', title: '亚什基诺', parentId: 'root', status: 'normal' },
      { unitId: 'a-leaf', domain: 'docLibrary', unitType: 'leaf', contentKind: 'markdown', title: '本土文明', parentId: 'cluster-a', status: 'normal' },
      { unitId: 'cluster-b', domain: 'docLibrary', unitType: 'cluster', contentKind: 'group', title: '纳维拉岛', parentId: 'root', status: 'normal' }
    ]
    const forestRootNodeIds = ['cluster-a', 'cluster-b'].map((unitId) => (
      resolveUnitRelationProjectionNodeId(units.find((unit) => unit.unitId === unitId), character.id)
    ))
    const rootScene = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'brain:root',
      forestRootNodeIds
    })
    const focusedScene = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'unit:a-leaf',
      forestRootNodeIds
    })

    expect(rootScene.map((node) => node.id)).toEqual(['unit:cluster-a', 'unit:cluster-b'])
    expect(rootScene.every((node) => !node.parentId)).toBe(true)
    expect(focusedScene.map((node) => node.id)).toEqual(['unit:cluster-a', 'unit:a-leaf'])
    expect(focusedScene.map((node) => node.id)).not.toContain('brain:root')
    expect(focusedScene.map((node) => node.id)).not.toContain('unit:cluster-b')
  })

  it('adds relation endpoints around the focused projection node without changing parents', () => {
    const character = createCharacter({ id: 'doc-library-relation', name: '世界树' })
    const { units } = buildDocLibraryUnitView([
      {
        documentId: 'doc_geo',
        id: 'doc_geo',
        title: '亚什基诺世界地理',
        displayPath: '/亚什基诺/地理与区域/亚什基诺世界地理.md',
        content: '正文',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      },
      {
        documentId: 'doc_org',
        id: 'doc_org',
        title: '夜巡者',
        displayPath: '/亚什基诺/组织/夜巡者.md',
        content: '正文',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      }
    ])
    const focusUnit = units.find((unit) => unit.sourceId === 'doc_geo')
    const relatedUnit = units.find((unit) => unit.sourceId === 'doc_org')
    const focusId = resolveUnitRelationProjectionNodeId(focusUnit, character.id)
    const relatedId = resolveUnitRelationProjectionNodeId(relatedUnit, character.id)
    const nodes = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId,
      relationNodeIds: [relatedId],
      minDensity: 0
    })

    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: relatedId, title: '夜巡者', parentId: focusId, edgeKind: 'link' })
    ]))
    expect(relatedUnit?.parentId).not.toBe(focusUnit?.unitId)
  })

  it('projects trajectory relation view as a single axis and inserts only the focused group children', () => {
    const character = createCharacter({
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:group_childhood',
          title: '67年 乡野童年与早年贫困',
          kind: 'group',
          granularity: 'year',
          nodeType: 'range',
          parentId: 'brain:trajectory'
        },
        {
          id: 'brain:trajectory:node:day_73',
          title: '73年 启蒙学舍与识字开端',
          subtitle: '识字开端',
          kind: 'day',
          granularity: 'day',
          nodeType: 'single',
          parentId: 'brain:trajectory:node:group_childhood'
        },
        {
          id: 'brain:trajectory:node:day_88',
          title: '88年 进入邮局从基础做起',
          kind: 'day',
          granularity: 'day',
          nodeType: 'single',
          parentId: 'brain:trajectory'
        }
      ]
    })
    const { units } = buildCharacterBrainUnitView(character)
    const collapsed = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'brain:trajectory',
      layoutMode: 'trajectoryAxis',
      minDensity: 0
    })
    const expanded = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'brain:trajectory:node:group_childhood',
      layoutMode: 'trajectoryAxis',
      minDensity: 0
    })
    const explicitlyCollapsed = buildCharacterBrainWorkspaceProjection(character, units, {
      focusId: 'brain:trajectory:node:group_childhood',
      layoutMode: 'trajectoryAxis',
      trajectoryExpandedNodeIds: [],
      minDensity: 0
    })

    expect(collapsed.map((node) => node.id)).toEqual([
      'brain:root',
      'brain:see_me',
      'brain:cognition',
      'brain:trajectory',
      'brain:trajectory:node:group_childhood',
      'brain:trajectory:node:day_88'
    ])
    expect(expanded.map((node) => node.id)).toEqual([
      'brain:root',
      'brain:see_me',
      'brain:cognition',
      'brain:trajectory',
      'brain:trajectory:node:group_childhood',
      'brain:trajectory:node:day_73',
      'brain:trajectory:node:day_88'
    ])
    expect(expanded.slice(3).map((node) => node.x)).toEqual([0, 0, 0, 0])
    expect(expanded[1]).toMatchObject({ id: 'brain:see_me', parentId: 'brain:root' })
    expect(expanded[2]).toMatchObject({ id: 'brain:cognition', parentId: 'brain:root' })
    expect(expanded[3]).toMatchObject({ id: 'brain:trajectory', parentId: 'brain:root' })
    expect(expanded[0]).toMatchObject({ x: 0, y: 0 })
    expect(Math.round(Math.hypot(expanded[1].x - expanded[0].x, expanded[1].y - expanded[0].y))).toBe(220)
    expect(Math.round(Math.hypot(expanded[2].x - expanded[0].x, expanded[2].y - expanded[0].y))).toBe(220)
    expect(Math.round(Math.hypot(expanded[3].x - expanded[0].x, expanded[3].y - expanded[0].y))).toBe(220)
    expect(expanded[3].y).toBeGreaterThan(expanded[0].y)
    expect(expanded[5]).toMatchObject({
      id: 'brain:trajectory:node:day_73',
      parentId: 'brain:trajectory:node:group_childhood',
      subtitle: '识字开端'
    })
    expect(expanded[6]).toMatchObject({ parentId: 'brain:trajectory:node:day_73' })
    expect(expanded[3].y).toBeLessThan(expanded[4].y)
    expect(expanded[4].y).toBeLessThan(expanded[5].y)
    expect(expanded[5].y).toBeLessThan(expanded[6].y)
    expect(explicitlyCollapsed.map((node) => node.id)).toEqual([
      'brain:root',
      'brain:see_me',
      'brain:cognition',
      'brain:trajectory',
      'brain:trajectory:node:group_childhood',
      'brain:trajectory:node:day_88'
    ])
  })
})
