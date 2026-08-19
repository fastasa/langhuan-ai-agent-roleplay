type PromptOrderLike = {
  id?: unknown
  orderIndex?: unknown
  order_index?: unknown
  position?: unknown
}

export interface PromptPresetOrderingOptions {
  /** 默认关闭，避免旧 UI preset 因历史宽松字段立刻报错。 */
  strict?: boolean
}

export type PromptPresetOrderingValidationCode =
  | 'prompt_preset_invalid_order'
  | 'prompt_preset_order_alias_conflict'
  | 'prompt_preset_order_conflict'

export class PromptPresetOrderingValidationError extends Error {
  readonly code: PromptPresetOrderingValidationCode
  readonly fragmentId: string

  constructor(input: { code: PromptPresetOrderingValidationCode; fragmentId: string; message: string }) {
    super(input.message)
    this.name = 'PromptPresetOrderingValidationError'
    this.code = input.code
    this.fragmentId = input.fragmentId
  }
}

function presetFragmentId(item: PromptOrderLike, index: number): string {
  return String(item?.id ?? '').trim() || `preset_${index + 1}`
}

function validateStrictPromptOrders(items: PromptOrderLike[]): void {
  const seenOrders = new Map<number, string>()
  items.forEach((item, index) => {
    const fragmentId = presetFragmentId(item, index)
    const declared = [
      ['orderIndex', item?.orderIndex],
      ['order_index', item?.order_index],
      ['position', item?.position]
    ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>

    for (const [field, value] of declared) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new PromptPresetOrderingValidationError({
          code: 'prompt_preset_invalid_order',
          fragmentId,
          message: `Prompt preset ${fragmentId} 的 ${field} 必须是有限数字`
        })
      }
    }

    const values = [...new Set(declared.map((entry) => entry[1] as number))]
    if (values.length > 1) {
      throw new PromptPresetOrderingValidationError({
        code: 'prompt_preset_order_alias_conflict',
        fragmentId,
        message: `Prompt preset ${fragmentId} 声明了互相冲突的顺序字段`
      })
    }

    if (values.length === 1) {
      const order = values[0]
      const conflictingFragmentId = seenOrders.get(order)
      if (conflictingFragmentId) {
        throw new PromptPresetOrderingValidationError({
          code: 'prompt_preset_order_conflict',
          fragmentId,
          message: `Prompt preset ${fragmentId} 与 ${conflictingFragmentId} 的显式顺序冲突：${order}`
        })
      }
      seenOrders.set(order, fragmentId)
    }
  })
}

function readPromptOrderValue(item: PromptOrderLike, fallback: number): number {
  const value = Number(item?.orderIndex ?? item?.order_index ?? item?.position)
  return Number.isFinite(value) ? value : fallback
}

export function sortPromptPresetsForAssembly<T extends PromptOrderLike>(
  items: T[],
  options: PromptPresetOrderingOptions = {}
): T[] {
  if (options.strict) validateStrictPromptOrders(items)
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

export function normalizePromptPresetAssemblyOrder<T extends PromptOrderLike>(
  items: T[],
  options: PromptPresetOrderingOptions = {}
): Array<T & { orderIndex: number }> {
  return sortPromptPresetsForAssembly(items, options).map((item, index) => ({
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
