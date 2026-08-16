/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useSidebarSelectionMenuKit } from '../../../src/composables/useSidebarSelectionMenuKit'
import { useMultiSelect } from '../../../src/composables/useMultiSelect'

describe('useSidebarSelectionMenuKit', () => {
  it('switches context menu to the right-clicked unselected row', async () => {
    const kit = useSidebarSelectionMenuKit({
      getOrderedIds: () => ['a', 'b', 'c'],
      getRenderedIds: () => ['a', 'b', 'c']
    })

    kit.selectedIds.value = ['a', 'b']
    await nextTick()

    const mode = kit.openContextMenuFor('c')

    expect(mode).toBe('single')
    expect(kit.selectedIds.value).toEqual(['c'])
    expect(kit.isMenuOpen('c')).toBe(true)
    expect(kit.getMenuMode('c')).toBe('single')
  })

  it('keeps batch menu mode when right-clicking a row already inside current multi-selection', async () => {
    const kit = useSidebarSelectionMenuKit({
      getOrderedIds: () => ['a', 'b', 'c'],
      getRenderedIds: () => ['a', 'b', 'c']
    })

    kit.selectedIds.value = ['a', 'b']
    await nextTick()

    const mode = kit.openContextMenuFor('b')

    expect(mode).toBe('batch')
    expect(kit.selectedIds.value).toEqual(['a', 'b'])
    expect(kit.isMenuOpen('b')).toBe(true)
    expect(kit.getMenuMode('b')).toBe('batch')
  })

  it('keeps shift range selection anchored on the first selected item', async () => {
    const kit = useSidebarSelectionMenuKit({
      getOrderedIds: () => ['a', 'b', 'c', 'd'],
      getRenderedIds: () => ['a', 'b', 'c', 'd']
    })

    kit.selectOnly('a')
    await nextTick()

    kit.handleItemClick({
      id: 'd',
      event: new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true })
    })
    await nextTick()

    expect(kit.selectedIds.value).toEqual(['a', 'b', 'c', 'd'])
  })

  it('falls back to selectOnly when shift range selection has no anchorId', () => {
    const multiSelect = useMultiSelect({
      getOrderedIds: () => ['a', 'b', 'c']
    })

    multiSelect.selectRangeTo('c')

    expect(multiSelect.selectedIds.value).toEqual(['c'])
    expect(multiSelect.anchorId.value).toBe('c')
  })

  it('throws when selection anchor is missing from selected ids', () => {
    const multiSelect = useMultiSelect({
      getOrderedIds: () => ['a', 'b', 'c']
    })

    expect(() => {
      multiSelect.setSelectedIds(['a', 'b'], 'c')
    }).toThrow('[useMultiSelect] anchorId not found in selectedIds: c')
  })
})
