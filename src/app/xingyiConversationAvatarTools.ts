import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel } from './agentRuntime/interactionContract'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'
import type { SquarePhotoCropPreset } from '../utils/photoFile'

export type XingyiAvatarTargetKind = 'session' | 'character' | 'alias'
export type XingyiReadableAvatarTargetKind = XingyiAvatarTargetKind | 'user'

export interface XingyiNamedTarget {
  id: string
  name: string
}

export interface XingyiAvailableAvatarImage {
  id: string
  url: string
  label: string
  source: 'user' | 'generated'
}

/** 已从正式头像真值读取并转成内联图片的数据；只在内存里交给下一轮模型识图，不写进工具文本或审计 details。 */
export interface XingyiReadableAvatarImage {
  id: string
  dataUrl: string
  label: string
  targetKind: XingyiReadableAvatarTargetKind
  targetId: string
  targetName: string
}

export type XingyiAvatarCropPreset = SquarePhotoCropPreset

export interface XingyiConversationAvatarProvider {
  listCharacters: () => XingyiNamedTarget[]
  listAliases: () => XingyiNamedTarget[]
  listSessions: () => XingyiNamedTarget[]
  getCurrentSession: () => XingyiNamedTarget | null
  getUser: () => XingyiNamedTarget
  /** 读取目标的正式头像并转成 data:image；没有设置头像时返回 null，不得返回内部文件路径。 */
  readAvatar: (
    target: XingyiNamedTarget & { kind: XingyiReadableAvatarTargetKind }
  ) => Promise<{ dataUrl: string; label?: string } | null>
  createConversation: (input: {
    title: string
    members: Array<{ id: string; name: string; probability: number }>
  }) => Promise<{ sessionId: string; title: string }>
  assignAvatar: (
    target: XingyiNamedTarget & { kind: XingyiAvatarTargetKind },
    image: XingyiAvailableAvatarImage,
    crop: XingyiAvatarCropPreset
  ) => Promise<boolean>
}

export interface XingyiConversationAvatarToolContext {
  provider: XingyiConversationAvatarProvider
  listImages: () => XingyiAvailableAvatarImage[]
  /** 把刚读到的头像登记为下一轮模型的原生视觉输入；false 表示本轮图片数量已达上限。 */
  onAvatarViewed: (image: XingyiReadableAvatarImage) => boolean
  confirmWrite?: XingyiWriteConfirm
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function failure(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return { content: `「${action}」执行失败：${message}`, status: 'error', error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false } }
}

function isToolResult(value: XingyiNamedTarget | ToolExecutionResult): value is ToolExecutionResult {
  return 'content' in value
}

function avatarTargetLabel(kind: XingyiReadableAvatarTargetKind): string {
  if (kind === 'session') return '会话'
  if (kind === 'character') return '角色'
  if (kind === 'alias') return '马甲'
  return '用户'
}

function resolveReadableAvatarTarget(
  provider: XingyiConversationAvatarProvider,
  kind: XingyiReadableAvatarTargetKind,
  identifier: string
): XingyiNamedTarget | ToolExecutionResult {
  if (kind === 'user') return provider.getUser()
  const key = String(identifier || '').trim()
  if (kind === 'session' && (!key || ['当前会话', 'current', 'current session'].includes(key.toLowerCase()))) {
    return provider.getCurrentSession() || invalid('当前没有打开中的普通会话。')
  }
  const items = kind === 'character'
    ? provider.listCharacters()
    : kind === 'alias'
      ? provider.listAliases()
      : provider.listSessions()
  return resolveXingyiNamedTarget(items, key, avatarTargetLabel(kind))
}

export function resolveXingyiNamedTarget(items: XingyiNamedTarget[], identifier: string, label: string): XingyiNamedTarget | ToolExecutionResult {
  const key = String(identifier || '').trim()
  if (!key) return invalid(`缺少${label}名称或 id。`)
  const exactId = items.find((item) => item.id === key)
  if (exactId) return exactId
  const exactName = items.filter((item) => item.name === key)
  if (exactName.length === 1) return exactName[0]
  const partial = items.filter((item) => item.name.includes(key))
  if (partial.length === 1) return partial[0]
  if (exactName.length > 1 || partial.length > 1) {
    const candidates = (exactName.length ? exactName : partial).map((item) => `${item.name}(${item.id})`).join('、')
    return invalid(`${label}「${key}」有多个匹配，请改用 id：${candidates}`)
  }
  return invalid(`没有找到${label}「${key}」。`)
}

function buildDefaultConversationTitle(members: XingyiNamedTarget[]): string {
  const names = members.slice(0, 2).map((item) => item.name).join('、') || '新会话'
  return members.length > 2 ? `${names}等${members.length + 1}人` : names
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function readAvatarCropPreset(args: Record<string, unknown>): XingyiAvatarCropPreset {
  return {
    focusX: clampNumber(args.focusX, 0, 100, 50) / 100,
    focusY: clampNumber(args.focusY, 0, 100, 50) / 100,
    zoom: clampNumber(args.zoom, 1, 4, 1)
  }
}

function readProbabilityMap(raw: unknown): Map<string, number> {
  const map = new Map<string, number>()
  if (!Array.isArray(raw)) return map
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const member = String(record.member || '').trim()
    if (!member) continue
    const value = Math.max(0, Math.min(100, Math.round(Number(record.probability ?? 100) || 0)))
    map.set(member, value)
  }
  return map
}

export function createXingyiCreateConversationTool(context: XingyiConversationAvatarToolContext): ToolDefinition {
  const action = '创建会话'
  return {
    name: 'createConversation',
    longRunning: true,
    brief: '创建一条正式对话并拉入一个或多个现有角色。标题缺省自动生成，各角色发言概率缺省 100；不创建临时角色（写操作，会先弹确认卡）。',
    schema: {
      type: 'object',
      properties: {
        members: { type: 'array', items: { type: 'string' }, description: '至少一个正式角色名称或 id。' },
        title: { type: 'string', description: '可选会话标题；缺省按现役规则自动生成。' },
        probabilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              member: { type: 'string' },
              probability: { type: 'number', minimum: 0, maximum: 100 }
            },
            required: ['member', 'probability']
          },
          description: '可选：指定个别成员发言概率；未列出的成员为 100。'
        }
      },
      required: ['members']
    },
    validateArgs: (args) => Array.isArray(args.members) && args.members.length ? null : 'createConversation 至少需要一个 members 角色',
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const identifiers = Array.from(new Set((toolCall.args.members as unknown[]).map((item) => String(item || '').trim()).filter(Boolean)))
      const characters = context.provider.listCharacters()
      const resolved: XingyiNamedTarget[] = []
      for (const identifier of identifiers) {
        const result = resolveXingyiNamedTarget(characters, identifier, '角色')
        if (isToolResult(result)) return result
        resolved.push(result)
      }
      if (!resolved.length) return invalid('至少要拉入一个正式角色。')
      const probabilityMap = readProbabilityMap(toolCall.args.probabilities)
      const members = resolved.map((item) => ({
        ...item,
        probability: probabilityMap.get(item.id) ?? probabilityMap.get(item.name) ?? 100
      }))
      const manualTitle = String(toolCall.args.title || '').trim()
      const title = manualTitle || buildDefaultConversationTitle(resolved)
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `创建会话「${title}」`,
        lines: [
          `成员：${members.map((item) => `${item.name}（${item.probability}%）`).join('、')}`,
          `标题：${manualTitle ? '用户指定' : '成员默认'}「${title}」`,
          '身份：默认使用用户本人；帷幕、旁白与回复链路采用项目现役默认值。'
        ]
      }, action)
      if (denied) return denied
      try {
        const created = await context.provider.createConversation({
          title,
          members
        })
        return {
          content: `已创建会话「${created.title || title}」，并拉入 ${members.map((item) => item.name).join('、')}。`,
          details: { sessionId: created.sessionId, memberIds: members.map((item) => item.id) }
        }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

export function createXingyiSetImageAsAvatarTool(context: XingyiConversationAvatarToolContext): ToolDefinition {
  const action = '设置头像'
  return {
    name: 'setImageAsAvatar',
    longRunning: true,
    brief: '把本轮用户上传图或星依生成图设置为当前会话、角色或马甲头像。可按图片内容指定横纵焦点与缩放，随后弹出正方形裁剪预览供用户微调；imageId 缺省使用最近生成图，否则使用最近上传图（写操作，会先弹确认卡）。',
    schema: {
      type: 'object',
      properties: {
        targetKind: { type: 'string', enum: ['session', 'character', 'alias'] },
        target: { type: 'string', description: '目标名称或 id；targetKind=session 时可填“当前会话”。' },
        imageId: { type: 'string', description: '可选，本轮附件 id；缺省取最近一张图。' },
        focusX: { type: 'number', minimum: 0, maximum: 100, description: '可选，头像主体横向焦点百分比：0=最左，50=居中，100=最右；按人物脸部或主要主体位置判断，缺省 50。' },
        focusY: { type: 'number', minimum: 0, maximum: 100, description: '可选，头像主体纵向焦点百分比：0=最上，50=居中，100=最下；头像通常把脸部焦点放在 30–45，缺省 50。' },
        zoom: { type: 'number', minimum: 1, maximum: 4, description: '可选，相对铺满正方形的放大倍数；1=尽量保留画面，数值越大主体越近，缺省 1。' }
      },
      required: ['targetKind', 'target']
    },
    execute: async (toolCall) => {
      if (!context.confirmWrite) return requireConfirmWriteChannel(context.confirmWrite, action)!
      const kind = String(toolCall.args.targetKind || '') as XingyiAvatarTargetKind
      const targetInput = String(toolCall.args.target || '').trim()
      if (!['session', 'character', 'alias'].includes(kind)) return invalid('targetKind 只能是 session、character 或 alias。')
      let target: XingyiNamedTarget | ToolExecutionResult
      if (kind === 'session' && ['当前会话', 'current', 'current session'].includes(targetInput.toLowerCase())) {
        target = context.provider.getCurrentSession() || invalid('当前没有打开中的普通会话。')
      } else {
        const items = kind === 'character'
          ? context.provider.listCharacters()
          : kind === 'alias'
            ? context.provider.listAliases()
            : context.provider.listSessions()
        target = resolveXingyiNamedTarget(items, targetInput, kind === 'session' ? '会话' : kind === 'character' ? '角色' : '马甲')
      }
      if (isToolResult(target)) return target
      const images = context.listImages()
      const imageId = String(toolCall.args.imageId || '').trim()
      const image = imageId
        ? images.find((item) => item.id === imageId)
        : [...images].reverse().find((item) => item.source === 'generated') || images[images.length - 1]
      if (imageId && !image) return invalid(`本轮没有找到图片 ${imageId}。`)
      if (!image) return invalid('本轮没有可用图片。请先上传图片或调用 generateImage 生图。')
      const crop = readAvatarCropPreset(toolCall.args)
      const denied = await askConfirmWrite(context.confirmWrite, {
        title: `设置${kind === 'session' ? '会话' : kind === 'character' ? '角色' : '马甲'}头像`,
        lines: [
          `目标：${target.name}（${target.id}）`,
          `图片：${image.label}`,
          `推荐构图：横向 ${Math.round(crop.focusX * 100)}% · 纵向 ${Math.round(crop.focusY * 100)}% · 缩放 ${crop.zoom.toFixed(2)}×`,
          '确认后打开正方形裁剪预览；可继续拖动或缩放，保存后才写入正式头像。'
        ]
      }, action)
      if (denied) return denied
      try {
        const saved = await context.provider.assignAvatar({ ...target, kind }, image, crop)
        if (!saved) return { content: '用户取消了头像裁剪，本次没有修改头像。', details: { cancelled: true, targetId: target.id, imageId: image.id } }
        return { content: `已把「${image.label}」设置为${target.name}的头像。`, details: { targetId: target.id, imageId: image.id, crop } }
      } catch (error) {
        return failure(action, error)
      }
    }
  }
}

/** 显式读取正式头像：工具结果只回传目标信息，真实图片经 harness 的下一轮临时 image part 交给模型。 */
export function createXingyiViewAvatarTool(context: XingyiConversationAvatarToolContext): ToolDefinition {
  return {
    name: 'viewAvatar',
    brief: '实际查看会话（含群聊）、正式角色、马甲或用户资料的现役头像原图（只读）。'
      + '需要判断头像画面、构图、人物外观或比较头像时调用；不会只返回“已设置”，也不会暴露内部文件路径。',
    schema: {
      type: 'object',
      properties: {
        targetKind: { type: 'string', enum: ['session', 'character', 'alias', 'user'], description: '头像归属：会话/群聊、角色、马甲或用户。' },
        target: { type: 'string', description: '会话、角色或马甲的名称/id；会话缺省为当前会话，用户头像无需填写。' }
      },
      required: ['targetKind']
    },
    validateArgs: (args) => {
      const kind = String(args.targetKind || '')
      if (!['session', 'character', 'alias', 'user'].includes(kind)) return 'viewAvatar 的 targetKind 只能是 session、character、alias 或 user'
      if ((kind === 'character' || kind === 'alias') && !String(args.target || '').trim()) return `${kind} 头像必须提供 target 名称或 id`
      return null
    },
    execute: async (toolCall) => {
      const kind = String(toolCall.args.targetKind || '') as XingyiReadableAvatarTargetKind
      const target = resolveReadableAvatarTarget(context.provider, kind, String(toolCall.args.target || ''))
      if (isToolResult(target)) return target
      const label = avatarTargetLabel(kind)
      try {
        const image = await context.provider.readAvatar({ ...target, kind })
        if (!image) {
          return {
            content: `${label}「${target.name}」当前没有设置头像。`,
            details: { targetKind: kind, targetId: target.id, hasAvatar: false }
          }
        }
        const dataUrl = String(image.dataUrl || '').trim()
        if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
          throw new Error('头像读取接缝没有返回合法的 data:image 图片')
        }
        const readable: XingyiReadableAvatarImage = {
          id: `avatar:${kind}:${target.id}`,
          dataUrl,
          label: String(image.label || `${label}「${target.name}」头像`),
          targetKind: kind,
          targetId: target.id,
          targetName: target.name
        }
        if (!context.onAvatarViewed(readable)) {
          return invalid('同一轮最多查看 4 张头像；请先根据已读取的头像继续判断，再按需读取下一张。')
        }
        return {
          content: `已读取${readable.label}，原图已作为下一轮视觉输入附上；请直接观察图片内容，不要把“路径存在”当作已经看图。`,
          details: { targetKind: kind, targetId: target.id, hasAvatar: true }
        }
      } catch (error) {
        return failure(`读取${label}头像`, error)
      }
    }
  }
}

export function createXingyiConversationAvatarTools(context: XingyiConversationAvatarToolContext): ToolDefinition[] {
  return [
    createXingyiCreateConversationTool(context),
    createXingyiSetImageAsAvatarTool(context),
    createXingyiViewAvatarTool(context)
  ]
}
