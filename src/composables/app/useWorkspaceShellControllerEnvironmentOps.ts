export function buildWorkspaceShellControllerEnvironmentOps(environment: {
  getWeatherText: () => string
  isLoadingLocation: { value?: boolean } | boolean
  isLoadingWeather: { value?: boolean } | boolean
  editingLocation: { value?: boolean } | boolean
  tempLocation: { value?: string } | string
  tempLocationLarge?: { value?: string } | string
  tempLocationMiddle?: { value?: string } | string
  tempLocationSmall?: { value?: string } | string
  editLocation: () => unknown
  saveLocation: () => unknown
  cancelLocationEdit: () => unknown
  updateCurrentTime: () => unknown
  syncWeather: (locationOverride?: string) => unknown
  weatherApiKey: { value?: string } | string
  weatherApiDomain: { value?: string } | string
  getTemperatureFromWeather: () => string
}) {
  return {
    getWeatherText: environment.getWeatherText,
    isLoadingLocation: environment.isLoadingLocation,
    isLoadingWeather: environment.isLoadingWeather,
    editingLocation: environment.editingLocation,
    tempLocation: environment.tempLocation,
    tempLocationLarge: environment.tempLocationLarge,
    tempLocationMiddle: environment.tempLocationMiddle,
    tempLocationSmall: environment.tempLocationSmall,
    editLocation: environment.editLocation,
    saveLocation: environment.saveLocation,
    cancelLocationEdit: environment.cancelLocationEdit,
    updateCurrentTime: environment.updateCurrentTime,
    syncWeather: environment.syncWeather,
    weatherApiKey: environment.weatherApiKey,
    weatherApiDomain: environment.weatherApiDomain,
    getTemperatureFromWeather: environment.getTemperatureFromWeather
  }
}
