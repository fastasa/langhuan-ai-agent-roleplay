import { describe, expect, it } from 'vitest'
import { fillCharacterPoolCards, fillWorldPoolCards, retrievalHitsToWorldPoolCards } from '../../../src/app/recallRoundPoolFill.ts'

// 全相同单位向量：scoreCardsByEmbedding 里 query 与每张卡都 [1,0,0]→余弦恒 1，分数全相等，
// topK 取稳定排序前 K——结构性断言（origin/owner/topK/空）不依赖相关度排序，足够。
const flatEmbed = async (input) => input.map(() => [1, 0, 0])

function createCharacterWithSoul(overrides = {}) {
  return {
    id: 'char_1',
    name: '星依',
    brainCognitionNodes: [{
      id: 'brain:cognition:node:secret',
      title: '星依的秘密',
      summary: '只有星依自己知道的私密往事',
      parentId: 'brain:cognition',
      kind: 'private',
      compilePage: {
        summary: '星依的私密往事编译摘要',
        tags: ['私密'],
        relationHints: [],
        updatedAt: '2026-06-20T00:00:00.000Z'
      },
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z'
    }],
    brain_cognition_nodes: '[]',
    brainCandidateChanges: [],
    brain_candidate_changes: '[]',
    ...overrides
  }
}

const observableOther = [{
  id: 'char_2',
  name: '小樱',
  appearance: '金色长发、校服',
  subjectType: 'character',
  inScene: true
}]

const worldDoc = {
  documentId: 'doc_capital',
  id: 'doc_capital',
  stableId: 'doc_capital',
  title: '镜庭主城',
  displayPath: '/镜庭雨城/镜庭地点/镜庭主城.md',
  documentType: 'worldview_place',
  kind: 'worldview_place',
  summary: '世界本源·主城背景',
  tags: ['王城'],
  content: '主城的正文世界设定',
  publicCompilePage: {
    summary: '主城公共编译摘要',
    tags: ['王城'],
    relationHints: [],
    sourceState: 'manual_confirmed',
    updatedAt: '2026-04-15T00:00:00.000Z'
  },
  sourceDocumentIds: [],
  relatedNeuronIds: [],
  versionState: 'confirmed',
  createdAt: '2026-04-15T00:00:00.000Z',
  updatedAt: '2026-04-15T00:00:00.000Z'
}

describe('recallRoundPoolFill · 填池纯逻辑（批次3·3b-1·A1 轻量预召回）', () => {
  it('★决策②最强隔离：角色池只含 character_brain/public，绝无 doc_library 卡', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      observableProfiles: observableOther,
      query: '星依和小樱',
      embedTexts: flatEmbed
    })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.origin === 'character_brain' || c.origin === 'public')).toBe(true)
    expect(cards.some((c) => c.origin === 'doc_library')).toBe(false)
  })

  it('角色池每张卡 ownerCharacterId = 池归属角色（与容器一致）', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      observableProfiles: observableOther,
      query: '往事',
      embedTexts: flatEmbed
    })
    expect(cards.every((c) => c.ownerCharacterId === 'char_1')).toBe(true)
  })

  it('外貌例外入角色池且 origin=public（他者可观察外貌）', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      observableProfiles: observableOther,
      query: '小樱长什么样',
      embedTexts: flatEmbed,
      topK: 20
    })
    expect(cards.some((c) => c.origin === 'public')).toBe(true)
  })

  it('无 observableProfiles 时角色池只有私有大脑（无 public 卡）', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      query: '往事',
      embedTexts: flatEmbed,
      topK: 20
    })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((c) => c.origin === 'public')).toBe(false)
    expect(cards.every((c) => c.origin === 'character_brain')).toBe(true)
  })

  it('topK 截断：返回不超过 topK 张', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      observableProfiles: observableOther,
      query: '全部',
      embedTexts: flatEmbed,
      topK: 1
    })
    expect(cards.length).toBe(1)
  })

  it('空 query 返回空池（不重复预召回的标记由调用方据 recalledAt 控制）', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      query: '   ',
      embedTexts: flatEmbed
    })
    expect(cards).toEqual([])
  })

  it('无 embedTexts 返回空池（打分不可用不报错）', async () => {
    const cards = await fillCharacterPoolCards({
      character: createCharacterWithSoul(),
      ownerCharacterId: 'char_1',
      query: '往事'
    })
    expect(cards).toEqual([])
  })

  it('★世界池全 doc_library、无 ownerCharacterId', async () => {
    const cards = await fillWorldPoolCards({
      documents: [worldDoc],
      query: '主城',
      embedTexts: flatEmbed
    })
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.origin === 'doc_library')).toBe(true)
    expect(cards.some((c) => c.ownerCharacterId)).toBe(false)
  })

  it('世界池：空文档库返回空', async () => {
    const cards = await fillWorldPoolCards({ documents: [], query: '主城', embedTexts: flatEmbed })
    expect(cards).toEqual([])
  })

  it('世界池 topK 截断', async () => {
    const cards = await fillWorldPoolCards({
      documents: [worldDoc],
      query: '主城',
      embedTexts: flatEmbed,
      topK: 0
    })
    expect(cards).toEqual([])
  })

  // 3d 追加召回·世界命中映射：提调三件套（docLibraryOnly）命中 → 世界池卡（全 doc_library·无 owner）。
  describe('retrievalHitsToWorldPoolCards（3d 世界池追加映射）', () => {
    it('★命中全映射成 doc_library 卡、无 ownerCharacterId', () => {
      const cards = retrievalHitsToWorldPoolCards([
        { unitId: 'u1', title: '主城', summary: '主城摘要', score: 0.9 },
        { unitId: 'u2', title: '密林', body: '密林正文', score: 0.5 }
      ])
      expect(cards.length).toBe(2)
      expect(cards.every((c) => c.origin === 'doc_library')).toBe(true)
      expect(cards.some((c) => c.ownerCharacterId)).toBe(false)
    })

    it('summary 落 summary、body 落 bodyText、score 透传', () => {
      const [a, b] = retrievalHitsToWorldPoolCards([
        { unitId: 'u1', title: '主城', summary: '主城摘要', score: 0.9 },
        { unitId: 'u2', title: '密林', body: '密林正文' }
      ])
      expect(a.summary).toBe('主城摘要')
      expect(a.bodyText).toBeUndefined()
      expect(a.score).toBe(0.9)
      expect(b.bodyText).toBe('密林正文')
      expect(b.summary).toBeUndefined()
      expect(b.score).toBe(0) // 缺省 score → 0
    })

    it('无 unitId 的命中丢弃；空/非数组安全', () => {
      expect(retrievalHitsToWorldPoolCards([{ unitId: '  ', title: 'x' }])).toEqual([])
      expect(retrievalHitsToWorldPoolCards([])).toEqual([])
      expect(retrievalHitsToWorldPoolCards(null)).toEqual([])
    })
  })
})
