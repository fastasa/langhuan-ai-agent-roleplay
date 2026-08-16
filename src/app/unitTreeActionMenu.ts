// 菜单 label 走 i18n：由调用组件传入 useI18n() 的 t，标签取自 unitTree/common 命名空间（不在本模块内硬编码中文）。
export type MenuTranslate = (key: string) => string

export type UnitTreeActionMenuItem = {
  key: string
  label: string
  action: string
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
  shortcut?: string
  children?: UnitTreeActionMenuItem[]
}

export type UnitTreeActionMenuItemDraft = Omit<UnitTreeActionMenuItem, 'key' | 'label' | 'action'> & {
  key?: string
  label?: string
  action?: string
}

export type UnitTreeMarkdownImportInput = {
  disabled?: boolean
  bodyDisabled?: boolean
  compilePageDisabled?: boolean
  compactRelationDisabled?: boolean
}

export type UnitTreeLanghuanAgentInput = {
  disabled?: boolean
  compilePageDisabled?: boolean
  relationOptimizeDisabled?: boolean
  duplicateRelationDisabled?: boolean
}

export type UnitTreeCommonMenuInput = {
  t: MenuTranslate
  isBatch?: boolean
  open?: UnitTreeActionMenuItemDraft | false
  createLeaf?: UnitTreeActionMenuItemDraft | false
  groupAsBranch?: UnitTreeActionMenuItemDraft | false
  rename?: UnitTreeActionMenuItemDraft | false
  importSource?: UnitTreeActionMenuItemDraft | false
  sortLayer?: UnitTreeActionMenuItemDraft | false
  sortLayerBeforeRename?: boolean
  clipboard?: false | {
    cut?: UnitTreeActionMenuItemDraft | false
    copy?: UnitTreeActionMenuItemDraft | false
    paste?: UnitTreeActionMenuItemDraft | false
  }
  copyTitle?: UnitTreeActionMenuItemDraft | false
  copyPath?: UnitTreeActionMenuItemDraft | false
  langhuanAgent?: (UnitTreeActionMenuItemDraft & UnitTreeLanghuanAgentInput) | false
  markdownExport?: UnitTreeActionMenuItemDraft | false
  markdownImport?: (UnitTreeActionMenuItemDraft & UnitTreeMarkdownImportInput) | false
  delete?: UnitTreeActionMenuItemDraft | false
}

export function buildUnitTreeCommonMenuItems(input: UnitTreeCommonMenuInput): UnitTreeActionMenuItem[] {
  const t = input.t
  const items: UnitTreeActionMenuItem[] = []
  pushOptional(items, t, 'open', 'unitTree.menu.open', input.open)
  pushOptional(items, t, 'group-as-branch', 'unitTree.menu.groupAsBranch', input.groupAsBranch)
  pushOptional(items, t, 'new-leaf', 'unitTree.menu.newLeaf', input.createLeaf)
  if (input.sortLayerBeforeRename) {
    pushOptional(items, t, 'sort-layer', 'unitTree.menu.sortLayer', input.sortLayer)
  }
  pushOptional(items, t, 'rename', 'common.rename', input.rename)
  pushOptional(items, t, 'import-source', 'unitTree.menu.importFromDocLibrary', input.importSource)
  if (!input.sortLayerBeforeRename) {
    pushOptional(items, t, 'sort-layer', 'unitTree.menu.sortLayer', input.sortLayer)
  }
  if (input.clipboard !== false) {
    const clipboard = input.clipboard || {}
    pushOptional(items, t, 'cut', 'unitTree.menu.cut', withShortcut(clipboard.cut, 'Ctrl+X'))
    pushOptional(items, t, 'copy', 'common.copy', withShortcut(clipboard.copy, 'Ctrl+C'))
    pushOptional(items, t, 'paste', 'unitTree.menu.paste', withShortcut(clipboard.paste, 'Ctrl+V'))
  }
  pushOptional(items, t, 'copy-title', 'unitTree.menu.copyTitle', input.copyTitle)
  pushOptional(items, t, 'copy-path', 'unitTree.menu.copyPath', input.copyPath)
  if (input.langhuanAgent !== false) {
    items.push(createUnitTreeLanghuanAgentMenuItem(t, input.langhuanAgent))
  }
  if (input.markdownExport !== false) {
    items.push(createUnitTreeMarkdownExportMenuItem(t, input.markdownExport))
  }
  if (input.markdownImport !== false) {
    items.push(createUnitTreeMarkdownImportMenuItem(t, input.markdownImport))
  }
  pushOptional(items, t, 'delete', 'common.delete', input.delete)
  return items
}

export function createUnitTreeLanghuanAgentMenuItem(t: MenuTranslate, options: UnitTreeActionMenuItemDraft & UnitTreeLanghuanAgentInput = {}): UnitTreeActionMenuItem {
  const disabled = Boolean(options.disabled)
  const compilePageDisabled = options.compilePageDisabled ?? disabled
  const relationOptimizeDisabled = options.relationOptimizeDisabled ?? disabled
  const duplicateRelationDisabled = options.duplicateRelationDisabled ?? disabled
  return {
    key: options.key || 'langhuan-agent',
    label: options.label || t('unitTree.menu.langhuanAgent'),
    action: options.action || 'langhuan-agent',
    dividerBefore: options.dividerBefore,
    disabled,
    danger: options.danger,
    shortcut: options.shortcut,
    children: [
      {
        key: 'langhuan-agent-generate-compile-page',
        label: t('unitTree.menu.autoGenCompilePage'),
        action: 'langhuan-agent-generate-compile-page',
        disabled: compilePageDisabled
      },
      {
        key: 'langhuan-agent-optimize-relations',
        label: t('unitTree.menu.autoOptimizeRelations'),
        action: 'langhuan-agent-optimize-relations',
        disabled: relationOptimizeDisabled
      },
      {
        key: 'langhuan-agent-delete-duplicate-relations',
        label: t('unitTree.menu.deleteDuplicateRelations'),
        action: 'langhuan-agent-delete-duplicate-relations',
        disabled: duplicateRelationDisabled
      }
    ]
  }
}

export function createUnitTreeMarkdownExportMenuItem(t: MenuTranslate, options: UnitTreeActionMenuItemDraft = {}): UnitTreeActionMenuItem {
  return {
    key: options.key || 'export-markdown',
    label: options.label || t('common.export'),
    action: options.action || 'export-markdown',
    dividerBefore: options.dividerBefore,
    disabled: options.disabled,
    danger: options.danger,
    shortcut: options.shortcut,
    children: [
      {
        key: 'export-body-markdown',
        label: t('unitTree.menu.exportBody'),
        action: 'export-body-markdown',
        children: [
          { key: 'copy-json', label: t('unitTree.menu.copyToClipboard'), action: 'copy-json' },
          { key: 'export-json', label: t('unitTree.menu.exportToFile'), action: 'export-json' }
        ]
      },
      {
        key: 'export-body-prompt-markdown',
        label: t('unitTree.menu.exportBodyPrompt'),
        action: 'export-body-prompt-markdown',
        children: [
          {
            key: 'copy-markdown-with-body-prompt',
            label: t('unitTree.menu.copyToClipboard'),
            action: 'copy-markdown-with-body-prompt'
          },
          {
            key: 'export-markdown-with-body-prompt',
            label: t('unitTree.menu.exportToFile'),
            action: 'export-markdown-with-body-prompt'
          }
        ]
      },
      {
        key: 'export-compile-page-markdown',
        label: t('unitTree.menu.exportCompilePageMaterial'),
        action: 'export-compile-page-markdown',
        children: [
          {
            key: 'copy-markdown-with-compile-prompt',
            label: t('unitTree.menu.copyToClipboard'),
            action: 'copy-markdown-with-compile-prompt'
          },
          {
            key: 'export-markdown-with-compile-prompt',
            label: t('unitTree.menu.exportToFile'),
            action: 'export-markdown-with-compile-prompt'
          }
        ]
      },
      {
        key: 'export-compact-relation-markdown',
        label: t('unitTree.menu.exportRelationCompact'),
        action: 'export-compact-relation-markdown',
        children: [
          {
            key: 'export-compact-relation-markdown-v1-menu',
            label: 'v1',
            action: 'export-compact-relation-markdown-v1-menu',
            children: [
              { key: 'copy-compact-relation-markdown-v1', label: t('unitTree.menu.copyToClipboard'), action: 'copy-compact-relation-markdown-v1' },
              { key: 'export-compact-relation-markdown-v1', label: t('unitTree.menu.exportToFile'), action: 'export-compact-relation-markdown-v1' }
            ]
          },
          {
            key: 'export-compact-relation-markdown-v2-menu',
            label: 'v2',
            action: 'export-compact-relation-markdown-v2-menu',
            children: [
              { key: 'copy-compact-relation-markdown-v2', label: t('unitTree.menu.copyToClipboard'), action: 'copy-compact-relation-markdown-v2' },
              { key: 'export-compact-relation-markdown-v2', label: t('unitTree.menu.exportToFile'), action: 'export-compact-relation-markdown-v2' }
            ]
          }
        ]
      }
    ]
  }
}

export function createUnitTreeMarkdownImportMenuItem(t: MenuTranslate, options: UnitTreeActionMenuItemDraft & UnitTreeMarkdownImportInput = {}): UnitTreeActionMenuItem {
  const disabled = Boolean(options.disabled)
  const bodyDisabled = options.bodyDisabled ?? true
  const compilePageDisabled = options.compilePageDisabled ?? disabled
  const compactRelationDisabled = options.compactRelationDisabled ?? disabled
  return {
    key: options.key || 'import-markdown',
    label: options.label || t('common.import'),
    action: options.action || 'import-markdown',
    dividerBefore: options.dividerBefore,
    disabled,
    danger: options.danger,
    shortcut: options.shortcut,
    children: [
      {
        key: 'import-body-markdown',
        label: t('unitTree.menu.importBody'),
        action: 'import-body-markdown',
        disabled: bodyDisabled,
        children: [
          { key: 'import-body-md-from-clipboard', label: t('unitTree.menu.importFromClipboard'), action: 'import-body-md-from-clipboard', disabled: bodyDisabled },
          { key: 'import-body-md', label: t('unitTree.menu.importFromFile'), action: 'import-body-md', disabled: bodyDisabled }
        ]
      },
      {
        key: 'import-compile-page-markdown',
        label: t('unitTree.menu.importCompilePage'),
        action: 'import-compile-page-markdown',
        disabled: compilePageDisabled,
        children: [
          {
            key: 'import-compile-page-md-from-clipboard',
            label: t('unitTree.menu.importFromClipboard'),
            action: 'import-compile-page-md-from-clipboard',
            disabled: compilePageDisabled
          },
          {
            key: 'import-compile-page-md',
            label: t('unitTree.menu.importFromFile'),
            action: 'import-compile-page-md',
            disabled: compilePageDisabled
          }
        ]
      },
      {
        key: 'import-compact-relation-markdown',
        label: t('unitTree.menu.importRelationCompact'),
        action: 'import-compact-relation-markdown',
        disabled: compactRelationDisabled,
        children: [
          {
            key: 'import-compact-relation-md-from-clipboard',
            label: t('unitTree.menu.importFromClipboard'),
            action: 'import-compact-relation-md-from-clipboard',
            disabled: compactRelationDisabled
          },
          {
            key: 'import-compact-relation-md',
            label: t('unitTree.menu.importFromFile'),
            action: 'import-compact-relation-md',
            disabled: compactRelationDisabled
          }
        ]
      }
    ]
  }
}

function pushOptional(
  items: UnitTreeActionMenuItem[],
  t: MenuTranslate,
  defaultKey: string,
  labelKey: string,
  options: UnitTreeActionMenuItemDraft | false | undefined
) {
  if (options === false) return
  const config = options || {}
  items.push({
    key: config.key || defaultKey,
    label: config.label || t(labelKey),
    action: config.action || defaultKey,
    danger: config.danger,
    disabled: config.disabled,
    dividerBefore: config.dividerBefore,
    shortcut: config.shortcut,
    children: config.children
  })
}

function withShortcut(options: UnitTreeActionMenuItemDraft | false | undefined, shortcut: string) {
  if (options === false) return false
  return {
    ...(options || {}),
    shortcut: options?.shortcut ?? shortcut
  }
}
