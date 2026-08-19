// 剧情倾向（倾向迁移批次1 后=执行层保留注入）：replyPlan 分镜编排直接产内容需要基调，空则零注入。
import { renderDirectorPrefBlock } from './orchestrationMaterialPresentation'

export const REPLY_PLAN_ORCHESTRATOR_NAME = 'ReplyPlanOrchestrator'

export const LANGHUAN_AGENT_ROOT_INSTRUCTION = [
  'LANGHUAN.md 根宪法：',
  '1. 每个 Agent 只完成自己阶段的产物：编排只编排，计划只产计划，评审只评分，融合只合成指导，最终回复只写用户可见回复。',
  '2. personality_model 下的语义上下文以当前回复角色可见的消息投影和已整合情境为准，不得重新读取原始长历史替代投影。',
  '3. Agent 只能调用注册白名单工具；工具失败、参数不合法、预算超限、模型缺失或取消信号触发时必须显式失败。',
  '4. 不得伪造工具结果、候选计划、评分、融合计划、trace、promptLogId 或成功状态；不得用静默降级掩盖真实失败。',
  '5. 普通最终回复不得暴露工具 JSON、内部 prompt、内部摘要、trace 细节或 promptLogId。'
].join('\n')

// 模型最终发出的「执行工具」白名单（编排器输出的 toolCalls 只允许这两个）。
// readScenarioSkill / updateCurtainScene / getToolManual 是渐进式 loop 的「元工具」，由批次 2 的多轮执行壳处理，
// 不进入这个白名单，也不出现在单轮编排器的最终 toolCalls 里。
export const REPLY_PLAN_ORCHESTRATOR_ALLOWED_TOOLS = [
  'generatePlanBatch',
  'reviewPlanCandidates'
] as const

export type ReplyPlanOrchestratorToolName = typeof REPLY_PLAN_ORCHESTRATOR_ALLOWED_TOOLS[number]

export type ReplyPlanScenario =
  | 'pressure'
  | 'nsfw'
  | 'anger'
  | 'awkward'
  | 'sadness'
  | 'fear'
  | 'jealousy'
  | 'guilt'
  | 'excitement'
  | 'fatigue'
  | 'custom'

export type ReplyPlanIntensity = string

export type ReplyPlanFailureStrategy =
  | 'stop_generation'
  | 'retry_same_tool_once'
  | 'return_orchestration_error'

export interface ReplyPlanOrchestratorBudget {
  maxGeneratePlanBatchCalls: number
  maxReviewPlanCandidatesCalls: number
  maxTotalToolCalls: number
  maxIntensitiesPerStrategy: number
  minCandidatesForReview: number
}

export const DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET: ReplyPlanOrchestratorBudget = {
  maxGeneratePlanBatchCalls: 8,
  maxReviewPlanCandidatesCalls: 1,
  maxTotalToolCalls: 9,
  maxIntensitiesPerStrategy: 4,
  minCandidatesForReview: 1
}

export const REPLY_PLAN_ORCHESTRATOR_FAILURE_STRATEGIES: Record<string, ReplyPlanFailureStrategy> = {
  invalidTool: 'stop_generation',
  invalidArgs: 'stop_generation',
  budgetExceeded: 'stop_generation',
  toolRuntimeFailure: 'return_orchestration_error',
  transientModelFailure: 'retry_same_tool_once'
}

/** 反应类别规格：现已不再由模型预声明，仅作为「从 toolCalls 派生、供审计展示」的结构。 */
export interface ReplyPlanStrategySpec {
  strategy: string
  strategyLabel: string
  intensities: ReplyPlanIntensity[]
  planPrompt: string
}

export interface ReplyPlanScenarioMountedPrompt {
  id: string
  title: string
  content: string
  /** 描述（短，给提调看）：提调读取该情境后先看描述判断要不要用，必要时再读 content 原文。 */
  description?: string
  enabled: boolean
  orderIndex: number
  createdAt?: string
  updatedAt?: string
}

/** 情境 skill（全局可编辑配置的一项）：触发描述（短，路由用）+ 正文（自然语言，按需读）。 */
export interface ReplyPlanScenarioConfig {
  code: string      // 情境机器名（小写），如 pressure / excitement / calm
  label: string     // 情境中文名，如 压力
  trigger: string   // 触发描述（短）：注入编排器「可用情境清单」帮助 LLM 路由判别
  body: string      // skill 正文（自然语言）：反应类别/强度/生成要求，按需读取
  mountedPrompts?: ReplyPlanScenarioMountedPrompt[] // 命中该情境后注入最终角色消息提示词的挂载提示词
}

/** 渐进式工具注册表项：brief 注入清单，manual 按需经 getToolManual 拉（批次 2 启用）。 */
export interface ReplyPlanOrchestratorToolDef {
  name: string
  kind: 'plan' | 'meta'  // plan=模型最终发出的执行工具；meta=渐进式 loop 元工具（批次 2 启用）
  brief: string          // 简介：能做什么、何时用（注入工具清单）
  manual: string         // 精确使用格式 + 示例（按需经 getToolManual 取回）
}

/** 全局编排配置（本地工作区可改，单套，注入编排器 system 提示词） */
export interface ReplyPlanOrchestratorConfig {
  systemPrompt: string                        // 编排器总规则正文（覆盖默认硬编码规则）
  scenarios: ReplyPlanScenarioConfig[]        // 可用情境 skill 列表
  tools: ReplyPlanOrchestratorToolDef[]       // 渐进式工具注册表
}

/** 一次 generatePlanBatch 调用里的单个反应类别组（2026-07-08 合并生成协议：一次调用用 batches 数组带全部类别）。 */
export interface GeneratePlanBatchGroup {
  strategy: string
  strategyLabel: string
  intensities: ReplyPlanIntensity[]
  planPrompt: string
}

/** 内部真值仍按「每类别一条记录」留存（审计/strategyMatrix/分镜方向零改动）；
 *  模型侧协议是一次调用带 batches 数组，工具执行层把它拆回 N 条本记录。 */
export interface GeneratePlanBatchToolCall extends GeneratePlanBatchGroup {
  tool: 'generatePlanBatch'
  /** 传输层字段（合并生成协议）：loop 解析/重序列化时透传模型给的全部类别组；
   *  内部真值记录（state.planToolCalls）永远是拆开后的单类别记录，不写本字段。 */
  batches?: GeneratePlanBatchGroup[]
  expectation?: string
  promptLogId?: string
}

export interface ReviewPlanCandidatesToolCall {
  tool: 'reviewPlanCandidates'
  candidateIds: string[]
  expectation?: string
  promptLogId?: string
  /** 系统自动触发评审（2026-06-12 提速）：候选与表达占比齐备后由 harness 直接调用本地 ReRanker，
   *  不再让编排模型多跑一轮确认；审计侧栏据此区分自动/模型触发。 */
  autoTriggered?: boolean
}

export type ReplyPlanOrchestratorToolCall =
  | GeneratePlanBatchToolCall
  | ReviewPlanCandidatesToolCall

export interface ReplyPlanCandidate {
  id: string
  strategy: string
  strategyLabel?: string
  intensity: ReplyPlanIntensity
  content: string
  score?: number
}

/** 提调一次主动取料决策（批次3 D4：取料三件套被调用即记一条，供编排带「取料」里程碑展示 + 审计）。
 *  query 对语义召回/文本搜索为检索词，对定点读取为命中单位标题或 unitId；reason 为提调「为何取」。 */
export interface ReplyPlanRetrievalDecision {
  /** 工具机器名：recallSemantic | searchWorldText | fetchUnitDetail | readChatMessage（批次 M2）。 */
  tool: string
  /** 检索词（语义/文本）或命中单位标题/unitId（定点读取）。 */
  query: string
  /** 提调显式产出的「为何取这条特殊料」。 */
  reason?: string
  /** 命中条数（语义/文本召回的审计指标，定点读取省略）。 */
  hitCount?: number
}

export interface ReplyPlanOrchestration {
  scenario: ReplyPlanScenario | string
  /** 派生字段：由 generatePlanBatch 工具调用反推，供审计面板展示，非模型预声明。 */
  strategyMatrix: ReplyPlanStrategySpec[]
  toolCalls: ReplyPlanOrchestratorToolCall[]
  candidates?: ReplyPlanCandidate[]
  /** 表达占比唯一真值：编排器生成轮顶层产出（批次2 前移、批次4 去融合后直接驱动最终回复）。 */
  expressionMix?: ReplyPlanExpressionMix
  /** 建议字数区间：编排器生成轮顶层产出（与 expressionMix 并排），缺省由最终回复按默认区间兜底。 */
  wordCountAdvice?: ReplyPlanWordCountAdvice
  orchestrationSummary: string
  failureStrategy?: ReplyPlanFailureStrategy
  /** 提调本轮主动取料决策序列（批次3 D4）；未取料时省略。 */
  retrieval?: ReplyPlanRetrievalDecision[]
}

export interface ReplyPlanOrchestratorPromptInput {
  characterName?: string
  compressedContext: string
  currentUserInput?: string
  sceneChangeNotice?: string
  previousProjection?: string
  /** 会话剧情倾向（真值=服务端正式编排资料）：非空时 system 追加倾向块。 */
  directorPref?: string
}

export interface ReplyPlanOrchestratorPromptTrace {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

export interface ReviewPlanCandidatesInput {
  compressedContext: string
  candidates: ReplyPlanCandidate[]
}

export interface PersonalityRerankerPairInput {
  situation: string
  plan: string
  candidateId: string
}

export interface ReplyPlanExpressionMix {
  action: number
  dialogue: number
  expression: number
  innerState: number
  narration: number
}

/**
 * 宽松解析表达占比（编排器生成轮顶层 expressionMix 用）：
 * 五项必须都是 0-100 整数且合计等于 100，否则返回 null（由调用方决定是否显式失败）。
 * 五项整数合计 100 才视为合法，否则返回 null（由调用方决定是否显式失败），便于从 transcript 捕获。
 */
export function parseReplyPlanExpressionMix(raw: unknown): ReplyPlanExpressionMix | null {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  if (!record) return null
  const readInt = (value: unknown): number | null => {
    const num = Number(value)
    return Number.isInteger(num) && num >= 0 && num <= 100 ? num : null
  }
  const action = readInt(record.action)
  const dialogue = readInt(record.dialogue)
  const expression = readInt(record.expression)
  const innerState = readInt(record.innerState ?? record.inner_state)
  const narration = readInt(record.narration)
  if (action === null || dialogue === null || expression === null || innerState === null || narration === null) {
    return null
  }
  if (action + dialogue + expression + innerState + narration !== 100) return null
  return { action, dialogue, expression, innerState, narration }
}

/** 角色回复建议字数区间（编排器生成轮顶层产出，与 expressionMix 并排，用户 2026-06-20）：
 *  默认 1000 字左右，提调可据情境自由调整；但任何情况下都不得低于硬下限 500 字。
 *  最终回复据此控制篇幅（软建议，非硬截断）。 */
export interface ReplyPlanWordCountAdvice {
  min: number
  max: number
}

/** 建议字数硬下限（用户 2026-06-20）：提调给的建议字数一律不得低于此值，低于则在解析时抬到该值。 */
export const MIN_REPLY_PLAN_WORD_COUNT = 500

/** 建议字数缺省区间：提调未给或解析失败时，最终回复按此默认篇幅兜底（默认 1000 字左右）。 */
export const DEFAULT_REPLY_PLAN_WORD_COUNT_ADVICE: ReplyPlanWordCountAdvice = { min: 800, max: 1200 }

/**
 * 宽松解析建议字数区间（编排器生成轮顶层 wordCountAdvice 用）：
 * 支持 {min,max}（含 snake_case / minWords 变体）与单值（模型只给一个目标字数时按同值上下限）。
 * min/max 为 [1,2000] 内正整数且 min<=max 才合法，否则返回 null（由调用方决定是否用默认兜底）。
 * 合法后强制抬到硬下限 MIN_REPLY_PLAN_WORD_COUNT（禁止少于 500 字）。
 */
export function parseReplyPlanWordCountAdvice(raw: unknown): ReplyPlanWordCountAdvice | null {
  const readInt = (value: unknown): number | null => {
    const num = Number(value)
    return Number.isInteger(num) && num >= 1 && num <= 2000 ? num : null
  }
  // 硬下限：低于 500 一律抬到 500（禁止少于 500 字）。
  const floor = (value: number): number => Math.max(MIN_REPLY_PLAN_WORD_COUNT, value)
  // 单值：模型只给一个目标字数时按该值同时作为上下限。
  if (typeof raw === 'number' || typeof raw === 'string') {
    const single = readInt(raw)
    return single === null ? null : { min: floor(single), max: floor(single) }
  }
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  if (!record) return null
  const min = readInt(record.min ?? record.minWords ?? record.min_words)
  const max = readInt(record.max ?? record.maxWords ?? record.max_words)
  if (min === null || max === null || min > max) return null
  return { min: floor(min), max: floor(max) }
}

export interface ReplyPlanOrchestrationValidationIssue {
  code:
    | 'empty_scenario'
    | 'no_plan_tool_calls'
    | 'empty_strategy'
    | 'empty_intensities'
    | 'empty_plan_prompt'
    | 'unknown_tool'
    | 'too_many_tool_calls'
    | 'too_many_generate_calls'
    | 'too_many_review_calls'
    | 'too_many_intensities'
    | 'review_without_candidates'
    | 'candidate_missing_content'
  message: string
  blocking: boolean
}

export interface ValidateReplyPlanOrchestrationOptions {
  budget?: ReplyPlanOrchestratorBudget
}

function readRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null
}

export function normalizeReplyPlanScenarioCode(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function readScenarioCodeFromToolResult(result: unknown): string {
  const record = readRecord(result)
  if (!record) return ''
  const toolName = String(record.toolName ?? record.tool_name ?? record.tool ?? '').trim()
  if (toolName !== 'readScenarioSkill') return ''
  const status = String(record.status ?? '').trim().toLowerCase()
  if (status === 'error' || status === 'failed' || status === 'failure') return ''
  const details = readRecord(record.details)
  return normalizeReplyPlanScenarioCode(
    details?.scenarioCode
      ?? details?.scenario_code
      ?? record.scenarioCode
      ?? record.scenario_code
  )
}

function readScenarioCodeFromToolCall(call: unknown): string {
  const record = readRecord(call)
  if (!record) return ''
  const toolName = String(record.toolName ?? record.tool_name ?? record.tool ?? '').trim()
  if (toolName !== 'readScenarioSkill') return ''
  const args = readRecord(record.args)
  return normalizeReplyPlanScenarioCode(args?.code ?? record.code ?? record.scenario)
}

function readScenarioCodeFromTurn(turn: unknown): string {
  const record = readRecord(turn)
  if (!record) return ''
  const toolResults = Array.isArray(record.toolResults) ? record.toolResults : []
  for (const result of toolResults) {
    const code = readScenarioCodeFromToolResult(result)
    if (code) return code
  }
  const toolCalls = Array.isArray(record.toolCalls) ? record.toolCalls : []
  for (const call of toolCalls) {
    const code = readScenarioCodeFromToolCall(call)
    if (code) return code
  }
  const modelMessage = readRecord(record.modelMessage)
  const parsed = readRecord(modelMessage?.parsed)
  return normalizeReplyPlanScenarioCode(record.scenario ?? parsed?.scenario)
}

function readScenarioCodeFromTurns(turns: unknown): string {
  if (!Array.isArray(turns)) return ''
  for (const turn of turns) {
    const code = readScenarioCodeFromTurn(turn)
    if (code) return code
  }
  return ''
}

export function resolveReplyPlanOrchestrationScenarioCode(orchestration: unknown): string {
  const record = readRecord(orchestration)
  if (!record) return ''
  const transcript = readRecord(record.transcript)
  return readScenarioCodeFromTurns(transcript?.turns)
    || readScenarioCodeFromTurns(record.turns)
    || normalizeReplyPlanScenarioCode(record.scenario)
}

/** 默认压力情境正文（自然语言，给编排 LLM 读，自拟工具调用；不写完整台词）。 */
export function createPressureScenarioBody(): string {
  return [
    '压力情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
    '- 进攻性（aggressive）：把压力转为对外的压制、反击或施压；低档是语气变硬、姿态前压，高档是直接对抗。',
    '- 防御性（defensive）：转向自我保护、设边界、克制收敛；强调守住底线而非进攻。',
    '- 僵住（freeze）：以停顿、迟疑、神态凝固和身体僵硬呈现，强调"卡住"的瞬间。',
    '- 逃避（avoid）：绕开冲突、转移话题或离场倾向，强调回避而非正面应对。',
    'planPrompt 只写给计划模型的第三视角行动计划任务说明，不写完整台词、引号对白或可直接发送的回复。'
  ].join('\n')
}

const DEFAULT_SCENARIO_PLAN_PROMPT_RULE =
  'planPrompt 只写给计划模型的第三视角行动计划任务说明，不写完整台词，引导对白或可直接发送的回复。'

function createDefaultScenarioBody(lines: string[]): string {
  return [...lines, DEFAULT_SCENARIO_PLAN_PROMPT_RULE].join('\n')
}

/** 默认渐进式工具注册表 seed：plan 工具注入清单，meta 工具供 runtime 读取上下文与手册。 */
export const DEFAULT_REPLY_PLAN_ORCHESTRATOR_TOOLS: ReplyPlanOrchestratorToolDef[] = [
  {
    name: 'generatePlanBatch',
    kind: 'plan',
    brief: '一次性生成全部候选计划：batches 数组每项一个反应类别（strategy/强度档/planPrompt），每档产出一条第三视角行动计划；一个生成轮只调用一次。',
    manual: [
      '调用格式：{"tool":"generatePlanBatch","batches":[{"strategy":"<机器名>","strategyLabel":"<中文名>","intensities":["low","medium","high"],"planPrompt":"<给计划模型的任务说明>"}]}',
      '- 一个生成轮只调用本工具一次：batches 数组一次性列出全部反应类别，每项一个类别，不要逐类拆成多次调用。',
      '- batches[].strategy/strategyLabel：该类别的机器名与中文名；同一次调用内 strategy 必须唯一。',
      '- batches[].intensities：该类别要生成的强度档位，每档对应一条候选计划。',
      '- batches[].planPrompt：第三视角行动计划任务说明，不写完整台词；必须体现本类别独有的反应焦点，不能和其它类别使用同一句提示词。',
      '示例：{"tool":"generatePlanBatch","batches":[{"strategy":"aggressive","strategyLabel":"进攻性","intensities":["low","medium","high"],"planPrompt":"压力下生成进攻性反应计划，分别体现低中高三档。"},{"strategy":"defensive","strategyLabel":"防御性","intensities":["low","medium","high"],"planPrompt":"压力下生成防御性反应计划，强调守住底线。"}]}'
    ].join('\n')
  },
  {
    name: 'reviewPlanCandidates',
    kind: 'plan',
    brief: '对已生成的全部候选计划做人格 ReRanker 评审排序；候选生成完毕后必须调用一次。',
    manual: [
      '调用格式：{"tool":"reviewPlanCandidates","candidateIds":["*"]}',
      '- candidateIds：要评审的候选计划 id 列表；用 ["*"] 表示评审目前已生成的全部候选。',
      '示例：{"tool":"reviewPlanCandidates","candidateIds":["*"]}'
    ].join('\n')
  },
  {
    name: 'readScenarioSkill',
    kind: 'meta',
    brief: '按情境 code 读取该情境 skill 的完整正文（反应类别/强度/生成要求）。判定情境后调用。',
    manual: [
      '调用格式：{"tool":"readScenarioSkill","code":"<情境机器名>"}',
      '- code：可用情境清单里的情境机器名。返回该情境 skill 的 body 正文，供你据此规划工具调用。',
      '示例：{"tool":"readScenarioSkill","code":"pressure"}'
    ].join('\n')
  },
  {
    name: 'updateCurtainScene',
    kind: 'meta',
    brief: '当当前用户输入明确表达快进时间或改变地点意图时，提交目标时间/地点，由外层静默修改当前会话帷幕；确认地点确实改变且目标是正经地点名称时才提交地点。',
    manual: [
      '调用格式：{"tool":"updateCurtainScene","targetTime":"<目标时间，可省略>","targetLocation":"<目标地点，可省略>","reason":"<为什么认为用户要求修改帷幕>"}',
      '- 只在当前用户输入明确表达“过了多久 / 快进到某时 / 去某地 / 换到某场景”等意图时调用；只是上下文里已经出现时间地点变化提醒，不代表要调用本工具。',
      '- targetTime：用户要求快进或跳转后的目标时间。能写具体日期时间就写具体日期时间；只能从用户原话得到自然语言时间时，保留原话式目标，例如“三天后清晨”。',
      '- targetLocation：用户要求切换到的目标地点。提交前必须同时满足三条：1) 地点确实发生了改变——人物变换姿势、靠近、躲藏、把东西藏进衣物或在原地点内小范围挪动都不算地点改变；2) 必须写成正经地点名称并按大/中/小三段递进（大=洲或国家、架空用大陆/王国同级；中=城市；小=村/镇/街道或具体场所，可无正式名如“无名小摊”“废屋”；小在中内、中在大内，用“ / ”分隔，如“临州王国 / 旧城 / 铜叶子旅店门口”），身体部位、衣物、物品、状态、动作、气氛或光影描写都不是地点，也不得直接截取原文句子片段当地点；3) 不得使用“未知 / 未命中 / 未明确 / 未设置”这类占位词。若能拆成三段地点，也可使用 locationLarge/locationMiddle/locationSmall。',
      '- 拿不准地点是否真的改变时，宁可不提交 targetLocation；严禁用占位词或描写性文本覆盖、清空已有地点。',
      '- reason：用一句话说明触发依据，必须来自当前用户输入或投影上下文，不得凭常识补造。',
      '示例：{"tool":"updateCurtainScene","targetTime":"三天后清晨","targetLocation":"临州王国 / 旧城 / 铜叶子旅店门口","reason":"用户明确说快进三天后在旅店门口见面。"}'
    ].join('\n')
  },
  {
    name: 'getToolManual',
    kind: 'meta',
    brief: '按工具名取回该工具的精确使用格式与示例；需要某工具确切参数时调用。',
    manual: [
      '调用格式：{"tool":"getToolManual","name":"<工具名>"}',
      '- name：要查手册的工具名。返回该工具的 manual（精确格式 + 示例）。',
      '示例：{"tool":"getToolManual","name":"generatePlanBatch"}'
    ].join('\n')
  },
  {
    name: 'recallSemantic',
    kind: 'meta',
    brief: '语义召回（只读）：找「意思相近」但说不准关键词的特殊料（embedding 检索）。常规角色资料由框架自动供给，不用本工具。',
    manual: [
      '调用格式：{"tool":"recallSemantic","query":"<要找的意思>","topK":6,"reason":"<为什么需要这条特殊料>"}',
      '- query：要召回的语义查询；命中靠相似度，不要求字面匹配。',
      '- topK：取回条数（可省略，默认小值，渐进式暴露）。',
      '- 结果是若干带 unitId 的命中条目；需要其正文细节时再用 fetchUnitDetail。',
      '示例：{"tool":"recallSemantic","query":"山庄大厅的陈设氛围","topK":6,"reason":"进新场景要补环境背景","expectation":"拿到大厅相关设定用于环境描写"}'
    ].join('\n')
  },
  {
    name: 'searchWorldText',
    kind: 'meta',
    brief: '文本搜索（只读）：按字面/关键词精确命中含某专名的世界素材（类比 Grep）。专名易被语义召回漏，遇看不懂的专名先用它查。',
    manual: [
      '调用格式：{"tool":"searchWorldText","query":"<专名或关键词>","reason":"<为什么要查它>"}',
      '- query：要精确命中的字面/关键词；regex:true 时按正则解释（非法正则自动回退字面）。',
      '- limit：取回条数（可省略）。',
      '- 典型链路：命中拿到 unitId → 用 fetchUnitDetail 取正文。',
      '示例：{"tool":"searchWorldText","query":"鹿角厅","reason":"用户输入提到不认识的专名","expectation":"命中含该专名的设定条目"}'
    ].join('\n')
  },
  {
    name: 'fetchUnitDetail',
    kind: 'meta',
    brief: '定点读取（只读）：已知 unitId 时取其摘要或正文（类比 Read）。先取摘要、确有必要再取正文，避免一次性灌全文。',
    manual: [
      '调用格式：{"tool":"fetchUnitDetail","unitId":"<单位 id>","level":"summary","reason":"<为什么要看它>"}',
      '- unitId：来自 recallSemantic / searchWorldText 命中条目的 unitId。',
      '- level：summary（摘要，默认）或 body（正文）。',
      '示例：{"tool":"fetchUnitDetail","unitId":"doc:hall-setting","level":"body","reason":"要据大厅正文写环境旁白","expectation":"拿到大厅陈设正文"}'
    ].join('\n')
  }
]

/** 编排器总规则默认正文（可被全局配置覆盖）。情境枚举由 scenarios 渲染，不在此硬写。
 * AgentRuntime 协议：每轮只输出一份 JSON，工具结果以结构化 toolResult 消息进入 history。 */
export const DEFAULT_REPLY_PLAN_ORCHESTRATOR_SYSTEM_PROMPT = [
  '你是琅嬛的 ReplyPlanOrchestrator（回复计划编排器）。',
  '你在一个结构化 Agent Runtime 中工作：每一轮只输出一份 JSON，runtime 会执行你本轮请求的工具，并把结果作为结构化 toolResult 消息写入下一轮 history。',
  '你的任务不是写最终回复，也不是直接写候选计划正文；你只判断本轮情境，并通过受控工具调用决定要生成哪些反应类别和强度。',
  '工作流程：',
  '1. 先在下方「可用情境」里判断本轮最匹配的情境，并同时做两类环境判断：A. 本轮时间、地点是否相对上一条可见消息发生变化；B. 当前用户输入是否明确表达了快进时间、跳过时间、前往某地、切换场景或改变地点的意图。调用 readScenarioSkill 读取该情境正文（清单只给触发描述，正文需按需读取）。判断情境只依据回复角色可见投影、场景变化提醒与当前用户输入，不要等待或要求其它上下文。',
  '1.0.1. 情境权重规则：如果场景变化提醒显示本轮时间或地点已经明显跳转，旧投影里的强情绪、强冲突、特殊尺度或上一轮情境只能作为历史背景，不能继续主导本轮情境路由；此时必须优先依据「当前用户输入」和跳转后的当前场景判定情境。若当前用户输入只是普通问候、确认、轻量接话或新场景里的日常互动，不能因为上一条可见消息属于强压力、亲密、危险或其它特殊情境，就沿用旧情境 code。',
  '1.1. 若 B 命中，必须在读情境轮同时调用 updateCurtainScene，提交用户意图对应的 targetTime / targetLocation / reason，由外层静默修改会话帷幕；若当前输入只是提到环境、回忆地点、假设地点，或只有投影比较得出的变化提醒但用户没有表达“要改变帷幕”的意图，不得调用 updateCurtainScene。提交 targetLocation 前必须确认地点确实改变（人物姿势变化、躲藏、把东西藏进衣物或原地点内小范围挪动都不算），且目标必须是正经地点名称、按大/中/小三段递进（大=洲/国、中=城市、小=村/镇/街道或具体场所），身体部位、衣物、物品、状态、气氛或光影描写不是地点；严禁用“未知/未命中/未明确”等占位词覆盖已有地点，拿不准就不提交地点。',
  '2. 读到正文且可选帷幕修改完成后，在同一轮里只发起一次 generatePlanBatch 原生函数调用，用 batches 数组一次性带上正文描述的全部反应类别（每项含 strategy/strategyLabel/intensities/planPrompt；工具走原生函数调用，不要写进 content JSON 的 toolCalls 字段，也不要逐类拆成多次调用或分多轮发，更不要在这一轮调用 reviewPlanCandidates）；强度取各类别正文声明的档位，strategy/strategyLabel/intensities/planPrompt 由你据正文自拟；batches 内 strategy 必须唯一，planPrompt 必须体现该类别独有的反应焦点，不能复制同一类别或同一句 planPrompt 来凑数；如果正文只支持一个反应类别，batches 就只有一项并用 intensities 覆盖多个强度；需要某工具的精确参数格式时，先调用 getToolManual。',
  '3. 在发起 generatePlanBatch 的同一轮 content JSON 顶层，必须给出 expressionMix（本次回复的表达占比）：包含 action/dialogue/expression/innerState/narration 五项整数，合计必须等于 100；依据情境正文里的表达结构指导分配，没有明确指导时可自行分配但要合理。占比只在这一轮产出一套，后续不再修改。',
  '3.1. 在同一份生成轮 content JSON 顶层，另给出 wordCountAdvice（本次角色回复的建议字数区间）：{"min":<正整数>,"max":<正整数>}，默认 1000 字左右（如 800–1200），可据情境实际自由调整（需要铺陈环境或情绪的场景可调高），min 不大于 max；但无论何种情境都不得低于 500 字（低于会被强制抬到 500）。它只是篇幅建议、不是硬截断；只产出一套，后续不再修改。',
  '4. 上一轮 generatePlanBatch 成功后，下一轮调用一次 reviewPlanCandidates（candidateIds 用 ["*"] 表示评审目前已生成的全部候选），并在同一份 JSON 里同时给出 scenario 与 orchestrationSummary。reviewPlanCandidates 成功后 runtime 会收束工具循环，把前三计划与你产出的表达占比交给最终回复阶段；你不需要也不能再调用其它工具，也不要自己写最终回复。',
  '取料三件套（按需调用，渐进式暴露，全部只读）：当上下文或当前用户输入出现你不认识/拿不准的专名，或需要冷门世界设定、某角色特定细节这类「特殊料」时，可主动取料——recallSemantic（语义召回，找意思相近的料）、searchWorldText（文本搜索，按字面/关键词精确命中专名）、fetchUnitDetail（定点读取，已知 unitId 取其摘要或正文）。混合取料边界：最近聊天、当前身份底座、在场信息这类常规、几乎每轮都要的料由框架自动供给，不要用三件套去取；只有不确定、偶尔才要的特殊料才主动取，并在该 toolCall 的 expectation 里说明为什么取、预期拿到什么。三件套只读，不得用于改写世界。典型链路：searchWorldText 命中专名拿到 unitId → fetchUnitDetail 取其正文 → 把取到的信息用进 planPrompt。',
  '每次发起工具调用前，必须在该工具调用的参数里写 expectation：说明你预期这个工具会返回什么、你下一轮准备用什么标准判断结果是否满足预期。',
  '收到 toolResult 消息后的下一轮，先在 thought 里校准：逐项判断结果是否符合上轮 expectation；符合则继续下一步，不符合或返回失败则判断是参数格式、情境选择、工具名、预算还是工具运行问题，并优先用 getToolManual 或修正后的同类工具调用重试。不要把不符合预期的工具结果包装成成功。',
  'planPrompt 必须是给计划生成工具的任务提示词，不能写完整台词、引号对白或可直接发送给用户的回复；batches 里各类别的 planPrompt 必须随反应类别变化。若输入里存在场景变化提醒，或本轮刚通过 updateCurtainScene 修改了帷幕时间/地点，planPrompt 必须明确要求候选计划承接时间或地点变化，不得让角色像上一秒还在原地一样直接接话；若跳转后当前输入已经转为普通问候或轻量接话，planPrompt 也必须以新场景的当下互动为主，不得继续沿用跳转前的特殊尺度、强冲突或强情绪反应。',
  '每一轮你都只输出一份 content JSON（承载 scenario/thought/expressionMix/wordCountAdvice/done/orchestrationSummary 等编排元数据），不要解释、不要 Markdown；工具一律走原生函数调用，不要写进 content JSON。',
  '读情境轮示例：content JSON 形如 {"scenario":"pressure","thought":"本轮意图；若上一轮有 toolResult，先校准是否符合 expectation","done":false,"orchestrationSummary":""}，并发起原生函数调用 readScenarioSkill（参数 code="pressure"、expectation="读取 pressure 情境正文，确认包含反应类别和强度要求"）；命中快进/换地时一并发起 updateCurtainScene（参数 targetTime、targetLocation、reason、expectation）。',
  '生成轮示例（只发起一次 generatePlanBatch 原生函数调用、batches 带全部类别，并在 content 顶层给出 expressionMix）：content JSON 形如 {"scenario":"pressure","thought":"据正文把全部反应类别放进一次 generatePlanBatch 的 batches","expressionMix":{"action":40,"dialogue":35,"expression":20,"innerState":5,"narration":0},"wordCountAdvice":{"min":800,"max":1200},"done":false,"orchestrationSummary":""}，并发起一次 generatePlanBatch 原生函数调用（参数 batches=[{"strategy":"aggressive","strategyLabel":"进攻性","intensities":["low","medium","high"],"planPrompt":"..."},{"strategy":"defensive",...}]、expectation="一次返回全部类别×强度的候选"）。'
].join('\n')

/** 默认全局编排配置（缺省 seed）：默认规则 + 10 套情境（trigger + body）+ 工具注册表。 */
export const DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG: ReplyPlanOrchestratorConfig = {
  systemPrompt: DEFAULT_REPLY_PLAN_ORCHESTRATOR_SYSTEM_PROMPT,
  scenarios: [
    {
      code: 'pressure',
      label: '压力',
      trigger: '高压、关系紧张、被威胁或被外部观察时触发；角色需要在保护性目标下做出反应。',
      body: createPressureScenarioBody()
    },
    {
      code: 'nsfw',
      label: 'NSFW',
      trigger: '仅成年角色。出现明确的性吸引、暧昧升级、身体亲密或带有性意味的互动时触发；角色需要根据关系、欲望、边界和当前环境作出反应。',
      body: createDefaultScenarioBody([
        'NSFW 情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 主动（initiate）：主动推进暧昧或亲密互动；低档是试探、暗示和缩短距离，高档是明确表达欲望并主动推进。',
        '- 回应（reciprocate）：接受并回应对方释放的亲密信号；强调角色不是发起者，而是在确认意愿后顺势回应。',
        '- 克制（restrain）：存在欲望或吸引，但主动压住行动；可表现为转移视线、保持距离、改变话题或提醒自己当前不合适。',
        '- 拒绝（refuse）：不愿继续当前亲密互动，明确建立边界、后退、制止或离开；强度越高，拒绝越直接。',
        '行为必须服从角色既有关系、性格、经历与当前意愿，不因进入 NSFW 情境就自动产生欲望或同意。'
      ])
    },
    {
      code: 'anger',
      label: '愤怒',
      trigger: '被冒犯、被欺骗、利益受损、边界被侵犯、计划被破坏或目睹强烈不公时触发；角色需要处理明显的愤怒和敌意。',
      body: createDefaultScenarioBody([
        '愤怒情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 爆发（confront）：把愤怒直接指向刺激来源；低档是语气变硬、质问，高档是公开冲突、强硬阻止或激烈对抗。',
        '- 压抑（suppress）：明显生气但暂时不表达；通过沉默、绷紧动作、简短回应或强行继续当前事务体现。',
        '- 疏离（withdraw）：停止投入当前互动，通过离开、冷处理、减少交流或刻意拉开关系来处理愤怒。',
        '- 转化（redirect）：不直接发火，而把愤怒转成行动；例如调查、解决问题、证明自己、保护某人或准备之后处理。',
        '愤怒不等于失控；反应应受到角色性格、自控力、双方关系和现实后果约束。'
      ])
    },
    {
      code: 'awkward',
      label: '尴尬',
      trigger: '说错话、被当众关注、秘密被点破、社交失误、暧昧被揭穿或双方突然不知道如何继续互动时触发。',
      body: createDefaultScenarioBody([
        '尴尬情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 掩饰（cover）：假装事情并不严重，通过自然接话、装作没注意到或维持正常动作掩盖尴尬。',
        '- 转移（deflect）：迅速改变话题、关注别的事情或把注意力推向其他人，避免继续停留在尴尬点上。',
        '- 自嘲（self_deprecate）：主动承认自己的窘迫，并通过玩笑、自我调侃或轻描淡写降低社交压力。',
        '- 僵住（freeze）：短时间失去自然反应；表现为停顿、眼神躲闪、动作不自然、说话卡顿或一时不知道该做什么。',
        '不要把尴尬统一写成脸红；应根据人物性格产生不同的社交防御行为。'
      ])
    },
    {
      code: 'sadness',
      label: '悲伤',
      trigger: '遭遇失去、失败、离别、失望、被拒绝或重要期待落空时触发；角色需要处理明显的低落和情绪痛苦。',
      body: createDefaultScenarioBody([
        '悲伤情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 倾诉（seek_support）：寻找可信任的人陪伴、说出感受或主动寻求安慰。',
        '- 独处（withdraw）：减少交流，寻找安静空间独自消化情绪。',
        '- 强撑（mask）：维持正常状态，继续工作、说笑或照顾别人，但通过细微异常泄露真实情绪。',
        '- 沉浸（grieve）：允许自己停留在悲伤里，回忆、哭泣、整理旧物或反复思考失去的东西。',
        '悲伤应体现角色真正重视了什么，而不只是泛化地“情绪低落”。'
      ])
    },
    {
      code: 'fear',
      label: '恐惧',
      trigger: '面临危险、未知威胁、可能受伤、重要事物可能失去或无法判断风险来源时触发；角色进入明显的警戒状态。',
      body: createDefaultScenarioBody([
        '恐惧情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 对抗（fight）：把注意力集中到威胁上，准备阻止、反击或保护自己及他人。',
        '- 逃离（flight）：主动扩大与危险之间的距离，寻找出口、安全区域或撤退路线。',
        '- 僵住（freeze）：短暂失去行动能力，注意力锁死在威胁上，身体和思维出现停顿。',
        '- 求援（seek_help）：迅速寻找可信任的人、群体、工具或安全设施，把解决危险的能力交给更可靠的外部资源。',
        '恐惧反应应依据角色对危险的主观判断，而不是只根据客观危险程度。'
      ])
    },
    {
      code: 'jealousy',
      label: '嫉妒',
      trigger: '角色重视的人把注意力、亲密、认可或资源给予别人，使角色产生被替代、被比较或可能失去关系的感觉时触发。',
      body: createDefaultScenarioBody([
        '嫉妒情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 争取（compete）：主动重新争取对方的注意、认可或关系位置；强度越高，竞争意识越明显。',
        '- 试探（probe）：通过观察、旁敲侧击、询问或制造小测试，确认自己与第三者分别处在什么位置。',
        '- 掩饰（hide）：意识到自己的嫉妒，但因为自尊、身份或关系原因不愿暴露，表面维持正常。',
        '- 疏远（withdraw）：因为感到自己被冷落或替代，降低投入、减少互动甚至主动拉开距离。',
        '嫉妒的核心不是“讨厌第三者”，而是角色担心自己失去某种重要位置。'
      ])
    },
    {
      code: 'guilt',
      label: '内疚',
      trigger: '角色认为自己的选择伤害了别人、造成坏结果、违背承诺或违反自身价值观时触发。',
      body: createDefaultScenarioBody([
        '内疚情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 补偿（repair）：试图修复自己造成的损失，通过帮助、补偿、承担责任或弥补后果降低亏欠感。',
        '- 坦白（confess）：主动承认自己的行为、错误或隐瞒，并承担对方可能产生的反应。',
        '- 逃避（avoid）：因为害怕面对后果而回避相关人物、话题、地点或证据。',
        '- 合理化（justify）：通过寻找理由重新解释自己的行为，试图说服自己“当时只能这样做”或责任并不完全属于自己。',
        '内疚越强，不代表一定越愿意道歉；高内疚也可能制造更强的逃避和自我辩护。'
      ])
    },
    {
      code: 'excitement',
      label: '兴奋',
      trigger: '愿望实现、获得奖励、发现新鲜事物、得到重要认可、期待即将实现或突然出现好消息时触发。',
      body: createDefaultScenarioBody([
        '兴奋情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 分享（share）：第一时间寻找某个人分享消息、展示成果或邀请别人一起参与。',
        '- 行动（act）：兴奋直接转化为行动，立刻开始尝试、准备、探索或推进相关计划。',
        '- 庆祝（celebrate）：暂时放下其他事务，通过明显的庆祝行为表达喜悦。',
        '- 克制（contain）：内心明显兴奋，但因为身份、环境或性格原因努力维持平静，只从细微动作中泄露情绪。',
        '兴奋不仅影响语言，也应该改变角色接下来愿意做什么。'
      ])
    },
    {
      code: 'fatigue',
      label: '疲惫',
      trigger: '长时间劳动、缺乏睡眠、持续赶路、连续战斗、精神消耗或长期承担高负荷任务时触发。',
      body: createDefaultScenarioBody([
        '疲惫情境下，角色通常在四类反应间选择；只调用一次 generatePlanBatch，在 batches 数组里为每一类各列一项，强度统一取 low / medium / high 三档：',
        '- 休息（rest）：降低当前活动强度，寻找能够恢复体力或精神的方式。',
        '- 强撑（push）：因为责任、目标或紧迫性继续行动，但效率、耐心和动作质量逐渐下降。',
        '- 简化（simplify）：主动减少非必要行动、交流和决策，只处理最重要的问题。',
        '- 烦躁（irritable）：疲劳降低情绪控制能力，对小问题表现出比平时更明显的不耐烦和易怒。',
        '疲惫不是单纯降低数值，而应该实际改变角色的决策方式和行为优先级。'
      ])
    }
  ],
  tools: DEFAULT_REPLY_PLAN_ORCHESTRATOR_TOOLS
}

/**
 * 把情境清单渲染成编排器可读的「可用情境」路由清单，注入 system 提示词。
 * 批次 2 多轮渐进式：只注入 trigger（短路由说明），body 由编排器在 loop 里调 readScenarioSkill 按需读取，
 * 避免每轮把所有情境正文全量塞进上下文。
 */
export function renderReplyPlanScenarioGuide(scenarios: ReplyPlanScenarioConfig[]): string {
  const list = (scenarios || []).filter((scenario) => scenario && scenario.code.trim())
  if (list.length === 0) return ''
  const lines: string[] = ['可用情境（先判断本轮最匹配的情境，再调用 readScenarioSkill 读其正文）：']
  for (const scenario of list) {
    lines.push(`- ${scenario.code}（${scenario.label || scenario.code}）：${scenario.trigger || ''}`.trimEnd())
  }
  return lines.join('\n')
}

/** 渲染「可用工具」brief 清单，注入 system 提示词。批次 2 列出全部工具（plan 执行工具 + meta 元工具）。 */
export function renderReplyPlanToolBrief(tools: ReplyPlanOrchestratorToolDef[]): string {
  const list = (tools || []).filter((tool) => tool && tool.name.trim())
  if (list.length === 0) return ''
  const lines: string[] = ['可用工具：']
  for (const tool of list) {
    lines.push(`- ${tool.name}：${tool.brief || ''}`.trimEnd())
  }
  return lines.join('\n')
}

/** 按工具名取回 manual（getToolManual 元工具的纯函数实现，供批次 2 的 loop 使用）。 */
export function getReplyPlanToolManual(
  tools: ReplyPlanOrchestratorToolDef[],
  name: string
): string {
  const target = (tools || []).find((tool) => tool && tool.name === String(name || '').trim())
  return target?.manual || ''
}

/** 按情境 code 取回 body 正文（readScenarioSkill 元工具的纯函数实现，供批次 2 的 loop 使用）。 */
export function readReplyPlanScenarioBody(
  scenarios: ReplyPlanScenarioConfig[],
  code: string
): string {
  const normalizedCode = normalizeReplyPlanScenarioCode(code)
  const target = (scenarios || []).find((scenario) => scenario && normalizeReplyPlanScenarioCode(scenario.code) === normalizedCode)
  return target?.body || ''
}

/** 读取某情境下启用的挂载提示词「标题 + 描述」摘要（给提调读情境后判断要不要用；原文命中后会自动注入最终角色消息提示词）。
 *  提调正常只看描述；某条没填描述时回退给出原文，避免提调完全看不到内容。无挂载提示词返回空串。 */
export function readReplyPlanScenarioMountedPromptDigest(
  scenarios: ReplyPlanScenarioConfig[],
  code: string
): string {
  const normalizedCode = normalizeReplyPlanScenarioCode(code)
  const target = (scenarios || []).find((scenario) => scenario && normalizeReplyPlanScenarioCode(scenario.code) === normalizedCode)
  const prompts = (Array.isArray(target?.mountedPrompts) ? target!.mountedPrompts : [])
    .filter((prompt) => prompt && prompt.enabled !== false && String(prompt.content || '').trim())
    .slice()
    .sort((left, right) => (Number(left.orderIndex) || 0) - (Number(right.orderIndex) || 0))
  if (!prompts.length) return ''
  const lines = prompts.map((prompt, index) => {
    const title = String(prompt.title || '').trim() || `挂载提示词${index + 1}`
    const description = String(prompt.description || '').trim()
    return description
      ? `${index + 1}. ${title}：${description}`
      : `${index + 1}. ${title}（未填描述，原文：${String(prompt.content || '').trim()}）`
  })
  return ['【本情境挂载提示词（命中该情境后其原文会自动注入最终角色消息提示词；你先看描述判断与本轮是否相关、要不要据它定方向）】', ...lines].join('\n')
}

export function buildReplyPlanOrchestratorPrompt(
  input: ReplyPlanOrchestratorPromptInput,
  config: ReplyPlanOrchestratorConfig = DEFAULT_REPLY_PLAN_ORCHESTRATOR_CONFIG
): ReplyPlanOrchestratorPromptTrace {
  const characterName = String(input.characterName || '当前角色').trim()
  const systemPrompt = String(config?.systemPrompt || '').trim() || DEFAULT_REPLY_PLAN_ORCHESTRATOR_SYSTEM_PROMPT
  const scenarioGuide = renderReplyPlanScenarioGuide(config?.scenarios || [])
  const toolBrief = renderReplyPlanToolBrief(config?.tools || [])
  // 批次 B·本会话编排倾向：置于主纲领之后、情境清单之前，强调「仅次于主纲领、高于情境/常规判断」。空则不进。
  const prefBlock = renderDirectorPrefBlock(input.directorPref || '')
  const messages: ReplyPlanOrchestratorPromptTrace['messages'] = [
    {
      role: 'system',
      content: [LANGHUAN_AGENT_ROOT_INSTRUCTION, systemPrompt, prefBlock, scenarioGuide, toolBrief].filter(Boolean).join('\n\n')
    },
    {
      role: 'user',
      content: [
        `回复角色：${characterName}`,
        input.previousProjection ? `前一轮角色输出投影：\n${input.previousProjection}` : '',
        input.sceneChangeNotice ? `场景变化提醒：\n${input.sceneChangeNotice}` : '',
        '已整合情境：',
        input.compressedContext || '暂无情境。',
        input.currentUserInput ? `当前用户输入：${input.currentUserInput}` : ''
      ].filter(Boolean).join('\n\n')
    }
  ]
  const promptBlocks = [
    { role: 'system' as const, title: 'LANGHUAN.md 根宪法 + 回复计划编排系统规则', content: messages[0].content },
    { role: 'user' as const, title: '回复计划编排输入', content: messages[1].content }
  ]
  return {
    messages,
    promptBlocks,
    finalPrompt: messages.map((message) => `## ${message.role}\n${message.content}`).join('\n\n')
  }
}

/** 从 generatePlanBatch 工具调用反推 strategyMatrix（派生字段，供审计展示）。 */
export function deriveStrategyMatrixFromToolCalls(
  toolCalls: ReplyPlanOrchestratorToolCall[]
): ReplyPlanStrategySpec[] {
  return toolCalls
    .filter((toolCall): toolCall is GeneratePlanBatchToolCall => toolCall.tool === 'generatePlanBatch')
    .map((toolCall) => ({
      strategy: toolCall.strategy,
      strategyLabel: toolCall.strategyLabel,
      intensities: [...toolCall.intensities],
      planPrompt: toolCall.planPrompt
    }))
}

export function normalizeReplyPlanOrchestratorOutput(output: unknown): ReplyPlanOrchestration {
  const parsed = parseJsonObjectStrict(output, '回复计划编排器输出')
  const toolCallsRaw = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : (Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [])
  const toolCalls = toolCallsRaw.map((item: unknown) => normalizeToolCall(item))
  return {
    scenario: String(parsed.scenario || '').trim(),
    // strategyMatrix 不再读取模型预声明，统一由 toolCalls 派生
    strategyMatrix: deriveStrategyMatrixFromToolCalls(toolCalls),
    toolCalls,
    orchestrationSummary: String(parsed.orchestrationSummary ?? parsed.orchestration_summary ?? '').trim(),
    failureStrategy: typeof parsed.failureStrategy === 'string' ? parsed.failureStrategy as ReplyPlanFailureStrategy : undefined
  }
}

export function buildReviewPlanCandidatesInput(params: ReviewPlanCandidatesInput): ReviewPlanCandidatesInput {
  return {
    compressedContext: params.compressedContext,
    candidates: params.candidates.map((candidate) => ({ ...candidate }))
  }
}

export function buildPersonalityRerankerPairInputs(
  reviewInput: ReviewPlanCandidatesInput
): PersonalityRerankerPairInput[] {
  return reviewInput.candidates.map((candidate) => ({
    situation: reviewInput.compressedContext,
    plan: candidate.content,
    candidateId: candidate.id
  }))
}

/**
 * 按工具调用直接校验编排器输出（批次 1 新协议）：
 * 非空 scenario + 至少一个 generatePlanBatch + 每个工具调用自身参数非空 + 工具白名单 + 预算。
 * 不再做「toolCall.strategy 必须在预声明 strategyMatrix 里」的交叉校验。
 */
export function validateReplyPlanOrchestration(
  orchestration: ReplyPlanOrchestration,
  options: ValidateReplyPlanOrchestrationOptions = {}
): ReplyPlanOrchestrationValidationIssue[] {
  const budget = options.budget ?? DEFAULT_REPLY_PLAN_ORCHESTRATOR_BUDGET
  const issues: ReplyPlanOrchestrationValidationIssue[] = []

  if (!orchestration.scenario?.trim()) {
    issues.push({
      code: 'empty_scenario',
      message: '编排器必须声明本轮情境。',
      blocking: true
    })
  }

  const generateCalls = orchestration.toolCalls.filter(
    (toolCall): toolCall is GeneratePlanBatchToolCall => toolCall.tool === 'generatePlanBatch'
  )
  const reviewCalls = orchestration.toolCalls.filter(
    (toolCall): toolCall is ReviewPlanCandidatesToolCall => toolCall.tool === 'reviewPlanCandidates'
  )

  if (generateCalls.length === 0) {
    issues.push({
      code: 'no_plan_tool_calls',
      message: '编排器必须至少发起一次 generatePlanBatch 计划工具调用。',
      blocking: true
    })
  }

  if (orchestration.toolCalls.length > budget.maxTotalToolCalls) {
    issues.push({
      code: 'too_many_tool_calls',
      message: '工具调用总数超过编排预算。',
      blocking: true
    })
  }

  if (generateCalls.length > budget.maxGeneratePlanBatchCalls) {
    issues.push({
      code: 'too_many_generate_calls',
      message: '计划批次生成工具调用数超过编排预算。',
      blocking: true
    })
  }

  if (reviewCalls.length > budget.maxReviewPlanCandidatesCalls) {
    issues.push({
      code: 'too_many_review_calls',
      message: '候选计划评审工具调用数超过编排预算。',
      blocking: true
    })
  }

  for (const toolCall of orchestration.toolCalls) {
    if (!isAllowedReplyPlanToolName(toolCall.tool)) {
      issues.push({
        code: 'unknown_tool',
        message: `未注册工具 ${String((toolCall as { tool?: unknown }).tool)} 不允许由回复计划编排器调用。`,
        blocking: true
      })
      continue
    }

    if (toolCall.tool === 'generatePlanBatch') {
      if (!toolCall.strategy.trim() || !toolCall.strategyLabel.trim()) {
        issues.push({
          code: 'empty_strategy',
          message: '每个 generatePlanBatch 调用都必须有反应类别机器名和展示名。',
          blocking: true
        })
      }

      if (toolCall.intensities.length === 0) {
        issues.push({
          code: 'empty_intensities',
          message: `计划工具调用 ${toolCall.strategy || '(未命名)'} 必须包含强度列表。`,
          blocking: true
        })
      }

      if (toolCall.intensities.length > budget.maxIntensitiesPerStrategy) {
        issues.push({
          code: 'too_many_intensities',
          message: `计划工具调用 ${toolCall.strategy || '(未命名)'} 的强度数量超过预算。`,
          blocking: true
        })
      }

      if (!toolCall.planPrompt.trim()) {
        issues.push({
          code: 'empty_plan_prompt',
          message: `计划工具调用 ${toolCall.strategy || '(未命名)'} 缺少任务提示词。`,
          blocking: true
        })
      }
    }

    if (toolCall.tool === 'reviewPlanCandidates' && toolCall.candidateIds.length < budget.minCandidatesForReview) {
      issues.push({
        code: 'review_without_candidates',
        message: '评审工具调用必须绑定候选计划。',
        blocking: true
      })
    }
  }

  for (const candidate of orchestration.candidates ?? []) {
    if (!candidate.content.trim()) {
      issues.push({
        code: 'candidate_missing_content',
        message: `候选计划 ${candidate.id} 缺少计划正文。`,
        blocking: true
      })
    }
  }

  return issues
}

export function isAllowedReplyPlanToolName(toolName: string): toolName is ReplyPlanOrchestratorToolName {
  return REPLY_PLAN_ORCHESTRATOR_ALLOWED_TOOLS.includes(toolName as ReplyPlanOrchestratorToolName)
}

function extractJsonText(value: unknown): string {
  const source = String(value ?? '').trim()
  const objectStart = source.indexOf('{')
  const objectEnd = source.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) return source.slice(objectStart, objectEnd + 1)
  return source
}

function parseJsonObjectStrict(value: unknown, label: string): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  const jsonText = extractJsonText(value)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${label}解析失败：${reason}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label}必须是 JSON 对象`)
  }
  return parsed as Record<string, any>
}

function normalizeToolCall(value: unknown): ReplyPlanOrchestratorToolCall {
  const record = value && typeof value === 'object' ? value as Record<string, any> : {}
  const tool = String(record.tool || '').trim()
  const expectation = String(record.expectation ?? record.expected ?? record.expectedResult ?? record.expected_result ?? '').trim()
  if (tool === 'generatePlanBatch') {
    return {
      tool,
      strategy: String(record.strategy || '').trim(),
      strategyLabel: String(record.strategyLabel ?? record.strategy_label ?? '').trim(),
      intensities: Array.isArray(record.intensities) ? record.intensities.map((item) => String(item || '').trim()).filter(Boolean) : [],
      planPrompt: String(record.planPrompt ?? record.plan_prompt ?? '').trim(),
      ...(expectation ? { expectation } : {}),
      promptLogId: String(record.promptLogId ?? record.prompt_log_id ?? '').trim() || undefined
    }
  }
  return {
    tool: tool as 'reviewPlanCandidates',
    candidateIds: Array.isArray(record.candidateIds ?? record.candidate_ids)
      ? (record.candidateIds ?? record.candidate_ids).map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    ...(expectation ? { expectation } : {}),
    promptLogId: String(record.promptLogId ?? record.prompt_log_id ?? '').trim() || undefined
  }
}
