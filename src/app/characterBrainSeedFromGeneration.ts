/**
 * 生成角色时的大脑种子（2026-07-08）：让「按描述生成角色」在核心之外同步产出灵魂节点与轨迹初始内容。
 *
 * 边界与真值：
 * - 灵魂 = brainCognitionNodes（稳定认知，不是流水账），经 createCharacterBrainSoulTreeNode 落正式真值。
 * - 轨迹 = brainTrajectoryMeta.birthDate + 稀疏日桠（批量建日自动补年枝/月枝）+ 日桠下 eventLeaf 事件单位。
 *   稀疏日桠是模型本来就允许的（buildTraceDayCreatePlan 只校验 ≥出生日/不重复/日历合法，无连续性要求）。
 * - 本模块只产出 changes（一次性合并落库），不直接写 store；直接落正式真值、不走 pendingReview（用户拍板）。
 */
import type { Character } from '../types'
import type { CharacterBrainTraceBatchCreateItem } from './characterBrainTreeModel'
import {
  createCharacterBrainSoulTreeNode,
  createCharacterBrainTraceBatchTreeNodes,
  createCharacterBrainTraceEventTreeNode
} from './characterBrainTreeModel'
import {
  buildCharacterBrainTrajectoryMetaChange,
  readCharacterBrainCognitionNodes,
  readCharacterBrainTraceNodes,
  readCharacterBrainTrajectoryMeta
} from './characterBrain'
import { encodeTrajectoryImportIdSegment } from './trajectoryMarkdownApply'

export type CharacterBrainSeedSoulNode = { title: string; summary: string }
export type CharacterBrainSeedExperience = { date: string; title: string; content: string }

export type CharacterBrainSeed = {
  birthDate: string
  soulNodes: CharacterBrainSeedSoulNode[]
  experiences: CharacterBrainSeedExperience[]
}

export type CharacterBrainSeedChangesResult = {
  changes: Record<string, unknown>
  soulCount: number
  dayCount: number
  eventCount: number
}

const BIRTH_SECTION = '出生日期'
const SOUL_SECTION = '灵魂'
const EXPERIENCE_SECTION = '关键经历'

/** 拼进生成提示词的补充段落要求（三分区概念说明 + 输出模板）。 */
export function buildCharacterBrainSeedPromptSection(): string {
  return [
    '除核心字段外，必须在同一份 Markdown 末尾追加三个补充单位：出生日期、灵魂、关键经历。',
    '先理解琅嬛角色大脑的三分区，各写各的，不要互相混装：',
    '- 核心：角色的静态设定书（他是谁、什么样），即上方核心字段。',
    '- 灵魂：角色的稳定认知库——他知道的知识、相信的观念、对人和世界的看法、长期习惯与偏好。灵魂不是流水账，禁止写"某天发生了什么"。',
    '- 轨迹：角色的人生时间线——带日期的具体经历。具体事件写进关键经历，不要塞进灵魂。',
    '',
    `## ${BIRTH_SECTION}`,
    '',
    '只写一行 YYYY-MM-DD（如 0996-03-12；年份 1~4 位，可用架空纪年，必须与年龄、背景自洽）。',
    '',
    `## ${SOUL_SECTION}`,
    '',
    '列出 5~10 个灵魂节点，覆盖知识、观念、关系看法、习惯偏好等不同侧面。每个节点格式：',
    '### 节点标题',
    '一段摘要正文（该认知的具体内容，2~4 句）。',
    '',
    `## ${EXPERIENCE_SECTION}`,
    '',
    '列出 3~8 条关键人生经历，按时间升序。每条格式：',
    '### YYYY-MM-DD 经历标题',
    '一段正文（当时发生了什么、对角色的影响，2~5 句）。',
    '所有经历日期不得早于出生日期，且要与年龄、背景自洽。'
  ].join('\n')
}

function sliceSections(markdown: string): Map<string, string> {
  const source = String(markdown || '')
  const matches = [...source.matchAll(/^##\s+(.+?)\s*$/gm)]
  const sections = new Map<string, string>()
  matches.forEach((match, index) => {
    const label = String(match[1] || '').trim()
    const start = (match.index || 0) + match[0].length
    const end = matches[index + 1]?.index ?? source.length
    sections.set(label, source.slice(start, end).trim())
  })
  return sections
}

function normalizeSeedDate(raw: string): string {
  const match = String(raw || '').match(/(\d{1,4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/)
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function splitSubBlocks(sectionBody: string): Array<{ heading: string; body: string }> {
  const source = String(sectionBody || '')
  const matches = [...source.matchAll(/^###\s+(.+?)\s*$/gm)]
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length
    const end = matches[index + 1]?.index ?? source.length
    return { heading: String(match[1] || '').trim(), body: source.slice(start, end).trim() }
  })
}

/** 解析生成输出里的种子段落；缺段/缺日期/经历早于出生日都抛错（错误信息喂给修正重跑）。 */
export function parseCharacterBrainSeedMarkdown(markdown: string): CharacterBrainSeed {
  const sections = sliceSections(markdown)

  const birthDate = normalizeSeedDate(sections.get(BIRTH_SECTION) || '')
  if (!birthDate) throw new Error(`缺少「## ${BIRTH_SECTION}」单位或日期不是合法的 YYYY-MM-DD`)

  const soulNodes = splitSubBlocks(sections.get(SOUL_SECTION) || '')
    .map((block) => ({ title: block.heading, summary: block.body }))
    .filter((node) => node.title)
  if (!soulNodes.length) throw new Error(`缺少「## ${SOUL_SECTION}」单位或其中没有「### 标题」灵魂节点`)

  const invalidExperiences: string[] = []
  const experiences = splitSubBlocks(sections.get(EXPERIENCE_SECTION) || '')
    .map((block) => {
      const date = normalizeSeedDate(block.heading)
      const title = block.heading.replace(/^\s*\d{1,4}\s*-\s*\d{1,2}\s*-\s*\d{1,2}\s*/u, '').trim()
      if (!date || !title) {
        invalidExperiences.push(`「${block.heading}」缺少日期或标题（格式应为「### YYYY-MM-DD 经历标题」）`)
        return null
      }
      if (date < birthDate) {
        invalidExperiences.push(`「${block.heading}」日期早于出生日期 ${birthDate}`)
        return null
      }
      return { date, title, content: block.body }
    })
    .filter((item): item is CharacterBrainSeedExperience => item !== null)
  if (invalidExperiences.length) throw new Error(`关键经历不合法：${invalidExperiences.join('；')}`)
  if (!experiences.length) throw new Error(`缺少「## ${EXPERIENCE_SECTION}」单位或其中没有合法经历条目`)

  return { birthDate, soulNodes, experiences }
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let id = baseId
  let index = 1
  while (usedIds.has(id)) {
    id = `${baseId}_${index}`
    index += 1
  }
  usedIds.add(id)
  return id
}

/**
 * 把种子组装成一次性的角色变更（调用方 charStore.updateCharacter 单次落库）。
 * 顺序：出生日期进轨迹 meta → 批量建稀疏日桠（含出生日，自动补年/月枝）→ 日桠下建事件 → 建灵魂节点。
 * 每步命令读的是叠加了前序 changes 的工作副本，最终 changes 是各真值字段的完整终态。
 */
export function buildCharacterBrainSeedChanges(
  character: Character,
  seed: CharacterBrainSeed,
  now: string
): CharacterBrainSeedChangesResult {
  const working: Record<string, unknown> = { ...(character as unknown as Record<string, unknown>) }
  const merged: Record<string, unknown> = {}
  const apply = (changes: Record<string, unknown>) => {
    Object.assign(merged, changes)
    Object.assign(working, changes)
  }
  const asCharacter = () => working as unknown as Character

  // 1) 出生日期写进轨迹 meta（日桠创建的硬前置）
  const meta = readCharacterBrainTrajectoryMeta(asCharacter())
  apply(buildCharacterBrainTrajectoryMetaChange({ ...meta, birthDate: seed.birthDate }) as unknown as Record<string, unknown>)

  // 2) 批量建日桠：出生日 + 各经历日期（去重；稀疏合法，年枝/月枝自动补齐）
  const dates = [...new Set([seed.birthDate, ...seed.experiences.map((item) => item.date)])]
  const batch = createCharacterBrainTraceBatchTreeNodes(asCharacter(), { granularity: 'day', dates, now })
  if (!batch.ok) throw new Error(`创建轨迹日桠失败：${batch.message}`)
  apply(batch.changes as Record<string, unknown>)
  const dayIdByDate = new Map(
    [...batch.createdItems, ...batch.skippedItems]
      .filter((item): item is Extract<CharacterBrainTraceBatchCreateItem, { kind: 'day' }> => item.kind === 'day')
      .map((item) => [item.date, item.nodeId])
  )

  // 3) 经历落成日桠下的事件单位（id 约定与轨迹 Markdown 导入器同族：event_日期_标题段）
  let eventCount = 0
  for (const experience of seed.experiences) {
    const parentId = dayIdByDate.get(experience.date)
    if (!parentId) continue // 日期被日历规则过滤（解析层已挡，防御性跳过）
    const usedTraceIds = new Set(readCharacterBrainTraceNodes(asCharacter()).map((node) => node.id))
    const id = makeUniqueId(
      `brain:trajectory:node:event_${experience.date.replace(/-/g, '_')}_${encodeTrajectoryImportIdSegment(experience.title)}`,
      usedTraceIds
    )
    const changes = createCharacterBrainTraceEventTreeNode(asCharacter(), {
      id,
      title: experience.title,
      summary: '',
      content: experience.content,
      parentId,
      tags: ['经历'],
      now
    })
    if (Object.keys(changes).length) {
      apply(changes)
      eventCount += 1
    }
  }

  // 4) 灵魂节点（平铺挂灵魂根，kind=private）
  const usedSoulIds = new Set(readCharacterBrainCognitionNodes(asCharacter()).map((node) => node.id))
  for (const soulNode of seed.soulNodes) {
    const id = makeUniqueId(`brain:cognition:node:seed_${encodeTrajectoryImportIdSegment(soulNode.title)}`, usedSoulIds)
    apply(createCharacterBrainSoulTreeNode(asCharacter(), {
      id,
      title: soulNode.title,
      summary: soulNode.summary,
      kind: 'private',
      now
    }))
  }

  return {
    changes: merged,
    soulCount: seed.soulNodes.length,
    dayCount: dates.length,
    eventCount
  }
}
