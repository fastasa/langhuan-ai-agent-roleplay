import { describe, expect, it, vi } from 'vitest'
import {
  acceptCharacterBrainCandidateChange,
  buildCharacterBrainCandidateChangeDrafts,
  buildCharacterBrainRecallCandidateCards,
  buildCharacterBrainRecallPromptBlock,
  rejectCharacterBrainCandidateChange
} from '../../../src/app/characterBrainRecall'
import { pathTreeToFieldTree } from '../../../src/app/docLibraryTreeMigration'

function createCharacter(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    brainCognitionNodes: [],
    brain_cognition_nodes: '[]',
    brainCandidateChanges: [],
    brain_candidate_changes: '[]',
    ...overrides
  }
}

function createLocalDate(year, month, day, hour = 0, minute = 0) {
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, 0, 0)
  return date
}

describe('characterBrainRecall', () => {
  it('角色私有快照召回卡使用自身编译页，同时保留来源结构追踪', () => {
    const documents = [{
      documentId: 'doc_capital',
      id: 'doc_capital',
      stableId: 'doc_capital',
      title: '镜庭主城',
      displayPath: '/镜庭雨城/镜庭地点/镜庭主城.md',
      documentType: 'worldview_place',
      kind: 'worldview_place',
      summary: '公共摘要',
      tags: ['王城'],
      content: '正文',
      publicCompilePage: {
        summary: '公共编译摘要',
        tags: ['王城'],
        relationHints: [],
        sourceState: 'manual_confirmed',
        updatedAt: '2026-04-15T00:00:00.000Z'
      },
      sourceDocumentIds: [],
      relatedNeuronIds: [],
      versionState: 'confirmed',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z'
    }]
    const converted = pathTreeToFieldTree({
      documents,
      generatedAt: '2026-04-27T00:00:00.000Z'
    })
    const cards = buildCharacterBrainRecallCandidateCards(
      createCharacter({
        brainCognitionNodes: [{
          id: 'brain:cognition:node:capital',
          title: '镜庭主城',
          summary: '角色私有摘要',
          parentId: 'brain:cognition',
          kind: 'private',
          compilePage: {
            summary: '角色私有编译摘要',
            tags: ['私有王城'],
            relationHints: [],
            updatedAt: '2026-04-16T00:00:00.000Z'
          },
          sourceDocumentId: 'doc_capital',
          sourceDisplayPath: '/旧世界树/旧主城.md',
          createdAt: '2026-04-15T00:00:00.000Z',
          updatedAt: '2026-04-15T00:00:00.000Z'
        }]
      }),
      documents,
      {
        docLibraryStructure: {
          treeNodes: converted.treeNodes,
          treeOrders: converted.treeOrders,
          treeDiffReport: { canUseFieldTree: true, blockerCount: 0 }
        }
      }
    )
    const refCard = cards.find((card) => card.id === 'brain:cognition:node:capital')

    expect(refCard).toMatchObject({
      k: 'character_soul',
      s: '角色私有编译摘要',
      tags: ['私有王城'],
      p: '/镜庭雨城/镜庭地点/镜庭主城.md',
      treeSource: 'fieldTree',
      structureRuntimeId: 'doc:doc_capital'
    })
  })

  it('会从聊天内容生成候选变更草稿，拒绝不会写正式灵魂节点', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'))
    const character = createCharacter()
    const drafts = buildCharacterBrainCandidateChangeDrafts(character, [{
      id: 'msg_1',
      role: 'user',
      content: '我发现星依以后会更喜欢在雨天整理档案。'
    }])
    const rejected = rejectCharacterBrainCandidateChange({
      ...character,
      brainCandidateChanges: drafts
    }, drafts[0].id)

    expect(drafts[0]).toMatchObject({
      target: 'soul',
      status: 'pending',
      sourceLinks: [expect.objectContaining({ sourceId: 'msg_1' })]
    })
    expect(rejected.brainCandidateChanges[0].status).toBe('rejected')
    expect(rejected).not.toHaveProperty('brainCognitionNodes')
    vi.useRealTimers()
  })

  it('确认候选变更后才写入正式灵魂节点，并能进入轻量召回块', () => {
    const character = createCharacter({
      brainCandidateChanges: [{
        id: 'candidate_1',
        characterId: 'char_1',
        target: 'soul',
        action: 'create',
        title: '雨天档案偏好',
        summary: '星依更喜欢在雨天整理档案。',
        reason: '聊天中明确提到长期偏好。',
        confidence: 0.8,
        impactScope: ['灵魂'],
        sourceLinks: [{ sourceType: 'chat_message', sourceId: 'msg_1', title: '用户消息', excerpt: '雨天整理档案' }],
        status: 'pending',
        createdAt: '2026-04-15T00:00:00.000Z'
      }]
    })

    const accepted = acceptCharacterBrainCandidateChange(character, 'candidate_1')
    const nextCharacter = createCharacter(accepted)
    const cards = buildCharacterBrainRecallCandidateCards(nextCharacter, [])
    const promptBlock = buildCharacterBrainRecallPromptBlock(nextCharacter, [])

    expect(accepted.brainCognitionNodes[0]).toMatchObject({
      title: '雨天档案偏好',
      kind: 'private'
    })
    expect(accepted.brainCandidateChanges[0].status).toBe('accepted')
    expect(cards.some((card) => card.k === 'character_soul' && card.t === '雨天档案偏好')).toBe(true)
    expect(promptBlock).toContain('【当前人物】')
    expect(promptBlock).not.toContain('路径：')
    expect(promptBlock).not.toContain('来源：')
    expect(promptBlock).not.toContain('标签')
  })

  it('会把核心与轨迹中的合法节点一起投影进候选卡', () => {
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      desc: '星依是会整理资料的角色。',
      speakingStyle: '说话轻一点，常带解释。',
      brainTraceNodes: [{
        id: 'brain:trajectory:node:1',
        title: '2008年5月1日',
        summary: '在档案室第一次值夜。',
        parentId: 'brain:trajectory',
        kind: 'day',
        nodeType: 'single',
        granularity: 'day',
        startDate: '2008-05-01',
        displayTitle: '2008年5月1日',
        note: '',
        innerEntries: [],
        linkIds: [],
        timeLabel: '2008-05-01',
        pointDate: '2008-05-01',
        offsetDays: 1,
        ageLabel: '4岁',
        stepUnit: 'day',
        stepAmount: 1,
        relatedEntityIds: [],
        tags: ['档案室'],
        content: '',
        confirmed: true,
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z'
      }],
      brain_trace_nodes: '[]'
    }), [])

    expect(cards.some((card) => card.k === 'character_core' && card.id === 'brain:desc')).toBe(true)
    expect(cards.some((card) => card.k === 'character_trace' && card.id === 'brain:trajectory:node:1')).toBe(true)
  })

  it('核心底层单位会派生检索画像和护栏加权', () => {
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      desc: '星依是会整理资料的角色。',
      appearance: '金发青眼。',
      speakingStyle: '说话轻一点，常带解释。',
      outfit: '穿浅色外套。',
      personality: '聪明但嘴硬。'
    }), [])
    const guardedIds = ['brain:desc', 'brain:appearance', 'brain:speaking_style', 'brain:outfit', 'brain:personality']

    for (const id of guardedIds) {
      const card = cards.find((item) => item.id === id)
      expect(card?.baselineRecallBoost).toBeGreaterThan(0)
      expect(card?.retrievalProfileText).toContain('检索画像')
      expect(card?.evidenceReasons).toContain('baseline_core_guard')
    }

    const promptBlock = buildCharacterBrainRecallPromptBlock(createCharacter({
      speakingStyle: '说话轻一点，常带解释。'
    }), [])
    expect(promptBlock).not.toContain('检索画像')
    expect(promptBlock).not.toContain('baseline_core_guard')
  })

  it('会为当前用户和同场角色生成可观察外貌候选，不写入当前角色正式资料', () => {
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      desc: '星依是会整理资料的角色。'
    }), [], {
      observableProfiles: [
        {
          id: 'user_1',
          name: '阿川',
          appearance: '黑发，眼神安静，穿深色外套。',
          subjectType: 'user',
          inScene: true
        },
        {
          id: 'char_2',
          name: '惊雨',
          nicknames: '小雨',
          appearance: '银发，青色耳坠，轮廓清冷。',
          subjectType: 'character',
          inScene: true
        }
      ]
    })

    const userCard = cards.find((card) => card.id === 'observable:user:user_1:appearance')
    const otherCard = cards.find((card) => card.id === 'observable:character:char_2:appearance')
    expect(userCard).toMatchObject({
      k: 'observable_profile',
      t: '阿川的外貌',
      bodyText: '黑发，眼神安静，穿深色外套。',
      subjectType: 'user',
      subjectId: 'user_1'
    })
    expect(otherCard).toMatchObject({
      k: 'observable_profile',
      t: '惊雨的外貌',
      bodyText: '银发，青色耳坠，轮廓清冷。',
      subjectType: 'character',
      subjectId: 'char_2'
    })
  })

  it('安排候选按当前星期、时间、月份和近期事项筛选', () => {
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      schedule: {
        monday: [
          { startTime: '09:00', endTime: '11:00', activity: '晨训', location: '庭院' },
          { startTime: '20:00', endTime: '22:00', activity: '夜巡', location: '城墙' }
        ],
        tuesday: [
          { startTime: '09:00', endTime: '11:00', activity: '炼金课', location: '教室' }
        ]
      },
      yearlySchedule: [
        { startMonth: 4, endMonth: 6, activity: '春季远征' },
        { startMonth: 10, endMonth: 11, activity: '秋季考试' }
      ],
      currentActivities: ['整理镜庭档案']
    }), [], {
      currentDate: new Date('2026-04-27T10:30:00')
    })

    const arrangementText = cards
      .filter((card) => card.k === 'character_arrangement')
      .map((card) => card.s)
      .join('\n')
    expect(arrangementText).toContain('晨训')
    expect(arrangementText).toContain('春季远征')
    expect(arrangementText).toContain('整理镜庭档案')
    expect(arrangementText).not.toContain('夜巡')
    expect(arrangementText).not.toContain('炼金课')
    expect(arrangementText).not.toContain('秋季考试')
  })

  it('轨迹安排单位只在激活规则命中时带安排激活信号', () => {
    const baseTraceNode = {
      title: '晚间巡查',
      summary: '晚间需要巡查北墙。',
      parentId: 'brain:trajectory:node:day_0091_05_07',
      kind: 'day',
      nodeType: 'single',
      granularity: 'day',
      startDate: '0091-05-07',
      displayTitle: '晚间巡查',
      note: '',
      innerEntries: [],
      linkIds: [],
      systemRole: 'arrangementLeaf',
      timeLabel: '0091-05-07',
      pointDate: '0091-05-07',
      offsetDays: 1,
      ageLabel: '91岁',
      stepUnit: 'day',
      stepAmount: 1,
      relatedEntityIds: [],
      tags: ['安排'],
      content: '巡查正文。',
      confirmed: true,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z'
    }
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      brainTraceNodes: [
        {
          ...baseTraceNode,
          id: 'brain:trajectory:node:arrangement_active',
          activationRule: { date: '0091-05-07', startTime: '20:00', endTime: '22:00', recurrence: 'once' },
          recallPolicy: { level: 'body', priority: 'must' }
        },
        {
          ...baseTraceNode,
          id: 'brain:trajectory:node:arrangement_inactive',
          title: '清晨巡查',
          activationRule: { date: '0091-05-07', startTime: '08:00', endTime: '09:00', recurrence: 'once' },
          recallPolicy: { level: 'summary', priority: 'normal' }
        }
      ],
      brainDocuments: {
        '__brain_compile__:brain:trajectory:node:arrangement_active': JSON.stringify({
          summary: '晚间需要巡查北墙。',
          tags: ['安排'],
          relationHints: [],
          updatedAt: '2026-05-07T00:00:00.000Z'
        }),
        '__brain_compile__:brain:trajectory:node:arrangement_inactive': JSON.stringify({
          summary: '清晨需要巡查北墙。',
          tags: ['安排'],
          relationHints: [],
          updatedAt: '2026-05-07T00:00:00.000Z'
        })
      }
    }), [], {
      currentDate: createLocalDate(91, 5, 7, 20, 30)
    })

    const active = cards.find((card) => card.id === 'brain:trajectory:node:arrangement_active')
    const inactive = cards.find((card) => card.id === 'brain:trajectory:node:arrangement_inactive')
    expect(active).toMatchObject({
      k: 'character_arrangement',
      scheduleActivation: expect.objectContaining({
        active: true,
        priority: 'must',
        level: 'body'
      })
    })
    expect(inactive?.scheduleActivation).toBeUndefined()
  })

  it('0091 年一次性安排在提前窗口内会激活必须召回信号', () => {
    const cards = buildCharacterBrainRecallCandidateCards(createCharacter({
      brainTraceNodes: [{
        id: 'brain:trajectory:node:arrangement_sleepy_earrings',
        title: '91年5月7日',
        summary: '惊雨今天带着十分显眼的青色耳坠。',
        parentId: 'brain:trajectory:node:day_0091_05_07',
        kind: 'day',
        nodeType: 'single',
        granularity: 'day',
        startDate: '0091-05-07',
        displayTitle: '91年5月7日',
        note: '',
        innerEntries: [],
        linkIds: [],
        systemRole: 'arrangementLeaf',
        activationRule: {
          date: '0091-05-07',
          startTime: '14:00',
          endTime: '15:00',
          recurrence: 'once',
          prewarmMinutes: 20,
          graceMinutes: 20
        },
        recallPolicy: { level: 'summary', priority: 'must' },
        timeLabel: '0091-05-07',
        pointDate: '0091-05-07',
        offsetDays: 1,
        ageLabel: '91岁',
        stepUnit: 'day',
        stepAmount: 1,
        relatedEntityIds: [],
        tags: ['安排'],
        content: '惊雨今天带着十分显眼的青色耳坠。',
        confirmed: true,
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z'
      }],
      brainDocuments: {
        '__brain_compile__:brain:trajectory:node:arrangement_sleepy_earrings': JSON.stringify({
          summary: '惊雨今天带着十分显眼的青色耳坠。',
          tags: ['安排召回测试', 'C02', '惊雨'],
          relationHints: [],
          updatedAt: '2026-05-07T00:00:00.000Z'
        })
      }
    }), [], {
      currentDate: createLocalDate(91, 5, 7, 13, 50)
    })

    const card = cards.find((item) => item.id === 'brain:trajectory:node:arrangement_sleepy_earrings')
    expect(card?.scheduleActivation).toMatchObject({
      active: true,
      priority: 'must',
      level: 'summary',
      timeWindowText: '14:00-15:00'
    })
  })
})
