import { describe, expect, it, vi } from 'vitest'

import { createWorkspaceSnapshotRestoreRepository } from '../../../server/repositories/workspaceSnapshotRestoreRepository.js'
import { createWorkspaceSnapshotRestoreParts } from '../../../server/repositories/workspaceSnapshotRestoreParts.js'

function createDbStub() {
  return {
    exec: vi.fn(),
    prepare() {
      return {
        all: vi.fn(() => []),
        get: vi.fn(() => undefined),
        run: vi.fn()
      }
    }
  }
}

describe('workspace snapshot restore repository', () => {
  it('splits restore work into dedicated snapshot partitions', () => {
    const database = createDbStub()
    const parts = createWorkspaceSnapshotRestoreParts({
      database,
      resourceRepository: {
        patchResources: vi.fn(),
        replaceTicketCategories: vi.fn(),
        replaceTickets: vi.fn(),
        replaceTimers: vi.fn(),
        replaceHistory: vi.fn()
      },
      characterRepository: {
        replaceCharacterGroups: vi.fn(),
        replaceCharacters: vi.fn(),
        replaceGroups: vi.fn(),
        replaceCrowds: vi.fn(),
        replaceAliases: vi.fn(),
        replaceUserProfile: vi.fn()
      },
      chatRepository: {
        replaceSummaryLibrary: vi.fn(),
        replaceSmallSummaries: vi.fn(),
        replaceBigSummaries: vi.fn(),
        replaceChatSessions: vi.fn(),
        replaceChatMessages: vi.fn(),
        replaceMessageProjections: vi.fn(),
        replaceMessageProjectionVisibility: vi.fn(),
        replaceProjectionWritebackRuns: vi.fn(),
        replaceChatSessionParticipants: vi.fn(),
        backfillSessionParticipants: vi.fn(),
        replaceChatPromptLogs: vi.fn()
      },
      settingRepository: {
        replaceApiPresets: vi.fn(),
        replacePromptPresets: vi.fn(),
        upsertConfigValue: vi.fn()
      },
      taskRepository: {
        replaceTasks: vi.fn(),
        replaceTaskLogs: vi.fn(),
        replaceDailyReports: vi.fn()
      }
    })

    parts.applyResourcePartition({ resources: { points: 2 } })
    parts.applySettingsPartition({ settings: { currentWeather: 'sunny' } })
    parts.applyTaskPartition({ tasks: [{ id: 'task_1', title: '学习' }] })

    expect(parts).toHaveProperty('applyCharacterPartition')
    expect(parts).toHaveProperty('applyChatPartition')
  })

  it('routes resources and settings restore through injected repositories', () => {
    const database = createDbStub()
    const resourceRepository = {
      patchResources: vi.fn(),
      replaceTicketCategories: vi.fn(),
      replaceTickets: vi.fn(),
      replaceTimers: vi.fn(),
      replaceHistory: vi.fn()
    }
    const settingRepository = {
      replaceApiPresets: vi.fn(),
      replacePromptPresets: vi.fn(),
      upsertConfigValue: vi.fn()
    }
    const repository = createWorkspaceSnapshotRestoreRepository(database, {
      resourceRepository,
      settingRepository
    })

    const result = repository.applyWorkspaceSnapshotRestore({
      resources: { points: 6, money: 9 },
      ticketCategories: [{ id: 'cat_1', name: '日常', orderIndex: 1 }],
      tickets: [{ id: 'ticket_1', name: '咖啡', cost: 2, count: 1, categoryId: 'cat_1', timerMinutes: 15, autoConsumeNext: 0, icon: '', orderIndex: 0 }],
      timers: [{ id: 'timer_1', ticketId: 'ticket_1', ticketName: '咖啡', remainingMs: 3000, paused: 1 }],
      history: [{ action: '新增', detail: '票据', createdAt: '2026-04-03T00:00:00.000Z' }],
      settings: {
        apiPresets: [{ name: '默认', baseUrl: 'https://a', apiKey: 'k', model: 'm', availableModels: ['m'], maxTokens: 1000, temperature: 0.5, isDefault: true, fallbackPreset: '' }],
        promptPresets: [{ id: 'preset_1', name: '日常', content: 'hello', role: 'system', scene: 'all', frequency: 0, enabled: true, orderIndex: 0 }],
        currentWeather: 'sunny'
      }
    }, ['resources', 'settings'])

    expect(result.ok).toBe(true)
    expect(database.exec).toHaveBeenNthCalledWith(1, 'BEGIN')
    expect(database.exec).toHaveBeenLastCalledWith('COMMIT')
    expect(resourceRepository.patchResources).toHaveBeenCalledWith({
      points: 6,
      bigTimeCount: 0,
      smallTimeCount: 0,
      money: 9
    })
    expect(resourceRepository.replaceTicketCategories).toHaveBeenCalled()
    expect(resourceRepository.replaceTickets).toHaveBeenCalled()
    expect(resourceRepository.replaceTimers).toHaveBeenCalled()
    expect(resourceRepository.replaceHistory).toHaveBeenCalled()
    expect(settingRepository.replaceApiPresets).toHaveBeenCalled()
    expect(settingRepository.replacePromptPresets).toHaveBeenCalled()
    expect(settingRepository.upsertConfigValue).toHaveBeenCalledWith('currentWeather', 'sunny')
  })

  it('routes task restore through injected task repository', () => {
    const database = createDbStub()
    const taskRepository = {
      replaceTasks: vi.fn(),
      replaceTaskLogs: vi.fn(),
      replaceDailyReports: vi.fn()
    }
    const repository = createWorkspaceSnapshotRestoreRepository(database, {
      resourceRepository: {
        patchResources: vi.fn(),
        replaceTicketCategories: vi.fn(),
        replaceTickets: vi.fn(),
        replaceTimers: vi.fn(),
        replaceHistory: vi.fn()
      },
      settingRepository: {
        replaceApiPresets: vi.fn(),
        replacePromptPresets: vi.fn(),
        upsertConfigValue: vi.fn()
      },
      taskRepository
    })

    const result = repository.applyWorkspaceSnapshotRestore({
      tasks: [{
        id: 'task_1',
        title: '学习',
        type: 'daily',
        status: 'active',
        pointsReward: 3,
        expReward: 8,
        category: '成长'
      }],
      taskLogs: [{
        taskId: 'task_1',
        taskTitle: '学习',
        durationSeconds: 60
      }],
      dailyReports: [{
        date: '2026-04-03',
        content: '今天认真学习',
        tasksSummary: '完成一项',
        tomorrowTasks: ['继续学习']
      }],
      recentMarkTypes: ['start'],
      userLevel: { level: 2 },
      dailyActivity: { done: 1 }
    }, ['tasks'])

    expect(result.ok).toBe(true)
    expect(taskRepository.replaceTasks).toHaveBeenCalled()
    expect(taskRepository.replaceTaskLogs).toHaveBeenCalled()
    expect(taskRepository.replaceDailyReports).toHaveBeenCalled()
  })

  it('routes character restore through injected character repository', () => {
    const database = createDbStub()
    const characterRepository = {
      replaceCharacterGroups: vi.fn(),
      replaceCharacters: vi.fn(),
      replaceGroups: vi.fn(),
      replaceCrowds: vi.fn(),
      replaceAliases: vi.fn(),
      replaceUserProfile: vi.fn()
    }
    const repository = createWorkspaceSnapshotRestoreRepository(database, {
      characterRepository,
      resourceRepository: {
        patchResources: vi.fn(),
        replaceTicketCategories: vi.fn(),
        replaceTickets: vi.fn(),
        replaceTimers: vi.fn(),
        replaceHistory: vi.fn()
      },
      settingRepository: {
        replaceApiPresets: vi.fn(),
        replacePromptPresets: vi.fn(),
        upsertConfigValue: vi.fn()
      },
      taskRepository: {
        replaceTasks: vi.fn(),
        replaceTaskLogs: vi.fn(),
        replaceDailyReports: vi.fn()
      }
    })

    const result = repository.applyWorkspaceSnapshotRestore({
      characterGroups: [{ id: 'default', name: '默认', emoji: '👤', orderIndex: 0 }],
      characters: [{ id: 'char_1', name: '星依', avatarPath: '/avatars/char_1.png' }],
      groups: [{ id: 'group_1', name: '小队', members: ['char_1'] }],
      crowds: [{ id: 'crowd_1', name: '群众', members: ['a', 'b'] }],
      aliases: [{ id: 'alias_1', name: '马甲一号', affections: { dad: 100 } }],
      userProfile: { name: '用户', desc: '最厉害' }
    }, ['characters'])

    expect(result.ok).toBe(true)
    expect(characterRepository.replaceCharacterGroups).toHaveBeenCalled()
    expect(characterRepository.replaceCharacters).toHaveBeenCalled()
    expect(characterRepository.replaceGroups).toHaveBeenCalled()
    expect(characterRepository.replaceCrowds).toHaveBeenCalled()
    expect(characterRepository.replaceAliases).toHaveBeenCalled()
    expect(characterRepository.replaceUserProfile).toHaveBeenCalled()
  })

  it('routes chat restore through injected chat repository', () => {
    const database = createDbStub()
    const chatRepository = {
      replaceSummaryLibrary: vi.fn(),
      replaceSmallSummaries: vi.fn(),
      replaceBigSummaries: vi.fn(),
      replaceChatSessions: vi.fn(),
      replaceChatMessages: vi.fn(),
      replaceMessageProjections: vi.fn(),
      replaceMessageProjectionVisibility: vi.fn(),
      replaceProjectionWritebackRuns: vi.fn(),
      replaceChatSessionParticipants: vi.fn(),
      backfillSessionParticipants: vi.fn(),
      replaceChatAffectGateAudits: vi.fn(),
      replaceChatAffectLedgerEntries: vi.fn(),
      replaceChatAffectResidueCheckpoints: vi.fn(),
      replaceChatMessageNotes: vi.fn(),
      replaceSessionTemporaryCharacters: vi.fn(),
      replaceSessionTemporaryEntities: vi.fn(),
      replaceChatPromptLogs: vi.fn(),
      replaceChatRecallActivityLogs: vi.fn()
    }
    const repository = createWorkspaceSnapshotRestoreRepository(database, {
      chatRepository,
      characterRepository: {
        replaceCharacterGroups: vi.fn(),
        replaceCharacters: vi.fn(),
        replaceGroups: vi.fn(),
        replaceCrowds: vi.fn(),
        replaceAliases: vi.fn(),
        replaceUserProfile: vi.fn()
      },
      resourceRepository: {
        patchResources: vi.fn(),
        replaceTicketCategories: vi.fn(),
        replaceTickets: vi.fn(),
        replaceTimers: vi.fn(),
        replaceHistory: vi.fn()
      },
      settingRepository: {
        replaceApiPresets: vi.fn(),
        replacePromptPresets: vi.fn(),
        upsertConfigValue: vi.fn()
      },
      taskRepository: {
        replaceTasks: vi.fn(),
        replaceTaskLogs: vi.fn(),
        replaceDailyReports: vi.fn()
      }
    })

    const result = repository.applyWorkspaceSnapshotRestore({
      summaryLibrary: [{ id: 'sum_1', title: '总结' }],
      smallSummaries: [{ id: 'small_1', sessionId: 'char_1' }],
      bigSummaries: [{ id: 'big_1', name: '大总结' }],
      chatSessions: [{ id: 'char_1', targetId: 'char_1', targetType: 'char' }],
      chatSessionParticipants: [{ id: 'participant_1', sessionId: 'char_1', participantTargetId: 'char_1' }],
      chatMessages: [{ sessionId: 'char_1', role: 'assistant', content: '你好' }],
      chatPromptLogs: [{ id: 'log_1', sessionId: 'char_1', finalPrompt: 'prompt' }]
    }, ['chats'])

    expect(result.ok).toBe(true)
    expect(chatRepository.replaceSummaryLibrary).toHaveBeenCalled()
    expect(chatRepository.replaceSmallSummaries).toHaveBeenCalled()
    expect(chatRepository.replaceBigSummaries).toHaveBeenCalled()
    expect(chatRepository.replaceChatSessions).toHaveBeenCalled()
    expect(chatRepository.replaceChatMessages).toHaveBeenCalled()
    expect(chatRepository.replaceChatSessionParticipants).toHaveBeenCalled()
    expect(chatRepository.replaceChatPromptLogs).toHaveBeenCalled()
    expect(chatRepository.replaceChatRecallActivityLogs).toHaveBeenCalled()
  })
})
