// 会话内地形写版本号：地图分析网格用它判断缓存是否仍可复用。
// 单独成小模块，避免人工编辑 UI 为一次失效通知把整套绘舆工具打进页面依赖。
const terrainRevisionByWorld = new Map<string, number>()

/** 任意正式地图写入口成功后调用，使同世界的空间分析缓存失效。 */
export function bumpTerrainRevision(worldId: string): void {
  terrainRevisionByWorld.set(worldId, (terrainRevisionByWorld.get(worldId) || 0) + 1)
}

/** 当前世界的会话内地形版本。 */
export function currentTerrainRevision(worldId: string): number {
  return terrainRevisionByWorld.get(worldId) || 0
}

/** 测试隔离专用；正式调用方不需要手动清空。 */
export function resetTerrainRevisionForTest(): void {
  terrainRevisionByWorld.clear()
}
