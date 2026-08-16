import type {
  AgentRuntimeErrorType,
  AgentRuntimeLifecycle,
  HookEffect,
  HookEvent,
  NextTurnPatch,
  ToolCallMessage,
  ToolResultMessage,
  AgentModelMessage
} from './types'

export interface HookAppliesTo {
  agentName?: string | string[]
  stage?: string | string[]
  toolName?: string | string[]
  status?: ToolResultMessage['status'] | ToolResultMessage['status'][]
  errorType?: AgentRuntimeErrorType | AgentRuntimeErrorType[]
}

export interface HookRuntimeEvent {
  lifecycle: AgentRuntimeLifecycle
  agentName: string
  turnIndex: number
  stage: string
  activeTools: string[]
  modelMessage?: AgentModelMessage
  modelToolCalls?: Array<{
    toolName?: unknown
    tool?: unknown
    name?: unknown
    [key: string]: unknown
  }>
  toolCall?: ToolCallMessage
  toolResult?: ToolResultMessage
}

export interface HookRuntimeContext {
  budget: {
    maxTurns: number | null
    maxToolCalls: number | null
    usedTurns: number
    usedToolCalls: number
  }
}

export interface HookBlockToolCall {
  message: string
  errorType?: AgentRuntimeErrorType
  retryable?: boolean
  details?: Record<string, unknown>
}

export interface HookResult {
  summary?: string
  effects?: HookEffect[]
  blockToolCall?: HookBlockToolCall
  patchToolResult?: Partial<Omit<ToolResultMessage, 'kind' | 'callId' | 'toolName' | 'stage'>> & {
    replaceDetails?: boolean
  }
  injectMessages?: NextTurnPatch['injectMessages']
  systemPromptPatch?: string
  activeTools?: string[]
  requestRetry?: NextTurnPatch['requestRetry']
  terminate?: boolean
}

export interface HookDefinition {
  id: string
  lifecycle: AgentRuntimeLifecycle
  priority?: number
  appliesTo?: HookAppliesTo
  run: (event: HookRuntimeEvent, ctx: HookRuntimeContext) => HookResult | Promise<HookResult | void> | void
}

export interface HookRunOutput {
  hookEvents: HookEvent[]
  nextTurnPatches: NextTurnPatch[]
  blocked?: HookBlockToolCall
  patchedToolResult?: ToolResultMessage
  activeTools?: string[]
  terminate?: boolean
}

export class HookRegistry {
  private readonly hooks: HookDefinition[] = []

  constructor(definitions: HookDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition)
    }
  }

  register(definition: HookDefinition): void {
    const id = String(definition.id || '').trim()
    if (!id) throw new Error('HookRegistry.register 需要非空 hook id')
    this.hooks.push({ ...definition, id, priority: definition.priority ?? 50 })
    this.hooks.sort((left, right) => (left.priority ?? 50) - (right.priority ?? 50))
  }

  list(): HookDefinition[] {
    return this.hooks.map((hook) => ({ ...hook }))
  }

  matching(event: HookRuntimeEvent): HookDefinition[] {
    return this.hooks.filter((hook) => hook.lifecycle === event.lifecycle && matchesAppliesTo(hook.appliesTo, event))
  }

  async run(event: HookRuntimeEvent, ctx: HookRuntimeContext): Promise<HookRunOutput> {
    const output: HookRunOutput = {
      hookEvents: [],
      nextTurnPatches: []
    }
    let currentToolResult = event.toolResult
    let currentActiveTools: string[] | undefined

    for (const hook of this.matching(event)) {
      const hookResult = await hook.run({ ...event, toolResult: currentToolResult }, ctx)
      if (!hookResult) continue
      const effects = normalizeEffects(hookResult)
      const hookEvent: HookEvent = {
        kind: 'hookEvent',
        id: hook.id,
        lifecycle: hook.lifecycle,
        stage: event.stage,
        ...(event.toolCall?.toolName || event.toolResult?.toolName ? { toolName: event.toolCall?.toolName ?? event.toolResult?.toolName } : {}),
        ...(event.toolCall?.callId || event.toolResult?.callId ? { callId: event.toolCall?.callId ?? event.toolResult?.callId } : {}),
        priority: hook.priority ?? 50,
        effects,
        summary: hookResult.summary || hook.id
      }
      output.hookEvents.push(hookEvent)

      if (hookResult.blockToolCall) output.blocked = hookResult.blockToolCall
      if (hookResult.patchToolResult && currentToolResult) {
        currentToolResult = patchToolResult(currentToolResult, hookResult.patchToolResult)
        output.patchedToolResult = currentToolResult
      }
      if (hookResult.activeTools) {
        currentActiveTools = [...hookResult.activeTools]
        output.activeTools = currentActiveTools
      }
      if (hookResult.terminate) output.terminate = true
      if (
        hookResult.injectMessages?.length ||
        hookResult.systemPromptPatch ||
        hookResult.activeTools ||
        hookResult.requestRetry ||
        hookResult.terminate
      ) {
        output.nextTurnPatches.push({
          kind: 'nextTurnPatch',
          id: `patch_${event.turnIndex}_${hook.id}`,
          sourceHookId: hook.id,
          stage: event.stage,
          injectMessages: hookResult.injectMessages ?? [],
          ...(hookResult.activeTools ? { activeTools: [...hookResult.activeTools] } : {}),
          ...(hookResult.systemPromptPatch ? { systemPromptPatch: hookResult.systemPromptPatch } : {}),
          ...(hookResult.requestRetry ? { requestRetry: hookResult.requestRetry } : {}),
          ...(hookResult.terminate ? { terminate: true } : {})
        })
      }
    }

    if (currentActiveTools) output.activeTools = currentActiveTools
    return output
  }
}

function matchesAppliesTo(appliesTo: HookAppliesTo | undefined, event: HookRuntimeEvent): boolean {
  if (!appliesTo) return true
  if (!matchesOne(appliesTo.agentName, event.agentName)) return false
  if (!matchesOne(appliesTo.stage, event.stage)) return false
  const toolName = event.toolCall?.toolName ?? event.toolResult?.toolName
  if (!matchesOne(appliesTo.toolName, toolName)) return false
  if (!matchesOne(appliesTo.status, event.toolResult?.status)) return false
  if (!matchesOne(appliesTo.errorType, event.toolResult?.error?.type)) return false
  return true
}

function matchesOne<T extends string>(filter: T | T[] | undefined, value: string | undefined): boolean {
  if (!filter) return true
  if (!value) return false
  return Array.isArray(filter) ? filter.includes(value as T) : filter === value
}

function normalizeEffects(result: HookResult): HookEffect[] {
  const effects = new Set<HookEffect>(result.effects ?? [])
  if (result.blockToolCall) effects.add('blockToolCall')
  if (result.patchToolResult) effects.add('patchToolResult')
  if (result.injectMessages?.length) effects.add('injectMessage')
  if (result.systemPromptPatch) effects.add('patchSystemPrompt')
  if (result.activeTools) effects.add('setActiveTools')
  if (result.requestRetry) effects.add('requestRetry')
  if (result.terminate) effects.add('terminate')
  effects.add('writeTrace')
  return Array.from(effects)
}

function patchToolResult(
  result: ToolResultMessage,
  patch: Partial<Omit<ToolResultMessage, 'kind' | 'callId' | 'toolName' | 'stage'>> & {
    replaceDetails?: boolean
  }
): ToolResultMessage {
  const { replaceDetails: _replaceDetails, ...restPatch } = patch
  return {
    ...result,
    ...restPatch,
    details: patch.replaceDetails ? (patch.details ?? {}) : {
      ...result.details,
      ...(patch.details ?? {})
    },
    error: patch.error ?? result.error
  }
}
