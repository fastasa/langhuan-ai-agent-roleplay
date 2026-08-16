import { addHistory } from '../shared/dbUtils.js'
import db from '../../db.js'
import { logger as defaultLogger } from '../../logger.js'
import { createCharacterRepository } from '../../repositories/characterRepository.js'
import { saveAvatarDataUri as defaultSaveAvatarDataUri } from '../../repositories/workspaceSnapshot/avatarStorage.js'
import { getActiveUserId } from '../../localWorkspace.js'

type WorkspaceCharacterFacadeDb = Pick<typeof db, 'prepare'>

type WorkspaceCharacterFacadeDeps = {
  characterRepository?: ReturnType<typeof createCharacterRepository>
  logger?: Pick<typeof defaultLogger, 'error'>
  resolveCharacterAvatarPath: (characterId: string, avatarPath: string) => string
  saveAvatarDataUri?: (dataUri: string, fileName: string) => string
}

export function createWorkspaceCharacterFacadeService(
  database: WorkspaceCharacterFacadeDb = db,
  deps: WorkspaceCharacterFacadeDeps
) {
  const characterRepository = deps.characterRepository ?? createCharacterRepository(database)
  const serviceLogger = deps.logger ?? defaultLogger
  const saveAvatarDataUri = deps.saveAvatarDataUri ?? defaultSaveAvatarDataUri

  function saveAvatarFromDataUri(fileName: string, dataUri: string): string {
    return saveAvatarDataUri(dataUri, fileName)
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

  function repairCharacterAvatarPaths(): void {
    const rows = characterRepository.listCharacterAvatarPaths()

    for (const row of rows) {
      const id = String(row.id || '').trim()
      const avatarPath = String(row.avatar_path || '').trim()
      if (!id || !avatarPath) continue
      const fixedPath = deps.resolveCharacterAvatarPath(id, avatarPath)
      if (fixedPath && fixedPath !== avatarPath) {
        characterRepository.updateCharacterAvatarPath(id, fixedPath)
      }
    }
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

  function normalizeNullableNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null
    const next = Number(value)
    return Number.isFinite(next) ? next : null
  }

  function normalizeNullableInteger(value: unknown): number | null {
    const next = normalizeNullableNumber(value)
    return next === null || next <= 0 ? null : Math.trunc(next)
  }

  function normalizeRoleThinking(value: unknown): string {
    return value === 'enabled' || value === 'disabled' ? value : ''
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

  return {
    addCharacterGroup(payload: Record<string, any>) {
      const { id, name, emoji, orderIndex } = payload
      characterRepository.insertCharacterGroup(id, name, emoji ?? '👤', orderIndex ?? 0)
      return { ok: true as const }
    },
    updateCharacterGroup(id: string, payload: Record<string, any>) {
      const { name, emoji, orderIndex } = payload
      const fields: Record<string, unknown> = {}
      if (name !== undefined) fields.name = name
      if (emoji !== undefined) fields.emoji = emoji
      if (orderIndex !== undefined) fields.order_index = orderIndex
      characterRepository.patchCharacterGroup(id, fields)
      return { ok: true as const }
    },
    deleteCharacterGroup(id: string) {
      if (id === 'default') {
        return { ok: false as const, status: 400, error: '默认分组不可删除' }
      }
      characterRepository.deleteCharacterGroup(id)
      return { ok: true as const }
    },
    addGroup(payload: Record<string, any>) {
      const { id, name, emoji, members, orderIndex } = payload
      let avatarPath = payload.avatarPath ?? payload.avatar_path ?? ''
      if (avatarPath && typeof avatarPath === 'string' && avatarPath.startsWith('data:image')) {
        try {
          const fileName = `group_${Date.now()}`
          avatarPath = saveAvatarFromDataUri(fileName, avatarPath)
        } catch (error) {
          serviceLogger.error('保存群聊头像失败:', error)
          avatarPath = ''
        }
      }
      characterRepository.insertGroup(id, name, emoji ?? '👥', avatarPath, JSON.stringify(members ?? []), orderIndex ?? 0)
      addHistory('群聊', name)
      return { ok: true as const, data: { ok: true, avatarPath } }
    },
    updateGroup(id: string, payload: Record<string, any>) {
      const { name, emoji, members, orderIndex } = payload
      let avatarPath = payload.avatarPath ?? payload.avatar_path
      const fields: Record<string, unknown> = {}

      if (name !== undefined) fields.name = name
      if (emoji !== undefined) fields.emoji = emoji
      if (typeof avatarPath === 'string' && avatarPath.startsWith('data:image')) {
        try {
          const fileName = `group_${Date.now()}`
          avatarPath = saveAvatarFromDataUri(fileName, avatarPath)
        } catch (error) {
          serviceLogger.error('更新群聊头像失败:', error)
          avatarPath = ''
        }
      }
      if (avatarPath !== undefined) fields.avatar_path = avatarPath ?? ''
      if (members !== undefined) fields.members = JSON.stringify(members)
      if (orderIndex !== undefined) fields.order_index = orderIndex

      characterRepository.patchGroup(id, fields)
      return { ok: true as const, data: { ok: true, avatarPath: avatarPath ?? undefined } }
    },
    deleteGroup(id: string) {
      characterRepository.deleteGroup(id)
      return { ok: true as const }
    },
    addCrowd(payload: Record<string, any>) {
      const { id, name, members, defaultPreset } = payload
      characterRepository.insertCrowd(id, name, JSON.stringify(members ?? []), defaultPreset ?? '')
      return { ok: true as const }
    },
    updateCrowd(id: string, payload: Record<string, any>) {
      const { name, members, defaultPreset } = payload
      const fields: Record<string, unknown> = {}
      if (name !== undefined) fields.name = name
      if (members !== undefined) fields.members = JSON.stringify(members)
      if (defaultPreset !== undefined) fields.default_preset = defaultPreset
      characterRepository.patchCrowd(id, fields)
      return { ok: true as const }
    },
    deleteCrowd(id: string) {
      characterRepository.deleteCrowd(id)
      return { ok: true as const }
    },
    addAlias(payload: Record<string, any>) {
      const { id, name, gender, age, desc, affections } = payload
      let avatarPath = payload.avatarPath ?? payload.avatar_path ?? ''
      if (avatarPath && typeof avatarPath === 'string' && avatarPath.startsWith('data:image')) {
        try {
          avatarPath = saveAvatarFromDataUri(getScopedAliasAvatarFileName(id), avatarPath)
        } catch (error) {
          serviceLogger.error('保存马甲头像失败:', error)
          avatarPath = ''
        }
      }
      characterRepository.insertAlias({
        id,
        name,
        gender: gender ?? '',
        age: age ?? '',
        desc: desc ?? '',
        affections: JSON.stringify(affections ?? {}),
        avatarPath,
        emoji: payload.emoji ?? '',
        appearance: payload.appearance ?? '',
        personality: payload.personality ?? '',
        outfit: payload.outfit ?? '',
        hobbies: payload.hobbies ?? '',
        abilities: payload.abilities ?? '',
        experience: payload.experience ?? '',
        worldview: payload.worldview ?? '',
        background: payload.background ?? ''
      })
      return { ok: true as const, data: { ok: true, avatarPath } }
    },
    updateAlias(id: string, payload: Record<string, any>) {
      const { name, gender, age, desc, affections } = payload
      const fields: Record<string, unknown> = {}
      let avatarPath = payload.avatarPath ?? payload.avatar_path
      if (name !== undefined) fields.name = name
      if (gender !== undefined) fields.gender = gender
      if (age !== undefined) fields.age = age
      if (desc !== undefined) fields['"desc"'] = desc
      if (affections !== undefined) fields.affections = JSON.stringify(affections)
      if (typeof avatarPath === 'string' && avatarPath.startsWith('data:image')) {
        try {
          avatarPath = saveAvatarFromDataUri(getScopedAliasAvatarFileName(id), avatarPath)
        } catch (error) {
          serviceLogger.error('更新马甲头像失败:', error)
          avatarPath = ''
        }
      }
      if (avatarPath !== undefined) fields.avatar_path = avatarPath ?? ''
      const fieldMap: Record<string, string> = {
        emoji: 'emoji',
        appearance: 'appearance',
        personality: 'personality',
        outfit: 'outfit',
        hobbies: 'hobbies',
        abilities: 'abilities',
        experience: 'experience',
        worldview: 'worldview',
        background: 'background'
      }
      for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
        if (payload[jsKey] !== undefined) fields[dbCol] = payload[jsKey]
      }
      characterRepository.patchAlias(id, fields)
      return { ok: true as const, data: { ok: true, avatarPath: avatarPath ?? undefined } }
    },
    deleteAlias(id: string) {
      characterRepository.deleteAlias(id)
      return { ok: true as const }
    },
    updateUserProfile(payload: Record<string, any>) {
      try {
        const data = payload || {}
        let avatarPath = data.avatarPath
        if (avatarPath && typeof avatarPath === 'string' && avatarPath.startsWith('data:image')) {
          try {
            avatarPath = saveAvatarFromDataUri(getScopedUserProfileAvatarFileName(), avatarPath)
          } catch (error) {
            serviceLogger.error('保存用户头像失败:', error)
          }
        }

        const fieldMap: Record<string, string> = {
          name: 'name', gender: 'gender', age: 'age', emoji: 'emoji',
          desc: '"desc"', appearance: 'appearance', personality: 'personality',
          outfit: 'outfit', hobbies: 'hobbies', abilities: 'abilities',
          experience: 'experience', worldview: 'worldview', background: 'background'
        }
        const fields: Record<string, unknown> = {}
        if (avatarPath !== undefined) {
          fields.avatar_path = avatarPath
        }
        for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
          if (data[jsKey] !== undefined) {
            fields[dbCol] = data[jsKey]
          }
        }
        characterRepository.patchUserProfile(fields)
        return { ok: true as const, data: { ok: true, avatarPath: avatarPath || '' } }
      } catch (error) {
        serviceLogger.error('更新用户信息失败:', error)
        return { ok: false as const, status: 500, error: '更新用户信息失败' }
      }
    },
    getCharacters() {
      return characterRepository.getCharacters()
    },
    addCharacter(payload: Record<string, any>) {
      const character = payload || {}
      let avatarPath = character.avatarPath ?? character.avatar_path
      if (character.avatar && typeof character.avatar === 'string' && character.avatar.startsWith('data:image')) {
        try {
          avatarPath = saveAvatarFromDataUri(String(character.id || ''), character.avatar)
        } catch (error) {
          serviceLogger.error('淇濆瓨瑙掕壊澶村儚澶辫触:', error)
        }
      }
      avatarPath = deps.resolveCharacterAvatarPath(String(character.id || ''), String(avatarPath || ''))

      if (!character.id || !character.name) {
        return { ok: false as const, status: 400, error: '角色ID和名称不能为空' }
      }
      if (String(character.name).length > 50) {
        return { ok: false as const, status: 400, error: '角色名称过长' }
      }

      characterRepository.insertCharacter([
        character.id, character.name, character.gender ?? '', character.age ?? '', character.emoji ?? '\u{1F464}', avatarPath ?? '',
        character.groupId ?? 'default', character.desc ?? '', character.appearance ?? '', character.outfit ?? '',
        character.personality ?? '', character.hobbies ?? '', character.abilities ?? '', character.experience ?? '',
        character.worldview ?? '', character.background ?? '', character.speakingStyle ?? '',
        JSON.stringify(character.nicknames ?? []), character.defaultPreset ?? '', character.defaultModel ?? '',
        normalizeNullableNumber(character.roleTemperature ?? character.role_temperature),
        normalizeNullableInteger(character.roleMaxTokens ?? character.role_max_tokens),
        normalizeRoleThinking(character.roleThinking ?? character.role_thinking),
        normalizeReplyPipelineModeOverride(character.replyPipelineModeOverride ?? character.reply_pipeline_mode_override),
        JSON.stringify(character.schedule ?? {}), JSON.stringify(character.yearlySchedule ?? []),
        JSON.stringify(character.currentActivities ?? []), JSON.stringify(character.relationships ?? {}),
        jsonColumnText(character.brainLinks ?? character.brain_links, {}),
        jsonColumnText(character.brainDocuments ?? character.brain_documents, {}),
        jsonColumnText(character.brainCognitionNodes ?? character.brain_cognition_nodes, []),
        jsonColumnText(character.brainTraceNodes ?? character.brain_trace_nodes, []),
        jsonColumnText(character.brainTrajectoryMeta ?? character.brain_trajectory_meta, {}),
        jsonColumnText(character.brainPinnedOffsets ?? character.brain_pinned_offsets, {}),
        jsonColumnText(character.brainNodePositions ?? character.brain_node_positions, {}),
        jsonColumnText(character.brainCandidateChanges ?? character.brain_candidate_changes, []),
        character.affection ?? 50,
        JSON.stringify(character.locations ?? []), character.orderIndex ?? 0,
        optionalJsonColumnText(character.personalityKernel ?? character.personality_kernel)
      ])
      addHistory('新增角色', character.name)
      return { ok: true as const, data: { ok: true, avatarPath } }
    },
    updateCharacter(id: string, payload: Record<string, any>) {
      const character = payload || {}
      const current = characterRepository.getCharacterById(id)
      if (!current) {
        return { ok: false as const, status: 404, error: 'character not found' }
      }
      const allowBrainClear = character.allowBrainClear === true || character.__allowBrainClear === true
      let avatarPath = character.avatarPath ?? character.avatar_path
      if (character.avatar && typeof character.avatar === 'string' && character.avatar.startsWith('data:image')) {
        try {
          avatarPath = saveAvatarFromDataUri(id, character.avatar)
        } catch (error) {
          serviceLogger.error('淇濆瓨澶村儚澶辫触:', error)
        }
      }
      avatarPath = deps.resolveCharacterAvatarPath(String(id || ''), String(avatarPath || ''))

      const nextAvatarPath = character.avatar === '' || character.avatarPath === '' || character.avatar_path === ''
        ? ''
        : (avatarPath || current.avatarPath || current.avatar_path || '')

      characterRepository.updateCharacter(id, [
        character.name ?? current.name ?? '',
        character.gender ?? current.gender ?? '',
        character.age ?? current.age ?? '',
        character.emoji ?? current.emoji ?? '\u{1F464}',
        nextAvatarPath,
        character.groupId ?? character.group_id ?? character.group ?? current.groupId ?? current.group_id ?? 'default',
        character.desc ?? current.desc ?? '',
        character.appearance ?? current.appearance ?? '',
        character.outfit ?? current.outfit ?? '',
        character.personality ?? current.personality ?? '',
        character.hobbies ?? current.hobbies ?? '',
        character.abilities ?? current.abilities ?? '',
        character.experience ?? current.experience ?? '',
        character.worldview ?? current.worldview ?? '',
        character.background ?? current.background ?? '',
        character.speakingStyle ?? character.speaking_style ?? current.speakingStyle ?? current.speaking_style ?? '',
        JSON.stringify(character.nicknames ?? current.nicknames ?? []),
        character.defaultPreset ?? character.default_preset ?? current.defaultPreset ?? current.default_preset ?? '',
        character.defaultModel ?? character.default_model ?? current.defaultModel ?? current.default_model ?? '',
        normalizeNullableNumber(character.roleTemperature ?? character.role_temperature ?? current.roleTemperature ?? current.role_temperature),
        normalizeNullableInteger(character.roleMaxTokens ?? character.role_max_tokens ?? current.roleMaxTokens ?? current.role_max_tokens),
        normalizeRoleThinking(character.roleThinking ?? character.role_thinking ?? current.roleThinking ?? current.role_thinking),
        normalizeReplyPipelineModeOverride(character.replyPipelineModeOverride ?? character.reply_pipeline_mode_override ?? current.replyPipelineModeOverride ?? current.reply_pipeline_mode_override),
        JSON.stringify(character.schedule ?? current.schedule ?? {}),
        JSON.stringify(character.yearlySchedule ?? character.yearly_schedule ?? current.yearlySchedule ?? current.yearly_schedule ?? []),
        JSON.stringify(character.currentActivities ?? character.current_activities ?? current.currentActivities ?? current.current_activities ?? []),
        JSON.stringify(character.relationships ?? current.relationships ?? {}),
        guardedBrainColumn(character.brainLinks ?? character.brain_links, current.brainLinks ?? current.brain_links, {}, allowBrainClear),
        guardedBrainColumn(character.brainDocuments ?? character.brain_documents, current.brainDocuments ?? current.brain_documents, {}, allowBrainClear),
        guardedBrainColumn(character.brainCognitionNodes ?? character.brain_cognition_nodes, current.brainCognitionNodes ?? current.brain_cognition_nodes, [], allowBrainClear),
        guardedBrainColumn(character.brainTraceNodes ?? character.brain_trace_nodes, current.brainTraceNodes ?? current.brain_trace_nodes, [], allowBrainClear),
        guardedBrainColumn(character.brainTrajectoryMeta ?? character.brain_trajectory_meta, current.brainTrajectoryMeta ?? current.brain_trajectory_meta, {}, allowBrainClear),
        guardedBrainColumn(character.brainPinnedOffsets ?? character.brain_pinned_offsets, current.brainPinnedOffsets ?? current.brain_pinned_offsets, {}, allowBrainClear),
        guardedBrainColumn(character.brainNodePositions ?? character.brain_node_positions, current.brainNodePositions ?? current.brain_node_positions, {}, allowBrainClear),
        guardedBrainColumn(character.brainCandidateChanges ?? character.brain_candidate_changes, current.brainCandidateChanges ?? current.brain_candidate_changes, [], allowBrainClear),
        character.affection ?? current.affection ?? 50,
        JSON.stringify(character.locations ?? current.locations ?? []),
        character.orderIndex ?? character.order_index ?? current.orderIndex ?? current.order_index ?? 0,
        optionalJsonColumnText(character.personalityKernel ?? character.personality_kernel ?? current.personalityKernel ?? current.personality_kernel)
      ])
      return { ok: true as const, data: { ok: true, avatarPath } }
    },
    deleteCharacter(id: string) {
      characterRepository.deleteCharacter(id)
      return { ok: true as const }
    },
    repairCharacterAvatarPaths,
    resolveCharacterAvatarPath: deps.resolveCharacterAvatarPath
  }
}
