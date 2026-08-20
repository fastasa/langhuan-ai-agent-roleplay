/**
 * @vitest-environment jsdom
 */
// 输入框图片上传共享 composable 回归（计划批3·2026-07-11；批「带图乐观发送」2026-07-11 补充；
// 批「caption 默认关闭」2026-07-11 用户拍板补充）。
// 覆盖：文件校验拒绝、上传成功状态流转（uploading -> ready）、removeImage 防幽灵回写、
// takeAttachments 只等上传不等 caption+丢弃 failed、peekAttachments 同步快照（不等待不清空）、
// handlePaste 有图接管/无图放行、maxCount 上限。
// caption 默认关闭：新增用例验证 getCaptionDeps 有效时也不再触发 generateImageCaption；
// 涉及「caption 链路本身仍完好」（触发/pending/onCaptionUpdate 回调成功失败两态）的用例改用
// __setImageCaptionEnabledForTest(true) 临时打开开关验证能力仍在，afterEach 统一调回 false。
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useImageAttachments, __setImageCaptionEnabledForTest } from '../../../src/composables/app/useImageAttachments.ts'

const mockUploadChatImage = vi.fn()
const mockGenerateImageCaption = vi.fn()

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  uploadChatImage: (...args) => mockUploadChatImage(...args)
}))

vi.mock('../../../src/app/chatImageCaption.ts', () => ({
  generateImageCaption: (...args) => mockGenerateImageCaption(...args)
}))

function makePngFile(name = 'a.png', bytes = 32) {
  const content = new Uint8Array(bytes).fill(1)
  return new File([content], name, { type: 'image/png' })
}

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

describe('useImageAttachments', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  beforeEach(() => {
    mockUploadChatImage.mockReset()
    mockGenerateImageCaption.mockReset()
    URL.createObjectURL = vi.fn((file) => `blob:preview-${file?.name || 'x'}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    __setImageCaptionEnabledForTest(false) // 兜底调回默认值，防止某用例忘记关时污染后续测试
  })

  it('addFiles 校验拒绝：非白名单 mime 与超过 15MB 原图直接标 failed，附带 errorMessage', async () => {
    const kit = useImageAttachments({})
    const badMime = new File([new Uint8Array(8)], 'a.bmp', { type: 'image/bmp' })
    const tooLarge = makePngFile('big.png', 8)
    Object.defineProperty(tooLarge, 'size', { value: 16 * 1024 * 1024, configurable: true })

    await kit.addFiles([badMime, tooLarge])

    expect(kit.pendingImages.value).toHaveLength(2)
    expect(kit.pendingImages.value[0].status).toBe('failed')
    expect(kit.pendingImages.value[0].errorMessage).toContain('png/jpeg/webp/gif')
    expect(kit.pendingImages.value[1].status).toBe('failed')
    expect(kit.pendingImages.value[1].errorMessage).toContain('15MB')
    expect(mockUploadChatImage).not.toHaveBeenCalled()
  })

  it('上传成功状态流转：uploading -> ready；caption 默认关闭，不会自动触发 generateImageCaption', async () => {
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_1', url: '/chat-images/chat_img_1.png', mime: 'image/png', size: 999 })
    mockGenerateImageCaption.mockResolvedValue({ caption: '一只猫坐在窗台上' })

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 'sess_1' })
    })
    const file = makePngFile()
    await kit.addFiles([file])

    expect(kit.pendingImages.value).toHaveLength(1)
    expect(kit.pendingImages.value[0].status).toBe('uploading')
    expect(kit.pendingImages.value[0].previewUrl).toBe('blob:preview-a.png')
    expect(kit.hasUploading.value).toBe(true)

    await flush()

    expect(mockUploadChatImage).toHaveBeenCalledTimes(1)
    const entry = kit.pendingImages.value[0]
    expect(entry.status).toBe('ready')
    expect(entry.url).toBe('/chat-images/chat_img_1.png')
    expect(entry.size).toBe(999)
    // caption 默认关闭（2026-07-11 拍板）：即便 getCaptionDeps 有效，触发上传成功后也不会调用生成。
    expect(entry.captionStatus).toBeUndefined()
    expect(entry.caption).toBeUndefined()
    expect(mockGenerateImageCaption).not.toHaveBeenCalled()
    expect(kit.hasUploading.value).toBe(false)
  })

  it('caption 链路能力仍在（打开 __setImageCaptionEnabledForTest 验证，非默认行为）：上传成功后异步触发 caption 更新到 done', async () => {
    __setImageCaptionEnabledForTest(true)
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_1b', url: '/chat-images/chat_img_1b.png', mime: 'image/png', size: 999 })
    mockGenerateImageCaption.mockResolvedValue({ caption: '一只猫坐在窗台上' })

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 'sess_1' })
    })
    await kit.addFiles([makePngFile()])
    await flush()

    const entry = kit.pendingImages.value[0]
    expect(entry.status).toBe('ready')
    expect(entry.captionStatus).toBe('done')
    expect(entry.caption).toBe('一只猫坐在窗台上')
  })

  it('getCaptionDeps 返回 null：跳过 caption 生成，不调用 generateImageCaption', async () => {
    __setImageCaptionEnabledForTest(true) // 即便打开开关，deps 为 null 也不该触发——单测这条独立分支
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_2', url: '/chat-images/chat_img_2.png', mime: 'image/png', size: 100 })
    const kit = useImageAttachments({ getCaptionDeps: () => null })
    await kit.addFiles([makePngFile()])
    await flush()

    expect(kit.pendingImages.value[0].status).toBe('ready')
    expect(mockGenerateImageCaption).not.toHaveBeenCalled()
  })

  it('removeImage 防幽灵回写：上传进行中删除，随后上传成功回调不应把它重新加回列表', async () => {
    const upload = deferred()
    mockUploadChatImage.mockReturnValue(upload.promise)
    const kit = useImageAttachments({})
    const file = makePngFile()
    await kit.addFiles([file])
    const id = kit.pendingImages.value[0].id

    // 等 FileReader（真实宏任务）跑完，processFile 推进到已发起 uploadChatImage 调用
    await flush(4)
    expect(mockUploadChatImage).toHaveBeenCalledTimes(1)

    kit.removeImage(id)
    expect(kit.pendingImages.value).toHaveLength(0)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-a.png')

    // 上传其实成功了，但条目已被删——不应该被幽灵回写复活
    upload.resolve({ id: 'chat_img_3', url: '/chat-images/chat_img_3.png', mime: 'image/png', size: 100 })
    await flush()

    expect(kit.pendingImages.value).toHaveLength(0)
  })

  it('takeAttachments：等待上传完成（caption 开关打开·此时已跑完）返回 ready 附件并清空状态，failed 的丢弃', async () => {
    __setImageCaptionEnabledForTest(true)
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_4', url: '/chat-images/chat_img_4.png', mime: 'image/png', size: 200 })
    mockGenerateImageCaption.mockResolvedValue({ caption: '一片森林' })

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 's' })
    })
    const okFile = makePngFile('ok.png')
    const badFile = new File([new Uint8Array(4)], 'bad.txt', { type: 'text/plain' })
    // text/plain 不以 image/ 开头，会被 addFiles 静默过滤掉；改用不支持的图片 mime 触发 failed 态
    const badImageFile = new File([new Uint8Array(4)], 'bad.bmp', { type: 'image/bmp' })
    void badFile

    await kit.addFiles([okFile, badImageFile])
    await flush()

    expect(kit.pendingImages.value.find((img) => img.originalName === 'bad.bmp').status).toBe('failed')

    const result = await kit.takeAttachments()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: expect.any(String), url: '/chat-images/chat_img_4.png', caption: '一片森林' })
    expect(result[0].status).toBeUndefined()
    expect(result[0].previewUrl).toBeUndefined()
    expect(kit.pendingImages.value).toHaveLength(0)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('takeAttachments 不再等 caption（带图乐观发送·2026-07-11，caption 开关打开验证）：上传一完成就返回，caption 还没跑完时原样带走 pending（不再收口成 failed）', async () => {
    __setImageCaptionEnabledForTest(true)
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_8', url: '/chat-images/chat_img_8.png', mime: 'image/png', size: 300 })
    const captionDeferred = deferred()
    mockGenerateImageCaption.mockReturnValue(captionDeferred.promise)

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 's' })
    })
    await kit.addFiles([makePngFile('slow-caption.png')])
    await flush(4) // 上传完成、triggerCaption 已发起，但 caption 请求本身还没 resolve

    expect(kit.pendingImages.value[0].status).toBe('ready')
    expect(kit.pendingImages.value[0].captionStatus).toBe('pending')

    const result = await kit.takeAttachments()

    expect(result).toHaveLength(1)
    expect(result[0].captionStatus).toBe('pending')
    expect(result[0].caption).toBeUndefined()
    expect(kit.pendingImages.value).toHaveLength(0) // chips 照常清空，不因 caption 未完成而卡住

    captionDeferred.resolve({ caption: '不会再被用到' })
    await flush()
  })

  it('takeAttachments 接到停止信号后立即结束上传等待并清空待发送队列', async () => {
    const upload = deferred()
    mockUploadChatImage.mockReturnValue(upload.promise)
    const kit = useImageAttachments({})
    await kit.addFiles([makePngFile('abort-upload.png')])
    await flush(4)
    expect(mockUploadChatImage).toHaveBeenCalledTimes(1)

    const controller = new AbortController()
    const taking = kit.takeAttachments(undefined, controller.signal)
    controller.abort()

    await expect(taking).resolves.toEqual([])
    expect(kit.pendingImages.value).toHaveLength(0)
  })

  it('takeAttachments(onCaptionUpdate)：caption 在取走之后才跑完，仍会回调一次（即便 pendingImages 已被 clear；caption 开关打开验证）', async () => {
    __setImageCaptionEnabledForTest(true)
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_9', url: '/chat-images/chat_img_9.png', mime: 'image/png', size: 300 })
    const captionDeferred = deferred()
    mockGenerateImageCaption.mockReturnValue(captionDeferred.promise)

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 's' })
    })
    await kit.addFiles([makePngFile('cb.png')])
    await flush(4)

    const onCaptionUpdate = vi.fn()
    const result = await kit.takeAttachments(onCaptionUpdate)
    const attachmentId = result[0].id

    expect(onCaptionUpdate).not.toHaveBeenCalled()
    expect(kit.pendingImages.value).toHaveLength(0) // 已经 clear() 过

    captionDeferred.resolve({ caption: '一只猫坐在窗台上' })
    await flush()

    expect(onCaptionUpdate).toHaveBeenCalledTimes(1)
    expect(onCaptionUpdate).toHaveBeenCalledWith(attachmentId, { caption: '一只猫坐在窗台上', captionStatus: 'done' })
  })

  it('takeAttachments(onCaptionUpdate)：caption 生成失败时回调 captionStatus:failed（不带 caption 字段；caption 开关打开验证）', async () => {
    __setImageCaptionEnabledForTest(true)
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_10', url: '/chat-images/chat_img_10.png', mime: 'image/png', size: 300 })
    const captionDeferred = deferred()
    mockGenerateImageCaption.mockReturnValue(captionDeferred.promise)

    const kit = useImageAttachments({
      getCaptionDeps: () => ({ agentConfig: {}, callAI: vi.fn(), sessionId: 's' })
    })
    await kit.addFiles([makePngFile('cb-fail.png')])
    await flush(4)

    const onCaptionUpdate = vi.fn()
    const result = await kit.takeAttachments(onCaptionUpdate)
    const attachmentId = result[0].id

    captionDeferred.resolve({ error: '识图失败' })
    await flush()

    expect(onCaptionUpdate).toHaveBeenCalledWith(attachmentId, { captionStatus: 'failed' })
  })

  it('peekAttachments：同步快照当前 pendingImages（不等待、不清空），含 previewUrl 供乐观显示', async () => {
    mockUploadChatImage.mockReturnValue(new Promise(() => {})) // 保持 uploading 不 resolve
    const kit = useImageAttachments({})
    await kit.addFiles([makePngFile('peek.png')])

    const snapshot = kit.peekAttachments()

    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].status).toBe('uploading')
    expect(snapshot[0].previewUrl).toBe('blob:preview-peek.png')
    // 不等待、不清空：pendingImages 原样还在
    expect(kit.pendingImages.value).toHaveLength(1)
    // 快照是独立拷贝，不是同一个对象引用
    expect(snapshot[0]).not.toBe(kit.pendingImages.value[0])
  })

  it('handlePaste：剪贴板含图片文件时接管返回 true 并追加待上传项；纯文本粘贴返回 false 不打扰', async () => {
    mockUploadChatImage.mockResolvedValue({ id: 'chat_img_5', url: '/chat-images/chat_img_5.png', mime: 'image/png', size: 10 })
    const kit = useImageAttachments({})
    const file = makePngFile('pasted.png')

    const imageEvent = {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
      }
    }
    expect(kit.handlePaste(imageEvent)).toBe(true)
    await flush()
    expect(kit.pendingImages.value).toHaveLength(1)
    expect(kit.pendingImages.value[0].originalName).toBe('pasted.png')

    const textEvent = { clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] } }
    expect(kit.handlePaste(textEvent)).toBe(false)
    expect(kit.pendingImages.value).toHaveLength(1) // 未被打扰，仍是刚才那一张

    const mixedEvent = {
      clipboardData: {
        getData: (type) => type === 'text/plain' ? '这是复制的文字' : '',
        items: [
          { kind: 'string', type: 'text/plain' },
          { kind: 'file', type: 'image/png', getAsFile: () => makePngFile('clipboard-preview.png') }
        ]
      }
    }
    expect(kit.handlePaste(mixedEvent)).toBe(false)
    expect(kit.pendingImages.value).toHaveLength(1)

    expect(kit.handlePaste({ clipboardData: null })).toBe(false)
  })

  it('maxCount：超出上限的文件静默丢弃，pendingImages 长度不超过上限', async () => {
    mockUploadChatImage.mockResolvedValue({ id: 'x', url: '/chat-images/x.png', mime: 'image/png', size: 10 })
    const kit = useImageAttachments({ maxCount: 2 })
    await kit.addFiles([makePngFile('1.png'), makePngFile('2.png'), makePngFile('3.png')])
    expect(kit.pendingImages.value).toHaveLength(2)
  })

  it('clear：全清并 revoke 所有 previewUrl', async () => {
    mockUploadChatImage.mockReturnValue(new Promise(() => {})) // 保持 uploading，测试仍能被 clear
    const kit = useImageAttachments({})
    await kit.addFiles([makePngFile('c1.png')])
    expect(kit.hasPending.value).toBe(true)
    kit.clear()
    expect(kit.pendingImages.value).toHaveLength(0)
    expect(kit.hasPending.value).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-c1.png')
  })
})
