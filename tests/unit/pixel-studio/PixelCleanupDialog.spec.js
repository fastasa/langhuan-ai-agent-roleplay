/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PixelCleanupDialog from '../../../src/pixel-studio/ui/PixelCleanupDialog.vue'
import { PIXEL_CLEANUP_PRESETS_STORAGE_KEY } from '../../../src/pixel-studio/ui/pixelCleanupPresets'

const report = {
  changedCellCount: 12,
  usedColorCountBefore: 9,
  usedColorCountAfter: 6,
  mergedColorCount: 3,
  removedSpeckleCellCount: 4,
  processedLineCellCount: 7
}

describe('去除杂色工具窗', () => {
  beforeEach(() => window.localStorage.clear())

  it('默认使用立绘规整预设并输出结果摘要', () => {
    const wrapper = mount(PixelCleanupDialog, { props: { hasSelection: false, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] } })
    expect(wrapper.find('.pixel-adjustment__scope').text()).toContain('当前 1 个图层')
    expect(wrapper.find('.pixel-cleanup__preset select').element.value).toBe('portrait')
    expect(wrapper.find('.pixel-cleanup__report').text()).toContain('使用色 9→6')
    expect(wrapper.find('.pixel-cleanup__report').text()).toContain('线条 7 格')
  })

  it('参数修改进入自定义；应用只发一次确认、窗口保留并把强度归零', async () => {
    const wrapper = mount(PixelCleanupDialog, { props: { hasSelection: true, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] } })
    const strength = wrapper.find('.pixel-cleanup__master input')
    await strength.setValue(72)
    expect(wrapper.find('.pixel-cleanup__preset select').element.value).toBe('custom')

    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.find('.pixel-cleanup__master output').text()).toBe('0')
    expect(wrapper.find('.pixel-dialog__primary').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.pixel-cleanup__preset').exists()).toBe(true)
  })

  it('保护色进入确定性参数并可再次取消', async () => {
    const wrapper = mount(PixelCleanupDialog, { props: { hasSelection: false, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] } })
    await wrapper.find('details:last-of-type summary').trigger('click')
    const chip = wrapper.find('.pixel-cleanup__protect-colors button')
    await chip.trigger('click')
    expect(chip.classes()).toContain('pixel-cleanup__protect-color--active')
    await chip.trigger('click')
    expect(chip.classes()).not.toContain('pixel-cleanup__protect-color--active')
  })

  it('可命名保存自定义预设，并在重新打开工具窗后再次读取', async () => {
    const props = { hasSelection: false, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] }
    const wrapper = mount(PixelCleanupDialog, { props })
    await wrapper.find('.pixel-cleanup__master input').setValue(72)
    await wrapper.find('.pixel-cleanup__preset-editor input').setValue('  小人净化  ')
    await wrapper.find('.pixel-cleanup__preset-editor button').trigger('click')

    const stored = JSON.parse(window.localStorage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('小人净化')
    expect(stored[0].options.strength).toBe(72)
    const savedId = stored[0].id
    wrapper.unmount()

    const reopened = mount(PixelCleanupDialog, { props })
    await reopened.vm.$nextTick()
    expect(reopened.find(`option[value="saved:${savedId}"]`).text()).toBe('小人净化')
    await reopened.find('.pixel-cleanup__preset select').setValue(`saved:${savedId}`)
    expect(reopened.find('.pixel-cleanup__master output').text()).toBe('72')
  })

  it('再次保存会覆盖当前预设，也可同时改名', async () => {
    const props = { hasSelection: false, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] }
    const wrapper = mount(PixelCleanupDialog, { props })
    await wrapper.find('.pixel-cleanup__master input').setValue(70)
    await wrapper.find('.pixel-cleanup__preset-editor input').setValue('初版')
    await wrapper.find('.pixel-cleanup__preset-editor button').trigger('click')
    const first = JSON.parse(window.localStorage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY))[0]

    await wrapper.find('.pixel-cleanup__master input').setValue(84)
    await wrapper.find('.pixel-cleanup__preset-editor input').setValue('精修版')
    expect(wrapper.find('.pixel-cleanup__preset-editor button').text()).toBe('再次保存')
    await wrapper.find('.pixel-cleanup__preset-editor button').trigger('click')

    const stored = JSON.parse(window.localStorage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: first.id, name: '精修版', options: { strength: 84 } })
  })

  it('删除自定义预设必须二次确认，确认后同步移除持久化数据', async () => {
    const props = { hasSelection: false, report, palette: { a1: { hex: '#112233' } }, usedCodes: ['a1'] }
    const wrapper = mount(PixelCleanupDialog, { props })
    await wrapper.find('.pixel-cleanup__master input').setValue(70)
    await wrapper.find('.pixel-cleanup__preset-editor input').setValue('待删除')
    await wrapper.find('.pixel-cleanup__preset-editor button').trigger('click')

    const remove = wrapper.find('.pixel-cleanup__preset-delete')
    await remove.trigger('click')
    expect(remove.text()).toBe('确认删除')
    expect(JSON.parse(window.localStorage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY))).toHaveLength(1)
    await remove.trigger('click')
    expect(JSON.parse(window.localStorage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY))).toEqual([])
    expect(wrapper.find('.pixel-cleanup__preset select').element.value).toBe('portrait')
  })
})
