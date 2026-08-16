import type { MapWorldData } from './mapGeometry'

/** 地图正式配色。变量绑定在地图根元素，不污染全局样式。 */
export const MAP_COLOR_VARS: Record<string, string> = {
  '--mc-canvas': '#FBFAF6',
  '--mc-fog': '#B9B6AC',
  '--mc-land-terrain': '#94BF8B',
  '--mc-land-civic': '#F7F9F5',
  '--mc-water-terrain': '#A8D3EA',
  '--mc-water-collar': '#D8EEF0',
  '--mc-coast-terrain': '#5E6C74',
  '--mc-water-civic': '#8CC1E8',
  '--mc-civic-green': '#CDE6C3',
  '--mc-urban': '#FFFFFF',
  '--mc-urban-s': '#E2E4E0',
  '--mc-road': '#FFFFFF',
  '--mc-road-casing': '#C9CDD4',
  '--mc-road-w': '3',
  '--mc-wall': '#AE8C66',
  '--mc-special-desert': '#E4D5A3',
  '--mc-special-swamp': '#A9BFB0',
  '--mc-special-ice': '#EAF2F5',
  '--mc-border': '#9AA0A8',
  '--mc-trail': '#B9AF9E',
  '--mc-bridge': '#7C6A52',
  '--mc-building': '#8B7355',
  '--mc-landmark': '#8B7355',
  '--mc-character': '#5C8A5C',
  '--mc-sketch-ready': '#3E7D4E',
  '--mc-sketch-confirm': '#C4863B',
  '--mc-sketch-risk': '#C0665A',
  '--mc-label': '#3F3B33',
  '--mc-biglabel': '#3B4136',
  '--mc-halo': 'rgba(255,255,255,0.92)',
  '--mc-font-label': "-apple-system, 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif",
  '--mc-font-big': "-apple-system, 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
}

export type MapPanelData = {
  title: string
  kind: 'character' | 'building' | 'organization'
  kindLabel: string
  note: string
  rows: Array<[string, string]>
}

/** 无地图图纸时的类型安全空值；不会挂载到画布或显示为首发数据。 */
export const EMPTY_MAP_WORLD: MapWorldData = {
  name: '',
  sheet: '',
  explored: { pts: [] },
  features: []
}
