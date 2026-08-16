import { resolveCharacterAvatarPath as resolveMigratedCharacterAvatarPath } from '../../application/workspace/workspaceSnapshotMigrator.js'
import { createCharacterRepository } from '../characterRepository.js'
import { createDocLibraryRepository } from '../docLibraryRepository.js'
import { createPersonalityTrainingRepository } from '../personalityTrainingRepository.js'

type CharacterRepository = ReturnType<typeof createCharacterRepository>
type DocLibraryRepository = ReturnType<typeof createDocLibraryRepository>

function normalizeCharacterRows(rows: Array<Record<string, unknown> | null>) {
  return rows.map((item) => {
    const normalized = item ? { ...item } : item
    if (!normalized) return normalized
    const fixedPath = resolveMigratedCharacterAvatarPath(
      String(normalized.id || ''),
      String(normalized.avatarPath ?? normalized.avatar_path ?? '')
    )
    if (fixedPath) {
      normalized.avatarPath = fixedPath
      normalized.avatar_path = fixedPath
    }
    return normalized
  })
}

export function readCharacterSnapshotPartition(
  characterRepository: CharacterRepository,
  docLibraryRepository: DocLibraryRepository = createDocLibraryRepository(),
  personalityTrainingRepository = createPersonalityTrainingRepository()
) {
  const personalityTrainingPayload = personalityTrainingRepository.snapshotPayload()
  return {
    characters: normalizeCharacterRows(characterRepository.getCharacters() as Array<Record<string, unknown> | null>),
    characterGroups: characterRepository.getCharacterGroups(),
    groups: characterRepository.getGroups(),
    crowds: characterRepository.getCrowds(),
    aliases: characterRepository.getAliases(),
    userProfile: characterRepository.getUserProfile(),
    ...personalityTrainingPayload,
    documents: docLibraryRepository.getDocuments(),
    documentTreeOrders: docLibraryRepository.getManualTreeOrders(),
    docLibrarySchemaVersion: docLibraryRepository.getSchemaVersion?.(),
    docLibraryTreeNodes: docLibraryRepository.getTreeNodes?.(),
    docLibraryTreeOrders: docLibraryRepository.getTreeOrders?.(),
    docLibraryTreeMigrationMeta: docLibraryRepository.getTreeMigrationMeta?.(),
    docLibraryTreeDiffReport: docLibraryRepository.getTreeDiffReport?.(),
    docLibraryRelationSystemState: docLibraryRepository.getRelationSystemState?.(),
    brainNeurons: characterRepository.getBrainNeurons()
  }
}
