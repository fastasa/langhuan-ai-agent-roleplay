import { describe, expect, it } from 'vitest'
import { createTidiaoDocLibraryRetrievalContext } from '../../../src/app/tidiaoRetrievalContextFactory.ts'

describe('createTidiaoDocLibraryRetrievalContext（D2 文档库-only 取料·知识隔离）', () => {
  it('不需要角色参数即可构造（角色大脑隔离）；只产文档库单位、绝不含任何角色大脑', async () => {
    const ctx = createTidiaoDocLibraryRetrievalContext({ documents: [] })
    const units = ctx.listSearchableUnits()
    // 空文档库下仅有世界树根等文档库自身单位；关键隔离断言：unitId 全是文档库域（doc*），绝无角色大脑单位。
    expect(units.every((u) => /^doc/.test(u.unitId))).toBe(true)
    expect(ctx.resolveUnit('nonexistent')).toBeNull()
    // 无 embedTexts 时语义召回不报错（返回数组），且候选只来自文档库。
    const scored = await ctx.scoreCandidatesForQuery('落雁谷')
    expect(Array.isArray(scored)).toBe(true)
    expect(scored.every((c) => /^doc/.test(c.unitId))).toBe(true)
  })

  it('缺省 documents 也安全（按空文档库处理，不报错）', async () => {
    const ctx = createTidiaoDocLibraryRetrievalContext({})
    expect(Array.isArray(ctx.listSearchableUnits())).toBe(true)
    expect(Array.isArray(await ctx.scoreCandidatesForQuery('任意'))).toBe(true)
  })

  // 短码映射协议（2026-07-04）：中文路径文件夹的脏 unitId（doc-tree:~2F~E4…）出口换 u# 短码、
  // fetch 入口解码还原；模型不再需要抄写超长乱码 id。
  it('脏文件夹 unitId 出口换短码、短码可定点读取回同一单位，真实脏 id 仍可直读（向后兼容）', () => {
    const ctx = createTidiaoDocLibraryRetrievalContext({
      documents: [{
        documentId: 'doc_geo', id: 'doc_geo', stableId: 'doc_geo',
        title: '世界地理', displayPath: '/亚什基诺/地理/世界地理.md',
        documentType: 'generic_markdown', kind: 'generic_markdown',
        summary: '亚什基诺世界地理概览', tags: [], content: '球状星体，九块大陆，八片海洋。',
        sourceDocumentIds: [], relatedNeuronIds: [], versionState: 'confirmed',
        createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z'
      }]
    })
    const units = ctx.listSearchableUnits()
    // 出口：任何单位 id 都不再含 ~ 编码字节（脏文件夹 id 已换短码，文档 id 本就干净）。
    expect(units.length).toBeGreaterThan(0)
    expect(units.every((u) => !u.unitId.includes('~'))).toBe(true)
    const shortCoded = units.find((u) => u.unitId.startsWith('u#'))
    expect(shortCoded).toBeTruthy()
    // 入口：短码定点读取回同一单位。
    const resolved = ctx.resolveUnit(shortCoded.unitId)
    expect(resolved).not.toBeNull()
    expect(`${resolved.title}${resolved.summary}${resolved.body}`.length).toBeGreaterThan(0)
    // 向后兼容：真实脏 id（模型从别处抄来、如旧资料池留痕）仍可直读，不因短码协议失效。
    const dirtyId = 'doc-tree:' + encodeURIComponent('/亚什基诺').replace(/%/g, '~')
    expect(ctx.resolveUnit(dirtyId)).not.toBeNull()
  })
})
