import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatSampleDraft,
  listChatMessageCandidates
} from '../../../server/application/personalityTraining/chatSampleService.ts'
import { chatRepository } from '../../../server/repositories/chatRepository.ts'
import { personalityTrainingRepository } from '../../../server/repositories/personalityTrainingRepository.ts'

describe('personalityTraining chatSampleService batch reads', () => {
  afterEach(() => vi.restoreAllMocks())

  it('候选消息随会话数增长仍只调用固定六次 repository 读取', () => {
    const sessions = Array.from({ length: 120 }, (_, index) => ({
      id: `session_${index}`,
      title: `会话 ${index}`,
      targetId: 'char_1',
      updatedAt: `2026-07-16T00:${String(index % 60).padStart(2, '0')}:00.000Z`
    }))
    const getAllSessions = vi.spyOn(chatRepository, 'getAllSessions').mockReturnValue(sessions)
    const getAllSessionParticipants = vi.spyOn(chatRepository, 'getAllSessionParticipants').mockReturnValue([])
    const getMessagesBySessionIds = vi.spyOn(chatRepository, 'getMessagesBySessionIds').mockReturnValue([
      { id: 1, sessionId: 'session_0', messageKind: 'chat', role: 'assistant', content: '你好', time: '2026-07-16T01:00:00.000Z' }
    ])
    const visible = vi.spyOn(chatRepository, 'listVisibleMessageProjectionsForCharacterBySessionIds').mockReturnValue([
      { id: 'projection_1', sessionId: 'session_0', messageId: 1, objectiveFact: '星依向用户问好。' }
    ])
    const projections = vi.spyOn(chatRepository, 'listMessageProjectionsBySessionIds').mockReturnValue([])
    const visibility = vi.spyOn(chatRepository, 'listMessageProjectionVisibilityBySessionIds').mockReturnValue([])

    const result = listChatMessageCandidates({ characterId: 'char_1', characterName: '星依' })

    expect(result.sessions).toHaveLength(120)
    expect(result.messages).toEqual([
      expect.objectContaining({ sessionId: 'session_0', messageId: 1, projection: { state: 'ok', failureReason: '' } })
    ])
    for (const query of [getAllSessions, getAllSessionParticipants, getMessagesBySessionIds, visible, projections, visibility]) {
      expect(query).toHaveBeenCalledTimes(1)
    }
    expect(getMessagesBySessionIds.mock.calls[0][0]).toHaveLength(120)
  })

  it('生成训练草稿批量读取会话与投影并保持选择顺序和跳过语义', () => {
    const getSessionsByIds = vi.spyOn(chatRepository, 'getSessionsByIds').mockReturnValue([
      { id: 'session_a', title: '会话 A' },
      { id: 'session_b', title: '会话 B' }
    ])
    const visible = vi.spyOn(chatRepository, 'listVisibleMessageProjectionsForCharacterBySessionIds').mockReturnValue([
      { id: 'projection_1', sessionId: 'session_a', messageId: 1, objectiveFact: '事实一', speakerName: '星依' },
      { id: 'projection_2', sessionId: 'session_b', messageId: 3, objectiveFact: '事实三', speakerName: '星依' }
    ])
    const projections = vi.spyOn(chatRepository, 'listMessageProjectionsBySessionIds').mockReturnValue([
      { id: 'projection_failed', sessionId: 'session_a', messageId: 2, status: 'failed', failureReason: '模型错误' }
    ])
    const visibility = vi.spyOn(chatRepository, 'listMessageProjectionVisibilityBySessionIds').mockReturnValue([])
    const createDatasetDraft = vi.spyOn(personalityTrainingRepository, 'createDatasetDraft').mockImplementation((payload) => ({ id: 'dataset_1', ...payload }))

    const result = createChatSampleDraft({
      characterId: 'char_1',
      character: { id: 'char_1', name: '星依' },
      selections: [
        { sessionId: 'session_a', messageIds: [1, 2] },
        { sessionId: 'session_b', messageIds: [3] }
      ]
    })

    expect(result.usableCount).toBe(2)
    expect(result.skipped).toEqual([{ sessionId: 'session_a', messageId: 2, reason: '投影失败：模型错误' }])
    expect(createDatasetDraft.mock.calls[0][0].sourceSummary.sourceRefs.map((item) => item.messageId)).toEqual([1, 3])
    for (const query of [getSessionsByIds, visible, projections, visibility]) expect(query).toHaveBeenCalledTimes(1)
  })
})
