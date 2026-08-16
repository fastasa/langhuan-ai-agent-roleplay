type WorkspaceSnapshotReadOptions = {
  includeAllChats?: boolean
  includeChatMetadata?: boolean
}

type WorkspaceSnapshotReadParts = {
  readResourcePartition: () => Record<string, unknown>
  readCharacterPartition: () => Record<string, unknown>
  readChatPartition: (options?: WorkspaceSnapshotReadOptions) => Record<string, unknown>
  readSettingsPartition: () => Record<string, unknown>
  readTaskPartition: () => Record<string, unknown>
}

export function readWorkspaceSnapshotPayloadFromParts(
  readParts: WorkspaceSnapshotReadParts,
  options: WorkspaceSnapshotReadOptions = {}
) {
  return {
    ...readParts.readResourcePartition(),
    ...readParts.readCharacterPartition(),
    ...readParts.readChatPartition(options),
    ...readParts.readSettingsPartition(),
    ...readParts.readTaskPartition()
  }
}

export type { WorkspaceSnapshotReadOptions, WorkspaceSnapshotReadParts }
