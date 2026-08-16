import { normalizePixelCleanupOptions, type PixelCleanupOptions } from '../core'

export const PIXEL_CLEANUP_PRESETS_STORAGE_KEY = 'pixel-studio:cleanup-presets'
export const MAX_CUSTOM_CLEANUP_PRESETS = 32

export interface PixelCleanupCustomPreset {
  id: string
  name: string
  options: PixelCleanupOptions
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function normalizeCleanupPresetName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('请输入预设名称')
  if (normalized.length > 32) throw new Error('预设名称不能超过 32 个字符')
  return normalized
}

function parsePreset(item: unknown): PixelCleanupCustomPreset {
  if (!item || typeof item !== 'object') throw new Error('自定义预设条目不是对象')
  const raw = item as Record<string, unknown>
  if (typeof raw.id !== 'string' || !/^cleanup-[a-z0-9-]+$/i.test(raw.id)) throw new Error('自定义预设 id 不合法')
  if (typeof raw.name !== 'string') throw new Error('自定义预设名称不合法')
  if (!raw.options || typeof raw.options !== 'object') throw new Error('自定义预设参数不合法')
  return {
    id: raw.id,
    name: normalizeCleanupPresetName(raw.name),
    options: normalizePixelCleanupOptions(raw.options as PixelCleanupOptions)
  }
}

export function loadPixelCleanupPresets(storage: StorageLike): PixelCleanupCustomPreset[] {
  const raw = storage.getItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY)
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('自定义预设配置不是合法 JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('自定义预设配置必须是数组')
  if (parsed.length > MAX_CUSTOM_CLEANUP_PRESETS) throw new Error(`自定义预设不能超过 ${MAX_CUSTOM_CLEANUP_PRESETS} 个`)
  const presets = parsed.map(parsePreset)
  validatePresetCollection(presets)
  return presets
}

function validatePresetCollection(presets: readonly PixelCleanupCustomPreset[]) {
  if (presets.length > MAX_CUSTOM_CLEANUP_PRESETS) throw new Error(`自定义预设不能超过 ${MAX_CUSTOM_CLEANUP_PRESETS} 个`)
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const preset of presets) {
    if (ids.has(preset.id)) throw new Error(`自定义预设 id 重复：${preset.id}`)
    ids.add(preset.id)
    const normalizedName = preset.name.toLocaleLowerCase('zh-CN')
    if (names.has(normalizedName)) throw new Error(`自定义预设名称重复：${preset.name}`)
    names.add(normalizedName)
  }
}

export function savePixelCleanupPresets(storage: StorageLike, presets: readonly PixelCleanupCustomPreset[]): void {
  const normalized = presets.map((preset) => ({
    id: preset.id,
    name: normalizeCleanupPresetName(preset.name),
    options: normalizePixelCleanupOptions(preset.options)
  }))
  validatePresetCollection(normalized)
  storage.setItem(PIXEL_CLEANUP_PRESETS_STORAGE_KEY, JSON.stringify(normalized))
}
