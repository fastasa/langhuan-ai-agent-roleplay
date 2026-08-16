import { watch, onMounted, onUnmounted } from 'vue'

import { createLocalWorkspaceServerSync } from '../../app/localWorkspaceServerSync'
import { createWorkspaceLifecycleRuntime } from './workspaceLifecycleRuntime'
import { normalizeAiProviderType } from '../../../shared/aiProviders'
import { getLocalWorkspaceStorageKey } from '../../app/localWorkspace'
import { normalizeCharacterReplyPipelineModeOverride } from '../../app/chatReplyPipelineMode'

export function useWorkspaceLifecycle({
  showCharacterEditor,
  currentCharacter,
  charEditForm,
  normalizeAvatarUrl,
  showDetailSettings,
  showScheduleEditor,
  showRelationshipEditor,
  showYearlyScheduleEditor,
  showActivitiesEditor,
  showLocationsEditor,
  affectionLocked,
  showUserEditor,
  charStore,
  userForm,
  handleClickOutside,
  settingStore,
  settingEnvironmentService,
  autoSyncTime,
  updateCurrentTimeSilent,
  loadWeatherConfig,
  resourceStore,
  taskStore,
  loadApiPreset,
  apiPresetForm,
  currentApiPresetIndex,
  loadCustomTags,
  loadEventStack,
  resetEditingCharacter,
  toast,
  stopTaskTimerUpdate,
  workspaceKernel,
  workspaceBootSession,
  workspaceRuntimeStore
}: any) {
  const API_PRESET_DRAFT_KEY = 'langhuan_api_preset_draft'
  const API_PRESET_INDEX_KEY = 'langhuan_api_preset_index'
  const getApiPresetDraftKey = () => getLocalWorkspaceStorageKey(API_PRESET_DRAFT_KEY)
  const getApiPresetIndexKey = () => getLocalWorkspaceStorageKey(API_PRESET_INDEX_KEY)

  function resolveCharacterGroupId(character: any) {
    return String(character?.groupId ?? character?.group_id ?? character?.group ?? '').trim()
  }

  function hydrateCharacterEditForm(character: any) {
    if (!character) return
    Object.assign(charEditForm, {
      id: character.id || '',
      name: character.name || '', emoji: character.emoji || '', gender: character.gender || '',
      age: character.age || 0, affection: character.affection || 0, group: resolveCharacterGroupId(character),
      desc: character.desc || '', appearance: character.appearance || '',
      speakingStyle: character.speakingStyle || character.speaking_style || '', outfit: character.outfit || '',
      personality: character.personality || '', hobbies: character.hobbies || '',
      abilities: character.abilities || '', experience: character.experience || '',
      worldview: character.worldview || '', background: character.background || '',
      nicknames: Array.isArray(character.nicknames) ? [...character.nicknames] : String(character.nicknames || '').split(/[,\n，]/).map((item: string) => item.trim()).filter(Boolean),
      defaultPreset: character.defaultPreset || character.default_preset || '',
      defaultModel: character.defaultModel || character.default_model || '',
      roleTemperature: character.roleTemperature ?? character.role_temperature ?? '',
      roleMaxTokens: character.roleMaxTokens ?? character.role_max_tokens ?? '',
      roleThinking: character.roleThinking || character.role_thinking || '',
      replyPipelineModeOverride: normalizeCharacterReplyPipelineModeOverride(character.replyPipelineModeOverride ?? character.reply_pipeline_mode_override),
      schedule: character.schedule ? JSON.parse(JSON.stringify(character.schedule)) : null,
      relationships: character.relationships ? JSON.parse(JSON.stringify(character.relationships)) : {},
      yearlySchedule: Array.isArray(character.yearlySchedule) ? JSON.parse(JSON.stringify(character.yearlySchedule)) : [],
      currentActivities: Array.isArray(character.currentActivities) ? [...character.currentActivities] : [],
      locations: Array.isArray(character.locations) ? [...character.locations] : [],
      avatar: character.avatarPath ? normalizeAvatarUrl(character.avatarPath) : ''
    })
  }

  function restoreApiPresetDraft() {
    try {
      const draftStorageKey = getApiPresetDraftKey()
      const savedDraft = localStorage.getItem(draftStorageKey)
      if (!savedDraft) return
      const parsed = JSON.parse(savedDraft)
      if (parsed && typeof parsed === 'object') {
        const currentName = String(apiPresetForm?.name || '').trim()
        const draftName = String(parsed.name || '').trim()
        if (currentName && draftName && currentName !== draftName) {
          localStorage.setItem(draftStorageKey, JSON.stringify(apiPresetForm))
          return
        }
        parsed.providerType = normalizeAiProviderType(parsed.providerType || parsed.provider_type)
        Object.assign(apiPresetForm, parsed)
        if (settingStore.drafts) {
          settingStore.drafts.apiPresetDraft = { ...parsed }
        }
      }
    } catch (err) {
      console.warn('恢复 API 配置草稿失败:', err)
    }
  }

  const localWorkspaceServerSync = createLocalWorkspaceServerSync({
    workspaceKernel,
    workspaceBootSession,
    workspaceRuntimeStore
  })

  function readStoredApiPresetIndex() {
    const savedIndexRaw = Number(localStorage.getItem(getApiPresetIndexKey()))
    const savedIndex = Number.isInteger(savedIndexRaw) ? savedIndexRaw : 0
    return savedIndex >= 0 && savedIndex < settingStore.apiPresets.length ? savedIndex : 0
  }

  watch(() => Boolean(showCharacterEditor?.value), (val) => {
    const activeCharacter = currentCharacter?.value
    if (val && activeCharacter) {
      hydrateCharacterEditForm(activeCharacter)
      if (showDetailSettings) showDetailSettings.value = false
      if (showScheduleEditor) showScheduleEditor.value = false
      if (showRelationshipEditor) showRelationshipEditor.value = false
      if (showYearlyScheduleEditor) showYearlyScheduleEditor.value = false
      if (showActivitiesEditor) showActivitiesEditor.value = false
      if (showLocationsEditor) showLocationsEditor.value = false
      if (affectionLocked) affectionLocked.value = true
      return
    }
    if (!val) {
      if (charEditForm && typeof charEditForm === 'object' && 'id' in charEditForm) {
        charEditForm.id = ''
      }
      resetEditingCharacter?.()
    }
  })

  watch(
    () => ({
      editorOpen: Boolean(showCharacterEditor?.value),
      characterId: String(currentCharacter?.value?.id || '').trim(),
      updatedAt: JSON.stringify(currentCharacter?.value || null)
    }),
    ({ editorOpen, characterId }) => {
      if (!editorOpen || !characterId) return
      if (String(charEditForm?.id || '').trim() !== characterId) return
      hydrateCharacterEditForm(currentCharacter?.value)
    }
  )

  watch(
    () => ({
      editorOpen: Boolean(showCharacterEditor?.value),
      characterId: String(currentCharacter?.value?.id || '').trim(),
      groupId: resolveCharacterGroupId(currentCharacter?.value)
    }),
    ({ editorOpen, characterId, groupId }) => {
      if (!editorOpen) return
      if (!characterId) return
      if (String(charEditForm?.id || '').trim() !== characterId) return
      if (String(charEditForm?.group || '').trim() === groupId) return
      charEditForm.group = groupId
    }
  )

  watch(() => Boolean(showUserEditor?.value), (val) => {
    if (val) {
      const u = charStore.userProfile
      Object.assign(userForm, {
        displayName: u.displayName || '',
        name: u.name || '', emoji: u.emoji || '', gender: u.gender || '',
        age: u.age || 0, desc: u.desc || '', appearance: u.appearance || '',
        personality: u.personality || '', outfit: u.outfit || '',
        hobbies: u.hobbies || '', abilities: u.abilities || '',
        experience: u.experience || '', worldview: u.worldview || '',
        background: u.background || '', avatarPath: u.avatarPath || ''
      })
    }
  })

  watch(() => ({ ...apiPresetForm }), (value) => {
    localStorage.setItem(getApiPresetDraftKey(), JSON.stringify(value))
    if (settingStore.drafts) {
      settingStore.drafts.apiPresetDraft = { ...value }
    }
  }, { deep: true })

  watch(currentApiPresetIndex, (value) => {
    localStorage.setItem(getApiPresetIndexKey(), String(value ?? 0))
    if (settingStore.drafts) {
      settingStore.drafts.selectedApiPresetIndex = Number(value ?? 0)
    }
  })

  const runtimeLifecycle = createWorkspaceLifecycleRuntime({
    handleClickOutside,
    settingStore,
    settingEnvironmentService,
    autoSyncTime,
    updateCurrentTimeSilent,
    loadWeatherConfig,
    localWorkspaceServerSync,
    workspaceBootSession,
    loadApiPreset,
    restoreApiPresetDraft,
    readStoredApiPresetIndex,
    toast,
    stopTaskTimerUpdate
  })

  onMounted(runtimeLifecycle.mount)
  onUnmounted(runtimeLifecycle.unmount)
}
