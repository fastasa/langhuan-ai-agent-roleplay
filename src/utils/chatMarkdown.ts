import { normalizeThinkDisplayText } from './aiOutput'
import { renderMarkdownToHtml } from './markdown'

const chatStyleTokenPattern = /\uE000LH_CHAT_STYLE_(\d+)\uE000/g
const CHAT_STYLE_TOKEN_PREFIX = '\uE000LH_CHAT_STYLE_'
const CHAT_STYLE_TOKEN_SUFFIX = '\uE000'
const MAX_STYLE_CONTENT_LENGTH = 1600
const orphanPunctuationLinePattern = /^[\s"'“”‘’「」『』《》〈〉（）()［\][\]【】{}｛｝、，,。.!！?？;；:：…]+$/
const meaningfulPunctuationPattern = /[、，,。.!！?？;；:：…）」』】）\]\}]/
const trailingStylePunctuationPattern = /^[\s]*[、，,。.!！?？;；:：…]+["'“”‘’」』）】\]\}]*/

type ChatStyleKind = 'action' | 'bracket-round' | 'bracket-square' | 'bracket-square-double' | 'bracket-curly'

type ChatStyleToken = {
  kind: ChatStyleKind
  text: string
}

type ChatDelimiterRule = {
  open: string
  close: string
  kind: ChatStyleKind
  stripDelimiters?: boolean
}

const chatDelimiterRules: ChatDelimiterRule[] = [
  { open: '$', close: '$', kind: 'action', stripDelimiters: true },
  { open: '*', close: '*', kind: 'action', stripDelimiters: true },
  { open: '(', close: ')', kind: 'bracket-round', stripDelimiters: false },
  { open: '（', close: '）', kind: 'bracket-round', stripDelimiters: false },
  { open: '[', close: ']', kind: 'bracket-square', stripDelimiters: true },
  { open: '［', close: '］', kind: 'bracket-square', stripDelimiters: true },
  // 双层方括号（内心独白 / 用户私密指令回显）：必须排在单层【】前，否则会被单层规则吃掉外层、露半个括号
  { open: '【【', close: '】】', kind: 'bracket-square-double', stripDelimiters: true },
  { open: '【', close: '】', kind: 'bracket-square', stripDelimiters: true },
  { open: '{', close: '}', kind: 'bracket-curly', stripDelimiters: true },
  { open: '｛', close: '｝', kind: 'bracket-curly', stripDelimiters: true }
]

function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderThinkBlock(content: string) {
  const raw = normalizeThinkDisplayText(content)
  const escapedRaw = escapeHtml(raw).replace(/\n/g, '<br>')
  return [
    '<div class="think-block">',
    '<div class="think-body">',
    `<div class="think-content think-content-preview">${escapedRaw}</div>`,
    '<button type="button" class="think-show-more"></button>',
    '</div>',
    '</div>'
  ].join('')
}

function readInlineCodeEnd(text: string, startIndex: number) {
  let tickCount = 0
  while (text[startIndex + tickCount] === '`') tickCount += 1
  if (tickCount <= 0) return startIndex

  const fence = '`'.repeat(tickCount)
  const closeIndex = text.indexOf(fence, startIndex + tickCount)
  return closeIndex >= 0 ? closeIndex + tickCount : startIndex + tickCount
}

function isAsteriskOpenBoundary(text: string, index: number) {
  const previousChar = index > 0 ? text[index - 1] : ''
  const nextChar = text[index + 1] || ''
  if (previousChar === '\\' || previousChar === '*') return false
  if (nextChar === '*' || /\s/.test(nextChar)) return false
  return true
}

function isAsteriskCloseBoundary(text: string, index: number) {
  const previousChar = index > 0 ? text[index - 1] : ''
  const nextChar = text[index + 1] || ''
  if (previousChar === '\\' || previousChar === '*' || /\s/.test(previousChar)) return false
  if (nextChar === '*') return false
  return true
}

function findDelimiterRule(text: string, index: number) {
  const rule = chatDelimiterRules.find((item) => text.startsWith(item.open, index)) || null
  if (!rule) return null
  if (rule.open === '*' && !isAsteriskOpenBoundary(text, index)) return null
  return rule
}

function isMarkdownLinkLike(text: string, rule: ChatDelimiterRule, startIndex: number, closeIndex: number) {
  if (rule.open !== '[') return false
  const previousChar = startIndex > 0 ? text[startIndex - 1] : ''
  if (previousChar === '!') return true

  const nextChar = text[closeIndex + rule.close.length] || ''
  return nextChar === '(' || nextChar === '['
}

function isRoundBracketExcluded(text: string, rule: ChatDelimiterRule, startIndex: number) {
  if (rule.kind !== 'bracket-round') return false
  const previousChar = startIndex > 0 ? text[startIndex - 1] : ''
  if (previousChar === ']') return true
  return /[A-Za-z0-9_]/.test(previousChar)
}

function isDelimiterCloseAt(text: string, index: number, rule: ChatDelimiterRule) {
  if (!text.startsWith(rule.close, index)) return false
  if (rule.close === '*' && !isAsteriskCloseBoundary(text, index)) return false
  return true
}

function findTokenClose(text: string, startIndex: number, rule: ChatDelimiterRule) {
  if (isRoundBracketExcluded(text, rule, startIndex)) return null

  let cursor = startIndex + rule.open.length

  while (cursor < text.length) {
    if (text[cursor] === '`') {
      cursor = readInlineCodeEnd(text, cursor)
      continue
    }
    if (isDelimiterCloseAt(text, cursor, rule)) {
      const content = text.slice(startIndex + rule.open.length, cursor)
      if (!content.trim()) return { index: cursor, valid: false }
      if (content.length > MAX_STYLE_CONTENT_LENGTH) return { index: cursor, valid: false }
      if (/\n\s*\n/.test(content)) return { index: cursor, valid: false }
      if (isMarkdownLinkLike(text, rule, startIndex, cursor)) return { index: cursor, valid: false }
      return { index: cursor, valid: true }
    }
    if (cursor - startIndex > MAX_STYLE_CONTENT_LENGTH) {
      const nextCloseIndex = text.indexOf(rule.close, cursor)
      return nextCloseIndex >= 0 ? { index: nextCloseIndex, valid: false } : null
    }
    cursor += 1
  }

  return null
}

function readTrailingStylePunctuation(text: string, startIndex: number) {
  const tail = text.slice(startIndex)
  const match = tail.match(trailingStylePunctuationPattern)
  if (!match) return { text: '', nextIndex: startIndex }
  return {
    text: match[0].trimStart(),
    nextIndex: startIndex + match[0].length
  }
}

function tokenizeTextStyles(text: string, tokens: ChatStyleToken[]) {
  let result = ''
  let cursor = 0

  while (cursor < text.length) {
    const rule = findDelimiterRule(text, cursor)
    if (text[cursor] === '`') {
      const inlineCodeEnd = readInlineCodeEnd(text, cursor)
      result += text.slice(cursor, inlineCodeEnd)
      cursor = inlineCodeEnd
      continue
    }
    if (!rule) {
      result += text[cursor]
      cursor += 1
      continue
    }

    const close = findTokenClose(text, cursor, rule)
    if (!close) {
      result += rule.open
      cursor += rule.open.length
      continue
    }
    if (!close.valid) {
      result += text.slice(cursor, close.index + rule.close.length)
      cursor = close.index + rule.close.length
      continue
    }

    const tokenEndIndex = close.index + rule.close.length
    const trailingPunctuation = readTrailingStylePunctuation(text, tokenEndIndex)
    const rawText = text.slice(cursor, tokenEndIndex)
    const contentText = text.slice(cursor + rule.open.length, close.index)
    tokens.push({
      kind: rule.kind,
      text: `${rule.stripDelimiters ? contentText : rawText}${trailingPunctuation.text}`
    })
    result += `${CHAT_STYLE_TOKEN_PREFIX}${tokens.length - 1}${CHAT_STYLE_TOKEN_SUFFIX}`
    cursor = trailingPunctuation.nextIndex
  }

  return result
}

function tokenizeChatStyles(text: string) {
  const tokens: ChatStyleToken[] = []
  const lines = normalizeOrphanPunctuationLines(String(text || '').replace(/\r\n/g, '\n')).split('\n')
  const output: string[] = []
  let buffer: string[] = []
  let inFence = false

  const flushBuffer = () => {
    if (!buffer.length) return
    output.push(tokenizeTextStyles(buffer.join('\n'), tokens))
    buffer = []
  }

  lines.forEach((line) => {
    if (/^\s*```/.test(line)) {
      flushBuffer()
      inFence = !inFence
      output.push(line)
      return
    }
    if (inFence) {
      output.push(line)
      return
    }
    buffer.push(line)
  })
  flushBuffer()

  return { markdown: output.join('\n'), tokens }
}

function isOrphanPunctuationLine(line: string) {
  const normalized = String(line || '').trim()
  if (!normalized) return false
  return orphanPunctuationLinePattern.test(normalized) && meaningfulPunctuationPattern.test(normalized)
}

function normalizeOrphanPunctuationLines(text: string) {
  const lines = String(text || '').split('\n')
  const output: string[] = []
  let pendingBlankLines = 0
  let inFence = false

  const flushBlankLines = () => {
    while (pendingBlankLines > 0) {
      output.push('')
      pendingBlankLines -= 1
    }
  }

  const findPreviousVisibleLineIndex = () => {
    for (let index = output.length - 1; index >= 0; index -= 1) {
      if (String(output[index] || '').trim()) return index
    }
    return -1
  }

  lines.forEach((line) => {
    if (/^\s*```/.test(line)) {
      flushBlankLines()
      inFence = !inFence
      output.push(line)
      return
    }
    if (inFence) {
      output.push(line)
      return
    }
    if (!line.trim()) {
      pendingBlankLines += 1
      return
    }
    if (isOrphanPunctuationLine(line)) {
      const previousIndex = findPreviousVisibleLineIndex()
      if (previousIndex >= 0) {
        output[previousIndex] = `${output[previousIndex].replace(/\s+$/, '')}${line.trim()}`
        pendingBlankLines = 0
        return
      }
    }
    flushBlankLines()
    output.push(line)
  })
  flushBlankLines()

  return output.join('\n')
}

function renderTokenText(text: string) {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

function renderVisibleChatMarkdown(text: string) {
  const { markdown, tokens } = tokenizeChatStyles(text)

  return renderMarkdownToHtml(markdown).replace(chatStyleTokenPattern, (_match, index: string) => {
    const token = tokens[Number(index)]
    if (!token) return ''
    return `<span class="chat-style-segment ${token.kind}">${renderTokenText(token.text)}</span>`
  })
}

/**
 * 提调精修光带哨兵——与样式哨兵（U+E000 系）不冲突，专用于「把被改片段(oldText)包成 .tidiao-pe-shimmer」。
 * 注入在 markdown 渲染之前（哨兵是私有区字符，不会被 markdown 当语法、也不会被 escapeHtml 改写），
 * 渲染后再把哨兵换成 span 标签——这样片段即便落在 *动作* / 【强调】 等样式段内也能正确嵌套高亮。
 */
const PRECISION_SHIMMER_START = String.fromCharCode(0xe010)
const PRECISION_SHIMMER_END = String.fromCharCode(0xe011)

export interface PrecisionShimmerRenderResult {
  html: string
  /** 命中并注入哨兵的片段数（0 = 全部没定位到，调用方据此整条退化高亮）。 */
  matchedCount: number
  /** 是否所有传入片段都定位成功。 */
  matchedAll: boolean
}

/**
 * 按片段在原文里首次出现的位置注入精修光带哨兵，再渲染 markdown，最后把哨兵换成 shimmer span。
 * - 含空行（跨段落）的片段不内联注入（会跨 <p> 破坏结构），按未命中处理，交由整条退化高亮兜底。
 * - 同一片段出现多次只高亮第一处；多个片段互不重叠时分别注入。
 */
export function renderChatMarkdownWithPrecisionShimmer(
  text: string,
  segments: ReadonlyArray<string>
): PrecisionShimmerRenderResult {
  const raw = String(text || '')
  const cleanSegments = (Array.isArray(segments) ? segments : [])
    .map((segment) => String(segment || ''))
    .filter((segment) => segment.length > 0)
  if (!raw || !cleanSegments.length) {
    return { html: renderChatMarkdownToHtml(raw), matchedCount: 0, matchedAll: false }
  }
  let injected = raw
  let matchedCount = 0
  for (const segment of cleanSegments) {
    if (/\n\s*\n/.test(segment)) continue
    const index = injected.indexOf(segment)
    if (index < 0) continue
    injected =
      injected.slice(0, index) +
      PRECISION_SHIMMER_START +
      segment +
      PRECISION_SHIMMER_END +
      injected.slice(index + segment.length)
    matchedCount += 1
  }
  if (matchedCount === 0) {
    return { html: renderChatMarkdownToHtml(raw), matchedCount: 0, matchedAll: false }
  }
  // 哨兵注入变体（injected 含本轮动态 segments）不走渲染缓存——见 renderChatMarkdownToHtml 头注释「精修光带路径」。
  const html = renderChatMarkdownToHtmlUncached(injected)
    .split(PRECISION_SHIMMER_START).join('<span class="tidiao-pe-shimmer">')
    .split(PRECISION_SHIMMER_END).join('</span>')
  return { html, matchedCount, matchedAll: matchedCount === cleanSegments.length }
}

function renderChatMarkdownToHtmlUncached(text: string) {
  if (!text) return ''

  const withoutAffection = String(text || '').replace(/<affection>[\s\S]*?<\/affection>/gi, '')
  const parts: string[] = []
  let cursor = 0
  const thinkBlockPattern = /<think>([\s\S]*?)<\/think>/gi

  for (const match of withoutAffection.matchAll(thinkBlockPattern)) {
    const index = match.index ?? 0
    const visibleText = withoutAffection.slice(cursor, index)
    if (visibleText) parts.push(renderVisibleChatMarkdown(visibleText))
    parts.push(renderThinkBlock(match[1] || ''))
    cursor = index + match[0].length
  }

  const tail = withoutAffection.slice(cursor)
  if (tail) parts.push(renderVisibleChatMarkdown(tail))

  return parts.join('')
}

// 渲染结果 LRU 缓存（2026-07-11）：renderChatMarkdownToHtml 当前签名只有 text、无 options，输出是 text 的纯函数，
// 故 key = text 原文本身即可（无需再拼别的字段）。容量约 400，超容按最久未用（LRU）淘汰——Map 天然保留插入序，
// 命中时 delete+set 把该键提到"最近使用"端，插入序最前的即最久未用，超容时淘汰它即可。
// 消息列表流式输出时同一段文本常被模板重复调用 2-3 次、逐字符增量重解析成本高，这层缓存单点收益桌面/移动两端调用方。
const CHAT_MARKDOWN_RENDER_CACHE_CAPACITY = 400
const chatMarkdownRenderCache = new Map<string, string>()

function getCachedChatMarkdownHtml(key: string): string | undefined {
  if (!chatMarkdownRenderCache.has(key)) return undefined
  const value = chatMarkdownRenderCache.get(key) as string
  chatMarkdownRenderCache.delete(key)
  chatMarkdownRenderCache.set(key, value)
  return value
}

function setCachedChatMarkdownHtml(key: string, value: string): void {
  if (chatMarkdownRenderCache.has(key)) chatMarkdownRenderCache.delete(key)
  chatMarkdownRenderCache.set(key, value)
  if (chatMarkdownRenderCache.size > CHAT_MARKDOWN_RENDER_CACHE_CAPACITY) {
    const oldestKey = chatMarkdownRenderCache.keys().next().value
    if (oldestKey !== undefined) chatMarkdownRenderCache.delete(oldestKey)
  }
}

/**
 * 聊天正文 markdown 渲染入口（带 LRU 缓存·2026-07-11）。
 * 精修光带路径（renderChatMarkdownWithPrecisionShimmer 的哨兵注入变体 renderChatMarkdownToHtmlUncached(injected)）
 * 不经过这层缓存——那条路每次 segments 不同、injected 文本是一次性拼出来的哨兵串，缓存了也几乎不会再命中，
 * 只会挤占/淘汰真正可复用的消息级缓存条目（同一条消息在列表模板里被重复调用 2-3 次、流式输出反复重渲才是本缓存要收益的场景）。
 */
export function renderChatMarkdownToHtml(text: string) {
  const key = String(text || '')
  if (!key) return ''
  const cached = getCachedChatMarkdownHtml(key)
  if (cached !== undefined) return cached
  const html = renderChatMarkdownToHtmlUncached(key)
  setCachedChatMarkdownHtml(key, html)
  return html
}
