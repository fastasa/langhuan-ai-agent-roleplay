export type DocLibraryModuleTab = 'worldbook' | 'relation' | 'prompt' | 'scenarioPrompt'

export type DocLibraryModuleTabItem = {
  id: DocLibraryModuleTab
  // i18n key（模块级 const 用不了 t()，由消费方渲染时 t(labelKey) 填充）
  labelKey: string
}

export const DOC_LIBRARY_MODULE_TABS: DocLibraryModuleTabItem[] = [
  { id: 'worldbook', labelKey: 'docLibrary.moduleTab.worldTree' },
  { id: 'relation', labelKey: 'docLibrary.moduleTab.relation' },
  { id: 'prompt', labelKey: 'docLibrary.topbar.rolePromptTitle' },
  { id: 'scenarioPrompt', labelKey: 'docLibrary.topbar.scenarioPromptTitle' }
]

const HIDDEN_DOC_LIBRARY_MODULE_TABS = new Set<DocLibraryModuleTab>()

export function isDocLibraryModuleTabEnabled(tab: DocLibraryModuleTab) {
  return !HIDDEN_DOC_LIBRARY_MODULE_TABS.has(tab)
}

export function getVisibleDocLibraryModuleTabs() {
  return DOC_LIBRARY_MODULE_TABS.filter((tab) => isDocLibraryModuleTabEnabled(tab.id))
}

export function normalizeVisibleDocLibraryModuleTab(tab: DocLibraryModuleTab) {
  return DOC_LIBRARY_MODULE_TABS.some((item) => item.id === tab) && isDocLibraryModuleTabEnabled(tab)
    ? tab
    : 'worldbook'
}

export const SCENARIO_PROMPT_TREE_TARGET_ID = 'doc-scenario-prompt-tree-target'
export const SCENARIO_PROMPT_ACTIONS_TARGET_ID = 'doc-scenario-prompt-actions-target'
