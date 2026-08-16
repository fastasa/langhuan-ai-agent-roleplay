import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createTimeline, duplicateTimelineFrame } from '@/pixel-studio/core'
import TimelineDock from '@/pixel-studio/ui/TimelineDock.vue'

function animatedDoc() {
  let doc = createTimeline(createDocument({ name: '眨眼', width: 2, height: 2 }), 10, 20)
  doc = duplicateTimelineFrame(doc, 0)
  return doc
}

describe('TimelineDock', () => {
  beforeEach(() => window.localStorage.clear())

  it('默认收起，箭头展开后静态文档显示新建时间轴入口', async () => {
    const wrapper = mount(TimelineDock, { props: { doc: createDocument({ name: '静态', width: 1, height: 1 }), currentFrameIndex: 0, playheadFrame: 1, playing: false } })
    expect(wrapper.find('.timeline-dock__content').exists()).toBe(false)
    await wrapper.find('.timeline-dock__toggle').trigger('click')
    expect(wrapper.find('.timeline-dock__create').text()).toContain('新建时间轴')
    await wrapper.find('.timeline-dock__create').trigger('click')
    expect(wrapper.emitted('create-timeline')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('pixel-studio:timeline-layout')).expanded).toBe(true)
  })

  it('展开态显示 fps、蓝色双边界、红色帧号播放头与曝光色块', async () => {
    window.localStorage.setItem('pixel-studio:timeline-layout', JSON.stringify({ expanded: true, height: 240 }))
    const doc = animatedDoc()
    const wrapper = mount(TimelineDock, { props: { doc, currentFrameIndex: 1, playheadFrame: 20, playing: false } })
    expect(wrapper.find('.timeline-dock__meta').text()).toContain('10 fps · 20 帧')
    expect(wrapper.findAll('.timeline-dock__boundary')).toHaveLength(2)
    expect(wrapper.findAll('.timeline-dock__segment')).toHaveLength(2)
    expect(wrapper.find('.timeline-dock__playhead').text()).toBe('20')
    expect(wrapper.findAll('.timeline-dock__segment')[1].classes()).toContain('timeline-dock__segment--active')
  })

  it('画帧按钮分发播放、复制、删除与前后帧动作', async () => {
    window.localStorage.setItem('pixel-studio:timeline-layout', JSON.stringify({ expanded: true }))
    const wrapper = mount(TimelineDock, { props: { doc: animatedDoc(), currentFrameIndex: 0, playheadFrame: 1, playing: false } })
    await wrapper.find('[title="播放"]').trigger('click')
    await wrapper.find('[title="上一画帧"]').trigger('click')
    await wrapper.find('[title="下一画帧"]').trigger('click')
    await wrapper.find('[title="复制当前画帧"]').trigger('click')
    await wrapper.find('[title="删除当前画帧"]').trigger('click')
    expect(wrapper.emitted('toggle-play')).toHaveLength(1)
    expect(wrapper.emitted('previous-frame')).toHaveLength(1)
    expect(wrapper.emitted('next-frame')).toHaveLength(1)
    expect(wrapper.emitted('duplicate-frame')).toHaveLength(1)
    expect(wrapper.emitted('delete-frame')).toHaveLength(1)
  })

  it('点击曝光段选择对应画帧并携带时间格起点', async () => {
    window.localStorage.setItem('pixel-studio:timeline-layout', JSON.stringify({ expanded: true }))
    const doc = animatedDoc()
    const wrapper = mount(TimelineDock, { props: { doc, currentFrameIndex: 0, playheadFrame: 1, playing: false } })
    await wrapper.findAll('.timeline-dock__segment')[1].trigger('pointerdown')
    expect(wrapper.emitted('select-frame')[0]).toEqual([1, 20])
  })
})
