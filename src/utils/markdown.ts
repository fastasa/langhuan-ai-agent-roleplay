import MarkdownIt from 'markdown-it'

const markdownRenderer = new MarkdownIt({
  html: false,
  breaks: false,
  linkify: false,
  typographer: false
})

const defaultLinkOpenRenderer = markdownRenderer.renderer.rules.link_open
const indentTokenPattern = /\uE000LH_INDENT_(\d)\uE000/g
const listIndentTokenPattern = /\uE000LH_LIST_INDENT_(\d)\uE000/g
const langhuanIndentLinePattern = /^((?:：：){1,5})[ \t　]+/

markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const targetIndex = token.attrIndex('target')
  if (targetIndex < 0) {
    token.attrPush(['target', '_blank'])
  } else {
    token.attrs![targetIndex][1] = '_blank'
  }

  const relIndex = token.attrIndex('rel')
  if (relIndex < 0) {
    token.attrPush(['rel', 'noreferrer'])
  } else {
    token.attrs![relIndex][1] = 'noreferrer'
  }

  return defaultLinkOpenRenderer
    ? defaultLinkOpenRenderer(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

function readListIndentLevel(tokens: any[], idx: number) {
  for (let cursor = idx + 1; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor]
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') break
    if (token.type === 'inline') {
      const match = String(token.content || '').match(/^\uE000LH_LIST_INDENT_(\d)\uE000/)
      return match ? Number(match[1]) : 0
    }
  }
  return 0
}

function renderListOpen(tokens: any[], idx: number, options: any, _env: any, self: any) {
  const token = tokens[idx]
  const level = readListIndentLevel(tokens, idx)
  if (level > 0) {
    const styleIndex = token.attrIndex('style')
    const value = `margin-left: ${level * 2}em;`
    if (styleIndex < 0) {
      token.attrPush(['style', value])
    } else {
      token.attrs![styleIndex][1] = `${token.attrs![styleIndex][1]}; ${value}`
    }
  }
  return self.renderToken(tokens, idx, options)
}

markdownRenderer.renderer.rules.bullet_list_open = renderListOpen
markdownRenderer.renderer.rules.ordered_list_open = renderListOpen

function getLanghuanIndent(line: string) {
  const match = line.match(/^((?:：：){1,5})[ \t　]+(.+)$/)
  if (!match) return null
  return {
    level: match[1].length / 2,
    content: match[2]
  }
}

function addLanghuanIndent(line: string) {
  const match = line.match(langhuanIndentLinePattern)
  if (!match) return `：： ${line}`
  const level = match[1].length / 2
  if (level >= 5) return line
  return `：：${line}`
}

function removeLanghuanIndent(line: string) {
  const match = line.match(langhuanIndentLinePattern)
  if (!match) return line
  const level = match[1].length / 2
  if (level <= 1) return line.slice(match[0].length)
  return line.slice(2)
}

export function applyLanghuanMarkdownIndentShortcut(value: string, start: number, end: number, outdent = false) {
  const text = String(value || '')
  const selectionStart = Math.max(0, Math.min(start, text.length))
  const selectionEnd = Math.max(selectionStart, Math.min(end, text.length))
  const lineStart = text.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
  let lineEnd = text.indexOf('\n', selectionEnd)
  if (lineEnd < 0) lineEnd = text.length
  if (selectionEnd > selectionStart && text[selectionEnd - 1] === '\n') {
    lineEnd = selectionEnd - 1
  }

  const before = text.slice(0, lineStart)
  const selectedBlock = text.slice(lineStart, lineEnd)
  const after = text.slice(lineEnd)
  const lines = selectedBlock.split('\n')
  let startDelta = 0
  let endDelta = 0

  const nextLines = lines.map((line, index) => {
    const nextLine = outdent ? removeLanghuanIndent(line) : addLanghuanIndent(line)
    const delta = nextLine.length - line.length
    if (index === 0) startDelta = delta
    endDelta += delta
    return nextLine
  })

  const nextValue = `${before}${nextLines.join('\n')}${after}`
  return {
    value: nextValue,
    selectionStart: Math.max(lineStart, selectionStart + startDelta),
    selectionEnd: Math.max(lineStart, selectionEnd + endDelta)
  }
}

function applyLanghuanMarkdownExtensions(markdown: string) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  let inFence = false

  return lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return line
    }

    if (inFence) return line
    const indent = getLanghuanIndent(line)
    if (!indent) return line

    const unorderedMatch = indent.content.match(/^([-*+])\s+(.+)$/)
    if (unorderedMatch) {
      return `  ${unorderedMatch[1]} \uE000LH_LIST_INDENT_${indent.level}\uE000${unorderedMatch[2]}`
    }

    const orderedMatch = indent.content.match(/^(\d+[.)])\s+(.+)$/)
    if (orderedMatch) {
      return `  ${orderedMatch[1]} \uE000LH_LIST_INDENT_${indent.level}\uE000${orderedMatch[2]}`
    }

    return `${'&#12288;'.repeat(indent.level * 2)}${indent.content}`
  }).join('\n')
}

export function renderMarkdownToHtml(markdown: string) {
  return markdownRenderer.render(applyLanghuanMarkdownExtensions(markdown))
    .replace(listIndentTokenPattern, '')
    .replace(indentTokenPattern, (_, level: string) => {
      return `<span style="display: inline-block; width: ${Number(level) * 2}em;"></span>`
    })
}
