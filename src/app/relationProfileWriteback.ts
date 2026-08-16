import type {
  CharacterBrainRelationProfileContent,
  CharacterBrainRelationProfileFact,
  CharacterBrainRelationProfileTrait
} from '../types/characterBrain'
import { scoreProjectionWritebackTextSimilarity } from './personalityProjectionWriteback'

// 关系画像沉淀：从消息投影提炼"角色对某对象的关系认知"，与投影→轨迹独立并行。
// R2 首版只做"角色对用户"(subjectType='user')；角色对角色留待 R3。
// 批 F（2026-06-10）：implicit 特质写侧语义去重 + 读侧时间衰减；explicit 硬事实按 key 覆盖、不衰减。

export type RelationProfilePromptMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type RelationProfilePromptTrace = {
  messages: RelationProfilePromptMessage[]
  finalPrompt: string
  promptBlocks: Array<{ role: 'system' | 'user' | 'assistant'; title: string; content: string }>
}

export type RelationProfileSource = {
  id: string
  messageId: number
  text: string
  time?: string
  location?: string
}

// 模型提炼出的关系认知增量：explicit 显式事实(键值)，implicit 隐式特质(自然语言)
export type RelationProfileExtract = {
  explicit: Array<{ key: string; value: string }>
  implicit: Array<{ text: string }>
}

const MAX_EXPLICIT_HISTORY = 10
const MAX_IMPLICIT_TRAITS = 40
// 语义去重阈值与「投影写轨迹」本地相似度直接合并阈值保持同一真值（联动：workspaceChatAppService 事件匹配 >= 0.78 直并）
const SIMILAR_TRAIT_MERGE_THRESHOLD = 0.78
// 时间衰减（只作用于 implicit 召回注入，不删存储）：14 天内为新鲜印象，14~45 天标记“较早印象”，超过 45 天退场
const TRAIT_FRESH_DAYS = 14
const TRAIT_EXIT_DAYS = 45
const MAX_RECALL_IMPLICIT_TRAITS = 12
const DAY_MS = 24 * 60 * 60 * 1000

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function parseJsonValue(value: unknown): any {
  if (value && typeof value === 'object') return value
  const text = toText(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  const source = objectStart >= 0 && objectEnd > objectStart ? text.slice(objectStart, objectEnd + 1) : text
  return JSON.parse(source)
}

function buildTrace(
  messages: RelationProfilePromptMessage[],
  promptBlocks: RelationProfilePromptTrace['promptBlocks']
): RelationProfilePromptTrace {
  return {
    messages,
    finalPrompt: messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n'),
    promptBlocks
  }
}

function formatExistingProfile(profile: CharacterBrainRelationProfileContent | null): string {
  if (!profile || (!profile.explicit.length && !profile.implicit.length)) return '（暂无已有关系认知）'
  const explicit = profile.explicit.map((fact) => `- ${fact.key}：${fact.value}`).join('\n') || '（无）'
  const implicit = profile.implicit.map((trait) => `- ${trait.text}`).join('\n') || '（无）'
  return [`显式事实：\n${explicit}`, `隐式特质：\n${implicit}`].join('\n')
}

export function buildRelationProfileExtractPrompt(input: {
  characterName: string
  subjectName: string
  existingProfile: CharacterBrainRelationProfileContent | null
  sources: RelationProfileSource[]
}): RelationProfilePromptTrace {
  const sourceText = input.sources
    .map((item, index) => [
      `#${index + 1} ${item.id}`,
      item.time ? `时间：${item.time}` : '',
      item.location ? `地点：${item.location}` : '',
      `事实：${item.text}`
    ].filter(Boolean).join('\n'))
    .join('\n\n')
  const system = [
    `你负责从一批客观事实中，提炼角色「${input.characterName}」对「${input.subjectName}」的稳定关系认知。`,
    '只提炼稳定倾向、长期偏好、关系定性、称呼习惯、信任与态度变化；不要记流水账，不要写一次性事件细节。',
    '只依据给定事实，不补写没有发生的动机、心理结论或因果。',
    '没有可提炼的稳定认知时，explicit 和 implicit 都返回空数组。',
    '输出 JSON，不要解释。'
  ].join('\n')
  const user = [
    `角色：${input.characterName}`,
    `认知对象：${input.subjectName}`,
    '',
    '已有关系认知（用于判断是新增还是变化）：',
    formatExistingProfile(input.existingProfile),
    '',
    '本批客观事实：',
    sourceText || '无',
    '',
    '输出格式：',
    '{"explicit":[{"key":"称呼","value":"当前值"}],"implicit":[{"text":"一句自然语言特质"}]}',
    '',
    '规则：',
    '1. explicit 用于可明确取值的维度（如 称呼、关系定性、信任倾向）；同一维度只输出当前最新值。',
    '2. implicit 用于难以量化的偏好/习惯/态度，每条一句话。',
    '3. 只在确有稳定认知时输出，宁缺毋滥。'
  ].join('\n')
  return buildTrace([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], [
    { role: 'system', title: '投影写关系画像 · 提炼规则', content: system },
    { role: 'user', title: '投影写关系画像 · 提炼材料', content: user }
  ])
}

export function normalizeRelationProfileExtractOutput(output: unknown): RelationProfileExtract {
  const parsed = parseJsonValue(output)
  const explicitRaw = Array.isArray(parsed?.explicit) ? parsed.explicit : []
  const implicitRaw = Array.isArray(parsed?.implicit) ? parsed.implicit : []
  const explicit = explicitRaw
    .map((item: any) => ({ key: toText(item?.key).slice(0, 40), value: toText(item?.value).slice(0, 200) }))
    .filter((item: { key: string; value: string }) => item.key && item.value)
  const implicit = implicitRaw
    .map((item: any) => ({ text: toText(typeof item === 'string' ? item : item?.text).slice(0, 200) }))
    .filter((item: { text: string }) => item.text)
  return { explicit, implicit }
}

function parseTraitTime(value: string): number | null {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : null
}

// 比较两条特质谁更新：能解析时间戳按时间戳，否则退回字符串比较（兼容测试桩 t1/t2）
function isNewerTrait(left: CharacterBrainRelationProfileTrait, right: CharacterBrainRelationProfileTrait): boolean {
  const leftTs = parseTraitTime(left.updatedAt)
  const rightTs = parseTraitTime(right.updatedAt)
  if (leftTs !== null && rightTs !== null) return leftTs > rightTs
  return String(left.updatedAt || '') > String(right.updatedAt || '')
}

// implicit 语义去重：在已保留列表里找相似度达阈值的旧条目；命中返回其下标，未命中返回 -1
function findSimilarTraitIndex(kept: CharacterBrainRelationProfileTrait[], text: string): number {
  let bestIndex = -1
  let bestScore = 0
  for (let index = 0; index < kept.length; index += 1) {
    const score = scoreProjectionWritebackTextSimilarity(kept[index].text, text)
    if (score >= SIMILAR_TRAIT_MERGE_THRESHOLD && score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  }
  return bestIndex
}

// 把新提炼的关系认知合并进已有画像：explicit 按 key 更新并压历史快照、值变化标 conflict；
// implicit 语义去重——相似特质只刷新 updatedAt（保留旧文本，避免措辞抖动），并顺手清理存量近似重复。
export function mergeRelationProfileContent(
  existing: CharacterBrainRelationProfileContent | null,
  incoming: RelationProfileExtract,
  now: string
): CharacterBrainRelationProfileContent {
  const base: CharacterBrainRelationProfileContent = existing && Array.isArray(existing.explicit) && Array.isArray(existing.implicit)
    ? existing
    : { explicit: [], implicit: [] }
  const explicitMap = new Map<string, CharacterBrainRelationProfileFact>()
  base.explicit.forEach((fact) => { if (fact && fact.key) explicitMap.set(fact.key, fact) })
  for (const inc of incoming.explicit) {
    const key = toText(inc.key)
    const value = toText(inc.value)
    if (!key || !value) continue
    const prev = explicitMap.get(key)
    if (!prev) {
      explicitMap.set(key, { key, value, updatedAt: now })
    } else if (prev.value !== value) {
      // 值发生变化：保留历史快照并标记冲突，供人工确认"曾经怎么看 → 现在怎么看"
      explicitMap.set(key, {
        key,
        value,
        updatedAt: now,
        history: [...(prev.history || []), { value: prev.value, at: prev.updatedAt }].slice(-MAX_EXPLICIT_HISTORY),
        conflict: true
      })
    } else {
      explicitMap.set(key, { ...prev, updatedAt: now })
    }
  }
  // 先清理存量近似重复（历史上按文本精确去重漏掉的措辞变体）：相似组只保留更新的一条
  const implicit: CharacterBrainRelationProfileTrait[] = []
  for (const trait of base.implicit) {
    if (!trait || !toText(trait.text)) continue
    const similarIndex = findSimilarTraitIndex(implicit, trait.text)
    if (similarIndex < 0) {
      implicit.push({ ...trait })
    } else if (isNewerTrait(trait, implicit[similarIndex])) {
      implicit[similarIndex] = { ...trait }
    }
  }
  // 新增特质语义去重：命中相似旧条目只刷新 updatedAt（重复观察=该印象仍有效，供读侧衰减续命）
  for (const inc of incoming.implicit) {
    const text = toText(inc.text)
    if (!text) continue
    const similarIndex = findSimilarTraitIndex(implicit, text)
    if (similarIndex < 0) {
      implicit.push({ text, updatedAt: now })
    } else {
      implicit[similarIndex] = { ...implicit[similarIndex], updatedAt: now }
    }
  }
  return {
    explicit: [...explicitMap.values()],
    implicit: implicit.slice(-MAX_IMPLICIT_TRAITS)
  }
}

// implicit 按更新时间从新到旧排序；解析不出时间的条目排最后（视作最旧但不丢弃）
function sortTraitsByRecency(traits: CharacterBrainRelationProfileTrait[]): CharacterBrainRelationProfileTrait[] {
  return [...traits].sort((left, right) => (parseTraitTime(right.updatedAt) ?? Number.NEGATIVE_INFINITY) - (parseTraitTime(left.updatedAt) ?? Number.NEGATIVE_INFINITY))
}

// 关系画像节点的 summary（短摘要，供召回/展示用，不暴露完整 JSON）；特质取最近更新的两条
export function buildRelationProfileSummary(
  subjectName: string,
  content: CharacterBrainRelationProfileContent
): string {
  const facts = content.explicit.slice(0, 4).map((fact) => `${fact.key}:${fact.value}`).join('；')
  const traits = sortTraitsByRecency(content.implicit).slice(0, 2).map((trait) => trait.text).join('；')
  return [`对${subjectName}的认知`, facts, traits].filter(Boolean).join(' ｜ ').slice(0, 200)
}

// 关系画像进召回/提示词的可读文本（绝不把原始 JSON 塞进提示词）。标题由召回卡的 t 字段承担，这里只列事实与特质。
// 批 F 时间衰减只作用于 implicit：explicit 是按 key 覆盖的低基数硬事实，不衰减；
// implicit 超过 TRAIT_EXIT_DAYS 退场（仅退出召回注入，存储保留审计），FRESH~EXIT 之间标注“较早印象”，最多注入 MAX_RECALL_IMPLICIT_TRAITS 条。
export function formatRelationProfileForRecall(
  content: CharacterBrainRelationProfileContent,
  now: string | number | Date = Date.now()
): string {
  const nowTsRaw = now instanceof Date ? now.getTime() : Date.parse(String(now))
  const nowTs = Number.isFinite(nowTsRaw) ? nowTsRaw : (typeof now === 'number' ? now : Date.now())
  const lines: string[] = []
  content.explicit.forEach((fact) => {
    if (fact.key && fact.value) lines.push(`- ${fact.key}：${fact.value}${fact.conflict ? '（曾有变化，待确认）' : ''}`)
  })
  const traitLines: string[] = []
  for (const trait of sortTraitsByRecency(content.implicit)) {
    if (!trait.text) continue
    if (traitLines.length >= MAX_RECALL_IMPLICIT_TRAITS) break
    const traitTs = parseTraitTime(trait.updatedAt)
    const ageDays = traitTs === null ? null : (nowTs - traitTs) / DAY_MS
    if (ageDays !== null && ageDays > TRAIT_EXIT_DAYS) continue // 退场：过老印象不再进提示词
    // 解析不出时间的旧数据按“较早印象”处理，不直接丢
    const fading = ageDays === null || ageDays > TRAIT_FRESH_DAYS
    traitLines.push(`- ${trait.text}${fading ? '（较早印象）' : ''}`)
  }
  if (traitLines.length) {
    if (lines.length) lines.push('')
    lines.push(...traitLines)
  }
  return lines.join('\n')
}

export function parseRelationProfileContent(raw: unknown): CharacterBrainRelationProfileContent | null {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!parsed || typeof parsed !== 'object') return null
    const explicit = Array.isArray((parsed as any).explicit) ? (parsed as any).explicit : []
    const implicit = Array.isArray((parsed as any).implicit) ? (parsed as any).implicit : []
    return {
      explicit: explicit.filter((f: any) => f && toText(f.key) && toText(f.value)),
      implicit: implicit.filter((t: any) => t && toText(t.text))
    }
  } catch {
    return null
  }
}
