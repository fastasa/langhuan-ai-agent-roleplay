import { afterEach, describe, expect, it, vi } from 'vitest'
import { createXingyiDiaryAutoTrigger } from '../../../src/app/xingyiDiaryAutoTrigger.ts'

describe('xingyiDiaryAutoTrigger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('条件未满足时不发请求，满足后可立即检查', async () => {
    vi.useFakeTimers()
    let eligible = false
    const request = vi.fn().mockResolvedValue({ generatedDates: [], latestReadyDateStr: '2026-07-15' })
    const trigger = createXingyiDiaryAutoTrigger({ isEligible: () => eligible, request })

    trigger.start()
    expect(request).not.toHaveBeenCalled()
    eligible = true
    await trigger.checkNow()
    expect(request).toHaveBeenCalledTimes(1)
    trigger.stop()
  })

  it('页面持续打开时每分钟检查，并在窗口重新聚焦时立即检查', async () => {
    vi.useFakeTimers()
    const request = vi.fn().mockResolvedValue({ generatedDates: [], latestReadyDateStr: '2026-07-15' })
    const trigger = createXingyiDiaryAutoTrigger({ isEligible: () => true, request, intervalMs: 60_000 })

    trigger.start()
    await vi.runAllTicks()
    expect(request).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(request).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await vi.runAllTicks()
    expect(request).toHaveBeenCalledTimes(3)
    trigger.stop()
  })

  it('多个活跃信号撞在一起时复用同一个在途请求', async () => {
    vi.useFakeTimers()
    let release
    const request = vi.fn(() => new Promise((resolve) => { release = resolve }))
    const trigger = createXingyiDiaryAutoTrigger({ isEligible: () => true, request })

    trigger.start()
    const second = trigger.checkNow()
    window.dispatchEvent(new Event('focus'))
    expect(request).toHaveBeenCalledTimes(1)

    release({ generatedDates: ['2026-07-15'], latestReadyDateStr: '2026-07-15' })
    await second
    trigger.stop()
  })

  it('失败会报告错误并释放在途状态，下一次检查可以重试', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('网络失败'))
      .mockResolvedValueOnce({ generatedDates: [], latestReadyDateStr: '2026-07-15' })
    const trigger = createXingyiDiaryAutoTrigger({ isEligible: () => true, request, onError })

    await trigger.checkNow()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '网络失败' }))
    await trigger.checkNow()
    expect(request).toHaveBeenCalledTimes(2)
  })
})
