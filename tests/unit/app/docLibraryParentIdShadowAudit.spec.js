import { describe, expect, it } from 'vitest'
import {
  buildDocLibraryParentIdShadowAudit,
  renderDocLibraryParentIdShadowAuditReport
} from '../../../src/app/docLibraryParentIdShadowAudit'

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '镜庭主城',
    displayPath: '/亚什基诺/地点/镜庭主城.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '摘要',
    tags: ['地点'],
    content: '正文',
    publicCompilePage: {
      summary: '摘要',
      tags: ['地点'],
      relationHints: [],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-26T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-26T00:00:00.000Z',
    updatedAt: '2026-04-26T00:00:00.000Z',
    ...overrides
  }
}

describe('docLibraryParentIdShadowAudit', () => {
  it('builds a read-only parentId shadow tree without changing document unit ids', () => {
    const report = buildDocLibraryParentIdShadowAudit([
      createDocument(),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        stableId: 'doc_2',
        title: '夜巡者',
        displayPath: '/亚什基诺/组织/夜巡者.md'
      })
    ], {
      '__root__': ['folder:/亚什基诺'],
      '/亚什基诺': ['folder:/亚什基诺/组织', 'folder:/亚什基诺/地点'],
      '/亚什基诺/地点': ['document:doc_1'],
      '/亚什基诺/组织': ['document:doc_2']
    }, {
      generatedAt: '2026-04-26T00:00:00.000Z'
    })

    const documentNode = report.nodes.find((node) => node.sourceDocumentId === 'doc_1')
    const branchNode = report.nodes.find((node) => node.displayPath === '/亚什基诺/地点')

    expect(documentNode).toMatchObject({
      unitId: 'doc:doc_1',
      kind: 'document',
      displayPath: '/亚什基诺/地点/镜庭主城.md',
      parentId: branchNode?.unitId,
      orderIndex: 0
    })
    expect(report.summary).toMatchObject({
      documentCount: 2,
      stableDocIdChanged: 0,
      roundtripMismatchCount: 0,
      manualOrderOrphanCount: 0,
      manualOrderWrongParentCount: 0,
      canRoundtripLosslessly: true,
      suitableForFormalMigration: true
    })
    expect(report.issues).toEqual([])
  })

  it('reports duplicate paths and manual order noise instead of forcing migration', () => {
    const report = buildDocLibraryParentIdShadowAudit([
      createDocument(),
      createDocument({
        documentId: 'doc_dup',
        id: 'doc_dup',
        stableId: 'doc_dup',
        title: '镜庭主城副本',
        displayPath: '/亚什基诺/地点/镜庭主城.md'
      })
    ], {
      '/亚什基诺': ['document:doc_1', 'document:missing'],
      '/不存在': ['document:doc_dup']
    }, {
      generatedAt: '2026-04-26T00:00:00.000Z'
    })

    expect(report.summary.suitableForFormalMigration).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'duplicate_display_path',
      'manual_order_entry_wrong_parent',
      'manual_order_entry_orphan',
      'manual_order_bucket_parent_missing'
    ]))
    expect(report.rollbackAssessment.conclusion).toContain('不能直接迁移')
  })

  it('renders a report that states the audit is read-only', () => {
    const report = buildDocLibraryParentIdShadowAudit([
      createDocument()
    ], {}, {
      generatedAt: '2026-04-26T00:00:00.000Z'
    })
    const markdown = renderDocLibraryParentIdShadowAuditReport(report)

    expect(markdown).toContain('没有写数据库')
    expect(markdown).toContain('没有改变导入导出 schema')
    expect(markdown).toContain('`doc:<documentId>`')
  })
})
