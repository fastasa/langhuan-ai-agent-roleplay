import type { UnitView, UnitViewAdapterResult, UnitViewAdapterWarning, UnitViewAdapterWarningCode } from '../types/unitView'

export type UnitCompilePageIndicator = {
  missing: boolean
  error: boolean
  title: string
}

export type CompilePageStatusSource = {
  summary?: string
  tags?: string[]
  relationHints?: string[]
} | null | undefined

const COMPILE_PAGE_MISSING_CODES = new Set<UnitViewAdapterWarningCode>([
  'doc_missing_compile_page',
  'compile_page_incomplete'
])

const COMPILE_PAGE_ERROR_CODES = new Set<UnitViewAdapterWarningCode>([
  'relation_hint_target_missing',
  'relation_hint_invalid_predicate',
  'relation_hint_invalid_format',
  'relation_hint_title_ambiguous',
  'relation_hint_duplicate_relation'
])

/** 黄红灯分类单点（missing=黄·编译页字段缺失类，error=红·关系提示报错类）：
 *  树灯与星依编译页体检（xingyiCompilePageDiagnostics）共用，防两处枚举漂移。 */
export function classifyCompilePageWarningCode(code: UnitViewAdapterWarningCode): 'missing' | 'error' | null {
  if (COMPILE_PAGE_MISSING_CODES.has(code)) return 'missing'
  if (COMPILE_PAGE_ERROR_CODES.has(code)) return 'error'
  return null
}

export function buildUnitCompilePageIndicatorMap(result: UnitViewAdapterResult) {
  const indicators = new Map<string, UnitCompilePageIndicator>()
  const unitIdsBySourceId = buildUnitIdsBySourceId(result.units)
  const parentIdByUnitId = buildParentIdByUnitId(result.units)

  result.units.forEach((unit) => {
    if (hasMissingCompilePageFields(unit)) {
      mergeCompilePageIndicator(indicators, unit.unitId, { missing: true, error: false })
    }
  })

  result.warnings.forEach((warning) => {
    const next = warningToCompilePageIndicator(warning)
    if (!next) return
    resolveWarningUnitIds(warning, unitIdsBySourceId).forEach((unitId) => {
      mergeCompilePageIndicator(indicators, unitId, next)
    })
  })

  propagateCompilePageIndicatorsToAncestors(indicators, parentIdByUnitId)

  indicators.forEach((indicator) => {
    indicator.title = formatCompilePageIndicatorTitle(indicator)
  })

  return indicators
}

export function buildUnitCompilePageIndicatorLookup(result: UnitViewAdapterResult) {
  const indicatorsByUnitId = buildUnitCompilePageIndicatorMap(result)
  const lookup = new Map<string, UnitCompilePageIndicator>()
  result.units.forEach((unit) => {
    const indicator = indicatorsByUnitId.get(unit.unitId)
    if (!indicator) return
    collectCompilePageIndicatorKeys(unit).forEach((key) => {
      lookup.set(key, indicator)
    })
  })
  return lookup
}

export function formatCompilePageEntryStatus(
  page: CompilePageStatusSource,
  errorCount = 0
) {
  if (errorCount > 0) return '错误'
  if (getCompilePageMissingFields(page).length > 0) return '未填写'
  return '正常'
}

export function isCompilePageEntryStatusWarning(status: string) {
  return status !== '正常'
}

export function getCompilePageMissingFields(page: CompilePageStatusSource) {
  if (!page) return ['summary', 'tags', 'relationHints'] as const
  const missingFields: Array<'summary' | 'tags' | 'relationHints'> = []
  if (!String(page.summary || '').trim()) missingFields.push('summary')
  if (!Array.isArray(page.tags) || page.tags.length === 0) missingFields.push('tags')
  if (!Array.isArray(page.relationHints) || page.relationHints.length === 0) {
    missingFields.push('relationHints')
  }
  return missingFields
}

function hasMissingCompilePageFields(unit: UnitView) {
  if (!unit.compilePage) return false
  return getCompilePageMissingFields(unit.compilePage).length > 0
}

function warningToCompilePageIndicator(warning: UnitViewAdapterWarning) {
  const lamp = classifyCompilePageWarningCode(warning.code)
  if (lamp === 'missing') return { missing: true, error: false }
  if (lamp === 'error') return { missing: false, error: true }
  return null
}

function buildUnitIdsBySourceId(units: UnitView[]) {
  const map = new Map<string, string[]>()
  units.forEach((unit) => {
    const sourceId = String(unit.sourceId || '').trim()
    if (!sourceId) return
    map.set(sourceId, [...(map.get(sourceId) || []), unit.unitId])
  })
  return map
}

function buildParentIdByUnitId(units: UnitView[]) {
  const map = new Map<string, string>()
  units.forEach((unit) => {
    const unitId = String(unit.unitId || '').trim()
    const parentId = String(unit.parentId || '').trim()
    if (unitId && parentId) map.set(unitId, parentId)
  })
  return map
}

function resolveWarningUnitIds(warning: UnitViewAdapterWarning, unitIdsBySourceId: Map<string, string[]>) {
  const unitIds = new Set<string>()
  if (warning.unitId) unitIds.add(warning.unitId)
  const sourceIds = warning.sourceId ? unitIdsBySourceId.get(warning.sourceId) || [] : []
  sourceIds.forEach((unitId) => unitIds.add(unitId))
  return [...unitIds]
}

function collectCompilePageIndicatorKeys(unit: UnitView) {
  const keys = new Set<string>()
  ;[
    unit.unitId,
    unit.sourceId,
    unit.sourcePath,
    unit.metadata?.treeNodeId,
    unit.metadata?.overviewDocumentId,
    unit.metadata?.documentId,
    unit.metadata?.folderPath,
    unit.metadata?.legacyDisplayPath,
    unit.metadata?.relationRefId
  ].forEach((key) => {
    const safeKey = String(key || '').trim()
    if (safeKey) keys.add(safeKey)
  })
  return keys
}

function propagateCompilePageIndicatorsToAncestors(
  indicators: Map<string, UnitCompilePageIndicator>,
  parentIdByUnitId: Map<string, string>
) {
  const directEntries = [...indicators.entries()]
  directEntries.forEach(([unitId, indicator]) => {
    let parentId = parentIdByUnitId.get(unitId) || ''
    const seen = new Set([unitId])
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      mergeCompilePageIndicator(indicators, parentId, indicator)
      parentId = parentIdByUnitId.get(parentId) || ''
    }
  })
}

function mergeCompilePageIndicator(
  indicators: Map<string, UnitCompilePageIndicator>,
  unitId: string,
  next: Pick<UnitCompilePageIndicator, 'missing' | 'error'>
) {
  const safeUnitId = String(unitId || '').trim()
  if (!safeUnitId) return
  const current = indicators.get(safeUnitId) || { missing: false, error: false, title: '' }
  indicators.set(safeUnitId, {
    missing: current.missing || next.missing,
    error: current.error || next.error,
    title: current.title
  })
}

function formatCompilePageIndicatorTitle(indicator: Pick<UnitCompilePageIndicator, 'missing' | 'error'>) {
  const parts: string[] = []
  if (indicator.missing) parts.push('编译页缺失字段')
  if (indicator.error) parts.push('编译页存在错误')
  return parts.join('；')
}
