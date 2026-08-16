/**
 * 星依状态系统工具（状态系统积木骨架计划批次3）——「用户描述 → schema 设计 → 实例化」的总 agent 工具族。
 *
 * 四件套：listStatusSystem（只读）+ saveStatusTemplate / saveStatusPanel / deleteStatusItem（写·confirmWrite 硬门）。
 * 搭建范式（选积木/定字段/定引用与资源流转）沉淀在星依知识库 2.9 节，模型经
 * searchXingyiKnowledge 定位后用 readXingyiKnowledgeTopic 精读。
 *
 * 真值边界：
 * - 作用域=当前打开的会话（对话级能力）；会话上下文缺省读 chatSummary 桥（与 summarizeChat 同一份活动会话真值）。
 * - 写路径=chatRepository 状态系统六函数直写服务端（服务端是唯一真值·校验单点在 workspaceChatAppService），
 *   不要求状态系统面板在场；写成功后广播 STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT，打开中的面板收到即重载。
 * - 服务端 400/409 中文报错（字段校验/引用完整性/模板有实例）原样透传给模型转述，前端不重复造校验。
 *
 * 写确认门（硬门）语义与 xingyiFunctionTools 一致，模板单一实现=interactionContract 统一 helper（2026-07-12 批C 收敛）：
 * confirmWrite 缺失一律拒绝执行；用户取消返回「已取消」的成功态结果（模型不重试）。
 * 危险删除（与七件套 deleteUnit 同款拍板）：确认卡片必须带严厉警示与误删后果。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel } from './agentRuntime/interactionContract'
import type { ChatStatusPanel, ChatStatusPanelTemplate, StatusPanelFieldDef } from '../types'
import * as chatRepo from '../repositories/chatRepository'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'
import { createStatusPanelReference, renderStatusPanelReference } from '../../shared/statusPanelReference'
import { statusPanelFieldDisplayLabel } from '../../shared/statusPanelField'
import { summarizeStatusPanelPresentation } from '../../shared/statusPanelPresentation'
import {
  resolveXingyiSessionForCall,
  type XingyiSessionContext,
  type XingyiSessionContextSeam,
  type XingyiSessionResolveOutcome
} from './xingyiSessionContext'

/** 状态系统外部更新事件：星依写成功后广播，打开中的状态系统面板监听并重载（联动=ChatStatusSystemPanel.vue）。 */
export const STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT = 'langhuan:status-system-external-updated'

/** 会话上下文形状（=共享层 XingyiSessionContext；保留本地名兼容既有引用/测试）。 */
export type XingyiStatusSystemSessionContext = XingyiSessionContext

/** 仓储接缝：缺省=chatRepository 真值直写；测试注内存 mock。 */
export interface XingyiStatusSystemRepository {
  fetchTemplates: (sessionId: string) => Promise<ChatStatusPanelTemplate[]>
  saveTemplate: (sessionId: string, payload: Partial<ChatStatusPanelTemplate> & { expectedVersion?: number }) => Promise<ChatStatusPanelTemplate>
  deleteTemplate: (sessionId: string, templateId: string) => Promise<void>
  fetchPanels: (sessionId: string) => Promise<ChatStatusPanel[]>
  savePanel: (sessionId: string, payload: Partial<ChatStatusPanel> & { expectedVersion?: number; source?: string }) => Promise<ChatStatusPanel>
  deletePanel: (sessionId: string, panelId: string, expectedVersion: number, options?: { source?: string }) => Promise<void>
  fetchTempEntities: (sessionId: string) => Promise<Array<{ id: string; name: string }>>
}

export interface XingyiStatusSystemToolContext extends XingyiSessionContextSeam {
  /** 写确认门（同 xingyiFunctionTools 硬门语义：缺省一律拒绝执行写操作）。 */
  confirmWrite?: XingyiWriteConfirm
  /** 仓储接缝：缺省=chatRepository。 */
  repository?: XingyiStatusSystemRepository
}

function defaultRepository(): XingyiStatusSystemRepository {
  return {
    fetchTemplates: (sessionId) => chatRepo.fetchStatusPanelTemplates(sessionId),
    saveTemplate: (sessionId, payload) => chatRepo.saveStatusPanelTemplate(sessionId, payload),
    deleteTemplate: (sessionId, templateId) => chatRepo.deleteStatusPanelTemplate(sessionId, templateId),
    fetchPanels: (sessionId) => chatRepo.fetchStatusPanels(sessionId),
    savePanel: (sessionId, payload) => chatRepo.saveStatusPanel(sessionId, payload),
    deletePanel: (sessionId, panelId, expectedVersion, options) => chatRepo.deleteStatusPanel(sessionId, panelId, expectedVersion, options),
    fetchTempEntities: async (sessionId) => {
      const items = await chatRepo.fetchSessionTemporaryEntities(sessionId)
      return items.map((item) => ({ id: String(item.id || ''), name: String(item.name || item.id || '') }))
    }
  }
}

/** 取会话上下文：命中返回 { context }，否则返回 { result }（无活动会话三态 / 指定会话解析失败 error）。 */
async function resolveSessionOrResult(
  ctx: XingyiStatusSystemToolContext,
  sessionArg: unknown
): Promise<{ context: XingyiStatusSystemSessionContext } | { result: ToolExecutionResult }> {
  const outcome: XingyiSessionResolveOutcome = await resolveXingyiSessionForCall(ctx, sessionArg)
  if ('context' in outcome) return { context: outcome.context }
  if ('error' in outcome) return { result: invalidArgumentResult(outcome.error) }
  return { result: noActiveSessionResult() }
}

function notifyStatusSystemUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_SYSTEM_EXTERNAL_UPDATED_EVENT))
}

// ── 结果文案（确认门缺通道/取消已收敛进 interactionContract 统一 helper；下面只剩本工具族专属文案）──

function noActiveSessionResult(): ToolExecutionResult {
  return {
    content: '现在没有打开中的会话。状态系统是对话级能力：可以先打开要操作的会话，'
      + '或者先用 listChatContacts 看会话清单，再给本工具的 session 参数指定要在哪个对话里操作（同名对话用 targetId 区分）。',
    details: { providerMissing: true }
  }
}

/** 执行失败：服务端 400/409 中文报错走这里原样透传（message 即服务端 error 文本）。 */
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

const CLIP_LIMIT = 60

function clipText(text: string, limit = CLIP_LIMIT): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

/** 名称/id → 条目解析（与 resolveXingyiUnitIds 同一套心智）：先精确 id，再精确名称，最后唯一子串。 */
export function resolveStatusSystemItem<T extends { id: string; name: string }>(
  items: T[],
  raw: string,
  noun: string
): { item: T } | { error: string } {
  const value = String(raw || '').trim()
  if (!value) return { error: `缺少${noun}名称或 id` }
  const byId = items.find((item) => item.id === value)
  if (byId) return { item: byId }
  const exact = items.filter((item) => item.name === value)
  if (exact.length === 1) return { item: exact[0] }
  if (exact.length > 1) {
    return { error: `「${value}」有 ${exact.length} 个同名${noun}，请改用 id 指定：${exact.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  const partial = items.filter((item) => item.name.includes(value))
  if (partial.length === 1) return { item: partial[0] }
  if (partial.length > 1) {
    return { error: `「${value}」匹配到多个${noun}，请用完整名称或 id：${partial.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  return { error: `没有找到名为「${value}」的${noun}。可选：${items.slice(0, 12).map((item) => item.name).join('、') || '（无）'}` }
}

function describeFieldDef(field: StatusPanelFieldDef): string {
  const binding = field.valueType === 'binding' && field.binding ? `→${field.binding}` : ''
  return `${statusPanelFieldDisplayLabel(field)}[${field.key}·${field.valueType}${binding}]`
}

/** 模板字段读取（融入计划批次4 起 export：提调版建卡两件套复用·tidiaoGlobalTools 也 import 这里）。 */
export function readTemplateFields(template: ChatStatusPanelTemplate | undefined | null): StatusPanelFieldDef[] {
  return Array.isArray(template?.fields) ? template.fields : []
}

/** 状态栏字段真值单点（多维表格化批次B·与服务端 resolveStatusPanelFieldsOf 同约定）：
 *  实例自带字段快照优先，旧实例（快照为空）回退模板字段。星依/提调两侧工具共用（tidiaoGlobalTools 也 import 这里）。 */
export function resolvePanelFields(
  panel: ChatStatusPanel | undefined | null,
  template: ChatStatusPanelTemplate | undefined | null
): StatusPanelFieldDef[] {
  return panel?.fields?.length ? panel.fields : readTemplateFields(template)
}

function hostLabelOf(
  panel: ChatStatusPanel,
  characterOptions: Array<{ id: string; name: string; participantId?: string }>,
  tempEntities: Array<{ id: string; name: string }>
): string {
  if (panel.hostType === 'session_character') {
    return `角色·${characterOptions.find((option) => String(option.participantId || option.id) === panel.hostId)?.name || panel.hostId}`
  }
  if (panel.hostType === 'temp_entity') {
    return `临时实体·${tempEntities.find((entity) => entity.id === panel.hostId)?.name || panel.hostId}`
  }
  if (panel.hostType === 'user') return '用户'
  return '独立实体'
}

function renderFieldValue(
  field: StatusPanelFieldDef,
  panel: ChatStatusPanel,
  panelsById: Map<string, ChatStatusPanel>
): string {
  if (field.valueType === 'binding') {
    return `${String(panel.bindingValues?.[field.key] ?? '') || '（空）'}（穿透）`
  }
  const raw = panel.values?.[field.key]
  if (field.valueType === 'ref') {
    const ids = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    const names = ids.map((id) => {
      const panelId = String(id)
      const targetName = panelsById.get(panelId)?.name || panelId
      return `${targetName}（引用=${renderStatusPanelReference(createStatusPanelReference(panel.sessionId, panelId))}）`
    })
    return names.length ? names.join('、') : '（空）'
  }
  if (field.valueType === 'list') {
    const list = Array.isArray(raw) ? raw : []
    return list.length ? list.map((item) => String(item)).join('、') : '（空）'
  }
  if (field.valueType === 'asset') {
    const asset = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
    return asset ? `图片：${String(asset.alt || asset.assetId || '未命名')}` : '（空）'
  }
  return raw === undefined || raw === null || raw === '' ? '（空）' : String(raw)
}

/** 状态系统总览文本（listStatusSystem 输出；也是写工具回执里引用名称的口径来源）。
 *  emptyHint：空态提示（缺省=星依口径带 saveStatusTemplate 建议；提调 readStatusPanels 传自己的口径——
 *  提调没有建模板工具，不能给它星依的工具名）。 */
export function renderStatusSystemOverview(input: {
  sessionTitle: string
  templates: ChatStatusPanelTemplate[]
  panels: ChatStatusPanel[]
  characterOptions: Array<{ id: string; name: string; participantId?: string }>
  tempEntities: Array<{ id: string; name: string }>
  emptyHint?: string
  /** 只展开指定状态栏；引用名称解析仍使用完整 panels 集合。 */
  focusPanelId?: string
}): string {
  const { templates, panels } = input
  if (!templates.length && !panels.length) {
    return input.emptyHint
      || `会话「${input.sessionTitle}」还没有任何状态系统数据。可以按知识库 2.9 的搭建范式，先用 saveStatusTemplate 设计模板，再用 saveStatusPanel 实例化状态栏。`
  }
  const panelsById = new Map(panels.map((panel) => [panel.id, panel]))
  const templateById = new Map(templates.map((template) => [template.id, template]))
  const renderedPanels = input.focusPanelId ? panels.filter((panel) => panel.id === input.focusPanelId) : panels
  const renderedTemplateIds = new Set(renderedPanels.map((panel) => panel.templateId))
  const renderedTemplates = input.focusPanelId ? templates.filter((template) => renderedTemplateIds.has(template.id)) : templates
  const lines: string[] = [input.focusPanelId
    ? `会话「${input.sessionTitle}」的状态栏详情：${renderedPanels.length} 张。`
    : `会话「${input.sessionTitle}」的状态系统：模板 ${templates.length} 个，状态栏 ${panels.length} 个。`]
  if (renderedTemplates.length) {
    lines.push('【模板】')
    for (const template of renderedTemplates) {
      const count = panels.filter((panel) => panel.templateId === template.id).length
      lines.push(`- ${template.name}（用户分类=${template.kind}·id=${template.id}·版本=${template.version || 1}·实例 ${count} 个）｜用途：${String(template.description || '').trim() || '未描述'}｜字段：${readTemplateFields(template).map(describeFieldDef).join('、') || '（无字段）'}｜总览：${summarizeStatusPanelPresentation(template.presentation)}`)
    }
  }
  if (renderedPanels.length) {
    lines.push('【状态栏】')
    for (const panel of renderedPanels) {
      const template = templateById.get(panel.templateId)
      lines.push(`- ${panel.name}（模板=${template?.name || panel.templateId}·用户分类=${template?.kind || '未填写'}·宿主=${hostLabelOf(panel, input.characterOptions, input.tempEntities)}·id=${panel.id}）｜用途：${String(panel.description || template?.description || '').trim() || '未描述'}`)
      lines.push(`  总览：${summarizeStatusPanelPresentation(panel.presentation)}`)
      if (input.focusPanelId && panel.presentation) lines.push(`  展示配置JSON：${JSON.stringify(panel.presentation)}`)
      const presentationDiagnostics = Array.isArray(panel.presentationDiagnostics) ? panel.presentationDiagnostics : []
      if (presentationDiagnostics.length) {
        lines.push(`  总览降级：${presentationDiagnostics.map((item) => `${item.blockId || '整体'}=${item.message}`).join('；')}`)
      }
      // 批次B：按实例字段快照渲染（旧实例回退模板字段）——实例结构各自演化后总览仍与面板一致
      const fields = resolvePanelFields(panel, template)
      if (fields.length) {
        lines.push(`  ${fields.map((field) => `${statusPanelFieldDisplayLabel(field)}: ${renderFieldValue(field, panel, panelsById)}`).join(' | ')}`)
      }
    }
  }
  return lines.join('\n')
}

// ── 字段定义与值的读取/归一 ──

export interface TemplateFieldRowArgs {
  key: string
  label: string
  unit?: string
  valueType: string
  binding?: string
  description?: string
}

/** 模板 fields 参数归一（融入计划批次4 起 export：提调版 saveStatusTemplate 复用同一套归一口径）。 */
export function readTemplateFieldRows(raw: unknown): TemplateFieldRowArgs[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      key: String(item.key ?? '').trim(),
      label: String(item.label ?? '').trim(),
      ...(String(item.unit ?? '').trim() ? { unit: String(item.unit).trim() } : {}),
      valueType: String(item.valueType ?? 'text').trim() || 'text',
      ...(String(item.binding ?? '').trim() ? { binding: String(item.binding).trim() } : {}),
      ...(String(item.description ?? '').trim() ? { description: String(item.description).trim() } : {})
    }))
}

export interface StatusPanelFieldPatchArgs {
  key: string
  label?: string
  unit?: string
  description?: string
}

/** 旧实例字段元数据补丁：只改标题/单位/说明，稳定 key、类型和当前值全部保留。 */
export function applyStatusPanelFieldPatches(
  fields: StatusPanelFieldDef[],
  raw: unknown
): { fields: StatusPanelFieldDef[]; changedLines: string[] } | { error: string } {
  if (!Array.isArray(raw) || !raw.length) return { error: 'fieldPatches 必须是非空数组' }
  const nextFields = fields.map((field) => ({ ...field }))
  const fieldByKey = new Map(nextFields.map((field) => [field.key, field]))
  const seen = new Set<string>()
  const changedLines: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'fieldPatches 每一项都必须是对象' }
    const patch = item as Record<string, unknown>
    const key = String(patch.key ?? '').trim()
    if (!key) return { error: 'fieldPatches 的字段 key 不能为空' }
    if (seen.has(key)) return { error: `fieldPatches 的字段 key 重复：${key}` }
    seen.add(key)
    const field = fieldByKey.get(key)
    if (!field) return { error: `字段「${key}」不存在。可用字段：${fields.map((entry) => `${entry.key}（${statusPanelFieldDisplayLabel(entry)}）`).join('、') || '（无）'}` }
    const hasLabel = Object.prototype.hasOwnProperty.call(patch, 'label')
    const hasUnit = Object.prototype.hasOwnProperty.call(patch, 'unit')
    const hasDescription = Object.prototype.hasOwnProperty.call(patch, 'description')
    if (!hasLabel && !hasUnit && !hasDescription) return { error: `字段「${key}」没有提供修改项（label/unit/description）` }
    if (hasLabel) {
      const label = String(patch.label ?? '').trim()
      if (!label) return { error: `字段「${key}」的 label 不能为空` }
      field.label = label
    }
    if (hasUnit) {
      const unit = String(patch.unit ?? '').trim()
      if (unit) field.unit = unit
      else delete field.unit
    }
    if (hasDescription) field.description = String(patch.description ?? '').trim()
    changedLines.push(`${key} → ${statusPanelFieldDisplayLabel(field)}`)
  }
  return { fields: nextFields, changedLines }
}

/** 提交给保存接口的 values：从既有值出发合并本次提供的键（服务端整包替换 values_json，漏键=清除，必须合并）。
 *  number 转数字、list 归一成字符串数组、ref 名称解析成 id、binding 原样字符串（宿主校验交给服务端）。 */
export function buildStatusPanelValues(input: {
  fields: StatusPanelFieldDef[]
  provided: Record<string, unknown>
  existingValues: Record<string, unknown>
  panels: ChatStatusPanel[]
  selfPanelId?: string
}): { values: Record<string, unknown>; changedLines: string[] } | { error: string } {
  const fieldMap = new Map(input.fields.map((field) => [field.key, field]))
  // 既有值只保留仍在字段定义里的键（批次B：实例结构可编辑后，删掉的字段残值不再回传服务端触发「未知字段」拒绝）
  const values: Record<string, unknown> = Object.fromEntries(
    Object.entries(input.existingValues).filter(([key]) => fieldMap.has(key))
  )
  const changedLines: string[] = []
  for (const [key, raw] of Object.entries(input.provided)) {
    const field = fieldMap.get(key)
    if (!field) {
      return { error: `字段「${key}」不在模板定义里。可用字段：${input.fields.map((item) => `${item.key}（${statusPanelFieldDisplayLabel(item)}）`).join('、') || '（无）'}` }
    }
    if (field.valueType === 'number') {
      const num = Number(raw)
      if (!String(raw ?? '').toString().trim() || !Number.isFinite(num)) {
        return { error: `字段「${statusPanelFieldDisplayLabel(field)}（${key}）」需要数字，收到：${clipText(String(raw))}` }
      }
      values[key] = num
    } else if (field.valueType === 'list') {
      const list = Array.isArray(raw) ? raw : [raw]
      values[key] = list.map((item) => String(item ?? '').trim()).filter(Boolean)
    } else if (field.valueType === 'ref') {
      const refs = Array.isArray(raw) ? raw : (raw ? [raw] : [])
      const ids: string[] = []
      for (const entry of refs) {
        const resolved = resolveStatusSystemItem(
          input.panels.filter((panel) => panel.id !== input.selfPanelId),
          String(entry ?? ''),
          '状态栏'
        )
        if ('error' in resolved) return { error: `字段「${statusPanelFieldDisplayLabel(field)}（${key}）」引用解析失败：${resolved.error}` }
        ids.push(resolved.item.id)
      }
      values[key] = Array.from(new Set(ids))
    } else if (field.valueType === 'asset') {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { error: `字段「${statusPanelFieldDisplayLabel(field)}（${key}）」需要正式资产引用对象` }
      }
      const asset = raw as Record<string, unknown>
      if (!String(asset.assetId || '').trim() || String(asset.kind || '') !== 'image' || !String(asset.alt || '').trim()) {
        return { error: `字段「${statusPanelFieldDisplayLabel(field)}（${key}）」的资产引用必须包含 assetId、kind=image 和 alt` }
      }
      values[key] = { assetId: String(asset.assetId).trim(), kind: 'image', alt: String(asset.alt).trim(), ...(String(asset.caption || '').trim() ? { caption: String(asset.caption).trim() } : {}) }
    } else {
      // text / binding 都是字符串；binding 是否允许写由服务端按宿主类型硬校验
      values[key] = String(raw ?? '')
    }
    const panelsById = new Map(input.panels.map((panel) => [panel.id, panel]))
    const renderedNew = field.valueType === 'ref'
      ? (values[key] as string[]).map((id) => panelsById.get(id)?.name || id).join('、')
      : Array.isArray(values[key]) ? (values[key] as unknown[]).join('、') : String(values[key])
    changedLines.push(`${statusPanelFieldDisplayLabel(field)}: ${clipText(renderedNew) || '（空）'}`)
  }
  return { values, changedLines }
}

// ── 四件套工具 ──

/** 状态系统总览（只读）：当前会话的模板与状态栏全貌，写操作前先看这个拿准确名称。 */
export function createListStatusSystemTool(ctx: XingyiStatusSystemToolContext): ToolDefinition {
  const repository = ctx.repository ?? defaultRepository()
  return {
    name: 'listStatusSystem',
    brief: '查看某个会话的状态系统全貌：模板（字段骨架）与状态栏实例（含各字段当前值、绑定穿透值、引用关系）。'
      + '缺省看当前打开的会话；没打开或要看别的对话时给 session 指定（只读）。',
    schema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: '要操作的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。没打开会话时用它指定。' }
      }
    },
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      try {
        const [templates, panels, tempEntities] = await Promise.all([
          repository.fetchTemplates(context.sessionId),
          repository.fetchPanels(context.sessionId),
          repository.fetchTempEntities(context.sessionId).catch(() => [])
        ])
        return {
          content: renderStatusSystemOverview({
            sessionTitle: context.sessionTitle,
            templates,
            panels,
            characterOptions: context.characterOptions,
            tempEntities
          }),
          details: { templateCount: templates.length, panelCount: panels.length }
        }
      } catch (error) {
        return runFailureResult('查看状态系统', error)
      }
    }
  }
}

/** 模板字段定义的 JSON schema（融入计划批次4 起 export：提调版 saveStatusTemplate 复用同一份参数格式）。 */
export const TEMPLATE_FIELD_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '字段 key（英文短名，模板内唯一）。' },
      label: { type: 'string', description: '字段显示名（给用户看的中文名）。' },
      unit: { type: 'string', description: '字段单位（可选，如 km²、人、%、金币）；独立于数值存储，不要拼进 value。' },
      valueType: { type: 'string', enum: ['text', 'number', 'list', 'ref', 'binding', 'asset'], description: '字段类型：text 文本 / number 数字 / list 列表 / ref 单位引用 / binding 可见资料穿透 / asset 正式图片资产引用。' },
      binding: { type: 'string', description: '仅 valueType=binding 时给：绑定目标，当前只支持 character.appearance（角色可见资料）。' },
      description: { type: 'string', description: '字段说明（可选）。' }
    },
    required: ['key', 'label', 'valueType']
  }
} as const

/** 新建/更新状态栏模板（写操作·经确认门）。 */
export function createSaveStatusTemplateTool(ctx: XingyiStatusSystemToolContext): ToolDefinition {
  const repository = ctx.repository ?? defaultRepository()
  return {
    name: 'saveStatusTemplate',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '设计或修改状态系统的模板（字段骨架）：新建=给 name+kind+fields；更新既有模板=给 template 指定目标，其余字段只给要改的（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: '要更新的既有模板名称或 id（缺省=新建模板）。' },
        name: { type: 'string', description: '模板名称（新建必填，如「角色状态栏」「宗门状态栏」）。' },
        kind: { type: 'string', description: '用户自定义分类（新建必填；不是系统枚举，可按当前世界观和管理需要命名）。' },
        description: { type: 'string', description: '模板说明（可选）。' },
        fields: { ...TEMPLATE_FIELD_SCHEMA, description: '字段定义数组（新建必填；更新时给了就整组覆盖，不给则保持不变）。' },
        session: { type: 'string', description: '要操作的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。' },
        reason: { type: 'string', description: '为何做这次设计（可选，简短，供审计）。' }
      }
    },
    validateArgs: (args) => {
      const isUpdate = Boolean(String(args.template || '').trim())
      if (!isUpdate) {
        if (!String(args.name || '').trim()) return 'saveStatusTemplate 新建模板缺少 name'
        if (!String(args.kind || '').trim()) return 'saveStatusTemplate 新建模板缺少 kind（如 character/organization/building）'
        if (!readTemplateFieldRows(args.fields).length) return 'saveStatusTemplate 新建模板缺少 fields（至少 1 个字段定义）'
      } else if (!String(args.name || '').trim() && !String(args.kind || '').trim() && args.description === undefined && !Array.isArray(args.fields)) {
        return 'saveStatusTemplate 更新模板至少要给一个修改项（name/kind/description/fields）'
      }
      return null
    },
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      // 硬门（统一 helper）：缺通道 helper 必返回拒绝结果，断言非空
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '保存状态栏模板')!
      try {
        const templates = await repository.fetchTemplates(context.sessionId)
        const targetRaw = String(toolCall.args.template || '').trim()
        let existing: ChatStatusPanelTemplate | null = null
        if (targetRaw) {
          const resolved = resolveStatusSystemItem(templates, targetRaw, '模板')
          if ('error' in resolved) return invalidArgumentResult(resolved.error)
          existing = resolved.item
        }
        const fieldRows = Array.isArray(toolCall.args.fields)
          ? readTemplateFieldRows(toolCall.args.fields)
          : readTemplateFields(existing).map((field) => ({ ...field }))
        const payload: Partial<ChatStatusPanelTemplate> & { expectedVersion?: number } = {
          ...(existing ? { id: existing.id } : {}),
          name: String(toolCall.args.name || '').trim() || existing?.name || '',
          kind: String(toolCall.args.kind || '').trim() || existing?.kind || '',
          description: toolCall.args.description === undefined ? String(existing?.description || '') : String(toolCall.args.description || ''),
          fields: fieldRows as StatusPanelFieldDef[],
          createdBy: 'agent',
          expectedVersion: existing?.version || 0
        }
        const action = existing ? '更新状态栏模板' : '新建状态栏模板'
        const denied = await askConfirmWrite(ctx.confirmWrite, {
          title: action,
          lines: [
            `会话：${context.sessionTitle}`,
            // 批次B 起模板=种子：实例建好时拷走字段快照各自演化，改模板只影响之后新建的实例（和无快照旧实例）
            `模板：${payload.name}（kind=${payload.kind}）${existing ? `（更新既有模板「${existing.name}」·模板是种子，字段变化只影响之后新建的实例，不动已建实例的字段）` : ''}`,
            `字段（${fieldRows.length} 个）：${fieldRows.map((row) => describeFieldDef(row as StatusPanelFieldDef)).join('、') || '（无）'}`
          ]
        }, action)
        if (denied) return denied
        const saved = await repository.saveTemplate(context.sessionId, payload)
        notifyStatusSystemUpdated()
        return {
          content: `${action}成功：「${saved.name}」（kind=${saved.kind}·id=${saved.id}），字段 ${readTemplateFields(saved).length} 个。`,
          details: { templateId: saved.id, ok: true }
        }
      } catch (error) {
        return runFailureResult('保存状态栏模板', error)
      }
    }
  }
}

/** 新建/更新状态栏实例（写操作·经确认门）。 */
export function createSaveStatusPanelTool(ctx: XingyiStatusSystemToolContext): ToolDefinition {
  const repository = ctx.repository ?? defaultRepository()
  return {
    name: 'saveStatusPanel',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '实例化或更新一个状态栏：新建时描述它记录什么；更新可用 fieldPatches 按稳定 key 修改旧实例字段的标题、单位或说明，当前值保持不变。values 未提到的字段保持不变（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        panel: { type: 'string', description: '要更新的既有状态栏名称或 id（缺省=新建）。' },
        template: { type: 'string', description: '模板名称或 id（新建必填；更新时忽略）。' },
        name: { type: 'string', description: '状态栏名称（新建必填，通常=实体名，如角色名/组织名）。' },
        description: { type: 'string', description: '这张状态栏具体记录什么。新建必填；更新时仅在用途或字段语义变化后与旧摘要不符时修改。' },
        hostType: { type: 'string', enum: ['session_character', 'temp_entity', 'user', 'none'], description: '宿主类型：session_character=本会话角色 / temp_entity=会话临时实体 / user=用户本人 / none=独立实体（更新时不给则保持不变）。' },
        host: { type: 'string', description: '宿主名称或 id（hostType=session_character/temp_entity 时必填，user/none 不需要；角色按会话成员名解析）。' },
        fieldPatches: {
          type: 'array',
          description: '只用于更新旧实例：按稳定字段 key 修改标题、单位或说明；不改 key/valueType，也不会清空当前值。',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: '要修改的字段 key（以 listStatusSystem 输出方括号内 key 为准）。' },
              label: { type: 'string', description: '新的字段标题（可选；不能为空）。' },
              unit: { type: 'string', description: '新的独立单位（可选；空字符串表示清除单位）。' },
              description: { type: 'string', description: '新的字段说明（可选；空字符串表示清除说明）。' }
            },
            required: ['key']
          }
        },
        values: { type: 'object', description: '字段值（key=模板字段 key）：number 给数字、list 给字符串数组、ref 给其他状态栏的名称数组、binding/text 给字符串。更新时只给要改的键。' },
        session: { type: 'string', description: '要操作的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。host=角色时按该会话成员解析。' },
        reason: { type: 'string', description: '为何写入（可选，简短，供审计）。' }
      }
    },
    validateArgs: (args) => {
      const isUpdate = Boolean(String(args.panel || '').trim())
      if (!isUpdate) {
        if (!String(args.template || '').trim()) return 'saveStatusPanel 新建状态栏缺少 template（模板名称或 id）'
        if (!String(args.name || '').trim()) return 'saveStatusPanel 新建状态栏缺少 name'
        if (!String(args.description || '').trim()) return 'saveStatusPanel 新建状态栏缺少 description（说明这张栏记录什么）'
        if (Array.isArray(args.fieldPatches) && args.fieldPatches.length) return 'saveStatusPanel 新建状态栏不能使用 fieldPatches；请在模板 fields 中定义单位'
      } else if (args.fieldPatches !== undefined && (!Array.isArray(args.fieldPatches) || !args.fieldPatches.length)) {
        return 'saveStatusPanel 的 fieldPatches 必须是非空数组'
      }
      const hostType = String(args.hostType || '').trim()
      if (hostType && !['session_character', 'temp_entity', 'user', 'none'].includes(hostType)) {
        return 'saveStatusPanel 的 hostType 必须是 session_character/temp_entity/user/none'
      }
      if ((hostType === 'session_character' || hostType === 'temp_entity') && !String(args.host || '').trim()) {
        return `saveStatusPanel 宿主类型是 ${hostType} 时必须给 host（宿主名称或 id）`
      }
      return null
    },
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '保存状态栏')!
      try {
        const [templates, panels] = await Promise.all([
          repository.fetchTemplates(context.sessionId),
          repository.fetchPanels(context.sessionId)
        ])
        const panelRaw = String(toolCall.args.panel || '').trim()
        let existing: ChatStatusPanel | null = null
        if (panelRaw) {
          const resolved = resolveStatusSystemItem(panels, panelRaw, '状态栏')
          if ('error' in resolved) return invalidArgumentResult(resolved.error)
          existing = resolved.item
        }
        // 模板：更新沿用既有；新建按名称/id 解析
        let template: ChatStatusPanelTemplate | null = null
        if (existing) {
          template = templates.find((item) => item.id === existing?.templateId) || null
          if (!template) return runFailureResult('保存状态栏', new Error(`状态栏「${existing.name}」的模板已不存在`))
        } else {
          const resolved = resolveStatusSystemItem(templates, String(toolCall.args.template || ''), '模板')
          if ('error' in resolved) return invalidArgumentResult(resolved.error)
          template = resolved.item
        }
        // 宿主：不给则沿用既有（新建缺省 none）
        const hostType = (String(toolCall.args.hostType || '').trim() || existing?.hostType || 'none') as ChatStatusPanel['hostType']
        let hostId = existing?.hostId || ''
        let hostName = ''
        if (String(toolCall.args.hostType || '').trim() || !existing) {
          if (hostType === 'session_character') {
            const resolved = resolveStatusSystemItem(context.characterOptions, String(toolCall.args.host || ''), '会话角色')
            if ('error' in resolved) return invalidArgumentResult(resolved.error)
            hostId = String(resolved.item.participantId || '').trim()
            if (!hostId) return invalidArgumentResult(`会话角色「${resolved.item.name}」缺少 participantId，请刷新会话成员后重试`)
            hostName = resolved.item.name
          } else if (hostType === 'temp_entity') {
            const entities = await repository.fetchTempEntities(context.sessionId)
            const resolved = resolveStatusSystemItem(entities, String(toolCall.args.host || ''), '临时实体')
            if ('error' in resolved) return invalidArgumentResult(resolved.error)
            hostId = resolved.item.id
            hostName = resolved.item.name
          } else {
            hostId = ''
          }
        } else if (hostType === 'session_character') {
          // 更新且不换宿主：把既有 hostId 反查成角色名，确认卡片可读
          hostName = context.characterOptions.find((option) => String(option.participantId || option.id) === hostId)?.name || ''
        }
        // 批次B：更新既有状态栏按实例字段快照校验（旧实例回退模板字段）；新建按模板字段（服务端会拷贝快照）
        const fields = existing ? resolvePanelFields(existing, template) : readTemplateFields(template)
        const patched = existing && toolCall.args.fieldPatches !== undefined
          ? applyStatusPanelFieldPatches(fields, toolCall.args.fieldPatches)
          : null
        if (patched && 'error' in patched) return invalidArgumentResult(patched.error)
        const nextFields = patched && 'fields' in patched ? patched.fields : fields
        const provided = (toolCall.args.values && typeof toolCall.args.values === 'object' && !Array.isArray(toolCall.args.values))
          ? toolCall.args.values as Record<string, unknown>
          : {}
        const built = buildStatusPanelValues({
          fields: nextFields,
          provided,
          existingValues: existing?.values || {},
          panels,
          ...(existing ? { selfPanelId: existing.id } : {})
        })
        if ('error' in built) return invalidArgumentResult(built.error)
        const name = String(toolCall.args.name || '').trim() || existing?.name || ''
        const description = toolCall.args.description === undefined
          ? String(existing?.description || template.description || '')
          : String(toolCall.args.description || '').trim()
        const action = existing ? '更新状态栏' : '新建状态栏'
        const hostLine = hostType === 'none' ? '独立实体' : hostType === 'user' ? '用户' : `${hostType === 'session_character' ? '会话角色' : '临时实体'}·${hostName || hostId}`
        const denied = await askConfirmWrite(ctx.confirmWrite, {
          title: action,
          lines: [
            `会话：${context.sessionTitle}`,
            `状态栏：${name}（模板=${template.name}·宿主=${hostLine}）`,
            `用途摘要：${description || '将由服务端按模板与字段生成'}`,
            ...(patched && 'changedLines' in patched ? [`字段设置：${patched.changedLines.join('；')}`] : []),
            ...(built.changedLines.length ? [`本次写入字段：${built.changedLines.join('；')}`] : ['本次不改字段值。'])
          ]
        }, action)
        if (denied) return denied
        const saved = await repository.savePanel(context.sessionId, {
          ...(existing ? { id: existing.id } : {}),
          templateId: template.id,
          name,
          description,
          hostType,
          hostId,
          values: built.values,
          ...(patched && 'fields' in patched ? { fields: patched.fields } : {}),
          expectedVersion: existing?.version || 0,
          source: 'xingyi'
        })
        notifyStatusSystemUpdated()
        return {
          content: `${action}成功：「${saved.name}」（模板=${template.name}·id=${saved.id}）${patched && 'changedLines' in patched ? `，已修改字段设置：${patched.changedLines.join('；')}` : ''}${built.changedLines.length ? `，已写入：${built.changedLines.join('；')}` : ''}。`,
          details: { panelId: saved.id, ok: true, fieldPatches: patched && 'changedLines' in patched ? patched.changedLines : [] }
        }
      } catch (error) {
        return runFailureResult('保存状态栏', error)
      }
    }
  }
}

/** 删除模板或状态栏（写操作·经确认门·严厉警示）。 */
export function createDeleteStatusItemTool(ctx: XingyiStatusSystemToolContext): ToolDefinition {
  const repository = ctx.repository ?? defaultRepository()
  return {
    name: 'deleteStatusItem',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '删除一个状态栏模板或状态栏实例（写操作，会先弹带严厉警示的确认；有实例的模板、被引用的状态栏服务端会拒绝删除）。',
    schema: {
      type: 'object',
      properties: {
        itemType: { type: 'string', enum: ['template', 'panel'], description: '要删除的对象：template=模板；panel=状态栏实例（必填）。' },
        name: { type: 'string', description: '目标名称或 id（必填）。' },
        session: { type: 'string', description: '要操作的会话（可选·缺省=当前打开会话）：会话名/联系人名/targetId/sessionId。' },
        reason: { type: 'string', description: '为何删除（可选，简短，供审计）。' }
      },
      required: ['itemType', 'name']
    },
    validateArgs: (args) => {
      const itemType = String(args.itemType || '').trim()
      if (itemType !== 'template' && itemType !== 'panel') return 'deleteStatusItem 的 itemType 必须是 template 或 panel'
      if (!String(args.name || '').trim()) return 'deleteStatusItem 缺少 name（目标名称或 id）'
      return null
    },
    execute: async (toolCall) => {
      const resolved = await resolveSessionOrResult(ctx, toolCall.args.session)
      if ('result' in resolved) return resolved.result
      const context = resolved.context
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '删除状态系统条目')!
      const itemType = String(toolCall.args.itemType || '').trim() as 'template' | 'panel'
      try {
        const items: Array<{ id: string; name: string }> = itemType === 'template'
          ? await repository.fetchTemplates(context.sessionId)
          : await repository.fetchPanels(context.sessionId)
        const resolved = resolveStatusSystemItem(items, String(toolCall.args.name || ''), itemType === 'template' ? '模板' : '状态栏')
        if ('error' in resolved) return invalidArgumentResult(resolved.error)
        const noun = itemType === 'template' ? '模板' : '状态栏'
        const action = `删除状态栏${noun}`
        const denied = await askConfirmWrite(ctx.confirmWrite, {
          title: action,
          lines: [
            `会话：${context.sessionTitle}`,
            `目标：${noun}「${resolved.item.name}」（id=${resolved.item.id}）`,
            '⚠️ 删除后无法恢复，没有本机服务副本。',
            itemType === 'template'
              ? '若该模板还有状态栏实例，服务端会拒绝删除（需先删实例）。'
              : '若还有其他状态栏引用着它，服务端会拒绝删除（需先解除引用）。'
          ]
        }, action)
        if (denied) return denied
        if (itemType === 'template') {
          await repository.deleteTemplate(context.sessionId, resolved.item.id)
        } else {
          await repository.deletePanel(context.sessionId, resolved.item.id, Number((resolved.item as ChatStatusPanel).version || 1), { source: 'xingyi' })
        }
        notifyStatusSystemUpdated()
        return {
          content: `已删除${noun}「${resolved.item.name}」。`,
          details: { deletedId: resolved.item.id, itemType, ok: true }
        }
      } catch (error) {
        // 409（模板有实例/被引用）等服务端中文报错原样透传
        return runFailureResult('删除状态系统条目', error)
      }
    }
  }
}

/** 状态系统四件套：harness 一把装配。 */
export function createXingyiStatusSystemTools(ctx: XingyiStatusSystemToolContext): ToolDefinition[] {
  return [
    createListStatusSystemTool(ctx),
    createSaveStatusTemplateTool(ctx),
    createSaveStatusPanelTool(ctx),
    createDeleteStatusItemTool(ctx)
  ]
}
