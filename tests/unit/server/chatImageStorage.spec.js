import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// chatImageStorage.ts 直接 import 了 server/db.js 的 CHAT_IMAGE_DIR（该文件顶层会真实加载 langhuan.db，
// 单测环境不能触碰真库），改用系统临时目录 mock 掉；uploadRepository/audit 也一起 mock，
// 只测本模块自己的校验逻辑（写盘落在临时目录，走真实 fs，测完整目清理，不留垃圾）。
const CHAT_IMAGE_TEST_DIR = join(tmpdir(), 'langhuan-chat-image-storage-spec')

vi.mock('../../../server/db', () => ({ CHAT_IMAGE_DIR: CHAT_IMAGE_TEST_DIR }))
vi.mock('../../../server/middleware/audit.js', () => ({ auditLog: vi.fn() }))
vi.mock('../../../server/repositories/uploadRepository.js', () => ({
  uploadRepository: { recordUpload: vi.fn() }
}))

const { saveChatImageDataUri, saveGeneratedChatImageBase64 } = await import('../../../server/repositories/chatImageStorage')
const { uploadRepository } = await import('../../../server/repositories/uploadRepository.js')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

function pngDataUri(extraBytes = 32) {
  const buffer = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(extraBytes, 1)])
  return `data:image/png;base64,${buffer.toString('base64')}`
}

describe('chatImageStorage saveChatImageDataUri', () => {
  beforeAll(() => {
    mkdirSync(CHAT_IMAGE_TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    rmSync(CHAT_IMAGE_TEST_DIR, { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('拒绝非 data URI 输入', () => {
    const result = saveChatImageDataUri('not-a-data-uri', 'pic.png')
    expect(result.ok).toBe(false)
    expect(uploadRepository.recordUpload).not.toHaveBeenCalled()
  })

  it('拒绝 MIME 白名单之外的类型', () => {
    const buffer = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(16)])
    const result = saveChatImageDataUri(`data:image/svg+xml;base64,${buffer.toString('base64')}`, 'pic.svg')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('png/jpeg/webp/gif')
  })

  it('拒绝超过 8MB 的图片', () => {
    const result = saveChatImageDataUri(pngDataUri(9 * 1024 * 1024), 'big.png')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('8MB')
  })

  it('拒绝 magic bytes 与声明 MIME 不一致的图片', () => {
    // 声明 png，但内容其实是 jpeg 头，签名校验应当拒绝。
    const buffer = Buffer.concat([JPEG_SIGNATURE, Buffer.alloc(16)])
    const result = saveChatImageDataUri(`data:image/png;base64,${buffer.toString('base64')}`, 'fake.png')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('不符')
  })

  it('成功保存合法图片、真实写盘，并记入本地 uploads 台账', () => {
    const buffer = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(32, 1)])
    const result = saveChatImageDataUri(`data:image/png;base64,${buffer.toString('base64')}`, '截图.png')

    expect(result.ok).toBe(true)
    expect(result.mime).toBe('image/png')
    expect(result.url).toMatch(/^\/chat-images\/chat_img_[0-9a-f]+\.png$/)

    const writtenPath = join(CHAT_IMAGE_TEST_DIR, result.url.replace('/chat-images/', ''))
    expect(existsSync(writtenPath)).toBe(true)
    expect(readFileSync(writtenPath)).toEqual(buffer)

    expect(uploadRepository.recordUpload).toHaveBeenCalledWith(expect.objectContaining({
      businessType: 'chat_image',
      originalFilename: '截图.png',
      mimeType: 'image/png',
      sizeBytes: buffer.byteLength
    }))
  })
})

describe('chatImageStorage saveGeneratedChatImageBase64', () => {
  beforeAll(() => mkdirSync(CHAT_IMAGE_TEST_DIR, { recursive: true }))
  afterAll(() => rmSync(CHAT_IMAGE_TEST_DIR, { recursive: true, force: true }))
  beforeEach(() => vi.clearAllMocks())

  it('校验 magic bytes 后把 Codex base64 登记为生成图片', () => {
    const buffer = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(48, 2)])
    const result = saveGeneratedChatImageBase64(buffer.toString('base64'))

    expect(result.ok).toBe(true)
    expect(result.url).toMatch(/^\/chat-images\/chat_gen_[0-9a-f]+\.png$/)
    expect(uploadRepository.recordUpload).toHaveBeenCalledWith(expect.objectContaining({
      businessType: 'chat_image_generated',
      mimeType: 'image/png'
    }))
  })

  it('拒绝不是图片的 base64，不写台账', () => {
    const result = saveGeneratedChatImageBase64(Buffer.from('not an image').toString('base64'))
    expect(result.ok).toBe(false)
    expect(uploadRepository.recordUpload).not.toHaveBeenCalled()
  })
})
