import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createUtilityModalState } from '../../../src/composables/app/modalState/createUtilityModalState.ts'

describe('createUtilityModalState', () => {
  it('会把工具弹窗动作统一收进 actions，并保留可调用函数', async () => {
    const saveTicket = vi.fn()
    const addTransaction = vi.fn()
    const requestNotificationPermission = vi.fn()

    const state = createUtilityModalState({
      appState: {
        showAddTicket: ref(false),
        showEditTicket: ref(false),
        ticketForm: {},
        showTagManager: ref(false),
        customTags: ref([]),
        editingTagId: ref(null),
        newTagName: ref(''),
        tagColorPresets: ['#fff'],
        newTagColor: ref('#fff'),
        showSpendMoney: ref(false),
        spendAmount: ref(0),
        spendReason: ref(''),
        showBatchExchange: ref(false),
        showBatchUse: ref(false),
        batchTicket: ref(null),
        batchAmount: ref(1),
        showCategoryEditor: ref(false),
        categoryEditList: ref([]),
        newCategoryName: ref(''),
        showConfirmDialog: ref(false),
        confirmDialog: {},
        showChatTransferDialog: ref(false),
        chatTransferDialog: {}
      },
      stores: {
        resourceStore: {
          categories: ['默认'],
          money: 12,
          points: 34
        }
      },
      ticketOps: {
        saveTicket,
        deleteEditingTicket: vi.fn(),
        addCategory: vi.fn(),
        saveCategories: vi.fn()
      },
      tagOps: {
        editCustomTag: vi.fn(),
        deleteCustomTag: vi.fn(),
        saveCustomTag: vi.fn()
      },
      transactionActions: {
        addTransaction
      },
      uiHelpers: {
        handleConfirmClick: vi.fn(),
        confirmChatTransfer: vi.fn(),
        closeChatTransferDialog: vi.fn()
      },
      timerComposable: {},
      notificationSupported: ref(true),
      notificationPermission: ref('default'),
      requestNotificationPermission
    })

    expect(typeof state.actions.saveTicket).toBe('function')
    expect(typeof state.actions.addTransaction).toBe('function')
    expect(state.viewModel.categories).toEqual(['默认'])

    state.actions.saveTicket()
    state.actions.addTransaction('兑换票据', '兑换1张电影票', { amount: 1 })
    await state.actions.requestNotificationPermission()

    expect(saveTicket).toHaveBeenCalled()
    expect(addTransaction).toHaveBeenCalledWith('兑换票据', '兑换1张电影票', { amount: 1 })
    expect(requestNotificationPermission).toHaveBeenCalled()
  })
})
