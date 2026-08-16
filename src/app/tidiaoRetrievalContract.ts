/**
 * 提调「取料三件套」工具契约 —— 世界总编排器升格计划书 批次 1（子批 1a）。
 *
 * 定位（§4.5 / §4.13）：提调取信息分三种动作，都按需调用、渐进式暴露（progressive disclosure）。
 * 本契约是提调与「文档库存储」之间的**解耦接口**：提调只认这里的工具契约，后端实现可渐进迁移——
 * - 文本搜索（textSearch）后端本批先用 DB 文档库全文检索（SQL LIKE/FTS），等文档库统一 md 升格
 *   （§4.13 独立工程）后再切真正的 rg-on-files，契约不变。
 *
 * 权限边界（§4.5）：提调只读不写。三件套全部 readOnly:true；改世界（写文档/改设定）走
 * 受控工具或人（见提调工具包 worldChange/updateCurtainScene），不给取料工具任何写能力。
 *
 * 混合取料边界（§4.5 + §4.0）：常规、几乎每轮都要的料（最近聊天、身份底座、在场信息）由框架
 * 自动/缓存供给，❌ 不调用本契约；只有「不确定、偶尔才要的特殊料」（冷门世界设定、某角色特定
 * 外貌细节）才由提调主动用这三件套取，并显式产出取料决策（写入剧本 retrieval，供审计）。
 */

import type { TidiaoRetrievalDecision } from './tidiaoScript'

/** 取料三件套动作类型（与剧本 TidiaoRetrievalDecision.kind 对齐）。 */
export type TidiaoRetrievalKind = 'semantic' | 'textSearch' | 'fetch'

/** 定点读取的粒度：摘要 vs 正文（§4.5「定点读取摘要或正文」）。 */
export type TidiaoFetchLevel = 'summary' | 'body'

// ─────────────────────────────────────────────────────────────────────────────
// 工具契约（解耦存储）
// ─────────────────────────────────────────────────────────────────────────────

export interface TidiaoRetrievalToolContract {
  kind: TidiaoRetrievalKind
  /** 工具机器名（与 TIDIAO_TOOL_PACKAGES 的 retrieval.tools 一一对应）。 */
  toolName: string
  /** 面向用户/审计的中文文案。 */
  label: string
  /** 揉进工具的轻量 skill：「何时用」描述（渐进式暴露入口）。 */
  whenToUse: string
  /** 提调只读硬约束：三件套永远为 true，不给写能力。 */
  readOnly: true
}

/** 语义召回：找「意思相近」的料（embedding 检索），复用现有角色大脑召回基建。 */
export const TIDIAO_SEMANTIC_RECALL_CONTRACT: TidiaoRetrievalToolContract = {
  kind: 'semantic',
  toolName: 'recallSemantic',
  label: '语义召回',
  whenToUse: '当需要「意思相近」但说不准关键词的特殊料时用（如某段氛围相关设定）。命中靠 embedding 相似度，不要求字面匹配。'
    + '一次 query 只放一个检索意图；有多个不相干意图时放 queries 数组分项召回（各自打分、同单位取最高分合并），不要拼成一句话互相稀释。'
    + '常规角色资料由框架自动供给，不用本工具。',
  readOnly: true
}

/** 文本搜索：按关键词/正则精确检索 md 资源（类比 Claude Code 的 Grep）。
 *  本批后端用 DB 文档库全文检索，文档库升格 md 后切真 rg，契约不变。 */
export const TIDIAO_TEXT_SEARCH_CONTRACT: TidiaoRetrievalToolContract = {
  kind: 'textSearch',
  toolName: 'searchWorldText',
  label: '文本搜索',
  // 核心用例（用户 2026-06-17）：提调碰到上下文/用户输入里不认识或拿不准的专名（地名/人名/术语/
  // 道具名），先精确搜「它指什么」，再决定怎么演——专名就是要字面命中，语义召回对自造专名易漏。
  whenToUse: '当上下文或用户输入出现你不认识/拿不准的专名、术语、地名、道具名，需要精确查它指什么时用：按字面/关键词命中含该专名的世界素材条目；也用于已知确切关键词精确定位某条设定。字面匹配、不做语义近似（语义近似请改用语义召回）。'
    + '多个关键词请放 queries 数组一次搜完（每项一个词，任一命中即返回并标注命中词），❌不要用空格把多个词拼进同一个 query——那会按整串匹配、几乎必然搜空。'
    + '常与定点读取配合：搜到目标单位后再 fetch 其正文细节。',
  readOnly: true
}

/** 定点读取：已知目标直接取，如角色大脑某单位的摘要或正文（类比 Claude Code 的 Read）。 */
export const TIDIAO_FETCH_UNIT_CONTRACT: TidiaoRetrievalToolContract = {
  kind: 'fetch',
  toolName: 'fetchUnitDetail',
  label: '定点读取',
  whenToUse: '当已经知道要看哪个单位（角色大脑单位/文档），需要其摘要或正文细节时用。unitId 必须一字不差复制搜索/召回命中里的 id（可能是 doc:doc-xxx 或短码 u#xxx）。先取摘要、确有必要再取正文，避免一次性灌全文。',
  readOnly: true
}

/** 取料三件套契约清单（渐进式暴露：按需把「何时用」喂给提调）。 */
export const TIDIAO_RETRIEVAL_CONTRACTS: readonly TidiaoRetrievalToolContract[] = [
  TIDIAO_SEMANTIC_RECALL_CONTRACT,
  TIDIAO_TEXT_SEARCH_CONTRACT,
  TIDIAO_FETCH_UNIT_CONTRACT
] as const

/** 按工具名取契约。 */
export function getTidiaoRetrievalContract(toolName: string): TidiaoRetrievalToolContract | null {
  return TIDIAO_RETRIEVAL_CONTRACTS.find((contract) => contract.toolName === toolName) ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 请求 / 结果类型（存储无关）
// ─────────────────────────────────────────────────────────────────────────────

export interface TidiaoSemanticRecallRequest {
  /** 单个检索意图（与 queries 至少给一个；两者并存时合并去重）。 */
  query?: string
  /** 多关键词（2026-07-08）：每项一个独立检索意图，各自打分后按单位取最高分 OR 合并。 */
  queries?: string[]
  /** 取回条数上限（渐进式暴露，默认由实现层定小值）。 */
  topK?: number
}

export interface TidiaoTextSearchRequest {
  /** 单个关键词（与 queries 至少给一个；两者并存时合并去重）。 */
  query?: string
  /** 多关键词（2026-07-08）：每项一个独立关键词，任一命中即返回（OR），命中条目标注命中了哪些词。 */
  queries?: string[]
  /** 是否按正则解释每个关键词（默认字面匹配）。 */
  regex?: boolean
  limit?: number
}

export interface TidiaoFetchUnitRequest {
  /** 角色大脑单位 / 文档 id。 */
  unitId: string
  /** 取摘要还是正文。 */
  level: TidiaoFetchLevel
}

/** 三件套统一命中条目（存储无关：unitId 可指向 DB 单位或将来 md 文件路径）。 */
export interface TidiaoRetrievalHit {
  unitId: string
  title: string
  /** 摘要或片段（textSearch 为命中片段，semantic 为单位摘要）。 */
  snippet: string
  /** 语义召回的相似度分数（textSearch/fetch 可空）。 */
  score?: number
  /** 多关键词检索时本条目命中了哪些词（单关键词检索不填，避免噪音）。 */
  matchedQueries?: string[]
}

export interface TidiaoRetrievalSearchResult {
  hits: TidiaoRetrievalHit[]
}

export interface TidiaoFetchUnitResult {
  unitId: string
  title: string
  level: TidiaoFetchLevel
  /** 取到的摘要或正文。 */
  content: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 取料决策留痕（写入剧本 retrieval，供审计）
// ─────────────────────────────────────────────────────────────────────────────

/** 把一次主动取料构造成剧本可记录的取料决策（§4.5「显式产出取/不取什么、为何」）。 */
export function buildRetrievalDecision(input: {
  kind: TidiaoRetrievalKind
  query: string
  reason: string
  hitSummary?: string
}): TidiaoRetrievalDecision {
  return {
    kind: input.kind,
    query: String(input.query || '').trim(),
    reason: String(input.reason || '').trim(),
    ...(input.hitSummary ? { hitSummary: String(input.hitSummary).trim() } : {})
  }
}
