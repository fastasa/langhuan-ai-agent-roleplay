type ChatTargetEntity = {
  id?: string
  name?: string
}

export function buildWorkspaceShellControllerChatTargetHelpers(helpers: {
  transferCurrentChat: () => unknown
  switchChat: (targetId: string) => unknown
  switchSession?: (sessionId: string) => unknown
  openCharSettingsByName: (charNameOrId: string) => unknown
  openChatSessionCreator?: () => unknown
  editGroup: (group: string | ChatTargetEntity) => unknown
  editCrowd: (crowd: string | ChatTargetEntity) => unknown
  getCharAvatarById: (char: string | ChatTargetEntity) => unknown
  getCharAvatar: (charNameOrId: string) => unknown
  getCharEmoji: (charNameOrId: string) => unknown
  getCharNameById: (charId: string) => unknown
}) {
  return {
    transferCurrentChat: helpers.transferCurrentChat,
    switchChat: helpers.switchChat,
    switchSession: helpers.switchSession,
    openCharSettingsByName: helpers.openCharSettingsByName,
    openChatSessionCreator: helpers.openChatSessionCreator,
    editGroup: helpers.editGroup,
    editCrowd: helpers.editCrowd,
    getCharAvatarById: helpers.getCharAvatarById,
    getCharAvatar: helpers.getCharAvatar,
    getCharEmoji: helpers.getCharEmoji,
    getCharNameById: helpers.getCharNameById
  }
}
