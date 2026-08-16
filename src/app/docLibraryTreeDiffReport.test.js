import { describe, expect, it } from 'vitest'
import { buildDocLibraryTreeDiffReport } from './docLibraryTreeDiffReport'
import { pathTreeToFieldTree } from './docLibraryTreeMigration'

describe('buildDocLibraryTreeDiffReport', () => {
  it('reports a clean diff when field tree can restore legacy paths and orders', () => {
    const documents = [
      createDocument('doc_world', '/世界观/index.md'),
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const manualTreeOrders = {
      __root__: ['folder:/世界观'],
      '/世界观': ['folder:/世界观/地点', 'document:doc_world'],
      '/世界观/地点': ['document:doc_hall']
    }
    const fieldTree = pathTreeToFieldTree({ documents, manualTreeOrders })

    const report = buildDocLibraryTreeDiffReport({
      documents,
      manualTreeOrders,
      treeNodes: fieldTree.treeNodes,
      treeOrders: fieldTree.treeOrders
    })

    expect(report.canUseFieldTree).toBe(true)
    expect(report.blockerCount).toBe(0)
    expect(report.documentPathMismatchCount).toBe(0)
    expect(report.manualOrderMismatchCount).toBe(0)
  })

  it('reports blockers when field tree restores a different document path', () => {
    const documents = [
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const manualTreeOrders = {
      __root__: ['folder:/世界观'],
      '/世界观': ['folder:/世界观/地点'],
      '/世界观/地点': ['document:doc_hall']
    }
    const fieldTree = pathTreeToFieldTree({ documents, manualTreeOrders })
    const mutatedNodes = fieldTree.treeNodes.map((node) => (
      node.documentId === 'doc_hall'
        ? { ...node, legacyDisplayPath: '/世界观/地点/偏移.md' }
        : node
    ))

    const report = buildDocLibraryTreeDiffReport({
      documents,
      manualTreeOrders,
      treeNodes: mutatedNodes,
      treeOrders: fieldTree.treeOrders
    })

    expect(report.canUseFieldTree).toBe(false)
    expect(report.blockerCount).toBeGreaterThan(0)
    expect(report.documentPathMismatchCount).toBe(1)
    expect(report.issues[0]).toMatchObject({
      code: 'document_path_mismatch',
      documentId: 'doc_hall'
    })
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
