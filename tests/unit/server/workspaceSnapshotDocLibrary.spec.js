import { describe, expect, it, vi } from 'vitest'
import { readCharacterSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/readCharacters.js'
import { applyCharacterSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/restoreCharacters.js'

describe('workspace snapshot doc library field tree', () => {
  it('restores character private soul document fields through character partition rows', () => {
    const characterRepository = createCharacterRepository()
    applyCharacterSnapshotPartition(characterRepository, {
      characters: [{
        id: 'char_1',
        name: '星依',
        brainCognitionNodes: [{
          id: 'brain:cognition:node:overview',
          title: '地点私有概览',
          summary: '私有地点摘要',
          parentId: 'brain:cognition',
          kind: 'group',
          content: '角色自己的地点理解。',
          tags: ['私有目录'],
          relationHints: ['[[城北]]'],
          compilePage: {
            summary: '私有地点摘要',
            tags: ['私有目录'],
            relationHints: ['[[城北]]'],
            updatedAt: '2026-04-27T00:00:00.000Z'
          },
          sourceDocumentId: 'doc_index',
          sourceDisplayPath: '/世界树/亚什基诺/地点',
          sourceDetachedAt: '2026-04-27T01:00:00.000Z',
          sourceSnapshotTitle: '地点',
          sourceSnapshotSummary: '地点目录摘要',
          createdAt: '2026-04-27T00:00:00.000Z',
          updatedAt: '2026-04-27T01:00:00.000Z'
        }]
      }]
    }, createDocLibraryRepository())

    expect(characterRepository.replaceCharacters).toHaveBeenCalledTimes(1)
    const rows = characterRepository.replaceCharacters.mock.calls[0][0]
    const restoredNodes = JSON.parse(rows[0][30])
    expect(restoredNodes[0]).toEqual(expect.objectContaining({
      content: '角色自己的地点理解。',
      sourceDocumentId: 'doc_index',
      sourceDetachedAt: '2026-04-27T01:00:00.000Z',
      sourceSnapshotSummary: '地点目录摘要'
    }))
    expect(restoredNodes[0].compilePage).toEqual(expect.objectContaining({
      summary: '私有地点摘要',
      relationHints: ['[[城北]]']
    }))
    expect(rows[0].at(-1)).toBe('')
  })

  it('exports character private soul document fields from character rows', () => {
    const privateNode = {
      id: 'brain:cognition:node:overview',
      title: '地点私有概览',
      summary: '私有地点摘要',
      parentId: 'brain:cognition',
      kind: 'group',
      content: '角色自己的地点理解。',
      tags: ['私有目录'],
      relationHints: ['[[城北]]'],
      compilePage: {
        summary: '私有地点摘要',
        tags: ['私有目录'],
        relationHints: ['[[城北]]'],
        updatedAt: '2026-04-27T00:00:00.000Z'
      },
      sourceDocumentId: 'doc_index',
      sourceDetachedAt: '2026-04-27T01:00:00.000Z',
      sourceSnapshotTitle: '地点',
      sourceSnapshotSummary: '地点目录摘要',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T01:00:00.000Z'
    }
    const partition = readCharacterSnapshotPartition({
      ...createCharacterRepository(),
      getCharacters: vi.fn(() => [{
        id: 'char_1',
        name: '星依',
        brainCognitionNodes: [privateNode],
        brain_cognition_nodes: JSON.stringify([privateNode])
      }])
    }, createDocLibraryRepository())

    expect(partition.characters[0].brainCognitionNodes[0]).toEqual(expect.objectContaining({
      content: '角色自己的地点理解。',
      sourceDocumentId: 'doc_index',
      sourceSnapshotTitle: '地点'
    }))
    expect(partition.characters[0].brainCognitionNodes[0].compilePage.tags).toEqual(['私有目录'])
  })

  it('keeps personality kernel in character snapshot restore rows', () => {
    const kernel = {
      characterId: 'char_1',
      version: 1,
      sourceTextHash: 'hash_a',
      stableSummary: '稳定摘要',
      guardDimensions: [],
      reactionPolicies: []
    }
    const characterRepository = createCharacterRepository()

    applyCharacterSnapshotPartition(characterRepository, {
      characters: [{
        id: 'char_1',
        name: '星依',
        personalityKernel: kernel
      }]
    }, createDocLibraryRepository())

    const rows = characterRepository.replaceCharacters.mock.calls[0][0]
    expect(rows[0].at(-1)).toBe(JSON.stringify(kernel))
  })

  it('exports doc library field tree fields with the workspace snapshot', () => {
    const partition = readCharacterSnapshotPartition(createCharacterRepository(), {
      getDocuments: vi.fn(() => [createDocument('doc_a', '/世界观/地点/大厅.md')]),
      getManualTreeOrders: vi.fn(() => ({ '/世界观/地点': ['document:doc_a'] })),
      getSchemaVersion: vi.fn(() => 2),
      getTreeNodes: vi.fn(() => [{ nodeId: 'doc:doc_a', nodeKind: 'document', parentId: 'folder_a', title: '大厅', documentId: 'doc_a' }]),
      getTreeOrders: vi.fn(() => ({ folder_a: ['doc:doc_a'] })),
      getTreeMigrationMeta: vi.fn(() => ({ treeSource: 'field', hasBlockingIssues: false })),
      getTreeDiffReport: vi.fn(() => ({ blockerCount: 0, canUseFieldTree: true })),
      getRelationSystemState: vi.fn(() => ({ predicates: [], relationDecisions: [{ relationId: 'rel_a', status: 'confirmed', updatedAt: '2026-04-27T00:00:00.000Z' }] }))
    })

    expect(partition.documents).toHaveLength(1)
    expect(partition.documentTreeOrders).toEqual({ '/世界观/地点': ['document:doc_a'] })
    expect(partition.docLibrarySchemaVersion).toBe(2)
    expect(partition.docLibraryTreeNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: 'doc_a' })
    ]))
    expect(partition.docLibraryTreeOrders).toEqual({ folder_a: ['doc:doc_a'] })
    expect(partition.docLibraryRelationSystemState.relationDecisions[0].relationId).toBe('rel_a')
  })

  it('restores old snapshots by generating field tree data', () => {
    const docRepository = createDocLibraryRepository()
    applyCharacterSnapshotPartition(createCharacterRepository(), {
      documents: [createDocument('doc_a', '/世界观/地点/大厅.md')],
      documentTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/地点'],
        '/世界观/地点': ['document:doc_a']
      }
    }, docRepository)

    expect(docRepository.replaceDocuments).toHaveBeenCalledTimes(1)
    expect(docRepository.replaceSchemaVersion).toHaveBeenCalledWith(2)
    expect(docRepository.replaceTreeNodes.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: 'doc_a' })
    ]))
    const placeNodeId = 'doc-tree:%2F%E4%B8%96%E7%95%8C%E8%A7%82%2F%E5%9C%B0%E7%82%B9'.replace(/%/g, '~')
    expect(docRepository.replaceTreeOrders.mock.calls[0][0]).toEqual(expect.objectContaining({
      [placeNodeId]: ['doc:doc_a']
    }))
    expect(docRepository.replaceTreeDiffReport.mock.calls[0][0]).toEqual(expect.objectContaining({
      blockerCount: 0,
      canUseFieldTree: true
    }))
  })

  it('rejects new snapshots when stored field tree cannot restore documents', () => {
    const docRepository = createDocLibraryRepository()

    expect(() => applyCharacterSnapshotPartition(createCharacterRepository(), {
      documents: [createDocument('doc_a', '/世界观/地点/大厅.md')],
      documentTreeOrders: {},
      docLibrarySchemaVersion: 2,
      docLibraryTreeNodes: [{
        nodeId: 'doc-tree:root',
        nodeKind: 'root',
        parentId: null,
        title: '世界树',
        status: 'active',
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z'
      }],
      docLibraryTreeOrders: {}
    }, docRepository)).toThrow()

    expect(docRepository.replaceDocuments).not.toHaveBeenCalled()
  })
})

function createCharacterRepository() {
  return {
    getCharacters: vi.fn(() => []),
    getCharacterGroups: vi.fn(() => []),
    getGroups: vi.fn(() => []),
    getCrowds: vi.fn(() => []),
    getAliases: vi.fn(() => []),
    getUserProfile: vi.fn(() => null),
    getBrainNeurons: vi.fn(() => []),
    replaceCharacterGroups: vi.fn(),
    replaceCharacters: vi.fn(),
    replaceGroups: vi.fn(),
    replaceCrowds: vi.fn(),
    replaceAliases: vi.fn(),
    replaceUserProfile: vi.fn(),
    replaceBrainNeurons: vi.fn()
  }
}

function createDocLibraryRepository() {
  return {
    getDocuments: vi.fn(() => []),
    getManualTreeOrders: vi.fn(() => ({})),
    getSchemaVersion: vi.fn(() => 1),
    getTreeNodes: vi.fn(() => []),
    getTreeOrders: vi.fn(() => ({})),
    getTreeMigrationMeta: vi.fn(() => null),
    getTreeDiffReport: vi.fn(() => null),
    getRelationSystemState: vi.fn(() => ({})),
    replaceDocuments: vi.fn(),
    replaceManualTreeOrders: vi.fn(),
    replaceSchemaVersion: vi.fn(),
    replaceTreeNodes: vi.fn(),
    replaceTreeOrders: vi.fn(),
    replaceTreeMigrationMeta: vi.fn(),
    replaceTreeDiffReport: vi.fn(),
    replaceRelationSystemState: vi.fn()
  }
}

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
