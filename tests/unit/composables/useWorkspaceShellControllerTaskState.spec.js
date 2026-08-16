import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceShellControllerTaskState } from '../../../src/composables/app/useWorkspaceShellControllerTaskState.ts'

describe('useWorkspaceShellControllerTaskState', () => {
  it('会返回视图桥需要的任务面板状态集合', () => {
    const state = {
      batchTicket: null,
      batchAmount: 1,
      showBatchExchange: false,
      showBatchUse: false,
      openEditTicket: vi.fn(),
      showAddTicket: false,
      showTagManager: false,
      useCustomTag: vi.fn()
    }

    const result = buildWorkspaceShellControllerTaskState(state)

    expect(result).toEqual(state)
  })
})
