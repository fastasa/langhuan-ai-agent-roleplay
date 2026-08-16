type ChatHeaderSessionLike = {
  id?: unknown
  targetId?: unknown
  target_id?: unknown
  title?: unknown
} | null | undefined

type ResolveChatHeaderTitleInput = {
  session?: ChatHeaderSessionLike
  activeSessionId?: unknown
  targetId?: unknown
  fallbackTitle?: unknown
  defaultTitle?: unknown
}

/** 会话展示名唯一解析：正式 session.title 优先；fallback 只服务旧空标题数据。 */
export function resolveChatSessionTitle(session: ChatHeaderSessionLike, fallbackTitle: unknown): string {
  return String(session?.title || fallbackTitle || '').trim()
}

export function resolveChatHeaderTitle(input: ResolveChatHeaderTitleInput): string {
  const fallbackTitle = String(input.fallbackTitle || input.defaultTitle || '').trim()
  const session = input.session && typeof input.session === 'object' ? input.session : null
  if (!session) return fallbackTitle

  const activeSessionId = String(input.activeSessionId || '').trim()
  const sessionId = String(session.id || '').trim()
  if (activeSessionId && sessionId && activeSessionId !== sessionId) return fallbackTitle

  const targetId = String(input.targetId || '').trim()
  const sessionTargetId = String(session.targetId ?? session.target_id ?? '').trim()
  if (targetId && sessionTargetId && targetId !== sessionTargetId) return fallbackTitle

  return resolveChatSessionTitle(session, fallbackTitle)
}
