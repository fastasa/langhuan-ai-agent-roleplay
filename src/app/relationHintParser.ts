import type { PredicateFamily, RelationViewDirection } from '../types/unitView'
import {
  findPredicateDictionaryMatch,
  normalizePredicateTerm
} from './relationPredicateDictionary'
import { parseRelationHintReference } from './relationHintReference'

export type RelationHintWarningCode =
  | 'relation_hint_invalid_predicate'
  | 'relation_hint_invalid_format'

export interface RelationAssertion {
  sourceTitle: string
  sourceRefId?: string
  rawPredicate: string
  surfacePredicate: string
  targetTitle: string
  targetRefId?: string
  canonicalPredicateId: string
  normalizedSourceTitle: string
  normalizedSourceRefId?: string
  normalizedTargetTitle: string
  normalizedTargetRefId?: string
  family: PredicateFamily
  direction: RelationViewDirection
  status: 'declared'
  line: string
  lineIndex: number
}

export interface LegacyRelationHint {
  targetTitle: string
  targetRefId?: string
  line: string
  lineIndex: number
}

export interface RelationHintWarning {
  code: RelationHintWarningCode
  message: string
  line: string
  lineIndex: number
  rawPredicate?: string
}

export interface RelationHintParseResult {
  assertions: RelationAssertion[]
  legacyHints: LegacyRelationHint[]
  warnings: RelationHintWarning[]
}

const STRONG_RELATION_PATTERN = /^\s*\[\[([^\]]+)\]\]\s*_\s*([^_]+?)\s*_\s*\[\[([^\]]+)\]\]\s*$/u
const TITLE_PATTERN = /\[\[([^\]]+)\]\]/gu

export function parseRelationHintLine(line: string, lineIndex = 0): RelationHintParseResult {
  const rawLine = String(line || '')
  const trimmed = rawLine.trim()
  const result: RelationHintParseResult = {
    assertions: [],
    legacyHints: [],
    warnings: []
  }
  if (!trimmed) return result

  const strongMatch = STRONG_RELATION_PATTERN.exec(trimmed)
  if (strongMatch) {
    const sourceRef = parseRelationHintReference(strongMatch[1])
    const targetRef = parseRelationHintReference(strongMatch[3])
    const sourceTitle = normalizeTitle(sourceRef.title)
    const rawPredicate = normalizePredicateTerm(strongMatch[2])
    const targetTitle = normalizeTitle(targetRef.title)
    const predicateMatch = findPredicateDictionaryMatch(rawPredicate)
    if (!predicateMatch) {
      result.warnings.push({
        code: 'relation_hint_invalid_predicate',
        message: `关系提示使用了未登记谓词：${rawPredicate}`,
        line: rawLine,
        lineIndex,
        rawPredicate
      })
      return result
    }

    const isReverse = predicateMatch.direction === 'reverse'
    result.assertions.push({
      sourceTitle,
      sourceRefId: sourceRef.refId,
      rawPredicate,
      surfacePredicate: predicateMatch.surfacePredicate,
      targetTitle,
      targetRefId: targetRef.refId,
      canonicalPredicateId: predicateMatch.entry.canonicalPredicateId,
      normalizedSourceTitle: isReverse ? targetTitle : sourceTitle,
      normalizedSourceRefId: isReverse ? targetRef.refId : sourceRef.refId,
      normalizedTargetTitle: isReverse ? sourceTitle : targetTitle,
      normalizedTargetRefId: isReverse ? sourceRef.refId : targetRef.refId,
      family: predicateMatch.entry.family,
      direction: predicateMatch.entry.direction,
      status: 'declared',
      line: rawLine,
      lineIndex
    })
    return result
  }

  const titles = parseTitles(trimmed)
  const outsideReferences = trimmed.replace(TITLE_PATTERN, '').trim()
  if (titles.length === 1 && !outsideReferences.includes('_')) {
    result.legacyHints.push({
      targetTitle: titles[0].title,
      targetRefId: titles[0].refId,
      line: rawLine,
      lineIndex
    })
    return result
  }

  if (titles.length >= 2 || outsideReferences.includes('_')) {
    result.warnings.push({
      code: 'relation_hint_invalid_format',
      message: '关系提示格式不符合 [[源单位]]_关系词_[[目标单位]]，未进入强关系解析。',
      line: rawLine,
      lineIndex
    })
  }
  return result
}

export function parseRelationHints(lines: string[] | string): RelationHintParseResult {
  const sourceLines = Array.isArray(lines)
    ? lines
    : String(lines || '').split(/\r?\n/u)
  return sourceLines.reduce<RelationHintParseResult>((acc, line, lineIndex) => {
    const parsed = parseRelationHintLine(line, lineIndex)
    acc.assertions.push(...parsed.assertions)
    acc.legacyHints.push(...parsed.legacyHints)
    acc.warnings.push(...parsed.warnings)
    return acc
  }, {
    assertions: [],
    legacyHints: [],
    warnings: []
  })
}

function parseTitles(input: string) {
  const titles: Array<{ title: string; refId?: string }> = []
  let match = TITLE_PATTERN.exec(input)
  while (match) {
    const reference = parseRelationHintReference(match[1])
    const title = normalizeTitle(reference.title)
    if (title) titles.push({ title, refId: reference.refId })
    match = TITLE_PATTERN.exec(input)
  }
  return titles
}

function normalizeTitle(input: string) {
  return String(input || '').trim()
}
