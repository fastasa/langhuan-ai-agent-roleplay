import type {
  DirectorOrchestrationProjection,
  OrchestrationProjectionItem,
  OrchestrationWorkspaceProjection
} from '../../shared/orchestrationWorkspace'
import {
  REPLY_SITUATION_DEPENDENCY_KEYS,
  type ReplySituationDependencySnapshot,
  type ReplySituationDependencyValue
} from './replyOrchestrationRoute'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, stableValue(record[key])]))
}

/** 浏览器侧稳定指纹；只用于变更检测，不是安全哈希或供应商 cache key。 */
export function digestReplySituationDependency(value: unknown): string {
  const source = JSON.stringify(stableValue(value))
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

function itemRevision(item: OrchestrationProjectionItem<unknown> | null | undefined) {
  if (!item) return null
  return {
    sourceRef: item.sourceRef,
    version: item.version,
    updatedAt: item.updatedAt,
    valueHash: digestReplySituationDependency(item.value)
  }
}

function listRevision(items: Array<OrchestrationProjectionItem<unknown>>) {
  return items
    .map(itemRevision)
    .sort((left, right) => {
      const a = String(left?.sourceRef || '')
      const b = String(right?.sourceRef || '')
      return a < b ? -1 : a > b ? 1 : 0
    })
}

/**
 * 把会改变“上一轮情境是否仍成立”的正式真值压成版本向量。聊天消息本身不放进向量：
 * 它是每轮都会追加的输入，由轻判的 recentTail 负责；否则自然续话会被消息自增误判为情境变化。
 */
export function buildReplySituationDependencySnapshot(input: {
  workspace: OrchestrationWorkspaceProjection
  director: DirectorOrchestrationProjection
  personalityRevision?: unknown
  promptPresetRevision?: unknown
}): ReplySituationDependencySnapshot {
  const values: Record<string, ReplySituationDependencyValue> = {
    [REPLY_SITUATION_DEPENDENCY_KEYS.curtain]: digestReplySituationDependency(itemRevision(input.workspace.scene.curtain)),
    [REPLY_SITUATION_DEPENDENCY_KEYS.presence]: digestReplySituationDependency(
      input.workspace.castRoster.map((item) => ({
        participantId: item.participantId,
        characterId: item.characterId,
        stateMode: item.characterStateMode,
        branchId: item.characterBranchId,
        presence: item.presence,
        pendingTransition: itemRevision(item.pendingTransition)
      })).sort((a, b) => a.participantId.localeCompare(b.participantId))
    ),
    [REPLY_SITUATION_DEPENDENCY_KEYS.statusPanels]: digestReplySituationDependency(listRevision(input.workspace.statusPanels)),
    [REPLY_SITUATION_DEPENDENCY_KEYS.narrativeSeeds]: digestReplySituationDependency({
      config: itemRevision(input.workspace.world.narrativeConfig),
      seeds: listRevision(input.workspace.world.narrativeSeeds),
      entities: listRevision(input.workspace.world.worldEntities),
      mapRefs: listRevision(input.workspace.scene.mapRefs)
    }),
    [REPLY_SITUATION_DEPENDENCY_KEYS.personality]: digestReplySituationDependency(input.personalityRevision ?? null),
    [REPLY_SITUATION_DEPENDENCY_KEYS.promptPreset]: digestReplySituationDependency(input.promptPresetRevision ?? null),
    directorOverride: digestReplySituationDependency(itemRevision(input.director.sessionOverride))
  }
  return {
    fingerprint: digestReplySituationDependency(values),
    values
  }
}
