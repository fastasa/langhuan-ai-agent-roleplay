/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import RoundRecallPoolPanel from '../../../src/components/app/chat/RoundRecallPoolPanel.vue'
import { createLocalRecallRoundPoolCache, resetRecallRoundPoolCacheForTest } from '../../../src/app/recallRoundPoolCache.ts'
import { createEmptyRoundRecallPools, setCharacterPool } from '../../../src/app/recallRoundPool.ts'
// 面板 i18n 化（出海线）后 mount 必须装真 i18n 实例，否则 useI18n 抛「Need to install with app.use」；
// jsdom 浏览器语言是 en → 显式钉回 zh，让下方中文文案断言吃真 zh locale。
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

// Teleport 在测试里 stub 成 inline，便于 find 渲染内容。
const mountPanel = (pools, resolveName) => mount(RoundRecallPoolPanel, {
  props: { pools, resolveName },
  global: { plugins: [i18n], stubs: { teleport: true } }
})

function poolsOf({ characterPools = {}, worldCards = [] } = {}) {
  return {
    sessionId: 's1',
    roundAnchorId: '10',
    characterPools,
    worldPool: { cards: worldCards, recalledAt: '2026-06-23' }
  }
}

describe('RoundRecallPoolPanel（批次4·C 本轮资料池侧栏）', () => {
  it('有格式卡：折叠显标题+摘要、不显正文；展开显正文', async () => {
    const pools = poolsOf({
      characterPools: {
        char_1: { recalledAt: '2026-06-23', cards: [{ id: 'c1', title: '望舒台往事', summary: '星依小时候的台子', bodyText: '正文：那年夏天望舒台上……', origin: 'character_brain', ownerCharacterId: 'char_1' }] }
      }
    })
    const wrapper = mountPanel(pools, (id) => (id === 'char_1' ? '星依' : id))
    // 角色名经 resolveName
    expect(wrapper.text()).toContain('星依')
    // 折叠态：标题 + 摘要可见，正文不可见
    expect(wrapper.find('.rrp-card-title').text()).toBe('望舒台往事')
    expect(wrapper.find('.rrp-card-summary').text()).toContain('星依小时候的台子')
    expect(wrapper.find('.rrp-card-body').exists()).toBe(false)
    // 展开 → 正文出现、折叠摘要让位
    await wrapper.find('.rrp-card-head').trigger('click')
    expect(wrapper.find('.rrp-card-body').text()).toContain('那年夏天望舒台上')
  })

  it('无格式卡：取正文前 30 字当标题（超长加省略号），展开显全文', async () => {
    const longBody = '甲'.repeat(80)
    const pools = poolsOf({
      characterPools: { char_1: { recalledAt: 'x', cards: [{ id: 'c2', title: '', bodyText: longBody, origin: 'character_brain', ownerCharacterId: 'char_1' }] } }
    })
    const wrapper = mountPanel(pools, (id) => id)
    const title = wrapper.find('.rrp-card-title').text()
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThan(longBody.length)
    // 无标题卡折叠态不显单独摘要行（标题本身即内容预览）
    expect(wrapper.find('.rrp-card-summary').exists()).toBe(false)
    // 展开 → 全文
    await wrapper.find('.rrp-card-head').trigger('click')
    expect(wrapper.find('.rrp-card-body').text()).toBe(longBody)
  })

  it('世界知识池单列、标「仅供旁白」', () => {
    const pools = poolsOf({ worldCards: [{ id: 'w1', title: '镜庭主城', summary: '世界本源', bodyText: '主城正文', origin: 'doc_library' }] })
    const wrapper = mountPanel(pools)
    expect(wrapper.text()).toContain('世界知识')
    expect(wrapper.find('.rrp-group-tag').text()).toContain('仅供旁白')
  })

  it('正文与折叠摘要相同（仅标题+摘要无正文）：不可展开、不挂展开箭头', () => {
    const pools = poolsOf({
      characterPools: { char_1: { recalledAt: 'x', cards: [{ id: 'c3', title: '只有摘要', summary: '没有正文', origin: 'character_brain', ownerCharacterId: 'char_1' }] } }
    })
    const wrapper = mountPanel(pools, (id) => id)
    expect(wrapper.find('.rrp-card-title').text()).toBe('只有摘要')
    expect(wrapper.find('.rrp-card-summary').text()).toContain('没有正文')
    // 无正文 → 不可展开（无展开箭头，有静态点）
    expect(wrapper.find('.rrp-card-chev').exists()).toBe(false)
    expect(wrapper.find('.rrp-card-dot').exists()).toBe(true)
  })

  it('空池/null：显示空态', () => {
    expect(mountPanel(null).find('.rrp-empty-all').exists()).toBe(true)
    expect(mountPanel(poolsOf()).find('.rrp-empty-all').exists()).toBe(true)
  })

  it('点关闭/点遮罩上抛 close', async () => {
    const wrapper = mountPanel(poolsOf({ worldCards: [{ id: 'w1', title: 'x', summary: 'y', origin: 'doc_library' }] }))
    await wrapper.find('.rrp-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.find('.rrp-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  describe('用户增删（对话级·直连共享缓存）', () => {
    beforeEach(() => {
      window.localStorage.clear()
      resetRecallRoundPoolCacheForTest()
    })

    it('点删除按钮：调缓存 removeCard，从对话池移除该卡', async () => {
      const cache = createLocalRecallRoundPoolCache()
      cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '10'), 'char_1', [{ id: 'c1', title: '卡1', bodyText: '正文', origin: 'character_brain', ownerCharacterId: 'char_1' }]))
      const wrapper = mountPanel(cache.load('s1'), (id) => id)
      expect(wrapper.find('.rrp-card-del').exists()).toBe(true)
      await wrapper.find('.rrp-card-del').trigger('click')
      expect(cache.load('s1').characterPools.char_1.cards.map((c) => c.id)).toEqual([])
    })

    it('加自定义卡：填正文+确认 → 调缓存 addCard 入世界池', async () => {
      const cache = createLocalRecallRoundPoolCache()
      cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '10'), 'char_1', [{ id: 'c1', title: '卡1', bodyText: '正文', origin: 'character_brain', ownerCharacterId: 'char_1' }]))
      const wrapper = mountPanel(cache.load('s1'), (id) => id)
      await wrapper.find('.rrp-add-toggle').trigger('click')
      await wrapper.find('.rrp-add-select').setValue('world')
      await wrapper.find('.rrp-add-textarea').setValue('用户手加的世界资料')
      await wrapper.find('.rrp-add-confirm').trigger('click')
      const world = cache.load('s1').worldPool.cards
      expect(world.some((c) => c.bodyText === '用户手加的世界资料')).toBe(true)
    })

    // 入口常驻（2026-07-03）：pools=null（会话还没有池）时靠 sessionId prop 兜底，仍能加第一张卡（addCard 自建会话池）。
    it('空池（pools=null）+ sessionId 兜底：可给会话成员加第一张卡，真落缓存', async () => {
      const cache = createLocalRecallRoundPoolCache()
      const wrapper = mount(RoundRecallPoolPanel, {
        props: { pools: null, sessionId: 's_new', castCharacterIds: ['char_1'], resolveName: (id) => (id === 'char_1' ? '星依' : id) },
        global: { plugins: [i18n], stubs: { teleport: true } }
      })
      expect(wrapper.find('.rrp-empty-all').exists()).toBe(true)
      await wrapper.find('.rrp-add-toggle').trigger('click')
      await wrapper.find('.rrp-add-select').setValue('char:char_1')
      await wrapper.find('.rrp-add-textarea').setValue('手动喂给星依的第一张卡')
      await wrapper.find('.rrp-add-confirm').trigger('click')
      const cards = cache.load('s_new').characterPools.char_1.cards
      expect(cards.some((c) => c.bodyText === '手动喂给星依的第一张卡')).toBe(true)
    })

    it('加卡归属选项 = 会话成员 ∪ 已有池角色（去重）+ 世界池', async () => {
      const cache = createLocalRecallRoundPoolCache()
      cache.save(setCharacterPool(createEmptyRoundRecallPools('s1', '10'), 'char_1', [{ id: 'c1', title: '卡1', bodyText: '正文', origin: 'character_brain', ownerCharacterId: 'char_1' }]))
      const wrapper = mount(RoundRecallPoolPanel, {
        props: { pools: cache.load('s1'), castCharacterIds: ['char_1', 'char_2'], resolveName: (id) => ({ char_1: '星依', char_2: '小樱' }[id] || id) },
        global: { plugins: [i18n], stubs: { teleport: true } }
      })
      await wrapper.find('.rrp-add-toggle').trigger('click')
      const options = wrapper.findAll('.rrp-add-select option').map((o) => o.text())
      // char_1 同时在成员与已有池里 → 只出现一次；char_2 无池也可选；世界池殿后
      expect(options.filter((t) => t.includes('星依'))).toHaveLength(1)
      expect(options.some((t) => t.includes('小樱'))).toBe(true)
      expect(options.some((t) => t.includes('世界知识'))).toBe(true)
    })
  })

  // 2026-07-10 双形态：inline（挤压侧栏内容）不 Teleport、不遮罩——内容留在原地由 AppChatSection aside 壳承载。
  it('variant=inline：不 Teleport（不 stub 也能原地找到面板）且挂 --inline 类', () => {
    const wrapper = mount(RoundRecallPoolPanel, {
      props: { pools: null, sessionId: 's_inline', variant: 'inline' },
      global: { plugins: [i18n] }
    })
    expect(wrapper.find('.rrp').exists()).toBe(true)
    expect(wrapper.find('.rrp-overlay--inline').exists()).toBe(true)
  })
})
