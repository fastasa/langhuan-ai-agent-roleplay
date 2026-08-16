import type { ServerData } from '../types'
import { extractChatSnapshotPayload } from '../repositories/chatRepository'

type CreateChatStoreLoaderDeps = {
  applyChatSnapshot: (payload: ReturnType<typeof extractChatSnapshotPayload>) => void
}

export function createChatStoreLoader(deps: CreateChatStoreLoaderDeps) {
  async function applyServerSnapshot(data: ServerData): Promise<void> {
    deps.applyChatSnapshot(extractChatSnapshotPayload(data))
  }

  return {
    applyServerSnapshot
  }
}
