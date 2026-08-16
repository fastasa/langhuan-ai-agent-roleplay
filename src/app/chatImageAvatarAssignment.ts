export const OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT = 'langhuan:open-chat-image-avatar-assignment'

export interface ChatImageAvatarAssignmentRequest {
  imageUrl: string
  originalName?: string
}

/**
 * 聊天图片只负责发出“我要把这张图设为头像”的意图；目标解析、裁剪和正式写入统一由常驻角色弹窗承接。
 * 这样主聊天、移动端和星依浮坞不会各自复制一套头像保存逻辑。
 */
export function requestChatImageAvatarAssignment(imageUrl: string, originalName?: string): void {
  const normalizedUrl = String(imageUrl || '').trim()
  if (!normalizedUrl || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ChatImageAvatarAssignmentRequest>(OPEN_CHAT_IMAGE_AVATAR_ASSIGNMENT_EVENT, {
    detail: {
      imageUrl: normalizedUrl,
      ...(String(originalName || '').trim() ? { originalName: String(originalName).trim() } : {})
    }
  }))
}
