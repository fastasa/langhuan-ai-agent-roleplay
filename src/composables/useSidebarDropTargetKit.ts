type DropPosition = 'before' | 'after'

type DropTarget = {
  targetId: string
  position: DropPosition
}

type ResolveBufferedOptions = {
  readId?: (element: HTMLElement) => string
  exactBandRatio?: number
  expansionRatio?: number
  edgeBuffer?: number
}

function defaultReadId(element: HTMLElement) {
  return String(element.dataset.multiSelectId || element.dataset.docDragId || '').trim()
}

function getExpandedRect(rect: DOMRect, expansionRatio: number) {
  const extra = rect.height * expansionRatio
  return {
    top: rect.top - extra,
    bottom: rect.bottom + extra,
    midpoint: rect.top + rect.height / 2
  }
}

export function resolveBufferedDropTarget(
  rows: HTMLElement[],
  pointerY: number,
  exactRow?: HTMLElement | null,
  options?: ResolveBufferedOptions
): DropTarget | null {
  // 这里负责统一“靠近哪一行、插到前还是后”的缓冲判定。
  // 普通列表和树列表都可以复用，但页面层必须先把自己的可见行映射成稳定 id，
  // 这样批量选择、拖动投影和最终落库才会使用同一套坐标系。
  const readId = options?.readId || defaultReadId
  const exactBandRatio = Number.isFinite(options?.exactBandRatio) ? Number(options?.exactBandRatio) : 0.35
  const expansionRatio = Number.isFinite(options?.expansionRatio) ? Number(options?.expansionRatio) : 0.4
  const edgeBuffer = Number.isFinite(options?.edgeBuffer) ? Number(options?.edgeBuffer) : 22

  if (exactRow) {
    const exactTargetId = readId(exactRow)
    if (exactTargetId) {
      const rect = exactRow.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const topThreshold = rect.top + rect.height * exactBandRatio
      const bottomThreshold = rect.bottom - rect.height * exactBandRatio
      return {
        targetId: exactTargetId,
        position: pointerY <= topThreshold
          ? 'before'
          : pointerY >= bottomThreshold
            ? 'after'
            : pointerY >= midpoint
              ? 'after'
              : 'before'
      }
    }
  }

  if (!rows.length) return null

  const firstRect = getExpandedRect(rows[0].getBoundingClientRect(), expansionRatio)
  if (pointerY <= firstRect.top + edgeBuffer) {
    const targetId = readId(rows[0])
    return targetId ? { targetId, position: 'before' } : null
  }

  const lastRect = getExpandedRect(rows[rows.length - 1].getBoundingClientRect(), expansionRatio)
  if (pointerY >= lastRect.bottom - edgeBuffer) {
    const targetId = readId(rows[rows.length - 1])
    return targetId ? { targetId, position: 'after' } : null
  }

  for (const row of rows) {
    const targetId = readId(row)
    if (!targetId) continue
    const expandedRect = getExpandedRect(row.getBoundingClientRect(), expansionRatio)
    if (pointerY < expandedRect.top || pointerY > expandedRect.bottom) continue
    return {
      targetId,
      position: pointerY >= expandedRect.midpoint ? 'after' : 'before'
    }
  }

  let nearest: { targetId: string; position: DropPosition; distance: number } | null = null
  for (const row of rows) {
    const targetId = readId(row)
    if (!targetId) continue
    const rect = row.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = pointerY >= midpoint ? 'after' : 'before'
    const anchorY = position === 'after' ? rect.bottom : rect.top
    const distance = Math.abs(pointerY - anchorY)
    if (!nearest || distance < nearest.distance) {
      nearest = { targetId, position, distance }
    }
  }

  if (!nearest) return null
  return { targetId: nearest.targetId, position: nearest.position }
}

export function getVisibleSidebarElements(selector: string) {
  if (typeof document === 'undefined') return []
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((row) => row.offsetParent !== null)
}

type PointerDropTargetOptions = ResolveBufferedOptions & {
  selector: string
  pointerX: number
  pointerY: number
}

export function resolvePointerDropTarget(options: PointerDropTargetOptions) {
  if (typeof document === 'undefined') return null
  const exactRow = document.elementFromPoint(options.pointerX, options.pointerY)?.closest(options.selector) as HTMLElement | null
  return resolveBufferedDropTarget(
    getVisibleSidebarElements(options.selector),
    options.pointerY,
    exactRow,
    options
  )
}

export function resolveDropTargetFromDragEvent(
  event: DragEvent,
  selector: string,
  readId: (element: HTMLElement) => string,
  options?: ResolveBufferedOptions
) {
  const container = event.currentTarget
  if (!(container instanceof HTMLElement) || typeof event.clientY !== 'number') return null
  const rows = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((element) => Boolean(readId(element)))
  const exactRow = event.target instanceof HTMLElement ? event.target.closest(selector) as HTMLElement | null : null
  return resolveBufferedDropTarget(rows, event.clientY, exactRow, {
    ...options,
    readId
  })
}
