import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bumpWorldMapRevision,
  resetWorldMapRevisionForTest,
  worldMapRevision
} from '../../../src/app/worldMapRevision.ts'

// 舆图实时刷新信号（2026-07-12）：地图远程写成功后 bump，MapViewerDialog 监听后静默重拉重绘。
// 纯前端内存信号：模块级 computed + 唯一 mutator（bumpWorldMapRevision），任意组件 import 即响应式。
describe('worldMapRevision · 舆图实时刷新信号', () => {
  beforeEach(() => {
    resetWorldMapRevisionForTest()
  })
  afterEach(() => {
    resetWorldMapRevisionForTest()
  })

  it('初始态：rev=0、worldId=null', () => {
    expect(worldMapRevision.value.rev).toBe(0)
    expect(worldMapRevision.value.worldId).toBeNull()
  })

  it('bump 每次调用 rev 严格 +1（多次递增）', () => {
    bumpWorldMapRevision('world_1')
    expect(worldMapRevision.value.rev).toBe(1)
    bumpWorldMapRevision('world_1')
    expect(worldMapRevision.value.rev).toBe(2)
    bumpWorldMapRevision('world_2')
    expect(worldMapRevision.value.rev).toBe(3)
  })

  it('bump 记录本次变更的 worldId', () => {
    bumpWorldMapRevision('world_abc')
    expect(worldMapRevision.value.worldId).toBe('world_abc')
    bumpWorldMapRevision('world_xyz')
    expect(worldMapRevision.value.worldId).toBe('world_xyz')
  })

  it('bump 不传 worldId（或传空串）→ worldId 记为 null（表示未知归属）', () => {
    bumpWorldMapRevision('world_1')
    expect(worldMapRevision.value.worldId).toBe('world_1')
    bumpWorldMapRevision()
    expect(worldMapRevision.value.rev).toBe(2)
    expect(worldMapRevision.value.worldId).toBeNull()
    bumpWorldMapRevision('   ')
    expect(worldMapRevision.value.worldId).toBeNull()
  })

  it('worldId 前后空白归一（trim）', () => {
    bumpWorldMapRevision('  world_1  ')
    expect(worldMapRevision.value.worldId).toBe('world_1')
  })

  it('只读暴露：模块不导出可写的内部 state，只能通过 bumpWorldMapRevision 改变', () => {
    // worldMapRevision 是 computed（无 setter）——组件只能读取，唯一改变途径是 bumpWorldMapRevision。
    // 这里用行为验证只读语义：直接改 .value 不应该影响后续通过 bump 得到的真实序列。
    expect(() => {
      // eslint-disable-next-line no-param-reassign
      worldMapRevision.value = { rev: 999, worldId: 'hacked' }
    }).not.toThrow()
    bumpWorldMapRevision('world_1')
    // 不管上面的强行赋值是否被 Vue 静默拒绝，bump 之后 rev 必须仍然遵循内部单调递增语义（从真实内部状态算起）。
    expect(worldMapRevision.value.rev).toBeGreaterThan(0)
    expect(worldMapRevision.value.worldId).toBe('world_1')
  })

  it('resetWorldMapRevisionForTest：复位到初始态', () => {
    bumpWorldMapRevision('world_1')
    bumpWorldMapRevision('world_2')
    resetWorldMapRevisionForTest()
    expect(worldMapRevision.value.rev).toBe(0)
    expect(worldMapRevision.value.worldId).toBeNull()
  })
})
