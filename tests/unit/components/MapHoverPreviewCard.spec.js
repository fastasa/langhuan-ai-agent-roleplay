/**
 * @vitest-environment jsdom
 */
import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MapHoverPreviewCard from '../../../src/components/app/map/MapHoverPreviewCard.vue'
import { i18n } from '../../../src/i18n'
import { fetchChatSessionBundleById, fetchWorldMapBundle } from '../../../src/repositories/chatRepository'
import { resetWorldMapRevisionForTest } from '../../../src/app/worldMapRevision'

vi.mock('../../../src/repositories/chatRepository', () => ({
  fetchChatSessionBundleById: vi.fn(),
  fetchWorldMapBundle: vi.fn()
}))

const MapCanvasStub = {
  name: 'MapCanvas',
  props: {
    world: Object,
    panels: Object,
    view: String,
    statusOn: Boolean,
    compact: Boolean
  },
  template: '<div class="map-canvas-stub"></div>'
}

const MAP_BUNDLE = {
  world: { id: 'world_1', name: '亚什基诺' },
  sheets: [{
    id: 'sheet_1',
    worldId: 'world_1',
    name: '主图',
    explored: null,
    features: [{
      id: 'grass_1',
      sheetId: 'sheet_1',
      worldId: 'world_1',
      kind: 'region',
      category: 'grass',
      name: '中央草原',
      layer: 'terrain',
      geometry: { pts: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] },
      style: { rough: 0.25 }
    }]
  }]
}

function mountCard(props = {}) {
  return mount(MapHoverPreviewCard, {
    global: {
      plugins: [createPinia(), i18n],
      stubs: { MapCanvas: MapCanvasStub }
    },
    props: { sessionId: 'session_1', active: true, ...props }
  })
}

describe('MapHoverPreviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetWorldMapRevisionForTest()
    i18n.global.locale.value = 'zh'
  })

  it('按当前会话世界加载主图，并以紧凑模式复用 MapCanvas 与正式要素投影', async () => {
    fetchChatSessionBundleById.mockResolvedValue({ session: { id: 'session_1', worldId: 'world_1' } })
    fetchWorldMapBundle.mockResolvedValue(MAP_BUNDLE)

    const wrapper = mountCard()
    await flushPromises()

    expect(fetchChatSessionBundleById).toHaveBeenCalledWith('session_1', { limit: 1 })
    expect(fetchWorldMapBundle).toHaveBeenCalledWith('world_1')
    const canvas = wrapper.findComponent(MapCanvasStub)
    expect(canvas.exists()).toBe(true)
    expect(canvas.props('compact')).toBe(true)
    expect(canvas.props('world')).toMatchObject({
      name: '亚什基诺',
      sheet: '主图',
      features: [{ id: 'grass_1', category: 'grass', rough: 0.25 }]
    })
  })

  it('当前会话未挂世界时显示空态，不拿样例世界冒充当前地图', async () => {
    fetchChatSessionBundleById.mockResolvedValue({ session: { id: 'session_1', worldId: '' } })

    const wrapper = mountCard()
    await flushPromises()

    expect(fetchWorldMapBundle).not.toHaveBeenCalled()
    expect(wrapper.findComponent(MapCanvasStub).exists()).toBe(false)
    expect(wrapper.get('.map-hover-card__state--empty').text()).toContain('这个世界还没有舆图')
  })
})
