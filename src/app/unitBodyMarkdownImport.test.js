import { describe, expect, it } from 'vitest'
import { parseUnitBodyMarkdown, parseUnitBodyMarkdownBatch } from './unitBodyMarkdownImport.ts'

describe('unitBodyMarkdownImport', () => {
  it('parses a single body markdown block', () => {
    const parsed = parseUnitBodyMarkdown([
      '# 琅嬛正文',
      '',
      '## 字段',
      '- 副标题：十六岁以前',
      '- 简短摘要：早年经历被压缩成阶段正文。',
      '- 标签：早年、轨迹、待确认',
      '- 正式性：unconfirmed',
      '',
      '## 正文',
      '这一阶段保留为正文。'
    ].join('\n'))

    expect(parsed).toEqual({
      subtitle: '十六岁以前',
      summary: '早年经历被压缩成阶段正文。',
      tags: ['早年', '轨迹', '待确认'],
      confirmed: false,
      content: '这一阶段保留为正文。'
    })
  })

  it('parses batch target comments with stable refs', () => {
    const parsed = parseUnitBodyMarkdownBatch([
      '# 琅嬛批量正文',
      '',
      '<!-- target: 年枝@trace:year:001 -->',
      '',
      '## 字段',
      '- 副标题：十六岁以前',
      '- 简短摘要：早年经历。',
      '- 标签：早年、轨迹',
      '- 正式性：confirmed',
      '',
      '## 正文',
      '早年正文。',
      '',
      '<!-- target: 核心@brain:desc -->',
      '',
      '## 字段',
      '- 简短摘要：核心简介。',
      '',
      '## 正文',
      '核心正文。'
    ].join('\n'))

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries.map((entry) => [entry.targetTitle, entry.targetRefId, entry.content])).toEqual([
      ['年枝', 'trace:year:001', '早年正文。'],
      ['核心', 'brain:desc', '核心正文。']
    ])
  })
})
