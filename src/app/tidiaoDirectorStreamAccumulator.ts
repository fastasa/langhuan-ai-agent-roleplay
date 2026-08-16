// 提调真·导演 loop：把 harness/runAgentRuntime 的实时 loop 信号折叠成轮级流式载体（子批1 契约）。
//
// 定位（2026-06-19 真导演 loop 重构计划书 第一刀·子批2）：
// runAgentRuntime 的 onProgress 已按 turn 实时上抛三类信号——
//   - thought：每轮模型产出的一句话级人话决策（导演口吻协议下 = 一步导演决策）
//   - tool-start / tool-result：工具调用的开始 / 结束（工具条 running → done/error）
// 本累加器是 harness 层的「适配器」：消费这些信号，维护可变内部模型，按子批1 的
// buildTidiaoDirectorStream 折叠出完整 TidiaoDirectorStream，并在每次变化时整份上抛
// （整份快照而非增量事件——可变工具状态 running→done 用追加事件表达不了，整份替换最干净、对前端响应式友好）。
//
// 边界：本累加器只做「真实 loop 信号 → 决策流/分镜」的结构映射，不臆造内容；
// thought 文本即模型真产出（人话决策由导演口吻系统协议保证），工具条只标 工具名→中文标签 + 状态。
// 旁白在单聊仍是独立 subagent，未纳入 loop（§F 后续批次），故子批2 不挂旁白镜。

import type { AgentRuntimeProgressEvent } from './agentRuntime/runtime'
import type { PersonalityNarrationCall } from './personalityNarrationSubagent'
import { appendDecisionEvent } from './agentState/appendLog'
import {
  buildTidiaoDirectorStream,
  type BuildTidiaoDirectorStreamOptions,
  type TidiaoDecisionEntry,
  type TidiaoDecisionKind,
  type TidiaoDirectorStream,
  type TidiaoStreamEvent,
  type TidiaoStreamShotInput,
  type TidiaoStreamTool
} from './tidiaoDirectorStream'

/** runtime stage → 决策流条目语义类型。stage 无法定性时按 thought 关键词兜底。 */
export function directorKindFromStage(stage: string, text = ''): TidiaoDecisionKind {
  switch (stage) {
    case 'scenario-routing':
      return 'situation'
    case 'plan-generation':
      return 'generate'
    case 'plan-review':
      return 'review'
    case 'manual-reading':
      return 'note'
    // O-C2 旁白两件套：读旁白 skill / 定旁白方向 都归「定旁白方向」决策类型。
    case 'narration-skill-read':
    case 'narration-routing':
      return 'narrationDir'
    default:
      // 自动评审收束轮 stage 为 unknown，靠文本关键词点亮「评审」。
      if (/评审|挑.*最优|ReRanker/i.test(text)) return 'review'
      if (/旁白/.test(text)) return 'narrationDir'
      return 'note'
  }
}

/** 工具机器名 → 工具条中文展示名（与编排带其它处中文标签对齐）。 */
const TOOL_LABELS: Record<string, string> = {
  readScenarioSkill: '读取情境',
  getToolManual: '查工具手册',
  updateCurtainScene: '调整时间地点',
  generatePlanBatch: '生成候选计划',
  reviewPlanCandidates: '评审挑最优',
  recallSemantic: '语义召回',
  searchWorldText: '文本搜索',
  fetchUnitDetail: '定点读取',
  readChatMessage: '读会话消息',
  readMessageProjection: '读投影',
  editChatMessage: '精修消息',
  appendChatMessage: '补写消息',
  // P2 纠偏三策：中策读/改提示词 + 据新提示词重生成 + 下策升级重排
  readMessagePrompt: '读消息提示词',
  editMessagePrompt: '改消息提示词',
  regenerateFromPrompt: '据提示词重生成',
  escalateCorrection: '升级重排',
  // 提问工具：面向所有用户，不写「问用户」。问题正文走「正常文字」（见 attachTool 提升为决策正文），不挤工具条灰字。
  askUser: '提问',
  // O-C2 旁白两件套
  readNarrationSkill: '读旁白skill',
  confirmNarrationCall: '定旁白方向'
}

export function directorToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName
}

interface AccDecision {
  id: string
  turnIndex: number
  kind: TidiaoDecisionKind
  text: string
  tool?: TidiaoStreamTool
  shot?: TidiaoStreamShotInput
}

export interface TidiaoDirectorStreamAccumulatorOptions {
  /** 单聊单角色出场者名：生成步给该角色挂一镜（方向取该步决策文本）。缺省不挂角色镜。 */
  characterName?: string
  /** 预置分镜（M3 精修）：loop 启动即把本轮要精修的目标消息挂成镜（始终可见、决策随之展开）。
   *  与生成步自动挂角色镜互斥使用——精修 loop 无 generatePlanBatch、不传 characterName。 */
  initialShots?: TidiaoStreamShotInput[]
  /** 每次内部状态变化时回调，参数为整份重建的轮级流式载体快照。 */
  onStream?: (stream: TidiaoDirectorStream) => void
}

export interface TidiaoDirectorStreamAccumulator {
  /** 消费 runtime 进度事件（thought / tool-start / tool-result / notice）。 */
  onRuntimeProgress: (event: AgentRuntimeProgressEvent) => void
  /** 实时更新角色镜方向（批次H/遗留3）：用 loop「定角色方向」步的结构化方向（generatePlanBatch.planPrompt）
   *  覆盖挂镜时的占位文本，纠正「分镜方向借生成步 thought 文本」的牛头不对马嘴；只认首个权威方向。 */
  noteCastDirection: (direction: string) => void
  /** 实时更新旁白镜（O-C3）：confirmNarrationCall 确认成功后，用该条旁白决策（generatedPrompt 方向 + 二分类）
   *  补全挂镜时的旁白镜——按确认顺序对应到第 N 个旁白镜（支持一轮多条旁白）。harness 在 execute 成功后调用。 */
  noteNarrationShot: (call: PersonalityNarrationCall) => void
  /** 收束补一条无镜决策（群聊导演 E1）：整轮剧本的 thoughts 旁述在收束时逐条补进决策流（唯一一份）。
   *  与 onRuntimeProgress 的 per-turn thought 互补——loop 期实时吐 grounding 旁述，收束补计划旁述。 */
  noteDecision: (kind: TidiaoDecisionKind, text: string) => void
  /** 批次4·A 前置决策：loop 启动前先 seed 一条决策（如开局并行召回），带可选工具条；排在决策流最前、
   *  随后 loop 决策追加其后。每次 emit 都从 decisions[] 整份重建，故 seed 的前置决策不会被 loop 快照覆盖。 */
  seedDecision: (input: { kind: TidiaoDecisionKind; text: string; tool?: TidiaoStreamTool }) => void
  /** 收束补一面独立分镜（群聊导演 E1）：整轮剧本的 cast/旁白安排在收束时补成分镜（角色镜带方向/旁白镜）。
   *  与单聊「生成步挂单角色镜」互补——群聊整轮多角色镜由本入口补。 */
  addShot: (shot: TidiaoStreamShotInput) => void
  /** reviseCastDirection：改一个已挂角色镜（extraShots 里按 label 找）的方向 + 追加一条人话决策记录改动。
   *  找不到该角色镜（未曾 addShot 过）时安静忽略——校验已在工具 execute 层做过，这里只管镜面更新。 */
  reviseCastShotDirection: (label: string, newDirection: string, reason: string) => void
  /** reviseNarrationDirection：改第 index 面旁白镜（decisions 里按 kind:'narration' 出现顺序取第 index 个，
   *  与 confirmNarrationCall 挂镜顺序、noteNarrationShot 补全顺序同一套编号）的方向 + 追加一条人话决策。
   *  下标越界时安静忽略（校验已在工具 execute 层做过）。 */
  reviseNarrationShotDirection: (index: number, newDirection: string, reason: string) => void
  /** 显式收束相位（成功收尾 → 'done'）。 */
  setPhase: (phase: 'done' | 'running') => void
  /** 失败收束。 */
  fail: (reason?: string) => void
  /** 当前整份快照。 */
  snapshot: () => TidiaoDirectorStream
}

/**
 * 创建导演流累加器。harness 在 onProgress 里逐事件喂入；内部维护可变决策/工具/分镜，
 * 每次变化按子批1 builder 折叠并整份上抛。
 */
export function createTidiaoDirectorStreamAccumulator(
  options: TidiaoDirectorStreamAccumulatorOptions = {}
): TidiaoDirectorStreamAccumulator {
  const characterName = String(options.characterName || '').trim()
  // 预置分镜（M3 精修）：作为 toEvents 的前导 shot 事件，loop 一启动这些目标镜就可见。
  const initialShots: TidiaoStreamShotInput[] = Array.isArray(options.initialShots) ? options.initialShots : []
  // 收束补的整轮分镜（群聊导演 E1）：决策之后追加为 shot 事件，构成本轮 cast/旁白镜阵列。
  const extraShots: TidiaoStreamShotInput[] = []
  const decisions: AccDecision[] = []
  /** running 中、尚未收到结果的工具，FIFO 按 toolName 匹配收口。 */
  const pendingTools: TidiaoStreamTool[] = []
  let phase: 'done' | 'running' | null = null
  let failReason: string | undefined
  let failed = false
  let charShotAttached = false
  /** 角色镜权威方向是否已写入（noteCastDirection 只认首个，避免多 strategy 互相覆盖）。 */
  let castDirectionNoted = false
  /** 已被 noteNarrationShot 补全的旁白镜数量：按确认顺序对应第 N 个旁白镜（支持一轮多条旁白）。 */
  let narrationNotedCount = 0
  let seq = 0
  /** R3-3：决策已 flush 进 append log 的标志（收束时一次性，防 done/fail 双触发重复 append）。 */
  let decisionsFlushedToLog = false

  const last = (): AccDecision | undefined => decisions[decisions.length - 1]

  /** R3-3「directorStream 是 log 投影」：收束时把最终人话决策 flush 进 append log（保真源）。
   *  跳过纯工具行占位决策（text 等于工具标签、无独立人话）——其结果已由 toolResult 事件保真，避免噪声重复。
   *  无活动 append log（未 beginAppendLog，如单测）时 appendDecisionEvent 自动空操作，零副作用。 */
  function flushDecisionsToLog(): void {
    if (decisionsFlushedToLog) return
    decisionsFlushedToLog = true
    for (const d of decisions) {
      const text = String(d.text || '').trim()
      if (!text) continue
      if (d.tool && text === d.tool.label) continue
      const entry: TidiaoDecisionEntry = { id: d.id, kind: d.kind, text, ...(d.tool ? { tool: d.tool } : {}) }
      appendDecisionEvent('', entry)
    }
  }

  function toEvents(): TidiaoStreamEvent[] {
    // 前导：预置目标镜（精修 loop 启动即可见）。
    const events: TidiaoStreamEvent[] = initialShots.map((shot) => ({ type: 'shot' as const, ...shot }))
    events.push(...decisions.map((d) => ({
      type: 'decision' as const,
      kind: d.kind,
      text: d.text,
      id: d.id,
      ...(d.tool ? { tool: d.tool } : {}),
      ...(d.shot ? { shot: d.shot } : {})
    })))
    // 收束补的整轮分镜：排在决策之后（不绑定某条决策），构成本轮 cast/旁白镜阵列。
    events.push(...extraShots.map((shot) => ({ type: 'shot' as const, ...shot })))
    if (phase) events.push({ type: 'phase', phase })
    if (failed) events.push({ type: 'fail', ...(failReason ? { reason: failReason } : {}) })
    return events
  }

  function build(opts: BuildTidiaoDirectorStreamOptions = {}): TidiaoDirectorStream {
    return buildTidiaoDirectorStream(toEvents(), opts)
  }

  function emit(): void {
    options.onStream?.(build())
  }

  function pushDecision(turnIndex: number, kind: TidiaoDecisionKind, text: string): void {
    seq += 1
    decisions.push({ id: `decision_${seq}`, turnIndex, kind, text })
  }

  function attachTool(turnIndex: number, stage: string, toolName: string, detail?: string): void {
    const label = directorToolLabel(toolName)
    const target = last()
    // 没有本轮决策（本轮无 thought），或上一条已挂过工具 → 新起一条「工具行」决策。
    if (!target || target.turnIndex !== turnIndex || target.tool) {
      pushDecision(turnIndex, directorKindFromStage(stage, label), label)
    }
    const detailText = String(detail || '').trim()
    // 提问（askUser）：问题作为「正常文字」输出，不挤进工具条灰字 detail——
    // 把问题提升为本条决策正文（已有 thought 则接在其后），决策类型按「对话」语义（气泡图标）；工具条只留「提问」标签。
    const isAskUser = toolName === 'askUser'
    if (isAskUser && detailText) {
      const decision = last()!
      decision.text = decision.text && decision.text !== label ? `${decision.text}：${detailText}` : detailText
      decision.kind = 'correction'
    }
    const toolDetail = isAskUser ? '' : detailText
    const tool: TidiaoStreamTool = { tool: toolName, label, status: 'running', ...(toolDetail ? { detail: toolDetail } : {}) }
    last()!.tool = tool
    pendingTools.push(tool)
    // 生成步：给单聊出场角色挂一镜，方向取该步决策文本（导演口吻下即「让该角色怎么演」）。
    if (toolName === 'generatePlanBatch' && characterName && !charShotAttached) {
      const decision = last()!
      decision.shot = {
        kind: 'character',
        label: characterName,
        ...(decision.text ? { direction: decision.text } : {})
      }
      charShotAttached = true
    }
    // O-C2/O-C3 定旁白方向步：挂一面旁白镜，方向先取该步导演人话（非工具行标签时），
    // 二分类与权威方向随后由 noteNarrationShot 用确认的 generatedPrompt/informationBearing 补全。支持一轮多条旁白。
    if (toolName === 'confirmNarrationCall') {
      const decision = last()!
      const directionText = decision.text && decision.text !== label ? decision.text : ''
      decision.shot = {
        kind: 'narration',
        label: '旁白',
        ...(directionText ? { direction: directionText } : {})
      }
    }
  }

  function resolveTool(
    toolName: string,
    status?: string,
    resultPreview?: string,
    errorMessage?: string,
    retried?: boolean
  ): void {
    const index = pendingTools.findIndex((tool) => tool.tool === toolName)
    const tool = index >= 0 ? pendingTools.splice(index, 1)[0] : pendingTools.shift()
    if (!tool) return
    const isError = status === 'error' || status === 'blocked'
    tool.status = isError ? 'error' : 'done'
    if (isError) {
      // 错误条 / 重试条：失败即如实标出原因；hook 触发重试时标「重试中」与「死失败」区分（报错也输出、重试也输出）。
      const message = String(errorMessage || '').trim()
      tool.resultPreview = retried
        ? (message ? `${message} · 重试中` : '出错了，重试中…')
        : (message || '执行失败')
      // 2026-07-04 真机修：confirmNarrationCall 挂镜在 tool-start（实时感），失败必须摘镜——
      // 否则被参数校验退回的尝试会留下幽灵旁白镜（真机复现：两次退回=分镜列两面空旁白镜）。
      if (toolName === 'confirmNarrationCall') {
        const owner = decisions.find((decision) => decision.tool === tool && decision.shot?.kind === 'narration')
        if (owner) delete owner.shot
      }
    } else {
      const preview = String(resultPreview || '').trim()
      if (preview) tool.resultPreview = preview
    }
  }

  return {
    onRuntimeProgress(event: AgentRuntimeProgressEvent): void {
      // 已失败/中止后保持惰性：abort 是异步的，旁白/工具的 in-flight 回调可能在 fail() 之后才落地，
      // 若继续 mutate+emit 会把已 failed/correcting 的快照拍回半成品 running 形、并重造重复 id 的 shots
      // 数组（喂给编排带 :key 崩溃）。与 setPhase 同口径，fail() 后所有写入入口一律早返回。
      if (failed) return
      if (event.kind === 'thought') {
        const text = String(event.thought || '').trim()
        if (!text) return
        pushDecision(event.turnIndex, directorKindFromStage(event.stage, text), text)
      } else if (event.kind === 'tool-start') {
        attachTool(event.turnIndex, event.stage, event.toolName, event.detail)
      } else if (event.kind === 'tool-result') {
        resolveTool(event.toolName, event.status, event.resultPreview, event.errorMessage, event.retried)
      } else if (event.kind === 'notice') {
        // 运行时通告（被 hook 中止 / 超预算收尾）：如实追加一条人话决策，不当工具条。
        const text = String(event.thought || '').trim()
        if (!text) return
        pushDecision(event.turnIndex, 'note', text)
      } else {
        return
      }
      emit()
    },
    noteCastDirection(direction: string): void {
      if (failed) return
      const text = String(direction || '').trim()
      if (!text || castDirectionNoted) return
      // 找到挂着角色镜的那条决策，把镜方向覆盖为权威方向（实时更新镜）。
      const target = decisions.find((d) => d.shot?.kind === 'character')
      if (!target?.shot) return
      target.shot = { ...target.shot, direction: text }
      castDirectionNoted = true
      emit()
    },
    noteNarrationShot(call: PersonalityNarrationCall): void {
      if (failed) return
      // 按确认顺序对应第 narrationNotedCount 个旁白镜（attachTool 已按 confirm 顺序挂镜）。
      const narrationDecisions = decisions.filter((d) => d.shot?.kind === 'narration')
      const target = narrationDecisions[narrationNotedCount]
      if (!target?.shot) return
      narrationNotedCount += 1
      const direction = String(call?.generatedPrompt || '').trim()
      target.shot = {
        ...target.shot,
        // 二分类标注（信息承载/纯描写）：旁白镜据此显示徽标。
        ...(typeof call?.informationBearing === 'boolean' ? { informationBearing: call.informationBearing } : {}),
        // 占位方向（导演人话）缺失时，用确认的 generatedPrompt 补一个方向；已有人话方向则保留更可读的人话。
        ...(!target.shot.direction && direction ? { direction } : {})
      }
      emit()
    },
    noteDecision(kind: TidiaoDecisionKind, text: string): void {
      if (failed) return
      const t = String(text || '').trim()
      if (!t) return
      // turnIndex 用 -1 哨兵（非真实轮）：收束补的决策不参与 attachTool 的「本轮决策」匹配。
      seq += 1
      decisions.push({ id: `decision_${seq}`, turnIndex: -1, kind, text: t })
      emit()
    },
    seedDecision(input: { kind: TidiaoDecisionKind; text: string; tool?: TidiaoStreamTool }): void {
      if (failed) return
      const t = String(input?.text || '').trim()
      if (!t) return
      // turnIndex -1 哨兵（非真实轮）：seed 决策不参与 attachTool 的「本轮决策」匹配。
      seq += 1
      decisions.push({ id: `decision_${seq}`, turnIndex: -1, kind: input.kind, text: t, ...(input.tool ? { tool: input.tool } : {}) })
      emit()
    },
    addShot(shot: TidiaoStreamShotInput): void {
      if (failed) return
      if (!shot || !shot.label) return
      extraShots.push(shot)
      emit()
    },
    reviseCastShotDirection(label: string, newDirection: string, reason: string): void {
      if (failed) return
      const shot = extraShots.find((s) => s.kind === 'character' && s.label === label)
      if (!shot) return
      shot.direction = newDirection
      const text = reason ? `改 ${label} 的本轮方向：${reason}` : `改 ${label} 的本轮方向。`
      seq += 1
      decisions.push({ id: `decision_${seq}`, turnIndex: -1, kind: 'castDir', text })
      emit()
    },
    reviseNarrationShotDirection(index: number, newDirection: string, reason: string): void {
      if (failed) return
      const narrationDecisions = decisions.filter((d) => d.shot?.kind === 'narration')
      const target = narrationDecisions[index]
      if (!target?.shot) return
      target.shot = { ...target.shot, direction: newDirection }
      const label = narrationDecisions.length > 1 ? `旁白${index + 1}` : '旁白'
      const text = reason ? `改${label}方向：${reason}` : `改${label}方向。`
      seq += 1
      decisions.push({ id: `decision_${seq}`, turnIndex: -1, kind: 'narrationDir', text })
      emit()
    },
    setPhase(next: 'done' | 'running'): void {
      if (failed) return
      phase = next
      // R3-3：成功收束即把最终决策 flush 进 append log（保真源），供后续轮投影/检索读回。
      if (next === 'done') flushDecisionsToLog()
      emit()
    },
    fail(reason?: string): void {
      failed = true
      failReason = String(reason || '').trim() || undefined
      // R3-3：失败收束同样 flush 已做决策（失败前的尝试是有用上下文）。
      flushDecisionsToLog()
      emit()
    },
    snapshot(): TidiaoDirectorStream {
      return build()
    }
  }
}
