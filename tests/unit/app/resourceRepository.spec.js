import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createHistoryRecord,
  createTicketRecord,
  deleteTicketRecord,
  saveResourceValues,
  updateTicketRecord
} from '../../../src/repositories/resourceRepository.js'

describe('resource repository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('资源与票据请求会发送统一接口地址和 JSON 请求体', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true })

    await saveResourceValues({
      points: 5,
      bigTimeCount: 1,
      smallTimeCount: 2,
      money: 30
    })
    await createTicketRecord({ id: 'ticket_1', name: '专注券', cost: 10, count: 1 })
    await updateTicketRecord('ticket_1', { count: 3 })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/data/resources', expect.objectContaining({
      method: 'PUT'
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/data/tickets', expect.objectContaining({
      method: 'POST'
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/data/tickets/ticket_1', expect.objectContaining({
      method: 'PUT'
    }))
  })

  it('历史与删除请求会走专门接口', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true })

    await createHistoryRecord({ action: '添加票据', detail: '测试' })
    await deleteTicketRecord('ticket_2')

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/data/history', expect.objectContaining({
      method: 'POST'
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/data/tickets/ticket_2', expect.objectContaining({
      method: 'DELETE'
    }))
  })
})
