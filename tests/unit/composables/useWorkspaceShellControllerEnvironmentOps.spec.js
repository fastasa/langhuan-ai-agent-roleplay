import { describe, expect, it, vi } from 'vitest'
import { buildWorkspaceShellControllerEnvironmentOps } from '../../../src/composables/app/useWorkspaceShellControllerEnvironmentOps.ts'

describe('useWorkspaceShellControllerEnvironmentOps', () => {
  it('会返回给视图桥使用的环境操作集合', () => {
    const getWeatherText = vi.fn()
    const isLoadingLocation = { value: true }
    const isLoadingWeather = { value: false }
    const editingLocation = { value: true }
    const tempLocation = { value: '上海' }
    const editLocation = vi.fn()
    const saveLocation = vi.fn()
    const cancelLocationEdit = vi.fn()
    const updateCurrentTime = vi.fn()
    const syncWeather = vi.fn()
    const weatherApiKey = { value: 'key' }
    const weatherApiDomain = { value: 'domain' }
    const getTemperatureFromWeather = vi.fn()

    const environmentOps = buildWorkspaceShellControllerEnvironmentOps({
      getWeatherText,
      isLoadingLocation,
      isLoadingWeather,
      editingLocation,
      tempLocation,
      editLocation,
      saveLocation,
      cancelLocationEdit,
      updateCurrentTime,
      syncWeather,
      weatherApiKey,
      weatherApiDomain,
      getTemperatureFromWeather
    })

    expect(environmentOps.getWeatherText).toBe(getWeatherText)
    expect(environmentOps.isLoadingLocation).toBe(isLoadingLocation)
    expect(environmentOps.isLoadingWeather).toBe(isLoadingWeather)
    expect(environmentOps.editingLocation).toBe(editingLocation)
    expect(environmentOps.tempLocation).toBe(tempLocation)
    expect(environmentOps.editLocation).toBe(editLocation)
    expect(environmentOps.saveLocation).toBe(saveLocation)
    expect(environmentOps.cancelLocationEdit).toBe(cancelLocationEdit)
    expect(environmentOps.updateCurrentTime).toBe(updateCurrentTime)
    expect(environmentOps.syncWeather).toBe(syncWeather)
    expect(environmentOps.weatherApiKey).toBe(weatherApiKey)
    expect(environmentOps.weatherApiDomain).toBe(weatherApiDomain)
    expect(environmentOps.getTemperatureFromWeather).toBe(getTemperatureFromWeather)
  })
})
