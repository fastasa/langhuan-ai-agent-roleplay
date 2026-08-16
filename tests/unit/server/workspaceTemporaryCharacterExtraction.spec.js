import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.ts'

function createRepository() {
  const messages = [
    { id: 1, role: 'user', message_kind: 'chat', content: '我走进旧巷。', name: '我', created_at: '2026-05-12T01:00:00.000Z' },
    { id: 2, role: 'assistant', message_kind: 'chat', content: '杂货商递来一枚旧铜币。', member_name: '陈星依', created_at: '2026-05-12T01:01:00.000Z' },
    { id: 3, role: 'assistant', message_kind: 'narration_debug', content: '旁白快判：调试信息。', name: '旁白调试', created_at: '2026-05-12T01:02:00.000Z' }
  ]
  const promptLogs = []
  const insertedMessages = []
  const replacedParticipants = []
  return {
    promptLogs,
    insertedMessages,
    replacedParticipants,
    getSessionById: vi.fn(() => ({ id: 'session_1', target_id: 'char_1' })),
    getMessagesBySessionIdOrdered: vi.fn(() => messages),
    insertMessage: vi.fn((_sessionId, payload) => {
      insertedMessages.push(payload)
      return { lastInsertRowid: 42 }
    }),
    touchSession: vi.fn(),
    countMessagesBySessionId: vi.fn(() => 3),
    countPromptLogsBySessionId: vi.fn(() => promptLogs.length),
    insertPromptLog: vi.fn((_sessionId, payload) => {
      promptLogs.push(payload)
    }),
    findPromptLogById: vi.fn((_sessionId, logId) => promptLogs.find((item) => item.id === logId)),
    updateSessionById: vi.fn(),
    listSessionParticipants: vi.fn(() => []),
    replaceSessionParticipants: vi.fn((_sessionId, rows) => {
      replacedParticipants.splice(0, replacedParticipants.length, ...rows)
    }),
    listSessionColumns: vi.fn(() => [])
  }
}

function createService(repository, aiText) {
  const characterRepository = {
    groups: [{ id: 'default', name: '默认', emoji: '👤', orderIndex: 0 }],
    characters: [{ id: 'char_1', name: '星依', orderIndex: 0 }],
    insertedCharacters: [],
    insertedGroups: [],
    getCharacterGroups: vi.fn(function () {
      return characterRepository.groups
    }),
    insertCharacterGroup: vi.fn(function (id, name, emoji, orderIndex) {
      const group = { id, name, emoji, orderIndex }
      characterRepository.insertedGroups.push(group)
      characterRepository.groups.push(group)
    }),
    updateCharacterGroup: vi.fn(function (id, name, emoji, orderIndex) {
      const group = characterRepository.groups.find((item) => item.id === id)
      if (group) Object.assign(group, { name, emoji, orderIndex })
    }),
    getCharacters: vi.fn(function () {
      return characterRepository.characters
    }),
    insertCharacter: vi.fn(function (values) {
      characterRepository.insertedCharacters.push(values)
      characterRepository.characters.push({ id: values[0], name: values[1], groupId: values[6], orderIndex: values[38] })
    })
  }
  const service = createWorkspaceChatAppService({
    chatRepository: repository,
    characterRepository,
    logger: { error: vi.fn(), warn: vi.fn(), ai: vi.fn(), debug: vi.fn() },
    aiService: {
      callAIWithFallback: vi.fn(async () => ({
        upstream: {
          json: async () => ({
            choices: [{ message: { content: aiText } }]
          })
        },
        model: 'test-model',
        presetName: 'test-preset'
      }))
    },
    normalizeChatTargetId: (value) => String(value || ''),
    repairLegacyChatTarget: (value) => String(value || ''),
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: (value) => value,
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: vi.fn(),
    cloneSessionMessages: vi.fn(),
    persist: vi.fn()
  })
  service.__characterRepository = characterRepository
  return service
}

describe('workspace temporary character extraction', () => {
  it('extracts markdown, parses core fields, and stores a prompt log anchored to an audit message', async () => {
    const repository = createRepository()
    const service = createService(repository, [
      '## 名称',
      '旧巷杂货商',
      '',
      '## 图标',
      '🪙',
      '',
      '## 简介',
      '旧巷里收着旧铜币的杂货商。',
      '',
      '## 年龄',
      '',
      '',
      '## 好感度',
      '100',
      '',
      '## TTS 语音',
      'secret',
      '',
      '## 昵称',
      '- 老板'
    ].join('\n'))

    const result = await service.extractImprovisedCharacterBySessionId('session_1', { targetName: '杂货商' }, { userId: 'user_1' })

    expect(result.ok).toBe(true)
    expect(result.data.characterCore).toEqual(expect.objectContaining({
      name: '旧巷杂货商',
      emoji: '🪙',
      desc: '旧巷里收着旧铜币的杂货商。'
    }))
    expect(result.data.characterCore).not.toHaveProperty('age')
    expect(result.data.characterCore).not.toHaveProperty('affection')
    expect(repository.insertMessage).toHaveBeenCalledWith('session_1', expect.objectContaining({
      role: 'system',
      messageKind: 'system',
      content: '即兴角色提取审计：旧巷杂货商'
    }))
    expect(repository.insertPromptLog).toHaveBeenCalledWith('session_1', expect.objectContaining({
      assistantMessageId: 42,
      speakerName: '即兴角色提取',
      finalPrompt: expect.stringContaining('已发生材料')
    }))
    expect(repository.promptLogs[0].promptBlocksJson).toContain('即兴角色提取 · 模型输出')
    expect(repository.promptLogs[0].promptBlocksJson).not.toContain('旁白快判')
  })

  it('creates a normal character in improvised group and adds it to current session participants', async () => {
    const repository = createRepository()
    repository.listSessionParticipants.mockReturnValue([
      {
        id: 'participant_existing',
        participantTargetId: 'char_1',
        participantType: 'char',
        displayOrder: 0,
        role: 'speaker',
        replyProbability: 100,
        createdAt: '2026-05-12T01:00:00.000Z',
        updatedAt: '2026-05-12T01:00:00.000Z'
      }
    ])
    const service = createService(repository, [
      '## 名称',
      '旧巷杂货商',
      '',
      '## 图标',
      '🪙',
      '',
      '## 简介',
      '旧巷里收着旧铜币的杂货商。',
      '',
      '## 说话风格',
      '短句、谨慎。'
    ].join('\n'))

    const result = await service.createImprovisedCharacterBySessionId('session_1', { targetName: '杂货商' }, { userId: 'user_1' })

    expect(result.ok).toBe(true)
    expect(result.data.group).toEqual(expect.objectContaining({
      id: 'improvised_characters',
      name: '即兴角色'
    }))
    expect(result.data.character).toEqual(expect.objectContaining({
      name: '旧巷杂货商',
      groupId: 'improvised_characters',
      speakingStyle: '短句、谨慎。'
    }))
    expect(repository.replacedParticipants).toEqual([
      expect.objectContaining({ participantTargetId: 'char_1', displayOrder: 0 }),
      expect.objectContaining({
        participantTargetId: result.data.character.id,
        participantType: 'char',
        displayOrder: 1,
        replyProbability: 100
      })
    ])
    const insertedCharacter = service.__characterRepository.insertedCharacters[0]
    expect(insertedCharacter[30]).toBe('[]')
    expect(insertedCharacter[31]).toBe('[]')
  })

  it('migrates the legacy temporary group name before creating an improvised character', async () => {
    const repository = createRepository()
    const service = createService(repository, [
      '## 名称',
      '旧巷杂货商',
      '',
      '## 图标',
      '🪙',
      '',
      '## 简介',
      '旧巷里收着旧铜币的杂货商。'
    ].join('\n'))
    service.__characterRepository.groups.push({
      id: 'temporary_characters',
      name: '临时角色',
      emoji: '👥',
      orderIndex: 1
    })

    const result = await service.createImprovisedCharacterBySessionId('session_1', { targetName: '杂货商' }, { userId: 'user_1' })

    expect(result.ok).toBe(true)
    expect(service.__characterRepository.updateCharacterGroup).toHaveBeenCalledWith(
      'temporary_characters',
      '即兴角色',
      '👥',
      1
    )
    expect(result.data.group).toEqual(expect.objectContaining({
      id: 'temporary_characters',
      name: '即兴角色'
    }))
    expect(result.data.character.groupId).toBe('temporary_characters')
    expect(service.__characterRepository.insertCharacterGroup).not.toHaveBeenCalled()
  })

  it('blocks duplicate names before model extraction unless explicitly allowed or renamed', async () => {
    const repository = createRepository()
    const service = createService(repository, [
      '## 名称',
      '旧巷杂货商'
    ].join('\n'))
    service.__characterRepository.characters.push({ id: 'char_existing', name: '杂货商', orderIndex: 1 })

    const blocked = await service.createImprovisedCharacterBySessionId('session_1', { targetName: '杂货商' }, { userId: 'user_1' })
    expect(blocked.ok).toBe(false)
    expect(blocked.status).toBe(409)
    expect(service.__characterRepository.insertedCharacters).toHaveLength(0)

    const renamed = await service.createImprovisedCharacterBySessionId('session_1', { targetName: '杂货商', finalName: '旧巷老板' }, { userId: 'user_1' })
    expect(renamed.ok).toBe(true)
    expect(renamed.data.character.name).toBe('旧巷老板')

    const duplicate = await service.createImprovisedCharacterBySessionId('session_1', { targetName: '杂货商', allowDuplicateName: true }, { userId: 'user_1' })
    expect(duplicate.ok).toBe(true)
    expect(duplicate.data.character.name).toBe('旧巷杂货商')
  })
})
