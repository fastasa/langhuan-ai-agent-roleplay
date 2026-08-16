import {
  fetchWeatherConfigSnapshot,
  fetchWeatherNow,
  resolveWeatherCity,
  reverseGeoLocation,
  saveWeatherConfigSnapshot
} from '../../repositories/environmentRepository'
import { buildWeatherDetailSummary } from '../../utils/environmentFormat'

export function useEnvironmentOps({
  settingStore,
  settingEnvironmentService,
  isLoadingLocation,
  isLoadingWeather,
  editingLocation,
  tempLocation,
  weatherApiKey,
  weatherApiDomain,
  toast,
  logger
}: any) {
  function buildDetailedWeatherSummary(detail: any): string {
    return buildWeatherDetailSummary(detail)
  }

  function getWeatherText(): string {
    const text = String(settingStore.weatherDetail?.text || '').trim()
      || String(settingStore.currentWeather || '').split(/[，,]/)[0].replace(/\s*\d+°?C?\s*$/, '').trim()
    return text || '天气'
  }

  async function loadWeatherConfig() {
    try {
      const data = await fetchWeatherConfigSnapshot()
      if (data.weather_api_domain) weatherApiDomain.value = data.weather_api_domain
      if (data.weather_api_key) weatherApiKey.value = data.weather_api_key
    } catch (e) {
      console.error('加载天气API配置失败:', e)
    }
  }

  async function saveWeatherApiConfig() {
    try {
      await saveWeatherConfigSnapshot({
        apiKey: weatherApiKey.value,
        domain: weatherApiDomain.value || 'devapi.qweather.com'
      })
      toast('天气 API 配置已保存', 'success')
    } catch (e) {
      toast('保存天气API配置失败', 'error')
    }
  }

  async function runSaveWeatherApiConfigCommand() {
    await saveWeatherApiConfig()
  }

  function editLocation() {
    tempLocation.value = settingStore.currentLocation || ''
    editingLocation.value = true
  }

  function saveLocation() {
    if (tempLocation.value.trim()) {
      const oldLocation = settingStore.currentLocation || ''
      settingStore.currentLocation = tempLocation.value.trim()
      settingStore.addLocationChange(oldLocation, settingStore.currentLocation)
      settingEnvironmentService.saveEnvironment().catch(() => {})
    }
    editingLocation.value = false
  }

  function cancelLocationEdit() {
    editingLocation.value = false
  }

  async function syncWeather(locationOverride = '') {
    await fetchWeather(locationOverride)
  }

  async function autoGetLocation() {
    isLoadingLocation.value = true
    try {
      const pos = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('浏览器不支持定位'))
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      })
      const { latitude, longitude } = (pos as any).coords
      const data = await reverseGeoLocation(latitude, longitude)
      if (data.code === '200' && data.location && data.location[0]) {
        const loc = data.location[0]
        const oldLocation = settingStore.currentLocation
        const newLocation = loc.adm2 || loc.adm1 || loc.name
        settingStore.currentLocation = newLocation
        settingStore.addLocationChange(oldLocation || '', newLocation)
        toast('定位成功: ' + settingStore.currentLocation, 'success')
        settingEnvironmentService.saveEnvironment().catch(() => {})
      } else {
        toast('定位失败: 无法识别位置', 'error')
      }
    } catch (e: any) {
      toast('定位失败: ' + (e.message || '网络错误'), 'error')
    } finally {
      isLoadingLocation.value = false
    }
  }

  function updateCurrentTime() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const month = now.getMonth() + 1
    const day = now.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[now.getDay()]
    settingStore.currentTime = `${month}月${day}日 周${weekDay} ${hours}:${minutes}:${seconds}`
    settingEnvironmentService.saveEnvironment().catch(() => {})
    toast('时间已同步', 'success')
  }

  function updateCurrentTimeSilent() {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const month = now.getMonth() + 1
    const day = now.getDate()
    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const weekDay = weekDays[now.getDay()]
    settingStore.currentTime = `${month}月${day}日 周${weekDay} ${hours}:${minutes}:${seconds}`
  }

  async function fetchWeather(locationOverride = '') {
    const queryLocation = String(locationOverride || settingStore.currentLocation || '').trim()
    if (!queryLocation) {
      toast('请先设置地点', 'error')
      return
    }
    isLoadingWeather.value = true
    try {
      const cityData = await resolveWeatherCity(queryLocation)
      logger.log('城市查询结果:', cityData)
      if (cityData.error) {
        toast('天气API配置错误: ' + cityData.error, 'error')
        return
      }
      if (cityData.code !== '200' || !cityData.location || !cityData.location[0]) {
        toast('未找到该城市，请检查地点是否正', 'error')
        return
      }
      const cityId = cityData.location[0].id
      const weatherData = await fetchWeatherNow(cityId)
      logger.log('天气查询结果:', weatherData)
      if (weatherData.code === '200' && weatherData.now) {
        const now = weatherData.now
        const weatherDetail = {
          text: now.text || '',
          temp: now.temp || '',
          feelsLike: now.feelsLike || '',
          humidity: now.humidity || '',
          windDir: now.windDir || '',
          windScale: now.windScale || '',
          windSpeed: now.windSpeed || '',
          precip: now.precip || '',
          pressure: now.pressure || '',
          vis: now.vis || '',
          cloud: now.cloud || '',
          dew: now.dew || '',
          icon: now.icon || '',
          obsTime: now.obsTime || ''
        }
        const newWeather = buildDetailedWeatherSummary(weatherDetail) || `${now.text || ''} ${now.temp || ''}°C`.trim()
        settingStore.addWeatherChange(newWeather)
        settingStore.currentWeather = newWeather
        settingStore.weatherDetail = weatherDetail
        toast('天气已同步', 'success')
        settingEnvironmentService.saveEnvironment().catch(() => {})
      } else {
        toast('获取天气失败: ' + (weatherData.message || JSON.stringify(weatherData)), 'error')
      }
    } catch (e) {
      console.error('天气获取失败:', e)
      toast('获取天气失败: ' + (e instanceof Error ? e.message : '网络错误'), 'error')
    } finally {
      isLoadingWeather.value = false
    }
  }

  return {
    getWeatherText,
    loadWeatherConfig,
    saveWeatherApiConfig,
    runSaveWeatherApiConfigCommand,
    editLocation,
    saveLocation,
    cancelLocationEdit,
    syncWeather,
    autoGetLocation,
    updateCurrentTime,
    updateCurrentTimeSilent,
    fetchWeather
  }
}
