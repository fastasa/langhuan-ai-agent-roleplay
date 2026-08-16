export const CHARACTER_BRAIN_MIN_VIEWPORT_SCALE = 0.005
export const CHARACTER_BRAIN_MAX_VIEWPORT_SCALE = 1.6

const NODE_MARKER_MIN_SCREEN_SCALE = 0.28

export function resolveCharacterBrainNodeMarkerScale(
  viewportScale: number,
  canvasScreenScale: number
) {
  const screenScale = Math.max(viewportScale * canvasScreenScale, 0.0001)
  return Math.max(1, NODE_MARKER_MIN_SCREEN_SCALE / screenScale)
}

export function resolveCharacterBrainRadialDistance(
  longestLabelLength: number,
  labelFontSize: number
) {
  const estimatedLabelWidth = Math.max(0, longestLabelLength) * Math.max(0, labelFontSize) * 0.62
  return Math.min(260, Math.max(160, estimatedLabelWidth + 104))
}
