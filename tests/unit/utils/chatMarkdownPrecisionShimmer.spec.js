import { describe, it, expect } from 'vitest'
import { renderChatMarkdownWithPrecisionShimmer, renderChatMarkdownToHtml } from '../../../src/utils/chatMarkdown.ts'

// 提调精修光带·段级 shimmer 注入（提调修改消息·状态提示 B1）。
describe('renderChatMarkdownWithPrecisionShimmer', () => {
  it('无片段时等价于普通渲染，matchedCount=0', () => {
    const text = '今晚天气真不错。'
    const result = renderChatMarkdownWithPrecisionShimmer(text, [])
    expect(result.matchedCount).toBe(0)
    expect(result.matchedAll).toBe(false)
    expect(result.html).toBe(renderChatMarkdownToHtml(text))
  })

  it('命中片段时把该段包成 .tidiao-pe-shimmer span', () => {
    const result = renderChatMarkdownWithPrecisionShimmer('今晚天气真不错，适合散步。', ['天气真不错'])
    expect(result.matchedCount).toBe(1)
    expect(result.matchedAll).toBe(true)
    expect(result.html).toContain('<span class="tidiao-pe-shimmer">天气真不错</span>')
    // 哨兵不应残留
    expect(result.html).not.toContain(String.fromCharCode(0xe010))
    expect(result.html).not.toContain(String.fromCharCode(0xe011))
  })

  it('片段落在 *动作* 样式段内时仍能高亮（嵌套 span）', () => {
    const result = renderChatMarkdownWithPrecisionShimmer('*她轻轻笑了笑*', ['轻轻笑了笑'])
    expect(result.matchedCount).toBe(1)
    expect(result.html).toContain('chat-style-segment')
    expect(result.html).toContain('<span class="tidiao-pe-shimmer">轻轻笑了笑</span>')
  })

  it('片段定位不到时 matchedCount=0、退回普通渲染（调用方整条退化）', () => {
    const text = '今晚天气真不错。'
    const result = renderChatMarkdownWithPrecisionShimmer(text, ['根本不存在的片段'])
    expect(result.matchedCount).toBe(0)
    expect(result.matchedAll).toBe(false)
    expect(result.html).toBe(renderChatMarkdownToHtml(text))
  })

  it('跨空行（多段落）的片段不内联注入，按未命中处理', () => {
    const text = '第一段。\n\n第二段。'
    const result = renderChatMarkdownWithPrecisionShimmer(text, ['第一段。\n\n第二段。'])
    expect(result.matchedCount).toBe(0)
    expect(result.html).not.toContain('tidiao-pe-shimmer')
  })

  it('多片段部分命中：matchedCount 计命中数、matchedAll=false', () => {
    const result = renderChatMarkdownWithPrecisionShimmer('今晚天气真不错，适合散步。', ['天气真不错', '不存在'])
    expect(result.matchedCount).toBe(1)
    expect(result.matchedAll).toBe(false)
    expect(result.html).toContain('<span class="tidiao-pe-shimmer">天气真不错</span>')
  })

  it('相同片段出现多次只高亮第一处', () => {
    const result = renderChatMarkdownWithPrecisionShimmer('好的好的', ['好的'])
    const occurrences = result.html.split('<span class="tidiao-pe-shimmer">').length - 1
    expect(occurrences).toBe(1)
  })
})
