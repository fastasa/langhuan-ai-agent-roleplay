type MessageEnvironmentInput = {
  currentTime?: string
  currentWeather?: string
  currentLocation?: string
  createdAt?: string
  currentSession?: unknown
  now?: number
}

type MessageEnvironmentLike = {
  envDate?: string
  envWeather?: string
  envLocation?: string
  env_date?: string
  env_weather?: string
  env_location?: string
  createdAt?: string
  created_at?: string
}

import { formatVirtualSceneDate, parseVirtualSceneDisplayTime, resolveEffectiveVirtualScene } from './virtualScene'

function formatDateFromIso(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function extractBriefWeather(weather: string): string {
  return String(weather || '')
    .split(/[，,]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractBriefDate(currentTime: string, createdAt = ''): string {
  const text = String(currentTime || '').trim()
  const createdAtDate = createdAt ? new Date(createdAt) : null
  const reference = createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate : new Date()
  const hasTime = /\d{1,2}:\d{2}(?::\d{2})?/.test(text)
  if (hasTime) return formatVirtualSceneDate(parseVirtualSceneDisplayTime(text, reference))
  const match = text.match(/(\d{1,2}月\d{1,2}日(?:\s*周[一二三四五六日天])?)/)
  if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim()
  if (createdAt) return formatDateFromIso(createdAt)
  return ''
}

export function buildMessageEnvironmentSnapshot(input: MessageEnvironmentInput) {
  const createdAt = String(input.createdAt || '').trim()
  const effective = buildEffectiveMessageEnvironment(input)
  return {
    envDate: extractBriefDate(effective.currentTime, createdAt),
    envWeather: extractBriefWeather(effective.currentWeather),
    envLocation: effective.currentLocation
  }
}

export function buildEffectiveMessageEnvironment(input: MessageEnvironmentInput) {
  const scene = resolveEffectiveVirtualScene(input.currentSession as any, {
    currentTime: input.currentTime,
    currentWeather: input.currentWeather,
    currentLocation: input.currentLocation
  }, input.now ?? Date.now())
  const hasCurrentSession = input.currentSession !== undefined && input.currentSession !== null
  return {
    currentTime: scene?.time || String(input.currentTime || '').trim(),
    currentWeather: scene?.weather || String(input.currentWeather || '').trim(),
    currentLocation: scene?.location || (hasCurrentSession ? '' : String(input.currentLocation || '').trim())
  }
}

export function getMessageEnvironmentLabel(message: MessageEnvironmentLike): string {
  const envDate = String(message.envDate ?? message.env_date ?? '').trim()
  const envWeather = String(message.envWeather ?? message.env_weather ?? '').trim()
  const envLocation = String(message.envLocation ?? message.env_location ?? '').trim()
  return [envDate, envWeather, envLocation].filter(Boolean).join(' ')
}
