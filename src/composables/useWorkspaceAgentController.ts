/**
 * 工作区专业Agent（编剧/舆图师/鉴心）会话控制器。
 * 批A：会话CRUD与按作用域独立的状态容器。批B（本次）：接入真实一轮对话 loop——
 * 具体 agent（编剧/舆图师）的模型调用与工具由调用方通过 runner 注入，本文件只负责：
 * 乐观消息/落库、running/abort 生命周期。写确认门（confirmWrite）不在本文件——
 * 弹窗（ScriptWorkspaceDialog/MapViewerDialog）直接调用 workspaceAgentScopeState.ts 的
 * createScopeConfirmWriteChannel 独立工厂（修复批G：本文件此前重复导出的 confirmWrite 是无人读的死代码）。
 */

import {
  ensureWorkspaceAgentChatSession,
  createWorkspaceAgentChatSession,
  listWorkspaceAgentChatSessions,
  activateWorkspaceAgentChatSession,
  createChatMessageBySessionId,
  type ChatSessionBundle,
  type XingyiSessionSummary
} from '../repositories/chatRepository'
import {
  getOrCreateScopeState,
  type WorkspaceAgentKind,
  type WorkspaceAgentScopeState,
  type WorkspaceAgentDisplayMessage
} from '../app/workspaceAgentScopeState'
import {
  createAgentTurnStreamController,
  parseAgentTurnStream,
  serializeAgentTurnStream,
  type AgentTurnStreamController,
  type AgentTurnStreamEntry
} from '../app/agentTurnStream'
import type { AgentTaskTodoSnapshot } from '../app/agentRuntime/taskTodo'
import {
  readAgentConversationContinuation,
  saveAgentConversationDeferredTools,
  saveAgentConversationModelSelection,
  saveAgentConversationTaskTodo
} from '../app/agentRuntime/conversationContinuation'
import {
  normalizeAgentConversationModelSelection,
  type AgentConversationModelSelection
} from '../app/agentConversationModelSelection'

function applyBundleToScopeState(
  state: WorkspaceAgentScopeState,
  bundle: ChatSessionBundle,
  turnStream: AgentTurnStreamController
) {
  // ensure / 新建 / 激活历史统一在这里切断旧尾流，避免跨会话回放串台。
  turnStream.clear()
  state.sessionId = String(bundle?.session?.id || '')
  const continuation = readAgentConversationContinuation(state.sessionId)
  state.messages = (Array.isArray(bundle?.messages) ? bundle.messages : [])
    .map((item): WorkspaceAgentDisplayMessage | null => {
      const role = String(item?.role || '')
      const content = String(item?.content || '')
      if ((role !== 'user' && role !== 'assistant') || !content) return null
      const storedTurnStream = parseAgentTurnStream(item?.turnStreamJson)
      return {
        role: role as 'user' | 'assistant',
        content,
        ...(storedTurnStream ? { turnStream: storedTurnStream } : {})
      }
    })
    .filter((item): item is WorkspaceAgentDisplayMessage => item !== null)
  state.taskTodo = continuation.taskTodo
  state.deferredActiveTools = continuation.deferredActiveTools
  state.modelSelection = normalizeAgentConversationModelSelection(continuation.modelSelection, state.agentKind)
  state.sessionLoaded = true
}

/** 一轮对话执行体：具体 agent（编剧/舆图师）的模型调用、工具装配由调用方闭包提供；
 *  本函数只需要「输入本轮用户文本 + 历史 + 停止信号」→「输出自然语言回复」。 */
export type WorkspaceAgentTurnRunner = (input: {
  /** 本轮派遣瞬间钉死的正式会话；后台子 Agent 回执必须写回这里，不能追随之后切换的会话。 */
  sessionId: string
  userText: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  signal: AbortSignal
  /** 当前 scope 的信息流写口；runner 只写运行过程，不持有会话或消息。 */
  turnStream?: AgentTurnStreamController
  /** 长任务用户可见过程话；调用后 runner 必须继续原计划，不能把它当最终回复。 */
  emitInterimMessage?: (content: string) => Promise<void>
  /** 当前对话上一轮 TODO；停止后补充消息时继续，不进入历史消息。 */
  initialTaskTodo?: AgentTaskTodoSnapshot | null
  /** 当前对话此前通过 toolsearch 激活的业务工具。 */
  initialDeferredActiveTools?: readonly string[]
  /** 已激活业务工具集合变化写口。 */
  onDeferredActiveToolsChange?: (toolNames: string[]) => void
  /** 当前对话 TODO 运行态写口；只更新本 scope 的共享卡片，不进入历史消息。 */
  onTaskTodoChange?: (snapshot: AgentTaskTodoSnapshot) => void
  /** 本轮使用的对话级模型槽与努力程度快照。 */
  modelSelection: AgentConversationModelSelection
}) => Promise<{ reply: string; terminalReason?: string }>

export interface WorkspaceAgentController {
  state: WorkspaceAgentScopeState
  /** 幂等取/建当前 scope 的会话；已加载过则直接返回（同 loadSession 的"只加载一次"语义）。 */
  loadOrEnsureSession(): Promise<void>
  /** 显式"新建对话"：同 scope 最新会话为空则复用，否则新开一条。 */
  newSession(): Promise<void>
  /** "历史对话"菜单清单：范围收窄到当前 scope。 */
  listHistory(): Promise<XingyiSessionSummary[]>
  /** 激活一条历史会话（服务端校验 scope 一致）。 */
  activateSession(sessionId: string): Promise<void>
  /** 发起一轮对话：乐观push用户消息+落库→跑 runner→push助手回复+落库。running 期间忽略重复调用。 */
  send(userText: string): Promise<void>
  /** 停止：中断本轮 abort 信号 + 清理待确认卡（用户取消视为成功态 dismissed，不是故障）。 */
  stop(): void
  /** 修改当前对话的模型槽与努力程度，并立即持久化到该会话。 */
  updateModelSelection(selection: AgentConversationModelSelection): void
}

export function useWorkspaceAgentController(
  scopeKey: string,
  agentKind: WorkspaceAgentKind,
  targetId: string,
  title: string,
  runner: WorkspaceAgentTurnRunner
): WorkspaceAgentController {
  const state = getOrCreateScopeState(scopeKey, agentKind, targetId)
  const turnStream = createAgentTurnStreamController(state.turnStream)

  // 去重的 in-flight ensure：Shell onMounted 的 loadOrEnsureSession 与 send() 前置守卫复用同一个
  // Promise，保证 ensure 回包的整表替换（applyBundleToScopeState）不会吞掉之后才 push 的乐观气泡。
  // 失败时清空引用，允许下一次调用重试。
  let ensureInFlight: Promise<void> | null = null

  function ensureSessionShared(): Promise<void> {
    if (!ensureInFlight) {
      ensureInFlight = (async () => {
        const bundle = await ensureWorkspaceAgentChatSession(agentKind, targetId, title)
        applyBundleToScopeState(state, bundle, turnStream)
      })().finally(() => { ensureInFlight = null })
    }
    return ensureInFlight
  }

  async function loadOrEnsureSession() {
    if (state.sessionLoaded) return
    await ensureSessionShared()
  }

  async function newSession() {
    // 运行中切会话先中断本轮：否则 runner 返回后回复会落进切换后的新会话（串写）。
    stop()
    const bundle = await createWorkspaceAgentChatSession(agentKind, targetId, title)
    applyBundleToScopeState(state, bundle, turnStream)
  }

  async function listHistory() {
    return listWorkspaceAgentChatSessions(agentKind, targetId)
  }

  async function activateSession(sessionId: string) {
    // 同 newSession：切历史会话前先中断运行中的一轮，防止回复串写到目标会话。
    stop()
    const bundle = await activateWorkspaceAgentChatSession(sessionId, agentKind, targetId)
    applyBundleToScopeState(state, bundle, turnStream)
  }

  async function persistMessage(
    sessionId: string | null,
    role: 'user' | 'assistant',
    content: string,
    entries?: AgentTurnStreamEntry[]
  ): Promise<void> {
    if (!sessionId) return
    try {
      const serialized = serializeAgentTurnStream(entries)
      await createChatMessageBySessionId(sessionId, {
        role,
        content,
        ...(serialized ? { turn_stream_json: serialized } : {})
      })
    } catch {
      // 持久失败不打断对话（消息仍在本地视图），下轮刷新会丢这条——与 XingyiDock.vue::persistMessage 同款容错。
    }
  }

  async function send(userText: string): Promise<void> {
    const text = userText.trim()
    if (!text || state.running) return
    // running 提前置位：ensure 等待期间用户重复点发送会被上面的守卫拦住。
    state.running = true
    const abortController = new AbortController()
    state.abortController = abortController
    // 声明提到 try 外：catch 分支要用它判断错误气泡该不该进当前会话视图。
    let sessionAtSend: string | null = null
    try {
      // 会话未就绪时先等 ensure 完成再推乐观消息：否则 sessionId 为 null 落库全丢，
      // 且 ensure 回包的整表替换会当场吞掉乐观气泡。ensure 失败不静默继续：报错给用户、本轮不发送。
      if (!state.sessionId) {
        try {
          await ensureSessionShared()
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          state.messages.push({ role: 'assistant', content: `呜……这次没能完成：${detail}` })
          return
        }
      }
      // ensure 等待期间被 stop()：本轮直接放弃，不推消息不跑 runner。
      if (abortController.signal.aborted) return
      const historySnapshot = state.messages.map((message) => ({ role: message.role, content: message.content }))
      // 本轮归属会话在发送瞬间钉死：runner 返回后一律以它落库；期间若会话被切走，只落库不进新会话视图。
      sessionAtSend = state.sessionId
      state.messages.push({ role: 'user', content: text })
      state.draft = ''
      void persistMessage(sessionAtSend, 'user', text)
      turnStream.begin()
      const emittedInterimMessages = new Set<string>()
      const emitInterimMessage = async (content: string) => {
        const interim = String(content || '').trim()
        if (!interim || emittedInterimMessages.has(interim) || abortController.signal.aborted) return
        emittedInterimMessages.add(interim)
        const drained = turnStream.drain()
        if (state.sessionId === sessionAtSend) {
          state.messages.push({ role: 'assistant', content: interim, ...(drained.length ? { turnStream: drained } : {}) })
        }
        await persistMessage(sessionAtSend, 'assistant', interim, drained)
      }
      const result = await runner({
        sessionId: sessionAtSend as string,
        userText: text,
        history: historySnapshot,
        signal: abortController.signal,
        turnStream,
        emitInterimMessage,
        initialTaskTodo: state.taskTodo,
        initialDeferredActiveTools: state.deferredActiveTools,
        modelSelection: { ...state.modelSelection },
        onDeferredActiveToolsChange: (toolNames) => {
          if (!sessionAtSend) return
          saveAgentConversationDeferredTools(sessionAtSend, toolNames)
          if (state.sessionId === sessionAtSend) state.deferredActiveTools = [...toolNames]
        },
        onTaskTodoChange: (snapshot) => {
          if (!sessionAtSend) return
          const retained = saveAgentConversationTaskTodo(sessionAtSend, snapshot)
          if (state.sessionId === sessionAtSend) state.taskTodo = retained
        }
      })
      if (result?.terminalReason === 'aborted' || abortController.signal.aborted) {
        turnStream.settleAllOpen('error')
        return
      }
      const reply = String(result?.reply || '').trim()
      if (reply) {
        const drained = turnStream.drain()
        if (state.sessionId === sessionAtSend) {
          state.messages.push({ role: 'assistant', content: reply, ...(drained.length ? { turnStream: drained } : {}) })
        }
        void persistMessage(sessionAtSend, 'assistant', reply, drained)
      }
    } catch (error) {
      const aborted = (error instanceof Error && error.name === 'AbortError') || abortController.signal.aborted
      if (aborted) {
        turnStream.settleAllOpen('error')
      } else if (state.sessionId === sessionAtSend) {
        const detail = error instanceof Error ? error.message : String(error)
        turnStream.settleAllOpen('error')
        const drained = turnStream.drain()
        state.messages.push({
          role: 'assistant',
          content: `呜……这次没能完成：${detail}`,
          ...(drained.length ? { turnStream: drained } : {})
        })
      }
    } finally {
      turnStream.end()
      // 只清理仍属于本轮的运行态：若期间 stop()/切会话已重置（甚至新一轮已开跑），不去碰新轮的状态。
      if (state.abortController === abortController) {
        state.running = false
        state.abortController = null
      }
    }
  }

  function stop() {
    state.abortController?.abort()
    state.abortController = null
    if (state.pendingInteraction) {
      state.pendingInteraction.resolve({ status: 'dismissed' })
      state.pendingInteraction = null
    }
    // stop() 是取消地图草稿审阅的唯一显式出口（关弹窗/卸载刻意不取消，见 disposeScopeState）：
    // resolve cancelled 让 runMapDraftReviewGate 收到取消、runner 正常收尾归位。
    if (state.pendingMapDraftReview) {
      state.pendingMapDraftReview.resolve({ status: 'cancelled' })
      state.pendingMapDraftReview = null
    }
    state.running = false
    turnStream.settleAllOpen('error')
    turnStream.end()
  }

  function updateModelSelection(selection: AgentConversationModelSelection) {
    state.modelSelection = normalizeAgentConversationModelSelection(selection, state.agentKind)
    if (state.sessionId) saveAgentConversationModelSelection(state.sessionId, state.modelSelection)
  }

  return { state, loadOrEnsureSession, newSession, listHistory, activateSession, send, stop, updateModelSelection }
}
