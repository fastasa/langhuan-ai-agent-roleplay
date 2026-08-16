/**
 * 星依知识库·运行时读取 + 目录/检索/精读三层渐进披露。
 *
 * 真值源文：docs/agents/星依/skills/knowledge-topics/references/*.md（用户可查改的 md）。
 * 各领域专题在同一运行时 Skill 的 references 下拆分，运行时合并后按 ### 小节检索。
 * 注入策略与提调不同：提调走「恒注入+关键词渐进披露」（tidiaoKnowledge.ts），星依本身是 toolsearch 型 loop，
 * 知识库做成三只读工具：listXingyiKnowledgeTopics 看目录、searchXingyiKnowledge 定位候选、
 * readXingyiKnowledgeTopic 按稳定 topicId 精读全文。模型拿不准功能用法/格式/报错处置时自己来查，
 * 不把整库或多篇全文塞进每轮 system/context。
 *
 * 联动标注：读取与小节切分逻辑与 tidiaoKnowledge.ts 属同款范式（各自自包含、不互相 import）；
 * 若后续统一知识库解析实现，两处要一起收。
 */

import type { ToolDefinition } from '../agentRuntime/toolRegistry'
import { matchToolsByQuery } from '../agentRuntime/toolRegistry'

// 运行时只扫描星依 knowledge-topics Skill 的 references；SKILL.md、通用知识和其它 Agent 文档均不会进入主题集合。
// 读不到（路径不符/测试环境异常）时退化为空，检索工具据空如实报「知识库不可用」。
const KNOWLEDGE_FILES = import.meta.glob('/docs/agents/星依/skills/knowledge-topics/references/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function loadXingyiKnowledgeRaw(): string {
  const entries = Object.entries(KNOWLEDGE_FILES)
    .filter(([path, content]) => path.includes('/docs/agents/星依/skills/knowledge-topics/references/') && path.endsWith('.md') && typeof content === 'string')
    // 路由规则优先，仅影响同分检索时的稳定顺序；真正相关性仍由关键词得分决定。
    .sort(([left], [right]) => {
      const priority = (path: string) => path.endsWith('/路由与知识补全.md') ? 0 : path.endsWith('/知识库.md') ? 1 : 2
      return priority(left) - priority(right) || left.localeCompare(right)
    })
  // 每个文件前加 ## 边界，确保 parseXingyiKnowledgeSections 会先收束上一个文件的最后一个 ###，
  // 不把下一文件的标题/前言粘进上一小节正文。
  return entries.map(([path, content]) => `## 来源：${path.split('/').pop()}\n\n${content}`).join('\n\n')
}

export interface XingyiKnowledgeSection {
  /** 稳定精读键：来源文件（不含 .md）::完整标题。 */
  topicId: string
  /** 源 Markdown 文件名，用于防止同名标题串源。 */
  source: string
  /** 小节标题行（含编号，如「2.2 编译页」）。 */
  title: string
  /** 小节全文（标题行+正文，到下一个 ###/## 为止）。 */
  content: string
}

const INLINE_SOURCE = '内联知识.md'

function buildTopicId(source: string, title: string): string {
  return `${String(source || INLINE_SOURCE).replace(/\.md$/i, '')}::${String(title || '').trim()}`
}

function makeSection(source: string, title: string, body: string[]): XingyiKnowledgeSection {
  return {
    topicId: buildTopicId(source, title),
    source,
    title,
    content: body.join('\n').trim()
  }
}

/** 把知识库源文切成 ### 小节列表（## 顶节行本身不含正文，跳过）。 */
export function parseXingyiKnowledgeSections(raw: string): XingyiKnowledgeSection[] {
  const lines = String(raw || '').split(/\r?\n/)
  const sections: XingyiKnowledgeSection[] = []
  let current: { title: string; body: string[] } | null = null
  let currentSource = INLINE_SOURCE
  for (const line of lines) {
    const sourceMatch = line.match(/^##\s+来源：(.+)$/)
    if (sourceMatch) {
      if (current) sections.push(makeSection(currentSource, current.title, current.body))
      current = null
      currentSource = sourceMatch[1].trim() || INLINE_SOURCE
      continue
    }
    const m = line.match(/^###\s+(.*)$/)
    if (m) {
      if (current) sections.push(makeSection(currentSource, current.title, current.body))
      current = { title: m[1].trim(), body: [line] }
      continue
    }
    if (/^##\s+/.test(line)) {
      if (current) sections.push(makeSection(currentSource, current.title, current.body))
      current = null
      continue
    }
    if (current) current.body.push(line)
  }
  if (current) sections.push(makeSection(currentSource, current.title, current.body))
  return sections
}

/** 关键词检索小节：topicId 作内部唯一键，避免不同文件同名标题被 find 第一项静默串源。 */
export function searchXingyiKnowledgeSections(
  query: string,
  raw = loadXingyiKnowledgeRaw()
): XingyiKnowledgeSection[] {
  const sections = parseXingyiKnowledgeSections(raw)
  if (!sections.length) return []
  const catalog = sections.map((section) => ({
    name: section.topicId,
    brief: `${section.title} ${section.source} ${section.content}`
  }))
  const hitTopicIds = matchToolsByQuery(catalog, query)
  return hitTopicIds
    .map((topicId) => sections.find((section) => section.topicId === topicId))
    .filter((section): section is XingyiKnowledgeSection => Boolean(section))
}

/**
 * 统一 Agent Skill loader 入口：只按准确 topicId 读取一个星依知识主题。
 * 不提供 topicId 时返回空串，调用方必须留下 `topic_selector_required` trace；禁止借此倾倒整库。
 */
export function loadXingyiKnowledgeTopicSkillBody(topicId: string): string {
  const requested = String(topicId || '').trim()
  if (!requested) return ''
  const section = parseXingyiKnowledgeSections(loadXingyiKnowledgeRaw())
    .find((item) => item.topicId === requested)
  return section?.content || ''
}

const MAX_SEARCH_RESULTS = 5
const MAX_LIST_RESULTS = 80
const PREVIEW_CHARS = 180

function sectionPreview(section: XingyiKnowledgeSection): string {
  const body = section.content
    .replace(/^###\s+.*(?:\r?\n|$)/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}…` : body
}

function topicDetails(section: XingyiKnowledgeSection): {
  topicId: string
  title: string
  source: string
} {
  return { topicId: section.topicId, title: section.title, source: section.source }
}

function renderTopicCandidate(section: XingyiKnowledgeSection): string {
  return [
    `- topicId：${section.topicId}`,
    `  标题：${section.title}`,
    `  来源：${section.source}`,
    `  摘要：${sectionPreview(section) || '（无摘要）'}`
  ].join('\n')
}

/** 星依知识主题目录：不知道准确术语或想浏览能力边界时使用，只返回元数据与摘要。 */
export function createListXingyiKnowledgeTopicsTool(): ToolDefinition {
  return {
    name: 'listXingyiKnowledgeTopics',
    brief: '浏览星依知识库主题目录（只读）：不知道准确术语、可用主题或 topicId 时先用。只返回主题 ID、标题、来源和摘要，不返回全文。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选。按关键词缩小目录；不知道关键词时留空浏览全部主题。' }
      }
    },
    execute: (toolCall) => {
      const raw = loadXingyiKnowledgeRaw()
      if (!raw) {
        return { content: '星依知识库暂不可用（docs/agents/星依 读取为空）。', details: { topicCount: 0 } }
      }
      const query = String(toolCall.args.query || '').trim()
      const all = parseXingyiKnowledgeSections(raw)
      const topics = (query ? searchXingyiKnowledgeSections(query, raw) : all).slice(0, MAX_LIST_RESULTS)
      if (!topics.length) {
        return {
          content: `目录中没有匹配“${query}”的主题。可以留空 query 浏览全部主题，或换成对象/动作关键词。`,
          details: { topicCount: 0, query }
        }
      }
      return {
        content: [
          query ? `星依知识目录中与“${query}”相关的主题：` : '星依知识主题目录：',
          topics.map(renderTopicCandidate).join('\n'),
          '需要完整规则时，调用 readXingyiKnowledgeTopic 并传入准确 topicId。'
        ].join('\n\n'),
        details: {
          topicCount: topics.length,
          totalTopicCount: all.length,
          topics: topics.map(topicDetails)
        }
      }
    }
  }
}

/** 星依使用手册候选检索：只负责定位，不再一次灌入多篇全文。 */
export function createSearchXingyiKnowledgeTool(): ToolDefinition {
  return {
    name: 'searchXingyiKnowledge',
    brief: '搜索星依知识库候选主题（只读）：已知任务、格式或报错时，用“对象+动作+来源/目标”定位 topicId。只返回少量摘要，命中后用 readXingyiKnowledgeTopic 精读。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '对象+动作+来源/目标或报错关键词（必填，如“编译页 黄灯 修复”“文档库资料 正式角色 角色分组”）。' }
      },
      required: ['query']
    },
    validateArgs: (args) => String(args.query || '').trim() ? null : 'searchXingyiKnowledge 缺少 query',
    execute: (toolCall) => {
      const query = String(toolCall.args.query || '').trim()
      const raw = loadXingyiKnowledgeRaw()
      if (!raw) {
        return { content: '星依知识库暂不可用（docs/agents/星依 读取为空）。', details: { hitCount: 0 } }
      }
      const hits = searchXingyiKnowledgeSections(query, raw).slice(0, MAX_SEARCH_RESULTS)
      if (!hits.length) {
        return {
          content: `没有命中与“${query}”相关的知识主题。请换成对象/动作/来源/目标拆词重搜，或调用 listXingyiKnowledgeTopics 浏览目录。`,
          details: { hitCount: 0, query }
        }
      }
      return {
        content: [
          `命中 ${hits.length} 个候选主题：`,
          hits.map(renderTopicCandidate).join('\n'),
          '请选最贴合任务边界的 topicId，再调用 readXingyiKnowledgeTopic 读取完整规则后行动。'
        ].join('\n\n'),
        details: { hitCount: hits.length, query, topics: hits.map(topicDetails) }
      }
    }
  }
}

/** 按稳定 topicId 精确读取单个主题全文。 */
export function createReadXingyiKnowledgeTopicTool(): ToolDefinition {
  return {
    name: 'readXingyiKnowledgeTopic',
    brief: '精确读取一个星依知识主题全文（只读）。topicId 必须来自 listXingyiKnowledgeTopics 或 searchXingyiKnowledge；复杂流程、写操作和报错修复行动前先精读。',
    schema: {
      type: 'object',
      properties: {
        topicId: { type: 'string', description: '要精读的稳定主题 ID，格式为“来源文件::完整标题”。' }
      },
      required: ['topicId']
    },
    validateArgs: (args) => String(args.topicId || '').trim() ? null : 'readXingyiKnowledgeTopic 缺少 topicId',
    execute: (toolCall) => {
      const requested = String(toolCall.args.topicId || '').trim()
      const raw = loadXingyiKnowledgeRaw()
      if (!raw) {
        return { content: '星依知识库暂不可用（docs/agents/星依 读取为空）。', details: { topicId: requested } }
      }
      const section = parseXingyiKnowledgeSections(raw).find((item) => item.topicId === requested)
      if (!section) {
        const message = `没有找到 topicId“${requested}”。请先调用 searchXingyiKnowledge 或 listXingyiKnowledgeTopics 获取准确 topicId，不要按标题猜。`
        return {
          content: message,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message, retryable: true },
          details: { topicId: requested }
        }
      }
      return {
        content: [`topicId：${section.topicId}`, `来源：${section.source}`, section.content].join('\n\n'),
        details: topicDetails(section)
      }
    }
  }
}

/** 星依知识三件套统一装配，避免 harness 漏挂 list/search/read 任一层。 */
export function createXingyiKnowledgeTools(): ToolDefinition[] {
  return [
    createListXingyiKnowledgeTopicsTool(),
    createSearchXingyiKnowledgeTool(),
    createReadXingyiKnowledgeTopicTool()
  ]
}
