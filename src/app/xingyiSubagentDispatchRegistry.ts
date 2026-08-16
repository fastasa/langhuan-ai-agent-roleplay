/**
 * 星依「在飞子agent登记」（地图严谨协作与运行卡计划批1·2026-07-11）。
 *
 * 星依浮坞本身不属于任何一个目标会话——派绘舆/纠偏轮时，真正的运行状态记在 subagentRunStatus
 * （键=`${目标sessionId}::${subagentId}`），但浮坞不知道该去哪些会话查。本登记表只记
 * "星依派发过去哪个会话 + 哪个子agent前缀"，浮坞据此汇总跨会话运行卡——**不做双写**：状态本身
 * 只有 subagentRunStatus 一处真值，这里只记「去哪查」，不缓存状态本身。
 * 同一段星依对话内只增不删（同键去重）；显式 `/clear` / “开启新对话”时清空登记，
 * 避免上一段对话派出的子 Agent 卡片串进新对话。subagentRunStatus 仍是运行状态唯一真值。
 */
import { ref } from 'vue'

export interface XingyiDispatchRegistryEntry {
  sessionId: string
  /** subagentId 前缀（不含冒号），如 'huiyu'/'tidiao'。 */
  prefix: string
}

const entries = ref<XingyiDispatchRegistryEntry[]>([])

/** 派发起始时登记一条「去哪查」（同 sessionId+prefix 去重，重复登记是 no-op）。 */
export function registerXingyiDispatch(sessionId: string, prefix: string): void {
  const sid = String(sessionId || '').trim()
  const pfx = String(prefix || '').trim()
  if (!sid || !pfx) return
  if (entries.value.some((entry) => entry.sessionId === sid && entry.prefix === pfx)) return
  entries.value = [...entries.value, { sessionId: sid, prefix: pfx }]
}

/** 读全部登记条目（响应式：组件 computed 里调用即自动跟随新增）。 */
export function listXingyiDispatchRegistry(): XingyiDispatchRegistryEntry[] {
  return entries.value
}

/** 显式新对话：只清浮坞“去哪查”的展示登记，不改 subagentRunStatus 运行真值。 */
export function clearXingyiDispatchRegistry(): void {
  entries.value = []
}

/** 测试专用别名。 */
export const resetXingyiDispatchRegistryForTest = clearXingyiDispatchRegistry
