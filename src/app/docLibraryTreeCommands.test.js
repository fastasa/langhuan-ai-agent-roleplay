import { describe, expect, it } from 'vitest'
import {
  applyDocLibraryTreeCommand,
  buildDocLibraryTreeCommandResult,
  toLegacyPathTreeSnapshot
} from './docLibraryTreeCommands'
import { buildDocumentNodeId, buildFolderNodeId } from './docLibraryTreeMigration'

describe('docLibraryTreeCommands', () => {
  it('builds a field-tree result for the current legacy world tree state', () => {
    const result = buildDocLibraryTreeCommandResult(createState())

    expect(result.schemaVersion).toBe(2)
    expect(result.command).toBe('rebuild_field_tree')
    expect(result.commandAudit).toMatchObject({ ok: true, blockerCount: 0 })
    expect(result.treeMigrationMeta?.treeSource).toBe('field')
    expect(result.treeDiffReport).toMatchObject({ canUseFieldTree: true, blockerCount: 0 })
    expect(result.treeNodes?.some((node) => node.nodeId === buildDocumentNodeId('doc_hall'))).toBe(true)
    expect(result.treeOrders?.[buildFolderNodeId('/世界观/地点')]).toEqual([
      buildDocumentNodeId('doc_hall')
    ])
  })

  it('renames a folder through field tree while keeping the folder node identity stable', () => {
    const originalFolderNodeId = buildFolderNodeId('/世界观/地点')
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'rename_folder',
      sourcePath: '/世界观/地点',
      targetPath: '/世界观/场所'
    })

    expect(result.schemaVersion).toBe(2)
    expect(result.documents.find((document) => document.documentId === 'doc_hall')?.displayPath).toBe('/世界观/场所/大厅.md')
    expect(result.manualTreeOrders['/世界观']).toEqual(['folder:/世界观/场所', 'document:doc_world'])
    expect(result.manualTreeOrders['/世界观/场所']).toEqual(['document:doc_hall'])
    expect(result.treeNodes?.some((node) => node.nodeId === originalFolderNodeId)).toBe(true)
    expect(result.treeNodes?.some((node) => node.nodeId === buildFolderNodeId('/世界观/场所'))).toBe(false)
    expect(result.treeMigrationMeta?.treeSource).toBe('field')
  })

  it('creates nested documents under a renamed folder without recreating the old path as a duplicate folder', () => {
    const originalFolderNodeId = buildFolderNodeId('/世界观/地点')
    const renamed = applyDocLibraryTreeCommand(createState(), {
      type: 'rename_folder',
      sourcePath: '/世界观/地点',
      targetPath: '/世界观/场所'
    })
    const result = applyDocLibraryTreeCommand(renamed, {
      type: 'upsert_document',
      document: createDocument('doc_nested', '/世界观/场所/东厅/壁画.md'),
      parentFolderId: '/世界观/场所/东厅'
    })

    expect(result.treeNodes?.some((node) => node.nodeId === originalFolderNodeId)).toBe(true)
    expect(result.treeNodes?.some((node) => node.nodeId === buildFolderNodeId('/世界观/场所'))).toBe(false)
    expect(result.treeNodes?.filter((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/场所')).toHaveLength(1)
    // 止血（2026-07-04）：新建文件夹发稳定短码 nodeId（doc-tree:f-…），不再从中文路径编码派生。
    const eastHallNode = result.treeNodes?.find((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/场所/东厅')
    expect(eastHallNode).toBeTruthy()
    expect(eastHallNode.nodeId).toMatch(/^doc-tree:f-/)
    expect(eastHallNode.nodeId).not.toContain('~')
    expect(result.treeOrders?.[originalFolderNodeId]).toContain(eastHallNode.nodeId)
    expect(result.documents.find((document) => document.documentId === 'doc_nested')?.displayPath).toBe('/世界观/场所/东厅/壁画.md')
  })

  it('sorts children while preserving legacy rollback output', () => {
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'sort_children',
      parentFolderId: '/世界观',
      childEntryIds: ['document:doc_world', 'folder:/世界观/地点']
    })
    const legacy = toLegacyPathTreeSnapshot(result)

    expect(result.manualTreeOrders['/世界观']).toEqual(['document:doc_world', 'folder:/世界观/地点'])
    expect(legacy.schemaVersion).toBe(1)
    expect(legacy.manualTreeOrders['/世界观']).toEqual(['document:doc_world', 'folder:/世界观/地点'])
  })

  it('keeps an existing document in place when saving content in the same parent', () => {
    const sorted = applyDocLibraryTreeCommand(createState(), {
      type: 'sort_children',
      parentFolderId: '/世界观',
      childEntryIds: ['document:doc_world', 'folder:/世界观/地点']
    })
    const result = applyDocLibraryTreeCommand(sorted, {
      type: 'upsert_document',
      document: {
        ...createDocument('doc_world', '/世界观/index.md'),
        content: '已修改正文',
        updatedAt: '2026-05-01T00:00:00.000Z'
      },
      parentFolderId: '/世界观'
    })

    expect(result.manualTreeOrders['/世界观']).toEqual(['document:doc_world', 'folder:/世界观/地点'])
    expect(result.treeOrders?.[buildFolderNodeId('/世界观')]).toEqual([
      buildDocumentNodeId('doc_world'),
      buildFolderNodeId('/世界观/地点')
    ])
  })

  it('creates a document through a field-tree command and derives legacy path output', () => {
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'upsert_document',
      document: createDocument('doc_new', '/角色资料/星依/核心/简介.md'),
      parentFolderId: '/角色资料/星依/核心'
    })

    expect(result.command).toBe('upsert_document')
    expect(result.documents.find((document) => document.documentId === 'doc_new')?.displayPath).toBe('/角色资料/星依/核心/简介.md')
    expect(result.treeNodes?.some((node) => (
      node.nodeKind === 'document'
        && node.nodeId === buildDocumentNodeId('doc_new')
        && node.documentId === 'doc_new'
    ))).toBe(true)
    // 止血（2026-07-04）：新建的父文件夹链发稳定短码 nodeId，按 legacyDisplayPath 定位再断言挂载。
    const parentNode = result.treeNodes?.find((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/角色资料/星依/核心')
    expect(parentNode).toBeTruthy()
    expect(parentNode.nodeId).toMatch(/^doc-tree:f-/)
    expect(result.treeOrders?.[parentNode.nodeId]).toContain(buildDocumentNodeId('doc_new'))
  })

  it('moves a document by changing its field-tree parent before deriving displayPath', () => {
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'move_documents',
      documentIds: ['doc_hall'],
      parentFolderId: '/世界观'
    })

    expect(result.command).toBe('move_documents')
    expect(result.documents.find((document) => document.documentId === 'doc_hall')?.displayPath).toBe('/世界观/大厅.md')
    expect(result.treeOrders?.[buildFolderNodeId('/世界观')]).toContain(buildDocumentNodeId('doc_hall'))
  })

  it('creates an empty folder chain via create_folder without attaching a document', () => {
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'create_folder',
      folderPath: '/世界观/势力/北境'
    })

    expect(result.command).toBe('create_folder')
    expect(result.commandAudit.ok).toBe(true)
    const folderNodes = (result.treeNodes || []).filter((node) => node.nodeKind === 'folder')
    expect(folderNodes.some((node) => node.legacyDisplayPath === '/世界观/势力')).toBe(true)
    expect(folderNodes.some((node) => node.legacyDisplayPath === '/世界观/势力/北境')).toBe(true)
    // 不附带任何新文档
    expect(result.documents).toHaveLength(2)
  })

  it('keeps create_folder idempotent for an existing folder', () => {
    const result = applyDocLibraryTreeCommand(createState(), { type: 'create_folder', folderPath: '/世界观/地点' })

    expect(result.commandAudit.ok).toBe(true)
    const matched = (result.treeNodes || []).filter((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/地点')
    expect(matched).toHaveLength(1)
  })

  it('marks command output as blocked when duplicate display paths remain', () => {
    const result = applyDocLibraryTreeCommand(createState(), {
      type: 'replace_documents',
      documents: [
        createDocument('doc_a', '/世界观/地点/大厅.md'),
        createDocument('doc_b', '/世界观/地点/大厅.md')
      ]
    })

    expect(result.schemaVersion).toBe(1)
    expect(result.commandAudit.ok).toBe(false)
    expect(result.treeDiffReport?.canUseFieldTree).toBe(false)
    expect(result.treeMigrationMeta?.hasBlockingIssues).toBe(true)
  })
})

function createState() {
  return {
    documents: [
      createDocument('doc_world', '/世界观/index.md'),
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ],
    manualTreeOrders: {
      __root__: ['folder:/世界观'],
      '/世界观': ['folder:/世界观/地点', 'document:doc_world'],
      '/世界观/地点': ['document:doc_hall']
    },
    relationSystemState: {
      predicates: [],
      relationDecisions: []
    }
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
