/**
 * 资料池会话级缓存（localStorage·刷新仍在·不进主库 langhuan.db）——
 * 单聊群聊统一与取料池化计划书 批次3·子批3a 地基。
 *
 * 【2026-06-29 升级·对话级 + 模块级单例 + 响应式 + 用户可编辑】用户拍板：
 * - 缓存 key 由 (sessionId, roundAnchorId) 收敛为**仅 sessionId**：一会话一池，跨轮/跨提调带重启不重置。
 * - 改为**模块级单例**：所有消费者（pipeline 填池 + 前端 band/侧栏读 + 用户编辑）共享同一份内存 payload，
 *   写盘即对其它消费者可见——根治旧实现「每处各 new 一实例、各自内存 payload，用户改了别处读不到/被覆盖」。
 * - 带**响应式版本号** recallPoolStoreVersion：任何写入自增，前端 computed 依赖它即可即时刷新（用户增删立即生效）。
 *
 * 数据安全：池子是会话级独立缓存，**绝不进** `server/data/langhuan.db`（Q6），缩小数据安全红线暴露面。
 * 存储层：localStorage（account-scoped key + LRU + 容错加载），带体积探针——超软阈值高声告警作 IndexedDB 决策证据。
 */

import { ref } from 'vue'
import { getLocalWorkspaceStorageKey } from './localWorkspace'
import {
  addUserCardToPool,
  createEmptyRoundRecallPools,
  removeCardById,
  scopeCharacterCardId,
  type CharacterRecallPool,
  type RecallPoolCard,
  type RecallPoolCardOrigin,
  type RoundRecallPools,
  type WorldRecallPool
} from './recallRoundPool'

const STORAGE_KEY = 'langhuan_recall_round_pools_v1'
/** LRU 保留最近多少个会话池（对话级·一会话一池，保守取 50 个会话）。 */
const MAX_SESSIONS = 50
/** 体积探针软阈值：单会话池序列化 UTF-8 字节超此值高声告警（IndexedDB 决策证据）。 */
const SINGLE_SESSION_SOFT_LIMIT_BYTES = 512 * 1024
/** 体积探针软阈值：全量缓存超此值高声告警。 */
const TOTAL_SOFT_LIMIT_BYTES = 4 * 1024 * 1024

type RoundPoolCachePayload = {
  /** key = sessionId（对话级·一会话一池）。 */
  sessions: Record<string, RoundRecallPools>
  order: string[]
}

export interface RecallRoundPoolCache {
  /** 读回某会话池；无则返回 null（调用方自建空池）。 */
  load(sessionId: string): RoundRecallPools | null
  /** 写入/覆盖某会话池（按 sessionId upsert + LRU 修剪 + 体积探针 + 版本号自增）。 */
  save(pools: RoundRecallPools): void
  /** 用户软删某卡（load→removeCardById→save·跨所有角色池+世界池+写墓碑）。返回改后的会话池。 */
  removeCard(sessionId: string, cardId: string): RoundRecallPools | null
  /** 用户手动加自定义卡（load→addUserCardToPool→save）。返回改后的会话池。 */
  addCard(
    sessionId: string,
    target: { kind: 'character'; characterId: string } | { kind: 'world' },
    card: { id: string; title?: string; summary?: string; bodyText?: string }
  ): RoundRecallPools | null
  /** 清掉某会话池（会话切换/清空时用）。 */
  clearSession(sessionId: string): void
}

/** 响应式版本号：任何写入自增，前端 computed 依赖它即可在用户增删/召回落池后即时刷新。 */
export const recallPoolStoreVersion = ref(0)

function emptyPayload(): RoundPoolCachePayload {
  return { sessions: {}, order: [] }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function utf8ByteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length
  }
}

function normalizeOrigin(value: unknown): RecallPoolCardOrigin {
  return value === 'character_brain' || value === 'public' || value === 'doc_library' ? value : 'doc_library'
}

function normalizeCard(raw: unknown): RecallPoolCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const id = String(source.id || '').trim()
  if (!id) return null
  const card: RecallPoolCard = {
    id,
    title: String(source.title || ''),
    origin: normalizeOrigin(source.origin)
  }
  if (source.summary != null) card.summary = String(source.summary)
  if (source.bodyText != null) card.bodyText = String(source.bodyText)
  const owner = String(source.ownerCharacterId || '').trim()
  if (owner) card.ownerCharacterId = owner
  if (Number.isFinite(Number(source.score))) card.score = Number(source.score)
  if (source.sourceKind === 'retrieved' || source.sourceKind === 'user') card.sourceKind = source.sourceKind
  const documentId = String(source.documentId || '').trim()
  if (documentId) card.documentId = documentId
  return card
}

function normalizePool(raw: unknown): CharacterRecallPool & WorldRecallPool {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const cards = Array.isArray(source.cards)
    ? (source.cards.map(normalizeCard).filter(Boolean) as RecallPoolCard[])
    : []
  return { cards, recalledAt: String(source.recalledAt || '') }
}

function normalizeSession(raw: unknown): RoundRecallPools | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const sessionId = String(source.sessionId || '').trim()
  // 对话级：仅要求 sessionId（roundAnchorId 语义已变为「上次填池轮锚」，可空——如用户先手加卡再召回）。
  if (!sessionId) return null
  const characterPools: Record<string, CharacterRecallPool> = {}
  const rawChar = source.characterPools
  if (rawChar && typeof rawChar === 'object' && !Array.isArray(rawChar)) {
    for (const [cid, pool] of Object.entries(rawChar as Record<string, unknown>)) {
      const id = String(cid || '').trim()
      if (!id) continue
      const normalized = normalizePool(pool)
      // 2026-07-04 存量迁移：旧角色卡 id 是段位通用 id（跨角色撞车），读侧统一补归属前缀
      //（scopeCharacterCardId 幂等·与 recallRoundPool 写侧同口径·联动维护）。
      normalized.cards = normalized.cards.map((card) => ({ ...card, id: scopeCharacterCardId(id, card.id) }))
      characterPools[id] = normalized
    }
  }
  const removedCardIds = Array.isArray(source.removedCardIds)
    ? source.removedCardIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  return {
    sessionId,
    roundAnchorId: String(source.roundAnchorId || ''),
    characterPools,
    worldPool: normalizePool(source.worldPool),
    removedCardIds,
    worldScope: {
      worldId: String((source.worldScope as Record<string, unknown> | undefined)?.worldId || ''),
      documentIds: Array.isArray((source.worldScope as Record<string, unknown> | undefined)?.documentIds)
        ? Array.from(new Set(((source.worldScope as Record<string, unknown>).documentIds as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)))
        : []
    }
  }
}

function normalizePayload(raw: unknown): RoundPoolCachePayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyPayload()
  const record = raw as Record<string, unknown>
  // 兼容旧 v1 轮级结构（rounds/key=session::anchor）：迁移聚合成会话级（同会话多轮卡按 id 去重并入一池）。
  const rawSessions = record.sessions && typeof record.sessions === 'object' && !Array.isArray(record.sessions)
    ? (record.sessions as Record<string, unknown>)
    : null
  if (rawSessions) {
    const sessions: Record<string, RoundRecallPools> = {}
    for (const [key, value] of Object.entries(rawSessions)) {
      const session = normalizeSession(value)
      if (session) sessions[String(key || session.sessionId)] = session
    }
    const order = Array.isArray(record.order)
      ? record.order.map((item) => String(item || '')).filter((key) => Boolean(sessions[key]))
      : Object.keys(sessions)
    for (const key of Object.keys(sessions)) if (!order.includes(key)) order.push(key)
    return { sessions, order }
  }
  return migrateLegacyRoundPayload(record)
}

/** 旧轮级缓存（rounds: { "session::anchor": RoundRecallPools }）→ 对话级聚合迁移（同会话多轮卡并入一池·按 id 去重）。 */
function migrateLegacyRoundPayload(record: Record<string, unknown>): RoundPoolCachePayload {
  const rawRounds = record.rounds && typeof record.rounds === 'object' && !Array.isArray(record.rounds)
    ? (record.rounds as Record<string, unknown>)
    : {}
  const sessions: Record<string, RoundRecallPools> = {}
  const order: string[] = []
  for (const value of Object.values(rawRounds)) {
    const round = normalizeSession(value)
    if (!round) continue
    const sid = round.sessionId
    if (!sessions[sid]) {
      sessions[sid] = createEmptyRoundRecallPools(sid, round.roundAnchorId)
      order.push(sid)
    }
    const acc = sessions[sid]
    // 角色池并入（按 id 去重靠 normalizeSession 已规整 + 下面 setRecord 简单合并）。
    for (const [cid, pool] of Object.entries(round.characterPools || {})) {
      const existing = acc.characterPools[cid]?.cards || []
      const seen = new Set(existing.map((c) => c.id))
      acc.characterPools[cid] = {
        cards: [...existing, ...pool.cards.filter((c) => !seen.has(c.id))],
        recalledAt: pool.recalledAt || acc.characterPools[cid]?.recalledAt || ''
      }
    }
    const wSeen = new Set(acc.worldPool.cards.map((c) => c.id))
    acc.worldPool = {
      cards: [...acc.worldPool.cards, ...round.worldPool.cards.filter((c) => !wSeen.has(c.id))],
      recalledAt: round.worldPool.recalledAt || acc.worldPool.recalledAt || ''
    }
  }
  return { sessions, order }
}

function loadPayload(): RoundPoolCachePayload {
  const storage = getStorage()
  if (!storage) return emptyPayload()
  try {
    return normalizePayload(JSON.parse(storage.getItem(getLocalWorkspaceStorageKey(STORAGE_KEY)) || 'null'))
  } catch {
    return emptyPayload()
  }
}

function trimPayload(payload: RoundPoolCachePayload): RoundPoolCachePayload {
  const order = payload.order.filter((key) => Boolean(payload.sessions[key]))
  while (order.length > MAX_SESSIONS) {
    const key = order.shift()
    if (key) delete payload.sessions[key]
  }
  return { sessions: payload.sessions, order }
}

/** 体积探针：单会话/全量序列化超软阈值高声告警，作 IndexedDB 决策证据。 */
function probeSize(sessionLabel: string, sessionJson: string, payloadJson: string): void {
  const sessionBytes = utf8ByteLength(sessionJson)
  if (sessionBytes > SINGLE_SESSION_SOFT_LIMIT_BYTES) {
    console.warn(`[recallRoundPoolCache] 单会话资料池过大（${sessionBytes} 字节 > ${SINGLE_SESSION_SOFT_LIMIT_BYTES}）：${sessionLabel}。localStorage 可能吃紧，考虑改 IndexedDB。`)
  }
  const totalBytes = utf8ByteLength(payloadJson)
  if (totalBytes > TOTAL_SOFT_LIMIT_BYTES) {
    console.warn(`[recallRoundPoolCache] 全量资料池缓存过大（${totalBytes} 字节 > ${TOTAL_SOFT_LIMIT_BYTES}）。考虑改 IndexedDB。`)
  }
}

function savePayload(payload: RoundPoolCachePayload, probe?: { sessionLabel: string; sessionJson: string }): void {
  const storage = getStorage()
  if (!storage) return
  try {
    const payloadJson = JSON.stringify(payload)
    if (probe) probeSize(probe.sessionLabel, probe.sessionJson, payloadJson)
    storage.setItem(getLocalWorkspaceStorageKey(STORAGE_KEY), payloadJson)
  } catch (error) {
    // 2026-07-04 真机事故根治：写盘失败绝不再静默吞（旧行为把 QuotaExceededError 吞掉，表现成
    // 「召回命中了、池子里却没有」且版本号照常自增）。不阻断取料主链路，但必须高声报错留证据。
    console.error(
      '[recallRoundPoolCache] 资料池写盘失败（localStorage 配额满或不可用），本次落池/增删结果不会跨刷新保留：',
      error
    )
  }
}

/** 测试专用：复位响应式版本号（单测 localStorage.clear() 后调用；本缓存每次操作直读 localStorage·无长驻内存态需清）。 */
export function resetRecallRoundPoolCacheForTest(): void {
  recallPoolStoreVersion.value = 0
}

/** 写盘真相单点：每次都从 localStorage 读最新 payload，upsert 后回写 + 版本号自增。 */
function persist(pools: RoundRecallPools): void {
  const sessionId = String(pools.sessionId || '').trim()
  if (!sessionId) return
  const payload = loadPayload()
  payload.sessions[sessionId] = pools
  payload.order = payload.order.filter((item) => item !== sessionId)
  payload.order.push(sessionId)
  const trimmed = trimPayload(payload)
  savePayload(trimmed, { sessionLabel: sessionId, sessionJson: JSON.stringify(pools) })
  recallPoolStoreVersion.value += 1
}

/**
 * 返回缓存门面。**每次 load/edit 都直读 localStorage 真相**（不留长驻内存 payload）——
 * 这样 pipeline 填池写盘、UI 用户增删、各处读取始终看同一真相，根治旧实现「各 new 一实例各自内存 →
 * 用户编辑别处读不到/被覆盖」；响应式 recallPoolStoreVersion 让前端在写入后即时重算。
 */
export function createLocalRecallRoundPoolCache(): RecallRoundPoolCache {
  return {
    load(sessionId: string): RoundRecallPools | null {
      const sid = String(sessionId || '').trim()
      if (!sid) return null
      return loadPayload().sessions[sid] || null
    },
    save(pools: RoundRecallPools): void {
      if (!pools) return
      persist(pools)
    },
    removeCard(sessionId: string, cardId: string): RoundRecallPools | null {
      const sid = String(sessionId || '').trim()
      const pools = sid ? loadPayload().sessions[sid] : null
      if (!pools) return null
      removeCardById(pools, cardId)
      persist(pools)
      return pools
    },
    addCard(sessionId, target, card): RoundRecallPools | null {
      const sid = String(sessionId || '').trim()
      if (!sid) return null
      const pools = loadPayload().sessions[sid] || createEmptyRoundRecallPools(sid, '')
      addUserCardToPool(pools, target, card)
      persist(pools)
      return pools
    },
    clearSession(sessionId: string): void {
      const sid = String(sessionId || '').trim()
      const payload = loadPayload()
      if (!payload.sessions[sid]) return
      delete payload.sessions[sid]
      payload.order = payload.order.filter((key) => key !== sid)
      savePayload(payload)
      recallPoolStoreVersion.value += 1
    }
  }
}
