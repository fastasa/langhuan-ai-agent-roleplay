import { describe, expect, it, vi, beforeEach } from 'vitest'

// 直接调用路由 handler 函数（express 4 Router 内部结构：router.stack[i].route.stack[0].handle），
// 不引入 supertest：项目里现有路由 spec（aiRoutesContentValidation.spec.js）也是直接测导出的纯函数，
// 这里同样绕开真实 HTTP 层，只验证 handler 的行为契约。settingRepository/xingyiDiaryService 全部
// mock 掉，测试期间不接触真实数据库、不真的调用大模型或写文件。
vi.mock('../../../server/repositories/settingRepository.js', () => ({
  settingRepository: {
    getConfigValue: vi.fn(),
    upsertConfigValue: vi.fn()
  }
}))
vi.mock('../../../server/services/xingyiDiaryService.js', () => ({
  generateXingyiDiaryMarkdown: vi.fn(),
  writeXingyiDiaryFile: vi.fn(),
  listXingyiDiaryDates: vi.fn(),
  readXingyiDiaryFile: vi.fn(),
  getXingyiDiaryDateStr: vi.fn(() => '2026-07-16'),
  XINGYI_DIARY_VIEWPOINT_CONFIG_KEY: 'xingyi_diary_viewpoint'
}))
vi.mock('../../../server/services/xingyiDiaryScheduler.js', () => ({
  generateDueXingyiDiaries: vi.fn(),
  resetXingyiDiaryAutoFailureState: vi.fn()
}))

import { settingRepository } from '../../../server/repositories/settingRepository.js'
import {
  generateXingyiDiaryMarkdown,
  writeXingyiDiaryFile,
  listXingyiDiaryDates,
  readXingyiDiaryFile
} from '../../../server/services/xingyiDiaryService.js'
import {
  generateDueXingyiDiaries,
  resetXingyiDiaryAutoFailureState
} from '../../../server/services/xingyiDiaryScheduler.js'
import router from '../../../server/routes/xingyiDiary.ts'

function findHandler(path, method) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method])
  if (!layer) throw new Error(`未找到路由：${method.toUpperCase()} ${path}`)
  return layer.route.stack[0].handle
}

function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('routes/xingyiDiary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /xingyi/diary/viewpoint', () => {
    it('未设置过时缺省返回 xingyi', () => {
      settingRepository.getConfigValue.mockReturnValue(undefined)
      const handler = findHandler('/xingyi/diary/viewpoint', 'get')
      const res = mockRes()
      handler({}, res)
      expect(settingRepository.getConfigValue).toHaveBeenCalledWith('xingyi_diary_viewpoint')
      expect(res.json).toHaveBeenCalledWith({ viewpoint: 'xingyi' })
    })

    it('已设置为 objective 时按存量值返回', () => {
      settingRepository.getConfigValue.mockReturnValue({ value: 'objective' })
      const handler = findHandler('/xingyi/diary/viewpoint', 'get')
      const res = mockRes()
      handler({}, res)
      expect(res.json).toHaveBeenCalledWith({ viewpoint: 'objective' })
    })

    it('存量值是脏数据时按缺省 xingyi 兜底', () => {
      settingRepository.getConfigValue.mockReturnValue({ value: 'not-a-viewpoint' })
      const handler = findHandler('/xingyi/diary/viewpoint', 'get')
      const res = mockRes()
      handler({}, res)
      expect(res.json).toHaveBeenCalledWith({ viewpoint: 'xingyi' })
    })
  })

  describe('POST /xingyi/diary/viewpoint', () => {
    it('非法 viewpoint 值返回 400 中文错误，不落库', () => {
      const handler = findHandler('/xingyi/diary/viewpoint', 'post')
      const res = mockRes()
      handler({ body: { viewpoint: 'bad-value' } }, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }))
      expect(settingRepository.upsertConfigValue).not.toHaveBeenCalled()
    })

    it('缺失 viewpoint 字段同样 400', () => {
      const handler = findHandler('/xingyi/diary/viewpoint', 'post')
      const res = mockRes()
      handler({ body: {} }, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('合法 viewpoint=objective 落库并返回 ok', () => {
      const handler = findHandler('/xingyi/diary/viewpoint', 'post')
      const res = mockRes()
      handler({ body: { viewpoint: 'objective' } }, res)
      expect(settingRepository.upsertConfigValue).toHaveBeenCalledWith('xingyi_diary_viewpoint', 'objective')
      expect(res.json).toHaveBeenCalledWith({ ok: true, viewpoint: 'objective' })
    })

    it('合法 viewpoint=xingyi 落库并返回 ok', () => {
      const handler = findHandler('/xingyi/diary/viewpoint', 'post')
      const res = mockRes()
      handler({ body: { viewpoint: 'xingyi' } }, res)
      expect(settingRepository.upsertConfigValue).toHaveBeenCalledWith('xingyi_diary_viewpoint', 'xingyi')
      expect(res.json).toHaveBeenCalledWith({ ok: true, viewpoint: 'xingyi' })
    })
  })

  describe('POST /xingyi/diary/generate-now', () => {
    it('直接用本地今天日期 + 当前视角生成 toNow 窗口日记并写文件', async () => {
      settingRepository.getConfigValue.mockReturnValue({ value: 'xingyi' })
      generateXingyiDiaryMarkdown.mockResolvedValue('# 2026-07-16\n\n今天的日记正文')
      const handler = findHandler('/xingyi/diary/generate-now', 'post')
      const res = mockRes()
      await handler({ body: {} }, res)

      expect(generateXingyiDiaryMarkdown).toHaveBeenCalledWith('2026-07-16', 'xingyi', 'toNow')
      expect(writeXingyiDiaryFile).toHaveBeenCalledWith('2026-07-16', '# 2026-07-16\n\n今天的日记正文')
      expect(resetXingyiDiaryAutoFailureState).toHaveBeenCalledTimes(1)
      expect(res.json).toHaveBeenCalledWith({ ok: true, dateStr: '2026-07-16', viewpoint: 'xingyi' })
    })

    it('未设置视角时按缺省 xingyi 生成', async () => {
      settingRepository.getConfigValue.mockReturnValue(undefined)
      generateXingyiDiaryMarkdown.mockResolvedValue('# 占位')
      const handler = findHandler('/xingyi/diary/generate-now', 'post')
      const res = mockRes()
      await handler({ body: {} }, res)
      expect(generateXingyiDiaryMarkdown).toHaveBeenCalledWith('2026-07-16', 'xingyi', 'toNow')
    })

    it('生成失败（模型调用抛错）时返回 400 + 中文错误信息，不写文件', async () => {
      settingRepository.getConfigValue.mockReturnValue({ value: 'objective' })
      generateXingyiDiaryMarkdown.mockRejectedValue(new Error('星依日记：模型调用失败——限流了'))
      const handler = findHandler('/xingyi/diary/generate-now', 'post')
      const res = mockRes()
      await handler({ body: {} }, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: '星依日记：模型调用失败——限流了' })
      expect(writeXingyiDiaryFile).not.toHaveBeenCalled()
      expect(resetXingyiDiaryAutoFailureState).not.toHaveBeenCalled()
    })
  })

  describe('POST /xingyi/diary/auto-generate-due', () => {
    it('返回服务端计算的顺序补生成结果', async () => {
      generateDueXingyiDiaries.mockResolvedValue({
        generatedDates: ['2026-07-14', '2026-07-15'],
        latestReadyDateStr: '2026-07-15'
      })
      const handler = findHandler('/xingyi/diary/auto-generate-due', 'post')
      const res = mockRes()
      await handler({}, res)
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        generatedDates: ['2026-07-14', '2026-07-15'],
        latestReadyDateStr: '2026-07-15'
      })
    })

    it('生成失败返回 500，让前端后续活跃检查重试', async () => {
      generateDueXingyiDiaries.mockRejectedValue(new Error('日记模型失败'))
      const handler = findHandler('/xingyi/diary/auto-generate-due', 'post')
      const res = mockRes()
      await handler({}, res)
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({ error: '日记模型失败' })
    })
  })

  // 日记归档只读两端点（2026-07-18 星依读日记批次）
  describe('GET /xingyi/diary/files', () => {
    it('直接返回本地日期列表', () => {
      listXingyiDiaryDates.mockReturnValue(['2026-07-17', '2026-07-16'])
      const handler = findHandler('/xingyi/diary/files', 'get')
      const res = mockRes()
      handler({}, res)
      expect(res.json).toHaveBeenCalledWith({ dates: ['2026-07-17', '2026-07-16'] })
    })
  })

  describe('GET /xingyi/diary/files/:dateStr', () => {
    it('文件存在返回全文', () => {
      readXingyiDiaryFile.mockReturnValue('# 2026-07-17\n\n今天的日记正文')
      const handler = findHandler('/xingyi/diary/files/:dateStr', 'get')
      const res = mockRes()
      handler({ params: { dateStr: '2026-07-17' } }, res)
      expect(readXingyiDiaryFile).toHaveBeenCalledWith('2026-07-17')
      expect(res.json).toHaveBeenCalledWith({ dateStr: '2026-07-17', markdown: '# 2026-07-17\n\n今天的日记正文' })
    })

    it('文件不存在返回 404 中文错误', () => {
      readXingyiDiaryFile.mockReturnValue(null)
      const handler = findHandler('/xingyi/diary/files/:dateStr', 'get')
      const res = mockRes()
      handler({ params: { dateStr: '2026-01-01' } }, res)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('2026-01-01') }))
    })

    it('日期格式非法（服务层抛错）返回 400，不当成 404', () => {
      readXingyiDiaryFile.mockImplementation(() => {
        throw new Error('星依日记：非法日期格式 "../etc"，需要 YYYY-MM-DD')
      })
      const handler = findHandler('/xingyi/diary/files/:dateStr', 'get')
      const res = mockRes()
      handler({ params: { dateStr: '../etc' } }, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: '星依日记：非法日期格式 "../etc"，需要 YYYY-MM-DD' })
    })
  })

})
