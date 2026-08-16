import { describe, expect, it, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { createSettingEnvironmentService } from '../../../src/app/settingEnvironmentService.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

function createStoreTarget() {
  const refs = {
    apiPresets: ref([]),
    defaultPreset: ref(null),
    aiProviderMode: ref('custom'),
    promptPresets: ref([]),
    ttsConfig: ref({}),
    affectionChangeRate: ref(20),
    affectionApiConfig: ref({ enabled: true }),
    currentTime: ref(''),
    currentWeather: ref(''),
    currentLocation: ref(''),
    weatherDetail: ref(null),
    locationHistory: ref([]),
    weatherHistory: ref([]),
    darkMode: ref(false),
    aiEvaluationEnabled: ref(true),
    summaryPrompt: ref(''),
    bigSummaryPrompt: ref(''),
    dailyReportPrompt: ref(''),
    chatSummaryPresetName: ref(''),
    chatSummaryModel: ref(''),
    agentModelConfigs: ref([])
  }
  const store = {
    get apiPresets() { return refs.apiPresets.value },
    get defaultPreset() { return refs.defaultPreset.value },
    get aiProviderMode() { return refs.aiProviderMode.value },
    get promptPresets() { return refs.promptPresets.value },
    get ttsConfig() { return refs.ttsConfig.value },
    get affectionChangeRate() { return refs.affectionChangeRate.value },
    get affectionApiConfig() { return refs.affectionApiConfig.value },
    get currentTime() { return refs.currentTime.value },
    get currentWeather() { return refs.currentWeather.value },
    get currentLocation() { return refs.currentLocation.value },
    get weatherDetail() { return refs.weatherDetail.value },
    get darkMode() { return refs.darkMode.value },
    get aiEvaluationEnabled() { return refs.aiEvaluationEnabled.value },
    get summaryPrompt() { return refs.summaryPrompt.value },
    get bigSummaryPrompt() { return refs.bigSummaryPrompt.value },
    get dailyReportPrompt() { return refs.dailyReportPrompt.value },
    get chatSummaryPresetName() { return refs.chatSummaryPresetName.value },
    get chatSummaryModel() { return refs.chatSummaryModel.value },
    get agentModelConfigs() { return refs.agentModelConfigs.value },
    get locationHistory() { return refs.locationHistory.value },
    get weatherHistory() { return refs.weatherHistory.value },
    ensureBuiltinPromptPresets: vi.fn(async () => {}),
    sanitizePromptPresetInput: (preset) => preset
  }
  return { refs, store }
}

describe('settingEnvironmentService', () => {
  it('加载环境时以提示词表为准，避免配置快照覆盖已编辑提示词', async () => {
    const { refs, store } = createStoreTarget()
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const requestUrl = String(url)
      if (requestUrl.includes('/api-presets')) {
        return { ok: true, json: async () => [] }
      }
      if (requestUrl.includes('/prompt-presets')) {
        return {
          ok: true,
          json: async () => [{
            id: 'user_custom',
            name: '用户自定义',
            content: '服务端已编辑内容',
            scene: 'all',
            frequency: 'always',
            enabled: true,
            is_required: 0,
            order_index: 0,
            updated_at: '2026-04-26T01:00:00.000Z'
          }]
        }
      }
      return {
        ok: true,
        json: async () => ({
          settings: {
            promptPresets: [{
              id: 'user_custom',
              name: '用户自定义',
              content: '配置快照旧默认内容',
              scene: 'all',
              enabled: true,
              isRequired: true
            }],
            darkMode: true
          }
        })
      }
    }))

    const service = createSettingEnvironmentService({ store, refs })
    await service.loadEnvironment()

    expect(fetch).toHaveBeenCalledWith('/api/data/config')
    expect(fetch).toHaveBeenCalledWith('/api/data/api-presets')
    expect(fetch).toHaveBeenCalledWith('/api/data/prompt-presets')
    expect(refs.promptPresets.value).toHaveLength(1)
    expect(refs.promptPresets.value[0]).toEqual(expect.objectContaining({
      id: 'user_custom',
      content: '服务端已编辑内容',
      isRequired: false
    }))
    expect(store.ensureBuiltinPromptPresets).toHaveBeenCalled()
  })

  it('保存环境时带上地点和天气历史，避免刷新后丢变化记录', async () => {
    const { refs, store } = createStoreTarget()
    refs.currentTime.value = '09:00'
    refs.currentWeather.value = '晴'
    refs.currentLocation.value = '上海'
    refs.weatherDetail.value = { text: '晴' }
    refs.locationHistory.value = [{ timestamp: 1, from: '北京', to: '上海' }]
    refs.weatherHistory.value = [{ timestamp: 2, weather: '晴' }]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const service = createSettingEnvironmentService({ store, refs })

    await service.saveEnvironment()

    expect(fetch).toHaveBeenCalledWith('/api/data/config', expect.objectContaining({
      method: 'PUT',
      body: expect.any(String)
    }))
    const configCall = fetch.mock.calls.find(([url, options]) => (
      String(url) === '/api/data/config' && options?.method === 'PUT'
    ))
    expect(JSON.parse(configCall[1].body)).toEqual(expect.objectContaining({
      currentTime: '09:00',
      currentWeather: '晴',
      currentLocation: '上海',
      weatherDetail: { text: '晴' },
      locationHistory: [{ timestamp: 1, from: '北京', to: '上海' }],
      weatherHistory: [{ timestamp: 2, weather: '晴' }]
    }))
  })

  it('装载环境时会合并 API 预设表和 config 表里的 Agent 配置', async () => {
    const { refs, store } = createStoreTarget()
    const fetchMock = vi.fn(async (url) => {
      const target = String(url)
      if (target.includes('/api-presets')) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'DeepSeek',
              provider_type: 'deepseek',
              base_url: 'https://api.deepseek.com',
              api_key: 'key',
              model: 'deepseek-v4-flash',
              is_default: 1
            }
          ])
        }
      }
      if (target.includes('/prompt-presets')) {
        return { ok: true, json: async () => [] }
      }
      return {
        ok: true,
        json: async () => ({
          agentModelConfigs: [{
            id: 'brain_agent',
            presetName: 'DeepSeek',
            recallModel: 'deepseek-v4-flash',
            recallMaxTokens: 640
          }]
        })
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = createSettingEnvironmentService({ store, refs })
    await service.loadEnvironment()

    expect(refs.defaultPreset.value).toEqual(expect.objectContaining({
      name: 'DeepSeek',
      isDefault: true
    }))
    expect(refs.agentModelConfigs.value[0]).toEqual(expect.objectContaining({
      id: 'brain_agent',
      presetName: 'DeepSeek',
      recallModel: 'deepseek-v4-flash',
      recallMaxTokens: 640
    }))
  })
})
