import { describe, expect, it } from 'vitest'
import {
  PromptPresetOrderingValidationError,
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

  it('strict 拒绝非法顺序值，并返回稳定 code 和 fragmentId', () => {
    expect(() => sortPromptPresetsForAssembly([
      { id: 'bad', orderIndex: '1' }
    ], { strict: true })).toThrowError(expect.objectContaining({
      name: 'PromptPresetOrderingValidationError',
      code: 'prompt_preset_invalid_order',
      fragmentId: 'bad'
    }))
  })

  it('strict 拒绝同一 preset 的顺序别名冲突', () => {
    try {
      sortPromptPresetsForAssembly([
        { id: 'ambiguous', orderIndex: 1, order_index: 2 }
      ], { strict: true })
      throw new Error('预期 strict 校验失败')
    } catch (error) {
      expect(error).toBeInstanceOf(PromptPresetOrderingValidationError)
      expect(error).toMatchObject({
        code: 'prompt_preset_order_alias_conflict',
        fragmentId: 'ambiguous'
      })
    }
  })

  it('strict 拒绝两个 preset 的显式顺序冲突', () => {
    expect(() => normalizePromptPresetAssemblyOrder([
      { id: 'first', orderIndex: 3 },
      { id: 'second', position: 3 }
    ], { strict: true })).toThrowError(expect.objectContaining({
      code: 'prompt_preset_order_conflict',
      fragmentId: 'second'
    }))
  })

  it('strict 允许缺省顺序并继续使用稳定输入顺序', () => {
    const result = sortPromptPresetsForAssembly([
      { id: 'first' },
      { id: 'second' }
    ], { strict: true })

    expect(result.map((item) => item.id)).toEqual(['first', 'second'])
  })
})
