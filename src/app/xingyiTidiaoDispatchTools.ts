/**
 * 星依「指挥提调」工具族（批次3b·2026-07-04 陈星依总agent计划 §5.2 批次3b）——自包含工厂范式（R1 工厂闭包）。
 *
 * 四件套（createXingyiTidiaoDispatchTools 一把装配，harness 在 tidiaoDispatch 接缝在场时挂入星依池）：
 * - listChatContacts（只读）：列出可下发的联系人（角色/群），按人话定位目标会话的第一步；
 * - readChatSessionMessages（只读）：按联系人名/targetId/sessionId 读会话最近消息（带消息 id），定位目标楼层；
 * - dispatchTidiaoCorrection（写·confirmWrite 硬门）：对任意会话下发提调纠偏——装批次3a
 *   createTidiaoSessionCorrectionRunner（busy 双守门在 runner 内），上策 edits 经共享版本核心
 *   chatMessageEditVersionCore 即时版本化写回 updateChatMessageBySessionId（与 useChatMessageOps
 *   现役写回同一份版本语义·联动标注见该核心头注释），reprojectTargets 写回后重投影
 *   （对齐 useChatMessageOps.reprojectMarkedTargets 口径：逐条吞错不阻断）；
 * - searchDirectorMemory（只读）：复用 searchAppendLogTool 的 execute（一处真值），只换星依视角 brief——
 *   搜「最近一轮提调带」的运行记忆（append log 单例 last-writer-wins·3a 已定边界）。
 *
 * 批次3a 拍定边界（本工具如实回报，不越界补偿）：外部轮不挂中策重生成/新增旁白/改帷幕/重试四类执行接缝；
 * askUser/escalate 原样带回——askUser 由星依把问题转给用户、答复并进指令再下发一轮；
 * escalate 外部轮不自动重排，星依转告用户到会话内直接发纠偏做整轮重排。
 *
 * 写确认门（硬门）语义与 xingyiFunctionTools 一致（联动标注：确认门三态结果文案范式若统一改，两处同步）：
 * confirmWrite 缺失一律拒绝执行；用户取消返回「已取消」的成功态结果（模型不重试）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { createSearchAppendLogTool } from './agentState/searchAppendLogTool'
import {
  buildChatMessageEditVersionPayload,
  type ChatMessageEditVersionSourceRow
} from './chatMessageEditVersionCore'
import {
  createTidiaoSessionCorrectionRunner,
  type TidiaoSessionCorrectionRunnerDeps
} from './tidiaoSessionCorrectionRunner'
import {
  fetchChatSessionBundle,
  fetchChatSessionBundleById,
  resolveChatSessionTargetId,
  runChatMessageProjectionBySessionId,
  updateChatMessageBySessionId
} from '../repositories/chatRepository'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'
// 运行卡埋点（地图严谨协作与运行卡计划批1·2026-07-11）：纠偏轮本体不是 subagent runner（无 begin/end），
// 由本文件（星依「派发执行体」）在 runner 调用外层补埋，让浮坞「星依派出的每个agent都有卡」单点成立。
import { beginSubagentRun, endSubagentRun } from './subagentRunStatus'
import { registerActiveSubagentControl } from './agentRuntime/subagentControl'
import { registerXingyiDispatch } from './xingyiSubagentDispatchRegistry'

/** 联系人条目（会话定位数据源，浮坞注 charStore.characters/groups）。 */
export interface XingyiChatContact {
  targetId: string
  name: string
  kind: 'character' | 'group'
}

export interface XingyiTidiaoDispatchContext {
  /** 写确认门（同 xingyiFunctionTools 硬门语义：缺省一律拒绝执行）。 */
  confirmWrite?: XingyiWriteConfirm
  /** 批次3a runner 依赖（浮坞接线：hasRunningChatRound=workspaceRuntimeStore.hasRunningChatTasks 等）。 */
  runnerDeps: TidiaoSessionCorrectionRunnerDeps
  /** 联系人清单（角色+群），会话定位数据源。 */
  listChatContacts: () => XingyiChatContact[]
  /** 可选：一条消息写回 DB 后同步打开中的会话视图（浮坞实现：活动会话命中才补内存，防 UI 旧值反盖新版本）。 */
  onMessagePatched?: (patch: { sessionId: string; messageId: number; payload: Record<string, unknown> }) => void
  /** 可选：dispatch 过程活动播报（浮坞 activity 行）。 */
  notifyActivity?: (text: string) => void
}

const MESSAGE_PREVIEW_LIMIT = 100

/** 纠偏轮运行卡前缀（星依派发专属·批1）：键=`${目标会话}::tidiao:xingyi:<n>`
 *  （与 huiyuSubagent.HUIYU_SUBAGENT_ID_PREFIX 拼 `xingyi:<n>` taskKey 同款计数器范式）。 */
export const XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX = 'tidiao'

/** 运行卡任务名提取（UI 用）：从 status.input 首行「【纠偏任务】xxx」抽标题
 *  （契约同 huiyuSubagent.extractHuiyuTaskTitle）。 */
export function extractTidiaoCorrectionTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【纠偏任务】(.*)$/)
  return match ? match[1].trim() : ''
}

/** 并行多派发各自独立编号（模块级·与 XingyiDock 的 xingyiHuiyuTaskCounter 同构）。 */
let xingyiTidiaoCorrectionTaskCounter = 0

function clipText(text: string, limit: number): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

/** 确认通道未接入（配置问题，error 让模型如实报告）——与 xingyiFunctionTools 同款文案范式。 */
function confirmChannelMissingResult(): ToolExecutionResult {
  return {
    content: '写操作确认通道未接入，星依这轮不能下发提调纠偏。请如实告知用户本工具暂不可用。',
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message: '写操作确认通道未接入（confirmWrite 缺失）', retryable: false }
  }
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

/** 联系人名 → 联系人解析：先精确 targetId，再精确名字，最后唯一子串；歧义/未命中给可读候选。
 *  （与 xingyiFunctionTools.resolveXingyiUnitIds 同一套解析心智，作用对象不同故各自实现。） */
export function resolveXingyiChatContact(
  contacts: XingyiChatContact[],
  rawName: string
): { contact?: XingyiChatContact; error?: string } {
  const name = String(rawName || '').trim()
  if (!name) return { error: '缺少联系人名字。' }
  const byId = contacts.find((contact) => contact.targetId === name)
  if (byId) return { contact: byId }
  const exact = contacts.filter((contact) => contact.name === name)
  if (exact.length === 1) return { contact: exact[0] }
  if (exact.length > 1) {
    return { error: `「${name}」有 ${exact.length} 个同名联系人，请改用 targetId 指定：${exact.slice(0, 8).map((contact) => `${contact.name}(${contact.targetId})`).join('、')}` }
  }
  const partial = contacts.filter((contact) => contact.name.includes(name))
  if (partial.length === 1) return { contact: partial[0] }
  if (partial.length > 1) {
    return { error: `「${name}」匹配到多个联系人，请用完整名字或 targetId：${partial.slice(0, 8).map((contact) => `${contact.name}(${contact.targetId})`).join('、')}` }
  }
  return { error: `没有找到名为「${name}」的联系人。可先用 listChatContacts 看清单再试。` }
}

function readMessageSpeakerLabel(message: Record<string, unknown>): string {
  const role = String(message.role || '')
  if (role === 'user') return '用户'
  const memberName = String(message.memberName ?? message.member_name ?? message.name ?? '').trim()
  if (memberName) return `角色·${memberName}`
  return role === 'assistant' ? '角色' : (role || '未知')
}

function renderSessionMessageLine(message: Record<string, unknown>): string {
  return `#${Number(message.id || 0)} [${readMessageSpeakerLabel(message)}] ${clipText(String(message.content || ''), MESSAGE_PREVIEW_LIMIT)}`
}

/** 联系人清单（只读）：会话定位第一步。 */
export function createListChatContactsTool(ctx: XingyiTidiaoDispatchContext): ToolDefinition {
  return {
    name: 'listChatContacts',
    brief: '列出全部聊天会话/联系人（角色/群，带 targetId）。要定位「某某的会话」时先用它拿清单——'
      + '不只用于下发提调：状态系统、读对话投影等对话级工具没打开会话时，也先用它看清单，再把名字或 targetId 传给那些工具的 session 参数（同名对话用 targetId 区分）。',
    schema: { type: 'object', properties: {} },
    execute: () => {
      const contacts = ctx.listChatContacts()
      if (!contacts.length) {
        return { content: '现在没有任何聊天联系人（角色/群列表为空）。', details: { contacts: [] } }
      }
      const lines = contacts.map((contact) => `${contact.kind === 'group' ? '群' : '角色'}：${contact.name}（targetId ${contact.targetId}）`)
      return {
        content: `共 ${contacts.length} 个联系人：\n${lines.join('\n')}`,
        details: { contacts }
      }
    }
  }
}

/** 会话消息读取（只读）：拿 sessionId + 消息 id（dispatch 的 targetMessageId 来源）。 */
export function createReadChatSessionMessagesTool(ctx: XingyiTidiaoDispatchContext): ToolDefinition {
  return {
    name: 'readChatSessionMessages',
    brief: '读取某个会话的最近消息（带消息 id 与 sessionId）。给联系人名（或 targetId）读它的当前会话，'
      + '或给 sessionId 直接读；dispatchTidiaoCorrection 需要的 sessionId 和 targetMessageId 都从这里拿。',
    schema: {
      type: 'object',
      properties: {
        contactName: { type: 'string', description: '联系人名字或 targetId（与 sessionId 二选一，读该联系人的当前会话）。' },
        sessionId: { type: 'string', description: '会话 id（与 contactName 二选一，直接读指定会话）。' },
        limit: { type: 'number', description: '返回最近几条（默认 20，最多 50）。' }
      }
    },
    validateArgs: (args) => {
      if (!String(args.contactName || '').trim() && !String(args.sessionId || '').trim()) {
        return 'readChatSessionMessages 需要 contactName 或 sessionId 至少一个'
      }
      return null
    },
    execute: async (toolCall) => {
      const limitNum = Number(toolCall.args.limit)
      const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 50) : 20
      const sessionIdArg = String(toolCall.args.sessionId || '').trim()
      let displayName = ''
      let bundle: { session?: unknown; messages?: unknown[] } | null = null
      try {
        if (sessionIdArg) {
          bundle = await fetchChatSessionBundleById(sessionIdArg, { limit })
        } else {
          const resolved = resolveXingyiChatContact(ctx.listChatContacts(), String(toolCall.args.contactName || ''))
          if (resolved.error) return invalidArgumentResult(resolved.error)
          displayName = resolved.contact?.name || ''
          bundle = await fetchChatSessionBundle(resolved.contact?.targetId || '', { limit })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: `读取会话失败：${message}`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true }
        }
      }
      const session = (bundle?.session || null) as Record<string, unknown> | null
      const sessionId = String(session?.id || '')
      if (!session || !sessionId) {
        return invalidArgumentResult(sessionIdArg
          ? `没有找到会话 ${sessionIdArg}，请先用 listChatContacts/readChatSessionMessages 重新定位。`
          : `联系人「${displayName}」还没有会话记录。`)
      }
      if (!displayName) {
        const targetId = resolveChatSessionTargetId(session as never)
        displayName = ctx.listChatContacts().find((contact) => contact.targetId === targetId)?.name || targetId
      }
      const messages = (Array.isArray(bundle?.messages) ? bundle.messages : []) as Array<Record<string, unknown>>
      if (!messages.length) {
        return { content: `会话「${displayName}」（sessionId ${sessionId}）还没有消息。`, details: { sessionId, messages: [] } }
      }
      const lines = messages.map(renderSessionMessageLine)
      return {
        content: `会话「${displayName}」（sessionId ${sessionId}）最近 ${messages.length} 条（#号 = 消息 id，可作 dispatchTidiaoCorrection 的 targetMessageId）：\n${lines.join('\n')}`,
        details: {
          sessionId,
          messages: messages.map((message) => ({
            id: Number(message.id || 0),
            role: String(message.role || ''),
            speaker: readMessageSpeakerLabel(message),
            preview: clipText(String(message.content || ''), MESSAGE_PREVIEW_LIMIT)
          }))
        }
      }
    }
  }
}

/** dispatch 结果 → 星依人话回报（批次3b-③ 回报协议）。 */
function buildDispatchReportLines(input: {
  result: {
    strategy: string
    edits: Array<{ ref?: string; messageId: number }>
    promptEdits: Array<{ ref?: string; messageId: number }>
    askUser: { question: string; options: string[]; recommended?: string } | null
    escalation: { reason: string } | null
    chatAnswer: string
  }
  written: string[]
  writeFailures: string[]
  reprojected: number
}): string[] {
  const { result } = input
  const lines: string[] = []
  if (result.askUser) {
    lines.push(`提调想先确认再动手：「${result.askUser.question}」`)
    if (result.askUser.options.length) {
      lines.push(`选项：${result.askUser.options.map((option, index) => `${index + 1}. ${option}`).join('；')}`)
    }
    if (result.askUser.recommended) lines.push(`提调推荐：${result.askUser.recommended}`)
    lines.push('请把这个问题转给用户；拿到答复后，把答复并进纠偏指令再 dispatch 一次。')
    return lines
  }
  switch (result.strategy) {
    case 'direct-edit':
      lines.push(`提调用上策直接改好了 ${result.edits.length} 条消息${input.written.length ? `，已写回该会话：${input.written.join('、')}` : ''}。`)
      break
    case 'prompt-regen':
      lines.push(`提调走了中策：改了 ${result.promptEdits.length} 条消息的提示词。`
        + '注意：外部下发轮不执行重生成（拍定边界），请转告用户到该会话内对目标消息用「按原提示重试」，让新提示词生效。')
      break
    case 'escalate':
      lines.push(`提调认为这轮要整轮重排（下策）${result.escalation?.reason ? `，理由：${result.escalation.reason}` : ''}。`
        + '外部下发轮不执行重排（拍定边界），请转告用户到该会话内直接发一条纠偏，让聊天内提调做整轮重排。')
      break
    case 'chat-only':
      break
    default:
      lines.push(`提调本轮以「${result.strategy}」收束。`)
      break
  }
  if (result.chatAnswer.trim()) lines.push(`提调回话：${result.chatAnswer.trim()}`)
  if (input.writeFailures.length) {
    lines.push(`⚠️ 有改动写回失败（提调已改但没落库）：${input.writeFailures.join('；')}。请如实告知用户。`)
  }
  if (input.reprojected > 0) lines.push(`已对 ${input.reprojected} 条改动消息重跑投影。`)
  if (!lines.length) lines.push('提调本轮没有产出改动，也没有回话。')
  return lines
}

/** 下发提调纠偏（写操作·经确认门）：对任意会话装配并运行提调纠偏 loop，上策改动即时版本化写回。 */
export function createDispatchTidiaoCorrectionTool(ctx: XingyiTidiaoDispatchContext): ToolDefinition {
  const runner = createTidiaoSessionCorrectionRunner(ctx.runnerDeps)
  return {
    name: 'dispatchTidiaoCorrection',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，且随后跑一整条提调纠偏 loop（runner.runCorrectionForSession），
    // 两者耗时都不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '把一条纠偏指令下发给提调（导演 agent），让它对指定会话的指定消息自主处理：直接改原文（会写回该会话）、'
      + '改提示词、或给出整轮重排建议（写操作，会先弹确认）。sessionId 与 targetMessageId 先用 readChatSessionMessages 查准。'
      + '可选 closingNote：提前写好的交稿收尾话。仅当用户确认执行、且提调直接改好原文并成功写回（没有需要你转告用户的追问/'
      + '改提示词/整轮重排/写回失败）时，会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；用户取消/纠偏没完全落地时'
      + '不会使用，你会正常拿到回执再答复。写作要求：简短，不要断言具体改动细节（写它时还不知道结果），细节用户可在运行卡查看。',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话 id（必填，从 readChatSessionMessages 拿）。' },
        targetMessageId: { type: 'number', description: '被纠偏的消息 id（必填，readChatSessionMessages 输出里的 # 号）。' },
        instruction: { type: 'string', description: '给提调的纠偏指令（必填，人话描述哪里不对、想改成什么方向）。' },
        reason: { type: 'string', description: '为何下发（可选，简短，供审计）。' },
        closingNote: { type: 'string', description: '可选——提前写好的交稿收尾话。仅当提调直接改好原文并成功写回（无追问/无需转告用户的后续动作）时会作为你的最终答复直接发给用户、本轮随即结束（省一轮调用）；取消/失败/需追问/需用户到会话内操作时不会使用。写作要求：简短，不要断言具体改动细节（写它时还不知道结果）。' }
      },
      required: ['sessionId', 'targetMessageId', 'instruction']
    },
    validateArgs: (args) => {
      if (!String(args.sessionId || '').trim()) return 'dispatchTidiaoCorrection 缺少 sessionId'
      if (!(Number(args.targetMessageId) > 0)) return 'dispatchTidiaoCorrection 的 targetMessageId 必须是正数消息 id'
      if (!String(args.instruction || '').trim()) return 'dispatchTidiaoCorrection 缺少 instruction（纠偏指令）'
      return null
    },
    execute: async (toolCall) => {
      if (!ctx.confirmWrite) return confirmChannelMissingResult()
      const sessionId = String(toolCall.args.sessionId || '').trim()
      const targetMessageId = Number(toolCall.args.targetMessageId)
      const instruction = String(toolCall.args.instruction || '').trim()
      // 先取会话快照：验证会话/楼层存在 + 确认卡片预览 + 写回时的版本基线行。
      let bundle: { session?: unknown; messages?: unknown[] } | null = null
      try {
        bundle = await fetchChatSessionBundleById(sessionId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: `读取目标会话失败：${message}`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true }
        }
      }
      const session = (bundle?.session || null) as Record<string, unknown> | null
      if (!session) {
        return invalidArgumentResult(`没有找到会话 ${sessionId}，请先用 readChatSessionMessages 重新定位。`)
      }
      const messages = (Array.isArray(bundle?.messages) ? bundle.messages : []) as Array<Record<string, unknown>>
      const targetRow = messages.find((message) => Number(message.id || 0) === targetMessageId)
      if (!targetRow) {
        return invalidArgumentResult(`会话里没有找到消息 #${targetMessageId}，请先用 readChatSessionMessages 确认消息 id。`)
      }
      const targetId = resolveChatSessionTargetId(session as never)
      const targetName = ctx.listChatContacts().find((contact) => contact.targetId === targetId)?.name
        || String(ctx.runnerDeps.getTargetName?.(targetId) || '').trim()
        || targetId
      const confirmed = await ctx.confirmWrite({
        title: '下发提调纠偏',
        lines: [
          `会话：${targetName}（sessionId ${sessionId}）`,
          `目标消息：${renderSessionMessageLine(targetRow)}`,
          `纠偏指令：${clipText(instruction, 160)}`,
          '操作：提调自主选择改原文（即时写回该会话新版本）/改提示词/整轮重排建议；拿不准会先提问带回。'
        ]
      })
      if (!confirmed) {
        return {
          content: '用户在确认卡片上取消了「下发提调纠偏」，本次没有执行。请尊重用户决定，不要自行重试。',
          details: { denied: true }
        }
      }
      // 写回状态：rows=版本基线工作副本（写回一条就地更新，同轮第二次改同条走 reuseLatest 不堆版本）。
      const rows = new Map<number, Record<string, unknown>>(messages.map((message) => [Number(message.id || 0), { ...message }]))
      const writtenIds = new Set<number>()
      const written: string[] = []
      const writeFailures: string[] = []
      ctx.notifyActivity?.('提调开始处理纠偏…')
      // 运行卡埋点（批1）：begin/end 必须 1:1 成对（否则秒表停不下来），三个出口（异常/busy 等未真跑成/成功）都要 end。
      xingyiTidiaoCorrectionTaskCounter += 1
      const subagentId = `${XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX}:xingyi:${xingyiTidiaoCorrectionTaskCounter}`
      registerXingyiDispatch(sessionId, XINGYI_TIDIAO_CORRECTION_SUBAGENT_ID_PREFIX)
      beginSubagentRun(sessionId, subagentId, {
        input: `【纠偏任务】${targetName}\n\n【目标消息】${renderSessionMessageLine(targetRow)}\n\n【纠偏指令】${instruction}`
      })
      const subagentController = new AbortController()
      const unregisterSubagentControl = registerActiveSubagentControl({
        sessionId,
        subagentId,
        controller: subagentController
      })
      let result: Awaited<ReturnType<typeof runner.runCorrectionForSession>>
      try {
        result = await runner.runCorrectionForSession({
          sessionId,
          targetMessageId,
          instruction,
          signal: subagentController.signal,
          onDirectorStream: (stream) => {
            ctx.notifyActivity?.(`提调在编排（第 ${stream.decisions.length} 步）…`)
          },
          // 上策每改完一条当场版本化写回（中途失败已写回的不丢）——版本语义走共享核心，见模块头联动标注。
          onEditCommitted: async (commit) => {
            const messageId = Number(commit.messageId || 0)
            const label = commit.ref || `#${messageId}`
            const row = rows.get(messageId)
            if (!row) {
              writeFailures.push(`${label}（会话快照里找不到这条消息）`)
              return
            }
            try {
              const payload = buildChatMessageEditVersionPayload(
                row as ChatMessageEditVersionSourceRow,
                commit.content,
                { reuseLatest: writtenIds.has(messageId) }
              )
              await updateChatMessageBySessionId(sessionId, messageId, payload as unknown as Record<string, unknown>)
              Object.assign(row, payload)
              if (!writtenIds.has(messageId)) written.push(label)
              writtenIds.add(messageId)
              ctx.onMessagePatched?.({ sessionId, messageId, payload: payload as unknown as Record<string, unknown> })
            } catch (error) {
              writeFailures.push(`${label}（${error instanceof Error ? error.message : String(error)}）`)
            }
          }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        endSubagentRun(sessionId, subagentId, {
          ok: false,
          ...(subagentController.signal.aborted ? { cancelled: true } : {}),
          error: message
        })
        unregisterSubagentControl()
        return {
          content: `提调纠偏执行失败：${message}${written.length ? `（失败前已写回：${written.join('、')}）` : ''}`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
        }
      }
      if (!result.ok) {
        // busy/未定位/已停止都是如实转告态（不是故障）：busy 让用户稍后再试，未定位先重新 read 定位。
        endSubagentRun(sessionId, subagentId, {
          ok: false,
          ...(subagentController.signal.aborted ? { cancelled: true } : {}),
          error: result.message
        })
        unregisterSubagentControl()
        return {
          content: `${result.message}${result.busy ? '' : ' 如需重试，请先用 readChatSessionMessages 重新定位。'}`,
          details: { ok: false, busy: result.busy }
        }
      }
      // 重投影：提调标记「原文改动大、投影过时」的消息，写回 DB 后重跑投影（对齐 useChatMessageOps.reprojectMarkedTargets：逐条吞错）。
      let reprojected = 0
      for (const target of result.reprojectTargets || []) {
        const messageId = Number(target?.messageId || 0)
        if (messageId <= 0 || !writtenIds.has(messageId)) continue
        try {
          await runChatMessageProjectionBySessionId(sessionId, messageId, { promptLogMode: 'background' })
          reprojected += 1
        } catch (error) {
          console.error('星依 dispatch 重投影失败：', target?.ref, error)
        }
      }
      const lines = buildDispatchReportLines({
        result: {
          strategy: result.strategy,
          edits: result.edits,
          promptEdits: result.promptEdits,
          askUser: result.askUser,
          escalation: result.escalation,
          chatAnswer: result.chatAnswer
        },
        written,
        writeFailures,
        reprojected
      })
      const content = lines.join('\n')
      endSubagentRun(sessionId, subagentId, { ok: true, output: content })
      unregisterSubagentControl()
      // closingNote 透传（2026-07-12 用户拍板）：本工具「完全成功」的口径比 result.ok 更窄——result.ok 只代表
      // runner 本身没跑挂（busy/未定位/中断都会走上面 !result.ok 分支提前 return），但 direct-edit 之外的策略
      // （prompt-regen/escalate/ask-user/chat-only）都需要用户到会话内再操作或先答复问题，不算「已经办完」；
      // 写回途中若有失败（writeFailures 非空）也不算干净成功。故这里额外收窄：只有「上策直接写回、且全部写成功、
      // 没有需要转告用户的追问」才算完全成功——不确定要不要放宽到 prompt-regen/escalate，先按最严口径落地。
      const isFullySuccessful = result.strategy === 'direct-edit' && writeFailures.length === 0
      const closingNote = String(toolCall.args.closingNote || '').trim()
      return {
        content,
        details: {
          runId: result.runId,
          sessionId,
          strategy: result.strategy,
          edits: result.edits,
          promptEdits: result.promptEdits,
          askUser: result.askUser,
          escalation: result.escalation,
          written,
          writeFailures,
          reprojected
        },
        ...(isFullySuccessful && closingNote ? { closingNote } : {})
      }
    }
  }
}

/** searchDirectorMemory 星依视角换皮：execute 复用 searchAppendLogTool（一处真值），只改 brief 口吻。 */
function createXingyiSearchDirectorMemoryTool(): ToolDefinition {
  const base = createSearchAppendLogTool()
  return {
    ...base,
    brief: '检索最近一轮提调带的运行记忆（聊天内或外部下发的最近一条提调 loop·单例 last-writer-wins）——'
      + '按关键词搜提调的决策、工具结果、报错或消息原文，用于回答「提调刚才做了什么/为什么这么改」。搜不到就如实说。'
      + '多个关键词放 queries 数组分项给（任一命中即算），不要用空格拼成一个长串。'
  }
}

/** 批次3b 指挥提调工具全家桶：harness 在 tidiaoDispatch 接缝在场时一把装配。 */
export function createXingyiTidiaoDispatchTools(ctx: XingyiTidiaoDispatchContext): ToolDefinition[] {
  return [
    createListChatContactsTool(ctx),
    createReadChatSessionMessagesTool(ctx),
    createDispatchTidiaoCorrectionTool(ctx),
    createXingyiSearchDirectorMemoryTool()
  ]
}
