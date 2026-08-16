import { computed } from 'vue'

type SettingsProjectionDeps = {
  settingStore: any
}

export function createSettingsProjection({ settingStore }: SettingsProjectionDeps) {
  const settingsDocumentViewModel = computed(() => ({
    defaultPresetName: settingStore.defaultPreset?.name || '',
    summaryPrompt: settingStore.summaryPrompt || '',
    bigSummaryPrompt: settingStore.bigSummaryPrompt || '',
    dailyReportPrompt: settingStore.dailyReportPrompt || '',
    currentLocation: String(settingStore.currentLocation || ''),
    currentWeather: String(settingStore.currentWeather || ''),
    currentTime: String(settingStore.currentTime || ''),
    promptPresets: Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets : []
  }))

  const settingsPanelViewModel = computed(() => ({
    apiPresetCount: Array.isArray(settingStore.apiPresets) ? settingStore.apiPresets.length : 0,
    promptPresetCount: Array.isArray(settingStore.promptPresets) ? settingStore.promptPresets.length : 0,
    defaultPresetName: settingStore.defaultPreset?.name || '',
    environmentSummary: {
      currentTime: String(settingStore.currentTime || ''),
      currentWeather: String(settingStore.currentWeather || ''),
      currentLocation: String(settingStore.currentLocation || '')
    },
    isDarkMode: Boolean(settingStore.darkMode),
    aiEvaluationEnabled: Boolean(settingStore.aiEvaluationEnabled)
  }))

  return {
    settingsDocumentViewModel,
    settingsPanelViewModel
  }
}
