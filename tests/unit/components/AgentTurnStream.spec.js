/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentTurnStream from '../../../src/components/app/AgentTurnStream.vue'

describe('AgentTurnStream · 对话信息流权威组件', () => {
  const entries = [
    { kind: 'turn', label: '第 1 轮', at: 1, durationMs: 100 },
    { kind: 'tool', label: '模型思考', status: 'success', at: 2, durationMs: 80 }
  ]

  it('实时尾流与历史内联流复用同一行渲染器', () => {
    const live = mount(AgentTurnStream, { props: { entries, running: true } })
    const inline = mount(AgentTurnStream, { props: { entries, placement: 'inline' } })

    expect(live.findComponent({ name: 'SubagentTimelineList' }).exists()).toBe(true)
    expect(live.text()).toContain('模型思考')
    expect(inline.classes()).toContain('agent-turn-stream--inline')
    expect(inline.text()).toBe(live.text())
  })
})
