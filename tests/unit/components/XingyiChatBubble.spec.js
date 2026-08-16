/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import XingyiChatBubble from '../../../src/components/app/XingyiChatBubble.vue'

describe('XingyiChatBubble', () => {
  it('统一渲染标题、列表、强调、链接和代码 Markdown', () => {
    const wrapper = mount(XingyiChatBubble, {
      props: {
        role: 'assistant',
        content: [
          '## 结果',
          '',
          '- **第一项**',
          '- [来源](https://example.com)',
          '',
          '`inline()`',
          '',
          '```ts',
          'const ready = true',
          '```'
        ].join('\n')
      }
    })

    expect(wrapper.find('h2').text()).toBe('结果')
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('strong').text()).toBe('第一项')
    expect(wrapper.find('a').attributes()).toMatchObject({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noreferrer'
    })
    expect(wrapper.find('p code').text()).toBe('inline()')
    expect(wrapper.find('pre code').text()).toContain('const ready = true')
  })

  it('转义原始 HTML，不执行脚本或事件属性', () => {
    const wrapper = mount(XingyiChatBubble, {
      props: {
        role: 'user',
        content: '<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>'
      }
    })

    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.text()).toContain('<img src=x onerror=alert(2)>')
  })

  it('保留附件和失败提示等结构化 slot 内容', () => {
    const wrapper = mount(XingyiChatBubble, {
      props: { role: 'assistant', content: '**正文**' },
      slots: { default: '<div class="attachment-slot">附件</div>' }
    })

    expect(wrapper.find('strong').text()).toBe('正文')
    expect(wrapper.find('.attachment-slot').text()).toBe('附件')
  })

  it('星依与工作区 Agent 都通过 content 接入共享渲染', () => {
    const dockSource = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
    const workspaceSource = readFileSync(resolve(process.cwd(), 'src/components/app/workspaceAgent/WorkspaceAgentShell.vue'), 'utf8')

    expect(dockSource).toContain(':content="message.content === imageOnlyPlaceholderText ? \'\' : message.content"')
    expect(workspaceSource).toContain(':content="message.content"')
  })
})
