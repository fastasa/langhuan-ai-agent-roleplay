/**
 * 提调（Tidiao）「本轮剧本」协议底座 —— 世界总编排器升格计划书 批次 0。
 *
 * 定位（计划书 §4.2 / §4.3-bis / §4.15）：
 * - 提调是 **bounded agent（有界 agent）**：现役自研 `runAgentRuntime` 的 loop 预算 + 最小护栏 +
 *   可审计 transcript 已构成「有界舞台」；本计划**正式化现有自研有界 loop，不引入 Vercel AI SDK**
 *   （§4.0「手段能省则省」+ §4.11「整包换框架会与真值层打架」的取舍）。
 * - 「本轮剧本」是提调有界 loop 的**结构化产物 + 审计轨迹**，由 harness 从 transcript + 工具结果
 *   汇编而成，而非单轮模型输出。它**升格替换**现有 `ReplyPlanOrchestration`。
 *
 * 命名边界（用户 2026-06-17 拍板）：代码新模块/类型与面向用户的中文文案用「提调 / Tidiao」；
 * 已落库的持久化审计字段 `personality_model_trace`（及其 `.orchestration`）**字段名保留不动**，
 * 零 DB 迁移、零历史审计断裂——本剧本仍序列化落在 `personality_model_trace.orchestration` 位置。
 *
 * 本批次（批次 0）只冻结协议类型与底座；现役主链路仍产出 `ReplyPlanOrchestration`，
 * 切换为消费本协议留到批次 3。带 status:'planned' 的字段本批只冻类型、不填值，由后续批次填：
 * - retrieval（取料三件套）→ 批次 1
 * - narration（旁白二分类语义标注）→ 批次 2
 * - trace.thoughts（过程态实时旁述）→ 批次 3（UI 消费）
 * - cast（发言权接管）→ 批次 6
 */

import type {
  ReplyPlanCandidate,
  ReplyPlanExpressionMix,
  ReplyPlanOrchestration,
  ReplyPlanOrchestratorToolCall,
  ReplyPlanStrategySpec
} from './personalityPlanOrchestrator'
import type { ReplyWorkflowMode } from './chatReplyPipelineMode'
import type { AgentRuntimeBudget } from './agentRuntime/runtime'

/** 协议版本：持久化剧本的升级判定锚点（沿用编排配置 normalize 的「版本字符串」机制）。 */
export const TIDIAO_SCRIPT_SCHEMA_VERSION = 'tidiao-script-v1'

// ─────────────────────────────────────────────────────────────────────────────
// 有界舞台预算（正式化现有自研有界 loop）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 提调有界舞台预算：把现役 `runAgentRuntime` 的 loop 预算正式化为提调的「有界舞台」契约。
 * 这是对「现有自研有界 loop」的命名与文档化，**不引入 Vercel AI SDK**。
 * 运行时实例即 `replyPlanOrchestratorHarness` 的 `ReplyPlanOrchestratorLoopBudget`
 * （maxTurns / maxToolCalls 直接喂给 `runAgentRuntime` 的 {@link AgentRuntimeBudget}）。
 */
export interface TidiaoBoundedStageBudget extends AgentRuntimeBudget {
  /** 元工具（读情境 / 读手册 / 改世界）调用预算。 */
  maxMetaToolCalls: number
}

/** 有界舞台的「最小护栏」语义标注（§4.2 ②）：仅安全 + 踩过坑的硬边界，**不是流程脚本**。 */
export type TidiaoStageGuardId =
  | 'curtain_location'   // updateCurtainScene 地点护栏（必须正经地点名称，禁占位词）
  | 'read_only'          // 提调只读：改世界走受控工具，不给裸写权限
  | 'conservative_narration' // 旁白二分类偏保守：拿不准算信息承载

// ─────────────────────────────────────────────────────────────────────────────
// 工具包边界（§4.6：按「世界能力」切，非技术步骤）
// ─────────────────────────────────────────────────────────────────────────────

export type TidiaoToolPackageId = 'narration' | 'retrieval' | 'worldChange' | 'cast'

export interface TidiaoToolPackageSpec {
  id: TidiaoToolPackageId
  /** 面向用户/审计的中文文案与图标。 */
  label: string
  icon: string
  /** 揉进工具包的轻量 skill：「何时用」描述（§4.6 原则）。 */
  whenToUse: string
  /** 归属该包的底层工具名（含现役 active 与规划中 planned）。 */
  tools: string[]
  /** 本批是否已有运行时实现：active=现役可调用；planned=后续批次实现。 */
  status: 'active' | 'planned'
  /** planned 包由哪一批次落地。 */
  plannedBatch?: number
}

/**
 * 提调工具包边界冻结（§4.6）。底层最小粒度工具可复用，向上聚类成这四个「世界能力」大包，每包带「何时用」。
 * 注意：`readScenarioSkill / getToolManual`（元工具）与 `generatePlanBatch / reviewPlanCandidates`
 * （计划产出核心）不属于这四个世界能力包，是提调编排原语，单列在 {@link TIDIAO_CORE_TOOLS}。
 */
export const TIDIAO_TOOL_PACKAGES: readonly TidiaoToolPackageSpec[] = [
  {
    id: 'worldChange',
    label: '改世界',
    icon: '🌍',
    whenToUse: '用户在当前输入里明确表达快进时间或改变地点意图时调用；普通环境提及、回忆、假设、单纯投影比较都不算。地点必须是正经地点名称并按大/中/小三段递进（大=洲/国、中=城市、小=村/镇/街道或具体场所），气氛/描写句不是地点，禁止占位词。',
    tools: ['updateCurtainScene'],
    status: 'active'
  },
  {
    id: 'retrieval',
    label: '取料',
    icon: '🔍',
    whenToUse: '需要「不确定、偶尔才要的特殊料」（冷门世界设定、某角色特定外貌细节）时主动取，并显式产出取/不取什么、为何。常规料（最近聊天、身份底座、在场信息）由框架自动供给，不调用本包。',
    tools: ['recallSemantic', 'searchWorldText', 'fetchUnitDetail'],
    status: 'planned',
    plannedBatch: 1
  },
  {
    id: 'narration',
    label: '叙事',
    icon: '🎬',
    whenToUse: '需要旁白（环境/外貌/事件）时调度。二分类（信息承载/纯描写）仅作语义标注供审计与角色承接判断，统一串行承接，不做串/并行性能分流；拿不准算信息承载（偏保守）。',
    tools: ['confirmNarrationCall', 'readNarrationSkill'],
    status: 'planned',
    plannedBatch: 2
  },
  {
    id: 'cast',
    label: '点角色',
    icon: '🎭',
    whenToUse: '决定本轮谁出场、出场顺序；只把当前场景在场角色纳入候选。用户显式点名/@ 为强制信号必须保留。',
    tools: ['pickCast'],
    status: 'planned',
    plannedBatch: 6
  }
] as const

/** 提调编排原语：不属于四个世界能力包的元工具与计划产出核心工具。 */
export const TIDIAO_CORE_TOOLS = {
  meta: ['readScenarioSkill', 'getToolManual'],
  planProduction: ['generatePlanBatch', 'reviewPlanCandidates']
} as const

// ─────────────────────────────────────────────────────────────────────────────
// 本轮剧本（TidiaoScript）—— 升格 ReplyPlanOrchestration
// ─────────────────────────────────────────────────────────────────────────────

/** A 情境判断（§4.3-bis 步1）。 */
export interface TidiaoSituation {
  /** 情境 code（沿用现 ReplyPlanOrchestration.scenario）。 */
  scenario: string
  sceneChange: {
    /** 帷幕/场景是否变化。 */
    changed: boolean
    /** 场景变化提醒（沿用 sceneChangeNotice）。 */
    notice?: string
    /** updateCurtainScene 结果留痕（previous/next/patch/undoPatch），供审计与手动撤回。 */
    curtainUpdate?: Record<string, unknown> | null
  }
}

/** B 写作维度决策（§4.3-bis 步2，剧本重心）。 */
export interface TidiaoWritingDecision {
  /** 本轮要写的写作维度（环境描写/角色反应/对白…）。本批新增模型产出项。 */
  dimensions: string[]
  /** 为何这些维度（审计）。 */
  reason: string
  /** 表达占比唯一真值（沿用现 expressionMix；PM 必达 / NR 豁免为 null）。 */
  expressionMix: ReplyPlanExpressionMix | null
}

/** C 取料记录（§4.3-bis 步3）。只记录提调主动取的特殊料；常规料框架自动供给、不入列。 */
export interface TidiaoRetrievalDecision {
  /** 取料三件套（§4.5）：语义召回 / 文本搜索(rg) / 定点读取。 */
  kind: 'semantic' | 'textSearch' | 'fetch'
  query: string
  /** 为何取这料（审计）。 */
  reason: string
  /** 取到什么（摘要，审计）。 */
  hitSummary?: string
}

/** 产出：点角色 cast（§4.6）。批次 6 才真正接管发言权，本批先冻字段。 */
export interface TidiaoCastEntry {
  characterName: string
  /** 出场顺序。 */
  order: number
  /** 用户点名/@ 强制信号。 */
  forced?: boolean
}

/** 产出：旁白清单（§4.4 二分类仅语义标注）。批次 2 由叙事工具包填。 */
export interface TidiaoNarrationEntry {
  /** 信息承载 / 纯描写（仅语义标注，不做性能分流）。 */
  kind: 'informative' | 'descriptive'
  /** 落真实 profile.id（沿用现 selector 解析真值边界）。 */
  profileIds: string[]
  /** 模型自写理由（沿用现 reason 必填校验）。 */
  reason: string
}

/** D 产出计划（§4.3-bis 步4-6，承接现有编排器）。 */
export interface TidiaoPlans {
  /** 候选全集（沿用现 candidates）。 */
  candidates: ReplyPlanCandidate[]
  /** 前三/单计划（沿用现 topPlans 等价物）。 */
  topPlans: ReplyPlanCandidate[]
  /** 审计派生字段（沿用现 strategyMatrix）。 */
  strategyMatrix: ReplyPlanStrategySpec[]
  /** 计划/评审工具调用留痕（沿用现 planToolCalls）。 */
  toolCalls: ReplyPlanOrchestratorToolCall[]
}

/** F 留痕（§4.15 结果态 + 过程态）。 */
export interface TidiaoTrace {
  /** 审计摘要（沿用现 orchestrationSummary）。 */
  orchestrationSummary: string
  /** 过程态实时旁述逐句（§4.15）。批次 3 UI 才消费，本批先冻。 */
  thoughts: string[]
}

/** 本轮剧本：提调有界 loop 的结构化产物 + 审计轨迹（升格 ReplyPlanOrchestration）。 */
export interface TidiaoScript {
  schemaVersion: typeof TIDIAO_SCRIPT_SCHEMA_VERSION
  mode: ReplyWorkflowMode
  meta: {
    /** 柔和高亮引导纠错（§4.15）。 */
    lowConfidence?: boolean
    /** 评审降级等（沿用现 diagnostics.degraded）。 */
    degraded?: boolean
  }
  situation: TidiaoSituation
  writingDecision: TidiaoWritingDecision
  retrieval: { decisions: TidiaoRetrievalDecision[] }
  cast: TidiaoCastEntry[]
  narration: TidiaoNarrationEntry[]
  plans: TidiaoPlans
  trace: TidiaoTrace
}

// ─────────────────────────────────────────────────────────────────────────────
// 升格汇编：从现役 ReplyPlanOrchestration 构建 TidiaoScript
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildTidiaoScriptInput {
  mode: ReplyWorkflowMode
  orchestration: ReplyPlanOrchestration
  /** 前三/单计划（harness 已分别计算，避免本模块重复推导）。 */
  topPlans: ReplyPlanCandidate[]
  sceneChange?: {
    changed: boolean
    notice?: string
    curtainUpdate?: Record<string, unknown> | null
  }
  /** 写作维度决策（批次 3 主链路接入后由模型产出；本批/缺失时为空占位）。 */
  writingDimensions?: { dimensions: string[]; reason: string }
  meta?: { lowConfidence?: boolean; degraded?: boolean }
  /** 过程态实时旁述（批次 3 接入）。 */
  thoughts?: string[]
}

/**
 * 把现役 `ReplyPlanOrchestration` 升格汇编为 `TidiaoScript`。
 * 现役链路尚未产出的字段（retrieval/cast/narration/writingDecision.dimensions/trace.thoughts）
 * 一律落空占位，保证「本批只冻类型、不假装下游能力已完成」。
 */
export function buildTidiaoScript(input: BuildTidiaoScriptInput): TidiaoScript {
  const { orchestration } = input
  return {
    schemaVersion: TIDIAO_SCRIPT_SCHEMA_VERSION,
    mode: input.mode,
    meta: {
      ...(input.meta?.lowConfidence ? { lowConfidence: true } : {}),
      ...(input.meta?.degraded ? { degraded: true } : {})
    },
    situation: {
      scenario: String(orchestration.scenario || ''),
      sceneChange: {
        changed: input.sceneChange?.changed ?? false,
        ...(input.sceneChange?.notice ? { notice: input.sceneChange.notice } : {}),
        ...(input.sceneChange?.curtainUpdate !== undefined
          ? { curtainUpdate: input.sceneChange.curtainUpdate }
          : {})
      }
    },
    writingDecision: {
      dimensions: input.writingDimensions?.dimensions ?? [],
      reason: input.writingDimensions?.reason ?? '',
      expressionMix: orchestration.expressionMix ?? null
    },
    retrieval: { decisions: [] },
    cast: [],
    narration: [],
    plans: {
      candidates: orchestration.candidates ?? [],
      topPlans: input.topPlans ?? [],
      strategyMatrix: orchestration.strategyMatrix ?? [],
      toolCalls: orchestration.toolCalls ?? []
    },
    trace: {
      orchestrationSummary: orchestration.orchestrationSummary ?? '',
      thoughts: input.thoughts ?? []
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 持久化归一与升级判定
// ─────────────────────────────────────────────────────────────────────────────

/** 判断一份持久化剧本是否为当前协议版本。 */
export function isTidiaoScriptCurrent(raw: unknown): raw is TidiaoScript {
  return Boolean(
    raw
    && typeof raw === 'object'
    && (raw as { schemaVersion?: unknown }).schemaVersion === TIDIAO_SCRIPT_SCHEMA_VERSION
  )
}

/**
 * 归一化任意来源（旧 ReplyPlanOrchestration 形态 / 旧版剧本 / 残缺对象）到当前 TidiaoScript。
 * 缺字段一律补空占位；非法对象回退为空壳剧本。供审计读侧与历史记录兼容使用。
 */
export function normalizeTidiaoScript(raw: unknown, mode: ReplyWorkflowMode = 'personality_model'): TidiaoScript {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {}
  const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : [])
  const situation = record.situation && typeof record.situation === 'object' ? record.situation : {}
  const sceneChange = situation.sceneChange && typeof situation.sceneChange === 'object' ? situation.sceneChange : {}
  const writing = record.writingDecision && typeof record.writingDecision === 'object' ? record.writingDecision : {}
  const plans = record.plans && typeof record.plans === 'object' ? record.plans : {}
  const trace = record.trace && typeof record.trace === 'object' ? record.trace : {}
  const meta = record.meta && typeof record.meta === 'object' ? record.meta : {}

  return {
    schemaVersion: TIDIAO_SCRIPT_SCHEMA_VERSION,
    mode: (record.mode === 'normal_recall' ? 'normal_recall' : mode) as ReplyWorkflowMode,
    meta: {
      ...(meta.lowConfidence ? { lowConfidence: true } : {}),
      // 旧 ReplyPlanOrchestration 的降级标记在 diagnostics.degraded
      ...(meta.degraded || record?.diagnostics?.degraded ? { degraded: true } : {})
    },
    situation: {
      // 兼容旧 orchestration：scenario 直接落在顶层
      scenario: String(situation.scenario ?? record.scenario ?? ''),
      sceneChange: {
        changed: Boolean(sceneChange.changed),
        ...(sceneChange.notice ? { notice: String(sceneChange.notice) } : {}),
        ...(sceneChange.curtainUpdate !== undefined ? { curtainUpdate: sceneChange.curtainUpdate } : {})
      }
    },
    writingDecision: {
      dimensions: arr<string>(writing.dimensions),
      reason: String(writing.reason ?? ''),
      expressionMix: (writing.expressionMix ?? record.expressionMix ?? null) as ReplyPlanExpressionMix | null
    },
    retrieval: {
      decisions: arr<TidiaoRetrievalDecision>(record?.retrieval?.decisions)
    },
    cast: arr<TidiaoCastEntry>(record.cast),
    narration: arr<TidiaoNarrationEntry>(record.narration),
    plans: {
      candidates: arr<ReplyPlanCandidate>(plans.candidates ?? record.candidates),
      topPlans: arr<ReplyPlanCandidate>(plans.topPlans),
      strategyMatrix: arr<ReplyPlanStrategySpec>(plans.strategyMatrix ?? record.strategyMatrix),
      toolCalls: arr<ReplyPlanOrchestratorToolCall>(plans.toolCalls ?? record.toolCalls)
    },
    trace: {
      orchestrationSummary: String(trace.orchestrationSummary ?? record.orchestrationSummary ?? ''),
      thoughts: arr<string>(trace.thoughts)
    }
  }
}
