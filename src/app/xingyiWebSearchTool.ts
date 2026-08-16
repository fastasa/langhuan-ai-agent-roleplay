/** 星依只读联网搜索工具：执行端由浮坞注入，服务端走 Codex 订阅桥独立 web-search 进程。 */
import type { AiWebSearchSource } from '../repositories/aiRepository'
import type { ToolDefinition } from './agentRuntime/toolRegistry'

export interface XingyiWebSearchContext {
  search: (query: string, signal?: AbortSignal) => Promise<{ answer: string; sources: AiWebSearchSource[] }>
}

export function createXingyiWebSearchTool(ctx: XingyiWebSearchContext): ToolDefinition {
  return {
    name: 'searchWeb',
    longRunning: true,
    brief: '联网搜索、打开公开网页并带来源返回。用户明确要求联网/上网搜/查网页/来源/最新当前信息时必须直接调用；'
      + '外部事实可能变化、冷门专业概念、开放问题当前状态、异常重大主张或自己不够确定时也应主动调用。'
      + '当本工具 schema 已在场时，不得未经调用就声称无法联网。琅嬛内部文档库资料仍优先用 searchWorldText/listUnitTree/readUnit，不要拿公网搜索代替内部真值。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '完整、具体的联网检索词或需要打开阅读的公开 http(s) 网址，1~2000 字。' }
      },
      required: ['query']
    },
    validateArgs: (args) => {
      const query = String(args.query || '').trim()
      if (!query) return 'searchWeb 缺少 query（联网检索词）'
      if (query.length > 2000) return 'searchWeb 的 query 不能超过 2000 字'
      return null
    },
    execute: async (toolCall, execution) => {
      const query = String(toolCall.args.query || '').trim()
      const result = await ctx.search(query, execution.signal)
      const sources = result.sources.filter((source) => /^https?:\/\//i.test(source.url))
      return {
        content: [
          `【联网检索】${query}`,
          result.answer,
          ...(sources.length
            ? ['', '【结构化来源】', ...sources.map((source) => `- ${source.title || source.url}：${source.url}`)]
            : [])
        ].join('\n'),
        details: { query, sources },
        lifecycle: { query: 'searchable', sources: 'transient' },
        acted: true
      }
    }
  }
}
