/**
 * @vitest-environment jsdom
 */
// 浮动窗口四边+四角 resize（批I·2026-07-12）：四条边 handle 单轴缩放（西/北缘同步调位置防跳动），
// 四角保留对角缩放。jsdom 无真实布局，但 rect 全在组件内联 style 上，可精确断言像素值。
// 批M1：边缘条收窄到 4px（滚动条让位），宽度口径用源码卫兵断言（jsdom 不注入 scoped 样式）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import FloatingWorkspaceWindow from '../../../src/components/common/FloatingWorkspaceWindow.vue'

async function mountOpenWindow() {
  const wrapper = mount(FloatingWorkspaceWindow, {
    props: { open: true, title: '测试窗', showCollapsedTab: false }
  })
  // open watcher 的初始化在 nextTick 回调里摆位置，多等两拍
  await nextTick()
  await nextTick()
  return wrapper
}

function styleOf(wrapper) {
  return wrapper.find('.floating-workspace-window').attributes('style') || ''
}

// 不用 test-utils trigger（它会对 MouseEvent 的 getter-only 属性做赋值直接抛错）：
// 构造器初始化 clientX/clientY/button 再原生 dispatch。
function pressHandle(wrapper, name, clientX, clientY) {
  wrapper.find(`.floating-workspace-window__resize--${name}`).element.dispatchEvent(
    new MouseEvent('pointerdown', { clientX, clientY, button: 0, bubbles: true, cancelable: true })
  )
}

function movePointer(clientX, clientY) {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }))
}

function releasePointer() {
  window.dispatchEvent(new MouseEvent('pointerup'))
}

// jsdom 缺省视口 1024x768：createDefaultRect => left=440, top=52, width=560, height=420（minWidth 320/minHeight 260）
describe('FloatingWorkspaceWindow · 四边+四角 resize（批I）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('渲染四条边+四角共 8 个 resize handle', async () => {
    const wrapper = await mountOpenWindow()
    const handles = wrapper.findAll('.floating-workspace-window__resize')
    expect(handles).toHaveLength(8)
    for (const name of ['top', 'right', 'bottom', 'left', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      expect(wrapper.find(`.floating-workspace-window__resize--${name}`).exists()).toBe(true)
    }
  })

  it('右上角不再渲染还原窗口位置与大小按钮', async () => {
    const wrapper = await mountOpenWindow()
    expect(wrapper.find('[aria-label="还原窗口位置与大小"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="关闭窗口"]').exists()).toBe(true)
  })

  it('嵌入态复用同一窗口内容，但停用浮动壳、关闭键与全部 resize handle', async () => {
    const wrapper = mount(FloatingWorkspaceWindow, {
      props: { open: false, embedded: true, title: '地图协作' },
      slots: { default: '<div class="embedded-content">同一份内容</div>' }
    })
    await nextTick()

    expect(wrapper.find('.floating-workspace-window').exists()).toBe(true)
    expect(wrapper.get('.floating-workspace-window').classes()).toContain('floating-workspace-window--embedded')
    expect(wrapper.find('.embedded-content').text()).toBe('同一份内容')
    expect(wrapper.find('[aria-label="关闭窗口"]').exists()).toBe(false)
    expect(wrapper.findAll('.floating-workspace-window__resize')).toHaveLength(0)
    expect(wrapper.find('.floating-workspace-window__edge-tab').exists()).toBe(false)
  })

  it('关闭靠边签牌后，拖到边缘也继续保留完整窗口', async () => {
    const wrapper = await mountOpenWindow()
    const header = wrapper.get('.floating-workspace-window__header')
    header.element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 700, clientY: 70, button: 0, bubbles: true, cancelable: true })
    )
    movePointer(260, 70)
    releasePointer()
    await nextTick()

    expect(wrapper.find('.floating-workspace-window').exists()).toBe(true)
    expect(wrapper.find('.floating-workspace-window__edge-tab').exists()).toBe(false)
    expect(styleOf(wrapper)).toContain('left: 0px')
  })

  it('边缘条 4px 口径 + 坞滚动条让位联动（批M1·源码卫兵：jsdom 不注入 scoped 样式）', () => {
    const win = readFileSync(resolve(process.cwd(), 'src/components/common/FloatingWorkspaceWindow.vue'), 'utf8')
    const dock = readFileSync(resolve(process.cwd(), 'src/components/app/XingyiDock.vue'), 'utf8')
    // 横边条 4px 高、竖边条 4px 宽（收窄防盖滚动条·批M1）
    expect(win).toContain('height: 4px;\n  cursor: ns-resize;')
    expect(win).toContain('width: 4px;\n  height: auto;\n  cursor: ew-resize;')
    // XingyiDock 消息区右缩 4px 让滚动条整体内移（联动口径：边条宽度改了这里要同步）
    expect(dock).toContain('margin-right: 4px;')
  })

  it('东缘拖动：只变 width，left/top/height 不动', async () => {
    const wrapper = await mountOpenWindow()
    pressHandle(wrapper, 'right', 1000, 300)
    movePointer(960, 300) // 往左 40 → 变窄
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('left: 440px')
    expect(styleOf(wrapper)).toContain('top: 52px')
    expect(styleOf(wrapper)).toContain('width: 520px')
    expect(styleOf(wrapper)).toContain('height: 420px')
  })

  it('西缘拖动：left 与 width 同步走（位置+尺寸）', async () => {
    const wrapper = await mountOpenWindow()
    pressHandle(wrapper, 'left', 440, 300)
    movePointer(340, 300) // 往左 100 → 变宽且窗口左缘跟着走
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('left: 340px')
    expect(styleOf(wrapper)).toContain('width: 660px')
    expect(styleOf(wrapper)).toContain('top: 52px')
    expect(styleOf(wrapper)).toContain('height: 420px')
  })

  it('北缘拖动：top 与 height 同步走；缩到最小高度后 delta 被夹住不再漂移', async () => {
    const wrapper = await mountOpenWindow()
    pressHandle(wrapper, 'top', 700, 52)
    movePointer(700, 32) // 上拉 20 → 变高
    await nextTick()
    expect(styleOf(wrapper)).toContain('top: 32px')
    expect(styleOf(wrapper)).toContain('height: 440px')
    movePointer(700, 600) // 下压远超最小高度：height 停在 260、top 停在 52+(420-260)=212，不继续漂
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('top: 212px')
    expect(styleOf(wrapper)).toContain('height: 260px')
    expect(styleOf(wrapper)).toContain('width: 560px')
  })

  it('南缘拖动：只变 height；西缘缩到最小宽度后不漂移', async () => {
    const wrapper = await mountOpenWindow()
    pressHandle(wrapper, 'bottom', 700, 472)
    movePointer(700, 512) // 下拉 40
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('height: 460px')
    expect(styleOf(wrapper)).toContain('top: 52px')
    // 西缘往右压 400（远超 width-minWidth=240）：width 停在 320、left 停在 440+240=680
    pressHandle(wrapper, 'left', 440, 300)
    movePointer(840, 300)
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('left: 680px')
    expect(styleOf(wrapper)).toContain('width: 320px')
  })

  it('四角仍可用（对角双向）：右下角拖动同时变宽变高', async () => {
    const wrapper = await mountOpenWindow()
    pressHandle(wrapper, 'bottom-right', 1000, 472)
    movePointer(980, 452) // 左上收 20/20
    releasePointer()
    await nextTick()
    expect(styleOf(wrapper)).toContain('width: 540px')
    expect(styleOf(wrapper)).toContain('height: 400px')
    expect(styleOf(wrapper)).toContain('left: 440px')
    expect(styleOf(wrapper)).toContain('top: 52px')
  })
})
