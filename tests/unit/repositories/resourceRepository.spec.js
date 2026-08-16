import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { applyResolvedResourceState, resolveResourceState } from '../../../src/repositories/resourceRepository.ts'

describe('resourceRepository', () => {
  it('统一整理资源快照数据', () => {
    const resolved = resolveResourceState({
      resources: {
        points: '12',
        bigTimeCount: 3,
        smallTimeCount: null,
        money: '8'
      },
      tickets: [{ id: 't1', name: '票据' }],
      ticketCategories: [{ id: 'c1', name: '娱乐' }],
      history: [{ action: '测试' }]
    })

    expect(resolved.points).toBe(12)
    expect(resolved.bigTimeCount).toBe(3)
    expect(resolved.smallTimeCount).toBe(0)
    expect(resolved.money).toBe(8)
    expect(resolved.tickets).toHaveLength(1)
    expect(resolved.categories).toEqual(['娱乐'])
  })

  it('统一把解析后的资源状态写回 store 目标', () => {
    const target = {
      points: ref(0),
      bigTimeCount: ref(0),
      smallTimeCount: ref(0),
      money: ref(0),
      tickets: ref([]),
      ticketCategories: ref([]),
      history: ref([]),
      categories: ref(['默认'])
    }

    applyResolvedResourceState(target, resolveResourceState({
      resources: { points: 9, money: 6 },
      ticketCategories: [{ id: 'c1', name: '娱乐' }]
    }))

    expect(target.points.value).toBe(9)
    expect(target.money.value).toBe(6)
    expect(target.categories.value).toEqual(['娱乐'])
  })
})
