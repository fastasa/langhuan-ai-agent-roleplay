/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import {
  NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT,
  notifyNarrativeSeedsExternalUpdatedAfterPersistence
} from '../../../src/app/narrativeSeedWorkspaceEvents'

describe('narrativeSeedWorkspaceEvents', () => {
  it('等待星依最终回复完成落库尝试后才通知工作台刷新', async () => {
    let resolvePersistence
    const persistence = new Promise((resolve) => { resolvePersistence = resolve })
    const listener = vi.fn()
    window.addEventListener(NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT, listener)

    const notifying = notifyNarrativeSeedsExternalUpdatedAfterPersistence(persistence, {
      worldId: 'world-1',
      sessionId: 'session-1'
    })
    await Promise.resolve()
    expect(listener).not.toHaveBeenCalled()

    resolvePersistence(42)
    await notifying
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({ worldId: 'world-1', sessionId: 'session-1' })

    window.removeEventListener(NARRATIVE_SEEDS_EXTERNAL_UPDATED_EVENT, listener)
  })
})
