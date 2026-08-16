/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  registerStatusWorkspaceXingyiHost,
  statusWorkspaceXingyiHost
} from '../../../src/app/statusWorkspaceXingyiHost'

describe('statusWorkspaceXingyiHost', () => {
  it('后注册宿主优先，旧宿主释放时不能误清新宿主', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const releaseFirst = registerStatusWorkspaceXingyiHost(first)
    const releaseSecond = registerStatusWorkspaceXingyiHost(second)

    expect(statusWorkspaceXingyiHost.value).toBe(second)
    releaseFirst()
    expect(statusWorkspaceXingyiHost.value).toBe(second)
    releaseSecond()
    expect(statusWorkspaceXingyiHost.value).toBeNull()
  })
})
