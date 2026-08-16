import { describe, expect, it } from 'vitest'
import {
  buildDocLibraryUnitView,
  buildDocLibraryUnitViewComparisonReport
} from './unitViewAdapters'
import {
  buildFolderNodeId,
  pathTreeToFieldTree
} from './docLibraryTreeMigration'

describe('buildDocLibraryUnitView field tree source', () => {
  it('keeps document unit ids while reading parents from field tree', () => {
    const documents = [
      createDocument('doc_hall', '/世界观/地点/大厅.md'),
      createDocument('doc_gate', '/世界观/地点/城门.md')
    ]
    const manualTreeOrders = {
      __root__: ['folder:/世界观'],
      '/世界观': ['folder:/世界观/地点'],
      '/世界观/地点': ['document:doc_gate', 'document:doc_hall']
    }
    const converted = pathTreeToFieldTree({
      documents,
      manualTreeOrders,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    const result = buildDocLibraryUnitView(documents, manualTreeOrders, {
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 }
    })
    const hall = result.units.find((unit) => unit.sourceId === 'doc_hall')
    const folder = result.units.find((unit) => unit.sourcePath === '/世界观/地点')

    expect(hall?.unitId).toBe('doc:doc_hall')
    expect(hall?.parentId).toBe(buildFolderNodeId('/世界观/地点'))
    expect(hall?.metadata?.treeSource).toBe('fieldTree')
    expect(folder?.unitId).toBe(buildFolderNodeId('/世界观/地点'))
    expect(folder?.sourceId).toBe(buildFolderNodeId('/世界观/地点'))
    expect(result.relations.some((relation) => (
      relation.sourceUnitId === buildFolderNodeId('/世界观/地点')
      && relation.targetUnitId === 'doc:doc_hall'
      && relation.status === 'projection'
    ))).toBe(true)
  })

  it('uses stable folder node ids even when legacy paths would create different ids', () => {
    const documents = [
      createDocument('doc_hall', '/旧世界/大厅.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    const folderNode = converted.treeNodes.find((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/旧世界')
    folderNode.nodeId = 'folder:stable-world'
    converted.treeOrders['folder:stable-world'] = converted.treeOrders[buildFolderNodeId('/旧世界')]
    converted.treeOrders['doc-tree:root'] = ['folder:stable-world']
    delete converted.treeOrders[buildFolderNodeId('/旧世界')]
    converted.treeNodes
      .filter((node) => node.parentId === buildFolderNodeId('/旧世界'))
      .forEach((node) => {
        node.parentId = 'folder:stable-world'
      })

    const result = buildDocLibraryUnitView(documents, {}, {
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 }
    })

    expect(result.units.find((unit) => unit.sourcePath === '/旧世界')?.unitId).toBe('folder:stable-world')
    expect(result.units.find((unit) => unit.sourceId === 'doc_hall')?.parentId).toBe('folder:stable-world')
  })

  it('attaches index.md overview documents to folder units instead of exposing duplicate leaves', () => {
    const documents = [
      createDocument('doc_index', '/世界观/地点/index.md', {
        title: '地点',
        content: '地点目录概览正文',
        publicCompilePage: {
          summary: '地点目录摘要',
          tags: ['目录'],
          relationHints: ['[[大厅]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-27T00:00:00.000Z'
        }
      }),
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    const result = buildDocLibraryUnitView(documents, {}, {
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 }
    })
    const folder = result.units.find((unit) => unit.sourcePath === '/世界观/地点')

    expect(result.units.some((unit) => unit.sourceId === 'doc_index')).toBe(false)
    expect(folder).toMatchObject({
      contentKind: 'group',
      body: '地点目录概览正文',
      compilePage: {
        summary: '地点目录摘要',
        tags: ['目录'],
        relationHints: ['[[大厅]]']
      },
      metadata: {
        overviewDocumentId: 'doc_index'
      }
    })
  })

  it('reports blockers when document ids change across the comparison', () => {
    const documents = [
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    converted.treeNodes
      .filter((node) => node.nodeKind === 'document')
      .forEach((node) => {
        node.documentId = 'doc_changed'
      })

    const report = buildDocLibraryUnitViewComparisonReport({
      documents,
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 },
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    expect(report.summary.blockerCount).toBeGreaterThan(0)
    expect(report.issues.some((issue) => issue.code === 'document_unit_missing')).toBe(true)
  })
})

function createDocument(documentId, displayPath, overrides = {}) {
  const title = displayPath.split('/').filter(Boolean).pop()?.replace(/\.md$/i, '') || documentId
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title,
    displayPath,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: `${title} 摘要`,
    tags: [title],
    content: `${title} 正文`,
    publicCompilePage: {
      summary: `${title} 编译摘要`,
      tags: [title],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-27T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
    ...overrides
  }
}
