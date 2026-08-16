/**
 * 资料池（每角色资料池 + 世界知识池）—— 单聊群聊统一与取料池化计划书 批次3·子批3a 地基。
 *
 * 【2026-06-29 升级·对话级】用户拍板：池子从「轮级临时」改成「对话级持久 + 累积去重 + 用户可增删」。
 * - 缓存 key 由 (sessionId, roundAnchorId) 收敛为仅 sessionId（见 recallRoundPoolCache）：一会话一池，跨轮/跨提调带重启不重置。
 * - 填池由「整池覆盖 setXxxPool」改为「累积 appendXxx + 按 id 去重」：每轮新召回并入同一池，已有卡（含用户手加）不被冲掉。
 * - 用户可增删：removeCardById 软删（写墓碑 removedCardIds，召回不复活）；addUserCardToPool 手动加自定义卡。
 *

 * 真值边界（用户 2026-06-23 拍板·最强隔离）：
 * - 角色池 characterPools[X]：只装该角色「私有大脑 + 他者可观察外貌例外」召回卡（origin: character_brain / public）。
 * - 世界池 worldPool：只装文档库（世界本源知识）召回卡（origin: doc_library），只供旁白，角色提示词永不注入。
 * - 文档库整体归世界池——不再进任何角色池（收敛现役「角色召回含文档库」，由 3b 接链路时落实）。
 *
 * 隔离的最终防线在「注入侧」（3c）：本模块只提供「按容器取池」的隔离读接口——
 * getCharacterPoolCards 只返回该角色私有池、绝不返回世界池或他角色池；getWorldPoolCards 只返回世界池。
 * 提调（导演 loop）经 getDirectorVisiblePools 可读全部池做方向（3b 接），但产出方向的护栏在协议层（3b）。
 *
 * 本子批3a 只定结构 + 纯读写 + 隔离读接口，不接运行时取料链路（3b 起接）。
 */

export type RecallPoolCardOrigin = 'character_brain' | 'public' | 'doc_library'

/**
 * 池内资料卡（自包含最小结构·按批次0 地基规范）。
 * 与现役 BrainRecallCandidateCard 字段对齐（id / t→title / s→summary / bodyText / ownerCharacterId），
 * 3b 填池时由映射器从 BrainRecallCandidateCard / TidiaoScoredCandidate 转入，避免分叉。
 */
export interface RecallPoolCard {
  id: string
  title: string
  summary?: string
  bodyText?: string
  origin: RecallPoolCardOrigin
  /** 角色卡归属（character_brain / public 卡带）；世界卡（doc_library）为空。 */
  ownerCharacterId?: string
  /** 填池时的 embedding 打分（A1 轻量预召回），供排序/截断；缺省 0。 */
  score?: number
  /** retrieved=来自世界挂载文档；user=用户手动卡，不随世界切换被裁掉。 */
  sourceKind?: 'retrieved' | 'user'
  /** 世界文档卡的正式 documentId；存量卡可由 unitId 读侧补齐。 */
  documentId?: string
}

export interface CharacterRecallPool {
  cards: RecallPoolCard[]
  /** 本轮该角色已召回标记（判断是否需懒召回/追加）；空串=未召回。 */
  recalledAt: string
}

export interface WorldRecallPool {
  cards: RecallPoolCard[]
  /** 本轮世界池已召回标记；空串=未召回。 */
  recalledAt: string
}

export interface RoundRecallPools {
  sessionId: string
  /**
   * 上次填池的轮锚（=最近一次把召回结果累积进本池的那一轮用户消息楼层 id）。
   * 对话级升级后**不再作缓存 key**（缓存按 sessionId），仅用于「同一轮已填则跳过重复 embedding 预召回」的去重。
   * 历史字段名沿用 roundAnchorId（语义已变），避免大范围改名churn。
   */
  roundAnchorId: string
  characterPools: Record<string, CharacterRecallPool>
  worldPool: WorldRecallPool
  /** 软删墓碑：用户移除过的卡 id；填池/累积时这些 id 一律不再入池（删除不被召回复活）。 */
  removedCardIds?: string[]
  /** 最近一次完成裁剪的世界文档范围，只是缓存审计信息，不是挂载真值。 */
  worldScope?: { worldId: string; documentIds: string[] }
}

/** 提调可见全部池视图（3b：导演 loop 据此定方向，替换现役 docLibraryOnly-only）。 */
export interface DirectorVisiblePools {
  characterPools: Array<{ characterId: string; cards: RecallPoolCard[]; recalledAt: string }>
  worldPool: RecallPoolCard[]
}

function cloneCard(card: RecallPoolCard): RecallPoolCard {
  return { ...card }
}

/** 按 id 去重 + 丢空 id（追加召回/填池都过它，防同卡重复入池）。保序，先到先留。 */
function dedupeById(cards: RecallPoolCard[] = []): RecallPoolCard[] {
  const seen = new Set<string>()
  const out: RecallPoolCard[] = []
  for (const card of Array.isArray(cards) ? cards : []) {
    const id = String(card?.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ ...card, id })
  }
  return out
}

export function createEmptyRoundRecallPools(sessionId: string, roundAnchorId: string): RoundRecallPools {
  return {
    sessionId: String(sessionId || ''),
    roundAnchorId: String(roundAnchorId || ''),
    characterPools: {},
    worldPool: { cards: [], recalledAt: '' },
    removedCardIds: [],
    worldScope: { worldId: '', documentIds: [] }
  }
}

/**
 * 角色卡池内唯一 id：加归属前缀 `<characterId>::<原始卡id>`（幂等·已带本归属前缀不重复加）。
 * 根治 2026-07-04 真机缺陷：大脑卡原始 id 是段位通用 id（如 brain:personality），跨角色撞车——
 * 删一个角色的卡会把所有角色的同段位卡一起删掉，且墓碑按 id 全池生效 = 同段位召回被永久拉黑。
 * 前缀只在池层加（fill 层/工具返回的 unitId 不动）；世界卡（unitId 全局唯一）不加。
 * 联动：recallRoundPoolCache.normalizeSession 读侧对存量旧数据做同一前缀迁移，两处口径需一致。
 */
export function scopeCharacterCardId(characterId: string, cardId: string): string {
  const owner = String(characterId || '').trim()
  const id = String(cardId || '').trim()
  if (!owner || !id) return id
  const prefix = `${owner}::`
  return id.startsWith(prefix) ? id : `${prefix}${id}`
}

/** 角色卡批量加归属前缀（append/set 单点收口）。 */
function scopeCharacterCards(characterId: string, cards: RecallPoolCard[] = []): RecallPoolCard[] {
  return (Array.isArray(cards) ? cards : []).map((card) => ({ ...card, id: scopeCharacterCardId(characterId, card?.id || '') }))
}

/** 墓碑过滤：丢掉用户软删过的卡（对话级升级·删除不被召回复活）。 */
function dropRemoved(pools: RoundRecallPools, cards: RecallPoolCard[] = []): RecallPoolCard[] {
  const tomb = new Set((pools?.removedCardIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  if (!tomb.size) return Array.isArray(cards) ? cards : []
  return (Array.isArray(cards) ? cards : []).filter((card) => !tomb.has(String(card?.id || '').trim()))
}

/** 整池写入某角色（预召回填池·3b）。同卡去重；recalledAt 缺省取当前时间（标记已召回）。过滤墓碑。 */
export function setCharacterPool(
  pools: RoundRecallPools,
  characterId: string,
  cards: RecallPoolCard[],
  recalledAt?: string
): RoundRecallPools {
  const id = String(characterId || '').trim()
  if (!id) return pools
  pools.characterPools[id] = {
    cards: dedupeById(dropRemoved(pools, scopeCharacterCards(id, cards))),
    recalledAt: recalledAt || new Date().toISOString()
  }
  return pools
}

/** 追加卡到某角色池（累积召回）。与已存卡按 id 去重；过滤墓碑；保留原 recalledAt（除非显式传新值）。 */
export function appendCharacterPoolCards(
  pools: RoundRecallPools,
  characterId: string,
  cards: RecallPoolCard[],
  recalledAt?: string
): RoundRecallPools {
  const id = String(characterId || '').trim()
  if (!id) return pools
  const existing = pools.characterPools[id]
  pools.characterPools[id] = {
    cards: dedupeById([...(existing?.cards || []), ...dropRemoved(pools, scopeCharacterCards(id, cards))]),
    recalledAt: recalledAt || existing?.recalledAt || new Date().toISOString()
  }
  return pools
}

/** 整池写入世界池（预召回填池·3b）。过滤墓碑。 */
export function setWorldPool(
  pools: RoundRecallPools,
  cards: RecallPoolCard[],
  recalledAt?: string
): RoundRecallPools {
  pools.worldPool = {
    cards: dedupeById(dropRemoved(pools, cards)),
    recalledAt: recalledAt || new Date().toISOString()
  }
  return pools
}

/** 追加卡到世界池（累积召回）。过滤墓碑。 */
export function appendWorldPoolCards(
  pools: RoundRecallPools,
  cards: RecallPoolCard[],
  recalledAt?: string
): RoundRecallPools {
  pools.worldPool = {
    cards: dedupeById([...(pools.worldPool?.cards || []), ...dropRemoved(pools, cards)]),
    recalledAt: recalledAt || pools.worldPool?.recalledAt || new Date().toISOString()
  }
  return pools
}

/**
 * 用户软删某卡（对话级·命门）：从所有角色池 + 世界池移除该 id，并写墓碑 removedCardIds——
 * 之后任何填池/累积都不再让它入池（删除不被召回复活）。返回同一 pools（就地改）。
 * 2026-07-04 起角色卡 id 带归属前缀=全局唯一，跨池遍历只会命中它自己那一池（删 A 的卡不再误伤 B 的同段位卡，
 * 墓碑也只拉黑该角色该段位）。
 */
export function removeCardById(pools: RoundRecallPools, cardId: string): RoundRecallPools {
  const id = String(cardId || '').trim()
  if (!pools || !id) return pools
  for (const cid of Object.keys(pools.characterPools || {})) {
    const pool = pools.characterPools[cid]
    if (pool?.cards) pool.cards = pool.cards.filter((card) => String(card?.id || '').trim() !== id)
  }
  if (pools.worldPool?.cards) pools.worldPool.cards = pools.worldPool.cards.filter((card) => String(card?.id || '').trim() !== id)
  const tomb = Array.isArray(pools.removedCardIds) ? pools.removedCardIds : (pools.removedCardIds = [])
  if (!tomb.includes(id)) tomb.push(id)
  return pools
}

/**
 * 用户手动加自定义资料卡（对话级）：
 * - target=character → 入该角色私有池（origin character_brain·ownerCharacterId=该角色·会注入该角色生成提示词）。
 * - target=world → 入世界池（origin doc_library·仅供旁白）。
 * 加卡时把该 id 从墓碑移除（允许"删了又加回"）。卡 id 由调用方生成（需唯一）。
 */
export function addUserCardToPool(
  pools: RoundRecallPools,
  target: { kind: 'character'; characterId: string } | { kind: 'world' },
  card: { id: string; title?: string; summary?: string; bodyText?: string }
): RoundRecallPools {
  const id = String(card?.id || '').trim()
  if (!pools || !id) return pools
  // 加卡前先解除墓碑（否则 append 的墓碑过滤会把它挡掉）。角色卡按池内最终 id（带归属前缀）解除。
  const storedId = target.kind === 'character' ? scopeCharacterCardId(target.characterId, id) : id
  if (Array.isArray(pools.removedCardIds)) {
    pools.removedCardIds = pools.removedCardIds.filter((t) => String(t || '').trim() !== storedId)
  }
  const base: RecallPoolCard = {
    id,
    title: String(card?.title || ''),
    origin: target.kind === 'character' ? 'character_brain' : 'doc_library',
    sourceKind: 'user'
  }
  if (card?.summary) base.summary = String(card.summary)
  if (card?.bodyText) base.bodyText = String(card.bodyText)
  if (target.kind === 'character') {
    base.ownerCharacterId = String(target.characterId || '').trim()
    appendCharacterPoolCards(pools, base.ownerCharacterId, [base])
  } else {
    appendWorldPoolCards(pools, [base])
  }
  return pools
}

/**
 * 把持久世界池收敛到当前会话所挂世界。用户手动卡属于会话创作资产，保留；
 * 所有检索卡必须能追溯到当前世界挂载的 documentId，否则立即移出。
 */
export function reconcileWorldPoolDocumentScope(
  pools: RoundRecallPools,
  scope: { worldId: string; documentIds: readonly string[] },
  resolveDocumentId: (unitId: string) => string
): boolean {
  const worldId = String(scope?.worldId || '').trim()
  const documentIds = worldId
    ? Array.from(new Set((scope?.documentIds || []).map((id) => String(id || '').trim()).filter(Boolean)))
    : []
  const allowed = new Set(documentIds)
  const beforeCards = pools.worldPool?.cards || []
  const cards: RecallPoolCard[] = []
  for (const card of beforeCards) {
    // P2-1 前的用户卡没有 sourceKind，但现役生成 id 稳定以 user_ 开头；读侧一次性识别并补标签。
    if (card.sourceKind === 'user' || String(card.id || '').startsWith('user_')) {
      cards.push({ ...card, sourceKind: 'user' })
      continue
    }
    const documentId = String(card.documentId || resolveDocumentId(card.id) || '').trim()
    if (!worldId || !documentId || !allowed.has(documentId)) continue
    cards.push({ ...card, sourceKind: 'retrieved', documentId })
  }
  const previous = pools.worldScope
  const scopeChanged = String(previous?.worldId || '') !== worldId
    || JSON.stringify(previous?.documentIds || []) !== JSON.stringify(documentIds)
  const cardsChanged = cards.length !== beforeCards.length
    || cards.some((card, index) => card.documentId !== beforeCards[index]?.documentId || card.sourceKind !== beforeCards[index]?.sourceKind)
  pools.worldPool = {
    cards,
    recalledAt: scopeChanged ? '' : String(pools.worldPool?.recalledAt || '')
  }
  pools.worldScope = { worldId, documentIds }
  return scopeChanged || cardsChanged
}

/** 该角色本轮是否已召回过（recalledAt 非空即算，哪怕命中 0 卡也不再重复预召回）。 */
export function hasCharacterRecalled(pools: RoundRecallPools, characterId: string): boolean {
  const pool = pools?.characterPools?.[String(characterId || '').trim()]
  return Boolean(pool && pool.recalledAt)
}

/** 世界池本轮是否已召回过。 */
export function hasWorldRecalled(pools: RoundRecallPools): boolean {
  return Boolean(pools?.worldPool?.recalledAt)
}

/**
 * 隔离读·命门（3c 注入侧据此装配角色提示词）：
 * 只返回该角色私有池卡（character_brain / public），**绝不**返回世界池或他角色池。返回拷贝防外部污染回写。
 */
export function getCharacterPoolCards(pools: RoundRecallPools, characterId: string): RecallPoolCard[] {
  const pool = pools?.characterPools?.[String(characterId || '').trim()]
  if (!pool) return []
  return pool.cards.map(cloneCard)
}

/**
 * 隔离读·命门（3c 注入侧据此装配旁白提示词）：
 * 只返回世界池卡（doc_library），只供旁白；角色提示词永不调用本函数。返回拷贝。
 */
export function getWorldPoolCards(pools: RoundRecallPools): RecallPoolCard[] {
  return (pools?.worldPool?.cards || []).map(cloneCard)
}

/**
 * 提调（导演 loop）可见全部池（3b 定方向用）：所有角色池 + 世界池。
 * 提调能看全部，但「给角色 X 的方向只能基于 X 池 + 公共」由 3b 提调方向护栏（协议层）约束，本结构不做裁剪。
 */
export function getDirectorVisiblePools(pools: RoundRecallPools): DirectorVisiblePools {
  return {
    characterPools: Object.entries(pools?.characterPools || {}).map(([characterId, pool]) => ({
      characterId,
      cards: pool.cards.map(cloneCard),
      recalledAt: pool.recalledAt
    })),
    worldPool: getWorldPoolCards(pools)
  }
}

/**
 * 渲染「提调可见各池」grounding 块（3b-3）：供 decideRoundDirector 注入提调 messages，让提调据各角色已掌握资料定方向。
 * 角色池按 ownerCharacterId 分组列「该角色已掌握」；世界池单列并标「仅供旁白」。摘要优先（无摘要回退正文/标题），
 * 每池截断 perPoolLimit（默认 6）控 token。全空返回 ''（调用方据此不注入）。
 * 注意：这是给提调「看」的定方向依据，隔离的最终防线仍在注入侧（3c：角色提示词只注自己池），不靠这里。
 */
export function renderDirectorVisiblePoolsBlock(
  visible: DirectorVisiblePools,
  resolveName?: (characterId: string) => string,
  options: { perPoolLimit?: number } = {}
): string {
  const limit = Math.max(1, options.perPoolLimit ?? 6)
  const lineOf = (card: RecallPoolCard): string => {
    const title = String(card.title || '').trim()
    const summary = String(card.summary || card.bodyText || '').replace(/\s+/g, ' ').trim()
    if (title && summary) return `  - ${title}：${summary}`
    return `  - ${title || summary}`
  }
  const sections: string[] = []
  for (const pool of visible?.characterPools || []) {
    if (!pool.cards.length) continue
    const name = resolveName ? resolveName(pool.characterId) : pool.characterId
    sections.push(
      `▶ 角色 ${name}（characterId=${pool.characterId}）本轮已掌握的资料：\n` +
      pool.cards.slice(0, limit).map(lineOf).join('\n')
    )
  }
  if (visible?.worldPool?.length) {
    sections.push(
      '▶ 世界本源知识（仅供旁白承接环境/背景，绝不能写进任何角色的方向或台词）：\n' +
      visible.worldPool.slice(0, limit).map(lineOf).join('\n')
    )
  }
  if (!sections.length) return ''
  return ['【本轮已为各出场角色预先备好的资料池（你定方向的依据）】', ...sections].join('\n')
}
