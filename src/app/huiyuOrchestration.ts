/**
 * 绘舆阶段管线共享编排引擎（地图分阶段作画与笔刷约束系统批D·2026-07-12）。
 *
 * 定位：把「草案→确认卡→落笔→阶段收尾确认卡→通过盖 confirmedAtStage 戳→下一阶段」抽成公共能力，
 * 星依/提调两条驱动共用同一台引擎（用户拍板：单笔直落最易出错，与其让提调常画错不如统一走稳流程）。
 * 引擎本身无状态——不新增表/不加会话级缓存，「当前阶段」由 huiyuMapTools.resolveCurrentMapStage
 * 现查现算（deriveCurrentStage），本模块只负责「给定阶段后，这一步该做什么、下一步谁来问、答完怎么续」。
 *
 * 两个驱动的差异只在 confirmChannel 实现（HuiyuStageConfirmChannel）：
 * - 星依驱动（XingyiDock.vue）：confirmChannel 真阻塞——await 浮坞 requestAskUser，用户点选/输入后 resolve，
 *   永远返回 {deferred:false, answer}。runHuiyuStage 因此从不提前返回，一次调用内联走完
 *   草案→确认→落笔→阶段收尾确认→盖戳 全流程（对应现役 dispatchXingyiHuiyuDraftThenDraw 的行为，本批把
 *   该函数的编排逻辑原样搬进本模块的 runHuiyuStage/runDraftStep/runDrawStep，XingyiDock.vue 只留
 *   UI 依赖注入——构造 confirmChannel/callModel/研究 deps 并调用本模块）。
 * - 提调驱动（useChatSendPipeline.ts buildHuiyuDispatchSeam）：confirmChannel 立即返回 {deferred:true}
 *   ——提调纠偏/统筹 loop 的 askUser 是「终止本轮、写 pending、等用户下次消息续跑」的信号工具（批C 架构审查已迁引擎
 *   halt 原语，见 tidiaoCorrectionLoop.ts 内 terminalReason='awaiting-user' 收束逻辑 + useChatSendPipeline.ts
 *   result.strategy==='ask-user' 分支），
 *   没有能在单次工具调用内部挂起等待真人回答的通道（会话往返以「轮」为单位，不是可 await 的 Promise）；
 *   20 分钟硬超时（DIRECTOR_LOOP_TIMEOUT_MS）也不允许在一次工具调用里等真人。因此提调侧每次
 *   dispatchMapWork(mode:'staged') 只做「当前阶段的一个分段」（草案 或 落笔+问阶段收尾），回执里明确
 *   告知提调「请用你自己的 askUser 向用户确认，拿到答复后带着 stagedStep 再次派发」——阶段状态靠
 *   meta.stage/meta.confirmedAtStage 跨调用自持，不需要嵌套挂起，接缝分析见批D 回执。
 */

import type { CaifengToolsetDeps } from './caifengSubagent'
import {
  buildHuiyuDraftToolset,
  buildHuiyuToolset,
  composeHuiyuDrawTaskFromDraft,
  HUIYU_DRAFT_CONFIRM_LABEL,
  HUIYU_DRAFT_REJECT_LABEL,
  isHuiyuDraftRejected,
  renderHuiyuLayoutDraftConfirmCard,
  runHuiyuLayoutDraft,
  runHuiyuMapWork,
  type HuiyuDraftSketchItem,
  type HuiyuLayoutDraftResult,
  type HuiyuMapWorkInput,
  type HuiyuMapWorkResult,
  type HuiyuToolFailureEntry,
  type RunHuiyuMapWorkDeps
} from './huiyuSubagent'
import {
  confirmStageFeatures,
  expandExploredCoverFeatureIds,
  exploredOverflowNote,
  overflowCheckPoints,
  renderMapSummary
} from './huiyuMapTools'
import { centroid, MAP_STAGE_ORDER, type MapPoint, type MapStageId } from './mapGeometry'
import { fetchWorldMapBundle } from '../repositories/chatRepository'
import { resolveWorldDefaultMapSheet } from './worldMapDefaultSheet'

export type { MapStageId }

/** 阶段中文标签（回执/确认卡文案用，不进任何持久化）。 */
const STAGE_LABEL: Record<MapStageId, string> = { terrain: '地形', water: '水系', civic: '人文' }

/** 阶段可画类目一句话摘要（草案任务书里告知绘舆本轮范围，纯提示不做硬约束——硬约束已在
 *  buildHuiyuToolset(stage) 的 schema/validateArgs 里，草案轮本就没有写工具，这里只是让草案不空提"以后阶段"的东西）。 */
function describeStageScope(stage: MapStageId): string {
  if (stage === 'terrain') return '陆地地形（山脉/森林/草地/高原/丘陵/沙漠/沼泽/冰原/雨林），不含水域与人文建设'
  if (stage === 'water') return '水域与河流运河（water region + river/canal path），依托已有地形走向'
  return '人文建设（城区/农田/道路/街道/桥/城墙/疆界/小径 + 全部地标角色 marker），依托已有地形水系布局'
}

export interface HuiyuStageConfirmOption { label: string; note?: string }

/** 确认请求（三种确认点）：draftConfirm=草案确认；stageEndConfirm=阶段收尾确认（通过后批量盖戳锁定）；
 *  terraformConfirm=高门槛改造确认（override:'terraform' 触发，与阶段收尾无关，是独立的越权改造闸门）。 */
export interface HuiyuStageConfirmRequest {
  kind: 'draftConfirm' | 'stageEndConfirm' | 'terraformConfirm'
  question: string
  options: HuiyuStageConfirmOption[]
  /** 草案剪影清单（地图草案剪影可视化计划批1·可选增强，仅 draftConfirm 且绘舆给了 sketches 时才有）：
   *  供确认通道/前端画 overlay，与 worldId 同时给。 */
  sketches?: HuiyuDraftSketchItem[]
  /** 世界 id（随 sketches 同时给，供前端定位地图）。 */
  worldId?: string
}

/** 确认通道答复：deferred:true=通道不能阻塞等真人（提调场景），调用方据此把 nextStep 回执给上层，
 *  由外层自己的 askUser 机制问人、下次带着答案重新派发；deferred:false=已经拿到真人答案（星依场景，
 *  requestAskUser 真阻塞直到用户点选/输入）。 */
export type HuiyuStageConfirmAnswer = { deferred: true } | { deferred: false; answer: string }

/** 确认通道（两条驱动唯一的实现差异点）。 */
export type HuiyuStageConfirmChannel = (request: HuiyuStageConfirmRequest) => Promise<HuiyuStageConfirmAnswer>

export interface RunHuiyuStageInput extends HuiyuMapWorkInput {
  /** 本次调用要执行的分段（缺省 'draft'）：'draft'=拟草案；'draw'=落笔（草案已确认/或直接落笔小改）；
   *  'confirmStage'=不再落笔，只把 confirmAnswer 当作对上一次阶段收尾确认卡的答复来处理。 */
  step?: 'draft' | 'draw' | 'confirmStage'
  /** step='confirmStage' 专用：用户对上一次阶段收尾确认卡的原始回复文本（提调拿到 askUser 答复后回填）。 */
  confirmAnswer?: string
  /** 高门槛改造通道：给了就整个走 terraform 独立闸门（与阶段收尾/盖戳无关），忽略 step。 */
  override?: 'terraform'
}

export interface RunHuiyuStageDeps {
  sessionId: string
  /** huiyu.dispatch 统一原始可见上下文；同一次阶段派发的草案/落笔/续画轮共用。 */
  contextBlock?: string
  /** 运行卡键（星依/提调各自的计数器生成，需保证同会话内唯一）。 */
  taskKey: string
  worldId: string
  /** 图纸 id（缺省=世界显式默认图纸，与其余地图工具同一套缺省口径）。 */
  sheetId?: string
  research?: CaifengToolsetDeps | null
  callModel: RunHuiyuMapWorkDeps['callModel']
  /** 草案轮专用 callModel（可选·缺省用 callModel）：星依侧消耗溯源两档标签（「绘舆·拟稿」vs「绘舆」）
   *  靠它区分——引擎内一次 run 同时跑草案/落笔两条 loop，单一 callModel 无法按 loop 换 usageLabel。 */
  draftCallModel?: RunHuiyuMapWorkDeps['callModel']
  confirmChannel: HuiyuStageConfirmChannel
  audit?: RunHuiyuMapWorkDeps['audit']
  signal?: AbortSignal
  /** terraform 系列级授权通道（提速批B·2026-07-12·可选）：给了才启用「一次批准覆盖整个系列」——
   *  runTerraformStep 弹卡前先 use() 尝试沿用（命中即免卡直接放行，返回批准时刻标签供回执展示，
   *  内部滑动续期）；用户点「批准」后 record() 记录。**只星依阻塞驱动接线**（XingyiDock.vue 用
   *  huiyuTerraformGrantState 按 聊天会话+世界 键构造）；提调 advisory 流不传本字段，弹卡行为与批B
   *  之前完全一致。不传=零变化。 */
  terraformGrant?: {
    use: () => { grantedAtLabel: string } | null
    record: () => void
  }
}

export interface RunHuiyuStageResult {
  /** 引擎自身有没有正常跑完（不代表内容被接受/确认——ok=true 时仍可能 status='rejected'）。 */
  ok: boolean
  /** 'completed'=本阶段已收尾盖戳（或 terraform 改造已执行完）；'awaitingConfirm'=正等确认（提调侧据此
   *  用 askUser 问人+带 nextStep 重新派发）；'rejected'=用户明确驳回/不批准；'failed'=真故障或缺料。 */
  status: 'completed' | 'awaitingConfirm' | 'rejected' | 'failed'
  stage: MapStageId
  summary: string
  changes?: string[]
  mapDigest?: string
  missingInfo?: string[]
  /** status='completed' 且发生了阶段收尾时给：本次被批量盖戳锁定的要素 id。 */
  stampedFeatureIds?: string[]
  /** status='completed' 且还有下一阶段时给（civic 收尾后无更高阶段，不给）。 */
  nextStage?: MapStageId
  /** status='awaitingConfirm' 时给：下次派发该传的 step。 */
  nextStep?: 'draft' | 'draw' | 'confirmStage'
  /** status='awaitingConfirm' 时给：交给外层 askUser 的问题+选项+可选剪影清单（批1）。 */
  confirmQuestion?: { question: string; options: HuiyuStageConfirmOption[]; sketches?: HuiyuDraftSketchItem[]; worldId?: string }
  error?: string
}

/** runLabel（批L 地图版本历史）：派发任务标题（input.task），随 runMeta 进服务端变更日志——
 *  runKey=deps.taskKey（星依/提调各自计数器生成、同会话内唯一），「历史」面板按它分组一次派发的全部笔画。 */
function buildMapToolsDeps(deps: RunHuiyuStageDeps, stage?: MapStageId, terraformApproved?: boolean, runLabel?: string) {
  return {
    worldId: deps.worldId,
    ...(stage ? { stage } : {}),
    ...(terraformApproved ? { terraformApproved: true } : {}),
    runMeta: { runKey: deps.taskKey, ...(runLabel ? { runLabel } : {}) }
  }
}

export const HUIYU_STAGE_END_CONFIRM_LABEL = '确认，阶段收尾'
export const HUIYU_STAGE_END_REJECT_LABEL = '先不收尾，保留但不确认'
export const HUIYU_TERRAFORM_APPROVE_LABEL = '批准 terraform 改造'
export const HUIYU_TERRAFORM_REJECT_LABEL = '不批准'

function renderStageEndConfirmCard(stage: MapStageId, draw: HuiyuMapWorkResult): { question: string; options: HuiyuStageConfirmOption[] } {
  const lines = [`绘舆完成了「${STAGE_LABEL[stage]}」阶段的这一批笔画，请确认：`, '', draw.summary || '（绘舆未给摘要）']
  if (draw.changes.length) lines.push('', '改动清单：' + draw.changes.map((c) => `· ${c}`).join(' '))
  if (draw.auditNotes) lines.push('', `【体检提示】${draw.auditNotes}`)
  lines.push('', '确认后这批内容将被锁定保护（后续阶段不能再随意改动，只能走高门槛 terraform 通道）；不确认可在下方输入修改意见，绘舆会只重画你点名的部分再自动收尾。')
  return {
    question: lines.join('\n'),
    options: [
      { label: HUIYU_STAGE_END_CONFIRM_LABEL, note: `本阶段内容确认收尾，锁定保护${stage === 'civic' ? '' : '，进入下一阶段'}` },
      { label: HUIYU_STAGE_END_REJECT_LABEL, note: '暂不收尾，内容保留但不锁定，可再次派发继续处理' }
    ]
  }
}

function isStageEndConfirmed(answer: string): boolean {
  return String(answer || '').trim() === HUIYU_STAGE_END_CONFIRM_LABEL
}

function isStageEndRejected(answer: string): boolean {
  const text = String(answer || '').trim()
  return !text || text === HUIYU_STAGE_END_REJECT_LABEL
}

function nextStageOf(stage: MapStageId): MapStageId | undefined {
  const idx = MAP_STAGE_ORDER.indexOf(stage)
  return idx < MAP_STAGE_ORDER.length - 1 ? MAP_STAGE_ORDER[idx + 1] : undefined
}

/** 阶段收尾确认卡的答复处理（confirm/reject/定向修复三分支）：draft 相关信息只用于回执文案，
 *  confirmStage 分段重入时（tidiao 隔轮再问）可能没有——传空串/空数组兜底，不影响判定逻辑本身。 */
async function finishStageEndAnswer(
  stage: MapStageId,
  answerText: string,
  deps: RunHuiyuStageDeps,
  priorSummary: string,
  priorChanges: string[]
): Promise<RunHuiyuStageResult> {
  if (isStageEndConfirmed(answerText)) {
    const stampedFeatureIds = await confirmStageFeatures(deps.worldId, stage, deps.sheetId, { runKey: deps.taskKey, runLabel: '阶段收尾盖戳' })
    return {
      ok: true, status: 'completed', stage, summary: priorSummary, changes: priorChanges,
      stampedFeatureIds, ...(nextStageOf(stage) ? { nextStage: nextStageOf(stage) } : {})
    }
  }
  if (isStageEndRejected(answerText)) {
    return { ok: false, status: 'rejected', stage, summary: priorSummary, changes: priorChanges, error: '阶段收尾未获确认（已绘制内容保留，未锁定）' }
  }
  // 定向修复：answerText 当作"只重画被点名要素"的任务书，跑一次针对性落笔后直接收尾（不二次确认，
  // 呼应草案确认"确认或修改都直接推进"的既有惯例，避免无限来回问）。
  const fixTools = buildHuiyuToolset({ map: buildMapToolsDeps(deps, stage, undefined, '阶段收尾定向修复'), research: deps.research })
  const fixResult = await runHuiyuMapWork(
    { task: '阶段收尾定向修复', instructions: `阶段收尾确认时用户反馈需要修正：${answerText}\n只重画/调整用户点名的要素，其余保持不动，不要重新规划整个阶段。` },
    {
      sessionId: deps.sessionId, taskKey: `${deps.taskKey}-fix`, tools: fixTools, callModel: deps.callModel,
      ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
      ...(deps.audit ? { audit: deps.audit } : {}), ...(deps.signal ? { signal: deps.signal } : {})
    }
  )
  if (!fixResult.ok) {
    // 缺料交回也不许盖戳（星依审查修·2026-07-12）：用户点名要修的内容没修成，阶段不能收尾锁定——
    // missingInfo 透传给上层，补料后可重派 confirmStage 或继续修改；已绘内容保留未锁定。
    if (fixResult.missingInfo?.length) {
      return {
        ok: false, status: 'failed', stage,
        summary: fixResult.summary || `${priorSummary}（定向修复因缺料未完成，已绘内容保留未锁定，可补料后重派 confirmStage 或继续修改）`,
        changes: priorChanges, missingInfo: fixResult.missingInfo, error: '定向修复缺料，阶段未收尾'
      }
    }
    return { ok: false, status: 'failed', stage, summary: priorSummary, changes: priorChanges, error: `定向修复失败：${fixResult.error || '未知原因'}` }
  }
  const stampedFeatureIds = await confirmStageFeatures(deps.worldId, stage, deps.sheetId, { runKey: deps.taskKey, runLabel: '阶段收尾盖戳' })
  return {
    ok: true, status: 'completed', stage,
    summary: fixResult.summary || priorSummary,
    changes: [...priorChanges, ...fixResult.changes],
    mapDigest: fixResult.mapDigest, stampedFeatureIds,
    ...(nextStageOf(stage) ? { nextStage: nextStageOf(stage) } : {})
  }
}

/** 任务书前置格局快照（地图提速批·2026-07-12 用户拍板）：派发时把当前地图摘要钉进任务书前部——复用
 *  readMapSummary 同一份 renderMapSummary 纯函数直调（不经过工具调用，省一次 HTTP 往返+一轮模型交互），
 *  省掉绘舆开局 1~2 轮 readMapSummary 往返。唯一注入点=runDraftStep/runDrawStep（本文件下方两处调用），
 *  两者都经 runHuiyuStage 被调用——星依阻塞驱动（XingyiDock.vue dispatchXingyiHuiyuStaged）与提调非阻塞
 *  驱动（useChatSendPipeline.ts buildHuiyuDispatchSeam 的 mode:'staged' 分支）都走 runHuiyuStage，两条链路
 *  天然覆盖。legacy 两段式（runHuiyuDraftThenDraw/runHuiyuDraftForRelay）与直落笔 mode:'draw' 不在本函数
 *  覆盖范围（超出本批改动范围）——纲领里"若任务书前部已带快照"是条件句，没带快照时仍按原流程
 *  readMapSummary，不会读错。取图失败/世界为空时降级为占位符，不阻塞派发——绘舆仍可在轮内自己
 *  readMapSummary 兜底。 */
async function withMapDigestSnapshot(instructions: string, worldId: string): Promise<string> {
  let snapshotText = '（图面尚无要素）'
  try {
    const bundle = await fetchWorldMapBundle(worldId)
    if (bundle.sheets.some((sheet) => sheet.features.length)) snapshotText = renderMapSummary(bundle)
  } catch {
    // 取图失败不阻塞派发——绘舆仍可在轮内自己 readMapSummary 兜底
  }
  const snapshotBlock = [
    '【当前图面格局·派发时快照】',
    snapshotText,
    '（快照可能略旧，涉及精确坐标的改动前仍可用 readMapSummary 复核）'
  ].join('\n')
  return `${snapshotBlock}\n\n${instructions}`
}

// ── 草案剪影决策 JSON（地图草案剪影可视化计划批1）───────────────────────────────
// 前端把剪影卡上的采纳/驳回/意见序列化成 {"kind":"huiyu-sketch-decision",...} 塞进现有字符串答案通道，
// 双坞共用同一份解析。解析失败/非 JSON（含现行的确认标签/驳回标签/自由文本）一律返回 null，
// 调用方据此原样走现行分支——sketches/决策 JSON 都是可选增强，零回归接缝。

export interface HuiyuSketchDecision {
  /** 用户采纳的剪影 id 列表。 */
  accepted: string[]
  /** 用户明确不画的剪影 id 列表。 */
  rejected: string[]
  /** 剪影 id → 修改意见（触发修订草案环，只重出被评论的项）。 */
  comments: Record<string, string>
  /** 补充说明（不针对具体某一项）。 */
  note?: string
}

/** 修订环轮数上限（第 1 次是原始草案，之后每次因 comments 触发的重出草案计一轮；超出后退回现行
 *  纯文字确认流程，把决策原文当自由修改意见并入落笔任务书——保证草案不会无限来回）。 */
export const HUIYU_SKETCH_REVISION_MAX = 3

/** 解析剪影决策 JSON：非字符串/空串/非 JSON/kind 不符/整体不是对象都返回 null（不抛错）。
 *  accepted/rejected 只保留字符串项；comments 只保留非空字符串值；note 非字符串时忽略。 */
export function parseHuiyuSketchDecision(answer: string): HuiyuSketchDecision | null {
  const text = String(answer || '').trim()
  if (!text) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (obj.kind !== 'huiyu-sketch-decision') return null
  const accepted = Array.isArray(obj.accepted) ? obj.accepted.filter((x): x is string => typeof x === 'string') : []
  const rejected = Array.isArray(obj.rejected) ? obj.rejected.filter((x): x is string => typeof x === 'string') : []
  const commentsRaw = obj.comments && typeof obj.comments === 'object' ? (obj.comments as Record<string, unknown>) : {}
  const comments: Record<string, string> = {}
  for (const [id, value] of Object.entries(commentsRaw)) {
    if (typeof value === 'string' && value.trim()) comments[id] = value.trim()
  }
  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined
  return { accepted, rejected, comments, note }
}

/** 决策 → JSON（地图草案剪影可视化计划批3）：与 parseHuiyuSketchDecision 互逆（round-trip），双坞统一走
 *  这里序列化答案，不许各自拼字符串。note 为空/未给时不写入 note 字段——与 parseHuiyuSketchDecision 把
 *  空串 note 也归一成 undefined 的行为对齐，保证互逆。 */
export function serializeHuiyuSketchDecision(decision: HuiyuSketchDecision): string {
  return JSON.stringify({
    kind: 'huiyu-sketch-decision',
    accepted: decision.accepted,
    rejected: decision.rejected,
    comments: decision.comments,
    ...(decision.note ? { note: decision.note } : {})
  })
}

function findSketchById(sketches: HuiyuDraftSketchItem[] | undefined, id: string): HuiyuDraftSketchItem | undefined {
  return (sketches || []).find((item) => item.id === id)
}

/** 剪影几何一句话描述（供已采纳清单/修订草案的原方案回顾用，不是给最终落笔用的精确参数）。 */
function describeSketchGeometry(sketch: HuiyuDraftSketchItem['sketch']): string {
  const center = sketch.center
  if (center && (typeof sketch.rx === 'number' || typeof sketch.ry === 'number')) {
    return `中心(${center[0]}, ${center[1]})，半径约 ${sketch.rx ?? '?'}×${sketch.ry ?? '?'} 米`
  }
  if (center) return `中心(${center[0]}, ${center[1]})`
  if (sketch.points?.length) return `${sketch.points.length} 个折点，首点(${sketch.points[0][0]}, ${sketch.points[0][1]})`
  return '（几何未给）'
}

/** accepted/rejected 决策 → 落笔任务书（地图草案剪影可视化计划批1）：原任务书事实+草案依据/假设（同
 *  composeHuiyuDrawTaskFromDraft）+「已采纳清单」（逐项 label/category/action/剪影中心与尺寸，
 *  注明剪影为示意、正式落笔走笔刷与硬门）+「明确不画」（rejected 项）+ note。 */
export function composeHuiyuDrawTaskFromSketchDecision(
  input: HuiyuMapWorkInput,
  draft: HuiyuLayoutDraftResult,
  decision: HuiyuSketchDecision
): HuiyuMapWorkInput {
  const lines = [String(input.instructions || '').trim(), '', '【已确认的格局草案】', draft.summary.trim()]
  if (draft.facts.length) lines.push('依据：' + draft.facts.map((item) => `· ${item}`).join(' '))
  if (draft.assumptions.length) lines.push('假设（用户未反对即可用）：' + draft.assumptions.map((item) => `· ${item}`).join(' '))
  const acceptedItems = decision.accepted.map((id) => findSketchById(draft.sketches, id)).filter((item): item is HuiyuDraftSketchItem => Boolean(item))
  if (acceptedItems.length) {
    lines.push('', '【已采纳清单——剪影只是位置与规模示意，不是最终形状；正式落笔仍须用真笔刷、过全部硬门】')
    acceptedItems.forEach((item) => {
      lines.push(`· 「${item.label}」（${item.category}·${item.action}）：${describeSketchGeometry(item.sketch)}${item.card.change ? `——${item.card.change}` : ''}`)
    })
  }
  const rejectedItems = decision.rejected.map((id) => findSketchById(draft.sketches, id)).filter((item): item is HuiyuDraftSketchItem => Boolean(item))
  if (rejectedItems.length) {
    lines.push('', '【明确不画】')
    rejectedItems.forEach((item) => lines.push(`· 「${item.label}」——用户明确表示不需要，不要画这一项`))
  }
  if (decision.note) lines.push('', `【用户的补充说明】${decision.note}`)
  return { task: input.task, instructions: lines.join('\n'), ...(input.focus ? { focus: input.focus } : {}) }
}

/** comments 决策 → 修订草案任务书（地图草案剪影可视化计划批1）：只列被评论的项+对应意见，明确要求
 *  「只针对以下项按意见重出剪影，其余不必重复」——控制修订环范围，避免整份草案推倒重来。 */
export function composeHuiyuRevisionDraftInput(
  input: HuiyuMapWorkInput,
  draft: HuiyuLayoutDraftResult,
  decision: HuiyuSketchDecision
): HuiyuMapWorkInput {
  const lines = [String(input.instructions || '').trim(), '', '【修订草案——只针对以下项按用户的意见重出剪影，其余项维持原方案，不必重复交回】']
  Object.entries(decision.comments).forEach(([id, comment]) => {
    const item = findSketchById(draft.sketches, id)
    lines.push(`· 「${item?.label || id}」原方案：${item ? describeSketchGeometry(item.sketch) : '（未知项，按 id 定位不到，跳过几何描述）'}——用户的意见：${comment}`)
  })
  if (decision.note) lines.push('', `【补充说明】${decision.note}`)
  return { task: input.task, instructions: lines.join('\n'), ...(input.focus ? { focus: input.focus } : {}) }
}

/** 合并「已采纳部分落笔结果」与「修订环最终结果」（批1）：second（后完成的一步）代表最新状态与 status，
 *  但 first 的 summary/changes 不能丢——拼接展示，让阶段执行器只需处理单一 RunHuiyuStageResult。 */
function mergeStageResults(first: RunHuiyuStageResult, second: RunHuiyuStageResult): RunHuiyuStageResult {
  return {
    ...second,
    summary: [first.summary, second.summary].filter(Boolean).join('\n'),
    changes: [...(first.changes || []), ...(second.changes || [])]
  }
}

// ── 落笔轮可靠性：自动扩探 + 续画环（笔刷约束系统批B 事故根因3对症·2026-07-12）─────────────────
// 真机事故：一轮10项剪影只落笔2项——工具调用预算被"半径填成跨度"的连续超限重试烧光，队尾要素一笔未画，
// 系统两次提示 expandExplored 也没预算执行。根治：①编排侧交稿后自己现查现补探索范围，不占绘舆模型预算；
// ②决策落笔路径下，比对「已采纳清单」与实际是否真的落笔，缺的自动追加落笔轮（≤2 轮封顶），仍有缺口
// 在最终 summary 如实列出，不静默吞。非决策路径（无 accepted 清单可对账）不启用续画环，行为不变。

/** 续画环追加轮数上限：封顶防止无限重试，仍有未完成会在 summary 如实列出。 */
export const HUIYU_CONTINUATION_MAX = 2

/** 快照某图纸当前全部要素 id（自动扩探/续画环共用：判定"这轮新增了哪些要素"的基准点）。取图失败按空集
 *  处理——不阻塞落笔轮收尾，只是这种极端情况下自动扩探会保守地判定"没有新要素"，不做任何自动写操作。 */
async function snapshotFeatureIds(worldId: string, sheetId: string | undefined): Promise<Set<string>> {
  try {
    const bundle = await fetchWorldMapBundle(worldId)
    const sheet = sheetId ? bundle.sheets.find((s) => s.id === sheetId) : resolveWorldDefaultMapSheet(bundle)
    return new Set((sheet?.features || []).map((f) => f.id))
  } catch {
    return new Set()
  }
}

/** 编排自动扩探：比对 beforeIds 找出本轮新落笔要素，复用 huiyuMapTools 同一份 exploredOverflowNote/
 *  overflowCheckPoints 判定逐个是否落在探索范围外，超出的批量调 expandExploredCoverFeatureIds
 *  （不占绘舆自己的模型工具调用预算）。没有新要素/没有越界要素都返回空串，不做任何写操作；取图/扩探
 *  失败同样返回空串——自动扩探是锦上添花，不是落笔轮收尾的硬门。 */
async function autoExpandExploredForNewFeatures(
  worldId: string,
  sheetId: string | undefined,
  beforeIds: Set<string>,
  taskKey: string,
  runLabel: string
): Promise<string> {
  try {
    const bundle = await fetchWorldMapBundle(worldId)
    const sheet = sheetId ? bundle.sheets.find((s) => s.id === sheetId) : resolveWorldDefaultMapSheet(bundle)
    if (!sheet) return ''
    const outOfRangeIds: string[] = []
    for (const feature of sheet.features) {
      if (beforeIds.has(feature.id)) continue
      const pts = (feature.geometry?.pts || []) as MapPoint[]
      if (!pts.length) continue
      const kind = feature.kind as 'marker' | 'region' | 'path'
      const center = kind === 'marker' ? null : centroid(pts)
      const note = exploredOverflowNote(sheet, overflowCheckPoints(kind, center, pts))
      if (note) outOfRangeIds.push(feature.id)
    }
    if (!outOfRangeIds.length) return ''
    const result = await expandExploredCoverFeatureIds(worldId, sheet.id, outOfRangeIds, { runKey: taskKey, runLabel: `${runLabel}·自动扩探` })
    return result ? `已自动扩探 ${outOfRangeIds.length} 要素（探索范围现 ${result.areaText}）。` : ''
  } catch {
    return ''
  }
}

/** 已采纳清单里"未真正落笔"的项（续画环对账用）：只对 action==='add' 的项判定——落笔后现查最新图纸，
 *  看是否存在同 kind 且 name===label 的要素；sketch 本身不入库，唯一可信的判据是正式图纸上有没有对应
 *  要素（不信任模型自称的 changes 自由文本，可能漏报/夸大）。modify/delete 不适合用"是否存在同名要素"
 *  判定（modify 前该要素本就存在，delete 反而应该不存在），一律跳过不计入未完成——避免误判死循环。 */
async function findUnfinishedAcceptedItems(
  worldId: string,
  sheetId: string | undefined,
  items: HuiyuDraftSketchItem[]
): Promise<HuiyuDraftSketchItem[]> {
  const addItems = items.filter((item) => item.action === 'add')
  if (!addItems.length) return []
  try {
    const bundle = await fetchWorldMapBundle(worldId)
    const sheet = sheetId ? bundle.sheets.find((s) => s.id === sheetId) : resolveWorldDefaultMapSheet(bundle)
    const features = sheet?.features || []
    return addItems.filter((item) => !features.some((f) => f.kind === item.kind && f.name === item.label))
  } catch {
    return [] // 取图失败按"无法判定"处理——不误判死循环，续画环本轮静默跳过检查
  }
}

/** 未完成项 → 续画任务书：任务书只列剩余项，不重复携带上一轮完整的"已采纳清单"（那份清单列了全部
 *  accepted 项，若原样带过来会跟"只处理这些"的指示自相矛盾）——只摘录上一轮对应的失败原因（按
 *  label/category 匹配 toolErrors）+ 明确「只处理这些，其余（含已成功落笔的）都不要重复画」。 */
function composeHuiyuContinuationDrawInput(
  input: HuiyuMapWorkInput,
  unfinished: HuiyuDraftSketchItem[],
  toolErrors?: HuiyuToolFailureEntry[]
): HuiyuMapWorkInput {
  const lines = [
    `【续画环】上一轮任务「${String(input.task || '').trim()}」里，以下已采纳项还没能成功落笔，本轮只补画这些，其余（含已经成功落笔的项）都不要重复画：`
  ]
  unfinished.forEach((item) => {
    const related = (toolErrors || []).filter((e) => e.name === item.label || e.category === item.category)
    const errorNote = related.length ? `——上一轮失败原因：${related.map((e) => e.message).join('；')}` : ''
    lines.push(`· 「${item.label}」（${item.category}·${item.action}）：${describeSketchGeometry(item.sketch)}${errorNote}`)
  })
  return { task: input.task, instructions: lines.join('\n'), ...(input.focus ? { focus: input.focus } : {}) }
}

/** 单趟落笔+续画环核心：runRound 由调用方注入（staged/legacy 两条路径各自的 runHuiyuMapWork 包装），
 *  taskKeySuffix 空串=首轮沿用原 taskKey，非空=追加轮用 `${taskKey}-${suffix}` 避免与首轮共用同一个
 *  运行卡 subagentId（同 finishStageEndAnswer 定向修复已有的 `-fix` 后缀先例）。acceptedItems 未给/
 *  为空=非决策路径，直接返回首轮结果，不启用续画环。首轮失败（ok:false）直接返回，不进入续画环——
 *  续画环只处理"交稿了但部分项没画成"，不处理"整轮就没交上来"。 */
async function drawWithContinuationLoop(
  runRound: (input: HuiyuMapWorkInput, taskKeySuffix: string) => Promise<HuiyuMapWorkResult>,
  firstInput: HuiyuMapWorkInput,
  acceptedItems: HuiyuDraftSketchItem[] | undefined,
  worldId: string,
  sheetId: string | undefined
): Promise<HuiyuMapWorkResult> {
  let draw = await runRound(firstInput, '')
  if (!draw.ok || !acceptedItems?.length) return draw
  const summaries = [draw.summary]
  const changes = [...draw.changes]
  let lastToolErrors = draw.toolErrors
  let round = 0
  let unfinished = await findUnfinishedAcceptedItems(worldId, sheetId, acceptedItems)
  while (unfinished.length && round < HUIYU_CONTINUATION_MAX) {
    round += 1
    const followUpInput = composeHuiyuContinuationDrawInput(firstInput, unfinished, lastToolErrors)
    const followUp = await runRound(followUpInput, `continue-${round}`)
    if (!followUp.ok) {
      summaries.push(`续画第 ${round} 轮未完成：${followUp.error || (followUp.missingInfo?.length ? `缺料：${followUp.missingInfo.join('；')}` : '未知原因')}`)
      break
    }
    summaries.push(followUp.summary)
    changes.push(...followUp.changes)
    lastToolErrors = followUp.toolErrors
    draw = followUp
    unfinished = await findUnfinishedAcceptedItems(worldId, sheetId, acceptedItems)
  }
  const unfinishedNote = unfinished.length
    ? `\n\n【未完成清单】以下已采纳项经追加落笔仍未成功，如实保留（不静默吞）：${unfinished.map((item) => `「${item.label}」（${item.category}）`).join('、')}。可对这些项再次派发处理。`
    : ''
  return { ...draw, summary: summaries.filter(Boolean).join('\n') + unfinishedNote, changes }
}

async function runDrawStep(
  stage: MapStageId,
  input: RunHuiyuStageInput,
  deps: RunHuiyuStageDeps,
  acceptedItems?: HuiyuDraftSketchItem[]
): Promise<RunHuiyuStageResult> {
  // 自动扩探需要"落笔前"快照：先记下已有要素 id，落笔完（含续画环全部轮次）后现查新增了哪些，
  // 只有这些才可能是"探索范围外看不见"的候选。
  const beforeIds = await snapshotFeatureIds(deps.worldId, deps.sheetId)
  const drawTools = buildHuiyuToolset({ map: buildMapToolsDeps(deps, stage, undefined, input.task), research: deps.research })
  const runRound = async (roundInput: HuiyuMapWorkInput, taskKeySuffix: string): Promise<HuiyuMapWorkResult> => {
    const scopedInput: RunHuiyuStageInput = { ...roundInput, instructions: await withMapDigestSnapshot(roundInput.instructions, deps.worldId) }
    return runHuiyuMapWork(scopedInput, {
      sessionId: deps.sessionId, taskKey: taskKeySuffix ? `${deps.taskKey}-${taskKeySuffix}` : deps.taskKey, tools: drawTools, callModel: deps.callModel,
      ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
      ...(deps.audit ? { audit: deps.audit } : {}), ...(deps.signal ? { signal: deps.signal } : {})
    })
  }
  const draw = await drawWithContinuationLoop(runRound, input, acceptedItems, deps.worldId, deps.sheetId)
  if (!draw.ok) {
    if (draw.missingInfo?.length) return { ok: false, status: 'failed', stage, summary: draw.summary, missingInfo: draw.missingInfo, error: '料不足' }
    return { ok: false, status: 'failed', stage, summary: '', error: draw.error || '落笔失败' }
  }
  const expandNote = await autoExpandExploredForNewFeatures(deps.worldId, deps.sheetId, beforeIds, deps.taskKey, input.task)
  if (expandNote) draw.changes = [...draw.changes, expandNote]
  const card = renderStageEndConfirmCard(stage, draw)
  const answer = await deps.confirmChannel({ kind: 'stageEndConfirm', question: card.question, options: card.options })
  if (answer.deferred) {
    return {
      ok: true, status: 'awaitingConfirm', stage, summary: draw.summary, changes: draw.changes, mapDigest: draw.mapDigest,
      nextStep: 'confirmStage', confirmQuestion: { question: card.question, options: card.options }
    }
  }
  return finishStageEndAnswer(stage, answer.answer, deps, draw.summary, draw.changes)
}

/** 单阶段草案轮（笔刷约束系统批D）：拟稿→确认→（视答复三态之一）落笔/驳回/结构化剪影决策。
 *  revisionRound（批1·地图草案剪影可视化计划新增）：修订草案环自身的递归调用计数，外部调用方（runHuiyuStage）
 *  永远从缺省 0 开始；只有 comments 决策命中时内部递归自增，达 HUIYU_SKETCH_REVISION_MAX 即封顶退回
 *  现行纯文字确认流程（不再是死循环风险——阻塞驱动下每轮都真实等一次用户输入，提调 advisory 驱动因为
 *  deferred 通道每次都在 accepted/comments 判定前提前返回 awaitingConfirm，天然不会触发递归，见文件头
 *  两条驱动分工说明）。 */
async function runDraftStep(stage: MapStageId, input: RunHuiyuStageInput, deps: RunHuiyuStageDeps, revisionRound = 0): Promise<RunHuiyuStageResult> {
  const draftTools = buildHuiyuDraftToolset({ map: { worldId: deps.worldId }, research: deps.research })
  const instructionsWithSnapshot = await withMapDigestSnapshot(input.instructions, deps.worldId)
  const scopedInput: HuiyuMapWorkInput = {
    ...input,
    instructions: `${instructionsWithSnapshot}\n\n【阶段范围】当前处于「${STAGE_LABEL[stage]}」阶段，草案只应涉及本阶段类目：${describeStageScope(stage)}。`
  }
  const draft = await runHuiyuLayoutDraft(scopedInput, {
    sessionId: deps.sessionId, taskKey: deps.taskKey, tools: draftTools, callModel: deps.draftCallModel || deps.callModel,
    ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
    ...(deps.signal ? { signal: deps.signal } : {})
  })
  if (!draft.ok) {
    return { ok: false, status: 'failed', stage, summary: '', error: draft.error || '拟稿失败' }
  }
  const card = renderHuiyuLayoutDraftConfirmCard(input, draft)
  const answer = await deps.confirmChannel({
    kind: 'draftConfirm', question: card.question, options: card.options,
    ...(card.sketches?.length ? { sketches: card.sketches, worldId: deps.worldId } : {})
  })
  if (answer.deferred) {
    return {
      ok: true, status: 'awaitingConfirm', stage, summary: draft.summary, missingInfo: draft.missingInfo,
      nextStep: 'draw',
      confirmQuestion: {
        question: card.question, options: card.options,
        ...(card.sketches?.length ? { sketches: card.sketches, worldId: deps.worldId } : {})
      }
    }
  }
  // 结构化剪影决策（地图草案剪影可视化计划批1）：答案是 {"kind":"huiyu-sketch-decision",...} JSON 时才生效；
  // 解析失败/非 JSON（含现行确认标签/驳回标签/自由文本）原样走下方现行分支——零回归接缝。
  const decision = parseHuiyuSketchDecision(answer.answer)
  if (!decision) {
    if (isHuiyuDraftRejected(answer.answer)) {
      return { ok: false, status: 'rejected', stage, summary: draft.summary, missingInfo: draft.missingInfo, error: '草案已生成但未获确认' }
    }
    const drawInput = composeHuiyuDrawTaskFromDraft(input, draft, answer.answer)
    return runDrawStep(stage, drawInput, deps)
  }
  let acceptedResult: RunHuiyuStageResult | null = null
  if (decision.accepted.length) {
    const acceptedItems = decision.accepted.map((id) => findSketchById(draft.sketches, id)).filter((item): item is HuiyuDraftSketchItem => Boolean(item))
    const drawInput = composeHuiyuDrawTaskFromSketchDecision(input, draft, decision)
    acceptedResult = await runDrawStep(stage, drawInput, deps, acceptedItems)
  }
  const commentEntries = Object.entries(decision.comments)
  if (!commentEntries.length) {
    return acceptedResult || { ok: false, status: 'rejected', stage, summary: draft.summary, missingInfo: draft.missingInfo, error: '草案已生成但未获确认（决策为空）' }
  }
  if (revisionRound >= HUIYU_SKETCH_REVISION_MAX) {
    // 修订环超出上限：退回现行纯文字确认流程——把决策原文当自由修改意见并入落笔任务书，不再无限来回。
    const fallbackInput = composeHuiyuDrawTaskFromDraft(input, draft, answer.answer)
    const fallbackResult = await runDrawStep(stage, fallbackInput, deps)
    return acceptedResult ? mergeStageResults(acceptedResult, fallbackResult) : fallbackResult
  }
  const revisionInput = composeHuiyuRevisionDraftInput(input, draft, decision)
  const revisionResult = await runDraftStep(stage, revisionInput, deps, revisionRound + 1)
  return acceptedResult ? mergeStageResults(acceptedResult, revisionResult) : revisionResult
}

async function runTerraformStep(stage: MapStageId, input: RunHuiyuStageInput, deps: RunHuiyuStageDeps): Promise<RunHuiyuStageResult> {
  // 系列级授权沿用说明（提速批B）：非空=本次免卡放行，文案会钉进任务书（→运行卡输入段）与完成回执，
  // 让用户始终看得见授权被自动沿用了。
  let grantReuseNote = ''
  if (input.step !== 'draw') {
    // 弹卡前先尝试沿用系列授权（只星依侧传 terraformGrant；提调 advisory 流恒不传，永远走弹卡分支）。
    const reused = deps.terraformGrant?.use() ?? null
    if (reused) {
      grantReuseNote = `已沿用本系列 terraform 授权（${reused.grantedAtLabel} 批准）`
    } else {
      // 系列授权文案只在授权机制在场（星依侧）时追加——提调侧没有 record 能力，不许可诺不兑现。
      const grantHint = deps.terraformGrant
        ? '\n\n批准后 30 分钟内，本会话对同一世界的后续 terraform 改造将自动沿用此授权，无需逐次确认。'
        : ''
      const question = `检测到 terraform 高门槛改造请求（对已确认阶段锁定的内容做改造性修改）：\n${input.instructions}\n\n此操作会突破 Lock 保护，请确认是否批准？${grantHint}`
      const options: HuiyuStageConfirmOption[] = [
        { label: HUIYU_TERRAFORM_APPROVE_LABEL, note: '绘舆将获临时授权，只能按上面描述的范围改动' },
        { label: HUIYU_TERRAFORM_REJECT_LABEL, note: '维持锁定保护，不执行本次修改' }
      ]
      const answer = await deps.confirmChannel({ kind: 'terraformConfirm', question, options })
      if (answer.deferred) {
        return { ok: true, status: 'awaitingConfirm', stage, summary: '', nextStep: 'draw', confirmQuestion: { question, options } }
      }
      if (String(answer.answer || '').trim() !== HUIYU_TERRAFORM_APPROVE_LABEL) {
        // 「不批准」不记录授权——既有拒绝行为不变，下次同系列派发仍会弹卡。
        return { ok: false, status: 'rejected', stage, summary: '', error: 'terraform 改造未获批准' }
      }
      // 星依（非 deferred）场景：拿到真人批准后直接往下走落笔，不需要用户再点第二次。
      // 记录系列授权（提速批B）：30 分钟内本会话+本世界的后续 terraform 派发免卡沿用。
      deps.terraformGrant?.record()
    }
  } else if (String(input.confirmAnswer || '').trim() !== HUIYU_TERRAFORM_APPROVE_LABEL) {
    // 提调重派回入口（step:'draw'+override）：必须带回用户点选的批准标签原文才放行——引擎无法越过
    // 「轮」边界亲自问人，这里的标签等值校验是 deferred 驱动下 terraform 人工仲裁的最后一道门；
    // 答复不是批准标签（含驳回/自由文本/漏传）一律按未批准处理，回执引导重新 askUser。
    return {
      ok: false, status: 'rejected', stage, summary: '',
      error: `terraform 改造未获批准：重派时必须带 confirmAnswer=用户对确认卡的原话，且原话须为「${HUIYU_TERRAFORM_APPROVE_LABEL}」（用户点选确认卡对应选项的原文）才放行`
    }
  }
  const tools = buildHuiyuToolset({ map: buildMapToolsDeps(deps, undefined, true, input.task), research: deps.research })
  const scopedInput: HuiyuMapWorkInput = {
    ...input,
    // grantReuseNote 非空时钉进任务书前部（→renderHuiyuBrief→运行卡输入段），免卡放行必须对用户可见。
    instructions: `${grantReuseNote ? `【${grantReuseNote}】\n\n` : ''}${input.instructions}\n\n【terraform 已获批准】本次写操作可对已确认阶段锁定的要素使用 override:"terraform" 参数改动——只改用户描述范围内的要素，不要借机改动其它已锁定内容。`
  }
  const result = await runHuiyuMapWork(scopedInput, {
    sessionId: deps.sessionId, taskKey: `${deps.taskKey}-terraform`, tools, callModel: deps.callModel,
    ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
    ...(deps.audit ? { audit: deps.audit } : {}), ...(deps.signal ? { signal: deps.signal } : {})
  })
  if (!result.ok) {
    if (result.missingInfo?.length) return { ok: false, status: 'failed', stage, summary: result.summary, missingInfo: result.missingInfo, error: '料不足' }
    return { ok: false, status: 'failed', stage, summary: '', error: result.error || 'terraform 改造失败' }
  }
  // 完成回执也带沿用说明（summary 会进 dispatchXingyiHuiyuStaged 的报告正文）。
  const summaryWithNote = grantReuseNote ? `（${grantReuseNote}）\n${result.summary}` : result.summary
  return { ok: true, status: 'completed', stage, summary: summaryWithNote, changes: result.changes, mapDigest: result.mapDigest }
}

/** 单阶段执行器（笔刷约束系统批D 核心）：给定阶段（由调用方通过 resolveCurrentMapStage 现查后传入——
 *  引擎本身不自己推导，保持纯函数式可测、可强制指定阶段）+ 任务输入 + confirmChannel，跑「草案→确认→
 *  落笔→阶段收尾确认→盖戳」其中的一段或全段（取决于 confirmChannel 是否阻塞，见文件头注释）。
 *  永不抛错（结果如实带 ok/status/error）。 */
export async function runHuiyuStage(stage: MapStageId, input: RunHuiyuStageInput, deps: RunHuiyuStageDeps): Promise<RunHuiyuStageResult> {
  try {
    if (input.override === 'terraform') return await runTerraformStep(stage, input, deps)
    const step = input.step || 'draft'
    if (step === 'draft') return await runDraftStep(stage, input, deps)
    if (step === 'draw') return await runDrawStep(stage, input, deps)
    return await finishStageEndAnswer(stage, String(input.confirmAnswer || ''), deps, '', [])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 'failed', stage, summary: '', error: `阶段引擎运行失败：${message}` }
  }
}

/** 阻塞式确认通道构造器（星依驱动专用）：把「问题→Promise<string>」形态的 askUser（浮坞 requestAskUser）
 *  包装成 HuiyuStageConfirmChannel（真阻塞，永远 deferred:false）——XingyiDock.vue 用它把自己的
 *  requestAskUser 接进共享引擎，不用每次手写适配闭包。 */
export function buildBlockingConfirmChannel(
  askUser: (request: {
    question: string; options: HuiyuStageConfirmOption[]; allowOtherInput?: boolean
    /** 批1·可选增强：draftConfirm 且绘舆给了 sketches 时才有，透传给 askUser 供浮坞画 overlay。
     *  现役 XingyiDock.vue 的 requestAskUser 还未消费这两个字段（批2/3 UI 工作），此处先把管道打通——
     *  不改就等于 sketches 永远到不了阻塞驱动的 UI。 */
    sketches?: HuiyuDraftSketchItem[]; worldId?: string
  }) => Promise<string>
): HuiyuStageConfirmChannel {
  return async (request) => {
    const answer = await askUser({
      question: request.question, options: request.options, allowOtherInput: true,
      ...(request.sketches?.length ? { sketches: request.sketches, worldId: request.worldId } : {})
    })
    return { deferred: false, answer }
  }
}

/** 非阻塞（立即 deferred）确认通道（提调驱动专用）：提调 loop 没有能在单次工具调用内挂起等真人的通道，
 *  每次确认点都立即返回 deferred:true——buildHuiyuDispatchSeam 用它把 runHuiyuStage 的行为收敛成
 *  "stage-per-dispatch"（每次派发只做一个分段），配合回执文案引导提调用自己的 askUser 问人+重新派发。 */
export const NON_BLOCKING_CONFIRM_CHANNEL: HuiyuStageConfirmChannel = async () => ({ deferred: true })

export interface RunHuiyuDraftThenDrawDeps {
  sessionId: string
  /** huiyu.dispatch 统一原始可见上下文；草案与确认后的落笔轮共用。 */
  contextBlock?: string
  taskKey: string
  worldId: string
  research?: CaifengToolsetDeps | null
  callModel: RunHuiyuMapWorkDeps['callModel']
  /** 草案轮专用 callModel（可选·缺省用 callModel）：与 RunHuiyuStageDeps.draftCallModel 同义。 */
  draftCallModel?: RunHuiyuMapWorkDeps['callModel']
  confirmChannel: HuiyuStageConfirmChannel
  audit?: RunHuiyuMapWorkDeps['audit']
  signal?: AbortSignal
}

export interface RunHuiyuDraftThenDrawResult {
  ok: boolean
  content: string
  details: Record<string, unknown>
}

/** 单次落笔+报告拼装（legacy 两段式共享子步骤·地图草案剪影可视化计划批1 从 runHuiyuDraftThenDraw 抽出，
 *  供「现行分支」「accepted 分支」「修订环封顶回退分支」三处共用，行为与批A~W 完全一致）。 */
async function runHuiyuDraftThenDrawDraw(
  drawInput: HuiyuMapWorkInput,
  deps: RunHuiyuDraftThenDrawDeps,
  acceptedItems?: HuiyuDraftSketchItem[]
): Promise<RunHuiyuDraftThenDrawResult> {
  // 自动扩探需要"落笔前"快照，见 runDrawStep 同名逻辑注释（legacy 通道无 sheetId 概念，恒用主图纸）。
  const beforeIds = await snapshotFeatureIds(deps.worldId, undefined)
  // 批L：legacy 两段式落笔同样带派发运行标识（runKey=taskKey、runLabel=任务标题）进变更日志
  const drawTools = buildHuiyuToolset({ map: { worldId: deps.worldId, runMeta: { runKey: deps.taskKey, runLabel: drawInput.task } }, research: deps.research })
  const runRound = (roundInput: HuiyuMapWorkInput, taskKeySuffix: string): Promise<HuiyuMapWorkResult> => runHuiyuMapWork(roundInput, {
    sessionId: deps.sessionId, taskKey: taskKeySuffix ? `${deps.taskKey}-${taskKeySuffix}` : deps.taskKey, tools: drawTools, callModel: deps.callModel,
    ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
    ...(deps.audit ? { audit: deps.audit } : {}), ...(deps.signal ? { signal: deps.signal } : {})
  })
  const draw: HuiyuMapWorkResult = await drawWithContinuationLoop(runRound, drawInput, acceptedItems, deps.worldId, undefined)
  if (draw.ok) {
    const expandNote = await autoExpandExploredForNewFeatures(deps.worldId, undefined, beforeIds, deps.taskKey, drawInput.task)
    if (expandNote) draw.changes = [...draw.changes, expandNote]
  }
  const lines = [`绘舆任务「${drawInput.task}」${draw.ok ? '已交稿' : '未完成'}：`, draw.summary || draw.error || '']
  if (draw.changes.length) lines.push('', '改动清单：' + draw.changes.map((item) => `· ${item}`).join(' '))
  if (draw.mapDigest) lines.push('', `【当前地图格局】${draw.mapDigest}`)
  return {
    ok: draw.ok,
    content: lines.join('\n'),
    details: {
      changes: draw.changes, mapDigest: draw.mapDigest,
      ...(draw.missingInfo?.length ? { missingInfo: draw.missingInfo } : {}),
      ...(draw.error ? { error: draw.error } : {})
    }
  }
}

/** 合并「已采纳部分落笔结果」与「修订环最终结果」（legacy 通道版，批1·同 mergeStageResults 语义）。 */
function mergeDraftThenDrawOutcomes(first: RunHuiyuDraftThenDrawResult, second: RunHuiyuDraftThenDrawResult): RunHuiyuDraftThenDrawResult {
  return { ok: second.ok, content: [first.content, second.content].filter(Boolean).join('\n\n'), details: { ...first.details, ...second.details } }
}

/** legacy 两段式派发（mode:'draft'，地图严谨协作计划批3 原逻辑·2026-07-12 从 XingyiDock.vue 抽出）：
 *  拟草案→确认卡→确认/驳回/修改→落笔，不涉及阶段/Lock/盖戳（stage 参数不传给 buildHuiyu*Toolset，
 *  行为与批A~W 完全一致，真机零回归）。星依/提调的 mode:'draft' 都走这条，与 mode:'staged' 走
 *  runHuiyuStage 是两条并列路径——同引擎两种驱动，此函数是"同引擎两种能力"的另一层复用（legacy
 *  两段式 vs 新阶段管线），XingyiDock.vue 的 dispatchXingyiHuiyuDraftThenDraw 现直接调用本函数。
 *  revisionRound（批1）：与 runDraftStep 同一套结构化剪影决策+修订环语义，见该函数注释；本函数外部
 *  调用方永远从缺省 0 开始。 */
export async function runHuiyuDraftThenDraw(input: HuiyuMapWorkInput, deps: RunHuiyuDraftThenDrawDeps, revisionRound = 0): Promise<RunHuiyuDraftThenDrawResult> {
  const draftTools = buildHuiyuDraftToolset({ map: { worldId: deps.worldId }, research: deps.research })
  const draft: HuiyuLayoutDraftResult = await runHuiyuLayoutDraft(input, {
    sessionId: deps.sessionId, taskKey: deps.taskKey, tools: draftTools, callModel: deps.draftCallModel || deps.callModel,
    ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
    ...(deps.signal ? { signal: deps.signal } : {})
  })
  if (!draft.ok) {
    return {
      ok: false,
      content: `绘舆草案「${input.task}」未能生成：${draft.error || '未知原因'}。可把剧情事实写得更具体后重试。`,
      details: { reason: 'draft-failed', ...(draft.error ? { error: draft.error } : {}) }
    }
  }
  const card = renderHuiyuLayoutDraftConfirmCard(input, draft)
  const answer = await deps.confirmChannel({
    kind: 'draftConfirm', question: card.question, options: card.options,
    ...(card.sketches?.length ? { sketches: card.sketches, worldId: deps.worldId } : {})
  })
  const answerText = answer.deferred ? '' : answer.answer
  // 结构化剪影决策（批1）：与 runDraftStep 同一套判定，legacy 通道也同步支持；解析失败/非 JSON 原样走现行分支。
  const decision = parseHuiyuSketchDecision(answerText)
  if (!decision) {
    if (isHuiyuDraftRejected(answerText)) {
      const missingLine = draft.missingInfo.length ? `\n缺料清单：${draft.missingInfo.map((item) => `· ${item}`).join(' ')}` : ''
      return {
        ok: false,
        content: `绘舆草案「${input.task}」已生成但未落笔（用户未确认/驳回）：\n${draft.summary}${missingLine}`,
        details: { reason: 'draft-rejected', missingInfo: draft.missingInfo }
      }
    }
    const drawInput = composeHuiyuDrawTaskFromDraft(input, draft, answerText)
    return runHuiyuDraftThenDrawDraw(drawInput, deps)
  }
  let acceptedOutcome: RunHuiyuDraftThenDrawResult | null = null
  if (decision.accepted.length) {
    const acceptedItems = decision.accepted.map((id) => findSketchById(draft.sketches, id)).filter((item): item is HuiyuDraftSketchItem => Boolean(item))
    const drawInput = composeHuiyuDrawTaskFromSketchDecision(input, draft, decision)
    acceptedOutcome = await runHuiyuDraftThenDrawDraw(drawInput, deps, acceptedItems)
  }
  const commentEntries = Object.entries(decision.comments)
  if (!commentEntries.length) {
    return acceptedOutcome || {
      ok: false,
      content: `绘舆草案「${input.task}」已生成但未获有效确认（决策内容为空）：\n${draft.summary}`,
      details: { reason: 'draft-rejected', missingInfo: draft.missingInfo }
    }
  }
  if (revisionRound >= HUIYU_SKETCH_REVISION_MAX) {
    const fallbackInput = composeHuiyuDrawTaskFromDraft(input, draft, answerText)
    const fallbackOutcome = await runHuiyuDraftThenDrawDraw(fallbackInput, deps)
    return acceptedOutcome ? mergeDraftThenDrawOutcomes(acceptedOutcome, fallbackOutcome) : fallbackOutcome
  }
  const revisionInput = composeHuiyuRevisionDraftInput(input, draft, decision)
  const revisionOutcome = await runHuiyuDraftThenDraw(revisionInput, deps, revisionRound + 1)
  return acceptedOutcome ? mergeDraftThenDrawOutcomes(acceptedOutcome, revisionOutcome) : revisionOutcome
}

/** 确认卡选项渲染（回执文本用）：`1. 标签（说明）` 逐行。 */
function renderConfirmOptions(options: HuiyuStageConfirmOption[]): string {
  return options.map((opt, i) => `${i + 1}. ${opt.label}${opt.note ? `（${opt.note}）` : ''}`).join('\n')
}

/** 提调驱动回执渲染（stage-per-dispatch·批D；人在环上通道统一批C 改写）：把 RunHuiyuStageResult 翻成给
 *  统筹/纠偏 loop 看的回执——awaitingConfirm 时告知它「确认卡已经由 buildHuiyuDispatchSeam 经
 *  huiyuStageConfirmState 直接递给用户（advisory 非阻塞·提调坞渲染），不需要你自己转呈，本轮照常收尾；
 *  用户答复后由注册的 resume handler 自动带 stagedStep/confirmAnswer 续派」。同时保留原手动续派参数口径
 *  作为【降级兜底】：卡片是内存态，若刷新丢失导致用户没见到卡，模型仍可读到这段文字，自己用 askUser
 *  转呈+带参重派——丢卡不丢需求。星依驱动不用本函数（阻塞通道一次走完，浮坞自己拼报告）。 */
export function renderHuiyuStageDispatchReceipt(input: { task: string }, result: RunHuiyuStageResult): string {
  const stageLabel = STAGE_LABEL[result.stage] || result.stage
  if (result.status === 'awaitingConfirm' && result.confirmQuestion) {
    const fallbackRedispatch = result.nextStep === 'confirmStage'
      ? '重新调用 dispatchMapWork：mode:"staged"、stagedStep:"confirmStage"、confirmAnswer=用户原话（点选标签或修改意见，原样转交不要改写）。'
      : `重新调用 dispatchMapWork：mode:"staged"、stagedStep:"draw"${result.confirmQuestion.options.some((o) => o.label === HUIYU_TERRAFORM_APPROVE_LABEL) ? '、override:"terraform"、confirmAnswer=用户原话（须为批准标签原文才放行）' : '，并把确认后的草案要点与用户修改意见并入 instructions'}。用户驳回则不必重派，如实回归剧情。`
    const lines = [
      `绘舆阶段制任务「${input.task}」（当前「${stageLabel}」阶段）：本分段已完成，需要用户确认后才能继续。`,
      '',
      '【确认卡已经直接递给用户（提调坞非阻塞展示），无需你转呈——本轮照常收尾即可；用户答复后会自动续派该阶段，进展见运行卡】',
      result.confirmQuestion.question,
      '',
      '选项：',
      renderConfirmOptions(result.confirmQuestion.options),
      '',
      `【降级兜底】卡片是内存态，若因刷新等原因没能送达用户，你也可以自己用 askUser 把上面的问题与选项原样呈给用户，拿到答复后${fallbackRedispatch}`
    ]
    return lines.join('\n')
  }
  if (result.status === 'completed') {
    const lines = [`绘舆阶段制任务「${input.task}」：「${stageLabel}」阶段已收尾。`, result.summary || '']
    if (result.changes?.length) lines.push('', '改动清单：' + result.changes.map((c) => `· ${c}`).join(' '))
    if (result.stampedFeatureIds?.length) lines.push('', `本阶段 ${result.stampedFeatureIds.length} 个要素已确认锁定（后续阶段不可随意改动）。`)
    if (result.mapDigest) lines.push('', `【当前地图格局】${result.mapDigest}`)
    lines.push('', result.nextStage
      ? `下一阶段是「${STAGE_LABEL[result.nextStage]}」：剧情需要继续铺设时再派 dispatchMapWork（mode:"staged"）即可从该阶段开始；不需要就先回归剧情。`
      : '三阶段均已推进到人文阶段（终点阶段，可持续追加内容），后续小改动用 mode:"draw" 即可。')
    return lines.join('\n')
  }
  if (result.status === 'rejected') {
    return `绘舆阶段制任务「${input.task}」（「${stageLabel}」阶段）止步：${result.error || '未获用户确认'}。${result.summary ? `\n${result.summary}` : ''}\n已绘制内容保留（未锁定），不必自动重派；用户改主意后可再派发续推。`
  }
  const missingLine = result.missingInfo?.length ? `\n缺料清单：${result.missingInfo.map((item) => `· ${item}`).join(' ')}` : ''
  return `绘舆阶段制任务「${input.task}」（「${stageLabel}」阶段）未完成：${result.error || '未知原因'}${missingLine}\n可把剧情事实补充得更具体后重派。`
}

export interface RunHuiyuDraftForRelayDeps {
  sessionId: string
  /** huiyu.dispatch 统一原始可见上下文。 */
  contextBlock?: string
  taskKey: string
  worldId: string
  research?: CaifengToolsetDeps | null
  callModel: RunHuiyuMapWorkDeps['callModel']
  signal?: AbortSignal
}

/** 提调驱动的 mode:'draft'（批D 补齐·与星依 mode:'draft' 对位）：只跑草案轮，把草案确认卡内容当回执
 *  带回给统筹/纠偏——提调用自己的 askUser 转呈用户，确认后带着草案要点重派 mode:'draw' 落笔。
 *  与 runHuiyuDraftThenDraw（星依阻塞式一次走完）是同一草案能力的两种驱动形态。 */
export async function runHuiyuDraftForRelay(input: HuiyuMapWorkInput, deps: RunHuiyuDraftForRelayDeps): Promise<RunHuiyuDraftThenDrawResult> {
  const draftTools = buildHuiyuDraftToolset({ map: { worldId: deps.worldId }, research: deps.research })
  const draft = await runHuiyuLayoutDraft(input, {
    sessionId: deps.sessionId, taskKey: deps.taskKey, tools: draftTools, callModel: deps.callModel,
    ...(deps.contextBlock ? { contextBlock: deps.contextBlock } : {}),
    ...(deps.signal ? { signal: deps.signal } : {})
  })
  if (!draft.ok) {
    return {
      ok: false,
      content: `绘舆草案「${input.task}」未能生成：${draft.error || '未知原因'}。可把剧情事实写得更具体后重派。`,
      details: { reason: 'draft-failed', ...(draft.error ? { error: draft.error } : {}) }
    }
  }
  const card = renderHuiyuLayoutDraftConfirmCard(input, draft)
  const lines = [
    `绘舆草案「${input.task}」已拟好（还没落笔）。`,
    '',
    '【请用 askUser 把下面的草案确认卡原样呈给用户（问题与选项都别改写）】',
    card.question,
    '',
    '选项：',
    renderConfirmOptions(card.options),
    '',
    '【拿到答复后】用户确认/给修改意见→重派 dispatchMapWork（mode:"draw"，instructions=原任务书+已确认草案要点+用户修改意见）；用户驳回→不必重派，如实回归剧情。'
  ]
  return {
    ok: true,
    content: lines.join('\n'),
    details: { reason: 'draft-relayed', missingInfo: draft.missingInfo }
  }
}

export { HUIYU_DRAFT_CONFIRM_LABEL, HUIYU_DRAFT_REJECT_LABEL }
