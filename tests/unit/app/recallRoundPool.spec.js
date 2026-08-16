import { describe, expect, it } from 'vitest'
import {
  addUserCardToPool,
  appendCharacterPoolCards,
  appendWorldPoolCards,
  createEmptyRoundRecallPools,
  getCharacterPoolCards,
  getDirectorVisiblePools,
  getWorldPoolCards,
  hasCharacterRecalled,
  hasWorldRecalled,
  removeCardById,
  reconcileWorldPoolDocumentScope,
  renderDirectorVisiblePoolsBlock,
  setCharacterPool,
  setWorldPool
} from '../../../src/app/recallRoundPool.ts'

const charCard = (id, ownerCharacterId, extra = {}) => ({
  id,
  title: `卡-${id}`,
  bodyText: `正文-${id}`,
  origin: 'character_brain',
  ownerCharacterId,
  ...extra
})
const worldCard = (id, extra = {}) => ({
  id,
  title: `世界-${id}`,
  bodyText: `世界正文-${id}`,
  origin: 'doc_library',
  ...extra
})

describe('recallRoundPool · 轮级资料池地基（批次3·3a）', () => {
  it('createEmptyRoundRecallPools 建空池，锚 sessionId/roundAnchorId', () => {
    const pools = createEmptyRoundRecallPools('s1', '42')
    expect(pools.sessionId).toBe('s1')
    expect(pools.roundAnchorId).toBe('42')
    expect(pools.characterPools).toEqual({})
    expect(pools.worldPool).toEqual({ cards: [], recalledAt: '' })
    expect(pools.worldScope).toEqual({ worldId: '', documentIds: [] })
  })

  it('setCharacterPool 写入并标记已召回；hasCharacterRecalled 据 recalledAt 判定', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    expect(hasCharacterRecalled(pools, 'A')).toBe(false)
    setCharacterPool(pools, 'A', [charCard('a1', 'A')], '2026-06-23T00:00:00.000Z')
    expect(hasCharacterRecalled(pools, 'A')).toBe(true)
    expect(pools.characterPools.A.recalledAt).toBe('2026-06-23T00:00:00.000Z')
    expect(pools.characterPools.A.cards).toHaveLength(1)
  })

  it('命中 0 卡但召回过：recalledAt 非空即算已召回（不重复预召回）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [], '2026-06-23T00:00:00.000Z')
    expect(hasCharacterRecalled(pools, 'A')).toBe(true)
    expect(getCharacterPoolCards(pools, 'A')).toEqual([])
  })

  // 2026-07-04 起角色卡 id 入池即带归属前缀（<characterId>::<原始id>），去重按池内前缀 id。
  it('setCharacterPool / appendCharacterPoolCards 按 id 去重（池内 id 带归属前缀）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A'), charCard('a1', 'A'), charCard('a2', 'A')])
    expect(getCharacterPoolCards(pools, 'A').map((c) => c.id)).toEqual(['A::a1', 'A::a2'])
    appendCharacterPoolCards(pools, 'A', [charCard('a2', 'A'), charCard('a3', 'A')])
    expect(getCharacterPoolCards(pools, 'A').map((c) => c.id)).toEqual(['A::a1', 'A::a2', 'A::a3'])
  })

  it('appendCharacterPoolCards 保留原 recalledAt（不传新值时）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A')], '2026-06-23T00:00:00.000Z')
    appendCharacterPoolCards(pools, 'A', [charCard('a2', 'A')])
    expect(pools.characterPools.A.recalledAt).toBe('2026-06-23T00:00:00.000Z')
  })

  it('★隔离命门：getCharacterPoolCards 只返回该角色私有池，绝不含他角色池与世界池', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A')])
    setCharacterPool(pools, 'B', [charCard('b1', 'B')])
    setWorldPool(pools, [worldCard('w1')])

    const aCards = getCharacterPoolCards(pools, 'A')
    expect(aCards.map((c) => c.id)).toEqual(['A::a1'])
    // A 的池里绝不出现 B 的卡 / 世界卡
    expect(aCards.some((c) => c.id === 'B::b1')).toBe(false)
    expect(aCards.some((c) => c.origin === 'doc_library')).toBe(false)

    const bCards = getCharacterPoolCards(pools, 'B')
    expect(bCards.map((c) => c.id)).toEqual(['B::b1'])
    expect(bCards.some((c) => c.id === 'A::a1')).toBe(false)
  })

  it('★隔离命门：getWorldPoolCards 只返回世界池（doc_library），不含任何角色私有卡', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A')])
    setWorldPool(pools, [worldCard('w1'), worldCard('w2')])
    const world = getWorldPoolCards(pools)
    expect(world.map((c) => c.id)).toEqual(['w1', 'w2'])
    expect(world.every((c) => c.origin === 'doc_library')).toBe(true)
    expect(world.some((c) => c.ownerCharacterId)).toBe(false)
  })

  it('隔离读返回拷贝：外部改返回卡不污染池内真值', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A')])
    const cards = getCharacterPoolCards(pools, 'A')
    cards[0].bodyText = '被外部篡改'
    cards.push(charCard('inject', 'A'))
    expect(getCharacterPoolCards(pools, 'A')).toHaveLength(1)
    expect(getCharacterPoolCards(pools, 'A')[0].bodyText).toBe('正文-a1')
  })

  it('未召回角色取池返回空数组（不报错）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    expect(getCharacterPoolCards(pools, '不存在')).toEqual([])
  })

  it('世界池 set/append/hasWorldRecalled', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    expect(hasWorldRecalled(pools)).toBe(false)
    setWorldPool(pools, [worldCard('w1')], '2026-06-23T00:00:00.000Z')
    expect(hasWorldRecalled(pools)).toBe(true)
    appendWorldPoolCards(pools, [worldCard('w1'), worldCard('w2')])
    expect(getWorldPoolCards(pools).map((c) => c.id)).toEqual(['w1', 'w2'])
  })

  it('getDirectorVisiblePools 返回全部角色池 + 世界池（提调定方向用）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, 'A', [charCard('a1', 'A')], '2026-06-23T00:00:00.000Z')
    setCharacterPool(pools, 'B', [charCard('b1', 'B')], '2026-06-23T00:00:00.000Z')
    setWorldPool(pools, [worldCard('w1')])
    const view = getDirectorVisiblePools(pools)
    expect(view.characterPools.map((p) => p.characterId).sort()).toEqual(['A', 'B'])
    expect(view.worldPool.map((c) => c.id)).toEqual(['w1'])
    // 视图也是拷贝，改它不污染池
    view.characterPools[0].cards.push(charCard('x', 'A'))
    const totalNow = Object.values(pools.characterPools).reduce((sum, p) => sum + p.cards.length, 0)
    expect(totalNow).toBe(2)
  })

  it('空 characterId 不写入（防脏 key）', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setCharacterPool(pools, '', [charCard('a1', '')])
    expect(Object.keys(pools.characterPools)).toEqual([])
  })

  describe('用户增删 + 墓碑（2026-06-29 对话级）', () => {
    it('removeCardById：按池内 id（带归属前缀）移除，并写墓碑 removedCardIds', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      setCharacterPool(pools, 'A', [charCard('a1', 'A'), charCard('a2', 'A')])
      setWorldPool(pools, [worldCard('w1')])
      removeCardById(pools, 'A::a1')
      expect(getCharacterPoolCards(pools, 'A').map((c) => c.id)).toEqual(['A::a2'])
      expect(pools.removedCardIds).toContain('A::a1')
    })

    it('墓碑生效：被删卡之后 append（召回）不再入池（删除不复活）', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      setCharacterPool(pools, 'A', [charCard('a1', 'A')])
      removeCardById(pools, 'A::a1')
      appendCharacterPoolCards(pools, 'A', [charCard('a1', 'A'), charCard('a2', 'A')])
      expect(getCharacterPoolCards(pools, 'A').map((c) => c.id)).toEqual(['A::a2'])
    })

    // 2026-07-04 真机缺陷根治：大脑卡原始 id 是段位通用 id（如 brain:personality）跨角色撞车——
    // 归属前缀后删 A 的卡不再误伤 B 的同段位卡，墓碑也只拉黑 A 的该段位。
    it('★跨角色同段位卡互不误伤：删 A 的 brain:personality，B 的照常在池、B 再召回也不被墓碑挡', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      appendCharacterPoolCards(pools, 'A', [charCard('brain:personality', 'A')])
      appendCharacterPoolCards(pools, 'B', [charCard('brain:personality', 'B')])
      removeCardById(pools, 'A::brain:personality')
      expect(getCharacterPoolCards(pools, 'A')).toEqual([])
      expect(getCharacterPoolCards(pools, 'B').map((c) => c.id)).toEqual(['B::brain:personality'])
      // 墓碑只挡 A 的该段位再召回；B 甚至新角色 C 的同段位照常入池。
      appendCharacterPoolCards(pools, 'A', [charCard('brain:personality', 'A')])
      appendCharacterPoolCards(pools, 'C', [charCard('brain:personality', 'C')])
      expect(getCharacterPoolCards(pools, 'A')).toEqual([])
      expect(getCharacterPoolCards(pools, 'C').map((c) => c.id)).toEqual(['C::brain:personality'])
    })

    it('addUserCardToPool：加角色卡（character_brain·带 ownerCharacterId）/ 世界卡（doc_library）', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      addUserCardToPool(pools, { kind: 'character', characterId: 'A' }, { id: 'u1', title: '手加', bodyText: '内容' })
      addUserCardToPool(pools, { kind: 'world' }, { id: 'uw', title: '世界手加', bodyText: '世界内容' })
      const aCard = getCharacterPoolCards(pools, 'A').find((c) => c.id === 'A::u1')
      expect(aCard.origin).toBe('character_brain')
      expect(aCard.ownerCharacterId).toBe('A')
      const wCard = getWorldPoolCards(pools).find((c) => c.id === 'uw')
      expect(wCard.origin).toBe('doc_library')
    })

    it('addUserCardToPool 解除墓碑：删了又加回的卡可重新入池', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      setCharacterPool(pools, 'A', [charCard('a1', 'A')])
      removeCardById(pools, 'A::a1')
      addUserCardToPool(pools, { kind: 'character', characterId: 'A' }, { id: 'a1', title: '加回', bodyText: '内容' })
      expect(getCharacterPoolCards(pools, 'A').map((c) => c.id)).toContain('A::a1')
      expect(pools.removedCardIds).not.toContain('A::a1')
    })
  })

  it('★世界范围裁剪：换世界移除越界检索卡，未挂世界清空检索卡，但保留用户手动卡', () => {
    const pools = createEmptyRoundRecallPools('s1', '1')
    setWorldPool(pools, [
      worldCard('doc:doc_a', { sourceKind: 'retrieved', documentId: 'doc_a' }),
      worldCard('doc:doc_b', { sourceKind: 'retrieved', documentId: 'doc_b' })
    ], '2026-07-14T00:00:00.000Z')
    addUserCardToPool(pools, { kind: 'world' }, { id: 'user_world', title: '手动世界卡' })
    appendWorldPoolCards(pools, [worldCard('user_legacy', { sourceKind: undefined })])

    expect(reconcileWorldPoolDocumentScope(pools, { worldId: 'world_1', documentIds: ['doc_a'] }, () => '')).toBe(true)
    expect(getWorldPoolCards(pools).map((card) => card.id)).toEqual(['doc:doc_a', 'user_world', 'user_legacy'])
    expect(pools.worldPool.recalledAt).toBe('')

    expect(reconcileWorldPoolDocumentScope(pools, { worldId: '', documentIds: ['doc_a'] }, () => '')).toBe(true)
    expect(getWorldPoolCards(pools).map((card) => card.id)).toEqual(['user_world', 'user_legacy'])
  })

  describe('renderDirectorVisiblePoolsBlock（3b-3 提调可见块）', () => {
    it('渲染角色池（按名）+ 世界池（标仅供旁白）', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      setCharacterPool(pools, 'A', [{ id: 'a1', title: '秘密', summary: 'A 的私密往事', origin: 'character_brain', ownerCharacterId: 'A' }])
      setWorldPool(pools, [{ id: 'w1', title: '主城', summary: '世界主城背景', origin: 'doc_library' }])
      const block = renderDirectorVisiblePoolsBlock(getDirectorVisiblePools(pools), (id) => (id === 'A' ? '星依' : id))
      expect(block).toContain('已为各出场角色预先备好的资料池')
      expect(block).toContain('角色 星依（characterId=A）')
      expect(block).toContain('秘密：A 的私密往事')
      expect(block).toContain('世界本源知识')
      expect(block).toContain('仅供旁白')
      expect(block).toContain('主城：世界主城背景')
    })

    it('全空池返回空串（调用方据此不注入）', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      expect(renderDirectorVisiblePoolsBlock(getDirectorVisiblePools(pools))).toBe('')
    })

    it('perPoolLimit 截断每池条数', () => {
      const pools = createEmptyRoundRecallPools('s1', '1')
      setCharacterPool(pools, 'A', Array.from({ length: 10 }, (_, i) => charCard(`a${i}`, 'A')))
      const block = renderDirectorVisiblePoolsBlock(getDirectorVisiblePools(pools), undefined, { perPoolLimit: 3 })
      expect(block.split('\n').filter((line) => line.startsWith('  - ')).length).toBe(3)
    })
  })
})
