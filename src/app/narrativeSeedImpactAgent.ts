import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import { assembleAgentSkillSupply } from './agentSupply'
import type { AgentSupplyProfileId } from '../../shared/agentSupplyManifest'
import {
  NARRATIVE_SEED_PARTICIPANT_TYPES,
  NARRATIVE_SEED_STATUSES,
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  validateCompleteNarrativeSeedAuthoring
} from '../../shared/narrativeSeedAuthoring'

export type NarrativeSeedPredictedImpact = {
  kind: 'existing'
  seedId: string
  effectSummary: string
}

export type NarrativeSeedCandidate = {
  kind: 'new'
  type: 'foreshadow' | 'countdown' | 'offscreen_process' | 'threat_or_opportunity' | 'promise_or_debt' | 'relationship_change' | 'world_change'
  title: string
  description: string
  cause: string
  currentProgress: string
  expectedOutcome: string
  startTime: string
  mapFeatureId: string
  locationText: string
  impactScope: string
  status: 'dormant' | 'active' | 'ready_to_trigger' | 'pending_effect' | 'triggered' | 'resolved' | 'expired' | 'stalled' | 'review_required' | 'transformed'
  visibilityMode: 'director_only' | 'participants' | 'public' | 'custom'
  allowFrontstage: boolean
  participants: Array<Record<string, unknown>>
  sourceSeedIds: string[]
}

export type NarrativeSeedPredictionItem = NarrativeSeedPredictedImpact | NarrativeSeedCandidate

export type NarrativeBackgroundEvolutionItem =
  | {
      kind: 'seed_evolution'
      seedId: string
      outcomeSummary: string
      currentProgress: string
      status: NarrativeSeedFactCommit['status']
      nextStartTime?: string
    }
  | ({ kind: 'derived_seed' } & Omit<NarrativeSeedCandidate, 'kind'>)
  | {
      kind: 'world_entity_update'
      entityId: string
      summary: string
      markdownAppend: string
      sourceSeedIds: string[]
    }

export type NarrativeSeedFactCommit = {
  seedId: string
  comparisonOutcome: 'occurred' | 'partial' | 'not_occurred' | 'opposite'
  effectSummary: string
  evidenceSummary: string
  sourceMessageId: number
  currentProgress?: string
  status?: 'dormant' | 'active' | 'ready_to_trigger' | 'pending_effect' | 'triggered' | 'resolved' | 'expired' | 'stalled' | 'review_required' | 'transformed'
}

export type PersistedNarrativeFactMessage = { id: number; speaker: string; content: string; kind: string }

/** 事实核对唯一入口：只接受锚点之后、已经取得正式 id 的 assistant/旁白消息。 */
export function selectPersistedNarrativeFactMessages(messages: unknown[], anchorMessageId: number): PersistedNarrativeFactMessage[] {
  if (!(anchorMessageId > 0)) return []
  return (Array.isArray(messages) ? messages : [])
    .filter((message: any) => Number(message?.id || 0) > anchorMessageId && String(message?.role || '') === 'assistant')
    .map((message: any) => ({
      id: Number(message.id),
      speaker: String(message?.memberName || message?.name || message?.speakerName || '').trim(),
      content: String(message?.content || message?.text || '').trim().slice(0, 6000),
      kind: String(message?.messageType || message?.type || 'assistant').trim()
    }))
    .filter((message) => message.id > 0 && message.content)
}

type ModelCall = (request: {
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
  toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
}) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>

const clean = (value: unknown, max = 1600) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

const candidateItemSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...NARRATIVE_SEED_TYPES] }, title: { type: 'string' }, description: { type: 'string' },
    cause: { type: 'string' }, currentProgress: { type: 'string' }, expectedOutcome: { type: 'string' }, startTime: { type: 'string' },
    mapFeatureId: { type: 'string' }, locationText: { type: 'string', description: '大地点/中地点/小地点' }, impactScope: { type: 'string' },
    status: { type: 'string', enum: [...NARRATIVE_SEED_STATUSES] }, visibilityMode: { type: 'string', enum: [...NARRATIVE_SEED_VISIBILITY_MODES] },
    allowFrontstage: { type: 'boolean' }, participants: { type: 'array', items: { type: 'object', properties: {
      participantType: { type: 'string', enum: [...NARRATIVE_SEED_PARTICIPANT_TYPES] }, participantId: { type: 'string' }, displayName: { type: 'string' }, relationRole: { type: 'string' }
    }, required: ['participantType'] } },
    sourceSeedIds: { type: 'array', items: { type: 'string' } }
  }
} as const

function normalizeNarrativeSeedCandidate(item: any): Omit<NarrativeSeedCandidate, 'kind'> | null {
  const sourceSeedIds = (Array.isArray(item?.sourceSeedIds) ? item.sourceSeedIds : []).map((id: unknown) => clean(id, 160)).filter(Boolean).slice(0, 8)
  const candidate = {
    type: clean(item?.type, 60) as NarrativeSeedCandidate['type'],
    title: clean(item?.title, 120),
    description: clean(item?.description, 2000),
    cause: clean(item?.cause, 2000),
    currentProgress: clean(item?.currentProgress, 2000),
    expectedOutcome: clean(item?.expectedOutcome, 2000),
    startTime: clean(item?.startTime, 120),
    mapFeatureId: typeof item?.mapFeatureId === 'string' ? item.mapFeatureId.trim().slice(0, 160) : item?.mapFeatureId,
    locationText: clean(item?.locationText, 500),
    impactScope: clean(item?.impactScope, 500),
    status: clean(item?.status, 40) as NarrativeSeedCandidate['status'],
    visibilityMode: clean(item?.visibilityMode, 40) as NarrativeSeedCandidate['visibilityMode'],
    allowFrontstage: item?.allowFrontstage,
    participants: Array.isArray(item?.participants) ? item.participants.slice(0, 100) : item?.participants,
    links: [],
    sourceSeedIds
  }
  const errors = validateCompleteNarrativeSeedAuthoring(candidate)
  if (errors.length || !sourceSeedIds.length) return null
  const { links: _links, ...normalized } = candidate
  return normalized as Omit<NarrativeSeedCandidate, 'kind'>
}

export function areNarrativeSeedTitlesEquivalent(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown) => String(value || '').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return false
  if (a === b) return true
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true
  const bigrams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)))
  const aa = bigrams(a)
  const bb = bigrams(b)
  if (!aa.size || !bb.size) return false
  const intersection = [...aa].filter((item) => bb.has(item)).length
  const union = new Set([...aa, ...bb]).size
  return intersection / union >= 0.5
}

function createSubmitTool<T>(name: string, brief: string, itemSchema: Record<string, unknown>, normalize: (item: any) => T | null, holder: { items: T[] | null }): ToolDefinition {
  return {
    name,
    brief,
    schema: { type: 'object', properties: { items: { type: 'array', items: itemSchema } }, required: ['items'] },
    execute: (call) => {
      holder.items = (Array.isArray(call.args.items) ? call.args.items : []).map(normalize).filter(Boolean).slice(0, 12) as T[]
      return { content: '结构化交稿已接收。', details: { count: holder.items.length } }
    }
  }
}

async function runImpactLoop<T>(input: {
  profileId: AgentSupplyProfileId
  sessionId: string
  runKey: string
  system: string
  /** 上一正式阶段代码裁剪出的机器载荷；不是完整 AgentContext，也不允许在这里临时补投影。 */
  formalStagePayload: string
  submitName: string
  submitBrief: string
  itemSchema: Record<string, unknown>
  normalize: (item: any) => T | null
  callModel: ModelCall
}): Promise<T[]> {
  const holder: { items: T[] | null } = { items: null }
  const submitTool = createSubmitTool(input.submitName, input.submitBrief, input.itemSchema, input.normalize, holder)
  const skillAssembly = await assembleAgentSkillSupply({ profileId: input.profileId })
  await runSubagentLoop({
    profileId: input.profileId,
    sessionId: input.sessionId,
    subagentId: `narrative-impact:${input.runKey}`,
    loggedInput: input.formalStagePayload,
    presentation: {
      label: '编剧',
      icon: 'clapperboard',
      runningVerb: '分析中',
      title: '叙事影响分析'
    },
    agentName: 'NarrativeImpactAgent',
    runtimeVersion: 'narrative-impact-v1',
    messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.formalStagePayload }],
    skillAssembly,
    tools: [],
    submitTool,
    submitToolName: input.submitName,
    isSubmitted: () => holder.items !== null,
    nudgeId: 'narrative-impact-submit',
    nudgeMaxCount: 1,
    buildNudgeText: () => `立即调用 ${input.submitName} 交稿；没有可靠条目就提交空数组。`,
    submitTerminateId: 'narrative-impact-done',
    submitTerminateSummary: '叙事影响分析已交稿',
    submitGrace: { submitToolName: input.submitName, buildNudge: () => `最后机会：调用 ${input.submitName}，不确定就交空数组。` },
    budget: { maxTurns: 4, maxToolCalls: 4 },
    timeoutMs: SUBAGENT_LOOP_TIMEOUT_MS,
    callModel: input.callModel,
    onNoSubmit: () => { holder.items = [] },
    onCatchError: () => { holder.items = [] },
    buildEndPayload: () => ({ ok: holder.items !== null, count: holder.items?.length || 0 })
  })
  return holder.items || []
}

export function predictNarrativeSeedImpacts(input: {
  sessionId: string
  directorRunId: string
  orchestration: string
  relevantSeeds: string
  callModel: ModelCall
}): Promise<NarrativeSeedPredictionItem[]> {
  return runImpactLoop({
    profileId: 'scriptwriter.seed-impact-prediction',
    sessionId: input.sessionId,
    runKey: `${input.directorRunId}:predict`,
    system: [
      '你是统筹后的叙事种子预计影响分析器。此时角色与旁白尚未真正落库。',
      '只判断本轮编排可能推进、延迟、阻止或转化哪些既有种子。计划绝不是事实，不得宣布种子已触发/已解决。',
      '同时检查相关种子中已经超过 startTime 的后台线：只能根据现有因果、进展、预期结果、地点和影响范围推断候选影响，不能宣称后果已经发生。',
      '既有影响填 kind=existing 并只引用给出的 seedId。确有新因果线才填 kind=new；新种子必须填写完整字段，locationText 严格用“大地点/中地点/小地点”，没有精确要素填 mapFeatureId=""，没有参与者填 participants=[]。地图图纸由代码绑定。',
      '新条目仍只是 pending_effect 候选，不是已发生事实。没有可靠影响就交空数组。完成后调用 submitPredictedImpacts。'
    ].join('\n'),
    formalStagePayload: `【本轮完整统筹】\n${input.orchestration}\n\n【相关种子】\n${input.relevantSeeds || '无'}`,
    submitName: 'submitPredictedImpacts',
    submitBrief: '提交尚未发生的预计影响。',
    itemSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['existing', 'new'] }, seedId: { type: 'string' }, effectSummary: { type: 'string' },
        ...candidateItemSchema.properties
      },
      required: ['kind']
    },
    normalize: (item) => {
      if (clean(item?.kind, 20) === 'new') {
        const candidate = normalizeNarrativeSeedCandidate(item)
        return candidate?.status === 'pending_effect' ? { kind: 'new' as const, ...candidate } : null
      }
      const seedId = clean(item?.seedId, 160)
      const effectSummary = clean(item?.effectSummary)
      return seedId && effectSummary ? { kind: 'existing' as const, seedId, effectSummary } : null
    },
    callModel: input.callModel
  })
}

export function reconcileNarrativeSeedFacts(input: {
  sessionId: string
  directorRunId: string
  predictedImpacts: NarrativeSeedPredictedImpact[]
  actualMessages: PersistedNarrativeFactMessage[]
  anchorMessageId?: number
  committedChanges?: string
  relevantSeeds: string
  callModel: ModelCall
}): Promise<NarrativeSeedFactCommit[]> {
  return runImpactLoop({
    profileId: 'scriptwriter.seed-fact-reconciliation',
    sessionId: input.sessionId,
    runKey: `${input.directorRunId}:facts`,
    system: [
      '你是叙事种子事实核对器。你只能依据已经落库的角色/旁白消息，不得依据统筹计划提交事实。',
      '已经成功落账的帷幕或状态变化也属于事实；若只引用这类工具落账，sourceMessageId 使用给出的来源用户消息 id。',
      '逐条比较预计影响：occurred/partial/not_occurred/opposite。没有实际证据的种子不要提交。',
      'sourceMessageId 必须取证据消息 id；currentProgress/status 只有证据足够时才给。完成后调用 submitFactCommits。'
    ].join('\n'),
    formalStagePayload: `【预计影响】\n${JSON.stringify(input.predictedImpacts)}\n\n【实际已落库消息】\n${JSON.stringify(input.actualMessages)}\n\n【已经成功落账的帷幕/状态变化】\n${input.committedChanges || '无'}\n\n【工具变化的来源用户消息 id】\n${Number(input.anchorMessageId || 0) || '无'}\n\n【相关种子】\n${input.relevantSeeds || '无'}`,
    submitName: 'submitFactCommits',
    submitBrief: '提交基于真实落库消息的种子事实核对。',
    itemSchema: {
      type: 'object',
      properties: {
        seedId: { type: 'string' }, comparisonOutcome: { type: 'string', enum: ['occurred', 'partial', 'not_occurred', 'opposite'] },
        effectSummary: { type: 'string' }, evidenceSummary: { type: 'string' }, sourceMessageId: { type: 'number' },
        currentProgress: { type: 'string' }, status: { type: 'string' }
      },
      required: ['seedId', 'comparisonOutcome', 'effectSummary', 'evidenceSummary', 'sourceMessageId']
    },
    normalize: (item) => {
      const seedId = clean(item?.seedId, 160)
      const outcome = clean(item?.comparisonOutcome, 40) as NarrativeSeedFactCommit['comparisonOutcome']
      const sourceMessageId = Math.max(0, Math.trunc(Number(item?.sourceMessageId || 0)))
      const effectSummary = clean(item?.effectSummary)
      const evidenceSummary = clean(item?.evidenceSummary, 1000)
      if (!seedId || !['occurred', 'partial', 'not_occurred', 'opposite'].includes(outcome) || !sourceMessageId || !effectSummary || !evidenceSummary) return null
      return {
        seedId, comparisonOutcome: outcome, effectSummary, evidenceSummary, sourceMessageId,
        ...(clean(item?.currentProgress, 2000) ? { currentProgress: clean(item.currentProgress, 2000) } : {}),
        ...(clean(item?.status, 40) ? { status: clean(item.status, 40) as NarrativeSeedFactCommit['status'] } : {})
      }
    },
    callModel: input.callModel
  })
}

/** 每轮有限后台演化：只分析服务端已选出的到期种子，不自行扩大扫描范围。 */
export function evolveOverdueNarrativeSeeds(input: {
  sessionId: string
  directorRunId: string
  currentTime: string
  overdueSeeds: Array<Record<string, any>>
  worldEntities: Array<Record<string, any>>
  callModel: ModelCall
}): Promise<NarrativeBackgroundEvolutionItem[]> {
  return runImpactLoop({
    profileId: 'scriptwriter.seed-background-evolution',
    sessionId: input.sessionId,
    runKey: `${input.directorRunId}:background-evolution`,
    system: [
      '你是世界后台叙事演化 Agent。服务端已按硬上限选出本轮允许处理的到期种子；不得扩展扫描、不得假装玩家参与。',
      '先判断 startTime 是否已经越过；requiresTemporalJudgment=true 的世界内时间必须结合当前世界时间判断，尚未到时不要提交该种子。到时后依据描述、因果、当前进展、预期结果、地点、影响范围和已有事件现场推断变化，不能读取或补写预存的“无人干预后果”。每个种子最多交一条 seed_evolution。',
      '能更新旧种子就不要派生。确有新的独立因果线才交 derived_seed，必须关联来源 seedId、填写完整种子字段，且全批最多建议两条。地图图纸由代码绑定，不得输出 mapSheetId。',
      'world_entity_update 只能引用给出的现有 entityId，只追加本次变化摘要，禁止重写整个实体，并必须列出造成变化的 sourceSeedIds。',
      'ready_to_trigger 只表示系统确认时间门已越过，不是演化结果。若 seed_evolution 后仍需继续观察（active/dormant/pending_effect/stalled/review_required），必须给晚于当前时间的 nextStartTime，代码会把它写回同一个 startTime 字段；确已产生影响则按证据写 triggered/resolved/transformed 等结果态。',
      '不要决定是否把结果塞进当前聊天；前台分流由代码依据 affectsCurrentCurtain 真值处理。完成后调用 submitBackgroundEvolution。'
    ].join('\n'),
    formalStagePayload: `【当前世界时间】\n${input.currentTime}\n\n【本轮允许处理的到期种子】\n${JSON.stringify(input.overdueSeeds)}\n\n【可更新的既有世界实体】\n${JSON.stringify(input.worldEntities)}`,
    submitName: 'submitBackgroundEvolution',
    submitBrief: '提交本轮有限后台演化结果。',
    itemSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['seed_evolution', 'derived_seed', 'world_entity_update'] },
        ...candidateItemSchema.properties,
        seedId: { type: 'string' }, outcomeSummary: { type: 'string' }, currentProgress: { type: 'string' }, status: { type: 'string' }, nextStartTime: { type: 'string' },
        entityId: { type: 'string' }, summary: { type: 'string' }, markdownAppend: { type: 'string' }
      },
      required: ['kind']
    },
    normalize: (item) => {
      const kind = clean(item?.kind, 40)
      if (kind === 'seed_evolution') {
        const seedId = clean(item?.seedId, 160)
        const outcomeSummary = clean(item?.outcomeSummary, 1600)
        const currentProgress = clean(item?.currentProgress, 2000)
        const status = clean(item?.status, 40) as NonNullable<NarrativeSeedFactCommit['status']>
        const validStatuses = ['dormant', 'active', 'pending_effect', 'triggered', 'resolved', 'expired', 'stalled', 'review_required', 'transformed']
        const nextStartTime = clean(item?.nextStartTime, 120)
        const requiresNextStart = ['dormant', 'active', 'pending_effect', 'stalled', 'review_required'].includes(status)
        return seedId && outcomeSummary && currentProgress && validStatuses.includes(status) && (!requiresNextStart || nextStartTime)
          ? { kind: 'seed_evolution' as const, seedId, outcomeSummary, currentProgress, status, ...(nextStartTime ? { nextStartTime } : {}) }
          : null
      }
      if (kind === 'derived_seed') {
        const candidate = normalizeNarrativeSeedCandidate(item)
        return candidate ? { kind: 'derived_seed' as const, ...candidate } : null
      }
      if (kind === 'world_entity_update') {
        const entityId = clean(item?.entityId, 160)
        const summary = clean(item?.summary, 1000)
        const markdownAppend = clean(item?.markdownAppend, 2000)
        const sourceSeedIds = (Array.isArray(item?.sourceSeedIds) ? item.sourceSeedIds : []).map((id: unknown) => clean(id, 160)).filter(Boolean).slice(0, 8)
        return entityId && summary && markdownAppend && sourceSeedIds.length ? { kind: 'world_entity_update' as const, entityId, summary, markdownAppend, sourceSeedIds } : null
      }
      return null
    },
    callModel: input.callModel
  })
}
