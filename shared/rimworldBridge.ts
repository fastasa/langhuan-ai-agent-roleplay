export const RIMWORLD_BRIDGE_SCHEMA_VERSION = 1 as const
export const RIMWORLD_ACTION_SCHEMA_VERSION = 2 as const

export type RimWorldPassion = 'none' | 'minor' | 'major'
export type RimWorldModelSlotId = 'fast' | 'balanced' | 'smart'
export type RimWorldActionKind = 'set_work_priority'
export type RimWorldWorkSelectionMode = 'best' | 'explicit'
export type RimWorldActionStatus = 'succeeded' | 'already_satisfied' | 'rejected' | 'failed'

export const RIMWORLD_ACTION_KIND: RimWorldActionKind = 'set_work_priority'

export const RIMWORLD_MODEL_SLOT_IDS: readonly RimWorldModelSlotId[] = [
  'fast',
  'balanced',
  'smart'
]

export type RimWorldModelOptionV1 = {
  slotId: RimWorldModelSlotId
  label: string
  model: string
}

export type RimWorldPawnSnapshotV1 = {
  schemaVersion: 1
  worldRef: string
  chatBranchRef: string
  pawnRef: string
  capturedAtTick: number
  gameTime: {
    year: number
    quadrum: string
    dayOfQuadrum: number
    hour: number
    label: string
  }
  identity: {
    name: string
    gender: string
    biologicalAge: number
    chronologicalAge: number
    birthDate: {
      year: number
      quadrum: string
      quadrumIndex: number
      dayOfQuadrum: number
      label: string
    } | null
    childhood: string
    adulthood: string
    traits: string[]
  }
  current: {
    job: string
    location: string
    mood: number | null
    health: string
    needs: Array<{ label: string; level: number }>
  }
  skills: Array<{
    defName: string
    label: string
    level: number
    passion: RimWorldPassion
  }>
  workTypes: Array<{
    defName: string
    label: string
    disabled: boolean
    priority: number | null
    relevantSkills: string[]
  }>
  origin: {
    isStartingColonist: boolean
    scenarioName: string
    scenarioText: string
  }
}

export type RimWorldBindingV1 = {
  characterId: string
  sessionId: string
  characterName: string
  historyMessageId: number
  modelUsageSlotId: RimWorldModelSlotId
}

export type RimWorldBridgeChatMessageV1 = {
  id: number
  role: 'user' | 'assistant'
  speaker: string
  content: string
  time: string
}

export type RimWorldActionRequestV2 = {
  schemaVersion: 2
  requestId: string
  kind: RimWorldActionKind
  worldRef: string
  pawnRef: string
  userMessageId: number
  selectionMode: RimWorldWorkSelectionMode
  workTypeDefName: string
  workTypeLabel: string
  targetPriority: number
}

export type RimWorldActionReceiptV2 = {
  schemaVersion: 2
  requestId: string
  kind: RimWorldActionKind
  status: RimWorldActionStatus
  workTypeDefName: string
  workTypeLabel: string
  selectionReason: string
  beforePriority: number | null
  afterPriority: number | null
  gameTime: RimWorldPawnSnapshotV1['gameTime']
  error: string
}

export type RimWorldBrainSectionV1 = 'core' | 'soul' | 'trace'

export type RimWorldBrainTreeNodeV1 = {
  nodeId: string
  parentId: string
  title: string
  section: RimWorldBrainSectionV1
  nodeType: 'branch' | 'leaf'
  orderIndex: number
  hasContent: boolean
  summary: string
}

export type RimWorldBrainNodeDetailV1 = {
  nodeId: string
  title: string
  section: RimWorldBrainSectionV1
  summary: string
  body: string
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function multilineText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function number(value: unknown, min: number, max: number, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function actionPriority(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4) throw new Error('动作回执优先级必须是 0 到 4 的整数')
  return parsed
}

export function normalizeRimWorldModelSlotId(value: unknown): RimWorldModelSlotId {
  const slotId = String(value ?? '').trim()
  if (!slotId) return 'fast'
  if (RIMWORLD_MODEL_SLOT_IDS.includes(slotId as RimWorldModelSlotId)) return slotId as RimWorldModelSlotId
  throw new Error(`不支持的环世界会话模型档位：${slotId}`)
}

export function normalizeRimWorldActionReceipt(value: unknown): RimWorldActionReceiptV2 {
  const source = record(value)
  if (Number(source.schemaVersion) !== RIMWORLD_ACTION_SCHEMA_VERSION) {
    throw new Error(`不支持的环世界动作回执协议版本：${String(source.schemaVersion ?? '') || '缺失'}`)
  }
  const requestId = text(source.requestId, 160)
  const kind = text(source.kind, 80)
  const status = text(source.status, 40)
  const gameTime = record(source.gameTime)
  if (!/^rw_action_[a-f0-9]{32}$/.test(requestId)) throw new Error('环世界动作回执缺少合法 requestId')
  if (kind !== RIMWORLD_ACTION_KIND) throw new Error(`不支持的环世界动作：${kind || '缺失'}`)
  if (!['succeeded', 'already_satisfied', 'rejected', 'failed'].includes(status)) {
    throw new Error(`不支持的环世界动作回执状态：${status || '缺失'}`)
  }
  const beforePriority = actionPriority(source.beforePriority)
  const afterPriority = actionPriority(source.afterPriority)
  const workTypeDefName = text(source.workTypeDefName, 120)
  const workTypeLabel = text(source.workTypeLabel, 160)
  if ((status === 'succeeded' || status === 'already_satisfied')
    && (!workTypeDefName || !workTypeLabel || beforePriority === null || afterPriority === null)) {
    throw new Error('成功动作回执必须包含目标工作与修改前后的真实优先级')
  }
  if (status === 'succeeded' && beforePriority === afterPriority) throw new Error('成功动作必须发生变化')
  if (status === 'already_satisfied' && beforePriority !== afterPriority) throw new Error('已满足动作的前后优先级必须一致')
  return {
    schemaVersion: RIMWORLD_ACTION_SCHEMA_VERSION,
    requestId,
    kind: RIMWORLD_ACTION_KIND,
    status: status as RimWorldActionStatus,
    workTypeDefName,
    workTypeLabel,
    selectionReason: text(source.selectionReason, 1000),
    beforePriority,
    afterPriority,
    gameTime: {
      year: Math.trunc(number(gameTime.year, -100000, 100000)),
      quadrum: text(gameTime.quadrum, 80),
      dayOfQuadrum: Math.trunc(number(gameTime.dayOfQuadrum, 1, 15, 1)),
      hour: Math.trunc(number(gameTime.hour, 0, 23)),
      label: text(gameTime.label, 160)
    },
    error: text(source.error, 1000)
  }
}

export function normalizeRimWorldPawnSnapshot(value: unknown): RimWorldPawnSnapshotV1 {
  const source = record(value)
  if (Number(source.schemaVersion) !== RIMWORLD_BRIDGE_SCHEMA_VERSION) {
    throw new Error(`不支持的环世界桥接协议版本：${String(source.schemaVersion ?? '') || '缺失'}`)
  }
  const worldRef = text(source.worldRef, 160)
  const chatBranchRef = text(source.chatBranchRef, 160) || 'legacy'
  const pawnRef = text(source.pawnRef, 160)
  const identity = record(source.identity)
  const current = record(source.current)
  const gameTime = record(source.gameTime)
  const birthDate = record(identity.birthDate)
  const origin = record(source.origin)
  const birthYear = Math.trunc(number(birthDate.year, 0, 100000, -1))
  const birthQuadrumIndex = Math.trunc(number(birthDate.quadrumIndex, 1, 4, 0))
  const birthDayOfQuadrum = Math.trunc(number(birthDate.dayOfQuadrum, 1, 15, 0))
  if (!worldRef || !pawnRef || !text(identity.name, 160)) {
    throw new Error('Pawn 快照缺少世界引用、Pawn 引用或姓名')
  }

  return {
    schemaVersion: RIMWORLD_BRIDGE_SCHEMA_VERSION,
    worldRef,
    chatBranchRef,
    pawnRef,
    capturedAtTick: Math.trunc(number(source.capturedAtTick, 0, Number.MAX_SAFE_INTEGER)),
    gameTime: {
      year: Math.trunc(number(gameTime.year, -100000, 100000)),
      quadrum: text(gameTime.quadrum, 80),
      dayOfQuadrum: Math.trunc(number(gameTime.dayOfQuadrum, 1, 15, 1)),
      hour: Math.trunc(number(gameTime.hour, 0, 23)),
      label: text(gameTime.label, 160)
    },
    identity: {
      name: text(identity.name, 160),
      gender: text(identity.gender, 80),
      biologicalAge: number(identity.biologicalAge, 0, 100000),
      chronologicalAge: number(identity.chronologicalAge, 0, 100000),
      birthDate: birthYear >= 0 && birthQuadrumIndex >= 1 && birthDayOfQuadrum >= 1
        ? {
            year: birthYear,
            quadrum: text(birthDate.quadrum, 80),
            quadrumIndex: birthQuadrumIndex,
            dayOfQuadrum: birthDayOfQuadrum,
            label: text(birthDate.label, 160)
          }
        : null,
      childhood: text(identity.childhood, 800),
      adulthood: text(identity.adulthood, 800),
      traits: stringList(identity.traits, 24, 160)
    },
    current: {
      job: text(current.job, 240),
      location: text(current.location, 240),
      mood: current.mood === null || current.mood === undefined ? null : number(current.mood, 0, 1),
      health: text(current.health, 240),
      needs: (Array.isArray(current.needs) ? current.needs : []).slice(0, 24).map((item) => {
        const need = record(item)
        return { label: text(need.label, 120), level: number(need.level, 0, 1) }
      }).filter((item) => item.label)
    },
    skills: (Array.isArray(source.skills) ? source.skills : []).slice(0, 64).map((item) => {
      const skill = record(item)
      const passion = text(skill.passion, 20)
      return {
        defName: text(skill.defName, 120),
        label: text(skill.label, 120),
        level: Math.trunc(number(skill.level, 0, 20)),
        passion: passion === 'major' || passion === 'minor' ? passion : 'none'
      } as RimWorldPawnSnapshotV1['skills'][number]
    }).filter((item) => item.label),
    workTypes: (Array.isArray(source.workTypes) ? source.workTypes : []).slice(0, 96).map((item) => {
      const work = record(item)
      return {
        defName: text(work.defName, 120),
        label: text(work.label, 120),
        disabled: Boolean(work.disabled),
        priority: work.priority === null || work.priority === undefined ? null : Math.trunc(number(work.priority, 0, 4)),
        relevantSkills: stringList(work.relevantSkills, 16, 120)
      }
    }).filter((item) => item.label),
    origin: {
      isStartingColonist: Boolean(origin.isStartingColonist),
      scenarioName: text(origin.scenarioName, 240),
      scenarioText: multilineText(origin.scenarioText, 12000)
    }
  }
}
