import { describe, expect, it } from 'vitest'
import {
  GENERAL_RELATED_TO_PREDICATE_ID,
  STRUCTURE_CONTAINS_PREDICATE_ID,
  buildCharacterBrainUnitView,
  buildDocLibraryUnitView
} from '../../../src/app/unitViewAdapters'
import {
  buildCompileRelationIssues,
  buildRelationHintValidationItems,
  buildRelationSystemReadModel,
  confirmRelationCandidate,
  normalizeRelationSystemState,
  rejectRelationCandidate,
  upsertRelationPredicate
} from '../../../src/app/relationSystem'

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '夜巡者',
    displayPath: '/亚什基诺/组织/夜巡者.md',
    documentType: 'worldview_organization',
    kind: 'worldview_organization',
    summary: '',
    tags: [],
    content: '',
    publicCompilePage: {
      summary: '',
      tags: [],
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

function createCharacter() {
  return {
    id: 'char_1',
    name: '陈星依',
    gender: '女',
    age: '18',
    emoji: '星',
    avatar_path: '',
    group_id: 'default',
    desc: '会判断结构。',
    appearance: '',
    outfit: '',
    personality: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '',
    nicknames: '',
    default_preset: '',
    default_model: '',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 0,
    created_at: '',
    groupId: 'default',
    brainLinks: {
      'brain:desc': ['brain:cognition:node:city']
    },
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
    brainTraceNodes: [],
    brainTrajectoryMeta: { birthDate: '', zeroNote: '' }
  }
}

describe('relationSystem', () => {
  it('keeps old weak relation hints as declared relation truth', () => {
    const docResult = buildDocLibraryUnitView([
      createDocument({
        publicCompilePage: {
          summary: '',
          tags: [],
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
    const model = buildRelationSystemReadModel([docResult], {})
    const declared = model.declaredRelations.find((relation) => relation.predicateId === GENERAL_RELATED_TO_PREDICATE_ID)

    expect(declared).toMatchObject({
      sourceUnitId: 'doc:doc_1',
      targetUnitId: 'doc:doc_city',
      status: 'declared'
    })
    expect(model.candidateRelations).toEqual([])
    expect(model.confirmedRelations).toEqual([])
    expect(model.projectedRelations.length).toBeGreaterThan(0)
  })

  it('can confirm and reject relation candidates by persistent decision', () => {
    const docResult = {
      units: [],
      warnings: [],
      relations: [
        {
          relationId: 'relation:candidate:test',
          sourceUnitId: 'doc:doc_1',
          targetUnitId: 'doc:doc_city',
          predicateId: GENERAL_RELATED_TO_PREDICATE_ID,
          direction: 'bidirectional',
          status: 'candidate',
          evidence: [{ sourceType: 'compilePage', sourceId: 'doc_1' }]
        }
      ]
    }
    const relationId = buildRelationSystemReadModel([docResult], {}).candidateRelations[0].relationId
    const confirmed = confirmRelationCandidate({}, relationId, GENERAL_RELATED_TO_PREDICATE_ID, '2026-04-24T01:00:00.000Z')
    const confirmedModel = buildRelationSystemReadModel([docResult], confirmed)
    const rejected = rejectRelationCandidate(confirmed, relationId, '2026-04-24T02:00:00.000Z')
    const rejectedModel = buildRelationSystemReadModel([docResult], rejected)

    expect(confirmedModel.candidateRelations).toEqual([])
    expect(confirmedModel.confirmedRelations[0]).toMatchObject({
      relationId,
      status: 'confirmed'
    })
    expect(rejectedModel.confirmedRelations).toEqual([])
    expect(rejectedModel.rejectedRelations[0]).toMatchObject({
      relationId,
      status: 'rejected'
    })
  })

  it('keeps declared user relations separate from candidate decisions', () => {
    const docResult = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
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
    const relationId = docResult.relations.find((relation) => relation.status === 'declared')?.relationId || ''
    const state = rejectRelationCandidate({}, relationId, '2026-05-01T01:00:00.000Z')
    const model = buildRelationSystemReadModel([docResult], state)

    expect(model.declaredRelations).toEqual([
      expect.objectContaining({
        relationId,
        status: 'declared',
        predicateId: STRUCTURE_CONTAINS_PREDICATE_ID
      })
    ])
    expect(model.rejectedRelations).toEqual([])
  })

  it('builds visible validation rows for valid, duplicate, missing and invalid relation hints', () => {
    const docResult = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [
            '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
            '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
            '[[长白山山脉]]_用户词_[[尤拉西亚洲]]',
            '[[长白山山脉]]_位于_[[不存在区域]]'
          ],
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
    const model = buildRelationSystemReadModel([docResult], {})
    const items = buildRelationHintValidationItems(model, docResult.warnings)

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'valid',
        ownerTitle: '长白山山脉',
        sourceTitle: '尤拉西亚洲',
        targetTitle: '长白山山脉',
        predicateLabel: '包含',
        surfacePredicate: '属于',
        lineIndex: 0,
        line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]'
      }),
      expect.objectContaining({
        status: 'warning',
        code: 'relation_hint_duplicate_relation',
        lineIndex: 1,
        sourceTitle: '尤拉西亚洲',
        targetTitle: '长白山山脉',
        predicateLabel: '包含'
      }),
      expect.objectContaining({
        status: 'warning',
        code: 'relation_hint_invalid_predicate',
        lineIndex: 2,
        surfacePredicate: '用户词'
      }),
      expect.objectContaining({
        status: 'warning',
        code: 'relation_hint_target_missing',
        lineIndex: 3,
        targetTitle: '不存在区域'
      })
    ]))
  })

  it('maps relation hint warnings into compile dialog issues', () => {
    const docResult = buildDocLibraryUnitView([
      createDocument({
        documentId: 'doc_mountain',
        id: 'doc_mountain',
        title: '长白山山脉',
        displayPath: '/亚什基诺/地理/长白山山脉.md',
        publicCompilePage: {
          summary: '',
          tags: [],
          relationHints: [
            '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
            '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
            '[[长白山山脉]]_用户词_[[尤拉西亚洲]]',
            '[[长白山山脉]]_位于_[[不存在区域]]'
          ],
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
    const model = buildRelationSystemReadModel([docResult], {})
    const items = buildRelationHintValidationItems(model, docResult.warnings)
    const issues = buildCompileRelationIssues(items)
    const duplicateIssue = issues.find((issue) => issue.type === 'duplicate_relation')
    const invalidPredicateIssue = issues.find((issue) => issue.type === 'invalid_predicate')
    const missingTargetIssue = issues.find((issue) => issue.type === 'missing_target')

    expect(buildCompileRelationIssues([])).toEqual([])
    expect(duplicateIssue).toMatchObject({
      severity: 'suggestion',
      lineIndex: 1,
      relatedLineIndexes: [0, 1],
      safeAutoApply: true
    })
    expect(duplicateIssue?.actionKinds).toEqual(expect.arrayContaining(['locate_line', 'delete_line', 'mark_reviewed']))
    expect(invalidPredicateIssue).toMatchObject({
      severity: 'blocking',
      lineIndex: 2,
      sourceTitle: '长白山山脉',
      targetTitle: '尤拉西亚洲',
      suggestedText: '[[长白山山脉]]_关联_[[尤拉西亚洲]]'
    })
    expect(invalidPredicateIssue?.actionKinds).toEqual(expect.arrayContaining(['locate_line', 'apply_suggested_text', 'delete_line']))
    expect(missingTargetIssue).toMatchObject({
      severity: 'suggestion',
      lineIndex: 3,
      targetTitle: '不存在区域'
    })
    expect(missingTargetIssue?.actionKinds).not.toEqual(expect.arrayContaining(['convert_to_weak_relation', 'apply_suggested_text']))
    expect(issues).toHaveLength(3)
  })

  it('merges predicate writes and character brain candidates into the read model', () => {
    const state = upsertRelationPredicate({}, {
      predicateId: 'predicate:custom:guards',
      family: 'character',
      key: 'guards',
      label: '守护',
      status: 'confirmed'
    })
    const model = buildRelationSystemReadModel([buildCharacterBrainUnitView(createCharacter())], state)

    expect(normalizeRelationSystemState(state).predicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicateId: 'predicate:custom:guards', label: '守护' })
    ]))
    expect(model.predicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ predicateId: 'predicate:custom:guards' })
    ]))
    expect(model.candidateRelations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'candidate',
        evidence: [expect.objectContaining({ sourceType: 'brain' })]
      })
    ]))
  })
})
