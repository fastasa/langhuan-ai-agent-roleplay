export const DEFAULT_SIDEBAR_WIDTH = 284
export const DEFAULT_COLOR_BOARD_HEIGHT = 184
export const DEFAULT_LAYER_HEIGHT = 190
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 520
export const MIN_COLOR_BOARD_HEIGHT = 116
export const MIN_COLOR_CARDS_HEIGHT = 112
export const MIN_LAYER_HEIGHT = 116
export const RESIZE_HANDLE_TOTAL_HEIGHT = 14

export interface PixelPanelLayout {
  sidebarWidth: number
  colorBoardHeight: number
  layerHeight: number
}

export const DEFAULT_PANEL_LAYOUT: PixelPanelLayout = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  colorBoardHeight: DEFAULT_COLOR_BOARD_HEIGHT,
  layerHeight: DEFAULT_LAYER_HEIGHT
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const availableMax = viewportWidth > 0 ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - 420)) : MAX_SIDEBAR_WIDTH
  return Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(availableMax, width)))
}

export function clampVerticalLayout(layout: PixelPanelLayout, sideHeight: number): PixelPanelLayout {
  const usable = Math.max(MIN_COLOR_BOARD_HEIGHT + MIN_COLOR_CARDS_HEIGHT + MIN_LAYER_HEIGHT, sideHeight - RESIZE_HANDLE_TOTAL_HEIGHT)
  const colorBoardHeight = Math.max(MIN_COLOR_BOARD_HEIGHT, Math.min(layout.colorBoardHeight, usable - MIN_COLOR_CARDS_HEIGHT - MIN_LAYER_HEIGHT))
  const layerHeight = Math.max(MIN_LAYER_HEIGHT, Math.min(layout.layerHeight, usable - colorBoardHeight - MIN_COLOR_CARDS_HEIGHT))
  return { ...layout, colorBoardHeight: Math.round(colorBoardHeight), layerHeight: Math.round(layerHeight) }
}

export function parsePanelLayout(raw: string | null): PixelPanelLayout {
  if (!raw) return { ...DEFAULT_PANEL_LAYOUT }
  try {
    const value = JSON.parse(raw) as Partial<PixelPanelLayout>
    return {
      sidebarWidth: finiteOr(value.sidebarWidth, DEFAULT_SIDEBAR_WIDTH),
      colorBoardHeight: finiteOr(value.colorBoardHeight, DEFAULT_COLOR_BOARD_HEIGHT),
      layerHeight: finiteOr(value.layerHeight, DEFAULT_LAYER_HEIGHT)
    }
  } catch {
    return { ...DEFAULT_PANEL_LAYOUT }
  }
}
