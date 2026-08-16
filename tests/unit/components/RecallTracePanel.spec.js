/**
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RecallTracePanel from '../../../src/components/app/chat/RecallTracePanel.vue'
import { setCurrentRecallActivity } from '../../../src/app/recallTraceState.ts'

function buildActivity() {
  return {
    id: 'recall_run_1',
    characterName: '惊雨',
    status: 'completed',
    startedAt: '2026-05-06T10:00:00.000Z',
    completedAt: '2026-05-06T10:00:05.000Z',
    events: [
      {
        id: 'event_recent_context',
        runId: 'recall_run_1',
        stepKey: 'recent_context',
        stepLabel: '收集最近三轮上下文',
        status: 'started',
        startedAt: '2026-05-06T10:00:00.000Z'
      },
      {
        id: 'event_recent_context',
        runId: 'recall_run_1',
        stepKey: 'recent_context',
        stepLabel: '收集最近三轮上下文',
        status: 'completed',
        startedAt: '2026-05-06T10:00:00.000Z',
        completedAt: '2026-05-06T10:00:00.000Z',
        durationMs: 0
      },
      {
        id: 'event_merge',
        runId: 'recall_run_1',
        stepKey: 'candidate_merge',
        stepLabel: '合并候选分数',
        status: 'completed',
        startedAt: '2026-05-06T10:00:01.000Z',
        completedAt: '2026-05-06T10:00:02.000Z',
        durationMs: 1000,
        output: {
          scores: [{
            id: 'unit_intro',
            title: '简介',
            ruleMatchScore: 0.3,
            embeddingIntentScore: 0.4,
            temporalRuleScore: 0.1,
            relationRuleScore: 0.2,
            structurePriorityScore: 0.05,
            baselineRecallBoost: 0.12,
            candidateBaseScore: 0.67
          }]
        }
      },
      {
        id: 'event_judge',
        runId: 'recall_run_1',
        stepKey: 'loop_1_llm_judgment_1',
        stepLabel: '第 1 轮候选裁判 1',
        status: 'completed',
        startedAt: '2026-05-06T10:00:02.000Z',
        completedAt: '2026-05-06T10:00:03.000Z',
        durationMs: 1000,
        metrics: {
          model: 'deepseek-v4-flash',
          presetName: '__langhuan_managed_preset__'
        },
        input: {
          candidateRefs: [{ id: 'unit_intro', title: '简介' }]
        },
        output: {
          judgments: [{
            id: 'unit_intro',
            includeScoreBefore: 0.67,
            includeScoreDelta: 0,
            includeScoreAfter: 0.67,
            expandScoreBefore: 0.22,
            expandScoreDelta: 0.06,
            expandScoreAfter: 0.28,
            evidenceReasonCodes: ['role_profile'],
            confidence: 0.82
          }]
        }
      }
    ],
    result: {
      compressedContext: '',
      intentSnapshot: {},
      confirmedIds: ['unit_intro'],
      readDecisions: {},
      roundsCompleted: 1,
      rounds: []
    }
  }
}

describe('RecallTracePanel', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setCurrentRecallActivity(null)
  })

  it('默认进入本地详情面板，可切回简化处理过程', async () => {
    setCurrentRecallActivity(buildActivity())

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })

    // 本地工作区默认展示详情（含原始数据），按钮文案为「过程」。
    expect(wrapper.text()).toContain('原始数据')
    expect(wrapper.find('.recall-activity-panel__mode-button').text()).toBe('过程')

    // 切回处理过程后只展示面向用户的可读步骤。
    await wrapper.find('.recall-activity-panel__mode-button').trigger('click')
    const text = wrapper.text()
    expect(text).toContain('处理过程')
    expect(text).toContain('我先把刚才的话接稳')
    expect(text).toContain('耗时 1s')
    expect(text).not.toContain('管理员')
    expect(text).not.toContain('总 Token')
    expect(text).not.toContain('原始数据')
  })

  it('切回处理过程后按最小展示时间逐步显示第一人称公开里程碑', async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    setCurrentRecallActivity({
      ...buildActivity(),
      id: 'recall_run_running',
      status: 'running',
      completedAt: undefined
    })

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })
    await wrapper.find('.recall-activity-panel__mode-button').trigger('click')

    expect(wrapper.text()).toContain('我先把刚才的话接稳')
    expect(wrapper.text()).toContain('我挑挑哪些线索真的贴题')
    await vi.advanceTimersByTimeAsync(3000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('我把重叠的线索并成一束')
    expect(wrapper.text()).toContain('我逐批挑一遍，贴题的留下，牵强的先挡在外面。')
    randomSpy.mockRestore()
  })

  it('处理过程面板参考区使用三栏并支持展开预览和自适应高度', async () => {
    setCurrentRecallActivity({
      ...buildActivity(),
      events: [
        ...buildActivity().events,
        {
          id: 'event_confirmed_read',
          runId: 'recall_run_1',
          stepKey: 'confirmed_content_read',
          stepLabel: '确认区读取',
          status: 'completed',
          startedAt: '2026-05-06T10:00:04.000Z',
          completedAt: '2026-05-06T10:00:05.000Z',
          durationMs: 1000,
          output: {
            confirmed: [
              { id: 'unit_1', title: '单位一', summary: '单位一摘要' },
              { id: 'unit_2', title: '单位二' },
              { id: 'unit_3', title: '单位三' },
              { id: 'unit_4', title: '单位四' },
              { id: 'unit_5', title: '单位五' }
            ]
          }
        }
      ],
      result: {
        ...buildActivity().result,
        confirmedIds: ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5']
      }
    })

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })
    await wrapper.find('.recall-activity-panel__mode-button').trigger('click')

    const confirmedPanel = wrapper.find('.recall-activity-panel__confirmed--public')
    expect(confirmedPanel.attributes('style')).toContain('height: 105px')
    expect(wrapper.find('.recall-activity-panel__unit-list--public').exists()).toBe(true)

    await wrapper.find('.recall-activity-panel__unit-item > button').trigger('click')
    expect(wrapper.text()).toContain('单位一摘要')

    const splitter = wrapper.find('.recall-activity-panel__splitter')
    splitter.element.dispatchEvent(new MouseEvent('pointerdown', { clientY: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 40 }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 40 }))
    await wrapper.vm.$nextTick()
    expect(confirmedPanel.attributes('style')).toContain('height: 145px')
  })

  it('本地详情面板把召回事件里的分数和裁判结果解析成易读内容', async () => {
    setCurrentRecallActivity(buildActivity())

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })

    const text = wrapper.text()
    const tableRows = wrapper.findAll('.recall-activity-event__table tbody tr').map((row) => row.text())
    expect(text).toContain('合并候选分数')
    expect(text).toContain('候选直入分展开分规则直入规则展开词命中底层原始余弦嵌入分')
    expect(tableRows).toContain('简介----0.30.12-0.4')
    expect(text).toContain('模型判定')
    expect(text).toContain('候选直入分修正展开分修正')
    expect(tableRows).toContain('简介0.67 +0 = 0.670.22 +0.06 = 0.280.82role_profile')
    expect(text).not.toContain('completed · 0ms')
    const contextEvents = wrapper.findAll('.recall-activity-event').filter((node) => node.text().includes('收集最近三轮上下文'))
    expect(contextEvents).toHaveLength(1)
    expect(contextEvents[0].find('.recall-activity-event__head').text()).not.toContain('completed')
    expect(contextEvents[0].find('.recall-activity-event__head').text()).not.toContain('started')
    expect(text).toContain('原始数据')
    expect(text).not.toContain('完整产物')
  })

  it('本地详情面板的 pending 判别摘要把提升视为本步骤确认，不显示未选中', async () => {
    setCurrentRecallActivity({
      ...buildActivity(),
      events: [
        ...buildActivity().events,
        {
          id: 'event_pending_judgment',
          runId: 'recall_run_1',
          stepKey: 'loop_1_pending_judgment_2',
          stepLabel: '第 1 轮 pending 判别 2',
          status: 'completed',
          startedAt: '2026-05-06T10:00:04.000Z',
          completedAt: '2026-05-06T10:00:05.000Z',
          durationMs: 1000,
          input: {
            candidateRefs: [
              { id: 'unit_world', title: '世界观' },
              { id: 'unit_ability', title: '能力' }
            ]
          },
          output: {
            judgments: [
              { id: 'unit_world', decision: 'promote', confidence: 0.82 },
              { id: 'unit_ability', decision: 'reject', confidence: 0.82 }
            ]
          }
        }
      ]
    })

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })

    const pendingEvent = wrapper.findAll('.recall-activity-event')
      .find((node) => node.text().includes('第 1 轮 pending 判别 2'))

    expect(pendingEvent?.text()).toContain('确认：世界观')
    expect(pendingEvent?.text()).not.toContain('确认：未选中')
  })

  it('最终确认单位高度按本次单位数自适应，不读取或写入本机持久偏好', async () => {
    window.localStorage.setItem('langhuan_recall_confirmed_panel_height', '420')
    const setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem')

    setCurrentRecallActivity({
      ...buildActivity(),
      events: [
        ...buildActivity().events,
        {
          id: 'event_confirmed_read',
          runId: 'recall_run_1',
          stepKey: 'confirmed_content_read',
          stepLabel: '确认区读取',
          status: 'completed',
          startedAt: '2026-05-06T10:00:04.000Z',
          completedAt: '2026-05-06T10:00:05.000Z',
          durationMs: 1000,
          output: {
            confirmed: [
              { id: 'unit_1', title: '单位一' },
              { id: 'unit_2', title: '单位二' },
              { id: 'unit_3', title: '单位三' },
              { id: 'unit_4', title: '单位四' },
              { id: 'unit_5', title: '单位五' }
            ]
          }
        }
      ],
      result: {
        ...buildActivity().result,
        confirmedIds: ['unit_1', 'unit_2', 'unit_3', 'unit_4', 'unit_5']
      }
    })

    const wrapper = mount(RecallTracePanel, {
      props: {
        thinkingSpeakerName: '惊雨',
        canUseDetailPanel: true
      }
    })

    const confirmedPanel = wrapper.find('.recall-activity-panel__confirmed')
    expect(confirmedPanel.attributes('style')).toContain('height: 105px')

    const splitter = wrapper.find('.recall-activity-panel__splitter')
    splitter.element.dispatchEvent(new MouseEvent('pointerdown', { clientY: 0, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 50 }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 50 }))
    await wrapper.vm.$nextTick()

    expect(setItemSpy).not.toHaveBeenCalledWith('langhuan_recall_confirmed_panel_height', expect.any(String))
    setItemSpy.mockRestore()
  })
})
