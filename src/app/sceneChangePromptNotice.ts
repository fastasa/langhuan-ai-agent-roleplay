import type { ChatMessage, ChatSession } from '../types'

type MessageLike = Partial<ChatMessage> & Record<string, unknown>
type SessionLike = Partial<ChatSession> & Record<string, unknown>

interface SceneChangeLike {
  locationChanged?: boolean
  virtualLocationLarge?: string
  virtualLocationMiddle?: string
  virtualLocationSmall?: string
  reason?: string
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function readField(source: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!source) return ''
  for (const key of keys) {
    const value = toText(source[key])
    if (value) return value
  }
  return ''
}

export function composePromptSceneLocation(source: SessionLike | MessageLike | null | undefined): string {
  const large = readField(source, 'virtualLocationLarge', 'virtual_location_large')
  const middle = readField(source, 'virtualLocationMiddle', 'virtual_location_middle')
  const small = readField(source, 'virtualLocationSmall', 'virtual_location_small')
  const parts = [large, middle, small].filter(Boolean)
  if (parts.length) return parts.join(' / ')
  return readField(source, 'virtualLocation', 'virtual_location', 'envLocation', 'env_location')
}

function composeChangeLocation(change: SceneChangeLike | null | undefined, fallback: SessionLike | null | undefined): string {
  const parts = [
    toText(change?.virtualLocationLarge) || readField(fallback, 'virtualLocationLarge', 'virtual_location_large'),
    toText(change?.virtualLocationMiddle) || readField(fallback, 'virtualLocationMiddle', 'virtual_location_middle'),
    toText(change?.virtualLocationSmall) || readField(fallback, 'virtualLocationSmall', 'virtual_location_small')
  ].filter(Boolean)
  return parts.join(' / ') || composePromptSceneLocation(fallback)
}

function readMessageEnvLocation(message: MessageLike | null | undefined): string {
  return readField(message, 'envLocation', 'env_location')
}

function isNarrationDebugMessage(message: MessageLike | null | undefined): boolean {
  const kind = readField(message, 'messageKind', 'message_kind')
  const speaker = readField(message, 'name', 'memberName', 'member_name')
  return kind === 'narration_debug' || speaker === '旁白快判' || speaker === '旁白场景分析' || speaker === '旁白调试'
}

function parseDebugContent(content: string): { locationChanged: boolean; currentLocation: string; reason: string } | null {
  const text = toText(content)
  if (!text || !/地点变化：是/.test(text)) return null
  const currentLocation = text.match(/当前地点：([^\n]+)/)?.[1]?.trim() || ''
  const reason = text.match(/依据：([^\n]+)/)?.[1]?.trim() || ''
  if (!currentLocation) return null
  return { locationChanged: true, currentLocation, reason }
}

function buildPromptNotice(input: {
  previousLocation?: string
  currentLocation: string
  reason?: string
}): string {
  const previous = toText(input.previousLocation)
  const current = toText(input.currentLocation)
  if (!current) return ''
  return [
    '【地点变化提醒】',
    previous && previous !== current ? `上一地点：${previous}` : '',
    `当前地点：${current}`,
    input.reason ? `变化依据：${input.reason}` : '',
    '本次生成聊天区内容时，必须以当前地点为准；如果历史消息里有旧地点，只能当作已离开的历史背景，不得继续沿用。'
  ].filter(Boolean).join('\n')
}

export function buildSceneChangePromptNoticeFromPrelude(input: {
  previousSession?: SessionLike | null
  nextSession?: SessionLike | null
  sceneChange?: SceneChangeLike | null
}): string {
  const change = input.sceneChange
  if (!change?.locationChanged) return ''
  const currentLocation = composeChangeLocation(change, input.nextSession || input.previousSession || null)
  const previousLocation = composePromptSceneLocation(input.previousSession || null)
  return buildPromptNotice({
    previousLocation,
    currentLocation,
    reason: change.reason
  })
}

export function buildLatestSceneChangePromptNotice(messages: MessageLike[], session?: SessionLike | null): string {
  const currentSessionLocation = composePromptSceneLocation(session || null)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isNarrationDebugMessage(message)) continue
    const parsed = parseDebugContent(toText(message.content))
    if (!parsed?.locationChanged) continue
    const previous = [...messages]
      .slice(0, index)
      .reverse()
      .find((item) => !isNarrationDebugMessage(item) && readMessageEnvLocation(item))
    return buildPromptNotice({
      previousLocation: readMessageEnvLocation(previous),
      currentLocation: currentSessionLocation || parsed.currentLocation,
      reason: parsed.reason
    })
  }

  if (!currentSessionLocation) return ''
  const latestEnvMessage = [...messages]
    .reverse()
    .find((item) => !isNarrationDebugMessage(item) && readMessageEnvLocation(item))
  const previousLocation = readMessageEnvLocation(latestEnvMessage)
  if (!previousLocation || previousLocation === currentSessionLocation) return ''
  return buildPromptNotice({
    previousLocation,
    currentLocation: currentSessionLocation
  })
}
