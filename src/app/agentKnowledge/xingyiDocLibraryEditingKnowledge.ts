import xingyiDocLibraryEditingMarkdown from '../../../docs/agents/星依/skills/doc-library-editing/SKILL.md?raw'

function normalizeMarkdown(raw: string): string {
  return String(raw || '').replace(/\r\n?/g, '\n').trim()
}

/** 星依文档库编辑 Skill 的整篇按需正文；Markdown 是唯一人工真值。 */
export function buildXingyiDocLibraryEditingSkillBody(): string {
  const normalized = normalizeMarkdown(xingyiDocLibraryEditingMarkdown)
  const body = normalized.replace(/^---\n[\s\S]*?\n---\n*/u, '').trim()
  return body
}
