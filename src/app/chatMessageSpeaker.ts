type SpeakerMessageLike = {
  role?: unknown
  name?: unknown
  memberName?: unknown
  member_name?: unknown
}

type SpeakerNameOptions = {
  userFallbackName?: unknown
  assistantFallbackName?: unknown
}

function readText(value: unknown): string {
  return String(value ?? '').trim()
}

export function resolveChatMessageSpeakerName(message: SpeakerMessageLike | null | undefined, options: SpeakerNameOptions = {}): string {
  const role = readText(message?.role)
  if (role === 'user') {
    return readText(message?.name)
      || readText(message?.memberName)
      || readText(message?.member_name)
      || readText(options.userFallbackName)
      || '我'
  }

  return readText(message?.name)
    || readText(message?.memberName)
    || readText(message?.member_name)
    || readText(options.assistantFallbackName)
    || '角色'
}
