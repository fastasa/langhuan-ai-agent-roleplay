import type { WorldMapBundle, WorldMapSheet } from '../types'

/**
 * 世界默认图纸的前端唯一解析入口。
 * 服务端字段为正式真值；旧响应缺字段时才兼容回退第一张，避免各消费者各写一套规则。
 */
export function resolveWorldDefaultMapSheet(bundle: WorldMapBundle | null | undefined): WorldMapSheet | null {
  if (!bundle) return null
  const defaultSheetId = String(bundle.defaultMapSheetId || bundle.world?.defaultMapSheetId || '').trim()
  if (defaultSheetId) {
    const matched = bundle.sheets.find((sheet) => sheet.id === defaultSheetId)
    if (matched) return matched
  }
  return bundle.sheets[0] || null
}
