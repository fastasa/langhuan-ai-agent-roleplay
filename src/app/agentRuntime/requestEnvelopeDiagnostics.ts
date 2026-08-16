export type RequestEnvelopeDiffSource =
  | 'cold_start'
  | 'model'
  | 'tools'
  | 'tool_schema'
  | 'tool_choice'
  | 'thinking'
  | 'system'
  | 'images'
  | 'messages'
  | 'none'

export type RequestEnvelopeDiagnostics = {
  activeToolNamesHash: string
  toolSchemaHash: string
  systemHash: string
  messagePrefixHash: string
  requestEnvelopeHash: string
  firstDiffSource: RequestEnvelopeDiffSource
}

type EnvelopeInput = {
  model: unknown
  tools: unknown[]
  toolChoice: unknown
  thinking: unknown
  messages: Array<{ role: string; content: unknown }>
  activeToolNames: string[]
}

type EnvelopeSnapshot = RequestEnvelopeDiagnostics & {
  modelHash: string
  toolNamesHash: string
  toolChoiceHash: string
  thinkingHash: string
  imagesHash: string
  messagesHash: string
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item))
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, stableValue(record[key])])
  )
}

export function stableEnvelopeStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

/** 本地诊断指纹，不是供应商 cache key，也不能冒充真实 cache hit。 */
export function hashRequestEnvelopePart(value: unknown): string {
  const text = stableEnvelopeStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function collectImageParts(messages: EnvelopeInput['messages']): unknown[] {
  const images: unknown[] = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) {
      const type = String((part as { type?: unknown })?.type || '')
      if (type.includes('image')) images.push(part)
    }
  }
  return images
}

function snapshotEnvelope(input: EnvelopeInput): EnvelopeSnapshot {
  const systemMessages = input.messages.filter((message) => message.role === 'system')
  // 提调 rebuild 的稳定前缀通常就是 system；普通 append-only 会话则额外保留最新消息之前的完整前缀。
  const messagePrefix = input.messages.length > 1 ? input.messages.slice(0, -1) : systemMessages
  const modelHash = hashRequestEnvelopePart(input.model)
  const toolNamesHash = hashRequestEnvelopePart(input.activeToolNames)
  const toolSchemaHash = hashRequestEnvelopePart(input.tools)
  const toolChoiceHash = hashRequestEnvelopePart(input.toolChoice)
  const thinkingHash = hashRequestEnvelopePart(input.thinking)
  const systemHash = hashRequestEnvelopePart(systemMessages)
  const imagesHash = hashRequestEnvelopePart(collectImageParts(input.messages))
  const messagesHash = hashRequestEnvelopePart(input.messages)
  return {
    activeToolNamesHash: toolNamesHash,
    toolSchemaHash,
    systemHash,
    messagePrefixHash: hashRequestEnvelopePart(messagePrefix),
    requestEnvelopeHash: hashRequestEnvelopePart({
      model: input.model,
      tools: input.tools,
      toolChoice: input.toolChoice,
      thinking: input.thinking,
      messages: input.messages
    }),
    firstDiffSource: 'cold_start',
    modelHash,
    toolNamesHash,
    toolChoiceHash,
    thinkingHash,
    imagesHash,
    messagesHash
  }
}

function resolveFirstDiff(previous: EnvelopeSnapshot, current: EnvelopeSnapshot): RequestEnvelopeDiffSource {
  if (previous.modelHash !== current.modelHash) return 'model'
  if (previous.toolNamesHash !== current.toolNamesHash) return 'tools'
  if (previous.toolSchemaHash !== current.toolSchemaHash) return 'tool_schema'
  if (previous.toolChoiceHash !== current.toolChoiceHash) return 'tool_choice'
  if (previous.thinkingHash !== current.thinkingHash) return 'thinking'
  if (previous.systemHash !== current.systemHash) return 'system'
  if (previous.imagesHash !== current.imagesHash) return 'images'
  if (previous.messagesHash !== current.messagesHash) return 'messages'
  return 'none'
}

/** 一个 tracker 只绑定一个 harness；因此 previous 不会串到别的 profile/会话。 */
export function createRequestEnvelopeDiagnosticTracker() {
  let previous: EnvelopeSnapshot | null = null
  return {
    capture(input: EnvelopeInput): RequestEnvelopeDiagnostics {
      const current = snapshotEnvelope(input)
      current.firstDiffSource = previous ? resolveFirstDiff(previous, current) : 'cold_start'
      previous = current
      return {
        activeToolNamesHash: current.activeToolNamesHash,
        toolSchemaHash: current.toolSchemaHash,
        systemHash: current.systemHash,
        messagePrefixHash: current.messagePrefixHash,
        requestEnvelopeHash: current.requestEnvelopeHash,
        firstDiffSource: current.firstDiffSource
      }
    }
  }
}
