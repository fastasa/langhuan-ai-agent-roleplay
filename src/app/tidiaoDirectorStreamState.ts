// 提调「真·导演 agent loop」轮级流式载体运行态（子批3：轮级流式载体接线）。
//
// 定位（2026-06-19 真导演 loop 重构计划书 第一刀·子批3）：
// 「一轮一条、loop 启动即建立、实时刷新」的轮级载体——挂在用户消息与角色正文之间。
// 与现役 per-message `_processTrace` 编排带（挂在角色流式消息上）并存、定位不同：
// - 本模块：loop 进行中的轮级载体，承载子批2 累加器整份上抛的 TidiaoDirectorStream 快照。
// - 子批4 的编排带 Vue 直接 import 本模块响应式状态渲染（决策流 + 并排实时分镜），并据 anchorMessageId 定位。
// - 子批5 端到端验收后再逐步退役旧 per-message band（见计划书 §8 处置清单）。
//
// 边界（子批3 范围）：只承载单聊单角色的真 loop 快照；群聊多角色（§9 批次 D）后续接。
// 本模块不渲染、不落库——历史复原仍走旧 directorScript/tidiaoBandModel（子批1 收尾已说明）。

import { ref } from 'vue'
import {
  emptyTidiaoDirectorStream,
  type TidiaoDecisionEntry,
  type TidiaoDirectorReplanBrief,
  type TidiaoDirectorStream,
  type TidiaoStreamShot
} from './tidiaoDirectorStream'

/** 批次J·跨续跑保留基线：纠偏继续时把上一轮的决策流/分镜作为基线保留，新一轮决策/镜追加其后。 */
export interface TidiaoDirectorCarryOver {
  decisions: TidiaoDecisionEntry[]
  shots: TidiaoStreamShot[]
  /** 提调坞·总耗时统计：上一段（统筹/上次纠偏）已冻结的耗时，续跑起步时叠进新一段的 startedAt 偏移，
   *  让「本轮总耗时」= 各活跃运行段耗时相加，不含用户思考间隔。缺省 0（无可继承耗时）。 */
  priorElapsedMs?: number
}

/** 把保留基线（旧决策/旧镜）与新一轮快照合并：旧决策在前、新决策追加在后。
 *  分镜按「种类+角色名」去重（修 #2）：续跑时新一轮会给同一角色重新挂镜，直接拼接会让
 *  「一个角色裂成两个分镜」。同一镜只保留一条、用新一轮方向覆盖旧方向，order 顺序重排。 */
function mergeCarryOver(carryOver: TidiaoDirectorCarryOver, stream: TidiaoDirectorStream): TidiaoDirectorStream {
  const shotKey = (shot: TidiaoStreamShot) => `${shot.kind} ${shot.characterId || shot.label}`
  const mergedShots: TidiaoStreamShot[] = carryOver.shots.map((shot) => ({ ...shot }))
  const indexByKey = new Map<string, number>()
  mergedShots.forEach((shot, i) => indexByKey.set(shotKey(shot), i))
  for (const shot of stream.shots) {
    const key = shotKey(shot)
    const existing = indexByKey.get(key)
    if (existing !== undefined) {
      // 同一角色/旁白：新一轮方向覆盖旧镜方向（其余保留旧镜，避免重复一镜）。
      const direction = String(shot.direction || '').trim()
      if (direction) mergedShots[existing] = { ...mergedShots[existing], direction }
    } else {
      indexByKey.set(key, mergedShots.length)
      mergedShots.push({ ...shot })
    }
  }
  return {
    ...stream,
    decisions: [...carryOver.decisions, ...stream.decisions],
    // id 必须与 order 一起重排：新旧两轮的 shots 各自从 shot_1 起编号，直接拼接会留下重复 id，
    // 编排带 `:key="shot.id"` 遇重复 key → Vue patch 错节点、流式追加时渲染崩白屏（停止→纠偏→重跑命中）。
    shots: mergedShots.map((shot, i) => ({ ...shot, id: `shot_${i + 1}`, order: i + 1 }))
  }
}

/** 轮级流式载体运行态：一轮一条，承载本轮提调 loop 的实时快照 + 定位锚点。 */
export interface TidiaoDirectorStreamRound {
  /** 轮级主键（与 activePipelineTidiaoRunId 同源，便于按 runId 对齐审计/去抖更新）。 */
  runId: string
  /** 会话 ID（子批4 切会话时据此过滤显示，避免跨会话串台）。 */
  sessionId: string
  /** 载体锚点：挂在这条用户消息之后、角色正文之前（子批4 据此定位）。0 表示锚点未知。 */
  anchorMessageId: number
  /** 出场角色名（单聊单角色）。 */
  speakerName: string
  /** 当前整份快照（决策流 + 并排实时分镜 + 相位/动作）。 */
  stream: TidiaoDirectorStream
  /** 批次I·召回入口：本轮召回活动 run id（取料/压缩上下文召回完成后写入）。
   *  有值时 band 显示「召回」入口，点击 showRecallActivityRunInPanel 定位到该次召回侧栏。 */
  recallRunId?: string
  /** 批次I·编排入口：本轮编排审计运行态 payload（含 orchestration/topPlans/expressionMix）。
   *  loop 期无消息 messageId，故按 runId 把运行态编排折叠到轮上；有值时 band 显示「编排」入口，
   *  点击把本 payload 喂给既有审计面板（runtime-orchestration 入参）直接渲染，复用面板呈现逻辑。 */
  orchestrationAudit?: Record<string, unknown>
  /** 批次J·跨续跑保留基线：纠偏继续时挂上一轮的决策流/分镜，update 时合并到 stream 前段（旧决策不消失、新决策追加）。 */
  carryOver?: TidiaoDirectorCarryOver
  /** 提调坞·总耗时统计起点（epoch ms）：本段开始时刻，续跑段据 carryOver.priorElapsedMs 提前偏移，
   *  使「本轮总耗时」跨续跑累计、不含用户思考间隔。 */
  startedAt: number
}

/** 当前活动轮的流式载体；null = 无活动 director 轮（loop 未起 / 已被新轮清除）。 */
export const activeTidiaoDirectorStreamRound = ref<TidiaoDirectorStreamRound | null>(null)

/** 提调坞·耗时秒表 tick（500ms 自增）：只在活动轮相位非终态时跑，组件据此重算「实时耗时」。 */
export const tidiaoDirectorRoundTick = ref(0)
let tidiaoDirectorRoundTickTimer: ReturnType<typeof setInterval> | null = null

const TERMINAL_STREAM_PHASES = new Set(['done', 'failed'])

function syncTidiaoDirectorRoundTicker(): void {
  const phase = activeTidiaoDirectorStreamRound.value?.stream.phase
  const shouldTick = Boolean(phase) && !TERMINAL_STREAM_PHASES.has(String(phase))
  if (shouldTick && !tidiaoDirectorRoundTickTimer) {
    tidiaoDirectorRoundTickTimer = setInterval(() => { tidiaoDirectorRoundTick.value += 1 }, 500)
  } else if (!shouldTick && tidiaoDirectorRoundTickTimer) {
    clearInterval(tidiaoDirectorRoundTickTimer)
    tidiaoDirectorRoundTickTimer = null
  }
}

/** 冻结本轮总耗时：phase 到 done/failed 时 stamp 一次；已冻结过（previousElapsedMs 非空，取自「当前已存 stream」
 *  而非本次刚上抛的新快照——累加器每次都吐全新对象，自身绝不会带 roundElapsedMs）则原样保留，不被后续迟到 update 覆盖。 */
function stampRoundElapsedIfTerminal(
  stream: TidiaoDirectorStream,
  startedAt: number,
  previousElapsedMs: number | undefined
): TidiaoDirectorStream {
  if (typeof previousElapsedMs === 'number') return { ...stream, roundElapsedMs: previousElapsedMs }
  if (!TERMINAL_STREAM_PHASES.has(stream.phase)) return stream
  return { ...stream, roundElapsedMs: Math.max(0, Date.now() - startedAt) }
}

/** 提调坞·活动轮「实时耗时」（毫秒）：终态用冻结值，进行中据 startedAt + tick 现算。无活动轮返回 0。
 *  组件读取本函数前建立对 tidiaoDirectorRoundTick 的响应式依赖即可跟着秒表跳。 */
export function readActiveTidiaoDirectorRoundElapsedMs(): number {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return 0
  if (typeof current.stream.roundElapsedMs === 'number') return current.stream.roundElapsedMs
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  tidiaoDirectorRoundTick.value // 建立响应式依赖：秒表跳即重算
  return Math.max(0, Date.now() - current.startedAt)
}

/** 帷幕修改 UI 信号（2026-07-07 用户拍板「提调改帷幕要自动弹开提调坞」）：纯内存自增版本号。
 *  唯一写入漏斗 applyPersonalityCurtainSceneUpdate（统筹 2.5 校准/纠偏/人格编排三路共用）在 changed=true 时调
 *  noteCurtainSceneUpdated；TidiaoDirectorDock 监听它把坞强制弹开（与 failed/correcting 同「必须让人看见」语义），
 *  轮跑完仍由 phase→done 自动收起。不落任何存储。 */
export const curtainSceneUpdateSignal = ref(0)

export function noteCurtainSceneUpdated(): void {
  curtainSceneUpdateSignal.value += 1
}

/** loop 启动即建立：以空载体（phase idle）占位，未起也能显示「提调待命…」。同 runId 重入会重置为占位。 */
export function beginTidiaoDirectorStreamRound(input: {
  runId: string
  sessionId: string
  anchorMessageId: number
  speakerName: string
  /** 批次J·续跑保留基线：纠偏继续这一轮带上一轮决策/镜，新一轮决策追加其后；无则正常空载体起步。 */
  carryOver?: TidiaoDirectorCarryOver | null
}): void {
  const carryOver = input.carryOver && input.carryOver.decisions.length
    ? { decisions: [...input.carryOver.decisions], shots: [...input.carryOver.shots], priorElapsedMs: Math.max(0, Number(input.carryOver.priorElapsedMs || 0)) }
    : undefined
  const empty = emptyTidiaoDirectorStream()
  activeTidiaoDirectorStreamRound.value = {
    runId: String(input.runId || '').trim(),
    sessionId: String(input.sessionId || '').trim(),
    anchorMessageId: Number(input.anchorMessageId || 0) || 0,
    speakerName: String(input.speakerName || '').trim(),
    // 续跑起步即显示保留的旧决策（新一轮快照随 harness 实时 update 追加在后）。
    stream: carryOver ? mergeCarryOver(carryOver, empty) : empty,
    ...(carryOver ? { carryOver } : {}),
    // 续跑段总耗时叠加：起点提前偏移 priorElapsedMs，使秒表从「上一段已耗时」接着跳，不含中间思考间隔。
    startedAt: Date.now() - (carryOver?.priorElapsedMs || 0)
  }
  syncTidiaoDirectorRoundTicker()
}

/** 实时刷新：用累加器整份上抛的快照替换当前载体的 stream。
 *  runId 不匹配（已被新轮替换）时丢弃，避免迟到快照覆盖新轮。 */
export function updateTidiaoDirectorStreamRound(runId: string, stream: TidiaoDirectorStream): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  // 批次J：有保留基线时，把新一轮快照合并到旧决策/旧镜之后（旧决策不消失、新决策追加在最下面）。
  const merged = current.carryOver ? mergeCarryOver(current.carryOver, stream) : stream
  const stamped = stampRoundElapsedIfTerminal(merged, current.startedAt, current.stream.roundElapsedMs)
  activeTidiaoDirectorStreamRound.value = { ...current, stream: stamped }
  syncTidiaoDirectorRoundTicker()
}

/** 批次J·停止纠偏：把当前轮（含已合并的保留基线）相位覆盖为 correcting，半成品决策/镜停在原地、底栏出纠偏条。
 *  停止走 abort 时 harness 会先把载体刷成 failed，识别为纠偏暂停后调本函数纠正为 correcting（保留全部决策）。 */
export function markTidiaoDirectorStreamRoundCorrecting(runId: string, correctionText = ''): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  const text = String(correctionText || '').trim()
  activeTidiaoDirectorStreamRound.value = {
    ...current,
    stream: {
      ...current.stream,
      phase: 'correcting',
      currentAction: '已暂停 · 在下方输入框继续指挥提调',
      correction: text
    }
  }
}

/** 批次J·续跑保留基线：从当前活动轮取「全部决策 + 全部镜」，并在末尾追加一条 correction 决策，作为续跑这一轮的基线。
 *  current.stream 此刻已含上一轮的全部决策（多次续跑会自然累积）；decisions 剥除 streaming 标记，避免与新一轮末句重复打字。
 *  会话隔离（修问题①·跨会话串台）：传 expectedSessionId 时，活动轮属于别的会话则返回 null——
 *  续跑基线只能取自同一会话，绝不能把另一对话的决策流当基线带进来。 */
export function captureTidiaoDirectorCarryOver(correctionText = '', userName = '', expectedSessionId = ''): TidiaoDirectorCarryOver | null {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return null
  const wantSession = String(expectedSessionId || '').trim()
  if (wantSession && current.sessionId && wantSession !== current.sessionId) return null
  const text = String(correctionText || '').trim()
  // 提调对用户的称呼用用户名（缺省「用户」），不再写死「用户」。
  const who = String(userName || '').trim() || '用户'
  const baseDecisions = current.stream.decisions.map((decision) => {
    const { streaming: _streaming, ...rest } = decision
    return rest
  })
  const correctionDecision: TidiaoDecisionEntry = {
    id: `correction_${baseDecisions.length + 1}`,
    kind: 'correction',
    text: text ? `据${who}纠偏调整：${text}` : '据纠偏重新编排'
  }
  return {
    decisions: [...baseDecisions, correctionDecision],
    shots: [...current.stream.shots],
    // 总耗时累计：优先取已冻结值（本轮已 done/failed 过），否则现算「活到此刻」的耗时（如中途停止即纠偏）。
    priorElapsedMs: typeof current.stream.roundElapsedMs === 'number'
      ? current.stream.roundElapsedMs
      : Math.max(0, Date.now() - current.startedAt)
  }
}

/** 批次K·自主重排：从当前活动轮抽取「上一轮编排概要」作为模型重规划的 brief。
 *  与 captureTidiaoDirectorCarryOver 同处（clear 前）调用——carryOver 给视图（旧决策保留），
 *  本 brief 给模型（让它据纠偏真重读情境/推翻重排，产出模型自己的「据纠偏重排」段）。
 *  上一轮情境 = 最后一条 situation 决策文本；各角色方向 = 角色镜按 label 去重保留最后一次方向。
 *  无活动轮返回 null。 */
export function captureTidiaoDirectorReplanBrief(correctionText = '', expectedSessionId = ''): TidiaoDirectorReplanBrief | null {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return null
  // 会话隔离（修问题①）：重规划 brief 同样只能取自同一会话的活动轮。
  const wantSession = String(expectedSessionId || '').trim()
  if (wantSession && current.sessionId && wantSession !== current.sessionId) return null
  const text = String(correctionText || '').trim()
  let priorSituation = ''
  for (let index = current.stream.decisions.length - 1; index >= 0; index -= 1) {
    if (current.stream.decisions[index].kind === 'situation') {
      priorSituation = String(current.stream.decisions[index].text || '').trim()
      break
    }
  }
  // 角色镜按 label 去重、保留最后一次方向（多次续跑/多镜时取最新；单聊单角色即唯一镜）。
  const directionByCast = new Map<string, string>()
  for (const shot of current.stream.shots) {
    if (shot.kind !== 'character') continue
    const direction = String(shot.direction || '').trim()
    if (direction) directionByCast.set(shot.label, direction)
  }
  return {
    correctionText: text,
    ...(priorSituation ? { priorSituation } : {}),
    priorDirections: [...directionByCast.entries()].map(([castName, direction]) => ({ castName, direction }))
  }
}

/** O-B2·重生成接续：从一条已落库的 directorStream 快照构造续跑基线 carryOver——
 *  让「重新生成单条」变成对这条消息那条导演带的「续跑追加」：旧决策保留、新一轮决策追加在底部，
 *  累加所有版本的编排变更记录（导演带不按版本切换，一条带记全程）。与 captureTidiaoDirectorCarryOver
 *  （从活动轮取）互补：本函数从任意快照取，供普通重生成 / 刷新后接续用。
 *  默认在交界追加一条「重新生成 #N」分隔决策（N 据已有 regen 段递增），让累加记录看清每次边界；
 *  separatorText 显式传空串则不加分隔。空快照返回 null（无可接续基线，新一轮从空载体起步）。 */
export function buildTidiaoDirectorCarryOverFromStream(
  stream: TidiaoDirectorStream | null | undefined,
  options: { separatorText?: string } = {}
): TidiaoDirectorCarryOver | null {
  if (!stream || !Array.isArray(stream.decisions) || !stream.decisions.length) return null
  const baseDecisions: TidiaoDecisionEntry[] = stream.decisions.map((decision) => {
    const { streaming: _streaming, ...rest } = decision
    return rest
  })
  const priorRegens = baseDecisions.filter((d) => typeof d.id === 'string' && d.id.startsWith('regen_')).length
  const separator = options.separatorText === undefined
    ? `重新生成 #${priorRegens + 2}`
    : String(options.separatorText || '').trim()
  if (separator) {
    baseDecisions.push({ id: `regen_${baseDecisions.length + 1}`, kind: 'note', text: separator })
  }
  return {
    decisions: baseDecisions,
    shots: (Array.isArray(stream.shots) ? stream.shots : []).map((shot) => ({ ...shot })),
    // 冷路径（刷新/重启后接续）：只有已落库快照里冻结过的耗时可继承，没有就是 0（旧记录无该字段时的合理默认）。
    priorElapsedMs: typeof stream.roundElapsedMs === 'number' ? stream.roundElapsedMs : 0
  }
}

/**
 * 提调带跨轮记忆（2026-06-22）：把一条带子的 carryOver（历次人话决策 + 工具调用 label/参数/结果/报错 + 纠偏分隔）
 * 渲染成喂给模型的「本提调带历史记忆」结构化摘要。
 *
 * 根因：「一个提调带」工程上是多次独立 loop 运行拼起来的，每发一条新纠偏 = 全新 loop（messages 从零起），
 * 模型本来收不到上一轮的决策/工具调用/读取结果/改动/报错（carryOver 此前只喂视图、没喂模型）。本函数把同一份
 * 已落库的 carryOver 也渲染给模型，让「一个提调带 = 一次有记忆的会话」。
 *
 * 控 token：每条决策压成一行（人话文本 + 工具一行 label｜参数｜结果/报错）；超出字符预算时**丢最早的、保留最近的**
 * 并标注「（更早的历史已省略）」——不静默截断。carryOver 为空/无决策时返回空串（首次纠偏无历史、不产生噪声）。
 */
export function renderTidiaoBandMemory(
  carryOver: TidiaoDirectorCarryOver | null | undefined,
  options: { maxChars?: number } = {}
): string {
  const decisions = carryOver && Array.isArray(carryOver.decisions) ? carryOver.decisions : []
  if (!decisions.length) return ''
  const lines: string[] = []
  for (const d of decisions) {
    const parts: string[] = []
    const text = String(d?.text || '').trim()
    if (text) parts.push(text)
    if (d?.tool) {
      const seg: string[] = []
      const label = String(d.tool.label || d.tool.tool || '').trim()
      const detail = String(d.tool.detail || '').trim()
      const result = String(d.tool.resultPreview || '').trim()
      if (label) seg.push(label)
      if (detail) seg.push(`参数：${detail}`)
      if (d.tool.status === 'error') seg.push(`报错：${result || '执行失败'}`)
      else if (result) seg.push(`结果：${result}`)
      if (seg.length) parts.push(`〔工具 ${seg.join('｜')}〕`)
    }
    const line = parts.join(' ').trim()
    if (line) lines.push(`- ${line}`)
  }
  if (!lines.length) return ''
  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 4000
  const full = lines.join('\n')
  if (full.length <= maxChars) return full
  // 超预算：保留最近的若干行（记忆里最近做的事更重要），丢最早的并标注省略。
  const kept: string[] = []
  let total = 0
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    total += lines[i].length + 1
    if (total > maxChars && kept.length) break
    kept.unshift(lines[i])
  }
  return `（更早的历史已省略）\n${kept.join('\n')}`
}

/** O-B·落库快照：取当前活动轮「已合并的最终 stream」（决策流+分镜，含 carryOver/旁白镜），供持久化进
 *  processTrace 落库——刷新后单聊历史复原走新带（TidiaoDirectorStreamBand），不再退回旧 tidiaoBandModel。
 *  返回纯对象深拷贝（剥离 Vue 响应式代理、与运行态彻底解耦）；runId 不匹配/无活动轮/空决策返回 null（回退旧 band）。 */
export function captureTidiaoDirectorStreamSnapshot(runId = ''): TidiaoDirectorStream | null {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return null
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return null
  const stream = current.stream
  if (!stream || !Array.isArray(stream.decisions) || !stream.decisions.length) return null
  return JSON.parse(JSON.stringify(stream)) as TidiaoDirectorStream
}

/** 旁白独立分镜工作流（2026-06-30）：更新当前活动轮里**所有旁白镜**的正文生成态，驱动旁白镜钻取里
 *  「生成旁白」节点 running→done（取代旧「旁白陪跑」混进角色子工作流步骤列）。旁白正文在提调 loop 收尾后
 *  生成（累加器已停），故直接 mutate 已落定的 stream.shots 不会被累加器整份重建覆盖；runId 不匹配（已被新轮
 *  替换）时丢弃，避免迟到生成态挂到新轮。无旁白镜则空操作。elapsed 仅 done/failed 时带出。 */
export function updateTidiaoDirectorStreamRoundNarrationGen(
  runId: string,
  status: 'pending' | 'running' | 'done' | 'failed',
  elapsed = ''
): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  const shots = Array.isArray(current.stream.shots) ? current.stream.shots : []
  if (!shots.some((shot) => shot.kind === 'narration')) return
  const elapsedText = String(elapsed || '').trim()
  activeTidiaoDirectorStreamRound.value = {
    ...current,
    stream: {
      ...current.stream,
      shots: shots.map((shot) => shot.kind === 'narration'
        ? {
            ...shot,
            narrationGen: status,
            ...((status === 'done' || status === 'failed') && elapsedText
              ? { narrationGenElapsed: elapsedText }
              : {})
          }
        : shot)
    }
  }
}

/** 批次I：把侧栏入口链接折叠到当前轮（召回 run id / 编排审计运行态）。
 *  runId 不匹配（已被新轮替换）时丢弃，避免迟到链接挂到新轮。只更新传入的字段，未传的保持不变。 */
export function setTidiaoDirectorStreamRoundLinks(
  runId: string,
  links: { recallRunId?: string; orchestrationAudit?: Record<string, unknown> }
): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  const recallRunId = String(links.recallRunId || '').trim()
  activeTidiaoDirectorStreamRound.value = {
    ...current,
    ...(recallRunId ? { recallRunId } : {}),
    ...(links.orchestrationAudit ? { orchestrationAudit: links.orchestrationAudit } : {})
  }
}

/** 取「同一会话」的当前活动轮（修问题①·纠偏续在原带）：纠偏据此接回本轮原锚（用户消息）、
 *  续在同一条提调带末尾，而不是默认锚到被纠偏的角色消息上冒出一条新带。会话不符 / 无轮返回 null。 */
export function peekActiveTidiaoDirectorRoundForSession(sessionId: string): TidiaoDirectorStreamRound | null {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return null
  const want = String(sessionId || '').trim()
  if (want && current.sessionId && want !== current.sessionId) return null
  return current
}

/** 切会话时调用（修问题①·跨会话残留）：仅当活动轮属于「别的会话」才清，保留当前会话自己的活动轮，
 *  避免初次挂载 / 切回本会话时误清掉本会话正在进行的提调带。 */
export function clearTidiaoDirectorStreamRoundIfOtherSession(sessionId: string): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const want = String(sessionId || '').trim()
  if (want && current.sessionId && want !== current.sessionId) {
    activeTidiaoDirectorStreamRound.value = null
    syncTidiaoDirectorRoundTicker()
  }
}

/** 真错误收束：把当前活动轮相位覆盖为 failed（编排带不消失，停在失败态、显示原因 + 可重试）。
 *  用于 pipeline 真错误 catch——区别于「用户取消」才 clear 掉带。loop 内已 acc.fail 给出具体原因时
 *  （current.stream.phase 已是 failed）保留原因不覆盖；否则用传入 reason（缺省「编排中断」）。
 *  runId 不匹配（已被新轮替换）时丢弃，避免迟到失败覆盖新轮。 */
export function markTidiaoDirectorStreamRoundFailed(runId: string, reason = ''): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  // loop 内 acc.fail 已写过具体失败原因则保留，不被 catch 的通用文案覆盖。
  if (current.stream.phase === 'failed') return
  const text = String(reason || '').trim() || '编排中断'
  activeTidiaoDirectorStreamRound.value = {
    ...current,
    stream: {
      ...current.stream,
      phase: 'failed',
      currentAction: text,
      failureReason: text,
      ...(typeof current.stream.roundElapsedMs === 'number' ? {} : { roundElapsedMs: Math.max(0, Date.now() - current.startedAt) })
    }
  }
  syncTidiaoDirectorRoundTicker()
}

/** 清除当前载体（新轮起点调用，清掉上一轮残留；不传 runId 则无条件清）。
 *  传 runId 且与当前不一致时不清，防止误清新轮。 */
export function clearTidiaoDirectorStreamRound(runId?: string): void {
  const current = activeTidiaoDirectorStreamRound.value
  if (!current) return
  const key = String(runId || '').trim()
  if (key && current.runId && key !== current.runId) return
  activeTidiaoDirectorStreamRound.value = null
  syncTidiaoDirectorRoundTicker()
}
