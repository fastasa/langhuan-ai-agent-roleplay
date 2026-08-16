// 装甲地图系统 · 协议类型（批A1 装甲核心纯函数层·2026-07-13 装甲地图系统计划书）
// 司机理论：模型只报"意图骨架"（点阵图关键点+少量参数），精确几何全部由代码确定性生成（mulberry32 seed）。
// 真值层放在 meta.armor（skeleton 米坐标+params+seed），本文件是"展开层"输入输出协议的类型定义。

import type { MapPoint } from '../mapGeometry'

/** 模型输出的参数化笔画：格子坐标关键点（行/列从1起，[行,列] 顺序），代码负责光栅化与平滑。
 *  smooth/straight 只影响展开层的圆润程度（见 mountainArmor.ts），光栅化阶段（dotMatrix.ts）两者同样处理。 */
export interface ArmorStroke {
  type: 'smooth' | 'straight'
  points: Array<[number, number]>
}

/** 山脉装甲参数：全部从"俯视地图上能看到的形态"倒推（陡度=色带密度、嶙峋度=轮廓质感、不对称=单面山），
 *  模型/用户大多不填，缺省值由 mulberry32(seed) 在合理范围内确定性推导（禁止 Math.random/Date.now）。
 *  （用户 2026-07-13 二次拍板修订：原单一 roughness 拆成 steepness/ruggedness 两个语义正交参数，
 *  并新增 asymmetry；见 mountainArmor.ts 半宽公式 halfW(t,layer,side)。） */
export interface MountainArmorParams {
  /** 主峰海拔（米，决定海拔色档）。缺省时在 [800, 2500] 内按 seed 随机。 */
  peakElevationM?: number
  /** 基座总宽（米，非半宽）。缺省 = 脊线长度（米）× [0.15, 0.25] 按 seed 随机。 */
  baseWidthM?: number
  /** 0~1 陡度：控制海拔嵌套层的半宽衰减率——陡（趋近1）→内层紧贴脊线（俯视色带窄而密）；
   *  缓（趋近0）→层间铺开（色带宽疏）。缺省 0.5。 */
  steepness?: number
  /** 0~1 嶙峋度：轮廓边缘噪声/摆动幅度——低=流畅圆缓，高=嶙峋碎折。缺省 0.5。 */
  ruggedness?: number
  /** -1~1 两侧陡缓偏置（0=对称）：正值让脊线左侧（沿脊线前进方向的左手侧）铺开、右侧收紧
   *  （单面山观感）；负值相反。缺省 0。 */
  asymmetry?: number
  /** 海拔嵌套层数。显式给出则优先；缺省按海拔推导：peakElevationM < 1200 取 2，否则取 3。 */
  layers?: 2 | 3
}

/** 河流装甲参数。河流只保存脊线与这份宽度剖面；河岸多边形始终由 widenSpine 派生，不能另存成第二真值。 */
export interface RiverArmorParams {
  /** 源头满宽（米）。 */
  sourceWidthM?: number
  /** 河口满宽（米），必须不小于源头宽度。 */
  mouthWidthM?: number
  /** 沿程展宽指数，越小越早变宽。 */
  growthExponent?: number
  /** 两岸碎折度 0~0.6。 */
  bankRoughness?: number
  /** 普通汇入用 flat；入海/入大湖可用 flare。 */
  mouthCap?: 'flat' | 'flare'
  /** mouthCap=flare 时的河口展开倍数。 */
  mouthFlareRatio?: number
}

/** 湖泊与海洋共用的面状水体装甲参数。外轮廓是唯一表面真值，深水带由参数确定性向内展开。 */
export interface WaterArmorParams {
  /** 语义类别只影响名称与合理缺省，不改变装甲算法。 */
  waterKind?: 'lake' | 'ocean'
  /** 最大水深（米）。 */
  maxDepthM?: number
  /** 近岸浅水带占外轮廓到深水核心的比例，0.05~0.45。 */
  shoreShelfRatio?: number
  /** 深度向中心增长曲线，越大表示近岸更缓、深水更集中。 */
  depthCurve?: number
  /** 海岸碎折度 0~1。 */
  ruggedness?: number
  /** 可见深度层数。 */
  layers?: 2 | 3
  /** 河流端点距水体不超过该距离时自动补连，单位米。 */
  connectionGapM?: number
}

/** 装甲展开产出的单个地图要素草稿（与现有 MapFeature 字段语义对齐，kind/layer 固定，供调用方拼装成
 *  正式 MapFeature 写库；name 为占位，调用方后续覆盖）。 */
export interface ArmorFeatureDraft {
  kind: 'region'
  category: string
  name: string
  layer: 'terrain'
  pts: MapPoint[]
  elevationM: number
  /** 脊线（仅最外层基座 feature 携带，供渲染/后续编辑找回骨架）。 */
  spine?: MapPoint[]
}

/** 一次装甲展开的完整产出：多层 region 草稿 + 一句话摘要（层数/长度/海拔/seed，供回执与人工核对）。 */
export interface ArmorExpansion {
  features: ArmorFeatureDraft[]
  summary: string
  /** 补参后的完整参数快照（批A2 最小扩展·装甲地图系统计划书允许）：本次实际生效的数值（含随机补参结果），
   *  供「看当前效果是多少」类展示/审计场景直接读取，不必重放 mulberry32(seed) 反推缺省值。
   *  ⚠️不是重现基准——不能拿 resolvedParams 当 params 重新调用 expandMountainArmor 来复现本次 features：
   *  peakElevationM/baseWidthM 用 `params.x ?? 随机表达式` 补参，字段缺省时右侧表达式才会消耗一次 rng()；
   *  resolvedParams 把全部字段填成显式数值，重新传入会让这两个字段都短路跳过 rng() 消耗，导致后续
   *  buildBaseRing 噪声抽取的 rng 游标错位，展开出的坐标点会变（值域/统计特征相同，逐字节不同）。
   *  真正能逐字节复现 features 的重现基准，是「本次实际传给 expandMountainArmor 的那个（可能残缺的）
   *  params 对象」本身——调用方要存重现真值，必须存这一份，而不是 resolvedParams（见 armorOrchestration.ts）。 */
  resolvedParams: Required<MountainArmorParams>
}

/** 点阵网格规格：origin=网格左上角第1行第1列格子中心的世界坐标偏移基准（见 dotMatrix.ts gridToWorld
 *  的具体换算式），cellM=每格边长（米），rows/cols=网格行列数（当前 buildMountainDotMatrix 恒 rows=cols=gridN）。 */
export interface DotMatrixSpec {
  originX: number
  originY: number
  cellM: number
  rows: number
  cols: number
}

/** 点阵投影产出：text=给模型看的可读文本（行列号+格子字符，格式与阶段0 测试题一致）；
 *  legal=程序侧查询用的布尔矩阵，legal[row-1][col-1] 对应第 row 行第 col 列格子是否可画（true=`.`可画，
 *  false=`#`禁区，含越界外/已有水域/已有山体三类禁区，文本渲染时统一显示为 `#`）。 */
export interface DotMatrixProjection {
  text: string
  spec: DotMatrixSpec
  legal: boolean[][]
}

export interface MapDrawTraceStep {
  key: string
  label: string
  status: 'success' | 'error'
  data: unknown
}

/** 一次新地图写链的可审查记录；随落库要素写进 meta.drawTrace，运行卡也直接展示同一份。 */
export interface MapDrawTrace {
  version: 1
  kind: 'mountain-armor' | 'grass-armor' | 'river-armor' | 'water-armor' | 'vector-primitive'
  steps: MapDrawTraceStep[]
}
