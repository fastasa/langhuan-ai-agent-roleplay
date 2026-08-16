/**
 * 日志系统
 * 统一管理服务器日志，分为：系统、用户、AI、错误、调试
 * 颜色方案：
 *   系统 - 青色 (cyan)
 *   用户 - 绿色 (green)
 *   AI   - 金色/黄色 (yellow)
 *   错误 - 红色 (red)
 *   调试 - 灰色 (dim)
 *   警告 - 橙色 (orange)
 */

type LogCategory = '系统' | '用户' | 'AI' | '错误' | '调试' | '警告'

// ANSI 颜色码
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  orange: '\x1b[38;5;208m',
  reset: '\x1b[0m'
}

// AI日志存储（保留最近50条）
const aiLogs: string[] = []
const MAX_AI_LOGS = 50

/** 分类日志输出 */
function log(category: LogCategory, message: string, ...args: unknown[]) {
  const timestamp = new Date().toLocaleString('zh-CN', { hour12: false })
  const prefix = `[${category}]`

  // 获取颜色
  let color = colors.reset
  switch (category) {
    case '系统': color = colors.cyan; break
    case '用户': color = colors.green; break
    case 'AI': color = colors.yellow; break
    case '错误': color = colors.red; break
    case '调试': color = colors.dim; break
    case '警告': color = colors.orange; break
  }

  // 格式化输出
  const output = `${color}${prefix}${colors.reset} ${timestamp} ${message}`
  if (category === '错误') {
    console.error(output, ...args)
  } else {
    console.log(output, ...args)
  }

  // AI 日志额外存储
  if (category === 'AI') {
    const logEntry = `${timestamp} [AI] ${message}`
    aiLogs.push(logEntry)
    if (aiLogs.length > MAX_AI_LOGS) {
      aiLogs.shift()
    }
  }
}

export const logger = {
  system: (msg: string, ...args: unknown[]) => log('系统', msg, ...args),
  user: (msg: string, ...args: unknown[]) => log('用户', msg, ...args),
  ai: (msg: string, ...args: unknown[]) => log('AI', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('错误', msg, ...args),
  debug: (msg: string, ...args: unknown[]) => log('调试', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('警告', msg, ...args),
  getAiLogs: () => [...aiLogs]
}
