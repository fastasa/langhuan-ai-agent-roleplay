// 人在环上统一契约（2026-07-12 架构审查批C）——「agent 中途要用户输入」的唯一信封。
// 三种投递模式共用本信封，控制流各自保留（设计与取舍详见
// 交互契约：
// - blocking：工具 execute 内 await 用户（星依浮坞三卡），turn 不结束，工具需 longRunning 免超时；
// - halt：工具返回 awaitingUser 标记，引擎以 terminalReason='awaiting-user' 收束本 loop，
//   答复由管线喂进新 loop 续接（提调纠偏 askUser）；
// - advisory：非阻塞递卡不等答复，loop 照常收尾，答复走注册的 resume handler
//   （提调 scope 卡「丢卡不丢需求」/绘舆 staged 回执转呈）。
// 待确认卡全线为内存态、刷新即消（现状保持）：blocking 卡随浏览器侧 loop 一起消亡，单独持久化无意义；
// advisory 卡靠业务真值自愈。若未来 agent 大脑迁服务端，挂起持久化在引擎层补（退出条件见计划书）。
// 展示位置同样属于统一契约：进行中的 InteractionRequest 必须由 AgentInteractionDock 托管，固定在
// 当前 Agent 信息流与输入/底边控制区之间；不得再把活动卡作为普通消息节点塞进可滚动信息流。

import type { ToolExecutionResult } from './toolRegistry'

export type InteractionKind = 'confirm' | 'choice' | 'scope'

export interface InteractionOption { label: string; note?: string }

export interface InteractionRequest {
  kind: InteractionKind
  /** confirm=卡标题；choice=问题本文 */
  title: string
  /** confirm 卡逐行内容 */
  lines?: string[]
  options?: InteractionOption[]
  allowOtherInput?: boolean
  /** choice 模式：推荐选项 label */
  recommended?: string
  /** 溯源：哪个 agent 的哪个工具发起（UI 展示与审计用） */
  source: { agent: string; toolName: string }
  /** scope 等复杂卡的扩展载荷（渲染方按 kind 解读） */
  payload?: Record<string, unknown>
}

/** 用户答复的统一形态——「取消」全线收敛为成功态回流（模型不该重试，应转述并尊重）：
 *  denied=明确拒绝（confirm 卡点取消）；dismissed=关卡未答（choice 卡直接关闭）。 */
export type InteractionAnswer =
  | { status: 'confirmed' }
  | { status: 'denied' }
  | { status: 'answered'; answer: string }
  | { status: 'dismissed' }
  | { status: 'selection'; selection: unknown }

/** blocking 模式通道签名（星依浮坞注入方实现）。halt/advisory 模式不经本接口。 */
export type InteractionChannel = (request: InteractionRequest) => Promise<InteractionAnswer>

// ============================================================
// 运行时 helper（2026-07-12 批C·C1 子批）——写确认门统一
// ============================================================
// 星依写工具目前直接用浮坞注入的布尔 confirmWrite 通道（不是上面的 InteractionChannel 全信封形态，
// 通道签名迁移是后续批次的事，本批不碰 XingyiDock）。此前六个工具文件各自手抄了同一段
// 「缺通道硬拒绝 / 用户取消=成功态 denied / 确认放行」模板，这里收敛成两个函数：
// 阶段①在拿到 confirmWrite 后立刻硬门检查（缺通道直接拒绝，不做任何解析/请求）；
// 阶段②在真正弹确认卡片处调用（用户取消=成功态，模型不该重试）。
// 各调用点历史文案两种格式并存（部分不带 action、部分硬门文案与放行 action 不同名），
// 用参数原样保留，不做统一改写——迁移零文案变化。

/** 写确认门请求：与浮坞 confirmWrite 通道入参同形状（标题+条目行）。 */
export interface ConfirmWriteRequest {
  title: string
  lines: string[]
}

/** 写确认门通道签名（浮坞注入）。
 *  兼容历史 boolean：true=确认、false=取消；新通道应返回统一 InteractionAnswer，
 *  answered=用户没有直接放行，而是提交了修改意见，写操作必须停住并把意见回给模型。 */
export type ConfirmWriteChannel = (request: ConfirmWriteRequest) => Promise<boolean | InteractionAnswer>

/** 阶段①硬门：缺通道直接拒绝执行（error 型结果，retryable:false）。
 *  action 缺省=通用文案（历史遗留：部分调用点从不传 action，字节原样保留）。 */
export function requireConfirmWriteChannel(
  confirmWrite: ConfirmWriteChannel | undefined,
  action?: string
): ToolExecutionResult | null {
  if (confirmWrite) return null
  return {
    content: action
      ? `写操作确认通道未接入，星依这轮不能执行「${action}」。请如实告知用户本工具暂不可用。`
      : '写操作确认通道未接入，星依这轮不能执行写操作。请如实告知用户本工具暂不可用。',
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message: '写操作确认通道未接入（confirmWrite 缺失）', retryable: false }
  }
}

/** 阶段②弹卡片：调用通道等用户点选；取消=成功态 denied 结果（不是故障，模型不该重试），null=已确认放行。 */
export async function askConfirmWrite(
  confirmWrite: ConfirmWriteChannel,
  request: ConfirmWriteRequest,
  action: string
): Promise<ToolExecutionResult | null> {
  const answer = await confirmWrite(request)
  if (answer === true || (typeof answer === 'object' && answer?.status === 'confirmed')) return null
  if (typeof answer === 'object' && answer?.status === 'answered') {
    const feedback = String(answer.answer || '').trim()
    return {
      content: `用户没有确认执行「${action}」，并提出了修改意见：${feedback}。本次写操作没有执行。请按这条意见修订方案；需要写入时，带着修订后的完整内容重新发起确认。`,
      details: { feedback, needsRevision: true }
    }
  }
  return {
    content: `用户在确认卡片上取消了「${action}」，本次写操作没有执行。请尊重用户决定，不要自行重试。`,
    details: { denied: true }
  }
}
