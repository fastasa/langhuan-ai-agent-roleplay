/**
 * @vitest-environment node
 * 星依「读/搜对话投影」工具（取料闭环计划批次1）回归锁：
 * 读全貌按 messageId 时序 / 超额只给最近 N + 提示改搜索 / 同 messageId 取最新 /
 * 多关键词命中 / 搜不到如实说 / 无活动会话三态 / 缺关键词校验。
 */
import { describe, it, expect } from 'vitest'
import {
  createReadChatProjectionTool,
  createSearchChatProjectionTool
} from '../../../src/app/xingyiProjectionTools'

const SESSION = { sessionId: 's1', sessionTitle: '听雨阁夜谈' }

function proj(messageId, speakerName, objectiveFact, extra = {}) {
  return { id: `p${messageId}-${Math.random()}`, messageId, speakerName, objectiveFact, ...extra }
}

function ctxWith(projections, sessionContext = SESSION) {
  return {
    getSessionContext: () => sessionContext,
    fetchProjections: async () => projections
  }
}

// 批次3：显式 session 覆盖——按标识解析到另一个会话再取投影。
function ctxWithResolver(projectionsBySession, activeContext = SESSION) {
  return {
    getSessionContext: () => activeContext,
    resolveSessionContext: async (identifier) => {
      const key = String(identifier || '').trim()
      const found = projectionsBySession[key]
      return found ? { sessionId: found.sessionId, sessionTitle: found.sessionTitle, characterOptions: [] } : null
    },
    fetchProjections: async (sessionId) => {
      for (const entry of Object.values(projectionsBySession)) {
        if (entry.sessionId === sessionId) return entry.projections
      }
      return []
    }
  }
}

describe('xingyiProjectionTools · readChatProjection', () => {
  it('按 messageId 时序渲染客观事实与环境，带总条数', async () => {
    const tool = createReadChatProjectionTool(ctxWith([
      proj(2, '沈青梧', '沈青梧收下短笛', { endEnv: { location: '听雨阁', time: '子时' }, changed: { location: true } }),
      proj(1, '张元英', '张元英递出青玉短笛')
    ]))
    const result = await tool.execute({ args: {} })
    expect(result.details).toMatchObject({ total: 2, shown: 2, overflow: false })
    const lines = result.content.split('\n')
    // #1 在 #2 前（按 messageId 升序）
    const firstIdx = result.content.indexOf('#1 [张元英]')
    const secondIdx = result.content.indexOf('#2 [沈青梧]')
    expect(firstIdx).toBeGreaterThanOrEqual(0)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    expect(result.content).toContain('张元英递出青玉短笛')
    expect(result.content).toContain('地点：听雨阁')
    expect(result.content).toContain('地点变化')
    expect(lines[0]).toContain('共 2 条')
  })

  it('投影超额（>60 条）只给最近 40 条并提示改用 searchChatProjection', async () => {
    const many = Array.from({ length: 70 }, (_, index) => proj(index + 1, `角色${index + 1}`, `第${index + 1}条事实`))
    const tool = createReadChatProjectionTool(ctxWith(many))
    const result = await tool.execute({ args: {} })
    expect(result.details).toMatchObject({ total: 70, shown: 40, overflow: true })
    // 只保留最近 40 条：#31 在、#30 不在
    expect(result.content).toContain('#31 [角色31]')
    expect(result.content).not.toContain('#30 [角色30]')
    expect(result.content).toContain('#70 [角色70]')
    expect(result.content).toContain('只列最近 40 条')
    expect(result.content).toContain('searchChatProjection')
  })

  it('同一 messageId 多条投影取最新（后者覆盖）', async () => {
    const tool = createReadChatProjectionTool(ctxWith([
      proj(5, '沈青梧', '旧事实'),
      proj(5, '沈青梧', '新事实')
    ]))
    const result = await tool.execute({ args: {} })
    expect(result.details.total).toBe(1)
    expect(result.content).toContain('新事实')
    expect(result.content).not.toContain('旧事实')
  })

  it('无投影时如实说', async () => {
    const tool = createReadChatProjectionTool(ctxWith([]))
    const result = await tool.execute({ args: {} })
    expect(result.details).toMatchObject({ total: 0 })
    expect(result.content).toContain('还没有任何对话投影')
  })

  it('没有活动会话时给对话级三态提示', async () => {
    const tool = createReadChatProjectionTool(ctxWith([], null))
    const result = await tool.execute({ args: {} })
    expect(result.details).toMatchObject({ providerMissing: true })
    expect(result.content).toContain('没有打开中的会话')
  })
})

describe('xingyiProjectionTools · searchChatProjection', () => {
  const projections = [
    proj(1, '张元英', '张元英递出青玉短笛'),
    proj(2, '沈青梧', '沈青梧收下短笛', { endEnv: { location: '听雨阁' } }),
    proj(3, '林霄', '林霄在城外埋伏')
  ]

  it('多关键词任一命中（queries 数组）', async () => {
    const tool = createSearchChatProjectionTool(ctxWith(projections))
    const result = await tool.execute({ args: { queries: ['短笛', '埋伏'] } })
    expect(result.details.total).toBe(3)
    expect(result.content).toContain('#1 [张元英]')
    expect(result.content).toContain('#2 [沈青梧]')
    expect(result.content).toContain('#3 [林霄]')
    expect(result.details.references).toEqual([
      { kind: 'chat_message', sessionId: 's1', messageId: 1 },
      { kind: 'chat_message', sessionId: 's1', messageId: 2 },
      { kind: 'chat_message', sessionId: 's1', messageId: 3 }
    ])
    expect(result.content).toContain('ref={"kind":"chat_message"')
  })

  it('命中说话人名与环境地点', async () => {
    const tool = createSearchChatProjectionTool(ctxWith(projections))
    const byName = await tool.execute({ args: { query: '沈青梧' } })
    expect(byName.details.total).toBe(1)
    expect(byName.content).toContain('#2 [沈青梧]')
    const byLocation = await tool.execute({ args: { query: '听雨阁' } })
    expect(byLocation.details.total).toBe(1)
    expect(byLocation.content).toContain('#2 [沈青梧]')
  })

  it('搜不到如实说', async () => {
    const tool = createSearchChatProjectionTool(ctxWith(projections))
    const result = await tool.execute({ args: { query: '不存在的东西' } })
    expect(result.details).toMatchObject({ total: 0 })
    expect(result.content).toContain('没有搜到')
  })

  it('缺关键词被 validateArgs 拦下', async () => {
    const tool = createSearchChatProjectionTool(ctxWith(projections))
    expect(tool.validateArgs({})).toContain('至少一个关键词')
    expect(tool.validateArgs({ queries: [] })).toContain('至少一个关键词')
    expect(tool.validateArgs({ query: '短笛' })).toBeNull()
  })

  it('没有活动会话时给三态提示', async () => {
    const tool = createSearchChatProjectionTool(ctxWith(projections, null))
    const result = await tool.execute({ args: { query: '短笛' } })
    expect(result.details).toMatchObject({ providerMissing: true })
  })
})

describe('xingyiProjectionTools · 批次3 显式 session 覆盖', () => {
  const bySession = {
    张元英: { sessionId: 's-zyy', sessionTitle: '和张元英', projections: [{ id: 'p1', messageId: 1, speakerName: '张元英', objectiveFact: '张元英在练舞' }] }
  }

  it('给 session 时读指定会话的投影（不是活动会话）', async () => {
    const tool = createReadChatProjectionTool(ctxWithResolver(bySession, null))
    // 活动会话为 null，但指定了 session → 仍能读到目标会话
    const result = await tool.execute({ args: { session: '张元英' } })
    expect(result.details.total).toBe(1)
    expect(result.content).toContain('和张元英')
    expect(result.content).toContain('张元英在练舞')
  })

  it('指定的 session 解析不到时给可读 error 并提示 listChatContacts', async () => {
    const tool = createReadChatProjectionTool(ctxWithResolver(bySession, null))
    const result = await tool.execute({ args: { session: '不存在的对话' } })
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('listChatContacts')
  })

  it('给 session 但解析器未接入时如实报未接入', async () => {
    const tool = createReadChatProjectionTool(ctxWith([], null))
    const result = await tool.execute({ args: { session: '张元英' } })
    expect(result.error?.type).toBe('INVALID_ARGUMENT')
    expect(result.content).toContain('未接入')
  })
})
