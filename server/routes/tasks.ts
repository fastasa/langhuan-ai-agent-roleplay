/**
 * routes/tasks.ts
 * 任务管理 API
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { taskAppService } from '../application/task/taskAppService.js'

const router = Router()

// ===== 任务 =====

// 获取任务列表
router.get('/tasks', (_req: Request, res: Response) => {
  try {
    res.json(taskAppService.getTasks())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加任务
router.post('/tasks', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.addTask(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 更新任务
router.put('/tasks/:id', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.updateTask(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除任务
router.delete('/tasks/:id', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.deleteTask(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 任务日志 =====

// 添加任务日志
router.post('/task-logs', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.addTaskLog(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 获取任务日志
router.get('/task-logs', (_req: Request, res: Response) => {
  try {
    res.json(taskAppService.getTaskLogs())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 每日报告 =====

// 添加每日报告
router.post('/daily-reports', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.addDailyReport(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 获取每日报告
router.get('/daily-reports', (_req: Request, res: Response) => {
  try {
    res.json(taskAppService.getDailyReports())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/daily-reports/:id', (req: Request, res: Response) => {
  try {
    res.json(taskAppService.updateDailyReport(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
