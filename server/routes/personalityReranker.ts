/**
 * routes/personalityReranker.ts
 * 人格模型 ReRanker 服务端推理入口（移动端 / 桌面端带不动时使用）。
 * 挂在 /api/data 下，仅服务当前本地工作区。
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'
import {
  scorePersonalityPlansOnServer,
  RerankerBusyError,
  RerankerModelError
} from '../application/personality/personalityRerankerService.js'
import {
  getPersonalityInferencePrefs,
  setPersonalityInferenceMode
} from '../repositories/personalityInferencePrefsRepository.js'

const router = Router()

// 读取本地工作区推理位置偏好；服务端推理在本机始终开放。
router.get('/personality-reranker/preferences', (_req: Request, res: Response) => {
  res.json(getPersonalityInferencePrefs(LOCAL_WORKSPACE_USER_ID))
})

// 设置本地工作区推理位置偏好（auto/local/server）。
router.put('/personality-reranker/preferences', (req: Request, res: Response) => {
  res.json(setPersonalityInferenceMode(LOCAL_WORKSPACE_USER_ID, req.body?.mode))
})

router.post('/personality-reranker/score', async (req: Request, res: Response) => {
  const modelPath = String(req.body?.modelPath ?? req.body?.personalityModelPath ?? '').trim()
  const situation = String(req.body?.situation ?? '')
  const plans = Array.isArray(req.body?.plans) ? req.body.plans.map((p: unknown) => String(p ?? '')) : null
  if (!modelPath) {
    res.status(400).json({ error: '缺少人格模型路径 modelPath', code: 'MODEL_PATH_REQUIRED' })
    return
  }
  if (!plans) {
    res.status(400).json({ error: 'plans 必须是数组', code: 'PLANS_REQUIRED' })
    return
  }
  try {
    const result = await scorePersonalityPlansOnServer({ modelPath, situation, plans })
    res.json(result)
  } catch (error) {
    if (error instanceof RerankerBusyError) {
      // 排队超时：让前端按既有「评审降级」兜底出回复。
      res.status(503).json({ error: error.message, code: error.code })
      return
    }
    if (error instanceof RerankerModelError) {
      const status = error.code === 'MODEL_NOT_FOUND' ? 404 : 400
      res.status(status).json({ error: error.message, code: error.code })
      return
    }
    const message = error instanceof Error ? error.message : '人格模型服务端推理失败'
    res.status(500).json({ error: message, code: 'RERANKER_INFERENCE_FAILED' })
  }
})

export default router
