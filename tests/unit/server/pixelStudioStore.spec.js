import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPixelStore } from '../../../server/pixel-studio/store.js'

function makeDoc(overrides = {}) {
  return {
    version: 1,
    name: '测试文档',
    width: 2,
    height: 2,
    frames: [{ grid: ['0000', '0000'] }],
    ...overrides
  }
}

describe('pixelStudioStore', () => {
  let dir
  let store

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pixel-studio-'))
    store = createPixelStore(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('save → get 往返：新建返回生成的 id，get 能取回同一份文档', () => {
    const doc = makeDoc()
    const saved = store.saveDoc(null, doc)
    expect(saved.errors).toBeUndefined()
    expect(saved.id).toMatch(/^pd-[a-z0-9-]+$/)

    const got = store.getDoc(saved.id)
    expect(got).not.toBeNull()
    expect(got.doc).toEqual(doc)
    expect(typeof got.updatedAt).toBe('string')
  })

  it('正式 v2 多图层文档可保存，图层显隐与网格原样往返', () => {
    const doc = makeDoc({
      version: 2,
      frames: [{
        id: 'f1', durationMs: 200, layers: [
          { id: 'l1', name: '底层', visible: true, grid: ['0000', '0000'] },
          { id: 'l2', name: '顶层', visible: false, grid: ['0000', '0000'] }
        ]
      }]
    })
    const saved = store.saveDoc(null, doc)
    expect(saved.errors).toBeUndefined()
    expect(store.getDoc(saved.id).doc).toEqual(doc)
  })

  it('正式 v3 文档要求每个图层携带私有色卡并原样往返', () => {
    const doc = makeDoc({
      version: 3,
      frames: [{
        id: 'f1', durationMs: 200, layers: [
          { id: 'l1', name: '底层', visible: true, palette: { a1: { hex: '#ff0000' } }, grid: ['a1a1', 'a1a1'] },
          { id: 'l2', name: '顶层', visible: true, palette: { a1: { hex: '#00ff00' } }, grid: ['a1a1', 'a1a1'] }
        ]
      }]
    })
    const saved = store.saveDoc(null, doc)
    expect(saved.errors).toBeUndefined()
    expect(store.getDoc(saved.id).doc).toEqual(doc)

    const missingPalette = structuredClone(doc)
    delete missingPalette.frames[0].layers[0].palette
    expect(store.saveDoc(null, missingPalette).errors.some((error) => error.includes('.palette'))).toBe(true)

    const sharedPalette = { ...doc, palette: { a1: { hex: '#ff0000' } } }
    expect(store.saveDoc(null, sharedPalette).errors).toContain('v3 不应包含文档级 palette')
  })

  it('正式 v4 时间轴文档校验整数曝光与播放范围总数', () => {
    const doc = makeDoc({
      version: 4,
      frames: [{ id: 'f1', exposureFrames: 20, layers: [{ id: 'l1', name: '图层 1', visible: true, palette: {}, grid: ['0000', '0000'] }] }],
      timeline: { fps: 10, rangeStartFrame: 1, rangeEndFrame: 20 },
      playback: { loop: true }
    })
    const saved = store.saveDoc(null, doc)
    expect(saved.errors).toBeUndefined()
    expect(store.getDoc(saved.id).doc).toEqual(doc)

    const mismatch = structuredClone(doc)
    mismatch.timeline.rangeEndFrame = 19
    expect(store.saveDoc(null, mismatch).errors.some((error) => error.includes('曝光总数'))).toBe(true)
  })

  it('list 摘要字段齐全，并按 updatedAt 降序排列', async () => {
    const first = store.saveDoc(null, makeDoc({ name: 'first' }))
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = store.saveDoc(null, makeDoc({ name: 'second' }))

    const docs = store.listDocs()
    expect(docs).toHaveLength(2)
    expect(docs[0].id).toBe(second.id)
    expect(docs[1].id).toBe(first.id)
    expect(docs[0]).toEqual({
      id: second.id,
      name: 'second',
      width: 2,
      height: 2,
      frameCount: 1,
      updatedAt: docs[0].updatedAt
    })
  })

  it('非法 id 一律拒绝，含路径穿越样例', () => {
    expect(store.getDoc('../evil')).toBeNull()
    expect(store.getDoc('EVIL')).toBeNull()
    expect(store.getDoc('has/slash')).toBeNull()
    expect(store.deleteDoc('../../evil')).toBe(false)
    const saved = store.saveDoc('../evil', makeDoc())
    expect(saved.errors).toEqual(['id 不合法'])
  })

  it('非法 doc 结构返回错误列表', () => {
    expect(store.saveDoc(null, null).errors).toContain('doc 必须是对象')

    const badVersion = store.saveDoc(null, makeDoc({ version: 99 }))
    expect(badVersion.errors).toContain('version 必须为 1、2、3 或 4')

    const badName = store.saveDoc(null, makeDoc({ name: '' }))
    expect(badName.errors.some((e) => e.includes('name'))).toBe(true)

    const badSize = store.saveDoc(null, makeDoc({ width: 0, height: 0 }))
    expect(badSize.errors.some((e) => e.includes('width'))).toBe(true)
    expect(badSize.errors.some((e) => e.includes('height'))).toBe(true)

    const badFrames = store.saveDoc(null, makeDoc({ frames: [] }))
    expect(badFrames.errors.some((e) => e.includes('frames'))).toBe(true)

    const badGridRows = store.saveDoc(null, makeDoc({ frames: [{ grid: ['00000000'] }] }))
    expect(badGridRows.errors.some((e) => e.includes('grid 行数'))).toBe(true)

    const badGridLength = store.saveDoc(null, makeDoc({ frames: [{ grid: ['00', '00'] }] }))
    expect(badGridLength.errors.some((e) => e.includes('grid 每行长度'))).toBe(true)
  })

  it('损坏的 JSON 文件不炸 list，跳过并继续', () => {
    const good = store.saveDoc(null, makeDoc({ name: 'good' }))
    writeFileSync(join(dir, 'pd-broken.json'), '{not valid json')

    const docs = store.listDocs()
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe(good.id)
  })

  it('delete 后 get 返回 null（404 语义）', () => {
    const saved = store.saveDoc(null, makeDoc())
    expect(store.deleteDoc(saved.id)).toBe(true)
    expect(store.getDoc(saved.id)).toBeNull()
    expect(store.deleteDoc(saved.id)).toBe(false)
  })
})
