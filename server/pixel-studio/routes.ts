/**
 * pixel-studio/routes.ts
 * 像素文档 CRUD 路由，工厂函数注入落盘目录；鉴权与挂载前缀由调用方（server.ts）决定，模块自身不 import 琅嬛鉴权中间件。
 */
import express, { Router } from 'express'
import type { Request, Response } from 'express'
import { createPixelStore } from './store.js'

export function createPixelStudioRouter(opts: { storageDir: string }): Router {
  const router = Router()
  const store = createPixelStore(opts.storageDir)

  // 全局 express.json 默认限额 256kb（见 server/middleware/jsonBodyLimits.ts），
  // 而像素文档校验上限为 2MB，故本 Router 单独挂一档更大的解析器。
  router.use(express.json({ limit: '3mb' }))

  router.get('/docs', (_req: Request, res: Response) => {
    res.json({ docs: store.listDocs() })
  })

  router.get('/docs/:id', (req: Request, res: Response) => {
    const result = store.getDoc(req.params.id)
    if (!result) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    res.json(result)
  })

  router.post('/docs', (req: Request, res: Response) => {
    const saved = store.saveDoc(null, req.body?.doc)
    if (saved.errors) {
      res.status(400).json({ error: 'INVALID_DOC', errors: saved.errors })
      return
    }
    res.json({ id: saved.id })
  })

  router.put('/docs/:id', (req: Request, res: Response) => {
    const existing = store.getDoc(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    const saved = store.saveDoc(req.params.id, req.body?.doc)
    if (saved.errors) {
      res.status(400).json({ error: 'INVALID_DOC', errors: saved.errors })
      return
    }
    res.json({ ok: true })
  })

  router.delete('/docs/:id', (req: Request, res: Response) => {
    const deleted = store.deleteDoc(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'NOT_FOUND' })
      return
    }
    res.json({ ok: true })
  })

  return router
}
