/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LayerPanel from '../../../src/pixel-studio/ui/LayerPanel.vue'

const layers = [
  { id: 'l1', name: '底层', visible: true, palette: {}, grid: ['..'] },
  { id: 'l2', name: '上层', visible: true, palette: { a1: { hex: '#5c8a5c' } }, grid: ['a1'] }
]
const baseProps = { layers, activeLayerId: 'l2', selectedLayerIds: ['l2'], soloMode: false, docWidth: 1, docHeight: 1, renderVersion: 0 }

describe('LayerPanel 图层菜单与排序', () => {
  let wrapper
  let fillRect
  beforeEach(() => {
    fillRect = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), fillRect, imageSmoothingEnabled: false, fillStyle: '' })
  })
  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  it('右键菜单可以进入内联重命名并提交新名称', async () => {
    wrapper = mount(LayerPanel, { props: baseProps })
    await wrapper.findAll('.pixel-layer')[0].trigger('contextmenu', { clientX: 30, clientY: 30 })
    expect(wrapper.find('.pixel-layer-menu').exists()).toBe(true)
    await wrapper.findAll('.pixel-layer-menu button')[0].trigger('click')
    const input = wrapper.find('.pixel-layer__name-input')
    await input.setValue('角色')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('rename-layer')).toEqual([['l2', '角色']])
  })

  it('右键删除携带目标图层 id；拖到另一层时请求交换顺序', async () => {
    wrapper = mount(LayerPanel, { props: baseProps })
    const rows = wrapper.findAll('.pixel-layer')
    await rows[0].trigger('contextmenu', { clientX: 30, clientY: 30 })
    await wrapper.findAll('.pixel-layer-menu button')[1].trigger('click')
    expect(wrapper.emitted('remove-layer')).toEqual([['l2']])

    const dataTransfer = { setData() {}, effectAllowed: '' }
    await rows[0].trigger('dragstart', { dataTransfer })
    await rows[1].trigger('drop')
    expect(wrapper.emitted('reorder-layer')).toEqual([['l2', 'l1']])
  })

  it('每个图层使用 canvas 显示按已画区域裁切的像素缩略图', async () => {
    wrapper = mount(LayerPanel, { props: baseProps })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pixel-layer__thumb canvas')).toHaveLength(2)
    expect(fillRect).toHaveBeenCalled()
  })

  it('普通点击替换选择，Ctrl 点击切换选择，Shift 点击发出范围选择', async () => {
    wrapper = mount(LayerPanel, { props: baseProps })
    const rows = wrapper.findAll('.pixel-layer')
    await rows[1].trigger('click')
    await rows[1].trigger('click', { ctrlKey: true })
    await rows[1].trigger('click', { shiftKey: true })
    expect(wrapper.emitted('select')).toEqual([
      ['l1', 'replace'],
      ['l1', 'toggle'],
      ['l1', 'range']
    ])
  })
})
