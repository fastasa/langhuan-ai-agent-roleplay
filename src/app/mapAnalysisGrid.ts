// 地图系统 · 分析网格纯函数库（地图分阶段作画与笔刷约束系统 · 批B · 2026-07-11）
//
// 矢量当真值、网格当分析层（GIS 标准做法）：本文件把矢量面按需栅格化成一张粗网格做水文/坡度计算索引，
// 算完即弃（或按 terrainRevision 做单槽会话 memo），网格本身永不入库、不是真值。
// 全部函数纯函数无副作用；只依赖 mapGeometry.ts 的类型与纯函数，不 import 工具层/组件层/服务端任何东西
// （批B 铁律：只建新文件，不碰任何既有文件，避免与并行批A撞车）。
//
// 链路：矢量面集合 → rasterizeElevation(栅格化) → fillDepressions(填洼) → computeFlow(D8流向+流量累积)
//      → validateRiverPath(拟画河流合法性) / roadCostTrial(道路坡度代价) / 桥接岸两原语。
// 算法来源：Barnes et al. 2014 Priority-Flood 填洼（Algorithm 2 骨架+ε 抬升）+ mewo2/terrain 的 D8
// downhill/getFlux 模式共用同一套网格分析真值。
// 附件 研究_02_水文地形算法.md 六/七节（含台阶状海拔场的七个坑与应对）。

import {
  bboxOf,
  pointInPoly,
  resolveElevationM,
  segmentsIntersect,
  shoelace,
  type MapBBox,
  type MapFeature,
  type MapPoint
} from './mapGeometry'

// ── 数据结构与参数表（研究_02 §6.0）─────────────────────────────────────────

/** 网格规格：n×n 格，(minX,minY) 为左上角原点，cellSize=坐标域跨度/n。
 *  必须是正方形格（宽高同一 cellSize）——D8 对角邻居距离按 √2 折算的前提就是格子是正方形，
 *  若宽高各配一个 cellSize 会得到矩形格，对角距离公式失真。 */
export type AnalysisGridSpec = {
  n: number
  minX: number
  minY: number
  cellSize: number
}

/** 地表类型：0=陆地；1=海；2=湖。海与湖在本文件全部算法（填洼种子/流向跳过/河流合法终点）里处理
 *  完全一致，区分只为语义清晰与未来湖泊出水口特化预留（研究_02 §7.1 坑6：湖也可能要求"必须有出水口"
 *  而非"入湖即合法"）；批B 不实现该区分的行为差异。 */
export type CellType = 0 | 1 | 2
export const CELL_LAND: CellType = 0
export const CELL_SEA: CellType = 1
export const CELL_LAKE: CellType = 2

/** 分析网格：矢量按需栅格化的产物，五场 TypedArray；不入库，算完即弃（可选单槽 memo，
 *  见 buildAnalysisGridMemoized）。 */
export type AnalysisGrid = {
  spec: AnalysisGridSpec
  /** 原始台阶海拔场（真值口径，米）。 */
  elev: Float32Array
  /** 填洼后海拔场：每格到海/湖/图缘都有一条 ε-下降路径，供流向/河流合法性判定使用。 */
  filled: Float32Array
  cellType: Uint8Array
  /** 下游格下标；填洼后陆地格恒 ≥0 或 -2（出图）；-1 只应残留在海/湖格上（未参与流向计算，
   *  陆地格出现 -1 视为 fillDepressions 有 bug，computeFlow 会直接抛错，不会把 -1 传出来）。 */
  flowDir: Int32Array
  /** 流量累积（单位=格数当量，每格初始 1 份"雨"，沿 flowDir 逐级向下游累加）。 */
  flux: Float32Array
}

/** 默认网格边长（研究_02 §6.0：默认 128；最窄关心要素 <2 格宽时调用方可自行传更大的 n 升到 256）。 */
export const DEFAULT_GRID_N = 128
/** 填洼微倾斜（米）。安全性论证见研究_02 §7.1 坑2：ε×最长传播路径(约 n×√2)在 n=256 时约 0.36 米，
 *  远小于要素间常见的台阶差（≥10 米量级，两个数量级隔离带，不会误放），也远大于 Float32 在千米级
 *  海拔上的精度（不会被舍入吃掉、不会"白加"）。与研究文档取值一致，未做偏离。 */
export const EPS_FILL = 1e-3
/** 无要素覆盖处的底海拔（视为海的背景值）；量纲对齐 elevationM 米制，取值低于 water 类目缺省海拔
 *  0 米，保证背景海与显式绘制的水域/陆地之间的高差方向始终正确。 */
export const SEA_BASE_ELEV = -50

/** 由包围盒+目标格数推导网格规格：cellSize 取"跨度较大一边/n"，保证正方形格能覆盖整个包围盒
 *（若宽高分别定 cellSize 会得到矩形格，破坏 D8 对角距离 √2 的前提，见 AnalysisGridSpec 注释）。 */
export function computeAnalysisGridSpec(bbox: MapBBox, n: number = DEFAULT_GRID_N): AnalysisGridSpec {
  const width = Math.max(1e-6, bbox.maxX - bbox.minX)
  const height = Math.max(1e-6, bbox.maxY - bbox.minY)
  const span = Math.max(width, height)
  const gridN = Math.max(1, Math.round(n))
  return { n: gridN, minX: bbox.minX, minY: bbox.minY, cellSize: span / gridN }
}

// ── 网格坐标/邻接内部辅助（不导出：纯粒度换算，供本文件各 Step 复用）───────────

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function colRowOf(index: number, spec: AnalysisGridSpec): [number, number] {
  const row = Math.floor(index / spec.n)
  return [index - row * spec.n, row]
}

function indexOfColRow(col: number, row: number, spec: AnalysisGridSpec): number {
  return row * spec.n + col
}

function isBorderIndex(index: number, spec: AnalysisGridSpec): boolean {
  const [col, row] = colRowOf(index, spec)
  return row === 0 || row === spec.n - 1 || col === 0 || col === spec.n - 1
}

function cellCenterOfColRow(col: number, row: number, spec: AnalysisGridSpec): MapPoint {
  return [spec.minX + (col + 0.5) * spec.cellSize, spec.minY + (row + 0.5) * spec.cellSize]
}

function cellCenterOfIndex(index: number, spec: AnalysisGridSpec): MapPoint {
  const [col, row] = colRowOf(index, spec)
  return cellCenterOfColRow(col, row, spec)
}

/** 点落在哪个格（越界钳位到最近边界格，不抛错——路径端点略微出界是正常输入）。 */
function cellIndexOfPoint(pt: MapPoint, spec: AnalysisGridSpec): number {
  const col = clampInt(Math.floor((pt[0] - spec.minX) / spec.cellSize), 0, spec.n - 1)
  const row = clampInt(Math.floor((pt[1] - spec.minY) / spec.cellSize), 0, spec.n - 1)
  return indexOfColRow(col, row, spec)
}

// 8 邻居方向表：[列偏移, 行偏移, 格数当量距离]（对角 √2）；乘 spec.cellSize 才是米制距离。
const NEIGHBOR_STEPS: Array<[number, number, number]> = [
  [-1, -1, Math.SQRT2], [0, -1, 1], [1, -1, Math.SQRT2],
  [-1, 0, 1], [1, 0, 1],
  [-1, 1, Math.SQRT2], [0, 1, 1], [1, 1, Math.SQRT2]
]

/** 8 连通邻居（越界方向跳过）。 */
function neighborsOf(index: number, spec: AnalysisGridSpec): Array<{ index: number; dist: number }> {
  const [col, row] = colRowOf(index, spec)
  const out: Array<{ index: number; dist: number }> = []
  for (const [dc, dr, dist] of NEIGHBOR_STEPS) {
    const nc = col + dc
    const nr = row + dr
    if (nc < 0 || nc >= spec.n || nr < 0 || nr >= spec.n) continue
    out.push({ index: indexOfColRow(nc, nr, spec), dist })
  }
  return out
}

/** 折线按固定步长稠密重采样（不闭合）：把每段按 ceil(段长/step) 等分，恒含全部原顶点。
 *  用于"防跳格漏检"（研究_02 §6.4）——大步长直接跳过折线段会漏掉中间格子的合法性判定。 */
function samplePolylineDense(pts: MapPoint[], step: number): MapPoint[] {
  if (pts.length === 0) return []
  if (pts.length === 1) return [pts[0]]
  const out: MapPoint[] = [pts[0]]
  const safeStep = Math.max(step, 1e-6)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    const steps = Math.max(1, Math.ceil(segLen / safeStep))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

function dedupeConsecutiveIndices(indices: number[]): number[] {
  const out: number[] = []
  for (const idx of indices) if (out.length === 0 || out[out.length - 1] !== idx) out.push(idx)
  return out
}

/** 折线下采样保留首尾端点（拒绝时的建议线太长时简化用；mapGeometry.ts 内有同名私有函数但未导出，
 *  这里各自维护一份——都是不到 10 行的纯几何小工具，非共享状态，重复成本可接受）。 */
function downsampleKeepEnds(pts: MapPoint[], target: number): MapPoint[] {
  if (pts.length <= target || target < 2) return pts
  const out: MapPoint[] = []
  for (let i = 0; i < target; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (target - 1))])
  return out
}

// ── Step A：栅格化海拔场（研究_02 §6.1）────────────────────────────────────

export type RasterizeElevationOptions = {
  /** 画序判定（"后烧者赢"）：数值越大越后画（越靠上层），同层多要素重叠时后画的覆盖先画的。
   *  缺省=先地形后人文、同层按有效海拔升序（高地形压低地形，天然嵌套的海拔面因此正确叠放）。 */
  paintOrderOf?: (feature: MapFeature) => number
  /** 地表类型判定：缺省 category==='water' 记海、其余记陆地——项目当前类目表（huiyuMapTools 的
   *  REGION_CATEGORIES）只有统一的 water、没有独立的 lake 类目；需要湖泊专属语义时由调用方传自定义
   *  判定（本模块所有算法对"海"与"湖"处理完全一致，见 CellType 注释）。 */
  cellTypeOf?: (feature: MapFeature) => CellType
  /** 窄长要素 ALL_TOUCHED 语义留参数位（研究_02 §6.1）：命中判定的要素改用"多边形碰到格子即算"，
   *  而非中心点采样，防止窄长要素（如山脊线 buffer 面）被规则网格的中心采样断裂。批B 暂无实际调用方
   *  传入该判定，先建参数位，批C/宏笔刷若需要再接。 */
  allTouchedOf?: (feature: MapFeature) => boolean
}

function defaultCellTypeOf(feature: MapFeature): CellType {
  return feature.category === 'water' ? CELL_SEA : CELL_LAND
}

function defaultPaintOrderOf(feature: MapFeature): number {
  const layerRank = feature.layer === 'terrain' ? 0 : 1
  // 同层按面积降序烧（大面积先烧、小面积后烧盖到上层）：小而具体的嵌套要素（湖泊/山体内核等）
  // 天然应该盖住大而笼统的底图要素，与海拔高低无关——水域几乎总比周边陆地海拔更低，若照搬研究
  // 文档字面的"同层按海拔升序"，水域会被更高的陆地背景整体盖掉（实测踩中的真实回归，见批B验收
  // spec"入湖过"/findContinuousWaterRuns 等用例）。地形阶段的递归拔升场景（批1 clipPolygonToParent）
  // 里更高的海拔面本就被裁得更小，面积序与海拔序在那个场景下结果一致，不牺牲原意图。
  const layerSeparator = 1e12
  return layerRank * layerSeparator - shoelace(feature.pts)
}

function cellRangeOfBBox(bbox: MapBBox, spec: AnalysisGridSpec): { c0: number; c1: number; r0: number; r1: number } {
  return {
    c0: clampInt(Math.floor((bbox.minX - spec.minX) / spec.cellSize), 0, spec.n - 1),
    c1: clampInt(Math.floor((bbox.maxX - spec.minX) / spec.cellSize), 0, spec.n - 1),
    r0: clampInt(Math.floor((bbox.minY - spec.minY) / spec.cellSize), 0, spec.n - 1),
    r1: clampInt(Math.floor((bbox.maxY - spec.minY) / spec.cellSize), 0, spec.n - 1)
  }
}

/** ALL_TOUCHED 命中判定：格子四角/中心任一在多边形内，或格子四条边任一与多边形边相交，即算"碰到"。 */
function cellTouchesPolygon(col: number, row: number, spec: AnalysisGridSpec, pts: MapPoint[]): boolean {
  const x0 = spec.minX + col * spec.cellSize
  const y0 = spec.minY + row * spec.cellSize
  const x1 = x0 + spec.cellSize
  const y1 = y0 + spec.cellSize
  const corners: MapPoint[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  for (const [cx, cy] of corners) if (pointInPoly(cx, cy, pts)) return true
  if (pointInPoly((x0 + x1) / 2, (y0 + y1) / 2, pts)) return true
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    if (
      segmentsIntersect(a, b, corners[0], corners[1]) ||
      segmentsIntersect(a, b, corners[1], corners[2]) ||
      segmentsIntersect(a, b, corners[2], corners[3]) ||
      segmentsIntersect(a, b, corners[3], corners[0])
    ) return true
  }
  return false
}

/** Step A：栅格化海拔场（研究_02 §6.1）。中心点采样+包围盒裁剪；"后烧者赢"按 paintOrderOf 排序后
 *  依次烧写；无要素覆盖处保留 SEA_BASE_ELEV/CELL_SEA 缺省背景（"无要素覆盖处=海"）。 */
export function rasterizeElevation(
  features: MapFeature[],
  spec: AnalysisGridSpec,
  opts: RasterizeElevationOptions = {}
): { elev: Float32Array; cellType: Uint8Array } {
  const n2 = spec.n * spec.n
  const elev = new Float32Array(n2).fill(SEA_BASE_ELEV)
  const cellType = new Uint8Array(n2).fill(CELL_SEA)
  const cellTypeOf = opts.cellTypeOf ?? defaultCellTypeOf
  const paintOrderOf = opts.paintOrderOf ?? defaultPaintOrderOf
  const allTouchedOf = opts.allTouchedOf
  const regions = features.filter((f) => f.kind === 'region' && Array.isArray(f.pts) && f.pts.length >= 3)
  const ordered = [...regions].sort((a, b) => paintOrderOf(a) - paintOrderOf(b))

  for (const f of ordered) {
    const elevM = resolveElevationM(f.category, f.elevationM)
    const regionCellType = cellTypeOf(f)
    const allTouched = allTouchedOf ? allTouchedOf(f) : false
    const { c0, c1, r0, r1 } = cellRangeOfBBox(bboxOf(f.pts), spec)
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        let hit: boolean
        if (allTouched) {
          hit = cellTouchesPolygon(col, row, spec, f.pts)
        } else {
          const [cx, cy] = cellCenterOfColRow(col, row, spec)
          hit = pointInPoly(cx, cy, f.pts)
        }
        if (!hit) continue
        const idx = indexOfColRow(col, row, spec)
        elev[idx] = elevM
        cellType[idx] = regionCellType
      }
    }
  }
  return { elev, cellType }
}

// ── Step B：填洼（研究_02 §6.2，Barnes Algorithm 2 骨架 + ε 抬升）───────────

/** 内部：最小二叉堆（填洼/道路代价试算共用的优先队列，双扁平数组实现，不引入外部依赖，约 30 行）。 */
class MinIndexHeap {
  private readonly idx: number[] = []
  private readonly pri: number[] = []

  get length(): number {
    return this.idx.length
  }

  push(index: number, priority: number): void {
    this.idx.push(index)
    this.pri.push(priority)
    let i = this.idx.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.pri[parent] <= this.pri[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): number {
    const top = this.idx[0]
    const lastI = this.idx.length - 1
    this.idx[0] = this.idx[lastI]
    this.pri[0] = this.pri[lastI]
    this.idx.pop()
    this.pri.pop()
    let i = 0
    const len = this.idx.length
    for (;;) {
      const l = i * 2 + 1
      const r = i * 2 + 2
      let smallest = i
      if (l < len && this.pri[l] < this.pri[smallest]) smallest = l
      if (r < len && this.pri[r] < this.pri[smallest]) smallest = r
      if (smallest === i) break
      this.swap(smallest, i)
      i = smallest
    }
    return top
  }

  private swap(a: number, b: number): void {
    const ti = this.idx[a]; this.idx[a] = this.idx[b]; this.idx[b] = ti
    const tp = this.pri[a]; this.pri[a] = this.pri[b]; this.pri[b] = tp
  }
}

/** Step B：填洼（研究_02 §6.2）。种子=海格+湖格+图缘（不论陆地还是水面，图缘格一律直接当种子——
 *  地图边缘视为"可以流出图外"）；普通队列 pit 用头指针数组模拟（只 push 不 shift，避免 O(n) 搬移，
 *  Azgaar 同款手法）。 */
export function fillDepressions(elev: Float32Array, cellType: Uint8Array, spec: AnalysisGridSpec): Float32Array {
  const filled = Float32Array.from(elev)
  const n2 = filled.length
  const closed = new Uint8Array(n2)
  const open = new MinIndexHeap()
  const pit: number[] = []
  let pitHead = 0

  for (let i = 0; i < n2; i++) {
    if (cellType[i] !== CELL_LAND || isBorderIndex(i, spec)) {
      open.push(i, filled[i])
      closed[i] = 1
    }
  }
  while (open.length > 0 || pitHead < pit.length) {
    const c = pitHead < pit.length ? pit[pitHead++] : open.pop()
    for (const { index: nb } of neighborsOf(c, spec)) {
      if (closed[nb]) continue
      closed[nb] = 1
      if (filled[nb] <= filled[c] + EPS_FILL) {
        filled[nb] = filled[c] + EPS_FILL
        pit.push(nb)
      } else {
        open.push(nb, filled[nb])
      }
    }
  }
  return filled
}

// ── Step C：D8 流向 + 流量累积（研究_02 §6.3）───────────────────────────────

/** Step C：D8 流向+流量累积（研究_02 §6.3，mewo2 downhill/getFlux 模式的规则网格版，对角距离除 √2）。
 *  填洼后陆地格必须能找到严格更低的邻居（或身处图缘可直接出图）；找不到即视为 fillDepressions 有 bug，
 *  直接抛错（断言）——不静默吞掉 -1，防止坏数据流入河流/道路合法性判定。 */
export function computeFlow(filled: Float32Array, cellType: Uint8Array, spec: AnalysisGridSpec): { flowDir: Int32Array; flux: Float32Array } {
  const n2 = filled.length
  const flowDir = new Int32Array(n2).fill(-1)

  for (let i = 0; i < n2; i++) {
    if (cellType[i] !== CELL_LAND) continue
    let best = -1
    let bestSlope = 0
    for (const { index: nb, dist } of neighborsOf(i, spec)) {
      const slope = (filled[i] - filled[nb]) / dist
      if (slope > bestSlope) { bestSlope = slope; best = nb }
    }
    if (best >= 0) {
      flowDir[i] = best
    } else if (isBorderIndex(i, spec)) {
      flowDir[i] = -2
    } else {
      const [col, row] = colRowOf(i, spec)
      throw new Error(`computeFlow: 内陆格(col=${col},row=${row})填洼后仍无下游，说明 fillDepressions 有 bug（断言失败）`)
    }
  }

  const flux = new Float32Array(n2).fill(1)
  const idxs = Array.from(flowDir.keys()).sort((a, b) => filled[b] - filled[a])
  for (const i of idxs) if (flowDir[i] >= 0) flux[flowDir[i]] += flux[i]
  return { flowDir, flux }
}

// ── Step D：拟画河流合法性判定（研究_02 §6.4）───────────────────────────────

export type RiverProblemKind = 'uphill' | 'bad-terminus' | 'dry-source' | 'off-grid'

export type RiverProblem = {
  kind: RiverProblemKind
  at: { x: number; y: number }
  detailM?: number
}

export type RiverCheckResult = {
  ok: boolean
  problems: RiverProblem[]
  /** 拒绝时给的合法参考中心线：从源头（路径起点）沿 flowDir 走到入海/湖/图缘，下采样简化（≤12 点）。 */
  suggestion?: MapPoint[]
  /** 语义位（研究_02 §6.4）：仅在出现 bad-terminus 问题时置真，提示调用方可以展示"或可将终点改为
   *  内流湖"的备选修复话术；本模块不判断该建议是否地理合理，只给旗标，具体话术由上层（回执模板/知识库）
   *  决定。 */
  allowInlandLakeTerminus?: boolean
}

export type ValidateRiverPathOptions = {
  /** 单调不升容差（米），吸收栅格化锯齿；缺省 0.5 米——真违规（整级台阶差通常 ≥10 米量级）与容差
   *  隔两个数量级，不会漏判也不会误判。 */
  upTolM?: number
}

/** Step D：拟画河流合法性判定（研究_02 §6.4，本链路的目的地）。折线按 cellSize/2 重采样防跳格；
 *  终点合法=最后一格已在海/湖，或其 flowDir 一步可达海/湖，或直接出图；沿线用【填洼后场】判单调不升。 */
export function validateRiverPath(pathPts: MapPoint[], grid: AnalysisGrid, opt: ValidateRiverPathOptions = {}): RiverCheckResult {
  const upTolM = opt.upTolM ?? 0.5
  if (!pathPts || pathPts.length < 2) {
    const at = pathPts && pathPts[0] ? { x: pathPts[0][0], y: pathPts[0][1] } : { x: 0, y: 0 }
    return { ok: false, problems: [{ kind: 'off-grid', at }] }
  }

  const sampled = samplePolylineDense(pathPts, grid.spec.cellSize / 2)
  const cellsSeq = dedupeConsecutiveIndices(sampled.map((p) => cellIndexOfPoint(p, grid.spec)))
  const problems: RiverProblem[] = []

  const last = cellsSeq[cellsSeq.length - 1]
  const terminusOk =
    grid.cellType[last] !== CELL_LAND ||
    grid.flowDir[last] === -2 ||
    (grid.flowDir[last] >= 0 && grid.cellType[grid.flowDir[last]] !== CELL_LAND)
  if (!terminusOk) {
    const [x, y] = cellCenterOfIndex(last, grid.spec)
    problems.push({ kind: 'bad-terminus', at: { x, y } })
  }

  for (let k = 1; k < cellsSeq.length; k++) {
    const rise = grid.filled[cellsSeq[k]] - grid.filled[cellsSeq[k - 1]]
    if (rise > upTolM) {
      const [x, y] = cellCenterOfIndex(cellsSeq[k], grid.spec)
      problems.push({ kind: 'uphill', at: { x, y }, detailM: Math.round(rise * 10) / 10 })
    }
  }

  if (problems.length === 0) return { ok: true, problems: [] }

  // 拒绝时给建议：从拟画源头（路径起点）出发沿 flowDir 走到底，下采样成折线返回。
  const sug: MapPoint[] = []
  const guard = grid.spec.n * 4
  let c = cellsSeq[0]
  for (let step = 0; c >= 0 && step < guard; step++) {
    sug.push(cellCenterOfIndex(c, grid.spec))
    if (grid.cellType[c] !== CELL_LAND) break
    c = grid.flowDir[c]
  }
  return {
    ok: false,
    problems,
    suggestion: downsampleKeepEnds(sug, 12),
    allowInlandLakeTerminus: problems.some((p) => p.kind === 'bad-terminus')
  }
}

// ── Step E：道路坡度/水体代价试算（研究_02 §6.5）────────────────────────────

export type RoadCostTrialOptions = {
  /** 坡度平方惩罚系数（缺省 20）：额外代价倍率 = slopePenaltyK × 坡度比²。 */
  slopePenaltyK?: number
  /** 坡度硬上限（Δ海拔/水平距离，超过即视为不可通行=Infinity；缺省 1.5，即 150%）——仅作越界兜底，
   *  普通道路应远早于此就被 slopePenaltyK 的平方惩罚劝退到绕路。 */
  maxGradeRatio?: number
  /** 是否允许穿越水体（架桥）；缺省不允许=水体直接不可通行。 */
  allowWaterCrossing?: boolean
  /** 架桥每米代价倍率（缺省 6：同距离陆地的 6 倍，体现造桥成本），allowWaterCrossing=true 时生效。 */
  bridgeCostPerM?: number
  /** 转弯惩罚（缺省=cellSize×0.15）：按"进入当前格的方向"与"离开方向"是否变化判定，命中即加一次。
   *  这是常见网格寻路里的轻量近似（真正的转弯感知最短路需要把方向也编进搜索状态），量级刻意压低，
   *  不足以掩盖坡度/水体代价的真实差异，只用于抑制不必要的锯齿走位。 */
  turnPenalty?: number
}

export type RoadCostTrialResult = {
  ok: boolean
  /** 最优折线（事后视线拉直去锯齿，起止点替换为调用方原始给定坐标）。仅 ok=true 时给出。 */
  path?: MapPoint[]
  totalCost?: number
  /** 沿途最陡坡（Δ海拔/水平距离），只统计陆地-陆地步进（跨水步进不计入坡度）。 */
  maxGradeRatio?: number
}

function stepDistBetween(a: number, b: number, spec: AnalysisGridSpec): number {
  const [ca, ra] = colRowOf(a, spec)
  const [cb, rb] = colRowOf(b, spec)
  const diag = Math.abs(ca - cb) === 1 && Math.abs(ra - rb) === 1
  return (diag ? Math.SQRT2 : 1) * spec.cellSize
}

/** 三格是否发生转向（方向用列/行的离散增量比较，8 方向恰好各自唯一）。 */
function turnedAt(prevIdx: number, curIdx: number, nextIdx: number, spec: AnalysisGridSpec): boolean {
  const [c0, r0] = colRowOf(prevIdx, spec)
  const [c1, r1] = colRowOf(curIdx, spec)
  const [c2, r2] = colRowOf(nextIdx, spec)
  return c1 - c0 !== c2 - c1 || r1 - r0 !== r2 - r1
}

/** 事后视线拉直（string pulling）：能直连就跳过中间点；但直连段仍要重过水体/坡度合法性检查，
 *  不能为了拉直路线而抄近路穿过原路径特意绕开的障碍。 */
function stringPullPath(path: MapPoint[], grid: AnalysisGrid, allowWaterCrossing: boolean, maxGradeRatio: number): MapPoint[] {
  if (path.length <= 2) return path
  const step = grid.spec.cellSize / 2
  const segmentOk = (a: MapPoint, b: MapPoint): boolean => {
    const samples = samplePolylineDense([a, b], step)
    for (let i = 0; i < samples.length; i++) {
      const idx = cellIndexOfPoint(samples[i], grid.spec)
      if (grid.cellType[idx] !== CELL_LAND) {
        if (!allowWaterCrossing) return false
        continue
      }
      if (i > 0) {
        const prevIdx = cellIndexOfPoint(samples[i - 1], grid.spec)
        if (grid.cellType[prevIdx] !== CELL_LAND) continue
        const segDist = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]) || 1e-6
        const gradeRatio = Math.abs(grid.filled[idx] - grid.filled[prevIdx]) / segDist
        if (gradeRatio > maxGradeRatio) return false
      }
    }
    return true
  }
  const out: MapPoint[] = [path[0]]
  let anchor = 0
  for (let i = 2; i < path.length; i++) {
    if (!segmentOk(path[anchor], path[i])) {
      out.push(path[i - 1])
      anchor = i - 1
    }
  }
  out.push(path[path.length - 1])
  return out
}

/** Step E：道路坡度/水体代价试算（研究_02 §6.5，画路前的同款硬门）。8 连通网格 Dijkstra：坡度平方
 *  惩罚+阈值外无穷、水体默认不可通行（可选架桥常数）、转弯小惩罚；成功后事后视线拉直去锯齿。
 *  用【填洼后场】判坡度（与 validateRiverPath 同一口径）。 */
export function roadCostTrial(fromPt: MapPoint, toPt: MapPoint, grid: AnalysisGrid, opt: RoadCostTrialOptions = {}): RoadCostTrialResult {
  const slopePenaltyK = opt.slopePenaltyK ?? 20
  const maxGradeRatio = opt.maxGradeRatio ?? 1.5
  const allowWaterCrossing = opt.allowWaterCrossing ?? false
  const bridgeCostPerM = opt.bridgeCostPerM ?? 6
  const turnPenalty = opt.turnPenalty ?? grid.spec.cellSize * 0.15

  const startIdx = cellIndexOfPoint(fromPt, grid.spec)
  const goalIdx = cellIndexOfPoint(toPt, grid.spec)
  if (startIdx === goalIdx) return { ok: true, path: [fromPt, toPt], totalCost: 0, maxGradeRatio: 0 }

  const n2 = grid.filled.length
  const dist = new Float64Array(n2).fill(Infinity)
  const prev = new Int32Array(n2).fill(-1)
  const visited = new Uint8Array(n2)
  dist[startIdx] = 0
  const open = new MinIndexHeap()
  open.push(startIdx, 0)

  while (open.length > 0) {
    const u = open.pop()
    if (visited[u]) continue
    visited[u] = 1
    if (u === goalIdx) break
    for (const { index: v, dist: stepDist } of neighborsOf(u, grid.spec)) {
      if (visited[v]) continue
      const cellDist = stepDist * grid.spec.cellSize
      let stepCost: number
      if (grid.cellType[v] !== CELL_LAND) {
        if (!allowWaterCrossing) continue
        stepCost = cellDist * bridgeCostPerM
      } else {
        const gradeRatio = Math.abs(grid.filled[v] - grid.filled[u]) / cellDist
        if (gradeRatio > maxGradeRatio) continue
        stepCost = cellDist * (1 + slopePenaltyK * gradeRatio * gradeRatio)
      }
      if (prev[u] >= 0 && turnedAt(prev[u], u, v, grid.spec)) stepCost += turnPenalty
      const nd = dist[u] + stepCost
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
        open.push(v, nd)
      }
    }
  }

  if (dist[goalIdx] === Infinity) return { ok: false }

  const idxChain: number[] = [goalIdx]
  for (let cur = goalIdx, guard = 0; cur !== startIdx && guard < n2 + 8; guard++) {
    cur = prev[cur]
    idxChain.push(cur)
  }
  idxChain.reverse()

  let maxGrade = 0
  for (let i = 1; i < idxChain.length; i++) {
    const a = idxChain[i - 1]
    const b = idxChain[i]
    if (grid.cellType[a] !== CELL_LAND || grid.cellType[b] !== CELL_LAND) continue
    const cellDist = stepDistBetween(a, b, grid.spec)
    maxGrade = Math.max(maxGrade, Math.abs(grid.filled[b] - grid.filled[a]) / cellDist)
  }

  const rawPath = idxChain.map((idx) => cellCenterOfIndex(idx, grid.spec))
  rawPath[0] = fromPt
  rawPath[rawPath.length - 1] = toPt
  const path = stringPullPath(rawPath, grid, allowWaterCrossing, maxGradeRatio)
  return { ok: true, path, totalCost: dist[goalIdx], maxGradeRatio: maxGrade }
}

// ── Step F：海拔剖面采样 + 路径滑动窗口坡度判定（批C·水文坡度接线）──────────

export type ElevationProfilePoint = { x: number; y: number; elevM: number }

/** 海拔剖面采样（批C·featuresAlong 查询工具用）：沿路径按 cellSize 稠密重采样后查【填洼后场】，
 *  下采样到 ≤maxPoints 个代表点（保留首尾）返回——给模型一份可读的高程走势，不需要贴合每一格的
 *  判定精度（那是 validateRiverPath/validatePathGrade 的职责）。 */
export function sampleElevationProfile(pathPts: MapPoint[], grid: AnalysisGrid, maxPoints = 12): ElevationProfilePoint[] {
  if (!pathPts || pathPts.length === 0) return []
  if (pathPts.length === 1) {
    const idx = cellIndexOfPoint(pathPts[0], grid.spec)
    return [{ x: pathPts[0][0], y: pathPts[0][1], elevM: Math.round(grid.filled[idx] * 10) / 10 }]
  }
  const dense = samplePolylineDense(pathPts, grid.spec.cellSize)
  const downsampled = downsampleKeepEnds(dense, maxPoints)
  return downsampled.map(([x, y]) => {
    const idx = cellIndexOfPoint([x, y], grid.spec)
    return { x, y, elevM: Math.round(grid.filled[idx] * 10) / 10 }
  })
}

export type GradeCheckProblem = { at: { x: number; y: number }; gradeRatio: number; windowM: number }

export type GradeCheckResult = {
  ok: boolean
  /** 全线滑动窗口坡度比的最大值（不论是否超限都给，供分档体检复用）。 */
  maxGradeRatio: number
  /** 超过 hardMaxRatio 的窗口位置（ok=false 时非空）。 */
  problems: GradeCheckProblem[]
}

export type ValidatePathGradeOptions = {
  /** 坡度比硬上限（缺省 Infinity=不拒绝，只求 maxGradeRatio 供体检分档用）。 */
  hardMaxRatio?: number
  /** 滑动窗口水平跨度（米·缺省 max(2×cellSize, 500)）：每个采样点与"窗口跨度之外最近的更早采样点"
   *  比落差——不比相邻两格，防止台阶状海拔场里单格边界（如 mountain 直接贴 plain）产生的假性悬崖被
   *  当成"路径本身的坡度"（研究_02 台阶场坑3 的路径版）；路径本身短于窗口时退化为"当前点与起点"比较。 */
  windowM?: number
}

/** Step F：路径滑动窗口坡度判定（画路/画运河前的硬门同款算法）。用【填洼后场】沿路径稠密采样，每点与
 *  其"至少 windowM 之前"的采样点比落差得到坡度比；超 hardMaxRatio 即记为问题（硬门据此拒绝），
 *  始终返回全线 maxGradeRatio（体检分档巡检据此判定是否进入 gradeBands 高档，不需要拒绝语义）。 */
export function validatePathGrade(pathPts: MapPoint[], grid: AnalysisGrid, opt: ValidatePathGradeOptions = {}): GradeCheckResult {
  const hardMaxRatio = opt.hardMaxRatio ?? Infinity
  const windowM = Math.max(1, opt.windowM ?? Math.max(2 * grid.spec.cellSize, 500))
  if (!pathPts || pathPts.length < 2) return { ok: true, maxGradeRatio: 0, problems: [] }

  const sampled = samplePolylineDense(pathPts, grid.spec.cellSize / 2)
  const cum: number[] = [0]
  for (let i = 1; i < sampled.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(sampled[i][0] - sampled[i - 1][0], sampled[i][1] - sampled[i - 1][1]))
  }
  const elevs = sampled.map((p) => grid.filled[cellIndexOfPoint(p, grid.spec)])

  let maxGradeRatio = 0
  const problems: GradeCheckProblem[] = []
  let back = 0
  for (let i = 0; i < sampled.length; i++) {
    while (back < i && cum[i] - cum[back] > windowM) back++
    // 路径尚短于一个窗口跨度时退化为"当前点 vs 起点"（back 恒为 0，天然满足）。
    const refIdx = cum[i] - cum[0] < windowM ? 0 : back
    const refSpan = Math.max(cum[i] - cum[refIdx], grid.spec.cellSize)
    const ratio = Math.abs(elevs[i] - elevs[refIdx]) / refSpan
    if (ratio > maxGradeRatio) maxGradeRatio = ratio
    if (ratio > hardMaxRatio) {
      problems.push({ at: { x: sampled[i][0], y: sampled[i][1] }, gradeRatio: ratio, windowM: refSpan })
    }
  }
  return { ok: problems.length === 0, maxGradeRatio, problems }
}

// ── 桥接岸两原语（研究_03 §7.2）─────────────────────────────────────────────

export type WaterRun = {
  /** 该水体区段在重采样点序列里的起止下标（含端点）。 */
  startIndex: number
  endIndex: number
  from: MapPoint
  to: MapPoint
}

/** 路径上的连续水体区段：按 cellSize/2 重采样后找 cellType!==land 的连续片段，用于"这条路/桥跨了
 *  几段水"的判定与建桥端点参考（研究_03 §7.2 桥接岸原语之一）。 */
export function findContinuousWaterRuns(pathPts: MapPoint[], grid: AnalysisGrid): WaterRun[] {
  if (!pathPts || pathPts.length < 2) return []
  const sampled = samplePolylineDense(pathPts, grid.spec.cellSize / 2)
  const runs: WaterRun[] = []
  let runStart = -1
  for (let i = 0; i < sampled.length; i++) {
    const idx = cellIndexOfPoint(sampled[i], grid.spec)
    const isWater = grid.cellType[idx] !== CELL_LAND
    if (isWater && runStart < 0) runStart = i
    if (!isWater && runStart >= 0) {
      runs.push({ startIndex: runStart, endIndex: i - 1, from: sampled[runStart], to: sampled[i - 1] })
      runStart = -1
    }
  }
  if (runStart >= 0) {
    runs.push({ startIndex: runStart, endIndex: sampled.length - 1, from: sampled[runStart], to: sampled[sampled.length - 1] })
  }
  return runs
}

export type FindNearestLegalBankOptions = {
  /** 接岸点局部坡度上限（缺省 0.35）：候选陆地格相对其陆地邻居的局部坡度超过此值视为不合法（防止把
   *  桥接到悬崖峭壁上）。 */
  maxGradeRatio?: number
  /** 最大搜索环数（缺省=n/4）：超出仍未找到视为找不到合法接岸点。 */
  maxSearchRings?: number
}

export type FindNearestLegalBankResult = {
  found: boolean
  point?: MapPoint
  distanceM?: number
  gradeRatio?: number
}

/** 局部接岸坡度（批C 语义修正）：候选陆地格与其 8 邻居中"同为陆地"的邻居之间的最大坡度（filled 场
 *  落差/格心距离）——只比较陆地邻居，不比较候选格到"水体起点"的落差。旧版把"水面到岸"的高差当坡度，
 *  在台阶状海拔场（水域与陆地本就是两个不同基准海拔，如 water=0m/plain=80m）里会把完全平坦、正常可
 *  接岸的岸线误判成陡坡拒绝（星依审查批B 发现，2026-07-11）；改成"岸格自身局部起不起伏"才是物理上
 *  正确的"能不能安全落桥墩"判据。没有陆地邻居（孤立单格陆地被水包围）时记 0——邻居不足以评估局部
 *  地势时不应因此误拒。 */
function localLandGradeRatio(index: number, grid: AnalysisGrid): number {
  let maxRatio = 0
  for (const { index: nb, dist } of neighborsOf(index, grid.spec)) {
    if (grid.cellType[nb] !== CELL_LAND) continue
    const cellDist = dist * grid.spec.cellSize
    const ratio = Math.abs(grid.filled[index] - grid.filled[nb]) / cellDist
    if (ratio > maxRatio) maxRatio = ratio
  }
  return maxRatio
}

/** 水体端向陆地局部搜索最近合法接岸点（研究_03 §7.2）：以 fromPt 所在格为中心按 Chebyshev 环逐圈
 *  外扩，候选=非水格且局部接岸坡度不超限；命中环内按欧氏距离取最近一个，不再继续扩更远的环
 *（"最近"取的是命中的第一个合法环内最近点，非全局严格最近——局部搜索的常见近似，足够本用途）。 */
export function findNearestLegalBank(fromPt: MapPoint, grid: AnalysisGrid, opt: FindNearestLegalBankOptions = {}): FindNearestLegalBankResult {
  const maxGradeRatio = opt.maxGradeRatio ?? 0.35
  const maxRing = Math.max(1, opt.maxSearchRings ?? Math.ceil(grid.spec.n / 4))
  const originIndex = cellIndexOfPoint(fromPt, grid.spec)
  const [originCol, originRow] = colRowOf(originIndex, grid.spec)

  for (let ring = 1; ring <= maxRing; ring++) {
    let best: FindNearestLegalBankResult = { found: false }
    let bestDist = Infinity
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
        const col = originCol + dc
        const row = originRow + dr
        if (col < 0 || col >= grid.spec.n || row < 0 || row >= grid.spec.n) continue
        const idx = indexOfColRow(col, row, grid.spec)
        if (grid.cellType[idx] !== CELL_LAND) continue
        const center = cellCenterOfColRow(col, row, grid.spec)
        const distanceM = Math.hypot(center[0] - fromPt[0], center[1] - fromPt[1])
        const gradeRatio = localLandGradeRatio(idx, grid)
        if (gradeRatio > maxGradeRatio) continue
        if (distanceM < bestDist) {
          bestDist = distanceM
          best = { found: true, point: center, distanceM, gradeRatio }
        }
      }
    }
    if (best.found) return best
  }
  return { found: false }
}

// ── Step G：下游追踪原语（批E·宏笔刷·mapMacroBrushes.ts 消费）──────────────

/** 从给定点出发，沿【填洼后场】flowDir 逐格下降直到出海/出湖/出图（或步数耗尽），返回途经格心坐标折线
 *  （首点原样替换为 fromPt，其余为格心坐标）。算法与 validateRiverPath 拒绝分支内部的"D8 建议线"生成逻辑
 *  同构（那里只在拒绝时才走这条旁路、且不导出）——这里独立导出成正式生成入口：宏笔刷"干流沿 D8 建议线走向"
 *  的构造性合法依据（全程沿 flowDir 单调不升，填洼保证不会中途遇到洼地；只要终点确实落到非陆地格或出图，
 *  过 validateRiverPath 检查必然通过）。未跨文件复用 validateRiverPath 内部循环——同一份约 8 行的纯几何
 *  小逻辑两处独立维护，重复成本可接受（同本文件 downsampleKeepEnds 相对 mapGeometry.ts 同名私有函数的既有
 *  先例）。fromPt 落在非陆地格（源头选在水域/湖泊内）时返回长度 1 的退化结果，调用方应视为"无法取源"。 */
export function traceFlowDownhill(fromPt: MapPoint, grid: AnalysisGrid, maxSteps?: number): MapPoint[] {
  const guard = Math.max(1, maxSteps ?? grid.spec.n * 4)
  const out: MapPoint[] = []
  let c = cellIndexOfPoint(fromPt, grid.spec)
  for (let step = 0; c >= 0 && step < guard; step++) {
    out.push(cellCenterOfIndex(c, grid.spec))
    if (grid.cellType[c] !== CELL_LAND) break
    c = grid.flowDir[c]
  }
  if (out.length) out[0] = [fromPt[0], fromPt[1]]
  return out
}

// ── 全链装配（研究_02 §6.6）─────────────────────────────────────────────────

/** 全链装配：栅格化→填洼→流向/流量。默认用法="算完即弃"（不缓存）；128² 全链预期 <10ms、
 *  256² <40ms（研究_02 §6.6 量级估算），这是"算完即弃"策略能成立的成本前提（§7.2）。 */
export function buildAnalysisGrid(features: MapFeature[], spec: AnalysisGridSpec, opts?: RasterizeElevationOptions): AnalysisGrid {
  const { elev, cellType } = rasterizeElevation(features, spec, opts)
  const filled = fillDepressions(elev, cellType, spec)
  const { flowDir, flux } = computeFlow(filled, cellType, spec)
  return { spec, elev, filled, cellType, flowDir, flux }
}

/** 单槽会话 memo 的 key：mapId+地形写版本号+格数。批C 接线时在地图要素写路径递增 terrainRevision，
 *  地形没变则命中直接复用，不重算（研究_02 §7.2：地形阶段封笔后 terrainRevision 冻结，绘舆 loop
 *  连续校验多条河，单槽命中率趋近 100%）。 */
export type AnalysisGridMemoKey = {
  mapId: string
  terrainRevision: number
  n: number
}

let memoSlot: { key: AnalysisGridMemoKey; grid: AnalysisGrid } | null = null

function sameMemoKey(a: AnalysisGridMemoKey, b: AnalysisGridMemoKey): boolean {
  return a.mapId === b.mapId && a.terrainRevision === b.terrainRevision && a.n === b.n
}

/** buildAnalysisGrid 的可选缓存包装：命中同 key（mapId+terrainRevision+n）直接复用，不重算。容量=1。
 *  不是默认路径——默认仍是直接调用 buildAnalysisGrid（算完即弃），这里是留给调用方的显式优化开关。 */
export function buildAnalysisGridMemoized(
  key: AnalysisGridMemoKey,
  features: MapFeature[],
  spec: AnalysisGridSpec,
  opts?: RasterizeElevationOptions
): AnalysisGrid {
  if (memoSlot && sameMemoKey(memoSlot.key, key)) return memoSlot.grid
  const grid = buildAnalysisGrid(features, spec, opts)
  memoSlot = { key, grid }
  return grid
}

/** 清空单槽 memo（主要供测试隔离用；正式调用方一般靠 terrainRevision 变化自然失效，不需要手动清）。 */
export function clearAnalysisGridMemo(): void {
  memoSlot = null
}
