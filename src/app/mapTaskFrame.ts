import type { MapBBox, MapPoint } from './mapGeometry'

export const DEFAULT_EMPTY_MAP_SPAN_M = 100_000
export const MIN_MAP_FRAME_SPAN_M = 1_000

export interface MapTaskFrame extends MapBBox {
  widthM: number
  heightM: number
  center: MapPoint
  pts: MapPoint[]
  empty: boolean
}

export interface ComputeMapTaskFrameOptions {
  paddingRatio?: number
  minPaddingM?: number
  emptySpanM?: number
  minSpanM?: number
}

function finitePointSets(pointSets: MapPoint[][]): MapPoint[] {
  const out: MapPoint[] = []
  for (const set of pointSets) {
    for (const point of set || []) {
      const x = Number(point?.[0])
      const y = Number(point?.[1])
      if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y])
    }
  }
  return out
}

export function mapTaskFrameFromBounds(minX: number, minY: number, maxX: number, maxY: number, empty = false): MapTaskFrame {
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    throw new Error('mapTaskFrameFromBounds: 工作框边界必须是有限数值，且 max 必须大于 min')
  }
  const widthM = maxX - minX
  const heightM = maxY - minY
  const center: MapPoint = [(minX + maxX) / 2, (minY + maxY) / 2]
  return {
    minX,
    minY,
    maxX,
    maxY,
    widthM,
    heightM,
    center,
    pts: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]],
    empty
  }
}

/**
 * 当前地图内容 → 本次视图/模型任务使用的工作框。
 *
 * 工作框只是派生视图，不写回 explored，也不是地图边界：有内容时取内容 bbox 加留白；空图时给一个
 *  100km 的初始观察窗，让无限白色工作平面仍有可缩放、可定位的首屏。分辨率由调用方另行决定。
 */
export function computeMapTaskFrame(pointSets: MapPoint[][], options: ComputeMapTaskFrameOptions = {}): MapTaskFrame {
  const points = finitePointSets(pointSets)
  const emptySpanM = Math.max(1, Number(options.emptySpanM ?? DEFAULT_EMPTY_MAP_SPAN_M))
  const minSpanM = Math.max(1, Number(options.minSpanM ?? MIN_MAP_FRAME_SPAN_M))
  if (!points.length) {
    const half = emptySpanM / 2
    return mapTaskFrameFromBounds(-half, -half, half, half, true)
  }

  let minX = points[0][0]
  let maxX = points[0][0]
  let minY = points[0][1]
  let maxY = points[0][1]
  for (let i = 1; i < points.length; i += 1) {
    minX = Math.min(minX, points[i][0])
    maxX = Math.max(maxX, points[i][0])
    minY = Math.min(minY, points[i][1])
    maxY = Math.max(maxY, points[i][1])
  }

  const rawWidth = Math.max(0, maxX - minX)
  const rawHeight = Math.max(0, maxY - minY)
  const baseSpan = Math.max(rawWidth, rawHeight, minSpanM)
  const paddingRatio = Math.max(0, Number(options.paddingRatio ?? 0.15))
  const minPaddingM = Math.max(0, Number(options.minPaddingM ?? 500))
  const pad = Math.max(minPaddingM, baseSpan * paddingRatio)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const width = Math.max(rawWidth, minSpanM) + pad * 2
  const height = Math.max(rawHeight, minSpanM) + pad * 2
  return mapTaskFrameFromBounds(centerX - width / 2, centerY - height / 2, centerX + width / 2, centerY + height / 2, false)
}
