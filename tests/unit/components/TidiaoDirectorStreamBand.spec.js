/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TidiaoDirectorStreamBand from '../../../src/components/app/chat/TidiaoDirectorStreamBand.vue'
import { buildTidiaoDirectorStream, emptyTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream'
// 挤压侧栏桥（2026-07-10 四面板统一·前身=批次G state 专用桥）：sidebar 模式断言模块 ref 状态。
import { closeTidiaoPanelSidebar, tidiaoPanelSidebarTarget } from '../../../src/app/tidiaoPanelSidebarState'
import { beginSubagentRun, endSubagentRun, resetSubagentRunStatusForTest } from '../../../src/app/subagentRunStatus'
import { NARRATIVE_SCRIPTWRITER_SUBAGENT_ID } from '../../../src/app/narrativeScriptwriterSubagent'
import { CAIFENG_SUBAGENT_ID_PREFIX } from '../../../src/app/caifengSubagent'
import { HUIYU_SUBAGENT_ID_PREFIX } from '../../../src/app/huiyuSubagent'
// 资料池面板 i18n 化（出海线）后，点开浮层的用例 mount 必须装真 i18n（zh 钉死让中文断言稳定）。
import { i18n } from '../../../src/i18n'

i18n.global.locale.value = 'zh'

// 直接消费子批1 契约 builder 构造视图模型，组件与契约同源，能捕获结构漂移。
// 天气样例（§3）：分析 → 判情境(读 skill 工具) → 定旁白方向(挂旁白镜) → 定角色方向(挂角色镜)。
function weatherEvents() {
  return [
    { type: 'decision', kind: 'analyze', text: '在分析这条消息…' },
    {
      type: 'decision', kind: 'situation', text: '这是闲聊放松的情境',
      tool: { tool: 'readScenarioSkill', label: '读取情境', detail: 'casual', resultPreview: '读到情境正文', status: 'done' }
    },
    {
      type: 'decision', kind: 'narrationDir', text: '今晚天气值得描写，来一段旁白',
      shot: { kind: 'narration', label: '旁白', direction: '写夜色/凉意烘托', informationBearing: false }
    },
    {
      type: 'decision', kind: 'castDir', text: '小樱会附和用户、觉得有道理',
      shot: { kind: 'character', label: '小樱', direction: '附和、觉得有道理' }
    }
  ]
}

function runningStream() {
  return buildTidiaoDirectorStream([...weatherEvents(), { type: 'phase', phase: 'running' }])
}
function doneStream() {
  return buildTidiaoDirectorStream([...weatherEvents(), { type: 'phase', phase: 'done' }])
}

describe('TidiaoDirectorStreamBand', () => {
  it('带内折叠态已退役（2026-07-07）：恒展开、无带内收起按钮（坞底边是唯一收起控件）', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
    expect(wrapper.find('.tds-expand').exists()).toBe(true)
    expect(wrapper.find('.tds-fold').exists()).toBe(false)
    expect(wrapper.find('.tds-collapse').exists()).toBe(false)
  })

  it('展开态：决策流逐条 + 工具条表现分开，分镜并排累积含方向与二分类', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), speakerName: '小樱' } })
    // 决策流四条
    expect(wrapper.findAll('.tds-dec')).toHaveLength(4)
    const text = wrapper.text()
    expect(text).toContain('在分析这条消息')
    expect(text).toContain('这是闲聊放松的情境')
    // 工具条独立呈现（与叙述分开）
    const tool = wrapper.find('.tds-tool')
    expect(tool.exists()).toBe(true)
    expect(tool.text()).toContain('读取情境')
    expect(tool.text()).toContain('casual')
    expect(tool.classes()).toContain('tds-tool--done')
    // 分镜并排：旁白 + 角色两镜，方向可见，旁白带「纯描写」二分类
    const shots = wrapper.findAll('.tds-shot')
    expect(shots).toHaveLength(2)
    expect(shots[0].classes()).toContain('tds-shot--narr')
    expect(shots[0].text()).toContain('旁白')
    expect(shots[0].text()).toContain('写夜色/凉意烘托')
    expect(shots[0].text()).toContain('纯描写')
    expect(shots[1].classes()).toContain('tds-shot--char')
    expect(shots[1].text()).toContain('小樱')
    expect(shots[1].text()).toContain('附和')
    // 头部显示出场者名
    expect(wrapper.find('.tds-head-speaker').text()).toContain('小樱')
  })

  it('idle 空载体：占位文案、分镜区始终可见', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: emptyTidiaoDirectorStream() } })
    expect(wrapper.find('.tds-empty').exists()).toBe(true)
    // 分镜区即使没分镜也在（始终可见）；空态提示文案 2026-07-10 用户拍板删除——列内留白（负向锁）
    expect(wrapper.find('.tds-shots').exists()).toBe(true)
    expect(wrapper.find('.tds-shots-empty').exists()).toBe(false)
    expect(wrapper.findAll('.tds-shot')).toHaveLength(0)
  })

  it('running 末句打字机逐字：最后一条决策按字符 reveal，先前决策全显', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream() } })
      const lastText = () => wrapper.findAll('.tds-dec-text')[3].text()
      // 初始 typedChars=0：末句还没打出来（先前三条全显）
      expect(wrapper.findAll('.tds-dec-text')[0].text()).toContain('在分析这条消息')
      expect(lastText()).toBe('')
      // 推进若干间隔 → 末句逐字 reveal 出前几字
      vi.advanceTimersByTime(30 * 3 + 5)
      await nextTick()
      expect(lastText().length).toBeGreaterThanOrEqual(3)
      expect('小樱会附和用户、觉得有道理').toContain(lastText())
      // 推到结束 → 末句完整
      vi.advanceTimersByTime(30 * 20)
      await nextTick()
      expect(lastText()).toBe('小樱会附和用户、觉得有道理')
    } finally {
      vi.useRealTimers()
    }
  })

  it('续跑致决策 id 重复时：只有末条（新一轮）按位置播打字，旧那条同 id 决策静态全显', async () => {
    vi.useFakeTimers()
    try {
      // 模拟纠偏/重生成续跑后的合并流：上一轮 decision_1 + 本轮 decision_1（同 id），本轮末条标 streaming。
      // 旧 bug：按 id 匹配 → 两条同 id 都被当成流式行一起重播打字。修复后按位置只认末条。
      const stream = {
        phase: 'running',
        currentAction: '提调正在排这一轮…',
        decisions: [
          { id: 'decision_1', kind: 'note', text: '上一轮的旧决策' },
          { id: 'decision_1', kind: 'analyze', text: '这一轮的新决策', streaming: true }
        ],
        shots: []
      }
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream } })
      // 只有一处流式行（末条），不会两条同 id 一起被当成流式行
      expect(wrapper.findAll('.tds-dec--stream')).toHaveLength(1)
      // 旧那条同 id 决策始终静态全显，不被打字机截断
      expect(wrapper.findAll('.tds-dec-text')[0].text()).toBe('上一轮的旧决策')
      // 末条逐字 reveal（初始为空 → 推进后出字）
      expect(wrapper.findAll('.tds-dec-text')[1].text()).toBe('')
      vi.advanceTimersByTime(30 * 4 + 5)
      await nextTick()
      expect(wrapper.findAll('.tds-dec-text')[1].text().length).toBeGreaterThanOrEqual(3)
      // 旧那条仍全显（不受末条打字影响）
      expect(wrapper.findAll('.tds-dec-text')[0].text()).toBe('上一轮的旧决策')
    } finally {
      vi.useRealTimers()
    }
  })

  it('done 相位末句不流式：全显且无打字光标', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
    expect(wrapper.find('.tds-caret').exists()).toBe(false)
    expect(wrapper.findAll('.tds-dec-text')[3].text()).toBe('小樱会附和用户、觉得有道理')
    expect(wrapper.find('.tds-bottom-ok').text()).toContain('本轮编排完成')
  })

  it('运行态无停止键（停止统一 2026-07-04：唯一停止入口=输入框 abortChat），只显编排中提示', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), interactive: true } })
    expect(wrapper.find('.tds-btn--stop').exists()).toBe(false)
    expect(wrapper.find('.tds-bottom-hint').text()).toContain('提调编排中')

    const passive = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), interactive: false } })
    expect(passive.find('.tds-btn--stop').exists()).toBe(false)
    expect(passive.find('.tds-bottom-hint').text()).toContain('提调编排中')
  })

  it('纠偏态：内联输入框已退役（2026-06-22），只显示状态提示、引导走橄榄绿提调框', () => {
    // 内联纠偏框删除后，纠偏态（按停止 / 问用户挂起）不再内嵌 输入/继续/取消；提调对话统一走输入栏上方橄榄绿框。
    const stream = buildTidiaoDirectorStream(weatherEvents(), { correction: { active: true, text: '' } })
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream, interactive: true } })
    expect(wrapper.find('.tds-corr-input').exists()).toBe(false)
    expect(wrapper.find('.tds-btn--cancel').exists()).toBe(false)
    expect(wrapper.find('.tds-btn--continue').exists()).toBe(false)
    // 只剩状态提示，引导用户去下方输入框继续
    expect(wrapper.find('.tds-bottom-hint').text()).toContain('在下方输入框继续指挥提调')
  })

  it('真结构性失败（零产出）：红字错误态 + 重试原因；上抛 retry', async () => {
    // 零决策零分镜的纯失败 → 走红字 .tds-bottom-fail（真失败保留报错态）。
    const stream = buildTidiaoDirectorStream([{ type: 'fail', reason: '模型连接超时' }])
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream, interactive: true } })
    expect(wrapper.find('.tds-btn--retry').exists()).toBe(true)
    expect(wrapper.find('.tds-bottom-fail').exists()).toBe(true)
    expect(wrapper.find('.tds-bottom-partial').exists()).toBe(false)
    expect(wrapper.text()).toContain('模型连接超时')
    await wrapper.find('.tds-btn--retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('R3-5·P25：已出内容但后置失败 → 柔和「部分完成」、不报红字；仍保留重试与原因', () => {
    // 有决策/分镜（提调真做过编排、通常已出回复）但 phase=failed → 不该被误判成错误态。
    const stream = buildTidiaoDirectorStream([...weatherEvents(), { type: 'fail', reason: '落库时网络抖动' }])
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream, interactive: true } })
    // 走柔和「部分完成」，不走红字失败
    expect(wrapper.find('.tds-bottom-partial').exists()).toBe(true)
    expect(wrapper.find('.tds-bottom-fail').exists()).toBe(false)
    expect(wrapper.text()).toContain('本轮已出内容')
    expect(wrapper.text()).toContain('落库时网络抖动') // 仍显示精确原因
    // 顶层容器走 done 样式而非 failed 红框
    expect(wrapper.find('.tds--failed').exists()).toBe(false)
    expect(wrapper.find('.tds--done').exists()).toBe(true)
    // 仍可重试
    expect(wrapper.find('.tds-btn--retry').exists()).toBe(true)
  })

  // 批次I·侧栏入口联动：召回/编排入口默认不显示，传入对应 prop 才出现，点击上抛对应事件。
  // 资料池入口 2026-07-03 改常驻（与场记入口同口径），不再按池空否门控。
  it('无入口 prop 时不显示召回/编排入口按钮（场记/资料池入口恒显·不算其中）', () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
    const entries = wrapper.findAll('.tds-entry')
    expect(entries.some((e) => e.text().includes('召回'))).toBe(false)
    expect(entries.some((e) => e.text().includes('编排'))).toBe(false)
    expect(entries.some((e) => e.text().includes('资料池'))).toBe(true)
  })

  it('召回入口：recallRunId 有值显示「召回」按钮，点击上抛 open-recall', async () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), recallRunId: 'recall_abc' } })
    const entries = wrapper.findAll('.tds-entry')
    const recall = entries.find((e) => e.text().includes('召回'))
    expect(recall).toBeTruthy()
    await recall.trigger('click')
    expect(wrapper.emitted('open-recall')).toHaveLength(1)
  })

  it('编排入口：hasOrchestrationAudit=true 显示「编排」按钮，点击上抛 open-orchestration', async () => {
    const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), hasOrchestrationAudit: true } })
    const entries = wrapper.findAll('.tds-entry')
    const orch = entries.find((e) => e.text().includes('编排'))
    expect(orch).toBeTruthy()
    await orch.trigger('click')
    expect(wrapper.emitted('open-orchestration')).toHaveLength(1)
  })

  describe('批次4·C 资料池入口', () => {
    const poolsWith = (cards) => ({
      sessionId: 's1', roundAnchorId: '10',
      characterPools: { char_1: { recalledAt: 'x', cards } },
      worldPool: { cards: [], recalledAt: '' }
    })

    it('无池数据（入口常驻）：仍挂「资料池」入口，点开显示空态；有 poolSessionId+成员时可手动加卡', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          recallPools: null,
          poolSessionId: 's_empty',
          poolCastCharacterIds: ['char_1'],
          resolveName: (id) => (id === 'char_1' ? '星依' : id)
        },
        global: { plugins: [i18n], stubs: { teleport: true } }
      })
      const entry = wrapper.findAll('.tds-entry').find((e) => e.text().includes('资料池'))
      expect(entry).toBeTruthy()
      await entry.trigger('click')
      expect(wrapper.find('.rrp-empty-all').exists()).toBe(true)
      // 空池仍可加第一张卡：加卡入口在（sessionId 兜底），归属选项含会话成员+世界池
      await wrapper.find('.rrp-add-toggle').trigger('click')
      const options = wrapper.findAll('.rrp-add-select option').map((o) => o.text())
      expect(options.some((t) => t.includes('星依'))).toBe(true)
      expect(options.some((t) => t.includes('世界知识'))).toBe(true)
    })

    it('池非空：挂「资料池」入口，点击展开侧栏抽屉', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          recallPools: poolsWith([{ id: 'c1', title: '望舒台往事', summary: '摘要', bodyText: '正文', origin: 'character_brain', ownerCharacterId: 'char_1' }]),
          resolveName: (id) => (id === 'char_1' ? '星依' : id)
        },
        global: { plugins: [i18n], stubs: { teleport: true } }
      })
      const entry = wrapper.findAll('.tds-entry').find((e) => e.text().includes('资料池'))
      expect(entry).toBeTruthy()
      expect(wrapper.find('.rrp').exists()).toBe(false)
      await entry.trigger('click')
      expect(wrapper.find('.rrp').exists()).toBe(true)
      expect(wrapper.text()).toContain('望舒台往事')
    })

    it('只有空角色池（0 卡）：入口常驻，点开显示空态', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: { stream: doneStream(), recallPools: poolsWith([]) },
        global: { plugins: [i18n], stubs: { teleport: true } }
      })
      const entry = wrapper.findAll('.tds-entry').find((e) => e.text().includes('资料池'))
      expect(entry).toBeTruthy()
      await entry.trigger('click')
      expect(wrapper.find('.rrp-empty-all').exists()).toBe(true)
    })
  })

  describe('场记（2026-06-29 生·原「state 查看器」·2026-07-10 改中文名·主记录 + 子记录只读）', () => {
    it('始终挂「场记」入口，点击展开只读抽屉，含主记录与子记录分区', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          shotDetails: { 小樱: { stepLabel: '7 / 7', scenario: '压力' } }
        },
        global: { stubs: { teleport: true } }
      })
      const entry = wrapper.findAll('.tds-entry').find((e) => e.text().includes('场记'))
      expect(entry).toBeTruthy()
      expect(wrapper.find('.dsi').exists()).toBe(false)
      await entry.trigger('click')
      expect(wrapper.find('.dsi').exists()).toBe(true)
      expect(wrapper.text()).toContain('主记录')
      expect(wrapper.text()).toContain('子记录')
    })

    // 批次G（2026-07-03·挤压侧栏）：桌面 sidebar 模式点「场记」→ 写模块桥（AppChatSection 渲染内联 aside），
    // 不再开带内浮层；getter 闭包捕获响应式 props（活动带实时刷新）；卸载只关自己发起的。
    it('sidebar 模式：点「场记」写模块桥 target（getter 取到本带数据）、不开本地浮层；卸载 closeIfOwner', async () => {
      closeTidiaoPanelSidebar()
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          shotDetails: { 小樱: { stepLabel: '7 / 7', scenario: '压力' } },
          memoryProjection: '【0·总纲领】…喂模型原文…',
          panelMode: 'sidebar'
        },
        global: { stubs: { teleport: true } }
      })
      const entry = wrapper.findAll('.tds-entry').find((e) => e.text().includes('场记'))
      await entry.trigger('click')
      // 本地浮层不开，模块桥被置。
      expect(wrapper.find('.dsi').exists()).toBe(false)
      const target = tidiaoPanelSidebarTarget.value
      expect(target).toBeTruthy()
      expect(target.kind).toBe('state')
      expect(target.getStream()).toBeTruthy()
      expect(target.getShotDetails()['小樱'].scenario).toBe('压力')
      expect(target.getMemoryProjection()).toContain('喂模型原文')
      // 卸载：只关自己发起的面板。
      wrapper.unmount()
      expect(tidiaoPanelSidebarTarget.value).toBeNull()
    })

    it('sidebar 模式卸载守卫不误关别的带打开的面板', async () => {
      closeTidiaoPanelSidebar()
      const first = mount(TidiaoDirectorStreamBand, {
        props: { stream: doneStream(), panelMode: 'sidebar' },
        global: { stubs: { teleport: true } }
      })
      const second = mount(TidiaoDirectorStreamBand, {
        props: { stream: doneStream(), panelMode: 'sidebar' },
        global: { stubs: { teleport: true } }
      })
      // 先开 first 的，再开 second 的（覆盖）——卸载 first 不应关掉 second 打开的。
      await first.findAll('.tds-entry').find((e) => e.text().includes('场记')).trigger('click')
      await second.findAll('.tds-entry').find((e) => e.text().includes('场记')).trigger('click')
      first.unmount()
      expect(tidiaoPanelSidebarTarget.value).not.toBeNull()
      second.unmount()
      expect(tidiaoPanelSidebarTarget.value).toBeNull()
    })

    // 剧本升为对话级大工作台；资料池仍走模块桥。
    it('sidebar 模式：剧本派发大工作台事件，资料池继续写模块桥 target', async () => {
      closeTidiaoPanelSidebar()
      const openScript = vi.fn()
      window.addEventListener('langhuan:open-script-workspace', openScript)
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          panelMode: 'sidebar',
          poolSessionId: 's_bridge',
          poolCastCharacterIds: ['char_1'],
          recallPools: null
        },
        global: { stubs: { teleport: true } }
      })
      await wrapper.findAll('.tds-entry').find((e) => e.text().includes('剧本')).trigger('click')
      expect(wrapper.find('.dsp').exists()).toBe(false)
      expect(tidiaoPanelSidebarTarget.value).toBeNull()
      expect(openScript).toHaveBeenCalledOnce()
      await wrapper.findAll('.tds-entry').find((e) => e.text().includes('资料池')).trigger('click')
      expect(wrapper.find('.rrp').exists()).toBe(false)
      expect(tidiaoPanelSidebarTarget.value.kind).toBe('pool')
      expect(tidiaoPanelSidebarTarget.value.getCastCharacterIds()).toEqual(['char_1'])
      wrapper.unmount()
      window.removeEventListener('langhuan:open-script-workspace', openScript)
      expect(tidiaoPanelSidebarTarget.value).toBeNull()
    })
  })

  describe('形态1·E5 角色镜钻取（per-speaker 过程可见性）', () => {
    it('有 shotDetails 的角色镜显示「点开」，展开后呈现步骤/情境/取料/评审提示', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          shotDetails: {
            小樱: {
              stepLabel: '7 / 7',
              elapsed: '3.2s',
              scenario: '压力',
              retrieval: [{ tool: '语义召回', query: '望舒台' }],
              hasReview: true
            }
          }
        }
      })
      // 旁白镜恒可钻取排在前、小樱角色镜在后 → 取角色镜 drill（findAll 末个）
      const drills = wrapper.findAll('.tds-shot-drill')
      const drill = drills[drills.length - 1]
      expect(drill.text()).toContain('展开')
      expect(wrapper.find('.tds-shot-detail').exists()).toBe(false)
      await drill.trigger('click')
      const detail = wrapper.find('.tds-shot-detail')
      expect(detail.exists()).toBe(true)
      expect(detail.text()).toContain('7 / 7')
      expect(detail.text()).toContain('压力')
      expect(detail.text()).toContain('语义召回')
      expect(detail.text()).toContain('望舒台')
      expect(detail.text()).toContain('编排') // 评审详情指向「编排」入口
      expect(drill.text()).toContain('收起')
    })

    it('无 shotDetails 时：旁白镜恒挂「展开」、短方向角色镜不挂', () => {
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
      const shotEls = wrapper.findAll('.tds-shot')
      // 旁白镜恒可钻取（看「定方向→生成旁白」轨）
      expect(shotEls[0].find('.tds-shot-drill').exists()).toBe(true)
      // 角色镜方向短、无明细 → 不挂展开按钮
      expect(shotEls[1].find('.tds-shot-drill').exists()).toBe(false)
    })

    it('未取料的角色：展开提示「本轮未额外取料」', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          shotDetails: { 小樱: { stepLabel: '6 / 6', hasReview: false } }
        }
      })
      // 旁白镜恒可钻取在前 → 取角色镜 drill（末个）展开
      const drills = wrapper.findAll('.tds-shot-drill')
      await drills[drills.length - 1].trigger('click')
      expect(wrapper.find('.tds-shot-detail').text()).toContain('本轮未额外取料')
    })

    it('动态工作流步骤轨：节点按状态渲染（done 打勾 / running 转圈 / failed 画叉）+ 单步耗时 + 评审降级可点开', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream: doneStream(),
          shotDetails: {
            小樱: {
              stepLabel: '3 / 3',
              steps: [
                { id: 'projection', label: '生成上下文投影', icon: 'layers', status: 'done', elapsed: '0.3s' },
                { id: 'recall', label: '召回', icon: 'radar', status: 'running' },
                { id: 'review', label: '评审', icon: 'list-checks', status: 'failed' }
              ],
              reviewDegrade: { reason: 'ReRanker 未运行' },
              hasReview: true
            }
          }
        }
      })
      // 旁白镜恒可钻取在前 → 取角色镜 drill（末个）展开
      const drills = wrapper.findAll('.tds-shot-drill')
      await drills[drills.length - 1].trigger('click')
      const rows = wrapper.findAll('.tds-wf-row')
      expect(rows).toHaveLength(3)
      expect(rows[0].text()).toContain('生成上下文投影')
      expect(rows[0].text()).toContain('0.3s')
      expect(rows[0].find('.tds-wf-node--done').exists()).toBe(true)
      expect(rows[1].find('.tds-wf-node--running').exists()).toBe(true)
      expect(rows[1].find('.tds-wf-spin').exists()).toBe(true)
      expect(rows[2].find('.tds-wf-node--failed').exists()).toBe(true)
      // 评审降级 tag 点开看原因（内联展开）
      const degradeBtn = wrapper.findAll('.tds-wf-tag--skip').find((b) => b.text().includes('降级'))
      expect(degradeBtn).toBeTruthy()
      await degradeBtn.trigger('click')
      expect(wrapper.find('.tds-wf-note').text()).toContain('ReRanker 未运行')
    })

    it('（批次B）超长方向无明细：旁白镜也挂「展开」，折叠截断 100 字 + 省略号，展开看全文', async () => {
      const longDir = '旁'.repeat(160) // > 100 字，必折叠
      const stream = buildTidiaoDirectorStream([
        { type: 'decision', kind: 'narrationDir', text: '来一段长旁白', shot: { kind: 'narration', label: '旁白', direction: longDir, informationBearing: true } },
        { type: 'phase', phase: 'done' }
      ])
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream } })
      const drill = wrapper.find('.tds-shot-drill')
      // 无 shotDetails，但方向超 100 字 → 仍挂展开按钮
      expect(drill.exists()).toBe(true)
      const dir = wrapper.find('.tds-shot-dir')
      // 折叠态：截断 100 字 + 省略号（短于全文）
      expect(dir.text()).toContain('…')
      expect(dir.text().length).toBeLessThan(longDir.length)
      // 展开 → 全文，无省略号；旁白镜恒有「定方向→生成旁白」narrationGen 抽屉
      await drill.trigger('click')
      expect(wrapper.find('.tds-shot-dir').text()).toBe(longDir)
      const detail = wrapper.find('.tds-shot-detail')
      expect(detail.exists()).toBe(true)
      expect(detail.text()).toContain('生成旁白')
    })

    it('（批次B）短方向角色镜不折叠、不挂展开按钮（无明细时）', () => {
      // doneStream 角色镜方向很短（< 100 字）、无 shotDetails → 角色镜不挂展开按钮、方向全显
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
      const shotEls = wrapper.findAll('.tds-shot')
      expect(shotEls[1].find('.tds-shot-drill').exists()).toBe(false) // 小樱角色镜
      expect(wrapper.findAll('.tds-shot-dir')[0].text()).toBe('写夜色/凉意烘托')
    })

    it('（批次B）角色镜长方向 + 编排明细：一个「展开」按钮同时展开全文方向与子工作流', async () => {
      const longDir = '附'.repeat(140)
      const stream = buildTidiaoDirectorStream([
        { type: 'decision', kind: 'castDir', text: '小樱回应', shot: { kind: 'character', label: '小樱', direction: longDir } },
        { type: 'phase', phase: 'done' }
      ])
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: {
          stream,
          shotDetails: { 小樱: { stepLabel: '7 / 7', scenario: '压力', retrieval: [{ tool: '语义召回', query: '望舒台' }], hasReview: true } }
        }
      })
      const drill = wrapper.find('.tds-shot-drill')
      expect(drill.exists()).toBe(true)
      // 折叠态：方向截断，子工作流抽屉未出
      expect(wrapper.find('.tds-shot-dir').text()).toContain('…')
      expect(wrapper.find('.tds-shot-detail').exists()).toBe(false)
      // 一键展开：全文方向 + 子工作流同时出现
      await drill.trigger('click')
      expect(wrapper.find('.tds-shot-dir').text()).toBe(longDir)
      const detail = wrapper.find('.tds-shot-detail')
      expect(detail.exists()).toBe(true)
      expect(detail.text()).toContain('望舒台')
    })

    it('旁白镜 narrationGen 抽屉：定方向（done）→ 生成旁白（随 narrationGen 态 + 耗时）', async () => {
      // 旁白结论（旁白独立分镜工作流 2026-06-30）已从角色轨摘出，迁到 directorStream 旁白镜的 narrationGen 抽屉。
      const stream = {
        phase: 'done',
        currentAction: '本轮编排完成',
        decisions: [],
        shots: [
          { id: 'shot_1', kind: 'narration', label: '旁白', order: 1, direction: '写夜色/凉意烘托', informationBearing: false, narrationGen: 'done', narrationGenElapsed: '1.2s' }
        ]
      }
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream } })
      await wrapper.find('.tds-shot-drill').trigger('click')
      const labels = wrapper.findAll('.tds-wf-label').map((l) => l.text())
      expect(labels).toContain('定方向')
      expect(labels).toContain('生成旁白')
      expect(wrapper.find('.tds-shot-detail').text()).toContain('1.2s')
    })
  })

  // 2026-07-05 移动端适配：compact 下「信息流/分镜」tab 二选一 + 入口图标化 + 撤带内收起按钮（tab 名 2026-07-10 决策流→信息流）。
  // v-show 显隐断言用内联 style 判（jsdom getComputedStyle 对动态切换后的 v-show 判定不可靠，isVisible 会误报）。
  const hiddenByVShow = (w) => String(w.attributes('style') || '').includes('display: none')
  describe('compact tab 二选一（移动端适配 2026-07-05）', () => {
    it('compact：tab 行存在，默认信息流可见、分镜隐藏；点分镜 tab 切换', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), compact: true } })
      const tabs = wrapper.findAll('.tds-tab-btn')
      expect(tabs).toHaveLength(2)
      expect(tabs[0].text()).toContain('信息流')
      expect(tabs[0].classes()).toContain('is-on')
      // 分镜 tab 带镜数徽标
      expect(tabs[1].find('.tds-tab-badge').text()).toBe('2')
      // 二选一：默认决策流显示、分镜 v-show 隐藏（DOM 仍在，保切换态）
      expect(hiddenByVShow(wrapper.find('.tds-flow'))).toBe(false)
      expect(hiddenByVShow(wrapper.find('.tds-shots'))).toBe(true)
      await tabs[1].trigger('click')
      expect(tabs[1].classes()).toContain('is-on')
      expect(hiddenByVShow(wrapper.find('.tds-flow'))).toBe(true)
      expect(hiddenByVShow(wrapper.find('.tds-shots'))).toBe(false)
    })

    it('compact：头部文本入口与收起按钮撤掉，入口图标化收进 tab 行（资料池/待办/剧本/场记恒显·召回/编排按数据显隐）', () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: { stream: doneStream(), compact: true, recallRunId: 'run_1', hasOrchestrationAudit: true }
      })
      // 桌面那排文本入口与带内收起按钮在 compact 下不渲染（坞底边是唯一收起控件）
      expect(wrapper.find('.tds-entry').exists()).toBe(false)
      expect(wrapper.find('.tds-collapse').exists()).toBe(false)
      const entryTitles = wrapper.findAll('.tds-tab-entry').map((e) => e.attributes('title'))
      expect(entryTitles).toEqual(['召回', '资料池', '编排', '剧本', '场记'])
    })

    it('compact：无召回/编排数据时对应图标入口不显示', () => {
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), compact: true } })
      const entryTitles = wrapper.findAll('.tds-tab-entry').map((e) => e.attributes('title'))
      expect(entryTitles).toEqual(['资料池', '剧本', '场记'])
    })

    it('编剧运行角标（2026-07-07）：consultScript 运行中桌面入口亮秒表、compact 图标亮脉冲点；结束即熄', async () => {
      resetSubagentRunStatusForTest()
      const desktop = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), poolSessionId: 's_run' } })
      const compactBand = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), compact: true, poolSessionId: 's_run' } })
      expect(desktop.find('.tds-entry-run').exists()).toBe(false)
      beginSubagentRun('s_run', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID)
      await nextTick()
      const runChip = desktop.find('.tds-entry-run')
      expect(runChip.exists()).toBe(true)
      expect(runChip.text()).toMatch(/s$/) // 活秒表（如 0.0s）
      expect(compactBand.find('.tds-tab-dot--pulse').exists()).toBe(true)
      endSubagentRun('s_run', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { ok: true })
      await nextTick()
      expect(desktop.find('.tds-entry-run').exists()).toBe(false)
      expect(compactBand.find('.tds-tab-dot--pulse').exists()).toBe(false)
      resetSubagentRunStatusForTest()
    })

    it('编剧运行态卡（2026-07-07）：running 时决策流顶部出卡（执笔中+活秒表），展开看内部信息流；结束转「已完成」并显示编剧返回', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), poolSessionId: 's_card', liveRound: true } })
      expect(wrapper.find('.tds-script-card').exists()).toBe(false)
      beginSubagentRun('s_card', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { input: '【提调带来的本轮信息】用户想让节奏慢下来' })
      await nextTick()
      const card = wrapper.find('.tds-script-card')
      expect(card.exists()).toBe(true)
      expect(card.classes()).toContain('tds-script-card--running')
      expect(card.text()).toContain('编剧')
      expect(card.text()).toContain('执笔中')
      // 展开内部信息流：入侧显示提调交给编剧的原文；出侧 running 显示占位
      await card.find('.tds-script-head').trigger('click')
      expect(wrapper.find('.tds-script-body').exists()).toBe(true)
      expect(wrapper.text()).toContain('提调 → 编剧')
      expect(wrapper.text()).toContain('用户想让节奏慢下来')
      expect(wrapper.text()).toContain('编剧执笔中，返回后在这里显示')
      // 结束：转「已完成」，出侧显示编剧原始返回，卡仍持久可见（活动轮）
      endSubagentRun('s_card', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { ok: true, output: '{"guidance":"这轮蓄势，张力落 2"}' })
      await nextTick()
      expect(wrapper.find('.tds-script-card--running').exists()).toBe(false)
      // 2026-07-16 窄容器防溢出：done 态省略「已完成」文字（勾图标已表意），只用 class 判定完成态
      expect(wrapper.find('.tds-script-card').classes()).toContain('tds-script-card--done')
      expect(wrapper.text()).toContain('张力落 2')
      resetSubagentRunStatusForTest()
    })

    it('编剧运行态卡（2026-07-07 缓存可见性·2026-07-16 token 折算 k 位+缓存率下线）：完成后耗时旁显示 token 总量（k 位），不再显示缓存百分比', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), poolSessionId: 's_usage', liveRound: true } })
      beginSubagentRun('s_usage', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID)
      await nextTick()
      endSubagentRun('s_usage', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, {
        ok: true,
        output: '{"guidance":"这轮蓄势"}',
        usage: { promptTokens: 15639, completionTokens: 2939, cacheReadTokens: 12000, cacheCreationTokens: 1000 }
      })
      await nextTick()
      const card = wrapper.find('.tds-script-card')
      expect(card.text()).toContain('18.6k tokens')
      expect(card.text()).not.toContain('缓存')
      expect(card.text()).not.toContain('输入缓存命中')
      resetSubagentRunStatusForTest()
    })

    it('编剧运行态卡：没有 usage（非订阅桥/未来得及记录）时不显示 token 段，只显示耗时', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), poolSessionId: 's_no_usage', liveRound: true } })
      beginSubagentRun('s_no_usage', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID)
      await nextTick()
      endSubagentRun('s_no_usage', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { ok: true, output: '{"guidance":"..."}' })
      await nextTick()
      const card = wrapper.find('.tds-script-card')
      expect(card.classes()).toContain('tds-script-card--done')
      expect(card.text()).not.toContain('tokens')
      resetSubagentRunStatusForTest()
    })

    it('编剧运行态卡：done/error 残影只在活动轮显示（liveRound 门），running 不受门约束；失败态显示原因', async () => {
      resetSubagentRunStatusForTest()
      // 历史轮（liveRound 缺省 false）：done 残影不显示
      beginSubagentRun('s_gate', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { input: '入参' })
      endSubagentRun('s_gate', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { ok: true, output: '返回' })
      const history = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_gate' } })
      expect(history.find('.tds-script-card').exists()).toBe(false)
      // running：历史轮上也恒显（持久可见语义）
      beginSubagentRun('s_gate', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { input: '再来一次' })
      await nextTick()
      expect(history.find('.tds-script-card').exists()).toBe(true)
      // 失败：活动轮显示失败态与原因
      endSubagentRun('s_gate', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID, { ok: false, error: '上游 500' })
      const live = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_gate', liveRound: true } })
      const failedCard = live.find('.tds-script-card')
      expect(failedCard.exists()).toBe(true)
      expect(failedCard.classes()).toContain('tds-script-card--error')
      expect(failedCard.text()).toContain('失败')
      await failedCard.find('.tds-script-head').trigger('click')
      expect(live.text()).toContain('上游 500')
      // 历史轮的 error 残影同样被门挡住
      await nextTick()
      expect(history.find('.tds-script-card').exists()).toBe(false)
      resetSubagentRunStatusForTest()
    })

    it('桌面（缺省 compact=false）：无 tab 行，文本入口原样；带内收起按钮已全端撤掉（2026-07-07）', () => {
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream() } })
      expect(wrapper.find('.tds-tabs').exists()).toBe(false)
      expect(wrapper.find('.tds-collapse').exists()).toBe(false)
      expect(wrapper.findAll('.tds-entry').length).toBeGreaterThanOrEqual(2)
      // 两栏并排均可见
      expect(hiddenByVShow(wrapper.find('.tds-flow'))).toBe(false)
      expect(hiddenByVShow(wrapper.find('.tds-shots'))).toBe(false)
    })

    it('compact：running 中新镜落地点亮分镜 tab 小绿点，切到分镜即熄；切轮（roundKey 变）复位到决策流', async () => {
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: { stream: runningStream(), compact: true, roundKey: 'round_a' }
      })
      expect(wrapper.find('.tds-tab-dot').exists()).toBe(false)
      // 新镜落地（running 相位 shots 增长）
      await wrapper.setProps({
        stream: buildTidiaoDirectorStream([
          ...weatherEvents(),
          { type: 'decision', kind: 'castDir', text: '望舒也上', shot: { kind: 'character', label: '望舒', direction: '接话' } },
          { type: 'phase', phase: 'running' }
        ])
      })
      expect(wrapper.find('.tds-tab-dot').exists()).toBe(true)
      // 切到分镜 tab 绿点熄灭
      await wrapper.findAll('.tds-tab-btn')[1].trigger('click')
      expect(wrapper.find('.tds-tab-dot').exists()).toBe(false)
      expect(hiddenByVShow(wrapper.find('.tds-shots'))).toBe(false)
      // 切轮：tab 复位到决策流、绿点不残留（历史轮 phase=done 的镜数跳变不误点灯）
      await wrapper.setProps({ stream: doneStream(), roundKey: 'round_b' })
      expect(hiddenByVShow(wrapper.find('.tds-flow'))).toBe(false)
      expect(hiddenByVShow(wrapper.find('.tds-shots'))).toBe(true)
      expect(wrapper.find('.tds-tab-dot').exists()).toBe(false)
    })
  })

  // 地图严谨协作与运行卡计划批1（2026-07-11）：派遣卡块+sticky 逻辑抽成共享组件 SubagentDispatchCardList，
  // 本带改委托调用——覆盖行为零变化（原先没有专门 spec，这里补上，同时验证委托没有丢行为）。
  describe('派遣子agent运行卡（采风/造册/绘舆·委托 SubagentDispatchCardList 渲染）', () => {
    it('running 恒显：采风卡出现「采风」「钻取中」+ 任务小标题（从 status.input 首行提取）', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_dispatch' } })
      expect(wrapper.find('.tds-caifeng-card').exists()).toBe(false)
      beginSubagentRun('s_dispatch', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`, { input: '【钻取任务】核实薇尔莉特当前所在地\n\n正文…' })
      await nextTick()
      const card = wrapper.find('.tds-caifeng-card')
      expect(card.exists()).toBe(true)
      expect(card.classes()).toContain('tds-script-card--running')
      expect(card.text()).toContain('采风')
      expect(card.text()).toContain('钻取中')
      expect(card.text()).toContain('核实薇尔莉特当前所在地')
      resetSubagentRunStatusForTest()
    })

    it('done/error 残影只在活动轮显示（liveRound 门，同编剧卡口径）：历史轮不显示、liveRound=true 才显示', async () => {
      resetSubagentRunStatusForTest()
      beginSubagentRun('s_dispatch_gate', `${HUIYU_SUBAGENT_ID_PREFIX}:1`, { input: '【作图任务】新增码头' })
      endSubagentRun('s_dispatch_gate', `${HUIYU_SUBAGENT_ID_PREFIX}:1`, { ok: true, summary: 'x', output: '已交稿摘要' })
      const history = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_dispatch_gate' } })
      expect(history.find('.tds-caifeng-card').exists()).toBe(false)
      const live = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_dispatch_gate', liveRound: true } })
      const card = live.find('.tds-caifeng-card')
      expect(card.exists()).toBe(true)
      expect(card.text()).toContain('绘舆')
      expect(card.classes()).toContain('tds-script-card--done')
      resetSubagentRunStatusForTest()
    })

    it('点击展开：入侧显示「提调 → 采风」任务书，出侧显示「采风 → 提调」交回结论', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: doneStream(), poolSessionId: 's_dispatch_open', liveRound: true } })
      beginSubagentRun('s_dispatch_open', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`, { input: '【钻取任务】核实方位' })
      endSubagentRun('s_dispatch_open', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`, { ok: true, output: '结论：在临澜城' })
      await nextTick()
      expect(wrapper.find('.tds-caifeng-card .tds-script-body').exists()).toBe(false)
      await wrapper.find('.tds-caifeng-card .tds-script-head').trigger('click')
      expect(wrapper.text()).toContain('提调 → 采风')
      expect(wrapper.text()).toContain('采风 → 提调')
      expect(wrapper.text()).toContain('结论：在临澜城')
      resetSubagentRunStatusForTest()
    })

    it('sticky 联动堆叠：编剧卡 running 时占 0 号位，派遣卡续接第 1 号位（38px）', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, { props: { stream: runningStream(), poolSessionId: 's_dispatch_stack', liveRound: true } })
      beginSubagentRun('s_dispatch_stack', NARRATIVE_SCRIPTWRITER_SUBAGENT_ID)
      beginSubagentRun('s_dispatch_stack', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`)
      await nextTick()
      expect(wrapper.find('.tds-script-card:not(.tds-caifeng-card)').attributes('style')).toContain('top: 0px')
      expect(wrapper.find('.tds-caifeng-card').attributes('style')).toContain('top: 38px')
      resetSubagentRunStatusForTest()
    })

    it('切轮（roundKey 变）：派遣卡展开态复位收起', async () => {
      resetSubagentRunStatusForTest()
      const wrapper = mount(TidiaoDirectorStreamBand, {
        props: { stream: doneStream(), poolSessionId: 's_dispatch_reset', liveRound: true, roundKey: 'round_x' }
      })
      beginSubagentRun('s_dispatch_reset', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`)
      endSubagentRun('s_dispatch_reset', `${CAIFENG_SUBAGENT_ID_PREFIX}:1`, { ok: true, output: 'x' })
      await nextTick()
      await wrapper.find('.tds-caifeng-card .tds-script-head').trigger('click')
      expect(wrapper.find('.tds-caifeng-card .tds-script-body').exists()).toBe(true)
      await wrapper.setProps({ roundKey: 'round_y' })
      expect(wrapper.find('.tds-caifeng-card .tds-script-body').exists()).toBe(false)
      resetSubagentRunStatusForTest()
    })
  })
})
