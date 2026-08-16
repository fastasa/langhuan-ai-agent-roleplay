/**
 * 星依总纲装载器。
 *
 * 人工维护且每轮收到的正文唯一源是 `docs/agents/星依/通用知识.md`。
 * 本模块只清理维护元数据并注入代码真值占位符。
 */

import xingyiCommonKnowledgeMarkdown from '../../docs/agents/星依/通用知识.md?raw'
import { TOOL_CALL_REALITY_RULE } from './agentProtocols/sharedRules'

export const XINGYI_AGENT_NAME = 'XingyiAgent'

function stripAgentMarkdownMetadata(raw: string): string {
  const normalized = String(raw || '').replace(/\r\n?/g, '\n').trim()
  const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '')
  return withoutFrontmatter
    .split('\n')
    .filter((line) => !/^#\s+/.test(line) && !/^>\s*/.test(line))
    .join('\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function buildXingyiCharter(): string {
  const body = stripAgentMarkdownMetadata(xingyiCommonKnowledgeMarkdown)
  const marker = '{{TOOL_CALL_REALITY_RULE}}'
  if (!body.includes(marker)) throw new Error(`星依通用知识缺少 ${marker} 占位符`)
  return body.replace(marker, TOOL_CALL_REALITY_RULE)
}

export const XINGYI_CHARTER = buildXingyiCharter()
