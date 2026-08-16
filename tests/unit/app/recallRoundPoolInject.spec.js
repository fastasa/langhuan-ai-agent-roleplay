import { describe, expect, it } from 'vitest'
import {
  createEmptyRoundRecallPools,
  getCharacterPoolCards,
  getWorldPoolCards,
  setCharacterPool,
  setWorldPool
} from '../../../src/app/recallRoundPool.ts'
import {
  renderCharacterPoolRecallSections,
  worldPoolCardsToNarrationEvidence
} from '../../../src/app/recallRoundPoolInject.ts'

// 批次3·3c 注入侧隔离命门强断言：组合「真隔离读接口 + 真注入转换器」（与运行时同一条链路），
// 用独有 token 验世界池绝不进任一角色 recallSections、A 池 token 不进 B 的 recallSections、世界 token 只进旁白证据。
const TKN_WORLD = 'TKN_WORLD_镜庭主城世界本源'
const TKN_A = 'TKN_A_薇尔莉特私有往事'
const TKN_B = 'TKN_B_姬尔私有秘密'

function buildIsolatedPools() {
  const pools = createEmptyRoundRecallPools('session_x', '1001')
  setCharacterPool(pools, 'char_A', [
    { id: 'a1', title: '薇尔莉特的记忆', bodyText: TKN_A, origin: 'character_brain', ownerCharacterId: 'char_A' }
  ])
  setCharacterPool(pools, 'char_B', [
    { id: 'b1', title: '姬尔的记忆', bodyText: TKN_B, origin: 'character_brain', ownerCharacterId: 'char_B' }
  ])
  setWorldPool(pools, [
    { id: 'w1', title: '镜庭主城', summary: TKN_WORLD, origin: 'doc_library' }
  ])
  return pools
}

describe('recallRoundPoolInject — 角色侧注入（renderCharacterPoolRecallSections）', () => {
  it('★命门：角色 A 的 recallSections 只含自己池 token，绝不含世界池/他角色池 token', () => {
    const pools = buildIsolatedPools()
    const sectionsA = renderCharacterPoolRecallSections(getCharacterPoolCards(pools, 'char_A'))
    const textA = JSON.stringify(sectionsA)
    expect(textA).toContain(TKN_A)
    expect(textA).not.toContain(TKN_WORLD)
    expect(textA).not.toContain(TKN_B)
  })

  it('★命门：角色 B 的 recallSections 只含自己池 token，绝不含世界池/A 池 token', () => {
    const pools = buildIsolatedPools()
    const sectionsB = renderCharacterPoolRecallSections(getCharacterPoolCards(pools, 'char_B'))
    const textB = JSON.stringify(sectionsB)
    expect(textB).toContain(TKN_B)
    expect(textB).not.toContain(TKN_WORLD)
    expect(textB).not.toContain(TKN_A)
  })

  it('渲染进 general 段（【本轮相关资料】块·标题 + 正文），正文优先 bodyText', () => {
    const sections = renderCharacterPoolRecallSections([
      { id: 'a1', title: '记忆卡', bodyText: '正文优先', summary: '摘要兜底', origin: 'character_brain', ownerCharacterId: 'char_A' }
    ])
    expect(sections).not.toBeNull()
    expect(sections.general).toContain('【本轮相关资料】')
    expect(sections.general).toContain('## 记忆卡')
    expect(sections.general).toContain('正文优先')
    expect(sections.general).not.toContain('摘要兜底')
  })

  it('无 bodyText 时回退 summary', () => {
    const sections = renderCharacterPoolRecallSections([
      { id: 'a1', title: '记忆卡', summary: '只有摘要', origin: 'character_brain', ownerCharacterId: 'char_A' }
    ])
    expect(sections.general).toContain('只有摘要')
  })

  it('空卡 / 全无内容卡 → 返回 null（调用方据此不注入，零回归）', () => {
    expect(renderCharacterPoolRecallSections([])).toBeNull()
    expect(renderCharacterPoolRecallSections(null)).toBeNull()
    expect(renderCharacterPoolRecallSections([{ id: 'x', title: '', origin: 'character_brain' }])).toBeNull()
  })

  it('角色无池（getCharacterPoolCards 命中空）→ null', () => {
    const pools = buildIsolatedPools()
    expect(renderCharacterPoolRecallSections(getCharacterPoolCards(pools, 'char_NONE'))).toBeNull()
  })
})

describe('recallRoundPoolInject — 旁白侧注入（worldPoolCardsToNarrationEvidence）', () => {
  it('★命门：旁白证据含世界池 token，绝不含任一角色私有 token', () => {
    const pools = buildIsolatedPools()
    const evidence = worldPoolCardsToNarrationEvidence(getWorldPoolCards(pools))
    const text = JSON.stringify(evidence)
    expect(text).toContain(TKN_WORLD)
    expect(text).not.toContain(TKN_A)
    expect(text).not.toContain(TKN_B)
  })

  it('映射成 NarrativeRecallEvidence（documentId/title/summary/excerpt/score/世界本源类型）', () => {
    const evidence = worldPoolCardsToNarrationEvidence([
      { id: 'w1', title: '镜庭主城', summary: '主城摘要', bodyText: '主城正文', origin: 'doc_library', score: 0.87 }
    ])
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      documentId: 'w1',
      title: '镜庭主城',
      documentType: '世界本源知识',
      summary: '主城摘要',
      excerpt: '主城正文',
      score: 0.87,
      readDecision: 'summary_only'
    })
  })

  it('无 id 卡过滤；空池 → []', () => {
    expect(worldPoolCardsToNarrationEvidence([])).toEqual([])
    expect(worldPoolCardsToNarrationEvidence(null)).toEqual([])
    expect(worldPoolCardsToNarrationEvidence([{ id: '', title: '无 id', origin: 'doc_library' }])).toEqual([])
  })

  it('缺 score → 0；title 缺省回退 documentId', () => {
    const evidence = worldPoolCardsToNarrationEvidence([{ id: 'w9', title: '', origin: 'doc_library' }])
    expect(evidence[0].score).toBe(0)
    expect(evidence[0].title).toBe('w9')
  })
})
