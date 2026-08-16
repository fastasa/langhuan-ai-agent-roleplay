/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MobileFlowRow from '../../../src/components/mobile-workspace/MobileFlowRow.vue'
import MobileGlassNav from '../../../src/components/mobile-workspace/MobileGlassNav.vue'
import MobileRoleplayText from '../../../src/components/mobile-workspace/MobileRoleplayText.vue'
import MobileTopBar from '../../../src/components/mobile-workspace/MobileTopBar.vue'
import MobileTreeToolbar from '../../../src/components/mobile-workspace/MobileTreeToolbar.vue'

describe('mobile workspace primitives', () => {
  it('emits selected root nav item and marks active item', async () => {
    const wrapper = mount(MobileGlassNav, {
      props: {
        activeItem: 'chat',
        items: [
          { id: 'chat', label: '聊天', icon: 'message-circle' },
          { id: 'roles', label: '角色', icon: 'user-round' },
          { id: 'docs', label: '文档', icon: 'library-big' },
          { id: 'me', label: '我的', icon: 'sparkles' }
        ]
      }
    })

    expect(wrapper.find('.mobile-glass-nav__item--active').text()).toContain('聊天')

    await wrapper.findAll('.mobile-glass-nav__item').at(1).trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['roles'])
  })

  it('keeps top bar action compact and explicit', async () => {
    const wrapper = mount(MobileTopBar, {
      props: {
        title: '聊天',
        actionLabel: '新建会话',
        actionIcon: 'plus'
      }
    })

    expect(wrapper.text()).toContain('聊天')
    expect(wrapper.text()).toContain('新建会话')

    await wrapper.find('.mobile-top-bar__action').trigger('click')
    expect(wrapper.emitted('primary')).toHaveLength(1)
  })

  it('renders dense flow rows without adding nested cards', async () => {
    const wrapper = mount(MobileFlowRow, {
      props: {
        title: '陈星依',
        meta: '1人',
        sub: '高高举起右手。'
      }
    })

    expect(wrapper.classes()).toContain('mobile-flow-row')
    expect(wrapper.text()).toContain('陈星依')
    expect(wrapper.text()).toContain('高高举起右手。')

    await wrapper.trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('uses the shared chat markdown renderer for roleplay text', () => {
    const wrapper = mount(MobileRoleplayText, {
      props: {
        text: '*抬手* {心里悄悄记下} [重要]'
      }
    })

    expect(wrapper.find('.chat-style-segment.action').exists()).toBe(true)
    expect(wrapper.find('.chat-style-segment.bracket-curly').exists()).toBe(true)
    expect(wrapper.find('.chat-style-segment.bracket-square').exists()).toBe(true)
  })

  it('emits tree toolbar semantic actions and keeps unavailable actions disabled', async () => {
    const wrapper = mount(MobileTreeToolbar, {
      props: {
        canUndo: false,
        canRedo: true,
        canToggleAll: true,
        canCreate: true
      }
    })

    expect(wrapper.get('button[aria-label="撤销"]').attributes('disabled')).toBeDefined()

    await wrapper.get('button[aria-label="重做"]').trigger('click')
    await wrapper.get('button[aria-label="全部展开"]').trigger('click')
    await wrapper.get('button[aria-label="新建"]').trigger('click')

    expect(wrapper.emitted('action')).toEqual([['redo'], ['toggle-all'], ['create']])
  })
})
