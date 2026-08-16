import { describe, it, expect } from 'vitest'
import {
  normalizeApiPreset,
  buildApiPresetRecordPayload,
  buildApiPresetPatchPayload
} from '../../../src/repositories/settingRepository.ts'

// 批次E：最短间隔字段 minInterval 在前端序列化链路的往返契约。
describe('ApiPreset.minInterval 序列化', () => {
  it('normalizeApiPreset：缺省回退 0、读取下划线、范围钳制 0~3600', () => {
    expect(normalizeApiPreset({ name: 'a' }).minInterval).toBe(0)
    expect(normalizeApiPreset({ name: 'a', min_interval: 3 }).minInterval).toBe(3)
    expect(normalizeApiPreset({ name: 'a', minInterval: 10 }).minInterval).toBe(10)
    expect(normalizeApiPreset({ name: 'a', minInterval: 0 }).minInterval).toBe(0)
    expect(normalizeApiPreset({ name: 'a', minInterval: -2 }).minInterval).toBe(0)
    expect(normalizeApiPreset({ name: 'a', minInterval: 99999 }).minInterval).toBe(3600)
  })

  it('buildApiPresetRecordPayload：新增时带上 minInterval（默认 0）', () => {
    expect(buildApiPresetRecordPayload({ name: 'a', minInterval: 4 }).minInterval).toBe(4)
    expect(buildApiPresetRecordPayload({ name: 'a' }).minInterval).toBe(0)
  })

  it('buildApiPresetPatchPayload：仅在变更时包含 minInterval', () => {
    expect(buildApiPresetPatchPayload({ minInterval: 5 }).minInterval).toBe(5)
    expect(buildApiPresetPatchPayload({ min_interval: 8 }).minInterval).toBe(8)
    expect('minInterval' in buildApiPresetPatchPayload({ name: 'a' })).toBe(false)
  })
})
