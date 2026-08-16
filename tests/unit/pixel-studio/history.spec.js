import { describe, expect, it } from 'vitest'
import { createHistory } from '@/pixel-studio/core/history'
import { createDocument } from '@/pixel-studio/core/model'

describe('pixel-studio/core/history', () => {
  it('push 后可 undo 回到旧快照，undo 后可 redo 回到新状态', () => {
    const history = createHistory()
    const v1 = createDocument({ name: 'v1', width: 1, height: 1 })

    history.push(v1) // 编辑前记录 v1
    const v2 = { ...v1, name: 'v2' }

    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)

    const undone = history.undo(v2)
    expect(undone.name).toBe('v1')
    expect(history.canRedo()).toBe(true)
    expect(history.canUndo()).toBe(false)

    const redone = history.redo(undone)
    expect(redone.name).toBe('v2')
    expect(history.canRedo()).toBe(false)
    expect(history.canUndo()).toBe(true)
  })

  it('undo/redo 栈空时返回 null', () => {
    const history = createHistory()
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    expect(history.undo(doc)).toBeNull()
    expect(history.redo(doc)).toBeNull()
  })

  it('新 push 会清空 redo 栈', () => {
    const history = createHistory()
    const v1 = createDocument({ name: 'v1', width: 1, height: 1 })
    history.push(v1)
    const v2 = { ...v1, name: 'v2' }
    history.undo(v2)
    expect(history.canRedo()).toBe(true)

    history.push(v1) // 新编辑发生
    expect(history.canRedo()).toBe(false)
  })

  it('超过 limit 时丢弃最旧快照', () => {
    const history = createHistory(2)
    const base = createDocument({ name: 'base', width: 1, height: 1 })
    history.push({ ...base, name: 'v1' })
    history.push({ ...base, name: 'v2' })
    history.push({ ...base, name: 'v3' }) // 超过 limit=2，v1 应被丢弃

    const current = { ...base, name: 'v4' }
    const u1 = history.undo(current) // 弹出 v3
    expect(u1.name).toBe('v3')
    const u2 = history.undo(u1) // 弹出 v2
    expect(u2.name).toBe('v2')
    expect(history.canUndo()).toBe(false) // v1 已被丢弃
  })

  it('clear 清空两个栈', () => {
    const history = createHistory()
    const v1 = createDocument({ name: 'v1', width: 1, height: 1 })
    history.push(v1)
    history.undo({ ...v1, name: 'v2' })
    history.clear()
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)
  })
})
