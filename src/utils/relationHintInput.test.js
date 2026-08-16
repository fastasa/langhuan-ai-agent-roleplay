import { describe, expect, it } from 'vitest'
import { applyRelationHintBracketCompletion } from './relationHintInput'

describe('applyRelationHintBracketCompletion', () => {
  it('adds closing brackets after typing opening relation brackets', () => {
    expect(applyRelationHintBracketCompletion('[[', 2, 2)).toEqual({
      value: '[[]]',
      selectionStart: 2,
      selectionEnd: 2,
      completed: true
    })
  })

  it('keeps the cursor between brackets in the middle of existing text', () => {
    expect(applyRelationHintBracketCompletion('关系 [[ 提示', 5, 5)).toEqual({
      value: '关系 [[]] 提示',
      selectionStart: 5,
      selectionEnd: 5,
      completed: true
    })
  })

  it('does not duplicate closing brackets', () => {
    expect(applyRelationHintBracketCompletion('[[]]', 2, 2)).toEqual({
      value: '[[]]',
      selectionStart: 2,
      selectionEnd: 2,
      completed: false
    })
  })

  it('does not complete selected text edits', () => {
    expect(applyRelationHintBracketCompletion('[[文档', 2, 4)).toEqual({
      value: '[[文档',
      selectionStart: 2,
      selectionEnd: 4,
      completed: false
    })
  })
})
