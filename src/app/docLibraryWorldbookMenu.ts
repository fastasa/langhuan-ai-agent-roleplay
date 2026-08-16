import {
  buildUnitTreeCommonMenuItems,
  type MenuTranslate,
  type UnitTreeActionMenuItem
} from './unitTreeActionMenu'

export type DocLibraryWorldbookMenuItem = UnitTreeActionMenuItem

export type BuildWorldbookClusterMenuInput = {
  t: MenuTranslate
  isBatch: boolean
  canSortLayer?: boolean
  canPaste?: boolean
  canImportCompilePage?: boolean
  canDeleteDuplicateRelations?: boolean
  createAction?: string
  includeExpandCollapse?: boolean
  importDisabled?: boolean
}

export type BuildWorldbookRowMenuInput = {
  t: MenuTranslate
  isBatch: boolean
  canGroupAsBranch?: boolean
  canSortLayer?: boolean
  canPaste?: boolean
  canImportCompilePage?: boolean
  canDeleteDuplicateRelations?: boolean
  includeCopyPath?: boolean
  importDisabled?: boolean
}

export function buildWorldbookClusterMenuItems(input: BuildWorldbookClusterMenuInput): DocLibraryWorldbookMenuItem[] {
  const t = input.t
  if (input.isBatch) {
    return buildUnitTreeCommonMenuItems({
      t,
      open: false,
      createLeaf: false,
      groupAsBranch: false,
      rename: false,
      importSource: false,
      sortLayer: { disabled: input.canSortLayer === false },
      sortLayerBeforeRename: true,
      clipboard: {},
      copyTitle: false,
      copyPath: false,
      langhuanAgent: {
        dividerBefore: true,
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        compilePageDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        relationOptimizeDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        duplicateRelationDisabled: !(input.canDeleteDuplicateRelations ?? false)
      },
      markdownExport: { dividerBefore: true },
      markdownImport: {
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        bodyDisabled: input.importDisabled ?? input.canImportCompilePage === false
      },
      delete: { key: 'delete-cluster', action: 'delete-cluster', dividerBefore: true, danger: true, shortcut: 'Delete' }
    })
  }

  return [
    ...(input.includeExpandCollapse
      ? [
          { key: 'expand-cluster', label: t('unitTree.menu.expandCluster'), action: 'expand-cluster' },
          { key: 'collapse-cluster', label: t('unitTree.menu.collapseCluster'), action: 'collapse-cluster' }
        ]
      : []),
    ...buildUnitTreeCommonMenuItems({
      t,
      open: false,
      createLeaf: { key: 'create-node', action: input.createAction || 'create-node' },
      groupAsBranch: false,
      rename: { dividerBefore: true },
      importSource: false,
      sortLayer: {},
      sortLayerBeforeRename: true,
      clipboard: { paste: { disabled: !input.canPaste } },
      copyTitle: false,
      copyPath: false,
      langhuanAgent: {
        dividerBefore: true,
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        compilePageDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        relationOptimizeDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        duplicateRelationDisabled: !(input.canDeleteDuplicateRelations ?? false)
      },
      markdownExport: { dividerBefore: true },
      markdownImport: {
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        bodyDisabled: input.importDisabled ?? input.canImportCompilePage === false
      },
      delete: { key: 'delete-cluster', action: 'delete-cluster', dividerBefore: true, danger: true, shortcut: 'Delete' }
    })
  ]
}

export function buildWorldbookRowMenuItems(input: BuildWorldbookRowMenuInput): DocLibraryWorldbookMenuItem[] {
  const t = input.t
  if (input.isBatch) {
    return buildUnitTreeCommonMenuItems({
      t,
      open: false,
      createLeaf: false,
      groupAsBranch: { key: 'create-node', action: 'create-node', disabled: !input.canGroupAsBranch },
      rename: false,
      importSource: false,
      sortLayer: { disabled: input.canSortLayer === false },
      sortLayerBeforeRename: true,
      clipboard: { cut: { dividerBefore: true } },
      copyTitle: false,
      copyPath: false,
      langhuanAgent: {
        dividerBefore: true,
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        compilePageDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        relationOptimizeDisabled: input.importDisabled ?? input.canImportCompilePage === false,
        duplicateRelationDisabled: !(input.canDeleteDuplicateRelations ?? false)
      },
      markdownExport: { dividerBefore: true },
      markdownImport: {
        disabled: input.importDisabled ?? input.canImportCompilePage === false,
        bodyDisabled: input.importDisabled ?? input.canImportCompilePage === false
      },
      delete: { dividerBefore: true, danger: true, shortcut: 'Delete' }
    })
  }

  return buildUnitTreeCommonMenuItems({
    t,
    open: false,
    createLeaf: { key: 'create-node', action: 'create-node' },
    groupAsBranch: false,
    rename: { dividerBefore: true },
    importSource: false,
    sortLayer: {},
    sortLayerBeforeRename: true,
    clipboard: { paste: { disabled: !input.canPaste } },
    copyTitle: false,
    copyPath: input.includeCopyPath === false
      ? false
      : { label: t('unitTree.menu.copyCurrentPath'), dividerBefore: true },
    langhuanAgent: {
      dividerBefore: input.includeCopyPath === false,
      disabled: input.importDisabled ?? input.canImportCompilePage === false,
      compilePageDisabled: input.importDisabled ?? input.canImportCompilePage === false,
      relationOptimizeDisabled: input.importDisabled ?? input.canImportCompilePage === false,
      duplicateRelationDisabled: !(input.canDeleteDuplicateRelations ?? false)
    },
    markdownExport: { dividerBefore: input.includeCopyPath === false },
    markdownImport: {
      disabled: input.importDisabled ?? input.canImportCompilePage === false,
      bodyDisabled: input.importDisabled ?? input.canImportCompilePage === false
    },
    delete: { dividerBefore: true, danger: true, shortcut: 'Delete' }
  })
}
