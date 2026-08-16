import personalityQuestionAuthorKnowledgeMarkdown from '../../../docs/agents/设问/通用知识.md?raw'
import { renderPersonalityQuestionnaireDesignProtocol } from '../../../shared/personalityQuestionnaireDesign'

/** 设问常驻知识唯一入口：职责边界 + 问卷设计协议同源正文。 */
export function buildPersonalityQuestionAuthorKnowledgeBlock(): string {
  const raw = typeof personalityQuestionAuthorKnowledgeMarkdown === 'string'
    ? personalityQuestionAuthorKnowledgeMarkdown.trim()
    : ''
  const body = raw
    .split('\n')
    .filter((line) => !line.startsWith('# ') && !line.startsWith('> '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return [
    body ? `【设问工作规范】\n${body}` : '',
    `【人格问卷情境设计协议】\n${renderPersonalityQuestionnaireDesignProtocol()}`
  ].filter(Boolean).join('\n\n')
}
