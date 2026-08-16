import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getConfigValueMock,
  upsertConfigValueMock,
  generateXingyiDiaryMarkdownMock,
  writeXingyiDiaryFileMock
} = vi.hoisted(() => ({
  getConfigValueMock: vi.fn(),
  upsertConfigValueMock: vi.fn(),
  generateXingyiDiaryMarkdownMock: vi.fn(),
  writeXingyiDiaryFileMock: vi.fn()
}))

vi.mock('../../../server/repositories/settingRepository.js', () => ({
  settingRepository: {
    getConfigValue: getConfigValueMock,
    upsertConfigValue: upsertConfigValueMock
  }
}))
vi.mock('../../../server/services/xingyiDiaryService.js', () => ({
  generateXingyiDiaryMarkdown: generateXingyiDiaryMarkdownMock,
  writeXingyiDiaryFile: writeXingyiDiaryFileMock,
  getLocalDateStr: (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },
  XINGYI_DIARY_AUTO_READY_HOUR: 8,
  XINGYI_DIARY_VIEWPOINT_CONFIG_KEY: 'xingyi_diary_viewpoint'
}))
vi.mock('../../../server/logger.js', () => ({
  logger: { system: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

import {
  generateDueXingyiDiaries,
  resolveLatestReadyXingyiDiaryDateStr,
  resolveXingyiDiaryAutoTargets
} from '../../../server/services/xingyiDiaryScheduler.ts'

describe('xingyiDiaryScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateXingyiDiaryMarkdownMock.mockImplementation(async (dateStr) => `# ${dateStr}`)
    getConfigValueMock.mockImplementation((key, options) => {
      if (options?.scope === 'system') return { value: '2026-07-12' }
      if (key === 'xingyi_diary_viewpoint') return { value: 'xingyi' }
      return null
    })
  })

  describe('resolveLatestReadyXingyiDiaryDateStr', () => {
    it('07:59 时昨天虽已在 05:00 截止，但还没到 08:00，只开放前天', () => {
      expect(resolveLatestReadyXingyiDiaryDateStr(new Date(2026, 6, 16, 7, 59))).toBe('2026-07-14')
    })

    it('08:00 起开放昨天', () => {
      expect(resolveLatestReadyXingyiDiaryDateStr(new Date(2026, 6, 16, 8, 0))).toBe('2026-07-15')
    })

    it('跨月边界正确', () => {
      expect(resolveLatestReadyXingyiDiaryDateStr(new Date(2026, 7, 1, 8, 0))).toBe('2026-07-31')
    })
  })

  describe('resolveXingyiDiaryAutoTargets', () => {
    it('从未生成过时只生成最近一个已成熟日，不臆测无限历史', () => {
      expect(resolveXingyiDiaryAutoTargets(new Date(2026, 6, 16, 8, 0), '')).toEqual(['2026-07-15'])
    })

    it('网页离开多天后按日期顺序补齐全部缺失日记', () => {
      expect(resolveXingyiDiaryAutoTargets(new Date(2026, 6, 16, 8, 0), '2026-07-12'))
        .toEqual(['2026-07-13', '2026-07-14', '2026-07-15'])
    })

    it('已经生成到最新成熟日时不再生成', () => {
      expect(resolveXingyiDiaryAutoTargets(new Date(2026, 6, 16, 8, 0), '2026-07-15')).toEqual([])
    })

    it('脏游标按从未生成处理', () => {
      expect(resolveXingyiDiaryAutoTargets(new Date(2026, 6, 16, 8, 0), '不是日期')).toEqual(['2026-07-15'])
    })
  })

  it('顺序生成每个缺失日，并在每一天成功后推进系统游标', async () => {
    const result = await generateDueXingyiDiaries(new Date(2026, 6, 16, 8, 0))

    expect(result).toEqual({
      generatedDates: ['2026-07-13', '2026-07-14', '2026-07-15'],
      latestReadyDateStr: '2026-07-15'
    })
    expect(generateXingyiDiaryMarkdownMock.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['2026-07-13', 'xingyi', 'fullDay'],
      ['2026-07-14', 'xingyi', 'fullDay'],
      ['2026-07-15', 'xingyi', 'fullDay']
    ])
    expect(writeXingyiDiaryFileMock.mock.calls).toEqual([
      ['2026-07-13', '# 2026-07-13'],
      ['2026-07-14', '# 2026-07-14'],
      ['2026-07-15', '# 2026-07-15']
    ])
    expect(upsertConfigValueMock.mock.calls.map((call) => call[1])).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15'
    ])
  })

  it('某一天失败时不推进该日游标，也不继续生成后续日期', async () => {
    generateXingyiDiaryMarkdownMock
      .mockResolvedValueOnce('# 2026-07-13')
      .mockRejectedValueOnce(new Error('模型失败'))

    await expect(generateDueXingyiDiaries(new Date(2026, 6, 16, 8, 0))).rejects.toThrow('模型失败')
    expect(upsertConfigValueMock).toHaveBeenCalledTimes(1)
    expect(upsertConfigValueMock.mock.calls[0][1]).toBe('2026-07-13')
    expect(generateXingyiDiaryMarkdownMock).toHaveBeenCalledTimes(2)
  })

  it('并发标签页检查共享同一个生成运行，不重复调用模型', async () => {
    let release
    generateXingyiDiaryMarkdownMock.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    getConfigValueMock.mockImplementation((key, options) => {
      if (options?.scope === 'system') return { value: '2026-07-14' }
      return { value: 'xingyi' }
    })

    const first = generateDueXingyiDiaries(new Date(2026, 6, 16, 8, 0))
    const second = generateDueXingyiDiaries(new Date(2026, 6, 16, 8, 1))
    expect(first).toBe(second)
    expect(generateXingyiDiaryMarkdownMock).toHaveBeenCalledTimes(1)

    release('# 2026-07-15')
    await first
    expect(writeXingyiDiaryFileMock).toHaveBeenCalledTimes(1)
  })
})
