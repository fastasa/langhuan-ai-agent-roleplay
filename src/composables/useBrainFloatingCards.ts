export type BrainFloatingBounds = {
  width: number
  height: number
}

export type BrainFloatingViewport = {
  offsetX: number
  offsetY: number
  scale: number
}

export type BrainFloatingViewBox = {
  width: number
  height: number
}

export type BrainFloatingNode = {
  x: number
  y: number
  size: number
}

export type BrainFloatingPosition = {
  left: number
  top: number
}

export function resolveBrainAttachedCardPosition(options: {
  node: BrainFloatingNode
  bounds: BrainFloatingBounds
  viewBox: BrainFloatingViewBox
  viewport: BrainFloatingViewport
  cardWidth: number
  cardHeight: number
  edgeGap: number
  attachGap: number
  nodeRadius: (size: number) => number
}): BrainFloatingPosition {
  const { node, bounds, viewBox, viewport, cardWidth, cardHeight, edgeGap, attachGap, nodeRadius } = options
  const anchor = sceneToCanvasPoint(node.x, node.y, bounds, viewBox, viewport)
  const radius = nodeRadius(node.size) * Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height)
  const candidates = [
    { left: anchor.x - (cardWidth / 2), top: anchor.y + radius + attachGap },
    { left: anchor.x - (cardWidth / 2), top: anchor.y - radius - attachGap - cardHeight },
    { left: anchor.x + radius + attachGap, top: anchor.y - (cardHeight / 2) },
    { left: anchor.x - radius - attachGap - cardWidth, top: anchor.y - (cardHeight / 2) }
  ]

  return candidates
    .map((candidate) => {
      const clamped = clampCardPosition(candidate, bounds, cardWidth, cardHeight, edgeGap)
      const overflow =
        Math.max(edgeGap - candidate.left, 0)
        + Math.max(candidate.left + cardWidth + edgeGap - bounds.width, 0)
        + Math.max(edgeGap - candidate.top, 0)
        + Math.max(candidate.top + cardHeight + edgeGap - bounds.height, 0)
      const anchorDistance = Math.abs(clamped.left - candidate.left) + Math.abs(clamped.top - candidate.top)
      return {
        ...clamped,
        score: (overflow * 1000) + anchorDistance
      }
    })
    .sort((a, b) => a.score - b.score)[0]
}

export function clampBrainFloatingCardPosition(
  position: BrainFloatingPosition,
  bounds: BrainFloatingBounds,
  cardWidth: number,
  cardHeight: number,
  edgeGap: number
): BrainFloatingPosition {
  return clampCardPosition(position, bounds, cardWidth, cardHeight, edgeGap)
}

export function clampBrainEdgeTabTop(bounds: BrainFloatingBounds, tabHeight: number, edgeGap: number, top: number) {
  return clamp(top, edgeGap, Math.max(bounds.height - tabHeight - edgeGap, edgeGap))
}

function sceneToCanvasPoint(
  x: number,
  y: number,
  bounds: BrainFloatingBounds,
  viewBox: BrainFloatingViewBox,
  viewport: BrainFloatingViewport
) {
  return {
    x: ((x * viewport.scale) + viewport.offsetX) * (bounds.width / viewBox.width),
    y: ((y * viewport.scale) + viewport.offsetY) * (bounds.height / viewBox.height)
  }
}

function clampCardPosition(
  position: BrainFloatingPosition,
  bounds: BrainFloatingBounds,
  cardWidth: number,
  cardHeight: number,
  edgeGap: number
) {
  return {
    left: clamp(position.left, edgeGap, Math.max(bounds.width - cardWidth - edgeGap, edgeGap)),
    top: clamp(position.top, edgeGap, Math.max(bounds.height - cardHeight - edgeGap, edgeGap))
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
