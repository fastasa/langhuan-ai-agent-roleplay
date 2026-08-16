import { describe, expect, it } from 'vitest'
import { PIXEL_ICONS } from '../../../src/pixel-studio/ui/icons'

describe('pixel-studio icons（Lucide ISC 内联拷贝）', () => {
  const EXPECTED_NAMES = ['pencil', 'eraser', 'minus', 'square', 'circle', 'square-dashed', 'pipette', 'wand-sparkles', 'undo-2', 'redo-2']

  it('收录了工具栏与菜单栏用到的全部图标名', () => {
    for (const name of EXPECTED_NAMES) {
      expect(PIXEL_ICONS[name]).toBeTruthy()
    }
  })

  it('每个图标至少有一个 SVG 子元素，且 tag/attrs 结构合法', () => {
    for (const name of Object.keys(PIXEL_ICONS)) {
      const elements = PIXEL_ICONS[name]
      expect(elements.length).toBeGreaterThan(0)
      for (const el of elements) {
        expect(['path', 'rect', 'circle']).toContain(el.tag)
        expect(el.attrs && typeof el.attrs === 'object').toBe(true)
        if (el.tag === 'path') {
          expect(typeof el.attrs.d).toBe('string')
          expect(el.attrs.d.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
