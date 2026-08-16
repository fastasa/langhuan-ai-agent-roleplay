import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useAppShellSupport } from '../../../src/composables/app/useAppShellSupport.ts'

describe('useAppShellSupport', () => {
  it('优先从聊天分组入口读取当前会话和总结列表', () => {
    const state = useAppShellSupport({
      chatStore: {
        current: {
          currentSession: ref({
            id: 'session_1',
            loadedSummaryIds: ['s1', 'b1']
          }),
          getCurrentSession: () => ({
            id: 'session_1',
            loadedSummaryIds: ['s1', 'b1']
          })
        },
        summaries: {
          smallSummaries: ref([
            { id: 's1', name: '第一份小总结' }
          ]),
          bigSummaries: ref([
            { id: 'b1', name: '第一份大总结' }
          ])
        }
      }
    })

    expect(state.loadedSummaryItems.value).toEqual([
      { id: 's1', name: '第一份小总结', content: '', kind: 'small' },
      { id: 'b1', name: '第一份大总结', content: '', kind: 'big' }
    ])
  })

  it('创建时从本地存储恢复已展开的联系人分组，未记录的分组保持折叠', () => {
    localStorage.clear()
    localStorage.setItem('langhuan_sidebar_expanded_contact_groups_v1:local', JSON.stringify(['role_group']))

    const state = useAppShellSupport({ chatStore: {} })

    expect(state.collapsedGroups.role_group).toBe(false)
    expect(state.collapsedGroups.other_group).toBeUndefined()
  })
})
