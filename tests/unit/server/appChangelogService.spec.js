import { describe, expect, it } from 'vitest'
import { CURRENT_APP_CHANGELOG } from '../../../src/app/appChangelog.ts'
import { getAppChangelog } from '../../../server/services/appChangelogService.ts'

describe('appChangelogService', () => {
  it('returns the static changelog shipped with the local release', () => {
    expect(getAppChangelog()).toBe(CURRENT_APP_CHANGELOG)
    expect(getAppChangelog().releaseId).toBe('2026-08-16-local-open-source-v1')
  })
})
