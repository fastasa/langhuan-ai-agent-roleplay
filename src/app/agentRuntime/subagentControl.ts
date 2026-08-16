import type { ToolDefinition } from './toolRegistry'
import {
  getSubagentRunStatus,
  listAllSubagentRunStatuses,
  type SubagentRunStatus
} from '../subagentRunStatus'

export const LIST_SUBAGENTS_TOOL_NAME = 'listSubagents'
export const INTERRUPT_SUBAGENT_TOOL_NAME = 'interruptSubagent'
export const SEND_SUBAGENT_MESSAGE_TOOL_NAME = 'sendSubagentMessage'
export const AGENT_SUBAGENT_CONTROL_TOOL_NAMES = [
  LIST_SUBAGENTS_TOOL_NAME,
  INTERRUPT_SUBAGENT_TOOL_NAME,
  SEND_SUBAGENT_MESSAGE_TOOL_NAME
] as const

type ActiveSubagentControl = {
  token: symbol
  sessionId: string
  subagentId: string
  controller: AbortController
  mailbox: string[]
}

const activeControls = new Map<string, ActiveSubagentControl>()

function controlKey(sessionId: string, subagentId: string) {
  return `${sessionId}::${subagentId}`
}

function normalizeText(value: unknown, limit: number) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function resolveSubagentId(sessionId: string, target: string): string | null {
  const normalizedTarget = normalizeText(target, 240)
  if (!normalizedTarget) return null
  if (getSubagentRunStatus(sessionId, normalizedTarget)) return normalizedTarget
  const matches = listAllSubagentRunStatuses(sessionId)
    .map((item) => item.subagentId)
    .filter((subagentId) => subagentId.endsWith(`:${normalizedTarget}`))
  return matches.length === 1 ? matches[0] : null
}

/**
 * 只保存活跃运行的控制句柄与父级消息邮箱，不保存第二份运行状态。
 * 展示和状态判断仍只读 subagentRunStatus。
 */
export function registerActiveSubagentControl(input: {
  sessionId: string
  subagentId: string
  controller: AbortController
}) {
  const sessionId = normalizeText(input.sessionId, 240)
  const subagentId = normalizeText(input.subagentId, 240)
  const token = Symbol(subagentId)
  if (!sessionId || !subagentId) return () => {}
  const key = controlKey(sessionId, subagentId)
  activeControls.set(key, {
    token,
    sessionId,
    subagentId,
    controller: input.controller,
    mailbox: []
  })
  return () => {
    if (activeControls.get(key)?.token === token) activeControls.delete(key)
  }
}

export function drainSubagentControlMessages(sessionId: string, subagentId: string): string[] {
  const control = activeControls.get(controlKey(sessionId, subagentId))
  if (!control?.mailbox.length) return []
  const messages = [...control.mailbox]
  control.mailbox.length = 0
  return messages
}

export interface AgentSubagentControlCapability {
  list(): Array<{ sessionId: string; subagentId: string; status: SubagentRunStatus; controllable: boolean }>
  interrupt(target: string, reason: string): { ok: boolean; subagentId?: string; message: string }
  sendMessage(target: string, message: string): { ok: boolean; subagentId?: string; message: string }
}

export function createSubagentControlCapability(
  getSessionIds: () => readonly string[]
): AgentSubagentControlCapability {
  const sessionIds = () => Array.from(new Set(
    getSessionIds().map((value) => normalizeText(value, 240)).filter(Boolean)
  ))
  const resolveTarget = (target: string) => {
    const qualified = normalizeText(target, 520)
    const separatorIndex = qualified.indexOf('::')
    if (separatorIndex > 0) {
      const sessionId = qualified.slice(0, separatorIndex)
      const subagentId = qualified.slice(separatorIndex + 2)
      if (sessionIds().includes(sessionId) && getSubagentRunStatus(sessionId, subagentId)) {
        return { sessionId, subagentId }
      }
    }
    const matches = sessionIds()
      .map((sessionId) => ({ sessionId, subagentId: resolveSubagentId(sessionId, target) }))
      .filter((item): item is { sessionId: string; subagentId: string } => Boolean(item.subagentId))
    return matches.length === 1 ? matches[0] : null
  }
  return {
    list: () => sessionIds().flatMap((sessionId) => (
      listAllSubagentRunStatuses(sessionId).map((item) => ({
        sessionId,
        ...item,
        controllable: activeControls.has(controlKey(sessionId, item.subagentId))
      }))
    )),
    interrupt: (target, reason) => {
      const resolved = resolveTarget(target)
      if (!resolved) {
        return { ok: false, message: '没有找到当前父会话下唯一匹配的子 Agent。请先调用 listSubagents 取得准确 subagentId。' }
      }
      const { sessionId, subagentId } = resolved
      const control = activeControls.get(controlKey(sessionId, subagentId))
      if (!control || control.controller.signal.aborted) {
        return { ok: false, subagentId, message: '该子 Agent 已经结束或正在停止，不能重复中断。' }
      }
      control.controller.abort(new DOMException(normalizeText(reason, 360) || '父 Agent 请求停止', 'AbortError'))
      return {
        ok: true,
        subagentId,
        message: `已向 ${subagentId} 发出停止信号。需要调整任务后重派时，先等待它进入“已停止”，再修改任务书并重新调用原派遣工具；旧运行不得冒充新任务完成。`
      }
    },
    sendMessage: (target, message) => {
      const resolved = resolveTarget(target)
      if (!resolved) {
        return { ok: false, message: '没有找到当前父会话下唯一匹配的子 Agent。请先调用 listSubagents 取得准确 subagentId。' }
      }
      const { sessionId, subagentId } = resolved
      const control = activeControls.get(controlKey(sessionId, subagentId))
      if (!control || control.controller.signal.aborted) {
        return { ok: false, subagentId, message: '该子 Agent 当前不在运行。若要继续或改写任务，请重新调用原派遣工具创建新运行。' }
      }
      const normalizedMessage = normalizeText(message, 2400)
      if (!normalizedMessage) return { ok: false, subagentId, message: '追加指令不能为空。' }
      control.mailbox.push(normalizedMessage)
      return {
        ok: true,
        subagentId,
        message: `追加指令已进入 ${subagentId} 的父级邮箱，将在当前模型调用或工具调用结束后的下一个安全边界送达。`
      }
    }
  }
}

export function createSessionSubagentControlCapability(sessionIdInput: string): AgentSubagentControlCapability {
  const sessionId = normalizeText(sessionIdInput, 240)
  return createSubagentControlCapability(() => [sessionId])
}

function stateLabel(status: SubagentRunStatus) {
  if (status.state === 'running') return '运行中'
  if (status.state === 'done') return '已完成'
  if (status.state === 'cancelled') return '已停止'
  return '失败'
}

export function buildSubagentControlTools(capability: AgentSubagentControlCapability): ToolDefinition[] {
  return [
    {
      name: LIST_SUBAGENTS_TOOL_NAME,
      brief: '列出当前父会话自己派遣过的子 Agent、运行状态、准确 subagentId 和是否仍可控制。取消、追加指令或重新派遣前先用它核对目标；不能查看其它会话的子 Agent。',
      schema: { type: 'object', additionalProperties: false, properties: {} },
      execute: () => {
        const items = capability.list()
        const content = items.length
          ? items.map((item) => [
              `${item.sessionId}::${item.subagentId}｜${stateLabel(item.status)}`,
              item.status.presentation?.title ? `任务=${item.status.presentation.title}` : '',
              item.controllable ? '可控制' : '不可控制'
            ].filter(Boolean).join('｜')).join('\n')
          : '当前父会话没有子 Agent 运行记录。'
        return { content, status: 'success', details: { kind: 'agentSubagentList', count: items.length }, acted: false }
      }
    },
    {
      name: INTERRUPT_SUBAGENT_TOOL_NAME,
      brief: '停止当前父会话自己派遣且仍在运行的一个子 Agent。只中断目标子 Agent，不停止父 Agent或其它子 Agent。停止后若要修改提示词重派，等待终态后修改任务书，再调用原派遣工具创建新运行。',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', description: 'listSubagents 返回的准确 subagentId；也可传唯一 taskId。' },
          reason: { type: 'string', description: '为什么停止；会进入控制审计与停止原因。' }
        },
        required: ['target', 'reason']
      },
      execute: (call) => {
        const result = capability.interrupt(call.args.target as string, call.args.reason as string)
        return result.ok
          ? { content: result.message, status: 'success', details: { kind: 'agentSubagentInterrupted', subagentId: result.subagentId }, acted: true }
          : { content: result.message, status: 'error', error: { type: 'EXPECTATION_MISMATCH', message: result.message, retryable: true }, acted: false }
      }
    },
    {
      name: SEND_SUBAGENT_MESSAGE_TOOL_NAME,
      brief: '向当前父会话自己派遣且仍在运行的子 Agent 追加或修正指令。消息在当前模型/工具调用完成后的下一个安全边界送达；它不会中断正在进行的外部请求。若必须撤销当前任务，先用 interruptSubagent，再修改任务书重新派遣。',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', description: 'listSubagents 返回的准确 subagentId；也可传唯一 taskId。' },
          message: { type: 'string', description: '要追加的任务约束或纠正要求。' }
        },
        required: ['target', 'message']
      },
      execute: (call) => {
        const result = capability.sendMessage(call.args.target as string, call.args.message as string)
        return result.ok
          ? { content: result.message, status: 'success', details: { kind: 'agentSubagentMessageQueued', subagentId: result.subagentId }, acted: false }
          : { content: result.message, status: 'error', error: { type: 'EXPECTATION_MISMATCH', message: result.message, retryable: true }, acted: false }
      }
    }
  ]
}

export function isAgentSubagentControlTool(name: string) {
  return (AGENT_SUBAGENT_CONTROL_TOOL_NAMES as readonly string[]).includes(String(name || '').trim())
}

export function resetSubagentControlsForTest() {
  for (const control of activeControls.values()) {
    if (!control.controller.signal.aborted) control.controller.abort()
  }
  activeControls.clear()
}
