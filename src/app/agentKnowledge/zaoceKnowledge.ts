import zaoceBasicAuthoringMarkdown from '../../../docs/agents/造册/通用知识.md?raw'
import zaoceAdvancedAuthoringMarkdown from '../../../docs/agents/造册/skills/advanced-authoring/SKILL.md?raw'

/**
 * 造册知识分层：Markdown 是人工知识正文的唯一真值，本模块只做确定性装载与 selector 解析。
 *
 * 运行时先由 manifest 暴露 `zaoce.advanced-authoring` 的目录元数据，只有显式命中
 * selector 后才读取对应小节；未知 selector 返回空，由统一 loader 留下可审计失败。
 */

export const ZAOCE_ADVANCED_AUTHORING_SELECTORS = [
  'advanced_template',
  'cross_panel_reference',
  'rich_media_scaffold',
  'visual_carrier_selection',
  'categorical_chart',
  'resource_dashboard'
] as const

export type ZaoceAdvancedAuthoringSelector = (typeof ZAOCE_ADVANCED_AUTHORING_SELECTORS)[number]

function normalizeMarkdown(raw: string): string {
  return String(raw || '').replace(/\r\n?/g, '\n').trim()
}

function readDocumentTitle(raw: string): string {
  return normalizeMarkdown(raw).match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
}

function stripDocumentMetadata(raw: string): string {
  return normalizeMarkdown(raw)
    .split('\n')
    .filter((line) => !/^#\s+/.test(line) && !/^>\s*/.test(line))
    .join('\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

type AdvancedSection = {
  selector: string
  title: string
  body: string
}

function parseAdvancedSections(raw: string): AdvancedSection[] {
  const lines = normalizeMarkdown(raw).split('\n')
  const sections: AdvancedSection[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+([a-z0-9_]+)\s*[｜|]\s*(.+)$/)
    if (!heading) continue
    let end = index + 1
    while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1
    const body = lines.slice(index + 1, end).join('\n').trim()
    sections.push({ selector: heading[1], title: heading[2].trim(), body })
    index = end - 1
  }
  return sections
}

/** 造册每轮都需要的基础制作规则；仅供 resident Skill 装入层 0。 */
export function buildZaoceBasicAuthoringSkillBody(): string {
  const title = readDocumentTitle(zaoceBasicAuthoringMarkdown)
  const body = stripDocumentMetadata(zaoceBasicAuthoringMarkdown)
  if (!title || !body) return ''
  return `【${title}】\n${body}`
}

/** 空值或未知 selector 返回空，由统一 loader 转成可审计失败。 */
export function loadZaoceAdvancedAuthoringSkillBody(selector = ''): string {
  const requested = String(selector || '').trim()
  if (!requested) return ''
  const section = parseAdvancedSections(zaoceAdvancedAuthoringMarkdown)
    .find((item) => item.selector === requested)
  if (!section?.body) return ''
  return `【造册进阶：${section.title}】\n${section.body}`
}
