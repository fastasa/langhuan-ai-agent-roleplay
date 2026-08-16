import { describe, expect, it } from 'vitest'
import { isBrowserShortcutChord } from '../../../src/pixel-studio/ui/browserShortcutGuard'

describe('browserShortcutGuard', () => {
  it('识别 Ctrl/Meta/Alt 组合键、功能键与浏览器导航键', () => {
    expect(isBrowserShortcutChord({ key: 'r', ctrlKey: true })).toBe(true)
    expect(isBrowserShortcutChord({ key: 'l', metaKey: true })).toBe(true)
    expect(isBrowserShortcutChord({ key: 'ArrowLeft', altKey: true })).toBe(true)
    expect(isBrowserShortcutChord({ key: 'F12' })).toBe(true)
    expect(isBrowserShortcutChord({ key: 'BrowserBack' })).toBe(true)
  })

  it('普通未绑定按键不拦截', () => {
    expect(isBrowserShortcutChord({ key: 'q' })).toBe(false)
    expect(isBrowserShortcutChord({ key: 'Escape' })).toBe(false)
  })

  it('只放行浏览器硬刷新 Ctrl/Meta+Shift+R，普通刷新仍由工作台屏蔽', () => {
    expect(isBrowserShortcutChord({ key: 'r', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(isBrowserShortcutChord({ key: 'R', metaKey: true, shiftKey: true })).toBe(false)
    expect(isBrowserShortcutChord({ key: 'r', ctrlKey: true })).toBe(true)
    expect(isBrowserShortcutChord({ key: 'r', ctrlKey: true, shiftKey: true, altKey: true })).toBe(true)
  })
})
