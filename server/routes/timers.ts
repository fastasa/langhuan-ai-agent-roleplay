/**
 * routes/timers.ts
 * 后台计时器管理
 * 计时器状态同时存在内存和数据库（用于本地归档和服务器重启后恢复）
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { timerAppService } from '../application/timer/timerAppService.js'
import { logger } from '../logger.js'

const router = Router()

// ==================== API ====================

// GET /api/timers  获取所有活跃计时器状态
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(timerAppService.listTimers())
  } catch (err) {
    logger.error('获取计时器列表失败:', err)
    res.status(500).json({ error: '获取计时器失败' })
  }
})

// POST /api/timers  新建计时器
// body: { id, ticketId, ticketName, durationMs }
router.post('/', (req: Request, res: Response) => {
  try {
    const result = timerAppService.createTimer(req.body || {})
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    res.json(result.data)
  } catch (err) {
    logger.error('创建计时器失败:', err)
    res.status(500).json({ error: '创建计时器失败' })
  }
})

// PUT /api/timers/:id/pause  暂停
router.put('/:id/pause', (req: Request, res: Response) => {
  try {
    const result = timerAppService.pauseTimer(req.params.id)
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    res.json(result.data)
  } catch (err) {
    logger.error('暂停计时器失败:', err)
    res.status(500).json({ error: '暂停计时器失败' })
  }
})

// PUT /api/timers/:id/resume  恢复
router.put('/:id/resume', (req: Request, res: Response) => {
  try {
    const result = timerAppService.resumeTimer(req.params.id)
    if (!result.ok) {
      res.status(result.status).json({ error: result.error })
      return
    }
    res.json(result.data)
  } catch (err) {
    logger.error('恢复计时器失败:', err)
    res.status(500).json({ error: '恢复计时器失败' })
  }
})

// PUT /api/timers/replace  用本机服务快照替换全部计时器
router.put('/replace', (req: Request, res: Response) => {
  try {
    const result = timerAppService.replaceTimers(req.body || {})
    res.json(result.data)
  } catch (err) {
    logger.error('替换计时器失败:', err)
    res.status(500).json({ error: '替换计时器失败' })
  }
})

// DELETE /api/timers/:id  停止并删除
router.delete('/:id', (req: Request, res: Response) => {
  try {
    res.json(timerAppService.deleteTimer(req.params.id).data)
  } catch (err) {
    logger.error('删除计时器失败:', err)
    res.status(500).json({ error: '删除计时器失败' })
  }
})

export default router
