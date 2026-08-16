import db from '../db.js'
import { repairWorkspaceSnapshotStorage } from '../application/workspace/workspaceSnapshotMigrator.js'
import { createChatRepository } from './chatRepository.js'
import { createCharacterRepository } from './characterRepository.js'
import { createCharacterSnapshotRepository } from './characterSnapshotRepository.js'
import { createResourceRepository } from './resourceRepository.js'
import { createSettingRepository } from './settingRepository.js'
import { createTaskRepository } from './taskRepository.js'
import { readWorkspaceSnapshotPayloadFromParts, type WorkspaceSnapshotReadOptions } from './workspaceSnapshot/readPayload.js'
import { createWorkspaceSnapshotReadParts } from './workspaceSnapshotReadParts.js'

type SnapshotDb = Pick<typeof db, 'prepare' | 'exec' | '_save'>

type SnapshotReadDeps = {
  chatRepository?: ReturnType<typeof createChatRepository>
  characterRepository?: ReturnType<typeof createCharacterRepository>
  characterSnapshotRepository?: ReturnType<typeof createCharacterSnapshotRepository>
  resourceRepository?: ReturnType<typeof createResourceRepository>
  settingRepository?: ReturnType<typeof createSettingRepository>
  taskRepository?: ReturnType<typeof createTaskRepository>
  repairWorkspaceSnapshotStorage?: (database: SnapshotDb) => void
}

export function createWorkspaceSnapshotReadRepository(
  database: SnapshotDb = db,
  deps: SnapshotReadDeps = {}
) {
  const chatRepository = deps.chatRepository ?? createChatRepository(database)
  const characterRepository = deps.characterRepository ?? createCharacterRepository(database)
  const characterSnapshotRepository = deps.characterSnapshotRepository ?? createCharacterSnapshotRepository(database)
  const resourceRepository = deps.resourceRepository ?? createResourceRepository(database)
  const settingRepository = deps.settingRepository ?? createSettingRepository(database)
  const taskRepository = deps.taskRepository ?? createTaskRepository(database)
  const repairSnapshotStorage = deps.repairWorkspaceSnapshotStorage ?? repairWorkspaceSnapshotStorage
  const readParts = createWorkspaceSnapshotReadParts({
    chatRepository,
    characterRepository,
    characterSnapshotRepository,
    resourceRepository,
    settingRepository,
    taskRepository
  })

  return {
    readWorkspaceExportPayload(options: WorkspaceSnapshotReadOptions = {}) {
      repairSnapshotStorage(database)
      return readWorkspaceSnapshotPayloadFromParts(readParts, options)
    }
  }
}

const workspaceSnapshotReadRepository = createWorkspaceSnapshotReadRepository()

export function readWorkspaceExportPayload(options: WorkspaceSnapshotReadOptions = {}) {
  return workspaceSnapshotReadRepository.readWorkspaceExportPayload(options)
}

export { workspaceSnapshotReadRepository }
