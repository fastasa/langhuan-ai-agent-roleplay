<template>
  <div class="chat-main-header">
    <div class="chat-main-identity">
      <span class="chat-conversation-avatar" aria-hidden="true">
        <img v-if="resolvedConversationAvatar" :src="resolvedConversationAvatar" :alt="currentChatTitle">
        <span v-else>{{ resolvedConversationEmoji }}</span>
      </span>
      <div class="chat-main-title-stack">
        <div class="chat-main-title">
          <span class="chat-main-title-text">{{ currentChatTitle }}</span>
        </div>
        <div v-if="participantChips.length > 0" class="chat-participant-line" :aria-label="t('chat.participantAria')">
          <span class="chat-participant-label">{{ participantLabel }}</span>
          <span class="chat-participant-avatars" aria-hidden="true">
            <button
              v-for="member in visibleParticipantChips"
              :key="member.id"
              type="button"
              class="chat-participant-avatar"
              :class="{
                'chat-participant-avatar--lit': isMemberLit(member),
                'chat-participant-avatar--active': isMemberActive(member)
              }"
              :title="buildMemberTitle(member.name, isMemberLit(member), isMemberActive(member))"
            >
              <img v-if="member.avatar" :src="member.avatar" :alt="member.name">
              <span v-else>{{ member.emoji || member.name.slice(0, 1) }}</span>
            </button>
            <span
              v-if="hiddenParticipantCount > 0"
              class="chat-participant-avatar chat-participant-avatar--more"
              :title="t('chat.moreParticipants', { count: hiddenParticipantCount })"
            >...</span>
          </span>
        </div>
      </div>
    </div>
    <div class="chat-main-actions">
      <AppEnvironmentPills
        v-if="environmentPills"
        class="chat-header-environment"
        :view-model="environmentPills.viewModel"
        :is-loading-location="environmentPills.isLoadingLocation"
        :is-loading-weather="environmentPills.isLoadingWeather"
        :editing-location="environmentPills.editingLocation"
        :temp-location="environmentPills.tempLocation"
        :temp-location-large="environmentPills.tempLocationLarge"
        :temp-location-middle="environmentPills.tempLocationMiddle"
        :temp-location-small="environmentPills.tempLocationSmall"
        :show-weather-detail="environmentPills.showWeatherDetail"
        :weather-text="environmentPills.weatherText"
        :temperature-text="environmentPills.temperatureText"
        :time-rate="environmentPills.timeRate"
        :format-date-only="environmentPills.formatDateOnly"
        :format-time-only="environmentPills.formatTimeOnly"
        :format-obs-time="environmentPills.formatObsTime"
        :get-weather-icon="environmentPills.getWeatherIcon"
        @edit-location="environmentPills.editLocation"
        @save-location="environmentPills.saveLocation"
        @cancel-location-edit="environmentPills.cancelLocationEdit"
        @sync-weather="environmentPills.syncWeather"
        @toggle-scene-time-paused="environmentPills.toggleSceneTimePaused"
        @sync-time="environmentPills.syncTime"
        @toggle-weather-detail="environmentPills.toggleWeatherDetail"
        @close-weather-detail="environmentPills.closeWeatherDetail"
        @update:temp-location="environmentPills.updateTempLocation"
        @update:temp-location-large="environmentPills.updateTempLocationLarge?.($event)"
        @update:temp-location-middle="environmentPills.updateTempLocationMiddle?.($event)"
        @update:temp-location-small="environmentPills.updateTempLocationSmall?.($event)"
      />
      <button
        v-if="hasUnprojectedMessages || projectionBatchRunning"
        class="btn btn-small icon-btn chat-action-link chat-projection-lamp-btn"
        :class="{ 'chat-projection-lamp-btn--running': projectionBatchRunning }"
        :disabled="projectionBatchRunning"
        @click="runBatchProjection"
        :title="projectionLampTitle"
        :aria-label="projectionLampTitle"
      >
        <span class="chat-action-link-icon" aria-hidden="true">
          <svg class="line-icon chat-projection-lamp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18h6"></path>
            <path d="M10 22h4"></path>
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
          </svg>
        </span>
        <span class="chat-action-link-title">{{ projectionBatchRunning ? t('chat.projecting') : t('chat.batchProject') }}</span>
      </button>
      <!-- 2026-07-08：提示词日志/召回面板/人格模型观察三个头部入口已按用户要求撤下；
           提示词日志仍可从消息级「查看提示词日志」进入，移动端工具行入口不受影响。 -->
      <!-- 舆图：单击仍进入完整工作区；悬浮只读当前会话的同一份地图真值，并保留视角缩放/拖动。 -->
      <div
        class="chat-map-preview-anchor"
        :class="{ 'chat-map-preview-anchor--disabled': !hasActiveSession }"
        :title="mapViewerTitle"
        @pointerenter="openMapPreview"
        @pointerleave="scheduleMapPreviewClose"
        @focusin="openMapPreview"
        @focusout="scheduleMapPreviewClose"
        @keydown.esc.stop="closeMapPreview"
      >
        <button
          class="btn btn-small icon-btn chat-action-link"
          :disabled="!hasActiveSession"
          @click="$emit('open-map-viewer')"
          :title="mapViewerTitle"
          :aria-label="mapViewerTitle"
          :aria-expanded="hasActiveSession && mapPreviewOpen"
        >
          <span class="chat-action-link-icon" aria-hidden="true">
            <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"></path>
              <path d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2h3.17"></path>
              <path d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </span>
          <span class="chat-action-link-title">{{ t('chat.mapViewer') }}</span>
        </button>
        <div
          v-if="mapPreviewMounted && hasActiveSession"
          v-show="mapPreviewOpen"
          class="chat-map-preview-popover"
          @pointerenter="openMapPreview"
          @pointerleave="scheduleMapPreviewClose"
        >
          <MapHoverPreviewCard :session-id="activeSessionId" :active="mapPreviewOpen" />
        </div>
      </div>
      <!-- 剧本工作台：与舆图同级的对话级入口；右侧是现役剧本试验投影，左侧承接同一星依浮坞。 -->
      <button
        class="btn btn-small icon-btn chat-action-link"
        :disabled="!hasActiveSession"
        @click="$emit('open-script-workspace')"
        :title="scriptWorkspaceTitle"
        :aria-label="scriptWorkspaceTitle"
      >
        <span class="chat-action-link-icon" aria-hidden="true">
          <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"></path>
            <path d="M8 7h8M8 11h6"></path>
          </svg>
        </span>
        <span class="chat-action-link-title">{{ t('chat.scriptWorkspace') }}</span>
      </button>
      <!-- 状态系统（对话级）：无 sessionId 时保留入口但禁用，避免空库首开被误判为功能缺失。 -->
      <button
        class="btn btn-small icon-btn chat-action-link"
        :disabled="!hasActiveSession"
        @click="$emit('open-status-system-panel')"
        :title="statusSystemTitle"
        :aria-label="statusSystemTitle"
      >
        <span class="chat-action-link-icon" aria-hidden="true">
          <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <path d="M12 11h4"></path>
            <path d="M12 16h4"></path>
            <path d="M8 11h.01"></path>
            <path d="M8 16h.01"></path>
          </svg>
        </span>
        <span class="chat-action-link-title">{{ t('chat.statusSystem') }}</span>
      </button>
      <button class="btn btn-small icon-btn chat-action-link chat-note-entry-btn" @click="$emit('open-notes-panel')" :title="t('chat.notes')" :aria-label="t('chat.openNotesPanel')">
        <span class="chat-action-link-icon" aria-hidden="true">
          <svg class="line-icon chat-note-entry-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"></path>
            <path class="chat-note-entry-icon__spine" d="M2 6h4"></path>
            <path class="chat-note-entry-icon__spine" d="M2 10h4"></path>
            <path class="chat-note-entry-icon__spine" d="M2 14h4"></path>
            <path class="chat-note-entry-icon__spine" d="M2 18h4"></path>
            <path class="chat-note-entry-icon__pen" d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"></path>
          </svg>
        </span>
        <span class="chat-action-link-title">{{ t('chat.notes') }}</span>
      </button>
      <button
        class="btn btn-small icon-btn chat-action-link"
        :disabled="!canOpenSessionSettings"
        @click="openSessionSettings"
        :title="sessionSettingsTitle"
        :aria-label="sessionSettingsTitle"
      >
        <span class="chat-action-link-icon" aria-hidden="true">
          <svg class="line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 17H5"></path>
            <path d="M19 7h-9"></path>
            <circle cx="17" cy="17" r="3"></circle>
            <circle cx="7" cy="7" r="3"></circle>
          </svg>
        </span>
        <span class="chat-action-link-title">{{ t('common.settings') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatPanelViewModel, EnvironmentViewModel, PlannedGroupSpeakerViewModel } from '../../../types/panelContracts'
import { useWorkspaceRuntimeStore } from '../../../app/workspaceRuntimeStore'
import { useToast } from '../../../composables/useToast'
import { useSessionProjectionBatch } from '../../../composables/app/useSessionProjectionBatch'

type GroupMemberChip = {
  id: string
  name: string
  avatar: string
  emoji: string
}
type EnvironmentPillsConfig = {
  viewModel: Pick<EnvironmentViewModel, 'currentLocation' | 'currentLocationLarge' | 'currentLocationMiddle' | 'currentLocationSmall' | 'currentTime' | 'timeRate' | 'weatherDetail'>
  isLoadingLocation: boolean
  isLoadingWeather: boolean
  editingLocation: boolean
  tempLocation: string
  tempLocationLarge?: string
  tempLocationMiddle?: string
  tempLocationSmall?: string
  showWeatherDetail: boolean
  weatherText: string
  temperatureText: string
  timeRate?: number
  formatDateOnly: (s: string) => string
  formatTimeOnly: (s: string) => string
  formatObsTime: (s: string) => string
  getWeatherIcon: (iconCode: string) => string
  editLocation: () => void
  saveLocation: () => void
  cancelLocationEdit: () => void
  syncWeather: (locationOverride?: string) => void
  toggleSceneTimePaused: () => void
  syncTime: () => void
  toggleWeatherDetail: () => void
  closeWeatherDetail: () => void
  updateTempLocation: (value: string) => void
  updateTempLocationLarge?: (value: string) => void
  updateTempLocationMiddle?: (value: string) => void
  updateTempLocationSmall?: (value: string) => void
}

const { t } = useI18n()
const AppEnvironmentPills = defineAsyncComponent(() => import('../AppEnvironmentPills.vue'))
const MapHoverPreviewCard = defineAsyncComponent(() => import('../map/MapHoverPreviewCard.vue'))

const props = withDefaults(defineProps<{
  currentChatTitle: string
  environmentPills?: EnvironmentPillsConfig
  currentCharacter?: ChatPanelViewModel['currentCharacter']
  chatTarget: string
  conversationAvatar?: string
  conversationEmoji?: string
  groupMembers?: GroupMemberChip[]
  plannedSpeakers?: PlannedGroupSpeakerViewModel[]
  isTyping?: boolean
  streamingSpeakerName?: string
  canUseLocalTools?: boolean
  activeSessionId?: string
  currentMessages?: ChatPanelViewModel['currentMessages']
  replyPipelineMode?: string
}>(), {
  currentCharacter: null,
  conversationAvatar: '',
  conversationEmoji: '',
  groupMembers: () => [],
  plannedSpeakers: () => [],
  isTyping: false,
  streamingSpeakerName: '',
  canUseLocalTools: false,
  activeSessionId: '',
  currentMessages: () => [],
  replyPipelineMode: ''
})

const emit = defineEmits([
  'open-notes-panel',
  'open-map-viewer',
  'open-script-workspace',
  'open-status-system-panel',
  'open-character-editor',
  'open-session-settings',
  'edit-group',
  'edit-crowd'
])

// 批量投影灯泡：当前会话有未投影消息时出现，点击批量投影所有未投影消息。
const runtimeStore = useWorkspaceRuntimeStore()
const { toast } = useToast(runtimeStore)
const {
  hasUnprojected: hasUnprojectedMessages,
  unprojectedCount,
  running: projectionBatchRunning,
  runBatch: runBatchProjection
} = useSessionProjectionBatch({
  sessionId: () => String(props.activeSessionId || '').trim(),
  messages: () => (props.currentMessages || []) as Array<Record<string, unknown>>,
  isProjectionMode: () => {
    const mode = String(props.replyPipelineMode || '').trim()
    return mode === 'normal_recall' || mode === 'personality_model' || mode === 'fast_reply'
  },
  toast
})
const projectionLampTitle = computed(() => (
  projectionBatchRunning.value
    ? t('chat.projectingInProgress')
    : t('chat.batchProjectCount', { count: unprojectedCount.value })
))

const mapPreviewOpen = ref(false)
const mapPreviewMounted = ref(false)
let mapPreviewCloseTimer: ReturnType<typeof setTimeout> | null = null
const hasActiveSession = computed(() => Boolean(String(props.activeSessionId || '').trim()))
const mapViewerTitle = computed(() => hasActiveSession.value ? t('chat.openMapViewer') : t('chat.selectSessionFirst'))
const scriptWorkspaceTitle = computed(() => hasActiveSession.value ? t('chat.openScriptWorkspace') : t('chat.selectSessionFirst'))
const statusSystemTitle = computed(() => hasActiveSession.value ? t('chat.openStatusSystemPanel') : t('chat.selectSessionFirst'))

function cancelMapPreviewClose() {
  if (!mapPreviewCloseTimer) return
  clearTimeout(mapPreviewCloseTimer)
  mapPreviewCloseTimer = null
}

function openMapPreview() {
  if (!hasActiveSession.value) return
  cancelMapPreviewClose()
  mapPreviewMounted.value = true
  mapPreviewOpen.value = true
}

function scheduleMapPreviewClose() {
  cancelMapPreviewClose()
  mapPreviewCloseTimer = setTimeout(() => {
    mapPreviewCloseTimer = null
    mapPreviewOpen.value = false
  }, 160)
}

function closeMapPreview() {
  cancelMapPreviewClose()
  mapPreviewOpen.value = false
}

onBeforeUnmount(cancelMapPreviewClose)
watch(hasActiveSession, (available) => {
  if (available) return
  cancelMapPreviewClose()
  mapPreviewOpen.value = false
  mapPreviewMounted.value = false
})

const plannedSpeakerIdSet = computed(() => new Set((props.plannedSpeakers || []).map((speaker) => String(speaker?.id || '').trim()).filter(Boolean)))
const plannedSpeakerNameSet = computed(() => new Set((props.plannedSpeakers || []).map((speaker) => String(speaker?.name || '').trim()).filter(Boolean)))
const activeSpeakerName = computed(() => String(props.streamingSpeakerName || '').trim())
const isGroupTarget = computed(() => String(props.chatTarget || '').startsWith('group_'))
const isCrowdTarget = computed(() => String(props.chatTarget || '').startsWith('crowd_'))
const singleCharacterChip = computed<GroupMemberChip | null>(() => {
  const character = props.currentCharacter
  if (!character || isGroupTarget.value || isCrowdTarget.value) return null
  const name = String(character.name || props.currentChatTitle || t('chat.characterFallback')).trim()
  if (!name) return null
  return {
    id: String(character.id || name),
    name,
    avatar: normalizeAvatarUrl(String(character.avatarPath || (character as { avatar_path?: string }).avatar_path || '')),
    emoji: String(character.emoji || '')
  }
})
const participantChips = computed<GroupMemberChip[]>(() => {
  if (props.groupMembers.length > 0) return props.groupMembers
  return singleCharacterChip.value ? [singleCharacterChip.value] : []
})
const visibleParticipantChips = computed(() => participantChips.value.slice(0, 5))
const hiddenParticipantCount = computed(() => Math.max(0, participantChips.value.length - visibleParticipantChips.value.length))
const participantLabel = computed(() => {
  const members = participantChips.value
  if (!members.length) return ''
  if (members.length === 1) return t('chat.chatWithSingle', { name: members[0].name })
  const names = members.slice(0, 2).map((member) => member.name).filter(Boolean).join(t('chat.nameSeparator'))
  const shownNames = names || t('chat.multipleCharacters')
  return members.length > 2
    ? t('chat.chatWithMore', { names: shownNames, count: members.length })
    : t('chat.chatWithMulti', { names: shownNames })
})
const resolvedConversationAvatar = computed(() => {
  return normalizeAvatarUrl(props.conversationAvatar || singleCharacterChip.value?.avatar || '')
})
const resolvedConversationEmoji = computed(() => {
  return props.conversationEmoji || singleCharacterChip.value?.emoji || (participantChips.value.length > 1 ? '群' : '人')
})
const canOpenSessionSettings = computed(() => Boolean(props.chatTarget) && (isGroupTarget.value || isCrowdTarget.value || Boolean(props.currentCharacter)))
const sessionSettingsTitle = computed(() => {
  return canOpenSessionSettings.value ? t('common.settings') : t('chat.selectCharacterFirst')
})

function isMemberActive(member: GroupMemberChip) {
  return Boolean(props.isTyping) && activeSpeakerName.value === member.name
}

function isMemberPlanned(member: GroupMemberChip) {
  const memberId = String(member.id || '').trim()
  return plannedSpeakerIdSet.value.has(memberId)
    || plannedSpeakerNameSet.value.has(String(member.name || '').trim())
}

function isMemberLit(member: GroupMemberChip) {
  return isMemberPlanned(member) || isMemberActive(member)
}

function buildMemberTitle(name: string, isLit: boolean, isActive: boolean) {
  if (isActive) return t('chat.memberReplying', { name })
  if (isLit) return t('chat.memberWillReply', { name })
  return name
}

function openSessionSettings() {
  emit('open-session-settings', props.chatTarget)
}

function normalizeAvatarUrl(path?: string | null) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
</script>

<style scoped>
.chat-main-header {
  position: relative;
  z-index: 70;
  overflow: visible;
}

/* 批量投影灯泡：黄色，提示当前会话有未投影消息；运行中变暗并慢闪。 */
.chat-projection-lamp-btn {
  color: #e0a500;
}
.chat-projection-lamp-btn:hover:not(:disabled) {
  color: #c98a00;
}
.chat-projection-lamp-icon {
  color: inherit;
}
.chat-projection-lamp-btn--running {
  cursor: progress;
  opacity: 0.7;
}
.chat-projection-lamp-btn--running .chat-projection-lamp-icon {
  animation: chat-projection-lamp-blink 1.1s ease-in-out infinite;
}
@keyframes chat-projection-lamp-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.chat-main-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: visible;
}

.chat-conversation-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(139, 115, 85, 0.16);
  background: var(--langhuan-paper-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: 0 0 auto;
  color: var(--morandi-text-light);
  font-size: 0.82rem;
  font-weight: 600;
}

.chat-conversation-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-main-title-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
  overflow: visible;
}

.chat-main-title {
  display: flex;
  align-items: center;
  gap: 1.5em;
  min-width: 0;
}

.chat-main-title-text {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--morandi-text);
}

.chat-header-environment {
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
  margin-right: 24px;
  padding-right: 22px;
  border-right: 1px solid rgba(139, 115, 85, 0.14);
}

.chat-participant-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--morandi-text-light);
  font-size: 12px;
  line-height: 1.2;
}

.chat-participant-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-participant-avatars {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 0 0 auto;
}

.chat-participant-avatar {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(139, 115, 85, 0.12);
  background: var(--langhuan-paper-bg);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--morandi-text-light);
  flex: 0 0 auto;
  position: relative;
  isolation: isolate;
  margin-left: -4px;
  opacity: 0.58;
  filter: grayscale(0.85) saturate(0.72);
  transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease, background 0.28s ease, opacity 0.28s ease, filter 0.28s ease;
}

.chat-participant-avatar:first-child {
  margin-left: 0;
}

.chat-participant-avatar span {
  font-size: 10px;
  line-height: 1;
}

.chat-participant-avatar::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  background: radial-gradient(circle, rgba(178, 206, 203, 0.34) 0%, rgba(178, 206, 203, 0.16) 45%, rgba(178, 206, 203, 0) 72%);
  opacity: 0;
  transform: scale(0.92);
  transition: opacity 0.28s ease, transform 0.28s ease;
  z-index: -1;
  pointer-events: none;
}

.chat-participant-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-participant-avatar--lit {
  background: rgba(215, 227, 225, 0.72);
  border-color: rgba(132, 168, 164, 0.66);
  box-shadow: 0 0 0 2px rgba(170, 205, 198, 0.22);
  opacity: 0.98;
  filter: none;
  transform: scale(1);
}

.chat-participant-avatar--lit::after {
  opacity: 0.78;
  transform: scale(1);
}

.chat-participant-avatar--active {
  animation: chat-participant-breathe 1.2s ease-in-out infinite;
}

.chat-participant-avatar--more {
  margin-left: -4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  border-style: dashed;
  opacity: 0.72;
  filter: none;
}

@keyframes chat-participant-breathe {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(170, 205, 198, 0.22);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(116, 157, 151, 0.28);
  }
}

.chat-note-entry-btn {
  color: color-mix(in srgb, var(--morandi-accent) 70%, var(--morandi-text));
}

.chat-map-preview-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.chat-map-preview-popover {
  position: absolute;
  top: calc(100% + 9px);
  right: 0;
  z-index: 36;
  animation: chat-map-preview-in 0.16s ease-out;
}

@keyframes chat-map-preview-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (hover: none) {
  .chat-map-preview-popover { display: none !important; }
}

.chat-main-actions .chat-action-link {
  position: relative;
  z-index: 1;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: auto;
  min-width: 34px;
  max-width: none;
  height: 34px;
  overflow: hidden;
  border-radius: 8px;
  color: var(--morandi-text-light);
  text-decoration: none;
  transform-origin: center left;
  transition: color 0.18s ease;
  --chat-action-title-max-width: 9em;
}

.chat-main-actions .chat-action-link::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: block;
  border-radius: 8px;
  background: color-mix(in srgb, var(--morandi-border) 34%, transparent);
  content: "";
  transform: translateX(100%);
  transform-origin: center right;
  transition: transform 0.2s ease-in;
}

.chat-main-actions .chat-action-link:hover,
.chat-main-actions .chat-action-link:focus-visible {
  color: color-mix(in srgb, var(--morandi-accent) 74%, var(--morandi-text));
  outline: 0;
}

.chat-main-actions .chat-action-link:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chat-main-actions .chat-action-link:hover::before,
.chat-main-actions .chat-action-link:focus-visible::before {
  transform: translateX(0);
}

.chat-action-link-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 0 6px 0 8px;
}

.chat-action-link-title {
  position: relative;
  z-index: 1;
  display: block;
  flex: 0 1 auto;
  box-sizing: border-box;
  width: auto;
  max-width: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  color: currentColor;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  opacity: 0;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(12px);
  transform-origin: center right;
  transition:
    max-width 0.2s ease-in,
    margin-right 0.2s ease-in,
    transform 0.2s ease-in,
    opacity 0.16s ease-in;
}

.chat-main-actions .chat-action-link:hover .chat-action-link-title,
.chat-main-actions .chat-action-link:focus-visible .chat-action-link-title {
  max-width: var(--chat-action-title-max-width);
  margin-right: 9px;
  opacity: 1;
  transform: translateX(0);
}

.chat-note-entry-icon__spine {
  stroke-width: 1.95;
}

.chat-note-entry-icon__pen {
  stroke-width: 1.85;
}
</style>
