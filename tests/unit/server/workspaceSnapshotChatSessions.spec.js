import { describe, expect, it, vi } from 'vitest'

import { readChatSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/readChats.js'
import { applyChatSnapshotPartition } from '../../../server/repositories/workspaceSnapshot/restoreChats.js'
import { WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP } from '../../../server/repositories/workspaceSnapshot/shared.js'

describe('workspace snapshot chat session truth', () => {
  it('exports session metadata for bootstrap without full chat payload', () => {
    const chatRepository = {
      getSummaryLibrary: vi.fn(() => [{ id: 'sum_1' }]),
      getSmallSummaries: vi.fn(() => []),
      getBigSummaries: vi.fn(() => []),
      getAllSessions: vi.fn(() => [{ id: 'session_1', title: '标题' }]),
      getLastMessageBySessionId: vi.fn(() => ({ content: '<think>推理过程</think> 你好呀 ', created_at: '2026-07-04T01:00:00.000Z' })),
      countMessagesBySessionId: vi.fn(() => 3),
      getAllSessionParticipants: vi.fn(() => [{ id: 'participant_1', sessionId: 'session_1' }]),
      getAllCharacterPresences: vi.fn(() => [{ id: 'presence_1', sessionId: 'session_1', worldId: 'world_1', participantId: 'participant_1', presenceState: 'present' }]),
      getAllCharacterPresenceEvents: vi.fn(() => [{ id: 'presence_event_1', presenceId: 'presence_1', sessionId: 'session_1', participantId: 'participant_1', eventType: 'committed' }]),
      getAllMessages: vi.fn(() => [{ id: 1, sessionId: 'session_1' }]),
      getAllMessageProjections: vi.fn(() => [{ id: 'projection_1', sessionId: 'session_1', messageId: 1 }]),
      getAllMessageProjectionVisibility: vi.fn(() => [{ id: 'visibility_1', projectionId: 'projection_1', characterId: 'char_1' }]),
      getAllProjectionWritebackRuns: vi.fn(() => [{ id: 'writeback_1', sessionId: 'session_1', characterId: 'char_1' }]),
      getAllMessageNotes: vi.fn(() => []),
      getAllAffectGateAudits: vi.fn(() => []),
      getAllAffectLedgerEntries: vi.fn(() => []),
      getAllAffectResidueCheckpoints: vi.fn(() => []),
      getAllPromptLogs: vi.fn(() => [{ id: 'log_1', sessionId: 'session_1' }]),
      getAllRecallActivityLogs: vi.fn(() => []),
      getAllSessionTemporaryCharacters: vi.fn(() => [{ id: 'temp_1', sessionId: 'session_1', name: '杂货商' }]),
      getAllSessionTemporaryEntities: vi.fn(() => [{ id: 'entity_1', sessionId: 'session_1', kind: 'region', name: '旧港区' }]),
      getAllNarrativeConfigs: vi.fn(() => [{ worldId: 'world_1', theme: '信任' }]),
      getAllNarrativeSeeds: vi.fn(() => [{ id: 'seed_1', worldId: 'world_1', title: '钟楼' }]),
      getAllNarrativeSeedParticipants: vi.fn(() => [{ id: 'part_1', seedId: 'seed_1' }]),
      getAllNarrativeSeedLinks: vi.fn(() => []),
      getAllNarrativeSeedEvents: vi.fn(() => [{ id: 'event_1', seedId: 'seed_1' }])
    }

    expect(readChatSnapshotPartition(chatRepository, { includeAllChats: false })).toMatchObject({
      chatSessions: [],
      chatSessionParticipants: [],
      chatMessages: [],
      chatMessageProjections: [],
      chatMessageProjectionVisibility: [],
      chatProjectionWritebackRuns: [],
      chatPromptLogs: [],
      chatSessionTemporaryCharacters: [],
      chatSessionTemporaryEntities: []
    })

    expect(readChatSnapshotPartition(chatRepository, { includeAllChats: false, includeChatMetadata: true })).toMatchObject({
      chatSessions: [{
        id: 'session_1',
        title: '标题',
        lastMessagePreview: '你好呀',
        lastMessageAt: '2026-07-04T01:00:00.000Z',
        messageCount: 3
      }],
      chatSessionParticipants: [{ id: 'participant_1', sessionId: 'session_1' }],
      chatMessages: [],
      chatMessageProjections: [],
      chatMessageProjectionVisibility: [],
      chatProjectionWritebackRuns: [],
      chatPromptLogs: [],
      chatSessionTemporaryCharacters: [],
      chatSessionTemporaryEntities: []
    })

    expect(readChatSnapshotPartition(chatRepository, { includeAllChats: true })).toMatchObject({
      chatSessions: [{ id: 'session_1', title: '标题' }],
      chatSessionParticipants: [{ id: 'participant_1', sessionId: 'session_1' }],
      chatSessionCharacterPresences: [{ id: 'presence_1', presenceState: 'present' }],
      chatSessionCharacterPresenceEvents: [{ id: 'presence_event_1', eventType: 'committed' }],
      chatMessages: [{ id: 1, sessionId: 'session_1' }],
      chatMessageProjections: [{ id: 'projection_1', sessionId: 'session_1', messageId: 1 }],
      chatMessageProjectionVisibility: [{ id: 'visibility_1', projectionId: 'projection_1', characterId: 'char_1' }],
      chatProjectionWritebackRuns: [{ id: 'writeback_1', sessionId: 'session_1', characterId: 'char_1' }],
      chatMessageNotes: [],
      chatAffectGateAudits: [],
      chatAffectLedgerEntries: [],
      chatAffectResidueCheckpoints: [],
      chatPromptLogs: [{ id: 'log_1', sessionId: 'session_1' }],
      chatSessionTemporaryCharacters: [{ id: 'temp_1', sessionId: 'session_1', name: '杂货商' }],
      chatSessionTemporaryEntities: [{ id: 'entity_1', sessionId: 'session_1', kind: 'region', name: '旧港区' }],
      worldNarrativeConfigs: [{ worldId: 'world_1', theme: '信任' }],
      worldNarrativeSeeds: [{ id: 'seed_1', worldId: 'world_1', title: '钟楼' }],
      worldNarrativeSeedParticipants: [{ id: 'part_1', seedId: 'seed_1' }],
      worldNarrativeSeedEvents: [{ id: 'event_1', seedId: 'seed_1' }]
    })
  })

  it('restores full session metadata, participants, messages, and prompt logs together', () => {
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
      replaceChatMessageNotes: vi.fn(),
      replaceChatAffectGateAudits: vi.fn(),
      replaceChatAffectLedgerEntries: vi.fn(),
      replaceChatAffectResidueCheckpoints: vi.fn(),
      replaceSessionTemporaryCharacters: vi.fn(),
      replaceSessionTemporaryEntities: vi.fn(),
      replaceChatPromptLogs: vi.fn(),
      replaceChatRecallActivityLogs: vi.fn(),
      replaceWorlds: vi.fn(),
      replaceNarrativeSeedData: vi.fn(),
      backfillSessionParticipants: vi.fn()
    }

    applyChatSnapshotPartition(chatRepository, {
      chatSessions: [{
        id: 'session_1',
        targetId: 'char_1',
        targetType: 'char',
        title: '手动标题',
        summary: '摘要',
        lastSummaryTime: '2026-04-28T01:00:00.000Z',
        contextSummary: '上下文',
        isArchived: 1,
        archiveName: '归档名',
        archiveCategory: '日常',
        narrationFrequency: 'active',
        narrationTemperature: 'open',
        worldId: 'world_1',
        virtualSceneWorldId: 'world_1',
        virtualLocationSheetId: 'sheet_2',
        virtualLocationFeatureId: 'feature_9',
        sourceTargetId: 'char_1',
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T02:00:00.000Z'
      }],
      worlds: [{ id: 'world_1', name: '世界一', defaultMapSheetId: 'sheet_2' }],
      worldNarrativeConfigs: [{ worldId: 'world_1', theme: '信任与背叛', version: 2 }],
      worldNarrativeSeeds: [{
        id: 'seed_1', worldId: 'world_1', type: 'countdown', title: '钟楼倒计时',
        visibility: { knownByParticipantIds: ['char_1'] }, version: 3
      }],
      worldNarrativeSeedParticipants: [{
        id: 'seed_part_1', seedId: 'seed_1', worldId: 'world_1', participantType: 'character', participantId: 'char_1'
      }],
      worldNarrativeSeedLinks: [],
      worldNarrativeSeedEvents: [{
        id: 'seed_event_1', seedId: 'seed_1', worldId: 'world_1', eventType: 'created', diff: { created: true }
      }],
      chatSessionParticipants: [{
        id: 'participant_1',
        sessionId: 'session_1',
        participantTargetId: 'char_1',
        participantType: 'char',
        displayOrder: 0
      }],
      chatMessages: [{
        sessionId: 'session_1',
        role: 'assistant',
        messageKind: 'narration',
        content: '你好',
        autoWriteHidden: true,
        autoWriteBatchId: 'batch_1',
        attachmentsJson: [{ id: 'attach_1', kind: 'image', url: '/chat-images/attach_1.png', mime: 'image/png' }]
      }],
      chatMessageProjections: [{
        id: 'projection_1',
        sessionId: 'session_1',
        messageId: 1,
        attemptId: 'attempt_1',
        status: 'partial',
        messageKind: 'narration',
        speakerId: 'char_1',
        speakerName: '星依',
        audienceIds: ['user'],
        audienceNames: ['用户'],
        participants: ['星依', '用户'],
        objectiveFact: '星依向用户问好。',
        fallbackCleanText: '你好',
        startEnv: { time: '上午' },
        endEnv: { time: '上午' },
        changed: { time: false },
        sourceProjectionIds: ['projection_0'],
        failureStage: 'validate',
        failureReason: '地点缺失',
        completedAt: '2026-05-28T01:00:00.000Z'
      }],
      chatMessageProjectionVisibility: [{
        id: 'visibility_1',
        projectionId: 'projection_1',
        sessionId: 'session_1',
        messageId: 1,
        characterId: 'char_1',
        visibility: 'hidden',
        reason: 'joined_after_projection',
        writebackRunId: 'writeback_1'
      }],
      chatProjectionWritebackRuns: [{
        id: 'writeback_1',
        sessionId: 'session_1',
        characterId: 'char_1',
        runKind: 'manual',
        status: 'partial',
        rangeStartMessageId: 1,
        rangeEndMessageId: 20,
        sourceProjectionIds: ['projection_1'],
        successEventIds: ['event_1'],
        failedEvents: [{ projectionId: 'projection_1' }],
        error: { message: '部分失败' }
      }],
      legacyRetiredBatches: [{ id: 'batch_1', sessionId: 'session_1' }],
      chatSessionTemporaryCharacters: [{
        id: 'temp_1',
        sessionId: 'session_1',
        name: '杂货商',
        aliases: ['老板'],
        markdown: '只在本会话出现。',
        sourceLedger: [{ source: 'manual' }],
        lockedFields: ['身份'],
        status: 'active',
        createdAt: '2026-05-12T01:00:00.000Z',
        updatedAt: '2026-05-12T01:30:00.000Z'
      }],
      chatSessionTemporaryEntities: [{
        id: 'entity_region_1',
        sessionId: 'session_1',
        worldId: 'world_1',
        kind: 'region',
        name: '旧港区',
        aliases: ['旧港'],
        markdown: '## 名称\n旧港区',
        tags: ['港口', '危险'],
        sourceLedger: [{ source: 'manual' }],
        status: 'active',
        persistedTarget: { type: 'document', id: 'doc_1' },
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:30:00.000Z'
      }],
      chatPromptLogs: [{
        id: 'log_1',
        sessionId: 'session_1',
        pageIndex: 1,
        entryIndex: 1,
        assistantMessageId: 7,
        speakerName: '星依',
        targetId: 'char_1',
        finalPrompt: 'prompt',
        promptBlocks: [{ id: 'block_1' }]
      }],
      chatRecallActivityLogs: [{
        id: 'recall_1',
        sessionId: 'session_1',
        pageIndex: 1,
        entryIndex: 1,
        inputMessageId: 0,
        assistantMessageId: 7,
        speakerName: '旁白',
        targetId: 'char_1',
        runId: 'narration_recall_session_1_7',
        status: 'completed',
        activity: {
          id: 'narration_recall_session_1_7',
          status: 'completed',
          events: [{ id: 'narration_recall_7_summary', status: 'completed' }]
        },
        createdAt: '2026-05-10T02:00:00.000Z'
      }]
    })

    expect(chatRepository.replaceChatSessions).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'session_1',
        title: '手动标题',
        summary: '摘要',
        last_summary_time: '2026-04-28T01:00:00.000Z',
        context_summary: '上下文',
        is_archived: 1,
        archive_name: '归档名',
        archive_category: '日常',
        narration_frequency: 'active',
        narration_temperature: 'open',
        world_id: 'world_1',
        virtual_scene_world_id: 'world_1',
        virtual_location_sheet_id: 'sheet_2',
        virtual_location_feature_id: 'feature_9',
        source_target_id: 'char_1',
        created_at: '2026-04-28T00:00:00.000Z'
      })
    ])
    expect(chatRepository.replaceWorlds).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'world_1', defaultMapSheetId: 'sheet_2' })
    ])
    expect(chatRepository.replaceNarrativeSeedData).toHaveBeenCalledWith(expect.objectContaining({
      configs: [expect.objectContaining({ worldId: 'world_1', content: '信任与背叛', version: 2 })],
      seeds: [expect.objectContaining({
        id: 'seed_1', worldId: 'world_1', type: 'countdown', version: 3,
        visibilityJson: JSON.stringify({ knownByParticipantIds: ['char_1'] })
      })],
      participants: [expect.objectContaining({ seedId: 'seed_1', participantId: 'char_1' })],
      events: [expect.objectContaining({ seedId: 'seed_1', diffJson: JSON.stringify({ created: true }) })]
    }))
    expect(chatRepository.replaceChatSessionParticipants).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionId: 'session_1',
        participantTargetId: 'char_1'
      })
    ])
    expect(chatRepository.replaceChatMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        sessionId: 'session_1',
        messageKind: 'narration',
        content: '你好',
        autoWriteHidden: 1,
        autoWriteBatchId: 'batch_1',
        attachmentsJson: JSON.stringify([{ id: 'attach_1', kind: 'image', url: '/chat-images/attach_1.png', mime: 'image/png' }])
      })
    ])
    expect(chatRepository.replaceMessageProjections).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'projection_1',
        sessionId: 'session_1',
        messageId: 1,
        status: 'partial',
        audienceIdsJson: JSON.stringify(['user']),
        participantsJson: JSON.stringify(['星依', '用户']),
        objectiveFact: '星依向用户问好。',
        sourceProjectionIdsJson: JSON.stringify(['projection_0'])
      })
    ])
    expect(chatRepository.replaceMessageProjectionVisibility).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'visibility_1',
        projectionId: 'projection_1',
        characterId: 'char_1',
        visibility: 'hidden',
        reason: 'joined_after_projection'
      })
    ])
    expect(chatRepository.replaceProjectionWritebackRuns).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'writeback_1',
        sessionId: 'session_1',
        characterId: 'char_1',
        runKind: 'manual',
        sourceProjectionIdsJson: JSON.stringify(['projection_1']),
        successEventIdsJson: JSON.stringify(['event_1']),
        failedEventsJson: JSON.stringify([{ projectionId: 'projection_1' }])
      })
    ])
    expect(chatRepository.replaceSessionTemporaryCharacters).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'temp_1',
        sessionId: 'session_1',
        name: '杂货商',
        aliasesJson: JSON.stringify(['老板']),
        markdown: '只在本会话出现。',
        sourceLedgerJson: JSON.stringify([{ source: 'manual' }]),
        lockedFieldsJson: JSON.stringify(['身份']),
        status: 'active'
      })
    ])
    expect(chatRepository.replaceSessionTemporaryEntities).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'entity_region_1',
        sessionId: 'session_1',
        worldId: 'world_1',
        kind: 'region',
        name: '旧港区',
        aliasesJson: JSON.stringify(['旧港']),
        markdown: '## 名称\n旧港区',
        tagsJson: JSON.stringify(['港口', '危险']),
        sourceLedgerJson: JSON.stringify([{ source: 'manual' }]),
        persistedTargetJson: JSON.stringify({ type: 'document', id: 'doc_1' }),
        status: 'active'
      })
    ])
    expect(chatRepository.replaceChatPromptLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'log_1',
        sessionId: 'session_1',
        promptBlocksJson: JSON.stringify([{ id: 'block_1' }])
      })
    ])
    expect(chatRepository.replaceChatRecallActivityLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'recall_1',
        sessionId: 'session_1',
        assistantMessageId: 7,
        speakerName: '旁白',
        runId: 'narration_recall_session_1_7',
        activityJson: JSON.stringify({
          id: 'narration_recall_session_1_7',
          status: 'completed',
          events: [{ id: 'narration_recall_7_summary', status: 'completed' }]
        })
      })
    ])
  })

  it('keeps prompt logs in the chats partition whitelist', () => {
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatPromptLogs')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatMessageProjections')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatMessageProjectionVisibility')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatProjectionWritebackRuns')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatAffectResidueCheckpoints')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatRecallActivityLogs')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionTemporaryCharacters')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionTemporaryEntities')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('characterSnapshots')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionCharacterBranches')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionCharacterPresences')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionCharacterPresenceEvents')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionNarrativeOverrides')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).not.toContain('chatSessionDirectorTasks')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).not.toContain('chatSessionDirectives')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatSessionOrchestrationStates')
    expect(WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP.chats).toContain('chatStatusPanelEvents')
  })

  it('exports snapshot blobs as base64 and restores participants before validated private branches', () => {
    const chatRepository = {
      getSummaryLibrary: vi.fn(() => []),
      getSmallSummaries: vi.fn(() => []),
      getBigSummaries: vi.fn(() => []),
      getAllSessions: vi.fn(() => [{ id: 'session_1', worldId: 'world_1' }]),
      getAllSessionParticipants: vi.fn(() => [{
        id: 'participant_1',
        sessionId: 'session_1',
        participantTargetId: 'char_1',
        participantType: 'char',
        characterStateMode: 'independent_snapshot',
        characterBranchId: 'branch_1'
      }]),
      getAllCharacterPresences: vi.fn(() => [{
        id: 'presence_1', sessionId: 'session_1', worldId: 'world_1', participantId: 'participant_1',
        presenceState: 'present', version: 2, lastModifiedSource: 'fact_reconciliation'
      }]),
      getAllCharacterPresenceEvents: vi.fn(() => [{
        id: 'presence_event_1', presenceId: 'presence_1', sessionId: 'session_1', worldId: 'world_1', participantId: 'participant_1',
        eventType: 'committed', transition: 'enter', fromState: 'unknown', toState: 'present', provisional: false,
        idempotencyKey: 'presence:snapshot:1'
      }]),
      getAllSessionNarrativeOverrides: vi.fn(() => [{
        id: 'override_1', sessionId: 'session_1', worldId: 'world_1', content: '更悬疑', version: 2
      }]),
      getAllSessionOrchestrationStates: vi.fn(() => [{
        id: 'state_1', sessionId: 'session_1', worldId: 'world_1', scenarioCode: 'investigation',
        anchorMessageId: '101', version: 2
      }]),
      getAllMessages: vi.fn(() => []),
      getAllMessageProjections: vi.fn(() => []),
      getAllMessageProjectionVisibility: vi.fn(() => []),
      getAllProjectionWritebackRuns: vi.fn(() => []),
      getAllSessionTemporaryCharacters: vi.fn(() => []),
      getAllSessionTemporaryEntities: vi.fn(() => []),
      getAllStatusPanelTemplates: vi.fn(() => [{ id: 'status_template_1', sessionId: 'session_1', kind: 'character', name: '角色状态栏' }]),
      getAllStatusPanels: vi.fn(() => [{
        id: 'status_panel_1', sessionId: 'session_1', templateId: 'status_template_1', name: '沈青梧',
        hostType: 'session_character', hostId: 'participant_1', valuesJson: '{}', fieldsJson: '[]', version: 4
      }]),
      getAllStatusPanelEvents: vi.fn(() => [{
        id: 'status_event_1', panelId: 'status_panel_1', sessionId: 'session_1', eventType: 'patched',
        fromVersion: 3, toVersion: 4, idempotencyKey: 'status:snapshot:1'
      }]),
      getAllMessageNotes: vi.fn(() => []),
      getAllAffectGateAudits: vi.fn(() => []),
      getAllAffectLedgerEntries: vi.fn(() => []),
      getAllAffectResidueCheckpoints: vi.fn(() => []),
      getAllPromptLogs: vi.fn(() => []),
      getAllRecallActivityLogs: vi.fn(() => [])
    }
    const sourceBlob = Buffer.from([31, 139, 8, 0])
    const snapshotRepository = {
      getAllSnapshots: vi.fn(() => [{ id: 'snapshot_1', characterId: 'char_1', payloadGzip: sourceBlob }]),
      getAllBranches: vi.fn(() => [{
        id: 'branch_1', sessionId: 'session_1', participantId: 'participant_1', characterId: 'char_1',
        sourceSnapshotId: 'snapshot_1', payloadGzip: sourceBlob
      }]),
      replaceAllSnapshots: vi.fn(),
      replaceAllBranches: vi.fn()
    }

    const exported = readChatSnapshotPartition(chatRepository, { includeAllChats: true }, snapshotRepository)
    expect(exported.characterSnapshots[0].payloadGzipBase64).toBe(sourceBlob.toString('base64'))
    expect(exported.chatSessionCharacterBranches[0].payloadGzipBase64).toBe(sourceBlob.toString('base64'))
    expect(exported.chatSessionCharacterPresences).toMatchObject([{ id: 'presence_1', presenceState: 'present', version: 2 }])
    expect(exported.chatSessionCharacterPresenceEvents).toMatchObject([{ id: 'presence_event_1', eventType: 'committed' }])
    expect(exported.chatSessionNarrativeOverrides).toMatchObject([{ id: 'override_1', content: '更悬疑', version: 2 }])
    expect(exported.chatSessionDirectorTasks).toBeUndefined()
    expect(exported.chatSessionDirectives).toBeUndefined()
    expect(exported.chatSessionOrchestrationStates).toMatchObject([{ id: 'state_1', scenarioCode: 'investigation' }])
    expect(exported.chatStatusPanels).toMatchObject([{ id: 'status_panel_1', hostType: 'session_character', hostId: 'participant_1', version: 4 }])
    expect(exported.chatStatusPanelEvents).toMatchObject([{ id: 'status_event_1', eventType: 'patched', toVersion: 4 }])

    const restoreChatRepository = {
      replaceSummaryLibrary: vi.fn(), replaceSmallSummaries: vi.fn(), replaceBigSummaries: vi.fn(),
      replaceChatSessions: vi.fn(), replaceChatMessages: vi.fn(), replaceMessageProjections: vi.fn(),
      replaceMessageProjectionVisibility: vi.fn(), replaceProjectionWritebackRuns: vi.fn(),
      replaceChatSessionParticipants: vi.fn(), replaceChatMessageNotes: vi.fn(), replaceChatAffectGateAudits: vi.fn(),
      replaceChatAffectLedgerEntries: vi.fn(), replaceChatAffectResidueCheckpoints: vi.fn(),
      replaceSessionTemporaryCharacters: vi.fn(), replaceSessionTemporaryEntities: vi.fn(),
      replaceStatusPanelTemplates: vi.fn(), replaceStatusPanels: vi.fn(), replaceStatusPanelEvents: vi.fn(),
      replaceChatPromptLogs: vi.fn(), replaceChatRecallActivityLogs: vi.fn(), backfillSessionParticipants: vi.fn(),
      replaceCharacterPresences: vi.fn(), replaceCharacterPresenceEvents: vi.fn(),
      replaceSessionNarrativeOverrides: vi.fn(), replaceSessionOrchestrationStates: vi.fn()
    }
    applyChatSnapshotPartition(restoreChatRepository, {
      chatSessions: [{ id: 'session_1', targetId: 'char_1', worldId: 'world_1' }],
      chatMessages: [],
      chatSessionParticipants: exported.chatSessionParticipants,
      characterSnapshots: exported.characterSnapshots,
      chatSessionCharacterBranches: exported.chatSessionCharacterBranches,
      chatSessionCharacterPresences: exported.chatSessionCharacterPresences,
      chatSessionCharacterPresenceEvents: exported.chatSessionCharacterPresenceEvents,
      chatSessionNarrativeOverrides: exported.chatSessionNarrativeOverrides,
      chatSessionOrchestrationStates: exported.chatSessionOrchestrationStates,
      chatStatusPanelTemplates: exported.chatStatusPanelTemplates,
      chatStatusPanels: exported.chatStatusPanels,
      chatStatusPanelEvents: exported.chatStatusPanelEvents
    }, snapshotRepository)

    expect(restoreChatRepository.replaceChatSessionParticipants).toHaveBeenCalledWith([
      expect.objectContaining({ characterStateMode: 'independent_snapshot', characterBranchId: 'branch_1' })
    ])
    expect(snapshotRepository.replaceAllSnapshots).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'snapshot_1', payloadGzip: expect.any(Buffer) })
    ])
    expect(snapshotRepository.replaceAllBranches).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'branch_1', sourceSnapshotId: 'snapshot_1', payloadGzip: expect.any(Buffer) })
    ])
    expect(restoreChatRepository.replaceCharacterPresences).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'presence_1', participantId: 'participant_1', presenceState: 'present', version: 2 })
    ])
    expect(restoreChatRepository.replaceCharacterPresenceEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'presence_event_1', presenceId: 'presence_1', eventType: 'committed' })
    ])
    expect(restoreChatRepository.replaceSessionNarrativeOverrides).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'override_1', content: '更悬疑', version: 2 })
    ])
    expect(restoreChatRepository.replaceSessionOrchestrationStates).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'state_1', scenarioCode: 'investigation', anchorMessageId: '101' })
    ])
    expect(restoreChatRepository.replaceStatusPanels).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'status_panel_1', hostType: 'session_character', hostId: 'participant_1', version: 4 })
    ])
    expect(restoreChatRepository.replaceStatusPanelEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'status_event_1', panelId: 'status_panel_1', eventType: 'patched', toVersion: 4 })
    ])
  })

  it('bridges legacy temporary characters into temporary entities when old snapshots lack the unified table', () => {
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
      replaceChatMessageNotes: vi.fn(),
      replaceChatAffectGateAudits: vi.fn(),
      replaceChatAffectLedgerEntries: vi.fn(),
      replaceChatAffectResidueCheckpoints: vi.fn(),
      replaceSessionTemporaryCharacters: vi.fn(),
      replaceSessionTemporaryEntities: vi.fn(),
      replaceChatPromptLogs: vi.fn(),
      replaceChatRecallActivityLogs: vi.fn(),
      backfillSessionParticipants: vi.fn()
    }

    applyChatSnapshotPartition(chatRepository, {
      chatSessions: [{ id: 'session_1', targetId: 'char_1' }],
      chatMessages: [],
      chatSessionTemporaryCharacters: [{
        id: 'temp_1',
        sessionId: 'session_1',
        worldId: '',
        name: '杂货商',
        aliases: ['老板'],
        markdown: '只在本会话出现。',
        sourceLedger: [{ source: 'manual' }]
      }]
    })

    expect(chatRepository.replaceSessionTemporaryEntities).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'temp_1',
        sessionId: 'session_1',
        kind: 'character',
        name: '杂货商',
        aliasesJson: JSON.stringify(['老板']),
        markdown: '只在本会话出现。',
        tagsJson: '[]',
        persistedTargetJson: '{}'
      })
    ])
  })

  it('rejects a snapshot whose panel points at a missing formal status asset', () => {
    const chatRepository = {
      replaceSummaryLibrary: vi.fn(),
      replaceSmallSummaries: vi.fn(),
      replaceBigSummaries: vi.fn()
    }

    expect(() => applyChatSnapshotPartition(chatRepository, {
      chatStatusPanels: [{
        id: 'panel_1',
        values: { cover: { assetId: 'status_asset_missing', kind: 'image', alt: '缺失图片' } }
      }],
      chatStatusAssets: []
    })).toThrow('状态面板快照引用了缺失的图片资产')
    expect(chatRepository.replaceSummaryLibrary).not.toHaveBeenCalled()
  })
})
