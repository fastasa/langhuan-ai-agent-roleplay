import { ref, type Ref } from 'vue'
import type { InteractionAnswer, InteractionRequest } from './agentRuntime/interactionContract'
import {
  HUIYU_DRAFT_CONFIRM_LABEL,
  HUIYU_DRAFT_REJECT_LABEL,
  HUIYU_SKETCH_REVISION_MAX,
  composeHuiyuDrawTaskFromSketchDecision,
  composeHuiyuRevisionDraftInput,
  type HuiyuSketchDecision,
  type MapStageId
} from './huiyuOrchestration'
import type { HuiyuDraftSketchItem, HuiyuLayoutDraftResult, HuiyuMapWorkInput } from './huiyuSubagent'

/**
 * 提调「绘舆阶段确认卡」全局态（人在环上通道统一批C·2026-07-12）。
 *
 * 由来：绘舆 staged 分阶段作画（huiyuOrchestration.ts runHuiyuStage）走 NON_BLOCKING_CONFIRM_CHANNEL——
 * 每次确认点（草案确认/阶段收尾确认/terraform 改造确认）都立即 {deferred:true} 收尾，原设计指望提调自己的
 * askUser 把确认卡转呈用户、拿到答复后带参重派。但提调统筹/纠偏 loop 没有 askUser 工具，无从照办。
 * 本模块镜像 tidiaoStatusScopeState 的 advisory 非阻塞范式：buildHuiyuDispatchSeam（useChatSendPipeline.ts）
 * 的 staged 分支在拿到 awaitingConfirm 时直接把确认卡写本模块 pending（弹卡）→ **统筹/纠偏继续收尾不停**
 *   → 用户在提调坞的确认卡上点选/输入 → resumeHuiyuStageConfirmOrchestration 经注册 handler：
 *     复用同一个 buildHuiyuDispatchSeam 的 dispatch 实现，带 stagedStep/confirmAnswer 直接续派该阶段
 *     （后台跑，靠 subagentRunStatus 运行卡可见；不重放整条统筹/纠偏 loop）。
 *
 * 真值边界：pending 是**内存态**（刷新即消）——自愈闭环兜底：阶段状态持久在地图真值
 * meta.stage/meta.confirmedAtStage，提调下次盘点仍会看到"这个阶段还没收尾"而重新派发，丢卡不丢需求，
 * 故不做持久化。与 scope 卡同一简化：pending 是全局单例（不按会话建 Map）——同一时刻只有一张绘舆确认卡
 * 在等用户处理，这也是 buildHuiyuDispatchSeam 拒绝"已有一张待处理"重复派发的依据。
 * 拒绝记忆同为内存态（刷新即清）。
 */

export interface HuiyuStageConfirmRedispatch {
  /** 原任务短标题（重派 dispatchMapWork 用）。 */
  task: string
  /** 原始任务书：stageEndConfirm/terraformConfirm 分支重派时直接复用（对应的 runHuiyuStage 分支不看
   *  instructions，只看 confirmAnswer）；draftConfirm 分支重派前会与确认卡内容+用户答复合并出新文本
   *  （见 {@link composeHuiyuStagedDrawInstructions}），本字段保留原文供合并。 */
  instructions: string
  focus?: string
  /** 确认卡发起时的阶段（仅供拒绝记忆判重键用；重派本身不透传，dispatch 内部按 resolveCurrentMapStage
   *  现查——阶段可能被其它派发推进，重派必须信最新阶段，不能用发起时的旧快照）。 */
  stage: MapStageId
  /** 是哪一种确认点：决定重派参数与是否需要合并 instructions。 */
  kind: 'draftConfirm' | 'stageEndConfirm' | 'terraformConfirm'
  /** 重派时要传的 stagedStep（与 kind 对应固定：draftConfirm→'draw'；stageEndConfirm/terraformConfirm→
   *  'confirmStage'/'draw'，取 runHuiyuStage 返回的 result.nextStep 原样，不在这里重新推导）。 */
  nextStep: 'draw' | 'confirmStage'
  /** 会话候选角色（重派时重建 buildHuiyuDispatchSeam 的 candidates/研究上下文用）。 */
  candidates: Array<{ characterId: string; name: string }>
  /** 请求发起轮的锚用户消息 id（大脑召回落池接缝入场券·0=不可用，重建研究上下文时据此跳过）。 */
  anchorMessageId: number
}

export interface HuiyuStageConfirmPendingState {
  /** 呈给用户的确认卡（kind 固定为 'choice'：title=确认问题，options=原样，allowOtherInput=true——
   *  三种确认点都支持"选项之外自己写"，对应 stageEndConfirm 的定向修复自由文本路径）。 */
  request: InteractionRequest
  sessionId: string
  redispatch: HuiyuStageConfirmRedispatch
  /** 草案剪影清单（地图草案剪影可视化计划批1·可选增强，仅 draftConfirm 且绘舆给了 sketches 时才有）：
   *  与 InteractionRequest 分开放（不塞进 agentRuntime 的通用 request 形状），供坞侧画 overlay。 */
  sketches?: HuiyuDraftSketchItem[]
  /** 世界 id（随 sketches 同时给，供前端定位地图）。 */
  worldId?: string
}

/** 由派发入参推导确认点种类（kind）：与 huiyuOrchestration.runHuiyuStage 内部路由同一套判定——
 *  override:'terraform' 时问的是改造批准卡；stagedStep:'draw' 时是落笔后的阶段收尾卡；
 *  其余（缺省/'draft'）是草案确认卡。buildHuiyuDispatchSeam 的已有卡/拒绝记忆判重键也用它。 */
export function deriveHuiyuStageConfirmKind(input: { stagedStep?: string; override?: string }): HuiyuStageConfirmRedispatch['kind'] {
  if (input.override === 'terraform') return 'terraformConfirm'
  if (input.stagedStep === 'draw') return 'stageEndConfirm'
  return 'draftConfirm'
}

/** 由 runHuiyuStage 的 awaitingConfirm 结果 + 本次派发入参 + 会话候选/锚点上下文，拼出要写进 pending 的
 *  完整载荷（纯函数·可测）：buildHuiyuDispatchSeam 的 staged 分支据此调用 setHuiyuStageConfirmPending。
 *  result.confirmQuestion 缺失（非 awaitingConfirm 状态）时返回 null，调用方按 null 跳过写卡。 */
export function buildHuiyuStageConfirmPending(
  sessionId: string,
  input: { task: string; instructions: string; focus?: string; stagedStep?: string; override?: string },
  stage: MapStageId,
  result: {
    nextStep?: 'draft' | 'draw' | 'confirmStage'
    confirmQuestion?: { question: string; options: Array<{ label: string; note?: string }>; sketches?: HuiyuDraftSketchItem[]; worldId?: string }
  },
  context: { candidates: Array<{ characterId: string; name: string }>; anchorMessageId?: number; worldId?: string }
): HuiyuStageConfirmPendingState | null {
  if (!result.confirmQuestion) return null
  return {
    request: {
      kind: 'choice',
      title: result.confirmQuestion.question,
      options: result.confirmQuestion.options,
      allowOtherInput: true,
      source: { agent: 'huiyu', toolName: 'dispatchMapWork' }
    },
    sessionId,
    // 剪影/世界 id（批1·可选增强）：优先取 confirmQuestion 自带的 worldId（来自 huiyuOrchestration 的
    // deps.worldId，与 sketches 同源同批塞入），没有才退回 context.worldId 兜底。
    ...(result.confirmQuestion.sketches?.length
      ? { sketches: result.confirmQuestion.sketches, worldId: result.confirmQuestion.worldId || context.worldId }
      : {}),
    redispatch: {
      task: input.task,
      instructions: input.instructions,
      ...(input.focus ? { focus: input.focus } : {}),
      stage,
      kind: deriveHuiyuStageConfirmKind(input),
      nextStep: result.nextStep === 'confirmStage' ? 'confirmStage' : 'draw',
      candidates: context.candidates,
      anchorMessageId: context.anchorMessageId || 0
    }
  }
}

const pendingHuiyuStageConfirm: Ref<HuiyuStageConfirmPendingState | null> = ref(null)

export function getHuiyuStageConfirmPendingRef(): Ref<HuiyuStageConfirmPendingState | null> {
  return pendingHuiyuStageConfirm
}

export function getHuiyuStageConfirmPending(): HuiyuStageConfirmPendingState | null {
  return pendingHuiyuStageConfirm.value
}

export function setHuiyuStageConfirmPending(state: HuiyuStageConfirmPendingState): void {
  pendingHuiyuStageConfirm.value = state
}

export function clearHuiyuStageConfirmPending(): void {
  pendingHuiyuStageConfirm.value = null
}

// ── 拒绝记忆（同 session + 同确认点防重弹）────────────────────────────────────
// 用户对某个确认点没有明确答复（denied/dismissed）后记下——防「提调下轮盘点又派同一个确认点→又弹卡」。
// 目标键=stage+kind（同一阶段的同一种确认点视为同一目标；确认成功/明确驳回都不计入拒绝记忆，只有
// "没给出可用答案"才记，因为选了驳回选项本身就是一个有效、终结的答复，不需要额外拒绝记忆兜底）。

const declinedHuiyuStageConfirms = new Map<string, Set<string>>()

function huiyuStageConfirmTargetKey(redispatch: { stage: string; kind: string }): string {
  return `${redispatch.stage}:${redispatch.kind}`
}

export function markHuiyuStageConfirmDeclined(sessionId: string, redispatch: { stage: string; kind: string }): void {
  const key = huiyuStageConfirmTargetKey(redispatch)
  const set = declinedHuiyuStageConfirms.get(sessionId) ?? new Set<string>()
  set.add(key)
  declinedHuiyuStageConfirms.set(sessionId, set)
}

export function isHuiyuStageConfirmDeclined(sessionId: string, redispatch: { stage: string; kind: string }): boolean {
  return Boolean(declinedHuiyuStageConfirms.get(sessionId)?.has(huiyuStageConfirmTargetKey(redispatch)))
}

/** 测试/会话重置用：清空某会话（缺省全部）的拒绝记忆。 */
export function clearHuiyuStageConfirmDeclined(sessionId?: string): void {
  if (sessionId) declinedHuiyuStageConfirms.delete(sessionId)
  else declinedHuiyuStageConfirms.clear()
}

// ── 剪影修订环轮数（地图草案剪影可视化计划批3）────────────────────────────────────
// advisory 驱动的 draftConfirm 决策 JSON 若命中 comments（需要重出剪影），每次都是一次独立的用户交互
// 触发的新派发（不是阻塞驱动 runDraftStep 那种单次函数调用内的递归），轮数不能靠调用栈参数带，改用同
// declined 记忆同一简化的内存态计数器（键=session+目标点，同 huiyuStageConfirmTargetKey）——与阻塞驱动
// HUIYU_SKETCH_REVISION_MAX 同一上限语义：达到上限后 useChatSendPipeline 的续派入口退回纯文字确认，
// 不再重出草案。内存态、刷新即清（可接受的降级：极端情况下只是 cap 松动，不影响正确性）。

const huiyuSketchRevisionRounds = new Map<string, number>()

export function getHuiyuSketchRevisionRound(sessionId: string, redispatch: { stage: string; kind: string }): number {
  return huiyuSketchRevisionRounds.get(`${sessionId}:${huiyuStageConfirmTargetKey(redispatch)}`) || 0
}

/** 修订轮 +1（每次因 comments 决定重出草案时调用），返回自增后的轮数。 */
export function bumpHuiyuSketchRevisionRound(sessionId: string, redispatch: { stage: string; kind: string }): number {
  const key = `${sessionId}:${huiyuStageConfirmTargetKey(redispatch)}`
  const next = (huiyuSketchRevisionRounds.get(key) || 0) + 1
  huiyuSketchRevisionRounds.set(key, next)
  return next
}

/** 修订环结束（采纳/无可行动决策/触顶回退）时调用，清空计数——下次全新草案轮从 0 起。 */
export function clearHuiyuSketchRevisionRound(sessionId: string, redispatch: { stage: string; kind: string }): void {
  huiyuSketchRevisionRounds.delete(`${sessionId}:${huiyuStageConfirmTargetKey(redispatch)}`)
}

// ── 确认答复 → 续派参数（纯函数·可测）────────────────────────────────────────

/** InteractionAnswer → 续派用的原始答复文本；denied/dismissed（用户没给出可用答案）返回 null。 */
export function huiyuStageConfirmAnswerText(answer: InteractionAnswer): string | null {
  if (answer.status === 'selection' && typeof answer.selection === 'string') return answer.selection
  if (answer.status === 'answered') return answer.answer
  return null
}

/** 草案确认卡答复是否等价于"驳回草案"（对齐 huiyuSubagent.isHuiyuDraftRejected 的判定口径：
 *  空串或明确选了驳回标签）。draftConfirm 分支被驳回时不需要重派——草案还没落笔，没有内容需要收尾。 */
export function isHuiyuStagedDraftAnswerRejected(answerText: string): boolean {
  const text = String(answerText || '').trim()
  return !text || text === HUIYU_DRAFT_REJECT_LABEL
}

/** draftConfirm 重派前的任务书合并（对齐 huiyuSubagent.composeHuiyuDrawTaskFromDraft 的合并语义，
 *  但没有原始 draft.facts/assumptions 结构化数据可用——advisory 续派没有 LLM 在场重新组织文本，
 *  改用确认卡渲染好的问题原文（本身已含摘要/依据/假设/缺料）整段并入，效果等价、无需额外结构化字段。 */
export function composeHuiyuStagedDrawInstructions(originalInstructions: string, cardQuestion: string, answerText: string): string {
  const lines = [String(originalInstructions || '').trim(), '', '【已确认的绘舆草案（确认卡原文）】', String(cardQuestion || '').trim()]
  const trimmed = String(answerText || '').trim()
  if (trimmed && trimmed !== HUIYU_DRAFT_CONFIRM_LABEL) {
    lines.push('', `【用户修改意见——以此为准】${trimmed}`)
  }
  return lines.join('\n')
}

// ── 结构化剪影决策 → 续派计划（地图草案剪影可视化计划批3·纯函数·可测）───────────────
// draftConfirm 决策 JSON 分流到批1 compose 语义（composeHuiyuDrawTaskFromSketchDecision/
// composeHuiyuRevisionDraftInput），advisory 续派只按计划顺序执行 seam.dispatch 与调整轮数计数器，
// 不自己判断分流逻辑——分流规则集中在这里，便于独立单测（对齐本文件其余纯函数的测试口径）。

/** 剪影 id → 人话描述：给 comments 里的 id 找回 label，找不到（异常情况）就退回原 id，不让文案空洞。 */
export function describeHuiyuSketchComments(sketches: HuiyuDraftSketchItem[] | undefined, comments: Record<string, string>): string {
  return Object.entries(comments)
    .map(([id, comment]) => `「${(sketches || []).find((item) => item.id === id)?.label || id}」：${comment}`)
    .join('；')
}

/** 一次 seam.dispatch 调用的参数（advisory 单卡限制下 planHuiyuSketchDecisionDispatch 每次只产出一条）。 */
export interface HuiyuSketchDecisionDispatchCall {
  task: string
  instructions: string
  focus?: string
  stagedStep: 'draw' | 'draft'
}

export interface HuiyuSketchDecisionPlan {
  /** 依次要发起的 seam.dispatch 调用（目前恒 1 条——见下方分流规则里的「已知简化」）。 */
  calls: HuiyuSketchDecisionDispatchCall[]
  /** 修订环计数器动作：调用方据此调 bumpHuiyuSketchRevisionRound/clearHuiyuSketchRevisionRound。 */
  revisionRoundAction: 'bump' | 'clear'
}

/** 结构化剪影决策 → 续派计划：调用方（useChatSendPipeline.ts 的绘舆确认续派入口）保证传入的 decision
 *  至少 accepted 或 comments 非空（空决策在更早处直接短路返回，不会调用本函数）。
 *  - accepted 非空：落笔（用户拍板"采纳即落笔"），走 composeHuiyuDrawTaskFromSketchDecision；
 *    若同时有 comments，折进落笔任务书当附注——**已知简化**（advisory 结构性限制，非漏做）：
 *    全局同一时刻只能挂一张确认卡（huiyuStageConfirmState pending 单例），落笔会立即产生阶段收尾
 *    确认卡占位，本轮无法再叠加发起修订重绘派发；不丢用户输入，只是不会本轮自动重出这些项目的草案。
 *    revisionRoundAction='clear'（本轮修订环告一段落）。
 *  - accepted 为空、comments 非空、round<HUIYU_SKETCH_REVISION_MAX：重出草案（stagedStep:'draft'，
 *    走 composeHuiyuRevisionDraftInput），revisionRoundAction='bump'。
 *  - accepted 为空、comments 非空、round>=HUIYU_SKETCH_REVISION_MAX：修订环触顶，退回纯文字确认路径
 *    （composeHuiyuStagedDrawInstructions，把意见文本当自由修改意见并入落笔任务书），revisionRoundAction='clear'。
 *  合成的 draft.summary 借确认卡渲染好的原文（cardTitle）顶替——advisory 续派没有原始
 *  HuiyuLayoutDraftResult 结构化数据，facts/assumptions 留空不影响 compose 函数行为（两个 compose 函数都
 *  只在 draft.facts/assumptions 非空时才追加对应小节）；sketches=这一轮真实剪影清单（batch1 已随
 *  pending 透传，供 compose 函数按 id 找回 label/几何）。 */
export function planHuiyuSketchDecisionDispatch(
  redispatch: { task: string; instructions: string; focus?: string },
  cardTitle: string,
  sketches: HuiyuDraftSketchItem[] | undefined,
  decision: HuiyuSketchDecision,
  revisionRound: number
): HuiyuSketchDecisionPlan {
  const syntheticDraft: HuiyuLayoutDraftResult = { ok: true, summary: cardTitle, facts: [], assumptions: [], missingInfo: [], sketches }
  const originalInput: HuiyuMapWorkInput = { task: redispatch.task, instructions: redispatch.instructions, ...(redispatch.focus ? { focus: redispatch.focus } : {}) }
  const commentEntries = Object.entries(decision.comments)
  if (decision.accepted.length) {
    let drawInput = composeHuiyuDrawTaskFromSketchDecision(originalInput, syntheticDraft, decision)
    if (commentEntries.length) {
      drawInput = {
        ...drawInput,
        instructions: `${drawInput.instructions}\n\n【用户对以下项目另有意见（本轮未自动重画，如需调整请再次派发处理）】${describeHuiyuSketchComments(sketches, decision.comments)}`
      }
    }
    return {
      calls: [{ task: drawInput.task, instructions: drawInput.instructions, ...(drawInput.focus ? { focus: drawInput.focus } : {}), stagedStep: 'draw' }],
      revisionRoundAction: 'clear'
    }
  }
  if (revisionRound >= HUIYU_SKETCH_REVISION_MAX) {
    const fallbackText = describeHuiyuSketchComments(sketches, decision.comments)
    const fallbackInstructions = composeHuiyuStagedDrawInstructions(redispatch.instructions, cardTitle, fallbackText)
    return {
      calls: [{ task: redispatch.task, instructions: fallbackInstructions, ...(redispatch.focus ? { focus: redispatch.focus } : {}), stagedStep: 'draw' }],
      revisionRoundAction: 'clear'
    }
  }
  const revisionInput = composeHuiyuRevisionDraftInput(originalInput, syntheticDraft, decision)
  return {
    calls: [{ task: revisionInput.task, instructions: revisionInput.instructions, ...(revisionInput.focus ? { focus: revisionInput.focus } : {}), stagedStep: 'draft' }],
    revisionRoundAction: 'bump'
  }
}

// ── 确认/续派通道 ────────────────────────────────────────────────────────────
/** 接线：管线（useChatSendPipeline）装配时注册；坞的确认卡点选/输入时经下方 resume 消费。
 *  answer=用户对确认卡的原始 InteractionAnswer；handler 内部据 huiyuStageConfirmAnswerText 取文本、
 *  据 redispatch.kind 决定是否需要合并 instructions，再复用 buildHuiyuDispatchSeam 的 dispatch 实现续派。
 *  后注册覆盖先注册（管线单实例）。 */
type HuiyuStageConfirmResumeHandler = (pending: HuiyuStageConfirmPendingState, answer: InteractionAnswer) => Promise<void>

let resumeHandler: HuiyuStageConfirmResumeHandler | null = null

export function registerHuiyuStageConfirmResumeHandler(handler: HuiyuStageConfirmResumeHandler | null): void {
  resumeHandler = handler
}

/** 消费 pending：读+清 → 交给注册 handler。无 pending / 无 handler 时空操作（幂等）。 */
export async function resumeHuiyuStageConfirmOrchestration(answer: InteractionAnswer): Promise<void> {
  const pending = pendingHuiyuStageConfirm.value
  if (!pending) return
  pendingHuiyuStageConfirm.value = null
  if (!resumeHandler) {
    console.warn('[huiyuStageConfirm] 确认通道未接入（handler 缺失），确认结果被丢弃')
    return
  }
  await resumeHandler(pending, answer)
}
