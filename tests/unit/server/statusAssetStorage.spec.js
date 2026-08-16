import { describe, expect, it } from 'vitest'
import { decodeStatusAssetDataUri } from '../../../server/repositories/statusAssetStorage.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('statusAssetStorage 上传边界', () => {
  it('同时校验声明 MIME 与 magic bytes，并生成可验证摘要', () => {
    const result = decodeStatusAssetDataUri(`data:image/png;base64,${PNG_SIGNATURE.toString('base64')}`)
    expect(result).toMatchObject({ ok: true, mimeType: 'image/png', extension: 'png' })
    expect(result.ok && result.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('拒绝伪装成 PNG 的 JPEG 内容与非图片 data URI', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00])
    expect(decodeStatusAssetDataUri(`data:image/png;base64,${jpeg.toString('base64')}`)).toEqual({ ok: false, error: '图片内容与声明格式不符' })
    expect(decodeStatusAssetDataUri('data:text/plain;base64,SGVsbG8=')).toEqual({ ok: false, error: '图片必须是合法的 base64 data URI' })
  })
})
