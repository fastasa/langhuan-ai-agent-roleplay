import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceSnapshotFromStores,
  normalizeWorkspaceSnapshot
} from '../../../src/repositories/workspaceSnapshotRepository.ts'

describe('workspaceSnapshotRepository', () => {
  it('工作区设置快照会保留 Agent 与总结模型配置', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      snapshotKind: 'bootstrap',
      settings: {
        apiPresets: [],
        defaultPreset: null,
        promptPresets: [],
        chatSummaryPresetName: 'summary-main',
        chatSummaryModel: 'glm-summary',
        agentModelConfigs: [{
          id: 'brain_agent',
          presetName: 'Deepseek',
          recallModel: 'deepseek-v4-flash',
          recallMaxTokens: 512
        }]
      }
    }, 'bootstrap')

    expect(snapshot.settings.chatSummaryPresetName).toBe('summary-main')
    expect(snapshot.settings.chatSummaryModel).toBe('glm-summary')
    expect(snapshot.settings.agentModelConfigs).toEqual([expect.objectContaining({
      id: 'brain_agent',
      presetName: 'Deepseek',
      recallModel: 'deepseek-v4-flash'
    })])
    expect('agentModelConfigs' in snapshot).toBe(false)
  })

  it('从 store 构建工作区快照时会写入 Agent 与总结模型配置', () => {
    const snapshot = buildWorkspaceSnapshotFromStores({
      resourceStore: {
        points: 0,
        bigTimeCount: 0,
        smallTimeCount: 0,
        money: 0,
        tickets: [],
        ticketCategories: [],
        history: []
      },
      charStore: {
        characters: [],
        characterGroups: [],
        groups: [],
        crowds: [],
        aliases: [],
        userProfile: null,
        documents: [],
        brainNeurons: []
      },
      chatStore: {
        entities: {
          chatSessions: {},
          chatMessages: {}
        },
        summaries: {
          summaryLibrary: [],
          smallSummaries: [],
          bigSummaries: []
        },
        current: {
          getWorkspaceCurrentTarget: () => ''
        }
      },
      settingStore: {
        apiPresets: [],
        defaultPreset: null,
        aiProviderMode: 'custom',
        promptPresets: [],
        ttsConfig: null,
        affectionChangeRate: null,
        affectionApiConfig: null,
        currentTime: '',
        currentWeather: '',
        currentLocation: '',
        weatherDetail: null,
        locationHistory: [],
        weatherHistory: [],
        darkMode: false,
        aiEvaluationEnabled: true,
        summaryPrompt: '',
        bigSummaryPrompt: '',
        dailyReportPrompt: '',
        chatSummaryPresetName: 'summary-main',
        chatSummaryModel: 'glm-summary',
        agentModelConfigs: [{
          id: 'brain_agent',
          presetName: 'Deepseek',
          recallModel: 'deepseek-v4-flash'
        }]
      },
      taskStore: {
        tasks: [],
        taskLogs: [],
        dailyReports: [],
        userLevel: null,
        dailyActivity: null,
        recentMarkTypes: []
      }
    }, undefined, 'bootstrap')

    expect(snapshot.settings.chatSummaryPresetName).toBe('summary-main')
    expect(snapshot.settings.chatSummaryModel).toBe('glm-summary')
    expect(snapshot.settings.agentModelConfigs).toEqual([expect.objectContaining({
      id: 'brain_agent',
      presetName: 'Deepseek'
    })])
  })
})
