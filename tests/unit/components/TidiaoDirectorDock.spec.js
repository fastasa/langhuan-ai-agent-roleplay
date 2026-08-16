/**
 * @vitest-environment jsdom
 */
// 提调坞自动开合契约（2026-07-07 首建，随「改帷幕强制弹开」信号一起锁）：
// ① 活动轮出现自动弹开；② phase→done 自动收起；③ failed/correcting 强制弹开；
// ④ 帷幕被真的改动（curtainSceneUpdateSignal）即便手动收起也强制弹开——轮跑完仍按 ② 收起。
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TidiaoDirectorDock from '../../../src/components/app/chat/TidiaoDirectorDock.vue'
import { emptyTidiaoDirectorStream } from '../../../src/app/tidiaoDirectorStream'
import { noteCurtainSceneUpdated } from '../../../src/app/tidiaoDirectorStreamState'
import { fetchDirectorRoundUsageTotals } from '../../../src/repositories/aiRepository'
import {
  setHuiyuStageConfirmPending,
  clearHuiyuStageConfirmPending,
  registerHuiyuStageConfirmResumeHandler
} from '../../../src/app/huiyuStageConfirmState'

vi.mock('../../../src/repositories/aiRepository', () => ({
  fetchDirectorRoundUsageTotals: vi.fn(async () => ({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    callCount: 0,
    profiles: {
      directorRound: { inputTokens: 0, cacheReadTokens: 0, callCount: 0, warmInputTokens: 0, warmCacheReadTokens: 0, warmCallCount: 0 },
      postRound: { inputTokens: 0, cacheReadTokens: 0, callCount: 0, warmInputTokens: 0, warmCacheReadTokens: 0, warmCallCount: 0 }
    }
  }))
}))

function makeRound(id, live, phase) {
  return {
    id,
    live,
    stream: { ...emptyTidiaoDirectorStream(), phase },
    speakerName: '小樱',
    getShotDetails: () => undefined,
    getRecallPools: () => null,
    getMemoryProjection: () => ''
  }
}

// 剪影草案地图弹窗桩（批3）：暴露 sessionId/draftSketches 供断言透传链路，submit 按钮触发 sketch-decision。
const MapViewerDialogStub = {
  name: 'MapViewerDialog',
  props: { open: Boolean, sessionId: String, draftSketches: Array },
  emits: ['close', 'sketch-decision'],
  template: `<div class="stub-map-viewer" :data-session-id="sessionId" :data-sketch-count="(draftSketches || []).length">
    <button class="stub-submit" type="button" @click="$emit('sketch-decision', { kind: 'huiyu-sketch-decision', accepted: ['sk-1'], rejected: [], comments: {}, note: undefined })">submit</button>
    <button class="stub-close" type="button" @click="$emit('close')">close</button>
  </div>`
}

function mountDock(rounds = [], props = {}) {
  return mount(TidiaoDirectorDock, {
    props: { rounds, ...props },
    global: { stubs: { TidiaoDirectorStreamBand: true, MapViewerDialog: MapViewerDialogStub } }
  })
}

const isOpen = (wrapper) => wrapper.find('.tds-dock__drawer').exists()

describe('TidiaoDirectorDock 自动开合', () => {
  it('快速回复关闭自动展开：运行轮保持折叠，用户仍可手动打开', async () => {
    const wrapper = mountDock([makeRound('fast_post_round', true, 'running')], { autoExpand: false })
    await nextTick()

    expect(isOpen(wrapper)).toBe(false)
    expect(wrapper.find('.tds-dock__bar').exists()).toBe(true)

    await wrapper.find('.tds-dock__bar').trigger('click')
    expect(isOpen(wrapper)).toBe(true)
  })

  it('快速回复关闭自动展开时，待确认卡在收起条上持续提示并可点击进入', async () => {
    setHuiyuStageConfirmPending({
      request: { kind: 'choice', title: '请确认地图草案', options: [{ label: '确认' }], source: { agent: 'huiyu', toolName: 'dispatchMapWork' } },
      sessionId: 'session_pending',
      redispatch: { task: '造图', instructions: '继续', stage: 'terrain', kind: 'draftConfirm', nextStep: 'draw', candidates: [], anchorMessageId: 0 }
    })
    const wrapper = mountDock([], { autoExpand: false, poolSessionId: 'session_pending' })
    await nextTick()

    expect(isOpen(wrapper)).toBe(false)
    const bar = wrapper.get('.tds-dock__bar')
    expect(bar.classes()).toContain('has-pending')
    expect(bar.classes()).toContain('tds-dock__bar--info')
    expect(bar.text()).toContain('待确认')
    expect(bar.attributes('title')).toContain('待确认')
    expect(bar.find('.tds-dock__pending-dot').exists()).toBe(true)

    await bar.trigger('click')
    expect(isOpen(wrapper)).toBe(true)
    expect(wrapper.get('.tds-dock__drawer').classes()).toContain('has-interaction')
    expect(wrapper.find('.tds-dock__huiyu-confirm').exists()).toBe(true)
    clearHuiyuStageConfirmPending()
  })

  it('活动轮出现自动弹开，phase→done 自动收起', async () => {
    const wrapper = mountDock([])
    expect(isOpen(wrapper)).toBe(false)

    // 活动轮出现（loop 启动·phase idle）→ 弹开
    await wrapper.setProps({ rounds: [makeRound('live_r1', true, 'idle')] })
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 运行中保持展开
    await wrapper.setProps({ rounds: [makeRound('live_r1', true, 'running')] })
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 跑完 → 自动收起
    await wrapper.setProps({ rounds: [makeRound('live_r1', true, 'done')] })
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
  })

  it('运行中手动收起后，帷幕被改动（curtainSceneUpdateSignal）强制重新弹开', async () => {
    const wrapper = mountDock([makeRound('live_r2', true, 'running')])
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 手动收起（点抽屉底边）
    await wrapper.find('.tds-dock__edge').trigger('click')
    expect(isOpen(wrapper)).toBe(false)

    // 提调真的改了帷幕 → 强制弹开
    noteCurtainSceneUpdated()
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)

    // 轮跑完仍按 done 自动收起（「改完关掉」闭环）
    await wrapper.setProps({ rounds: [makeRound('live_r2', true, 'done')] })
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)
  })

  it('无活动轮时帷幕信号不弹空坞；failed 强制弹开', async () => {
    const wrapper = mountDock([makeRound('msg_1', false, 'done')])
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)

    // 只有历史轮（无 live）→ 信号不动坞
    noteCurtainSceneUpdated()
    await nextTick()
    expect(isOpen(wrapper)).toBe(false)

    // 活动轮进 failed → 必须让人看见
    await wrapper.setProps({ rounds: [makeRound('msg_1', false, 'done'), makeRound('live_r3', true, 'running')] })
    await nextTick()
    await wrapper.find('.tds-dock__edge').trigger('click')
    expect(isOpen(wrapper)).toBe(false)
    await wrapper.setProps({ rounds: [makeRound('msg_1', false, 'done'), makeRound('live_r3', true, 'failed')] })
    await nextTick()
    expect(isOpen(wrapper)).toBe(true)
  })
})

// 缓存可见性（2026-07-07）：坞底部条 headLabel 除 token 总量外还要带「缓存读 token 量」与「输入缓存命中 X%」。
describe('TidiaoDirectorDock 消耗展示·缓存命中', () => {
  it('轮到达 done 后惰性查询消耗，headLabel 带上 token 总量、缓存读量与命中百分比', async () => {
    fetchDirectorRoundUsageTotals.mockResolvedValueOnce({
      inputTokens: 700000,
      outputTokens: 20000,
      totalTokens: 720000,
      cacheReadTokens: 560000,
      cacheCreationTokens: 40000,
      callCount: 10,
      profiles: {
        directorRound: {
          inputTokens: 500000,
          cacheReadTokens: 430000,
          callCount: 6,
          warmInputTokens: 400000,
          warmCacheReadTokens: 360000,
          warmCallCount: 4
        },
        postRound: { inputTokens: 0, cacheReadTokens: 0, callCount: 0, warmInputTokens: 0, warmCacheReadTokens: 0, warmCallCount: 0 }
      }
    })
    const round = makeRound('live_r5', true, 'done')
    round.usageRoundId = 'round:session_x:1'
    const wrapper = mountDock([round])
    await nextTick()
    // 轮以 'done' 相位直接挂载（不是从 running 过渡来），坞不会自动弹开——手动展开才看得到 headLabel。
    await wrapper.find('.tds-dock__bar').trigger('click')
    await flushPromises()
    await nextTick()

    const label = wrapper.find('.tds-dock__label').text()
    expect(label).toContain('全轮 720,000 tokens')
    expect(label).toContain('全轮缓存读 560,000')
    expect(label).toContain('全轮输入缓存命中 80%')
    expect(label).toContain('统筹热命中 90%（4 次）')
  })

  // 收起态信息条（2026-07-07 用户拍板·二验澄清「只在运行时」）：运行中哪怕手动收起也要能感知它在跑——
  // 收起条加宽显示 headLabel（轮数/运行中/耗时）；非运行时（done/无轮）收起保持极细绿线、不显示文字。
  it('收起态：运行中手动收起后收起条显示 headLabel；非运行时收起条不带信息', async () => {
    const wrapper = mountDock([makeRound('live_r7', true, 'running')])
    await nextTick()
    // 运行中自动弹开 → 手动收起（点抽屉底边）
    await wrapper.find('.tds-dock__edge').trigger('click')

    const bar = wrapper.find('.tds-dock__bar')
    expect(bar.classes()).toContain('tds-dock__bar--info')
    expect(bar.classes()).toContain('is-running')
    const label = bar.find('.tds-dock__label').text()
    expect(label).toContain('第 1/1 轮')
    expect(label).toContain('运行中')

    // 跑完（done 自动收起）→ 回到极细绿线，无文字
    await wrapper.setProps({ rounds: [makeRound('live_r7', true, 'done')] })
    await nextTick()
    const doneBar = wrapper.find('.tds-dock__bar')
    expect(doneBar.classes()).not.toContain('tds-dock__bar--info')
    expect(doneBar.find('.tds-dock__label').exists()).toBe(false)

    // 无轮记录同样是细线常驻入口
    const empty = mountDock([])
    expect(empty.find('.tds-dock__bar').exists()).toBe(true)
    expect(empty.find('.tds-dock__bar .tds-dock__label').exists()).toBe(false)
  })

  it('缓存命中为 0（非订阅桥 provider）时只显示 token 总量，不显示命中百分比', async () => {
    fetchDirectorRoundUsageTotals.mockResolvedValueOnce({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      callCount: 1,
      profiles: {
        directorRound: { inputTokens: 0, cacheReadTokens: 0, callCount: 0, warmInputTokens: 0, warmCacheReadTokens: 0, warmCallCount: 0 },
        postRound: { inputTokens: 0, cacheReadTokens: 0, callCount: 0, warmInputTokens: 0, warmCacheReadTokens: 0, warmCallCount: 0 }
      }
    })
    const round = makeRound('live_r6', true, 'done')
    round.usageRoundId = 'round:session_y:1'
    const wrapper = mountDock([round])
    await nextTick()
    await wrapper.find('.tds-dock__bar').trigger('click')
    await flushPromises()
    await nextTick()

    const label = wrapper.find('.tds-dock__label').text()
    expect(label).toContain('150 tokens')
    expect(label).not.toContain('缓存命中')
  })
})

// 绘舆确认卡「在地图上看草案」入口（地图草案剪影可视化计划批3·2026-07-12）：
// ① 带 sketches 时按钮出现，点击弹窗透传 sessionId=poolSessionId+draftSketches；
// ② 弹窗提交决策 → 序列化 JSON 走同一条 resume 通道（handleHuiyuConfirmAnswer）、弹窗自动关闭；
// ③ 无 sketches 时按钮不渲染（现状不变）。
describe('TidiaoDirectorDock 绘舆确认卡「在地图上看草案」（批3）', () => {
  const basePending = (sessionId, sketches) => ({
    request: { kind: 'choice', title: '拟画玄岳山，请确认', options: [{ label: '确认，落笔' }], allowOtherInput: true, source: { agent: 'huiyu', toolName: 'dispatchMapWork' } },
    sessionId,
    ...(sketches ? { sketches, worldId: 'world_1' } : {}),
    redispatch: { task: '造图', instructions: '画一条山脉玄岳山', stage: 'terrain', kind: 'draftConfirm', nextStep: 'draw', candidates: [], anchorMessageId: 0 }
  })
  const sketchItem = { id: 'sk-1', action: 'add', kind: 'region', category: 'mountain', label: '玄岳山', sketch: { center: [0, 0], rx: 100, ry: 100 }, confidence: 'ready', card: { change: '新增山脉' } }

  afterEach(() => {
    clearHuiyuStageConfirmPending()
    registerHuiyuStageConfirmResumeHandler(null)
  })

  it('带 sketches：按钮出现，点击打开地图弹窗并透传 sessionId=poolSessionId+draftSketches', async () => {
    setHuiyuStageConfirmPending(basePending('session_1', [sketchItem]))
    const wrapper = mountDock([], { poolSessionId: 'session_1' })
    await nextTick()

    const btn = wrapper.find('.tds-dock__huiyu-confirm-map-btn')
    expect(btn.exists()).toBe(true)
    const dock = wrapper.get('.agent-interaction-dock')
    expect(dock.element.previousElementSibling).toBe(wrapper.get('.tds-dock__content').element)
    expect(dock.element.nextElementSibling?.classList.contains('tds-dock__edge')).toBe(true)
    expect(wrapper.get('.tds-dock__content').find('.tds-dock__huiyu-confirm').exists()).toBe(false)
    expect(wrapper.find('.stub-map-viewer').exists()).toBe(false)

    await btn.trigger('click')
    const dialog = wrapper.find('.stub-map-viewer')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-session-id')).toBe('session_1')
    expect(dialog.attributes('data-sketch-count')).toBe('1')
  })

  it('弹窗提交决策 → 序列化 JSON 走 resume 通道、弹窗自动关闭', async () => {
    setHuiyuStageConfirmPending(basePending('session_1', [sketchItem]))
    const handled = []
    registerHuiyuStageConfirmResumeHandler(async (pending, answer) => { handled.push({ pending, answer }) })
    const wrapper = mountDock([], { poolSessionId: 'session_1' })
    await nextTick()

    await wrapper.find('.tds-dock__huiyu-confirm-map-btn').trigger('click')
    await wrapper.find('.stub-submit').trigger('click')
    await flushPromises()

    expect(handled).toHaveLength(1)
    expect(handled[0].answer.status).toBe('answered')
    expect(JSON.parse(handled[0].answer.answer)).toEqual({ kind: 'huiyu-sketch-decision', accepted: ['sk-1'], rejected: [], comments: {} })
    // resume 内部先清 pending → huiyuConfirmPending 变 null → 整块（含地图弹窗）随之收起
    expect(wrapper.find('.stub-map-viewer').exists()).toBe(false)
    expect(wrapper.find('.tds-dock__huiyu-confirm').exists()).toBe(false)
  })

  it('无 sketches：按钮不渲染，现状不变', async () => {
    setHuiyuStageConfirmPending(basePending('session_1', undefined))
    const wrapper = mountDock([], { poolSessionId: 'session_1' })
    await nextTick()

    expect(wrapper.find('.tds-dock__huiyu-confirm').exists()).toBe(true)
    expect(wrapper.find('.tds-dock__huiyu-confirm-map-btn').exists()).toBe(false)
  })

  // IME 回车守卫全站收敛（修复批次H）：「其他想法」输入框合成中的回车不应提前提交答复。
  it('IME 合成中的回车（isComposing / keyCode 229）不提交其他想法，普通回车正常提交', async () => {
    setHuiyuStageConfirmPending(basePending('session_1', undefined))
    const handled = []
    registerHuiyuStageConfirmResumeHandler(async (pending, answer) => { handled.push(answer) })
    const wrapper = mountDock([], { poolSessionId: 'session_1' })
    await nextTick()

    const input = wrapper.find('.tds-dock__huiyu-confirm-input')
    await input.setValue('正在打拼音')

    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()
    expect(handled).toHaveLength(0)

    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    await flushPromises()
    expect(handled).toHaveLength(0)

    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(handled).toHaveLength(1)
    expect(handled[0]).toEqual({ status: 'answered', answer: '正在打拼音' })
  })
})
