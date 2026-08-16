import type { AgentModelConfig, AiProviderMode, ApiPreset, PromptPreset } from '../types'
import {
  applyResolvedSettingsState,
  buildEnvironmentConfigPayload,
  loadApiPresetRecords,
  loadConfigSnapshot,
  loadPromptPresetRecords,
  normalizeSettingsWeatherDetail,
  resolveSettingsState,
  saveConfigSnapshot
} from '../repositories/settingRepository'

type RefValue<T> = { value: T }

type SettingEnvironmentStore = {
  apiPresets: ApiPreset[]
  defaultPreset: ApiPreset | null
  aiProviderMode: AiProviderMode
  promptPresets: PromptPreset[]
  currentTime: string
  currentWeather: string
  currentLocation: string
  weatherDetail: unknown
  darkMode: boolean
  aiEvaluationEnabled: boolean
  summaryPrompt: string
  bigSummaryPrompt: string
  dailyReportPrompt: string
  chatSummaryPresetName: string
  chatSummaryModel: string
  agentModelConfigs: AgentModelConfig[]
  locationHistory: Array<{ timestamp: number; from: string; to: string }>
  weatherHistory: Array<{ timestamp: number; weather: string }>
  ensureBuiltinPromptPresets: () => Promise<void>
  sanitizePromptPresetInput: (preset: PromptPreset, current?: Partial<PromptPreset> | null) => PromptPreset
}

type SettingEnvironmentRefs = {
  apiPresets: RefValue<ApiPreset[]>
  defaultPreset: RefValue<ApiPreset | null>
  aiProviderMode: RefValue<AiProviderMode>
  promptPresets: RefValue<PromptPreset[]>
  currentTime: RefValue<string>
  currentWeather: RefValue<string>
  currentLocation: RefValue<string>
  weatherDetail: RefValue<unknown>
  locationHistory: RefValue<Array<{ timestamp: number; from: string; to: string }>>
  weatherHistory: RefValue<Array<{ timestamp: number; weather: string }>>
  darkMode: RefValue<boolean>
  aiEvaluationEnabled: RefValue<boolean>
  summaryPrompt: RefValue<string>
  bigSummaryPrompt: RefValue<string>
  dailyReportPrompt: RefValue<string>
  chatSummaryPresetName: RefValue<string>
  chatSummaryModel: RefValue<string>
  agentModelConfigs: RefValue<AgentModelConfig[]>
}

type CreateSettingEnvironmentServiceDeps = {
  store: SettingEnvironmentStore
  refs: SettingEnvironmentRefs
}

export function createSettingEnvironmentService(deps: CreateSettingEnvironmentServiceDeps) {
  async function saveEnvironment(): Promise<void> {
    await saveConfigSnapshot(buildEnvironmentConfigPayload({
      currentTime: deps.store.currentTime,
      currentWeather: deps.store.currentWeather,
      currentLocation: deps.store.currentLocation,
      weatherDetail: deps.store.weatherDetail,
      locationHistory: deps.store.locationHistory,
      weatherHistory: deps.store.weatherHistory,
      aiEvaluationEnabled: deps.store.aiEvaluationEnabled
    }))
  }

  async function loadEnvironment(): Promise<void> {
    const [configSnapshot, apiPresetRecords, promptPresetRecords] = await Promise.all([
      loadConfigSnapshot(),
      loadApiPresetRecords(),
      loadPromptPresetRecords()
    ])
    const resolved = resolveSettingsState({
      settings: {
        ...configSnapshot,
        apiPresets: apiPresetRecords
      }
    })
    resolved.promptPresets = promptPresetRecords

    await applyResolvedSettingsState(deps.refs, resolved, {
      sanitizePromptPresetInput: (preset) => deps.store.sanitizePromptPresetInput(preset),
      ensureBuiltinPromptPresets: deps.store.ensureBuiltinPromptPresets,
      normalizeWeatherDetail: normalizeSettingsWeatherDetail,
      darkModeFallback: deps.store.darkMode
    })
  }

  return {
    saveEnvironment,
    loadEnvironment
  }
}
