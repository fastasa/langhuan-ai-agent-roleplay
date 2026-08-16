import type {
  BrainDocumentRecord,
  BrainRecallCandidateCard,
  Character,
  CharacterBrainCandidateChange,
  CharacterBrainTraceNode,
  CharacterBrainCognitionNode,
  CharacterBrainSourceLink
} from '../types'
import type { DocLibraryRecallStructureOptions } from './characterBrainRecallStructure'
import {
  applyDocLibraryRecallStructureToCards,
  buildDocLibraryRecallStructureView
} from './characterBrainRecallStructure'
import {
  buildCharacterBrainCard,
  buildCharacterBrainCognitionNodesChange,
  createCharacterBrainReadContext,
  readCharacterBrainCompilePage,
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes
} from './characterBrain'
import { buildCleanRecallPromptBlock } from './characterBrainRecallPromptBlock'
import { buildCharacterArrangementContentPorts } from './unitContentPort'
import { formatRelationProfileForRecall, parseRelationProfileContent } from './relationProfileWriteback'

const RECALLABLE_CORE_NODE_IDS = [
  'brain:detail_info',
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
]

const CORE_RECALL_PARENT_BY_NODE_ID: Record<string, string | undefined> = {
  'brain:detail_info': 'brain:see_me',
  'brain:desc': 'brain:see_me',
  'brain:goal_value': 'brain:see_me',
  'brain:appearance': 'brain:detail_info',
  'brain:speaking_style': 'brain:detail_info',
  'brain:outfit': 'brain:detail_info',
  'brain:personality': 'brain:see_me',
  'brain:hobbies': 'brain:detail_info',
  'brain:abilities': 'brain:detail_info',
  'brain:experience': 'brain:detail_info',
  'brain:worldview': 'brain:detail_info',
  'brain:background': 'brain:detail_info'
}

const CORE_RECALL_CHILD_COUNT_BY_NODE_ID: Record<string, number> = {
  'brain:detail_info': 8
}

const BASELINE_RECALL_CORE_PROFILES: Record<string, {
  boost: number
  profile: string
}> = {
  'brain:desc': {
    boost: 0.22,
    profile: '这是角色底层设定中的简介。适用于身份定位、核心背景、稳定自我认知、动机解释和 OOC 防线判断。'
  },
  'brain:appearance': {
    boost: 0.18,
    profile: '这是角色底层设定中的外貌特征。适用于视觉描写、他人观察、场景中的身体呈现、外观一致性和 OOC 防线判断。'
  },
  'brain:speaking_style': {
    boost: 0.3,
    profile: '这是角色底层设定中的说话风格。适用于称呼、语气、用词、亲疏感、对话反应、调侃方式、拒绝方式和 OOC 防线判断。'
  },
  'brain:personality': {
    boost: 0.22,
    profile: '这是角色底层设定中的性格。适用于动机解释、稳定行为倾向、情绪反应、关系边界、自我认知和 OOC 防线判断。'
  },
  'brain:goal_value': {
    boost: 0.2,
    profile: '这是角色底层设定中的长期目标与价值。适用于长期理想、价值排序、底线判断和目标价值单元的保守校准。'
  },
  'brain:outfit': {
    boost: 0.14,
    profile: '这是角色底层设定中的穿着。适用于服饰描写、场景反应、他人观察、日常形象和外观一致性判断。'
  }
}

type ChatMessageLike = {
  id?: string
  role?: string
  name?: string
  content?: string
  text?: string
  createdAt?: string
  created_at?: string
}

type RecallCandidateBuildOptions = {
  currentDate?: Date
  docLibraryStructure?: DocLibraryRecallStructureOptions
  observableProfiles?: ObservableProfileSource[]
  includeCandidateChanges?: boolean
  includeObservableProfiles?: boolean
  readContext?: ReturnType<typeof createCharacterBrainReadContext>
}

export type ObservableProfileSource = {
  id: string
  name: string
  nicknames?: string
  appearance?: string
  inScene?: boolean
  subjectType: 'user' | 'character'
}

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function splitNameLikeTerms(value: unknown): string[] {
  return toText(value)
    .split(/[\n,，、;；/|]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueStrings(values: string[], limit = 24): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = value.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value)) return value as T
  if (typeof value !== 'string') return (value as T) ?? fallback
  try {
    const parsed = JSON.parse(value)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

function normalizeCandidateChange(raw: Record<string, unknown>, index: number, characterId: string): CharacterBrainCandidateChange | null {
  const id = toText(raw.id, '').trim() || `candidate_${index}`
  const title = toText(raw.title, '').trim()
  const summary = toText(raw.summary, '').trim()
  if (!title && !summary) return null
  const target = toText(raw.target, 'soul')
  const action = toText(raw.action, 'create')
  const status = toText(raw.status, 'pending')
  return {
    id,
    characterId: toText(raw.characterId ?? raw.character_id, characterId),
    target: target === 'trace' || target === 'public_reference' ? target : 'soul',
    action: action === 'update' ? 'update' : 'create',
    title: title || '待确认变更',
    summary,
    reason: toText(raw.reason, ''),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.6) || 0.6)),
    impactScope: safeJsonParse<string[]>(raw.impactScope ?? raw.impact_scope, []),
    sourceLinks: safeJsonParse<CharacterBrainSourceLink[]>(raw.sourceLinks ?? raw.source_links, []),
    status: status === 'accepted' || status === 'rejected' ? status : 'pending',
    createdAt: toText(raw.createdAt ?? raw.created_at, new Date().toISOString())
  }
}

function normalizeCandidateChanges(raw: unknown, characterId: string): CharacterBrainCandidateChange[] {
  const list = safeJsonParse<unknown[]>(raw, [])
  return (Array.isArray(list) ? list : [])
    .map((item, index) => normalizeCandidateChange(item as Record<string, unknown>, index, characterId))
    .filter((item): item is CharacterBrainCandidateChange => Boolean(item))
}

function buildSourceLinkFromMessage(message: ChatMessageLike, index: number): CharacterBrainSourceLink {
  const content = toText(message.content ?? message.text, '').trim()
  return {
    sourceType: 'chat_message',
    sourceId: toText(message.id, `message_${index}`),
    title: toText(message.name || message.role, '聊天消息'),
    excerpt: content.slice(0, 180)
  }
}

function isCandidateSignal(text: string): boolean {
  return /记住|以后|我发现|我觉得|发生了|变化|成为|开始|不再|决定|喜欢|讨厌/u.test(text)
}

function buildNodeIdFromCandidate(candidate: CharacterBrainCandidateChange): string {
  const slug = candidate.id.replace(/[^\w:-]+/g, '_')
  return `brain:cognition:node:${slug}`
}

function currentWeekdayKeys(date: Date): string[] {
  const names = [
    ['sunday', 'sun', '周日', '星期日', '礼拜日', '0'],
    ['monday', 'mon', '周一', '星期一', '礼拜一', '1'],
    ['tuesday', 'tue', '周二', '星期二', '礼拜二', '2'],
    ['wednesday', 'wed', '周三', '星期三', '礼拜三', '3'],
    ['thursday', 'thu', '周四', '星期四', '礼拜四', '4'],
    ['friday', 'fri', '周五', '星期五', '礼拜五', '5'],
    ['saturday', 'sat', '周六', '星期六', '礼拜六', '6']
  ]
  return [...names[date.getDay()], 'daily', 'everyday', '每天', '每日']
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function timeToMinutes(value: unknown): number | null {
  const text = toText(value).trim()
  const match = text.match(/^(\d{1,2}):(\d{2})$/u)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function formatActivationDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isCurrentTimeSlot(slot: Record<string, unknown>, now: Date): boolean {
  const start = timeToMinutes(slot.startTime ?? slot.start_time)
  const end = timeToMinutes(slot.endTime ?? slot.end_time)
  if (start === null && end === null) return true
  const current = minutesOfDay(now)
  if (start !== null && end !== null) {
    return start <= end
      ? current >= start && current <= end
      : current >= start || current <= end
  }
  if (start !== null) return current >= start
  return end !== null ? current <= end : true
}

function buildArrangementCards(character: Character, now: Date): BrainRecallCandidateCard[] {
  const ports = buildCharacterArrangementContentPorts(character)
  const weekdayKeys = new Set(currentWeekdayKeys(now).map((item) => item.toLowerCase()))
  const schedule = safeJsonParse<Record<string, unknown>>(character.schedule, {})
  const dailyLines = Object.entries(schedule).flatMap(([day, rawSlots]) => {
    if (!weekdayKeys.has(String(day).toLowerCase())) return []
    const slots = Array.isArray(rawSlots) ? rawSlots : []
    return slots
      .map((slot) => slot && typeof slot === 'object' ? slot as Record<string, unknown> : {})
      .filter((slot) => isCurrentTimeSlot(slot, now))
      .map((slot) => {
        const time = [slot.startTime ?? slot.start_time, slot.endTime ?? slot.end_time]
          .map((item) => toText(item).trim())
          .filter(Boolean)
          .join('-')
        const activity = toText(slot.activity).trim()
        const location = toText(slot.location).trim()
        return [day, time, activity, location].filter(Boolean).join(' / ')
      })
  }).filter(Boolean)

  const month = now.getMonth() + 1
  const yearlyLines = safeJsonParse<unknown[]>(character.yearlySchedule ?? character.yearly_schedule, [])
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => {
      const start = Number(item.startMonth ?? item.start_month)
      const end = Number(item.endMonth ?? item.end_month ?? start)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return true
      return start <= end
        ? month >= start && month <= end
        : month >= start || month <= end
    })
    .map((item) => {
      const start = toText(item.startMonth ?? item.start_month).trim()
      const end = toText(item.endMonth ?? item.end_month).trim()
      const activity = toText(item.activity).trim()
      return [`${start}${end ? `-${end}` : ''}月`, activity].filter(Boolean).join(' / ')
    })
    .filter(Boolean)

  const currentPort = ports.find((port) => port.sourceId === 'brain:arrangement:current')
  const rows = [
    { key: 'daily', title: '日常安排', summary: dailyLines.join('\n'), tags: ['安排', '日常'] },
    { key: 'yearly', title: '年度安排', summary: yearlyLines.join('\n'), tags: ['安排', '年度'] },
    { key: 'current', title: '近期安排', summary: currentPort?.summary || '', tags: ['安排', '近期'] }
  ]

  return rows
    .filter((row) => row.summary.trim())
    .map((row) => ({
      id: `brain:arrangement:${row.key}`,
      k: 'character_arrangement' as const,
      p: `/${toText(character.name, '角色')}/安排/${row.title}`,
      t: row.title,
      s: row.summary.trim(),
      tags: row.tags,
      u: now.toISOString(),
      relationHints: [],
      relatedNodeIds: [],
      ownerCharacterId: toText(character.id),
      isRecallable: true
    } satisfies BrainRecallCandidateCard))
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateKey(date: Date): string {
  return formatActivationDateKey(date)
}

function minutesToTimeText(value: number): string {
  const normalized = ((value % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${padDatePart(hours)}:${padDatePart(minutes)}`
}

function compareDateParts(ruleDate: string, now: Date, recurrence: string): boolean {
  const match = String(ruleDate || '').trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/u)
  if (!match) return recurrence !== 'once'
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (recurrence === 'daily') return true
  if (recurrence === 'weekly') {
    const source = new Date(year, month - 1, day)
    if (Number.isNaN(source.getTime())) return false
    return source.getDay() === now.getDay()
  }
  if (recurrence === 'monthly') return day === now.getDate()
  if (recurrence === 'yearly') return month === now.getMonth() + 1 && day === now.getDate()
  return formatActivationDateKey(now) === `${year}-${padDatePart(month)}-${padDatePart(day)}`
}

function matchArrangementTimeWindow(rule: NonNullable<CharacterBrainTraceNode['activationRule']>, now: Date): {
  active: boolean
  text?: string
} {
  const start = timeToMinutes(rule.startTime)
  const end = timeToMinutes(rule.endTime)
  const prewarm = Math.max(0, Number(rule.prewarmMinutes || 0) || 0)
  const grace = Math.max(0, Number(rule.graceMinutes || 0) || 0)
  if (start === null && end === null) return { active: true }
  const current = minutesOfDay(now)
  const startWithPrewarm = start === null ? null : start - prewarm
  const endWithGrace = end === null ? null : end + grace
  const active = startWithPrewarm !== null && endWithGrace !== null
    ? startWithPrewarm <= endWithGrace
      ? current >= startWithPrewarm && current <= endWithGrace
      : current >= startWithPrewarm || current <= endWithGrace
    : startWithPrewarm !== null
      ? current >= startWithPrewarm
      : endWithGrace !== null
        ? current <= endWithGrace
        : true
  const startText = start === null ? '' : minutesToTimeText(start)
  const endText = end === null ? '' : minutesToTimeText(end)
  return {
    active,
    text: [startText, endText].filter(Boolean).join('-') || undefined
  }
}

function resolveTraceArrangementActivation(
  node: CharacterBrainTraceNode,
  now: Date
): BrainRecallCandidateCard['scheduleActivation'] | undefined {
  if (node.systemRole !== 'arrangementLeaf' || !node.activationRule) return undefined
  const rule = node.activationRule
  const recurrence = rule.recurrence || 'once'
  if (!compareDateParts(rule.date || node.pointDate || node.startDate, now, recurrence)) return undefined
  const windowMatch = matchArrangementTimeWindow(rule, now)
  if (!windowMatch.active) return undefined
  const priority = node.recallPolicy?.priority === 'must' ? 'must' : 'normal'
  const level = node.recallPolicy?.level === 'body' ? 'body' : 'summary'
  const reason = [
    recurrence === 'once' ? '日期命中' : `重复规则命中：${recurrence}`,
    windowMatch.text ? `时间段：${windowMatch.text}` : '全天有效',
    priority === 'must' ? '必须召回' : ''
  ].filter(Boolean).join('；')
  return {
    active: true,
    score: priority === 'must' ? 1 : 0.72,
    reason,
    priority,
    level,
    currentDateText: formatDateKey(now),
    timeWindowText: windowMatch.text
  }
}

function buildCoreRetrievalProfileText(nodeId: string, cardTitle: string, compilePage: {
  summary?: string
  tags?: string[]
  relationHints?: string[]
}): string {
  const baseline = BASELINE_RECALL_CORE_PROFILES[nodeId]
  if (!baseline) return ''
  return [
    `单位：${cardTitle}`,
    `检索画像：${baseline.profile}`,
    compilePage.summary ? `正文摘要：${compilePage.summary}` : '',
    compilePage.tags?.length ? `标签：${compilePage.tags.join('、')}` : '',
    compilePage.relationHints?.length ? `关系提示：${compilePage.relationHints.join('；')}` : ''
  ].filter(Boolean).join('\n')
}

function pickCompileScore(compilePage?: {
  scoreDirectBase?: number
  scoreExpandBase?: number
  scoreSelfAnchor?: number
  scoreUserAnchor?: number
  scoreOtherAnchor?: number
} | null): BrainRecallCandidateCard['compileScore'] {
  if (!compilePage) return undefined
  return {
    scoreDirectBase: compilePage.scoreDirectBase,
    scoreExpandBase: compilePage.scoreExpandBase,
    scoreSelfAnchor: compilePage.scoreSelfAnchor,
    scoreUserAnchor: compilePage.scoreUserAnchor,
    scoreOtherAnchor: compilePage.scoreOtherAnchor
  }
}

function buildObservableAppearanceCards(
  character: Character,
  sources: ObservableProfileSource[] = []
): BrainRecallCandidateCard[] {
  const currentCharacterId = toText(character.id).trim()
  const seen = new Set<string>()
  return sources
    .map((source) => {
      const subjectId = toText(source.id).trim()
      const appearance = toText(source.appearance).trim()
      const subjectName = toText(source.name, source.subjectType === 'user' ? '用户' : '角色').trim()
      if (!subjectId || !appearance || !subjectName) return null
      if (source.subjectType === 'character' && subjectId === currentCharacterId) return null
      const cardId = `observable:${source.subjectType}:${subjectId}:appearance`
      if (seen.has(cardId)) return null
      seen.add(cardId)
      const nicknames = splitNameLikeTerms(source.nicknames)
      const tags = uniqueStrings([
        '可观察资料',
        '外貌',
        source.subjectType === 'user' ? '用户' : '角色',
        source.inScene ? '同场对象' : '',
        subjectName,
        ...nicknames
      ], 10)
      const summary = `${subjectName}的可观察外貌：${appearance}`
      return {
        id: cardId,
        k: 'observable_profile' as const,
        p: `/${toText(character.name, '角色')}/可观察资料/${subjectName}/外貌`,
        t: `${subjectName}的外貌`,
        s: summary,
        tags,
        u: new Date(0).toISOString(),
        relationHints: [],
        relatedNodeIds: [],
        retrievalProfileText: [
          `单位：${subjectName}的外貌`,
          '检索画像：这是当前角色可直接观察到的他者外貌资料。适用于当下在场对象、面对面互动、视觉呈现、身体描写和外观一致性判断。',
          `观察对象：${subjectName}`,
          `对象类型：${source.subjectType === 'user' ? '用户' : '角色'}`,
          source.inScene ? '场景关系：当前同场或当前对话直接对象。' : '',
          `正文摘要：${summary}`
        ].filter(Boolean).join('\n'),
        baselineRecallBoost: source.inScene ? 0.18 : 0.1,
        evidenceReasons: ['observable_profile'],
        bodyText: appearance,
        ownerCharacterId: currentCharacterId,
        subjectId,
        subjectType: source.subjectType,
        isRecallable: true
      } satisfies BrainRecallCandidateCard
    })
    .filter(Boolean) as BrainRecallCandidateCard[]
}

export function readCharacterBrainCandidateChanges(character: Character): CharacterBrainCandidateChange[] {
  return normalizeCandidateChanges(
    character.brainCandidateChanges ?? character.brain_candidate_changes,
    toText(character.id, '')
  )
}

export function buildCharacterBrainCandidateChangesChange(changes: CharacterBrainCandidateChange[]) {
  const normalized = normalizeCandidateChanges(changes, '')
  return {
    brainCandidateChanges: normalized,
    brain_candidate_changes: JSON.stringify(normalized)
  }
}

export function buildCharacterBrainCandidateChangeDrafts(
  character: Character,
  messages: ChatMessageLike[] = []
): CharacterBrainCandidateChange[] {
  const characterId = toText(character.id, '')
  const timestamp = new Date().toISOString()
  return (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .map((message, index) => ({ message, index, text: toText(message.content ?? message.text, '').trim() }))
    .filter((item) => item.text && isCandidateSignal(item.text))
    .map((item, index) => ({
      id: `candidate_${Date.now()}_${index}`,
      characterId,
      target: 'soul' as const,
      action: 'create' as const,
      title: item.text.slice(0, 32),
      summary: item.text.slice(0, 240),
      reason: '聊天中出现可长期影响角色理解的表达，先作为候选变更等待确认。',
      confidence: 0.62,
      impactScope: ['灵魂'],
      sourceLinks: [buildSourceLinkFromMessage(item.message, item.index)],
      status: 'pending' as const,
      createdAt: timestamp
    }))
}

export function acceptCharacterBrainCandidateChange(
  character: Character,
  candidateId: string
) {
  const candidates = readCharacterBrainCandidateChanges(character)
  const candidate = candidates.find((item) => item.id === candidateId)
  if (!candidate || candidate.status !== 'pending') return {}

  const timestamp = new Date().toISOString()
  const nodes = readCharacterBrainCognitionNodes(character)
  const nextNode: CharacterBrainCognitionNode = {
    id: buildNodeIdFromCandidate(candidate),
    title: candidate.title,
    summary: candidate.summary,
    parentId: 'brain:cognition',
    kind: candidate.target === 'public_reference' ? 'reference' : 'private',
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const nextCandidates = candidates.map((item) => (
    item.id === candidateId ? { ...item, status: 'accepted' as const } : item
  ))

  return {
    ...buildCharacterBrainCognitionNodesChange([...nodes, nextNode]),
    ...buildCharacterBrainCandidateChangesChange(nextCandidates)
  }
}

export function rejectCharacterBrainCandidateChange(
  character: Character,
  candidateId: string
) {
  const nextCandidates = readCharacterBrainCandidateChanges(character).map((item) => (
    item.id === candidateId ? { ...item, status: 'rejected' as const } : item
  ))
  return buildCharacterBrainCandidateChangesChange(nextCandidates)
}

export function buildCharacterBrainRecallCandidateCards(
  character: Character,
  documents: BrainDocumentRecord[] = [],
  options: RecallCandidateBuildOptions = {}
): BrainRecallCandidateCard[] {
  const readContext = options.readContext || createCharacterBrainReadContext(character)
  const coreCards = RECALLABLE_CORE_NODE_IDS
    .map((nodeId) => {
      const card = buildCharacterBrainCard(character, nodeId, readContext)
      const compilePage = readCharacterBrainCompilePage(character, nodeId, readContext)
      if (!card || !compilePage) return null
      const baselineProfile = BASELINE_RECALL_CORE_PROFILES[nodeId]
      return {
        id: nodeId,
        k: 'character_core' as const,
        p: `/${toText(character.name, '角色')}/核心/${card.title}`,
        t: card.title,
        s: compilePage.summary,
        tags: compilePage.tags,
        u: compilePage.updatedAt,
        recallPriorityMark: compilePage.recallPriorityMark,
        relationHints: compilePage.relationHints || [],
        relatedNodeIds: [],
        retrievalProfileText: buildCoreRetrievalProfileText(nodeId, card.title, compilePage),
        baselineRecallBoost: baselineProfile?.boost || 0,
        compileScore: pickCompileScore(compilePage),
        evidenceReasons: baselineProfile ? ['baseline_core_guard'] : [],
        ownerCharacterId: toText(character.id),
        structureRuntimeId: nodeId,
        parentRuntimeId: CORE_RECALL_PARENT_BY_NODE_ID[nodeId],
        structureDepth: CORE_RECALL_PARENT_BY_NODE_ID[nodeId] === 'brain:see_me' ? 2 : 3,
        structureChildCount: CORE_RECALL_CHILD_COUNT_BY_NODE_ID[nodeId] || 0,
        treeSource: 'fieldTree',
        isRecallable: true
      } satisfies BrainRecallCandidateCard
    })
    .filter(Boolean) as BrainRecallCandidateCard[]

  const cognitionCards = readContext.cognitionNodes
    .map((node) => {
      const compilePage = readCharacterBrainCompilePage(character, node.id, readContext)
      const childCount = readContext.childCountByParentId.get(node.id) || 0
      // 关系认知节点：把 content 里的关系画像 JSON 转成可读文本作为召回正文，绝不让 JSON 原文进召回/提示词
      const relationProfile = node.kind === 'relation' ? parseRelationProfileContent(node.content) : null
      const relationBody = relationProfile ? formatRelationProfileForRecall(relationProfile) : undefined
      return {
        id: node.id,
        k: 'character_soul',
        p: node.sourceDisplayPath || `/${toText(character.name, '角色')}/灵魂/${node.title}`,
        t: node.title,
        s: compilePage?.summary || node.summary,
        tags: compilePage?.tags || [],
        u: compilePage?.updatedAt || node.updatedAt,
        recallPriorityMark: compilePage?.recallPriorityMark,
        src: node.sourceDocumentId ? [node.sourceDocumentId] : [],
        relationHints: compilePage?.relationHints || [],
        relatedNodeIds: [],
        compileScore: pickCompileScore(compilePage),
        bodyText: relationBody,
        ownerCharacterId: toText(character.id),
        isRecallable: true,
        structureRuntimeId: node.id,
        parentRuntimeId: node.parentId || undefined,
        structureChildCount: childCount
      } satisfies BrainRecallCandidateCard
    }) as BrainRecallCandidateCard[]

  const traceCards = readContext.traceNodes
    .map((node) => {
      const compilePage = readCharacterBrainCompilePage(character, node.id, readContext)
      if (!compilePage) return null
      const isTraceArrangement = node.systemRole === 'arrangementLeaf'
      const scheduleActivation = isTraceArrangement
        ? resolveTraceArrangementActivation(node, options.currentDate || new Date())
        : undefined
      const bodyText = isTraceArrangement ? (node.content || node.note || '') : ''
      const summaryText = compilePage.summary || (isTraceArrangement ? bodyText : '')
      return {
        id: node.id,
        k: isTraceArrangement ? 'character_arrangement' as const : 'character_trace' as const,
        p: `/${toText(character.name, '角色')}/轨迹/${node.title}`,
        t: node.title,
        s: summaryText,
        tags: compilePage.tags,
        u: compilePage.updatedAt,
        recallPriorityMark: compilePage.recallPriorityMark,
        eventDate: node.startDate || node.pointDate,
        relationHints: compilePage.relationHints || [],
        relatedNodeIds: [],
        compileScore: pickCompileScore(compilePage),
        scheduleActivation,
        evidenceReasons: scheduleActivation ? ['schedule_activation'] : [],
        bodyText: isTraceArrangement ? (bodyText || compilePage.summary || '') : undefined,
        ownerCharacterId: toText(character.id),
        isRecallable: true
      } satisfies BrainRecallCandidateCard
    })
    .filter(Boolean) as BrainRecallCandidateCard[]

  const candidateCards = options.includeCandidateChanges === false
    ? []
    : readCharacterBrainCandidateChanges(character)
      .filter((item) => item.status === 'pending')
      .map((item) => ({
      id: item.id,
      k: 'candidate_change' as const,
      p: `/${toText(character.name, '角色')}/候选变更`,
      t: item.title,
      s: item.summary,
      tags: item.impactScope,
      u: item.createdAt,
      imp: item.confidence,
      src: item.sourceLinks.map((link) => link.sourceId),
      relationHints: [],
      relatedNodeIds: [],
      ownerCharacterId: toText(character.id),
      isRecallable: true
      } satisfies BrainRecallCandidateCard)) as BrainRecallCandidateCard[]

  const arrangementCards = buildArrangementCards(character, options.currentDate || new Date())
  const observableAppearanceCards = options.includeObservableProfiles === false
    ? []
    : buildObservableAppearanceCards(character, options.observableProfiles || [])

  const result = [...coreCards, ...cognitionCards, ...traceCards, ...arrangementCards, ...candidateCards, ...observableAppearanceCards]
    .filter((item): item is BrainRecallCandidateCard => Boolean(item && (item.s || item.bodyText || item.scheduleActivation?.active)))
    .sort((left, right) => String(right.u || '').localeCompare(String(left.u || '')))

  // 预编译 [[文档名]] → relatedNodeIds，避免召回时临时做标题匹配
  const titleToId = new Map(result.map((c) => [c.t, c.id]))
  for (const card of result) {
    const ids: string[] = []
    for (const hint of card.relationHints) {
      for (const m of hint.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const title = m[1].trim()
        const id = titleToId.get(title)
        if (id && id !== card.id && !ids.includes(id)) ids.push(id)
      }
    }
    if (ids.length) card.relatedNodeIds = ids
  }

  const structureView = options.docLibraryStructure
    ? buildDocLibraryRecallStructureView(documents, options.docLibraryStructure)
    : null
  return applyDocLibraryRecallStructureToCards(result, structureView)
}

export function buildCharacterBrainRecallPromptBlock(
  character: Character,
  documents: BrainDocumentRecord[] = [],
  limit = 8,
  options: RecallCandidateBuildOptions = {}
): string {
  const cards = buildCharacterBrainRecallCandidateCards(character, documents, options)
    .filter((card) => card.k !== 'candidate_change')
    .slice(0, limit)
  if (!cards.length) return ''
  return buildCleanRecallPromptBlock(toText(character.name, '未命名角色'), cards)
}
