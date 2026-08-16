import { computed, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/app/chatProjection.ts', () => ({
  createChatProjection: () => ({
    chatPanelViewModel: computed(() => ({ activeChatTargetId: 'char_1', displayMessages: [] })),
    displayMessages: computed(() => []),
    loadedSummaryBadges: computed(() => [])
  })
}))

vi.mock('../../../src/app/settingsProjection.ts', () => ({
  createSettingsProjection: () => ({
    settingsPanelViewModel: computed(() => ({}))
  })
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  getChatSessionBoundAlias: () => '',
  getChatStoreActiveTargetId: (chatStore) => chatStore?.currentChatTarget ?? 'char_1',
  getChatStoreCurrentSession: (chatStore) => chatStore?.currentSession?.value ?? chatStore?.currentSession ?? null,
  normalizeChatTargetId: (targetId) => String(targetId || '').trim(),
  normalizeChatSessionCharacterParticipants: (session) => {
    const participants = Array.isArray(session?.participants) ? session.participants : []
    return participants
      .map((item, index) => ({
        characterId: String(item?.participantTargetId ?? item?.targetId ?? item?.id ?? '').trim(),
        displayOrder: Number(item?.displayOrder ?? index)
      }))
      .filter((item) => item.characterId)
  },
  getChatSessionVirtualScene: (session) => ({
    virtualSceneName: session?.virtualSceneName ?? session?.virtual_scene_name ?? '',
    virtualSceneDesc: session?.virtualSceneDesc ?? session?.virtual_scene_desc ?? '',
    virtualLocation: session?.virtualLocation ?? session?.virtual_location ?? '',
    virtualLocationLarge: session?.virtualLocationLarge ?? session?.virtual_location_large ?? '',
    virtualLocationMiddle: session?.virtualLocationMiddle ?? session?.virtual_location_middle ?? '',
    virtualLocationSmall: session?.virtualLocationSmall ?? session?.virtual_location_small ?? '',
    virtualRealLocation: session?.virtualRealLocation ?? session?.virtual_real_location ?? '',
    virtualTime: session?.virtualTime ?? session?.virtual_time ?? '',
    virtualTimeAnchor: session?.virtualTimeAnchor ?? session?.virtual_time_anchor ?? 0,
    virtualTimeBase: session?.virtualTimeBase ?? session?.virtual_time_base ?? 0,
    virtualTimeRate: session?.virtualTimeRate ?? session?.virtual_time_rate ?? 1,
    virtualWeather: session?.virtualWeather ?? session?.virtual_weather ?? '',
    virtualWeatherMode: session?.virtualWeatherMode ?? session?.virtual_weather_mode ?? 'real'
  }),
  getChatSessionVirtualSceneName: (session) => session?.virtualSceneName ?? session?.virtual_scene_name ?? '',
  getChatSessionVirtualSceneDesc: (session) => session?.virtualSceneDesc ?? session?.virtual_scene_desc ?? ''
}))

describe('useAppDerivedState', () => {
  it('未分组角色只应包含没有分组或默认分组的角色', async () => {
    const { useAppDerivedState } = await import('../../../src/composables/app/useAppDerivedState.ts')

    const result = useAppDerivedState({
      chatStore: {
        currentChatTarget: 'char_1',
        currentSession: null,
        currentMessages: []
      },
      charStore: {
        aliases: [],
        characters: [
          { id: 'char_1', name: '陈星依', groupId: 'group_a' },
          { id: 'char_2', name: '惊稚', group: 'group_b' },
          { id: 'char_3', name: '塞西莉亚', group_id: 'default' },
          { id: 'char_4', name: '奥黛丽' }
        ],
        getCharacter: vi.fn((id) => ({ id, name: id }))
      },
      resourceStore: {
        tickets: [],
        categories: []
      },
      taskStore: {
        tasks: [],
        getTaskElapsedTime: vi.fn(() => 0)
      },
      settingStore: {},
      getTargetName: vi.fn(() => '温暖大家庭'),
      normalizeAvatarUrl: vi.fn((url) => url)
    })

    expect(result.ungroupedCharacters.value.map((item) => item.id)).toEqual(['char_3', 'char_4'])
  })

  it('提及候选只列当前会话成员（多人会话读 participants）', async () => {
    const { ref } = await import('vue')
    const { useAppDerivedState } = await import('../../../src/composables/app/useAppDerivedState.ts')

    const result = useAppDerivedState({
      chatStore: {
        currentChatTarget: 'group_room',
        currentSession: ref({
          id: 'session_group',
          targetId: 'group_room',
          participants: [
            { participantTargetId: 'char_1', displayOrder: 0 },
            { participantTargetId: 'char_2', displayOrder: 1 }
          ]
        }),
        currentMessages: []
      },
      charStore: {
        aliases: [],
        characters: [
          { id: 'char_1', name: '陈星依' },
          { id: 'char_2', name: '惊稚' },
          { id: 'char_other', name: '不在会话里的角色' }
        ],
        getCharacter: vi.fn((id) => ({ id, name: id }))
      },
      resourceStore: { tickets: [], categories: [] },
      taskStore: { tasks: [], getTaskElapsedTime: vi.fn(() => 0) },
      settingStore: {},
      getTargetName: vi.fn(() => '温暖大家庭'),
      normalizeAvatarUrl: vi.fn((url) => url)
    })

    expect(result.filteredAtCharacters.value.map((item) => item.id)).toEqual(['char_1', 'char_2'])
  })

  it('提及候选在单聊无 participants 时按主目标兜底', async () => {
    const { ref } = await import('vue')
    const { useAppDerivedState } = await import('../../../src/composables/app/useAppDerivedState.ts')

    const result = useAppDerivedState({
      chatStore: {
        currentChatTarget: 'char_2',
        currentSession: ref({ id: 'session_single', targetId: 'char_2' }),
        currentMessages: []
      },
      charStore: {
        aliases: [],
        characters: [
          { id: 'char_1', name: '陈星依' },
          { id: 'char_2', name: '惊稚' }
        ],
        getCharacter: vi.fn((id) => ({ id, name: id }))
      },
      resourceStore: { tickets: [], categories: [] },
      taskStore: { tasks: [], getTaskElapsedTime: vi.fn(() => 0) },
      settingStore: {},
      getTargetName: vi.fn(() => '惊稚'),
      normalizeAvatarUrl: vi.fn((url) => url)
    })

    expect(result.filteredAtCharacters.value.map((item) => item.id)).toEqual(['char_2'])
  })

  it('当前场景支持 1970 年以前的帷幕时间', async () => {
    const { ref } = await import('vue')
    const { parseVirtualSceneInput } = await import('../../../src/utils/virtualScene.ts')
    const { useAppDerivedState } = await import('../../../src/composables/app/useAppDerivedState.ts')
    const earlyBase = parseVirtualSceneInput('0091-05-07T10:20:30')

    const result = useAppDerivedState({
      chatStore: {
        currentChatTarget: 'char_1',
        currentSession: ref({
          id: 'session_early',
          targetId: 'char_1',
          virtualTime: '0091-05-07T10:20:30',
          virtualTimeBase: earlyBase,
          virtualTimeAnchor: Date.now(),
          virtualTimeRate: 0
        }),
        currentMessages: []
      },
      charStore: {
        aliases: [],
        characters: [],
        getCharacter: vi.fn(() => null)
      },
      resourceStore: {
        tickets: [],
        categories: []
      },
      taskStore: {
        tasks: [],
        getTaskElapsedTime: vi.fn(() => 0)
      },
      settingStore: {
        currentTime: '2026年5月11日 周一 13:00:00',
        currentWeather: '晴',
        currentLocation: '现实地点'
      },
      getTargetName: vi.fn(() => '温暖大家庭'),
      normalizeAvatarUrl: vi.fn((url) => url)
    })

    await nextTick()

    expect(result.currentScene.value).toEqual(expect.objectContaining({
      time: '0091年5月7日 周一 10:20:30',
      usesVirtualTime: true
    }))
  })
})
