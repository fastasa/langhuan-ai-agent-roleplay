import { describe, expect, it } from 'vitest'
import {
  buildCompactRelationMarkdown,
  parseCompactRelationMarkdown
} from './unitRelationCompactMarkdown.ts'

function unit(input) {
  return {
    domain: 'docLibrary',
    unitType: input.unitType || 'leaf',
    contentKind: 'markdown',
    status: 'normal',
    unitId: input.unitId,
    sourceId: input.sourceId,
    title: input.title,
    parentId: input.parentId,
    orderIndex: input.orderIndex || 0,
    body: input.body || '',
    compilePage: input.compilePage || { summary: input.summary || '', tags: [], relationHints: [] },
    metadata: { relationRefId: input.refId || input.sourceId }
  }
}

describe('unitRelationCompactMarkdown', () => {
  it('exports compact codes and restores relation hints through mapping', () => {
    const units = [
      unit({ unitId: 'root', sourceId: 'root', title: '亚什基诺', unitType: 'cluster', summary: '世界总览。', refId: 'doc:root', orderIndex: 0 }),
      unit({ unitId: 'mountain', sourceId: 'doc-mountain', parentId: 'root', title: '长白山山脉', summary: '北部重要山系。', refId: 'doc:mountain', orderIndex: 1 }),
      unit({ unitId: 'army', sourceId: 'doc-army', parentId: 'root', title: '北境军团', summary: '驻守山口的势力。', refId: 'doc:army', orderIndex: 2 })
    ]

    const result = buildCompactRelationMarkdown({
      units,
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      exportedAt: '2026-05-03T00:00:00.000Z',
      exportId: 'rel-test'
    })

    expect(result.markdown).toContain('exportId: rel-test')
    expect(result.markdown).toContain('u1 亚什基诺')
    expect(result.markdown).toContain('u2 长白山山脉')
    expect(result.markdown).toContain('u3 北境军团')

    const parsed = parseCompactRelationMarkdown(`
# 琅嬛关系整合结果
exportId: rel-test
\`\`\`text
u3 控制 u2
\`\`\`
`, result.mapping)

    expect(parsed.warnings).toEqual([])
    expect(parsed.relationHintsByUnitId.get('army')).toEqual([
      '[[北境军团@doc:army]]_控制_[[长白山山脉@doc:mountain]]'
    ])
  })

  it('exports compact relation material with relation-only short-code rules', () => {
    const result = buildCompactRelationMarkdown({
      units: [
        unit({ unitId: 'root', sourceId: 'root', title: '亚什基诺', unitType: 'cluster', summary: '世界总览。', refId: 'doc:root' })
      ],
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      exportedAt: '2026-05-03T00:00:00.000Z',
      exportId: 'rel-test'
    })

    expect(result.markdown).toContain('本材料不是树目录复述任务')
    expect(result.markdown).toContain('代号只能使用 u1 到 u9999，不能有空格')
    expect(result.markdown).toContain('关系行只能写三段：源代号 谓词 目标代号')
    expect(result.markdown).toContain('不要写解释、标题列表、单位原名或正式 ID')
    expect(result.markdown).toContain('请忽略这种页面指称，只看里面的实体事实')
  })

  it('exports v2 prompt with scan steps and predicate mapping', () => {
    const result = buildCompactRelationMarkdown({
      units: [
        unit({ unitId: 'root', sourceId: 'root', title: '亚什基诺', unitType: 'cluster', summary: '世界总览。', refId: 'doc:root' })
      ],
      rootUnitIds: ['root'],
      sourceLabel: '亚什基诺',
      exportedAt: '2026-05-03T00:00:00.000Z',
      exportId: 'rel-test',
      promptVersion: 'v2'
    })

    expect(result.markdown).toContain('promptVersion: v2')
    expect(result.markdown).toContain('具体、立体、复杂、优美的关系网络')
    expect(result.markdown).toContain('## 扫描步骤')
    expect(result.markdown).toContain('## 谓词折算')
    expect(result.markdown).toContain('栖息于、驻扎于、分布于、出现于、发生于 -> 活动于')
    expect(result.markdown).toContain('少于 30 条前')
  })

  it('rejects missing mapping, unknown codes and invalid predicates', () => {
    const parsed = parseCompactRelationMarkdown(`
exportId: rel-test
u1 胡写 u2
u9 控制 u1
`, {
      exportId: 'rel-test',
      sourceLabel: '测试',
      createdAt: '2026-05-03T00:00:00.000Z',
      entries: [
        { code: 'u1', unitId: 'a', refId: 'doc:a', title: 'A' },
        { code: 'u2', unitId: 'b', refId: 'doc:b', title: 'B' }
      ]
    })

    expect(parsed.relationHintsByUnitId.size).toBe(0)
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(['invalid_predicate', 'unknown_code'])
  })

  it('accepts common AI bullet and numbered relation result lines', () => {
    const parsed = parseCompactRelationMarkdown(`
# 琅嬛关系整合结果
exportId: rel-test
\`\`\`text
- u1 控制 u2。
1. u2 贸易 u1
\`\`\`
`, {
      exportId: 'rel-test',
      sourceLabel: '测试',
      createdAt: '2026-05-03T00:00:00.000Z',
      entries: [
        { code: 'u1', unitId: 'a', refId: 'doc:a', title: 'A' },
        { code: 'u2', unitId: 'b', refId: 'doc:b', title: 'B' }
      ]
    })

    expect(parsed.warnings).toEqual([])
    expect(parsed.relationHintsByUnitId.get('a')).toEqual(['[[A@doc:a]]_控制_[[B@doc:b]]'])
    expect(parsed.relationHintsByUnitId.get('b')).toEqual(['[[B@doc:b]]_贸易_[[A@doc:a]]'])
  })
})
