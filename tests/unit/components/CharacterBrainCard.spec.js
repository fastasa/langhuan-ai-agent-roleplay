import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CharacterBrainCard from '../../../src/components/brain/CharacterBrainCard.vue'

describe('CharacterBrainCard', () => {
  it('uses calendar entry point for inner trajectory cards', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(CharacterBrainCard, {
      props: {
        title: '2001年',
        content: '',
        cardType: 'form',
        editable: true,
        formFields: [
          { key: 'trace.pointDate', label: '时间点', value: '2001-01-01', type: 'text', columnSpan: 1 },
          { key: 'trace.offsetDays', label: '出生后第几日', value: '366', type: 'text', readonly: true, columnSpan: 1 }
        ],
        innerEntries: [
          {
            id: 'inner-day',
            nodeType: 'single',
            granularity: 'day',
            startDate: '2001-03-01',
            displayTitle: '春季小记',
            note: '测试',
            content: '内容',
            linkIds: [],
            sourceNodeIds: []
          }
        ]
      },
      global: {
        plugins: [pinia]
      }
    })

    expect(wrapper.find('.brain-card__inner-nav').exists()).toBe(false)
    expect(wrapper.find('.brain-card__calendar-toggle').exists()).toBe(true)

    await wrapper.find('.brain-card__calendar-toggle').trigger('click')
    expect(wrapper.find('.brain-card__calendar').exists()).toBe(true)

    const activeDays = wrapper.findAll('.brain-card__calendar-day--active')
    expect(activeDays.length).toBeGreaterThan(0)
    await activeDays[0].trigger('click')

    expect(wrapper.emitted('open-inner-entry')?.[0]).toEqual(['inner-day'])
  })
})
