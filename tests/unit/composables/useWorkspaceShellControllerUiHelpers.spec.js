import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceShellControllerUiHelpers } from '../../../src/composables/app/useWorkspaceShellControllerUiHelpers.ts'

describe('useWorkspaceShellControllerUiHelpers', () => {
  it('会返回给视图桥使用的统一 ui helper 集合', () => {
    const toast = vi.fn()
    const abortChat = vi.fn()
    const getDisplayedMessageContent = vi.fn()
    const getGoldTicketCount = vi.fn()
    const openCategoryEditor = vi.fn()
    const toggleGroupCollapse = vi.fn()
    const getCharactersByGroup = vi.fn()
    const formatChatText = vi.fn()

    const helpers = buildWorkspaceShellControllerUiHelpers({
      toast,
      abortChat,
      getDisplayedMessageContent,
      getGoldTicketCount,
      openCategoryEditor,
      toggleGroupCollapse,
      getCharactersByGroup,
      formatChatText
    })

    expect(helpers.toast).toBe(toast)
    expect(helpers.abortChat).toBe(abortChat)
    expect(helpers.getDisplayedMessageContent).toBe(getDisplayedMessageContent)
    expect(helpers.getGoldTicketCount).toBe(getGoldTicketCount)
    expect(helpers.openCategoryEditor).toBe(openCategoryEditor)
    expect(helpers.toggleGroupCollapse).toBe(toggleGroupCollapse)
    expect(helpers.getCharactersByGroup).toBe(getCharactersByGroup)
    expect(helpers.formatChatText).toBe(formatChatText)
  })
})
