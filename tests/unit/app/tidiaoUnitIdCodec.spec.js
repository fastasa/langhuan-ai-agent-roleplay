import { describe, expect, it } from 'vitest'
import {
  createTidiaoUnitIdCodec,
  isTidiaoUnitShortCode,
  needsTidiaoUnitIdAlias
} from '../../../src/app/tidiaoUnitIdCodec.ts'

// 短码映射协议（2026-07-04）：脏 unitId（路径编码文件夹 id）出口换 u#短码、入口解码还原；
// 干净 id 与陌生 id 恒等透传（向后兼容：模型抄真实 id 依然可用）。
const DIRTY_FOLDER_ID = 'doc-tree:~2F~E4~BA~9A~E4~BB~80~E5~9F~BA~E8~AF~BA'
const DIRTY_FOLDER_ID_2 = 'doc-tree:~2F~E4~BA~9A~E4~BB~80~E5~9F~BA~E8~AF~BA~2F~E5~9C~B0~E7~90~86'
const CLEAN_DOC_ID = 'doc:doc-1777714849877'

describe('tidiaoUnitIdCodec（unitId 短码映射协议）', () => {
  it('脏 id 判定：含 ~ 编码字节才需要别名', () => {
    expect(needsTidiaoUnitIdAlias(DIRTY_FOLDER_ID)).toBe(true)
    expect(needsTidiaoUnitIdAlias(CLEAN_DOC_ID)).toBe(false)
    expect(needsTidiaoUnitIdAlias('doc-tree:root')).toBe(false)
  })

  it('encode：脏 id 换短码（u#…、不含 ~、显著变短），干净 id 原样透传', () => {
    const codec = createTidiaoUnitIdCodec(() => [DIRTY_FOLDER_ID, CLEAN_DOC_ID])
    const encoded = codec.encode(DIRTY_FOLDER_ID)
    expect(isTidiaoUnitShortCode(encoded)).toBe(true)
    expect(encoded).not.toContain('~')
    expect(encoded.length).toBeLessThan(DIRTY_FOLDER_ID.length)
    expect(codec.encode(CLEAN_DOC_ID)).toBe(CLEAN_DOC_ID)
  })

  it('decode：短码还原真实 id；真实脏 id 与陌生 id 原样放行（向后兼容）', () => {
    const codec = createTidiaoUnitIdCodec(() => [DIRTY_FOLDER_ID, CLEAN_DOC_ID])
    const shortCode = codec.encode(DIRTY_FOLDER_ID)
    expect(codec.decode(shortCode)).toBe(DIRTY_FOLDER_ID)
    expect(codec.decode(` ${shortCode} `)).toBe(DIRTY_FOLDER_ID)
    expect(codec.decode(DIRTY_FOLDER_ID)).toBe(DIRTY_FOLDER_ID)
    expect(codec.decode(CLEAN_DOC_ID)).toBe(CLEAN_DOC_ID)
    expect(codec.decode('u#zzzzzzzzzzzz')).toBe('u#zzzzzzzzzzzz')
  })

  it('确定性：同一 id 在不同实例/不同轮次得到同一短码（资料池留痕跨轮可解析）', () => {
    const first = createTidiaoUnitIdCodec(() => [DIRTY_FOLDER_ID, DIRTY_FOLDER_ID_2])
    const second = createTidiaoUnitIdCodec(() => [DIRTY_FOLDER_ID_2, DIRTY_FOLDER_ID])
    expect(first.encode(DIRTY_FOLDER_ID)).toBe(second.encode(DIRTY_FOLDER_ID))
    expect(first.encode(DIRTY_FOLDER_ID_2)).toBe(second.encode(DIRTY_FOLDER_ID_2))
    expect(first.encode(DIRTY_FOLDER_ID)).not.toBe(first.encode(DIRTY_FOLDER_ID_2))
  })

  it('表外脏 id encode 恒等透传（只对可解析回来的 id 发短码，不发解不开的码）', () => {
    const codec = createTidiaoUnitIdCodec(() => [CLEAN_DOC_ID])
    expect(codec.encode(DIRTY_FOLDER_ID)).toBe(DIRTY_FOLDER_ID)
  })
})
