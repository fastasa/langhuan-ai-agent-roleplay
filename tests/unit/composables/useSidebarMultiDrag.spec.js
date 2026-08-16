/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { useSidebarMultiDrag } from '../../../src/composables/useSidebarMultiDrag'

describe('useSidebarMultiDrag', () => {
  it('keeps multi-dragged ids in rendered order instead of selection order', () => {
    const drag = useSidebarMultiDrag({
      getOrderedIds: () => ['a', 'b', 'c', 'd'],
      getSelectedIds: () => ['c', 'b']
    })

    drag.startDrag('b')

    expect(drag.draggingIds.value).toEqual(['b', 'c'])
    expect(drag.previewDrop('d', 'after')).toBe(true)
    expect(drag.projectedOrder.value).toEqual(['a', 'd', 'b', 'c'])
    expect(drag.buildProjectedDropPayload()).toEqual({
      draggedIds: ['b', 'c'],
      targetId: 'd',
      position: 'after'
    })
  })
})
