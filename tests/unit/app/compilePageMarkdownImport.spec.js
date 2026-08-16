import { describe, expect, it } from 'vitest'
import { parseCompilePageMarkdown } from '../../../src/app/compilePageMarkdownImport'

describe('compilePageMarkdownImport', () => {
  it('parses the external AI markdown format used by compile page imports', () => {
    const result = parseCompilePageMarkdown(`# 琅嬛编译页

## 摘要
镜湖平原是亚什基诺核心粮食产区，连接清水河三角洲与天镜湖周边交通。

## 标签
- 地理
- 粮食
- 平原

## 类型
terrain

## 关系提示
\`\`\`text
[[镜湖平原]]_位于_[[亚什基诺]]
[[镜湖平原]]_产出_[[粮食]]
\`\`\`
`)

    expect(result.semanticType).toBe('terrain')
    expect(result.compilePage.summary).toContain('核心粮食产区')
    expect(result.compilePage.tags).toEqual(['地理', '粮食', '平原'])
    expect(result.compilePage.relationHints).toEqual([
      '[[镜湖平原]]_位于_[[亚什基诺]]',
      '[[镜湖平原]]_产出_[[粮食]]'
    ])
  })

  it('treats explicit none as an empty relation hint list', () => {
    const result = parseCompilePageMarkdown(`# 琅嬛编译页

## 摘要
一段摘要。

## 标签
地理、湖泊

## 类型
unknown

## 关系提示
无
`)

    expect(result.semanticType).toBe('other')
    expect(result.compilePage.tags).toEqual(['地理', '湖泊'])
    expect(result.compilePage.relationHints).toEqual([])
  })
})
