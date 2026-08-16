import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PANEL_LAYOUT,
  MIN_COLOR_BOARD_HEIGHT,
  MIN_COLOR_CARDS_HEIGHT,
  MIN_LAYER_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
  clampVerticalLayout,
  parsePanelLayout
} from '../../../src/pixel-studio/ui/panelLayout'

describe('pixel-studio panelLayout', () => {
  it('右栏宽度保留画布最小空间，并钳住自身最小宽度', () => {
    expect(clampSidebarWidth(100, 1200)).toBe(MIN_SIDEBAR_WIDTH)
    expect(clampSidebarWidth(800, 900)).toBe(480)
  })

  it('三段高度始终给色板、色卡、图层留下最小操作空间', () => {
    const next = clampVerticalLayout({ sidebarWidth: 284, colorBoardHeight: 999, layerHeight: 999 }, 700)
    expect(next.colorBoardHeight).toBeGreaterThanOrEqual(MIN_COLOR_BOARD_HEIGHT)
    expect(next.layerHeight).toBeGreaterThanOrEqual(MIN_LAYER_HEIGHT)
    expect(700 - 14 - next.colorBoardHeight - next.layerHeight).toBeGreaterThanOrEqual(MIN_COLOR_CARDS_HEIGHT)
  })

  it('损坏的本机布局偏好回落默认值', () => {
    expect(parsePanelLayout('{bad json')).toEqual(DEFAULT_PANEL_LAYOUT)
  })
})
