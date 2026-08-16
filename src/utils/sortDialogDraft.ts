export type SortDialogDraftDirection = -1 | 1

export type SortDialogDraftItem = {
  id: string
}

export type SortDialogDraftMoveResult<T extends SortDialogDraftItem> = {
  items: T[]
  focusId: string
  edge: 'top' | 'bottom' | 'middle'
}

export function moveSortDialogDraftItems<T extends SortDialogDraftItem>(
  items: T[],
  movingIds: string[],
  direction: SortDialogDraftDirection
): SortDialogDraftMoveResult<T> | null {
  if (items.length < 2 || !movingIds.length) return null
  const movingSet = new Set(movingIds)
  if (items.every((item) => movingSet.has(item.id))) return null

  const focusId = movingIds.find((id) => items.some((item) => item.id === id)) || ''
  const movingItems = items.filter((item) => movingSet.has(item.id))
  const fixedItems = items.filter((item) => !movingSet.has(item.id))
  if (!movingItems.length || !fixedItems.length || !focusId) return null

  if (direction < 0) {
    const firstIndex = items.findIndex((item) => movingSet.has(item.id))
    const previousFixedItem = items.slice(0, firstIndex).reverse().find((item) => !movingSet.has(item.id))
    if (!previousFixedItem) {
      return {
        items: [...fixedItems, ...movingItems],
        focusId,
        edge: 'bottom'
      }
    }
    const insertIndex = fixedItems.findIndex((item) => item.id === previousFixedItem.id)
    const nextItems = [...fixedItems]
    nextItems.splice(insertIndex, 0, ...movingItems)
    return {
      items: nextItems,
      focusId,
      edge: 'middle'
    }
  }

  const reversedIndex = [...items].reverse().findIndex((item) => movingSet.has(item.id))
  const lastIndex = reversedIndex < 0 ? -1 : items.length - 1 - reversedIndex
  const nextFixedItem = items.slice(lastIndex + 1).find((item) => !movingSet.has(item.id))
  if (!nextFixedItem) {
    return {
      items: [...movingItems, ...fixedItems],
      focusId,
      edge: 'top'
    }
  }
  const insertIndex = fixedItems.findIndex((item) => item.id === nextFixedItem.id) + 1
  const nextItems = [...fixedItems]
  nextItems.splice(insertIndex, 0, ...movingItems)
  return {
    items: nextItems,
    focusId,
    edge: 'middle'
  }
}
