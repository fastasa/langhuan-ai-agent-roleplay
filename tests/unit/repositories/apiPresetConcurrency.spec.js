import { describe, it, expect } from 'vitest'
import {
  normalizeApiPreset,
  buildApiPresetRecordPayload,
  buildApiPresetPatchPayload
} from '../../../src/repositories/settingRepository.ts'

// 批次B：并发上限字段 maxConcurrency 在前端序列化链路的往返契约。
describe('ApiPreset.maxConcurrency 序列化', () => {
  it('normalizeApiPreset：缺省回退 6、读取下划线、范围钳制 1~64', () => {
    expect(normalizeApiPreset({ name: 'a' }).maxConcurrency).toBe(6)
    expect(normalizeApiPreset({ name: 'a', max_concurrency: 3 }).maxConcurrency).toBe(3)
    expect(normalizeApiPreset({ name: 'a', maxConcurrency: 10 }).maxConcurrency).toBe(10)
    expect(normalizeApiPreset({ name: 'a', maxConcurrency: 0 }).maxConcurrency).toBe(6)
    expect(normalizeApiPreset({ name: 'a', maxConcurrency: -2 }).maxConcurrency).toBe(6)
    expect(normalizeApiPreset({ name: 'a', maxConcurrency: 999 }).maxConcurrency).toBe(64)
  })

  it('buildApiPresetRecordPayload：新增时带上 maxConcurrency（默认 6）', () => {
    expect(buildApiPresetRecordPayload({ name: 'a', maxConcurrency: 4 }).maxConcurrency).toBe(4)
    expect(buildApiPresetRecordPayload({ name: 'a' }).maxConcurrency).toBe(6)
  })

  it('buildApiPresetPatchPayload：仅在变更时包含 maxConcurrency', () => {
    expect(buildApiPresetPatchPayload({ maxConcurrency: 5 }).maxConcurrency).toBe(5)
    expect(buildApiPresetPatchPayload({ max_concurrency: 8 }).maxConcurrency).toBe(8)
    expect('maxConcurrency' in buildApiPresetPatchPayload({ name: 'a' })).toBe(false)
  })
})
