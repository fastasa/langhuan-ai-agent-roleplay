/**
 * 绘舆 terraform 系列级授权（内存态·地图提速批B·2026-07-12 用户拍板）。
 *
 * 由来：一个改造系列（如删旧地形→画山脉→画盆地）会拆成多次 dispatchMapWork(override:'terraform') 派发，
 * 旧行为每次派发都经 runTerraformStep 弹一张「突破 Lock 保护」确认卡——同一系列弹 4 张卡太烦。
 * 本模块记录「用户已批准过」：授权键=（聊天会话 id + worldId），TTL 30 分钟**滑动续期**（每次沿用刷新计时）；
 * 命中有效授权的后续 terraform 派发跳过弹卡直接放行，回执/运行卡输入段附「已沿用本系列 terraform 授权」。
 *
 * 真值边界（镜像 huiyuStageConfirmState 的内存态口径）：
 * - **纯内存不持久化**——刷新页面即失效，回到逐次弹卡（安全边界收紧方向，丢授权不丢安全）。
 * - **只星依侧接线**（XingyiDock.vue buildXingyiHuiyuEngineDeps 的阻塞确认通道）；提调 advisory 流不接
 *   （useChatSendPipeline 不传 terraformGrant deps，行为与批B 之前完全一致）。
 * - 「不批准」不记录——拒绝行为不变；会话切换（键不同）/超 TTL 自然回到逐次弹卡。
 * - 函数带可选 now 参数供测试注入时刻，正式调用方不传（缺省 Date.now()）——不依赖 fake timers。
 */

/** 授权有效期（滑动窗口）：30 分钟内每次沿用都重新计时。 */
export const HUIYU_TERRAFORM_GRANT_TTL_MS = 30 * 60 * 1000

interface HuiyuTerraformGrantEntry {
  /** 批准时刻标签（HH:MM·记录时格式化一次，沿用回执展示用——滑动续期不改它，始终显示最初批准时刻）。 */
  grantedAtLabel: string
  /** 过期时刻（毫秒时间戳）：每次沿用滑动到 now+TTL。 */
  expiresAt: number
}

const grants = new Map<string, HuiyuTerraformGrantEntry>()

function grantKey(sessionId: string, worldId: string): string {
  return `${sessionId}::${worldId}`
}

function formatTimeLabel(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** 记录一次授权（用户在 terraform 确认卡上点「批准」时调用）：同键重复批准=覆盖（新批准时刻+新计时）。 */
export function recordHuiyuTerraformGrant(sessionId: string, worldId: string, now = Date.now()): void {
  grants.set(grantKey(sessionId, worldId), {
    grantedAtLabel: formatTimeLabel(now),
    expiresAt: now + HUIYU_TERRAFORM_GRANT_TTL_MS
  })
}

/** 尝试沿用授权：命中有效授权返回批准时刻标签并**滑动续期**（expiresAt=now+TTL）；无授权/已过期返回 null
 *  （过期条目顺手清除，不留死数据）。键不同（换会话/换世界）自然不命中。 */
export function reuseHuiyuTerraformGrant(sessionId: string, worldId: string, now = Date.now()): { grantedAtLabel: string } | null {
  const key = grantKey(sessionId, worldId)
  const entry = grants.get(key)
  if (!entry) return null
  if (now > entry.expiresAt) {
    grants.delete(key)
    return null
  }
  entry.expiresAt = now + HUIYU_TERRAFORM_GRANT_TTL_MS
  return { grantedAtLabel: entry.grantedAtLabel }
}

/** 测试隔离用：清空全部授权（模块级 Map 跨用例残留防护，同 resetTerrainRevisionForTest 用法）。 */
export function clearHuiyuTerraformGrantsForTest(): void {
  grants.clear()
}
