import { describe, expect, it } from 'vitest'
import {
  applyCompilePageImportDecisions,
  countCompilePageImportPlan,
  createCompilePageImportUnitPlan,
  createDefaultCompilePageImportDecisions,
  hasCompilePageImportConflicts
} from './compilePageImportConflict.ts'

describe('compilePageImportConflict', () => {
  it('defaults to filling empty fields and skipping existing conflicts', () => {
    const unit = createCompilePageImportUnitPlan({
      unitId: 'u1',
      title: '七大洲',
      current: {
        summary: '旧摘要',
        tags: [],
        semanticType: 'world',
        relationHints: ['[[旧]]_相关_[[A]]']
      },
      incoming: {
        summary: '新摘要',
        tags: ['地理'],
        semanticType: 'region',
        relationHints: ['[[新]]_相关_[[B]]']
      }
    })
    const plan = { units: [unit] }
    const decisions = createDefaultCompilePageImportDecisions(plan)

    expect(hasCompilePageImportConflicts(plan)).toBe(true)
    expect(decisions.u1.summary).toBe('skip')
    expect(decisions.u1.tags).toBe('overwrite')
    expect(countCompilePageImportPlan(plan, decisions)).toEqual({
      overwrite: 1,
      skipped: 3,
      conflict: 3,
      same: 0,
      units: 1
    })
  })

  it('applies per-field decisions without touching skipped values', () => {
    const result = applyCompilePageImportDecisions(
      {
        summary: '旧摘要',
        tags: ['旧标签'],
        semanticType: 'world',
        relationHints: ['旧关系']
      },
      {
        summary: '新摘要',
        tags: ['新标签'],
        semanticType: 'region',
        relationHints: ['新关系']
      },
      {
        summary: 'skip',
        tags: 'overwrite',
        semanticType: 'skip',
        relationHints: 'overwrite'
      }
    )

    expect(result).toEqual({
      summary: '旧摘要',
      tags: ['新标签'],
      semanticType: 'world',
      relationHints: ['新关系']
    })
  })
})
