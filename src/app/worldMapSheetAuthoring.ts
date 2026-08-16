import { saveWorldMapSheetRemote } from '../repositories/chatRepository'
import type { WorldMapSheet } from '../types'

/**
 * 空舆图建立第一张正式图纸的应用层入口。
 * 组件只表达用户动作；世界归属校验、默认图纸写入与持久化仍由服务端地图领域完成。
 */
export async function createInitialWorldMapSheet(input: {
  worldId: string
  name: string
}): Promise<WorldMapSheet> {
  const worldId = String(input.worldId || '').trim()
  const name = String(input.name || '').trim()
  if (!worldId) throw new Error('建立图纸失败：缺少世界作用域')
  if (!name) throw new Error('建立图纸失败：图纸名称不能为空')
  return saveWorldMapSheetRemote(worldId, { name })
}
