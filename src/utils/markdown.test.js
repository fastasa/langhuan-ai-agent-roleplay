import { describe, expect, it } from 'vitest'
import { applyLanghuanMarkdownIndentShortcut, renderMarkdownToHtml } from './markdown'

describe('renderMarkdownToHtml', () => {
  it('支持星号列表与数字列表', () => {
    const html = renderMarkdownToHtml('* 第一条\n* 第二条\n\n1. 甲\n2. 乙')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一条</li>')
    expect(html).toContain('<li>第二条</li>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>甲</li>')
    expect(html).toContain('<li>乙</li>')
  })

  it('支持标题、加粗与斜体', () => {
    const html = renderMarkdownToHtml('# 标题\n\n这是 **加粗** 和 *斜体*。')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>斜体</em>')
  })

  it('支持标准 Markdown 链接并补安全属性', () => {
    const html = renderMarkdownToHtml('[链接](https://example.com)')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">链接</a>')
  })

  it('按标准 Markdown 处理换行', () => {
    const softBreakHtml = renderMarkdownToHtml('第一行\n第二行')
    expect(softBreakHtml).toContain('<p>第一行\n第二行</p>')
    expect(softBreakHtml).not.toContain('<br>')

    const trailingSpaceHtml = renderMarkdownToHtml('第一行  \n第二行')
    expect(trailingSpaceHtml).toContain('第一行<br>')

    const backslashHtml = renderMarkdownToHtml('第一行\\\n第二行')
    expect(backslashHtml).toContain('第一行<br>')
  })

  it('空行分成两个自然段，但不生成额外空白块', () => {
    const html = renderMarkdownToHtml('第一段\n\n第二段\n\n\n第三段')
    expect(html.match(/<p>/g)).toHaveLength(3)
    expect(html).not.toContain('<p></p>')
  })

  it('支持琅嬛中文段首缩进标记', () => {
    const html = renderMarkdownToHtml('：： 这是需要首行缩进的正文。\n\n：：：： 这行缩进四格。')
    expect(html).toContain('<p>　　这是需要首行缩进的正文。</p>')
    expect(html).toContain('<p>　　　　这行缩进四格。</p>')
  })

  it('琅嬛中文段首缩进标记必须带空格且最多支持五组', () => {
    const html = renderMarkdownToHtml('：：不该缩进\n\n：：：：：：：：：： 最大缩进\n\n：：：：：：：：：：：： 不支持六组')
    expect(html).toContain('<p>：：不该缩进</p>')
    expect(html).toContain('<p>　　　　　　　　　　最大缩进</p>')
    expect(html).toContain('<p>：：：：：：：：：：：： 不支持六组</p>')
  })

  it('琅嬛中文缩进标记后接列表时保留列表语义', () => {
    const html = renderMarkdownToHtml('：： - 人类的司能包括：颅能、锁胛能、脊能、心能、肺能、盆能\n：：：： 1. 第一条')
    expect(html).toContain('<ul style="margin-left: 2em;">')
    expect(html).toContain('<li>人类的司能包括：颅能、锁胛能、脊能、心能、肺能、盆能</li>')
    expect(html).toContain('<ol style="margin-left: 4em;">')
    expect(html).toContain('<li>第一条</li>')
  })

  it('不在代码围栏内转换琅嬛中文段首缩进标记', () => {
    const html = renderMarkdownToHtml('```md\n：： 这是示例文本\n```')
    expect(html).toContain('：： 这是示例文本')
    expect(html).not.toContain('　　这是示例文本')
  })

  it('默认转义 HTML 标签', () => {
    const html = renderMarkdownToHtml('<script>alert(1)</script>\n\n<a href="https://example.com">链接</a>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;a href=&quot;https://example.com&quot;&gt;链接&lt;/a&gt;')
  })

  it('不会放行事件属性和 javascript 链接', () => {
    const html = renderMarkdownToHtml([
      '<img src=x onerror=alert(1)>',
      '[坏链接](javascript:alert(1))',
      '[正常链接](https://example.com)'
    ].join('\n\n'))

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:alert(1)"')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">正常链接</a>')
  })

  it('Tab 快捷缩进会增减琅嬛中文缩进标记', () => {
    const first = applyLanghuanMarkdownIndentShortcut('正文', 0, 0)
    expect(first.value).toBe('：： 正文')

    const second = applyLanghuanMarkdownIndentShortcut(first.value, 0, first.value.length)
    expect(second.value).toBe('：：：： 正文')

    const back = applyLanghuanMarkdownIndentShortcut(second.value, 0, second.value.length, true)
    expect(back.value).toBe('：： 正文')

    const plain = applyLanghuanMarkdownIndentShortcut(back.value, 0, back.value.length, true)
    expect(plain.value).toBe('正文')
  })

  it('Tab 快捷缩进支持多行并限制最多五组', () => {
    const maxIndent = '：：：：：：：：：： 正文'
    const result = applyLanghuanMarkdownIndentShortcut(`${maxIndent}\n- 条目`, 0, `${maxIndent}\n- 条目`.length)
    expect(result.value).toBe('：：：：：：：：：： 正文\n：： - 条目')
  })
})
