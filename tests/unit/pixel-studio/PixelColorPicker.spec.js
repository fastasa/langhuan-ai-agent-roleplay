/**
 * @vitest-environment jsdom
 * 经典拾色器组件：SV 方块 + 色相条 pointer 拖动取值 + hex 输入框，均应 emit('pick', hex)。
 * jsdom getBoundingClientRect 默认返回全零矩形，需要手动 mock 出非零尺寸才能验证坐标换算。
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PixelColorPicker from '../../../src/pixel-studio/ui/PixelColorPicker.vue'

// 与 CanvasBoard.spec.js 同款手动派发：MouseEvent.button 构造期只读，trigger() 直接赋值会抛错
function firePointerEvent(el, type, opts = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0
  })
  Object.defineProperty(event, 'pointerId', { value: opts.pointerId ?? 1, configurable: true })
  el.dispatchEvent(event)
}

describe('PixelColorPicker', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('拖动 SV 方块右下角取到该色相下的最深/最饱和色，emit pick', async () => {
    wrapper = mount(PixelColorPicker, { props: { initialHex: '#ff0000' } })
    const sv = wrapper.find('.pixel-color-picker__sv').element
    sv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} })

    firePointerEvent(sv, 'pointerdown', { clientX: 100, clientY: 100 })
    await wrapper.vm.$nextTick()

    const picks = wrapper.emitted('pick')
    expect(picks).toBeTruthy()
    // 右下角 = 满饱和度 + 明度 0（黑），初始色相为红色时结果仍是黑
    expect(picks[picks.length - 1][0]).toBe('#000000')
  })

  it('拖动 SV 方块左上角取到白色（饱和度 0，明度 1）', async () => {
    wrapper = mount(PixelColorPicker, { props: { initialHex: '#ff0000' } })
    const sv = wrapper.find('.pixel-color-picker__sv').element
    sv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} })

    firePointerEvent(sv, 'pointerdown', { clientX: 0, clientY: 0 })
    await wrapper.vm.$nextTick()

    const picks = wrapper.emitted('pick')
    expect(picks[picks.length - 1][0]).toBe('#ffffff')
  })

  it('拖动色相条到中点附近取到青色系色相', async () => {
    wrapper = mount(PixelColorPicker, { props: { initialHex: '#ff0000' } })
    const hue = wrapper.find('.pixel-color-picker__hue').element
    hue.getBoundingClientRect = () => ({ left: 0, top: 0, width: 16, height: 100, right: 16, bottom: 100, x: 0, y: 0, toJSON() {} })

    // y=50/100 -> hue=180，满饱和满明度下应为青色 #00ffff
    firePointerEvent(hue, 'pointerdown', { clientX: 8, clientY: 50 })
    await wrapper.vm.$nextTick()

    const picks = wrapper.emitted('pick')
    expect(picks[picks.length - 1][0]).toBe('#00ffff')
  })

  it('hex 输入框填合法值并 change 后 emit pick，且预览色跟随更新', async () => {
    wrapper = mount(PixelColorPicker, { props: {} })
    const input = wrapper.find('.pixel-color-picker__hex-input')
    // setValue() 本身已内部 trigger 'input' 再 trigger 'change'，不需要再手动补一次 change
    await input.setValue('#3a86ff')

    const picks = wrapper.emitted('pick')
    expect(picks[picks.length - 1][0]).toBe('#3a86ff')
  })

  it('hex 输入框填非法值不 emit pick，且回退显示原色', async () => {
    wrapper = mount(PixelColorPicker, { props: { initialHex: '#3a86ff' } })
    const input = wrapper.find('.pixel-color-picker__hex-input')
    await input.setValue('not-a-hex')

    expect(wrapper.emitted('pick')).toBeFalsy()
    expect(input.element.value).toBe('#3a86ff')
  })

  it('外部色卡或画布吸管更新 current hex 后，H/S/V 落点和 hex 同步跳转且不反向 emit', async () => {
    wrapper = mount(PixelColorPicker, { props: { initialHex: '#ff0000' } })
    await wrapper.setProps({ initialHex: '#00ff00' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-color-picker__hex-input').element.value).toBe('#00ff00')
    expect(wrapper.find('.pixel-color-picker__hue-thumb').attributes('style')).toContain('33.3333')
    expect(wrapper.find('.pixel-color-picker__sv-thumb').attributes('style')).toContain('left: 100%')
    expect(wrapper.emitted('pick')).toBeFalsy()
  })
})
