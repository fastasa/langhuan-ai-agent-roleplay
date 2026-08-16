import { describe, expect, it } from 'vitest'
import { colorStats } from '@/pixel-studio/core/stats'

describe('pixel-studio/core/stats', () => {
  it('跨全部帧统计格数并按 count 降序排列，含透明格', () => {
    const doc = {
      version: 3,
      name: 'demo',
      width: 2,
      height: 1,
      frames: [
        { id: 'f1', durationMs: 200, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1a1'] }] },
        { id: 'f2', durationMs: 200, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1..'] }] }
      ],
      playback: { loop: true }
    }
    const stats = colorStats(doc)
    // a1 出现 3 次，'..' 出现 1 次，总格数 4
    expect(stats[0]).toEqual({ code: 'a1', hex: '#ff0000', count: 3, pct: 0.75 })
    expect(stats[1]).toEqual({ code: '..', hex: null, count: 1, pct: 0.25 })
    expect(stats).toHaveLength(2)
  })
})
