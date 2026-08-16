import { describe, expect, it } from 'vitest'
import { createWorldDraftImportAppService } from '../../../server/application/docLibrary/worldDraftImportAppService.ts'

function makeContract() {
  return {
    formatVersion: 1,
    provider: 'langhuan_world_draft',
    world: '亚什基诺',
    units: [
      {
        path: '规则与概念/能/肺能.md',
        title: '肺能',
        semanticType: 'ability',
        summary: '肺能摘要',
        tags: ['能'],
        relationHints: [],
        sourceId: 'doc-lung',
        content: '# 肺能\n新正文'
      },
      {
        path: '文明/新文明.md',
        title: '新文明',
        semanticType: 'polity',
        summary: '新文明摘要',
        tags: [],
        relationHints: [],
        sourceId: null,
        content: '新文明正文'
      }
    ]
  }
}

function makeExistingDocument() {
  return {
    documentId: 'doc-lung',
    id: 'doc-lung',
    stableId: 'doc-lung',
    title: '肺能',
    displayPath: '/亚什基诺/规则与概念/能/肺能.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'ability',
    summary: '旧摘要',
    tags: [],
    content: '旧正文',
    publicCompilePage: {
      summary: '旧摘要',
      tags: [],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-06-01T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  }
}

function makeFakeRepository(existingDocuments = [], stored = {}) {
  const calls = { replacedRows: null, treeNodes: null, schemaVersion: null }
  return {
    calls,
    getDocuments: () => existingDocuments,
    replaceDocuments: (rows) => { calls.replacedRows = rows },
    getManualTreeOrders: () => ({}),
    getSchemaVersion: () => stored.schemaVersion ?? 1,
    getTreeNodes: () => stored.treeNodes ?? [],
    getTreeOrders: () => ({}),
    replaceManualTreeOrders: () => {},
    replaceSchemaVersion: (version) => { calls.schemaVersion = version },
    replaceTreeNodes: (nodes) => { calls.treeNodes = nodes },
    replaceTreeOrders: () => {},
    replaceTreeMigrationMeta: () => {},
    replaceTreeDiffReport: () => {}
  }
}

describe('worldDraftImportAppService', () => {
  it('preview reports new and conflict units against the repository', () => {
    const service = createWorldDraftImportAppService(makeFakeRepository([makeExistingDocument()]))
    const preview = service.preview({ contract: makeContract() })
    expect(preview.stats).toMatchObject({ unitCount: 2, newCount: 1, conflictCount: 1 })
    const conflict = preview.units.find((unit) => unit.status === 'conflict')
    expect(conflict.existing.content).toBe('旧正文')
  })

  it('apply merges incrementally with per-unit resolutions and writes through the field-tree gate', () => {
    const repository = makeFakeRepository([makeExistingDocument()])
    const service = createWorldDraftImportAppService(repository)
    const result = service.apply({
      contract: makeContract(),
      resolutions: { 'source:doc-lung': { action: 'overwrite', content: '决议后的正文' } }
    })
    expect(result).toMatchObject({
      ok: true,
      world: '亚什基诺',
      addedCount: 1,
      overwrittenCount: 1,
      editedCount: 1,
      skippedCount: 0,
      documentCount: 2
    })
    expect(repository.calls.replacedRows).toHaveLength(2)
    const overwrittenRow = repository.calls.replacedRows.find((row) => row.id === 'doc-lung')
    expect(overwrittenRow.content).toBe('决议后的正文')
    expect(repository.calls.schemaVersion).toBe(2)
    expect(Array.isArray(repository.calls.treeNodes)).toBe(true)
  })

  it('repairs legacy duplicate display paths from field-tree titles instead of blocking the import', () => {
    // 复现真机事故：库里多篇文档 display_path 停留在旧占位名（新桠.md），字段树标题才是真值
    const stalePath = '/亚什基诺/大学士/新桠.md'
    const staleDoc = (id, title) => ({
      ...makeExistingDocument(),
      documentId: id,
      id,
      stableId: id,
      title,
      displayPath: stalePath
    })
    const treeNodes = [
      { nodeId: 'doc-tree:root', nodeKind: 'root', parentId: null, title: '世界树', status: 'active' },
      { nodeId: 'f-world', nodeKind: 'folder', parentId: 'doc-tree:root', title: '亚什基诺', legacyDisplayPath: '/亚什基诺', status: 'active' },
      { nodeId: 'f-scholar', nodeKind: 'folder', parentId: 'f-world', title: '大学士', legacyDisplayPath: '/亚什基诺/大学士', status: 'active' },
      { nodeId: 'd-1', nodeKind: 'document', parentId: 'f-scholar', title: '特级大学士', documentId: 'doc-a', legacyDisplayPath: stalePath, status: 'active' },
      { nodeId: 'd-2', nodeKind: 'document', parentId: 'f-scholar', title: '高级大学士', documentId: 'doc-b', legacyDisplayPath: stalePath, status: 'active' }
    ]
    const repository = makeFakeRepository(
      [staleDoc('doc-a', '特级大学士'), staleDoc('doc-b', '高级大学士')],
      { schemaVersion: 2, treeNodes }
    )
    const service = createWorldDraftImportAppService(repository)

    const contract = makeContract()
    contract.units = [contract.units[1]]
    const preview = service.preview({ contract })
    expect(preview.stats).toMatchObject({ unitCount: 1, newCount: 1, conflictCount: 0 })

    const result = service.apply({ contract })
    expect(result.ok).toBe(true)
    const paths = repository.calls.replacedRows.map((row) => row.displayPath).sort()
    expect(paths).toEqual([
      '/亚什基诺/大学士/特级大学士.md',
      '/亚什基诺/大学士/高级大学士.md',
      '/亚什基诺/文明/新文明.md'
    ])
  })

  it('apply throws on an invalid contract without writing anything', () => {
    const repository = makeFakeRepository([])
    const service = createWorldDraftImportAppService(repository)
    expect(() => service.apply({ contract: { formatVersion: 9 } })).toThrow('世界观导入稿解析失败')
    expect(repository.calls.replacedRows).toBe(null)
  })
})
