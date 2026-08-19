import { describe, expect, it } from 'vitest'
import {
  DOC_LIBRARY_MODULE_TABS,
  getVisibleDocLibraryModuleTabs,
  normalizeVisibleDocLibraryModuleTab
} from '../../../src/app/docLibraryModules'

describe('docLibraryModules', () => {
  it('keeps role and scenario prompts as two visible document-library pages', () => {
    expect(DOC_LIBRARY_MODULE_TABS.map((item) => item.id)).toEqual([
      'worldbook',
      'relation',
      'prompt',
      'scenarioPrompt'
    ])
    expect(getVisibleDocLibraryModuleTabs()).toEqual(DOC_LIBRARY_MODULE_TABS)
    expect(DOC_LIBRARY_MODULE_TABS.find((item) => item.id === 'prompt')?.labelKey)
      .toBe('docLibrary.topbar.rolePromptTitle')
    expect(DOC_LIBRARY_MODULE_TABS.find((item) => item.id === 'scenarioPrompt')?.labelKey)
      .toBe('docLibrary.topbar.scenarioPromptTitle')
    expect(normalizeVisibleDocLibraryModuleTab('scenarioPrompt')).toBe('scenarioPrompt')
  })
})
