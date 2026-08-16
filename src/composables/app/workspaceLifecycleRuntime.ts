type CreateWorkspaceLifecycleRuntimeDeps = {
  handleClickOutside: EventListenerOrEventListenerObject
  settingStore: {
    applyTheme: () => void
    apiPresets: unknown[]
  }
  settingEnvironmentService: {
    loadEnvironment: () => Promise<void>
    saveEnvironment: () => Promise<void>
  }
  autoSyncTime: { value: boolean }
  updateCurrentTimeSilent: () => void
  loadWeatherConfig: () => Promise<void>
  localWorkspaceServerSync: {
    restoreBootSnapshot: () => Promise<unknown>
    bootstrapWorkspaceFromServer: (options?: { message?: string }) => Promise<unknown>
  }
  workspaceBootSession: {
    persistBootSnapshot: () => Promise<void> | void
  }
  loadApiPreset: (index: number) => void
  restoreApiPresetDraft: () => void
  readStoredApiPresetIndex: () => number
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  stopTaskTimerUpdate: () => void
}

async function runNonBlockingStartupStep(step: () => Promise<void>, label: string) {
  try {
    await step()
  } catch (error) {
    console.warn(`${label}失败，继续装载工作区:`, error)
  }
}

export function createWorkspaceLifecycleRuntime(deps: CreateWorkspaceLifecycleRuntimeDeps) {
  let currentTimeInterval: ReturnType<typeof setInterval> | null = null
  let saveEnvironmentInterval: ReturnType<typeof setInterval> | null = null
  let mounted = false
  const handlePagehidePersist = () => {
    void deps.workspaceBootSession.persistBootSnapshot()
  }

  function stopCurrentTimeInterval() {
    if (currentTimeInterval) {
      clearInterval(currentTimeInterval)
      currentTimeInterval = null
    }
  }

  function stopSaveEnvironmentInterval() {
    if (saveEnvironmentInterval) {
      clearInterval(saveEnvironmentInterval)
      saveEnvironmentInterval = null
    }
  }

  function startCurrentTimeInterval() {
    stopCurrentTimeInterval()
    currentTimeInterval = setInterval(() => {
      if (!mounted) return
      if (deps.autoSyncTime.value) {
        deps.updateCurrentTimeSilent()
      }
    }, 1000)
  }

  function startSaveEnvironmentInterval() {
    stopSaveEnvironmentInterval()
    saveEnvironmentInterval = setInterval(() => {
      if (!mounted) return
      deps.settingEnvironmentService.saveEnvironment().catch(() => {})
    }, 60 * 1000)
  }

  async function mount() {
    mounted = true
    document.addEventListener('click', deps.handleClickOutside)
    deps.settingStore.applyTheme()
    await deps.localWorkspaceServerSync.restoreBootSnapshot()
    if (!mounted) return

    await runNonBlockingStartupStep(
      () => deps.settingEnvironmentService.loadEnvironment(),
      '读取环境配置'
    )
    if (!mounted) return
    await runNonBlockingStartupStep(
      () => deps.loadWeatherConfig(),
      '读取天气配置'
    )
    if (!mounted) return

    try {
      await deps.localWorkspaceServerSync.bootstrapWorkspaceFromServer({
        message: '正在装载工作区...'
      })
      if (!mounted) return
      if (deps.settingStore.apiPresets.length > 0) {
        deps.loadApiPreset(deps.readStoredApiPresetIndex())
        deps.restoreApiPresetDraft()
      }
    } catch (err) {
      console.error('数据加载失败:', err)
      deps.toast('数据加载失败，请检查服务器连接', 'error')
    }

    window.addEventListener('pagehide', handlePagehidePersist)
    startCurrentTimeInterval()
    startSaveEnvironmentInterval()
  }

  function unmount() {
    mounted = false
    document.removeEventListener('click', deps.handleClickOutside)
    window.removeEventListener('pagehide', handlePagehidePersist)
    stopCurrentTimeInterval()
    stopSaveEnvironmentInterval()
    void deps.workspaceBootSession.persistBootSnapshot()
    deps.settingEnvironmentService.saveEnvironment().catch(() => {})
    deps.stopTaskTimerUpdate()
  }

  return {
    mount,
    unmount
  }
}
