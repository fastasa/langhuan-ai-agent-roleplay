/** 星依角色分组管理工具：直接消费角色 Store 的正式分组与角色归属，不维护成员镜像。 */
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel
} from './agentRuntime/interactionContract'

export interface XingyiCharacterGroupItem {
  id: string
  name: string
  orderIndex?: number
}

export interface XingyiCharacterGroupMember {
  id: string
  name: string
  groupId: string
}

export interface XingyiCharacterGroupProvider {
  listGroups: () => XingyiCharacterGroupItem[]
  listCharacters: () => XingyiCharacterGroupMember[]
  createGroup: (group: XingyiCharacterGroupItem) => Promise<void>
  updateGroup: (groupId: string, changes: { name: string }) => Promise<void>
  deleteGroup: (groupId: string) => Promise<void>
  assignCharacters: (characterIds: string[], groupId: string) => Promise<void>
  moveGroup: (groupId: string, direction: -1 | 1) => Promise<void>
}

export interface XingyiCharacterGroupToolContext {
  provider: XingyiCharacterGroupProvider
  confirmWrite?: ConfirmWriteChannel
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function failure(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

function resolveNamed<T extends { id: string; name: string }>(items: T[], raw: unknown, label: string): T | { error: string } {
  const value = String(raw || '').trim()
  if (!value) return { error: `缺少${label}名称或 id` }
  const byId = items.find((item) => item.id === value)
  if (byId) return byId
  const exact = items.filter((item) => item.name === value)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return { error: `「${value}」有 ${exact.length} 个同名${label}，请改用 id：${exact.map((item) => item.id).join('、')}` }
  return { error: `没有找到${label}「${value}」。可选：${items.slice(0, 20).map((item) => `${item.name}(${item.id})`).join('、') || '（无）'}` }
}

function resolveCharacters(items: XingyiCharacterGroupMember[], raw: unknown): XingyiCharacterGroupMember[] | { error: string } {
  const values = Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : []
  if (!values.length) return { error: '缺少 characters（至少一个角色名称或 id）' }
  const result: XingyiCharacterGroupMember[] = []
  for (const value of values) {
    const resolved = resolveNamed(items, value, '角色')
    if ('error' in resolved) return resolved
    if (!result.some((item) => item.id === resolved.id)) result.push(resolved)
  }
  return result
}

function uniqueGroupName(groups: XingyiCharacterGroupItem[], name: string, exceptId = ''): string | null {
  if (!name) return '分组名称不能为空'
  if (name.length > 50) return '分组名称最多 50 个字符'
  if (groups.some((group) => group.id !== exceptId && group.name === name)) return `已存在同名分组「${name}」`
  return null
}

function createGroupId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    || Math.random().toString(36).slice(2, 14)
  return `character_group_${Date.now()}_${random}`
}

export function createListCharacterGroupsTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'listCharacterGroups',
    brief: '查看全部角色分组，以及每组下所有角色的名称和 id；管理分组前先用它核对当前真值。（只读）',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      const groups = [...ctx.provider.listGroups()].sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
      const characters = ctx.provider.listCharacters()
      const knownIds = new Set(groups.map((group) => group.id))
      const lines = groups.map((group) => {
        const members = characters.filter((character) => (character.groupId || 'default') === group.id)
        return `- ${group.name}（groupId=${group.id}，${members.length} 个角色）\n${members.map((item) => `  - ${item.name}（id=${item.id}）`).join('\n') || '  - （空组）'}`
      })
      const orphaned = characters.filter((character) => !knownIds.has(character.groupId || 'default'))
      if (orphaned.length) {
        lines.push(`- 未识别归属（${orphaned.length} 个角色，需修复到有效分组）\n${orphaned.map((item) => `  - ${item.name}（id=${item.id}，groupId=${item.groupId || 'default'}）`).join('\n')}`)
      }
      return {
        content: `当前共有 ${groups.length} 个角色分组、${characters.length} 个角色：\n${lines.join('\n') || '（暂无分组）'}`,
        details: { groupCount: groups.length, characterCount: characters.length }
      }
    }
  }
}

export function createCreateCharacterGroupTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'createCharacterGroup',
    brief: '创建新的角色分组（写操作，会先确认）。',
    schema: { type: 'object', properties: { name: { type: 'string', description: '新分组名称。' } }, required: ['name'] },
    validateArgs: (args) => uniqueGroupName(ctx.provider.listGroups(), String(args.name || '').trim()),
    execute: async (call) => {
      const name = String(call.args.name || '').trim()
      const validation = uniqueGroupName(ctx.provider.listGroups(), name)
      if (validation) return invalid(validation)
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const denied = await askConfirmWrite(ctx.confirmWrite, { title: '创建角色分组', lines: [`分组：${name}`, '操作：创建一个空角色分组。'] }, '创建角色分组')
      if (denied) return denied
      const group = { id: createGroupId(), name }
      try {
        await ctx.provider.createGroup(group)
        return { content: `已创建角色分组「${name}」（id=${group.id}）。`, details: { groupId: group.id } }
      } catch (error) { return failure('创建角色分组', error) }
    }
  }
}

export function createRenameCharacterGroupTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'renameCharacterGroup',
    brief: '修改角色分组名称；可用现名称或 groupId 指定（写操作，会先确认）。',
    schema: { type: 'object', properties: { group: { type: 'string', description: '当前分组名或 groupId。' }, name: { type: 'string', description: '新名称。' } }, required: ['group', 'name'] },
    execute: async (call) => {
      const group = resolveNamed(ctx.provider.listGroups(), call.args.group, '分组')
      if ('error' in group) return invalid(group.error)
      const name = String(call.args.name || '').trim()
      const validation = uniqueGroupName(ctx.provider.listGroups(), name, group.id)
      if (validation) return invalid(validation)
      if (name === group.name) return { content: `分组名称已经是「${name}」，无需修改。`, details: { unchanged: true } }
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const denied = await askConfirmWrite(ctx.confirmWrite, { title: '重命名角色分组', lines: [`原名称：${group.name}（${group.id}）`, `新名称：${name}`] }, '重命名角色分组')
      if (denied) return denied
      try {
        await ctx.provider.updateGroup(group.id, { name })
        return { content: `已把角色分组「${group.name}」改名为「${name}」。`, details: { groupId: group.id } }
      } catch (error) { return failure('重命名角色分组', error) }
    }
  }
}

export function createDeleteCharacterGroupTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'deleteCharacterGroup',
    brief: '删除非默认角色分组；组内角色只会移回默认组，不会删除角色（写操作，会先确认）。',
    schema: { type: 'object', properties: { group: { type: 'string', description: '分组名或 groupId。' } }, required: ['group'] },
    execute: async (call) => {
      const group = resolveNamed(ctx.provider.listGroups(), call.args.group, '分组')
      if ('error' in group) return invalid(group.error)
      if (group.id === 'default') return invalid('默认分组不可删除')
      const members = ctx.provider.listCharacters().filter((item) => (item.groupId || 'default') === group.id)
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '删除角色分组',
        lines: [`分组：${group.name}（${group.id}）`, `组内角色：${members.length} 个`, '结果：角色移回默认组；不会删除任何角色。']
      }, '删除角色分组')
      if (denied) return denied
      try {
        await ctx.provider.deleteGroup(group.id)
        return { content: `已删除角色分组「${group.name}」；${members.length} 个组内角色已移回默认组。`, details: { groupId: group.id, releasedCharacters: members.length } }
      } catch (error) { return failure('删除角色分组', error) }
    }
  }
}

export function createAssignCharactersToGroupTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'assignCharactersToGroup',
    brief: '批量把角色加入或移动到指定分组；目标给 default 即移出当前组回默认组（写操作，会先确认）。',
    schema: {
      type: 'object',
      properties: {
        characters: { type: 'array', items: { type: 'string' }, description: '一个或多个角色名或角色 id。' },
        group: { type: 'string', description: '目标分组名或 groupId；移出组时填 default。' }
      },
      required: ['characters', 'group']
    },
    execute: async (call) => {
      const group = resolveNamed(ctx.provider.listGroups(), call.args.group, '分组')
      if ('error' in group) return invalid(group.error)
      const characters = resolveCharacters(ctx.provider.listCharacters(), call.args.characters)
      if ('error' in characters) return invalid(characters.error)
      const changed = characters.filter((item) => (item.groupId || 'default') !== group.id)
      if (!changed.length) return { content: `所选角色已经都在「${group.name}」中，无需移动。`, details: { unchanged: true } }
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '移动角色分组',
        lines: [`角色（${changed.length} 个）：${changed.map((item) => `${item.name}(${item.id})`).join('、')}`, `目标分组：${group.name}（${group.id}）`]
      }, '移动角色分组')
      if (denied) return denied
      try {
        await ctx.provider.assignCharacters(changed.map((item) => item.id), group.id)
        return { content: `已把 ${changed.length} 个角色移动到「${group.name}」。`, details: { groupId: group.id, characterIds: changed.map((item) => item.id) } }
      } catch (error) { return failure('移动角色分组', error) }
    }
  }
}

export function createMoveCharacterGroupTool(ctx: XingyiCharacterGroupToolContext): ToolDefinition {
  return {
    name: 'moveCharacterGroup',
    brief: '把非默认角色分组向上或向下移动一位，调整侧栏顺序（写操作，会先确认）。',
    schema: { type: 'object', properties: { group: { type: 'string', description: '分组名或 groupId。' }, direction: { type: 'string', enum: ['up', 'down'], description: 'up=上移，down=下移。' } }, required: ['group', 'direction'] },
    execute: async (call) => {
      const group = resolveNamed(ctx.provider.listGroups(), call.args.group, '分组')
      if ('error' in group) return invalid(group.error)
      if (group.id === 'default') return invalid('默认分组位置固定，不可移动')
      const direction = call.args.direction === 'up' ? -1 : call.args.direction === 'down' ? 1 : 0
      if (!direction) return invalid('direction 必须是 up 或 down')
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const denied = await askConfirmWrite(ctx.confirmWrite, { title: '调整角色分组顺序', lines: [`分组：${group.name}（${group.id}）`, `操作：${direction === -1 ? '上移一位' : '下移一位'}`] }, '调整角色分组顺序')
      if (denied) return denied
      try {
        await ctx.provider.moveGroup(group.id, direction)
        return { content: `已将角色分组「${group.name}」${direction === -1 ? '上移' : '下移'}一位。`, details: { groupId: group.id } }
      } catch (error) { return failure('调整角色分组顺序', error) }
    }
  }
}

export function createXingyiCharacterGroupTools(ctx: XingyiCharacterGroupToolContext): ToolDefinition[] {
  return [
    createListCharacterGroupsTool(ctx),
    createCreateCharacterGroupTool(ctx),
    createRenameCharacterGroupTool(ctx),
    createDeleteCharacterGroupTool(ctx),
    createAssignCharactersToGroupTool(ctx),
    createMoveCharacterGroupTool(ctx)
  ]
}
