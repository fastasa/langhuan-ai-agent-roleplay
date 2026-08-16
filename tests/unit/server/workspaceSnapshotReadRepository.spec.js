import { describe, expect, it, vi } from 'vitest'

import { createWorkspaceSnapshotReadRepository } from '../../../server/repositories/workspaceSnapshotReadRepository.js'
import { createWorkspaceSnapshotReadParts } from '../../../server/repositories/workspaceSnapshotReadParts.js'
import { readWorkspaceSnapshotPayloadFromParts } from '../../../server/repositories/workspaceSnapshot/readPayload.js'

function createDbStub() {
  return {
    prepare(sql) {
      if (sql === 'SELECT * FROM api_presets') {
        return { all: vi.fn(() => [{ name: '默认接口', is_default: 1 }]) }
      }
      if (sql === 'SELECT * FROM prompt_presets ORDER BY order_index') {
        return { all: vi.fn(() => [{ id: 'preset_1', name: '日常' }]) }
      }
      if (sql === 'SELECT * FROM summary_library ORDER BY created_at DESC') {
        return { all: vi.fn(() => [{ id: 'sum_1', title: '总结' }]) }
      }
      if (sql === 'SELECT * FROM small_summaries ORDER BY created_at ASC') {
        return { all: vi.fn(() => [{ id: 'small_1', char_id: 'char_1' }]) }
      }
      if (sql === 'SELECT * FROM big_summaries ORDER BY created_at ASC') {
        return { all: vi.fn(() => [{ id: 'big_1', name: '大总结' }]) }
      }
      return {
        all: vi.fn(() => []),
        get: vi.fn(() => undefined),
        run: vi.fn()
      }
    }
  }
}

describe('workspace snapshot read repository', () => {
  it('用独立装配器把各分区 reader 收拢成正式导出 payload', () => {
    const payload = readWorkspaceSnapshotPayloadFromParts({
      readResourcePartition: () => ({ resources: { points: 5 } }),
      readCharacterPartition: () => ({ characters: [{ id: 'char_1' }] }),
      readChatPartition: ({ includeAllChats } = {}) => ({
      chatSessions: includeAllChats ? [{ id: 'session_1' }] : [],
      chatSessionParticipants: includeAllChats ? [{ id: 'participant_1' }] : [],
      chatMessages: includeAllChats ? [{ id: 1 }] : [],
      chatMessageProjections: includeAllChats ? [{ id: 'projection_1' }] : [],
      chatMessageProjectionVisibility: includeAllChats ? [{ id: 'visibility_1' }] : [],
      chatProjectionWritebackRuns: includeAllChats ? [{ id: 'writeback_1' }] : [],
      chatPromptLogs: includeAllChats ? [{ id: 'log_1' }] : []
      }),
      readSettingsPartition: () => ({ settings: { currentWeather: '晴' } }),
      readTaskPartition: () => ({ tasks: [{ id: 'task_1' }] })
    }, { includeAllChats: true })

    expect(payload).toEqual({
      resources: { points: 5 },
      characters: [{ id: 'char_1' }],
      chatSessions: [{ id: 'session_1' }],
      chatSessionParticipants: [{ id: 'participant_1' }],
      chatMessages: [{ id: 1 }],
      chatMessageProjections: [{ id: 'projection_1' }],
      chatMessageProjectionVisibility: [{ id: 'visibility_1' }],
      chatProjectionWritebackRuns: [{ id: 'writeback_1' }],
      chatPromptLogs: [{ id: 'log_1' }],
      settings: { currentWeather: '晴' },
      tasks: [{ id: 'task_1' }]
    })
  })

  it('splits export assembly into dedicated snapshot partitions', () => {
    const resourceRepository = {
      getResources: vi.fn(() => ({ id: 1, points: 5 })),
      getTickets: vi.fn(() => [{ id: 'ticket_1' }]),
      getTicketCategories: vi.fn(() => [{ id: 'cat_1' }]),
      getHistory: vi.fn(() => [{ id: 3 }]),
      getTimers: vi.fn(() => [{ id: 'timer_1' }]),
      getCustomTags: vi.fn(() => [{ id: 'tag_1' }]),
      getEventStack: vi.fn(() => [{ id: 'event_1' }])
    }
    const characterRepository = {
      getCharacters: vi.fn(() => [{ id: 'char_1', avatarPath: 'avatars/char_1.png' }]),
      getCharacterGroups: vi.fn(() => [{ id: 'default' }]),
      getGroups: vi.fn(() => [{ id: 'group_1' }]),
      getCrowds: vi.fn(() => [{ id: 'crowd_1' }]),
      getAliases: vi.fn(() => [{ id: 'alias_1' }]),
      getUserProfile: vi.fn(() => ({ id: 1, name: '星依' })),
      getDocuments: vi.fn(() => []),
      getBrainNeurons: vi.fn(() => [])
    }
    const chatRepository = {
      getAllSessions: vi.fn(() => [{ id: 'char_1' }]),
      getAllMessages: vi.fn(() => [{ id: 1, sessionId: 'char_1' }]),
      getAllSessionParticipants: vi.fn(() => [{ id: 'participant_1', sessionId: 'char_1' }]),
      getAllMessageProjections: vi.fn(() => [{ id: 'projection_1', sessionId: 'char_1', messageId: 1 }]),
      getAllMessageProjectionVisibility: vi.fn(() => [{ id: 'visibility_1', projectionId: 'projection_1', characterId: 'char_1' }]),
      getAllProjectionWritebackRuns: vi.fn(() => [{ id: 'writeback_1', sessionId: 'char_1', characterId: 'char_1' }]),
      getAllSessionTemporaryCharacters: vi.fn(() => []),
      getAllSessionTemporaryEntities: vi.fn(() => []),
      getAllMessageNotes: vi.fn(() => []),
      getAllAffectGateAudits: vi.fn(() => []),
      getAllAffectLedgerEntries: vi.fn(() => []),
      getAllAffectResidueCheckpoints: vi.fn(() => []),
      getAllPromptLogs: vi.fn(() => [{ id: 'log_1', sessionId: 'char_1' }]),
      getAllRecallActivityLogs: vi.fn(() => [{ id: 'recall_log_1', sessionId: 'char_1' }]),
      getSummaryLibrary: vi.fn(() => [{ id: 'sum_1' }]),
      getSmallSummaries: vi.fn(() => [{ id: 'small_1' }]),
      getBigSummaries: vi.fn(() => [{ id: 'big_1' }])
    }
    const taskRepository = {
      getTasksForSnapshot: vi.fn(() => [{ id: 'task_1' }]),
      getTaskLogs: vi.fn(() => [{ id: 2 }]),
      getDailyReports: vi.fn(() => [{ id: 4 }])
    }
    const settingRepository = {
      getApiPresets: vi.fn(() => [{ name: '默认接口', isDefault: 1 }]),
      getPromptPresets: vi.fn(() => [{ id: 'preset_1', name: '日常' }]),
      getAllConfigs: vi.fn(() => [
        { key: 'currentTime', value: JSON.stringify('08:00') },
        { key: 'workspaceTarget', value: JSON.stringify('char_1') },
        { key: 'workspaceSessionId', value: JSON.stringify('session_1') },
        { key: 'recentMarkTypes', value: JSON.stringify(['start']) }
      ])
    }

    const parts = createWorkspaceSnapshotReadParts({
      resourceRepository,
      characterRepository,
      chatRepository,
      taskRepository,
      settingRepository
    })

    expect(parts.readResourcePartition()).toMatchObject({
      resources: { id: 1, points: 5 },
      customTags: [{ id: 'tag_1' }],
      eventStack: [{ id: 'event_1' }]
    })
    expect(parts.readCharacterPartition()).toMatchObject({
      characterGroups: [{ id: 'default' }],
      aliases: [{ id: 'alias_1' }]
    })
    expect(parts.readChatPartition({ includeAllChats: false })).toMatchObject({
      summaryLibrary: [{ id: 'sum_1' }],
      chatSessions: [],
      chatSessionParticipants: [],
      chatMessages: [],
      chatMessageProjections: [],
      chatMessageProjectionVisibility: [],
      chatProjectionWritebackRuns: []
    })
    expect(parts.readChatPartition({ includeAllChats: false, includeChatMetadata: true })).toMatchObject({
      summaryLibrary: [{ id: 'sum_1' }],
      chatSessions: [{ id: 'char_1' }],
      chatSessionParticipants: [{ id: 'participant_1', sessionId: 'char_1' }],
      chatMessages: [],
      chatMessageProjections: [],
      chatMessageProjectionVisibility: [],
      chatProjectionWritebackRuns: [],
      chatPromptLogs: []
    })
    expect(parts.readSettingsPartition()).toMatchObject({
      workspaceTarget: 'char_1',
      workspaceSessionId: 'session_1',
      recentMarkTypes: ['start'],
      settings: { currentTime: '08:00' }
    })
    expect(parts.readTaskPartition()).toMatchObject({
      tasks: [{ id: 'task_1' }],
      dailyReports: [{ id: 4 }]
    })
  })

  it('assembles export payload from domain repositories', () => {
    const database = createDbStub()
    const repairWorkspaceSnapshotStorage = vi.fn()
    const resourceRepository = {
      getResources: vi.fn(() => ({ id: 1, points: 5 })),
      getTickets: vi.fn(() => [{ id: 'ticket_1' }]),
      getTicketCategories: vi.fn(() => [{ id: 'cat_1' }]),
      getHistory: vi.fn(() => [{ id: 3 }]),
      getTimers: vi.fn(() => [{ id: 'timer_1' }]),
      getCustomTags: vi.fn(() => [{ id: 'tag_1' }]),
      getEventStack: vi.fn(() => [{ id: 'event_1' }])
    }
    const characterRepository = {
      getCharacters: vi.fn(() => [{ id: 'char_1', avatarPath: 'avatars/char_1.png' }]),
      getCharacterGroups: vi.fn(() => [{ id: 'default' }]),
      getGroups: vi.fn(() => [{ id: 'group_1' }]),
      getCrowds: vi.fn(() => [{ id: 'crowd_1' }]),
      getAliases: vi.fn(() => [{ id: 'alias_1' }]),
      getUserProfile: vi.fn(() => ({ id: 1, name: '星依' })),
      getDocuments: vi.fn(() => []),
      getBrainNeurons: vi.fn(() => [])
    }
    const chatRepository = {
      getAllSessions: vi.fn(() => [{ id: 'char_1' }]),
      getAllMessages: vi.fn(() => [{ id: 1, sessionId: 'char_1' }]),
      getAllSessionParticipants: vi.fn(() => [{ id: 'participant_1', sessionId: 'char_1' }]),
      getAllMessageProjections: vi.fn(() => [{ id: 'projection_1', sessionId: 'char_1', messageId: 1 }]),
      getAllMessageProjectionVisibility: vi.fn(() => [{ id: 'visibility_1', projectionId: 'projection_1', characterId: 'char_1' }]),
      getAllProjectionWritebackRuns: vi.fn(() => [{ id: 'writeback_1', sessionId: 'char_1', characterId: 'char_1' }]),
      getAllSessionTemporaryCharacters: vi.fn(() => []),
      getAllSessionTemporaryEntities: vi.fn(() => []),
      getAllMessageNotes: vi.fn(() => []),
      getAllAffectGateAudits: vi.fn(() => []),
      getAllAffectLedgerEntries: vi.fn(() => []),
      getAllAffectResidueCheckpoints: vi.fn(() => []),
      getAllPromptLogs: vi.fn(() => [{ id: 'log_1', sessionId: 'char_1' }]),
      getAllRecallActivityLogs: vi.fn(() => [{ id: 'recall_log_1', sessionId: 'char_1' }]),
      getSummaryLibrary: vi.fn(() => [{ id: 'sum_1' }]),
      getSmallSummaries: vi.fn(() => [{ id: 'small_1' }]),
      getBigSummaries: vi.fn(() => [{ id: 'big_1' }])
    }
    const taskRepository = {
      getTasksForSnapshot: vi.fn(() => [{ id: 'task_1' }]),
      getTaskLogs: vi.fn(() => [{ id: 2 }]),
      getDailyReports: vi.fn(() => [{ id: 4 }])
    }
    const settingRepository = {
      getApiPresets: vi.fn(() => [{ name: '默认接口', isDefault: 1 }]),
      getPromptPresets: vi.fn(() => [{ id: 'preset_1', name: '日常' }]),
      getAllConfigs: vi.fn(() => [
        { key: 'currentTime', value: JSON.stringify('08:00') },
        { key: 'workspaceTarget', value: JSON.stringify('char_1') },
        { key: 'workspaceSessionId', value: JSON.stringify('session_1') },
        { key: 'recentMarkTypes', value: JSON.stringify(['start']) }
      ])
    }

    const repository = createWorkspaceSnapshotReadRepository(database, {
      repairWorkspaceSnapshotStorage,
      resourceRepository,
      characterRepository,
      chatRepository,
      taskRepository,
      settingRepository
    })

    const result = repository.readWorkspaceExportPayload({ includeAllChats: true })

    expect(repairWorkspaceSnapshotStorage).toHaveBeenCalledWith(database)
    expect(result.resources.points).toBe(5)
    expect(result.ticketCategories).toEqual([{ id: 'cat_1' }])
    expect(result.characterGroups).toEqual([{ id: 'default' }])
    expect(result.summaryLibrary).toEqual([{ id: 'sum_1' }])
    expect(result.chatSessions).toEqual([{ id: 'char_1' }])
    expect(result.chatSessionParticipants).toEqual([{ id: 'participant_1', sessionId: 'char_1' }])
    expect(result.chatMessages).toEqual([{ id: 1, sessionId: 'char_1' }])
    expect(result.chatMessageProjections).toEqual([{ id: 'projection_1', sessionId: 'char_1', messageId: 1 }])
    expect(result.chatMessageProjectionVisibility).toEqual([{ id: 'visibility_1', projectionId: 'projection_1', characterId: 'char_1' }])
    expect(result.chatProjectionWritebackRuns).toEqual([{ id: 'writeback_1', sessionId: 'char_1', characterId: 'char_1' }])
    expect(result.chatPromptLogs).toEqual([{ id: 'log_1', sessionId: 'char_1' }])
    expect(result.chatRecallActivityLogs).toEqual([{ id: 'recall_log_1', sessionId: 'char_1' }])
    expect(result.workspaceTarget).toBe('char_1')
    expect(result.workspaceSessionId).toBe('session_1')
    expect(result.tasks).toEqual([{ id: 'task_1' }])
    expect(result.settings.currentTime).toBe('08:00')
    expect(result.recentMarkTypes).toEqual(['start'])
  })

  it('omits chat payload when includeAllChats is false', () => {
    const database = createDbStub()
    const repository = createWorkspaceSnapshotReadRepository(database, {
      repairWorkspaceSnapshotStorage: vi.fn(),
      resourceRepository: {
        getResources: vi.fn(() => null),
        getTickets: vi.fn(() => []),
        getTicketCategories: vi.fn(() => []),
        getHistory: vi.fn(() => []),
        getTimers: vi.fn(() => []),
        getCustomTags: vi.fn(() => []),
        getEventStack: vi.fn(() => [])
      },
      characterRepository: {
        getCharacters: vi.fn(() => []),
        getCharacterGroups: vi.fn(() => []),
        getGroups: vi.fn(() => []),
        getCrowds: vi.fn(() => []),
        getAliases: vi.fn(() => []),
        getUserProfile: vi.fn(() => null),
        getDocuments: vi.fn(() => []),
        getBrainNeurons: vi.fn(() => [])
      },
      chatRepository: {
        getAllSessions: vi.fn(() => [{ id: 'should_not_read' }]),
        getAllMessages: vi.fn(() => [{ id: 999 }]),
        getAllSessionParticipants: vi.fn(() => [{ id: 'should_not_read' }]),
        getAllPromptLogs: vi.fn(() => [{ id: 'should_not_read' }]),
        getAllRecallActivityLogs: vi.fn(() => [{ id: 'should_not_read' }]),
        getSummaryLibrary: vi.fn(() => []),
        getSmallSummaries: vi.fn(() => []),
        getBigSummaries: vi.fn(() => [])
      },
      taskRepository: {
        getTasksForSnapshot: vi.fn(() => []),
        getTaskLogs: vi.fn(() => []),
        getDailyReports: vi.fn(() => [])
      },
      settingRepository: {
        getApiPresets: vi.fn(() => []),
        getPromptPresets: vi.fn(() => []),
        getAllConfigs: vi.fn(() => [])
      }
    })

    const result = repository.readWorkspaceExportPayload()

    expect(result.chatSessions).toEqual([])
    expect(result.chatMessages).toEqual([])
    expect(result.chatSessionParticipants).toEqual([])
    expect(result.chatPromptLogs).toEqual([])
  })
})
