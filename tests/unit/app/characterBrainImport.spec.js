import { describe, expect, it } from 'vitest'
import {
  applyCharacterBrainImportDraft,
  buildCharacterBrainWorldTreeImportDraft,
  parseCharacterBrainImportJson
} from '../../../src/app/characterBrainImport'

describe('characterBrainImport', () => {
  it('parses valid cognition JSON into an import draft', () => {
    const result = parseCharacterBrainImportJson(JSON.stringify({
      version: 1,
      rootTitle: '镜庭灵魂',
      nodes: [
        {
          title: '镜庭雨城',
          summary: '角色已知的镜庭雨城相关知识入口',
          kind: 'group',
          children: [
            {
              title: '镜庭主城',
              summary: '镜庭雨城的主城信息',
              kind: 'reference',
              sourceDocumentId: 'demo-raincourt-capital',
              sourceDisplayPath: '/镜庭雨城/镜庭地点/镜庭主城.md'
            }
          ]
        }
      ]
    }))

    expect(result.ok).toBe(true)
    expect(result.draft.rootTitle).toBe('镜庭灵魂')
    expect(result.draft.nodes[0]).toMatchObject({
      title: '镜庭雨城',
      summary: '角色已知的镜庭雨城相关知识入口',
      kind: 'group'
    })
    expect(result.draft.nodes[0].children[0]).toMatchObject({
      title: '镜庭主城',
      kind: 'reference',
      sourceDocumentId: 'demo-raincourt-capital',
      sourceDisplayPath: '/镜庭雨城/镜庭地点/镜庭主城.md'
    })
    expect(result.draft.flatNodes.map((node) => node.title)).toEqual(['镜庭雨城', '镜庭主城'])
  })

  it('reports missing title with a chinese field path', () => {
    const result = parseCharacterBrainImportJson(JSON.stringify({
      nodes: [
        {
          summary: '缺少标题'
        }
      ]
    }))

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      message: '节点缺少必填字段 title。',
      path: 'nodes[0].title'
    })
  })

  it('reports json syntax errors in chinese', () => {
    const result = parseCharacterBrainImportJson('{"nodes":[{"title":"镜庭雨城",}]}')

    expect(result.ok).toBe(false)
    expect(result.error.message).toContain('JSON 语法错误')
  })

  it('reports invalid children structure with a chinese field path', () => {
    const result = parseCharacterBrainImportJson(JSON.stringify({
      nodes: [
        {
          title: '镜庭雨城',
          children: '不是数组'
        }
      ]
    }))

    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({
      message: 'children 必须是数组。',
      path: 'nodes[0].children'
    })
  })

  it('extracts the first legal json object from AI surrounding text and warns about ignored text', () => {
    const result = parseCharacterBrainImportJson([
      '下面是 JSON：',
      '{"nodes":[{"title":"镜庭雨城","children":[{"title":"镜庭主城","kind":"reference"}]}]}',
      '复制后即可导入。'
    ].join('\n'))

    expect(result.ok).toBe(true)
    expect(result.draft.nodes[0].title).toBe('镜庭雨城')
    expect(result.draft.warnings).toContainEqual(expect.objectContaining({
      code: 'ignored_text',
      message: expect.stringContaining('已自动截取第一段合法 JSON 对象')
    }))
  })

  it('keeps duplicate sibling nodes in the preview draft and adds a warning', () => {
    const result = parseCharacterBrainImportJson(JSON.stringify({
      nodes: [
        {
          title: '镜庭主城',
          kind: 'reference',
          sourceDocumentId: 'doc-capital'
        },
        {
          title: '镜庭主城副本',
          kind: 'reference',
          sourceDocumentId: 'doc-capital'
        }
      ]
    }))

    expect(result.ok).toBe(true)
    expect(result.draft.flatNodes).toHaveLength(2)
    expect(result.draft.warnings).toContainEqual(expect.objectContaining({
      code: 'duplicate_sibling',
      path: 'nodes[1]'
    }))
  })

  it('applies an import draft under the selected cognition parent', () => {
    const parsed = parseCharacterBrainImportJson(JSON.stringify({
      nodes: [
        {
          title: '镜庭雨城',
          kind: 'group',
          children: [
            {
              title: '镜庭主城',
              kind: 'reference',
              sourceDocumentId: 'doc-capital',
              sourceDisplayPath: '/世界树/镜庭雨城/镜庭主城.md'
            }
          ]
        }
      ]
    }))
    expect(parsed.ok).toBe(true)
    let index = 0
    const result = applyCharacterBrainImportDraft({
      existingNodes: [],
      parentId: 'brain:cognition:node:known',
      draft: parsed.draft,
      now: '2026-04-14T00:00:00.000Z',
      createId: () => `brain:cognition:node:test_${index++}`
    })

    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: 'brain:cognition:node:test_0',
        title: '镜庭雨城',
        parentId: 'brain:cognition:node:known',
        kind: 'group'
      }),
      expect.objectContaining({
        id: 'brain:cognition:node:test_1',
        title: '镜庭主城',
        parentId: 'brain:cognition:node:test_0',
        kind: 'private',
        sourceDocumentId: 'doc-capital'
      })
    ])
  })

  it('skips or overwrites duplicate reference nodes by conflict action', () => {
    const existingNodes = [
      {
        id: 'brain:cognition:node:old',
        title: '镜庭主城',
        summary: '旧摘要',
        parentId: 'brain:cognition',
        kind: 'reference',
        sourceDocumentId: 'doc-capital',
        sourceDisplayPath: '/世界树/镜庭雨城/镜庭主城.md',
        createdAt: '2026-04-13T00:00:00.000Z',
        updatedAt: '2026-04-13T00:00:00.000Z'
      }
    ]
    const parsed = parseCharacterBrainImportJson(JSON.stringify({
      nodes: [
        {
          title: '镜庭主城',
          summary: '新摘要',
          kind: 'reference',
          sourceDocumentId: 'doc-capital',
          sourceDisplayPath: '/世界树/镜庭雨城/镜庭主城.md'
        }
      ]
    }))
    expect(parsed.ok).toBe(true)

    const skipped = applyCharacterBrainImportDraft({
      existingNodes,
      parentId: 'brain:cognition',
      draft: parsed.draft,
      defaultConflictAction: 'skip'
    })
    expect(skipped.nodes[0].summary).toBe('旧摘要')
    expect(skipped.skippedTempIds).toHaveLength(1)

    const overwritten = applyCharacterBrainImportDraft({
      existingNodes,
      parentId: 'brain:cognition',
      draft: parsed.draft,
      defaultConflictAction: 'overwrite',
      now: '2026-04-14T00:00:00.000Z'
    })
    expect(overwritten.nodes[0]).toMatchObject({
      id: 'brain:cognition:node:old',
      summary: '新摘要',
      updatedAt: '2026-04-14T00:00:00.000Z'
    })
  })

  it('builds a world tree import draft from selected folders and documents', () => {
    const draft = buildCharacterBrainWorldTreeImportDraft([
      {
        documentId: 'doc-overview',
        id: 'doc-overview',
        stableId: 'doc-overview',
        title: '镜庭地点总览',
        displayPath: '/镜庭雨城/镜庭地点/index.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '地点总览资料',
        tags: [],
        content: '目录概览正文不会作为子节点复制',
        publicCompilePage: {
          summary: '地点编译页摘要',
          tags: ['地点'],
          relationHints: ['[[镜庭地点]]_包含_[[镜庭主城]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-14T00:00:00.000Z'
        },
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      {
        documentId: 'doc-capital',
        id: 'doc-capital',
        stableId: 'doc-capital',
        title: '镜庭主城',
        displayPath: '/镜庭雨城/镜庭地点/镜庭主城.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '主城资料',
        tags: [],
        content: '正文不会复制',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      {
        documentId: 'doc-north',
        id: 'doc-north',
        stableId: 'doc-north',
        title: '城北',
        displayPath: '/镜庭雨城/镜庭地点/城北.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '城北资料',
        tags: [],
        content: '正文不会复制',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      }
    ], ['folder:/镜庭雨城/镜庭地点'])

    expect(draft.nodes[0]).toMatchObject({
      title: '镜庭地点',
      kind: 'group',
      sourceDocumentId: 'doc-overview',
      summary: '地点编译页摘要',
      compilePage: {
        summary: '地点编译页摘要',
        tags: ['地点'],
        relationHints: ['[[镜庭地点]]_包含_[[镜庭主城]]'],
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      sourceDisplayPath: '/世界树/镜庭雨城/镜庭地点'
    })
    expect(draft.nodes[0].children.map((node) => node.title)).toEqual(['镜庭主城', '城北'])
    expect(draft.nodes[0].children[0]).toMatchObject({
      kind: 'private',
      sourceDocumentId: 'doc-capital',
      sourceDisplayPath: '/世界树/镜庭雨城/镜庭地点/镜庭主城.md'
    })
  })

  it('binds index.md overview documents to imported folder groups without creating index leaf nodes', () => {
    const draft = buildCharacterBrainWorldTreeImportDraft([
      {
        documentId: 'doc-empire-index',
        id: 'doc-empire-index',
        stableId: 'doc-empire-index',
        title: '维斯珂帝国总览',
        displayPath: '/亚什基诺/维斯珂帝国/index.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '帝国概览',
        tags: [],
        content: '',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z'
      },
      {
        documentId: 'doc-arena',
        id: 'doc-arena',
        stableId: 'doc-arena',
        title: '凯旋大竞技场',
        displayPath: '/亚什基诺/维斯珂帝国/凯旋大竞技场.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '竞技场资料',
        tags: [],
        content: '',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z'
      }
    ], ['folder:/亚什基诺/维斯珂帝国'])

    expect(draft.flatNodes.map((node) => node.title)).toEqual(['维斯珂帝国', '凯旋大竞技场'])
    expect(draft.nodes[0]).toMatchObject({
      title: '维斯珂帝国',
      kind: 'group',
      summary: '帝国概览',
      sourceDocumentId: 'doc-empire-index',
      sourceDisplayPath: '/世界树/亚什基诺/维斯珂帝国'
    })
    expect(draft.nodes[0].children).toHaveLength(1)
    expect(draft.nodes[0].children[0]).toMatchObject({
      title: '凯旋大竞技场',
      kind: 'private',
      sourceDocumentId: 'doc-arena'
    })
  })

  it('keeps cluster and branch hierarchy when descendants are selected together', () => {
    const documents = [
      {
        documentId: 'doc-capital',
        id: 'doc-capital',
        stableId: 'doc-capital',
        title: '镜庭主城',
        displayPath: '/镜庭雨城/镜庭地点/镜庭主城.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '主城资料',
        tags: [],
        content: '',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      },
      {
        documentId: 'doc-lighthouse',
        id: 'doc-lighthouse',
        stableId: 'doc-lighthouse',
        title: '余烬灯塔',
        displayPath: '/镜庭雨城/镜庭地点/余烬灯塔.md',
        documentType: 'generic_markdown',
        kind: 'generic_markdown',
        summary: '灯塔资料',
        tags: [],
        content: '',
        sourceDocumentIds: [],
        relatedNeuronIds: [],
        versionState: 'confirmed',
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      }
    ]

    const draft = buildCharacterBrainWorldTreeImportDraft(documents, [
      'cluster:/镜庭雨城',
      'folder:/镜庭雨城/镜庭地点',
      'document:doc-capital'
    ])

    expect(draft.nodes).toHaveLength(1)
    expect(draft.nodes[0]).toMatchObject({
      title: '镜庭雨城',
      kind: 'group'
    })
    expect(draft.nodes[0].children[0]).toMatchObject({
      title: '镜庭地点',
      kind: 'group'
    })
    expect(draft.nodes[0].children[0].children.map((node) => node.title)).toEqual(['镜庭主城', '余烬灯塔'])
  })
})
