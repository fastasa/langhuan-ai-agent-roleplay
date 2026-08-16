export type LocalArchiveModuleName = 'resources' | 'characters' | 'chats' | 'settings' | 'tasks'

export type LocalArchiveModuleDefinition = {
  name: LocalArchiveModuleName
  label: string
  description: string
  includes: string[]
}

export type LocalArchiveArchiveRegistryEntry = {
  note: string
  createdAt: string
  updatedAt: string
}

export type LocalArchiveArchiveRegistry = {
  version: 1
  slots: Record<string, LocalArchiveArchiveRegistryEntry>
}

export type LocalArchiveArchiveItem = {
  name: string
  note: string
  createdAt: string
  updatedAt: string
  moduleCount: number
}

export type LocalArchiveActionPhase =
  | 'idle'
  | 'loading'
  | 'uploading'
  | 'downloading'
  | 'creating'
  | 'renaming'
  | 'saving-note'
  | 'deleting'

export const LOCAL_ARCHIVE_MODULES: LocalArchiveModuleName[] = ['resources', 'characters', 'chats', 'settings', 'tasks']

export const LOCAL_ARCHIVE_MODULE_DEFINITIONS: LocalArchiveModuleDefinition[] = [
  {
    name: 'resources',
    label: '资源',
    description: '点数、金钱、时间块、票据与资源记录。',
    includes: ['点数', '金钱', '大时间块/小时间块', '票据', '票据分类', '资源历史', '进行中的计时器']
  },
  {
    name: 'characters',
    label: '角色',
    description: '角色资料、分组、关系、用户资料与头像路径。',
    includes: ['角色资料', '角色分组', '群聊/群众配置', '别名', '用户资料', '已落盘头像路径']
  },
  {
    name: 'chats',
    label: '聊天',
    description: '会话、消息、总结、文档库和当前聊天定位。',
    includes: ['聊天会话', '聊天消息', '小总结/大总结', '总结库', '文档库字段树', '当前聊天目标', '当前会话状态']
  },
  {
    name: 'settings',
    label: '设置',
    description: '接口预设、提示词预设、环境与显示设置。',
    includes: ['API 预设', '提示词预设', '默认预设', 'TTS 设置', '天气/地点/时间', '深浅色模式', '总结相关提示词']
  },
  {
    name: 'tasks',
    label: '任务',
    description: '任务系统、日报、标签和事栈。',
    includes: ['任务列表', '任务留档', '每日报告', '等级与活跃度', '自定义标签', '事栈']
  }
]

export const META_SLOT_SUFFIX = '__meta_v1'
export const MODULE_SLOT_PREFIX = '__mod_'
export const REGISTRY_SLOT = '__slot_registry_v1'

export function normalizeModuleNames(moduleNames?: LocalArchiveModuleName[] | string[]): LocalArchiveModuleName[] {
  const input = Array.isArray(moduleNames) ? moduleNames : LOCAL_ARCHIVE_MODULES
  const picked = input
    .map(name => String(name || '').trim())
    .filter((name): name is LocalArchiveModuleName => LOCAL_ARCHIVE_MODULES.includes(name as LocalArchiveModuleName))
  return Array.from(new Set(picked))
}

export function normalizeSlotName(input: string) {
  return String(input || '').trim().replace(/\s+/g, ' ')
}

export function getMetaSlotName(slotName: string): string {
  return `${slotName}${META_SLOT_SUFFIX}`
}

export function getModuleSlotName(slotName: string, moduleName: LocalArchiveModuleName): string {
  return `${slotName}${MODULE_SLOT_PREFIX}${moduleName}`
}

export function getLocalMetaCacheKey(slotName: string, userId: string): string {
  return `langhuan_localArchive_slot_meta_${userId}_${slotName}`
}

export function getChangedModuleNames(remoteMeta: any, localMeta: any): LocalArchiveModuleName[] {
  return LOCAL_ARCHIVE_MODULES.filter((moduleName) => {
    const remoteHash = String(remoteMeta?.modules?.[moduleName]?.hash || '')
    if (!remoteHash) return false
    const localHash = String(localMeta?.modules?.[moduleName]?.hash || '')
    return remoteHash !== localHash
  })
}

export function isReservedSlotName(slotName: string) {
  return !slotName || slotName === REGISTRY_SLOT || slotName.endsWith(META_SLOT_SUFFIX) || slotName.includes(MODULE_SLOT_PREFIX)
}

export function getManagedSlotNames(slotName: string): string[] {
  return [
    slotName,
    getMetaSlotName(slotName),
    ...LOCAL_ARCHIVE_MODULES.map(moduleName => getModuleSlotName(slotName, moduleName))
  ]
}

export function parseRegistryPayload(payload: any): LocalArchiveArchiveRegistry {
  const slots = payload && typeof payload === 'object' && payload.slots && typeof payload.slots === 'object'
    ? payload.slots
    : {}

  const normalized: Record<string, LocalArchiveArchiveRegistryEntry> = {}

  for (const [name, entry] of Object.entries(slots)) {
    const safeName = normalizeSlotName(name)
    if (isReservedSlotName(safeName)) continue

    const current = entry && typeof entry === 'object' ? entry as Record<string, any> : {}
    normalized[safeName] = {
      note: String(current.note || ''),
      createdAt: String(current.createdAt || current.updatedAt || ''),
      updatedAt: String(current.updatedAt || current.createdAt || '')
    }
  }

  return {
    version: 1,
    slots: normalized
  }
}

export function stableHash(value: unknown): string {
  const text = JSON.stringify(value) || ''
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return `${text.length}_${(hash >>> 0).toString(16)}`
}

export function getAvailableSlotNames(localArchiveSlots: any[]): string[] {
  const allNames = (localArchiveSlots || []).map((slot: any) => String(slot.slot_name || slot.name || ''))
  const baseSet = new Set<string>()
  for (const name of allNames) {
    if (!name || name === REGISTRY_SLOT) continue
    if (name.endsWith(META_SLOT_SUFFIX)) {
      baseSet.add(name.slice(0, -META_SLOT_SUFFIX.length))
      continue
    }
    if (name.includes(MODULE_SLOT_PREFIX)) continue
    baseSet.add(name)
  }
  return Array.from(baseSet).filter(name => !isReservedSlotName(name))
}

export function sanitizeAvatarField(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith('data:')) return ''
  return text
}

export function sanitizeCharacterLocalArchivePayload(input: any) {
  const cloned = JSON.parse(JSON.stringify(input || {}))

  if (Array.isArray(cloned.characters)) {
    cloned.characters = cloned.characters.map((char: any) => {
      const next = { ...char }
      next.avatarPath = sanitizeAvatarField(next.avatarPath ?? next.avatar_path)
      if ('avatar_path' in next) {
        next.avatar_path = next.avatarPath
      }
      delete next.avatar
      return next
    })
  }

  if (Array.isArray(cloned.characterGroups)) {
    cloned.characterGroups = cloned.characterGroups.map((group: any) => {
      const next = { ...group }
      next.avatarPath = sanitizeAvatarField(next.avatarPath ?? next.avatar_path)
      if ('avatar_path' in next) {
        next.avatar_path = next.avatarPath
      }
      delete next.avatar
      return next
    })
  }

  if (cloned.userProfile && typeof cloned.userProfile === 'object') {
    cloned.userProfile = {
      ...cloned.userProfile,
      avatarPath: sanitizeAvatarField(cloned.userProfile.avatarPath ?? cloned.userProfile.avatar_path)
    }
    if ('avatar_path' in cloned.userProfile) {
      cloned.userProfile.avatar_path = cloned.userProfile.avatarPath
    }
    delete cloned.userProfile.avatar
  }

  return cloned
}
