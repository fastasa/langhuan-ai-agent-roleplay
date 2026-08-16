// 回复工作流消息视图共享真值：过程轨恢复 + 投影灯状态机（纯函数，无 UI / 网络依赖）。
// 联动能力：桌面 `ChatMessageStream.vue` 与移动端 `MobileChatThread.vue` / `MobileMessageActions.vue`
// 共用本模块；修改过程轨恢复协议或投影灯三态矩阵时，两端同步生效，不得各自再写第二套。
// 投影灯可点击/禁用矩阵见 docs/features/chat/DEVELOPMENT.md 3.5：四态全部可点击，failed 点击=重投影重试
// （2026-07-07 修复：原「failed 永久禁用+点击静默 return」会让用户点了没反应，真机常见——只要模型
// 提炼不出「客观事实」就会判 failed；现在 failed 与 pending 走同一条重投影路径，点击必弹 toast）。

import type {
  TidiaoDecisionEntry,
  TidiaoDecisionKind,
  TidiaoDirectorStream,
  TidiaoStreamPhase,
  TidiaoStreamShot,
  TidiaoStreamTool
} from './tidiaoDirectorStream'
import type { AppendLogEvent, AppendLogEventType } from './agentState/appendLogTypes'

/** 旁白陪跑结论：本轮是否生成旁白 + 模型给出的理由（生成时为各 skill 的确认理由，不生成时为 skip 理由）。 */
export interface ReplyWorkflowNarrationOutcome {
  willGenerate: boolean
  reason: string
}

/** 编排剧本视图（提调编排带 D2 消费的轻量子集）：从 artifact 的 payload.orchestration 抽取，
 *  仅取展示需要的非敏感字段；现役 orchestration 字段薄（scenario 为枚举、toolCalls 仅含 plan/review），
 *  取料/帷幕/多角色分镜等富块要等批次 B/C 填 TidiaoScript 后再补。实时 _processTrace 占位无此数据时为 null。 */
export interface ReplyWorkflowOrchestrationView {
  scenario: string
  orchestrationSummary: string
  strategies: string[]
  /** 旁白陪跑确认的生成调用（批次2 二分类 + 生成提示词预览）：供编排带分镜暴露旁白提示词预览，
   *  并点亮 信息承载/纯描写 标注（D2 适配器原缺源、留 undefined，本批接通）。 */
  narrationCalls: ReplyWorkflowNarrationCallView[]
  /** 提调本轮主动取料决策（批次3 D4）：供编排带「取料」里程碑展示；未取料为空数组。 */
  retrieval: ReplyWorkflowRetrievalView[]
}

export interface ReplyWorkflowNarrationCallView {
  label: string
  reason: string
  promptPreview: string
  informationBearing: boolean
}

/** 取料决策展示子集（批次3 D4）：工具机器名 + 检索词/命中单位，供编排带「取料」块渲染。 */
export interface ReplyWorkflowRetrievalView {
  tool: string
  query: string
  reason: string
  hitCount: number
}

/** 统筹剧本视图（方案 B）：提调「整轮前置统筹 pass」一次产出的本轮剧本——
 *  情境 + 旁白安排 + 每角色方向（名字）+ 实时旁述。编排带轮级带优先消费它（一份、不重复、分镜带方向文字）；
 *  无此数据（单聊/旧历史/统筹失败回退）时编排带回退现状的 per-speaker 聚合。 */
export interface ReplyWorkflowDirectorScriptView {
  situation: string
  /** F2·决策 loop 下发情境（本轮瞬态）：提调轮级判定的情境 skill code+body，供 per-speaker 分镜跳过各自判情境。
   *  仅活动轮 activeRoundDirector.script 携带；旧一次性 JSON 路径/历史复原记录无此源、缺省。 */
  scenarioCode?: string
  scenarioBody?: string
  narration: { want: boolean; direction: string }
  cast: Array<{ name: string; direction: string }>
  thoughts: string[]
  /** D1（群聊导演 harness loop·方案 B）：导演本轮读楼层/读投影/取料的决策，进编排带 retrieval 块；旧记录/一次性 pass 为空。 */
  retrieval?: Array<{ tool: string; query: string }>
}

export interface ReplyWorkflowProcessTraceView {
  steps: Record<string, string>
  failed: boolean
  elapsed: string
  /** 回复工作流模式：personality_model（七步含评审）/ normal_recall（六步无评审）；旧记录缺省按 personality_model 兜底。 */
  mode: string
  /** 旁白陪跑结论；旧记录或未决出时为 null。 */
  narration: ReplyWorkflowNarrationOutcome | null
  /** 评审降级结论：本地 ReRanker 跑不动时按候选顺序降级出回复，评审步标注降级原因；未降级或旧记录为 null。 */
  reviewDegrade: { reason: string } | null
  /** 每步耗时（2026-06-12 提速验收口径）：stepId → '3.2s'；旧记录缺省为空对象。 */
  stepElapsed: Record<string, string>
  /** 编排剧本子集（提调编排带用）；旧记录或实时占位无此数据时为 null。 */
  orchestration: ReplyWorkflowOrchestrationView | null
  /** 实时旁述（D5）：提调每轮 thought 顺序累积，供编排带展开态逐句呈现；旧记录或无 thought 时为空数组。 */
  thoughts: string[]
  /** O-B·导演 loop 轮级快照（决策流+实时分镜，含旁白决策步/旁白镜）：单聊真·导演 loop 落库的最终快照，
   *  刷新后历史复原走新带 TidiaoDirectorStreamBand；旧记录/群聊为 null。 */
  directorStream: TidiaoDirectorStream | null
  /** R3-2b·append log 保真事件快照（消息/工具调用/工具结果/报错/决策，永不真删）：随 directorStream 一起落库，
   *  刷新/续跑复原后 seed 回内存活动 log，供 R3-3 投影 / R3-4 检索读保真历史；旧记录/无 log 为空数组。 */
  appendLog: AppendLogEvent[]
  /** option C（2026-07-01·发送时留存真实 prompt）：这一轮提调真实拼好的 prompt（system+user 渲成文本），
   *  随 directorStream/appendLog 同处落库，刷新后历史轮据它在 state 查看器「喂模型原文」忠实显示；旧记录/无为空串。 */
  directorPrompt: string
}

/** 从 observations traces 按 messageId 建过程轨摘要 map（payload.processSummary 为顶层非敏感字段）。
 *  personality_model_trace / reply_workflow_trace 两种 kind 通吃；旧摘要无 mode 字段时按 personality_model 兜底。 */
export function buildProcessTraceMapFromTraces(traces: unknown): Map<number, ReplyWorkflowProcessTraceView> {
  const map = new Map<number, ReplyWorkflowProcessTraceView>()
  if (!Array.isArray(traces)) return map
  for (const trace of traces) {
    const record = trace as Record<string, unknown>
    const payload = (record?.payload && typeof record.payload === 'object') ? record.payload as Record<string, unknown> : {}
    const messageId = Number(record?.messageId ?? payload.messageId ?? 0) || 0
    const summary = payload.processSummary as Record<string, unknown> | undefined
    if (messageId <= 0 || !summary || typeof summary !== 'object') continue
    const steps = (summary.steps && typeof summary.steps === 'object' && !Array.isArray(summary.steps))
      ? summary.steps as Record<string, string>
      : {}
    const directorStream = readDirectorStream(summary.directorStream)
    // O-B2：重生成的 clean_retry artifact 只带 directorStream（累加快照）、无步骤轴——也要复原（否则刷新后接续记录丢失）。
    if (!Object.keys(steps).length && !directorStream) continue
    const view: ReplyWorkflowProcessTraceView = {
      steps,
      failed: summary.failed === true,
      elapsed: String(summary.elapsed || ''),
      mode: String(summary.mode || 'personality_model'),
      narration: readNarrationOutcome(summary.narration),
      reviewDegrade: readReviewDegrade(summary.reviewDegrade),
      stepElapsed: readStepElapsed(summary.stepElapsed),
      orchestration: readOrchestrationView(payload.orchestration),
      thoughts: readThoughts(summary.thoughts),
      directorStream,
      appendLog: readAppendLogEvents(summary.appendLog),
      // option C：真实 prompt 文本（顶层非敏感字符串），刷新后据它显示「喂模型原文」；旧记录无为空串。
      directorPrompt: String(summary.directorPrompt || '')
    }
    const existing = map.get(messageId)
    if (existing) {
      // O-B2：同 messageId 多 artifact（首次生成 personality_model_trace + 重生成 clean_retry）——
      // 不依赖 artifact 顺序：步骤轴等取「有步骤」的那条，directorStream 取「决策更多」的那条（重生成累加快照是首次的超集）。
      // R3-2b：appendLog 与 directorStream 同 artifact 共生，取「事件更多」的那条（累加快照是首次的超集），与 directorStream 选择对齐。
      const base = Object.keys(existing.steps).length ? existing : view
      map.set(messageId, {
        ...base,
        directorStream: pickRicherDirectorStream(existing.directorStream, directorStream),
        appendLog: existing.appendLog.length >= view.appendLog.length ? existing.appendLog : view.appendLog,
        // option C：同轮多 artifact 的 directorPrompt 一致，取非空的那份（与 directorStream/appendLog 选择无关·prompt 不因累加而变）。
        directorPrompt: existing.directorPrompt || view.directorPrompt
      })
    } else {
      map.set(messageId, view)
    }
  }
  return map
}

/** 批次K2（2026-07-02·修「刷新后 state 退化台账」）：同一轮多候选（该轮用户锚 artifact + 各成员 trace）择优。
 *  stream/appendLog 取「决策最多」的胜者（严格更多才替换·顺序靠前者平局优先＝用户锚优先·与旧两组件内联逻辑等语义）；
 *  **directorPrompt 若胜者为空则回退取任一候选里非空的那份**——真机事故形态：服务器中途断开→锚 artifact 后半程写失败，
 *  成员 trace（决策更多·旧路无 prompt）胜出，不能连带把锚里已落的真实 prompt 丢掉（丢了查看器就退化旧压缩台账）。
 *  桌面 ChatMessageStream 与移动 MobileChatThread 共用本函数（联动能力收口·勿再各自内联重写）。 */
export interface RoundDirectorTraceCandidate {
  stream: TidiaoDirectorStream
  appendLog: AppendLogEvent[]
  directorPrompt: string
}

export function pickRoundDirectorTraceGroup(
  candidates: ReadonlyArray<RoundDirectorTraceCandidate | null | undefined>
): RoundDirectorTraceCandidate | null {
  let best: RoundDirectorTraceCandidate | null = null
  let promptFallback = ''
  for (const candidate of candidates) {
    if (!candidate) continue
    if (!promptFallback && candidate.directorPrompt) promptFallback = candidate.directorPrompt
    if (!best || (candidate.stream.decisions?.length || 0) > (best.stream.decisions?.length || 0)) best = candidate
  }
  if (!best) return null
  return best.directorPrompt ? best : { ...best, directorPrompt: promptFallback }
}

/** O-B2：同 messageId 多份 directorStream 取「决策更多」的（重生成累加快照 ⊇ 首次），与 artifact 顺序无关。 */
function pickRicherDirectorStream(
  a: TidiaoDirectorStream | null,
  b: TidiaoDirectorStream | null
): TidiaoDirectorStream | null {
  const la = a?.decisions?.length || 0
  const lb = b?.decisions?.length || 0
  return lb > la ? b : a
}

const DIRECTOR_STREAM_PHASES = new Set<TidiaoStreamPhase>(['idle', 'running', 'done', 'correcting', 'failed'])

/** O-B·从 summary/_processTrace 的 directorStream 抽取已落库的导演轮级快照（决策流+实时分镜）；
 *  无效/空决策返回 null（回退旧 band 复原）。历史复原是结果态：phase 非法时按 done 兜底、不复原 streaming 标记（不再打字）。 */
function readDirectorStream(value: unknown): TidiaoDirectorStream | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const decisions = (Array.isArray(record.decisions) ? record.decisions : [])
    .map((raw) => readDirectorDecision(raw))
    .filter((entry): entry is TidiaoDecisionEntry => entry !== null)
  if (!decisions.length) return null
  const shots = (Array.isArray(record.shots) ? record.shots : [])
    .map((raw) => readDirectorShot(raw))
    .filter((shot): shot is TidiaoStreamShot => shot !== null)
  const phaseRaw = String(record.phase || '').trim() as TidiaoStreamPhase
  const phase: TidiaoStreamPhase = DIRECTOR_STREAM_PHASES.has(phaseRaw) ? phaseRaw : 'done'
  const correction = String(record.correction || '').trim()
  const failureReason = String(record.failureReason || '').trim()
  return {
    phase,
    currentAction: String(record.currentAction || '').trim(),
    decisions,
    shots,
    ...(correction ? { correction } : {}),
    ...(failureReason ? { failureReason } : {})
  }
}

/** 决策流单条复原；缺 id/kind 视为无效。streaming 标记不复原（历史态非流式）。 */
function readDirectorDecision(raw: unknown): TidiaoDecisionEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = String(record.id || '').trim()
  const kind = String(record.kind || '').trim()
  if (!id || !kind) return null
  const tool = readDirectorTool(record.tool)
  const shotId = String(record.shotId || '').trim()
  return {
    id,
    kind: kind as TidiaoDecisionKind,
    text: String(record.text || '').trim(),
    ...(tool ? { tool } : {}),
    ...(shotId ? { shotId } : {})
  }
}

/** 工具调用条复原；status 非法时按 done 兜底；tool/label 全空视为无工具。 */
function readDirectorTool(raw: unknown): TidiaoStreamTool | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const tool = String(record.tool || '').trim()
  const label = String(record.label || '').trim()
  if (!tool && !label) return null
  const statusRaw = String(record.status || '').trim()
  const status: TidiaoStreamTool['status'] = (statusRaw === 'running' || statusRaw === 'error') ? statusRaw : 'done'
  const detail = String(record.detail || '').trim()
  const resultPreview = String(record.resultPreview || '').trim()
  return {
    tool,
    label,
    status,
    ...(detail ? { detail } : {}),
    ...(resultPreview ? { resultPreview } : {})
  }
}

/** 实时分镜单镜复原；缺 id/label 视为无效；kind 非 narration 一律 character。 */
function readDirectorShot(raw: unknown): TidiaoStreamShot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = String(record.id || '').trim()
  const label = String(record.label || '').trim()
  if (!id || !label) return null
  const order = Number(record.order)
  const direction = String(record.direction || '').trim()
  const avatar = String(record.avatar || '').trim()
  const informationBearing = record.informationBearing
  return {
    id,
    kind: record.kind === 'narration' ? 'narration' : 'character',
    label,
    order: Number.isFinite(order) ? order : 0,
    ...(direction ? { direction } : {}),
    ...(avatar ? { avatar } : {}),
    ...(typeof informationBearing === 'boolean' ? { informationBearing } : {})
  }
}

/** 从 summary.thoughts 抽取实时旁述序列（D5）；非数组或空串过滤，旧记录缺省返回 []。 */
function readThoughts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter((item) => !!item)
}

/** 从 payload.orchestration（ReplyPlanOrchestration）抽取编排带展示子集；无效或缺省返回 null。 */
function readOrchestrationView(value: unknown): ReplyWorkflowOrchestrationView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const scenario = String(record.scenario || '').trim()
  const orchestrationSummary = String(record.orchestrationSummary || '').trim()
  const strategies = Array.isArray(record.strategyMatrix)
    ? (record.strategyMatrix as Array<Record<string, unknown>>)
        .map((spec) => String(spec?.strategyLabel || spec?.strategy || '').trim())
        .filter((label) => !!label)
    : []
  const narrationCalls = readNarrationCalls(record.narrationSubagent ?? record.narration_subagent)
  const retrieval = readRetrievalDecisions(record.retrieval)
  if (!scenario && !orchestrationSummary && !strategies.length && !narrationCalls.length && !retrieval.length) return null
  return { scenario, orchestrationSummary, strategies, narrationCalls, retrieval }
}

/** 从 orchestration.retrieval 抽取取料决策（批次3 D4 harness 已持久化）；非数组或空项返回 []。 */
function readRetrievalDecisions(value: unknown): ReplyWorkflowRetrievalView[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const item = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
      const tool = String(item.tool || '').trim()
      const query = String(item.query || '').trim()
      if (!tool) return null
      const hitCount = Number(item.hitCount ?? item.hit_count)
      return {
        tool,
        query,
        reason: String(item.reason || '').trim(),
        hitCount: Number.isFinite(hitCount) ? hitCount : 0
      }
    })
    .filter((item): item is ReplyWorkflowRetrievalView => item !== null)
}

/** 从 orchestration.narrationSubagent.confirmedCalls 抽取旁白生成调用（批次2 审计已持久化）。 */
function readNarrationCalls(value: unknown): ReplyWorkflowNarrationCallView[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const calls = (value as Record<string, unknown>).confirmedCalls ?? (value as Record<string, unknown>).confirmed_calls
  if (!Array.isArray(calls)) return []
  return calls
    .map((raw) => {
      const call = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
      const names = Array.isArray(call.profileNames) ? call.profileNames : (Array.isArray(call.profile_names) ? call.profile_names : [])
      const label = names.map((name) => String(name || '').trim()).filter(Boolean).join('、') || '旁白'
      const reason = String(call.reason || '').trim()
      const promptPreview = String(call.generatedPromptPreview ?? call.generated_prompt_preview ?? '').trim()
      // 保守默认信息承载（批次2：仅显式 false 为纯描写），与 normalizeInformationBearing 同口径。
      const informationBearing = (call.informationBearing ?? call.information_bearing) !== false
      return { label, reason, promptPreview, informationBearing }
    })
    .filter((call) => !!(call.reason || call.promptPreview))
}

function readReviewDegrade(value: unknown): { reason: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const reason = String((value as Record<string, unknown>).reason || '').trim()
  if (!reason) return null
  return { reason }
}

function readStepElapsed(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [stepId, elapsed] of Object.entries(value as Record<string, unknown>)) {
    const text = String(elapsed || '').trim()
    if (text) result[stepId] = text
  }
  return result
}

const APPEND_LOG_EVENT_TYPES = new Set<AppendLogEventType>(['message', 'toolCall', 'toolResult', 'error', 'decision'])

/** R3-2b·复原 append log 保真事件：从 summary/_processTrace 的 appendLog 抽取已落库事件（自家 JSON，轻校验）。
 *  只过滤 type 合法的条目，其余 payload（content/call/result/error/decision）原样透传；seq/runId/sessionId/at
 *  在 restoreAppendLog seed 回内存时重排归位，这里只兜默认值保证类型完整。非数组返回空数组。 */
function readAppendLogEvents(value: unknown): AppendLogEvent[] {
  if (!Array.isArray(value)) return []
  const events: AppendLogEvent[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const type = String(record.type || '').trim() as AppendLogEventType
    if (!APPEND_LOG_EVENT_TYPES.has(type)) continue
    events.push({
      ...record,
      type,
      seq: Number(record.seq) || 0,
      runId: String(record.runId || ''),
      sessionId: String(record.sessionId || ''),
      ...(record.at !== undefined ? { at: Number(record.at) || 0 } : {})
    } as AppendLogEvent)
  }
  return events
}

function readNarrationOutcome(value: unknown): ReplyWorkflowNarrationOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const reason = String(record.reason || '').trim()
  if (!reason) return null
  return { willGenerate: record.willGenerate === true, reason }
}

/** 回复过程轨数据：实时来自本地占位 _processTrace / 持久化 processTrace，历史来自 observations 摘要 map（按 messageId）。 */
export function readMessageProcessTrace(
  message: Record<string, unknown> | null | undefined,
  messageId: number,
  historyMap: Map<number, ReplyWorkflowProcessTraceView>
): ReplyWorkflowProcessTraceView | null {
  const source = (message?._processTrace || message?.processTrace) as Record<string, unknown> | undefined
  if (source && typeof source === 'object') {
    const steps = (source.steps && typeof source.steps === 'object' && !Array.isArray(source.steps))
      ? source.steps as Record<string, string>
      : {}
    if (Object.keys(steps).length) {
      return {
        steps,
        failed: source.failed === true,
        elapsed: String(source.elapsed || ''),
        mode: String(source.mode || 'personality_model'),
        narration: readNarrationOutcome(source.narration),
        reviewDegrade: readReviewDegrade(source.reviewDegrade),
        stepElapsed: readStepElapsed(source.stepElapsed),
        orchestration: readOrchestrationView(source.orchestration),
        thoughts: readThoughts(source.thoughts),
        directorStream: readDirectorStream(source.directorStream),
        appendLog: readAppendLogEvents(source.appendLog),
        // option C：真实 prompt 文本（persist 时与 directorStream 同处写进 _processTrace），供「喂模型原文」显示。
        directorPrompt: String(source.directorPrompt || '')
      }
    }
  }
  if (Number.isInteger(messageId) && messageId > 0) {
    const fromHistory = historyMap.get(messageId)
    if (fromHistory) return fromHistory
  }
  return null
}

export type ProjectionLampState = 'pending' | 'running' | 'success' | 'failed'

interface ProjectionRowLike {
  status?: string | null
  objectiveFact?: string | null
  failureReason?: string | null
  failureStage?: string | null
}

export function isProjectionRowSuccess(projection: ProjectionRowLike | null | undefined): boolean {
  if (!projection) return false
  const status = String(projection.status || '').trim()
  return (status === 'complete' || status === 'partial') && Boolean(String(projection.objectiveFact || '').trim())
}

export function resolveProjectionLampState(
  projection: ProjectionRowLike | null | undefined,
  locallyRunning: boolean
): ProjectionLampState {
  if (locallyRunning) return 'running'
  if (!projection) return 'pending'
  const status = String(projection.status || '').trim()
  if (status === 'running') return 'running'
  if (status === 'failed') return 'failed'
  if (isProjectionRowSuccess(projection)) return 'success'
  return 'pending'
}

/** 四态可点击矩阵：全部可点击——failed 点击等同 pending，触发重投影重试（title 展示失败原因+可重试提示）。 */
export function canUseProjectionLampState(state: ProjectionLampState): boolean {
  return state === 'pending' || state === 'running' || state === 'success' || state === 'failed'
}

export function resolveProjectionLampTitle(
  state: ProjectionLampState,
  projection: ProjectionRowLike | null | undefined,
  displayActive: boolean
): string {
  if (state === 'failed') {
    const reason = String(projection?.failureReason || projection?.failureStage || '').trim()
    return reason ? `投影失败：${reason}（点击重试）` : '投影失败（点击重试）'
  }
  if (state === 'success') {
    return displayActive ? '恢复原消息' : '显示投影消息'
  }
  if (state === 'running') return '投影生成中'
  return '等待投影'
}

/** 投影灯只在工作流模式会话显示（pure_prompt 无投影链）。 */
export function isProjectionFeatureMode(replyPipelineMode: string | null | undefined): boolean {
  const mode = String(replyPipelineMode || '').trim()
  return mode === 'normal_recall' || mode === 'personality_model'
}

/** 手动投影接口返回的运行状态读取协议（data.projection.status）。 */
export function readProjectionRunStatus(result: Record<string, unknown> | null | undefined): string {
  const data = (result?.data || result || {}) as Record<string, unknown>
  const projection = (data?.projection || {}) as Record<string, unknown>
  return String(projection?.status || '').trim()
}
