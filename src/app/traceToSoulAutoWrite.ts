import type {
  AgentModelConfig,
  BrainDocumentRecord,
  Character,
  CharacterBrainCognitionNode,
  CharacterBrainWriteBackAction,
  CharacterBrainSourceLink,
  CharacterBrainTraceNode
} from '../types'
import {
  buildCharacterBrainTrajectoryMetaChange,
  readCharacterBrainCognitionNodes,
  readCharacterBrainDocument,
  readCharacterBrainDocuments,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from './characterBrain'
import { applyCharacterBrainWriteBackDraft } from './characterBrainTreeModel'
import { runBrainAgentWriteBackDraftProtocol } from './characterBrainWriteBackDraft'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'

type CallAI = (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: Record<string, unknown>) => Promise<string | null>

export type TraceToSoulAutoWriteDeps = {
  callAI: CallAI
  documents?: BrainDocumentRecord[]
  agentConfig?: Partial<Pick<AgentModelConfig, 'presetName' | 'recallModel' | 'recallMaxTokens' | 'disableRecallThinking' | 'writeBackMaxReviewRounds' | 'writeBackAuditLogLevel' | 'enabled'>> | null
  now?: string
}

export type TraceToSoulAutoWriteResult = {
  triggered: boolean
  thresholdReached: boolean
  processedTraceNodeIds: string[]
  pendingTraceNodeIds: string[]
  changes: Record<string, unknown>
  draftStatus?: string
  message?: string
}

type SoulCandidate = {
  action?: 'create' | 'update' | 'merge' | 'skip'
  targetUnitId?: string
  targetParentId?: string
  title?: string
  summary?: string
  content?: string
  tags?: string[]
  relationHints?: string[]
  reason?: string
}

const TRACE_TO_SOUL_THRESHOLD = 30

export async function registerTraceNodesForSoulAutoWrite(
  character: Character,
  traceNodeIds: string[],
  deps: TraceToSoulAutoWriteDeps
): Promise<TraceToSoulAutoWriteResult> {
  const now = deps.now || new Date().toISOString()
  const traceNodes = readCharacterBrainTraceNodes(character)
  const writeableIds = new Set(traceNodes
    .filter((node) => node.systemRole === 'eventLeaf' || node.systemRole === 'arrangementLeaf')
    .map((node) => node.id))
  const meta = readCharacterBrainTrajectoryMeta(character)
  const pendingTraceNodeIds = Array.from(new Set([
    ...normalizeStringList(meta.pendingSoulTraceNodeIds),
    ...normalizeStringList(traceNodeIds).filter((id) => writeableIds.has(id))
  ]))

  if (pendingTraceNodeIds.length < TRACE_TO_SOUL_THRESHOLD) {
    return {
      triggered: false,
      thresholdReached: false,
      processedTraceNodeIds: [],
      pendingTraceNodeIds,
      changes: buildCharacterBrainTrajectoryMetaChange({
        ...meta,
        pendingSoulTraceNodeIds: pendingTraceNodeIds
      }),
      message: '待整理轨迹数量未达到阈值。'
    }
  }

  const processedTraceNodeIds = pendingTraceNodeIds.slice(0, TRACE_TO_SOUL_THRESHOLD)
  const remainingTraceNodeIds = pendingTraceNodeIds.slice(TRACE_TO_SOUL_THRESHOLD)
  const result = await runTraceToSoulAutoWrite(character, processedTraceNodeIds, deps)
  if (!result.triggered || !Object.keys(result.changes).length) {
    return {
      ...result,
      thresholdReached: true,
      processedTraceNodeIds: [],
      pendingTraceNodeIds,
      changes: buildCharacterBrainTrajectoryMetaChange({
        ...meta,
        pendingSoulTraceNodeIds: pendingTraceNodeIds
      })
    }
  }

  const nextCharacter = { ...character, ...result.changes } as Character
  const nextMeta = readCharacterBrainTrajectoryMeta(nextCharacter)
  return {
    ...result,
    thresholdReached: true,
    processedTraceNodeIds,
    pendingTraceNodeIds: remainingTraceNodeIds,
    changes: {
      ...result.changes,
      ...buildCharacterBrainTrajectoryMetaChange({
        ...nextMeta,
        pendingSoulTraceNodeIds: remainingTraceNodeIds,
        lastSoulWriteBackAt: now
      })
    }
  }
}

async function runTraceToSoulAutoWrite(
  character: Character,
  traceNodeIds: string[],
  deps: TraceToSoulAutoWriteDeps
): Promise<TraceToSoulAutoWriteResult> {
  const traceNodes = readCharacterBrainTraceNodes(character)
  const sourceNodes = traceNodeIds
    .map((id) => traceNodes.find((node) => node.id === id))
    .filter((node): node is CharacterBrainTraceNode => Boolean(node))
  if (!sourceNodes.length) {
    return {
      triggered: false,
      thresholdReached: true,
      processedTraceNodeIds: [],
      pendingTraceNodeIds: traceNodeIds,
      changes: {},
      message: '没有可整理的轨迹事件或安排。'
    }
  }

  const candidate = normalizeSoulCandidate(await buildSoulCandidate(character, sourceNodes, deps))
  if (!candidate || candidate.action === 'skip') {
    return {
      triggered: false,
      thresholdReached: true,
      processedTraceNodeIds: [],
      pendingTraceNodeIds: traceNodeIds,
      changes: {},
      message: '模型判断本批轨迹不需要写入灵魂。'
    }
  }

  const cognitionNodes = readCharacterBrainCognitionNodes(character)
  const input = buildWriteBackInput(candidate, cognitionNodes, sourceNodes)
  if (!input) {
    return {
      triggered: false,
      thresholdReached: true,
      processedTraceNodeIds: [],
      pendingTraceNodeIds: traceNodeIds,
      changes: {},
      message: '模型输出缺少可校验的灵魂写入目标。'
    }
  }

  const recentMessages = sourceNodes.map((node) => ({
    id: node.id,
    role: 'trace',
    name: node.title || node.displayTitle || node.id,
    content: [node.summary, node.content].filter(Boolean).join('\n')
  }))
  const draft = await runBrainAgentWriteBackDraftProtocol(
    character,
    deps.documents || [],
    recentMessages,
    async (messages) => deps.callAI(messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, buildAgentCallOptions(deps)),
    input,
    {
      now: deps.now,
      agentConfig: deps.agentConfig || null
    }
  )
  if (draft.reviewStatus !== 'approved') {
    return {
      triggered: true,
      thresholdReached: true,
      processedTraceNodeIds: [],
      pendingTraceNodeIds: traceNodeIds,
      changes: {},
      draftStatus: draft.reviewStatus,
      message: draft.failureReport?.reason || '轨迹到灵魂写入草案审查未通过。'
    }
  }

  const changes = applyCharacterBrainWriteBackDraft(character, draft, { now: draft.updatedAt })
  return {
    triggered: true,
    thresholdReached: true,
    processedTraceNodeIds: traceNodeIds,
    pendingTraceNodeIds: [],
    changes,
    draftStatus: draft.reviewStatus,
    message: '已生成灵魂待确认版本。'
  }
}

async function buildSoulCandidate(
  character: Character,
  sourceNodes: CharacterBrainTraceNode[],
  deps: TraceToSoulAutoWriteDeps
) {
  const result = await deps.callAI([
    { role: 'system', content: buildSoulCandidateSystemPrompt() },
    { role: 'user', content: buildSoulCandidateUserPrompt(character, sourceNodes) }
  ], buildAgentCallOptions(deps))
  return parseJsonObject(result || '')
}

function buildSoulCandidateSystemPrompt() {
  return [
    '你是琅嬛的轨迹到灵魂整理 Agent。',
    '任务：根据一批已写入轨迹的事件与安排，判断是否应该生成一个灵魂待确认写入草案。',
    '硬规则：',
    '1. 灵魂不是流水账；只有稳定认知、性格倾向、长期关系、价值判断、习惯或持续偏好改变时才写入。',
    '2. 能更新已有灵魂单位时优先 update；只有没有合适承接单位时才 create。',
    '3. 如果只是普通经历，输出 action=skip。',
    '4. 只输出 JSON，不输出解释。',
    'JSON 字段：action(create/update/merge/skip), targetUnitId, targetParentId, title, summary, content, tags, relationHints, reason。'
  ].join('\n')
}

function buildSoulCandidateUserPrompt(character: Character, sourceNodes: CharacterBrainTraceNode[]) {
  const cognitionNodes = readCharacterBrainCognitionNodes(character)
  const soulList = cognitionNodes.map((node) => [
    `ID：${node.id}`,
    `标题：${node.title}`,
    `摘要：${node.summary || '无'}`,
    `正文：${String(node.content || readCharacterBrainDocument(character, node.id) || '').slice(0, 500)}`
  ].join('\n')).join('\n\n') || '无'
  const traceList = sourceNodes.map((node, index) => [
    `#${index + 1}`,
    `ID：${node.id}`,
    `类型：${node.systemRole === 'arrangementLeaf' ? '安排' : '事件'}`,
    `日期：${node.pointDate || node.startDate || ''}`,
    `标题：${node.title || node.displayTitle || ''}`,
    `摘要：${node.summary || node.note || ''}`,
    `正文：${node.content || ''}`
  ].join('\n')).join('\n\n')
  return [
    `角色：${character.name || character.id}`,
    '',
    '已有灵魂单位：',
    soulList,
    '',
    '本批新增轨迹事件与安排：',
    traceList,
    '',
    '输出示例：',
    '{"action":"update","targetUnitId":"brain:cognition:node:xxx","title":"长期偏好","summary":"摘要","content":"正文","tags":["偏好"],"relationHints":[],"reason":"已有单位可承接"}'
  ].join('\n')
}

function normalizeSoulCandidate(value: unknown): SoulCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const action = String(record.action || '').trim()
  if (!['create', 'update', 'merge', 'skip'].includes(action)) return null
  return {
    action: action as SoulCandidate['action'],
    targetUnitId: String(record.targetUnitId ?? record.target_unit_id ?? '').trim() || undefined,
    targetParentId: String(record.targetParentId ?? record.target_parent_id ?? '').trim() || undefined,
    title: String(record.title || '').trim(),
    summary: String(record.summary || '').trim(),
    content: String(record.content || '').trim(),
    tags: normalizeStringList(record.tags),
    relationHints: normalizeStringList(record.relationHints ?? record.relation_hints),
    reason: String(record.reason || '').trim()
  }
}

function buildWriteBackInput(
  candidate: SoulCandidate,
  cognitionNodes: CharacterBrainCognitionNode[],
  sourceNodes: CharacterBrainTraceNode[]
) {
  const action: CharacterBrainWriteBackAction = candidate.action === 'merge' ? 'merge' : candidate.action === 'update' ? 'update' : 'create'
  const targetUnitId = String(candidate.targetUnitId || '').trim()
  const targetParentId = String(candidate.targetParentId || '').trim() || 'brain:cognition'
  if ((action === 'update' || action === 'merge') && !cognitionNodes.some((node) => node.id === targetUnitId)) return null
  if (action === 'create' && targetParentId !== 'brain:cognition' && !cognitionNodes.some((node) => node.id === targetParentId)) return null
  return {
    target: 'soul' as const,
    action,
    targetUnitId: action === 'create' ? undefined : targetUnitId,
    targetParentId: action === 'create' ? targetParentId : undefined,
    content: {
      title: candidate.title || '待确认灵魂变化',
      summary: candidate.summary || candidate.reason || '由轨迹事件与安排整理出的待确认灵魂变化。',
      content: candidate.content || candidate.summary || candidate.reason,
      tags: candidate.tags || [],
      relationHints: candidate.relationHints || []
    },
    reason: candidate.reason || '轨迹事件与安排累计达到阈值后触发整理。',
    sourceLinks: sourceNodes.map((node): CharacterBrainSourceLink => ({
      sourceType: 'trace',
      sourceId: node.id,
      title: node.title || node.displayTitle || node.id,
      excerpt: String(node.summary || node.content || '').slice(0, 300)
    }))
  }
}

function buildAgentCallOptions(deps: TraceToSoulAutoWriteDeps) {
  const agent = deps.agentConfig
  const options = buildTaskModelAiOptions(agent, 'soulAutoWrite', { maxTokens: 2048 })
  return {
    ...options,
    maxTokens: Math.max(1024, Number(options.maxTokens || 2048)),
    feature: 'write_back',
    logLabel: 'auto-write-trace-to-soul',
    usageLabel: '自动写入灵魂',
    placeLabel: '轨迹到灵魂',
    placeType: 'other'
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，、]+/u).map((item) => item.trim()).filter(Boolean)
  return []
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const source = String(text || '').trim()
  if (!source) return null
  try {
    const direct = JSON.parse(source)
    return direct && typeof direct === 'object' && !Array.isArray(direct) ? direct as Record<string, unknown> : null
  } catch {
    const match = source.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
}
