// 装甲地图系统 · 点阵投影生成器（批A1·2026-07-13 装甲地图系统计划书）
// 职责：把「本次任务工作框+已有水域/山体」编码成模型可读的字符点阵文本（`.`可画/`#`禁区），供模型报骨架关键点；
// 再把模型报回的关键点笔画光栅化（Bresenham）+ 落 0 区校验，找出越界格；grid↔world 互转是两侧坐标系的唯一桥。
// 文本渲染格式已按阶段0 测试题实测跑通（模型读得懂），改动前先核对 2026-07-13_点阵图协议阶段0测试题.md。

import { bboxOf, distanceToPolygonBoundary, pointInPoly } from '../mapGeometry'
import type { MapPoint } from '../mapGeometry'
import type { ArmorStroke, DotMatrixProjection, DotMatrixSpec } from './types'

/** 渲染点阵文本：顶部两行列号（十位/个位，列1起对齐，个位行满行皆有数字、十位行列1~9留空对齐进制），
 *  其后每行 = 两位（或更宽，见 rowWidth）行号 + 一个空格 + 逐列 `.`/`#` 字符。
 *  与阶段0 测试题实测格式逐字节一致（41×41 时每行长度=3+cols，含 rowWidth=2 的默认场景）。 */
function renderDotMatrixText(legal: boolean[][], rows: number, cols: number): string {
  // 行号宽度：默认按"两位"（阶段0 测试题固定写法），行数超两位数时自动加宽，不截断。
  const rowWidth = Math.max(2, String(rows).length)
  const prefixWidth = rowWidth + 1 // 行号 + 紧跟的一个空格
  const total = prefixWidth + cols
  const tensChars: string[] = new Array(total).fill(' ')
  const unitsChars: string[] = new Array(total).fill(' ')
  for (let c = 1; c <= cols; c++) {
    const idx = prefixWidth + c - 1
    if (c >= 10) tensChars[idx] = String(Math.floor(c / 10) % 10)
    unitsChars[idx] = String(c % 10)
  }
  const lines: string[] = [tensChars.join(''), unitsChars.join('')]
  for (let r = 1; r <= rows; r++) {
    let line = String(r).padStart(rowWidth, '0') + ' '
    for (let c = 1; c <= cols; c++) line += legal[r - 1][c - 1] ? '.' : '#'
    lines.push(line)
  }
  return lines.join('\n')
}

/** 河流规划只约束本次任务域/inside 真实轮廓；山脉、水域是可连接锚点，不在点阵阶段粗暴涂成禁区。
 * 精确的源头、汇流、入海连接由 riverAnchors.ts 吸附，最终河岸再做任务域与地形冲突校验。 */
export function buildRiverDotMatrix(input: {
  framePts: MapPoint[] | null
  containmentRegion?: MapPoint[]
  gridN?: number
}): DotMatrixProjection {
  return buildMountainDotMatrix({
    framePts: input.framePts,
    waterRegions: [],
    mountainRegions: [],
    containmentRegion: input.containmentRegion,
    gridN: input.gridN,
    clearanceM: 0
  })
}

/** 水体表面规划只避让已有水面；山地可承载山间湖，是否形成非法重叠由最终矢量校验负责。 */
export function buildWaterDotMatrix(input: {
  framePts: MapPoint[] | null
  waterRegions: MapPoint[][]
  containmentRegion?: MapPoint[]
  gridN?: number
}): DotMatrixProjection {
  return buildMountainDotMatrix({
    framePts: input.framePts,
    waterRegions: input.waterRegions,
    mountainRegions: [],
    containmentRegion: input.containmentRegion,
    gridN: input.gridN,
    clearanceM: 0
  })
}

/** 生成山脉笔画用的点阵投影：网格覆盖本次任务工作框，较长边撑满 gridN 格，另一维居中且不拉伸。
 *  工作框只是本次规划坐标系，不是地图边界，所以框内默认都可画；落在任一水域/旧山体内才记为 `#`。
 *  framePts 缺失/点数不足时显式失败，避免调用方在没有坐标换算依据时继续落库。 */
export function buildMountainDotMatrix(input: {
  framePts: MapPoint[] | null
  waterRegions: MapPoint[][]
  mountainRegions: MapPoint[][]
  /** inside 锚定单个面状地形时，只允许脊线落在该真实轮廓内；缺省只受矩形任务域约束。 */
  containmentRegion?: MapPoint[]
  /** 为装甲最终半宽预留的安全距离：收缩任务域/锚点，同时膨胀水域与旧山体禁区。 */
  clearanceM?: number
  gridN?: number
}): DotMatrixProjection {
  if (!input.framePts || input.framePts.length < 3) {
    throw new Error('buildMountainDotMatrix: framePts 缺失或点数不足（<3 点无法确定工作框），无法生成点阵投影')
  }
  const gridN = Math.max(3, Math.round(input.gridN ?? 41))
  const rows = gridN
  const cols = gridN
  const bbox = bboxOf(input.framePts)
  const bboxW = Math.max(1, bbox.maxX - bbox.minX)
  const bboxH = Math.max(1, bbox.maxY - bbox.minY)
  // 较长边正好覆盖 gridN 格；另一维自然留白，不把任务框扭成正方形。
  const cellM = Math.max(bboxW, bboxH) / gridN
  const gridW = gridN * cellM
  const gridH = gridN * cellM
  const bboxCx = (bbox.minX + bbox.maxX) / 2
  const bboxCy = (bbox.minY + bbox.maxY) / 2
  const spec: DotMatrixSpec = {
    originX: bboxCx - gridW / 2,
    originY: bboxCy - gridH / 2,
    cellM,
    rows,
    cols
  }
  const clearanceM = Math.max(0, Number(input.clearanceM || 0))
  const legal: boolean[][] = []
  for (let row = 1; row <= rows; row++) {
    const rowLegal: boolean[] = []
    for (let col = 1; col <= cols; col++) {
      const [wx, wy] = gridToWorld(spec, row, col)
      const frameBoundaryDistance = distanceToPolygonBoundary([wx, wy], input.framePts)
      // 非正方形任务域的短边外侧必须明确显示为 #；网格仍保持正方格，但不能把居中留白误判成可画区。
      let ok = (pointInPoly(wx, wy, input.framePts) || frameBoundaryDistance < 1e-6)
        && frameBoundaryDistance >= clearanceM
      if (ok && input.containmentRegion?.length) {
        ok = pointInPoly(wx, wy, input.containmentRegion)
          && distanceToPolygonBoundary([wx, wy], input.containmentRegion) >= clearanceM
      }
      for (const water of input.waterRegions) {
        if (pointInPoly(wx, wy, water) || (clearanceM > 0 && distanceToPolygonBoundary([wx, wy], water) < clearanceM)) { ok = false; break }
      }
      if (ok) {
        for (const mountain of input.mountainRegions) {
          if (pointInPoly(wx, wy, mountain) || (clearanceM > 0 && distanceToPolygonBoundary([wx, wy], mountain) < clearanceM)) { ok = false; break }
        }
      }
      rowLegal.push(ok)
    }
    legal.push(rowLegal)
  }

  return { text: renderDotMatrixText(legal, rows, cols), spec, legal }
}

/** 格子中心 → 世界坐标（米）：第 row 行第 col 列格子中心 = origin + (col/row - 0.5) 格宽/高偏移。 */
export function gridToWorld(spec: DotMatrixSpec, row: number, col: number): MapPoint {
  return [
    spec.originX + (col - 0.5) * spec.cellM,
    spec.originY + (row - 0.5) * spec.cellM
  ]
}

/** 世界坐标 → 格子坐标（米→行列，四舍五入取最近格；是 gridToWorld 的反查，格子中心点往返一致）。 */
export function worldToGrid(spec: DotMatrixSpec, pt: MapPoint): [number, number] {
  const col = Math.round((pt[0] - spec.originX) / spec.cellM + 0.5)
  const row = Math.round((pt[1] - spec.originY) / spec.cellM + 0.5)
  return [row, col]
}

/** 两点间 Bresenham 整数格线（八方向连通，含起止点）。 */
function bresenhamLine(r0: number, c0: number, r1: number, c1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  let x0 = c0; let y0 = r0
  const dx = Math.abs(c1 - c0)
  const dy = -Math.abs(r1 - r0)
  const sx = c0 < c1 ? 1 : -1
  const sy = r0 < r1 ? 1 : -1
  let err = dx + dy
  // 步数硬顶：两点跨度的曼哈顿距离足够覆盖任何合法路径，防御性避免异常输入死循环。
  const maxSteps = Math.abs(c1 - c0) + Math.abs(r1 - r0) + 2
  for (let step = 0; step <= maxSteps; step++) {
    points.push([y0, x0])
    if (x0 === c1 && y0 === r1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  return points
}

/** 关键点笔画 → 光栅化格子序列（八方向连通、去重、保序）：关键点间逐段 Bresenham 连线再拼接。
 *  smooth 与 straight 在本层同样处理（圆润在展开层体现，见 mountainArmor.ts，不在格子层）。 */
export function rasterizeStroke(stroke: ArmorStroke): Array<[number, number]> {
  const pts = stroke.points
  if (pts.length === 0) return []
  const rounded = pts.map(([row, col]) => [Math.round(row), Math.round(col)] as [number, number])
  const out: Array<[number, number]> = [rounded[0]]
  for (let i = 1; i < rounded.length; i++) {
    const [r0, c0] = rounded[i - 1]
    const [r1, c1] = rounded[i]
    const seg = bresenhamLine(r0, c0, r1, c1)
    for (let j = 1; j < seg.length; j++) out.push(seg[j]) // seg[0] 与上一段终点重复，跳过
  }
  // 整体去重保序兜底（关键点本身重合/回头等边界情形）。
  const dedup: Array<[number, number]> = []
  for (const p of out) {
    const last = dedup[dedup.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) dedup.push(p)
  }
  return dedup
}

/** 校验笔画光栅化后是否全程落在合法格（越界 / 落在 `#` 都算 illegal）。只报不改——回执由调用方决定重试策略。 */
export function validateStrokeOnMatrix(stroke: ArmorStroke, projection: DotMatrixProjection): { ok: boolean; illegalCells: Array<[number, number]> } {
  const cells = rasterizeStroke(stroke)
  const illegalCells: Array<[number, number]> = []
  for (const [row, col] of cells) {
    if (row < 1 || row > projection.spec.rows || col < 1 || col > projection.spec.cols) {
      illegalCells.push([row, col])
      continue
    }
    if (!projection.legal[row - 1][col - 1]) illegalCells.push([row, col])
  }
  return { ok: illegalCells.length === 0, illegalCells }
}

/** 笔画关键点（不是光栅化后的密集格子）逐个转世界坐标——这是存进 meta.armor.skeleton 的真值
 *  （稀疏关键点，不是逐格坐标；展开层从这份骨架重新平滑/变宽，见 mountainArmor.ts）。 */
export function strokeToWorldSkeleton(stroke: ArmorStroke, spec: DotMatrixSpec): MapPoint[] {
  return stroke.points.map(([row, col]) => gridToWorld(spec, row, col))
}
