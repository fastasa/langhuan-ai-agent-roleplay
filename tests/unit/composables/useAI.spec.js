/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAI } from '../../../src/composables/useAI.js'
import { fetchSessionTemporaryEntities } from '../../../src/repositories/chatRepository.js'
import {
  CHARACTER_BRAIN_RECALL_PLACEHOLDER,
  CHARACTER_PROFILE_RECALL_PLACEHOLDER
} from '../../../src/utils/promptContext.js'
import {
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER,
  SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID
} from '../../../src/app/scenarioMountedPromptPlaceholder.js'

vi.mock('../../../src/repositories/docBrainRepository.js', () => ({
  fetchDocLibraryState: vi.fn(async () => null)
}))

vi.mock('../../../src/repositories/chatRepository.js', async () => {
  const actual = await vi.importActual('../../../src/repositories/chatRepository.js')
  return {
    ...actual,
    fetchSessionTemporaryEntities: vi.fn(async () => [])
  }
})

describe('useAI', () => {
  // 创建 mock stores
  const mockChatStore = {
    currentAbortController: null,
    mergeConsecutiveAssistant: (msgs) => msgs
  }

  const mockSettingStore = {
    promptPresets: [
      { id: 'p1', name: '测试预设', role: 'system', scene: 'chat', enabled: true, orderIndex: 0, content: '你是{role_name}，{role_desc}' }
    ],
    currentTime: '2024-01-01',
    currentLocation: '',
    currentWeather: ''
  }

  const mockCharStore = {
    characters: [
      { id: 'c1', name: '角色A', desc: 'desc', appearance: 'app', personality: 'per', outfit: 'out' },
      { id: 'c2', name: '角色B', desc: '', appearance: '', personality: '', outfit: '' }
    ],
    getCharacter: vi.fn((id) => mockCharStore.characters.find(c => c.id === id)),
    userProfile: { name: '用户', desc: '' }
  }

  const mockResourceStore = {
    points: 0,
    money: 0
  }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('should accept dependencies via constructor', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    expect(ai).toBeDefined()
    expect(ai.mergeConsecutiveAssistant).toBeDefined()
    expect(ai.cleanAiPrefix).toBeDefined()
    expect(ai.detectLocationChange).toBeDefined()
    expect(ai.buildSystemPrompt).toBeDefined()
  })

  it('should clean AI prefix from text', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    // 测试清理角色前缀
    expect(ai.cleanAiPrefix('[角色A]：你好')).toBe('你好')
    expect(ai.cleanAiPrefix('[角色B]: 你好')).toBe('你好')
    expect(ai.cleanAiPrefix('角色A：你好')).toBe('你好')
  })

  it('should detect location change markers', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    // 测试地点变化检测
    const result = ai.detectLocationChange('【地点变化：图书馆】我们在这里')
    expect(result.content).toBe('我们在这里')
    expect(result.newLocation).toBe('图书馆')

    // 无地点变化时
    const result2 = ai.detectLocationChange('普通消息')
    expect(result2.content).toBe('普通消息')
    expect(result2.newLocation).toBeNull()
  })

  it('should build system prompt with variables', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    // 测试系统提示词构建
    const prompt = ai.buildSystemPrompt('c1', 'chat')

    expect(prompt).toContain('角色A')
    expect(prompt).toContain('desc')
    expect(prompt).toContain('app')
    expect(prompt).toContain('per')
    expect(prompt).toContain('out')
  })

  it('角色提示词恰好注入一次统一世界上下文，且不展开世界文档 id', () => {
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        chatSessions: {
          session_world: {
            id: 'session_world',
            worldId: 'world_1',
            worldName: '维斯珂',
            worldDocLibraryDocumentIds: ['doc_secret'],
            worldDefaultMapSheetId: 'sheet_1',
            worldMapSheets: [{ id: 'sheet_1', name: '总图' }],
            curtainWorldId: 'world_1',
            curtainMapSheetId: 'sheet_1',
            virtualLocation: '望舒台'
          }
        },
        activeChatSessionId: 'session_world'
      },
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')
    expect(joined.match(/【当前会话世界上下文】/g)).toHaveLength(1)
    expect(joined).toContain('当前世界：维斯珂')
    expect(joined).toContain('世界文档范围：1 个已挂文档')
    expect(joined).not.toContain('doc_secret')
  })

  it('当前状态提示词优先使用帷幕环境，并移除旧好感度和轨迹变量', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T01:02:35+08:00'))

    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        chatSessions: {
          session_1: {
            id: 'session_1',
            virtualLocation: '惊雨的书房',
            virtualTime: '2026-05-04T13:20',
            virtualTimeAnchor: Date.now(),
            virtualTimeBase: new Date('2026-05-04T13:20:00+08:00').getTime(),
            virtualTimeRate: 0,
            virtualWeather: '小雨',
            virtualWeatherMode: 'custom'
          }
        },
        activeChatSessionId: 'session_1'
      },
      settingStore: {
        ...mockSettingStore,
        currentTime: '2026年5月8日 周五 01:02:35',
        currentLocation: '临平',
        currentWeather: '晴，28°C',
        promptPresets: [
          {
            id: 'current_status',
            name: '当前状态',
            role: 'system',
            scene: 'chat',
            enabled: true,
            isRequired: true,
            orderIndex: 0,
            content: '当前时间：{time}\n{location}\n{weather}\n{schedule}\n{yearly_schedule}\n{current_activities}\n{relationships}'
          }
        ]
      },
      charStore: {
        ...mockCharStore,
        characters: [
          {
            id: 'c1',
            name: '角色A',
            affection: 50,
            schedule: {
              friday: [{ startTime: '08:00', endTime: '09:00', activity: '整理档案' }]
            },
            yearlySchedule: [{ startMonth: 5, endMonth: 5, activity: '五月计划' }],
            currentActivities: '今天没有特定安排',
            relationships: { 用户: '熟人' }
          }
        ],
        getCharacter: vi.fn((id) => ({
          id,
          name: '角色A',
          affection: 50,
          schedule: {
            friday: [{ startTime: '08:00', endTime: '09:00', activity: '整理档案' }]
          },
          yearlySchedule: [{ startMonth: 5, endMonth: 5, activity: '五月计划' }],
          currentActivities: '今天没有特定安排',
          relationships: { 用户: '熟人' }
        }))
      },
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).toContain('当前时间：2026年5月4日 周一 13:20:00')
    expect(joined).toContain('当前地点：惊雨的书房')
    expect(joined).toContain('当前天气：小雨')
    expect(joined).not.toContain('2026年5月8日')
    expect(joined).not.toContain('临平')
    expect(joined).not.toContain('对用户的好感度')
    expect(joined).not.toContain('行动轨迹')
    expect(joined).not.toContain('近期事项')
    expect(joined).not.toContain('年度计划')
    expect(joined).not.toContain('关系网')

    vi.useRealTimers()
  })

  it('当前会话没有地点时不会把全局现实地点写进提示词', () => {
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        chatSessions: {
          session_empty_location: {
            id: 'session_empty_location',
            targetId: 'c1',
            targetType: 'char'
          }
        },
        activeChatSessionId: 'session_empty_location'
      },
      settingStore: {
        ...mockSettingStore,
        currentLocation: '维斯珂',
        promptPresets: [
          {
            id: 'current_status',
            name: '当前状态',
            role: 'system',
            scene: 'chat',
            enabled: true,
            isRequired: true,
            orderIndex: 0,
            content: '当前时间：{time}\n{location}\n{weather}'
          }
        ]
      },
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).not.toContain('当前地点：维斯珂')
    expect(joined).not.toContain('当前地点：')
  })

  it('should skip recall-controlled dynamic context placeholders in prompt messages', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'task_system_placeholder',
            name: '任务系统信息',
            role: 'placeholder',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            content: '以下为用户的任务详情，内含时间轴：\n<task_system_context>{task_system_context}</task_system_context>'
          },
          {
            id: 'event_stack_recent_placeholder',
            name: '事栈信息（今昨前）',
            role: 'placeholder',
            scene: 'chat',
            enabled: true,
            orderIndex: 1,
            content: '以下为用户今日、昨日、前日的票据、点数、任务情况：\n<event_stack_recent_context>{event_stack_recent_context}</event_stack_recent_context>'
          }
        ]
      },
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const messages = ai.buildPromptMessages('c1', 'chat')

    expect(messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: expect.stringContaining('{task_system_context}') }),
      expect.objectContaining({ content: expect.stringContaining('{event_stack_recent_context}') })
    ]))
  })

  it('should inject scenario mounted prompt text only at the shared prompt-library placeholder', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'chat_constraint',
            name: '聊天约束',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '基础约束'
          },
          {
            id: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER_PRESET_ID,
            name: '情境挂载提示词（占位）',
            role: 'placeholder',
            scene: 'chat',
            enabled: true,
            orderIndex: 1,
            isRequired: true,
            content: SCENARIO_MOUNTED_PROMPTS_PLACEHOLDER
          },
          {
            id: 'current_status',
            name: '当前状态',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 2,
            isRequired: true,
            content: '当前状态块'
          }
        ]
      },
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const messages = ai.buildPromptMessages('c1', 'chat', {
      scenarioMountedPromptText: '文风示例 A\n\n文风示例 B'
    })
    const systemContents = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)

    expect(systemContents.slice(0, 3)).toEqual(['基础约束', '文风示例 A\n\n文风示例 B', '当前状态块'])
  })

  it('should not assemble role setting, speaking style, or loaded summaries as mandatory chat prompt blocks', () => {
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        getLoadedSummaryIds: () => ['sum1']
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          { id: 'role_setting', name: '角色设定', role: 'system', scene: 'chat', enabled: true, orderIndex: 0, content: '你是{role_name}，{role_desc}' },
          { id: 'speaking_style', name: '说话风格', role: 'system', scene: 'chat', enabled: true, orderIndex: 1, content: '{role_name}的说话风格：{role_style}' },
          { id: 'history_memory', name: '历史记忆', role: 'system', scene: 'chat', enabled: true, orderIndex: 2, content: '以下是之前聊天的总结：{summaries}' },
          { id: 'chat_constraint', name: '聊天约束', role: 'system', scene: 'chat', enabled: true, orderIndex: 3, content: '你只能扮演{role_name}。' }
        ]
      },
      charStore: {
        ...mockCharStore,
        characters: [
          { id: 'c1', name: '角色A', desc: 'desc', speakingStyle: '冷淡' }
        ],
        getCharacter: vi.fn((id) => ({ id, name: '角色A', desc: 'desc', speakingStyle: '冷淡' }))
      },
      resourceStore: mockResourceStore
    })

    const messages = ai.buildPromptMessages('c1', 'chat')
    const joined = messages.map((message) => message.content).join('\n\n')

    expect(joined).toContain('你只能扮演角色A。')
    expect(joined).not.toContain('你是角色A')
    expect(joined).not.toContain('说话风格')
    expect(joined).not.toContain('以下是之前聊天的总结')
    expect(joined).not.toContain('已加载记忆')
  })

  it('角色回复空召回时仍保留角色简介', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'role_identity',
            name: '身份',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '你是{role_name}，{role_desc}'
          },
          {
            id: 'character_profile_recall',
            name: '当前人物',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 1,
            isRequired: true,
            content: CHARACTER_PROFILE_RECALL_PLACEHOLDER
          }
        ]
      },
      charStore: {
        ...mockCharStore,
        characters: [
          {
            id: 'c1',
            name: '星依',
            desc: '琅嬛的引导者，嘴硬但会认真看边界。',
            appearance: '银发。',
            personality: '警觉。',
            outfit: '黑色外套。'
          }
        ],
        getCharacter: vi.fn((id) => ({
          id,
          name: '星依',
          desc: '琅嬛的引导者，嘴硬但会认真看边界。',
          appearance: '银发。',
          personality: '警觉。',
          outfit: '黑色外套。'
        }))
      },
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat', {
      forceEmptyRecall: true,
      forceEmptyRoleProfile: true
    }).map((message) => message.content).join('\n\n')

    expect(joined).toContain('你是星依，琅嬛的引导者，嘴硬但会认真看边界。')
    expect(joined).toContain('【当前人物】')
    expect(joined).toContain('简介摘要：琅嬛的引导者，嘴硬但会认真看边界。')
    expect(joined).not.toContain('银发')
    expect(joined).not.toContain('警觉')
    expect(joined).not.toContain('黑色外套')
  })

  it('should respect manual required flag when assembling prompt blocks', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          { id: 'optional_prompt', name: '非必装', role: 'system', scene: 'chat', enabled: true, isRequired: false, orderIndex: 0, content: '不应该进入装配' },
          { id: 'required_prompt', name: '必装', role: 'system', scene: 'chat', enabled: true, isRequired: true, usageMode: 'manual', orderIndex: 1, content: '手动标记必装' }
        ]
      },
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).toContain('手动标记必装')
    expect(joined).not.toContain('不应该进入装配')
  })

  it('should assemble prompt presets by persisted orderIndex instead of priority', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          { id: 'third', name: '第三', role: 'system', scene: 'chat', enabled: true, isRequired: true, orderIndex: 2, priority: 0, content: '第三块' },
          { id: 'first', name: '第一', role: 'system', scene: 'chat', enabled: true, isRequired: true, orderIndex: 0, priority: 9, content: '第一块' },
          { id: 'second', name: '第二', role: 'system', scene: 'chat', enabled: true, isRequired: true, orderIndex: 1, priority: 1, content: '第二块' }
        ]
      },
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined.indexOf('第一块')).toBeLessThan(joined.indexOf('第二块'))
    expect(joined.indexOf('第二块')).toBeLessThan(joined.indexOf('第三块'))
  })

  it('should not fall back to local recall after AI recall returns empty', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ content: '[]' }),
      json: async () => ({ content: '[]' })
    }))
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        currentAbortController: null,
        setAbortController: vi.fn(),
        getDisplayMessages: vi.fn(() => [
          { role: 'user', content: '惊雨会整理档案室吗？' }
        ])
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_brain_recall',
            name: '角色大脑轻量召回',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            content: CHARACTER_BRAIN_RECALL_PLACEHOLDER
          }
        ],
        getBrainAgentConfig: vi.fn(() => ({
          enabled: true,
          recallCandidateMode: 'parallel_merge',
          recallContentStrategy: 'summary_gate',
          presetName: '召回判断',
          recallModel: 'glm-4.5-air',
          recallMaxTokens: 512,
          embeddingPresetId: 'EmbedLocal',
          embeddingModel: 'text-embedding-local',
          embeddingDimensions: 1024
        }))
      },
      charStore: {
        ...mockCharStore,
        documents: [],
        characters: [
          {
            id: 'c1',
            name: '惊雨',
            desc: '惊雨总是在档案室整理旧资料。',
            appearance: '',
            personality: '',
            outfit: ''
          }
        ],
        getCharacter: vi.fn((id) => ({
          id,
          name: '惊雨',
          desc: '惊雨总是在档案室整理旧资料。',
          appearance: '',
          personality: '',
          outfit: ''
        }))
      },
      resourceStore: mockResourceStore
    })

    await ai.prepareAIRecall('c1')
    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).not.toContain('【角色大脑召回】')
    expect(joined).not.toContain('惊雨总是在档案室整理旧资料')
  })

  it('AI 召回用户外貌时优先使用当前会话绑定马甲', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/ai/embeddings')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { index: 0, embedding: [0.95, 0.05] },
              { index: 1, embedding: [0.9, 0.1] }
            ],
            model: 'embedding-test'
          })
        }
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ content: 'C01 | 0.18 | 0 | 当前马甲外貌相关' }),
        json: async () => ({ content: 'C01 | 0.18 | 0 | 当前马甲外貌相关' })
      }
    })
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        activeChatSessionId: 'session_1',
        getActiveTargetId: vi.fn(() => 'c1'),
        chatSessions: {
          session_1: { id: 'session_1', boundAlias: 'alias_lizhi', participants: [] }
        },
        getCurrentSession: vi.fn(() => ({ id: 'session_1', boundAlias: 'alias_lizhi', participants: [] })),
        getDisplayMessages: vi.fn(() => [
          { role: 'user', content: '你看到我现在是什么样子？' }
        ]),
        setAbortController: vi.fn()
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_general_recall',
            name: '本轮相关资料',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '{character_general_recall}'
          }
        ],
        getBrainAgentConfig: vi.fn(() => ({
          enabled: true,
          recallCandidateMode: 'parallel_merge',
          recallContentStrategy: 'summary_gate',
          presetName: '召回判断',
          recallModel: 'glm-4.5-air',
          recallMaxTokens: 512,
          embeddingPresetId: 'EmbedLocal',
          embeddingModel: 'text-embedding-local',
          embeddingDimensions: 1024
        }))
      },
      charStore: {
        ...mockCharStore,
        documents: [],
        aliases: [
          {
            id: 'alias_lizhi',
            name: '梨枝',
            appearance: '银白短发，左眼下有小痣，穿月白外袍。'
          }
        ],
        userProfile: {
          name: '默认用户',
          appearance: '默认黑发默认外套。'
        },
        characters: [
          {
            id: 'c1',
            name: '惊雨',
            desc: '惊雨会观察眼前的人。',
            appearance: '',
            personality: '',
            outfit: ''
          }
        ],
        getCharacter: vi.fn((id) => ({
          id,
          name: '惊雨',
          desc: '惊雨会观察眼前的人。',
          appearance: '',
          personality: '',
          outfit: ''
        }))
      },
      resourceStore: mockResourceStore
    })

    await ai.prepareAIRecall('c1')
    const aiChatBodies = global.fetch.mock.calls
      .filter(([url]) => String(url).includes('/api/ai/chat'))
      .map(([, init]) => JSON.parse(String(init?.body || '{}')))
    const outboundRecallText = aiChatBodies
      .flatMap((body) => body.messages || [])
      .map((message) => String(message.content || ''))
      .join('\n')

    expect(outboundRecallText).toContain('梨枝的可观察外貌')
    expect(outboundRecallText).toContain('银白短发')
    expect(outboundRecallText).not.toContain('默认用户的外貌')
    expect(outboundRecallText).not.toContain('默认黑发默认外套')
    const embeddingBody = JSON.parse(String(global.fetch.mock.calls
      .find(([url]) => String(url).includes('/api/ai/embeddings'))?.[1]?.body || '{}'))
    expect(embeddingBody).toMatchObject({
      presetId: 'EmbedLocal',
      model: 'text-embedding-local',
      dimensions: 1024
    })
  })

  it('AI 召回会读取当前会话临时实体并把正文装入本轮资料', async () => {
    fetchSessionTemporaryEntities.mockResolvedValueOnce([{
      id: 'temp_region_1',
      session_id: 'session_1',
      sessionId: 'session_1',
      kind: 'region',
      name: '旧港区',
      aliases: ['旧码头'],
      tags: ['封锁'],
      markdown: '## 名称\n旧港区\n\n## 当前局势\n潮灯署正在封锁码头。',
      status: 'active'
    }])
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/ai/embeddings')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { index: 0, embedding: [1, 0] },
              { index: 1, embedding: [1, 0] }
            ],
            model: 'embedding-test'
          })
        }
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ content: 'C01 | 0.20 | 0 | 临时资料相关' }),
        json: async () => ({ content: 'C01 | 0.20 | 0 | 临时资料相关' })
      }
    })
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        activeChatSessionId: 'session_1',
        getActiveTargetId: vi.fn(() => 'c1'),
        chatSessions: {
          session_1: { id: 'session_1', participants: [] }
        },
        getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
        getDisplayMessages: vi.fn(() => [
          { role: 'user', content: '旧港区现在是谁在封锁？' }
        ]),
        setAbortController: vi.fn()
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_general_recall',
            name: '本轮相关资料',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '{character_general_recall}'
          }
        ],
        getBrainAgentConfig: vi.fn(() => ({
          enabled: true,
          recallCandidateMode: 'parallel_merge',
          recallContentStrategy: 'summary_gate',
          presetName: '召回判断',
          recallModel: 'glm-4.5-air',
          recallMaxTokens: 512
        }))
      },
      charStore: {
        ...mockCharStore,
        documents: [],
        characters: [{ id: 'c1', name: '惊雨', desc: '测试角色', appearance: '', personality: '', outfit: '' }],
        getCharacter: vi.fn((id) => ({ id, name: '惊雨', desc: '测试角色', appearance: '', personality: '', outfit: '' }))
      },
      resourceStore: mockResourceStore
    })

    await ai.prepareAIRecall('c1')
    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(fetchSessionTemporaryEntities).toHaveBeenCalledWith('session_1')
    expect(joined).toContain('旧港区')
    expect(joined).toContain('潮灯署正在封锁码头')
  })

  it('被停止的召回结果不会污染下一次提示词装配', async () => {
    let firstAbortController = null
    const chatStore = {
      ...mockChatStore,
      activeChatSessionId: 'session_1',
      currentAbortController: null,
      setAbortController: vi.fn((controller) => {
        chatStore.currentAbortController = controller
        if (controller && !firstAbortController) firstAbortController = controller
      }),
      shouldStop: vi.fn(() => false),
      chatSessions: {
        session_1: { id: 'session_1', participants: [] }
      },
      getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
      getDisplayMessages: vi.fn(() => [
        { role: 'user', content: '第一条问题' }
      ])
    }
    const settingStore = {
      ...mockSettingStore,
      promptPresets: [
        {
          id: 'character_general_recall',
          name: '本轮相关资料',
          role: 'system',
          scene: 'chat',
          enabled: true,
          orderIndex: 0,
          isRequired: true,
          content: '{character_general_recall}'
        }
      ],
      getBrainAgentConfig: vi.fn(() => ({
        enabled: true,
        recallCandidateMode: 'parallel_merge',
        recallContentStrategy: 'summary_gate',
        presetName: '召回判断',
        recallModel: 'test-recall',
        recallMaxTokens: 512
      }))
    }
    const charStore = {
      ...mockCharStore,
      documents: [{
        id: 'doc_1',
        title: '旧召回资料',
        content: '上一条消息才应该命中的旧召回结果。',
        summary: '旧召回结果'
      }],
      characters: [{ id: 'c1', name: '惊雨', desc: '测试角色', appearance: '', personality: '', outfit: '' }],
      getCharacter: vi.fn((id) => ({ id, name: '惊雨', desc: '测试角色', appearance: '', personality: '', outfit: '' }))
    }
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/doc-library')) {
        return { ok: true, json: async () => ({ documents: charStore.documents }) }
      }
      if (String(url).includes('/api/ai/embeddings')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { index: 0, embedding: [1, 0] },
              { index: 1, embedding: [1, 0] }
            ],
            model: 'embedding-test'
          })
        }
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ content: 'C01 | 0.18 | 0 | 旧召回结果相关' })
      }
    })

    const ai = useAI({
      chatStore,
      settingStore,
      charStore,
      resourceStore: mockResourceStore
    })

    const recallPromise = ai.prepareAIRecall('c1')
    expect(firstAbortController).toBeTruthy()
    firstAbortController.abort()
    await recallPromise

    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')
    expect(joined).not.toContain('旧召回结果')
    expect(joined).not.toContain('上一条消息才应该命中的旧召回结果')
  })

  it('AI 召回失败时只注入角色基础摘要，不退回本地全量大脑单位', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/ai/embeddings')) {
        return {
          ok: true,
          json: async () => ({ data: [], model: 'embedding-test' })
        }
      }
      throw new Error('recall failed')
    })
    const chatStore = {
      ...mockChatStore,
      currentAbortController: null,
      setAbortController: vi.fn(),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
      getDisplayMessages: vi.fn(() => [{ role: 'user', content: '你们好啊' }])
    }
    const settingStore = {
      ...mockSettingStore,
      promptPresets: [
        {
          id: 'character_brain_recall',
          name: '角色大脑轻量召回',
          role: 'system',
          scene: 'chat',
          enabled: true,
          orderIndex: 0,
          promptGroup: 'system',
          usageMode: 'always',
          isRequired: true,
          content: `召回：${CHARACTER_BRAIN_RECALL_PLACEHOLDER}`
        }
      ],
      getBrainAgentConfig: vi.fn(() => ({
        enabled: true,
        recallCandidateMode: 'parallel_merge',
        recallContentStrategy: 'summary_gate',
        presetName: '召回判断',
        recallModel: 'test-model',
        recallMaxTokens: 512
      }))
    }
    const charStore = {
      ...mockCharStore,
      documents: [],
      characters: [{
        id: 'c1',
        name: '雪允',
        desc: '清冷但温和的成员简介。',
        personality: '认真、克制、慢热。',
        speakingStyle: '礼貌、柔和、短句。',
        brain_cognition_nodes: JSON.stringify([{ id: 'n1', title: '不能兜底进入', summary: '这条不该进提示词。' }])
      }],
      getCharacter: vi.fn((id) => charStore.characters.find((char) => char.id === id))
    }
    const ai = useAI({ chatStore, settingStore, charStore, resourceStore: mockResourceStore })

    await ai.prepareAIRecall('c1')
    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).toContain('简介摘要：清冷但温和的成员简介。')
    expect(joined).toContain('性格摘要：认真、克制、慢热。')
    expect(joined).toContain('说话方式摘要：礼貌、柔和、短句。')
    expect(joined).not.toContain('不能兜底进入')
    expect(joined).not.toContain('这条不该进提示词')
  })

  it('AI 召回失败兜底会完整写入简介、性格和说话方式，不裁成省略号', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/ai/embeddings')) {
        return {
          ok: true,
          json: async () => ({ data: [], model: 'embedding-test' })
        }
      }
      throw new Error('recall failed')
    })
    const longDesc = `简介开头${'甲'.repeat(520)}简介尾部标记`
    const longPersonality = `性格开头${'乙'.repeat(520)}性格尾部标记`
    const longSpeakingStyle = `说话开头${'丙'.repeat(420)}说话尾部标记`
    const chatStore = {
      ...mockChatStore,
      currentAbortController: null,
      setAbortController: vi.fn(),
      getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
      getDisplayMessages: vi.fn(() => [{ role: 'user', content: '你们好啊' }])
    }
    const settingStore = {
      ...mockSettingStore,
      promptPresets: [{
        id: 'character_brain_recall',
        name: '角色大脑轻量召回',
        role: 'system',
        scene: 'chat',
        enabled: true,
        orderIndex: 0,
        promptGroup: 'system',
        usageMode: 'always',
        isRequired: true,
        content: `召回：${CHARACTER_BRAIN_RECALL_PLACEHOLDER}`
      }],
      getBrainAgentConfig: vi.fn(() => ({
        enabled: true,
        recallCandidateMode: 'parallel_merge',
        recallContentStrategy: 'summary_gate',
        presetName: '召回判断',
        recallModel: 'test-model',
        recallMaxTokens: 512
      }))
    }
    const charStore = {
      ...mockCharStore,
      documents: [],
      characters: [{
        id: 'c1',
        name: '雪允',
        desc: longDesc,
        personality: longPersonality,
        speakingStyle: longSpeakingStyle
      }],
      getCharacter: vi.fn((id) => charStore.characters.find((char) => char.id === id))
    }
    const ai = useAI({ chatStore, settingStore, charStore, resourceStore: mockResourceStore })

    await ai.prepareAIRecall('c1')
    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).toContain('简介尾部标记')
    expect(joined).toContain('性格尾部标记')
    expect(joined).toContain('说话尾部标记')
    expect(joined).not.toContain('...')
  })

  it('情绪潮汐停用后不会把当前短期状态补丁接入表达核心', async () => {
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        activeChatSessionId: 'session_1',
        chatSessions: {
          session_1: { id: 'session_1', participants: [] }
        },
        getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
        getDisplayMessages: vi.fn(() => [])
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_expression_recall',
            name: '表达核心',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '{character_expression_recall}'
          }
        ]
      },
      charStore: {
        ...mockCharStore,
        characters: [{
          id: 'c1',
          name: '星依',
          desc: '测试角色',
          appearance: '',
          personality: '聪明、挑剔、嘴硬。',
          speakingStyle: '短句，直接。'
        }],
        getCharacter: vi.fn((id) => ({
          id,
          name: '星依',
          desc: '测试角色',
          appearance: '',
          personality: '聪明、挑剔、嘴硬。',
          speakingStyle: '短句，直接。'
        }))
      },
      resourceStore: mockResourceStore
    })

    await ai.prepareAIRecall('c1')
    const joined = ai.buildPromptMessages('c1', 'chat').map((message) => message.content).join('\n')

    expect(joined).toContain('【表达核心】')
    expect(joined).toContain('聪明、挑剔、嘴硬')
    expect(joined).not.toContain('【当前短期状态】')
    expect(joined).not.toContain('此刻对用户的语气略微放松')
    expect(joined).not.toContain('snapshot_abc')
    expect(joined).not.toContain('ledger_a')
    expect(joined).not.toContain('activePolicyWeights')
    expect(joined).not.toContain('trust_shift')
  })

  it('情绪潮汐停用后不会把补丁来源写入提示词日志', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ content: 'ok' }),
      json: async () => ({ content: 'ok' })
    }))
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        activeChatSessionId: 'session_1',
        chatSessions: {
          session_1: { id: 'session_1', participants: [] }
        },
        getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
        getDisplayMessages: vi.fn(() => [])
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_expression_recall',
            name: '表达核心',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '{character_expression_recall}'
          }
        ]
      },
      charStore: {
        ...mockCharStore,
        characters: [{
          id: 'c1',
          name: '星依',
          desc: '测试角色',
          appearance: '',
          personality: '认真、警觉。',
          speakingStyle: '直接。'
        }],
        getCharacter: vi.fn((id) => ({
          id,
          name: '星依',
          desc: '测试角色',
          appearance: '',
          personality: '认真、警觉。',
          speakingStyle: '直接。'
        }))
      },
      resourceStore: mockResourceStore
    })
    const onPromptPrepared = vi.fn()

    await ai.prepareAIRecall('c1')
    const messages = ai.buildPromptMessages('c1', 'chat')
    await ai.callAI(messages, { onPromptPrepared })

    const prepared = onPromptPrepared.mock.calls[0][0]
    const logBlock = prepared.promptBlocks.find((block) => block.title === '情绪潮汐补丁')

    expect(prepared.finalPrompt).not.toContain('此刻更在意用户刚才的追问')
    expect(prepared.finalPrompt).not.toContain('snapshot_log_1')
    expect(prepared.finalPrompt).not.toContain('ledger_1')
    expect(logBlock).toBeFalsy()
  })

  it('空召回构建会清掉待消费的召回补丁日志，避免污染 CAPS 提示词重放', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ content: 'ok' }),
      json: async () => ({ content: 'ok' })
    }))
    const ai = useAI({
      chatStore: {
        ...mockChatStore,
        activeChatSessionId: 'session_1',
        chatSessions: {
          session_1: { id: 'session_1', participants: [] }
        },
        getCurrentSession: vi.fn(() => ({ id: 'session_1', participants: [] })),
        getDisplayMessages: vi.fn(() => [])
      },
      settingStore: {
        ...mockSettingStore,
        promptPresets: [
          {
            id: 'character_profile_recall',
            name: '当前人物',
            role: 'system',
            scene: 'chat',
            enabled: true,
            orderIndex: 0,
            isRequired: true,
            content: '{character_profile_recall}'
          }
        ]
      },
      charStore: {
        ...mockCharStore,
        getCharacter: vi.fn((id) => ({
          id,
          name: '星依',
          desc: '测试角色',
          appearance: '',
          personality: '认真、警觉。',
          speakingStyle: '直接。'
        }))
      },
      resourceStore: mockResourceStore
    })
    const onPromptPrepared = vi.fn()

    await ai.prepareAIRecall('c1')
    const messages = ai.buildPromptMessages('c1', 'chat', { forceEmptyRecall: true })
    await ai.callAI(messages, { onPromptPrepared })

    const prepared = onPromptPrepared.mock.calls[0][0]
    expect(prepared.finalPrompt).not.toContain('此刻不该进入 CAPS 重放')
    expect(prepared.promptBlocks.some((block) => block.title === '情绪潮汐补丁')).toBe(false)
  })

  it('should merge consecutive assistant messages', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const messages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '第一部分' },
      { role: 'assistant', content: '第二部分' },
      { role: 'user', content: '再见' }
    ]

    const merged = ai.mergeConsecutiveAssistant(messages)

    expect(merged).toHaveLength(3)
    expect(merged[1].content).toBe('第一部分\n\n第二部分')
  })

  it('单条 content parts（图片）消息原样透传，不被字符串逻辑炸掉（批2·图片双通道）', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '这张图是什么' },
          { type: 'image_url', image_url: { url: '/chat-images/x.png' } }
        ]
      }
    ]

    const merged = ai.mergeConsecutiveMessages(messages)

    expect(merged).toHaveLength(1)
    expect(merged[0].content).toEqual(messages[0].content)
  })

  it('两条连续同角色消息合并时，任一侧带图片 parts 会升级成 parts 数组合并、不丢图（批2）', () => {
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const messages = [
      { role: 'user', content: '第一句纯文字' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '第二句带图' },
          { type: 'image_url', image_url: { url: '/chat-images/y.png' } }
        ]
      }
    ]

    const merged = ai.mergeConsecutiveMessages(messages)

    expect(merged).toHaveLength(1)
    expect(Array.isArray(merged[0].content)).toBe(true)
    const imagePart = merged[0].content.find((part) => part.type === 'image_url')
    expect(imagePart.image_url.url).toBe('/chat-images/y.png')
    const textParts = merged[0].content.filter((part) => part.type === 'text').map((part) => part.text)
    expect(textParts.join('')).toContain('第一句纯文字')
    expect(textParts.join('')).toContain('第二句带图')
  })

  it('should surface server AI error details for stream failures', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: '预设 小忆 调用失败（HTTP 502）：上游服务返回错误'
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    }))
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    await expect(ai.callAIStream([
      { role: 'user', content: '你好' }
    ], { presetName: '小忆' })).rejects.toThrow('预设 小忆 调用失败')
  })

  it('callAIWithTools 下发 tools 并取回原生 tool_calls', async () => {
    let capturedBody = null
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"thought":"先读情境"}', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'readScenarioSkill', arguments: '{"code":"daily"}' } }] } }]
        }),
        json: async () => ({})
      }
    })
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    const result = await ai.callAIWithTools(
      [{ role: 'user', content: '判一下情境' }],
      {
        presetName: '小忆',
        tools: [{ type: 'function', function: { name: 'readScenarioSkill', description: '读情境', parameters: { type: 'object' } } }],
        toolChoice: 'auto',
        profileId: 'tidiao.director-round',
        harnessRunId: 'director_run_1',
        modelTurnIndex: 2,
        toolEpoch: 1,
        toolEpochTurnIndex: 0,
        promptRebuild: true,
        activeToolNamesHash: 'fnv1a32:11111111',
        toolSchemaHash: 'fnv1a32:22222222',
        systemHash: 'fnv1a32:33333333',
        messagePrefixHash: 'fnv1a32:44444444',
        requestEnvelopeHash: 'fnv1a32:55555555',
        firstDiffSource: 'tools'
      }
    )

    // 请求体：tools 下发、默认非流式
    expect(capturedBody.tools).toHaveLength(1)
    expect(capturedBody.tools[0].function.name).toBe('readScenarioSkill')
    // 客户端→代理 body 用驼峰 toolChoice；转上游时由服务端改写为 tool_choice（见服务端测试）。
    expect(capturedBody.toolChoice).toBe('auto')
    expect(capturedBody.stream).toBe(false)
    expect(capturedBody.meta).toMatchObject({
      profileId: 'tidiao.director-round',
      harnessRunId: 'director_run_1',
      modelTurnIndex: 2,
      toolEpoch: 1,
      toolEpochTurnIndex: 0,
      promptRebuild: true,
      activeToolNamesHash: 'fnv1a32:11111111',
      toolSchemaHash: 'fnv1a32:22222222',
      systemHash: 'fnv1a32:33333333',
      messagePrefixHash: 'fnv1a32:44444444',
      requestEnvelopeHash: 'fnv1a32:55555555',
      firstDiffSource: 'tools'
    })
    // 回包：原生 tool_calls 取回，content 同时带出
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].function.name).toBe('readScenarioSkill')
    expect(result.toolCalls[0].function.arguments).toBe('{"code":"daily"}')
    expect(result.content).toBe('{"thought":"先读情境"}')
  })

  it('callAI 传 currentAttachments 时把最后一条 user 消息升级为 parts 数组（批4·通道A当轮原生图）', async () => {
    let capturedBody = null
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ content: 'ok' }),
        json: async () => ({ content: 'ok' })
      }
    })
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    await ai.callAI(
      [{ role: 'user', content: '看看这张图' }],
      {
        currentAttachments: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }]
      }
    )

    expect(capturedBody.messages).toHaveLength(1)
    expect(capturedBody.messages[0].content).toEqual([
      { type: 'text', text: '看看这张图\n[图片1：一只猫]' },
      { type: 'image_url', image_url: { url: '/chat-images/a1.png' } }
    ])
  })

  it('callAIStream 传 currentAttachments 时同样升级最后一条 user 消息；未传时零变化', async () => {
    let capturedBody = null
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(init.body)
      return new Response('data: {"content":"ok"}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    })
    const ai = useAI({
      chatStore: mockChatStore,
      settingStore: mockSettingStore,
      charStore: mockCharStore,
      resourceStore: mockResourceStore
    })

    await ai.callAIStream(
      [{ role: 'system', content: '系统提示' }, { role: 'user', content: '这张图里有什么' }],
      { currentAttachments: [{ id: 'a1', kind: 'image', url: '/chat-images/a1.png', mime: 'image/png' }] }
    )
    expect(capturedBody.messages[1].content).toEqual([
      { type: 'text', text: '这张图里有什么\n[图片1：图片]' },
      { type: 'image_url', image_url: { url: '/chat-images/a1.png' } }
    ])

    // 未传 currentAttachments（或空数组）：零变化，走原字符串 content 老路径。
    await ai.callAIStream([{ role: 'user', content: '没有图' }], {})
    expect(capturedBody.messages[0].content).toBe('没有图')
  })
})
