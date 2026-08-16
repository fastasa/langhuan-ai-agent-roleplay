// 用户私密提调指令（director directive）
//
// 用户在聊天输入框用双层方括号 【【…】】 包裹的内容，是只给提调（导演/编排器）看的私密指令，
// 必须从一切对用户、角色可见的产出里根除——消息正文、消息投影、旁白正文、角色台词、总结都拿不到它，
// 只允许注入提调上下文。这里是「在真值层抠掉」的唯一纯函数入口，发送链路在 parseChatInputRoute 之前调用。
//
// 配对铁律：严格成对的 【【 … 】】 才识别为指令；落单的 【…】、半截的 【【（没有对应 】】）一律当普通文字
// 原样保留，绝不误吞用户正常打的字。双层标记在正常聊天里几乎不会出现，以此把误判率压到极低。

const DIRECTIVE_OPEN = '【【'
const DIRECTIVE_CLOSE = '】】'

export interface DirectorDirectiveExtraction {
  // 剥离掉全部私密指令后的干净文本，发送链路全程只用它
  cleanText: string
  // 抠出来的私密指令，按出现顺序；只注入提调上下文
  directives: string[]
}

export function extractDirectorDirectives(input: unknown): DirectorDirectiveExtraction {
  const text = String(input ?? '')
  // 没有左标记直接短路，正常消息零改动
  if (!text.includes(DIRECTIVE_OPEN)) {
    return { cleanText: text, directives: [] }
  }

  const directives: string[] = []
  let cleanText = ''
  let cursor = 0

  while (cursor < text.length) {
    const open = text.indexOf(DIRECTIVE_OPEN, cursor)
    if (open === -1) {
      // 后面再没有左标记，剩下全是普通文字
      cleanText += text.slice(cursor)
      break
    }
    const close = text.indexOf(DIRECTIVE_CLOSE, open + DIRECTIVE_OPEN.length)
    if (close === -1) {
      // 有左标记但没有配对的右标记 → 半截，从 cursor 起原样保留，不再继续抠
      cleanText += text.slice(cursor)
      break
    }
    // 左标记之前的普通文字照常保留
    cleanText += text.slice(cursor, open)
    const inner = text.slice(open + DIRECTIVE_OPEN.length, close).trim()
    if (inner) directives.push(inner)
    cursor = close + DIRECTIVE_CLOSE.length
  }

  return { cleanText, directives }
}

export interface DirectiveAutoCloseResult {
  // 处理后的输入框文本
  value: string
  // 处理后的光标位置
  caret: number
  // 是否发生了自动补全（true 时调用方需把 value/caret 写回 textarea）
  changed: boolean
}

// 输入框自动补全：用户刚打出第二个【凑成「【【」且光标紧贴其后、其后又没有现成的「】】」时，
// 自动补上「】】」并把光标留在中间，得到 【【|】】。仅在「插入类输入」时调用（删除时不触发，
// 否则删不掉空指令）。配对铁律下双层标记几乎不会误触，正常单层【】不受影响。
export function maybeAutoCloseDirectiveBracket(value: unknown, caret: number): DirectiveAutoCloseResult {
  const text = String(value ?? '')
  const pos = Math.max(0, Math.min(Number(caret) || 0, text.length))
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  // 光标前不是以「【【」结尾，或后面已经紧跟「】】」，都不补
  if (!before.endsWith(DIRECTIVE_OPEN) || after.startsWith(DIRECTIVE_CLOSE)) {
    return { value: text, caret: pos, changed: false }
  }
  return { value: before + DIRECTIVE_CLOSE + after, caret: pos, changed: true }
}
