import type {
  AgentModelConfig,
  BrainDocumentRecord,
  Character,
  CharacterBrainSourceLink,
  CharacterBrainWriteBackAction,
  CharacterBrainWriteBackAuditRecord,
  CharacterBrainWriteBackDraft,
  CharacterBrainWriteBackDraftContent,
  CharacterBrainWriteBackOutcome,
  CharacterBrainWriteBackRecallSnapshot,
  CharacterBrainWriteBackTarget,
  CharacterBrainWriteBackValidationIssue
} from '../types'
import type { RecallPipelineResult } from '../types/docBrain'
import { runMultiRoundRecallPipeline } from './characterBrainRecallAI'

type MessageLike = { id?: string | number; role?: string; name?: string; content?: string; text?: string }
type CallAI = (messages: { role: string; content: string }[]) => Promise<string | null>

type WriteBackDraftInput = {
  target: CharacterBrainWriteBackTarget
  action: CharacterBrainWriteBackAction
  targetUnitId?: string
  targetParentId?: string
  content: CharacterBrainWriteBackDraftContent
  reason?: string
  sourceLinks: CharacterBrainSourceLink[]
}

type WriteBackProtocolOptions = {
  agentConfig?: Partial<Pick<AgentModelConfig, 'writeBackMaxReviewRounds' | 'writeBackAuditLogLevel' | 'enabled'>> | null
  currentDate?: Date
  now?: string
}

type ParsedReview = {
  ok: boolean
  approved: boolean
  issues: string[]
  revisedDraft?: Partial<WriteBackDraftInput>
  raw: string
}

const WRITABLE_CORE_UNIT_IDS = new Set([
  'brain:desc',
  'brain:goal_value',
  'brain:appearance',
  'brain:speaking_style',
  'brain:outfit',
  'brain:personality',
  'brain:hobbies',
  'brain:abilities',
  'brain:experience',
  'brain:worldview',
  'brain:background'
])

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => toText(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean)
  return []
}

function clampReviewRounds(value: unknown): number {
  const count = Math.trunc(Number(value))
  if (!Number.isFinite(count)) return 3
  return Math.max(1, Math.min(3, count))
}

function createDraftId(characterId: string, now: string) {
  const safeCharacterId = encodeURIComponent(characterId || 'unknown').replace(/%/g, '~')
  return `writeback:${safeCharacterId}:${now.replace(/[^\dA-Za-z]+/g, '')}`
}

function normalizeContent(content: CharacterBrainWriteBackDraftContent): CharacterBrainWriteBackDraftContent {
  return {
    title: toText(content.title, '待确认写入').trim() || '待确认写入',
    summary: toText(content.summary).trim(),
    content: toText(content.content).trim() || undefined,
    tags: normalizeStringList(content.tags),
    relationHints: normalizeStringList(content.relationHints),
    // 关系认知写入专用：保留认知对象，使 subject 能流过写回校审链到 outcome
    subjectType: content.subjectType === 'user' || content.subjectType === 'character' ? content.subjectType : undefined,
    subjectId: toText(content.subjectId).trim() || undefined
  }
}

function buildRecallSnapshot(result: RecallPipelineResult): CharacterBrainWriteBackRecallSnapshot {
  return {
    required: true,
    satisfied: result.roundsCompleted > 0 && result.confirmedIds.length > 0,
    confirmedIds: [...result.confirmedIds],
    roundsCompleted: result.roundsCompleted,
    readDecisions: Object.fromEntries(Object.entries(result.readDecisions || {}).map(([id, decision]) => [id, decision]))
  }
}

export function createWriteBackDraft(
  character: Character,
  input: WriteBackDraftInput,
  recallResult: RecallPipelineResult,
  now = new Date().toISOString()
): CharacterBrainWriteBackDraft {
  const characterId = toText(character.id).trim()
  return {
    id: createDraftId(characterId, now),
    characterId,
    target: input.target,
    action: input.action,
    targetUnitId: toText(input.targetUnitId).trim() || undefined,
    targetParentId: toText(input.targetParentId).trim() || undefined,
    content: normalizeContent(input.content),
    reason: toText(input.reason).trim(),
    sourceLinks: Array.isArray(input.sourceLinks) ? input.sourceLinks : [],
    organizingRecall: buildRecallSnapshot(recallResult),
    reviewStatus: 'pending_review',
    auditRecords: [],
    createdAt: now,
    updatedAt: now
  }
}

export function validateWriteBackDraft(draft: CharacterBrainWriteBackDraft): CharacterBrainWriteBackValidationIssue[] {
  const issues: CharacterBrainWriteBackValidationIssue[] = []
  if (!draft.sourceLinks.length) {
    issues.push({
      code: 'missing_source_links',
      field: 'sourceLinks',
      message: '写入草案缺少来源链，不能写入角色大脑。'
    })
  }
  if (draft.sourceLinks.some((link) => link.sourceType === 'document')) {
    issues.push({
      code: 'document_source_forbidden',
      field: 'sourceLinks',
      message: '自动写入来源不能直接使用文档库文档，只能来自聊天与整理召回读到的角色大脑内容。'
    })
  }
  if (!['core', 'soul', 'trace', 'arrangement'].includes(draft.target)) {
    issues.push({
      code: 'unsupported_target',
      field: 'target',
      message: '写入目标不在允许范围内。'
    })
  }
  if (draft.action === 'create' && draft.target === 'core') {
    issues.push({
      code: 'missing_target',
      field: 'targetUnitId',
      message: '核心区只能更新已有资料型单位，不能创建新核心单位。'
    })
  }
  if ((draft.action === 'update' || draft.action === 'merge') && !draft.targetUnitId) {
    issues.push({
      code: 'missing_target',
      field: 'targetUnitId',
      message: '更新或合并必须明确目标单位。'
    })
  }
  if (draft.action === 'create' && draft.target !== 'core' && !draft.targetParentId) {
    issues.push({
      code: 'missing_target',
      field: 'targetParentId',
      message: '新增待确认单位必须明确父级簇枝桠。'
    })
  }
  if (draft.target === 'core' && (!draft.targetUnitId || !WRITABLE_CORE_UNIT_IDS.has(draft.targetUnitId))) {
    issues.push({
      code: 'field_scope_forbidden',
      field: 'targetUnitId',
      message: '核心区只允许写入资料型单位，头像、预设、模型、TTS 等系统信息禁止 AI 写入。'
    })
  }
  if (!draft.content.summary.trim() && !toText(draft.content.content).trim()) {
    issues.push({
      code: 'missing_content',
      field: 'content',
      message: '写入草案缺少摘要或正文内容。'
    })
  }
  if (!draft.organizingRecall.satisfied) {
    issues.push({
      code: 'organizing_recall_required',
      field: 'organizingRecall',
      message: '写入前必须先通过整理召回读取相关角色大脑内容。'
    })
  }
  return issues
}

function buildReviewPrompt(draft: CharacterBrainWriteBackDraft, recentMessages: MessageLike[], localIssues: CharacterBrainWriteBackValidationIssue[]): string {
  const messagesText = recentMessages.slice(-12).map((message, index) => {
    const speaker = message.name || message.role || 'unknown'
    const content = toText(message.content ?? message.text).slice(0, 300)
    return `${index + 1}. [${speaker}] ${content}`
  }).join('\n') || '（无最近消息）'
  return [
    '【角色大脑写入草案审查】',
    '你是大脑 Agent，只负责审查写入草案是否可以生成待确认单位或待确认版本，不直接改正式数据。',
    '',
    '硬规则：',
    '1. 自动写入来源只能来自聊天消息与整理召回读到的角色大脑内容，不能直接读取文档库作为来源。',
    '2. 无来源链、目标位置不明、字段越权、整理召回未通过时必须拒绝。',
    '3. 通过时只表示可以生成待确认结果，不代表写入已确认。',
    '4. 只输出 JSON，不输出解释。',
    '',
    '最近消息：',
    messagesText,
    '',
    '草案：',
    JSON.stringify(draft, null, 2),
    '',
    '本地校验问题：',
    localIssues.length ? localIssues.map((issue) => `- ${issue.code}: ${issue.message}`).join('\n') : '无',
    '',
    '输出格式：',
    '{"approved":true,"issues":[],"revisedDraft":null}'
  ].join('\n')
}

function parseReview(raw: string | null): ParsedReview {
  const text = toText(raw)
  if (!text.trim()) return { ok: false, approved: false, issues: ['empty_response'], raw: text }
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, approved: false, issues: ['invalid_json'], raw: text }
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const revisedDraft = parsed.revisedDraft && typeof parsed.revisedDraft === 'object' && !Array.isArray(parsed.revisedDraft)
      ? parsed.revisedDraft as Partial<WriteBackDraftInput>
      : undefined
    return {
      ok: true,
      approved: parsed.approved === true,
      issues: normalizeStringList(parsed.issues),
      revisedDraft,
      raw: text
    }
  } catch {
    return { ok: false, approved: false, issues: ['invalid_json'], raw: text }
  }
}

function applyRevisedDraft(draft: CharacterBrainWriteBackDraft, revised?: Partial<WriteBackDraftInput>): CharacterBrainWriteBackDraft {
  if (!revised) return draft
  return {
    ...draft,
    target: revised.target || draft.target,
    action: revised.action || draft.action,
    targetUnitId: revised.targetUnitId === undefined ? draft.targetUnitId : toText(revised.targetUnitId).trim() || undefined,
    targetParentId: revised.targetParentId === undefined ? draft.targetParentId : toText(revised.targetParentId).trim() || undefined,
    content: revised.content ? normalizeContent({ ...draft.content, ...revised.content }) : draft.content,
    reason: revised.reason === undefined ? draft.reason : toText(revised.reason).trim(),
    sourceLinks: Array.isArray(revised.sourceLinks) ? revised.sourceLinks : draft.sourceLinks
  }
}

function createAuditRecord(
  round: number,
  prompt: string,
  review: ParsedReview,
  localIssues: CharacterBrainWriteBackValidationIssue[],
  auditLogLevel: AgentModelConfig['writeBackAuditLogLevel'] = 'standard'
): CharacterBrainWriteBackAuditRecord {
  const base: CharacterBrainWriteBackAuditRecord = {
    round,
    approved: review.approved,
    issues: review.issues,
    localIssueCodes: localIssues.map((issue) => issue.code)
  }
  if (auditLogLevel === 'debug') {
    return { ...base, rawResponse: review.raw, prompt }
  }
  if (auditLogLevel === 'standard') {
    return { ...base, rawResponse: review.raw.slice(0, 600) }
  }
  return base
}

function buildPendingOutcome(draft: CharacterBrainWriteBackDraft): CharacterBrainWriteBackOutcome {
  return {
    kind: draft.action === 'create' ? 'pending_unit' : 'pending_version',
    target: draft.target,
    targetUnitId: draft.targetUnitId,
    targetParentId: draft.targetParentId,
    content: draft.content
  }
}

function buildFailureReport(
  reason: string,
  issues: CharacterBrainWriteBackValidationIssue[],
  auditRecords: CharacterBrainWriteBackAuditRecord[],
  now: string
) {
  return {
    reason,
    issues,
    auditRecords,
    createdAt: now
  }
}

export async function runBrainAgentWriteBackDraftProtocol(
  character: Character,
  documents: BrainDocumentRecord[],
  recentMessages: MessageLike[],
  callAI: CallAI,
  input: WriteBackDraftInput,
  options: WriteBackProtocolOptions = {}
): Promise<CharacterBrainWriteBackDraft> {
  const now = options.now || new Date().toISOString()
  const recallResult = await runMultiRoundRecallPipeline(character, documents, recentMessages, callAI, {
    currentDate: options.currentDate
  })
  let draft = createWriteBackDraft(character, input, recallResult, now)
  const maxRounds = clampReviewRounds(options.agentConfig?.writeBackMaxReviewRounds)
  const auditRecords: CharacterBrainWriteBackAuditRecord[] = []
  let localIssues = validateWriteBackDraft(draft)
  if (localIssues.length) {
    return {
      ...draft,
      reviewStatus: 'failed',
      auditRecords,
      failureReport: buildFailureReport('local_validation_failed', localIssues, auditRecords, now),
      updatedAt: now
    }
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    const prompt = buildReviewPrompt(draft, recentMessages, localIssues)
    const review = parseReview(await callAI([{ role: 'user', content: prompt }]))
    const revisedDraft = applyRevisedDraft(draft, review.revisedDraft)
    localIssues = validateWriteBackDraft(revisedDraft)
    const approved = review.ok && review.approved && localIssues.length === 0
    const auditRecord = createAuditRecord(
      round,
      prompt,
      { ...review, approved },
      localIssues,
      options.agentConfig?.writeBackAuditLogLevel || 'standard'
    )
    auditRecords.push(auditRecord)
    draft = { ...revisedDraft, auditRecords, updatedAt: now }
    if (approved) {
      return {
        ...draft,
        reviewStatus: 'approved',
        pendingOutcome: buildPendingOutcome(draft),
        auditRecords,
        updatedAt: now
      }
    }
  }

  return {
    ...draft,
    reviewStatus: 'failed',
    auditRecords,
    failureReport: buildFailureReport('review_rounds_exhausted', localIssues, auditRecords, now),
    updatedAt: now
  }
}
