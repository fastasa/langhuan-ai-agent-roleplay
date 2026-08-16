import { describe, expect, it } from 'vitest'
import {
  buildTraceDayCreatePlan,
  buildTraceMonthCreatePlan,
  buildTraceYearCreatePlan,
  getTraceDaysInMonth,
  getTraceMonthsInYear,
  isTraceDateSelectable,
  isTraceMonthSelectable,
  isTraceYearSelectable,
  normalizeContinuousYears,
  resolveTraceCreateDefaultDateDraft
} from '../../../src/app/trajectoryCreateSelection'

describe('trajectoryCreateSelection', () => {
  const context = {
    birthDate: '2004-05-02',
    calendarConfig: { monthDays: [50, 40, 30, 20, 10, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15] }
  }

  it('normalizes sparse year selection into a continuous range', () => {
    expect(normalizeContinuousYears([2007, 2004, 2006])).toEqual([2004, 2005, 2006, 2007])
  })

  it('splits 2003-2017 into one ten-year branch and five year branches after birth filtering', () => {
    const plan = buildTraceYearCreatePlan([2003, 2017], context)

    expect(plan).toEqual([
      { kind: 'multiYear', year: 2004, spanYears: 10, years: [2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013] },
      { kind: 'year', year: 2014, years: [2014] },
      { kind: 'year', year: 2015, years: [2015] },
      { kind: 'year', year: 2016, years: [2016] },
      { kind: 'year', year: 2017, years: [2017] }
    ])
  })

  it('rejects years before birth year', () => {
    expect(isTraceYearSelectable(2003, context)).toBe(false)
    expect(isTraceYearSelectable(2004, context)).toBe(true)
  })

  it('uses custom calendar month count instead of hard-coded twelve months', () => {
    expect(getTraceMonthsInYear(2004, context)).toBe(15)
    expect(isTraceMonthSelectable(2004, 4, context)).toBe(false)
    expect(isTraceMonthSelectable(2004, 5, context)).toBe(true)
    expect(isTraceMonthSelectable(2004, 15, context)).toBe(true)
    expect(isTraceMonthSelectable(2004, 16, context)).toBe(false)
  })

  it('builds month create plans from selected months without creating ranges', () => {
    expect(buildTraceMonthCreatePlan(2005, [1, 3, 15, 16], context)).toEqual([
      { kind: 'month', year: 2005, month: 1 },
      { kind: 'month', year: 2005, month: 3 },
      { kind: 'month', year: 2005, month: 15 }
    ])
  })

  it('uses custom month days for day bounds and filters existing day leaves', () => {
    expect(getTraceDaysInMonth(2004, 1, context)).toBe(50)
    expect(isTraceDateSelectable('2004-05-01', context)).toBe(false)
    expect(isTraceDateSelectable('2004-05-02', context)).toBe(true)
    expect(isTraceDateSelectable('2005-01-50', context)).toBe(true)
    expect(isTraceDateSelectable('2005-01-51', context)).toBe(false)

    expect(buildTraceDayCreatePlan(['2004-05-02', '2004-05-03', '2005-01-50'], {
      ...context,
      existingDates: ['2004-05-03']
    })).toEqual([
      { kind: 'day', date: '2004-05-02', year: 2004, month: 5, day: 2 },
      { kind: 'day', date: '2005-01-50', year: 2005, month: 1, day: 50 }
    ])
  })

  it('defaults toolbar trace creation from the latest year, month, then day structure', () => {
    const draft = resolveTraceCreateDefaultDateDraft([
      { id: 'year-2004', kind: 'year', granularity: 'year', nodeType: 'range', startDate: '2004-01-01', endDate: '2004-12-12', systemRole: 'yearBranch' },
      { id: 'year-2005', kind: 'year', granularity: 'year', nodeType: 'range', startDate: '2005-01-01', endDate: '2005-12-12', systemRole: 'yearBranch' },
      { id: 'month-2005-03', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-03-01', endDate: '2005-03-30', systemRole: 'monthBranch' },
      { id: 'month-2005-05', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-05-01', endDate: '2005-05-10', systemRole: 'monthBranch' },
      { id: 'day-older', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2004-05-08', systemRole: 'dayLeaf' },
      { id: 'day-in-latest-month', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2005-05-06', systemRole: 'dayLeaf' }
    ], context)

    expect(draft).toEqual({
      year: '2005',
      month: '5',
      date: '2005-05-07'
    })
  })

  it('defaults toolbar trace creation to the first month and day inside the latest year when missing children', () => {
    const draft = resolveTraceCreateDefaultDateDraft([
      { id: 'year-2005', kind: 'year', granularity: 'year', nodeType: 'range', startDate: '2005-01-01', endDate: '2005-12-12', systemRole: 'yearBranch' }
    ], context)

    expect(draft).toEqual({
      year: '2005',
      month: '1',
      date: '2005-01-01'
    })
  })

  it('can default from visible trace unit projection when raw trace nodes are not formal branches', () => {
    const draft = resolveTraceCreateDefaultDateDraft([], context, {
      units: [
        {
          unitId: 'trace:char:group:year_91',
          domain: 'trace',
          unitType: 'traceGroup',
          contentKind: 'group',
          title: '91年',
          sourceId: 'raw-year-91',
          sourcePath: '0091-01-01',
          status: 'normal',
          metadata: {
            startDate: '0091-01-01',
            endDate: '0091-12-31',
            sidebarTitle: '91年'
          }
        }
      ]
    })

    expect(draft).toEqual({
      year: '91',
      month: '1',
      date: '0091-01-01'
    })
  })

  it('can default from visible trace titles when projected dates are missing', () => {
    const draft = resolveTraceCreateDefaultDateDraft([], context, {
      units: [
        {
          unitId: 'trace:char:group:year_88',
          domain: 'trace',
          unitType: 'traceGroup',
          contentKind: 'group',
          title: '88年',
          sourceId: 'raw-year-88',
          status: 'normal',
          metadata: { sidebarTitle: '88年' }
        },
        {
          unitId: 'trace:char:group:month_88_03',
          domain: 'trace',
          unitType: 'traceGroup',
          contentKind: 'group',
          title: '88年3月',
          parentId: 'trace:char:group:year_88',
          sourceId: 'raw-month-88-03',
          status: 'normal',
          metadata: { sidebarTitle: '3月' }
        }
      ]
    })

    expect(draft).toEqual({
      year: '88',
      month: '3',
      date: '0088-03-01'
    })
  })

  it('uses coverage end date as latest trace structure when visible nodes are sparse', () => {
    const draft = resolveTraceCreateDefaultDateDraft([], {
      birthDate: '0067-05-01',
      calendarConfig: {},
      coverageEndDate: '0091-01-01'
    })

    expect(draft).toEqual({
      year: '91',
      month: '1',
      date: '0091-01-01'
    })
  })

  it('defaults context trace creation to the day after the clicked unit', () => {
    const draft = resolveTraceCreateDefaultDateDraft([
      { id: 'day-1', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2004-05-03' },
      { id: 'day-2', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2004-05-08' }
    ], context, {
      afterSourceId: 'day-1'
    })

    expect(draft).toEqual({
      year: '2004',
      month: '5',
      date: '2004-05-04'
    })
  })

  it('uses the latest month and day inside a clicked year when defaulting context trace creation', () => {
    const draft = resolveTraceCreateDefaultDateDraft([
      { id: 'year-2005', kind: 'year', granularity: 'year', nodeType: 'range', startDate: '2005-01-01', endDate: '2005-12-12', systemRole: 'yearBranch' },
      { id: 'month-2005-03', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-03-01', endDate: '2005-03-30', systemRole: 'monthBranch' },
      { id: 'month-2005-05', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-05-01', endDate: '2005-05-10', systemRole: 'monthBranch' },
      { id: 'day-2005-05-04', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2005-05-04', systemRole: 'dayLeaf' },
      { id: 'day-2006-01-01', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2006-01-01', systemRole: 'dayLeaf' }
    ], context, {
      afterSourceId: 'year-2005'
    })

    expect(draft).toEqual({
      year: '2005',
      month: '5',
      date: '2005-05-05'
    })
  })

  it('uses the first month and first day inside a clicked year when no month exists', () => {
    const draft = resolveTraceCreateDefaultDateDraft([
      { id: 'year-2005', kind: 'year', granularity: 'year', nodeType: 'range', startDate: '2005-01-01', endDate: '2005-12-12', systemRole: 'yearBranch' }
    ], context, {
      afterSourceId: 'year-2005'
    })

    expect(draft).toEqual({
      year: '2005',
      month: '1',
      date: '2005-01-01'
    })
  })

  it('uses the latest day inside a clicked month or its first day when no day exists', () => {
    const withDay = resolveTraceCreateDefaultDateDraft([
      { id: 'month-1', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-05-01', endDate: '2005-05-10', systemRole: 'monthBranch' },
      { id: 'day-1', kind: 'day', granularity: 'day', nodeType: 'single', pointDate: '2005-05-04', systemRole: 'dayLeaf' }
    ], context, {
      afterSourceId: 'month-1'
    })
    const withoutDay = resolveTraceCreateDefaultDateDraft([
      { id: 'month-1', kind: 'month', granularity: 'month', nodeType: 'range', startDate: '2005-05-01', endDate: '2005-05-10', systemRole: 'monthBranch' }
    ], context, {
      afterSourceId: 'month-1'
    })

    expect(withDay).toEqual({
      year: '2005',
      month: '5',
      date: '2005-05-05'
    })
    expect(withoutDay).toEqual({
      year: '2005',
      month: '5',
      date: '2005-05-01'
    })
  })
})
