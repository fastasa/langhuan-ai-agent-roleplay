import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createSettingsProjection } from '../../../src/app/settingsProjection.ts'

describe('settingsProjection', () => {
  it('会输出设置文档视图和面板视图', () => {
    const settingStore = reactive({
      defaultPreset: { name: '默认预设' },
      summaryPrompt: '总结提示',
      bigSummaryPrompt: '大总结提示',
      dailyReportPrompt: '日报提示',
      currentLocation: '上海',
      currentWeather: '晴',
      currentTime: '08:30',
      promptPresets: [{ id: 'preset_1', name: '早晨' }],
      apiPresets: [{ name: 'OpenAI' }],
      darkMode: true,
      aiEvaluationEnabled: false
    })

    const projection = createSettingsProjection({ settingStore })

    expect(projection.settingsDocumentViewModel.value).toEqual(expect.objectContaining({
      defaultPresetName: '默认预设',
      currentLocation: '上海',
      promptPresets: [{ id: 'preset_1', name: '早晨' }]
    }))

    expect(projection.settingsPanelViewModel.value).toEqual({
      apiPresetCount: 1,
      promptPresetCount: 1,
      defaultPresetName: '默认预设',
      environmentSummary: {
        currentTime: '08:30',
        currentWeather: '晴',
        currentLocation: '上海'
      },
      isDarkMode: true,
      aiEvaluationEnabled: false
    })
  })
})
