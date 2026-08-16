export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('只能选择图片文件'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export async function readImageInputAsDataUrl(event: Event): Promise<string> {
  const input = event.target instanceof HTMLInputElement ? event.target : null
  const file = input?.files?.[0]
  try {
    if (!file) return ''
    return await readImageFileAsDataUrl(file)
  } finally {
    if (input) input.value = ''
  }
}

/** 把同源聊天图片转成裁剪器可读的 data URL；头像最终仍走现役 data URI 保存链，不长期借用 chat-images 路径。 */
export async function readImageUrlAsDataUrl(url: string): Promise<string> {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) return ''
  if (normalizedUrl.startsWith('data:image/')) return normalizedUrl
  const response = await fetch(normalizedUrl, { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`读取图片失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('目标文件不是图片')
  return await readImageFileAsDataUrl(new File([blob], 'chat-avatar-image', { type: blob.type }))
}

export interface SquarePhotoCropPreset {
  /** 原图归一化焦点；0=左/上，1=右/下。 */
  focusX: number
  focusY: number
  /** 相对“铺满正方形”的放大倍数。 */
  zoom: number
}

export interface SquarePhotoCropRect {
  sourceX: number
  sourceY: number
  sourceSize: number
  preset: SquarePhotoCropPreset
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function normalizeSquarePhotoCropPreset(preset?: Partial<SquarePhotoCropPreset> | null): SquarePhotoCropPreset {
  return {
    focusX: clampNumber(preset?.focusX, 0, 1, 0.5),
    focusY: clampNumber(preset?.focusY, 0, 1, 0.5),
    zoom: clampNumber(preset?.zoom, 1, 4, 1)
  }
}

/**
 * 把归一化焦点与缩放换算成原图上的正方形区域。
 * 工具自动构图与 PhotoCropDialog 初始预览共用这份数学真值，避免两边看到不同裁剪。
 */
export function resolveSquarePhotoCropRect(
  naturalWidth: number,
  naturalHeight: number,
  preset?: Partial<SquarePhotoCropPreset> | null
): SquarePhotoCropRect {
  const width = Math.max(0, Number(naturalWidth) || 0)
  const height = Math.max(0, Number(naturalHeight) || 0)
  const normalized = normalizeSquarePhotoCropPreset(preset)
  const sourceSize = Math.min(width, height) / normalized.zoom
  const maxX = Math.max(0, width - sourceSize)
  const maxY = Math.max(0, height - sourceSize)
  return {
    sourceX: Math.max(0, Math.min(maxX, normalized.focusX * width - sourceSize / 2)),
    sourceY: Math.max(0, Math.min(maxY, normalized.focusY * height - sourceSize / 2)),
    sourceSize,
    preset: normalized
  }
}
