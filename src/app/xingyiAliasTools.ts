/**
 * 星依马甲工具（2026-07-12）——「读马甲 / 建改马甲 / 删马甲 / 切换马甲」四件。
 *
 * 马甲（Alias）=用户在不同世界/场景中的身份。真值与边界：
 *  - 清单与增删改：charStore.aliases——浮坞注入 provider 包装 addAlias/updateAlias/deleteAlias，
 *    与帷幕「马甲设置」弹窗同一套 store 写入链路（联动能力：useCharacterManagement.saveAlias/deleteAlias，
 *    后续若用户要求统一改马甲字段集或删除语义，两处要同步）。
 *  - 切换=会话级绑定：会话字段 boundAlias（''=默认身份=用户本人资料，见 useCharacterManagement.bindAlias）。
 *    活动会话/非活动会话怎么写由 provider 实现方保证（浮坞：活动会话走 chatStore.updateSession 内存同步，
 *    非活动会话走 saveChatSessionPatchById 服务端直写）。
 *  - 「一句描述创建」由星依模型自己扩写字段（同 upsertChangelogVersion 范式：模型起草、工具只校验+确认+落库），
 *    扩写口径见知识库 2.14。
 *
 * 写确认门（硬门）语义与 xingyiFunctionTools 一致，模板单一实现=interactionContract 统一 helper（2026-07-12 批C 收敛）：
 * confirmWrite 缺失一律拒绝执行；用户取消返回「已取消」的成功态结果（模型不重试）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel } from './agentRuntime/interactionContract'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'
import { resolveXingyiSessionForCall, type XingyiSessionContextSeam } from './xingyiSessionContext'

/** 马甲数据接缝（浮坞注入·包 charStore/chatStore）：工具层不直接碰 store，保持自包含可测。 */
export interface XingyiAliasProvider {
  /** 当前本地资料真值；name=角色扮演姓名，displayName=界面昵称，二者不可混用。 */
  getUserProfile: () => Record<string, unknown>
  /** 全部马甲（charStore.aliases 原样记录，字段驼峰为准）。 */
  listAliases: () => Array<Record<string, unknown>>
  createAlias: (alias: Record<string, unknown>) => Promise<void>
  updateAlias: (id: string, changes: Record<string, unknown>) => Promise<void>
  deleteAlias: (id: string) => Promise<void>
  /** 给指定会话绑定马甲；aliasId 传空串=切回默认身份（用户本人资料）。 */
  bindSessionAlias: (sessionId: string, aliasId: string) => Promise<void>
  /** 活动会话当前绑定的马甲 id：null=没有打开中的会话；''=默认身份。 */
  getActiveSessionBoundAliasId: () => string | null
}

export interface XingyiAliasToolContext extends XingyiSessionContextSeam {
  /** 写确认门（同 xingyiFunctionTools 硬门语义：缺省一律拒绝执行写操作）。 */
  confirmWrite?: XingyiWriteConfirm
  provider: XingyiAliasProvider
}

/** 马甲字段全集（与帷幕「马甲编辑」弹窗表单同一套字段，见 useCharacterManagement.aliasForm）。 */
const ALIAS_FIELDS = [
  { key: 'name', label: '名称' },
  { key: 'emoji', label: '表情' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'desc', label: '简介' },
  { key: 'appearance', label: '外貌' },
  { key: 'personality', label: '性格' },
  { key: 'outfit', label: '穿搭' },
  { key: 'hobbies', label: '爱好' },
  { key: 'abilities', label: '能力' },
  { key: 'experience', label: '经历' },
  { key: 'worldview', label: '世界观' },
  { key: 'background', label: '背景' }
] as const

const CLIP_LIMIT = 80

const USER_PROFILE_FIELDS = [
  { key: 'displayName', label: '用户昵称' },
  { key: 'name', label: '角色扮演姓名' },
  { key: 'emoji', label: 'Emoji' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'desc', label: '简介' },
  { key: 'appearance', label: '外貌与身材' },
  { key: 'personality', label: '性格' },
  { key: 'outfit', label: '穿搭' },
  { key: 'hobbies', label: '爱好' },
  { key: 'abilities', label: '能力' },
  { key: 'experience', label: '经历' },
  { key: 'worldview', label: '世界观' },
  { key: 'background', label: '背景' }
] as const

function clipText(text: string, limit = CLIP_LIMIT): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

function aliasIdOf(record: Record<string, unknown>): string {
  return String(record.id || '').trim()
}

function aliasNameOf(record: Record<string, unknown>): string {
  return String(record.name || '').trim() || '未命名马甲'
}

function listAliasNames(aliases: Array<Record<string, unknown>>): string {
  if (!aliases.length) return '（还没有任何马甲）'
  return aliases.slice(0, 20).map((item) => `${aliasNameOf(item)}(${aliasIdOf(item)})`).join('、')
}

/** 马甲名/id → 记录解析：先精确 id，再精确名称，最后唯一子串；歧义/未命中给可读候选（同单位工具解析口径）。 */
export function resolveXingyiAlias(
  aliases: Array<Record<string, unknown>>,
  identifier: string
): { alias?: Record<string, unknown>; error?: string } {
  const name = String(identifier || '').trim()
  if (!name) return { error: '缺少马甲名称或 id。' }
  const byId = aliases.find((item) => aliasIdOf(item) === name)
  if (byId) return { alias: byId }
  const exact = aliases.filter((item) => String(item.name || '').trim() === name)
  if (exact.length === 1) return { alias: exact[0] }
  if (exact.length > 1) {
    return { error: `有 ${exact.length} 个同名马甲「${name}」，请改用 id 指定：${exact.map((item) => `${aliasNameOf(item)}(${aliasIdOf(item)})`).join('、')}` }
  }
  const partial = aliases.filter((item) => String(item.name || '').includes(name))
  if (partial.length === 1) return { alias: partial[0] }
  if (partial.length > 1) {
    return { error: `「${name}」匹配到多个马甲，请用完整名称或 id：${partial.map((item) => `${aliasNameOf(item)}(${aliasIdOf(item)})`).join('、')}` }
  }
  return { error: `没有找到马甲「${name}」。现有马甲：${listAliasNames(aliases)}。可先用 listAliases 查看清单。` }
}

/** 从工具入参里取显式给出的马甲字段（键在场才算给了；空串=显式清空该字段）。 */
function readAliasFieldChanges(args: Record<string, unknown>): Record<string, string> {
  const changes: Record<string, string> = {}
  for (const field of ALIAS_FIELDS) {
    if (args[field.key] !== undefined) changes[field.key] = String(args[field.key] ?? '').trim()
  }
  return changes
}

function describeFieldLines(changes: Record<string, string>): string[] {
  return ALIAS_FIELDS
    .filter((field) => changes[field.key] !== undefined)
    .map((field) => `${field.label}：${changes[field.key] ? clipText(changes[field.key]) : '（清空）'}`)
}

/** 工具0：读取“我的信息”完整资料。这里只报告头像是否设置；真看头像必须显式调用 viewAvatar。 */
export function createReadUserProfileTool(context: XingyiAliasToolContext): ToolDefinition {
  return {
    name: 'readUserProfile',
    brief: '读取用户在“我的信息”里保存的完整文字资料（只读）：区分用户昵称与角色扮演姓名，并返回性别、年龄、简介、外貌与身材、性格、穿搭、爱好、能力、经历、世界观、背景。这里只报告头像是否设置；要实际看头像请调用 viewAvatar。创建马甲前应先读一次。',
    schema: { type: 'object', properties: {} },
    execute: async () => {
      const profile = context.provider.getUserProfile() || {}
      const lines = ['【用户资料·我的信息】']
      for (const field of USER_PROFILE_FIELDS) {
        const value = String(profile[field.key] ?? '').trim()
        lines.push(`${field.label}：${value || '（空）'}`)
      }
      const avatarPath = String(profile.avatarPath ?? profile.avatar_path ?? '').trim()
      lines.push(`头像：${avatarPath ? '已设置' : '未设置'}`)
      return { content: lines.join('\n'), details: { hasAvatar: Boolean(avatarPath) } }
    }
  }
}

/** 工具1：读马甲清单/详情（只读，不过确认门）。 */
export function createListAliasesTool(context: XingyiAliasToolContext): ToolDefinition {
  return {
    name: 'listAliases',
    brief: '看用户的马甲（用户在不同世界/场景中的身份）：全部马甲摘要与当前会话正在使用的身份；给 alias 参数可看单个马甲的完整字段（只读）。',
    schema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: '可选：马甲名称或 id——给了就返回这个马甲的完整字段；缺省=全部马甲摘要。' }
      }
    },
    execute: async (toolCall) => {
      const aliases = context.provider.listAliases()
      const identifier = String(toolCall.args.alias || '').trim()
      if (identifier) {
        const resolved = resolveXingyiAlias(aliases, identifier)
        if (!resolved.alias) return invalidArgumentResult(resolved.error || '解析马甲失败')
        const record = resolved.alias
        const lines = [`【马甲·${aliasNameOf(record)}（id:${aliasIdOf(record)}）】`]
        for (const field of ALIAS_FIELDS) {
          if (field.key === 'name') continue
          const value = String(record[field.key] ?? '').trim()
          lines.push(`${field.label}：${value || '（空）'}`)
        }
        return { content: lines.join('\n'), details: { aliasId: aliasIdOf(record) } }
      }
      const lines: string[] = [`【马甲清单】共 ${aliases.length} 个。`]
      for (const record of aliases) {
        const brief = [String(record.gender || '').trim(), String(record.age || '').trim(), clipText(String(record.desc || ''), 40)]
          .filter(Boolean).join('·')
        lines.push(`- ${aliasNameOf(record)}（id:${aliasIdOf(record)}）${brief ? `：${brief}` : ''}`)
      }
      if (!aliases.length) lines.push('还没有任何马甲。用户给一句描述时，可以用 upsertAlias 帮用户创建。')
      const boundAliasId = context.provider.getActiveSessionBoundAliasId()
      if (boundAliasId === null) {
        lines.push('当前会话：没有打开中的会话。')
      } else if (!boundAliasId) {
        lines.push('当前会话身份：默认身份（用户本人资料）。')
      } else {
        const bound = aliases.find((item) => aliasIdOf(item) === boundAliasId)
        lines.push(`当前会话身份：马甲「${bound ? aliasNameOf(bound) : boundAliasId}」。`)
      }
      return { content: lines.join('\n'), details: { count: aliases.length } }
    }
  }
}

/** 工具2：新建/修改马甲（写·confirmWrite 硬门）。创建时字段由星依按用户描述扩写（口径=知识库 2.14）。 */
export function createUpsertAliasTool(context: XingyiAliasToolContext): ToolDefinition {
  return {
    name: 'upsertAlias',
    // 内部 await context.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '新建或修改用户的马甲：mode=create 时 name 缺省自动使用用户资料的“角色扮演姓名”，appearance 缺省自动使用用户资料的“外貌与身材”；用户明确给值才覆盖。mode=update 只改给出的字段（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['create', 'update'], description: 'create=新建（缺省）；update=修改现有马甲（须配 alias）。' },
        alias: { type: 'string', description: 'mode=update 时必填：要修改的马甲名称或 id。' },
        name: { type: 'string', description: '马甲名称（create 可选，缺省=用户资料的角色扮演姓名；update 给了就是改名）。' },
        emoji: { type: 'string', description: '表情符号（可选，1 个 emoji，如 🗡️）。' },
        gender: { type: 'string', description: '性别（可选）。' },
        age: { type: 'string', description: '年龄（可选）。' },
        desc: { type: 'string', description: '一句话简介（可选）。' },
        appearance: { type: 'string', description: '外貌描写（可选）。' },
        personality: { type: 'string', description: '性格描写（可选）。' },
        outfit: { type: 'string', description: '穿搭描写（可选）。' },
        hobbies: { type: 'string', description: '爱好（可选）。' },
        abilities: { type: 'string', description: '能力（可选）。' },
        experience: { type: 'string', description: '经历（可选）。' },
        worldview: { type: 'string', description: '世界观（这个身份生活在什么世界，可选）。' },
        background: { type: 'string', description: '背景故事（可选）。' }
      }
    },
    validateArgs: (args) => {
      const mode = String(args.mode || 'create').trim()
      if (mode !== 'create' && mode !== 'update') return 'upsertAlias 的 mode 只能是 create 或 update'
      if (mode === 'update') {
        if (!String(args.alias || '').trim()) return 'mode=update 时必须给 alias（要修改的马甲名称或 id）'
        if (!Object.keys(readAliasFieldChanges(args as Record<string, unknown>)).length) return 'mode=update 时至少要给一个要修改的字段'
      }
      return null
    },
    execute: async (toolCall) => {
      const mode = String(toolCall.args.mode || 'create').trim() as 'create' | 'update'
      const action = mode === 'create' ? '新建马甲' : '修改马甲'
      // 硬门（统一 helper）：缺通道 helper 必返回拒绝结果，断言非空
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const aliases = context.provider.listAliases()
      const changes = readAliasFieldChanges(toolCall.args)

      if (mode === 'create') {
        const userProfile = context.provider.getUserProfile() || {}
        const name = changes.name || String(userProfile.name || '').trim()
        if (!name) {
          return invalidArgumentResult('用户资料里的“角色扮演姓名”为空，且本次没有指定 name。请先让用户补充角色扮演姓名，或明确给出马甲名称。')
        }
        const effectiveChanges = {
          ...changes,
          name,
          ...(changes.appearance === undefined
            ? { appearance: String(userProfile.appearance || '').trim() }
            : {})
        }
        const sameName = aliases.filter((item) => String(item.name || '').trim() === name)
        if (sameName.length) {
          return invalidArgumentResult(
            `已经有名为「${name}」的马甲（id:${aliasIdOf(sameName[0])}）。要改它就用 mode=update；确实要再建一个就换个名字。`
          )
        }
        const denied = await askConfirmWrite(context.confirmWrite, {
          title: `新建马甲「${name}」`,
          lines: describeFieldLines(effectiveChanges)
        }, action)
        if (denied) return denied
        const id = `alias_${Date.now().toString()}`
        try {
          await context.provider.createAlias({ ...effectiveChanges, id, name })
        } catch (error) {
          return runFailureResult(action, error)
        }
        return {
          content: `已新建马甲「${name}」（id:${id}）。要在某个会话里使用它，用 switchAlias 切换。`,
          details: { aliasId: id, mode }
        }
      }

      const resolved = resolveXingyiAlias(aliases, String(toolCall.args.alias || ''))
      if (!resolved.alias) return invalidArgumentResult(resolved.error || '解析马甲失败')
      const record = resolved.alias
      if (changes.name !== undefined && !changes.name) return invalidArgumentResult('马甲名称不能清空，name 要么不给要么给非空新名字。')
      const fieldLines = describeFieldLines(changes)
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `修改马甲「${aliasNameOf(record)}」（${fieldLines.length} 个字段）`,
        lines: fieldLines
      }, action)
      if (denied) return denied
      try {
        await context.provider.updateAlias(aliasIdOf(record), changes)
      } catch (error) {
        return runFailureResult(action, error)
      }
      return {
        content: `已修改马甲「${changes.name || aliasNameOf(record)}」的 ${fieldLines.length} 个字段。`,
        details: { aliasId: aliasIdOf(record), mode, changedKeys: Object.keys(changes) }
      }
    }
  }
}

/** 工具3：删除马甲（写·confirmWrite 硬门）。 */
export function createDeleteAliasTool(context: XingyiAliasToolContext): ToolDefinition {
  const action = '删除马甲'
  return {
    name: 'deleteAlias',
    // 内部 await context.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '删除用户的一个马甲：删除不可恢复，正在使用它的会话会回到默认身份（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: '要删除的马甲名称或 id（必填）。' },
        reason: { type: 'string', description: '为何删除（可选，简短，供审计）。' }
      },
      required: ['alias']
    },
    validateArgs: (args) => String(args.alias || '').trim() ? null : 'deleteAlias 缺少 alias（要删除的马甲名称或 id）',
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const resolved = resolveXingyiAlias(context.provider.listAliases(), String(toolCall.args.alias || ''))
      if (!resolved.alias) return invalidArgumentResult(resolved.error || '解析马甲失败')
      const record = resolved.alias
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `删除马甲「${aliasNameOf(record)}」`,
        lines: [
          `目标：马甲「${aliasNameOf(record)}」（id:${aliasIdOf(record)}）`,
          '删除不可恢复；正在使用这个马甲的会话会回到默认身份（用户本人资料）。'
        ]
      }, action)
      if (denied) return denied
      try {
        await context.provider.deleteAlias(aliasIdOf(record))
      } catch (error) {
        return runFailureResult(action, error)
      }
      return {
        content: `已删除马甲「${aliasNameOf(record)}」。之前用它的会话会回到默认身份。`,
        details: { aliasId: aliasIdOf(record) }
      }
    }
  }
}

/** 工具4：给会话切换马甲/切回默认身份（写·confirmWrite 硬门；session 参数同状态系统口径可指定非活动会话）。 */
export function createSwitchAliasTool(context: XingyiAliasToolContext): ToolDefinition {
  const action = '切换马甲'
  return {
    name: 'switchAlias',
    // 内部 await context.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '给会话切换用户身份：绑定某个马甲，或 useDefault=true 切回默认身份（用户本人资料）。缺省作用于当前打开的会话，session 参数可指定别的会话（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: '要切换到的马甲名称或 id（与 useDefault 二选一）。' },
        useDefault: { type: 'boolean', description: 'true=取消马甲绑定、切回默认身份（与 alias 二选一）。' },
        session: { type: 'string', description: '可选：目标会话（会话名/联系人名/targetId/sessionId）；缺省=当前打开的会话。' }
      }
    },
    validateArgs: (args) => {
      const hasAlias = Boolean(String(args.alias || '').trim())
      const useDefault = args.useDefault === true
      if (!hasAlias && !useDefault) return 'switchAlias 要么给 alias（要切到的马甲），要么 useDefault=true（切回默认身份）'
      if (hasAlias && useDefault) return 'alias 与 useDefault=true 只能二选一'
      return null
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const outcome = await resolveXingyiSessionForCall(context, toolCall.args.session)
      if ('error' in outcome) return invalidArgumentResult(outcome.error)
      if ('noActiveSession' in outcome) {
        return {
          content: '现在没有打开中的会话。请让用户先打开目标会话，或给 session 参数指定会话（可先用 listChatContacts 看清单）。',
          details: { noActiveSession: true }
        }
      }
      const session = outcome.context
      const useDefault = toolCall.args.useDefault === true
      let targetAliasId = ''
      let targetLabel = '默认身份（用户本人资料）'
      if (!useDefault) {
        const resolved = resolveXingyiAlias(context.provider.listAliases(), String(toolCall.args.alias || ''))
        if (!resolved.alias) return invalidArgumentResult(resolved.error || '解析马甲失败')
        targetAliasId = aliasIdOf(resolved.alias)
        targetLabel = `马甲「${aliasNameOf(resolved.alias)}」`
      }
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `切换马甲：${targetLabel}`,
        lines: [
          `会话：${session.sessionTitle}`,
          `切换为：${targetLabel}`,
          '切换后该会话里用户以这个身份参与剧情（影响 AI 对用户的认知与称呼）。'
        ]
      }, action)
      if (denied) return denied
      try {
        await context.provider.bindSessionAlias(session.sessionId, targetAliasId)
      } catch (error) {
        return runFailureResult(action, error)
      }
      return {
        content: `已把会话「${session.sessionTitle}」的用户身份切换为${targetLabel}。`,
        details: { sessionId: session.sessionId, aliasId: targetAliasId }
      }
    }
  }
}

/** 用户资料读取 + 马甲四件套：harness 在 aliasManage 接缝在场时一把装配。 */
export function createXingyiAliasTools(context: XingyiAliasToolContext): ToolDefinition[] {
  return [
    createReadUserProfileTool(context),
    createListAliasesTool(context),
    createUpsertAliasTool(context),
    createDeleteAliasTool(context),
    createSwitchAliasTool(context)
  ]
}
