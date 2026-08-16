import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterBrainUnitBrowserDialog from '../../../src/components/brain/CharacterBrainUnitBrowserDialog.vue'

function createPort(overrides = {}) {
  return {
    unitId: 'brain:char_1:brain~3Adesc',
    sourceId: 'brain:desc',
    domain: 'characterCore',
    contentKind: 'form',
    title: '简介',
    summary: '简介摘要',
    tags: ['核心'],
    relationHints: [],
    body: '',
    formText: '简介：会整理档案。',
    hasCompilePage: true,
    hasBody: true,
    recallableInChat: true,
    browsable: true,
    importableToBrain: false,
    writableByAI: true,
    effectiveVersion: {
      title: '简介',
      summary: '简介摘要',
      body: '简介：会整理档案。',
      formText: '简介：会整理档案。',
      compilePage: {
        summary: '简介摘要',
        tags: ['核心'],
        relationHints: []
      }
    },
    ...overrides
  }
}

describe('CharacterBrainUnitBrowserDialog', () => {
  it('renders compile page and effective body for readable units', () => {
    const wrapper = mount(CharacterBrainUnitBrowserDialog, {
      props: {
        open: true,
        port: createPort()
      },
      global: {
        stubs: {
          Teleport: true
        }
      }
    })

    expect(wrapper.text()).toContain('简介')
    expect(wrapper.text()).toContain('简介摘要')
    expect(wrapper.text()).toContain('简介：会整理档案。')
  })

  it('keeps core group child summary index visible when the group is not recallable', () => {
    const wrapper = mount(CharacterBrainUnitBrowserDialog, {
      props: {
        open: true,
        port: createPort({
          unitId: 'character-1:core',
          sourceId: 'brain:see_me',
          contentKind: 'group',
          title: '核心',
          summary: '',
          tags: [],
          body: '- 简介：角色简介摘要\n- 性格：角色性格摘要',
          formText: '',
          hasCompilePage: false,
          recallableInChat: false,
          effectiveVersion: {
            title: '核心',
            summary: '',
            body: '- 简介：角色简介摘要\n- 性格：角色性格摘要'
          }
        })
      },
      global: {
        stubs: {
          Teleport: true
        }
      }
    })

    const text = wrapper.text()
    expect(text).toContain('不进召回')
    expect(text).toContain('简介：角色简介摘要')
    expect(text).toContain('性格：角色性格摘要')
    expect(text).not.toContain('暂无正文，按子单位摘要浏览。')
  })

  it('does not force system core fields into body content', () => {
    const wrapper = mount(CharacterBrainUnitBrowserDialog, {
      props: {
        open: true,
        port: createPort({
          sourceId: 'brain:default_model',
          title: '默认模型',
          summary: '',
          tags: [],
          body: '',
          formText: '默认模型：gpt-test',
          hasCompilePage: false,
          recallableInChat: false,
          writableByAI: false,
          effectiveVersion: {
            title: '默认模型',
            summary: '',
            body: '默认模型：gpt-test',
            formText: '默认模型：gpt-test'
          }
        })
      },
      global: {
        stubs: {
          Teleport: true
        }
      }
    })

    expect(wrapper.text()).toContain('系统配置不作为召回正文。')
    expect(wrapper.text()).not.toContain('默认模型：gpt-test')
  })

  it('emits pending review actions from the version comparison', async () => {
    const wrapper = mount(CharacterBrainUnitBrowserDialog, {
      props: {
        open: true,
        port: createPort({
          pendingVersion: {
            mode: 'update',
            confirmed: {
              title: '旧版',
              summary: '旧摘要',
              body: '旧正文'
            },
            pending: {
              title: '新版',
              summary: '新摘要',
              body: '新正文'
            },
            reason: '自动写入建议修改'
          }
        })
      },
      global: {
        stubs: {
          Teleport: true
        }
      }
    })

    expect(wrapper.text()).toContain('待确认修改')
    expect(wrapper.text()).toContain('旧正文')
    expect(wrapper.text()).toContain('新正文')

    await wrapper.find('.brain-unit-browser__pending-apply').trigger('click')
    await wrapper.findAll('.brain-unit-browser__pending-actions button')[1].trigger('click')
    await wrapper.findAll('.brain-unit-browser__pending-actions button')[0].trigger('click')

    expect(wrapper.emitted('confirm-pending')).toHaveLength(1)
    expect(wrapper.emitted('reject-pending')).toHaveLength(1)
    expect(wrapper.emitted('edit-pending')).toHaveLength(1)
  })
})
