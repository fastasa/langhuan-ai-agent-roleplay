import type {
  BrainDocumentRecord,
  BrainRecallCandidateCard,
  Character,
  DocLibraryTreeDiffReport,
  DocTreeNodeRecord,
  DocTreeOrders
} from '../types'
import type {
  UnitContentPort,
  UnitContentPortDomain,
  UnitContentEffectiveVersion,
  UnitContentPortKind
} from '../types/unitContentPort'
import type { UnitView, UnitViewCompilePage } from '../types/unitView'
import type { CharacterBrainCognitionNode, CharacterBrainFieldKey, CharacterBrainTraceNode } from '../types/characterBrain'
import {
  readCharacterBrainCognitionNodes,
  readCharacterBrainCompilePage,
  readCharacterBrainDocument,
  readCharacterBrainTraceNodes
} from './characterBrain'
import { buildCharacterBrainUnitView, buildDocLibraryUnitView } from './unitViewAdapters'

const CORE_RECALLABLE_SOURCE_IDS = new Set([
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
])

const CORE_WRITABLE_FIELD_SOURCE_IDS = new Set([
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
const CORE_DOCUMENT_FIELD_SOURCE_IDS = new Set(CORE_WRITABLE_FIELD_SOURCE_IDS)

const CORE_FIELD_BY_SOURCE_ID: Record<string, CharacterBrainFieldKey> = {
  'brain:name': 'name',
  'brain:gender': 'gender',
  'brain:age': 'age',
  'brain:emoji': 'emoji',
  'brain:avatar_path': 'avatarPath',
  'brain:nicknames': 'nicknames',
  'brain:desc': 'desc',
  'brain:default_preset': 'defaultPreset',
  'brain:default_model': 'defaultModel',
  'brain:appearance': 'appearance',
  'brain:speaking_style': 'speakingStyle',
  'brain:outfit': 'outfit',
  'brain:personality': 'personality',
  'brain:hobbies': 'hobbies',
  'brain:abilities': 'abilities',
  'brain:experience': 'experience',
  'brain:worldview': 'worldview',
  'brain:background': 'background'
}

const CORE_FIELD_LABELS: Record<CharacterBrainFieldKey, string> = {
  name: '姓名',
  gender: '性别',
  age: '年龄',
  emoji: 'Emoji',
  avatarPath: '头像路径',
  avatar: '头像',
  basicInfo: '系统信息',
  preset: '预设',
  defaultPreset: '默认预设',
  defaultModel: '默认模型',
  nicknames: '昵称',
  appearance: '外貌特征',
  speakingStyle: '说话风格',
  outfit: '穿着',
  personality: '性格',
  hobbies: '爱好',
  abilities: '能力',
  experience: '经历',
  worldview: '世界观',
  background: '背景故事',
  desc: '简介'
}

function toText(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    } catch {
      // fall through to delimiter parsing
    }
    return trimmed.split(/[\n,，]+/u).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return value.split(/[;\n]/u).map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function normalizeCompilePage(page?: UnitViewCompilePage | null): UnitViewCompilePage | undefined {
  if (!page) return undefined
  const summary = toText(page.summary).trim()
  const tags = normalizeStringList(page.tags)
  const relationHints = normalizeStringList(page.relationHints)
  if (!summary && !tags.length && !relationHints.length) return undefined
  return {
    summary,
    tags,
    relationHints,
    updatedAt: toText(page.updatedAt).trim() || undefined
  }
}

function hasCompilePage(page?: UnitViewCompilePage): boolean {
  return Boolean(page && (page.summary || page.tags.length || page.relationHints.length))
}

function createPort(input: Omit<UnitContentPort, 'hasBody' | 'effectiveVersion'>): UnitContentPort {
  const body = toText(input.body).trim()
  const formText = toText(input.formText).trim()
  const hasBodyValue = Boolean(body || formText)
  const effectiveVersion = input.pendingVersion?.pending || {
    title: input.title,
    summary: input.summary,
    body: body || formText,
    formText: formText || undefined,
    compilePage: input.hasCompilePage
      ? {
          summary: input.summary,
          tags: input.tags,
          relationHints: input.relationHints
        }
      : undefined
  }
  return {
    ...input,
    body,
    formText: formText || undefined,
    hasBody: hasBodyValue,
    effectiveVersion
  }
}

function unitDomain(unit: UnitView): UnitContentPortDomain {
  if (unit.domain === 'docLibrary') return 'docLibrary'
  if (unit.domain === 'trace' || unit.unitType === 'trace' || unit.unitType === 'traceDay' || unit.unitType === 'traceGroup' || unit.unitType === 'traceEvent' || unit.unitType === 'traceArrangement') {
    return 'characterTrace'
  }
  if (unit.unitType === 'soul' || unit.unitType === 'soulNode') return 'characterSoul'
  return 'characterCore'
}

function unitContentKind(unit: UnitView, cognitionNode?: CharacterBrainCognitionNode): UnitContentPortKind {
  if (unit.contentKind === 'system') return 'system'
  if (unit.contentKind === 'form') return 'form'
  if (unit.contentKind === 'group') return 'group'
  return 'markdown'
}

function readCharacterField(character: Character, fieldKey: CharacterBrainFieldKey): string {
  switch (fieldKey) {
    case 'avatarPath':
      return toText(character.avatarPath ?? character.avatar_path).trim()
    case 'defaultPreset':
      return toText(character.defaultPreset ?? character.default_preset).trim()
    case 'defaultModel':
      return toText(character.defaultModel ?? character.default_model).trim()
    case 'speakingStyle':
      return toText(character.speakingStyle ?? character.speaking_style).trim()
    case 'nicknames':
      return normalizeStringList(character.nicknames).join('，')
    default:
      return toText(character[fieldKey as keyof Character]).trim()
  }
}

function line(label: string, value: string): string {
  const text = String(value || '').trim()
  return text ? `${label}：${text}` : ''
}

function buildBasicInfoFormText(character: Character): string {
  return [
    line('姓名', readCharacterField(character, 'name')),
    line('性别', readCharacterField(character, 'gender')),
    line('年龄', readCharacterField(character, 'age')),
    line('昵称', readCharacterField(character, 'nicknames')),
    line('简介', readCharacterField(character, 'desc'))
  ].filter(Boolean).join('\n')
}

function buildSystemInfoFormText(character: Character): string {
  return [
    line('姓名', readCharacterField(character, 'name')),
    line('性别', readCharacterField(character, 'gender')),
    line('年龄', readCharacterField(character, 'age')),
    line('昵称', readCharacterField(character, 'nicknames')),
    line('Emoji', readCharacterField(character, 'emoji')),
    line('头像路径', readCharacterField(character, 'avatarPath')),
    line('默认预设', readCharacterField(character, 'defaultPreset')),
    line('默认模型', readCharacterField(character, 'defaultModel'))
  ].filter(Boolean).join('\n')
}

function buildDetailInfoFormText(character: Character): string {
  return ([
    'appearance',
    'speakingStyle',
    'outfit',
    'hobbies',
    'abilities',
    'experience',
    'worldview',
    'background'
  ] as CharacterBrainFieldKey[])
    .map((fieldKey) => line(CORE_FIELD_LABELS[fieldKey], readCharacterField(character, fieldKey)))
    .filter(Boolean)
    .join('\n')
}

function buildCoreFormText(character: Character, sourceId: string): string {
  if (sourceId === 'brain:basic_info') return buildBasicInfoFormText(character)
  if (sourceId === 'brain:system_info') return buildSystemInfoFormText(character)
  if (sourceId === 'brain:detail_info') return buildDetailInfoFormText(character)
  const fieldKey = CORE_FIELD_BY_SOURCE_ID[sourceId]
  if (!fieldKey) return ''
  return line(CORE_FIELD_LABELS[fieldKey], readCharacterField(character, fieldKey))
}

function buildCoreDocumentBody(character: Character, sourceId: string): string {
  if (!CORE_DOCUMENT_FIELD_SOURCE_IDS.has(sourceId)) return ''
  const storedDocument = readCharacterBrainDocument(character, sourceId).trim()
  if (storedDocument) return storedDocument
  const fieldKey = CORE_FIELD_BY_SOURCE_ID[sourceId]
  return fieldKey ? readCharacterField(character, fieldKey) : ''
}

function childSummaryIndex(port: UnitContentPort, ports: UnitContentPort[]): string {
  const children = ports
    .filter((item) => item.parentId === port.unitId)
    .map((item) => {
      const summary = item.summary || item.formText || item.body
      return summary ? `- ${item.title}：${summary}` : `- ${item.title}`
    })
  return children.join('\n')
}

function createVersion(input: {
  title: string
  summary: string
  body?: string
  formText?: string
  compilePage?: UnitViewCompilePage
}): UnitContentEffectiveVersion {
  const body = toText(input.body ?? input.formText).trim()
  const formText = toText(input.formText).trim()
  return {
    title: toText(input.title).trim(),
    summary: toText(input.summary).trim(),
    body,
    formText: formText || undefined,
    compilePage: input.compilePage
  }
}

function buildCognitionPendingVersion(
  node: CharacterBrainCognitionNode | undefined,
  current: UnitContentEffectiveVersion
): UnitContentPort['pendingVersion'] {
  if (!node?.pendingReview) return undefined
  const previous = node.pendingReview.previous
  return {
    mode: node.pendingReview.mode,
    confirmed: previous
      ? createVersion({
          title: previous.title,
          summary: previous.summary,
          body: previous.content
        })
      : undefined,
    pending: current,
    reason: node.pendingReview.reason,
    createdAt: node.pendingReview.createdAt,
    createdBy: node.pendingReview.createdBy
  }
}

function buildTracePendingVersion(
  node: CharacterBrainTraceNode | undefined,
  current: UnitContentEffectiveVersion
): UnitContentPort['pendingVersion'] {
  if (!node?.pendingReview && node?.confirmed !== false) return undefined
  const previous = node?.pendingReview?.previous
  return {
    mode: node?.pendingReview?.mode === 'update' ? 'update' : 'create',
    confirmed: previous
      ? createVersion({
          title: previous.title,
          summary: previous.summary,
          body: previous.content
        })
      : undefined,
    pending: current,
    reason: node?.pendingReview?.reason,
    createdAt: node?.pendingReview?.createdAt,
    createdBy: node?.pendingReview?.createdBy
  }
}

function finalizeGroupBodies(ports: UnitContentPort[]): UnitContentPort[] {
  return ports.map((port) => {
    if (port.hasBody || port.contentKind !== 'group') return port
    const body = childSummaryIndex(port, ports)
    if (!body) return port
    return createPort({
      ...port,
      body
    })
  })
}

export function buildDocLibraryContentPorts(
  documents: BrainDocumentRecord[],
  manualTreeOrders: Record<string, string[]> = {},
  options: {
    treeNodes?: DocTreeNodeRecord[]
    treeOrders?: DocTreeOrders
    treeDiffReport?: DocLibraryTreeDiffReport
  } = {}
): UnitContentPort[] {
  const unitView = buildDocLibraryUnitView(documents, manualTreeOrders, options)
  const ports = unitView.units.map((unit) => {
    const compilePage = normalizeCompilePage(unit.compilePage)
    const summary = compilePage?.summary || ''
    return createPort({
      unitId: unit.unitId,
      sourceId: unit.sourceId || unit.unitId,
      domain: 'docLibrary',
      contentKind: unit.contentKind === 'group' ? 'group' : 'markdown',
      title: unit.title,
      parentId: unit.parentId,
      sourcePath: unit.sourcePath,
      summary,
      tags: compilePage?.tags || [],
      relationHints: compilePage?.relationHints || [],
      body: unit.body || '',
      hasCompilePage: hasCompilePage(compilePage),
      recallableInChat: false,
      browsable: true,
      importableToBrain: unit.unitType !== 'root',
      writableByAI: false,
      metadata: unit.metadata
    })
  })
  return finalizeGroupBodies(ports)
}

export function buildCharacterArrangementContentPorts(character: Character): UnitContentPort[] {
  const characterId = toText(character.id, 'unknown').trim() || 'unknown'
  const schedule = parseObject(character.schedule)
  const yearlySchedule = parseArray(character.yearlySchedule ?? character.yearly_schedule)
  const currentActivities = parseArray(character.currentActivities ?? character.current_activities)
  const ports: UnitContentPort[] = []

  const dailyLines = Object.entries(schedule).flatMap(([day, rawSlots]) => (
    Array.isArray(rawSlots)
      ? rawSlots.map((slot) => {
          const record = parseObject(slot)
          const time = [record.startTime, record.endTime].map((item) => toText(item).trim()).filter(Boolean).join('-')
          const activity = toText(record.activity).trim()
          const location = toText(record.location).trim()
          return [day, time, activity, location].filter(Boolean).join(' / ')
        })
      : []
  )).filter(Boolean)

  if (dailyLines.length) {
    ports.push(createArrangementPort(characterId, 'daily', '日常安排', dailyLines.join('\n'), ['安排', '日常']))
  }

  const yearlyLines = yearlySchedule.map((item) => {
    const record = parseObject(item)
    const start = toText(record.startMonth).trim()
    const end = toText(record.endMonth).trim()
    const activity = toText(record.activity).trim()
    return [`${start}${end ? `-${end}` : ''}月`, activity].filter(Boolean).join(' / ')
  }).filter(Boolean)
  if (yearlyLines.length) {
    ports.push(createArrangementPort(characterId, 'yearly', '年度安排', yearlyLines.join('\n'), ['安排', '年度']))
  }

  const currentLines = currentActivities.map((item) => toText(item).trim()).filter(Boolean)
  if (currentLines.length) {
    ports.push(createArrangementPort(characterId, 'current', '近期安排', currentLines.join('\n'), ['安排', '近期']))
  }

  return ports
}

function createArrangementPort(
  characterId: string,
  key: string,
  title: string,
  body: string,
  tags: string[]
): UnitContentPort {
  return createPort({
    unitId: `arrangement:${encodeURIComponent(characterId)}:${key}`,
    sourceId: `brain:arrangement:${key}`,
    domain: 'characterArrangement',
    contentKind: 'schedule',
    title,
    summary: body.split('\n').slice(0, 3).join('；'),
    tags,
    relationHints: [],
    body,
    hasCompilePage: false,
    recallableInChat: true,
    browsable: true,
    importableToBrain: false,
    writableByAI: true,
    metadata: { characterId, arrangementKey: key }
  })
}

export function buildCharacterBrainContentPorts(
  character: Character,
  documents: BrainDocumentRecord[] = []
): UnitContentPort[] {
  const unitView = buildCharacterBrainUnitView(character)
  const cognitionById = new Map(readCharacterBrainCognitionNodes(character).map((node) => [node.id, node]))
  const traceById = new Map(readCharacterBrainTraceNodes(character).map((node) => [node.id, node]))

  const ports = unitView.units
    .filter((unit) => unit.unitType !== 'character')
    .map((unit) => {
      const sourceId = unit.sourceId || unit.unitId
      const cognitionNode = cognitionById.get(sourceId)
      const traceNode = traceById.get(sourceId)
      const characterCompilePage = normalizeCompilePage(
        unit.compilePage || readCharacterBrainCompilePage(character, sourceId)
      )
      const compilePage = characterCompilePage
      const domain = unitDomain(unit)
      const formText = domain === 'characterCore' ? buildCoreFormText(character, sourceId) : ''
      const coreDocumentBody = domain === 'characterCore' ? buildCoreDocumentBody(character, sourceId) : ''
      const traceBody = traceNode ? (traceNode.content || traceNode.note || '') : ''
      const body = traceBody || coreDocumentBody || (domain === 'characterCore' ? '' : unit.body || '')
      const currentVersion = createVersion({
        title: unit.title,
        summary: compilePage?.summary || unit.compilePage?.summary || '',
        body,
        formText,
        compilePage: compilePage
          ? {
              summary: compilePage.summary,
              tags: compilePage.tags,
              relationHints: compilePage.relationHints
            }
          : undefined
      })
      const isCoreRecallable = domain === 'characterCore' && CORE_RECALLABLE_SOURCE_IDS.has(sourceId)
      const isSoulNode = domain === 'characterSoul' && unit.unitType === 'soulNode'
      const isTraceNode = domain === 'characterTrace' && (unit.unitType === 'traceDay' || unit.unitType === 'traceGroup' || unit.unitType === 'traceEvent' || unit.unitType === 'traceArrangement')
      const pendingVersion = buildCognitionPendingVersion(cognitionNode, currentVersion)
        || buildTracePendingVersion(traceNode, currentVersion)
      return createPort({
        unitId: unit.unitId,
        sourceId,
        domain,
        contentKind: domain === 'characterCore' && CORE_DOCUMENT_FIELD_SOURCE_IDS.has(sourceId)
          ? 'markdown'
          : unitContentKind(unit, cognitionNode),
        title: unit.title,
        parentId: unit.parentId,
        sourcePath: unit.sourcePath,
        summary: compilePage?.summary || unit.compilePage?.summary || '',
        tags: compilePage?.tags || [],
        relationHints: compilePage?.relationHints || [],
        body,
        formText,
        hasCompilePage: hasCompilePage(compilePage),
        recallableInChat: isCoreRecallable || isSoulNode || isTraceNode,
        browsable: true,
        importableToBrain: false,
        writableByAI: (
          (domain === 'characterCore' && CORE_WRITABLE_FIELD_SOURCE_IDS.has(sourceId))
          || isSoulNode
          || unit.unitType === 'traceDay'
          || unit.unitType === 'traceEvent'
          || unit.unitType === 'traceArrangement'
        ),
        pendingVersion,
        metadata: {
          ...unit.metadata,
          pendingReview: Boolean(pendingVersion),
          sourceDocumentId: cognitionNode?.sourceDocumentId
        }
      })
    })

  return finalizeGroupBodies([...ports, ...buildCharacterArrangementContentPorts(character)])
}

export function resolveRecallContentPort(
  character: Character,
  documents: BrainDocumentRecord[],
  card: BrainRecallCandidateCard
): UnitContentPort | null {
  if (card.k === 'candidate_change') return null
  const characterPorts = buildCharacterBrainContentPorts(character, documents)
  const direct = characterPorts.find((port) => port.sourceId === card.id || port.unitId === card.id)
  if (direct) return direct

  if (card.k === 'public_compile_page') {
    const documentId = card.id.startsWith('compile:')
      ? card.id.replace(/^compile:/u, '')
      : card.src?.[0] || ''
    const documentPorts = buildDocLibraryContentPorts(documents)
    return documentPorts.find((port) => port.sourceId === documentId || port.unitId === `doc:${encodeURIComponent(documentId).replace(/%/g, '~')}`) || null
  }

  return null
}

export function readRecallContentText(
  character: Character,
  documents: BrainDocumentRecord[],
  card: BrainRecallCandidateCard
): string {
  if (card.bodyText) return card.bodyText
  const port = resolveRecallContentPort(character, documents, card)
  if (!port) return ''
  return port.effectiveVersion.body || port.body || port.formText || ''
}
