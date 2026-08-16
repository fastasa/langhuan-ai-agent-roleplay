// 提调「真·导演 agent loop」轮级流式载体的视图契约 + 折叠 builder（纯函数，无 UI / 网络依赖）。
//
// 定位（2026-06-19 真导演 loop 重构计划书 §3 天气样例 / §4 拍板 / 第一刀·子批1）：
// 这是 loop 在「角色正文之前」就实时展示的**轮级载体**数据模型，取代「挂在第一条角色消息 trace 上」。
// 与现役 tidiaoBandModel（从已持久化过程轨复原的「事后编排带」）并存、定位不同：
// - tidiaoBandModel：历史消息复原用的结果态编排带（六块 → 简化中）。
// - 本模块：loop 进行中、边想边吐的轮级流式载体——决策流 + 并排实时分镜。
//
// 形态（计划书 §4）= 两部分并存：
// 1) 决策流 decisions[]：append-only，每条一句「人话决策」，可附「工具调用条」（表现上分开）。
// 2) 实时分镜 shots[]：与决策流并排、始终可见、边决策边累积，每镜 = 角色/旁白 + 顺序 + 方向。
//
// 真流式粒度（§4 拍板①）：loop 每步真模型产出即一条决策事件；前端对 running 末句做打字机逐字。
// 本模块只负责把「事件序列」折叠成视图模型，不含打字机游标逻辑（前端组件负责逐字）。

/** 决策流条目类型——对应导演 loop 每步吐出的「人话决策」语义。 */
export type TidiaoDecisionKind =
  | 'analyze'       // 在分析这条消息
  | 'recall'        // 按需取料（提调主动调三件套 / recallCharacterBrain 召回资料池 / 世界知识）
  | 'situation'     // 判定情境
  | 'narrationDir'  // 定旁白方向（先不生成旁白正文）
  | 'castDir'       // 定某角色方向
  | 'deepen'        // 在已有线索上继续深化延伸
  | 'planPrompt'    // 据方向写提示词
  | 'generate'      // 发计划生成模型，产候选计划
  | 'review'        // 送 ReRanker 评审挑最优
  | 'compose'       // 生成角色正文
  | 'edit'          // 精修某条已存在消息的某一段（M3 锚定精修，旧片段→新片段）
  | 'correction'    // 用户纠偏后追加的新决策（旧决策不消失）
  | 'note'          // 其它人话决策（兜底）

/** 工具调用条：与「正常编排叙述」表现上分开（§3 步2，表现差异、非最重点）。 */
export interface TidiaoStreamTool {
  /** 工具机器名（readScenarioSkill / searchWorldText / generatePlanBatch …）。 */
  tool: string
  /** 面向用户的中文展示名。 */
  label: string
  /** 检索词 / 参数预览（如情境 code、query、planPrompt 摘要）。 */
  detail?: string
  /** 命中 / 结果摘要（如「命中 3 条」「读到情境正文」）。 */
  resultPreview?: string
  status: 'running' | 'done' | 'error'
}

/** 决策流单条目（append-only，纠偏只在末尾追加，已有条目不改不删）。 */
export interface TidiaoDecisionEntry {
  id: string
  kind: TidiaoDecisionKind
  /** 人话决策一句话（导演用人话主持，非工程黑话）。 */
  text: string
  /** running 相位末句标流式：前端据此做打字机逐字 + 末句光标。 */
  streaming?: boolean
  /** 该步是工具调用时附带（与叙述表现上分开渲染）。 */
  tool?: TidiaoStreamTool
  /** 该决策让某角色/旁白出场时，指向并排分镜里对应那一镜。 */
  shotId?: string
}

/** 实时分镜镜头：与决策流并排、始终可见、边决策边累积。 */
export interface TidiaoStreamShot {
  id: string
  kind: 'narration' | 'character'
  /** 角色名 / 旁白。 */
  label: string
  /** 角色镜的稳定身份；新快照必须写，旧快照缺省时才按唯一名称兼容解析。 */
  characterId?: string
  /** 出场顺序（1 起，按挂镜先后自动递增）。 */
  order: number
  /** 提调给该角色/旁白的方向（分镜不再是空白条）。 */
  direction?: string
  /** 角色头像字（缺省取 label 首字；旁白无头像）。 */
  avatar?: string
  /** 仅旁白且已知二分类时：true=信息承载 / false=纯描写；undefined 不标注。 */
  informationBearing?: boolean
  /** 旁白镜专属·正文生成态（旁白独立分镜工作流 2026-06-30）：方向定好后旁白正文生成的进度，
   *  驱动旁白镜钻取里「生成旁白」节点的 running→done。'pending'=方向已定待生成 / 'running'=生成中 /
   *  'done'=已生成 / 'failed'=生成失败；undefined=非旁白镜或无需展示该节点（历史复原默认按已完成处理）。
   *  与角色镜「子工作流步骤轨」并列：旁白镜轨＝定方向(恒 done)→生成旁白(本字段)。 */
  narrationGen?: 'pending' | 'running' | 'done' | 'failed'
  /** 旁白正文生成耗时（done/failed 时如 "1.2s"）；运行中不显示半截数字。 */
  narrationGenElapsed?: string
}

/** 批次K·自主重排：纠偏续跑时喂给导演 loop 的「重规划 brief」——上一轮的情境判断 + 各角色方向 + 用户纠偏。
 *  存在且为导演模式时，harness 据此在系统提示词追加纠偏自主重规划协议，让模型据纠偏真重读情境、推翻重排，
 *  并把第一句 thought 写成模型产出的「据纠偏重排」决策（区别于 J 的 state 层 carryOver 视图合并——模型本不感知前序）。
 *  纯数据契约（无 Vue/网络依赖），供 state（抽取）/harness（消费）/pipeline（透传）共用。 */
export interface TidiaoDirectorReplanBrief {
  /** 用户这次的纠偏意见（人话）。 */
  correctionText: string
  /** 上一轮判定的情境/基调（取上一轮最后一条情境决策文本）；可能缺省（上一轮没走到判情境）。 */
  priorSituation?: string
  /** 上一轮给出的各角色回复方向（按角色名去重、保留最后一次方向）。 */
  priorDirections: Array<{ castName: string; direction: string }>
}

/** 批次M1b·重试 brief：重试某条角色消息时喂给导演 loop 的上下文——被重试消息原文 + 用户修改意见。
 *  存在且为导演模式时，harness 据此在系统提示词追加重试协议，让模型先「揣测重试意图」（无意见）或
 *  「按用户意见改这条」（有意见），并把第一句 thought 写成对应的导演人话决策；
 *  与 replanBrief 互不冲突（重试 + 纠偏续跑时两段协议可并存）。
 *  纯数据契约（无 Vue/网络依赖），供 harness（消费）/pipeline（构造透传）共用。 */
export interface TidiaoRetryBrief {
  /** 被重试角色消息的原文（揣测重试意图 / 按意见改这条的依据）。 */
  originalText: string
  /** 用户这次给出的重试修改意见（人话）；留空=纯重试，模型自行揣测「上一版哪里不够、这次怎么改」。 */
  instruction?: string
}

/** 批次M3·锚定精修 brief：精修某条/多条已存在消息时喂给精修导演 loop 的上下文——
 *  用户精修指令 + 本轮要精修的目标消息（楼层引用 + 说话人 + 原文）。
 *  喂给独立精修 loop（runTidiaoPrecisionEditLoop）的系统协议，让模型读原文锚定 oldText、
 *  用 editChatMessage 做「旧片段→新片段」精改、其余不动；区别于 M1 的整条重写。
 *  纯数据契约（无 Vue/网络依赖），供 loop（消费）/pipeline（构造透传）共用。 */
export interface TidiaoPrecisionEditBrief {
  /** 用户这次的精修指令（人话），如「角色2 第二句改委婉点」「角色3-5、旁白2 都把语气放软」。 */
  instruction: string
  /** 本轮要精修的目标消息（按楼层引用解析，含原文供模型锚定唯一 oldText）。 */
  targets: Array<{ ref: string; speakerName: string; originalText: string }>
}

export type TidiaoStreamPhase = 'idle' | 'running' | 'done' | 'correcting' | 'failed'

/** 轮级流式载体视图模型：决策流 + 并排实时分镜 + 相位/动作。 */
export interface TidiaoDirectorStream {
  phase: TidiaoStreamPhase
  /** 当前动作短语（顶栏一句话状态）。 */
  currentAction: string
  decisions: TidiaoDecisionEntry[]
  shots: TidiaoStreamShot[]
  /** correcting 相位时携带用户纠偏文本（底栏输入回显）。 */
  correction?: string
  failureReason?: string
  /** 本轮总耗时（含所有纠偏返工段落累计，不含用户思考间隔）：phase 到 done/failed 时冻结一次，
   *  由 state 层 stamp（本文件是纯 builder，不摸墙钟）；running/correcting 相位时不带该字段，前端按活动轮秒表实时算。 */
  roundElapsedMs?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 事件序列（loop 增量上抛 / 历史复原都折叠同一份事件序列）
// ─────────────────────────────────────────────────────────────────────────────

/** 一步决策事件；带 shot 时同步挂一镜并回链 shotId（§3 步6：一决定出场就立刻挂镜）。 */
export interface TidiaoDecisionEventInput {
  type: 'decision'
  kind: TidiaoDecisionKind
  text: string
  id?: string
  tool?: TidiaoStreamTool
  /** 让某角色/旁白出场：同时挂一镜，order 自动分配、shotId 自动回链该决策。 */
  shot?: TidiaoStreamShotInput
}

/** 独立挂镜事件（不绑定某条决策，如收尾批量补镜）。 */
export interface TidiaoShotEventInput extends TidiaoStreamShotInput {
  type: 'shot'
}

/** 挂镜入参（order 由 builder 自动分配，不在事件里指定）。 */
export interface TidiaoStreamShotInput {
  kind: 'narration' | 'character'
  label: string
  characterId?: string
  id?: string
  direction?: string
  avatar?: string
  informationBearing?: boolean
}

export interface TidiaoPhaseEventInput {
  type: 'phase'
  phase: TidiaoStreamPhase
}

export interface TidiaoFailEventInput {
  type: 'fail'
  reason?: string
}

export type TidiaoStreamEvent =
  | TidiaoDecisionEventInput
  | TidiaoShotEventInput
  | TidiaoPhaseEventInput
  | TidiaoFailEventInput

export interface BuildTidiaoDirectorStreamOptions {
  /** 编排带停止挂起（中粒度纠偏）：active 时相位覆盖为 correcting、半成品停在原地、底栏出纠偏条。 */
  correction?: { active: boolean; text?: string }
}

const PHASE_ACTION: Record<TidiaoStreamPhase, string> = {
  idle: '提调待命…',
  running: '提调正在排这一轮…',
  done: '本轮编排完成',
  correcting: '已暂停 · 在下方输入框继续指挥提调',
  failed: '编排中断'
}

/** 空载体：loop 未起时的占位（一轮一条、loop 启动即建立，未起也能占位刷新）。 */
export function emptyTidiaoDirectorStream(): TidiaoDirectorStream {
  return { phase: 'idle', currentAction: PHASE_ACTION.idle, decisions: [], shots: [] }
}

/**
 * 把事件序列折叠成轮级流式载体视图模型。
 * - 决策流按事件顺序 append；纠偏（kind:'correction'）只是追加在末尾的普通决策，旧条目不改不删。
 * - 分镜随「带 shot 的决策」或独立 shot 事件累积，order 自动递增、shotId 自动回链。
 * - 相位：取最后一个 phase 事件；fail 事件 → failed；correction.active 覆盖为 correcting（最高优先）。
 * - running 相位时末条决策标 streaming（前端打字机逐字）。
 */
export function buildTidiaoDirectorStream(
  events: readonly TidiaoStreamEvent[] = [],
  options: BuildTidiaoDirectorStreamOptions = {}
): TidiaoDirectorStream {
  const decisions: TidiaoDecisionEntry[] = []
  const shots: TidiaoStreamShot[] = []
  let phaseFromEvents: TidiaoStreamPhase = events.length ? 'running' : 'idle'
  let failureReason: string | undefined

  const pushShot = (input: TidiaoStreamShotInput): TidiaoStreamShot => {
    const order = shots.length + 1
    const id = String(input.id || '').trim() || `shot_${order}`
    const shot: TidiaoStreamShot = {
      id,
      kind: input.kind,
      label: input.label,
      ...(input.characterId ? { characterId: input.characterId } : {}),
      order,
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.kind === 'character'
        ? { avatar: String(input.avatar || '').trim() || input.label.slice(0, 1) }
        : (input.avatar ? { avatar: input.avatar } : {})),
      ...(typeof input.informationBearing === 'boolean' ? { informationBearing: input.informationBearing } : {})
    }
    shots.push(shot)
    return shot
  }

  for (const event of events) {
    if (event.type === 'phase') {
      phaseFromEvents = event.phase
      continue
    }
    if (event.type === 'fail') {
      phaseFromEvents = 'failed'
      failureReason = String(event.reason || '').trim() || undefined
      continue
    }
    if (event.type === 'shot') {
      pushShot(event)
      continue
    }
    // decision
    const id = String(event.id || '').trim() || `decision_${decisions.length + 1}`
    const linkedShot = event.shot ? pushShot(event.shot) : undefined
    decisions.push({
      id,
      kind: event.kind,
      text: event.text,
      ...(event.tool ? { tool: event.tool } : {}),
      ...(linkedShot ? { shotId: linkedShot.id } : {})
    })
  }

  // 相位收束：纠偏挂起 > fail/done/running（事件态）。纠偏覆盖一切（半成品停在原地、只换相位与底栏）。
  const correcting = options.correction?.active === true
  const phase: TidiaoStreamPhase = correcting ? 'correcting' : phaseFromEvents

  // running 末句标流式（打字机逐字）；其它相位末句不流式。
  if (phase === 'running' && decisions.length) {
    decisions[decisions.length - 1] = { ...decisions[decisions.length - 1], streaming: true }
  }

  let currentAction: string
  if (phase === 'failed') currentAction = failureReason || PHASE_ACTION.failed
  else currentAction = PHASE_ACTION[phase]

  return {
    phase,
    currentAction,
    decisions,
    shots,
    ...(correcting ? { correction: String(options.correction?.text || '') } : {}),
    ...(phase === 'failed' && failureReason ? { failureReason } : {})
  }
}
