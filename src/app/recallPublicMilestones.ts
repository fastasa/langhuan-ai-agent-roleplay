import type { PublicRecallMilestone, RecallActivityEvent, RecallActivityUnitRef } from '../types/docBrain'

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function readUnitRefs(value: unknown): RecallActivityUnitRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): RecallActivityUnitRef | null => {
      if (typeof item === 'string') {
        const id = item.trim()
        return id ? { id, title: id } : null
      }
      const record = readObject(item)
      const id = String(record.id || '').trim()
      const title = String(record.title || id).trim()
      if (!id && !title) return null
      return {
        id: id || title,
        title: title || id,
        ownerCharacterId: typeof record.ownerCharacterId === 'string' ? record.ownerCharacterId : undefined,
        contentText: typeof record.contentText === 'string' ? record.contentText : undefined,
        summary: typeof record.summary === 'string' ? record.summary : undefined,
        readDecision: record.readDecision as RecallActivityUnitRef['readDecision'],
        score: typeof record.score === 'number' ? record.score : undefined
      }
    })
    .filter((item): item is RecallActivityUnitRef => Boolean(item))
}

function readCandidateRefs(value: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((item): { id: string; title: string } | null => {
      if (typeof item === 'string') {
        const id = item.trim()
        return id ? { id, title: id } : null
      }
      const record = readObject(item)
      const id = String(record.id || '').trim()
      const title = String(record.title || record.t || id).trim()
      if (!id && !title) return null
      return { id: id || title, title: title || id }
    })
    .filter((item): item is { id: string; title: string } => Boolean(item))
}

function uniqueList(items: string[]): string[] {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function eventStatus(events: RecallActivityEvent[]): PublicRecallMilestone['status'] {
  if (events.some((event) => event.status === 'failed')) return 'failed'
  if (events.some((event) => event.status === 'started')) return 'started'
  return 'completed'
}

function eventDurationMs(events: RecallActivityEvent[]): number | undefined {
  const total = events.reduce((sum, event) => sum + (Number.isFinite(event.durationMs) ? Math.max(0, Number(event.durationMs)) : 0), 0)
  return total > 0 ? total : undefined
}

function readModelCalls(value: unknown): Array<{ model?: string; presetName?: string }> {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = readObject(item)
    return {
      model: typeof record.model === 'string' ? record.model : undefined,
      presetName: typeof record.presetName === 'string' ? record.presetName : undefined
    }
  })
}

function formatModelLabel(model: string, presetName: string): string {
  return model || presetName || ''
}

function eventModelLabel(events: RecallActivityEvent[]): string | undefined {
  const labels = uniqueList(events.flatMap((event) => {
    const output = readObject(event.output)
    const calls = readModelCalls(output.modelCalls)
    return [
      formatModelLabel(String(event.metrics?.model || ''), String(event.metrics?.presetName || '')),
      ...calls.map((call) => formatModelLabel(call.model || '', call.presetName || ''))
    ]
  }))
  return labels.length ? labels.slice(0, 2).join('、') : undefined
}

function buildCandidateLabels(events: RecallActivityEvent[], stepKey: string): string[] {
  const labels = events
    .filter((event) => event.stepKey === stepKey)
    .flatMap((event) => {
      const input = readObject(event.input)
      const output = readObject(event.output)
      const refs = [
        ...readCandidateRefs(input.candidateRefs),
        ...readCandidateRefs(output.candidates),
        ...readUnitRefs(output.directUnits),
        ...readUnitRefs(output.expandedUnits),
        ...readUnitRefs(output.confirmed),
        ...readUnitRefs(event.metrics?.directUnits),
        ...readUnitRefs(event.metrics?.expandedUnits),
        ...readUnitRefs(event.metrics?.confirmedUnits)
      ]
      const ids = readStringList(input.candidateIds)
      return ids.length
        ? ids.map((id) => refs.find((ref) => ref.id === id)?.title || id)
        : refs.map((ref) => ref.title || ref.id)
    })
  return uniqueList(labels)
}

function readConfirmedUnits(events: RecallActivityEvent[]): RecallActivityUnitRef[] {
  const refs = events.flatMap((event) => {
    const output = readObject(event.output)
    const outputConfirmed = readUnitRefs(output.confirmed)
    if (outputConfirmed.length) return outputConfirmed
    return event.metrics?.confirmedUnits || []
  })
  const seen = new Set<string>()
  return refs.filter((unit) => {
    const id = unit.id || unit.title
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function makeMilestone(
  id: string,
  title: string,
  text: string,
  events: RecallActivityEvent[],
  relatedUnits: RecallActivityUnitRef[] = []
): PublicRecallMilestone | null {
  if (!events.length) return null
  return {
    id,
    title,
    text,
    status: eventStatus(events),
    sourceEventIds: events.map((event) => event.id),
    relatedUnits,
    durationMs: eventDurationMs(events),
    modelLabel: eventModelLabel(events),
    displayDelayMs: 1000 + Math.floor(Math.random() * 1001)
  }
}

export function normalizePublicRecallEvents(events: RecallActivityEvent[]): RecallActivityEvent[] {
  const visible: RecallActivityEvent[] = []
  for (const event of events) {
    if (event.status === 'started') {
      visible.push(event)
      continue
    }
    const startedIndex = visible.findIndex((item) => item.status === 'started' && (item.id === event.id || (item.stepKey === event.stepKey && item.parallelGroup === event.parallelGroup)))
    if (startedIndex >= 0) {
      visible.splice(startedIndex, 1, event)
    } else {
      visible.push(event)
    }
  }
  return visible
}

export function isPublicRecallEvent(event: RecallActivityEvent): boolean {
  if (event.stepKey === 'langhuan_personality_network_unit_recall') {
    const input = readObject(event.input)
    return String(input.unitType || '').trim() === 'encoding'
  }
  if (event.stepKey === 'recall_metrics_summary') return true
  if (event.stepKey === 'recent_context') return true
  if (event.stepKey.includes('intent_snapshot')) return true
  if (event.stepKey.includes('candidate') || event.stepKey.includes('judgment')) return true
  if (event.stepKey.includes('boundary_update')) return true
  if (event.stepKey.includes('read') || event.stepKey === 'confirmed_content_read') return true
  if (event.metrics?.confirmedUnits?.length) return true
  return false
}

export function buildPublicRecallMilestonesFromEvents(events: RecallActivityEvent[]): PublicRecallMilestone[] {
  return buildPublicRecallMilestones(normalizePublicRecallEvents(events).filter((event) => isPublicRecallEvent(event)))
}

export function readLatestPublicRecallMilestoneTitle(input: {
  status?: string
  events?: RecallActivityEvent[]
  publicMilestones?: PublicRecallMilestone[]
}): string {
  const stored = Array.isArray(input.publicMilestones) && input.publicMilestones.length
    ? input.publicMilestones
    : buildPublicRecallMilestonesFromEvents(input.events || [])
  if (!stored.length) return ''
  if (input.status === 'running') {
    const running = stored.slice().reverse().find((item) => item.status === 'started')
    if (running) return running.title || ''
    const latestOpenStep = stored.slice().reverse().find((item) => item.id !== 'summary')
    return latestOpenStep?.title || ''
  }
  const running = stored.slice().reverse().find((item) => item.status === 'started')
  return (running || stored[stored.length - 1])?.title || ''
}

export function readLatestPublicRecallMilestoneText(input: {
  status?: string
  events?: RecallActivityEvent[]
  publicMilestones?: PublicRecallMilestone[]
} | null | undefined): string {
  if (!input || typeof input !== 'object') return ''
  const stored = Array.isArray(input.publicMilestones) && input.publicMilestones.length
    ? input.publicMilestones
    : buildPublicRecallMilestonesFromEvents(input.events || [])
  if (!stored.length) return ''
  if (input.status === 'running') {
    const running = stored.slice().reverse().find((item) => item.status === 'started')
    const latestOpenStep = running || stored.slice().reverse().find((item) => item.id !== 'summary')
    return latestOpenStep?.text || latestOpenStep?.title || ''
  }
  const running = stored.slice().reverse().find((item) => item.status === 'started')
  const current = running || stored[stored.length - 1]
  return current?.text || current?.title || ''
}

export function buildPublicRecallMilestones(events: RecallActivityEvent[]): PublicRecallMilestone[] {
  const confirmedUnits = readConfirmedUnits(events)
  const ruleLabels = buildCandidateLabels(events, 'candidate_rules_score')
  const embeddingLabels = buildCandidateLabels(events, 'candidate_embedding_score')
  const mergeLabels = buildCandidateLabels(events, 'candidate_merge')
  const boundary = events.slice().reverse().find((event) => event.stepKey.includes('boundary_update'))
  const stopAllowed = boundary ? boundary.metrics?.stopAllowed ?? readObject(boundary.output).stopAllowed : undefined
  const milestones = [
    makeMilestone('recent', '我先把刚才的话接稳', '我先拎住近几轮对话，免得只盯着你最后一句跑偏。', events.filter((event) => event.stepKey === 'recent_context')),
    makeMilestone('intent', '我听听你真正追的是哪条线', '我先分清你是在追关系、经历、性格，还是藏在别处的线索。', events.filter((event) => event.stepKey.includes('intent_snapshot'))),
    makeMilestone('structure', '我把记忆里的岔路摊开', '我先看资料脉络，知道该往哪几条路翻。', events.filter((event) => event.stepKey.includes('structure'))),
    makeMilestone('rule-candidates', '我先从熟门熟路的地方翻起', ruleLabels.length ? `我按资料层级先捞出几条可能有用的线索：${ruleLabels.slice(0, 5).join('、')}${ruleLabels.length > 5 ? '等。' : '。'}` : '我按资料层级先捞出一批可能有用的线索。', events.filter((event) => event.stepKey === 'candidate_rules_score')),
    makeMilestone('embedding-candidates', '我再沿着相近意思补查一遍', embeddingLabels.length ? `我按语义相近度再补查：${embeddingLabels.slice(0, 5).join('、')}${embeddingLabels.length > 5 ? '等。' : '。'}` : '我按语义相近度再补查一遍，省得同一件事换个说法就漏掉。', events.filter((event) => event.stepKey === 'candidate_embedding_score')),
    makeMilestone('merge-candidates', '我把重叠的线索并成一束', mergeLabels.length ? `我把重复或相近的线索并起来，留下${mergeLabels.slice(0, 5).join('、')}${mergeLabels.length > 5 ? '等' : ''}继续判断。` : '我把重复或相近的线索并起来，留下更清楚的候选清单。', events.filter((event) => event.stepKey === 'candidate_merge')),
    makeMilestone('judge', '我挑挑哪些线索真的贴题', '我逐批挑一遍，贴题的留下，牵强的先挡在外面。', events.filter((event) => event.stepKey.includes('llm_judgment') || event.stepKey.includes('judgment'))),
    makeMilestone('boundary', '我判断还要不要继续深翻', stopAllowed ? '我确认信息边界已经收住，继续翻只会添乱。' : '我发现边界还没收住，再往下翻一点。', events.filter((event) => event.stepKey.includes('boundary_update'))),
    makeMilestone('read', '我把能用的记忆取出来', confirmedUnits.length ? `我把${confirmedUnits.slice(0, 5).map((unit) => unit.title || unit.id).join('、')}${confirmedUnits.length > 5 ? '等' : ''}收进本轮参考。` : '我开始读取最终确认的资料，把摘要或正文收进本轮参考。', events.filter((event) => event.stepKey === 'confirmed_content_read' || event.stepKey.includes('read')), confirmedUnits),
    makeMilestone('summary', '我把这次要带进回复的东西收好', confirmedUnits.length ? `我已经收好本轮会用到的参考：${confirmedUnits.slice(0, 5).map((unit) => unit.title || unit.id).join('、')}${confirmedUnits.length > 5 ? '等' : ''}。` : '我已经整理好本轮会用到的参考内容。', events.filter((event) => event.stepKey === 'recall_metrics_summary' || event.metrics?.confirmedUnits?.length), confirmedUnits)
  ]
  return milestones.filter((item): item is PublicRecallMilestone => Boolean(item)).slice(0, 15)
}

export function buildPublicMilestoneRewritePrompt(input: {
  characterName: string
  characterDescription?: string
  characterPersonality?: string
  speakingStyleSummary: string
  milestones: PublicRecallMilestone[]
}): string {
  const description = String(input.characterDescription || '').trim()
  const personality = String(input.characterPersonality || '').trim()
  const style = input.speakingStyleSummary.trim()
  const rows = input.milestones.map((item) => `${item.id}|${item.title}|${item.text}`).join('\n')
  return [
    `你要把召回过程改写成角色「${input.characterName || '角色'}」的第一人称处理旁白。`,
    `角色简介：${description}`,
    `角色性格：${personality}`,
    `说话风格摘要：${style}`,
    '要求：',
    '1. 只改写给用户看的过程旁白，不要暴露规则分、嵌入、模型名、Token、内部 ID、JSON、数据库、后台等技术细节。',
    '2. 每行格式固定为：步骤ID|标题|一句第一人称文案。',
    '3. 必须严格扮演该角色来生成标题和文案，禁止 OOC；角色简介、性格和说话风格冲突时，以角色性格和说话风格为准。',
    '4. 标题和文案都用第一人称。',
    '5. 不要解释，不要加序号，不要 Markdown。',
    '待改写步骤：',
    rows
  ].join('\n')
}

export function applyPublicMilestoneRewrite(
  milestones: PublicRecallMilestone[],
  rawText: string
): PublicRecallMilestone[] {
  const updates = new Map<string, { title: string; text: string }>()
  for (const line of String(rawText || '').split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim())
    if (parts.length < 3) continue
    const [id, title, ...textParts] = parts
    const text = textParts.join('|').trim()
    if (!id || !title || !text) continue
    updates.set(id, { title, text })
  }
  if (!updates.size) return milestones
  return milestones.map((item) => {
    const next = updates.get(item.id)
    return next ? { ...item, title: next.title, text: next.text } : item
  })
}
