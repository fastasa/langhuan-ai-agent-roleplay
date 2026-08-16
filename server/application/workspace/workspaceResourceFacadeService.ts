import { addHistory } from '../shared/dbUtils.js'
import db from '../../db.js'
import { createResourceRepository } from '../../repositories/resourceRepository.js'

type WorkspaceResourceFacadeDb = Pick<typeof db, 'prepare'>

type WorkspaceResourceFacadeDeps = {
  resourceRepository?: ReturnType<typeof createResourceRepository>
}

export function createWorkspaceResourceFacadeService(
  database: WorkspaceResourceFacadeDb = db,
  deps: WorkspaceResourceFacadeDeps = {}
) {
  const resourceRepository = deps.resourceRepository ?? createResourceRepository(database)

  return {
    updateResources(payload: Record<string, any>) {
      const { points, bigTimeCount, smallTimeCount, money } = payload
      resourceRepository.patchResources({
        points,
        bigTimeCount,
        smallTimeCount,
        money
      })
      return { ok: true as const }
    },
    getTickets() {
      return resourceRepository.getTickets()
    },
    addTicket(payload: Record<string, any>) {
      const { id, name, cost, count, categoryId, timerMinutes, autoConsumeNext, icon, orderIndex } = payload
      resourceRepository.insertTicket({
        id,
        name,
        cost: cost ?? 1,
        count: count ?? 0,
        categoryId: categoryId ?? '',
        timerMinutes: timerMinutes ?? 0,
        autoConsumeNext: autoConsumeNext ? 1 : 0,
        icon: icon ?? '',
        orderIndex: orderIndex ?? 0
      })
      addHistory('新增票据', name)
      return { ok: true as const }
    },
    updateTicket(id: string, payload: Record<string, any>) {
      const { name, cost, count, categoryId, timerMinutes, autoConsumeNext, icon, orderIndex } = payload
      const current = resourceRepository.getTicketById(id)
      if (!current) {
        return { ok: false as const, status: 404, error: 'ticket not found' }
      }
      resourceRepository.updateTicket(id, {
        name: name ?? current.name ?? '',
        cost: cost ?? current.cost ?? 1,
        count: count ?? current.count ?? 0,
        categoryId: categoryId ?? current.categoryId ?? current.category_id ?? '',
        timerMinutes: timerMinutes ?? current.timerMinutes ?? current.timer_minutes ?? 0,
        autoConsumeNext: autoConsumeNext === undefined
          ? Number(current.autoConsumeNext ?? current.auto_consume_next ?? 0)
          : (autoConsumeNext ? 1 : 0),
        icon: icon ?? current.icon ?? '',
        orderIndex: orderIndex ?? current.orderIndex ?? current.order_index ?? 0
      })
      return { ok: true as const }
    },
    deleteTicket(id: string) {
      resourceRepository.deleteTicket(id)
      return { ok: true as const }
    },
    addTicketCategory(payload: Record<string, any>) {
      const { id, name, orderIndex } = payload
      resourceRepository.insertTicketCategory(id, name, orderIndex ?? 0)
      return { ok: true as const }
    },
    deleteTicketCategory(id: string) {
      resourceRepository.deleteTicketCategory(id)
      return { ok: true as const }
    }
  }
}

export const workspaceResourceFacadeService = createWorkspaceResourceFacadeService()
