import { describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshotFromStores } from '../../../src/repositories/workspaceSnapshotRepository.js'

describe('workspace snapshot repository doc brain', () => {
  it('会把文档与角色大脑神经元带进工作区快照', () => {
    const snapshot = buildWorkspaceSnapshotFromStores({
      resourceStore: {
        points: 1,
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
        userProfile: {},
        documents: [{ id: 'doc_1', title: '文档A' }],
        brainNeurons: [{ brainNeuronId: 'brain_1', title: '神经元A' }]
      },
      chatStore: {
        summaries: {
          summaryLibrary: [],
          smallSummaries: [],
          bigSummaries: []
        },
        current: {
          getWorkspaceCurrentTarget: () => 'char_1'
        }
      },
      settingStore: {
        apiPresets: [],
        defaultPreset: null,
        promptPresets: [],
        ttsConfig: {},
        affectionChangeRate: 0,
        affectionApiConfig: {},
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
        dailyReportPrompt: ''
      },
      taskStore: {
        tasks: [],
        taskLogs: [],
        dailyReports: [],
        userLevel: { level: 1 },
        dailyActivity: { completedCount: 0 },
        recentMarkTypes: []
      }
    })

    expect(snapshot.documents).toEqual([{ id: 'doc_1', title: '文档A' }])
    expect(snapshot.brainNeurons).toEqual([{ brainNeuronId: 'brain_1', title: '神经元A' }])
  })
})
