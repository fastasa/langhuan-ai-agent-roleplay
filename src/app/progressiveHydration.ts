export type ProgressiveHydrationStage = 'idle' | 'shell' | 'hydrating' | 'ready' | 'error'

export type ProgressiveHydrationScheduler = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'>

export interface ProgressiveHydrationController<Input> {
  cancel: () => void
  getActiveInput: () => Input | undefined
  getStage: () => ProgressiveHydrationStage
  getToken: () => number
  refresh: (input: Input) => number
  start: (input: Input) => number
}

export interface ProgressiveHydrationOptions<Input, Output> {
  buildShell: (input: Input) => Output
  hydrate: (input: Input) => Output
  onError?: (error: unknown, input: Input, token: number) => void
  onResult: (output: Output, stage: Exclude<ProgressiveHydrationStage, 'idle' | 'hydrating' | 'error'>, token: number) => void
  onStage?: (stage: ProgressiveHydrationStage, token: number) => void
  scheduler?: ProgressiveHydrationScheduler
}

export function createProgressiveHydrationController<Input, Output>(
  options: ProgressiveHydrationOptions<Input, Output>
): ProgressiveHydrationController<Input> {
  let token = 0
  let frameHandle = 0
  let timerHandle = 0
  let stage: ProgressiveHydrationStage = 'idle'
  let activeInput: Input | undefined

  const scheduler = options.scheduler ?? resolveDefaultScheduler()

  const setStage = (nextStage: ProgressiveHydrationStage, nextToken = token) => {
    stage = nextStage
    options.onStage?.(nextStage, nextToken)
  }

  const cancelScheduled = () => {
    if (!scheduler) return
    if (frameHandle) {
      scheduler.cancelAnimationFrame(frameHandle)
      frameHandle = 0
    }
    if (timerHandle) {
      scheduler.clearTimeout(timerHandle)
      timerHandle = 0
    }
  }

  const cancel = () => {
    token += 1
    activeInput = undefined
    cancelScheduled()
    setStage('idle')
  }

  const runHydration = (input: Input, activeToken: number) => {
    if (activeToken !== token) return
    try {
      setStage('hydrating', activeToken)
      const output = options.hydrate(input)
      if (activeToken !== token) return
      options.onResult(output, 'ready', activeToken)
      setStage('ready', activeToken)
    } catch (error) {
      if (activeToken !== token) return
      setStage('error', activeToken)
      options.onError?.(error, input, activeToken)
    }
  }

  const scheduleHydration = (input: Input, activeToken: number) => {
    if (!scheduler) {
      runHydration(input, activeToken)
      return
    }
    const afterPaint = () => {
      frameHandle = 0
      timerHandle = scheduler.setTimeout(() => {
        timerHandle = 0
        runHydration(input, activeToken)
      }, 0)
    }
    frameHandle = scheduler.requestAnimationFrame(afterPaint)
  }

  const start = (input: Input) => {
    token += 1
    const activeToken = token
    activeInput = input
    cancelScheduled()
    setStage('shell', activeToken)
    try {
      options.onResult(options.buildShell(input), 'shell', activeToken)
    } catch (error) {
      setStage('error', activeToken)
      options.onError?.(error, input, activeToken)
      return activeToken
    }
    scheduleHydration(input, activeToken)
    return activeToken
  }

  const refresh = (input: Input) => {
    token += 1
    const activeToken = token
    activeInput = input
    cancelScheduled()
    setStage('hydrating', activeToken)
    scheduleHydration(input, activeToken)
    return activeToken
  }

  return {
    cancel,
    getActiveInput: () => activeInput,
    getStage: () => stage,
    getToken: () => token,
    refresh,
    start
  }
}

function resolveDefaultScheduler(): ProgressiveHydrationScheduler | undefined {
  if (typeof window === 'undefined') return undefined
  if (typeof window.requestAnimationFrame !== 'function') return undefined
  return window
}
