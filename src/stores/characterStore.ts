/**
 * stores/characterStore.ts
 * 管理：角色、角色分组、群聊、群众角色、马甲、用户信息
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Alias, BrainDocumentRecord, BrainNeuronRecord, Character, CharacterGroup, Crowd, Group, UserProfile } from '../types'
import {
  createAliasRecord,
  createCharacterGroupRecord,
  createCharacterRecord,
  createCrowdRecord,
  createGroupRecord,
  deleteAliasRecord,
  deleteCharacterGroupRecord,
  deleteCharacterRecord,
  deleteContactsBatchRecord,
  deleteCrowdRecord,
  deleteGroupRecord,
  ensureCharacterGroups,
  normalizeAvatarPath,
  normalizeAliasShape,
  normalizeCharacterShape,
  normalizeCrowdShape,
  normalizeGroupShape,
  updateAliasRecord,
  updateCharacterGroupRecord,
  updateCharacterRecord,
  updateCrowdRecord,
  updateGroupRecord,
  updateUserProfileRecord
} from '../repositories/characterRepository'
import {
  buildCharacterBrainPathPrefix,
  buildCharacterGroupChain,
  normalizeBrainDocumentRecords,
  normalizeBrainNeuronRecords
} from '../repositories/docBrainRepository'
import { runConfirmedDelete, runOptimisticPatch } from '../app/optimisticOperation'
import { measureAsync, reportDuration } from '../utils/performanceMarks'

export const useCharacterStore = defineStore('character', () => {
  // ===== 角色 =====
  const characters = ref<Character[]>([])
  const characterGroups = ref<CharacterGroup[]>([])  // 角色分组
  const collapsedCharGroups = ref<string[]>([])  // 折叠的分组ID

  // ===== 群聊 =====
  const groups = ref<Group[]>([])

  // ===== 群众角色 =====
  const crowds = ref<Crowd[]>([])
  const collapsedCrowds = ref(true)  // 群众区域默认折叠

  // ===== 马甲 =====
  const aliases = ref<Alias[]>([])

  // ===== 文档库与角色大脑 =====
  const documents = ref<BrainDocumentRecord[]>([])
  const brainNeurons = ref<BrainNeuronRecord[]>([])

  // ===== 用户信息 =====
  const userProfile = ref<UserProfile>({
    displayName: '',
    name: '用户',
    gender: '',
    age: '',
    desc: '',
    appearance: '',
    personality: '',
    outfit: '',
    hobbies: '',
    abilities: '',
    experience: '',
    worldview: '',
    background: '',
    emoji: '👤',
    avatarPath: ''
  })

  function resequenceCharacterGroups(nextGroups: CharacterGroup[]): CharacterGroup[] {
    return ensureCharacterGroups(nextGroups)
  }

  const pendingDeleteIds = ref<Record<string, string[]>>({
    characters: [],
    characterGroups: [],
    groups: [],
    crowds: [],
    aliases: []
  })
  const characterDraftVersions = new Map<string, number>()

  function getCharacterDraftFieldKey(id: string, field: string) {
    return `${id}:${field}`
  }

  function nextCharacterDraftVersions(id: string, fields: string[]) {
    const versions = new Map<string, number>()
    fields.forEach((field) => {
      const key = getCharacterDraftFieldKey(id, field)
      const version = (characterDraftVersions.get(key) || 0) + 1
      characterDraftVersions.set(key, version)
      versions.set(field, version)
    })
    return versions
  }

  function isLatestCharacterDraftVersion(id: string, field: string, version: number | undefined) {
    if (!version) return true
    return characterDraftVersions.get(getCharacterDraftFieldKey(id, field)) === version
  }

  function addPendingDelete(kind: keyof typeof pendingDeleteIds.value, id: string): void {
    const safeId = String(id || '').trim()
    if (!safeId) return
    if (pendingDeleteIds.value[kind].includes(safeId)) return
    pendingDeleteIds.value[kind] = [...pendingDeleteIds.value[kind], safeId]
  }

  function removePendingDelete(kind: keyof typeof pendingDeleteIds.value, id: string): void {
    const safeId = String(id || '').trim()
    pendingDeleteIds.value[kind] = pendingDeleteIds.value[kind].filter((item) => item !== safeId)
  }

  async function persistCharacterGroupOrder(nextGroups: CharacterGroup[]): Promise<void> {
    const groupsToPersist = nextGroups.filter((item) => item.id !== 'default')
    await Promise.all(groupsToPersist.map((item) => updateCharacterGroupRecord(item.id, { orderIndex: item.orderIndex })))
  }

  // ===== 角色 CRUD =====
  async function addCharacter(char: Character): Promise<void> {
    const payload = normalizeCharacterShape(char)
    await createCharacterRecord(payload)
    characters.value.push(payload)
  }

  async function updateCharacter(id: string, changes: Partial<Character>): Promise<void> {
    const startedAt = getPerformanceNow()
    const current = characters.value.find((item) => item.id === id)
    const changedKeys = Object.keys(changes as Record<string, unknown>)
    const rawChanges = changes as Partial<Character> & { avatar?: unknown }
    const avatarValue = rawChanges.avatarPath ?? rawChanges.avatar_path ?? rawChanges.avatar
    const hasAvatarChange = avatarValue !== undefined
    try {
      const normalizedChanges = normalizeCharacterShape({
        ...(current || {}),
        ...changes
      })
      const persistChanges: Partial<Character> = { ...changes }
      const groupValue = changes.groupId ?? changes.group_id
      if (groupValue !== undefined) {
        persistChanges.groupId = groupValue
        persistChanges.group_id = groupValue
      }
      if (hasAvatarChange) {
        const normalizedAvatar = normalizeAvatarPath(String(avatarValue || ''))
        persistChanges.avatarPath = normalizedAvatar
        persistChanges.avatar_path = normalizedAvatar
      }
      await runOptimisticPatch({
        target: current,
        next: normalizedChanges,
        persist: () => measureAsync('character.update.persist', () => updateCharacterRecord(id, persistChanges), {
          id,
          changedKeys,
          cognitionSize: summarizeJsonLike(persistChanges.brainCognitionNodes ?? persistChanges.brain_cognition_nodes).length,
          traceSize: summarizeJsonLike(persistChanges.brainTraceNodes ?? persistChanges.brain_trace_nodes).length
        }, 50),
        reconcile: (data) => {
          const c = characters.value.find(c => c.id === id)
          if (!c) return
          const avatarPath = hasAvatarChange && data.avatarPath !== undefined ? data.avatarPath : c.avatarPath
          const groupValue = normalizedChanges.groupId ?? normalizedChanges.group_id ?? c.groupId ?? c.group_id
          Object.assign(c, normalizeCharacterShape({
            ...c,
            ...normalizedChanges,
            avatarPath,
            groupId: groupValue
          }))
        }
      })
    } finally {
      reportDuration('character.update.total', startedAt, {
        id,
        changedKeys,
        hasBrainCognitionNodes: changedKeys.includes('brainCognitionNodes') || changedKeys.includes('brain_cognition_nodes'),
        hasBrainTraceNodes: changedKeys.includes('brainTraceNodes') || changedKeys.includes('brain_trace_nodes')
      }, 50)
    }
  }

  async function commitCharacterUpdate(id: string, changes: Partial<Character>): Promise<void> {
    const startedAt = getPerformanceNow()
    const changedKeys = Object.keys(changes as Record<string, unknown>)
    try {
      const data = await measureAsync('character.commit.persist', () => updateCharacterRecord(id, changes), {
        id,
        changedKeys,
        cognitionSize: summarizeJsonLike(changes.brainCognitionNodes ?? changes.brain_cognition_nodes).length,
        traceSize: summarizeJsonLike(changes.brainTraceNodes ?? changes.brain_trace_nodes).length
      }, 10)
      const c = characters.value.find(c => c.id === id)
      if (!c) return
      const avatarPath = data.avatarPath !== undefined ? data.avatarPath : c.avatarPath
      const groupValue = changes.groupId ?? changes.group_id ?? c.groupId ?? c.group_id
      Object.assign(c, normalizeCharacterShape({
        ...c,
        ...changes,
        avatarPath,
        groupId: groupValue
      }))
    } finally {
      reportDuration('character.commit.total', startedAt, {
        id,
        changedKeys,
        hasBrainCognitionNodes: changedKeys.includes('brainCognitionNodes') || changedKeys.includes('brain_cognition_nodes'),
        hasBrainTraceNodes: changedKeys.includes('brainTraceNodes') || changedKeys.includes('brain_trace_nodes')
      }, 10)
    }
  }

  async function deleteCharacter(id: string): Promise<void> {
    await runConfirmedDelete({
      markPending: () => addPendingDelete('characters', id),
      clearPending: () => removePendingDelete('characters', id),
      persist: () => deleteCharacterRecord(id),
      removeLocal: () => {
        characters.value = characters.value.filter(c => c.id !== id)
      }
    })
  }

  async function deleteContactsBatch(items: Array<{ kind: 'char' | 'group' | 'crowd'; id: string }>): Promise<void> {
    const normalizedItems = Array.from(new Map(
      (Array.isArray(items) ? items : [])
        .map((item) => ({
          kind: item?.kind,
          id: String(item?.id || '').trim()
        }))
        .filter((item): item is { kind: 'char' | 'group' | 'crowd'; id: string } => (
          Boolean(item.id) && ['char', 'group', 'crowd'].includes(item.kind)
        ))
        .map((item) => [`${item.kind}:${item.id}`, item])
    ).values())
    if (!normalizedItems.length) return

    const kindToPendingKey = {
      char: 'characters',
      group: 'groups',
      crowd: 'crowds'
    } as const
    normalizedItems.forEach((item) => addPendingDelete(kindToPendingKey[item.kind], item.id))
    try {
      await deleteContactsBatchRecord(normalizedItems)
      const characterIds = new Set(normalizedItems.filter((item) => item.kind === 'char').map((item) => item.id))
      const groupIds = new Set(normalizedItems.filter((item) => item.kind === 'group').map((item) => item.id))
      const crowdIds = new Set(normalizedItems.filter((item) => item.kind === 'crowd').map((item) => item.id))
      characters.value = characters.value.filter((item) => !characterIds.has(item.id))
      groups.value = groups.value.filter((item) => !groupIds.has(item.id))
      crowds.value = crowds.value.filter((item) => !crowdIds.has(item.id))
    } finally {
      normalizedItems.forEach((item) => removePendingDelete(kindToPendingKey[item.kind], item.id))
    }
  }

  // 根据ID获取角色
  function getCharacter(id: string): Character | null {
    return characters.value.find(c => c.id === id) || null
  }

  // ===== 角色分组 CRUD =====
  async function addCharGroup(group: CharacterGroup): Promise<void> {
    const nextGroups = resequenceCharacterGroups([...characterGroups.value, {
      ...group,
      orderIndex: characterGroups.value.filter((item) => item.id !== 'default').length + 1
    }])
    const createdGroup = nextGroups.find((item) => item.id === group.id)
    await createCharacterGroupRecord(createdGroup || group)
    characterGroups.value = nextGroups
  }

  async function updateCharGroup(id: string, changes: Partial<CharacterGroup>): Promise<void> {
    const group = characterGroups.value.find((item) => item.id === id)
    await runOptimisticPatch({
      target: group,
      next: changes,
      persist: () => updateCharacterGroupRecord(id, changes),
      reconcile: () => {
        characterGroups.value = resequenceCharacterGroups(characterGroups.value)
      }
    })
  }

  async function deleteCharGroup(id: string): Promise<void> {
    if (id === 'default') return
    const affectedCharacters = characters.value.filter((c: Character & { groupId?: string; group_id?: string }) => {
      const currentGroupId = String(c.groupId ?? c.group_id ?? '').trim()
      return currentGroupId === id
    })
    const affectedGroups = groups.value.filter((group: Group & { groupId?: string; group_id?: string }) => {
      const currentGroupId = String(group.groupId ?? group.group_id ?? '').trim()
      return currentGroupId === id
    })
    const affectedCrowds = crowds.value.filter((crowd: Crowd & { groupId?: string; group_id?: string }) => {
      const currentGroupId = String(crowd.groupId ?? crowd.group_id ?? '').trim()
      return currentGroupId === id
    })
    await runConfirmedDelete({
      markPending: () => addPendingDelete('characterGroups', id),
      clearPending: () => removePendingDelete('characterGroups', id),
      persist: async () => {
        await Promise.all([
          ...affectedCharacters.map((item) => updateCharacterRecord(item.id, { groupId: 'default', group_id: 'default' })),
          ...affectedGroups.map((item) => updateGroupRecord(item.id, { groupId: 'default', group_id: 'default' })),
          ...affectedCrowds.map((item) => updateCrowdRecord(item.id, { groupId: 'default', group_id: 'default' }))
        ])
        await deleteCharacterGroupRecord(id)
      },
      removeLocal: () => {
        characterGroups.value = resequenceCharacterGroups(characterGroups.value.filter(g => g.id !== id))
        // 把该组别下的全部元素移到默认组别
        characters.value.forEach(c => {
          const currentGroupId = String((c as Character & { groupId?: string; group_id?: string }).groupId ?? (c as Character & { groupId?: string; group_id?: string }).group_id ?? '').trim()
          if (currentGroupId === id) {
            ;(c as Character & { groupId: string; group_id: string }).groupId = 'default'
            ;(c as Character & { groupId: string; group_id: string }).group_id = 'default'
          }
        })
        groups.value.forEach(group => {
          const currentGroupId = String((group as Group & { groupId?: string; group_id?: string }).groupId ?? (group as Group & { groupId?: string; group_id?: string }).group_id ?? '').trim()
          if (currentGroupId === id) {
            ;(group as Group & { groupId: string; group_id: string }).groupId = 'default'
            ;(group as Group & { groupId: string; group_id: string }).group_id = 'default'
          }
        })
        crowds.value.forEach(crowd => {
          const currentGroupId = String((crowd as Crowd & { groupId?: string; group_id?: string }).groupId ?? (crowd as Crowd & { groupId?: string; group_id?: string }).group_id ?? '').trim()
          if (currentGroupId === id) {
            ;(crowd as Crowd & { groupId: string; group_id: string }).groupId = 'default'
            ;(crowd as Crowd & { groupId: string; group_id: string }).group_id = 'default'
          }
        })
      }
    })
  }

  async function moveCharGroup(id: string, direction: -1 | 1): Promise<void> {
    if (id === 'default') return
    const movableGroups = characterGroups.value.filter((item) => item.id !== 'default')
    const currentIndex = movableGroups.findIndex((item) => item.id === id)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= movableGroups.length) return

    const reordered = [...movableGroups]
    const [currentGroup] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, currentGroup)

    const nextGroups = resequenceCharacterGroups([
      characterGroups.value.find((item) => item.id === 'default') || { id: 'default', name: '默认', orderIndex: 0 },
      ...reordered
    ])
    await persistCharacterGroupOrder(nextGroups)
    characterGroups.value = nextGroups
  }

  // ===== 群聊 CRUD =====
  async function addGroup(group: Group): Promise<void> {
    const payload = normalizeGroupShape(group)
    const result = await createGroupRecord(payload)
    groups.value.push(normalizeGroupShape({
      ...payload,
      avatarPath: result.avatarPath !== undefined ? result.avatarPath : payload.avatarPath
    }))
  }

  async function updateGroup(id: string, changes: Partial<Group>): Promise<void> {
    const current = groups.value.find((item) => item.id === id)
    const payload = normalizeGroupShape({
      ...(current || {}),
      ...changes
    }, characters.value)
    await runOptimisticPatch({
      target: current,
      next: payload,
      persist: () => updateGroupRecord(id, payload),
      reconcile: (result) => {
        const g = groups.value.find(g => g.id === id)
        if (!g) return
        Object.assign(g, normalizeGroupShape({
          ...g,
          ...payload,
          avatarPath: result.avatarPath !== undefined ? result.avatarPath : payload.avatarPath ?? g.avatarPath
        }))
      }
    })
  }

  async function deleteGroup(id: string): Promise<void> {
    await runConfirmedDelete({
      markPending: () => addPendingDelete('groups', id),
      clearPending: () => removePendingDelete('groups', id),
      persist: () => deleteGroupRecord(id),
      removeLocal: () => {
        groups.value = groups.value.filter(g => g.id !== id)
      }
    })
  }

  // ===== 群众角色 CRUD =====
  async function addCrowd(crowd: Crowd): Promise<void> {
    const payload = normalizeCrowdShape(crowd)
    await createCrowdRecord(payload)
    crowds.value.push(payload as Crowd)
  }

  async function updateCrowd(id: string, changes: Partial<Crowd>): Promise<void> {
    const current = crowds.value.find((item) => item.id === id)
    const payload = normalizeCrowdShape({
      ...(current || {}),
      ...changes
    })
    await runOptimisticPatch({
      target: current,
      next: payload as Partial<Crowd>,
      persist: () => updateCrowdRecord(id, payload)
    })
  }

  async function deleteCrowd(id: string): Promise<void> {
    await runConfirmedDelete({
      markPending: () => addPendingDelete('crowds', id),
      clearPending: () => removePendingDelete('crowds', id),
      persist: () => deleteCrowdRecord(id),
      removeLocal: () => {
        crowds.value = crowds.value.filter(c => c.id !== id)
      }
    })
  }

  // ===== 马甲 CRUD =====
  async function addAlias(alias: Alias): Promise<void> {
    const payload = normalizeAliasShape(alias)
    const result = await createAliasRecord(payload)
    aliases.value.push(normalizeAliasShape({
      ...payload,
      ...(result && typeof result === 'object' ? result : {})
    }))
  }

  async function updateAlias(id: string, changes: Partial<Alias>): Promise<void> {
    const a = aliases.value.find(a => a.id === id)
    const payload = normalizeAliasShape({
      ...(a || {}),
      ...changes
    })
    await runOptimisticPatch({
      target: a,
      next: payload,
      persist: () => updateAliasRecord(id, payload),
      reconcile: (result) => {
        const current = aliases.value.find(item => item.id === id)
        if (!current) return
        Object.assign(current, normalizeAliasShape({
          ...current,
          ...payload,
          ...(result && typeof result === 'object' ? result : {})
        }))
      }
    })
  }

  async function deleteAlias(id: string): Promise<void> {
    await runConfirmedDelete({
      markPending: () => addPendingDelete('aliases', id),
      clearPending: () => removePendingDelete('aliases', id),
      persist: () => deleteAliasRecord(id),
      removeLocal: () => {
        aliases.value = aliases.value.filter(a => a.id !== id)
      }
    })
  }

  // ===== 用户信息 =====
  function extractUserProfilePayload(result: unknown): Partial<UserProfile> {
    const data = result && typeof result === 'object' ? result as Record<string, unknown> : {}
    const avatarPath = data.avatarPath ?? data.avatar_path
    return {
      ...(data.displayName !== undefined ? { displayName: String(data.displayName || '') } : {}),
      ...(data.name !== undefined ? { name: String(data.name || '') } : {}),
      ...(data.gender !== undefined ? { gender: String(data.gender || '') } : {}),
      ...(data.age !== undefined ? { age: String(data.age || '') } : {}),
      ...(data.desc !== undefined ? { desc: String(data.desc || '') } : {}),
      ...(data.emoji !== undefined ? { emoji: String(data.emoji || '') } : {}),
      ...(avatarPath !== undefined ? { avatarPath: normalizeAvatarPath(String(avatarPath || '')) } : {}),
      ...(data.appearance !== undefined ? { appearance: String(data.appearance || '') } : {}),
      ...(data.personality !== undefined ? { personality: String(data.personality || '') } : {}),
      ...(data.outfit !== undefined ? { outfit: String(data.outfit || '') } : {}),
      ...(data.hobbies !== undefined ? { hobbies: String(data.hobbies || '') } : {}),
      ...(data.abilities !== undefined ? { abilities: String(data.abilities || '') } : {}),
      ...(data.experience !== undefined ? { experience: String(data.experience || '') } : {}),
      ...(data.worldview !== undefined ? { worldview: String(data.worldview || '') } : {}),
      ...(data.background !== undefined ? { background: String(data.background || '') } : {})
    }
  }

  async function updateUserProfile(changes: Partial<UserProfile>): Promise<Record<string, unknown>> {
    const result = await runOptimisticPatch({
      target: userProfile.value,
      next: changes,
      persist: () => updateUserProfileRecord(changes),
      reconcile: (result) => {
        Object.assign(userProfile.value, extractUserProfilePayload(result))
      }
    })
    return result as Record<string, unknown>
  }

  function setDocuments(nextDocuments: unknown[]): void {
    documents.value = normalizeBrainDocumentRecords(nextDocuments)
  }

  function setBrainNeurons(nextBrainNeurons: unknown[]): void {
    brainNeurons.value = normalizeBrainNeuronRecords(nextBrainNeurons)
  }

  function getDocument(documentId: string): BrainDocumentRecord | null {
    const normalizedId = String(documentId || '').trim()
    if (!normalizedId) return null
    return documents.value.find((item) => item.documentId === normalizedId || item.id === normalizedId) || null
  }

  function getBrainNeuron(brainNeuronId: string): BrainNeuronRecord | null {
    const normalizedId = String(brainNeuronId || '').trim()
    if (!normalizedId) return null
    return brainNeurons.value.find((item) => item.brainNeuronId === normalizedId) || null
  }

  // ===== 计算属性 =====
  // 按分组归类的角色列表
  const charactersByGroup = computed(() => {
    const result: Record<string, Character[]> = {}
    for (const g of characterGroups.value) {
      result[g.id] = characters.value.filter((c: any) => c.groupId === g.id || c.group_id === g.id || c.group === g.id)
    }
    return result
  })

  const characterBrainPrefixes = computed(() => {
    const result: Record<string, string> = {}
    for (const character of characters.value) {
      const prefix = buildCharacterBrainPathPrefix(character, characterGroups.value)
      if (prefix) {
        result[String(character.id)] = prefix.displayPrefix
      }
    }
    return result
  })

  function getCharacterGroupChain(groupId: string): string[] {
    return buildCharacterGroupChain(groupId, characterGroups.value)
  }

  function getCharacterBrainPrefix(characterId: string): string {
    const normalizedId = String(characterId || '').trim()
    if (!normalizedId) return '/未分组/未命名角色'
    const cached = characterBrainPrefixes.value[normalizedId]
    if (cached) return cached
    const character = getCharacter(normalizedId)
    const prefix = buildCharacterBrainPathPrefix(character, characterGroups.value)
    return prefix?.displayPrefix || '/未分组/未命名角色'
  }

  return {
    characters, characterGroups, collapsedCharGroups,
    groups, crowds, collapsedCrowds,
    aliases, userProfile, pendingDeleteIds,
    documents, brainNeurons,
    // 角色
    addCharacter, updateCharacter, commitCharacterUpdate, deleteCharacter, deleteContactsBatch, getCharacter,
    // 分组
    addCharGroup, updateCharGroup, deleteCharGroup, moveCharGroup,
    // 群聊
    addGroup, updateGroup, deleteGroup,
    // 群众
    addCrowd, updateCrowd, deleteCrowd,
    // 马甲
    addAlias, updateAlias, deleteAlias,
    // 用户
    updateUserProfile,
    setDocuments, setBrainNeurons,
    getDocument, getBrainNeuron,
    // 计算属性
    charactersByGroup,
    characterBrainPrefixes,
    getCharacterGroupChain,
    getCharacterBrainPrefix
  }
})

function getPerformanceNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function summarizeJsonLike(value: unknown) {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? '')
  } catch {
    return ''
  }
}
