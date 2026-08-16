const THINK_BLOCK_REGEX = /<think>([\s\S]*?)<\/think>/gi

function normalizeTextSpacing(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeThinkDisplayText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function extractThinkSegments(text: string, treatRemainderAsThinking = false): { blocks: string[]; remainder: string } {
  const source = String(text || '')
  const blocks: string[] = []

  source.replace(THINK_BLOCK_REGEX, (_full, content: string) => {
    const block = String(content || '').trim()
    if (block) blocks.push(block)
    return ''
  })

  const remainder = normalizeTextSpacing(source.replace(THINK_BLOCK_REGEX, '\n'))
  if (treatRemainderAsThinking && remainder) {
    blocks.unshift(remainder)
    return { blocks, remainder: '' }
  }

  return { blocks, remainder }
}

export function extractAiThoughtBlocks(text: string): string[] {
  return extractThinkSegments(text, false).blocks.map(normalizeThinkDisplayText).filter(Boolean)
}

function dedupeThinkBlocks(blocks: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const block of blocks.map((item) => String(item || '').trim()).filter(Boolean)) {
    const key = block.replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(block)
  }

  return result
}

export function normalizeAiOutput(reasoningText: string, contentText: string): string {
  const reasoningResult = extractThinkSegments(reasoningText, true)
  const contentResult = extractThinkSegments(contentText, false)
  const normalizedBlocks = dedupeThinkBlocks([
    ...reasoningResult.blocks,
    ...contentResult.blocks
  ])

  const finalReasoning = normalizedBlocks.join('\n\n').trim()
  const finalContent = contentResult.remainder.trim()

  if (finalReasoning && finalContent) {
    return `<think>${finalReasoning}</think>\n${finalContent}`
  }
  if (finalReasoning) {
    return `<think>${finalReasoning}</think>`
  }
  return finalContent
}

export function normalizeAiOutputText(text: string): string {
  return normalizeAiOutput('', text)
}

export function stripAiThoughtContent(text: string): string {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/【思考过程】[\s\S]*?(?=【回复】|$)/g, '')
    .replace(/【回复】/g, '')
    .trim()
}

// content 放宽为 unknown（批2·输入框图片上传）：assistant 回复恒为纯字符串，正常处理；
// 非字符串（理论上不会发生在 assistant 轮，只为兼容 AIMessage.content 联合类型的调用点）原样透传不处理。
export function stripAiThoughtContentForRequest<T extends { role?: string; content?: unknown }>(message: T): T {
  if (message?.role !== 'assistant') return message
  if (typeof message.content !== 'string') return message
  return {
    ...message,
    content: stripAiThoughtContent(message.content)
  }
}

export function hasVisibleAiReplyBody(text: string): boolean {
  return Boolean(stripAiThoughtContent(text))
}
