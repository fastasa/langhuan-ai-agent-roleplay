/**
 * 提调取料三件套真实工厂 —— 世界总编排器升格计划书 批次 1（子批 1d-A）。
 *
 * 把 1b/1c 的纯工具逻辑接缝 {@link TidiaoRetrievalContext} 接到现役 embedding / 角色大脑 / 文档库基建上：
 * - 语义召回：复用 `buildCharacterBrainRecallCandidateCards` 造候选卡 + `scoreCardsByEmbedding` 打分。
 * - 定点读取 / 文本搜索：复用 `unitContentPort` 的角色大脑 + 文档库内容端口，三法共用同一份世界素材。
 *
 * 依赖（character/documents/embedTexts/vectorCache/cacheScope）由发送链路注入（useAI.buildTidiaoRetrievalContext），
 * 与召回准备层用同一套 embedding 调用、缓存与文档来源，保证打分口径一致。
 *
 * 只读边界（§4.5）：本工厂只读不写，与取料契约 readOnly:true 一致。
 */

import type { BrainDocumentRecord, Character } from '../types'
import type { BrainRecallCandidateCard } from '../types/docBrain'
import { buildCharacterBrainRecallCandidateCards } from './characterBrainRecall'
import { scoreCardsByEmbedding, type CallEmbedding } from './characterBrainRecallAI'
import { buildCharacterBrainContentPorts, buildDocLibraryContentPorts } from './unitContentPort'
import type { UnitContentPort } from '../types/unitContentPort'
import type { RecallEmbeddingVectorCache } from './recallEmbeddingCache'
import { createTidiaoUnitIdCodec, type TidiaoUnitIdCodec } from './tidiaoUnitIdCodec'
import type {
  TidiaoRetrievalContext,
  TidiaoResolvedUnit,
  TidiaoScoredCandidate,
  TidiaoSearchableUnit
} from './tidiaoRetrievalTools'

export interface TidiaoRetrievalContextFactoryDeps {
  character: Character
  /** 世界素材文档（与召回链路同源：charStore.documents / docLibrary）。 */
  documents?: BrainDocumentRecord[]
  /** embedding 调用（与召回链路同一实现，返回向量）。缺省时语义召回返回空（不报错）。 */
  embedTexts?: CallEmbedding
  /** embedding 向量缓存（复用召回链路实例，命中即省调用）。 */
  vectorCache?: RecallEmbeddingVectorCache
  /** embedding 缓存作用域：对齐召回链路 `agentConfig.embeddingPresetId || 'default'`。 */
  cacheScope?: string
}

/** 端口驱动的「定点读取 / 文本搜索」两件——两套工厂（含文档库/含角色大脑）共用同一份逻辑，只是 ports 来源不同。
 *  短码映射协议（2026-07-04）：脏 unitId（路径编码的文件夹 id）出口换 `u#<哈希>` 短码、入口先解码再精确匹配，
 *  防模型抄写超长乱码 id 失败；干净 id 与模型抄来的真实 id 原样透传（向后兼容）。 */
function createPortBackedRetrievalParts(
  ports: () => UnitContentPort[],
  codec: TidiaoUnitIdCodec
): Pick<TidiaoRetrievalContext, 'resolveUnit' | 'listSearchableUnits'> {
  const findPort = (unitId: string): UnitContentPort | undefined => {
    const realId = codec.decode(unitId)
    return ports().find((port) => String(port.unitId || '') === realId)
  }
  return {
    resolveUnit(unitId: string): TidiaoResolvedUnit | null {
      const id = String(unitId || '').trim()
      if (!id) return null
      const port = findPort(id)
      if (!port) return null
      const version = port.effectiveVersion
      return {
        title: String(version?.title || port.title || ''),
        summary: String(version?.summary || port.summary || ''),
        body: String(version?.body || port.body || '')
      }
    },
    listSearchableUnits(): TidiaoSearchableUnit[] {
      return ports()
        .map((port) => {
          const version = port.effectiveVersion
          return {
            unitId: codec.encode(String(port.unitId || '')),
            title: String(version?.title || port.title || ''),
            summary: String(version?.summary || port.summary || ''),
            text: String(version?.body || port.body || '')
          } satisfies TidiaoSearchableUnit
        })
        .filter((unit) => unit.unitId)
    }
  }
}

/** 两套工厂共用：从端口列表建短码映射器（惰性构建，同一工厂内出口/入口共用同一张表）。 */
function createPortsUnitIdCodec(ports: () => UnitContentPort[]): TidiaoUnitIdCodec {
  return createTidiaoUnitIdCodec(() => ports().map((port) => String(port.unitId || '')))
}

/** 用工厂依赖造一个真实的取料接缝，供 harness 三件套工具调用（角色大脑 + 文档库；单聊 per-speaker 取料用）。 */
export function createTidiaoRetrievalContext(deps: TidiaoRetrievalContextFactoryDeps): TidiaoRetrievalContext {
  const documents = Array.isArray(deps.documents) ? deps.documents : []
  const cacheScope = deps.cacheScope || 'default'
  // 内容端口只构建一次（同一份世界素材，定点读取/文本搜索共用），避免重复展开角色大脑/文档库。
  let portsCache: UnitContentPort[] | null = null
  const ports = (): UnitContentPort[] => {
    if (!portsCache) {
      portsCache = [
        ...buildCharacterBrainContentPorts(deps.character, documents),
        ...buildDocLibraryContentPorts(documents)
      ]
    }
    return portsCache
  }
  const codec = createPortsUnitIdCodec(ports)
  return {
    async scoreCandidatesForQuery(query: string): Promise<TidiaoScoredCandidate[]> {
      const cards = buildCharacterBrainRecallCandidateCards(deps.character, documents)
      if (!cards.length) return []
      const { scores } = await scoreCardsByEmbedding(query, cards, deps.embedTexts, deps.vectorCache, cacheScope)
      return cards
        .map((card) => ({
          // 短码映射：卡 id 在端口别名表内（脏 id）即换短码，否则原样（表外 id encode 是恒等透传）。
          unitId: codec.encode(String(card.id || '')),
          title: String(card.t || ''),
          summary: String(card.s || ''),
          score: scores.get(card.id) ?? 0
        } satisfies TidiaoScoredCandidate))
        .filter((candidate) => candidate.unitId)
    },
    ...createPortBackedRetrievalParts(ports, codec)
  }
}

export interface TidiaoDocLibraryRetrievalContextFactoryDeps {
  /** 世界本源资料文档（文档库），与召回链路同源。 */
  documents?: BrainDocumentRecord[]
  embedTexts?: CallEmbedding
  vectorCache?: RecallEmbeddingVectorCache
  cacheScope?: string
}

/**
 * 文档库-only 取料接缝（D2·知识隔离）：**只取文档库（世界本源知识），绝不含任何角色大脑**。
 * 群聊导演（提调）取料用——文档库归提调/旁白，角色大脑彼此隔离、角色不碰文档库（用户 2026-06-22 拍板）。
 * 语义召回候选卡只从文档库内容端口构建（不调 buildCharacterBrainRecallCandidateCards），定点读取/文本搜索只列文档库单位。
 */
export function createTidiaoDocLibraryRetrievalContext(
  deps: TidiaoDocLibraryRetrievalContextFactoryDeps
): TidiaoRetrievalContext {
  const documents = Array.isArray(deps.documents) ? deps.documents : []
  const cacheScope = deps.cacheScope || 'default'
  let portsCache: UnitContentPort[] | null = null
  const ports = (): UnitContentPort[] => {
    if (!portsCache) portsCache = buildDocLibraryContentPorts(documents)
    return portsCache
  }
  // 文档库候选卡：从文档库内容端口构建最小召回卡（嵌入打分只用 t/s/tags/relationHints/p），不掺任何角色私有卡。
  let cardsCache: BrainRecallCandidateCard[] | null = null
  const cards = (): BrainRecallCandidateCard[] => {
    if (!cardsCache) {
      cardsCache = ports()
        .map((port) => {
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
            isRecallable: true
          } satisfies BrainRecallCandidateCard
        })
        .filter((card) => card.id)
    }
    return cardsCache
  }
  const codec = createPortsUnitIdCodec(ports)
  return {
    async scoreCandidatesForQuery(query: string): Promise<TidiaoScoredCandidate[]> {
      const cs = cards()
      if (!cs.length) return []
      const { scores } = await scoreCardsByEmbedding(query, cs, deps.embedTexts, deps.vectorCache, cacheScope)
      return cs
        .map((card) => ({
          // 短码映射：文档库文件夹卡（脏 doc-tree: id）换短码，文档卡（doc:doc-…）原样透传。
          unitId: codec.encode(String(card.id || '')),
          title: String(card.t || ''),
          summary: String(card.s || ''),
          score: scores.get(card.id) ?? 0
        } satisfies TidiaoScoredCandidate))
        .filter((candidate) => candidate.unitId)
    },
    ...createPortBackedRetrievalParts(ports, codec)
  }
}
