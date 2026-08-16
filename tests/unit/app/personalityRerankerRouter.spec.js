import { describe, expect, it } from 'vitest'

import { resolvePersonalityInferenceTarget } from '../../../src/app/personalityRerankerRouter'

describe('resolvePersonalityInferenceTarget', () => {
  it('mode=local 永远本地', () => {
    expect(resolvePersonalityInferenceTarget({ mode: 'local', isMobile: true, serverAllowed: true })).toBe('local')
    expect(resolvePersonalityInferenceTarget({ mode: 'local', isMobile: false, serverAllowed: true })).toBe('local')
  })

  it('mode=server 有权限走服务端，无权限退本地', () => {
    expect(resolvePersonalityInferenceTarget({ mode: 'server', isMobile: false, serverAllowed: true })).toBe('server')
    expect(resolvePersonalityInferenceTarget({ mode: 'server', isMobile: true, serverAllowed: false })).toBe('local')
  })

  it('mode=auto：移动端有权限走服务端', () => {
    expect(resolvePersonalityInferenceTarget({ mode: 'auto', isMobile: true, serverAllowed: true })).toBe('server')
  })

  it('mode=auto：移动端无权限退本地（随后失败由 harness 降级）', () => {
    expect(resolvePersonalityInferenceTarget({ mode: 'auto', isMobile: true, serverAllowed: false })).toBe('local')
  })

  it('mode=auto：桌面端始终先本地（带不动再由路由回退服务端）', () => {
    expect(resolvePersonalityInferenceTarget({ mode: 'auto', isMobile: false, serverAllowed: true })).toBe('local')
    expect(resolvePersonalityInferenceTarget({ mode: 'auto', isMobile: false, serverAllowed: false })).toBe('local')
  })
})
