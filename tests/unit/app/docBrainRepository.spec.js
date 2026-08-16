import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildBrainRecallCandidateCards,
  buildDocumentCompileCandidateCards,
  buildCharacterGroupChain,
  buildCharacterBrainPathPrefix,
  fetchDocLibraryState,
  fetchBrainNeurons,
  normalizeBrainDocumentRecord,
  normalizeBrainPublicCompilePage,
  normalizeBrainDocumentRecords,
  normalizeBrainNeuronRecord,
  resolveDocBrainState,
  saveDocLibraryState,
  saveBrainNeurons
} from '../../../src/repositories/docBrainRepository.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('doc brain repository', () => {
  it('会归一化文档与神经元字段，并保留正式字段名', () => {
    const documentRecord = normalizeBrainDocumentRecord({
      documentId: 'doc_1',
      title: '夜巡者',
      display_path: '/世界观/组织/夜巡者.md',
      document_type: 'worldview_organization',
      semantic_type: 'organization',
      source_document_ids: '["src_1"]',
      related_neuron_ids: ['brain_1'],
      version_state: 'confirmed',
      source_meta: JSON.stringify({
        provider: 'sillytavern_worldbook',
        sourceFileName: 'Ash测试.json',
        sourceEntryUid: '1',
        importedAt: '2026-04-15T00:00:00.000Z'
      })
    })
    const neuronRecord = normalizeBrainNeuronRecord({
      brain_neuron_id: 'brain_1',
      neuron_kind: 'public_reference',
      display_path: '/世界观/组织/夜巡者.md',
      title: '夜巡者',
      source_document_ids: ['doc_1'],
      related_neuron_ids: '["brain_2"]'
    })

    expect(documentRecord.documentId).toBe('doc_1')
    expect(documentRecord.id).toBe('doc_1')
    expect(documentRecord.stableId).toBe('doc_1')
    expect(documentRecord.documentType).toBe('worldview_organization')
    expect(documentRecord.semanticType).toBe('organization')
    expect(documentRecord.displayPath).toBe('/世界观/组织/夜巡者.md')
    expect(documentRecord.sourceDocumentIds).toEqual(['src_1'])
    expect(documentRecord.sourceMeta).toMatchObject({
      provider: 'sillytavern_worldbook',
      sourceFileName: 'Ash测试.json',
      sourceEntryUid: '1'
    })
    expect(documentRecord.publicCompilePage).toMatchObject({
      summary: '',
      sourceState: 'needs_review'
    })
    expect(documentRecord.versionState).toBe('confirmed')
    expect(neuronRecord.brainNeuronId).toBe('brain_1')
    expect(neuronRecord.relatedNeuronIds).toEqual(['brain_2'])
  })

  it('会批量归一化文档记录，并兼容旧 id 字段', () => {
    const records = normalizeBrainDocumentRecords([
      { id: 'doc_old', kind: 'daily_report', title: '旧日报' }
    ])

    expect(records[0]).toMatchObject({
      documentId: 'doc_old',
      id: 'doc_old',
      stableId: 'doc_old',
      documentType: 'daily_report',
      kind: 'daily_report',
      semanticType: 'other'
    })
  })

  it('会把非法单位语义类型归为 other', () => {
    const record = normalizeBrainDocumentRecord({
      id: 'doc_bad_type',
      semanticType: 'worldview_organization'
    })

    expect(record.semanticType).toBe('other')
  })

  it('会从快照数据解析 documents 和 brainNeurons', () => {
    const resolved = resolveDocBrainState({
      documents: [{ id: 'doc_1', title: '文档A' }],
      brainNeurons: [{ brainNeuronId: 'brain_1', title: '神经元A' }]
    })

    expect(resolved.hasDocuments).toBe(true)
    expect(resolved.hasBrainNeurons).toBe(true)
    expect(resolved.documents[0].title).toBe('文档A')
    expect(resolved.brainNeurons[0].title).toBe('神经元A')
  })

  it('会生成按更新时间倒序的召回候选卡', () => {
    const cards = buildBrainRecallCandidateCards([
      normalizeBrainNeuronRecord({
        brainNeuronId: 'brain_old',
        title: '旧记录',
        updatedAt: '2026-04-04T10:00:00.000Z'
      }),
      normalizeBrainNeuronRecord({
        brainNeuronId: 'brain_new',
        title: '新记录',
        updatedAt: '2026-04-04T12:00:00.000Z'
      })
    ])

    expect(cards.map((item) => item.id)).toEqual(['brain_new', 'brain_old'])
    expect(cards[0]).toMatchObject({
      id: 'brain_new',
      t: '新记录'
    })
  })

  it('会归一化公共编译页，并生成文档召回候选卡', () => {
    const compilePage = normalizeBrainPublicCompilePage({
      summary: '夜巡者是王城夜间巡逻组织。',
      tags: ['组织', '夜巡'],
      relationHints: ['[[镜庭主城]]'],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-15T00:00:00.000Z'
    }, {
      summary: '',
      tags: [],
      updatedAt: '2026-04-14T00:00:00.000Z'
    })
    const cards = buildDocumentCompileCandidateCards([
      normalizeBrainDocumentRecord({
        documentId: 'doc_1',
        title: '夜巡者',
        displayPath: '/世界观/组织/夜巡者.md',
        summary: '旧摘要',
        tags: ['世界观'],
        publicCompilePage: compilePage,
        updatedAt: '2026-04-14T00:00:00.000Z'
      })
    ])

    expect(compilePage.sourceState).toBe('manual_confirmed')
    expect(cards[0]).toMatchObject({
      id: 'compile:doc_1',
      k: 'public_compile_page',
      s: '夜巡者是王城夜间巡逻组织。',
      src: ['doc_1']
    })
    expect(cards[0].tags).toEqual(['世界观', '组织', '夜巡'])
  })

  it('会按角色与分组生成角色大脑前缀', () => {
    const prefix = buildCharacterBrainPathPrefix(
      { id: 'char_1', name: '陈星依', groupId: 'group_1' },
      [{ id: 'group_1', name: '亚什基诺' }]
    )

    expect(prefix).toMatchObject({
      characterId: 'char_1',
      characterName: '陈星依',
      displayPrefix: '/亚什基诺/陈星依'
    })
  })

  it('会兼容未来多层分组链的前缀计算', () => {
    const groupChain = buildCharacterGroupChain('group_child', [
      { id: 'group_root', name: '亚什基诺' },
      { id: 'group_child', name: '黄金时代', parentId: 'group_root' }
    ])
    const prefix = buildCharacterBrainPathPrefix(
      { id: 'char_1', name: '陈星依', groupId: 'group_child' },
      [
        { id: 'group_root', name: '亚什基诺' },
        { id: 'group_child', name: '黄金时代', parentId: 'group_root' }
      ]
    )

    expect(groupChain).toEqual(['亚什基诺', '黄金时代'])
    expect(prefix?.displayPrefix).toBe('/亚什基诺/黄金时代/陈星依')
  })

  it('会通过正式接口读取并归一化文档与神经元', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [{ id: 'doc_1', display_path: '/世界观/组织/夜巡者.md' }],
          manualTreeOrders: {},
          relationSystemState: {}
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ brain_neuron_id: 'brain_1', display_path: '/世界观/组织/夜巡者.md' }]
      })

    const docState = await fetchDocLibraryState()
    const neurons = await fetchBrainNeurons()

    expect(docState.documents[0].id).toBe('doc_1')
    expect(docState.documents[0].displayPath).toBe('/世界观/组织/夜巡者.md')
    expect(neurons[0].brainNeuronId).toBe('brain_1')
    expect(neurons[0].displayPath).toBe('/世界观/组织/夜巡者.md')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('会通过正式接口保存文档与神经元', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true
      })

    await saveDocLibraryState({
      documents: [normalizeBrainDocumentRecord({ id: 'doc_1', title: '夜巡者' })],
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    })
    await saveBrainNeurons([{ brainNeuronId: 'brain_1', title: '夜巡者理解' }])

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"documents"')
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ brainNeuronId: 'brain_1', title: '夜巡者理解' }])
    }))
  })

  it('保存文档库时会拒绝无法转换成字段树的旧路径包', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true
      })

    await expect(saveDocLibraryState({
      documents: [
        normalizeBrainDocumentRecord({ id: 'doc_1', title: 'A', displayPath: '/世界观/重复.md' }),
        normalizeBrainDocumentRecord({ id: 'doc_2', title: 'B', displayPath: '/世界观/重复.md' })
      ],
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    })).rejects.toThrow(/字段树护栏拒绝|字段树转换前存在阻断项/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('保存文档库失败时会带出服务端错误明细', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: '字段树缺少文档节点。' })
      })

    await expect(saveDocLibraryState({
      documents: [normalizeBrainDocumentRecord({ id: 'doc_1', title: '夜巡者' })],
      manualTreeOrders: {},
      relationSystemState: { predicates: [], relationDecisions: [] }
    })).rejects.toThrow('保存文档库失败：字段树缺少文档节点。')
  })

  it('会通过文档库接口读写关系系统状态', async () => {
    const relationSystemState = {
      predicates: [
        {
          predicateId: 'predicate:custom:guards',
          family: 'kinship',
          key: 'guards',
          label: '守护',
          status: 'confirmed'
        }
      ],
      relationDecisions: [
        {
          relationId: 'relation:hint:a',
          status: 'confirmed',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      ]
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
          json: async () => ({
            documents: [{ id: 'doc_1', display_path: '/世界观/组织/夜巡者.md' }],
          manualTreeOrders: {
            __root__: ['folder:/世界观'],
            '/世界观': ['folder:/世界观/组织'],
            '/世界观/组织': ['document:doc_1']
          },
          relationSystemState
        })
      })
      .mockResolvedValueOnce({
        ok: true
      })

    const state = await fetchDocLibraryState({ force: true })
    await saveDocLibraryState(state)

    expect(state.relationSystemState).toMatchObject(relationSystemState)
    expect(state.schemaVersion).toBe(2)
    expect(state.treeNodes.length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"schemaVersion":2')
    }))
    const savedBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(savedBody).toMatchObject({
      schemaVersion: 2,
      manualTreeOrders: {
        __root__: ['folder:/世界观'],
        '/世界观': ['folder:/世界观/组织'],
        '/世界观/组织': ['document:doc_1']
      },
        relationSystemState
    })
    expect(savedBody.treeDiffReport).toMatchObject({
      canUseFieldTree: true,
      blockerCount: 0
    })
    expect(savedBody.documents[0]).toMatchObject({
      documentId: 'doc_1',
      displayPath: '/世界观/组织/夜巡者.md'
    })
  })
})
