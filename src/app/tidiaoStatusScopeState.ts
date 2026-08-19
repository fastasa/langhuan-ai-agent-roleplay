import { ref, type Ref } from 'vue'
import type { XingyiStatusScopeRequest, XingyiStatusScopeSelection } from './xingyiStatusScopeTool'

export interface TidiaoStatusScopeCharacterOption {
  id: string
  name: string
  participantId: string
}

/** 把导演候选的角色主档 id 与会话参与者正式 id 合并成可跨确认卡传递的造册宿主候选。 */
export function buildTidiaoStatusScopeCharacterOptions(
  candidates: Array<{ characterId?: unknown; name?: unknown }>,
  participantIdByCharacterId: ReadonlyMap<string, string>
): TidiaoStatusScopeCharacterOption[] {
  return candidates.map((candidate) => {
    const id = String(candidate.characterId || '')
    return {
      id,
      participantId: participantIdByCharacterId.get(id) || '',
      name: String(candidate.name || '')
    }
  })
}

/**
 * 提调「建状态栏前 scope 确认」全局态（并行编排计划批次B·2026-07-10 非阻塞化，取代批次4 挂起-续跑形态）。
 *
 * 非阻塞语义：统筹调 confirmStatusScope → 工具经 scopeSeam 写本模块 pending（弹卡）→ **统筹继续排戏不停**
 *   → 用户在提调坞 scope 卡上逐人确认/取消 → 确认一位推进下一位，全部处理完才经注册 handler：
 *     已确认项合成一个任务书派「造册」批量建栏（不重放统筹）；取消项记拒绝，不影响前面已确认范围。
 *
 * 真值边界：pending 是**内存态**（刷新即消）——自愈闭环兜底：状态栏 MD 每轮注入，提调下轮盘点仍见缺栏
 * 会再次请求，丢卡不丢需求，故不做持久化。pending 生命周期=确认/取消才清（与统筹轮解耦，不再随新轮清除）。
 * 拒绝记忆同为内存态（刷新即清·用户刷新后提调再请求可再拒，可接受）。
 */

export interface TidiaoStatusScopePendingState {
  /** 统筹请求确认的内容（purpose/characterHint/sessionHint·复用星依 scope 请求形状）。 */
  request: XingyiStatusScopeRequest
  /** 请求发起的会话（scope 卡只在该会话的提调坞显示；确认后造册建在该会话）。 */
  sessionId: string
  /** 请求发起轮的锚用户消息 id（造册的大脑召回落池接缝 buildDirectorRecallPoolSeam 入场券·审计定位）。 */
  anchorMessageId: number
  /**
   * 会话成员（scope 卡角色单选 chip 选项=建栏宿主候选·与统筹 candidates 同源）。
   * participantId 是状态栏 session_character 宿主的正式 id；必须随确认卡一直保留到造册落库。
   */
  characterOptions: TidiaoStatusScopeCharacterOption[]
  /** 本次逐卡确认队列；缺省时由 set 函数按 request 归一成单项队列。 */
  requests?: XingyiStatusScopeRequest[]
  currentIndex?: number
  resolvedItems?: TidiaoStatusScopeResolvedItem[]
  declinedRequests?: XingyiStatusScopeRequest[]
}

export interface TidiaoStatusScopeResolvedItem {
  request: XingyiStatusScopeRequest
  selection: XingyiStatusScopeSelection
}

const pendingStatusScope: Ref<TidiaoStatusScopePendingState | null> = ref(null)

export function getTidiaoStatusScopePendingRef(): Ref<TidiaoStatusScopePendingState | null> {
  return pendingStatusScope
}

export function getTidiaoStatusScopePending(): TidiaoStatusScopePendingState | null {
  return pendingStatusScope.value
}

export function setTidiaoStatusScopePending(state: TidiaoStatusScopePendingState): void {
  const requests = Array.isArray(state.requests) && state.requests.length ? state.requests : [state.request]
  pendingStatusScope.value = {
    ...state,
    request: requests[0],
    requests,
    currentIndex: 0,
    resolvedItems: [],
    declinedRequests: []
  }
}

export function clearTidiaoStatusScopePending(): void {
  pendingStatusScope.value = null
}

// ── 拒绝记忆（批次B）─────────────────────────────────────────────────────────
// 用户点「取消」后记下「本会话已拒绝为该目标建栏」，confirmStatusScope 对已拒绝目标直接回执拒绝理由——
// 防「每轮盘点见缺栏→每轮弹卡」骚扰。目标键=characterHint（缺省退 purpose）归一化；会话级内存 Map。

const declinedScopeTargets = new Map<string, Set<string>>()

function scopeTargetKey(request: XingyiStatusScopeRequest): string {
  return (String(request.characterHint || '').trim() || String(request.purpose || '').trim()).toLowerCase()
}

export function markTidiaoStatusScopeDeclined(sessionId: string, request: XingyiStatusScopeRequest): void {
  const key = scopeTargetKey(request)
  if (!key) return
  const set = declinedScopeTargets.get(sessionId) ?? new Set<string>()
  set.add(key)
  declinedScopeTargets.set(sessionId, set)
}

export function isTidiaoStatusScopeDeclined(sessionId: string, request: XingyiStatusScopeRequest): boolean {
  const key = scopeTargetKey(request)
  return Boolean(key && declinedScopeTargets.get(sessionId)?.has(key))
}

/** 测试/会话重置用：清空某会话（缺省全部）的拒绝记忆。 */
export function clearTidiaoStatusScopeDeclined(sessionId?: string): void {
  if (sessionId) declinedScopeTargets.delete(sessionId)
  else declinedScopeTargets.clear()
}

// ── 确认/取消通道 ────────────────────────────────────────────────────────────
/** 接线：管线装配时注册；逐卡全部完成后一次回传确认项和取消项。
 *  后注册覆盖先注册（管线单实例）。 */
type TidiaoStatusScopeResumeHandler = (
  pending: TidiaoStatusScopePendingState,
  resolvedItems: TidiaoStatusScopeResolvedItem[],
  declinedRequests: XingyiStatusScopeRequest[]
) => Promise<void>

let resumeHandler: TidiaoStatusScopeResumeHandler | null = null

export function registerTidiaoStatusScopeResumeHandler(handler: TidiaoStatusScopeResumeHandler | null): void {
  resumeHandler = handler
}

/** 消费当前卡：还有下一角色就原位推进；全部选完后才清卡并一次交给 handler 批量造册。 */
export async function resumeTidiaoStatusScopeOrchestration(selection: XingyiStatusScopeSelection | null): Promise<void> {
  const pending = pendingStatusScope.value
  if (!pending) return
  const requests = Array.isArray(pending.requests) && pending.requests.length ? pending.requests : [pending.request]
  const currentIndex = Math.max(0, Math.min(requests.length - 1, Number(pending.currentIndex || 0)))
  const currentRequest = requests[currentIndex]
  const resolvedItems = [...(pending.resolvedItems || [])]
  const declinedRequests = [...(pending.declinedRequests || [])]
  if (selection) resolvedItems.push({ request: currentRequest, selection })
  else declinedRequests.push(currentRequest)
  const nextIndex = currentIndex + 1
  if (nextIndex < requests.length) {
    pendingStatusScope.value = {
      ...pending,
      request: requests[nextIndex],
      requests,
      currentIndex: nextIndex,
      resolvedItems,
      declinedRequests
    }
    return
  }
  pendingStatusScope.value = null
  if (!resumeHandler) {
    console.warn('[statusScope] 确认通道未接入（handler 缺失），scope 确认结果被丢弃')
    return
  }
  await resumeHandler({ ...pending, requests, currentIndex, resolvedItems, declinedRequests }, resolvedItems, declinedRequests)
}

// ── 造册任务书拼装（纯函数·spec 直测）──────────────────────────────────────
// 用户确认后交给「造册」子agent的 user 消息：目的+已确认范围（角色/参考对话/文档库）+范围外禁令。
// 建卡工具机器名不写在这里（造册系统提示词已带·契约「工具名只在注册时出现」）。

export function buildZaoceBrief(
  pending: TidiaoStatusScopePendingState,
  selection: XingyiStatusScopeSelection
): string {
  return buildZaoceBatchBrief(pending, [{ request: pending.request, selection }])
}

/** 多角色逐卡确认完成后的单份造册任务书：每项范围独立列明，后台只启动一次。 */
export function buildZaoceBatchBrief(
  pending: TidiaoStatusScopePendingState,
  items: TidiaoStatusScopeResolvedItem[]
): string {
  const confirmed = items.filter((item) => item?.selection)
  const title = confirmed.length > 1 ? `${pending.request.purpose}等 ${confirmed.length} 个对象的批量造册` : pending.request.purpose
  const scopeLines = confirmed.flatMap((item, index) => {
    const selection = item.selection
    const sessionLabels = (selection.sessions || []).map((session) => `${session.title}（sessionId=${session.sessionId}）`)
    const characterName = String(selection.characterName || '').trim()
    return [
      `${index + 1}. ${item.request.purpose}`,
      `   - 状态栏宿主：${characterName || '（用户未指定，按该项任务目的理解）'}${characterName === '用户' ? '（=给用户/玩家本人建，hostType 用 user）' : ''}`,
      `   - 取料参考对话（只看这些，共 ${sessionLabels.length} 个）：${sessionLabels.join('、') || '（未选·只用当前对话）'}`,
      `   - 文档库范围：${String(selection.docScopeSummary || '').trim() || '（用户未限定——不要漫无目的全量查，围绕该对象按需检索）'}`
    ]
  })
  return [
    `【建栏任务】${title}`,
    '',
    '【用户已确认的范围（铁律·超出即违规）】',
    ...scopeLines,
    '',
    '要求：状态栏都建在当前会话、宿主逐项对应上面确认的对象；先查会话里有没有合适模板，没有就原创字段骨架再实例化；'
      + '字段值要依据已确认范围内查到的真实资料填写，查不到的字段留空或按常识给保守初值并在说明里注明；'
      + '禁止把一个对象的范围挪给另一个对象，禁止引入范围外资料，禁止编造设定。多张新建/修改尽量汇总成一次原子批量提交；建完调用交稿工具汇报。'
  ].join('\n')
}
