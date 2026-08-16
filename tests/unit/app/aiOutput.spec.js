import { describe, expect, it } from 'vitest'
import { normalizeThinkDisplayText } from '../../../src/utils/aiOutput.ts'

describe('aiOutput', () => {
  it('折叠思考过程显示时移除单独空行', () => {
    expect(normalizeThinkDisplayText(' 第一行 \n\n  \n 第二行 \r\n\r\n第三行 ')).toBe('第一行\n第二行\n第三行')
  })
})
