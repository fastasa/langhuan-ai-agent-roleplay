import { createChatRepository } from './chatRepository.js'
import { createCharacterRepository } from './characterRepository.js'
import { createCharacterSnapshotRepository } from './characterSnapshotRepository.js'
import { createResourceRepository } from './resourceRepository.js'
import { createSettingRepository } from './settingRepository.js'
import { createTaskRepository } from './taskRepository.js'
import {
  createWorkspaceSnapshotRestoreParts,
  filterPayloadByModules,
  type WorkspaceSnapshotModule
} from './workspaceSnapshotRestoreParts.js'

type RestoreDeps = {
  chatRepository?: ReturnType<typeof createChatRepository>
  characterRepository?: ReturnType<typeof createCharacterRepository>
  characterSnapshotRepository?: ReturnType<typeof createCharacterSnapshotRepository>
  resourceRepository?: ReturnType<typeof createResourceRepository>
  settingRepository?: ReturnType<typeof createSettingRepository>
  taskRepository?: ReturnType<typeof createTaskRepository>
}

export function createWorkspaceSnapshotRestoreRepository(database: any, deps: RestoreDeps = {}) {
  const chatRepository = deps.chatRepository ?? createChatRepository(database)
  const characterRepository = deps.characterRepository ?? createCharacterRepository(database)
  const characterSnapshotRepository = deps.characterSnapshotRepository ?? createCharacterSnapshotRepository(database)
  const resourceRepository = deps.resourceRepository ?? createResourceRepository(database)
  const settingRepository = deps.settingRepository ?? createSettingRepository(database)
  const taskRepository = deps.taskRepository ?? createTaskRepository(database)
  const restoreParts = createWorkspaceSnapshotRestoreParts({
    database,
    chatRepository,
    characterRepository,
    characterSnapshotRepository,
    resourceRepository,
    settingRepository,
    taskRepository
  })

  return {
    applyWorkspaceSnapshotRestore(payload: Record<string, any>, modules?: WorkspaceSnapshotModule[]): { ok: true } {
      const filteredPayload = filterPayloadByModules(payload, modules)

      restoreParts.ensureWritableAssets()
      database.exec('BEGIN')
      try {
        restoreParts.applyResourcePartition(filteredPayload)
        restoreParts.applyCharacterPartition(filteredPayload)
        restoreParts.applyChatPartition(filteredPayload)
        restoreParts.applySettingsPartition(filteredPayload)
        restoreParts.applyTaskPartition(filteredPayload)

        database.exec('COMMIT')
        return { ok: true }
      } catch (error) {
        try {
          database.exec('ROLLBACK')
        } catch {}
        throw error
      }
    }
  }
}

export function applyWorkspaceSnapshotRestore(database: any, payload: Record<string, any>, modules?: WorkspaceSnapshotModule[]): { ok: true } {
  return createWorkspaceSnapshotRestoreRepository(database).applyWorkspaceSnapshotRestore(payload, modules)
}
