import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { useMultiSelect } from './useMultiSelect.ts'

describe('useMultiSelect', () => {
  it('clears selection when the ordered-id scope changes', async () => {
    const orderedIds = ref(['brain:char_a:core', 'brain:char_a:soul'])
    const resetKey = ref('char_a')
    const holder = { multiSelect: null }

    const wrapper = mount(defineComponent({
      setup() {
        holder.multiSelect = useMultiSelect({
          getOrderedIds: () => orderedIds.value,
          getResetKey: () => resetKey.value
        })
        return () => null
      }
    }))

    const multiSelect = holder.multiSelect
    expect(multiSelect).toBeTruthy()
    multiSelect.selectOnly('brain:char_a:core')
    expect(multiSelect.selectedIds.value).toEqual(['brain:char_a:core'])

    orderedIds.value = ['brain:char_b:core', 'brain:char_b:soul']
    resetKey.value = 'char_b'
    await nextTick()

    expect(multiSelect.selectedIds.value).toEqual([])
    expect(multiSelect.anchorId.value).toBe('')

    wrapper.unmount()
  })
})
