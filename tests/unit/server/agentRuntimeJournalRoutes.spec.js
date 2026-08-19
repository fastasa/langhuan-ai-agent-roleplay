import { beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => ({
  append: vi.fn(),
  read: vi.fn(),
  list: vi.fn()
}))

vi.mock('../../../server/application/agentRuntimeJournal/agentRuntimeJournalAppService.js', () => ({
  agentRuntimeJournalAppService: service
}))

import router from '../../../server/routes/agentRuntimeJournal.ts'

function findHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method])
  if (!layer) throw new Error(`未找到路由：${method} ${path}`)
  return layer.route.stack[0].handle
}

function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('agent runtime journal routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POST 每次只把一个原始事件交给 scoped service', () => {
    const event = { runId: 'run_1', seq: 1 }
    service.append.mockReturnValue({ ok: true, status: 201, data: { event, idempotent: false } })
    const res = mockRes()
    findHandler('/agent-runtime-journal/runs/:runId/events', 'post')({ params: { runId: 'run_1' }, body: event }, res)
    expect(service.append).toHaveBeenCalledWith(
      { userId: 'local', workspaceId: 'local' },
      'run_1',
      event
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('GET 返回按 runId 查询的事件，checksum 冲突透传 409', () => {
    service.read.mockReturnValue({ ok: true, status: 200, data: { events: [{ seq: 1 }] } })
    const getRes = mockRes()
    findHandler('/agent-runtime-journal/runs/:runId/events', 'get')({ params: { runId: 'run_1' } }, getRes)
    expect(service.read).toHaveBeenCalledWith({ userId: 'local', workspaceId: 'local' }, 'run_1')
    expect(getRes.status).toHaveBeenCalledWith(200)

    service.append.mockReturnValue({ ok: false, status: 409, error: 'checksum conflict' })
    const postRes = mockRes()
    findHandler('/agent-runtime-journal/runs/:runId/events', 'post')({ params: { runId: 'run_1' }, body: {} }, postRes)
    expect(postRes.status).toHaveBeenCalledWith(409)
    expect(postRes.json).toHaveBeenCalledWith({ error: 'checksum conflict' })
  })

  it('GET runs 使用 scoped 列表服务，且不与 exact events 路由冲突', () => {
    service.list.mockReturnValue({ ok: true, status: 200, data: { runs: [{ runId: 'run_1' }] } })
    const res = mockRes()
    findHandler('/agent-runtime-journal/runs', 'get')({
      query: { status: 'incomplete', limit: '12' }
    }, res)

    expect(service.list).toHaveBeenCalledWith(
      { userId: 'local', workspaceId: 'local' },
      'incomplete',
      '12'
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(findHandler('/agent-runtime-journal/runs/:runId/events', 'get')).toBeTypeOf('function')
  })
})
