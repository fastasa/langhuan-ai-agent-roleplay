import { computed } from 'vue'

type MutableValue<T> = { value: T }

type ChatGenerationStateDeps = {
  isGenerating: MutableValue<boolean>
  currentAbortController: MutableValue<AbortController | null>
  currentMessageModel: MutableValue<string>
  stopRequested: MutableValue<boolean>
  clearLocalStreamingMessages?: () => void
}

export function createChatGenerationState(deps: ChatGenerationStateDeps) {
  const isTyping = computed({
    get: () => deps.isGenerating.value,
    set: (value: boolean) => {
      deps.isGenerating.value = value
    }
  })

  function setTyping(value: boolean): void {
    deps.isGenerating.value = value
  }

  function setAbortController(controller: AbortController | null): void {
    deps.currentAbortController.value = controller
  }

  function setCurrentMessageModel(model: string): void {
    deps.currentMessageModel.value = String(model || '')
  }

  function shouldStop(): boolean {
    return Boolean(deps.stopRequested.value)
  }

  function stopGeneration(): void {
    deps.stopRequested.value = true
    if (deps.currentAbortController.value) {
      deps.currentAbortController.value.abort()
      deps.currentAbortController.value = null
    }
    deps.isGenerating.value = false
    deps.currentMessageModel.value = ''
    // 批次5 5a：停止不再抢跑清空局部流式消息。执行器（useGroupChatExecutor）在 finally 里
    // 自管生命周期——已完成的回复原地 finalize 落库、未完成的 remove——抢跑全局清空会让编排带
    // 先消失、待落库后再出现（闪烁）。需要立即清空的场景（重生成/删除）由调用方显式再调一次。
  }

  function clearStopRequest(): void {
    deps.stopRequested.value = false
  }

  return {
    isTyping,
    setTyping,
    setAbortController,
    setCurrentMessageModel,
    shouldStop,
    stopGeneration,
    clearStopRequest
  }
}
