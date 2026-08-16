type SummaryMessageLike = {
  role?: string
  content?: string
  name?: string
  memberName?: string
  member_name?: string
  envDate?: string
  envWeather?: string
  envLocation?: string
  env_date?: string
  env_weather?: string
  env_location?: string
  createdAt?: string
  created_at?: string
  time?: string
}

type WeatherHistoryLike = {
  timestamp?: number
  weather?: string
}

type LocationHistoryLike = {
  timestamp?: number
  from?: string
  to?: string
}

type BuildSummaryTranscriptOptions = {
  messages: SummaryMessageLike[]
  weatherHistory?: WeatherHistoryLike[]
  locationHistory?: LocationHistoryLike[]
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : null
  }
  const text = String(value || '').trim()
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimestampLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function normalizeWeatherHistory(history: WeatherHistoryLike[]): Array<{ timestamp: number; weather: string }> {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      timestamp: Number(item?.timestamp || 0),
      weather: String(item?.weather || '').trim()
    }))
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp > 0 && item.weather)
    .sort((a, b) => a.timestamp - b.timestamp)
}

function normalizeLocationHistory(history: LocationHistoryLike[]): Array<{ timestamp: number; to: string }> {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      timestamp: Number(item?.timestamp || 0),
      to: String(item?.to || '').trim()
    }))
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp > 0 && item.to)
    .sort((a, b) => a.timestamp - b.timestamp)
}

function buildSpeakerLabel(message: SummaryMessageLike, index: number): string {
  return String(
    message?.name
    || message?.memberName
    || message?.member_name
    || (message?.role === 'user' ? '用户' : message?.role === 'assistant' ? '助手' : message?.role)
    || `消息${index + 1}`
  ).trim()
}

function buildMessageLine(message: SummaryMessageLike, index: number, timestamp: number | null): string {
  const content = String(message?.content || '').trim()
  if (!content) return ''
  const speaker = buildSpeakerLabel(message, index)
  const timePrefix = timestamp ? `[${formatTimestampLabel(timestamp)}] ` : ''
  return `${index + 1}. ${timePrefix}${speaker}：${content}`
}

function getMessageEnvDate(message: SummaryMessageLike, timestamp: number | null): string {
  const envDate = String(message?.envDate ?? message?.env_date ?? '').trim()
  if (envDate) return envDate
  return timestamp ? formatDateKey(timestamp) : ''
}

function getMessageEnvWeather(message: SummaryMessageLike): string {
  return String(message?.envWeather ?? message?.env_weather ?? '').trim()
}

function getMessageEnvLocation(message: SummaryMessageLike): string {
  return String(message?.envLocation ?? message?.env_location ?? '').trim()
}

export function buildSummaryTranscriptLines({
  messages,
  weatherHistory = [],
  locationHistory = []
}: BuildSummaryTranscriptOptions): string[] {
  const normalizedWeatherHistory = normalizeWeatherHistory(weatherHistory)
  const normalizedLocationHistory = normalizeLocationHistory(locationHistory)
  const lines: string[] = []
  let previousMessageTimestamp: number | null = null
  let previousDateLabel = ''
  let previousWeather = ''
  let previousLocation = ''
  let weatherCursor = 0
  let locationCursor = 0

  for (let index = 0; index < (Array.isArray(messages) ? messages.length : 0); index += 1) {
    const message = messages[index]
    const timestamp = normalizeTimestamp(message?.createdAt ?? message?.created_at ?? message?.time)
    const content = String(message?.content || '').trim()
    if (!content) continue

    if (timestamp) {
      const dateLabel = getMessageEnvDate(message, timestamp)
      const weatherLabel = getMessageEnvWeather(message)
      const locationLabel = getMessageEnvLocation(message)
      if (previousDateLabel && dateLabel && previousDateLabel !== dateLabel) {
        lines.push(`【日期变化提醒】从这里开始，日期切换为 ${dateLabel}，请按新日期理解后续聊天内容。`)
      }
      if (previousWeather && weatherLabel && previousWeather !== weatherLabel) {
        lines.push(`【天气变化提醒】从这里开始，天气变为 ${weatherLabel}，请按变化后的天气理解后续聊天内容。`)
      }
      if (previousLocation && locationLabel && previousLocation !== locationLabel) {
        lines.push(`【地点变化提醒】从这里开始，地点变为 ${locationLabel}，请按变化后的地点理解后续聊天内容。`)
      }

      while (weatherCursor < normalizedWeatherHistory.length) {
        const change = normalizedWeatherHistory[weatherCursor]
        if (change.timestamp > timestamp) break
        if (previousMessageTimestamp !== null && !weatherLabel && change.timestamp > previousMessageTimestamp) {
          lines.push(`【天气变化提醒】${formatTimestampLabel(change.timestamp)} 起天气变为 ${change.weather}，请按变化后的天气理解后续聊天内容。`)
        }
        weatherCursor += 1
      }

      while (locationCursor < normalizedLocationHistory.length) {
        const change = normalizedLocationHistory[locationCursor]
        if (change.timestamp > timestamp) break
        if (previousMessageTimestamp !== null && !locationLabel && change.timestamp > previousMessageTimestamp) {
          lines.push(`【地点变化提醒】${formatTimestampLabel(change.timestamp)} 起地点变为 ${change.to}，请按变化后的地点理解后续聊天内容。`)
        }
        locationCursor += 1
      }

      previousMessageTimestamp = timestamp
      if (dateLabel) previousDateLabel = dateLabel
      if (weatherLabel) previousWeather = weatherLabel
      if (locationLabel) previousLocation = locationLabel
    }

    const messageLine = buildMessageLine(message, index, timestamp)
    if (messageLine) lines.push(messageLine)
  }

  return lines
}
