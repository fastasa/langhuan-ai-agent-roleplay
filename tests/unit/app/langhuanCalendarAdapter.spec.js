import { describe, expect, it } from 'vitest'
import {
  buildGregorianCalendarMonthState,
  buildLanghuanCalendarMonthState,
  buildTrajectoryCalendarMonthState,
  buildTrajectoryTraceDayPickerState
} from '../../../src/app/langhuanCalendarAdapter'

describe('langhuanCalendarAdapter', () => {
  it('builds gregorian month picker state with available dates', () => {
    const state = buildGregorianCalendarMonthState({
      year: 2026,
      month: 5,
      selectedDate: '2026-05-04'
    })

    expect(state.monthDays).toBe(31)
    expect(state.pickerState.minDate).toBe('2026-05-01')
    expect(state.pickerState.maxDate).toBe('2026-05-31')
    expect(state.pickerState.selectedDate).toBe('2026-05-04')
    expect(state.availableDates).toContain('2026-05-04')
    expect(state.pickerState.disableDates).toEqual([])
  })

  it('uses trajectory custom month days instead of hard-coded gregorian month length', () => {
    const state = buildTrajectoryCalendarMonthState({
      year: 2004,
      month: 2,
      calendarConfig: { monthDays: [3, 5] }
    })

    expect(state.calendarId).toBe('trajectory')
    expect(state.monthDays).toBe(5)
    expect(state.dates.map((date) => date.date)).toEqual([
      '2004-02-01',
      '2004-02-02',
      '2004-02-03',
      '2004-02-04',
      '2004-02-05'
    ])
    expect(state.pickerState.maxDate).toBe('2004-02-05')
  })

  it('marks existing dates as non-selectable by default and preserves explicit selectable dates', () => {
    const state = buildLanghuanCalendarMonthState({
      year: 2004,
      month: 5,
      existingDates: ['2004-05-02'],
      selectableDates: ['2004-05-02', '2004-05-03', '2004-05-04'],
      disabledDates: ['2004-05-04']
    })

    expect(state.existingDates).toEqual(['2004-05-02'])
    expect(state.availableDates).toEqual(['2004-05-03'])
    expect(state.pickerState.enableDates).toEqual(['2004-05-03'])
    expect(state.pickerState.disableDates).toEqual(expect.arrayContaining([
      '2004-05-01',
      '2004-05-02',
      '2004-05-04'
    ]))
    expect(state.dates.find((date) => date.date === '2004-05-02')).toMatchObject({
      status: 'existing',
      selectable: false,
      reason: 'already-exists'
    })
    expect(state.dates.find((date) => date.date === '2004-05-04')).toMatchObject({
      status: 'disabled',
      selectable: false,
      reason: 'disabled'
    })
  })

  it('builds trace-day picker state from birth date and existing day leaves', () => {
    const state = buildTrajectoryTraceDayPickerState({
      birthDate: '2004-05-02',
      existingDates: ['2004-05-02', '2004-05-04'],
      horizonDays: 30
    })

    expect(state.selectedDate).toBe('2004-05-05')
    expect(state.minDate).toBe('2004-05-02')
    expect(state.enableDates).toContain('2004-05-03')
    expect(state.enableDates).toContain('2004-05-05')
    expect(state.disableDates).toEqual(expect.arrayContaining(['2004-05-02', '2004-05-04']))
    expect(state.dateStates.find((date) => date.date === '2004-05-02')).toMatchObject({
      status: 'existing',
      selectable: false
    })
  })
})
