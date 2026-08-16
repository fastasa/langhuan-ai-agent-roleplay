import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNIT_SEMANTIC_TYPE,
  UNIT_SEMANTIC_TYPE_OPTIONS,
  UNIT_SEMANTIC_TYPES,
  getUnitSemanticTypeLabel,
  normalizeUnitSemanticType
} from '../../../src/app/unitSemanticTypes.ts'

describe('unitSemanticTypes', () => {
  it('normalizes unknown values to the default semantic type', () => {
    expect(normalizeUnitSemanticType('character')).toBe('character')
    expect(normalizeUnitSemanticType('missing_type')).toBe(DEFAULT_UNIT_SEMANTIC_TYPE)
    expect(normalizeUnitSemanticType(null)).toBe(DEFAULT_UNIT_SEMANTIC_TYPE)
  })

  it('keeps option values aligned with the semantic type list', () => {
    expect(UNIT_SEMANTIC_TYPE_OPTIONS.map((option) => option.value)).toEqual(UNIT_SEMANTIC_TYPES)
    expect(getUnitSemanticTypeLabel('organization')).toBe('组织')
    expect(getUnitSemanticTypeLabel('missing_type')).toBe('其他')
  })
})
