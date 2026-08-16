import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'
import {
  decodeRecallActivityLogValue,
  isEncodedRecallActivityLogEnvelope
} from '../../../shared/recallActivityLogCodec.ts'

function createChatService(overrides = {}) {
  const chatRepository = {
    getSessionById: vi.fn(() => ({ id: 'char_1' })),
    getSessionsByIds: vi.fn((sessionIds) => sessionIds.map((id) => ({ id }))),
    getRecentMessagesBySessionId: vi.fn(() => [{ id: 1, content: 'hello' }]),
    upsertSession: vi.fn(),
    replaceSessionParticipants: vi.fn(),
    listSessionParticipants: vi.fn(() => []),
    ensureSession: vi.fn(),
    insertMessage: vi.fn(() => ({ lastInsertRowid: 9 })),
    transaction: vi.fn((work) => work()),
    insertMessages: vi.fn((_sessionId, messages) => ({ count: messages.length })),
    insertMessagesAtomic: vi.fn((_sessionId, messages) => ({ count: messages.length })),
    touchSession: vi.fn(),
    updateMessageBySession: vi.fn(),
    deleteMessageBySession: vi.fn(),
    findMessageByIdInSession: vi.fn(() => ({ id: 9, role: 'assistant' })),
    deletePromptLogsByMessageId: vi.fn(),
    deletePromptLogsByMessageIdExcept: vi.fn(),
    deleteRecallActivityLogsByMessageId: vi.fn(),
    clearMessagesBySessionId: vi.fn(),
    deleteSessionTreeById: vi.fn(),
    listSessionColumns: vi.fn(() => []),
    updateSessionById: vi.fn(),
    listArchivedSessions: vi.fn(() => []),
    updateArchiveMetadata: vi.fn(),
    deleteArchiveById: vi.fn(),
    getArchivedSessionById: vi.fn(),
    applyArchiveToSession: vi.fn(),
    listArchivedSessionIds: vi.fn(() => []),
    getMessagesBySessionIdOrdered: vi.fn(() => []),
    insertArchivedSession: vi.fn(),
    insertArchiveMessage: vi.fn(),
    listOrphanArchiveMessageGroups: vi.fn(() => []),
    findArchiveSessionWithSameMessageRange: vi.fn(),
    inferArchiveTargetFromMessages: vi.fn(() => ({ targetId: 'char_1', targetType: 'char' })),
    updateRecallActivityLog: vi.fn(),
    countPromptLogsBySessionId: vi.fn(() => 0),
    insertPromptLog: vi.fn(),
    listMessageProjectionsBySessionId: vi.fn(() => []),
    listMessageProjectionVisibilityBySessionId: vi.fn(() => []),
    listGenerationAttemptsBySessionId: vi.fn(() => []),
    listGenerationAttemptArtifactsBySessionId: vi.fn(() => []),
    upsertMessageProjection: vi.fn((_sessionId, payload) => ({ ...payload })),
    upsertMessageProjectionVisibility: vi.fn(),
    listVisibleMessageProjectionsForCharacter: vi.fn(() => []),
    setMessageProjectionVisibility: vi.fn(),
    upsertProjectionWritebackRun: vi.fn(),
    ...overrides.chatRepository
  }

  return createWorkspaceChatAppService({
    chatRepository,
    logger: { error: vi.fn() },
    normalizeChatTargetId: vi.fn((value) => value),
    repairLegacyChatTarget: vi.fn((value) => value),
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: vi.fn((value) => value),
    repairOrphanChatArchives: vi.fn(),
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: vi.fn((value) => value),
    cloneSessionMessages: vi.fn(),
    ...overrides
  })
}

describe('workspaceChatAppService', () => {
  it('统一 Agent 上下文入口按注册配方返回带版本与来源的投影包', async () => {
    const service = createChatService({
      orchestrationPresenceService: { list: vi.fn(() => ({ ok: true, data: { items: [] } })) },
      orchestrationWorkspaceProjectionService: { read: vi.fn(() => ({ ok: true, data: { director: { candidates: [], presences: [], statusCatalog: [], relevantNarrativeSeeds: [] } } })) },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_ctx', user_id: 'user_1', world_id: '' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        listSessionParticipants: vi.fn(() => []),
        listMessageProjectionsBySessionId: vi.fn(() => [{
          id: 'projection_1', sessionId: 'session_ctx', messageId: 7,
          speakerName: '月城凛夜', objectiveFact: '月城凛夜要求众人跟随目标。', status: 'complete'
        }]),
        listStatusPanelTemplates: vi.fn(() => []),
        listStatusPanels: vi.fn(() => [])
      }
    })

    const result = await service.getAgentContextBundleBySessionId('session_ctx', { agentKind: 'tidiao' }, { userId: 'user_1' })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ agentKind: 'tidiao', recipeVersion: 'v1' })
    const chatProjection = result.data.projections.find((item) => item.projection?.kind === 'chat.visible_context')
    expect(chatProjection.projection.sourceRef).toBe('chat-session:session_ctx:message-projections')
    expect(chatProjection.projection.value.items[0]).toMatchObject({
      ref: { kind: 'chat_message', sessionId: 'session_ctx', messageId: 7 },
      speakerName: '月城凛夜'
    })
  })

  it('角色回复的聊天投影只走该角色可见查询，不读取导演全量历史', async () => {
    const listVisible = vi.fn(() => [{
      id: 'projection_visible', sessionId: 'session_role', messageId: 9,
      speakerName: '月城凛夜', objectiveFact: '月城凛夜走进庭院。', status: 'complete'
    }])
    const listAll = vi.fn(() => [{ id: 'projection_secret', messageId: 8, objectiveFact: '角色不应知道的幕后事实。', status: 'complete' }])
    const service = createChatService({
      orchestrationPresenceService: { list: vi.fn(() => ({ ok: true, data: { items: [] } })) },
      orchestrationWorkspaceProjectionService: { read: vi.fn(() => ({ ok: true, data: { director: { candidates: [], presences: [], statusCatalog: [], relevantNarrativeSeeds: [] } } })) },
      characterRepository: {
        getCharacterById: vi.fn(() => ({ id: 'char_role', name: '三轮霞', relationships: '' }))
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_role', user_id: 'user_1', world_id: '' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        listSessionParticipants: vi.fn(() => [{ id: 'participant_role', participantType: 'char', participantTargetId: 'char_role', characterStateMode: 'follow_main' }]),
        listVisibleMessageProjectionsForCharacter: listVisible,
        listMessageProjectionsBySessionId: listAll,
        listStatusPanelTemplates: vi.fn(() => []),
        listStatusPanels: vi.fn(() => [])
      }
    })

    const result = await service.getAgentContextBundleBySessionId('session_role', {
      agentKind: 'role_reply', characterId: 'char_role'
    }, { userId: 'user_1' })

    expect(result.ok).toBe(true)
    expect(listVisible).toHaveBeenCalledWith('session_role', 'char_role')
    expect(listAll).not.toHaveBeenCalled()
    const chatProjection = result.data.projections.find((item) => item.projection?.kind === 'chat.visible_context')
    expect(chatProjection.projection.value.items.map((item) => item.fact)).toEqual(['月城凛夜走进庭院。'])
  })

  it('独立处理聊天读取', () => {
    const listWorldDocLinks = vi.fn(() => ['doc_a', 'doc_b'])
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({
          id: 'char_1',
          world_id: 'world_1',
          virtual_scene_world_id: 'world_1',
          virtual_location_sheet_id: 'sheet_1',
          virtual_location_feature_id: 'feature_1'
        })),
        getRecentMessagesBySessionId: vi.fn(() => [{ id: 1, content: 'hello' }]),
        listWorldDocLinks,
        findWorldById: vi.fn(() => ({ id: 'world_1', name: '维斯珂', defaultMapSheetId: 'sheet_1' })),
        listMapSheets: vi.fn(() => [{ id: 'sheet_1', name: '总图' }]),
        findMapFeatureById: vi.fn(() => ({ id: 'feature_1', sheetId: 'sheet_1', name: '望舒台' }))
      }
    })

    const result = service.getChat('char_1', 20)

    expect(result.ok).toBe(true)
    expect(result.data.messages).toHaveLength(1)
    expect(result.data.session.worldId).toBe('world_1')
    expect(result.data.session.worldName).toBe('维斯珂')
    expect(result.data.session.worldDocLibraryDocumentIds).toEqual(['doc_a', 'doc_b'])
    expect(result.data.session.curtainMapFeatureName).toBe('望舒台')
    expect(listWorldDocLinks).toHaveBeenCalledWith('world_1')
  })

  it('未挂世界的会话文档范围恒为空，不读取世界挂载关系', () => {
    const listWorldDocLinks = vi.fn(() => ['doc_a'])
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'char_1' })),
        getRecentMessagesBySessionId: vi.fn(() => [{ id: 1, content: 'hello' }]),
        listWorldDocLinks
      }
    })

    const result = service.getChat('char_1', 20)

    expect(result.data.session.worldDocLibraryDocumentIds).toEqual([])
    expect(listWorldDocLinks).not.toHaveBeenCalled()
  })

  it('listWorlds 附带每世界会话数与舆图图纸数（星依世界寻址批·2026-07-13）', () => {
    const service = createChatService({
      chatRepository: {
        listWorlds: vi.fn(() => [
          { id: 'world_1', name: '维斯珂', description: '', status: 'active', createdAt: '', updatedAt: '' },
          { id: 'world_2', name: '沧澜大陆', description: '', status: 'active', createdAt: '', updatedAt: '' }
        ]),
        listWorldSessionCounts: vi.fn(() => [{ worldId: 'world_1', total: 2 }]),
        listWorldMapSheetCounts: vi.fn(() => [{ worldId: 'world_1', total: 3 }])
      }
    })

    const result = service.listWorlds()

    expect(result.ok).toBe(true)
    expect(result.data.items).toEqual([
      expect.objectContaining({ id: 'world_1', sessionCount: 2, mapSheetCount: 3 }),
      expect.objectContaining({ id: 'world_2', sessionCount: 0, mapSheetCount: 0 })
    ])
  })

  it('世界详情一次批量读取全部会话参与者并稳定去重角色', () => {
    const listSessionParticipantsBySessionIds = vi.fn(() => [
      { sessionId: 'session_a', participantTargetId: 'char_1', participantType: 'char' },
      { sessionId: 'session_b', participantTargetId: 'char_1', participantType: 'char' },
      { sessionId: 'session_b', participantTargetId: 'group_1', participantType: 'group' },
      { sessionId: 'session_b', participantTargetId: 'char_2', participantType: 'char' }
    ])
    const service = createChatService({
      chatRepository: {
        findWorldById: vi.fn(() => ({ id: 'world_1', name: '维斯珂' })),
        listMapSheets: vi.fn(() => []),
        listSessionsByWorldId: vi.fn(() => [
          { id: 'session_a', title: '会话 A' },
          { id: 'session_b', title: '会话 B' }
        ]),
        listSessionParticipantsBySessionIds,
        listWorldDocLinks: vi.fn(() => []),
        listWorldEntities: vi.fn(() => [])
      }
    })

    const result = service.getWorldDetailById('world_1')

    expect(result.ok).toBe(true)
    expect(result.data.characterIds).toEqual(['char_1', 'char_2'])
    expect(listSessionParticipantsBySessionIds).toHaveBeenCalledTimes(1)
    expect(listSessionParticipantsBySessionIds).toHaveBeenCalledWith(['session_a', 'session_b'])
  })

  it('ensureXingyiSession 已存在星依会话时直接返回，不重复创建', () => {
    const insertXingyiSession = vi.fn()
    // 注意：createChatService 的 ...overrides 会整体替换 chatRepository，override 必须自带 toChatBundle 依赖的方法
    const service = createChatService({
      chatRepository: {
        findLatestSessionByKind: vi.fn(() => ({ id: 'xingyi_session_1', kind: 'xingyi' })),
        getSessionById: vi.fn(() => ({ id: 'xingyi_session_1', kind: 'xingyi' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        countMessagesBySessionId: vi.fn(() => 0),
    listSessionParticipants: vi.fn(() => []),
    listSessionParticipantsBySessionIds: vi.fn(() => []),
        insertXingyiSession
      },
      persist: vi.fn()
    })

    const result = service.ensureXingyiSession()

    expect(result.ok).toBe(true)
    expect(insertXingyiSession).not.toHaveBeenCalled()
  })

  it('ensureXingyiSession 无星依会话时创建 kind=xingyi 常驻会话（标题固定为星依）', () => {
    const insertXingyiSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        findLatestSessionByKind: vi.fn(() => null),
        getSessionById: vi.fn((id) => ({ id, kind: 'xingyi' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        countMessagesBySessionId: vi.fn(() => 0),
        listSessionParticipants: vi.fn(() => []),
        insertXingyiSession
      },
      persist: vi.fn()
    })

    const result = service.ensureXingyiSession()

    expect(result.ok).toBe(true)
    expect(insertXingyiSession).toHaveBeenCalledTimes(1)
    expect(insertXingyiSession.mock.calls[0][1].title).toBe('星依')
  })

  it('createXingyiSession（/clear）：最新会话已有消息时新建一条星依会话', () => {
    const insertXingyiSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        findLatestSessionByKind: vi.fn(() => ({ id: 'xingyi_session_1', kind: 'xingyi' })),
        getSessionById: vi.fn((id) => ({ id, kind: 'xingyi' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        countMessagesBySessionId: vi.fn(() => 5),
        listSessionParticipants: vi.fn(() => []),
        insertXingyiSession
      },
      persist: vi.fn()
    })

    const result = service.createXingyiSession()

    expect(result.ok).toBe(true)
    expect(insertXingyiSession).toHaveBeenCalledTimes(1)
    expect(insertXingyiSession.mock.calls[0][1].title).toBe('星依')
  })

  it('createXingyiSession（/clear）：最新会话还是空的直接复用，避免连按堆空会话', () => {
    const insertXingyiSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        findLatestSessionByKind: vi.fn(() => ({ id: 'xingyi_session_1', kind: 'xingyi' })),
        getSessionById: vi.fn(() => ({ id: 'xingyi_session_1', kind: 'xingyi' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        countMessagesBySessionId: vi.fn(() => 0),
        listSessionParticipants: vi.fn(() => []),
        insertXingyiSession
      },
      persist: vi.fn()
    })

    const result = service.createXingyiSession()

    expect(result.ok).toBe(true)
    expect(result.data.session.id).toBe('xingyi_session_1')
    expect(insertXingyiSession).not.toHaveBeenCalled()
  })

  it('listXingyiSessions（/resume）：展示名=首条用户输入压空白后前20字，空会话兜底「新对话」', () => {
    const service = createChatService({
      chatRepository: {
        listSessionsByKind: vi.fn(() => [
          {
            id: 'xingyi_session_2',
            firstUserContent: '  帮我看看  今天的部署流程到底哪一步出了问题呀星依  ',
            messageCount: 12,
            createdAt: '2026-07-07T01:00:00.000Z',
            updatedAt: '2026-07-07T02:00:00.000Z'
          },
          { id: 'xingyi_session_1', firstUserContent: '', messageCount: 0, createdAt: '', updatedAt: '' }
        ])
      }
    })

    const result = service.listXingyiSessions()

    expect(result.ok).toBe(true)
    expect(result.data.sessions).toHaveLength(2)
    expect(result.data.sessions[0].name).toBe('帮我看看 今天的部署流程到底哪一步出了问')
    expect(result.data.sessions[0].name.length).toBe(20)
    expect(result.data.sessions[1].name).toBe('新对话')
  })

  it('activateXingyiSession（/resume 选中）：touch 目标会话成为活动会话并返回 bundle', () => {
    const touchSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((id) => ({ id, kind: 'xingyi' })),
        getRecentMessagesBySessionId: vi.fn(() => [{ id: 1, role: 'user', content: '旧话' }]),
        countMessagesBySessionId: vi.fn(() => 1),
        listSessionParticipants: vi.fn(() => []),
        touchSession
      },
      persist: vi.fn()
    })

    const result = service.activateXingyiSession('xingyi_session_1')

    expect(result.ok).toBe(true)
    expect(touchSession).toHaveBeenCalledWith('xingyi_session_1')
  })

  it('activateXingyiSession：目标不存在或不是星依会话返回404（不许把普通聊天会话提成活动星依会话）', () => {
    const touchSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((id) => (id === 'char_1' ? { id, kind: 'roleplay' } : undefined)),
        touchSession
      }
    })

    expect(service.activateXingyiSession('missing').status).toBe(404)
    expect(service.activateXingyiSession('char_1').status).toBe(404)
    expect(touchSession).not.toHaveBeenCalled()
  })

  it('按轮级 tidiaoRunId 聚合一轮所有 attempt（含群聊多发言者共享同一 runId）', () => {
    const listGenerationAttemptsByRunId = vi.fn(() => [
      { id: 'attempt_a', session_id: 'session_1', tidiao_run_id: 'tidiao_turn_1', target_id: 'char_1', speaker_name: '星依' },
      { id: 'attempt_b', session_id: 'session_1', tidiao_run_id: 'tidiao_turn_1', target_id: 'char_2', speaker_name: '林雪云' }
    ])
    const service = createChatService({
      chatRepository: { getSessionById: vi.fn(() => ({ id: 'session_1' })), listGenerationAttemptsByRunId }
    })

    const result = service.listChatGenerationAttemptsByRunId('session_1', 'tidiao_turn_1')

    expect(result.ok).toBe(true)
    expect(listGenerationAttemptsByRunId).toHaveBeenCalledWith('session_1', 'tidiao_turn_1', 200)
    expect(result.data.map((item) => item.id)).toEqual(['attempt_a', 'attempt_b'])
    // toCamel 把 tidiao_run_id 带成 tidiaoRunId，便于编排带按轮消费。
    expect(result.data.every((item) => item.tidiaoRunId === 'tidiao_turn_1')).toBe(true)
  })

  it('空 runId 不查全表，直接返回空数组', () => {
    const listGenerationAttemptsByRunId = vi.fn(() => [{ id: 'should_not_appear' }])
    const service = createChatService({
      chatRepository: { getSessionById: vi.fn(() => ({ id: 'session_1' })), listGenerationAttemptsByRunId }
    })

    const result = service.listChatGenerationAttemptsByRunId('session_1', '   ')

    expect(result.ok).toBe(true)
    expect(result.data).toEqual([])
    expect(listGenerationAttemptsByRunId).not.toHaveBeenCalled()
  })

  it('会话不存在时按轮查询返回 404', () => {
    const service = createChatService({
      chatRepository: { getSessionById: vi.fn(() => null) }
    })

    const result = service.listChatGenerationAttemptsByRunId('missing_session', 'tidiao_turn_1')

    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })

  it('默认会话读取走完整展示口径，显式 limit 读取最近分页', () => {
    const getDisplayMessagesBySessionId = vi.fn(() => [
      { id: 1, content: '早期普通消息' },
      { id: 250, content: '近期调试消息', message_kind: 'narration_debug' }
    ])
    const getMessagePageBySessionId = vi.fn(() => ({
      messages: [{ id: 250, content: '近期消息' }],
      hasMore: true
    }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getDisplayMessagesBySessionId,
        getMessagePageBySessionId,
        listSessionParticipants: vi.fn(() => [])
      }
    })

    const defaultResult = service.getChatSession('session_1')
    const limitedResult = service.getChatSession('session_1', 30)

    expect(defaultResult.ok).toBe(true)
    expect(defaultResult.data.messages.map((item) => item.id)).toEqual([1, 250])
    expect(getDisplayMessagesBySessionId).toHaveBeenCalledWith('session_1')
    expect(limitedResult.data.messages.map((item) => item.id)).toEqual([250])
    expect(limitedResult.data.pageInfo).toEqual({ hasMore: true, oldestMessageId: 250 })
    expect(getMessagePageBySessionId).toHaveBeenCalledWith('session_1', { limit: 30, beforeId: 0 })
  })

  it('会话读取同时返回规范化的纯净回复双字段', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({
          id: 'session_1',
          target_id: 'char_1',
          reply_pipeline_mode: 'pure_prompt'
        })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        listSessionParticipants: vi.fn(() => [])
      }
    })

    const result = service.getChatSession('session_1', 1)

    expect(result.ok).toBe(true)
    expect(result.data.session).toMatchObject({
      replyPipelineMode: 'pure_prompt',
      reply_pipeline_mode: 'pure_prompt'
    })
  })

  it('汇总人格模型观察数据并解析候选评分产物', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listMessageProjectionsBySessionId: vi.fn(() => [{
          id: 'projection_1',
          session_id: 'session_1',
          message_id: 1,
          status: 'complete',
          audience_names_json: '["星依"]',
          start_env_json: '{"time":"上午"}',
          end_env_json: '{"time":"晚上"}',
          changed_json: '{"time":true}',
          source_projection_ids_json: '["projection_0"]'
        }]),
        listMessageProjectionVisibilityBySessionId: vi.fn(() => [{
          id: 'visibility_1',
          projection_id: 'projection_1',
          character_id: 'char_1',
          visibility: 'visible'
        }]),
        listGenerationAttemptsBySessionId: vi.fn(() => [{
          id: 'attempt_1',
          session_id: 'session_1',
          assistant_message_ids_json: '[9]',
          replaced_message_ids_json: '[]',
          pre_caps_residue_state_json: '{}',
          post_caps_residue_state_json: '{}',
          error_json: '{}'
        }]),
        listGenerationAttemptArtifactsBySessionId: vi.fn(() => [{
          id: 'artifact_1',
          attempt_id: 'attempt_1',
          session_id: 'session_1',
          artifact_kind: 'personality_model_trace',
          payload_json: '{"rerankerDiagnostics":{"candidateCount":15,"distinctEncodedInputCount":15,"uniqueScoreCount":15},"candidatePlans":[{"id":"plan_1","score":99}],"topPlans":[{"id":"plan_1","score":99}]}'
        }])
      }
    })

    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')

    expect(result.ok).toBe(true)
    expect(result.data.projections[0]).toEqual(expect.objectContaining({
      id: 'projection_1',
      audienceNames: ['星依'],
      startEnv: { time: '上午' },
      endEnv: { time: '晚上' },
      changed: { time: true },
      sourceProjectionIds: ['projection_0']
    }))
    expect(result.data.visibility).toHaveLength(1)
    expect(result.data.attempts[0].assistantMessageIds).toEqual([9])
    expect(result.data.traces[0].payload.candidatePlans[0]).toEqual(expect.objectContaining({ id: 'plan_1', score: 99 }))
  })

  it('本地工作区可读取人格模型观察的 orchestration 工程细节', () => {
    const buildRepo = () => ({
      getSessionById: vi.fn(() => ({ id: 'session_1' })),
      listGenerationAttemptsBySessionId: vi.fn(() => []),
      listGenerationAttemptArtifactsBySessionId: vi.fn(() => [{
        id: 'artifact_orch',
        attempt_id: 'attempt_orch',
        session_id: 'session_1',
        artifact_kind: 'personality_model_trace',
        payload_json: '{"rerankerDiagnostics":{"candidateCount":12,"distinctEncodedInputCount":12,"uniqueScoreCount":12},"candidatePlans":[{"id":"plan_1","score":3.2}],"processSummary":{"steps":{"recall":"done","compose":"done"},"failed":false,"elapsed":"3.2s"},"orchestration":{"scenario":"pressure","promptLogId":"log_1","toolCalls":[{"tool":"generatePlanBatch"}]}}'
      }])
    })

    const service = createChatService({ chatRepository: buildRepo() })
    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')
    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(1)
    expect(result.data.traces[0].payload.candidatePlans[0]).toEqual(expect.objectContaining({ id: 'plan_1', score: 3.2 }))
    expect(result.data.traces[0].payload.processSummary).toEqual(expect.objectContaining({ elapsed: '3.2s', failed: false }))
    expect(result.data.traces[0].payload.orchestration).toEqual(expect.objectContaining({ scenario: 'pressure', promptLogId: 'log_1' }))
  })

  it('本地工作区可读取人格模型失败 trace', () => {
    const buildRepo = () => ({
      getSessionById: vi.fn(() => ({ id: 'session_1' })),
      listGenerationAttemptsBySessionId: vi.fn(() => []),
      listGenerationAttemptArtifactsBySessionId: vi.fn(() => [{
        id: 'artifact_failed_orch',
        attempt_id: 'attempt_failed',
        session_id: 'session_1',
        artifact_kind: 'personality_model_trace',
        payload_json: '{"state":"failed","speakerName":"星依","orchestration":{"state":"failed","scenario":"unknown","strategyMatrix":[],"toolCalls":[],"failure":{"stage":"personality_model_reply","reason":"人格模型 ReRanker 打分无效","detail":"人格模型 ReRanker 打分无效","impact":"最终回复未生成，聊天消息未写入。","chain":["reply_plan_orchestration","personality_reranker"]}}}'
      }])
    })

    const service = createChatService({ chatRepository: buildRepo() })
    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')
    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(1)
    expect(result.data.traces[0].payload.orchestration.failure).toEqual(expect.objectContaining({
      stage: 'personality_model_reply',
      reason: '人格模型 ReRanker 打分无效'
    }))
  })

  it('人格模型观察放行带决策流的 clean_retry（纠偏/精修提调带刷新复原），空壳与旧版本记录不下发', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 5, role: 'user', content: '用户消息（该轮锚点）' }
        ]),
        listGenerationAttemptsBySessionId: vi.fn(() => []),
        listGenerationAttemptArtifactsBySessionId: vi.fn(() => [
          {
            // 纠偏决策流快照（tidiao_stream_*·锚该轮用户消息）——必须下发，否则刷新后纠偏带消失
            id: 'tidiao_stream_run_2',
            attempt_id: 'attempt_correction',
            session_id: 'session_1',
            message_id: 5,
            artifact_kind: 'clean_retry',
            payload_json: '{"processSummary":{"steps":{},"directorStream":{"decisions":[{"id":"d1","text":"纠偏决策"}]},"appendLog":[{"kind":"decision"}],"directorPrompt":"真实prompt"}}'
          },
          {
            // demote 降权空壳（真取消）——不下发
            id: 'tidiao_stream_run_demoted',
            attempt_id: 'attempt_demoted',
            session_id: 'session_1',
            message_id: 5,
            artifact_kind: 'clean_retry',
            payload_json: '{"processSummary":{"steps":{}}}'
          },
          {
            // 旧版本化重试记录（只存 versionIndex、无决策流）——不下发
            id: 'artifact_version_only',
            attempt_id: 'attempt_version',
            session_id: 'session_1',
            message_id: 5,
            artifact_kind: 'clean_retry',
            payload_json: '{"versionIndex":1}'
          }
        ])
      }
    })

    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')

    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(1)
    expect(result.data.traces[0]).toEqual(expect.objectContaining({ id: 'tidiao_stream_run_2', messageId: 5 }))
    expect(result.data.traces[0].payload.processSummary.directorStream.decisions).toHaveLength(1)
  })

  it('人格模型观察过滤已删除和重试替换的旧回复 trace', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 10, role: 'assistant', content: '仍存在的回复' },
          { id: 12, role: 'assistant', content: '重试后的回复' }
        ]),
        listGenerationAttemptsBySessionId: vi.fn(() => [{
          id: 'attempt_retry',
          session_id: 'session_1',
          assistant_message_ids_json: '[12]',
          replaced_message_ids_json: '[11]',
          pre_caps_residue_state_json: '{}',
          post_caps_residue_state_json: '{}',
          error_json: '{}'
        }]),
        listGenerationAttemptArtifactsBySessionId: vi.fn(() => [
          {
            id: 'artifact_live',
            attempt_id: 'attempt_live',
            session_id: 'session_1',
            message_id: 10,
            artifact_kind: 'personality_model_trace',
            payload_json: '{"messageId":10,"rerankerDiagnostics":{"candidateCount":15,"distinctEncodedInputCount":15,"uniqueScoreCount":15},"candidatePlans":[{"id":"plan_live","score":2.5}]}'
          },
          {
            id: 'artifact_replaced',
            attempt_id: 'attempt_old',
            session_id: 'session_1',
            message_id: 11,
            artifact_kind: 'personality_model_trace',
            payload_json: '{"messageId":11,"candidatePlans":[{"id":"plan_old","score":8}]}'
          },
          {
            id: 'artifact_deleted',
            attempt_id: 'attempt_deleted',
            session_id: 'session_1',
            message_id: 13,
            artifact_kind: 'personality_model_trace',
            payload_json: '{"messageId":13,"candidatePlans":[{"id":"plan_deleted","score":9}]}'
          }
        ])
      }
    })

    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')

    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(1)
    expect(result.data.traces[0]).toEqual(expect.objectContaining({ id: 'artifact_live', messageId: 10 }))
    expect(result.data.traces[0].payload.candidatePlans[0]).toEqual(expect.objectContaining({ id: 'plan_live', score: 2.5 }))
  })

  it('人格模型观察不把失败重试的 replacedMessageIds 当成已替换消息过滤', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 10, role: 'assistant', content: '失败重试后仍保留的旧回复' }
        ]),
        listGenerationAttemptsBySessionId: vi.fn(() => [{
          id: 'attempt_retry_failed',
          session_id: 'session_1',
          status: 'failed',
          assistant_message_ids_json: '[]',
          replaced_message_ids_json: '[10]',
          pre_caps_residue_state_json: '{}',
          post_caps_residue_state_json: '{}',
          error_json: '{"message":"回复计划编排失败"}'
        }]),
        listGenerationAttemptArtifactsBySessionId: vi.fn(() => [{
          id: 'artifact_kept_after_failed_retry',
          attempt_id: 'attempt_live',
          session_id: 'session_1',
          message_id: 10,
          artifact_kind: 'personality_model_trace',
          payload_json: '{"messageId":10,"rerankerDiagnostics":{"candidateCount":3,"distinctEncodedInputCount":3,"uniqueScoreCount":3},"candidatePlans":[{"id":"plan_live","score":2.5}],"orchestration":{"scenario":"pressure","toolCalls":[{"tool":"generatePlanBatch"}]}}'
        }])
      }
    })

    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')

    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(1)
    expect(result.data.traces[0]).toEqual(expect.objectContaining({ id: 'artifact_kept_after_failed_retry', messageId: 10 }))
  })

  it('人格模型观察不展示缺少真实 ReRanker 诊断的旧评分 trace', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 10, role: 'assistant', content: '旧回复' }
        ]),
        listGenerationAttemptsBySessionId: vi.fn(() => []),
        listGenerationAttemptArtifactsBySessionId: vi.fn(() => [{
          id: 'artifact_legacy',
          attempt_id: 'attempt_legacy',
          session_id: 'session_1',
          message_id: 10,
          artifact_kind: 'personality_model_trace',
          payload_json: '{"messageId":10,"candidatePlans":[{"id":"plan_old","score":8}],"topPlans":[{"id":"plan_old","score":8}]}'
        }])
      }
    })

    const result = service.getChatPersonalityModelObservationsBySessionId('session_1')

    expect(result.ok).toBe(true)
    expect(result.data.traces).toHaveLength(0)
  })

  it('独立处理聊天消息写入校验', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 11 }))
    const touchSession = vi.fn()
    const service = createChatService({
      chatRepository: {
        insertMessage,
        touchSession
      }
    })

    const result = service.addChatMessage('char_1', { role: 'user', content: '你好呀' })

    expect(result.ok).toBe(true)
    expect(insertMessage).toHaveBeenCalled()
    expect(touchSession).toHaveBeenCalledWith('char_1')
  })

  it('运行消息投影 Agent 并写入投影、可见性和提示词日志', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const upsertMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({
      model: 'quick-model',
      presetName: 'quick',
      upstream: {
        json: async () => ({
          choices: [{
            message: {
              content: [
                '事实：月城凛夜表示林雪云稍后会来书房。',
                '变化：无',
                '不确定：无'
              ].join('\n')
            }
          }]
        })
      }
    }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '沈志雄' })),
        getAliasById: vi.fn(() => ({ id: 'alias_rinye', name: '后来切换的马甲' })),
        getCharacters: vi.fn(() => [
          { id: 'char_xingyi', name: '星依' },
          { id: 'char_linxueyun', name: '林雪云' }
        ])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char', bound_alias: 'alias_rinye', virtual_location: '书房', virtual_time: '上午' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 9,
          role: 'user',
          message_kind: 'chat',
          content: '<think>隐藏</think>她等会儿会来。',
          member_name: '月城凛夜',
          env_location: '书房',
          time: '上午'
        })),
        listSessionParticipants: vi.fn(() => [
          { participantTargetId: 'char_xingyi', participantType: 'char' },
          { participantTargetId: 'char_linxueyun', participantType: 'char' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => Array.from({ length: 6 }, (_, index) => ({
          id: `projection_${index + 1}`,
          messageId: index + 1,
          status: 'complete',
          speakerName: index === 5 ? '五条悟' : '旁白',
          objectiveFact: `旧事实 ${index + 1}`
        })).concat({
          id: 'projection_6_latest',
          messageId: 6,
          status: 'partial',
          speakerName: '五条悟',
          objectiveFact: '五条悟最新投影事实'
        })),
        upsertMessageProjection,
        upsertMessageProjectionVisibility,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.runChatMessageProjectionBySessionId('session_1', 9, { userId: 'local' })

    expect(result.ok).toBe(true)
    expect(callAIWithFallback).toHaveBeenCalled()
    expect(upsertMessageProjection).toHaveBeenNthCalledWith(
      1,
      'session_1',
      expect.objectContaining({ messageId: 9, status: 'running', fallbackCleanText: '她等会儿会来。' })
    )
    expect(upsertMessageProjection).toHaveBeenLastCalledWith(
      'session_1',
      expect.objectContaining({
        messageId: 9,
        status: 'complete',
        speakerName: '月城凛夜',
        audienceNames: [],
        participants: ['月城凛夜'],
        objectiveFact: '月城凛夜表示林雪云稍后会来书房。'
      })
    )
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_xingyi', visibility: 'visible' })
    )
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_linxueyun', visibility: 'visible' })
    )
    expect(insertPromptLog).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        assistantMessageId: 9,
        speakerName: '消息投影 Agent',
        finalPrompt: expect.stringContaining('#6 [五条悟] 五条悟最新投影事实')
      })
    )
    const projectionPrompt = insertPromptLog.mock.calls[0][1].finalPrompt
    expect(projectionPrompt).toContain('当前用户扮演身份：月城凛夜')
    expect(projectionPrompt).toContain('#5 [旁白] 旧事实 5')
    expect(projectionPrompt).not.toContain('沈志雄')
    expect(projectionPrompt).not.toContain('后来切换的马甲')
    expect(projectionPrompt).not.toContain('听者：')
    expect(upsertMessageProjection).toHaveBeenLastCalledWith(
      'session_1',
      expect.objectContaining({ sourceProjectionIds: ['projection_5', 'projection_6_latest'] })
    )
    expect(insertPromptLog.mock.calls[0][1].finalPrompt).toContain('事实：')
    expect(insertPromptLog.mock.calls[0][1].finalPrompt).not.toContain('sourceProjectionIds')
    expect(insertPromptLog.mock.calls[0][1].finalPrompt).not.toContain('projection_1')
  })

  it('纯私密指令用户消息：不调投影模型，直接落空事实 complete 投影并写可见性', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const upsertMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn()
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [
          { id: 'char_xingyi', name: '星依' },
          { id: 'char_linxueyun', name: '林雪云' }
        ])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char', virtual_location: '书房', virtual_time: '上午' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 13,
          role: 'user',
          message_kind: 'chat',
          content: '【【让林雪云主动挑起话题】】',
          env_location: '书房',
          time: '上午'
        })),
        listSessionParticipants: vi.fn(() => [
          { participantTargetId: 'char_xingyi', participantType: 'char' },
          { participantTargetId: 'char_linxueyun', participantType: 'char' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        upsertMessageProjectionVisibility,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.runChatMessageProjectionBySessionId('session_1', 13, { userId: 'local' })

    expect(result.ok).toBe(true)
    // 关键：剥离指令后无可见正文 → 不调投影模型，防止空正文幻觉出「事实」。
    expect(callAIWithFallback).not.toHaveBeenCalled()
    expect(upsertMessageProjection).toHaveBeenCalledTimes(1)
    expect(upsertMessageProjection).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        messageId: 13,
        status: 'complete',
        objectiveFact: '',
        fallbackCleanText: ''
      })
    )
    // 私密指令绝不落投影任何字段。
    const payload = upsertMessageProjection.mock.calls[0][1]
    expect(JSON.stringify(payload)).not.toContain('让林雪云主动挑起话题')
    // 可见性照写（与成功路径同口径）：空 fact 在读侧自动过滤=对角色隐身，但不能缺行。
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_xingyi', visibility: 'visible' })
    )
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_linxueyun', visibility: 'visible' })
    )
  })

  it('用户消息投影模型失败时，fallbackCleanText 兜底已剥离私密指令（防泄漏）', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const upsertMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({ error: '模型超时' }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [
          { id: 'char_xingyi', name: '星依' },
          { id: 'char_linxueyun', name: '林雪云' }
        ])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char', virtual_location: '书房', virtual_time: '上午' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 14,
          role: 'user',
          message_kind: 'chat',
          content: '下午好呀【【让林雪云生气】】',
          env_location: '书房',
          time: '上午'
        })),
        listSessionParticipants: vi.fn(() => [
          { participantTargetId: 'char_xingyi', participantType: 'char' },
          { participantTargetId: 'char_linxueyun', participantType: 'char' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        upsertMessageProjectionVisibility,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.runChatMessageProjectionBySessionId('session_1', 14, { userId: 'local' })

    expect(result.ok).toBe(true)
    // running 与 failed 两次落库的 fallbackCleanText 都必须是剥离指令后的正文。
    expect(upsertMessageProjection).toHaveBeenNthCalledWith(
      1,
      'session_1',
      expect.objectContaining({ messageId: 14, status: 'running', fallbackCleanText: '下午好呀' })
    )
    expect(upsertMessageProjection).toHaveBeenLastCalledWith(
      'session_1',
      expect.objectContaining({ messageId: 14, status: 'failed', fallbackCleanText: '下午好呀' })
    )
    const lastPayload = upsertMessageProjection.mock.calls.at(-1)[1]
    expect(JSON.stringify(lastPayload)).not.toContain('让林雪云生气')
  })

  it('保存内嵌消息投影时不再调用投影 Agent', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const upsertMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn()
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [
          { id: 'char_xingyi', name: '星依' },
          { id: 'char_linxueyun', name: '林雪云' }
        ])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char', virtual_location: '书房', virtual_time: '上午' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 11,
          role: 'assistant',
          message_kind: 'chat',
          content: '星依轻轻点头，说会留意窗外的脚步声。',
          name: '星依',
          member_target_id: 'char_xingyi',
          env_location: '书房',
          time: '上午'
        })),
        listSessionParticipants: vi.fn(() => [
          { participantTargetId: 'char_xingyi', participantType: 'char' },
          { participantTargetId: 'char_linxueyun', participantType: 'char' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        upsertMessageProjectionVisibility,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.saveEmbeddedChatMessageProjectionBySessionId('session_1', 11, {
      projectionText: [
        '事实：星依答应用户，会留意窗外的脚步声。',
        '变化：无',
        '不确定：无'
      ].join('\n')
    })

    expect(result.ok).toBe(true)
    expect(callAIWithFallback).not.toHaveBeenCalled()
    expect(upsertMessageProjection).toHaveBeenCalledTimes(1)
    expect(upsertMessageProjection).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        messageId: 11,
        status: 'complete',
        attemptId: expect.stringContaining('embedded_'),
        objectiveFact: '星依答应用户，会留意窗外的脚步声。'
      })
    )
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_xingyi', visibility: 'visible' })
    )
    expect(insertPromptLog).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        assistantMessageId: 11,
        speakerName: '消息投影 Agent',
        finalPrompt: expect.stringContaining('内嵌消息投影落库')
      })
    )
  })

  it('内嵌投影解析失败时仍写可见性兜底，避免消息对后续轮次永久隐身', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const upsertMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn()
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [
          { id: 'char_xingyi', name: '星依' },
          { id: 'char_linxueyun', name: '林雪云' }
        ])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char', virtual_location: '书房', virtual_time: '上午' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 12,
          role: 'assistant',
          message_kind: 'narration',
          content: '门外忽然传来一阵急促的脚步声，由远及近。',
          name: '旁白',
          env_location: '书房',
          time: '上午'
        })),
        listSessionParticipants: vi.fn(() => [
          { participantTargetId: 'char_xingyi', participantType: 'char' },
          { participantTargetId: 'char_linxueyun', participantType: 'char' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        upsertMessageProjectionVisibility,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    // 模型没吐出可解析的内嵌投影区块：projectionText 为空 + 带 failureReason。
    const result = await service.saveEmbeddedChatMessageProjectionBySessionId('session_1', 12, {
      projectionText: '',
      failureReason: '模型输出缺少【消息投影】区块',
      failureStage: 'parse_embedded_projection'
    })

    expect(result.ok).toBe(true)
    expect(callAIWithFallback).not.toHaveBeenCalled()
    // 失败投影也要落库（status failed + fallbackCleanText 为旁白原文清洗）。
    expect(upsertMessageProjection).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        messageId: 12,
        status: 'failed',
        fallbackCleanText: '门外忽然传来一阵急促的脚步声，由远及近。'
      })
    )
    // 关键根因修复：失败时也给每个角色写 visible 可见性行，否则该旁白对后续所有轮次的人格模型上下文永久隐身。
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_xingyi', visibility: 'visible' })
    )
    expect(upsertMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ characterId: 'char_linxueyun', visibility: 'visible' })
    )
  })

  it('人格模型投影达到窗口后写入当天轨迹并隐藏已处理来源', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const visibleRows = Array.from({ length: 23 }, (_, index) => ({
      id: `projection_${index + 1}`,
      sessionId: 'session_1',
      messageId: index + 1,
      speakerName: index < 2 ? '用户' : '旁白',
      audienceNamesJson: JSON.stringify(index < 2 ? ['星依'] : ['旁白']),
      objectiveFact: index < 2
        ? `用户告诉星依，第 ${index + 1} 条资料要写入当天事件。`
        : `背景资料 ${index + 1}，没有点名当前角色。`,
      fallbackCleanText: ''
    }))
    const patchCharacterBrainTrace = vi.fn()
    const upsertProjectionWritebackRun = vi.fn()
    const setMessageProjectionVisibility = vi.fn()
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({
      model: 'quick-model',
      presetName: 'quick',
      upstream: {
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                events: [{
                  id: 'event_split_1',
                  title: '整理当天资料',
                  summary: '用户和星依确认把资料写入当天事件。',
                  content: '用户告诉星依，两条资料都要写入当天事件。',
                  sourceProjectionIds: ['projection_1', 'projection_2']
                }]
              })
            }
          }]
        })
      }
    }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          nicknames: '["小星"]',
          brainTraceNodes: JSON.stringify([]),
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        })),
        patchCharacterBrainTrace
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => visibleRows),
        setMessageProjectionVisibility,
        upsertProjectionWritebackRun,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto',
      runId: 'writeback_1'
    })

    expect(result.ok).toBe(true)
    expect(result.data.status).toBe('complete')
    expect(result.data.processedProjectionIds).toHaveLength(12)
    expect(result.data.successEventIds).toHaveLength(1)
    expect(setMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      'projection_1',
      'char_xingyi',
      'hidden',
      'archived_for_character',
      'writeback_1'
    )
    expect(setMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      'projection_3',
      'char_xingyi',
      'hidden',
      'archived_no_character_mention',
      'writeback_1'
    )
    expect(setMessageProjectionVisibility).not.toHaveBeenCalledWith(
      'session_1',
      'projection_21',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
    expect(patchCharacterBrainTrace).toHaveBeenCalled()
    const finalTraceNodes = patchCharacterBrainTrace.mock.calls.at(-1)[1].brainTraceNodes
    expect(finalTraceNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ systemRole: 'eventLeaf', parentId: `brain:trajectory:node:day_${today.replace(/-/g, '_')}` })
    ]))
    expect(upsertProjectionWritebackRun).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'writeback_1',
      status: 'complete',
      successEventIdsJson: expect.stringContaining('projection_event_')
    }))
    expect(insertPromptLog).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '投影写轨迹',
      finalPrompt: expect.stringContaining('projection_1')
    }))
  })

  it('关系画像沉淀创建待确认认知节点且不消费投影 visibility，随后轨迹写入照常执行', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const visibleRows = Array.from({ length: 23 }, (_, index) => ({
      id: `projection_${index + 1}`,
      sessionId: 'session_1',
      messageId: index + 1,
      speakerName: index < 2 ? '用户' : '旁白',
      audienceNamesJson: JSON.stringify(index < 2 ? ['星依'] : ['旁白']),
      objectiveFact: index < 2
        ? `用户告诉星依，第 ${index + 1} 条资料要写入当天事件。`
        : `背景资料 ${index + 1}，没有点名当前角色。`,
      fallbackCleanText: ''
    }))
    const patchCharacterBrainCognition = vi.fn()
    const patchCharacterBrainTrace = vi.fn()
    const setMessageProjectionVisibility = vi.fn()
    const callAIWithFallback = vi.fn(async (_preset, _model, messages) => {
      const systemText = String(messages?.[0]?.content || '')
      const content = systemText.includes('稳定关系认知')
        ? JSON.stringify({
          explicit: [{ key: '称呼', value: '用户' }],
          implicit: [{ text: '星依会把用户视为需要认真回应的亲近对象。' }]
        })
        : JSON.stringify({
          events: [{
            id: 'event_split_1',
            title: '整理当天资料',
            summary: '用户和星依确认把资料写入当天事件。',
            content: '用户告诉星依，两条资料都要写入当天事件。',
            sourceProjectionIds: ['projection_1', 'projection_2']
          }]
        })
      return {
        upstream: {
          json: async () => ({ choices: [{ message: { content } }] })
        }
      }
    })
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          nicknames: '["小星"]',
          brainCognitionNodes: JSON.stringify([]),
          brainDocuments: JSON.stringify({}),
          brainTraceNodes: JSON.stringify([]),
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        })),
        patchCharacterBrainCognition,
        patchCharacterBrainTrace
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => visibleRows),
        listSessionParticipants: vi.fn(() => []),
        setMessageProjectionVisibility,
        upsertProjectionWritebackRun: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto',
      runId: 'writeback_relation_create',
      userName: '用户'
    })

    expect(result.ok).toBe(true)
    expect(result.data.relationProfile.data.status).toBe('written')
    expect(patchCharacterBrainCognition).toHaveBeenCalledTimes(1)
    const cognitionNodes = patchCharacterBrainCognition.mock.calls[0][1].brainCognitionNodes
    expect(cognitionNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'relation',
        subjectType: 'user',
        subjectId: 'user',
        title: '对用户的认知',
        pendingReview: expect.objectContaining({ mode: 'create' })
      })
    ]))
    const relationNode = cognitionNodes.find((node) => node.subjectId === 'user')
    expect(JSON.parse(relationNode.content).explicit[0]).toMatchObject({ key: '称呼', value: '用户' })
    expect(result.data.status).toBe('complete')
    expect(patchCharacterBrainTrace).toHaveBeenCalled()
    expect(setMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      'projection_1',
      'char_xingyi',
      'hidden',
      'archived_for_character',
      'writeback_relation_create'
    )
    expect(setMessageProjectionVisibility).not.toHaveBeenCalledWith(
      'session_1',
      'projection_21',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
    const finalTraceNodes = patchCharacterBrainTrace.mock.calls.at(-1)[1].brainTraceNodes
    expect(finalTraceNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ systemRole: 'eventLeaf', parentId: `brain:trajectory:node:day_${today.replace(/-/g, '_')}` })
    ]))
  })

  it('关系画像沉淀更新已有关系节点为待确认版本且不阻断轨迹写入', async () => {
    const visibleRows = Array.from({ length: 23 }, (_, index) => ({
      id: `projection_${index + 1}`,
      sessionId: 'session_1',
      messageId: index + 1,
      speakerName: index < 2 ? '用户' : '旁白',
      audienceNamesJson: JSON.stringify(index < 2 ? ['星依'] : ['旁白']),
      objectiveFact: index < 2
        ? `用户告诉星依，第 ${index + 1} 条资料要写入当天事件。`
        : `背景资料 ${index + 1}，没有点名当前角色。`,
      fallbackCleanText: ''
    }))
    const existingRelation = {
      id: 'brain:cognition:node:rel_user',
      title: '对用户的认知',
      summary: '对用户的认知 ｜ 称呼:用户',
      parentId: 'brain:cognition',
      kind: 'relation',
      subjectType: 'user',
      subjectId: 'user',
      content: JSON.stringify({
        explicit: [{ key: '称呼', value: '用户', updatedAt: '2026-05-30T00:00:00.000Z' }],
        implicit: []
      }),
      createdAt: '2026-05-30T00:00:00.000Z',
      updatedAt: '2026-05-30T00:00:00.000Z'
    }
    const patchCharacterBrainCognition = vi.fn()
    const patchCharacterBrainTrace = vi.fn()
    const setMessageProjectionVisibility = vi.fn()
    const callAIWithFallback = vi.fn(async (_preset, _model, messages) => {
      const systemText = String(messages?.[0]?.content || '')
      const content = systemText.includes('稳定关系认知')
        ? JSON.stringify({
          explicit: [{ key: '称呼', value: '用户' }],
          implicit: [{ text: '星依会优先把用户的要求当作需要认真处理的亲近请求。' }]
        })
        : JSON.stringify({
          events: [{
            id: 'event_split_1',
            title: '整理当天资料',
            summary: '用户和星依确认把资料写入当天事件。',
            content: '用户告诉星依，两条资料都要写入当天事件。',
            sourceProjectionIds: ['projection_1', 'projection_2']
          }]
        })
      return {
        upstream: {
          json: async () => ({ choices: [{ message: { content } }] })
        }
      }
    })
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          nicknames: '["小星"]',
          brainCognitionNodes: JSON.stringify([existingRelation]),
          brainDocuments: JSON.stringify({}),
          brainTraceNodes: JSON.stringify([]),
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        })),
        patchCharacterBrainCognition,
        patchCharacterBrainTrace
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => visibleRows),
        listSessionParticipants: vi.fn(() => []),
        setMessageProjectionVisibility,
        upsertProjectionWritebackRun: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto',
      runId: 'writeback_relation_update',
      userName: '用户'
    })

    expect(result.ok).toBe(true)
    expect(result.data.relationProfile.data.subjects[0]).toEqual(expect.objectContaining({ status: 'updated' }))
    const cognitionNodes = patchCharacterBrainCognition.mock.calls[0][1].brainCognitionNodes
    expect(cognitionNodes).toHaveLength(1)
    expect(cognitionNodes[0]).toEqual(expect.objectContaining({
      id: 'brain:cognition:node:rel_user',
      kind: 'relation',
      subjectType: 'user',
      subjectId: 'user',
      pendingReview: expect.objectContaining({
        mode: 'update',
        previous: expect.objectContaining({ summary: '对用户的认知 ｜ 称呼:用户' })
      })
    }))
    const relationContent = JSON.parse(cognitionNodes[0].content)
    expect(relationContent.explicit[0]).toMatchObject({ key: '称呼', value: '用户' })
    expect(relationContent.explicit[0].conflict).toBeUndefined()
    expect(result.data.status).toBe('complete')
    expect(patchCharacterBrainTrace).toHaveBeenCalled()
    expect(setMessageProjectionVisibility).toHaveBeenCalledWith(
      'session_1',
      'projection_1',
      'char_xingyi',
      'hidden',
      'archived_for_character',
      'writeback_relation_update'
    )
  })

  it('人格模型自动投影写入未达到窗口时跳过且不建运行记录', async () => {
    const upsertProjectionWritebackRun = vi.fn()
    const service = createChatService({
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          brainTraceNodes: '[]',
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        }))
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => Array.from({ length: 22 }, (_, index) => ({
          id: `projection_${index + 1}`,
          messageId: index + 1,
          objectiveFact: `用户告诉星依第 ${index + 1} 条。`
        }))),
        upsertProjectionWritebackRun
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto'
    })

    console.log('empty split result', result)
    expect(result.ok).toBe(true)
    expect(result.data.status).toBe('skipped')
    expect(result.data.visibleCount).toBe(22)
    expect(upsertProjectionWritebackRun).not.toHaveBeenCalled()
  })

  it('人格模型投影拆分为空时保留来源可见并标记失败', async () => {
    const setMessageProjectionVisibility = vi.fn()
    const patchCharacterBrainTrace = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({
      upstream: {
        json: async () => ({
          choices: [{ message: { content: '{"events":[]}' } }]
        })
      }
    }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          brainTraceNodes: '[]',
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        })),
        patchCharacterBrainTrace
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => Array.from({ length: 23 }, (_, index) => ({
          id: `projection_${index + 1}`,
          messageId: index + 1,
          objectiveFact: `用户告诉星依第 ${index + 1} 条。`
        }))),
        setMessageProjectionVisibility,
        upsertProjectionWritebackRun: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto'
    })

    expect(result.ok).toBe(true)
    expect(result.data.status).toBe('failed')
    // 窗口从 20 收到 12：本批只处理前 12 条；空事件不是 JSON 截断，不触发对半缩小，逐条标记失败。
    expect(result.data.failedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: '事件拆分失败',
        reason: '事件拆分输出没有可写入事件',
        sourceProjectionIds: ['projection_1']
      })
    ]))
    expect(result.data.failedEvents.length).toBe(12)
    // 空事件不缩小：拆分 Agent 只应被调用一次，不放大成对半递归（按拆分提示词特征过滤，排除关系画像调用）
    const splitCalls912 = callAIWithFallback.mock.calls.filter(([, , messages]) =>
      (messages || []).some((m) => String(m && m.content).includes('整理成角色轨迹事件草案')))
    expect(splitCalls912.length).toBe(1)
    expect(setMessageProjectionVisibility).not.toHaveBeenCalled()
    expect(patchCharacterBrainTrace).not.toHaveBeenCalled()
  })

  it('人格模型投影拆分输出被截断时自动缩小窗口重试并写入', async () => {
    const setMessageProjectionVisibility = vi.fn()
    const patchCharacterBrainTrace = vi.fn()
    // 整批（>6 条）模拟 maxTokens 截断：返回没有闭合的半截 JSON，解析必然失败 → 触发对半缩小；
    // 子批（≤6 条）返回合法事件，绑定该子批全部投影。
    const callAIWithFallback = vi.fn(async (_preset, _model, messages) => {
      const userContent = (messages || []).map((m) => m.content).join('\n')
      const ids = [...new Set([...userContent.matchAll(/projection_\d+/g)].map((m) => m[0]))]
      if (ids.length > 6) {
        return {
          upstream: {
            json: async () => ({
              choices: [{ message: { content: '{"events":[{"id":"e1","title":"半截","summary":"被截断' } }]
            })
          }
        }
      }
      const isLeft = ids.includes('projection_1')
      const event = isLeft
        ? { id: 'ev_left', title: '问候', summary: '清晨', content: '清晨问候', sourceProjectionIds: ids }
        : { id: 'ev_right', title: '散步', summary: '深夜', content: '深夜散步', sourceProjectionIds: ids }
      return {
        upstream: {
          json: async () => ({ choices: [{ message: { content: JSON.stringify({ events: [event] }) } }] })
        }
      }
    })
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({
          id: 'char_xingyi',
          name: '星依',
          brainTraceNodes: '[]',
          brainTrajectoryMeta: JSON.stringify({ birthDate: '2026-01-01' })
        })),
        patchCharacterBrainTrace
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => Array.from({ length: 23 }, (_, index) => ({
          id: `projection_${index + 1}`,
          messageId: index + 1,
          objectiveFact: `用户和星依第 ${index + 1} 次互动。`
        }))),
        setMessageProjectionVisibility,
        upsertProjectionWritebackRun: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi',
      runKind: 'auto'
    })

    expect(result.ok).toBe(true)
    // 截断触发缩小：拆分调用 = 整批 1 次（截断）+ 左右子批各 1 次 = 3 次（按拆分提示词特征过滤，排除关系画像调用）
    const splitCallsShrink = callAIWithFallback.mock.calls.filter(([, , messages]) =>
      (messages || []).some((m) => String(m && m.content).includes('整理成角色轨迹事件草案')))
    expect(splitCallsShrink.length).toBe(3)
    expect(result.data.status).toBe('complete')
    expect(result.data.successEventIds.length).toBe(2)
    // 12 条投影分两批全部写入并隐藏
    expect(setMessageProjectionVisibility).toHaveBeenCalledTimes(12)
    expect(patchCharacterBrainTrace).toHaveBeenCalled()
  })

  it('投影结束时间地点变化时写回会话帷幕字段', async () => {
    const updateSessionById = vi.fn()
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const callAIWithFallback = vi.fn(async () => ({
      upstream: {
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                status: 'complete',
                speakerName: '星依',
                audienceNames: ['用户'],
                objectiveFact: '星依带用户从书房走到露台，时间来到傍晚。',
                startEnv: {
                  time: '下午',
                  locationLarge: '宅邸',
                  locationMiddle: '书房',
                  locationSmall: '窗边',
                  location: '宅邸 / 书房 / 窗边'
                },
                endEnv: {
                  time: '傍晚',
                  locationLarge: '宅邸',
                  locationMiddle: '露台',
                  locationSmall: '栏杆旁',
                  location: '宅邸 / 露台 / 栏杆旁',
                  weather: '微风'
                },
                changed: { time: true, location: true }
              })
            }
          }]
        })
      }
    }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [{ id: 'char_xingyi', name: '星依' }])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({
          id: 'session_1',
          target_id: 'char_xingyi',
          target_type: 'char',
          virtual_location_large: '宅邸',
          virtual_location_middle: '书房',
          virtual_location_small: '窗边',
          virtual_location: '宅邸 / 书房 / 窗边',
          virtual_time: '下午'
        })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 11,
          role: 'assistant',
          message_kind: 'chat',
          member_name: '星依',
          content: '跟我去露台。',
          time: '下午'
        })),
        listSessionParticipants: vi.fn(() => [{ participantTargetId: 'char_xingyi', participantType: 'char' }]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        upsertMessageProjectionVisibility: vi.fn(),
        updateSessionById,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatMessageProjectionBySessionId('session_1', 11)

    expect(result.ok).toBe(true)
    expect(updateSessionById).toHaveBeenCalledWith('session_1', {
      virtual_time: '傍晚',
      virtual_weather: '微风',
      virtual_location_large: '宅邸',
      virtual_location_middle: '露台',
      virtual_location_small: '栏杆旁',
      virtual_location: '宅邸 / 露台 / 栏杆旁'
    }, true)
  })

  it('编辑用户消息会清除该消息旧投影并恢复到前一条有效投影帷幕', () => {
    const updateSessionById = vi.fn()
    const deleteMessageProjectionTreeByMessageId = vi.fn()
    const updateMessageBySession = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        updateMessageBySession,
        deleteMessageProjectionTreeByMessageId,
        listMessageProjectionsBySessionId: vi.fn(() => [
          {
            id: 'projection_1',
            messageId: 1,
            status: 'complete',
            endEnv: {
              time: '上午',
              locationLarge: '宅邸',
              locationMiddle: '书房',
              locationSmall: '窗边',
              location: '宅邸 / 书房 / 窗边',
              weather: '晴'
            }
          },
          {
            id: 'projection_2',
            messageId: 2,
            status: 'failed',
            endEnv: { time: '中午', location: '旧值' }
          }
        ]),
        updateSessionById
      }
    })

    const result = service.updateChatMessageBySessionId('session_1', '3', { content: '改写后的输入' })

    expect(result.ok).toBe(true)
    expect(updateMessageBySession).toHaveBeenCalledWith('3', 'session_1', { content: '改写后的输入' })
    expect(deleteMessageProjectionTreeByMessageId).toHaveBeenCalledWith('session_1', '3')
    expect(updateSessionById).toHaveBeenCalledWith('session_1', {
      virtual_time: '上午',
      virtual_weather: '晴',
      virtual_location_large: '宅邸',
      virtual_location_middle: '书房',
      virtual_location_small: '窗边',
      virtual_location: '宅邸 / 书房 / 窗边'
    }, true)
  })

  it('编辑消息附件（caption 后台补全回填·带图乐观发送计划）：整组 attachments 覆盖写 attachments_json，不触发帷幕重算', () => {
    const updateMessageBySession = vi.fn()
    const deleteMessageProjectionTreeByMessageId = vi.fn()
    const deleteAffectTideFromMessage = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        updateMessageBySession,
        deleteMessageProjectionTreeByMessageId
      }
    })

    const attachments = [{ id: 'img_1', kind: 'image', url: '/chat-images/img_1.png', mime: 'image/png', caption: '一只猫', captionStatus: 'done' }]
    const result = service.updateChatMessageBySessionId('session_1', '3', { attachments })

    expect(result.ok).toBe(true)
    expect(updateMessageBySession).toHaveBeenCalledWith('3', 'session_1', { attachments_json: JSON.stringify(attachments) })
    // 只改附件不改正文/环境字段，不该清投影树、不该重算帷幕（同 shouldInvalidateAffectTideForMessagePayload 白名单口径）
    expect(deleteMessageProjectionTreeByMessageId).not.toHaveBeenCalled()
  })

  it('按角色可见投影构建人格模型上下文，不读取会话级原文历史', () => {
    const service = createChatService({
      characterRepository: {
        getCharacters: vi.fn(() => [{ id: 'char_xingyi', name: '星依' }])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => [
          {
            id: 'projection_1',
            messageId: 1,
            status: 'complete',
            speakerName: '用户',
            audienceNames: ['星依'],
            objectiveFact: '用户告诉星依，门外来客和当前冲突有关。',
            endEnv: { time: '上午九点', locationLarge: '宅邸', locationMiddle: '书房' },
            changed: { location: true }
          }
        ])
      }
    })

    const result = service.buildPersonalityModelContextBySessionId('session_1', {
      characterId: 'char_xingyi',
      currentUserInput: '继续。',
      recallSections: { profile: '星依很聪明。' },
      topPlans: [{ content: '先确认来客身份。' }]
    })

    expect(result.ok).toBe(true)
    expect(result.data.projectionContextText).toContain('门外来客')
    expect(result.data.compressedContext).toContain('用户')
    expect(result.data.finalPrompt.finalPrompt).toContain('先确认来客身份')
    expect(result.data.finalPrompt.finalPrompt).not.toContain('旧长历史原文')
  })

  it('人格模型重生成上下文排除本轮将被替换的旧消息投影', () => {
    const service = createChatService({
      characterRepository: {
        getCharacters: vi.fn(() => [{ id: 'char_xingyi', name: '星依' }])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => [
          {
            id: 'projection_old_1',
            messageId: 12,
            status: 'complete',
            speakerName: '星依',
            audienceNames: ['用户'],
            objectiveFact: '旧回复投影一，重生成时不应进入新提示词。'
          },
          {
            id: 'projection_old_2',
            messageId: 13,
            status: 'complete',
            speakerName: '星依',
            audienceNames: ['用户'],
            objectiveFact: '旧回复投影二，重生成时不应进入新提示词。'
          },
          {
            id: 'projection_user',
            messageId: 11,
            status: 'complete',
            speakerName: '用户',
            audienceNames: ['星依'],
            objectiveFact: '用户重新提出当前请求。'
          }
        ])
      }
    })

    const result = service.buildPersonalityModelContextBySessionId('session_1', {
      characterId: 'char_xingyi',
      currentUserInput: '重新说。',
      excludedMessageIds: [12, 13]
    })

    expect(result.ok).toBe(true)
    expect(result.data.projectionContextText).toContain('用户重新提出当前请求')
    expect(result.data.projectionContextText).not.toContain('旧回复投影一')
    expect(result.data.projectionContextText).not.toContain('旧回复投影二')
  })

  it('按当前回复角色构建 projection-first 消息视图，并只兜底当前窗口缺投影消息', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 1, session_id: 'session_1', role: 'user', content: '用户原文一', name: '用户' },
          { id: 2, session_id: 'session_1', role: 'assistant', content: '星依原文二', member_name: '星依' },
          { id: 3, session_id: 'session_1', role: 'assistant', content: '另一个角色原文三', member_name: '林雪云' }
        ]),
        listMessageProjectionsBySessionId: vi.fn(() => [
          {
            id: 'projection_1',
            messageId: 1,
            status: 'complete',
            speakerName: '用户',
            objectiveFact: '用户告诉星依一件投影事实。',
            createdAt: '2026-06-08T01:00:00.000Z'
          },
          {
            id: 'projection_3',
            messageId: 3,
            status: 'complete',
            speakerName: '林雪云',
            objectiveFact: '林雪云只对自己可见的事实。',
            createdAt: '2026-06-08T01:02:00.000Z'
          }
        ]),
        listMessageProjectionVisibilityBySessionId: vi.fn(() => [
          { projectionId: 'projection_1', characterId: 'char_xingyi', visibility: 'visible' },
          { projectionId: 'projection_3', characterId: 'char_xingyi', visibility: 'hidden' },
          { projectionId: 'projection_3', characterId: 'char_xueyun', visibility: 'visible' }
        ])
      }
    })

    const result = service.getProjectionFirstMessageViewBySessionId('session_1', {
      characterId: 'char_xingyi',
      windowSize: 3
    })

    expect(result.ok).toBe(true)
    expect(result.data.items.map((item) => [item.messageId, item.content, item.fallbackSource])).toEqual([
      [1, '用户告诉星依一件投影事实。', 'projection'],
      [2, '星依原文二', 'missing_projection_message_fallback'],
      [3, '另一个角色原文三', 'missing_projection_message_fallback']
    ])
    expect(result.data.items[0].content).not.toContain('用户原文一')
    expect(result.data.items.map((item) => item.content)).not.toContain('林雪云只对自己可见的事实。')
    expect(result.data.fallbackJobs.map((job) => job.messageId)).toEqual([2, 3])
  })

  it('投影模型不可用时写入 failed 投影和失败审计', async () => {
    const upsertMessageProjection = vi.fn((_sessionId, payload) => ({ ...payload }))
    const insertPromptLog = vi.fn()
    const service = createChatService({
      characterRepository: {
        getUserProfile: vi.fn(() => ({ name: '用户' })),
        getCharacters: vi.fn(() => [{ id: 'char_xingyi', name: '星依' }])
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_xingyi', target_type: 'char' })),
        findMessageByIdInSession: vi.fn(() => ({
          id: 10,
          role: 'assistant',
          message_kind: 'chat',
          member_name: '星依',
          content: '<think>内部</think>知道了。'
        })),
        listSessionParticipants: vi.fn(() => [{ participantTargetId: 'char_xingyi', participantType: 'char' }]),
        listMessageProjectionsBySessionId: vi.fn(() => []),
        upsertMessageProjection,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      }
    })

    const result = await service.runChatMessageProjectionBySessionId('session_1', 10)

    expect(result.ok).toBe(true)
    expect(result.data.error).toBe('AI 服务未配置')
    expect(upsertMessageProjection).toHaveBeenLastCalledWith(
      'session_1',
      expect.objectContaining({
        messageId: 10,
        status: 'failed',
        speakerName: '星依',
        fallbackCleanText: '知道了。',
        failureStage: 'call_model',
        failureReason: 'AI 服务未配置'
      })
    )
    expect(insertPromptLog).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({ assistantMessageId: 10, speakerName: '消息投影 Agent' })
    )
  })

  it('允许用户输入环境前置链写入 narration_debug 调试旁白', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 12 }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const result = service.addChatMessageBySessionId('session_a', {
      role: 'assistant',
      messageKind: 'narration_debug',
      content: '是',
      name: '旁白快判',
      memberName: '旁白快判'
    })

    expect(result.ok).toBe(true)
    expect(insertMessage).toHaveBeenCalledWith('session_a', expect.objectContaining({
      role: 'assistant',
      messageKind: 'narration_debug',
      content: '是',
      memberName: '旁白快判'
    }))
  })

  it('首条用户消息只写消息，不再调用 AI 改写会话标题', () => {
    const callAIWithFallback = vi.fn()
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 13 }))
    const service = createChatService({
      aiService: { callAIWithFallback },
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId, title: '三轮霞等19人' })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const result = service.addChatMessageBySessionId('session_a', {
      role: 'user',
      content: '这次任务叫咒术回战。'
    })

    expect(result.ok).toBe(true)
    expect(callAIWithFallback).not.toHaveBeenCalled()
  })

  it('拒绝新增 CAPS 人格网络 caps_reply 消息', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 14 }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const result = service.addChatMessageBySessionId('session_a', {
      role: 'assistant',
      messageKind: 'caps_reply',
      content: '我知道该怎么回答。',
      memberName: '星依',
      memberTargetId: 'char_xingyi'
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(410)
    expect(result.error).toContain('已退役')
    expect(insertMessage).not.toHaveBeenCalled()
  })

  it('创建会话消息时保留不进入提示词上下文的隐藏标记', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 13 }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const result = service.addChatMessageBySessionId('session_a', {
      role: 'assistant',
      messageKind: 'narration',
      content: '只给屏幕看的灯影旁白。',
      memberName: '旁白',
      narrationProfileId: 'custom_lamp',
      narrationProfileName: '灯影',
      narrationProfileKind: 'custom',
      includeInContext: false,
      autoWriteHidden: true,
      autoWriteHiddenAt: '2026-05-16T01:00:00.000Z',
      autoWriteBatchId: 'manual',
      autoWriteHiddenReason: 'narration_profile_excluded'
    })

    expect(result.ok).toBe(true)
    expect(insertMessage).toHaveBeenCalledWith('session_a', expect.objectContaining({
      messageKind: 'narration',
      narrationProfileId: 'custom_lamp',
      narrationProfileName: '灯影',
      narrationProfileKind: 'custom',
      includeInContext: false,
      autoWriteHidden: true,
      autoWriteHiddenAt: '2026-05-16T01:00:00.000Z',
      autoWriteBatchId: 'manual',
      autoWriteHiddenReason: 'narration_profile_excluded'
    }))
  })

  it('创建会话消息时把 attachments 数组序列化进 attachmentsJson', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 15 }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const attachments = [{ id: 'attach_1', kind: 'image', url: '/chat-images/attach_1.png', mime: 'image/png' }]
    const result = service.addChatMessageBySessionId('session_a', {
      role: 'user',
      content: '看看这张图',
      attachments
    })

    expect(result.ok).toBe(true)
    expect(insertMessage).toHaveBeenCalledWith('session_a', expect.objectContaining({
      attachmentsJson: JSON.stringify(attachments)
    }))
  })

  it('未带附件的消息落库时 attachmentsJson 落空数组字符串', () => {
    const insertMessage = vi.fn(() => ({ lastInsertRowid: 16 }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        insertMessage,
        touchSession: vi.fn()
      }
    })

    const result = service.addChatMessageBySessionId('session_a', {
      role: 'user',
      content: '普通文字消息'
    })

    expect(result.ok).toBe(true)
    expect(insertMessage).toHaveBeenCalledWith('session_a', expect.objectContaining({
      attachmentsJson: '[]'
    }))
  })

  it('列出聊天归档前会执行孤儿归档修复', () => {
    const repairOrphanChatArchives = vi.fn()
    const listArchivedSessions = vi.fn(() => [{ id: 'archive_1' }])
    const service = createChatService({
      repairOrphanChatArchives,
      chatRepository: {
        listArchivedSessions
      }
    })

    const result = service.listChatArchives()

    expect(result).toEqual([{ id: 'archive_1' }])
    expect(repairOrphanChatArchives).toHaveBeenCalledTimes(1)
    expect(listArchivedSessions).toHaveBeenCalledTimes(1)
  })

  it('创建多人会话时写参与者表，不要求正式群聊实体', () => {
    const upsertSession = vi.fn()
    const replaceSessionParticipants = vi.fn()
    const listSessionParticipants = vi.fn((sessionId) => [
      { sessionId, participantTargetId: 'char_1', participantType: 'char', displayOrder: 0 },
      { sessionId, participantTargetId: 'char_2', participantType: 'char', displayOrder: 1 }
    ])
    const getSessionById = vi.fn((sessionId) => ({
      id: sessionId,
      target_id: 'char_1',
      target_type: 'char',
      title: '星依、晚晚2人'
    }))
    const service = createChatService({
      chatRepository: {
        upsertSession,
        replaceSessionParticipants,
        listSessionParticipants,
        getSessionById,
        getRecentMessagesBySessionId: vi.fn(() => [])
      }
    })

    const result = service.createChatSession({
      targetId: 'char_1',
      targetType: 'char',
      title: '星依、晚晚2人',
      conversationAvatarPath: '/avatars/session.png',
      conversationEmoji: '会',
      virtualSceneName: '阿什菲尔德宅邸',
      virtualSceneDesc: '午后客厅',
      virtualLocationLarge: '维斯珂',
      virtualLocationMiddle: '阿什菲尔德宅邸',
      virtualLocationSmall: '客厅',
      virtualTime: '2026-04-28T13:00',
      virtualTimeAnchor: 123456,
      virtualTimeBase: 1777352400000,
      virtualTimeRate: 2,
      virtualWeather: '小雨',
      virtualWeatherMode: 'custom',
      boundAlias: 'alias_housekeeper',
      narrationFrequency: 'active',
      narrationTemperature: 'bloom',
      participants: [
        { targetId: 'char_1', targetType: 'char', displayName: '星依', displayOrder: 0, probability: 90 },
        { targetId: 'char_2', targetType: 'char', displayName: '晚晚', displayOrder: 1, probability: 0 }
      ]
    })

    expect(result.ok).toBe(true)
    expect(upsertSession).toHaveBeenCalledWith(expect.stringMatching(/^session_/), expect.objectContaining({
      targetId: 'char_1',
      targetType: 'char',
      title: '星依、晚晚2人',
      conversationAvatarPath: '/avatars/session.png',
      conversationEmoji: '会',
      virtualSceneName: '阿什菲尔德宅邸',
      virtualSceneDesc: '午后客厅',
      virtualLocationLarge: '维斯珂',
      virtualLocationMiddle: '阿什菲尔德宅邸',
      virtualLocationSmall: '客厅',
      virtualLocation: '维斯珂 / 阿什菲尔德宅邸 / 客厅',
      virtualTime: '2026-04-28T13:00',
      virtualTimeAnchor: 123456,
      virtualTimeBase: 1777352400000,
      virtualTimeRate: 2,
      virtualWeather: '小雨',
      virtualWeatherMode: 'custom',
      boundAlias: 'alias_housekeeper',
      narrationFrequency: 'active',
      narrationTemperature: 'bloom'
    }))
    expect(replaceSessionParticipants).toHaveBeenCalledWith(expect.stringMatching(/^session_/), [
      expect.objectContaining({ participantTargetId: 'char_1', participantType: 'char', displayOrder: 0, replyProbability: 90 }),
      expect.objectContaining({ participantTargetId: 'char_2', participantType: 'char', displayOrder: 1, replyProbability: 0 })
    ])
    expect(result.data.session.participants).toHaveLength(2)
  })

  it('创建会话未显式填写帷幕地点时不继承旧虚拟地点', () => {
    const upsertSession = vi.fn()
    const replaceSessionParticipants = vi.fn()
    const service = createChatService({
      chatRepository: {
        upsertSession,
        replaceSessionParticipants,
        listSessionParticipants: vi.fn(() => []),
        getSessionById: vi.fn((sessionId) => ({
          id: sessionId,
          target_id: 'char_1',
          target_type: 'char',
          title: '星依'
        })),
        getRecentMessagesBySessionId: vi.fn(() => [])
      }
    })

    const result = service.createChatSession({
      targetId: 'char_1',
      targetType: 'char',
      participants: [
        { targetId: 'char_1', targetType: 'char', displayName: '星依', displayOrder: 0 }
      ]
    })

    expect(result.ok).toBe(true)
    expect(upsertSession).toHaveBeenCalledWith(expect.stringMatching(/^session_/), expect.objectContaining({
      virtualLocationLarge: '',
      virtualLocationMiddle: '',
      virtualLocationSmall: '',
      virtualLocation: ''
    }))
    expect(replaceSessionParticipants).toHaveBeenCalled()
  })

  it('更新帷幕虚拟时间后立即触发数据库落盘', () => {
    const persist = vi.fn()
    const updateSessionById = vi.fn()
    const service = createChatService({
      persist,
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        listSessionColumns: vi.fn(() => [
          { name: 'virtual_time' },
          { name: 'virtual_time_anchor' },
          { name: 'virtual_time_base' },
          { name: 'virtual_time_rate' },
          { name: 'updated_at' }
        ]),
        updateSessionById
      }
    })

    const result = service.updateChatSessionById('session_time', {
      virtualTime: '2026-05-11T20:30:00',
      virtualTimeAnchor: 1778500800000,
      virtualTimeBase: 1778502600000,
      virtualTimeRate: 0
    })

    expect(result.ok).toBe(true)
    expect(updateSessionById).toHaveBeenCalledWith('session_time', {
      virtual_time: '2026-05-11T20:30:00',
      virtual_time_anchor: 1778500800000,
      virtual_time_base: 1778502600000,
      virtual_time_rate: 0
    }, true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('会话头像 data URI 先写入头像存储与台账，再把正式路径写入会话', () => {
    const updateSessionById = vi.fn()
    const saveAvatarDataUri = vi.fn(() => 'avatars/chat_session_user_session_avatar.png')
    const service = createChatService({
      saveAvatarDataUri,
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        listSessionColumns: vi.fn(() => [{ name: 'conversation_avatar_path' }]),
        updateSessionById
      }
    })

    const result = service.updateChatSessionById('session_avatar', {
      conversationAvatarPath: 'data:image/png;base64,AAAA'
    })

    expect(result.ok).toBe(true)
    expect(saveAvatarDataUri).toHaveBeenCalledWith('data:image/png;base64,AAAA', expect.stringContaining('chat_session_'))
    expect(updateSessionById).toHaveBeenCalledWith('session_avatar', {
      conversation_avatar_path: 'avatars/chat_session_user_session_avatar.png'
    }, false)
  })

  it('删除会话时同步清理会话树', () => {
    const deleteSessionTreeById = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        deleteSessionTreeById
      }
    })

    const result = service.deleteChatSessionById('session_delete')

    expect(result.ok).toBe(true)
    expect(deleteSessionTreeById).toHaveBeenCalledWith('session_delete')
  })

  it('批量删除会话时校验完整集合并只持久化一次', () => {
    const deleteSessionTreesByIds = vi.fn()
    const getSessionsByIds = vi.fn((sessionIds) => sessionIds.map((id) => ({ id })))
    const persist = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionsByIds,
        deleteSessionTreesByIds
      },
      persist
    })

    const result = service.deleteChatSessionsByIds({ sessionIds: ['session_a', 'session_b', 'session_a'] })

    expect(result.ok).toBe(true)
    expect(getSessionsByIds).toHaveBeenCalledTimes(1)
    expect(getSessionsByIds).toHaveBeenCalledWith(['session_a', 'session_b'])
    expect(deleteSessionTreesByIds).toHaveBeenCalledTimes(1)
    expect(deleteSessionTreesByIds).toHaveBeenCalledWith(['session_a', 'session_b'])
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('批量删除会话缺少任一 ID 时整体拒绝且不写入', () => {
    const deleteSessionTreesByIds = vi.fn()
    const persist = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionsByIds: vi.fn(() => [{ id: 'session_a' }]),
        deleteSessionTreesByIds
      },
      persist
    })

    const result = service.deleteChatSessionsByIds({ sessionIds: ['session_a', 'session_missing'] })

    expect(result).toEqual(expect.objectContaining({ ok: false, status: 404 }))
    expect(deleteSessionTreesByIds).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('原子复制消息时一次提交完整有序字段并只持久化一次', () => {
    const transaction = vi.fn((work) => work())
    const insertMessages = vi.fn((_sessionId, messages) => ({ count: messages.length }))
    const touchSession = vi.fn()
    const ensureChatSession = vi.fn()
    const persist = vi.fn()
    const service = createChatService({
      chatRepository: { transaction, insertMessages, touchSession },
      ensureChatSession,
      persist
    })

    const result = service.copyChatMessages('char_target', {
      messages: [
        { role: 'user', content: '第一条', env_date: '7月16日', attachments_json: '[{"id":"a"}]' },
        { role: 'assistant', messageKind: 'chat', content: '第二条', memberName: '星依', versionList: ['旧稿'], activeVersionIndex: 1 }
      ]
    })

    expect(result).toEqual({ ok: true, data: { ok: true, count: 2 } })
    expect(ensureChatSession).toHaveBeenCalledTimes(1)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(insertMessages).toHaveBeenCalledTimes(1)
    expect(insertMessages).toHaveBeenCalledWith('char_target', [
      expect.objectContaining({ role: 'user', content: '第一条', envDate: '7月16日', attachmentsJson: '[{"id":"a"}]' }),
      expect.objectContaining({ role: 'assistant', content: '第二条', memberName: '星依', versionsJson: '["旧稿"]', activeVersionIndex: 1 })
    ])
    expect(touchSession).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('原子复制消息任一项非法时在事务前整体拒绝', () => {
    const insertMessages = vi.fn()
    const ensureChatSession = vi.fn()
    const persist = vi.fn()
    const service = createChatService({
      chatRepository: { insertMessages },
      ensureChatSession,
      persist
    })

    const result = service.copyChatMessages('char_target', {
      messages: [
        { role: 'user', content: '有效消息' },
        { role: 'assistant', content: '' }
      ]
    })

    expect(result).toEqual(expect.objectContaining({ ok: false, status: 400 }))
    expect(ensureChatSession).not.toHaveBeenCalled()
    expect(insertMessages).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('按 sessionId 归档会话，不回退到 targetId', () => {
    const archiveChatSession = vi.fn(() => ({ id: 'archive_1', name: '归档' }))
    const service = createChatService({
      archiveChatSession,
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId, target_id: 'char_1' }))
      }
    })

    const result = service.archiveChatSessionById('session_a')

    expect(result.ok).toBe(true)
    expect(archiveChatSession).toHaveBeenCalledWith('session_a', { name: '', category: '' })
  })

  it('绑定召回日志时可以同步写回完整活动产物', () => {
    const updateRecallActivityLog = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        updateRecallActivityLog
      }
    })

    const result = service.updateChatRecallActivityLogBySessionId('session_a', 'recall_log_1', {
      assistantMessageId: 12,
      inputMessageId: 10,
      speakerName: '星依',
      targetId: 'char_xingyi',
      activity: {
        id: 'run_1',
        status: 'completed',
        events: [{ id: 'event_1', status: 'completed' }]
      }
    })

    expect(result.ok).toBe(true)
    expect(updateRecallActivityLog).toHaveBeenCalledWith('session_a', 'recall_log_1', expect.objectContaining({
      assistantMessageId: 12,
      inputMessageId: 10,
      speakerName: '星依',
      targetId: 'char_xingyi',
      runId: 'run_1',
      status: 'completed',
      activityJson: JSON.stringify({
        id: 'run_1',
        status: 'completed',
        events: [{ id: 'event_1', status: 'completed' }]
      })
    }))
  })

  it('保存大召回活动日志时入库前无损压缩，读取时还原', () => {
    const largeText = '张元英在车内保持沉默，持续观察车外警笛和英格丽德的行动。'.repeat(400)
    const activity = {
      id: 'run_large',
      status: 'completed',
      events: Array.from({ length: 20 }, (_, index) => ({
        id: `event_${index}`,
        status: 'completed',
        output: {
          confirmed: [{
            id: `unit_${index}`,
            title: `确认单位 ${index}`,
            summary: largeText,
            contentText: largeText
          }]
        },
        metrics: {
          confirmedUnits: [{
            id: `unit_${index}`,
            title: `确认单位 ${index}`,
            summary: largeText,
            contentText: largeText
          }]
        }
      }))
    }
    let savedRow = null
    const insertRecallActivityLog = vi.fn((_sessionId, payload) => {
      savedRow = {
        ...payload,
        session_id: 'session_a',
        activity_json: payload.activityJson
      }
    })
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        countRecallActivityLogsBySessionId: vi.fn(() => 0),
        insertRecallActivityLog,
        findRecallActivityLogById: vi.fn(() => savedRow)
      },
      persist: vi.fn()
    })

    const result = service.createChatRecallActivityLogBySessionId('session_a', {
      inputMessageId: 10,
      assistantMessageId: 12,
      speakerName: '星依',
      targetId: 'char_xingyi',
      activity
    })

    expect(result.ok).toBe(true)
    const stored = JSON.parse(savedRow.activityJson)
    expect(isEncodedRecallActivityLogEnvelope(stored)).toBe(true)
    expect(savedRow.activityJson.length).toBeLessThan(JSON.stringify(activity).length / 2)
    expect(decodeRecallActivityLogValue(savedRow.activityJson)).toEqual(activity)
    expect(result.data.activity).toEqual(activity)
  })

  it('定位召回日志时允许用本轮用户消息找到已绑定助手消息的完整活动', () => {
    const findLatestRecallActivityLogByMessageId = vi.fn(() => ({
      id: 'recall_log_1',
      sessionId: 'session_a',
      inputMessageId: 10,
      assistantMessageId: 12,
      activity: { id: 'run_1', events: [] },
      createdAt: '2026-05-09T10:00:00.000Z'
    }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findLatestRecallActivityLogByMessageId
      }
    })

    const result = service.locateChatRecallActivityLogBySessionId('session_a', '10')

    expect(result.ok).toBe(true)
    expect(findLatestRecallActivityLogByMessageId).toHaveBeenCalledWith('session_a', 10)
    expect(result.data.assistantMessageId).toBe(12)
  })

  it('定位召回日志时普通无日志消息返回空结果而不是 404', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findLatestRecallActivityLogByMessageId: vi.fn(() => null)
      }
    })

    const result = service.locateChatRecallActivityLogBySessionId('session_a', '2140')

    expect(result.ok).toBe(true)
    expect(result.data).toBeNull()
  })

  it('旧目标定位召回日志时普通无日志消息返回空结果而不是 404', () => {
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        getSessionByTargetId: vi.fn(() => null),
        createSession: vi.fn(),
        findLatestRecallActivityLogByMessageId: vi.fn(() => null)
      }
    })

    const result = service.locateChatRecallActivityLog('char_xingyi', '2140')

    expect(result.ok).toBe(true)
    expect(result.data).toBeNull()
  })

  it('删除助手消息时按真实消息角色清理召回日志，避免误清已绑定输入消息的完整活动', () => {
    const deleteRecallActivityLogsByMessageId = vi.fn()
    const persist = vi.fn()
    const service = createChatService({
      persist,
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findMessageByIdInSession: vi.fn(() => ({ id: 12, role: 'assistant' })),
        deleteMessageBySession: vi.fn(),
        deletePromptLogsByMessageId: vi.fn(),
        deleteRecallActivityLogsByMessageId
      }
    })

    const result = service.deleteChatMessageBySessionId('session_a', '12')

    expect(result.ok).toBe(true)
    expect(deleteRecallActivityLogsByMessageId).toHaveBeenCalledWith('session_a', 12, 'assistant')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('删除旁白消息时同步清理提示词日志和召回证据', () => {
    const deletePromptLogsByMessageId = vi.fn()
    const deleteRecallActivityLogsByMessageId = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findMessageByIdInSession: vi.fn(() => ({ id: 77, role: 'assistant', messageKind: 'narration' })),
        deleteMessageBySession: vi.fn(),
        deletePromptLogsByMessageId,
        deleteRecallActivityLogsByMessageId
      }
    })

    const result = service.deleteChatMessageBySessionId('session_a', '77')

    expect(result.ok).toBe(true)
    expect(deletePromptLogsByMessageId).toHaveBeenCalledWith('session_a', 77)
    expect(deleteRecallActivityLogsByMessageId).toHaveBeenCalledWith('session_a', 77, 'assistant')
  })

  it('重新生成时可以只清理同一消息下旧提示词日志并保留新日志', () => {
    const deletePromptLogsByMessageIdExcept = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        deletePromptLogsByMessageIdExcept
      }
    })

    const result = service.deleteChatPromptLogsByMessageId('session_a', '88', 'prompt_keep')

    expect(result.ok).toBe(true)
    expect(deletePromptLogsByMessageIdExcept).toHaveBeenCalledWith('session_a', 88, 'prompt_keep')
  })

  it('定位提示词日志时按当前有效日志列表重算页码', () => {
    const findLatestPromptLogByMessageId = vi.fn(() => ({
      id: 'prompt_new',
      sessionId: 'session_a',
      pageIndex: 99,
      assistantMessageId: 188,
      createdAt: '2026-05-11T12:00:00.000Z'
    }))
    const getPromptLogPageById = vi.fn(() => 1)
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findLatestPromptLogByMessageId,
        getPromptLogPageById
      }
    })

    const result = service.locateChatPromptLogBySessionId('session_a', '188')

    expect(result.ok).toBe(true)
    expect(findLatestPromptLogByMessageId).toHaveBeenCalledWith('session_a', 188, 'final_reply')
    expect(getPromptLogPageById).toHaveBeenCalledWith('session_a', 'prompt_new', 30)
    expect(result.data).toEqual(expect.objectContaining({ logId: 'prompt_new', page: 1 }))
    expect(result.data.entry).toEqual(expect.objectContaining({ id: 'prompt_new', assistantMessageId: 188 }))
  })

  it('按会话保存和删除临时角色，不写入正式角色仓库', () => {
    const savedRows = []
    const upsertSessionTemporaryCharacter = vi.fn((row) => {
      savedRows.push(row)
    })
    const deleteSessionTemporaryCharacter = vi.fn(() => 1)
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findSessionTemporaryCharacterById: vi.fn(() => null),
        upsertSessionTemporaryCharacter,
        findSessionTemporaryCharacterById: vi.fn((_sessionId, characterId) => savedRows.find((row) => row.id === characterId) || null),
        deleteSessionTemporaryCharacter
      },
      persistChatMutation: vi.fn()
    })

    const saved = service.saveSessionTemporaryCharacterBySessionId('session_1', {
      name: '杂货商',
      aliases: ['老板'],
      markdown: '只在当前会话出现。',
      lockedFields: ['身份'],
      sourceLedger: [{ source: 'manual' }]
    })

    expect(saved.ok).toBe(true)
    expect(upsertSessionTemporaryCharacter).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_1',
      name: '杂货商',
      aliasesJson: JSON.stringify(['老板']),
      markdown: '只在当前会话出现。',
      lockedFieldsJson: JSON.stringify(['身份']),
      sourceLedgerJson: JSON.stringify([{ source: 'manual' }]),
      status: 'active'
    }))

    const deleted = service.deleteSessionTemporaryCharacterBySessionId('session_1', saved.data.id)
    expect(deleted.ok).toBe(true)
    expect(deleteSessionTemporaryCharacter).toHaveBeenCalledWith('session_1', saved.data.id)
  })

  it('按会话保存统一临时实体，并保留类型、标签和持久化目标', () => {
    const savedRows = []
    const upsertSessionTemporaryEntity = vi.fn((row) => {
      savedRows.push(row)
    })
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        listSessionTemporaryEntities: vi.fn(() => [
          { id: 'entity_region_1', sessionId: 'session_1', kind: 'region', name: '旧港区' }
        ]),
        findSessionTemporaryEntityById: vi.fn((_sessionId, entityId) => savedRows.find((row) => row.id === entityId) || null),
        upsertSessionTemporaryEntity
      },
      persistChatMutation: vi.fn()
    })

    const listed = service.listSessionTemporaryEntitiesBySessionId('session_1')
    expect(listed.ok).toBe(true)
    expect(listed.data.items).toEqual([
      expect.objectContaining({ id: 'entity_region_1', kind: 'region', name: '旧港区' })
    ])

    const saved = service.saveSessionTemporaryEntityBySessionId('session_1', {
      kind: 'region',
      name: '旧港区',
      aliases: ['港口'],
      markdown: '只在当前会话确认。',
      tags: ['地点'],
      sourceLedger: [{ source: 'manual' }],
      persistedTarget: { documentId: 'doc_region_1' }
    })

    expect(saved.ok).toBe(true)
    expect(upsertSessionTemporaryEntity).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_1',
      kind: 'region',
      name: '旧港区',
      aliasesJson: JSON.stringify(['港口']),
      markdown: '只在当前会话确认。',
      tagsJson: JSON.stringify(['地点']),
      sourceLedgerJson: JSON.stringify([{ source: 'manual' }]),
      persistedTargetJson: JSON.stringify({ documentId: 'doc_region_1' }),
      status: 'active'
    }))
  })

  it('按整理命令生成非角色临时实体并写入提示词日志', async () => {
    const savedRows = []
    const upsertSessionTemporaryEntity = vi.fn((row) => savedRows.push(row))
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({
      upstream: {
        json: async () => ({
          choices: [{
            message: {
              content: '## 名称\n\n### v1 | 来源 S1\n铜叶子旅店\n\n## 建筑类型\n\n### v1 | 来源 S1\n旧巷旅店。'
            }
          }]
        })
      },
      model: 'test-model',
      presetName: 'test-preset'
    }))
    const service = createChatService({
      getAgentModelConfigs: vi.fn(() => [{
        id: 'brain_agent',
        modelUsageConfigs: [
          { id: 'balanced', label: '均衡模型', presetName: 'balanced-preset', model: 'balanced-model', temperature: 0.6, maxTokens: 900, thinking: 'disabled' }
        ]
      }]),
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 1, role: 'user', content: '铜叶子旅店在旧巷尽头，门口挂着褪色铜牌。', messageKind: 'chat', name: '用户' }
        ]),
        listSessionTemporaryEntities: vi.fn(() => []),
        findSessionTemporaryEntityById: vi.fn((_sessionId, entityId) => savedRows.find((row) => row.id === entityId) || null),
        upsertSessionTemporaryEntity,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      },
      aiService: {
        callAIWithFallback
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.organizeSessionTemporaryEntityByCommand('session_1', {
      rawText: '/整理建筑 铜叶子旅店'
    })

    expect(result.ok).toBe(true)
    expect(result.data.created).toBe(true)
    expect(upsertSessionTemporaryEntity).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_1',
      kind: 'building',
      name: '铜叶子旅店',
      markdown: expect.stringContaining('## 建筑类型')
    }))
    expect(insertPromptLog).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '临时建筑资料生成',
      finalPrompt: expect.stringContaining('会话临时建筑')
    }))
    expect(callAIWithFallback).toHaveBeenCalledWith(
      'balanced-preset',
      'balanced-model',
      expect.any(Array),
      false,
      expect.anything(),
      expect.objectContaining({
        feature: 'agent',
        maxTokens: 1800,
        temperature: 0.6,
        thinking: 'disabled'
      })
    )
  })

  it('/创建角色 提取使用高能模型配置', async () => {
    const insertPromptLog = vi.fn()
    const callAIWithFallback = vi.fn(async () => ({
      upstream: {
        json: async () => ({
          choices: [{
            message: {
              content: [
                '## 名称',
                '杂货商',
                '',
                '## 图标',
                '🧺',
                '',
                '## 性别',
                '',
                '',
                '## 年龄',
                '',
                '',
                '## 简介',
                '旧巷里的杂货商。',
                '',
                '## 外貌',
                '',
                '',
                '## 说话风格',
                '说话短促。',
                '',
                '## 性格',
                '',
                '',
                '## 穿着',
                '',
                '',
                '## 爱好',
                '',
                '',
                '## 能力',
                '',
                '',
                '## 经历',
                '',
                '',
                '## 世界观',
                '',
                '',
                '## 背景',
                ''
              ].join('\n')
            }
          }]
        })
      },
      model: 'power-used',
      presetName: 'power-used-preset'
    }))
    const service = createChatService({
      getAgentModelConfigs: vi.fn(() => [{
        id: 'brain_agent',
        modelUsageConfigs: [
          { id: 'power', label: '高能模型', presetName: 'power-preset', model: 'power-model', temperature: 0.8, maxTokens: 8192, thinking: 'disabled' }
        ]
      }]),
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 1, role: 'user', content: '杂货商从柜台后递出旧铜币。', messageKind: 'chat', name: '用户' }
        ]),
        insertMessage: vi.fn(() => ({ lastInsertRowid: 9 })),
        touchSession: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog
      },
      aiService: {
        callAIWithFallback
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.extractImprovisedCharacterBySessionId('session_1', {
      targetName: '杂货商'
    })

    expect(result.ok).toBe(true)
    expect(insertPromptLog).toHaveBeenCalledWith('session_1', expect.objectContaining({
      speakerName: '即兴角色提取',
      finalPrompt: expect.stringContaining('即兴角色核心资料提取器')
    }))
    expect(callAIWithFallback).toHaveBeenCalledWith(
      'power-preset',
      'power-model',
      expect.any(Array),
      false,
      expect.anything(),
      expect.objectContaining({
        feature: 'agent',
        maxTokens: 1800,
        temperature: 0.8,
        thinking: 'disabled'
      })
    )
  })

  it('把非角色临时实体直接转正为当前世界实体，并写回幂等目标', async () => {
    const savedRows = []
    savedRows.push({
      id: 'entity_building_1',
      sessionId: 'session_1',
      kind: 'building',
      name: '铜叶子旅店',
      aliasesJson: '[]',
      markdown: '# 铜叶子旅店',
      tagsJson: JSON.stringify(['建筑']),
      sourceLedgerJson: '[]',
      status: 'active',
      persistedTargetJson: JSON.stringify({ type: 'docLibraryPending', status: 'pending' }),
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z'
    })
    const upsertSessionTemporaryEntity = vi.fn((row) => {
      const index = savedRows.findIndex((item) => item.id === row.id)
      if (index >= 0) savedRows.splice(index, 1, row)
      else savedRows.push(row)
    })
    const worldEntities = new Map()
    const upsertWorldEntity = vi.fn((row) => worldEntities.set(row.id, row))
    const upsertStatusPanel = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId, world_id: 'world_1' })),
        findSessionTemporaryEntityById: vi.fn((_sessionId, entityId) => savedRows.find((row) => row.id === entityId) || null),
        upsertSessionTemporaryEntity,
        upsertWorldEntity,
        findWorldEntityById: vi.fn((worldId, entityId) => {
          const row = worldEntities.get(entityId)
          return row?.worldId === worldId ? row : null
        }),
        listStatusPanels: vi.fn((_sessionId, worldId) => worldId === 'world_1' ? [{
          id: 'panel_1', sessionId: 'session_1', templateId: 'template_1', name: '旅店状态',
          hostType: 'temp_entity', hostId: 'entity_building_1', valuesJson: '{}', fieldsJson: '[]',
          worldId: 'world_1', status: 'active', createdAt: '2026-05-15T00:00:00.000Z'
        }] : []),
        upsertStatusPanel
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.persistSessionTemporaryEntityBySessionId('session_1', 'entity_building_1')

    expect(result.ok).toBe(true)
    expect(result.data.persistedTarget).toMatchObject({
      type: 'worldEntity',
      worldId: 'world_1',
      kind: 'building',
      entityId: expect.stringMatching(/^world_entity_building_/),
      migratedFrom: 'docLibraryPending'
    })
    expect(upsertWorldEntity).toHaveBeenCalledWith(expect.objectContaining({
      worldId: 'world_1',
      kind: 'building',
      name: '铜叶子旅店',
      markdown: '# 铜叶子旅店'
    }))
    expect(upsertSessionTemporaryEntity).toHaveBeenCalledWith(expect.objectContaining({
      id: 'entity_building_1',
      kind: 'building',
      worldId: 'world_1',
      persistedTargetJson: expect.stringContaining('worldEntity')
    }))
    expect(upsertStatusPanel).toHaveBeenCalledWith(expect.objectContaining({
      id: 'panel_1',
      worldId: 'world_1',
      hostType: 'world_entity',
      hostId: result.data.persistedTarget.entityId
    }))

    const second = await service.persistSessionTemporaryEntityBySessionId('session_1', 'entity_building_1')
    expect(second.ok).toBe(true)
    expect(second.data.persistedTarget.entityId).toBe(result.data.persistedTarget.entityId)
    expect(upsertWorldEntity).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ id: 'session_1', world_id: '' }, { kind: 'building', worldId: '' }, 400, '尚未加入世界'],
    [{ id: 'session_1', world_id: 'world_1' }, { kind: 'event_note', worldId: 'world_1' }, 400, '不是世界实体'],
    [{ id: 'session_1', world_id: 'world_1' }, { kind: 'region', worldId: 'world_2' }, 409, '另一个世界']
  ])('非角色临时实体转正边界：会话=%o 实体=%o', async (session, entityInput, status, message) => {
    const entity = {
      id: 'entity_boundary_1', sessionId: 'session_1', name: '边界实体', aliasesJson: '[]', markdown: '',
      tagsJson: '[]', sourceLedgerJson: '[]', status: 'active', persistedTargetJson: '{}',
      createdAt: '2026-05-15T00:00:00.000Z', updatedAt: '2026-05-15T00:00:00.000Z',
      ...entityInput
    }
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => session),
        findSessionTemporaryEntityById: vi.fn(() => entity),
        upsertWorldEntity: vi.fn(),
        upsertSessionTemporaryEntity: vi.fn()
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.persistSessionTemporaryEntityBySessionId('session_1', entity.id)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(status)
    expect(result.error).toContain(message)
  })

  it('把临时角色转为正式角色后写回持久化目标', async () => {
    const savedRows = []
    savedRows.push({
      id: 'entity_character_1',
      sessionId: 'session_1',
      kind: 'character',
      name: '杂货商',
      aliasesJson: '[]',
      markdown: '## 名称\n\n### v1 | 来源 S1\n杂货商\n\n## 身份或称呼\n\n### v1 | 来源 S1\n柜台后的商人。',
      tagsJson: '[]',
      sourceLedgerJson: '[]',
      status: 'active',
      persistedTargetJson: '{}',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z'
    })
    const upsertSessionTemporaryEntity = vi.fn((row) => {
      const index = savedRows.findIndex((item) => item.id === row.id)
      if (index >= 0) savedRows.splice(index, 1, row)
      else savedRows.push(row)
    })
    const insertCharacter = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        findSessionTemporaryEntityById: vi.fn((_sessionId, entityId) => savedRows.find((row) => row.id === entityId) || null),
        upsertSessionTemporaryEntity
      },
      characterRepository: {
        getCharacterGroups: vi.fn(() => []),
        insertCharacterGroup: vi.fn(),
        getCharacters: vi.fn(() => []),
        insertCharacter
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.persistSessionTemporaryEntityBySessionId('session_1', 'entity_character_1')

    expect(result.ok).toBe(true)
    expect(insertCharacter).toHaveBeenCalled()
    expect(result.data.persistedTarget).toMatchObject({
      type: 'character',
      characterId: expect.stringMatching(/^improvised_/),
      groupId: 'improvised_characters'
    })
    expect(upsertSessionTemporaryEntity).toHaveBeenCalledWith(expect.objectContaining({
      id: 'entity_character_1',
      kind: 'character',
      persistedTargetJson: expect.stringContaining('characterId')
    }))
  })

  it('旧未知 @ 创建接口只返回迁移提示，不再写入临时角色', async () => {
    const savedRows = []
    const upsertSessionTemporaryCharacter = vi.fn((row) => savedRows.push(row))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 1, role: 'user', content: '刚才杂货商在柜台后说只收旧币。', messageKind: 'chat' }
        ]),
        listSessionTemporaryCharacters: vi.fn(() => []),
        findSessionTemporaryCharacterById: vi.fn((_sessionId, characterId) => savedRows.find((row) => row.id === characterId) || null),
        upsertSessionTemporaryCharacter,
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      },
      aiService: {
        callAIWithFallback: vi.fn(async () => ({
          upstream: {
            json: async () => ({
              choices: [{
                message: {
                  content: '## 名称\n\n### v1 | 置信度 0.82 | 来源 S1\n杂货商\n\n## 身份或称呼\n\n### v1 | 置信度 0.74 | 来源 S1\n柜台后的商人。'
                }
              }]
            })
          }
        }))
      },
      persistChatMutation: vi.fn()
    })

    const result = await service.createOrUpdateSessionTemporaryCharacterByMention('session_1', { targetName: '杂货商' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(410)
    expect(result.error).toContain('/整理角色')
    expect(upsertSessionTemporaryCharacter).not.toHaveBeenCalled()
  })

  it('旧未知 @ 创建接口即使没有上下文证据也只返回迁移提示', async () => {
    const upsertSessionTemporaryCharacter = vi.fn()
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn((sessionId) => ({ id: sessionId })),
        getMessagesBySessionIdOrdered: vi.fn(() => [
          { id: 1, role: 'user', content: '这里只说了天气。', messageKind: 'chat' }
        ]),
        listSessionTemporaryCharacters: vi.fn(() => []),
        upsertSessionTemporaryCharacter
      },
      aiService: {
        callAIWithFallback: vi.fn()
      }
    })

    const result = await service.createOrUpdateSessionTemporaryCharacterByMention('session_1', { targetName: '杂货商' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(410)
    expect(result.error).toContain('/整理角色')
    expect(upsertSessionTemporaryCharacter).not.toHaveBeenCalled()
  })

  it('创建会话时可从指定快照 fork 独立角色分支，并在回包投影分支状态', () => {
    let session = null
    let participants = []
    const forkSessionCharacterBranch = vi.fn(({ sessionId, participantId }) => ({ id: `branch_${sessionId}_${participantId}` }))
    const resolveSessionCharacterBranch = vi.fn((characterId, branchId) => ({
      branch: { id: branchId, sessionId: session?.id, characterId },
      character: { id: characterId, name: '惊雨', desc: '快照里的简介' }
    }))
    const replaceSessionParticipants = vi.fn((_sessionId, rows) => { participants = rows })
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => session),
        getRecentMessagesBySessionId: vi.fn(() => []),
        upsertSession: vi.fn((id, payload) => { session = { id, ...payload } }),
        replaceSessionParticipants,
        listSessionParticipants: vi.fn(() => participants)
      },
      characterRepository: {
        getCharacterById: vi.fn(() => ({ id: 'char_1', name: '惊雨', desc: '主真值简介' }))
      },
      characterSnapshotService: {
        forkSessionCharacterBranch,
        resolveSessionCharacterBranch
      }
    })

    const result = service.createChatSession({
      participants: [{
        targetId: 'char_1', targetType: 'char', characterStateMode: 'independent_snapshot', sourceSnapshotId: 'snapshot_old'
      }]
    })

    expect(result.ok).toBe(true)
    expect(forkSessionCharacterBranch).toHaveBeenCalledWith(expect.objectContaining({
      characterId: 'char_1', sourceSnapshotId: 'snapshot_old'
    }))
    expect(replaceSessionParticipants.mock.calls[0][1][0]).toMatchObject({
      characterStateMode: 'independent_snapshot'
    })
    expect(result.data.participants[0]).toMatchObject({
      characterStateMode: 'independent_snapshot',
      resolvedCharacter: { desc: '快照里的简介' }
    })
  })

  it('会话角色状态 PATCH 只允许独立分支，并把变更写进对应 branch', () => {
    const patchSessionCharacterBranch = vi.fn(() => ({
      ok: true,
      character: { id: 'char_1', name: '惊雨', desc: '会话自己的简介' }
    }))
    const service = createChatService({
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listSessionParticipants: vi.fn(() => [{
          id: 'participant_1', participantType: 'char', participantTargetId: 'char_1',
          characterStateMode: 'independent_snapshot', characterBranchId: 'branch_1'
        }])
      },
      characterRepository: {
        getCharacterById: vi.fn(() => ({ id: 'char_1', name: '惊雨', desc: '主真值简介' }))
      },
      characterSnapshotService: {
        resolveSessionCharacterBranch: vi.fn(() => ({
          branch: { id: 'branch_1', sessionId: 'session_1', characterId: 'char_1' },
          character: { id: 'char_1', name: '惊雨', desc: '分支旧简介' }
        })),
        patchSessionCharacterBranch
      }
    })

    const result = service.patchChatSessionCharacterState('session_1', 'char_1', { changes: { desc: '会话自己的简介' } })

    expect(result.ok).toBe(true)
    expect(patchSessionCharacterBranch).toHaveBeenCalledWith('char_1', 'branch_1', { desc: '会话自己的简介' })
    expect(result.data.character.desc).toBe('会话自己的简介')
  })

  it('独立分支的投影写轨迹只更新 branch，不写 characters 主真值', async () => {
    const patchCharacterBrainTrace = vi.fn()
    const patchSessionCharacterBranch = vi.fn(() => ({ ok: true, character: {} }))
    const visibleRows = Array.from({ length: 4 }, (_, index) => ({
      id: `projection_${index + 1}`, sessionId: 'session_1', messageId: index + 1,
      speakerName: '用户', audienceNamesJson: '["星依"]',
      objectiveFact: `用户告诉星依要把第 ${index + 1} 件事记入轨迹。`, fallbackCleanText: ''
    }))
    const callAIWithFallback = vi.fn(async () => ({
      upstream: {
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          events: [{
            id: 'event_1', title: '记住约定', summary: '用户要求星依记住约定。',
            content: '用户告诉星依要把这件事记入轨迹。', sourceProjectionIds: ['projection_1']
          }]
        }) } }] })
      }
    }))
    const branchCharacter = {
      id: 'char_xingyi', name: '星依', nicknames: '[]',
      brainTraceNodes: '[]', brainTrajectoryMeta: '{"birthDate":"2026-01-01"}'
    }
    const service = createChatService({
      aiService: { callAIWithFallback },
      characterRepository: {
        getCharacterById: vi.fn(() => ({ ...branchCharacter, brainTraceNodes: '[{"id":"main_only"}]' })),
        patchCharacterBrainTrace
      },
      characterSnapshotService: {
        resolveSessionCharacterBranch: vi.fn(() => ({
          branch: { id: 'branch_1', sessionId: 'session_1', characterId: 'char_xingyi' },
          character: branchCharacter
        })),
        patchSessionCharacterBranch
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'session_1' })),
        listSessionParticipants: vi.fn(() => [{
          id: 'participant_1', participantType: 'char', participantTargetId: 'char_xingyi',
          characterStateMode: 'independent_snapshot', characterBranchId: 'branch_1'
        }]),
        listVisibleMessageProjectionsForCharacter: vi.fn(() => visibleRows),
        setMessageProjectionVisibility: vi.fn(),
        upsertProjectionWritebackRun: vi.fn(),
        countPromptLogsBySessionId: vi.fn(() => 0),
        insertPromptLog: vi.fn()
      }
    })

    const result = await service.runChatProjectionWritebackBySessionId('session_1', {
      characterId: 'char_xingyi', runKind: 'manual', runId: 'branch_writeback'
    })

    expect(result.ok).toBe(true)
    expect(patchSessionCharacterBranch).toHaveBeenCalledWith(
      'char_xingyi', 'branch_1', expect.objectContaining({ brainTraceNodes: expect.any(Array) })
    )
    expect(patchCharacterBrainTrace).not.toHaveBeenCalled()
  })

  // 工作区专业Agent会话：与星依常驻会话同款结构，但按 kind+targetId 去重，不是每用户一条。
  describe('workspaceAgent 会话（编剧/舆图师/人格训练师）', () => {
    it('ensureWorkspaceAgentSession 未知kind直接拒绝，不查库不建会话', () => {
      const findLatestSessionByKind = vi.fn()
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: { findLatestSessionByKind, insertWorkspaceAgentSession }
      })

      const result = service.ensureWorkspaceAgentSession('unknown_kind', 'world_1', '编剧')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(400)
      expect(findLatestSessionByKind).not.toHaveBeenCalled()
      expect(insertWorkspaceAgentSession).not.toHaveBeenCalled()
    })

    it('ensureWorkspaceAgentSession 缺targetId直接拒绝', () => {
      const service = createChatService({ chatRepository: {} })

      const result = service.ensureWorkspaceAgentSession('scriptwriter', '', '编剧')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(400)
    })

    it('personality_trainer 是正式工作区 kind，并按 characterId 建独立会话', () => {
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          findLatestSessionByKind: vi.fn(() => null),
          getSessionById: vi.fn((id) => ({ id, kind: 'personality_trainer', target_id: 'char_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 0),
          listSessionParticipants: vi.fn(() => []),
          insertWorkspaceAgentSession
        }
      })

      const result = service.ensureWorkspaceAgentSession('personality_trainer', 'char_1', '人格训练师')

      expect(result.ok).toBe(true)
      const [, payload] = insertWorkspaceAgentSession.mock.calls[0]
      expect(payload).toMatchObject({
        targetId: 'char_1', targetType: 'personality_trainer', kind: 'personality_trainer', title: '人格训练师'
      })
    })

    it('ensureWorkspaceAgentSession 已存在同scope会话时直接返回，不重复创建', () => {
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          findLatestSessionByKind: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', targetId: 'world_1' })),
          getSessionById: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', target_id: 'world_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 0),
          listSessionParticipants: vi.fn(() => []),
          insertWorkspaceAgentSession
        }
      })

      const result = service.ensureWorkspaceAgentSession('scriptwriter', 'world_1', '编剧')

      expect(result.ok).toBe(true)
      expect(insertWorkspaceAgentSession).not.toHaveBeenCalled()
    })

    it('ensureWorkspaceAgentSession 无同scope会话时新建，target_id/target_type按kind写入', () => {
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          findLatestSessionByKind: vi.fn(() => null),
          getSessionById: vi.fn((id) => ({ id, kind: 'cartographer', target_id: 'world_1:sheet_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 0),
          listSessionParticipants: vi.fn(() => []),
          insertWorkspaceAgentSession
        }
      })

      const result = service.ensureWorkspaceAgentSession('cartographer', 'world_1:sheet_1', '舆图师')

      expect(result.ok).toBe(true)
      expect(insertWorkspaceAgentSession).toHaveBeenCalledTimes(1)
      const [, payload] = insertWorkspaceAgentSession.mock.calls[0]
      expect(payload.targetId).toBe('world_1:sheet_1')
      expect(payload.targetType).toBe('cartographer')
      expect(payload.kind).toBe('cartographer')
      expect(payload.title).toBe('舆图师')
    })

    it('createWorkspaceAgentSession（新建对话）：最新同scope会话已有消息时新开一条', () => {
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          findLatestSessionByKind: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', targetId: 'world_1' })),
          getSessionById: vi.fn((id) => ({ id, kind: 'scriptwriter', target_id: 'world_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 3),
          listSessionParticipants: vi.fn(() => []),
          insertWorkspaceAgentSession
        }
      })

      const result = service.createWorkspaceAgentSession('scriptwriter', 'world_1', '编剧')

      expect(result.ok).toBe(true)
      expect(insertWorkspaceAgentSession).toHaveBeenCalledTimes(1)
    })

    it('createWorkspaceAgentSession：最新同scope会话为空时直接复用，不堆空会话', () => {
      const insertWorkspaceAgentSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          findLatestSessionByKind: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', targetId: 'world_1' })),
          getSessionById: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', target_id: 'world_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 0),
          listSessionParticipants: vi.fn(() => []),
          insertWorkspaceAgentSession
        }
      })

      const result = service.createWorkspaceAgentSession('scriptwriter', 'world_1', '编剧')

      expect(result.ok).toBe(true)
      expect(result.data.session.id).toBe('script_session_1')
      expect(insertWorkspaceAgentSession).not.toHaveBeenCalled()
    })

    it('listWorkspaceAgentSessions 按kind+targetId范围收窄，不跨scope串历史', () => {
      const listSessionsByKind = vi.fn(() => [
        { id: 's1', firstUserContent: '第一句话在这里', messageCount: 3, createdAt: 't1', updatedAt: 't2' }
      ])
      const service = createChatService({
        chatRepository: { listSessionsByKind }
      })

      const result = service.listWorkspaceAgentSessions('cartographer', 'world_1:sheet_1')

      expect(result.ok).toBe(true)
      expect(listSessionsByKind).toHaveBeenCalledWith('cartographer', 'world_1:sheet_1')
      expect(result.data.sessions[0].id).toBe('s1')
      expect(result.data.sessions[0].messageCount).toBe(3)
    })

    it('activateWorkspaceAgentSession：kind匹配但targetId不匹配（跨图纸/跨世界）时拒绝，不许误激活', () => {
      const touchSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          getSessionById: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', target_id: 'world_1' })),
          touchSession
        }
      })

      const result = service.activateWorkspaceAgentSession('script_session_1', 'scriptwriter', 'world_2')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(404)
      expect(touchSession).not.toHaveBeenCalled()
    })

    it('activateWorkspaceAgentSession：kind不匹配（如误把编剧会话当舆图师激活）时拒绝', () => {
      const touchSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          getSessionById: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', target_id: 'world_1' })),
          touchSession
        }
      })

      const result = service.activateWorkspaceAgentSession('script_session_1', 'cartographer', 'world_1')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(404)
      expect(touchSession).not.toHaveBeenCalled()
    })

    it('activateWorkspaceAgentSession：kind与targetId都匹配时正常激活', () => {
      const touchSession = vi.fn()
      const service = createChatService({
        chatRepository: {
          getSessionById: vi.fn(() => ({ id: 'script_session_1', kind: 'scriptwriter', target_id: 'world_1' })),
          getRecentMessagesBySessionId: vi.fn(() => []),
          countMessagesBySessionId: vi.fn(() => 0),
          listSessionParticipants: vi.fn(() => []),
          touchSession
        }
      })

      const result = service.activateWorkspaceAgentSession('script_session_1', 'scriptwriter', 'world_1')

      expect(result.ok).toBe(true)
      expect(touchSession).toHaveBeenCalledWith('script_session_1')
    })
  })
})
