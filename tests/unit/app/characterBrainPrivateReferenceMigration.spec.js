import { describe, expect, it } from 'vitest'
import { migrateCharacterBrainImportedReferences } from '../../../src/app/characterBrainPrivateReferenceMigration'

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_city',
    id: 'doc_city',
    stableId: 'doc_city',
    title: '镜庭主城',
    displayPath: '/世界树/镜庭主城.md',
    documentType: 'worldview_place',
    kind: 'worldview_place',
    summary: '公共摘要',
    tags: ['王城'],
    content: '# 镜庭主城\n\n公共正文。',
    publicCompilePage: {
      summary: '公共编译摘要',
      tags: ['王城'],
      relationHints: ['[[镜庭主城@doc_city]]_包含_[[城北@doc_north]]'],
      updatedAt: '2026-05-04T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
    ...overrides
  }
}

describe('characterBrainPrivateReferenceMigration', () => {
  it('converts old references into private snapshots and rewrites relation hints to brain refs', () => {
    const result = migrateCharacterBrainImportedReferences({
      documents: [
        createDocument(),
        createDocument({
          documentId: 'doc_north',
          id: 'doc_north',
          stableId: 'doc_north',
          title: '城北',
          summary: '城北摘要',
          content: '# 城北\n\n北城正文。',
          publicCompilePage: {
            summary: '城北编译摘要',
            tags: ['街区'],
            relationHints: ['[[镜庭主城@doc_city]]', '[[未导入单位@doc_missing]]'],
            updatedAt: '2026-05-04T00:00:00.000Z'
          }
        })
      ],
      nodes: [{
        id: 'brain:cognition:node:city',
        title: '镜庭主城',
        summary: '',
        parentId: 'brain:cognition',
        kind: 'reference',
        sourceDocumentId: 'doc_city',
        sourceDisplayPath: '/世界树/镜庭主城.md',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z'
      }, {
        id: 'brain:cognition:node:north',
        title: '城北',
        summary: '',
        parentId: 'brain:cognition',
        kind: 'reference',
        sourceDocumentId: 'doc_north',
        sourceDisplayPath: '/世界树/城北.md',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z'
      }],
      now: '2026-05-04T01:00:00.000Z'
    })

    const city = result.nodes.find((node) => node.id === 'brain:cognition:node:city')
    const north = result.nodes.find((node) => node.id === 'brain:cognition:node:north')

    expect(result.stats).toMatchObject({
      nodesChanged: 2,
      referencesConverted: 2,
      relationHintsRemoved: 1
    })
    expect(city).toMatchObject({
      kind: 'private',
      content: '# 镜庭主城\n\n公共正文。',
      sourceSnapshotTitle: '镜庭主城',
      sourceDetachedAt: '2026-05-04T01:00:00.000Z'
    })
    expect(city?.compilePage?.relationHints).toEqual([
      '[[镜庭主城@brain:cognition:node:city]]_包含_[[城北@brain:cognition:node:north]]'
    ])
    expect(north?.compilePage?.relationHints).toEqual([
      '[[镜庭主城@brain:cognition:node:city]]'
    ])
    expect(result.brainDocuments['brain:cognition:node:city']).toContain('公共正文')
  })

  it('does not resolve exact doc refs by title when the target was not imported', () => {
    const result = migrateCharacterBrainImportedReferences({
      documents: [createDocument()],
      nodes: [{
        id: 'brain:cognition:node:city',
        title: '镜庭主城',
        summary: '',
        parentId: 'brain:cognition',
        kind: 'private',
        compilePage: {
          summary: '私有摘要',
          tags: ['王城'],
          relationHints: ['[[镜庭主城@doc_city]]_包含_[[镜庭主城@doc_missing]]'],
          updatedAt: '2026-05-04T00:00:00.000Z'
        },
        sourceDocumentId: 'doc_city',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z'
      }],
      now: '2026-05-04T01:00:00.000Z'
    })

    expect(result.nodes[0].compilePage?.relationHints).toEqual([])
    expect(result.stats.relationHintsRemoved).toBe(1)
  })
})
