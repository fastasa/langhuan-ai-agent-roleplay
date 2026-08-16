/** 星依会话成员管理：只改正式会话参与者真值，不改角色本体或历史消息。 */
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel
} from './agentRuntime/interactionContract'
import {
  resolveXingyiNamedTarget,
  type XingyiNamedTarget
} from './xingyiConversationAvatarTools'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContextSeam
} from './xingyiSessionContext'

export const XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT = 20

export interface XingyiConversationMember {
  participantId?: string
  characterId: string
  name: string
  displayOrder: number
  replyProbability: number
  role: string
  characterStateMode: 'follow_main' | 'independent_snapshot'
  characterBranchId?: string
  sourceSnapshotId?: string
  createdAt?: string
  updatedAt?: string
}

export interface XingyiCharacterVersion {
  id: string
  characterId: string
  label: string
  snapshotKind: 'manual' | 'automatic' | string
  activeBranchCount: number
  personalityModelVersionId?: string
  createdAt: string
}

export interface XingyiConversationMemberProvider {
  listCharacters: () => XingyiNamedTarget[]
  readMembers: (sessionId: string) => Promise<XingyiConversationMember[]>
  replaceMembers: (sessionId: string, members: XingyiConversationMember[]) => Promise<void>
  listCharacterVersions: (characterId: string) => Promise<XingyiCharacterVersion[]>
  createCharacterVersion: (characterId: string, label: string) => Promise<XingyiCharacterVersion>
}

export interface XingyiConversationMemberToolContext extends XingyiSessionContextSeam {
  provider: XingyiConversationMemberProvider
  confirmWrite?: ConfirmWriteChannel
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function failure(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { content: `「${action}」执行失败：${message}`, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false } }
}

function isToolResult(value: XingyiNamedTarget | XingyiCharacterVersion | ToolExecutionResult): value is ToolExecutionResult {
  return 'content' in value
}

function readIdentifiers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)))
}

function resolveCharacters(provider: XingyiConversationMemberProvider, raw: unknown): XingyiNamedTarget[] | ToolExecutionResult {
  const identifiers = readIdentifiers(raw)
  if (!identifiers.length) return invalid('至少需要一个正式角色名称或 id。')
  if (identifiers.length > XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT) {
    return invalid(`单次最多调整 ${XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT} 个会话角色。`)
  }
  const characters = provider.listCharacters()
  const resolved: XingyiNamedTarget[] = []
  for (const identifier of identifiers) {
    const item = resolveXingyiNamedTarget(characters, identifier, '角色')
    if (isToolResult(item)) return item
    resolved.push(item)
  }
  return resolved
}

async function resolveSession(context: XingyiConversationMemberToolContext, raw: unknown) {
  const resolved = await resolveXingyiSessionForCall(context, raw)
  if ('error' in resolved) return { error: invalid(resolved.error) }
  if ('noActiveSession' in resolved) {
    return { error: invalid('当前没有打开中的普通会话。请传入 session 指定目标会话，或先打开目标会话。') }
  }
  return { session: resolved.context }
}

function readProbabilityMap(raw: unknown): Map<string, number> {
  const map = new Map<string, number>()
  if (!Array.isArray(raw)) return map
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const character = String(row.character || '').trim()
    if (!character) continue
    const parsed = Number(row.probability)
    if (!Number.isFinite(parsed)) continue
    map.set(character, Math.max(0, Math.min(100, Math.round(parsed))))
  }
  return map
}

function readProbabilityEntries(raw: unknown): Array<{ identifier: string; probability: number }> {
  if (!Array.isArray(raw)) return []
  const entries = new Map<string, number>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const identifier = String(row.character || '').trim()
    const parsed = Number(row.probability)
    if (!identifier || !Number.isFinite(parsed)) continue
    entries.set(identifier, Math.max(0, Math.min(100, Math.round(parsed))))
  }
  return Array.from(entries, ([identifier, probability]) => ({ identifier, probability }))
}

function resolveProbabilityTargets(
  provider: XingyiConversationMemberProvider,
  raw: unknown
): Array<{ character: XingyiNamedTarget; probability: number }> | ToolExecutionResult {
  const entries = readProbabilityEntries(raw)
  if (!entries.length) return invalid('至少需要一条有效的角色发言概率设置。')
  if (entries.length > XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT) {
    return invalid(`单次最多调整 ${XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT} 个会话角色。`)
  }
  const characters = provider.listCharacters()
  const resolved: Array<{ character: XingyiNamedTarget; probability: number }> = []
  for (const entry of entries) {
    const character = resolveXingyiNamedTarget(characters, entry.identifier, '角色')
    if (isToolResult(character)) return character
    resolved.push({ character, probability: entry.probability })
  }
  return resolved
}

function resolveCharacterVersion(
  versions: XingyiCharacterVersion[],
  identifier: string
): XingyiCharacterVersion | ToolExecutionResult {
  const key = String(identifier || '').trim()
  if (!key) return invalid('切换到角色快照时必须提供 version（快照名称或 id）。')
  const byId = versions.find((version) => version.id === key)
  if (byId) return byId
  const exact = versions.filter((version) => version.label === key)
  if (exact.length === 1) return exact[0]
  const partial = versions.filter((version) => version.label.includes(key))
  if (partial.length === 1) return partial[0]
  if (exact.length > 1 || partial.length > 1) {
    const candidates = (exact.length ? exact : partial).map((version) => `${version.label}(${version.id})`).join('、')
    return invalid(`角色版本「${key}」有多个匹配，请改用快照 id：${candidates}`)
  }
  return invalid(`没有找到角色版本「${key}」。请先用 listCharacterVersions 查看可选快照。`)
}

function normalizedMembers(members: XingyiConversationMember[]): XingyiConversationMember[] {
  return [...members]
    .filter((member) => member.characterId)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((member, index) => ({ ...member, displayOrder: index }))
}

export function createXingyiAddCharactersToConversationTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  const action = '向会话添加角色'
  return {
    name: 'addCharactersToConversation',
    longRunning: true,
    brief: '把一个或多个角色列表中的正式角色加入已有会话；可指定非当前会话和个别角色发言概率。'
      + '已有成员保持原顺序、发言概率和会话角色挂载模式；重复成员会跳过（写操作，整批只确认一次）。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '可选，会话标题、联系人名、targetId 或 sessionId；缺省为当前打开的普通会话。同名时必须用 sessionId。' },
        characters: {
          type: 'array', minItems: 1, maxItems: XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT,
          items: { type: 'string' }, description: '要加入的正式角色名称或 id，可一次传多个。'
        },
        probabilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              character: { type: 'string', description: '本次加入角色的名称或 id。' },
              probability: { type: 'number', minimum: 0, maximum: 100 }
            },
            required: ['character', 'probability']
          },
          description: '可选，指定个别新增角色的发言概率；未列出时为 100。'
        }
      },
      required: ['characters']
    },
    validateArgs: (args) => {
      const identifiers = readIdentifiers(args.characters)
      if (!identifiers.length) return 'addCharactersToConversation 至少需要一个 characters 角色'
      if (identifiers.length > XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT) return `单次最多调整 ${XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT} 个会话角色`
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const sessionResolved = await resolveSession(context, toolCall.args.session)
      if (sessionResolved.error) return sessionResolved.error
      const session = sessionResolved.session!
      const characters = resolveCharacters(context.provider, toolCall.args.characters)
      if (!Array.isArray(characters)) return characters

      try {
        const before = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const beforeIds = new Set(before.map((member) => member.characterId))
        const requested = characters.filter((character) => !beforeIds.has(character.id))
        const skipped = characters.filter((character) => beforeIds.has(character.id))
        if (!requested.length) {
          return {
            content: `${characters.map((item) => item.name).join('、')}已经在会话「${session.sessionTitle}」中，本次没有修改。`,
            details: { sessionId: session.sessionId, addedCharacterIds: [], skippedCharacterIds: skipped.map((item) => item.id) }
          }
        }
        const probabilities = readProbabilityMap(toolCall.args.probabilities)
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `向「${session.sessionTitle}」添加角色`,
          lines: [
            `新增：${requested.map((item) => `${item.name}（${probabilities.get(item.id) ?? probabilities.get(item.name) ?? 100}%）`).join('、')}`,
            ...(skipped.length ? [`已在会话中、自动跳过：${skipped.map((item) => item.name).join('、')}`] : []),
            '现有成员的顺序、发言概率与独立副本保持不变。'
          ]
        }, action)
        if (denied) return denied

        // 确认期间会话可能被别处编辑；写前重新读取，再从最新真值增量合并，避免覆盖他人修改。
        const fresh = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const freshIds = new Set(fresh.map((member) => member.characterId))
        const additions = requested.filter((character) => !freshIds.has(character.id))
        if (!additions.length) {
          return {
            content: `确认期间这些角色已经加入会话「${session.sessionTitle}」，本次没有重复写入。`,
            details: { sessionId: session.sessionId, addedCharacterIds: [], skippedCharacterIds: characters.map((item) => item.id) }
          }
        }
        const next = normalizedMembers([
          ...fresh,
          ...additions.map((character, index): XingyiConversationMember => ({
            characterId: character.id,
            name: character.name,
            displayOrder: fresh.length + index,
            replyProbability: probabilities.get(character.id) ?? probabilities.get(character.name) ?? 100,
            role: 'member',
            characterStateMode: 'follow_main'
          }))
        ])
        await context.provider.replaceMembers(session.sessionId, next)
        return {
          content: `已把 ${additions.map((item) => item.name).join('、')} 加入会话「${session.sessionTitle}」。`,
          details: {
            sessionId: session.sessionId,
            addedCharacterIds: additions.map((item) => item.id),
            skippedCharacterIds: characters.filter((item) => !additions.some((added) => added.id === item.id)).map((item) => item.id),
            memberCount: next.length
          }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiRemoveCharactersFromConversationTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  const action = '从会话移除角色'
  return {
    name: 'removeCharactersFromConversation',
    longRunning: true,
    brief: '把一个或多个正式角色从已有会话成员中移除；不删除角色本体或历史消息。'
      + '会话必须至少保留一名正式角色；若移除的是独立副本成员，确认后会同时删除该会话私有角色分支（写操作，整批只确认一次）。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '可选，会话标题、联系人名、targetId 或 sessionId；缺省为当前打开的普通会话。同名时必须用 sessionId。' },
        characters: {
          type: 'array', minItems: 1, maxItems: XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT,
          items: { type: 'string' }, description: '要移出的正式角色名称或 id，可一次传多个。'
        }
      },
      required: ['characters']
    },
    validateArgs: (args) => {
      const identifiers = readIdentifiers(args.characters)
      if (!identifiers.length) return 'removeCharactersFromConversation 至少需要一个 characters 角色'
      if (identifiers.length > XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT) return `单次最多调整 ${XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT} 个会话角色`
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const sessionResolved = await resolveSession(context, toolCall.args.session)
      if (sessionResolved.error) return sessionResolved.error
      const session = sessionResolved.session!
      const characters = resolveCharacters(context.provider, toolCall.args.characters)
      if (!Array.isArray(characters)) return characters

      try {
        const before = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const requestedIds = new Set(characters.map((character) => character.id))
        const matched = before.filter((member) => requestedIds.has(member.characterId))
        const missing = characters.filter((character) => !matched.some((member) => member.characterId === character.id))
        if (missing.length) return invalid(`${missing.map((item) => item.name).join('、')}不在会话「${session.sessionTitle}」中。`)
        if (before.length - matched.length < 1) return invalid('会话必须至少保留一名正式角色，不能移除全部成员。')
        const independent = matched.filter((member) => member.characterStateMode === 'independent_snapshot')
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `从「${session.sessionTitle}」移除角色`,
          lines: [
            `移出：${matched.map((item) => item.name).join('、')}`,
            '角色主资料与历史消息不会删除。',
            ...(independent.length
              ? [`会删除这些成员在本会话中的独立副本分支：${independent.map((item) => item.name).join('、')}（不可恢复）`]
              : [])
          ]
        }, action)
        if (denied) return denied

        // 与添加同理，确认后按最新成员真值重算，避免把确认期间的成员变更覆盖掉。
        const fresh = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const actuallyRemoved = fresh.filter((member) => requestedIds.has(member.characterId))
        if (!actuallyRemoved.length) {
          return {
            content: `确认期间这些角色已经从会话「${session.sessionTitle}」移出，本次没有重复写入。`,
            details: { sessionId: session.sessionId, removedCharacterIds: [], memberCount: fresh.length }
          }
        }
        const next = normalizedMembers(fresh.filter((member) => !requestedIds.has(member.characterId)))
        if (!next.length) return invalid('确认期间会话成员发生变化；继续移除会让会话没有正式角色，本次已停止。')
        await context.provider.replaceMembers(session.sessionId, next)
        return {
          content: `已把 ${actuallyRemoved.map((item) => item.name).join('、')} 从会话「${session.sessionTitle}」移出；角色主资料与历史消息仍保留。`,
          details: {
            sessionId: session.sessionId,
            removedCharacterIds: actuallyRemoved.map((item) => item.characterId),
            deletedIndependentBranchCharacterIds: actuallyRemoved
              .filter((item) => item.characterStateMode === 'independent_snapshot')
              .map((item) => item.characterId),
            memberCount: next.length
          }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiSetConversationMemberProbabilitiesTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  const action = '调整会话角色发言概率'
  return {
    name: 'setConversationMemberProbabilities',
    longRunning: true,
    brief: '批量调整已有会话中一个或多个正式角色的发言概率（0~100）；没有列出的成员保持原值。'
      + '只改会话参与者配置，不改角色资料或其它会话（写操作，整批只确认一次）。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '可选，会话标题、联系人名、targetId 或 sessionId；缺省为当前打开的普通会话。同名时必须用 sessionId。' },
        probabilities: {
          type: 'array', minItems: 1, maxItems: XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT,
          items: {
            type: 'object',
            properties: {
              character: { type: 'string', description: '会话内正式角色名称或 id。' },
              probability: { type: 'number', minimum: 0, maximum: 100 }
            },
            required: ['character', 'probability']
          }
        }
      },
      required: ['probabilities']
    },
    validateArgs: (args) => {
      const entries = readProbabilityEntries(args.probabilities)
      if (!entries.length) return 'setConversationMemberProbabilities 至少需要一条 probabilities 设置'
      if (entries.length > XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT) return `单次最多调整 ${XINGYI_CONVERSATION_MEMBER_CHANGE_LIMIT} 个会话角色`
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const sessionResolved = await resolveSession(context, toolCall.args.session)
      if (sessionResolved.error) return sessionResolved.error
      const session = sessionResolved.session!
      const targets = resolveProbabilityTargets(context.provider, toolCall.args.probabilities)
      if (!Array.isArray(targets)) return targets

      try {
        const before = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const beforeById = new Map(before.map((member) => [member.characterId, member]))
        const missing = targets.filter((target) => !beforeById.has(target.character.id))
        if (missing.length) return invalid(`${missing.map((item) => item.character.name).join('、')}不在会话「${session.sessionTitle}」中。`)
        const changed = targets.filter((target) => beforeById.get(target.character.id)?.replyProbability !== target.probability)
        if (!changed.length) {
          return {
            content: `这些角色在会话「${session.sessionTitle}」中的发言概率已经是目标值，本次没有修改。`,
            details: { sessionId: session.sessionId, changedCharacterIds: [] }
          }
        }
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `调整「${session.sessionTitle}」发言概率`,
          lines: changed.map((target) => {
            const current = beforeById.get(target.character.id)?.replyProbability ?? 100
            return `${target.character.name}：${current}% → ${target.probability}%`
          })
        }, action)
        if (denied) return denied

        const fresh = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const freshIds = new Set(fresh.map((member) => member.characterId))
        const nowMissing = targets.filter((target) => !freshIds.has(target.character.id))
        if (nowMissing.length) return invalid(`确认期间 ${nowMissing.map((item) => item.character.name).join('、')} 已不在该会话，本次已停止，未覆盖最新成员真值。`)
        const targetMap = new Map(targets.map((target) => [target.character.id, target.probability]))
        const next = normalizedMembers(fresh.map((member) => targetMap.has(member.characterId)
          ? { ...member, replyProbability: targetMap.get(member.characterId)! }
          : member))
        const actuallyChanged = fresh.filter((member) => targetMap.has(member.characterId) && targetMap.get(member.characterId) !== member.replyProbability)
        if (!actuallyChanged.length) {
          return {
            content: `确认期间这些发言概率已经更新为目标值，本次没有重复写入。`,
            details: { sessionId: session.sessionId, changedCharacterIds: [] }
          }
        }
        await context.provider.replaceMembers(session.sessionId, next)
        return {
          content: `已更新会话「${session.sessionTitle}」中 ${actuallyChanged.length} 个角色的发言概率。`,
          details: {
            sessionId: session.sessionId,
            changedCharacterIds: actuallyChanged.map((member) => member.characterId),
            probabilities: targets.map((target) => ({ characterId: target.character.id, probability: target.probability }))
          }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiListCharacterVersionsTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  return {
    name: 'listCharacterVersions',
    brief: '查看一个正式角色的版本（角色快照）清单，只返回版本名/id、手工或自动保护类型、创建时间和正在使用的会话数；切换版本前先用它确认准确目标。',
    schema: {
      type: 'object',
      properties: { character: { type: 'string', description: '正式角色名称或 id。' } },
      required: ['character']
    },
    validateArgs: (args) => String(args.character || '').trim() ? null : 'listCharacterVersions 缺少 character',
    execute: async (toolCall) => {
      const character = resolveXingyiNamedTarget(context.provider.listCharacters(), String(toolCall.args.character || ''), '角色')
      if (isToolResult(character)) return character
      try {
        const versions = await context.provider.listCharacterVersions(character.id)
        const lines = versions.map((version, index) => {
          const kind = version.snapshotKind === 'manual' ? '手工版本' : '自动保护版本'
          const used = version.activeBranchCount > 0 ? `，${version.activeBranchCount} 个会话正在使用` : ''
          return `${index + 1}. ${version.label || '未命名版本'}（${version.id}，${kind}，${version.createdAt}${used}）`
        })
        return {
          content: versions.length
            ? `角色「${character.name}」共有 ${versions.length} 个版本：\n${lines.join('\n')}\n角色主线不是快照；会话可切回“跟随角色主线”。`
            : `角色「${character.name}」还没有角色版本。可以用 createCharacterVersion 保存当前主线状态。`,
          details: { characterId: character.id, versions }
        }
      } catch (error) {
        return failure('查看角色版本', error)
      }
    }
  }
}

export function createXingyiCreateCharacterVersionTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  const action = '创建角色版本'
  return {
    name: 'createCharacterVersion',
    longRunning: true,
    brief: '把正式角色当前主线的核心、灵魂、轨迹与人格模型引用保存为一个不可变手工版本（角色快照）。'
      + '它不会自动切换任何会话，也不能把会话独立副本反向冒充主线版本（写操作，会先确认）。',
    schema: {
      type: 'object',
      properties: {
        character: { type: 'string', description: '正式角色名称或 id。' },
        label: { type: 'string', description: '版本名称，可选，最长 80 字；缺省由系统按时间命名。' }
      },
      required: ['character']
    },
    validateArgs: (args) => {
      if (!String(args.character || '').trim()) return 'createCharacterVersion 缺少 character'
      if (String(args.label || '').trim().length > 80) return 'createCharacterVersion 的 label 不能超过 80 字'
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const character = resolveXingyiNamedTarget(context.provider.listCharacters(), String(toolCall.args.character || ''), '角色')
      if (isToolResult(character)) return character
      const label = String(toolCall.args.label || '').trim()
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `保存${character.name}的角色版本`,
        lines: [
          `版本名：${label || '由系统按当前时间命名'}`,
          '来源：角色当前主线（核心、灵魂、轨迹与当前人格模型引用）',
          '只创建不可变快照，不切换会话、不覆盖角色主线。'
        ]
      }, action)
      if (denied) return denied
      try {
        const version = await context.provider.createCharacterVersion(character.id, label)
        return {
          content: `已为「${character.name}」创建角色版本「${version.label}」。`,
          details: { characterId: character.id, version }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiSwitchConversationCharacterVersionTool(context: XingyiConversationMemberToolContext): ToolDefinition {
  const action = '切换会话角色版本'
  return {
    name: 'switchConversationCharacterVersion',
    longRunning: true,
    brief: '切换某个已有会话里的角色状态来源：选择一个角色快照并创建本会话独立副本，或切回持续跟随角色主线。'
      + '只影响指定会话；替换或退出旧独立副本会删除该会话分支，角色主线和不可变快照不受影响（写操作，会先确认）。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '可选，会话标题、联系人名、targetId 或 sessionId；缺省为当前打开的普通会话。同名时必须用 sessionId。' },
        character: { type: 'string', description: '该会话内正式角色名称或 id。' },
        mode: { type: 'string', enum: ['snapshot', 'follow_main'], description: 'snapshot=从指定快照建立本会话独立副本；follow_main=退出独立副本并跟随角色主线。' },
        version: { type: 'string', description: 'mode=snapshot 时必填：角色快照名称或 id；先用 listCharacterVersions 查看。' }
      },
      required: ['character', 'mode']
    },
    validateArgs: (args) => {
      if (!String(args.character || '').trim()) return 'switchConversationCharacterVersion 缺少 character'
      const mode = String(args.mode || '')
      if (!['snapshot', 'follow_main'].includes(mode)) return 'mode 只能是 snapshot 或 follow_main'
      if (mode === 'snapshot' && !String(args.version || '').trim()) return 'mode=snapshot 时必须提供 version'
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const sessionResolved = await resolveSession(context, toolCall.args.session)
      if (sessionResolved.error) return sessionResolved.error
      const session = sessionResolved.session!
      const character = resolveXingyiNamedTarget(context.provider.listCharacters(), String(toolCall.args.character || ''), '角色')
      if (isToolResult(character)) return character
      const mode = String(toolCall.args.mode || '') as 'snapshot' | 'follow_main'

      try {
        const before = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const member = before.find((item) => item.characterId === character.id)
        if (!member) return invalid(`${character.name}不在会话「${session.sessionTitle}」中。`)
        if (mode === 'follow_main' && member.characterStateMode === 'follow_main') {
          return {
            content: `${character.name}在会话「${session.sessionTitle}」中已经跟随角色主线，本次没有修改。`,
            details: { sessionId: session.sessionId, characterId: character.id, mode: 'follow_main', changed: false }
          }
        }
        let version: XingyiCharacterVersion | null = null
        if (mode === 'snapshot') {
          const resolved = resolveCharacterVersion(
            await context.provider.listCharacterVersions(character.id),
            String(toolCall.args.version || '')
          )
          if (isToolResult(resolved)) return resolved
          version = resolved
        }
        const replacingIndependent = member.characterStateMode === 'independent_snapshot'
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `切换「${session.sessionTitle}」中的${character.name}版本`,
          lines: [
            `当前：${replacingIndependent ? '本会话独立副本' : '跟随角色主线'}`,
            `切换为：${mode === 'snapshot' ? `版本「${version?.label}」（${version?.id}）的本会话独立副本` : '跟随角色主线'}`,
            ...(replacingIndependent ? ['现有会话独立副本及其中未另存为快照的修改会被删除，无法恢复。'] : []),
            '角色主线、不可变版本和其它会话不会被修改。'
          ]
        }, action)
        if (denied) return denied

        const fresh = normalizedMembers(await context.provider.readMembers(session.sessionId))
        const freshIndex = fresh.findIndex((item) => item.characterId === character.id)
        if (freshIndex < 0) return invalid(`确认期间 ${character.name} 已不在该会话，本次已停止。`)
        fresh[freshIndex] = mode === 'snapshot'
          ? {
              ...fresh[freshIndex],
              characterStateMode: 'independent_snapshot',
              characterBranchId: '',
              sourceSnapshotId: version!.id
            }
          : {
              ...fresh[freshIndex],
              characterStateMode: 'follow_main',
              characterBranchId: '',
              sourceSnapshotId: ''
            }
        await context.provider.replaceMembers(session.sessionId, normalizedMembers(fresh))
        return {
          content: mode === 'snapshot'
            ? `已把会话「${session.sessionTitle}」中的${character.name}切换为版本「${version!.label}」的独立副本。`
            : `已让会话「${session.sessionTitle}」中的${character.name}切回跟随角色主线。`,
          details: {
            sessionId: session.sessionId,
            characterId: character.id,
            mode,
            versionId: version?.id || '',
            replacedIndependentBranch: replacingIndependent
          }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiConversationMemberTools(context: XingyiConversationMemberToolContext): ToolDefinition[] {
  return [
    createXingyiAddCharactersToConversationTool(context),
    createXingyiRemoveCharactersFromConversationTool(context),
    createXingyiSetConversationMemberProbabilitiesTool(context),
    createXingyiListCharacterVersionsTool(context),
    createXingyiCreateCharacterVersionTool(context),
    createXingyiSwitchConversationCharacterVersionTool(context)
  ]
}
