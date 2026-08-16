import { describe, expect, it } from 'vitest'
import {
  normalizeRelationProfileExtractOutput,
  mergeRelationProfileContent,
  parseRelationProfileContent,
  buildRelationProfileSummary,
  formatRelationProfileForRecall
} from '../../../src/app/relationProfileWriteback'

describe('R2 关系画像提炼输出归一化', () => {
  it('解析 JSON 并过滤空项', () => {
    const out = normalizeRelationProfileExtractOutput(
      '```json\n{"explicit":[{"key":"称呼","value":"用户"},{"key":"","value":"x"}],"implicit":["爱撒娇",{"text":""}]}\n```'
    )
    expect(out.explicit).toEqual([{ key: '称呼', value: '用户' }])
    expect(out.implicit).toEqual([{ text: '爱撒娇' }])
  })

  it('非法输出抛错', () => {
    expect(() => normalizeRelationProfileExtractOutput('不是 JSON')).toThrow()
  })
})

describe('R2 关系画像合并', () => {
  it('空基线时直接写入新事实与特质', () => {
    const merged = mergeRelationProfileContent(null, {
      explicit: [{ key: '称呼', value: '用户' }],
      implicit: [{ text: '偏依赖' }]
    }, 't1')
    expect(merged.explicit).toEqual([{ key: '称呼', value: '用户', updatedAt: 't1' }])
    expect(merged.implicit).toEqual([{ text: '偏依赖', updatedAt: 't1' }])
  })

  it('值变化时压历史快照并标记 conflict', () => {
    const base = { explicit: [{ key: '关系定性', value: '朋友', updatedAt: 't1' }], implicit: [] }
    const merged = mergeRelationProfileContent(base, {
      explicit: [{ key: '关系定性', value: '恋人' }],
      implicit: []
    }, 't2')
    const fact = merged.explicit.find((f) => f.key === '关系定性')
    expect(fact.value).toBe('恋人')
    expect(fact.conflict).toBe(true)
    expect(fact.history).toEqual([{ value: '朋友', at: 't1' }])
  })

  it('值相同只刷新时间，不标冲突', () => {
    const base = { explicit: [{ key: '称呼', value: '用户', updatedAt: 't1' }], implicit: [] }
    const merged = mergeRelationProfileContent(base, { explicit: [{ key: '称呼', value: '用户' }], implicit: [] }, 't2')
    const fact = merged.explicit[0]
    expect(fact.value).toBe('用户')
    expect(fact.updatedAt).toBe('t2')
    expect(fact.conflict).toBeUndefined()
  })

  it('implicit 去重追加', () => {
    const base = { explicit: [], implicit: [{ text: '偏依赖', updatedAt: 't1' }] }
    const merged = mergeRelationProfileContent(base, {
      explicit: [],
      implicit: [{ text: '偏依赖' }, { text: '怕黑' }]
    }, 't2')
    expect(merged.implicit.map((t) => t.text)).toEqual(['偏依赖', '怕黑'])
  })

  it('批 F implicit 语义去重：近似措辞只刷新时间，保留旧文本不追加新条目', () => {
    const base = {
      explicit: [],
      implicit: [{ text: '在互动中虽偶有抱怨或推拒，但最终会主动配合并满足对方需求，形成矛盾但稳定的行为模式', updatedAt: 't1' }]
    }
    const merged = mergeRelationProfileContent(base, {
      explicit: [],
      implicit: [
        { text: '在互动中虽偶有警告或抱怨，但最终会主动配合并满足对方需求，形成矛盾但稳定的行为模式' },
        { text: '怕黑' }
      ]
    }, 't2')
    expect(merged.implicit).toHaveLength(2)
    // 命中相似旧条目：保留旧文本、刷新时间（重复观察=印象续命）
    expect(merged.implicit[0]).toEqual({
      text: '在互动中虽偶有抱怨或推拒，但最终会主动配合并满足对方需求，形成矛盾但稳定的行为模式',
      updatedAt: 't2'
    })
    expect(merged.implicit[1].text).toBe('怕黑')
  })

  it('批 F implicit 存量近似重复在合并时清理，相似组只保留更新的一条', () => {
    const base = {
      explicit: [],
      implicit: [
        { text: '在性互动中虽偶有警告或抱怨，但最终会主动配合并满足对方需求，形成矛盾但稳定的行为模式。', updatedAt: 't1' },
        { text: '在性互动中虽偶有抱怨或推拒，但最终会主动配合并满足对方需求，形成矛盾但稳定的行为模式。', updatedAt: 't3' }
      ]
    }
    const merged = mergeRelationProfileContent(base, { explicit: [], implicit: [] }, 't4')
    expect(merged.implicit).toHaveLength(1)
    expect(merged.implicit[0].updatedAt).toBe('t3')
  })
})

describe('批 F 关系画像时间衰减（召回注入侧）', () => {
  const now = '2026-06-10T00:00:00.000Z'

  it('新鲜印象正常注入、较早印象带标记、超 45 天退场、explicit 不衰减', () => {
    const text = formatRelationProfileForRecall({
      explicit: [{ key: '称呼', value: '用户', updatedAt: '2026-01-01T00:00:00.000Z' }],
      implicit: [
        { text: '最近爱喝奶茶', updatedAt: '2026-06-05T00:00:00.000Z' },
        { text: '此前偏依赖', updatedAt: '2026-05-01T00:00:00.000Z' },
        { text: '很久以前怕黑', updatedAt: '2026-03-01T00:00:00.000Z' }
      ]
    }, now)
    expect(text).toContain('- 称呼：用户')
    expect(text).toContain('- 最近爱喝奶茶')
    expect(text).not.toContain('最近爱喝奶茶（较早印象）')
    expect(text).toContain('- 此前偏依赖（较早印象）')
    expect(text).not.toContain('很久以前怕黑')
  })

  it('implicit 最多注入 12 条，按更新时间从新到旧排序', () => {
    const implicit = Array.from({ length: 15 }, (_, index) => ({
      text: `第${index + 1}条独立印象记录`,
      updatedAt: `2026-06-09T00:00:${String(index).padStart(2, '0')}.000Z`
    }))
    const text = formatRelationProfileForRecall({ explicit: [], implicit }, now)
    const lines = text.split('\n').filter((line) => line.startsWith('- '))
    expect(lines).toHaveLength(12)
    // 最新的一条（秒数最大）排第一，最旧的三条被截掉
    expect(lines[0]).toContain('第15条独立印象记录')
    expect(text).not.toContain('第1条独立印象记录')
  })

  it('解析不出时间的旧数据按较早印象保留，不直接丢弃', () => {
    const text = formatRelationProfileForRecall({
      explicit: [],
      implicit: [{ text: '没有时间戳的旧印象', updatedAt: 't1' }]
    }, now)
    expect(text).toContain('- 没有时间戳的旧印象（较早印象）')
  })
})

describe('R2 关系画像内容解析与摘要', () => {
  it('parseRelationProfileContent 容错坏 JSON 返回 null', () => {
    expect(parseRelationProfileContent('坏 JSON')).toBeNull()
    expect(parseRelationProfileContent(null)).toBeNull()
  })

  it('parseRelationProfileContent 过滤无效项', () => {
    const parsed = parseRelationProfileContent(JSON.stringify({
      explicit: [{ key: '称呼', value: '用户' }, { key: '', value: 'x' }],
      implicit: [{ text: '偏依赖' }, { text: '' }]
    }))
    expect(parsed.explicit).toHaveLength(1)
    expect(parsed.implicit).toHaveLength(1)
  })

  it('buildRelationProfileSummary 生成短摘要且不含 JSON', () => {
    const summary = buildRelationProfileSummary('用户', {
      explicit: [{ key: '称呼', value: '用户', updatedAt: 't' }],
      implicit: [{ text: '偏依赖', updatedAt: 't' }]
    })
    expect(summary).toContain('对用户的认知')
    expect(summary).toContain('称呼:用户')
    expect(summary).not.toContain('{')
  })
})
