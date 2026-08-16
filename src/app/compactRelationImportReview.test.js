import { describe, expect, it } from 'vitest'
import {
  applyCompactRelationImportDecisions,
  countCompactRelationImportPlan,
  createCompactRelationImportPlan,
  createDefaultCompactRelationImportDecisions
} from './compactRelationImportReview.ts'

describe('compactRelationImportReview', () => {
  it('defaults to adding new relations and skipping exact repeats', () => {
    const plan = createCompactRelationImportPlan({
      units: [{
        unitId: 'u1',
        title: '北境军团',
        currentRelationHints: ['[[北境军团@doc:army]]_控制_[[长白山@doc:mountain]]'],
        incomingRelationHints: [
          '[[北境军团@doc:army]]_控制_[[长白山@doc:mountain]]',
          '[[北境军团@doc:army]]_活动于_[[赫兹塔尔@doc:baisin]]'
        ]
      }]
    })

    const stats = countCompactRelationImportPlan(plan)

    expect(plan.items.map((item) => item.status)).toEqual(['same', 'new'])
    expect(stats).toMatchObject({ add: 1, skip: 1, same: 1, conflict: 0 })
  })

  it('can replace existing relations for the same endpoint pair', () => {
    const current = ['[[北境军团@doc:army]]_相关_[[长白山@doc:mountain]]']
    const plan = createCompactRelationImportPlan({
      units: [{
        unitId: 'u1',
        title: '北境军团',
        currentRelationHints: current,
        incomingRelationHints: ['[[北境军团@doc:army]]_控制_[[长白山@doc:mountain]]']
      }]
    })
    const decisions = createDefaultCompactRelationImportDecisions(plan)
    decisions[plan.items[0].id] = 'replace'

    expect(plan.items[0].status).toBe('conflict')
    expect(applyCompactRelationImportDecisions(current, plan.items, decisions)).toEqual([
      '[[北境军团@doc:army]]_控制_[[长白山@doc:mountain]]'
    ])
  })
})
