/**
 * @vitest-environment jsdom
 * 项目库全屏视图：卡片网格 + 新建卡 + 打开/删除交互。jsdom 不实现 canvas 2D 上下文，
 * 缩略图绘制内部已对 ctx 判空短路，因此本测试无需 mock canvas。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectLibrary from '../../../src/pixel-studio/ui/ProjectLibrary.vue'

function makeDocs() {
  return [
    { id: 'd1', name: '图一', width: 16, height: 16, frameCount: 1, updatedAt: '2026-07-01T00:00:00.000Z' },
    { id: 'd2', name: '图二', width: 32, height: 8, frameCount: 1, updatedAt: '2026-07-02T00:00:00.000Z' }
  ]
}
function makeFullDoc(id) {
  return {
    version: 1,
    name: id,
    width: 16,
    height: 16,
    palette: { a1: { hex: '#000000' } },
    frames: [{ id: 'f1', durationMs: 200, grid: Array(16).fill('..'.repeat(16)) }],
    playback: { loop: true }
  }
}

describe('ProjectLibrary', () => {
  let wrapper

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        const id = String(url).split('/').pop()
        return Promise.resolve({ ok: true, json: async () => ({ id, doc: makeFullDoc(id), updatedAt: new Date().toISOString() }) })
      })
    )
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
  })

  it('渲染每份文档一张卡片 + 一张新建卡，展示名称/尺寸/更新时间', async () => {
    wrapper = mount(ProjectLibrary, { props: { docs: makeDocs(), loading: false } })
    await flushPromises()

    const cards = wrapper.findAll('.project-library__card')
    // 2 份文档 + 1 张新建卡
    expect(cards.length).toBe(3)
    expect(wrapper.text()).toContain('图一')
    expect(wrapper.text()).toContain('16×16')
    expect(wrapper.text()).toContain('图二')
    expect(wrapper.text()).toContain('32×8')
  })

  it('点击「+新建」卡片 emit new，点击文档卡片 emit open(id)', async () => {
    wrapper = mount(ProjectLibrary, { props: { docs: makeDocs(), loading: false } })
    await flushPromises()

    await wrapper.find('.project-library__card--new').trigger('click')
    expect(wrapper.emitted('new')).toBeTruthy()

    const docCard = wrapper.findAll('.project-library__card').find((c) => !c.classes().includes('project-library__card--new'))
    await docCard.trigger('click')
    expect(wrapper.emitted('open')).toEqual([['d1']])
  })

  it('点击卡片上的删除按钮：confirm 通过才 emit delete(id)，且不触发卡片自身的 open', async () => {
    wrapper = mount(ProjectLibrary, { props: { docs: makeDocs(), loading: false } })
    await flushPromises()

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteBtn = wrapper.find('.project-library__delete')
    await deleteBtn.trigger('click')
    expect(confirmSpy).toHaveBeenCalled()
    expect(wrapper.emitted('delete')).toEqual([['d1']])
    expect(wrapper.emitted('open')).toBeFalsy()

    confirmSpy.mockReturnValue(false)
    const secondDeleteBtn = wrapper.findAll('.project-library__delete')[1]
    await secondDeleteBtn.trigger('click')
    // 取消确认：不追加新的 delete 事件
    expect(wrapper.emitted('delete').length).toBe(1)
  })

  it('空列表且非加载中时展示空态提示；加载中展示加载提示', () => {
    wrapper = mount(ProjectLibrary, { props: { docs: [], loading: false } })
    expect(wrapper.text()).toContain('还没有保存过文档')

    wrapper.unmount()
    wrapper = mount(ProjectLibrary, { props: { docs: [], loading: true } })
    expect(wrapper.text()).toContain('加载中')
  })

  // 模块级缩略图缓存：id 用本 describe 块独有前缀，避免与其它用例共用 'd1'/'d2' 造成缓存串扰
  describe('缩略图缓存与请求中止', () => {
    let fetchMock
    let getContextSpy

    beforeEach(() => {
      // jsdom 原生 getContext 返回 null，cacheThumbnail 内部判空短路不会真正写入缓存；
      // 这里补一个最小可用的假 2D 上下文，让"缓存命中不重复请求"这条路径能被真正跑到
      getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        fillStyle: '',
        imageSmoothingEnabled: true,
        clearRect: () => {},
        fillRect: () => {},
        drawImage: () => {}
      })
    })

    afterEach(() => {
      getContextSpy.mockRestore()
    })

    it('同一份文档 updatedAt 不变时，重新挂载直接复用缓存，不再发 GET', async () => {
      fetchMock = vi.fn((url) => {
        const id = String(url).split('/').pop()
        return Promise.resolve({ ok: true, json: async () => ({ id, doc: makeFullDoc(id), updatedAt: new Date().toISOString() }) })
      })
      vi.stubGlobal('fetch', fetchMock)

      const docs = [{ id: 'cache-hit-1', name: '缓存图', width: 8, height: 8, frameCount: 1, updatedAt: 'T-cache-1' }]
      wrapper = mount(ProjectLibrary, { props: { docs, loading: false } })
      await flushPromises()
      const firstCallCount = fetchMock.mock.calls.length
      expect(firstCallCount).toBeGreaterThan(0)

      wrapper.unmount()
      wrapper = mount(ProjectLibrary, { props: { docs, loading: false } })
      await flushPromises()

      // 第二次挂载 updatedAt 完全没变，应该直接命中缓存，不再新增 GET 调用
      expect(fetchMock.mock.calls.length).toBe(firstCallCount)
    })

    it('updatedAt 变化则视为缓存失效，重新发 GET', async () => {
      fetchMock = vi.fn((url) => {
        const id = String(url).split('/').pop()
        return Promise.resolve({ ok: true, json: async () => ({ id, doc: makeFullDoc(id), updatedAt: new Date().toISOString() }) })
      })
      vi.stubGlobal('fetch', fetchMock)

      wrapper = mount(ProjectLibrary, {
        props: { docs: [{ id: 'cache-hit-2', name: '缓存图2', width: 8, height: 8, frameCount: 1, updatedAt: 'T-cache-2-old' }], loading: false }
      })
      await flushPromises()
      const firstCallCount = fetchMock.mock.calls.length

      wrapper.unmount()
      wrapper = mount(ProjectLibrary, {
        props: { docs: [{ id: 'cache-hit-2', name: '缓存图2', width: 8, height: 8, frameCount: 1, updatedAt: 'T-cache-2-new' }], loading: false }
      })
      await flushPromises()

      expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCallCount)
    })

    it('组件卸载时中止在途缩略图请求', async () => {
      let capturedSignal
      vi.stubGlobal(
        'fetch',
        vi.fn((_url, opts) => {
          capturedSignal = opts?.signal
          return new Promise(() => {}) // 故意挂起，模拟请求还没返回时组件就被卸载
        })
      )
      wrapper = mount(ProjectLibrary, {
        props: { docs: [{ id: 'abort-1', name: '待中止', width: 8, height: 8, frameCount: 1, updatedAt: 'T-abort' }], loading: false }
      })
      await flushPromises()
      wrapper.unmount()
      wrapper = undefined

      expect(capturedSignal).toBeTruthy()
      expect(capturedSignal.aborted).toBe(true)
    })
  })
})
