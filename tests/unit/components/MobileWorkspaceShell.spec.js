/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const docLibraryMock = vi.hoisted(() => ({
  fetchDocLibraryState: vi.fn()
}))

vi.mock('../../../src/repositories/docBrainRepository', () => ({
  fetchDocLibraryState: docLibraryMock.fetchDocLibraryState
}))

import MobileWorkspaceShell from '../../../src/components/mobile-workspace/MobileWorkspaceShell.vue'
import { shouldUseMobileWorkspace } from '../../../src/components/mobile-workspace/mobileWorkspaceSurface'
import {
  beginTidiaoDirectorStreamRound,
  updateTidiaoDirectorStreamRound,
  clearTidiaoDirectorStreamRound
} from '../../../src/app/tidiaoDirectorStreamState'
import { buildTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream'

function createDocLibrarySnapshot() {
  return {
    schemaVersion: 1,
    documents: [
      {
        id: 'doc-index',
        documentId: 'doc-index',
        title: '亚什基诺',
        displayPath: '/亚什基诺/index.md',
        content: '亚什基诺是一个靠海贸易城邦。',
        publicCompilePage: {
          summary: '靠海贸易城邦。',
          tags: ['世界树', '概览'],
          relationHints: []
        }
      },
      {
        id: 'doc-night',
        documentId: 'doc-night',
        title: '夜巡者',
        displayPath: '/亚什基诺/组织/夜巡者.md',
        content: '夜巡者负责在雾夜巡查港口。',
        publicCompilePage: {
          summary: '雾夜巡查港口的组织。',
          tags: ['组织'],
          relationHints: ['[[夜巡者]] -> 守护 -> [[亚什基诺]]']
        }
      }
    ],
    manualTreeOrders: {},
    relationSystemState: {
      predicates: [],
      relationDecisions: []
    }
  }
}

function createState(overrides = {}) {
  const {
    chatViewModel: chatViewModelOverrides = {},
    chatActions: chatActionsOverrides = {},
    panelViewModels: panelViewModelsOverrides = {},
    panelActions: panelActionsOverrides = {},
    ...restOverrides
  } = overrides
  const defaultMessages = [
    { id: 1, role: 'user', content: '你好', time: '08:00' },
    { id: 2, role: 'assistant', name: '陈星依', content: '*高高举起右手。*', time: '08:01' }
  ]
  const currentMessages = chatViewModelOverrides.currentMessages || defaultMessages

  return {
    chatViewModel: {
      chatSessionRows: [
        {
          sessionId: 'session-a',
          targetId: 'char-a',
          kind: 'session',
          title: '荒岛求生',
          label: '2 人',
          preview: '海浪退潮的动静比刚才更响了。',
          updatedAt: '昨天',
          avatarPath: 'avatars/session-a.png',
          emoji: '🏝️',
          participantCount: 2,
          messageCount: 12
        },
        {
          sessionId: 'session-b',
          targetId: 'char-b',
          kind: 'session',
          title: '陈星依',
          label: '1 人',
          preview: '高高举起右手。',
          updatedAt: '今天',
          emoji: '🌟',
          participantCount: 1,
          messageCount: 3
        }
      ],
      activeSessionId: 'session-a',
      currentChatTitle: '荒岛求生',
      currentMessages,
      isTyping: false,
      streamingText: '',
      chatInputText: '',
      currentScene: { time: '0091-05-09 08:00', weather: '晴', location: '海边小屋' },
      characters: [
        {
          id: 'char-a',
          name: '张元英',
          emoji: '张',
          gender: '女',
          age: '20',
          groupId: 'group-idol',
          desc: '舞台上很冷静，私下会认真观察同伴。',
          personality: '克制、聪明、敏感',
          brainCognitionNodes: [
            {
              id: 'soul-1',
              title: '保护欲',
              kind: 'private',
              content: '她会把需要保护的人放在自己的计划中心。',
              summary: '把保护对象放在计划中心。',
              tags: ['灵魂']
            }
          ],
          brainTraceNodes: [
            {
              id: 'trace-day-1',
              title: '0091-05-09',
              kind: 'day',
              granularity: 'day',
              nodeType: 'single',
              pointDate: '0091-05-09',
              content: '她在海边小屋整理了当天的行动。',
              summary: '海边小屋行动整理。',
              tags: ['轨迹'],
              confirmed: true
            }
          ]
        }
      ],
      characterGroups: [{ id: 'group-idol', name: '舞台组', emoji: '舞' }],
      userProfile: { displayName: '用户' },
      ...chatViewModelOverrides
    },
    chatActions: {
      switchSession: vi.fn(),
      openChatSessionCreator: vi.fn(),
      inputChatText: vi.fn(),
      sendChat: vi.fn(),
      abortChat: vi.fn(),
      openPromptLogPanel: vi.fn(),
      openFullscreenImage: vi.fn(),
      openUserEditor: vi.fn(),
      toggleDarkMode: vi.fn(),
      ...chatActionsOverrides
    },
    panelViewModels: {
      resource: {
        points: 120,
        money: 45,
        bigTime: 2,
        smallTime: 3,
        goldTickets: 4,
        canExchangePoints: true
      },
      task: {
        filteredTasks: [{ id: 'task-a', name: '整理资料' }]
      },
      cloudSync: {
        cloudLoggedIn: true,
        cloudUsername: '用户的云端',
        cloudEmail: 'father@example.com',
        cloudPassword: '',
        cloudSaves: [{ name: 'morning-save' }, { name: 'night-save' }],
        selectedCloudSlot: 'morning-save',
        selectedSyncModules: ['characters', 'chats'],
        cloudModuleDefinitions: [],
        isSyncing: false,
        error: '',
        sections: {}
      },
      apiConfig: {
        sections: {},
        apiPresets: [{ id: 'main', name: '主预设' }],
        apiProviderTemplates: [],
        defaultPresetName: '主预设',
        aiProviderMode: 'custom',
        apiPresetCount: 1,
        currentApiPresetIndex: 0,
        apiPresetForm: {
          originalName: '主预设',
          name: '主预设',
          providerType: 'openai',
          apiUrl: 'https://example.invalid',
          apiKey: '',
          model: 'gpt-test'
        },
        showEditApiPreset: false,
        isLoadingModels: false,
        isTestingApi: false,
        modelList: [],
        weatherApiKey: '',
        weatherApiDomain: '',
        agentModelConfigs: []
      },
      dataManage: {
        sections: {}
      },
      ...panelViewModelsOverrides
    },
    panelActions: {
      cloudSync: {
        refreshCloudSaves: vi.fn()
      },
      apiConfig: {
        setAiProviderMode: vi.fn(),
        testApiConnection: vi.fn(),
        loadApiPreset: vi.fn(),
        addNewApiPreset: vi.fn(),
        updateApiPresetForm: vi.fn(),
        loadModels: vi.fn(),
        saveApiPreset: vi.fn(),
        setDefaultPreset: vi.fn(),
        deleteCurrentApiPreset: vi.fn(),
        updateWeatherApiKey: vi.fn(),
        updateWeatherApiDomain: vi.fn(),
        saveWeatherApiConfig: vi.fn(),
        updateAgentModelConfig: vi.fn(),
        saveAgentModelConfig: vi.fn()
      },
      dataManage: {
        exportData: vi.fn()
      },
      ...panelActionsOverrides
    },
    getDisplayedMessageContent: (index) => {
      return currentMessages[index]?.content || ''
    },
    ...restOverrides
  }
}

async function waitForDocLibrary() {
  await Promise.resolve()
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  setActivePinia(createPinia())
  docLibraryMock.fetchDocLibraryState.mockResolvedValue(createDocLibrarySnapshot())
})

afterEach(() => {
  clearTidiaoDirectorStreamRound()
})

describe('mobile workspace entry', () => {
  it('honors explicit surface override before any auto detection', () => {
    const mobileEnv = { viewportWidth: 1440, coarsePointer: false, userAgent: 'desktop' }
    const desktopEnv = { viewportWidth: 390, coarsePointer: true, userAgent: 'iPhone' }
    // ?surface=mobile 强制移动，即使是宽屏桌面环境
    expect(shouldUseMobileWorkspace('?surface=mobile', mobileEnv)).toBe(true)
    expect(shouldUseMobileWorkspace('surface=mobile', mobileEnv)).toBe(true)
    // ?surface=desktop 强制桌面，即使是真机窄屏环境
    expect(shouldUseMobileWorkspace('?surface=desktop', desktopEnv)).toBe(false)
    // 未知参数不构成开关，走自动判定
    expect(shouldUseMobileWorkspace('?mobile=1', desktopEnv)).toBe(true)
  })

  it('auto-activates only on a real mobile device with a narrow viewport', () => {
    // 真机窄屏（触摸 / 移动 UA）→ 移动 shell
    expect(shouldUseMobileWorkspace('', { viewportWidth: 390, coarsePointer: true, userAgent: 'desktop' })).toBe(true)
    expect(shouldUseMobileWorkspace('', { viewportWidth: 414, coarsePointer: false, userAgent: 'iPhone' })).toBe(true)
    // 桌面窄窗口（非触摸 / 非移动 UA）不被劫持
    expect(shouldUseMobileWorkspace('', { viewportWidth: 500, coarsePointer: false, userAgent: 'Mozilla/5.0 (Windows NT)' })).toBe(false)
    // 移动设备但视口超过阈值（横屏平板等）→ 留在桌面
    expect(shouldUseMobileWorkspace('', { viewportWidth: 900, coarsePointer: true, userAgent: 'iPad' })).toBe(false)
    // 缺少视口信息时不进入移动 shell
    expect(shouldUseMobileWorkspace('', { viewportWidth: 0, coarsePointer: true, userAgent: 'iPhone' })).toBe(false)
  })
})

describe('MobileWorkspaceShell', () => {
  it('renders real chat session rows and switches sessions through real actions', async () => {
    const switchSession = vi.fn()
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState({ chatActions: { switchSession } })
      }
    })

    expect(wrapper.find('[data-mobile-workspace-shell="true"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('荒岛求生')
    expect(wrapper.text()).toContain('陈星依')

    await wrapper.findAll('.mobile-flow-row').at(1).trigger('click')
    expect(switchSession).toHaveBeenCalledWith('session-b')
    expect(wrapper.text()).toContain('海边小屋')
    expect(wrapper.text()).toContain('高高举起右手。')
  })

  it('opens a newly created mobile chat session directly in the thread', async () => {
    const openChatSessionCreator = vi.fn()
    const state = createState({
      chatActions: { openChatSessionCreator }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: { state }
    })

    await wrapper.find('.mobile-top-bar__action').trigger('click')
    expect(openChatSessionCreator).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.mobile-chat-list').exists()).toBe(true)

    const nextState = createState({
      chatViewModel: {
        ...state.chatViewModel,
        chatSessionRows: [
          ...state.chatViewModel.chatSessionRows,
          {
            sessionId: 'session-new',
            targetId: 'char-new',
            kind: 'session',
            title: '新会话',
            label: '1 人',
            preview: '',
            updatedAt: '刚刚',
            emoji: '✨',
            participantCount: 1,
            messageCount: 0
          }
        ],
        activeSessionId: 'session-new',
        currentChatTitle: '新会话',
        currentMessages: []
      },
      chatActions: { openChatSessionCreator }
    })
    await wrapper.setProps({ state: nextState })
    await nextTick()

    expect(wrapper.find('.mobile-chat-thread').exists()).toBe(true)
    expect(wrapper.find('.mobile-chat-list').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('当前会话暂无消息')
  })

  it('filters real chat session rows locally before opening a thread', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.find('.mobile-chat-list__search input').setValue('星依')

    const rows = wrapper.findAll('.mobile-flow-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('陈星依')
    expect(rows[0].text()).not.toContain('荒岛求生')
  })

  it('renders mobile chat session avatars from images first, then emoji', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    const avatars = wrapper.findAll('.mobile-chat-list .mobile-avatar')
    expect(avatars[0].find('img').attributes('src')).toBe('/avatars/session-a.png')
    expect(avatars[1].find('img').exists()).toBe(false)
    expect(avatars[1].text()).toBe('🌟')
  })

  it('sends through the existing chat input and send actions from the thread', async () => {
    const inputChatText = vi.fn()
    const sendChat = vi.fn()
    const state = createState({
      chatViewModel: { chatInputText: '准备发送' },
      chatActions: {
        inputChatText: (value) => {
          inputChatText(value)
          state.chatViewModel.chatInputText = value
        },
        sendChat
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state
      }
    })

    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')
    await wrapper.find('.mobile-chat-composer textarea').setValue('新的消息')
    await wrapper.setProps({ state: { ...state } })
    await wrapper.find('.mobile-chat-composer').trigger('submit')

    expect(inputChatText).toHaveBeenCalledWith('新的消息')
    expect(sendChat).toHaveBeenCalledTimes(1)
  })

  it('keeps Chinese IME composition local until composition ends in the mobile composer', async () => {
    const inputChatText = vi.fn()
    const state = createState({
      chatActions: {
        inputChatText: (value) => {
          inputChatText(value)
          state.chatViewModel.chatInputText = value
        }
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state
      }
    })

    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')
    const textarea = wrapper.find('.mobile-chat-composer textarea')

    await textarea.trigger('compositionstart')
    await textarea.setValue('xing')
    expect(inputChatText).not.toHaveBeenCalled()

    textarea.element.value = '星'
    await textarea.trigger('compositionend')
    expect(inputChatText).toHaveBeenCalledWith('星')

    await textarea.trigger('compositionstart')
    textarea.element.value = '星yi'
    await textarea.trigger('input')
    expect(inputChatText).toHaveBeenCalledTimes(1)

    textarea.element.value = '星依'
    await textarea.trigger('compositionend')
    expect(inputChatText).toHaveBeenLastCalledWith('星依')
  })

  it('routes mobile chat avatars to existing profile editors', async () => {
    const openUserEditor = vi.fn()
    const openCharSettings = vi.fn()
    const state = createState({
      chatActions: {
        openUserEditor,
        openCharSettings
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state
      }
    })

    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')
    const avatarButtons = wrapper.findAll('.mobile-chat-avatar-button')
    expect(avatarButtons.length).toBeGreaterThanOrEqual(2)

    await avatarButtons.at(0).trigger('click')
    await avatarButtons.at(1).trigger('click')

    expect(openUserEditor).toHaveBeenCalledTimes(1)
    expect(openCharSettings).toHaveBeenCalledWith('陈星依')
  })

  it('旧六块编排带退役后：无 directorStream 的轮不出编排带，也不重复加打字气泡', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState({
          chatViewModel: {
            isTyping: true,
            currentStreamingSpeakerName: '陈星依',
            currentMessages: [
              { id: 1, role: 'user', content: '晚上好', time: '23:05' },
              {
                id: 2,
                role: 'assistant',
                name: '陈星依',
                content: '',
                time: '23:05',
                _processTrace: {
                  steps: {
                    projection: 'done',
                    context: 'done',
                    recall: 'running',
                    scenario: 'done',
                    plan: 'waiting',
                    review: 'waiting',
                    compose: 'waiting',
                    narration: 'done'
                  },
                  failed: false,
                  elapsed: '',
                  mode: 'personality_model',
                  narration: { willGenerate: false, reason: '本轮没有新的场景变化。' }
                }
              }
            ]
          }
        })
      }
    })

    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')

    // 旧六块编排带（.mobile-chat-round-band）已退役删除：无 directorStream 且无活动导演载体的轮不出任何编排带。
    // 2026-07-04 接坞后：提调带统一收进顶部提调坞，无任何轮时坞收起为常驻绿条入口、不出带。
    expect(wrapper.find('.mobile-chat-round-band').exists()).toBe(false)
    expect(wrapper.find('.tds-dock__bar').exists()).toBe(true)
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)
    // 打字气泡由 showStreamingMessage 独立控制（与编排带无关）：仍不重复加。
    expect(wrapper.findAll('.mobile-chat-thread__typing')).toHaveLength(0)
  })

  // 子批5：移动端提调真·导演 loop 轮级流式载体单聊端到端接线（与桌面同源）。
  // 2026-07-04 接坞：带不再内联锚在用户消息后，统一由顶部提调坞承载（done 自动收起、点绿条回看）。
  it('mounts the director stream band in the top tidiao dock on mobile', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState({
          chatViewModel: {
            activeSessionId: 'session-a',
            currentMessages: [
              { id: 300, role: 'user', content: '今天晚上天气不错', time: '20:00' }
            ]
          }
        })
      }
    })

    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')

    beginTidiaoDirectorStreamRound({
      runId: 'run_mobile_dir',
      sessionId: 'session-a',
      anchorMessageId: 300,
      speakerName: '陈星依'
    })
    updateTidiaoDirectorStreamRound('run_mobile_dir', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'situation', text: '这是闲聊放松的情境' },
      {
        type: 'decision',
        kind: 'castDir',
        text: '陈星依会附和用户',
        shot: { kind: 'character', label: '陈星依', direction: '附和、点头', avatar: '陈' }
      },
      { type: 'phase', phase: 'done' }
    ]))
    await nextTick()

    // phase=done 后坞自动收起为绿条；点绿条展开回看最新一轮（=本活动轮）。
    expect(wrapper.find('.chat-director-band').exists()).toBe(false)
    await wrapper.find('.tds-dock__bar').trigger('click')

    const band = wrapper.find('.chat-director-band')
    expect(band.exists()).toBe(true)
    // compact 态（坞透传 compact）：内层 .tds 走 tab 二选一（2026-07-05 移动端适配），tab 行存在
    expect(band.find('.tds--compact').exists()).toBe(true)
    expect(band.find('.tds-tabs').exists()).toBe(true)
    expect(band.text()).toContain('这是闲聊放松的情境')
    const shot = band.find('.tds-shot')
    expect(shot.exists()).toBe(true)
    expect(shot.text()).toContain('陈星依')
  })

  // 2026-07-05 纠偏条换皮：旧白底胶囊退役，默认收成输入框顶缘「绿舌」，点舌展开橄榄绿条（智能二选一逻辑不动）。
  it('提调纠偏绿舌：默认收起，点舌展开橄榄绿条，提交走 applyDirectorPrecisionEdits，chevron 收回', async () => {
    const applyDirectorPrecisionEdits = vi.fn()
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState({
          chatViewModel: { currentTarget: 'group_a' },
          chatActions: { applyDirectorPrecisionEdits }
        })
      }
    })
    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')

    // 旧白底胶囊已退役；默认只露绿舌，不出展开条
    expect(wrapper.find('.mobile-tds-edit-bar').exists()).toBe(false)
    expect(wrapper.find('.mobile-tds-tongue').exists()).toBe(true)
    expect(wrapper.find('.mobile-tds-bar').exists()).toBe(false)

    // 点舌展开：橄榄绿条 + 输入框 + 收起 chevron + 「提调」按钮
    await wrapper.find('.mobile-tds-tongue').trigger('click')
    const bar = wrapper.find('.mobile-tds-bar')
    expect(bar.exists()).toBe(true)
    expect(wrapper.find('.mobile-tds-tongue').exists()).toBe(false)
    expect(bar.find('.mobile-tds-bar__send').text()).toContain('提调')

    // 输入后提交：智能二选一入口 applyDirectorPrecisionEdits 收到原文，草稿清空
    const input = bar.find('.mobile-tds-bar__input')
    await input.setValue('张元英的反应更冷静一点')
    expect(bar.find('.mobile-tds-bar__send').classes()).toContain('is-active')
    await bar.trigger('submit')
    expect(applyDirectorPrecisionEdits).toHaveBeenCalledWith('张元英的反应更冷静一点')
    expect(bar.find('.mobile-tds-bar__input').element.value).toBe('')

    // chevron 收回绿舌
    await bar.find('.mobile-tds-bar__fold').trigger('click')
    expect(wrapper.find('.mobile-tds-bar').exists()).toBe(false)
    expect(wrapper.find('.mobile-tds-tongue').exists()).toBe(true)
  })

  it('提调纠偏绿舌：correcting 挂起自动展开，占位换「回复提调，续跑本轮」', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState({
          chatViewModel: { currentTarget: 'group_a' },
          chatActions: { applyDirectorPrecisionEdits: vi.fn() }
        })
      }
    })
    await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')
    expect(wrapper.find('.mobile-tds-bar').exists()).toBe(false)

    beginTidiaoDirectorStreamRound({
      runId: 'run_mobile_corr',
      sessionId: 'session-a',
      anchorMessageId: 1,
      speakerName: '陈星依'
    })
    updateTidiaoDirectorStreamRound('run_mobile_corr', buildTidiaoDirectorStream([
      { type: 'decision', kind: 'analyze', text: '提调想先问用户一个问题' },
      { type: 'phase', phase: 'correcting' }
    ]))
    await nextTick()
    await nextTick()

    const bar = wrapper.find('.mobile-tds-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.find('.mobile-tds-bar__input').attributes('placeholder')).toBe('回复提调，续跑本轮')
  })

  it('opens the local orchestration audit panel from mobile message actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        sessionId: 'session-a',
        projections: [],
        visibility: [],
        attempts: [],
        traces: []
      })
    })))
    try {
      const wrapper = mount(MobileWorkspaceShell, {
        props: {
          state: createState()
        }
      })

      await wrapper.findAll('.mobile-flow-row').at(0).trigger('click')
      const auditButton = wrapper.find('button[title="编排审计"]')
      expect(auditButton.exists()).toBe(true)

      await auditButton.trigger('click')
      await nextTick()

      expect(document.body.textContent).toContain('编排审计')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renders real role list and opens a role brain section', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(1).trigger('click')
    expect(wrapper.text()).toContain('舞台组')
    expect(wrapper.text()).toContain('张元英')

    await wrapper.find('.mobile-role-members .mobile-flow-row').trigger('click')
    expect(wrapper.text()).toContain('核心')
    expect(wrapper.text()).toContain('灵魂')
    expect(wrapper.text()).toContain('轨迹')
    expect(wrapper.text()).toContain('大脑神经元')
  })

  it('opens a real role unit reader and relation projection from the mobile role tree', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(1).trigger('click')
    await wrapper.find('.mobile-role-members .mobile-flow-row').trigger('click')
    // 详情底部玻璃导航切到「灵魂」分区
    await wrapper.findAll('.mobile-glass-nav__item').at(1).trigger('click')
    // 点击树中的「保护欲」叶子节点打开单位
    const soulLeaf = wrapper.findAll('.mobile-sone-node__row').find((row) => row.text().includes('保护欲'))
    await soulLeaf.trigger('click')

    expect(wrapper.text()).toContain('保护欲')
    expect(wrapper.text()).toContain('公共编译页')
    expect(wrapper.text()).toContain('她会把需要保护的人放在自己的计划中心。')

    // 关系视图导航项存在（物理关系图复用桌面端组件，运行时渲染交浏览器验收，不在 jsdom 挂载）
    expect(wrapper.findAll('.mobile-glass-nav__item').at(2).text()).toContain('关系视图')
  })

  it('renders real doc library tree rows from the doc library read model', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(2).trigger('click')
    await waitForDocLibrary()

    expect(docLibraryMock.fetchDocLibraryState).toHaveBeenCalled()
    expect(wrapper.text()).toContain('世界树')
    expect(wrapper.text()).toContain('亚什基诺')
    expect(wrapper.text()).toContain('组织')

    await wrapper.find('.mobile-doc-search input').setValue('夜巡')
    expect(wrapper.text()).toContain('夜巡者')
    expect(wrapper.text()).not.toContain('靠海贸易城邦')
  })

  it('opens a doc unit reader and read-only relation projection', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(2).trigger('click')
    await waitForDocLibrary()
    // 点击「夜巡者」叶子节点打开文档阅读
    const docLeaf = wrapper.findAll('.mobile-sone-node__row').find((row) => row.text().includes('夜巡者'))
    await docLeaf.trigger('click')

    expect(wrapper.text()).toContain('夜巡者')
    expect(wrapper.text()).toContain('夜巡者负责在雾夜巡查港口。')

    // 关系视图导航项存在（物理关系图复用桌面端组件，运行时渲染交浏览器验收，不在 jsdom 挂载）
    expect(wrapper.findAll('.mobile-glass-nav__item').at(2).text()).toContain('关系视图')
  })

  it('renders the mobile me workspace from local panel state', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    expect(wrapper.text()).toContain('用户')
    expect(wrapper.text()).toContain('本地工作区')
    expect(wrapper.text()).not.toContain('@')
    expect(wrapper.text()).toContain('自定义 API · 1 个预设')
    expect(wrapper.text()).toContain('主预设')
    expect(wrapper.text()).toContain('API配置')
    expect(wrapper.text()).toContain('数据管理')
    expect(wrapper.text()).toContain('待接入')
    expect(wrapper.text()).not.toContain('概览')
    expect(wrapper.text()).not.toContain('云端同步')
    expect(wrapper.text()).not.toContain('2 档')
    expect(wrapper.text()).not.toContain('管理员入口')
  })

  it('routes safe mobile me actions through existing actions', async () => {
    const openUserEditor = vi.fn()
    const toggleDarkMode = vi.fn()
    const setAiProviderMode = vi.fn()
    const testApiConnection = vi.fn()
    const exportData = vi.fn()
    const state = createState({
      chatViewModel: { darkMode: false },
      chatActions: { openUserEditor, toggleDarkMode },
      panelActions: {
        cloudSync: { refreshCloudSaves: vi.fn() },
        apiConfig: { setAiProviderMode, testApiConnection },
        dataManage: { exportData }
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.find('.mobile-me-account').trigger('click')
    await wrapper.find('.mobile-me-toggle').trigger('click')
    await wrapper.findAll('.mobile-me-segmented button').at(0).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(1).trigger('click')
    await wrapper.find('.mobile-me-data-entry').trigger('click')

    expect(openUserEditor).toHaveBeenCalledTimes(1)
    expect(toggleDarkMode).toHaveBeenCalledTimes(1)
    expect(setAiProviderMode).not.toHaveBeenCalled()
    expect(testApiConnection).toHaveBeenCalledTimes(1)
    expect(exportData).not.toHaveBeenCalled()
  })

  it('opens the mobile API config workspace from mobile me without creating private config state', async () => {
    const updateApiPresetForm = vi.fn()
    const saveApiPreset = vi.fn()
    const setDefaultPreset = vi.fn()
    const state = createState({
      panelActions: {
        cloudSync: { refreshCloudSaves: vi.fn() },
        apiConfig: {
          setAiProviderMode: vi.fn(),
          testApiConnection: vi.fn(),
          loadApiPreset: vi.fn(),
          addNewApiPreset: vi.fn(),
          updateApiPresetForm,
          loadModels: vi.fn(),
          saveApiPreset,
          setDefaultPreset,
          deleteCurrentApiPreset: vi.fn(),
          updateWeatherApiKey: vi.fn(),
          updateWeatherApiDomain: vi.fn(),
          saveWeatherApiConfig: vi.fn(),
          updateAgentModelConfig: vi.fn(),
          saveAgentModelConfig: vi.fn()
        },
        dataManage: { exportData: vi.fn() }
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: { state }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(0).trigger('click')

    expect(wrapper.text()).toContain('AI 配置')
    expect(wrapper.text()).toContain('模型预设')
    expect(wrapper.text()).toContain('Agent')
    expect(wrapper.text()).toContain('天气')
    expect(wrapper.find('section[aria-label="模型预设"]').text()).not.toContain('加载模型')

    await wrapper.find('.mobile-api-primary-button').trigger('click')
    expect(updateApiPresetForm).toHaveBeenCalled()
    expect(saveApiPreset).toHaveBeenCalledTimes(1)
    expect(setDefaultPreset).toHaveBeenCalledWith('主预设')
  })

  it('keeps a locally selected or new API preset draft during view-model refreshes', async () => {
    const apiConfig = {
      sections: {},
      apiPresets: [
        { id: 'deepseek', name: 'Deepseek', providerType: 'deepseek', baseUrl: 'https://api.deepseek.com', hasApiKey: true },
        { id: 'xiaoyi', name: '小忆', providerType: 'openai-compatible', baseUrl: 'https://xiaoyi.invalid', hasApiKey: true }
      ],
      apiProviderTemplates: [],
      defaultPresetName: '小忆',
      aiProviderMode: 'custom',
      apiPresetCount: 2,
      currentApiPresetIndex: 1,
      apiPresetForm: {
        originalName: '小忆',
        name: '小忆',
        providerType: 'openai-compatible',
        apiUrl: 'https://xiaoyi.invalid',
        apiKey: '',
        hasApiKey: true,
        model: ''
      },
      showEditApiPreset: false,
      isLoadingModels: false,
      isTestingApi: false,
      modelList: [],
      weatherApiKey: '',
      weatherApiDomain: '',
      agentModelConfigs: []
    }
    const state = createState({
      panelViewModels: { apiConfig }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: { state }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(0).trigger('click')
    await wrapper.findAll('.mobile-api-preset-row').at(0).trigger('click')
    expect(wrapper.find('input[placeholder="如 DeepSeek"]').element.value).toBe('Deepseek')

    await wrapper.setProps({
      state: createState({
        panelViewModels: {
          apiConfig: {
            ...apiConfig,
            apiPresetForm: { ...apiConfig.apiPresetForm }
          }
        }
      })
    })
    await nextTick()
    expect(wrapper.find('input[placeholder="如 DeepSeek"]').element.value).toBe('Deepseek')

    await wrapper.find('.mobile-api-lite-button').trigger('click')
    expect(wrapper.text()).toContain('新建预设')
    expect(wrapper.find('input[placeholder="如 DeepSeek"]').element.value).toBe('')

    await wrapper.setProps({
      state: createState({
        panelViewModels: {
          apiConfig: {
            ...apiConfig,
            apiPresetForm: { ...apiConfig.apiPresetForm }
          }
        }
      })
    })
    await nextTick()
    expect(wrapper.text()).toContain('新建预设')
    expect(wrapper.find('input[placeholder="如 DeepSeek"]').element.value).toBe('')
  })

  it('applies provider templates locally when creating a mobile API preset', async () => {
    const state = createState({
      panelViewModels: {
        apiConfig: {
          ...createState().panelViewModels.apiConfig,
          apiProviderTemplates: [
            { id: 'openai-compatible', name: 'OpenAI 兼容' },
            { id: 'deepseek', name: 'DeepSeek' }
          ]
        }
      },
      panelActions: {
        cloudSync: { refreshCloudSaves: vi.fn() },
        apiConfig: {
          setAiProviderMode: vi.fn(),
          testApiConnection: vi.fn(),
          loadApiPreset: vi.fn(),
          addNewApiPreset: vi.fn(),
          updateApiPresetForm: vi.fn(),
          loadModels: vi.fn(),
          saveApiPreset: vi.fn(),
          setDefaultPreset: vi.fn(),
          deleteCurrentApiPreset: vi.fn(),
          updateWeatherApiKey: vi.fn(),
          updateWeatherApiDomain: vi.fn(),
          saveWeatherApiConfig: vi.fn(),
          updateAgentModelConfig: vi.fn(),
          saveAgentModelConfig: vi.fn()
        },
        dataManage: { exportData: vi.fn() }
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: { state }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(0).trigger('click')
    await wrapper.find('.mobile-api-lite-button').trigger('click')
    await wrapper.find('select').setValue('deepseek')

    expect(wrapper.find('input[placeholder="如 DeepSeek"]').element.value).toBe('DeepSeek')
    expect(wrapper.find('input[placeholder="https://api.deepseek.com"]').element.value).toBe('https://api.deepseek.com')
  })

  it('keeps the mobile draft default preset through parent refreshes until saving', async () => {
    const setDefaultPreset = vi.fn()
    const apiConfig = {
      sections: {},
      apiPresets: [
        { id: 'deepseek', name: 'DeepSeek', providerType: 'deepseek', baseUrl: 'https://api.deepseek.com', hasApiKey: true },
        { id: 'xiaoyi', name: '小忆', providerType: 'openai-compatible', baseUrl: 'https://xiaoyi.invalid', hasApiKey: true }
      ],
      apiProviderTemplates: [],
      defaultPresetName: '',
      aiProviderMode: 'custom',
      apiPresetCount: 2,
      currentApiPresetIndex: 1,
      apiPresetForm: {
        originalName: '小忆',
        name: '小忆',
        providerType: 'openai-compatible',
        apiUrl: 'https://xiaoyi.invalid',
        apiKey: '',
        hasApiKey: true,
        model: ''
      },
      showEditApiPreset: true,
      isLoadingModels: false,
      isTestingApi: false,
      modelList: [],
      weatherApiKey: '',
      weatherApiDomain: '',
      agentModelConfigs: []
    }
    const state = createState({
      panelViewModels: { apiConfig },
      panelActions: {
        cloudSync: { refreshCloudSaves: vi.fn() },
        apiConfig: {
          setAiProviderMode: vi.fn(),
          testApiConnection: vi.fn(),
          loadApiPreset: vi.fn(),
          addNewApiPreset: vi.fn(),
          updateApiPresetForm: vi.fn(),
          loadModels: vi.fn(),
          saveApiPreset: vi.fn(),
          setDefaultPreset,
          deleteCurrentApiPreset: vi.fn(),
          updateWeatherApiKey: vi.fn(),
          updateWeatherApiDomain: vi.fn(),
          saveWeatherApiConfig: vi.fn(),
          updateAgentModelConfig: vi.fn(),
          saveAgentModelConfig: vi.fn()
        },
        dataManage: { exportData: vi.fn() }
      }
    })
    const wrapper = mount(MobileWorkspaceShell, {
      props: { state }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(0).trigger('click')
    await wrapper.findAll('.mobile-api-preset-row').at(0).trigger('click')

    const setDefaultButton = wrapper.findAll('.mobile-api-inline-actions .mobile-api-lite-button')
      .find((button) => button.text().includes('设为默认'))
    expect(setDefaultButton).toBeTruthy()
    await setDefaultButton.trigger('click')
    expect(wrapper.find('section[aria-label="模型预设"]').text()).toContain('默认：DeepSeek')

    await wrapper.setProps({
      state: createState({
        panelViewModels: {
          apiConfig: {
            ...apiConfig,
            apiPresetForm: { ...apiConfig.apiPresetForm }
          }
        },
        panelActions: state.panelActions
      })
    })
    await nextTick()
    expect(wrapper.find('section[aria-label="模型预设"]').text()).toContain('默认：DeepSeek')

    await wrapper.find('.mobile-api-primary-button').trigger('click')
    expect(setDefaultPreset).toHaveBeenCalledWith('DeepSeek')
  })

  it('shows the local agent model configuration', async () => {
    const wrapper = mount(MobileWorkspaceShell, {
      props: {
        state: createState()
      }
    })

    await wrapper.findAll('.mobile-glass-nav__item').at(3).trigger('click')
    await wrapper.findAll('.mobile-me-secondary-action').at(0).trigger('click')
    await wrapper.findAll('.mobile-api-tabs button').at(1).trigger('click')

    const agentSection = wrapper.find('.mobile-api-section')
    expect(agentSection.exists()).toBe(true)
    expect(agentSection.text()).toContain('加载模型')
    expect(agentSection.text()).toContain('编目')
  })

})
