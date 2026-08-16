import { MAX_LAYER_COUNT, createLayer } from './layers'
import { PixelDocument, PixelFrame, PixelPalette, TRANSPARENT_CODE } from './types'

const MIN_SIZE = 1
const MAX_SIZE = 512
/** 与 server/pixel-studio/store.ts 的同名上限联动，改一处必须同步另一处 */
export const MAX_FRAME_COUNT = 64
export const DEFAULT_TIMELINE_FPS = 10
export const MIN_TIMELINE_FPS = 1
export const MAX_TIMELINE_FPS = 60
export const MAX_TIMELINE_FRAMES = 36000

/** 新建一份静态文档：默认含一个全透明画帧，尚未创建时间轴。 */
export function createDocument(opts: { name: string; width: number; height: number }): PixelDocument {
  const { name, width, height } = opts
  const frame: PixelFrame = {
    id: 'f1',
    exposureFrames: 1,
    layers: [createLayer({ id: 'l1', name: '图层 1', width, height })]
  }
  return {
    version: 4,
    name,
    width,
    height,
    frames: [frame],
    timeline: null,
    playback: { loop: true }
  }
}

/** 深拷贝一份文档（文档很小，直接走 JSON 序列化即可） */
export function cloneDocument(doc: PixelDocument): PixelDocument {
  return JSON.parse(JSON.stringify(doc))
}

/**
 * 取文档指定索引的画帧；页面必须显式传入当前画帧索引，静态文档可使用默认第 0 帧。
 * 索引越界视为数据不一致，直接抛错而非静默回退，避免切帧时把写入落到错误画帧。
 */
export function getFrame(doc: PixelDocument, index = 0): PixelFrame {
  const frame = doc.frames[index]
  if (!frame) {
    throw new Error(`帧越界: index=${index}, frames.length=${doc.frames.length}`)
  }
  return frame
}

/**
 * 把历史 v1 单网格 / v2 共享色卡 / v3 图层私有色卡文档单向升级为 v4 整数帧文档。
 * 兼容只存在于读入口，运行时与下一次保存只保留 v4 一份真值。
 */
export function normalizeDocument(doc: unknown): PixelDocument {
  const errors = validateDocument(doc)
  if (errors.length > 0) throw new Error(`像素文档不合法: ${errors.join('; ')}`)
  const raw = doc as Record<string, unknown>
  if (raw.version === 4) return raw as unknown as PixelDocument
  const legacy = raw as {
    version: 1 | 2 | 3
    name: string
    width: number
    height: number
    palette?: PixelPalette
    frames: Array<{ id: string; durationMs: number; grid?: string[]; layers?: Array<{ id: string; name: string; visible: boolean; palette?: PixelPalette; grid: string[] }> }>
    playback: { loop: boolean }
  }
  const cloneLegacyPalette = (): PixelPalette => Object.fromEntries(
    Object.entries(legacy.palette ?? {}).map(([code, color]) => [code, { ...color }])
  )
  // 单帧旧文档仍是静态图，没有时间轴；其历史毫秒值不能伪造一段动画曝光。
  const exposureFrames = legacy.frames.length === 1
    ? [1]
    : legacy.frames.map((frame) => Math.max(1, Math.round(frame.durationMs * DEFAULT_TIMELINE_FPS / 1000)))
  const totalExposureFrames = exposureFrames.reduce((sum, value) => sum + value, 0)
  return {
    version: 4,
    name: legacy.name,
    width: legacy.width,
    height: legacy.height,
    frames: legacy.frames.map((frame, frameIndex) => ({
      id: frame.id,
      exposureFrames: exposureFrames[frameIndex],
      layers: legacy.version === 1
        // v1 只有一个图层，全部历史色卡都明确归它所有；不可因画布暂时没用到颜色而丢弃备用色。
        ? [{ id: 'l1', name: '图层 1', visible: true, palette: cloneLegacyPalette(), grid: frame.grid! }]
        // v2 无法表达“备用色属于哪一层”；为避免迁移丢色，向每层深拷贝一份，保存后即各自独立。
        : legacy.version === 2
          ? frame.layers!.map((layer) => ({ ...layer, palette: cloneLegacyPalette() }))
          : frame.layers!.map((layer) => ({ ...layer, palette: Object.fromEntries(Object.entries(layer.palette ?? {}).map(([code, color]) => [code, { ...color }])) }))
    })),
    timeline: legacy.frames.length > 1
      ? { fps: DEFAULT_TIMELINE_FPS, rangeStartFrame: 1, rangeEndFrame: totalExposureFrames }
      : null,
    playback: legacy.playback
  }
}

/** 校验一个未知值是否为合法 PixelDocument，返回错误列表；空数组=合法 */
export function validateDocument(doc: unknown): string[] {
  const errors: string[] = []

  if (typeof doc !== 'object' || doc === null) {
    return ['文档不是对象']
  }
  const d = doc as Record<string, unknown>

  if (d.version !== 1 && d.version !== 2 && d.version !== 3 && d.version !== 4) {
    errors.push('version 必须为 1、2、3 或 4')
  }
  if (typeof d.name !== 'string' || d.name.length === 0) {
    errors.push('name 必须为非空字符串')
  }

  const width = d.width
  const height = d.height
  const widthValid = typeof width === 'number' && Number.isInteger(width) && width >= MIN_SIZE && width <= MAX_SIZE
  const heightValid = typeof height === 'number' && Number.isInteger(height) && height >= MIN_SIZE && height <= MAX_SIZE
  if (!widthValid) {
    errors.push(`width 必须是 ${MIN_SIZE}~${MAX_SIZE} 的整数`)
  }
  if (!heightValid) {
    errors.push(`height 必须是 ${MIN_SIZE}~${MAX_SIZE} 的整数`)
  }

  const validatePalette = (palette: unknown, path: string): Set<string> => {
    const codes = new Set<string>()
    if (typeof palette !== 'object' || palette === null || Array.isArray(palette)) {
      errors.push(`${path} 必须为对象`)
      return codes
    }
    for (const code of Object.keys(palette as Record<string, unknown>)) {
      codes.add(code)
      if (code.length !== 2) {
        errors.push(`${path} 短码格式非法: ${code}`)
        continue
      }
      if (code === TRANSPARENT_CODE) {
        errors.push(`${path} 不应包含透明短码 '..'`)
        continue
      }
      const color = (palette as Record<string, unknown>)[code] as Record<string, unknown>
      if (typeof color !== 'object' || color === null || typeof color.hex !== 'string' || !/^#[0-9a-f]{6}$/.test(color.hex)) {
        errors.push(`${path}[${code}].hex 格式非法`)
      }
    }
    return codes
  }
  const legacyPaletteCodes = d.version === 1 || d.version === 2 ? validatePalette(d.palette, 'palette') : new Set<string>()
  if ((d.version === 3 || d.version === 4) && Object.prototype.hasOwnProperty.call(d, 'palette')) errors.push(`v${d.version} 不应包含文档级 palette`)

  // frames 校验
  const frames = d.frames
  if (!Array.isArray(frames) || frames.length === 0) {
    errors.push('frames 必须为非空数组')
  } else if (frames.length > MAX_FRAME_COUNT) {
    errors.push(`frames 数量不能超过 ${MAX_FRAME_COUNT}`)
  } else {
    const seenIds = new Set<string>()
    frames.forEach((frame: unknown, index: number) => {
      if (typeof frame !== 'object' || frame === null) {
        errors.push(`frames[${index}] 不是对象`)
        return
      }
      const f = frame as Record<string, unknown>
      if (typeof f.id !== 'string' || f.id.length === 0) {
        errors.push(`frames[${index}].id 必须为非空字符串`)
      } else if (seenIds.has(f.id)) {
        errors.push(`frames[${index}].id 重复: ${f.id}`)
      } else {
        seenIds.add(f.id)
      }
      if (d.version === 4) {
        if (typeof f.exposureFrames !== 'number' || !Number.isInteger(f.exposureFrames) || f.exposureFrames <= 0) {
          errors.push(`frames[${index}].exposureFrames 必须为正整数`)
        }
        if (Object.prototype.hasOwnProperty.call(f, 'durationMs')) errors.push(`frames[${index}] v4 不应包含 durationMs`)
      } else if (typeof f.durationMs !== 'number' || !Number.isInteger(f.durationMs) || f.durationMs <= 0) {
        errors.push(`frames[${index}].durationMs 必须为正整数`)
      }
      const expectedRowLen = widthValid ? (width as number) * 2 : null
      const validateGrid = (grid: unknown, path: string, paletteCodes: ReadonlySet<string>) => {
        if (!Array.isArray(grid)) {
          errors.push(`${path} 必须为数组`)
          return
        }
        if (heightValid && grid.length !== height) {
          errors.push(`${path} 行数应为 ${height}，实际 ${grid.length}`)
        }
        grid.forEach((row: unknown, rowIndex: number) => {
        if (typeof row !== 'string') {
          errors.push(`${path}[${rowIndex}] 必须为字符串`)
          return
        }
        if (expectedRowLen !== null && row.length !== expectedRowLen) {
          errors.push(`${path}[${rowIndex}] 长度应为 ${expectedRowLen}，实际 ${row.length}`)
          return
        }
        for (let i = 0; i + 1 < row.length; i += 2) {
          const code = row.slice(i, i + 2)
          if (code !== TRANSPARENT_CODE && !paletteCodes.has(code)) {
            errors.push(`${path}[${rowIndex}] 出现未登记短码: ${code}`)
          }
        }
      })
      }

      if (d.version === 1) {
        validateGrid(f.grid, `frames[${index}].grid`, legacyPaletteCodes)
      } else {
        const layers = f.layers
        if (!Array.isArray(layers) || layers.length === 0 || layers.length > MAX_LAYER_COUNT) {
          errors.push(`frames[${index}].layers 必须为 1~${MAX_LAYER_COUNT} 项数组`)
          return
        }
        const seenLayerIds = new Set<string>()
        layers.forEach((layer, layerIndex) => {
          if (typeof layer !== 'object' || layer === null) {
            errors.push(`frames[${index}].layers[${layerIndex}] 不是对象`)
            return
          }
          const item = layer as Record<string, unknown>
          const path = `frames[${index}].layers[${layerIndex}]`
          if (typeof item.id !== 'string' || item.id.length === 0 || seenLayerIds.has(item.id)) errors.push(`${path}.id 必须非空且唯一`)
          else seenLayerIds.add(item.id)
          if (typeof item.name !== 'string' || item.name.length === 0) errors.push(`${path}.name 必须为非空字符串`)
          if (typeof item.visible !== 'boolean') errors.push(`${path}.visible 必须为布尔值`)
          const layerPaletteCodes = d.version === 3 || d.version === 4 ? validatePalette(item.palette, `${path}.palette`) : legacyPaletteCodes
          validateGrid(item.grid, `${path}.grid`, layerPaletteCodes)
        })
      }
    })
  }

  if (d.version === 4) {
    const timeline = d.timeline
    if (timeline === null) {
      if (Array.isArray(frames) && frames.length !== 1) errors.push('静态 v4 文档必须只有一个画帧')
    } else if (typeof timeline !== 'object' || Array.isArray(timeline)) {
      errors.push('timeline 必须为对象或 null')
    } else {
      const t = timeline as Record<string, unknown>
      const fpsValid = typeof t.fps === 'number' && Number.isInteger(t.fps) && t.fps >= MIN_TIMELINE_FPS && t.fps <= MAX_TIMELINE_FPS
      const startValid = typeof t.rangeStartFrame === 'number' && Number.isInteger(t.rangeStartFrame) && t.rangeStartFrame >= 1
      const endValid = typeof t.rangeEndFrame === 'number' && Number.isInteger(t.rangeEndFrame) && startValid && t.rangeEndFrame >= (t.rangeStartFrame as number)
      if (!fpsValid) errors.push(`timeline.fps 必须为 ${MIN_TIMELINE_FPS}~${MAX_TIMELINE_FPS} 的整数`)
      if (!startValid) errors.push('timeline.rangeStartFrame 必须为从 1 开始的整数')
      if (!endValid) errors.push('timeline.rangeEndFrame 必须不小于起始帧')
      if (endValid && (t.rangeEndFrame as number) - (t.rangeStartFrame as number) + 1 > MAX_TIMELINE_FRAMES) errors.push(`时间轴总帧数不能超过 ${MAX_TIMELINE_FRAMES}`)
      if (endValid && Array.isArray(frames)) {
        const total = frames.reduce((sum, frame) => sum + (typeof (frame as Record<string, unknown>)?.exposureFrames === 'number' ? (frame as Record<string, number>).exposureFrames : 0), 0)
        const rangeLength = (t.rangeEndFrame as number) - (t.rangeStartFrame as number) + 1
        if (total !== rangeLength) errors.push(`画帧曝光总数(${total})必须等于播放范围长度(${rangeLength})`)
      }
    }
  }

  if (typeof d.playback !== 'object' || d.playback === null || typeof (d.playback as Record<string, unknown>).loop !== 'boolean') {
    errors.push('playback.loop 必须为布尔值')
  }

  return errors
}
