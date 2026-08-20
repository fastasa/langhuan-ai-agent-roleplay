// 统一 state 协议 · runtime 保真事件 → append log 的统一喂入（R3-2 接线 + R3-3 lifecycle 透传 + R3-5 报错进 state）。
//
// 定位：runtime 的 onEvent 上抛 AgentRuntimeFidelityEvent；消息/工具事件写 append log，semantic-compaction 与
// journal-error 属于运行时审计事件，不写提调业务日志，也不得兜底当作 tool-result。
// 各 loop（群/单/纠偏/精修 harness）的 onEvent 此前各写一份「event.kind 分发 → append*Event」逻辑。本 helper 收口成一份：
//   - assistant-message → appendMessageEvent
//   - tool-call         → appendToolCallEvent
//   - tool-result       → appendToolResultEvent（带工具静态 fieldLifecycle，压缩器据它拆 durable/searchable）
//                         + 若 status=error/blocked，**额外** append 一条 error 事件（R3-5：报错作为一类事件进 state，
//                           供 getAppendLogErrors 自诊断 + searchAppendLog 按 type='error' 检索「哪一步、什么错」）。
//
// 边界：error 事件与 toolResult 事件并存于保真 log（toolResult 保 content/details，error 保结构化 type/message/stage/turn）；
// 压缩投影（appendLogProjection）只渲染 error 事件、跳过 toolResult-error 行，避免喂模型时同一失败重复显示。

import type { AgentRuntimeFidelityEvent } from '../agentRuntime/runtime'
import type { ToolRegistry } from '../agentRuntime/toolRegistry'
import type { AppendLogEventOrigin } from './appendLogTypes'
import { appendErrorEvent, appendMessageEvent, appendToolCallEvent, appendToolResultEvent } from './appendLog'

/**
 * 把一条 runtime 保真事件喂进当前活动 append log（runId 传 '' = 当前活动 log；无活动 log 自动空操作）。
 * - origin（R1-C 主/子 state 隔离）：缺省=提调本人事件（轮级提调/编辑/单聊导演·进跨轮记忆投影·行为不变）；
 *   'actor'=演员子 loop（群聊 per-speaker 台词生成）过程事件——仍 append 保真层供审计/检索，但投影时被过滤、不污染提调记忆。
 */
export function feedAppendLogFromFidelityEvent(
  event: AgentRuntimeFidelityEvent,
  registry?: ToolRegistry,
  origin?: AppendLogEventOrigin
): void {
  switch (event.kind) {
    case 'assistant-message':
      appendMessageEvent('', 'assistant', event.content, origin)
      return
    case 'tool-call':
      appendToolCallEvent('', event.toolCall, origin)
      return
    case 'tool-result': {
      const result = event.toolResult
      appendToolResultEvent('', result, registry?.get(result.toolName)?.fieldLifecycle, origin)
      // R3-5：工具报错/被拦 → 同时作为一类 error 事件进 state（定位「哪一步、哪个工具、第几轮、什么错」）。
      if (result.status === 'error' || result.status === 'blocked') {
        const error = result.error || { type: 'TOOL_RUNTIME_ERROR' as const, message: result.content || '工具执行失败', retryable: false }
        appendErrorEvent('', error, {
          toolName: result.toolName,
          ...(result.stage ? { stage: String(result.stage) } : {}),
          turnIndex: event.turnIndex
        }, origin)
      }
      return
    }
    case 'semantic-compaction':
    case 'journal-error':
      return
    default: {
      // 编译期穷尽门：以后新增 fidelity kind 时，必须先决定它能否进入业务日志。
      const unhandledEvent: never = event
      void unhandledEvent
      return
    }
  }
}
