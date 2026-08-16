import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRecallRoundPoolCache, recallPoolStoreVersion, resetRecallRoundPoolCacheForTest } from '../../../src/app/recallRoundPoolCache.ts'
import { createEmptyRoundRecallPools, setCharacterPool, setWorldPool, appendCharacterPoolCards } from '../../../src/app/recallRoundPool.ts'

const card = (id, origin = 'character_brain', ownerCharacterId = 'A') => ({
  id,
  title: `卡-${id}`,
  bodyText: `正文-${id}`,
  origin,
  ownerCharacterId: origin === 'doc_library' ? undefined : ownerCharacterId
})

describe('recallRoundPoolCache · 对话级缓存（2026-06-29 升级）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetRecallRoundPoolCacheForTest()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('save → 按 sessionId load 取回（刷新仍在·跨实例直读 localStorage 真相）', () => {
    const writer = createLocalRecallRoundPoolCache()
    const pools = createEmptyRoundRecallPools('s1', '7')
    setCharacterPool(pools, 'A', [card('a1')])
    setWorldPool(pools, [card('w1', 'doc_library')])
    writer.save(pools)

    const reader = createLocalRecallRoundPoolCache()
    const loaded = reader.load('s1')
    expect(loaded).not.toBeNull()
    // 2026-07-04 起角色卡池内 id 带归属前缀；世界卡不变。
    expect(loaded.characterPools.A.cards.map((c) => c.id)).toEqual(['A::a1'])
    expect(loaded.worldPool.cards.map((c) => c.id)).toEqual(['w1'])
  })

  it('load 未命中返回 null', () => {
    const cache = createLocalRecallRoundPoolCache()
    expect(cache.load('s1')).toBeNull()
  })

  it('一会话一池：同会话多次 save 覆盖同一池；不同会话互不串', () => {
    const cache = createLocalRecallRoundPoolCache()
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '1'), 'A', [card('a1')]))
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s2', '1'), 'A', [card('a3')]))
    expect(cache.load('s1').characterPools.A.cards[0].id).toBe('A::a1')
    expect(cache.load('s2').characterPools.A.cards[0].id).toBe('A::a3')
  })

  it('缺 sessionId 的池不写入', () => {
    const cache = createLocalRecallRoundPoolCache()
    cache.save(createEmptyRoundRecallPools('', '1'))
    expect(cache.load('')).toBeNull()
  })

  it('removeCard 软删：按池内 id（带归属前缀）移除并写墓碑，之后累积召回不复活', () => {
    const cache = createLocalRecallRoundPoolCache()
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [card('a1'), card('a2')])
    cache.save(pools)
    cache.removeCard('s1', 'A::a1')
    expect(cache.load('s1').characterPools.A.cards.map((c) => c.id)).toEqual(['A::a2'])
    // 模拟后续召回又把 a1 append 进来——墓碑应挡掉。
    const live = cache.load('s1')
    appendCharacterPoolCards(live, 'A', [card('a1')])
    cache.save(live)
    expect(cache.load('s1').characterPools.A.cards.map((c) => c.id)).toEqual(['A::a2'])
  })

  it('addCard：用户加自定义卡入角色池 / 世界池', () => {
    const cache = createLocalRecallRoundPoolCache()
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '1'), 'A', [card('a1')]))
    cache.addCard('s1', { kind: 'character', characterId: 'A' }, { id: 'u1', title: '手加', bodyText: '内容' })
    cache.addCard('s1', { kind: 'world' }, { id: 'uw', title: '世界手加', bodyText: '世界内容' })
    const loaded = cache.load('s1')
    expect(loaded.characterPools.A.cards.map((c) => c.id)).toContain('A::u1')
    expect(loaded.worldPool.cards.map((c) => c.id)).toContain('uw')
  })

  it('任何写入自增响应式版本号 recallPoolStoreVersion', () => {
    const cache = createLocalRecallRoundPoolCache()
    const before = recallPoolStoreVersion.value
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '1'), 'A', [card('a1')]))
    expect(recallPoolStoreVersion.value).toBeGreaterThan(before)
  })

  it('clearSession 只清该会话池，别的会话不动', () => {
    const cache = createLocalRecallRoundPoolCache()
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '1'), 'A', [card('a1')]))
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s2', '1'), 'A', [card('a3')]))
    cache.clearSession('s1')
    expect(cache.load('s1')).toBeNull()
    expect(cache.load('s2')).not.toBeNull()
  })

  it('LRU 修剪：超过会话上限淘汰最旧会话（保留最近写入）', () => {
    const cache = createLocalRecallRoundPoolCache()
    // MAX_SESSIONS=50，写 55 个会话，最旧 5 个应被淘汰
    for (let i = 1; i <= 55; i++) {
      cache.save(setCharacterPool(createEmptyRoundRecallPools(`s${i}`, '1'), 'A', [card(`a${i}`)]))
    }
    expect(cache.load('s1')).toBeNull()
    expect(cache.load('s5')).toBeNull()
    expect(cache.load('s6')).not.toBeNull()
    expect(cache.load('s55')).not.toBeNull()
  })

  it('损坏的 localStorage 容错：返回空、不抛', () => {
    const cache0 = createLocalRecallRoundPoolCache()
    cache0.save(setCharacterPool(createEmptyRoundRecallPools('s1', '1'), 'A', [card('a1')]))
    const realKey = Object.keys(window.localStorage).find((k) => k.startsWith('langhuan_recall_round_pools_v1'))
    window.localStorage.setItem(realKey, '{不是合法JSON')
    resetRecallRoundPoolCacheForTest()
    const cache = createLocalRecallRoundPoolCache()
    expect(cache.load('s1')).toBeNull()
  })

  it('迁移旧轮级缓存（rounds: session::anchor）→ 对话级聚合（同会话多轮卡并入一池·去重）', () => {
    // 直接写入旧结构 payload，再让单例从 localStorage 冷读迁移。
    const legacy = {
      rounds: {
        's1::1': { sessionId: 's1', roundAnchorId: '1', characterPools: { A: { cards: [card('a1')], recalledAt: 't1' } }, worldPool: { cards: [card('w1', 'doc_library')], recalledAt: 't1' } },
        's1::2': { sessionId: 's1', roundAnchorId: '2', characterPools: { A: { cards: [card('a1'), card('a2')], recalledAt: 't2' } }, worldPool: { cards: [], recalledAt: '' } }
      },
      order: ['s1::1', 's1::2']
    }
    // 用任一已建实例触发 account-scoped key 生成
    createLocalRecallRoundPoolCache().save(createEmptyRoundRecallPools('probe', '0'))
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('langhuan_recall_round_pools_v1'))
    window.localStorage.setItem(key, JSON.stringify(legacy))
    const cache = createLocalRecallRoundPoolCache()
    const loaded = cache.load('s1')
    expect(loaded).not.toBeNull()
    // a1 去重一次、a2 并入 → [a1, a2]（读侧统一补归属前缀）
    expect(loaded.characterPools.A.cards.map((c) => c.id).sort()).toEqual(['A::a1', 'A::a2'])
    expect(loaded.worldPool.cards.map((c) => c.id)).toEqual(['w1'])
  })

  // 2026-07-04 存量迁移：旧对话级 payload 里角色卡是未前缀的段位通用 id，load 即补归属前缀（幂等），
  // 与新 append（写侧前缀）去重口径一致、不产生重复卡。
  it('存量未前缀角色卡：load 读侧补归属前缀，与新召回同卡去重不重复', () => {
    createLocalRecallRoundPoolCache().save(createEmptyRoundRecallPools('probe', '0'))
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('langhuan_recall_round_pools_v1'))
    const legacySessions = {
      sessions: {
        s1: {
          sessionId: 's1', roundAnchorId: '1',
          characterPools: { A: { cards: [card('brain:personality')], recalledAt: 't1' } },
          worldPool: { cards: [], recalledAt: '' },
          removedCardIds: []
        }
      },
      order: ['s1']
    }
    window.localStorage.setItem(key, JSON.stringify(legacySessions))
    const cache = createLocalRecallRoundPoolCache()
    const loaded = cache.load('s1')
    expect(loaded.characterPools.A.cards.map((c) => c.id)).toEqual(['A::brain:personality'])
    // 新一轮召回同一张卡（写侧前缀）→ 去重，不出现两份。
    appendCharacterPoolCards(loaded, 'A', [card('brain:personality')])
    cache.save(loaded)
    expect(cache.load('s1').characterPools.A.cards.map((c) => c.id)).toEqual(['A::brain:personality'])
  })

  it('体积探针：单会话超软阈值时高声告警（console.warn）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createLocalRecallRoundPoolCache()
    const big = createEmptyRoundRecallPools('s1', 'big')
    setCharacterPool(big, 'A', [card('huge')])
    big.characterPools.A.cards[0].bodyText = 'x'.repeat(600 * 1024)
    cache.save(big)
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls.some((args) => String(args[0]).includes('单会话资料池过大'))).toBe(true)
  })

  it('正常体积不触发探针告警', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createLocalRecallRoundPoolCache()
    cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', 'ok'), 'A', [card('a1')]))
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
