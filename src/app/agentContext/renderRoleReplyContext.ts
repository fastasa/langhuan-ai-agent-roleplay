import type { AgentContextBundle, AgentContextProjectionKind } from '../../../shared/agentContextProjection'
import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge'
import { renderRimWorldPawnContext } from './renderRimWorldPawnContext'

type AnyRecord = Record<string, any>

const PROFILE_FIELDS: Array<[string, string, number]> = [
  ['introduction', '身份与经历', 1000],
  ['personality', '性格', 1200],
  ['speakingStyle', '说话方式', 800],
  ['background', '背景', 800],
  ['experience', '重要经历', 800],
  ['worldview', '观念', 600],
  ['hobbies', '喜好', 400],
  ['abilities', '能力', 500]
]

function cleanScalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).replace(/\s+/g, ' ').trim()
  }
  return ''
}

function readableValue(value: unknown, depth = 0): string {
  const scalar = cleanScalar(value)
  if (scalar) return scalar
  if (depth > 2) return ''
  if (Array.isArray(value)) return value.map((item) => readableValue(item, depth + 1)).filter(Boolean).join('、')
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value as AnyRecord)
    .map(([key, item]) => {
      const rendered = readableValue(item, depth + 1)
      return rendered ? `${key}：${rendered}` : ''
    })
    .filter(Boolean)
    .join('；')
}

function clip(value: string, max: number): string {
  const text = value.trim()
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
}

function projectionValue(bundle: AgentContextBundle, kind: AgentContextProjectionKind): AnyRecord | null {
  const result = bundle.projections.find((item) => item.status === 'available' && item.projection.kind === kind)
  return result?.status === 'available' ? (result.projection.value as AnyRecord || {}) : null
}

function section(title: string, lines: string[]): string {
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))]
  return unique.length ? `【${title}】\n${unique.join('\n')}` : ''
}

function renderProfile(profile: AnyRecord, includeName = false, options: { includeAbilities?: boolean } = {}): string[] {
  const lines: string[] = []
  if (includeName && cleanScalar(profile.name)) lines.push(`姓名：${cleanScalar(profile.name)}`)
  const basics = [
    cleanScalar(profile.gender) ? `性别：${cleanScalar(profile.gender)}` : '',
    cleanScalar(profile.age) ? `年龄：${cleanScalar(profile.age)}` : ''
  ].filter(Boolean)
  if (basics.length) lines.push(basics.join('；'))
  for (const [key, label, max] of PROFILE_FIELDS) {
    if (key === 'abilities' && options.includeAbilities === false) continue
    const value = readableValue(profile[key] ?? (key === 'speakingStyle' ? profile.speaking_style : undefined))
    if (value) lines.push(`${label}：${clip(value, max)}`)
  }
  return lines
}

function renderWorld(bundle: AgentContextBundle): string[] {
  const value = projectionValue(bundle, 'session.world_context')
  if (!value?.mounted) return []
  const worldName = cleanScalar(value.world?.name)
  const curtain = value.curtain || {}
  const location = [curtain.locationLarge, curtain.locationMiddle, curtain.locationSmall]
    .map(cleanScalar).filter(Boolean).join(' / ') || cleanScalar(curtain.location)
  return [
    worldName ? `世界：${worldName}` : '',
    location ? `地点：${location}` : '',
    cleanScalar(curtain.time) ? `时间：${cleanScalar(curtain.time)}` : '',
    cleanScalar(curtain.weather) ? `天气：${cleanScalar(curtain.weather)}` : ''
  ].filter(Boolean)
}

function renderVisibleMessages(bundle: AgentContextBundle): string[] {
  const value = projectionValue(bundle, 'chat.visible_context')
  const items = value?.items
  if (!Array.isArray(items)) return []
  const anchorMessageId = Number(value?.anchorMessageId || 0)
  return items.filter((item: AnyRecord) => Number(item.ref?.messageId || 0) !== anchorMessageId).slice(-12).map((item: AnyRecord) => {
    const speaker = cleanScalar(item.speakerName) || '未知说话人'
    const fact = clip(readableValue(item.fact), 800)
    const uncertainty = clip(readableValue(item.uncertainty), 300)
    if (!fact) return ''
    return `${speaker}：${fact}${uncertainty ? `（仍不确定：${uncertainty}）` : ''}`
  }).filter(Boolean)
}

function renderKnownInformation(bundle: AgentContextBundle, ownCharacterId: string): string[] {
  const facts = projectionValue(bundle, 'character.knowledge')?.knownFacts
  const lines = Array.isArray(facts)
    ? facts.map((item: AnyRecord) => clip(readableValue(item.fact), 600)).filter(Boolean)
    : []
  const knownProfiles = projectionValue(bundle, 'character.private_profile')?.profiles
  if (Array.isArray(knownProfiles)) {
    for (const profile of knownProfiles) {
      if (cleanScalar(profile.characterId) === ownCharacterId) continue
      const name = cleanScalar(profile.name) || '已知角色'
      const identity = clip(readableValue(profile.introduction), 600)
      if (identity) lines.push(`${name}：${identity}`)
    }
  }
  return lines
}

function renderObservableCharacters(bundle: AgentContextBundle, ownCharacterId: string): string[] {
  const profiles = projectionValue(bundle, 'character.observable_profile')?.profiles
  if (!Array.isArray(profiles)) return []
  return profiles.map((profile: AnyRecord) => {
    if (cleanScalar(profile.characterId) === ownCharacterId) return ''
    const details = [
      readableValue(profile.appearance) ? `外貌：${clip(readableValue(profile.appearance), 600)}` : '',
      readableValue(profile.outfit) ? `衣着：${clip(readableValue(profile.outfit), 400)}` : ''
    ].filter(Boolean).join('；')
    return details ? `${cleanScalar(profile.name) || '未识别角色'}：${details}` : ''
  }).filter(Boolean)
}

function renderStatusPanels(bundle: AgentContextBundle): string[] {
  const panels = projectionValue(bundle, 'status.panels')?.panels
  if (!Array.isArray(panels)) return []
  return panels.map((panel: AnyRecord) => {
    if (!cleanScalar(panel.hostId) || cleanScalar(panel.hostType) === 'none') return ''
    const fields = Array.isArray(panel.fields) ? panel.fields.map((field: AnyRecord) => {
      const value = field.valueType === 'ref'
        ? (Array.isArray(field.references) ? field.references.map((item: AnyRecord) => cleanScalar(item.name)).filter(Boolean).join('、') : '')
        : readableValue(field.value)
      return value ? `${cleanScalar(field.label) || cleanScalar(field.key)}：${value}` : ''
    }).filter(Boolean) : []
    return fields.length ? `${cleanScalar(panel.name) || '状态'}：${fields.join('；')}` : ''
  }).filter(Boolean)
}

/**
 * 面向角色正文模型的任务态渲染器。统一投影中的来源、版本、ID 和审计字段仍留在 bundle，
 * 这里只翻译角色完成本轮回复真正需要知道的内容，避免把内部协议当成剧情文本。
 */
export function renderRoleReplyContext(
  bundle: AgentContextBundle,
  options: { rimworldUserMessage?: string } = {}
): string {
  const ownCharacterId = bundle.perspective.kind === 'character' ? bundle.perspective.characterId : ''
  const rimworldPawn = projectionValue(bundle, 'game.rimworld_pawn')
  const profiles = projectionValue(bundle, 'character.private_profile')?.profiles
  const ownProfile = Array.isArray(profiles)
    ? profiles.find((profile: AnyRecord) => cleanScalar(profile.characterId) === ownCharacterId)
    : null
  const ownObservable = Array.isArray(projectionValue(bundle, 'character.observable_profile')?.profiles)
    ? projectionValue(bundle, 'character.observable_profile')!.profiles.find((profile: AnyRecord) => cleanScalar(profile.characterId) === ownCharacterId)
    : null
  const ownLines = ownProfile ? renderProfile(ownProfile, true, { includeAbilities: !rimworldPawn }) : []
  if (ownObservable) {
    const appearance = readableValue(ownObservable.appearance)
    const outfit = readableValue(ownObservable.outfit)
    if (appearance) ownLines.push(`当前外貌：${clip(appearance, 600)}`)
    if (outfit) ownLines.push(`当前衣着：${clip(outfit, 400)}`)
  }

  return [
    section('你的设定', ownLines),
    section('你在殖民地的当前处境', rimworldPawn
      ? renderRimWorldPawnContext(rimworldPawn as RimWorldPawnSnapshotV1, { userMessage: options.rimworldUserMessage })
      : []),
    section('当前场景', renderWorld(bundle)),
    section(rimworldPawn ? '最近对话（只证明说过这些话，内容仍需与本轮事实核对）' : '最近发生的事', renderVisibleMessages(bundle)),
    section('你明确知道的事', renderKnownInformation(bundle, ownCharacterId)),
    section('现场可观察信息', renderObservableCharacters(bundle, ownCharacterId)),
    section('当前相关状态', renderStatusPanels(bundle))
  ].filter(Boolean).join('\n\n')
}
