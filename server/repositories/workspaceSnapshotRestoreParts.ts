import { createChatRepository } from './chatRepository.js'
import { createCharacterRepository } from './characterRepository.js'
import { createCharacterSnapshotRepository } from './characterSnapshotRepository.js'
import { createResourceRepository } from './resourceRepository.js'
import { createSettingRepository } from './settingRepository.js'
import { createTaskRepository } from './taskRepository.js'
import { applyChatSnapshotPartition } from './workspaceSnapshot/restoreChats.js'
import { applyCharacterSnapshotPartition } from './workspaceSnapshot/restoreCharacters.js'
import { applyResourceSnapshotPartition } from './workspaceSnapshot/restoreResources.js'
import { applySettingsSnapshotPartition } from './workspaceSnapshot/restoreSettings.js'
import { applyTaskSnapshotPartition } from './workspaceSnapshot/restoreTasks.js'
import {
  ensureSnapshotAvatarDir,
  filterPayloadByModules,
  type WorkspaceSnapshotModule,
  WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP
} from './workspaceSnapshot/shared.js'

type ChatRepository = ReturnType<typeof createChatRepository>
type CharacterRepository = ReturnType<typeof createCharacterRepository>
type CharacterSnapshotRepository = ReturnType<typeof createCharacterSnapshotRepository>
type ResourceRepository = ReturnType<typeof createResourceRepository>
type SettingRepository = ReturnType<typeof createSettingRepository>
type TaskRepository = ReturnType<typeof createTaskRepository>

type RestorePartsDeps = {
  database: any
  chatRepository: ChatRepository
  characterRepository: CharacterRepository
  characterSnapshotRepository: CharacterSnapshotRepository
  resourceRepository: ResourceRepository
  settingRepository: SettingRepository
  taskRepository: TaskRepository
}

export { filterPayloadByModules, WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP }
export type { WorkspaceSnapshotModule }

export function createWorkspaceSnapshotRestoreParts(deps: RestorePartsDeps) {
  return {
    ensureWritableAssets() {
      ensureSnapshotAvatarDir()
    },
    applyResourcePartition(payload: Record<string, any>) {
      applyResourceSnapshotPartition(deps.resourceRepository, payload)
    },
    applyCharacterPartition(payload: Record<string, any>) {
      applyCharacterSnapshotPartition(deps.characterRepository, payload)
    },
    applyChatPartition(payload: Record<string, any>) {
      applyChatSnapshotPartition(deps.chatRepository, payload, deps.characterSnapshotRepository)
    },
    applySettingsPartition(payload: Record<string, any>) {
      applySettingsSnapshotPartition(deps.settingRepository, payload)
    },
    applyTaskPartition(payload: Record<string, any>) {
      applyTaskSnapshotPartition(deps.database, deps.taskRepository, payload)
    }
  }
}
