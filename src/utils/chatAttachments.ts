// 图片附件真值 = chat_messages.attachments_json；本文件是所有 prompt 文字注入（单聊/提调/星依）
// 唯一的格式化落点，其它调用方一律通过 parseChatAttachments/formatAttachmentNote 读取，不直接解析该列。
export interface ChatImageAttachment {
  id: string
  kind: 'image'
  url: string
  mime: string
  width?: number
  height?: number
  size?: number
  originalName?: string
  caption?: string
  captionStatus?: 'pending' | 'done' | 'failed'
}

/**
 * AI 消息内容分片（批2·输入框图片上传·双通道 A）：OpenAI 兼容 content parts 格式。
 * `AIMessage.content`（useAI.ts）/`AiChatMessage.content`（aiRepository.ts）从纯 string 升级为
 * `string | AIContentPart[]` 联合，单点导出在此，两处按需 import 复用，不各自重复声明。
 */
export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/**
 * content parts 数组 → 纯文本（合并 text part，image part 用占位替代）。
 * 供一切仍按字符串处理 content 的旧逻辑（拼接/trim/日志）兜底，避免数组 content 直接走进
 * 字符串操作产出 "[object Object]" 或类型报错。字符串 content 原样返回。
 */
export function contentToText(content: string | AIContentPart[] | null | undefined): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (part?.type === 'text' ? String(part.text || '') : part?.type === 'image_url' ? '[图片]' : ''))
    .join('')
}

function isChatImageAttachment(value: unknown): value is ChatImageAttachment {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && item.id.length > 0
    && item.kind === 'image'
    && typeof item.url === 'string' && item.url.length > 0
    && typeof item.mime === 'string'
}

/** 容错解析 attachments_json：接受原始字符串、已被上游（如 toCamel）JSON.parse 过的数组、或 null/undefined。 */
export function parseChatAttachments(raw: unknown): ChatImageAttachment[] {
  if (Array.isArray(raw)) {
    return raw.filter(isChatImageAttachment)
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isChatImageAttachment) : []
  } catch {
    return []
  }
}

export function serializeChatAttachments(list: ChatImageAttachment[]): string {
  return JSON.stringify(Array.isArray(list) ? list : [])
}

/**
 * 从「一条聊天消息对象」（形状随来源浮动）里读取附件列表——批4接线时踩的真坑，写清楚防重踩：
 * - 服务端 GET 消息列表/历史一律经 `toCamel`（server/application/shared/dbUtils.ts）转换：
 *   DB 列名 `attachments_json` → 驼峰键 **`attachmentsJson`**，且值已被 toCamel 自动 `JSON.parse`
 *   （字符串以 `[`/`{` 开头就解析）成数组——这是消息历史/刷新后回看的**主路径**，键名不是 attachments_json。
 * - 前端本地乐观回显（刚发出、还没刷新）：`MessagePayload.attachments`（useChatSendPipeline.ts::addUserMessage）
 *   直接是数组，键名叫 **`attachments`**（不带 Json 后缀，没走 toCamel）。
 * - `attachments_json`（下划线原名、字符串）理论上客户端不会真的见到（server 层已用 toCamel 转掉），
 *   仅作兜底防御（如未来某处绕过 toCamel 直传原始行）。
 * 三种键名按上述优先级依次探测，统一交给 parseChatAttachments 解析成 ChatImageAttachment[]。
 */
export function readMessageAttachments(message: unknown): ChatImageAttachment[] {
  if (!message || typeof message !== 'object') return []
  const record = message as Record<string, unknown>
  return parseChatAttachments(record.attachmentsJson ?? record.attachments ?? record.attachments_json)
}

/**
 * 生成追加进消息正文的图片转述文字块，供非识图模型/历史轮回看使用。
 * caption 就绪则用 caption；没有 caption（用户 2026-07-11 拍板默认关闭图片转述，见
 * useImageAttachments.ts::IMAGE_CAPTION_ENABLED）则用中性占位 `[图片{序号}：{文件名}]`——
 * 这是「设计上不生成」不是「生成失败」，不再用「未能生成文字描述」这种误导性措辞；
 * 识图模型靠原生图/订阅桥 @路径直接看图，这段文字只是让不识图模型/历史轮知道「这里有张图、叫什么名」。
 * 空数组返回空字符串（不污染无图消息的 prompt）。
 */
export function formatAttachmentNote(list: ChatImageAttachment[]): string {
  const attachments = Array.isArray(list) ? list : []
  if (!attachments.length) return ''
  const lines = attachments.map((attachment, index) => {
    const order = index + 1
    const hasCaption = attachment.captionStatus === 'done' && typeof attachment.caption === 'string' && attachment.caption.trim()
    if (hasCaption) {
      return `[图片${order}：${attachment.caption!.trim()}]`
    }
    const name = attachment.originalName?.trim() || '图片'
    return `[图片${order}：${name}]`
  })
  return `\n${lines.join('\n')}`
}

/**
 * 通道A·当轮原生图（批4）：把消息数组中「当前轮用户输入」消息（约定=最后一条 role:'user' 的消息）
 * content 升级为 parts 数组——原文字先追加 formatAttachmentNote，再逐图追加 image_url part。
 * 找不到 user 消息或附件为空时原样返回原数组（引用不变，调用方可放心当无操作处理）。
 * 供 useAI.ts::callAI/callAIStream 统一调用（callAIWithTools/提调链路一律走 caption 文字，不经此函数）。
 */
export function upgradeCurrentUserMessageWithAttachments<T extends { role: string; content: string | AIContentPart[] }>(
  messages: T[],
  attachments: ChatImageAttachment[] | null | undefined
): T[] {
  const list = Array.isArray(attachments) ? attachments : []
  if (!Array.isArray(messages) || !messages.length || !list.length) return messages
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }
  if (lastUserIndex === -1) return messages
  const target = messages[lastUserIndex]
  const baseText = contentToText(target.content)
  const parts: AIContentPart[] = [
    { type: 'text', text: `${baseText}${formatAttachmentNote(list)}` },
    ...list.map((attachment): AIContentPart => ({ type: 'image_url', image_url: { url: attachment.url } }))
  ]
  const next = messages.slice()
  next[lastUserIndex] = { ...target, content: parts }
  return next
}
