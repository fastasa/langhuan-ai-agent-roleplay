import { describe, expect, it } from 'vitest'
import {
  createXingyiDiaryKnowledgeTools,
  parseDiaryKnowledgeSections
} from '../../../server/services/xingyiDiaryKnowledge.ts'

// 日记知识库三件套精确读取 docs/agents/日记/skills/project-background/SKILL.md（fs 实读，不 mock）。
// mini agent 化：验证 list/search/read 三层渐进披露基础可用，且都是只读（工具不接受任何写参数）。

describe('xingyiDiaryKnowledge', () => {
  it('parseDiaryKnowledgeSections 按 ### 小节切分，来源行归入 topicId', () => {
    const raw = '## 来源：知识库.md\n\n### 一、你在做什么\n正文A\n\n### 二、背景\n正文B\n'
    const sections = parseDiaryKnowledgeSections(raw)
    expect(sections.length).toBe(2)
    expect(sections[0].topicId).toBe('知识库::一、你在做什么')
    expect(sections[0].source).toBe('知识库.md')
    expect(sections[1].topicId).toBe('知识库::二、背景')
  })

  it('createXingyiDiaryKnowledgeTools 装配 list/search/read 三件套，工具名固定', () => {
    const tools = createXingyiDiaryKnowledgeTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'listXingyiDiaryKnowledgeTopics',
      'readXingyiDiaryKnowledgeTopic',
      'searchXingyiDiaryKnowledge'
    ])
  })

  it('listXingyiDiaryKnowledgeTopics 真读 project-background Skill，能列出「提调坞」相关主题', () => {
    const [listTool] = createXingyiDiaryKnowledgeTools()
    const result = listTool.execute({ args: {} })
    expect(result.details.topicCount).toBeGreaterThan(0)
    expect(result.content).toContain('提调')
    expect(result.content).toContain('project-background/SKILL.md')
  })

  it('searchXingyiDiaryKnowledge 按关键词命中「提调坞」相关主题', () => {
    const [, searchTool] = createXingyiDiaryKnowledgeTools()
    const result = searchTool.execute({ args: { query: '提调坞' } })
    expect(result.details.hitCount).toBeGreaterThan(0)
    expect(result.details.topics[0].topicId).toContain('::')
  })

  it('searchXingyiDiaryKnowledge 缺 query 时 validateArgs 拒绝', () => {
    const [, searchTool] = createXingyiDiaryKnowledgeTools()
    expect(searchTool.validateArgs({ query: '' })).toBeTruthy()
    expect(searchTool.validateArgs({ query: '提调坞' })).toBeFalsy()
  })

  it('readXingyiDiaryKnowledgeTopic 按 topicId 精读全文，未知 topicId 报错但不抛异常', () => {
    const [, searchTool, readTool] = createXingyiDiaryKnowledgeTools()
    const hit = searchTool.execute({ args: { query: '提调坞' } })
    const topicId = hit.details.topics[0].topicId
    const read = readTool.execute({ args: { topicId } })
    expect(read.content).toContain(topicId)

    const missing = readTool.execute({ args: { topicId: '不存在的知识::乱写一个' } })
    expect(missing.status).toBe('error')
  })
})
