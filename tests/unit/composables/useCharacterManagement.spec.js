import { reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCharacterImportSource, useCharacterManagement } from '../../../src/composables/app/useCharacterManagement.ts'

function createContext(overrides = {}) {
  const characters = [
    { id: 'char-1', name: '小依', emoji: '👧', avatarPath: '/avatar.png' }
  ]

  return {
    charStore: {
      characters,
      getCharacter: vi.fn((id) => characters.find((item) => item.id === id) || null),
      updateCharacter: vi.fn(async () => {}),
      deleteCharacter: vi.fn(async () => {})
    },
    chatStore: {
      currentChatTarget: 'char-1',
      switchChat: vi.fn()
    },
    settingStore: {},
    currentCharacter: ref(null),
    showAddCharacter: ref(false),
    newCharForm: reactive({}),
    charEditForm: reactive({
      id: 'char-1',
      name: '小依',
      emoji: '👧',
      gender: '',
      age: 18,
      affection: 50,
      group: '',
      desc: '',
      appearance: '',
      speakingStyle: '',
      outfit: '',
      personality: '',
      hobbies: '',
      abilities: '',
      experience: '',
      worldview: '',
      background: '',
      nicknames: [],
      defaultPreset: '',
      defaultModel: '',
      ttsVoice: '',
      schedule: null,
      relationships: {},
      yearlySchedule: [],
      currentActivities: [],
      locations: [],
      avatar: ''
    }),
    collapsedDays: reactive({}),
    copyingFromDay: ref(''),
    copyingSlot: ref(null),
    copyTargetDays: ref([]),
    showCopySlotDialog: ref(false),
    newRelationshipTarget: ref(''),
    newNicknameInput: ref(''),
    newActivityInput: ref(''),
    newLocationInput: ref(''),
    showCharacterEditor: ref(true),
    showCurtainPanel: ref(false),
    showSceneEditor: ref(false),
    sceneForm: reactive({}),
    showAliasSelector: ref(false),
    showAliasEditor: ref(false),
    editingAliasId: ref(null),
    aliasForm: reactive({}),
    newGroupName: ref(''),
    newGroupEmoji: ref(''),
    editingGroupId: ref(null),
    groupForm: reactive({}),
    groupEditForm: reactive({}),
    showCreateGroup: ref(false),
    showGroupEditor: ref(false),
    editingCrowdId: ref(null),
    crowdForm: reactive({}),
    showCrowdEditor: ref(false),
    toast: vi.fn(),
    ...overrides
  }
}

describe('useCharacterManagement', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalCreateElement = document.createElement.bind(document)

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:character-json')
    URL.revokeObjectURL = vi.fn()
  })

  it('识别完整角色格式并把同一快照状态白名单还原到导入源', () => {
    const resolved = resolveCharacterImportSource({
      format: 'langhuan_character_complete_v1',
      identity: { name: '星依', emoji: '✨' },
      configuration: { defaultPreset: 'preset_a' },
      snapshot: {
        state: {
          desc: '完整简介',
          brainDocuments: { soul: '灵魂正文' },
          brainTraceNodes: [{ id: 'trace_1' }],
          name: '不能从 state 覆盖身份'
        }
      }
    })

    expect(resolved.isCompleteExport).toBe(true)
    expect(resolved.source).toEqual(expect.objectContaining({
      name: '星依',
      defaultPreset: 'preset_a',
      desc: '完整简介',
      brainDocuments: { soul: '灵魂正文' },
      brainTraceNodes: [{ id: 'trace_1' }]
    }))
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    document.createElement = originalCreateElement
  })

  it('当前角色引用为空时，仍然会使用编辑会话里的角色 id 保存', async () => {
    const ctx = createContext()
    const management = useCharacterManagement(ctx)

    await management.saveCharacterEdit()

    expect(ctx.charStore.updateCharacter).toHaveBeenCalledWith(
      'char-1',
      expect.objectContaining({ name: '小依' })
    )
  })

  it('当前角色引用为空时，仍然可以导出编辑中的角色 JSON', () => {
    const clicked = vi.fn()
    document.createElement = vi.fn((tagName) => {
      if (tagName === 'a') {
        return { click: clicked, href: '', download: '' }
      }
      return originalCreateElement(tagName)
    })
    const ctx = createContext()
    const management = useCharacterManagement(ctx)

    management.exportCurrentCharacterJson()

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clicked).toHaveBeenCalled()
  })

  it('删除角色确认弹窗会使用角色资料链路的高尺寸设置', () => {
    const openConfirmDialog = vi.fn()
    const ctx = createContext({ openConfirmDialog })
    const management = useCharacterManagement(ctx)

    management.deleteCurrentCharacter()

    expect(openConfirmDialog).toHaveBeenCalledWith(
      '删除角色',
      '确定删除该角色吗？此操作不可撤销。',
      expect.any(Function),
      { size: 'md', heightPreset: 'tall' }
    )
  })

  it('确认删除角色后会等待仓储删除完成再切走并提示成功', async () => {
    let confirmCallback
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => {
      confirmCallback = onConfirm
    })
    let resolveDelete
    const deleteCharacter = vi.fn(() => new Promise((resolve) => {
      resolveDelete = resolve
    }))
    const ctx = createContext({
      openConfirmDialog,
      charStore: {
        characters: [{ id: 'char-1', name: '小依', emoji: '👧', avatarPath: '/avatar.png' }],
        getCharacter: vi.fn(() => ({ id: 'char-1', name: '小依' })),
        updateCharacter: vi.fn(async () => {}),
        deleteCharacter
      }
    })
    const management = useCharacterManagement(ctx)

    management.deleteCurrentCharacter()
    const pending = confirmCallback()

    expect(deleteCharacter).toHaveBeenCalledWith('char-1')
    expect(ctx.chatStore.switchChat).not.toHaveBeenCalled()
    expect(ctx.showCharacterEditor.value).toBe(true)

    resolveDelete()
    await pending

    expect(ctx.chatStore.switchChat).toHaveBeenCalledWith('')
    expect(ctx.showCharacterEditor.value).toBe(false)
    expect(ctx.toast).toHaveBeenCalledWith('角色已删除', 'success')
  })

  it('删除角色失败时不会关闭编辑弹窗或提示假成功', async () => {
    let confirmCallback
    const openConfirmDialog = vi.fn((_title, _message, onConfirm) => {
      confirmCallback = onConfirm
    })
    const ctx = createContext({
      openConfirmDialog,
      charStore: {
        characters: [{ id: 'char-1', name: '小依', emoji: '👧', avatarPath: '/avatar.png' }],
        getCharacter: vi.fn(() => ({ id: 'char-1', name: '小依' })),
        updateCharacter: vi.fn(async () => {}),
        deleteCharacter: vi.fn(async () => {
          throw new Error('delete failed')
        })
      }
    })
    const management = useCharacterManagement(ctx)

    management.deleteCurrentCharacter()
    await confirmCallback()

    expect(ctx.chatStore.switchChat).not.toHaveBeenCalled()
    expect(ctx.showCharacterEditor.value).toBe(true)
    expect(ctx.toast).toHaveBeenCalledWith('删除角色失败：delete failed', 'error')
  })

  it('场景保存优先使用当前会话 id 持久化帷幕字段', () => {
    const ctx = createContext({
      chatStore: {
        current: {
          currentChatTarget: ref('char-2'),
          currentSession: ref({
            id: 'session-2',
            targetId: 'char-2',
            virtualSceneName: '旧场景',
            virtualLocation: '旧地点'
          }),
          getActiveTargetId: vi.fn(() => 'char-2'),
          getCurrentSession: vi.fn(() => ({
            id: 'session-2',
            targetId: 'char-2',
            virtualSceneName: '旧场景',
            virtualLocation: '旧地点'
          }))
        },
        currentChatTarget: 'char-1',
        updateSession: vi.fn(),
        switchChat: vi.fn()
      },
      sceneForm: reactive({
        name: '新场景',
        desc: '描述',
        locationLarge: '德文郡',
        locationMiddle: '旧宅',
        locationSmall: '新地点',
        location: '新地点',
        time: '2026-04-03T12:30',
        timeRate: 2,
        weather: '晴',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    management.saveScene()

    expect(ctx.chatStore.updateSession).toHaveBeenCalledWith('session-2', expect.objectContaining({
      virtualSceneName: '',
      virtualSceneDesc: '',
      virtualLocationLarge: '德文郡',
      virtualLocationMiddle: '旧宅',
      virtualLocationSmall: '新地点',
      virtualLocation: '德文郡 / 旧宅 / 新地点'
    }))
  })

  it('会话编辑弹窗里的帷幕草稿保存会写入当前编辑会话', async () => {
    const ctx = createContext({
      chatStore: {
        current: {
          currentChatTarget: ref('char-2'),
          currentSession: ref({ id: 'session-current', targetId: 'char-2' }),
          getActiveTargetId: vi.fn(() => 'char-2'),
          getCurrentSession: vi.fn(() => ({ id: 'session-current', targetId: 'char-2' }))
        },
        currentChatTarget: 'char-1',
        updateSession: vi.fn(),
        switchChat: vi.fn()
      },
      groupEditForm: reactive({ sessionId: 'session-editing' }),
      sceneForm: reactive({
        name: '编辑中帷幕',
        desc: '会话编辑弹窗保存',
        locationLarge: '维斯珂',
        locationMiddle: '档案区',
        locationSmall: '档案室',
        location: '档案室',
        time: '2026-05-07T20:00',
        timeRate: 0,
        weather: '',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    const saved = await management.saveSessionSceneDraft()

    expect(saved).toBe(true)
    expect(ctx.chatStore.updateSession).toHaveBeenCalledWith('session-editing', expect.objectContaining({
      virtualSceneName: '',
      virtualSceneDesc: '',
      virtualLocationLarge: '维斯珂',
      virtualLocationMiddle: '档案区',
      virtualLocationSmall: '档案室',
      virtualLocation: '维斯珂 / 档案区 / 档案室',
      virtualTime: '2026-05-07T20:00',
      virtualTimeRate: 0
    }))
  })

  it('会话编辑保存不再写隐藏表情字段', async () => {
    const ctx = createContext({
      chatStore: {
        currentChatTarget: 'session-editing',
        updateSession: vi.fn(async () => {}),
        switchChat: vi.fn()
      },
      groupEditForm: reactive({
        mode: 'edit',
        sessionId: 'session-editing',
        targetId: 'session-editing',
        name: '编辑后的会话',
        emoji: '会',
        avatarPath: '',
        members: [{ characterId: 'char-1', probability: 80 }],
        boundAlias: '',
        narrationFrequency: 'standard',
        narrationTemperature: 'standard'
      }),
      sceneForm: reactive({
        name: '',
        desc: '',
        locationLarge: '',
        locationMiddle: '',
        locationSmall: '',
        location: '',
        realLocation: '',
        time: '',
        timeRate: 1,
        weather: '',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    await management.saveGroupEdit()

    const savedPatch = ctx.chatStore.updateSession.mock.calls[0][1]
    expect(savedPatch).not.toHaveProperty('conversationEmoji')
    expect(savedPatch).not.toHaveProperty('conversation_emoji')
  })

  it('会话编辑弹窗缺少编辑 sessionId 时回退当前会话持久化帷幕', async () => {
    const ctx = createContext({
      chatStore: {
        current: {
          currentChatTarget: ref('char-2'),
          currentSession: ref({ id: 'session-current', targetId: 'char-2' }),
          getActiveTargetId: vi.fn(() => 'char-2'),
          getCurrentSession: vi.fn(() => ({ id: 'session-current', targetId: 'char-2' }))
        },
        currentChatTarget: 'char-1',
        updateSession: vi.fn(),
        switchChat: vi.fn()
      },
      groupEditForm: reactive({ sessionId: '' }),
      sceneForm: reactive({
        name: '回退当前会话',
        desc: '',
        locationLarge: '',
        locationMiddle: '',
        locationSmall: '刷新验收',
        location: '刷新验收',
        time: '2026-05-07T20:17',
        timeRate: 1,
        weather: '',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    const saved = await management.saveSessionSceneDraft()

    expect(saved).toBe(true)
    expect(ctx.chatStore.updateSession).toHaveBeenCalledWith('session-current', expect.objectContaining({
      virtualSceneName: '',
      virtualSceneDesc: '',
      virtualLocationSmall: '刷新验收',
      virtualLocation: '刷新验收'
    }))
  })

  it('场景编辑不再把旧名称描述字段带回帷幕草稿', () => {
    const ctx = createContext({
      chatStore: {
        current: {
          currentChatTarget: ref('char-2'),
          currentSession: ref({
            virtual_scene_name: '旧场景',
            virtual_scene_desc: '旧描述',
            virtual_location_large: '德文郡',
            virtual_location_middle: '旧宅',
            virtual_location_small: '书房',
            virtual_time: '旧时间',
            virtual_weather: '小雨',
            virtual_weather_mode: 'custom'
          }),
          getActiveTargetId: vi.fn(() => 'char-2'),
          getCurrentSession: vi.fn(() => ({
            virtual_scene_name: '旧场景',
            virtual_scene_desc: '旧描述',
            virtual_location_large: '德文郡',
            virtual_location_middle: '旧宅',
            virtual_location_small: '书房',
            virtual_time: '旧时间',
            virtual_weather: '小雨',
            virtual_weather_mode: 'custom'
          }))
        },
        currentChatTarget: 'char-1',
        updateSession: vi.fn(),
        switchChat: vi.fn()
      },
      sceneForm: reactive({
        name: '',
        desc: '',
        location: '',
        locationLarge: '',
        locationMiddle: '',
        locationSmall: '',
        time: '',
        timeRate: 1,
        weather: '',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    management.openSceneEditor()

    expect(ctx.sceneForm.name).toBe('')
    expect(ctx.sceneForm.desc).toBe('')
    expect(ctx.sceneForm.locationLarge).toBe('德文郡')
    expect(ctx.sceneForm.locationMiddle).toBe('旧宅')
    expect(ctx.sceneForm.locationSmall).toBe('书房')
    expect(ctx.sceneForm.location).toBe('德文郡 / 旧宅 / 书房')
    expect(ctx.sceneForm.weather).toBe('小雨')
    expect(ctx.sceneForm.weatherMode).toBe('custom')
  })

  it('帷幕弹窗保存不再用隐藏旧地点字段兜底小地点', async () => {
    const ctx = createContext({
      chatStore: {
        current: {
          currentChatTarget: ref('char-2'),
          currentSession: ref({ id: 'session-current', targetId: 'char-2' }),
          getActiveTargetId: vi.fn(() => 'char-2'),
          getCurrentSession: vi.fn(() => ({ id: 'session-current', targetId: 'char-2' }))
        },
        currentChatTarget: 'char-1',
        updateSession: vi.fn(),
        switchChat: vi.fn()
      },
      groupEditForm: reactive({ sessionId: 'session-editing' }),
      sceneForm: reactive({
        name: '隐藏旧字段验收',
        desc: '',
        locationLarge: '',
        locationMiddle: '',
        locationSmall: '',
        location: '不应写入小地点',
        time: '',
        timeRate: 1,
        weather: '',
        weatherMode: 'real'
      })
    })
    const management = useCharacterManagement(ctx)

    const saved = await management.saveSessionSceneDraft()

    expect(saved).toBe(true)
    expect(ctx.chatStore.updateSession).toHaveBeenCalledWith('session-editing', expect.objectContaining({
      virtualLocationLarge: '',
      virtualLocationMiddle: '',
      virtualLocationSmall: '',
      virtualLocation: ''
    }))
  })

  it('保存角色编辑只走 updateCharacter 一次写入', async () => {
    const ctx = createContext({
      charStore: {
        characters: [{ id: 'char-1', name: '小依', personality: '旧性格' }],
        getCharacter: vi.fn(() => ({ id: 'char-1', name: '小依', personality: '旧性格' })),
        updateCharacter: vi.fn(async () => {}),
        deleteCharacter: vi.fn(async () => {})
      },
      charEditForm: reactive({
        id: 'char-1',
        name: '小依',
        age: 18,
        affection: 50,
        personality: '新性格：警觉但能回应善意。',
        nicknames: [],
        schedule: null,
        relationships: {},
        yearlySchedule: [],
        currentActivities: [],
        locations: []
      })
    })
    const management = useCharacterManagement(ctx)

    await management.saveCharacterEdit()

    expect(ctx.charStore.updateCharacter).toHaveBeenCalledTimes(1)
    expect(ctx.toast).toHaveBeenCalledWith('角色信息已更新', 'success')
  })
})
