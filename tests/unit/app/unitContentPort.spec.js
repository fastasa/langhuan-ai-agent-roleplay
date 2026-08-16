import { describe, expect, it } from 'vitest'
import {
  buildCharacterArrangementContentPorts,
  buildCharacterBrainContentPorts,
  buildDocLibraryContentPorts,
  readRecallContentText
} from '../../../src/app/unitContentPort'
import {
  applyCharacterBrainCardDraft,
  readCharacterBrainDocument
} from '../../../src/app/characterBrain'

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
    content: '文档正文',
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
    emoji: '星',
    avatar_path: '',
    group_id: 'group_1',
    desc: '会整理档案。',
    appearance: '银发。',
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

function createTraceNode(overrides = {}) {
  return {
    id: 'brain:trajectory:node:day_1',
    title: '2008年5月1日',
    summary: '第一次值夜。',
    parentId: 'brain:trajectory',
    kind: 'day',
    nodeType: 'single',
    granularity: 'day',
    startDate: '2008-05-01',
    displayTitle: '2008年5月1日',
    note: '值夜 note',
    innerEntries: [],
    linkIds: [],
    timeLabel: '2008-05-01',
    pointDate: '2008-05-01',
    offsetDays: 1,
    ageLabel: '4岁',
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: ['轨迹'],
    content: '',
    confirmed: true,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides
  }
}

describe('unitContentPort', () => {
  it('projects document-library units as browsable and importable but not chat-recallable', () => {
    const ports = buildDocLibraryContentPorts([createDocument()])
    const doc = ports.find((port) => port.sourceId === 'doc_1')
    const folder = ports.find((port) => port.contentKind === 'group' && port.title === '地点')

    expect(doc).toMatchObject({
      domain: 'docLibrary',
      hasCompilePage: true,
      recallableInChat: false,
      importableToBrain: true,
      writableByAI: false,
      summary: '公共编译摘要'
    })
    expect(folder?.body).toContain('镜庭主城')
  })

  it('separates recallable core fields from system fields and exposes formText', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter())
    const desc = ports.find((port) => port.sourceId === 'brain:desc')
    const preset = ports.find((port) => port.sourceId === 'brain:preset')

    expect(desc).toMatchObject({
      domain: 'characterCore',
      contentKind: 'markdown',
      recallableInChat: true,
      writableByAI: true,
      hasCompilePage: true
    })
    expect(desc?.formText).toBe('简介：会整理档案。')
    expect(desc?.body).toBe('会整理档案。')
    expect(preset).toMatchObject({
      recallableInChat: false,
      writableByAI: false,
      hasCompilePage: false
    })
    expect(ports.some((port) => port.sourceId === 'brain:default_model')).toBe(true)
  })

  it('uses saved markdown bodies for core document fields and keeps field truth in sync on save', () => {
    const character = createCharacter({
      brainDocuments: {
        'brain:desc': '# 简介\n\n会整理档案，也会挑刺。'
      }
    })
    const ports = buildCharacterBrainContentPorts(character)
    const desc = ports.find((port) => port.sourceId === 'brain:desc')

    expect(desc).toMatchObject({
      domain: 'characterCore',
      contentKind: 'markdown',
      body: '# 简介\n\n会整理档案，也会挑刺。'
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:desc', {
      documentTitle: '简介',
      documentContent: '新简介正文。',
      'compile.summary': '新简介摘要',
      'compile.tags': ['核心'],
      'compile.relationHints': []
    })

    expect(changes.desc).toBe('新简介正文。')
    expect(readCharacterBrainDocument(changes, 'brain:desc')).toBe('新简介正文。')
  })

  it('projects imported private snapshots as recallable writable soul content', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter({
      brainCognitionNodes: [{
        id: 'brain:cognition:node:capital',
        title: '镜庭主城',
        summary: '私有摘要',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '角色私有正文',
        compilePage: {
          summary: '私有编译摘要',
          tags: ['私有王城'],
          relationHints: [],
          updatedAt: '2026-04-25T00:00:00.000Z'
        },
        sourceDocumentId: 'doc_1',
        sourceDisplayPath: '/世界树/亚什基诺/地点/镜庭主城.md',
        sourceDetachedAt: '2026-04-25T00:00:00.000Z',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z'
      }]
    }), [createDocument()])
    const reference = ports.find((port) => port.sourceId === 'brain:cognition:node:capital')

    expect(reference).toMatchObject({
      domain: 'characterSoul',
      contentKind: 'markdown',
      recallableInChat: true,
      writableByAI: true,
      summary: '私有编译摘要',
      body: '角色私有正文'
    })
  })

  it('projects detached private soul content without reading the source document body', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter({
      brainCognitionNodes: [{
        id: 'brain:cognition:node:capital',
        title: '镜庭主城',
        summary: '私有摘要',
        parentId: 'brain:cognition',
        kind: 'private',
        content: '角色私有正文',
        tags: ['私有'],
        relationHints: ['[[星依]]'],
        compilePage: {
          summary: '私有编译摘要',
          tags: ['私有'],
          relationHints: ['[[星依]]'],
          updatedAt: '2026-04-27T00:00:00.000Z'
        },
        sourceDocumentId: 'doc_1',
        sourceDisplayPath: '/世界树/亚什基诺/地点/镜庭主城.md',
        sourceDetachedAt: '2026-04-27T00:00:00.000Z',
        sourceSnapshotTitle: '镜庭主城',
        sourceSnapshotSummary: '公共编译摘要',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z'
      }]
    }), [createDocument({ content: '公共文档新正文' })])
    const port = ports.find((item) => item.sourceId === 'brain:cognition:node:capital')

    expect(port).toMatchObject({
      contentKind: 'markdown',
      writableByAI: true,
      summary: '私有编译摘要',
      body: '角色私有正文'
    })
    expect(port?.body).not.toBe('公共文档新正文')
    expect(port?.effectiveVersion.compilePage).toMatchObject({
      summary: '私有编译摘要',
      tags: ['私有'],
      relationHints: ['[[星依]]']
    })
  })

  it('projects trace body from content and falls back to note', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter({
      brainTraceNodes: [createTraceNode()]
    }))
    const trace = ports.find((port) => port.sourceId === 'brain:trajectory:node:day_1')

    expect(trace).toMatchObject({
      domain: 'characterTrace',
      recallableInChat: true,
      writableByAI: true,
      body: '值夜 note'
    })
  })

  it('projects trajectory root as browsable settings with birth date and calendar', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '出生当天',
        calendarConfig: {
          monthDays: [31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30]
        }
      }
    }))
    const root = ports.find((port) => port.sourceId === 'brain:trajectory')

    expect(root).toMatchObject({
      domain: 'characterTrace',
      contentKind: 'group',
      browsable: true,
      writableByAI: false
    })
    expect(root?.body).toContain('首个日桠：2004-05-02')
    expect(root?.body).toContain('| 2月 | 30天 |')
  })

  it('projects arrangement fields without pretending they are formal tree nodes', () => {
    const ports = buildCharacterArrangementContentPorts(createCharacter({
      schedule: {
        monday: [{ startTime: '09:00', endTime: '12:00', activity: '训练', location: '庭院' }]
      },
      yearlySchedule: [{ startMonth: 1, endMonth: 3, activity: '冬训' }],
      currentActivities: ['整理镜庭档案']
    }))

    expect(ports.map((port) => port.sourceId)).toEqual([
      'brain:arrangement:daily',
      'brain:arrangement:yearly',
      'brain:arrangement:current'
    ])
    expect(ports.every((port) => port.domain === 'characterArrangement' && port.recallableInChat && port.writableByAI)).toBe(true)
  })

  it('resolves recall text through the content port effective version', () => {
    const text = readRecallContentText(
      createCharacter({ desc: '会把问题拆清楚。' }),
      [],
      {
        id: 'brain:desc',
        k: 'character_core',
        p: '/星依/核心/简介',
        t: '简介',
        s: '简介摘要',
        tags: [],
        u: '2026-04-25T00:00:00.000Z',
        relationHints: [],
        isRecallable: true
      }
    )

    expect(text).toBe('会把问题拆清楚。')
  })

  it('resolves pending versions as clean effective content before recall', () => {
    const ports = buildCharacterBrainContentPorts(createCharacter({
      brainCognitionNodes: [{
        id: 'brain:cognition:node:etiquette',
        title: '雨城礼仪',
        summary: '新版摘要',
        parentId: 'brain:cognition',
        kind: 'private',
        pendingReview: {
          mode: 'update',
          previous: {
            title: '雨城礼仪',
            summary: '旧版摘要',
            content: '旧版正文'
          },
          reason: '整理写入',
          createdBy: 'brain_agent',
          createdAt: '2026-04-26T00:00:00.000Z'
        },
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z'
      }]
    }))
    const port = ports.find((item) => item.sourceId === 'brain:cognition:node:etiquette')

    expect(port?.pendingVersion).toMatchObject({
      mode: 'update',
      confirmed: { summary: '旧版摘要' },
      pending: { summary: '新版摘要' }
    })
    expect(port?.effectiveVersion.summary).toBe('新版摘要')
  })
})
