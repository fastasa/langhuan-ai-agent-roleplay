/** 批量角色生成的正式落库执行体：不借角色编辑弹窗共享表单，可安全并发。 */
import type { AgentModelConfig, Character } from '../types'
import { buildCharacterBrainSeedChanges } from './characterBrainSeedFromGeneration'
import { runLanghuanAgentCharacterCore, type LanghuanAgentAiCaller } from './langhuanAgentAssist'
import type { XingyiBatchCharacterOutcome, XingyiBatchCharacterProvider } from './xingyiBatchCharacterTools'

interface BatchCharacterStorePort {
  addCharacter: (character: Character) => Promise<void>
  updateCharacter: (characterId: string, changes: Partial<Character>) => Promise<void>
  getCharacter: (characterId: string) => Character | null
}

export interface CreateXingyiBatchCharacterProviderInput {
  listGroups: XingyiBatchCharacterProvider['listGroups']
  store: BatchCharacterStorePort
  getAgentConfig: () => Partial<AgentModelConfig> | null | undefined
  callAI: LanghuanAgentAiCaller
}

function createCharacterId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    || Math.random().toString(36).slice(2, 14)
  return `char_${Date.now()}_${random}`
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('批量角色生成已取消')
  error.name = 'AbortError'
  throw error
}

function buildCharacterPayload(id: string, groupId: string, changes: Record<string, unknown>): Character {
  return {
    id,
    name: String(changes.name || '').trim(),
    emoji: String(changes.emoji || '👤'),
    gender: String(changes.gender || ''),
    age: changes.age == null ? '' : String(changes.age),
    desc: String(changes.desc || ''),
    appearance: String(changes.appearance || ''),
    speakingStyle: String(changes.speakingStyle || changes.speaking_style || ''),
    personality: String(changes.personality || ''),
    outfit: String(changes.outfit || ''),
    hobbies: String(changes.hobbies || ''),
    abilities: String(changes.abilities || ''),
    experience: String(changes.experience || ''),
    worldview: String(changes.worldview || ''),
    background: String(changes.background || ''),
    groupId,
    group_id: groupId,
    avatar_path: '',
    avatarPath: '',
    speaking_style: String(changes.speakingStyle || changes.speaking_style || ''),
    nicknames: '[]',
    default_preset: '',
    default_model: '',
    schedule: '{}',
    yearly_schedule: '[]',
    current_activities: '[]',
    relationships: '{}',
    locations: '[]',
    orderIndex: 0,
    created_at: '',
    affection: 50,
    currentActivities: '[]',
    yearlySchedule: '[]',
    brainDocuments: {},
    brain_documents: '{}'
  }
}

export function createXingyiBatchCharacterProvider(input: CreateXingyiBatchCharacterProviderInput): XingyiBatchCharacterProvider {
  return {
    listGroups: input.listGroups,
    generateCharacter: async ({ brief, groupId, signal }): Promise<XingyiBatchCharacterOutcome> => {
      throwIfAborted(signal)
      const result = await runLanghuanAgentCharacterCore({
        brief,
        agentConfig: input.getAgentConfig(),
        callAI: (messages, options) => input.callAI(messages, { ...options, ...(signal ? { signal } : {}) } as never)
      })
      // 模型回包与正式落库之间仍可能恰好收到停止；再次检查，避免用户已停止后还新建角色。
      throwIfAborted(signal)
      const id = createCharacterId()
      const payload = buildCharacterPayload(id, groupId, result.changes)
      await input.store.addCharacter(payload)
      const created = input.store.getCharacter(id)
      if (!created) {
        return { ok: false, partiallyCreated: true, characterId: id, name: payload.name, message: '角色本体已创建，但创建后读取失败，无法写入灵魂与轨迹' }
      }
      try {
        throwIfAborted(signal)
        const seedResult = buildCharacterBrainSeedChanges(created, result.seed, new Date().toISOString())
        await input.store.updateCharacter(id, seedResult.changes as Partial<Character>)
        return {
          ok: true,
          characterId: id,
          name: payload.name,
          message: `核心字段 + 灵魂 ${seedResult.soulCount} 节点 + 轨迹 ${seedResult.eventCount} 个事件`
        }
      } catch (error) {
        return {
          ok: false,
          partiallyCreated: true,
          characterId: id,
          name: payload.name,
          message: `角色本体已创建并归组，但灵魂/轨迹写入失败：${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  }
}
