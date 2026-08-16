export type WorldbookTreeDragRowKind = 'document' | 'folder' | 'cluster'

export type WorldbookTreePreviewTarget = {
  kind: 'root' | WorldbookTreeDragRowKind
  id: string
  mode: 'before' | 'after' | 'inside'
}

export type WorldbookTreeAutoExpandState = {
  hoverKey: string
  hoverStartedAt: number
  lastExpandedKey: string
  lastExpandedAt: number
}

type PointerPoint = {
  x: number
  y: number
}

type ClusterHit = {
  id: string
  rect: DOMRect
  open: boolean
}

type RowHit = {
  id: string
  kind: 'folder' | 'document'
  rect: DOMRect
  open?: boolean
}

type ResolveWorldbookTreePointerTargetOptions = {
  pendingRowKind: WorldbookTreeDragRowKind
  pointerX: number
  pointerY: number
  sinkEnabled: boolean
  sinkOnlyMode: boolean
  resolveBufferedTarget: (rowKind: WorldbookTreeDragRowKind) => WorldbookTreePreviewTarget | null
  resolveClusterHit: (point: PointerPoint) => ClusterHit | null
  resolveRowHit: (point: PointerPoint) => RowHit | null
  resolveTreeRect?: () => DOMRect | null
  onExpandCluster?: (clusterId: string) => void
  onExpandFolder?: (folderId: string) => void
  autoExpandState?: WorldbookTreeAutoExpandState
  autoExpandDelayMs?: number
  autoExpandCooldownMs?: number
}

function queueWorldbookAutoExpand(
  state: WorldbookTreeAutoExpandState | undefined,
  key: string,
  trigger: () => void,
  delayMs: number,
  cooldownMs: number
) {
  if (!state || !key) {
    trigger()
    return
  }
  const now = Date.now()
  if (state.hoverKey !== key) {
    state.hoverKey = key
    state.hoverStartedAt = now
    return
  }
  if (state.lastExpandedKey === key && now - state.lastExpandedAt < cooldownMs) {
    return
  }
  if (now - state.hoverStartedAt < delayMs) {
    return
  }
  state.lastExpandedKey = key
  state.lastExpandedAt = now
  trigger()
}

export function resetWorldbookTreeAutoExpandState(state: WorldbookTreeAutoExpandState | undefined) {
  if (!state) return
  state.hoverKey = ''
  state.hoverStartedAt = 0
}

export function insertEntriesAroundTarget(
  currentOrder: string[],
  entryIds: string[],
  targetEntryId: string,
  position: 'before' | 'after' = 'after'
) {
  const normalizedEntries = Array.from(new Set(entryIds.map((item) => String(item || '').trim()).filter(Boolean)))
  const normalizedTargetId = String(targetEntryId || '').trim()
  const movingSet = new Set(normalizedEntries)
  const remaining = currentOrder.filter((item) => !movingSet.has(String(item || '').trim()))
  if (!normalizedEntries.length) return remaining
  if (!normalizedTargetId) {
    remaining.push(...normalizedEntries)
    return remaining
  }
  const targetIndex = remaining.indexOf(normalizedTargetId)
  if (targetIndex < 0) {
    remaining.push(...normalizedEntries)
    return remaining
  }
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  remaining.splice(insertIndex, 0, ...normalizedEntries)
  return remaining
}

export function resolveWorldbookTreePointerTarget(options: ResolveWorldbookTreePointerTargetOptions): WorldbookTreePreviewTarget | null {
  const point = { x: options.pointerX, y: options.pointerY }
  const autoExpandDelayMs = Number.isFinite(options.autoExpandDelayMs) ? Number(options.autoExpandDelayMs) : 180
  const autoExpandCooldownMs = Number.isFinite(options.autoExpandCooldownMs) ? Number(options.autoExpandCooldownMs) : 320

  // 世界树这里改成和联系人同一路子：
  // 开启沉底时，先尝试命中容器头部（树簇/枝），命中就直接判 inside；
  // 没命中容器时，再回退到普通 before/after 排序。
  if (options.sinkEnabled && options.pendingRowKind !== 'cluster') {
    const clusterHit = options.resolveClusterHit(point)
    if (clusterHit) {
      if (!clusterHit.open) {
        queueWorldbookAutoExpand(
          options.autoExpandState,
          `cluster:${clusterHit.id}`,
          () => options.onExpandCluster?.(clusterHit.id),
          autoExpandDelayMs,
          autoExpandCooldownMs
        )
      }
      return { kind: 'cluster', id: clusterHit.id, mode: 'inside' }
    }

    const rowHit = options.resolveRowHit(point)
    if (rowHit?.kind === 'folder') {
      if (!rowHit.open) {
        queueWorldbookAutoExpand(
          options.autoExpandState,
          `folder:${rowHit.id}`,
          () => options.onExpandFolder?.(rowHit.id),
          autoExpandDelayMs,
          autoExpandCooldownMs
        )
      }
      return { kind: 'folder', id: rowHit.id, mode: 'inside' }
    }
  }

  resetWorldbookTreeAutoExpandState(options.autoExpandState)

  const bufferedTarget = options.resolveBufferedTarget(options.pendingRowKind)
  if (bufferedTarget) return bufferedTarget

  if (options.pendingRowKind === 'cluster') {
    const clusterHit = options.resolveClusterHit(point)
    if (!clusterHit) return null
    return {
      kind: 'cluster',
      id: clusterHit.id,
      mode: point.y >= clusterHit.rect.top + clusterHit.rect.height / 2 ? 'after' : 'before'
    }
  }

  const rowHit = options.resolveRowHit(point)
  if (!rowHit) return null
  return {
    kind: rowHit.kind,
    id: rowHit.id,
    mode: point.y >= rowHit.rect.top + rowHit.rect.height / 2 ? 'after' : 'before'
  }
}
