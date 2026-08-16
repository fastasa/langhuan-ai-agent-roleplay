/**
 * routes/resources.ts
 * 资源管理 API
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { resourceAppService } from '../application/resource/resourceAppService.js'

const router = Router()

// ===== 资源 =====

// 获取资源
router.get('/resources', (_req: Request, res: Response) => {
  try {
    res.json(resourceAppService.getResources())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 保存资源
router.put('/resources', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.updateResources(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 票据 =====

// 获取票据列表
router.get('/tickets', (_req: Request, res: Response) => {
  try {
    res.json(resourceAppService.getTickets())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加票据
router.post('/tickets', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.addTicket(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 更新票据
router.put('/tickets/:id', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.updateTicket(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除票据
router.delete('/tickets/:id', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.deleteTicket(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 票据分类 =====

// 添加分类
router.post('/ticket-categories', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.addTicketCategory(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除分类
router.delete('/ticket-categories/:id', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.deleteTicketCategory(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 历史记录 =====

// 获取历史
router.get('/history', (_req: Request, res: Response) => {
  try {
    res.json(resourceAppService.getHistory())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加历史
router.post('/history', (req: Request, res: Response) => {
  try {
    res.json(resourceAppService.addHistoryEntry(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
