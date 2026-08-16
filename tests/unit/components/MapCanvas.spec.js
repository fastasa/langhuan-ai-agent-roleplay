/**
 * @vitest-environment jsdom
 * 地图草案剪影可视化计划批2：MapCanvas 草案模式回归锁。
 * 覆盖：①无 draftSketches 零回归；②草案模式渲染 region(椭圆/多边形)/path/marker 三 kind 各一例，
 * 三色 class 正确；③既有要素整体压灰、不响应点击；④点击剪影 emit sketch-click 载荷正确。
 */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import MapCanvas from '../../../src/components/app/map/MapCanvas.vue'
import { i18n } from '../../../src/i18n'

// VTU 的 .trigger() 内部会尝试把 options 直接赋给真实 MouseEvent/PointerEvent 实例（jsdom 里 clientX 等是
// 继承自原型链的 getter-only 访问器，赋值会抛 TypeError）。这里改用普通 Event + Object.assign 手动派发，
// 绕开该冲突——MapCanvas 的处理函数只读 e.clientX/e.shiftKey 等属性值，不关心事件真实类名。
function firePointer(target, type, opts = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, ctrlKey: false, ...opts })
  target.dispatchEvent(event)
  return nextTick()
}

// jsdom 不实现 Pointer Capture：MapCanvas 的 onPointerDown 会调用 setPointerCapture，缺此 polyfill 会直接抛错。
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}
// jsdom 不实现 ResizeObserver：MapCanvas onMounted 里 new ResizeObserver(...).observe(svg) 缺此 polyfill 会直接抛错。
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// jsdom 不做真实布局：getBoundingClientRect 默认全 0——真机返工批A 新增的框选(finishBoxSelect)/
// hover换算(updateGridHover) 都要靠 svg 的屏幕尺寸做世界↔屏幕坐标互转，这里钉死一个固定视口。
// 只影响本文件（vitest 每个 spec 文件独立 jsdom 环境），不影响既有用例（它们只断言 class/emit 载荷，不依赖具体像素）。
const FIXED_SVG_RECT = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return this } }
SVGSVGElement.prototype.getBoundingClientRect = () => FIXED_SVG_RECT

const WORLD = {
  name: '测试世界',
  sheet: '主图',
  explored: { pts: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] },
  features: [
    { id: 'f1', kind: 'marker', category: 'landmark', name: '旧地标', layer: 'civic', pts: [[500, 500]], links: { panelId: 'p1' } }
  ]
}

const SKETCHES = [
  {
    id: 'sk-region-poly', action: 'add', kind: 'region', category: 'forest', label: '林地剪影',
    sketch: { points: [[100, 100], [300, 100], [200, 300]] },
    confidence: 'ready', card: { change: '新增一片林地' }
  },
  {
    id: 'sk-region-ellipse', action: 'add', kind: 'region', category: 'grass', label: '草甸剪影',
    sketch: { center: [500, 500], rx: 120, ry: 90 },
    confidence: 'confirm', card: { change: '新增草甸' }
  },
  {
    id: 'sk-path', action: 'modify', kind: 'path', category: 'road', label: '道路剪影',
    sketch: { points: [[50, 50], [400, 400]] },
    confidence: 'confirm', card: { change: '拓宽道路' }
  },
  {
    id: 'sk-marker', action: 'add', kind: 'marker', category: 'landmark', label: '地标剪影',
    sketch: { center: [800, 200] },
    confidence: 'risk', card: { change: '新增地标', risk: '位置未定' }
  }
]

function mountCanvas(props = {}) {
  return mount(MapCanvas, {
    global: { plugins: [i18n] },
    props: { world: WORLD, panels: {}, view: 'terrain', statusOn: false, ...props }
  })
}

describe('MapCanvas 草案模式（地图草案剪影可视化计划批2）', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  it('无 draftSketches 时 draft 分组为空、既有要素不被强制压灰（零回归）', () => {
    const wrapper = mountCanvas()
    const draftGroup = wrapper.find('[data-g="draft"]')
    expect(draftGroup.exists()).toBe(true)
    expect(draftGroup.element.children.length).toBe(0)
    expect(wrapper.find('[data-fid="f1"]').classes()).not.toContain('lhmap-dim')
  })

  it('草案模式渲染出剪影：region 椭圆/多边形、path 折线、marker 圆点，三色 class 正确', () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    const draftGroup = wrapper.find('[data-g="draft"]')
    const shapes = draftGroup.findAll('[data-sketch-id]')
    expect(shapes.length).toBe(4)

    const poly = draftGroup.find('[data-sketch-id="sk-region-poly"]')
    expect(poly.element.tagName.toLowerCase()).toBe('path')
    expect(poly.classes()).toContain('lhmap-sketch--region')
    expect(poly.classes()).toContain('lhmap-sketch-c-ready')

    const ellipse = draftGroup.find('[data-sketch-id="sk-region-ellipse"]')
    expect(ellipse.element.tagName.toLowerCase()).toBe('ellipse')
    expect(ellipse.classes()).toContain('lhmap-sketch--region')
    expect(ellipse.classes()).toContain('lhmap-sketch-c-confirm')

    const path = draftGroup.find('[data-sketch-id="sk-path"]')
    expect(path.element.tagName.toLowerCase()).toBe('path')
    expect(path.classes()).toContain('lhmap-sketch--path')
    expect(path.classes()).toContain('lhmap-sketch-c-confirm')

    const marker = draftGroup.find('[data-sketch-id="sk-marker"]')
    expect(marker.element.tagName.toLowerCase()).toBe('circle')
    expect(marker.classes()).toContain('lhmap-sketch--marker')
    expect(marker.classes()).toContain('lhmap-sketch-c-risk')
  })

  it('草案模式下既有要素整体压灰淡出', () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    expect(wrapper.find('[data-fid="f1"]').classes()).toContain('lhmap-dim')
  })

  it('最终草稿按真实矢量与海拔层序渲染，多层山脉仍共用一个逻辑选择 id', () => {
    const reviewItems = [{
      id: 'terrain:mountain-1', action: 'add', kind: 'region', category: 'mountain', label: '东岭',
      confidence: 'ready', sketch: { center: [500, 500], points: [[0, 0], [1000, 0], [0, 1000]] },
      card: { change: '新增两层山脉' },
      previewFeatures: [
        { id: 'preview-low', kind: 'region', category: 'mountain', name: '东岭·主山体', layer: 'terrain', pts: [[0, 0], [1000, 0], [0, 1000]], elevationM: 800 },
        { id: 'preview-high', kind: 'region', category: 'mountain', name: '东岭·峰线', layer: 'terrain', pts: [[250, 250], [650, 250], [250, 650]], elevationM: 2600 }
      ]
    }]
    const wrapper = mountCanvas({ draftReviewItems: reviewItems })
    const layers = wrapper.findAll('[data-sketch-id="terrain:mountain-1"]')
    expect(layers).toHaveLength(2)
    expect(layers.every((layer) => layer.classes().includes('lhmap-review-feature'))).toBe(true)
    expect(layers[0].attributes('style')).not.toBe(layers[1].attributes('style'))
    expect(wrapper.find('[data-fid="f1"]').classes()).toContain('lhmap-dim')
  })

  it('selectedSketchIds 命中的剪影加 is-selected；未命中不加', () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES, selectedSketchIds: ['sk-marker'] })
    const marker = wrapper.find('[data-sketch-id="sk-marker"]')
    const poly = wrapper.find('[data-sketch-id="sk-region-poly"]')
    expect(marker.classes()).toContain('is-selected')
    expect(poly.classes()).not.toContain('is-selected')
  })

  it('点击剪影 emit sketch-click，载荷携带 id/shiftKey/ctrlKey/clientX/clientY', async () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    const marker = wrapper.find('[data-sketch-id="sk-marker"]').element
    await firePointer(marker, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 20 })
    await firePointer(marker, 'pointerup', { pointerId: 1, clientX: 10, clientY: 20, shiftKey: true, ctrlKey: false })

    const events = wrapper.emitted('sketch-click')
    expect(events).toBeTruthy()
    expect(events[0][0]).toEqual({ id: 'sk-marker', shiftKey: true, ctrlKey: false, clientX: 10, clientY: 20 })
  })

  it('Ctrl 在 pointerup 前已经松开也要累加多选（真机返工批A：down/up 任一时刻按住即算数）', async () => {
    // 真机反馈"按住 Ctrl 点第二个剪影没有累加选中"——根因是真实操作里用户常常先松开 Ctrl 键、
    // 再松开鼠标按键，若只信 pointerup 那一刻的 e.ctrlKey 就会漏判。这里模拟该释放顺序：
    // pointerdown 时 ctrlKey=true，pointerup 时 ctrlKey 已经变回 false。
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    const marker = wrapper.find('[data-sketch-id="sk-marker"]').element
    await firePointer(marker, 'pointerdown', { pointerId: 1, clientX: 10, clientY: 20, ctrlKey: true })
    await firePointer(marker, 'pointerup', { pointerId: 1, clientX: 10, clientY: 20, ctrlKey: false })

    const events = wrapper.emitted('sketch-click')
    expect(events).toBeTruthy()
    expect(events[0][0]).toEqual({ id: 'sk-marker', shiftKey: false, ctrlKey: true, clientX: 10, clientY: 20 })
  })

  it('Shift+拖拽框选剪影：矩形与剪影 bbox 相交的全部上抛（真机返工批A 新增多选方式）', async () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    const svg = wrapper.find('svg').element
    // fitAll()：world bbox=[0,0]-[1000,1000]，固定视口 800x600 → scale=min(800/1000,600/1000)*0.98=0.588，cx=cy=500。
    // 世界坐标 (0,0)→屏幕(106,6)、(350,350)→屏幕(≈312,≈212)：这个框只覆盖 sk-region-poly(100~300,100~300)与
    // sk-path(50~400,50~400) 两个剪影的包围盒，不覆盖 sk-region-ellipse(380~620起)与 sk-marker(580起)。
    await firePointer(svg, 'pointerdown', { pointerId: 9, clientX: 106, clientY: 6, shiftKey: true })
    await firePointer(svg, 'pointermove', { pointerId: 9, clientX: 312, clientY: 212, shiftKey: true })
    await firePointer(svg, 'pointerup', { pointerId: 9, clientX: 312, clientY: 212, shiftKey: true })

    const events = wrapper.emitted('sketch-box-select')
    expect(events).toBeTruthy()
    const ids = events[events.length - 1][0].ids.slice().sort()
    expect(ids).toEqual(['sk-path', 'sk-region-poly'])
    // 框选不应该顺带触发 sketch-click（框选与点击是分流的两条路径）
    expect(wrapper.emitted('sketch-click')).toBeFalsy()
  })

  it('Shift+点击（无真实位移）仍走既有单项切换选中，不误判为框选', async () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    const marker = wrapper.find('[data-sketch-id="sk-marker"]').element
    await firePointer(marker, 'pointerdown', { pointerId: 3, clientX: 50, clientY: 50, shiftKey: true })
    await firePointer(marker, 'pointerup', { pointerId: 3, clientX: 50, clientY: 50, shiftKey: true })

    expect(wrapper.emitted('sketch-box-select')).toBeFalsy()
    const events = wrapper.emitted('sketch-click')
    expect(events).toBeTruthy()
    expect(events[0][0]).toEqual({ id: 'sk-marker', shiftKey: true, ctrlKey: false, clientX: 50, clientY: 50 })
  })

  it('sketchMarks 三态标记渲染出角标节点，且传染到剪影本身的描边 class（真机返工批A：决策零反馈根治）', () => {
    const wrapper = mountCanvas({
      draftSketches: SKETCHES,
      sketchMarks: { 'sk-marker': 'accepted', 'sk-path': 'rejected', 'sk-region-ellipse': 'commented' }
    })
    const draftGroup = wrapper.find('[data-g="draft"]')
    expect(draftGroup.findAll('.lhmap-sketch-badge-bg--accepted')).toHaveLength(1)
    expect(draftGroup.findAll('.lhmap-sketch-badge-bg--rejected')).toHaveLength(1)
    expect(draftGroup.findAll('.lhmap-sketch-badge-bg--commented')).toHaveLength(1)
    // 未标记的项不应该有角标
    expect(draftGroup.findAll('.lhmap-sketch-badge-g')).toHaveLength(3)

    expect(wrapper.find('[data-sketch-id="sk-marker"]').classes()).toContain('lhmap-sketch-mark--accepted')
    expect(wrapper.find('[data-sketch-id="sk-path"]').classes()).toContain('lhmap-sketch-mark--rejected')
    expect(wrapper.find('[data-sketch-id="sk-region-ellipse"]').classes()).toContain('lhmap-sketch-mark--commented')
    // 未标记的项不应该带 mark class
    expect(wrapper.find('[data-sketch-id="sk-region-poly"]').classes().some((c) => c.startsWith('lhmap-sketch-mark--'))).toBe(false)
  })

  it('sketchMarks prop 更新（父级传入新对象引用）能重新渲染角标（父到子的标记确实传染到了 MapCanvas）', async () => {
    const wrapper = mountCanvas({ draftSketches: SKETCHES })
    expect(wrapper.find('[data-g="draft"]').findAll('.lhmap-sketch-badge-g')).toHaveLength(0)

    await wrapper.setProps({ sketchMarks: { 'sk-marker': 'accepted' } })
    expect(wrapper.find('[data-g="draft"]').findAll('.lhmap-sketch-badge-g')).toHaveLength(1)
    expect(wrapper.find('[data-sketch-id="sk-marker"]').classes()).toContain('lhmap-sketch-mark--accepted')
  })

  it('草案模式下点击底图要素（含带 links 的旧要素）不再弹状态栏卡，只清空残留弹卡', async () => {
    const wrapper = mountCanvas({
      draftSketches: SKETCHES,
      panels: { p1: { title: '旧地标', kind: 'building', kindLabel: '地标', note: '', rows: [] } }
    })
    const feature = wrapper.find('[data-fid="f1"]').element
    await firePointer(feature, 'pointerdown', { pointerId: 2, clientX: 30, clientY: 30 })
    await firePointer(feature, 'pointerup', { pointerId: 2, clientX: 30, clientY: 30 })

    expect(wrapper.emitted('sketch-click')).toBeFalsy()
    const statusEvents = wrapper.emitted('open-status-panel') || []
    expect(statusEvents.every(([payload]) => payload === null)).toBe(true)
  })
})

describe('MapCanvas 人工地形编辑模式', () => {
  it('点选正式要素只上抛 feature-select，不打开状态卡', async () => {
    const wrapper = mountCanvas({ editMode: true })
    const feature = wrapper.get('[data-fid="f1"]').element
    await firePointer(feature, 'pointerdown', { pointerId: 2, clientX: 20, clientY: 20 })
    await firePointer(feature, 'pointerup', { pointerId: 2, clientX: 20, clientY: 20 })
    expect(wrapper.emitted('feature-select')?.[0]?.[0]).toEqual({ id: 'f1' })
    expect(wrapper.emitted('open-status-panel') || []).toEqual([[null]])
  })

  it('参数预览只重建 edit 层，选中的原要素降低透明度', async () => {
    const terrainWorld = {
      ...WORLD,
      features: [{ id: 'grass1', kind: 'region', category: 'grass', name: '草原', layer: 'terrain', pts: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], elevationM: 150 }]
    }
    const preview = [{ id: 'grass1', kind: 'region', category: 'grass', name: '草原', layer: 'terrain', pts: [[0, 0], [1600, 0], [1600, 1200], [0, 1200]], elevationM: 150 }]
    const wrapper = mountCanvas({ world: terrainWorld, editMode: true, selectedFeatureIds: ['grass1'], editPreviewFeatures: preview })
    expect(wrapper.get('[data-fid="grass1"]').classes()).toContain('lhmap-edit-source')
    expect(wrapper.findAll('[data-g="edit"] [data-edit-fid="grass1"]')).toHaveLength(1)

    await wrapper.setProps({ editPreviewFeatures: [{ ...preview[0], pts: [[0, 0], [2000, 0], [2000, 1200], [0, 1200]] }] })
    expect(wrapper.findAll('[data-g="edit"] [data-edit-fid="grass1"]')).toHaveLength(1)
  })

  it('统一控制点层支持选中拖动、双击线段加点与 Delete 删点事件', async () => {
    const pathWorld = {
      ...WORLD,
      features: [{ id: 'road1', kind: 'path', category: 'road', name: '旧路', layer: 'civic', pts: [[0, 0], [1000, 0], [2000, 1000]] }]
    }
    const geometry = {
      target: 'path-vertices', topology: 'open', points: [[0, 0], [1000, 0], [2000, 1000]], snapEnabled: true, snapStepM: 100
    }
    const wrapper = mountCanvas({
      world: pathWorld,
      view: 'civic',
      editMode: true,
      selectedFeatureIds: ['road1'],
      editPreviewFeatures: [{ ...pathWorld.features[0], pts: geometry.points }],
      editGeometry: geometry,
      selectedEditPointIndex: 1
    })
    expect(wrapper.findAll('[data-edit-point-index]')).toHaveLength(3)
    expect(wrapper.findAll('[data-edit-segment-index]')).toHaveLength(2)
    expect(wrapper.get('[data-edit-point-index="1"]').classes()).toContain('is-selected')
    expect(wrapper.findAll('[data-edit-fid="road1"]')).toHaveLength(1)

    const handle = wrapper.get('[data-edit-point-index="1"]').element
    await firePointer(handle, 'pointerdown', { pointerId: 7, clientX: 400, clientY: 300 })
    await firePointer(handle, 'pointermove', { pointerId: 7, clientX: 420, clientY: 320, altKey: true })
    await firePointer(handle, 'pointerup', { pointerId: 7, clientX: 420, clientY: 320 })
    expect(wrapper.emitted('edit-point-select')?.[0]?.[0]).toEqual({ index: 1 })
    expect(wrapper.emitted('edit-point-move')?.[0]?.[0]).toMatchObject({ index: 1, disableSnap: true })

    const segment = wrapper.get('[data-edit-segment-index="0"]').element
    segment.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 410, clientY: 310 }))
    await nextTick()
    expect(wrapper.emitted('edit-segment-insert')?.[0]?.[0]).toMatchObject({ segmentIndex: 0 })

    wrapper.get('svg').element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }))
    await nextTick()
    expect(wrapper.emitted('edit-point-delete')?.[0]?.[0]).toEqual({ index: 1 })
  })
})

// 网格坐标系（地图草案剪影可视化计划批4）：25km×15km 世界落在网格档位表最小档（10km）——cols=3/rows=2
// （ceil(25000/10000)=3、ceil(15000/10000)=2），数值可预测，用来锁「渲染出网格线+边缘标签」的结构。
const GRID_WORLD = {
  name: '网格测试世界',
  sheet: '主图',
  explored: { pts: [[0, 0], [25000, 0], [25000, 15000], [0, 15000]] },
  features: [
    { id: 'grid-frame', kind: 'region', category: 'grass', name: '网格内容范围', layer: 'terrain', pts: [[0, 0], [25000, 0], [25000, 15000], [0, 15000]] }
  ]
}

function mountGridCanvas(props = {}) {
  return mount(MapCanvas, {
    global: { plugins: [i18n] },
    props: { world: GRID_WORLD, panels: {}, view: 'terrain', statusOn: false, ...props }
  })
}

describe('MapCanvas 网格坐标层（地图草案剪影可视化计划批4）', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  it('showGrid 缺省/false：网格分组为空（零变化，不建网格层）', () => {
    const wrapper = mountGridCanvas()
    const gridGroup = wrapper.find('[data-g="grid"]')
    expect(gridGroup.exists()).toBe(true)
    expect(gridGroup.element.children.length).toBe(0)
  })

  it('showGrid=true：渲染出网格线（含四周边界）与列字母/行数字边缘标签，数量与 10km 档 3×2 网格吻合', () => {
    const wrapper = mountGridCanvas({ showGrid: true })
    const gridGroup = wrapper.find('[data-g="grid"]')
    const lines = gridGroup.findAll('.lhmap-grid-line')
    const colLabels = gridGroup.findAll('.lhmap-grid-label--col')
    const rowLabels = gridGroup.findAll('.lhmap-grid-label--row')
    // cols=3/rows=2：竖线 cols+1=4 条 + 横线 rows+1=3 条 = 7 条；列标签 3 个 + 行标签 2 个
    expect(lines.length).toBe(7)
    expect(colLabels.length).toBe(3)
    expect(rowLabels.length).toBe(2)
    expect(colLabels.map((l) => l.text())).toEqual(['A', 'B', 'C'])
    expect(rowLabels.map((l) => l.text())).toEqual(['1', '2'])
  })

  it('showGrid true→false→true：网格随开关整层清空/重建', async () => {
    const wrapper = mountGridCanvas({ showGrid: true })
    expect(wrapper.find('[data-g="grid"]').element.children.length).toBeGreaterThan(0)

    await wrapper.setProps({ showGrid: false })
    expect(wrapper.find('[data-g="grid"]').element.children.length).toBe(0)

    await wrapper.setProps({ showGrid: true })
    expect(wrapper.find('[data-g="grid"]').element.children.length).toBeGreaterThan(0)
  })
})

describe('MapCanvas 纸白空图与迷雾退出', () => {
  it('存量非法 path 类目也挂开放路径防御基类，不再退回 SVG 默认黑色填充', () => {
    const wrapper = mountCanvas({
      world: {
        name: '脏数据防御', sheet: '主图', explored: WORLD.explored,
        features: [{ id: 'bad-mountain-path', kind: 'path', category: 'mountain', name: '旧错误山脉', layer: 'terrain', pts: [[0, 0], [500, 500], [1000, 0]] }]
      }
    })
    const path = wrapper.get('[data-fid="bad-mountain-path"]')
    expect(path.classes()).toContain('f-map-path')
    expect(path.classes()).toContain('f-mountain')
  })

  it('explored 不再生成默认陆地或战争迷雾节点，空内容保持纸白工作平面', async () => {
    const wrapper = mountCanvas({
      world: { name: '空白图', sheet: '主图', explored: WORLD.explored, features: [] }
    })
    expect(wrapper.find('[data-g="land"]').exists()).toBe(false)
    expect(wrapper.find('[data-g="fogcover"]').exists()).toBe(false)
    expect(wrapper.find('.lhmap-body').element.style.getPropertyValue('--mc-canvas')).toBe('#FBFAF6')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const viewBox = wrapper.get('svg').attributes('viewBox').split(' ').map(Number)
    expect(viewBox).toHaveLength(4)
    expect(viewBox.every(Number.isFinite)).toBe(true)
  })

  it('紧凑预览隐藏完整工作区浮层，右下角只保留放大、缩小按钮', () => {
    const wrapper = mountCanvas({ compact: true })
    expect(wrapper.find('.lhmap-legend').exists()).toBe(false)
    expect(wrapper.find('.lhmap-badges').exists()).toBe(false)
    expect(wrapper.find('.lhmap-foot').exists()).toBe(false)
    const controls = wrapper.findAll('.lhmap-zoom button')
    expect(controls).toHaveLength(2)
    expect(controls[0].attributes('title')).toBe('放大')
    expect(controls[1].attributes('title')).toBe('缩小')
    expect(wrapper.find('.lhmap-pan-button').exists()).toBe(false)
  })

  it('紧凑预览继续复用画布缩放与左键拖拽交互', async () => {
    const wrapper = mountCanvas({ compact: true })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const svg = wrapper.get('svg')
    const beforeWheel = svg.attributes('viewBox')

    svg.element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 400, clientY: 300 }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(svg.attributes('viewBox')).not.toBe(beforeWheel)

    const beforeZoomButton = svg.attributes('viewBox')

    await wrapper.findAll('.lhmap-zoom button')[0].trigger('click')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(svg.attributes('viewBox')).not.toBe(beforeZoomButton)

    const beforePan = svg.attributes('viewBox')
    await firePointer(svg.element, 'pointerdown', { pointerId: 21, pointerType: 'mouse', button: 0, clientX: 300, clientY: 250 })
    await firePointer(svg.element, 'pointermove', { pointerId: 21, pointerType: 'mouse', button: 0, clientX: 350, clientY: 280 })
    await firePointer(svg.element, 'pointerup', { pointerId: 21, pointerType: 'mouse', button: 0, clientX: 350, clientY: 280 })
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(svg.attributes('viewBox')).not.toBe(beforePan)
  })
})
