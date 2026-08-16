// 工具 details 字段级压缩器（R3-1 · 统一 state 协议）。
//
// 职责：按字段生命周期标签把一次工具 details 拆成两份——
//   - durable：留进压缩投影视图、喂模型（关键事实）。
//   - searchable：清出视图（默认不喂模型省 token），但保真、可被检索工具搜回（R3-4）。
//   - transient：直接丢弃（轮内即清的纯过程噪声，既不喂模型也不进检索）。
//
// 设计要点（讨论稿 §9「解精准 vs 优雅两难」）：压缩逻辑只此一份；保留判断由各工具自包含声明
// （ToolDefinition.fieldLifecycle 静态 + 单次 ToolExecutionResult.lifecycle 覆盖）。本模块只读标签、不含业务判断。

import { DEFAULT_FIELD_LIFECYCLE, type FieldLifecycle, type ToolFieldLifecycleMap } from '../agentRuntime/types'

export interface ToolDetailsProjection {
  /** durable 字段：留进压缩投影视图、喂模型。 */
  durable: Record<string, unknown>
  /** searchable 字段：清出视图（不喂模型）但保真、可检索。 */
  searchable: Record<string, unknown>
}

/** 取某字段的有效生命周期标签：单次 lifecycle 覆盖 > 工具静态 fieldLifecycle > DEFAULT_FIELD_LIFECYCLE。 */
export function resolveFieldLifecycle(
  field: string,
  resultLifecycle: ToolFieldLifecycleMap | undefined,
  toolLifecycle: ToolFieldLifecycleMap | undefined
): FieldLifecycle {
  return resultLifecycle?.[field] ?? toolLifecycle?.[field] ?? DEFAULT_FIELD_LIFECYCLE
}

/**
 * 按字段生命周期标签把工具 details 拆成 durable（喂模型）/ searchable（保真可检索）两份；transient 丢弃。
 * - lifecycle：单次结果覆盖标签；toolLifecycle：工具静态声明。两者都缺的字段按 DEFAULT_FIELD_LIFECYCLE（searchable）。
 * - details 为空/非对象时返回两份空对象（不抛错）。
 */
export function projectToolDetails(
  details: Record<string, unknown> | undefined,
  lifecycle?: ToolFieldLifecycleMap,
  toolLifecycle?: ToolFieldLifecycleMap
): ToolDetailsProjection {
  const durable: Record<string, unknown> = {}
  const searchable: Record<string, unknown> = {}
  if (!details || typeof details !== 'object') return { durable, searchable }
  for (const [key, value] of Object.entries(details)) {
    const tag = resolveFieldLifecycle(key, lifecycle, toolLifecycle)
    if (tag === 'durable') durable[key] = value
    else if (tag === 'searchable') searchable[key] = value
    // transient：丢弃（不进 durable、不进 searchable）。
  }
  return { durable, searchable }
}
