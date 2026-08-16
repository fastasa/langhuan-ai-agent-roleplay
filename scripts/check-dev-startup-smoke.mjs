// 隔离端口 smoke 测试：真正起一个 Vite 开发服务器实例，验证首页、/@vite/client、
// 经过代理的 API 请求都能拿到响应，然后干净退出、不留孤儿进程。
//
// 硬性安全边界（禁止违反）：
// - 绝不占用/干扰用户正在真实使用的 5173 / 3000 / 3217 端口；本测试固定使用隔离端口
//   Vite=5199、stub 后端=3299。若这两个端口在测试机上已被占用，直接报错退出，
//   不静默改用其它端口、也不尝试杀掉占用者。
// - 绝不引入真实后端：不 import/require server/server.ts、server/db.ts，也不接触正式数据库。
//   这里只用几行 node:http 原生 stub server 假装后端，只为证明"代理链路本身通"。

import { createServer as createViteServer } from 'vite'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const VITE_PORT = 5199
const STUB_PORT = 3299
const HOST = '127.0.0.1'

function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port, HOST)
  })
}

async function waitForPortFree(port, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkPortFree(port)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

function startStubBackend() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // 只是一个假后端，用于证明代理链路本身通，不读写任何业务数据。
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, from: 'check-dev-startup-smoke-stub', path: req.url }))
    })
    server.once('error', reject)
    server.listen(STUB_PORT, HOST, () => resolve(server))
  })
}

function closeStubBackend(server) {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

async function fetchAndReport(label, url) {
  const response = await fetch(url)
  const text = await response.text()
  const ok = response.ok
  console.log(`[Langhuan] ${ok ? 'PASS' : 'FAIL'} ${label} -> ${url} -> HTTP ${response.status}`)
  return { ok, status: response.status, text }
}

async function main() {
  console.log('[Langhuan] Dev startup smoke test starting.')
  console.log(`[Langhuan] Isolated ports: vite=${VITE_PORT}, stub-backend=${STUB_PORT} (never touches real 5173/3000/3217).`)

  const vitePortFree = await checkPortFree(VITE_PORT)
  const stubPortFree = await checkPortFree(STUB_PORT)
  if (!vitePortFree || !stubPortFree) {
    const busy = []
    if (!vitePortFree) busy.push(String(VITE_PORT))
    if (!stubPortFree) busy.push(String(STUB_PORT))
    console.error(`[Langhuan] Isolated port(s) already in use on this machine: ${busy.join(', ')}.`)
    console.error('[Langhuan] Refusing to proceed. This test will not fall back to other ports and will not kill the occupying process.')
    console.error('[Langhuan] Free the port(s) manually (they should not be 5173/3000/3217, so this should be safe) and re-run.')
    process.exitCode = 1
    return
  }

  let stubServer = null
  let viteServer = null

  try {
    stubServer = await startStubBackend()
    console.log(`[Langhuan] Stub backend listening on ${HOST}:${STUB_PORT}.`)

    // configFile 指向真实 vite.config.js 以继承 plugins/resolve/alias 等正常配置；
    // inline server.port/server.proxy 覆盖为隔离值。已用独立实验脚本验证过：
    // Vite 8.0.12 的 createServer(inlineConfig) 对 server.proxy 是按 key 深度合并，
    // 不是整体替换——inline 里只覆盖 /api，文件里的 /avatars 等其它代理键仍然保留。
    viteServer = await createViteServer({
      root: projectRoot,
      configFile: path.join(projectRoot, 'vite.config.js'),
      server: {
        host: HOST,
        port: VITE_PORT,
        strictPort: true,
        open: false,
        hmr: false,
        proxy: {
          '/api': `http://${HOST}:${STUB_PORT}`
        }
      }
    })
    await viteServer.listen()
    console.log(`[Langhuan] Isolated Vite dev server listening on ${HOST}:${VITE_PORT}.`)

    const resolvedProxyTarget = viteServer.config.server.proxy?.['/api']
    console.log(`[Langhuan] Resolved /api proxy target: ${JSON.stringify(resolvedProxyTarget)} (must point at stub ${STUB_PORT}, not real 3000).`)

    const results = []
    results.push(await fetchAndReport('/ (page)', `http://${HOST}:${VITE_PORT}/`))
    results.push(await fetchAndReport('/@vite/client', `http://${HOST}:${VITE_PORT}/@vite/client`))
    const apiResult = await fetchAndReport('/api/data/all (proxied)', `http://${HOST}:${VITE_PORT}/api/data/all`)
    results.push(apiResult)

    const proxiedToStub = apiResult.text.includes('check-dev-startup-smoke-stub')
    if (proxiedToStub) {
      console.log('[Langhuan] PASS /api/data/all response body confirms it was served by the isolated stub (3299), not a real backend.')
    } else {
      console.error(`[Langhuan] FAIL /api/data/all response body did not look like the stub response: ${apiResult.text.slice(0, 200)}`)
      results.push({ ok: false })
    }

    const allOk = results.every((result) => result.ok)
    if (!allOk) {
      console.error('[Langhuan] One or more smoke requests failed.')
      process.exitCode = 1
    } else {
      console.log('[Langhuan] All smoke requests succeeded.')
      process.exitCode = 0
    }
  } catch (error) {
    console.error(`[Langhuan] Smoke test encountered an error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    if (viteServer) {
      await viteServer.close()
      console.log('[Langhuan] Isolated Vite dev server closed.')
    }
    if (stubServer) {
      await closeStubBackend(stubServer)
      console.log('[Langhuan] Stub backend closed.')
    }

    const vitePortReleased = await waitForPortFree(VITE_PORT)
    const stubPortReleased = await waitForPortFree(STUB_PORT)
    console.log(`[Langhuan] Port ${VITE_PORT} released after close: ${vitePortReleased}`)
    console.log(`[Langhuan] Port ${STUB_PORT} released after close: ${stubPortReleased}`)
    if (!vitePortReleased || !stubPortReleased) {
      console.error('[Langhuan] A port did not release in time; treat as failure so it is not silently missed.')
      process.exitCode = 1
    }
  }
}

// 用 process.exitCode 而不是 process.exit()：批次2诊断确认，fetch 用过的 undici
// keep-alive 连接在 process.exit() 强制同步终止 libuv 事件循环时会触发 Windows 原生
// 崩溃（Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)）。这里同样大量用 fetch，
// 必须延续同一约定，让事件循环在关闭 vite/stub 之后自然清空退出。
main()
