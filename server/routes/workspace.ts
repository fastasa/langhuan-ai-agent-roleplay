/**
 * routes/workspace.ts
 * 工作区快照与装载入口
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { logger } from '../logger.js'
import db from '../db.js'
import { workspaceSnapshotCommandHandler } from '../application/workspace/workspaceSnapshotCommands.js'
import { workspaceSnapshotQueryHandler } from '../application/workspace/workspaceSnapshotQueries.js'
import { getAppChangelog } from '../services/appChangelogService.js'

const router = Router()

router.get('/all', (_req: Request, res: Response) => {
  const result = workspaceSnapshotQueryHandler.getBootstrapSnapshot()
  if (!result.ok) {
    res.status(500).json({ error: result.error.message })
    return
  }
  res.json(result.data)
})

router.get('/app-changelog', (_req: Request, res: Response) => {
  res.json(getAppChangelog())
})

router.get('/export', (_req: Request, res: Response) => {
  const result = workspaceSnapshotQueryHandler.getLocalArchiveSnapshot()
  if (!result.ok) {
    res.status(500).json({ error: result.error.message })
    return
  }
  res.json(result.data)
})

router.post('/save', (_req: Request, res: Response) => {
  try {
    db._save()
    res.json({ ok: true, savedAt: new Date().toISOString() })
  } catch (error) {
    logger.error('工作区手动保存失败:', error)
    res.status(500).json({ error: '工作区保存失败' })
  }
})

router.put('/restore', (req: Request, res: Response) => {
  const result = workspaceSnapshotCommandHandler.restoreLocalArchiveSnapshot(req.body || {})
  if (!result.ok) {
    logger.error('本地快照恢复失败:', result.error.details ?? result.error.message)
    res.status(500).json({ error: result.error.message })
    return
  }
  res.json(result.data)
})

router.put('/restore/partitions', (req: Request, res: Response) => {
  const modules = Array.isArray(req.body?.modules) ? req.body.modules : []
  const snapshot = req.body?.snapshot ?? req.body ?? {}
  const result = workspaceSnapshotCommandHandler.restoreLocalArchiveSnapshotPartitions(snapshot, modules)
  if (!result.ok) {
    logger.error('本地分区快照恢复失败:', result.error.details ?? result.error.message)
    res.status(500).json({ error: result.error.message })
    return
  }
  res.json(result.data)
})

export default router
