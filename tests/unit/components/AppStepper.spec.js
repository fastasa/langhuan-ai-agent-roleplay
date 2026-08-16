import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppStepper from '../../../src/components/common/AppStepper.vue'

describe('AppStepper', () => {
  const steps = [
    { key: 'granularity', label: '粒度' },
    { key: 'calendar', label: '日历' },
    { key: 'subtitle', label: '副标题' }
  ]

  it('renders active step content and moves forward and backward', async () => {
    const wrapper = mount(AppStepper, {
      props: { steps },
      slots: {
        granularity: '<div data-test="granularity">选择粒度</div>',
        calendar: '<div data-test="calendar">选择日期</div>',
        subtitle: '<div data-test="subtitle">填写副标题</div>'
      }
    })

    expect(wrapper.find('[data-test="granularity"]').exists()).toBe(true)

    await wrapper.find('.app-stepper__button--primary').trigger('click')
    expect(wrapper.find('[data-test="calendar"]').exists()).toBe(true)
    expect(wrapper.emitted('stepChange').at(-1)?.[0]).toBe(2)

    await wrapper.find('.app-stepper__button--ghost').trigger('click')
    expect(wrapper.find('[data-test="granularity"]').exists()).toBe(true)
    expect(wrapper.emitted('stepChange').at(-1)?.[0]).toBe(1)
  })

  it('emits complete on the final step without advancing past the step count', async () => {
    const wrapper = mount(AppStepper, {
      props: { steps, initialStep: 3 },
      slots: {
        subtitle: '<div>完成</div>'
      }
    })

    await wrapper.find('.app-stepper__button--primary').trigger('click')

    expect(wrapper.emitted('complete')).toHaveLength(1)
    expect(wrapper.findAll('.app-stepper__indicator').at(2)?.classes()).toContain('active')
  })

  it('can hide its footer when the host dialog owns navigation actions', () => {
    const wrapper = mount(AppStepper, {
      props: { steps, hideFooter: true },
      slots: {
        granularity: '<div>选择粒度</div>'
      }
    })

    expect(wrapper.find('.app-stepper__footer').exists()).toBe(false)
    expect(wrapper.find('.app-stepper__steps').exists()).toBe(true)
  })
})
