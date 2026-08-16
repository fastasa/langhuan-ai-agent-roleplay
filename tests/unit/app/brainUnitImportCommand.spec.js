import { describe, expect, it } from 'vitest'
import {
  applyBrainUnitImportCommand,
  buildBrainToDocLibraryImportCommand,
  buildDocLibraryToBrainImportCommand
} from '../../../src/app/brainUnitImportCommand'
import {
  applyCharacterBrainCardDraft,
  readCharacterBrainCognitionNodes,
  readCharacterBrainDocument
} from '../../../src/app/characterBrain'
import {
  buildCharacterBrainContentPorts,
  buildDocLibraryContentPorts
} from '../../../src/app/unitContentPort'
import { buildCharacterBrainUnitView } from '../../../src/app/unitViewAdapters'
import { migrateCharacterBrainImportedReferences } from '../../../src/app/characterBrainPrivateReferenceMigration'

function createDocument(overrides = {}) {
  return {
    documentId: 'doc_1',
    id: 'doc_1',
    stableId: 'doc_1',
    title: '镜庭主城',
    displayPath: '/亚什基诺/地点/镜庭主城.md',
    documentType: 'generic_markdown',
    kind: 'generic_markdown',
    summary: '顶层摘要',
    tags: ['地点'],
    content: '文档正文不会复制进灵魂节点',
    publicCompilePage: {
      summary: '公共编译摘要',
      tags: ['王城'],
      relationHints: ['[[夜巡者]]'],
      sourceState: 'manual_confirmed',
      updatedAt: '2026-04-25T00:00:00.000Z'
    },
    sourceDocumentIds: [],
    relatedNeuronIds: [],
    versionState: 'confirmed',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides
  }
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    gender: '女',
    age: '18',
    emoji: '',
    avatar_path: '',
    group_id: 'group_1',
    desc: '会整理档案。',
    appearance: '',
    outfit: '',
    personality: '锋利。',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '直接。',
    nicknames: '星依',
    default_preset: '默认',
    default_model: 'test-model',
    schedule: '{}',
    yearly_schedule: '[]',
    current_activities: '[]',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 0,
    created_at: '',
    avatarPath: '',
    groupId: 'group_1',
    speakingStyle: '直接。',
    yearlySchedule: [],
    currentActivities: [],
    defaultPreset: '默认',
    defaultModel: 'test-model',
    brainLinks: {},
    brain_links: '{}',
    brainDocuments: {},
    brain_documents: '{}',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainTrajectoryMeta: { birthDate: '', zeroNote: '' },
    brain_trajectory_meta: '{"birthDate":"","zeroNote":""}',
    ...overrides
  }
}

describe('brainUnitImportCommand', () => {
  it('imports a document-library leaf into soul as a private snapshot', () => {
    const documents = [createDocument()]
    const ports = buildDocLibraryContentPorts(documents)
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports,
      selectedUnitId: 'doc_1',
      parentId: 'brain:cognition',
      now: '2026-04-25T10:00:00.000Z'
    })
    expect(commandResult.ok).toBe(true)

    let nextId = 0
    const result = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => `brain:cognition:node:imported_${nextId++}`,
      now: '2026-04-25T10:00:00.000Z'
    })

    expect(result.direction).toBe('docLibraryToBrain')
    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: 'brain:cognition:node:imported_0',
        parentId: 'brain:cognition',
        title: '镜庭主城',
        summary: '公共编译摘要',
        kind: 'private',
        content: '文档正文不会复制进灵魂节点',
        tags: ['王城'],
        relationHints: [],
        sourceDocumentId: 'doc_1',
        sourceDisplayPath: '/世界树/亚什基诺/地点/镜庭主城.md',
        sourceSnapshotTitle: '镜庭主城'
      })
    ])
    expect(result.nodes[0].compilePage).toMatchObject({
      summary: '公共编译摘要',
      tags: ['王城'],
      relationHints: []
    })
  })

  it('keeps document folders as groups and leaves as private snapshots when importing a branch', () => {
    const documents = [
      createDocument(),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        stableId: 'doc_2',
        title: '城北',
        displayPath: '/亚什基诺/地点/城北.md'
      })
    ]
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports: buildDocLibraryContentPorts(documents),
      selectedUnitId: '/亚什基诺/地点',
      parentId: 'brain:cognition'
    })
    expect(commandResult.ok).toBe(true)

    let nextId = 0
    const result = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => `brain:cognition:node:branch_${nextId++}`
    })

    expect(result.nodes.map((node) => node.kind)).toEqual(['group', 'private', 'private'])
    expect(result.nodes.slice(1).map((node) => node.sourceDocumentId).sort()).toEqual(['doc_1', 'doc_2'])
    expect(result.nodes.slice(1).every((node) => node.parentId === 'brain:cognition:node:branch_0')).toBe(true)
  })

  it('binds an index document to the imported soul group overview instead of adding a duplicate child', () => {
    const documents = [
      createDocument({
        documentId: 'doc_index',
        id: 'doc_index',
        stableId: 'doc_index',
        title: '地点',
        displayPath: '/亚什基诺/地点/index.md',
        summary: '地点目录摘要',
        content: '# 地点\n\n这里是地点目录概览。',
        publicCompilePage: {
          summary: '地点编译摘要',
          tags: ['目录'],
          relationHints: ['[[镜庭主城]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      }),
      createDocument(),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        stableId: 'doc_2',
        title: '城北',
        displayPath: '/亚什基诺/地点/城北.md'
      })
    ]
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports: buildDocLibraryContentPorts(documents),
      selectedUnitId: '/亚什基诺/地点',
      parentId: 'brain:cognition'
    })
    expect(commandResult.ok).toBe(true)

    let nextId = 0
    const result = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => `brain:cognition:node:index_${nextId++}`,
      now: '2026-04-25T10:00:00.000Z'
    })
    const group = result.nodes[0]

    expect(result.nodes.map((node) => node.kind)).toEqual(['group', 'private', 'private'])
    expect(group).toMatchObject({
      title: '地点',
      kind: 'group',
      content: '# 地点\n\n这里是地点目录概览。',
      sourceDocumentId: 'doc_index',
      sourceDisplayPath: '/世界树/亚什基诺/地点'
    })
    expect(result.nodes.slice(1).map((node) => node.sourceDocumentId)).not.toContain('doc_index')

    const groupPort = buildCharacterBrainContentPorts(createCharacter({
      brainCognitionNodes: result.nodes
    }), documents).find((port) => port.sourceId === group.id)
    expect(groupPort).toMatchObject({
      contentKind: 'group',
      body: '# 地点\n\n这里是地点目录概览。',
      summary: '地点编译摘要',
      tags: ['目录'],
      relationHints: ['[[镜庭主城@brain:cognition:node:index_2]]']
    })

    const privateChanges = applyCharacterBrainCardDraft(createCharacter({
      brainCognitionNodes: result.nodes
    }), group.id, {
      documentTitle: '地点私有概览',
      documentContent: '角色自己的地点理解。',
      'compile.summary': '私有地点摘要',
      'compile.tags': ['私有目录'],
      'compile.relationHints': ['[[城北]]']
    })
    const privateCharacter = createCharacter(privateChanges)
    const privateGroup = readCharacterBrainCognitionNodes(privateCharacter).find((node) => node.id === group.id)
    expect(privateGroup).toMatchObject({
      kind: 'group',
      title: '地点私有概览',
      content: '角色自己的地点理解。',
      summary: '私有地点摘要',
      sourceDocumentId: 'doc_index',
      sourceSnapshotTitle: '地点'
    })
    expect(privateGroup?.sourceDetachedAt).toBeTruthy()
    expect(readCharacterBrainDocument(privateCharacter, group.id)).toBe('角色自己的地点理解。')
  })

  it('migrates legacy imported groups to private overview snapshots by matching source path to index document', () => {
    const documents = [
      createDocument({
        documentId: 'doc_index',
        id: 'doc_index',
        stableId: 'doc_index',
        title: '地点',
        displayPath: '/亚什基诺/地点/index.md',
        content: '# 地点\n\n旧导入分组的概览正文。',
        publicCompilePage: {
          summary: '旧分组概览摘要',
          tags: ['目录'],
          relationHints: ['[[镜庭主城]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      })
    ]
    const character = createCharacter({
      brainCognitionNodes: [{
        id: 'brain:cognition:node:legacy_group',
        title: '地点',
        summary: '来自文档库目录：/世界树/亚什基诺/地点',
        parentId: 'brain:cognition',
        kind: 'group',
        sourceDisplayPath: '/世界树/亚什基诺/地点',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z'
      }]
    })
    const migrated = migrateCharacterBrainImportedReferences({
      nodes: character.brainCognitionNodes,
      documents,
      now: '2026-04-25T01:00:00.000Z'
    })
    const migratedCharacter = createCharacter({
      brainCognitionNodes: migrated.nodes,
      brainDocuments: migrated.brainDocuments
    })
    const port = buildCharacterBrainContentPorts(migratedCharacter, documents)
      .find((item) => item.sourceId === 'brain:cognition:node:legacy_group')
    expect(port).toMatchObject({
      contentKind: 'group',
      body: '# 地点\n\n旧导入分组的概览正文。',
      summary: '旧分组概览摘要'
    })
    expect(port?.metadata?.sourceDocumentId).toBe('doc_index')

    const changes = applyCharacterBrainCardDraft(migratedCharacter, 'brain:cognition:node:legacy_group', {
      documentTitle: '地点私有概览',
      documentContent: '旧分组也能保存私有正文。',
      'compile.summary': '旧分组私有摘要',
      'compile.tags': ['私有'],
      'compile.relationHints': ['[[镜庭主城]]'],
      sourceDocumentId: port?.metadata?.sourceDocumentId,
      sourceSnapshotTitle: port?.title,
      sourceSnapshotSummary: port?.summary
    })
    const privateCharacter = createCharacter(changes)
    const privateGroup = readCharacterBrainCognitionNodes(privateCharacter)
      .find((node) => node.id === 'brain:cognition:node:legacy_group')
    expect(privateGroup).toMatchObject({
      kind: 'group',
      sourceDocumentId: 'doc_index',
      content: '旧分组也能保存私有正文。',
      sourceSnapshotTitle: '地点',
      sourceSnapshotSummary: '旧分组概览摘要'
    })
  })

  it('imports multiple selected document units as sibling private snapshots', () => {
    const documents = [
      createDocument(),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        stableId: 'doc_2',
        title: '城北',
        displayPath: '/亚什基诺/地点/城北.md',
        publicCompilePage: {
          summary: '城北编译摘要',
          tags: ['街区'],
          relationHints: [],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      })
    ]
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports: buildDocLibraryContentPorts(documents),
      selectedUnitIds: ['doc_1', 'doc_2'],
      parentId: 'brain:cognition'
    })
    expect(commandResult.ok).toBe(true)
    expect(commandResult.command.selectedUnitIds).toHaveLength(2)

    let nextId = 0
    const result = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => `brain:cognition:node:batch_${nextId++}`
    })

    expect(result.nodes.map((node) => node.kind)).toEqual(['private', 'private'])
    expect(result.nodes.map((node) => node.parentId)).toEqual(['brain:cognition', 'brain:cognition'])
    expect(result.nodes.map((node) => node.sourceDocumentId).sort()).toEqual(['doc_1', 'doc_2'])
  })

  it('rewrites imported relation hints to new brain refs and drops unimported targets', () => {
    const documents = [
      createDocument({
        publicCompilePage: {
          summary: '公共编译摘要',
          tags: ['王城'],
          relationHints: [
            '[[镜庭主城@doc_1]]_包含_[[城北@doc_2]]',
            '[[镜庭主城@doc_1]]_包含_[[未导入单位@doc_missing]]'
          ],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      }),
      createDocument({
        documentId: 'doc_2',
        id: 'doc_2',
        stableId: 'doc_2',
        title: '城北',
        displayPath: '/亚什基诺/地点/城北.md',
        publicCompilePage: {
          summary: '城北编译摘要',
          tags: ['街区'],
          relationHints: ['[[镜庭主城@doc_1]]'],
          sourceState: 'manual_confirmed',
          updatedAt: '2026-04-25T00:00:00.000Z'
        }
      })
    ]
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports: buildDocLibraryContentPorts(documents),
      selectedUnitIds: ['doc_1', 'doc_2'],
      parentId: 'brain:cognition'
    })
    expect(commandResult.ok).toBe(true)
    let nextId = 0
    const result = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => `brain:cognition:node:private_${nextId++}`,
      now: '2026-04-25T10:00:00.000Z'
    })
    const city = result.nodes.find((node) => node.title === '镜庭主城')
    const north = result.nodes.find((node) => node.title === '城北')

    expect(city?.compilePage?.relationHints).toEqual([
      '[[镜庭主城@brain:cognition:node:private_0]]_包含_[[城北@brain:cognition:node:private_1]]'
    ])
    expect(north?.compilePage?.relationHints).toEqual([
      '[[镜庭主城@brain:cognition:node:private_0]]'
    ])
    const unitView = buildCharacterBrainUnitView(createCharacter({
      brainCognitionNodes: result.nodes
    }))
    expect(unitView.warnings.filter((warning) => String(warning.code).startsWith('relation_hint_'))).toEqual([])
  })

  it('lets imported private snapshots use copied compile page while untouched documents stay out of chat recall', () => {
    const documents = [createDocument()]
    const commandResult = buildDocLibraryToBrainImportCommand({
      ports: buildDocLibraryContentPorts(documents),
      selectedUnitId: 'doc_1',
      parentId: 'brain:cognition'
    })
    expect(commandResult.ok).toBe(true)
    const imported = applyBrainUnitImportCommand({
      character: createCharacter(),
      documents,
      command: commandResult.command,
      createBrainNodeId: () => 'brain:cognition:node:ref'
    })
    const referencePort = buildCharacterBrainContentPorts(createCharacter({
      brainCognitionNodes: imported.nodes
    }), documents).find((port) => port.sourceId === 'brain:cognition:node:ref')
    const untouchedDocPort = buildDocLibraryContentPorts(documents).find((port) => port.sourceId === 'doc_1')

    expect(referencePort).toMatchObject({
      contentKind: 'markdown',
      summary: '公共编译摘要',
      tags: ['王城'],
      relationHints: [],
      recallableInChat: true,
      writableByAI: true
    })
    expect(untouchedDocPort).toMatchObject({
      recallableInChat: false,
      importableToBrain: true
    })
  })

  it('creates a new document from a brain unit without syncing it back to the source unit', () => {
    const character = createCharacter({ desc: '第一版简介。' })
    const sourcePort = buildCharacterBrainContentPorts(character).find((port) => port.sourceId === 'brain:desc')
    const commandResult = buildBrainToDocLibraryImportCommand({
      port: sourcePort,
      character,
      targetFolderPath: '/角色资料',
      now: '2026-04-25T12:00:00.000Z',
      createDocumentId: () => 'doc_from_brain_1'
    })
    expect(commandResult.ok).toBe(true)
    const result = applyBrainUnitImportCommand({
      character,
      documents: [],
      command: commandResult.command
    })

    expect(result.direction).toBe('brainToDocLibrary')
    expect(result.documents).toHaveLength(1)
    expect(result.document).toMatchObject({
      documentId: 'doc_from_brain_1',
      title: '简介',
      displayPath: '/角色资料/星依/核心/简介.md',
      documentType: 'character_profile',
      semanticType: 'character',
      versionState: 'confirmed'
    })
    expect(result.treeCommandResult).toMatchObject({
      schemaVersion: 2,
      command: 'upsert_document'
    })
    expect(result.treeCommandResult.treeNodes.some((node) => (
      node.nodeKind === 'document'
        && node.nodeId === 'doc:doc_from_brain_1'
        && node.documentId === 'doc_from_brain_1'
    ))).toBe(true)
    expect(result.treeCommandResult.treeOrders).toBeTruthy()
    expect(result.document.content).toContain('第一版简介。')

    const changedSourcePort = buildCharacterBrainContentPorts(createCharacter({ desc: '第二版简介。' }))
      .find((port) => port.sourceId === 'brain:desc')
    expect(changedSourcePort.formText).toContain('第二版简介。')
    expect(result.document.content).toContain('第一版简介。')
    expect(result.document.content).not.toContain('第二版简介。')
  })

  it('rejects automatic import triggers in the first version', () => {
    const port = buildCharacterBrainContentPorts(createCharacter()).find((item) => item.sourceId === 'brain:desc')
    const result = buildBrainToDocLibraryImportCommand({
      port,
      character: createCharacter(),
      trigger: 'auto'
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('只允许手动触发')
  })
})
