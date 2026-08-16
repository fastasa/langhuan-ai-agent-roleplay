import { resolveCharacterAvatarPath } from '../../application/workspace/workspaceSnapshotMigrator.js'
import {
  normalizeBrainNeuronReplaceRow
} from '../../application/character/brainRecordNormalizer.js'
import { createCharacterRepository } from '../characterRepository.js'
import { createDocLibraryRepository } from '../docLibraryRepository.js'
import { createPersonalityTrainingRepository } from '../personalityTrainingRepository.js'
import { createDocLibraryAppService } from '../../application/docLibrary/docLibraryAppService.js'
import { saveAvatarDataUri } from './avatarStorage.js'
import { toJson, toNum, toText } from './shared.js'
import { getActiveUserId } from '../../localWorkspace.js'

type CharacterRepository = ReturnType<typeof createCharacterRepository>
type DocLibraryRepository = ReturnType<typeof createDocLibraryRepository>

function getScopedUserProfileAvatarFileName(): string {
  const userId = getActiveUserId().trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  return userId ? `user_profile_${userId}` : 'user_profile'
}

function toOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function toOptionalPositiveInteger(value: unknown): number | null {
  const next = toOptionalNumber(value)
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

function toOptionalJsonText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  return toJson(value, '')
}

export function applyCharacterSnapshotPartition(
  characterRepository: CharacterRepository,
  payload: Record<string, any>,
  docLibraryRepository: DocLibraryRepository = createDocLibraryRepository(),
  personalityTrainingRepository = createPersonalityTrainingRepository()
) {
  if (Array.isArray(payload.characterGroups)) {
    characterRepository.replaceCharacterGroups(payload.characterGroups.map((item: any, index: number) => ({
      id: toText(item?.id || `group_${index}`),
      name: toText(item?.name || '未命名分组'),
      emoji: toText(item?.emoji || '👤'),
      orderIndex: toNum(item?.orderIndex, index)
    })))
  }

  if (Array.isArray(payload.characters)) {
    characterRepository.replaceCharacters(payload.characters.map((item: any, index: number) => {
      const characterId = toText(item?.id || `char_${index}`)
      const avatarPath = resolveCharacterAvatarPath(characterId, toText(item?.avatarPath ?? item?.avatar_path, ''))
      return [
        characterId,
        toText(item?.name || '未命名角色'),
        toText(item?.gender, ''),
        toText(item?.age, ''),
        toText(item?.emoji || '👤'),
        avatarPath,
        toText(item?.groupId ?? item?.group_id, 'default'),
        toText(item?.desc, ''),
        toText(item?.appearance, ''),
        toText(item?.outfit, ''),
        toText(item?.personality, ''),
        toText(item?.hobbies, ''),
        toText(item?.abilities, ''),
        toText(item?.experience, ''),
        toText(item?.worldview, ''),
        toText(item?.background, ''),
        toText(item?.speakingStyle ?? item?.speaking_style, ''),
        toJson(item?.nicknames, []),
        toText(item?.defaultPreset ?? item?.default_preset, ''),
        toText(item?.defaultModel ?? item?.default_model, ''),
        toOptionalNumber(item?.roleTemperature ?? item?.role_temperature),
        toOptionalPositiveInteger(item?.roleMaxTokens ?? item?.role_max_tokens),
        normalizeRoleThinking(item?.roleThinking ?? item?.role_thinking),
        normalizeReplyPipelineModeOverride(item?.replyPipelineModeOverride ?? item?.reply_pipeline_mode_override),
        toJson(item?.schedule, {}),
        toJson(item?.yearlySchedule ?? item?.yearly_schedule, []),
        toJson(item?.currentActivities ?? item?.current_activities, []),
        toJson(item?.relationships, {}),
        toJson(item?.brainLinks ?? item?.brain_links, {}),
        toJson(item?.brainDocuments ?? item?.brain_documents, {}),
        toJson(item?.brainCognitionNodes ?? item?.brain_cognition_nodes, []),
        toJson(item?.brainTraceNodes ?? item?.brain_trace_nodes, []),
        toJson(item?.brainTrajectoryMeta ?? item?.brain_trajectory_meta, {}),
        toJson(item?.brainPinnedOffsets ?? item?.brain_pinned_offsets, {}),
        toJson(item?.brainNodePositions ?? item?.brain_node_positions, {}),
        toJson(item?.brainCandidateChanges ?? item?.brain_candidate_changes, []),
        toNum(item?.affection, 50),
        toJson(item?.locations, []),
        toNum(item?.orderIndex, index),
        toOptionalJsonText(item?.personalityKernel ?? item?.personality_kernel)
      ]
    }))
    payload.characters.forEach((item: any) => {
      const characterId = toText(item?.id, '')
      const modelPath = toText(item?.personalityModelPath ?? item?.personality_model_path, '')
      if (characterId && modelPath) {
        characterRepository.updateCharacterPersonalityModelPath(characterId, modelPath)
      }
    })
  }

  if (Array.isArray(payload.groups)) {
    characterRepository.replaceGroups(payload.groups.map((item: any, index: number) => ({
      id: toText(item?.id || `chat_group_${index}`),
      name: toText(item?.name || '未命名群聊'),
      emoji: toText(item?.emoji || '👥'),
      avatarPath: saveAvatarDataUri(toText(item?.avatarPath ?? item?.avatar_path, ''), `group_${Date.now()}_${index}`),
      members: toJson(item?.members, []),
      orderIndex: toNum(item?.orderIndex, index)
    })))
  }

  if (Array.isArray(payload.crowds)) {
    characterRepository.replaceCrowds(payload.crowds.map((item: any, index: number) => ({
      id: toText(item?.id || `crowd_${index}`),
      name: toText(item?.name || '未命名群众'),
      members: toJson(item?.members, []),
      defaultPreset: toText(item?.defaultPreset ?? item?.default_preset, '')
    })))
  }

  if (Array.isArray(payload.aliases)) {
    characterRepository.replaceAliases(payload.aliases.map((item: any, index: number) => ({
      id: toText(item?.id || `alias_${index}`),
      name: toText(item?.name || '未命名马甲'),
      gender: toText(item?.gender, ''),
      age: toText(item?.age, ''),
      desc: toText(item?.desc, ''),
      affections: toJson(item?.affections, {})
    })))
  }

  if (payload.userProfile && typeof payload.userProfile === 'object') {
    const u = payload.userProfile as Record<string, unknown>
    const avatarPath = saveAvatarDataUri(toText(u.avatarPath ?? u.avatar_path, ''), getScopedUserProfileAvatarFileName())
    characterRepository.replaceUserProfile([
      toText(u.name, '用户'),
      toText(u.gender, ''),
      toText(u.age, ''),
      toText(u.desc, ''),
      avatarPath,
      toText(u.emoji, ''),
      toText(u.appearance, ''),
      toText(u.personality, ''),
      toText(u.outfit, ''),
      toText(u.hobbies, ''),
      toText(u.abilities, ''),
      toText(u.experience, ''),
      toText(u.worldview, ''),
      toText(u.background, '')
    ])
  }

  personalityTrainingRepository.replaceSnapshotRows({
    personalityTrainingDatasets: payload.personalityTrainingDatasets,
    personalityTrainingRuns: payload.personalityTrainingRuns,
    personalityModelVersions: payload.personalityModelVersions,
    personalityEvaluationSets: payload.personalityEvaluationSets
  })

  if (Array.isArray(payload.documents)) {
    createDocLibraryAppService(docLibraryRepository).replaceState({
      documents: payload.documents,
      manualTreeOrders: payload.docLibraryManualTreeOrders || payload.documentTreeOrders || {},
      schemaVersion: payload.docLibrarySchemaVersion,
      treeNodes: payload.docLibraryTreeNodes,
      treeOrders: payload.docLibraryTreeOrders,
      treeMigrationMeta: payload.docLibraryTreeMigrationMeta,
      treeDiffReport: payload.docLibraryTreeDiffReport,
      relationSystemState: payload.docLibraryRelationSystemState || {}
    })
  }

  if (Array.isArray(payload.brainNeurons)) {
    characterRepository.replaceBrainNeurons(payload.brainNeurons.map((item: any, index: number) => (
      normalizeBrainNeuronReplaceRow(item, index)
    )))
  }
}
