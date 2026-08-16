import { describe, expect, it } from 'vitest'
import {
  buildMapDraftReviewItem,
  createMapSheetRevision,
  runMapDraftReviewGate,
  validateMapDraftReviewDecision
} from '../../../src/app/mapDraftReview.ts'

describe('地图最终草稿审阅协议', () => {
  it('多层山脉保持一个逻辑审阅项，同时携带全部最终矢量层', () => {
    const item = buildMapDraftReviewItem({
      id: 'mountain-1', label: '东岭', category: 'mountain', kind: 'region', change: '新增东岭',
      features: [
        { kind: 'region', category: 'mountain', name: '东岭·主山体', layer: 'terrain', geometry: { pts: [[0, 0], [10, 0], [0, 10]], elevationM: 800 } },
        { kind: 'region', category: 'mountain', name: '东岭·峰线', layer: 'terrain', geometry: { pts: [[2, 2], [7, 2], [2, 7]], elevationM: 2600 } }
      ]
    })
    expect(item.previewFeatures).toHaveLength(2)
    expect(item.previewFeatures.map((feature) => feature.elevationM)).toEqual([800, 2600])
    expect(item.sketch.points).toEqual([[0, 0], [10, 0], [0, 10]])
  })

  it('每项必须且只能选择确认/修改/删除，修改必须填写逐项意见', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    expect(validateMapDraftReviewDecision(items, { confirmed: ['a'], modified: [], deleted: [], comments: {} }).error).toContain('未选择')
    expect(validateMapDraftReviewDecision(items, { confirmed: ['a'], modified: ['a'], deleted: ['b'], comments: { a: '改窄' } }).error).toContain('重复')
    expect(validateMapDraftReviewDecision(items, { confirmed: ['a'], modified: ['b'], deleted: [], comments: {} }).error).toContain('必须填写')
    expect(validateMapDraftReviewDecision(items, { confirmed: ['a'], modified: ['b'], deleted: [], comments: { b: '向北弯一些' } })).toEqual({ ok: true })
    expect(validateMapDraftReviewDecision(items, { confirmed: ['a'], modified: ['b'], deleted: [], comments: { b: '向北弯一些' }, notes: { unknown: '备注' } }).error).toContain('未知地形')
  })

  it('图纸签名不受要素数组顺序影响，但正式几何变化会失效', () => {
    const a = { id: 'a', kind: 'region', category: 'grass', name: 'A', layer: 'terrain', geometry: { pts: [[0, 0], [1, 0], [0, 1]] } }
    const b = { id: 'b', kind: 'path', category: 'road', name: 'B', layer: 'civic', geometry: { pts: [[0, 0], [2, 2]] } }
    const first = createMapSheetRevision({ id: 'sheet-1', features: [a, b] })
    expect(createMapSheetRevision({ id: 'sheet-1', features: [b, a] })).toBe(first)
    expect(createMapSheetRevision({ id: 'sheet-1', features: [a, { ...b, geometry: { pts: [[0, 0], [3, 3]] } }] })).not.toBe(first)
  })

  it('确认前地图已变化时拒绝提交过期草稿', async () => {
    const original = { id: 'a', kind: 'region', category: 'grass', name: 'A', layer: 'terrain', geometry: { pts: [[0, 0], [1, 0], [0, 1]] } }
    const request = {
      kind: 'map-final-draft-review', worldId: 'world-1', sheetId: 'sheet-1', title: '审阅',
      baseRevision: createMapSheetRevision({ id: 'sheet-1', features: [original] }),
      items: [{ id: 'draft-1' }]
    }
    const result = await runMapDraftReviewGate({
      request,
      review: async () => ({ status: 'submitted', decision: { confirmed: ['draft-1'], modified: [], deleted: [], comments: {} } }),
      reloadSheet: async () => ({ id: 'sheet-1', features: [{ ...original, name: '已被别人改名' }] })
    })
    expect(result.status).toBe('stale')
  })
})
