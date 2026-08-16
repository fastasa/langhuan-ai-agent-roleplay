import { describe, expect, it } from 'vitest'
import {
  projectToolDetails,
  resolveFieldLifecycle
} from '../../../src/app/agentState/toolDetailsProjection.ts'

describe('projectToolDetails（字段生命周期标签压缩器·R3-1）', () => {
  it('按标签把 details 拆成 durable / searchable，transient 丢弃', () => {
    const details = { fact: '改了角色2', hits: [{ id: 1 }], cursor: 'tmp' }
    const out = projectToolDetails(details, undefined, {
      fact: 'durable',
      hits: 'searchable',
      cursor: 'transient'
    })
    expect(out.durable).toEqual({ fact: '改了角色2' })
    expect(out.searchable).toEqual({ hits: [{ id: 1 }] })
    // transient 既不进 durable 也不进 searchable
    expect('cursor' in out.durable).toBe(false)
    expect('cursor' in out.searchable).toBe(false)
  })

  it('未声明字段按 DEFAULT_FIELD_LIFECYCLE（searchable）兜底，不静默丢数据', () => {
    const out = projectToolDetails({ unknown: 42 }, undefined, undefined)
    expect(out.searchable).toEqual({ unknown: 42 })
    expect(out.durable).toEqual({})
  })

  it('单次 lifecycle 覆盖工具静态 fieldLifecycle', () => {
    const out = projectToolDetails(
      { reads: ['a'] },
      { reads: 'durable' }, // 本次覆盖
      { reads: 'searchable' } // 工具静态
    )
    expect(out.durable).toEqual({ reads: ['a'] })
    expect(out.searchable).toEqual({})
  })

  it('details 为空/非对象返回两份空对象、不抛错', () => {
    expect(projectToolDetails(undefined, undefined, undefined)).toEqual({ durable: {}, searchable: {} })
    expect(projectToolDetails(null, undefined, undefined)).toEqual({ durable: {}, searchable: {} })
  })
})

describe('resolveFieldLifecycle（标签优先级）', () => {
  it('优先级：单次覆盖 > 工具静态 > 默认 searchable', () => {
    expect(resolveFieldLifecycle('x', { x: 'durable' }, { x: 'transient' })).toBe('durable')
    expect(resolveFieldLifecycle('x', undefined, { x: 'transient' })).toBe('transient')
    expect(resolveFieldLifecycle('x', undefined, undefined)).toBe('searchable')
  })
})
