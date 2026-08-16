import { existsSync } from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'
import db from '../../db.js'
import { logger as defaultLogger } from '../../logger.js'
import { createChatRepository } from '../../repositories/chatRepository.js'
import { createCharacterRepository } from '../../repositories/characterRepository.js'
import { createResourceRepository } from '../../repositories/resourceRepository.js'
import { createTaskRepository } from '../../repositories/taskRepository.js'
import { createWorkspaceCharacterFacadeService } from './workspaceCharacterFacadeService.js'
import { createWorkspaceChatFacadeService } from './workspaceChatFacadeService.js'
import { createWorkspaceResourceFacadeService } from './workspaceResourceFacadeService.js'
import { createWorkspaceTaskFacadeService } from './workspaceTaskFacadeService.js'

type WorkspaceDataDb = Pick<typeof db, 'prepare'>

type WorkspaceDataDeps = {
  avatarDir?: string
  baseDir?: string
  chatRepository?: ReturnType<typeof createChatRepository>
  characterRepository?: ReturnType<typeof createCharacterRepository>
  fileExists?: (path: string) => boolean
  resourceRepository?: ReturnType<typeof createResourceRepository>
  taskRepository?: ReturnType<typeof createTaskRepository>
  logger?: Pick<typeof defaultLogger, 'error'>
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultBaseDir = join(__dirname, '..', '..')
const defaultAvatarDir = join(defaultBaseDir, 'data', 'avatars')

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function getLocalDateKey(input: string | number | Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    return `${fallback.getFullYear()}-${padDatePart(fallback.getMonth() + 1)}-${padDatePart(fallback.getDate())}`
  }
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function buildEventStackSummary(events: Array<Record<string, any>>) {
  let totalPoints = 0
  let totalMoney = 0
  const ticketChanges: Record<string, { used: number, exchanged: number }> = {}

  for (const event of events) {
    totalPoints += Number(event.pointsDelta || 0)
    totalMoney += Number(event.moneyDelta || 0)

    if (event.ticketsUsed && typeof event.ticketsUsed === 'object') {
      for (const [name, count] of Object.entries(event.ticketsUsed)) {
        if (!ticketChanges[name]) ticketChanges[name] = { used: 0, exchanged: 0 }
        ticketChanges[name].used += Number(count || 0)
      }
    }

    if (event.ticketsExchanged && typeof event.ticketsExchanged === 'object') {
      for (const [name, count] of Object.entries(event.ticketsExchanged)) {
        if (!ticketChanges[name]) ticketChanges[name] = { used: 0, exchanged: 0 }
        ticketChanges[name].exchanged += Number(count || 0)
      }
    }
  }

  return { totalPoints, totalMoney, ticketChanges }
}

/**
 * 兼容组合层：
 * 旧入口仍可通过这个工厂拿到资源、角色、聊天、任务的组合服务，
 * 但新的正式代码不应继续依赖这里作为主服务中心。
 */
export function createWorkspaceDataAppService(
  database: WorkspaceDataDb = db,
  deps: WorkspaceDataDeps = {}
) {
  const fileExists = deps.fileExists ?? existsSync
  const serviceLogger = deps.logger ?? defaultLogger
  const baseDir = deps.baseDir ?? defaultBaseDir
  const avatarDir = deps.avatarDir ?? defaultAvatarDir
  const resourceRepository = deps.resourceRepository ?? createResourceRepository(database)
  const characterRepository = deps.characterRepository ?? createCharacterRepository(database)
  const taskRepository = deps.taskRepository ?? createTaskRepository(database)

  function resolveCharacterAvatarPath(characterId: string, avatarPath: string): string {
    const raw = String(avatarPath || '').trim()
    if (!characterId || !raw || raw.startsWith('data:') || /^https?:\/\//i.test(raw)) {
      return raw
    }

    const normalized = raw.replace(/^\/+/, '')
    const currentAbsolute = join(baseDir, normalized)
    if (fileExists(currentAbsolute)) {
      return `/${normalized}`
    }

    const currentExt = extname(normalized).toLowerCase()
    const baseName = currentExt ? normalized.slice(0, -currentExt.length) : normalized
    for (const candidateExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      if (candidateExt === currentExt) continue
      const candidateRelative = `${baseName}${candidateExt}`.replace(/^\/+/, '')
      if (fileExists(join(baseDir, candidateRelative))) {
        return `/${candidateRelative}`
      }
    }

    for (const candidateExt of ['.png', '.jpg', '.jpeg', '.webp']) {
      if (fileExists(join(avatarDir, `${characterId}${candidateExt}`))) {
        return `/avatars/${characterId}${candidateExt}`
      }
    }

    return raw.startsWith('/') ? raw : `/${normalized}`
  }

  const workspaceChatAppService = createWorkspaceChatFacadeService(database, {
    chatRepository: deps.chatRepository,
    logger: serviceLogger
  })
  const workspaceResourceAppService = createWorkspaceResourceFacadeService(database, {
    resourceRepository
  })
  const workspaceCharacterAppService = createWorkspaceCharacterFacadeService(database, {
    characterRepository,
    logger: serviceLogger,
    resolveCharacterAvatarPath
  })
  const workspaceTaskAppService = createWorkspaceTaskFacadeService(database, {
    taskRepository,
    logger: serviceLogger
  })

  return {
    chatService: workspaceChatAppService,
    ...workspaceResourceAppService,
    ...workspaceCharacterAppService,
    ...workspaceChatAppService,
    ...workspaceTaskAppService
  }
}
