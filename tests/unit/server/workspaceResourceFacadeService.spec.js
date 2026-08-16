import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addHistoryMock } = vi.hoisted(() => ({
  addHistoryMock: vi.fn()
}))

vi.mock('../../../server/application/shared/dbUtils.js', () => ({
  addHistory: addHistoryMock
}))

import { createWorkspaceResourceFacadeService } from '../../../server/application/workspace/workspaceResourceFacadeService.js'

describe('workspaceResourceFacadeService', () => {
  beforeEach(() => {
    addHistoryMock.mockReset()
  })

  it('routes resource updates through injected repository', () => {
    const patchResources = vi.fn()
    const service = createWorkspaceResourceFacadeService(undefined, {
      resourceRepository: {
        patchResources,
        getTickets: vi.fn(() => []),
        insertTicket: vi.fn(),
        getTicketById: vi.fn(),
        updateTicket: vi.fn(),
        deleteTicket: vi.fn(),
        insertTicketCategory: vi.fn(),
        deleteTicketCategory: vi.fn()
      }
    })

    const result = service.updateResources({ points: 3, money: 8 })

    expect(result.ok).toBe(true)
    expect(patchResources).toHaveBeenCalledWith({
      points: 3,
      bigTimeCount: undefined,
      smallTimeCount: undefined,
      money: 8
    })
  })

  it('adds ticket and records history', () => {
    const insertTicket = vi.fn()
    const service = createWorkspaceResourceFacadeService(undefined, {
      resourceRepository: {
        patchResources: vi.fn(),
        getTickets: vi.fn(() => []),
        insertTicket,
        getTicketById: vi.fn(),
        updateTicket: vi.fn(),
        deleteTicket: vi.fn(),
        insertTicketCategory: vi.fn(),
        deleteTicketCategory: vi.fn()
      }
    })

    const result = service.addTicket({ id: 'ticket_1', name: '咖啡券' })

    expect(result.ok).toBe(true)
    expect(insertTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'ticket_1', name: '咖啡券' }))
    expect(addHistoryMock).toHaveBeenCalledWith('新增票据', '咖啡券')
  })
})
