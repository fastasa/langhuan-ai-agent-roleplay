/**
 * 星依会话上下文共享层（状态系统取料闭环计划批次3）——「活动会话 or 显式指定会话」的单一真值。
 *
 * 由来：状态系统四件套与读/搜投影两件套都是「对话级」工具，原本只认活动会话（chatSummary 桥）。
 * 用户诉求：没打开对话时能指定「在哪个对话里操作」（先用 listChatContacts 看清单，再带 session 参数）。
 * 本模块把「拿会话上下文」收敛成一处：
 *  - 缺省（不给 session）：读活动会话（chatSummary 桥·与总结对话同一份真值）。
 *  - 给 session（会话名/联系人名/targetId/sessionId）：走浮坞注入的 resolveSessionContext 解析成完整上下文。
 *
 * 上下文形状 = { sessionId, sessionTitle, characterOptions（会话成员角色·saveStatusPanel 挂 character 宿主用）}。
 */

import { getXingyiFunctionProvider } from './xingyiFunctionBridge'

export interface XingyiSessionContext {
  sessionId: string
  sessionTitle: string
  characterOptions: Array<{ id: string; name: string; participantId?: string }>
}

/** 显式会话解析器（浮坞注入）：把「会话名/联系人名/targetId/sessionId」解析成完整上下文；解析不到返回 null。 */
export type XingyiSessionResolverResult = XingyiSessionContext | { error: string } | null
export type XingyiSessionResolver = (identifier: string) => Promise<XingyiSessionResolverResult>

/** 已存在会话候选解析：精确 sessionId 永远优先；同名标题必须把候选交回用户，不替用户猜。 */
export function resolveXingyiSessionCandidate(
  candidates: XingyiSessionContext[],
  identifier: string
): { context?: XingyiSessionContext; error?: string } {
  const id = String(identifier || '').trim()
  const byId = candidates.find((candidate) => candidate.sessionId === id)
  if (byId) return { context: byId }
  const exactTitle = candidates.filter((candidate) => candidate.sessionTitle === id)
  if (exactTitle.length === 1) return { context: exactTitle[0] }
  if (exactTitle.length > 1) {
    const lines = exactTitle.slice(0, 8).map((candidate, index) => {
      const members = candidate.characterOptions.map((item) => item.name).filter(Boolean)
      return `${index + 1}. ${candidate.sessionTitle}｜${members.length ? members.join('、') : '成员未加载'}｜sessionId ${candidate.sessionId}`
    })
    return { error: `找到 ${exactTitle.length} 个同名会话「${id}」，不能替用户猜。请调用 askUser 展示以下候选并让用户选择：\n${lines.join('\n')}` }
  }
  return {}
}

/** 会话上下文接缝（状态/投影工具 context 共用这两项）。 */
export interface XingyiSessionContextSeam {
  /** 活动会话上下文：缺省=chatSummary 桥（与总结对话同一份真值）。 */
  getSessionContext?: () => XingyiSessionContext | null
  /** 显式会话解析器：缺省=不接入（此时给了 session 参数会如实报「指定会话功能未接入」）。 */
  resolveSessionContext?: XingyiSessionResolver
}

/** 读活动会话上下文（缺省走 chatSummary 桥）。 */
export function readActiveSessionContext(seam: XingyiSessionContextSeam): XingyiSessionContext | null {
  if (seam.getSessionContext) return seam.getSessionContext()
  const context = getXingyiFunctionProvider('chatSummary')?.getContext()
  return context
    ? { sessionId: context.sessionId, sessionTitle: context.sessionTitle, characterOptions: context.characterOptions }
    : null
}

export type XingyiSessionResolveOutcome =
  | { context: XingyiSessionContext }
  | { error: string }
  | { noActiveSession: true }

/**
 * 统一取会话上下文：
 *  - 给了 sessionArg → 用 resolveSessionContext 解析（未接入/解析不到给可读 error·retryable）。
 *  - 没给 → 读活动会话；没有活动会话返回 { noActiveSession }（调用方给对话级三态提示）。
 */
export async function resolveXingyiSessionForCall(
  seam: XingyiSessionContextSeam,
  sessionArg: unknown
): Promise<XingyiSessionResolveOutcome> {
  const identifier = String(sessionArg ?? '').trim()
  if (identifier) {
    if (!seam.resolveSessionContext) {
      return { error: '指定会话（session 参数）功能未接入，这轮只能操作当前打开的会话。请先打开目标会话再试。' }
    }
    const context = await seam.resolveSessionContext(identifier)
    if (context && 'error' in context) return { error: context.error }
    if (!context) {
      return { error: `没有找到会话「${identifier}」。可先用 listChatContacts 看会话清单（同名对话用 targetId 区分），再用准确的名字或 id 指定 session。` }
    }
    return { context }
  }
  const active = readActiveSessionContext(seam)
  if (!active) return { noActiveSession: true }
  return { context: active }
}
