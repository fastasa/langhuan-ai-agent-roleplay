/**
 * @vitest-environment jsdom
 * 图标 svg 包装收敛：ToolRail 与 MenuBar（撤销/重做）此前各自内联同一份 svg 外壳，收编到 PixelIcon.vue。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PixelIcon from '../../../src/pixel-studio/ui/PixelIcon.vue'
import { PIXEL_ICONS } from '../../../src/pixel-studio/ui/icons'

describe('PixelIcon', () => {
  it('按 name 渲染对应图标的全部子元素', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'pencil' } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.element.children.length).toBe(PIXEL_ICONS.pencil.length)
  })

  it('class 透传到根 svg，供调用方复用已有 CSS（tool-rail__icon 等）控制尺寸', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'eraser' }, attrs: { class: 'tool-rail__icon' } })
    expect(wrapper.find('svg').classes()).toContain('tool-rail__icon')
  })

  it('显式传入 size 时按 px 设置宽高样式', () => {
    const wrapper = mount(PixelIcon, { props: { name: 'square', size: 20 } })
    const style = wrapper.find('svg').attributes('style') || ''
    expect(style).toContain('20px')
  })
})
