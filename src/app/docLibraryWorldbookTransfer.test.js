import { describe, expect, it } from 'vitest'
import {
  buildWorldbookTransferPayload,
  normalizeWorldbookTransferPayload
} from './docLibraryWorldbookTransfer'
import { buildDocumentNodeId } from './docLibraryTreeMigration'

describe('docLibraryWorldbookTransfer', () => {
  it('exports schemaVersion 2 with field tree rollback data', () => {
    const payload = buildWorldbookTransferPayload({
      documents: [
        createDocument('doc_a', '/世界观/地点/大厅.md'),
        createDocument('doc_b', '/世界观/地点/广场.md')
      ],
      manualTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/地点'],
        '/世界观/地点': ['document:doc_b', 'document:doc_a']
      },
      relationSystemState: createRelationState(),
      exportedAt: '2026-04-27T00:00:00.000Z'
    })

    expect(payload.schemaVersion).toBe(2)
    expect(payload.treeNodes.some((node) => node.nodeId === buildDocumentNodeId('doc_a'))).toBe(true)
    expect(payload.treeOrders).toMatchObject({
      [payload.treeNodes.find((node) => node.title === '地点')?.nodeId || '']: [
        buildDocumentNodeId('doc_b'),
        buildDocumentNodeId('doc_a')
      ]
    })
    expect(payload.legacyDisplayPath).toMatchObject({
      doc_a: '/世界观/地点/大厅.md',
      doc_b: '/世界观/地点/广场.md'
    })
    expect(payload.treeDiffReport.blockerCount).toBe(0)
  })

  it('imports v1 worldbook json by generating a v2 field tree', () => {
    const normalized = normalizeWorldbookTransferPayload({
      kind: 'langhuan-worldbook',
      schemaVersion: 1,
      exportedAt: '2026-04-27T00:00:00.000Z',
      documents: [createDocument('doc_a', '/世界观/地点/大厅.md')],
      manualTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/地点'],
        '/世界观/地点': ['document:doc_a']
      },
      relationSystemState: createRelationState('rel-1')
    })

    expect(normalized.schemaVersion).toBe(2)
    expect(normalized.treeNodes.some((node) => node.nodeId === buildDocumentNodeId('doc_a'))).toBe(true)
    expect(normalized.manualTreeOrders['/世界观/地点']).toEqual(['document:doc_a'])
    expect(normalized.relationSystemState.relationDecisions[0].relationId).toBe('rel-1')
  })

  it('imports v2 worldbook json and derives legacy paths from the field tree', () => {
    const exported = buildWorldbookTransferPayload({
      documents: [createDocument('doc_a', '/世界观/地点/大厅.md')],
      manualTreeOrders: {},
      relationSystemState: createRelationState(),
      exportedAt: '2026-04-27T00:00:00.000Z'
    })
    const documentNode = exported.treeNodes.find((node) => node.documentId === 'doc_a')
    documentNode.legacyDisplayPath = '/世界观/地点/正厅.md'

    const normalized = normalizeWorldbookTransferPayload(exported)

    expect(normalized.documents[0].displayPath).toBe('/世界观/地点/正厅.md')
    expect(normalized.manualTreeOrders['/世界观/地点']).toEqual(['document:doc_a'])
    expect(normalized.treeDiffReport.blockerCount).toBe(0)
  })

  it('rejects v2 imports when field tree audit has blockers', () => {
    const exported = buildWorldbookTransferPayload({
      documents: [createDocument('doc_a', '/世界观/地点/大厅.md')],
      manualTreeOrders: {},
      relationSystemState: createRelationState(),
      exportedAt: '2026-04-27T00:00:00.000Z'
    })
    exported.treeNodes = exported.treeNodes.filter((node) => node.documentId !== 'doc_a')

    expect(() => normalizeWorldbookTransferPayload(exported)).toThrow(/字段树审计未通过/)
  })
})

function createDocument(documentId, displayPath) {
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title: displayPath.split('/').filter(Boolean).at(-1)?.replace(/\.md$/i, '') || documentId,
    displayPath,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '',
    tags: [],
    content: '',
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z'
  }
}

function createRelationState(relationId = '') {
  return {
    predicates: [],
    relationDecisions: relationId
      ? [{
          relationId,
          status: 'confirmed',
          predicateId: 'related',
          updatedAt: '2026-04-27T00:00:00.000Z'
        }]
      : [],
    updatedAt: '2026-04-27T00:00:00.000Z'
  }
}
