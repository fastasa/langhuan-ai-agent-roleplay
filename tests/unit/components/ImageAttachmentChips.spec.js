/**
 * @vitest-environment jsdom
 */
// 图片附件悬浮缩略图条回归（输入框图片上传计划批3·2026-07-11）。
// 覆盖：空态不渲染、ready/uploading/failed 三态外观与 aria-label、remove/retry/preview 三个 emit。
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImageAttachmentChips from '../../../src/components/app/chat/ImageAttachmentChips.vue'
// 组件用 useI18n()，mount 必须装真 i18n（zh 钉死让中文断言稳定，同 TidiaoDirectorStreamBand.spec.js 先例）。
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

function makeImage(overrides = {}) {
  return {
    id: 'img_1',
    kind: 'image',
    url: '/chat-images/img_1.png',
    mime: 'image/png',
    previewUrl: 'blob:preview-1',
    status: 'ready',
    ...overrides
  }
}

function mountChips(images) {
  return mount(ImageAttachmentChips, {
    props: { images },
    global: { plugins: [i18n] }
  })
}

describe('ImageAttachmentChips', () => {
  it('images 为空：不渲染任何内容', () => {
    const wrapper = mountChips([])
    expect(wrapper.find('.image-attachment-chips').exists()).toBe(false)
  })

  it('ready 态：渲染缩略图，点击 emit preview(url)', async () => {
    const wrapper = mountChips([makeImage()])
    const chip = wrapper.find('.iac-chip')
    expect(chip.classes()).toContain('iac-chip--ready')
    expect(chip.find('.iac-chip__spinner').exists()).toBe(false)
    expect(chip.find('.iac-chip__warn').exists()).toBe(false)

    await chip.find('.iac-chip__thumb').trigger('click')
    expect(wrapper.emitted('preview')).toEqual([['/chat-images/img_1.png']])
    expect(wrapper.emitted('retry')).toBeUndefined()
  })

  it('uploading 态：缩略图按钮 disabled，盖旋转指示，点击不触发任何 emit', async () => {
    const wrapper = mountChips([makeImage({ status: 'uploading' })])
    const chip = wrapper.find('.iac-chip')
    expect(chip.classes()).toContain('iac-chip--uploading')
    const thumb = chip.find('.iac-chip__thumb')
    expect(thumb.attributes('disabled')).toBeDefined()
    expect(chip.find('.iac-chip__spinner').exists()).toBe(true)

    await thumb.trigger('click')
    expect(wrapper.emitted('preview')).toBeUndefined()
    expect(wrapper.emitted('retry')).toBeUndefined()
  })

  it('failed 态：盖警示图标+errorMessage 作为 title，点击缩略图 emit retry(id)', async () => {
    const wrapper = mountChips([makeImage({ status: 'failed', errorMessage: '图片过大' })])
    const chip = wrapper.find('.iac-chip')
    expect(chip.classes()).toContain('iac-chip--failed')
    const thumb = chip.find('.iac-chip__thumb')
    expect(thumb.find('.iac-chip__warn').exists()).toBe(true)
    expect(thumb.attributes('title')).toBe('图片过大')

    await thumb.trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['img_1']])
    expect(wrapper.emitted('preview')).toBeUndefined()
  })

  it('删除按钮：点击 emit remove(id)，不触发缩略图的 preview/retry', async () => {
    const wrapper = mountChips([makeImage()])
    await wrapper.find('.iac-chip__remove').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['img_1']])
    expect(wrapper.emitted('preview')).toBeUndefined()
  })

  it('多张图片：各自独立渲染与 key', () => {
    const wrapper = mountChips([makeImage({ id: 'a' }), makeImage({ id: 'b', status: 'failed', errorMessage: 'x' })])
    expect(wrapper.findAll('.iac-chip')).toHaveLength(2)
  })
})
