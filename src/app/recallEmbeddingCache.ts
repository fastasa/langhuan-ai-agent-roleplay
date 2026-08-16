/**
 * 召回 embedding 向量缓存 —— 2026-07-04 存储治理改造（真机事故根治）。
 *
 * 旧实现整包 JSON 明文存 localStorage，LRU 只按「条数」（2000 条）不管字节——真机实测单账号吃掉 4.36MB，
 * 把整个源 ~5MB localStorage 配额顶穿，资料池等小户 setItem 静默失败（QuotaExceededError 被吞）
 * → 表现为「recallCharacterBrain 召回命中了、资料池里却没有角色卡」。
 *
 * 现役方案（同步 API 一字不动·召回链路零改）：
 * - 读写全打内存 Map（同步）；IndexedDB 只作持久层——启动异步预热（merge·内存较新者胜）、写入去抖异步落盘。
 * - 向量压缩：number[] → Float32Array → base64（体积 ≈ JSON 明文 1/4~1/8，精度损失对相似度打分无感）。
 * - LRU 双限：条数上限 + 序列化字节上限，谁先超谁裁（根治「条数没到、字节爆仓」）。
 * - 一次性迁移：启动时把 localStorage 里所有旧向量 blob（含其它账号 key）写入 IndexedDB 后**删除**，
 *   立刻释放约 5MB 配额；无 IndexedDB 环境不删（不丢老缓存）。
 * - 无 indexedDB 环境（SSR/Node 脚本/jsdom 单测）：内存-only；缓存丢失只意味着重算 embedding，语义安全。
 */

import { getLocalWorkspaceStorageKey } from './localWorkspace'

export interface RecallEmbeddingVectorCache {
  getVector(key: string): number[] | null
  setVector(key: string, vector: number[]): void
}

type CacheEntry = { v64: string; updatedAt: string }

type PersistedPayload = {
  entries: Record<string, { v64?: unknown; vector?: unknown; updatedAt?: unknown }>
  order?: unknown
}

type MemoryStore = {
  /** LRU 真值：Map 插入序=旧→新（写入/覆盖移到队尾，裁剪从队头逐出）。 */
  entries: Map<string, CacheEntry>
  totalV64Chars: number
  persistTimer: ReturnType<typeof setTimeout> | null
}

const STORAGE_KEY = 'langhuan_recall_embedding_vectors_v1'
const IDB_NAME = 'langhuan_recall_embedding_cache_v1'
const IDB_STORE = 'payloads'
const PERSIST_DEBOUNCE_MS = 800

/** LRU 双限（可测试覆写）：条数上限 + v64 字符总量上限（base64 字符数≈字节数）。 */
let maxCacheEntries = 2000
let maxTotalV64Chars = 4 * 1024 * 1024

/** 账号 key → 内存店（模块级单例：useAI 多实例/多处 create 共享同一真相）。 */
const stores = new Map<string, MemoryStore>()
let legacyMigrationStarted = false
let dbPromise: Promise<IDBDatabase | null> | null = null

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// ── base64 ↔ Float32 编解码（浏览器 btoa/atob 优先，Node Buffer 兜底） ──

function bytesToBase64(bytes: Uint8Array): string | null {
  try {
    if (typeof btoa === 'function') {
      let binary = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      return btoa(binary)
    }
  } catch { /* 落到 Buffer 兜底 */ }
  try {
    const BufferCtor = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(encoding: string): string } } }).Buffer
    return BufferCtor ? BufferCtor.from(bytes).toString('base64') : null
  } catch {
    return null
  }
}

function base64ToBytes(text: string): Uint8Array | null {
  try {
    if (typeof atob === 'function') {
      const binary = atob(text)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      return bytes
    }
  } catch { /* 落到 Buffer 兜底 */ }
  try {
    const BufferCtor = (globalThis as { Buffer?: { from(data: string, encoding: string): Uint8Array } }).Buffer
    return BufferCtor ? new Uint8Array(BufferCtor.from(text, 'base64')) : null
  } catch {
    return null
  }
}

/** number[] → Float32 base64（丢弃非有限值；全空返回 null）。 */
export function encodeVectorBase64(vector: number[]): string | null {
  if (!Array.isArray(vector)) return null
  const finite = vector.map(Number).filter((item) => Number.isFinite(item))
  if (!finite.length) return null
  return bytesToBase64(new Uint8Array(Float32Array.from(finite).buffer))
}

/** Float32 base64 → number[]（长度非 4 倍数/解码失败返回 null）。 */
export function decodeVectorBase64(v64: string): number[] | null {
  const text = String(v64 || '').trim()
  if (!text) return null
  const bytes = base64ToBytes(text)
  if (!bytes || !bytes.length || bytes.length % 4 !== 0) return null
  // slice 拷贝保证 4 字节对齐（Buffer 兜底路径的 byteOffset 可能不对齐）。
  const floats = new Float32Array(bytes.slice().buffer)
  const out = Array.from(floats)
  return out.length ? out : null
}

// ── IndexedDB 持久层（不可用=内存-only，全部静默降级） ──

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let factory: IDBFactory | null = null
    try {
      factory = typeof indexedDB !== 'undefined' ? indexedDB : null
    } catch {
      factory = null
    }
    if (!factory) {
      resolve(null)
      return
    }
    try {
      const request = factory.open(IDB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function idbGet(key: string): Promise<PersistedPayload | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
      request.onsuccess = () => resolve((request.result as PersistedPayload) || null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbPut(key: string, payload: PersistedPayload): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(payload, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

// ── 旧 localStorage blob 解析/迁移 ──

/** 旧明文 payload（entries[k].vector=number[]）或已压缩 payload（entries[k].v64）→ 统一压缩形态；坏 blob 返回 null。 */
function normalizeLegacyPayload(raw: unknown): PersistedPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const rawEntries = record.entries && typeof record.entries === 'object' && !Array.isArray(record.entries)
    ? record.entries as Record<string, unknown>
    : {}
  const entries: Record<string, { v64: string; updatedAt: string }> = {}
  for (const [key, value] of Object.entries(rawEntries)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const source = value as Record<string, unknown>
    const v64 = typeof source.v64 === 'string' && source.v64
      ? source.v64
      : (Array.isArray(source.vector) ? encodeVectorBase64(source.vector as number[]) : null)
    if (!v64) continue
    entries[key] = { v64, updatedAt: String(source.updatedAt || new Date().toISOString()) }
  }
  const order = Array.isArray(record.order)
    ? record.order.map((item) => String(item || '')).filter((key) => Boolean(entries[key]))
    : Object.keys(entries)
  for (const key of Object.keys(entries)) {
    if (!order.includes(key)) order.push(key)
  }
  return { entries, order }
}

/** 当前账号旧 blob 同步导入内存（首次建店时·让预热前就有缓存可用）；不删 blob（删除统一在迁移里做）。 */
function seedFromLegacyLocalStorage(scopedKey: string, store: MemoryStore): void {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    const payload = normalizeLegacyPayload(JSON.parse(storage.getItem(scopedKey) || 'null'))
    if (!payload) return
    const order = payload.order as string[]
    for (const key of order) {
      const entry = payload.entries[key]
      if (!entry || typeof entry.v64 !== 'string') continue
      store.entries.set(key, { v64: entry.v64, updatedAt: String(entry.updatedAt || '') })
      store.totalV64Chars += entry.v64.length
    }
    trimStore(store)
  } catch { /* 坏 blob 当空处理 */ }
}

/**
 * 一次性迁移（模块生命周期只跑一次）：localStorage 里所有向量 blob（含其它账号 key + 无后缀裸 key）
 * 写入 IndexedDB 后删除，立刻释放配额。IDB 写失败/不可用则**不删**（不丢老缓存·真浏览器都有 IDB）。
 */
function migrateLegacyBlobsToIdb(): void {
  if (legacyMigrationStarted) return
  legacyMigrationStarted = true
  const storage = getLocalStorage()
  if (!storage) return
  const keys: string[] = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && (key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:`))) keys.push(key)
    }
  } catch {
    return
  }
  if (!keys.length) return
  void (async () => {
    for (const key of keys) {
      try {
        const payload = normalizeLegacyPayload(JSON.parse(storage.getItem(key) || 'null'))
        // 坏 blob（解析不出任何向量）直接删——缓存可重算，留着只占配额。
        const ok = payload && (payload.order as string[]).length ? await idbPut(key, payload) : true
        if (ok) storage.removeItem(key)
      } catch { /* 单 key 失败不阻断其它 */ }
    }
  })()
}

/** IDB 预热 merge：只补内存里没有的 key（内存较新者胜），并保持「预热数据在前=更旧」的 LRU 序。 */
async function hydrateFromIdb(scopedKey: string, store: MemoryStore): Promise<void> {
  const payload = await idbGet(scopedKey)
  if (!payload) return
  const order = Array.isArray(payload.order) ? payload.order.map((item) => String(item || '')) : Object.keys(payload.entries || {})
  const merged = new Map<string, CacheEntry>()
  let mergedChars = 0
  for (const key of order) {
    if (store.entries.has(key)) continue
    const entry = payload.entries?.[key]
    const v64 = entry && typeof entry.v64 === 'string' ? entry.v64 : null
    if (!v64) continue
    merged.set(key, { v64, updatedAt: String(entry?.updatedAt || '') })
    mergedChars += v64.length
  }
  if (!merged.size) return
  for (const [key, entry] of store.entries) merged.set(key, entry)
  store.entries = merged
  store.totalV64Chars += mergedChars
  trimStore(store)
}

/** LRU 双限裁剪：条数或字节任一超限即从队头（最旧）逐出。 */
function trimStore(store: MemoryStore): void {
  while (store.entries.size > maxCacheEntries || store.totalV64Chars > maxTotalV64Chars) {
    const oldestKey = store.entries.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    const oldest = store.entries.get(oldestKey)
    store.entries.delete(oldestKey)
    store.totalV64Chars -= oldest ? oldest.v64.length : 0
  }
  if (store.totalV64Chars < 0) store.totalV64Chars = 0
}

function schedulePersist(scopedKey: string, store: MemoryStore): void {
  if (store.persistTimer) clearTimeout(store.persistTimer)
  store.persistTimer = setTimeout(() => {
    store.persistTimer = null
    void persistStore(scopedKey, store)
  }, PERSIST_DEBOUNCE_MS)
}

async function persistStore(scopedKey: string, store: MemoryStore): Promise<void> {
  const entries: Record<string, CacheEntry> = {}
  const order: string[] = []
  for (const [key, entry] of store.entries) {
    entries[key] = { v64: entry.v64, updatedAt: entry.updatedAt }
    order.push(key)
  }
  await idbPut(scopedKey, { entries, order })
}

function getStore(scopedKey: string): MemoryStore {
  const existing = stores.get(scopedKey)
  if (existing) return existing
  const store: MemoryStore = { entries: new Map(), totalV64Chars: 0, persistTimer: null }
  stores.set(scopedKey, store)
  seedFromLegacyLocalStorage(scopedKey, store)
  void hydrateFromIdb(scopedKey, store)
  migrateLegacyBlobsToIdb()
  return store
}

/** 测试专用：清内存店/迁移标记/DB 句柄缓存 + 覆写 LRU 双限。 */
export function resetRecallEmbeddingCacheForTest(limits?: { maxEntries?: number; maxTotalChars?: number }): void {
  for (const store of stores.values()) {
    if (store.persistTimer) clearTimeout(store.persistTimer)
  }
  stores.clear()
  legacyMigrationStarted = false
  dbPromise = null
  maxCacheEntries = limits?.maxEntries ?? 2000
  maxTotalV64Chars = limits?.maxTotalChars ?? 4 * 1024 * 1024
}

export function createLocalRecallEmbeddingVectorCache(): RecallEmbeddingVectorCache {
  // 账号 key 每次操作现算（登录切换后自动切店），与旧实现 savePayload 时点取 key 的语义对齐。
  const scopedKey = () => getLocalWorkspaceStorageKey(STORAGE_KEY)
  // 2026-07-04 二验修：建缓存即建店（原为首次 get/set 才建）——否则纯文本搜索轮不碰 embedding，
  // localStorage 里 ~5MB 旧向量 blob 一直不迁、配额持续顶格挤死资料池写盘。useAI 应用启动即 create，
  // 等效「页面加载即迁移」；无 window/IDB 环境内部各自空操作，零副作用。
  getStore(scopedKey())
  return {
    getVector(key: string): number[] | null {
      const normalizedKey = String(key || '').trim()
      if (!normalizedKey) return null
      const entry = getStore(scopedKey()).entries.get(normalizedKey)
      return entry ? decodeVectorBase64(entry.v64) : null
    },
    setVector(key: string, vector: number[]): void {
      const normalizedKey = String(key || '').trim()
      if (!normalizedKey) return
      const v64 = encodeVectorBase64(vector)
      if (!v64) return
      const sk = scopedKey()
      const store = getStore(sk)
      const previous = store.entries.get(normalizedKey)
      if (previous) {
        store.entries.delete(normalizedKey)
        store.totalV64Chars -= previous.v64.length
      }
      store.entries.set(normalizedKey, { v64, updatedAt: new Date().toISOString() })
      store.totalV64Chars += v64.length
      trimStore(store)
      schedulePersist(sk, store)
    }
  }
}
