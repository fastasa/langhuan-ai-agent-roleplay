import { describe, expect, it } from 'vitest'
import { moveSortDialogDraftItems } from './sortDialogDraft'

const items = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' }
]

describe('moveSortDialogDraftItems', () => {
  it('moves the first item to the bottom when moving up', () => {
    const result = moveSortDialogDraftItems(items, ['a'], -1)

    expect(result?.items.map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(result?.focusId).toBe('a')
    expect(result?.edge).toBe('bottom')
  })

  it('moves the last item to the top when moving down', () => {
    const result = moveSortDialogDraftItems(items, ['c'], 1)

    expect(result?.items.map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(result?.focusId).toBe('c')
    expect(result?.edge).toBe('top')
  })

  it('keeps selected groups together while wrapping', () => {
    const result = moveSortDialogDraftItems(items, ['a', 'b'], -1)

    expect(result?.items.map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(result?.focusId).toBe('a')
    expect(result?.edge).toBe('bottom')
  })
})
