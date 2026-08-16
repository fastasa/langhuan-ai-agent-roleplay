/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useTreeExpandPersistence } from '../../../src/composables/useTreeExpandPersistence.ts'

describe('useTreeExpandPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认没有持久化记录时返回空集合（即全部按折叠处理）', () => {
    const { loadExpandedIds } = useTreeExpandPersistence('langhuan_test_tree_expand_v1')
    const expandedIds = loadExpandedIds()
    expect(expandedIds.size).toBe(0)
  })

  it('保存后可以按账号命名空间原样读回展开的节点 id', () => {
    const { loadExpandedIds, saveExpandedIds } = useTreeExpandPersistence('langhuan_test_tree_expand_v1')
    saveExpandedIds(['a', 'b', 'a'])

    const expandedIds = loadExpandedIds()
    expect(Array.from(expandedIds).sort()).toEqual(['a', 'b'])
  })

  it('损坏的本地存储内容不会抛错，回退为空集合', () => {
    localStorage.setItem('langhuan_test_tree_expand_v1:local', '{not-json')
    const { loadExpandedIds } = useTreeExpandPersistence('langhuan_test_tree_expand_v1')
    expect(loadExpandedIds().size).toBe(0)
  })
})
