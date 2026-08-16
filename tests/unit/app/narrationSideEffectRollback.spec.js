import { describe, expect, it, vi } from 'vitest'
import { rollbackPersistedNarrationMessages } from '../../../src/app/narrationSideEffectRollback.ts'

describe('rollbackPersistedNarrationMessages（批次5c 已落库半成品旁白回滚）', () => {
  it('逐条删除 >0 的旁白 id，返回已删列表', async () => {
    const deleteMessage = vi.fn(async () => {})
    const deleted = await rollbackPersistedNarrationMessages([101, 102], deleteMessage)
    expect(deleteMessage).toHaveBeenCalledTimes(2)
    expect(deleteMessage).toHaveBeenNthCalledWith(1, 101)
    expect(deleteMessage).toHaveBeenNthCalledWith(2, 102)
    expect(deleted).toEqual([101, 102])
  })

  it('先等旁白支线 settle 再删（顺序保证不漏删 abort 瞬间落库的旁白）', async () => {
    const order = []
    const completion = Promise.resolve().then(() => order.push('completion'))
    const deleteMessage = vi.fn(async (id) => { order.push(`delete:${id}`) })
    await rollbackPersistedNarrationMessages([7], deleteMessage, completion)
    expect(order).toEqual(['completion', 'delete:7'])
  })

  it('旁白支线 reject 不阻断回滚', async () => {
    const deleteMessage = vi.fn(async () => {})
    const completion = Promise.reject(new Error('旁白被取消'))
    const deleted = await rollbackPersistedNarrationMessages([5], deleteMessage, completion)
    expect(deleted).toEqual([5])
    expect(deleteMessage).toHaveBeenCalledWith(5)
  })

  it('忽略非法 id（0/负/NaN），不删它们', async () => {
    const deleteMessage = vi.fn(async () => {})
    const deleted = await rollbackPersistedNarrationMessages([0, -1, NaN, 9], deleteMessage)
    expect(deleteMessage).toHaveBeenCalledTimes(1)
    expect(deleteMessage).toHaveBeenCalledWith(9)
    expect(deleted).toEqual([9])
  })

  it('无 deleteMessage（管线未提供）→ 不删、返回空', async () => {
    const deleted = await rollbackPersistedNarrationMessages([1, 2], undefined)
    expect(deleted).toEqual([])
  })

  it('单条删除抛错被吞，继续删其余', async () => {
    const deleteMessage = vi.fn(async (id) => { if (id === 1) throw new Error('删除失败') })
    const deleted = await rollbackPersistedNarrationMessages([1, 2], deleteMessage)
    expect(deleteMessage).toHaveBeenCalledTimes(2)
    expect(deleted).toEqual([2]) // 1 删失败不计入
  })
})
