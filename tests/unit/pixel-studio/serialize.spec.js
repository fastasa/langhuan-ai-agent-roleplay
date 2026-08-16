import { describe, expect, it } from 'vitest'
import { serializeDocument, parseDocument } from '@/pixel-studio/core/serialize'
import { createDocument } from '@/pixel-studio/core/model'

describe('pixel-studio/core/serialize', () => {
  it('serializeDocument 输出 2 空格缩进 JSON', () => {
    const doc = createDocument({ name: 'demo', width: 1, height: 1 })
    const json = serializeDocument(doc)
    expect(json).toContain('\n  "version": 4')
  })

  it('serialize/parse 往返相等', () => {
    const doc = createDocument({ name: 'demo', width: 2, height: 2 })
    doc.frames[0].layers[0].palette.a1 = { hex: '#ff0000' }
    doc.frames[0].layers[0].grid[0] = 'a1..'
    const json = serializeDocument(doc)
    const parsed = parseDocument(json)
    expect(parsed).toEqual(doc)
  })

  it('parseDocument 对坏 JSON 抛错', () => {
    expect(() => parseDocument('{not valid json')).toThrow()
  })

  it('parseDocument 对合法 JSON 但非法文档抛带错误列表的 Error', () => {
    const badJson = JSON.stringify({ version: 3, name: 'x', width: 1, height: 1, frames: [], playback: { loop: true } })
    try {
      parseDocument(badJson)
      throw new Error('应当抛错')
    } catch (e) {
      expect(e.errors).toBeDefined()
      expect(e.errors.length).toBeGreaterThan(0)
    }
  })
})
