import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PtwQuizPanel from '../../../src/components/app/modals/character/personalityTraining/PtwQuizPanel.vue'

function makeGroups(count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    id: `question-${index + 1}`,
    question: `情境 ${index + 1}`,
    dimension: index < 3 ? '维度一' : '维度二',
    difficulty: 'medium',
    candidates: ['A', 'B', 'C'].map((label, candidateIndex) => ({
      id: `question-${index + 1}-${label}`,
      label,
      text: `选项 ${index + 1}-${candidateIndex + 1}`
    })),
    presetAnswerId: `question-${index + 1}-B`
  }))
}

describe('PtwQuizPanel', () => {
  it('问卷数据刷新时按题目 id 保留当前位置，不回到第 1 题', async () => {
    const groups = makeGroups()
    const wrapper = mount(PtwQuizPanel, {
      props: { groups, answers: {} }
    })

    const nextButton = wrapper.findAll('.ptw-quiz__act-btn')[1]
    await nextButton.trigger('click')
    await nextButton.trigger('click')
    expect(wrapper.find('.ptw-quiz__meta').text()).toContain('第 3 / 6 题')

    await wrapper.setProps({
      groups: groups.map((group) => ({
        ...group,
        candidates: group.candidates.map((candidate) => ({ ...candidate }))
      }))
    })

    expect(wrapper.find('.ptw-quiz__meta').text()).toContain('第 3 / 6 题')
    expect(wrapper.find('.ptw-quiz__scene-text').text()).toBe('情境 3')
  })

  it('快速跳题同时标明人工、预设和当前题', async () => {
    const groups = makeGroups()
    const wrapper = mount(PtwQuizPanel, {
      props: {
        groups,
        answers: {
          'question-1': { candidateId: 'question-1-C', reviewState: 'confirmed' }
        }
      }
    })

    await wrapper.find('.ptw-quiz__jump-toggle').trigger('click')

    const jumpNumbers = wrapper.findAll('.ptw-quiz__jump-number')
    expect(jumpNumbers[0].classes()).toContain('ptw-quiz__jump-number--confirmed')
    expect(jumpNumbers[1].classes()).toContain('ptw-quiz__jump-number--preset')
    expect(jumpNumbers[1].classes()).toContain('ptw-quiz__jump-number--current')

    await wrapper.find('.ptw-quiz__jump-input').setValue('5')
    await wrapper.find('.ptw-quiz__jump-form').trigger('submit')

    expect(wrapper.find('.ptw-quiz__meta').text()).toContain('第 5 / 6 题')
    expect(wrapper.find('.ptw-quiz__scene-text').text()).toBe('情境 5')
    expect(wrapper.find('.ptw-quiz__jump-panel').exists()).toBe(false)
  })

  it('旧问卷保留 40 道人工答案并追加到 60 题后，从第 3 轮第 1 题继续显示', () => {
    const groups = makeGroups(60)
    const answers = Object.fromEntries(groups.slice(0, 40).map((group) => ([
      group.id,
      { candidateId: group.candidates[0].id, reviewState: 'confirmed' }
    ])))
    const wrapper = mount(PtwQuizPanel, {
      props: {
        groups,
        answers,
        showThreshold: true
      }
    })

    expect(wrapper.find('.ptw-quiz__meta').text()).toContain('第 3 轮 · 本轮 1 / 20 题')
    expect(wrapper.find('.ptw-quiz__scene-text').text()).toBe('情境 41')
    expect(wrapper.findAll('.ptw-quiz__plan')).toHaveLength(3)
  })

  it('冻结评测题人工选定后只显示一个标准答案，不再保留预设待选', async () => {
    const wrapper = mount(PtwQuizPanel, {
      props: {
        groups: makeGroups(1),
        answers: {},
        standardAnswerMode: true
      }
    })

    const candidates = wrapper.findAll('.ptw-quiz__plan')
    expect(candidates[1].classes()).toContain('ptw-quiz__plan--preset')
    expect(candidates[1].text()).toContain('预设待选')

    await candidates[1].trigger('click')

    expect(candidates[1].classes()).toContain('ptw-quiz__plan--picked')
    expect(candidates[1].classes()).not.toContain('ptw-quiz__plan--preset')
    expect(candidates[1].text()).toContain('标准答案')
    expect(candidates[1].text()).not.toContain('预设待选')

    await candidates[2].trigger('click')

    expect(candidates[2].classes()).toContain('ptw-quiz__plan--picked')
    expect(candidates[2].text()).toContain('标准答案')
    expect(candidates[1].classes()).not.toContain('ptw-quiz__plan--preset')
    expect(candidates[1].text()).not.toContain('预设待选')
    expect(wrapper.emitted('pick')).toEqual([
      ['question-1', 'question-1-B'],
      ['question-1', 'question-1-C']
    ])
  })
})
