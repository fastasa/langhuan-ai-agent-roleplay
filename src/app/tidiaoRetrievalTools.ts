/**
 * 提调取料工具实现逻辑 —— 世界总编排器升格计划书 批次 1（子批 1b）。
 *
 * 本子批实现「定点读取 / 语义召回」两件套的**纯工具逻辑**，对齐 1a 冻结的契约
 * （src/app/tidiaoRetrievalContract.ts）。逻辑通过注入的 {@link TidiaoRetrievalContext}
 * 接缝（seam）访问数据，与「数据从哪来」解耦：
 * - 接缝的真实实现（工厂）在子批 1d 与 harness 接入一起做，复用现有 embedding/角色大脑基建
 *   （`characterBrainRecallAI.scoreCardsByEmbedding` + `characterBrainRecall.buildCharacterBrainRecallCandidateCards`
 *   做语义召回；`unitContentPort.buildCharacterBrainContentPorts`/`buildDocLibraryContentPorts` 做定点读取）。
 *   接缝形状已按这些底层的真实签名校准。
 * - 文本搜索（searchWorldText）是子批 1c（DB 全文检索后端），不在本模块。
 *
 * 只读边界（§4.5）：本模块只读不写，与契约 readOnly:true 一致。
 */

import type {
  TidiaoFetchLevel,
  TidiaoFetchUnitRequest,
  TidiaoFetchUnitResult,
  TidiaoRetrievalHit,
  TidiaoRetrievalSearchResult,
  TidiaoSemanticRecallRequest,
  TidiaoTextSearchRequest
} from './tidiaoRetrievalContract'

/** 语义召回默认取回条数（渐进式暴露：默认取小值，提调要更多再显式给 topK）。 */
export const TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K = 6
/** 语义召回 topK 上限：防提调一次灌太多（progressive disclosure）。 */
export const TIDIAO_SEMANTIC_RECALL_MAX_TOP_K = 20
/** 文本搜索默认/上限条数（渐进式暴露）。 */
export const TIDIAO_TEXT_SEARCH_DEFAULT_LIMIT = 8
export const TIDIAO_TEXT_SEARCH_MAX_LIMIT = 30
/** 一次调用最多接受的关键词个数（多关键词 2026-07-08：防一次灌爆，超出截断）。 */
export const TIDIAO_RETRIEVAL_MAX_QUERIES = 8
/** 命中片段窗口：命中位置前后各取多少字符。 */
const TIDIAO_TEXT_SEARCH_SNIPPET_RADIUS = 60

/** 语义召回打分后的候选条目（接缝产出）。 */
export interface TidiaoScoredCandidate {
  unitId: string
  title: string
  /** 单位摘要（作为命中片段）。 */
  summary: string
  /** embedding 相似度（越大越相近）。 */
  score: number
}

/** 定点读取解析出的单位（接缝产出）。 */
export interface TidiaoResolvedUnit {
  title: string
  summary: string
  body: string
}

/** 文本搜索的可搜单位（接缝产出）：标题 + 摘要 + 正文文本，供关键词扫描。 */
export interface TidiaoSearchableUnit {
  unitId: string
  title: string
  summary: string
  /** 正文/可检索全文。 */
  text: string
}

/**
 * 取料运行时接缝：把「数据来源」从工具逻辑里抽出来。
 * 1d 工厂用现有 embedding/角色大脑基建实现它；本模块与测试用假实现。
 */
export interface TidiaoRetrievalContext {
  /** 语义召回：对 query 给全部世界素材候选打 embedding 分（复用 scoreCardsByEmbedding）。 */
  scoreCandidatesForQuery(query: string): Promise<TidiaoScoredCandidate[]>
  /** 定点读取：按单位 id 解析出标题/摘要/正文（复用 unitContentPort），找不到返回 null。 */
  resolveUnit(unitId: string): TidiaoResolvedUnit | null
  /** 文本搜索：列出当前世界素材的全部可搜单位（复用召回链路已加载的 documents）。 */
  listSearchableUnits(): TidiaoSearchableUnit[]
}

/**
 * 归一化多关键词入参（多关键词 2026-07-08）：合并 query + queries、去空白、按小写去重、截断到上限。
 * 联动：searchDirectorMemory（searchAppendLogTool.ts）里有同语义的本地实现（该模块按约定自包含不引本文件），
 * 若这里的归一化口径变了，那边要同步改。
 */
export function normalizeRetrievalQueries(input: { query?: unknown; queries?: unknown }): string[] {
  const raw = [
    String(input.query ?? '').trim(),
    ...(Array.isArray(input.queries) ? input.queries.map((q) => String(q ?? '').trim()) : [])
  ].filter(Boolean)
  const seen = new Set<string>()
  const result: string[] = []
  for (const q of raw) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(q)
    if (result.length >= TIDIAO_RETRIEVAL_MAX_QUERIES) break
  }
  return result
}

function clampTopK(topK: number | undefined): number {
  const value = Number.isFinite(topK) ? Math.floor(Number(topK)) : TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K
  if (value <= 0) return TIDIAO_SEMANTIC_RECALL_DEFAULT_TOP_K
  return Math.min(value, TIDIAO_SEMANTIC_RECALL_MAX_TOP_K)
}

/**
 * 语义召回：query(s) → 候选打分 → 过滤无效分 → 按分降序取 topK → 映射为统一命中条目。
 * score<=0（含未命中/编码失败）一律剔除，不把兜底分当真命中（与 3.6.1「打分无效直接停止」精神一致）。
 * 多关键词（2026-07-08）：每个 query 各打一遍分，同一单位取最高分 OR 合并，命中条目标注命中了哪些词。
 */
export async function runTidiaoSemanticRecall(
  request: TidiaoSemanticRecallRequest,
  context: TidiaoRetrievalContext
): Promise<TidiaoRetrievalSearchResult> {
  const queries = normalizeRetrievalQueries(request)
  if (!queries.length) return { hits: [] }
  const topK = clampTopK(request.topK)
  const scoredPerQuery = await Promise.all(queries.map((query) => context.scoreCandidatesForQuery(query)))
  // 同一单位跨关键词取最高分合并；matched 记录哪些词真命中（score>0）
  const merged = new Map<string, { candidate: TidiaoScoredCandidate; matched: string[] }>()
  scoredPerQuery.forEach((scored, index) => {
    for (const candidate of scored) {
      if (!Number.isFinite(candidate.score) || candidate.score <= 0) continue
      const entry = merged.get(candidate.unitId)
      if (!entry) {
        merged.set(candidate.unitId, { candidate, matched: [queries[index]] })
      } else {
        entry.matched.push(queries[index])
        if (candidate.score > entry.candidate.score) entry.candidate = candidate
      }
    }
  })
  const hits: TidiaoRetrievalHit[] = Array.from(merged.values())
    .sort((a, b) => b.candidate.score - a.candidate.score)
    .slice(0, topK)
    .map(({ candidate, matched }) => ({
      unitId: candidate.unitId,
      title: candidate.title,
      snippet: candidate.summary,
      score: candidate.score,
      // 单关键词不标注（避免噪音），多关键词才带命中词
      ...(queries.length > 1 ? { matchedQueries: matched } : {})
    }))
  return { hits }
}

/**
 * 定点读取：按单位 id 取摘要或正文。
 * 找不到单位返回 null（调用方据此报「未找到该单位」工具错误，不伪造内容）。
 * 取正文但正文为空时回退摘要，避免提调拿到空串。
 */
export function runTidiaoFetchUnit(
  request: TidiaoFetchUnitRequest,
  context: TidiaoRetrievalContext
): TidiaoFetchUnitResult | null {
  const unitId = String(request.unitId || '').trim()
  if (!unitId) return null
  const level: TidiaoFetchLevel = request.level === 'body' ? 'body' : 'summary'
  const unit = context.resolveUnit(unitId)
  if (!unit) return null
  const content = level === 'body'
    ? (String(unit.body || '').trim() || String(unit.summary || '').trim())
    : String(unit.summary || '').trim()
  return {
    unitId,
    title: String(unit.title || '').trim(),
    level,
    content
  }
}

function clampLimit(limit: number | undefined): number {
  const value = Number.isFinite(limit) ? Math.floor(Number(limit)) : TIDIAO_TEXT_SEARCH_DEFAULT_LIMIT
  if (value <= 0) return TIDIAO_TEXT_SEARCH_DEFAULT_LIMIT
  return Math.min(value, TIDIAO_TEXT_SEARCH_MAX_LIMIT)
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 构造匹配器：regex=true 用用户正则（非法则回退字面），否则字面转义。统一忽略大小写 + unicode。 */
function buildTextMatcher(query: string, regex: boolean | undefined): RegExp {
  if (regex) {
    try {
      return new RegExp(query, 'iu')
    } catch {
      // 非法正则回退字面匹配，不报错（提调拿不准时也能搜）
    }
  }
  return new RegExp(escapeRegExp(query), 'iu')
}

/** 取命中片段：命中位置前后各取 RADIUS 字符，首尾加省略号。 */
function buildSnippet(haystack: string, matchIndex: number, matchLength: number): string {
  if (matchIndex < 0) return haystack.slice(0, TIDIAO_TEXT_SEARCH_SNIPPET_RADIUS * 2).trim()
  const start = Math.max(0, matchIndex - TIDIAO_TEXT_SEARCH_SNIPPET_RADIUS)
  const end = Math.min(haystack.length, matchIndex + matchLength + TIDIAO_TEXT_SEARCH_SNIPPET_RADIUS)
  const core = haystack.slice(start, end).trim()
  return `${start > 0 ? '…' : ''}${core}${end < haystack.length ? '…' : ''}`
}

/**
 * 文本搜索：对世界素材做字面/正则关键词扫描（提调碰到看不懂的专名时精确查它指什么）。
 * 命中权重：标题命中最重、摘要次之、正文最轻（专名常是标题），按权重降序取 limit。
 * 片段取自首个命中位置上下文。本工具不做语义近似（那是语义召回）。
 * 多关键词（2026-07-08）：每个关键词独立匹配，任一命中即返回（OR）；权重按各词命中相加
 * （命中越多词排越前），命中条目标注命中了哪些词，片段取首个有正文命中的词的上下文。
 */
export function runTidiaoTextSearch(
  request: TidiaoTextSearchRequest,
  context: TidiaoRetrievalContext
): TidiaoRetrievalSearchResult {
  const queries = normalizeRetrievalQueries(request)
  if (!queries.length) return { hits: [] }
  const limit = clampLimit(request.limit)
  const matchers = queries.map((query) => ({ query, matcher: buildTextMatcher(query, request.regex) }))
  const scored = context.listSearchableUnits()
    .map((unit) => {
      const title = String(unit.title || '')
      const summary = String(unit.summary || '')
      const text = String(unit.text || '')
      let weight = 0
      let anySummaryHit = false
      let anyTitleHit = false
      let firstBodyMatch: RegExpExecArray | null = null
      const matched: string[] = []
      for (const { query, matcher } of matchers) {
        const titleHit = matcher.test(title)
        const summaryHit = matcher.test(summary)
        const bodyMatch = matcher.exec(text)
        if (!titleHit && !summaryHit && !bodyMatch) continue
        matched.push(query)
        weight += (titleHit ? 100 : 0) + (summaryHit ? 10 : 0) + (bodyMatch ? 1 : 0)
        anyTitleHit = anyTitleHit || titleHit
        anySummaryHit = anySummaryHit || summaryHit
        if (!firstBodyMatch && bodyMatch) firstBodyMatch = bodyMatch
      }
      if (!matched.length) return null
      // 片段优先取正文命中上下文；正文没命中则用摘要或标题
      let snippet = summary || title
      if (firstBodyMatch) snippet = buildSnippet(text, firstBodyMatch.index, firstBodyMatch[0].length)
      else if (anySummaryHit) snippet = summary
      else if (anyTitleHit) snippet = title || summary
      return { unitId: unit.unitId, title, snippet, weight, matched }
    })
    .filter((item): item is { unitId: string; title: string; snippet: string; weight: number; matched: string[] } => item !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
  const hits: TidiaoRetrievalHit[] = scored.map((item) => ({
    unitId: item.unitId,
    title: item.title,
    snippet: item.snippet,
    // 单关键词不标注（避免噪音），多关键词才带命中词
    ...(queries.length > 1 ? { matchedQueries: item.matched } : {})
  }))
  return { hits }
}
