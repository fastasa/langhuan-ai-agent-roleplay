import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceShellControllerChatTargetHelpers } from '../../../src/composables/app/useWorkspaceShellControllerChatTargetHelpers.ts'

describe('useWorkspaceShellControllerChatTargetHelpers', () => {
  it('会返回视图桥需要的聊天目标辅助方法', () => {
    const transferCurrentChat = vi.fn()
    const switchChat = vi.fn()
    const openCharSettingsByName = vi.fn()
    const editGroup = vi.fn()
    const editCrowd = vi.fn()
    const getCharAvatarById = vi.fn()
    const getCharAvatar = vi.fn()
    const getCharEmoji = vi.fn()
    const getCharNameById = vi.fn()

    const helpers = buildWorkspaceShellControllerChatTargetHelpers({
      transferCurrentChat,
      switchChat,
      openCharSettingsByName,
      editGroup,
      editCrowd,
      getCharAvatarById,
      getCharAvatar,
      getCharEmoji,
      getCharNameById
    })

    expect(helpers.transferCurrentChat).toBe(transferCurrentChat)
    expect(helpers.switchChat).toBe(switchChat)
    expect(helpers.openCharSettingsByName).toBe(openCharSettingsByName)
    expect(helpers.editGroup).toBe(editGroup)
    expect(helpers.editCrowd).toBe(editCrowd)
    expect(helpers.getCharAvatarById).toBe(getCharAvatarById)
    expect(helpers.getCharAvatar).toBe(getCharAvatar)
    expect(helpers.getCharEmoji).toBe(getCharEmoji)
    expect(helpers.getCharNameById).toBe(getCharNameById)
  })
})
