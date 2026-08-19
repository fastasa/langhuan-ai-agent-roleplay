/**
 * Release the exact TCP listen port before starting Langhuan.
 *
 * `npm run dev` uses the default development port (3000). The Windows
 * one-click launcher passes its validated production port explicitly.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const DEFAULT_PORT = 3000
const PROTECTED_WINDOWS_PIDS = new Set([0, 4])

export function resolvePort(rawValue, fallback = DEFAULT_PORT) {
  const value = String(rawValue ?? '').trim()
  const port = value ? Number(value) : fallback
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value || '(empty)'}`)
  }
  return port
}

function endpointPort(endpoint) {
  const match = String(endpoint || '').match(/:(\d+)$/u)
  return match ? Number(match[1]) : -1
}

export function parseWindowsListeningPids(netstatOutput, port) {
  const targetPort = resolvePort(port)
  const pids = new Set()

  for (const rawLine of String(netstatOutput || '').split(/\r?\n/u)) {
    const parts = rawLine.trim().split(/\s+/u)
    if (parts.length < 5 || parts[0].toUpperCase() !== 'TCP') continue
    if (parts[3].toUpperCase() !== 'LISTENING') continue
    if (endpointPort(parts[1]) !== targetPort) continue

    const pid = Number(parts.at(-1))
    if (Number.isInteger(pid) && pid >= 0) pids.add(pid)
  }

  return [...pids]
}

function readWindowsListeningPids(port) {
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`netstat failed with exit code ${result.status}`)
  }
  return parseWindowsListeningPids(result.stdout, port)
}

function terminateWindowsProcessTree(pid) {
  const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    encoding: 'utf8',
    windowsHide: true
  })
  if (result.error) throw result.error
  return result.status === 0
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

export function releaseWindowsPort(port, options = {}) {
  const targetPort = resolvePort(port)
  const timeoutMs = Number(options.timeoutMs || 5000)
  const readListeningPids = options.readListeningPids || readWindowsListeningPids
  const terminateProcessTree = options.terminateProcessTree || terminateWindowsProcessTree
  const sleep = options.sleep || sleepSync
  const log = options.log || console.log
  const deadline = Date.now() + timeoutMs
  const announced = new Set()

  while (Date.now() <= deadline) {
    const pids = readListeningPids(targetPort)
    if (!pids.length) {
      log(`[Port] Port ${targetPort} is ready.`)
      return []
    }

    for (const pid of pids) {
      if (PROTECTED_WINDOWS_PIDS.has(pid)) {
        throw new Error(`Refusing to terminate protected system process PID ${pid} on port ${targetPort}.`)
      }
      if (!announced.has(pid)) {
        log(`[Port] Stopping the previous listener on port ${targetPort} (PID ${pid})...`)
        announced.add(pid)
      }
      const terminated = terminateProcessTree(pid)
      if (!terminated && readListeningPids(targetPort).includes(pid)) {
        throw new Error(`Could not stop PID ${pid} on port ${targetPort}.`)
      }
    }

    sleep(120)
  }

  const remaining = readListeningPids(targetPort)
  throw new Error(`Port ${targetPort} is still occupied${remaining.length ? ` by PID ${remaining.join(', ')}` : ''}.`)
}

export function releasePort(port, options = {}) {
  const platform = options.platform || process.platform
  if (platform !== 'win32') {
    throw new Error('Automatic port takeover is currently supported by the Windows launcher only.')
  }
  return releaseWindowsPort(port, options)
}

function isMainModule() {
  if (!process.argv[1]) return false
  const current = resolve(fileURLToPath(import.meta.url))
  const invoked = resolve(process.argv[1])
  return process.platform === 'win32'
    ? current.toLowerCase() === invoked.toLowerCase()
    : current === invoked
}

if (isMainModule()) {
  try {
    releasePort(resolvePort(process.argv[2]))
  } catch (error) {
    console.error(`[Port] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
