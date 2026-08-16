/**
 * 星依「派采风」工具（地图严谨协作与运行卡计划批2·2026-07-11）——自包含工厂范式（仿 xingyiMapDispatchTools 同构）。
 *
 * 与提调的 dispatchResearch（tidiaoGlobalTools.createDispatchResearchTool）同名同构，差异只在会话定位：
 * 提调本身就在某会话里，dispatch 闭包早已知道 sessionId；星依是跨会话的全局语境，需要先经
 * {@link resolveXingyiSessionForCall}（与状态系统/投影工具/派绘舆同一套 session 参数解析）定位目标会话，
 * 再把解析出的完整会话上下文（sessionId+sessionTitle+characterOptions）交给浮坞注入的 dispatch 执行接缝
 * （浮坞侧用 caifengSubagent.ts 的 buildCaifengToolset/runCaifengResearch/renderCaifengDispatchOutcome
 * 同构装配，deps 全量装齐——retrievalContext/projectionContext/chatMessageReadContext/statusSystem，
 * 与绘舆自查用的同一份 research 装配同源，见 XingyiDock.vue buildXingyiCaifengDeps）。
 *
 * 用途：星依信息不足时（如造图缺料）先派采风钻探已知事实，而不是直接问用户或凭空脑补——
 * 「没查」不等于「没有」，见 xingyiCharter.ts 协议句。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
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

export interface XingyiResearchDispatchContext extends XingyiSessionContextSeam {
  /** 采风派遣执行接缝（浮坞注入）：给定已解析的目标会话上下文后跑一次采风钻取小 loop，回渲染好的回执。 */
  dispatch: (session: XingyiSessionContext, input: { task: string; instructions: string; focus?: string; timeoutMinutes?: number }) => Promise<{
    content: string
    ok: boolean
    details?: Record<string, unknown>
  }>
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

/** 派「采风」钻取员（跨会话版）：与提调侧同名 dispatchResearch，多一个 session 参数定位目标会话。 */
export function createXingyiDispatchResearchTool(ctx: XingyiResearchDispatchContext): ToolDefinition {
  return {
    name: 'dispatchResearch',
    // 内部 await ctx.dispatch(...) 派发「采风」钻取子 agent 跑一整条 loop，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '手头资料不够写本轮/做本次任务时（如造图缺方位量级、要素设定不确定），派「采风」钻取员去查证——'
      + '它能读消息原文/搜整份投影/检索文档库/召回角色大脑/读状态栏详情。给它明确的任务标题+逐条任务书'
      + '（要查什么、以什么为准算查到）；查证优先于脑补——料不足时先派采风钻探，钻探后仍缺才问用户，绝不把「没查」当「没有」。'
      + '没打开会话、或要查别的对话的资料时，先用 listChatContacts 看清单，再传 session 参数（会话名/联系人名/targetId/sessionId）指定；缺省=当前活动会话。'
      + '结论带出处回到回执里；多个互不依赖的缺口可同轮发多个 dispatchResearch。'
      + '每次可用 timeoutMinutes 自定时限；复杂跨文档调查可以给更长时间。超时回执必须按原文判断，超时不等于没有资料。'
      + '可选 closingNote：提前写好的交稿收尾话。仅当派发全部成功（真交稿）时会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；'
      + '没交稿/失败时不会使用，你会正常拿到回执再答复。写作要求：简短，不要断言具体成果细节（写它时还不知道结果），细节用户可在运行卡查看。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '目标会话（可选·缺省=当前活动会话）：会话名/联系人名/targetId/sessionId。没打开会话时先用 listChatContacts 看清单再指定。' },
        task: { type: 'string', description: '钻取任务短标题（必填·显示在运行卡上，如「查元英的佩剑来历」）。一个任务只管一个主题；多个主题分多次派。' },
        instructions: { type: 'string', description: '任务书（必填·逐条列出）：每条写清要查什么、以什么为准算查到（验收标准）。已知线索（楼层号/单位名/角色名）一并写给它，省它摸索。' },
        focus: { type: 'string', description: '建议钻取方向（可选，如「先 searchChatProjection 搜投影再读原文」「文档库找组织设定」「readStatusPanels 顺引用查武器」）。' },
        timeoutMinutes: SUBAGENT_TIMEOUT_SCHEMA_PROPERTY,
        closingNote: { type: 'string', description: '可选——提前写好的交稿收尾话。仅当派发全部成功时会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；失败/没交稿时不会使用。写作要求：简短，不要断言具体成果细节（写它时还不知道结果）。' }
      },
      required: ['task', 'instructions']
    },
    validateArgs: (args) => {
      if (!String(args.task || '').trim()) return 'dispatchResearch 缺少 task（任务短标题）'
      if (!String(args.instructions || '').trim()) return 'dispatchResearch 缺少 instructions（逐条任务书+验收标准）'
      const timeoutError = validateSubagentTimeoutMinutes(args.timeoutMinutes)
      if (timeoutError) return timeoutError
      return null
    },
    execute: async (toolCall) => {
      const outcome = await resolveXingyiSessionForCall(ctx, toolCall.args.session)
      if ('error' in outcome) return invalidArgumentResult(outcome.error)
      if ('noActiveSession' in outcome) {
        return invalidArgumentResult('没有打开的会话，也没有指定 session 参数，不知道要去哪个对话钻取资料。请先用 listChatContacts 看会话清单，再传 session 参数指定目标会话。')
      }
      const input = {
        task: String(toolCall.args.task || '').trim(),
        instructions: String(toolCall.args.instructions || '').trim(),
        ...(String(toolCall.args.focus || '').trim() ? { focus: String(toolCall.args.focus).trim() } : {}),
        ...(toolCall.args.timeoutMinutes !== undefined
          ? { timeoutMinutes: resolveSubagentTimeout(toolCall.args.timeoutMinutes).timeoutMinutes }
          : {})
      }
      // 采风失败不算工具错误（工具执行本身成功·失败信息与重派引导在回执正文里），不标 status:'error'
      // ——避免触发 runtime 同错熔断把「查不到」误当基础设施故障，与提调侧 dispatchResearch 同口径。
      // acted 结果级修正：真交稿（ok）才算「本轮做过事」，派了没交稿不算（与派绘舆同口径）。
      const outcome2 = await ctx.dispatch(outcome.context, input)
      // closingNote 透传（2026-07-12 用户拍板）：与 acted 同一信号——outcome2.ok===true 即真交稿，
      // 没交稿/超时/失败一律不带，收尾话绝不能在这些情况下误报成功。
      const closingNote = String(toolCall.args.closingNote || '').trim()
      return {
        content: outcome2.content,
        details: { kind: 'caifengDispatch', ok: outcome2.ok, ...(outcome2.details || {}) },
        acted: outcome2.ok,
        ...(outcome2.ok && closingNote ? { closingNote } : {})
      }
    }
  }
}
