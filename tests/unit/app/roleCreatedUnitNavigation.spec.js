import { describe, expect, it } from 'vitest'
import { resolveCreatedRoleUnitId } from '../../../src/app/roleCreatedUnitNavigation'

describe('roleCreatedUnitNavigation', () => {
  it('resolves newly created trace units as role editor targets', () => {
    expect(resolveCreatedRoleUnitId([
      {
        unitId: 'trace:char_1:day:2004-05-03',
        domain: 'trace',
        unitType: 'traceDay',
        contentKind: 'markdown',
        title: '2004年5月3日',
        sourceId: 'brain:trajectory:node:day_2004_05_03',
        orderIndex: 0
      }
    ], 'brain:trajectory:node:day_2004_05_03')).toBe('trace:char_1:day:2004-05-03')
  })

  it('resolves newly created trace branch units from batch creation', () => {
    expect(resolveCreatedRoleUnitId([
      {
        unitId: 'trace:char_1:group:year_2005',
        domain: 'characterBrain',
        unitType: 'traceGroup',
        contentKind: 'group',
        title: '2005年',
        sourceId: 'brain:trajectory:node:year_2005',
        orderIndex: 0
      }
    ], 'brain:trajectory:node:year_2005')).toBe('trace:char_1:group:year_2005')
  })
})
