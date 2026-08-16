import { afterEach, describe, expect, it } from 'vitest'
import {
  getOrCreateScopeState,
  findScopeState,
  disposeScopeState,
  buildScriptwriterScopeKey,
  buildPersonalityTrainerScopeKey,
  buildCartographerScopeKey,
  buildCartographerTargetId,
  cartographerWorldScopePrefix,
  createScopeMapDraftReviewChannel,
  createScopeConfirmWriteChannel,
  getOrCreateWorkspaceAgentWriteApprovalMode,
  isCartographerBusyForWorld,
  resetWorkspaceAgentScopeStateForTest
} from '../../../src/app/workspaceAgentScopeState.ts'

// 工作区专业Agent（编剧/舆图师/人格训练师）按作用域可多实例并存的运行状态容器：
// 骨架照抄 subagentRunStatus.ts 的 Record<key, State> 模式，验证两点铁律——
// ①不同 scope 互不干扰（根治 XingyiDock 全局单例串台问题）；②运行中/待确认卡不因组件卸载被误清空。
describe('workspaceAgentScopeState · 按作用域独立运行状态', () => {
  afterEach(() => {
    resetWorkspaceAgentScopeStateForTest()
  })

  it('scopeKey 命名：编剧按世界、舆图师按世界+图纸、人格训练师按角色', () => {
    expect(buildScriptwriterScopeKey('world_1')).toBe('scriptwriter:world_1')
    expect(buildCartographerScopeKey('world_1', 'sheet_1')).toBe('cartographer:world_1:sheet_1')
    expect(buildPersonalityTrainerScopeKey('char_1')).toBe('personality-trainer:char_1')
  })

  it('不同角色的人格训练师会话和写入模式互不串线', () => {
    const firstKey = buildPersonalityTrainerScopeKey('char_1')
    const secondKey = buildPersonalityTrainerScopeKey('char_2')
    const first = getOrCreateScopeState(firstKey, 'personality_trainer', 'char_1')
    const second = getOrCreateScopeState(secondKey, 'personality_trainer', 'char_2')
    first.messages.push({ role: 'user', content: '把剩余题目改得更善良' })
    getOrCreateWorkspaceAgentWriteApprovalMode(firstKey).autoApproveWrites = true

    expect(second.messages).toEqual([])
    expect(getOrCreateWorkspaceAgentWriteApprovalMode(secondKey).autoApproveWrites).toBe(false)
  })

  it('两个不同 scopeKey 各自独立，互不覆盖（根治 XingyiDock 全局单例串台）', () => {
    const scriptState = getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')
    const mapState = getOrCreateScopeState('cartographer:world_1:sheet_1', 'cartographer', 'world_1:sheet_1')

    scriptState.draft = '编剧的草稿'
    scriptState.messages.push({ role: 'user', content: '编剧收到的消息' })
    mapState.draft = '舆图师的草稿'
    mapState.messages.push({ role: 'user', content: '舆图师收到的消息' })

    expect(scriptState.draft).toBe('编剧的草稿')
    expect(mapState.draft).toBe('舆图师的草稿')
    expect(scriptState.messages).toHaveLength(1)
    expect(mapState.messages).toHaveLength(1)
    expect(scriptState.messages[0].content).not.toBe(mapState.messages[0].content)
  })

  it('同一 scopeKey 重复获取返回同一个响应式对象，不重置已有状态', () => {
    const first = getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')
    first.draft = '不该被清空'
    const second = getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')
    expect(second.draft).toBe('不该被清空')
    expect(second).toBe(first)
  })

  it('写权限模式按 scope 隔离，自动放行只影响对应 confirmWrite 通道', async () => {
    const scriptMode = getOrCreateWorkspaceAgentWriteApprovalMode('scriptwriter:world_1')
    const mapMode = getOrCreateWorkspaceAgentWriteApprovalMode('cartographer:world_1:sheet_1')
    scriptMode.autoApproveWrites = true

    const scriptAnswer = await createScopeConfirmWriteChannel(
      'scriptwriter:world_1', 'scriptwriter', 'world_1'
    )({ title: '保存种子', lines: [] })
    expect(scriptAnswer).toEqual({ status: 'confirmed' })
    expect(mapMode.autoApproveWrites).toBe(false)
    expect(findScopeState('cartographer:world_1:sheet_1')).toBeNull()
  })

  it('disposeScopeState：running 为 true 时拒绝清空（模拟组件卸载重挂载不丢在途任务）', () => {
    const state = getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')
    state.running = true

    const disposed = disposeScopeState('scriptwriter:world_1')

    expect(disposed).toBe(false)
    expect(findScopeState('scriptwriter:world_1')).not.toBeNull()
  })

  it('disposeScopeState：存在待确认卡时拒绝清空', () => {
    const state = getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')
    state.pendingInteraction = {
      request: { kind: 'confirm', title: '确认修改种子', source: { agent: 'scriptwriter', toolName: 'editSeed' } },
      resolve: () => {}
    }

    const disposed = disposeScopeState('scriptwriter:world_1')

    expect(disposed).toBe(false)
    expect(findScopeState('scriptwriter:world_1')).not.toBeNull()
  })

  it('disposeScopeState：running 为 false 且无待确认卡时正常清空', () => {
    getOrCreateScopeState('scriptwriter:world_1', 'scriptwriter', 'world_1')

    const disposed = disposeScopeState('scriptwriter:world_1')

    expect(disposed).toBe(true)
    expect(findScopeState('scriptwriter:world_1')).toBeNull()
  })

  it('disposeScopeState：清空不存在的 scopeKey 视为成功（无需报错）', () => {
    expect(disposeScopeState('scriptwriter:never_created')).toBe(true)
  })

  it('createScopeMapDraftReviewChannel：请求投影到 pendingMapDraftReview；resolve 后清空并落定 Promise（舆图师批C）', async () => {
    const channel = createScopeMapDraftReviewChannel('cartographer:world_1:sheet_1', 'cartographer', 'world_1:sheet_1')
    const request = { kind: 'map-final-draft-review', worldId: 'world_1', sheetId: 'sheet_1', baseRevision: 'rev1', title: '确认新地形', items: [] }

    const resolutionPromise = channel(request)
    const state = findScopeState('cartographer:world_1:sheet_1')
    expect(state?.pendingMapDraftReview?.request).toEqual(request)

    state.pendingMapDraftReview.resolve({ status: 'submitted', decision: { confirmed: [], modified: [], deleted: [], comments: {} } })
    const resolution = await resolutionPromise

    expect(resolution).toEqual({ status: 'submitted', decision: { confirmed: [], modified: [], deleted: [], comments: {} } })
    expect(state?.pendingMapDraftReview).toBeNull()
  })

  it('disposeScopeState：存在待审阅地图草稿时拒绝清空（舆图师批C）', () => {
    const state = getOrCreateScopeState('cartographer:world_1:sheet_1', 'cartographer', 'world_1:sheet_1')
    state.pendingMapDraftReview = {
      request: { kind: 'map-final-draft-review', worldId: 'world_1', sheetId: 'sheet_1', baseRevision: 'rev1', title: '确认新地形', items: [] },
      resolve: () => {}
    }

    const disposed = disposeScopeState('cartographer:world_1:sheet_1')

    expect(disposed).toBe(false)
    expect(findScopeState('cartographer:world_1:sheet_1')).not.toBeNull()
  })

  // 星依/舆图师地图协作防冲突（2026-07-17地图与剧本工作区专业Agent计划批D后续小修）：
  // 星依动手改地图前按世界粒度查一下有没有舆图师正在跑，避免两个agent同时改同一张地图。
  it('isCartographerBusyForWorld：该世界某张图纸的舆图师 running=true 时判定为忙', () => {
    const state = getOrCreateScopeState('cartographer:world_1:sheet_1', 'cartographer', 'world_1:sheet_1')
    state.running = true

    expect(isCartographerBusyForWorld('world_1')).toBe(true)
  })

  it('isCartographerBusyForWorld：舆图师存在但 running=false 时判定为不忙', () => {
    getOrCreateScopeState('cartographer:world_1:sheet_1', 'cartographer', 'world_1:sheet_1')

    expect(isCartographerBusyForWorld('world_1')).toBe(false)
  })

  it('isCartographerBusyForWorld：没有任何该世界的舆图师状态时判定为不忙；不同世界互不影响', () => {
    const otherState = getOrCreateScopeState('cartographer:world_2:sheet_9', 'cartographer', 'world_2:sheet_9')
    otherState.running = true

    expect(isCartographerBusyForWorld('world_1')).toBe(false)
    expect(isCartographerBusyForWorld('world_2')).toBe(true)
  })

  it('isCartographerBusyForWorld：worldId 为空字符串时直接返回 false', () => {
    expect(isCartographerBusyForWorld('')).toBe(false)
  })

  // 修复批F：scopeKey/targetId 字符串格式收敛为单一编解码器（此前 targetId 在 MapViewerDialog.vue
  // 三处手拼、isCartographerBusyForWorld 前缀单独手拼，格式一变就会互相脱钩）。
  it('buildCartographerTargetId：格式为 worldId:sheetId，且 buildCartographerScopeKey 内部复用它拼出同一 targetId 段', () => {
    expect(buildCartographerTargetId('world_1', 'sheet_1')).toBe('world_1:sheet_1')
    expect(buildCartographerScopeKey('world_1', 'sheet_1')).toBe(`cartographer:${buildCartographerTargetId('world_1', 'sheet_1')}`)
  })

  it('cartographerWorldScopePrefix：与 buildCartographerScopeKey 的前缀部分逐字节一致', () => {
    const scopeKey = buildCartographerScopeKey('world_1', 'sheet_1')
    const prefix = cartographerWorldScopePrefix('world_1')

    expect(scopeKey.startsWith(prefix)).toBe(true)
    expect(prefix).toBe('cartographer:world_1:')
  })

  it('isCartographerBusyForWorld：改走 cartographerWorldScopePrefix 访问器后仍能正确匹配同世界不同图纸', () => {
    const state = getOrCreateScopeState(
      buildCartographerScopeKey('world_1', 'sheet_1'),
      'cartographer',
      buildCartographerTargetId('world_1', 'sheet_1')
    )
    state.running = true

    expect(isCartographerBusyForWorld('world_1')).toBe(true)
  })
})
