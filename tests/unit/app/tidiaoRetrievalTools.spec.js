import { describe, expect, it } from 'vitest'
import {
  TIDIAO_RETRIEVAL_MAX_QUERIES,
  TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K,
  TIDIAO_SEMANTIC_RECALL_MAX_TOP_K,
  TIDIAO_TEXT_SEARCH_DEFAULT_LIMIT,
  TIDIAO_TEXT_SEARCH_MAX_LIMIT,
  normalizeRetrievalQueries,
  runTidiaoSemanticRecall,
  runTidiaoFetchUnit,
  runTidiaoTextSearch
} from '../../../src/app/tidiaoRetrievalTools.ts'

function makeContext({ scored = [], units = {}, searchable = [] } = {}) {
  return {
    scoreCandidatesForQuery: async () => scored,
    resolveUnit: (id) => units[id] ?? null,
    listSearchableUnits: () => searchable
  }
}

describe('提调语义召回工具逻辑（1b）', () => {
  it('按分降序取 topK，剔除 score<=0 的无效命中', async () => {
    const ctx = makeContext({
      scored: [
        { unitId: 'a', title: 'A', summary: 'sa', score: 0.3 },
        { unitId: 'b', title: 'B', summary: 'sb', score: 0.9 },
        { unitId: 'c', title: 'C', summary: 'sc', score: 0 },     // 剔除
        { unitId: 'd', title: 'D', summary: 'sd', score: -0.1 }   // 剔除
      ]
    })
    const result = await runTidiaoSemanticRecall({ query: '氛围', topK: 2 }, ctx)
    expect(result.hits.map((h) => h.unitId)).toEqual(['b', 'a'])
    expect(result.hits[0]).toEqual({ unitId: 'b', title: 'B', snippet: 'sb', score: 0.9 })
  })

  it('空 query 直接返回空命中，不打分', async () => {
    let called = false
    const ctx = { scoreCandidatesForQuery: async () => { called = true; return [] }, resolveUnit: () => null }
    const result = await runTidiaoSemanticRecall({ query: '   ' }, ctx)
    expect(result.hits).toEqual([])
    expect(called).toBe(false)
  })

  it('topK 缺省走默认值、超上限被夹住、非正数回退默认', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ unitId: `u${i}`, title: `T${i}`, summary: `s${i}`, score: 1 - i / 100 }))
    expect((await runTidiaoSemanticRecall({ query: 'q' }, makeContext({ scored: many }))).hits).toHaveLength(TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K)
    expect((await runTidiaoSemanticRecall({ query: 'q', topK: 999 }, makeContext({ scored: many }))).hits).toHaveLength(TIDIAO_SEMANTIC_RECALL_MAX_TOP_K)
    expect((await runTidiaoSemanticRecall({ query: 'q', topK: 0 }, makeContext({ scored: many }))).hits).toHaveLength(TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K)
  })
})

describe('提调定点读取工具逻辑（1b）', () => {
  const units = {
    hall: { title: '大厅', summary: '宽敞的大厅', body: '壁炉火光下长桌旁坐着陌生老人。' }
  }

  it('取摘要返回 summary', () => {
    expect(runTidiaoFetchUnit({ unitId: 'hall', level: 'summary' }, makeContext({ units })))
      .toEqual({ unitId: 'hall', title: '大厅', level: 'summary', content: '宽敞的大厅' })
  })

  it('取正文返回 body', () => {
    expect(runTidiaoFetchUnit({ unitId: 'hall', level: 'body' }, makeContext({ units })).content)
      .toBe('壁炉火光下长桌旁坐着陌生老人。')
  })

  it('取正文但正文为空时回退摘要', () => {
    const ctx = makeContext({ units: { x: { title: 'X', summary: '只有摘要', body: '' } } })
    expect(runTidiaoFetchUnit({ unitId: 'x', level: 'body' }, ctx).content).toBe('只有摘要')
  })

  it('找不到单位返回 null（不伪造内容）', () => {
    expect(runTidiaoFetchUnit({ unitId: '不存在', level: 'summary' }, makeContext({ units }))).toBeNull()
    expect(runTidiaoFetchUnit({ unitId: '  ', level: 'summary' }, makeContext({ units }))).toBeNull()
  })

  it('level 非法默认按 summary 处理', () => {
    expect(runTidiaoFetchUnit({ unitId: 'hall', level: 'xxx' }, makeContext({ units })).level).toBe('summary')
  })
})

describe('提调文本搜索工具逻辑（1c）', () => {
  const searchable = [
    { unitId: 'u1', title: '雾隐谷', summary: '北境一处终年起雾的山谷', text: '雾隐谷深处有古老祭坛。' },
    { unitId: 'u2', title: '北境概览', summary: '北境地理', text: '北境包含雾隐谷、寒铁城等地。' },
    { unitId: 'u3', title: '寒铁城', summary: '北境军镇', text: '以寒铁锻造闻名。' }
  ]

  it('专名字面命中，标题命中权重高于正文命中（排最前）', () => {
    const result = runTidiaoTextSearch({ query: '雾隐谷' }, makeContext({ searchable }))
    expect(result.hits.map((h) => h.unitId)).toEqual(['u1', 'u2'])
    // u1 标题命中，权重最高
    expect(result.hits[0].unitId).toBe('u1')
  })

  it('命中正文时片段取命中上下文', () => {
    const result = runTidiaoTextSearch({ query: '祭坛' }, makeContext({ searchable }))
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0].unitId).toBe('u1')
    expect(result.hits[0].snippet).toContain('祭坛')
  })

  it('忽略大小写匹配英文专名', () => {
    const ctx = makeContext({ searchable: [{ unitId: 'e1', title: 'Hogwarts', summary: '魔法学校', text: '位于苏格兰。' }] })
    expect(runTidiaoTextSearch({ query: 'hogwarts' }, ctx).hits[0].unitId).toBe('e1')
  })

  it('regex=true 走正则；非法正则回退字面不报错', () => {
    expect(runTidiaoTextSearch({ query: '寒铁|雾隐', regex: true }, makeContext({ searchable })).hits.length).toBeGreaterThanOrEqual(2)
    // 非法正则（未闭合括号）回退字面：字面 "(" 不存在于素材，命中 0，但不抛错
    expect(() => runTidiaoTextSearch({ query: '(', regex: true }, makeContext({ searchable }))).not.toThrow()
  })

  it('空 query 返回空；limit 缺省走默认、超上限被夹住', () => {
    expect(runTidiaoTextSearch({ query: '  ' }, makeContext({ searchable })).hits).toEqual([])
    const many = Array.from({ length: 40 }, (_, i) => ({ unitId: `m${i}`, title: `命中${i}`, summary: '', text: '' }))
    expect(runTidiaoTextSearch({ query: '命中' }, makeContext({ searchable: many })).hits).toHaveLength(TIDIAO_TEXT_SEARCH_DEFAULT_LIMIT)
    expect(runTidiaoTextSearch({ query: '命中', limit: 999 }, makeContext({ searchable: many })).hits).toHaveLength(TIDIAO_TEXT_SEARCH_MAX_LIMIT)
  })

  it('无命中返回空', () => {
    expect(runTidiaoTextSearch({ query: '不存在的专名' }, makeContext({ searchable })).hits).toEqual([])
  })
})

// 多关键词（2026-07-08）：queries 数组 OR 匹配 + 命中词标注 + 权重相加排序
describe('提调检索多关键词', () => {
  const searchable = [
    { unitId: 'u1', title: '雾隐谷', summary: '北境一处终年起雾的山谷', text: '雾隐谷深处有古老祭坛。' },
    { unitId: 'u2', title: '北境概览', summary: '北境地理', text: '北境包含雾隐谷、寒铁城等地。' },
    { unitId: 'u3', title: '寒铁城', summary: '北境军镇', text: '以寒铁锻造闻名。' }
  ]

  it('normalizeRetrievalQueries：合并 query+queries、去空白、按小写去重、截断上限', () => {
    expect(normalizeRetrievalQueries({ query: ' 雾隐谷 ', queries: ['寒铁城', '雾隐谷', 'Hogwarts', 'hogwarts', '', '  '] }))
      .toEqual(['雾隐谷', '寒铁城', 'Hogwarts'])
    expect(normalizeRetrievalQueries({ queries: Array.from({ length: 20 }, (_, i) => `词${i}`) }))
      .toHaveLength(TIDIAO_RETRIEVAL_MAX_QUERIES)
    expect(normalizeRetrievalQueries({})).toEqual([])
    expect(normalizeRetrievalQueries({ query: '', queries: 'not-an-array' })).toEqual([])
  })

  it('textSearch queries 数组：任一命中即返回，条目标注命中词，命中多词权重相加排前', () => {
    const result = runTidiaoTextSearch({ queries: ['雾隐谷', '寒铁'] }, makeContext({ searchable }))
    expect(result.hits.map((h) => h.unitId).sort()).toEqual(['u1', 'u2', 'u3'])
    const u2 = result.hits.find((h) => h.unitId === 'u2')
    expect(u2.matchedQueries).toEqual(['雾隐谷', '寒铁']) // 正文同时含两个词
    const u1 = result.hits.find((h) => h.unitId === 'u1')
    expect(u1.matchedQueries).toEqual(['雾隐谷'])
    // u1 标题命中（100+）> u3 标题命中（100+）> u2 两个正文命中（1+1）——标题权重仍主导
    expect(result.hits[0].unitId).toBe('u1')
    expect(result.hits[result.hits.length - 1].unitId).toBe('u2')
  })

  it('textSearch 单关键词不带 matchedQueries（避免噪音）；query 与 queries 并存时合并去重', () => {
    const single = runTidiaoTextSearch({ query: '雾隐谷' }, makeContext({ searchable }))
    expect(single.hits[0].matchedQueries).toBeUndefined()
    const merged = runTidiaoTextSearch({ query: '雾隐谷', queries: ['雾隐谷', '寒铁'] }, makeContext({ searchable }))
    expect(merged.hits.find((h) => h.unitId === 'u3').matchedQueries).toEqual(['寒铁'])
  })

  it('semantic queries 数组：各词分别打分、同单位取最高分合并、标注命中词', async () => {
    const scoreByQuery = {
      雾隐谷: [
        { unitId: 'a', title: 'A', summary: 'sa', score: 0.8 },
        { unitId: 'b', title: 'B', summary: 'sb', score: 0.2 }
      ],
      寒铁城: [
        { unitId: 'b', title: 'B', summary: 'sb', score: 0.9 },
        { unitId: 'c', title: 'C', summary: 'sc', score: 0 } // 无效分剔除
      ]
    }
    const ctx = {
      scoreCandidatesForQuery: async (query) => scoreByQuery[query] ?? [],
      resolveUnit: () => null,
      listSearchableUnits: () => []
    }
    const result = await runTidiaoSemanticRecall({ queries: ['雾隐谷', '寒铁城'] }, ctx)
    expect(result.hits.map((h) => h.unitId)).toEqual(['b', 'a']) // b 取最高分 0.9 排前
    expect(result.hits[0].score).toBe(0.9)
    expect(result.hits[0].matchedQueries).toEqual(['雾隐谷', '寒铁城'])
    expect(result.hits[1].matchedQueries).toEqual(['雾隐谷'])
  })

  it('semantic 单关键词不带 matchedQueries（旧行为零回归）', async () => {
    const ctx = {
      scoreCandidatesForQuery: async () => [{ unitId: 'a', title: 'A', summary: 'sa', score: 0.5 }],
      resolveUnit: () => null,
      listSearchableUnits: () => []
    }
    const result = await runTidiaoSemanticRecall({ query: '氛围' }, ctx)
    expect(result.hits[0].matchedQueries).toBeUndefined()
  })
})
