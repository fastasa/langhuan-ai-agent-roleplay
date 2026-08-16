import { describe, expect, it } from 'vitest'
import { resolveCreatedRoleUnitId } from './roleCreatedUnitNavigation.ts'

describe('roleCreatedUnitNavigation', () => {
  it('resolves the created role unit by source id instead of title', () => {
    const units = [
      {
        unitId: 'brain:char_1:node_old',
        domain: 'characterBrain',
        unitType: 'soulNode',
        contentKind: 'markdown',
        title: '新桠',
        sourceId: 'node_old',
        status: 'normal'
      },
      {
        unitId: 'brain:char_1:node_new',
        domain: 'characterBrain',
        unitType: 'soulNode',
        contentKind: 'markdown',
        title: '新桠',
        sourceId: 'node_new',
        status: 'normal'
      }
    ]

    expect(resolveCreatedRoleUnitId(units, 'node_new')).toBe('brain:char_1:node_new')
  })

  it('ignores non role-brain units and blank source ids', () => {
    const units = [{
      unitId: 'doc:node_new',
      domain: 'docLibrary',
      unitType: 'leaf',
      contentKind: 'markdown',
      title: '新桠',
      sourceId: 'node_new',
      status: 'normal'
    }]

    expect(resolveCreatedRoleUnitId(units, 'node_new')).toBe('')
    expect(resolveCreatedRoleUnitId(units, '   ')).toBe('')
  })
})
