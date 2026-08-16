/**
 * 状态栏展示协议 v1。
 *
 * 这是服务端、前端和 Agent 的共同真值：协议只接受有限 block 与有限表达式，
 * 不允许脚本、CSS、HTML 或任意公式字符串进入运行时。
 */

export const STATUS_PANEL_PRESENTATION_SCHEMA_VERSION = 1 as const
export const STATUS_PANEL_PRESENTATION_BLOCK_TYPES = [
  'metric',
  'donut',
  'bar',
  'progress',
  'field-list',
  'reference-list',
  'media'
] as const

export type StatusPanelPresentationBlockType = (typeof STATUS_PANEL_PRESENTATION_BLOCK_TYPES)[number]

export type StatusPanelValueExpression =
  | { op: 'field'; fieldKey: string }
  | { op: 'constant'; value: number }
  | { op: 'sum' | 'difference'; args: StatusPanelValueExpression[] }
  | { op: 'remainder'; total: StatusPanelValueExpression; parts: StatusPanelValueExpression[] }
  | { op: 'ratio'; numerator: StatusPanelValueExpression; denominator: StatusPanelValueExpression }
  | { op: 'count_refs'; fieldKey: string }

export interface StatusPanelPresentationBaseBlock {
  id: string
  type: StatusPanelPresentationBlockType
  title?: string
  span?: 1 | 2 | 3
}

export interface StatusPanelMetricBlock extends StatusPanelPresentationBaseBlock {
  type: 'metric'
  value: StatusPanelValueExpression
  unit?: string
  subtitle?: string
}

export interface StatusPanelChartSegment {
  id: string
  label: string
  value: StatusPanelValueExpression
}

export interface StatusPanelChartVariant {
  id: string
  label: string
  segments: StatusPanelChartSegment[]
}

export interface StatusPanelDonutBlock extends StatusPanelPresentationBaseBlock {
  type: 'donut'
  total: StatusPanelValueExpression
  variants: StatusPanelChartVariant[]
}

export interface StatusPanelBarBlock extends StatusPanelPresentationBaseBlock {
  type: 'bar'
  items: StatusPanelChartSegment[]
  unit?: string
}

export interface StatusPanelProgressBlock extends StatusPanelPresentationBaseBlock {
  type: 'progress'
  value: StatusPanelValueExpression
  total: StatusPanelValueExpression
  label?: string
  unit?: string
}

export interface StatusPanelFieldListBlock extends StatusPanelPresentationBaseBlock {
  type: 'field-list'
  fieldKeys: string[]
}

export interface StatusPanelReferenceListBlock extends StatusPanelPresentationBaseBlock {
  type: 'reference-list'
  fieldKey: string
}

export interface StatusPanelMediaBlock extends StatusPanelPresentationBaseBlock {
  type: 'media'
  fieldKey: string
  fit?: 'contain' | 'cover' | 'pixelated'
}

export type StatusPanelPresentationBlock =
  | StatusPanelMetricBlock
  | StatusPanelDonutBlock
  | StatusPanelBarBlock
  | StatusPanelProgressBlock
  | StatusPanelFieldListBlock
  | StatusPanelReferenceListBlock
  | StatusPanelMediaBlock

export interface StatusPanelPresentation {
  schemaVersion: typeof STATUS_PANEL_PRESENTATION_SCHEMA_VERSION
  blocks: StatusPanelPresentationBlock[]
}

export interface StatusPanelPresentationFieldLike {
  key: string
  valueType?: string
  unit?: string
}

export interface StatusPanelPresentationDiagnostic {
  blockId: string
  code: 'protocol_invalid' | 'invalid_number' | 'negative_value' | 'total_mismatch' | 'invalid_total'
  message: string
}

export type StatusPanelPresentationResult =
  | { ok: true; presentation: StatusPanelPresentation | null }
  | { ok: false; errors: string[] }

const BLOCK_TYPE_SET = new Set<string>(STATUS_PANEL_PRESENTATION_BLOCK_TYPES)
const MAX_BLOCKS = 24
const MAX_SEGMENTS = 16
const MAX_EXPRESSION_DEPTH = 8

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
  errors: string[]
) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path} 含未支持属性：${key}`)
  }
}

function normalizeExpression(
  raw: unknown,
  path: string,
  fields: Map<string, StatusPanelPresentationFieldLike>,
  errors: string[],
  depth = 0
): StatusPanelValueExpression | null {
  if (depth > MAX_EXPRESSION_DEPTH) {
    errors.push(`${path} 表达式嵌套过深`)
    return null
  }
  if (!isObject(raw)) {
    errors.push(`${path} 必须是表达式对象`)
    return null
  }
  const op = text(raw.op)
  if (op === 'field' || op === 'count_refs') {
    rejectUnknownKeys(raw, ['op', 'fieldKey'], path, errors)
    const fieldKey = text(raw.fieldKey)
    const field = fields.get(fieldKey)
    if (!field) errors.push(`${path}.fieldKey 引用了不存在的字段：${fieldKey || '（空）'}`)
    if (op === 'field' && field && field.valueType !== 'number') {
      errors.push(`${path}.fieldKey 必须引用 number 字段：${fieldKey}`)
    }
    if (op === 'count_refs' && field && field.valueType !== 'ref' && field.valueType !== 'list') {
      errors.push(`${path}.fieldKey 必须引用 ref 或 list 字段：${fieldKey}`)
    }
    return fieldKey ? { op, fieldKey } as StatusPanelValueExpression : null
  }
  if (op === 'constant') {
    rejectUnknownKeys(raw, ['op', 'value'], path, errors)
    const value = Number(raw.value)
    if (!Number.isFinite(value)) {
      errors.push(`${path}.value 必须是有限数字`)
      return null
    }
    return { op, value }
  }
  if (op === 'sum' || op === 'difference') {
    rejectUnknownKeys(raw, ['op', 'args'], path, errors)
    if (!Array.isArray(raw.args) || raw.args.length < 1 || raw.args.length > MAX_SEGMENTS) {
      errors.push(`${path}.args 必须包含 1-${MAX_SEGMENTS} 个表达式`)
      return null
    }
    const args = raw.args
      .map((item, index) => normalizeExpression(item, `${path}.args[${index}]`, fields, errors, depth + 1))
      .filter((item): item is StatusPanelValueExpression => Boolean(item))
    return args.length === raw.args.length ? { op, args } : null
  }
  if (op === 'remainder') {
    rejectUnknownKeys(raw, ['op', 'total', 'parts'], path, errors)
    if (!Array.isArray(raw.parts) || raw.parts.length < 1 || raw.parts.length > MAX_SEGMENTS) {
      errors.push(`${path}.parts 必须包含 1-${MAX_SEGMENTS} 个表达式`)
      return null
    }
    const total = normalizeExpression(raw.total, `${path}.total`, fields, errors, depth + 1)
    const parts = raw.parts
      .map((item, index) => normalizeExpression(item, `${path}.parts[${index}]`, fields, errors, depth + 1))
      .filter((item): item is StatusPanelValueExpression => Boolean(item))
    return total && parts.length === raw.parts.length ? { op, total, parts } : null
  }
  if (op === 'ratio') {
    rejectUnknownKeys(raw, ['op', 'numerator', 'denominator'], path, errors)
    const numerator = normalizeExpression(raw.numerator, `${path}.numerator`, fields, errors, depth + 1)
    const denominator = normalizeExpression(raw.denominator, `${path}.denominator`, fields, errors, depth + 1)
    return numerator && denominator ? { op, numerator, denominator } : null
  }
  errors.push(`${path}.op 不受支持：${op || '（空）'}`)
  return null
}

function normalizeSegments(
  raw: unknown,
  path: string,
  fields: Map<string, StatusPanelPresentationFieldLike>,
  errors: string[]
): StatusPanelChartSegment[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SEGMENTS) {
    errors.push(`${path} 必须包含 1-${MAX_SEGMENTS} 项`)
    return []
  }
  const ids = new Set<string>()
  return raw.flatMap((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isObject(item)) {
      errors.push(`${itemPath} 必须是对象`)
      return []
    }
    rejectUnknownKeys(item, ['id', 'label', 'value'], itemPath, errors)
    const id = text(item.id)
    const label = text(item.label)
    if (!id) errors.push(`${itemPath}.id 不能为空`)
    if (ids.has(id)) errors.push(`${path} 的 id 重复：${id}`)
    ids.add(id)
    if (!label) errors.push(`${itemPath}.label 不能为空`)
    const value = normalizeExpression(item.value, `${itemPath}.value`, fields, errors)
    return id && label && value ? [{ id, label, value }] : []
  })
}

function expressionFieldKeys(expression: StatusPanelValueExpression): string[] {
  if (expression.op === 'field' || expression.op === 'count_refs') return [expression.fieldKey]
  if (expression.op === 'constant') return []
  if ('args' in expression) return expression.args.flatMap(expressionFieldKeys)
  if (expression.op === 'remainder') return [
    ...expressionFieldKeys(expression.total),
    ...expression.parts.flatMap(expressionFieldKeys)
  ]
  return [...expressionFieldKeys(expression.numerator), ...expressionFieldKeys(expression.denominator)]
}

function validateComparableUnits(
  block: StatusPanelPresentationBlock,
  fields: Map<string, StatusPanelPresentationFieldLike>,
  path: string,
  errors: string[]
) {
  const expressions = block.type === 'donut'
    ? [block.total, ...block.variants.flatMap((variant) => variant.segments.map((segment) => segment.value))]
    : block.type === 'bar'
      ? block.items.map((item) => item.value)
      : block.type === 'progress'
        ? [block.value, block.total]
        : []
  if (!expressions.length) return
  const units = new Set(expressions
    .flatMap(expressionFieldKeys)
    .map((fieldKey) => text(fields.get(fieldKey)?.unit))
    .filter(Boolean))
  if (units.size > 1) errors.push(`${path} 引用了不同单位的数值字段：${[...units].join('、')}`)
  const declaredUnit = block.type === 'bar' || block.type === 'progress' ? text(block.unit) : ''
  if (declaredUnit && units.size === 1 && !units.has(declaredUnit)) {
    errors.push(`${path}.unit 与字段单位不一致：${declaredUnit} / ${[...units][0]}`)
  }
}

export function normalizeStatusPanelPresentation(
  input: unknown,
  fieldDefinitions: StatusPanelPresentationFieldLike[]
): StatusPanelPresentationResult {
  let raw = input
  if (typeof raw === 'string') {
    const source = raw.trim()
    if (!source) return { ok: true, presentation: null }
    try {
      raw = JSON.parse(source)
    } catch {
      return { ok: false, errors: ['展示配置不是合法 JSON'] }
    }
  }
  if (raw === undefined || raw === null) return { ok: true, presentation: null }
  if (!isObject(raw)) return { ok: false, errors: ['展示配置必须是对象'] }
  const errors: string[] = []
  rejectUnknownKeys(raw, ['schemaVersion', 'blocks'], 'presentation', errors)
  if (Number(raw.schemaVersion) !== STATUS_PANEL_PRESENTATION_SCHEMA_VERSION) {
    errors.push(`presentation.schemaVersion 必须是 ${STATUS_PANEL_PRESENTATION_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(raw.blocks) || raw.blocks.length > MAX_BLOCKS) {
    errors.push(`presentation.blocks 必须是最多 ${MAX_BLOCKS} 项的数组`)
    return { ok: false, errors }
  }
  const rawBlocks = raw.blocks
  const fields = new Map(fieldDefinitions.map((field) => [text(field.key), field]))
  const blockIds = new Set<string>()
  const blocks: StatusPanelPresentationBlock[] = []
  rawBlocks.forEach((item, index) => {
    const path = `presentation.blocks[${index}]`
    if (!isObject(item)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    const id = text(item.id)
    const type = text(item.type)
    const title = text(item.title)
    const spanRaw = item.span === undefined ? 1 : Number(item.span)
    const span = spanRaw === 1 || spanRaw === 2 || spanRaw === 3 ? spanRaw : 1
    if (!id) errors.push(`${path}.id 不能为空`)
    if (blockIds.has(id)) errors.push(`展示块 id 重复：${id}`)
    blockIds.add(id)
    if (!BLOCK_TYPE_SET.has(type)) errors.push(`${path}.type 不受支持：${type || '（空）'}`)
    if (![1, 2, 3].includes(spanRaw)) errors.push(`${path}.span 只能是 1、2 或 3`)
    const base = { id, type, ...(title ? { title } : {}), span } as StatusPanelPresentationBaseBlock
    if (type === 'metric') {
      rejectUnknownKeys(item, ['id', 'type', 'title', 'span', 'value', 'unit', 'subtitle'], path, errors)
      const value = normalizeExpression(item.value, `${path}.value`, fields, errors)
      if (id && value) blocks.push({ ...base, type, value, ...(text(item.unit) ? { unit: text(item.unit) } : {}), ...(text(item.subtitle) ? { subtitle: text(item.subtitle) } : {}) })
    } else if (type === 'donut') {
      rejectUnknownKeys(item, ['id', 'type', 'title', 'span', 'total', 'variants'], path, errors)
      const total = normalizeExpression(item.total, `${path}.total`, fields, errors)
      const variants: StatusPanelChartVariant[] = []
      if (!Array.isArray(item.variants) || item.variants.length < 1 || item.variants.length > 8) {
        errors.push(`${path}.variants 必须包含 1-8 个分类方案`)
      } else {
        const variantIds = new Set<string>()
        item.variants.forEach((variant, variantIndex) => {
          const variantPath = `${path}.variants[${variantIndex}]`
          if (!isObject(variant)) return void errors.push(`${variantPath} 必须是对象`)
          rejectUnknownKeys(variant, ['id', 'label', 'segments'], variantPath, errors)
          const variantId = text(variant.id)
          const label = text(variant.label)
          if (!variantId || !label) errors.push(`${variantPath} 的 id 和 label 不能为空`)
          if (variantIds.has(variantId)) errors.push(`${path}.variants 的 id 重复：${variantId}`)
          variantIds.add(variantId)
          const segments = normalizeSegments(variant.segments, `${variantPath}.segments`, fields, errors)
          if (variantId && label && segments.length) variants.push({ id: variantId, label, segments })
        })
      }
      if (id && total && variants.length) blocks.push({ ...base, type, total, variants })
    } else if (type === 'bar') {
      rejectUnknownKeys(item, ['id', 'type', 'title', 'span', 'items', 'unit'], path, errors)
      const items = normalizeSegments(item.items, `${path}.items`, fields, errors)
      if (id && items.length) blocks.push({ ...base, type, items, ...(text(item.unit) ? { unit: text(item.unit) } : {}) })
    } else if (type === 'progress') {
      rejectUnknownKeys(item, ['id', 'type', 'title', 'span', 'value', 'total', 'label', 'unit'], path, errors)
      const value = normalizeExpression(item.value, `${path}.value`, fields, errors)
      const total = normalizeExpression(item.total, `${path}.total`, fields, errors)
      if (id && value && total) blocks.push({ ...base, type, value, total, ...(text(item.label) ? { label: text(item.label) } : {}), ...(text(item.unit) ? { unit: text(item.unit) } : {}) })
    } else if (type === 'field-list') {
      rejectUnknownKeys(item, ['id', 'type', 'title', 'span', 'fieldKeys'], path, errors)
      const fieldKeys = Array.isArray(item.fieldKeys) ? item.fieldKeys.map(text).filter(Boolean) : []
      if (!fieldKeys.length) errors.push(`${path}.fieldKeys 至少需要一个字段`)
      for (const fieldKey of fieldKeys) if (!fields.has(fieldKey)) errors.push(`${path}.fieldKeys 引用了不存在的字段：${fieldKey}`)
      if (id && fieldKeys.length) blocks.push({ ...base, type, fieldKeys })
    } else if (type === 'reference-list' || type === 'media') {
      const allowed = type === 'media' ? ['id', 'type', 'title', 'span', 'fieldKey', 'fit'] : ['id', 'type', 'title', 'span', 'fieldKey']
      rejectUnknownKeys(item, allowed, path, errors)
      const fieldKey = text(item.fieldKey)
      const field = fields.get(fieldKey)
      const expected = type === 'media' ? 'asset' : 'ref'
      if (!field || field.valueType !== expected) errors.push(`${path}.fieldKey 必须引用 ${expected} 字段：${fieldKey || '（空）'}`)
      if (id && fieldKey) {
        if (type === 'media') {
          const fit = text(item.fit)
          if (fit && fit !== 'contain' && fit !== 'cover' && fit !== 'pixelated') errors.push(`${path}.fit 不受支持：${fit}`)
          blocks.push({ ...base, type, fieldKey, ...(fit ? { fit: fit as 'contain' | 'cover' | 'pixelated' } : {}) })
        } else blocks.push({ ...base, type, fieldKey })
      }
    }
  })
  blocks.forEach((block) => validateComparableUnits(block, fields, `presentation.blocks[${rawBlocks.findIndex((item) => isObject(item) && text(item.id) === block.id)}]`, errors))
  return errors.length ? { ok: false, errors } : { ok: true, presentation: { schemaVersion: 1, blocks } }
}

export function evaluateStatusPanelExpression(
  expression: StatusPanelValueExpression,
  values: Record<string, unknown>
): number {
  const evaluate = (item: StatusPanelValueExpression): number => {
    if (item.op === 'constant') return item.value
    if (item.op === 'field') return Number(values[item.fieldKey])
    if (item.op === 'count_refs') {
      const refs = values[item.fieldKey]
      return Array.isArray(refs) ? refs.length : 0
    }
    if (item.op === 'sum') return item.args.reduce((sum, arg) => sum + evaluate(arg), 0)
    if (item.op === 'difference') return item.args.slice(1).reduce((result, arg) => result - evaluate(arg), evaluate(item.args[0]))
    if (item.op === 'remainder') return evaluate(item.total) - item.parts.reduce((sum, part) => sum + evaluate(part), 0)
    if (item.op === 'ratio') {
      const denominator = evaluate(item.denominator)
      return denominator === 0 ? Number.NaN : evaluate(item.numerator) / denominator
    }
    return Number.NaN
  }
  const result = evaluate(expression)
  return Number.isFinite(result) ? result : Number.NaN
}

export function validateStatusPanelPresentationValues(
  presentation: StatusPanelPresentation | null | undefined,
  values: Record<string, unknown>
): StatusPanelPresentationDiagnostic[] {
  if (!presentation?.blocks?.length) return []
  const diagnostics: StatusPanelPresentationDiagnostic[] = []
  for (const block of presentation.blocks) {
    if (block.type === 'metric') {
      const value = evaluateStatusPanelExpression(block.value, values)
      if (!Number.isFinite(value)) diagnostics.push({ blockId: block.id, code: 'invalid_number', message: '指标值不是有效数字' })
      continue
    }
    if (block.type === 'bar') {
      const numbers = block.items.map((item) => evaluateStatusPanelExpression(item.value, values))
      if (numbers.some((value) => !Number.isFinite(value))) diagnostics.push({ blockId: block.id, code: 'invalid_number', message: '条形图包含空值或非数字' })
      else if (numbers.some((value) => value < 0)) diagnostics.push({ blockId: block.id, code: 'negative_value', message: '条形图包含负数' })
      continue
    }
    if (block.type === 'progress') {
      const value = evaluateStatusPanelExpression(block.value, values)
      const total = evaluateStatusPanelExpression(block.total, values)
      if (!Number.isFinite(value) || !Number.isFinite(total)) diagnostics.push({ blockId: block.id, code: 'invalid_number', message: '进度值或总量不是有效数字' })
      else if (value < 0 || total <= 0) diagnostics.push({ blockId: block.id, code: 'invalid_total', message: '进度值不得为负，且总量必须大于零' })
      continue
    }
    if (block.type === 'donut') {
      const total = evaluateStatusPanelExpression(block.total, values)
      for (const variant of block.variants) {
        const numbers = variant.segments.map((segment) => evaluateStatusPanelExpression(segment.value, values))
        if (!Number.isFinite(total) || numbers.some((value) => !Number.isFinite(value))) {
          diagnostics.push({ blockId: block.id, code: 'invalid_number', message: `${variant.label}：环图包含空值或非数字` })
          continue
        }
        if (total < 0 || numbers.some((value) => value < 0)) {
          diagnostics.push({ blockId: block.id, code: 'negative_value', message: `${variant.label}：环图包含负数` })
          continue
        }
        const sum = numbers.reduce((result, value) => result + value, 0)
        if (Math.abs(sum - total) > Math.max(0.01, Math.abs(total) * 0.000001)) {
          diagnostics.push({
            blockId: block.id,
            code: 'total_mismatch',
            message: `${variant.label}：分类合计 ${sum.toLocaleString('zh-CN')}，但总量是 ${total.toLocaleString('zh-CN')}`
          })
        }
      }
    }
  }
  return diagnostics
}

export function summarizeStatusPanelPresentation(value: unknown): string {
  if (!isObject(value) || !Array.isArray(value.blocks) || value.blocks.length === 0) return '无总览'
  const counts = new Map<string, number>()
  value.blocks.forEach((block) => {
    const type = isObject(block) ? text(block.type) : ''
    if (type) counts.set(type, (counts.get(type) || 0) + 1)
  })
  return [...counts.entries()].map(([type, count]) => `${type}×${count}`).join('、') || '无总览'
}
