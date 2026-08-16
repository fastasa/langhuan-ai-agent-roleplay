export interface StatusPanelFieldDisplayMeta {
  key?: unknown
  label?: unknown
  unit?: unknown
}

/** 字段标题与单位分开存储；展示时统一拼成「标题（单位）」且兼容旧标题已内嵌同单位的实例。 */
export function statusPanelFieldDisplayLabel(field: StatusPanelFieldDisplayMeta): string {
  const label = String(field?.label ?? field?.key ?? '').trim()
  const unit = String(field?.unit ?? '').trim()
  if (!unit) return label
  if (label.endsWith(`（${unit}）`) || label.endsWith(`(${unit})`)) return label
  return `${label}（${unit}）`
}
