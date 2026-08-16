/**
 * @vitest-environment jsdom
 * 像素中控台顶层页面冒烟测试：挂载不炸 + 关键区块（菜单栏/工具条/画布视口/调色盘/状态栏）渲染。
 * jsdom 不实现 canvas 2D 上下文（getContext 返回 null），CanvasBoard 内部已对 ctx 判空短路，
 * 因此本测试无需额外 mock canvas，只验证 DOM 结构与不抛错。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PixelStudioPage from '../../../src/pixel-studio/ui/PixelStudioPage.vue'
import CanvasBoard from '../../../src/pixel-studio/ui/CanvasBoard.vue'
import PalettePanel from '../../../src/pixel-studio/ui/PalettePanel.vue'
import PixelColorPicker from '../../../src/pixel-studio/ui/PixelColorPicker.vue'
import PixelNavigator from '../../../src/pixel-studio/ui/PixelNavigator.vue'
import TimelineDock from '../../../src/pixel-studio/ui/TimelineDock.vue'

function makeDocSummary(overrides = {}) {
  return { id: 'd1', name: '另一张图', width: 8, height: 8, frameCount: 1, updatedAt: new Date().toISOString(), ...overrides }
}
function makeFullDoc(overrides = {}) {
  return {
    version: 1,
    name: '另一张图',
    width: 8,
    height: 8,
    palette: { b1: { hex: '#123456' } },
    frames: [{ id: 'f1', durationMs: 200, grid: Array(8).fill('..'.repeat(8)) }],
    playback: { loop: true },
    ...overrides
  }
}

describe('PixelStudioPage', () => {
  let wrapper

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ docs: [] })
      })
    )
    // keymap 落 localStorage，用例间不清空会互相污染（如某用例改绑快捷键后残留影响后续用例的按键分发断言）
    window.localStorage.clear()
  })

  afterEach(() => {
    // 组件监听了 window keydown/keyup/beforeunload，不 unmount 会跨用例残留监听器，串扰后续测试的快捷键触发
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('挂载不炸，且渲染菜单栏/工具条/画布视口/调色盘/状态栏', () => {
    wrapper = mount(PixelStudioPage)

    expect(wrapper.find('.menu-bar').exists()).toBe(true)
    expect(wrapper.find('.context-bar').exists()).toBe(false)
    expect(wrapper.find('.tool-rail').exists()).toBe(true)
    expect(wrapper.find('.pixel-viewport').exists()).toBe(true)
    expect(wrapper.find('.pixel-palette').exists()).toBe(true)
    expect(wrapper.find('.status-bar').exists()).toBe(true)
    expect(wrapper.findComponent(TimelineDock).exists()).toBe(true)

    // 默认新建 64x64 空白文档，名称显示在菜单栏
    expect(wrapper.find('.menu-bar__name').element.value).toBe('未命名')
    expect(wrapper.findAll('.tool-rail__btn')[0].classes()).toContain('tool-rail__btn--active')
  })

  it('创建时间轴并复制到第二画帧后，画笔只写当前画帧，不串改第一帧', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    let timeline = wrapper.findComponent(TimelineDock)
    timeline.vm.$emit('create-timeline')
    await wrapper.vm.$nextTick()
    const dialogInputs = wrapper.findAll('.timeline-dialog__input-row input')
    await dialogInputs[0].setValue(10)
    await dialogInputs[1].setValue(2)
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    await wrapper.vm.$nextTick()

    timeline = wrapper.findComponent(TimelineDock)
    expect(timeline.props('doc').timeline).toEqual({ fps: 10, rangeStartFrame: 1, rangeEndFrame: 20 })
    timeline.vm.$emit('duplicate-frame')
    await wrapper.vm.$nextTick()

    const board = wrapper.findComponent(CanvasBoard)
    expect(board.props('frameIndex')).toBe(1)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
    board.vm.$emit('stroke-end')
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 2)).toBe('..')
    expect(board.props('doc').frames[1].layers[0].grid[0].slice(0, 2)).toBe('a1')
  })

  it('工具上下文栏只在需要时出现，网格、棋盘底与视口控制只保留在视图菜单', async () => {
    wrapper = mount(PixelStudioPage)

    const brushButton = wrapper.findAll('.tool-rail__btn').find((button) => button.attributes('title').startsWith('笔刷'))
    await brushButton.trigger('click')
    expect(wrapper.find('.context-bar').exists()).toBe(true)
    expect(wrapper.find('.menu-bar__right .context-bar').exists()).toBe(true)
    expect(wrapper.find('.context-bar').text()).not.toMatch(/网格|棋盘底|适应|%/)

    const viewButton = wrapper.findAll('.menu-bar__menu-btn').find((button) => button.text() === '视图')
    await viewButton.trigger('click')
    const labels = wrapper.findAll('.menu-bar__item-label').map((item) => item.text())
    expect(labels).toEqual(expect.arrayContaining(['网格开关', '棋盘底开关', '缩略图', '适应窗口', '实际大小', '放大', '缩小']))
  })

  it('视图菜单可打开缩略图，导航事件调用主画布唯一居中入口', async () => {
    wrapper = mount(PixelStudioPage)
    const viewButton = wrapper.findAll('.menu-bar__menu-btn').find((button) => button.text() === '视图')
    await viewButton.trigger('click')
    const thumbnailItem = wrapper.findAll('.menu-bar__item').find((item) => item.text().includes('缩略图'))
    await thumbnailItem.trigger('click')
    expect(wrapper.findComponent(PixelNavigator).exists()).toBe(true)
    expect(window.localStorage.getItem('pixel-studio:show-navigator')).toBe('true')

    const board = wrapper.findComponent(CanvasBoard)
    board.find('.pixel-viewport').element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} })
    wrapper.findComponent(PixelNavigator).vm.$emit('navigate', { x: 12, y: 8 })
    await wrapper.vm.$nextTick()
    const viewport = board.emitted('viewport-change').at(-1)[0]
    expect(viewport.panX).toBe(100 - 12 * viewport.zoom)
    expect(viewport.panY).toBe(50 - 8 * viewport.zoom)
  })

  it('缩略图获得焦点时 Space 留在缩略图键盘域，不触发主画布平移态', async () => {
    window.localStorage.setItem('pixel-studio:show-navigator', 'true')
    wrapper = mount(PixelStudioPage)
    const content = wrapper.find('.pixel-navigator__content').element
    content.focus()
    content.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CanvasBoard).props('spacePanHeld')).toBe(false)
    expect(wrapper.find('.pixel-navigator__content--pan-ready').exists()).toBe(true)
  })

  it('缩略图操作后焦点留在小窗内，普通工具快捷键仍由工作台分发', async () => {
    window.localStorage.setItem('pixel-studio:show-navigator', 'true')
    // 挂到真实 document 树，键盘事件才会按浏览器路径冒泡到 window 上的全局分发器。
    wrapper = mount(PixelStudioPage, { attachTo: document.body })
    const content = wrapper.find('.pixel-navigator__content').element
    content.focus()

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CanvasBoard).props('tool')).toBe('eraser')

    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(CanvasBoard).props('tool')).toBe('brush')
  })

  it('工作台全域屏蔽浏览器原生右键菜单', () => {
    wrapper = mount(PixelStudioPage)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    wrapper.find('.pixel-studio__canvas-area').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('全局快捷键守卫唯一放行 Ctrl+Shift+R 浏览器硬刷新', () => {
    wrapper = mount(PixelStudioPage)
    const hardRefresh = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(hardRefresh)
    expect(hardRefresh.defaultPrevented).toBe(false)

    const normalRefresh = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(normalRefresh)
    expect(normalRefresh.defaultPrevented).toBe(true)
  })

  // 根因修复断言：新建文档调色板非空、currentColor 落在第一个种子色上（否则默认透明色作画不可见）
  it('默认新文档 currentColor 为种子调色板第一色 a1（ToolRail 当前色徽标可见）', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.tool-rail__swatch-label').text()).toBe('a1 · X 换')
  })

  it('取色器只更新草稿色，首次真实落格才物化并显示色卡', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.findAll('.pixel-swatch')).toHaveLength(1) // 仅透明格

    wrapper.findComponent(PixelColorPicker).vm.$emit('pick', '#abcdef')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pixel-swatch')).toHaveLength(1)
    expect(wrapper.find('.tool-rail__swatch-label').text()).toBe('新色 · X 换')

    const board = wrapper.findComponent(CanvasBoard)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
    board.vm.$emit('stroke-end')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pixel-swatch__tooltip').map((item) => item.text()).some((text) => text.startsWith('a9 ·'))).toBe(true)
  })

  it('画布吸管取色后，右栏颜色板同步跳到对应 hex 与 H/S/V 落点', async () => {
    wrapper = mount(PixelStudioPage)
    wrapper.findComponent(CanvasBoard).vm.$emit('eyedrop', { code: 'a1', hex: '#00ff00' })
    await wrapper.vm.$nextTick()
    const picker = wrapper.findComponent(PixelColorPicker)
    expect(picker.find('.pixel-color-picker__hex-input').element.value).toBe('#00ff00')
    expect(picker.find('.pixel-color-picker__hue-thumb').attributes('style')).toContain('33.3333')
  })

  it('油漆桶有正式选区时填满选区且保留选区', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    const mask = { width: 64, height: 64, cells: new Set([0, 1]) }
    board.vm.$emit('selection-change', mask)
    board.vm.$emit('bucket-fill', { x: 20, y: 20 })
    await wrapper.vm.$nextTick()
    expect(board.props('selection').cells).toEqual(mask.cells)
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 6)).toBe('a1a1..')
  })

  it('右栏图层区可新建/删除/显隐，N 在当前层上方新建、Ctrl+Q 删除当前层', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.findAll('.pixel-layer')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pixel-layer')).toHaveLength(2)
    expect(wrapper.findAll('.pixel-layer')[0].classes()).toContain('pixel-layer--active')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pixel-layer')).toHaveLength(1)

    const actions = wrapper.findAll('.pixel-layers__actions button')
    await actions[0].trigger('click')
    expect(wrapper.findAll('.pixel-layer')).toHaveLength(2)
    expect(wrapper.findAll('.pixel-layer')[0].classes()).toContain('pixel-layer--active')

    await wrapper.find('.pixel-layer__visibility').trigger('click')
    expect(wrapper.find('.pixel-layer__thumb').classes()).toContain('pixel-layer__thumb--hidden')

    await actions[1].trigger('click')
    expect(wrapper.findAll('.pixel-layer')).toHaveLength(1)
  })

  it('Shift+A / Shift+S 按图层面板视觉顺序切换上一个和下一个图层', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    await wrapper.vm.$nextTick()
    const layers = () => wrapper.findAll('.pixel-layer')
    expect(layers()).toHaveLength(3)
    expect(layers()[0].classes()).toContain('pixel-layer--active')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', shiftKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(layers()[1].classes()).toContain('pixel-layer--active')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', shiftKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(layers()[0].classes()).toContain('pixel-layer--active')
  })

  it('默认单选写入边界：擦除当前层不会改动未选中的其他图层', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    const paintCell = () => {
      board.vm.$emit('stroke-start')
      board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
      board.vm.$emit('stroke-end')
    }

    paintCell()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    await wrapper.vm.$nextTick()
    paintCell()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', cancelable: true }))
    paintCell()
    await wrapper.vm.$nextTick()

    const layers = board.props('doc').frames[0].layers
    expect(layers[0].grid[0].slice(0, 2)).toBe('a1')
    expect(layers[1].grid[0].slice(0, 2)).toBe('..')
  })

  it('显式多选写入边界：Ctrl 加选图层后擦除才同时作用于所选图层', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    const paintCell = () => {
      board.vm.$emit('stroke-start')
      board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
      board.vm.$emit('stroke-end')
    }

    paintCell()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    await wrapper.vm.$nextTick()
    paintCell()
    await wrapper.findAll('.pixel-layer')[1].trigger('click', { ctrlKey: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', cancelable: true }))
    paintCell()
    await wrapper.vm.$nextTick()

    const layers = board.props('doc').frames[0].layers
    expect(wrapper.find('.pixel-layers__selected-count').text()).toContain('2 选')
    expect(layers[0].grid[0].slice(0, 2)).toBe('..')
    expect(layers[1].grid[0].slice(0, 2)).toBe('..')
  })

  it('图层私有色卡：单选改色不串层，显式多选时按相同 hex 联动所选层', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    const paintCell = () => {
      board.vm.$emit('stroke-start')
      board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
      board.vm.$emit('stroke-end')
    }

    paintCell()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', cancelable: true }))
    await wrapper.vm.$nextTick()
    paintCell()
    const palettePanel = wrapper.findComponent(PalettePanel)
    palettePanel.vm.$emit('update-color', 'a1', '#abcdef')
    await wrapper.vm.$nextTick()

    let layers = board.props('doc').frames[0].layers
    expect(layers[0].palette.a1.hex).not.toBe('#abcdef')
    expect(layers[1].palette.a1.hex).toBe('#abcdef')

    // 先撤销单层改色，使两层重新拥有相同源色；再显式多选，用相同源 hex 联动两层。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.pixel-layer')[1].trigger('click', { ctrlKey: true })
    wrapper.findComponent(PalettePanel).vm.$emit('update-color', 'a1', '#fedcba')
    await wrapper.vm.$nextTick()

    layers = board.props('doc').frames[0].layers
    expect(layers[0].palette.a1.hex).toBe('#fedcba')
    expect(layers[1].palette.a1.hex).toBe('#fedcba')
  })

  it('Ctrl+A/C/X/V 与 Delete 只编辑当前层选中像素，没有选区时 Delete 严格无操作', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], '..')
    board.vm.$emit('stroke-end')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('selection').cells.size).toBe(64 * 64)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 2)).toBe('..')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 2)).toBe('a1')

    board.vm.$emit('selection-change', null)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 2)).toBe('a1')

    board.vm.$emit('selection-change', { width: 64, height: 64, cells: new Set([0]) })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 2)).toBe('..')
  })

  it('T 进入自由变换，拖框预览最近邻拉伸，Enter 提交且 Esc 可取消', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }, { x: 1, y: 0 }], '..')
    board.vm.$emit('stroke-end')
    board.vm.$emit('selection-change', { width: 64, height: 64, cells: new Set([0, 1]) })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('transformBounds')).toEqual({ x: 0, y: 0, width: 2, height: 1 })
    board.vm.$emit('transform-preview', { x: 0, y: 0, width: 4, height: 1 })
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 8)).toBe('a1a1a1a1')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('transformBounds')).toBeNull()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 8)).toBe('a1a1a1a1')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', cancelable: true }))
    await wrapper.vm.$nextTick()
    board.vm.$emit('transform-preview', { x: 0, y: 0, width: 1, height: 1 })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('doc').frames[0].layers[0].grid[0].slice(0, 8)).toBe('a1a1a1a1')
  })

  it('右栏宽度、色板高度和图层高度均可通过分隔线方向键调整并持久化', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()

    const side = wrapper.find('.pixel-studio__side')
    const board = wrapper.find('.pixel-palette__board')
    const layer = wrapper.find('.pixel-layers')
    expect(side.attributes('style')).toContain('284px')
    expect(board.attributes('style')).toContain('184px')
    expect(layer.attributes('style')).toContain('190px')

    await wrapper.find('.pixel-studio__side-resizer').trigger('keydown', { key: 'ArrowLeft' })
    await wrapper.find('.pixel-palette__resize').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.find('.pixel-studio__layer-resizer').trigger('keydown', { key: 'ArrowUp' })
    await wrapper.vm.$nextTick()

    expect(side.attributes('style')).toContain('294px')
    expect(board.attributes('style')).toContain('194px')
    expect(layer.attributes('style')).toContain('200px')
    expect(JSON.parse(window.localStorage.getItem('pixel-studio:panel-layout'))).toEqual({ sidebarWidth: 294, colorBoardHeight: 194, layerHeight: 200 })
  })

  it('吸管工具不调用浏览器原生 EyeDropper，改由画布显示自绘吸管与双色环', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()

    const eyedropperButton = wrapper.findAll('.tool-rail__btn').find((button) => button.attributes('title').startsWith('取色器'))
    await eyedropperButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-viewport').classes()).toContain('pixel-viewport--eyedropper')
    expect(wrapper.find('.pixel-eyedrop-result').exists()).toBe(false)
    expect(globalThis.EyeDropper).toBeUndefined()
  })

  it('Ctrl+D 取消当前选区', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const board = wrapper.findComponent(CanvasBoard)
    const mask = { width: 64, height: 64, cells: new Set([65, 66, 129]) }
    board.vm.$emit('selection-change', mask)
    await wrapper.vm.$nextTick()
    expect(board.props('selection')).toEqual(mask)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('selection')).toBeNull()
  })

  it('编辑器空白区域屏蔽浏览器原生快捷键，普通按键与输入框文本快捷键仍放行', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()

    const refresh = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true })
    window.dispatchEvent(refresh)
    expect(refresh.defaultPrevented).toBe(true)

    const help = new KeyboardEvent('keydown', { key: 'F1', cancelable: true })
    window.dispatchEvent(help)
    expect(help.defaultPrevented).toBe(true)

    const plain = new KeyboardEvent('keydown', { key: 'q', cancelable: true })
    window.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)

    const titleInput = wrapper.find('.menu-bar__name').element
    const copy = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
    titleInput.dispatchEvent(copy)
    expect(copy.defaultPrevented).toBe(false)
  })

  it('编辑菜单可打开无模态 HSV 工具窗：无选区默认全层、无遮罩、应用不关闭、外部点击不关闭', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const editMenu = wrapper.findAll('.menu-bar__menu-btn').find((button) => button.text() === '编辑')
    await editMenu.trigger('click')
    const adjustItem = wrapper.findAll('.menu-bar__item').find((button) => button.text().includes('色相'))
    await adjustItem.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-adjustment__scope').text()).toContain('当前 1 个图层')
    expect(wrapper.find('.pixel-dialog-mask').classes()).toContain('pixel-dialog-mask--modeless')
    expect(wrapper.findAll('.pixel-adjustment__secondary').some((button) => button.text() === '取消')).toBe(false)
    const preview = wrapper.find('.pixel-adjustment__preview input')
    expect(preview.element.checked).toBe(true)
    await preview.setValue(false)
    expect(preview.element.checked).toBe(false)

    await wrapper.find('.pixel-dialog-mask').trigger('click')
    expect(wrapper.find('.pixel-adjustment__scope').exists()).toBe(true)
    await wrapper.find('.pixel-dialog__primary').trigger('click')
    expect(wrapper.find('.pixel-adjustment__scope').exists()).toBe(true)
    await wrapper.find('.pixel-dialog__close').trigger('click')
    expect(wrapper.find('.pixel-adjustment__scope').exists()).toBe(false)
  })

  it('Ctrl+U 打开 HSV 调色工具窗', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-adjustment__scope').exists()).toBe(true)
  })

  it('编辑菜单用魔法棒打开去除杂色，预览期间锁写，Escape 关闭', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    const editMenu = wrapper.findAll('.menu-bar__menu-btn').find((button) => button.text() === '编辑')
    await editMenu.trigger('click')
    const cleanupItem = wrapper.findAll('.menu-bar__item').find((button) => button.text().includes('去除杂色'))
    expect(cleanupItem.find('svg').exists()).toBe(true)
    expect(cleanupItem.text()).toContain('Ctrl+Shift+U')
    await cleanupItem.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-cleanup__preset').exists()).toBe(true)
    expect(wrapper.classes()).toContain('pixel-studio--adjusting')
    expect(wrapper.findComponent(CanvasBoard).props('readOnly')).toBe(true)
    expect(wrapper.find('.menu-bar__save-btn').attributes('disabled')).toBeDefined()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-cleanup__preset').exists()).toBe(false)
  })

  it('Ctrl+Shift+U 打开去除杂色工具窗', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, shiftKey: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pixel-cleanup__preset').exists()).toBe(true)
  })

  it('已有保存过的文档时，默认先进入项目库而不是编辑器', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url)
      if (u.endsWith('/docs')) {
        return Promise.resolve({ ok: true, json: async () => ({ docs: [makeDocSummary()] }) })
      }
      if (u.includes('/docs/d1')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'd1', doc: makeFullDoc(), updatedAt: new Date().toISOString() }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.project-library').exists()).toBe(true)
    expect(wrapper.find('.menu-bar').exists()).toBe(false)
  })

  it('无任何文档时留在编辑器默认新文档', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.project-library').exists()).toBe(false)
    expect(wrapper.find('.menu-bar').exists()).toBe(true)
  })

  it('菜单「文件」→「打开…」进入项目库；点击卡片打开该文档后 currentColor 校正到新调色板第一个短码', async () => {
    let docsCallCount = 0
    const fetchMock = vi.fn((url) => {
      const u = String(url)
      if (u.endsWith('/docs')) {
        docsCallCount++
        // 首次挂载时无文档，留在编辑器；用户手动打开项目库后才返回真实列表
        const list = docsCallCount === 1 ? [] : [makeDocSummary()]
        return Promise.resolve({ ok: true, json: async () => ({ docs: list }) })
      }
      if (u.includes('/docs/d1')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'd1', doc: makeFullDoc(), updatedAt: new Date().toISOString() }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.menu-bar').exists()).toBe(true)
    expect(wrapper.find('.tool-rail__swatch-label').text()).toBe('a1 · X 换')

    const fileMenuBtn = wrapper.findAll('.menu-bar__menu-btn').find((b) => b.text() === '文件')
    await fileMenuBtn.trigger('click')
    const openItem = wrapper.findAll('.menu-bar__item').find((b) => b.text().includes('打开'))
    await openItem.trigger('click')
    await flushPromises()
    expect(wrapper.find('.project-library').exists()).toBe(true)

    const card = wrapper.findAll('.project-library__card').find((c) => !c.classes().includes('project-library__card--new'))
    expect(card).toBeTruthy()
    await card.trigger('click')
    await flushPromises()

    // 回到编辑器；currentColor 'a1' 不在新文档 palette（只有 b1）里，应回落到第一个短码 b1
    expect(wrapper.find('.menu-bar').exists()).toBe(true)
    expect(wrapper.find('.project-library').exists()).toBe(false)
    expect(wrapper.find('.tool-rail__swatch-label').text()).toBe('b1 · X 换')
  })

  it('项目库「+新建」卡片打开新建文档弹窗，确认后回到编辑器', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url)
      if (u.endsWith('/docs')) {
        return Promise.resolve({ ok: true, json: async () => ({ docs: [makeDocSummary()] }) })
      }
      if (u.includes('/docs/d1')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'd1', doc: makeFullDoc(), updatedAt: new Date().toISOString() }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.project-library').exists()).toBe(true)

    await wrapper.find('.project-library__card--new').trigger('click')
    expect(wrapper.find('.pixel-dialog').exists()).toBe(true)

    const createBtn = wrapper.findAll('.pixel-dialog__primary').find((b) => b.text() === '创建')
    await createBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.menu-bar').exists()).toBe(true)
    expect(wrapper.find('.project-library').exists()).toBe(false)
  })

  it('点击菜单栏「文件」→「新建…」打开新建文档弹窗', async () => {
    wrapper = mount(PixelStudioPage)
    const fileMenuBtn = wrapper.findAll('.menu-bar__menu-btn').find((b) => b.text() === '文件')
    await fileMenuBtn.trigger('click')
    const newItem = wrapper.findAll('.menu-bar__item').find((b) => b.text().includes('新建'))
    await newItem.trigger('click')
    expect(wrapper.find('.pixel-dialog').exists()).toBe(true)
  })

  it('快捷键 B/E 切换工具（非录入态下全局分发生效）', async () => {
    wrapper = mount(PixelStudioPage)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tool-rail__btn')[4].classes()).toContain('tool-rail__btn--active')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tool-rail__btn')[3].classes()).toContain('tool-rail__btn--active')
  })

  it('长按 Alt 临时切换到设置工具，松开或窗口失焦后恢复原工具', async () => {
    window.localStorage.setItem('pixel-studio:temporary-tool', 'eraser')
    wrapper = mount(PixelStudioPage)
    const board = wrapper.findComponent(CanvasBoard)
    expect(board.props('tool')).toBe('select')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('tool')).toBe('eraser')

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
    await wrapper.vm.$nextTick()
    expect(board.props('tool')).toBe('select')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(board.props('tool')).toBe('eraser')
    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(board.props('tool')).toBe('select')
  })

  it('弹窗打开期间挂起全局快捷键分发：Ctrl+Z 不触发撤销菜单外的副作用', async () => {
    wrapper = mount(PixelStudioPage)
    const fileMenuBtn = wrapper.findAll('.menu-bar__menu-btn').find((b) => b.text() === '文件')
    await fileMenuBtn.trigger('click')
    const newItem = wrapper.findAll('.menu-bar__item').find((b) => b.text().includes('新建'))
    await newItem.trigger('click')
    expect(wrapper.find('.pixel-dialog').exists()).toBe(true)

    // 弹窗打开时按下工具快捷键 E，不应该切换背后页面的当前工具（分发已挂起）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tool-rail__btn')[0].classes()).toContain('tool-rail__btn--active')
  })

  it('saveDoc 并发守卫：保存中重复触发 Ctrl+Shift+S 不发第二次请求', async () => {
    let resolvePost
    const fetchMock = vi.fn((_url, opts) => {
      if (!opts || opts.method !== 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ docs: [] }) })
      }
      // 保存请求故意挂起，模拟"保存中"这段时间窗口
      return new Promise((resolve) => {
        resolvePost = resolve
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(PixelStudioPage)

    // Ctrl+Shift+S 连续触发两次，第一次尚未 resolve 时第二次应被守卫吞掉
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }))
    await Promise.resolve()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }))
    await Promise.resolve()

    const postCalls = fetchMock.mock.calls.filter(([, opts]) => opts && opts.method === 'POST')
    expect(postCalls.length).toBe(1)

    // 收尾：resolve 挂起的请求，避免残留未处理 Promise 影响后续用例
    resolvePost({ ok: true, json: async () => ({ id: 'doc-1' }) })
    await Promise.resolve()
  })

  // 根因修复：keyup 侧此前用完整 chord（含修饰键）匹配 'view.pan'，Space+Shift 组合先松 Space 时
  // keyup 事件的 shiftKey 仍为 true，拼出 'shift+space' 匹配不到纯 'space'，导致平移态永久卡死
  it('Space+Shift 组合先松 Space 再松 Shift：spacePanHeld 正确复位，不会卡死在平移态', async () => {
    wrapper = mount(PixelStudioPage)
    await wrapper.vm.$nextTick()
    const canvasBoard = wrapper.findComponent(CanvasBoard)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    await wrapper.vm.$nextTick()
    expect(canvasBoard.props('spacePanHeld')).toBe(true)

    // 松开 Space 时物理上 Shift 仍按着（keyup 事件里 shiftKey=true）
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', shiftKey: true }))
    await wrapper.vm.$nextTick()
    expect(canvasBoard.props('spacePanHeld')).toBe(false)
  })

  it('窗口失焦兜底复位 spacePanHeld', async () => {
    wrapper = mount(PixelStudioPage)
    await wrapper.vm.$nextTick()
    const canvasBoard = wrapper.findComponent(CanvasBoard)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    await wrapper.vm.$nextTick()
    expect(canvasBoard.props('spacePanHeld')).toBe(true)

    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(canvasBoard.props('spacePanHeld')).toBe(false)
  })

  // 根因修复：PalettePanel 详情窗只改 hex 时 onUpdateColor 不传 name 参数（三态语义 undefined=保留），
  // 此前把「未传」和「主动清空」混为一谈，导致只改 hex 会连带清空颜色名
  it('详情窗只改 hex（不改颜色名）后，调色板原有颜色名不会被清空', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.tool-rail__swatch-label').text()).toBe('a1 · X 换')

    const board = wrapper.findComponent(CanvasBoard)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], 'a1')
    board.vm.$emit('stroke-end')
    await wrapper.vm.$nextTick()

    // a1 真正落格后才出现色卡，点击打开左展抽屉
    const swatches = wrapper.findAll('.pixel-swatch')
    const a1Swatch = swatches.find((s) => s.find('.pixel-swatch__tooltip').text().startsWith('a1'))
    await a1Swatch.trigger('click')
    await wrapper.vm.$nextTick()

    const hexInput = wrapper.find('.pixel-palette__hex-input')
    expect(hexInput.exists()).toBe(true)
    expect(wrapper.find('.pixel-palette__name-trigger').text()).toBe('黑')

    await hexInput.setValue('#334455')
    await hexInput.trigger('change')
    await wrapper.vm.$nextTick()

    // hex 改了，标题里的名字应该还在
    expect(wrapper.find('.pixel-palette__name-trigger').text()).toBe('黑')
  })

  // 三轮优化批新增根因修复：详情窗主动清空颜色名（提交空字符串）必须真的清空，不能被「保留旧名」语义吞掉
  it('详情窗主动清空颜色名后，调色板该色 name 字段被真正清除', async () => {
    wrapper = mount(PixelStudioPage)
    await flushPromises()

    const board = wrapper.findComponent(CanvasBoard)
    board.vm.$emit('stroke-start')
    board.vm.$emit('paint-cells', [{ x: 0, y: 0 }], 'a1')
    board.vm.$emit('stroke-end')
    await wrapper.vm.$nextTick()

    const swatches = wrapper.findAll('.pixel-swatch')
    const a1Swatch = swatches.find((s) => s.find('.pixel-swatch__tooltip').text().startsWith('a1'))
    await a1Swatch.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.pixel-palette__name-trigger').trigger('click')
    const nameInput = wrapper.find('.pixel-palette__name-editor input')
    expect(nameInput.element.value).toBe('黑')
    await nameInput.setValue('')
    await wrapper.find('.pixel-palette__name-editor .pixel-palette__primary').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.pixel-palette__name-trigger').text()).toBe('a1')
  })

  // 根因修复：项目库视图下此前直接 return，命中的动作（如 Ctrl+S）没有 preventDefault，
  // 会漏给浏览器触发系统"保存网页"对话框；未命中任何动作的普通按键仍应正常放行
  it('项目库视图下命中已绑定动作的按键会被吞掉（preventDefault），但不触发编辑器动作', async () => {
    const fetchMock = vi.fn((url) => {
      const u = String(url)
      if (u.endsWith('/docs')) {
        return Promise.resolve({ ok: true, json: async () => ({ docs: [makeDocSummary()] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
    vi.stubGlobal('fetch', fetchMock)
    wrapper = mount(PixelStudioPage)
    await flushPromises()
    expect(wrapper.find('.project-library').exists()).toBe(true)

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true })
    window.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(true)
    const postCalls = fetchMock.mock.calls.filter(([, opts]) => opts && opts.method === 'POST')
    expect(postCalls.length).toBe(0)

    // 未命中任何绑定动作的普通按键（如字母 q）不受影响，正常放行
    const unboundEvent = new KeyboardEvent('keydown', { key: 'q', cancelable: true })
    window.dispatchEvent(unboundEvent)
    await wrapper.vm.$nextTick()
    expect(unboundEvent.defaultPrevented).toBe(false)
  })
})
