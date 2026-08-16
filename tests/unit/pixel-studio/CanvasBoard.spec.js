/**
 * @vitest-environment jsdom
 * 画布视口：V 只显示拖画预览；M/R 正式选区保留蚂蚁线。
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import CanvasBoard from '../../../src/pixel-studio/ui/CanvasBoard.vue'

function makeDoc() {
  return {
    version: 3,
    name: '测试',
    width: 16,
    height: 16,
    frames: [{ id: 'f1', durationMs: 200, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#000000' } }, grid: Array(16).fill('..'.repeat(16)) }] }],
    playback: { loop: true }
  }
}

function baseProps(overrides = {}) {
  return {
    doc: makeDoc(),
    tool: 'brush',
    brushSize: 1,
    shapeFilled: false,
    currentColor: 'a1',
    currentHex: '#000000',
    highlightCode: null,
    selection: null,
    renderVersion: 0,
    showGrid: true,
    showCheckerboard: true,
    spacePanHeld: false,
    activeLayerId: 'l1',
    soloLayer: false,
    ...overrides
  }
}

describe('CanvasBoard 选择与正式选区', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('无选区时不渲染选区框', () => {
    wrapper = mount(CanvasBoard, { props: baseProps() })
    expect(wrapper.find('.pixel-selection-marquee').exists()).toBe(false)
  })

  it('正式选区存在时渲染持久蚂蚁线，但不冒充拖画矩形', () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ selection: { width: 16, height: 16, cells: new Set([1, 2, 3]) } }) })
    expect(wrapper.find('.pixel-selection-marquee').exists()).toBe(false)
    expect(wrapper.findAll('.pixel-selection-canvas')).toHaveLength(2)
    expect(wrapper.find('.pixel-selection-outline').exists()).toBe(false)
    expect(wrapper.find('svg.pixel-selection-outline').exists()).toBe(false)
  })

  it('V 拖画时显示临时矩形，松手后消失且不提交正式选区', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'select' }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, clientX: 1, clientY: 1 })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 3, clientY: 3 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-selection-marquee').exists()).toBe(true)
    firePointerEvent(el, 'pointerup', { pointerId: 1, clientX: 3, clientY: 3 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-selection-marquee').exists()).toBe(false)
    expect(wrapper.emitted('selection-change')).toBeUndefined()
  })

  it('选区工具按 Ctrl 拖画执行减选区，不触发像素移动或临时吸管', async () => {
    const selection = { width: 16, height: 16, cells: new Set([0]) }
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'marquee', selection }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0, ctrlKey: true })
    firePointerEvent(el, 'pointerup', { pointerId: 1, clientX: 0, clientY: 0, ctrlKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('eyedrop')).toBeUndefined()
    expect(wrapper.emitted('move-start')).toBeUndefined()
    expect(wrapper.emitted('selection-change').at(-1)[0]).toBeNull()
  })

  it('M 矩形选区松手后提交掩码并显示正式蚂蚁线', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'marquee' }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, clientX: 1, clientY: 1 })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 3, clientY: 3 })
    firePointerEvent(el, 'pointerup', { pointerId: 1, clientX: 3, clientY: 3 })
    const mask = wrapper.emitted('selection-change').at(-1)[0]
    await wrapper.setProps({ selection: mask })
    expect(mask.cells.size).toBeGreaterThan(0)
    expect(wrapper.findAll('.pixel-selection-canvas')).toHaveLength(2)
  })

  it('自由变换显示八个拉伸手柄，拖动右侧手柄发出目标包围盒', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ transformBounds: { x: 1, y: 1, width: 2, height: 2 }, readOnly: true }) })
    expect(wrapper.findAll('.pixel-transform-handle')).toHaveLength(8)
    const east = wrapper.find('.pixel-transform-handle--e').element
    firePointerEvent(east, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 10 })
    firePointerEvent(window, 'pointermove', { pointerId: 1, clientX: 13, clientY: 10 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('transform-preview').at(-1)[0]).toEqual({ x: 1, y: 1, width: 5, height: 2 })
    firePointerEvent(window, 'pointerup', { pointerId: 1, clientX: 13, clientY: 10 })
  })
})

describe('CanvasBoard 自绘吸管', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('鼠标进入画布时显示吸管图标，并在色环中保持上新下旧的分区', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'eyedropper', currentColor: 'a1' }) })
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pixel-viewport').element

    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 10, clientY: 10 })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-eyedrop-cursor').exists()).toBe(true)
    expect(wrapper.find('.pixel-eyedrop-cursor__icon').exists()).toBe(true)
    expect(wrapper.find('.pixel-eyedrop-cursor__new').exists()).toBe(true)
    expect(wrapper.find('.pixel-eyedrop-cursor__old').exists()).toBe(true)
    const source = readFileSync('src/pixel-studio/ui/CanvasBoard.vue', 'utf8')
    expect(source).toContain('left: -2.333px')
    expect(source).toContain('top: -25.667px')
  })

  it('点击取色导致当前色变化时，下半环立即响应新 currentColor，不依赖下一次 pointermove', async () => {
    const doc = makeDoc()
    doc.frames[0].layers[0].palette.a2 = { hex: '#336699' }
    wrapper = mount(CanvasBoard, { props: baseProps({ doc, tool: 'eyedropper', currentColor: 'a1' }) })
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 10, clientY: 10 })
    await wrapper.vm.$nextTick()

    await wrapper.setProps({ currentColor: 'a2', currentHex: '#336699' })
    expect(wrapper.find('.pixel-eyedrop-cursor__old').attributes('style')).toContain('background: rgb(51, 102, 153)')
  })

  it('吸管模式按住左键拖动会持续取色，松开后移动不再取色', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'eyedropper', currentColor: 'a1' }) })
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pixel-viewport').element

    firePointerEvent(el, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 20, clientY: 20 })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 30, clientY: 30 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('eyedrop')).toHaveLength(3)

    firePointerEvent(el, 'pointerup', { pointerId: 1, button: 0, clientX: 30, clientY: 30 })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 40, clientY: 40 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('eyedrop')).toHaveLength(3)
  })

  it('旧 Alt+点击临时取色分支已退役，普通笔刷即使事件带 altKey 也仍按当前有效工具作画', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'brush' }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, button: 0, clientX: 1, clientY: 1, altKey: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('eyedrop')).toBeUndefined()
    expect(wrapper.emitted('paint-cells')).toHaveLength(1)
  })
})

// vue-test-utils 的 trigger() 对 pointerdown/up 这类非标准映射事件是"先建 Event 再直接赋值扩展字段"，
// 而 MouseEvent.prototype.button 是构造期只读的 getter，直接赋值会抛错；改为手动 dispatchEvent，
// 用构造函数 init dict 正确设置 button，pointerId 再用 defineProperty 补上（MouseEvent 本身没有该字段）。
function firePointerEvent(el, type, opts = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    shiftKey: !!opts.shiftKey,
    ctrlKey: !!opts.ctrlKey,
    altKey: !!opts.altKey
  })
  Object.defineProperty(event, 'pointerId', { value: opts.pointerId, configurable: true })
  el.dispatchEvent(event)
}

describe('CanvasBoard 指针交互护栏', () => {
  let wrapper

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('多指针劫持守卫：拖动中第二根手指按下/移动被忽略，第一根手指的笔画不受影响', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'brush' }) })
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pixel-viewport').element

    firePointerEvent(el, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells')).toHaveLength(1)

    // 第二根手指（不同 pointerId）按下：应被守卫直接吞掉，不产生新的一笔
    firePointerEvent(el, 'pointerdown', { pointerId: 2, button: 0, clientX: 200, clientY: 200 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells')).toHaveLength(1)

    // 第二根手指移动同样被忽略
    firePointerEvent(el, 'pointermove', { pointerId: 2, clientX: 220, clientY: 220 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells')).toHaveLength(1)

    // 第一根手指（真正在拖动的那个）移动仍正常出笔
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 260, clientY: 260 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells').length).toBeGreaterThan(1)

    firePointerEvent(el, 'pointerup', { pointerId: 1, button: 0 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stroke-end')).toBeTruthy()
  })

  it('选择工具 Ctrl+左拖进入像素移动，不生成减选区手势', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'select' }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, clientX: 2, clientY: 2, ctrlKey: true })
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 8, clientY: 5, ctrlKey: true })
    firePointerEvent(el, 'pointerup', { pointerId: 1, clientX: 8, clientY: 5, ctrlKey: true })
    expect(wrapper.emitted('move-start')).toHaveLength(1)
    expect(wrapper.emitted('move-preview').length).toBeGreaterThan(0)
    expect(wrapper.emitted('move-end')).toHaveLength(1)
  })

  it('油漆桶点击只提交起始格给父层决定选区填充或洪泛区域', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'bucket' }) })
    const el = wrapper.find('.pixel-viewport').element
    firePointerEvent(el, 'pointerdown', { pointerId: 1, clientX: 2, clientY: 3 })
    expect(wrapper.emitted('bucket-fill')).toHaveLength(1)
    expect(wrapper.emitted('stroke-start')).toBeUndefined()
  })

  it('普通滚轮平移画布；放大镜工具滚轮缩放', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'select' }) })
    const el = wrapper.find('.pixel-viewport').element
    const beforePan = wrapper.find('.pixel-stage').attributes('style')
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 }))
    await wrapper.vm.$nextTick()
    const afterPan = wrapper.find('.pixel-stage').attributes('style')
    expect(afterPan).not.toBe(beforePan)

    await wrapper.setProps({ tool: 'zoom' })
    const beforeZoom = wrapper.find('.pixel-stage').attributes('style')
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -80, clientX: 5, clientY: 5 }))
    await wrapper.vm.$nextTick()
    const afterZoom = wrapper.find('.pixel-stage').attributes('style')
    expect(afterZoom).not.toBe(beforeZoom)
  })

  it('笔画中途按下中键：先提交当前笔画再进入平移，松开后继续移动不再落笔（无穿越直线）', async () => {
    wrapper = mount(CanvasBoard, { props: baseProps({ tool: 'brush' }) })
    await wrapper.vm.$nextTick()
    const el = wrapper.find('.pixel-viewport').element

    firePointerEvent(el, 'pointerdown', { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stroke-start')).toHaveLength(1)
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 200, clientY: 200 })
    await wrapper.vm.$nextTick()
    const paintCountBeforePan = wrapper.emitted('paint-cells').length

    // 中键按下（同一物理鼠标，pointerId 不变）：应先结束当前描边，再进入平移
    firePointerEvent(el, 'pointerdown', { pointerId: 1, button: 1, clientX: 200, clientY: 200 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('stroke-end')).toHaveLength(1)

    // 平移过程中移动鼠标不应产生新的 paint-cells
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 260, clientY: 260 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells').length).toBe(paintCountBeforePan)

    firePointerEvent(el, 'pointerup', { pointerId: 1, button: 1 })
    await wrapper.vm.$nextTick()

    // 平移结束后，不按任何键继续移动鼠标，不应恢复旧笔画继续落笔
    firePointerEvent(el, 'pointermove', { pointerId: 1, clientX: 320, clientY: 320 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('paint-cells').length).toBe(paintCountBeforePan)
  })
})
