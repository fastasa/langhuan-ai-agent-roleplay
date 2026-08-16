import { describe, expect, it } from 'vitest'
import { parseStrictMentions, parseStrictUnknownMentions } from '../../../src/app/strictMentionParser.ts'

const candidates = [
  { id: 'char_xingyi', name: '星依', nicknames: ['女儿'], kind: 'formal' },
  { id: 'char_xingyi_teacher', name: '星依老师', kind: 'formal' }
]

describe('parseStrictMentions', () => {
  it('matches a role mention followed by whitespace', () => {
    const matches = parseStrictMentions('@星依 你怎么看', candidates)

    expect(matches.map(item => item.candidate.id)).toEqual(['char_xingyi'])
  })

  it('matches a role mention at the end of the input', () => {
    const matches = parseStrictMentions('请 @星依', candidates)

    expect(matches.map(item => item.candidate.id)).toEqual(['char_xingyi'])
  })

  it('does not treat punctuation-attached text as an unknown mention', () => {
    expect(parseStrictUnknownMentions('@星依，继续', [])).toEqual([])
  })

  it('does not match a role name immediately followed by body text', () => {
    const matches = parseStrictMentions('@星依你怎么看', candidates)

    expect(matches).toEqual([])
  })

  it('uses the longest label before shorter same-prefix names', () => {
    const matches = parseStrictMentions('@星依老师 请回答', candidates)

    expect(matches.map(item => item.candidate.id)).toEqual(['char_xingyi_teacher'])
  })

  it('matches nicknames with the same strict boundary', () => {
    expect(parseStrictMentions('@女儿 ', candidates).map(item => item.candidate.id)).toEqual(['char_xingyi'])
    expect(parseStrictMentions('@女儿继续', candidates)).toEqual([])
  })
})
