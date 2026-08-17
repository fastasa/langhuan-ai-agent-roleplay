// 星依聊天日记化归档 —— 批次2 路由
import { Router } from 'express'
import type { Request, Response } from 'express'
import { settingRepository } from '../repositories/settingRepository.js'
import {
  generateXingyiDiaryMarkdown,
  writeXingyiDiaryFile,
  listXingyiDiaryDates,
  readXingyiDiaryFile,
  getXingyiDiaryDateStr,
  XINGYI_DIARY_VIEWPOINT_CONFIG_KEY,
  type XingyiDiaryViewpoint
} from '../services/xingyiDiaryService.js'
import {
  generateDueXingyiDiaries,
  resetXingyiDiaryAutoFailureState
} from '../services/xingyiDiaryScheduler.js'

const router = Router()

function normalizeViewpoint(value: unknown): XingyiDiaryViewpoint {
  return value === 'objective' ? 'objective' : 'xingyi'
}

// 读取本地工作区的日记视角设置；未设置过缺省 'xingyi'。
router.get('/xingyi/diary/viewpoint', (_req: Request, res: Response) => {
  const row = settingRepository.getConfigValue(XINGYI_DIARY_VIEWPOINT_CONFIG_KEY)
  res.json({ viewpoint: normalizeViewpoint(row?.value) })
})

// 写入本地工作区的日记视角设置。
router.post('/xingyi/diary/viewpoint', (req: Request, res: Response) => {
  const viewpoint = req.body?.viewpoint
  if (viewpoint !== 'xingyi' && viewpoint !== 'objective') {
    res.status(400).json({ error: '日记视角只能是 xingyi（星依第一人称）或 objective（第三人称客观）' })
    return
  }
  settingRepository.upsertConfigValue(XINGYI_DIARY_VIEWPOINT_CONFIG_KEY, viewpoint)
  res.json({ ok: true, viewpoint })
})

// 立即生成当前逻辑日（05:00 到此刻）的日记；凌晨 00:00～04:59 仍归入前一天。
router.post('/xingyi/diary/generate-now', async (_req: Request, res: Response) => {
  try {
    const todayStr = getXingyiDiaryDateStr()
    const row = settingRepository.getConfigValue(XINGYI_DIARY_VIEWPOINT_CONFIG_KEY)
    const viewpoint = normalizeViewpoint(row?.value)
    const markdown = await generateXingyiDiaryMarkdown(todayStr, viewpoint, 'toNow')
    writeXingyiDiaryFile(todayStr, markdown)
    resetXingyiDiaryAutoFailureState()
    res.json({ ok: true, dateStr: todayStr, viewpoint })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '生成星依日记失败' })
  }
})

// 本地网页打开、重新聚焦或跨过 08:00 时，按 05:00 逻辑日补齐日记。
router.post('/xingyi/diary/auto-generate-due', async (_req: Request, res: Response) => {
  try {
    const result = await generateDueXingyiDiaries()
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '自动补生成星依日记失败' })
  }
})

// 日记归档只读两端点，只能通过本机服务访问。
router.get('/xingyi/diary/files', (_req: Request, res: Response) => {
  res.json({ dates: listXingyiDiaryDates() })
})

router.get('/xingyi/diary/files/:dateStr', (req: Request, res: Response) => {
  const dateStr = String(req.params.dateStr || '').trim()
  let markdown: string | null
  try {
    // readXingyiDiaryFile 内部先做 YYYY-MM-DD 严格校验再拼路径，非法格式抛错（挡路径穿越）
    markdown = readXingyiDiaryFile(dateStr)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '非法日记日期' })
    return
  }
  if (markdown === null) {
    res.status(404).json({ error: `没有 ${dateStr} 这一天的日记文件` })
    return
  }
  res.json({ dateStr, markdown })
})

export default router
