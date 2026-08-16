import { addHistory } from '../shared/dbUtils.js'
import { characterRepository } from '../../repositories/characterRepository.js'
import { normalizeBrainNeuronReplaceRow } from './brainRecordNormalizer.js'
import { saveAvatarDataUri as defaultSaveAvatarDataUri } from '../../repositories/workspaceSnapshot/avatarStorage.js'
import { savePersonalityModelZip, removePersonalityModel, removePersonalityModelPath } from '../../repositories/personalityModelStorage.js'
import { personalityTrainingRepository } from '../../repositories/personalityTrainingRepository.js'
import { getActiveUserId } from '../../localWorkspace.js'
import { characterSnapshotService as defaultCharacterSnapshotService } from './characterSnapshotService.js'

function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function intValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function jsonText(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback)
}

function jsonColumnText(value: unknown, fallback: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? fallback)
}

function optionalJsonColumnText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function normalizeReplyPipelineModeOverride(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'follow' || raw === 'follow_session' || raw === 'session' || raw === 'default') return 'follow_session'
  if (raw === 'caps_network' || raw === 'caps' || raw === 'caps-direct' || raw === 'caps_direct') return 'follow_session'
  if (raw === 'personality_model' || raw === 'personality' || raw === 'message_projection' || raw === 'projection_model') return 'personality_model'
  if (raw === 'normal_recall' || raw === 'normal' || raw === 'recall' || raw === 'legacy_recall') return 'normal_recall'
  return 'follow_session'
}

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function isEmptyBrainValue(value: unknown): boolean {
  const parsed = parseJsonColumn(value)
  if (Array.isArray(parsed)) return parsed.length === 0
  if (parsed && typeof parsed === 'object') return Object.keys(parsed as Record<string, unknown>).length === 0
  return parsed === undefined || parsed === null || parsed === ''
}

function hasBrainValue(value: unknown): boolean {
  return !isEmptyBrainValue(value)
}

function guardedBrainColumn(payloadValue: unknown, currentValue: unknown, fallback: unknown, allowClear: boolean): string {
  if (!allowClear && isEmptyBrainValue(payloadValue) && hasBrainValue(currentValue)) {
    return jsonColumnText(currentValue, fallback)
  }
  return jsonColumnText(payloadValue ?? currentValue, fallback)
}

function normalizeGroupMembers(members: unknown) {
  return Array.isArray(members) ? members : []
}

function getCrowdPreset(payload: Record<string, any>): string {
  return text(
    payload.apiPreset
    ?? payload.defaultPreset
    ?? payload.default_preset
    ?? payload.apiConfig?.preset,
    ''
  )
}

function getScopedUserProfileAvatarFileName(): string {
  const userId = getActiveUserId().trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return userId ? `user_profile_${userId}` : 'user_profile'
}

function getScopedAliasAvatarFileName(aliasId: string): string {
  const userId = getActiveUserId().trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeAliasId = String(aliasId || 'alias').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'alias'
  return userId ? `alias_${userId}_${safeAliasId}` : `alias_${safeAliasId}`
}

function getScopedCharacterAvatarFileName(characterId: string): string {
  const userId = getActiveUserId().trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeCharacterId = String(characterId || 'character').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'character'
  return userId ? `character_${userId}_${safeCharacterId}` : `character_${safeCharacterId}`
}

function pickAvatarInput(payload: Record<string, any>, fallback?: unknown): string {
  const candidates = [payload.avatarPath, payload.avatar_path, payload.avatar]
  const dataUri = candidates.find((value) => typeof value === 'string' && value.startsWith('data:image'))
  if (dataUri !== undefined) return text(dataUri)
  if (candidates.some((value) => value === '')) return ''
  const explicit = candidates.find((value) => value !== undefined && value !== null)
  return text(explicit ?? fallback)
}

export function createCharacterAppService(
  repository = characterRepository,
  deps: {
    saveAvatarDataUri?: (dataUri: string, fileName: string) => string
    characterSnapshotService?: typeof defaultCharacterSnapshotService
  } = {}
) {
  const saveAvatarDataUri = deps.saveAvatarDataUri ?? defaultSaveAvatarDataUri
  const characterSnapshotService = deps.characterSnapshotService ?? defaultCharacterSnapshotService
  return {
    getCharacters() {
      return repository.getCharacters()
    },
    listCharacterSnapshots(characterId: string) {
      return characterSnapshotService.listCharacterSnapshots(characterId)
    },
    exportCompleteCharacter(characterId: string) {
      return characterSnapshotService.exportCompleteCharacter(characterId)
    },
    getCharacterSnapshot(characterId: string, snapshotId: string) {
      return characterSnapshotService.getCharacterSnapshot(characterId, snapshotId)
    },
    createManualCharacterSnapshot(characterId: string, payload: Record<string, unknown>) {
      return characterSnapshotService.createManualCharacterSnapshot(characterId, payload)
    },
    deleteCharacterSnapshot(characterId: string, snapshotId: string) {
      return characterSnapshotService.deleteCharacterSnapshot(characterId, snapshotId)
    },
    cleanupAutomaticCharacterSnapshots(characterId: string, payload: Record<string, unknown>) {
      return characterSnapshotService.cleanupAutomaticCharacterSnapshots(characterId, payload)
    },
    overwriteCharacterMainFromSnapshot(characterId: string, snapshotId: string) {
      return characterSnapshotService.overwriteCharacterMainFromSnapshot(characterId, snapshotId)
    },
    getBrainNeurons() {
      return repository.getBrainNeurons()
    },
    replaceBrainNeurons(payload: unknown) {
      const neurons = Array.isArray(payload) ? payload : []
      repository.replaceBrainNeurons(neurons.map((item: Record<string, any>, index: number) => (
        normalizeBrainNeuronReplaceRow(item, index)
      )))
      return { ok: true, count: neurons.length }
    },
    addCharacter(payload: Record<string, any>) {
      const id = text(payload.id)
      let avatarPath = pickAvatarInput(payload)
      if (avatarPath && avatarPath.startsWith('data:image')) {
        avatarPath = saveAvatarDataUri(avatarPath, getScopedCharacterAvatarFileName(id))
      }
      const row = {
        id,
        name: text(payload.name),
        gender: text(payload.gender),
        age: text(payload.age),
        emoji: text(payload.emoji, '\u{1F464}'),
        avatarPath,
        groupId: text(payload.groupId ?? payload.group_id ?? payload.group, 'default'),
        desc: text(payload.desc),
        appearance: text(payload.appearance),
        outfit: text(payload.outfit),
        personality: text(payload.personality),
        hobbies: text(payload.hobbies),
        abilities: text(payload.abilities),
        experience: text(payload.experience),
        worldview: text(payload.worldview),
        background: text(payload.background),
        speakingStyle: text(payload.speakingStyle ?? payload.speaking_style),
        nicknames: jsonText(payload.nicknames, []),
        defaultPreset: text(payload.defaultPreset ?? payload.default_preset),
        defaultModel: text(payload.defaultModel ?? payload.default_model),
        roleTemperature: payload.roleTemperature ?? payload.role_temperature ?? '',
        roleMaxTokens: payload.roleMaxTokens ?? payload.role_max_tokens ?? '',
        roleThinking: text(payload.roleThinking ?? payload.role_thinking),
        replyPipelineModeOverride: normalizeReplyPipelineModeOverride(payload.replyPipelineModeOverride ?? payload.reply_pipeline_mode_override),
        schedule: jsonText(payload.schedule, {}),
        yearlySchedule: jsonText(payload.yearlySchedule ?? payload.yearly_schedule, []),
        currentActivities: jsonText(payload.currentActivities ?? payload.current_activities, []),
        relationships: jsonText(payload.relationships, {}),
        brainLinks: jsonColumnText(payload.brainLinks ?? payload.brain_links, {}),
        brainDocuments: jsonColumnText(payload.brainDocuments ?? payload.brain_documents, {}),
        brainCognitionNodes: jsonColumnText(payload.brainCognitionNodes ?? payload.brain_cognition_nodes, []),
        brainTraceNodes: jsonColumnText(payload.brainTraceNodes ?? payload.brain_trace_nodes, []),
        brainTrajectoryMeta: jsonColumnText(payload.brainTrajectoryMeta ?? payload.brain_trajectory_meta, {}),
        brainPinnedOffsets: jsonColumnText(payload.brainPinnedOffsets ?? payload.brain_pinned_offsets, {}),
        brainNodePositions: jsonColumnText(payload.brainNodePositions ?? payload.brain_node_positions, {}),
        brainCandidateChanges: jsonColumnText(payload.brainCandidateChanges ?? payload.brain_candidate_changes, []),
        personalityKernel: optionalJsonColumnText(payload.personalityKernel ?? payload.personality_kernel),
        affection: intValue(payload.affection, 50),
        locations: jsonText(payload.locations, []),
        orderIndex: intValue(payload.orderIndex ?? payload.order_index)
      }

      repository.insertCharacter([
        row.id, row.name, row.gender, row.age, row.emoji, row.avatarPath, row.groupId, row.desc, row.appearance, row.outfit,
        row.personality, row.hobbies, row.abilities, row.experience, row.worldview, row.background, row.speakingStyle,
        row.nicknames, row.defaultPreset, row.defaultModel, row.roleTemperature, row.roleMaxTokens, row.roleThinking, row.replyPipelineModeOverride, row.schedule, row.yearlySchedule,
        row.currentActivities, row.relationships, row.brainLinks, row.brainDocuments, row.brainCognitionNodes, row.brainTraceNodes, row.brainTrajectoryMeta, row.brainPinnedOffsets, row.brainNodePositions, row.brainCandidateChanges, row.affection, row.locations, row.orderIndex, row.personalityKernel
      ])

      addHistory('ADD_CHARACTER', row.name)
      return { ok: true, id: row.id, avatarPath: row.avatarPath }
    },
    updateCharacter(id: string, payload: Record<string, any>) {
      const current = repository.getCharacterById(id)
      if (!current) throw new Error('character not found')
      const allowBrainClear = payload.allowBrainClear === true || payload.__allowBrainClear === true
      let avatarPath = pickAvatarInput(payload, current.avatarPath ?? current.avatar_path)
      if (avatarPath && avatarPath.startsWith('data:image')) {
        avatarPath = saveAvatarDataUri(avatarPath, getScopedCharacterAvatarFileName(id))
      }

      const row = {
        name: text(payload.name ?? current.name),
        gender: text(payload.gender ?? current.gender),
        age: text(payload.age ?? current.age),
        emoji: text(payload.emoji ?? current.emoji, '\u{1F464}'),
        avatarPath,
        groupId: text(payload.groupId ?? payload.group_id ?? payload.group ?? current.groupId ?? current.group_id, 'default'),
        desc: text(payload.desc ?? current.desc),
        appearance: text(payload.appearance ?? current.appearance),
        outfit: text(payload.outfit ?? current.outfit),
        personality: text(payload.personality ?? current.personality),
        hobbies: text(payload.hobbies ?? current.hobbies),
        abilities: text(payload.abilities ?? current.abilities),
        experience: text(payload.experience ?? current.experience),
        worldview: text(payload.worldview ?? current.worldview),
        background: text(payload.background ?? current.background),
        speakingStyle: text(payload.speakingStyle ?? payload.speaking_style ?? current.speakingStyle ?? current.speaking_style),
        nicknames: jsonText(payload.nicknames ?? current.nicknames, []),
        defaultPreset: text(payload.defaultPreset ?? payload.default_preset ?? current.defaultPreset ?? current.default_preset),
        defaultModel: text(payload.defaultModel ?? payload.default_model ?? current.defaultModel ?? current.default_model),
        roleTemperature: payload.roleTemperature ?? payload.role_temperature ?? current.roleTemperature ?? current.role_temperature ?? '',
        roleMaxTokens: payload.roleMaxTokens ?? payload.role_max_tokens ?? current.roleMaxTokens ?? current.role_max_tokens ?? '',
        roleThinking: text(payload.roleThinking ?? payload.role_thinking ?? current.roleThinking ?? current.role_thinking),
        replyPipelineModeOverride: normalizeReplyPipelineModeOverride(payload.replyPipelineModeOverride ?? payload.reply_pipeline_mode_override ?? current.replyPipelineModeOverride ?? current.reply_pipeline_mode_override),
        schedule: jsonText(payload.schedule ?? current.schedule, {}),
        yearlySchedule: jsonText(payload.yearlySchedule ?? payload.yearly_schedule ?? current.yearlySchedule ?? current.yearly_schedule, []),
        currentActivities: jsonText(payload.currentActivities ?? payload.current_activities ?? current.currentActivities ?? current.current_activities, []),
        relationships: jsonText(payload.relationships ?? current.relationships, {}),
        brainLinks: guardedBrainColumn(payload.brainLinks ?? payload.brain_links, current.brainLinks ?? current.brain_links, {}, allowBrainClear),
        brainDocuments: guardedBrainColumn(payload.brainDocuments ?? payload.brain_documents, current.brainDocuments ?? current.brain_documents, {}, allowBrainClear),
        brainCognitionNodes: guardedBrainColumn(payload.brainCognitionNodes ?? payload.brain_cognition_nodes, current.brainCognitionNodes ?? current.brain_cognition_nodes, [], allowBrainClear),
        brainTraceNodes: guardedBrainColumn(payload.brainTraceNodes ?? payload.brain_trace_nodes, current.brainTraceNodes ?? current.brain_trace_nodes, [], allowBrainClear),
        brainTrajectoryMeta: guardedBrainColumn(payload.brainTrajectoryMeta ?? payload.brain_trajectory_meta, current.brainTrajectoryMeta ?? current.brain_trajectory_meta, {}, allowBrainClear),
        brainPinnedOffsets: guardedBrainColumn(payload.brainPinnedOffsets ?? payload.brain_pinned_offsets, current.brainPinnedOffsets ?? current.brain_pinned_offsets, {}, allowBrainClear),
        brainNodePositions: guardedBrainColumn(payload.brainNodePositions ?? payload.brain_node_positions, current.brainNodePositions ?? current.brain_node_positions, {}, allowBrainClear),
        brainCandidateChanges: guardedBrainColumn(payload.brainCandidateChanges ?? payload.brain_candidate_changes, current.brainCandidateChanges ?? current.brain_candidate_changes, [], allowBrainClear),
        personalityKernel: optionalJsonColumnText(payload.personalityKernel ?? payload.personality_kernel ?? current.personalityKernel ?? current.personality_kernel),
        affection: intValue(payload.affection ?? current.affection, 50),
        locations: jsonText(payload.locations ?? current.locations, []),
        orderIndex: intValue(payload.orderIndex ?? payload.order_index ?? current.orderIndex ?? current.order_index)
      }

      repository.updateCharacter(id, [
        row.name, row.gender, row.age, row.emoji, row.avatarPath, row.groupId, row.desc, row.appearance, row.outfit,
        row.personality, row.hobbies, row.abilities, row.experience, row.worldview, row.background, row.speakingStyle,
        row.nicknames, row.defaultPreset, row.defaultModel, row.roleTemperature, row.roleMaxTokens, row.roleThinking, row.replyPipelineModeOverride, row.schedule, row.yearlySchedule,
        row.currentActivities, row.relationships, row.brainLinks, row.brainDocuments, row.brainCognitionNodes, row.brainTraceNodes, row.brainTrajectoryMeta, row.brainPinnedOffsets, row.brainNodePositions, row.brainCandidateChanges, row.affection, row.locations, row.orderIndex, row.personalityKernel
      ])

      addHistory('UPDATE_CHARACTER', row.name)
      return { ok: true, avatarPath: row.avatarPath }
    },
    deleteCharacter(id: string) {
      repository.deleteCharacter(id)
      removePersonalityModel(id)
      repository.updateCharacterPersonalityModelPath(id, '')
      addHistory('DELETE_CHARACTER', id)
      return { ok: true }
    },
    deleteContactsBatch(payload: Record<string, unknown>) {
      const items = Array.from(new Map(
        (Array.isArray(payload?.items) ? payload.items : [])
          .map((item: any) => ({ kind: String(item?.kind || ''), id: text(item?.id).trim() }))
          .filter((item): item is { kind: 'char' | 'group' | 'crowd'; id: string } => (
            Boolean(item.id) && ['char', 'group', 'crowd'].includes(item.kind)
          ))
          .map((item) => [`${item.kind}:${item.id}`, item])
      ).values())
      if (!items.length) throw new Error('至少选择一个角色')
      if (items.length > 200) throw new Error('单次最多删除 200 个角色')

      const missingItems = items.filter((item) => {
        if (item.kind === 'char') return !repository.getCharacterById(item.id)
        if (item.kind === 'group') return !repository.getGroupById(item.id)
        return !repository.getCrowdById(item.id)
      })
      if (missingItems.length) {
        throw new Error(`角色不存在：${missingItems.map((item) => item.id).join('、')}`)
      }

      repository.deleteContactsBatch(items)
      items.forEach((item) => {
        if (item.kind === 'char') {
          removePersonalityModel(item.id)
          addHistory('DELETE_CHARACTER', item.id)
        }
      })
      return { ok: true, items }
    },
    savePersonalityModel(id: string, buffer: Buffer, originalFilename?: string) {
      const characterId = text(id).trim()
      if (!characterId) throw new Error('缺少角色 ID')
      const current = repository.getCharacterById(characterId)
      if (!current) throw new Error('角色不存在')
      const currentModelPath = text(current.personalityModelPath ?? current.personality_model_path).trim()
      const parentVersion = personalityTrainingRepository.ensureInstalledVersionForCurrentPath(characterId, currentModelPath)
      const versionId = personalityTrainingRepository.createId('pmv')
      const result = savePersonalityModelZip({ characterId, versionId, buffer, originalFilename })
      if (!result.ok) throw new Error(result.error)
      personalityTrainingRepository.createModelVersion({
        versionId,
        characterId,
        parentVersionId: text(parentVersion?.versionId ?? parentVersion?.version_id),
        modelPath: result.storedPath,
        status: 'installed',
        sourceKind: 'manual_upload',
        trainingBackend: 'manual_upload',
        metrics: {
          originalFilename: text(originalFilename),
          sizeBytes: result.sizeBytes,
          fileCount: result.fileCount
        },
        installedAt: new Date().toISOString()
      })
      personalityTrainingRepository.markModelVersionInstalled(characterId, versionId)
      repository.updateCharacterPersonalityModelPath(characterId, result.storedPath)
      return { ok: true, personalityModelPath: result.storedPath, versionId, sizeBytes: result.sizeBytes, fileCount: result.fileCount }
    },
    deletePersonalityModel(id: string) {
      const characterId = text(id).trim()
      if (!characterId) throw new Error('缺少角色 ID')
      const current = repository.getCharacterById(characterId)
      const currentModelPath = text(current?.personalityModelPath ?? current?.personality_model_path).trim()
      const currentVersion = personalityTrainingRepository.ensureInstalledVersionForCurrentPath(characterId, currentModelPath)
      if (currentModelPath) {
        removePersonalityModelPath(currentModelPath)
      } else {
        removePersonalityModel(characterId)
      }
      if (currentVersion?.versionId || currentVersion?.version_id) {
        personalityTrainingRepository.archiveModelVersion(characterId, text(currentVersion.versionId ?? currentVersion.version_id), 'delete_current_model')
      }
      repository.updateCharacterPersonalityModelPath(characterId, '')
      return { ok: true, personalityModelPath: '' }
    },
    addCharacterGroup(payload: Record<string, any>) {
      const id = text(payload.id)
      const name = text(payload.name)
      const emoji = text(payload.emoji, '\u{1F464}')
      const orderIndex = intValue(payload.orderIndex ?? payload.order_index)
      repository.insertCharacterGroup(id, name, emoji, orderIndex)
      return { ok: true, id }
    },
    updateCharacterGroup(id: string, payload: Record<string, any>) {
      const current = repository.getCharacterGroupById(id)
      if (!current) throw new Error('character group not found')
      const name = text(payload.name ?? current.name)
      const emoji = text(payload.emoji ?? current.emoji, '\u{1F464}')
      const orderIndex = intValue(payload.orderIndex ?? payload.order_index ?? current.orderIndex ?? current.order_index)
      repository.updateCharacterGroup(id, name, emoji, orderIndex)
      return { ok: true }
    },
    deleteCharacterGroup(id: string) {
      repository.deleteCharacterGroup(id)
      return { ok: true }
    },
    addGroup(payload: Record<string, any>) {
      const id = text(payload.id)
      const name = text(payload.name)
      const emoji = text(payload.emoji, '\u{1F465}')
      const avatarPath = text(payload.avatarPath ?? payload.avatar_path)
      const members = jsonText(normalizeGroupMembers(payload.members), [])
      const orderIndex = intValue(payload.orderIndex ?? payload.order_index)

      repository.insertGroup(id, name, emoji, avatarPath, members, orderIndex)
      return { ok: true, id, avatarPath }
    },
    updateGroup(id: string, payload: Record<string, any>) {
      const current = repository.getGroupById(id)
      if (!current) throw new Error('group not found')

      const name = text(payload.name ?? current.name)
      const emoji = text(payload.emoji ?? current.emoji, '\u{1F465}')
      const avatarPath = text(payload.avatarPath ?? payload.avatar_path ?? current.avatarPath ?? current.avatar_path)
      const members = jsonText(payload.members ?? current.members, [])
      const orderIndex = intValue(payload.orderIndex ?? payload.order_index ?? current.orderIndex ?? current.order_index)

      repository.updateGroup(id, name, emoji, avatarPath, members, orderIndex)
      return { ok: true, avatarPath }
    },
    deleteGroup(id: string) {
      repository.deleteGroup(id)
      return { ok: true }
    },
    addCrowd(payload: Record<string, any>) {
      const id = text(payload.id)
      const name = text(payload.name)
      const members = jsonText(payload.members, [])
      const defaultPreset = getCrowdPreset(payload)
      repository.insertCrowd(id, name, members, defaultPreset)
      return { ok: true, id }
    },
    updateCrowd(id: string, payload: Record<string, any>) {
      const current = repository.getCrowdById(id)
      if (!current) throw new Error('crowd not found')
      const name = text(payload.name ?? current.name)
      const members = jsonText(payload.members ?? current.members, [])
      const defaultPreset = getCrowdPreset({
        ...current,
        ...payload,
        defaultPreset: payload.defaultPreset ?? payload.default_preset ?? current.defaultPreset ?? current.default_preset
      })
      repository.updateCrowd(id, name, members, defaultPreset)
      return { ok: true }
    },
    deleteCrowd(id: string) {
      repository.deleteCrowd(id)
      return { ok: true }
    },
    addAlias(payload: Record<string, any>) {
      const id = text(payload.id)
      let avatarPath = text(payload.avatarPath ?? payload.avatar_path)
      if (avatarPath && avatarPath.startsWith('data:image')) {
        avatarPath = saveAvatarDataUri(avatarPath, getScopedAliasAvatarFileName(id))
      }
      const name = text(payload.name)
      const gender = text(payload.gender)
      const age = text(payload.age)
      const desc = text(payload.desc)
      const affections = jsonText(payload.affections, {})
      repository.insertAlias({
        id,
        name,
        gender,
        age,
        desc,
        affections,
        avatarPath,
        emoji: text(payload.emoji),
        appearance: text(payload.appearance),
        personality: text(payload.personality),
        outfit: text(payload.outfit),
        hobbies: text(payload.hobbies),
        abilities: text(payload.abilities),
        experience: text(payload.experience),
        worldview: text(payload.worldview),
        background: text(payload.background)
      })
      return { ok: true, id, avatarPath, avatar_path: avatarPath }
    },
    updateAlias(id: string, payload: Record<string, any>) {
      const current = repository.getAliasById(id)
      if (!current) throw new Error('alias not found')
      let avatarPath = text(payload.avatarPath ?? payload.avatar_path ?? current.avatarPath ?? current.avatar_path)
      if (avatarPath && avatarPath.startsWith('data:image')) {
        avatarPath = saveAvatarDataUri(avatarPath, getScopedAliasAvatarFileName(id))
      }
      const name = text(payload.name ?? current.name)
      const gender = text(payload.gender ?? current.gender)
      const age = text(payload.age ?? current.age)
      const desc = text(payload.desc ?? current.desc)
      const affections = jsonText(payload.affections ?? current.affections, {})
      repository.patchAlias(id, {
        name,
        gender,
        age,
        '"desc"': desc,
        affections,
        avatar_path: avatarPath,
        emoji: text(payload.emoji ?? current.emoji),
        appearance: text(payload.appearance ?? current.appearance),
        personality: text(payload.personality ?? current.personality),
        outfit: text(payload.outfit ?? current.outfit),
        hobbies: text(payload.hobbies ?? current.hobbies),
        abilities: text(payload.abilities ?? current.abilities),
        experience: text(payload.experience ?? current.experience),
        worldview: text(payload.worldview ?? current.worldview),
        background: text(payload.background ?? current.background)
      })
      return { ok: true, avatarPath, avatar_path: avatarPath }
    },
    deleteAlias(id: string) {
      repository.deleteAlias(id)
      return { ok: true }
    },
    updateUserProfile(payload: Record<string, any>) {
      const current = repository.getUserProfile()
      let avatarPath = text(payload.avatarPath ?? payload.avatar_path ?? current?.avatarPath ?? current?.avatar_path)
      if (avatarPath && avatarPath.startsWith('data:image')) {
        avatarPath = saveAvatarDataUri(avatarPath, getScopedUserProfileAvatarFileName())
      }
      const next = {
        name: text(payload.name ?? current?.name ?? 'user'),
        gender: text(payload.gender ?? current?.gender),
        age: text(payload.age ?? current?.age),
        desc: text(payload.desc ?? current?.desc),
        avatarPath,
        emoji: text(payload.emoji ?? current?.emoji),
        appearance: text(payload.appearance ?? current?.appearance),
        personality: text(payload.personality ?? current?.personality),
        outfit: text(payload.outfit ?? current?.outfit),
        hobbies: text(payload.hobbies ?? current?.hobbies),
        abilities: text(payload.abilities ?? current?.abilities),
        experience: text(payload.experience ?? current?.experience),
        worldview: text(payload.worldview ?? current?.worldview),
        background: text(payload.background ?? current?.background)
      }

      repository.updateUserProfile([
        next.name, next.gender, next.age, next.desc, next.avatarPath, next.emoji,
        next.appearance, next.personality, next.outfit, next.hobbies, next.abilities,
        next.experience, next.worldview, next.background
      ])

      return {
        ok: true,
        ...next,
        avatarPath: next.avatarPath,
        avatar_path: next.avatarPath
      }
    }
  }
}

export const characterAppService = createCharacterAppService()
