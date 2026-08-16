import { Router } from 'express'
import type { Request, Response } from 'express'
import { aiRepository } from '../repositories/aiRepository.js'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

const router = Router()

function buildUsageQuery(req: Request, forcedUserId = '') {
  return {
    range: String(req.query.range || '7d'),
    feature: String(req.query.feature || ''),
    status: String(req.query.status || ''),
    userId: forcedUserId || String(req.query.userId || ''),
    sessionId: String(req.query.sessionId || ''),
    limit: Number(req.query.limit || 100)
  }
}

router.get('/ai-usage', (req: Request, res: Response) => {
  const query = buildUsageQuery(req, LOCAL_WORKSPACE_USER_ID)
  const result = aiRepository.queryUsageLedger(query)
  const sessions = aiRepository.listUsageLedgerSessions(query)
  res.json({ ...result, sessions })
})

// 提调坞·某一轮总消耗（round_id 精确匹配，不走 range 时间窗——供坞展示「本轮总消耗」）。
router.get('/ai-usage/round', (req: Request, res: Response) => {
  const roundId = String(req.query.roundId || '').trim()
  if (!roundId) {
    res.status(400).json({ error: '缺少 roundId' })
    return
  }
  res.json(aiRepository.getUsageTotalsByRoundId(roundId, LOCAL_WORKSPACE_USER_ID))
})

export default router
