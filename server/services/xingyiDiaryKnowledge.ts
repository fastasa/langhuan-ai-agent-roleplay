// 星依日记 mini agent 专属知识库（星依聊天日记化归档批次五 · mini agent 化）。
// 真值源文：docs/agents/日记/skills/project-background/SKILL.md。运行时读取方式与 src/app/agentKnowledge/xingyiKnowledge.ts
// 同款 list/search/read 三层渐进披露范式，但**不能直接复用那个文件**——它顶层用 `import.meta.glob`
// 打包读取 md（Vite 构建期宏），日记生成跑在服务端 tsx 进程里（server/services/xingyiDiaryService.ts
// 全程走 `tsx server/server.ts`，不经过 Vite 转换），import 那个文件会在模块加载瞬间就因
// `import.meta.glob is not a function` 崩掉。这里改用 Node `fs` 在运行时直接读目录，自包含一份
// 结构相同但加载方式不同的实现（按 skill/mini-agent-authoring/SKILL.md「少约束、随手写」的精神，
// 不追求和 xingyiKnowledge.ts 抽公共模块）。

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { ToolDefinition } from '../../src/app/agentRuntime/toolRegistry.js'
import { matchToolsByQuery } from '../../src/app/agentRuntime/toolRegistry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// server/services -> 项目根目录（与 xingyiDiaryService.ts 的 PROJECT_ROOT 同款回退层数）。
const PROJECT_ROOT = join(__dirname, '..', '..')
const DIARY_KNOWLEDGE_FILE = join(PROJECT_ROOT, 'docs', 'agents', '日记', 'skills', 'project-background', 'SKILL.md')
const DIARY_KNOWLEDGE_SOURCE = 'project-background/SKILL.md'

function loadDiaryKnowledgeRaw(): string {
  try {
    const content = readFileSync(DIARY_KNOWLEDGE_FILE, 'utf8')
    return `## 来源：${DIARY_KNOWLEDGE_SOURCE}\n\n${content}`
  } catch {
    // 文件不存在/读取失败：知识库暂不可用，各工具据空如实报告，不抛错中断日记生成。
    return ''
  }
}

export interface XingyiDiaryKnowledgeSection {
  /** 稳定精读键：来源文件（不含 .md）::完整标题。 */
  topicId: string
  source: string
  title: string
  content: string
}

const INLINE_SOURCE = '内联知识.md'

function buildTopicId(source: string, title: string): string {
  return `${String(source || INLINE_SOURCE).replace(/\.md$/i, '')}::${String(title || '').trim()}`
}

function makeSection(source: string, title: string, body: string[]): XingyiDiaryKnowledgeSection {
  return { topicId: buildTopicId(source, title), source, title, content: body.join('\n').trim() }
}

/** 把知识库源文切成 ### 小节列表（与 xingyiKnowledge.ts 同款切分规则：## 顶节行本身不含正文，跳过）。 */
export function parseDiaryKnowledgeSections(raw: string): XingyiDiaryKnowledgeSection[] {
  const lines = String(raw || '').split(/\r?\n/)
  const sections: XingyiDiaryKnowledgeSection[] = []
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

/** 关键词检索小节：topicId 作内部唯一键，避免不同文件同名标题互相串源。 */
export function searchDiaryKnowledgeSections(
  query: string,
  raw = loadDiaryKnowledgeRaw()
): XingyiDiaryKnowledgeSection[] {
  const sections = parseDiaryKnowledgeSections(raw)
  if (!sections.length) return []
  const catalog = sections.map((section) => ({
    name: section.topicId,
    brief: `${section.title} ${section.source} ${section.content}`
  }))
  const hitTopicIds = matchToolsByQuery(catalog, query)
  return hitTopicIds
    .map((topicId) => sections.find((section) => section.topicId === topicId))
    .filter((section): section is XingyiDiaryKnowledgeSection => Boolean(section))
}

const MAX_SEARCH_RESULTS = 5
const MAX_LIST_RESULTS = 40
const PREVIEW_CHARS = 180

function sectionPreview(section: XingyiDiaryKnowledgeSection): string {
  const body = section.content
    .replace(/^###\s+.*(?:\r?\n|$)/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}…` : body
}

function topicDetails(section: XingyiDiaryKnowledgeSection): { topicId: string; title: string; source: string } {
  return { topicId: section.topicId, title: section.title, source: section.source }
}

function renderTopicCandidate(section: XingyiDiaryKnowledgeSection): string {
  return [
    `- topicId：${section.topicId}`,
    `  标题：${section.title}`,
    `  来源：${section.source}`,
    `  摘要：${sectionPreview(section) || '（无摘要）'}`
  ].join('\n')
}

/** 日记知识主题目录：不确定素材里的概念该查什么关键词时，先浏览全部主题。 */
export function createListXingyiDiaryKnowledgeTopicsTool(): ToolDefinition {
  return {
    name: 'listXingyiDiaryKnowledgeTopics',
    brief: '浏览日记知识库主题目录（只读）：不知道准确术语或想先看看有哪些主题时用。只返回主题 ID、标题、来源和摘要，不返回全文。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选。按关键词缩小目录；不知道关键词时留空浏览全部主题。' }
      }
    },
    execute: (toolCall) => {
      const raw = loadDiaryKnowledgeRaw()
      if (!raw) {
        return { content: '日记知识库暂不可用（docs/agents/日记 读取为空）。', details: { topicCount: 0 } }
      }
      const query = String(toolCall.args.query || '').trim()
      const all = parseDiaryKnowledgeSections(raw)
      const topics = (query ? searchDiaryKnowledgeSections(query, raw) : all).slice(0, MAX_LIST_RESULTS)
      if (!topics.length) {
        return {
          content: `目录中没有匹配“${query}”的主题。可以留空 query 浏览全部主题，或换成对象/动作关键词。`,
          details: { topicCount: 0, query }
        }
      }
      return {
        content: [
          query ? `日记知识目录中与“${query}”相关的主题：` : '日记知识主题目录：',
          topics.map(renderTopicCandidate).join('\n'),
          '需要完整规则时，调用 readXingyiDiaryKnowledgeTopic 并传入准确 topicId。'
        ].join('\n\n'),
        details: { topicCount: topics.length, totalTopicCount: all.length, topics: topics.map(topicDetails) }
      }
    }
  }
}

/** 日记知识候选检索：只负责定位，不一次灌入多篇全文。 */
export function createSearchXingyiDiaryKnowledgeTool(): ToolDefinition {
  return {
    name: 'searchXingyiDiaryKnowledge',
    brief: '搜索日记知识库候选主题（只读）：素材里出现看不懂的概念（如"提调坞""琅嬛"这类项目内部词）时，用关键词定位 topicId。只返回少量摘要，命中后用 readXingyiDiaryKnowledgeTopic 精读。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '想查的概念关键词（必填，如"提调坞信息流""星依是谁"）。' }
      },
      required: ['query']
    },
    validateArgs: (args) => String(args.query || '').trim() ? null : 'searchXingyiDiaryKnowledge 缺少 query',
    execute: (toolCall) => {
      const query = String(toolCall.args.query || '').trim()
      const raw = loadDiaryKnowledgeRaw()
      if (!raw) {
        return { content: '日记知识库暂不可用（docs/agents/日记 读取为空）。', details: { hitCount: 0 } }
      }
      const hits = searchDiaryKnowledgeSections(query, raw).slice(0, MAX_SEARCH_RESULTS)
      if (!hits.length) {
        return {
          content: `没有命中与“${query}”相关的知识主题。请换个关键词重搜，或调用 listXingyiDiaryKnowledgeTopics 浏览目录。`,
          details: { hitCount: 0, query }
        }
      }
      return {
        content: [
          `命中 ${hits.length} 个候选主题：`,
          hits.map(renderTopicCandidate).join('\n'),
          '请选最贴合的 topicId，再调用 readXingyiDiaryKnowledgeTopic 读取完整内容。'
        ].join('\n\n'),
        details: { hitCount: hits.length, query, topics: hits.map(topicDetails) }
      }
    }
  }
}

/** 按稳定 topicId 精确读取单个主题全文。 */
export function createReadXingyiDiaryKnowledgeTopicTool(): ToolDefinition {
  return {
    name: 'readXingyiDiaryKnowledgeTopic',
    brief: '精确读取一个日记知识主题全文（只读）。topicId 必须来自 listXingyiDiaryKnowledgeTopics 或 searchXingyiDiaryKnowledge。',
    schema: {
      type: 'object',
      properties: {
        topicId: { type: 'string', description: '要精读的稳定主题 ID，格式为"来源文件::完整标题"。' }
      },
      required: ['topicId']
    },
    validateArgs: (args) => String(args.topicId || '').trim() ? null : 'readXingyiDiaryKnowledgeTopic 缺少 topicId',
    execute: (toolCall) => {
      const requested = String(toolCall.args.topicId || '').trim()
      const raw = loadDiaryKnowledgeRaw()
      if (!raw) {
        return { content: '日记知识库暂不可用（docs/agents/日记 读取为空）。', details: { topicId: requested } }
      }
      const section = parseDiaryKnowledgeSections(raw).find((item) => item.topicId === requested)
      if (!section) {
        const message = `没有找到 topicId“${requested}”。请先调用 searchXingyiDiaryKnowledge 或 listXingyiDiaryKnowledgeTopics 获取准确 topicId，不要按标题猜。`
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

/** 日记知识三件套统一装配（只读，日记 mini agent 唯一挂的工具池——不挂任何写工具）。 */
export function createXingyiDiaryKnowledgeTools(): ToolDefinition[] {
  return [
    createListXingyiDiaryKnowledgeTopicsTool(),
    createSearchXingyiDiaryKnowledgeTool(),
    createReadXingyiDiaryKnowledgeTopicTool()
  ]
}
