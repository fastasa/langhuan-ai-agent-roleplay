import { describe, expect, it } from 'vitest'
import { createDocument, validateDocument, cloneDocument, getFrame, MAX_FRAME_COUNT, normalizeDocument } from '@/pixel-studio/core/model'

describe('pixel-studio/core/model', () => {
  it('createDocument 生成含一个空白透明帧的合法文档', () => {
    const doc = createDocument({ name: 'demo', width: 3, height: 2 })
    expect(doc.version).toBe(4)
    expect(doc.width).toBe(3)
    expect(doc.height).toBe(2)
    expect(doc.frames).toHaveLength(1)
    expect(doc.frames[0].exposureFrames).toBe(1)
    expect(doc.timeline).toBeNull()
    expect(doc.frames[0].layers[0].palette).toEqual({})
    expect(doc.frames[0].layers[0].grid).toEqual(['......', '......'])
    expect(validateDocument(doc)).toEqual([])
  })

  it('cloneDocument 深拷贝，修改克隆不影响原文档', () => {
    const doc = createDocument({ name: 'demo', width: 2, height: 2 })
    const clone = cloneDocument(doc)
    clone.name = 'changed'
    clone.frames[0].layers[0].grid[0] = 'a1..'
    expect(doc.name).toBe('demo')
    expect(doc.frames[0].layers[0].grid[0]).toBe('....')
    expect(clone).not.toBe(doc)
  })

  it('历史 v1 单网格文档读取时单向升级为 v4 图层私有色卡，网格内容不变', () => {
    const legacy = { version: 1, name: '旧文档', width: 1, height: 1, palette: { a1: { hex: '#ff0000' } }, frames: [{ id: 'f1', durationMs: 200, grid: ['a1'] }], playback: { loop: true } }
    const doc = normalizeDocument(legacy)
    expect(doc.version).toBe(4)
    expect(doc.frames[0]).toEqual({ id: 'f1', exposureFrames: 1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1'] }] })
    expect(doc.timeline).toBeNull()
  })

  it('历史 v2 共享色卡完整深拷贝到各层，备用色不丢且改一层不会串另一层', () => {
    const legacy = {
      version: 2, name: '旧分层文档', width: 1, height: 1,
      palette: { a1: { hex: '#ff0000' }, b1: { hex: '#00ff00' }, c1: { hex: '#0000ff' } },
      frames: [{ id: 'f1', durationMs: 200, layers: [
        { id: 'l1', name: '底层', visible: true, grid: ['a1'] },
        { id: 'l2', name: '顶层', visible: true, grid: ['b1'] }
      ] }],
      playback: { loop: true }
    }
    const doc = normalizeDocument(legacy)
    expect(doc.version).toBe(4)
    expect(doc.frames[0].layers[0].palette).toEqual(legacy.palette)
    expect(doc.frames[0].layers[1].palette).toEqual(legacy.palette)
    doc.frames[0].layers[0].palette.a1.hex = '#abcdef'
    expect(doc.frames[0].layers[1].palette.a1.hex).toBe('#ff0000')
  })

  it('validateDocument 对合法文档返回空数组', () => {
    const doc = createDocument({ name: 'ok', width: 1, height: 1 })
    doc.frames[0].layers[0].palette.a1 = { hex: '#ff0000' }
    doc.frames[0].layers[0].grid[0] = 'a1'
    expect(validateDocument(doc)).toEqual([])
  })

  it('validateDocument 拒绝非对象输入', () => {
    expect(validateDocument(null)).toEqual(['文档不是对象'])
    expect(validateDocument('str')).toEqual(['文档不是对象'])
  })

  it('validateDocument 拒绝错误 version', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.version = 99
    expect(validateDocument(doc)).toContain('version 必须为 1、2、3 或 4')
  })

  it('validateDocument 拒绝越界尺寸', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.width = 0
    doc.height = 999
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes('width'))).toBe(true)
    expect(errors.some((e) => e.includes('height'))).toBe(true)
  })

  it('validateDocument 拒绝行数/行宽不匹配', () => {
    const doc = createDocument({ name: 'v', width: 2, height: 2 })
    doc.frames[0].layers[0].grid = ['....'] // 少一行
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes('行数'))).toBe(true)
  })

  it('validateDocument 拒绝未登记短码', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames[0].layers[0].grid[0] = 'zz' // zz 不在 palette 也不是透明码
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes('未登记短码'))).toBe(true)
  })

  it('validateDocument 拒绝重复帧 id 与非正整数 exposureFrames', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames.push({ id: 'f1', exposureFrames: -1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: {}, grid: ['..'] }] })
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes('重复'))).toBe(true)
    expect(errors.some((e) => e.includes('exposureFrames'))).toBe(true)
  })

  it('validateDocument 拒绝非法 palette hex 格式', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames[0].layers[0].palette.a1 = { hex: 'notacolor' }
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes('hex 格式非法'))).toBe(true)
  })

  it('validateDocument 拒绝超过 MAX_FRAME_COUNT(65) 帧', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames = []
    for (let i = 0; i < MAX_FRAME_COUNT + 1; i++) {
      doc.frames.push({ id: `f${i}`, exposureFrames: 1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: {}, grid: ['..'] }] })
    }
    const errors = validateDocument(doc)
    expect(errors.some((e) => e.includes(String(MAX_FRAME_COUNT)))).toBe(true)
  })

  it('validateDocument 接受恰好 MAX_FRAME_COUNT(64) 帧', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames = []
    for (let i = 0; i < MAX_FRAME_COUNT; i++) {
      doc.frames.push({ id: `f${i}`, exposureFrames: 1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: {}, grid: ['..'] }] })
    }
    doc.timeline = { fps: 10, rangeStartFrame: 1, rangeEndFrame: MAX_FRAME_COUNT }
    expect(validateDocument(doc)).toEqual([])
  })

  // 唯一读帧入口：UI 层 10 处 frames[0] 收敛到这里，语义=默认取第 0 帧，越界视为数据不一致直接抛错
  it('getFrame 默认返回索引 0 帧', () => {
    const doc = createDocument({ name: 'v', width: 2, height: 2 })
    expect(getFrame(doc)).toBe(doc.frames[0])
  })

  it('getFrame 显式传入合法索引返回对应帧', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    doc.frames.push({ id: 'f2', exposureFrames: 1, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: {}, grid: ['..'] }] })
    expect(getFrame(doc, 1)).toBe(doc.frames[1])
  })

  it('getFrame 索引越界抛错，不静默返回空帧', () => {
    const doc = createDocument({ name: 'v', width: 1, height: 1 })
    expect(() => getFrame(doc, 1)).toThrow(/帧越界/)
  })
})
