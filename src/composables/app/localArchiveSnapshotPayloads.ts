import {
  buildWorkspaceSnapshotFromStores,
  normalizeWorkspaceSnapshot
} from '../../repositories/workspaceSnapshotRepository'
import { fetchLocalArchiveExportSnapshotFromServer } from '../../repositories/workspaceSnapshotServerRepository'
import type { WorkspaceSnapshotV1 } from '../../types/workspace'
import { sanitizeCharacterLocalArchivePayload, type LocalArchiveModuleName } from './localArchiveShared'

type ImportModuleName = LocalArchiveModuleName

type LocalArchiveSnapshotPayloadDeps = {
  resourceStore: any
  charStore: any
  chatStore: any
  settingStore: any
  taskStore: any
  timerComposable?: any
  customTags?: any
  eventStack?: any
  ensureSelectedModules: (moduleNames?: LocalArchiveModuleName[] | string[]) => LocalArchiveModuleName[] | null
  selectedSyncModules: { value: LocalArchiveModuleName[] }
}

export function createLocalArchiveSnapshotPayloads({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore,
  timerComposable,
  customTags,
  eventStack,
  ensureSelectedModules,
  selectedSyncModules
}: LocalArchiveSnapshotPayloadDeps) {
  async function fetchServerLocalArchiveExportSnapshot() {
    return await fetchLocalArchiveExportSnapshotFromServer()
  }

  function buildFullExportData(baseSnapshot?: unknown): WorkspaceSnapshotV1 {
    return buildWorkspaceSnapshotFromStores({
      resourceStore,
      charStore,
      chatStore,
      settingStore,
      taskStore,
      timerComposable,
      customTags,
      eventStack
    }, baseSnapshot, 'archive')
  }

  function buildModulePayload(moduleName: LocalArchiveModuleName, fullData: any) {
    if (moduleName === 'resources') {
      return {
        resources: fullData.resources,
        tickets: fullData.tickets,
        ticketCategories: fullData.ticketCategories,
        history: fullData.history,
        timers: fullData.timers
      }
    }

    if (moduleName === 'characters') {
      return sanitizeCharacterLocalArchivePayload({
        characters: fullData.characters,
        characterGroups: fullData.characterGroups,
        groups: fullData.groups,
        crowds: fullData.crowds,
        aliases: fullData.aliases,
        userProfile: fullData.userProfile
      })
    }

    if (moduleName === 'chats') {
      return {
        summaryLibrary: fullData.summaryLibrary,
        smallSummaries: fullData.smallSummaries,
        bigSummaries: fullData.bigSummaries,
        documents: fullData.documents,
        documentTreeOrders: fullData.documentTreeOrders,
        docLibrarySchemaVersion: fullData.docLibrarySchemaVersion,
        docLibraryTreeNodes: fullData.docLibraryTreeNodes,
        docLibraryTreeOrders: fullData.docLibraryTreeOrders,
        docLibraryTreeMigrationMeta: fullData.docLibraryTreeMigrationMeta,
        docLibraryTreeDiffReport: fullData.docLibraryTreeDiffReport,
        docLibraryRelationSystemState: fullData.docLibraryRelationSystemState,
        brainNeurons: fullData.brainNeurons,
        chatSessions: fullData.chatSessions,
        chatSessionParticipants: fullData.chatSessionParticipants,
        characterSnapshots: fullData.characterSnapshots,
        chatSessionCharacterBranches: fullData.chatSessionCharacterBranches,
        worlds: fullData.worlds,
        chatMapSheets: fullData.chatMapSheets,
        chatMapFeatures: fullData.chatMapFeatures,
        worldNarrativeConfigs: fullData.worldNarrativeConfigs,
        worldNarrativeSeeds: fullData.worldNarrativeSeeds,
        worldNarrativeSeedParticipants: fullData.worldNarrativeSeedParticipants,
        worldNarrativeSeedLinks: fullData.worldNarrativeSeedLinks,
        worldNarrativeSeedEvents: fullData.worldNarrativeSeedEvents,
        chatMessages: fullData.chatMessages,
        chatMessageNotes: fullData.chatMessageNotes,
        chatPromptLogs: fullData.chatPromptLogs
      }
    }

    if (moduleName === 'settings') {
      return fullData.settings || settingStore.settingsSnapshot || {}
    }

    return {
      tasks: fullData.tasks,
      taskLogs: fullData.taskLogs,
      dailyReports: fullData.dailyReports,
      userLevel: fullData.userLevel,
      dailyActivity: fullData.dailyActivity,
      recentMarkTypes: fullData.recentMarkTypes,
      customTags: fullData.customTags,
      eventStack: fullData.eventStack
    }
  }

  function pickImportPayload(input: unknown, moduleNames?: ImportModuleName[]) {
    const pickedModules = ensureSelectedModules(moduleNames ?? selectedSyncModules.value)
    if (!pickedModules) return null

    const snapshot = normalizeWorkspaceSnapshot(input, 'workspace')
    const pickedPayload = pickedModules.reduce((acc, moduleName) => {
      Object.assign(acc, buildModulePayload(moduleName, snapshot))
      return acc
    }, {} as Record<string, any>)

    return {
      payload: pickedPayload,
      modules: pickedModules
    }
  }

  return {
    fetchServerLocalArchiveExportSnapshot,
    buildFullExportData,
    buildModulePayload,
    pickImportPayload
  }
}
