import {
  NARRATIVE_SEED_TYPES,
  NARRATIVE_SEED_VISIBILITY_MODES,
  validateCompleteNarrativeSeedAuthoring
} from '../../shared/narrativeSeedAuthoring'
import type { ChatImageAttachment } from '../utils/chatAttachments'
import { runWithConcurrencyPool } from '../utils/concurrencyPool'
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel
} from './agentRuntime/interactionContract'
import type { XingyiBatchCharacterOutcome } from './xingyiBatchCharacterTools'
import { UNIT_SEMANTIC_TYPES } from './unitSemanticTypes'

export type PlayableWorldDocument = {
  title: string
  body: string
  summary: string
  tags: string[]
  semanticType: string
}

export type PlayableWorldCharacter = {
  name: string
  brief: string
  avatarPrompt: string
}

export type PlayableWorldNarrativeSeed = {
  type: string
  title: string
  description: string
  cause: string
  currentProgress: string
  expectedOutcome: string
  startTime: string
  locationText: string
  impactScope: string
  status: 'dormant' | 'active'
  visibilityMode: string
  allowFrontstage: boolean
  participantNames: string[]
}

export type PlayableWorldBlueprint = {
  library: {
    title: string
    overview: string
    documents: PlayableWorldDocument[]
  }
  characters: PlayableWorldCharacter[]
  world: {
    name: string
    description: string
    matchKeywords: string[]
  }
  session: {
    title: string
    openingLocation: string
    avatarPrompt: string
  }
  narrativeSeeds: PlayableWorldNarrativeSeed[]
}

export type PlayableWorldRecord = {
  id: string
  name: string
  description?: string
}

export type PlayableWorldMatch = {
  world: PlayableWorldRecord
  score: number
  reason: string
}

export type PlayableWorldGeneratedCharacter = {
  id: string
  name: string
  requestedName: string
}

export type PlayableWorldBuildInspection = {
  world: { id: string; name: string }
  session: {
    id: string
    title: string
    worldId: string
    avatarReady: boolean
  }
  documentIds: string[]
  characters: Array<{
    id: string
    name: string
    participantId: string
    presenceState: string
    avatarReady: boolean
  }>
  narrativeSeeds: Array<{ id: string; title: string }>
}

export interface XingyiPlayableWorldBuilderProvider {
  createDocumentLibrary: (input: PlayableWorldBlueprint['library']) => Promise<{
    rootPath: string
    documentIds: string[]
  }>
  generateCharacter: (input: { requestedName: string; brief: string; signal?: AbortSignal }) => Promise<XingyiBatchCharacterOutcome>
  findCharacterByName: (name: string) => Promise<PlayableWorldGeneratedCharacter | null>
  listWorlds: () => Promise<PlayableWorldRecord[]>
  createWorld: (input: { name: string; description: string }) => Promise<PlayableWorldRecord>
  readWorldDocumentIds: (worldId: string) => Promise<string[]>
  mountWorldDocuments: (worldId: string, documentIds: string[]) => Promise<string[]>
  createConversation: (input: {
    title: string
    members: PlayableWorldGeneratedCharacter[]
  }) => Promise<{ sessionId: string; title: string }>
  findConversation: (input: {
    title: string
    members: PlayableWorldGeneratedCharacter[]
    worldId: string
  }) => Promise<{ sessionId: string; title: string } | null>
  attachSessionToWorld: (sessionId: string, worldId: string) => Promise<{ worldId: string }>
  markCharactersPresent: (input: {
    sessionId: string
    worldId: string
    characterIds: string[]
    locationText: string
  }) => Promise<{ participantIds: string[] }>
  createNarrativeSeed: (worldId: string, input: Record<string, unknown>) => Promise<{ id: string }>
  findNarrativeSeedByTitle: (worldId: string, title: string) => Promise<{ id: string } | null>
  hasCharacterAvatar: (characterId: string) => Promise<boolean>
  hasSessionAvatar: (sessionId: string) => Promise<boolean>
  generateAvatar: (prompt: string, signal?: AbortSignal) => Promise<ChatImageAttachment>
  assignCharacterAvatar: (characterId: string, image: ChatImageAttachment) => Promise<void>
  assignSessionAvatar: (sessionId: string, image: ChatImageAttachment) => Promise<void>
  inspectBuild: (input: { world: string; session?: string }) => Promise<PlayableWorldBuildInspection>
}

export interface XingyiPlayableWorldBuilderContext {
  provider: XingyiPlayableWorldBuilderProvider
  confirmWrite?: ConfirmWriteChannel
  hasReadSkill: () => boolean
  onGenerated?: (attachment: ChatImageAttachment) => void
}

type StageReceipt = {
  stage: string
  status: 'success' | 'partial' | 'error'
  message: string
}

const CHARACTER_MIN = 3
const CHARACTER_MAX = 6
const DOCUMENT_MIN = 5
const DOCUMENT_MAX = 12
const SEED_MIN = 2
const SEED_MAX = 6

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean)
}

function compactMatchText(value: unknown): string {
  return text(value)
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))]
}

function hasDuplicate(values: readonly string[]): boolean {
  const normalized = values.map(compactMatchText)
  return new Set(normalized).size !== normalized.length
}

function isThreePartLocation(value: string): boolean {
  const parts = text(value).split('/').map(text)
  return parts.length === 3 && parts.every(Boolean)
}

export function resolvePlayableWorldMatch(
  worlds: readonly PlayableWorldRecord[],
  request: PlayableWorldBlueprint['world']
): PlayableWorldMatch | null {
  const requestedName = compactMatchText(request.name)
  const keywords = unique(request.matchKeywords).map((raw) => ({ raw, compact: compactMatchText(raw) }))
    .filter((item) => item.compact.length >= 2)
  const candidates = worlds.map((world) => {
    const name = compactMatchText(world.name)
    const description = compactMatchText(world.description)
    let score = 0
    const signals: string[] = []
    let exactName = false
    if (requestedName && name === requestedName) {
      score += 100
      exactName = true
      signals.push('世界名完全一致')
    } else if (requestedName.length >= 4 && name.length >= 4 && (name.includes(requestedName) || requestedName.includes(name))) {
      score += 48
      signals.push('世界名唯一包含匹配')
    }
    let keywordHits = 0
    for (const keyword of keywords) {
      if (name.includes(keyword.compact)) {
        score += 16
        keywordHits += 1
        signals.push(`名称命中「${keyword.raw}」`)
      } else if (description.includes(keyword.compact)) {
        score += 7
        keywordHits += 1
        signals.push(`简介命中「${keyword.raw}」`)
      }
    }
    return { world, score, signals, exactName, keywordHits }
  }).filter((item) => item.exactName || item.keywordHits >= 2 || item.score >= 48)
    .sort((a, b) => b.score - a.score || a.world.name.localeCompare(b.world.name))

  const best = candidates[0]
  if (!best) return null
  if (!best.exactName && best.score < 20) return null
  const second = candidates[1]
  if (!best.exactName && second && best.score - second.score < 8) return null
  return {
    world: best.world,
    score: best.score,
    reason: best.signals.join('、') || '符合世界匹配条件'
  }
}

function blueprintFromArgs(args: Record<string, unknown>): PlayableWorldBlueprint {
  return args as unknown as PlayableWorldBlueprint
}

export function validatePlayableWorldBlueprint(args: Record<string, unknown>): string | null {
  const blueprint = blueprintFromArgs(args)
  const library = blueprint.library
  const characters = Array.isArray(blueprint.characters) ? blueprint.characters : []
  const documents = Array.isArray(library?.documents) ? library.documents : []
  const seeds = Array.isArray(blueprint.narrativeSeeds) ? blueprint.narrativeSeeds : []

  if (!library || !text(library.title) || text(library.overview).length < 80) {
    return 'library 必须包含标题和至少 80 字的世界概览正文'
  }
  if (documents.length < DOCUMENT_MIN || documents.length > DOCUMENT_MAX) {
    return `文档库必须包含 ${DOCUMENT_MIN}～${DOCUMENT_MAX} 篇叶文档（树簇概览另计）`
  }
  if (hasDuplicate(documents.map((item) => text(item?.title)))) return '文档标题不能重复'
  for (const document of documents) {
    if (!text(document?.title)) return '每篇文档都必须有标题'
    if (text(document?.body).length < 200) return `文档「${text(document?.title) || '未命名'}」正文不足 200 字，不能作为完整文档落库`
    if (text(document?.summary).length < 20) return `文档「${text(document?.title)}」缺少可独立理解的摘要`
    if (!Array.isArray(document?.tags) || document.tags.length < 2 || document.tags.length > 8) return `文档「${text(document?.title)}」必须有 2～8 个标签`
    if (!UNIT_SEMANTIC_TYPES.includes(text(document?.semanticType) as never)) return `文档「${text(document?.title)}」的 semanticType 不合法`
  }

  if (characters.length < CHARACTER_MIN || characters.length > CHARACTER_MAX) {
    return `主要角色必须为 ${CHARACTER_MIN}～${CHARACTER_MAX} 个`
  }
  if (hasDuplicate(characters.map((item) => text(item?.name)))) return '主要角色姓名不能重复'
  for (const character of characters) {
    if (!text(character?.name)) return '每个主要角色都必须有确定姓名'
    if (text(character?.brief).length < 120) return `角色「${text(character?.name)}」的完整设定不足 120 字`
    if (text(character?.avatarPrompt).length < 30) return `角色「${text(character?.name)}」缺少完整头像画面描述`
  }

  if (!blueprint.world || !text(blueprint.world.name) || !text(blueprint.world.description)) return 'world 必须包含名称与简介'
  if (text(blueprint.world.name).length > 50 || text(blueprint.world.description).length > 500) return '世界名称最多 50 字，简介最多 500 字'
  const matchKeywords = textList(blueprint.world.matchKeywords)
  if (matchKeywords.length < 3 || matchKeywords.length > 8) return '世界匹配关键词必须为 3～8 个'

  if (!blueprint.session || !text(blueprint.session.title)) return 'session 必须有明确标题'
  if (!isThreePartLocation(text(blueprint.session.openingLocation))) return '开场地点必须使用“大地点/中地点/小地点”三段格式'
  if (text(blueprint.session.avatarPrompt).length < 30) return '群聊必须有完整头像画面描述'

  if (seeds.length < SEED_MIN || seeds.length > SEED_MAX) return `叙事种子必须为 ${SEED_MIN}～${SEED_MAX} 条`
  const characterNames = new Set(characters.map((item) => text(item.name)))
  for (const seed of seeds) {
    if (!NARRATIVE_SEED_TYPES.includes(text(seed?.type) as never)) return `种子「${text(seed?.title) || '未命名'}」的 type 不合法`
    if (!NARRATIVE_SEED_VISIBILITY_MODES.includes(text(seed?.visibilityMode) as never)) return `种子「${text(seed?.title) || '未命名'}」的 visibilityMode 不合法`
    if (!['dormant', 'active'].includes(text(seed?.status))) return `种子「${text(seed?.title) || '未命名'}」只能从 dormant 或 active 开始`
    if (!isThreePartLocation(text(seed?.locationText))) return `种子「${text(seed?.title) || '未命名'}」的地点必须是三段格式`
    for (const field of ['title', 'description', 'cause', 'currentProgress', 'expectedOutcome', 'startTime', 'impactScope'] as const) {
      if (!text(seed?.[field])) return `种子缺少字段 ${field}`
    }
    if (typeof seed?.allowFrontstage !== 'boolean') return `种子「${text(seed?.title)}」的 allowFrontstage 必须是布尔值`
    const unknownParticipant = textList(seed?.participantNames).find((name) => !characterNames.has(name))
    if (unknownParticipant) return `种子「${text(seed?.title)}」引用了未创建角色「${unknownParticipant}」`
  }
  return null
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function runtimeFailure(message: string, details: Record<string, unknown>, retryable = false): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable },
    details,
    acted: true
  }
}

function validateBuildReceiptArgs(args: Record<string, unknown>): string | null {
  if (!text(args.world)) return 'world 必须填写世界名称或 worldId'
  return null
}

export function createReadPlayableWorldBuildReceiptTool(
  provider: Pick<XingyiPlayableWorldBuilderProvider, 'inspectBuild'>
): ToolDefinition {
  return {
    name: 'readPlayableWorldBuildReceipt',
    brief: '只读核验既有的一键开玩世界，返回世界、会话、文档挂载、正式角色、全员在场、叙事种子和全部头像的真实 ID 与完成状态。用于旧任务、历史中断或结果回执丢失后的补验收；新调用 buildPlayableWorld 已返回 verified_complete 时无需再调用。',
    mayHaveSideEffects: false,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        world: { type: 'string', description: '世界名称或 worldId，必须精确对应一个世界。' },
        session: { type: 'string', description: '可选，会话名称或 sessionId；世界下只有一个会话时可省略。' }
      },
      required: ['world']
    },
    validateArgs: validateBuildReceiptArgs,
    execute: async (call) => {
      const validation = validateBuildReceiptArgs(call.args)
      if (validation) return invalid(validation)
      try {
        const inspection = await provider.inspectBuild({
          world: text(call.args.world),
          ...(text(call.args.session) ? { session: text(call.args.session) } : {})
        })
        const characterIds = inspection.characters.map((item) => `${item.name}=${item.id}`)
        const presenceParticipantIds = inspection.characters
          .filter((item) => item.presenceState === 'present')
          .map((item) => item.participantId)
          .filter(Boolean)
        const seedIds = inspection.narrativeSeeds.map((item) => item.id).filter(Boolean)
        const missing: string[] = []
        if (inspection.documentIds.length < DOCUMENT_MIN + 1) missing.push(`世界挂载文档不足 ${DOCUMENT_MIN + 1} 个`)
        if (inspection.characters.length < CHARACTER_MIN) missing.push(`正式角色不足 ${CHARACTER_MIN} 个`)
        if (inspection.session.worldId !== inspection.world.id) missing.push('会话未挂载到目标世界')
        const missingPresence = inspection.characters.filter((item) => !item.participantId || item.presenceState !== 'present')
        if (missingPresence.length) missing.push(`未确认在场：${missingPresence.map((item) => item.name).join('、')}`)
        if (inspection.narrativeSeeds.length < SEED_MIN) missing.push(`叙事种子不足 ${SEED_MIN} 条`)
        const missingAvatars = inspection.characters.filter((item) => !item.avatarReady).map((item) => `角色「${item.name}」`)
        if (!inspection.session.avatarReady) missingAvatars.push(`群聊「${inspection.session.title}」`)
        if (missingAvatars.length) missing.push(`头像未设置：${missingAvatars.join('、')}`)
        const complete = missing.length === 0
        const content = [
          '【一键开玩世界正式验收回执｜只读回查】',
          `verificationStatus: ${complete ? 'verified_complete' : 'incomplete'}`,
          `worldId: ${inspection.world.id}（「${inspection.world.name}」）`,
          `sessionId: ${inspection.session.id}（「${inspection.session.title}」，worldId=${inspection.session.worldId || '未挂载'}）`,
          `mountedDocumentIds: ${inspection.documentIds.join('、') || '无'}`,
          `characterIds: ${characterIds.join('、') || '无'}`,
          `presenceParticipantIds: ${presenceParticipantIds.join('、') || '无'}${missingPresence.length ? '' : '（全员 present）'}`,
          `narrativeSeedIds: ${seedIds.join('、') || '无'}`,
          `avatarTargets: ${missingAvatars.length ? `缺失 ${missingAvatars.join('、')}` : '全部已设置'}`,
          complete
            ? '结论：全链路已经完成并可直接开玩。请把相关 TODO 标为完成，不要继续搜索其他验收工具。'
            : `结论：尚未完成；缺项：${missing.join('；')}`
        ].join('\n')
        return {
          content,
          details: {
            complete,
            verificationStatus: complete ? 'verified_complete' : 'incomplete',
            ...inspection,
            presenceParticipantIds,
            missing
          },
          lifecycle: {
            world: 'durable',
            session: 'durable',
            documentIds: 'durable',
            characters: 'durable',
            narrativeSeeds: 'durable',
            presenceParticipantIds: 'durable',
            missing: 'searchable'
          },
          acted: false
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : text(error) || '未知错误'
        return {
          content: `无法完成一键开玩世界只读验收：${message}`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: true },
          acted: false
        }
      }
    }
  }
}

function buildSeedPayload(
  seed: PlayableWorldNarrativeSeed,
  characters: PlayableWorldGeneratedCharacter[],
  sessionId: string
): Record<string, unknown> {
  const byName = new Map<string, PlayableWorldGeneratedCharacter>()
  for (const character of characters) {
    byName.set(character.requestedName, character)
    byName.set(character.name, character)
  }
  return {
    type: seed.type,
    title: seed.title,
    description: seed.description,
    cause: seed.cause,
    currentProgress: seed.currentProgress,
    expectedOutcome: seed.expectedOutcome,
    startTime: seed.startTime,
    mapFeatureId: '',
    locationText: seed.locationText,
    impactScope: seed.impactScope,
    status: seed.status,
    visibilityMode: seed.visibilityMode,
    allowFrontstage: seed.allowFrontstage,
    participants: unique(seed.participantNames).flatMap((name) => {
      const character = byName.get(name)
      return character ? [{
        participantType: 'character',
        participantId: character.id,
        displayName: character.name,
        relationRole: '主要相关者'
      }] : []
    }),
    links: [],
    sourceSessionId: sessionId,
    lastModifiedSource: 'xingyi_playable_world_builder'
  }
}

const DOCUMENT_PROPERTIES = {
  title: { type: 'string', description: '文档标题。' },
  body: { type: 'string', description: '至少 200 字的完整 Markdown 正文。' },
  summary: { type: 'string', description: '可独立理解的编译页摘要。' },
  tags: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'string' } },
  semanticType: { type: 'string', enum: [...UNIT_SEMANTIC_TYPES] }
} as const

const SEED_PROPERTIES = {
  type: { type: 'string', enum: [...NARRATIVE_SEED_TYPES] },
  title: { type: 'string' },
  description: { type: 'string' },
  cause: { type: 'string' },
  currentProgress: { type: 'string' },
  expectedOutcome: { type: 'string' },
  startTime: { type: 'string', description: '世界内开场时间或明确时间锚。' },
  locationText: { type: 'string', description: '大地点/中地点/小地点。' },
  impactScope: { type: 'string' },
  status: { type: 'string', enum: ['dormant', 'active'] },
  visibilityMode: { type: 'string', enum: [...NARRATIVE_SEED_VISIBILITY_MODES] },
  allowFrontstage: { type: 'boolean' },
  participantNames: { type: 'array', items: { type: 'string' }, description: '只填写本蓝图中的主要角色姓名。' }
} as const

export function createBuildPlayableWorldTool(context: XingyiPlayableWorldBuilderContext): ToolDefinition {
  // 同一 Agent turn 内失败后用完全相同蓝图续跑时，沿用已经通过的总确认；蓝图变更则必须重新确认。
  const confirmedBlueprints = new Set<string>()
  return {
    name: 'buildPlayableWorld',
    longRunning: true,
    brief: '把一份完整蓝图落成可直接开玩的世界：文档库→至少三个正式角色→匹配或新建世界并挂文档→命名群聊并挂世界→全员在场→叙事种子→最后生成角色与群聊头像。调用前必须先成功读取 readPlayableWorldBuilderSkill；只弹一次总确认。各阶段先回读再补缺，可用完全相同蓝图安全续跑，禁止改走低层工具拼接。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        library: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string' },
            overview: { type: 'string', description: '树簇 index.md 的完整概览正文。' },
            documents: {
              type: 'array', minItems: DOCUMENT_MIN, maxItems: DOCUMENT_MAX,
              items: { type: 'object', additionalProperties: false, properties: DOCUMENT_PROPERTIES, required: Object.keys(DOCUMENT_PROPERTIES) }
            }
          },
          required: ['title', 'overview', 'documents']
        },
        characters: {
          type: 'array', minItems: CHARACTER_MIN, maxItems: CHARACTER_MAX,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string' },
              brief: { type: 'string', description: '完整独立角色设定，至少 120 字。' },
              avatarPrompt: { type: 'string', description: '正方形角色头像画面描述。' }
            },
            required: ['name', 'brief', 'avatarPrompt']
          }
        },
        world: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            matchKeywords: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string' } }
          },
          required: ['name', 'description', 'matchKeywords']
        },
        session: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string' },
            openingLocation: { type: 'string', description: '大地点/中地点/小地点。' },
            avatarPrompt: { type: 'string', description: '正方形群聊头像画面描述。' }
          },
          required: ['title', 'openingLocation', 'avatarPrompt']
        },
        narrativeSeeds: {
          type: 'array', minItems: SEED_MIN, maxItems: SEED_MAX,
          items: { type: 'object', additionalProperties: false, properties: SEED_PROPERTIES, required: Object.keys(SEED_PROPERTIES) }
        }
      },
      required: ['library', 'characters', 'world', 'session', 'narrativeSeeds']
    },
    validateArgs: validatePlayableWorldBlueprint,
    execute: async (call, execution) => {
      if (!context.hasReadSkill()) return invalid('先调用 readPlayableWorldBuilderSkill 读取全链路协议，再提交完整蓝图。')
      const validation = validatePlayableWorldBlueprint(call.args)
      if (validation) return invalid(validation)
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, '一键创建可玩世界')!
      const blueprint = blueprintFromArgs(call.args)
      const blueprintKey = JSON.stringify(call.args)
      const receipts: StageReceipt[] = []
      let currentStage = '总确认'
      let documentIds: string[] = []
      let mountedDocumentIds: string[] = []
      let generatedCharacters: PlayableWorldGeneratedCharacter[] = []
      let world: PlayableWorldRecord | null = null
      let worldResolution: 'matched' | 'created' = 'created'
      let session: { sessionId: string; title: string } | null = null
      let seedIds: string[] = []
      let presenceParticipantIds: string[] = []
      if (!confirmedBlueprints.has(blueprintKey)) {
        const initialWorlds = await context.provider.listWorlds()
        const initialMatch = resolvePlayableWorldMatch(initialWorlds, blueprint.world)
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `一键创建可玩世界「${blueprint.world.name}」`,
          lines: [
            `文档库：${blueprint.library.title}（1 篇概览 + ${blueprint.library.documents.length} 篇文档）`,
            `主要角色：${blueprint.characters.map((item) => item.name).join('、')}`,
            initialMatch
              ? `世界：复用「${initialMatch.world.name}」（${initialMatch.reason}）`
              : `世界：现有世界无可信匹配，将新建「${blueprint.world.name}」`,
            `会话：${blueprint.session.title}；叙事种子：${blueprint.narrativeSeeds.length} 条`,
            `头像：${blueprint.characters.length} 个角色 + 1 个群聊；严格在全部内容完成后生成。`,
            '确认后连续执行；相同蓝图若因中断续跑，将复用既有正式内容且不再重复确认。'
          ]
        }, '一键创建可玩世界')
        if (denied) return denied
        confirmedBlueprints.add(blueprintKey)
      }

      try {
        currentStage = '生成文档库'
        const library = await context.provider.createDocumentLibrary(blueprint.library)
        documentIds = unique(library.documentIds)
        if (documentIds.length < blueprint.library.documents.length + 1) {
          throw new Error(`文档回执不足：期望至少 ${blueprint.library.documents.length + 1} 个，实际 ${documentIds.length} 个`)
        }
        receipts.push({ stage: currentStage, status: 'success', message: `${library.rootPath} · ${documentIds.length} 个正式文档` })

        currentStage = '生成正式角色'
        const generatedByRequestedName = new Map<string, PlayableWorldGeneratedCharacter>()
        for (const character of blueprint.characters) {
          const existing = await context.provider.findCharacterByName(character.name)
          if (existing) generatedByRequestedName.set(character.name, { ...existing, requestedName: character.name })
        }
        const missingCharacters = blueprint.characters.filter((character) => !generatedByRequestedName.has(character.name))
        const characterRuns = await runWithConcurrencyPool(missingCharacters, async (character) => {
          return context.provider.generateCharacter({
            requestedName: character.name,
            brief: `角色姓名必须固定为「${character.name}」，不得改名。\n${character.brief}`,
            signal: execution.signal
          })
        }, { limit: 4, retries: 0, signal: execution.signal })
        const characterFailures: string[] = []
        characterRuns.forEach((result, index) => {
          const requested = missingCharacters[index]
          if (result.status === 'fulfilled' && result.value?.ok && result.value.characterId) {
            generatedByRequestedName.set(requested.name, {
              id: result.value.characterId,
              name: text(result.value.name) || requested.name,
              requestedName: requested.name
            })
          } else {
            const reason = result.status === 'fulfilled'
              ? result.value?.message || '角色生成未成功'
              : result.error instanceof Error ? result.error.message : text(result.error) || '未知错误'
            characterFailures.push(`${requested.name}：${reason}`)
          }
        })
        generatedCharacters = blueprint.characters.flatMap((character) => {
          const generated = generatedByRequestedName.get(character.name)
          return generated ? [generated] : []
        })
        if (generatedCharacters.length < CHARACTER_MIN) {
          throw new Error(`正式角色成功 ${generatedCharacters.length} 个，不足 ${CHARACTER_MIN} 个；${characterFailures.join('；')}`)
        }
        receipts.push({
          stage: currentStage,
          status: characterFailures.length ? 'partial' : 'success',
          message: `共 ${generatedCharacters.length} 个（复用 ${generatedCharacters.length - (missingCharacters.length - characterFailures.length)} 个，新建 ${missingCharacters.length - characterFailures.length} 个）${characterFailures.length ? `；失败 ${characterFailures.join('；')}` : ''}`
        })

        currentStage = '匹配或创建世界'
        const currentWorlds = await context.provider.listWorlds()
        const match = resolvePlayableWorldMatch(currentWorlds, blueprint.world)
        if (match) {
          world = match.world
          worldResolution = 'matched'
          receipts.push({ stage: currentStage, status: 'success', message: `复用「${world.name}」：${match.reason}` })
        } else {
          world = await context.provider.createWorld({ name: blueprint.world.name, description: blueprint.world.description })
          worldResolution = 'created'
          receipts.push({ stage: currentStage, status: 'success', message: `新建「${world.name}」` })
        }
        if (!text(world?.id)) throw new Error('世界操作没有返回 worldId')

        currentStage = '挂载世界文档'
        const existingDocumentIds = await context.provider.readWorldDocumentIds(world.id)
        mountedDocumentIds = await context.provider.mountWorldDocuments(world.id, unique([...existingDocumentIds, ...documentIds]))
        const missingMounted = documentIds.filter((id) => !mountedDocumentIds.includes(id))
        if (missingMounted.length) throw new Error(`这些新文档没有出现在世界挂载回读中：${missingMounted.join('、')}`)
        receipts.push({ stage: currentStage, status: 'success', message: `新增 ${documentIds.length} 个，世界现挂 ${mountedDocumentIds.length} 个文档` })

        currentStage = '创建并挂载会话'
        session = await context.provider.findConversation({
          title: blueprint.session.title,
          members: generatedCharacters,
          worldId: world.id
        })
        const sessionReused = Boolean(session)
        if (!session) session = await context.provider.createConversation({ title: blueprint.session.title, members: generatedCharacters })
        if (!text(session.sessionId)) throw new Error('创建会话后没有返回 sessionId')
        const attached = await context.provider.attachSessionToWorld(session.sessionId, world.id)
        if (attached.worldId !== world.id) throw new Error(`会话挂载回读不一致：${attached.worldId || '空'} ≠ ${world.id}`)
        receipts.push({ stage: currentStage, status: 'success', message: `${sessionReused ? '复用' : '新建'} ${session.title}（${session.sessionId}）→ ${world.name}` })

        currentStage = '设置全员在场'
        const presence = await context.provider.markCharactersPresent({
          sessionId: session.sessionId,
          worldId: world.id,
          characterIds: generatedCharacters.map((item) => item.id),
          locationText: blueprint.session.openingLocation
        })
        if (unique(presence.participantIds).length !== generatedCharacters.length) {
          throw new Error(`在场回执不足：期望 ${generatedCharacters.length} 个，实际 ${unique(presence.participantIds).length} 个`)
        }
        presenceParticipantIds = unique(presence.participantIds)
        receipts.push({ stage: currentStage, status: 'success', message: `${generatedCharacters.length} 个角色均已在场` })

        currentStage = '生成叙事种子'
        for (const seed of blueprint.narrativeSeeds) {
          const existingSeed = await context.provider.findNarrativeSeedByTitle(world.id, seed.title)
          if (existingSeed) {
            seedIds.push(existingSeed.id)
            continue
          }
          const payload = buildSeedPayload(seed, generatedCharacters, session.sessionId)
          const seedErrors = validateCompleteNarrativeSeedAuthoring(payload)
          if (seedErrors.length) throw new Error(`种子「${seed.title}」未通过协议校验：${seedErrors.join('；')}`)
          const created = await context.provider.createNarrativeSeed(world.id, payload)
          if (!text(created?.id)) throw new Error(`种子「${seed.title}」创建后没有返回 id`)
          seedIds.push(created.id)
        }
        receipts.push({ stage: currentStage, status: 'success', message: `${seedIds.length} 条正式世界种子` })

        currentStage = '最后生成并设置头像'
        const characterByRequestedName = new Map(generatedCharacters.map((item) => [item.requestedName, item]))
        const avatarAlreadyPresent: string[] = []
        const avatarTasks: Array<{
          label: string
          prompt: string
          assign: (image: ChatImageAttachment) => Promise<void>
        }> = []
        for (const character of blueprint.characters) {
          const generated = characterByRequestedName.get(character.name)
          if (!generated) continue
          const label = `角色「${generated.name}」`
          if (await context.provider.hasCharacterAvatar(generated.id)) avatarAlreadyPresent.push(label)
          else avatarTasks.push({
              label,
              prompt: character.avatarPrompt,
              assign: (image: ChatImageAttachment) => context.provider.assignCharacterAvatar(generated.id, image)
            })
        }
        const sessionAvatarLabel = `群聊「${session.title}」`
        if (await context.provider.hasSessionAvatar(session.sessionId)) avatarAlreadyPresent.push(sessionAvatarLabel)
        else {
          avatarTasks.push({
            label: sessionAvatarLabel,
            prompt: blueprint.session.avatarPrompt,
            assign: (image) => context.provider.assignSessionAvatar(session!.sessionId, image)
          })
        }
        const avatarRuns = await runWithConcurrencyPool(avatarTasks, async (task) => {
          const prompt = `${task.prompt}\n正方形头像构图，主体清晰居中，不要文字、边框、水印或界面元素。`
          const image = await context.provider.generateAvatar(prompt, execution.signal)
          context.onGenerated?.(image)
          await task.assign(image)
          return task.label
        }, { limit: 3, retries: 0, signal: execution.signal })
        const avatarSucceeded: string[] = []
        const avatarFailures: Array<{ target: string; prompt: string; message: string }> = []
        avatarRuns.forEach((result, index) => {
          const task = avatarTasks[index]
          if (result.status === 'fulfilled') avatarSucceeded.push(task.label)
          else avatarFailures.push({
            target: task.label,
            prompt: task.prompt,
            message: result.error instanceof Error ? result.error.message : text(result.error) || '未知错误'
          })
        })
        receipts.push({
          stage: currentStage,
          status: avatarFailures.length ? 'partial' : 'success',
          message: `已存在 ${blueprint.characters.length + 1 - avatarTasks.length} 个，新生成成功 ${avatarSucceeded.length}/${avatarTasks.length}${avatarFailures.length ? `；失败：${avatarFailures.map((item) => `${item.target}（${item.message}）`).join('、')}` : ''}`
        })

        const avatarVerified = [...avatarAlreadyPresent, ...avatarSucceeded]
        const expectedAvatarCount = blueprint.characters.length + 1
        const complete = avatarFailures.length === 0 && avatarVerified.length === expectedAvatarCount
        const completionReceipt = [
          '【正式完成回执｜本工具已回读验收，无需再检索只读工具】',
          `verificationStatus: ${complete ? 'verified_complete' : 'avatar_partial'}`,
          `worldId: ${world.id}（${worldResolution === 'matched' ? '复用' : '新建'}「${world.name}」）`,
          `sessionId: ${session.sessionId}（已挂载 worldId=${world.id}）`,
          `documentIds: ${documentIds.join('、')}`,
          `mountedDocumentIds: ${mountedDocumentIds.join('、')}`,
          `characterIds: ${generatedCharacters.map((item) => `${item.name}=${item.id}`).join('、')}`,
          `presenceParticipantIds: ${presenceParticipantIds.join('、')}（全员 present）`,
          `narrativeSeedIds: ${seedIds.join('、')}`,
          `avatarTargets: ${avatarVerified.join('、')}${avatarFailures.length ? `；失败 ${avatarFailures.map((item) => item.target).join('、')}` : '（全部已设置）'}`
        ].join('\n')
        return {
          content: complete
            ? `可玩世界「${world.name}」已全链路完成。已打开群聊「${session.title}」，可以直接开始玩。\n\n${completionReceipt}\n\n请直接把相关 TODO 标为完成，不要再调用 toolsearch 寻找额外验收工具。`
            : `世界「${world.name}」的内容主链已经完成并可进入群聊「${session.title}」，但有 ${avatarFailures.length} 个头像尚未补齐。\n\n${completionReceipt}`,
          details: {
            complete,
            verificationStatus: complete ? 'verified_complete' : 'avatar_partial',
            world: { id: world.id, name: world.name, resolution: worldResolution },
            documentIds,
            mountedDocumentIds,
            characters: generatedCharacters,
            session: { id: session.sessionId, title: session.title },
            presenceParticipantIds,
            seedIds,
            avatarVerified,
            avatarSucceeded,
            avatarFailures,
            receipts
          },
          lifecycle: {
            documentIds: 'durable',
            mountedDocumentIds: 'durable',
            characters: 'durable',
            session: 'durable',
            presenceParticipantIds: 'durable',
            seedIds: 'durable',
            avatarFailures: 'transient',
            receipts: 'searchable'
          },
          acted: true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : text(error) || '未知错误'
        receipts.push({ stage: currentStage, status: 'error', message })
        return runtimeFailure(
          `全链路在“${currentStage}”阶段停止：${message}。已完成内容已保留；请用完全相同的蓝图再次调用 buildPlayableWorld，它会逐阶段回读并续建，不会重复创建已完成内容。不要改走低层工具拼接。`,
          {
            complete: false,
            failedStage: currentStage,
            documentIds,
            mountedDocumentIds,
            characters: generatedCharacters,
            world: world ? { id: world.id, name: world.name, resolution: worldResolution } : null,
            session: session ? { id: session.sessionId, title: session.title } : null,
            presenceParticipantIds,
            seedIds,
            receipts
          },
          true
        )
      }
    }
  }
}
