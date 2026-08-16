export type WeatherIconName =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'cloud-drizzle'
  | 'cloud-rain'
  | 'cloud-snow'
  | 'cloud-fog'
  | 'cloud-lightning'
  | 'wind'
  | 'tornado'
  | 'thermometer-sun'
  | 'thermometer-snowflake'

export function getWeatherIcon(iconCode: string): string {
  const iconMap: Record<string, string> = {
    '100': '☀️',
    '101': '🌤️',
    '102': '⛅️',
    '103': '🌥️',
    '104': '☁️',
    '200': '🌀', '201': '🌀', '202': '🌀', '203': '🌀', '204': '🌀',
    '300': '🌧️', '301': '🌧️', '302': '🌧️', '303': '🌧️', '304': '🌧️',
    '305': '🌧️', '306': '🌧️', '307': '🌧️', '308': '🌧️', '309': '🌧️',
    '310': '🌧️', '311': '🌧️', '312': '🌧️', '313': '🌧️', '314': '🌧️',
    '315': '🌧️', '316': '🌧️', '317': '🌧️', '318': '🌧️',
    '400': '❄️', '401': '❄️', '402': '❄️', '403': '❄️', '404': '❄️',
    '405': '❄️', '406': '❄️', '407': '❄️',
    '500': '🌫️', '501': '🌫️', '502': '🌫️', '503': '🌫️', '504': '🌫️',
    '509': '🌫️',
    '900': '🌋', '901': '🌊', '999': '❓'
  }
  return iconMap[iconCode] || '🌤️'
}

const weatherIconByCode: Record<string, WeatherIconName> = {
  '100': 'sun',
  '101': 'cloud-sun',
  '102': 'cloud-sun',
  '103': 'cloud-sun',
  '104': 'cloud',
  '150': 'moon',
  '151': 'cloud-moon',
  '152': 'cloud-moon',
  '153': 'cloud-moon',
  '200': 'wind',
  '201': 'wind',
  '202': 'wind',
  '203': 'wind',
  '204': 'wind',
  '205': 'wind',
  '206': 'wind',
  '207': 'wind',
  '208': 'wind',
  '209': 'wind',
  '210': 'wind',
  '211': 'wind',
  '212': 'wind',
  '213': 'wind',
  '302': 'cloud-lightning',
  '303': 'cloud-lightning',
  '304': 'cloud-lightning',
  '305': 'cloud-drizzle',
  '306': 'cloud-rain',
  '307': 'cloud-rain',
  '308': 'cloud-rain',
  '309': 'cloud-drizzle',
  '310': 'cloud-rain',
  '311': 'cloud-rain',
  '312': 'cloud-rain',
  '313': 'cloud-snow',
  '314': 'cloud-drizzle',
  '315': 'cloud-rain',
  '316': 'cloud-rain',
  '317': 'cloud-rain',
  '318': 'cloud-rain',
  '350': 'cloud-rain',
  '351': 'cloud-rain',
  '399': 'cloud-rain',
  '400': 'cloud-snow',
  '401': 'cloud-snow',
  '402': 'cloud-snow',
  '403': 'cloud-snow',
  '404': 'cloud-snow',
  '405': 'cloud-snow',
  '406': 'cloud-snow',
  '407': 'cloud-snow',
  '408': 'cloud-snow',
  '409': 'cloud-snow',
  '410': 'cloud-snow',
  '456': 'cloud-snow',
  '457': 'cloud-snow',
  '499': 'cloud-snow',
  '500': 'cloud-fog',
  '501': 'cloud-fog',
  '502': 'cloud-fog',
  '503': 'wind',
  '504': 'wind',
  '507': 'wind',
  '508': 'wind',
  '509': 'cloud-fog',
  '510': 'cloud-fog',
  '511': 'cloud-fog',
  '512': 'cloud-fog',
  '513': 'cloud-fog',
  '514': 'cloud-fog',
  '515': 'cloud-fog',
  '900': 'thermometer-sun',
  '901': 'thermometer-snowflake'
}

const weatherTextRules: Array<{ pattern: RegExp; icon: WeatherIconName }> = [
  { pattern: /(雷|电|雷暴|雷阵雨)/i, icon: 'cloud-lightning' },
  { pattern: /(雨夹雪|雨雪|冻雨|冰粒|阵雪|小雪|中雪|大雪|暴雪|雪)/i, icon: 'cloud-snow' },
  { pattern: /(毛毛雨|细雨|小雨|微雨|零星小雨|阵雨)/i, icon: 'cloud-drizzle' },
  { pattern: /(暴雨|大雨|中雨|强降雨|雨)/i, icon: 'cloud-rain' },
  { pattern: /(雾|霾|薄雾|浓雾|轻雾|烟雾|浮尘)/i, icon: 'cloud-fog' },
  { pattern: /(台风|飓风|龙卷|热带风暴)/i, icon: 'tornado' },
  { pattern: /(大风|强风|疾风|狂风|扬沙|沙尘|沙暴)/i, icon: 'wind' },
  { pattern: /(酷热|高温|热)/i, icon: 'thermometer-sun' },
  { pattern: /(严寒|低温|寒冷|冷)/i, icon: 'thermometer-snowflake' },
  { pattern: /(晴间多云|多云转晴|少云|晴转多云|晴.*云|云.*晴|partly cloudy|few clouds)/i, icon: 'cloud-sun' },
  { pattern: /(多云|阴天|阴|云|cloud|overcast)/i, icon: 'cloud' },
  { pattern: /(夜晴|晴夜|月|clear night)/i, icon: 'moon' },
  { pattern: /(晴|晴朗|clear|sunny)/i, icon: 'sun' }
]

export function resolveWeatherIconName(weather: string, iconCode = ''): WeatherIconName {
  const normalizedCode = String(iconCode || '').trim()
  if (normalizedCode && weatherIconByCode[normalizedCode]) {
    return weatherIconByCode[normalizedCode]
  }

  const normalizedWeather = String(weather || '')
    .trim()
    .split(/[，,]/)[0]
    .trim()

  if (!normalizedWeather) return 'cloud-sun'

  const matched = weatherTextRules.find((rule) => rule.pattern.test(normalizedWeather))
  return matched?.icon || 'cloud-sun'
}

export function getWeatherEmoji(weather: string): string {
  const emojiMap: Record<WeatherIconName, string> = {
    sun: '☀️',
    moon: '🌙',
    'cloud-sun': '⛅️',
    'cloud-moon': '☁️',
    cloud: '☁️',
    'cloud-drizzle': '🌦️',
    'cloud-rain': '🌧️',
    'cloud-snow': '❄️',
    'cloud-fog': '🌫️',
    'cloud-lightning': '⛈️',
    wind: '🌀',
    tornado: '🌪️',
    'thermometer-sun': '🌡️',
    'thermometer-snowflake': '🥶'
  }
  return emojiMap[resolveWeatherIconName(weather)] || '🌤️'
}

export function getTemperatureFromWeather(weather: string): string {
  const tempMatch = (weather || '').match(/(\d+)°?C?/)
  return tempMatch ? `${tempMatch[1]}°C` : ''
}

export function buildWeatherDetailSummary(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return typeof detail === 'string' ? detail.trim() : ''
  const record = detail as Record<string, unknown>
  return [
    record.text ? `${record.text}` : '',
    record.temp ? `${record.temp}°C` : '',
    record.feelsLike ? `体感${record.feelsLike}°C` : '',
    record.humidity ? `湿度${record.humidity}%` : '',
    record.windDir || record.windScale ? `风${record.windDir || ''}${record.windScale ? `${record.windScale}级` : ''}`.trim() : '',
    record.windSpeed ? `风速${record.windSpeed}km/h` : '',
    record.precip ? `降水${record.precip}mm` : '',
    record.pressure ? `气压${record.pressure}hPa` : '',
    record.vis ? `能见度${record.vis}km` : '',
    record.cloud ? `云量${record.cloud}%` : '',
    record.dew ? `露点${record.dew}°C` : ''
  ].filter(Boolean).join('，')
}

export function formatDateOnly(timeStr: string): string {
  if (!timeStr) return '日期'
  const dateMatch = timeStr.match(/(\d{1,2}月\d{1,2}日)/)
  if (dateMatch) return dateMatch[1]
  const weekMatch = timeStr.match(/(周[一二三四五六日])/)
  if (weekMatch) return weekMatch[1]
  return '日期'
}

export function formatTimeOnly(timeStr: string): string {
  if (!timeStr) return '时间'
  const timeMatch = timeStr.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)
  return timeMatch ? timeMatch[1] : ''
}

export function formatObsTime(obsTime: string): string {
  if (!obsTime) return '-'
  try {
    const date = new Date(obsTime)
    if (isNaN(date.getTime())) return obsTime
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return obsTime
  }
}
