import { describe, expect, it, vi } from 'vitest'
import { ToolRegistry, coerceArgsBySchema, matchToolsByQuery, toOpenAiTools } from '../../../src/app/agentRuntime/toolRegistry.ts'

describe('toOpenAiTools', () => {
  it('带 schema 的工具原样下发为 parameters', () => {
    const schema = { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
    const tools = toOpenAiTools([{ name: 'readScenarioSkill', brief: '读情境', schema }])
    expect(tools).toHaveLength(1)
    expect(tools[0]).toEqual({
      type: 'function',
      function: { name: 'readScenarioSkill', description: '读情境', parameters: schema }
    })
  })

  it('缺 schema 兜底成空参数，并在 DEV 下高声告警点名工具（根因防回归）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tools = toOpenAiTools([{ name: 'generatePlanBatch', brief: '生成计划' }])
    expect(tools[0].function.parameters).toEqual({ type: 'object', properties: {} })
    // vitest 下 import.meta.env.DEV 为真，应告警并点名缺 schema 的工具
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('generatePlanBatch')
    errorSpy.mockRestore()
  })

  it('空工具名被剔除', () => {
    const schema = { type: 'object', properties: {} }
    const tools = toOpenAiTools([
      { name: '', brief: '空名', schema },
      { name: 'fetchUnitDetail', brief: '取单位', schema }
    ])
    expect(tools.map((t) => t.function.name)).toEqual(['fetchUnitDetail'])
  })
})

describe('coerceArgsBySchema（字段值字符串化纠形·2026-07-08 订阅桥真机 writeTodo 首发连败）', () => {
  const todoSchema = {
    type: 'object',
    properties: {
      todos: { type: 'array', items: { type: 'object' } },
      note: { type: 'string' },
      meta: { type: 'object' }
    },
    required: ['todos']
  }

  it('array 字段收到序列化字符串：解开成真数组（真机形状）', () => {
    const coerced = coerceArgsBySchema({ todos: '[{"text":"转场收束","acceptance":"帷幕改到酒店"}]' }, todoSchema)
    expect(coerced.todos).toEqual([{ text: '转场收束', acceptance: '帷幕改到酒店' }])
  })

  it('object 字段收到序列化字符串：解开成真对象；正常入参原引用透传', () => {
    expect(coerceArgsBySchema({ todos: [], meta: '{"a":1}' }, todoSchema).meta).toEqual({ a: 1 })
    const normal = { todos: [{ text: 'a' }] }
    expect(coerceArgsBySchema(normal, todoSchema)).toBe(normal)
  })

  it('string 类型字段绝不碰（正文含 JSON 文本是合法内容）', () => {
    const args = { todos: [], note: '[{"这是":"正文里的JSON"}]' }
    expect(coerceArgsBySchema(args, todoSchema)).toBe(args)
  })

  it('类型不符/坏 JSON/形状不像：原样保留交 validateArgs 精准报错', () => {
    // 字符串解出来是对象但字段要 array：不替换
    expect(coerceArgsBySchema({ todos: '{"text":"x"}' }, todoSchema).todos).toBe('{"text":"x"}')
    // 坏 JSON：不替换
    expect(coerceArgsBySchema({ todos: '[{"text":' }, todoSchema).todos).toBe('[{"text":')
    // 无 schema / 无 properties：原样
    const args = { todos: '[1]' }
    expect(coerceArgsBySchema(args, undefined)).toBe(args)
    expect(coerceArgsBySchema(args, { type: 'object' })).toBe(args)
  })
})

describe('ToolRegistry listBriefs / listCatalog（接缝重构后·工具集成员由 loop 装配决定·无 B3/schemaFactory）', () => {
  const noop = () => ({ content: '' })
  const buildRegistry = () => new ToolRegistry([
    { name: 'readChatMessage', brief: '读会话', schema: { type: 'object' }, execute: noop },
    { name: 'reprojectMessage', brief: '重投', execute: noop },
    { name: 'searchDirectorMemory', brief: '搜记忆', execute: noop }
  ])

  it('listBriefs 不传 activeTools 列全部已注册工具（带 schema）', () => {
    const briefs = buildRegistry().listBriefs()
    expect(briefs.map((b) => b.name)).toEqual(['readChatMessage', 'reprojectMessage', 'searchDirectorMemory'])
    expect(briefs[0].schema).toEqual({ type: 'object' })
  })

  it('listBriefs 传 activeTools 只列放行工具', () => {
    const names = buildRegistry().listBriefs(['readChatMessage']).map((b) => b.name)
    expect(names).toEqual(['readChatMessage'])
  })

  it('listCatalog：列全部已注册工具的 name+brief（不带 schema），推荐单标 recommended', () => {
    // 接缝重构：registry 成员由 loop 装配时决定（按接缝在位调工厂建），catalog 直接列全部已注册工具·不再 B3 隐藏。
    const catalog = buildRegistry().listCatalog(['readChatMessage'])
    expect(catalog).toEqual([
      { name: 'readChatMessage', brief: '读会话', recommended: true },
      { name: 'reprojectMessage', brief: '重投', recommended: false },
      { name: 'searchDirectorMemory', brief: '搜记忆', recommended: false }
    ])
  })

  it('matchToolsByQuery：按关键词子串命中 name+brief，按命中词数降序，空 query/无命中返回空', () => {
    const catalog = [
      { name: 'readMessagePrompt', brief: '读取消息挂载的提示词' },
      { name: 'editMessagePrompt', brief: '改写消息挂载的提示词' },
      { name: 'recallSemantic', brief: '语义召回文档库' }
    ]
    // 「提示词」命中两个读改提示词工具，不命中取料
    expect(matchToolsByQuery(catalog, '提示词')).toEqual(['readMessagePrompt', 'editMessagePrompt'])
    // 多词按命中数降序：editMessagePrompt 命中「改」+「提示词」两词排前
    expect(matchToolsByQuery(catalog, '改 提示词')[0]).toBe('editMessagePrompt')
    expect(matchToolsByQuery(catalog, '')).toEqual([])
    expect(matchToolsByQuery(catalog, '不存在的能力')).toEqual([])
  })
})
