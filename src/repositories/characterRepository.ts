import { API } from '../config/api'
import type { Alias, Character, CharacterGroup, Crowd, Group, UserProfile } from '../types'
import type { CharacterBrainCandidateChange, CharacterBrainCognitionNode, CharacterBrainTraceNode, CharacterBrainTrajectoryRange } from '../types/characterBrain'
import { normalizeNodeOffsetMap } from '../composables/useBrainPinnedOffsets'
import { normalizeNodePositionMap } from '../composables/useBrainNodePositions'
import { normalizeCharacterReplyPipelineModeOverride } from '../app/chatReplyPipelineMode'

export interface ResolvedCharacterState {
  characters: Character[]
  characterGroups: CharacterGroup[]
  groups: Group[]
  crowds: Crowd[]
  aliases: Alias[]
  userProfile: UserProfile | null
}

export interface CharacterStoreStateTarget {
  characters: { value: Character[] }
  characterGroups: { value: CharacterGroup[] }
  groups: { value: Group[] }
  crowds: { value: Crowd[] }
  aliases: { value: Alias[] }
  userProfile: { value: UserProfile }
}

export interface CharacterSnapshotMetadata {
  id: string
  characterId: string
  label: string
  snapshotKind: 'manual' | 'automatic' | string
  sourceSessionId: string
  sourceSnapshotId: string
  payloadFormat: string
  personalityModelVersionId: string
  activeBranchCount: number
  payloadSizeBytes?: number
  createdAt: string
  updatedAt: string
}

export interface CharacterSnapshotDetail extends CharacterSnapshotMetadata {
  payload: {
    format: string
    capturedAt: string
    personalityModelVersionId: string
    state: Record<string, unknown>
  }
}

export interface CharacterSnapshotCleanupResult {
  deletedIds: string[]
  protectedIds: string[]
  remaining: number
  keepCount: number
}

export interface CharacterSnapshotOverwriteBlockers {
  generationAttempts: Array<Record<string, unknown>>
  projectionWritebacks: Array<Record<string, unknown>>
}

export interface CharacterSnapshotOverwriteResult {
  ok: true
  snapshotId: string
  protectionSnapshot: CharacterSnapshotMetadata
  cleanup: CharacterSnapshotCleanupResult
  personalityModelVersionId: string
  personalityModelPath: string
  degradedToNormalRecall: boolean
}

export interface CompleteCharacterExport {
  format: 'langhuan_character_complete_v1'
  exportedAt: string
  identity: { name: string; emoji: string }
  configuration: Record<string, unknown>
  snapshot: {
    format: string
    capturedAt: string
    personalityModelVersionId: string
    state: Record<string, unknown>
  }
}

const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '',
  name: '用户',
  gender: '',
  age: '',
  desc: '',
  appearance: '',
  personality: '',
  outfit: '',
  hobbies: '',
  abilities: '',
  experience: '',
  worldview: '',
  background: '',
  emoji: '👤',
  avatarPath: ''
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function ensureCharacterGroups(groups: unknown): CharacterGroup[] {
  const source = Array.isArray(groups) ? groups : []
  const normalizedGroups = source
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      ...item,
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      orderIndex: Number(item.orderIndex ?? item.order_index ?? 0) || 0
    }))
    .filter((item) => item.id && item.name)

  const defaultGroup = normalizedGroups.find((item) => item.id === 'default') || { id: 'default', name: '默认', orderIndex: 0 }
  const sortedGroups = normalizedGroups
    .filter((item) => item.id !== 'default')
    .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
    .map((item, index) => ({
      ...item,
      orderIndex: index + 1
    }))

  return [
    {
      ...defaultGroup,
      name: String(defaultGroup.name || '默认').trim() || '默认',
      orderIndex: 0
    },
    ...sortedGroups
  ] as CharacterGroup[]
}

export function normalizeAvatarPath(path?: string): string {
  if (!path) return ''
  const trimmed = String(path).trim()
  if (!trimmed) return ''
  if (/\/avatars\/user_profile\.png$/i.test(trimmed)) return ''
  const invalidAvatarHost = trimmed.match(/^https?:\/\/avatars\/(.+)$/i)
  if (invalidAvatarHost?.[1]) {
    return '/' + invalidAvatarHost[1].replace(/^\/+/, '')
  }
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    return '/' + trimmed.replace(/^\/+/, '')
  }
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed
}

export const normalizeTrajectoryViewOffsets = normalizeNodeOffsetMap

function normalizeTrajectoryRange(raw: unknown): CharacterBrainTrajectoryRange | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const startDate = String(record.startDate ?? record.start_date ?? '').trim()
  const endDate = String(record.endDate ?? record.end_date ?? '').trim()
  if (!startDate || !endDate) return undefined
  return {
    startDate,
    startOffsetDays: Math.max(0, Math.floor(Number(record.startOffsetDays ?? record.start_offset_days ?? 0) || 0)),
    endDate,
    endOffsetDays: Math.max(0, Math.floor(Number(record.endOffsetDays ?? record.end_offset_days ?? 0) || 0))
  }
}

export function normalizeCharacterShape(char: unknown): Character {
  if (!char || typeof char !== 'object') return char as unknown as Character
  const record = char as Record<string, unknown>
  const groupValue = record.groupId ?? record.group_id ?? record.group ?? ''
  const roleTemperature = normalizeOptionalNumber(record.roleTemperature ?? record.role_temperature)
  const roleMaxTokens = normalizeOptionalPositiveInteger(record.roleMaxTokens ?? record.role_max_tokens)
  const roleThinking = normalizeRoleThinking(record.roleThinking ?? record.role_thinking)
  const replyPipelineModeOverride = normalizeCharacterReplyPipelineModeOverride(record.replyPipelineModeOverride ?? record.reply_pipeline_mode_override)
  const normalizedAvatar = normalizeAvatarPath(String(record.avatarPath ?? record.avatar_path ?? record.avatar ?? ''))
  const rawBrainLinks = record.brainLinks ?? record.brain_links
  const brainLinks = typeof rawBrainLinks === 'string'
    ? rawBrainLinks
    : rawBrainLinks && typeof rawBrainLinks === 'object' && !Array.isArray(rawBrainLinks)
      ? rawBrainLinks as Record<string, string[]>
      : {}
  const rawBrainDocuments = record.brainDocuments ?? record.brain_documents
  const brainDocuments = typeof rawBrainDocuments === 'string'
    ? rawBrainDocuments
    : rawBrainDocuments && typeof rawBrainDocuments === 'object' && !Array.isArray(rawBrainDocuments)
      ? rawBrainDocuments as Record<string, string>
      : {}
  const rawBrainCognitionNodes = record.brainCognitionNodes ?? record.brain_cognition_nodes
  const brainCognitionNodes = typeof rawBrainCognitionNodes === 'string'
    ? rawBrainCognitionNodes
    : Array.isArray(rawBrainCognitionNodes)
      ? rawBrainCognitionNodes as CharacterBrainCognitionNode[]
      : []
  const rawBrainTraceNodes = record.brainTraceNodes ?? record.brain_trace_nodes
  const brainTraceNodes = typeof rawBrainTraceNodes === 'string'
    ? rawBrainTraceNodes
    : Array.isArray(rawBrainTraceNodes)
      ? rawBrainTraceNodes as CharacterBrainTraceNode[]
      : []
  const rawBrainTrajectoryMeta = record.brainTrajectoryMeta ?? record.brain_trajectory_meta
  const rawBrainPinnedOffsets = record.brainPinnedOffsets ?? record.brain_pinned_offsets
  const rawBrainNodePositions = record.brainNodePositions ?? record.brain_node_positions
  const brainTrajectoryMeta = typeof rawBrainTrajectoryMeta === 'string'
    ? rawBrainTrajectoryMeta
    : rawBrainTrajectoryMeta && typeof rawBrainTrajectoryMeta === 'object' && !Array.isArray(rawBrainTrajectoryMeta)
      ? {
          birthDate: String((rawBrainTrajectoryMeta as Record<string, unknown>).birthDate ?? '').trim(),
          zeroNote: String((rawBrainTrajectoryMeta as Record<string, unknown>).zeroNote ?? '').trim(),
          coverageRange: normalizeTrajectoryRange(
            (rawBrainTrajectoryMeta as Record<string, unknown>).coverageRange
            ?? (rawBrainTrajectoryMeta as Record<string, unknown>).coverage_range
          ),
          coverageEndDate: String(
            (rawBrainTrajectoryMeta as Record<string, unknown>).coverageEndDate
            ?? (rawBrainTrajectoryMeta as Record<string, unknown>).coverage_end_date
            ?? ''
          ).trim(),
          coverageEndOffsetDays: Number(
            (rawBrainTrajectoryMeta as Record<string, unknown>).coverageEndOffsetDays
            ?? (rawBrainTrajectoryMeta as Record<string, unknown>).coverage_end_offset_days
            ?? 0
          ) || 0,
          calendarId: String((rawBrainTrajectoryMeta as Record<string, unknown>).calendarId ?? 'gregorian').trim() || 'gregorian',
          calendarConfig: ((rawBrainTrajectoryMeta as Record<string, unknown>).calendarConfig ?? {}) as Record<string, unknown>,
          version: Number((rawBrainTrajectoryMeta as Record<string, unknown>).version ?? 2) || 2,
          viewOffsets: {
            ...normalizeTrajectoryViewOffsets(
              (rawBrainTrajectoryMeta as Record<string, unknown>).projectionOffsets
              ?? (rawBrainTrajectoryMeta as Record<string, unknown>).projection_offsets
            ),
            ...normalizeTrajectoryViewOffsets(
              (rawBrainTrajectoryMeta as Record<string, unknown>).viewOffsets
              ?? (rawBrainTrajectoryMeta as Record<string, unknown>).view_offsets
            )
          }
        }
      : {
          birthDate: '',
          zeroNote: '',
          calendarId: 'gregorian',
          calendarConfig: {} as Record<string, unknown>,
          version: 2,
          coverageEndDate: '',
          coverageEndOffsetDays: 0,
          viewOffsets: {}
        }
  const brainPinnedOffsets = typeof rawBrainPinnedOffsets === 'string'
    ? normalizeNodeOffsetMap(parseJsonObject(rawBrainPinnedOffsets))
    : normalizeNodeOffsetMap(rawBrainPinnedOffsets)
  const brainNodePositions = typeof rawBrainNodePositions === 'string'
    ? normalizeNodePositionMap(parseJsonObject(rawBrainNodePositions))
    : normalizeNodePositionMap(rawBrainNodePositions)
  const rawBrainCandidateChanges = record.brainCandidateChanges ?? record.brain_candidate_changes
  const brainCandidateChanges = typeof rawBrainCandidateChanges === 'string'
    ? rawBrainCandidateChanges
    : Array.isArray(rawBrainCandidateChanges)
      ? rawBrainCandidateChanges as CharacterBrainCandidateChange[]
      : []
  const rawPersonalityKernel = record.personalityKernel ?? record.personality_kernel
  const personalityKernel = typeof rawPersonalityKernel === 'string'
    ? rawPersonalityKernel
    : rawPersonalityKernel && typeof rawPersonalityKernel === 'object' && !Array.isArray(rawPersonalityKernel)
      ? rawPersonalityKernel as Character['personalityKernel']
      : ''
  return {
    ...(record as unknown as Character),
    avatarPath: normalizedAvatar,
    avatar_path: normalizedAvatar,
    brainLinks,
    brain_links: typeof brainLinks === 'string' ? brainLinks : JSON.stringify(brainLinks),
    brainDocuments,
    brain_documents: typeof brainDocuments === 'string' ? brainDocuments : JSON.stringify(brainDocuments),
    brainCognitionNodes,
    brain_cognition_nodes: typeof brainCognitionNodes === 'string' ? brainCognitionNodes : JSON.stringify(brainCognitionNodes),
    brainTraceNodes,
    brain_trace_nodes: typeof brainTraceNodes === 'string' ? brainTraceNodes : JSON.stringify(brainTraceNodes),
    brainTrajectoryMeta,
    brain_trajectory_meta: typeof brainTrajectoryMeta === 'string' ? brainTrajectoryMeta : JSON.stringify(brainTrajectoryMeta),
    brainPinnedOffsets,
    brain_pinned_offsets: typeof rawBrainPinnedOffsets === 'string' ? rawBrainPinnedOffsets : JSON.stringify(brainPinnedOffsets),
    brainNodePositions,
    brain_node_positions: typeof rawBrainNodePositions === 'string' ? rawBrainNodePositions : JSON.stringify(brainNodePositions),
    brainCandidateChanges,
    brain_candidate_changes: typeof brainCandidateChanges === 'string' ? brainCandidateChanges : JSON.stringify(brainCandidateChanges),
    personalityKernel,
    personality_kernel: typeof personalityKernel === 'string' ? personalityKernel : JSON.stringify(personalityKernel),
    roleTemperature: roleTemperature ?? '',
    role_temperature: roleTemperature ?? '',
    roleMaxTokens: roleMaxTokens ?? '',
    role_max_tokens: roleMaxTokens ?? '',
    roleThinking,
    role_thinking: roleThinking,
    replyPipelineModeOverride,
    reply_pipeline_mode_override: replyPipelineModeOverride,
    groupId: groupValue as string,
    group_id: groupValue as string
  }
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined {
  const next = normalizeOptionalNumber(value)
  return next === undefined || next <= 0 ? undefined : Math.trunc(next)
}

function normalizeRoleThinking(value: unknown): '' | 'enabled' | 'disabled' {
  return value === 'enabled' || value === 'disabled' ? value : ''
}

export function normalizeGroupShape(group: unknown, characters: Character[] = []): Group {
  if (!group || typeof group !== 'object') return group as unknown as Group
  const record = group as Record<string, unknown>
  const avatarSource = record.avatarPath ?? record.avatar_path
  const normalizedAvatar = avatarSource === undefined ? undefined : normalizeAvatarPath(String(avatarSource))
  let members: string | string[] | Array<Record<string, unknown>> = Array.isArray(record.members) || typeof record.members === 'string'
    ? record.members as string | string[] | Array<Record<string, unknown>>
    : []
  if (typeof members === 'string') {
    try {
      const parsed = JSON.parse(members)
      members = Array.isArray(parsed) ? parsed : []
    } catch {
      members = []
    }
  }
  if (Array.isArray(members)) {
    members = members.map((member: any) => {
      const probability = Number(member?.probability ?? member?.replyChance ?? member?.chance ?? 100) || 100
      const rawCharacterId = String(member?.characterId ?? member?.character_id ?? member?.charId ?? member?.char_id ?? member?.id ?? '').trim()
      const rawName = String(member?.name ?? member?.characterName ?? member?.character_name ?? member ?? '').trim()
      const matchedCharacter = characters.find((item: any) => item.id === rawCharacterId || item.id === rawName || item.name === rawName)
      return {
        characterId: matchedCharacter?.id || rawCharacterId || '',
        probability
      }
    })
  }
  const groupValue = String(record.groupId ?? record.group_id ?? record.group ?? 'default').trim() || 'default'
  return {
    ...(record as unknown as Group),
    members,
    groupId: groupValue,
    group_id: groupValue,
    avatarPath: normalizedAvatar ?? String(record.avatarPath ?? record.avatar_path ?? ''),
    avatar_path: normalizedAvatar ?? String(record.avatarPath ?? record.avatar_path ?? '')
  }
}

export function normalizeAliasShape(alias: unknown): Alias {
  if (!alias || typeof alias !== 'object') return alias as unknown as Alias
  const record = alias as Record<string, unknown>
  const normalizedAvatar = normalizeAvatarPath(String(record.avatarPath ?? record.avatar_path ?? ''))
  return {
    ...(record as unknown as Alias),
    avatarPath: normalizedAvatar,
    avatar_path: normalizedAvatar,
    emoji: String(record.emoji ?? ''),
    appearance: String(record.appearance ?? ''),
    personality: String(record.personality ?? ''),
    outfit: String(record.outfit ?? ''),
    hobbies: String(record.hobbies ?? ''),
    abilities: String(record.abilities ?? ''),
    experience: String(record.experience ?? ''),
    worldview: String(record.worldview ?? ''),
    background: String(record.background ?? '')
  }
}

export function normalizeCrowdShape(crowd: unknown): Crowd {
  if (!crowd || typeof crowd !== 'object') return crowd as unknown as Crowd
  const record = crowd as Record<string, unknown>
  let members: string | string[] | Array<Record<string, unknown>> = Array.isArray(record.members) || typeof record.members === 'string'
    ? record.members as string | string[] | Array<Record<string, unknown>>
    : []
  if (typeof members === 'string') {
    try {
      const parsed = JSON.parse(members)
      members = Array.isArray(parsed) ? parsed : []
    } catch {
      members = []
    }
  }
  const apiConfig = record.apiConfig && typeof record.apiConfig === 'object'
    ? record.apiConfig as Record<string, unknown>
    : undefined
  const preset = String(record.apiPreset ?? record.defaultPreset ?? record.default_preset ?? apiConfig?.preset ?? '').trim()
  const groupValue = String(record.groupId ?? record.group_id ?? record.group ?? 'default').trim() || 'default'
  return {
    ...record,
    members,
    defaultPreset: preset,
    default_preset: preset,
    apiPreset: preset,
    apiConfig: preset ? { preset } : undefined,
    groupId: groupValue,
    group_id: groupValue
  } as unknown as Crowd
}

export function resolveCharacterState(input: unknown): ResolvedCharacterState {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const characters = Array.isArray(data.characters)
    ? (data.characters as Character[]).map((item) => normalizeCharacterShape(item))
    : []

  let userProfile: UserProfile | null = null
  if (data.userProfile && typeof data.userProfile === 'object') {
    const profile = data.userProfile as Record<string, unknown>
    userProfile = {
      ...(data.userProfile as UserProfile),
      displayName: String(profile.displayName ?? profile.display_name ?? ''),
      avatarPath: normalizeAvatarPath(String(profile.avatarPath ?? profile.avatar_path ?? profile.avatar ?? ''))
    }
  }

  return {
    characters,
    characterGroups: ensureCharacterGroups(data.characterGroups),
    groups: Array.isArray(data.groups)
      ? (data.groups as Group[]).map((item) => normalizeGroupShape(item, characters))
      : [],
    crowds: Array.isArray(data.crowds)
      ? (data.crowds as Crowd[]).map((item) => normalizeCrowdShape(item))
      : [],
    aliases: Array.isArray(data.aliases) ? (data.aliases as Alias[]).map((item) => normalizeAliasShape(item)) : [],
    userProfile
  }
}

export function applyResolvedCharacterState(target: CharacterStoreStateTarget, resolved: ResolvedCharacterState): void {
  target.characters.value = resolved.characters
  target.characterGroups.value = resolved.characterGroups
  target.groups.value = resolved.groups
  target.crowds.value = resolved.crowds
  target.aliases.value = resolved.aliases
  target.userProfile.value = resolved.userProfile || { ...DEFAULT_USER_PROFILE }
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  let rawText = ''
  try {
    rawText = await response.text()
  } catch {
    return fallbackMessage
  }
  if (!rawText) return fallbackMessage
  try {
    const parsed = JSON.parse(rawText) as { error?: unknown; message?: unknown }
    const detail = String(parsed?.error ?? parsed?.message ?? '').trim()
    return detail || fallbackMessage
  } catch {
    const detail = rawText.trim()
    return detail || fallbackMessage
  }
}

async function requestJson<T>(url: string, method: string, body: unknown, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage))
  }
  return await response.json() as T
}

async function requestVoid(url: string, method: string, fallbackMessage: string): Promise<void> {
  const response = await fetch(url, { method })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage))
  }
}

async function requestJsonWithoutBody<T>(url: string, method: string, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { method })
  if (!response.ok) {
    const error = new Error(await readErrorMessage(response, fallbackMessage)) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return await response.json() as T
}

export async function listCharacterSnapshotRecords(characterId: string): Promise<CharacterSnapshotMetadata[]> {
  return await requestJsonWithoutBody<CharacterSnapshotMetadata[]>(
    API.characterSnapshots(characterId),
    'GET',
    '读取角色快照失败'
  )
}

export async function exportCompleteCharacterRecord(characterId: string): Promise<CompleteCharacterExport> {
  return await requestJsonWithoutBody<CompleteCharacterExport>(
    API.characterCompleteExport(characterId),
    'GET',
    '导出完整角色失败'
  )
}

export async function getCharacterSnapshotRecord(characterId: string, snapshotId: string): Promise<CharacterSnapshotDetail> {
  return await requestJsonWithoutBody<CharacterSnapshotDetail>(
    API.characterSnapshot(characterId, snapshotId),
    'GET',
    '读取角色快照失败'
  )
}

export async function createManualCharacterSnapshotRecord(characterId: string, label = ''): Promise<CharacterSnapshotMetadata> {
  return await requestJson<CharacterSnapshotMetadata>(
    API.characterSnapshots(characterId),
    'POST',
    { label },
    '保存角色快照失败'
  )
}

export async function deleteCharacterSnapshotRecord(characterId: string, snapshotId: string): Promise<void> {
  await requestJsonWithoutBody(API.characterSnapshot(characterId, snapshotId), 'DELETE', '删除角色快照失败')
}

export async function cleanupCharacterSnapshotRecords(characterId: string, keepAutomaticCount = 20): Promise<CharacterSnapshotCleanupResult> {
  return await requestJson<CharacterSnapshotCleanupResult>(
    API.characterSnapshotsCleanup(characterId),
    'POST',
    { keepAutomaticCount },
    '清理自动快照失败'
  )
}

export async function overwriteCharacterMainFromSnapshotRecord(
  characterId: string,
  snapshotId: string
): Promise<CharacterSnapshotOverwriteResult> {
  const response = await fetch(API.characterSnapshotOverwriteMain(characterId, snapshotId), { method: 'POST' })
  const raw = await response.text()
  let payload: Record<string, any> = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok) {
    const error = new Error(String(payload.error || raw || '覆盖角色主真值失败')) as Error & {
      status?: number
      blockers?: CharacterSnapshotOverwriteBlockers
    }
    error.status = response.status
    error.blockers = payload.blockers as CharacterSnapshotOverwriteBlockers | undefined
    throw error
  }
  return payload as CharacterSnapshotOverwriteResult
}

export async function createCharacterRecord(payload: Character): Promise<void> {
  await requestJson(API.CHARACTERS, 'POST', payload, '添加角色失败')
}

export async function updateCharacterRecord(id: string, payload: Partial<Character>): Promise<Record<string, unknown>> {
  return await requestJson(`${API.CHARACTERS}/${encodeURIComponent(id)}`, 'PUT', payload, '更新角色失败')
}

export async function deleteCharacterRecord(id: string): Promise<void> {
  await requestVoid(`${API.CHARACTERS}/${encodeURIComponent(id)}`, 'DELETE', '删除角色失败')
}

export async function deleteContactsBatchRecord(items: Array<{ kind: 'char' | 'group' | 'crowd'; id: string }>): Promise<void> {
  await requestJson(API.CONTACTS_BATCH_DELETE, 'POST', { items }, '批量删除角色失败')
}

export async function createCharacterGroupRecord(payload: CharacterGroup): Promise<void> {
  await requestJson(API.CHARACTER_GROUPS, 'POST', payload, '添加角色分组失败')
}

export async function updateCharacterGroupRecord(id: string, payload: Partial<CharacterGroup>): Promise<void> {
  await requestJson(`${API.CHARACTER_GROUPS}/${encodeURIComponent(id)}`, 'PUT', payload, '更新角色分组失败')
}

export async function deleteCharacterGroupRecord(id: string): Promise<void> {
  await requestVoid(`${API.CHARACTER_GROUPS}/${encodeURIComponent(id)}`, 'DELETE', '删除角色分组失败')
}

export async function createGroupRecord(payload: Group): Promise<Record<string, unknown>> {
  return await requestJson(API.GROUPS, 'POST', payload, '添加群聊失败')
}

export async function updateGroupRecord(id: string, payload: Partial<Group>): Promise<Record<string, unknown>> {
  return await requestJson(`${API.GROUPS}/${encodeURIComponent(id)}`, 'PUT', payload, '更新群聊失败')
}

export async function deleteGroupRecord(id: string): Promise<void> {
  await requestVoid(`${API.GROUPS}/${encodeURIComponent(id)}`, 'DELETE', '删除群聊失败')
}

export async function createCrowdRecord(payload: Crowd): Promise<void> {
  await requestJson(API.CROWDS, 'POST', payload, '添加群众角色失败')
}

export async function updateCrowdRecord(id: string, payload: Partial<Crowd>): Promise<void> {
  await requestJson(`${API.CROWDS}/${encodeURIComponent(id)}`, 'PUT', payload, '更新群众角色失败')
}

export async function deleteCrowdRecord(id: string): Promise<void> {
  await requestVoid(`${API.CROWDS}/${encodeURIComponent(id)}`, 'DELETE', '删除群众角色失败')
}

export async function createAliasRecord(payload: Alias): Promise<Record<string, unknown>> {
  return await requestJson(API.ALIASES, 'POST', normalizeAliasShape(payload), '添加马甲失败')
}

export async function updateAliasRecord(id: string, payload: Partial<Alias>): Promise<Record<string, unknown>> {
  return await requestJson(`${API.ALIASES}/${encodeURIComponent(id)}`, 'PUT', normalizeAliasShape(payload), '更新马甲失败')
}

export async function deleteAliasRecord(id: string): Promise<void> {
  await requestVoid(`${API.ALIASES}/${encodeURIComponent(id)}`, 'DELETE', '删除马甲失败')
}

export async function updateUserProfileRecord(payload: Partial<UserProfile>): Promise<Record<string, unknown>> {
  return await requestJson(API.USER_PROFILE, 'PUT', payload, '更新用户信息失败')
}
