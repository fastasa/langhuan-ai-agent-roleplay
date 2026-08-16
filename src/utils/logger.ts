/**
 * 日志工具 - 仅在开发环境输出日志
 */
const isDev = import.meta.env.DEV

/** Logger 接口定义 */
interface Logger {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

/**
 * 开发环境日志记录器
 */
export const logger: Logger = {
  // 开发环境输出 info 级别日志
  log: (...args: unknown[]) => isDev && console.log(...args),

  // 开发环境输出警告
  warn: (...args: unknown[]) => isDev && console.warn(...args),

  // 错误始终输出
  error: (...args: unknown[]) => console.error(...args),

  // 调试信息（仅开发环境）
  debug: (...args: unknown[]) => isDev && console.debug(...args)
}
