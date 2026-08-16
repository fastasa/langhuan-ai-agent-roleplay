import type {
  AgentRuntimeErrorType,
  ToolCallMessage,
  ToolFieldLifecycleMap,
  ToolResultMessage
} from './types'
// 人在环上统一契约（2026-07-12 架构审查批C）：halt 模式信封类型，仅 import 类型。
import type { InteractionRequest } from './interactionContract'
import type { AgentSubagentWaitRequest } from './subagentWait'

export interface ToolExecutionContext {
  turnIndex: number
  signal?: AbortSignal
}

export interface ToolExecutionResult<TDetails extends Record<string, unknown> = Record<string, unknown>> {
  content: string
  details?: TDetails
  status?: 'success' | 'error'
  error?: {
    type: AgentRuntimeErrorType
    message: string
    retryable?: boolean
    details?: Record<string, unknown>
  }
  // 字段生命周期标签（R3-1）：本次结果各 details 字段的去留声明（覆盖工具静态 fieldLifecycle）。
  // 缺省时压缩器读工具定义上的 fieldLifecycle，再缺省按 DEFAULT_FIELD_LIFECYCLE（searchable）。
  lifecycle?: ToolFieldLifecycleMap
  // 结果级 acted 修正位（2026-07-07 范式优化批次1）：本次执行是否真的「改了世界」。
  // 缺省=由消费方按静态语义表推导（tidiao：成功的 world 工具即算）；工具可显式覆盖——
  // 如 consultScript 只有 revised=true 才算、retryFailedWorkflow 发起过重试就算（含全失败）。
  acted?: boolean
  // halt 原语（2026-07-12 架构审查批C）：execute 返回时可带此标记，请求「引擎收束、等用户答复」
  // （如提调纠偏 askUser，迁移自旧「holder+halt hook」机制）。adaptToolExecutionResult 原样透传进
  // ToolResultMessage.awaitingUser，仅在非 error 结果生效（见 runtime.ts halt 收束点）。
  awaitingUser?: InteractionRequest
  // 后台子 Agent 候报原语：宿主验证任务仍在运行且有正式回报通道后，请求 runtime 在工具结果
  // 落账处以 awaiting-subagent 收束当前前台 loop。与 awaitingUser 不同，它不等待用户输入，
  // 也不停止后台任务；由子 Agent 终态事件另行唤醒父 Agent。
  awaitingSubagent?: AgentSubagentWaitRequest
  // closingNote 预写收尾话（2026-07-12 用户拍板·派发类工具省收尾轮）：耗时几分钟的派发类工具
  // （星依派绘舆/派采风/派提调纠偏）可在**发起派发那一轮**就预写好收尾话，随结果一起带回。
  // 成功结果携带时，引擎在该工具结果落账（history/messages/保真事件全部照常写完）后直接收束本轮
  // turn，把这段文字作为本轮最终 assistant 回复——等效模型自己收尾说的那句话，走与正常模型回复
  // 完全相同的展示/history/保真事件路径，省掉「工具执行完后必然再调一次模型换一句收尾话」那一整轮。
  // 仅当本轮**只有这一个工具调用**时生效（同轮多个工具调用时忽略，谁跟谁的收尾话说不清）；
  // error 结果携带的 closingNote 一律忽略（安全底线：收尾话永远不能在失败/驳回/需追问时误报成功）。
  // 两种忽略场景 DEV 下都会 console.warn 点名工具，便于发现工具误用。
  closingNote?: string
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: string
  brief: string
  manual?: string
  schema?: Record<string, unknown>
  execute: (toolCall: ToolCallMessage<TArgs>, ctx: ToolExecutionContext) => Promise<ToolExecutionResult> | ToolExecutionResult
  validateArgs?: (args: TArgs) => string | null | undefined
  // 字段生命周期标签静态声明（R3-1）：本工具 details 各字段默认去留（自包含、由工具自己声明）。
  // 单次 execute 可用 ToolExecutionResult.lifecycle 覆盖；压缩器统一读标签执行（逻辑一份）。
  fieldLifecycle?: ToolFieldLifecycleMap
  // 结果钳制阈值（2026-07-12 架构审查批B）：回灌模型 messages 前 content 的最大字符数——数字=自定义阈值，
  // null=不钳制，不声明=吃 runtime 默认阈值（DEFAULT_TOOL_RESULT_CLAMP_CHARS）。只影响回灌模型的 messages，
  // 不影响 history/保真事件（那两条路径拿到的都是钳制前全文，见 runtime.ts toolResultToChatMessage）。
  resultClampChars?: number | null
  // 免执行超时标记（2026-07-12 架构审查批B）：true=该工具 execute 不受 runtime 默认单工具超时限制——
  // 用于内部会 await 用户交互（askUser/confirmWrite/confirmStatusScope 等真阻塞通道）或派发子 agent/
  // 长任务（dispatchResearch/dispatchMapWork/consultScript 等）的工具，它们耗时不可预测，不该被判超时打断。
  longRunning?: boolean
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  constructor(definitions: ToolDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition)
    }
  }

  register(definition: ToolDefinition): void {
    const name = String(definition.name || '').trim()
    if (!name) throw new Error('ToolRegistry.register 需要非空工具名')
    this.tools.set(name, { ...definition, name })
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(String(name || '').trim())
  }

  has(name: string): boolean {
    return this.tools.has(String(name || '').trim())
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((definition) => ({ ...definition }))
  }

  listBriefs(
    activeTools?: string[]
  ): Array<{ name: string; brief: string; schema?: Record<string, unknown> }> {
    const allowed = activeTools ? new Set(activeTools) : null
    return this.list()
      .filter((definition) => !allowed || allowed.has(definition.name))
      .map((definition) => ({
        name: definition.name,
        brief: definition.brief,
        ...(definition.schema ? { schema: definition.schema } : {})
      }))
  }

  /** 统一 toolsearch · 全局单目录：列出已注册工具的 name+brief（**不带 schema**），供延迟模式下发给模型当「可搜目录」
   *  （推荐单标 recommended=true 高亮·其余=越权可搜全局单）。与 listBriefs 区别：listBriefs 是「已激活·带 schema·可原生调」，
   *  listCatalog 是「可见但未激活·只名+述」。recommendedTools 缺省则全部 recommended=false。 */
  listCatalog(
    recommendedTools?: string[]
  ): Array<{ name: string; brief: string; recommended: boolean }> {
    const recommended = recommendedTools ? new Set(recommendedTools) : null
    return this.list()
      .map((definition) => ({
        name: definition.name,
        brief: definition.brief,
        recommended: recommended ? recommended.has(definition.name) : false
      }))
  }
}

/** R1-B B5（toolsearch 匹配·通用纯函数）：把 query 按空白/常见中英文标点拆词，对每个工具的 name+brief 子串匹配，
 *  按命中词数降序返回命中工具名（命中 0 词的剔除）。简单关键词口径（toolsearch 讨论稿）——模型给关键词式 query
 *  即可搜到；拆不出多词（连写）时整串作单词匹配。agent 无关：只认传入 catalog 的 name+brief，不认任何业务语义。 */
export function matchToolsByQuery(
  catalog: Array<{ name: string; brief: string }>,
  query: string
): string[] {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return []
  const terms = normalized.split(/[\s,，、;；:：/]+/).filter(Boolean)
  if (terms.length === 0) return []
  return catalog
    .map((item) => {
      const haystack = `${item.name} ${item.brief}`.toLowerCase()
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
      return { name: item.name, score }
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((scored) => scored.name)
}

/** 字段值字符串化纠形（通用·schema 感知·2026-07-08 订阅桥真机 writeTodo 首发连败）：模型时常把
 *  array/object 类型的字段值整体序列化成 JSON 字符串传来（订阅桥仿真提示词「arguments=JSON 字符串」
 *  的观念渗透；API 直连的弱模型也会犯）。按工具 schema 顶层 properties 声明的类型，对「字符串值且
 *  文本形状像对应类型、能 JSON.parse 成对应类型」的字段就地解开；其余原样保留，交 validateArgs 精准报错。
 *  只处理顶层字段（针对已知失败形态，不做深递归）；string 类型字段绝不碰（正文里含 JSON 文本是合法内容）。 */
export function coerceArgsBySchema(
  args: Record<string, unknown>,
  schema?: Record<string, unknown>
): Record<string, unknown> {
  const properties = schema?.properties
  if (!args || !properties || typeof properties !== 'object' || Array.isArray(properties)) return args
  let changed = false
  const out: Record<string, unknown> = { ...args }
  for (const [key, propSchema] of Object.entries(properties as Record<string, unknown>)) {
    const expected = String((propSchema as { type?: unknown })?.type ?? '')
    if (expected !== 'array' && expected !== 'object') continue
    const value = out[key]
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (expected === 'array' ? !text.startsWith('[') : !text.startsWith('{')) continue
    try {
      const parsed = JSON.parse(text)
      const matches = expected === 'array'
        ? Array.isArray(parsed)
        : Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed)
      if (matches) {
        out[key] = parsed
        changed = true
      }
    } catch {
      /* 解不动保留原值，validateArgs 会给精准报错 */
    }
  }
  return changed ? out : args
}

/** 工具是否带了合法的原生参数 schema（对象且非数组）。无 schema 的工具会被下发成「无参数」函数，
 *  模型只能给空参数 → 各工具 validateArgs 必失败 → 永远进不了 execute（generatePlanBatch 缺 schema 即此类根因）。 */
function hasValidToolSchema(brief: { schema?: Record<string, unknown> }): boolean {
  return Boolean(brief.schema && typeof brief.schema === 'object' && !Array.isArray(brief.schema))
}

/** 递归规范化 JSON Schema 的对象键顺序。数组顺序保留（如 required/enum 有声明顺序语义），
 * 只消除对象构造顺序差异，避免语义相同的 schema 生成不同请求前缀。 */
export function canonicalizeToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeToolSchema(item))
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, canonicalizeToolSchema(record[key])])
  )
}

/**
 * toolBriefs → OpenAI 原生 tools schema。提调各 loop 的 callModel 在调 callAIWithTools 前用它把
 * runtime 列出的工具（name/brief/schema）转成请求体 tools 数组。
 * 兜底校验（根因防回归）：任何被下发的工具都必须带原生参数 schema；缺 schema 时仍给最小 object schema 兜底
 * 以免请求报错，但在 DEV 下高声告警点名该工具——避免「迁移漏补 schema → 静默下发空参数 → 工具永不执行」再次发生。
 * 空工具名直接剔除（不可能注册成空名，见 ToolRegistry.register；这里只是防御）。
 */
export function toOpenAiTools(
  briefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  const named = briefs.filter((brief) => String(brief?.name || '').trim())
  const missing = named.filter((brief) => !hasValidToolSchema(brief)).map((brief) => brief.name)
  if (missing.length && typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)) {
    // eslint-disable-next-line no-console
    console.error(`[toOpenAiTools] 以下工具缺少原生参数 schema，已兜底成空参数（模型将无法正确传参）：${missing.join('、')}`)
  }
  return named.map((brief) => ({
    type: 'function' as const,
    function: {
      name: brief.name,
      description: String(brief.brief || ''),
      parameters: hasValidToolSchema(brief)
        ? (canonicalizeToolSchema(brief.schema) as Record<string, unknown>)
        : { type: 'object', properties: {} }
    }
  }))
}

/** 工具结果回灌 messages 的默认钳制阈值（2026-07-12 架构审查批B）：单个工具结果整段灌回模型 context
 *  不加限制会撑爆预算、挤走其它信息（真机已见超长检索/体检结果整段回灌）。工具可用 resultClampChars 覆盖。 */
export const DEFAULT_TOOL_RESULT_CLAMP_CHARS = 12000

/** 按工具定义解析本次结果的实际钳制阈值：数字=自定义、null=不钳制、未声明=默认阈值。
 *  找不到工具定义（如 TOOL_NOT_FOUND/BUDGET_EXCEEDED 等 runtime 合成结果）时按默认阈值——这类结果本身很短，钳不到。 */
export function resolveResultClampChars(definition: ToolDefinition | undefined): number | null {
  const value = definition?.resultClampChars
  if (value === null) return null
  if (typeof value === 'number' && value > 0) return value
  return DEFAULT_TOOL_RESULT_CLAMP_CHARS
}

/** 工具结果正文钳制（只影响回灌模型的 messages，不影响 history/保真事件全文——调用方必须在钳制前完成
 *  那两条路径的写入，见 runtime.ts toolResultToChatMessage 的调用顺序）。超过阈值截断保留头部，
 *  追加中文提示告知已截断+原文长度+改法建议；clampChars=null 或未超限时原样返回。 */
export function clampToolResultContent(content: string, clampChars: number | null): string {
  if (clampChars == null || content.length <= clampChars) return content
  const truncated = content.slice(0, clampChars)
  return `${truncated}\n\n⚠️ 结果过长已在此截断（原文 ${content.length} 字）。请改用更窄的参数重新查询；若当前会话支持 searchDirectorMemory，可用它检索完整原文。`
}

export function makeToolErrorResult(
  toolCall: ToolCallMessage,
  type: AgentRuntimeErrorType,
  message: string,
  options: {
    status?: 'error' | 'blocked'
    retryable?: boolean
    details?: Record<string, unknown>
  } = {}
): ToolResultMessage {
  return {
    kind: 'toolResult',
    callId: toolCall.callId,
    toolName: toolCall.toolName,
    stage: toolCall.stage,
    status: options.status ?? 'error',
    content: message,
    details: options.details ?? {},
    error: {
      type,
      message,
      retryable: options.retryable ?? false,
      ...(options.details ? { details: options.details } : {})
    }
  }
}

/** 是否 DEV 环境（各处防回归告警共用同一判据，与 toOpenAiTools 的内联判据同口径；runtime.ts closing-note
 *  多工具调用轮忽略告警也复用本函数，不重复写 import.meta 判据）。 */
export function isDevEnv(): boolean {
  return typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
}

export function adaptToolExecutionResult(
  toolCall: ToolCallMessage,
  result: ToolExecutionResult
): ToolResultMessage {
  // acted 结果级修正位透传（批次1）：error 结果也可显式带 acted（如 retryFailedWorkflow 全失败仍算尝试过）。
  const actedField = typeof result.acted === 'boolean' ? { acted: result.acted } : {}
  if (result.error || result.status === 'error') {
    // closingNote 安全底线（2026-07-12）：error 结果一律不透传 closingNote——收尾话绝不能在失败时误报成功。
    if (result.closingNote && isDevEnv()) {
      // eslint-disable-next-line no-console
      console.warn(`[adaptToolExecutionResult] 工具「${toolCall.toolName}」在 error 结果里携带了 closingNote，已忽略（仅成功结果生效）。`)
    }
    const type = result.error?.type ?? 'TOOL_RUNTIME_ERROR'
    const message = result.error?.message || result.content || '工具执行失败'
    return {
      ...makeToolErrorResult(toolCall, type, message, {
        retryable: result.error?.retryable ?? false,
        details: result.error?.details ?? result.details ?? {}
      }),
      ...actedField
    }
  }
  // halt 原语透传（批C）：error 分支已提前 return，走到这里的都是非 error 结果——符合「仅非 error 结果生效」的约束。
  const awaitingUserField = result.awaitingUser ? { awaitingUser: result.awaitingUser } : {}
  const awaitingSubagentField = result.awaitingSubagent
    ? { awaitingSubagent: result.awaitingSubagent }
    : {}
  // closingNote 透传（2026-07-12）：只做「非 error 结果」这一层过滤，「本轮是否只有一个工具调用」
  // 由 runtime.ts 在 turn 收尾处判定（adaptToolExecutionResult 是单次调用级转换，看不到同轮其它调用）。
  const closingNoteField = typeof result.closingNote === 'string' && result.closingNote.trim()
    ? { closingNote: result.closingNote.trim() }
    : {}
  return {
    kind: 'toolResult',
    callId: toolCall.callId,
    toolName: toolCall.toolName,
    stage: toolCall.stage,
    status: 'success',
    content: result.content,
    details: result.details ?? {},
    ...actedField,
    ...awaitingUserField,
    ...awaitingSubagentField,
    ...closingNoteField
  }
}
