import { nextTick } from 'vue'
import { getChatStoreActiveTargetId } from '../../repositories/chatRepository'

export function useChatTargetHelpers({
  charStore,
  chatStore,
  chatStickToBottom,
  normalizeAvatarUrl,
  getCurrentChatTitle,
  onEditCharacter
}: any) {
  function getActiveTargetId() {
    return getChatStoreActiveTargetId(chatStore)
  }

  function getTargetName(targetId: string) {
    if (!targetId) return '未知'
    if (targetId.startsWith('group_')) {
      const g = charStore.groups.find((group: any) => group.id === targetId || `group_${group.id}` === targetId)
      return g ? g.name : '未知群组'
    }
    if (targetId.startsWith('crowd_')) {
      const c = charStore.crowds.find((crowd: any) => crowd.id === targetId || `crowd_${crowd.id}` === targetId)
      return c ? c.name : '未知路人'
    }
    const char = charStore.getCharacter(targetId)
    return char ? char.name : '未知角色'
  }

  function getCharEmoji(charName: string) {
    if (charName) {
      const byName = charStore.characters.find((item: any) => item.name === charName)
      if (byName?.emoji) return byName.emoji
    }
    const targetId = getActiveTargetId()
    if (targetId && !targetId.startsWith('group_') && !targetId.startsWith('crowd_')) {
      const byTarget = charStore.getCharacter(targetId)
      if (byTarget?.emoji) return byTarget.emoji
    }
    return null
  }

  function getCharAvatar(charName: string) {
    let targetName = charName
    if (!targetName) {
      targetName = getCurrentChatTitle()
    }
    if (!targetName) return null
    const char = charStore.characters.find((item: any) => item.name === targetName)
    if (char?.avatarPath) return normalizeAvatarUrl(char.avatarPath)
    return null
  }

  function getCharAvatarById(char: any) {
    if (!char) return null
    if (char.avatarPath) return normalizeAvatarUrl(char.avatarPath)
    return null
  }

  function openCharSettingsByName(charNameOrId: string) {
    const raw = String(charNameOrId || '').trim()
    if (!raw || raw.startsWith('group_') || raw.startsWith('crowd_')) return false
    const char = charStore.characters.find((item: any) => item.id === raw || item.name === raw)
    if (char) {
      onEditCharacter(char)
      return true
    }
    return false
  }

  // 智能跟底滚动（2026-07-12）：转发给共享 stick 实例（与 ChatMessageStream 同一份，见 useAppState.ts）——
  // 旧版本地 48px 无状态贴底检测已淘汰，改用有状态门控（唯一改变途径=用户滚动）。
  // 保留 50ms 补滚：内容渲染/图片加载可能在首次滚动后才撑高容器，补滚时再走一次 gated 判断
  // （force 时补滚同样忽略门控，与旧行为一致——force 的语义是「这次连同补滚都不由用户是否贴底决定」）。
  function scrollToBottom(force = false) {
    chatStickToBottom.scrollToBottom(force)
    setTimeout(() => {
      chatStickToBottom.scrollToBottom(force)
    }, 50)
  }

  async function switchChat(targetId: string) {
    await chatStore.switchChat(targetId)
    nextTick(() => scrollToBottom(true))
  }

  async function switchSession(sessionId: string) {
    await chatStore.switchSession?.(sessionId)
    nextTick(() => scrollToBottom(true))
  }

  return {
    getTargetName,
    getCharEmoji,
    getCharAvatar,
    getCharAvatarById,
    openCharSettingsByName,
    scrollToBottom,
    switchChat,
    switchSession
  }
}
