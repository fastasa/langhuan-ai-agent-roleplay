import { beforeEach, describe, expect, it, vi } from 'vitest'

const useWorkspaceShellControllerMock = vi.fn()
const useWorkspacePanelsMock = vi.fn()
const useWorkspaceDialogsMock = vi.fn()
const useWorkspaceLifecycleMock = vi.fn()

vi.mock('../../../src/composables/app/useWorkspaceShellController.ts', () => ({
  useWorkspaceShellController: useWorkspaceShellControllerMock
}))

vi.mock('../../../src/composables/app/useWorkspacePanels.ts', () => ({
  useWorkspacePanels: useWorkspacePanelsMock
}))

vi.mock('../../../src/composables/app/useWorkspaceDialogs.ts', () => ({
  useWorkspaceDialogs: useWorkspaceDialogsMock
}))

vi.mock('../../../src/composables/app/useWorkspaceLifecycle.ts', () => ({
  useWorkspaceLifecycle: useWorkspaceLifecycleMock
}))

describe('workspace shell entry wrappers', () => {
  beforeEach(() => {
    useWorkspaceShellControllerMock.mockReset()
    useWorkspacePanelsMock.mockReset()
    useWorkspaceDialogsMock.mockReset()
    useWorkspaceLifecycleMock.mockReset()
  })

  it('useAppShell 会直接走工作区壳层控制入口', async () => {
    const expected = { source: 'workspace-shell' }
    useWorkspaceShellControllerMock.mockReturnValue(expected)

    const { useAppShell } = await import('../../../src/composables/app/useAppShell.ts')

    expect(useAppShell()).toBe(expected)
    expect(useWorkspaceShellControllerMock).toHaveBeenCalledTimes(1)
  })

  it('旧面板与弹窗入口会转发到新的工作区壳层入口', async () => {
    const panelResult = { desktopState: {} }
    const dialogResult = { utilityModalState: {} }
    useWorkspacePanelsMock.mockReturnValue(panelResult)
    useWorkspaceDialogsMock.mockReturnValue(dialogResult)

    const { useAppShellPanels } = await import('../../../src/composables/app/useAppShellPanels.ts')
    const { useAppShellModalLifecycle } = await import('../../../src/composables/app/useAppShellModalLifecycle.ts')

    const panelCtx = { name: 'panel' }
    const dialogCtx = { name: 'dialog' }

    expect(useAppShellPanels(panelCtx)).toBe(panelResult)
    expect(useWorkspacePanelsMock).toHaveBeenCalledWith(panelCtx)
    expect(useAppShellModalLifecycle(dialogCtx)).toBe(dialogResult)
    expect(useWorkspaceDialogsMock).toHaveBeenCalledWith(dialogCtx)
    expect(useWorkspaceLifecycleMock).toHaveBeenCalledTimes(1)
    expect(useWorkspaceLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({}))
  })
})
