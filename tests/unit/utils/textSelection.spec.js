/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasActiveBrowserTextSelection } from '../../../src/utils/textSelection.ts'

describe('textSelection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('识别浏览器真实文本选区', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '选中的正文',
      rangeCount: 1
    })

    expect(hasActiveBrowserTextSelection()).toBe(true)
  })

  it('空文本或无范围时不视为可复制文本选区', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '   ',
      rangeCount: 1
    })

    expect(hasActiveBrowserTextSelection()).toBe(false)

    window.getSelection.mockReturnValue({
      toString: () => '文字',
      rangeCount: 0
    })

    expect(hasActiveBrowserTextSelection()).toBe(false)
  })
})
