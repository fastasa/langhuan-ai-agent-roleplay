import { API } from '../config/api'
import type { AiUsageFeature } from '../../shared/aiUsageFeatures'
import type { AIContentPart } from '../utils/chatAttachments'
import type { ChatImageAttachment } from '../utils/chatAttachments'

// 原生工具调用（function-calling）：与 OpenAI chat/completions 同形。
// tools = 请求入参（工具的 JSON Schema）；tool_calls = 回包里模型发起的结构化工具调用。
export type AiToolDefinition = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type AiToolCall = {
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

type AiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  // 批2·图片双通道 A：content 放宽为 string | AIContentPart[]，原样透传服务端（JSON.stringify 发出）。
  content: string | AIContentPart[]
  name?: string
  // 原生工具协议：assistant 轮可携带 tool_calls；role:'tool' 的结果回灌携带 tool_call_id（批1 起接通，批3/4 实际产出）。
  tool_calls?: AiToolCall[]
  tool_call_id?: string
}

type AiChatRequest = {
  messages: AiChatMessage[]
  presetName?: string
  model?: string
  temperature?: number
  effort?: string
  serviceTier?: 'fast'
  maxTokens?: number
  thinking?: 'enabled' | 'disabled'
  modelUsageSlotId?: string
  stream?: boolean
  // 原生工具调用入参：非空时服务端组装进上游请求体；为空/缺省则与现有纯文本调用完全一致。
  tools?: AiToolDefinition[]
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  meta?: {
    logLabel?: string
    usageLabel?: string
    placeLabel?: string
    placeType?: 'single' | 'group' | 'other'
    feature?: AiUsageFeature | string
    sessionId?: string
    sessionLabel?: string
    roundId?: string
    unitKind?: string
    modelUsageSlotId?: string
    profileId?: string
    harnessRunId?: string
    modelTurnIndex?: number
    toolEpoch?: number
    toolEpochTurnIndex?: number
    promptRebuild?: boolean
    activeToolNamesHash?: string
    toolSchemaHash?: string
    systemHash?: string
    messagePrefixHash?: string
    requestEnvelopeHash?: string
    firstDiffSource?: string
  }
  feature?: AiUsageFeature | string
}

type AiEmbeddingRequest = {
  input: string | string[]
  presetId?: string
  presetName?: string
  model?: string
  dimensions?: number
  meta?: {
    usageLabel?: string
    placeLabel?: string
    sessionId?: string
    sessionLabel?: string
    roundId?: string
    unitKind?: string
  }
}

export async function requestAiChatResponse(
  payload: AiChatRequest,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  return await fetch(API.AI_CHAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal
  })
}

export async function requestAiImageGeneration(
  payload: {
    prompt: string
    presetName?: string
    model?: string
    effort?: string
    modelUsageSlotId?: string
    sessionId?: string
    sessionLabel?: string
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ attachment: ChatImageAttachment; model?: string; presetName?: string }> {
  const response = await fetch(API.AI_IMAGE_GENERATION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal
  })
  if (!response.ok) {
    let message = `图片生成失败（HTTP ${response.status}）`
    try {
      const body = await response.json() as { error?: unknown }
      if (body?.error) message = String(body.error)
    } catch {
      // 非 JSON 错误页沿用状态码提示。
    }
    throw new Error(message)
  }
  const body = await response.json() as { attachment?: ChatImageAttachment; model?: string; presetName?: string }
  if (!body?.attachment?.id || !body.attachment.url) throw new Error('图片生成接口没有返回有效附件')
  return { attachment: body.attachment, model: body.model, presetName: body.presetName }
}

export type AiWebSearchSource = { title: string; url: string }

export async function requestAiWebSearch(
  payload: {
    query: string
    presetName?: string
    model?: string
    effort?: string
    modelUsageSlotId?: string
    sessionId?: string
    sessionLabel?: string
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ answer: string; sources: AiWebSearchSource[]; model?: string; presetName?: string }> {
  const response = await fetch(API.AI_WEB_SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal
  })
  if (!response.ok) {
    let message = `联网搜索失败（HTTP ${response.status}）`
    try {
      const body = await response.json() as { error?: unknown }
      if (body?.error) message = String(body.error)
    } catch {
      // 非 JSON 错误页沿用状态码提示。
    }
    throw new Error(message)
  }
  const body = await response.json() as {
    answer?: unknown
    sources?: Array<{ title?: unknown; url?: unknown }>
    model?: string
    presetName?: string
  }
  const answer = String(body?.answer || '').trim()
  if (!answer) throw new Error('联网搜索接口没有返回检索结论')
  const sources = (Array.isArray(body.sources) ? body.sources : [])
    .map((source) => ({ title: String(source?.title || '').trim(), url: String(source?.url || '').trim() }))
    .filter((source) => /^https?:\/\//i.test(source.url))
  return { answer, sources, model: body.model, presetName: body.presetName }
}

export async function requestAiEmbeddings(
  payload: AiEmbeddingRequest,
  options: { signal?: AbortSignal } = {}
): Promise<Response> {
  return await fetch(API.AI_EMBEDDINGS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal
  })
}

export type DirectorProfileUsageTotals = {
  inputTokens: number
  cacheReadTokens: number
  callCount: number
  warmInputTokens: number
  warmCacheReadTokens: number
  warmCallCount: number
}

export type DirectorRoundUsageTotals = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  callCount: number
  profiles: {
    directorRound: DirectorProfileUsageTotals
    postRound: DirectorProfileUsageTotals
  }
}

/** 提调坞·某一轮总消耗（round_id = `round:sessionId:锚用户消息id`，与 aiUsageContext 的 roundId 同源、全局唯一）。
 *  只是坞里的展示性统计，查询失败（网络故障/离线）不应影响坞其余内容，因此吞掉异常、静默回退空值。 */
export async function fetchDirectorRoundUsageTotals(roundId: string): Promise<DirectorRoundUsageTotals> {
  const emptyProfile = (): DirectorProfileUsageTotals => ({
    inputTokens: 0,
    cacheReadTokens: 0,
    callCount: 0,
    warmInputTokens: 0,
    warmCacheReadTokens: 0,
    warmCallCount: 0
  })
  const empty: DirectorRoundUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    callCount: 0,
    profiles: {
      directorRound: emptyProfile(),
      postRound: emptyProfile()
    }
  }
  const rid = String(roundId || '').trim()
  if (!rid) return empty
  let response: Response
  try {
    response = await fetch(API.aiUsageRound(rid))
  } catch {
    return empty
  }
  if (!response.ok) return empty
  const raw = await response.json() as Partial<DirectorRoundUsageTotals>
  const normalizeProfile = (value: Partial<DirectorProfileUsageTotals> | undefined): DirectorProfileUsageTotals => ({
    inputTokens: Number(value?.inputTokens || 0),
    cacheReadTokens: Number(value?.cacheReadTokens || 0),
    callCount: Number(value?.callCount || 0),
    warmInputTokens: Number(value?.warmInputTokens || 0),
    warmCacheReadTokens: Number(value?.warmCacheReadTokens || 0),
    warmCallCount: Number(value?.warmCallCount || 0)
  })
  return {
    inputTokens: Number(raw.inputTokens || 0),
    outputTokens: Number(raw.outputTokens || 0),
    totalTokens: Number(raw.totalTokens || 0),
    cacheReadTokens: Number(raw.cacheReadTokens || 0),
    cacheCreationTokens: Number(raw.cacheCreationTokens || 0),
    callCount: Number(raw.callCount || 0),
    profiles: {
      directorRound: normalizeProfile(raw.profiles?.directorRound),
      postRound: normalizeProfile(raw.profiles?.postRound)
    }
  }
}
