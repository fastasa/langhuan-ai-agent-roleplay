import { createSettingRepository } from '../settingRepository.js'
import { toJson, toNum, toText } from './shared.js'

type SettingRepository = ReturnType<typeof createSettingRepository>

function normalizeSettingsPayload(payload: Record<string, any>): Record<string, any> {
  return payload.settings && typeof payload.settings === 'object'
    ? payload.settings as Record<string, any>
    : {}
}

export function applySettingsSnapshotPartition(settingRepository: SettingRepository, payload: Record<string, any>) {
  const settingsPayload = normalizeSettingsPayload(payload)

  if (Array.isArray(settingsPayload.apiPresets)) {
    settingRepository.replaceApiPresets(settingsPayload.apiPresets.map((item: any) => ({
      name: toText(item?.name, ''),
      baseUrl: toText(item?.baseUrl ?? item?.base_url, ''),
      apiKey: toText(item?.apiKey ?? item?.api_key, ''),
      model: toText(item?.model, ''),
      availableModels: toJson(item?.availableModels ?? item?.available_models, []),
      maxTokens: toNum(item?.maxTokens ?? item?.max_tokens, 4096),
      temperature: toNum(item?.temperature, 0.7),
      isDefault: item?.isDefault || item?.is_default ? 1 : 0,
      fallbackPreset: toText(item?.fallbackPreset ?? item?.fallback_preset, '')
    })))
  }

  if (Array.isArray(settingsPayload.promptPresets)) {
    settingRepository.replacePromptPresets(settingsPayload.promptPresets.map((item: any, index: number) => ({
      id: toText(item?.id || `preset_${index}`),
      name: toText(item?.name || '未命名预设'),
      content: toText(item?.content || ''),
      role: toText(item?.role, 'system'),
      scene: toText(item?.scene || 'all'),
      frequency: toNum(item?.frequency, 0),
      enabled: item?.enabled === false ? 0 : 1,
      orderIndex: toNum(item?.orderIndex ?? item?.order_index, index),
      promptGroup: toText(item?.promptGroup ?? item?.prompt_group, '系统提示词'),
      usageMode: toText(item?.usageMode ?? item?.usage_mode, 'always'),
      scope: toText(item?.scope, 'user'),
      isRequired: item?.isRequired ?? item?.is_required ?? null,
      priority: toNum(item?.priority, 0),
      summary: toText(item?.summary, ''),
      updatedAt: toText(item?.updatedAt ?? item?.updated_at, new Date().toISOString())
    })))
  }

  if (payload.recentMarkTypes !== undefined) {
    settingRepository.upsertConfigValue('recentMarkTypes', toJson(payload.recentMarkTypes, []))
  }

  if (Object.keys(settingsPayload).length > 0) {
    for (const [key, value] of Object.entries(settingsPayload)) {
      settingRepository.upsertConfigValue(key, toJson(value, ''))
    }
  }
  if (payload.userLevel !== undefined) {
    settingRepository.upsertConfigValue('userLevel', toJson(payload.userLevel, {}))
  }
  if (payload.dailyActivity !== undefined) {
    settingRepository.upsertConfigValue('dailyActivity', toJson(payload.dailyActivity, {}))
  }
}
