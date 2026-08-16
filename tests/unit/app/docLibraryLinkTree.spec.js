import { describe, expect, it } from 'vitest'
import {
  applyDocLibraryLinkRowCollapse,
  buildDocLibraryLinkTreeRows,
  docLinkRowSelectionState,
  filterDocLibraryLinkTreeRows,
  toggleDocLinkRow
} from '../../../src/app/docLibraryLinkTree'

const ROOT = 'doc-tree:root'

function folderUnit(unitId, parentId, title, options = {}) {
  return {
    unitId,
    domain: 'docLibrary',
    unitType: parentId === ROOT ? 'cluster' : 'branch',
    contentKind: 'group',
    title,
    parentId,
    orderIndex: options.orderIndex,
    sourceId: unitId,
    sourcePath: options.path || `/${title}`,
    status: 'normal',
    metadata: { overviewDocumentId: options.overviewDocumentId }
  }
}

function leafUnit(unitId, parentId, title, documentId, options = {}) {
  return {
    unitId,
    domain: 'docLibrary',
    unitType: 'leaf',
    contentKind: 'markdown',
    title,
    parentId,
    orderIndex: options.orderIndex,
    sourceId: documentId,
    sourcePath: options.path || `/${title}.md`,
    status: 'normal',
    metadata: options.omitDocumentIdMeta ? {} : { documentId }
  }
}

function rootUnit() {
  return {
    unitId: ROOT,
    domain: 'docLibrary',
    unitType: 'root',
    contentKind: 'group',
    title: '世界树',
    status: 'normal'
  }
}

// 世界树样例：
// 亚什基诺（概览 ov-1）
//   ├─ 地理（无概览）
//   │    ├─ 北境.md (doc-north)
//   │    └─ 南港.md (doc-south)
//   └─ 人物志.md (doc-people)
// 散文档.md (doc-loose，挂根)
// 空文件夹（无概览无后代）
function sampleUnits() {
  return [
    rootUnit(),
    folderUnit('node-city', ROOT, '亚什基诺', { overviewDocumentId: 'ov-1', orderIndex: 0 }),
    folderUnit('node-geo', 'node-city', '地理', { orderIndex: 0 }),
    leafUnit('doc:doc-north', 'node-geo', '北境', 'doc-north', { orderIndex: 0 }),
    leafUnit('doc:doc-south', 'node-geo', '南港', 'doc-south', { orderIndex: 1 }),
    leafUnit('doc:doc-people', 'node-city', '人物志', 'doc-people', { orderIndex: 1 }),
    leafUnit('doc:doc-loose', ROOT, '散文档', 'doc-loose', { orderIndex: 1 }),
    folderUnit('node-empty', ROOT, '空文件夹', { orderIndex: 2 })
  ]
}

describe('buildDocLibraryLinkTreeRows', () => {
  it('按 DFS 顺序压平，深度与父行正确', () => {
    const rows = buildDocLibraryLinkTreeRows(sampleUnits())
    expect(rows.map((row) => row.id)).toEqual([
      'node-city', 'node-geo', 'doc:doc-north', 'doc:doc-south', 'doc:doc-people', 'doc:doc-loose', 'node-empty'
    ])
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 1, 0, 0])
    expect(rows[2].parentRowId).toBe('node-geo')
    expect(rows[5].parentRowId).toBe('')
  })

  it('文件夹 docKeys=自身概览+全部后代去重；空文件夹为空数组', () => {
    const rows = buildDocLibraryLinkTreeRows(sampleUnits())
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect(byId.get('node-city').docKeys).toEqual(['ov-1', 'doc-north', 'doc-south', 'doc-people'])
    expect(byId.get('node-geo').docKeys).toEqual(['doc-north', 'doc-south'])
    expect(byId.get('node-empty').docKeys).toEqual([])
    expect(byId.get('doc:doc-loose').docKeys).toEqual(['doc-loose'])
  })

  it('路径树回退的 leaf 没有 metadata.documentId 时回退 sourceId', () => {
    const rows = buildDocLibraryLinkTreeRows([
      rootUnit(),
      leafUnit('doc:doc-a', ROOT, '甲', 'doc-a', { omitDocumentIdMeta: true })
    ])
    expect(rows[0].docKey).toBe('doc-a')
  })

  it('同级排序：orderIndex 升序，缺省的排最后按标题', () => {
    const rows = buildDocLibraryLinkTreeRows([
      rootUnit(),
      leafUnit('doc:b', ROOT, '乙', 'b', { orderIndex: 1 }),
      leafUnit('doc:a', ROOT, '甲', 'a', { orderIndex: 0 }),
      leafUnit('doc:c', ROOT, '丙', 'c', {})
    ])
    expect(rows.map((row) => row.id)).toEqual(['doc:a', 'doc:b', 'doc:c'])
  })
})

describe('docLinkRowSelectionState / toggleDocLinkRow', () => {
  const rows = buildDocLibraryLinkTreeRows(sampleUnits())
  const byId = new Map(rows.map((row) => [row.id, row]))

  it('文件夹级联勾选：一键并入概览+全部后代', () => {
    const next = toggleDocLinkRow([], byId.get('node-city'))
    expect(next).toEqual(['ov-1', 'doc-north', 'doc-south', 'doc-people'])
    expect(docLinkRowSelectionState(next, byId.get('node-city'))).toBe('all')
    expect(docLinkRowSelectionState(next, byId.get('node-geo'))).toBe('all')
  })

  it('部分选中=partial；再点文件夹补齐为全选；全选再点整组移出', () => {
    const partial = toggleDocLinkRow([], byId.get('doc:doc-north'))
    expect(docLinkRowSelectionState(partial, byId.get('node-geo'))).toBe('partial')
    const full = toggleDocLinkRow(partial, byId.get('node-geo'))
    expect(full).toEqual(['doc-north', 'doc-south'])
    const cleared = toggleDocLinkRow(full, byId.get('node-geo'))
    expect(cleared).toEqual([])
  })

  it('整组移出不影响组外已选项', () => {
    const draft = ['doc-loose', 'doc-north', 'doc-south']
    const next = toggleDocLinkRow(draft, byId.get('node-geo'))
    expect(next).toEqual(['doc-loose'])
  })

  it('空文件夹不可勾选：toggle 原样返回，状态恒为 none', () => {
    expect(toggleDocLinkRow(['x'], byId.get('node-empty'))).toEqual(['x'])
    expect(docLinkRowSelectionState(['x'], byId.get('node-empty'))).toBe('none')
  })
})

describe('filterDocLibraryLinkTreeRows', () => {
  const rows = buildDocLibraryLinkTreeRows(sampleUnits())

  it('关键字为空返回原列表', () => {
    expect(filterDocLibraryLinkTreeRows(rows, '  ')).toBe(rows)
  })

  it('命中文档时保留其全部祖先作为上下文', () => {
    const visible = filterDocLibraryLinkTreeRows(rows, '北境')
    expect(visible.map((row) => row.id)).toEqual(['node-city', 'node-geo', 'doc:doc-north'])
  })

  it('命中文件夹时保留其全部后代', () => {
    const visible = filterDocLibraryLinkTreeRows(rows, '地理')
    expect(visible.map((row) => row.id)).toEqual(['node-city', 'node-geo', 'doc:doc-north', 'doc:doc-south'])
  })

  it('路径也参与匹配', () => {
    const visible = filterDocLibraryLinkTreeRows(rows, '散文档.md')
    expect(visible.map((row) => row.id)).toEqual(['doc:doc-loose'])
  })
})

describe('applyDocLibraryLinkRowCollapse', () => {
  const rows = buildDocLibraryLinkTreeRows(sampleUnits())

  it('折叠文件夹隐藏其整棵子树，自身仍可见', () => {
    const visible = applyDocLibraryLinkRowCollapse(rows, new Set(['node-city']))
    expect(visible.map((row) => row.id)).toEqual(['node-city', 'doc:doc-loose', 'node-empty'])
  })

  it('折叠深层文件夹只隐藏对应子树', () => {
    const visible = applyDocLibraryLinkRowCollapse(rows, new Set(['node-geo']))
    expect(visible.map((row) => row.id)).toEqual([
      'node-city', 'node-geo', 'doc:doc-people', 'doc:doc-loose', 'node-empty'
    ])
  })
})
