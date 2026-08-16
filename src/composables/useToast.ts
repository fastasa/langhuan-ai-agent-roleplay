import { computed, ref } from 'vue'
import type { useWorkspaceRuntimeStore } from '../app/workspaceRuntimeStore'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

type WorkspaceRuntimeStore = ReturnType<typeof useWorkspaceRuntimeStore>

export function useToast(runtimeStore?: WorkspaceRuntimeStore | null) {
  const boundRuntimeStore = runtimeStore ?? undefined

  if (boundRuntimeStore?.feedbackCenter?.toast) {
    const runtime = boundRuntimeStore
    const toastVisible = computed(() => runtime.feedbackCenter.toast.visible)
    const toastMessage = computed(() => runtime.feedbackCenter.toast.message)
    const toastType = computed(() => {
      const currentType = runtime.feedbackCenter.toast.type
      return currentType === 'idle' ? 'info' : currentType
    })

    function toast(message: string, type: ToastType = 'info', duration = 3000) {
      runtime.showToast(message, type, duration)
    }

    return {
      toastVisible,
      toastMessage,
      toastType,
      toast
    }
  }

  const toastVisible = ref(false)
  const toastMessage = ref('')
  const toastType = ref<ToastType>('info')
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function toast(message: string, type: ToastType = 'info', duration = 3000) {
    toastMessage.value = message
    toastType.value = type
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastVisible.value = false
    }, duration)
  }

  return {
    toastVisible,
    toastMessage,
    toastType,
    toast
  }
}
