<template>
  <div class="mobile-curtain-panel">
    <p class="mobile-curtain-panel__hint">{{ $t('mobile.curtain.hint') }}</p>
    <AppEnvironmentPills
      class="mobile-curtain-panel__pills"
      :view-model="env.viewModel"
      :is-loading-location="env.isLoadingLocation"
      :is-loading-weather="env.isLoadingWeather"
      :editing-location="env.editingLocation"
      :temp-location="env.tempLocation"
      :temp-location-large="env.tempLocationLarge"
      :temp-location-middle="env.tempLocationMiddle"
      :temp-location-small="env.tempLocationSmall"
      :show-weather-detail="env.showWeatherDetail"
      :weather-text="env.weatherText"
      :temperature-text="env.temperatureText"
      :time-rate="env.timeRate"
      :format-date-only="env.formatDateOnly"
      :format-time-only="env.formatTimeOnly"
      :format-obs-time="env.formatObsTime"
      :get-weather-icon="env.getWeatherIcon"
      @edit-location="actions.editLocation"
      @save-location="actions.saveLocation"
      @cancel-location-edit="actions.cancelLocationEdit"
      @sync-weather="actions.syncWeather"
      @toggle-scene-time-paused="actions.toggleSceneTimePaused"
      @sync-time="actions.syncTime"
      @toggle-weather-detail="actions.toggleWeatherDetail"
      @close-weather-detail="actions.closeWeatherDetail"
      @update:temp-location="actions.updateTempLocation"
      @update:temp-location-large="actions.updateTempLocationLarge?.($event)"
      @update:temp-location-middle="actions.updateTempLocationMiddle?.($event)"
      @update:temp-location-small="actions.updateTempLocationSmall?.($event)"
    />

    <!-- 帷幕设置直达入口：与桌面帷幕浮窗的「场景设置 / 切换马甲」同语义，弹窗复用桌面全局 AppRoleModals -->
    <div class="mobile-curtain-panel__section">{{ $t('mobile.curtain.settingsSection') }}</div>
    <button type="button" class="mobile-curtain-panel__row" @click="openSceneEditor">
      <MobileLineIcon name="map-pinned" :size="20" />
      <span class="mobile-curtain-panel__row-text">
        <strong>{{ $t('mobile.curtain.sceneSetting') }}</strong>
        <em>{{ $t('mobile.curtain.sceneSettingDesc') }}</em>
      </span>
      <MobileLineIcon class="mobile-curtain-panel__row-chevron" name="chevron-right" :size="18" />
    </button>
    <button type="button" class="mobile-curtain-panel__row" @click="openAliasSelector">
      <MobileLineIcon name="id-card" :size="20" />
      <span class="mobile-curtain-panel__row-text">
        <strong>{{ $t('mobile.curtain.switchAlias') }}</strong>
        <em>{{ aliasSummary }}</em>
      </span>
      <MobileLineIcon class="mobile-curtain-panel__row-chevron" name="chevron-right" :size="18" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppEnvironmentPills from '../app/AppEnvironmentPills.vue'
import MobileLineIcon from './MobileLineIcon.vue'
import type { DesktopPanelState } from '../../types/panelContracts'

const { t } = useI18n()

// 移动端帷幕宿主：复用桌面 AppEnvironmentPills，环境 viewModel / actions / 格式化器都从 state 直接取
// （它们是 DesktopPanelState 字段，与桌面同源），不新建移动端私有环境真值。
// 与桌面联动：桌面侧装配在 AppDesktopPanel.vue 的 chatEnvironmentPills，后续若环境协议变动两处需同步。
const props = defineProps<{ state: DesktopPanelState }>()
const emit = defineEmits<{
  close: []
}>()

const env = computed(() => {
  const vm = props.state.environmentViewModel
  return {
    viewModel: vm,
    isLoadingLocation: Boolean(vm?.isLoadingLocation),
    isLoadingWeather: Boolean(vm?.isLoadingWeather),
    editingLocation: Boolean(vm?.editingLocation),
    tempLocation: String(vm?.tempLocation || ''),
    tempLocationLarge: String(vm?.tempLocationLarge || ''),
    tempLocationMiddle: String(vm?.tempLocationMiddle || ''),
    tempLocationSmall: String(vm?.tempLocationSmall || ''),
    showWeatherDetail: Boolean(vm?.showWeatherDetail),
    weatherText: String(vm?.weatherText || ''),
    temperatureText: String(vm?.temperatureText || ''),
    timeRate: vm?.timeRate === 0 ? 0 : Number(vm?.timeRate || 1),
    formatDateOnly: props.state.formatDateOnly,
    formatTimeOnly: props.state.formatTimeOnly,
    formatObsTime: props.state.formatObsTime,
    getWeatherIcon: props.state.getWeatherIcon
  }
})

const actions = computed(() => props.state.environmentActions)

// 入口摘要：马甲看当前绑定身份；场景入口用固定能力说明，避免只像地点编辑。
const aliasSummary = computed(() => String(props.state.chatViewModel?.currentAlias?.name || '').trim() || t('mobile.curtain.defaultAlias'))

// 打开全局弹窗后关闭当前抽屉，避免抽屉压在弹窗下层叠
function openSceneEditor() {
  props.state.chatActions?.openSceneEditor?.()
  emit('close')
}

function openAliasSelector() {
  props.state.chatActions?.openAliasSelector?.()
  emit('close')
}
</script>

<style scoped>
.mobile-curtain-panel {
  width: 100%;
  padding: 4px 2px;
}

.mobile-curtain-panel__hint {
  margin: 0 0 14px;
  color: var(--lhm-text-muted, #999);
  font-size: 12px;
  line-height: 1.6;
}

/* 桌面 pills 是横排紧凑控件，移动端宿主里给足换行空间 */
.mobile-curtain-panel__pills {
  flex-wrap: wrap;
  gap: 10px;
}

.mobile-curtain-panel__section {
  margin-top: 18px;
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  padding: 12px 2px 4px;
}

.mobile-curtain-panel__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  color: var(--lhm-text, #333);
  cursor: pointer;
  font: inherit;
  text-align: left;
  padding: 11px 2px;
  -webkit-tap-highlight-color: transparent;
}

.mobile-curtain-panel__row + .mobile-curtain-panel__row {
  border-top: 1px solid var(--lhm-border-line, #e5e5e5);
}

.mobile-curtain-panel__row :deep(.mobile-line-icon) {
  flex-shrink: 0;
  color: var(--lhm-text-light, #666);
}

.mobile-curtain-panel__row-text {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.mobile-curtain-panel__row-text strong {
  font-size: 13.5px;
  font-weight: 500;
}

.mobile-curtain-panel__row-text em {
  overflow: hidden;
  color: var(--lhm-text-muted, #999);
  font-size: 11.5px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-curtain-panel__row-chevron {
  color: var(--lhm-text-faint, #b6b0a7) !important;
}
</style>
