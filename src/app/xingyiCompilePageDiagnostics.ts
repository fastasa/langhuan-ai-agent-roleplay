/**
 * 星依编译页体检报告（2026-07-11 星依编译页诊断修复计划·批1）——页面无关的「树灯同源」纯函数。
 *
 * 灯色口径与文档树上的黄/红点完全同源（classifyCompilePageWarningCode 单点分类）：
 * - 黄灯 missing = 编译页字段缺失（getCompilePageMissingFields 直查）或 doc_missing_compile_page 警告；
 * - 红灯 error = 关系提示报错五类（relation_hint_*）警告。
 * 明细文案复用 buildUnitViewValidationReport 的 issue（标题/问题/建议），与编译页弹窗右侧提醒面板同一套说法。
 * 注意：树上父级/祖先的灯只是子孙聚合（propagate），本报告只列「问题源头单位」，不重复列祖先。
 */

import type { UnitView, UnitViewAdapterResult, UnitViewValidationIssue } from '../types/unitView'
import { classifyCompilePageWarningCode, getCompilePageMissingFields } from './compilePageIndicators'
import { buildUnitViewValidationReport } from './unitViewAdapters'

export interface XingyiCompilePageDiagnosticsOptions {
  /** 领域名（报告标题），如「世界书文档库」「角色大脑·星依」。 */
  label: string
  /** 范围说明（报告标题），缺省=「全部」。 */
  scopeLabel?: string
  /** 只诊断这些 unitId（含子树根自身）；null/缺省=全量。 */
  scopeUnitIds?: Set<string> | null
  /** 单位一行描述（标题/类别/短码/路径），由领域适配器注入；缺省=标题+unitId。 */
  describeUnit?: (unit: UnitView) => string
  /** 最多展开的问题单位数（超出截断并提示），默认 30。 */
  maxUnits?: number
}

export interface XingyiCompilePageDiagnosticsReport {
  text: string
  clean: boolean
  scannedCount: number
  redUnitCount: number
  yellowUnitCount: number
}

interface UnitLampEntry {
  unit: UnitView
  missingFields: string[]
  issues: UnitViewValidationIssue[]
  missing: boolean
  error: boolean
}

const MISSING_FIELD_LABELS: Record<string, string> = {
  summary: '摘要',
  tags: '标签',
  relationHints: '关系提示'
}

const ACTION_LEVEL_LABELS = { must_fix: '必须处理', can_defer: '建议处理', notice: '仅提示' } as const

const DEFAULT_MAX_UNITS = 30

function clip(text: string, limit = 140): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

export function buildXingyiCompilePageDiagnostics(
  result: UnitViewAdapterResult,
  options: XingyiCompilePageDiagnosticsOptions
): XingyiCompilePageDiagnosticsReport {
  const inScope = (unitId: string) => !options.scopeUnitIds || options.scopeUnitIds.has(unitId)
  const describeUnit = options.describeUnit || ((unit: UnitView) => `${unit.title}（${unit.sourcePath || unit.unitId}）`)
  const scannedUnits = result.units.filter((unit) => inScope(unit.unitId))

  const unitById = new Map(result.units.map((unit) => [unit.unitId, unit]))
  const unitIdsBySourceId = new Map<string, string[]>()
  result.units.forEach((unit) => {
    const sourceId = String(unit.sourceId || '').trim()
    if (!sourceId) return
    unitIdsBySourceId.set(sourceId, [...(unitIdsBySourceId.get(sourceId) || []), unit.unitId])
  })

  const entries = new Map<string, UnitLampEntry>()
  const entryOf = (unit: UnitView): UnitLampEntry => {
    const existing = entries.get(unit.unitId)
    if (existing) return existing
    const created: UnitLampEntry = { unit, missingFields: [], issues: [], missing: false, error: false }
    entries.set(unit.unitId, created)
    return created
  }

  // 黄灯直查：与树灯 hasMissingCompilePageFields 同口径（有编译页但字段空缺）
  scannedUnits.forEach((unit) => {
    if (!unit.compilePage) return
    const missingFields = getCompilePageMissingFields(unit.compilePage)
    if (!missingFields.length) return
    const entry = entryOf(unit)
    entry.missingFields = [...missingFields]
    entry.missing = true
  })

  // 警告类：复用统一校验报告的 issue 文案（标题/问题/建议），只保留灯色相关代码
  const validation = buildUnitViewValidationReport(result)
  validation.issues.forEach((issue) => {
    const lamp = classifyCompilePageWarningCode(issue.code)
    if (!lamp) return
    // compile_page_incomplete 与上面的直查同义（直查还能捕捉空数组），不再重复列
    if (issue.code === 'compile_page_incomplete') return
    const unitIds = issue.unitId
      ? [issue.unitId]
      : (issue.sourceId ? unitIdsBySourceId.get(String(issue.sourceId)) || [] : [])
    unitIds.filter(inScope).forEach((unitId) => {
      const unit = unitById.get(unitId)
      if (!unit) return
      const entry = entryOf(unit)
      entry.issues.push(issue)
      if (lamp === 'missing') entry.missing = true
      if (lamp === 'error') entry.error = true
    })
  })

  const list = [...entries.values()]
  const redUnitCount = list.filter((entry) => entry.error).length
  const yellowUnitCount = list.filter((entry) => entry.missing).length
  const header = `【编译页体检】${options.label}｜范围：${options.scopeLabel || '全部'}｜扫描 ${scannedUnits.length} 个单位`
  if (!list.length) {
    return {
      text: [header, '✅ 全绿：范围内没有发现编译页黄灯/红灯提醒。'].join('\n'),
      clean: true,
      scannedCount: scannedUnits.length,
      redUnitCount: 0,
      yellowUnitCount: 0
    }
  }

  const lampRank = (entry: UnitLampEntry) => (entry.error ? 0 : 1)
  list.sort((left, right) => lampRank(left) - lampRank(right)
    || String(left.unit.sourcePath || left.unit.title)
      .localeCompare(String(right.unit.sourcePath || right.unit.title), 'zh-Hans-CN'))

  const maxUnits = options.maxUnits && options.maxUnits > 0 ? Math.floor(options.maxUnits) : DEFAULT_MAX_UNITS
  const shown = list.slice(0, maxUnits)
  const lines: string[] = [
    header,
    `红灯（关系报错）${redUnitCount} 个单位 · 黄灯（字段缺失）${yellowUnitCount} 个单位（红黄可同亮）`,
    ''
  ]
  shown.forEach((entry) => {
    const lamp = entry.error && entry.missing ? '红+黄' : entry.error ? '红灯' : '黄灯'
    lines.push(`■ ${describeUnit(entry.unit)}｜${lamp}`)
    if (entry.missingFields.length) {
      lines.push(`  缺失字段：${entry.missingFields.map((field) => MISSING_FIELD_LABELS[field] || field).join('、')}`)
    }
    entry.issues.forEach((issue) => {
      const lampTag = classifyCompilePageWarningCode(issue.code) === 'error' ? '红' : '黄'
      const rawHint = issue.details && typeof issue.details.hint === 'string' ? issue.details.hint : ''
      const hint = rawHint ? `（提示行：${clip(rawHint, 80)}）` : ''
      lines.push(`  - [${lampTag}·${ACTION_LEVEL_LABELS[issue.actionLevel]}] ${issue.title}：${clip(issue.problem)}${hint}`)
      lines.push(`    → 修法：${clip(issue.suggestion)}`)
    })
  })
  if (list.length > shown.length) {
    lines.push(`（还有 ${list.length - shown.length} 个问题单位未展开：可用 parent 参数缩小到某个子树分批体检，或调大 maxUnits。）`)
  }
  return {
    text: lines.join('\n'),
    clean: false,
    scannedCount: scannedUnits.length,
    redUnitCount,
    yellowUnitCount
  }
}
