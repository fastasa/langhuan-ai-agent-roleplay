/**
 * 星依「建状态栏前先确认取料范围」工具（2026-07-09 用户真机反馈）——自包含工具工厂。
 *
 * 由来：星依建「需依据历史资料填充的角色状态栏」时，容易①把状态栏挂错会话（把角色名误当会话）②跨对话/全量
 * 捞资料（把角色在别的对话里的关系也填进来）。用户拍板：软约束（靠纲领要求先问）+ 软锁（范围当提示传给模型），
 * 靠「让用户亲手选对角色+对话+文档库范围」结构性避免串对话。
 *
 * 接缝：confirmStatusScope 由浮坞注入（弹一张 scope 确认卡：角色单选 + 对话多选 + 文档库范围两级树选，
 * 返回用户确认的结构化范围）；缺省不接入时工具如实说不可用（语义同 askUser）。工具把确认的范围拼成
 * 「只在这些对话/文档库范围内取料，把状态栏建在选定对话上」的指令回给模型（软锁），模型据此继续把事做完。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'

export interface XingyiStatusScopeRequest {
  /** 星依这次要建什么（展示在卡片顶部，如「给张元英建角色状态栏」）。 */
  purpose: string
  /** 星依猜的角色名（卡片预选用·可空）。 */
  characterHint?: string
  /** 提调专用：一次盘点出的多个缺栏角色；星依自己的阻塞式单卡流程不使用。 */
  characterHints?: string[]
  /** 星依猜的对话（卡片预选用·缺省=当前打开对话）。 */
  sessionHint?: string
}

/** 用户在 scope 卡上确认的取料范围（浮坞返回）。null=用户关掉卡片没确认。 */
export interface XingyiStatusScopeSelection {
  /** 选定的角色名（状态栏宿主·空串=用户没选角色）。 */
  characterName: string
  /** 选定的对话（只看这些·title 展示、sessionId 精确定位）；空=用户没选对话。
   *  注意：这里是真正的聊天会话（一个角色可能有多个会话），必须用 sessionId 区分，不是角色/群名册。 */
  sessions: Array<{ title: string; sessionId: string }>
  /** 文档库范围的人话摘要（软锁提示用·如「文件夹『角色档案』下 12 个文档」；空串=不限/未选）。 */
  docScopeSummary: string
}

/** 确认取料范围接缝：浮坞弹 scope 卡，返回用户确认的范围；用户关掉=返回 null。 */
export type XingyiStatusScopeConfirm = (
  request: XingyiStatusScopeRequest
) => Promise<XingyiStatusScopeSelection | { feedback: string } | null>

export interface XingyiStatusScopeToolContext {
  confirmStatusScope?: XingyiStatusScopeConfirm
}

/** 建状态栏前确认取料范围（不是写操作·不过 confirmWrite；但需要 confirmStatusScope 通道在场）。 */
export function createConfirmStatusScopeTool(ctx: XingyiStatusScopeToolContext): ToolDefinition {
  return {
    name: 'confirmStatusScope',
    // 内部 await ctx.confirmStatusScope(...) 真阻塞等用户在范围确认卡上选择，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '你要开始搭建/初始化一个「需要依据历史资料填充」的角色状态栏之前，必须先用本工具跟用户确认三件事：'
      + '①这个状态栏是给哪个角色的 ②要参考哪些对话的资料（可多选，你之后只看用户确认的这些对话，别的对话一律不看）'
      + '③可以在文档库的哪些范围里查（可多选文件夹/文件，不要全量查）。用户确认后，你就严格只在这些对话和文档库范围内'
      + '取料（读投影用对应对话、检索/查文档只看选定范围），综合后把状态栏建在选定对话上。别跳过这一步凭猜测直接建。',
    schema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', description: '这次要建什么（简短，展示给用户看，如「给张元英建角色状态栏」）。' },
        characterHint: { type: 'string', description: '你判断的目标角色名（可选·卡片会据此预选）。' },
        sessionHint: { type: 'string', description: '你判断的目标对话名（可选·缺省=用户当前打开的对话）。' }
      },
      required: ['purpose']
    },
    validateArgs: (args) => {
      if (!String(args.purpose || '').trim()) return 'confirmStatusScope 缺少 purpose（这次要建什么）'
      return null
    },
    execute: async (toolCall) => {
      if (!ctx.confirmStatusScope) {
        return {
          content: '确认取料范围的通道未接入，星依这轮没法弹范围确认卡片。请如实告知用户本工具暂不可用。',
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message: '确认取料范围通道未接入（confirmStatusScope 缺失）', retryable: false }
        } satisfies ToolExecutionResult
      }
      const request: XingyiStatusScopeRequest = {
        purpose: String(toolCall.args.purpose || '').trim(),
        ...(String(toolCall.args.characterHint || '').trim() ? { characterHint: String(toolCall.args.characterHint).trim() } : {}),
        ...(String(toolCall.args.sessionHint || '').trim() ? { sessionHint: String(toolCall.args.sessionHint).trim() } : {})
      }
      const selection = await ctx.confirmStatusScope(request)
      if (!selection) {
        return {
          content: '用户关掉了范围确认卡片，没有确认取料范围。不要擅自建状态栏——先问清楚要给哪个角色、参考哪些对话，再继续。',
          details: { dismissed: true }
        }
      }
      if ('feedback' in selection) {
        const feedback = String(selection.feedback || '').trim()
        return {
          content: `用户没有确认这份取料范围，并提出了修改意见：${feedback}。请按意见调整范围方案；需要继续时重新发起 confirmStatusScope。`,
          details: { feedback, needsRevision: true }
        }
      }
      const characterName = String(selection.characterName || '').trim()
      const sessions = Array.isArray(selection.sessions) ? selection.sessions.filter((item) => item && item.title) : []
      const docScopeSummary = String(selection.docScopeSummary || '').trim()
      if (!sessions.length) {
        return {
          content: '用户没有选择任何对话就关掉了卡片。不看具体对话就没法准确取料——请再问用户要参考哪个/哪些对话，别凭猜测建。',
          details: { dismissed: true }
        }
      }
      const sessionTitles = sessions.map((item) => item.title)
      const sessionLabels = sessions.map((item) => `${item.title}（sessionId=${item.sessionId}）`)
      const firstSessionId = sessions[0].sessionId
      const lines = [
        '用户已确认这次建状态栏的取料范围：',
        `- 角色（状态栏宿主）：${characterName || '（用户未指定角色，请再问清楚是给谁建）'}`,
        `- 对话（只看这些，共 ${sessions.length} 个）：${sessionLabels.join('、')}`,
        `- 文档库范围：${docScopeSummary || '（用户未限定文档库范围，不要漫无目的全量查，必要时再问）'}`,
        '',
        '接下来请严格只在以上对话和文档库范围内取料：读对话投影/状态工具时，把 session 参数指定成上面对应会话的 '
          + 'sessionId（最精确，别用会话名，避免同名会话认错），检索/查文档只围绕选定的文档库范围，'
          + '禁止引入其他对话或范围外文档的资料。'
          + `综合后把状态栏建在对话「${sessionTitles[0]}」（session=${firstSessionId}）上，宿主=角色「${characterName || sessionTitles[0]}」。`
      ]
      return {
        content: lines.join('\n'),
        details: { confirmed: true, characterName, sessionTitles, docScopeSummary }
      }
    }
  }
}

/** 建状态栏前确认取料范围工具：harness 一把装配（始终装配·通道缺省缺失时执行期如实报不可用）。 */
export function createXingyiStatusScopeTools(ctx: XingyiStatusScopeToolContext): ToolDefinition[] {
  return [createConfirmStatusScopeTool(ctx)]
}
