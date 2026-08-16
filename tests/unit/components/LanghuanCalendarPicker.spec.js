import { mount } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import LanghuanCalendarPicker from '../../../src/components/common/LanghuanCalendarPicker.vue'

describe('LanghuanCalendarPicker', () => {
  beforeAll(() => {
    window.matchMedia = window.matchMedia || vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })

  it('mounts the local date panel and destroys cleanly', () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2026-05-04',
        minDate: '2026-01-01',
        maxDate: '2026-12-31',
        enableDates: ['2026-05-04', '2026-05-05']
      }
    })

    expect(wrapper.find('.langhuan-calendar-picker').exists()).toBe(true)
    expect(wrapper.find('.langhuan-calendar-picker__panel').exists()).toBe(true)
    expect(wrapper.find('.vc-dates__row').exists()).toBe(true)
    expect(wrapper.find('.vc-date__btn').classes()).toContain('vc-date__btn')

    wrapper.unmount()
    expect(wrapper.exists()).toBe(false)
  })

  it('accepts adapter state and marks existing dates without exposing vendor internals', () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2026-05-04',
        calendarState: {
          selectedDate: '2026-05-04',
          minDate: '2026-05-01',
          maxDate: '2026-05-05',
          enableDates: ['2026-05-04', '2026-05-05'],
          disableDates: ['2026-05-02'],
          dateStates: [
            {
              date: '2026-05-02',
              day: 2,
              status: 'existing',
              selectable: false,
              existing: true,
              reason: 'already-exists'
            },
            {
              date: '2026-05-04',
              day: 4,
              status: 'available',
              selectable: true,
              existing: false
            }
          ]
        }
      }
    })

    const existing = wrapper.find('[data-vc-date="2026-05-02"]')
    const available = wrapper.find('[data-vc-date="2026-05-04"]')

    expect(existing.attributes('data-langhuan-calendar-date-state')).toBe('existing')
    expect(existing.attributes('data-langhuan-calendar-date-existing')).toBe('')
    expect(existing.attributes('data-langhuan-calendar-date-blocked')).toBe('')
    expect(available.attributes('data-langhuan-calendar-date-state')).toBe('available')
  })

  it('shows granularity tabs and renders local month/year panels', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'month',
        availableModes: ['month', 'year'],
        showGranularityTabs: true,
        minDate: '1990-01-01',
        maxDate: '2020-12-31'
      }
    })

    expect(wrapper.find('.langhuan-calendar-picker__tabs').exists()).toBe(true)
    expect(wrapper.find('[data-vc="months"]').exists()).toBe(true)
    expect(wrapper.find('.langhuan-calendar-picker__panel').attributes('data-vc-type')).toBe('month')

    await wrapper.setProps({ viewMode: 'year' })

    expect(wrapper.find('[data-vc="years"]').exists()).toBe(true)
    expect(wrapper.find('.langhuan-calendar-picker__panel').attributes('data-vc-type')).toBe('year')
    expect(wrapper.find('button[aria-label="下一页年份"]').exists()).toBe(true)
  })

  it('emits month and year selections without collapsing to the day panel', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'month',
        availableModes: ['month', 'year'],
        minDate: '1990-01-01',
        maxDate: '2020-12-31'
      }
    })

    await wrapper.find('[data-vc-months-month="6"]').trigger('click')

    expect(wrapper.emitted('select').at(-1)?.[0]).toMatchObject({
      date: '2004-07-01',
      mode: 'month',
      year: 2004,
      month: 7
    })
    expect(wrapper.find('.langhuan-calendar-picker__panel').attributes('data-vc-type')).toBe('month')

    await wrapper.setProps({ viewMode: 'year' })
    await wrapper.find('[data-vc-years-year="2005"]').trigger('click')

    expect(wrapper.emitted('select').at(-1)?.[0]).toMatchObject({
      date: '2005-01-01',
      mode: 'year',
      year: 2005
    })
    expect(wrapper.find('.langhuan-calendar-picker__panel').attributes('data-vc-type')).toBe('year')
  })

  it('uses a local year panel that can select years, page, and jump without vendor navigation', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'year',
        availableModes: ['year'],
        minDate: '1995-01-01',
        maxDate: '2050-12-31',
        lockViewMode: true,
        hideNavigationArrows: true
      }
    })

    expect(wrapper.find('.langhuan-calendar-picker__panel').exists()).toBe(true)
    expect(wrapper.find('.vc').exists()).toBe(false)

    await wrapper.find('[data-vc-years-year="2010"]').trigger('click')

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2010-01-01')
    expect(wrapper.emitted('select').at(-1)?.[0]).toMatchObject({
      date: '2010-01-01',
      mode: 'year',
      year: 2010
    })

    await wrapper.setProps({
      modelValue: '2010-01-01',
      selectedValues: ['2010']
    })

    expect(wrapper.find('[data-vc-years-year="2010"]').attributes('data-langhuan-calendar-selected')).toBe('')

    const pageTitleBefore = wrapper.find('.langhuan-calendar-picker__header strong').text()
    await wrapper.get('button[aria-label="下一页年份"]').trigger('click')
    expect(wrapper.find('.langhuan-calendar-picker__header strong').text()).not.toBe(pageTitleBefore)

    await wrapper.get('.langhuan-calendar-picker__jump input').setValue('2018')
    await wrapper.get('.langhuan-calendar-picker__jump button').trigger('click')

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2018-01-01')
    expect(wrapper.emitted('select').at(-1)?.[0]).toMatchObject({
      date: '2018-01-01',
      mode: 'year',
      year: 2018
    })
  })

  it('switches local panels through granularity tabs', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'date',
        availableModes: ['date', 'year'],
        showGranularityTabs: true,
        minDate: '1995-01-01',
        maxDate: '2005-12-31'
      }
    })

    expect(wrapper.find('.langhuan-calendar-picker__panel').attributes('data-vc-type')).toBe('date')

    await wrapper.findAll('.langhuan-calendar-picker__tabs button')[1].trigger('click')

    expect(wrapper.emitted('update:viewMode').at(-1)?.[0]).toBe('year')
  })

  it('supports ctrl and shift multi-select in the year panel with continuous year fill', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'year',
        availableModes: ['year'],
        minDate: '1995-01-01',
        maxDate: '2020-12-31',
        multiSelect: true,
        continuousYearSelection: true,
        selectedValues: ['2004']
      }
    })

    await wrapper.find('[data-vc-years-year="2006"]').trigger('click', { ctrlKey: true })

    expect(wrapper.emitted('update:selectedValues').at(-1)?.[0]).toEqual(['2004', '2005', '2006'])

    await wrapper.setProps({ selectedValues: ['2004', '2005', '2006'] })
    await wrapper.find('[data-vc-years-year="2008"]').trigger('click', { shiftKey: true })

    expect(wrapper.emitted('update:selectedValues').at(-1)?.[0]).toEqual(['2004', '2005', '2006', '2007', '2008'])
  })

  it('replaces the selected collection on a plain click without extending multi-select', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'year',
        availableModes: ['year'],
        minDate: '1995-01-01',
        maxDate: '2020-12-31',
        multiSelect: true,
        continuousYearSelection: true,
        selectedValues: ['2004']
      }
    })

    await wrapper.find('[data-vc-years-year="2010"]').trigger('click')

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2010-01-01')
    expect(wrapper.emitted('update:selectedValues').at(-1)?.[0]).toEqual(['2010'])
  })

  it('emits the clicked year target instead of the previous calendar context year', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-01-01',
        viewMode: 'year',
        availableModes: ['year'],
        minDate: '1995-01-01',
        maxDate: '2020-12-31'
      }
    })

    await wrapper.find('[data-vc-years-year="2010"]').trigger('click')

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2010-01-01')
    expect(wrapper.emitted('select').at(-1)?.[0]).toMatchObject({
      date: '2010-01-01',
      mode: 'year',
      year: 2010
    })
  })

  it('marks selected month values, replacing on plain click and toggling with ctrl', async () => {
    const wrapper = mount(LanghuanCalendarPicker, {
      props: {
        modelValue: '2004-05-02',
        viewMode: 'month',
        availableModes: ['month'],
        minDate: '1995-01-01',
        maxDate: '2020-12-31',
        multiSelect: true,
        selectedValues: ['2004-07']
      }
    })

    const selectedMonth = wrapper.find('[data-vc-months-month="6"]')
    expect(selectedMonth.attributes('data-langhuan-calendar-selected')).toBe('')

    await selectedMonth.trigger('click')

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2004-07-01')
    expect(wrapper.emitted('update:selectedValues').at(-1)?.[0]).toEqual(['2004-07'])

    await selectedMonth.trigger('click', { ctrlKey: true })

    expect(wrapper.emitted('update:modelValue').at(-1)?.[0]).toBe('2004-07-01')
    expect(wrapper.emitted('update:selectedValues').at(-1)?.[0]).toEqual([])
  })
})
