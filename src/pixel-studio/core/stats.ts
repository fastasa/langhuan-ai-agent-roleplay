import { PixelCode, PixelDocument, PixelLayer, TRANSPARENT_CODE } from './types'

export interface ColorStatEntry {
  code: PixelCode
  hex: string | null
  count: number
  pct: number
}

/** 跨全部帧统计各短码出现格数（含透明格），按 count 降序 */
export function colorStats(doc: PixelDocument): ColorStatEntry[] {
  return colorStatsFromLayers(doc.frames.flatMap((frame) => frame.layers))
}

/** 图层色卡独立后，跨层统计按 hex 聚合；单层时仍保留该层真实短码供编辑。 */
export function colorStatsFromLayers(layers: readonly PixelLayer[]): ColorStatEntry[] {
  const counts = new Map<string, { code: PixelCode; hex: string | null; count: number }>()
  let total = 0
  for (const layer of layers) {
    for (const row of layer.grid) {
      for (let i = 0; i + 1 < row.length; i += 2) {
        const code = row.slice(i, i + 2)
        const hex = code === TRANSPARENT_CODE ? null : layer.palette[code]?.hex ?? null
        const key = hex ?? TRANSPARENT_CODE
        const current = counts.get(key)
        counts.set(key, { code: current?.code ?? code, hex, count: (current?.count ?? 0) + 1 })
        total++
      }
    }
  }
  const entries: ColorStatEntry[] = []
  for (const { code, hex, count } of counts.values()) {
    entries.push({ code, hex, count, pct: total > 0 ? count / total : 0 })
  }
  entries.sort((a, b) => b.count - a.count)
  return entries
}
