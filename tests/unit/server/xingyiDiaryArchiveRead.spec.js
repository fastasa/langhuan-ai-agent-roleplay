import { describe, expect, it, vi, beforeEach } from 'vitest'

// 星依读日记批次（2026-07-18）：listXingyiDiaryDates / readXingyiDiaryFile 服务层只读两件。
// 与 xingyiDiaryService.spec.js 分开成文件的原因：那边的 fs mock 刻意保留 readFileSync/readdirSync
// actual（日记知识工具会精确读取 project-background/SKILL.md），这里被测的恰恰是读函数，必须 mock 读——
// 两套 fs mock 语义互斥，各自独立模块注册表互不干扰。
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // service 的间接依赖会初始化本地密钥；本测试把 readFileSync 改成 mock 后，
    // 也必须让 existsSync 与这套虚拟文件系统一致，避免真实文件存在却读到 undefined。
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

import { readdirSync, readFileSync } from 'fs'

// 同 xingyiDiaryService.spec.js 口径：chatRepository 顶层 import 真实 db.js 单例，整模块替换避免碰真库。
vi.mock('../../../server/repositories/chatRepository.js', () => ({
  chatRepository: {
    listAllMessagesInRange: vi.fn(),
    listTidiaoDirectorStreamArtifactsInRange: vi.fn()
  }
}))
vi.mock('../../../server/application/ai/aiAppService.js', () => ({
  aiAppService: { callAIWithFallback: vi.fn() },
  callInternalAIJson: vi.fn()
}))

import { listXingyiDiaryDates, readXingyiDiaryFile } from '../../../server/services/xingyiDiaryService.ts'

describe('xingyiDiaryService 日记归档只读两件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listXingyiDiaryDates', () => {
    it('只认 YYYY-MM-DD.md 命名的文件，其余（README/临时文件）不暴露，按日期新→旧排序', () => {
      readdirSync.mockReturnValue(['2026-07-16.md', 'README.md', '2026-07-17.md', 'draft.txt', '2026-7-1.md'])
      expect(listXingyiDiaryDates()).toEqual(['2026-07-17', '2026-07-16'])
    })

    it('目录不存在（还没生成过日记）按空列表处理，不抛错', () => {
      readdirSync.mockImplementation(() => {
        const error = new Error('ENOENT: no such file or directory')
        error.code = 'ENOENT'
        throw error
      })
      expect(listXingyiDiaryDates()).toEqual([])
    })
  })

  describe('readXingyiDiaryFile', () => {
    it('文件存在返回全文，路径按严格校验后的 YYYY-MM-DD.md 拼接', () => {
      readFileSync.mockReturnValue('# 2026-07-17\n\n日记正文')
      expect(readXingyiDiaryFile('2026-07-17')).toBe('# 2026-07-17\n\n日记正文')
      const [calledPath, encoding] = readFileSync.mock.calls[0]
      expect(String(calledPath).replace(/\\/g, '/')).toMatch(/docs\/diary\/2026-07-17\.md$/)
      expect(encoding).toBe('utf8')
    })

    it('文件不存在返回 null，不抛错', () => {
      readFileSync.mockImplementation(() => {
        const error = new Error('ENOENT')
        error.code = 'ENOENT'
        throw error
      })
      expect(readXingyiDiaryFile('2026-01-01')).toBeNull()
    })

    it('日期格式非法（含路径穿越）在拼路径前就抛错，绝不触发 fs 读取', () => {
      expect(() => readXingyiDiaryFile('../etc/passwd')).toThrow('非法日期格式')
      expect(() => readXingyiDiaryFile('2026-07-17.md')).toThrow('非法日期格式')
      expect(readFileSync).not.toHaveBeenCalled()
    })
  })
})
