// 决策流即时持久化「工厂」（批次3a·自 useChatSendPipeline 原样抽出——一处真值、两个装配点）：
//   ① 聊天 pipeline（统筹/纠偏/精修/重排四 loop 的 persist/finalize/demote 调用点·行为零回归）；
//   ② 会话级外部装配 tidiaoSessionCorrectionRunner（星依批次3b dispatch 地基）。
// 语义（历史批次全保留）：一轮复用同一条 artifact（稳定 id=tidiao_stream_${runId}）+ 同一 attempt；
//   H1 写载降频（节流+内容签名去重，间隔见 DIRECTOR_STREAM_PERSIST_THROTTLE_MS）；K3 写库失败自愈（签名成功后置位·
//   null attempt 不缓存·flush 失败后台限次重试 5×4s·mySeq 落后放弃防旧盖新）；真取消 demote 降权不删行。
// ⚠️ 数据红线：只走现役 generation attempt / artifact 通道，不新建表、不碰 db.ts/migrations。
// 2026-07-16：节流间隔由 4000ms 收窄到 1000ms——真实进程硬崩溃走不到终态 flush，会丢「最近一次成功
//   节流写入→崩溃」窗口内的增量决策/分镜，缩窄间隔即缩窄这个丢失窗口（务实平衡：不去掉节流避免写放大）。

import type { TidiaoDirectorStream } from './tidiaoDirectorStream'
import type { AppendLogEvent } from './agentState/appendLogTypes'
import { captureAppendLogSnapshot, getActiveDirectorPrompt } from './agentState/appendLog'
import { createChatGenerationAttemptArtifactBySessionId } from '../repositories/chatRepository'

export interface DirectorStreamPersistDeps {
  /** 建生成尝试（一轮一条）：pipeline 注入其 startGenerationAttempt 包装；外部装配注入 chatTurnAudit.startChatGenerationAttempt。 */
  startAttempt: (input: {
    sessionId: string
    anchorMessageId: number
    triggerType: string
    mode: 'clean'
    targetId: string
    speakerName?: string
    tidiaoRunId: string
  }) => Promise<string>
  /** 收尾/失败标记 attempt。 */
  finishAttempt: (input: {
    attemptId: string
    sessionId: string
    status: 'completed' | 'failed'
    assistantMessageIds?: number[]
  }) => Promise<void>
  /** finalize/demote 时的会话 id 来源（pipeline=activePipelineSessionId 动态读；外部装配=固定 sessionId 闭包）。 */
  resolveFinalizeSessionId: () => string
  /** 内存回填（可选）：把最新快照写进锚消息 _processTrace，刷新前编排带即显示。外部装配（列表非 UI 活体）可不传。 */
  backfillAnchorTrace?: (anchorMessageId: number, trace: {
    directorStream: TidiaoDirectorStream
    appendLog: AppendLogEvent[]
    directorPrompt?: string
  }) => void
}

export interface DirectorStreamPersistHandle {
  persistDirectorStreamRoundIncremental: (input: {
    runId: string
    sessionId: string
    targetId: string
    /** 该轮的「用户消息 id」，与实时带锚点一致（落库+历史复原都锚用户消息）。 */
    anchorRoundMessageId: number
    speakerName: string
    snapshot: TidiaoDirectorStream | null
    flush?: boolean
    /** 首发传 'normal_send'，纠偏/精修/重试缺省 'assistant_message_retry'。 */
    triggerType?: string
    /** 「用户原始纠偏指令」随 artifact payload 落库，续接时读回高权重回灌。 */
    userInstruction?: string
  }) => Promise<void>
  /** 收束：attempt 标 completed 并清缓存。 */
  finalizeDirectorStreamPersist: (runId: string) => void
  /** 真取消：checkpoint 降权（payload 清空 + createdAt 置最早）+ attempt 标 failed，不删 DB 行。 */
  demoteDirectorStreamPersist: (runId: string) => void
}

/** H1 写载降频节流间隔：越小丢失窗口越窄，越大写放大风险越低（sql.js 整库导出写盘）。 */
const DIRECTOR_STREAM_PERSIST_THROTTLE_MS = 1000

type DirectorStreamPersistEntry = {
  attemptId: string
  artifactId: string
  createdAt: string
  anchorMessageId: number
  lastAt: number
  lastSignature?: string
  writeSeq?: number
  lastSuccessSeq?: number
}

export function createDirectorStreamPersist(deps: DirectorStreamPersistDeps): DirectorStreamPersistHandle {
  const directorStreamPersistCache = new Map<string, DirectorStreamPersistEntry>()
  const directorStreamPersistCreating = new Map<string, Promise<DirectorStreamPersistEntry | null>>()

  async function ensureDirectorStreamPersistEntry(input: {
    runId: string; sessionId: string; targetId: string; anchorMessageId: number; speakerName: string
    triggerType?: string
  }): Promise<DirectorStreamPersistEntry | null> {
    const existing = directorStreamPersistCache.get(input.runId)
    if (existing) return existing
    let creating = directorStreamPersistCreating.get(input.runId)
    if (!creating) {
      // 并发去重：多次 onDirectorStream 在首个 attempt 建好前同时进来 → 只建一个 attempt（一轮一条）。
      creating = (async () => {
        const attemptId = await deps.startAttempt({
          sessionId: input.sessionId,
          anchorMessageId: input.anchorMessageId,
          triggerType: String(input.triggerType || 'assistant_message_retry'),
          mode: 'clean',
          targetId: input.targetId,
          speakerName: input.speakerName,
          tidiaoRunId: input.runId
        })
        if (!attemptId) return null
        const entry: DirectorStreamPersistEntry = {
          attemptId,
          artifactId: `tidiao_stream_${input.runId}`,
          createdAt: new Date().toISOString(),
          anchorMessageId: input.anchorMessageId,
          lastAt: 0
        }
        directorStreamPersistCache.set(input.runId, entry)
        return entry
      })()
      directorStreamPersistCreating.set(input.runId, creating)
      // 批次K3：attempt 创建失败不缓存 null promise——删掉让下一次持久化重试建 attempt。
      void creating.then((entry) => { if (!entry) directorStreamPersistCreating.delete(input.runId) })
    }
    return creating
  }

  async function persistDirectorStreamRoundIncremental(input: {
    runId: string; sessionId: string; targetId: string
    anchorRoundMessageId: number; speakerName: string
    snapshot: TidiaoDirectorStream | null; flush?: boolean
    triggerType?: string
    userInstruction?: string
  }): Promise<void> {
    const runId = String(input.runId || '').trim()
    const sessionId = String(input.sessionId || '').trim()
    const snapshot = input.snapshot
    const anchorMessageId = Number(input.anchorRoundMessageId || 0)
    if (!runId || !sessionId || anchorMessageId <= 0) return
    if (!snapshot || !Array.isArray(snapshot.decisions) || !snapshot.decisions.length) return
    const entry = await ensureDirectorStreamPersistEntry({ runId, sessionId, targetId: input.targetId, anchorMessageId, speakerName: input.speakerName, ...(input.triggerType ? { triggerType: input.triggerType } : {}) })
    if (!entry) return
    const now = Date.now()
    // H1（写载降频）：节流 DIRECTOR_STREAM_PERSIST_THROTTLE_MS——payload 全量覆写且服务器每次写库都整库导出写盘（sql.js），高频写是崩溃风暴主燃料。
    // 停止/失败/收尾/软停各路径均有 flush:true 强制写，末态不丢。
    if (!input.flush && now - entry.lastAt < DIRECTOR_STREAM_PERSIST_THROTTLE_MS) return
    entry.lastAt = now
    // R3-2b：append log 保真事件随 directorStream 同趟落库；option C：真实 prompt 同处落库。
    const appendLogSnapshot = captureAppendLogSnapshot(runId)
    const directorPrompt = getActiveDirectorPrompt(runId)
    // H1·内容签名去重：节流路径内容没实质变化就不重写；flush 恒写。
    // 批次K3：签名只在写库**成功后**置位（见 commitSuccess），失败的那份不会被去重跳过。
    const signature = `${JSON.stringify(snapshot).length}|${appendLogSnapshot.length}|${directorPrompt.length}`
    if (!input.flush && entry.lastSignature === signature) return
    // 内存回填：刷新前编排带即显示最新决策流（锚到该轮用户消息上，与实时带、读侧一致）。
    deps.backfillAnchorTrace?.(anchorMessageId, {
      directorStream: snapshot,
      appendLog: appendLogSnapshot,
      ...(directorPrompt ? { directorPrompt } : {})
    })
    const userInstruction = String(input.userInstruction || '').trim()
    const artifactPayload = {
      id: entry.artifactId,
      attemptId: entry.attemptId,
      artifactKind: 'clean_retry',
      messageId: anchorMessageId,
      payload: { processSummary: { steps: {}, directorStream: snapshot, appendLog: appendLogSnapshot, ...(directorPrompt ? { directorPrompt } : {}), ...(userInstruction ? { userInstruction } : {}) } },
      createdAt: entry.createdAt
    }
    entry.writeSeq = (entry.writeSeq || 0) + 1
    const mySeq = entry.writeSeq
    const commitSuccess = () => {
      if (mySeq > (entry.lastSuccessSeq || 0)) { entry.lastSuccessSeq = mySeq; entry.lastSignature = signature }
    }
    // 批次K3·flush 失败后台限次重试（5 次 × 4s ≈ 覆盖 20s 级断服窗口）；
    // 「有更新的写已成功」（mySeq 落后）则放弃重试，防旧内容盖新；节流路径失败不重试（下一次节流写天然接棒）。
    const attemptWrite = (retriesLeft: number): Promise<void> =>
      createChatGenerationAttemptArtifactBySessionId(sessionId, artifactPayload).then(commitSuccess).catch((error) => {
        console.error('决策流即时持久化失败:', error)
        if (retriesLeft <= 0 || !input.flush) return
        setTimeout(() => {
          if (mySeq > (entry.lastSuccessSeq || 0)) void attemptWrite(retriesLeft - 1)
        }, 4000)
      })
    // 首发 await（保持原时序·收尾路径等第一笔）；重试在后台走 setTimeout，不阻塞收尾。
    await attemptWrite(input.flush ? 5 : 0)
  }

  function finalizeDirectorStreamPersist(runId: string): void {
    const key = String(runId || '').trim()
    const entry = directorStreamPersistCache.get(key)
    directorStreamPersistCache.delete(key)
    directorStreamPersistCreating.delete(key)
    if (!entry) return
    deps.finishAttempt({
      sessionId: deps.resolveFinalizeSessionId(),
      attemptId: entry.attemptId,
      status: 'completed',
      assistantMessageIds: [entry.anchorMessageId]
    }).catch(() => {})
  }

  function demoteDirectorStreamPersist(runId: string): void {
    const key = String(runId || '').trim()
    const entry = directorStreamPersistCache.get(key)
    directorStreamPersistCache.delete(key)
    directorStreamPersistCreating.delete(key)
    if (!entry) return
    createChatGenerationAttemptArtifactBySessionId(deps.resolveFinalizeSessionId(), {
      id: entry.artifactId,
      attemptId: entry.attemptId,
      artifactKind: 'clean_retry',
      messageId: entry.anchorMessageId,
      payload: { processSummary: { steps: {} } },
      createdAt: '1970-01-01T00:00:00.000Z'
    }).catch(() => {})
    deps.finishAttempt({ sessionId: deps.resolveFinalizeSessionId(), attemptId: entry.attemptId, status: 'failed' }).catch(() => {})
  }

  return {
    persistDirectorStreamRoundIncremental,
    finalizeDirectorStreamPersist,
    demoteDirectorStreamPersist
  }
}
