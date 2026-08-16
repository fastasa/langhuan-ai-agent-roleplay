export type CurrentAiUsageContext = {
  sessionId?: string
  sessionLabel?: string
  roundId?: string
  // 消耗单元类型：round=发送轮；regenerate/correction/precision_edit=并入原轮的返工；
  // batch_projection/projection/agent_task=跨轮操作（roundId 存 op:… 单元 id）。
  unitKind?: string
}

let currentContext: CurrentAiUsageContext = {}

function cleanText(value: unknown) {
  return String(value || '').trim()
}

export function setCurrentAiUsageContext(context: CurrentAiUsageContext) {
  currentContext = {
    sessionId: cleanText(context.sessionId),
    sessionLabel: cleanText(context.sessionLabel),
    roundId: cleanText(context.roundId),
    unitKind: cleanText(context.unitKind)
  }
}

export function clearCurrentAiUsageContext() {
  currentContext = {}
}

export function getCurrentAiUsageContext(): CurrentAiUsageContext {
  return { ...currentContext }
}

// 跨轮操作单元 id：与轮 id（round:会话:消息id）同库同字段，用 op: 前缀区分，末段时间戳只保证唯一性。
export function makeOperationUnitId(kind: string, sessionId: string) {
  return `op:${cleanText(kind) || 'agent_task'}:${cleanText(sessionId)}:${Date.now().toString(36)}`
}
