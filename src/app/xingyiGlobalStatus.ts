import { ref } from 'vue'
import type { WorkspaceAgentTaskNoticeStatus } from './workspaceRuntimeStore'

/**
 * 星依全局状态灯（2026-07-10 星依 UI 重构）——收起态入口（桌面书签签牌 / 移动 FAB）共用的状态合并单点。
 *
 * - 双源合并：浮坞本轮运行状态（XingyiDock 本地 UI 态）+ 全局 Agent 任务提示（workspaceRuntimeStore.agentTaskNotice，
 *   原右上角提示灯的真值，展示层已收编进星依）。真值都在各自原处，这里只做视图层合并，不新增业务真值。
 * - 优先级固定：出错 > 等确认 > 进行中 > 刚完成 > 待命（error > waiting > running > success > idle）。
 */

export type XingyiDockRunStatus = 'idle' | 'running' | 'waiting' | 'error' | 'success'

export type XingyiGlobalStatus = 'idle' | 'running' | 'waiting' | 'error' | 'success'

/** 浮坞本轮运行状态的共享视图 ref：XingyiDock 是唯一写入方；移动 FAB 只读。 */
export const xingyiDockRunStatus = ref<XingyiDockRunStatus>('idle')

export function resolveXingyiGlobalStatus(
  dockStatus: XingyiDockRunStatus,
  noticeStatus: WorkspaceAgentTaskNoticeStatus | null | undefined
): XingyiGlobalStatus {
  if (dockStatus === 'error' || noticeStatus === 'error') return 'error'
  if (dockStatus === 'waiting' || noticeStatus === 'waiting') return 'waiting'
  if (dockStatus === 'running' || noticeStatus === 'running') return 'running'
  // success 有两个来源：浮坞本轮对话正常结束（XingyiDock 的“打开态 5 秒/关闭态常驻直到打开后 5 秒”节流）、
  // 或全局任务提示（完成后固定 5 秒自动消失）；两者互不干扰，任一为 success 即整体判 success。
  if (dockStatus === 'success' || noticeStatus === 'success') return 'success'
  return 'idle'
}
