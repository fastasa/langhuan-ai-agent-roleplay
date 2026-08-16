export function syncScrollByRatio(source: HTMLElement, target: HTMLElement) {
  const sourceMax = source.scrollHeight - source.clientHeight
  const targetMax = target.scrollHeight - target.clientHeight
  if (sourceMax <= 0 || targetMax <= 0) {
    target.scrollTop = 0
    return
  }
  const ratio = source.scrollTop / sourceMax
  target.scrollTop = Math.max(0, Math.min(targetMax, ratio * targetMax))
}
