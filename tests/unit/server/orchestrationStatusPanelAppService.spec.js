import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceChatAppService } from '../../../server/application/workspace/workspaceChatAppService.js'

function createFixture({ mode = 'independent_snapshot', branchId = 'branch_1' } = {}) {
  const participant = {
    id: 'participant_1',
    sessionId: 'session_1',
    participantType: 'char',
    participantTargetId: 'char_1',
    characterStateMode: mode,
    characterBranchId: mode === 'independent_snapshot' ? branchId : ''
  }
  const template = {
    id: 'template_1', sessionId: 'session_1', kind: 'character', name: '角色状态栏',
    fieldsJson: JSON.stringify([
      { key: 'mood', label: '情绪', valueType: 'text' },
      { key: 'hp', label: '体力', valueType: 'number' },
      { key: 'appearance', label: '可见资料', valueType: 'binding', binding: 'character.appearance' }
    ])
  }
  let panel = {
    id: 'panel_1', sessionId: 'session_1', templateId: 'template_1', name: '沈青梧',
    hostType: 'session_character', hostId: 'participant_1', valuesJson: JSON.stringify({ mood: '平静', hp: 10 }),
    fieldsJson: template.fieldsJson, worldId: '', status: 'active', version: 3,
    createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z'
  }
  const events = []
  const patchSessionCharacterBranch = vi.fn()
  const patchCharacterAppearance = vi.fn()
  const persistChatMutation = vi.fn()
  const chatRepository = {
    getSessionById: vi.fn(() => ({ id: 'session_1', worldId: '' })),
    listSessionParticipants: vi.fn(() => [participant]),
    listStatusPanelTemplates: vi.fn(() => [template]),
    findStatusPanelTemplateById: vi.fn(() => template),
    listStatusPanels: vi.fn(() => panel ? [panel] : []),
    listLegacyCharacterStatusPanels: vi.fn(() => panel?.hostType === 'character' ? [panel] : []),
    findLegacyCharacterStatusPanelById: vi.fn((panelId) => panel?.id === panelId && panel?.hostType === 'character' ? panel : null),
    findStatusPanelById: vi.fn((_sessionId, panelId) => panel?.id === panelId ? panel : null),
    findStatusPanelEventByIdempotencyKey: vi.fn((key) => events.find((event) => event.idempotencyKey === key) || null),
    insertStatusPanelEvent: vi.fn((event) => events.push(event)),
    runStatusPanelTransaction: vi.fn((operation) => {
      const panelBefore = panel ? { ...panel } : null
      const eventsBefore = [...events]
      try {
        return operation()
      } catch (error) {
        panel = panelBefore
        events.splice(0, events.length, ...eventsBefore)
        throw error
      }
    }),
    migrateLegacyCharacterStatusPanelHost: vi.fn((row) => {
      if (!panel || panel.id !== row.panelId || panel.sessionId !== row.sessionId || panel.hostType !== 'character' || panel.version !== row.expectedVersion) return 0
      panel = { ...panel, hostType: 'session_character', hostId: row.participantId, version: panel.version + 1, updatedAt: row.updatedAt }
      return 1
    }),
    updateStatusPanelAtVersion: vi.fn((row) => {
      if (!panel || panel.version !== row.expectedVersion) return 0
      panel = { ...panel, ...row, version: panel.version + 1 }
      return 1
    }),
    insertStatusPanel: vi.fn((row) => {
      panel = { ...row }
      return 1
    }),
    deleteStatusPanelAtVersion: vi.fn((_sessionId, panelId, _worldId, expectedVersion) => {
      if (!panel || panel.id !== panelId || panel.version !== expectedVersion) return 0
      panel = null
      return 1
    }),
    listStatusPanelEvents: vi.fn((_sessionId, panelId) => events.filter((event) => event.panelId === panelId))
  }
  const service = createWorkspaceChatAppService({
    chatRepository,
    characterRepository: {
      getCharacterById: vi.fn(() => ({ id: 'char_1', name: '沈青梧', appearance: '主线外貌' })),
      patchCharacterAppearance
    },
    characterSnapshotService: {
      resolveSessionCharacterBranch: vi.fn(() => ({
        branch: { id: branchId, sessionId: 'session_1' },
        character: { id: 'char_1', name: '沈青梧', appearance: '分支外貌' }
      })),
      patchSessionCharacterBranch
    },
    logger: { error: vi.fn() },
    normalizeChatTargetId: (value) => value,
    repairLegacyChatTarget: (value) => value,
    repairAllLegacyChatTargets: vi.fn(),
    cleanupLegacySessionContext: vi.fn(),
    ensureChatSession: vi.fn(),
    toArchiveRecord: (value) => value,
    repairOrphanChatArchives: vi.fn(),
    archiveChatSession: vi.fn(),
    resetActiveChatMessages: (value) => value,
    cloneSessionMessages: vi.fn(),
    persistChatMutation
  })
  return {
    service, chatRepository, events, patchSessionCharacterBranch, patchCharacterAppearance,
    persistChatMutation, getPanel: () => panel, setPanel: (next) => { panel = next }, participant, template
  }
}

describe('orchestration status panel batch 2', () => {
  it('按字段 patch 合并并把 appearance 写入当前独立分支，重复幂等提交不二次写', () => {
    const fixture = createFixture()
    const payload = {
      id: 'panel_1', templateId: 'template_1', name: '沈青梧',
      hostType: 'session_character', hostId: 'participant_1',
      values: { hp: 9, appearance: '雨夜后的衣着' },
      expectedVersion: 3, idempotencyKey: 'status-patch-1', source: 'tidiao'
    }

    const first = fixture.service.saveStatusPanelBySessionId('session_1', payload)
    const second = fixture.service.saveStatusPanelBySessionId('session_1', payload)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(first.data.version).toBe(4)
    expect(JSON.parse(fixture.getPanel().valuesJson)).toEqual({ mood: '平静', hp: 9 })
    expect(fixture.patchSessionCharacterBranch).toHaveBeenCalledTimes(1)
    expect(fixture.patchSessionCharacterBranch).toHaveBeenCalledWith('char_1', 'branch_1', { appearance: '雨夜后的衣着' })
    expect(fixture.patchCharacterAppearance).not.toHaveBeenCalled()
    expect(fixture.events).toHaveLength(1)
    expect(fixture.events[0]).toMatchObject({ eventType: 'patched', fromVersion: 3, toVersion: 4, source: 'tidiao' })
  })

  it('跟随主线时只写角色主真值', () => {
    const fixture = createFixture({ mode: 'follow_main' })
    const result = fixture.service.saveStatusPanelBySessionId('session_1', {
      id: 'panel_1', templateId: 'template_1', name: '沈青梧',
      hostType: 'session_character', hostId: 'participant_1', values: { appearance: '新外貌' },
      expectedVersion: 3, idempotencyKey: 'status-main-1'
    })

    expect(result.ok).toBe(true)
    expect(fixture.patchCharacterAppearance).toHaveBeenCalledWith('char_1', '新外貌')
    expect(fixture.patchSessionCharacterBranch).not.toHaveBeenCalled()
  })

  it('陈旧 expectedVersion 冲突且零写入', () => {
    const fixture = createFixture()
    const result = fixture.service.saveStatusPanelBySessionId('session_1', {
      id: 'panel_1', templateId: 'template_1', name: '沈青梧',
      hostType: 'session_character', hostId: 'participant_1', values: { hp: 1 },
      expectedVersion: 2, idempotencyKey: 'stale-1'
    })

    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(fixture.chatRepository.updateStatusPanelAtVersion).not.toHaveBeenCalled()
    expect(fixture.events).toHaveLength(0)
  })

  it('缺失独立分支时拒绝读取和写入，不回退主线', () => {
    const fixture = createFixture({ mode: 'independent_snapshot', branchId: '' })
    const read = fixture.service.listStatusPanelsBySessionId('session_1')
    const write = fixture.service.saveStatusPanelBySessionId('session_1', {
      id: 'panel_1', templateId: 'template_1', name: '沈青梧',
      hostType: 'session_character', hostId: 'participant_1', values: { appearance: '不能写' },
      expectedVersion: 3, idempotencyKey: 'missing-branch-1'
    })

    expect(read).toMatchObject({ ok: false, status: 409 })
    expect(write).toMatchObject({ ok: false, status: 409 })
    expect(fixture.patchCharacterAppearance).not.toHaveBeenCalled()
  })

  it('旧 character 宿主只有零写迁移预览，不能继续成为新写入口', () => {
    const fixture = createFixture()
    fixture.chatRepository.listLegacyCharacterStatusPanels.mockReturnValue([{ ...fixture.getPanel(), hostType: 'character', hostId: 'char_1' }])

    const preview = fixture.service.previewLegacyCharacterStatusPanelMigrationBySessionId('session_1')
    const write = fixture.service.saveStatusPanelBySessionId('session_1', {
      templateId: 'template_1', name: '旧入口', hostType: 'character', hostId: 'char_1',
      values: {}, expectedVersion: 0, idempotencyKey: 'legacy-write-1'
    })

    expect(preview).toMatchObject({ ok: true, data: { zeroWrite: true, total: 1, migratable: 1, blocked: 0 } })
    expect(preview.data.items[0]).toMatchObject({ candidateParticipantIds: ['participant_1'], status: 'migratable' })
    expect(write).toMatchObject({ ok: false, status: 409 })
    expect(fixture.chatRepository.insertStatusPanel).not.toHaveBeenCalled()
  })

  it('批次 7 只迁唯一会话角色宿主，整批写入带版本事件', () => {
    const fixture = createFixture({ mode: 'follow_main' })
    fixture.setPanel({ ...fixture.getPanel(), hostType: 'character', hostId: 'char_1' })

    const preview = fixture.service.previewLegacyCharacterStatusPanelMigration()
    const result = fixture.service.executeLegacyCharacterStatusPanelMigration({ selectedPanelIds: ['panel_1'] })

    expect(preview).toMatchObject({ ok: true, data: { zeroWrite: true, migratable: 1, blocked: 0 } })
    expect(result).toMatchObject({ ok: true, data: { migrated: 1, rollback: 'database_backup_or_transaction' } })
    expect(fixture.chatRepository.migrateLegacyCharacterStatusPanelHost).toHaveBeenCalledWith(expect.objectContaining({
      panelId: 'panel_1', participantId: 'participant_1', expectedVersion: 3
    }))
    expect(fixture.events.at(-1)).toMatchObject({ eventType: 'patched', fromVersion: 3, toVersion: 4, source: 'legacy_character_host_migration' })
  })

  it('删除也受版本锁和幂等事件保护', () => {
    const fixture = createFixture()
    const payload = { expectedVersion: 3, idempotencyKey: 'delete-1', source: 'user_manual' }

    const first = fixture.service.deleteStatusPanelBySessionId('session_1', 'panel_1', payload)
    const second = fixture.service.deleteStatusPanelBySessionId('session_1', 'panel_1', payload)

    expect(first).toMatchObject({ ok: true, data: { deletedId: 'panel_1' } })
    expect(second).toMatchObject({ ok: true, data: { deletedId: 'panel_1', idempotent: true } })
    expect(fixture.chatRepository.deleteStatusPanelAtVersion).toHaveBeenCalledTimes(1)
    expect(fixture.events[0]).toMatchObject({ eventType: 'deleted', fromVersion: 3, toVersion: 4 })
  })
})
