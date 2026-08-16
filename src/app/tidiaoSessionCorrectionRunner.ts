// 提调纠偏「会话级外部装配入口」（批次3a·2026-07-04 陈星依总agent计划 §5.2/§5.3-1·R1 工厂闭包范式）。
//
// 定位：按 sessionId 脱离聊天 pipeline 的完整装配——任意会话构建读/编上下文 + 基线容器接管 + 纠偏 loop 启动。
// 与聊天内入口 `useChatSendPipeline.correctChatMessageViaDirector` 共用同一份装配核心
// `tidiaoCorrectionAssembly`（一处真值两个入口·联动标注见该模块头注释）。
//
// 批次3a 边界（拍定·不是缺陷）：
// - **只做装配与 loop 启动**，不做 dispatchTidiaoCorrection 工具（批次3b）。
// - **单例守门（硬要求③）**：activeAgentAppendLog / activeTidiaoDirectorStreamRound 是全局单例，
//   本入口启动前必须过两道门——① deps.hasRunningChatRound()（聊天提调轮在跑→拒绝，不抢活动轮）；
//   ② 模块级 activeExternalRun 标记（外部轮自身串行·并发第二发拒绝）。反向（外部轮在跑时用户发聊天消息）
//   聊天轮照常接管单例，外部轮事件按 runId 不匹配被 drop、loop 仍跑完返回结果（呈现降级·见装配核心头注释）。
// - **接缝降级**：不装配 中策重生成 / 新增旁白 / 改帷幕 / 重试失败单元 四类执行接缝（它们依赖聊天 pipeline
//   的活体链路），loop 按 B3 门控自动收窄对应能力；上/下策、askUser、读改提示词（改动由结果带回）、todo、
//   投影标记全部可用。**续回统筹 resumeSeam 同理不注入**（2026-07-08：外部轮无管线活体链路可续跑统筹，
//   resumeOrchestration 不注册 → loop 不会返回 resume-orchestration 策）。edits 只改内存工作副本，**写回 DB 由调用方经 onEditCommitted 接**（批次3b 的 dispatch
//   工具负责写回与回报协议——本模块不造第二条写回真值）。
// - **数据红线**：只读现役查询通道 + 决策流走现役 attempt/artifact 持久化，不碰 db.ts/migrations/写盘。

import type { TidiaoDirectorStream } from './tidiaoDirectorStream'
import {
  captureTidiaoDirectorStreamSnapshot,
  clearTidiaoDirectorStreamRound,
  markTidiaoDirectorStreamRoundCorrecting,
  markTidiaoDirectorStreamRoundFailed,
  updateTidiaoDirectorStreamRound
} from './tidiaoDirectorStreamState'
import { runTidiaoCorrectionLoop, type TidiaoCorrectionLoopResult } from './tidiaoCorrectionLoop'
import { toOpenAiTools } from './agentRuntime/toolRegistry'
import { createRequestEnvelopeDiagnosticTracker } from './agentRuntime/requestEnvelopeDiagnostics'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'
import { startChatGenerationAttempt, finishChatGenerationAttempt } from './chatTurnAudit'
import { setCurrentAiUsageContext, clearCurrentAiUsageContext } from './aiUsageContext'
import { buildChatTurnRoundId } from './chatTurnRunner'
import { createDirectorStreamPersist } from './directorStreamPersist'
import {
  assembleTidiaoCorrectionContexts,
  beginTidiaoCorrectionRunContainers,
  buildTidiaoStatusSystemSeam,
  buildTidiaoCorrectionBandMemory,
  readSessionCurtainSceneContext,
  withToolsearchOverrideProtocol,
  type TidiaoCorrectionSessionSource
} from './tidiaoCorrectionAssembly'
import { fetchChatSessionBundleById, resolveChatSessionTargetId } from '../repositories/chatRepository'

export interface TidiaoSessionCorrectionRunnerDeps {
  /** 单例守门（硬要求③）：聊天提调/回复任务是否正在跑（runtimeStore.hasRunningChatTasks 等价）。 */
  hasRunningChatRound: () => boolean
  /** 原生工具调用（useAI().callAIWithTools 等价·自带 initStores 独立可用）。 */
  callAIWithTools: (
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown>
  ) => Promise<{ content?: string | null; toolCalls?: unknown[] } | null>
  /** 编排模型配置（readBrainAgentConfigFromList(settingStore.agentModelConfigs) 等价）。 */
  loadAgentConfig: () => Record<string, unknown> | null
  /** 用户称呼（「据XX纠偏」转场标记）。缺省「用户」。 */
  readUserAddressName?: () => string
  /** 会话目标显示名（额度台账/带出场名用）；缺省回退 targetId。 */
  getTargetName?: (targetId: string) => string
  /** 帷幕全局兜底三值（settingStore.currentTime/Weather/Location 等价）；层2 场景锚用。 */
  readCurtainDefaults?: () => { currentTime?: string; currentWeather?: string; currentLocation?: string }
  /** 统一投影协议入口。提供后，外部纠偏轮不再自行拼装场景与聊天历史。 */
  loadAgentContextBlock?: (input: { sessionId: string; agentKind: 'tidiao' }) => Promise<string>
  /** 停止统一（2026-07-06 用户拍板）：把外部轮登记进聊天任务列表（chatTaskRuns=输入框停止按钮唯一真值），
   *  按钮据此点亮、abortChat「停止一切」可 abort 本轮。缺省不注入=不登记（按钮不亮且不可停），装配方应尽量注入。 */
  registerChatTaskRun?: (input: {
    label: string
    targetId: string
    sessionId: string
    abortController: AbortController
  }) => { complete: () => void; fail: (error: unknown) => void; stop: () => void } | null
}

export interface TidiaoSessionCorrectionRunInput {
  sessionId: string
  /** 被纠偏消息 id（活动轮在场时装配核心会按五验③重定向到活动轮）。 */
  targetMessageId: number
  /** 用户纠偏指令。 */
  instruction: string
  /** 要落库的「用户原始指令」（缺省=instruction）。 */
  userInstruction?: string
  signal?: AbortSignal
  /** 每 turn 重建 0-6 prompt（与聊天内 directorPromptRebuild 同语义）；缺省 true。 */
  promptRebuild?: boolean
  onDirectorStream?: (stream: TidiaoDirectorStream) => void
  /** 上策每成功改一条即上抛（写回 DB 由调用方负责·见头注释边界）。 */
  onEditCommitted?: (commit: { messageId: number; ref: string; content: string }) => void | Promise<void>
}

export type TidiaoSessionCorrectionRunResult =
  | { ok: false; busy: boolean; message: string }
  | {
      ok: true
      runId: string
      anchorMessageId: number
      strategy: TidiaoCorrectionLoopResult['strategy']
      edits: TidiaoCorrectionLoopResult['edits']
      promptEdits: TidiaoCorrectionLoopResult['promptEdits']
      regenerations: TidiaoCorrectionLoopResult['regenerations']
      escalation: TidiaoCorrectionLoopResult['escalation']
      askUser: TidiaoCorrectionLoopResult['askUser']
      narrationCreations: TidiaoCorrectionLoopResult['narrationCreations']
      reprojectTargets: TidiaoCorrectionLoopResult['reprojectTargets']
      chatAnswer: string
      directorStream: TidiaoDirectorStream | null
    }

/** 模块级外部轮互斥标记：同一时刻至多一条外部装配轮（单例边界·并发第二发拒绝）。 */
let activeExternalRun = false

export function createTidiaoSessionCorrectionRunner(deps: TidiaoSessionCorrectionRunnerDeps) {
  async function runCorrectionForSession(input: TidiaoSessionCorrectionRunInput): Promise<TidiaoSessionCorrectionRunResult> {
    const sessionId = String(input.sessionId || '').trim()
    const instruction = String(input.instruction || '').trim()
    if (!sessionId) return { ok: false, busy: false, message: '缺少会话 id，无法装配提调纠偏。' }
    // 单例守门：聊天提调轮在跑 / 已有外部轮在跑 → 拒绝装配（不抢 activeAgentAppendLog / 导演带单例）。
    if (deps.hasRunningChatRound()) {
      return { ok: false, busy: true, message: '提调正忙：当前有聊天回复/提调轮在跑，等它结束后再下发。' }
    }
    if (activeExternalRun) {
      return { ok: false, busy: true, message: '提调正忙：已有一条外部下发的提调轮在跑，等它结束后再下发。' }
    }
    activeExternalRun = true
    let runId = ''
    // 停止统一（2026-07-06）：外部轮自建 controller——登记进聊天任务列表后，输入框停止按钮据此点亮、
    // abortChat「停止一切」直接 abort 本轮；调用方 signal（若有）链到同一 controller，两个停止入口收敛为一个 signal。
    const controller = new AbortController()
    const onCallerAbort = () => controller.abort()
    if (input.signal?.aborted) controller.abort()
    else input.signal?.addEventListener('abort', onCallerAbort, { once: true })
    let dispatchTaskRun: { complete: () => void; fail: (error: unknown) => void; stop: () => void } | null = null
    try {
      // ① 按 sessionId 取会话快照（任意会话·不依赖 UI 活动会话）。
      const bundle = await fetchChatSessionBundleById(sessionId)
      const session = (bundle?.session || null) as unknown as Record<string, unknown> | null
      const messages = (Array.isArray(bundle?.messages) ? bundle.messages : []) as unknown as Array<Record<string, unknown>>
      if (!session) return { ok: false, busy: false, message: `没有找到会话 ${sessionId}。` }
      const targetId = resolveChatSessionTargetId(session as never)
      const source: TidiaoCorrectionSessionSource = {
        sessionId,
        targetId,
        // 会话成员随 bundle.participants 回传，归一入口读 session.participants——补挂供装配核心解析候选。
        session: { ...session, ...(Array.isArray(bundle?.participants) ? { participants: bundle.participants } : {}) },
        messages,
        // 外部装配无 charStore 活体：候选回退链里群成员表/角色名兜底降级为空（会话成员在场时口径与聊天内一致）。
        groups: [],
        characters: []
      }
      // ② 装配核心阶段1（与聊天内入口同一份真值）。
      const assembly = await assembleTidiaoCorrectionContexts(source, { targetMessageId: Number(input.targetMessageId || 0) })
      if (!assembly) {
        return { ok: false, busy: false, message: '没有定位到要纠偏的消息（楼层未命中且无活动轮可重定向）。' }
      }
      // ③ 锚与容器接管（阶段2·七验时序在装配核心内保证）。
      const anchorMessageId = assembly.continuationAnchor || assembly.targetRoundAnchorMessageId || Number(input.targetMessageId || 0)
      const userName = String(deps.readUserAddressName?.() || '').trim() || '用户'
      const containers = await beginTidiaoCorrectionRunContainers({
        sessionId,
        anchorMessageId,
        activeRoundBaselineEligible: assembly.activeRoundBaselineEligible,
        targetMessage: assembly.targetMessage,
        baselineMessageId: assembly.effectiveTargetId || Number(input.targetMessageId || 0),
        correctionText: instruction,
        userName,
        fallbackSpeakerName: assembly.targetRead?.speakerName || ''
      })
      runId = containers.runId
      // 登记聊天任务（依赖不注入=不登记·旧行为）：从这里起输入框停止按钮点亮，收尾/失败/停止在下方各路径闭合，
      // 兜底见外层 finally（成功/停止后 fail 由装配方按 isChatTaskRunActive 守门自然 no-op）。
      dispatchTaskRun = deps.registerChatTaskRun?.({
        label: '提调纠偏',
        targetId,
        sessionId,
        abortController: controller
      }) || null
      // ④ 决策流持久化（与聊天内同一工厂·attempt/artifact 现役通道）。
      const persist = createDirectorStreamPersist({
        startAttempt: (attempt) => startChatGenerationAttempt({
          ...attempt,
          speakerName: String(attempt.speakerName || '').trim() || targetName,
          onError: (error) => console.error('保存生成尝试失败（外部装配）:', error)
        }),
        finishAttempt: (attempt) => finishChatGenerationAttempt({
          ...attempt,
          onError: (error) => console.error('更新生成尝试失败（外部装配）:', error)
        }),
        resolveFinalizeSessionId: () => sessionId
      })
      const persistUserInstruction = String(input.userInstruction ?? instruction ?? '').trim()
      const targetName = String(deps.getTargetName?.(targetId) || '').trim() || targetId
      // 消耗溯源：外部轮全程（含嵌入等嵌套调用）并入锚定轮总账；finally 统一清，防串到后续无关调用。
      setCurrentAiUsageContext({
        sessionId,
        sessionLabel: targetName,
        roundId: buildChatTurnRoundId(sessionId, anchorMessageId),
        unitKind: 'correction'
      })
      const promptRebuild = input.promptRebuild !== false
      const bandMemory = buildTidiaoCorrectionBandMemory({
        runId,
        promptRebuild,
        directorCarryOver: containers.directorCarryOver
      })
      const agentContextBlock = String(await deps.loadAgentContextBlock?.({ sessionId, agentKind: 'tidiao' }) || '').trim()
      const sceneContext = agentContextBlock
        ? ''
        : readSessionCurtainSceneContext(source.session, deps.readCurtainDefaults?.() || {})
      const persistIncremental = (flush: boolean) => persist.persistDirectorStreamRoundIncremental({
        runId,
        sessionId,
        targetId,
        anchorRoundMessageId: anchorMessageId,
        speakerName: containers.roundSpeakerName,
        snapshot: captureTidiaoDirectorStreamSnapshot(runId),
        flush,
        userInstruction: persistUserInstruction
      })
      const envelopeTracker = createRequestEnvelopeDiagnosticTracker()
      try {
        // ⑤ 启动纠偏 loop（callModel 口径与聊天内一致：orchestration 用途 + deferred toolsearch 越权话术）。
        const result = await runTidiaoCorrectionLoop({
          brief: { instruction, targets: assembly.targets },
          ...(agentContextBlock
            ? { agentContextBlock }
            : {
                ...(assembly.visibleHistory ? { visibleHistory: assembly.visibleHistory } : {}),
                ...(sceneContext ? { sceneContext } : {}),
                ...(assembly.lastScenarioBlock.trim() ? { lastScenarioBlock: assembly.lastScenarioBlock } : {})
              }),
          ...(bandMemory ? { bandMemory } : {}),
          ...(assembly.directorPref ? { directorPref: assembly.directorPref } : {}),
          readContext: assembly.readContext,
          editContext: assembly.editContext,
          promptContext: assembly.promptContext,
          projectionContext: assembly.projectionContext,
          // 状态系统接缝（批次5·2026-07-08）：外部装配轮同样可改状态栏（与聊天内纠偏/统筹同接缝·联动能力）。
          statusSeam: buildTidiaoStatusSystemSeam(sessionId),
          promptRebuild,
          signal: controller.signal,
          onDirectorStream: (stream) => {
            updateTidiaoDirectorStreamRound(runId, stream)
            void persistIncremental(false)
            input.onDirectorStream?.(stream)
          },
          ...(input.onEditCommitted ? { onEditCommitted: input.onEditCommitted } : {}),
          callModel: async ({
            messages: loopMessages,
            activeTools,
            toolBriefs,
            toolCatalog,
            turnIndex,
            toolEpoch,
            toolEpochTurnIndex
          }) => {
            if (controller.signal.aborted) {
              const error = new Error('生成已停止')
              error.name = 'AbortError'
              throw error
            }
            const sentMessages = withToolsearchOverrideProtocol(loopMessages, toolCatalog, {
              fullAuthorizedToolsLoaded: toolEpoch >= 1
            })
            const tools = toOpenAiTools(toolBriefs)
            const modelOptions = buildTaskModelAiOptions(deps.loadAgentConfig() as never, 'directorLoop', {
              maxTokens: 1200,
              temperature: 0.3,
              thinking: 'disabled'
            })
            const diagnostics = envelopeTracker.capture({
              model: {
                presetName: modelOptions.presetName,
                model: modelOptions.model,
                modelUsageSlotId: modelOptions.modelUsageSlotId
              },
              tools,
              toolChoice: 'auto',
              thinking: modelOptions.thinking,
              messages: sentMessages,
              activeToolNames: activeTools
            })
            const result = await deps.callAIWithTools(sentMessages as Array<{ role: string; content: string }>, {
              ...modelOptions,
              tools,
              feature: 'agent',
              logLabel: 'tidiao-correction',
              usageLabel: `提调纠偏（外部装配）：${targetName}`,
              placeLabel: `会话：${targetName}`,
              placeType: 'single',
              profileId: 'tidiao.correction',
              harnessRunId: runId,
              modelTurnIndex: turnIndex,
              toolEpoch,
              toolEpochTurnIndex,
              promptRebuild,
              ...diagnostics,
              signal: controller.signal
            })
            return { content: result?.content ?? '', toolCalls: result?.toolCalls ?? [] }
          }
        })
        // ⑥ 收尾：flush 末态决策流 + 收 attempt；结果原样带回（askUser/escalate 由调用方定夺·批次3b 协议）。
        await persistIncremental(true)
        persist.finalizeDirectorStreamPersist(runId)
        dispatchTaskRun?.complete()
        return {
          ok: true,
          runId,
          anchorMessageId,
          strategy: result.strategy,
          edits: result.edits,
          promptEdits: result.promptEdits,
          regenerations: result.regenerations,
          escalation: result.escalation,
          askUser: result.askUser,
          narrationCreations: result.narrationCreations,
          reprojectTargets: result.reprojectTargets,
          chatAnswer: String(result.chatAnswer || ''),
          directorStream: captureTidiaoDirectorStreamSnapshot(runId)
        }
      } catch (err) {
        // 真错误把带停在 failed 态并 flush 落库（与聊天内入口同口径）。
        if (err instanceof Error && err.name === 'AbortError') {
          // 停止=中断保留（2026-07-08 用户拍板·与聊天内五停止点同口径）：有决策内容→带转 correcting 挂起 +
          // flush 落库（刷新可复原·可「继续」接续）；无内容→旧口径清带降权。
          if (captureTidiaoDirectorStreamSnapshot(runId)) {
            markTidiaoDirectorStreamRoundCorrecting(runId, '')
            await persistIncremental(true)
            persist.finalizeDirectorStreamPersist(runId)
            dispatchTaskRun?.stop()
            return { ok: false, busy: false, message: '外部提调轮已停止（已生成内容已保留，可输入「继续」接续）。' }
          }
          clearTidiaoDirectorStreamRound(runId)
          persist.demoteDirectorStreamPersist(runId)
          dispatchTaskRun?.stop()
          return { ok: false, busy: false, message: '外部提调轮已停止。' }
        }
        markTidiaoDirectorStreamRoundFailed(runId, err instanceof Error ? err.message : '提调纠偏失败')
        await persistIncremental(true)
        persist.finalizeDirectorStreamPersist(runId)
        dispatchTaskRun?.fail(err)
        throw err
      }
    } finally {
      input.signal?.removeEventListener('abort', onCallerAbort)
      // 泄漏兜底：正常路径 complete/stop/fail 已收；若装配段中途抛错没走到收尾，这里把仍 running 的任务标失败
      //（装配方按 isChatTaskRunActive 守门，已收尾的调用是 no-op），防止停止按钮永远亮着。
      dispatchTaskRun?.fail(new Error('外部提调轮未正常收尾'))
      clearCurrentAiUsageContext()
      activeExternalRun = false
    }
  }

  return { runCorrectionForSession }
}

/** 仅测试用：复位外部轮互斥标记（异常路径已在 finally 复位，这里兜住测试串场）。 */
export function __resetTidiaoSessionCorrectionRunnerForTest(): void {
  activeExternalRun = false
}
