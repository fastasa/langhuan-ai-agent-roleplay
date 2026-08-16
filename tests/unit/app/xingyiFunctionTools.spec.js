import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getXingyiFunctionProvider,
  registerXingyiFunctionProvider,
  resetXingyiFunctionProvidersForTest
} from '../../../src/app/xingyiFunctionBridge.ts'
import {
  createGenerateCharacterTool,
  createGenerateCompilePageTool,
  createOptimizeUnitRelationsTool,
  createSummarizeChatTool,
  createXingyiFunctionTools,
  resolveXingyiUnitIds
} from '../../../src/app/xingyiFunctionTools.ts'

afterEach(() => {
  resetXingyiFunctionProvidersForTest()
})

function makeUnitProvider(overrides = {}) {
  return {
    contextLabel: () => '世界书文档库',
    listUnits: () => [
      { unitId: 'u1', title: '亚什基诺' },
      { unitId: 'u2', title: '灰烬教会' },
      { unitId: 'u3', title: '灰烬教会分部' }
    ],
    generateCompilePage: vi.fn(async () => ({ ok: true, message: '已导入 3 条编译页' })),
    optimizeRelations: vi.fn(async () => ({ ok: true, message: '已处理 5 条关系提示' })),
    ...overrides
  }
}

function relationReadyContext(overrides = {}) {
  return { hasReadRelationHintSkill: () => true, ...overrides }
}

describe('xingyiFunctionBridge（provider 注册表）', () => {
  it('注册→读取→注销；旧注销不顶掉新注册', () => {
    const first = makeUnitProvider()
    const unregisterFirst = registerXingyiFunctionProvider('worldbookUnits', first)
    expect(getXingyiFunctionProvider('worldbookUnits')).toBe(first)

    const second = makeUnitProvider()
    registerXingyiFunctionProvider('worldbookUnits', second)
    // 晚到的旧注销只在「仍是自己」时移除，不影响新 provider
    unregisterFirst()
    expect(getXingyiFunctionProvider('worldbookUnits')).toBe(second)
  })
})

describe('resolveXingyiUnitIds（名称→unitId 解析）', () => {
  const provider = makeUnitProvider()

  it('精确 unitId、精确标题、唯一子串都能命中并去重', () => {
    const result = resolveXingyiUnitIds(provider, ['u1', '亚什基诺', '基诺'])
    expect(result.error).toBeUndefined()
    expect(result.unitIds).toEqual(['u1'])
  })

  it('多个子串命中给出候选清单错误', () => {
    const result = resolveXingyiUnitIds(provider, ['灰烬'])
    expect(result.error).toContain('匹配到多个单位')
    expect(result.error).toContain('u2')
  })

  it('未命中提示先检索查证', () => {
    const result = resolveXingyiUnitIds(provider, ['不存在的单位'])
    expect(result.error).toContain('没有找到')
  })
})

describe('generateCompilePage 工具（写确认门+bridge）', () => {
  const call = (args) => ({ args })

  it('本轮未读关系提示 Skill：在页面与确认门之前拒绝写入并要求先读', async () => {
    const provider = makeUnitProvider()
    registerXingyiFunctionProvider('worldbookUnits', provider)
    const confirmWrite = vi.fn(async () => true)
    const tool = createGenerateCompilePageTool({ confirmWrite })

    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺'] }), { turnIndex: 0 })

    expect(result.status).toBe('error')
    expect(result.content).toContain('readRelationHintSkill')
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(provider.generateCompilePage).not.toHaveBeenCalled()
  })

  it('对应页面未打开：如实转告去打开页面，不算故障', async () => {
    const tool = createGenerateCompilePageTool(relationReadyContext({ confirmWrite: async () => true }))
    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺'] }), { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('打开文档库页面')
    expect(result.details.providerMissing).toBe(true)
  })

  it('confirmWrite 缺失：硬门拒绝执行（error），provider 不被调用', async () => {
    const provider = makeUnitProvider()
    registerXingyiFunctionProvider('worldbookUnits', provider)
    const tool = createGenerateCompilePageTool(relationReadyContext())
    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺'] }), { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(provider.generateCompilePage).not.toHaveBeenCalled()
  })

  it('用户取消：返回已取消（非 error），provider 不被调用', async () => {
    const provider = makeUnitProvider()
    registerXingyiFunctionProvider('worldbookUnits', provider)
    const tool = createGenerateCompilePageTool(relationReadyContext({ confirmWrite: async () => false }))
    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺'] }), { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('取消')
    expect(result.details.denied).toBe(true)
    expect(provider.generateCompilePage).not.toHaveBeenCalled()
  })

  it('用户确认：解析单位后调按钮同款 handler，确认卡片带目标与单位', async () => {
    const provider = makeUnitProvider()
    registerXingyiFunctionProvider('worldbookUnits', provider)
    const confirmWrite = vi.fn(async () => true)
    const tool = createGenerateCompilePageTool(relationReadyContext({ confirmWrite }))
    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺', '灰烬教会'] }), { turnIndex: 0 })
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    const request = confirmWrite.mock.calls[0][0]
    expect(request.title).toBe('生成编译页')
    expect(request.lines.join('\n')).toContain('亚什基诺')
    expect(provider.generateCompilePage).toHaveBeenCalledWith(['u1', 'u2'], expect.stringContaining('星依·'))
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('已导入 3 条编译页')
    expect(result.details.ok).toBe(true)
  })

  it('handler 报失败：透传为 error 结果', async () => {
    const provider = makeUnitProvider({
      generateCompilePage: vi.fn(async () => ({ ok: false, message: '生成编译页失败：模型没返回内容' }))
    })
    registerXingyiFunctionProvider('worldbookUnits', provider)
    const tool = createGenerateCompilePageTool(relationReadyContext({ confirmWrite: async () => true }))
    const result = await tool.execute(call({ target: 'worldbook', unitNames: ['亚什基诺'] }), { turnIndex: 0 })
    expect(result.status).toBe('error')
    expect(result.content).toContain('失败')
  })

  it('validateArgs：target 非法与 unitNames 缺失都拦截', () => {
    const tool = createGenerateCompilePageTool(relationReadyContext())
    expect(tool.validateArgs({ target: 'x', unitNames: ['a'] })).toContain('target')
    expect(tool.validateArgs({ target: 'worldbook', unitNames: [] })).toContain('unitNames')
    expect(tool.validateArgs({ target: 'characterBrain', unitNames: ['a'] })).toBeNull()
  })
})

describe('optimizeUnitRelations 工具', () => {
  it('characterBrain 目标走角色大脑 provider，确认行里带 review 提示', async () => {
    const provider = makeUnitProvider({ contextLabel: () => '林小满' })
    registerXingyiFunctionProvider('characterBrainUnits', provider)
    const confirmWrite = vi.fn(async () => true)
    const tool = createOptimizeUnitRelationsTool(relationReadyContext({ confirmWrite }))
    const result = await tool.execute({ args: { target: 'characterBrain', unitNames: ['u1'] } }, { turnIndex: 0 })
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('review')
    expect(provider.optimizeRelations).toHaveBeenCalledWith(['u1'], expect.any(String))
    expect(result.content).toContain('已处理 5 条关系提示')
  })
})

describe('generateCharacter 工具', () => {
  it('确认后调 provider，简要描述进确认卡片', async () => {
    const provider = { generateCharacter: vi.fn(async () => ({ ok: true, message: '已按简要描述创建角色「炎拳武僧」' })) }
    registerXingyiFunctionProvider('characterCreate', provider)
    const confirmWrite = vi.fn(async () => true)
    const tool = createGenerateCharacterTool({ confirmWrite })
    const result = await tool.execute({ args: { brief: '一个爱吃辣的武僧' } }, { turnIndex: 0 })
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('爱吃辣的武僧')
    expect(provider.generateCharacter).toHaveBeenCalledWith('一个爱吃辣的武僧')
    expect(result.content).toContain('炎拳武僧')
  })

  it('用户取消不执行创建', async () => {
    const provider = { generateCharacter: vi.fn(async () => ({ ok: true, message: 'x' })) }
    registerXingyiFunctionProvider('characterCreate', provider)
    const tool = createGenerateCharacterTool({ confirmWrite: async () => false })
    const result = await tool.execute({ args: { brief: '随便一个角色' } }, { turnIndex: 0 })
    expect(result.details.denied).toBe(true)
    expect(provider.generateCharacter).not.toHaveBeenCalled()
  })
})

describe('summarizeChat 工具', () => {
  function makeSummaryProvider(overrides = {}) {
    return {
      getContext: () => ({
        sessionId: 's1',
        sessionTitle: '雾岛夜谈',
        characterOptions: [
          { id: 'c1', name: '林小满' },
          { id: 'c2', name: '沈青崖' }
        ]
      }),
      runSummary: vi.fn(async () => ({ ok: true, message: '林小满：写入 2 个事件' })),
      ...overrides
    }
  }

  it('没有活动会话：如实说明，不算故障', async () => {
    registerXingyiFunctionProvider('chatSummary', makeSummaryProvider({ getContext: () => null }))
    const tool = createSummarizeChatTool({ confirmWrite: async () => true })
    const result = await tool.execute({ args: {} }, { turnIndex: 0 })
    expect(result.status).not.toBe('error')
    expect(result.content).toContain('没有打开中的会话')
  })

  it('缺省角色=全部可写入角色，确认卡片带会话名', async () => {
    const provider = makeSummaryProvider()
    registerXingyiFunctionProvider('chatSummary', provider)
    const confirmWrite = vi.fn(async () => true)
    const tool = createSummarizeChatTool({ confirmWrite })
    const result = await tool.execute({ args: {} }, { turnIndex: 0 })
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('雾岛夜谈')
    expect(provider.runSummary).toHaveBeenCalledWith(['c1', 'c2'])
    expect(result.details.sessionId).toBe('s1')
  })

  it('指定角色名解析成 id；未知角色名给候选清单错误', async () => {
    const provider = makeSummaryProvider()
    registerXingyiFunctionProvider('chatSummary', provider)
    const tool = createSummarizeChatTool({ confirmWrite: async () => true })

    await tool.execute({ args: { characterNames: ['沈青崖'] } }, { turnIndex: 0 })
    expect(provider.runSummary).toHaveBeenCalledWith(['c2'])

    const bad = await tool.execute({ args: { characterNames: ['不存在'] } }, { turnIndex: 0 })
    expect(bad.status).toBe('error')
    expect(bad.content).toContain('林小满')
  })
})

describe('createXingyiFunctionTools（全家桶装配）', () => {
  it('四件工具齐全且命名稳定（harness 池装配口径；editUnitCompilePage 已迁单位工具九件套）', () => {
    const tools = createXingyiFunctionTools({})
    expect(tools.map((tool) => tool.name)).toEqual([
      'generateCompilePage',
      'optimizeUnitRelations',
      'generateCharacter',
      'summarizeChat'
    ])
    for (const tool of tools) {
      expect(tool.schema).toBeTruthy()
      expect(tool.brief).toContain('写操作')
    }
  })
})
