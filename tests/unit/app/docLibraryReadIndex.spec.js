import { describe, expect, it } from 'vitest'
import {
  buildDirectChildFolderNameIndex,
  buildDocumentTreeNodeIdIndex,
  collectDocLibraryAncestorFolderMatches,
  findDeepestDocLibraryFolderPrefix,
  orderDocLibraryTreeChildNodeIds
} from '../../../src/app/docLibraryReadIndex.ts'

describe('docLibraryReadIndex', () => {
  it('一次建立文档节点索引并保持显式顺序、未知项稳定兜底', () => {
    const documentIndex = buildDocumentTreeNodeIdIndex([
      { nodeId: 'doc-node-b', nodeKind: 'document', documentId: 'doc_b' },
      { nodeId: 'folder-a', nodeKind: 'folder' },
      { nodeId: 'doc-node-a', nodeKind: 'document', documentId: 'doc_a' }
    ])

    expect(orderDocLibraryTreeChildNodeIds({
      parentNodeId: 'folder-root',
      folderNodeIds: ['folder-z', 'folder-a'],
      documentIds: ['doc_a', 'doc_b', 'doc_unknown'],
      treeOrders: { 'folder-root': ['doc-node-b', 'folder-a'] },
      documentTreeNodeIdByDocumentId: documentIndex
    })).toEqual(['doc-node-b', 'folder-a', 'doc-node-a', 'doc:doc_unknown', 'folder-z'])
  })

  it('按路径段向祖先索引查找，不把同名前缀误判成子目录', () => {
    const selected = new Set(['/世界/地点', '/世界', '/世界/地'])
    expect(collectDocLibraryAncestorFolderMatches('/世界/地点/港口/灯塔.md', selected)).toEqual(['/世界/地点', '/世界'])
    expect(collectDocLibraryAncestorFolderMatches('/世界/地点站/说明.md', selected)).toEqual(['/世界'])

    const moves = new Map([
      ['/世界', '/目标/世界'],
      ['/世界/地点', '/目标/地点']
    ])
    expect(findDeepestDocLibraryFolderPrefix('/世界/地点/港口.md', moves)).toBe('/世界/地点')
    expect(findDeepestDocLibraryFolderPrefix('/别处/港口.md', moves)).toBe('')
  })

  it('大量目录单遍构建直属子目录集合并按 id 去重', () => {
    const folders = []
    for (let index = 0; index < 4000; index += 1) {
      folders.push({ id: `folder_${index}`, parentFolderPath: `/世界/${index % 40}`, folderPath: `/世界/${index % 40}/子项_${index}` })
    }
    folders.push({ ...folders[0] })

    const index = buildDirectChildFolderNameIndex(folders)

    expect(index.size).toBe(40)
    expect(index.get('/世界/0').size).toBe(100)
    expect(index.get('/世界/0').has('子项_0')).toBe(true)
  })
})
