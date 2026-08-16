import { describe, expect, it } from 'vitest'
import {
  applyCharacterBrainCardDraft,
  buildCharacterBrainCard,
  buildCharacterBrainLinkSuggestions,
  buildCharacterBrainTrajectoryMetaChange,
  buildCharacterBrainNodes,
  getCharacterBrainRootId,
  readCharacterBrainCognitionNodes,
  readCharacterBrainCompilePage,
  readCharacterBrainDocument,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from '../../../src/app/characterBrain'

function createTraceNode(overrides = {}) {
  return {
    id: 'brain:trajectory:node:test',
    title: '测试节点',
    summary: '',
    parentId: 'brain:trajectory',
    kind: 'year',
    nodeType: 'single',
    granularity: 'year',
    startDate: '2004-05-02',
    displayTitle: '测试节点',
    note: '',
    innerEntries: [],
    linkIds: [],
    timeLabel: '',
    pointDate: '2004-05-02',
    offsetDays: 0,
    ageLabel: '',
    stepUnit: 'year',
    stepAmount: 1,
    relatedEntityIds: [],
    tags: [],
    content: '',
    confirmed: true,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    ...overrides
  }
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    gender: '女',
    age: '18',
    emoji: '🌟',
    avatar_path: '',
    group_id: 'default',
    desc: '一个会认真整理脑内信息的角色。',
    appearance: '银发，蓝眼。',
    outfit: '白衬衫。',
    personality: '活泼。',
    hobbies: '读书。',
    abilities: '总结。',
    experience: '',
    worldview: '',
    background: '',
    speaking_style: '轻快。',
    nicknames: '依依,小星',
    default_preset: '温柔',
    default_model: 'gpt-test',
    schedule: '',
    yearly_schedule: '',
    current_activities: '',
    relationships: '',
    affection: 50,
    locations: '',
    orderIndex: 1,
    created_at: '',
    avatarPath: '',
    groupId: 'default',
    speakingStyle: '轻快。',
    yearlySchedule: '',
    currentActivities: '',
    defaultPreset: '温柔',
    defaultModel: 'gpt-test',
    ttsVoice: 'star-voice',
    brainLinks: {},
    brain_links: '{}',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainTraceNodes: [],
    brain_trace_nodes: '[]',
    brainTrajectoryMeta: {
      birthDate: '',
      zeroNote: ''
    },
    brain_trajectory_meta: '{"birthDate":"","zeroNote":""}',
    ...overrides
  }
}

describe('characterBrain', () => {
  it('builds root scene with role and main brain zones', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: getCharacterBrainRootId(), minDensity: 1 })
    expect(nodes.map((item) => item.id)).toEqual([
      'brain:root',
      'brain:see_me',
      'brain:trajectory',
      'brain:cognition'
    ])
    expect(nodes.map((item) => item.title)).toEqual(['星依', '核心', '轨迹', '灵魂'])
  })

  it('builds see-me scene with fixed and detail nodes', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:see_me', minDensity: 1 })
    const ids = nodes.map((item) => item.id)
    expect(ids).toContain('brain:desc')
    expect(ids).toContain('brain:personality')
    expect(ids).toContain('brain:goal_value')
    expect(ids).toContain('brain:detail_info')
    expect(ids).toContain('brain:system_info')
    expect(ids).not.toContain('brain:tts_voice')
    expect(ids.filter((id) => ['brain:desc', 'brain:personality', 'brain:goal_value', 'brain:detail_info', 'brain:system_info'].includes(id))).toEqual([
      'brain:desc',
      'brain:personality',
      'brain:goal_value',
      'brain:detail_info',
      'brain:system_info'
    ])
    expect(ids).toContain('brain:trajectory')
    expect(ids).toContain('brain:cognition')
  })

  it('splits avatar into emoji/path and preset into default preset/model child nodes', () => {
    const avatarSceneIds = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:avatar', minDensity: 1 })
      .map((item) => item.id)
    const presetSceneIds = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:preset', minDensity: 1 })
      .map((item) => item.id)

    expect(avatarSceneIds).toContain('brain:avatar')
    expect(avatarSceneIds).toContain('brain:emoji')
    expect(avatarSceneIds).toContain('brain:avatar_path')
    expect(presetSceneIds).toContain('brain:preset')
    expect(presetSceneIds).toContain('brain:default_preset')
    expect(presetSceneIds).toContain('brain:default_model')
  })

  it('builds real child scene when focusing system info instead of jumping back to root scene', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:system_info', minDensity: 1 })
    const ids = nodes.map((item) => item.id)
    const trajectory = nodes.find((item) => item.id === 'brain:trajectory')
    expect(ids).toContain('brain:root')
    expect(ids).toContain('brain:see_me')
    expect(ids).toContain('brain:system_info')
    expect(ids).toContain('brain:name')
    expect(ids).toContain('brain:gender')
    expect(ids).toContain('brain:age')
    expect(trajectory).toMatchObject({
      size: 1,
      density: 1
    })
  })

  it('recalculates focus scene density and size by relationship distance', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:system_info', minDensity: 1 })
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]))

    expect(byId['brain:system_info']).toMatchObject({ size: 3, density: 5 })
    expect(byId['brain:see_me']).toMatchObject({ size: 2, density: 5 })
    expect(byId['brain:name']).toMatchObject({ size: 2, density: 5 })
    expect(byId['brain:desc']).toMatchObject({ size: 1, density: 2 })
    expect(byId['brain:trajectory']).toMatchObject({ size: 1, density: 1 })
  })

  it('builds detail info scene with nested real nodes', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:detail_info', minDensity: 1 })
    const ids = nodes.map((item) => item.id)
    expect(ids).toContain('brain:appearance')
    expect(ids).toContain('brain:speaking_style')
    expect(ids).toContain('brain:background')
  })

  it('keeps root siblings visible when focusing cognition', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:cognition', minDensity: 1 })
    const ids = nodes.map((item) => item.id)
    expect(ids).toContain('brain:root')
    expect(ids).toContain('brain:see_me')
    expect(ids).toContain('brain:trajectory')
    expect(ids).toContain('brain:cognition')
  })

  it('builds persisted cognition nodes under cognition scene', () => {
    const character = createCharacter({
      brainCognitionNodes: [
        {
          id: 'brain:cognition:node:raincourt',
          title: '镜庭雨城',
          summary: '角色已知的镜庭雨城入口。',
          parentId: 'brain:cognition',
          kind: 'group',
          createdAt: '2026-04-14T00:00:00.000Z',
          updatedAt: '2026-04-14T00:00:00.000Z'
        },
        {
          id: 'brain:cognition:node:capital',
          title: '镜庭主城',
          summary: '来自世界树的主城资料。',
          parentId: 'brain:cognition:node:raincourt',
          kind: 'reference',
          sourceDocumentId: 'doc_capital',
          sourceDisplayPath: '/世界树/镜庭雨城/镜庭主城.md',
          createdAt: '2026-04-14T00:00:00.000Z',
          updatedAt: '2026-04-14T00:00:00.000Z'
        }
      ]
    })

    const cognitionNodes = buildCharacterBrainNodes(character, { focusId: 'brain:cognition', minDensity: 1 })
    expect(cognitionNodes.find((item) => item.id === 'brain:cognition:node:raincourt')).toMatchObject({
      title: '镜庭雨城',
      parentId: 'brain:cognition',
      kind: 'group'
    })

    const childNodes = buildCharacterBrainNodes(character, { focusId: 'brain:cognition:node:raincourt', minDensity: 1 })
    expect(childNodes.find((item) => item.id === 'brain:cognition:node:capital')).toMatchObject({
      title: '镜庭主城',
      parentId: 'brain:cognition:node:raincourt',
      sourceDocumentId: 'doc_capital',
      sourceDisplayPath: '/世界树/镜庭雨城/镜庭主城.md'
    })
  })

  it('keeps root siblings visible when focusing trajectory', () => {
    const character = createCharacter({
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:year_1',
          title: '2005年',
          summary: '一岁',
          parentId: 'brain:trajectory',
          kind: 'year',
          timeLabel: '2004-05-02 → 2005-05-02｜0岁到1岁',
          spanYears: 1,
          startAge: 0,
          endAge: 1,
          startDate: '2004-05-02',
          endDate: '2005-05-02',
          relatedEntityIds: [],
          tags: [],
          content: '出生后的第一年。',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        }
      ]
    })

    const nodes = buildCharacterBrainNodes(character, { focusId: 'brain:trajectory', minDensity: 1 })
    const ids = nodes.map((item) => item.id)
    expect(ids).toContain('brain:root')
    expect(ids).toContain('brain:trajectory')
    expect(ids).toContain('brain:see_me')
    expect(ids).toContain('brain:cognition')
    expect(ids).toContain('brain:trajectory:node:year_1')
  })

  it('shows only real trajectory nodes after the projection model is removed', () => {
    const tenYearNode = createTraceNode({
      id: 'brain:trajectory:node:year_10',
      title: '2014年',
      summary: '十岁节点',
      kind: 'decade',
      timeLabel: '2014-05-02｜10岁｜本次追加10年',
      pointDate: '2014-05-02',
      offsetDays: 3652,
      ageLabel: '10岁',
      stepUnit: 'year',
      stepAmount: 10,
      content: '十岁节点摘要。'
    })

    const nodes = buildCharacterBrainNodes(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: ''
      },
      brainTraceNodes: [tenYearNode]
    }), { focusId: 'brain:trajectory', minDensity: 1 })
    const titles = nodes.map((item) => item.title)
    expect(nodes.some((item) => item.id === 'brain:trajectory:node:year_10')).toBe(true)
    expect(titles).not.toContain('2005年5月2日')
    expect(nodes.some((item) => item.id.startsWith('brain:trajectory:projection:'))).toBe(false)
  })

  it('uses fixed granularity lengths for trajectory spacing on the axis', () => {
    const character = createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '',
        viewOffsets: {
          'brain:trajectory:node:year_2008': { x: 50, y: 0 },
          'brain:trajectory:node:year_2010': { x: 100, y: 0 }
        },
        projectionOffsets: {
          'brain:trajectory:node:year_2008': { x: 50, y: 0 },
          'brain:trajectory:node:year_2010': { x: 100, y: 0 }
        }
      },
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:month_2005_01',
          title: '2005年1月',
          summary: '一月',
          kind: 'month',
          granularity: 'month',
          pointDate: '2005-01-01',
          startDate: '2005-01-01',
          offsetDays: 365,
          ageLabel: '1岁',
          stepUnit: 'month',
          stepAmount: 1
        }),
        createTraceNode({
          id: 'brain:trajectory:node:year_2005',
          title: '2005年',
          summary: '一岁',
          kind: 'year',
          granularity: 'year',
          pointDate: '2005-12-31',
          startDate: '2005-01-01',
          endDate: '2005-12-31',
          offsetDays: 730,
          ageLabel: '2岁',
          stepUnit: 'year',
          stepAmount: 1
        }),
        createTraceNode({
          id: 'brain:trajectory:node:decade_2010',
          title: '2010年-2019年',
          summary: '十年段',
          kind: 'decade',
          granularity: 'decade',
          nodeType: 'range',
          pointDate: '2019-12-31',
          startDate: '2010-01-01',
          endDate: '2019-12-31',
          offsetDays: 1461,
          ageLabel: '10岁',
          stepUnit: 'year',
          stepAmount: 10
        }),
        createTraceNode({
          id: 'brain:trajectory:node:century_2100',
          title: '2100年-2199年',
          summary: '百年段',
          kind: 'century',
          granularity: 'century',
          nodeType: 'range',
          pointDate: '2199-12-31',
          startDate: '2100-01-01',
          endDate: '2199-12-31',
          offsetDays: 2191,
          ageLabel: '100岁',
          stepUnit: 'year',
          stepAmount: 100
        })
      ]
    })

    const nodes = buildCharacterBrainNodes(character, { focusId: 'brain:trajectory', minDensity: 1 })
    const byId = Object.fromEntries(nodes.map((node) => [node.id, node]))

    const gapMonthToYear = byId['brain:trajectory:node:year_2005'].x - byId['brain:trajectory:node:month_2005_01'].x
    const gapYearToDecade = byId['brain:trajectory:node:decade_2010'].x - byId['brain:trajectory:node:year_2005'].x
    const gapDecadeToCentury = byId['brain:trajectory:node:century_2100'].x - byId['brain:trajectory:node:decade_2010'].x
    expect(gapMonthToYear).toBeCloseTo(240, 4)
    expect(gapYearToDecade).toBeCloseTo(240, 4)
    expect(gapDecadeToCentury).toBeCloseTo(240, 4)
  })

  it('renders inner navigation entries on real range trajectory cards', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:range_1',
          title: '1月2日-1月4日',
          summary: '概括节点',
          note: '概括节点',
          kind: 'month',
          granularity: 'month',
          nodeType: 'range',
          startDate: '0100-01-02',
          endDate: '0100-01-04',
          pointDate: '0100-01-04',
          displayTitle: '1月2日-1月4日',
          innerEntries: [
            {
              id: 'inner-1',
              nodeType: 'single',
              granularity: 'day',
              startDate: '0100-01-02',
              displayTitle: '2日',
              note: '第一天',
              content: '内容 1',
              linkIds: [],
              sourceNodeIds: ['brain:trajectory:node:day_2']
            }
          ]
        })
      ]
    })

    const card = buildCharacterBrainCard(character, 'brain:trajectory:node:range_1')
    expect(card?.innerEntries).toHaveLength(1)
    expect(card?.innerEntries?.[0]).toMatchObject({
      displayTitle: '2日',
      content: '内容 1'
    })
  })

  it('builds editable parallel cards for trajectory inner entries', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:range_1',
          title: '100年1月',
          summary: '月节点',
          note: '月节点',
          kind: 'month',
          granularity: 'month',
          startDate: '0100-01-01',
          pointDate: '0100-01-31',
          displayTitle: '100年1月',
          innerEntries: [
            {
              id: 'inner-5',
              nodeType: 'single',
              granularity: 'day',
              startDate: '0100-01-05',
              displayTitle: '5日',
              note: '第五日',
              content: '第五日正文',
              linkIds: ['brain:appearance'],
              sourceNodeIds: []
            }
          ]
        })
      ]
    })

    const card = buildCharacterBrainCard(character, 'brain:trajectory:node:range_1::inner::inner-5')
    expect(card?.title).toContain('5日')
    expect(card?.formFields?.map((field) => field.key)).toEqual(['trace.inner.note', 'trace.inner.content'])
    expect(card?.linkDraft.targetIds).toEqual(['brain:appearance'])
  })

  it('keeps trajectory cards focused on user-facing fields', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:year_1',
          title: '2001年',
          summary: '幼年',
          note: '幼年',
          pointDate: '2001-01-01',
          offsetDays: 366,
          ageLabel: '1岁',
          kind: 'year',
          granularity: 'year',
          stepUnit: 'year',
          stepAmount: 1,
          summaryMode: 'ai_compact_pending',
          relatedEntityIds: ['brain:appearance'],
          tags: ['春天', '校园'],
          content: '正文'
        })
      ]
    })

    const card = buildCharacterBrainCard(character, 'brain:trajectory:node:year_1')
    const labels = (card?.formFields || []).map((field) => field.label)
    expect(labels).toEqual(['时间点', '出生后第几日', '备注', '正文', '标签'])
    const tagField = card?.formFields?.find((field) => field.label === '标签')
    expect(tagField?.value).toBe('春天，校园')
  })

  it('renders trace leaf nodes as fields instead of expandable groups', () => {
    const character = createCharacter({
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:year_3',
          title: '2007年',
          summary: '三岁',
          parentId: 'brain:trajectory',
          kind: 'year',
          timeLabel: '2004-05-02 → 2007-05-02｜0岁到3岁',
          spanYears: 3,
          startAge: 0,
          endAge: 3,
          startDate: '2004-05-02',
          endDate: '2007-05-02',
          relatedEntityIds: [],
          tags: [],
          content: '零岁到三岁的摘要。',
          confirmed: true,
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        }
      ]
    })

    const nodes = buildCharacterBrainNodes(character, { focusId: 'brain:trajectory', minDensity: 1 })
    expect(nodes.find((item) => item.id === 'brain:trajectory:node:year_3')).toMatchObject({
      kind: 'field'
    })
  })

  it('uses the same sibling positions when the same parent is rendered through different focus paths', () => {
    const focusedCoreNodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:see_me', minDensity: 1 })
    const focusedBasicInfoNodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:basic_info', minDensity: 1 })

    expect(readRelativePoint(focusedCoreNodes, 'brain:see_me', 'brain:trajectory')).toEqual(
      readRelativePoint(focusedBasicInfoNodes, 'brain:see_me', 'brain:trajectory')
    )
    expect(readRelativePoint(focusedCoreNodes, 'brain:see_me', 'brain:cognition')).toEqual(
      readRelativePoint(focusedBasicInfoNodes, 'brain:see_me', 'brain:cognition')
    )
  })

  it('keeps see-me children on evenly spaced sibling angles', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:see_me', minDensity: 1 })
    const seeMe = nodes.find((item) => item.id === 'brain:see_me')
    expect(seeMe).toBeTruthy()

    const childAngles = nodes
      .filter((item) => item.parentId === 'brain:see_me')
      .map((item) => normalizeAngle(Math.atan2(item.y - seeMe.y, item.x - seeMe.x) * 180 / Math.PI))

    expect(childAngles.length).toBeGreaterThan(1)
    const expectedStep = 360 / childAngles.length

    for (let index = 0; index < childAngles.length; index += 1) {
      const nextAngle = childAngles[(index + 1) % childAngles.length]
      expect(angleDistance(normalizeAngle(childAngles[index] + expectedStep), nextAngle)).toBeLessThan(0.01)
    }
  })

  it('keeps the parent node on the outermost ring of the see-me scene', () => {
    const nodes = buildCharacterBrainNodes(createCharacter(), { focusId: 'brain:see_me', minDensity: 1 })
    const seeMe = nodes.find((item) => item.id === 'brain:see_me')
    const root = nodes.find((item) => item.id === 'brain:root')
    expect(seeMe).toBeTruthy()
    expect(root).toBeTruthy()

    const rootDistance = distance(seeMe, root)
    nodes
      .filter((item) => item.parentId === 'brain:see_me')
      .forEach((item) => {
        expect(rootDistance).toBeGreaterThan(distance(seeMe, item) - 0.01)
      })
  })

  it('builds editable card content for basic info and preset nodes', () => {
    const character = createCharacter()
    const basicInfoCard = buildCharacterBrainCard(character, 'brain:basic_info')
    const presetCard = buildCharacterBrainCard(character, 'brain:preset')
    expect(basicInfoCard?.editable).toBe(true)
    expect(basicInfoCard?.content).toContain('姓名：星依')
    expect(presetCard?.content).toContain('默认模型：gpt-test')
  })

  it('maps basic info draft back to structured character changes', () => {
    const changes = applyCharacterBrainCardDraft(
      createCharacter(),
      'brain:basic_info',
      ['# 基础信息', '', '姓名：陈星依', '性别：女', '年龄：19', '', '## 简介', '新的简介'].join('\n')
    )
    expect(changes).toMatchObject({
      name: '陈星依',
      gender: '女',
      age: '19',
      desc: '新的简介'
    })
  })

  it('stores nickname drafts back to comma separated values', () => {
    const changes = applyCharacterBrainCardDraft(
      createCharacter(),
      'brain:nicknames',
      ['# 昵称', '', '- 依依', '- 星宝'].join('\n')
    )
    expect(changes).toMatchObject({
      nicknames: ['依依', '星宝']
    })
  })

  it('stores trajectory meta without writing a trajectory root document', () => {
    const changes = applyCharacterBrainCardDraft(createCharacter(), 'brain:trajectory', {
      'trajectory.birthDate': '20040502',
      'trajectory.zeroNote': '角色诞生',
      'trajectory.calendarMonthDays': '31,30,31,30,31,30,31,30,31,30,31,30',
      'trajectory.content': '零岁节点摘要'
    })

    expect(changes.brainTrajectoryMeta).toMatchObject({
      birthDate: '2004-05-02',
      zeroNote: '角色诞生',
      calendarId: 'gregorian',
      calendarConfig: {
        monthDays: [31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30]
      },
      autoCompilePageEnabled: false,
      version: 2
    })
    expect(changes.brainDocuments).toBeUndefined()
  })

  it('keeps empty trajectory calendar settings as default gregorian', () => {
    const changes = applyCharacterBrainCardDraft(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '角色诞生',
        calendarConfig: {
          monthDays: [31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30]
        }
      }
    }), 'brain:trajectory', {
      'trajectory.birthDate': '2004-05-02',
      'trajectory.zeroNote': '角色诞生',
      'trajectory.calendarMonthDays': ',,,,,,,,,,,'
    })

    expect(changes.brainTrajectoryMeta.calendarConfig).toEqual({})
    expect(JSON.parse(changes.brain_trajectory_meta).calendarConfig).toEqual({})
  })

  it('stores the trajectory auto compile-page switch in trajectory meta', () => {
    const changes = applyCharacterBrainCardDraft(createCharacter(), 'brain:trajectory', {
      'trajectory.birthDate': '2004-05-02',
      'trajectory.zeroNote': '角色诞生',
      'trajectory.autoCompilePageEnabled': 'true'
    })

    expect(changes.brainTrajectoryMeta).toMatchObject({
      birthDate: '2004-05-02',
      autoCompilePageEnabled: true
    })
    expect(JSON.parse(changes.brain_trajectory_meta).autoCompilePageEnabled).toBe(true)
  })

  it('renders trajectory root as editable birth-date and calendar settings', () => {
    const card = buildCharacterBrainCard(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '出生当天',
        calendarConfig: {
          monthDays: [31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 30]
        }
      }
    }), 'brain:trajectory')

    expect(card?.content).toContain('首个日桠：2004-05-02')
    expect(card?.content).toContain('| 2月 | 30天 |')
    expect(card?.formFields?.map((field) => field.key)).toEqual([
      'trajectory.birthDate',
      'trajectory.zeroNote',
      'trajectory.calendarMonthDays',
      'trajectory.autoCompilePageEnabled'
    ])
    expect(card?.formFields?.find((field) => field.key === 'trajectory.calendarMonthDays')).toMatchObject({
      label: '轨迹日历',
      type: 'calendarMonthDays',
      value: '31,30,31,30,31,30,31,30,31,30,31,30'
    })
    expect(card?.formFields?.find((field) => field.key === 'trajectory.autoCompilePageEnabled')).toMatchObject({
      label: '自动生成编译页',
      type: 'checkbox',
      value: ''
    })
  })

  it('detaches a document reference into private soul content when saving a document draft', () => {
    const character = createCharacter({
      brainCognitionNodes: [{
        id: 'brain:cognition:node:manual',
        title: '琅嬛使用说明',
        summary: '公共摘要',
        parentId: 'brain:cognition',
        kind: 'reference',
        sourceDocumentId: 'doc_manual',
        sourceDisplayPath: '/世界树/琅嬛使用说明.md',
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:00:00.000Z'
      }]
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:cognition:node:manual', {
      documentTitle: '角色私有说明',
      documentContent: '角色已经改写过的正文。',
      'compile.summary': '私有摘要',
      'compile.tags': ['私有', '说明'],
      'compile.relationHints': ['[[核心]]'],
      'compile.scoreDirectBase': 46,
      'compile.scoreExpandBase': 35,
      'compile.scoreSelfAnchor': 44,
      'compile.scoreUserAnchor': 22,
      'compile.scoreOtherAnchor': 16,
      sourceSnapshotTitle: '琅嬛使用说明',
      sourceSnapshotSummary: '公共摘要'
    })
    const nextCharacter = createCharacter(changes)
    const node = readCharacterBrainCognitionNodes(nextCharacter)
      .find((item) => item.id === 'brain:cognition:node:manual')

    expect(node).toMatchObject({
      title: '角色私有说明',
      kind: 'private',
      content: '角色已经改写过的正文。',
      summary: '私有摘要',
      sourceDocumentId: 'doc_manual',
      sourceDisplayPath: '/世界树/琅嬛使用说明.md',
      sourceSnapshotTitle: '琅嬛使用说明',
      sourceSnapshotSummary: '公共摘要'
    })
    expect(node?.sourceDetachedAt).toBeTruthy()
    expect(readCharacterBrainDocument(nextCharacter, 'brain:cognition:node:manual')).toBe('角色已经改写过的正文。')
    expect(readCharacterBrainCompilePage(nextCharacter, 'brain:cognition:node:manual')).toMatchObject({
      summary: '私有摘要',
      tags: ['私有', '说明'],
      relationHints: ['[[核心]]'],
      scoreDirectBase: 46,
      scoreExpandBase: 35,
      scoreSelfAnchor: 44,
      scoreUserAnchor: 22,
      scoreOtherAnchor: 16
    })
  })

  it('saves trace day leaves through the document editor draft fields', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:day_2004_05_03',
          title: '2004年5月3日',
          kind: 'day',
          granularity: 'day',
          nodeType: 'single',
          startDate: '2004-05-03',
          pointDate: '2004-05-03',
          displayTitle: '2004年5月3日',
          content: '旧正文'
        })
      ]
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:trajectory:node:day_2004_05_03', {
      documentTitle: '第一次睁眼',
      documentSubtitle: '第一次睁眼',
      documentContent: '新正文，按文档形式保存。',
      'compile.summary': '新摘要',
      'compile.tags': ['轨迹', '日桠'],
      'compile.relationHints': ['[[核心]]']
    })
    const nextCharacter = createCharacter(changes)
    const node = readCharacterBrainTraceNodes(nextCharacter)
      .find((item) => item.id === 'brain:trajectory:node:day_2004_05_03')

    expect(node).toMatchObject({
      title: '2004年5月3日',
      displayTitle: '2004年5月3日',
      subtitle: '第一次睁眼',
      content: '新正文，按文档形式保存。',
      summary: '新摘要',
      note: '新摘要',
      tags: ['轨迹', '日桠']
    })
    expect(readCharacterBrainCompilePage(nextCharacter, 'brain:trajectory:node:day_2004_05_03')).toMatchObject({
      summary: '新摘要',
      tags: ['轨迹', '日桠'],
      relationHints: ['[[核心]]']
    })
  })

  it('saves trace group branches as editable documents without rewriting their range', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:group_childhood',
          title: '童年',
          kind: 'year',
          granularity: 'year',
          nodeType: 'range',
          startDate: '2004-05-02',
          endDate: '2010-05-02',
          pointDate: '2010-05-02',
          displayTitle: '童年',
          content: '旧枝正文'
        })
      ]
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:trajectory:node:group_childhood', {
      documentTitle: '童年阶段',
      documentContent: '新枝正文，作为轨迹枝文档保存。',
      'compile.summary': '阶段摘要',
      'compile.tags': ['轨迹', '枝'],
      'compile.relationHints': ['[[第一次睁眼]]']
    })
    const nextCharacter = createCharacter(changes)
    const node = readCharacterBrainTraceNodes(nextCharacter)
      .find((item) => item.id === 'brain:trajectory:node:group_childhood')

    expect(node).toMatchObject({
      title: '童年阶段',
      displayTitle: '童年阶段',
      startDate: '2004-05-02',
      endDate: '2010-05-02',
      pointDate: '2010-05-02',
      content: '新枝正文，作为轨迹枝文档保存。',
      summary: '阶段摘要',
      note: '阶段摘要',
      tags: ['轨迹', '枝']
    })
    expect(readCharacterBrainCompilePage(nextCharacter, 'brain:trajectory:node:group_childhood')).toMatchObject({
      summary: '阶段摘要',
      tags: ['轨迹', '枝'],
      relationHints: ['[[第一次睁眼]]']
    })
  })

  it('saves trace arrangement activation and recall settings through the document editor draft', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:arrangement_watch',
          title: '夜间巡查',
          kind: 'day',
          granularity: 'day',
          nodeType: 'single',
          systemRole: 'arrangementLeaf',
          startDate: '2004-05-03',
          pointDate: '2004-05-03',
          displayTitle: '夜间巡查',
          content: '旧安排正文',
          activationRule: { date: '2004-05-03', recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'normal' }
        })
      ]
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:trajectory:node:arrangement_watch', {
      documentTitle: '夜间巡查',
      documentContent: '新安排正文。',
      'compile.summary': '巡查摘要',
      'arrangement.date': '2004-05-04',
      'arrangement.recurrence': 'weekly',
      'arrangement.allDay': false,
      'arrangement.startTime': '20:00',
      'arrangement.endTime': '22:00',
      'arrangement.prewarmMinutes': '15',
      'arrangement.graceMinutes': '30',
      'arrangement.recallLevel': 'body',
      'arrangement.recallPriority': 'must'
    })
    const nextCharacter = createCharacter(changes)
    const node = readCharacterBrainTraceNodes(nextCharacter)
      .find((item) => item.id === 'brain:trajectory:node:arrangement_watch')

    expect(node).toMatchObject({
      systemRole: 'arrangementLeaf',
      title: '夜间巡查',
      displayTitle: '夜间巡查',
      content: '新安排正文。',
      activationRule: {
        date: '2004-05-04',
        recurrence: 'weekly',
        startTime: '20:00',
        endTime: '22:00',
        prewarmMinutes: 15,
        graceMinutes: 30
      },
      recallPolicy: {
        level: 'body',
        priority: 'must'
      }
    })
  })

  it('does not rewrite a newly created trace arrangement title to its date on save', () => {
    const character = createCharacter({
      brainTraceNodes: [
        createTraceNode({
          id: 'brain:trajectory:node:arrangement_new',
          title: '新安排',
          kind: 'day',
          granularity: 'day',
          nodeType: 'single',
          systemRole: 'arrangementLeaf',
          startDate: '0091-05-12',
          pointDate: '0091-05-12',
          displayTitle: '新安排',
          content: '',
          activationRule: { date: '0091-05-12', recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'normal' }
        })
      ]
    })

    const changes = applyCharacterBrainCardDraft(character, 'brain:trajectory:node:arrangement_new', {
      documentTitle: '新安排',
      documentContent: '新的安排正文。',
      'arrangement.date': '0091-05-12',
      'arrangement.recurrence': 'once',
      'arrangement.allDay': true,
      'arrangement.prewarmMinutes': '0',
      'arrangement.graceMinutes': '0',
      'arrangement.recallLevel': 'summary',
      'arrangement.recallPriority': 'normal'
    })
    const nextCharacter = createCharacter(changes)
    const node = readCharacterBrainTraceNodes(nextCharacter)
      .find((item) => item.id === 'brain:trajectory:node:arrangement_new')

    expect(node).toMatchObject({
      systemRole: 'arrangementLeaf',
      title: '新安排',
      displayTitle: '新安排',
      startDate: '0091-05-12',
      pointDate: '0091-05-12',
      activationRule: {
        date: '0091-05-12',
        recurrence: 'once'
      }
    })
  })

  it('keeps trajectory coverage range when editing trajectory root card', () => {
    const changes = applyCharacterBrainCardDraft(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '原始备注',
        coverageRange: {
          startDate: '2004-05-02',
          startOffsetDays: 0,
          endDate: '2004-06-02',
          endOffsetDays: 31
        },
        coverageEndDate: '2004-06-02',
        coverageEndOffsetDays: 31
      }
    }), 'brain:trajectory', {
      'trajectory.birthDate': '2004-05-02',
      'trajectory.zeroNote': '更新备注',
      'trajectory.content': '零岁节点摘要'
    })

    expect(changes.brainTrajectoryMeta).toMatchObject({
      birthDate: '2004-05-02',
      zeroNote: '更新备注',
      coverageRange: {
        startDate: '2004-05-02',
        startOffsetDays: 0,
        endDate: '2004-06-02',
        endOffsetDays: 31
      },
      coverageEndDate: '2004-06-02',
      coverageEndOffsetDays: 31
    })
  })

  it('reads and writes trajectory coverage range through the formal range layer', () => {
    const meta = readCharacterBrainTrajectoryMeta(createCharacter({
      brainTrajectoryMeta: {
        birthDate: '2004-05-02',
        zeroNote: '角色诞生',
        coverageRange: {
          startDate: '2004-05-02',
          startOffsetDays: 0,
          endDate: '2004-06-02',
          endOffsetDays: 31
        }
      }
    }))

    expect(meta).toMatchObject({
      birthDate: '2004-05-02',
      zeroNote: '角色诞生',
      coverageRange: {
        startDate: '2004-05-02',
        startOffsetDays: 0,
        endDate: '2004-06-02',
        endOffsetDays: 31
      },
      coverageEndDate: '2004-06-02',
      coverageEndOffsetDays: 31,
      viewOffsets: {},
      calendarId: 'gregorian',
      version: 2
    })

    const changes = buildCharacterBrainTrajectoryMetaChange({
      birthDate: '2004-05-02',
      zeroNote: '角色诞生',
      coverageRange: {
        startDate: '2004-05-02',
        startOffsetDays: 0,
        endDate: '2005-05-02',
        endOffsetDays: 365
      }
    })

    expect(changes.brainTrajectoryMeta).toMatchObject({
      birthDate: '2004-05-02',
      zeroNote: '角色诞生',
      coverageRange: {
        startDate: '2004-05-02',
        startOffsetDays: 0,
        endDate: '2005-05-02',
        endOffsetDays: 365
      },
      coverageEndDate: '2005-05-02',
      coverageEndOffsetDays: 365,
      calendarId: 'gregorian',
      version: 2
    })
  })

  it('renders pending trace review card with previous and current versions', () => {
    const character = createCharacter({
      brainTraceNodes: [
        {
          id: 'brain:trajectory:node:pending_update',
          title: '2009年',
          summary: '新版备注',
          parentId: 'brain:trajectory',
          kind: 'year',
          timeLabel: '2008-05-02 → 2009-05-02｜4岁到5岁',
          spanYears: 1,
          startAge: 4,
          endAge: 5,
          startDate: '2008-05-02',
          endDate: '2009-05-02',
          relatedEntityIds: ['母亲'],
          tags: ['成长'],
          content: '新版正文',
          confirmed: false,
          pendingReview: {
            mode: 'update',
            reason: '自动整理建议改写这个年份节点',
            createdBy: 'agent',
            createdAt: '2026-04-16T00:00:00.000Z',
            previous: {
              title: '2009年',
              summary: '旧版备注',
              content: '旧版正文',
              timeLabel: '2008-05-02 → 2009-05-02｜4岁到5岁'
            }
          },
          createdAt: '2026-04-16T00:00:00.000Z',
          updatedAt: '2026-04-16T00:00:00.000Z'
        }
      ]
    })

    const card = buildCharacterBrainCard(character, 'brain:trajectory:node:pending_update')
    expect(card?.pendingReview).toMatchObject({
      mode: 'update',
      reason: '自动整理建议改写这个年份节点',
      previous: {
        summary: '旧版备注',
        content: '旧版正文'
      },
      current: {
        summary: '新版备注',
        content: '新版正文'
      }
    })
  })

  it('saves card links by target ids and renders linked nodes with dashed edge metadata', () => {
    const character = createCharacter()
    const suggestions = buildCharacterBrainLinkSuggestions(character)
    expect(suggestions.find((item) => item.id === 'brain:appearance')?.title).toBe('外貌特征')

    const changes = applyCharacterBrainCardDraft(character, 'brain:system_info', {
      linkText: '[[外貌特征]]',
      linkTargetIds: ['brain:appearance']
    })
    expect(changes.brainLinks).toEqual({
      'brain:system_info': ['brain:appearance'],
      'brain:appearance': ['brain:system_info']
    })

    const linkedCharacter = createCharacter(changes)
    const card = buildCharacterBrainCard(linkedCharacter, 'brain:system_info')
    expect(card?.linkDraft.text).toContain('[[外貌特征]]')

    const highDensityNodes = buildCharacterBrainNodes(linkedCharacter, { focusId: 'brain:system_info', minDensity: 5 })
    expect(highDensityNodes.find((item) => item.id === 'brain:appearance')).toBeUndefined()

    const nodes = buildCharacterBrainNodes(linkedCharacter, { focusId: 'brain:system_info', minDensity: 1 })
    const linkedNode = nodes.find((item) => item.id === 'brain:appearance' && item.edgeKind === 'link')
    expect(linkedNode).toMatchObject({
      size: 2,
      density: 4,
      parentId: 'brain:system_info',
      edgeKind: 'link'
    })
  })
})

function normalizeAngle(value) {
  const normalized = value % 360
  return normalized >= 0 ? normalized : normalized + 360
}

function angleDistance(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 360 - diff)
}

function readRelativePoint(nodes, parentId, nodeId) {
  const parent = nodes.find((item) => item.id === parentId)
  const node = nodes.find((item) => item.id === nodeId)
  expect(parent).toBeTruthy()
  expect(node).toBeTruthy()
  return {
    x: Math.round((node.x - parent.x) * 100) / 100,
    y: Math.round((node.y - parent.y) * 100) / 100
  }
}

function distance(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt((dx * dx) + (dy * dy))
}
