import { describe, expect, it, vi } from 'vitest'
import {
  createReadStatusPanelsTool,
  createUpdateStatusPanelTool,
  isTidiaoToolResultActed,
  TIDIAO_READ_STATUS_PANELS_TOOL_NAME,
  TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME
} from '../../../src/app/tidiaoGlobalTools.ts'

// 状态系统批次5（2026-07-08 用户拍板「状态栏主写手=提调」）回归锁：
// 提调轮内读/改状态栏两件套——总览渲染 / 合并更新与回执 / 名称解析报错 / 服务端报错原样透传 / acted 语义。

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const TEMPLATE = {
  id: 'tpl_char',
  sessionId: 'session_1',
  kind: 'character',
  name: '角色状态栏',
  description: '',
  fields: [
    { key: 'mood', label: '情绪', valueType: 'text' },
    { key: 'money', label: '灵石', valueType: 'number' },
    { key: 'items', label: '物品', valueType: 'list' },
    { key: 'allies', label: '关联状态栏', valueType: 'ref' }
  ]
}

const PANEL = {
  id: 'panel_char',
  sessionId: 'session_1',
  templateId: 'tpl_char',
  name: '沈青梧',
  hostType: 'session_character',
  hostId: 'participant_char_1',
  values: { mood: '警惕', money: 1200, items: ['青玉短笛'], allies: ['panel_ally'] },
  bindingValues: {}
}

const ALLY_PANEL = {
  id: 'panel_ally', sessionId: 'session_1', templateId: 'tpl_char', name: '听雨阁',
  hostType: 'none', hostId: '', values: { mood: '戒备', money: 3000, items: [], allies: [] }, bindingValues: {}
}

function createCtx(overrides = {}) {
  const savedPayloads = []
  const repository = {
    fetchTemplates: vi.fn(async () => clone([TEMPLATE])),
    fetchPanels: vi.fn(async () => clone([PANEL, ALLY_PANEL])),
    fetchTempEntities: vi.fn(async () => []),
    savePanel: vi.fn(async (_sessionId, payload) => {
      savedPayloads.push(payload)
      return { ...clone(PANEL), ...payload }
    }),
    saveTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    deletePanel: vi.fn(),
    ...overrides.repository
  }
  return {
    ctx: {
      sessionId: 'session_1',
      characterOptions: [{ id: 'char_1', participantId: 'participant_char_1', name: '沈青梧' }],
      repository
    },
    repository,
    savedPayloads
  }
}

describe('tidiaoStatusSystemTools · 提调状态系统两件套（批次5）', () => {
  it('readStatusPanels 渲染全貌（read 语义·不算做过事）', async () => {
    const { ctx } = createCtx()
    const tool = createReadStatusPanelsTool(ctx)
    expect(tool.name).toBe(TIDIAO_READ_STATUS_PANELS_TOOL_NAME)

    const result = await tool.execute({ args: {} })
    expect(result.content).toContain('沈青梧')
    expect(result.content).toContain('宿主=角色·沈青梧')
    expect(result.content).toContain('情绪: 警惕')
    expect(result.content).toContain('关联状态栏: 听雨阁')
    expect(result.content).toContain('{"kind":"status_panel","sessionId":"session_1","panelId":"panel_ally"}')
    expect(isTidiaoToolResultActed({ toolName: tool.name, status: 'success' })).toBe(false)
  })

  it('readStatusPanels 可沿 status_panel 结构引用只展开目标状态栏，并拒绝跨会话引用', async () => {
    const { ctx } = createCtx()
    const tool = createReadStatusPanelsTool(ctx)
    const reference = { kind: 'status_panel', sessionId: 'session_1', panelId: 'panel_ally' }

    expect(tool.validateArgs({ reference })).toBeNull()
    const result = await tool.execute({ args: { reference } })
    expect(result.content).toContain('状态栏详情：1 张')
    expect(result.content).toContain('听雨阁')
    expect(result.content).not.toContain('沈青梧（模板=')
    expect(result.details.reference).toEqual(reference)

    expect(tool.validateArgs({ reference: { ...reference, sessionId: 'session_2' } })).toContain('禁止跨会话')
  })

  it('readStatusPanels 空态用提调口径（不出现星依工具名）', async () => {
    const { ctx } = createCtx({
      repository: {
        fetchTemplates: vi.fn(async () => []),
        fetchPanels: vi.fn(async () => [])
      }
    })
    const result = await createReadStatusPanelsTool(ctx).execute({ args: {} })
    expect(result.content).toContain('还没有任何状态栏')
    expect(result.content).not.toContain('saveStatusTemplate')
  })

  it('updateStatusPanel 合并更新：只给要改的键、number 转数字、其余字段不丢，回执带改动清单', async () => {
    const { ctx, savedPayloads } = createCtx()
    const tool = createUpdateStatusPanelTool(ctx)
    expect(tool.name).toBe(TIDIAO_UPDATE_STATUS_PANEL_TOOL_NAME)

    const result = await tool.execute({ args: { panel: '沈青梧', values: { money: '900' }, reason: '买了符纸' } })
    expect(result.status).toBeUndefined()
    expect(result.content).toContain('已更新状态栏「沈青梧」')
    expect(result.content).toContain('灵石: 900')
    expect(savedPayloads[0].values).toEqual({ mood: '警惕', money: 900, items: ['青玉短笛'], allies: ['panel_ally'] })
    // 宿主与模板原样保留（更新不改归属）
    expect(savedPayloads[0]).toMatchObject({ id: 'panel_char', hostType: 'session_character', hostId: 'participant_char_1' })
    // world 语义：成功即算「本轮做过事」
    expect(isTidiaoToolResultActed({ toolName: tool.name, status: 'success' })).toBe(true)
  })

  it('updateStatusPanel 名称解析失败 / 未知字段给可重试的引导报错', async () => {
    const { ctx } = createCtx()
    const tool = createUpdateStatusPanelTool(ctx)

    const missing = await tool.execute({ args: { panel: '不存在的', values: { mood: 'x' } } })
    expect(missing.status).toBe('error')
    expect(missing.error.type).toBe('INVALID_ARGUMENT')
    expect(missing.content).toContain('没有找到')

    const unknownKey = await tool.execute({ args: { panel: '沈青梧', values: { ghost: 1 } } })
    expect(unknownKey.status).toBe('error')
    expect(unknownKey.content).toContain('不在模板定义里')
  })

  it('updateStatusPanel 服务端中文报错原样透传', async () => {
    const serverMessage = '字段「money」需要数字'
    const { ctx } = createCtx({
      repository: {
        savePanel: vi.fn(async () => { throw Object.assign(new Error(serverMessage), { status: 400 }) })
      }
    })
    const result = await createUpdateStatusPanelTool(ctx).execute({ args: { panel: '沈青梧', values: { mood: '好奇' } } })
    expect(result.status).toBe('error')
    expect(result.content).toContain(serverMessage)
  })

  it('validateArgs：panel 必填、values 必须是非空对象', () => {
    const { ctx } = createCtx()
    const tool = createUpdateStatusPanelTool(ctx)
    expect(tool.validateArgs({ panel: '', values: { a: 1 } })).toContain('缺少 panel')
    expect(tool.validateArgs({ panel: 'x', values: {} })).toContain('非空对象')
    expect(tool.validateArgs({ panel: 'x', values: ['a'] })).toContain('非空对象')
    expect(tool.validateArgs({ panel: 'x', values: { a: 1 } })).toBeNull()
  })
})
