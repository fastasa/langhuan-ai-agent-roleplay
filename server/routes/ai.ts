/**
 * routes/ai.ts
 * AI 调用代理
 * 前端不再直接请求第三方 API，API Key 安全存在服务端
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import dotenv from 'dotenv'
import { aiAppService } from '../application/ai/aiAppService.js'
import { logger } from '../logger.js'
import {
  formatAiMessageForFullLog,
  normalizeAiSpeakerLine,
  shouldLogFullAiMessages,
  summarizeAiMessageForLog
} from '../security/aiLoggingPolicy.js'
import { normalizeAiUsageFeature } from '../../shared/aiUsageFeatures.js'
import { LOCAL_WORKSPACE_USER_ID } from '../localWorkspace.js'

// 加载环境变量
dotenv.config()

const router = Router()
const shouldLogFullMessages = shouldLogFullAiMessages()

type ChatRole = 'system' | 'user' | 'assistant'

// content parts（批2·输入框图片上传·双通道 A）：与 src/utils/chatAttachments.ts 的 AIContentPart
// 同形但服务端独立声明（前后端各自编译单元，不跨目录 import）。
interface AiChatContentPart {
  type?: unknown
  text?: unknown
  image_url?: { url?: unknown }
}

interface ChatPayloadMessage {
  role?: ChatRole | string
  content?: string | AiChatContentPart[]
  name?: string
}

/** image_url 白名单：只认 /chat-images/ 相对路径或 data: 内联 URI，拒绝 http(s) 外链（防 SSRF——
 *  外链会被服务端当「本机图片」读或被上游供应商直接抓取，等于把服务器变成开放代理）。 */
function isAllowedAiContentImageUrl(url: unknown): boolean {
  const text = String(url || '').trim()
  if (!text) return false
  return text.startsWith('/chat-images/') || /^data:image\//i.test(text)
}

function isValidAiContentPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const p = part as AiChatContentPart
  if (p.type === 'text') return typeof p.text === 'string'
  if (p.type === 'image_url') return isAllowedAiContentImageUrl(p.image_url?.url)
  return false
}

/** content 合法性：非空字符串，或非空 parts 数组（每个元素合法）。供路由校验与单测复用。 */
export function hasValidAiChatMessageContent(content: unknown): boolean {
  if (typeof content === 'string') return content.length > 0
  if (Array.isArray(content) && content.length > 0) {
    return content.every((part) => isValidAiContentPart(part))
  }
  return false
}

/** content parts 数组 → 纯文本（日志用，图片占位 [图片]），字符串原样返回；避免数组直接进日志变成 [object Object]。 */
function contentPartsToLogText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as AiChatContentPart[])
    .map((part) => (part?.type === 'text' ? String(part.text || '') : part?.type === 'image_url' ? '[图片]' : ''))
    .join('')
}

export function extractUsageFromAiSseLine(line: string): unknown {
  if (!line.startsWith('data: ')) return null
  const payload = line.slice(6)
  if (!payload || payload === '[DONE]') return null
  try {
    const parsed = JSON.parse(payload)
    return parsed?.usage || null
  } catch {
    return null
  }
}

/** Codex 订阅桥原生生图：只返回已经通过 magic bytes 校验并登记上传台账的聊天附件。 */
router.post('/images/generate', async (req: Request, res: Response) => {
  const prompt = String(req.body?.prompt || '').trim()
  if (!prompt) return res.status(400).json({ error: '生图描述不能为空' })
  if (prompt.length > 8000) return res.status(400).json({ error: '生图描述不能超过 8000 字' })
  const effortCandidate = String(req.body?.effort || '').trim()
  const effort = /^[A-Za-z0-9._:-]{1,64}$/.test(effortCandidate) ? effortCandidate : undefined
  const requestAbort = new AbortController()
  const onClientGone = () => { if (!res.writableEnded) requestAbort.abort() }
  res.on('close', onClientGone)
  try {
    const result = await aiAppService.generateImage({
      prompt,
      presetName: String(req.body?.presetName || '').trim(),
      model: String(req.body?.model || '').trim(),
      effort
    }, {
      signal: requestAbort.signal,
      userId: LOCAL_WORKSPACE_USER_ID,
      role: 'local',
      feature: 'xingyi',
      modelUsageSlotId: String(req.body?.modelUsageSlotId || 'balanced'),
      sessionId: String(req.body?.sessionId || ''),
      sessionLabel: String(req.body?.sessionLabel || '星依'),
      usageLabel: '星依生图',
      placeLabel: '星依浮坞'
    })
    if (!result.ok || !result.attachment) {
      return res.status(result.status || 500).json({ error: result.error || '图片生成失败' })
    }
    return res.json({ attachment: result.attachment, model: result.model, presetName: result.presetName })
  } finally {
    res.off('close', onClientGone)
  }
})

/** Codex 订阅桥原生联网搜索：独立只读通道，不改变普通聊天桥的禁网边界。 */
router.post('/web/search', async (req: Request, res: Response) => {
  const query = String(req.body?.query || '').trim()
  if (!query) return res.status(400).json({ error: '联网检索词不能为空' })
  if (query.length > 2000) return res.status(400).json({ error: '联网检索词不能超过 2000 字' })
  const effortCandidate = String(req.body?.effort || '').trim()
  const effort = /^[A-Za-z0-9._:-]{1,64}$/.test(effortCandidate) ? effortCandidate : undefined
  const requestAbort = new AbortController()
  const onClientGone = () => { if (!res.writableEnded) requestAbort.abort() }
  res.on('close', onClientGone)
  try {
    const result = await aiAppService.searchWeb({
      query,
      presetName: String(req.body?.presetName || '').trim(),
      model: String(req.body?.model || '').trim(),
      effort
    }, {
      signal: requestAbort.signal,
      userId: LOCAL_WORKSPACE_USER_ID,
      role: 'local',
      feature: 'xingyi',
      modelUsageSlotId: String(req.body?.modelUsageSlotId || 'balanced'),
      sessionId: String(req.body?.sessionId || ''),
      sessionLabel: String(req.body?.sessionLabel || '星依'),
      usageLabel: '星依联网搜索',
      placeLabel: '星依浮坞'
    })
    if (!result.ok || !result.answer) {
      return res.status(result.status || 500).json({ error: result.error || '联网搜索失败' })
    }
    return res.json({
      answer: result.answer,
      sources: result.sources || [],
      model: result.model,
      presetName: result.presetName
    })
  } finally {
    res.off('close', onClientGone)
  }
})

/**
 * POST /api/ai/chat
 * 代理 AI 聊天请求（流式输出 SSE）
 * 主预设调用失败时直接返回错误，不再静默切换备用预设
 *
 * 请求体：
 * {
 *   messages: [...],       // OpenAI 格式消息数组
 *   presetName: '...',     // 使用哪个 API 预设（空则用默认）
 *   model: '...',          // 可选覆盖模型
 *   stream: true           // 是否流式
 * }
 *
 * 响应头：
 * X-Used-Model: 实际使用的模型名称
 * X-Used-Preset: 实际使用的预设名称
 */
router.post('/chat', async (req: Request, res: Response) => {
  const { messages, presetName, model, stream = true, meta } = req.body
  // 原生工具调用：tools 为请求入参（工具 JSON Schema），tool_choice 为选择策略；
  // 二者缺省时本路由行为与改造前完全一致（纯文本聊天主链路零回归）。
  const tools = Array.isArray(req.body?.tools) && req.body.tools.length ? req.body.tools : undefined
  const toolChoice = req.body?.toolChoice ?? req.body?.tool_choice ?? undefined
  const feature = normalizeAiUsageFeature(req.body?.feature || meta?.feature || 'role_message')
  // 槽位档 id（书童/校书/掌阁）：决定按用户额度哪一档解析预设与门控；非法值/缺省由服务端归一化回退校书。
  const modelUsageSlotId = String(req.body?.modelUsageSlotId || meta?.modelUsageSlotId || '').trim()
  const maxTokens = Number(req.body?.maxTokens ?? meta?.maxTokens ?? 0)
  const temperature = Number(req.body?.temperature ?? meta?.temperature)
  const effortCandidate = String(req.body?.effort ?? meta?.effort ?? '').trim()
  const effort = /^[A-Za-z0-9._:-]{1,64}$/.test(effortCandidate) ? effortCandidate : undefined
  const serviceTier = req.body?.serviceTier === 'fast' ? 'fast' as const : undefined
  const thinking = req.body?.thinking === 'enabled' || req.body?.thinking === 'disabled'
    ? req.body.thinking
    : meta?.thinking === 'enabled' || meta?.thinking === 'disabled'
      ? meta.thinking
      : undefined

  // 请求体验证
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages必须是数组' })
  }
  for (const msg of messages) {
    if (!msg.role) {
      return res.status(400).json({ error: '每条消息必须包含role字段' })
    }
    // 图片双通道 A（批2）：content 放宽为 string 或合法 parts 数组（text/image_url，image_url 白名单校验）。
    // parts 数组存在但不合法（如带 http 外链）单独给出更明确的错误，不与「缺 content」混在一起。
    if (Array.isArray(msg.content) && msg.content.length > 0 && !hasValidAiChatMessageContent(msg.content)) {
      return res.status(400).json({ error: 'content 中的图片只允许 /chat-images/ 相对路径或 data: 内联，不接受外部 URL' })
    }
    // 原生工具协议放宽：assistant 只发 tool_calls（content 可空）、role:'tool' 结果回灌都合法；
    // 其余消息仍要求非空 content（不放松纯文本主链路的校验）。
    const hasContent = hasValidAiChatMessageContent(msg.content)
    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
    const isToolResult = msg.role === 'tool' && typeof msg.tool_call_id === 'string' && msg.tool_call_id.length > 0
    if (!hasContent && !hasToolCalls && !isToolResult) {
      return res.status(400).json({ error: '每条消息必须包含content，或携带原生工具调用（tool_calls / role:"tool"+tool_call_id）' })
    }
  }

  const inferTargetFromMessages = () => {
    for (const msg of messages as Array<{ role?: string; content?: string }>) {
      if (msg?.role !== 'system' || !msg?.content) continue
      const m = String(msg.content).match(/你当前扮演：([^。:\n]+)/)
      if (m?.[1]) return m[1].trim()
    }
    return ''
  }
  const logTarget = String(meta?.logLabel || req.body?.targetId || meta?.targetName || inferTargetFromMessages() || '会话目标').trim() || '会话目标'

  logger.ai('')
  logger.ai('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  logger.ai(`【目标切换】${logTarget}`)
  logger.ai(`【AI请求】使用预设: ${presetName || '默认'}, 模型: ${model || '默认'}`)
  logger.ai(`【AI请求参数】stream=${stream}，消息数=${messages.length}`)
  logger.ai(shouldLogFullMessages ? '【AI消息列表】（完整内容，按行编号）' : '【AI消息列表】（生产默认脱敏）')
  for (let i = 0; i < messages.length; i++) {
    const rawMsg = messages[i] as { role: string; content: unknown; name?: string }
    // content parts 数组先拍平成可读文本再进日志格式化函数，避免 [object Object]（这三个日志函数
    // 仍是纯 string 契约，图片双通道的原始 parts 只在 aiAppService 分流时才需要）。
    const msg = { ...rawMsg, content: contentPartsToLogText(rawMsg.content) }
    const label = msg.name ? `${msg.role}/${msg.name}` : msg.role
    const speakerLine = normalizeAiSpeakerLine(msg)
    logger.ai('')
    logger.ai(`  ┌─ [${i}] ${label}`)
    if (shouldLogFullMessages) {
      logger.ai(speakerLine ? `    ${speakerLine}` : formatAiMessageForFullLog(msg.content))
    } else {
      logger.ai(`    ${summarizeAiMessageForLog(msg)}`)
    }
    logger.ai('  └─')
  }
  logger.ai('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  logger.ai('')

  // 客户端取消信号：连接在响应结束前关闭（用户取消/页面关闭）即 abort，
  // 让服务端排队 + 间隔等待 + 上游请求随之取消，不滞留占位（批次 F 前置补强）。
  const requestAbort = new AbortController()
  const onClientGone = () => { if (!res.writableEnded) requestAbort.abort() }
  res.on('close', onClientGone)

  // 尝试调用 AI，支持 fallback
  const result = await aiAppService.callAIWithFallback(presetName, model, messages, stream, logger, {
    signal: requestAbort.signal,
    userId: LOCAL_WORKSPACE_USER_ID,
    role: 'local',
    feature,
    modelUsageSlotId,
    sessionId: String(meta?.sessionId || req.body?.sessionId || ''),
    sessionLabel: String(meta?.sessionLabel || req.body?.sessionLabel || ''),
    roundId: String(meta?.roundId || req.body?.roundId || ''),
    unitKind: String(meta?.unitKind || ''),
    usageLabel: String(meta?.usageLabel || ''),
    placeLabel: String(meta?.placeLabel || ''),
    profileId: String(meta?.profileId || '').slice(0, 120),
    harnessRunId: String(meta?.harnessRunId || '').slice(0, 240),
    modelTurnIndex: Math.max(0, Math.trunc(Number(meta?.modelTurnIndex || 0))),
    toolEpoch: Math.max(0, Math.trunc(Number(meta?.toolEpoch || 0))),
    toolEpochTurnIndex: Math.max(0, Math.trunc(Number(meta?.toolEpochTurnIndex || 0))),
    promptRebuild: meta?.promptRebuild === true,
    activeToolNamesHash: String(meta?.activeToolNamesHash || '').slice(0, 80),
    toolSchemaHash: String(meta?.toolSchemaHash || '').slice(0, 80),
    systemHash: String(meta?.systemHash || '').slice(0, 80),
    messagePrefixHash: String(meta?.messagePrefixHash || '').slice(0, 80),
    requestEnvelopeHash: String(meta?.requestEnvelopeHash || '').slice(0, 80),
    firstDiffSource: String(meta?.firstDiffSource || '').slice(0, 40),
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.trunc(maxTokens) : undefined,
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    effort,
    serviceTier,
    thinking,
    tools,
    toolChoice
  })

  if (result.error) {
    return res.status(result.status || 500).json({ error: result.error })
  }

  // 设置响应头，标注实际使用的模型（需要编码以支持中文等非ASCII字符）
  res.setHeader('X-Used-Model', encodeURIComponent(result.model))
  res.setHeader('X-Used-Preset', encodeURIComponent(result.presetName))
  if (result.presetId) res.setHeader('X-Used-Preset-Id', encodeURIComponent(result.presetId))

  if (stream && result.upstream) {
    // 流式转发：把上游的 SSE 数据原样转给前端
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = result.upstream!.body!.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let actualUsage: unknown = null

    // 上游流半路断连（如 opencode 侧 ECONNRESET/TLS 中断）必须接住：这里在 async 路由里裸抛
    // = unhandledRejection = 崩溃兜底直接 exit(1)、dev 下连带 vite 一起被杀。断流按「流提前结束」处理，
    // 已转发的内容保留，客户端由前端调用侧自己判残响应重试。
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        pending += chunk
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          actualUsage = extractUsageFromAiSseLine(line) || actualUsage
          res.write(`${line}\n`)
        }
      }
      if (pending) {
        actualUsage = extractUsageFromAiSseLine(pending) || actualUsage
        res.write(pending)
      }
    } catch (err) {
      logger.error(`【AI流式转发】上游流中断，按提前结束处理：${err instanceof Error ? err.message : String(err)}`)
    }
    aiAppService.recordActualChatUsage(result.usageLedger, actualUsage)
    res.end()
  } else {
    const data = await (result.upstream as Response).json()
    aiAppService.recordActualChatUsage(result.usageLedger, data?.usage)
    res.json(data)
  }
})

/**
 * POST /api/ai/models
 * 获取某预设下可用的模型列表
 */
router.post('/models', async (req: Request, res: Response) => {
  const result = await aiAppService.fetchModels({
    ...(req.body || {}),
    role: 'local'
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json(result.data)
})

/**
 * POST /api/ai/embeddings
 * 代理文本向量化请求。用于琅嬛内部召回链路，API Key 只留在服务端。
 */
router.post('/embeddings', async (req: Request, res: Response) => {
  const { input, presetId, presetName, model, dimensions, meta } = req.body || {}
  const inputValid = typeof input === 'string'
    || (Array.isArray(input) && input.every((item) => typeof item === 'string'))
  if (!inputValid) {
    res.status(400).json({ error: 'input 必须是字符串或字符串数组' })
    return
  }

  const result = await aiAppService.createEmbeddings({
    presetId,
    presetName,
    model,
    input,
    dimensions: dimensions === undefined ? undefined : Number(dimensions),
    context: {
      userId: LOCAL_WORKSPACE_USER_ID,
      role: 'local',
      feature: 'embedding',
      sessionId: String(meta?.sessionId || req.body?.sessionId || ''),
      sessionLabel: String(meta?.sessionLabel || req.body?.sessionLabel || ''),
      roundId: String(meta?.roundId || req.body?.roundId || ''),
      unitKind: String(meta?.unitKind || ''),
      usageLabel: String(meta?.usageLabel || '嵌入'),
      placeLabel: String(meta?.placeLabel || '')
    }
  })

  if (!result.ok) {
    res.status(result.status || 500).json({ error: result.error })
    return
  }

  res.setHeader('X-Used-Model', encodeURIComponent(result.model))
  res.setHeader('X-Used-Preset', encodeURIComponent(result.presetName))
  if (result.presetId) res.setHeader('X-Used-Preset-Id', encodeURIComponent(result.presetId))
  res.json({
    model: result.model,
    object: 'list',
    data: result.data,
    usage: result.usage
  })
})

export default router
