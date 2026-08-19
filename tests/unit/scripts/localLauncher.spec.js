import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseWindowsListeningPids, releaseWindowsPort, resolvePort } from '../../../clean-port.js'

describe('Windows local launcher port takeover', () => {
  it('accepts only valid explicit ports', () => {
    expect(resolvePort('3217')).toBe(3217)
    expect(resolvePort('', 3000)).toBe(3000)
    expect(() => resolvePort('0')).toThrow('Invalid port')
    expect(() => resolvePort('65536')).toThrow('Invalid port')
    expect(() => resolvePort('not-a-port')).toThrow('Invalid port')
  })

  it('selects only exact TCP listeners and deduplicates process ids', () => {
    const output = [
      '  TCP    127.0.0.1:3217       0.0.0.0:0       LISTENING       1200',
      '  TCP    [::1]:3217           [::]:0          LISTENING       1200',
      '  TCP    127.0.0.1:32170      0.0.0.0:0       LISTENING       1300',
      '  TCP    127.0.0.1:3217       127.0.0.1:55000 ESTABLISHED     1400',
      '  UDP    127.0.0.1:3217       *:*                            1500'
    ].join('\r\n')

    expect(parseWindowsListeningPids(output, 3217)).toEqual([1200])
  })

  it('terminates the exact listener and waits until the port is free', () => {
    const terminate = vi.fn(() => true)
    const log = vi.fn()
    const snapshots = [[2200], []]

    expect(releaseWindowsPort(3217, {
      readListeningPids: () => snapshots.shift() || [],
      terminateProcessTree: terminate,
      sleep: vi.fn(),
      log
    })).toEqual([])
    expect(terminate).toHaveBeenCalledWith(2200)
    expect(log).toHaveBeenCalledWith('[Port] Port 3217 is ready.')
  })

  it('refuses to terminate protected Windows system pids', () => {
    expect(() => releaseWindowsPort(3217, {
      readListeningPids: () => [4],
      terminateProcessTree: vi.fn(),
      sleep: vi.fn(),
      log: vi.fn()
    })).toThrow('protected system process PID 4')
  })

  it('runs port cleanup before browser wait and npm start', () => {
    const launcher = readFileSync(resolve(process.cwd(), '启动琅嬛.bat'), 'utf8')
    const cleanupIndex = launcher.indexOf('node.exe clean-port.js "%APP_PORT%"')
    const browserIndex = launcher.indexOf('scripts\\open-local-page.ps1')
    const startIndex = launcher.indexOf('call npm.cmd start')

    expect(cleanupIndex).toBeGreaterThan(-1)
    expect(browserIndex).toBeGreaterThan(cleanupIndex)
    expect(startIndex).toBeGreaterThan(browserIndex)
  })
})
