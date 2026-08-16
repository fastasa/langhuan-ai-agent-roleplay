/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentConversationEmptyState from '../../../src/components/app/AgentConversationEmptyState.vue'

const emptyStateSource = readFileSync(resolve(process.cwd(), 'src/components/app/AgentConversationEmptyState.vue'), 'utf8')
const dockSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
const workspaceAgentSource = readFileSync(resolve(process.cwd(), 'src/components/app/workspaceAgent/WorkspaceAgentShell.vue'), 'utf8')

describe('AgentConversationEmptyState', () => {
  it('超级Agent与工作区专业Agent复用同一空态组件', () => {
    expect(dockSource).toContain('<AgentConversationEmptyState')
    expect(workspaceAgentSource).toContain('<AgentConversationEmptyState')
  })

  it('状态工作区以真实可见态触发星依历史水合', () => {
    expect(dockSource).toContain('watch(dockVisible, (next) => {')
    expect(dockSource).not.toContain('watch(open, (next) => {\n  if (!next) return\n  void loadSession()')
  })

  it('紧凑对话空态只显示干净星体：隐藏三根放射线并统一加粗描边', () => {
    expect(emptyStateSource).toContain('class="agent-conversation-empty-state__icon xy-star--idle"')
    expect(emptyStateSource).toContain('.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__rays)')
    expect(emptyStateSource).toContain('display: none;')
    expect(emptyStateSource).toContain('.agent-conversation-empty-state__icon :deep(.xingyi-star-icon__outline)')
    expect(emptyStateSource).toContain('stroke-width: 3;')
  })

  it('透传空态文案，并支持未就绪弱化态', () => {
    const wrapper = mount(AgentConversationEmptyState, { props: { text: '请先加入世界', muted: true } })
    expect(wrapper.text()).toBe('请先加入世界')
    expect(wrapper.classes()).toContain('is-muted')
    expect(wrapper.find('.xingyi-star-icon__rays').exists()).toBe(true)
  })
})
