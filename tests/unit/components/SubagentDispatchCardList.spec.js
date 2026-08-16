/**
 * @vitest-environment jsdom
 */
// 子agent派遣运行卡共享展示组件回归（地图严谨协作与运行卡计划批1·2026-07-11·从 TidiaoDirectorStreamBand.vue 抽出）。
// 覆盖：零业务逻辑（喂 sources 就渲染）、includeSettled 门、sticky 堆叠序号、展开/收起、resetKey 清空、
// 跨 sessionId 不撞键（星依浮坞可能同时对多个目标会话各挂一张卡）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SubagentDispatchCardList from '../../../src/components/app/chat/SubagentDispatchCardList.vue'
import {
  appendSubagentRunTimeline,
  beginSubagentRun,
  endSubagentRun,
  resetSubagentRunStatusForTest,
  settleSubagentRunTimelineTool
} from '../../../src/app/subagentRunStatus'

function huiyuSource(sessionId) {
  return {
    sessionId,
    meta: {
      prefix: 'huiyu',
      label: '绘舆',
      icon: 'map',
      runningVerb: '绘图中',
      fallbackTitle: '更新舆图',
      extractTitle: (input) => {
        const match = String(input || '').match(/^【作图任务】(.*)$/m)
        return match ? match[1].trim() : ''
      }
    }
  }
}

describe('SubagentDispatchCardList', () => {
  it('sources 为空/查无状态：不渲染任何卡', () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, { props: { sources: [], includeSettled: true } })
    expect(wrapper.findAll('.tds-script-card')).toHaveLength(0)
    resetSubagentRunStatusForTest()
  })

  it('当前会话自动模式：直接读取 runner 登记的 presentation，工作区宿主无需手写人格专用 source', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: {
        sessionId: 'jianxin-session',
        includeSettled: true,
        dispatcherLabel: '鉴心'
      }
    })
    beginSubagentRun('jianxin-session', 'personality-question-author:task-1', {
      input: '【后台制卷任务】塞西莉亚',
      presentation: {
        label: '设问',
        icon: 'list-checks',
        runningVerb: '制卷中',
        title: '塞西莉亚人格问卷'
      }
    })
    beginSubagentRun('other-session', 'personality-question-author:task-2', {
      presentation: {
        label: '设问',
        icon: 'list-checks',
        runningVerb: '制卷中',
        title: '不该串入'
      }
    })
    await nextTick()

    const card = wrapper.get('.tds-script-card')
    expect(card.text()).toContain('设问')
    expect(card.text()).toContain('塞西莉亚人格问卷')
    expect(card.text()).toContain('制卷中')
    expect(wrapper.text()).not.toContain('不该串入')
    await card.get('.tds-script-head').trigger('click')
    expect(wrapper.text()).toContain('鉴心 → 设问')
    expect(wrapper.text()).toContain('设问 → 鉴心')
    resetSubagentRunStatusForTest()
  })

  it('running 卡：显示 label/任务小标题/动词+秒表，默认 sticky top=0；结束后按 includeSettled 门决定是否留存', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('s1')], includeSettled: false }
    })
    beginSubagentRun('s1', 'huiyu:1', { input: '【作图任务】一行人抵达临澜城\n\n【任务书】…' })
    await nextTick()
    const card = wrapper.find('.tds-script-card')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('tds-script-card--running')
    expect(card.text()).toContain('绘舆')
    expect(card.text()).toContain('一行人抵达临澜城')
    expect(card.text()).toContain('绘图中')
    expect(card.attributes('style')).toContain('top: 0px')

    endSubagentRun('s1', 'huiyu:1', { ok: true, summary: 'x', output: '已画好' })
    await nextTick()
    // includeSettled=false（同 band 的 liveRound 门缺省态）：done 卡不留存
    expect(wrapper.find('.tds-script-card').exists()).toBe(false)
    resetSubagentRunStatusForTest()
  })

  it('includeSettled=true：done 卡持久显示✓（无「已交稿」文字·勾图标已表意）+ 耗时 + token(k 位)；error 卡显示「失败」+ 原因', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('s2')], includeSettled: true }
    })
    beginSubagentRun('s2', 'huiyu:1')
    endSubagentRun('s2', 'huiyu:1', {
      ok: true,
      output: '画好了',
      usage: { promptTokens: 1000, completionTokens: 200, cacheReadTokens: 500 }
    })
    await nextTick()
    const card = wrapper.find('.tds-script-card')
    expect(card.classes()).toContain('tds-script-card--done')
    expect(card.text()).not.toContain('已交稿')
    expect(card.text()).toContain('1.2k tokens')
    // 无内联 sticky（非 running）
    expect(card.attributes('style')).toBeUndefined()

    beginSubagentRun('s2', 'huiyu:2')
    endSubagentRun('s2', 'huiyu:2', { ok: false, error: '会话未挂世界' })
    await nextTick()
    // 2026-07-12 折叠分组：2 张已结束卡合并成小结行（默认收起），点开后逐条可见
    expect(wrapper.findAll('.tds-script-card')).toHaveLength(0)
    const groupHead = wrapper.find('.tds-script-group-head')
    expect(groupHead.exists()).toBe(true)
    expect(groupHead.text()).toContain('已结束 2')
    await groupHead.trigger('click')
    const cards = wrapper.findAll('.tds-script-card')
    expect(cards).toHaveLength(2)
    const failed = cards.find((c) => c.classes().includes('tds-script-card--error'))
    expect(failed.text()).toContain('失败')
    resetSubagentRunStatusForTest()
  })

  it('点击展开：显示「{dispatcherLabel} → 绘舆」入侧任务书 与 「绘舆 → {dispatcherLabel}」出侧回执；再点收起', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('s3')], includeSettled: true, dispatcherLabel: '星依' }
    })
    beginSubagentRun('s3', 'huiyu:1', { input: '【作图任务】新增码头' })
    endSubagentRun('s3', 'huiyu:1', { ok: true, output: '已交稿摘要' })
    await nextTick()
    expect(wrapper.find('.tds-script-body').exists()).toBe(false)
    await wrapper.find('.tds-script-head').trigger('click')
    expect(wrapper.find('.tds-script-body').exists()).toBe(true)
    expect(wrapper.text()).toContain('星依 → 绘舆')
    expect(wrapper.text()).toContain('绘舆 → 星依')
    expect(wrapper.text()).toContain('已交稿摘要')
    await wrapper.find('.tds-script-head').trigger('click')
    expect(wrapper.find('.tds-script-body').exists()).toBe(false)
    resetSubagentRunStatusForTest()
  })

  it('resetKey 变化：清空已展开的卡（band 切轮复位收起同语义）', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('s4')], includeSettled: true, resetKey: 'round_a' }
    })
    beginSubagentRun('s4', 'huiyu:1')
    endSubagentRun('s4', 'huiyu:1', { ok: true, output: 'x' })
    await nextTick()
    await wrapper.find('.tds-script-head').trigger('click')
    expect(wrapper.find('.tds-script-body').exists()).toBe(true)
    await wrapper.setProps({ resetKey: 'round_b' })
    expect(wrapper.find('.tds-script-body').exists()).toBe(false)
    resetSubagentRunStatusForTest()
  })

  it('多个 sessionId 的 source 不撞键（星依浮坞跨会话场景）：各会话各出一张卡', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('sess_a'), huiyuSource('sess_b')], includeSettled: true }
    })
    beginSubagentRun('sess_a', 'huiyu:1', { input: '【作图任务】A 会话画图' })
    beginSubagentRun('sess_b', 'huiyu:1', { input: '【作图任务】B 会话画图' })
    await nextTick()
    const cards = wrapper.findAll('.tds-script-card')
    expect(cards).toHaveLength(2)
    const titles = cards.map((c) => c.text())
    expect(titles.some((t) => t.includes('A 会话画图'))).toBe(true)
    expect(titles.some((t) => t.includes('B 会话画图'))).toBe(true)
    resetSubagentRunStatusForTest()
  })

  it('stickyOrderStart：running 卡的堆叠序号从传入值起算（band 编剧卡占 0 号位时传 1）', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('s5')], includeSettled: false, stickyOrderStart: 1 }
    })
    beginSubagentRun('s5', 'huiyu:1')
    await nextTick()
    expect(wrapper.find('.tds-script-card').attributes('style')).toContain('top: 38px')
    resetSubagentRunStatusForTest()
  })

  // ---------- 已结束卡折叠分组（2026-07-12） ----------

  it('已结束卡 ≥2 张：默认折叠成小结行（计数含失败），点开后逐条可见且单卡展开仍工作', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('g1')], includeSettled: true }
    })
    beginSubagentRun('g1', 'huiyu:1', { input: '【作图任务】画城一' })
    endSubagentRun('g1', 'huiyu:1', { ok: true, output: '成一' })
    beginSubagentRun('g1', 'huiyu:2', { input: '【作图任务】画城二' })
    endSubagentRun('g1', 'huiyu:2', { ok: true, output: '成二' })
    beginSubagentRun('g1', 'huiyu:3', { input: '【作图任务】画城三' })
    endSubagentRun('g1', 'huiyu:3', { ok: false, error: '会话未挂世界' })
    await nextTick()
    // 默认收起：只有小结行，没有逐条卡
    expect(wrapper.findAll('.tds-script-card')).toHaveLength(0)
    const head = wrapper.find('.tds-script-group-head')
    expect(head.exists()).toBe(true)
    expect(head.text()).toContain('已结束 3')
    expect(head.find('.tds-script-group-done').text()).toContain('交稿 2')
    expect(head.find('.tds-script-group-error').text()).toContain('失败 1')
    // 点开后逐条可见
    await head.trigger('click')
    const cards = wrapper.findAll('.tds-script-card')
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.text()).join('|')).toContain('画城二')
    // 单卡展开仍工作（openKeys 逻辑不变）
    await cards[0].find('.tds-script-head').trigger('click')
    expect(wrapper.find('.tds-script-body').exists()).toBe(true)
    // 再点小结行收起：逐条卡全部收走
    await wrapper.find('.tds-script-group-head').trigger('click')
    expect(wrapper.findAll('.tds-script-card')).toHaveLength(0)
    resetSubagentRunStatusForTest()
  })

  it('已结束卡全部成功：小结行写「已结束 N · 全部交稿」', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('g2')], includeSettled: true }
    })
    beginSubagentRun('g2', 'huiyu:1')
    endSubagentRun('g2', 'huiyu:1', { ok: true, output: 'a' })
    beginSubagentRun('g2', 'huiyu:2')
    endSubagentRun('g2', 'huiyu:2', { ok: true, output: 'b' })
    await nextTick()
    const head = wrapper.find('.tds-script-group-head')
    expect(head.text()).toContain('已结束 2')
    expect(head.find('.tds-script-group-done').text()).toContain('全部交稿')
    expect(head.find('.tds-script-group-error').exists()).toBe(false)
    resetSubagentRunStatusForTest()
  })

  it('只有 1 张已结束卡：不折叠，照旧直接显示，无小结行', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('g3')], includeSettled: true }
    })
    beginSubagentRun('g3', 'huiyu:1')
    endSubagentRun('g3', 'huiyu:1', { ok: true, output: 'x' })
    await nextTick()
    expect(wrapper.find('.tds-script-group-head').exists()).toBe(false)
    expect(wrapper.findAll('.tds-script-card')).toHaveLength(1)
    resetSubagentRunStatusForTest()
  })

  // ---------- 工作流时间线（批G·2026-07-12） ----------

  it('展开态渲染「工作流」段：轮次分隔+工具行实时增长、状态落定、结束后保留；空 timeline 不渲染该段', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('w1')], includeSettled: true }
    })
    beginSubagentRun('w1', 'huiyu:1', { input: '【作图任务】画临澜城' })
    await nextTick()
    await wrapper.find('.tds-script-head').trigger('click')
    // 空 timeline：不渲染工作流段
    expect(wrapper.text()).not.toContain('工作流')
    // 流水追加后实时出现（reactive 直读 subagentRunStatus 真值）
    appendSubagentRunTimeline('w1', 'huiyu:1', { kind: 'turn', label: '第 1 轮' })
    appendSubagentRunTimeline('w1', 'huiyu:1', { kind: 'tool', label: 'mapDraw', detail: '画临澜城' })
    await nextTick()
    expect(wrapper.text()).toContain('工作流')
    expect(wrapper.find('.tds-timeline-turn').text()).toBe('第 1 轮')
    const tool = wrapper.find('.tds-tool')
    expect(tool.text()).toContain('mapDraw')
    expect(tool.text()).toContain('画临澜城')
    // running 中未定态 → 菊花
    expect(tool.find('.tds-tool-spin').exists()).toBe(true)
    // 落定 success → done 状态色 + 耗时轻字（批I·未落定时不显示）
    expect(wrapper.find('.tds-timeline-dur').exists()).toBe(false)
    settleSubagentRunTimelineTool('w1', 'huiyu:1', 'mapDraw', 'success')
    await nextTick()
    expect(wrapper.find('.tds-tool').classes()).toContain('tds-tool--done')
    expect(wrapper.find('.tds-tool-spin').exists()).toBe(false)
    expect(wrapper.find('.tds-tool .tds-timeline-dur').exists()).toBe(true)
    // 结束后保留回看（卡还开着，工作流段不消失）；end 回填末轮时长 → 轮行也带耗时
    endSubagentRun('w1', 'huiyu:1', { ok: true, output: 'x' })
    await nextTick()
    expect(wrapper.find('.tds-timeline-turn').exists()).toBe(true)
    expect(wrapper.find('.tds-timeline-turn .tds-timeline-dur').exists()).toBe(true)
    resetSubagentRunStatusForTest()
  })

  // ---------- 展开态标题换行（批I·真机纵排 bug 修复） ----------
  // jsdom 不做布局/不注入 scoped 样式，flex-wrap 的真实表现无法在单测断言——这里做「联动副本同构卫兵」：
  // 两份 scoped 副本必须都带展开态换行规则（防止只改一处漂移）。真实布局验收=手动步骤见批I收尾报告。

  it('展开态换行规则在两份联动副本中同构（SubagentDispatchCardList ↔ TidiaoDirectorStreamBand）', () => {
    const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')
    const cardList = read('src/components/app/chat/SubagentDispatchCardList.vue')
    const band = read('src/components/app/chat/TidiaoDirectorStreamBand.vue')
    for (const source of [cardList, band]) {
      // 展开态 head 允许换行（收起态规则不含 flex-wrap）
      expect(source).toContain('.tds-script-card.is-open .tds-script-head { align-items: flex-start; flex-wrap: wrap; }')
      // 展开态 name-sub 独占整行（order 沉底防状态字/toggle 被挤去第三行）
      expect(source).toContain('flex: 1 1 100%; order: 10; min-width: 0;')
    }
  })

  // ---------- token 用量文案（2026-07-16 窄容器防溢出：k 位折算 + 缓存命中率整体下线省宽度） ----------

  it('done 卡 token 总量 ≥1000 时折算 k 位（一位小数），即便带缓存数据也不再显示缓存百分比', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('c1')], includeSettled: true }
    })
    beginSubagentRun('c1', 'huiyu:1')
    endSubagentRun('c1', 'huiyu:1', {
      ok: true,
      output: '画好了',
      usage: { promptTokens: 15639, completionTokens: 2939, cacheReadTokens: 12000 }
    })
    await nextTick()
    const card = wrapper.find('.tds-script-card')
    expect(card.text()).toContain('18.6k tokens')
    expect(card.text()).not.toContain('缓存')
    resetSubagentRunStatusForTest()
  })

  it('done 卡 token 总量 <1000 时显示原始整数，不折算 k 位', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('c2')], includeSettled: true }
    })
    beginSubagentRun('c2', 'huiyu:1')
    endSubagentRun('c2', 'huiyu:1', { ok: true, output: 'x', usage: { promptTokens: 500, completionTokens: 200 } })
    await nextTick()
    const card = wrapper.find('.tds-script-card')
    expect(card.text()).toContain('700 tokens')
    expect(card.text()).not.toContain('缓存')
    resetSubagentRunStatusForTest()
  })

  it('running 卡、error 卡（即便带缓存数据）均不显示缓存段', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('c3')], includeSettled: true }
    })
    beginSubagentRun('c3', 'huiyu:1')
    endSubagentRun('c3', 'huiyu:1', {
      ok: false,
      error: '上游超时',
      usage: { promptTokens: 1000, completionTokens: 200, cacheReadTokens: 500 }
    })
    beginSubagentRun('c3', 'huiyu:2', { input: '【作图任务】进行中的图' })
    await nextTick()
    // 1 error + 1 running（已结束仅 1 张不折叠）：error 卡 token 段照显（k 位）、缓存段不显；running 卡两者都无
    const cards = wrapper.findAll('.tds-script-card')
    expect(cards).toHaveLength(2)
    const failed = cards.find((c) => c.classes().includes('tds-script-card--error'))
    expect(failed.text()).toContain('1.2k tokens')
    expect(wrapper.text()).not.toContain('缓存')
    resetSubagentRunStatusForTest()
  })

  it('running 卡永远不进折叠组：小结行收起时 running 仍逐条显示在前', async () => {
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('g4')], includeSettled: true }
    })
    beginSubagentRun('g4', 'huiyu:1')
    endSubagentRun('g4', 'huiyu:1', { ok: true, output: 'x' })
    beginSubagentRun('g4', 'huiyu:2')
    endSubagentRun('g4', 'huiyu:2', { ok: false, error: 'y' })
    beginSubagentRun('g4', 'huiyu:3', { input: '【作图任务】进行中的图' })
    await nextTick()
    // 收起态：running 卡逐条恒显，已结束的进小结
    const collapsed = wrapper.findAll('.tds-script-card')
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].classes()).toContain('tds-script-card--running')
    expect(collapsed[0].text()).toContain('进行中的图')
    expect(wrapper.find('.tds-script-group-head').text()).toContain('已结束 2')
    // 点开后 3 张全可见，running 在最前（排序保持现有顺序：active 先、已结束原序在后）
    await wrapper.find('.tds-script-group-head').trigger('click')
    const cards = wrapper.findAll('.tds-script-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].classes()).toContain('tds-script-card--running')
    resetSubagentRunStatusForTest()
  })

  // ---------- 已结束卡按完成时刻排序（2026-07-12 真机 bug 修复） ----------

  it('已结束卡按 endedAt 升序（而非开始顺序）：开始得早但跑得久的卡不再插在中间，垫底显示', async () => {
    vi.useFakeTimers()
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('order1')], includeSettled: true }
    })
    // 开始顺序 1→2→3；完成顺序 1→3→2（2 号跑得最久，最后交稿）
    beginSubagentRun('order1', 'huiyu:1', { input: '【作图任务】画城一' })
    vi.advanceTimersByTime(100)
    beginSubagentRun('order1', 'huiyu:2', { input: '【作图任务】画城二' })
    vi.advanceTimersByTime(100)
    beginSubagentRun('order1', 'huiyu:3', { input: '【作图任务】画城三' })
    vi.advanceTimersByTime(100)
    endSubagentRun('order1', 'huiyu:1', { ok: true, output: '成一' })
    vi.advanceTimersByTime(100)
    endSubagentRun('order1', 'huiyu:3', { ok: true, output: '成三' })
    vi.advanceTimersByTime(100)
    endSubagentRun('order1', 'huiyu:2', { ok: true, output: '成二' })
    await nextTick()
    await wrapper.find('.tds-script-group-head').trigger('click')
    const titles = wrapper.findAll('.tds-script-card').map((c) => c.text())
    // 按完成时刻升序：一(最早完成) → 三(第二完成) → 二(最新完成·必须垫底，不能插中间)
    expect(titles[0]).toContain('画城一')
    expect(titles[1]).toContain('画城三')
    expect(titles[2]).toContain('画城二')
    resetSubagentRunStatusForTest()
    vi.useRealTimers()
  })

  it('运行中卡排序不受影响：仍按开始时刻先后显示', async () => {
    vi.useFakeTimers()
    resetSubagentRunStatusForTest()
    const wrapper = mount(SubagentDispatchCardList, {
      props: { sources: [huiyuSource('order2')], includeSettled: true }
    })
    beginSubagentRun('order2', 'huiyu:1', { input: '【作图任务】先开始' })
    vi.advanceTimersByTime(100)
    beginSubagentRun('order2', 'huiyu:2', { input: '【作图任务】后开始' })
    await nextTick()
    const titles = wrapper.findAll('.tds-script-card').map((c) => c.text())
    expect(titles[0]).toContain('先开始')
    expect(titles[1]).toContain('后开始')
    resetSubagentRunStatusForTest()
    vi.useRealTimers()
  })
})
