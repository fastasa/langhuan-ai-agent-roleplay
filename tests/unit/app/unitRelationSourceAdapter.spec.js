import { describe, expect, it, vi } from 'vitest'
import {
  buildTrajectoryAxisRelationRecords,
  buildTrajectoryAxisUnitSequence,
  createUnitRelationSourceAdapter,
  filterUnitRelationSourceRelations,
  mapUnitRelationSourceNodeIdToUnitId,
  mapUnitRelationSourceNodeIdsToUnitIds,
  resolveUnitRelationSourceClipboardNodeIds,
  resolveUnitRelationSourceFocusNodeId,
  shouldUseTrajectoryAxisRelationLayout
} from '../../../src/app/unitRelationSourceAdapter'

describe('unitRelationSourceAdapter', () => {
  const units = [
    {
      unitId: 'doc-tree:root',
      domain: 'docLibrary',
      unitType: 'root',
      contentKind: 'group',
      title: '世界树',
      status: 'normal'
    },
    {
      unitId: 'doc-tree:~2F亚什基诺',
      domain: 'docLibrary',
      unitType: 'cluster',
      contentKind: 'group',
      title: '亚什基诺',
      parentId: 'doc-tree:root',
      sourceId: '/亚什基诺',
      status: 'normal'
    },
    {
      unitId: 'doc:doc_geo',
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: '地理',
      parentId: 'doc-tree:~2F亚什基诺',
      sourceId: 'doc_geo',
      semanticType: 'region',
      status: 'normal'
    },
    {
      unitId: 'doc:doc_org',
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: '夜巡者',
      parentId: 'doc-tree:~2F亚什基诺',
      sourceId: 'doc_org',
      semanticType: 'organization',
      status: 'normal'
    }
  ]

  it('maps source units to projection nodes and back', () => {
    const source = createUnitRelationSourceAdapter({
      characterId: 'doc-library-relation',
      units,
      activeUnit: units[2],
      clipboard: {
        mode: 'copy',
        unitIds: ['doc:doc_geo'],
        writable: true
      }
    })

    expect(resolveUnitRelationSourceFocusNodeId(source)).toBe('unit:doc:doc_geo')
    expect(resolveUnitRelationSourceClipboardNodeIds(source)).toEqual(['unit:doc:doc_geo'])
    expect(mapUnitRelationSourceNodeIdToUnitId(source, 'unit:doc:doc_geo')).toBe('doc:doc_geo')
    expect(mapUnitRelationSourceNodeIdsToUnitIds(source, ['unit:doc:doc_geo', 'unit:doc:doc_geo'])).toEqual(['doc:doc_geo'])
  })

  it('keeps view actions behind the adapter boundary', () => {
    const copyUnits = vi.fn()
    const pasteUnits = vi.fn()
    const source = createUnitRelationSourceAdapter({
      characterId: 'doc-library-relation',
      units,
      clipboard: { mode: '', unitIds: [], writable: true },
      copyUnits,
      pasteUnits
    })

    source.copyUnits(['doc:doc_geo'])
    source.pasteUnits('doc-tree:root')

    expect(copyUnits).toHaveBeenCalledWith(['doc:doc_geo'])
    expect(pasteUnits).toHaveBeenCalledWith('doc-tree:root')
  })

  it('keeps predicate relation filters as read-model view state', () => {
    const relations = [
      {
        relationId: 'r:tree:1',
        sourceUnitId: 'doc-tree:root',
        targetUnitId: 'doc:doc_geo',
        predicateId: 'predicate:structure:contains',
        direction: 'directed',
        status: 'projection',
        evidence: []
      },
      {
        relationId: 'r:hint:1',
        sourceUnitId: 'doc:doc_geo',
        targetUnitId: 'doc-tree:root',
        predicateId: 'predicate:general:mentions',
        direction: 'directed',
        status: 'candidate',
        evidence: []
      },
      {
        relationId: 'r:declared:1',
        sourceUnitId: 'doc:doc_geo',
        targetUnitId: 'doc:doc_org',
        predicateId: 'predicate:affiliation:governs',
        direction: 'directed',
        status: 'declared',
        evidence: []
      }
    ]
    const source = createUnitRelationSourceAdapter({
      characterId: 'doc-library-relation',
      units,
      relations,
      activeUnit: units[2],
      predicates: [
        {
          predicateId: 'predicate:structure:contains',
          family: 'structure',
          key: 'contains',
          label: '包含',
          status: 'confirmed'
        },
        {
          predicateId: 'predicate:general:mentions',
          family: 'general',
          key: 'mentions',
          label: '提及',
          status: 'confirmed'
        },
        {
          predicateId: 'predicate:affiliation:governs',
          family: 'affiliation',
          key: 'governs',
          label: '管辖',
          status: 'confirmed'
        }
      ],
      predicateFilter: {
        predicateFamilies: ['affiliation'],
        semanticTypes: ['organization'],
        statuses: ['declared']
      }
    })

    expect(source.relations).toHaveLength(3)
    expect(source.visibleRelations).toEqual([relations[2]])
    expect(filterUnitRelationSourceRelations(relations, { statuses: ['projection'] })).toEqual([relations[0]])
  })

  it('limits focused relation queries to bounded second-hop results', () => {
    const relations = [
      {
        relationId: 'r:1',
        sourceUnitId: 'doc:doc_geo',
        targetUnitId: 'doc:doc_org',
        predicateId: 'predicate:general:related_to',
        direction: 'bidirectional',
        status: 'declared',
        evidence: []
      },
      {
        relationId: 'r:2',
        sourceUnitId: 'doc:doc_org',
        targetUnitId: 'doc-tree:root',
        predicateId: 'predicate:general:related_to',
        direction: 'bidirectional',
        status: 'declared',
        evidence: []
      },
      {
        relationId: 'r:3',
        sourceUnitId: 'doc-tree:root',
        targetUnitId: 'doc-tree:~2F亚什基诺',
        predicateId: 'predicate:general:related_to',
        direction: 'bidirectional',
        status: 'declared',
        evidence: []
      }
    ]
    const source = createUnitRelationSourceAdapter({
      characterId: 'doc-library-relation',
      units,
      activeUnit: units[2],
      relations,
      predicateFilter: { statuses: ['declared'] },
      relationScope: { maxHops: 2, maxRelationCount: 8, maxNodeCount: 8 }
    })

    expect(source.visibleRelations.map((relation) => relation.relationId)).toEqual(['r:1', 'r:2'])
  })

  it('builds trajectory relation projection as a visible axis sequence', () => {
    const traceUnits = [
      {
        unitId: 'brain:char_1:trace',
        domain: 'characterBrain',
        unitType: 'trace',
        contentKind: 'group',
        title: '轨迹',
        status: 'normal'
      },
      {
        unitId: 'brain:char_1:brain%3Atrajectory%3Anode%3Agroup_childhood',
        domain: 'trace',
        unitType: 'traceGroup',
        contentKind: 'group',
        title: '67年 乡野童年与早年贫困',
        parentId: 'brain:char_1:trace',
        orderIndex: 0,
        sourceId: 'brain:trajectory:node:group_childhood',
        status: 'normal'
      },
      {
        unitId: 'brain:char_1:brain%3Atrajectory%3Anode%3Aday_73',
        domain: 'trace',
        unitType: 'traceDay',
        contentKind: 'markdown',
        title: '73年 启蒙学舍与识字开端',
        parentId: 'brain:char_1:brain%3Atrajectory%3Anode%3Agroup_childhood',
        orderIndex: 1,
        sourceId: 'brain:trajectory:node:day_73',
        status: 'normal'
      },
      {
        unitId: 'brain:char_1:brain%3Atrajectory%3Anode%3Aday_88',
        domain: 'trace',
        unitType: 'traceDay',
        contentKind: 'markdown',
        title: '88年 进入邮局从基础做起',
        parentId: 'brain:char_1:trace',
        orderIndex: 2,
        sourceId: 'brain:trajectory:node:day_88',
        status: 'normal'
      }
    ]

    expect(shouldUseTrajectoryAxisRelationLayout(traceUnits[1])).toBe(true)
    expect(buildTrajectoryAxisUnitSequence(traceUnits, traceUnits[0]).map((unit) => unit.title)).toEqual([
      '轨迹',
      '67年 乡野童年与早年贫困',
      '88年 进入邮局从基础做起'
    ])
    expect(buildTrajectoryAxisUnitSequence(traceUnits, traceUnits[1]).map((unit) => unit.title)).toEqual([
      '轨迹',
      '67年 乡野童年与早年贫困',
      '73年 启蒙学舍与识字开端',
      '88年 进入邮局从基础做起'
    ])
    expect(buildTrajectoryAxisUnitSequence(traceUnits, traceUnits[1], []).map((unit) => unit.title)).toEqual([
      '轨迹',
      '67年 乡野童年与早年贫困',
      '88年 进入邮局从基础做起'
    ])
    expect(buildTrajectoryAxisRelationRecords(traceUnits, traceUnits[1]).map((relation) => [
      relation.sourceUnitId,
      relation.targetUnitId
    ])).toEqual([
      [traceUnits[0].unitId, traceUnits[1].unitId],
      [traceUnits[1].unitId, traceUnits[2].unitId],
      [traceUnits[2].unitId, traceUnits[3].unitId]
    ])
  })
})
