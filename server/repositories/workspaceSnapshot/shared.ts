import { AVATAR_DIR } from '../../application/workspace/workspaceSnapshotMigrator.js'
import { existsSync, mkdirSync } from 'fs'

export type WorkspaceSnapshotModule = 'resources' | 'characters' | 'chats' | 'settings' | 'tasks'

export const WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP: Record<WorkspaceSnapshotModule, string[]> = {
  resources: ['resources', 'tickets', 'ticketCategories', 'history', 'timers'],
  characters: [
    'characters',
    'characterGroups',
    'groups',
    'crowds',
    'aliases',
    'userProfile',
    'personalityTrainingDatasets',
    'personalityTrainingRuns',
    'personalityModelVersions',
    'personalityEvaluationSets'
  ],
  chats: [
    'summaryLibrary',
    'smallSummaries',
    'bigSummaries',
    'documents',
    'documentTreeOrders',
    'docLibrarySchemaVersion',
    'docLibraryTreeNodes',
    'docLibraryTreeOrders',
    'docLibraryTreeMigrationMeta',
    'docLibraryTreeDiffReport',
    'docLibraryRelationSystemState',
    'brainNeurons',
    'chatSessions',
    'chatSessionParticipants',
    'chatSessionCharacterPresences',
    'chatSessionCharacterPresenceEvents',
    'chatSessionNarrativeOverrides',
    'chatSessionOrchestrationStates',
    'characterSnapshots',
    'chatSessionCharacterBranches',
    'chatMessages',
    'chatMessageProjections',
    'chatMessageProjectionVisibility',
    'chatProjectionWritebackRuns',
    'chatMessageNotes',
    'chatAffectGateAudits',
    'chatAffectLedgerEntries',
    'chatAffectResidueCheckpoints',
    'chatSessionTemporaryCharacters',
    'chatSessionTemporaryEntities',
    'chatStatusPanelTemplates',
    'chatStatusPanels',
    'chatStatusPanelEvents',
    'chatStatusAssets',
    // worlds=世界级归属的根（批3 接快照时漏进本清单，批4 补：缺了它按模块过滤导出会丢世界）；地图双表随 worlds 走（批4）
    'worlds',
    'worldEntities',
    'chatMapSheets',
    'chatMapFeatures',
    'worldNarrativeConfigs',
    'worldNarrativeSeeds',
    'worldNarrativeSeedParticipants',
    'worldNarrativeSeedLinks',
    'worldNarrativeSeedEvents',
    'chatPromptLogs',
    'chatRecallActivityLogs',
    'chatGenerationAttempts',
    'chatGenerationAttemptArtifacts'
  ],
  settings: ['settings'],
  tasks: ['tasks', 'taskLogs', 'dailyReports', 'userLevel', 'dailyActivity', 'recentMarkTypes', 'customTags', 'eventStack']
}

export function filterPayloadByModules(payload: Record<string, any>, modules?: WorkspaceSnapshotModule[]): Record<string, any> {
  if (!Array.isArray(modules) || modules.length === 0) return payload
  const filtered: Record<string, any> = {}
  for (const moduleName of modules) {
    for (const field of WORKSPACE_SNAPSHOT_MODULE_FIELD_MAP[moduleName] || []) {
      if (payload[field] !== undefined) {
        filtered[field] = payload[field]
      }
    }
  }
  return filtered
}

export function toJson(value: unknown, fallback: unknown = ''): string {
  if (value === undefined || value === null) return JSON.stringify(fallback)
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify(fallback)
  }
}

export function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

export function encodeSnapshotBlob(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64')
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return Buffer.from((value as { data: number[] }).data).toString('base64')
  }
  return typeof value === 'string' ? value : ''
}

export function decodeSnapshotBlob(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return Buffer.from((value as { data: number[] }).data)
  }
  const raw = String(value || '').trim()
  if (!raw) throw new Error('角色快照缺少压缩 payload')
  return Buffer.from(raw, 'base64')
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function getLocalDateKey(input: string | number | Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    return `${fallback.getFullYear()}-${padDatePart(fallback.getMonth() + 1)}-${padDatePart(fallback.getDate())}`
  }
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function ensureSnapshotAvatarDir(): void {
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, { recursive: true })
  }
}
