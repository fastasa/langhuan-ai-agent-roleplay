import { addHistory } from '../shared/dbUtils.js'
import { resourceRepository } from '../../repositories/resourceRepository.js'

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function toFloat(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBoolInt(value: unknown): number {
  return value ? 1 : 0
}

export function createResourceAppService(repository = resourceRepository) {
  return {
    getResources() {
      return repository.getResources()
    },
    updateResources(payload: Record<string, any>) {
      const points = toInt(payload.points)
      const bigTimeCount = toInt(payload.bigTimeCount ?? payload.big_time_count)
      const smallTimeCount = toInt(payload.smallTimeCount ?? payload.small_time_count)
      const money = toFloat(payload.money)

      repository.updateResources(points, bigTimeCount, smallTimeCount, money)

      addHistory('UPDATE_RESOURCES')
      return { ok: true }
    },
    getTickets() {
      return repository.getTickets()
    },
    addTicket(payload: Record<string, any>) {
      const id = String(payload.id || '')
      const name = String(payload.name || '')
      const cost = toInt(payload.cost, 1)
      const count = toInt(payload.count)
      const categoryId = String(payload.categoryId ?? payload.category_id ?? payload.category ?? '')
      const timerMinutes = toInt(payload.timerMinutes ?? payload.timer_minutes)
      const autoConsumeNext = toBoolInt(payload.autoConsumeNext ?? payload.auto_consume_next)
      const icon = String(payload.icon || '')
      const orderIndex = toInt(payload.orderIndex ?? payload.order_index)

      repository.insertTicket({
        id,
        name,
        cost,
        count,
        categoryId,
        timerMinutes,
        autoConsumeNext,
        icon,
        orderIndex
      })

      addHistory('ADD_TICKET', name)
      return { ok: true, id }
    },
    updateTicket(id: string, payload: Record<string, any>) {
      const current = repository.getTicketById(id)
      if (!current) {
        throw new Error('绁ㄦ嵁涓嶅瓨鍦?')
      }

      const next = {
        name: String(payload.name ?? current.name ?? ''),
        cost: toInt(payload.cost ?? current.cost, 1),
        count: toInt(payload.count ?? current.count),
        categoryId: String(payload.categoryId ?? payload.category_id ?? payload.category ?? current.categoryId ?? current.category_id ?? ''),
        timerMinutes: toInt(payload.timerMinutes ?? payload.timer_minutes ?? current.timerMinutes ?? current.timer_minutes),
        autoConsumeNext: toBoolInt(payload.autoConsumeNext ?? payload.auto_consume_next ?? current.autoConsumeNext ?? current.auto_consume_next),
        icon: String(payload.icon ?? current.icon ?? ''),
        orderIndex: toInt(payload.orderIndex ?? payload.order_index ?? current.orderIndex ?? current.order_index)
      }

      repository.updateTicket(id, next)
      return { ok: true }
    },
    deleteTicket(id: string) {
      repository.deleteTicket(id)
      return { ok: true }
    },
    addTicketCategory(payload: Record<string, any>) {
      const id = String(payload.id || '')
      const name = String(payload.name || '')
      const orderIndex = toInt(payload.orderIndex ?? payload.order_index)
      repository.insertTicketCategory(id, name, orderIndex)
      return { ok: true, id }
    },
    deleteTicketCategory(id: string) {
      repository.deleteTicketCategory(id)
      return { ok: true }
    },
    getHistory() {
      return repository.getHistory()
    },
    addHistoryEntry(payload: Record<string, any>) {
      addHistory(String(payload.action || ''), String(payload.detail || ''))
      return { ok: true }
    }
  }
}

export const resourceAppService = createResourceAppService()
