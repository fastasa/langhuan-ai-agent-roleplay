/**
 * 星依浮坞信息流单例兼容入口。
 * 行为已经抽到 agentTurnStream.ts；这里仅保留星依“全局唯一活动轮”的实例和旧导出名，避免调用方分叉语义。
 */
import {
  createAgentTurnStreamController,
  type AgentTurnStreamEntry
} from './agentTurnStream'

const controller = createAgentTurnStreamController()

export type XingyiTurnStreamEntry = AgentTurnStreamEntry
export const xingyiTurnStreamState = controller.state
export const beginXingyiTurnStream = controller.begin
export const endXingyiTurnStream = controller.end
export const clearXingyiTurnStream = controller.clear
export const drainXingyiTurnStreamEntries = controller.drain
export const markXingyiTurnIfNew = controller.markTurnIfNew
export const appendXingyiTurnStreamEntry = controller.append
export const settleXingyiTurnStreamTool = controller.settleTool
export const settleAllOpenXingyiTurnStreamEntries = controller.settleAllOpen
export const feedXingyiTurnStreamProgress = controller.feedProgress

export function resetXingyiTurnStreamForTest(): void {
  controller.clear()
}
