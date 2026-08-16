/**
 * 舆图实时刷新信号（2026-07-12）：地图远程写（saveWorldMapSheetRemote/saveWorldMapFeaturesRemote/
 * deleteWorldMapFeatureRemote，唯一出口=chatRepository.ts）成功后 bump，MapViewerDialog 监听后
 * 静默重拉重绘——绘舆子agent 落笔即时写服务端 DB，但舆图弹窗原本只在打开/切世界时拉一次数据。
 * 纯前端内存信号（绘舆工具与舆图弹窗同在一个前端运行时），不涉及网络推送/轮询。
 */
import { computed, ref } from 'vue'

interface WorldMapRevisionState {
  /** 单调递增版本号：任意一次地图写成功都 +1（不区分具体写了什么，消费方只管重拉）。 */
  rev: number
  /** 本次变更所属的 worldId；调用方没传（或传空）时记 null，表示"不确定，按需重拉的一方自行判断"。 */
  worldId: string | null
}

const state = ref<WorldMapRevisionState>({ rev: 0, worldId: null })

/** 地图远程写成功后调用；worldId 缺省=未知归属（消费方应视为"可能与自己相关"）。 */
export function bumpWorldMapRevision(worldId?: string): void {
  state.value = {
    rev: state.value.rev + 1,
    worldId: worldId ? String(worldId).trim() || null : null
  }
}

/** 只读暴露：消费方 watch 它，rev 变化即说明有新的地图写发生。 */
export const worldMapRevision = computed(() => state.value)

/** 测试专用：复位到初始态。 */
export function resetWorldMapRevisionForTest(): void {
  state.value = { rev: 0, worldId: null }
}
