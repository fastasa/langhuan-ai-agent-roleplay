import { describe, expect, it } from 'vitest'
import {
  assignPromptPresetAssemblyOrder,
  normalizePromptPresetAssemblyOrder,
  sortPromptPresetsForAssembly
} from '../../../src/app/promptPresetOrdering.ts'

describe('promptPresetOrdering', () => {
  it('按 orderIndex 作为唯一装配顺序真值排序，priority 不参与排序', () => {
    const result = sortPromptPresetsForAssembly([
      { id: 'later', orderIndex: 2, priority: 0 },
      { id: 'first', orderIndex: 0, priority: 99 },
      { id: 'middle', order_index: 1, priority: 1 }
    ])

    expect(result.map((item) => item.id)).toEqual(['first', 'middle', 'later'])
  })

  it('规整顺序时会重建连续 orderIndex 以便持久化', () => {
    const result = normalizePromptPresetAssemblyOrder([
      { id: 'b', orderIndex: 30 },
      { id: 'a', orderIndex: 10 }
    ])

    expect(result).toEqual([
      { id: 'a', orderIndex: 0 },
      { id: 'b', orderIndex: 1 }
    ])
  })

  it('拖动后写入顺序时保留当前数组顺序，不按旧 orderIndex 排回去', () => {
    const result = assignPromptPresetAssemblyOrder([
      { id: 'later', orderIndex: 2 },
      { id: 'first', orderIndex: 0 }
    ])

    expect(result).toEqual([
      { id: 'later', orderIndex: 0 },
      { id: 'first', orderIndex: 1 }
    ])
  })
})
