import { describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshotFromStores, normalizeWorkspaceSnapshot, wrapWorkspaceSnapshotEnvelope } from '../../../src/repositories/workspaceSnapshotRepository.js'
import { normalizeSettingsServerPayload } from '../../../src/repositories/settingRepository.js'
import { createWorkspaceCommandBus } from '../../../src/app/workspaceCommandBus.js'
import { createWorkspaceSnapshotAppliers } from '../../../src/app/workspaceSnapshotAppliers.js'

function createPrivateSoulCharacter() {
  return {
    id: 'char_1',
    name: '星依',
    brainCognitionNodes: [{
      id: 'brain:cognition:node:overview',
      title: '地点私有概览',
      summary: '私有地点摘要',
      parentId: 'brain:cognition',
      kind: 'group',
      content: '角色自己的地点理解。',
      tags: ['私有目录'],
      relationHints: ['[[城北]]'],
      compilePage: {
        summary: '私有地点摘要',
        tags: ['私有目录'],
        relationHints: ['[[城北]]'],
        updatedAt: '2026-04-27T00:00:00.000Z'
      },
      sourceDocumentId: 'doc_index',
      sourceDisplayPath: '/世界树/亚什基诺/地点',
      sourceDetachedAt: '2026-04-27T01:00:00.000Z',
      sourceSnapshotTitle: '地点',
      sourceSnapshotSummary: '地点目录摘要',
      createdAt: '2026-04-27T00:00:00.000Z',
      updatedAt: '2026-04-27T01:00:00.000Z'
    }],
    brain_cognition_nodes: ''
  }
}

describe('workspace contracts', () => {
  it('快照规范化后只保留 settings 作为正式设置位置', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      snapshotKind: 'cloud',
      apiPresets: [{ name: 'legacy' }],
      promptPresets: [{ id: 'legacy_prompt' }],
      currentWeather: '晴',
      settings: {
        apiPresets: [{ name: 'canonical' }],
        promptPresets: [{ id: 'canonical_prompt' }],
        currentWeather: '雨'
      }
    }, 'cloud')

    expect(snapshot.settings.apiPresets).toEqual([{ name: 'canonical' }])
    expect(snapshot.settings.promptPresets).toEqual([{ id: 'canonical_prompt' }])
    expect(snapshot.settings.currentWeather).toBe('雨')
    expect('apiPresets' in snapshot).toBe(false)
    expect('promptPresets' in snapshot).toBe(false)
    expect('currentWeather' in snapshot).toBe(false)
  })

  it('工作区快照规范化后会移除聊天当前态字段', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      snapshotKind: 'workspace',
      currentChatTarget: 'char_1',
      currentSession: { id: 'char_1' },
      currentMessages: [{ id: 1, role: 'assistant', content: 'hi' }],
      chatSessions: [{ id: 'char_1', target_id: 'char_1' }],
      chatMessages: [{ id: 1, session_id: 'char_1', role: 'assistant', content: 'hi' }],
      settings: {
        apiPresets: [],
        defaultPreset: null,
        promptPresets: []
      }
    }, 'workspace')

    expect('currentChatTarget' in snapshot).toBe(false)
    expect('currentSession' in snapshot).toBe(false)
    expect('currentMessages' in snapshot).toBe(false)
    expect(snapshot.chatSessions).toHaveLength(1)
    expect(snapshot.chatMessages).toHaveLength(1)
  })

  it('从 store 构建工作区快照时会带上正式聊天分区', () => {
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
          chatSessions: {
            char_1: {
              id: 'char_1',
              target_id: 'char_1',
              participants: [{ id: 'participant_1', participantTargetId: 'char_1' }]
            }
          },
          chatMessages: {
            char_1: [{ id: 1, session_id: 'char_1', role: 'assistant', content: 'hi' }]
          }
        },
        summaries: {
          summaryLibrary: [],
          smallSummaries: [],
          bigSummaries: []
        },
        current: {
          getWorkspaceCurrentTarget: () => 'char_1',
          currentSession: { id: 'session_1', target_id: 'char_1' }
        }
      },
      settingStore: {
        apiPresets: [],
        defaultPreset: null,
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
        darkMode: null,
        aiEvaluationEnabled: null,
        summaryPrompt: '',
        bigSummaryPrompt: '',
        dailyReportPrompt: ''
      },
      taskStore: {
        tasks: [],
        taskLogs: [],
        dailyReports: [],
        userLevel: null,
        dailyActivity: [],
        recentMarkTypes: []
      }
    }, undefined, 'cloud')

    expect(snapshot.workspaceTarget).toBe('char_1')
    expect(snapshot.workspaceSessionId).toBe('session_1')
    expect(snapshot.chatSessions).toEqual([{
      id: 'char_1',
      target_id: 'char_1',
      participants: [{ id: 'participant_1', participantTargetId: 'char_1' }]
    }])
    expect(snapshot.chatSessionParticipants).toEqual([{
      id: 'participant_1',
      participantTargetId: 'char_1',
      sessionId: 'char_1',
      displayOrder: 0
    }])
    expect(snapshot.chatSessionTemporaryCharacters).toEqual([])
    expect(snapshot.chatSessionTemporaryEntities).toEqual([])
    expect(snapshot.chatMessages).toEqual([{ id: 1, session_id: 'char_1', role: 'assistant', content: 'hi' }])
    expect(snapshot.chatPromptLogs).toEqual([])
  })

  it('工作区快照会保留角色私有灵魂正文、编译页和来源追溯字段', () => {
    const character = createPrivateSoulCharacter()
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
        characters: [character],
        characterGroups: [],
        groups: [],
        crowds: [],
        aliases: [],
        userProfile: null,
        documents: [],
        brainNeurons: []
      },
      chatStore: {
        entities: { chatSessions: {}, chatMessages: {} },
        summaries: { summaryLibrary: [], smallSummaries: [], bigSummaries: [] },
        current: {}
      },
      settingStore: {
        apiPresets: [],
        defaultPreset: null,
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
        darkMode: null,
        aiEvaluationEnabled: null,
        summaryPrompt: '',
        bigSummaryPrompt: '',
        dailyReportPrompt: ''
      },
      taskStore: {
        tasks: [],
        taskLogs: [],
        dailyReports: [],
        userLevel: null,
        dailyActivity: [],
        recentMarkTypes: []
      }
    }, undefined, 'cloud')

    const node = snapshot.characters?.[0]?.brainCognitionNodes?.[0]
    expect(node).toEqual(expect.objectContaining({
      kind: 'group',
      content: '角色自己的地点理解。',
      sourceDocumentId: 'doc_index',
      sourceDetachedAt: '2026-04-27T01:00:00.000Z'
    }))
    expect(node?.compilePage).toEqual(expect.objectContaining({
      summary: '私有地点摘要',
      relationHints: ['[[城北]]']
    }))
    expect(JSON.parse(JSON.stringify(snapshot)).characters[0].brainCognitionNodes[0].sourceSnapshotTitle).toBe('地点')
  })

  it('前端快照恢复会保留旧数据缺省与角色私有灵魂字段', () => {
    const charStore = {
      characters: [],
      characterGroups: [],
      groups: [],
      crowds: [],
      aliases: [],
      userProfile: null,
      documents: [],
      brainNeurons: []
    }
    const appliers = createWorkspaceSnapshotAppliers({
      resourceStore: {},
      charStore,
      chatStore: {
        entities: {},
        current: {},
        runtime: {},
        summaries: {}
      },
      settingStore: {},
      taskStore: {}
    })

    appliers.applyCharacterPartition({
      characters: [
        createPrivateSoulCharacter(),
        { id: 'char_legacy', name: '旧角色' }
      ],
      characterGroups: []
    })

    expect(charStore.characters).toHaveLength(2)
    const privateNode = charStore.characters[0].brainCognitionNodes[0]
    expect(privateNode).toEqual(expect.objectContaining({
      content: '角色自己的地点理解。',
      sourceDocumentId: 'doc_index',
      sourceSnapshotSummary: '地点目录摘要'
    }))
    expect(privateNode.compilePage.tags).toEqual(['私有目录'])
    expect(charStore.characters[1].brainCognitionNodes).toEqual([])
    expect(charStore.characters[1].brain_cognition_nodes).toBe('[]')
  })

  it('工作区命令结果会携带稳定命令标识', async () => {
    const runtimeStore = {
      trackCommand() {},
      syncCommandResult() {},
      showToast() {},
      setBlockingFeedback() {},
      clearBlockingFeedback() {}
    }
    const commandBus = createWorkspaceCommandBus(runtimeStore)
    commandBus.registerHandler('demo/run', {
      target: 'task',
      optimistic: true,
      rollbackPolicy: 'auto',
      resumePolicy: 'resume',
      feedbackPolicy: 'toast',
      async handle() {
        return { ok: true }
      }
    })

    const result = await commandBus.dispatch('demo/run', {
      commandId: 'cmd_demo_001'
    })

    expect(result.ok).toBe(true)
    expect(result.commandId).toBe('cmd_demo_001')
    expect(result.target).toBe('task')
    expect(result.optimistic).toBe(true)
    expect(result.status).toBe('committed')
    expect(result.state).toBe('committed')
  })

  it('工作区命令失败时会按策略记录回退状态', async () => {
    const trackedStates = []
    const syncedResults = []
    const runtimeStore = {
      trackCommand(metadata, state) {
        trackedStates.push({ metadata, state })
      },
      syncCommandResult(metadata, result) {
        syncedResults.push({ metadata, result })
      },
      showToast() {},
      setBlockingFeedback() {},
      clearBlockingFeedback() {}
    }
    const commandBus = createWorkspaceCommandBus(runtimeStore)
    commandBus.registerHandler('cloud/download', {
      target: 'cloud',
      rollbackPolicy: 'auto',
      resumePolicy: 'resume-latest',
      feedbackPolicy: 'toast',
      async handle() {
        throw new Error('下载失败')
      }
    })

    await expect(commandBus.dispatch('cloud/download', { commandId: 'cmd_cloud_001' })).rejects.toMatchObject({
      commandId: 'cmd_cloud_001',
      status: 'rolledBack',
      retryable: true,
      error: '下载失败'
    })

    expect(trackedStates.map((item) => item.state)).toEqual(['accepted', 'running', 'rolledBack'])
    expect(syncedResults.at(-1)?.result.state).toBe('rolledBack')
  })
  it('prefers canonical settings payload over legacy top-level mirrors', () => {
    const settings = normalizeSettingsServerPayload({
      apiPresets: [{ name: 'legacy' }],
      currentWeather: 'sunny',
      settings: {
        apiPresets: [{ name: 'canonical' }],
        promptPresets: [{ id: 'preset_1' }],
        currentWeather: 'rainy',
        darkMode: true
      }
    })

    expect(settings.apiPresets).toEqual([{ name: 'canonical' }])
    expect(settings.promptPresets).toEqual([{ id: 'preset_1' }])
    expect(settings.currentWeather).toBe('rainy')
    expect(settings.darkMode).toBe(true)
  })

  it('工作区快照会包装成稳定 envelope 合同', () => {
    const envelope = wrapWorkspaceSnapshotEnvelope({
      snapshotKind: 'bootstrap',
      settings: {
        apiPresets: [],
        defaultPreset: null,
        promptPresets: []
      }
    }, 'bootstrap', 'workspace_demo')

    expect(envelope.version).toBe(1)
    expect(envelope.workspaceId).toBe('workspace_demo')
    expect(typeof envelope.generatedAt).toBe('string')
    expect(envelope.payload.snapshotKind).toBe('bootstrap')
    expect(envelope.payload.settings.apiPresets).toEqual([])
  })

  it('工作区快照规范化时可以直接接收 envelope', () => {
    const snapshot = normalizeWorkspaceSnapshot({
      version: 1,
      workspaceId: 'workspace_demo',
      generatedAt: '2026-03-28T00:00:00.000Z',
      payload: {
        snapshotKind: 'cloud',
        settings: {
          apiPresets: [{ name: 'main' }],
          defaultPreset: null,
          promptPresets: []
        }
      }
    }, 'workspace')

    expect(snapshot.snapshotKind).toBe('cloud')
    expect(snapshot.settings.apiPresets).toEqual([{ name: 'main' }])
  })
})
