// 星依地图新写入口回归：只允许 armor/vector，session/world 寻址与 acted/closingNote 语义保持不变。
// 星依世界寻址批（2026-07-13）追加：dispatchMapWork 的 world 参数直达 + listWorlds/readWorldMap 两件新工具。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMapState = vi.hoisted(() => ({
  bundle: { world: { id: 'world_1', name: '维斯珂帝国' }, sheets: [] }
}))

vi.mock('../../../src/repositories/chatRepository.ts', () => ({
  fetchWorldMapBundle: vi.fn(async () => mockMapState.bundle),
  saveWorldMapSheetRemote: vi.fn(async (worldId, payload) => ({ id: payload.id || 'sheet_new', worldId, name: payload.name || '图纸', explored: payload.explored || null, features: [] })),
  saveWorldMapFeaturesRemote: vi.fn(async (_worldId, items) => items),
  deleteWorldMapFeatureRemote: vi.fn(async () => {}),
  // readWorldMap 缺省会话路径专用（世界寻址批）：现查会话挂的 worldId，与 dispatchXingyiMapWork 旧链路同款。
  fetchChatSessionBundleById: vi.fn(async () => ({ session: null }))
}))

import {
  createXingyiDeleteMapFeaturesTool,
  createXingyiDispatchMapWorkTool,
  createXingyiListWorldsTool,
  createXingyiReadWorldMapTool
} from '../../../src/app/xingyiMapDispatchTools.ts'
import {
  deleteWorldMapFeatureRemote,
  fetchChatSessionBundleById,
  fetchWorldMapBundle
} from '../../../src/repositories/chatRepository.ts'
import {
  getOrCreateScopeState,
  resetWorkspaceAgentScopeStateForTest
} from '../../../src/app/workspaceAgentScopeState.ts'

const SESSION = { sessionId: 'session_1', sessionTitle: '午后茶会', characterOptions: [{ id: 'char_1', name: '薇尔莉特' }] }

function callArgs(overrides = {}) {
  return { task: '新增玄岳山脉', instructions: '在地图中央画一条玄岳山脉', mode: 'armor', terrain: 'mountain', ...overrides }
}

// 世界寻址批共用夹具：两个世界，名字互相包含（'维斯珂'⊂'维斯珂帝国'）方便同时覆盖精确/唯一包含/多候选三态。
const WORLDS = [
  { id: 'world_1', name: '维斯珂', description: '', sessionCount: 2, mapSheetCount: 3 },
  { id: 'world_2', name: '维斯珂帝国', description: '', sessionCount: 0, mapSheetCount: 0 }
]

describe('createXingyiDispatchMapWorkTool（装甲/结构化矢量新写入口）', () => {
  it('validateArgs：缺 task/instructions/mode 报错；mode 非法报错；三者齐全通过', () => {
    const tool = createXingyiDispatchMapWorkTool({ dispatch: vi.fn() })
    expect(tool.brief).toContain('用户可逐项确认')
    expect(tool.validateArgs({ instructions: 'x', mode: 'armor', terrain: 'mountain' })).toMatch(/task/)
    expect(tool.validateArgs({ task: 'x', mode: 'armor', terrain: 'mountain' })).toMatch(/instructions/)
    expect(tool.validateArgs({ task: 'x', instructions: 'x' })).toMatch(/mode/)
    expect(tool.validateArgs({ task: 'x', instructions: 'x', mode: 'somethingElse' })).toMatch(/mode/)
    expect(tool.validateArgs(callArgs())).toBeNull()
    expect(tool.validateArgs(callArgs({ mode: 'draft' }))).toMatch(/冻结/)
    expect(tool.validateArgs(callArgs())).toBeNull()
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'circle', category: 'grass', radiusKm: 10 }))).toBeNull()
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'path', category: 'mountain', pointsKm: [[0, 0], [1, 1]] }))).toMatch(/必须使用 armor/)
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'polygon', category: 'water', pointsKm: [[0, 0], [1, 0], [0, 1]] }))).toMatch(/水深/)
    expect(tool.validateArgs(callArgs({ placementMode: 'expand' }))).toMatch(/direction/)
    expect(tool.validateArgs(callArgs({ terrain: 'river', sourceWidthM: 20, mouthWidthM: 300, growthExponent: 0.5, bankRoughness: 0.2, mouthCap: 'flare' }))).toBeNull()
    expect(tool.validateArgs(callArgs({ terrain: 'river', sourceWidthM: 300, mouthWidthM: 20 }))).toMatch(/mouthWidthM/)
    expect(tool.validateArgs(callArgs({ terrain: 'river', bankRoughness: 0.9 }))).toMatch(/bankRoughness/)
    expect(tool.validateArgs(callArgs({ terrain: 'water', waterKind: 'lake', maxDepthM: 120, shoreShelfRatio: 0.2, depthCurve: 1.2, waterLayers: 3, connectionGapM: 500 }))).toBeNull()
    expect(tool.validateArgs(callArgs({ terrain: 'water', maxDepthM: 20_000 }))).toMatch(/maxDepthM/)
  })

  it('没有活动会话、也没给 session 参数：报错如实说明，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch })
    const result = await tool.execute({ args: callArgs() })
    expect(result.status).toBe('error')
    expect(result.content).toContain('listChatContacts')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('给了 session 参数但 resolveSessionContext 未接入：报错，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch })
    const result = await tool.execute({ args: callArgs({ session: '午后茶会' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('未接入')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('resolveSessionContext 解析不到目标会话：报错，不调用 dispatch', async () => {
    const dispatch = vi.fn()
    const resolveSessionContext = vi.fn(async () => null)
    const tool = createXingyiDispatchMapWorkTool({ dispatch, resolveSessionContext })
    const result = await tool.execute({ args: callArgs({ session: '不存在的对话' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('没有找到会话')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('缺省（不给 session）：走 getSessionContext 当前活动会话，把完整上下文（含 mode）转发给 dispatch', async () => {
    const dispatch = vi.fn(async () => ({ content: '绘舆任务已交稿', ok: true, details: { changes: ['新增 region 玄岳山脉'], mapDigest: '薇尔莉特在临澜城' } }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs() })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toEqual(SESSION)
    expect(dispatch.mock.calls[0][1]).toMatchObject({ task: '新增玄岳山脉', mode: 'armor', terrain: 'mountain' })
    expect(result.content).toBe('绘舆任务已交稿')
    expect(result.acted).toBe(true)
    expect(result.details).toMatchObject({ kind: 'huiyuDispatch', ok: true, changes: ['新增 region 玄岳山脉'] })
  })

  it('mode:"vector" 把正圆草原参数完整转发给新矢量执行体', async () => {
    const dispatch = vi.fn(async () => ({ content: '正圆草原已生成', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs({ mode: 'vector', terrain: undefined, shape: 'circle', category: 'grass', radiusKm: 12, name: '中央草原' }) })
    expect(dispatch.mock.calls[0][1]).toMatchObject({ mode: 'vector', shape: 'circle', category: 'grass', radiusKm: 12, name: '中央草原' })
    expect(result.acted).toBe(true)
  })

  it('mode:"armor" 把河流连接与宽度剖面完整转发给水系执行体', async () => {
    const dispatch = vi.fn(async () => ({ content: '河流草稿已生成', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    await tool.execute({ args: callArgs({
      terrain: 'river', sourceFeature: '北岭', mouthFeature: '东海', sourceWidthM: 20, mouthWidthM: 300,
      growthExponent: 0.6, bankRoughness: 0.15, mouthCap: 'flare', mouthFlareRatio: 4
    }) })
    expect(dispatch.mock.calls[0][1]).toMatchObject({
      terrain: 'river', sourceFeature: '北岭', mouthFeature: '东海', sourceWidthM: 20, mouthWidthM: 300,
      growthExponent: 0.6, bankRoughness: 0.15, mouthCap: 'flare', mouthFlareRatio: 4
    })
  })

  it('mode:"armor" 把湖海共用水体装甲与深度参数完整转发', async () => {
    const dispatch = vi.fn(async () => ({ content: '水体草稿已生成', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    await tool.execute({ args: callArgs({
      terrain: 'water', waterKind: 'ocean', maxDepthM: 4200, shoreShelfRatio: 0.18,
      depthCurve: 1.4, ruggedness: 0.35, waterLayers: 3, connectionGapM: 800
    }) })
    expect(dispatch.mock.calls[0][1]).toMatchObject({
      terrain: 'water', waterKind: 'ocean', maxDepthM: 4200, shoreShelfRatio: 0.18,
      depthCurve: 1.4, ruggedness: 0.35, waterLayers: 3, connectionGapM: 800
    })
  })

  it('放置意图参数完整转发：显式 expand 带锚点/方向/间距', async () => {
    const dispatch = vi.fn(async () => ({ content: '扩图完成', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    await tool.execute({ args: callArgs({ placementMode: 'expand', anchorFeature: '中央草原', direction: 'east', gapKm: 2, widthKm: 30, heightKm: 20 }) })
    expect(dispatch.mock.calls[0][1]).toMatchObject({
      placementMode: 'expand', anchorFeature: '中央草原', direction: 'east', gapKm: 2, widthKm: 30, heightKm: 20
    })
  })

  it('给了 session 参数：走 resolveSessionContext 解析到目标会话再转发给 dispatch', async () => {
    const dispatch = vi.fn(async () => ({ content: '未加入世界', ok: false, details: { reason: 'no-world' } }))
    const resolveSessionContext = vi.fn(async (identifier) => (identifier === '午后茶会' ? SESSION : null))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, resolveSessionContext })
    const result = await tool.execute({ args: callArgs({ session: '午后茶会' }) })
    expect(resolveSessionContext).toHaveBeenCalledWith('午后茶会')
    expect(dispatch.mock.calls[0][0]).toEqual(SESSION)
    expect(result.acted).toBe(false)
    expect(result.details).toMatchObject({ ok: false, reason: 'no-world' })
  })

  it('schema 只暴露 armor/vector；矢量不同图形的必填参数有硬校验', async () => {
    const dispatch = vi.fn(async () => ({ content: '完成', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    expect(tool.schema.properties.mode.enum).toEqual(['armor', 'vector'])
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'circle', category: 'grass' }))).toMatch(/radiusKm/)
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'ellipse', category: 'grass', widthKm: 10 }))).toMatch(/heightKm/)
    expect(tool.validateArgs(callArgs({ mode: 'vector', terrain: undefined, shape: 'polygon', category: 'grass' }))).toMatch(/pointsKm/)
  })

  // ── closingNote 预写收尾话（2026-07-12 用户拍板·省一轮模型调用）──

  it('closingNote：完全成功（dispatch ok:true）且模型传了 closingNote → 结果透传 closingNote', async () => {
    const dispatch = vi.fn(async () => ({ content: '绘舆任务已交稿', ok: true, details: { changes: ['新增 region 玄岳山脉'] } }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs({ closingNote: '地图已经帮用户更新好啦～' }) })
    expect(result.closingNote).toBe('地图已经帮用户更新好啦～')
  })

  it('closingNote：完全成功但模型没传 closingNote → 结果不带该字段', async () => {
    const dispatch = vi.fn(async () => ({ content: '绘舆任务已交稿', ok: true }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs() })
    expect(result.closingNote).toBeUndefined()
  })

  it('closingNote：ok:false 即使模型传了也不透传（安全底线）', async () => {
    const dispatch = vi.fn(async () => ({ content: '装甲参数校验失败', ok: false, details: { reason: 'invalid-params' } }))
    const tool = createXingyiDispatchMapWorkTool({ dispatch, getSessionContext: () => SESSION })
    const result = await tool.execute({ args: callArgs({ closingNote: '不该出现的收尾话' }) })
    expect(result.closingNote).toBeUndefined()
  })

  it('closingNote：会话未定位等 error 分支不透传（连 dispatch 都没调用）', async () => {
    const dispatch = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch })
    const result = await tool.execute({ args: callArgs({ closingNote: '不该出现的收尾话' }) })
    expect(result.status).toBe('error')
    expect(result.closingNote).toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()
  })

  // ── 星依世界寻址批（2026-07-13）：dispatchMapWork 的 world 参数直达 ──

  it('world 参数精确名命中：跳过会话解析，dispatchToWorld 收到正确 worldId/worldName', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const dispatchToWorld = vi.fn(async () => ({ content: '世界直达任务已交稿', ok: true, details: { changes: [] } }))
    const dispatch = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch, dispatchToWorld, listWorlds })
    const result = await tool.execute({ args: callArgs({ world: '维斯珂帝国' }) })
    expect(listWorlds).toHaveBeenCalledTimes(1)
    expect(dispatchToWorld).toHaveBeenCalledWith(
      { worldId: 'world_2', worldName: '维斯珂帝国' },
      expect.objectContaining({ task: '新增玄岳山脉', mode: 'armor', terrain: 'mountain' })
    )
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.acted).toBe(true)
    expect(result.content).toBe('世界直达任务已交稿')
  })

  it('world 参数零命中：报错正文列出现有世界名清单，不调用 dispatchToWorld', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const dispatchToWorld = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch: vi.fn(), dispatchToWorld, listWorlds })
    const result = await tool.execute({ args: callArgs({ world: '沧澜大陆' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('维斯珂')
    expect(result.content).toContain('维斯珂帝国')
    expect(dispatchToWorld).not.toHaveBeenCalled()
  })

  it('world 参数多候选：报错正文列出候选世界名，不调用 dispatchToWorld', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const dispatchToWorld = vi.fn()
    const tool = createXingyiDispatchMapWorkTool({ dispatch: vi.fn(), dispatchToWorld, listWorlds })
    const result = await tool.execute({ args: callArgs({ world: '珂' }) })
    expect(result.status).toBe('error')
    expect(result.content).toContain('匹配到多个世界')
    expect(result.content).toContain('维斯珂')
    expect(result.content).toContain('维斯珂帝国')
    expect(dispatchToWorld).not.toHaveBeenCalled()
  })

  it('world 与 session 同传：world 优先，不解析 session、不调用 dispatch', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const dispatchToWorld = vi.fn(async () => ({ content: '世界直达任务已交稿', ok: true }))
    const dispatch = vi.fn()
    const resolveSessionContext = vi.fn(async () => SESSION)
    const tool = createXingyiDispatchMapWorkTool({ dispatch, dispatchToWorld, listWorlds, resolveSessionContext })
    const result = await tool.execute({ args: callArgs({ world: '维斯珂帝国', session: '午后茶会' }) })
    expect(dispatchToWorld).toHaveBeenCalledWith({ worldId: 'world_2', worldName: '维斯珂帝国' }, expect.anything())
    expect(resolveSessionContext).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.acted).toBe(true)
  })
})

describe('createXingyiListWorldsTool（星依世界寻址批·2026-07-13）', () => {
  it('输出含世界名、worldId、图纸数与挂会话数；空列表如实说明', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const tool = createXingyiListWorldsTool({ listWorlds })
    const result = await tool.execute({ args: {} })
    expect(result.content).toContain('维斯珂')
    expect(result.content).toContain('world_1')
    expect(result.content).toContain('舆图 3张图纸')
    expect(result.content).toContain('维斯珂帝国')
    expect(result.content).toContain('尚无舆图')
    expect(result.content).toContain('挂 2 个会话')
    expect(result.details.worlds).toEqual(WORLDS)

    const emptyTool = createXingyiListWorldsTool({ listWorlds: vi.fn(async () => []) })
    const emptyResult = await emptyTool.execute({ args: {} })
    expect(emptyResult.content).toContain('还没有任何世界')
  })
})

describe('createXingyiReadWorldMapTool（星依世界寻址批·2026-07-13）', () => {
  beforeEach(() => {
    fetchChatSessionBundleById.mockReset().mockResolvedValue({ session: null })
  })

  it('world 直达链路：解析世界名后调用 readWorldMapSummary(worldId)，不需要会话', async () => {
    const listWorlds = vi.fn(async () => WORLDS)
    const readWorldMapSummary = vi.fn(async () => '世界「维斯珂帝国」舆图摘要：……')
    const tool = createXingyiReadWorldMapTool({ listWorlds, readWorldMapSummary })
    const result = await tool.execute({ args: { world: '维斯珂帝国' } })
    expect(readWorldMapSummary).toHaveBeenCalledWith('world_2')
    expect(result.content).toBe('世界「维斯珂帝国」舆图摘要：……')
    expect(fetchChatSessionBundleById).not.toHaveBeenCalled()
  })

  it('缺省会话链路：走当前活动会话，现查会话挂的 worldId 后调用 readWorldMapSummary', async () => {
    fetchChatSessionBundleById.mockResolvedValue({ session: { id: SESSION.sessionId, worldId: 'world_1' } })
    const readWorldMapSummary = vi.fn(async () => '世界「维斯珂」舆图摘要：……')
    const tool = createXingyiReadWorldMapTool({ getSessionContext: () => SESSION, readWorldMapSummary, listWorlds: vi.fn() })
    const result = await tool.execute({ args: {} })
    expect(fetchChatSessionBundleById).toHaveBeenCalledWith(SESSION.sessionId, { limit: 1 })
    expect(readWorldMapSummary).toHaveBeenCalledWith('world_1')
    expect(result.content).toBe('世界「维斯珂」舆图摘要：……')
  })

  it('缺省会话链路：会话未挂世界时报错提示先用 listWorlds', async () => {
    fetchChatSessionBundleById.mockResolvedValue({ session: { id: SESSION.sessionId, worldId: '' } })
    const readWorldMapSummary = vi.fn()
    const tool = createXingyiReadWorldMapTool({ getSessionContext: () => SESSION, readWorldMapSummary, listWorlds: vi.fn() })
    const result = await tool.execute({ args: {} })
    expect(result.status).toBe('error')
    expect(result.content).toContain('listWorlds')
    expect(readWorldMapSummary).not.toHaveBeenCalled()
  })

  it('没有活动会话也没给 world：报错提示先用 listWorlds', async () => {
    const readWorldMapSummary = vi.fn()
    const tool = createXingyiReadWorldMapTool({ readWorldMapSummary, listWorlds: vi.fn() })
    const result = await tool.execute({ args: {} })
    expect(result.status).toBe('error')
    expect(result.content).toContain('listWorlds')
    expect(readWorldMapSummary).not.toHaveBeenCalled()
  })
})

function mapFeature(id, name, overrides = {}) {
  return {
    id,
    sheetId: 'sheet_1',
    worldId: 'world_2',
    kind: 'region',
    category: 'mountain',
    name,
    layer: 'terrain',
    geometry: { pts: [[0, 0], [100, 0], [100, 100], [0, 100]] },
    style: null,
    links: null,
    meta: null,
    ...overrides
  }
}

describe('createXingyiDeleteMapFeaturesTool（单删/批删·2026-07-14）', () => {
  beforeEach(() => {
    fetchWorldMapBundle.mockReset().mockImplementation(async () => mockMapState.bundle)
    deleteWorldMapFeatureRemote.mockReset().mockResolvedValue(undefined)
    resetWorkspaceAgentScopeStateForTest()
    mockMapState.bundle = {
      world: { id: 'world_2', name: '维斯珂帝国' },
      sheets: [{
        id: 'sheet_1',
        worldId: 'world_2',
        name: '主图纸',
        explored: null,
        features: [
          mapFeature('armor_main', '玄岳·主山体', { meta: { armor: { groupId: 'armor_group_1' } } }),
          mapFeature('armor_ridge', '玄岳·山脊带', { meta: { armor: { groupId: 'armor_group_1' } } }),
          mapFeature('armor_peak', '玄岳·峰线', { meta: { armor: { groupId: 'armor_group_1' } } }),
          mapFeature('grass_1', '中央草原', { category: 'grass' })
        ]
      }]
    }
  })

  function createTool(overrides = {}) {
    return createXingyiDeleteMapFeaturesTool({
      dispatch: vi.fn(),
      dispatchToWorld: vi.fn(),
      listWorlds: vi.fn(async () => WORLDS),
      readWorldMapSummary: vi.fn(),
      confirmWrite: vi.fn(async () => ({ status: 'confirmed' })),
      ...overrides
    })
  }

  it('参数硬校验：targets 必须是 1~30 个非空目标，expandArmorGroup 只能是 boolean', () => {
    const tool = createTool()
    expect(tool.validateArgs({})).toMatch(/targets/)
    expect(tool.validateArgs({ targets: [] })).toMatch(/至少/)
    expect(tool.validateArgs({ targets: [''] })).toMatch(/空项/)
    expect(tool.validateArgs({ targets: Array.from({ length: 31 }, (_, i) => `f_${i}`) })).toMatch(/30/)
    expect(tool.validateArgs({ targets: ['grass_1'], expandArmorGroup: 'yes' })).toMatch(/boolean/)
    expect(tool.validateArgs({ targets: ['grass_1'] })).toBeNull()
  })

  it('缺 confirmWrite 硬门：不读图、不删除', async () => {
    const tool = createTool({ confirmWrite: undefined })
    const result = await tool.execute({ args: { world: '维斯珂帝国', targets: ['grass_1'] } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('确认通道未接入')
    expect(fetchWorldMapBundle).not.toHaveBeenCalled()
    expect(deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('单删：精确 featureId 解析后弹确认，并走正式软删端点', async () => {
    const confirmWrite = vi.fn(async () => ({ status: 'confirmed' }))
    const tool = createTool({ confirmWrite })
    const result = await tool.execute({ args: { world: '维斯珂帝国', targets: ['grass_1'], reason: '重画草原' } })
    expect(confirmWrite).toHaveBeenCalledTimes(1)
    expect(confirmWrite.mock.calls[0][0].lines.join('\n')).toContain('中央草原')
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledTimes(1)
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledWith('world_2', 'grass_1', expect.objectContaining({ runKey: expect.stringContaining('xingyi-map-delete-'), runLabel: expect.stringContaining('重画草原') }))
    expect(result.acted).toBe(true)
    expect(result.details.deletedFeatureIds).toEqual(['grass_1'])
  })

  it('装甲地形缺省整组删除：只传主山体，也会删除同 groupId 的山脊带和峰线；历史共用同一 runKey', async () => {
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['armor_main'] } })
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledTimes(3)
    expect(deleteWorldMapFeatureRemote.mock.calls.map((call) => call[1])).toEqual(['armor_main', 'armor_ridge', 'armor_peak'])
    expect(new Set(deleteWorldMapFeatureRemote.mock.calls.map((call) => call[2].runKey)).size).toBe(1)
    expect(result.details.expandedArmorGroup).toBe(true)
    expect(result.details.deletedFeatureIds).toEqual(['armor_main', 'armor_ridge', 'armor_peak'])
  })

  it('明确 expandArmorGroup=false 时只删指定底层要素', async () => {
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['armor_ridge'], expandArmorGroup: false } })
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledTimes(1)
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledWith('world_2', 'armor_ridge', expect.anything())
    expect(result.details.deletedFeatureIds).toEqual(['armor_ridge'])
  })

  it('批删先整批校验：任一目标不存在时不弹确认、不开始删除', async () => {
    const confirmWrite = vi.fn(async () => ({ status: 'confirmed' }))
    const tool = createTool({ confirmWrite })
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1', '并不存在的山'] } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('不做模糊匹配')
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('同名要素拒绝按名称删除，要求改传 featureId', async () => {
    mockMapState.bundle.sheets[0].features.push(mapFeature('grass_2', '中央草原', { category: 'grass' }))
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['中央草原'] } })
    expect(result.status).toBe('error')
    expect(result.content).toContain('同名要素')
    expect(result.content).toContain('featureId')
    expect(deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('用户取消确认：成功态回执且不删除', async () => {
    const tool = createTool({ confirmWrite: vi.fn(async () => ({ status: 'denied' })) })
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1'] } })
    expect(result.status).toBeUndefined()
    expect(result.details.denied).toBe(true)
    expect(deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('批量部分失败：回执列出已删与失败项，标记 acted=true 且禁止整批重试', async () => {
    deleteWorldMapFeatureRemote
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('网络中断'))
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1', 'armor_main'], expandArmorGroup: false } })
    expect(result.status).toBe('error')
    expect(result.acted).toBe(true)
    expect(result.content).toContain('部分完成')
    expect(result.content).toContain('不要整批重试')
    expect(result.details.deletedFeatureIds).toEqual(['grass_1'])
    expect(result.details.failed).toEqual([expect.objectContaining({ featureId: 'armor_main', message: '网络中断' })])
  })

  // 星依/舆图师地图协作防冲突（2026-07-17地图与剧本工作区专业Agent计划批D后续小修）：
  // 删除前也要查一下该世界是否有舆图师正在跑，避免和舆图师同时改同一张地图。
  it('世界有舆图师正在运行时：拒绝删除，回执提示舆图师正在处理，不弹确认、不调用删除端点', async () => {
    getOrCreateScopeState('cartographer:world_2:sheet_1', 'cartographer', 'world_2:sheet_1').running = true
    const confirmWrite = vi.fn(async () => ({ status: 'confirmed' }))
    const tool = createTool({ confirmWrite })
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1'] } })
    expect(result.content).toContain('舆图师正在处理')
    expect(result.details).toMatchObject({ worldId: 'world_2', cartographerBusy: true })
    expect(confirmWrite).not.toHaveBeenCalled()
    expect(fetchWorldMapBundle).not.toHaveBeenCalled()
    expect(deleteWorldMapFeatureRemote).not.toHaveBeenCalled()
  })

  it('舆图师存在但未运行（running=false）时：删除正常进行，不受影响', async () => {
    getOrCreateScopeState('cartographer:world_2:sheet_1', 'cartographer', 'world_2:sheet_1')
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1'] } })
    expect(result.acted).toBe(true)
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledTimes(1)
  })

  it('只有其他世界的舆图师在运行：不影响本世界删除', async () => {
    getOrCreateScopeState('cartographer:world_other:sheet_1', 'cartographer', 'world_other:sheet_1').running = true
    const tool = createTool()
    const result = await tool.execute({ args: { world: 'world_2', targets: ['grass_1'] } })
    expect(result.acted).toBe(true)
    expect(deleteWorldMapFeatureRemote).toHaveBeenCalledTimes(1)
  })
})
