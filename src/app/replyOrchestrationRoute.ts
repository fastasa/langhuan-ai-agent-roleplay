export type ReplyOrchestrationRoute = 'reuse' | 'orchestrate'

export const REPLY_SITUATION_DEPENDENCY_KEYS = {
  curtain: 'curtain',
  presence: 'presence',
  statusPanels: 'statusPanels',
  narrativeSeeds: 'narrativeSeeds',
  chatProjection: 'chatProjection',
  personality: 'personality',
  promptPreset: 'promptPreset'
} as const

export type ReplySituationDependencyValue = string | number | boolean | null

/**
 * 情境检查点依赖的可扩展版本向量。values 中的 key 由供给方命名；fingerprint 可覆盖
 * 无法或不值得逐项展开的完整投影。空值表示本轮没有拿到该依赖版本，而不是版本已被清空。
 */
export interface ReplySituationDependencySnapshot {
  fingerprint?: string
  values: Readonly<Record<string, ReplySituationDependencyValue | undefined>>
}

export interface ReplySituationCheckpointAnchor {
  messageId?: string
  sourceArtifactId?: string
  stateVersion?: number
  updatedAt?: string
}

export interface ReplySituationCheckpoint {
  code: string
  label?: string
  summary?: string
  anchor?: ReplySituationCheckpointAnchor
  dependencySnapshot?: ReplySituationDependencySnapshot
}

export type ReplySituationDependencyStatus = 'unchanged' | 'changed' | 'unknown'

export interface ReplySituationDependencyComparison {
  status: ReplySituationDependencyStatus
  reason: string
  comparedKeys: string[]
  changedKeys: string[]
  unknownKeys: string[]
  previousFingerprint?: string
  currentFingerprint?: string
}

export interface ReplyOrchestrationRouteDecision {
  route: ReplyOrchestrationRoute
  reason: string
  confidence: number
  reusedScenario: ReplySituationCheckpoint | null
  /** 可直接写入路由审计；reason 不依赖模型输出。 */
  dependencyComparison: ReplySituationDependencyComparison
}

export interface ReplyOrchestrationRouteInput {
  previousScenario?: ReplySituationCheckpoint | null
  currentUserInput: string
  establishedContext?: string
  recentTail?: string
  sceneContext?: string
  hasAttachments?: boolean
  hasPrivateDirectorDirectives?: boolean
  forcedCharacterIds?: string[]
  excludedCharacterIds?: string[]
  currentDependencySnapshot?: ReplySituationDependencySnapshot | null
}

const ROUTE_SYSTEM_PROMPT = [
  '你是琅嬛聊天链路的轻量续接判定器，只判断当前用户消息能否复用上一轮已经确认的情境与事实。',
  '把上一轮检查点当作已成立背景，不重新判定它，也不要生成回复正文、角色计划、旁白或工具调用。',
  '仅当本轮是同一时间、地点、参与者、目标、事实与约束下的自然续话，且无需查资料、改状态、推进事件或统筹多人时，选择 reuse。',
  '出现新人物或出入场、时间地点变化、用户行动、事实新增/否定/纠正、物品或状态变化、剧情推进、待办结算、私密导演要求、需要旁白或多人调度，选择 orchestrate。',
  '如果最近原文尾部已经在检查点之后引入了尚未收束的变化，也选择 orchestrate，不能等到变化被遗忘后继续复用旧检查点。',
  '拿不准时一律选择 orchestrate。不要因为上一轮属于某个特殊情境就机械沿用；只比较本轮是否真的改变了情境。',
  '回复必须是单个 JSON 对象，不要 Markdown：{"route":"reuse|orchestrate","reason":"一句简短理由","confidence":0到1,"scenarioCode":"复用时填写上一轮 code，否则留空"}'
].join('\n')

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function clampConfidence(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(1, Math.max(0, number))
}

function normalizedDependencyValue(value: ReplySituationDependencyValue | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const normalized = String(value).trim()
  return normalized || null
}

function normalizedDependencyValues(
  snapshot?: ReplySituationDependencySnapshot | null
): Map<string, string> {
  const result = new Map<string, string>()
  const values = snapshot?.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) return result
  for (const rawKey of Object.keys(values).sort()) {
    const key = text(rawKey)
    const value = normalizedDependencyValue(values[rawKey])
    if (key && value !== null) result.set(key, value)
  }
  return result
}

function unknownDependencyComparison(reason: string): ReplySituationDependencyComparison {
  return {
    status: 'unknown',
    reason,
    comparedKeys: [],
    changedKeys: [],
    unknownKeys: []
  }
}

/**
 * 比较检查点创建时与当前轮的依赖版本。changed 是确定性硬证据；缺失任一侧只记 unknown，
 * 交给后续轻判当前用户语义，避免旧版 code/label/summary 检查点被强制升级为完整统筹。
 */
export function compareReplySituationDependencySnapshots(
  previous?: ReplySituationDependencySnapshot | null,
  current?: ReplySituationDependencySnapshot | null
): ReplySituationDependencyComparison {
  if (!previous && !current) return unknownDependencyComparison('检查点与当前轮都没有依赖快照')
  if (!previous) return unknownDependencyComparison('上一轮检查点没有依赖快照')
  if (!current) return unknownDependencyComparison('当前轮没有依赖快照')

  const previousFingerprint = text(previous.fingerprint)
  const currentFingerprint = text(current.fingerprint)
  const previousValues = normalizedDependencyValues(previous)
  const currentValues = normalizedDependencyValues(current)
  const keys = Array.from(new Set([...previousValues.keys(), ...currentValues.keys()]))
    .sort()
  const comparedKeys: string[] = []
  const changedKeys: string[] = []
  const unknownKeys: string[] = []

  for (const key of keys) {
    const previousValue = previousValues.get(key)
    const currentValue = currentValues.get(key)
    if (previousValue === undefined || currentValue === undefined) {
      unknownKeys.push(key)
      continue
    }
    comparedKeys.push(key)
    if (previousValue !== currentValue) changedKeys.push(key)
  }

  if (changedKeys.length > 0) {
    return {
      status: 'changed',
      reason: `依赖版本已变化：${changedKeys.join('、')}`,
      comparedKeys,
      changedKeys,
      unknownKeys,
      ...(previousFingerprint ? { previousFingerprint } : {}),
      ...(currentFingerprint ? { currentFingerprint } : {})
    }
  }
  if (previousFingerprint && currentFingerprint && previousFingerprint !== currentFingerprint) {
    return {
      status: 'changed',
      reason: '情境依赖总指纹已变化',
      comparedKeys,
      changedKeys: ['$fingerprint'],
      unknownKeys,
      previousFingerprint,
      currentFingerprint
    }
  }
  if (previousFingerprint && currentFingerprint && previousFingerprint === currentFingerprint) {
    return {
      status: 'unchanged',
      reason: '情境依赖总指纹未变化',
      comparedKeys,
      changedKeys: [],
      unknownKeys: [],
      previousFingerprint,
      currentFingerprint
    }
  }
  if (Boolean(previousFingerprint) !== Boolean(currentFingerprint)) {
    return {
      status: 'unknown',
      reason: '依赖总指纹只在一侧存在，不能确认完整情境是否未变',
      comparedKeys,
      changedKeys: [],
      unknownKeys: Array.from(new Set([...unknownKeys, '$fingerprint'])),
      ...(previousFingerprint ? { previousFingerprint } : {}),
      ...(currentFingerprint ? { currentFingerprint } : {})
    }
  }
  if (unknownKeys.length > 0) {
    return {
      status: 'unknown',
      reason: `以下依赖缺少一侧版本：${unknownKeys.join('、')}`,
      comparedKeys,
      changedKeys: [],
      unknownKeys,
      ...(previousFingerprint ? { previousFingerprint } : {}),
      ...(currentFingerprint ? { currentFingerprint } : {})
    }
  }
  if (comparedKeys.length > 0) {
    return {
      status: 'unchanged',
      reason: `已核对的情境依赖未变化：${comparedKeys.join('、')}`,
      comparedKeys,
      changedKeys: [],
      unknownKeys: [],
      ...(previousFingerprint ? { previousFingerprint } : {}),
      ...(currentFingerprint ? { currentFingerprint } : {})
    }
  }
  return {
    ...unknownDependencyComparison('依赖快照中没有可比较的版本或指纹'),
    ...(previousFingerprint ? { previousFingerprint } : {}),
    ...(currentFingerprint ? { currentFingerprint } : {})
  }
}

function dependencyComparisonForInput(input: ReplyOrchestrationRouteInput): ReplySituationDependencyComparison {
  return compareReplySituationDependencySnapshots(
    input.previousScenario?.dependencySnapshot,
    input.currentDependencySnapshot
  )
}

function orchestrate(
  reason: string,
  dependencyComparison = unknownDependencyComparison('本次路由没有可用的依赖比较结果')
): ReplyOrchestrationRouteDecision {
  return { route: 'orchestrate', reason, confidence: 1, reusedScenario: null, dependencyComparison }
}

/**
 * 不需要模型参与的硬边界。命中这些信号时直接走完整统筹；只有真正可能续接的轮次才支付一次轻判调用。
 */
export function resolveHardReplyOrchestrationRoute(
  input: ReplyOrchestrationRouteInput
): ReplyOrchestrationRouteDecision | null {
  const dependencyComparison = dependencyComparisonForInput(input)
  const previousCode = text(input.previousScenario?.code)
  if (!previousCode) return orchestrate('没有可复用的上一轮情境检查点', dependencyComparison)
  if (!text(input.currentUserInput)) return orchestrate('当前输入为空，不能安全复用', dependencyComparison)
  if (dependencyComparison.status === 'changed') {
    return orchestrate(`情境依赖发生变化：${dependencyComparison.reason}`, dependencyComparison)
  }
  if (input.hasAttachments) return orchestrate('本轮带有新附件，需要重新核对情境', dependencyComparison)
  if (input.hasPrivateDirectorDirectives) return orchestrate('本轮含私密导演指令，需要完整统筹', dependencyComparison)
  if ((input.forcedCharacterIds || []).some((id) => text(id))) return orchestrate('本轮点名了角色，需要重新安排参与者', dependencyComparison)
  if ((input.excludedCharacterIds || []).some((id) => text(id))) return orchestrate('本轮排除了角色，需要重新安排参与者', dependencyComparison)
  return null
}

export function buildReplyOrchestrationRouteMessages(
  input: ReplyOrchestrationRouteInput
): Array<{ role: 'system' | 'user'; content: string }> {
  const previous = input.previousScenario
  const dependencyComparison = dependencyComparisonForInput(input)
  const previousLines = [
    `code: ${text(previous?.code) || '(无)'}`,
    text(previous?.label) ? `label: ${text(previous?.label)}` : '',
    text(previous?.summary) ? `summary: ${text(previous?.summary)}` : '',
    text(previous?.anchor?.messageId) ? `anchorMessageId: ${text(previous?.anchor?.messageId)}` : '',
    text(previous?.anchor?.sourceArtifactId) ? `sourceArtifactId: ${text(previous?.anchor?.sourceArtifactId)}` : ''
  ].filter(Boolean)
  const dependencyBlock = {
    comparison: dependencyComparison,
    checkpoint: previous?.dependencySnapshot || null,
    current: input.currentDependencySnapshot || null
  }
  const user = [
    '【上一轮已确认检查点】',
    previousLines.join('\n'),
    `\n【情境依赖核对（结构化数据）】\n${JSON.stringify(dependencyBlock)}`,
    text(input.establishedContext) ? `\n【已折叠的长期背景】\n${text(input.establishedContext).slice(0, 2000)}` : '',
    text(input.sceneContext) ? `\n【当前帷幕】\n${text(input.sceneContext)}` : '',
    text(input.recentTail) ? `\n【最近原文尾部】\n${text(input.recentTail)}` : '',
    `\n【当前用户输入】\n${text(input.currentUserInput)}`,
    '\n只判断这条输入是否改变了检查点；不要重做上一轮判断。'
  ].filter(Boolean).join('\n')
  return [
    { role: 'system', content: ROUTE_SYSTEM_PROMPT },
    { role: 'user', content: user }
  ]
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = text(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/**
 * 解析失败、低置信或 code 漂移都保守回完整统筹，避免一次快判错误把事实维护静默跳过。
 */
export function parseReplyOrchestrationRouteDecision(
  raw: string,
  previousScenario?: ReplySituationCheckpoint | null,
  dependencyComparison = compareReplySituationDependencySnapshots(previousScenario?.dependencySnapshot, null)
): ReplyOrchestrationRouteDecision {
  if (dependencyComparison.status === 'changed') {
    return orchestrate(`情境依赖发生变化：${dependencyComparison.reason}`, dependencyComparison)
  }
  const parsed = extractJsonObject(raw)
  if (!parsed) return orchestrate('续接判定格式无效，保守进入完整统筹', dependencyComparison)
  const routeRaw = text(parsed.route).toLowerCase()
  const route: ReplyOrchestrationRoute = routeRaw === 'reuse' || routeRaw === 'direct' || routeRaw === 'fast'
    ? 'reuse'
    : 'orchestrate'
  const confidence = clampConfidence(parsed.confidence)
  const reason = text(parsed.reason) || (route === 'reuse' ? '情境未发生实质变化' : '本轮需要重新统筹')
  if (route !== 'reuse') return { route, reason, confidence, reusedScenario: null, dependencyComparison }

  const previousCode = text(previousScenario?.code)
  const returnedCode = text(parsed.scenarioCode ?? parsed.scenario_code)
  if (!previousCode) return orchestrate('没有上一轮情境，不能执行复用', dependencyComparison)
  if (!returnedCode) return orchestrate('续接判定未回传上一轮情境编码，转入完整统筹', dependencyComparison)
  if (returnedCode.toLowerCase() !== previousCode.toLowerCase()) {
    return orchestrate('续接判定返回了不同情境，转入完整统筹', dependencyComparison)
  }
  if (confidence < 0.7) return orchestrate('续接判定置信度不足，保守进入完整统筹', dependencyComparison)
  return {
    route: 'reuse',
    reason,
    confidence,
    dependencyComparison,
    reusedScenario: {
      code: previousCode,
      ...(text(previousScenario?.label) ? { label: text(previousScenario?.label) } : {}),
      ...(text(previousScenario?.summary) ? { summary: text(previousScenario?.summary) } : {}),
      ...(previousScenario?.anchor ? { anchor: previousScenario.anchor } : {}),
      ...(previousScenario?.dependencySnapshot ? { dependencySnapshot: previousScenario.dependencySnapshot } : {})
    }
  }
}

/** 最近尾部只给轻判器看，按消息截断；旧完整历史、工具轨迹和审计块不重复装入。 */
export function renderReplyOrchestrationRecentTail(
  messages: Array<Record<string, unknown>>,
  limit = 6,
  maxCharsPerMessage = 240
): string {
  return (messages || [])
    .filter((message) => {
      const hidden = message.autoWriteHidden ?? message.auto_write_hidden
      const kind = text(message.messageKind ?? message.message_kind)
      return hidden !== true && hidden !== 1 && hidden !== '1' && hidden !== 'true' && kind !== 'narration_debug'
    })
    .slice(-Math.max(1, limit))
    .map((message) => {
      const role = text(message.role) === 'user' ? '用户' : (text(message.memberName ?? message.member_name ?? message.name) || '角色')
      const content = text(message.content ?? message.text).slice(0, Math.max(40, maxCharsPerMessage))
      return content ? `${role}：${content}` : ''
    })
    .filter(Boolean)
    .join('\n')
}
