import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel, type ConfirmWriteChannel } from './agentRuntime/interactionContract'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContext,
  type XingyiSessionContextSeam
} from './xingyiSessionContext'
import {
  SUBAGENT_TIMEOUT_SCHEMA_PROPERTY,
  resolveSubagentTimeout,
  validateSubagentTimeoutMinutes
} from './subagentTimeoutPolicy'

export interface XingyiScriptwriterDispatchResult {
  ok: boolean
  guidance?: string
  changedFields?: string[]
  qualitySummary?: string
  error?: string
  /** 仅瞬时故障/超时允许上层决定重派；格式退回、空交稿等确定性失败不得盲目重复烧 token。 */
  retryable?: boolean
}

export interface XingyiScriptwriterDispatchContext extends XingyiSessionContextSeam {
  confirmWrite?: ConfirmWriteChannel
  dispatch: (session: XingyiSessionContext, directive: string, options: { timeoutMinutes: number; timeoutMs: number }) => Promise<XingyiScriptwriterDispatchResult>
}

function invalidResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

/** 星依显式派遣现役编剧 Agent；写入当前会话所挂世界的叙事种子正式真值。 */
export function createXingyiDispatchScriptwriterTool(ctx: XingyiScriptwriterDispatchContext): ToolDefinition {
  return {
    name: 'dispatchScriptwriter',
    longRunning: true,
    brief: '派遣编剧 Agent 管理某个对话所挂世界的正式叙事种子。directive 只写创作目标、必要交付物、风格约束和验收标准，并尽量保留用户原话；不要自行断言会话未挂世界、没有参与者或成员未知，精确 sessionId、世界、帷幕与成员由代码另行提供。空世界正式开本时编剧会先派采风，再提交可校验的因果、进展、时间地点、参与者/知情边界等结构。用 timeoutMinutes 为采风、编排和重交预留总时限；超时不等于没有资料。写入世界唯一剧本真值前会弹确认。',
    schema: {
      type: 'object',
      properties: {
        directive: { type: 'string', description: '给编剧的任务书：目标、交付物、创作约束、质量标准与验收条件。保留用户原话，不编造会话/世界/参与者机器状态。' },
        session: { type: 'string', description: '可选：会话名、联系人名、targetId 或 sessionId；缺省操作当前活动会话。' },
        timeoutMinutes: SUBAGENT_TIMEOUT_SCHEMA_PROPERTY
      },
      required: ['directive']
    },
    validateArgs: (args) => {
      if (!String(args.directive || '').trim()) return 'dispatchScriptwriter 缺少 directive（给编剧的指令）'
      return validateSubagentTimeoutMinutes(args.timeoutMinutes)
    },
    execute: async (toolCall) => {
      const missing = requireConfirmWriteChannel(ctx.confirmWrite, '派遣编剧修改剧本')
      if (missing) return missing
      const resolved = await resolveXingyiSessionForCall(ctx, toolCall.args.session)
      if ('error' in resolved) return invalidResult(resolved.error)
      if ('noActiveSession' in resolved) return invalidResult('当前没有活动会话。请先打开一个对话，或用 session 指定已有会话。')
      const directive = String(toolCall.args.directive || '').trim()
      const timeout = resolveSubagentTimeout(toolCall.args.timeoutMinutes)
      const denied = await askConfirmWrite(ctx.confirmWrite!, {
        title: '派遣编剧修改剧本',
        lines: [`目标会话：${resolved.context.sessionTitle}`, `运行时限：${timeout.timeoutMinutes} 分钟`, `指令：${directive}`]
      }, '派遣编剧修改剧本')
      if (denied) return denied
      try {
        const result = await ctx.dispatch(resolved.context, directive, timeout)
        if (!result.ok) {
          const message = result.error || '编剧没有交付有效修订。'
          return { content: `编剧派遣未完成：${message}`, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: result.retryable === true } }
        }
        if (!result.changedFields?.length) {
          return {
            content: [
              `编剧已检查「${resolved.context.sessionTitle}」，但没有写入任何世界种子变更。`,
              result.guidance ? `编剧说明：${result.guidance}` : '',
              '世界剧本工作台内容保持原样；若当前仍为空，不能视为剧本已经生成。'
            ].filter(Boolean).join('\n'),
            details: { sessionId: resolved.context.sessionId, ...result, noChanges: true }
          }
        }
        const fields = result.changedFields.join('、')
        return {
          content: [
            `编剧已完成「${resolved.context.sessionTitle}」的剧本任务。`,
            `改动字段：${fields}。`,
            result.guidance ? `编剧指导：${result.guidance}` : '',
            result.qualitySummary ? `结构检查：${result.qualitySummary}` : '',
            '完整结果与变更历史已同步到世界剧本工作台。'
          ].filter(Boolean).join('\n'),
          details: { sessionId: resolved.context.sessionId, ...result }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: `编剧派遣异常：${message}`, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true } }
      }
    }
  }
}
