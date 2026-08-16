/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PalettePanel from '../../../src/pixel-studio/ui/PalettePanel.vue'
import PixelColorPicker from '../../../src/pixel-studio/ui/PixelColorPicker.vue'

function baseProps(overrides = {}) {
  return {
    palette: {
      a1: { hex: '#ff0000', name: '红' },
      a2: { hex: '#00ff00' },
      a3: { hex: '#0000ff' }
    },
    currentColor: 'a1',
    currentHex: '#ff0000',
    stats: [
      { code: 'a1', hex: '#ff0000', count: 3, pct: 0.5 },
      { code: 'a2', hex: '#00ff00', count: 2, pct: 1 / 3 },
      { code: '..', hex: null, count: 1, pct: 1 / 6 }
    ],
    highlightCode: null,
    colorBoardHeight: 184,
    ...overrides
  }
}

describe('PalettePanel 画布用色真值与多选抽屉', () => {
  let wrapper
  afterEach(() => { wrapper?.unmount(); wrapper = undefined })

  it('只显示画布实际使用的颜色，零像素 palette 项不进入色卡', () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    const labels = wrapper.findAll('.pixel-swatch__tooltip').map((item) => item.text())
    expect(labels).toEqual(['a1 · 50.0%', 'a2 · 33.3%', '透明 · 16.7%'])
    expect(labels.some((label) => label.startsWith('a3'))).toBe(false)
  })

  it('取色器滑动只提交草稿 hex，不新增正式 palette 项', async () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    wrapper.findComponent(PixelColorPicker).vm.$emit('pick', '#abcdef')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick-color')).toEqual([['#abcdef']])
    expect(wrapper.emitted('add-color')).toBeUndefined()
    expect(wrapper.emitted('select-color')).toBeUndefined()
  })

  it('Ctrl 单点切换多选，Shift 按锚点连续选择', async () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    const swatches = wrapper.findAll('.pixel-swatch')
    await swatches[0].trigger('click')
    await swatches[1].trigger('click', { ctrlKey: true })
    expect(wrapper.find('.pixel-palette__drawer').text()).toContain('已选择 2 个颜色')
    expect(wrapper.findAll('.pixel-swatch--active')).toHaveLength(2)

    await swatches[1].trigger('click')
    await swatches[0].trigger('click', { shiftKey: true })
    expect(wrapper.findAll('.pixel-swatch--active')).toHaveLength(2)
  })

  it('单色高亮开启后普通点击另一色卡，高亮跟随新色；多选时退出单色高亮', async () => {
    wrapper = mount(PalettePanel, { props: baseProps({ highlightCode: 'a1' }) })
    const swatches = wrapper.findAll('.pixel-swatch')
    await swatches[1].trigger('click')
    expect(wrapper.emitted('update:highlight-code').at(-1)).toEqual(['a2'])

    await wrapper.setProps({ highlightCode: 'a2' })
    await swatches[0].trigger('click', { ctrlKey: true })
    expect(wrapper.emitted('update:highlight-code').at(-1)).toEqual([null])
  })

  it('颜色名在抽屉标题点击后编辑，必须点击保存才提交', async () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    await wrapper.findAll('.pixel-swatch')[0].trigger('click')
    expect(wrapper.find('.pixel-palette__name-trigger').text()).toBe('红')
    await wrapper.find('.pixel-palette__name-trigger').trigger('click')
    const input = wrapper.find('.pixel-palette__name-editor input')
    await input.setValue('暖红')
    expect(wrapper.emitted('update-color')).toBeUndefined()
    await wrapper.find('.pixel-palette__name-editor .pixel-palette__primary').trigger('click')
    expect(wrapper.emitted('update-color')).toEqual([['a1', '#ff0000', '暖红']])
  })

  it('替换流程整合在原抽屉内，不生成独立卡片', async () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    await wrapper.findAll('.pixel-swatch')[0].trigger('click')
    await wrapper.find('.pixel-palette__replace').trigger('click')
    expect(wrapper.find('.pixel-palette__drawer .pixel-palette__replace-section').exists()).toBe(true)
    expect(wrapper.find('.pixel-palette__replace-bar').exists()).toBe(false)
    await wrapper.findAll('.pixel-swatch')[1].trigger('click')
    expect(wrapper.emitted('remove-color')).toEqual([['a1', 'a2']])
  })

  it('多选抽屉可提交统一 H/S/V 偏移和平均合并', async () => {
    wrapper = mount(PalettePanel, { props: baseProps() })
    const swatches = wrapper.findAll('.pixel-swatch')
    await swatches[0].trigger('click')
    await swatches[1].trigger('click', { ctrlKey: true })
    const sliders = wrapper.findAll('.pixel-palette__hsv-group input')
    await sliders[0].setValue(30)
    await wrapper.find('.pixel-palette__detail-actions--stack .pixel-palette__primary').trigger('click')
    expect(wrapper.emitted('adjust-colors')).toEqual([[['a1', 'a2'], { hue: 30, saturation: 0, brightness: 0 }]])
    await wrapper.findAll('.pixel-palette__detail-actions--stack button')[1].trigger('click')
    expect(wrapper.emitted('average-colors')).toEqual([[['a1', 'a2']]])
  })
})
