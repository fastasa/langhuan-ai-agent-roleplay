import { Router } from 'express'
import type { Request, Response } from 'express'
import { agentRuntimeJournalAppService } from '../application/agentRuntimeJournal/agentRuntimeJournalAppService.js'
import { getActiveDataScope } from '../localWorkspace.js'

const router = Router()

function respond(
  res: Response,
  result: { ok: boolean; status: number; error?: string; data?: unknown }
) {
  if (!result.ok) {
    res.status(result.status).json({ error: result.error || 'Agent runtime journal 请求失败' })
    return
  }
  res.status(result.status).json(result.data)
}

router.get('/agent-runtime-journal/runs', (req: Request, res: Response) => {
  try {
    respond(
      res,
      agentRuntimeJournalAppService.list(getActiveDataScope(), req.query.status, req.query.limit)
    )
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

router.post('/agent-runtime-journal/runs/:runId/events', (req: Request, res: Response) => {
  try {
    respond(res, agentRuntimeJournalAppService.append(getActiveDataScope(), req.params.runId, req.body))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

router.get('/agent-runtime-journal/runs/:runId/events', (req: Request, res: Response) => {
  try {
    respond(res, agentRuntimeJournalAppService.read(getActiveDataScope(), req.params.runId))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

export default router
