import playableWorldBuilderMarkdown from '../../../docs/agents/星依/skills/playable-world-builder/SKILL.md?raw'

/** 项目 Skill Markdown 是唯一人工真值；运行时只去掉 frontmatter 后按需装载正文。 */
export function buildXingyiPlayableWorldBuilderSkillBody(): string {
  return String(playableWorldBuilderMarkdown || '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/^---\n[\s\S]*?\n---\n*/u, '')
    .trim()
}
