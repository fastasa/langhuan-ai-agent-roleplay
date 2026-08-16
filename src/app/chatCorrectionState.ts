import { ref } from 'vue'

/**
 * 提调「纠偏挂起 → 继续/取消」的跨层共享状态。
 *
 * 停止语义统一（用户 2026-07-04 拍板）：编排带上的「停止」按钮已退役，全局唯一停止入口是
 * 输入框右下角的 abortChat——stopChatTaskRun 会 abort 本轮 controller + 置 stopRequested，
 * 提调 loop（AbortError）与演员链路（isStopRequested/assertPipelineCanContinue）随之立即终止，
 * 不走确定性兜底续跑。停止后想纠偏，对已停轮直接在提调框发起即可（失败/停止轮可锚定）。
 * 旧「编排带停止=软停挂起等纠偏」机制（correctionPauseRequested/correctionStopping/硬中断句柄）已随之删除。
 *
 * 本模块保留的 pendingCorrection 挂起态仍有现役入口：提调 askUser「没把握先问用户」提问态
 * （loop 返回 ask-user 策略后挂起，用户在提调框答复 → continueCorrection 续跑）。
 */

export interface PendingCorrectionContext {
  sessionId: string
  targetId: string
  anchorMessageId: number
  anchorIndex: number
  baseUserContent: string
  parentAttemptId: string
  replacedMessageIds: number[]
  correction: string
  // 被纠偏/被提问锚定的消息 id：continueCorrection 据此回到三策择优 loop 续跑（correctChatMessageViaDirector）。
  // 现役唯一挂起来源（askUser 提问态）必带；旧「编排带停止」系列挂起（重试/精修/用户消息重跑）已随停止统一退役。
  correctionTargetMessageId?: number
  // 批次B·没把握先问用户：本挂起来自「提调调 askUser 提问、进提问态」时，记提调问的问题（含推荐选项渲染文本），
  // 让 continueCorrection 续跑时把「你问了什么 + 用户答复」一起织进指令，提调据此正确续做、不重复问。缺省 undefined。
  askedQuestion?: string
}

const pendingCorrection = ref<PendingCorrectionContext | null>(null)

export function getPendingCorrectionRef() {
  return pendingCorrection
}

export function getPendingCorrection(): PendingCorrectionContext | null {
  return pendingCorrection.value
}

export function setPendingCorrection(context: PendingCorrectionContext): void {
  pendingCorrection.value = context
}

export function updatePendingCorrectionText(text: string): void {
  if (pendingCorrection.value) {
    pendingCorrection.value = { ...pendingCorrection.value, correction: String(text ?? '') }
  }
}

export function clearPendingCorrection(): void {
  pendingCorrection.value = null
}

/** 是否存在挂起的纠偏，且锚点是指定用户消息（编排带据此进入 correcting 态）。 */
export function isPendingCorrectionForAnchor(anchorMessageId: number): boolean {
  const current = pendingCorrection.value
  if (!current) return false
  return Number(current.anchorMessageId) === Number(anchorMessageId)
}

// ───────────────────────────────────────────────────────────────────────────
// 批次3·提调会话续接（2026-06-22）
//   提调专属输入框里输入的全是给提调的指令——「继续」类整句 = 续接上一轮被中断的提调任务
//  （而非一条新纠偏意见）。中途异常终止/刷新后，已改消息（批次1）与决策流（批次2）都已落库，
//   续接时提调读到现状（已改消息）+ 框定续跑，凭记忆继续把没做完的做完。
// ───────────────────────────────────────────────────────────────────────────

/** 「继续」类整句白名单（只在整句命中时当续接，避免「继续描写夜色」这类真指令被误吞）。 */
const DIRECTOR_RESUME_TEXTS = new Set([
  '继续', '继续吧', '继续做', '继续完成', '继续刚才的', '继续刚才', '接着', '接着做', '接着上面', '接着来',
  '继续把没做完的做完', '继续未完成的', 'go on', 'continue', 'resume', 'keep going'
])

/** 判断提调框这句是不是「续接上一轮被中断任务」的整句指令（整句白名单命中、剥末尾标点/空白）。 */
export function isDirectorResumeText(text: string): boolean {
  const trimmed = String(text ?? '').trim().toLowerCase().replace(/[。.!！~、，,\s]+$/u, '')
  return DIRECTOR_RESUME_TEXTS.has(trimmed)
}

/** 续接指令文本（给提调 loop 的 brief.instruction）：
 *  批次1(D)·续接带原始指令——有「用户原始纠偏指令」时把它原话作为「最高优先」回灌（续接不丢用户的命令，
 *  让提调随时知道哪些是用户的指令）+ 续接说明；查不到原始指令时退化为通用续接说明（凭现状凭记忆继续）。 */
export function buildDirectorResumeInstruction(originalInstruction?: string): string {
  const resumeNote = '接着你上一轮被中断的提调任务：先看这条消息现在的内容（你之前已经改过的部分已经落库、就是现在看到的样子），'
    + '根据你之前已经做过的改动，判断还有哪些没做完，继续把没做完的部分做完；已经做好的不要从头重做。'
  const original = String(originalInstruction ?? '').trim()
  if (!original) return resumeNote
  return `【用户的原始指令·最高优先，必须照它做】${original}\n${resumeNote}`
}
