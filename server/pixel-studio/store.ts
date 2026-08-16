/**
 * pixel-studio/store.ts
 * 像素文档存储：每份文档一个 JSON 文件，工厂函数注入落盘目录，模块自身不感知琅嬛数据路径。
 *
 * 独立性边界：本模块只允许一个跨模块 import（见下方 atomicJsonFile），
 * 不引入前端 core 模块、不引入琅嬛鉴权/数据路径，独立拆出时只需替换该 import 与调用方注入的 storageDir。
 */
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
// 独立拆出时需替换的唯一外部依赖：通用原子 JSON 读写工具（先写临时文件再原子 rename）。
import { readJsonFileSafe, writeJsonFileAtomic } from '../utils/atomicJsonFile.js'

const ID_PATTERN = /^[a-z0-9-]+$/
const MAX_DOC_BYTES = 2 * 1024 * 1024
const MAX_NAME_LENGTH = 100
const MAX_DIMENSION = 512
const MAX_FRAME_COUNT = 64
const MAX_LAYER_COUNT = 64
const MIN_TIMELINE_FPS = 1
const MAX_TIMELINE_FPS = 60
const MAX_TIMELINE_FRAMES = 36000

export interface PixelDocSummary {
  id: string
  name: string
  width: number
  height: number
  frameCount: number
  updatedAt: string
}

interface StoredPixelDoc {
  doc: Record<string, unknown>
  updatedAt: string
}

/** 只做「像素文档」形状与体量校验，不引入前端 core 模块，避免跨圈依赖；不合法时返回错误列表。 */
export function validatePixelDoc(doc: unknown): string[] {
  const errors: string[] = []
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    errors.push('doc 必须是对象')
    return errors
  }
  const d = doc as Record<string, unknown>
  if (d.version !== 1 && d.version !== 2 && d.version !== 3 && d.version !== 4) errors.push('version 必须为 1、2、3 或 4')
  if ((d.version === 3 || d.version === 4) && Object.prototype.hasOwnProperty.call(d, 'palette')) errors.push(`v${d.version} 不应包含文档级 palette`)
  if (typeof d.name !== 'string' || d.name.length === 0 || d.name.length > MAX_NAME_LENGTH) {
    errors.push(`name 必须为非空字符串且不超过 ${MAX_NAME_LENGTH} 字符`)
  }
  const width = d.width
  const height = d.height
  const validWidth = typeof width === 'number' && Number.isInteger(width) && width >= 1 && width <= MAX_DIMENSION
  const validHeight = typeof height === 'number' && Number.isInteger(height) && height >= 1 && height <= MAX_DIMENSION
  if (!validWidth) errors.push(`width 必须为 1~${MAX_DIMENSION} 的整数`)
  if (!validHeight) errors.push(`height 必须为 1~${MAX_DIMENSION} 的整数`)

  const frames = d.frames
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > MAX_FRAME_COUNT) {
    errors.push(`frames 必须为非空数组且不超过 ${MAX_FRAME_COUNT} 帧`)
  } else if (validWidth && validHeight) {
    const validateGrid = (grid: unknown, path: string) => {
      if (!Array.isArray(grid) || grid.length !== height) {
        errors.push(`${path} 行数必须等于 height(${height})`)
        return
      }
      const rowLengthOk = grid.every((row) => typeof row === 'string' && row.length === (width as number) * 2)
      if (!rowLengthOk) {
        errors.push(`${path} 每行长度必须等于 width*2(${(width as number) * 2})`)
      }
    }
    frames.forEach((frame, index) => {
      const f = frame as Record<string, unknown> | null
      if (d.version === 4) {
        if (typeof f?.exposureFrames !== 'number' || !Number.isInteger(f.exposureFrames) || f.exposureFrames <= 0) errors.push(`frames[${index}].exposureFrames 必须为正整数`)
        if (f && Object.prototype.hasOwnProperty.call(f, 'durationMs')) errors.push(`frames[${index}] v4 不应包含 durationMs`)
      } else if ((d.version === 2 || d.version === 3) && (typeof f?.durationMs !== 'number' || !Number.isInteger(f.durationMs) || f.durationMs <= 0)) {
        errors.push(`frames[${index}].durationMs 必须为正整数`)
      }
      if (d.version === 1) {
        validateGrid(f?.grid, `frames[${index}].grid`)
        return
      }
      const layers = f?.layers
      if (!Array.isArray(layers) || layers.length === 0 || layers.length > MAX_LAYER_COUNT) {
        errors.push(`frames[${index}].layers 必须为 1~${MAX_LAYER_COUNT} 项数组`)
        return
      }
      layers.forEach((layer, layerIndex) => {
        const item = layer as Record<string, unknown> | null
        if (typeof item?.id !== 'string' || typeof item?.name !== 'string' || typeof item?.visible !== 'boolean') {
          errors.push(`frames[${index}].layers[${layerIndex}] 元信息不合法`)
        }
        if ((d.version === 3 || d.version === 4) && (typeof item?.palette !== 'object' || item.palette === null || Array.isArray(item.palette))) {
          errors.push(`frames[${index}].layers[${layerIndex}].palette 必须为对象`)
        }
        validateGrid(item?.grid, `frames[${index}].layers[${layerIndex}].grid`)
      })
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
      if (endValid) {
        const rangeLength = (t.rangeEndFrame as number) - (t.rangeStartFrame as number) + 1
        if (rangeLength > MAX_TIMELINE_FRAMES) errors.push(`时间轴总帧数不能超过 ${MAX_TIMELINE_FRAMES}`)
        if (Array.isArray(frames)) {
          const exposureTotal = frames.reduce((sum, frame) => {
            const value = (frame as Record<string, unknown>)?.exposureFrames
            return sum + (typeof value === 'number' ? value : 0)
          }, 0)
          if (exposureTotal !== rangeLength) errors.push(`画帧曝光总数(${exposureTotal})必须等于播放范围长度(${rangeLength})`)
        }
      }
    }
    if (typeof d.playback !== 'object' || d.playback === null || typeof (d.playback as Record<string, unknown>).loop !== 'boolean') errors.push('playback.loop 必须为布尔值')
  }

  if (errors.length === 0) {
    const size = Buffer.byteLength(JSON.stringify(doc), 'utf8')
    if (size > MAX_DOC_BYTES) errors.push(`文档体量超过上限 ${MAX_DOC_BYTES} 字节`)
  }
  return errors
}

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && ID_PATTERN.test(id)
}

function generateId(): string {
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `pd-${time}-${rand}`
}

function toSummary(id: string, stored: StoredPixelDoc): PixelDocSummary {
  const doc = stored.doc as Record<string, unknown>
  return {
    id,
    name: typeof doc.name === 'string' ? doc.name : '',
    width: typeof doc.width === 'number' ? doc.width : 0,
    height: typeof doc.height === 'number' ? doc.height : 0,
    frameCount: Array.isArray(doc.frames) ? doc.frames.length : 0,
    updatedAt: stored.updatedAt
  }
}

export function createPixelStore(storageDir: string) {
  function filePathFor(id: string): string {
    return join(storageDir, `${id}.json`)
  }

  function listDocs(): PixelDocSummary[] {
    if (!existsSync(storageDir)) return []
    const files = readdirSync(storageDir).filter((name) => name.endsWith('.json'))
    const summaries: PixelDocSummary[] = []
    for (const file of files) {
      const id = file.slice(0, -'.json'.length)
      if (!isValidId(id)) continue
      const raw = readJsonFileSafe(filePathFor(id))
      if (!raw || typeof raw !== 'object') {
        console.warn(`[pixel-studio] 跳过损坏的文档文件: ${file}`)
        continue
      }
      const stored = raw as StoredPixelDoc
      if (!stored.doc || typeof stored.updatedAt !== 'string') {
        console.warn(`[pixel-studio] 跳过形状不合法的文档文件: ${file}`)
        continue
      }
      summaries.push(toSummary(id, stored))
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    return summaries
  }

  function getDoc(id: string): { id: string; doc: Record<string, unknown>; updatedAt: string } | null {
    if (!isValidId(id)) return null
    const raw = readJsonFileSafe(filePathFor(id))
    if (!raw || typeof raw !== 'object') return null
    const stored = raw as StoredPixelDoc
    if (!stored.doc || typeof stored.updatedAt !== 'string') return null
    return { id, doc: stored.doc, updatedAt: stored.updatedAt }
  }

  /** id 为空时新建并生成 id；传入 id 时按该 id 覆盖保存（要求已通过 isValidId 校验）。 */
  function saveDoc(id: string | null, doc: unknown): { id: string; errors?: undefined } | { id?: undefined; errors: string[] } {
    const errors = validatePixelDoc(doc)
    if (errors.length > 0) return { errors }
    let targetId = id
    if (targetId === null || targetId === undefined || targetId === '') {
      targetId = generateId()
    } else if (!isValidId(targetId)) {
      return { errors: ['id 不合法'] }
    }
    const stored: StoredPixelDoc = { doc: doc as Record<string, unknown>, updatedAt: new Date().toISOString() }
    writeJsonFileAtomic(filePathFor(targetId), stored)
    return { id: targetId }
  }

  function deleteDoc(id: string): boolean {
    if (!isValidId(id)) return false
    const path = filePathFor(id)
    if (!existsSync(path)) return false
    // 复用 writeJsonFileAtomic 所在模块没有导出 delete；直接用 fs 删除，删除不涉及并发写盘风险。
    try {
      unlinkSync(path)
      return true
    } catch {
      return false
    }
  }

  return { listDocs, getDoc, saveDoc, deleteDoc }
}
