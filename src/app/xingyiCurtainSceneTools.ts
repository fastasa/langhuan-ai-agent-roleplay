import type { ToolDefinition } from './agentRuntime/toolRegistry'
import {
  createUpdateCurtainSceneTool
} from './tidiaoGlobalTools'
import type {
  ReplyPlanCurtainSceneUpdateResult,
  ReplyPlanCurtainSceneUpdateToolCall
} from './replyPlanOrchestratorHarness'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'

export interface XingyiCurtainSceneTarget {
  sessionId: string
  targetId: string
  label: string
  session: Record<string, unknown>
}

export interface XingyiCurtainSceneToolContext {
  confirmWrite?: XingyiWriteConfirm
  resolveCurrentSession: () => XingyiCurtainSceneTarget | null
  updateCurtainScene: (
    target: XingyiCurtainSceneTarget,
    call: ReplyPlanCurtainSceneUpdateToolCall
  ) => ReplyPlanCurtainSceneUpdateResult | Promise<ReplyPlanCurtainSceneUpdateResult>
}

function renderCurtainTargetLines(call: ReplyPlanCurtainSceneUpdateToolCall): string[] {
  const location = [call.locationLarge, call.locationMiddle, call.locationSmall]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' / ') || String(call.targetLocation || '').trim()
  return [
    call.targetTime ? `目标时间：${call.targetTime}` : '',
    location ? `目标地点：${location}` : '',
    call.targetWeather ? `目标天气：${call.targetWeather}` : '',
    call.reason ? `原因：${call.reason}` : ''
  ].filter(Boolean)
}

/** 星依直接修改当前活动聊天会话帷幕；写入前仍复用星依统一确认门。 */
export function createXingyiCurtainSceneTool(ctx: XingyiCurtainSceneToolContext): ToolDefinition {
  const base = createUpdateCurtainSceneTool({
    updateCurtainScene: async (call) => {
      const target = ctx.resolveCurrentSession()
      if (!target) throw new Error('当前没有可修改的聊天会话。请先打开目标角色或群聊会话，再修改当前帷幕。')
      if (!ctx.confirmWrite) throw new Error('写操作确认通道未接入，星依这轮不能修改当前帷幕。')
      const confirmed = await ctx.confirmWrite({
        title: '修改当前会话帷幕',
        lines: [
          `会话：${target.label || target.sessionId}`,
          ...renderCurtainTargetLines(call),
          '操作：写入当前会话的正式时间、地点或天气；修改地点时会清除不再匹配的旧精确地图要素。'
        ]
      })
      if (!confirmed) {
        return {
          changed: false,
          notice: '用户在确认卡片上取消了「修改当前会话帷幕」，本次没有执行。请尊重用户决定，不要自行重试。',
          previous: {},
          next: {},
          patch: {},
          undoPatch: {},
          reason: call.reason
        }
      }
      return ctx.updateCurtainScene(target, call)
    }
  })
  return {
    ...base,
    longRunning: true,
    brief: `${base.brief} 这是星依修改当前活动聊天会话帷幕的正式入口，属于写操作，执行前会走统一确认卡。`
  }
}
