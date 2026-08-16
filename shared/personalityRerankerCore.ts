// 人格模型 ReRanker（人格重排序模型）打分核心：与平台无关的纯逻辑，浏览器本地推理与服务端推理共用同一份。
// 关键真值（改动前先核对，两端必须逐条等价）：
// - 模型是 XLMRobertaForSequenceClassification，num_labels=1，输入只有 input_ids + attention_mask（无 token_type_ids）。
// - 打分 = 取单个 logit 原始值，不做任何 0-1 / 0-100 换算或裁剪，允许负数。
// - max_length=384；情境过长必须给候选预留 token，否则 tokenizer 把候选挤掉会导致所有分数相同。
// 本模块只接收「已加载好的 tokenizer + model」，不负责模型加载与环境配置（那是平台相关的，留在各自入口）。

// transformers.js 的 tokenizer / model 结构在浏览器与 Node 一致；此处用结构化 any 避免共享层引入平台依赖。
export type LoadedReranker = {
  tokenizer: any
  model: any
}

export type PersonalityRerankerDiagnostics = {
  modelId: string
  candidateCount: number
  situationCharLength: number
  scoringSituationCharLength: number
  uniquePlanCount: number
  inputSequenceLength: number
  distinctEncodedInputCount: number
  uniqueScoreCount: number
  situationTokenCount: number
  situationTruncated: boolean
  planTokenBudget: number
  contextTokenBudget: number
  truncatedPlanCount: number
}

export type PersonalityRerankerScoreResult = {
  scores: number[]
  diagnostics: PersonalityRerankerDiagnostics
}

type TokenizedText = {
  text: string
  originalTokenCount: number
  tokenCount: number
  truncated: boolean
}

// ONNX 导出链路与离线 CrossEncoder 评审使用 max_length=384；情境/候选 token 预算据此分配。
// 280 + 96 给 XLM-R 的成对输入特殊标记及边界留出 8 token，不能把两段预算直接顶满。
export const MAX_SEQUENCE_LENGTH = 384
export const CONTEXT_TOKEN_BUDGET = 280
export const PLAN_TOKEN_BUDGET = 96

// personalityModelPath 形如 `personality-models/<safeId>` 或 `personality-models/<charId>/<versionId>`。
// 剥掉首尾斜杠与固定前缀，得到相对前缀的 modelId（多斜杠版本路径也能落到 transformers.js 接受的至多一斜杠形态）。
export function normalizeModelId(personalityModelPath: string): string {
  return String(personalityModelPath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^personality-models\//, '')
}

function normalizePlanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function readTokenIds(value: unknown): number[] {
  const inputIds = (value as any)?.input_ids
  const rows = typeof inputIds?.tolist === 'function' ? inputIds.tolist() : inputIds
  if (Array.isArray(rows?.[0])) return rows[0].map((id: unknown) => Number(id)).filter(Number.isFinite)
  if (Array.isArray(rows)) return rows.map((id: unknown) => Number(id)).filter(Number.isFinite)
  return []
}

function readEncodedRows(value: unknown): number[][] {
  const inputIds = (value as any)?.input_ids
  const rows = typeof inputIds?.tolist === 'function' ? inputIds.tolist() : inputIds
  if (!Array.isArray(rows)) return []
  if (Array.isArray(rows[0])) {
    return rows.map((row: unknown) => Array.isArray(row)
      ? row.map((id: unknown) => Number(id)).filter(Number.isFinite)
      : [])
  }
  return [rows.map((id: unknown) => Number(id)).filter(Number.isFinite)]
}

async function encodeTextWithoutSpecialTokens(tokenizer: any, text: string): Promise<number[]> {
  const encoded = await tokenizer(String(text || ''), {
    add_special_tokens: false,
    padding: false,
    truncation: false,
    return_token_type_ids: false
  })
  return readTokenIds(encoded)
}

function decodeTokenIds(tokenizer: any, ids: number[]): string {
  if (!ids.length) return ''
  try {
    return String(tokenizer.decode(ids, { skip_special_tokens: true }) || '').trim()
  } catch {
    return ''
  }
}

async function truncateTextByTokenBudget(
  tokenizer: any,
  text: string,
  budget: number,
  options: { preserveTail?: boolean } = {}
): Promise<TokenizedText> {
  const source = normalizePlanText(text)
  if (!source) {
    return { text: '', originalTokenCount: 0, tokenCount: 0, truncated: false }
  }
  const ids = await encodeTextWithoutSpecialTokens(tokenizer, source)
  if (ids.length <= budget) {
    return { text: source, originalTokenCount: ids.length, tokenCount: ids.length, truncated: false }
  }
  const safeBudget = Math.max(1, budget)
  let selectedIds: number[]
  if (options.preserveTail && safeBudget > 24) {
    const headCount = Math.ceil(safeBudget * 0.6)
    const tailCount = safeBudget - headCount
    selectedIds = [
      ...ids.slice(0, headCount),
      ...ids.slice(Math.max(headCount, ids.length - tailCount))
    ]
  } else {
    selectedIds = ids.slice(0, safeBudget)
  }
  const decoded = decodeTokenIds(tokenizer, selectedIds)
  return {
    text: decoded || source.slice(0, Math.max(40, safeBudget)),
    originalTokenCount: ids.length,
    tokenCount: selectedIds.length,
    truncated: true
  }
}

async function buildScoringTexts(tokenizer: any, input: {
  situation: string
  plans: string[]
}): Promise<{ situation: TokenizedText; plans: TokenizedText[] }> {
  const [situation, plans] = await Promise.all([
    truncateTextByTokenBudget(tokenizer, input.situation, CONTEXT_TOKEN_BUDGET, { preserveTail: true }),
    Promise.all(input.plans.map((plan) => truncateTextByTokenBudget(tokenizer, plan, PLAN_TOKEN_BUDGET)))
  ])
  return { situation, plans }
}

function buildDiagnostics(input: {
  modelId: string
  plans: string[]
  situation: string
  scoringSituation: TokenizedText
  scoringPlans: TokenizedText[]
  encodedRows: number[][]
  scores: number[]
}): PersonalityRerankerDiagnostics {
  const uniquePlans = new Set(input.plans.map(normalizePlanText).filter(Boolean))
  const uniqueScores = new Set(input.scores.map((score) => Number(score).toFixed(8)))
  const distinctEncodedInputs = new Set(input.encodedRows.map((row) => row.join(',')))
  return {
    modelId: input.modelId,
    candidateCount: input.plans.length,
    situationCharLength: String(input.situation || '').length,
    scoringSituationCharLength: input.scoringSituation.text.length,
    uniquePlanCount: uniquePlans.size,
    inputSequenceLength: input.encodedRows[0]?.length || 0,
    distinctEncodedInputCount: distinctEncodedInputs.size,
    uniqueScoreCount: uniqueScores.size,
    situationTokenCount: input.scoringSituation.originalTokenCount,
    situationTruncated: input.scoringSituation.truncated,
    planTokenBudget: PLAN_TOKEN_BUDGET,
    contextTokenBudget: CONTEXT_TOKEN_BUDGET,
    truncatedPlanCount: input.scoringPlans.filter((plan) => plan.truncated).length
  }
}

// 打分有效性门禁：候选有差异却得到完全相同的编码或分数，说明候选没真正进入配对输入，必须停止以免把假分数当真排序。
export function assertValidScoringDiagnostics(diagnostics: PersonalityRerankerDiagnostics): void {
  if (diagnostics.candidateCount <= 1 || diagnostics.uniquePlanCount <= 1) return
  if (diagnostics.distinctEncodedInputCount <= 1) {
    throw new Error([
      '人格模型 ReRanker 打分无效：候选计划没有进入真实配对输入。',
      `候选 ${diagnostics.candidateCount} 条，编码后唯一输入 ${diagnostics.distinctEncodedInputCount} 种。`,
      '已停止生成，避免把假分数写入回复计划。'
    ].join(''))
  }
  if (diagnostics.uniqueScoreCount <= 1) {
    throw new Error([
      '人格模型 ReRanker 打分无效：不同候选得到完全相同的原始分。',
      `候选 ${diagnostics.candidateCount} 条，唯一分数 ${diagnostics.uniqueScoreCount} 种。`,
      '已停止生成，避免把兜底分数或异常模型输出当成真实排序。'
    ].join(''))
  }
}

// 候选为空时的统一空结果：浏览器/服务端入口在加载模型前直接返回，避免空跑推理。
export function buildEmptyScoreResult(modelId: string, situation: string): PersonalityRerankerScoreResult {
  return {
    scores: [],
    diagnostics: {
      modelId,
      candidateCount: 0,
      situationCharLength: String(situation ?? '').length,
      scoringSituationCharLength: 0,
      uniquePlanCount: 0,
      inputSequenceLength: 0,
      distinctEncodedInputCount: 0,
      uniqueScoreCount: 0,
      situationTokenCount: 0,
      situationTruncated: false,
      planTokenBudget: PLAN_TOKEN_BUDGET,
      contextTokenBudget: CONTEXT_TOKEN_BUDGET,
      truncatedPlanCount: 0
    }
  }
}

/**
 * 用已加载好的 ReRanker 对一批候选计划逐条打分。返回分数顺序与 plans 一一对应。
 * 两端（浏览器本地 / 服务端）共用本函数，保证同情境 + 同候选得到完全一致的分数与诊断。
 */
export async function scoreWithLoadedReranker(loaded: LoadedReranker, input: {
  modelId: string
  situation: string
  plans: string[]
}): Promise<PersonalityRerankerScoreResult> {
  const modelId = input.modelId
  const plans = Array.isArray(input.plans) ? input.plans.map((plan) => String(plan ?? '')) : []
  const situation = String(input.situation ?? '')
  if (!plans.length) return buildEmptyScoreResult(modelId, situation)

  const { tokenizer, model } = loaded
  // 旧的 256 训练包会把 tokenizer_config.model_max_length 固化为 256；即便调用时传 384，
  // transformers.js 仍会先按该旧值截断并把 text_pair 整段挤掉。基底位置嵌入支持本协议的
  // 384，因此推理前必须把已加载 tokenizer 的运行上限提升到当前统一协议值。
  tokenizer.model_max_length = MAX_SEQUENCE_LENGTH
  const scoringTexts = await buildScoringTexts(tokenizer, { situation, plans })

  // 情境对每条计划都相同，按文本对（situation, plan）批量编码；XLM-R 不需要 token_type_ids。
  const situations = plans.map(() => scoringTexts.situation.text)
  const inputs = await tokenizer(situations, {
    text_pair: scoringTexts.plans.map((plan) => plan.text),
    padding: true,
    truncation: true,
    max_length: MAX_SEQUENCE_LENGTH,
    return_token_type_ids: false
  })

  const output = await model({
    input_ids: inputs.input_ids,
    attention_mask: inputs.attention_mask
  })
  const logits = output?.logits
  if (!logits || !logits.data) {
    throw new Error('人格模型推理未返回 logits')
  }
  // num_labels=1：logits 形状 [N, 1]，data 是长度 N 的扁平数组，逐条即原始分。
  const scores = Array.from(logits.data as ArrayLike<number>, (value) => Number(value))
  if (scores.length !== plans.length) {
    throw new Error(`人格模型评分数量不匹配：候选 ${plans.length} 条，得分 ${scores.length} 条`)
  }
  const diagnostics = buildDiagnostics({
    modelId,
    plans,
    situation,
    scoringSituation: scoringTexts.situation,
    scoringPlans: scoringTexts.plans,
    encodedRows: readEncodedRows(inputs),
    scores
  })
  assertValidScoringDiagnostics(diagnostics)
  return { scores, diagnostics }
}
