import { computed, ref, type Ref } from 'vue'
import {
  LOCAL_ARCHIVE_MODULES,
  LOCAL_ARCHIVE_MODULE_DEFINITIONS,
  normalizeModuleNames,
  type LocalArchiveModuleName
} from './localArchiveShared'
import { createLocalArchiveSnapshotPayloads } from './localArchiveSnapshotPayloads'
import { createLocalArchiveSnapshotPersistence } from './localArchiveSnapshotPersistence'
import { createLocalArchiveImportExport } from './localArchiveImportExport'
import { createLocalArchiveDataReset } from './localArchiveDataReset'

type LocalDataOpsDeps = {
  resourceStore: Record<string, unknown>
  charStore: Record<string, unknown>
  chatStore: Record<string, unknown>
  settingStore: Record<string, unknown>
  taskStore: Record<string, unknown>
  timerComposable: Record<string, unknown>
  customTags: Ref<unknown[]>
  eventStack: Ref<unknown[]>
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  workspaceKernel: {
    applySnapshot?: (snapshot: unknown, options: { source: 'import' | 'archive-restore'; message: string }) => Promise<unknown>
  }
}

export function useLocalArchiveDataOps(deps: LocalDataOpsDeps) {
  const selectedSyncModules = ref<LocalArchiveModuleName[]>([...LOCAL_ARCHIVE_MODULES])
  const localArchiveModuleDefinitions = computed(() => LOCAL_ARCHIVE_MODULE_DEFINITIONS)
  const localArchiveSaves = ref<never[]>([])
  const selectedLocalArchiveSlot = ref('')
  const localArchiveActionState = ref(null)

  function ensureSelectedModules(moduleNames?: LocalArchiveModuleName[] | string[]) {
    const normalized = normalizeModuleNames(moduleNames)
    return normalized.length ? normalized : [...LOCAL_ARCHIVE_MODULES]
  }

  const snapshotPayloads = createLocalArchiveSnapshotPayloads({
    resourceStore: deps.resourceStore,
    charStore: deps.charStore,
    chatStore: deps.chatStore,
    settingStore: deps.settingStore,
    taskStore: deps.taskStore,
    timerComposable: deps.timerComposable,
    customTags: deps.customTags,
    eventStack: deps.eventStack,
    ensureSelectedModules,
    selectedSyncModules
  })
  const snapshotPersistence = createLocalArchiveSnapshotPersistence({ workspaceKernel: deps.workspaceKernel })
  const localImportExport = createLocalArchiveImportExport({ snapshotPayloads, snapshotPersistence, toast: deps.toast })
  const localReset = createLocalArchiveDataReset({ toast: deps.toast })

  function setSelectedSyncModules(moduleNames: LocalArchiveModuleName[] | string[]) {
    selectedSyncModules.value = normalizeModuleNames(moduleNames)
  }

  const unavailable = async () => false
  const localArchiveCommands = {
    data: {
      exportAll: localImportExport.exportAllData,
      importAll: localImportExport.importAllData,
      resetAll: localReset.resetAllData
    },
    availability: { open: unavailable, initialize: unavailable },
    archive: {
      loadSaves: async () => [], selectSave: unavailable, upload: unavailable, download: unavailable,
      createSave: unavailable, updateSaveNote: unavailable, renameSave: unavailable, deleteSave: unavailable
    }
  }

  return {
    localArchiveModuleDefinitions,
    localArchiveSaves,
    selectedLocalArchiveSlot,
    selectedSyncModules,
    localArchiveActionState,
    localArchiveCommands,
    setSelectedSyncModules,
    loadLocalArchiveSaves: localArchiveCommands.archive.loadSaves,
    selectLocalArchiveSave: localArchiveCommands.archive.selectSave,
    openLocalArchive: localArchiveCommands.availability.open,
    initializeLocalArchive: localArchiveCommands.availability.initialize,
    runLocalArchiveUploadCommand: unavailable,
    localArchiveUpload: unavailable,
    runLocalArchiveDownloadCommand: unavailable,
    localArchiveDownload: unavailable,
    runCreateLocalArchiveSaveCommand: unavailable,
    createLocalArchiveSave: unavailable,
    runUpdateLocalArchiveSaveNoteCommand: unavailable,
    updateLocalArchiveSaveNote: unavailable,
    runRenameLocalArchiveSaveCommand: unavailable,
    renameLocalArchiveSave: unavailable,
    runDeleteLocalArchiveSaveCommand: unavailable,
    deleteLocalArchiveSave: unavailable,
    exportAllData: localImportExport.exportAllData,
    runImportAllDataCommand: localImportExport.importAllData,
    importAllData: localImportExport.importAllData,
    runResetAllDataCommand: localReset.resetAllData,
    resetAllData: localReset.resetAllData
  }
}
