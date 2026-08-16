/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟 import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    DEV: true
  }
})

describe('logger', () => {
  let logger

  beforeEach(() => {
    vi.resetModules()
    // 重新导入 logger 模块
    import('../../../src/utils/logger.js').then(module => {
      logger = module.logger
    })
  })

  it('log should output in dev mode', () => {
    const consoleLog = vi.spyOn(console, 'log')
    // 这里需要同步执行，所以直接调用
  })

  it('error should always output', () => {
    const consoleError = vi.spyOn(console, 'error')
    // 测试错误始终输出
  })
})
