/**
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '../../../src/i18n'

vi.mock('../../../src/repositories/orchestratorConfigRepository.ts', () => ({
  fetchOrchestratorConfig: async () => ({
    systemPrompt: '编排规则',
    scenarios: [{ code: 'calm', label: '平静', trigger: '平稳互动', body: '保持自然。', mountedPrompts: [] }],
    tools: []
  }),
  saveOrchestratorConfig: async (config) => config,
  loadEffectiveOrchestratorConfig: async () => ({ systemPrompt: '', scenarios: [], tools: [] }),
  invalidateOrchestratorConfigCache: () => {}
}))

import ScenarioPromptLibraryPanel from '../../../src/components/doc-library/ScenarioPromptLibraryPanel.vue'

describe('ScenarioPromptLibraryPanel', () => {
  it('puts the tree in the external left column and opens details inline on the right', async () => {
    const treeHost = document.createElement('div')
    treeHost.id = 'doc-scenario-prompt-tree-target'
    const actionsHost = document.createElement('div')
    actionsHost.id = 'doc-scenario-prompt-actions-target'
    document.body.appendChild(treeHost)
    document.body.appendChild(actionsHost)
    const wrapper = mount(ScenarioPromptLibraryPanel, {
      attachTo: document.body,
      props: { externalSidebar: true },
      global: { plugins: [i18n] }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('情境提示词')
    expect(wrapper.text()).toContain('回复编排器配置')
    expect(treeHost.textContent).toContain('回复编排器总提示词')
    expect(treeHost.textContent).toContain('calm')
    expect(treeHost.textContent).toContain('新建情境skill')
    expect(actionsHost.textContent).toContain('恢复默认')
    expect(actionsHost.querySelector('[data-testid="restore-orchestrator-defaults"]')).toBeTruthy()
    expect(treeHost.querySelector('[data-testid="restore-orchestrator-defaults"]')).toBeFalsy()
    expect(wrapper.find('.ptree').exists()).toBe(false)

    const scenarioNode = Array.from(treeHost.querySelectorAll('.tn'))
      .find((node) => node.textContent?.includes('calm'))
    expect(scenarioNode).toBeTruthy()
    scenarioNode.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.get('.opt-detail').text()).toContain('编辑情境skill')
    expect(wrapper.get('.opt-detail').text()).toContain('情境正文')
    expect(document.querySelector('.skill-overlay')).toBeFalsy()

    wrapper.unmount()
    treeHost.remove()
    actionsHost.remove()
  })

  it('reattaches the tree when switching workspaces recreates the external sidebar hosts', async () => {
    const firstTreeHost = document.createElement('div')
    firstTreeHost.id = 'doc-scenario-prompt-tree-target'
    const firstActionsHost = document.createElement('div')
    firstActionsHost.id = 'doc-scenario-prompt-actions-target'
    document.body.appendChild(firstTreeHost)
    document.body.appendChild(firstActionsHost)
    const wrapper = mount(ScenarioPromptLibraryPanel, {
      attachTo: document.body,
      props: { externalSidebar: true },
      global: { plugins: [i18n] }
    })
    await flushPromises()

    expect(firstTreeHost.textContent).toContain('回复编排器总提示词')
    expect(firstActionsHost.textContent).toContain('恢复默认')

    firstTreeHost.remove()
    firstActionsHost.remove()
    const replacementTreeHost = document.createElement('div')
    replacementTreeHost.id = 'doc-scenario-prompt-tree-target'
    const replacementActionsHost = document.createElement('div')
    replacementActionsHost.id = 'doc-scenario-prompt-actions-target'
    document.body.appendChild(replacementTreeHost)
    document.body.appendChild(replacementActionsHost)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushPromises()

    expect(replacementTreeHost.textContent).toContain('回复编排器总提示词')
    expect(replacementTreeHost.textContent).toContain('calm')
    expect(replacementActionsHost.textContent).toContain('恢复默认')

    wrapper.unmount()
    replacementTreeHost.remove()
    replacementActionsHost.remove()
  })
})
