import type { Ref } from 'vue'
import type { useResourceStore } from '../stores/resourceStore'
import type { useCharacterStore } from '../stores/characterStore'
import type { useChatStore } from '../stores/chatStore'
import type { useSettingStore } from '../stores/settingStore'
import type { useTaskStore } from '../stores/taskStore'
import { buildWorkspaceSnapshotFromStores, normalizeWorkspaceSnapshot } from '../repositories/workspaceSnapshotRepository'
import type { WorkspaceSnapshotV1 } from '../types/workspace'
import type { useWorkspaceRuntimeStore, WorkspaceHydrationSource } from './workspaceRuntimeStore'
import { createWorkspacePartitionLoader } from './workspacePartitionLoader'

type ResourceStore = ReturnType<typeof useResourceStore>
type CharacterStore = ReturnType<typeof useCharacterStore>
type ChatStore = ReturnType<typeof useChatStore>
type SettingStore = ReturnType<typeof useSettingStore>
type TaskStore = ReturnType<typeof useTaskStore>
type WorkspaceRuntimeStore = ReturnType<typeof useWorkspaceRuntimeStore>

type WorkspaceHydratorDeps = {
  resourceStore: ResourceStore
  charStore: CharacterStore
  chatStore: ChatStore
  settingStore: SettingStore
  taskStore: TaskStore
  runtimeStore: WorkspaceRuntimeStore
  timerComposable?: {
    getSerializableTimers?: () => unknown[]
    replaceTimersFromLocalArchive?: (timers: unknown[]) => Promise<void>
  }
  customTags?: Ref<unknown[]>
  eventStack?: Ref<unknown[]>
}

type ApplySnapshotOptions = {
  source: WorkspaceHydrationSource
  message?: string
}

const BOOT_SNAPSHOT_KEY = 'langhuan_app_boot_snapshot_v1'
const BOOT_SNAPSHOT_DB_NAME = 'langhuan_app_cache'
const BOOT_SNAPSHOT_STORE_NAME = 'boot_snapshots'
const LOCAL_WORKSPACE_STORAGE_KEY = `${BOOT_SNAPSHOT_KEY}:local`

function buildBootProjectionSnapshot(snapshot: WorkspaceSnapshotV1): WorkspaceSnapshotV1 {
  return {
    version: snapshot.version,
    snapshotKind: 'bootstrap',
    workspaceTarget: snapshot.workspaceTarget,
    workspaceSessionId: snapshot.workspaceSessionId,
    characters: snapshot.characters,
    characterGroups: snapshot.characterGroups,
    groups: snapshot.groups,
    crowds: snapshot.crowds,
    aliases: snapshot.aliases,
    userProfile: snapshot.userProfile,
    // 启动缓存只保留首屏立刻需要的轻量数据，避免刷新时先读入大体量正文与消息。
    documents: [],
    brainNeurons: [],
    summaryLibrary: [],
    smallSummaries: [],
    bigSummaries: [],
    chatSessions: snapshot.chatSessions,
    chatSessionParticipants: snapshot.chatSessionParticipants,
    chatMessages: [],
    settings: snapshot.settings
  }
}

function buildFallbackBootProjectionSnapshot(snapshot: WorkspaceSnapshotV1): WorkspaceSnapshotV1 {
  return buildBootProjectionSnapshot(snapshot)
}

function getBootSnapshotStorageKey() {
  return LOCAL_WORKSPACE_STORAGE_KEY
}

function openBootSnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const request = window.indexedDB.open(BOOT_SNAPSHOT_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(BOOT_SNAPSHOT_STORE_NAME)) {
        database.createObjectStore(BOOT_SNAPSHOT_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开 IndexedDB 失败'))
  })
}

function runBootSnapshotStore<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    openBootSnapshotDatabase()
      .then((database) => {
        const transaction = database.transaction(BOOT_SNAPSHOT_STORE_NAME, mode)
        const store = transaction.objectStore(BOOT_SNAPSHOT_STORE_NAME)
        let settled = false
        const finishResolve = (value: T) => {
          if (settled) return
          settled = true
          resolve(value)
        }
        const finishReject = (reason?: unknown) => {
          if (settled) return
          settled = true
          reject(reason)
        }
        transaction.oncomplete = () => {
          database.close()
          if (!settled && mode === 'readwrite') {
            finishResolve(undefined as T)
          }
        }
        transaction.onerror = () => {
          database.close()
          finishReject(transaction.error || new Error('IndexedDB 事务失败'))
        }
        transaction.onabort = () => {
          database.close()
          finishReject(transaction.error || new Error('IndexedDB 事务已中止'))
        }
        executor(store, finishResolve, finishReject)
      })
      .catch(reject)
  })
}

async function writeBootSnapshotToIndexedDb(snapshot: WorkspaceSnapshotV1) {
  const serializedSnapshot = JSON.stringify(snapshot)
  await runBootSnapshotStore<void>('readwrite', (store, _resolve, reject) => {
    const request = store.put(serializedSnapshot, getBootSnapshotStorageKey())
    request.onerror = () => reject(request.error || new Error('写入启动快照失败'))
  })
}

async function readBootSnapshotFromIndexedDb(): Promise<WorkspaceSnapshotV1 | null> {
  return await runBootSnapshotStore<WorkspaceSnapshotV1 | null>('readonly', (store, resolve, reject) => {
    const request = store.get(getBootSnapshotStorageKey())
    request.onsuccess = () => {
      if (typeof request.result !== 'string' || !request.result) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(request.result) as WorkspaceSnapshotV1)
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error || new Error('读取启动快照失败'))
  })
}

async function deleteBootSnapshotFromIndexedDb() {
  await runBootSnapshotStore<void>('readwrite', (store, _resolve, reject) => {
    const key = getBootSnapshotStorageKey()
    const request = store.delete(key)
    store.delete(BOOT_SNAPSHOT_KEY)
    request.onerror = () => reject(request.error || new Error('删除启动快照失败'))
  })
}

export function createWorkspaceHydrator({
  resourceStore,
  charStore,
  chatStore,
  settingStore,
  taskStore,
  runtimeStore,
  timerComposable,
  customTags,
  eventStack
}: WorkspaceHydratorDeps) {
  const { applyWorkspacePartitions } = createWorkspacePartitionLoader({
    resourceStore,
    charStore,
    chatStore,
    settingStore,
    taskStore,
    timerComposable,
    customTags,
    eventStack
  })

  async function applySnapshot(snapshot: unknown, options: ApplySnapshotOptions): Promise<WorkspaceSnapshotV1> {
    const safeSnapshot = normalizeWorkspaceSnapshot(snapshot, options.source === 'bootstrap' ? 'bootstrap' : 'workspace')
    runtimeStore.beginHydration(options.source, options.message || '')
    try {
      await applyWorkspacePartitions(safeSnapshot)
      settingStore.applyTheme()
      runtimeStore.finishHydration(options.source, options.message || '')
      return safeSnapshot
    } catch (error: unknown) {
      runtimeStore.failHydration(
        options.source,
        error instanceof Error ? error.message : '工作区装载失败'
      )
      throw error
    }
  }

  function buildBootSnapshot(): WorkspaceSnapshotV1 {
    const fullSnapshot = buildWorkspaceSnapshotFromStores({
      resourceStore,
      charStore,
      chatStore,
      settingStore,
      taskStore,
      timerComposable,
      customTags,
      eventStack
    }, undefined, 'bootstrap')
    // 启动缓存只保留首屏预热所需投影，避免把完整业务真值放进浏览器缓存。
    return buildBootProjectionSnapshot(fullSnapshot)
  }

  async function persistBootSnapshot() {
    const snapshot = buildBootSnapshot()
    try {
      await writeBootSnapshotToIndexedDb(snapshot)
      try {
        sessionStorage.removeItem(BOOT_SNAPSHOT_KEY)
      } catch {}
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          await writeBootSnapshotToIndexedDb(buildFallbackBootProjectionSnapshot(snapshot))
          try {
            sessionStorage.removeItem(BOOT_SNAPSHOT_KEY)
          } catch {}
          console.warn('启动快照过大，已自动改存轻量快照到 IndexedDB。')
          return
        } catch (fallbackError) {
          console.warn('写入轻量启动快照失败:', fallbackError)
          return
        }
      }
      console.warn('写入启动快照失败:', error)
    }
  }

  async function clearBootSnapshot() {
    try {
      await deleteBootSnapshotFromIndexedDb()
    } catch (error) {
      console.warn('清理启动快照失败:', error)
    }
    try {
      sessionStorage.removeItem(BOOT_SNAPSHOT_KEY)
    } catch (error) {
      console.warn('清理旧版启动快照失败:', error)
    }
  }

  async function restoreBootSnapshot() {
    try {
      let snapshot = await readBootSnapshotFromIndexedDb()
      if (!snapshot) {
        const legacyRaw = sessionStorage.getItem(BOOT_SNAPSHOT_KEY)
        if (!legacyRaw) return false
        snapshot = JSON.parse(legacyRaw)
      }
      const projectedSnapshot = buildBootProjectionSnapshot(
        normalizeWorkspaceSnapshot(snapshot, 'bootstrap')
      )
      await applySnapshot(projectedSnapshot, {
        source: 'session-restore',
        message: '正在恢复会话缓存...'
      })
      void writeBootSnapshotToIndexedDb(projectedSnapshot).catch(() => {})
      return true
    } catch (error) {
      console.warn('恢复启动快照失败:', error)
      await clearBootSnapshot()
      return false
    }
  }

  return {
    applySnapshot,
    applyWorkspacePartitions,
    buildBootSnapshot,
    persistBootSnapshot,
    clearBootSnapshot,
    restoreBootSnapshot
  }
}
