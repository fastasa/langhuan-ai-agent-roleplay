import type { ChatStatusPanel, ChatStatusPanelTemplate, StatusPanelFieldDef } from '../types'
import type { OrchestrationCommandEnvelope, OrchestrationTargetRef } from '../../shared/orchestrationWorkspace'
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { normalizeStatusPanelPresentation } from '../../shared/statusPanelPresentation'
import type { TidiaoStatusSystemToolContext } from './tidiaoToolBusinessContext'
import {
  buildStatusPanelValues,
  readTemplateFieldRows,
  readTemplateFields,
  resolvePanelFields,
  resolveStatusSystemItem,
  type TemplateFieldRowArgs
} from './xingyiStatusSystemTools'

export const ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME = 'applyStatusPanelBatch'

export const ZAOCE_STATUS_VALUE_PROVENANCE = [
  'observed',
  'inferred',
  'creative_default',
  'unknown'
] as const

export type ZaoceStatusValueProvenance = (typeof ZAOCE_STATUS_VALUE_PROVENANCE)[number]

export interface ZaoceStatusBatchTemplateInput {
  /** 既有模板名称或 id；缺省表示新建。 */
  template?: string
  name?: string
  kind?: string
  description?: string
  fields?: TemplateFieldRowArgs[]
  /** 状态栏展示协议 v1；只接受受控 block/表达式。 */
  presentation?: unknown
  reason?: string
}

export interface ZaoceStatusBatchPanelInput {
  /** 既有状态栏名称或 id；缺省表示新建。 */
  panel?: string
  /** 新建时的模板名称或 id；批次同时提交模板时可省略。 */
  template?: string
  name?: string
  description?: string
  hostType?: 'session_character' | 'temp_entity' | 'user' | 'none'
  /** 只接名称或业务 id；正式 hostId 由代码按当前 statusSystem 接缝解析。 */
  host?: string
  values?: Record<string, unknown>
  valueProvenance?: Record<string, ZaoceStatusValueProvenance>
  /** 实例独立展示快照；省略时新建实例继承模板、既有实例保持原样。 */
  presentation?: unknown
  reason?: string
}

export interface ZaoceApplyStatusPanelBatchArgs extends Record<string, unknown> {
  template?: ZaoceStatusBatchTemplateInput
  panels: ZaoceStatusBatchPanelInput[]
  reason?: string
}

export interface ZaoceStatusBatchOperationResult {
  command: string
  targetRef: OrchestrationTargetRef
  version: number
  resultRef?: string
}

export interface ZaoceStatusBatchExecutionResult {
  viewRevision: string
  operations: ZaoceStatusBatchOperationResult[]
}

export interface ZaoceStatusBatchToolContext extends TidiaoStatusSystemToolContext {
  /** 当前会话正式世界作用域；无挂载世界时允许为空字符串，但仍由代码固定下发。 */
  worldId: string
  sourceAgentRunId: string
  sourceMessageId?: string
  execute: (sessionId: string, commands: OrchestrationCommandEnvelope[]) => Promise<ZaoceStatusBatchExecutionResult>
}

export interface ZaoceStatusBatchReceipt {
  index: number
  kind: 'template' | 'panel'
  /** 实际事务中写入的可见名称；供交稿从真实回执反推，不再要求模型重复抄写。 */
  name: string
  action: 'create' | 'update'
  command: 'saveStatusPanelTemplate' | 'saveStatusPanel'
  targetId: string
  version: number
  idempotencyKey: string
  resultRef?: string
  valueProvenance?: Record<string, ZaoceStatusValueProvenance>
}

type PlannedTemplate = {
  input: ZaoceStatusBatchTemplateInput
  existing: ChatStatusPanelTemplate | null
  template: ChatStatusPanelTemplate
  command: OrchestrationCommandEnvelope
}

type PlannedPanel = {
  index: number
  input: ZaoceStatusBatchPanelInput
  existing: ChatStatusPanel | null
  panelId: string
  template: ChatStatusPanelTemplate
}

const VALUE_PROVENANCE_SET = new Set<string>(ZAOCE_STATUS_VALUE_PROVENANCE)
const HOST_TYPES = new Set(['session_character', 'temp_entity', 'user', 'none'])

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)])
    )
  }
  return value
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function deterministicToken(seed: string): string {
  return `${fnv1a32(`a:${seed}`)}${fnv1a32(`b:${seed}`)}`
}

function buildCreateId(kind: 'template' | 'panel', runId: string, index: number, name: string): string {
  return `status_${kind}_zaoce_${deterministicToken(`${runId}:${kind}:${index}:${name}`)}`
}

function buildIdempotencyKey(
  runId: string,
  command: OrchestrationCommandEnvelope['command'],
  targetId: string,
  payload: Record<string, unknown>
): string {
  return `zaoce:${deterministicToken(runId)}:${command}:${targetId}:${deterministicToken(stableJson(payload))}`
}

function errorResult(
  message: string,
  type: 'INVALID_ARGUMENT' | 'TOOL_RUNTIME_ERROR' = 'INVALID_ARGUMENT',
  details: Record<string, unknown> = {}
): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type, message, retryable: true, details },
    details
  }
}

function validateValueProvenance(
  values: Record<string, unknown>,
  raw: unknown,
  panelIndex: number
): { value: Record<string, ZaoceStatusValueProvenance> } | { error: ToolExecutionResult } {
  if (raw === undefined) return { value: {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: errorResult(`panels[${panelIndex}].valueProvenance 必须是字段名到来源类型的对象。`, 'INVALID_ARGUMENT', { panelIndex, path: 'valueProvenance' }) }
  }
  const normalized: Record<string, ZaoceStatusValueProvenance> = {}
  for (const [key, provenance] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      return { error: errorResult(`panels[${panelIndex}] 的值来源字段「${key}」不在本次 values 写入中。`, 'INVALID_ARGUMENT', { panelIndex, key }) }
    }
    const value = text(provenance)
    if (!VALUE_PROVENANCE_SET.has(value)) {
      return { error: errorResult(`panels[${panelIndex}] 的值来源类型不合法：${value || '（空）'}。可用：${ZAOCE_STATUS_VALUE_PROVENANCE.join('、')}。`, 'INVALID_ARGUMENT', { panelIndex, key, provenance: value }) }
    }
    normalized[key] = value as ZaoceStatusValueProvenance
  }
  return { value: normalized }
}

function sourceOf(ctx: ZaoceStatusBatchToolContext, evidenceSummary: string) {
  return {
    ...(text(ctx.sourceMessageId) ? { sourceMessageId: text(ctx.sourceMessageId) } : {}),
    sourceAgentRunId: text(ctx.sourceAgentRunId),
    evidenceSummary
  }
}

function envelopeBase(
  ctx: ZaoceStatusBatchToolContext,
  evidenceSummary: string
): Pick<OrchestrationCommandEnvelope, 'sessionId' | 'worldId' | 'source'> {
  return {
    sessionId: text(ctx.sessionId),
    worldId: text(ctx.worldId),
    source: sourceOf(ctx, evidenceSummary)
  }
}

function buildTemplatePlan(input: {
  ctx: ZaoceStatusBatchToolContext
  raw: ZaoceStatusBatchTemplateInput
  templates: ChatStatusPanelTemplate[]
  batchReason: string
}): PlannedTemplate | ToolExecutionResult {
  const target = text(input.raw.template)
  let existing: ChatStatusPanelTemplate | null = null
  if (target) {
    const resolved = resolveStatusSystemItem(input.templates, target, '模板')
    if ('error' in resolved) return errorResult(resolved.error)
    existing = resolved.item
  }
  if (!existing && !text(input.raw.name)) return errorResult('applyStatusPanelBatch 新建模板缺少 name。')
  if (!existing && !text(input.raw.kind)) return errorResult('applyStatusPanelBatch 新建模板缺少 kind。')
  if (existing && !text(input.raw.name) && !text(input.raw.kind) && input.raw.description === undefined && !Array.isArray(input.raw.fields) && input.raw.presentation === undefined) {
    return errorResult('applyStatusPanelBatch 更新模板至少要给一个修改项（name/kind/description/fields/presentation）。')
  }
  const fields = Array.isArray(input.raw.fields)
    ? readTemplateFieldRows(input.raw.fields)
    : readTemplateFields(existing).map((field) => ({ ...field }))
  if (!existing && fields.length === 0) return errorResult('applyStatusPanelBatch 新建模板缺少 fields（至少 1 个字段定义）。')
  const presentationResult = normalizeStatusPanelPresentation(
    input.raw.presentation === undefined ? existing?.presentation : input.raw.presentation,
    fields
  )
  if (!presentationResult.ok) return errorResult(`applyStatusPanelBatch.template.presentation 不合法：${presentationResult.errors.join('；')}`)
  const templateId = existing?.id || buildCreateId('template', input.ctx.sourceAgentRunId, 0, text(input.raw.name))
  const payload: Record<string, unknown> = {
    name: text(input.raw.name) || existing?.name || '',
    kind: text(input.raw.kind) || existing?.kind || '',
    description: input.raw.description === undefined ? text(existing?.description) : text(input.raw.description),
    fields: fields as StatusPanelFieldDef[],
    presentation: presentationResult.presentation,
    createdBy: 'agent'
  }
  const evidence = text(input.raw.reason) || input.batchReason || '造册 Agent 根据已确认范围设计状态栏模板'
  const command: OrchestrationCommandEnvelope = {
    command: 'saveStatusPanelTemplate',
    ...envelopeBase(input.ctx, evidence),
    targetRef: { kind: 'status_panel_template', templateId },
    expectedVersion: existing?.version || 0,
    idempotencyKey: buildIdempotencyKey(input.ctx.sourceAgentRunId, 'saveStatusPanelTemplate', templateId, payload),
    payload
  }
  return {
    input: input.raw,
    existing,
    template: {
      id: templateId,
      sessionId: input.ctx.sessionId,
      name: String(payload.name),
      kind: String(payload.kind),
      description: String(payload.description),
      fields: fields as StatusPanelFieldDef[],
      presentation: presentationResult.presentation,
      createdBy: 'agent',
      version: existing?.version || 0
    },
    command
  }
}

async function planPanels(input: {
  ctx: ZaoceStatusBatchToolContext
  rawPanels: ZaoceStatusBatchPanelInput[]
  templates: ChatStatusPanelTemplate[]
  panels: ChatStatusPanel[]
  batchTemplate: PlannedTemplate | null
  batchReason: string
}): Promise<{ plans: PlannedPanel[]; commands: OrchestrationCommandEnvelope[] } | { error: ToolExecutionResult }> {
  const plans: PlannedPanel[] = []
  const targetIds = new Set<string>()
  for (let index = 0; index < input.rawPanels.length; index += 1) {
    const raw = input.rawPanels[index]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: errorResult(`panels[${index}] 必须是对象。`, 'INVALID_ARGUMENT', { panelIndex: index }) }
    }
    let existing: ChatStatusPanel | null = null
    if (text(raw.panel)) {
      const resolved = resolveStatusSystemItem(input.panels, text(raw.panel), '状态栏')
      if ('error' in resolved) return { error: errorResult(resolved.error, 'INVALID_ARGUMENT', { panelIndex: index }) }
      existing = resolved.item
    }
    if (!existing && !text(raw.name)) return { error: errorResult(`panels[${index}] 新建状态栏缺少 name。`) }
    if (!existing && !text(raw.description)) return { error: errorResult(`panels[${index}] 新建状态栏缺少 description。`) }
    const hostTypeRaw = text(raw.hostType)
    if (hostTypeRaw && !HOST_TYPES.has(hostTypeRaw)) {
      return { error: errorResult(`panels[${index}].hostType 必须是 session_character/temp_entity/user/none。`) }
    }
    if ((hostTypeRaw === 'session_character' || hostTypeRaw === 'temp_entity') && !text(raw.host)) {
      return { error: errorResult(`panels[${index}] 的宿主类型是 ${hostTypeRaw}，必须给 host（名称或业务 id）。`) }
    }
    let template: ChatStatusPanelTemplate | null = null
    if (existing) {
      template = input.templates.find((item) => item.id === existing?.templateId) || null
      if (!template) return { error: errorResult(`状态栏「${existing.name}」的模板已不存在。`, 'TOOL_RUNTIME_ERROR', { panelIndex: index, panelId: existing.id }) }
    } else if (text(raw.template)) {
      const resolved = resolveStatusSystemItem(input.templates, text(raw.template), '模板')
      if ('error' in resolved) return { error: errorResult(resolved.error, 'INVALID_ARGUMENT', { panelIndex: index }) }
      template = resolved.item
    } else if (input.batchTemplate) {
      template = input.batchTemplate.template
    }
    if (!template) return {
      error: errorResult(`panels[${index}] 新建状态栏缺少 template，且本批没有可沿用的模板。现成模板不存在不是阻断：请根据任务目的原创 template，并与 panels 放在同一次 applyStatusPanelBatch 提交。`)
    }
    const panelId = existing?.id || buildCreateId('panel', input.ctx.sourceAgentRunId, index, text(raw.name))
    if (targetIds.has(panelId)) return { error: errorResult(`panels[${index}] 与本批另一项指向同一状态栏 ${panelId}，请合并成一次更新。`) }
    targetIds.add(panelId)
    plans.push({ index, input: raw, existing, panelId, template })
  }

  // 先把本批新面板的确定性 id 加进解析目录，使 ref 字段可以直接写同批其他面板名称。
  const stagedPanels: ChatStatusPanel[] = plans
    .filter((plan) => !plan.existing)
    .map((plan) => ({
      id: plan.panelId,
      sessionId: input.ctx.sessionId,
      templateId: plan.template.id,
      name: text(plan.input.name),
      description: text(plan.input.description),
      hostType: plan.input.hostType || 'none',
      hostId: '',
      values: {},
      version: 0
    }))
  const panelsForResolution = [...input.panels, ...stagedPanels]
  let tempEntities: Array<{ id: string; name: string }> | null = null
  const commands: OrchestrationCommandEnvelope[] = []
  for (const plan of plans) {
    const raw = plan.input
    const existing = plan.existing
    const hostType = (text(raw.hostType) || existing?.hostType || 'none') as ZaoceStatusBatchPanelInput['hostType']
    let hostId = text(existing?.hostId)
    if (text(raw.hostType) || !existing) {
      if (hostType === 'session_character') {
        const resolved = resolveStatusSystemItem(input.ctx.characterOptions || [], text(raw.host), '会话角色')
        if ('error' in resolved) return { error: errorResult(resolved.error, 'INVALID_ARGUMENT', { panelIndex: plan.index }) }
        hostId = text(resolved.item.participantId)
        if (!hostId) {
          return {
            error: errorResult(
              `panels[${plan.index}] 的会话角色宿主「${text(resolved.item.name) || text(raw.host)}」缺少正式 participantId，不能用 characterId 代替。请刷新会话成员后重试。`,
              'TOOL_RUNTIME_ERROR',
              { panelIndex: plan.index, characterId: text(resolved.item.id), host: text(raw.host) }
            )
          }
        }
      } else if (hostType === 'temp_entity') {
        tempEntities ??= await input.ctx.repository.fetchTempEntities(input.ctx.sessionId)
        const resolved = resolveStatusSystemItem(tempEntities, text(raw.host), '临时实体')
        if ('error' in resolved) return { error: errorResult(resolved.error, 'INVALID_ARGUMENT', { panelIndex: plan.index }) }
        hostId = resolved.item.id
      } else {
        hostId = ''
      }
    }
    const fields = existing ? resolvePanelFields(existing, plan.template) : readTemplateFields(plan.template)
    const provided = raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values)
      ? raw.values
      : {}
    // 与现役状态工具保持同一整包值协议：先合并既有值，再由服务端校验并保存；否则旧服务端或
    // 兼容仓储仍按 values_json 整包替换时，局部更新会误清未提交字段。
    const built = buildStatusPanelValues({
      fields,
      provided,
      existingValues: existing?.values || {},
      panels: panelsForResolution,
      ...(existing ? { selfPanelId: existing.id } : {})
    })
    if ('error' in built) return { error: errorResult(`panels[${plan.index}]：${built.error}`, 'INVALID_ARGUMENT', { panelIndex: plan.index }) }
    const provenance = validateValueProvenance(built.values, raw.valueProvenance, plan.index)
    if ('error' in provenance) return { error: provenance.error }
    const presentationResult = normalizeStatusPanelPresentation(
      raw.presentation === undefined ? (existing?.presentation ?? plan.template.presentation) : raw.presentation,
      fields
    )
    if (!presentationResult.ok) {
      return { error: errorResult(`panels[${plan.index}].presentation 不合法：${presentationResult.errors.join('；')}`, 'INVALID_ARGUMENT', { panelIndex: plan.index, path: 'presentation' }) }
    }
    const payload: Record<string, unknown> = {
      templateId: plan.template.id,
      name: text(raw.name) || existing?.name || '',
      description: raw.description === undefined
        ? text(existing?.description || plan.template.description)
        : text(raw.description),
      hostType,
      hostId,
      values: built.values,
      valueProvenance: provenance.value,
      presentation: presentationResult.presentation,
      source: 'zaoce'
    }
    const evidence = text(raw.reason) || input.batchReason || '造册 Agent 根据已确认范围批量保存状态栏'
    commands.push({
      command: 'saveStatusPanel',
      ...envelopeBase(input.ctx, evidence),
      targetRef: { kind: 'status_panel', panelId: plan.panelId },
      expectedVersion: existing?.version || 0,
      idempotencyKey: buildIdempotencyKey(input.ctx.sourceAgentRunId, 'saveStatusPanel', plan.panelId, payload),
      payload
    })
  }
  return { plans, commands }
}

export function createZaoceApplyStatusPanelBatchTool(ctx: ZaoceStatusBatchToolContext): ToolDefinition<ZaoceApplyStatusPanelBatchArgs> {
  return {
    name: ZAOCE_APPLY_STATUS_PANEL_BATCH_TOOL_NAME,
    brief: '把可选的一次模板新建/更新和至少一张状态栏新建/更新作为同一原子事务提交。同一任务里多个宿主、多个新栏或多项更新应优先汇总为一次调用；只有整批校验冲突且各组互不依赖时才拆批。session/world/目标 id/hostId/版本/幂等键由代码按当前正式范围补齐；任一项失败整批不落库，可按错误修正后重试。软字段可用 valueProvenance 标记 observed/inferred/creative_default/unknown。成功只返回逐项回执，不代表造册任务已经完成。',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        template: {
          type: 'object',
          description: '可选：本批同时新建或更新一个模板。给 template=既有模板名称/id 表示更新；省略表示新建。',
          properties: {
            template: { type: 'string' },
            name: { type: 'string' },
            kind: { type: 'string' },
            description: { type: 'string' },
            fields: { type: 'array', items: { type: 'object' } },
            presentation: { type: 'object', description: '受控状态栏展示协议 v1；只允许 metric/donut/bar/progress/field-list/reference-list/media。' },
            reason: { type: 'string' }
          }
        },
        panels: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              panel: { type: 'string', description: '既有状态栏名称/id；省略表示新建。' },
              template: { type: 'string', description: '新建时使用的模板名称/id；本批带 template 时可省略。' },
              name: { type: 'string' },
              description: { type: 'string' },
              hostType: { type: 'string', enum: ['session_character', 'temp_entity', 'user', 'none'] },
              host: { type: 'string', description: '宿主名称或业务 id；代码解析成正式 hostId。' },
              values: { type: 'object' },
              valueProvenance: {
                type: 'object',
                additionalProperties: { type: 'string', enum: [...ZAOCE_STATUS_VALUE_PROVENANCE] }
              },
              presentation: { type: 'object', description: '实例独立展示快照；省略时新建继承模板、既有保持原样。' },
              reason: { type: 'string' }
            }
          }
        },
        reason: { type: 'string', description: '整批写入依据；单项 reason 可覆盖。' }
      },
      required: ['panels']
    },
    validateArgs: (args) => {
      if (!Array.isArray(args.panels) || args.panels.length < 1) return 'applyStatusPanelBatch 至少需要 1 张 panel。'
      if (args.panels.length > 20) return 'applyStatusPanelBatch 单批最多 20 张 panel。'
      if (args.template !== undefined && (!args.template || typeof args.template !== 'object' || Array.isArray(args.template))) {
        return 'applyStatusPanelBatch.template 必须是对象。'
      }
      return null
    },
    execute: async (toolCall) => {
      const sessionId = text(ctx.sessionId)
      const sourceAgentRunId = text(ctx.sourceAgentRunId)
      if (!sessionId || !sourceAgentRunId) {
        return errorResult('applyStatusPanelBatch 缺少代码侧正式 sessionId 或 sourceAgentRunId，未提交任何写入。', 'TOOL_RUNTIME_ERROR', {
          providerMissing: true
        })
      }
      try {
        const [templates, panels] = await Promise.all([
          ctx.repository.fetchTemplates(sessionId),
          ctx.repository.fetchPanels(sessionId)
        ])
        const batchReason = text(toolCall.args.reason)
        let templatePlan: PlannedTemplate | null = null
        if (toolCall.args.template) {
          const planned = buildTemplatePlan({ ctx, raw: toolCall.args.template, templates, batchReason })
          if ('status' in planned && planned.status === 'error') return planned
          templatePlan = planned as PlannedTemplate
        }
        const templatesForResolution = templatePlan
          ? [...templates.filter((item) => item.id !== templatePlan?.template.id), templatePlan.template]
          : templates
        const panelPlan = await planPanels({
          ctx,
          rawPanels: toolCall.args.panels,
          templates: templatesForResolution,
          panels,
          batchTemplate: templatePlan,
          batchReason
        })
        if ('error' in panelPlan) return panelPlan.error
        const commands = [
          ...(templatePlan ? [templatePlan.command] : []),
          ...panelPlan.commands
        ]
        const result = await ctx.execute(sessionId, commands)
        if (!result || !Array.isArray(result.operations) || result.operations.length !== commands.length) {
          return errorResult('applyStatusPanelBatch 收到不完整事务回执；请重读状态目录后再重试，不要假定任何单项已经成功。', 'TOOL_RUNTIME_ERROR', {
            expectedReceiptCount: commands.length,
            receivedReceiptCount: Array.isArray(result?.operations) ? result.operations.length : 0
          })
        }
        const receipts: ZaoceStatusBatchReceipt[] = commands.map((command, index) => {
          const operation = result.operations[index]
          const isTemplate = command.command === 'saveStatusPanelTemplate'
          const panelPlanItem = isTemplate ? null : panelPlan.plans[index - (templatePlan ? 1 : 0)]
          return {
            index,
            kind: isTemplate ? 'template' : 'panel',
            name: isTemplate
              ? String(templatePlan?.template.name || (command.targetRef as { templateId?: string }).templateId || '').trim()
              : String(panelPlanItem?.input.name || panelPlanItem?.existing?.name || (command.targetRef as { panelId?: string }).panelId || '').trim(),
            action: (isTemplate ? templatePlan?.existing : panelPlanItem?.existing) ? 'update' : 'create',
            command: command.command as 'saveStatusPanelTemplate' | 'saveStatusPanel',
            targetId: isTemplate
              ? (command.targetRef as { templateId: string }).templateId
              : (command.targetRef as { panelId: string }).panelId,
            version: Math.max(0, Number(operation.version || 0)),
            idempotencyKey: command.idempotencyKey,
            ...(text(operation.resultRef) ? { resultRef: text(operation.resultRef) } : {}),
            ...(!isTemplate
              ? { valueProvenance: { ...(command.payload.valueProvenance as Record<string, ZaoceStatusValueProvenance>) } }
              : {})
          }
        })
        return {
          content: `状态栏批量事务已提交：${receipts.map((receipt) => `${receipt.kind === 'template' ? '模板' : '状态栏'} ${receipt.targetId}@v${receipt.version}`).join('；')}。请根据逐项回执继续核对任务是否完整。`,
          details: { viewRevision: text(result.viewRevision), receipts },
          status: 'success',
          acted: true
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '未知错误')
        return errorResult(`状态栏批量事务失败，整批未确认落库：${message}。请按错误修正参数后重试。`, 'TOOL_RUNTIME_ERROR', {
          retryWithSameBatch: true
        })
      }
    }
  }
}
