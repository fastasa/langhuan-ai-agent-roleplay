import { describe, expect, it } from 'vitest'
import { hasValidAiChatMessageContent } from '../../../server/routes/ai.js'

// content 校验放宽（输入框图片上传计划批2）：string 或合法 parts 数组都算有内容；
// image_url 只认 /chat-images/ 相对路径或 data:image/ 内联，拒绝一切外部 http(s) URL（防 SSRF）。
describe('routes/ai hasValidAiChatMessageContent', () => {
  it('非空字符串合法，空字符串非法', () => {
    expect(hasValidAiChatMessageContent('你好')).toBe(true)
    expect(hasValidAiChatMessageContent('')).toBe(false)
  })

  it('text + image_url（/chat-images/ 相对路径）parts 数组合法', () => {
    expect(hasValidAiChatMessageContent([
      { type: 'text', text: '这张图' },
      { type: 'image_url', image_url: { url: '/chat-images/abc.png' } }
    ])).toBe(true)
  })

  it('image_url 为 data:image/ 内联 URI 合法', () => {
    expect(hasValidAiChatMessageContent([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
    ])).toBe(true)
  })

  it('image_url 为外部 http(s) 链接非法（防 SSRF）', () => {
    expect(hasValidAiChatMessageContent([
      { type: 'image_url', image_url: { url: 'https://evil.example.com/x.png' } }
    ])).toBe(false)
    expect(hasValidAiChatMessageContent([
      { type: 'image_url', image_url: { url: 'http://internal.local/secret' } }
    ])).toBe(false)
  })

  it('image_url 缺失/空串非法', () => {
    expect(hasValidAiChatMessageContent([{ type: 'image_url', image_url: {} }])).toBe(false)
    expect(hasValidAiChatMessageContent([{ type: 'image_url' }])).toBe(false)
  })

  it('未知 part type 非法', () => {
    expect(hasValidAiChatMessageContent([{ type: 'video_url', video_url: { url: '/chat-images/x.mp4' } }])).toBe(false)
  })

  it('空数组非法（与空字符串同语义：没有内容）', () => {
    expect(hasValidAiChatMessageContent([])).toBe(false)
  })

  it('null/undefined/数字等非法', () => {
    expect(hasValidAiChatMessageContent(null)).toBe(false)
    expect(hasValidAiChatMessageContent(undefined)).toBe(false)
    expect(hasValidAiChatMessageContent(123)).toBe(false)
  })
})
