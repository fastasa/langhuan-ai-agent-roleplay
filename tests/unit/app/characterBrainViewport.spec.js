import { describe, expect, it } from 'vitest'
import {
  CHARACTER_BRAIN_MIN_VIEWPORT_SCALE,
  resolveCharacterBrainNodeMarkerScale,
  resolveCharacterBrainRadialDistance
} from '../../../src/app/characterBrainViewport'

describe('characterBrainViewport', () => {
  it('allows a deep overview scale for an infinite relation canvas', () => {
    expect(CHARACTER_BRAIN_MIN_VIEWPORT_SCALE).toBeLessThanOrEqual(0.005)
  })

  it('keeps node markers readable after zooming far out', () => {
    expect(resolveCharacterBrainNodeMarkerScale(0.4, 1)).toBe(1)
    expect(resolveCharacterBrainNodeMarkerScale(0.08, 1)).toBeCloseTo(3.5, 6)
    expect(resolveCharacterBrainNodeMarkerScale(0.005, 0.8)).toBeCloseTo(70, 6)
  })

  it('uses stable compact radial distances that do not depend on viewport zoom', () => {
    expect(resolveCharacterBrainRadialDistance(2, 14)).toBe(160)
    expect(resolveCharacterBrainRadialDistance(8, 14)).toBeCloseTo(173.44, 6)
    expect(resolveCharacterBrainRadialDistance(30, 18)).toBe(260)
  })
})
