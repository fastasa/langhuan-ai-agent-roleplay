import jianxinKnowledgeMarkdown from '../../../docs/agents/鉴心/通用知识.md?raw'

/** 鉴心稳定知识的唯一运行时入口；禁止扫描或拼接其它 Agent 文档。 */
export function buildJianxinKnowledgeBlock(): string {
  const raw = typeof jianxinKnowledgeMarkdown === 'string'
    ? jianxinKnowledgeMarkdown.trim()
    : ''
  if (!raw) return ''
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('# ') && !line.startsWith('> '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return body ? `【鉴心工作规范】\n${body}` : ''
}
