import { describe, expect, it, vi } from 'vitest'

const transactionViewModel = { operations: [{ id: 'tx_1' }], isExecuting: false }
const transactionActions = { clear: vi.fn(), confirm: vi.fn() }
const emptyViewModel = {}
const emptyActions = {}

vi.mock('../../../src/composables/app/useAppShellPanelBuilders.ts', () => ({
  buildEnvironmentBridge: () => ({ environmentViewModel: { value: {} }, environmentActions: {} }),
  buildChatBridge: () => ({ chatViewModel: { value: {} }, chatActions: {} }),
  buildTransactionBridge: () => ({
    transactionPanelViewModel: { value: transactionViewModel },
    transactionPanelActions: transactionActions,
    pendingPanelViewModel: { value: transactionViewModel },
    pendingPanelActions: transactionActions
  }),
  buildTaskBridge: () => ({ taskPanelViewModel: { value: emptyViewModel }, taskPanelActions: emptyActions }),
  buildLocalArchiveSyncBridge: () => ({ localArchiveSyncPanelViewModel: { value: emptyViewModel }, localArchiveSyncPanelActions: emptyActions }),
  buildResourceBridge: () => ({ resourcePanelViewModel: { value: emptyViewModel }, resourcePanelActions: emptyActions }),
  buildTicketBridge: () => ({ ticketPanelViewModel: { value: emptyViewModel }, ticketPanelActions: emptyActions }),
  buildApiConfigBridge: () => ({ apiConfigPanelViewModel: { value: emptyViewModel }, apiConfigPanelActions: emptyActions }),
  buildPresetManagerBridge: () => ({ presetManagerPanelViewModel: { value: emptyViewModel }, presetManagerPanelActions: emptyActions }),
  buildDataManageBridge: () => ({ dataManagePanelViewModel: { value: emptyViewModel }, dataManagePanelActions: emptyActions })
}))

describe('useWorkspacePanels transaction aliases', () => {
  it('主工作面只暴露 transaction 事务入口，pending 仅留在低层兼容桥', async () => {
    const { useWorkspacePanels } = await import('../../../src/composables/app/useWorkspacePanels.ts')

    const result = useWorkspacePanels({
      getDisplayedMessageContent: vi.fn(),
      setMessagesAreaRef: vi.fn(),
      importFileInput: { value: null },
      importAllData: vi.fn(),
      cloudActionState: { value: {} },
      hasTaskTimeline: vi.fn(),
      getTaskTimelineNodes: vi.fn(),
      taskStore: {
        formatTimerTime: vi.fn(),
        getTaskElapsedTime: vi.fn()
      },
      formatDateOnly: vi.fn(),
      formatTimeOnly: vi.fn(),
      formatObsTime: vi.fn(),
      getWeatherIcon: vi.fn(),
      getWeatherEmoji: vi.fn(),
      getCharAvatarById: vi.fn(),
      formatChatText: vi.fn(),
      getCharAvatar: vi.fn(),
      getCharEmoji: vi.fn(),
      getCharNameById: vi.fn(),
      operationDetail: null,
      showPresetVars: { value: false }
    })

    expect(result.desktopState.panelViewModels.transaction.operations).toEqual([{ id: 'tx_1' }])
    expect(result.desktopState.panelActions.transaction.clear).toBe(transactionActions.clear)
    expect(result.desktopState.panelViewModels.pending).toBeUndefined()
    expect(result.desktopState.panelActions.pending).toBeUndefined()
    expect(Object.keys(result)).toEqual(['desktopState'])
  })
})
