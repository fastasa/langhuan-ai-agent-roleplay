import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER,
  TASK_SYSTEM_CONTEXT_PLACEHOLDER,
  resolveDynamicPromptMessages
} from '../../../src/utils/promptContext.ts'
import { fetchEventStackToday } from '../../../src/repositories/metaRepository.ts'

vi.mock('../../../src/repositories/metaRepository.ts', () => ({
  fetchEventStackToday: vi.fn()
}))

describe('promptContext', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('发送事栈给 AI 时按天合并票据记录，不逐条展开票据流水', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T08:00:00+08:00'))

    fetchEventStackToday.mockImplementation(async (date) => {
      if (date === '2026-04-11') {
        return {
          date,
          events: [
            {
              id: 'event_ticket_exchange_1',
              date,
              taskName: '兑换游戏票',
              taskType: 'resource',
              notes: '兑换 1 张「游戏票」，消耗 10 点数',
              ticketsExchanged: { 游戏票: 1 },
              pointsDelta: -10
            },
            {
              id: 'event_ticket_use_1',
              date,
              taskName: '使用游戏票',
              taskType: 'resource',
              notes: '消耗 2 张「游戏票」',
              ticketsUsed: { 游戏票: 2 }
            }
          ],
          summary: {
            totalPoints: -10,
            totalMoney: 0,
            ticketChanges: { 游戏票: { exchanged: 1, used: 2 } }
          }
        }
      }
      return {
        date,
        events: [],
        summary: { totalPoints: 0, totalMoney: 0, ticketChanges: {} }
      }
    })

    const messages = await resolveDynamicPromptMessages([
      { role: 'system', content: EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER }
    ])

    const content = messages[0].content
    expect(content).toContain('票据记录：日期=2026-04-11；兑换：游戏票=1张；使用：游戏票=2张')
    expect(content).toContain('除票据汇总外，这一天没有其他事栈记录。')
    expect(content).not.toContain('兑换 1 张「游戏票」，消耗 10 点数')
    expect(content).not.toContain('消耗 2 张「游戏票」')
    expect(content).not.toContain('记录 1')
  })

  it('动态上下文占位符被说明文字包裹时，也会在原位置替换', async () => {
    fetchEventStackToday.mockResolvedValue({
      date: '2026-04-11',
      events: [],
      summary: { totalPoints: 0, totalMoney: 0, ticketChanges: {} }
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: 'task_1', title: '写测试', status: 'active', orderIndex: 1 }
      ]
    })))

    const messages = await resolveDynamicPromptMessages([
      {
        role: 'system',
        content: [
          '以下为用户的任务详情，内含时间轴：',
          `<task_system_context>${TASK_SYSTEM_CONTEXT_PLACEHOLDER}</task_system_context>`
        ].join('\n')
      },
      {
        role: 'system',
        content: [
          '以下为用户今日、昨日、前日的票据、点数、任务情况：',
          `<event_stack_recent_context>${EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER}</event_stack_recent_context>`
        ].join('\n')
      }
    ])

    expect(messages[0].content).toContain('以下为用户的任务详情，内含时间轴：')
    expect(messages[0].content).toContain('<task_system_context>任务系统信息：共 1 个任务。')
    expect(messages[0].content).toContain('标题：写测试')
    expect(messages[0].content).toContain('</task_system_context>')
    expect(messages[1].content).toContain('以下为用户今日、昨日、前日的票据、点数、任务情况：')
    expect(messages[1].content).toContain('<event_stack_recent_context>事栈信息：包含今天、昨天、前天的全部记录。')
    expect(messages[1].content).toContain('</event_stack_recent_context>')
  })

  it('某一天事栈读取失败时，仍保留其他日期的事栈内容', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-14T08:00:00+08:00'))

    fetchEventStackToday.mockImplementation(async (date) => {
      if (date === '2026-04-14') {
        throw new Error('加载事栈失败：返回内容不是有效 JSON')
      }
      return {
        date,
        events: [{
          id: `event_${date}`,
          date,
          taskName: `${date} 的记录`,
          taskType: 'daily',
          pointsDelta: 1
        }],
        summary: { totalPoints: 1, totalMoney: 0, ticketChanges: {} }
      }
    })

    const messages = await resolveDynamicPromptMessages([
      { role: 'system', content: EVENT_STACK_RECENT_CONTEXT_PLACEHOLDER }
    ])

    const content = messages[0].content
    expect(content).toContain('今天（2026-04-14）')
    expect(content).toContain('这一天的事栈读取失败：加载事栈失败：返回内容不是有效 JSON')
    expect(content).toContain('昨天（2026-04-13）')
    expect(content).toContain('名称：2026-04-13 的记录')
    expect(content).toContain('前天（2026-04-12）')
    expect(content).toContain('名称：2026-04-12 的记录')
  })
})
