import { describe, expect, it } from 'vitest'
import {
  findPredicateDictionaryMatch,
  PREDICATE_DICTIONARY_PREDICATES
} from '../../../src/app/relationPredicateDictionary'
import {
  parseRelationHintLine,
  parseRelationHints
} from '../../../src/app/relationHintParser'

describe('relationHintParser', () => {
  it('parses direct strong relation hints with controlled predicates', () => {
    const result = parseRelationHintLine('[[长白山山脉]]_位于_[[尤拉西亚洲东北部]]')

    expect(result.warnings).toEqual([])
    expect(result.legacyHints).toEqual([])
    expect(result.assertions).toEqual([
      expect.objectContaining({
        sourceTitle: '长白山山脉',
        rawPredicate: '位于',
        surfacePredicate: '位于',
        targetTitle: '尤拉西亚洲东北部',
        canonicalPredicateId: 'predicate:spatial_location:located_in',
        normalizedSourceTitle: '长白山山脉',
        normalizedTargetTitle: '尤拉西亚洲东北部',
        family: 'spatial_location',
        direction: 'directed',
        status: 'declared'
      })
    ])
  })

  it('allows spaces around separators and normalizes reverse predicates', () => {
    const result = parseRelationHintLine('[[长白山山脉]] _ 属于 _ [[尤拉西亚洲]]')

    expect(result.warnings).toEqual([])
    expect(result.assertions).toEqual([
      expect.objectContaining({
        sourceTitle: '长白山山脉',
        targetTitle: '尤拉西亚洲',
        canonicalPredicateId: 'predicate:structure:contains',
        normalizedSourceTitle: '尤拉西亚洲',
        normalizedTargetTitle: '长白山山脉',
        family: 'structure'
      })
    ])
  })

  it('keeps old single-title hints as weak legacy hints', () => {
    const result = parseRelationHintLine('[[尤拉西亚洲]]')

    expect(result.assertions).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.legacyHints).toEqual([
      {
        targetTitle: '尤拉西亚洲',
        line: '[[尤拉西亚洲]]',
        lineIndex: 0
      }
    ])
  })

  it('parses exact reference ids without treating them as part of the title', () => {
    const result = parseRelationHintLine('[[河流水系@doc-river]]_位于_[[长白山山脉@doc-mountain]]')

    expect(result.warnings).toEqual([])
    expect(result.assertions).toEqual([
      expect.objectContaining({
        sourceTitle: '河流水系',
        sourceRefId: 'doc-river',
        targetTitle: '长白山山脉',
        targetRefId: 'doc-mountain',
        normalizedSourceTitle: '河流水系',
        normalizedSourceRefId: 'doc-river',
        normalizedTargetTitle: '长白山山脉',
        normalizedTargetRefId: 'doc-mountain'
      })
    ])
  })

  it('rejects illegal predicates instead of downgrading them to related_to', () => {
    const result = parseRelationHintLine('[[长白山山脉]]_用户临时造的关系词_[[尤拉西亚洲]]')

    expect(result.assertions).toEqual([])
    expect(result.legacyHints).toEqual([])
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'relation_hint_invalid_predicate',
        rawPredicate: '用户临时造的关系词'
      })
    ])
  })

  it('parses mixed relation hint blocks without letting strong lines become weak hints', () => {
    const result = parseRelationHints([
      '[[长白山山脉]]_包含_[[格劳克朗峰]]',
      '[[北境传说]]',
      '[[长白山山脉]]_乱写_[[尤拉西亚洲]]'
    ])

    expect(result.assertions).toHaveLength(1)
    expect(result.assertions[0]).toEqual(expect.objectContaining({
      canonicalPredicateId: 'predicate:structure:contains',
      normalizedSourceTitle: '长白山山脉',
      normalizedTargetTitle: '格劳克朗峰'
    }))
    expect(result.legacyHints).toEqual([
      expect.objectContaining({ targetTitle: '北境传说' })
    ])
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'relation_hint_invalid_predicate' })
    ])
  })

  it('exposes the first-version predicate dictionary as confirmed predicate views', () => {
    expect(PREDICATE_DICTIONARY_PREDICATES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        predicateId: 'predicate:structure:contains',
        family: 'structure',
        key: 'contains',
        label: '包含',
        status: 'confirmed'
      }),
      expect.objectContaining({
        predicateId: 'predicate:power:controls',
        family: 'power',
        key: 'controls',
        label: '控制',
        status: 'confirmed'
      })
    ]))
    expect(findPredicateDictionaryMatch('属于')).toEqual(expect.objectContaining({
      direction: 'reverse'
    }))
  })
})
