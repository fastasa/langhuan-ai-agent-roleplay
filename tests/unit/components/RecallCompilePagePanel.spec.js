import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RecallCompilePagePanel from '../../../src/components/recall/RecallCompilePagePanel.vue'

function createCompilePage(overrides = {}) {
  return {
    summary: '摘要',
    tags: ['组织'],
    relationHints: ['[[镜庭主城]]'],
    ...overrides
  }
}

describe('RecallCompilePagePanel', () => {
  it('renders semantic type as controlled read-only metadata', () => {
    const wrapper = mount(RecallCompilePagePanel, {
      props: {
        modelValue: createCompilePage(),
        showSemanticType: true,
        semanticType: 'organization'
      }
    })

    expect(wrapper.text()).toContain('单位类型')
    expect(wrapper.text()).toContain('组织')
    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('emits only enum semantic type values from the selector', async () => {
    const wrapper = mount(RecallCompilePagePanel, {
      props: {
        modelValue: createCompilePage(),
        showSemanticType: true,
        editable: true,
        semanticType: 'other'
      }
    })

    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    await select.setValue('organization')

    expect(wrapper.emitted('update:semanticType')?.[0]).toEqual(['organization'])
  })

  it('renders and emits editable recall score fields', async () => {
    const wrapper = mount(RecallCompilePagePanel, {
      props: {
        modelValue: createCompilePage({
          scoreDirectBase: 45,
          scoreExpandBase: 30,
          scoreSelfAnchor: 45,
          scoreUserAnchor: 25,
          scoreOtherAnchor: 18
        }),
        editable: true
      }
    })

    expect(wrapper.text()).toContain('召回分数')
    expect(wrapper.text()).toContain('直入基础')
    expect(wrapper.text()).toContain('自我锚定')

    const directInput = wrapper.findAll('input[type="number"]').at(0)
    await directInput.setValue('58')

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      scoreDirectBase: 58,
      scoreExpandBase: 30,
      scoreSelfAnchor: 45,
      scoreUserAnchor: 25,
      scoreOtherAnchor: 18
    })
  })

  it('renders relation hint validation rows with source line and predicate labels', () => {
    const wrapper = mount(RecallCompilePagePanel, {
      props: {
        modelValue: createCompilePage({
          relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]']
        }),
        relationValidationItems: [
          {
            id: 'valid-1',
            status: 'valid',
            message: '声明关系已通过校验，保存后直接进入关系读模型。',
            sourceTitle: '尤拉西亚洲',
            targetTitle: '长白山山脉',
            predicateLabel: '包含',
            surfacePredicate: '属于',
            line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
            lineIndex: 0
          },
          {
            id: 'warning-1',
            status: 'warning',
            code: 'relation_hint_invalid_predicate',
            message: '关系提示使用了未登记谓词：用户词',
            sourceTitle: '长白山山脉',
            targetTitle: '尤拉西亚洲',
            surfacePredicate: '用户词',
            line: '[[长白山山脉]]_用户词_[[尤拉西亚洲]]',
            lineIndex: 1
          }
        ]
      }
    })

    expect(wrapper.text()).toContain('关系校验')
    expect(wrapper.text()).toContain('1 条通过 / 1 条提醒')
    expect(wrapper.text()).toContain('尤拉西亚洲 - 包含 - 长白山山脉')
    expect(wrapper.text()).toContain('表层：属于')
    expect(wrapper.text()).toContain('第 2 行')
    expect(wrapper.text()).toContain('[[长白山山脉]]_用户词_[[尤拉西亚洲]]')
  })

  it('selects the source relation hint line from validation locate action', async () => {
    const wrapper = mount(RecallCompilePagePanel, {
      props: {
        modelValue: createCompilePage({
          relationHints: [
            '[[镜庭主城]]',
            '[[长白山山脉]]_用户词_[[尤拉西亚洲]]'
          ]
        }),
        editable: true,
        relationValidationItems: [
          {
            id: 'warning-1',
            status: 'warning',
            code: 'relation_hint_invalid_predicate',
            message: '关系提示使用了未登记谓词：用户词',
            sourceTitle: '长白山山脉',
            targetTitle: '尤拉西亚洲',
            surfacePredicate: '用户词',
            line: '[[长白山山脉]]_用户词_[[尤拉西亚洲]]',
            lineIndex: 1
          }
        ]
      }
    })

    const textarea = wrapper.findAll('textarea').at(1).element
    const locateButton = wrapper.find('.recall-compile-panel__locate')
    await locateButton.trigger('click')

    const expectedStart = '[[镜庭主城]]\n'.length
    expect(textarea.selectionStart).toBe(expectedStart)
    expect(textarea.selectionEnd).toBe(expectedStart + '[[长白山山脉]]_用户词_[[尤拉西亚洲]]'.length)
  })
})
