import { describe, it, expect } from 'vitest'
import { renderChatMarkdownToHtml } from '../../../src/utils/chatMarkdown.ts'

// 双层方括号【【…】】内心独白渲染（修「露一半括号」根因 + 柔紫罗兰配色独立区分）
describe('chatMarkdown 双层方括号【【…】】渲染', () => {
  it('双层括号整体识别为 bracket-square-double，去掉双括号只留纯色文字', () => {
    const html = renderChatMarkdownToHtml('他笑了笑。【【她其实早就猜到了】】')
    expect(html).toContain('<span class="chat-style-segment bracket-square-double">她其实早就猜到了</span>')
  })

  it('不再露半个括号：双层段渲染后正文不残留任何【或】', () => {
    const html = renderChatMarkdownToHtml('开头【【内心独白一整段都很长很长】】')
    expect(html).not.toContain('【')
    expect(html).not.toContain('】')
  })

  it('单层【强调】仍走 bracket-square（金色），不受双层规则影响', () => {
    const html = renderChatMarkdownToHtml('他打开了【机关】')
    expect(html).toContain('<span class="chat-style-segment bracket-square">机关</span>')
    expect(html).not.toContain('bracket-square-double')
  })

  it('双层与单层混排：各自归类，互不串色', () => {
    const html = renderChatMarkdownToHtml('【重点】然后【【她在想别的事】】')
    expect(html).toContain('<span class="chat-style-segment bracket-square">重点</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-square-double">她在想别的事</span>')
  })
})
