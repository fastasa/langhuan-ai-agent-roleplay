import { createSettingRepository } from '../settingRepository.js'

type SettingRepository = ReturnType<typeof createSettingRepository>

function readConfigMap(configRows: Array<{ key: string, value: string }>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  for (const row of configRows) {
    try {
      config[row.key] = JSON.parse(row.value)
    } catch {
      config[row.key] = row.value
    }
  }
  return config
}

function readSettingsSnapshot(
  config: Record<string, unknown>,
  apiPresets: Array<Record<string, unknown> | null>,
  promptPresets: Array<Record<string, unknown> | null>
) {
  const defaultPreset = apiPresets.find((preset) => (preset as { isDefault?: number } | null)?.isDefault) || null
  const aiProviderMode = 'custom'
  return {
    apiPresets,
    defaultPreset,
    aiProviderMode,
    promptPresets,
    currentTime: config.currentTime ?? '',
    currentWeather: config.currentWeather ?? '',
    currentLocation: config.currentLocation ?? '',
    weatherDetail: config.weatherDetail ?? null,
    locationHistory: config.locationHistory ?? [],
    weatherHistory: config.weatherHistory ?? [],
    darkMode: config.darkMode ?? null,
    aiEvaluationEnabled: config.aiEvaluationEnabled ?? null,
    summaryPrompt: config.summaryPrompt ?? '',
    bigSummaryPrompt: config.bigSummaryPrompt ?? '',
    dailyReportPrompt: config.dailyReportPrompt ?? '',
    chatSummaryPresetName: config.chatSummaryPresetName ?? '',
    chatSummaryModel: config.chatSummaryModel ?? '',
    agentModelConfigs: Array.isArray(config.agentModelConfigs) ? config.agentModelConfigs : []
  }
}

export function readSettingsSnapshotPartition(settingRepository: SettingRepository) {
  const apiPresets = settingRepository.getApiPresets()
  const promptPresets = settingRepository.getPromptPresets()
  const config = readConfigMap(settingRepository.getAllConfigs())

  return {
    workspaceTarget: typeof config.workspaceTarget === 'string' ? config.workspaceTarget : '',
    workspaceSessionId: typeof config.workspaceSessionId === 'string' ? config.workspaceSessionId : '',
    settings: readSettingsSnapshot(config, apiPresets, promptPresets),
    recentMarkTypes: Array.isArray(config.recentMarkTypes) ? config.recentMarkTypes : [],
    userLevel: config.userLevel ?? null,
    dailyActivity: config.dailyActivity ?? null
  }
}
