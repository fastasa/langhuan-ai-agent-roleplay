import { createChatRepository } from './chatRepository.js'
import { createCharacterRepository } from './characterRepository.js'
import { createCharacterSnapshotRepository } from './characterSnapshotRepository.js'
import { createResourceRepository } from './resourceRepository.js'
import { createSettingRepository } from './settingRepository.js'
import { createTaskRepository } from './taskRepository.js'
import { readChatSnapshotPartition } from './workspaceSnapshot/readChats.js'
import { readCharacterSnapshotPartition } from './workspaceSnapshot/readCharacters.js'
import { readResourceSnapshotPartition } from './workspaceSnapshot/readResources.js'
import { readSettingsSnapshotPartition } from './workspaceSnapshot/readSettings.js'
import { readTaskSnapshotPartition } from './workspaceSnapshot/readTasks.js'
import type { WorkspaceSnapshotReadOptions } from './workspaceSnapshot/readPayload.js'

type ChatRepository = ReturnType<typeof createChatRepository>
type CharacterRepository = ReturnType<typeof createCharacterRepository>
type CharacterSnapshotRepository = ReturnType<typeof createCharacterSnapshotRepository>
type ResourceRepository = ReturnType<typeof createResourceRepository>
type SettingRepository = ReturnType<typeof createSettingRepository>
type TaskRepository = ReturnType<typeof createTaskRepository>

type SnapshotReadPartsDeps = {
  chatRepository: ChatRepository
  characterRepository: CharacterRepository
  characterSnapshotRepository: CharacterSnapshotRepository
  resourceRepository: ResourceRepository
  settingRepository: SettingRepository
  taskRepository: TaskRepository
}

export function createWorkspaceSnapshotReadParts(deps: SnapshotReadPartsDeps) {
  return {
    readResourcePartition() {
      return readResourceSnapshotPartition(deps.resourceRepository)
    },
    readCharacterPartition() {
      return readCharacterSnapshotPartition(deps.characterRepository)
    },
    readChatPartition(options: WorkspaceSnapshotReadOptions = {}) {
      return readChatSnapshotPartition(deps.chatRepository, options, deps.characterSnapshotRepository)
    },
    readSettingsPartition() {
      return readSettingsSnapshotPartition(deps.settingRepository)
    },
    readTaskPartition() {
      return readTaskSnapshotPartition(deps.taskRepository)
    }
  }
}
