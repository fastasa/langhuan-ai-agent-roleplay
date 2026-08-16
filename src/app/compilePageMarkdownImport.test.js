import { describe, expect, it } from 'vitest'
import {
  parseCompilePageMarkdown,
  parseCompilePageMarkdownBatch
} from './compilePageMarkdownImport.ts'

describe('compilePageMarkdownImport', () => {
  it('keeps single compile page imports compatible', () => {
    const parsed = parseCompilePageMarkdown(`# 琅嬛编译页

## 摘要
七大洲总览。

## 标签
- 地理
- 大陆

## 类型
world

## 关系提示
\`\`\`text
[[七大洲@doc-root]]_包含_[[尤拉西亚洲@doc-eurasia]]
\`\`\`
`)

    expect(parsed.semanticType).toBe('world')
    expect(parsed.compilePage.summary).toBe('七大洲总览。')
    expect(parsed.compilePage.tags).toEqual(['地理', '大陆'])
    expect(parsed.compilePage.relationHints).toEqual([
      '[[七大洲@doc-root]]_包含_[[尤拉西亚洲@doc-eurasia]]'
    ])
  })

  it('parses batch compile pages by target comments', () => {
    const parsed = parseCompilePageMarkdownBatch(`# 琅嬛批量编译页

<!-- target: 七大洲@doc-root -->

# 琅嬛编译页

## 摘要
七大洲总览。

## 标签
- 地理
- 大陆

## 类型
world

## 关系提示
\`\`\`text
[[七大洲@doc-root]]_包含_[[尤拉西亚洲@doc-eurasia]]
\`\`\`

<!-- target: 尤拉西亚洲@doc-eurasia -->

# 琅嬛编译页

## 摘要
尤拉西亚洲是一块信息完整的大陆。

## 标签
- 大陆
- 地貌

## 类型
region

## 关系提示
\`\`\`text
无
\`\`\`
`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0].targetTitle).toBe('七大洲')
    expect(parsed.entries[0].targetRefId).toBe('doc-root')
    expect(parsed.entries[0].semanticType).toBe('world')
    expect(parsed.entries[1].compilePage.relationHints).toEqual([])
  })

  it('keeps compact character brain target ids intact', () => {
    const parsed = parseCompilePageMarkdownBatch(`# 琅嬛批量编译页

<!-- target: 外貌特征@brain:char_1777803915751~3Aappearance -->

# 琅嬛编译页

## 摘要
惊雨外貌清秀，手上有长期握笔薄茧。

## 标签
- 外貌
- 书写员

## 类型
character

## 关系提示
\`\`\`text
无
\`\`\`
`)

    expect(parsed.warnings).toEqual([])
    expect(parsed.entries[0].targetTitle).toBe('外貌特征')
    expect(parsed.entries[0].targetRefId).toBe('brain:char_1777803915751~3Aappearance')
  })

  it('rejects batch entries without stable target ids and duplicate targets', () => {
    const parsed = parseCompilePageMarkdownBatch(`# 琅嬛批量编译页

<!-- target: 七大洲 -->

# 琅嬛编译页

## 摘要
缺少正式 ID。

## 标签
- 地理

## 类型
world

## 关系提示
无

<!-- target: 七大洲@doc-root -->

# 琅嬛编译页

## 摘要
第一次。

## 标签
- 地理

## 类型
world

## 关系提示
无

<!-- target: 七大洲@doc-root -->

# 琅嬛编译页

## 摘要
重复。

## 标签
- 地理

## 类型
world

## 关系提示
无
`)

    expect(parsed.entries).toHaveLength(1)
    expect(parsed.warnings.map((item) => item.code)).toEqual(['missing_target_ref', 'duplicate_target'])
  })
})
