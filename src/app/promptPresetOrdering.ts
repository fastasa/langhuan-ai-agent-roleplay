type PromptOrderLike = {
  orderIndex?: unknown
  order_index?: unknown
  position?: unknown
}

function readPromptOrderValue(item: PromptOrderLike, fallback: number): number {
  const value = Number(item?.orderIndex ?? item?.order_index ?? item?.position)
  return Number.isFinite(value) ? value : fallback
}

export function sortPromptPresetsForAssembly<T extends PromptOrderLike>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftOrder = readPromptOrderValue(left.item, left.index)
      const rightOrder = readPromptOrderValue(right.item, right.index)
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.index - right.index
    })
    .map(({ item }) => item)
}

export function normalizePromptPresetAssemblyOrder<T extends PromptOrderLike>(items: T[]): Array<T & { orderIndex: number }> {
  return sortPromptPresetsForAssembly(items).map((item, index) => ({
    ...item,
    orderIndex: index
  }))
}

export function assignPromptPresetAssemblyOrder<T extends PromptOrderLike>(items: T[]): Array<T & { orderIndex: number }> {
  return items.map((item, index) => ({
    ...item,
    orderIndex: index
  }))
}
