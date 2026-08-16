import { describe, expect, it } from 'vitest'
import { PIXEL_CLEANUP_PRESETS } from '../../../src/pixel-studio/core'
import {
  PIXEL_CLEANUP_PRESETS_STORAGE_KEY,
  loadPixelCleanupPresets,
  normalizeCleanupPresetName,
  savePixelCleanupPresets
} from '../../../src/pixel-studio/ui/pixelCleanupPresets'

function createMemoryStorage(initial = null) {
  const values = new Map()
  if (initial !== null) values.set(PIXEL_CLEANUP_PRESETS_STORAGE_KEY, initial)
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    raw: values
  }
}

describe('去除杂色自定义预设配置', () => {
  it('名称会去除首尾空白并合并连续空格', () => {
    expect(normalizeCleanupPresetName('  我的   预设  ')).toBe('我的 预设')
    expect(() => normalizeCleanupPresetName('   ')).toThrow('请输入预设名称')
  })

  it('保存与读取使用同一份严格配置真值', () => {
    const storage = createMemoryStorage()
    savePixelCleanupPresets(storage, [{
      id: 'cleanup-test',
      name: '立绘精修',
      options: { ...PIXEL_CLEANUP_PRESETS.portrait, protectedCodes: ['a1'] }
    }])
    expect(loadPixelCleanupPresets(storage)).toEqual([{
      id: 'cleanup-test',
      name: '立绘精修',
      options: { ...PIXEL_CLEANUP_PRESETS.portrait, protectedCodes: ['a1'] }
    }])
  })

  it('损坏配置与重复名称不会静默吞掉', () => {
    expect(() => loadPixelCleanupPresets(createMemoryStorage('{bad json'))).toThrow('不是合法 JSON')
    const storage = createMemoryStorage()
    expect(() => savePixelCleanupPresets(storage, [
      { id: 'cleanup-one', name: '同名', options: { ...PIXEL_CLEANUP_PRESETS.gentle } },
      { id: 'cleanup-two', name: '同名', options: { ...PIXEL_CLEANUP_PRESETS.bold } }
    ])).toThrow('名称重复')
  })
})
