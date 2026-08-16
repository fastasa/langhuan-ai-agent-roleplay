import { createResourceRepository } from '../resourceRepository.js'

type ResourceRepository = ReturnType<typeof createResourceRepository>

export function readResourceSnapshotPartition(resourceRepository: ResourceRepository) {
  return {
    resources: resourceRepository.getResources(),
    tickets: resourceRepository.getTickets(),
    ticketCategories: resourceRepository.getTicketCategories(),
    history: resourceRepository.getHistory(),
    timers: resourceRepository.getTimers(),
    customTags: resourceRepository.getCustomTags(),
    eventStack: resourceRepository.getEventStack()
  }
}
