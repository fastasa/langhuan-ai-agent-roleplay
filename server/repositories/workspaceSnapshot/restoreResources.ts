import { createResourceRepository } from '../resourceRepository.js'
import { toNum, toText } from './shared.js'

type ResourceRepository = ReturnType<typeof createResourceRepository>

export function applyResourceSnapshotPartition(resourceRepository: ResourceRepository, payload: Record<string, any>) {
  if (payload.resources && typeof payload.resources === 'object') {
    resourceRepository.patchResources({
      points: toNum(payload.resources.points, 0),
      bigTimeCount: toNum(payload.resources.bigTimeCount, 0),
      smallTimeCount: toNum(payload.resources.smallTimeCount, 0),
      money: toNum(payload.resources.money, 0)
    })
  }

  if (Array.isArray(payload.ticketCategories)) {
    resourceRepository.replaceTicketCategories(payload.ticketCategories.map((item: any, index: number) => ({
      id: toText(item?.id || `cat_${index}`),
      name: toText(item?.name || '未命名分类'),
      orderIndex: toNum(item?.orderIndex, index)
    })))
  }

  if (Array.isArray(payload.tickets)) {
    resourceRepository.replaceTickets(payload.tickets.map((item: any, index: number) => ({
      id: toText(item?.id || `ticket_${index}`),
      name: toText(item?.name || '未命名票据'),
      cost: toNum(item?.cost, 1),
      count: toNum(item?.count, 0),
      categoryId: toText(item?.categoryId ?? item?.category_id, ''),
      timerMinutes: toNum(item?.timerMinutes ?? item?.timer_minutes, 0),
      autoConsumeNext: toNum(item?.autoConsumeNext ?? item?.auto_consume_next, 0),
      icon: toText(item?.icon, ''),
      orderIndex: toNum(item?.orderIndex, index)
    })))
  }

  if (Array.isArray(payload.timers)) {
    resourceRepository.replaceTimers(payload.timers.flatMap((item: any, index: number) => {
      const remaining = Math.max(0, toNum(item?.remainingMs ?? item?.remaining_ms, 0))
      const paused = toNum(item?.paused, 0) ? 1 : 0
      const endTime = paused
        ? Date.now() + remaining
        : toNum(item?.endTime ?? item?.end_time, Date.now() + remaining)
      if (remaining <= 0) return []
      return [{
        id: toText(item?.id || `timer_${Date.now()}_${index}`),
        ticketId: toText(item?.ticketId ?? item?.ticket_id, ''),
        ticketName: toText(item?.ticketName ?? item?.ticket_name, '票据'),
        endTime,
        paused,
        remainingMs: remaining,
        createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
      }]
    }))
  }

  if (Array.isArray(payload.history)) {
    resourceRepository.replaceHistory(payload.history.slice(0, 200).map((item: any) => ({
      action: toText(item?.action, ''),
      detail: toText(item?.detail, ''),
      createdAt: toText(item?.createdAt ?? item?.created_at, new Date().toISOString())
    })))
  }
}
