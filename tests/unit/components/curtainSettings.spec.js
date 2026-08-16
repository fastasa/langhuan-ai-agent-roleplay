import { describe, expect, it } from 'vitest'
import {
  createCurtainSettingsDraft,
  createCurtainTimeFlowPatch
} from '../../../src/components/app/script/curtainSettings.ts'

describe('curtainSettings', () => {
  it('保存可解析的帷幕时间时原子重建 base/anchor/rate', () => {
    const now = 1784210400000
    const patch = createCurtainTimeFlowPatch('2026-07-16T20:55:34', 1, now)

    expect(patch).toEqual({
      virtualTime: '2026-07-16T20:55:34',
      virtualTimeAnchor: now,
      virtualTimeBase: new Date(2026, 6, 16, 20, 55, 34).getTime(),
      virtualTimeRate: 1
    })
  })

  it('清空帷幕时间时同步清除旧流动时钟', () => {
    expect(createCurtainTimeFlowPatch('', 1, 1784210400000)).toEqual({
      virtualTime: '',
      virtualTimeAnchor: 0,
      virtualTimeBase: 0,
      virtualTimeRate: 1
    })
  })

  it('工作台从正式 base/anchor 投影当前流动时间，避免只改地点时把时间拨回旧起点', () => {
    const anchor = new Date(2026, 6, 16, 20, 0, 0).getTime()
    const base = new Date(2026, 6, 16, 10, 0, 0).getTime()
    const now = anchor + 30 * 60 * 1000

    const draft = createCurtainSettingsDraft({
      time: '2026-07-16T10:00:00',
      timeAnchor: anchor,
      timeBase: base,
      timeRate: 2
    }, now)

    expect(draft.time).toBe('2026-07-16T11:00:00')
  })
})
