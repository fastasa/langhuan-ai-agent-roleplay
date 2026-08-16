import type { AgentContextBundle, AgentContextProjectionKind } from '../../../shared/agentContextProjection'

type AnyRecord = Record<string, any>

function clean(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).replace(/\s+/g, ' ').trim()
    : ''
}

function readable(value: unknown, depth = 0): string {
  const scalar = clean(value)
  if (scalar) return scalar
  if (depth > 2) return ''
  if (Array.isArray(value)) return value.map((item) => readable(item, depth + 1)).filter(Boolean).join('、')
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value as AnyRecord).map(([key, item]) => {
    const rendered = readable(item, depth + 1)
    return rendered ? `${key}：${rendered}` : ''
  }).filter(Boolean).join('；')
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value
}

function valueOf(bundle: AgentContextBundle, kind: AgentContextProjectionKind): AnyRecord | null {
  const result = bundle.projections.find((item) => item.status === 'available' && item.projection.kind === kind)
  return result?.status === 'available' ? (result.projection.value as AnyRecord || {}) : null
}

function section(title: string, lines: string[]): string {
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
  return unique.length ? `【${title}】\n${unique.join('\n')}` : ''
}

function renderScene(bundle: AgentContextBundle): string[] {
  const value = valueOf(bundle, 'session.world_context')
  if (!value?.mounted) return []
  const curtain = value.curtain || {}
  const location = [curtain.locationLarge, curtain.locationMiddle, curtain.locationSmall].map(clean).filter(Boolean).join(' / ') || clean(curtain.location)
  return [
    location ? `地点：${location}` : '',
    clean(curtain.time) ? `时间：${clean(curtain.time)}` : '',
    clean(curtain.weather) ? `天气：${clean(curtain.weather)}` : ''
  ].filter(Boolean)
}

function renderRecentFacts(bundle: AgentContextBundle): string[] {
  const value = valueOf(bundle, 'chat.visible_context')
  const items = Array.isArray(value?.items) ? value.items : []
  const anchorMessageId = Number(value?.anchorMessageId || 0)
  return items.filter((item: AnyRecord) => Number(item.ref?.messageId || 0) !== anchorMessageId).slice(-10).map((item: AnyRecord) => {
    const fact = clip(readable(item.fact), 700)
    const uncertainty = clip(readable(item.uncertainty), 240)
    return fact ? `${clean(item.speakerName) || '未知说话人'}：${fact}${uncertainty ? `（仍不确定：${uncertainty}）` : ''}` : ''
  }).filter(Boolean)
}

function renderObservableProfiles(bundle: AgentContextBundle): string[] {
  const profiles = valueOf(bundle, 'character.observable_profile')?.profiles
  if (!Array.isArray(profiles)) return []
  return profiles.slice(0, 8).map((profile: AnyRecord) => {
    const appearance = clip(readable(profile.appearance), 600)
    const outfit = clip(readable(profile.outfit), 400)
    const details = [appearance ? `外貌：${appearance}` : '', outfit ? `衣着：${outfit}` : ''].filter(Boolean).join('；')
    return details ? `${clean(profile.name) || '未识别角色'}：${details}` : ''
  }).filter(Boolean)
}

function renderStatus(bundle: AgentContextBundle): string[] {
  const panels = valueOf(bundle, 'status.panels')?.panels
  if (!Array.isArray(panels)) return []
  return panels.slice(0, 4).map((panel: AnyRecord) => {
    const fields = Array.isArray(panel.fields) ? panel.fields.slice(0, 8).map((field: AnyRecord) => {
      const value = field.valueType === 'ref'
        ? (Array.isArray(field.references) ? field.references.map((item: AnyRecord) => clean(item.name)).filter(Boolean).join('、') : '')
        : clip(readable(field.value), 300)
      return value ? `${clean(field.label) || clean(field.key)}：${value}` : ''
    }).filter(Boolean) : []
    return fields.length ? `${clean(panel.name) || '当前状态'}：${fields.join('；')}` : ''
  }).filter(Boolean)
}

/** 动作前台只看可直接用于成文的事实；剧本种子、编排工作台与审计元数据不在此层出现。 */
export function renderFocusedActionContext(bundle: AgentContextBundle): string {
  return [
    section('当前场景', renderScene(bundle)),
    section('最近发生的事', renderRecentFacts(bundle)),
    section('现场可观察人物', renderObservableProfiles(bundle)),
    section('已确认状态', renderStatus(bundle))
  ].filter(Boolean).join('\n\n')
}
