import { describe, expect, it } from 'vitest'
import {
  buildCharacterBrainTreeCoreFieldChange,
  buildCharacterBrainTreeModel,
  applyCharacterBrainWriteBackDraft,
  applyCharacterBrainWriteBackOutcome,
  confirmCharacterBrainPendingVersion,
  createCharacterBrainSoulTreeNode,
  createCharacterBrainTraceArrangementTreeNode,
  createCharacterBrainTraceBatchTreeNodes,
  createCharacterBrainTraceBranchTreeNode,
  createCharacterBrainTraceDayTreeNode,
  createCharacterBrainTraceEventTreeNode,
  createCharacterBrainTraceGroupTreeNode,
  createNextCharacterBrainTraceDayTreeNode,
  deleteCharacterBrainSoulTreeNode,
  deleteCharacterBrainTraceTreeNode,
  getCoreFieldTargetKeys,
  isFormalTraceDayNode,
  migrateLegacyTraceNodesToFormalTree,
  moveCharacterBrainSoulTreeNode,
  rejectCharacterBrainPendingVersion
} from '../../../src/app/characterBrainTreeModel'

function createTraceNode(overrides = {}) {
  return {
    id: 'brain:trajectory:node:day_2004_05_02',
    title: '2004年5月2日',
    summary: '出生当天',
    parentId: 'brain:trajectory',
    kind: 'day',
    nodeType: 'single',
    granularity: 'day',
    startDate: '2004-05-02',
    displayTitle: '2004年5月2日',
    note: '出生当天',
    innerEntries: [],
    linkIds: [],
    timeLabel: '2004-05-02',
    pointDate: '2004-05-02',
    offsetDays: 0,
    ageLabel: '0岁',
    stepUnit: 'day',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: ['轨迹'],
    content: '当天正文',
    confirmed: true,
    createdAt: '2026-04-24T00:00:00.000Z',
    updatedAt: '2026-04-24T00:00:00.000Z',
    ...overrides
  }
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '陈星依',
    gender: '女',
    age: '18',
    emoji: '星',
    avatar_path: '',
    group_id: 'group_1',
    desc: '会整理结构。',
    appearance: '银发。',
    outfit: '',
    personality: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '直接。',
    nicknames: '星依',
    default_preset: '默认',
    default_model: 'test-model',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 0,
    locations: '',
    orderIndex: 0,
    created_at: '',
    avatarPath: '',
    groupId: 'group_1',
    speakingStyle: '直接。',
    yearlySchedule: '',
    currentActivities: '',
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

describe('characterBrainTreeModel', () => {
  it('builds one formal root with core, soul and trace sections', () => {
    const model = buildCharacterBrainTreeModel(createCharacter())

    expect(model.rootId).toBe('character:char_1')
    expect(model.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'character:char_1', role: 'characterRoot', writeScope: 'none' }),
      expect.objectContaining({ nodeId: model.sectionIds.core, role: 'sectionRoot', section: 'core', parentId: model.rootId }),
      expect.objectContaining({ nodeId: model.sectionIds.soul, role: 'sectionRoot', section: 'soul', parentId: model.rootId }),
      expect.objectContaining({ nodeId: model.sectionIds.trace, role: 'sectionRoot', section: 'trace', parentId: model.rootId })
    ]))
  })

  it('keeps core fields bound to original character fields instead of shadow storage', () => {
    const model = buildCharacterBrainTreeModel(createCharacter())
    const coreSection = model.nodes.find((node) => node.nodeId === model.sectionIds.core)
    const systemInfo = model.nodes.find((node) => node.role === 'coreGroup' && node.title === '系统信息')
    const preset = model.nodes.find((node) => node.role === 'coreGroup' && node.title === '预设')
    const detailInfo = model.nodes.find((node) => node.role === 'coreGroup' && node.title === '详细信息')
    const descNode = model.nodes.find((node) => node.fieldKey === 'desc')
    const personalityNode = model.nodes.find((node) => node.fieldKey === 'personality')
    const descBinding = model.writeBindings.find((binding) => binding.fieldKey === 'desc')
    const speakingStyleBinding = model.writeBindings.find((binding) => binding.fieldKey === 'speakingStyle')
    const defaultModelBinding = model.writeBindings.find((binding) => binding.fieldKey === 'defaultModel')

    expect(systemInfo).toMatchObject({ parentId: coreSection?.nodeId, writeScope: 'none' })
    expect(detailInfo).toMatchObject({ parentId: coreSection?.nodeId, writeScope: 'none' })
    expect(model.nodes.some((node) => node.fieldKey === 'defaultModel')).toBe(false)
    expect(model.nodes.some((node) => node.fieldKey === 'avatarPath')).toBe(false)
    expect(descNode).toMatchObject({ role: 'coreField', parentId: coreSection?.nodeId })
    expect(personalityNode).toMatchObject({ role: 'coreField', parentId: coreSection?.nodeId })
    expect(descBinding).toMatchObject({
      writeScope: 'characterField',
      targetKeys: ['desc']
    })
    expect(speakingStyleBinding).toMatchObject({
      writeScope: 'characterField',
      targetKeys: ['speakingStyle', 'speaking_style']
    })
    expect(defaultModelBinding).toMatchObject({
      nodeId: preset?.nodeId,
      writeScope: 'characterField',
      targetKeys: ['defaultModel', 'default_model']
    })
    expect(getCoreFieldTargetKeys('avatarPath')).toEqual(['avatar', 'avatarPath'])
    expect(buildCharacterBrainTreeCoreFieldChange('speakingStyle', '锋利')).toEqual({
      speakingStyle: '锋利',
      speaking_style: '锋利'
    })
  })

  it('maps soul nodes into the same formal parent chain while keeping brainCognitionNodes as write scope', () => {
    const model = buildCharacterBrainTreeModel(createCharacter({
      brainCognitionNodes: [
        {
          id: 'brain:cognition:node:city',
          title: '镜庭主城',
          summary: '她理解中的主城。',
          parentId: 'brain:cognition',
          kind: 'private',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z'
        },
        {
          id: 'brain:cognition:node:street',
          title: '长街',
          summary: '主城里的街道。',
          parentId: 'brain:cognition:node:city',
          kind: 'reference',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      ]
    }))
    const city = model.nodes.find((node) => node.sourceId === 'brain:cognition:node:city')
    const street = model.nodes.find((node) => node.sourceId === 'brain:cognition:node:street')
    const cityBinding = model.writeBindings.find((binding) => binding.sourceId === 'brain:cognition:node:city')

    expect(city).toMatchObject({ role: 'soulNode', parentId: model.sectionIds.soul, writeScope: 'brainCognitionNodes' })
    expect(street).toMatchObject({ role: 'soulNode', parentId: city.nodeId, writeScope: 'brainCognitionNodes' })
    expect(cityBinding).toMatchObject({
      sourceCollection: 'brainCognitionNodes',
      targetKeys: ['brainCognitionNodes', 'brain_cognition_nodes']
    })
  })

  it('treats only single day trace nodes as formal time units', () => {
    const dayNode = createTraceNode()
    const monthNode = createTraceNode({
      id: 'brain:trajectory:node:month_2004_05',
      title: '2004年5月',
      kind: 'month',
      granularity: 'month',
      nodeType: 'range',
      startDate: '2004-05-01',
      endDate: '2004-05-31',
      pointDate: '2004-05-31',
      innerEntries: [
        {
          id: 'inner-1',
          nodeType: 'single',
          granularity: 'day',
          startDate: '2004-05-03',
          displayTitle: '5月3日',
          note: '搬家',
          content: '搬家正文',
          linkIds: [],
          sourceNodeIds: []
        }
      ]
    })
    const model = buildCharacterBrainTreeModel(createCharacter({
      brainTraceNodes: [dayNode, monthNode]
    }))
    const day = model.nodes.find((node) => node.sourceId === dayNode.id)
    const month = model.nodes.find((node) => node.sourceId === monthNode.id)
    const monthPlan = model.traceMigrationPlan.find((item) => item.sourceId === monthNode.id)

    expect(isFormalTraceDayNode(dayNode)).toBe(true)
    expect(isFormalTraceDayNode(monthNode)).toBe(false)
    expect(day).toMatchObject({ role: 'traceDay', parentId: model.sectionIds.trace, writeScope: 'brainTraceNodes' })
    expect(month).toMatchObject({ role: 'traceGroup', parentId: model.sectionIds.trace, writeScope: 'brainTraceNodes' })
    expect(monthPlan).toMatchObject({
      targetRole: 'traceGroup',
      innerEntryCount: 1
    })
    expect(monthPlan.steps).toEqual([
      'convert_non_day_to_group',
      'split_range_to_day_children_or_keep_group_summary',
      'promote_inner_entries_to_child_units'
    ])
  })

  it('writes soul node create and move through brainCognitionNodes only', () => {
    const now = '2026-04-24T01:00:00.000Z'
    const createChanges = createCharacterBrainSoulTreeNode(createCharacter(), {
      id: 'brain:cognition:node:city',
      title: '镜庭主城',
      summary: '她理解中的主城。',
      parentId: 'missing-parent',
      kind: 'private',
      now
    })

    expect(createChanges.brainCognitionNodes).toEqual([
      expect.objectContaining({
        id: 'brain:cognition:node:city',
        parentId: 'brain:cognition',
        title: '镜庭主城'
      })
    ])
    expect(createChanges.brain_cognition_nodes).toContain('brain:cognition:node:city')

    const moveChanges = moveCharacterBrainSoulTreeNode(createCharacter({
      brainCognitionNodes: [
        {
          id: 'brain:cognition:node:city',
          title: '镜庭主城',
          summary: '',
          parentId: 'brain:cognition',
          kind: 'group',
          createdAt: now,
          updatedAt: now
        },
        {
          id: 'brain:cognition:node:street',
          title: '长街',
          summary: '',
          parentId: 'brain:cognition',
          kind: 'private',
          createdAt: now,
          updatedAt: now
        }
      ]
    }), 'brain:cognition:node:street', 'brain:cognition:node:city', now)

    expect(moveChanges.brainCognitionNodes.find((node) => node.id === 'brain:cognition:node:street')).toMatchObject({
      parentId: 'brain:cognition:node:city',
      updatedAt: now
    })
    expect(moveChanges).not.toHaveProperty('brainTraceNodes')
  })

  it('writes trace day and group nodes through brainTraceNodes', () => {
    const now = '2026-04-24T01:00:00.000Z'
    const dayChanges = createCharacterBrainTraceDayTreeNode(createCharacter({
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '' }
    }), {
      id: 'brain:trajectory:node:day_2004_05_03',
      date: '2004-05-03',
      summary: '第一次醒来。',
      tags: ['出生'],
      now
    })
    const dayNode = dayChanges.brainTraceNodes[0]

    expect(dayNode).toMatchObject({
      kind: 'day',
      granularity: 'day',
      nodeType: 'single',
      parentId: 'brain:trajectory',
      pointDate: '2004-05-03',
      stepUnit: 'day'
    })
    expect(dayNode.innerEntries).toEqual([])

    const groupChanges = createCharacterBrainTraceGroupTreeNode(createCharacter({
      brainTraceNodes: [dayNode],
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '' }
    }), {
      id: 'brain:trajectory:node:group_2004_05',
      title: '出生后的第一个月',
      startDate: '2004-05-02',
      endDate: '2004-05-31',
      kind: 'month',
      now
    })
    const groupNode = groupChanges.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:group_2004_05')

    expect(groupNode).toMatchObject({
      kind: 'month',
      granularity: 'month',
      nodeType: 'range',
      parentId: 'brain:trajectory'
    })
    expect(groupChanges.brain_trace_nodes).toContain('brain:trajectory:node:group_2004_05')
  })

  it('creates the first trace day from birth date with system year and month branches', () => {
    const now = '2026-05-04T01:00:00.000Z'
    const result = createNextCharacterBrainTraceDayTreeNode(createCharacter({
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} }
    }), {
      subtitle: '出生当天',
      content: '醒来。',
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const nodes = result.changes.brainTraceNodes
    expect(nodes.map((node) => node.id)).toEqual([
      'brain:trajectory:node:year_2004',
      'brain:trajectory:node:month_2004_05',
      'brain:trajectory:node:day_2004_05_02'
    ])
    const dayNode = nodes.find((node) => node.id === result.createdNodeId)
    expect(dayNode).toMatchObject({
      title: '2004年5月2日',
      subtitle: '出生当天',
      parentId: 'brain:trajectory:node:month_2004_05',
      pointDate: '2004-05-02',
      systemRole: 'dayLeaf',
      content: '醒来。'
    })
    expect(nodes.find((node) => node.id === result.monthNodeId)).toMatchObject({
      title: '2004年5月',
      parentId: 'brain:trajectory:node:year_2004',
      autoGenerated: true,
      systemRole: 'monthBranch'
    })
    expect(nodes.find((node) => node.id === result.yearNodeId)).toMatchObject({
      title: '2004年',
      parentId: 'brain:trajectory',
      autoGenerated: true,
      systemRole: 'yearBranch'
    })
    expect(result.changes.brainTrajectoryMeta.coverageEndDate).toBe('2004-05-02')
  })

  it('continues trace days across month and year boundaries', () => {
    const now = '2026-05-04T02:00:00.000Z'
    const character = createCharacter({
      brainTrajectoryMeta: { birthDate: '2004-12-31', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} },
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:year_2004',
          title: '2004年',
          parentId: 'brain:trajectory',
          kind: 'year',
          granularity: 'year',
          nodeType: 'range',
          startDate: '2004-01-01',
          endDate: '2004-12-31',
          pointDate: '2004-12-31',
          systemRole: 'yearBranch',
          autoGenerated: true
        }),
        createTraceNode({
          id: 'brain:trajectory:node:month_2004_12',
          title: '12月',
          parentId: 'brain:trajectory:node:year_2004',
          kind: 'month',
          granularity: 'month',
          nodeType: 'range',
          startDate: '2004-12-01',
          endDate: '2004-12-31',
          pointDate: '2004-12-31',
          systemRole: 'monthBranch',
          autoGenerated: true
        }),
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_12_31',
          title: '2004年12月31日',
          parentId: 'brain:trajectory:node:month_2004_12',
          startDate: '2004-12-31',
          pointDate: '2004-12-31',
          systemRole: 'dayLeaf'
        })
      ]
    })
    const result = createNextCharacterBrainTraceDayTreeNode(character, { now })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const nodes = result.changes.brainTraceNodes
    expect(nodes.find((node) => node.id === result.createdNodeId)).toMatchObject({
      id: 'brain:trajectory:node:day_2005_01_01',
      title: '2005年1月1日',
      parentId: 'brain:trajectory:node:month_2005_01',
      pointDate: '2005-01-01'
    })
    expect(nodes.find((node) => node.id === 'brain:trajectory:node:year_2005')).toMatchObject({
      parentId: 'brain:trajectory',
      systemRole: 'yearBranch'
    })
    expect(nodes.find((node) => node.id === 'brain:trajectory:node:month_2005_01')).toMatchObject({
      parentId: 'brain:trajectory:node:year_2005',
      systemRole: 'monthBranch'
    })
  })

  it('creates a trace day on a selected missing date and rejects duplicate dates', () => {
    const now = '2026-05-04T02:30:00.000Z'
    const character = createCharacter({
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} },
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_05_02',
          startDate: '2004-05-02',
          pointDate: '2004-05-02',
          systemRole: 'dayLeaf'
        })
      ]
    })

    const result = createNextCharacterBrainTraceDayTreeNode(character, {
      targetDate: '2004-05-04',
      subtitle: '跳日记录',
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdDate).toBe('2004-05-04')
    expect(result.changes.brainTraceNodes.find((node) => node.id === result.createdNodeId)).toMatchObject({
      pointDate: '2004-05-04',
      parentId: 'brain:trajectory:node:month_2004_05',
      subtitle: '跳日记录'
    })

    const duplicate = createNextCharacterBrainTraceDayTreeNode({
      ...character,
      brainTraceNodes: result.changes.brainTraceNodes
    }, {
      targetDate: '2004-05-04',
      now
    })
    expect(duplicate).toEqual({ ok: false, message: '目标日期的日桠已存在，不能重复创建。' })
  })

  it('creates event and arrangement documents under a trace day without treating them as day leaves', () => {
    const now = '2026-05-07T01:00:00.000Z'
    const character = createCharacter({
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '', calendarId: 'gregorian', calendarConfig: {} },
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_05_02',
          title: '2004年5月2日',
          parentId: 'brain:trajectory',
          startDate: '2004-05-02',
          pointDate: '2004-05-02',
          systemRole: 'dayLeaf'
        })
      ]
    })

    const eventChanges = createCharacterBrainTraceEventTreeNode(character, {
      id: 'brain:trajectory:node:event_1',
      title: '清晨醒来',
      summary: '当天的具体事件。',
      content: '事件正文。',
      parentId: 'brain:trajectory:node:day_2004_05_02',
      tags: ['事件'],
      now
    })
    const eventNode = eventChanges.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:event_1')
    expect(eventNode).toMatchObject({
      parentId: 'brain:trajectory:node:day_2004_05_02',
      systemRole: 'eventLeaf',
      title: '清晨醒来',
      pointDate: '2004-05-02'
    })
    expect(isFormalTraceDayNode(eventNode)).toBe(false)

    const arrangementChanges = createCharacterBrainTraceArrangementTreeNode({
      ...character,
      brainTraceNodes: eventChanges.brainTraceNodes
    }, {
      id: 'brain:trajectory:node:arrangement_1',
      title: '晚间巡查',
      parentId: 'brain:trajectory:node:day_2004_05_02',
      activationRule: { date: '2004-05-02', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
      recallPolicy: { level: 'summary', priority: 'must' },
      now
    })
    const arrangementNode = arrangementChanges.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:arrangement_1')
    expect(arrangementNode).toMatchObject({
      parentId: 'brain:trajectory:node:day_2004_05_02',
      systemRole: 'arrangementLeaf',
      activationRule: { date: '2004-05-02', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
      recallPolicy: { level: 'summary', priority: 'must' }
    })
    expect(isFormalTraceDayNode(arrangementNode)).toBe(false)
  })

  it('creates selected trace days with custom trajectory month days', () => {
    const result = createNextCharacterBrainTraceDayTreeNode(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-01-31',
        zeroNote: '',
        calendarId: 'trajectory',
        calendarConfig: { monthDays: [32] }
      }
    }), {
      targetDate: '2004-01-32',
      subtitle: '虚拟历法月末',
      now: '2026-05-04T02:45:00.000Z'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdDate).toBe('2004-01-32')
    expect(result.changes.brainTraceNodes.find((node) => node.id === result.createdNodeId)).toMatchObject({
      pointDate: '2004-01-32',
      title: '2004年1月32日',
      offsetDays: 1,
      ageLabel: '出生后第1日'
    })
  })

  it('recalculates trace coverage after deleting the latest trace day', () => {
    const now = '2026-05-04T03:00:00.000Z'
    const character = createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'gregorian',
        calendarConfig: {},
        coverageEndDate: '2004-05-04',
        coverageEndOffsetDays: 2,
        coverageRange: {
          startDate: '2004-05-02',
          startOffsetDays: 0,
          endDate: '2004-05-04',
          endOffsetDays: 2
        }
      },
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_05_02',
          startDate: '2004-05-02',
          pointDate: '2004-05-02',
          systemRole: 'dayLeaf',
          createdAt: now,
          updatedAt: now
        }),
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_05_04',
          startDate: '2004-05-04',
          pointDate: '2004-05-04',
          systemRole: 'dayLeaf',
          createdAt: now,
          updatedAt: now
        })
      ]
    })

    const changes = deleteCharacterBrainTraceTreeNode(character, 'brain:trajectory:node:day_2004_05_04')

    expect(changes.brainTraceNodes.map((node) => node.pointDate)).toEqual(['2004-05-02'])
    expect(changes.brainTrajectoryMeta).toMatchObject({
      coverageEndDate: '2004-05-02',
      coverageRange: {
        startDate: '2004-05-02',
        endDate: '2004-05-02',
        endOffsetDays: 0
      }
    })
    expect(changes.brainTrajectoryMeta).not.toHaveProperty('coverageEndOffsetDays')
  })

  it('creates trace month and year branches without creating day leaves', () => {
    const now = '2026-05-04T03:15:00.000Z'
    const result = createCharacterBrainTraceBranchTreeNode(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'gregorian',
        calendarConfig: {}
      }
    }), {
      kind: 'month',
      year: 2004,
      month: 6,
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdNodeId).toBe('brain:trajectory:node:month_2004_06')
    expect(result.createdRange).toEqual({ startDate: '2004-06-01', endDate: '2004-06-30' })
    expect(result.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:year_2004')).toMatchObject({
      systemRole: 'yearBranch',
      parentId: 'brain:trajectory'
    })
    expect(result.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:month_2004_06')).toMatchObject({
      systemRole: 'monthBranch',
      parentId: 'brain:trajectory:node:year_2004'
    })
    expect(result.changes.brainTraceNodes.some((node) => node.systemRole === 'dayLeaf')).toBe(false)
    expect(result.changes).not.toHaveProperty('brainTrajectoryMeta')
  })

  it('creates trace multi-year branches as structural containers', () => {
    const now = '2026-05-04T03:30:00.000Z'
    const result = createCharacterBrainTraceBranchTreeNode(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'gregorian',
        calendarConfig: {}
      }
    }), {
      kind: 'multiYear',
      year: 2000,
      spanYears: 10,
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdNodeId).toBe('brain:trajectory:node:multi_year_2000_2009')
    expect(result.createdRange).toEqual({ startDate: '2000-01-01', endDate: '2009-12-31' })
    expect(result.changes.brainTraceNodes).toEqual([
      expect.objectContaining({
        kind: 'multiYear',
        granularity: 'multiYear',
        systemRole: 'multiYearBranch',
        title: '2000年-2009年',
        stepUnit: 'year',
        stepAmount: 10
      })
    ])
    expect(result.changes).not.toHaveProperty('brainTrajectoryMeta')
  })

  it('creates year branches under an existing multi-year branch context', () => {
    const now = '2026-05-04T03:40:00.000Z'
    const base = createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'gregorian',
        calendarConfig: {}
      }
    })
    const multiYear = createCharacterBrainTraceBranchTreeNode(base, {
      kind: 'multiYear',
      year: 2000,
      spanYears: 10,
      now
    })
    expect(multiYear.ok).toBe(true)
    if (!multiYear.ok) return

    const result = createCharacterBrainTraceBranchTreeNode({
      ...base,
      brainTraceNodes: multiYear.changes.brainTraceNodes
    }, {
      kind: 'year',
      year: 2004,
      parentId: multiYear.createdNodeId,
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:year_2004')).toMatchObject({
      parentId: 'brain:trajectory:node:multi_year_2000_2009',
      systemRole: 'yearBranch'
    })
  })

  it('batch creates selected years as 10-year containers and year branches without range nodes', () => {
    const now = '2026-05-04T04:10:00.000Z'
    const result = createCharacterBrainTraceBatchTreeNodes(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'trajectory',
        calendarConfig: {}
      }
    }), {
      granularity: 'year',
      years: [2003, 2017],
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdItems).toEqual([
      expect.objectContaining({ kind: 'multiYear', nodeId: 'brain:trajectory:node:multi_year_2004_2013', year: 2004, spanYears: 10 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2004', year: 2004 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2005', year: 2005 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2006', year: 2006 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2007', year: 2007 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2008', year: 2008 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2009', year: 2009 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2010', year: 2010 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2011', year: 2011 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2012', year: 2012 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2013', year: 2013 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2014', year: 2014 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2015', year: 2015 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2016', year: 2016 }),
      expect.objectContaining({ kind: 'year', nodeId: 'brain:trajectory:node:year_2017', year: 2017 })
    ])
    expect(result.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:multi_year_2004_2013')).toMatchObject({
      systemRole: 'multiYearBranch',
      startDate: '2004-01-01',
      endDate: '2013-12-31'
    })
    expect(result.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:year_2004')).toMatchObject({
      systemRole: 'yearBranch',
      parentId: 'brain:trajectory:node:multi_year_2004_2013'
    })
    expect(result.changes.brainTraceNodes.some((node) => node.nodeType === 'range' && node.systemRole === 'freeGroup')).toBe(false)
  })

  it('batch creates months and days without creating range nodes and updates coverage for days only', () => {
    const now = '2026-05-04T04:20:00.000Z'
    const character = createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'trajectory',
        calendarConfig: { monthDays: [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31] }
      }
    })
    const months = createCharacterBrainTraceBatchTreeNodes(character, {
      granularity: 'month',
      year: 2005,
      months: [1, 15, 16],
      now
    })

    expect(months.ok).toBe(true)
    if (!months.ok) return
    expect(months.createdItems).toEqual([
      { kind: 'month', nodeId: 'brain:trajectory:node:month_2005_01', year: 2005, month: 1 },
      { kind: 'month', nodeId: 'brain:trajectory:node:month_2005_15', year: 2005, month: 15 }
    ])
    expect(months.changes).not.toHaveProperty('brainTrajectoryMeta')

    const days = createCharacterBrainTraceBatchTreeNodes({
      ...character,
      brainTraceNodes: months.changes.brainTraceNodes
    }, {
      granularity: 'day',
      dates: ['2004-05-01', '2004-05-02', '2004-05-03', '2005-01-03'],
      subtitle: '批量副标题',
      now
    })

    expect(days.ok).toBe(true)
    if (!days.ok) return
    expect(days.createdItems).toEqual([
      { kind: 'day', nodeId: 'brain:trajectory:node:day_2004_05_02', date: '2004-05-02' },
      { kind: 'day', nodeId: 'brain:trajectory:node:day_2004_05_03', date: '2004-05-03' },
      { kind: 'day', nodeId: 'brain:trajectory:node:day_2005_01_03', date: '2005-01-03' }
    ])
    expect(days.changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:day_2004_05_02')).toMatchObject({
      systemRole: 'dayLeaf',
      subtitle: '批量副标题',
      parentId: 'brain:trajectory:node:month_2004_05'
    })
    expect(days.changes.brainTrajectoryMeta).toMatchObject({
      coverageEndDate: '2005-01-03',
      coverageRange: {
        startDate: '2004-05-02',
        endDate: '2005-01-03'
      }
    })
  })

  it('batch creation respects trace parent date range constraints', () => {
    const now = '2026-05-04T04:30:00.000Z'
    const result = createCharacterBrainTraceBatchTreeNodes(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        calendarId: 'trajectory',
        calendarConfig: {}
      }
    }), {
      granularity: 'year',
      years: [2004, 2007],
      minDate: '2005-01-01',
      maxDate: '2006-12-31',
      now
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.createdItems.filter((item) => item.kind === 'year').map((item) => item.year)).toEqual([2005, 2006])
  })

  it('applies WriteBackDraft pending units through formal tree command and keeps them unconfirmed', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const changes = applyCharacterBrainWriteBackOutcome(createCharacter(), {
      kind: 'pending_unit',
      target: 'soul',
      targetParentId: 'brain:cognition',
      content: {
        title: '雨城礼仪',
        summary: '她刚形成的礼仪理解。',
        content: '雨城礼仪正文',
        tags: ['礼仪'],
        relationHints: ['[[镜庭主城]]']
      }
    }, {
      now,
      idFactory: () => 'brain:cognition:node:pending_etiquette'
    })

    expect(changes.brainCognitionNodes).toEqual([
      expect.objectContaining({
        id: 'brain:cognition:node:pending_etiquette',
        parentId: 'brain:cognition',
        pendingReview: expect.objectContaining({ mode: 'create', createdAt: now })
      })
    ])
    expect(changes.brainDocuments).toBeUndefined()
  })

  it('writes compile pages for pending write-back only when the trajectory switch is enabled', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const changes = applyCharacterBrainWriteBackOutcome(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '',
        zeroNote: '',
        autoCompilePageEnabled: true
      }
    }), {
      kind: 'pending_unit',
      target: 'soul',
      targetParentId: 'brain:cognition',
      content: {
        title: '雨城礼仪',
        summary: '她刚形成的礼仪理解。',
        content: '雨城礼仪正文',
        tags: ['礼仪'],
        relationHints: ['[[镜庭主城]]']
      }
    }, {
      now,
      idFactory: () => 'brain:cognition:node:pending_etiquette'
    })

    expect(changes.brainDocuments['__brain_compile__:brain:cognition:node:pending_etiquette']).toContain('她刚形成的礼仪理解')
  })

  it('applies pending trace write-back as an event under the target day branch', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const dayNode = createTraceNode({
      id: 'brain:trajectory:node:day_2004_05_02',
      systemRole: 'dayLeaf',
      parentId: 'brain:trajectory:node:month_2004_05'
    })
    const changes = applyCharacterBrainWriteBackOutcome(createCharacter({
      brainTraceNodes: [dayNode]
    }), {
      kind: 'pending_unit',
      target: 'trace',
      targetParentId: dayNode.id,
      content: {
        title: '晨间争执',
        summary: '当天清晨发生争执。',
        content: '事件正文',
        tags: ['争执']
      }
    }, {
      now,
      idFactory: () => 'brain:trajectory:node:pending_event_morning'
    })
    const pendingEvent = changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:pending_event_morning')

    expect(pendingEvent).toMatchObject({
      parentId: dayNode.id,
      systemRole: 'eventLeaf',
      title: '晨间争执',
      content: '事件正文',
      confirmed: false,
      pendingReview: { mode: 'create' }
    })
    expect(changes.brainDocuments).toBeUndefined()
  })

  it('applies pending arrangement write-back as an arrangement under the target day branch', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const dayNode = createTraceNode({
      id: 'brain:trajectory:node:day_2004_05_02',
      systemRole: 'dayLeaf',
      parentId: 'brain:trajectory:node:month_2004_05'
    })
    const changes = applyCharacterBrainWriteBackOutcome(createCharacter({
      brainTraceNodes: [dayNode]
    }), {
      kind: 'pending_unit',
      target: 'arrangement',
      targetParentId: dayNode.id,
      content: {
        title: '夜间巡查',
        summary: '当天夜里必须巡查。',
        content: '安排正文',
        tags: ['巡查']
      }
    }, {
      now,
      idFactory: () => 'brain:trajectory:node:pending_arrangement_patrol'
    })
    const pendingArrangement = changes.brainTraceNodes.find((node) => node.id === 'brain:trajectory:node:pending_arrangement_patrol')

    expect(pendingArrangement).toMatchObject({
      parentId: dayNode.id,
      systemRole: 'arrangementLeaf',
      title: '夜间巡查',
      content: '安排正文',
      activationRule: { date: '2004-05-02', recurrence: 'once' },
      recallPolicy: { level: 'summary', priority: 'normal' },
      confirmed: false,
      pendingReview: { mode: 'create' }
    })
  })

  it('consumes approved WriteBackDraft.pendingOutcome instead of rebuilding ad hoc component data', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const changes = applyCharacterBrainWriteBackDraft(createCharacter(), {
      id: 'writeback:char_1:test',
      characterId: 'char_1',
      target: 'soul',
      action: 'create',
      targetParentId: 'brain:cognition',
      content: { title: '夜巡习惯', summary: '夜里会复查档案。' },
      reason: '整理写入',
      sourceLinks: [],
      organizingRecall: {
        required: true,
        satisfied: true,
        confirmedIds: ['brain:desc'],
        roundsCompleted: 1,
        readDecisions: {}
      },
      reviewStatus: 'approved',
      auditRecords: [],
      pendingOutcome: {
        kind: 'pending_unit',
        target: 'soul',
        targetParentId: 'brain:cognition',
        content: { title: '夜巡习惯', summary: '夜里会复查档案。' }
      },
      createdAt: now,
      updatedAt: now
    }, {
      idFactory: () => 'brain:cognition:node:pending_night_check'
    })

    expect(changes.brainCognitionNodes[0]).toMatchObject({
      id: 'brain:cognition:node:pending_night_check',
      pendingReview: { mode: 'create' }
    })
  })

  it('applies, confirms, and rejects pending versions without creating a separate unconfirmed group', () => {
    const now = '2026-04-26T01:00:00.000Z'
    const character = createCharacter({
      brainDocuments: {
        'brain:cognition:node:etiquette': '旧正文'
      },
      brainCognitionNodes: [{
        id: 'brain:cognition:node:etiquette',
        title: '雨城礼仪',
        summary: '旧摘要',
        parentId: 'brain:cognition',
        kind: 'private',
        createdAt: now,
        updatedAt: now
      }]
    })
    const changes = applyCharacterBrainWriteBackOutcome(character, {
      kind: 'pending_version',
      target: 'soul',
      targetUnitId: 'brain:cognition:node:etiquette',
      content: {
        title: '雨城礼仪',
        summary: '新版摘要',
        content: '新版正文',
        tags: ['礼仪'],
        relationHints: []
      }
    }, { now })
    const pendingNode = changes.brainCognitionNodes.find((node) => node.id === 'brain:cognition:node:etiquette')

    expect(changes.brainCognitionNodes).toHaveLength(1)
    expect(pendingNode).toMatchObject({
      summary: '新版摘要',
      pendingReview: {
        mode: 'update',
        previous: { summary: '旧摘要' }
      }
    })

    const confirmed = confirmCharacterBrainPendingVersion({
      ...character,
      brainCognitionNodes: changes.brainCognitionNodes
    }, 'soul', 'brain:cognition:node:etiquette', now)
    expect(confirmed.brainCognitionNodes[0].pendingReview).toBeUndefined()

    const rejected = rejectCharacterBrainPendingVersion({
      ...character,
      brainCognitionNodes: changes.brainCognitionNodes,
      brainDocuments: {
        'brain:cognition:node:etiquette': '新版正文'
      }
    }, 'soul', 'brain:cognition:node:etiquette', now)
    expect(rejected.brainCognitionNodes[0]).toMatchObject({
      summary: '旧摘要',
      pendingReview: undefined
    })
    expect(rejected.brainDocuments['brain:cognition:node:etiquette']).toBe('旧正文')
  })

  it('migrates legacy trajectory ranges into groups and promoted child units', () => {
    const now = '2026-04-24T01:00:00.000Z'
    const monthNode = createTraceNode({
      id: 'brain:trajectory:node:month_2004_05',
      title: '2004年5月',
      kind: 'month',
      granularity: 'month',
      nodeType: 'range',
      startDate: '2004-05-01',
      endDate: '2004-05-31',
      pointDate: '2004-05-31',
      innerEntries: [
        {
          id: 'inner-1',
          nodeType: 'single',
          granularity: 'day',
          startDate: '2004-05-03',
          displayTitle: '5月3日',
          note: '搬家',
          content: '搬家正文',
          linkIds: ['brain:desc'],
          sourceNodeIds: []
        }
      ]
    })
    const result = migrateLegacyTraceNodesToFormalTree(createCharacter({
      brainTraceNodes: [createTraceNode(), monthNode],
      brainTrajectoryMeta: { birthDate: '2004-05-02', zeroNote: '' }
    }), now)
    const group = result.nodes.find((node) => node.id === 'brain:trajectory:node:month_2004_05')
    const promotedDay = result.nodes.find((node) => node.parentId === 'brain:trajectory:node:month_2004_05' && node.pointDate === '2004-05-03')

    expect(group).toMatchObject({
      kind: 'month',
      granularity: 'month',
      nodeType: 'range',
      innerEntries: []
    })
    expect(promotedDay).toMatchObject({
      kind: 'day',
      granularity: 'day',
      nodeType: 'single',
      parentId: 'brain:trajectory:node:month_2004_05',
      note: '搬家',
      content: '搬家正文'
    })
    expect(result.migratedSourceIds).toEqual(expect.arrayContaining([
      'brain:trajectory:node:month_2004_05',
      'brain:trajectory:node:month_2004_05::inner-1'
    ]))
    expect(result.changes.brain_trace_nodes).toContain('migrated_brain~3Atrajectory~3Anode~3Amonth_2004_05_0')
  })

  it('deletes only the role-brain reference node when a soul unit points to a document', () => {
    const character = createCharacter({
      brainCognitionNodes: [
        {
          id: 'brain:cognition:node:manual',
          title: '琅嬛使用说明',
          summary: '引用说明。',
          parentId: 'brain:cognition',
          kind: 'reference',
          sourceDocumentId: 'doc-manual',
          sourceDisplayPath: '/说明/琅嬛使用说明.md',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z'
        }
      ],
      documents: [
        {
          documentId: 'doc-manual',
          title: '琅嬛使用说明',
          content: '文档库正文'
        }
      ]
    })

    const changes = deleteCharacterBrainSoulTreeNode(character, 'brain:cognition:node:manual')

    expect(changes.brainCognitionNodes).toEqual([])
    expect(changes.brain_cognition_nodes).toBe('[]')
    expect(changes).not.toHaveProperty('documents')
  })
})
