import { getLayer } from './layers'
import { cloneDocument, getFrame } from './model'
import { hexToRgb } from './palette'
import { TRANSPARENT_CODE, type PixelCode, type PixelDocument } from './types'
import type { PixelCellSelection, PixelRegion } from './colorAdjust'

export type PixelCleanupPreset = 'gentle' | 'portrait' | 'bold' | 'custom'

export interface PixelCleanupOptions {
  /** 总强度。0 必须是严格无操作，方便“应用”后把预览归零。 */
  strength: number
  /** 感知色差容差，UI 取值 0~100。 */
  colorTolerance: number
  /** 小于等于该面积的局部色块允许按邻域归并。 */
  minRegionArea: number
  /** 同一色系优先保留的体积阶调数量。 */
  toneLevels: number
  /** 内外暗线识别灵敏度，UI 取值 0~100。 */
  lineSensitivity: number
  /** 描边向周围扩展的格数；普通预设只吸收过渡色，强预设才侵入纯色块。 */
  lineExpansion: number
  /** 允许连接的单格断线次数。 */
  gapClosing: number
  /** 描边周围过渡杂色清理强度，UI 取值 0~100。 */
  haloCleanup: number
  /** 毛刺与一格针孔规整强度，UI 取值 0~100。 */
  edgeRegularity: number
  /** 高值会要求更确定的邻域证据才删除小细节。 */
  detailProtection: number
  /** 明确保护的色卡短码；预留给后续色卡联动，内核现已支持。 */
  protectedCodes?: readonly PixelCode[]
}

export interface PixelCleanupReport {
  changedCellCount: number
  usedColorCountBefore: number
  usedColorCountAfter: number
  mergedColorCount: number
  removedSpeckleCellCount: number
  processedLineCellCount: number
}

export interface PixelCleanupResult {
  doc: PixelDocument
  report: PixelCleanupReport
}

export const PIXEL_CLEANUP_PRESETS: Record<Exclude<PixelCleanupPreset, 'custom'>, PixelCleanupOptions> = {
  gentle: {
    strength: 45,
    colorTolerance: 22,
    minRegionArea: 1,
    toneLevels: 5,
    lineSensitivity: 45,
    lineExpansion: 0,
    gapClosing: 1,
    haloCleanup: 45,
    edgeRegularity: 25,
    detailProtection: 85
  },
  portrait: {
    strength: 65,
    colorTolerance: 38,
    minRegionArea: 2,
    toneLevels: 4,
    lineSensitivity: 65,
    lineExpansion: 1,
    gapClosing: 1,
    haloCleanup: 75,
    edgeRegularity: 45,
    detailProtection: 70
  },
  bold: {
    strength: 82,
    colorTolerance: 55,
    minRegionArea: 4,
    toneLevels: 3,
    lineSensitivity: 78,
    lineExpansion: 1,
    gapClosing: 2,
    haloCleanup: 90,
    edgeRegularity: 70,
    detailProtection: 55
  }
}

interface Oklab {
  l: number
  a: number
  b: number
}

const CARDINAL = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
const AROUND = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
] as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizePixelCleanupOptions(input: PixelCleanupOptions): PixelCleanupOptions {
  const numericKeys: Array<Exclude<keyof PixelCleanupOptions, 'protectedCodes'>> = [
    'strength', 'colorTolerance', 'minRegionArea', 'toneLevels', 'lineSensitivity',
    'lineExpansion', 'gapClosing', 'haloCleanup', 'edgeRegularity', 'detailProtection'
  ]
  for (const key of numericKeys) {
    if (!Number.isFinite(input[key])) throw new Error(`去除杂色参数 ${key} 不合法`)
  }
  if (input.protectedCodes && (!Array.isArray(input.protectedCodes) || input.protectedCodes.some((code) => typeof code !== 'string' || code.length !== 2))) {
    throw new Error('去除杂色保护色短码不合法')
  }
  return {
    strength: clamp(Math.round(input.strength), 0, 100),
    colorTolerance: clamp(Math.round(input.colorTolerance), 0, 100),
    minRegionArea: clamp(Math.round(input.minRegionArea), 0, 12),
    toneLevels: clamp(Math.round(input.toneLevels), 2, 8),
    lineSensitivity: clamp(Math.round(input.lineSensitivity), 0, 100),
    lineExpansion: clamp(Math.round(input.lineExpansion), 0, 2),
    gapClosing: clamp(Math.round(input.gapClosing), 0, 2),
    haloCleanup: clamp(Math.round(input.haloCleanup), 0, 100),
    edgeRegularity: clamp(Math.round(input.edgeRegularity), 0, 100),
    detailProtection: clamp(Math.round(input.detailProtection), 0, 100),
    protectedCodes: [...(input.protectedCodes ?? [])]
  }
}

function srgbToLinear(value: number): number {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

/** OKLab 只在本内核用于人眼感知色差和局部明度，避免 RGB 距离把近似色判断歪掉。 */
function hexToOklab(hex: string): Oklab {
  const rgb = hexToRgb(hex)
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
}

function colorDistance(left: Oklab, right: Oklab): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b)
}

function makeWriteMask(width: number, height: number, region: PixelRegion | PixelCellSelection | null): boolean[] {
  const mask = new Array<boolean>(width * height).fill(false)
  if (!region) return mask.fill(true)
  if ('cells' in region) {
    for (const index of region.cells) if (index >= 0 && index < mask.length) mask[index] = true
    return mask
  }
  const minX = clamp(Math.min(region.x0, region.x1), 0, width - 1)
  const maxX = clamp(Math.max(region.x0, region.x1), 0, width - 1)
  const minY = clamp(Math.min(region.y0, region.y1), 0, height - 1)
  const maxY = clamp(Math.max(region.y0, region.y1), 0, height - 1)
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) mask[y * width + x] = true
  return mask
}

function rowsToCells(rows: readonly string[], width: number): PixelCode[] {
  const cells: PixelCode[] = []
  for (const row of rows) for (let x = 0; x < width; x++) cells.push(row.slice(x * 2, x * 2 + 2))
  return cells
}

function cellsToRows(cells: readonly PixelCode[], width: number, height: number): string[] {
  const rows: string[] = []
  for (let y = 0; y < height; y++) rows.push(cells.slice(y * width, (y + 1) * width).join(''))
  return rows
}

function neighborIndices(index: number, width: number, height: number, offsets: readonly (readonly [number, number])[]): number[] {
  const x = index % width
  const y = Math.floor(index / width)
  const result: number[] = []
  for (const [dx, dy] of offsets) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx)
  }
  return result
}

function usedColors(cells: readonly PixelCode[], writeMask: readonly boolean[]): Set<PixelCode> {
  const result = new Set<PixelCode>()
  cells.forEach((code, index) => {
    if (writeMask[index] && code !== TRANSPARENT_CODE) result.add(code)
  })
  return result
}

function replaceInMask(cells: PixelCode[], writeMask: readonly boolean[], from: PixelCode, to: PixelCode): number {
  let count = 0
  cells.forEach((code, index) => {
    if (writeMask[index] && code === from) {
      cells[index] = to
      count++
    }
  })
  return count
}

function dominantBoundaryCode(cells: readonly PixelCode[], component: readonly number[], width: number, height: number): { code: PixelCode; ratio: number } | null {
  const componentSet = new Set(component)
  const counts = new Map<PixelCode, number>()
  let total = 0
  for (const index of component) {
    for (const neighbor of neighborIndices(index, width, height, CARDINAL)) {
      if (componentSet.has(neighbor)) continue
      const code = cells[neighbor]
      if (code === TRANSPARENT_CODE) continue
      counts.set(code, (counts.get(code) ?? 0) + 1)
      total++
    }
  }
  if (total === 0) return null
  const [code, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return { code, ratio: count / total }
}

function findComponents(cells: readonly PixelCode[], writeMask: readonly boolean[], width: number, height: number): number[][] {
  const seen = new Uint8Array(cells.length)
  const result: number[][] = []
  for (let start = 0; start < cells.length; start++) {
    if (seen[start] || !writeMask[start] || cells[start] === TRANSPARENT_CODE) continue
    const code = cells[start]
    const queue = [start]
    const component: number[] = []
    seen[start] = 1
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]
      component.push(index)
      for (const neighbor of neighborIndices(index, width, height, CARDINAL)) {
        if (!seen[neighbor] && writeMask[neighbor] && cells[neighbor] === code) {
          seen[neighbor] = 1
          queue.push(neighbor)
        }
      }
    }
    result.push(component)
  }
  return result
}

function nearestLineCode(cells: readonly PixelCode[], lineMask: readonly boolean[], index: number, width: number, height: number, labs: ReadonlyMap<PixelCode, Oklab>): PixelCode | null {
  let best: PixelCode | null = null
  let bestLightness = Number.POSITIVE_INFINITY
  for (const neighbor of neighborIndices(index, width, height, AROUND)) {
    if (!lineMask[neighbor]) continue
    const code = cells[neighbor]
    const lightness = labs.get(code)?.l ?? 1
    if (lightness < bestLightness || (lightness === bestLightness && code < (best ?? code))) {
      best = code
      bestLightness = lightness
    }
  }
  return best
}

/**
 * 确定性的像素净化：只在目标图层与掩码内换格，结果色只写该层私有色卡；预览与正式应用复用同一纯函数。
 */
export function cleanupLayerPixels(
  source: PixelDocument,
  layerId: string,
  region: PixelRegion | PixelCellSelection | null,
  inputOptions: PixelCleanupOptions,
  frameIndex = 0
): PixelCleanupResult {
  const options = normalizePixelCleanupOptions(inputOptions)
  const doc = cloneDocument(source)
  const layer = getLayer(getFrame(doc, frameIndex), layerId)
  const width = doc.width
  const height = doc.height
  const writeMask = makeWriteMask(width, height, region)
  const original = rowsToCells(layer.grid, width)
  const cells = [...original]
  const protectedCodes = new Set(options.protectedCodes ?? [])
  const beforeColors = usedColors(cells, writeMask)
  const emptyReport = (): PixelCleanupReport => ({
    changedCellCount: 0,
    usedColorCountBefore: beforeColors.size,
    usedColorCountAfter: beforeColors.size,
    mergedColorCount: 0,
    removedSpeckleCellCount: 0,
    processedLineCellCount: 0
  })
  if (options.strength === 0) return { doc, report: emptyReport() }

  const strength = options.strength / 100
  const labs = new Map<PixelCode, Oklab>()
  for (const [code, color] of Object.entries(layer.palette)) labs.set(code, hexToOklab(color.hex))

  // 1) 色卡归并：只允许相邻色互相归并；大面积且明度分层明确的色块视为体积阶调而保留。
  const counts = new Map<PixelCode, number>()
  const globalCounts = new Map<PixelCode, number>()
  const adjacency = new Map<PixelCode, Map<PixelCode, number>>()
  cells.forEach((code) => {
    if (code !== TRANSPARENT_CODE) globalCounts.set(code, (globalCounts.get(code) ?? 0) + 1)
  })
  cells.forEach((code, index) => {
    if (!writeMask[index] || code === TRANSPARENT_CODE) return
    counts.set(code, (counts.get(code) ?? 0) + 1)
    for (const neighbor of neighborIndices(index, width, height, [[1, 0], [0, 1]])) {
      const other = cells[neighbor]
      if (other === TRANSPARENT_CODE || other === code) continue
      const map = adjacency.get(code) ?? new Map<PixelCode, number>()
      map.set(other, (map.get(other) ?? 0) + 1)
      adjacency.set(code, map)
      const reverse = adjacency.get(other) ?? new Map<PixelCode, number>()
      reverse.set(code, (reverse.get(code) ?? 0) + 1)
      adjacency.set(other, reverse)
    }
  })
  const tolerance = (0.012 + options.colorTolerance / 100 * 0.13) * (0.55 + strength * 0.75)
  let mergedColorCount = 0
  const sortedCodes = [...counts.keys()].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b))
  for (const code of sortedCodes) {
    if (protectedCodes.has(code) || !counts.has(code)) continue
    const sourceLab = labs.get(code)
    if (!sourceLab) continue
    const sourceCount = counts.get(code) ?? 0
    const candidates = [...(adjacency.get(code)?.entries() ?? [])]
      .filter(([candidate]) => candidate !== code && (globalCounts.get(candidate) ?? 0) > 0 && !protectedCodes.has(candidate))
      .map(([candidate, contact]) => {
        const targetLab = labs.get(candidate)
        return { candidate, contact, distance: targetLab ? colorDistance(sourceLab, targetLab) : Number.POSITIVE_INFINITY, targetLab }
      })
      .sort((a, b) => a.distance - b.distance || b.contact - a.contact || a.candidate.localeCompare(b.candidate))
    const best = candidates.find(({ candidate, distance, targetLab }) => {
      if (!targetLab || distance > tolerance) return false
      const targetCount = globalCounts.get(candidate) ?? 0
      const bothStableTones = sourceCount > options.minRegionArea * 3 && targetCount > options.minRegionArea * 3 && Math.abs(sourceLab.l - targetLab.l) > 0.025
      const palettePressure = beforeColors.size > options.toneLevels * 3
      return !bothStableTones || palettePressure || distance < tolerance * 0.42
    })
    if (!best) continue
    const replaced = replaceInMask(cells, writeMask, code, best.candidate)
    if (replaced === 0) continue
    counts.set(best.candidate, (counts.get(best.candidate) ?? 0) + replaced)
    globalCounts.set(best.candidate, (globalCounts.get(best.candidate) ?? 0) + replaced)
    globalCounts.set(code, Math.max(0, (globalCounts.get(code) ?? 0) - replaced))
    counts.delete(code)
    mergedColorCount++
  }

  // 2) 小色块：只有边界颜色形成足够强多数时才清除，高细节保护会进一步提高证据门槛。
  let removedSpeckleCellCount = 0
  const effectiveMinArea = Math.round(options.minRegionArea * (0.45 + strength * 0.8))
  const dominanceThreshold = 0.55 + options.detailProtection / 100 * 0.32
  if (effectiveMinArea > 0) {
    for (const component of findComponents(cells, writeMask, width, height)) {
      const code = cells[component[0]]
      if (component.length > effectiveMinArea || protectedCodes.has(code)) continue
      const dominant = dominantBoundaryCode(cells, component, width, height)
      if (!dominant || dominant.ratio < dominanceThreshold) continue
      for (const index of component) cells[index] = dominant.code
      removedSpeckleCellCount += component.length
    }
  }

  // 3) 内外暗线置信图：既看透明外缘，也看局部两侧更亮的细长结构，因此内部手臂/脸侧/发块线也能进入候选。
  const lineMask = new Array<boolean>(cells.length).fill(false)
  const lineThreshold = 0.18 - options.lineSensitivity / 100 * 0.12
  cells.forEach((code, index) => {
    if (!writeMask[index] || code === TRANSPARENT_CODE) return
    const lab = labs.get(code)
    if (!lab) return
    let brighter = 0
    let darker = 0
    let nonTransparent = 0
    let transparent = 0
    for (const neighbor of neighborIndices(index, width, height, AROUND)) {
      const other = cells[neighbor]
      if (other === TRANSPARENT_CODE) {
        transparent++
        continue
      }
      nonTransparent++
      const otherLab = labs.get(other)
      if (otherLab && otherLab.l - lab.l >= lineThreshold) brighter++
      if (otherLab && lab.l - otherLab.l >= lineThreshold * 0.65) darker++
    }
    lineMask[index] = darker === 0 && brighter >= (transparent > 0 ? 2 : 3) && nonTransparent >= 2
  })

  let processedLineCellCount = 0
  // 单格断线：只填充已有不透明格，避免自动跨透明区域造新结构。
  for (let pass = 0; pass < options.gapClosing; pass++) {
    const next = [...lineMask]
    cells.forEach((code, index) => {
      if (!writeMask[index] || code === TRANSPARENT_CODE || protectedCodes.has(code)) return
      const x = index % width
      const y = Math.floor(index / width)
      const at = (dx: number, dy: number) => {
        const nx = x + dx
        const ny = y + dy
        return nx >= 0 && nx < width && ny >= 0 && ny < height ? ny * width + nx : -1
      }
      const pairs = [[[ -1, 0 ], [ 1, 0 ]], [[ 0, -1 ], [ 0, 1 ]], [[ -1, -1 ], [ 1, 1 ]], [[ 1, -1 ], [ -1, 1 ]]] as const
      const pair = pairs.find(([[ax, ay], [bx, by]]) => {
        const a = at(ax, ay)
        const b = at(bx, by)
        return a >= 0 && b >= 0 && lineMask[a] && lineMask[b]
      })
      if (!pair) return
      const lineCode = nearestLineCode(cells, lineMask, index, width, height, labs)
      if (!lineCode || lineCode === code) return
      cells[index] = lineCode
      next[index] = true
      processedLineCellCount++
    })
    lineMask.splice(0, lineMask.length, ...next)
  }

  // 描边周围过渡色：吸收到暗线或退回邻近主体色；强预设才允许侵入无过渡的纯色格。
  const haloStrength = options.haloCleanup / 100 * strength
  if (haloStrength > 0) {
    const snapshot = [...cells]
    snapshot.forEach((code, index) => {
      if (!writeMask[index] || code === TRANSPARENT_CODE || lineMask[index] || protectedCodes.has(code)) return
      const around = neighborIndices(index, width, height, AROUND)
      const lineNeighbors = around.filter((neighbor) => lineMask[neighbor])
      if (lineNeighbors.length === 0) return
      const lineCode = nearestLineCode(snapshot, lineMask, index, width, height, labs)
      if (!lineCode) return
      const fillCounts = new Map<PixelCode, number>()
      for (const neighbor of around) {
        const other = snapshot[neighbor]
        if (other !== TRANSPARENT_CODE && !lineMask[neighbor]) fillCounts.set(other, (fillCounts.get(other) ?? 0) + 1)
      }
      const fillCode = [...fillCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      if (!fillCode || fillCode === code) return
      const currentLab = labs.get(code)
      const lineLab = labs.get(lineCode)
      const fillLab = labs.get(fillCode)
      if (!currentLab || !lineLab || !fillLab || fillLab.l <= lineLab.l) return
      const isBetween = currentLab.l > lineLab.l && currentLab.l < fillLab.l
      const transitionDistance = Math.min(colorDistance(currentLab, lineLab), colorDistance(currentLab, fillLab))
      const isHalo = isBetween && transitionDistance <= 0.06 + haloStrength * 0.30
      if (!isHalo) return
      const preferLine = options.lineExpansion > 0 && lineNeighbors.length >= 2 && colorDistance(currentLab, lineLab) <= colorDistance(currentLab, fillLab)
      cells[index] = preferLine ? lineCode : fillCode
      if (cells[index] === lineCode) lineMask[index] = true
      processedLineCellCount++
    })
  }

  // 粗线预设才把暗线真正扩进纯色块；按轮次扩张使 0/1/2 格参数拥有明确差异。
  if (options.strength >= 75) {
    for (let pass = 0; pass < options.lineExpansion; pass++) {
      const snapshot = [...cells]
      const snapshotMask = [...lineMask]
      snapshot.forEach((code, index) => {
        if (!writeMask[index] || code === TRANSPARENT_CODE || snapshotMask[index] || protectedCodes.has(code)) return
        const lineNeighborCount = neighborIndices(index, width, height, AROUND).filter((neighbor) => snapshotMask[neighbor]).length
        if (lineNeighborCount < 3) return
        const lineCode = nearestLineCode(snapshot, snapshotMask, index, width, height, labs)
        if (!lineCode) return
        cells[index] = lineCode
        lineMask[index] = true
        processedLineCellCount++
      })
    }
  }

  // 4) 一格透明针孔：仅四向至少三边同色且规整强度足够时填充，不对开放外轮廓做膨胀。
  if (options.edgeRegularity * strength >= 35) {
    const snapshot = [...cells]
    snapshot.forEach((code, index) => {
      if (!writeMask[index] || code !== TRANSPARENT_CODE) return
      const neighbors = neighborIndices(index, width, height, CARDINAL)
      if (neighbors.length < 4) return
      const countsByCode = new Map<PixelCode, number>()
      for (const neighbor of neighbors) {
        const other = snapshot[neighbor]
        if (other !== TRANSPARENT_CODE) countsByCode.set(other, (countsByCode.get(other) ?? 0) + 1)
      }
      const dominant = [...countsByCode].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      if (dominant?.[1] >= 3 && !protectedCodes.has(dominant[0])) {
        cells[index] = dominant[0]
        removedSpeckleCellCount++
      }
    })
  }

  let changedCellCount = 0
  cells.forEach((code, index) => {
    if (code !== original[index]) changedCellCount++
  })
  layer.grid = cellsToRows(cells, width, height)
  return {
    doc,
    report: {
      changedCellCount,
      usedColorCountBefore: beforeColors.size,
      usedColorCountAfter: usedColors(cells, writeMask).size,
      mergedColorCount,
      removedSpeckleCellCount,
      processedLineCellCount
    }
  }
}
