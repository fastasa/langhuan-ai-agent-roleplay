import { describe, expect, it } from 'vitest'
import { diffWorldDraftField, diffWorldDraftText } from '../../../src/app/worldDraftTextDiff.ts'

describe('diffWorldDraftText', () => {
  it('marks identical texts as unchanged', () => {
    const diff = diffWorldDraftText('一行\n二行', '一行\n二行')
    expect(diff.changed).toBe(false)
    expect(diff.incomingLines.every((line) => line.kind === 'same')).toBe(true)
  })

  it('marks pure additions as added without touching existing lines', () => {
    const diff = diffWorldDraftText('一行\n二行', '一行\n二行\n三行新增')
    expect(diff.changed).toBe(true)
    expect(diff.existingLines.map((line) => line.kind)).toEqual(['same', 'same'])
    expect(diff.incomingLines.map((line) => line.kind)).toEqual(['same', 'same', 'added'])
    expect(diff.incomingLines[2].text).toBe('三行新增')
  })

  it('pairs adjacent delete+insert as modified on both sides', () => {
    const diff = diffWorldDraftText('标题\n旧内容\n结尾', '标题\n新内容\n结尾')
    expect(diff.existingLines.map((line) => line.kind)).toEqual(['same', 'modified', 'same'])
    expect(diff.incomingLines.map((line) => line.kind)).toEqual(['same', 'modified', 'same'])
  })

  it('keeps unpaired remainder as removed/added', () => {
    const diff = diffWorldDraftText('标题\n旧A\n旧B\n结尾', '标题\n新A\n结尾')
    expect(diff.existingLines.map((line) => line.kind)).toEqual(['same', 'modified', 'removed', 'same'])
    expect(diff.incomingLines.map((line) => line.kind)).toEqual(['same', 'modified', 'same'])
  })

  it('falls back to plain rendering above the size guard', () => {
    const big = Array.from({ length: 700 }, (_, index) => `旧${index}`).join('\n')
    const bigNew = Array.from({ length: 700 }, (_, index) => `新${index}`).join('\n')
    const diff = diffWorldDraftText(big, bigNew)
    expect(diff.changed).toBe(true)
    expect(diff.incomingLines.every((line) => line.kind === 'same')).toBe(true)
  })
})

describe('diffWorldDraftField', () => {
  it('classifies same / added / modified', () => {
    expect(diffWorldDraftField('一样', '一样')).toBe('same')
    expect(diffWorldDraftField('', '库里没有')).toBe('added')
    expect(diffWorldDraftField('旧摘要', '新摘要')).toBe('modified')
  })
})
