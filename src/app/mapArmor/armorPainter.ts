/**
 * 装甲地图系统 · 单次模型调用画师（批A2·2026-07-13 装甲地图系统计划书）。
 *
 * 司机理论落地：模型只在点阵图上报一条山脉的意图骨架（4~8 个关键点）+ 少量可省略参数，
 * 一次调用出结果——不是绘舆那种 20 分钟多轮 tool-calling loop。callModel 依赖注入保持纯函数可测
 * （真实实现在 XingyiDock.vue 组，走 ai.callAIWithTools，不含 tools/toolCalls，只要一段文本）。
 *
 * 纲领刻意精简（<1500 字）：只讲点阵规则+输出格式+参数表+美学提示四块，绝不引入绘舆知识库那套
 * 造形/图纸/交稿工具体系——装甲画师没有工具可调，唯一产出就是这段 JSON 文本。
 */

import type { ArmorStroke, DotMatrixProjection, MountainArmorParams } from './types'
import { validateStrokeOnMatrix } from './dotMatrix'

/** 单次模型调用契约：system+user 两段文本进，模型原始文本出——不含 tool_calls，保持画师与具体
 *  AI 接入方式解耦（测试可直接传同步/异步的假实现）。 */
export interface ArmorPainterCallModel {
  (input: { system: string; user: string }): Promise<string>
}

export interface ArmorPaintResult {
  ok: boolean
  /** 阶段1 只用第一笔画（多笔留后续批）：即便模型给了多笔，这里也只保留 strokes[0] 一项。 */
  strokes?: ArmorStroke[]
  /** 模型给的参数（可能残缺——省略字段=交给 expandMountainArmor 按 seed 随机补），已做数值化清洗。 */
  params?: MountainArmorParams
  name?: string
  error?: string
  /** 实际调用模型的次数（1=一次通过，2=重试过一次；失败时也如实反映真实调用次数）。 */
  attempts: number
  /** 每次模型原文、解析后命令与点阵校验结果，供完整作图记录消费。 */
  attemptTrace: Array<{
    attempt: number
    raw?: string
    normalized?: { strokes: ArmorStroke[]; params?: MountainArmorParams; name?: string }
    validation?: { ok: boolean; illegalCells: Array<[number, number]> }
    error?: string
  }>
}

/** 纲领：四块固定内容，字数刻意压缩——点阵规则测题实测已验证模型读得懂，不需要额外举例赘述。 */
const ARMOR_PAINTER_SYSTEM_PROMPT = `你是地图地貌画师：只在点阵图上规划一条山脉的意图骨架（关键点），精确几何、圆润与海拔全部由代码确定性生成——你是司机，不是工程师，不需要自己算圆弧。

【点阵规则】图中 "." 是可画格，"#" 是禁区（越界/锚点轮廓外/已有水域/已有山体，并已为山体宽度预留安全距离）。每行开头两位数字是行号，图顶两行是列号（十位/个位对齐）。请规划一条从起点到终点的山脉骨架线，关键点落在 "." 格上。

【输出格式】只输出一个 JSON 对象，不要输出任何多余文字：
{"strokes":[{"type":"smooth","points":[[行,列],[行,列],...]}],"params":{},"name":"山脉名"}
关键点取 4~8 个即可，只报骨架转折点/起止点，不要逐格列举、不要回抄点阵图。

【参数表】params 内各字段均可省略（省略=系统按合理范围自动随机取值）：
- peakElevationM：主峰海拔（米），决定山有多高
- baseWidthM：基座总宽（米），决定山有多"胖"
- steepness：0~1，陡度，越高山体轮廓越窄越陡
- ruggedness：0~1，嶙峋度，越高轮廓越碎折，越低越圆缓
- asymmetry：-1~1，两侧不对称偏置，0=对称，非0=单面山

【美学提示】弧线会被代码自动平滑，关键点大胆给弯不用怕直；相邻关键点连线光栅化后不能压在 "#" 上。安全距离已经由代码预留，不要再故意贴边。`

/** 提取模型回复里的 JSON 文本：优先取 \`\`\`json 或 \`\`\` 围栏内内容；没有围栏则退化为取首个
 *  '{' 到最后一个 '}' 的子串；都没有则原样返回（交给 JSON.parse 报错）。 */
function extractJsonText(raw: string): string {
  const text = String(raw || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) return text.slice(first, last + 1)
  return text
}

const NUMERIC_PARAM_KEYS = ['peakElevationM', 'baseWidthM', 'steepness', 'ruggedness', 'asymmetry'] as const

/** 参数数值化清洗：模型偶尔会把数字写成字符串，或夹带非法字段——只保留能转成有限数的已知数值字段
 *  + 合法的 layers 枚举，其余一律丢弃（丢弃比让 NaN 流进 expandMountainArmor 更安全）。 */
function sanitizeParams(raw: unknown): MountainArmorParams | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>
  const out: MountainArmorParams = {}
  for (const key of NUMERIC_PARAM_KEYS) {
    const value = Number(source[key])
    if (Number.isFinite(value)) (out as Record<string, number>)[key] = value
  }
  if (source.layers === 2 || source.layers === 3) out.layers = source.layers
  return Object.keys(out).length ? out : undefined
}

interface ParsedPaint {
  strokes: ArmorStroke[]
  params?: MountainArmorParams
  name?: string
}

/** 解析+校验模型 JSON 文本的形状（不做点阵合法性校验，那一步在 runArmorPainter 里用 validateStrokeOnMatrix）。 */
function parsePaintJson(raw: string): { ok: true; value: ParsedPaint } | { ok: false; error: string } {
  const jsonText = extractJsonText(raw)
  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(jsonText)
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${(error as Error)?.message || String(error)}` }
  }
  if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
    return { ok: false, error: '输出不是一个 JSON 对象' }
  }
  const record = parsedUnknown as Record<string, unknown>
  const rawStrokes = record.strokes
  if (!Array.isArray(rawStrokes) || rawStrokes.length === 0) {
    return { ok: false, error: 'strokes 缺失或为空数组' }
  }
  const strokes: ArmorStroke[] = []
  for (let i = 0; i < rawStrokes.length; i++) {
    const item = rawStrokes[i] as Record<string, unknown>
    const points = item?.points
    if (!Array.isArray(points) || points.length < 2) {
      return { ok: false, error: `strokes[${i}].points 至少需要 2 个关键点` }
    }
    const normalizedPoints: Array<[number, number]> = []
    for (const p of points) {
      const row = Array.isArray(p) ? Number(p[0]) : NaN
      const col = Array.isArray(p) ? Number(p[1]) : NaN
      if (!Number.isFinite(row) || !Number.isFinite(col)) {
        return { ok: false, error: `strokes[${i}].points 里有非法关键点（必须是 [行,列] 数字对）` }
      }
      normalizedPoints.push([row, col])
    }
    strokes.push({ type: item?.type === 'straight' ? 'straight' : 'smooth', points: normalizedPoints })
  }
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined
  return { ok: true, value: { strokes, params: sanitizeParams(record.params), name } }
}

/** 越界格清单人话化：只列前 20 个，超出用省略号收尾（防止长清单撑爆重试 prompt）。 */
function formatIllegalCells(illegalCells: Array<[number, number]>): string {
  const shown = illegalCells.slice(0, 20).map(([r, c]) => `(${r},${c})`).join(' ')
  return illegalCells.length > 20 ? `${shown} ...（共 ${illegalCells.length} 格）` : shown
}

/** 一次模型调用画一条山脉骨架：失败（解析失败/校验越界）带具体原因重试 1 次，两轮都不行才判失败。
 *  永不抛错——网络/信号中止等异常也会被捕获成 {ok:false}，调用方按结果分支处理，不需要 try/catch。 */
export async function runArmorPainter(input: {
  task: string
  projection: DotMatrixProjection
  callModel: ArmorPainterCallModel
}): Promise<ArmorPaintResult> {
  const system = ARMOR_PAINTER_SYSTEM_PROMPT
  let user = `${input.projection.text}\n\n任务：${input.task}`
  let attempts = 0
  let lastError = '地貌画师未能产出合法笔画'
  const attemptTrace: ArmorPaintResult['attemptTrace'] = []
  const maxAttempts = 2
  for (let round = 0; round < maxAttempts; round += 1) {
    attempts += 1
    let raw: string
    try {
      raw = await input.callModel({ system, user })
    } catch (error) {
      // 调用本身失败（网络/被中止等）不是"画错了"，重试没有意义，直接如实收束。
      lastError = `模型调用失败：${(error as Error)?.message || String(error)}`
      attemptTrace.push({ attempt: attempts, error: lastError })
      break
    }
    const parsed = parsePaintJson(raw)
    if (!parsed.ok) {
      lastError = parsed.error
      attemptTrace.push({ attempt: attempts, raw, error: parsed.error })
      user = `${user}\n\n上一次输出解析失败：${parsed.error}。请只输出规定格式的 JSON 对象，不要有多余说明文字，也不要用代码块以外的文字包裹。`
      continue
    }
    // 阶段1 只支持单笔画（多笔留后续批），这里静默只取第一笔，不算失败也不触发重试。
    const primary = parsed.value.strokes[0]
    const check = validateStrokeOnMatrix(primary, input.projection)
    const normalized = {
      strokes: [primary],
      ...(parsed.value.params ? { params: parsed.value.params } : {}),
      ...(parsed.value.name ? { name: parsed.value.name } : {})
    }
    if (!check.ok) {
      lastError = `笔画越界/落入禁区，共 ${check.illegalCells.length} 格：${formatIllegalCells(check.illegalCells)}`
      attemptTrace.push({ attempt: attempts, raw, normalized, validation: check, error: lastError })
      user = `${user}\n\n上一次笔画校验失败：${lastError}。请调整关键点位置，确保相邻关键点连线（直线光栅化）全部落在 "." 格上，可以适当远离禁区、让路径更贴近可画区中心。`
      continue
    }
    return {
      ok: true,
      strokes: [primary],
      ...(parsed.value.params ? { params: parsed.value.params } : {}),
      ...(parsed.value.name ? { name: parsed.value.name } : {}),
      attempts,
      attemptTrace: [...attemptTrace, { attempt: attempts, raw, normalized, validation: check }]
    }
  }
  return { ok: false, error: lastError, attempts, attemptTrace }
}
