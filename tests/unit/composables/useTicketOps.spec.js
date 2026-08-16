import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTicketOps } from '../../../src/composables/app/useTicketOps.ts'

const { saveTicketCategoryRecords } = vi.hoisted(() => ({
  saveTicketCategoryRecords: vi.fn()
}))

vi.mock('../../../src/repositories/resourceRepository.ts', () => ({
  saveTicketCategoryRecords
}))

function createTicketOpsDeps() {
  const toast = vi.fn()
  const resourceStore = {
    tickets: [],
    categories: ['娱乐']
  }

  return {
    toast,
    resourceStore,
    api: useTicketOps({
      resourceStore,
      timerComposable: {},
      settingStore: {},
      charStore: {},
      chatStore: {},
      showEditTicket: ref(false),
      showAddTicket: ref(false),
      editingTicketId: ref(null),
      ticketForm: { name: '', cost: 0, count: 0, category: '', desc: '', timerMinutes: 0, autoConsumeNext: false },
      spendAmount: ref(0),
      spendReason: ref(''),
      batchTicket: ref(null),
      batchAmount: ref(1),
      newCategoryName: ref(''),
      categoryEditList: ref(['娱乐', '学习']),
      showCategoryEditor: ref(true),
      addResourceEventToStack: vi.fn(),
      buildSystemPrompt: vi.fn(),
      getAIOptions: vi.fn(),
      callAIStream: vi.fn(),
      toast
    })
  }
}

describe('useTicketOps', () => {
  it('保存分类时通过仓储层统一提交', async () => {
    saveTicketCategoryRecords.mockResolvedValueOnce()

    const { api, resourceStore, toast } = createTicketOpsDeps()

    await api.saveCategories()

    expect(saveTicketCategoryRecords).toHaveBeenCalledWith([
      { name: '娱乐', orderIndex: 0 },
      { name: '学习', orderIndex: 1 }
    ])
    expect(resourceStore.categories).toEqual(['娱乐', '学习'])
    expect(toast).toHaveBeenCalledWith('分类已保', 'success')
  })
})
