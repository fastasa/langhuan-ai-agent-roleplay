import type { Ref } from 'vue'
import type { WorkspaceSnapshotV1 } from '../types/workspace'
import { createWorkspaceSnapshotAppliers } from './workspaceSnapshotAppliers'

type WorkspaceDomainPartition = Partial<WorkspaceSnapshotV1>

type PartitionLoaderDeps = {
  resourceStore: Record<string, any>
  charStore: Record<string, any>
  chatStore: Record<string, any>
  settingStore: Record<string, any>
  taskStore: Record<string, any>
  timerComposable?: {
    replaceTimersFromLocalArchive?: (timers: any[]) => Promise<void>
  }
  customTags?: Ref<any[]>
  eventStack?: Ref<any[]>
}

function buildResourcePartition(snapshot: WorkspaceSnapshotV1): WorkspaceDomainPartition {
  return {
    resources: snapshot.resources,
    tickets: snapshot.tickets,
    ticketCategories: snapshot.ticketCategories,
    history: snapshot.history
  }
}

function buildCharacterPartition(snapshot: WorkspaceSnapshotV1): WorkspaceDomainPartition {
  return {
    characters: snapshot.characters,
    characterGroups: snapshot.characterGroups,
    groups: snapshot.groups,
    crowds: snapshot.crowds,
    aliases: snapshot.aliases,
    userProfile: snapshot.userProfile
  }
}

function buildChatPartition(snapshot: WorkspaceSnapshotV1): WorkspaceDomainPartition {
  return {
    workspaceTarget: snapshot.workspaceTarget,
    workspaceSessionId: snapshot.workspaceSessionId,
    summaryLibrary: snapshot.summaryLibrary,
    smallSummaries: snapshot.smallSummaries,
    bigSummaries: snapshot.bigSummaries,
    documents: snapshot.documents,
    documentTreeOrders: snapshot.documentTreeOrders,
    docLibrarySchemaVersion: snapshot.docLibrarySchemaVersion,
    docLibraryTreeNodes: snapshot.docLibraryTreeNodes,
    docLibraryTreeOrders: snapshot.docLibraryTreeOrders,
    docLibraryTreeMigrationMeta: snapshot.docLibraryTreeMigrationMeta,
    docLibraryTreeDiffReport: snapshot.docLibraryTreeDiffReport,
    docLibraryRelationSystemState: snapshot.docLibraryRelationSystemState,
    brainNeurons: snapshot.brainNeurons,
    chatSessions: snapshot.chatSessions,
    chatSessionParticipants: snapshot.chatSessionParticipants,
    chatMessages: snapshot.chatMessages,
    chatAffectGateAudits: snapshot.chatAffectGateAudits,
    chatAffectLedgerEntries: snapshot.chatAffectLedgerEntries,
    chatAffectResidueCheckpoints: snapshot.chatAffectResidueCheckpoints,
    chatSessionTemporaryCharacters: snapshot.chatSessionTemporaryCharacters,
    chatSessionTemporaryEntities: snapshot.chatSessionTemporaryEntities,
    chatPromptLogs: snapshot.chatPromptLogs,
    chatRecallActivityLogs: snapshot.chatRecallActivityLogs
  }
}

function buildSettingsPartition(snapshot: WorkspaceSnapshotV1): WorkspaceDomainPartition {
  return {
    settings: snapshot.settings
  }
}

function buildTaskPartition(snapshot: WorkspaceSnapshotV1): WorkspaceDomainPartition {
  return {
    tasks: snapshot.tasks,
    taskLogs: snapshot.taskLogs,
    dailyReports: snapshot.dailyReports,
    userLevel: snapshot.userLevel,
    dailyActivity: snapshot.dailyActivity,
    recentMarkTypes: snapshot.recentMarkTypes
  }
}

export function createWorkspacePartitionLoader({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore,
  timerComposable,
  customTags,
  eventStack
}: PartitionLoaderDeps) {
  const snapshotAppliers = createWorkspaceSnapshotAppliers({
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore
  })

  async function applyResourcePartition(snapshot: WorkspaceSnapshotV1) {
    await snapshotAppliers.applyResourcePartition(buildResourcePartition(snapshot))
  }

  async function applyCharacterPartition(snapshot: WorkspaceSnapshotV1) {
    await snapshotAppliers.applyCharacterPartition(buildCharacterPartition(snapshot))
  }

  async function applyChatPartition(snapshot: WorkspaceSnapshotV1) {
    await snapshotAppliers.applyChatPartition(buildChatPartition(snapshot))
  }

  async function applySettingsPartition(snapshot: WorkspaceSnapshotV1) {
    await snapshotAppliers.applySettingsPartition(buildSettingsPartition(snapshot))
  }

  async function applyTaskPartition(snapshot: WorkspaceSnapshotV1) {
    await snapshotAppliers.applyTaskPartition(buildTaskPartition(snapshot))
  }

  async function applyStorePartitions(snapshot: WorkspaceSnapshotV1) {
    await applyResourcePartition(snapshot)
    await applyCharacterPartition(snapshot)
    await applyChatPartition(snapshot)
    await applySettingsPartition(snapshot)
    await applyTaskPartition(snapshot)
  }

  async function applyTimerPartition(snapshot: WorkspaceSnapshotV1) {
    if (Array.isArray(snapshot.timers) && timerComposable?.replaceTimersFromLocalArchive) {
      await timerComposable.replaceTimersFromLocalArchive(snapshot.timers)
    }
  }

  function applyCustomTagPartition(snapshot: WorkspaceSnapshotV1) {
    if (Array.isArray(snapshot.customTags) && customTags) {
      customTags.value = snapshot.customTags
    }
  }

  function applyEventStackPartition(snapshot: WorkspaceSnapshotV1) {
    if (Array.isArray(snapshot.eventStack) && eventStack) {
      eventStack.value = snapshot.eventStack
    }
  }

  async function applyRuntimePartitions(snapshot: WorkspaceSnapshotV1) {
    await applyTimerPartition(snapshot)
    applyCustomTagPartition(snapshot)
    applyEventStackPartition(snapshot)
  }

  async function applyWorkspacePartitions(snapshot: WorkspaceSnapshotV1) {
    await applyStorePartitions(snapshot)
    await applyRuntimePartitions(snapshot)
  }

  return {
    applyResourcePartition,
    applyCharacterPartition,
    applyChatPartition,
    applySettingsPartition,
    applyTaskPartition,
    applyStorePartitions,
    applyTimerPartition,
    applyCustomTagPartition,
    applyEventStackPartition,
    applyRuntimePartitions,
    applyWorkspacePartitions
  }
}
