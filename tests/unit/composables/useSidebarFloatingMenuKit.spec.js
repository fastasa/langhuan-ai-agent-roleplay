/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSidebarFloatingMenuKit } from '../../../src/composables/useSidebarFloatingMenuKit'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeTrigger(rect) {
  const button = document.createElement('button')
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({})
  })
  return button
}

describe('useSidebarFloatingMenuKit', () => {
  it('opens row menus to the right of the selected sidebar row', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true })
    const trigger = makeTrigger({ left: 32, top: 240, width: 248, height: 42 })
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'currentTarget', { value: trigger, configurable: true })
    const kit = useSidebarFloatingMenuKit({ menuWidth: 184, estimatedHeight: 180, gap: 6, viewportPadding: 8 })

    kit.updateFloatingMenuPosition(event)

    expect(kit.floatingMenuStyle.value.left).toBe('286px')
    expect(kit.floatingMenuStyle.value.top).toBe('240px')
    expect(kit.floatingMenuStyle.value.overflowY).toBe('auto')
  })

  it('keeps a bottom row menu inside the viewport without covering the sidebar column', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true })
    const trigger = makeTrigger({ left: 32, top: 640, width: 248, height: 42 })
    const event = new MouseEvent('contextmenu')
    Object.defineProperty(event, 'currentTarget', { value: trigger, configurable: true })
    const kit = useSidebarFloatingMenuKit({ menuWidth: 184, estimatedHeight: 312, gap: 6, viewportPadding: 8 })

    kit.updateFloatingMenuPosition(event)

    expect(kit.floatingMenuStyle.value.left).toBe('286px')
    expect(kit.floatingMenuStyle.value.top).toBe('400px')
    expect(kit.floatingMenuStyle.value.maxHeight).toBe('312px')
  })

  it('can still align an explicit dropdown to the trigger edge', () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true })
    const trigger = makeTrigger({ left: 220, top: 40, width: 32, height: 28 })
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'currentTarget', { value: trigger, configurable: true })
    const kit = useSidebarFloatingMenuKit({
      menuWidth: 148,
      estimatedHeight: 96,
      gap: 6,
      viewportPadding: 8,
      placement: 'below',
      horizontalPlacement: 'align-right'
    })

    kit.updateFloatingMenuPosition(event)

    expect(kit.floatingMenuStyle.value.left).toBe('104px')
    expect(kit.floatingMenuStyle.value.top).toBe('74px')
  })

  it('anchors above pointer menus with the pointer as the lower-left corner', () => {
    Object.defineProperty(window, 'innerWidth', { value: 520, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 520, configurable: true })
    const trigger = makeTrigger({ left: 4, top: 460, width: 38, height: 38 })
    const event = new MouseEvent('click', { clientX: 24, clientY: 488 })
    Object.defineProperty(event, 'currentTarget', { value: trigger, configurable: true })
    const kit = useSidebarFloatingMenuKit({
      menuWidth: 276,
      estimatedHeight: 228,
      placement: 'above',
      horizontalPlacement: 'align-right',
      viewportPadding: 8
    })

    kit.updateFloatingMenuPosition(event)

    expect(kit.floatingMenuStyle.value.left).toBe('24px')
    expect(kit.floatingMenuStyle.value.top).toBe('488px')
    expect(kit.floatingMenuStyle.value.transform).toBe('translateY(-100%)')
  })
})
