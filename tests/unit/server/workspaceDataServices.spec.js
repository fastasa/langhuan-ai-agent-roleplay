import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../server/application/shared/dbUtils.js', () => ({
  addHistory: vi.fn(),
  toCamel: (value) => value
}))

import { createWorkspaceDataAppService } from '../../../server/application/workspace/workspaceDataAppService.js'
import { createWorkspaceMetaAppService } from '../../../server/application/workspace/workspaceMetaAppService.js'

function createDbStub() {
  return {
    run: vi.fn(() => ({ lastInsertRowid: 7 })),
    _save: vi.fn(),
    prepare() {
      return {
        all: vi.fn(() => []),
        get: vi.fn(() => undefined),
        run: vi.fn(() => ({ lastInsertRowid: 7 }))
      }
    }
  }
}

describe('workspace data app services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('composes resource, character, chat, and task facades into one legacy entry', () => {
    const service = createWorkspaceDataAppService(createDbStub(), {
      fileExists: vi.fn(() => false),
      logger: { error: vi.fn() },
      resourceRepository: {
        patchResources: vi.fn(),
        getTickets: vi.fn(() => []),
        insertTicket: vi.fn(),
        getTicketById: vi.fn(),
        updateTicket: vi.fn(),
        deleteTicket: vi.fn(),
        insertTicketCategory: vi.fn(),
        deleteTicketCategory: vi.fn()
      },
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(() => ({ id: 'char_1', name: '旧名字', groupId: 'default' })),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        insertCharacterGroup: vi.fn(),
        patchCharacterGroup: vi.fn(),
        deleteCharacterGroup: vi.fn(),
        insertGroup: vi.fn(),
        patchGroup: vi.fn(),
        deleteGroup: vi.fn(),
        insertCrowd: vi.fn(),
        patchCrowd: vi.fn(),
        deleteCrowd: vi.fn(),
        insertAlias: vi.fn(),
        patchAlias: vi.fn(),
        deleteAlias: vi.fn(),
        patchUserProfile: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => []),
        updateCharacterAvatarPath: vi.fn()
      },
      chatRepository: {
        getSessionById: vi.fn(() => ({ id: 'char_1' })),
        getRecentMessagesBySessionId: vi.fn(() => []),
        ensureSession: vi.fn(),
        insertMessage: vi.fn(() => ({ lastInsertRowid: 1 })),
        touchSession: vi.fn(),
        updateMessageBySession: vi.fn(),
        deleteMessageBySession: vi.fn(),
        clearMessagesBySessionId: vi.fn(),
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
        listLegacySessionIds: vi.fn(() => []),
        listSessionContextRows: vi.fn(() => []),
        updateLoadedSummaryIds: vi.fn(),
        clearLegacyCopiedContext: vi.fn(),
        reassignMessagesToSession: vi.fn(),
        upsertSession: vi.fn(),
        deleteSessionById: vi.fn(),
        countMessagesBySessionId: vi.fn(() => 0),
        cloneMessagesToSession: vi.fn(),
        createArchiveFromSession: vi.fn()
      },
      taskRepository: {
        getTasks: vi.fn(() => []),
        insertTask: vi.fn(),
        updateTask: vi.fn(),
        deleteTask: vi.fn(),
        insertTaskLog: vi.fn(),
        getTaskLogs: vi.fn(() => []),
        insertDailyReport: vi.fn(),
        getDailyReports: vi.fn(() => []),
        updateDailyReport: vi.fn()
      }
    })

    expect(typeof service.updateResources).toBe('function')
    expect(typeof service.addCharacter).toBe('function')
    expect(typeof service.getChat).toBe('function')
    expect(typeof service.addTask).toBe('function')
    expect(service.chatService).toBeTruthy()
  })

  it('delegates avatar repair through composed character facade', () => {
    const updateCharacterAvatarPath = vi.fn()
    const service = createWorkspaceDataAppService(createDbStub(), {
      fileExists: vi.fn(() => true),
      logger: { error: vi.fn() },
      characterRepository: {
        getCharacters: vi.fn(() => []),
        insertCharacter: vi.fn(),
        getCharacterById: vi.fn(),
        updateCharacter: vi.fn(),
        deleteCharacter: vi.fn(),
        insertCharacterGroup: vi.fn(),
        patchCharacterGroup: vi.fn(),
        deleteCharacterGroup: vi.fn(),
        insertGroup: vi.fn(),
        patchGroup: vi.fn(),
        deleteGroup: vi.fn(),
        insertCrowd: vi.fn(),
        patchCrowd: vi.fn(),
        deleteCrowd: vi.fn(),
        insertAlias: vi.fn(),
        patchAlias: vi.fn(),
        deleteAlias: vi.fn(),
        patchUserProfile: vi.fn(),
        listCharacterAvatarPaths: vi.fn(() => [{ id: 'char_1', avatar_path: 'avatars/char_1.jpg' }]),
        updateCharacterAvatarPath
      }
    })

    service.repairCharacterAvatarPaths()

    expect(updateCharacterAvatarPath).toHaveBeenCalled()
  })

  it('returns event stack daily summary from workspace meta service', () => {
    const service = createWorkspaceMetaAppService({
      getEventStack: vi.fn(() => [{
        id: 'event_1',
        pointsDelta: 3,
        moneyDelta: 5,
        ticketsUsed: { coffee: 1 },
        ticketsExchanged: { movie: 2 }
      }])
    })

    const result = service.getTodayEventStack('2026-03-27')

    expect(result.date).toBe('2026-03-27')
    expect(result.summary.totalPoints).toBe(3)
    expect(result.summary.totalMoney).toBe(5)
    expect(result.summary.ticketChanges.coffee.used).toBe(1)
    expect(result.summary.ticketChanges.movie.exchanged).toBe(2)
  })

  it('validates custom tag required fields in workspace meta service', () => {
    const db = createDbStub()
    const service = createWorkspaceMetaAppService(db)

    const result = service.addCustomTag({ id: 'tag_1', name: '' })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })
})
