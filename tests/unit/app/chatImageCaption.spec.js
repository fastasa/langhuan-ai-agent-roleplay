import { describe, expect, it, vi } from 'vitest'
import { generateImageCaption } from '../../../src/app/chatImageCaption.ts'

function makeCallAI(impl) {
  return vi.fn(impl)
}

describe('chatImageCaption generateImageCaption', () => {
  it('成功：构造 text+image_url 两 part 用户消息，meta 打标 image_caption', async () => {
    let capturedMessages
    let capturedOptions
    const callAI = makeCallAI(async (messages, options) => {
      capturedMessages = messages
      capturedOptions = options
      return '一张猫咪坐在窗台上的照片。'
    })

    const result = await generateImageCaption({
      url: '/chat-images/abc.png',
      mime: 'image/png',
      sessionId: 'session_1',
      agentConfig: null,
      callAI
    })

    expect(result).toEqual({ caption: '一张猫咪坐在窗台上的照片。' })
    expect(capturedMessages).toHaveLength(1)
    expect(capturedMessages[0].role).toBe('user')
    expect(capturedMessages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('用中文简要而完整地描述这张图片的内容') },
      { type: 'image_url', image_url: { url: '/chat-images/abc.png' } }
    ])
    expect(capturedOptions.feature).toBe('agent')
    expect(capturedOptions.unitKind).toBe('image_caption')
    expect(capturedOptions.roundId).toMatch(/^op:image_caption:session_1:/)
    expect(capturedOptions.sessionId).toBe('session_1')
    expect(capturedOptions.modelUsageSlotId).toBe('balanced')
  })

  it('callAI 返回空/空白 → { error }，不抛异常', async () => {
    const callAI = makeCallAI(async () => '   ')
    const result = await generateImageCaption({ url: '/chat-images/a.png', mime: 'image/png', callAI })
    expect(result).toEqual({ error: '未能生成图片描述' })
  })

  it('callAI 返回 [API调用失败:...] 占位文本 → 提取成 error', async () => {
    const callAI = makeCallAI(async () => '[API调用失败: 网络超时]')
    const result = await generateImageCaption({ url: '/chat-images/a.png', mime: 'image/png', callAI })
    expect(result).toEqual({ error: 'API调用失败: 网络超时' })
  })

  it('callAI 抛异常 → 捕获成 { error }，不向上抛', async () => {
    const callAI = makeCallAI(async () => { throw new Error('调用中断') })
    const result = await generateImageCaption({ url: '/chat-images/a.png', mime: 'image/png', callAI })
    expect(result).toEqual({ error: '调用中断' })
  })

  it('url 为空 → 直接返回 error，不调用 callAI', async () => {
    const callAI = makeCallAI(async () => 'x')
    const result = await generateImageCaption({ url: '', mime: 'image/png', callAI })
    expect(result).toEqual({ error: '缺少图片地址' })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('未传 sessionId 时 roundId 仍生成（session 段为空）', async () => {
    let capturedOptions
    const callAI = makeCallAI(async (_messages, options) => {
      capturedOptions = options
      return '描述'
    })
    await generateImageCaption({ url: '/chat-images/a.png', mime: 'image/png', callAI })
    expect(capturedOptions.roundId).toMatch(/^op:image_caption::/)
  })
})
