import { describe, expect, it } from 'vitest'

import {
  normalizeModelId,
  buildEmptyScoreResult,
  scoreWithLoadedReranker,
  assertValidScoringDiagnostics,
  MAX_SEQUENCE_LENGTH,
  CONTEXT_TOKEN_BUDGET,
  PLAN_TOKEN_BUDGET
} from '../../../shared/personalityRerankerCore'

// 假 tokenizer：把字符转成 charCode 当 token；情境/计划都很短，不触发预算截断。
function makeFakeTokenizer() {
  const enc = (text) => Array.from(String(text ?? '')).map((c) => c.charCodeAt(0))
  const fn = (textOrArray, opts = {}) => {
    if (Array.isArray(textOrArray)) {
      const pairs = opts.text_pair || []
      const rows = textOrArray.map((t, i) => [...enc(t), 0, ...enc(pairs[i] || '')])
      return { input_ids: rows, attention_mask: rows.map((r) => r.map(() => 1)) }
    }
    return { input_ids: [enc(textOrArray)] }
  }
  fn.decode = (ids) => ids.map((id) => String.fromCharCode(id)).join('')
  return fn
}

// 假 model：按候选下标产出互不相同的 logits，模拟正常打分。
function makeFakeModel(scoreFn = (i) => i - 0.5) {
  return (inputs) => {
    const n = inputs.input_ids.length
    return { logits: { data: Array.from({ length: n }, (_, i) => scoreFn(i)) } }
  }
}

describe('personalityRerankerCore', () => {
  it('训练、离线评测与浏览器推理共用 384 token 输入协议', () => {
    expect(MAX_SEQUENCE_LENGTH).toBe(384)
    expect(CONTEXT_TOKEN_BUDGET).toBe(280)
    expect(PLAN_TOKEN_BUDGET).toBe(96)
    expect(CONTEXT_TOKEN_BUDGET + PLAN_TOKEN_BUDGET).toBeLessThan(MAX_SEQUENCE_LENGTH)
  })

  it('normalizeModelId 剥掉前缀与首尾斜杠（安装态/版本态都通过）', () => {
    expect(normalizeModelId('personality-models/char_1')).toBe('char_1')
    expect(normalizeModelId('/personality-models/char_1/pmv_2/')).toBe('char_1/pmv_2')
    expect(normalizeModelId('')).toBe('')
  })

  it('候选为空时返回统一空结果，不空跑推理', () => {
    const result = buildEmptyScoreResult('char_1', '某情境')
    expect(result.scores).toEqual([])
    expect(result.diagnostics.candidateCount).toBe(0)
    expect(result.diagnostics.situationCharLength).toBe('某情境'.length)
  })

  it('scoreWithLoadedReranker 逐条打分，分数顺序与候选一一对应', async () => {
    const tokenizer = makeFakeTokenizer()
    tokenizer.model_max_length = 256
    const loaded = { tokenizer, model: makeFakeModel() }
    const plans = ['轻快追问原因', '冷静指出风险', '先观察再回应']
    const result = await scoreWithLoadedReranker(loaded, { modelId: 'char_1', situation: '深夜客厅情境', plans })
    expect(tokenizer.model_max_length).toBe(384)
    expect(result.scores).toEqual([-0.5, 0.5, 1.5])
    expect(result.diagnostics.candidateCount).toBe(3)
    expect(result.diagnostics.uniquePlanCount).toBe(3)
    expect(result.diagnostics.distinctEncodedInputCount).toBe(3)
    expect(result.diagnostics.uniqueScoreCount).toBe(3)
    expect(result.diagnostics.inputSequenceLength).toBeLessThanOrEqual(MAX_SEQUENCE_LENGTH)
  })

  it('不同候选得到完全相同分数时，有效性门禁停止生成', async () => {
    const loaded = { tokenizer: makeFakeTokenizer(), model: makeFakeModel(() => 1.0) }
    const plans = ['计划甲', '计划乙', '计划丙']
    await expect(
      scoreWithLoadedReranker(loaded, { modelId: 'char_1', situation: '情境', plans })
    ).rejects.toThrow(/完全相同的原始分/)
  })

  it('assertValidScoringDiagnostics 对编码塌缩为单一输入直接报错', () => {
    expect(() => assertValidScoringDiagnostics({
      candidateCount: 3,
      uniquePlanCount: 3,
      distinctEncodedInputCount: 1,
      uniqueScoreCount: 3
    })).toThrow(/没有进入真实配对输入/)
  })
})
