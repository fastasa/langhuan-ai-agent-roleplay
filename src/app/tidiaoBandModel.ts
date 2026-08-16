// 提调过程轨数据适配器（纯函数，无 UI / 网络依赖）：把 ReplyWorkflowProcessTraceView（过程轨 + 轻量
// orchestration 子集）映射成结构化模型。旧六块编排带 TidiaoOrchestrationBand.vue 退役后，本模块仅服务
// 新带 TidiaoDirectorStreamBand 的「角色镜钻取明细」（buildTidiaoShotDetail，内部复用 buildTidiaoBandModel
// 的取料/情境/步骤映射，避免重复维护标签表）。现役无源的块一律省略，不解析 transcript 硬凑。
import type { ReplyWorkflowProcessTraceView } from './replyWorkflowMessageView'

export interface TidiaoBandShot {
  kind: 'narration' | 'character'
  label: string                          // 旁白 / 角色名
  sub?: string                           // 意图描述
  informationBearing?: boolean           // 仅旁白且已知二分类时：true=信息承载 / false=纯描写；undefined 不标注
  avatar?: string                        // 角色头像字
  index?: string                         // 序号（缺省自动 ①②③）
}
export interface TidiaoBandScript {
  understanding?: { tags: Array<{ label: string; muted?: boolean }>; present?: Array<{ avatar: string }>; tone?: string }
  keynote?: { summary: string; pace?: number; paceLabel?: string }
  retrieval?: Array<{ tool: string; query: string }>
  shots?: TidiaoBandShot[]
  stateUpdates?: Array<{ label: string; value?: string; arrow?: boolean; badge?: string }>
  trace?: { note?: string; lowConfidence?: { question: string; options?: string[] } }
}
export interface TidiaoBandModel {
  mode: 'fold' | 'expand'
  phase: 'running' | 'done' | 'correcting' | 'failed'
  low?: boolean
  currentAction: string
  stepLabel?: string
  narration: Array<{ text: string; streaming?: boolean; dim?: boolean }>
  script?: TidiaoBandScript
  correction?: string
  failureReason?: string
}

const SCENARIO_LABELS: Record<string, string> = {
  pressure: '压力',
  joy: '喜悦',
  custom: '自定义'
}

// 取料工具机器名 → 编排带「取料」块展示用中文标签（与 tidiaoRetrievalContract 的 label 对齐）。
const RETRIEVAL_TOOL_LABELS: Record<string, string> = {
  recallSemantic: '语义召回',
  searchWorldText: '文本搜索',
  fetchUnitDetail: '定点读取',
  // D1 群聊导演 loop 的读工具（编排带 retrieval 块复用展示）。
  readChatMessage: '读会话',
  readMessageProjection: '读投影'
}

// 步骤状态里被视为「已收束」的取值；其余（running/pending 等）视为仍在进行。
const TERMINAL_STEP_STATUS = new Set(['done', 'success', 'completed', 'skip', 'skipped', 'error', 'failed'])

function isAllStepsTerminal(steps: Record<string, string>): boolean {
  const values = Object.values(steps || {})
  if (!values.length) return false
  return values.every((status) => TERMINAL_STEP_STATUS.has(String(status || '').toLowerCase()))
}

function countDoneSteps(steps: Record<string, string>): { done: number; total: number } {
  const values = Object.values(steps || {})
  const done = values.filter((status) => TERMINAL_STEP_STATUS.has(String(status || '').toLowerCase())).length
  return { done, total: values.length }
}

export interface BuildTidiaoBandModelOptions {
  mode?: 'fold' | 'expand'
  speakerName?: string
  speakerAvatar?: string
  // 批次5b：该消息处于「暂停等纠偏」时传入；active 时相位覆盖为 correcting、底栏出纠偏输入条。
  // 半成品的实时旁述/剧本块保持原样（停在原地），只换相位与底栏交互。
  correction?: { active: boolean; text?: string }
}

/** 现役过程轨视图 → 编排带模型。view 为 null（无过程轨）时返回 null，由调用方决定是否渲染。 */
export function buildTidiaoBandModel(
  view: ReplyWorkflowProcessTraceView | null | undefined,
  options: BuildTidiaoBandModelOptions = {}
): TidiaoBandModel | null {
  if (!view) return null

  const failed = view.failed === true
  const allTerminal = isAllStepsTerminal(view.steps)
  // 纠偏挂起优先：用户在编排带点停止后，本条停在 correcting 等纠偏，覆盖 running/done/failed 判定。
  const correcting = options.correction?.active === true
  const phase: TidiaoBandModel['phase'] = correcting
    ? 'correcting'
    : (failed ? 'failed' : (allTerminal ? 'done' : 'running'))

  const { done, total } = countDoneSteps(view.steps)

  let currentAction: string
  if (correcting) currentAction = '已暂停 · 在下方输入框继续指挥提调'
  else if (failed) currentAction = view.reviewDegrade?.reason || '编排中断'
  else if (phase === 'running') currentAction = '正在统筹本轮…'
  else currentAction = view.elapsed ? `本轮编排完成 · 用时 ${view.elapsed}` : '本轮编排完成'

  // ----- 剧本块（仅映射现役有源的块）-----
  const script: TidiaoBandScript = {}

  const orch = view.orchestration
  if (orch) {
    // 理解：现役 scenario 仅枚举，出 1 个情境标签（富情境/在场/基调等待 TidiaoScript）。
    const scenarioLabel = orch.scenario ? (SCENARIO_LABELS[orch.scenario] || orch.scenario) : ''
    if (scenarioLabel) {
      script.understanding = { tags: [{ label: scenarioLabel }] }
    }
    // 留痕：编排器面向本地诊断视图的总结。
    if (orch.orchestrationSummary) {
      script.trace = { note: orch.orchestrationSummary }
    }
    // 取料里程碑（批次3 D4）：提调本轮主动取料决策 → 工具中文标签 + 检索词/命中单位。
    // orch.retrieval 可能缺省（旧持久化数据），防御兜底为空。
    const retrieval = (orch.retrieval || [])
      .map((decision) => ({
        tool: RETRIEVAL_TOOL_LABELS[decision.tool] || decision.tool,
        query: decision.query
      }))
      .filter((item) => item.query)
    if (retrieval.length) script.retrieval = retrieval
  }

  // 分镜（单角色版）：旁白镜优先用 orchestration.narrationCalls（带生成提示词预览 + 二分类），
  // 暴露「旁白确实写了提示词」并点亮 信息承载/纯描写；无该源时回退过程轨 narration 结论（仅 reason、不标二分类）。
  const shots: TidiaoBandShot[] = []
  const narrationCalls = orch?.narrationCalls || []
  if (narrationCalls.length) {
    for (const call of narrationCalls) {
      // sub 优先展示旁白生成提示词预览（用户要看的「提示词」），其次回退确认理由。
      const sub = call.promptPreview
        ? `提示词：${call.promptPreview}`
        : (call.reason || undefined)
      shots.push({ kind: 'narration', label: call.label || '旁白', sub, informationBearing: call.informationBearing })
    }
  } else if (view.narration?.willGenerate) {
    shots.push({ kind: 'narration', label: '旁白', sub: view.narration.reason || undefined })
  }
  const speakerName = String(options.speakerName || '').trim()
  if (speakerName) {
    shots.push({ kind: 'character', label: speakerName, avatar: options.speakerAvatar || speakerName.slice(0, 1) })
  }
  if (shots.length) script.shots = shots

  // 实时旁述（D5）：提调每轮 thought 顺序成行；running 相位时最后一句标流式（带光标动画）。
  const thoughts = Array.isArray(view.thoughts) ? view.thoughts.filter((text) => !!String(text || '').trim()) : []
  const narration = thoughts.map((text, index) => ({
    text,
    ...(phase === 'running' && index === thoughts.length - 1 ? { streaming: true } : {})
  }))

  return {
    mode: options.mode || 'expand',
    phase,
    currentAction,
    stepLabel: total ? `${done} / ${total}` : undefined,
    narration,
    script: (script.understanding || script.trace || script.shots || script.retrieval) ? script : undefined,
    ...(correcting ? { correction: String(options.correction?.text || '') } : {}),
    failureReason: failed ? (view.reviewDegrade?.reason || '编排中断') : undefined
  }
}

// ===== 角色镜钻取明细（形态1·E5：群聊新带每个角色镜可展开看该角色自己的编排过程）=====
// 数据全来自该角色消息已有的过程轨（步骤/取料/情境/模式），不重跑任何链路；候选打分等评审细节仍在
// 「编排」审计面板（带里只标"送评审"），与单聊同口径——单聊决策流本就含取料/生成/评审步，群聊角色
// 回复是 per-speaker 各自跑（directorStreamEnabled=false、不产决策流），故钻取它各自的过程轨摘要补可见性。

export type TidiaoShotStepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'retry'

/** 角色镜工作流单步（动态步骤轨一节点）：复刻旧 ChatProcessTrace 的「节点轨」视觉骨架，
 *  但步骤不再写死——只长出该角色过程轨里实际跑过的步骤（id 在 steps 里出现才成节点）。 */
export interface TidiaoShotStep {
  /** 步骤机器 id（projection/context/recall/scenario/plan/review/compose，或未来灵活步骤的未知 id）。
   *  注：旁白生成已不在角色过程轨（2026-06-30 摘出），改走 directorStream 旁白镜 narrationGen。 */
  id: string
  /** 面向用户的中文步骤名。 */
  label: string
  /** 节点图标名（DirIcon 家族）；未知步骤为空，组件回退小圆点。 */
  icon: string
  status: TidiaoShotStepStatus
  /** 终态（done/failed）单步耗时（如 "0.3s"）；运行中不显示半截数字。 */
  elapsed?: string
}

export interface TidiaoShotDetail {
  /** 步骤进度 "a / b"（personality_model 七步 / normal_recall 六步）。 */
  stepLabel?: string
  /** 本角色回复用时（如 "3.2s"）。 */
  elapsed?: string
  /** 情境标签（scenario 枚举中文化）。 */
  scenario?: string
  /** 该角色本轮取料决策（工具中文标签 + 检索词），未取料为空/缺省。 */
  retrieval?: Array<{ tool: string; query: string }>
  /** personality_model 模式含评审步（normal_recall 无）；true 时钻取区提示"送评审·详情见编排入口"。 */
  hasReview?: boolean
  /** 动态工作流步骤轨：按该角色过程轨实际跑过的步骤生成（复刻旧工作流节点轨骨架），缺省/空时不渲染轨。 */
  steps?: TidiaoShotStep[]
  /** 评审降级结论（评审步右侧「降级」tag 可点看原因）；未降级为 null。 */
  reviewDegrade?: { reason: string } | null
  /** 整轮是否终态失败（失败节点画叉、轨头标失败）。 */
  failed?: boolean
}

// 已知步骤注册表：id → 中文标签 + 节点图标（与旧 ChatProcessTrace 同口径）。
// plan 步按模式区分文案（personality_model 多候选 / normal_recall 单计划）。顺序即节点轨竖向顺序。
const SHOT_STEP_REGISTRY: Array<{ id: string; label: string; planNormalLabel?: string; icon: string }> = [
  { id: 'projection', label: '生成上下文投影', icon: 'layers' },
  { id: 'context', label: '读取上下文投影', icon: 'file-search' },
  { id: 'recall', label: '召回', icon: 'radar' },
  { id: 'scenario', label: '判断情境', icon: 'scan-text' },
  { id: 'plan', label: '生成候选计划', planNormalLabel: '生成回复计划', icon: 'sparkles' },
  { id: 'review', label: '评审', icon: 'list-checks' },
  { id: 'compose', label: '组织回复', icon: 'pen-line' }
  // 旁白「旁白陪跑」步已于 2026-06-30 摘出角色过程轨，挪到 directorStream 旁白镜的「生成旁白」节点（见 narrationGen）。
]
const KNOWN_STEP_IDS = new Set(SHOT_STEP_REGISTRY.map((def) => def.id))
const VALID_STEP_STATUS = new Set<TidiaoShotStepStatus>(['waiting', 'running', 'done', 'failed', 'retry'])

/** 过程轨 steps/stepElapsed → 动态工作流步骤轨。
 *  已知步骤按注册表顺序、只取实际出现过的；未知步骤（未来灵活步骤）按出现顺序兜底追加（id 作标签、无图标）。
 *  单步耗时只在终态（done/failed）带出，运行中不显示半截数字。 */
function buildShotSteps(view: ReplyWorkflowProcessTraceView): TidiaoShotStep[] {
  const steps = (view.steps && typeof view.steps === 'object') ? view.steps : {}
  const stepElapsed = (view.stepElapsed && typeof view.stepElapsed === 'object') ? view.stepElapsed : {}
  const mode = String(view.mode || 'personality_model')
  const normalizeStatus = (raw: unknown): TidiaoShotStepStatus => {
    const s = String(raw || '').trim() as TidiaoShotStepStatus
    return VALID_STEP_STATUS.has(s) ? s : 'waiting'
  }
  const toStep = (id: string, label: string, icon: string): TidiaoShotStep => {
    const status = normalizeStatus(steps[id])
    const elapsed = String(stepElapsed[id] || '').trim()
    return {
      id,
      label,
      icon,
      status,
      ...((status === 'done' || status === 'failed') && elapsed ? { elapsed } : {})
    }
  }
  const result: TidiaoShotStep[] = []
  for (const def of SHOT_STEP_REGISTRY) {
    if (steps[def.id] == null) continue
    const label = (def.id === 'plan' && mode === 'normal_recall' && def.planNormalLabel) ? def.planNormalLabel : def.label
    result.push(toStep(def.id, label, def.icon))
  }
  // 未知 step id（未来灵活调用的步骤）按出现顺序兜底——动态如实长出节点，不写死。
  for (const id of Object.keys(steps)) {
    if (KNOWN_STEP_IDS.has(id)) continue
    result.push(toStep(id, id, ''))
  }
  return result
}

/** 角色消息过程轨 → 角色镜钻取明细。复用 {@link buildTidiaoBandModel} 的取料/情境标签映射，避免重复维护标签表。
 *  无过程轨 / 无任何可展示内容（步骤/情境/取料全空）时返回 null，调用方据此不给该角色镜挂"点开"。 */
export function buildTidiaoShotDetail(
  view: ReplyWorkflowProcessTraceView | null | undefined
): TidiaoShotDetail | null {
  if (!view) return null
  const model = buildTidiaoBandModel(view)
  const detail: TidiaoShotDetail = {}
  if (model?.stepLabel) detail.stepLabel = model.stepLabel
  const elapsed = String(view.elapsed || '').trim()
  if (elapsed) detail.elapsed = elapsed
  const scenario = model?.script?.understanding?.tags?.[0]?.label
  if (scenario) detail.scenario = scenario
  const retrieval = model?.script?.retrieval
  if (retrieval && retrieval.length) detail.retrieval = retrieval
  // 旧记录缺省按 personality_model 兜底（与 ReplyWorkflowProcessTraceView.mode 注释一致）。
  detail.hasReview = String(view.mode || 'personality_model') === 'personality_model'
  // 动态工作流步骤轨 + 旁白/评审结论 + 失败态（复刻旧工作流节点轨骨架，喂该角色实际过程数据）。
  const steps = buildShotSteps(view)
  if (steps.length) detail.steps = steps
  // 注：旁白生成态已摘出角色钻取（2026-06-30），改走 directorStream 旁白镜 narrationGen，这里不再带 narration 结论。
  detail.reviewDegrade = view.reviewDegrade || null
  detail.failed = view.failed === true
  return (detail.stepLabel || detail.scenario || detail.retrieval || detail.steps) ? detail : null
}

// 注：旧六块编排带的轮级聚合 buildTidiaoRoundBandModel（及 TidiaoRoundMemberInput /
// BuildTidiaoRoundBandModelOptions）已随旧带 TidiaoOrchestrationBand.vue 退役删除。单聊/群聊
// 历史复原统一走新带 TidiaoDirectorStreamBand（读 directorStream 快照），不再聚合 per-speaker 过程轨。
// 上方 buildTidiaoBandModel / buildTidiaoShotDetail 保留：新带角色镜钻取明细（buildTidiaoShotDetail）仍在用。
