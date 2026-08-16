import { createHash } from 'crypto'

export function shouldLogFullAiMessages(env: Record<string, string | undefined> = process.env) {
  return ['1', 'true', 'yes'].includes(String(env.AI_LOG_FULL_MESSAGES || '').toLowerCase())
}

export function stripThinkForAiLog(content: string) {
  return String(content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/【思考过程】[\s\S]*?(?=【回复】|$)/g, '')
    .replace(/【回复】/g, '')
    .trim()
}

export function formatAiMessageForFullLog(content: string) {
  const normalized = stripThinkForAiLog(content).replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  return lines.map((line, idx) => `    ${String(idx + 1).padStart(3, '0')} | ${line}`).join('\n')
}

export function normalizeAiSpeakerLine(msg: { role: string; content: string; name?: string }) {
  if (msg.role === 'system') return null
  const inferred = String(msg.content || '').match(/^\s*([^：:\n]{1,20})[：:]/)?.[1]?.trim() || ''
  const roleFallback = msg.role === 'user' ? '用户' : '角色'
  const speaker = String(msg.name || inferred || roleFallback).trim()
  const text = stripThinkForAiLog(msg.content)
  if (new RegExp(`^\\s*${speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]`).test(text)) {
    return text
  }
  return `${speaker}：${text}`
}

export function summarizeAiMessageForLog(msg: { role?: string; content?: string; name?: string }) {
  const content = String(msg.content || '')
  const stripped = stripThinkForAiLog(content)
  const lineCount = stripped ? stripped.split(/\r?\n/).length : 0
  const hash = createHash('sha256').update(stripped).digest('hex').slice(0, 12)
  const name = String(msg.name || '').trim()
  return [
    `role=${String(msg.role || 'unknown')}`,
    name ? `name=${name}` : '',
    `length=${content.length}`,
    `visibleLength=${stripped.length}`,
    `lines=${lineCount}`,
    `sha256=${hash}`
  ].filter(Boolean).join(' ')
}
