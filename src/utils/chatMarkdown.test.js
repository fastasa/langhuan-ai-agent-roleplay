import { describe, expect, it } from 'vitest'
import { renderChatMarkdownToHtml, renderChatMarkdownWithPrecisionShimmer } from './chatMarkdown'

describe('renderChatMarkdownToHtml', () => {
  it('渲染聊天消息里的 Markdown 表格', () => {
    const html = renderChatMarkdownToHtml([
      '| 名称 | 数量 |',
      '| --- | ---: |',
      '| 铜币 | 12 |'
    ].join('\n'))

    expect(html).toContain('<table>')
    expect(html).toContain('<th>名称</th>')
    expect(html).toContain('<td style="text-align:right">12</td>')
  })

  it('转义 HTML 并拦截 javascript 链接', () => {
    const html = renderChatMarkdownToHtml([
      '<img src=x onerror=alert(1)>',
      '[坏链接](javascript:alert(1))',
      '[好链接](https://example.com)'
    ].join('\n\n'))

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('href="javascript:alert(1)"')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">好链接</a>')
  })

  it('保留聊天动作标记并把思考块拆成独立预览', () => {
    const html = renderChatMarkdownToHtml('$抬头$ **确认**<think>内部判断\n第二行</think>')

    expect(html).toContain('<span class="chat-style-segment action">抬头</span>')
    expect(html).toContain('<strong>确认</strong>')
    expect(html).toContain('class="think-block"')
    expect(html).toContain('内部判断<br>第二行')
  })

  it('把单星号包裹的聊天动作渲染成动作片段', () => {
    const html = renderChatMarkdownToHtml('*松开怀抱* 不好意思。')

    expect(html).toContain('<span class="chat-style-segment action">松开怀抱</span>')
    expect(html).not.toContain('*松开怀抱*')
    expect(html).toContain('不好意思。')
  })

  it('单星号动作不破坏加粗、列表和代码里的星号', () => {
    const html = renderChatMarkdownToHtml([
      '**加粗强调**',
      '',
      '* 列表项',
      '',
      '`*代码动作*`',
      '',
      '*真实动作*'
    ].join('\n'))

    expect(html).toContain('<strong>加粗强调</strong>')
    expect(html).toContain('<li>列表项</li>')
    expect(html).toContain('<code>*代码动作*</code>')
    expect(html).toContain('<span class="chat-style-segment action">真实动作</span>')
  })

  it('渲染中英文小括号、中括号和大括号的颜色标记（圆括号保留括号符号本身）', () => {
    const html = renderChatMarkdownToHtml('(心理)（神态）[标签]【强调】{状态}｛变量｝')

    expect(html).toContain('<span class="chat-style-segment bracket-round">(心理)</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-round">（神态）</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-square">标签</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-square">强调</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-curly">状态</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-curly">变量</span>')
  })

  it('允许聊天动作标记跨普通换行', () => {
    const html = renderChatMarkdownToHtml('$第一句动作。\n第二句动作。$\n\n正文')

    expect(html).toContain('<span class="chat-style-segment action">第一句动作。<br>第二句动作。</span>')
    expect(html).not.toContain('$第一句动作')
    expect(html).toContain('<p>正文</p>')
  })

  it('动作标记遇到空行或缺少闭合时保留原文', () => {
    const blankLineHtml = renderChatMarkdownToHtml('$第一段\n\n第二段$')
    const unclosedHtml = renderChatMarkdownToHtml('$没有闭合')
    const mixedHtml = renderChatMarkdownToHtml('$第一段\n\n第二段$ 这不是动作 $真实动作$')

    expect(blankLineHtml).toContain('$第一段')
    expect(blankLineHtml).toContain('第二段$')
    expect(blankLineHtml).not.toContain('class="action"')
    expect(unclosedHtml).toContain('$没有闭合')
    expect(unclosedHtml).not.toContain('class="action"')
    expect(mixedHtml).toContain('$第一段')
    expect(mixedHtml).toContain('第二段$')
    expect(mixedHtml).toContain('<span class="chat-style-segment action">真实动作</span>')
    expect(mixedHtml.match(/class="chat-style-segment action"/g)).toHaveLength(1)
  })

  it('不在代码块和行内代码中解析动作标记', () => {
    const html = renderChatMarkdownToHtml([
      '`$行内代码$ (代码) [代码] {代码}`',
      '',
      '```md',
      '$代码块$ (代码块) [代码块] {代码块}',
      '```',
      '',
      '$真实动作$ (真实括号)'
    ].join('\n'))

    expect(html).toContain('<code>$行内代码$ (代码) [代码] {代码}</code>')
    expect(html).toContain('$代码块$')
    expect(html).toContain('(代码块) [代码块] {代码块}')
    expect(html).toContain('<span class="chat-style-segment action">真实动作</span>')
    expect(html).toContain('<span class="chat-style-segment bracket-round">(真实括号)</span>')
    expect(html.match(/class="chat-style-segment action"/g)).toHaveLength(1)
    expect(html.match(/class="chat-style-segment bracket-/g)).toHaveLength(1)
  })

  it('中括号颜色标记不破坏 Markdown 链接和图片', () => {
    const html = renderChatMarkdownToHtml([
      '[普通中括号]',
      '[好链接](https://example.com)',
      '![图片](https://example.com/a.png)'
    ].join('\n\n'))

    expect(html).toContain('<span class="chat-style-segment bracket-square">普通中括号</span>')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">好链接</a>')
    expect(html).toContain('<img src="https://example.com/a.png" alt="图片">')
    expect(html).not.toContain('<span class="bracket-square">[好链接]</span>')
    expect(html).not.toContain('<span class="bracket-square">[图片]</span>')
  })

  it('隐藏美化提示符号并保留样式片段（圆括号本身随原文全角/半角保留显示）', () => {
    const html = renderChatMarkdownToHtml('前文 $动作$ 后文（括注）')

    expect(html).toContain('前文 <span class="chat-style-segment action">动作</span> 后文')
    expect(html).toContain('<span class="chat-style-segment bracket-round">（括注）</span>')
  })

  it('把单独成段的标点贴回前一个可见段', () => {
    const html = renderChatMarkdownToHtml([
      '$轻轻将脸颊边的碎发拢到耳后$',
      '',
      '(你好呀)',
      '',
      '。',
      '',
      '请问有什么事情要找我吗？'
    ].join('\n'))

    expect(html).toContain('<span class="chat-style-segment bracket-round">(你好呀)。</span></p>')
    expect(html).not.toContain('<p>。</p>')
    expect(html).toContain('<p>请问有什么事情要找我吗？</p>')
  })

  it('把紧跟美化片段的标点收进片段，避免分行后标点独占一行（圆括号符号本身保留在片段内）', () => {
    const html = renderChatMarkdownToHtml('안녕하세요 (你好呀)。 $双手礼貌地交叠在身前$，请问有什么事情要找我吗？')

    expect(html).toContain('안녕하세요 <span class="chat-style-segment bracket-round">(你好呀)。</span>')
    expect(html).toContain('<span class="chat-style-segment action">双手礼貌地交叠在身前，</span>请问有什么事情要找我吗？')
    expect(html).not.toContain('$双手礼貌地交叠在身前$')
  })

  it('不改写代码块里的单独标点', () => {
    const html = renderChatMarkdownToHtml([
      '正文',
      '',
      '```txt',
      '。',
      '```'
    ].join('\n'))

    expect(html).toContain('<p>正文</p>')
    expect(html).toContain('<pre><code class="language-txt">。\n</code></pre>')
  })

  it('LRU 渲染缓存（2026-07-11）：同一段文本重复渲染，结果保持一致', () => {
    const text = '$抬头$ **确认**这是一段用于验证缓存复用是否改变输出的正文。'
    const first = renderChatMarkdownToHtml(text)
    const second = renderChatMarkdownToHtml(text)

    expect(second).toBe(first)
    expect(second).toContain('<span class="chat-style-segment action">抬头</span>')
  })

  it('LRU 渲染缓存：不同输入各自返回正确结果，不会因为共用缓存而串台', () => {
    const htmlA1 = renderChatMarkdownToHtml('$甲动作$ 甲文本')
    const htmlB = renderChatMarkdownToHtml('$乙动作$ 乙文本')
    const htmlA2 = renderChatMarkdownToHtml('$甲动作$ 甲文本')

    expect(htmlA2).toBe(htmlA1)
    expect(htmlA2).toContain('甲动作')
    expect(htmlA2).not.toContain('乙动作')
    expect(htmlB).toContain('乙动作')
    expect(htmlB).not.toContain('甲动作')
  })

  it('精修光带路径不进渲染缓存：同一段正文的精修高亮渲染，不会污染该文本此后的普通渲染结果', () => {
    const text = '窗外月色清冷，她轻声说了一句晚安。'
    const plainBefore = renderChatMarkdownToHtml(text)
    const shimmer = renderChatMarkdownWithPrecisionShimmer(text, ['月色清冷'])

    expect(shimmer.matchedCount).toBe(1)
    expect(shimmer.html).toContain('<span class="tidiao-pe-shimmer">月色清冷</span>')

    const plainAfter = renderChatMarkdownToHtml(text)
    expect(plainAfter).toBe(plainBefore)
    expect(plainAfter).not.toContain('tidiao-pe-shimmer')
  })
})
