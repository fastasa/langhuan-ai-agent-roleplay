import { ProxyAgent } from 'undici'
import { Socket } from 'net'

type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown }

const proxyAgents = new Map<string, ProxyAgent>()
// 本地代理探测缓存：undefined=还没探测过、null=上次扫描确认无代理、字符串=已探到的代理地址。
// 韧性改造（2026-07-02·用户拍板「调用时有网就该能用」）：缓存不再进程级永久——
// ①已缓存代理每次外呼快速复测端口仍在听（本机连接·代理活着时毫秒级），端口没人听即作废重扫；
// ②「无代理」结论只在冷却期内生效，冷却过后自动再探（服务先启动、Clash 后开不再需要重启服务端）；
// ③外呼网络层失败（fetch failed）时整体复位缓存+连接池后原地重试一次（见 createProxyAwareFetch）。
let detectedLocalProxy: string | null | undefined
let lastProxyScanAt = 0

/** 「扫描后确认无本地代理」的复测冷却：期间不重复扫端口（无代理环境不为每次外呼付探测成本）。 */
const NO_PROXY_RESCAN_COOLDOWN_MS = 15_000

const LOCAL_PROXY_CANDIDATES = [
  'http://127.0.0.1:7897',
  'http://127.0.0.1:7890',
  'http://127.0.0.1:10809',
  'http://127.0.0.1:10808'
]

function normalizeProxyUrl(value: string | undefined): string {
  return String(value || '').trim()
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]'
}

function matchesNoProxy(hostname: string, noProxy: string): boolean {
  const normalized = hostname.toLowerCase()
  return String(noProxy || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule === '*') return true
      if (rule.startsWith('.')) return normalized.endsWith(rule)
      return normalized === rule || normalized.endsWith(`.${rule}`)
    })
}

function resolveProxyUrl(targetUrl: string, env: NodeJS.ProcessEnv): string {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return ''
  }

  if (isLoopbackHostname(parsed.hostname)) return ''
  if (matchesNoProxy(parsed.hostname, env.NO_PROXY || env.no_proxy || '')) return ''

  if (parsed.protocol === 'https:') {
    return normalizeProxyUrl(env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy)
  }
  if (parsed.protocol === 'http:') {
    return normalizeProxyUrl(env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy)
  }
  return ''
}

function hasExplicitProxyEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy)
}

function shouldAutoDetectLocalProxy(env: NodeJS.ProcessEnv): boolean {
  const raw = String(env.LANGHUAN_AI_AUTO_PROXY ?? env.AI_AUTO_PROXY ?? '').trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'no'
}

function canConnect(hostname: string, port: number, timeoutMs = 120): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, hostname)
  })
}

/** 复测某个代理地址此刻是否可连（地址非法一律视为不可连）。 */
async function canConnectToProxyUrl(proxyUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(proxyUrl)
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
    if (!port) return false
    return await canConnect(parsed.hostname, port)
  } catch {
    return false
  }
}

/** 销毁并移除某个代理的 undici 连接池（代理重启/断网后池里是死 keep-alive 连接，必须丢弃重建）。 */
function disposeProxyAgent(proxyUrl: string): void {
  const agent = proxyAgents.get(proxyUrl)
  if (!agent) return
  proxyAgents.delete(proxyUrl)
  try {
    void agent.destroy()
  } catch {
    // 销毁失败不影响新 agent 重建。
  }
}

/** 网络层失败后的整体复位：作废探测缓存 + 销毁全部代理连接池，下一次外呼按「当下」网络现状重探/重连。 */
function resetProxyDetection(): void {
  detectedLocalProxy = undefined
  lastProxyScanAt = 0
  for (const url of [...proxyAgents.keys()]) disposeProxyAgent(url)
}

async function detectLocalProxyUrl(env: NodeJS.ProcessEnv): Promise<string> {
  if (!shouldAutoDetectLocalProxy(env)) return ''
  // 已缓存代理：每次外呼复测端口仍在听；没人听了（代理被关/重启换端口）→ 作废缓存+连接池，落到重新扫描。
  if (detectedLocalProxy) {
    if (await canConnectToProxyUrl(detectedLocalProxy)) return detectedLocalProxy
    disposeProxyAgent(detectedLocalProxy)
    detectedLocalProxy = undefined
  }
  // 上次扫描确认无代理：冷却期内直接直连，冷却过后再探一轮。
  if (detectedLocalProxy === null && Date.now() - lastProxyScanAt < NO_PROXY_RESCAN_COOLDOWN_MS) return ''
  const configured = String(env.LANGHUAN_AI_PROXY_URL || env.AI_PROXY_URL || '').trim()
  const candidates = configured ? [configured] : LOCAL_PROXY_CANDIDATES
  lastProxyScanAt = Date.now()
  for (const candidate of candidates) {
    if (await canConnectToProxyUrl(candidate)) {
      detectedLocalProxy = candidate
      return candidate
    }
  }
  detectedLocalProxy = null
  return ''
}

async function resolveProxyUrlForFetch(targetUrl: string, env: NodeJS.ProcessEnv): Promise<string> {
  const explicit = resolveProxyUrl(targetUrl, env)
  if (explicit || hasExplicitProxyEnv(env)) return explicit

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return ''
  }
  if (isLoopbackHostname(parsed.hostname)) return ''
  if (!/^https?:$/i.test(parsed.protocol)) return ''
  if (matchesNoProxy(parsed.hostname, env.NO_PROXY || env.no_proxy || '')) return ''
  return await detectLocalProxyUrl(env)
}

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const cached = proxyAgents.get(proxyUrl)
  if (cached) return cached
  const agent = new ProxyAgent(proxyUrl)
  proxyAgents.set(proxyUrl, agent)
  return agent
}

function getFetchTargetUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** undici 网络层失败（连接被重置/超时/代理拒连等的笼统 fetch failed）；abort 明确排除——用户取消不重试。 */
function isRetriableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return false
  if (error.message === 'fetch failed') return true
  const causeCode = String((error as Error & { cause?: { code?: unknown } }).cause?.code || '')
  return causeCode.startsWith('UND_ERR')
}

/** 重试前提：请求可原样重放——只接受字符串 URL/URL 对象 + 字符串/无 body（流式 body 发一半无法重放）。 */
function isReplayableRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (!(typeof input === 'string' || input instanceof URL)) return false
  const body = init?.body
  return body == null || typeof body === 'string'
}

export function createProxyAwareFetch(
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const targetUrl = getFetchTargetUrl(input)
    const attempt = async () => {
      const proxyUrl = await resolveProxyUrlForFetch(targetUrl, env)
      if (!proxyUrl) {
        return await fetchImpl(input, init)
      }
      return await fetchImpl(input, {
        ...init,
        dispatcher: getProxyAgent(proxyUrl)
      } as FetchInitWithDispatcher)
    }
    try {
      return await attempt()
    } catch (error) {
      // 网络波动自愈（2026-07-02）：fetch failed 类网络层失败先复位代理探测缓存+连接池
      //（丢掉断网期间的死连接·按当下网络现状重探），原地重试一次；仍失败才把错误抛给上层。
      if (!isRetriableNetworkError(error) || init?.signal?.aborted || !isReplayableRequest(input, init)) throw error
      resetProxyDetection()
      return await attempt()
    }
  }) as typeof fetch
}

export const fetchProxyInternals = {
  resolveProxyUrl,
  resolveProxyUrlForFetch,
  detectLocalProxyUrl,
  resetProxyDetection,
  isRetriableNetworkError
}
