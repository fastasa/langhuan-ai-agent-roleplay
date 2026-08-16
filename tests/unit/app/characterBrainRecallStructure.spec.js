import { describe, expect, it } from 'vitest'
import {
  applyDocLibraryRecallStructureToCards,
  buildDocLibraryRecallStructureView
} from '../../../src/app/characterBrainRecallStructure'
import { buildDocumentNodeId, buildFolderNodeId, pathTreeToFieldTree } from '../../../src/app/docLibraryTreeMigration'

describe('characterBrainRecallStructure', () => {
  it('从字段树生成只读召回结构视图并保留可读路径', () => {
    const documents = [
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })

    const view = buildDocLibraryRecallStructureView(documents, {
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 },
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    const documentNode = view.nodes.find((node) => node.sourceDocumentId === 'doc_hall')

    expect(view.treeSource).toBe('fieldTree')
    expect(documentNode).toMatchObject({
      runtimeId: buildDocumentNodeId('doc_hall'),
      parentRuntimeId: buildFolderNodeId('/世界观/地点'),
      depth: 3,
      pathText: '/世界观/地点/大厅.md',
      treeSource: 'fieldTree'
    })
  })

  it('把候选卡标注为字段树来源但不改变文档单位身份', () => {
    const documents = [
      createDocument('doc_hall', '/世界观/地点/大厅.md')
    ]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    converted.treeNodes
      .filter((node) => node.nodeKind === 'folder' && node.legacyDisplayPath === '/世界观/地点')
      .forEach((node) => {
        node.nodeId = 'folder:stable-place'
      })
    converted.treeNodes
      .filter((node) => node.parentId === buildFolderNodeId('/世界观/地点'))
      .forEach((node) => {
        node.parentId = 'folder:stable-place'
      })
    converted.treeOrders['folder:stable-place'] = [buildDocumentNodeId('doc_hall')]
    delete converted.treeOrders[buildFolderNodeId('/世界观/地点')]

    const view = buildDocLibraryRecallStructureView(documents, {
      treeNodes: converted.treeNodes,
      treeOrders: converted.treeOrders,
      treeDiffReport: { canUseFieldTree: true, blockerCount: 0 }
    })
    const cards = applyDocLibraryRecallStructureToCards([createCard()], view)

    expect(cards[0].id).toBe('brain:cognition:node:ref')
    expect(cards[0].p).toBe('/世界观/地点/大厅.md')
    expect(cards[0].parentRuntimeId).toBe('folder:stable-place')
    expect(cards[0].treeSource).toBe('fieldTree')
    expect(cards[0].evidenceReasons).toContain('tree:fieldTree')
  })
})

function createDocument(documentId, displayPath) {
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
    updatedAt: '2026-04-27T00:00:00.000Z'
  }
}

function createCard() {
  return {
    id: 'brain:cognition:node:ref',
    k: 'public_compile_page',
    p: '/旧路径/大厅.md',
    t: '大厅',
    s: '大厅摘要',
    tags: ['地点'],
    u: '2026-04-27T00:00:00.000Z',
    src: ['doc_hall'],
    relationHints: [],
    relatedNodeIds: [],
    isRecallable: true
  }
}
