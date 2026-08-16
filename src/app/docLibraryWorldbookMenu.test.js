import { describe, expect, it } from 'vitest'
import {
  buildWorldbookClusterMenuItems,
  buildWorldbookRowMenuItems
} from './docLibraryWorldbookMenu.ts'

// 菜单 label 现走 i18n：测试用 identity translator，断言拿到的是 i18n key（结构/顺序仍是校验重点）。
const t = (key) => key

function actions(items) {
  return items.map((item) => item.action)
}

function findAction(items, action) {
  for (const item of items) {
    if (item.action === action) return item
    const child = findAction(item.children || [], action)
    if (child) return child
  }
  return null
}

describe('docLibraryWorldbookMenu', () => {
  it('keeps compile page import in regular row menus', () => {
    const menu = buildWorldbookRowMenuItems({
      t,
      isBatch: false,
      canPaste: false,
      canImportCompilePage: true
    })

    const exportMenu = findAction(menu, 'export-markdown')
    const importMenu = findAction(menu, 'import-markdown')
    const agentMenu = findAction(menu, 'langhuan-agent')
    expect(agentMenu?.label).toBe('unitTree.menu.langhuanAgent')
    expect(agentMenu?.children?.map((item) => item.label)).toEqual(['unitTree.menu.autoGenCompilePage', 'unitTree.menu.autoOptimizeRelations', 'unitTree.menu.deleteDuplicateRelations'])
    expect(findAction(menu, 'langhuan-agent-generate-compile-page')?.disabled).toBe(false)
    expect(findAction(menu, 'langhuan-agent-optimize-relations')?.disabled).toBe(false)
    expect(findAction(menu, 'langhuan-agent-delete-duplicate-relations')?.disabled).toBe(true)
    expect(exportMenu?.label).toBe('common.export')
    expect(exportMenu?.children?.map((item) => item.label)).toEqual(['unitTree.menu.exportBody', 'unitTree.menu.exportBodyPrompt', 'unitTree.menu.exportCompilePageMaterial', 'unitTree.menu.exportRelationCompact'])
    expect(findAction(menu, 'export-body-markdown')?.children?.map((item) => item.action)).toEqual([
      'copy-json',
      'export-json'
    ])
    expect(findAction(menu, 'export-compile-page-markdown')?.children?.map((item) => item.action)).toEqual([
      'copy-markdown-with-compile-prompt',
      'export-markdown-with-compile-prompt'
    ])
    expect(findAction(menu, 'export-body-prompt-markdown')?.children?.map((item) => item.action)).toEqual([
      'copy-markdown-with-body-prompt',
      'export-markdown-with-body-prompt'
    ])
    expect(findAction(menu, 'export-compact-relation-markdown-v1-menu')?.children?.map((item) => item.action)).toEqual([
      'copy-compact-relation-markdown-v1',
      'export-compact-relation-markdown-v1',
    ])
    expect(findAction(menu, 'export-compact-relation-markdown-v2-menu')?.children?.map((item) => item.action)).toEqual([
      'copy-compact-relation-markdown-v2',
      'export-compact-relation-markdown-v2'
    ])
    expect(importMenu?.label).toBe('common.import')
    expect(importMenu?.children?.map((item) => item.label)).toEqual(['unitTree.menu.importBody', 'unitTree.menu.importCompilePage', 'unitTree.menu.importRelationCompact'])
    expect(findAction(menu, 'import-body-markdown')?.disabled).toBe(false)
    expect(findAction(menu, 'import-compile-page-markdown')?.children?.map((item) => item.action)).toEqual([
      'import-compile-page-md-from-clipboard',
      'import-compile-page-md'
    ])
    expect(findAction(menu, 'import-compact-relation-markdown')?.children?.map((item) => item.action)).toEqual([
      'import-compact-relation-md-from-clipboard',
      'import-compact-relation-md'
    ])
    expect(menu.find((item) => item.action === 'paste')?.disabled).toBe(true)
  })

  it('keeps compile page import in batch row menus with disabled state', () => {
    const menu = buildWorldbookRowMenuItems({
      t,
      isBatch: true,
      canGroupAsBranch: false,
      canSortLayer: false,
      canImportCompilePage: false
    })

    expect(menu.find((item) => item.action === 'create-node')?.disabled).toBe(true)
    expect(menu.find((item) => item.action === 'sort-layer')?.disabled).toBe(true)
    expect(findAction(menu, 'import-markdown')?.disabled).toBe(true)
    expect(findAction(menu, 'langhuan-agent-generate-compile-page')?.disabled).toBe(true)
    expect(findAction(menu, 'langhuan-agent-optimize-relations')?.disabled).toBe(true)
    expect(findAction(menu, 'import-body-md')?.disabled).toBe(true)
    expect(findAction(menu, 'import-compile-page-md')?.disabled).toBe(true)
    expect(findAction(menu, 'import-compact-relation-md')?.disabled).toBe(true)
  })

  it('builds cluster menus from the same import/export actions', () => {
    const menu = buildWorldbookClusterMenuItems({
      t,
      isBatch: false,
      canPaste: true,
      canImportCompilePage: true,
      includeExpandCollapse: true,
      createAction: 'create-node:/世界树'
    })

    expect(actions(menu).slice(0, 3)).toEqual(['expand-cluster', 'collapse-cluster', 'create-node:/世界树'])
    expect(findAction(menu, 'copy-json')).toBeTruthy()
    expect(findAction(menu, 'export-json')).toBeTruthy()
    expect(findAction(menu, 'import-compile-page-md')).toBeTruthy()
    expect(findAction(menu, 'copy-compact-relation-markdown-v1')).toBeTruthy()
    expect(findAction(menu, 'copy-compact-relation-markdown-v2')).toBeTruthy()
    expect(findAction(menu, 'import-compact-relation-md')).toBeTruthy()
    expect(findAction(menu, 'langhuan-agent-generate-compile-page')).toBeTruthy()
    expect(findAction(menu, 'langhuan-agent-optimize-relations')).toBeTruthy()
  })
})
