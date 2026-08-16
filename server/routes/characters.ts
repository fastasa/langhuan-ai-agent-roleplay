/**
 * routes/characters.ts
 * 角色管理 API
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import multer from 'multer'
import { characterAppService } from '../application/character/characterAppService.js'
import { personalityTrainingAppService } from '../application/personalityTraining/personalityTrainingAppService.js'

const router = Router()

// 人格模型 ONNX 包走 multipart 上传：内存暂存，上限 600MB（与服务端校验一致）。
const personalityModelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 600 * 1024 * 1024 }
})

// 获取角色列表
router.get('/characters', (_req: Request, res: Response) => {
  try {
    res.json(characterAppService.getCharacters())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/snapshots', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.listCharacterSnapshots(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/export-complete', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.exportCompleteCharacter(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/snapshots', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.createManualCharacterSnapshot(req.params.id, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/snapshots/cleanup', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.cleanupAutomaticCharacterSnapshots(req.params.id, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/snapshots/:snapshotId/overwrite-main', (req: Request, res: Response) => {
  try {
    const result = characterAppService.overwriteCharacterMainFromSnapshot(req.params.id, req.params.snapshotId)
    if (result && result.ok === false) {
      res.status(result.status || 409).json({ error: result.error, blockers: result.blockers })
      return
    }
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/snapshots/:snapshotId', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.getCharacterSnapshot(req.params.id, req.params.snapshotId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.delete('/characters/:id/snapshots/:snapshotId', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteCharacterSnapshot(req.params.id, req.params.snapshotId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/brain-neurons', (_req: Request, res: Response) => {
  try {
    res.json(characterAppService.getBrainNeurons())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/brain-neurons', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.replaceBrainNeurons(req.body))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加角色
router.post('/characters', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.addCharacter(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/contacts/batch-delete', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteContactsBatch(req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 更新角色
router.put('/characters/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.updateCharacter(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除角色
router.delete('/characters/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteCharacter(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 上传角色人格模型（ONNX 包），供回复时浏览器本地推理
router.post('/characters/:id/personality-model', personalityModelUpload.single('model'), (req: Request, res: Response) => {
  try {
    const file = (req as Request & { file?: { buffer: Buffer; originalname?: string } }).file
    if (!file || !file.buffer) {
      res.status(400).json({ error: '缺少上传文件（字段名 model）' })
      return
    }
    res.json(characterAppService.savePersonalityModel(req.params.id, file.buffer, file.originalname))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 删除角色人格模型
router.delete('/characters/:id/personality-model', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deletePersonalityModel(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-model/versions', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.listModelVersions(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 导出模型版本为 ONNX zip（角色名-版本名.zip），可直接在其它角色用「上传模型包」导入
router.get('/characters/:id/personality-model/versions/:versionId/export', (req: Request, res: Response) => {
  try {
    const result = personalityTrainingAppService.exportModelVersion(
      req.params.id,
      req.params.versionId,
      String(req.query.label || '')
    )
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`)
    res.send(result.zipBuffer)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 导入模型包（ONNX zip）：保存为新版本，不自动安装；用于把其它角色导出的模型迁移进来
router.post('/characters/:id/personality-model/versions/import', personalityModelUpload.single('model'), (req: Request, res: Response) => {
  try {
    const file = (req as Request & { file?: { buffer: Buffer; originalname?: string } }).file
    if (!file || !file.buffer) {
      res.status(400).json({ error: '缺少上传文件（字段名 model）' })
      return
    }
    res.json(personalityTrainingAppService.importModelVersion(req.params.id, file.buffer, file.originalname))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/personality-model/versions/:versionId/install', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.installModelVersion(req.params.id, req.params.versionId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 评测指标写回（第 7 批）：浏览器跑完冻结评测集后落账
router.put('/characters/:id/personality-model/versions/:versionId/metrics', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.saveModelVersionMetrics(req.params.id, req.params.versionId, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.delete('/characters/:id/personality-model/versions/:versionId', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.deleteModelVersion(req.params.id, req.params.versionId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-training/datasets', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.listDatasets(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/personality-training/datasets', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.createDatasetDraft(req.params.id, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.put('/characters/:id/personality-training/datasets/:datasetId/questionnaire', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.saveDatasetQuestionnaire(req.params.id, req.params.datasetId, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.put('/characters/:id/personality-training/datasets/:datasetId/answers', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.saveDatasetAnswers(req.params.id, req.params.datasetId, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ===== 训练任务（第 4 批：本机训练链路） =====

router.post('/characters/:id/personality-training/precheck', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.precheckLocalTraining(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-training/runs', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.listTrainingRuns(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/personality-training/runs', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.startTrainingRun(req.params.id, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-training/runs/:runId', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.getTrainingRun(req.params.id, req.params.runId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-training/runs/:runId/log', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.getTrainingRunLog(req.params.id, req.params.runId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/characters/:id/personality-training/runs/:runId/cancel', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.cancelTrainingRun(req.params.id, req.params.runId))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ===== 聊天记录持续优化（第 6 批） =====

// 消息选择列表：原文仅供用户人工判断；训练材料一律走投影
router.get('/characters/:id/personality-training/chat-messages', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.listChatMessageCandidates(req.params.id, { sessionId: req.query.sessionId }))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 由所选消息的可见投影构造训练数据集草稿（投影失败/缺投影消息自动跳过并记录原因）
router.post('/characters/:id/personality-training/chat-sample-drafts', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.createChatSampleDraft(req.params.id, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ===== Colab 手动后端（第 5 批） =====

// 导出 Colab 训练包：创建 awaiting_import 任务并下载 zip（Notebook + JSONL + README）
router.post('/characters/:id/personality-training/colab-package', (req: Request, res: Response) => {
  try {
    const result = personalityTrainingAppService.exportColabTrainingPackage(req.params.id, req.body || {})
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`)
    res.setHeader('X-Training-Run-Id', encodeURIComponent(String(result.run?.runId || '')))
    res.send(result.zipBuffer)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 导入 Colab 训练产物：校验 zip 入版本台账，任务转 succeeded
router.post('/characters/:id/personality-training/runs/:runId/import', personalityModelUpload.single('model'), (req: Request, res: Response) => {
  try {
    const file = (req as Request & { file?: { buffer: Buffer; originalname?: string } }).file
    if (!file || !file.buffer) {
      res.status(400).json({ error: '缺少上传文件（字段名 model）' })
      return
    }
    res.json(personalityTrainingAppService.importTrainingRunArtifact(req.params.id, req.params.runId, file.buffer, file.originalname))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.get('/characters/:id/personality-training/evaluation-sets', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.listEvaluationSets(req.params.id))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.put('/characters/:id/personality-training/evaluation-sets/:evalSetId/answers', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.saveEvaluationAnswers(req.params.id, req.params.evalSetId, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.put('/characters/:id/personality-training/evaluation-sets/:evalSetId/questions', (req: Request, res: Response) => {
  try {
    res.json(personalityTrainingAppService.saveEvaluationQuestions(req.params.id, req.params.evalSetId, req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ===== 角色分组 =====

// 添加分组
router.post('/character-groups', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.addCharacterGroup(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/character-groups/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.updateCharacterGroup(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/character-groups/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteCharacterGroup(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/groups', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.addGroup(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除分组
router.delete('/groups/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteGroup(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/groups/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.updateGroup(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/crowds', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.addCrowd(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/crowds/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.updateCrowd(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/crowds/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteCrowd(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/aliases', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.addAlias(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/aliases/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.updateAlias(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/aliases/:id', (req: Request, res: Response) => {
  try {
    res.json(characterAppService.deleteAlias(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/user-profile', (req: Request, res: Response) => {
  try {
    const result = characterAppService.updateUserProfile(req.body || {})
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
