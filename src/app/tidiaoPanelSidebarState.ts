/**
 * 提调带面板·挤压侧栏桥（2026-07-10 四面板统一；前身=批次G「state 查看器」专用桥 directorStateInspectorState.ts）。
 *
 * 由来：场记（原 state 查看器）2026-07-03 先改成内联挤压左侧栏（仿 PromptLogPanel·聊天区让位不遮盖）；
 * 2026-07-10 起资料池也统一成同款挤压侧栏——各面板共用本桥与
 * AppChatSection 同一个 aside 壳（同一宽度真值·天然互斥）。带子挂在消息流深层
 * （AppChatSection → ChatWorkspaceSection → ChatMessageStream → 坞 → 带子），侧栏壳在 AppChatSection 顶层——
 * 用本模块级响应式 ref 桥接（同 promptLogPanelState 范式），不做多层 props/emit 钻透。
 *
 * 响应式关键：payload 传 **getter**（闭包捕获带子的响应式 props），侧栏渲染 effect 里调用 getter
 * 即建立依赖——活动带 loop 推进时 stream/资料池等实时刷新，不是点击时的死快照。
 *
 * ownerKey：带子卸载（会话切换/轮被替换）时只关自己发起的面板（closeIfOwner），不误关别的带打开的。
 * 移动端（MobileChatThread）带子保持旧浮层形态、不走本桥（panelMode 缺省 overlay）。
 */

import { ref } from 'vue'
import type { TidiaoDirectorStream } from './tidiaoDirectorStream'
import type { TidiaoShotDetail } from './tidiaoBandModel'
import type { RoundRecallPools } from './recallRoundPool'

interface TidiaoPanelSidebarBase {
  /** 发起带的唯一标识（卸载时 closeIfOwner 用·同一带四面板共用一个 key）。 */
  ownerKey: string
}

/** 场记（2026-07-10 改中文名·原「state」）：统筹决策流 + 各演员子 loop 过程 + 喂模型原文。 */
export interface TidiaoStatePanelTarget extends TidiaoPanelSidebarBase {
  kind: 'state'
  /** 主记录 getter（闭包捕获带子响应式 props·活动带实时刷新）。 */
  getStream: () => TidiaoDirectorStream | null
  /** 子记录（各演员钻取明细）getter。 */
  getShotDetails: () => Record<string, TidiaoShotDetail> | undefined
  /** 「喂模型原文」md getter（renderDirectorMemoryDocument 产物）。 */
  getMemoryProjection: () => string
}

/** 资料池：对话级池 + 加卡归属选项 + 角色名解析（与带内浮层形态同一 props 面）。 */
export interface TidiaoPoolPanelTarget extends TidiaoPanelSidebarBase {
  kind: 'pool'
  getPools: () => RoundRecallPools | null
  getSessionId: () => string
  getCastCharacterIds: () => string[]
  getResolveName: () => ((characterId: string) => string) | undefined
}

export type TidiaoPanelSidebarTarget = TidiaoStatePanelTarget | TidiaoPoolPanelTarget

/** 当前打开的面板目标（null=关闭）。AppChatSection 据此渲染挤压 aside（按 kind 换面板·一次只开一个）。 */
export const tidiaoPanelSidebarTarget = ref<TidiaoPanelSidebarTarget | null>(null)

let ownerUid = 0
/** 给带子实例分配 ownerKey（组件 setup 期调一次）。 */
export function allocateTidiaoPanelSidebarOwnerKey(): string {
  ownerUid += 1
  return `tps_owner_${ownerUid}`
}

export function openTidiaoPanelSidebar(target: TidiaoPanelSidebarTarget): void {
  tidiaoPanelSidebarTarget.value = target
}

export function closeTidiaoPanelSidebar(): void {
  tidiaoPanelSidebarTarget.value = null
}

/** 带子卸载时调用：只有侧栏当前显示的正是本带发起的面板才关（防误关别的带打开的）。 */
export function closeTidiaoPanelSidebarIfOwner(ownerKey: string): void {
  if (tidiaoPanelSidebarTarget.value?.ownerKey === ownerKey) {
    tidiaoPanelSidebarTarget.value = null
  }
}
