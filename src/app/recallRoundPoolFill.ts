/**
 * 轮级资料池「填池」纯逻辑 —— 单聊群聊统一与取料池化计划书 批次3·子批3b-1。
 *
 * A1 轻量预召回（用户 2026-06-23 拍板）：只用 embedding 打分（scoreCardsByEmbedding·走向量缓存·便宜），
 * **不跑** prepareChatAIRecall 的多轮裁判 loop，压住「部分回滚 auto-recall」的延迟担忧。
 *
 * 决策②最强隔离（在 fill 层就钉死，由单测断言）：
 * - 角色池 = 角色私有大脑（核心/灵魂/轨迹/安排）+ 他者可观察外貌例外（origin: character_brain / public），
 *   **绝不含文档库**（不调任何文档库端口）。
 * - 世界池 = 文档库（origin: doc_library），与 createTidiaoDocLibraryRetrievalContext 同口径的最小召回卡。
 *
 * 本模块只产 RecallPoolCard[]，不接缓存/不接运行时（3b-2 起由 useAI 绑定 + decideRoundDirector 接入）。
 */

import type { BrainDocumentRecord, Character } from '../types'
import type { BrainRecallCandidateCard } from '../types/docBrain'
import { buildCharacterBrainRecallCandidateCards, type ObservableProfileSource } from './characterBrainRecall'
import { scoreCardsByEmbedding, type CallEmbedding } from './characterBrainRecallAI'
import { buildDocLibraryContentPorts } from './unitContentPort'
import type { RecallEmbeddingVectorCache } from './recallEmbeddingCache'
import type { RecallPoolCard, RecallPoolCardOrigin } from './recallRoundPool'
import { readDocLibraryDocumentIdFromUnitId } from './worldDocLibraryScope'

/** 默认每池取回卡数上限（A1 轻量·够提调定方向 + 注入角色提示词不过载）。 */
export const DEFAULT_POOL_TOP_K = 8

interface EmbeddingScoringDeps {
  embedTexts?: CallEmbedding
  vectorCache?: RecallEmbeddingVectorCache
  cacheScope?: string
}

export interface FillCharacterPoolDeps extends EmbeddingScoringDeps {
  /** 池归属角色（其私有大脑入池）。 */
  character: Character
  /** 池归属 characterId（写进每张卡的 ownerCharacterId，与池容器一致）。 */
  ownerCharacterId: string
  /** 他者可观察外貌例外源（同场角色/用户的 appearance）；空则无外貌卡。 */
  observableProfiles?: ObservableProfileSource[]
  /** 检索意图（通常=本轮用户输入）。 */
  query: string
  /** 取回上限，默认 DEFAULT_POOL_TOP_K。 */
  topK?: number
  currentDate?: Date
}

export interface FillWorldPoolDeps extends EmbeddingScoringDeps {
  /** 文档库（世界本源知识）。 */
  documents?: BrainDocumentRecord[]
  query: string
  topK?: number
}

function topKByScore(
  cards: BrainRecallCandidateCard[],
  scores: Map<string, number>,
  topK: number
): BrainRecallCandidateCard[] {
  return [...cards]
    .sort((left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0))
    .slice(0, Math.max(0, topK))
}

function toPoolCard(
  card: BrainRecallCandidateCard,
  origin: RecallPoolCardOrigin,
  ownerCharacterId: string | undefined,
  score: number
): RecallPoolCard {
  const pool: RecallPoolCard = {
    id: String(card.id || ''),
    title: String(card.t || ''),
    origin,
    score
  }
  if (card.s) pool.summary = String(card.s)
  if (card.bodyText) pool.bodyText = String(card.bodyText)
  if (ownerCharacterId) pool.ownerCharacterId = ownerCharacterId
  return pool
}

/** 可观察外貌卡（k==='observable_profile'）= 公共可观察 → 'public'；其余角色私有 → 'character_brain'。 */
function originOfCharacterCard(card: BrainRecallCandidateCard): RecallPoolCardOrigin {
  return card.k === 'observable_profile' ? 'public' : 'character_brain'
}

/**
 * 填某角色资料池：角色私有大脑 + 他者可观察外貌例外，按 query embedding 打分取 top-K。
 * **绝不含文档库**——buildCharacterBrainRecallCandidateCards 只产角色自身卡 + 外貌卡（不传 docLibraryStructure，
 * documents 仅可用于结构/关系解析，本函数传空、彻底不碰文档库）。
 */
export async function fillCharacterPoolCards(deps: FillCharacterPoolDeps): Promise<RecallPoolCard[]> {
  const query = String(deps.query || '').trim()
  // embedding 不可用即无法 A1 打分 → 返回空池（调用方降级/不重复预召回）。
  if (!deps.embedTexts) return []
  const cards = buildCharacterBrainRecallCandidateCards(deps.character, [], {
    includeCandidateChanges: false,
    includeObservableProfiles: true,
    observableProfiles: deps.observableProfiles || [],
    currentDate: deps.currentDate
  }).filter((card) => card.k !== 'candidate_change')
  if (!cards.length || !query) {
    // 无 query 或无候选卡：返回空池（调用方据此标记 recalledAt，不重复预召回）。
    return []
  }
  const { scores } = await scoreCardsByEmbedding(query, cards, deps.embedTexts, deps.vectorCache, deps.cacheScope || 'default')
  return topKByScore(cards, scores, deps.topK ?? DEFAULT_POOL_TOP_K)
    .map((card) => toPoolCard(card, originOfCharacterCard(card), deps.ownerCharacterId, scores.get(card.id) ?? 0))
    .filter((card) => card.id)
}

/**
 * 提调追加召回·世界池命中映射（3d）：把提调三件套（recallSemantic/searchWorldText/fetchUnitDetail，docLibraryOnly）
 * 取料命中映射成世界池卡（origin 全 doc_library、无 ownerCharacterId），供 appendWorldPoolCards 追加。
 * 与 fillWorldPoolCards 同口径产 doc_library 卡，只是输入来自提调 loop 内取料命中而非整库 embedding 打分。
 * 无 unitId 的命中丢弃；正文优先 body、摘要兜底 summary。
 */
export interface TidiaoWorldRetrievalHit {
  unitId: string
  title?: string
  summary?: string
  body?: string
  score?: number
}

export function retrievalHitsToWorldPoolCards(hits: TidiaoWorldRetrievalHit[]): RecallPoolCard[] {
  const out: RecallPoolCard[] = []
  for (const hit of Array.isArray(hits) ? hits : []) {
    const id = String(hit?.unitId || '').trim()
    if (!id) continue
    const card: RecallPoolCard = {
      id,
      title: String(hit.title || ''),
      origin: 'doc_library',
      score: Number.isFinite(Number(hit.score)) ? Number(hit.score) : 0,
      sourceKind: 'retrieved',
      documentId: readDocLibraryDocumentIdFromUnitId(id)
    }
    const summary = String(hit.summary || '').trim()
    const body = String(hit.body || '').trim()
    if (summary) card.summary = summary
    if (body) card.bodyText = body
    out.push(card)
  }
  return out
}

/**
 * 填世界知识池：文档库（世界本源知识）按 query embedding 打分取 top-K。
 * 卡与 createTidiaoDocLibraryRetrievalContext 同口径（文档库端口最小召回卡），origin 全 doc_library、无 ownerCharacterId。
 */
export async function fillWorldPoolCards(deps: FillWorldPoolDeps): Promise<RecallPoolCard[]> {
  const query = String(deps.query || '').trim()
  if (!deps.embedTexts) return []
  const documents = Array.isArray(deps.documents) ? deps.documents : []
  const documentIdByUnitId = new Map<string, string>()
  const cards: BrainRecallCandidateCard[] = buildDocLibraryContentPorts(documents)
    .map((port) => {
      documentIdByUnitId.set(String(port.unitId || ''), String(port.sourceId || '').trim())
      const version = port.effectiveVersion
      return {
        id: String(port.unitId || ''),
        k: 'public_compile_page' as const,
        p: String(port.sourcePath || port.title || ''),
        t: String(version?.title || port.title || ''),
        s: String(version?.summary || port.summary || ''),
        tags: port.tags || [],
        u: '',
        relationHints: port.relationHints || [],
        relatedNodeIds: [],
        isRecallable: true,
        bodyText: String(version?.body || port.body || '')
      } satisfies BrainRecallCandidateCard
    })
    // 过滤掉无正文/摘要的结构容器（如「世界树」root、空分组）——它们不是世界知识内容。
    .filter((card) => card.id && (String(card.s || '').trim() || String(card.bodyText || '').trim()))
  if (!cards.length || !query) return []
  const { scores } = await scoreCardsByEmbedding(query, cards, deps.embedTexts, deps.vectorCache, deps.cacheScope || 'default')
  return topKByScore(cards, scores, deps.topK ?? DEFAULT_POOL_TOP_K)
    .map((card) => ({
      ...toPoolCard(card, 'doc_library', undefined, scores.get(card.id) ?? 0),
      sourceKind: 'retrieved' as const,
      documentId: documentIdByUnitId.get(card.id) || readDocLibraryDocumentIdFromUnitId(card.id)
    }))
    .filter((card) => card.id)
}
