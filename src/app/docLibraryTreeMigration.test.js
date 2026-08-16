import { describe, expect, it } from 'vitest'
import {
  DOC_TREE_ROOT_NODE_ID,
  buildDocumentNodeId,
  buildFolderNodeId,
  fieldTreeToPathTree,
  normalizeDocLibraryV1ToV2,
  normalizeDocLibraryV2ToV1Compat,
  pathTreeToFieldTree
} from './docLibraryTreeMigration'

describe('docLibraryTreeMigration', () => {
  it('converts a path tree to field nodes without changing document identities', () => {
    const documents = [
      createDocument('doc_root', '/根文档.md'),
      createDocument('doc_world', '/世界观/index.md'),
      createDocument('doc_hall', '/世界观/地点/大厅.md'),
      createDocument('doc_other_hall', '/其他/地点/大厅.md')
    ]
    const manualTreeOrders = {
      __root__: ['folder:/世界观', 'document:doc_root', 'folder:/其他'],
      '/世界观': ['folder:/世界观/地点', 'document:doc_world'],
      '/世界观/地点': ['document:doc_hall'],
      '/其他': ['folder:/其他/地点'],
      '/其他/地点': ['document:doc_other_hall']
    }

    const result = pathTreeToFieldTree({
      documents,
      manualTreeOrders,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    expect(result.treeMigrationMeta).toMatchObject({
      treeSource: 'path',
      hasBlockingIssues: false
    })
    expect(result.treeNodes.some((node) => node.nodeId === DOC_TREE_ROOT_NODE_ID && node.nodeKind === 'root')).toBe(true)
    expect(result.treeNodes.some((node) => node.nodeId === buildDocumentNodeId('doc_hall'))).toBe(true)
    expect(result.treeNodes.some((node) => node.nodeId === buildDocumentNodeId('doc_other_hall'))).toBe(true)
    expect(result.treeNodes.some((node) => node.nodeId === buildFolderNodeId('/世界观/地点'))).toBe(true)
    expect(result.treeNodes.some((node) => node.nodeId === buildFolderNodeId('/其他/地点'))).toBe(true)

    const worldFolder = result.treeNodes.find((node) => node.nodeId === buildFolderNodeId('/世界观'))
    expect(worldFolder).toMatchObject({
      nodeKind: 'folder',
      overviewDocumentId: 'doc_world'
    })
    expect(result.treeOrders[DOC_TREE_ROOT_NODE_ID]).toEqual([
      buildFolderNodeId('/世界观'),
      buildDocumentNodeId('doc_root'),
      buildFolderNodeId('/其他')
    ])
    expect(result.treeOrders[buildFolderNodeId('/世界观')]).toEqual([
      buildFolderNodeId('/世界观/地点'),
      buildDocumentNodeId('doc_world')
    ])
  })

  it('roundtrips v1 snapshots through v2 while preserving legacy orders', () => {
    const snapshot = {
      documents: [
        createDocument('doc_a', '/世界观/地点/大厅.md'),
        createDocument('doc_b', '/世界观/组织/大厅.md')
      ],
      manualTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/组织', 'folder:/世界观/地点'],
        '/世界观/地点': ['document:doc_a'],
        '/世界观/组织': ['document:doc_b']
      },
      relationSystemState: createRelationState()
    }

    const v2 = normalizeDocLibraryV1ToV2(snapshot, {
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    const v1Compat = normalizeDocLibraryV2ToV1Compat(v2)

    expect(v2.schemaVersion).toBe(2)
    expect(v2.treeNodes?.some((node) => node.nodeId === buildDocumentNodeId('doc_a'))).toBe(true)
    expect(v1Compat.schemaVersion).toBe(1)
    expect(v1Compat.documents.map((document) => document.displayPath)).toEqual(snapshot.documents.map((document) => document.displayPath))
    expect(v1Compat.manualTreeOrders).toEqual(snapshot.manualTreeOrders)
    expect(v1Compat.relationSystemState).toBe(snapshot.relationSystemState)
  })

  it('derives path orders from field orders when no legacy order is supplied', () => {
    const documents = [
      createDocument('doc_a', '/世界观/地点/大厅.md'),
      createDocument('doc_b', '/世界观/地点/广场.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    const pathTree = fieldTreeToPathTree({
      documents,
      treeNodes: converted.treeNodes,
      treeOrders: {
        [DOC_TREE_ROOT_NODE_ID]: [buildFolderNodeId('/世界观')],
        [buildFolderNodeId('/世界观')]: [buildFolderNodeId('/世界观/地点')],
        [buildFolderNodeId('/世界观/地点')]: [
          buildDocumentNodeId('doc_b'),
          buildDocumentNodeId('doc_a')
        ]
      }
    })

    expect(pathTree.documents.map((document) => document.displayPath)).toEqual([
      '/世界观/地点/大厅.md',
      '/世界观/地点/广场.md'
    ])
    expect(pathTree.manualTreeOrders['/世界观/地点']).toEqual([
      'document:doc_b',
      'document:doc_a'
    ])
  })

  it('blocks conversion when the shadow audit finds duplicate display paths', () => {
    expect(() => pathTreeToFieldTree({
      documents: [
        createDocument('doc_a', '/世界观/地点/大厅.md'),
        createDocument('doc_b', '/世界观/地点/大厅.md')
      ],
      generatedAt: '2026-04-27T00:00:00.000Z'
    })).toThrow(/字段树转换前存在阻断项/)
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

function createRelationState() {
  return {
    predicates: [],
    relationCandidates: [],
    relations: [],
    updatedAt: '2026-04-27T00:00:00.000Z'
  }
}
