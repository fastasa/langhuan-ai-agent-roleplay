// 装甲地图系统 · 山脉装甲展开（批A1·2026-07-13 装甲地图系统计划书，参数按用户 07-13 二次拍板修订）
// 展开层：纯函数 expandMountainArmor(skeleton, params, seed) → { features }，同输入恒同输出
// （全程只用 mulberry32(seed) 取随机，禁止 Math.random/Date.now），是编辑/重生成/调参的自由基础。
// 参数设计依据：全部从"俯视地图上能看到的形态"倒推——陡度=色带密度、嶙峋度=轮廓质感、不对称=单面山；
// 模型/用户大多不填，缺省由 seed 在合理范围随机（逐字段语义见 types.ts MountainArmorParams）。
// 步骤：补参 → Catmull-Rom 点列平滑脊线（自实现采样，非 mapGeometry.catmullRomOpen 的字符串版）→
// 沿脊线变宽基座（端部收窄 taper + 层收缩 + 左右偏置 + 嶶峋噪声）→ 2~3 层海拔嵌套（一次生成，非旧"一层层垒"）。

import { mulberry32, pathLength } from '../mapGeometry'
import type { MapPoint } from '../mapGeometry'
import type { ArmorExpansion, ArmorFeatureDraft, MountainArmorParams } from './types'

const PEAK_ELEVATION_RANGE: [number, number] = [800, 2500]
const BASE_WIDTH_RATIO_RANGE: [number, number] = [0.15, 0.25]
const DEFAULT_STEEPNESS = 0.5
const DEFAULT_RUGGEDNESS = 0.5
const DEFAULT_ASYMMETRY = 0
/** 层数按海拔推导阈值（米）：峰值海拔低于此值取 2 层嵌套，否则取 3 层（用户 07-13 二次拍板，替代原"按脊线长"口径）。 */
const LAYERS_BY_ELEVATION_THRESHOLD_M = 1200

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)) }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

/** 两端收窄曲线：两端 25% 弧长内从 0.3 线性升到 1，中段（25%~75%）满宽 1。t∈[0,1] 为沿脊线弧长比例（局部，
 *  相对当前这一层所用的子段自身，不是相对整条脊线）。 */
function taper(t: number): number {
  if (t < 0.25) return 0.3 + 0.7 * (t / 0.25)
  if (t > 0.75) return 0.3 + 0.7 * ((1 - t) / 0.25)
  return 1
}

/** 层收缩系数：layer0（基座）恒 1；layer1/layer2 随 steepness 收紧（陡度越高内层越贴脊线，色带越窄密）。 */
function layerShrink(layerIndex: 0 | 1 | 2, steepness: number): number {
  if (layerIndex === 0) return 1
  if (layerIndex === 1) return lerp(0.75, 0.45, steepness)
  return lerp(0.5, 0.2, steepness)
}

/** 标准 Catmull-Rom 样条求值（均匀参数化）：p1→p2 段上 t∈[0,1] 处的点，p0/p3 为前后邻点决定切线。
 *  与 mapGeometry.ts 的 cSeg（Catmull-Rom→Bezier 转换，只出 SVG path 字符串）同源公式，这里另写点列版
 *  是因为装甲展开需要点列做后续沿脊偏移，字符串没法用。 */
function catmullRomPoint(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, t: number): MapPoint {
  const t2 = t * t
  const t3 = t2 * t
  const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
  const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  return [x, y]
}

/** 骨架关键点 → 平滑点列。每段按长度取样 6~10 个插值点（约每 400m 一采样点，钳位区间）；
 *  骨架只有 2 点时退化为直线采样（固定 8 点含端点，无法定义 Catmull-Rom 所需的前后邻点）。 */
export function sampleSmoothArmorSkeleton(skeleton: MapPoint[]): MapPoint[] {
  const n = skeleton.length
  if (n < 2) throw new Error('sampleSmoothRidge: 骨架至少需要 2 个点')
  if (n === 2) {
    const [a, b] = skeleton
    const samples = 8
    const out: MapPoint[] = []
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    return out
  }
  const out: MapPoint[] = [skeleton[0]]
  for (let i = 0; i < n - 1; i++) {
    const p0 = skeleton[Math.max(0, i - 1)]
    const p1 = skeleton[i]
    const p2 = skeleton[i + 1]
    const p3 = skeleton[Math.min(n - 1, i + 2)]
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const samples = Math.max(6, Math.min(10, Math.round(segLen / 400) || 6))
    for (let s = 1; s <= samples; s++) out.push(catmullRomPoint(p0, p1, p2, p3, s / samples))
  }
  return out
}

/** 取 ridge 按弧长居中的 fraction 比例子段（fraction∈(0,1]，两端各裁掉 (1-fraction)/2 弧长；
 *  端点用线性插值精确落在目标弧长处，中间保留原采样点）。fraction≥1 或点数不足时原样返回。 */
function midSubsegment(ridge: MapPoint[], fraction: number): MapPoint[] {
  const n = ridge.length
  if (fraction >= 1 || n < 2) return ridge
  const cum: number[] = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(ridge[i][0] - ridge[i - 1][0], ridge[i][1] - ridge[i - 1][1]))
  const total = cum[n - 1]
  if (total <= 0) return ridge
  const startLen = total * (1 - fraction) / 2
  const endLen = total - startLen
  const interpAt = (targetLen: number): MapPoint => {
    for (let i = 1; i < n; i++) {
      if (cum[i] >= targetLen) {
        const segLen = cum[i] - cum[i - 1]
        const t = segLen > 0 ? (targetLen - cum[i - 1]) / segLen : 0
        const a = ridge[i - 1]; const b = ridge[i]
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      }
    }
    return ridge[n - 1]
  }
  const out: MapPoint[] = [interpAt(startLen)]
  for (let i = 0; i < n; i++) { if (cum[i] > startLen && cum[i] < endLen) out.push(ridge[i]) }
  out.push(interpAt(endLen))
  return out.length >= 2 ? out : ridge
}

/** 沿脊线偏移生成闭合基座环：法向量 (nx,ny) 取沿 prev→next 前进方向的左手垂线（"左"=该法向正方向，
 *  "右"=负方向——具体对应南北/东西哪一侧取决于脊线走向，不固定绑定罗盘方位，与 types.ts asymmetry 注释一致）。
 *  半宽公式（用户 07-13 二次拍板）：
 *  halfW(t,layer,side) = baseHalfW × taper(t) × layerShrink(layer) × sideBias(side) × (1+ruggedness×0.4×(rng()-0.5)×2)
 *  左右两岸独立抽取噪声（rng 依次消费：每点先左后右），天然非对称；sideBias 由 asymmetry 决定左右不同倍率。 */
function buildBaseRing(
  ridgeSeg: MapPoint[],
  layerIndex: 0 | 1 | 2,
  baseHalfW: number,
  steepness: number,
  ruggedness: number,
  asymmetry: number,
  rng: () => number
): MapPoint[] {
  const n = ridgeSeg.length
  const shrink = layerShrink(layerIndex, steepness)
  const leftBias = 1 + 0.6 * asymmetry
  const rightBias = 1 - 0.6 * asymmetry
  const left: MapPoint[] = []
  const right: MapPoint[] = []
  for (let i = 0; i < n; i++) {
    const prev = ridgeSeg[Math.max(0, i - 1)]
    const next = ridgeSeg[Math.min(n - 1, i + 1)]
    const dx = next[0] - prev[0]; const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len; const ny = dx / len
    const t = n > 1 ? i / (n - 1) : 0
    const taperVal = taper(t)
    const hwLeft = Math.max(0, baseHalfW * taperVal * shrink * leftBias * (1 + ruggedness * 0.4 * (rng() - 0.5) * 2))
    const hwRight = Math.max(0, baseHalfW * taperVal * shrink * rightBias * (1 + ruggedness * 0.4 * (rng() - 0.5) * 2))
    left.push([ridgeSeg[i][0] + nx * hwLeft, ridgeSeg[i][1] + ny * hwLeft])
    right.push([ridgeSeg[i][0] - nx * hwRight, ridgeSeg[i][1] - ny * hwRight])
  }
  return [...left, ...right.slice().reverse()]
}

/** 山脉装甲展开：骨架（世界坐标关键点，稀疏）→ 2~3 层海拔嵌套 region 草稿。同 seed 永远同输出。
 *  内层多边形顶点若溢出外层基座属可接受近似——不做裁剪（任务书明确允许，避免引入多边形布尔运算依赖）。 */
export interface MountainArmorExpansionOptions {
  /** 编辑器把已补全参数作为显式真值传入时开启；此时不再由本函数补参。 */
  paramsResolved?: boolean
  /**
   * 旧版补参在轮廓噪声前消费的随机数个数。编辑器迁移到完整参数后按原值跳过，保证“只调一个参数”
   * 不会顺带换掉整圈噪声。现役旧调用不传，行为逐字节不变。
   */
  noiseSkip?: number
}

export function expandMountainArmor(
  skeleton: MapPoint[],
  params: MountainArmorParams,
  seed: number,
  options: MountainArmorExpansionOptions = {}
): ArmorExpansion {
  if (!skeleton || skeleton.length < 2) throw new Error('expandMountainArmor: skeleton 至少需要 2 个点')
  const rng = mulberry32(seed)
  const ridgeLenRaw = pathLength(skeleton)

  // 补参（rng 消耗顺序：peakElevationM → baseWidthM，显式给了的字段不占用 rng）。
  const peakElevationM = params.peakElevationM ?? (PEAK_ELEVATION_RANGE[0] + rng() * (PEAK_ELEVATION_RANGE[1] - PEAK_ELEVATION_RANGE[0]))
  const baseWidthM = params.baseWidthM ?? (ridgeLenRaw * (BASE_WIDTH_RATIO_RANGE[0] + rng() * (BASE_WIDTH_RATIO_RANGE[1] - BASE_WIDTH_RATIO_RANGE[0])))
  const steepness = clamp01(params.steepness ?? DEFAULT_STEEPNESS)
  const ruggedness = clamp01(params.ruggedness ?? DEFAULT_RUGGEDNESS)
  const asymmetry = Math.max(-1, Math.min(1, params.asymmetry ?? DEFAULT_ASYMMETRY))
  const layers = params.layers ?? (peakElevationM < LAYERS_BY_ELEVATION_THRESHOLD_M ? 2 : 3)

  if (options.paramsResolved) {
    const noiseSkip = Math.max(0, Math.min(2, Math.trunc(Number(options.noiseSkip) || 0)))
    for (let index = 0; index < noiseSkip; index++) rng()
  }

  const ridge = sampleSmoothArmorSkeleton(skeleton)
  const halfBase = baseWidthM / 2
  const features: ArmorFeatureDraft[] = []

  // layer0：基座（全 ridge，shrink 恒 1），挂 spine（唯一携带脊线真值的一层）。
  features.push({
    kind: 'region', category: 'mountain', name: '主山体', layer: 'terrain',
    pts: buildBaseRing(ridge, 0, halfBase, steepness, ruggedness, asymmetry, rng),
    elevationM: peakElevationM * 0.35,
    spine: ridge
  })

  // layer1：中段 60% 弧长子段。
  const ridgeMid60 = midSubsegment(ridge, 0.6)
  features.push({
    kind: 'region', category: 'mountain', name: '山脊带', layer: 'terrain',
    pts: buildBaseRing(ridgeMid60, 1, halfBase, steepness, ruggedness, asymmetry, rng),
    elevationM: peakElevationM * 0.7
  })

  // layer2（仅 layers===3）：中段 30% 弧长子段，海拔=峰值。
  if (layers === 3) {
    const ridgeMid30 = midSubsegment(ridge, 0.3)
    features.push({
      kind: 'region', category: 'mountain', name: '峰线', layer: 'terrain',
      pts: buildBaseRing(ridgeMid30, 2, halfBase, steepness, ruggedness, asymmetry, rng),
      elevationM: peakElevationM
    })
  }

  const ridgeLenKm = pathLength(ridge) / 1000
  const summary = `${layers}层嵌套 · 脊线长${ridgeLenKm.toFixed(1)}km · 峰值海拔${Math.round(peakElevationM)}m · seed=${seed}`
  // resolvedParams（批A2 最小扩展）：把本次实际生效的数值（含随机补参结果）整份带出，仅供展示/审计——
  // ⚠️不是重现基准（拿它当 params 重新展开会因 rng 消耗序列错位产出不同坐标，详见 types.ts 注释）；
  // 调用方要重现本次 features，必须存本次真正传入的 params 参数（见 armorOrchestration.ts）。
  const resolvedParams: Required<MountainArmorParams> = { peakElevationM, baseWidthM, steepness, ruggedness, asymmetry, layers }
  return { features, summary, resolvedParams }
}
