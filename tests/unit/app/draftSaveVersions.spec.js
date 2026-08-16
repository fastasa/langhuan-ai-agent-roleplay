import { describe, expect, it } from 'vitest'
import { createDraftSaveVersionGuard } from '../../../src/app/draftSaveVersions'

describe('draftSaveVersions', () => {
  it('only lets the latest save token update draft state', () => {
    const guard = createDraftSaveVersionGuard()
    const first = guard.begin('doc:1')
    const second = guard.begin('doc:1')

    expect(guard.isLatest(first)).toBe(false)
    expect(guard.isLatest(second)).toBe(true)
  })

  it('marks an in-flight save stale when the user edits the draft again', () => {
    const guard = createDraftSaveVersionGuard()
    const saveToken = guard.begin('role:unit:1')

    guard.touch('role:unit:1')

    expect(guard.isLatest(saveToken)).toBe(false)
  })

  it('tracks different draft keys independently', () => {
    const guard = createDraftSaveVersionGuard()
    const firstDoc = guard.begin('doc:1')
    const secondDoc = guard.begin('doc:2')

    guard.touch('doc:1')

    expect(guard.isLatest(firstDoc)).toBe(false)
    expect(guard.isLatest(secondDoc)).toBe(true)
  })
})
