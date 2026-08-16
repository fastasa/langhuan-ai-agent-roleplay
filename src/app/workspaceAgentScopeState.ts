/**
 * 工作区专业Agent（编剧/舆图师/鉴心）按作用域可多实例并存的运行状态容器。
 *
 * 背景：地图/剧本工作区左栏此前借用同一个全局单例 XingyiDock 实例（Teleport 换宿主而非独立实例），
 * 会话/消息/运行态/待确认卡因此天然互相覆盖（见 2026-07-15_地图与剧本工作区专业Agent计划书 批A）。
 * 本容器骨架照抄 subagentRunStatus.ts 的 `Record<key, State>` 模式，不复用 xingyiTurnStreamState.ts /
 * agentState/appendLog.ts 这两个"看似可复用、实为单槽位"的全局单例——那两个只支持"同一时刻一个"，
 * 编剧/舆图师/星依三者若同时跑会互相冲掉过程流展示。
 *
 * scopeKey 约定：编剧 `scriptwriter:<worldId>`；舆图师 `cartographer:<worldId>:<sheetId>`；
 * 鉴心（内部兼容 kind=personality_trainer）`personality-trainer:<characterId>`。
 */

import { reactive } from 'vue'
import type { ConfirmWriteChannel, InteractionRequest, InteractionAnswer } from './agentRuntime/interactionContract'
import type { AgentTaskTodoSnapshot } from './agentRuntime/taskTodo'
import type { MapDraftReviewRequest, MapDraftReviewResolution, ReviewMapDraft } from './mapDraftReview'
import type { WorkspaceAgentKind } from '../../shared/agentSessionKinds'
import { createAgentTurnStreamState, type AgentTurnStreamEntry, type AgentTurnStreamState } from './agentTurnStream'
import {
  createDefaultAgentConversationModelSelection,
  type AgentConversationModelSelection
} from './agentConversationModelSelection'

export type { WorkspaceAgentKind }

/** 专业会话消息：业务正文与信息流持久化投影同属于这条消息，但信息流不参与 Agent history prompt。 */
export interface WorkspaceAgentDisplayMessage {
  role: 'user' | 'assistant'
  content: string
  turnStream?: AgentTurnStreamEntry[]
}

/** 待确认/待选择态：resolve 是本次交互的答复回调，供发起方（agent loop）挂起等待。 */
export interface WorkspaceAgentPendingInteraction {
  request: InteractionRequest
  resolve: (answer: InteractionAnswer) => void
}

/** 地图最终草稿审阅待决态（舆图师专属，批C）：与 pendingInteraction 平行的独立信封——
 *  审阅协议传递的是几何候选清单+图纸并发签名，不是"标题+几行字"，接不进 ConfirmWriteChannel，
 *  见 mapDraftReview.ts 与母计划批C调研第6点。宿主（MapViewerDialog.vue）用自身已有的
 *  draftReviewItems/MapDraftActionBar 渲染能力消费 request.items，决策后调用 resolve。 */
export interface WorkspaceAgentPendingMapDraftReview {
  request: MapDraftReviewRequest
  resolve: (resolution: MapDraftReviewResolution) => void
}

export interface WorkspaceAgentScopeState {
  scopeKey: string
  agentKind: WorkspaceAgentKind
  targetId: string
  sessionId: string | null
  sessionLoaded: boolean
  messages: WorkspaceAgentDisplayMessage[]
  /** 每个 scope 独立一份实时信息流，禁止回退全局单槽位。 */
  turnStream: AgentTurnStreamState
  /** 当前 Agent 对话的 runtime TODO；停止/补充消息续接，切换到新会话后按会话 id 隔离。 */
  taskTodo: AgentTaskTodoSnapshot | null
  /** 当前对话经 toolsearch 激活的业务工具名；每轮仍会与真实 registry 取交集。 */
  deferredActiveTools: string[]
  /** 当前专业 Agent 对话选择的模型槽与努力程度。 */
  modelSelection: AgentConversationModelSelection
  draft: string
  running: boolean
  abortController: AbortController | null
  pendingInteraction: WorkspaceAgentPendingInteraction | null
  pendingMapDraftReview: WorkspaceAgentPendingMapDraftReview | null
}

/** key = scopeKey。整体替换写入保证响应式（同 subagentRunStatus.ts 写法）。 */
const scopeStateMap: Record<string, WorkspaceAgentScopeState> = reactive({})
/**
 * 写权限模式只属于本次应用运行期：刷新安全复位，但关闭/重开弹窗不丢。
 * 与消息大状态分开保存，避免为了记一个布尔值阻止空闲 scope 的正常释放。
 */
const writeApprovalModeMap: Record<string, { autoApproveWrites: boolean }> = reactive({})

export function getOrCreateWorkspaceAgentWriteApprovalMode(scopeKey: string): { autoApproveWrites: boolean } {
  const key = String(scopeKey || '').trim()
  if (!writeApprovalModeMap[key]) writeApprovalModeMap[key] = reactive({ autoApproveWrites: false })
  return writeApprovalModeMap[key]
}

function createEmptyState(scopeKey: string, agentKind: WorkspaceAgentKind, targetId: string): WorkspaceAgentScopeState {
  return {
    scopeKey,
    agentKind,
    targetId,
    sessionId: null,
    sessionLoaded: false,
    messages: [],
    turnStream: createAgentTurnStreamState(),
    taskTodo: null,
    deferredActiveTools: [],
    modelSelection: createDefaultAgentConversationModelSelection(agentKind),
    draft: '',
    running: false,
    abortController: null,
    pendingInteraction: null,
    pendingMapDraftReview: null
  }
}

/** 查不到才建；已存在时直接返回同一个响应式对象（不重置已有状态）。 */
export function getOrCreateScopeState(scopeKey: string, agentKind: WorkspaceAgentKind, targetId: string): WorkspaceAgentScopeState {
  const key = String(scopeKey || '').trim()
  if (!scopeStateMap[key]) {
    scopeStateMap[key] = createEmptyState(key, agentKind, targetId)
  }
  return scopeStateMap[key]
}

export function findScopeState(scopeKey: string): WorkspaceAgentScopeState | null {
  const key = String(scopeKey || '').trim()
  return scopeStateMap[key] || null
}

/** 只有 running=false 且没有待确认卡时才真正清空；否则忽略——对齐母计划 3.3.1
 *  「关闭弹窗只卸载视图，不能让长任务/待确认卡丢失」。调用方（弹窗卸载钩子）无需自己判断，
 *  直接调用即可，本函数保证不会误删还在途的状态。 */
export function disposeScopeState(scopeKey: string): boolean {
  const key = String(scopeKey || '').trim()
  const state = scopeStateMap[key]
  if (!state) return true
  if (state.running || state.pendingInteraction || state.pendingMapDraftReview) return false
  delete scopeStateMap[key]
  return true
}

/** 独立于 controller 构造的写确认门通道（供 runner 闭包在 controller 存在前就能拿到——
 *  runner 是 useWorkspaceAgentController 的构造参数之一，controller 内部的 confirmWrite 反过来
 *  要等 controller 建好才有，会形成循环依赖；本函数直接按 scopeKey 操作同一份底层状态对象，
 *  和 controller 内部的 confirmWrite 是同一份 pendingInteraction 真值，调用方按 scopeKey 各自取即可）。 */
export function createScopeConfirmWriteChannel(scopeKey: string, agentKind: WorkspaceAgentKind, targetId: string): ConfirmWriteChannel {
  const state = getOrCreateScopeState(scopeKey, agentKind, targetId)
  const writeMode = getOrCreateWorkspaceAgentWriteApprovalMode(scopeKey)
  return (request) => {
    // 硬门仍由本通道承接；自动模式只把本次回答确定为 confirmed，不改工具权限或其他交互门。
    if (writeMode.autoApproveWrites) return Promise.resolve({ status: 'confirmed' })
    return new Promise((resolve) => {
      state.pendingInteraction = {
        request: { kind: 'confirm', title: request.title, lines: request.lines, source: { agent: agentKind, toolName: '' } },
        resolve: (answer) => {
          state.pendingInteraction = null
          resolve(answer)
        }
      }
    })
  }
}

/** 地图最终草稿审阅通道（舆图师专属，批C）：与 createScopeConfirmWriteChannel 同一取舍——
 *  runner 闭包需要在 controller 建好前拿到 reviewDraft，本函数直接按 scopeKey 操作同一份底层状态对象。
 *  宿主组件（MapViewerDialog.vue）读 state.pendingMapDraftReview 渲染既有审阅UI，决策后调用 resolve。 */
export function createScopeMapDraftReviewChannel(scopeKey: string, agentKind: WorkspaceAgentKind, targetId: string): ReviewMapDraft {
  const state = getOrCreateScopeState(scopeKey, agentKind, targetId)
  return (request) => new Promise((resolve) => {
    state.pendingMapDraftReview = {
      request,
      resolve: (resolution) => {
        state.pendingMapDraftReview = null
        resolve(resolution)
      }
    }
  })
}

export function buildScriptwriterScopeKey(worldId: string): string {
  return `scriptwriter:${worldId}`
}

/** 人格训练资产归属于角色；会话也必须按角色隔离，不能沿用全局星依或当前数据集 id。 */
export function buildPersonalityTrainerScopeKey(characterId: string): string {
  return `personality-trainer:${characterId}`
}

/** 舆图师 targetId 唯一编码点：`<worldId>:<sheetId>`。scopeKey 拼接与调用方（MapViewerDialog.vue
 *  的 confirmWrite/reviewDraft 通道、:target-id）都必须走这一个函数，禁止再各处手拼字面量
 *  （2026-07-17 修复批F：格式散落曾导致 isCartographerBusyForWorld 的前缀匹配与实际 scopeKey 格式脱钩）。 */
export function buildCartographerTargetId(worldId: string, sheetId: string): string {
  return `${worldId}:${sheetId}`
}

export function buildCartographerScopeKey(worldId: string, sheetId: string): string {
  return `cartographer:${buildCartographerTargetId(worldId, sheetId)}`
}

/** 舆图师 scopeKey 的"世界前缀"访问器：从 buildCartographerScopeKey 的同一格式派生
 *  （固定为 `cartographer:` + worldId + `:`），供 isCartographerBusyForWorld 等前缀匹配场景使用，
 *  避免脱离 builder 单独手拼前缀字面量。 */
export function cartographerWorldScopePrefix(worldId: string): string {
  return `cartographer:${worldId}:`
}

/** 供星依浮坞在自己动手改某个世界的地图前调用：这个世界下是否有任意图纸的舆图师正在运行
 *  （绘制/删除中）。按世界粒度判断即可，不需要精确到 sheetId——现役 armor 函数本身对"当前图纸"
 *  的解析口径就不统一，世界粒度足够避免"星依和舆图师同时改同一张地图"这个真实风险
 *  （2026-07-17 地图与剧本工作区专业Agent计划批D后续小修）。 */
export function isCartographerBusyForWorld(worldId: string): boolean {
  const id = String(worldId || '').trim()
  if (!id) return false
  const prefix = cartographerWorldScopePrefix(id)
  return Object.keys(scopeStateMap).some((key) => key.startsWith(prefix) && scopeStateMap[key].running)
}

/** 测试专用：清空全部状态。 */
export function resetWorkspaceAgentScopeStateForTest(): void {
  for (const key of Object.keys(scopeStateMap)) delete scopeStateMap[key]
  for (const key of Object.keys(writeApprovalModeMap)) delete writeApprovalModeMap[key]
}
