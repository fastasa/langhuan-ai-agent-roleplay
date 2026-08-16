/**
 * @vitest-environment jsdom
 * 舆图弹窗回归锁：载入期不提前挂画布；切换世界先清旧 bundle，避免新 key 挂载时读取旧世界数据。
 */
import { createPinia } from 'pinia'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapViewerDialog from '../../../src/components/app/map/MapViewerDialog.vue'
import { i18n } from '../../../src/i18n'
import { attachSessionWorld, fetchChatSessionBundleById, fetchWorldMapBundle, fetchWorldMapChangeLog, fetchWorlds } from '../../../src/repositories/chatRepository'
import { bumpWorldMapRevision, resetWorldMapRevisionForTest } from '../../../src/app/worldMapRevision'
import { parseHuiyuSketchDecision } from '../../../src/app/huiyuOrchestration'
import { buildCartographerScopeKey, createScopeMapDraftReviewChannel, findScopeState, resetWorkspaceAgentScopeStateForTest } from '../../../src/app/workspaceAgentScopeState'
// 点阵投影调试面板用例（装甲地图系统计划批A1 附属工具）：直接用真实（非 mock）的 buildMountainDotMatrix
// 算出期望值，避免测试里手算网格/占比数字与实现细节耦合。
import { buildMountainDotMatrix } from '../../../src/app/mapArmor/dotMatrix'
import { computeMapTaskFrame } from '../../../src/app/mapTaskFrame'

vi.mock('../../../src/repositories/chatRepository', async (importOriginal) => ({
  ...await importOriginal(),
  attachSessionWorld: vi.fn(),
  fetchChatSessionBundleById: vi.fn(),
  fetchSessionTemporaryEntities: vi.fn(async () => []),
  fetchStatusPanelTemplates: vi.fn(async () => []),
  fetchStatusPanelsBundle: vi.fn(async () => ({ items: [], worldId: '', pendingSessionScopeCount: 0 })),
  fetchWorldMapBundle: vi.fn(),
  fetchWorldMapChangeLog: vi.fn(async () => []),
  fetchWorlds: vi.fn()
}))

const agentContextMock = vi.hoisted(() => ({
  loadRenderedAgentContext: vi.fn(async () => ({ bundle: {}, text: 'cartographer-rendered-context' }))
}))
vi.mock('../../../src/app/agentContext/agentContextProvider.ts', () => agentContextMock)

const cartographerHarnessMock = vi.hoisted(() => ({
  runCartographerAgent: vi.fn(async () => ({ reply: '舆图师答复', terminalReason: 'done' }))
}))
vi.mock('../../../src/app/cartographerAgentHarness.ts', () => cartographerHarnessMock)

const mapSheetAuthoringMock = vi.hoisted(() => ({
  createInitialWorldMapSheet: vi.fn(async () => ({ id: 'sheet_1', worldId: 'world_1', name: '主图', explored: null, features: [] }))
}))
vi.mock('../../../src/app/worldMapSheetAuthoring.ts', () => mapSheetAuthoringMock)

// MapCanvas 是真机命令式建景组件（buildScene 只在 onMounted 跑一次），这里用桩组件断言「重挂」语义：
// setup() 每次真被 Vue 重新调用（也就是发生了卸载+新建实例，而不是同一实例只是 props 更新）就自增计数。
let mapCanvasMountCount = 0
const MapCanvasStub = {
  name: 'MapCanvas',
  props: ['world', 'panels', 'view', 'statusOn', 'highlightFeatureIds', 'changeHighlight', 'draftSketches', 'draftReviewItems', 'selectedSketchIds', 'sketchMarks', 'showGrid', 'focusSketch', 'editMode', 'selectedFeatureIds', 'editPreviewFeatures', 'editGeometry', 'selectedEditPointIndex'],
  emits: ['open-status-panel', 'sketch-click', 'sketch-box-select', 'feature-select', 'edit-point-select', 'edit-point-move', 'edit-segment-insert', 'edit-point-delete'],
  setup() {
    mapCanvasMountCount += 1
  },
  template: '<div class="map-canvas-stub"></div>'
}

const REAL_WORLD = { id: 'world_1', name: '亚什基诺', sessionCount: 1 }
const REAL_BUNDLE = {
  world: { id: 'world_1', name: '亚什基诺' },
  sheets: [
    {
      id: 'sheet_1',
      name: '主图',
      explored: { pts: [[0, 0], [100, 0], [100, 100], [0, 100]] },
      features: []
    }
  ]
}
const WORLD_B = { id: 'world_2', name: '沧澜大陆', sessionCount: 0 }
const REAL_BUNDLE_B = {
  world: { id: 'world_2', name: '沧澜大陆' },
  sheets: [
    {
      id: 'sheet_b',
      name: '主图B',
      explored: { pts: [[0, 0], [200, 0], [200, 200], [0, 200]] },
      features: []
    }
  ]
}

// 舆图实时刷新（2026-07-12）新增：MapViewerDialog 现在 watch 模块级单例 worldMapRevision，watcher 挂在
// 组件的 setup 作用域上——不显式 unmount 的话，前面用例挂载的实例会在整份 spec 文件生命周期内一直存活并
// 继续订阅该全局信号，后面用例里的 bumpWorldMapRevision 会连带触发它们各自的静默重拉，串扰 mock 调用计数。
// 用 mountedWrappers 统一收敛、每个用例结束后 unmount，避免跨用例泄漏（不改动任何既有用例的断言逻辑）。
const mountedWrappers = []
function mountDialog(props = {}) {
  const pinia = createPinia()
  const wrapper = mount(MapViewerDialog, {
    global: {
      plugins: [pinia, i18n],
      // WorkspaceAgentShell（独立"舆图师"，批C）自身行为见 WorkspaceAgentShell.spec.js +
      // cartographerAgentHarness.spec.js，这里统一 stub 掉，避免真跑其内部 fetch/agent loop。
      stubs: { MapCanvas: MapCanvasStub, teleport: true, WorkspaceAgentShell: true }
    },
    props: { open: true, sessionId: 'session_1', ...props }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

// 真机返工批A（已决策清单）用挂载方式：不 stub teleport——VTU 的 `teleport: true` stub 会在每次父级
// 响应式更新时把 Teleport 的 children 包成一个全新闭包（vue-test-utils#1829/#1888 的已知处理方式），
// 这与本文件其余用例的浅层断言无冲突，但会导致 MapDraftActionBar 在测试环境下随父级任意响应式更新反复
// 卸载重挂（真实浏览器不 stub Teleport，不会有这个问题）——「已决策清单」测试恰好依赖组件自身的
// decidedOpen/editingId 这类内部状态跨多次交互存活，必须用真实 Teleport（挂到 document.body）才能验证。
function mountDialogAttached(props = {}) {
  const pinia = createPinia()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const wrapper = mount(MapViewerDialog, {
    attachTo: host,
    global: {
      plugins: [pinia, i18n],
      stubs: { MapCanvas: MapCanvasStub, WorkspaceAgentShell: true }
    },
    props: { open: true, sessionId: 'session_1', ...props }
  })
  wrapper.__testHost = host // afterEach 清理专用（host 空壳 unmount 后不会自己消失）
  mountedWrappers.push(wrapper)
  return wrapper
}
// 真实 Teleport 下的内容挂到 document.body（不是 wrapper.element 的后代），DOM 查询要用这两个 body 级帮手
// （用 DOMWrapper 包一层，拿到跟 wrapper.find() 一样的 .trigger()/.text()/.classes() API）。
function bodyGet(selector) {
  const el = document.body.querySelector(selector)
  if (!el) throw new Error(`bodyGet: 未找到 ${selector}`)
  return new DOMWrapper(el)
}
function bodyFindAll(selector) {
  return Array.from(document.body.querySelectorAll(selector)).map((el) => new DOMWrapper(el))
}

describe('MapViewerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapCanvasMountCount = 0
    i18n.global.locale.value = 'zh'
    resetWorldMapRevisionForTest()
    resetWorkspaceAgentScopeStateForTest()
    // 网格坐标开关本地记忆键（批4）：每个用例独立起跑，避免跨用例的持久化状态互相污染
    window.localStorage.removeItem('langhuan_map_grid_on')
  })
  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => {
      try { wrapper.unmount() } catch { /* 已被单测自行卸载则忽略 */ }
      if (wrapper.__testHost) wrapper.__testHost.remove()
    })
    resetWorkspaceAgentScopeStateForTest()
  })

  it('世界态载入中门控画布；未挂世界时保持空态', async () => {
    fetchWorlds.mockResolvedValue([])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: '' } })

    const wrapper = mountDialog()

    // 世界态还没落定（Promise 尚未 flush）：不能显示画布（既不是样例也不是真图），只显示载入态卡
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__map-state').exists()).toBe(true)
    expect(wrapper.find('.map-viewer__map-state-desc').text()).toBe(i18n.global.t('chat.mapDataLoading'))

    await flushPromises()

    // 世界态落定、未挂世界：不挂载画布，只显示空态引导。
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__map-state').exists()).toBe(true)
  })

  it('顶部编辑进入参数面板，点选结构化地形后立即下发预览', async () => {
    const bundle = {
      ...REAL_BUNDLE,
      sheets: [{
        ...REAL_BUNDLE.sheets[0],
        features: [{
          id: 'grass_circle', sheetId: 'sheet_1', worldId: 'world_1', kind: 'region', category: 'grass', name: '圆形草原', layer: 'terrain',
          geometry: { pts: [[0, -5000], [5000, 0], [0, 5000], [-5000, 0]], elevationM: 150 },
          meta: { vectorPrimitive: { type: 'circle', center: [0, 0], radiusM: 5000 } }
        }]
      }]
    }
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(bundle)
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.get('.map-viewer__edit-toggle').trigger('click')
    expect(wrapper.find('.map-terrain-editor').exists()).toBe(true)
    expect(wrapper.findComponent(MapCanvasStub).props('editMode')).toBe(true)

    wrapper.findComponent(MapCanvasStub).vm.$emit('feature-select', { id: 'grass_circle' })
    await flushPromises()
    expect(wrapper.find('.map-terrain-editor__name input').element.value).toBe('圆形草原')
    expect(wrapper.findComponent(MapCanvasStub).props('selectedFeatureIds')).toEqual(['grass_circle'])
    expect(wrapper.findComponent(MapCanvasStub).props('editPreviewFeatures')).toHaveLength(1)
  })

  it('polygon/path 控制点与山脉骨架共用画布编辑事件，移动增删后实时重投影', async () => {
    const bundle = {
      ...REAL_BUNDLE,
      sheets: [{
        ...REAL_BUNDLE.sheets[0],
        features: [{
          id: 'polygon_1', sheetId: 'sheet_1', worldId: 'world_1', kind: 'region', category: 'grass', name: '三角草地', layer: 'terrain',
          geometry: { pts: [[0, 0], [3000, 0], [0, 3000]], elevationM: 150 },
          meta: { vectorPrimitive: { type: 'polygon', points: [[0, 0], [3000, 0], [0, 3000]] } }
        }]
      }]
    }
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(bundle)
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.get('.map-viewer__edit-toggle').trigger('click')
    wrapper.findComponent(MapCanvasStub).vm.$emit('feature-select', { id: 'polygon_1' })
    await flushPromises()

    let canvas = wrapper.findComponent(MapCanvasStub)
    expect(canvas.props('editGeometry')).toMatchObject({ target: 'polygon-vertices', topology: 'closed' })
    canvas.vm.$emit('edit-point-select', { index: 1 })
    canvas.vm.$emit('edit-point-move', { index: 1, point: [4500, 500], disableSnap: true })
    await flushPromises()
    canvas = wrapper.findComponent(MapCanvasStub)
    expect(canvas.props('editGeometry').points[1]).toEqual([4500, 500])
    expect(canvas.props('editPreviewFeatures')[0].pts[1]).toEqual([4500, 500])

    await wrapper.get('.map-terrain-editor__geometry-actions button').trigger('click')
    canvas = wrapper.findComponent(MapCanvasStub)
    expect(canvas.props('editGeometry').points).toHaveLength(4)
    await wrapper.get('.map-terrain-editor__geometry-actions button.danger').trigger('click')
    canvas = wrapper.findComponent(MapCanvasStub)
    expect(canvas.props('editGeometry').points).toHaveLength(3)
  })

  it('人工编辑期间同世界发生其他写入，旧草稿立即失效不允许覆盖新真值', async () => {
    const bundle = {
      ...REAL_BUNDLE,
      sheets: [{
        ...REAL_BUNDLE.sheets[0],
        features: [{
          id: 'grass_circle', sheetId: 'sheet_1', worldId: 'world_1', kind: 'region', category: 'grass', name: '圆形草原', layer: 'terrain',
          geometry: { pts: [[0, -5000], [5000, 0], [0, 5000], [-5000, 0]], elevationM: 150 },
          meta: { vectorPrimitive: { type: 'circle', center: [0, 0], radiusM: 5000 } }
        }]
      }]
    }
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(bundle)
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.get('.map-viewer__edit-toggle').trigger('click')
    wrapper.findComponent(MapCanvasStub).vm.$emit('feature-select', { id: 'grass_circle' })
    await flushPromises()
    expect(wrapper.find('.map-terrain-editor__name input').exists()).toBe(true)

    bumpWorldMapRevision('world_1')
    await flushPromises()
    expect(wrapper.find('.map-terrain-editor__name input').exists()).toBe(false)
    expect(wrapper.find('.map-terrain-editor__empty').text()).toContain('请重新选择地形')
  })

  it('切换世界必须先清旧 bundle：新世界数据未到位前画布卸载走载入卡，不再用旧世界数据建景（症状A 同族路径）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD, WORLD_B])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    // 世界B 的地图 bundle 挂起未决（可控 deferred），世界A 立即返回
    let resolveBundleB
    const pendingBundleB = new Promise((resolve) => { resolveBundleB = resolve })
    fetchWorldMapBundle.mockImplementation((worldId) => (worldId === 'world_1' ? Promise.resolve(REAL_BUNDLE) : pendingBundleB))
    attachSessionWorld.mockResolvedValue({
      world: { id: 'world_2' },
      session: { id: 'session_1', worldId: 'world_2', worldDocLibraryDocumentIds: [] }
    })

    const wrapper = mountDialog()
    await flushPromises()

    // 世界A 已载入：画布在渲染 A 数据
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)

    // 弹窗内世界选择器切到世界B：attachSessionWorld 落定后 loadWorldMap('world_2') 开跑但 fetch 未决——
    // 此刻旧 A bundle 必须已被清空，否则画布会以新 key 挂载却用 A 的 sheet 建景（MapCanvas 不 watch world 不自愈）。
    await wrapper.get('.map-viewer__world').trigger('click')
    const itemB = wrapper.findAll('.map-viewer__world-item').find((btn) => btn.text().includes(WORLD_B.name))
    expect(itemB, '世界选择器里应有世界B').toBeTruthy()
    await itemB.trigger('click')
    await flushPromises()

    // 旧 A 数据不再渲染：画布卸载、显示载入态卡
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__map-state-desc').text()).toBe(i18n.global.t('chat.mapDataLoading'))

    // B 数据到位：画布以 B 数据重挂
    resolveBundleB(REAL_BUNDLE_B)
    await flushPromises()
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)
    expect(wrapper.find('.map-viewer__map-state').exists()).toBe(false)
  })

  it('世界态载入完成且挂了真世界：不显示样例徽标，直接进真图（真机修 #29：真实世界不该常显"样例数据"）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)
    expect(wrapper.findComponent(MapCanvasStub).exists()).toBe(true)
    expect(wrapper.find('.map-viewer__sample-badge').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__map-state').exists()).toBe(false)
  })

  it('世界+图纸解析成功后挂载独立舆图师壳（不再借用星依portal），scopeKey按世界+当前图纸（地图与剧本工作区专业Agent计划批C）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog()
    await flushPromises()

    const shell = wrapper.findComponent({ name: 'WorkspaceAgentShell' })
    expect(shell.exists()).toBe(true)
    expect(shell.props('agentKind')).toBe('cartographer')
    expect(shell.props('targetId')).toBe('world_1:sheet_1')
    expect(shell.props('scopeKey')).toBe('cartographer:world_1:sheet_1')
  })

  it('舆图师对话框收起后归零宽，展开入口进入地图头部', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    const wrapper = mountDialog()
    await flushPromises()
    const shell = wrapper.findComponent({ name: 'WorkspaceAgentShell' })

    shell.vm.$emit('update:collapsed', true)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.map-viewer__xingyi-column').classes()).toContain('map-viewer__xingyi-column--collapsed')
    expect(wrapper.find('.map-viewer__xingyi-resize').exists()).toBe(false)
    const expandButton = wrapper.get('.map-viewer__agent-expand')
    expect(expandButton.attributes('aria-label')).toBe('展开舆图师对话框')
    expect(expandButton.element.parentElement).toBe(wrapper.get('.map-viewer__head').element)

    await expandButton.trigger('click')
    expect(wrapper.get('.map-viewer__xingyi-column').classes()).not.toContain('map-viewer__xingyi-column--collapsed')
    expect(wrapper.find('.map-viewer__xingyi-resize').exists()).toBe(true)
  })

  it('舆图师每轮按正式会话加载统一上下文，并把完整块与专业地图摘要交给 Harness', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    const wrapper = mountDialog()
    await flushPromises()
    const runner = wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('runner')

    await runner({ userText: '看看东边地貌', history: [], signal: new AbortController().signal })
    await runner({ userText: '再看一轮', history: [], signal: new AbortController().signal })

    expect(agentContextMock.loadRenderedAgentContext).toHaveBeenNthCalledWith(1, {
      sessionId: 'session_1', agentKind: 'huiyu_workspace', userText: '看看东边地貌'
    })
    expect(agentContextMock.loadRenderedAgentContext).toHaveBeenNthCalledWith(2, {
      sessionId: 'session_1', agentKind: 'huiyu_workspace', userText: '再看一轮'
    })
    expect(cartographerHarnessMock.runCartographerAgent).toHaveBeenCalledWith(expect.objectContaining({
      contextBlock: 'cartographer-rendered-context',
      worldId: 'world_1',
      sourceSessionId: 'session_1',
      mapSummary: expect.any(String)
    }))
  })

  it('无正式 sessionId 时保留壳，但发送舆图师会明确中止且不拿 worldId 冒充会话', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    const wrapper = mountDialog({ sessionId: '', worldId: 'world_1' })
    await flushPromises()
    const runner = wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('runner')

    await expect(runner({ userText: '画一座山', history: [], signal: new AbortController().signal }))
      .rejects.toThrow('舆图师缺少正式会话作用域')
    expect(agentContextMock.loadRenderedAgentContext).not.toHaveBeenCalled()
    expect(cartographerHarnessMock.runCartographerAgent).not.toHaveBeenCalled()
  })

  it('舆图师统一上下文加载失败时沿现役 runner 错误通道中止，不回退调用 Harness', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    agentContextMock.loadRenderedAgentContext.mockRejectedValueOnce(new Error('recipe abort'))
    const wrapper = mountDialog()
    await flushPromises()
    const runner = wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('runner')

    await expect(runner({ userText: '画一座山', history: [], signal: new AbortController().signal }))
      .rejects.toThrow('舆图师统一原始可见上下文加载失败：recipe abort')
    expect(cartographerHarnessMock.runCartographerAgent).not.toHaveBeenCalled()
  })

  it('未挂世界时保留禁用的舆图师壳，但不建垃圾专业会话', async () => {
    fetchWorlds.mockResolvedValue([])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: '' } })

    const wrapper = mountDialog({ sessionId: 'session_1', worldId: '' })
    await flushPromises()

    const shell = wrapper.findComponent({ name: 'WorkspaceAgentShell' })
    expect(shell.exists()).toBe(true)
    expect(shell.props('enabled')).toBe(false)
    expect(shell.props('targetId')).toBe('')
    expect(shell.props('scopeKey')).toBe('cartographer:unavailable')
  })

  it('已挂世界但还没有图纸时，可建立第一张正式图纸并立即启用舆图师', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle
      .mockResolvedValueOnce({ world: REAL_WORLD, defaultMapSheetId: '', sheets: [] })
      .mockResolvedValueOnce(REAL_BUNDLE)

    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('enabled')).toBe(false)
    const createButton = wrapper.get('.map-viewer__map-state-btn')
    expect(createButton.text()).toContain('建立第一张图纸')

    await createButton.trigger('click')
    await flushPromises()

    expect(mapSheetAuthoringMock.createInitialWorldMapSheet).toHaveBeenCalledWith({
      worldId: 'world_1',
      name: '主图'
    })
    expect(fetchWorldMapBundle).toHaveBeenCalledTimes(2)
    expect(wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('enabled')).toBe(true)
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)
  })

  it('建立第一张图纸失败时显示真实错误并保留重试入口', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue({ world: REAL_WORLD, defaultMapSheetId: '', sheets: [] })
    mapSheetAuthoringMock.createInitialWorldMapSheet.mockRejectedValueOnce(new Error('图纸写入失败'))

    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.get('.map-viewer__map-state-btn').trigger('click')
    await flushPromises()

    expect(wrapper.get('.map-viewer__map-state-error').text()).toContain('图纸写入失败')
    expect(wrapper.get('.map-viewer__map-state-btn').attributes('disabled')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'WorkspaceAgentShell' }).props('enabled')).toBe(false)
    expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)
  })

  it('无 sessionId 只传 worldId：能解析到该世界并渲染真图（星依世界寻址批·2026-07-13，草案确认卡零会话兜底）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog({ sessionId: '', worldId: 'world_1' })
    await flushPromises()

    // 无 sessionId 不会去查会话 bundle（fetchChatSessionBundleById 只在 normalizedSessionId 非空时才调用）
    expect(fetchChatSessionBundleById).not.toHaveBeenCalled()
    // worldId prop 命中 fetchWorlds 真实返回的世界：按它显示对应世界名+渲染真图（非样例）
    expect(wrapper.get('.map-viewer__world').text()).toContain('亚什基诺')
    expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)
    expect(wrapper.findComponent(MapCanvasStub).exists()).toBe(true)
  })

  it('worldId 是脏 id（不在 fetchWorlds 结果里）时不兜底，仍按未挂世界处理（防脏 id 误显示）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])

    const wrapper = mountDialog({ sessionId: '', worldId: 'world_does_not_exist' })
    await flushPromises()

    expect(wrapper.get('.map-viewer__world').text()).toContain(i18n.global.t('chat.mapWorldNone'))
    expect(wrapper.findComponent(MapCanvasStub).exists()).toBe(false)
  })

  it('舆图实时刷新（2026-07-12）：worldMapRevision bump 后带 800ms 防抖静默重拉重绘，不进入整窗 loading 态', async () => {
    vi.useFakeTimers()
    try {
      fetchWorlds.mockResolvedValue([REAL_WORLD])
      fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
      fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

      const wrapper = mountDialog()
      await flushPromises()
      expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)
      const mountCountBeforeBump = mapCanvasMountCount

      // 模拟绘舆又落了一笔：远程写成功后 chatRepository 会 bump 同一个 worldId
      const REAL_BUNDLE_V2 = {
        world: { id: 'world_1', name: '亚什基诺' },
        sheets: [{ ...REAL_BUNDLE.sheets[0], features: [{ id: 'f_new', kind: 'point', category: 'town', name: '新落笔的城镇', layer: 'terrain', geometry: { pts: [[10, 10]] }, style: null, links: null, meta: null, createdAt: '', updatedAt: '' }] }]
      }
      fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE_V2)
      bumpWorldMapRevision('world_1')

      // 防抖门槛内（<800ms）不应该立刻重拉——落笔常连发，靠尾沿防抖避免风暴
      await vi.advanceTimersByTimeAsync(400)
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)
      // 静默刷新期间旧画布仍在（不翻转整窗 loading 态，保留旧画面直到新数据到位）
      expect(wrapper.find('.map-viewer__map-state').exists()).toBe(false)
      expect(wrapper.find('.map-canvas-stub').exists()).toBe(true)

      // 跨过 800ms 门槛：应发起静默重拉，数据到位后画布携带新 rev 重挂
      await vi.advanceTimersByTimeAsync(500)
      await flushPromises()
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(2)
      expect(mapCanvasMountCount).toBeGreaterThan(mountCountBeforeBump)
      expect(wrapper.findComponent(MapCanvasStub).props('world').features).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('舆图实时刷新：worldMapRevision 携带别的世界 id 时不触发本弹窗重拉；弹窗关闭时也不触发', async () => {
    vi.useFakeTimers()
    try {
      fetchWorlds.mockResolvedValue([REAL_WORLD])
      fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
      fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

      const wrapper = mountDialog()
      await flushPromises()
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)

      // 别的世界的写：不相关，不该触发重拉
      bumpWorldMapRevision('world_other')
      await vi.advanceTimersByTimeAsync(900)
      await flushPromises()
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)

      // 弹窗关闭后 bump：不该触发重拉（组件实例仍存活但 open=false）
      await wrapper.setProps({ open: false })
      bumpWorldMapRevision('world_1')
      await vi.advanceTimersByTimeAsync(900)
      await flushPromises()
      expect(fetchWorldMapBundle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  // ── 地图版本历史（批L·2026-07-12）：历史面板渲染 + 点击进入/退出对照模式 ──
  const HISTORY_GROUPS = [
    {
      groupId: 'log_9', runKey: 'huiyu-1', runLabel: '画玄岳山脉',
      startedAt: '2026-07-12T01:00:00.000Z', endedAt: '2026-07-12T01:05:00.000Z',
      counts: { add: 1, update: 1, delete: 1 },
      items: [
        { id: 'log_9', op: 'add', featureId: 'f_add', snapshot: { id: 'f_add', kind: 'region' }, createdAt: '2026-07-12T01:05:00.000Z' },
        { id: 'log_8', op: 'update', featureId: 'f_upd', snapshot: { id: 'f_upd', kind: 'marker' }, createdAt: '2026-07-12T01:03:00.000Z' },
        { id: 'log_7', op: 'delete', featureId: 'f_del', snapshot: { id: 'f_del', kind: 'region', geometry: { pts: [[0, 0], [10, 0], [10, 10]] } }, createdAt: '2026-07-12T01:01:00.000Z' }
      ]
    },
    {
      groupId: 'log_1', runKey: 'manual', runLabel: '',
      startedAt: '2026-07-11T09:00:00.000Z', endedAt: '2026-07-11T09:00:00.000Z',
      counts: { add: 1, update: 0, delete: 0 },
      items: [{ id: 'log_1', op: 'add', featureId: 'f_old', snapshot: { id: 'f_old', kind: 'marker' }, createdAt: '2026-07-11T09:00:00.000Z' }]
    }
  ]

  it('历史入口位于右侧工具栏，默认不展开；点击后渲染 run 分组列表', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    fetchWorldMapChangeLog.mockResolvedValue(HISTORY_GROUPS)

    const wrapper = mountDialog()
    await flushPromises()

    // 打开弹窗时惰性拉取历史（拉取不受收起态影响）
    expect(fetchWorldMapChangeLog).toHaveBeenCalledWith('world_1')
    expect(wrapper.find('.map-viewer__history').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__history-body').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__history-toggle').exists()).toBe(true)

    // 点展开按钮：列表照常渲染，功能不变
    await wrapper.get('.map-viewer__history-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.map-viewer__history').exists()).toBe(true)
    const items = wrapper.findAll('.map-viewer__history-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('画玄岳山脉')
    expect(items[0].text()).toContain('+1')
    expect(items[0].text()).toContain('~1')
    expect(items[0].text()).toContain('-1')
    // manual 组显示兜底标题
    expect(items[1].text()).toContain(i18n.global.t('chat.mapHistoryManual'))

    // 关弹窗再打开：工具侧栏恒从关闭态重新开始（不记忆上次展开）
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(wrapper.find('.map-viewer__history').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__history-body').exists()).toBe(false)
  })

  it('历史面板：未挂世界不显示', async () => {
    fetchWorlds.mockResolvedValue([])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: '' } })

    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('.map-viewer__history').exists()).toBe(false)
  })

  it('点击历史条目进入对照模式（画布重挂并带 changeHighlight），再点同一条退出；退出按钮同效', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    fetchWorldMapChangeLog.mockResolvedValue(HISTORY_GROUPS)

    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('changeHighlight')).toBeNull()

    // 批M2：默认收起，先点展开按钮再操作条目
    await wrapper.get('.map-viewer__history-toggle').trigger('click')
    await flushPromises()
    const mountCountBefore = mapCanvasMountCount

    // 点击第一组：进入对照模式——MapCanvas 必须重挂（命令式建景靠 :key），changeHighlight 三分类正确
    await wrapper.findAll('.map-viewer__history-item')[0].trigger('click')
    await flushPromises()
    expect(mapCanvasMountCount).toBeGreaterThan(mountCountBefore)
    const highlight = wrapper.findComponent(MapCanvasStub).props('changeHighlight')
    expect(highlight.addIds).toEqual(['f_add'])
    expect(highlight.updateIds).toEqual(['f_upd'])
    expect(highlight.deleteGhosts).toEqual([{ id: 'f_del', kind: 'region', pts: [[0, 0], [10, 0], [10, 10]] }])
    expect(wrapper.findAll('.map-viewer__history-item')[0].classes()).toContain('on')

    // 再点同一条：退出对照模式，changeHighlight 回 null 且再次重挂
    const mountCountOn = mapCanvasMountCount
    await wrapper.findAll('.map-viewer__history-item')[0].trigger('click')
    await flushPromises()
    expect(mapCanvasMountCount).toBeGreaterThan(mountCountOn)
    expect(wrapper.findComponent(MapCanvasStub).props('changeHighlight')).toBeNull()

    // 进入对照后用「退出对照」按钮退出
    await wrapper.findAll('.map-viewer__history-item')[1].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('changeHighlight')).not.toBeNull()
    await wrapper.get('.map-viewer__history-exit').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('changeHighlight')).toBeNull()
  })

  it('worldMapRevision bump 的同一防抖里顺带刷新历史', async () => {
    vi.useFakeTimers()
    try {
      fetchWorlds.mockResolvedValue([REAL_WORLD])
      fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
      fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
      fetchWorldMapChangeLog.mockResolvedValue(HISTORY_GROUPS)

      mountDialog()
      await flushPromises()
      expect(fetchWorldMapChangeLog).toHaveBeenCalledTimes(1)

      bumpWorldMapRevision('world_1')
      await vi.advanceTimersByTimeAsync(400)
      expect(fetchWorldMapChangeLog).toHaveBeenCalledTimes(1) // 防抖门槛内不重拉
      await vi.advanceTimersByTimeAsync(500)
      await flushPromises()
      expect(fetchWorldMapChangeLog).toHaveBeenCalledTimes(2) // 跨过 800ms 与地图静默刷新同班车
    } finally {
      vi.useRealTimers()
    }
  })

  // ── 草案剪影决策（地图草案剪影可视化计划批2）：选中集单选/多选语义 + 三态标记提交 + 与
  // parseHuiyuSketchDecision 的 round-trip 一致性。MapDraftActionBar 不 stub（纯 UI 组件，无异步/ResizeObserver
  // 依赖），直接在渲染出的真实 DOM 上操作按钮/输入框。
  const DRAFT_SKETCHES = [
    {
      id: 'sk1', action: 'add', kind: 'region', category: 'forest', label: '林地剪影',
      sketch: { points: [[0, 0], [10, 0], [5, 10]] }, confidence: 'ready', card: { change: '新增林地' }
    },
    {
      id: 'sk2', action: 'add', kind: 'path', category: 'road', label: '道路剪影',
      sketch: { points: [[0, 0], [20, 20]] }, confidence: 'confirm', card: { change: '新增道路' }
    },
    {
      id: 'sk3', action: 'delete', kind: 'marker', category: 'landmark', label: '旧地标剪影',
      sketch: { center: [5, 5] }, confidence: 'risk', card: { change: '删除旧地标', risk: '影响剧情锚点' }
    }
  ]

  it('草案模式：普通点击单选替换、Shift 点击切换多选；未标记时提交按钮禁用（批2）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog({ draftSketches: DRAFT_SKETCHES })
    await flushPromises()

    // ⚠️ VTU 已知坑（本文件其它用例同款注释）：旧 DOMWrapper/组件 wrapper 引用在异步更新后不反映最新 props，
    // 每次读取前都要重新 findComponent 拿新引用；.vm.$emit(...) 本身用同一个组件实例即可，不受影响。
    expect(wrapper.findComponent(MapCanvasStub).props('draftSketches')).toEqual(DRAFT_SKETCHES)
    // 未标记：提交按钮禁用（native disabled 属性存在即为禁用态）
    expect(wrapper.get('.map-draft-bar__submit').attributes('disabled')).toBeDefined()

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: false, ctrlKey: false, clientX: 1, clientY: 1 })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk1'])

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk2', shiftKey: true, ctrlKey: false, clientX: 2, clientY: 2 })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk1', 'sk2'])

    // 再 Shift 点已选中项：切换取消
    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: true, ctrlKey: false, clientX: 1, clientY: 1 })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk2'])

    // 普通点击第三项：单选替换，不保留 sk2
    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk3', shiftKey: false, ctrlKey: false, clientX: 3, clientY: 3 })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk3'])
  })

  it('草案模式：采纳/弃用/意见三态标记后提交，decision 载荷与 parseHuiyuSketchDecision 解析结果 round-trip 一致（批2）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog({ draftSketches: DRAFT_SKETCHES })
    await flushPromises()

    // ⚠️ VTU 已知坑：每次都重新 findComponent 拿新引用（旧引用异步更新后不反映最新 props/DOM）。
    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    const acceptBtn = wrapper.findAll('.map-draft-bar__actions button').find((b) => b.text() === i18n.global.t('chat.mapDraftAccept'))
    await acceptBtn.trigger('click')

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk2', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    const rejectBtn = wrapper.findAll('.map-draft-bar__actions button').find((b) => b.text() === i18n.global.t('chat.mapDraftReject'))
    await rejectBtn.trigger('click')

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk3', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    const commentInput = wrapper.get(`[placeholder="${i18n.global.t('chat.mapDraftCommentPlaceholder')}"]`)
    await commentInput.setValue('位置往南挪一点')
    await commentInput.trigger('keyup.enter')

    const noteInput = wrapper.get(`[placeholder="${i18n.global.t('chat.mapDraftNotePlaceholder')}"]`)
    await noteInput.setValue('这轮草案整体偏保守')

    // 已有标记：提交按钮禁用解除
    expect(wrapper.get('.map-draft-bar__submit').attributes('disabled')).toBeUndefined()
    await wrapper.get('.map-draft-bar__submit').trigger('click')

    const events = wrapper.emitted('sketch-decision')
    expect(events).toBeTruthy()
    const payload = events[events.length - 1][0]
    expect(payload).toEqual({
      kind: 'huiyu-sketch-decision',
      accepted: ['sk1'],
      rejected: ['sk2'],
      comments: { sk3: '位置往南挪一点' },
      note: '这轮草案整体偏保守'
    })

    // round-trip：emit 的载荷序列化后喂回 parseHuiyuSketchDecision，必须解析出同样的四个字段
    const parsed = parseHuiyuSketchDecision(JSON.stringify(payload))
    expect(parsed).toEqual({
      accepted: payload.accepted,
      rejected: payload.rejected,
      comments: payload.comments,
      note: payload.note
    })
  })

  it('最终矢量审阅：必须逐项决策，修改意见按新协议提交且不落旧 sketch-decision', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    const reviewItems = [{
      id: 'terrain:mountain-1', action: 'add', kind: 'region', category: 'mountain', label: '东岭',
      confidence: 'ready', sketch: { center: [5, 5], points: [[0, 0], [10, 0], [0, 10]] },
      card: { change: '新增两层山体' },
      previewFeatures: [{ id: 'p1', kind: 'region', category: 'mountain', name: '东岭·主山体', layer: 'terrain', pts: [[0, 0], [10, 0], [0, 10]], elevationM: 800 }]
    }]
    const wrapper = mountDialog({ draftReviewItems: reviewItems })
    await flushPromises()

    expect(wrapper.findComponent(MapCanvasStub).props('draftReviewItems')).toEqual(reviewItems)
    expect(wrapper.get('.map-draft-bar__hint').text()).toBe(i18n.global.t('chat.mapFinalDraftHint'))
    expect(wrapper.get('.map-draft-bar__submit').attributes('disabled')).toBeDefined()

    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'terrain:mountain-1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    const input = wrapper.get(`[placeholder="${i18n.global.t('chat.mapFinalDraftModifyPlaceholder')}"]`)
    await input.setValue('山体再窄一些，峰线向北偏')
    await input.trigger('keyup.enter')
    expect(wrapper.get('.map-draft-bar__submit').attributes('disabled')).toBeUndefined()
    await wrapper.get('.map-draft-bar__submit').trigger('click')

    expect(wrapper.emitted('draft-review-decision')?.at(-1)?.[0]).toEqual({
      confirmed: [],
      modified: ['terrain:mountain-1'],
      deleted: [],
      comments: { 'terrain:mountain-1': '山体再窄一些，峰线向北偏' },
      notes: {},
      note: undefined
    })
    expect(wrapper.emitted('sketch-decision')).toBeFalsy()
  })

  it('最终矢量审阅：确认项也能附逐项备注且不被改成修改态', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)
    const reviewItems = [{
      id: 'terrain:grass-1', action: 'add', kind: 'region', category: 'grass', label: '北原',
      confidence: 'ready', sketch: { center: [5, 5], points: [[0, 0], [10, 0], [0, 10]] },
      card: { change: '新增草原' },
      previewFeatures: [{ id: 'p1', kind: 'region', category: 'grass', name: '北原', layer: 'terrain', pts: [[0, 0], [10, 0], [0, 10]], elevationM: 120 }]
    }]
    const wrapper = mountDialogAttached({ draftReviewItems: reviewItems })
    await flushPromises()
    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'terrain:grass-1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    await bodyFindAll('.map-draft-bar__actions button').find((button) => button.text() === i18n.global.t('chat.mapFinalDraftConfirm')).trigger('click')
    await bodyGet('.map-draft-bar__decided-toggle').trigger('click')
    const row = bodyGet('.map-draft-bar__decided-item')
    await row.findAll('.map-draft-bar__decided-actions button')[0].trigger('click')
    const input = bodyGet('.map-draft-bar__decided-edit input')
    await input.setValue('保留这片草原，后续河流从北缘经过')
    await input.trigger('keyup.enter')
    await bodyGet('.map-draft-bar__submit').trigger('click')
    expect(wrapper.emitted('draft-review-decision')?.at(-1)?.[0]).toEqual({
      confirmed: ['terrain:grass-1'],
      modified: [],
      deleted: [],
      comments: {},
      notes: { 'terrain:grass-1': '保留这片草原，后续河流从北缘经过' },
      note: undefined
    })
  })

  it('舆图师自持最终草稿审阅（批C）：无外部 draftReviewItems prop 时落到 scope 状态自己的待审阅，提交后 resolve 而非 emit', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const scopeKey = buildCartographerScopeKey('world_1', 'sheet_1')
    const reviewDraft = createScopeMapDraftReviewChannel(scopeKey, 'cartographer', 'world_1:sheet_1')
    const reviewItems = [{
      id: 'terrain:mountain-1', action: 'add', kind: 'region', category: 'mountain', label: '东岭',
      confidence: 'ready', sketch: { center: [5, 5], points: [[0, 0], [10, 0], [0, 10]] },
      card: { change: '新增两层山体' },
      previewFeatures: [{ id: 'p1', kind: 'region', category: 'mountain', name: '东岭·主山体', layer: 'terrain', pts: [[0, 0], [10, 0], [0, 10]], elevationM: 800 }]
    }]
    const resolutionPromise = reviewDraft({ kind: 'map-final-draft-review', worldId: 'world_1', sheetId: 'sheet_1', baseRevision: 'rev1', title: '确认新地形', items: reviewItems })

    const wrapper = mountDialog()
    await flushPromises()

    // 没传 draftReviewItems prop，但因为 scope 状态里已有待审阅，仍然进入最终审阅模式
    expect(wrapper.findComponent(MapCanvasStub).props('draftReviewItems')).toEqual(reviewItems)
    expect(wrapper.get('.map-draft-bar__hint').text()).toBe(i18n.global.t('chat.mapFinalDraftHint'))

    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'terrain:mountain-1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    await wrapper.findAll('.map-draft-bar__actions button').find((b) => b.text() === i18n.global.t('chat.mapFinalDraftConfirm')).trigger('click')
    await wrapper.get('.map-draft-bar__submit').trigger('click')

    // resolve 落定的是 reviewDraft() 返回的 Promise（引擎侧真正等待的那个），不是靠 emit
    const resolution = await resolutionPromise
    expect(resolution).toEqual({ status: 'submitted', decision: { confirmed: ['terrain:mountain-1'], modified: [], deleted: [], comments: {}, notes: {}, note: undefined } })
    expect(wrapper.emitted('draft-review-decision')).toBeFalsy()
    expect(findScopeState(scopeKey)?.pendingMapDraftReview).toBeNull()
  })

  // ── 已决策清单"挂起区"（地图草案剪影可视化真机返工批A·2026-07-13）──
  // ⚠️ 本用例用 mountDialogAttached（真实 Teleport，不 stub）：折叠面板/行内改意见依赖 MapDraftActionBar
  // 自身内部状态（decidedOpen/editingId）跨多次交互存活，VTU 的 teleport stub 会让它随父级任意响应式
  // 更新反复卸载重挂（见 mountDialogAttached 注释），真实浏览器不受影响，测试须还原真实 Teleport 行为。
  it('已决策清单：折叠面板渲染行数+提交按钮带计数+点击行选中并居中+改意见回填+撤销清空标记', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialogAttached({ draftSketches: DRAFT_SKETCHES })
    await flushPromises()

    // 标三态：sk1 采纳、sk2 弃用、sk3 意见
    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    await bodyFindAll('.map-draft-bar__actions button').find((b) => b.text() === i18n.global.t('chat.mapDraftAccept')).trigger('click')
    await flushPromises()
    // ①标记后 sketchMarks 确实传染到了 MapCanvas（决策零反馈根治的传导链路断言，不只是本弹窗内部状态）
    expect(wrapper.findComponent(MapCanvasStub).props('sketchMarks')).toEqual({ sk1: 'accepted' })

    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk2', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    await bodyFindAll('.map-draft-bar__actions button').find((b) => b.text() === i18n.global.t('chat.mapDraftReject')).trigger('click')
    await flushPromises()

    wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk3', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    const commentInput = bodyGet(`[placeholder="${i18n.global.t('chat.mapDraftCommentPlaceholder')}"]`)
    await commentInput.setValue('先给个初始意见')
    await commentInput.trigger('keyup.enter')
    await flushPromises()

    // 提交按钮改用带计数文案
    expect(bodyGet('.map-draft-bar__submit').text()).toBe(
      i18n.global.t('chat.mapDraftSubmitWithCounts', { accepted: 1, rejected: 1, commented: 1 })
    )

    // 展开已决策清单：3 行，文案带数量
    const decidedToggle = bodyGet('.map-draft-bar__decided-toggle')
    expect(decidedToggle.text()).toContain(i18n.global.t('chat.mapDraftDecidedToggle', { count: 3 }))
    await decidedToggle.trigger('click')
    await flushPromises()
    expect(bodyFindAll('.map-draft-bar__decided-item')).toHaveLength(3)

    // 点击 sk2 那一行：地图选中并居中——selectedSketchIds 变为 ['sk2']，MapCanvas 的 focusSketch prop 变化（且带 sk2）
    const focusBefore = wrapper.findComponent(MapCanvasStub).props('focusSketch')
    const sk2Row = bodyFindAll('.map-draft-bar__decided-item').find((r) => r.text().includes('道路剪影'))
    await sk2Row.get('.map-draft-bar__decided-row').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk2'])
    const focusAfter = wrapper.findComponent(MapCanvasStub).props('focusSketch')
    expect(focusAfter).toBeTruthy()
    expect(focusAfter.id).toBe('sk2')
    expect(focusAfter).not.toEqual(focusBefore)
    // 折叠面板在这次"选中并居中"的响应式更新后仍保持展开（决策零反馈根治的另一面：内部 UI 状态不能被父级更新打断）
    expect(bodyFindAll('.map-draft-bar__decided-item')).toHaveLength(3)

    // 改意见：给 sk1（此前"采纳"、无意见）改意见——点【改意见】、行内输入框回填（空）、输入新意见确认后转为"有意见"
    const sk1Row = bodyFindAll('.map-draft-bar__decided-item').find((r) => r.text().includes('林地剪影'))
    await sk1Row.findAll('.map-draft-bar__decided-actions button')[0].trigger('click') // 改意见
    await flushPromises()
    const sk1RowEditing = bodyFindAll('.map-draft-bar__decided-item').find((r) => r.text().includes('林地剪影'))
    const editInput = sk1RowEditing.get(`[placeholder="${i18n.global.t('chat.mapDraftDecidedEditPlaceholder')}"]`)
    expect(editInput.element.value).toBe('') // 回填：sk1 之前没有意见，空串
    await editInput.setValue('这里往南挪一点')
    await editInput.trigger('keyup.enter')
    await flushPromises()
    const sk1RowAfter = bodyFindAll('.map-draft-bar__decided-item').find((r) => r.text().includes('林地剪影'))
    expect(sk1RowAfter.text()).toContain('这里往南挪一点')
    expect(sk1RowAfter.text()).toContain(i18n.global.t('chat.mapDraftMarkCommented'))
    expect(wrapper.findComponent(MapCanvasStub).props('sketchMarks').sk1).toBe('commented')

    // 撤销：给 sk3 撤销——清单减到 2 行，该项标记清空
    const sk3Row = bodyFindAll('.map-draft-bar__decided-item').find((r) => r.text().includes('旧地标剪影'))
    await sk3Row.findAll('.map-draft-bar__decided-actions button')[1].trigger('click') // 撤销
    await flushPromises()
    expect(bodyFindAll('.map-draft-bar__decided-item')).toHaveLength(2)
    expect(wrapper.findComponent(MapCanvasStub).props('sketchMarks').sk3).toBeUndefined()
  })

  it('Shift 框选命中的剪影 id 集合并入选中集（不替换既有选中）', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog({ draftSketches: DRAFT_SKETCHES })
    await flushPromises()

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: false, ctrlKey: false, clientX: 0, clientY: 0 })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds')).toEqual(['sk1'])

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-box-select', { ids: ['sk2', 'sk3'] })
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('selectedSketchIds').slice().sort()).toEqual(['sk1', 'sk2', 'sk3'])
  })

  // ── 网格坐标系（地图草案剪影可视化计划批4·2026-07-12）：开关按钮 + localStorage 记忆 + 剪影锚定卡格号行 ──
  it('网格坐标开关：点击切换透传给 MapCanvas 的 show-grid，状态写入 localStorage 并在下次挂载时读回', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.findComponent(MapCanvasStub).props('showGrid')).toBe(false)
    const gridBtn = wrapper.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapGridToggle')))
    expect(gridBtn, '应存在网格坐标开关按钮').toBeTruthy()

    await gridBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.map-viewer__grid-panel').exists()).toBe(true)
    await wrapper.get('.map-viewer__grid-switch').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(MapCanvasStub).props('showGrid')).toBe(true)
    expect(window.localStorage.getItem('langhuan_map_grid_on')).toBe('1')

    // 下次挂载（如重开弹窗）读回持久化状态，默认即为开启
    const wrapper2 = mountDialog()
    await flushPromises()
    expect(wrapper2.findComponent(MapCanvasStub).props('showGrid')).toBe(true)

    // 再次点击关闭：localStorage 同步写回 '0'
    const gridBtn2 = wrapper2.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapGridToggle')))
    await gridBtn2.trigger('click')
    await flushPromises()
    await wrapper2.get('.map-viewer__grid-switch').trigger('click')
    await flushPromises()
    expect(window.localStorage.getItem('langhuan_map_grid_on')).toBe('0')
  })

  it('剪影锚定卡：网格开启且锚点可用时自动带一行格号；网格关闭时不显示该行', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog({ draftSketches: DRAFT_SKETCHES })
    await flushPromises()

    await wrapper.findComponent(MapCanvasStub).vm.$emit('sketch-click', { id: 'sk1', shiftKey: false, ctrlKey: false, clientX: 5, clientY: 5 })
    await flushPromises()

    // 网格未开启：锚定卡不显示格号行
    expect(wrapper.get('.map-viewer__sketch-pop-body').text()).not.toContain(i18n.global.t('chat.mapDraftCardGridRef'))

    // 开启网格：REAL_BUNDLE 没有正式要素，使用空图 100km 初始观察窗。
    const gridBtn = wrapper.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapGridToggle')))
    await gridBtn.trigger('click')
    await flushPromises()
    await wrapper.get('.map-viewer__grid-switch').trigger('click')
    await flushPromises()
    const gridRow = wrapper.get('.map-viewer__sketch-pop-body')
    expect(gridRow.text()).toContain(i18n.global.t('chat.mapDraftCardGridRef'))
    expect(gridRow.text()).toContain('F6')
  })

  // ── 点阵投影调试面板（装甲地图系统计划批A1 附属工具·2026-07-13）：山脉等装甲地形谓词的人工验货台 ──
  it('点阵投影调试面板：未挂真实世界时按钮禁用', async () => {
    fetchWorlds.mockResolvedValue([])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: '' } })

    const wrapper = mountDialog()
    await flushPromises()

    const dotBtn = wrapper.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapDotMatrix')))
    expect(dotBtn, '应存在点阵按钮').toBeTruthy()
    expect(dotBtn.attributes('disabled')).toBeDefined()
    // 禁用态下面板本就不该打开
    expect(wrapper.find('.map-viewer__dotmatrix').exists()).toBe(false)
  })

  it('点阵投影调试面板：打开→点生成→pre 出现文本且统计行数字与 buildMountainDotMatrix 直接计算结果一致；与历史面板互斥', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(REAL_BUNDLE)

    const wrapper = mountDialog()
    await flushPromises()

    const dotBtn = wrapper.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapDotMatrix')))
    expect(dotBtn.attributes('disabled')).toBeUndefined()

    await dotBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.map-viewer__dotmatrix').exists()).toBe(true)

    await wrapper.get('.map-viewer__dotmatrix-generate').trigger('click')
    await flushPromises()

    // 期望值直接用真实函数算（gridN 默认 41，REAL_BUNDLE 无 water/mountain 要素）——不手算网格数字
    const expected = buildMountainDotMatrix({
      framePts: computeMapTaskFrame([]).pts,
      waterRegions: [],
      mountainRegions: [],
      gridN: 41
    })
    // ⚠️ 用 .element.textContent 而非 VTU 的 .text()：后者会 .trim() 掉首行用于列号对齐的前导空格，
    // 破坏点阵文本的逐字节校验（首行列号对齐正是这份文本的关键信息）。
    expect(wrapper.get('.map-viewer__dotmatrix-pre').element.textContent).toBe(expected.text)

    let legal = 0
    let total = 0
    for (const row of expected.legal) {
      total += row.length
      for (const cell of row) { if (cell) legal += 1 }
    }
    const illegal = total - legal
    const pct = ((legal / total) * 100).toFixed(1)
    const cell = (expected.spec.cellM / 1000).toFixed(1)
    expect(wrapper.get('.map-viewer__dotmatrix-stats').text()).toBe(
      i18n.global.t('chat.mapDotMatrixStats', { legal, illegal, pct, cell })
    )

    // 互斥：展开历史面板应收起点阵面板
    await wrapper.get('.map-viewer__history-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.map-viewer__dotmatrix').exists()).toBe(false)
  })

  it('点阵投影调试面板：无已探范围且无内容时使用默认 100km 工作框，不再报空态错误', async () => {
    fetchWorlds.mockResolvedValue([REAL_WORLD])
    fetchChatSessionBundleById.mockResolvedValue({ session: { worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue({
      world: { id: 'world_1', name: '亚什基诺' },
      sheets: [{ id: 'sheet_1', name: '主图', explored: { pts: [] }, features: [] }]
    })

    const wrapper = mountDialog()
    await flushPromises()

    // 有图纸即显示纸白空画布；工作框只是空图首次观察和点阵换算坐标系，不是正式地图边界。
    const dotBtn = wrapper.findAll('.map-viewer__status-toggle').find((b) => b.text().includes(i18n.global.t('chat.mapDotMatrix')))
    expect(dotBtn.attributes('disabled')).toBeUndefined()

    await dotBtn.trigger('click')
    await flushPromises()
    await wrapper.get('.map-viewer__dotmatrix-generate').trigger('click')
    await flushPromises()

    expect(wrapper.find('.map-viewer__dotmatrix-error').exists()).toBe(false)
    expect(wrapper.find('.map-viewer__dotmatrix-pre').exists()).toBe(true)
    expect(wrapper.get('.map-viewer__dotmatrix-pre').element.textContent).toBe(buildMountainDotMatrix({
      framePts: computeMapTaskFrame([]).pts,
      waterRegions: [],
      mountainRegions: [],
      gridN: 41
    }).text)
  })
})
