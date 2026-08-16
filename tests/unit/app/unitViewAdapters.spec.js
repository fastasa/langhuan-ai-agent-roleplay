import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREDICATES,
  GENERAL_RELATED_TO_PREDICATE_ID,
  STRUCTURE_CONTAINS_PREDICATE_ID,
  buildCharacterBrainSidebarShellUnitView,
  buildCharacterBrainUnitView,
  buildDocLibraryUnitView,
  buildUnitViewValidationReport
} from '../../../src/app/unitViewAdapters'
import {
  clearDocLibraryUnitViewCache,
  getCachedDocLibraryUnitView
} from '../../../src/app/docLibraryUnitViewCache'
import { formatRelationHintReferenceTitle } from '../../../src/app/relationHintReference'

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '亚什基诺世界地理',
    displayPath: '/亚什基诺/地理与区域/亚什基诺世界地理.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'region',
    summary: '旧摘要',
    tags: ['旧标签'],
    content: '正文',
    publicCompilePage: {
      summary: '公共摘要',
      tags: ['地理'],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-24T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides
  }
}

function createTraceNode(overrides = {}) {
  return {
    id: 'brain:trajectory:node:day_2004_05_02',
    title: '2004年5月2日',
    summary: '出生当天',
    parentId: 'brain:trajectory',
    kind: 'day',
    nodeType: 'single',
    granularity: 'day',
    startDate: '2004-05-02',
    displayTitle: '2004年5月2日',
    note: '出生当天',
    innerEntries: [],
    linkIds: [],
    timeLabel: '2004-05-02',
    pointDate: '2004-05-02',
    offsetDays: 0,
    ageLabel: '0岁',
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: ['轨迹'],
    content: '当天正文',
    confirmed: true,
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides
  }
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '陈星依',
    gender: '女',
    age: '18',
    emoji: '星',
    avatar_path: '',
    group_id: 'group_1',
    desc: '会整理结构。',
    appearance: '银发。',
    outfit: '',
    personality: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '直接。',
    nicknames: '星依',
    default_preset: '默认',
    default_model: 'test-model',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 0,
    created_at: '',
    avatarPath: '',
    groupId: 'group_1',
    speakingStyle: '直接。',
    yearlySchedule: '',
    currentActivities: '',
    defaultPreset: '默认',
    defaultModel: 'test-model',
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

describe('unitViewAdapters', () => {
  it('builds a lightweight character brain shell before the full projection is ready', () => {
    const result = buildCharacterBrainSidebarShellUnitView(createCharacter())

    expect(result.units.map((unit) => unit.title)).toEqual(['陈星依', '核心', '灵魂', '轨迹'])
    expect(result.relations).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('reuses document library UnitView until documents or tree inputs change', () => {
    clearDocLibraryUnitViewCache()
    const documents = [createDocument()]
    const first = getCachedDocLibraryUnitView(documents, {})
    const second = getCachedDocLibraryUnitView(documents, {})

    expect(second).toBe(first)

    const changed = getCachedDocLibraryUnitView([
      createDocument({ title: '新标题' })
    ], {})

    expect(changed).not.toBe(first)
    expect(changed.units.some((unit) => unit.title === '新标题')).toBe(true)
  })

  it('maps document displayPath and manual order into a read-only UnitView tree', () => {
    const result = buildDocLibraryUnitView([
      createDocument(),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        title: '规则与概念',
        displayPath: '/亚什基诺/规则与概念/规则与概念.md'
      })
    ], {
      '__root__': ['folder:/亚什基诺'],
      '/亚什基诺': ['folder:/亚什基诺/规则与概念', 'folder:/亚什基诺/地理与区域']
    })

    const cluster = result.units.find((unit) => unit.sourcePath === '/亚什基诺')
    const branch = result.units.find((unit) => unit.sourcePath === '/亚什基诺/规则与概念')
    const documentUnit = result.units.find((unit) => unit.unitId === 'doc:doc_1')

    expect(cluster).toMatchObject({
      unitType: 'cluster',
      parentId: 'doc-tree:root',
      title: '亚什基诺'
    })
    expect(branch).toMatchObject({
      unitType: 'branch',
      orderIndex: 0
    })
    expect(documentUnit).toMatchObject({
      unitType: 'leaf',
      contentKind: 'markdown',
      title: '亚什基诺世界地理',
      semanticType: 'region',
      compilePage: {
        summary: '公共摘要',
        tags: ['地理']
      }
    })
    expect(result.relations.some((relation) => (
      relation.predicateId === STRUCTURE_CONTAINS_PREDICATE_ID
      && relation.targetUnitId === 'doc:doc_1'
      && relation.status === 'projection'
    ))).toBe(true)
  })

  it('extracts old weak relation hints as declared related_to relations', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_night',
        id: 'doc_night',
        title: '夜巡者',
        displayPath: '/亚什基诺/组织/夜巡者.md',
        publicCompilePage: {
          summary: '夜巡者巡查王城。',
          tags: ['组织'],
          relationHints: ['[[镜庭主城]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_city',
        id: 'doc_city',
        title: '镜庭主城',
        displayPath: '/亚什基诺/地点/镜庭主城.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_night',
        targetUnitId: 'doc:doc_city',
        predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
        status: 'declared'
      })
    ]))
  })

  it('generates declared relations from strong relation hints', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '长白山山脉横贯北境。',
          tags: ['地形'],
          relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_continent',
        id: 'doc_continent',
        title: '尤拉西亚洲',
        displayPath: '/亚什基诺/地理/尤拉西亚洲.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_continent',
        targetUnitId: 'doc:doc_mountain',
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
        direction: 'directed',
        status: 'declared',
        evidence: [expect.objectContaining({
          sourceType: 'compilePage',
          excerpt: '[[长白山山脉]]_属于_[[尤拉西亚洲]]'
        })]
      })
    ]))
    expect(result.relations.filter((relation) => relation.predicateId === GENERAL_RELATED_TO_PREDICATE_ID)).toEqual([])
  })

  it('allows an overview document to declare relations between other units', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_overview',
        id: 'doc_overview',
        title: '长白山总览',
        displayPath: '/亚什基诺/地理/长白山总览.md',
        publicCompilePage: {
          summary: '总览集中维护区域关系。',
          tags: ['地理'],
          relationHints: ['[[北境军团]]_控制_[[长白山山口]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_army',
        id: 'doc_army',
        title: '北境军团',
        displayPath: '/亚什基诺/势力/北境军团.md'
      }),
      createDocument({
        documentId: 'doc_pass',
        id: 'doc_pass',
        title: '长白山山口',
        displayPath: '/亚什基诺/地理/长白山山口.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_army',
        targetUnitId: 'doc:doc_pass',
        predicateId: 'predicate:power:controls',
        status: 'declared'
      })
    ]))
  })

  it('warns and skips strong relation hints with missing or ambiguous titles', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [
            '[[长白山山脉]]_位于_[[不存在地区]]',
            '[[长白山山脉]]_位于_[[镜庭主城]]'
          ],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_city_1',
        id: 'doc_city_1',
        title: '镜庭主城',
        displayPath: '/亚什基诺/地点/镜庭主城.md'
      }),
      createDocument({
        documentId: 'doc_city_2',
        id: 'doc_city_2',
        title: '镜庭主城',
        displayPath: '/亚什基诺/历史/镜庭主城.md'
      })
    ])

    expect(result.relations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        predicateId: 'predicate:spatial_location:located_in',
        status: 'declared'
      })
    ]))
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'relation_hint_target_missing',
      'relation_hint_title_ambiguous'
    ]))
  })

  it('resolves relation endpoints from the active unit before warning about same-title units', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_river_current',
        id: 'doc_river_current',
        title: '河流水系',
        displayPath: '/亚什基诺/长白山山脉/地理与区域/河流水系.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[河流水系]]_位于_[[长白山区域]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_river_duplicate',
        id: 'doc_river_duplicate',
        title: '河流水系',
        displayPath: '/亚什基诺/长白山山脉/地理与区域/地理与区域/河流水系.md'
      }),
      createDocument({
        documentId: 'doc_region_target',
        id: 'doc_region_target',
        title: '长白山区域',
        displayPath: '/亚什基诺/长白山山脉/长白山区域.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_river_current',
        targetUnitId: 'doc:doc_region_target',
        predicateId: 'predicate:spatial_location:located_in',
        status: 'declared'
      })
    ]))
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation_hint_title_ambiguous' })
    ]))
  })

  it('prefers a same-parent relation endpoint when duplicate titles exist elsewhere', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_region',
        id: 'doc_region',
        title: '地理与区域',
        displayPath: '/亚什基诺/长白山山脉/地理与区域/地理与区域.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[地理与区域]]_包含_[[河流水系]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_river_near',
        id: 'doc_river_near',
        title: '河流水系',
        displayPath: '/亚什基诺/长白山山脉/地理与区域/河流水系.md'
      }),
      createDocument({
        documentId: 'doc_river_far',
        id: 'doc_river_far',
        title: '河流水系',
        displayPath: '/亚什基诺/别的区域/河流水系.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_region',
        targetUnitId: 'doc:doc_river_near',
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
        status: 'declared'
      })
    ]))
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation_hint_title_ambiguous' })
    ]))
  })

  it('resolves duplicate titles by exact relation reference ids', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_region',
        id: 'doc_region',
        title: '地理与区域',
        displayPath: '/亚什基诺/地理与区域/地理与区域.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[地理与区域@doc_region]]_包含_[[河流水系@doc_river_far]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_river_near',
        id: 'doc_river_near',
        title: '河流水系',
        displayPath: '/亚什基诺/地理与区域/河流水系.md'
      }),
      createDocument({
        documentId: 'doc_river_far',
        id: 'doc_river_far',
        title: '河流水系',
        displayPath: '/亚什基诺/别的区域/河流水系.md'
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: 'doc:doc_region',
        targetUnitId: 'doc:doc_river_far',
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID
      })
    ]))
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation_hint_title_ambiguous' })
    ]))
  })

  it('merges implicit field-tree index documents into their folder units', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_region_index',
        id: 'doc_region_index',
        title: '地理与区域',
        displayPath: '/亚什基诺/地理与区域/index.md',
        content: '目录概览正文',
        publicCompilePage: {
          summary: '目录概览摘要',
          tags: ['地理'],
          relationHints: [],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      })
    ], {}, {
      treeNodes: [
        {
          nodeId: 'folder-region',
          parentId: '',
          nodeKind: 'folder',
          title: '地理与区域',
          legacyDisplayPath: '/亚什基诺/地理与区域',
          status: 'normal'
        },
        {
          nodeId: 'doc-region-index-node',
          parentId: 'folder-region',
          nodeKind: 'document',
          title: '地理与区域',
          documentId: 'doc_region_index',
          legacyDisplayPath: '/亚什基诺/地理与区域/index.md',
          status: 'normal'
        }
      ],
      treeOrders: {
        '': ['folder-region'],
        'folder-region': ['doc-region-index-node']
      }
    })

    expect(result.units.filter((unit) => unit.title === '地理与区域')).toHaveLength(1)
    expect(result.units).toEqual(expect.arrayContaining([
      expect.objectContaining({
        unitId: 'folder-region',
        contentKind: 'group',
        body: '目录概览正文',
        compilePage: expect.objectContaining({ summary: '目录概览摘要' }),
        metadata: expect.objectContaining({
          overviewDocumentId: 'doc_region_index',
          relationRefId: 'doc_region_index'
        })
      })
    ]))
    expect(result.units.some((unit) => unit.unitId === 'doc:doc_region_index')).toBe(false)
  })

  it('does not treat tree projection relations as duplicate relation hints', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/尤拉西亚洲/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      })
    ])

    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetUnitId: 'doc:doc_mountain',
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
        status: 'declared',
        evidence: [expect.objectContaining({
          sourceType: 'compilePage',
          excerpt: '[[长白山山脉]]_属于_[[尤拉西亚洲]]'
        })]
      })
    ]))
    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'relation_hint_duplicate_relation' })
    ]))
  })

  it('warns and skips duplicate normalized relation hints declared by relation hints', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_region',
        id: 'doc_region',
        title: '地理与区域',
        displayPath: '/亚什基诺/长白山山脉/地理与区域.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [
            '[[地理与区域]]_包含_[[河流水系]]',
            '[[河流水系]]_属于_[[地理与区域]]'
          ],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_river',
        id: 'doc_river',
        title: '河流水系',
        displayPath: '/亚什基诺/长白山山脉/河流水系.md'
      })
    ])

    const declaredContainsRelations = result.relations.filter((relation) => (
      relation.predicateId === STRUCTURE_CONTAINS_PREDICATE_ID
      && relation.status === 'declared'
      && relation.sourceUnitId === 'doc:doc_region'
      && relation.targetUnitId === 'doc:doc_river'
    ))
    expect(declaredContainsRelations).toHaveLength(1)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'relation_hint_duplicate_relation',
        details: expect.objectContaining({
          lineIndex: 1,
          duplicateEvidence: expect.arrayContaining([
            expect.objectContaining({
              sourceType: 'compilePage',
              ownerTitle: '地理与区域',
              ownerPath: '/亚什基诺/长白山山脉/地理与区域.md',
              line: '[[地理与区域]]_包含_[[河流水系]]',
              lineIndex: 0
            })
          ])
        })
      })
    ]))
  })

  it('reports invalid strong relation predicates through validation warnings', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[长白山山脉]]_临时乱写_[[尤拉西亚洲]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-05-01T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_continent',
        id: 'doc_continent',
        title: '尤拉西亚洲',
        displayPath: '/亚什基诺/地理/尤拉西亚洲.md'
      })
    ])
    const report = buildUnitViewValidationReport(result, {
      scope: 'relation-hints-test',
      generatedAt: '2026-05-01T00:00:00.000Z'
    })

    expect(result.relations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'declared' })
    ]))
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'relation_hint_invalid_predicate',
        title: '关系提示谓词非法',
        actionLevel: 'must_fix'
      })
    ]))
  })

  it('maps character core, soul, trace and flags legacy trajectory risks', () => {
    const monthNode = createTraceNode({
      id: 'brain:trajectory:node:month_2004_05',
      title: '5月',
      subtitle: '雨季开始',
      parentId: 'brain:trajectory:node:year_2004',
      kind: 'month',
      granularity: 'month',
      nodeType: 'range',
      startDate: '2004-05-01',
      endDate: '2004-05-31',
      pointDate: '2004-05-31',
      systemRole: 'monthBranch',
      autoGenerated: true
    })
    const yearNode = createTraceNode({
      id: 'brain:trajectory:node:year_2004',
      title: '2004年',
      kind: 'year',
      granularity: 'year',
      nodeType: 'range',
      startDate: '2004-01-01',
      endDate: '2004-12-31',
      pointDate: '2004-12-31',
      systemRole: 'yearBranch',
      autoGenerated: true
    })
    const legacyYearNode = createTraceNode({
      id: 'brain:trajectory:node:year_2005',
      title: '2005年',
      kind: 'year',
      granularity: 'year',
      nodeType: 'range',
      startDate: '2005-01-01',
      endDate: '2005-12-31',
      pointDate: '2005-12-31',
      innerEntries: [
        {
          id: 'inner-1',
          nodeType: 'single',
          granularity: 'day',
          startDate: '2005-01-02',
          displayTitle: '1月2日',
          note: '日记',
          content: '日记正文',
          linkIds: [],
          sourceNodeIds: []
        }
      ]
    })
    const result = buildCharacterBrainUnitView(createCharacter({
      brainCognitionNodes: [
        {
          id: 'brain:cognition:node:city',
          title: '镜庭主城',
          summary: '她理解中的主城。',
          parentId: 'brain:cognition',
          kind: 'private',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      ],
      brainTraceNodes: [
        yearNode,
        monthNode,
        createTraceNode({
          parentId: 'brain:trajectory:node:month_2004_05',
          subtitle: '醒来',
          systemRole: 'dayLeaf'
        }),
        createTraceNode({
          id: 'brain:trajectory:node:event_2004_05_02_morning',
          title: '清晨醒来',
          parentId: 'brain:trajectory:node:day_2004_05_02',
          subtitle: '',
          systemRole: 'eventLeaf',
          content: '事件正文。'
        }),
        createTraceNode({
          id: 'brain:trajectory:node:arrangement_2004_05_02_night',
          title: '晚间巡查',
          parentId: 'brain:trajectory:node:day_2004_05_02',
          subtitle: '',
          systemRole: 'arrangementLeaf',
          activationRule: { date: '2004-05-02', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'must' },
          content: '安排正文。'
        }),
        legacyYearNode
      ],
      brainLinks: {
        'brain:desc': ['brain:trajectory:node:year_2005']
      }
    }))

    expect(result.units).toEqual(expect.arrayContaining([
      expect.objectContaining({ unitId: 'character:char_1', unitType: 'character' }),
      expect.objectContaining({ title: '核心', unitType: 'core' }),
      expect.objectContaining({ sourceId: 'brain:avatar', title: '头像', contentKind: 'group' }),
      expect.objectContaining({ sourceId: 'brain:preset', title: '预设', contentKind: 'group' }),
      expect.objectContaining({ sourceId: 'brain:system_info', title: '系统信息', contentKind: 'group' }),
      expect.objectContaining({ sourceId: 'brain:detail_info', title: '详细信息', contentKind: 'group' }),
      expect.objectContaining({ sourceId: 'brain:desc', unitType: 'coreField', contentKind: 'markdown' }),
      expect.objectContaining({ sourceId: 'brain:cognition:node:city', unitType: 'soulNode' }),
      expect.objectContaining({ sourceId: 'brain:trajectory', unitType: 'trace', body: expect.stringContaining('日历') }),
      expect.objectContaining({
        sourceId: 'brain:trajectory:node:month_2004_05',
        unitType: 'traceGroup',
        title: '2004年5月',
        metadata: expect.objectContaining({ sidebarTitle: '5月', subtitle: '雨季开始', titleReadonly: true })
      }),
      expect.objectContaining({
        sourceId: 'brain:trajectory:node:day_2004_05_02',
        unitType: 'traceDay',
        title: '2004年5月2日',
        metadata: expect.objectContaining({ sidebarTitle: '2日', subtitle: '醒来', titleReadonly: true })
      }),
      expect.objectContaining({ sourceId: 'brain:trajectory:node:year_2005', unitType: 'traceGroup' })
    ]))
    const coreRoot = result.units.find((unit) => unit.unitType === 'core')
    const coreChildIds = result.units
      .filter((unit) => unit.parentId === coreRoot?.unitId)
      .map((unit) => unit.sourceId)
    expect(coreChildIds).toEqual([
      'brain:desc',
      'brain:personality',
      'brain:goal_value',
      'brain:detail_info',
      'brain:system_info'
    ])
    expect(coreChildIds).not.toContain('brain:tts_voice')
    const eventUnit = result.units.find((unit) => unit.sourceId === 'brain:trajectory:node:event_2004_05_02_morning')
    const arrangementUnit = result.units.find((unit) => unit.sourceId === 'brain:trajectory:node:arrangement_2004_05_02_night')
    expect(eventUnit).toEqual(expect.objectContaining({
      unitId: expect.stringContaining('trace:char_1:event:'),
      unitType: 'traceEvent',
      contentKind: 'markdown',
      parentId: expect.stringContaining(':day:')
    }))
    expect(arrangementUnit).toEqual(expect.objectContaining({
      unitId: expect.stringContaining('trace:char_1:arrangement:'),
      unitType: 'traceArrangement',
      contentKind: 'markdown',
      metadata: expect.objectContaining({
        activationRule: expect.objectContaining({ date: '2004-05-02', startTime: '20:00' }),
        recallPolicy: expect.objectContaining({ priority: 'must' })
      })
    }))
    const systemInfo = result.units.find((unit) => unit.sourceId === 'brain:system_info')
    const detailInfo = result.units.find((unit) => unit.sourceId === 'brain:detail_info')
    const desc = result.units.find((unit) => unit.sourceId === 'brain:desc')
    const personality = result.units.find((unit) => unit.sourceId === 'brain:personality')
    const appearance = result.units.find((unit) => unit.sourceId === 'brain:appearance')
    expect(systemInfo?.parentId).toBe(coreRoot?.unitId)
    expect(detailInfo?.parentId).toBe(coreRoot?.unitId)
    expect(desc?.parentId).toBe(coreRoot?.unitId)
    expect(personality?.parentId).toBe(coreRoot?.unitId)
    expect(appearance?.parentId).toBe(detailInfo?.unitId)
    expect(personality?.contentKind).toBe('markdown')
    expect(formatRelationHintReferenceTitle(appearance)).toBe('外貌特征@brain:char_1~3Aappearance')
    expect(result.units.some((unit) => unit.sourceId === 'brain:emoji')).toBe(true)
    expect(result.units.some((unit) => unit.sourceId === 'brain:default_preset')).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'trace_non_day_unit',
      'trace_range_unit',
      'trace_inner_entries'
    ]))
    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
        status: 'declared'
      })
    ]))
  })

  it('restores document reference hierarchy from sourceDisplayPath in character brain view', () => {
    const result = buildCharacterBrainUnitView(createCharacter({
      brainCognitionNodes: [
        {
          id: 'starter:xingyi:soul:guide-root',
          title: '琅嬛使用说明',
          summary: '说明总入口。',
          parentId: 'brain:cognition',
          kind: 'group',
          sourceDisplayPath: '/世界树/琅嬛使用说明',
          createdAt: '2026-04-26T00:00:00.000Z',
          updatedAt: '2026-04-26T00:00:00.000Z'
        },
        {
          id: 'starter:xingyi:soul:doc:guide-index',
          title: '琅嬛使用说明',
          summary: '说明总索引。',
          parentId: 'starter:xingyi:soul:guide-root',
          kind: 'reference',
          sourceDocumentId: 'doc_guide_index',
          sourceDisplayPath: '/世界树/琅嬛使用说明/index.md',
          createdAt: '2026-04-26T00:00:00.000Z',
          updatedAt: '2026-04-26T00:00:00.000Z'
        },
        {
          id: 'starter:xingyi:soul:doc:quick-index',
          title: '快速开始',
          summary: '快速开始索引。',
          parentId: 'starter:xingyi:soul:guide-root',
          kind: 'reference',
          sourceDocumentId: 'doc_quick_index',
          sourceDisplayPath: '/世界树/琅嬛使用说明/快速开始/index.md',
          createdAt: '2026-04-26T00:00:00.000Z',
          updatedAt: '2026-04-26T00:00:00.000Z'
        },
        {
          id: 'starter:xingyi:soul:doc:first-check',
          title: '第一次使用前先确认三件事',
          summary: '先确认账号、模型和聊天对象。',
          parentId: 'starter:xingyi:soul:guide-root',
          kind: 'private',
          sourceDocumentId: 'doc_first_check',
          sourceDisplayPath: '/世界树/琅嬛使用说明/快速开始/第一次使用前先确认三件事.md',
          content: '保存后转成私有正文，但仍应留在快速开始下面。',
          createdAt: '2026-04-26T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z'
        },
        {
          id: 'starter:xingyi:soul:doc:chat-menu',
          title: '聊天加号菜单',
          summary: '说明加号菜单。',
          parentId: 'starter:xingyi:soul:guide-root',
          kind: 'reference',
          sourceDocumentId: 'doc_chat_menu',
          sourceDisplayPath: '/世界树/琅嬛使用说明/联系人与聊天/聊天加号菜单.md',
          createdAt: '2026-04-26T00:00:00.000Z',
          updatedAt: '2026-04-26T00:00:00.000Z'
        }
      ]
    }))

    const guideRoot = result.units.find((unit) => unit.sourcePath === '/世界树/琅嬛使用说明')
    const duplicatedGuideIndex = result.units.find((unit) => unit.sourceId === 'starter:xingyi:soul:doc:guide-index')
    const quickIndex = result.units.find((unit) => unit.sourcePath === '/世界树/琅嬛使用说明/快速开始/index.md')
    const firstCheck = result.units.find((unit) => unit.sourcePath === '/世界树/琅嬛使用说明/快速开始/第一次使用前先确认三件事.md')
    const chatFolder = result.units.find((unit) => unit.sourcePath === '/世界树/琅嬛使用说明/联系人与聊天')
    const chatMenu = result.units.find((unit) => unit.sourcePath === '/世界树/琅嬛使用说明/联系人与聊天/聊天加号菜单.md')

    expect(duplicatedGuideIndex).toBeUndefined()
    expect(quickIndex?.parentId).toBe(guideRoot?.unitId)
    expect(firstCheck?.parentId).toBe(quickIndex?.unitId)
    expect(chatFolder).toMatchObject({
      unitType: 'branch',
      contentKind: 'group',
      title: '联系人与聊天',
      parentId: guideRoot?.unitId
    })
    expect(chatMenu?.parentId).toBe(chatFolder?.unitId)
    expect(result.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceUnitId: quickIndex?.unitId,
        targetUnitId: firstCheck?.unitId,
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
        status: 'projection'
      }),
      expect.objectContaining({
        sourceUnitId: chatFolder?.unitId,
        targetUnitId: chatMenu?.unitId,
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID,
        status: 'projection'
      })
    ]))
  })

  it('keeps predicate library visible as explicit read model data', () => {
    expect(DEFAULT_PREDICATES.map((predicate) => predicate.predicateId)).toEqual(expect.arrayContaining([
      STRUCTURE_CONTAINS_PREDICATE_ID,
      GENERAL_RELATED_TO_PREDICATE_ID
    ]))
  })

  it('builds readable validation reports for document library risks', () => {
    const result = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_empty',
        id: 'doc_empty',
        title: '无路径文档',
        displayPath: '',
        publicCompilePage: undefined
      }),
      createDocument({
        documentId: 'doc_dup_1',
        id: 'doc_dup_1',
        title: '重复',
        displayPath: '/亚什基诺/重复.md'
      }),
      createDocument({
        documentId: 'doc_dup_2',
        id: 'doc_dup_2',
        title: '重复',
        displayPath: '/亚什基诺/重复.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: ['[[不存在的节点]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      })
    ], {
      '/亚什基诺': ['document:missing_doc']
    })
    const report = buildUnitViewValidationReport(result, {
      scope: 'doc-library-test',
      generatedAt: '2026-04-24T00:00:00.000Z'
    })

    expect(report.scope).toBe('doc-library-test')
    expect(report.summary.mustFix).toBeGreaterThan(0)
    expect(report.summary.canDefer).toBeGreaterThan(0)
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'doc_empty_path',
        title: '文档缺少路径',
        actionLevel: 'must_fix'
      }),
      expect.objectContaining({
        code: 'doc_duplicate_path',
        title: '文档路径重复',
        actionLevel: 'must_fix'
      }),
      expect.objectContaining({
        code: 'manual_order_orphan',
        title: '排序桶引用了不存在的条目',
        actionLevel: 'can_defer'
      }),
      expect.objectContaining({
        code: 'relation_hint_target_missing',
        title: '关系提示暂未匹配目标',
        actionLevel: 'notice'
      }),
      expect.objectContaining({
        code: 'duplicate_sibling_title',
        title: '同父级标题重复',
        actionLevel: 'can_defer'
      })
    ]))
    expect(report.issues.find((issue) => issue.code === 'doc_empty_path')?.suggestion).toContain('displayPath')
  })

  it('builds readable validation reports for character brain trajectory migration risks', () => {
    const result = buildCharacterBrainUnitView(createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:range_2005',
          title: '2005年',
          kind: 'year',
          granularity: 'year',
          nodeType: 'range',
          startDate: '2005-01-01',
          endDate: '2005-12-31',
          pointDate: '2005-12-31',
          innerEntries: [
            {
              id: 'inner-1',
              nodeType: 'single',
              granularity: 'day',
              startDate: '2005-02-03',
              displayTitle: '2月3日',
              note: '内部条目',
              content: '',
              linkIds: [],
              sourceNodeIds: []
            }
          ]
        })
      ],
      brainLinks: {
        'brain:desc': ['missing-node']
      }
    }))
    const report = buildUnitViewValidationReport(result, {
      scope: 'character-brain-test',
      generatedAt: '2026-04-24T00:00:00.000Z'
    })

    expect(report.summary.mustFix).toBe(3)
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'trace_non_day_unit',
      'trace_range_unit',
      'trace_inner_entries',
      'brain_link_target_missing'
    ]))
    expect(report.issues.find((issue) => issue.code === 'trace_non_day_unit')).toMatchObject({
      title: '轨迹存在非日正式节点',
      actionLevel: 'must_fix'
    })
    expect(report.issues.find((issue) => issue.code === 'brain_link_target_missing')).toMatchObject({
      title: '角色大脑链接目标不存在',
      actionLevel: 'can_defer'
    })
  })
})
