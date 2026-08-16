import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer } from 'net'
import { createProxyAwareFetch, fetchProxyInternals } from '../../../server/utils/fetchProxy.ts'

// 韧性改造（2026-07-02·用户拍板「调用时有网就该能用」）：
// ①网络层失败（fetch failed）复位探测缓存+连接池后原地重试一次；②代理探测缓存不再进程级永久。

// 直连环境（关自动探测），只测重试骨架本身。
const DIRECT_ENV = { LANGHUAN_AI_AUTO_PROXY: '0' }

function fetchFailedError() {
  // undici 网络层失败的真实形态：TypeError('fetch failed') + cause 里才是真凶。
  const error = new TypeError('fetch failed')
  error.cause = Object.assign(new Error('connect ECONNRESET 127.0.0.1:7897'), { code: 'ECONNRESET' })
  return error
}

function listenOnce(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

describe('server fetchProxy 网络韧性', () => {
  beforeEach(() => {
    fetchProxyInternals.resetProxyDetection()
  })
  afterEach(() => {
    fetchProxyInternals.resetProxyDetection()
  })

  it('fetch failed 网络层失败：复位后原地重试一次，第二次成功即成功返回', async () => {
    const ok = { ok: true, status: 200 }
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(fetchFailedError())
      .mockResolvedValueOnce(ok)
    const proxied = createProxyAwareFetch(fetchImpl, DIRECT_ENV)

    const result = await proxied('https://example.com/v1/chat', { method: 'POST', body: '{"a":1}' })

    expect(result).toBe(ok)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('重试后仍失败才把错误抛给上层（只重试一次，不无限循环）', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(fetchFailedError())
    const proxied = createProxyAwareFetch(fetchImpl, DIRECT_ENV)

    await expect(proxied('https://example.com/v1/chat', { method: 'POST', body: '{}' })).rejects.toThrow('fetch failed')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('AbortError（用户取消）不重试', async () => {
    const abortError = new Error('This operation was aborted')
    abortError.name = 'AbortError'
    const fetchImpl = vi.fn().mockRejectedValue(abortError)
    const proxied = createProxyAwareFetch(fetchImpl, DIRECT_ENV)

    await expect(proxied('https://example.com/v1/chat', { method: 'POST', body: '{}' })).rejects.toThrow(abortError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('非网络层错误不重试', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const proxied = createProxyAwareFetch(fetchImpl, DIRECT_ENV)

    await expect(proxied('https://example.com/v1/chat', { method: 'POST', body: '{}' })).rejects.toThrow('boom')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('不可重放的请求体（非字符串 body）不重试', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(fetchFailedError())
    const proxied = createProxyAwareFetch(fetchImpl, DIRECT_ENV)
    const streamBody = { pipe: () => {} }

    await expect(proxied('https://example.com/v1/chat', { method: 'POST', body: streamBody })).rejects.toThrow('fetch failed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('代理探测不再进程级永久：代理端口关掉后复测失败即改直连；复位后端口恢复能重新探到', async () => {
    // 用真实本机端口模拟 Clash：LANGHUAN_AI_PROXY_URL 指到临时 server。
    const server = createServer(() => {})
    const port = await listenOnce(server)
    const env = { LANGHUAN_AI_PROXY_URL: `http://127.0.0.1:${port}` }

    // ①端口在听：探到代理。
    expect(await fetchProxyInternals.detectLocalProxyUrl(env)).toBe(`http://127.0.0.1:${port}`)

    // ②代理被关（模拟 Clash 中途断连/被关）：复测端口失败 → 重扫无果 → 改直连（旧实现这里会永远返回已死缓存）。
    await closeServer(server)
    expect(await fetchProxyInternals.detectLocalProxyUrl(env)).toBe('')

    // ③「无代理」结论在冷却期内直接直连（不为每次外呼反复扫描）。
    const server2 = createServer(() => {})
    await new Promise((resolve) => server2.listen(port, '127.0.0.1', () => resolve()))
    expect(await fetchProxyInternals.detectLocalProxyUrl(env)).toBe('')

    // ④复位（= fetch failed 重试路径做的事）后按当下现状重探：端口恢复即重新探到——「调用时有网就能用」。
    fetchProxyInternals.resetProxyDetection()
    expect(await fetchProxyInternals.detectLocalProxyUrl(env)).toBe(`http://127.0.0.1:${port}`)
    await closeServer(server2)
  })
})
