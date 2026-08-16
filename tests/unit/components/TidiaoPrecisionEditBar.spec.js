import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TidiaoPrecisionEditBar from '../../../src/components/app/chat/TidiaoPrecisionEditBar.vue'

describe('TidiaoPrecisionEditBar（输入栏上方常驻提调纠偏浮条）', () => {
  it('输入指令点纠偏 → emit submit + 清草稿保留本体', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar)
    const textarea = wrapper.find('textarea')
    await textarea.setValue('角色3-5、旁白2 改委婉点')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')[0]).toEqual(['角色3-5、旁白2 改委婉点'])
    // 走完保留输入框本体、清草稿。（类名 2026-06-22 改皮后为 .tds-tab，本测同步纠正旧 .tds-edit-bar）
    expect(textarea.element.value).toBe('')
    expect(wrapper.find('.tds-tab').exists()).toBe(true)
  })

  it('IME 合成中的回车（isComposing / keyCode 229）不提交，普通回车正常提交（修复批次H）', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar)
    const textarea = wrapper.find('textarea')
    await textarea.setValue('正在打拼音')

    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('submit')).toBeFalsy()

    await textarea.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(wrapper.emitted('submit')).toBeFalsy()

    await textarea.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')[0]).toEqual(['正在打拼音'])
  })

  it('空草稿不触发、按钮禁用', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('.tds-tab__send').attributes('disabled')).toBeDefined()
  })

  it('disabled 时不触发', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar, { props: { disabled: true } })
    await wrapper.find('textarea').setValue('角色1 改')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('D6：缺省占位为单聊文案、传 placeholder（群聊楼层提示）时用传入文案', () => {
    const single = mount(TidiaoPrecisionEditBar)
    expect(single.find('textarea').attributes('placeholder')).toBe('输入消息，让提调修改聊天')
    const group = mount(TidiaoPrecisionEditBar, {
      props: { placeholder: '提调修改群聊：带「角色2」按楼层精修指定角色，或直接说改方向纠偏' }
    })
    expect(group.find('textarea').attributes('placeholder')).toContain('按楼层精修指定角色')
  })

  it('2026-07-12：静止态外层命中区 .tds-tab-wrap 不含 is-raised', () => {
    const wrapper = mount(TidiaoPrecisionEditBar)
    expect(wrapper.find('.tds-tab-wrap').classes()).not.toContain('is-raised')
  })

  it('2026-07-12：hover 外层命中区后 .tds-tab-wrap 与 .tds-tab 均带 is-raised（接近区随之长出）', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar)
    await wrapper.find('.tds-tab-wrap').trigger('mouseenter')
    await nextTick()
    expect(wrapper.find('.tds-tab-wrap').classes()).toContain('is-raised')
    expect(wrapper.find('.tds-tab').classes()).toContain('is-raised')
  })

  it('2026-07-23：输入框聚焦后即使鼠标边界离开也保持上浮，主动失焦后才收起', async () => {
    const wrapper = mount(TidiaoPrecisionEditBar, { attachTo: document.body })
    const wrap = wrapper.find('.tds-tab-wrap')
    const textarea = wrapper.find('textarea')

    await wrap.trigger('mouseenter')
    textarea.element.focus()
    await nextTick()
    await textarea.setValue('补')
    await wrap.trigger('mouseleave')
    await nextTick()

    expect(wrapper.find('.tds-tab-wrap').classes()).toContain('is-raised')
    expect(document.activeElement).toBe(textarea.element)

    textarea.element.blur()
    await nextTick()
    expect(wrapper.find('.tds-tab-wrap').classes()).not.toContain('is-raised')
    wrapper.unmount()
  })

  it('收起态不再用透明伪元素覆盖末条消息操作区', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/app/chat/TidiaoPrecisionEditBar.vue'), 'utf8')
    expect(source).not.toContain('.tds-tab-wrap::before')
    expect(source).toContain('只保留实际露出的绿边作为静止态命中区')
  })
})
