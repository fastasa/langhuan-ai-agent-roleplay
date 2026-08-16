import { describe, expect, it, vi } from 'vitest'
import { createWorkspaceCommandBus } from '../../../src/app/workspaceCommandBus.ts'

function createRuntimeStore() {
  return {
    trackCommand: vi.fn(),
    syncCommandResult: vi.fn(),
    showToast: vi.fn(),
    setBlockingFeedback: vi.fn(),
    clearBlockingFeedback: vi.fn()
  }
}

describe('workspaceCommandBus', () => {
  it('命令成功时会写入完整生命周期与结果', async () => {
    const runtimeStore = createRuntimeStore()
    const bus = createWorkspaceCommandBus(runtimeStore)
    bus.registerHandler('workspace/test', {
      target: 'chat',
      optimistic: true,
      feedbackPolicy: { mode: 'toast', successMessage: '好了' },
      handle: async (payload, context) => ({
        payload,
        commandId: context.metadata.commandId
      })
    })

    const result = await bus.dispatch('workspace/test', { value: 1 })

    expect(runtimeStore.trackCommand).toHaveBeenCalledTimes(3)
    expect(runtimeStore.syncCommandResult).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace/test', target: 'chat', optimistic: true }),
      expect.objectContaining({ ok: true, status: 'committed' })
    )
    expect(runtimeStore.showToast).toHaveBeenCalledWith('好了', 'success', 3000)
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      target: 'chat',
      optimistic: true
    }))
  })

  it('命令失败时会生成可回滚错误结果', async () => {
    const runtimeStore = createRuntimeStore()
    const bus = createWorkspaceCommandBus(runtimeStore)
    bus.registerHandler('workspace/fail', {
      rollbackPolicy: 'auto',
      handle: async () => {
        throw new Error('执行失败')
      }
    })

    await expect(bus.dispatch('workspace/fail', {})).rejects.toEqual(expect.objectContaining({
      ok: false,
      status: 'rolledBack',
      message: '执行失败'
    }))

    expect(runtimeStore.syncCommandResult).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace/fail' }),
      expect.objectContaining({ ok: false, status: 'rolledBack' })
    )
  })
})
