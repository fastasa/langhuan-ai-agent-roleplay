const QWEATHER_DOMAINS = new Set([
  'devapi.qweather.com',
  'api.qweather.com',
  'geoapi.qweather.com'
])

function normalizeHostname(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\.+$/, '')
}

export function normalizeWeatherDomain(domain: unknown) {
  const hostname = normalizeHostname(String(domain || 'devapi.qweather.com'))
  if (QWEATHER_DOMAINS.has(hostname)) return hostname
  if (/^[a-z0-9-]+\.re\.qweatherapi\.com$/i.test(hostname)) return hostname
  throw new Error('天气 API 域名不在允许范围内')
}
