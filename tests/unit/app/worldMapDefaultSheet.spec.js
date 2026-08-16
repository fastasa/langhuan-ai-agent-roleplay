import { describe, expect, it } from 'vitest'
import { resolveWorldDefaultMapSheet } from '../../../src/app/worldMapDefaultSheet.ts'

function bundle(defaultMapSheetId = '') {
  return {
    world: { id: 'world_1', name: '世界', defaultMapSheetId },
    defaultMapSheetId,
    sheets: [
      { id: 'sheet_old', worldId: 'world_1', name: '旧图', explored: null, features: [] },
      { id: 'sheet_default', worldId: 'world_1', name: '默认图', explored: null, features: [] }
    ]
  }
}

describe('resolveWorldDefaultMapSheet', () => {
  it('优先按服务端显式默认 id 解析，不再隐式固定第一张', () => {
    expect(resolveWorldDefaultMapSheet(bundle('sheet_default'))?.id).toBe('sheet_default')
  })

  it('旧响应空值或脏引用稳定回退第一张；空 bundle 返回 null', () => {
    expect(resolveWorldDefaultMapSheet(bundle('missing'))?.id).toBe('sheet_old')
    expect(resolveWorldDefaultMapSheet(bundle(''))?.id).toBe('sheet_old')
    expect(resolveWorldDefaultMapSheet(null)).toBeNull()
  })
})
