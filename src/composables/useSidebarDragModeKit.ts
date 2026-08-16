import { computed, ref } from 'vue'

type Options<TSink extends string> = {
  persistKey?: string
  defaultDragEnabled?: boolean
  defaultSinkContext?: TSink | ''
}

type PersistedPayload<TSink extends string> = {
  drag?: boolean
  sink?: TSink | ''
}

export function useSidebarDragModeKit<TSink extends string>(options: Options<TSink> = {}) {
  // 这个 composable 统一管理侧栏“拖动 / 沉底”两枚释放按钮的状态。
  // 页面层只负责声明 sink 的上下文种类，例如联系人的 char/group/crowd，
  // 或世界树的 worldbook；不要再各自维护一套独立按钮状态。
  const dragEnabled = ref(Boolean(options.defaultDragEnabled))
  const sinkContext = ref<TSink | ''>((options.defaultSinkContext || '') as TSink | '')

  function persist() {
    if (typeof window === 'undefined' || !options.persistKey) return
    window.localStorage.setItem(options.persistKey, JSON.stringify({
      drag: dragEnabled.value,
      sink: sinkContext.value
    }))
  }

  function hydrate() {
    if (typeof window === 'undefined' || !options.persistKey) return
    try {
      const raw = window.localStorage.getItem(options.persistKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistedPayload<TSink>
      dragEnabled.value = Boolean(parsed?.drag)
      sinkContext.value = ((parsed?.sink || '') as TSink | '')
    } catch {
      dragEnabled.value = Boolean(options.defaultDragEnabled)
      sinkContext.value = ((options.defaultSinkContext || '') as TSink | '')
    }
  }

  function toggleDragMode() {
    dragEnabled.value = !dragEnabled.value
    persist()
  }

  function setDragMode(nextValue: boolean) {
    dragEnabled.value = Boolean(nextValue)
    persist()
  }

  function toggleSinkMode(context: TSink) {
    sinkContext.value = sinkContext.value === context ? '' : context
    persist()
  }

  function setSinkContext(context: TSink | '') {
    sinkContext.value = context
    persist()
  }

  function isSinkActive(context: TSink) {
    return sinkContext.value === context
  }

  const sinkEnabled = computed(() => Boolean(sinkContext.value))

  return {
    dragEnabled,
    sinkContext,
    sinkEnabled,
    hydrate,
    persist,
    toggleDragMode,
    setDragMode,
    toggleSinkMode,
    setSinkContext,
    isSinkActive
  }
}
