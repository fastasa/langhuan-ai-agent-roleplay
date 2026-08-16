/**
 * routes/chat.ts
 * 聊天管理 API
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { chatAppService } from '../application/chat/chatAppService.js'
import { workspaceChatFacadeService } from '../application/workspace/workspaceChatFacadeService.js'
import { workspaceMetaAppService } from '../application/workspace/workspaceMetaAppService.js'
import { saveChatImageDataUri } from '../repositories/chatImageStorage.js'
import { narrativeSeedAppService } from '../application/world/narrativeSeedAppService.js'
import { orchestrationPresenceAppService } from '../application/orchestration/orchestrationPresenceAppService.js'
import { orchestrationMaterialsAppService } from '../application/orchestration/orchestrationMaterialsAppService.js'
import { orchestrationWorkspaceProjectionService } from '../application/orchestration/orchestrationWorkspaceProjectionService.js'
import { orchestrationCommandService } from '../application/orchestration/orchestrationCommandService.js'
import { postRoundOrchestrationRunService } from '../application/orchestration/postRoundOrchestrationRunService.js'
import { getActiveWorkspaceId, LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

const router = Router()
const workspaceChatAppService = workspaceChatFacadeService

function getLocalWorkspaceOptions() {
  return {
    userId: LOCAL_WORKSPACE_USER_ID
  }
}

function respondWorkspaceChatResult(
  res: Response,
  result: { ok?: boolean; status?: number; error?: string; data?: unknown } | null | undefined,
  fallbackError: string
) {
  if (!result?.ok) {
    res.status(result?.status || 500).json({ error: result?.error || fallbackError })
    return
  }
  res.json(result.data ?? { ok: true })
}

function respondNarrativeSeedResult(
  res: Response,
  result: { ok?: boolean; status?: number; error?: string; details?: unknown; data?: unknown },
  fallbackError: string
) {
  if (!result?.ok) {
    res.status(result?.status || 500).json({
      error: result?.error || fallbackError,
      ...(result?.details === undefined ? {} : { details: result.details })
    })
    return
  }
  res.json(result.data)
}

function respondOrchestrationPresenceResult(
  res: Response,
  result: { ok?: boolean; status?: number; error?: string; details?: unknown; data?: unknown },
  fallbackError: string
) {
  if (!result?.ok) {
    res.status(result?.status || 500).json({
      error: result?.error || fallbackError,
      ...(result?.details === undefined ? {} : { details: result.details })
    })
    return
  }
  res.json(result.data)
}

// 输入框图片上传：JSON body { dataUri, name? }，与聊天消息落库解耦——先拿到 url，
// 再由前端把 url 装进 attachments 一起发消息。挂在 chatRouter（/api/data 前缀）以复用
// requireAuth + scopedJsonBodyParser（15mb 中档，见 jsonBodyLimits.ts）鉴权与限流。
router.post('/chat-images', (req: Request, res: Response) => {
  try {
    const dataUri = String(req.body?.dataUri || '')
    const name = String(req.body?.name || '')
    const result = saveChatImageDataUri(dataUri, name)
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ id: result.id, url: result.url, mime: result.mime, size: result.size })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.createChatSession(req.body || {}), 'create chat session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/agent-context/resolve', async (req: Request, res: Response) => {
  try {
    if (String(req.body?.agentKind ?? req.body?.agent_kind ?? '') === 'tidiao') {
      const timeGateResult = narrativeSeedAppService.syncTimeGatesForSession(req.params.sessionId)
      if (!timeGateResult.ok) {
        respondNarrativeSeedResult(res, timeGateResult, 'sync narrative seed time gates failed')
        return
      }
    }
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.getAgentContextBundleBySessionId(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'resolve agent context failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.patch('/chat-sessions/:sessionId/characters/:characterId/state', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.patchChatSessionCharacterState(req.params.sessionId, req.params.characterId, req.body || {}),
      'patch session character state failed'
    )
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// 星依总agent常驻会话：存在即返回、不存在才创建（幂等）
router.post('/chat-sessions/xingyi/ensure', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.ensureXingyiSession(), 'ensure xingyi session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 星依 /clear：新开一条星依会话（旧会话保留，可用 /resume 找回；最新会话为空则直接复用）
router.post('/chat-sessions/xingyi/new', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.createXingyiSession(), 'create xingyi session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 星依 /resume：过往会话清单（展示名=首条用户输入前20字）
router.get('/chat-sessions/xingyi/list', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listXingyiSessions(), 'list xingyi sessions failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 星依 /resume 选中：把目标会话提为活动会话并返回完整 bundle
router.post('/chat-sessions/xingyi/:sessionId/activate', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.activateXingyiSession(req.params.sessionId), 'activate xingyi session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 工作区专业Agent会话（编剧/舆图师）：按 kind+targetId（世界或世界:图纸）幂等取/建；不读星依会话。
router.post('/chat-sessions/workspace-agent/ensure', (req: Request, res: Response) => {
  try {
    const { kind, targetId, title } = req.body || {}
    respondWorkspaceChatResult(res, workspaceChatAppService.ensureWorkspaceAgentSession(String(kind || ''), String(targetId || ''), String(title || '')), 'ensure workspace agent session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 工作区专业Agent"新建对话"：同scope最新会话为空则复用，否则新开一条
router.post('/chat-sessions/workspace-agent/new', (req: Request, res: Response) => {
  try {
    const { kind, targetId, title } = req.body || {}
    respondWorkspaceChatResult(res, workspaceChatAppService.createWorkspaceAgentSession(String(kind || ''), String(targetId || ''), String(title || '')), 'create workspace agent session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 工作区专业Agent"历史对话"清单：范围收窄到当前 kind+targetId
router.get('/chat-sessions/workspace-agent/list', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listWorkspaceAgentSessions(String(req.query.kind || ''), String(req.query.targetId || '')), 'list workspace agent sessions failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 工作区专业Agent"历史对话"选中：激活前校验 kind+targetId 与当前作用域一致，防止跨世界/跨图纸误激活
router.post('/chat-sessions/workspace-agent/:sessionId/activate', (req: Request, res: Response) => {
  try {
    const { kind, targetId } = req.body || {}
    respondWorkspaceChatResult(res, workspaceChatAppService.activateWorkspaceAgentSession(req.params.sessionId, String(kind || ''), String(targetId || '')), 'activate workspace agent session failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit)
    const beforeId = req.query.beforeId === undefined ? undefined : Number(req.query.beforeId)
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatSession(req.params.sessionId, { limit, beforeId }),
      'load chat session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/character-presence', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.list(req.params.sessionId, req.query.worldId),
      'load character presence failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/character-presence/events', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.listEvents(req.params.sessionId, req.query),
      'load character presence events failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/character-presence/set', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.set(req.params.sessionId, req.body || {}),
      'set character presence failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/character-presence/propose', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.propose(req.params.sessionId, req.body || {}),
      'propose character presence failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/character-presence/commit', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.commit(req.params.sessionId, req.body || {}),
      'commit character presence failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/character-presence/cancel', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(
      res,
      orchestrationPresenceAppService.cancel(req.params.sessionId, req.body || {}),
      'cancel character presence failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/orchestration-materials', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, orchestrationMaterialsAppService.getBundle(req.params.sessionId, req.query.worldId), 'load orchestration materials failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/orchestration-workspace', (req: Request, res: Response) => {
  try {
    const timeGateResult = narrativeSeedAppService.syncTimeGatesForSession(req.params.sessionId)
    if (!timeGateResult.ok) {
      respondNarrativeSeedResult(res, timeGateResult, 'sync narrative seed time gates failed')
      return
    }
    respondOrchestrationPresenceResult(res, orchestrationWorkspaceProjectionService.read({
      userId: LOCAL_WORKSPACE_USER_ID, workspaceId: getActiveWorkspaceId(), sessionId: req.params.sessionId,
      anchorMessageId: String(req.query.anchorMessageId || ''), userText: String(req.query.userText || '')
    }), 'load orchestration workspace failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/orchestration-workspace/director', (req: Request, res: Response) => {
  try {
    const timeGateResult = narrativeSeedAppService.syncTimeGatesForSession(req.params.sessionId)
    if (!timeGateResult.ok) {
      respondNarrativeSeedResult(res, timeGateResult, 'sync narrative seed time gates failed')
      return
    }
    const result = orchestrationWorkspaceProjectionService.read({
      userId: LOCAL_WORKSPACE_USER_ID, workspaceId: getActiveWorkspaceId(), sessionId: req.params.sessionId,
      anchorMessageId: String(req.body?.anchorMessageId || ''), userText: String(req.body?.userText || '')
    }, {
      forcedCharacterIds: Array.isArray(req.body?.forcedCharacterIds) ? req.body.forcedCharacterIds : [],
      maxPromptChars: Number(req.body?.maxPromptChars || 16000)
    })
    respondOrchestrationPresenceResult(res, result.ok ? { ok: true, data: result.data.director } : result, 'load director orchestration projection failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/orchestration-workspace/commands', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, orchestrationCommandService.execute({
      userId: LOCAL_WORKSPACE_USER_ID,
      workspaceId: getActiveWorkspaceId(),
      sessionId: req.params.sessionId,
      request: { operations: Array.isArray(req.body?.operations) ? req.body.operations : [] }
    }), 'execute orchestration commands failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/narrative-seeds/sync-time-gates', (req: Request, res: Response) => {
  try {
    respondNarrativeSeedResult(
      res,
      narrativeSeedAppService.syncTimeGatesForSession(req.params.sessionId),
      'sync narrative seed time gates failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/post-round-runs', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, postRoundOrchestrationRunService.listUnresolved({
      userId: LOCAL_WORKSPACE_USER_ID, workspaceId: getActiveWorkspaceId()
    }, req.params.sessionId), 'load post-round orchestration runs failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/post-round-runs', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, postRoundOrchestrationRunService.create({
      userId: LOCAL_WORKSPACE_USER_ID, workspaceId: getActiveWorkspaceId()
    }, {
      sessionId: req.params.sessionId,
      inputMessageId: Number(req.body?.inputMessageId || 0),
      triggerKind: req.body?.triggerKind,
      idempotencyKey: String(req.body?.idempotencyKey || ''),
      restartExisting: req.body?.restartExisting === true
    }), 'create post-round orchestration run failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.patch('/chat-sessions/:sessionId/post-round-runs/:runId', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, postRoundOrchestrationRunService.transition({
      userId: LOCAL_WORKSPACE_USER_ID, workspaceId: getActiveWorkspaceId()
    }, req.params.sessionId, req.params.runId, req.body || {}), 'update post-round orchestration run failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/orchestration-materials/narrative-override', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, orchestrationMaterialsAppService.saveOverride(req.params.sessionId, req.body || {}), 'save narrative override failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/orchestration-materials/state', (req: Request, res: Response) => {
  try {
    respondOrchestrationPresenceResult(res, orchestrationMaterialsAppService.saveState(req.params.sessionId, req.body || {}), 'save orchestration state failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatSessionById(req.params.sessionId, req.body || {}),
      'update chat session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/batch-delete', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatSessionsByIds(req.body || {}),
      'batch delete chat sessions failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatSessionById(req.params.sessionId),
      'delete chat session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/archive', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.archiveChatSessionById(req.params.sessionId, req.body || {}),
      'archive chat session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/clear-context', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.clearChatSessionContextBySessionId(req.params.sessionId, req.body || {}),
      'clear chat context failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/generation-attempts/latest', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getLatestChatGenerationAttemptByAnchor(req.params.sessionId, String(req.query.anchorMessageId || '')),
      'load generation attempt failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/generation-attempts/by-run', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listChatGenerationAttemptsByRunId(req.params.sessionId, String(req.query.runId || ''), String(req.query.limit || '')),
      'load generation attempts by run failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/generation-attempts', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listChatGenerationAttemptsBySessionId(req.params.sessionId, String(req.query.limit || '')),
      'load generation attempts failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/generation-attempts', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatGenerationAttemptBySessionId(req.params.sessionId, req.body || {}),
      'create generation attempt failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/generation-attempts/:attemptId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatGenerationAttemptBySessionId(req.params.sessionId, req.params.attemptId, req.body || {}),
      'update generation attempt failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/generation-attempt-artifacts', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatGenerationAttemptArtifactBySessionId(req.params.sessionId, req.body || {}),
      'create generation attempt artifact failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/messages', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.addChatMessageBySessionId(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'add chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/message-notes', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listChatMessageNotesBySessionId(req.params.sessionId),
      'load chat message notes failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/message-notes', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.addChatMessageNoteBySessionId(req.params.sessionId, req.body || {}),
      'add chat message note failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/message-notes/:noteId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatMessageNoteBySessionId(req.params.sessionId, req.params.noteId),
      'delete chat message note failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/session-temporary-characters', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listSessionTemporaryCharactersBySessionId(req.params.sessionId),
      'load session temporary characters failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/session-temporary-characters', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveSessionTemporaryCharacterBySessionId(req.params.sessionId, req.body || {}),
      'save session temporary character failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/session-temporary-characters/:characterId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveSessionTemporaryCharacterBySessionId(req.params.sessionId, {
        ...(req.body || {}),
        id: req.params.characterId
      }),
      'save session temporary character failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/session-temporary-characters/:characterId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteSessionTemporaryCharacterBySessionId(req.params.sessionId, req.params.characterId),
      'delete session temporary character failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/session-temporary-characters/resolve-mention', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.createOrUpdateSessionTemporaryCharacterByMention(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'resolve session temporary character mention failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/session-temporary-entities', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listSessionTemporaryEntitiesBySessionId(req.params.sessionId),
      'load session temporary entities failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/session-temporary-entities', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveSessionTemporaryEntityBySessionId(req.params.sessionId, req.body || {}),
      'save session temporary entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/session-temporary-entities/:entityId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteSessionTemporaryEntityBySessionId(req.params.sessionId, req.params.entityId),
      'delete session temporary entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/session-temporary-entities/:entityId/persist', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.persistSessionTemporaryEntityBySessionId(req.params.sessionId, req.params.entityId, {
        ...(req.body || {}),
        ...getLocalWorkspaceOptions()
      }),
      'persist session temporary entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/session-temporary-entities/organize', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.organizeSessionTemporaryEntityByCommand(req.params.sessionId, req.body || {}, {
        ...getLocalWorkspaceOptions()
      }),
      'organize session temporary entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── 状态栏积木（模板 + 实例）：对话级，计划书 2026-07-08_状态系统积木骨架计划 ──
router.get('/chat-sessions/:sessionId/status-panel-templates', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listStatusPanelTemplatesBySessionId(req.params.sessionId),
      'load status panel templates failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/status-assets', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listStatusAssetsBySessionId(req.params.sessionId), 'load status assets failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-status-assets/publish-targets', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listStatusAssetPublishTargets(), 'load status asset publish targets failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/status-assets', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.createStatusAssetBySessionId(req.params.sessionId, req.body || {}), 'save status asset failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/status-assets/:assetId/content', (req: Request, res: Response) => {
  try {
    const result = workspaceChatAppService.resolveStatusAssetContentBySessionId(req.params.sessionId, req.params.assetId)
    if (!result.ok) return void res.status(result.status || 500).json({ error: result.error || 'load status asset content failed' })
    res.type(result.data.mimeType)
    res.sendFile(result.data.file)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/status-panel-templates', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveStatusPanelTemplateBySessionId(req.params.sessionId, req.body || {}),
      'save status panel template failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/status-panel-templates/:templateId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteStatusPanelTemplateBySessionId(req.params.sessionId, req.params.templateId),
      'delete status panel template failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/status-panels', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listStatusPanelsBySessionId(req.params.sessionId),
      'load status panels failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/status-panels/migration-preview', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.previewLegacyCharacterStatusPanelMigrationBySessionId(req.params.sessionId),
      'preview legacy character status panels failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-status-panels/migration/preview', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.previewLegacyCharacterStatusPanelMigration(),
      'preview legacy character status panels failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-status-panels/migration/execute', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.executeLegacyCharacterStatusPanelMigration(req.body || {}),
      'migrate legacy character status panels failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/status-panels/:panelId/events', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.listStatusPanelEventsBySessionId(req.params.sessionId, req.params.panelId),
      'load status panel events failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/status-panels', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveStatusPanelBySessionId(req.params.sessionId, req.body || {}),
      'save status panel failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/status-panels/:panelId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteStatusPanelBySessionId(req.params.sessionId, req.params.panelId, {
        expectedVersion: req.query.expectedVersion,
        idempotencyKey: req.query.idempotencyKey,
        source: req.query.source
      }),
      'delete status panel failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── 世界（跨会话共享一等实体·地图系统批2）：计划书 2026-07-10_地图系统计划书 ──
router.get('/worlds', (_req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listWorlds(), 'load worlds failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/worlds', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.createWorld(req.body || {}), 'create world failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 世界管理页 P1：CRUD 补全（改名/简介、软删、详情取料、文档库全量替换）
router.patch('/worlds/:worldId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateWorldById(req.params.worldId, req.body || {}),
      'update world failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 软删护栏命中时需要把 reason/count 一起带回前端，respondWorkspaceChatResult 通用错误分支只回 error，故此处不复用它
router.delete('/worlds/:worldId', (req: Request, res: Response) => {
  try {
    const result = workspaceChatAppService.deleteWorldById(req.params.worldId) as {
      ok?: boolean
      status?: number
      error?: string
      reason?: string
      count?: number
      data?: unknown
    }
    if (!result?.ok) {
      const body: Record<string, unknown> = { error: result?.error || 'delete world failed' }
      if (result?.reason) body.reason = result.reason
      if (typeof result?.count === 'number') body.count = result.count
      res.status(result?.status || 500).json(body)
      return
    }
    res.json(result.data ?? { ok: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/worlds/:worldId/detail', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.getWorldDetailById(req.params.worldId), 'load world detail failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/worlds/:worldId/doc-links', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.replaceWorldDocLinksById(req.params.worldId, req.body || {}),
      'replace world doc links failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/worlds/:worldId/entities', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.listWorldEntitiesByWorldId(req.params.worldId), 'load world entities failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/worlds/:worldId/entities', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.saveWorldEntityByWorldId(req.params.worldId, req.body || {}), 'save world entity failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.patch('/worlds/:worldId/entities/:entityId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveWorldEntityByWorldId(req.params.worldId, { ...(req.body || {}), id: req.params.entityId }),
      'update world entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/worlds/:worldId/entities/:entityId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteWorldEntityByWorldId(req.params.worldId, req.params.entityId),
      'delete world entity failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 世界级剧本/叙事种子：正式账本 CRUD、只读迁移预览，以及批次2提调确定性取料。
router.get('/narrative-seed-protocol', (_req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.protocol(), 'load narrative seed protocol failed')
})

router.get('/worlds/:worldId/narrative-script-config', (req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.getConfig(req.params.worldId), 'load narrative script config failed')
})

router.put('/worlds/:worldId/narrative-script-config', (req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.saveConfig(req.params.worldId, req.body || {}), 'save narrative script config failed')
})

router.get('/worlds/:worldId/narrative-seeds', (req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.listSeeds(req.params.worldId), 'list narrative seeds failed')
})

router.post('/worlds/:worldId/narrative-seeds/relevant', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.selectRelevantSeeds(req.params.worldId, req.body || {}),
    'select relevant narrative seeds failed'
  )
})

router.post('/worlds/:worldId/narrative-seeds/overdue-scan', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.selectOverdueSeeds(req.params.worldId, req.body || {}),
    'scan overdue narrative seeds failed'
  )
})

router.post('/worlds/:worldId/narrative-seeds', (req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.createSeed(req.params.worldId, req.body || {}), 'create narrative seed failed')
})

router.get('/worlds/:worldId/narrative-seeds/:seedId', (req: Request, res: Response) => {
  respondNarrativeSeedResult(res, narrativeSeedAppService.getSeed(req.params.worldId, req.params.seedId), 'load narrative seed failed')
})

router.patch('/worlds/:worldId/narrative-seeds/:seedId', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.updateSeed(req.params.worldId, req.params.seedId, req.body || {}),
    'update narrative seed failed'
  )
})

router.delete('/worlds/:worldId/narrative-seeds/:seedId', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.deleteSeed(req.params.worldId, req.params.seedId, req.body || {}),
    'delete narrative seed failed'
  )
})

router.post('/worlds/:worldId/narrative-seeds/:seedId/impact-events', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.recordImpact(req.params.worldId, req.params.seedId, req.body || {}),
    'record narrative seed impact failed'
  )
})

router.post('/worlds/:worldId/narrative-migration-preview', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.previewLegacyMigration(req.params.worldId, req.body || {}),
    'preview narrative migration failed'
  )
})

router.post('/worlds/:worldId/narrative-migration-execute', (req: Request, res: Response) => {
  respondNarrativeSeedResult(
    res,
    narrativeSeedAppService.executeLegacyMigration(req.params.worldId, req.body || {}),
    'execute narrative migration failed'
  )
})

// 会话挂世界唯一入口：{ worldId } 挂已有 / { name, description? } 一键创建并挂 / { detach: true } 解绑
router.post('/chat-sessions/:sessionId/world', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.attachWorldToSessionBySessionId(req.params.sessionId, req.body || {}),
      'attach world to session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 状态栏并入世界（批3）：把本会话全部会话级状态栏（模板+实例）升为世界级
router.post('/chat-sessions/:sessionId/status-panels/merge-into-world', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.mergeSessionStatusPanelsIntoWorld(req.params.sessionId),
      'merge status panels into world failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── 地图数据骨架（地图系统批4）：图纸+要素只挂世界；读=弹窗/绘舆共用 bundle，写=绘舆工具与手插数据共用 ──
router.get('/worlds/:worldId/map', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.getWorldMapBundle(req.params.worldId), 'load world map failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/worlds/:worldId/map/sheets', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveWorldMapSheet(req.params.worldId, req.body || {}),
      'save map sheet failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/worlds/:worldId/map/features', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.saveWorldMapFeatures(req.params.worldId, req.body || {}),
      'save map features failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/worlds/:worldId/map/features/:featureId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      // 版本历史（批L）：DELETE 请求体在部分代理下不可靠，runMeta 走 query 透传
      workspaceChatAppService.deleteWorldMapFeature(req.params.worldId, req.params.featureId, {
        runKey: req.query.runKey,
        runLabel: req.query.runLabel
      }),
      'delete map feature failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 地图版本历史（批L）：按 run 分组的变更历史（runKey/runLabel/时间/op 计数/明细），最多最近 50 组
router.get('/worlds/:worldId/map/change-log', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getWorldMapChangeLog(req.params.worldId),
      'load world map change log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/improvised-character/context', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.prepareImprovisedCharacterContextBySessionId(req.params.sessionId, req.body || {}),
      'prepare improvised character context failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/improvised-character/extract', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.extractImprovisedCharacterBySessionId(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'extract improvised character failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/improvised-character/create', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.createImprovisedCharacterBySessionId(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'create improvised character failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/messages/:msgId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatMessageBySessionId(req.params.sessionId, req.params.msgId, req.body || {}),
      'update chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/messages/:msgId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatMessageBySessionId(req.params.sessionId, req.params.msgId),
      'delete chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/messages', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.clearChatMessagesBySessionId(req.params.sessionId),
      'clear chat failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/messages/:msgId/projection/run', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.runChatMessageProjectionBySessionId(
        req.params.sessionId,
        req.params.msgId,
        getLocalWorkspaceOptions(),
        // 消耗溯源：批量投影从 body 带 op 单元 id；单条投影不带=服务端并入消息所在轮。
        {
          unitId: String(req.body?.unitId || ''),
          unitKind: String(req.body?.unitKind || '')
        }
      ),
      'run message projection failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/messages/:msgId/projection/embedded', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.saveEmbeddedChatMessageProjectionBySessionId(
        req.params.sessionId,
        req.params.msgId,
        req.body || {},
        getLocalWorkspaceOptions()
      ),
      'save embedded message projection failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/personality-model/observations', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatPersonalityModelObservationsBySessionId(req.params.sessionId, getLocalWorkspaceOptions()),
      'load personality model observations failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/personality-model/projection-writeback/run', async (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      await workspaceChatAppService.runChatProjectionWritebackBySessionId(req.params.sessionId, req.body || {}, getLocalWorkspaceOptions()),
      'run projection writeback failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/personality-model/context', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.buildPersonalityModelContextBySessionId(req.params.sessionId, req.body || {}),
      'build personality model context failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/projection-first-message-view', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getProjectionFirstMessageViewBySessionId(req.params.sessionId, req.body || {}),
      'build projection-first message view failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/prompt-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatPromptLogsBySessionId(req.params.sessionId, Number(req.query.page || 1)),
      'load prompt logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/prompt-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatPromptLogBySessionId(req.params.sessionId, req.body || {}),
      'create prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/prompt-logs/:logId/bind-message', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.bindChatPromptLogMessageBySessionId(
        req.params.sessionId,
        req.params.logId,
        Number(req.body?.messageId ?? req.body?.assistantMessageId ?? 0)
      ),
      'bind prompt log message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/prompt-logs/locate-log/:logId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatPromptLogByLogIdBySessionId(req.params.sessionId, req.params.logId),
      'locate prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/prompt-logs/locate/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatPromptLogBySessionId(req.params.sessionId, req.params.messageId, String(req.query.kind || '')),
      'locate prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/recall-activity-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatRecallActivityLogsBySessionId(req.params.sessionId, Number(req.query.page || 1)),
      'load recall activity logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-sessions/:sessionId/prompt-logs/by-message/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatPromptLogsByMessageId(
        req.params.sessionId,
        req.params.messageId,
        String(req.query.keepLogId || '')
      ),
      'delete prompt logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-sessions/:sessionId/recall-activity-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatRecallActivityLogBySessionId(req.params.sessionId, req.body || {}),
      'create recall activity log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-sessions/:sessionId/recall-activity-logs/:logId/bind-message', (req: Request, res: Response) => {
  try {
    const assistantMessageId = Number(req.body?.messageId ?? req.body?.assistantMessageId ?? 0)
    const inputMessageId = Number(req.body?.inputMessageId ?? 0)
    const updatePayload = req.body?.activity !== undefined
      ? workspaceChatAppService.updateChatRecallActivityLogBySessionId(req.params.sessionId, req.params.logId, {
        ...req.body,
        assistantMessageId,
        inputMessageId
      })
      : workspaceChatAppService.bindChatRecallActivityLogMessageBySessionId(
        req.params.sessionId,
        req.params.logId,
        assistantMessageId,
        inputMessageId
      )
    respondWorkspaceChatResult(
      res,
      updatePayload,
      'bind recall activity log message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-sessions/:sessionId/recall-activity-logs/locate/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatRecallActivityLogBySessionId(req.params.sessionId, req.params.messageId),
      'locate recall activity log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 获取聊天记录
router.get('/chat/:targetId', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit)
    const beforeId = req.query.beforeId === undefined ? undefined : Number(req.query.beforeId)
    respondWorkspaceChatResult(res, workspaceChatAppService.getChat(req.params.targetId, { limit, beforeId }), 'load chat failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat/:targetId/prompt-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatPromptLogs(req.params.targetId, Number(req.query.page || 1)),
      'load prompt logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat/:targetId/prompt-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatPromptLog(req.params.targetId, req.body || {}),
      'create prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat/:targetId/prompt-logs/:logId/bind-message', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.bindChatPromptLogMessage(
        req.params.targetId,
        req.params.logId,
        Number(req.body?.messageId ?? req.body?.assistantMessageId ?? 0)
      ),
      'bind prompt log message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat/:targetId/prompt-logs/locate-log/:logId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatPromptLogByLogId(req.params.targetId, req.params.logId),
      'locate prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat/:targetId/prompt-logs/locate/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatPromptLog(req.params.targetId, req.params.messageId, String(req.query.kind || '')),
      'locate prompt log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat/:targetId/recall-activity-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.getChatRecallActivityLogs(req.params.targetId, Number(req.query.page || 1)),
      'load recall activity logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat/:targetId/prompt-logs/by-message/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatPromptLogsByMessageId(
        req.params.targetId,
        req.params.messageId,
        String(req.query.keepLogId || '')
      ),
      'delete prompt logs failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat/:targetId/recall-activity-logs', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.createChatRecallActivityLog(req.params.targetId, req.body || {}),
      'create recall activity log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat/:targetId/recall-activity-logs/:logId/bind-message', (req: Request, res: Response) => {
  try {
    const assistantMessageId = Number(req.body?.messageId ?? req.body?.assistantMessageId ?? 0)
    const inputMessageId = Number(req.body?.inputMessageId ?? 0)
    const updatePayload = req.body?.activity !== undefined
      ? workspaceChatAppService.updateChatRecallActivityLog(req.params.targetId, req.params.logId, {
        ...req.body,
        assistantMessageId,
        inputMessageId
      })
      : workspaceChatAppService.bindChatRecallActivityLogMessage(
        req.params.targetId,
        req.params.logId,
        assistantMessageId,
        inputMessageId
      )
    respondWorkspaceChatResult(
      res,
      updatePayload,
      'bind recall activity log message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat/:targetId/recall-activity-logs/locate/:messageId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.locateChatRecallActivityLog(req.params.targetId, req.params.messageId),
      'locate recall activity log failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 原子复制消息：校验完成后由 repository 单事务按输入顺序写入。
router.post('/chat/:targetId/messages/batch-copy', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.copyChatMessages(req.params.targetId, req.body || {}),
      'copy chat messages failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加消息
router.post('/chat/:targetId/messages', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.addChatMessage(req.params.targetId, req.body || {}),
      'add chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 更新消息
router.put('/chat/:targetId/messages/:msgId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatMessage(req.params.targetId, req.params.msgId, req.body || {}),
      'update chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除单条消息
router.delete('/chat/:targetId/messages/:msgId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatMessage(req.params.targetId, req.params.msgId),
      'delete chat message failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 清空聊天记录
router.delete('/chat/:targetId/messages', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.clearChatMessages(req.params.targetId), 'clear chat failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 更新会话信息
router.put('/chat/:targetId/session', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatSession(req.params.targetId, req.body || {}),
      'update chat session failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat/:targetId/new-session', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(res, workspaceChatAppService.startNewChat(req.params.targetId), 'start new chat failed')
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/chat-archives', (_req: Request, res: Response) => {
  try {
    res.json(workspaceChatAppService.listChatArchives())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.put('/chat-archives/:archiveId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.updateChatArchive(req.params.archiveId, req.body || {}),
      'update chat archive failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.delete('/chat-archives', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.deleteChatArchives(req.body?.ids || []),
      'delete chat archives failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-archives/:archiveId/load/:targetId', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.loadChatArchive(req.params.archiveId, req.params.targetId),
      'load chat archive failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-archives/export', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.exportChatArchives(req.body?.ids || []),
      'export chat archives failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/chat-archives/import', (req: Request, res: Response) => {
  try {
    respondWorkspaceChatResult(
      res,
      workspaceChatAppService.importChatArchives(req.body || {}),
      'import chat archives failed'
    )
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ===== 总结库 =====

// 获取总结列表
router.get('/summaries', (_req: Request, res: Response) => {
  try {
    res.json(chatAppService.getSummaries())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 添加总结
router.post('/summaries', (req: Request, res: Response) => {
  try {
    res.json(chatAppService.addSummary(req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 更新总结
router.put('/summaries/:id', (req: Request, res: Response) => {
  try {
    res.json(chatAppService.updateSummary(req.params.id, req.body || {}))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// 删除总结
router.delete('/summaries/:id', (req: Request, res: Response) => {
  try {
    res.json(chatAppService.deleteSummary(req.params.id))
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get('/small-summaries', (_req: Request, res: Response) => {
  try {
    res.json(workspaceMetaAppService.getSmallSummaries())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/small-summaries', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.addSmallSummary(req.body || {}), 'add small summary failed')
})

router.put('/small-summaries/:id', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.updateSmallSummary(req.params.id, req.body || {}), 'update small summary failed')
})

router.delete('/small-summaries/:id', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.deleteSmallSummary(req.params.id), 'delete small summary failed')
})

router.get('/big-summaries', (_req: Request, res: Response) => {
  try {
    res.json(workspaceMetaAppService.getBigSummaries())
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/big-summaries', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.addBigSummary(req.body || {}), 'add big summary failed')
})

router.put('/big-summaries/:id', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.updateBigSummary(req.params.id, req.body || {}), 'update big summary failed')
})

router.delete('/big-summaries/:id', (req: Request, res: Response) => {
  respondWorkspaceChatResult(res, workspaceMetaAppService.deleteBigSummary(req.params.id), 'delete big summary failed')
})

export default router
