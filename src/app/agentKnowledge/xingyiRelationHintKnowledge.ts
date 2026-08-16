import xingyiRelationHintMarkdown from '../../../docs/agents/星依/skills/relation-hint-authoring/SKILL.md?raw'
import { getPredicateDictionaryEntries } from '../relationPredicateDictionary'

const PREDICATE_DICTIONARY_MARKER = '{{PREDICATE_DICTIONARY}}'

function normalizeMarkdown(raw: string): string {
  return String(raw || '').replace(/\r\n?/g, '\n').trim()
}

function renderPredicateDictionary(): string {
  const lines = [
    '### 运行时合法谓词附录',
    '',
    '> 本节由现役谓词字典自动生成，不要在 Skill 正文中手抄第二份。',
    ''
  ]
  getPredicateDictionaryEntries().forEach((entry) => {
    const directionLabel = entry.direction === 'bidirectional' ? '双向' : '有向'
    lines.push(`- **${entry.label}**（${directionLabel}）`)
    lines.push(`  - 正向词：${entry.forwardTerms.join('、')}`)
    lines.push(`  - 反向词：${entry.reverseTerms.join('、')}`)
  })
  return lines.join('\n')
}

/** 星依关系提示 Skill：人工流程来自 Markdown，合法谓词附录直接由代码真值生成。 */
export function buildXingyiRelationHintSkillBody(): string {
  const normalized = normalizeMarkdown(xingyiRelationHintMarkdown)
  const body = normalized.replace(/^---\n[\s\S]*?\n---\n*/u, '').trim()
  return body.replace(PREDICATE_DICTIONARY_MARKER, renderPredicateDictionary())
}
