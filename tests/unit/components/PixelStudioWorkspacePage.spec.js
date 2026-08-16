/** @vitest-environment jsdom */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  fetchStatusPanels: vi.fn(),
  uploadStatusAsset: vi.fn()
}))

vi.mock('../../../src/repositories/chatRepository', () => repository)
vi.mock('../../../src/pixel-studio/ui/PixelStudioPage.vue', () => ({
  default: {
    name: 'PixelStudioPage',
    props: ['publishTargets', 'publishTargetLabel', 'publishActionLabel', 'onPublishSnapshot'],
    template: '<div class="pixel-studio-page-stub"></div>'
  }
}))

import PixelStudioWorkspacePage from '../../../src/components/app/pixel/PixelStudioWorkspacePage.vue'

describe('PixelStudioWorkspacePage 状态图片发布适配层', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('只读正式目标，发布时上传正式资产并以版本号写回图片字段', async () => {
    const target = { sessionId: 'session_1', panelId: 'panel_1', fieldKey: 'map', label: '夜谈 / 领地 / 像素图' }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ items: [target] }) })))
    repository.fetchStatusPanels.mockResolvedValue([{
      id: 'panel_1', templateId: 'tpl_1', name: '领地', description: '', hostType: 'none', hostId: '', values: {}, version: 7
    }])
    repository.uploadStatusAsset.mockResolvedValue({
      asset: { id: 'status_asset_123', sourceType: 'pixel_snapshot' },
      ref: { assetId: 'status_asset_123', kind: 'image', alt: '领地 像素快照' }
    })

    const wrapper = mount(PixelStudioWorkspacePage)
    await flushPromises()
    const studio = wrapper.findComponent({ name: 'PixelStudioPage' })
    expect(studio.props('publishTargets')).toEqual([{ id: JSON.stringify(target), label: target.label }])

    await studio.props('onPublishSnapshot')({
      targetId: JSON.stringify(target),
      blob: new Blob(['pixel'], { type: 'image/png' }),
      fileName: '领地.png',
      source: { pixelDocumentId: 'doc_1', frameIndex: 0, scale: 4 }
    })

    expect(repository.uploadStatusAsset).toHaveBeenCalledWith('session_1', expect.objectContaining({
      fileName: '领地.png',
      sourceType: 'pixel_snapshot',
      sourceRef: expect.objectContaining({ panelId: 'panel_1', fieldKey: 'map', pixelDocumentId: 'doc_1' }),
      bind: expect.objectContaining({ panelId: 'panel_1', fieldKey: 'map', expectedVersion: 7, idempotencyKey: expect.stringMatching(/^pixel-status-/) })
    }))
  })
})
