import { describe, expect, it } from 'vitest'
import { buildDocLibraryParentIdShadowAudit } from './docLibraryParentIdShadowAudit'

describe('buildDocLibraryParentIdShadowAudit', () => {
  it('classifies duplicated display paths as manual review items', () => {
    const report = buildDocLibraryParentIdShadowAudit([
      createDocument('doc_a', '/世界观/地点/大厅.md'),
      createDocument('doc_b', '/世界观/地点/大厅.md')
    ])

    expect(report.summary.duplicateDisplayPathGroupCount).toBe(1)
    expect(report.summary.blockerCount).toBe(1)
    expect(report.duplicateDisplayPathGroups[0]).toMatchObject({
      category: 'user_content_duplicate',
      suggestedAction: 'manual_review_before_field_tree',
      fixTiming: 'before_dual_write',
      blocksFormalMigration: true
    })
    expect(report.issues[0].details).toMatchObject({
      category: 'user_content_duplicate',
      suggestedAction: 'manual_review_before_field_tree'
    })
  })
})

function createDocument(documentId, displayPath) {
  return {
    documentId,
    id: documentId,
    stableId: documentId,
    title: displayPath.split('/').filter(Boolean).at(-1) || documentId,
    displayPath,
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '',
    tags: [],
    content: '',
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z'
  }
}
