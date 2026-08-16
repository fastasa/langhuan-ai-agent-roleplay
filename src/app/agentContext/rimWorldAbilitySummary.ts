import type { RimWorldPawnSnapshotV1 } from '../../../shared/rimworldBridge'

type Skill = RimWorldPawnSnapshotV1['skills'][number]

type AbilityTier = {
  rank: number
  short: string
  boundary: string
}

const ABILITY_TIERS: Array<{ max: number; value: AbilityTier }> = [
  { max: 3, value: { rank: 0, short: '还很生疏', boundary: '只适合谈最基础的做法，复杂情况应明确需要请教' } },
  { max: 7, value: { rank: 1, short: '能独立完成基础工作', boundary: '常见任务可以上手，复杂或高风险判断仍应谨慎' } },
  { max: 11, value: { rank: 2, short: '已经熟练', boundary: '可以说明常见做法，但不应把自己说成专家' } },
  { max: 15, value: { rank: 3, short: '是明显强项', boundary: '可以有把握地讨论常见专业判断，罕见细节仍需查证' } },
  { max: 19, value: { rank: 4, short: '达到专精', boundary: '可以处理较复杂判断，但未知配方和当前现场细节仍不能猜' } },
  { max: 20, value: { rank: 5, short: '处于顶尖水平', boundary: '可以自信讨论复杂经验，但共同资料没有给出的精确事实仍需查证' } }
]

function tier(level: number): AbilityTier {
  const safe = Math.max(0, Math.min(20, Math.trunc(Number(level) || 0)))
  return ABILITY_TIERS.find((item) => safe <= item.max)?.value || ABILITY_TIERS[ABILITY_TIERS.length - 1].value
}

function passionText(value: Skill['passion']): string {
  if (value === 'major') return '，而且对此非常感兴趣，通常愿意主动投入和继续学习'
  if (value === 'minor') return '，而且对此有兴趣，学习投入感较强'
  return ''
}

function normalizedRef(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase()
}

export function shouldExposeExactRimWorldSkillLevels(userMessage: string): boolean {
  const message = String(userMessage || '').replace(/\s+/g, ' ').trim()
  if (!message) return false
  return /(?:多少|几)\s*(?:点|级)|(?:技能|能力).{0,8}(?:多少|几|点数|等级|级别|数值)|(?:多少|几).{0,8}(?:技能|能力)|点数|精确(?:等级|数值)|具体(?:等级|数值)|面板(?:等级|数值)|\b(?:skill\s*)?(?:levels?|points?|stats?)\b/i.test(message)
}

export function buildRimWorldAbilitySummary(
  snapshot: RimWorldPawnSnapshotV1,
  options: { userMessage?: string; maxSkills?: number; maxWorkTypes?: number } = {}
): string[] {
  const includeExact = shouldExposeExactRimWorldSkillLevels(options.userMessage || '')
  const maxSkills = Math.max(1, Math.min(32, Math.trunc(options.maxSkills ?? 12)))
  const maxWorkTypes = Math.max(1, Math.min(24, Math.trunc(options.maxWorkTypes ?? 8)))
  const sortedSkills = snapshot.skills
    .slice()
    .sort((left, right) => right.level - left.level || right.passion.localeCompare(left.passion) || left.label.localeCompare(right.label))
  const skillIndex = new Map(sortedSkills.map((skill) => [normalizedRef(skill.defName), skill]))
  const skillParts = sortedSkills.slice(0, maxSkills).map((skill) => {
    const ability = tier(skill.level)
    const exact = includeExact ? `（${skill.level}级）` : ''
    return `${skill.label}${exact}：${ability.short}${passionText(skill.passion)}；${ability.boundary}`
  })

  const workParts = snapshot.workTypes
    .filter((work) => !work.disabled)
    .map((work) => {
      const related = work.relevantSkills.map((ref) => skillIndex.get(normalizedRef(ref))).filter(Boolean) as Skill[]
      if (!related.length) return null
      const average = related.reduce((sum, skill) => sum + skill.level, 0) / related.length
      const ability = tier(average)
      const labels = [...new Set(related.map((skill) => skill.label))]
      const passionBoost = related.reduce((sum, skill) => sum + (skill.passion === 'major' ? 2 : skill.passion === 'minor' ? 1 : 0), 0)
      return {
        score: ability.rank * 10 + passionBoost,
        label: `${work.label}（主要依靠${labels.join('、')}，目前${ability.short}）`
      }
    })
    .filter((item): item is { score: number; label: string } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, maxWorkTypes)
    .map((item) => item.label)

  const disabled = snapshot.workTypes
    .filter((work) => work.disabled)
    .map((work) => work.label)
    .filter(Boolean)
    .slice(0, 16)

  return [
    skillParts.length ? `你对自己能力的认识：${skillParts.join('；')}。` : '',
    workParts.length ? `按当前相关能力，你较适合的工作方向：${workParts.join('、')}。这只是能力判断，不代表工作已经被安排或完成。` : '',
    disabled.length ? `你当前不能承担的工作：${disabled.join('、')}。这是本轮游戏事实；即使相关技能较高，也必须以这项限制为准。` : ''
  ].filter(Boolean)
}
