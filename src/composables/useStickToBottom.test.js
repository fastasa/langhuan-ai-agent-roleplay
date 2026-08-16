/**
 * @vitest-environment jsdom
 */
import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useStickToBottom } from './useStickToBottom.ts'

// jsdom 不做真实布局，scrollHeight/clientHeight 是只读 getter，靠 defineProperty 造假滚动容器；
// scrollTop 本身是可写属性，jsdom 允许直接赋值（不触发布局，只是存值）。
function createFakeScrollEl({ scrollHeight = 1000, clientHeight = 400, scrollTop = 600 } = {}) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  el.scrollTop = scrollTop
  return el
}

function dispatchScroll(el) {
  el.dispatchEvent(new Event('scroll'))
}

// 不依赖 WheelEvent 构造器（jsdom 版本兼容性），用普通 Event 挂 deltaY 属性即可，
// handleWheel 只读这一个字段。
function dispatchWheel(el, deltaY) {
  const event = new Event('wheel')
  Object.defineProperty(event, 'deltaY', { value: deltaY })
  el.dispatchEvent(event)
}

describe('useStickToBottom', () => {
  it('①初始贴底跟滚：stickToBottom 初始为 true，非 force scrollToBottom() 直接生效', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)

    expect(stick.stickToBottom.value).toBe(true)
    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1000)
  })

  it('②上滑后 stick=false，非 force scrollToBottom() 不生效', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 - 400 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    // 用户往上滑：scrollTop 远离底部（超过默认阈值 80px）
    el.scrollTop = 100
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    stick.scrollToBottom()
    expect(el.scrollTop).toBe(100) // 未被拽回底部
  })

  it('③滑回底部 stick=true 恢复跟随', () => {
    // 方向感知后，解除必须是真实的 scrollTop 下降：初始贴底，再上滑到 100
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 - 400 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)

    el.scrollTop = 100
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    el.scrollTop = 1000 - 400 // 回到阈值内=贴底
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(true)

    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1000)
  })

  it('④force 强滚并重置 stick', () => {
    // 同③：初始贴底，再真实上滑到 100 解除门控
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 - 400 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)

    el.scrollTop = 100
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    stick.scrollToBottom(true)
    expect(el.scrollTop).toBe(1000)
    expect(stick.stickToBottom.value).toBe(true)
  })

  it('⑤elRef 更换后监听重绑，旧元素不再触发', async () => {
    const el1 = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 - 400 })
    const elRef = ref(el1)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    const el2 = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 - 400 })
    elRef.value = el2
    await nextTick()

    // 旧元素滚动不再影响 stick（监听已解绑）
    el1.scrollTop = 0
    dispatchScroll(el1)
    expect(stick.stickToBottom.value).toBe(true)

    // 新元素滚动生效
    el2.scrollTop = 0
    dispatchScroll(el2)
    expect(stick.stickToBottom.value).toBe(false)
  })

  it('⑥同帧竞态：未派发 scroll 事件时 scrollToBottom() 已能感知同步上滑', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    // 用户上滑改了 scrollTop，但对应的 scroll 事件是异步合并的，这里故意不派发，
    // 模拟"chunk 回调同步到达时 scroll 事件还没触发"的竞态窗口。
    el.scrollTop = 200

    stick.scrollToBottom() // 非 force，模拟流式 chunk 回调同步调用
    expect(el.scrollTop).toBe(200) // 没有被拽回底部
    expect(stick.stickToBottom.value).toBe(false)
  })

  it('⑥.5 竞态解除后同位置回声 scroll 事件不改门控（小幅上滑不被重新挂回）', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    // 小幅上滑 30px（<80px 阈值），scroll 事件尚未派发，chunk 先到
    el.scrollTop = 570
    stick.scrollToBottom() // 竞态检测命中：解除门控并记账 lastKnownScrollTop=570
    expect(stick.stickToBottom.value).toBe(false)

    // 浏览器随后合并派发的 scroll 事件：top==已记账位置=回声，且距底 30px≤80px——
    // 若回声重判贴底会把门控挂回 true，bug 换姿势复活
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    stick.scrollToBottom() // 后续 chunk 也不能再拽回底部
    expect(el.scrollTop).toBe(570)
    expect(stick.stickToBottom.value).toBe(false)
  })

  it('⑦内容增长不熄火（回归锁·禁止用离底距离判定解除门控）', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    // 大 chunk 一次性撑高内容：scrollHeight 变大，scrollTop 未变（没有 scroll 事件）
    Object.defineProperty(el, 'scrollHeight', { value: 1400, configurable: true })

    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1400)
    expect(stick.stickToBottom.value).toBe(true)
  })

  it('⑧wheel 向上（deltaY<0）立即解除门控，向下（deltaY>0）不会挂上', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    dispatchWheel(el, -100)
    expect(stick.stickToBottom.value).toBe(false)

    dispatchWheel(el, 100)
    expect(stick.stickToBottom.value).toBe(false) // 向下滚不会自己把门控挂回 true
  })

  it('⑨小幅上滑（仍在贴底阈值内）也解除门控', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)
    expect(stick.stickToBottom.value).toBe(true)

    el.scrollTop = 550 // 离底 50px，仍在 80px 阈值内，但方向是上滑
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)
  })

  it('⑩上滑解除后滚回底部，scroll 事件恢复门控', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)

    el.scrollTop = 550
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    el.scrollTop = 600 // 滚回底部
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(true)
  })

  it('⑪上滑解除后 force 滚底恢复门控', () => {
    const el = createFakeScrollEl({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef)

    el.scrollTop = 200
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    stick.scrollToBottom(true)
    expect(el.scrollTop).toBe(1000)
    expect(stick.stickToBottom.value).toBe(true)
  })

  it('非组件作用域（模块级单例）实例化不报错', () => {
    const el = createFakeScrollEl()
    expect(() => useStickToBottom(ref(el))).not.toThrow()
  })

  it('observeMutations=true 时内容增长且 stick=true 会自动跟滚', async () => {
    const el = createFakeScrollEl({ scrollHeight: 500, clientHeight: 400, scrollTop: 100 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef, { observeMutations: true })
    expect(stick.stickToBottom.value).toBe(true)

    // 模拟内容增高（DOM 变异 + scrollHeight 变大）
    Object.defineProperty(el, 'scrollHeight', { value: 900, configurable: true })
    el.appendChild(document.createElement('span'))

    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(el.scrollTop).toBe(900)
  })

  it('observeMutations=true 时 stick=false 不会被内容增长拽回底部', async () => {
    const el = createFakeScrollEl({ scrollHeight: 500, clientHeight: 400, scrollTop: 100 })
    const elRef = ref(el)
    const stick = useStickToBottom(elRef, { observeMutations: true })

    el.scrollTop = 0 // 真实上滑（方向感知：解除只认 scrollTop 变小）
    dispatchScroll(el)
    expect(stick.stickToBottom.value).toBe(false)

    Object.defineProperty(el, 'scrollHeight', { value: 900, configurable: true })
    el.appendChild(document.createElement('span'))

    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(el.scrollTop).toBe(0)
  })
})
