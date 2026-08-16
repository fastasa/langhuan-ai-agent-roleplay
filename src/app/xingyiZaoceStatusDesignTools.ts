import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel, type ConfirmWriteChannel } from './agentRuntime/interactionContract'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContext,
  type XingyiSessionContextSeam
} from './xingyiSessionContext'

export const XINGYI_ZAOCE_STATUS_DESIGN_TOOL_NAME = 'dispatchZaoceStatusDesign'

export const XINGYI_ZAOCE_STATUS_DESIGN_FOCUS = ['composition', 'resources', 'media'] as const
export type XingyiZaoceStatusDesignFocus = (typeof XINGYI_ZAOCE_STATUS_DESIGN_FOCUS)[number]

export interface XingyiZaoceStatusDesignInput {
  panel: string
  directive: string
  focus: XingyiZaoceStatusDesignFocus[]
}

export interface XingyiZaoceStatusDesignResult {
  ok: boolean
  summary: string
  panels: string[]
  error?: string
  retryable?: boolean
}

export interface XingyiZaoceStatusDesignContext extends XingyiSessionContextSeam {
  confirmWrite?: ConfirmWriteChannel
  dispatch: (
    session: XingyiSessionContext,
    input: XingyiZaoceStatusDesignInput
  ) => Promise<XingyiZaoceStatusDesignResult>
}

function invalidResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

function normalizeFocus(raw: unknown): XingyiZaoceStatusDesignFocus[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw
    .map((item) => String(item || '').trim())
    .filter((item): item is XingyiZaoceStatusDesignFocus => (
      XINGYI_ZAOCE_STATUS_DESIGN_FOCUS.includes(item as XingyiZaoceStatusDesignFocus)
    )))]
}

/**
 * 星依只负责确认目标和派发；造册读取正式字段、选择受控 block，并经 applyStatusPanelBatch 原子写入。
 * 本工具故意不暴露 presentation JSON，避免星依和造册形成两套高级制作入口。
 */
export function createXingyiDispatchZaoceStatusDesignTool(
  ctx: XingyiZaoceStatusDesignContext
): ToolDefinition {
  return {
    name: XINGYI_ZAOCE_STATUS_DESIGN_TOOL_NAME,
    longRunning: true,
    brief: '派遣造册 Agent 为一张既有状态栏新增或重构受控总览。适合人口性别/年龄饼图、资源储备柱图、容量进度、核心指标和正式图片块。先用 listStatusSystem 确认准确栏名与字段；这里只提交目标和人话设计要求，不提交 Vue/HTML/CSS、任意公式或 presentation JSON。造册会读取正式字段、按需加载 advanced-authoring、原子写入并回读。写入前会弹确认。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        panel: { type: 'string', description: '既有状态栏的准确名称或 id；先用 listStatusSystem 确认。' },
        directive: { type: 'string', description: '给造册的人话任务书：哪些信息需要突出、按什么维度切换、哪些字段保持数据视图，不要填写底层 JSON。' },
        focus: {
          type: 'array',
          description: '可选关注类型：composition=人口/阵营等构成，resources=资源比较/容量，media=正式图片资产；指标和字段承载选择会始终加载。',
          items: { type: 'string', enum: [...XINGYI_ZAOCE_STATUS_DESIGN_FOCUS] },
          uniqueItems: true
        },
        session: { type: 'string', description: '可选：会话名、联系人名、targetId 或 sessionId；缺省操作当前活动会话。' }
      },
      required: ['panel', 'directive']
    },
    validateArgs: (args) => {
      if (!String(args.panel || '').trim()) return 'dispatchZaoceStatusDesign 缺少 panel（既有状态栏名称或 id）'
      if (!String(args.directive || '').trim()) return 'dispatchZaoceStatusDesign 缺少 directive（给造册的人话设计要求）'
      if (args.focus !== undefined) {
        if (!Array.isArray(args.focus)) return 'dispatchZaoceStatusDesign.focus 必须是数组'
        const invalid = args.focus.find((item) => !XINGYI_ZAOCE_STATUS_DESIGN_FOCUS.includes(String(item || '') as XingyiZaoceStatusDesignFocus))
        if (invalid !== undefined) return `dispatchZaoceStatusDesign.focus 不支持「${String(invalid)}」`
      }
      return null
    },
    execute: async (toolCall) => {
      const missing = requireConfirmWriteChannel(ctx.confirmWrite, '派遣造册重构状态总览')
      if (missing) return missing
      const resolved = await resolveXingyiSessionForCall(ctx, toolCall.args.session)
      if ('error' in resolved) return invalidResult(resolved.error)
      if ('noActiveSession' in resolved) return invalidResult('当前没有活动会话。请先打开目标对话，或用 session 指定已有会话。')

      const panel = String(toolCall.args.panel || '').trim()
      const directive = String(toolCall.args.directive || '').trim()
      const focus = normalizeFocus(toolCall.args.focus)
      const denied = await askConfirmWrite(ctx.confirmWrite!, {
        title: '派遣造册重构状态总览',
        lines: [
          `目标会话：${resolved.context.sessionTitle}`,
          `目标状态栏：${panel}`,
          focus.length ? `关注类型：${focus.join('、')}` : '关注类型：由造册按字段语义判断',
          `设计要求：${directive}`
        ]
      }, '派遣造册重构状态总览')
      if (denied) return denied

      try {
        const result = await ctx.dispatch(resolved.context, { panel, directive, focus })
        if (!result.ok) {
          const message = result.error || '造册没有交付有效的状态总览。'
          return {
            content: `造册派遣未完成：${message}`,
            status: 'error',
            error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: result.retryable === true }
          }
        }
        return {
          content: [
            `造册已完成「${panel}」的状态总览设计。`,
            result.summary,
            '图表继续读取现役字段真值；可在状态面板中切换“总览/数据”核对。'
          ].filter(Boolean).join('\n'),
          details: {
            kind: 'zaoceStatusDesign',
            sessionId: resolved.context.sessionId,
            panel,
            focus,
            panels: result.panels,
            ok: true
          },
          acted: true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: `造册派遣异常：${message}`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true }
        }
      }
    }
  }
}
