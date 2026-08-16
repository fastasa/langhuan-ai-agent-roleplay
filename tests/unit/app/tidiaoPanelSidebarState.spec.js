import { describe, expect, it, beforeEach } from 'vitest'
import {
  allocateTidiaoPanelSidebarOwnerKey,
  closeTidiaoPanelSidebar,
  closeTidiaoPanelSidebarIfOwner,
  tidiaoPanelSidebarTarget,
  openTidiaoPanelSidebar
} from '../../../src/app/tidiaoPanelSidebarState.ts'

// 提调带面板挤压侧栏桥（2026-07-10 四面板统一·前身=批次G state 专用桥）：
// 模块级响应式 ref·带子写入、AppChatSection 按 kind 渲染场记/剧本/待办/资料池。
describe('tidiaoPanelSidebarState', () => {
  beforeEach(() => {
    closeTidiaoPanelSidebar()
  })

  const makeStateTarget = (ownerKey) => ({
    kind: 'state',
    ownerKey,
    getStream: () => ({ phase: 'done', decisions: [], shots: [] }),
    getShotDetails: () => undefined,
    getMemoryProjection: () => '喂模型原文'
  })

  it('open 置 target、close 清空；getter 可取数（场记 kind）', () => {
    expect(tidiaoPanelSidebarTarget.value).toBeNull()
    openTidiaoPanelSidebar(makeStateTarget('a'))
    expect(tidiaoPanelSidebarTarget.value?.ownerKey).toBe('a')
    expect(tidiaoPanelSidebarTarget.value?.kind).toBe('state')
    expect(tidiaoPanelSidebarTarget.value?.getMemoryProjection()).toBe('喂模型原文')
    closeTidiaoPanelSidebar()
    expect(tidiaoPanelSidebarTarget.value).toBeNull()
  })

  it('四 kind 互斥：后开覆盖先开（同一 ref 一次只开一个面板）', () => {
    openTidiaoPanelSidebar(makeStateTarget('a'))
    openTidiaoPanelSidebar({ kind: 'script', ownerKey: 'a', getSessionId: () => 's1' })
    expect(tidiaoPanelSidebarTarget.value?.kind).toBe('script')
    expect(tidiaoPanelSidebarTarget.value?.getSessionId()).toBe('s1')
    openTidiaoPanelSidebar({ kind: 'todo', ownerKey: 'a', getSessionId: () => 's1' })
    expect(tidiaoPanelSidebarTarget.value?.kind).toBe('todo')
    openTidiaoPanelSidebar({
      kind: 'pool',
      ownerKey: 'a',
      getPools: () => null,
      getSessionId: () => 's1',
      getCastCharacterIds: () => ['c1'],
      getResolveName: () => undefined
    })
    expect(tidiaoPanelSidebarTarget.value?.kind).toBe('pool')
    expect(tidiaoPanelSidebarTarget.value?.getCastCharacterIds()).toEqual(['c1'])
  })

  it('closeIfOwner：只关自己发起的（owner 不匹配不动·防带子卸载误关别的带打开的）', () => {
    openTidiaoPanelSidebar(makeStateTarget('a'))
    closeTidiaoPanelSidebarIfOwner('b')
    expect(tidiaoPanelSidebarTarget.value?.ownerKey).toBe('a')
    closeTidiaoPanelSidebarIfOwner('a')
    expect(tidiaoPanelSidebarTarget.value).toBeNull()
    // 已关闭时再调是空操作。
    closeTidiaoPanelSidebarIfOwner('a')
    expect(tidiaoPanelSidebarTarget.value).toBeNull()
  })

  it('closeIfOwner 对任意 kind 生效（带子卸载时不论当前开哪个面板）', () => {
    openTidiaoPanelSidebar({ kind: 'todo', ownerKey: 'x', getSessionId: () => 's1' })
    closeTidiaoPanelSidebarIfOwner('x')
    expect(tidiaoPanelSidebarTarget.value).toBeNull()
  })

  it('allocateOwnerKey 每次唯一（多带并存不串）', () => {
    const a = allocateTidiaoPanelSidebarOwnerKey()
    const b = allocateTidiaoPanelSidebarOwnerKey()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^tps_owner_\d+$/)
  })
})
