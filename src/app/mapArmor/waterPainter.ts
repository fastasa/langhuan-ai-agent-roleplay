import type { ArmorPainterCallModel } from './armorPainter'
import { validateStrokeOnMatrix } from './dotMatrix'
import type { ArmorStroke, DotMatrixProjection, WaterArmorParams } from './types'

export interface WaterPaintResult {
  ok: boolean
  outline?: ArmorStroke
  params?: WaterArmorParams
  name?: string
  attempts: number
  error?: string
  attemptTrace: Array<{
    attempt: number
    raw?: string
    normalized?: Record<string, unknown>
    validation?: { ok: boolean; illegalCells: Array<[number, number]> }
    error?: string
  }>
}

const WATER_PAINTER_SYSTEM_PROMPT = `你是地图地貌画师，只规划一个湖泊或海洋的闭合水面外轮廓。深水带、海岸碎折、精确闭合与河流接通由代码生成；不要画内层等深线。

【点阵】"." 是本次可画范围，"#" 是范围外或已有水面。每行开头是行号，顶部两行是列号。轮廓相邻点以及最后一点回到第一点的闭合边都必须落在 "."。

【输出】只输出一个 JSON 对象，不要解释：
{"outline":{"type":"smooth","points":[[行,列],[行,列],...]} ,"params":{"waterKind":"lake"},"name":"水体名"}
给 6~14 个顺时针或逆时针关键点，不要重复首点。params 可省略字段：waterKind（lake/ocean）、maxDepthM（米）、shoreShelfRatio（0.05~0.45）、depthCurve（0.4~3）、ruggedness（0~1）、layers（2/3）、connectionGapM（米，10~5000）。`

function extractJsonText(raw: string): string {
  const text = String(raw || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  return first >= 0 && last > first ? text.slice(first, last + 1) : text
}

function sanitizeParams(raw: unknown): WaterArmorParams | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const out: WaterArmorParams = {}
  if (source.waterKind === 'lake' || source.waterKind === 'ocean') out.waterKind = source.waterKind
  for (const key of ['maxDepthM', 'shoreShelfRatio', 'depthCurve', 'ruggedness', 'connectionGapM'] as const) {
    const value = Number(source[key])
    if (Number.isFinite(value)) out[key] = value
  }
  const layers = Number(source.layers)
  if (layers === 2 || layers === 3) out.layers = layers
  return Object.keys(out).length ? out : undefined
}

function parseWaterPaint(raw: string): { ok: true; value: { outline: ArmorStroke; params?: WaterArmorParams; name?: string } } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonText(raw))
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${(error as Error)?.message || String(error)}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: '输出不是 JSON 对象' }
  const record = parsed as Record<string, unknown>
  const outline = record.outline
  if (!outline || typeof outline !== 'object' || Array.isArray(outline)) return { ok: false, error: 'outline 缺失' }
  const source = outline as Record<string, unknown>
  if (!Array.isArray(source.points) || source.points.length < 5 || source.points.length > 20) {
    return { ok: false, error: 'outline.points 需要 5~20 个点' }
  }
  const points: Array<[number, number]> = []
  for (const point of source.points) {
    const row = Array.isArray(point) ? Number(point[0]) : NaN
    const col = Array.isArray(point) ? Number(point[1]) : NaN
    if (!Number.isFinite(row) || !Number.isFinite(col)) return { ok: false, error: 'outline.points 必须是 [行,列] 数字对' }
    points.push([row, col])
  }
  const params = sanitizeParams(record.params)
  return {
    ok: true,
    value: {
      outline: { type: source.type === 'straight' ? 'straight' : 'smooth', points },
      ...(params ? { params } : {}),
      ...(typeof record.name === 'string' && record.name.trim() ? { name: record.name.trim() } : {})
    }
  }
}

export async function runWaterPainter(input: {
  task: string
  projection: DotMatrixProjection
  waterKind?: 'lake' | 'ocean'
  callModel: ArmorPainterCallModel
}): Promise<WaterPaintResult> {
  let user = `${input.projection.text}\n\n任务：${input.task}`
  if (input.waterKind) user += `\n水体语义必须使用 ${input.waterKind}。`
  const attemptTrace: WaterPaintResult['attemptTrace'] = []
  let lastError = '地貌师未能产出合法水体轮廓'
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let raw: string
    try {
      raw = await input.callModel({ system: WATER_PAINTER_SYSTEM_PROMPT, user })
    } catch (error) {
      lastError = `模型调用失败：${(error as Error)?.message || String(error)}`
      attemptTrace.push({ attempt, error: lastError })
      break
    }
    const parsed = parseWaterPaint(raw)
    if (!parsed.ok) {
      lastError = parsed.error
      attemptTrace.push({ attempt, raw, error: lastError })
      user += `\n\n上一次输出失败：${lastError}。请只返回规定 JSON。`
      continue
    }
    const value = parsed.value
    if (input.waterKind && value.params?.waterKind && value.params.waterKind !== input.waterKind) {
      lastError = `waterKind 必须是 ${input.waterKind}`
      attemptTrace.push({ attempt, raw, normalized: value, error: lastError })
      user += `\n\n上一次语义错误：${lastError}。`
      continue
    }
    const closed: ArmorStroke = { ...value.outline, points: [...value.outline.points, value.outline.points[0]] }
    const validation = validateStrokeOnMatrix(closed, input.projection)
    if (validation.ok) {
      return { ok: true, ...value, attempts: attempt, attemptTrace: [...attemptTrace, { attempt, raw, normalized: value, validation }] }
    }
    lastError = `水体闭合轮廓越界或落入禁区（${validation.illegalCells.length} 格）`
    attemptTrace.push({ attempt, raw, normalized: value, validation, error: lastError })
    user += `\n\n上一次闭合轮廓校验失败：${lastError}。首尾闭合边也必须留在 "." 内。`
  }
  return { ok: false, error: lastError, attempts: attemptTrace.length, attemptTrace }
}
