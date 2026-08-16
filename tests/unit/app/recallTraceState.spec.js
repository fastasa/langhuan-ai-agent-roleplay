import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRecallTrace,
  showActiveRecallActivityInPanel,
  showRecallActivityRunInPanel,
  startRecallActivity,
  useRecallTraceState
} from '../../../src/app/recallTraceState.ts'

describe('recallTraceState', () => {
  afterEach(() => {
    clearRecallTrace()
  })

  it('侧栏已打开时新召回不会自动覆盖当前查看的召回 run', () => {
    const state = useRecallTraceState()

    startRecallActivity({
      id: 'run-first',
      characterName: '星依',
      startedAt: '2026-05-16T00:00:00.000Z'
    })
    showActiveRecallActivityInPanel()
    state.setSidebarOpen(true)
    startRecallActivity({
      id: 'run-second',
      characterName: '惊雨',
      startedAt: '2026-05-16T00:00:01.000Z'
    })

    expect(state.activity.value?.id).toBe('run-first')
    expect(state.activeActivity.value?.id).toBe('run-second')

    expect(showRecallActivityRunInPanel('run-second')).toBe(true)
    expect(state.activity.value?.id).toBe('run-second')
  })
})
