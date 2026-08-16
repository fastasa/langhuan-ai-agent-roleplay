/**
 * routes/meta.ts
 * 工作区元数据与配置入口
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { settingAppService } from '../application/setting/settingAppService.js'
import { workspaceMetaAppService } from '../application/workspace/workspaceMetaAppService.js'

const router = Router()

function respondResult(
  res: Response,
  result: { ok: boolean, status?: number, error?: string, data?: any }
) {
  if (!result.ok) {
    res.status(result.status ?? 500).json({ error: result.error ?? '请求失败' })
    return
  }
  res.json(result.data ?? { ok: true })
}

router.get('/config', (_req: Request, res: Response) => {
  res.json(settingAppService.getConfigMap())
})

router.put('/config', (req: Request, res: Response) => {
  respondResult(res, settingAppService.updateConfig(req.body || {}))
})

// 本地编排配置：GET 读取，PUT 保存。
router.get('/orchestrator-config', (_req: Request, res: Response) => {
  res.json(settingAppService.getReplyPlanOrchestratorConfig())
})

// 当前用户「有效」编排配置（用户级覆盖优先，回退全局 system 基线）：供聊天发送链路读运行时真值
router.get('/orchestrator-config/effective', (_req: Request, res: Response) => {
  res.json(settingAppService.getEffectiveReplyPlanOrchestratorConfig())
})

router.put('/orchestrator-config', (req: Request, res: Response) => {
  respondResult(res, settingAppService.updateReplyPlanOrchestratorConfig(req.body || {}))
})

router.get('/api-presets', (_req: Request, res: Response) => {
  res.json(workspaceMetaAppService.getApiPresets())
})

router.post('/api-presets', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.addApiPreset(req.body || {}))
})

router.put('/api-presets/:name', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.updateApiPreset(req.params.name, req.body || {}))
})

router.delete('/api-presets/:name', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.deleteApiPreset(req.params.name))
})

router.get('/prompt-presets', (_req: Request, res: Response) => {
  res.json(workspaceMetaAppService.getPromptPresets())
})

router.post('/prompt-presets', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.addPromptPreset(req.body || {}))
})

router.put('/prompt-presets/replace', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.replacePromptPresets(req.body || {}))
})

router.put('/prompt-presets/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.updatePromptPreset(req.params.id, req.body || {}))
})

router.delete('/prompt-presets/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.deletePromptPreset(req.params.id))
})

router.get('/custom-tags', (_req: Request, res: Response) => {
  res.json(workspaceMetaAppService.getCustomTags())
})

router.post('/custom-tags', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.addCustomTag(req.body || {}))
})

router.put('/custom-tags/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.updateCustomTag(req.params.id, req.body || {}))
})

router.delete('/custom-tags/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.deleteCustomTag(req.params.id))
})

router.get('/event-stack', (req: Request, res: Response) => {
  const requestedDate = typeof req.query.date === 'string' ? req.query.date.trim() : ''
  res.json(workspaceMetaAppService.getEventStack(requestedDate || undefined))
})

router.post('/event-stack', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.addEventStack(req.body || {}))
})

router.put('/event-stack/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.updateEventStack(req.params.id, req.body || {}))
})

router.delete('/event-stack/:id', (req: Request, res: Response) => {
  respondResult(res, workspaceMetaAppService.deleteEventStack(req.params.id))
})

router.get('/event-stack/today', (req: Request, res: Response) => {
  const requestedDate = typeof req.query.date === 'string' ? req.query.date.trim() : ''
  res.json(workspaceMetaAppService.getTodayEventStack(requestedDate || undefined))
})

export default router
