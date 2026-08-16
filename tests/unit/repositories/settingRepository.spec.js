import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  applyResolvedSettingsState,
  buildEnvironmentConfigPayload,
  buildApiPresetPatchPayload,
  buildApiPresetRecordPayload,
  buildSummaryPromptConfigPayload,
  fetchApiModels,
  loadApiPresetRecords,
  normalizePromptPreset,
  resolveSettingsState
} from '../../../src/repositories/settingRepository.ts'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settingRepository api preset helpers', () => {
  it('统一构建 API 预设新增载荷', () => {
    expect(buildApiPresetRecordPayload({
      name: '默认',
      base_url: 'https://example.com',
      api_key: 'key',
      available_models: '["a","b"]',
      is_default: true
    })).toEqual(expect.objectContaining({
      name: '默认',
      baseUrl: 'https://example.com',
      apiKey: 'key',
      availableModels: ['a', 'b'],
      isDefault: true
    }))
  })

  it('统一构建 API 预设更新载荷', () => {
    expect(buildApiPresetPatchPayload({
      baseUrl: 'https://next.example.com',
      fallback_preset: '备用'
    })).toEqual({
      baseUrl: 'https://next.example.com',
      fallbackPreset: '备用'
    })
  })

  it('统一解析设置快照状态', () => {
    const resolved = resolveSettingsState({
      settings: {
        currentTime: '08:00',
        darkMode: true,
        aiEvaluationEnabled: false,
        apiPresets: [{ name: 'A', model: 'm1' }],
        agentModelConfigs: [{
          id: 'brain_agent',
          presetName: 'A',
          recallMaxTokens: 640,
          fallback_recall_max_tokens: 768,
          embeddingPresetId: 'embedding_1',
          narration_quick_judge_preset_name: 'Quick',
          narration_quick_judge_model: 'quick-model',
          narrative_beat_preset_name: 'Beat',
          narrative_beat_model: 'beat-model',
          narrative_beat_max_tokens: 9000,
          narration_generation_preset_name: 'Final',
          narration_generation_model: 'final-model',
          narration_embedding_preset_id: 'embedding_narration',
          readStrategy: 'expansive',
          maxReviewRounds: 4,
          auditLogLevel: 'debug'
        }]
      }
    }, {
      ttsConfig: {
        mode: 'browser',
        browserVoice: '',
        apiUrl: '',
        referAudioPath: '',
        referText: '',
        presets: [],
        currentPreset: '',
        speed: 1
      },
      affectionApiConfig: { enabled: true }
    })

    expect(resolved.currentTime).toBe('08:00')
    expect(resolved.darkMode).toBe(true)
    expect(resolved.aiEvaluationEnabled).toBe(false)
    expect(resolved.apiPresets[0].name).toBe('A')
    // narrationGeneration* 是旧版本回滚字段，现随执笔（message）同步；narrationEmbeddingPresetId 已退役删除。
    expect(resolved.agentModelConfigs[0]).toEqual(expect.objectContaining({
      id: 'brain_agent',
      presetName: 'A',
      recallMaxTokens: 640,
      fallbackRecallMaxTokens: 768,
      embeddingPresetId: 'embedding_1',
      narrationQuickJudgePresetName: 'Quick',
      narrationQuickJudgeModel: 'quick-model',
      narrativeBeatPresetName: 'Beat',
      narrativeBeatModel: 'beat-model',
      narrativeBeatMaxTokens: 9000,
      narrationGenerationPresetName: 'Final',
      narrationGenerationModel: 'final-model',
      recallContentStrategy: 'full_aware',
      writeBackMaxReviewRounds: 4,
      writeBackAuditLogLevel: 'debug'
    }))
    expect(resolved.agentModelConfigs[0].narrationEmbeddingPresetId).toBeUndefined()
    expect(resolved.agentModelConfigs[0].modelUsageConfigs.map((item) => item.id)).toEqual(['fast', 'balanced', 'message', 'smart'])
    expect(resolved.agentModelConfigs[0].modelUsageConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fast', presetName: 'Quick', model: 'quick-model', maxTokens: 256 }),
      expect.objectContaining({ id: 'balanced', presetName: 'A', maxTokens: 640 }),
      expect.objectContaining({ id: 'message', presetName: 'Final', model: 'final-model', maxTokens: 640 }),
      expect.objectContaining({ id: 'smart', presetName: 'Beat', model: 'beat-model', maxTokens: 9000 })
    ]))
  })

  it('设置快照会从 apiPresets 的默认标记恢复 defaultPreset', () => {
    const resolved = resolveSettingsState({
      settings: {
        defaultPreset: null,
        apiPresets: [
          { name: 'A', model: 'm1', isDefault: false },
          { name: 'DeepSeek', model: 'deepseek-v4-flash', is_default: true }
        ],
        agentModelConfigs: [{ id: 'brain_agent', presetName: 'DeepSeek' }]
      }
    }, {
      ttsConfig: {
        mode: 'browser',
        browserVoice: '',
        apiUrl: '',
        referAudioPath: '',
        referText: '',
        presets: [],
        currentPreset: '',
        speed: 1
      },
      affectionApiConfig: { enabled: true }
    })

    expect(resolved.defaultPreset).toEqual(expect.objectContaining({
      name: 'DeepSeek',
      isDefault: true
    }))
  })

  it('启动装载会从 API 预设接口读取持久化预设', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([
        {
          name: 'DeepSeek',
          provider_type: 'deepseek',
          base_url: 'https://api.deepseek.com',
          api_key: 'key',
          model: 'deepseek-v4-flash',
          available_models: '["deepseek-v4-flash"]',
          is_default: 1
        }
      ])
    })))

    const presets = await loadApiPresetRecords()

    expect(String(fetch.mock.calls[0][0])).toContain('/api-presets')
    expect(presets[0]).toEqual(expect.objectContaining({
      name: 'DeepSeek',
      providerType: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      availableModels: ['deepseek-v4-flash'],
      isDefault: true
    }))
  })

  it('启动读取 API 预设时不把服务端 masked key 当作明文 key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([{
        name: 'Masked',
        base_url: 'https://api.example.com',
        api_key: '',
        hasApiKey: true,
        model: 'model-a'
      }])
    })))

    const presets = await loadApiPresetRecords()

    expect(presets[0].apiKey).toBe('')
    expect(presets[0].hasApiKey).toBe(true)
  })

  it('统一构建环境和总结配置载荷', () => {
    expect(buildEnvironmentConfigPayload({
      currentTime: '09:00',
      currentWeather: '',
      currentLocation: '上海',
      weatherDetail: { text: '阴', temp: '22', humidity: '34' },
      locationHistory: [],
      weatherHistory: [],
      aiEvaluationEnabled: true,
      ttsConfig: {
        mode: 'browser',
        browserVoice: '',
        apiUrl: '',
        referAudioPath: '',
        referText: '',
        presets: [],
        currentPreset: '',
        speed: 1
      },
      affectionChangeRate: 20,
      affectionApiConfig: { enabled: true }
    })).toEqual(expect.objectContaining({
      currentWeather: '阴，22°C，湿度34%'
    }))

    expect(buildEnvironmentConfigPayload({
      currentTime: '09:00',
      currentWeather: '晴',
      currentLocation: '上海',
      weatherDetail: { text: '晴' },
      locationHistory: [{ timestamp: 1, from: '北京', to: '上海' }],
      weatherHistory: [{ timestamp: 2, weather: '晴' }],
      aiEvaluationEnabled: true,
      ttsConfig: {
        mode: 'browser',
        browserVoice: '',
        apiUrl: '',
        referAudioPath: '',
        referText: '',
        presets: [],
        currentPreset: '',
        speed: 1
      },
      affectionChangeRate: 20,
      affectionApiConfig: { enabled: true }
    })).toEqual(expect.objectContaining({
      currentTime: '09:00',
      currentWeather: '晴',
      currentLocation: '上海',
      locationHistory: [{ timestamp: 1, from: '北京', to: '上海' }],
      weatherHistory: [{ timestamp: 2, weather: '晴' }]
    }))

    expect(buildSummaryPromptConfigPayload({
      summaryPrompt: '小总结',
      bigSummaryPrompt: '大总结',
      dailyReportPrompt: '日报'
    })).toEqual({
      summaryPrompt: '小总结',
      bigSummaryPrompt: '大总结',
      dailyReportPrompt: '日报'
    })
  })

  it('统一读取模型列表', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-a' }, { id: 'gpt-b' }]
      })
    }))

    const models = await fetchApiModels({
      baseUrl: 'https://example.com',
      apiKey: 'key'
    })

    expect(models).toEqual([{ id: 'gpt-a' }, { id: 'gpt-b' }])
  })

  it('统一把解析后的设置状态写回 store 目标', async () => {
    const target = {
      apiPresets: ref([]),
      defaultPreset: ref(null),
      aiProviderMode: ref('custom'),
      promptPresets: ref([]),
      ttsConfig: ref({
        mode: 'browser',
        browserVoice: '',
        apiUrl: '',
        referAudioPath: '',
        referText: '',
        presets: [],
        currentPreset: '',
        speed: 1
      }),
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
      summaryPrompt: ref('旧小结'),
      bigSummaryPrompt: ref('旧大结'),
      dailyReportPrompt: ref('旧日报'),
      chatSummaryPresetName: ref(''),
      chatSummaryModel: ref(''),
      agentModelConfigs: ref([])
    }

    const resolved = resolveSettingsState({
      settings: {
        currentTime: '08:00',
        darkMode: true,
        aiEvaluationEnabled: false,
        summaryPrompt: '新小结',
        apiPresets: [{ name: 'A', model: 'm1' }],
        agentModelConfigs: [{ id: 'brain_agent', presetName: 'A', embedding_preset_id: 'embedding_2' }]
      }
    }, {
      ttsConfig: target.ttsConfig.value,
      affectionApiConfig: target.affectionApiConfig.value
    })

    await applyResolvedSettingsState(target, resolved, {
      sanitizePromptPresetInput: (preset) => preset,
      ensureBuiltinPromptPresets: async () => {},
      normalizeWeatherDetail: (input) => input,
      normalizeAffectionApiConfig: (input) => input && typeof input === 'object' ? input : { enabled: true },
      darkModeFallback: false
    })

    expect(target.apiPresets.value[0].name).toBe('A')
    expect(target.aiProviderMode.value).toBe('custom')
    expect(target.currentTime.value).toBe('08:00')
    expect(target.darkMode.value).toBe(true)
    expect(target.aiEvaluationEnabled.value).toBe(false)
    expect(target.summaryPrompt.value).toBe('新小结')
    expect(target.agentModelConfigs.value[0]).toEqual(expect.objectContaining({
      id: 'brain_agent',
      presetName: 'A',
      embeddingPresetId: 'embedding_2',
      recallCandidateMode: 'parallel_merge',
      recallContentStrategy: 'summary_gate'
    }))
  })

  it('加载旧数据时用天气详情补齐天气摘要', async () => {
    const target = {
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
    const resolved = resolveSettingsState({
      settings: {
        currentWeather: '',
        weatherDetail: { text: '阴', temp: '22', humidity: '34' }
      }
    }, {
      ttsConfig: target.ttsConfig.value,
      affectionApiConfig: target.affectionApiConfig.value
    })

    await applyResolvedSettingsState(target, resolved, {
      sanitizePromptPresetInput: (preset) => preset,
      ensureBuiltinPromptPresets: async () => {},
      normalizeWeatherDetail: (input) => input,
      normalizeAffectionApiConfig: (input) => input && typeof input === 'object' ? input : { enabled: true },
      darkModeFallback: false
    })

    expect(target.weatherDetail.value).toEqual({ text: '阴', temp: '22', humidity: '34' })
    expect(target.currentWeather.value).toBe('阴，22°C，湿度34%')
  })
})

describe('settingRepository prompt preset helpers', () => {
  it('keeps numeric disabled state from server prompt records', () => {
    expect(normalizePromptPreset({ id: 'p0', name: '停用', enabled: 0 }).enabled).toBe(false)
    expect(normalizePromptPreset({ id: 'p1', name: '启用', enabled: 1 }).enabled).toBe(true)
    expect(normalizePromptPreset({ id: 'p2', name: '字符串停用', enabled: '0' }).enabled).toBe(false)
  })
})
