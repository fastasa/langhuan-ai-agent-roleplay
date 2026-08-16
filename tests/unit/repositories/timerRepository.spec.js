import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTimerRecord,
  deleteTimerRecord,
  fetchTimerRecords,
  pauseTimerRecord,
  replaceTimerRecords,
  resumeTimerRecord
} from '../../../src/repositories/timerRepository.ts'

describe('timerRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('统一读取计时器列表', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)

    const response = await fetchTimerRecords()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(response.ok).toBe(true)
  })

  it('统一创建计时器', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    }))

    const result = await createTimerRecord({
      id: 'timer_1',
      ticketId: 'ticket_1',
      ticketName: '电影票',
      durationMs: 60000
    })

    expect(result).toEqual({ ok: true })
  })

  it('统一暂停、恢复、删除和替换计时器', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)

    await pauseTimerRecord('timer_1')
    await resumeTimerRecord('timer_1')
    await deleteTimerRecord('timer_1')
    await replaceTimerRecords([{ id: 'timer_1' }])

    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
