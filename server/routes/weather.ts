/**
 * routes/weather.ts
 * 天气 & 定位 API 代理
 *
 * 和风天气 API 说明：
 * - 使用自定义域名：ka564v3y3a.re.qweatherapi.com
 * - 城市查询：/geo/v2/city/lookup
 * - 实时天气：/v7/weather/now
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { settingAppService } from '../application/setting/settingAppService.js'
import { logger } from '../logger.js'
import { normalizeWeatherDomain } from '../security/serviceOutboundPolicy.js'

const router = Router()

// 天气缓存
const weatherCache = new Map<string, { data: unknown; time: number }>()
const WEATHER_CACHE_TTL = 10 * 60 * 1000  // 10 分钟

// GET /api/weather/city?name=xxx  按城市名查询城市信息
router.get('/city', async (req: Request, res: Response) => {
  const { name } = req.query
  const key = settingAppService.getWeatherKey()
  const domain = settingAppService.getWeatherDomain()

  if (!name) {
    return res.status(400).json({ error: '缺少城市名参数' })
  }

  // 检查缓存
  const cacheKey = `city:${name}`
  const cached = weatherCache.get(cacheKey)
  if (cached && Date.now() - cached.time < WEATHER_CACHE_TTL) {
    return res.json(cached.data)
  }

  try {
    // 使用正确的 API 路径：/geo/v2/city/lookup
    const safeDomain = normalizeWeatherDomain(domain)
    const url = `https://${safeDomain}/geo/v2/city/lookup?location=${encodeURIComponent(name as string)}&key=${key}&lang=zh`
    logger.system('[天气] 查询城市:', url.replace(key, '***'))

    const resp = await fetch(url)
    const text = await resp.text()

    if (!resp.ok) {
      logger.error('[天气] 城市查询 HTTP 错误:', resp.status, text)
      return res.status(resp.status).json({ error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      logger.error('[天气] 城市查询返回非 JSON:', text.slice(0, 500))
      return res.status(500).json({ error: '天气 API 返回非 JSON 数据' })
    }

    // 检查 API 返回码
    const apiData = data as { code?: string; location?: Array<{ id: string; name: string }> }
    if (apiData.code !== '200' || !apiData.location || apiData.location.length === 0) {
      logger.error('[天气] 城市 API 错误:', apiData)
      return res.status(404).json({ error: `找不到该城市 (code: ${apiData.code})` })
    }

    // 存入缓存
    weatherCache.set(cacheKey, { data, time: Date.now() })
    res.json(data)
  } catch (err) {
    logger.error('[天气] 城市查询失败:', (err as Error).message)
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/weather/now?cityId=xxx  实时天气
router.get('/now', async (req: Request, res: Response) => {
  const { cityId, lat, lon } = req.query
  const key = settingAppService.getWeatherKey()
  const domain = settingAppService.getWeatherDomain()

  if (!cityId && !(lat && lon)) {
    return res.status(400).json({ error: '缺少城市 ID 或经纬度参数' })
  }

  const location = cityId || `${lon},${lat}`

  // 检查缓存
  const cacheKey = `weather:${location}`
  const cached = weatherCache.get(cacheKey)
  if (cached && Date.now() - cached.time < WEATHER_CACHE_TTL) {
    return res.json(cached.data)
  }

  try {
    // 使用正确的 API 路径：/v7/weather/now
    const safeDomain = normalizeWeatherDomain(domain)
    const url = `https://${safeDomain}/v7/weather/now?location=${location}&key=${key}&lang=zh`
    logger.system('[天气] 请求天气:', url.replace(key, '***'))

    const resp = await fetch(url)
    const text = await resp.text()

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: '天气 API 返回非 JSON 数据' })
    }

    // 检查 API 返回码
    const apiData = data as { code?: string; now?: { text: string; temp: string } }
    if (apiData.code !== '200' || !apiData.now) {
      logger.error('[天气] 天气 API 错误:', apiData)
      return res.status(500).json({ error: `天气 API 错误 (code: ${apiData.code})` })
    }

    // 存入缓存
    weatherCache.set(cacheKey, { data, time: Date.now() })
    res.json(data)
  } catch (err) {
    logger.error('[天气] 天气请求失败:', (err as Error).message)
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/weather/geo?lat=xx&lon=xx  逆地理编码
router.get('/geo', async (req: Request, res: Response) => {
  const { lat, lon } = req.query
  const key = settingAppService.getWeatherKey()
  const domain = settingAppService.getWeatherDomain()

  if (!lat || !lon) {
    return res.status(400).json({ error: '缺少经纬度参数' })
  }

  // 检查缓存
  const cacheKey = `geo:${lat},${lon}`
  const cached = weatherCache.get(cacheKey)
  if (cached && Date.now() - cached.time < WEATHER_CACHE_TTL) {
    return res.json(cached.data)
  }

  try {
    const locationStr = `${lon},${lat}`
    const safeDomain = normalizeWeatherDomain(domain)
    const url = `https://${safeDomain}/geo/v2/city/lookup?location=${locationStr}&key=${key}&lang=zh`
    logger.system('[天气] 逆地理编码:', url.replace(key, '***'))

    const resp = await fetch(url)
    const text = await resp.text()

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `HTTP ${resp.status}: ${text.slice(0, 200)}` })
    }

    const data = JSON.parse(text)
    weatherCache.set(cacheKey, { data, time: Date.now() })
    res.json(data)
  } catch (err) {
    logger.error('[天气] 逆地理编码失败:', (err as Error).message)
    res.status(500).json({ error: (err as Error).message })
  }
})

// PUT /api/weather/config  更新天气配置
router.put('/config', (req: Request, res: Response) => {
  try {
    if (req.body?.domain !== undefined) {
      req.body.domain = normalizeWeatherDomain(req.body.domain)
    }
    res.json(settingAppService.updateWeatherConfig(req.body || {}))
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

export default router
