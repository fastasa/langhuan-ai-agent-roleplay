import { describe, expect, it } from 'vitest'
import {
  filterDocumentsByWorldScope,
  readDocLibraryDocumentIdFromUnitId,
  readSessionWorldDocLibraryScope
} from '../../../src/app/worldDocLibraryScope.ts'

describe('worldDocLibraryScope · 世界文档召回范围', () => {
  it('未挂世界时忽略残留文档 id，范围恒为空', () => {
    expect(readSessionWorldDocLibraryScope({ worldId: '', worldDocLibraryDocumentIds: ['doc_a'] })).toEqual({
      worldId: '',
      documentIds: []
    })
  })

  it('挂世界后去重规范化 documentIds，并按 documentId/id 过滤', () => {
    const scope = readSessionWorldDocLibraryScope({
      world_id: ' world_1 ',
      worldDocLibraryDocumentIds: ['doc_a', ' doc_a ', 'doc_b', '']
    })
    expect(scope).toEqual({ worldId: 'world_1', documentIds: ['doc_a', 'doc_b'] })
    expect(filterDocumentsByWorldScope(scope.documentIds, [
      { documentId: 'doc_a', title: 'A' },
      { id: 'doc_b', title: 'B' },
      { documentId: 'doc_c', title: 'C' }
    ])).toHaveLength(2)
  })

  it('可从世界池 unitId 无损还原 documentId，坏编码安全返回空', () => {
    const documentId = '目录/世界 A.md'
    const unitId = `doc:${encodeURIComponent(documentId).replace(/%/g, '~')}`
    expect(readDocLibraryDocumentIdFromUnitId(unitId)).toBe(documentId)
    expect(readDocLibraryDocumentIdFromUnitId('doc:~E0~A4')).toBe('')
    expect(readDocLibraryDocumentIdFromUnitId('brain:core')).toBe('')
  })
})
