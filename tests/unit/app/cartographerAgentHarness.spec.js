import { describe, expect, it, vi } from 'vitest'

// 舆图师独立 agent harness 回归（地图与剧本工作区专业Agent计划批C）：
// 覆盖零写只读问答、三个写工具的路由/schema校验/确认门分支、续轮护栏。
// runMountainArmorWork 等底层画图引擎已有各自专属测试（mapVectorAndGrass.spec.js/armorPainter.spec.js），
// 这里 mock 掉，只验证本文件的工具路由/回执渲染/写门逻辑，不重复测底层几何正确性。
const armorMocks = vi.hoisted(() => ({
  runMountainArmorWork: vi.fn(),
  runGrassArmorWork: vi.fn(),
  runRiverArmorWork: vi.fn(),
  runWaterArmorWork: vi.fn(),
  runVectorPrimitiveWork: vi.fn()
}))
vi.mock('../../../src/app/mapArmor/armorOrchestration.ts', () => ({
  runMountainArmorWork: armorMocks.runMountainArmorWork,
  runGrassArmorWork: armorMocks.runGrassArmorWork
}))
vi.mock('../../../src/app/mapArmor/riverOrchestration.ts', () => ({
  runRiverArmorWork: armorMocks.runRiverArmorWork
}))
vi.mock('../../../src/app/mapArmor/waterOrchestration.ts', () => ({
  runWaterArmorWork: armorMocks.runWaterArmorWork
}))
vi.mock('../../../src/app/mapDrawing/vectorOrchestration.ts', () => ({
  runVectorPrimitiveWork: armorMocks.runVectorPrimitiveWork
}))

const { runCartographerAgent: runCartographerAgentHarness } = await import('../../../src/app/cartographerAgentHarness.ts')
const CARTOGRAPHER_CONTEXT_BLOCK = 'rendered-cartographer-context'
const runCartographerAgent = (input) => runCartographerAgentHarness({ contextBlock: CARTOGRAPHER_CONTEXT_BLOCK, ...input })

function nativeToolCall(name, args, id = 'call_1') {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

function baseWriteApi(overrides = {}) {
  return {
    fetchWorldMapBundle: vi.fn(async () => ({
      world: { id: 'world_1', name: '浮梦城' },
      sheets: [{ id: 'sheet_1', name: '主图', features: [
        { id: 'feat_1', name: '旧山脉', kind: 'region', category: 'mountain', worldId: 'world_1', sheetId: 'sheet_1', layer: 'terrain', geometry: { pts: [] } }
      ] }]
    })),
    saveWorldMapFeaturesRemote: vi.fn(async () => []),
    deleteWorldMapFeatureRemote: vi.fn(async () => {}),
    ...overrides
  }
}

describe('runCartographerAgent（舆图师独立loop·批C）', () => {
  it('只读问答：模型不调用任何工具，直接给出回复；不触发任何写引擎', async () => {
    const callOrchestrator = vi.fn(async () => ({ content: '当前图纸有一座山脉和一片草原。', toolCalls: [] }))

    const result = await runCartographerAgent({
      userText: '现在图纸上有什么？',
      worldId: 'world_1',
      mapSummary: '山脉x1，草原x1',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    expect(result.reply).toBe('当前图纸有一座山脉和一片草原。')
    expect(result.transcript.promptSupplyTrace).toEqual([])
    expect(armorMocks.runMountainArmorWork).not.toHaveBeenCalled()
    expect(armorMocks.runVectorPrimitiveWork).not.toHaveBeenCalled()
    const currentTurn = callOrchestrator.mock.calls[0][0].messages
      .find((message) => String(message.content).includes('【统一原始可见上下文】'))?.content || ''
    expect(currentTurn).toContain('【统一原始可见上下文】\nrendered-cartographer-context')
    expect(currentTurn).toContain('【当前专业地图摘要】\n山脉x1，草原x1')
    expect(currentTurn).toContain('【用户输入】\n现在图纸上有什么？')
    expect(currentTurn).not.toContain('浮梦城')
  })

  it('统一原始可见上下文为空时拒绝启动，不调用模型', async () => {
    const callOrchestrator = vi.fn()
    await expect(runCartographerAgentHarness({
      userText: '现在图纸上有什么？',
      contextBlock: '',
      worldId: 'world_1',
      mapSummary: '山脉x1',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })).rejects.toThrow('舆图师统一原始可见上下文为空')
    expect(callOrchestrator).not.toHaveBeenCalled()
  })

  it('paintArmor(terrain=mountain)：成功后回复带确认落库文案，reviewDraft 通道原样透传给引擎', async () => {
    armorMocks.runMountainArmorWork.mockResolvedValueOnce({ ok: true, summary: '已展开1座山脉，落库3个要素', groupId: 'group_1' })
    const reviewDraft = vi.fn()
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('paintArmor', { task: '新增雪山', instructions: '在东边画一座雪山', terrain: 'mountain' })] }
      return { content: '雪山已经画好啦。', toolCalls: [] }
    })

    const result = await runCartographerAgent({
      userText: '帮我在东边画一座雪山',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft,
      writeApi: baseWriteApi()
    })

    expect(armorMocks.runMountainArmorWork).toHaveBeenCalledWith(expect.objectContaining({
      worldId: 'world_1',
      deps: expect.objectContaining({ reviewDraft })
    }))
    expect(result.reply).toBe('雪山已经画好啦。')
  })

  it('paintArmor(terrain=river)：走 runRiverArmorWork 并透传 paintCallModel', async () => {
    armorMocks.runRiverArmorWork.mockResolvedValueOnce({ ok: true, summary: '河流已落库' })
    const paintCallModel = vi.fn(async () => '{}')
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('paintArmor', { task: '新增河流', instructions: '从雪山流向大海', terrain: 'river' })] }
      return { content: '河流画好了。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '画条河',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel,
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    expect(armorMocks.runRiverArmorWork).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world_1', callModel: paintCallModel }))
  })

  it('paintArmor 回执 reviewStatus=modify 时提示模型重新生成新草稿', async () => {
    armorMocks.runMountainArmorWork.mockResolvedValueOnce({ ok: false, summary: '用户要求山体再高一些', reviewStatus: 'modify', reviewFeedback: '再高一些' })
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('paintArmor', { task: '新增雪山', instructions: '画一座雪山', terrain: 'mountain' })] }
      return { content: '我按意见重新画一版。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '画一座雪山',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    const secondCallSystemOrUser = callOrchestrator.mock.calls[1][0].messages
    const toolResultMessage = secondCallSystemOrUser.find((message) => message.role === 'tool')
    expect(toolResultMessage?.content || JSON.stringify(secondCallSystemOrUser)).toContain('重新调用 paintArmor')
  })

  it('drawVectorPrimitive：category=water 直接拒绝，不调用引擎', async () => {
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('drawVectorPrimitive', { task: '画个湖', shape: 'circle', category: 'water', radiusKm: 2 })] }
      return { content: '湖泊要用装甲工具画。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '画个圆形湖泊',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    expect(armorMocks.runVectorPrimitiveWork).not.toHaveBeenCalled()
  })

  it('drawVectorPrimitive：成功路径正确透传 shape/category/radius', async () => {
    armorMocks.runVectorPrimitiveWork.mockResolvedValueOnce({ ok: true, summary: '已落库', featureId: 'feat_new' })
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('drawVectorPrimitive', { task: '画个圆形草原', shape: 'circle', category: 'grass', radiusKm: 1.5 })] }
      return { content: '草原画好了。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '画个圆形草原',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    expect(armorMocks.runVectorPrimitiveWork).toHaveBeenCalledWith(expect.objectContaining({
      worldId: 'world_1', shape: 'circle', category: 'grass', radiusM: 1500
    }))
  })

  it('deleteMapFeatures：缺confirmWrite通道时硬门拒绝，不触碰写API', async () => {
    const writeApi = baseWriteApi()
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteMapFeatures', { targets: ['feat_1'] })] }
      return { content: '删除功能暂不可用。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '删掉那座旧山脉',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi
    })

    expect(writeApi.deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('deleteMapFeatures：目标不存在时拒绝，不弹确认卡', async () => {
    const confirmWrite = vi.fn(async () => true)
    const writeApi = baseWriteApi()
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteMapFeatures', { targets: ['feat_ghost'] })] }
      return { content: '找不到这个要素。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '删掉一个不存在的要素',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      confirmWrite,
      reviewDraft: vi.fn(),
      writeApi
    })

    expect(confirmWrite).not.toHaveBeenCalled()
    expect(writeApi.deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('deleteMapFeatures：确认后调用删除API并 bump 地形版本', async () => {
    const confirmWrite = vi.fn(async () => true)
    const writeApi = baseWriteApi()
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteMapFeatures', { targets: ['feat_1'] })] }
      return { content: '已经删掉了。', toolCalls: [] }
    })

    const result = await runCartographerAgent({
      userText: '删掉那座旧山脉',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      confirmWrite,
      reviewDraft: vi.fn(),
      writeApi
    })

    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(writeApi.deleteWorldMapFeatureRemote).toHaveBeenCalledWith('world_1', 'feat_1', expect.objectContaining({ runKey: expect.any(String) }))
    expect(result.reply).toBe('已经删掉了。')
  })

  it('deleteMapFeatures：用户取消确认卡时不调用删除API', async () => {
    const confirmWrite = vi.fn(async () => false)
    const writeApi = baseWriteApi()
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '', toolCalls: [nativeToolCall('deleteMapFeatures', { targets: ['feat_1'] })] }
      return { content: '好的，不删了。', toolCalls: [] }
    })

    await runCartographerAgent({
      userText: '删掉那座旧山脉',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      confirmWrite,
      reviewDraft: vi.fn(),
      writeApi
    })

    expect(writeApi.deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('续轮护栏：模型只说"稍等我去核对"没调工具时会被续轮一次，之后正常收束', async () => {
    let call = 0
    const callOrchestrator = vi.fn(async () => {
      call += 1
      if (call === 1) return { content: '稍等，我先核对一下现有地形。', toolCalls: [] }
      return { content: '核对完了，目前地图状态正常。', toolCalls: [] }
    })

    const result = await runCartographerAgent({
      userText: '现在的地图有问题吗',
      worldId: 'world_1',
      mapSummary: '',
      callOrchestrator,
      paintCallModel: vi.fn(),
      reviewDraft: vi.fn(),
      writeApi: baseWriteApi()
    })

    expect(callOrchestrator).toHaveBeenCalledTimes(2)
    expect(result.reply).toBe('核对完了，目前地图状态正常。')
  })
})
