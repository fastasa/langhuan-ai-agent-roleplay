/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RecallCompilePageConflictDialog from '../../../src/components/recall/RecallCompilePageConflictDialog.vue'

function createCompilePage(overrides = {}) {
  return {
    summary: '长白山山脉摘要',
    tags: ['地理', '山脉'],
    relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]'],
    ...overrides
  }
}

function mountDialog(props = {}) {
  return mount(RecallCompilePageConflictDialog, {
    props: {
      open: true,
      modelValue: createCompilePage(),
      semanticType: 'terrain',
      relationValidationItems: [],
      unitTitle: '长白山山脉',
      unitPath: '/世界树/亚什基诺/地理/长白山山脉',
      ...props
    }
  })
}

function bodyText() {
  return document.body.textContent || ''
}

describe('RecallCompilePageConflictDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders compact normal state when relation hints have no warnings', () => {
    mountDialog()

    expect(bodyText()).toContain('公共编译页')
    expect(bodyText()).toContain('正常，1 条可用')
    expect(bodyText()).toContain('当前关系提示没有发现需要处理的问题。')
    expect(bodyText()).not.toContain('个问题')
    expect(bodyText()).not.toContain('定位')
  })

  it('renders empty relation state without an issue panel', () => {
    mountDialog({
      modelValue: createCompilePage({ relationHints: [] })
    })

    expect(bodyText()).toContain('未填写')
    expect(bodyText()).toContain('这里还没有关系提示，可以先新增一条。')
    expect(bodyText()).not.toContain('阻断')
  })

  it('shows warning details and applies a safe suggested relation text', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: ['[[长白山山脉]]_用户词_[[尤拉西亚洲]]']
      }),
      relationValidationItems: [
        {
          id: 'warning-1',
          status: 'warning',
          code: 'relation_hint_invalid_predicate',
          message: '关系提示使用了未登记谓词：用户词',
          surfacePredicate: '用户词',
          line: '[[长白山山脉]]_用户词_[[尤拉西亚洲]]',
          lineIndex: 0
        }
      ]
    })

    expect(bodyText()).toContain('1 条提醒')
    expect(bodyText()).toContain('谓词非法')
    expect(bodyText()).toContain('关系的关系词不在合法词典里')

    const applyButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('采用建议'))
    expect(applyButton).toBeTruthy()
    applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      relationHints: ['[[长白山山脉]]_关联_[[尤拉西亚洲]]']
    })
  })

  it('emits updated relation hints when deleting a duplicate line', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: [
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]'
        ]
      }),
      relationValidationItems: [
        {
          id: 'warning-duplicate',
          status: 'warning',
          code: 'relation_hint_duplicate_relation',
          message: '关系提示归一后与已有关系重复，已跳过重复声明。',
          sourceTitle: '尤拉西亚洲',
          targetTitle: '长白山山脉',
          predicateId: 'predicate:structure:contains',
          predicateLabel: '包含',
          surfacePredicate: '属于',
          line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          lineIndex: 1
        }
      ]
    })

    const deleteButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('删除本行'))
    expect(deleteButton).toBeTruthy()
    deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      relationHints: ['[[长白山山脉]]_属于_[[尤拉西亚洲]]']
    })
  })

  it('deletes the warning duplicate line instead of the first related valid line', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: [
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          '[[长白山山脉]]_邻近_[[贝尔卡德山脉]]'
        ]
      }),
      relationValidationItems: [
        {
          id: 'valid-original',
          status: 'valid',
          message: '声明关系已通过校验，保存后直接进入关系读模型。',
          sourceTitle: '尤拉西亚洲',
          targetTitle: '长白山山脉',
          predicateId: 'predicate:structure:contains',
          predicateLabel: '包含',
          surfacePredicate: '属于',
          line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          lineIndex: 0
        },
        {
          id: 'warning-duplicate',
          status: 'warning',
          code: 'relation_hint_duplicate_relation',
          message: '关系提示归一后与已有关系重复，已跳过重复声明。',
          sourceTitle: '尤拉西亚洲',
          targetTitle: '长白山山脉',
          predicateId: 'predicate:structure:contains',
          predicateLabel: '包含',
          surfacePredicate: '属于',
          line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          lineIndex: 1
        }
      ]
    })

    const deleteButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('删除本行'))
    expect(deleteButton).toBeTruthy()
    deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      relationHints: [
        '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
        '[[长白山山脉]]_邻近_[[贝尔卡德山脉]]'
      ]
    })
  })

  it('shows duplicate evidence as compact editable rows', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: [
          '[[河流水系]]_包含_[[伊森弗鲁斯河]]',
          '[[河流水系]]_影响_[[赫兹塔尔盆地]]',
          '[[河流水系]]_包含_[[伊森弗鲁斯河]]'
        ]
      }),
      relationValidationItems: [
        {
          id: 'warning-duplicate-lines',
          status: 'warning',
          code: 'relation_hint_duplicate_relation',
          message: '关系提示归一后与已有关系重复，已跳过重复声明。',
          sourceTitle: '河流水系',
          targetTitle: '伊森弗鲁斯河',
          predicateId: 'predicate:structure:contains',
          predicateLabel: '包含',
          surfacePredicate: '包含',
          line: '[[河流水系]]_包含_[[伊森弗鲁斯河]]',
          lineIndex: 2,
          duplicateEvidence: [
            {
              ownerUnitId: 'doc:doc_region',
              ownerTitle: '地理与区域',
              ownerPath: '/亚什基诺/长白山山脉/地理与区域',
              line: '[[地理与区域@doc_region]]_包含_[[伊森弗鲁斯河@doc_river]]',
              lineIndex: 0
            }
          ]
        }
      ]
    })

    expect(bodyText()).toContain('归一关系')
    expect(bodyText()).toContain('河流水系 / 包含 / 伊森弗鲁斯河')
    expect(bodyText()).toContain('地理与区域')
    expect(bodyText()).toContain('第 1 行')
    expect(bodyText()).toContain('/亚什基诺/长白山山脉/地理与区域')
    expect(bodyText()).toContain('[[地理与区域@doc_region]]_包含_[[伊森弗鲁斯河@doc_river]]')
    expect(bodyText()).not.toContain('当前重复行：第 3 行')
    expect(bodyText()).not.toContain('保留一条最可信')
    expect(bodyText()).not.toContain('多余的重复行')
    expect(bodyText()).not.toContain('如果两行表达')

    const duplicateButtons = Array.from(document.body.querySelectorAll('.compile-dialog__duplicate-line button'))
    const editButton = duplicateButtons.find((button) => button.textContent?.includes('编辑'))
    const deleteButton = duplicateButtons.find((button) => button.textContent?.includes('删除'))
    expect(editButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()

    editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('edit-duplicate-relation-hint')?.[0]?.[0]).toMatchObject({
      ownerUnitId: 'doc:doc_region',
      lineIndex: 0
    })
    expect(wrapper.emitted('delete-duplicate-relation-hint')?.[0]?.[0]).toMatchObject({
      ownerUnitId: 'doc:doc_region',
      lineIndex: 0
    })
  })

  it('edits relation hints in one textarea split by Chinese commas and new lines', async () => {
    const wrapper = mountDialog()
    const textarea = document.body.querySelector('.compile-dialog__relation-textarea')
    expect(textarea).toBeTruthy()

    textarea.value = '[[长白山山脉]]_属于_[[尤拉西亚洲]]，[[长白山山脉]]_影响_[[垂直气候带]]\n[[长白山山脉]]_邻近_[[贝尔卡德山脉]]'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      relationHints: [
        '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
        '[[长白山山脉]]_影响_[[垂直气候带]]',
        '[[长白山山脉]]_邻近_[[贝尔卡德山脉]]'
      ]
    })
  })

  it('completes double brackets in the relation hints textarea and keeps cursor inside', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({ relationHints: [] })
    })
    const textarea = document.body.querySelector('.compile-dialog__relation-textarea')
    expect(textarea).toBeTruthy()

    textarea.value = '[['
    textarea.setSelectionRange(2, 2)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(textarea.value).toBe('[[]]')
    expect(textarea.selectionStart).toBe(2)
    expect(textarea.selectionEnd).toBe(2)
  })

  it('shows compact exact-reference choices for duplicate relation titles', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: ['[[河流水系]]_位于_[[长白山山脉]]']
      }),
      relationReferenceCandidates: [
        {
          unitId: 'doc:doc_river_a',
          title: '河流水系',
          referenceTitle: '河流水系@doc_river_a',
          refId: 'doc_river_a',
          summary: '第一条河流水系摘要用于测试截断',
          path: '/亚什基诺/地理与区域/河流水系'
        },
        {
          unitId: 'doc:doc_river_b',
          title: '河流水系',
          referenceTitle: '河流水系@doc_river_b',
          refId: 'doc_river_b',
          summary: '第二条河流水系摘要用于测试截断',
          path: '/亚什基诺/别处/河流水系'
        }
      ]
    })
    const textarea = document.body.querySelector('.compile-dialog__relation-textarea')
    expect(textarea).toBeTruthy()

    textarea.setSelectionRange(4, 4)
    textarea.dispatchEvent(new Event('keyup', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(bodyText()).toContain('河流水系@doc_river_a')
    expect(bodyText()).toContain('第一条河流水系摘要用于测试截断')
    document.body.querySelectorAll('.compile-dialog__reference-option')[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      relationHints: ['[[河流水系@doc_river_b]]_位于_[[长白山山脉]]']
    })
  })

  it('shows duplicate relation guidance and marks an issue as reviewed temporarily', async () => {
    const wrapper = mountDialog({
      modelValue: createCompilePage({
        relationHints: [
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          '[[长白山山脉]]_属于_[[尤拉西亚洲]]'
        ]
      }),
      relationValidationItems: [
        {
          id: 'valid-1',
          status: 'valid',
          message: '声明关系已通过校验，保存后直接进入关系读模型。',
          sourceTitle: '尤拉西亚洲',
          targetTitle: '长白山山脉',
          predicateId: 'predicate:structure:contains',
          predicateLabel: '包含',
          surfacePredicate: '属于',
          line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          lineIndex: 0
        },
        {
          id: 'warning-duplicate',
          status: 'warning',
          code: 'relation_hint_duplicate_relation',
          message: '关系提示归一后与已有关系重复，已跳过重复声明。',
          sourceTitle: '尤拉西亚洲',
          targetTitle: '长白山山脉',
          predicateLabel: '包含',
          surfacePredicate: '属于',
          line: '[[长白山山脉]]_属于_[[尤拉西亚洲]]',
          lineIndex: 1
        }
      ]
    })

    expect(bodyText()).toContain('重复关系处理')
    expect(bodyText()).toContain('系统已经识别到同义重复关系，下面是已存在的重复证据。')
    expect(bodyText()).not.toContain('保留一条最可信的关系提示即可。')

    const reviewedButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('标记已查看'))
    expect(reviewedButton).toBeTruthy()
    reviewedButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(bodyText()).toContain('已查看')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })

  it('does not offer automatic fixes for unsafe missing-target issues', () => {
    mountDialog({
      modelValue: createCompilePage({
        relationHints: ['[[长白山山脉]]_位于_[[不存在区域]]']
      }),
      relationValidationItems: [
        {
          id: 'warning-missing',
          status: 'warning',
          code: 'relation_hint_target_missing',
          message: '关系提示没有匹配到当前 UnitView 标题：不存在区域',
          sourceTitle: '长白山山脉',
          targetTitle: '不存在区域',
          surfacePredicate: '位于',
          line: '[[长白山山脉]]_位于_[[不存在区域]]',
          lineIndex: 0
        }
      ]
    })

    expect(bodyText()).toContain('目标不存在')
    expect(bodyText()).not.toContain('采用建议')
    expect(bodyText()).not.toContain('改为弱关联')
  })
})
