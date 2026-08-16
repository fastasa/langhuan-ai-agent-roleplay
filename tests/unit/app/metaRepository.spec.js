import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCustomTagRecord,
  createEventStackRecord,
  fetchEventStackToday
} from '../../../src/repositories/metaRepository.js'

describe('meta repository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('读取当日事栈时会拼接日期参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], summary: {} })
    })

    await fetchEventStackToday('2026-03-28')

    expect(fetchMock).toHaveBeenCalledWith('/api/data/event-stack/today?date=2026-03-28', {})
  })

  it('保存标签和事栈时会提交 JSON 请求体', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    })

    await createCustomTagRecord({ id: 'tag_1', name: '专注', color: '#fff' })
    await createEventStackRecord({ id: 'event_1', taskName: '整理笔记' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/data/custom-tags', expect.objectContaining({
      method: 'POST'
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/data/event-stack', expect.objectContaining({
      method: 'POST'
    }))
  })

  it('事栈接口返回非 JSON 内容时给出干净错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '�\u0015\u0003mG'
    })

    await expect(fetchEventStackToday('2026-04-14')).rejects.toThrow('加载事栈失败：返回内容不是有效 JSON')
  })
})
