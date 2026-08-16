import type { AgentContextBundle } from '../../../shared/agentContextProjection'
import type { DirectorOrchestrationProjection } from '../../../shared/orchestrationWorkspace'

/**
 * 从提调统一上下文中取得本轮唯一编排快照。
 * 候选、状态、种子和提示词必须共用这份结构化值，禁止再从渲染文本搜索版本号。
 */
export function requireDirectorOrchestrationProjection(bundle: AgentContextBundle): DirectorOrchestrationProjection {
  const result = bundle.projections.find((item) => (
    item.status === 'available' && item.projection.kind === 'orchestration.workspace'
  ))
  if (!result || result.status !== 'available') {
    throw new Error('提调统一上下文缺少结构化编排投影，已中止本轮。')
  }

  const projection = result.projection.value as DirectorOrchestrationProjection | null
  const sourceVersion = String(result.projection.sourceVersion ?? '').trim()
  const viewRevision = String(projection?.scope?.viewRevision ?? '').trim()
  const bundleSessionId = String(bundle.scope.sessionId ?? '').trim()
  const projectionSessionId = String(projection?.scope?.sessionId ?? '').trim()
  if (!projection || !viewRevision || sourceVersion !== viewRevision) {
    throw new Error('提调统一上下文内的编排投影版本无效，已中止本轮。')
  }
  if (!bundleSessionId || projectionSessionId !== bundleSessionId) {
    throw new Error('提调统一上下文与编排投影会话作用域不一致，已中止本轮。')
  }
  return projection
}
