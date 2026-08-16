export type NarrationDebugPrefix =
  | '总结对话'
  | '角色地点安排'
  | '用户输入环境'
  | '场景转换'
  | '旁白触发评分'

export function formatNarrationDebugLine(prefix: NarrationDebugPrefix | string, body: string) {
  const safePrefix = String(prefix || '调试').trim() || '调试'
  const safeBody = String(body || '').trim()
  return `【${safePrefix}】${safeBody}`
}

export function formatNarrationDebugBlock(prefix: NarrationDebugPrefix | string, lines: string[]) {
  const normalizedLines = lines.map((line) => String(line || '').trim()).filter(Boolean)
  if (!normalizedLines.length) return formatNarrationDebugLine(prefix, '')
  return [
    formatNarrationDebugLine(prefix, normalizedLines[0]),
    ...normalizedLines.slice(1)
  ].join('\n')
}
