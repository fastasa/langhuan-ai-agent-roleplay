/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TidiaoPrecisionEditBar from '../../../src/components/app/chat/TidiaoPrecisionEditBar.vue'

describe('提调精修条空工作区呈现', () => {
  it('缺少角色目标时默认收起，悬浮或聚焦才抬起，同时保留禁用说明', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar, {
      props: {
        disabled: true,
        placeholder: '请先新建或选择角色'
      }
    })
    await nextTick()

    const wrap = wrapper.get('.tds-tab-wrap')
    const bar = wrapper.get('.tds-tab')
    const input = wrapper.get('textarea')
    expect(wrap.classes()).not.toContain('is-raised')
    expect(bar.classes()).not.toContain('is-raised')
    expect(input.attributes('disabled')).not.toBeUndefined()
    expect(input.attributes('placeholder')).toBe('请先新建或选择角色')

    await wrap.trigger('mouseenter')
    expect(wrap.classes()).toContain('is-raised')
    expect(bar.classes()).toContain('is-raised')

    await wrap.trigger('mouseleave')
    expect(wrap.classes()).not.toContain('is-raised')

    await wrapper.setProps({ disabled: false })
    await input.trigger('focus')
    expect(wrap.classes()).toContain('is-raised')

    await input.trigger('blur')
    expect(wrap.classes()).not.toContain('is-raised')
  })

  it('工作区宿主只因缺目标禁用，不再把提调条整体隐藏', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/app/chat/ChatWorkspaceSection.vue'), 'utf8')

    expect(source).toContain('v-if="props.actions.applyDirectorPrecisionEdits"')
    expect(source).not.toContain('always-raised')
    expect(source).toContain('!props.viewModel.currentTarget || props.viewModel.isTyping')
  })
})
