import { describe, expect, it } from 'vitest'
import { createProgressiveHydrationController } from '../../../src/app/progressiveHydration'

function createScheduler() {
  let frameId = 0
  let timerId = 0
  const frames = new Map()
  const timers = new Map()
  return {
    scheduler: {
      requestAnimationFrame(callback) {
        frameId += 1
        frames.set(frameId, callback)
        return frameId
      },
      cancelAnimationFrame(id) {
        frames.delete(id)
      },
      setTimeout(callback) {
        timerId += 1
        timers.set(timerId, callback)
        return timerId
      },
      clearTimeout(id) {
        timers.delete(id)
      }
    },
    flushFrame() {
      const callbacks = Array.from(frames.values())
      frames.clear()
      callbacks.forEach((callback) => callback())
    },
    flushTimer() {
      const callbacks = Array.from(timers.values())
      timers.clear()
      callbacks.forEach((callback) => callback())
    }
  }
}

describe('progressiveHydration', () => {
  it('publishes shell immediately and hydrates after paint', () => {
    const calls = []
    const { scheduler, flushFrame, flushTimer } = createScheduler()
    const controller = createProgressiveHydrationController({
      scheduler,
      buildShell: (value) => `shell:${value}`,
      hydrate: (value) => `ready:${value}`,
      onResult: (value, stage) => calls.push({ value, stage })
    })

    controller.start('A')

    expect(controller.getStage()).toBe('shell')
    expect(calls).toEqual([{ value: 'shell:A', stage: 'shell' }])

    flushFrame()
    flushTimer()

    expect(controller.getStage()).toBe('ready')
    expect(calls).toEqual([
      { value: 'shell:A', stage: 'shell' },
      { value: 'ready:A', stage: 'ready' }
    ])
  })

  it('cancels older hydration when a newer input starts', () => {
    const calls = []
    const { scheduler, flushFrame, flushTimer } = createScheduler()
    const controller = createProgressiveHydrationController({
      scheduler,
      buildShell: (value) => `shell:${value}`,
      hydrate: (value) => `ready:${value}`,
      onResult: (value, stage) => calls.push({ value, stage })
    })

    controller.start('A')
    expect(controller.getActiveInput()).toBe('A')
    controller.start('B')
    expect(controller.getActiveInput()).toBe('B')
    flushFrame()
    flushTimer()

    expect(controller.getStage()).toBe('ready')
    expect(calls).toEqual([
      { value: 'shell:A', stage: 'shell' },
      { value: 'shell:B', stage: 'shell' },
      { value: 'ready:B', stage: 'ready' }
    ])
  })

  it('refreshes without publishing a new shell', () => {
    const calls = []
    const { scheduler, flushFrame, flushTimer } = createScheduler()
    const controller = createProgressiveHydrationController({
      scheduler,
      buildShell: (value) => `shell:${value}`,
      hydrate: (value) => `ready:${value}`,
      onResult: (value, stage) => calls.push({ value, stage })
    })

    controller.start('A')
    controller.refresh('A2')
    flushFrame()
    flushTimer()

    expect(controller.getStage()).toBe('ready')
    expect(calls).toEqual([
      { value: 'shell:A', stage: 'shell' },
      { value: 'ready:A2', stage: 'ready' }
    ])
  })

  it('does not publish ready result after cancel', () => {
    const calls = []
    const stages = []
    const { scheduler, flushFrame, flushTimer } = createScheduler()
    const controller = createProgressiveHydrationController({
      scheduler,
      buildShell: (value) => `shell:${value}`,
      hydrate: (value) => `ready:${value}`,
      onResult: (value, stage) => calls.push({ value, stage }),
      onStage: (stage) => stages.push(stage)
    })

    controller.start('A')
    controller.cancel()
    expect(controller.getActiveInput()).toBeUndefined()
    flushFrame()
    flushTimer()

    expect(controller.getStage()).toBe('idle')
    expect(calls).toEqual([{ value: 'shell:A', stage: 'shell' }])
    expect(stages).toEqual(['shell', 'idle'])
  })
})
