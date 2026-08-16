import { describe, expect, it } from 'vitest'
import {
  buildWorldDraftKey,
  buildWorldDraftPreview,
  mergeWorldDraftDocuments,
  parseWorldDraftContract
} from '../../../src/app/worldDraftImport.ts'

function makeContract(overrides = {}) {
  return {
    formatVersion: 1,
    provider: 'langhuan_world_draft',
    world: '亚什基诺',
    generatedAt: '2026-07-03T00:00:00.000Z',
    units: [
      {
        path: '规则与概念/能/肺能.md',
        title: '肺能',
        semanticType: 'ability',
        summary: '肺能摘要',
        tags: ['能'],
        relationHints: ['[[肺能]]_属于_[[能体系]]'],
        sourceId: 'doc-lung',
        content: '# 肺能\n正文'
      },
      {
        path: '文明/新文明.md',
        title: '新文明',
        semanticType: 'polity',
        summary: '',
        tags: [],
        relationHints: [],
        sourceId: null,
        content: '新文明正文第一行'
      }
    ],
    ...overrides
  }
}

function makeExistingDocument(overrides = {}) {
  return {
    documentId: 'doc-lung',
    id: 'doc-lung',
    stableId: 'doc-lung',
    title: '肺能',
    displayPath: '/亚什基诺/规则与概念/能/肺能.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    semanticType: 'ability',
    summary: '库里旧摘要',
    tags: ['旧标签'],
    content: '库里旧正文',
    publicCompilePage: {
      summary: '库里旧摘要',
      tags: ['旧标签'],
      relationHints: ['旧关系'],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-06-01T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  }
}

describe('parseWorldDraftContract', () => {
  it('accepts a valid contract and normalizes units', () => {
    const result = parseWorldDraftContract(makeContract())
    expect(result.ok).toBe(true)
    expect(result.contract.world).toBe('亚什基诺')
    expect(result.contract.units).toHaveLength(2)
    expect(result.contract.units[0].sourceId).toBe('doc-lung')
  })

  it('rejects wrong formatVersion and provider', () => {
    expect(parseWorldDraftContract(makeContract({ formatVersion: 2 })).ok).toBe(false)
    expect(parseWorldDraftContract(makeContract({ provider: 'sillytavern_worldbook' })).ok).toBe(false)
  })

  it('rejects duplicate unit paths', () => {
    const contract = makeContract()
    contract.units[1].path = contract.units[0].path
    const result = parseWorldDraftContract(contract)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('路径重复')
  })

  it('falls back invalid semanticType to other and fills default title', () => {
    const contract = makeContract()
    contract.units[1].semanticType = '不存在的类型'
    contract.units[1].title = ''
    const result = parseWorldDraftContract(contract)
    expect(result.ok).toBe(true)
    expect(result.contract.units[1].semanticType).toBe('other')
    expect(result.contract.units[1].title).toBe('新文明')
  })
})

describe('buildWorldDraftPreview', () => {
  it('marks units as new when the library has no match', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const preview = buildWorldDraftPreview(parsed.contract, { existingDocuments: [] })
    expect(preview.stats).toMatchObject({ unitCount: 2, newCount: 2, conflictCount: 0 })
    expect(preview.units.every((unit) => unit.status === 'new')).toBe(true)
    expect(preview.tree[0]).toMatchObject({ kind: 'folder', title: '亚什基诺' })
  })

  it('detects conflicts by sourceId even when the path moved', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const moved = makeExistingDocument({ displayPath: '/亚什基诺/旧位置/肺能.md' })
    const preview = buildWorldDraftPreview(parsed.contract, { existingDocuments: [moved] })
    const conflict = preview.units.find((unit) => unit.draftKey === 'source:doc-lung')
    expect(conflict.status).toBe('conflict')
    expect(conflict.matchKind).toBe('source_id')
    expect(conflict.existing).toMatchObject({
      documentId: 'doc-lung',
      summary: '库里旧摘要',
      relationHints: ['旧关系'],
      content: '库里旧正文'
    })
  })

  it('detects conflicts by displayPath for hand-written units', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const existing = makeExistingDocument({
      documentId: 'doc-other',
      id: 'doc-other',
      stableId: 'doc-other',
      displayPath: '/亚什基诺/文明/新文明.md'
    })
    const preview = buildWorldDraftPreview(parsed.contract, { existingDocuments: [existing] })
    const conflict = preview.units.find((unit) => unit.displayPath === '/亚什基诺/文明/新文明.md')
    expect(conflict.status).toBe('conflict')
    expect(conflict.matchKind).toBe('display_path')
  })
})

describe('mergeWorldDraftDocuments', () => {
  const now = '2026-07-03T08:00:00.000Z'

  it('adds new units and defaults unresolved conflicts to skip', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const merged = mergeWorldDraftDocuments({
      contract: parsed.contract,
      existingDocuments: [makeExistingDocument()],
      now
    })
    expect(merged.addedCount).toBe(1)
    expect(merged.skippedCount).toBe(1)
    expect(merged.overwrittenCount).toBe(0)
    expect(merged.nextDocuments).toHaveLength(2)
    const kept = merged.nextDocuments.find((item) => item.documentId === 'doc-lung')
    expect(kept.content).toBe('库里旧正文')
    expect(merged.outcomes.map((item) => item.outcome).sort()).toEqual(['added', 'skipped'])
  })

  it('overwrite keeps library identity and createdAt, stamps updatedFromSourceAt', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const draftKey = buildWorldDraftKey('亚什基诺', parsed.contract.units[0])
    const merged = mergeWorldDraftDocuments({
      contract: parsed.contract,
      resolutions: { [draftKey]: { action: 'overwrite' } },
      existingDocuments: [makeExistingDocument()],
      now
    })
    const overwritten = merged.nextDocuments.find((item) => item.documentId === 'doc-lung')
    expect(overwritten.content).toBe('# 肺能\n正文')
    expect(overwritten.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(overwritten.updatedAt).toBe(now)
    expect(overwritten.sourceMeta.provider).toBe('langhuan_world_draft')
    expect(overwritten.sourceMeta.updatedFromSourceAt).toBe(now)
    expect(merged.overwrittenCount).toBe(1)
    expect(merged.editedCount).toBe(0)
  })

  it('edited overwrite applies content and compile-page fields', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const draftKey = buildWorldDraftKey('亚什基诺', parsed.contract.units[0])
    const merged = mergeWorldDraftDocuments({
      contract: parsed.contract,
      resolutions: {
        [draftKey]: {
          action: 'overwrite',
          content: '用户改过的正文',
          summary: '用户改过的摘要',
          tags: ['新标签'],
          relationHints: ['[[肺能]]_影响_[[新对象]]']
        }
      },
      existingDocuments: [makeExistingDocument()],
      now
    })
    const edited = merged.nextDocuments.find((item) => item.documentId === 'doc-lung')
    expect(edited.content).toBe('用户改过的正文')
    expect(edited.summary).toBe('用户改过的摘要')
    expect(edited.tags).toEqual(['新标签'])
    expect(edited.publicCompilePage).toMatchObject({
      summary: '用户改过的摘要',
      tags: ['新标签'],
      relationHints: ['[[肺能]]_影响_[[新对象]]']
    })
    expect(merged.editedCount).toBe(1)
    expect(merged.outcomes.find((item) => item.draftKey === draftKey).outcome).toBe('edited_overwritten')
  })

  it('overwrite keeps the library displayPath when matched by sourceId at a moved path', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const draftKey = buildWorldDraftKey('亚什基诺', parsed.contract.units[0])
    const moved = makeExistingDocument({ displayPath: '/亚什基诺/旧位置/肺能.md' })
    const merged = mergeWorldDraftDocuments({
      contract: parsed.contract,
      resolutions: { [draftKey]: { action: 'overwrite' } },
      existingDocuments: [moved],
      now
    })
    const overwritten = merged.nextDocuments.find((item) => item.documentId === 'doc-lung')
    expect(overwritten.displayPath).toBe('/亚什基诺/旧位置/肺能.md')
  })

  it('never touches unrelated existing documents', () => {
    const parsed = parseWorldDraftContract(makeContract())
    const unrelated = makeExistingDocument({
      documentId: 'doc-unrelated',
      id: 'doc-unrelated',
      stableId: 'doc-unrelated',
      displayPath: '/别的世界/别的文档.md'
    })
    const merged = mergeWorldDraftDocuments({
      contract: parsed.contract,
      existingDocuments: [unrelated],
      now
    })
    const kept = merged.nextDocuments.find((item) => item.documentId === 'doc-unrelated')
    expect(kept).toEqual(unrelated)
  })
})
