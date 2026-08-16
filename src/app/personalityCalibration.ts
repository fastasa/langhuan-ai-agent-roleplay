// 性格校准（据已确认样本对照角色性格正文）核心模块。
//
// 边界（见 2026-06-09 计划书「2026-06-16 性格校准」）：
// - 这是训练弹窗「样本」步的旁路功能，与 ReRanker 训练数据完全解耦，不改训练样本。
// - 只对照、只修订角色「性格正文」(Character.personality)；不碰角色大脑灵魂节点。
// - 输入＝角色原性格正文 + 即时解析的 8 维内核 + 已确认样本（正/反例）。
// - 输出＝维度级 diff（直观展示修改前/修改意见）+ 一整段「修改后性格正文」（以样本为准）。
// - 本模块为纯逻辑：不直接调 store、不写库；只构造提示词、归一模型输出。写回由调用方写 personality 字段。

import type { AgentModelConfig } from '../types'
import type { PersonalityKernel } from '../types/personalityKernel'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'

type ChatRole = 'system' | 'user' | 'assistant'

export type PersonalityCalibrationCallAI = (
  messages: Array<{ role: ChatRole; content: string }>,
  options?: Record<string, unknown>
) => Promise<string | null> | string | null

/** 一条已确认样本：正例＝用户所选计划，反例＝同组其余候选。 */
export interface PersonalityCalibrationSample {
  id: string
  dimension: string
  situation: string
  chosenPlan: string
  rejectedPlans: string[]
  /** 来自真实会话、显式标注的极性（可选）；问卷样本默认按"选中即正例"。 */
  polarity?: 'pos' | 'neg'
}

export type PersonalityCalibrationStatus = 'keep' | 'adjust' | 'new'

export interface PersonalityCalibrationEvidence {
  kind: 'pos' | 'neg' | 'quiz'
  text: string
  sampleId?: string
}

export interface PersonalityCalibrationTrait {
  id: string
  /** 8 维守护键之一，或自定义维度时为 'custom'。 */
  dimensionKey: string
  /** 中文维度名（展示用）。 */
  dim: string
  status: PersonalityCalibrationStatus
  /** 刻度轴两端中文标签 [低, 高]。 */
  axisLabels: [string, string]
  /** 现状刻度位置 0..1；新增倾向为 null（性格正文未涉及）。 */
  oldPos: number | null
  /** 据样本建议刻度位置 0..1。 */
  newPos: number
  /** 修改前现状（该维度在原性格正文里的体现）。 */
  before: string
  /** 修改意见（一句人话）。 */
  after: string
  /** 是否与现性格正文明显分歧。 */
  conflict: boolean
  evidence: PersonalityCalibrationEvidence[]
}

export interface PersonalityCalibrationResult {
  status: 'ok' | 'skipped' | 'failed'
  reason: string
  traits: PersonalityCalibrationTrait[]
  /** 整段「修改后性格正文」（以已确认样本为准，纳入所有建议）。 */
  revisedPersonality: string
  summary: { adjust: number; new: number; keep: number }
  rawOutput?: string
}

export interface RunPersonalityCalibrationInput {
  characterName?: string
  /** 角色当前性格正文（对照基准 + 即时解析内核的来源）。 */
  personalityText: string
  samples: PersonalityCalibrationSample[]
  kernel?: PersonalityKernel | null
  agentConfig?: Partial<AgentModelConfig> | null
  callAI?: PersonalityCalibrationCallAI
}

const SCORE_MIN = -1000
const SCORE_MAX = 1000
const MAX_SAMPLES = 80
const MAX_TEXT_CHARS = 400
const MAX_PERSONALITY_CHARS = 6000
export const MAX_REVISED_PERSONALITY_CHARS = 900
const MAX_EVIDENCE = 4

/** 8 维守护键 → 中文维度名 + 刻度轴 [低端, 高端]。与 personalityKernelParser 的守护定义一一对应。 */
const GUARD_AXIS: Record<string, { dim: string; axis: [string, string] }> = {
  emotionalStability: { dim: '情绪稳定', axis: ['易被触发', '情绪稳定'] },
  socialTrust: { dim: '信任开放', axis: ['警觉怀疑', '信任开放'] },
  boundarySensitivity: { dim: '边界敏感', axis: ['边界宽松', '边界敏感'] },
  controlNeed: { dim: '控制需求', axis: ['随性放手', '需要掌控'] },
  approvalSensitivity: { dim: '评价敏感', axis: ['不在意评价', '在意评价'] },
  expressiveness: { dim: '表达外显', axis: ['克制含蓄', '外放表达'] },
  conflictStyle: { dim: '冲突直接', axis: ['回避缓冲', '正面直接'] },
  initiative: { dim: '主动性', axis: ['被动等待', '主动推动'] }
}

const GUARD_KEYS = Object.keys(GUARD_AXIS)

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function clampScore(value: unknown, fallback = 0): number {
  const next = Number(value)
  if (!Number.isFinite(next)) return fallback
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(next)))
}

/** 守护分值 -1000..1000 线性映射到刻度 0..1。 */
export function scoreToPosition(score: number): number {
  const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Number(score) || 0))
  return Math.round(((clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 1000) / 1000
}

function clampText(value: unknown, max = MAX_TEXT_CHARS): string {
  return toText(value).slice(0, max)
}

function findKernelBaseline(kernel: PersonalityKernel | null | undefined, key: string): number | null {
  if (!kernel || !Array.isArray(kernel.guardDimensions)) return null
  const matched = kernel.guardDimensions.find((dim) => toText(dim.key) === key)
  return matched ? clampScore(matched.baseline, 0) : null
}

function normalizeEvidence(value: unknown): PersonalityCalibrationEvidence[] {
  const source = Array.isArray(value) ? value : []
  const out: PersonalityCalibrationEvidence[] = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = clampText(record.text)
    if (!text) continue
    const rawKind = toText(record.kind).toLowerCase()
    const kind: PersonalityCalibrationEvidence['kind'] = rawKind === 'neg' ? 'neg' : rawKind === 'quiz' ? 'quiz' : 'pos'
    const sampleId = toText(record.sampleId ?? record.sample_id) || undefined
    out.push({ kind, text, sampleId })
    if (out.length >= MAX_EVIDENCE) break
  }
  return out
}

function normalizeStatus(value: unknown): PersonalityCalibrationStatus {
  const text = toText(value).toLowerCase()
  if (text === 'keep' || text === '保留') return 'keep'
  if (text === 'new' || text === '新增') return 'new'
  return 'adjust'
}

function slugifyDim(dim: string, index: number): string {
  const raw = toText(dim).replace(/[^a-zA-Z0-9一-龥_-]/g, '').slice(0, 24)
  return raw ? `custom_${raw}_${index + 1}` : `custom_${index + 1}`
}

function stripCodeFence(raw: string): string {
  const text = toText(raw)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenced ? toText(fenced[1]) : text
}

function parseCalibrationPayload(raw: string): { traits: Array<Record<string, unknown>>; revisedPersonality: string } | null {
  const text = stripCodeFence(raw)
  if (!text) return null
  const candidates: string[] = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const traits = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.traits) ? parsed.traits : null
      if (Array.isArray(traits)) {
        const revisedPersonality = Array.isArray(parsed)
          ? ''
          : toText(parsed?.revisedPersonality ?? parsed?.revised_personality)
        return { traits: traits as Array<Record<string, unknown>>, revisedPersonality }
      }
    } catch {
      // 试下一个候选
    }
  }
  return null
}

/** 把模型输出归一为可渲染的维度卡 + 整段修改后性格（健壮解析，不抛异常）。 */
export function normalizePersonalityCalibrationOutput(
  rawOutput: unknown,
  input: { kernel?: PersonalityKernel | null }
): PersonalityCalibrationResult {
  const rawText = toText(rawOutput)
  const payload = parseCalibrationPayload(rawText)
  if (!payload) {
    return {
      status: 'failed',
      reason: '模型输出不是合法的性格校准 JSON。',
      traits: [],
      revisedPersonality: '',
      summary: { adjust: 0, new: 0, keep: 0 },
      rawOutput: rawText
    }
  }

  const seenIds = new Set<string>()
  const traits: PersonalityCalibrationTrait[] = []
  payload.traits.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const rawKey = toText(record.dimensionKey ?? record.dimension_key)
    const knownKey = GUARD_KEYS.includes(rawKey) ? rawKey : ''
    const status = normalizeStatus(record.status)

    const dim = knownKey ? GUARD_AXIS[knownKey].dim : clampText(record.dim ?? record.dimension, 40) || '未命名维度'
    let axisLabels: [string, string] = knownKey ? GUARD_AXIS[knownKey].axis : ['偏弱', '偏强']
    const rawAxis = record.axisLabels ?? record.axis_labels
    if (Array.isArray(rawAxis) && rawAxis.length === 2) {
      const low = clampText(rawAxis[0], 20)
      const high = clampText(rawAxis[1], 20)
      if (low && high) axisLabels = [low, high]
    }

    const baseline = knownKey ? findKernelBaseline(input.kernel, knownKey) : null
    const oldPos = status === 'new' ? null : baseline != null ? scoreToPosition(baseline) : null
    const hasNewScore = record.newScore != null || record.new_score != null
    const newPos = hasNewScore
      ? scoreToPosition(clampScore(record.newScore ?? record.new_score, baseline ?? 0))
      : oldPos != null
        ? oldPos
        : 0.5

    const id = knownKey || slugifyDim(dim, index)
    if (seenIds.has(id)) return
    seenIds.add(id)

    traits.push({
      id,
      dimensionKey: knownKey || 'custom',
      dim,
      status,
      axisLabels,
      oldPos: status === 'new' ? null : oldPos,
      newPos,
      before: status === 'new' ? '' : clampText(record.before),
      after: clampText(record.after),
      conflict: Boolean(record.conflict),
      evidence: normalizeEvidence(record.evidence)
    })
  })

  const summary = {
    adjust: traits.filter((trait) => trait.status === 'adjust').length,
    new: traits.filter((trait) => trait.status === 'new').length,
    keep: traits.filter((trait) => trait.status === 'keep').length
  }
  return {
    status: traits.length ? 'ok' : 'failed',
    reason: traits.length ? '性格校准完成。' : '模型未给出任何维度建议。',
    traits,
    revisedPersonality: clampText(payload.revisedPersonality, MAX_REVISED_PERSONALITY_CHARS),
    summary,
    rawOutput: rawText
  }
}

export function buildPersonalityCalibrationPrompt(input: {
  characterName?: string
  personalityText: string
  samples: PersonalityCalibrationSample[]
  kernel?: PersonalityKernel | null
}): string {
  const samples = (input.samples || []).slice(0, MAX_SAMPLES)
  const personalityText = clampText(input.personalityText, MAX_PERSONALITY_CHARS) || '（角色当前没有填写性格正文）'

  const kernelText = input.kernel && Array.isArray(input.kernel.guardDimensions) && input.kernel.guardDimensions.length
    ? input.kernel.guardDimensions
        .map((dim) => {
          const meta = GUARD_AXIS[toText(dim.key)]
          const dimName = meta ? meta.dim : toText(dim.key)
          return `- ${toText(dim.key)}（${dimName}）：当前基线 ${clampScore(dim.baseline, 0)}（区间 ${clampScore(dim.lowerBound, -1000)}~${clampScore(dim.upperBound, 1000)}）`
        })
        .join('\n')
    : '（暂无已解析内核维度，可对 8 维守护给出建议基线）'

  const sampleText = samples.length
    ? samples
        .map((sample, index) => {
          const rejected = (sample.rejectedPlans || []).map((plan) => clampText(plan, 160)).filter(Boolean)
          const lines = [
            `${index + 1}. [样本ID ${toText(sample.id)} ｜ 维度 ${toText(sample.dimension) || '未分维度'}${sample.polarity ? ` ｜ ${sample.polarity === 'neg' ? '会话反例' : '会话正例'}` : ''}]`,
            `   情境：${clampText(sample.situation, 200)}`,
            `   正例(更像角色)：${clampText(sample.chosenPlan, 200)}`
          ]
          if (rejected.length) lines.push(`   反例(不像角色)：${rejected.join(' / ')}`)
          return lines.join('\n')
        })
        .join('\n')
    : '（暂无已确认样本）'

  return [
    '你是琅嬛的角色性格校准模型。',
    '任务：以"已确认样本"为准，对照角色当前性格正文，判断角色性格是否与原性格正文产生了变化，并给出一份可直接覆盖原字段的完整「修改后性格正文」。',
    '判定原则：样本是用户亲手确认"哪个反应更像角色"的真值，优先级高于原性格正文；当样本与原性格正文冲突时，以样本为准修改，并把该维度标记为分歧。',
    '只看长期稳定性格，不要把单条样本里的一时情绪当成长期人格。',
    '修改后性格正文必须整体重写，不做追加式补丁，也不要沿着原文逐句修补。先把样本支持的稳定倾向重新融成一个自然、完整的人格画像，再保留仍然成立的原有核心。',
    '正文要短而有弹性：优先写少数能统摄多种行为的核心倾向，不穷举场景、条件、例外和边界，不把角色写成规则清单。只有确有必要时，才用一句话保留关系远近或压力状态带来的情境差异。',
    '',
    `角色名：${toText(input.characterName) || '未命名角色'}`,
    '',
    '角色当前性格正文：',
    personalityText,
    '',
    '当前性格内核 8 维守护（分值 -1000~1000，负=偏低端，正=偏高端）：',
    kernelText,
    '',
    '已确认样本：',
    sampleText,
    '',
    '输出要求：只输出 JSON，不要解释、不要代码块外的文字。结构如下：',
    '{',
    '  "traits":[{',
    '    "dimensionKey":"emotionalStability|socialTrust|boundarySensitivity|controlNeed|approvalSensitivity|expressiveness|conflictStyle|initiative|custom",',
    '    "dim":"中文维度名（dimensionKey 为 custom 时必填）",',
    '    "status":"adjust|new|keep",',
    '    "newScore":-1000到1000之间的整数（建议基线；status=keep 可省略）,',
    '    "axisLabels":["低端中文标签","高端中文标签"]（custom 必填，8维可省略）,',
    '    "before":"修改前现状（该维度在原性格正文里的体现；status=new 可留空）",',
    '    "after":"修改意见（一句人话，能直接给用户看）",',
    '    "conflict":true或false（是否与原性格正文分歧）,',
    '    "evidence":[{"kind":"pos|neg|quiz","text":"依据样本一句话","sampleId":"样本ID"}]',
    '  }],',
    '  "revisedPersonality":"整体重写后的完整性格正文"',
    '}',
    '',
    '约束：',
    '- 8 个守护维度都要给出一条 trait；与样本一致就用 status=keep。',
    '- 只有样本确实指向"原性格正文未覆盖的新倾向"时才用 status=new，并尽量给出 axisLabels 与 dim。',
    '- 每条 trait 的 evidence 至少 1 条、最多 4 条，必须引用上面真实出现过的样本ID。',
    '- after 与 revisedPersonality 用中文人话，不要写内部字段名、英文技术名或分数。',
    `- revisedPersonality 必须给出完整可用的短正文，不能为空、不能只写"无变化"，不得超过 ${MAX_REVISED_PERSONALITY_CHARS} 个字符。`,
    '- 不要用“当……时就……，除非……”连续堆边界；不要列超过 6 个并列性格标签；不要写成操作手册。'
  ].join('\n')
}

export function buildPersonalityCalibrationAiOptions(agentConfig?: Partial<AgentModelConfig> | null): Record<string, unknown> {
  return {
    ...buildTaskModelAiOptions(agentConfig || null, 'personalityCalibration', { maxTokens: 4096, temperature: 0.3, thinking: 'disabled' }),
    stream: false,
    feature: 'agent',
    logLabel: 'personality-calibration',
    usageLabel: '性格校准对照',
    placeLabel: '性格校准',
    placeType: 'other',
    registerAbortController: false
  }
}

export async function runPersonalityCalibration(input: RunPersonalityCalibrationInput): Promise<PersonalityCalibrationResult> {
  const samples = (input.samples || []).filter((sample) => toText(sample?.chosenPlan) || toText(sample?.situation))
  const empty = { traits: [] as PersonalityCalibrationTrait[], revisedPersonality: '', summary: { adjust: 0, new: 0, keep: 0 } }
  if (!samples.length) {
    return { status: 'skipped', reason: '还没有已确认样本，先在「选择」步确认样本。', ...empty }
  }
  if (typeof input.callAI !== 'function') {
    return { status: 'failed', reason: '缺少模型调用入口。', ...empty }
  }
  const prompt = buildPersonalityCalibrationPrompt({
    characterName: input.characterName,
    personalityText: input.personalityText || '',
    samples,
    kernel: input.kernel
  })
  let output: string | null
  try {
    output = await input.callAI([{ role: 'user', content: prompt }], buildPersonalityCalibrationAiOptions(input.agentConfig))
  } catch (error) {
    return { status: 'failed', reason: `性格校准调用失败：${error instanceof Error ? error.message : String(error)}`, ...empty }
  }
  const text = toText(output)
  if (/^\[API调用失败:/u.test(text)) {
    return { status: 'failed', reason: text, ...empty, rawOutput: text }
  }
  return normalizePersonalityCalibrationOutput(text, { kernel: input.kernel })
}
