/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AgentTaskTodoCard from '../../../src/components/app/AgentTaskTodoCard.vue'

function snapshot(revision, state = 'active') {
  return {
    taskId: 'task-1',
    revision,
    state,
    changeKind: state === 'completed' ? 'completed' : revision === 1 ? 'created' : 'updated',
    createdAt: 1,
    updatedAt: revision,
    items: [
      {
        id: 'todo-1',
        text: '核对资料',
        acceptance: '两份资料都已读取',
        status: state === 'completed' ? 'completed' : revision > 1 ? 'completed' : 'in_progress'
      },
      {
        id: 'todo-2',
        text: '写入正式设定',
        acceptance: '写后重读一致',
        status: state === 'completed' ? 'completed' : 'pending'
      }
    ]
  }
}

describe('AgentTaskTodoCard', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('变化时自动上浮、全部完成时清空卡片，并持久记住手动收起/展开偏好', async () => {
    const wrapper = mount(AgentTaskTodoCard, { props: { snapshot: snapshot(1) } })
    expect(wrapper.find('.agent-task-todo__panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('核对资料')

    await wrapper.get('.agent-task-todo__head').trigger('click')
    expect(wrapper.find('.agent-task-todo__collapsed').exists()).toBe(true)
    expect(window.localStorage.getItem('langhuan.agentTaskTodo.autoExpand.v1')).toBe('false')

    await wrapper.setProps({ snapshot: snapshot(2) })
    expect(wrapper.find('.agent-task-todo__panel').exists()).toBe(false)
    expect(wrapper.text()).toContain('1/2')

    await wrapper.get('.agent-task-todo__collapsed').trigger('click')
    expect(wrapper.find('.agent-task-todo__panel').exists()).toBe(true)
    expect(window.localStorage.getItem('langhuan.agentTaskTodo.autoExpand.v1')).toBe('true')

    await wrapper.setProps({ snapshot: snapshot(3, 'completed') })
    expect(wrapper.find('.agent-task-todo').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('2/2')

    wrapper.unmount()
    const remounted = mount(AgentTaskTodoCard, { props: { snapshot: snapshot(4) } })
    expect(remounted.find('.agent-task-todo__panel').exists()).toBe(true)
  })

  it('空清单不制造占位卡片', () => {
    const wrapper = mount(AgentTaskTodoCard, {
      props: {
        snapshot: {
          taskId: 'task-empty',
          revision: 0,
          state: 'empty',
          changeKind: 'reset',
          createdAt: 1,
          updatedAt: 1,
          items: []
        }
      }
    })
    expect(wrapper.html()).toBe('<!--v-if-->')
  })

  it('以输入框为锚点静态切换，收起文字居中且只留右侧上箭头，信息流高于细条', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/app/AgentTaskTodoCard.vue'),
      'utf8'
    )
    const rootRule = source.match(/\.agent-task-todo\s*\{([^}]*)\}/)?.[1] || ''
    expect(source).toMatch(/\.agent-task-todo\s*\{[\s\S]*position:\s*absolute/)
    expect(source).toContain('width: 90%')
    expect(source).toContain('max-width: 90%')
    expect(source).toContain('min-width: 0')
    expect(source).toMatch(/\.agent-task-todo\s*\{[\s\S]*bottom:\s*calc\(100% - 1px\)/)
    expect(source).toMatch(/\.agent-task-todo--expanded\s*\{[\s\S]*bottom:\s*calc\(100% - 11px\)/)
    expect(source).toContain("snapshot.state !== 'completed'")
    expect(source).toMatch(/\.agent-task-todo__collapsed\s*\{[\s\S]*width:\s*100%/)
    expect(source).toContain('--agent-task-todo-olive: #7f7f4d')
    expect(source).toContain('height: 20px')
    expect(source).toContain('bottom: calc(100% - 11px)')
    expect(source).toContain('background: transparent')
    expect(source).not.toContain('<Transition')
    expect(source).not.toContain('agent-task-todo-switch')
    expect(source).not.toContain('agent-task-todo__collapsed-mark')
    expect(source).toMatch(/\.agent-task-todo__collapsed\s*\{[\s\S]*display:\s*grid/)
    expect(source).toMatch(/\.agent-task-todo__collapsed\s*\{[\s\S]*place-items:\s*center/)
    expect(source).toMatch(/\.agent-task-todo__collapsed svg\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*10px/)
    const composerSource = readFileSync(
      resolve(process.cwd(), 'src/components/app/XingyiChatComposer.vue'),
      'utf8'
    )
    expect(composerSource).not.toContain('.xingyi-chat-composer::before')
    expect(composerSource).toContain('<slot name="task-todo"></slot>')
    expect(composerSource).toMatch(/\.xingyi-chat-composer__input-shell\s*\{[\s\S]*position:\s*relative/)
    expect(composerSource).toMatch(/\.xingyi-chat-composer__input\s*\{[\s\S]*width:\s*100%/)
    const dockSource = readFileSync(
      resolve(process.cwd(), 'src/components/app/XingyiDock.vue'),
      'utf8'
    )
    expect(dockSource).toMatch(/\.xingyi-dock__messages\s*\{[\s\S]*padding:\s*14px 12px 18px/)
    expect(dockSource).toMatch(/\.xingyi-dock__composer\s*\{[\s\S]*background:\s*var\(--langhuan-paper-bg,\s*transparent\)/)
    const workspaceSource = readFileSync(
      resolve(process.cwd(), 'src/components/app/workspaceAgent/WorkspaceAgentShell.vue'),
      'utf8'
    )
    expect(workspaceSource).toMatch(/\.was-shell__messages\s*\{[\s\S]*padding:\s*10px 10px 18px/)
    expect(workspaceSource).toMatch(/\.was-shell__input-row\s*\{[\s\S]*width:\s*100%/)
    expect(workspaceSource).toMatch(/\.was-shell__input-row\s*\{[\s\S]*min-width:\s*0/)
    expect(workspaceSource).toMatch(/\.was-shell__input-row\s*\{[\s\S]*box-sizing:\s*border-box/)
    expect(rootRule).not.toContain('padding-bottom:')
  })
})
