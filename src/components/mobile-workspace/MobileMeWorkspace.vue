<template>
  <div class="mobile-me-workspace">
    <MobileTopBar :title="$t('mobile.tab.me')" />

    <div class="mobile-me-body lhm-scroll">
      <!-- 本地资料卡 -->
      <button type="button" class="mobile-me-account" :aria-label="$t('mobile.me.manageProfile')" @click="state.chatActions.openUserEditor">
        <MobileAvatar :label="accountMark" :src="avatarPath" :size="50" color="var(--lhm-av-brown, #8b7355)" />
        <span class="mobile-me-account__body">
          <strong>{{ displayName }}</strong>
          <small>{{ accountDetail }}</small>
        </span>
        <MobileLineIcon name="chevron-right" :size="17" :stroke-width="1.8" class="mobile-me-go" />
      </button>

      <div class="mobile-me-groups">
        <!-- AI 与数据 -->
        <section class="mobile-me-group">
          <div class="mobile-me-group__title">{{ $t('mobile.me.aiAndData') }}</div>

          <div class="mobile-me-card">
            <div class="mobile-me-card__head">
              <MobileLineIcon name="settings" :size="20" :stroke-width="1.8" class="mobile-me-row__icon" />
              <div class="mobile-me-card__head-text">
                <strong>{{ $t('mobile.me.aiSourceConfig') }}</strong>
                <small>{{ apiSummary }}</small>
              </div>
            </div>
            <div class="mobile-me-segmented" role="group" :aria-label="$t('mobile.me.aiSourceModeAria')">
              <button type="button" class="active">{{ $t('mobile.me.providerCustom') }}</button>
            </div>
            <div class="mobile-me-api-grid">
              <div><span>{{ $t('mobile.me.defaultPreset') }}</span><strong>{{ defaultPresetName }}</strong></div>
              <div><span>{{ $t('mobile.me.presetCount') }}</span><strong>{{ $t('mobile.me.countUnit', { count: apiConfig.apiPresetCount || 0 }) }}</strong></div>
            </div>
            <div class="mobile-me-api-actions">
              <button type="button" class="mobile-me-secondary-action" @click="$emit('open-api-config')">
                {{ $t('mobile.me.apiConfig') }}
              </button>
              <button type="button" class="mobile-me-secondary-action" :disabled="apiConfig.isTestingApi" @click="state.panelActions.apiConfig.testApiConnection">
                {{ apiConfig.isTestingApi ? $t('mobile.me.testing') : $t('mobile.me.testConnection') }}
              </button>
            </div>
          </div>

          <div class="mobile-me-row mobile-me-row--last mobile-me-data-entry" :aria-label="$t('sidebar.navData')">
            <MobileLineIcon name="database" :size="20" :stroke-width="1.8" class="mobile-me-row__icon" />
            <span class="mobile-me-row__label">{{ $t('sidebar.navData') }}</span>
            <span class="mobile-me-pill">{{ $t('mobile.me.pending') }}</span>
          </div>
        </section>

        <!-- 应用 -->
        <section class="mobile-me-group">
          <div class="mobile-me-group__title">{{ $t('mobile.me.appSection') }}</div>
          <button type="button" class="mobile-me-row" @click="toggleChangelog">
            <MobileLineIcon name="file-text" :size="20" :stroke-width="1.8" class="mobile-me-row__icon" />
            <span class="mobile-me-row__label">{{ $t('mobile.me.changelog') }}</span>
            <span class="mobile-me-pill">{{ latestChangelog.version }}</span>
          </button>
          <div class="mobile-me-row mobile-me-row--last">
            <MobileLineIcon :name="darkMode ? 'sun' : 'moon'" :size="20" :stroke-width="1.8" class="mobile-me-row__icon" :class="{ 'mobile-me-row__icon--gold': darkMode }" />
            <span class="mobile-me-row__label">{{ $t('mobile.me.nightMode') }}</span>
            <button
              type="button"
              class="mobile-me-toggle"
              :class="{ 'mobile-me-toggle--on': darkMode }"
              role="switch"
              :aria-checked="darkMode ? 'true' : 'false'"
              :aria-label="$t('mobile.me.nightMode')"
              @click="state.chatActions.toggleDarkMode"
            >
              <span class="mobile-me-toggle__knob" aria-hidden="true" />
            </button>
          </div>
        </section>

        <div v-if="changelogOpen" class="mobile-me-changelog">
          <h3>{{ currentChangelog?.dialogTitle }}</h3>
          <p>{{ currentChangelog?.dialogSubtitle }}</p>
          <ul>
            <li v-for="item in latestChangelogItems" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { API } from '../../config/api'
import type { AppChangelog } from '../../app/appChangelog'
import type { MobileWorkspaceShellProps } from './mobileWorkspaceTypes'
import MobileAvatar from './MobileAvatar.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import MobileTopBar from './MobileTopBar.vue'

const props = defineProps<MobileWorkspaceShellProps>()
defineEmits<{
  'open-api-config': []
}>()

const { t } = useI18n()
const changelogOpen = ref(false)

const state = computed(() => props.state)
const profile = computed(() => state.value.chatViewModel.userProfile || {})
const apiConfig = computed(() => state.value.panelViewModels.apiConfig)

const displayName = computed(() => {
  return profile.value.displayName
    || profile.value.name
    || '本地用户'
})
const avatarPath = computed(() => profile.value.avatarPath || '')
const accountMark = computed(() => String(profile.value.emoji || displayName.value.slice(0, 1) || '琅'))
const accountDetail = computed(() => t('mobile.me.localWorkspaceHint'))
const darkMode = computed(() => Boolean(state.value.chatViewModel.darkMode))
const defaultPresetName = computed(() => apiConfig.value.defaultPresetName || t('mobile.me.notSet'))
const apiSummary = computed(() => {
  return t('mobile.me.apiSummary', { mode: t('mobile.me.customApi'), count: apiConfig.value.apiPresetCount || 0 })
})
// 未加载完成前保持 null，禁止用旧种子常量兜底，避免推送后仍显示旧版本
const currentChangelog = ref<AppChangelog | null>(null)
const latestChangelog = computed(() => currentChangelog.value?.entries[0] || { version: t('mobile.me.currentVersion'), date: '', sections: [] })
const latestChangelogItems = computed(() => {
  return (latestChangelog.value.sections || [])
    .flatMap((section) => section.items || [])
    .slice(0, 4)
})

async function loadAppChangelog() {
  try {
    const response = await fetch(API.APP_CHANGELOG)
    if (!response.ok) return
    const payload = await response.json() as AppChangelog
    if (payload?.releaseId && Array.isArray(payload.entries)) {
      currentChangelog.value = payload
    }
  } catch {
    // 请求失败保持现值不变，绝不回退硬编码种子，避免网络抖动时误显旧版本
  }
}

async function toggleChangelog() {
  if (!changelogOpen.value && !currentChangelog.value) {
    await loadAppChangelog()
    if (!currentChangelog.value) return
  }
  changelogOpen.value = !changelogOpen.value
}

onMounted(() => {
  loadAppChangelog()
})

</script>

<style scoped>
.mobile-me-workspace {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.mobile-me-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.mobile-me-go {
  color: var(--lhm-text-faint, #b6b0a7);
}

/* 本地资料卡 */
.mobile-me-account {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 14px;
  border: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 6px 4px 20px;
  margin-bottom: 8px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.mobile-me-account__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.mobile-me-account__body strong {
  overflow: hidden;
  color: var(--lhm-text, #333);
  font-size: 18px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-account__body small {
  overflow: hidden;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.mobile-me-group__title {
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
  font-weight: 600;
  padding: 0 4px 4px;
}

.mobile-me-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 13px;
  border: 0;
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 13px 6px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.mobile-me-row--last {
  border-bottom: 0;
}

.mobile-me-row__icon {
  flex-shrink: 0;
  color: var(--lhm-primary, #8b7355);
}

.mobile-me-row__icon--gold {
  color: var(--lhm-gold, #d4a843);
}

.mobile-me-row__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--lhm-text, #333);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-pill {
  flex-shrink: 0;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 999px;
  background: color-mix(in srgb, var(--lhm-card, #fffdf8) 70%, transparent);
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  white-space: nowrap;
  padding: 3px 9px;
}

.mobile-me-data-entry {
  cursor: default;
}

/* AI 来源卡 */
.mobile-me-card {
  border-bottom: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 8px 2px 16px;
}

.mobile-me-card__head {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 12px;
}

.mobile-me-card__head-text {
  min-width: 0;
}

.mobile-me-card__head-text strong {
  display: block;
  color: var(--lhm-text, #333);
  font-size: 15px;
}

.mobile-me-card__head-text small {
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
}

.mobile-me-segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 8px;
}

.mobile-me-segmented button {
  min-height: 36px;
  border: 0;
  background: transparent;
  color: var(--lhm-text-light, #666);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-me-segmented button.active {
  background: rgba(92, 138, 92, 0.14);
  color: var(--lhm-accent, #5c8a5c);
  font-weight: 600;
}

.mobile-me-api-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  margin: 12px 0;
  border: 1px solid var(--lhm-border-line, #e5e5e5);
  border-radius: 8px;
  background: var(--lhm-border-line, #e5e5e5);
}

.mobile-me-api-grid div {
  min-width: 0;
  background: var(--lhm-card, #fffdf8);
  padding: 10px 12px;
}

.mobile-me-api-grid span {
  display: block;
  color: var(--lhm-text-muted, #999);
  font-size: 11px;
}

.mobile-me-api-grid strong {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--lhm-text, #333);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-me-secondary-action {
  width: 100%;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--lhm-accent, #5c8a5c) 34%, var(--lhm-border-line, #e5e5e5));
  border-radius: 8px;
  background: transparent;
  color: var(--lhm-accent, #5c8a5c);
  cursor: pointer;
  font: inherit;
  font-size: 13.5px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-me-api-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mobile-me-secondary-action:disabled {
  cursor: default;
  opacity: 0.55;
}

/* 开关 */
.mobile-me-toggle {
  position: relative;
  width: 44px;
  height: 25px;
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  background: #d8d2c8;
  cursor: pointer;
  padding: 0;
  transition: background 0.18s ease;
}

.mobile-me-toggle--on {
  background: var(--lhm-accent, #5c8a5c);
}

.mobile-me-toggle__knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: left 0.18s ease;
}

.mobile-me-toggle--on .mobile-me-toggle__knob {
  left: 21.5px;
}

.mobile-me-changelog {
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
  padding: 12px 6px 4px;
}

.mobile-me-changelog h3 {
  margin: 0;
  color: var(--lhm-text, #333);
  font-size: 14px;
  font-weight: 600;
}

.mobile-me-changelog p {
  margin: 4px 0 0;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
}

.mobile-me-changelog ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0 0 0 18px;
}

.mobile-me-changelog li {
  color: var(--lhm-text, #333);
  font-size: 13px;
  line-height: 1.5;
}
</style>
