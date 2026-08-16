import { Router } from 'express'
import type { Request, Response } from 'express'
import { docLibraryAppService } from '../application/docLibrary/docLibraryAppService.js'

const router = Router()

router.get('/doc-library', (_req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.getState())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/doc-library', (req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.replaceState(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/doc-library/import/sillytavern-worldbook/preview', (_req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.previewSillyTavernWorldbookImport())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/doc-library/import/sillytavern-worldbook/apply', (req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.applySillyTavernWorldbookImport(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/doc-library/import/world-draft/preview', (req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.previewWorldDraftImport(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/doc-library/import/world-draft/apply', (req: Request, res: Response) => {
  try {
    res.json(docLibraryAppService.applyWorldDraftImport(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
