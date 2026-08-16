import { describe, expect, it } from 'vitest'
import { resolveXingyiGlobalStatus } from '../../../src/app/xingyiGlobalStatus.ts'

describe('xingyiGlobalStatus', () => {
  it('双源合并优先级：出错 > 等确认 > 进行中 > 刚完成 > 待命', () => {
    expect(resolveXingyiGlobalStatus('error', 'running')).toBe('error')
    expect(resolveXingyiGlobalStatus('idle', 'error')).toBe('error')
    expect(resolveXingyiGlobalStatus('waiting', 'running')).toBe('waiting')
    expect(resolveXingyiGlobalStatus('running', 'waiting')).toBe('waiting')
    expect(resolveXingyiGlobalStatus('running', null)).toBe('running')
    expect(resolveXingyiGlobalStatus('idle', 'running')).toBe('running')
    expect(resolveXingyiGlobalStatus('idle', 'success')).toBe('success')
    expect(resolveXingyiGlobalStatus('idle', null)).toBe('idle')
    expect(resolveXingyiGlobalStatus('idle', undefined)).toBe('idle')
  })

  it('success 可来自任一源，但运行中/等确认/出错时不显示 success', () => {
    expect(resolveXingyiGlobalStatus('running', 'success')).toBe('running')
    expect(resolveXingyiGlobalStatus('waiting', 'success')).toBe('waiting')
    expect(resolveXingyiGlobalStatus('error', 'success')).toBe('error')
  })

  it('2026-07-17：浮坞本轮对话成功也能独立产出 success（不再只靠任务提示）', () => {
    expect(resolveXingyiGlobalStatus('success', null)).toBe('success')
    expect(resolveXingyiGlobalStatus('success', undefined)).toBe('success')
    expect(resolveXingyiGlobalStatus('success', 'error')).toBe('error')
    expect(resolveXingyiGlobalStatus('success', 'waiting')).toBe('waiting')
  })
})
