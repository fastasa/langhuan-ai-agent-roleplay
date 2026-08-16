/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import AppRoleModals from '../../../src/components/app/modals/character/AppRoleModals.vue'
import { OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT } from '../../../src/app/chatImageAvatarAssignment.ts'

function createRoleModalState() {
  return {
    showCrowdEditor: ref(false),
    editingCrowdId: ref(''),
    showCurtainPanel: ref(false),
    showSceneEditor: ref(false),
    showAliasEditor: ref(false),
    editingAliasId: ref(''),
    showAliasSelector: ref(false),
    showCreateGroup: ref(false),
    editingGroupId: ref(''),
    showGroupEditor: ref(true),
    showCharacterEditor: ref(false),
    viewModel: {
      apiPresets: [],
      characters: [
        { id: 'char_1', name: '陈星依', emoji: '依', avatarPath: '' },
        { id: 'char_2', name: '惊雨', emoji: '雨', avatarPath: '' },
        { id: 'char_3', name: '奥黛丽', emoji: '奥', avatarPath: '' }
      ],
      aliases: [],
      currentAlias: null,
      currentBoundAlias: ref(''),
      currentScene: {},
      currentSession: { id: 'session_1' },
      userProfile: { name: '用户', emoji: '用', avatarPath: '' }
    },
    characterGroups: [],
    crowdForm: {
      emoji: '',
      name: '',
      nickname: '',
      apiPreset: '',
      members: [],
      locations: '',
      groupId: ''
    },
    aliasForm: {
      name: '',
      emoji: '',
      avatarPath: '',
      prompt: '',
      description: ''
    },
    groupForm: {
      emoji: '',
      avatarPath: '',
      name: '',
      members: [],
      groupId: ''
    },
    groupEditForm: {
      mode: 'edit',
      sessionId: 'session_1',
      targetId: 'session_1',
      id: 'session_1',
      name: '测试会话',
      emoji: '会',
      avatarPath: '',
      members: [{ characterId: 'char_1', probability: 80 }],
      groupId: '',
      boundAlias: '',
      narrationFrequency: 'standard',
      narrationTemperature: 'standard',
      narrationProfiles: [],
      narrationForceEnabled: false,
      chatFontScale: 1,
      replyPipelineMode: 'normal_recall'
    },
    sceneForm: {
      locationLarge: '',
      locationMiddle: '',
      locationSmall: '',
      realLocation: '',
      time: '',
      weather: '',
      weatherMode: 'real',
      timeRate: 1
    },
    getWeatherEmoji: () => '',
    saveCrowd: () => {},
    deleteCrowd: () => {},
    saveScene: () => {},
    saveAlias: () => {},
    deleteAlias: () => {},
    saveGroup: () => {},
    deleteGroup: () => {},
    saveGroupEdit: () => {},
    assignImageAvatar: async () => true,
    toast: () => {}
  }
}

function mountRoleModals(state = createRoleModalState()) {
  return mount(AppRoleModals, {
    props: { state },
    global: {
      stubs: {
        AppFormDialog: {
          props: ['open', 'title'],
          template: `
            <section v-if="open" class="app-form-dialog-stub">
              <h2>{{ title }}</h2>
              <slot />
              <footer><slot name="actions" /></footer>
            </section>
          `
        },
        CharacterProfileDialog: true,
        PhotoCropDialog: true,
        SessionTemporaryCharactersPanel: true
      }
    }
  })
}

describe('AppRoleModals session member dialog', () => {
  it('会话设置不再保留与剧本总览重复的帷幕设置入口', () => {
    const wrapper = mountRoleModals()
    expect(wrapper.findAll('.session-entry').some((entry) => entry.text().includes('帷幕设置'))).toBe(false)
    wrapper.unmount()
  })

  it('收到聊天图片请求后展示当前会话、角色与马甲目标选择卡', async () => {
    const state = createRoleModalState()
    state.viewModel.aliases.push({ id: 'alias_1', name: '剑士马甲', emoji: '剑' })
    const wrapper = mountRoleModals(state)

    window.dispatchEvent(new CustomEvent(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, {
      detail: { imageUrl: '/chat-images/avatar.png' }
    }))
    await nextTick()

    expect(wrapper.text()).toContain('设置为头像')
    expect(wrapper.text()).toContain('当前会话')
    expect(wrapper.text()).toContain('陈星依')
    expect(wrapper.text()).toContain('剑士马甲')
    wrapper.unmount()
  })

  it('adds multiple characters with per-character probabilities in one dialog save', async () => {
    const state = createRoleModalState()
    const wrapper = mountRoleModals(state)

    await wrapper.get('.session-member-footer .session-add-member').trigger('click')
    await nextTick()

    const picks = wrapper.findAll('.session-character-pick')
    expect(picks[0].attributes('disabled')).toBeDefined()

    await picks[1].trigger('click')
    await picks[2].trigger('click')
    await nextTick()

    const probabilityInputs = wrapper.findAll('.session-selected-member-row input')
    await probabilityInputs[0].setValue('60')
    await probabilityInputs[1].setValue('30')

    const addButton = wrapper.findAll('button').find((button) => button.text() === '添加')
    await addButton.trigger('click')

    expect(state.groupEditForm.members).toEqual([
      { characterId: 'char_1', probability: 80 },
      {
        characterId: 'char_2', probability: 60, characterStateMode: 'follow_main', characterBranchId: '', sourceSnapshotId: ''
      },
      {
        characterId: 'char_3', probability: 30, characterStateMode: 'follow_main', characterBranchId: '', sourceSnapshotId: ''
      }
    ])
  })

  it('defaults to follow-main and exposes snapshot source only after choosing an independent copy', async () => {
    const state = createRoleModalState()
    const wrapper = mountRoleModals(state)

    await wrapper.get('.session-member-footer .session-add-member').trigger('click')
    await nextTick()
    await wrapper.findAll('.session-character-pick')[1].trigger('click')
    await nextTick()

    const row = wrapper.get('.session-selected-member-row')
    const modeSelect = row.get('.session-selected-member-state select')
    expect(modeSelect.element.value).toBe('follow_main')
    expect(row.text()).not.toContain('只写本会话')

    await modeSelect.setValue('independent_snapshot')
    await nextTick()

    expect(row.findAll('.session-selected-member-state select')).toHaveLength(2)
    expect(row.text()).toContain('只写本会话')
  })
})
