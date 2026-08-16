import type { MapDrawTrace } from './mapArmor/types'

function printable(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

/** 运行卡展开区直接展示的完整记录文本；不另造第二份展示真值。 */
export function renderMapDrawTrace(trace: MapDrawTrace): string {
  const title = trace.kind === 'mountain-armor'
    ? '山脉绘制'
    : trace.kind === 'grass-armor'
      ? '草原绘制'
      : trace.kind === 'river-armor'
        ? '河流绘制'
        : trace.kind === 'water-armor'
          ? '水体绘制'
          : '结构化矢量'
  return [`【作图记录·${title}·v${trace.version}】`, ...trace.steps.flatMap((step, index) => [
    '',
    `${index + 1}. ${step.status === 'success' ? '✓' : '✗'} ${step.label}`,
    printable(step.data)
  ])].join('\n')
}
