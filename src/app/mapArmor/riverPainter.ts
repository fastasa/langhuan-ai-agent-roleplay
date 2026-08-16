import type { ArmorPainterCallModel } from './armorPainter'
import { validateStrokeOnMatrix, worldToGrid } from './dotMatrix'
import type { RiverAnchorCandidate } from './riverAnchors'
import type { ArmorStroke, DotMatrixProjection, RiverArmorParams } from './types'

export interface RiverPaintResult {
  ok: boolean
  stroke?: ArmorStroke
  params?: RiverArmorParams
  name?: string
  sourceAnchorId?: string
  mouthAnchorId?: string
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

const RIVER_PAINTER_SYSTEM_PROMPT = `你是地图地貌画师，只规划一条河流的中心脊线。精确河宽、河岸与圆润曲线由代码生成；不要自己画河岸。

【点阵】"." 是本次可画范围，"#" 是范围外。每行开头是行号，顶部两行是列号。关键点及相邻点之间的直线都必须落在 "."。

【连接】候选表中的 S 编号可作源头，M 编号可作终点/汇流点。任务明确点名时必须选对应编号；未明确或没有合适候选时可填 null。代码会把首尾点精确吸附到所选地形，不要自己猜边界坐标。

【输出】只输出一个 JSON 对象，不要解释：
{"stroke":{"type":"smooth","points":[[行,列],[行,列],...]},"sourceAnchor":"S1或null","mouthAnchor":"M1或null","params":{},"name":"河流名"}
给 4~8 个关键点，顺序必须从源头到终点。params 可省略字段：sourceWidthM、mouthWidthM（米，末端不小于源头）、growthExponent（0.1~2）、bankRoughness（0~0.6）、mouthCap（flat/flare）、mouthFlareRatio（1~10）。`

function extractJsonText(raw: string): string {
  const text = String(raw || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  return first >= 0 && last > first ? text.slice(first, last + 1) : text
}

function sanitizeParams(raw: unknown): RiverArmorParams | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const out: RiverArmorParams = {}
  for (const key of ['sourceWidthM', 'mouthWidthM', 'growthExponent', 'bankRoughness', 'mouthFlareRatio'] as const) {
    const value = Number(source[key])
    if (Number.isFinite(value)) out[key] = value
  }
  if (source.mouthCap === 'flat' || source.mouthCap === 'flare') out.mouthCap = source.mouthCap
  return Object.keys(out).length ? out : undefined
}

function normalizeAnchorId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseRiverPaint(raw: string): { ok: true; value: {
  stroke: ArmorStroke
  params?: RiverArmorParams
  name?: string
  sourceAnchorId?: string
  mouthAnchorId?: string
} } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonText(raw))
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${(error as Error)?.message || String(error)}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: '输出不是 JSON 对象' }
  const record = parsed as Record<string, unknown>
  const rawStroke = record.stroke
  if (!rawStroke || typeof rawStroke !== 'object' || Array.isArray(rawStroke)) return { ok: false, error: 'stroke 缺失' }
  const strokeRecord = rawStroke as Record<string, unknown>
  if (!Array.isArray(strokeRecord.points) || strokeRecord.points.length < 2) return { ok: false, error: 'stroke.points 至少需要 2 个点' }
  const points: Array<[number, number]> = []
  for (const point of strokeRecord.points) {
    const row = Array.isArray(point) ? Number(point[0]) : NaN
    const col = Array.isArray(point) ? Number(point[1]) : NaN
    if (!Number.isFinite(row) || !Number.isFinite(col)) return { ok: false, error: 'stroke.points 必须是 [行,列] 数字对' }
    points.push([row, col])
  }
  return {
    ok: true,
    value: {
      stroke: { type: strokeRecord.type === 'straight' ? 'straight' : 'smooth', points },
      ...(sanitizeParams(record.params) ? { params: sanitizeParams(record.params) } : {}),
      ...(typeof record.name === 'string' && record.name.trim() ? { name: record.name.trim() } : {}),
      ...(normalizeAnchorId(record.sourceAnchor) ? { sourceAnchorId: normalizeAnchorId(record.sourceAnchor) } : {}),
      ...(normalizeAnchorId(record.mouthAnchor) ? { mouthAnchorId: normalizeAnchorId(record.mouthAnchor) } : {})
    }
  }
}

function formatCandidates(candidates: RiverAnchorCandidate[], projection: DotMatrixProjection): string {
  if (!candidates.length) return '（当前没有可用连接候选；对应字段填 null）'
  return candidates.map((candidate) => {
    const [row, col] = worldToGrid(projection.spec, candidate.point)
    return `${candidate.id}｜${candidate.role === 'source' ? '源头' : '终点/汇流'}｜${candidate.name}｜约在 (${row},${col})`
  }).join('\n')
}

export async function runRiverPainter(input: {
  task: string
  projection: DotMatrixProjection
  candidates: RiverAnchorCandidate[]
  requiredSourceAnchorId?: string
  requiredMouthAnchorId?: string
  callModel: ArmorPainterCallModel
}): Promise<RiverPaintResult> {
  const candidateMap = new Map(input.candidates.map((candidate) => [candidate.id, candidate]))
  let user = `${input.projection.text}\n\n【连接候选】\n${formatCandidates(input.candidates, input.projection)}\n\n任务：${input.task}`
  if (input.requiredSourceAnchorId) user += `\n必须使用源头 ${input.requiredSourceAnchorId}。`
  if (input.requiredMouthAnchorId) user += `\n必须使用终点 ${input.requiredMouthAnchorId}。`
  const attemptTrace: RiverPaintResult['attemptTrace'] = []
  let lastError = '地貌师未能产出合法河流命令'
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let raw: string
    try {
      raw = await input.callModel({ system: RIVER_PAINTER_SYSTEM_PROMPT, user })
    } catch (error) {
      lastError = `模型调用失败：${(error as Error)?.message || String(error)}`
      attemptTrace.push({ attempt, error: lastError })
      break
    }
    const parsed = parseRiverPaint(raw)
    if (!parsed.ok) {
      lastError = parsed.error
      attemptTrace.push({ attempt, raw, error: lastError })
      user += `\n\n上一次输出失败：${lastError}。请只返回规定 JSON。`
      continue
    }
    const value = parsed.value
    const source = value.sourceAnchorId ? candidateMap.get(value.sourceAnchorId) : undefined
    const mouth = value.mouthAnchorId ? candidateMap.get(value.mouthAnchorId) : undefined
    if ((value.sourceAnchorId && source?.role !== 'source') || (value.mouthAnchorId && mouth?.role !== 'mouth')) {
      lastError = '连接编号不存在或角色不符'
    } else if (source && mouth && source.featureId === mouth.featureId) {
      lastError = '源头和终点不能选择同一个地图要素'
    } else if (input.requiredSourceAnchorId && value.sourceAnchorId !== input.requiredSourceAnchorId) {
      lastError = `源头必须选择 ${input.requiredSourceAnchorId}`
    } else if (input.requiredMouthAnchorId && value.mouthAnchorId !== input.requiredMouthAnchorId) {
      lastError = `终点必须选择 ${input.requiredMouthAnchorId}`
    } else {
      const validation = validateStrokeOnMatrix(value.stroke, input.projection)
      const normalized = { ...value }
      if (validation.ok) {
        return { ok: true, ...value, attempts: attempt, attemptTrace: [...attemptTrace, { attempt, raw, normalized, validation }] }
      }
      lastError = `河流脊线越界或落入禁区（${validation.illegalCells.length} 格）`
      attemptTrace.push({ attempt, raw, normalized, validation, error: lastError })
      user += `\n\n上一次脊线校验失败：${lastError}。请让所有相邻点连线都留在 "." 内。`
      continue
    }
    attemptTrace.push({ attempt, raw, normalized: value, error: lastError })
    user += `\n\n上一次连接校验失败：${lastError}。请使用候选表中的正确编号。`
  }
  return { ok: false, error: lastError, attempts: attemptTrace.length, attemptTrace }
}
