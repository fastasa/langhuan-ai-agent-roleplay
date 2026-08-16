// 提调纠偏「装配核心」（批次3a·2026-07-04 陈星依总agent计划 §5.2/§5.3-1）。
//
// 定位：把纠偏 loop 所需的读/编/投影/提示词上下文、层3 可见历史、锚定与失败轮重定向（真机五验③）、
// 基线容器接管（真机七验时序）从聊天 pipeline 抽出为「按会话快照装配」的自包含模块。
// **一处真值、两个入口**（联动标注·改口径两处同时生效）：
//   ① 聊天内入口 `useChatSendPipeline.correctChatMessageViaDirector`（现役纠偏行为零回归）；
//   ② 会话级外部装配 `tidiaoSessionCorrectionRunner`（按任意 sessionId 装配·星依批次3b dispatch 的地基）。
//
// 单例边界（批次3a 定清·硬要求③）：
//   `activeAgentAppendLog` / `activeTidiaoDirectorStreamRound` 是模块级单例（last-writer-wins；
//   runId 不匹配的迟到写入被各自的 drop 保护丢弃、不串轮）。`beginTidiaoCorrectionRunContainers`
//   会**接管**这两个单例（与聊天轮同语义）；因此外部装配入口必须在「无聊天提调轮在跑」时才允许启动——
//   守门在 runner 侧（`createTidiaoSessionCorrectionRunner` 的 `hasRunningChatRound` 依赖），本模块不重复判。
//   反向（外部轮在跑时用户又发聊天消息）：聊天轮照常接管单例，外部轮的后续事件按 runId 不匹配被 drop，
//   外部 loop 仍能跑完并返回结果，只是它的带记忆/实时带呈现降级——这是 3a 拍定的边界语义，不算缺陷。
//
// 时序硬约束（真机七验·2026-07-02）：活动容器快照必须在 beginAppendLog（换空容器）**之前**抓取，
// 本模块把「capture → begin → 选基线 → restore」封成一个函数保证顺序，两个入口不许各自散拼。

import type { TidiaoDirectorStream } from './tidiaoDirectorStream'
import {
  beginTidiaoDirectorStreamRound,
  buildTidiaoDirectorCarryOverFromStream,
  captureTidiaoDirectorCarryOver,
  clearTidiaoDirectorStreamRound,
  peekActiveTidiaoDirectorRoundForSession,
  renderTidiaoBandMemory,
  type TidiaoDirectorCarryOver
} from './tidiaoDirectorStreamState'
import {
  beginAppendLog,
  getActiveDirectorPrompt,
  getAppendLogEvents,
  restoreAppendLog
} from './agentState/appendLog'
import type { AppendLogEvent } from './agentState/appendLogTypes'
import { renderAppendLogProjection } from './agentState/appendLogProjection'
import { makeTidiaoRunId } from './chatTurnAudit'
import { buildProcessTraceMapFromTraces } from './replyWorkflowMessageView'
import { createTidiaoChatMessageReadContext } from './tidiaoChatMessageTools'
import { createTidiaoChatMessageEditContext } from './tidiaoChatMessageEditTools'
import {
  createTidiaoMessageProjectionContext,
  type TidiaoProjectionSource
} from './tidiaoMessageProjectionTools'
import {
  createTidiaoMessagePromptContext,
  type TidiaoMessagePromptSource
} from './tidiaoMessagePromptTools'
import { renderDirectorVisibleHistory } from './directorVisibleHistory'
import { buildToolsearchOverrideProtocol } from './tidiaoGlobalTools'
import { renderLastScenarioBlock, type LastScenario } from './orchestrationMaterialPresentation'
import {
  getHydratedLastScenario,
  getHydratedNarrativeOverrideText,
  saveFormalSessionScenario
} from './sessionOrchestrationMaterialsAdapter'
import { runNarrativeScriptwriterAnalysis, type NarrativeScriptwriterDispatchInput, type RunNarrativeScriptwriterDeps } from './narrativeScriptwriterSubagent'
import { enqueueDeferredScriptwriterReport, markDeferredAgentEventFailed } from './deferredAgentEventQueue'
import { resolveEffectiveVirtualScene } from '../utils/virtualScene'
import {
  deleteStatusPanel,
  deleteStatusPanelTemplate,
  fetchChatPersonalityModelObservationsBySessionId,
  fetchChatSessionBundleById,
  fetchLatestChatPromptLogByMessageId,
  fetchLatestChatPromptLogBySessionMessageId,
  fetchSessionTemporaryEntities,
  fetchStatusPanelTemplates,
  fetchStatusPanels,
  executeOrchestrationCommands,
  isMultiCharacterChatSession,
  normalizeChatSessionCharacterParticipants,
  saveStatusPanel,
  saveStatusPanelTemplate
} from '../repositories/chatRepository'
// 状态系统工具接缝类型（批次5·类型层）。
import type { TidiaoStatusSystemToolContext } from './tidiaoToolBusinessContext'

// ─────────────────────────────────────────────────────────────────────────────
// 会话快照源：装配只认这份快照，不关心它来自活动聊天（chatStore 内存态）还是按 sessionId 取回（外部装配）。
// ─────────────────────────────────────────────────────────────────────────────

export interface TidiaoCorrectionSessionSource {
  sessionId: string
  targetId: string
  /** 会话对象（成员/帷幕/多角色判定用）。 */
  session: Record<string, unknown> | null
  /** 消息列表（聊天内=chatStore 当前列表·含本轮已落库消息；外部=fetchChatSessionBundleById 取回）。 */
  messages: Array<Record<string, unknown>>
  /** 群组表（charStore.groups 等价·候选角色回退用）。 */
  groups: Array<Record<string, unknown>>
  /** 角色表（charStore.characters 等价·群聊按发言名兜底解析用）。 */
  characters: Array<Record<string, unknown>>
}

// ─────────────────────────────────────────────────────────────────────────────
// 成员/候选归一（自 useChatSendPipeline 移入·pipeline 现从这里 import——单一真值）
// ─────────────────────────────────────────────────────────────────────────────

/** 群成员归一：字符串 JSON / 数组 / 对象混合形态 → { characterId, probability }[]。 */
export function normalizeGroupMembers(rawMembers: unknown): Array<{ characterId: string; probability?: number }> {
  if (!rawMembers) return []
  const parsed = typeof rawMembers === 'string' ? JSON.parse(rawMembers || '[]') : rawMembers
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item) => {
      if (typeof item === 'string') return { characterId: item }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const characterId = String(record.characterId ?? record.character_id ?? record.charId ?? record.char_id ?? '').trim()
        if (!characterId) return null
        const probability = Number(record.probability ?? record.replyChance)
        return {
          characterId,
          probability: Number.isFinite(probability) ? probability : undefined
        }
      }
      return null
    })
    .filter((item): item is { characterId: string; probability?: number } => Boolean(item))
}

/** 会话成员归一（participants → { characterId, probability }[]）。 */
export function normalizeSessionParticipantMembers(
  session: unknown
): Array<{ characterId: string; probability?: number }> {
  return normalizeChatSessionCharacterParticipants(session)
    .map(({ characterId, probability }) => ({ characterId, probability }))
}

// ─────────────────────────────────────────────────────────────────────────────
// toolsearch 越权话术（R1-B item7·自 useChatSendPipeline 移入）：deferred loop callModel 共用。
// ─────────────────────────────────────────────────────────────────────────────

/** 把 toolsearch 越权话术拼到首条 system 消息末尾；toolCatalog 空则原样返回·零影响。
 *  runtime 每轮给 callModel 传新 messages 拷贝，故本处追加只影响当轮请求、不累积。 */
export function withToolsearchOverrideProtocol<T extends { role: string; content: string }>(
  messages: T[],
  toolCatalog: Array<{ name: string; brief: string; recommended: boolean }> | undefined,
  options: { fullAuthorizedToolsLoaded?: boolean } = {}
): T[] {
  const block = options.fullAuthorizedToolsLoaded
    ? '【工具信封已冻结】本轮全部授权工具及参数格式已经完整装载；直接调用需要的原生工具，不要再次调用 toolsearch。'
    : buildToolsearchOverrideProtocol(toolCatalog)
  if (!block) return messages
  const systemIndex = messages.findIndex((message) => message.role === 'system')
  if (systemIndex < 0) return messages
  return messages.map((message, index) => (
    index === systemIndex ? { ...message, content: `${message.content}\n\n${block}` } : message
  ))
}

// ─────────────────────────────────────────────────────────────────────────────
// 层2 场景锚「现在 时间·地点·天气」（批次O 三入口共用口径·格式化单一真值）
// ─────────────────────────────────────────────────────────────────────────────

/** 场景快照 → 「现在 a · b · c」；空场景返回 ''（层2 不出现）。
 *  联动：pipeline `readDirectorSceneContextNow`（统筹/纠偏/精修三入口）与外部装配都经本函数出文案。 */
export function renderDirectorSceneContextFromSnapshot(
  snapshot: { time?: unknown; location?: unknown; weather?: unknown } | null | undefined
): string {
  const parts = [
    String(snapshot?.time || '').trim(),
    String(snapshot?.location || '').trim(),
    String(snapshot?.weather || '').trim()
  ].filter(Boolean)
  return parts.length ? `现在 ${parts.join(' · ')}` : ''
}

/** 外部装配用帷幕读取：与 pipeline `readPersonalityCurtainSnapshot` 同源（resolveEffectiveVirtualScene），
 *  只取层2 需要的 time/location/weather 三值。defaults=全局兜底（聊天内来自 settingStore，外部由 runner 注入）。 */
export function readSessionCurtainSceneContext(
  session: Record<string, unknown> | null | undefined,
  defaults: { currentTime?: string; currentWeather?: string; currentLocation?: string } = {}
): string {
  const scene = resolveEffectiveVirtualScene(session as never, {
    currentTime: defaults.currentTime,
    currentWeather: defaults.currentWeather,
    currentLocation: defaults.currentLocation
  } as never, Date.now())
  return renderDirectorSceneContextFromSnapshot({
    time: (scene as { time?: unknown } | null)?.time,
    location: (scene as { location?: unknown } | null)?.location,
    weather: (scene as { weather?: unknown } | null)?.weather
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 会话正式编排资料同步读侧：pipeline 开局先从服务端 hydrate；旧 localStorage 只由兼容适配器在读取失败时回退。
// ─────────────────────────────────────────────────────────────────────────────

/** 本会话编排倾向文本（服务端 hydrate 后同步读取；空串=无）。 */
export function loadSessionDirectorPrefText(sessionId: string): string {
  return getHydratedNarrativeOverrideText(String(sessionId || ''))
}

/** 层2 上轮情境承接块（批次O·空串=不注入）。 */
export function renderSessionLastScenarioBlock(sessionId: string): string {
  return renderLastScenarioBlock(getHydratedLastScenario(String(sessionId || '')))
}

/** 统筹收尾写回最近情境；正式行必须携带消息或 artifact 锚，不能再写无证据浏览器缓存。 */
export function saveSessionLastScenario(sessionId: string, last: LastScenario | null, anchorMessageId = ''): void {
  if (!last?.code) return
  void saveFormalSessionScenario(String(sessionId || ''), { ...last, anchorMessageId }).catch((error) => {
    console.warn('[orchestration-materials] 最近情境写入失败', error)
  })
}

// ── 编剧后台派遣（串行压缩批A·2026-07-13·全项目首个 fire-and-forget 子代理通道） ──
// 单飞真值：同会话同时只允许一个编剧在跑（键=sessionId）。dispatch 链到既有 pending 之后顺序执行
// （真实场景编剧常态首轮交稿、用户轮间隔分钟级，积压罕见；链深不设上限、>3 时 warn 观测）。
// 结果只写会话剧本缓存（编剧本来的真值位），失败静默 warn——下一轮 consultScript 开局 await pending
// 拿最新本再判偏差（awaitPendingScriptwriterRun），保证「后台修订绝不与阻塞咨询并发写」。
// ⚠️ 后台跑的 callModel/loop 不许绑轮级 abortSignal（拍板：轮停止不杀后台编剧）——由调用方装配保证。
const pendingBackgroundScriptwriterRuns = new Map<string, { chain: Promise<void>; depth: number }>()

/** 统筹层2【上轮剧本摘要】块（串行压缩批A）：提调判偏差（consultScript deviation 三档）的依据——
 *  只渲染 digest 一行（阶段/张力/下一拍·与 consultScript 回执同一格式，「整本不暴露」口径不破）。
 *  轮开局读一次传入 harness（分段开局定死），轮内编剧修订不回写本块（缓存断面保护——修订反映在层5 回执日志里）。
 *  无剧本返回空串=不注入。 */
/** 编剧 subagent 调用接缝（批次5 收编·2026-07-07 抽共用·统筹轮+纠偏轮+外部装配联动能力；
 *  2026-07-10 剧本系统优化批次3 升真 loop；2026-07-13 串行压缩批A 增后台派遣两件）：读/写会话剧本缓存 +
 *  runScriptwriterLoop——运行状态埋点（带「剧本」入口/面板状态条/决策流 sticky 编剧卡三处 UI·纠偏轮同样生效）在 loop 内；
 *  本接缝只负责会话缓存、倾向注入与依赖转交（callModel=smart 掌阁档 loop 调用、tools=只读取证工具集，
 *  均由调用方装配传入，聊天内=pipeline buildScriptwriterSeam·本模块不 import composable）。
 *  backgroundCallModel（批A·可选）：**不绑轮级 abortSignal** 的同档模型调用——在位才开放后台派遣
 *  （dispatchScriptwriterBackground）；缺省=无后台通道，consultScript low/medium 自动回退阻塞路径。
 *  消费方：统筹 runGroupDirectorHarness.scriptSeam + 纠偏 runTidiaoCorrectionLoop.scriptSeam（精修子模式不挂）。 */
export function buildSessionScriptwriterSeam(
  sessionId: string,
  callModel: RunNarrativeScriptwriterDeps['callModel'],
  options?: {
    tools?: RunNarrativeScriptwriterDeps['tools']
    originRunId?: string
    /** 每次异步派遣时重新取得最新的统一上下文，避免把上一轮快照长期闭包缓存。 */
    loadContextBlock?: () => Promise<string>
  }
): {
  dispatchScriptwriter: (input: NarrativeScriptwriterDispatchInput) => { callId: string }
} {
  const key = String(sessionId || '')
  return {
    dispatchScriptwriter: (input: NarrativeScriptwriterDispatchInput) => {
      const sourceCallId = `scriptwriter_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const originRunId = String(options?.originRunId || '')
      const prev = pendingBackgroundScriptwriterRuns.get(key)
      const depth = (prev?.depth ?? 0) + 1
      if (depth > 3) console.warn(`[scriptwriter-background] 会话 ${key} 异步分析积压 ${depth} 层`)
      const chain = (prev?.chain ?? Promise.resolve()).then(async () => {
        const contextBlock = await options?.loadContextBlock?.()
        if (!String(contextBlock || '').trim()) throw new Error('编剧统一原始可见上下文为空，拒绝降级为手拼上下文')
        const outcome = await runNarrativeScriptwriterAnalysis({
          ...input,
          contextBlock: String(contextBlock),
          ...(loadSessionDirectorPrefText(key) ? { pref: loadSessionDirectorPrefText(key) } : {}),
        }, {
          sessionId: key,
          sourceCallId,
          tools: options?.tools ?? [],
          callModel
        })
        if (outcome.ok) {
          enqueueDeferredScriptwriterReport({ sessionId: key, originRunId, sourceCallId, payload: outcome.report })
        } else {
          markDeferredAgentEventFailed({ sessionId: key, originRunId, sourceCallId, error: outcome.error || '异步编剧未交稿' })
        }
      }).catch((error) => {
        markDeferredAgentEventFailed({
          sessionId: key,
          originRunId,
          sourceCallId,
          error: error instanceof Error ? error.message : String(error)
        })
      })
      const entry = { chain, depth }
      pendingBackgroundScriptwriterRuns.set(key, entry)
      chain.finally(() => {
        if (pendingBackgroundScriptwriterRuns.get(key) === entry) pendingBackgroundScriptwriterRuns.delete(key)
      })
      return { callId: sourceCallId }
    }
  }
}

/** 状态系统工具接缝（积木骨架计划批次5·2026-07-08）：统筹/纠偏两 loop 注册 readStatusPanels/updateStatusPanel
 *  用——repository=chatRepository 状态系统六函数真值直写（与「状态」面板、星依工具同一份服务端真值）；
 *  characterOptions=会话成员（宿主名渲染·可空退化显示 id）。联动：外部装配 runner 同用本接缝。 */
export function buildTidiaoStatusSystemSeam(
  sessionId: string,
  characterOptions?: Array<{ id: string; name: string; participantId?: string }>,
  orchestration?: {
    worldId: string
    sourceDirectorRunId: string
    sourceMessageId: string
  }
): TidiaoStatusSystemToolContext {
  let commandSequence = 0
  return {
    sessionId: String(sessionId || ''),
    ...(characterOptions?.length ? { characterOptions } : {}),
    repository: {
      fetchTemplates: (sid) => fetchStatusPanelTemplates(sid),
      saveTemplate: (sid, payload) => saveStatusPanelTemplate(sid, payload),
      deleteTemplate: (sid, templateId) => deleteStatusPanelTemplate(sid, templateId),
      fetchPanels: (sid) => fetchStatusPanels(sid),
      savePanel: async (sid, payload) => {
        let normalizedPayload = payload
        if (payload.hostType === 'session_character' && payload.hostId) {
          const bundle = await fetchChatSessionBundleById(sid)
          const participants = Array.isArray(bundle?.participants)
            ? bundle.participants
            : (Array.isArray(bundle?.session?.participants) ? bundle.session.participants : [])
          const hostId = String(payload.hostId || '').trim()
          const participant = participants.find((item: Record<string, any>) => (
            String(item?.id || '').trim() === hostId
            || String(item?.participantTargetId ?? item?.participant_target_id ?? '').trim() === hostId
          ))
          if (!participant?.id) throw new Error('会话角色缺少正式 participantId，请刷新会话成员后重试')
          normalizedPayload = { ...payload, hostId: String(participant.id) }
        }
        if (!orchestration || !['session_character', 'world_entity'].includes(String(normalizedPayload.hostType || ''))) {
          return saveStatusPanel(sid, normalizedPayload)
        }
        commandSequence += 1
        const panelId = String(normalizedPayload.id || '').trim()
          || `status_panel_${orchestration.sourceDirectorRunId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${commandSequence}`
        const expectedVersion = Math.max(0, Number(normalizedPayload.expectedVersion || 0))
        const result = await executeOrchestrationCommands(sid, [{
          command: normalizedPayload.hostType === 'world_entity' ? 'patchWorldEntityStatus' : 'patchCharacterStatus',
          sessionId: sid,
          worldId: orchestration.worldId,
          targetRef: { kind: 'status_panel', panelId },
          expectedVersion,
          idempotencyKey: `director:${orchestration.sourceDirectorRunId}:status:${commandSequence}`,
          source: {
            sourceMessageId: orchestration.sourceMessageId,
            sourceDirectorRunId: orchestration.sourceDirectorRunId,
            evidenceSummary: '提调依据本轮剧情中已明确发生的状态变化写入状态栏'
          },
          payload: { ...normalizedPayload, id: panelId }
        }])
        const panels = await fetchStatusPanels(sid)
        const saved = panels.find((panel) => String(panel.id || '') === panelId)
        if (!saved) throw new Error(`统一编排已提交状态栏但回读失败：${panelId}（version=${result.operations[0]?.version || expectedVersion}）`)
        return saved
      },
      deletePanel: (sid, panelId, expectedVersion, options) => deleteStatusPanel(sid, panelId, expectedVersion, options),
      fetchTempEntities: async (sid) => {
        const items = await fetchSessionTemporaryEntities(sid)
        return items.map((item) => ({ id: String(item.id || ''), name: String(item.name || item.id || '') }))
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 投影/可见性观察数据（批次C 一次取回两用·自 useChatSendPipeline 移入——纠偏/精修两入口共用）
// ─────────────────────────────────────────────────────────────────────────────

export interface DirectorProjectionObservations {
  projectionMap: Map<number, TidiaoProjectionSource>
  hiddenByMessageId: Map<number, string[]>
}

/** 拉本会话投影+可见性并按 messageId 索引；fetch 失败不阻断，按「无投影+全可见」降级。 */
export async function loadDirectorProjectionObservations(sessionId: string): Promise<DirectorProjectionObservations> {
  const projectionMap = new Map<number, TidiaoProjectionSource>()
  const hiddenSets = new Map<number, Set<string>>()
  try {
    const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
    const rows = Array.isArray(page?.projections) ? page.projections : []
    for (const row of rows) {
      const messageId = Number(row?.messageId || 0)
      if (!Number.isInteger(messageId) || messageId <= 0) continue
      projectionMap.set(messageId, {
        objectiveFact: row.objectiveFact,
        startEnv: row.startEnv,
        endEnv: row.endEnv,
        changed: row.changed,
        status: row.status
      })
    }
    // 可见性行：只收 visibility==='hidden'，按 messageId 聚合成「该消息被隐藏的角色集」。
    const visibility = Array.isArray(page?.visibility) ? page.visibility : []
    for (const row of visibility) {
      if (String(row?.visibility || '') !== 'hidden') continue
      const messageId = Number(row?.messageId || 0)
      const characterId = String(row?.characterId || '').trim()
      if (!Number.isInteger(messageId) || messageId <= 0 || !characterId) continue
      let set = hiddenSets.get(messageId)
      if (!set) { set = new Set<string>(); hiddenSets.set(messageId, set) }
      set.add(characterId)
    }
  } catch (error) {
    console.error('提调读投影/可见性失败（不阻断，按无投影+全可见处理）：', error)
  }
  const hiddenByMessageId = new Map<number, string[]>()
  for (const [messageId, set] of hiddenSets) hiddenByMessageId.set(messageId, [...set])
  return { projectionMap, hiddenByMessageId }
}

// ─────────────────────────────────────────────────────────────────────────────
// 续跑基线（导演带快照 + append log + 真实 prompt）——自 useChatSendPipeline 移入。
// ─────────────────────────────────────────────────────────────────────────────

export interface TidiaoDirectorBaseline {
  directorStream: TidiaoDirectorStream | null
  appendLog: AppendLogEvent[]
  directorPrompt: string
}

/** 内存 processTrace 优先（未刷新场景），缺失则 fetch 本会话 observations 兜底。 */
export async function resolveMessageDirectorBaseline(
  message: Record<string, unknown> | null | undefined,
  sessionId: string,
  messageId: number
): Promise<TidiaoDirectorBaseline> {
  const inMemTrace = (message?._processTrace || message?.processTrace) as Record<string, unknown> | undefined
  const inMemStream = inMemTrace?.directorStream as TidiaoDirectorStream | undefined
  const inMemLog = inMemTrace?.appendLog as AppendLogEvent[] | undefined
  const inMemStreamOk = !!(inMemStream && Array.isArray(inMemStream.decisions) && inMemStream.decisions.length)
  // H1：directorPrompt（option C 留存的真实 prompt）一并带回——续跑 restoreAppendLog 进容器，
  // 纠偏等不重建 prompt 的 loop 增量持久化时不再把同锚 processSummary 覆盖成「无 prompt 版」。
  if (inMemStreamOk) {
    return {
      directorStream: inMemStream!,
      appendLog: Array.isArray(inMemLog) ? inMemLog : [],
      directorPrompt: String(inMemTrace?.directorPrompt || '')
    }
  }
  if (!sessionId || !messageId) return { directorStream: null, appendLog: [], directorPrompt: '' }
  try {
    const page = await fetchChatPersonalityModelObservationsBySessionId(sessionId)
    const view = buildProcessTraceMapFromTraces(page.traces).get(Number(messageId))
    return { directorStream: view?.directorStream || null, appendLog: view?.appendLog || [], directorPrompt: String(view?.directorPrompt || '') }
  } catch (error) {
    console.error('取重生成接续基线（导演带快照 + append log）失败:', error)
    return { directorStream: null, appendLog: [], directorPrompt: '' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 阶段1：上下文装配（无副作用·只读库/快照）——纠偏入口 6600 行段落的装配部分原样抽出。
// ─────────────────────────────────────────────────────────────────────────────

type TidiaoAssemblyReadContext = ReturnType<typeof createTidiaoChatMessageReadContext>
type TidiaoAssemblyFloorRead = NonNullable<ReturnType<TidiaoAssemblyReadContext['readByFloor']>>

export interface TidiaoCorrectionAssembledContexts {
  readContext: TidiaoAssemblyReadContext
  editContext: ReturnType<typeof createTidiaoChatMessageEditContext>
  projectionContext: ReturnType<typeof createTidiaoMessageProjectionContext>
  promptContext: ReturnType<typeof createTidiaoMessagePromptContext>
  observations: DirectorProjectionObservations
  /** 层3 对话可见历史（按最新库态现算·含本轮已落库消息·带本轮分界锚）。 */
  visibleHistory: string
  /** 被纠偏消息所在轮的用户消息 id（本轮锚）。 */
  targetRoundAnchorMessageId: number
  /** 同会话活动轮的原锚（无活动轮=0）。 */
  continuationAnchor: number
  /** 真机五验③：活动轮比目标轮新（失败轮纠偏重定向门槛·严格 >）。 */
  activeRoundIsNewer: boolean
  /** 分界/重试单元用的轮锚（活动轮在场即活动轮用户消息）。 */
  boundaryAnchorMessageId: number
  /** 真机七验：基线可用活动容器的门槛（>=·同轮部分成功也算）。 */
  activeRoundBaselineEligible: boolean
  /** 重定向后的主目标楼层读（失败轮空场=null，targets 空是合法态）。 */
  targetRead: TidiaoAssemblyFloorRead | null
  /** 重定向后的主目标消息 id（失败轮空场=0，相关能力自然降格）。 */
  effectiveTargetId: number
  targets: Array<{ ref: string; speakerName: string; originalText: string }>
  /** 主目标消息对象（基线解析/中策发言角色解析用）。 */
  targetMessage: Record<string, unknown> | undefined
  /** U3 群聊中策发言角色（单聊=会话目标·行为不变）。 */
  speakerTargetId: string
  /** 中策「按原提示重生成」的结构化重放消息（promptBlocks 优先·finalPrompt 兜底）。 */
  replayMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  originalPromptText: string
  /** 本会话编排倾向（批次B·空串=无）。 */
  directorPref: string
  /** 层2 上轮情境承接块（空串=不注入）。 */
  lastScenarioBlock: string
}

/** 按会话快照装配纠偏上下文。返回 null = 目标定位失败（无活动轮重定向且目标楼层未命中），
 *  与聊天内入口「return null 不起 loop」同语义（守卫也在一处真值里）。 */
export async function assembleTidiaoCorrectionContexts(
  source: TidiaoCorrectionSessionSource,
  opts: { targetMessageId: number }
): Promise<TidiaoCorrectionAssembledContexts | null> {
  const sessionId = String(source.sessionId || '')
  const target = String(source.targetId || '')
  const targetId = Number(opts.targetMessageId || 0)
  const list = source.messages
  const readContext = createTidiaoChatMessageReadContext(list)
  const editContext = createTidiaoChatMessageEditContext(list)
  // 批次C：一次取回观察数据派生两用——投影源图（喂 projectionContext）+ hidden 角色集（喂层3 消化过滤）。
  const observations = await loadDirectorProjectionObservations(sessionId)
  const projectionContext = createTidiaoMessageProjectionContext(list, observations.projectionMap)
  // 被纠偏消息所在轮的用户消息（本轮锚）：目标消息往前找最近一条 user。
  const targetRoundAnchorMessageId = (() => {
    const targetIndex = list.findIndex((m) => Number(m?.id || 0) === targetId)
    if (targetIndex < 0) return 0
    const anchorUser = [...list.slice(0, targetIndex)].reverse().find((m) => m?.role === 'user')
    return Number(anchorUser?.id || 0)
  })()
  // 真机五验③：活动轮在场时纠偏针对的就是活动轮——分界锚/在屏目标/记忆基线整体重定向。
  // ⚠️ 活动轮必须在 clearTidiaoDirectorStreamRound 之前读（阶段2 才 clear·顺序由两阶段拆分天然保证）。
  const sameSessionRound = peekActiveTidiaoDirectorRoundForSession(sessionId)
  const continuationAnchor = sameSessionRound && sameSessionRound.anchorMessageId > 0 ? sameSessionRound.anchorMessageId : 0
  const activeRoundIsNewer = continuationAnchor > 0 && continuationAnchor > targetRoundAnchorMessageId
  const boundaryAnchorMessageId = activeRoundIsNewer ? continuationAnchor : targetRoundAnchorMessageId
  // 真机七验：基线门槛用「活动轮同轮或更新」（>=）——本轮部分成功时纠偏目标就在活动轮内、两锚相等。
  const activeRoundBaselineEligible = continuationAnchor > 0 && continuationAnchor >= targetRoundAnchorMessageId
  // 层3 可见历史：候选=会话成员（空回退群成员表·再空则不按角色收窄），hidden 集喂并集消化过滤（真机五验②同口径）。
  const sessionMembers = normalizeSessionParticipantMembers(source.session)
  const group = (source.groups || []).find((g) => String((g as { id?: unknown }).id) === target || `group_${String((g as { id?: unknown }).id)}` === target)
  const candidateCharacterIds = (sessionMembers.length > 0
    ? sessionMembers
    : group ? normalizeGroupMembers((group as { members?: unknown }).members) : []
  ).map((m: { characterId?: string }) => String(m.characterId || '').trim()).filter(Boolean)
  const visibleHistory = renderDirectorVisibleHistory(list, {
    maxMessages: 300,
    candidateCharacterIds,
    projectionResolver: (kind, index) => projectionContext.readProjectionByFloor(kind, index),
    hiddenCharacterIdsResolver: (m) => observations.hiddenByMessageId.get(Number(m.id) || 0),
    // 批次J1+五验③：分界锚用重定向后的轮锚，分界标在用户意见真正针对的那一轮。
    ...(boundaryAnchorMessageId > 0 ? { currentRoundBoundaryMessageId: boundaryAnchorMessageId } : {})
  })
  // 目标消息 id → 楼层号「角色N/旁白M」：扫描读上下文找 messageId 命中的那一层。
  const findFloorReadByMessageId = (messageId: number): TidiaoAssemblyFloorRead | null => {
    for (const kind of ['role', 'narration'] as const) {
      const total = readContext.floorTotal(kind)
      for (let i = 1; i <= total; i += 1) {
        const read = readContext.readByFloor(kind, i)
        if (read && read.matched && Number(read.messageId) === messageId) return read
      }
    }
    return null
  }
  // 五验③·目标重定向：活动轮在场时在屏目标=活动轮内已生成的角色/旁白消息（可能多条·全失败时为空=合法态）。
  const activeRoundReads = activeRoundIsNewer
    ? list
        .filter((m) => Number(m?.id || 0) > continuationAnchor && m?.role !== 'user')
        .map((m) => findFloorReadByMessageId(Number(m?.id || 0)))
        .filter((read): read is TidiaoAssemblyFloorRead => Boolean(read))
    : []
  const targetRead = activeRoundIsNewer ? (activeRoundReads[0] || null) : findFloorReadByMessageId(targetId)
  if (!targetRead && !activeRoundIsNewer) return null
  // 重定向后的「主目标消息 id」：promptLog/发言角色/基线都以它为准；失败轮空场时为 0（相关能力自然降格）。
  const effectiveTargetId = targetRead ? Number(targetRead.messageId) : 0
  const targets = (activeRoundIsNewer ? activeRoundReads : [targetRead!])
    .map((read) => ({ ref: read.ref, speakerName: read.speakerName, originalText: read.content }))
  // U3 群聊中策按发言角色解析（优先消息存的 speaker target id·兜底按发言名匹配角色库·单聊回退会话目标）。
  const targetMessage = list.find((m) => Number(m?.id || 0) === effectiveTargetId) as Record<string, unknown> | undefined
  const speakerTargetId = (() => {
    if (!isMultiCharacterChatSession(source.session, target)) return target
    const stored = String(
      targetMessage?.speakerTargetId ?? targetMessage?.speaker_target_id
      ?? targetMessage?.memberTargetId ?? targetMessage?.member_target_id ?? ''
    ).trim()
    if (stored) return stored
    const speakerName = String(targetMessage?.memberName ?? targetMessage?.name ?? '').trim()
    const matched = speakerName
      ? (Array.isArray(source.characters) ? source.characters : []).find((c) => String((c as { name?: unknown })?.name || '').trim() === speakerName)
      : null
    return String((matched as { id?: unknown } | null)?.id || '').trim() || target
  })()
  // 中策提示词来源：该消息已存 promptLog → finalPrompt/blocks（失败轮空场无 promptLog·中策能力自然降格）。
  const log = effectiveTargetId > 0
    ? (sessionId
        ? await fetchLatestChatPromptLogBySessionMessageId(sessionId, effectiveTargetId)
        : await fetchLatestChatPromptLogByMessageId(target, effectiveTargetId))
    : null
  const replayMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = (() => {
    const blocks = Array.isArray(log?.promptBlocks) ? log!.promptBlocks : []
    const msgs = blocks
      .filter((b: { role?: unknown }) => b && (b.role === 'system' || b.role === 'user' || b.role === 'assistant'))
      .map((b: { role?: unknown; content?: unknown }) => ({ role: b.role as 'system' | 'user' | 'assistant', content: String(b.content || '') }))
      .filter((m) => m.content.trim())
    if (msgs.length) return msgs
    const finalPrompt = String(log?.finalPrompt || '').trim()
    return finalPrompt ? [{ role: 'user' as const, content: finalPrompt }] : []
  })()
  const originalPromptText = (String(log?.finalPrompt || '').trim() || replayMessages.map((m) => m.content).join('\n\n')).trim()
  const promptSources: TidiaoMessagePromptSource[] = targetRead && originalPromptText
    ? [{ kind: targetRead.kind, index: targetRead.index, messageId: effectiveTargetId, speakerName: targetRead.speakerName, promptText: originalPromptText }]
    : []
  const promptContext = createTidiaoMessagePromptContext(promptSources, {
    role: readContext.floorTotal('role'),
    narration: readContext.floorTotal('narration')
  }, {
    // 2026-07-06 懒取兜底（真机修「无提示词可读」死胡同）：预取仍只有纠偏发起目标一条（开局零额外请求），
    // 提调定位到**其他楼层**要走中策（读/改提示词/重生成）时才按楼层现查该消息最新 promptLog——
    // 与上面目标预取、统筹侧懒取同一套查询口径（session 优先·finalPrompt 优先 blocks 拼接兜底）。
    lazyFetch: async (kind, index) => {
      const read = readContext.readByFloor(kind, index)
      const messageId = Number(read?.messageId || 0)
      if (!read?.matched || !messageId) return null
      const lazyLog = sessionId
        ? await fetchLatestChatPromptLogBySessionMessageId(sessionId, messageId)
        : await fetchLatestChatPromptLogByMessageId(target, messageId)
      const blocks = Array.isArray(lazyLog?.promptBlocks) ? lazyLog!.promptBlocks : []
      const promptText = (String(lazyLog?.finalPrompt || '').trim()
        || blocks
          .map((b: { content?: unknown }) => String(b?.content || ''))
          .filter((c: string) => c.trim())
          .join('\n\n')).trim()
      if (!promptText) return null
      return { kind, index, messageId, speakerName: read.speakerName, promptText }
    }
  })
  return {
    readContext,
    editContext,
    projectionContext,
    promptContext,
    observations,
    visibleHistory,
    targetRoundAnchorMessageId,
    continuationAnchor,
    activeRoundIsNewer,
    boundaryAnchorMessageId,
    activeRoundBaselineEligible,
    targetRead,
    effectiveTargetId,
    targets,
    targetMessage,
    speakerTargetId,
    replayMessages,
    originalPromptText,
    directorPref: loadSessionDirectorPrefText(sessionId),
    lastScenarioBlock: renderSessionLastScenarioBlock(sessionId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 阶段2：基线容器接管（副作用·接管两个单例·真机七验时序封装）——必须紧邻 loop 启动前调用。
// ─────────────────────────────────────────────────────────────────────────────

export interface TidiaoCorrectionRunContainers {
  /** 本轮提调 runId（append log / 导演带 / 持久化共用主键）。 */
  runId: string
  directorCarryOver: TidiaoDirectorCarryOver | null
  roundSpeakerName: string
}

export async function beginTidiaoCorrectionRunContainers(input: {
  sessionId: string
  /** 已按 options/活动轮/轮锚回退好的锚（导演带挂它之后）。 */
  anchorMessageId: number
  activeRoundBaselineEligible: boolean
  /** 主目标消息对象（基线内存优先路径用）。 */
  targetMessage: Record<string, unknown> | null | undefined
  /** 基线消息 id（effectiveTargetId 兜底原始 targetId·与聊天内入口同口径）。 */
  baselineMessageId: number
  correctionText: string
  /** 用户称呼（「据XX纠偏」转场标记用）。 */
  userName: string
  /** 轮出场名兜底（targetRead?.speakerName）。 */
  fallbackSpeakerName: string
}): Promise<TidiaoCorrectionRunContainers> {
  const sessionId = String(input.sessionId || '')
  const correctionText = String(input.correctionText || '').trim()
  // 真机七验：活动容器快照必须在 beginAppendLog（换空容器）之前抓取，否则「基线=活动容器」永远读到空。
  const activeLogEvents = input.activeRoundBaselineEligible ? getAppendLogEvents() : []
  const activeDirectorPromptSnapshot = input.activeRoundBaselineEligible ? getActiveDirectorPrompt() : ''
  const runId = makeTidiaoRunId()
  beginAppendLog({ runId, sessionId })
  // 五验③·基线改源：活动轮在场时基线=当前活动 append log 容器（容器必须属于本会话才可用·防切会话残留串轮）；
  // 容器空/跨会话回退「目标消息已落库 trace」旧路（零回归）。
  const activeLogUsable = activeLogEvents.length > 0 && String(activeLogEvents[0]?.sessionId || '') === sessionId
  const baseline = input.activeRoundBaselineEligible && activeLogUsable
    ? { directorStream: null, appendLog: activeLogEvents.slice(), directorPrompt: activeDirectorPromptSnapshot }
    : await resolveMessageDirectorBaseline(
        input.targetMessage as Record<string, unknown>,
        sessionId,
        input.baselineMessageId
      )
  restoreAppendLog({ runId, sessionId, events: baseline.appendLog, directorPrompt: baseline.directorPrompt })
  // carryOver 三路：活动轮 capture（读单例·必须在下方 clear 之前）→ 已落库导演带接续 → 纠偏文本兜底决策。
  let directorCarryOver = correctionText ? captureTidiaoDirectorCarryOver(correctionText, input.userName, sessionId) : null
  if (!directorCarryOver) {
    directorCarryOver = buildTidiaoDirectorCarryOverFromStream(
      baseline.directorStream,
      { separatorText: `据${input.userName}纠偏：${correctionText}` }
    )
  }
  // 兜底：既无活动轮 carryOver、又无可接续的已落库导演带时，至少把用户纠偏当一条「用户消息」决策置入决策流。
  if (!directorCarryOver && correctionText) {
    directorCarryOver = {
      decisions: [{ id: 'correction_1', kind: 'correction', text: `据${input.userName}纠偏：${correctionText}` }],
      shots: []
    }
  }
  clearTidiaoDirectorStreamRound()
  const roundSpeakerName = String(
    directorCarryOver?.shots.find((shot) => shot.kind === 'character')?.label
    || input.fallbackSpeakerName
    || ''
  ).trim() || '提调纠偏'
  beginTidiaoDirectorStreamRound({
    runId,
    sessionId,
    anchorMessageId: Number(input.anchorMessageId || 0),
    speakerName: roundSpeakerName,
    carryOver: directorCarryOver
  })
  return { runId, directorCarryOver, roundSpeakerName }
}

/** 跨轮记忆块（R3-3）：重建 ON 时层5 已原样回放整条带→不再注入压缩块（防双份）；
 *  OFF 对照路径维持压缩记忆注入（保真投影优先·空回退 carryOver 视图渲染）。 */
export function buildTidiaoCorrectionBandMemory(input: {
  runId: string
  promptRebuild: boolean
  directorCarryOver: TidiaoDirectorCarryOver | null
}): string {
  if (input.promptRebuild) return ''
  const seededLogEvents = getAppendLogEvents(input.runId)
  return seededLogEvents.length
    ? renderAppendLogProjection(seededLogEvents)
    : renderTidiaoBandMemory(input.directorCarryOver)
}
