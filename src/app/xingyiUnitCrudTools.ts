/**
 * 星依单位增删改移动工具（2026-07-07 计划批次1）——「一套工具外观 + 领域适配器」。
 *
 * 九件套（2026-07-11 编译页诊断修复计划批1/2 扩容）：
 * listUnitTree / readUnit / diagnoseCompilePages（只读）
 * + createUnit / editUnitBody / editUnitCompilePage / renameUnit / moveUnit / deleteUnit
 * （写操作·confirmWrite 硬门）。工具层只管 schema 校验、domain 分发与确认卡片；真值操作全部
 * 由领域适配器完成（文档库=xingyiUnitCrudDocLibraryAdapter，角色大脑=xingyiUnitCrudBrainAdapter）。
 *
 * 与 bridge 工具（xingyiFunctionTools）的关键区别：适配器写路径是仓库/store 真值直写
 * （用户 2026-07-07 拍板「不要求页面在场」），页面刷新由适配器保存后广播事件补齐。
 * editUnitCompilePage 原是 bridge 版（要求页面在场），2026-07-11 迁入本家族页面无关化，旧版已整删。
 *
 * 写确认门（硬门）语义与 xingyiFunctionTools 一致，模板单一实现=interactionContract 统一 helper（2026-07-12 批C 收敛）：
 * confirmWrite 缺失一律拒绝执行；用户取消返回「已取消」的成功态结果（模型不重试）。
 * 危险删除（用户拍板）：确认卡片必须带严厉警示与误删后果，由适配器在 confirmLines 里给出。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel } from './agentRuntime/interactionContract'
import { parseRelationHintLine } from './relationHintParser'
import { UNIT_SEMANTIC_TYPES } from './unitSemanticTypes'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'

export type XingyiUnitCrudDomain = 'docLibrary' | 'characterBrain'

export interface XingyiUnitCrudError { error: string }

/** 写计划：适配器先算好确认卡片内容与执行闭包，工具层过确认门后才 apply（两阶段，防先斩后奏）。 */
export interface XingyiUnitWritePlan {
  confirmLines: string[]
  apply: () => Promise<{ ok: boolean; message: string }>
}

export interface XingyiUnitCrudAdapter {
  /** 确认卡片/报错里的领域名（如「世界书文档库」「角色大脑」）。 */
  label: string
  listTree(input: { scope?: string; parent?: string }): Promise<{ text: string } | XingyiUnitCrudError>
  readUnit(input: { scope?: string; unit: string }): Promise<{ text: string } | XingyiUnitCrudError>
  /** 编译页体检（只读·2026-07-11 批1）：树灯同源的黄/红灯报告，parent 可限定子树。 */
  diagnoseCompilePages(input: { scope?: string; parent?: string; maxUnits?: number }): Promise<{ text: string } | XingyiUnitCrudError>
  planCreate(input: { scope?: string; kind: string; title: string; parent?: string; body?: string; date?: string }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
  planEditBody(input: { scope?: string; unit: string; body?: string; replaceInBody?: { oldText: string; newText: string } }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
  /** 编译页精确修改（写·2026-07-11 批2）：定点替换/字段覆盖，页面无关真值直写。 */
  planEditCompilePage(input: { scope?: string; unit: string; edit: XingyiCompilePageEditArgs }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
  planRename(input: { scope?: string; unit: string; newTitle: string }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
  planMove(input: { scope?: string; unit: string; newParent: string }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
  planDelete(input: { scope?: string; unit: string }): Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
}

export interface XingyiUnitCrudToolContext {
  /** 写确认门（同 xingyiFunctionTools 硬门语义：缺省一律拒绝执行写操作）。 */
  confirmWrite?: XingyiWriteConfirm
  /** 本轮是否已经成功读取关系提示专项 Skill。 */
  hasReadRelationHintSkill?: () => boolean
  /** 领域适配器表：只装配已接入的领域（批次1=docLibrary，批次2 加 characterBrain）。 */
  adapters: Partial<Record<XingyiUnitCrudDomain, XingyiUnitCrudAdapter>>
}

const CLIP_LIMIT = 80

function clipText(text: string, limit = CLIP_LIMIT): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

/** 正文编辑应用（与 editUnitCompilePage 的摘要定点替换同一套心智）：唯一锚点替换或整段覆盖，二选一。 */
export function applyXingyiUnitBodyEdit(
  currentBody: string,
  edit: { body?: string; replaceInBody?: { oldText: string; newText: string } }
): { next: string; changedLines: string[] } | { error: string } {
  if (edit.replaceInBody) {
    const { oldText, newText } = edit.replaceInBody
    const occurrences = currentBody.split(oldText).length - 1
    if (!occurrences) {
      return { error: `当前正文里没有找到要替换的片段「${clipText(oldText)}」。请先用 readUnit 读到最新正文再精确定位。` }
    }
    if (occurrences > 1) {
      return { error: `要替换的片段「${clipText(oldText)}」在正文里出现了 ${occurrences} 次，请给更长的独特片段精确定位。` }
    }
    return {
      next: currentBody.replace(oldText, newText),
      changedLines: [`正文片段：「${clipText(oldText)}」→「${clipText(newText)}」`]
    }
  }
  if (typeof edit.body === 'string') {
    return {
      next: edit.body,
      changedLines: [`正文整段覆盖：原 ${currentBody.length} 字 → 新 ${edit.body.length} 字（新正文开头：「${clipText(edit.body)}」）`]
    }
  }
  return { error: '这次编辑没有给任何修改内容。' }
}

/* ---------- 编译页精确编辑纯函数（2026-07-11 批2 自 xingyiFunctionTools 迁入·旧 bridge 版已整删） ---------- */

/** 编译页字段快照（编辑用）：视图合并后的当前值，semanticType 一并纳入。 */
export interface XingyiCompilePageFields {
  summary: string
  tags: string[]
  semanticType: string
  relationHints: string[]
}

export interface XingyiCompilePageEditArgs {
  replaceInSummary?: { oldText: string; newText: string }
  summary?: string
  tags?: string[]
  type?: string
  relationHints?: string[]
}

function readTextList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item || '').trim()).filter(Boolean)
}

export function readCompilePageEditArgs(args: Record<string, unknown>): XingyiCompilePageEditArgs {
  const raw = args.replaceInSummary as { oldText?: unknown; newText?: unknown } | undefined
  const replaceInSummary = raw && typeof raw === 'object'
    ? { oldText: String(raw.oldText ?? ''), newText: String(raw.newText ?? '') }
    : undefined
  return {
    ...(replaceInSummary?.oldText ? { replaceInSummary } : {}),
    ...(typeof args.summary === 'string' && args.summary.trim() ? { summary: String(args.summary).trim() } : {}),
    ...(Array.isArray(args.tags) ? { tags: readTextList(args.tags) } : {}),
    ...(typeof args.type === 'string' && args.type.trim() ? { type: String(args.type).trim() } : {}),
    ...(Array.isArray(args.relationHints) ? { relationHints: readTextList(args.relationHints) } : {})
  }
}

export function hasCompilePageEditOps(edit: XingyiCompilePageEditArgs): boolean {
  return Boolean(edit.replaceInSummary || edit.summary || edit.tags || edit.type || edit.relationHints)
}

/** 应用编辑 → 新字段快照 + 变化行（before→after，确认卡片用）；出错返回可读 error 文本。 */
export function applyCompilePageEdit(
  current: XingyiCompilePageFields,
  edit: XingyiCompilePageEditArgs
): { next: XingyiCompilePageFields; changedLines: string[] } | { error: string } {
  const next: XingyiCompilePageFields = {
    ...current,
    tags: [...current.tags],
    relationHints: [...current.relationHints]
  }
  const changedLines: string[] = []
  if (edit.replaceInSummary) {
    const { oldText, newText } = edit.replaceInSummary
    const occurrences = current.summary.split(oldText).length - 1
    if (!occurrences) {
      return { error: `当前摘要里没有找到要替换的片段「${clipText(oldText)}」。当前摘要：${current.summary || '（空）'}` }
    }
    if (occurrences > 1) {
      return { error: `要替换的片段「${clipText(oldText)}」在摘要里出现了 ${occurrences} 次，请给更长的独特片段精确定位。` }
    }
    next.summary = current.summary.replace(oldText, newText)
    changedLines.push(`摘要片段：「${clipText(oldText)}」→「${clipText(newText)}」`)
  }
  if (edit.summary) {
    next.summary = edit.summary
    changedLines.push(`摘要整段：「${clipText(current.summary)}」→「${clipText(edit.summary)}」`)
  }
  if (edit.tags) {
    next.tags = edit.tags
    changedLines.push(`标签：「${current.tags.join('、') || '（空）'}」→「${edit.tags.join('、')}」`)
  }
  if (edit.type) {
    if (!UNIT_SEMANTIC_TYPES.includes(edit.type as (typeof UNIT_SEMANTIC_TYPES)[number])) {
      return { error: `类型「${edit.type}」不是合法枚举值，可选：${UNIT_SEMANTIC_TYPES.join(', ')}。` }
    }
    next.semanticType = edit.type
    changedLines.push(`类型：「${current.semanticType}」→「${edit.type}」`)
  }
  if (edit.relationHints) {
    if (edit.relationHints.includes('无') && edit.relationHints.length > 1) {
      return { error: '关系提示「无」只能作为整组唯一一行，不能和其它关系同时写入。' }
    }
    const invalid = edit.relationHints.find((hint) => {
      if (hint === '无') return false
      const parsed = parseRelationHintLine(hint)
      return parsed.warnings.length > 0
        || (parsed.assertions.length === 0 && parsed.legacyHints.length === 0)
    })
    if (invalid) {
      const warning = parseRelationHintLine(invalid).warnings[0]?.message
      return {
        error: warning
          ? `${warning}。请先调用 readRelationHintSkill，并使用手册附录中的登记词。`
          : `关系提示「${invalid}」格式不对，必须是 [[源单位]]_已登记关系词_[[目标单位]]、[[目标单位]] 或“无”。`
      }
    }
    next.relationHints = edit.relationHints
    changedLines.push(`关系提示：「${current.relationHints.join('；') || '（空）'}」→「${edit.relationHints.join('；')}」`)
  }
  if (!changedLines.length) return { error: '这次编辑没有产生任何变化。' }
  return { next, changedLines }
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

function readText(raw: unknown): string {
  return String(raw ?? '').trim()
}

function resolveAdapter(
  ctx: XingyiUnitCrudToolContext,
  rawDomain: unknown
): { adapter: XingyiUnitCrudAdapter; domain: XingyiUnitCrudDomain } | { error: string } {
  const domain = readText(rawDomain) as XingyiUnitCrudDomain
  const adapter = ctx.adapters[domain]
  if (!adapter) {
    const available = Object.keys(ctx.adapters).join('、') || '（无）'
    return { error: `domain「${domain || '（空）'}」未接入，可用领域：${available}` }
  }
  return { adapter, domain }
}

function buildTargetLine(adapter: XingyiUnitCrudAdapter, scope: string): string {
  return scope ? `目标：${adapter.label}（角色：${scope}）` : `目标：${adapter.label}`
}

/** 写工具统一执行器：解析 domain → 硬门检查 → 适配器出计划 → 确认卡片 → apply。 */
async function executeUnitCrudWrite(input: {
  ctx: XingyiUnitCrudToolContext
  action: string
  args: Record<string, unknown>
  plan: (adapter: XingyiUnitCrudAdapter, scope: string) => Promise<XingyiUnitWritePlan | XingyiUnitCrudError>
}): Promise<ToolExecutionResult> {
  const resolved = resolveAdapter(input.ctx, input.args.domain)
  if ('error' in resolved) return invalidArgumentResult(resolved.error)
  // 硬门（统一 helper）：缺通道 helper 必返回拒绝结果，断言非空
  if (!input.ctx.confirmWrite) return requireConfirmWriteChannel(input.ctx.confirmWrite, input.action)!
  const scope = readText(input.args.characterName)
  let plan: XingyiUnitWritePlan | XingyiUnitCrudError
  try {
    plan = await input.plan(resolved.adapter, scope)
  } catch (error) {
    return runFailureResult(input.action, error)
  }
  if ('error' in plan) return invalidArgumentResult(plan.error)
  const denied = await askConfirmWrite(input.ctx.confirmWrite, {
    title: input.action,
    lines: [buildTargetLine(resolved.adapter, scope), ...plan.confirmLines]
  }, input.action)
  if (denied) return denied
  try {
    const result = await plan.apply()
    return {
      content: result.message,
      ...(result.ok ? {} : {
        status: 'error' as const,
        error: { type: 'TOOL_RUNTIME_ERROR' as const, message: result.message, retryable: false }
      }),
      details: { domain: resolved.domain, ok: result.ok }
    }
  } catch (error) {
    return runFailureResult(input.action, error)
  }
}

/** 只读工具统一执行器。 */
async function executeUnitCrudRead(input: {
  ctx: XingyiUnitCrudToolContext
  action: string
  args: Record<string, unknown>
  run: (adapter: XingyiUnitCrudAdapter, scope: string) => Promise<{ text: string } | XingyiUnitCrudError>
}): Promise<ToolExecutionResult> {
  const resolved = resolveAdapter(input.ctx, input.args.domain)
  if ('error' in resolved) return invalidArgumentResult(resolved.error)
  const scope = readText(input.args.characterName)
  try {
    const result = await input.run(resolved.adapter, scope)
    if ('error' in result) return invalidArgumentResult(result.error)
    return { content: result.text, details: { domain: resolved.domain } }
  } catch (error) {
    return runFailureResult(input.action, error)
  }
}

function buildDomainProperty(ctx: XingyiUnitCrudToolContext): Record<string, unknown> {
  return {
    type: 'string',
    enum: Object.keys(ctx.adapters),
    description: '作用领域：docLibrary=世界书文档库；characterBrain=角色大脑（必填）。'
  }
}

const CHARACTER_NAME_PROPERTY = {
  type: 'string',
  description: 'domain=characterBrain 时必填：角色名或角色 id；docLibrary 领域忽略本参数。'
} as const

const UNIT_PROPERTY = {
  type: 'string',
  description: '目标单位：标题、unitId 或 u# 短码（不确定就先 listUnitTree/searchWorldText 查证，必填）。'
} as const

const REASON_PROPERTY = { type: 'string', description: '为何做这次操作（可选，简短，供审计）。' } as const

function validateDomainArgs(ctx: XingyiUnitCrudToolContext, args: Record<string, unknown>, toolLabel: string): string | null {
  const domain = readText(args.domain)
  if (!domain || !Object.prototype.hasOwnProperty.call(ctx.adapters, domain)) {
    return `${toolLabel} 的 domain 必须是：${Object.keys(ctx.adapters).join(' / ')}`
  }
  if (domain === 'characterBrain' && !readText(args.characterName)) {
    return `${toolLabel} 在 domain=characterBrain 时必须给 characterName（角色名或角色 id）`
  }
  return null
}

export function createListUnitTreeTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'listUnitTree',
    brief: '列出文档库世界树或某角色大脑的单位树结构（标题+类型+unitId），供定位单位、决定分组/移动目标（只读）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        parent: { type: 'string', description: '只列某个单位的子树（标题/unitId/路径，可选；缺省=整棵树）。' }
      },
      required: ['domain']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'listUnitTree'),
    execute: (toolCall) => executeUnitCrudRead({
      ctx,
      action: '列出单位树',
      args: toolCall.args,
      run: (adapter, scope) => adapter.listTree({ scope, parent: readText(toolCall.args.parent) || undefined })
    })
  }
}

export function createReadUnitTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'readUnit',
    brief: '读一个单位的原始正文全文与名字/位置信息（编辑前必读，拿到精确锚点；只读）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY
      },
      required: ['domain', 'unit']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'readUnit')
      || (readText(args.unit) ? null : 'readUnit 缺少 unit（单位标题或 unitId）'),
    execute: (toolCall) => executeUnitCrudRead({
      ctx,
      action: '读取单位',
      args: toolCall.args,
      run: (adapter, scope) => adapter.readUnit({ scope, unit: readText(toolCall.args.unit) })
    })
  }
}

/** 编译页体检（只读·2026-07-11 批1）：与树上黄/红灯同源的问题清单，不要求页面打开。 */
export function createDiagnoseCompilePagesTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'diagnoseCompilePages',
    brief: '体检文档库或某角色大脑的编译页：列出树上黄灯（字段缺失）/红灯（关系报错）单位、原因与修法（只读，不要求页面打开）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        parent: { type: 'string', description: '只体检某个单位的子树（标题/unitId/路径，可选；缺省=整棵树）。' },
        maxUnits: { type: 'number', description: '最多展开多少个问题单位（可选，默认 30；问题很多时配合 parent 分批看）。' }
      },
      required: ['domain']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'diagnoseCompilePages'),
    execute: (toolCall) => executeUnitCrudRead({
      ctx,
      action: '体检编译页',
      args: toolCall.args,
      run: (adapter, scope) => adapter.diagnoseCompilePages({
        scope,
        ...(readText(toolCall.args.parent) ? { parent: readText(toolCall.args.parent) } : {}),
        ...(Number(toolCall.args.maxUnits) > 0 ? { maxUnits: Math.floor(Number(toolCall.args.maxUnits)) } : {})
      })
    })
  }
}

export function createCreateUnitTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'createUnit',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '新建单位：全局文档库不依赖当前会话或世界挂载，支持 document（桠/文档）或 folder（枝/分组）；'
      + '新建枝会原子创建 index.md 概览，body 即概览正文。文档库新增后还要按正文事实补齐或复核编译页。角色大脑=灵魂/轨迹单位（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        kind: {
          type: 'string',
          description: '单位类型：docLibrary 用 document/folder；characterBrain 用 soulGroup/soulNode/traceDay/traceEvent/traceArrangement/traceGroup（必填）。'
        },
        title: { type: 'string', description: '新单位标题（必填）。' },
        parent: { type: 'string', description: '放置位置：父单位标题/unitId/路径（文档库路径不存在会自动逐级建枝；folder 缺省=根级树簇）。' },
        body: { type: 'string', description: '初始正文（可选）；docLibrary folder 时这是会写入 index.md 的枝概览正文。' },
        date: { type: 'string', description: '仅轨迹日单位用：目标日期（可选）。' },
        reason: REASON_PROPERTY
      },
      required: ['domain', 'kind', 'title']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'createUnit')
      || (readText(args.kind) ? null : 'createUnit 缺少 kind（单位类型）')
      || (readText(args.title) ? null : 'createUnit 缺少 title（新单位标题）'),
    execute: (toolCall) => executeUnitCrudWrite({
      ctx,
      action: '新建单位',
      args: toolCall.args,
      plan: (adapter, scope) => adapter.planCreate({
        scope,
        kind: readText(toolCall.args.kind),
        title: readText(toolCall.args.title),
        parent: readText(toolCall.args.parent) || undefined,
        ...(typeof toolCall.args.body === 'string' ? { body: toolCall.args.body } : {}),
        ...(readText(toolCall.args.date) ? { date: readText(toolCall.args.date) } : {})
      })
    })
  }
}

export function createEditUnitBodyTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'editUnitBody',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '修改一个单位的正文：唯一锚点定点替换（推荐，先 readUnit 拿锚点）或整段覆盖（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY,
        replaceInBody: {
          type: 'object',
          properties: {
            oldText: { type: 'string', description: '正文里要被替换的原文片段（必须在当前正文中唯一出现）。' },
            newText: { type: 'string', description: '替换成的新文字。' }
          },
          required: ['oldText', 'newText'],
          description: '正文定点替换（与 body 整段覆盖二选一）。'
        },
        body: { type: 'string', description: '整段覆盖正文（与 replaceInBody 二选一）。' },
        reason: REASON_PROPERTY
      },
      required: ['domain', 'unit']
    },
    validateArgs: (args) => {
      const base = validateDomainArgs(ctx, args, 'editUnitBody')
      if (base) return base
      if (!readText(args.unit)) return 'editUnitBody 缺少 unit（单位标题或 unitId）'
      const raw = args.replaceInBody as { oldText?: unknown } | undefined
      const hasReplace = Boolean(raw && typeof raw === 'object' && String(raw.oldText ?? ''))
      const hasBody = typeof args.body === 'string'
      if (!hasReplace && !hasBody) return 'editUnitBody 至少要给一个修改项（replaceInBody 或 body）'
      if (hasReplace && hasBody) return 'replaceInBody 与 body 整段覆盖只能二选一'
      return null
    },
    execute: (toolCall) => {
      const raw = toolCall.args.replaceInBody as { oldText?: unknown; newText?: unknown } | undefined
      const replaceInBody = raw && typeof raw === 'object' && String(raw.oldText ?? '')
        ? { oldText: String(raw.oldText ?? ''), newText: String(raw.newText ?? '') }
        : undefined
      return executeUnitCrudWrite({
        ctx,
        action: '修改单位正文',
        args: toolCall.args,
        plan: (adapter, scope) => adapter.planEditBody({
          scope,
          unit: readText(toolCall.args.unit),
          ...(replaceInBody ? { replaceInBody } : {}),
          ...(typeof toolCall.args.body === 'string' && !replaceInBody ? { body: toolCall.args.body } : {})
        })
      })
    }
  }
}

/** 编译页精确修改（写·2026-07-11 批2 页面无关化）：修黄灯补字段、修红灯改关系提示都用它。 */
export function createEditUnitCompilePageTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'editUnitCompilePage',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '精确修改一个单位的编译页：摘要定点替换或字段级覆盖。传 relationHints 前必须先读 readRelationHintSkill，并提交合法的最终整组（写操作，会先弹确认；不要求页面打开）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY,
        replaceInSummary: {
          type: 'object',
          properties: {
            oldText: { type: 'string', description: '摘要里要被替换的原文片段（必须在当前摘要中唯一出现）。' },
            newText: { type: 'string', description: '替换成的新文字。' }
          },
          required: ['oldText', 'newText'],
          description: '摘要定点替换（与 summary 整段覆盖二选一）。'
        },
        summary: { type: 'string', description: '整段覆盖摘要（可选，80~180 字，从对象本身说起）。' },
        tags: { type: 'array', items: { type: 'string' }, description: '整组覆盖标签（可选，3~8 个短名词标签）。' },
        type: { type: 'string', description: '覆盖类型（可选，须是编译页类型枚举值之一，如 concept/character/organization）。' },
        relationHints: { type: 'array', items: { type: 'string' }, description: '整组覆盖关系提示（可选）；传该字段前必须先读 readRelationHintSkill，使用 [[源]]_已登记关系词_[[目标]]、[[目标]] 或单独“无”。' },
        reason: REASON_PROPERTY
      },
      required: ['domain', 'unit']
    },
    validateArgs: (args) => {
      const base = validateDomainArgs(ctx, args, 'editUnitCompilePage')
      if (base) return base
      if (!readText(args.unit)) return 'editUnitCompilePage 缺少 unit（单位标题或 unitId）'
      const edit = readCompilePageEditArgs(args)
      if (!hasCompilePageEditOps(edit)) return 'editUnitCompilePage 至少要给一个修改项（replaceInSummary/summary/tags/type/relationHints）'
      if (edit.replaceInSummary && edit.summary) return 'replaceInSummary 与 summary 整段覆盖只能二选一'
      return null
    },
    execute: (toolCall) => {
      const edit = readCompilePageEditArgs(toolCall.args)
      if (edit.relationHints !== undefined && !ctx.hasReadRelationHintSkill?.()) {
        const message = '这次修改会写入关系提示，必须先调用 readRelationHintSkill 读取现役语法、合法谓词、方向和完整替换规则。'
        return {
          content: message,
          status: 'error',
          error: { type: 'EXPECTATION_MISMATCH', message, retryable: true }
        }
      }
      return executeUnitCrudWrite({
        ctx,
        action: '精确修改编译页',
        args: toolCall.args,
        plan: (adapter, scope) => adapter.planEditCompilePage({
          scope,
          unit: readText(toolCall.args.unit),
          edit
        })
      })
    }
  }
}

export function createRenameUnitTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'renameUnit',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '给一个单位改名字（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY,
        newTitle: { type: 'string', description: '新标题（必填）。' },
        reason: REASON_PROPERTY
      },
      required: ['domain', 'unit', 'newTitle']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'renameUnit')
      || (readText(args.unit) ? null : 'renameUnit 缺少 unit（单位标题或 unitId）')
      || (readText(args.newTitle) ? null : 'renameUnit 缺少 newTitle（新标题）'),
    execute: (toolCall) => executeUnitCrudWrite({
      ctx,
      action: '单位改名',
      args: toolCall.args,
      plan: (adapter, scope) => adapter.planRename({
        scope,
        unit: readText(toolCall.args.unit),
        newTitle: readText(toolCall.args.newTitle)
      })
    })
  }
}

export function createMoveUnitTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'moveUnit',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '把一个单位移动到新的父级下（分组/挪位置；写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY,
        newParent: { type: 'string', description: '新父级：单位标题/unitId/路径（文档库路径不存在会自动逐级建枝；必填）。' },
        reason: REASON_PROPERTY
      },
      required: ['domain', 'unit', 'newParent']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'moveUnit')
      || (readText(args.unit) ? null : 'moveUnit 缺少 unit（单位标题或 unitId）')
      || (readText(args.newParent) ? null : 'moveUnit 缺少 newParent（新父级）'),
    execute: (toolCall) => executeUnitCrudWrite({
      ctx,
      action: '移动单位',
      args: toolCall.args,
      plan: (adapter, scope) => adapter.planMove({
        scope,
        unit: readText(toolCall.args.unit),
        newParent: readText(toolCall.args.newParent)
      })
    })
  }
}

export function createDeleteUnitTool(ctx: XingyiUnitCrudToolContext): ToolDefinition {
  return {
    name: 'deleteUnit',
    // executeUnitCrudWrite 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '删除一个单位（连同全部子孙一并删除，不可恢复；写操作，会弹带严厉警示的确认卡片）。',
    schema: {
      type: 'object',
      properties: {
        domain: buildDomainProperty(ctx),
        characterName: CHARACTER_NAME_PROPERTY,
        unit: UNIT_PROPERTY,
        reason: REASON_PROPERTY
      },
      required: ['domain', 'unit']
    },
    validateArgs: (args) => validateDomainArgs(ctx, args, 'deleteUnit')
      || (readText(args.unit) ? null : 'deleteUnit 缺少 unit（单位标题或 unitId）'),
    execute: (toolCall) => executeUnitCrudWrite({
      ctx,
      action: '删除单位',
      args: toolCall.args,
      plan: (adapter, scope) => adapter.planDelete({
        scope,
        unit: readText(toolCall.args.unit)
      })
    })
  }
}

/** 单位工具九件套（原七件套 + 编译页体检/精修）：harness 在 unitCrud 接缝在场时一把装配。 */
export function createXingyiUnitCrudTools(ctx: XingyiUnitCrudToolContext): ToolDefinition[] {
  return [
    createListUnitTreeTool(ctx),
    createReadUnitTool(ctx),
    createDiagnoseCompilePagesTool(ctx),
    createCreateUnitTool(ctx),
    createEditUnitBodyTool(ctx),
    createEditUnitCompilePageTool(ctx),
    createRenameUnitTool(ctx),
    createMoveUnitTool(ctx),
    createDeleteUnitTool(ctx)
  ]
}
