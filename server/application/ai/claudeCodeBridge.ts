/**
 * Claude Code 订阅桥（providerType = 'claude-code'）
 *
 * 作用：把琅嬛内部的 OpenAI chat/completions 调用翻译成本机 `claude -p` headless 调用，
 * 用用户的 Claude 订阅登录态跑模型，再把结果合成回 OpenAI 形状的 Response。
 * 上游消费方（routes/ai.ts 的 SSE 转发与 JSON 读取、前端 useAI 的 tool_calls 解析）零改动。
 *
 * 边界与真值（容易误判处）：
 * - 不走 HTTP：由 aiAppService.callAIWithFallback 在 outboundFetch 之前按 providerType 短路进来，
 *   绕开 safeOutboundFetch 的 http/https 白名单（伪地址 claude-code://local 永不真正外呼）。
 * - 工具调用是仿真·双通道（2026-07-08 真机修）：①结构化输出通道——靠 CLI 的 --json-schema 强制
 *   结构化输出，再映射成 OpenAI tool_calls（arguments 按 OpenAI 惯例是 JSON 字符串）；
 *   ②原生 tool_use 拦截通道——CLI 内模型经常无视仿真协议、直接发原生 tool_use 调 system 提示词里
 *   描述的工具（CLI 因 --tools "" 回它 No such tool available，模型重试几轮后放弃并答「工具不可用」，
 *   这是 2026-07-08 星依七件套真机全灭的根因）。故工具轮改跑 --output-format stream-json 逐行监听，
 *   看到首条带业务 tool_use 的 assistant 消息就地翻译成 tool_calls 并杀子进程（不浪费撞墙轮）。
 * - 流式是伪流式：stream=true 时把完整结果合成为一次性 SSE（role/content/usage/[DONE] 四段），
 *   契约与 routes/ai.ts 的逐行转发一致；真流式（--output-format stream-json）留待后续升级。
 * - maxTokens 不生效：claude CLI 无对应入参；temperature 已从订阅桥参数 UI 退役且不会传入本桥。
 *   effort 映射 `--effort`；thinking 只控制是否从 stream-json 收集可读 thinking block，不关闭模型内部推理。
 * - 认证依赖本机 Claude Code 登录态；--setting-sources "" 隔离项目/用户配置但保留 OAuth
 *   （注意 --bare 会禁用 OAuth，绝不可用）。
 * - 识图（2026-07-11 输入框图片上传·订阅桥追加改造）：image_url part 渲染成 prompt 文本里的
 *   `@本机绝对路径`（见 resolveBridgeImagePath）。实测 CLI 2.1.207：`@<路径>` 是 CLI 自身的文件提及
 *   预处理，模型调用前就把文件内容 attach 进上下文，与 --tools 授权完全无关——`--tools ''`（本文件现役
 *   逐字节不变的参数）全禁工具时同样生效。故识图**不需要**放开任何工具（Read 等），spawn 参数、
 *   原生 tool_use 拦截通道（下方 onStdoutLine）都不必为图片改动，不触碰 2026-07-08 工具轮全灭的雷区。
 *   ⚠️ 安全边界（LFI 越权读取·2026-07-11 已堵）：`@<本机绝对路径>` 是 CLI 层面的通用能力——prompt
 *   文本里任何 `@<本机路径>` 都会被同样 attach，不止本模块生成的图片路径。真机实测确认：用户在聊天正文
 *   键入 `@C:\...\langhuan.db` 之类，未经处理透传进 transcript 时，CLI 会读服务器本机任意文件并可能复述
 *   （含 `--tools ''` 全禁工具时），多用户系统里是高危越权读取。**现役修复**：flattenContent 对**一切文本
 *   来源**（纯字符串/text part/未知 part 字符串化、以及各 role 的 content，含 system 提示词正文）经
 *   neutralizeAtFileMentions 中和其中的疑似路径 `@`（反斜杠转义 `\@`，实测使 CLI 不再当文件提及）；**只有
 *   本模块为 `/chat-images/` 下校验过图片主动拼出的 `@绝对路径`是可信来源、单独产出不经中和、识图照常有效**。
 *   两类来源在 flattenContent 单点区分，别在别处重新拼裸 `@` 破坏此边界。
 * - --resume 前缀分流（批H·2026-07-12）：默认开启（env `LANGHUAN_CLAUDE_CLI_RESUME=0` 整体关闭=逐字节回到
 *   旧行为）。桥内注册表记「对话链」（cliSessionId + 前缀哈希链），新调用若是某链的纯追加 → `--resume` 只投
 *   增量；否则全量新会话（=旧行为）。开启时不传 --no-session-persistence、必传 --strict-mcp-config（防账号级
 *   MCP 连接器中途挂载污染工具表，讨论稿 §1.4 实证）。会话明文落 ~/.claude/projects/（用户拍板接受·条件=
 *   用完即删：链逐出/过期/作废/进程正常退出时尽力删盘）。resume 任何异常 → 作废链 + 全量重试一次兜底。
 *   真值=docs/features/chat/CLAUDE_CLI_PERSISTENT_SESSION_DISCUSSION.md（E4/E5 实测）。
 */
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { mkdtemp, rm, unlink, writeFile } from 'fs/promises'
import { createHash, randomBytes } from 'crypto'
import { homedir, tmpdir } from 'os'
import path from 'path'
import { CHAT_IMAGE_DIR } from '../../db.js'

/** 与 aiAppService 的 AiToolDefinition/AiToolChoice 同形（结构型复制，避免桥反向依赖咽喉模块）。 */
export interface BridgeToolDefinition {
  type: string
  function?: {
    name?: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type BridgeToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }
  | undefined

export interface ClaudeCodeBridgeInput {
  messages: unknown[]
  model: string
  stream: boolean
  /** 业务续接作用域：只参与本地 resume 配置哈希，不写入提示词、CLI 参数或日志。 */
  continuityKey?: string
  effort?: string
  thinking?: 'enabled' | 'disabled'
  tools?: BridgeToolDefinition[]
  toolChoice?: BridgeToolChoice
  signal?: AbortSignal
  logger?: {
    ai?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    debug?: (...args: unknown[]) => void
  }
}

/** claude CLI --output-format json 的结果信封（只声明桥用到的字段；stream-json 模式下为最后一行 type:'result'）。 */
export interface ClaudeCliEnvelope {
  type?: string
  is_error?: boolean
  result?: string
  /** CLI 会话 id（--resume 前缀分流用；json 信封与 stream-json 各事件均携带）。 */
  session_id?: string
  structured_output?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

/** CLI 给 --json-schema 注册的结构化输出工具名：模型收尾时调它，不算业务工具、不进原生拦截。 */
const STRUCTURED_OUTPUT_TOOL_NAME = 'StructuredOutput'

/** 原生 tool_use 拦截捕获：CLI 内模型没走结构化输出、直接原生调业务工具时，桥就地截获的调用与该轮用量。 */
interface BridgeNativeToolUseCapture {
  content: string
  reasoningContent?: string
  toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  usage?: ClaudeCliEnvelope['usage']
}

/** 桥可用的模型别名（fetchModels 的固定返回；claude CLI 自己接受别名或全名）。 */
export const CLAUDE_CODE_BRIDGE_MODELS = ['fable', 'opus', 'sonnet', 'haiku'] as const
export const CLAUDE_CODE_BRIDGE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export function listClaudeCodeBridgeModels(): Array<{
  id: string
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>
  defaultReasoningEffort: string
}> {
  return CLAUDE_CODE_BRIDGE_MODELS.map((id) => ({
    id,
    supportedReasoningEfforts: CLAUDE_CODE_BRIDGE_EFFORTS.map((reasoningEffort) => ({
      reasoningEffort,
      description: reasoningEffort === 'high' ? 'Claude 默认档位' : ''
    })),
    defaultReasoningEffort: 'high'
  }))
}

const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]+$/

type ChatMessageLike = {
  role?: unknown
  content?: unknown
  name?: unknown
  tool_call_id?: unknown
  tool_calls?: Array<{ function?: { name?: unknown; arguments?: unknown } }>
}

/** data URI 兜底落盘时的 MIME→扩展名映射（与 chatImageStorage.ts 的 MIME_TO_EXT 同口径；
 *  桥模块不反向依赖存储仓，独立开一张小表，避免引入历史高危模块之外的耦合）。 */
const DATA_URI_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

/**
 * image_url → 本机绝对路径，供 prompt 文本里 `@路径` 引用（2026-07-11 输入框图片上传·订阅桥识图）。
 * - `/chat-images/xxx` 相对路径（主路径，绝大多数调用走这条）：basename 剥离后必须与原值一致（拦截
 *   `../` 穿越/绝对路径伪装），规范化绝对路径必须仍在 CHAT_IMAGE_DIR 内（双保险，与 aiAppService.
 *   inlineChatImageContentPart 同款校验思路）；文件不存在 → 返回 null（调用方降级为 [图片已失效]）。
 * - `data:image/...;base64,...` 内联 URI（兜底·当轮理论上不会出现，仅历史/异常调用路径可能带）：
 *   解码后落盘到 CHAT_IMAGE_DIR 下一个新文件（不写 OS 临时目录，图片统一收在 chat-images 目录，
 *   方便用户整体清理），返回落盘后的绝对路径。解码/写盘失败一律返回 null。
 * - 其余一律 null（未知协议、空串等）。
 */
function resolveBridgeImagePath(rawUrl: string): string | null {
  const url = String(rawUrl || '').trim()
  if (!url) return null
  if (url.startsWith('/chat-images/')) {
    const relative = url.slice('/chat-images/'.length)
    const filename = path.basename(relative)
    if (!filename || filename !== relative) return null
    const absolutePath = path.normalize(path.join(CHAT_IMAGE_DIR, filename))
    if (!absolutePath.startsWith(path.normalize(CHAT_IMAGE_DIR + path.sep))) return null
    if (!existsSync(absolutePath)) return null
    return absolutePath
  }
  if (/^data:image\//i.test(url)) {
    const commaIndex = url.indexOf(',')
    if (commaIndex < 0) return null
    const mime = url.slice(5, url.indexOf(';')).toLowerCase()
    const ext = DATA_URI_MIME_TO_EXT[mime]
    if (!ext) return null
    const base64Data = url.slice(commaIndex + 1)
    if (!base64Data) return null
    let buffer: Buffer
    try {
      buffer = Buffer.from(base64Data, 'base64')
    } catch {
      return null
    }
    if (!buffer.byteLength) return null
    const filename = `chat_img_bridge_${randomBytes(12).toString('hex')}.${ext}`
    const absolutePath = path.join(CHAT_IMAGE_DIR, filename)
    try {
      writeFileSync(absolutePath, buffer)
    } catch {
      return null
    }
    return absolutePath
  }
  return null
}

/**
 * 中和不可信正文里的 `@` file-mention（2026-07-11 高危 LFI 修复·真机实测确认）。
 *
 * 背景：claude CLI（2.1.207 实测）会把 prompt 文本里 `@<存在的本机绝对/相对路径>` 当「文件提及」，
 * 在模型运行**前**自动读取文件内容塞进上下文——与 `--tools` 授权无关，`--tools ''` 全禁工具时同样生效。
 * 桥把消息/系统提示词正文逐字透传进 transcript，于是任何走订阅桥的用户在聊天正文里写 `@C:\...\langhuan.db`
 * 之类就能让服务端 Claude 读本机任意文件并可能复述——多用户系统里是越权读取高危漏洞。
 *
 * 中和策略（真机三选一实测后定档）：在疑似路径的 `@` 前插一个反斜杠 `\@`。实测 CLI 对 `\@<路径>` /
 * `\\@<路径>`（本函数产物·含攻击者预插反斜杠时的叠加形态）均**不再解析成文件提及**（probe 不再泄漏），
 * 而模型仍能读懂「用户提到某文件」的大致语义。选反斜杠而非零宽字符（U+200B）：纯 ASCII、日志可见可审计、
 * 无编码层被 strip 的风险、对预插反斜杠幂等安全。
 *
 * 匹配精度（正则 /@(?=[^\s]*[:\\/])/g）：只中和「`@` 紧跟、中途无空白、且该 token 里含 `:` / `\` / `/`」
 * 的疑似路径 mention（盘符冒号 `C:`、Windows 反斜杠、POSIX 斜杠都覆盖）；纯 `@某人名`（中文名/无路径分隔符）
 * 不构成 CLI 文件提及、也不被本函数误伤（`@星依` 原样保留）。安全优先：拿不准的路径形状宁可多中和（多一个
 * 反斜杠对模型语义无损），故不额外要求 `@` 前必须是空白/行首（即便 CLI 只认词首 `@`，多中和也无害）。
 */
const AT_FILE_MENTION_PATTERN = /@(?=[^\s]*[:\\/])/g
function neutralizeAtFileMentions(text: string): string {
  return text.replace(AT_FILE_MENTION_PATTERN, '\\@')
}

/**
 * 多模态 content（数组分块）压平成纯文本；图片块渲染成 `@本机绝对路径`（订阅桥识图，见上方
 * resolveBridgeImagePath），解析失败降级为 `[图片已失效]` 占位文本。imagePaths 收集本次成功解析的
 * 图片绝对路径（仅供调试日志与测试观测，不影响 CLI 启动参数——识图不需要放开任何工具，见文件头注释）。
 *
 * ⚠️ 安全边界（2026-07-11 LFI 修复·别退回）：**文本来源一律经 neutralizeAtFileMentions 中和**——
 * 纯字符串 content、text part、非法/未知 part 的字符串化，都是用户/角色/世界书可注入的不可信正文，
 * 其中的 `@路径` 必须被中和；**只有本函数为校验过的图片主动拼出的 `@absolutePath` 才可信、保持有效**
 * （image 分支单独产出、不经中和，故识图不被安全修复破坏）。两类来源在此单点区分，别在别处重新拼裸 `@`。
 */
function flattenContent(content: unknown, imagePaths?: string[]): string {
  if (typeof content === 'string') return neutralizeAtFileMentions(content)
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return neutralizeAtFileMentions(part)
        const p = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown }; image?: unknown }
        if (p?.type === 'text') return neutralizeAtFileMentions(String(p.text || ''))
        if (p?.type === 'image_url' || p?.type === 'image') {
          const rawUrl = p.type === 'image_url' ? String(p.image_url?.url || '') : String(p.image || '')
          const absolutePath = resolveBridgeImagePath(rawUrl)
          if (!absolutePath) return '[图片已失效]'
          imagePaths?.push(absolutePath)
          // 可信来源：本模块为校验过的图片主动拼出的 @路径，是订阅桥识图的正式机制，绝不中和。
          return `@${absolutePath}`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content == null) return ''
  return neutralizeAtFileMentions(String(content))
}

/**
 * 把 OpenAI messages 拆成 system 提示词 + 对话转写文本。
 * 转写用「【角色】」标记段落，工具往返也线性还原，保证 claude 拿到与原 API 等价的上下文。
 */
export function renderBridgePrompt(messages: unknown[]): { systemPrompt: string; transcript: string; imagePaths: string[] } {
  const list = Array.isArray(messages) ? (messages as ChatMessageLike[]) : []
  const systemParts: string[] = []
  const transcriptParts: string[] = []
  const imagePaths: string[] = []

  for (const item of list) {
    const role = String(item?.role || '')
    if (role === 'system') {
      const text = flattenContent(item?.content, imagePaths).trim()
      if (text) systemParts.push(text)
      continue
    }
    if (role === 'assistant') {
      const text = flattenContent(item?.content, imagePaths).trim()
      if (text) transcriptParts.push(`【助手】\n${text}`)
      if (Array.isArray(item?.tool_calls)) {
        for (const call of item.tool_calls) {
          const name = String(call?.function?.name || '')
          const args = String(call?.function?.arguments || '{}')
          if (name) transcriptParts.push(`【助手·调用工具】\n${name} ${args}`)
        }
      }
      continue
    }
    if (role === 'tool') {
      const label = String(item?.name || item?.tool_call_id || '工具')
      transcriptParts.push(`【工具 ${label} 返回】\n${flattenContent(item?.content, imagePaths)}`)
      continue
    }
    // user 及未知角色统一按用户输入处理（与 OpenAI 兼容层的宽容口径一致）
    transcriptParts.push(`【用户】\n${flattenContent(item?.content, imagePaths)}`)
  }

  return {
    systemPrompt: systemParts.join('\n\n'),
    transcript: transcriptParts.join('\n\n') || '（无对话内容）',
    imagePaths
  }
}

/**
 * 工具仿真的结构化输出 schema：content 为文本回复，tool_calls 为调用列表。
 * arguments 按 OpenAI 惯例约束为 JSON 字符串，映射回 tool_calls 时原样透传。
 */
export function buildToolCallSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '你的文本回复；若本轮只调用工具、无需说话，填空字符串'
      },
      tool_calls: {
        type: 'array',
        description: '本轮要发起的工具调用；不调用任何工具时为空数组',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '工具名，必须严格取自可用工具清单' },
            arguments: { type: 'string', description: '工具入参，JSON 对象序列化成的字符串' }
          },
          required: ['name', 'arguments'],
          additionalProperties: false
        }
      }
    },
    required: ['content', 'tool_calls'],
    additionalProperties: false
  }
}

/** 把 tools/toolChoice 渲染成注入 system 的工具说明段（仿真提示词，与 schema 配套）。 */
export function renderToolInstruction(tools: BridgeToolDefinition[], toolChoice: BridgeToolChoice): string {
  const toolDocs = tools
    .map((tool) => {
      const name = String(tool?.function?.name || '').trim()
      if (!name) return ''
      const description = String(tool?.function?.description || '').trim()
      const parameters = tool?.function?.parameters
      const schemaText = parameters ? JSON.stringify(parameters) : '{}'
      return `- ${name}${description ? `：${description}` : ''}\n  入参 JSON Schema：${schemaText}`
    })
    .filter(Boolean)
    .join('\n')

  let choiceLine = '是否调用工具由你判断（tool_choice=auto）。'
  if (toolChoice === 'required') {
    choiceLine = '本轮必须至少发起一个工具调用（tool_choice=required）。'
  } else if (toolChoice && typeof toolChoice === 'object' && toolChoice.type === 'function') {
    choiceLine = `本轮必须调用工具 ${toolChoice.function?.name}（tool_choice 指定）。`
  }

  return [
    '<可用工具>',
    '你可以调用以下工具。决定调用时，把调用写进结构化输出的 tool_calls 数组（arguments 必须是合法 JSON 字符串，且符合该工具的入参 Schema）；不调用时 tool_calls 给空数组、把回复写进 content。',
    // 原生 tool_use 口径（2026-07-08·提调 writeTodo 首发连败根因之一）：模型改走原生调用时，会把上面
    // 「arguments=JSON 字符串」的观念带进去（整包成 {name,arguments} / 字段值再序列化）。点破正确形状降低首发错误率；
    // 桥侧另有 unwrapNativeToolUseInput 剥壳 + runtime coerceArgsBySchema 纠形双兜底。
    '若你以原生 tool_use 方式直接调用上述工具：input 就是该工具入参 Schema 的对象本身——字段值按 Schema 声明的类型直接给（数组给数组、对象给对象），不要包成 {"name":...,"arguments":"..."}，也不要把任何字段值再序列化成 JSON 字符串。',
    choiceLine,
    toolDocs,
    '</可用工具>'
  ].join('\n')
}

/** 用量块（OpenAI usage 形状）：缓存读写 token 一并计入 prompt_tokens（账本按「真实消耗」口径记录），
 *  同时携带 cache_read/cache_creation 拆分（2026-07-07 缓存可见性；非标准字段，上游忽略即可）。 */
function buildBridgeUsage(usageIn: ClaudeCliEnvelope['usage']): Record<string, number> {
  const u = usageIn || {}
  const promptTokens = Number(u.input_tokens || 0)
    + Number(u.cache_creation_input_tokens || 0)
    + Number(u.cache_read_input_tokens || 0)
  const completionTokens = Number(u.output_tokens || 0)
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    cache_read_input_tokens: Number(u.cache_read_input_tokens || 0),
    cache_creation_input_tokens: Number(u.cache_creation_input_tokens || 0)
  }
}

/** chat.completion 响应体骨架：结构化输出通道与原生拦截通道共用（形状唯一真值，别再另拼）。 */
function buildBridgeCompletion(
  model: string,
  message: Record<string, unknown>,
  hasToolCalls: boolean,
  usageIn: ClaudeCliEnvelope['usage']
): Record<string, unknown> {
  return {
    id: 'chatcmpl-claude-code-bridge',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: hasToolCalls ? 'tool_calls' : 'stop'
      }
    ],
    usage: buildBridgeUsage(usageIn)
  }
}

/** CLI 结果信封 → OpenAI chat.completion 响应体（结构化输出通道）。 */
export function envelopeToChatCompletion(
  envelope: ClaudeCliEnvelope,
  model: string,
  withTools: boolean,
  reasoningContent = ''
): Record<string, unknown> {
  let content: string | null = String(envelope.result || '')
  let toolCalls: Array<Record<string, unknown>> | undefined

  if (withTools) {
    const structured = envelope.structured_output as { content?: unknown; tool_calls?: unknown } | undefined
    if (structured && typeof structured === 'object') {
      content = String(structured.content || '')
      const calls = Array.isArray(structured.tool_calls) ? structured.tool_calls : []
      toolCalls = calls
        .map((call, index) => {
          const c = call as { name?: unknown; arguments?: unknown }
          const name = String(c?.name || '').trim()
          if (!name) return null
          const args = typeof c?.arguments === 'string' ? c.arguments : JSON.stringify(c?.arguments ?? {})
          return {
            id: `call_bridge_${index}`,
            type: 'function',
            function: { name, arguments: args }
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>
      if (!toolCalls.length) toolCalls = undefined
    }
  }

  const message: Record<string, unknown> = { role: 'assistant', content }
  if (reasoningContent) message.reasoning_content = reasoningContent
  if (toolCalls) message.tool_calls = toolCalls
  return buildBridgeCompletion(model, message, Boolean(toolCalls), envelope.usage)
}

/**
 * 伪流式 SSE 文本：role 块 → 整段 content 块 → usage 块 → [DONE]。
 * 契约对齐 routes/ai.ts：按 \n 切行、只认 `data: ` 前缀、usage 在某个 chunk 顶层。
 */
export function chatCompletionToSseBody(completion: Record<string, unknown>): string {
  const model = completion.model
  const choice = (completion.choices as Array<Record<string, unknown>>)[0]
  const message = choice.message as Record<string, unknown>
  const base = { id: completion.id, object: 'chat.completion.chunk', created: completion.created, model }

  const chunks: Array<Record<string, unknown>> = [
    { ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }
  ]
  if (message.reasoning_content) {
    chunks.push({
      ...base,
      choices: [{ index: 0, delta: { reasoning_content: message.reasoning_content }, finish_reason: null }]
    })
  }
  chunks.push(
    {
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            content: message.content ?? '',
            ...(message.tool_calls ? { tool_calls: message.tool_calls } : {})
          },
          finish_reason: null
        }
      ]
    },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }], usage: completion.usage }
  )

  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join('\n\n')}\n\ndata: [DONE]\n\n`
}

export interface ClaudeCliRunInput {
  args: string[]
  stdin: string
  signal?: AbortSignal
  /** 每收到一行完整 stdout 调一次（stream-json 逐行消费）；返回 true 表示「已拿到所需」——
   *  runner 杀掉子进程提前收束（仍正常 resolve，exit code 不作数）。 */
  onStdoutLine?: (line: string) => boolean | void
}

export type ClaudeCliRunner = (input: ClaudeCliRunInput) => Promise<{ stdout: string; stderr: string; code: number | null }>

/** CLI 进程级超时兜底（默认 600s，env LANGHUAN_CLAUDE_CLI_TIMEOUT_MS 可覆盖·P0 挂死修复·2026-07-12）：
 *  与调用方传入的组合 signal（context.signal + callAIWithFallback 默认 deadline）是两道独立防线——
 *  即便上层 signal 因某种原因没能触发 abort，这里也保证 CLI 进程最终被杀、Promise 最终 settle，
 *  不会无限挂起占用并发槽与临时目录（callClaudeCodeBridge 的 finally 依赖本函数最终 settle 才能清理 workDir）。 */
const DEFAULT_CLAUDE_CLI_TIMEOUT_MS = 600_000
function readClaudeCliTimeoutMs(): number {
  const raw = Number(process.env.LANGHUAN_CLAUDE_CLI_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CLAUDE_CLI_TIMEOUT_MS
}

/** 首输出看门狗阈值（默认 5min；空闲看门狗追加·2026-07-12 真机事故修，2026-07-13 从 90s 放宽到 5min）：
 *  CLI 偶发从头到尾一行输出都不吐，只能干等满 600s 整体超时才被杀，一次白等 10 分钟。本看门狗专盯
 *  「进程活没活」（有没有开始吐任何输出），与盯「整体有没有超时太久」的 600s 定时器是两件事、互不干扰。
 *  ⚠️原 90s 阈值在 AI 生成角色等重链路上真机反复误杀（订阅桥冷启动/首事件排队偶发慢），故放宽到 5min，
 *  仍显著早于 600s 整体超时、只掐真死的挂起进程。
 *  env LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS 可覆盖；⚠️与 readClaudeCliTimeoutMs 的 env 语义有意
 *  不同——这里显式设为 `0` 是合法的「禁用」值（那支「非正数一律回退默认」，没有禁用语义），故不能共用同一
 *  个读取函数，未设置/空串/非法值/负数一律回退默认 5min。 */
const DEFAULT_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS = 300_000
function readClaudeCliFirstOutputTimeoutMs(): number {
  const raw = process.env.LANGHUAN_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS
  if (raw === undefined || raw.trim() === '') return DEFAULT_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CLAUDE_CLI_FIRST_OUTPUT_TIMEOUT_MS
}

/** 行间空闲看门狗阈值（默认 0=禁用；空闲看门狗追加·2026-07-12）：每收到一次 stdout 输出重置计时，
 *  连续无新输出超过阈值才判定挂起。默认关闭原因：CLI 非增量模式下长生成期间（大段结构化输出/复杂工具
 *  轮排队等待）可能合法沉默数分钟，贸然默认开启会误杀正常重轮——留给用户真机观察挂起模式后自行按需开启。
 *  env LANGHUAN_CLAUDE_CLI_IDLE_TIMEOUT_MS，与 readClaudeCliTimeoutMs 同款写法（非正数一律禁用）。 */
function readClaudeCliIdleTimeoutMs(): number {
  const raw = Number(process.env.LANGHUAN_CLAUDE_CLI_IDLE_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * 真实 CLI 执行器：spawn 本机 claude（原生 exe/二进制，PATH 解析），prompt 走 stdin 避开
 * Windows 命令行长度上限。取消时杀整棵进程树（对齐 localTrainingService 的 Windows 范式）。
 */
export const runClaudeCli: ClaudeCliRunner = (input) => {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error('调用已取消'))
      return
    }
    const child = spawn('claude', input.args, {
      cwd: tmpdir(),
      windowsHide: true,
      env: process.env
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const killChild = () => {
      try {
        if (process.platform === 'win32' && child.pid) {
          const pid = child.pid
          const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
          // taskkill 失败（进程已退出/权限问题等）此前被完全静默吞掉；至少落一条日志，
          // 便于真机排查「CLI 子进程疑似残留」一类问题（P0 超时修复顺带补齐）。
          taskkill.on('error', (err) => {
            console.error(`【claude-code桥】taskkill 启动失败（pid=${pid}）：${(err as Error).message}`)
          })
          taskkill.on('exit', (code) => {
            if (code !== 0) {
              console.error(`【claude-code桥】taskkill 退出码非 0（pid=${pid}，code=${code}），子进程可能未被清理`)
            }
          })
        } else {
          child.kill('SIGKILL')
        }
      } catch (err) {
        console.error(`【claude-code桥】杀进程树异常（pid=${child.pid}）：${(err as Error).message}`)
      }
    }

    const timeoutMs = readClaudeCliTimeoutMs()
    let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timeoutTimer = null
      if (settled) return
      settled = true
      clearFirstOutputTimer()
      clearIdleTimer()
      input.signal?.removeEventListener('abort', onAbort)
      killChild()
      reject(new Error(`claude CLI 进程超时（超过 ${timeoutMs}ms 未完成，已终止子进程）`))
    }, timeoutMs)
    const clearTimeoutTimer = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
    }

    // ── 空闲看门狗（追加·2026-07-12 真机挂起事故修）：与上面的 600s 整体超时是两道独立防线、
    // 谁先到谁生效；三个定时器必须在进程落定（成功/失败/被杀任一先到）后全部清理，不留泄漏
    // （见下方 onAbort / child.on('error'|'close') 里补的 clearFirstOutputTimer/clearIdleTimer）。
    const firstOutputTimeoutMs = readClaudeCliFirstOutputTimeoutMs()
    let firstOutputTimer: ReturnType<typeof setTimeout> | null = firstOutputTimeoutMs > 0
      ? setTimeout(() => {
          firstOutputTimer = null
          if (settled) return
          settled = true
          clearTimeoutTimer()
          clearIdleTimer()
          input.signal?.removeEventListener('abort', onAbort)
          killChild()
          reject(new Error(`claude CLI 空闲看门狗：启动后 ${firstOutputTimeoutMs}ms 无任何输出，判定挂起提前终止（区别于整体超时）`))
        }, firstOutputTimeoutMs)
      : null
    const clearFirstOutputTimer = () => {
      if (firstOutputTimer) {
        clearTimeout(firstOutputTimer)
        firstOutputTimer = null
      }
    }

    const idleTimeoutMs = readClaudeCliIdleTimeoutMs()
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }
    // 每收到一次 stdout 输出都重新武装（默认 idleTimeoutMs=0 时直接 no-op，行间看门狗默认不生效）。
    const armIdleTimer = () => {
      if (idleTimeoutMs <= 0) return
      clearIdleTimer()
      idleTimer = setTimeout(() => {
        idleTimer = null
        if (settled) return
        settled = true
        clearTimeoutTimer()
        clearFirstOutputTimer()
        input.signal?.removeEventListener('abort', onAbort)
        killChild()
        reject(new Error(`claude CLI 空闲看门狗：连续 ${idleTimeoutMs}ms 无新输出，判定挂起提前终止（区别于整体超时）`))
      }, idleTimeoutMs)
    }
    armIdleTimer()

    const onAbort = () => {
      clearTimeoutTimer()
      clearFirstOutputTimer()
      clearIdleTimer()
      killChild()
      if (!settled) {
        settled = true
        reject(new Error('调用已取消（claude 子进程已终止）'))
      }
    }
    input.signal?.addEventListener('abort', onAbort, { once: true })

    // 逐行回调（stream-json 消费）：按 \n 切完整行；回调要求提前收束时杀进程树、剩余输出不再回调。
    let lineBuffer = ''
    let earlyStopped = false
    child.stdout.on('data', (buf) => {
      const text = String(buf)
      stdout += text
      // 看门狗记账：任何 stdout 输出都清首输出看门狗（一次性、不重新武装）、重置行间空闲看门狗
      // （armIdleTimer 在 idleTimeoutMs<=0 即默认关闭时是 no-op）。挂在 onStdoutLine 消费逻辑之前，
      // 不改动、不依赖下面既有的逐行拦截分支。
      clearFirstOutputTimer()
      armIdleTimer()
      if (!input.onStdoutLine || earlyStopped) return
      lineBuffer += text
      let newlineIndex = lineBuffer.indexOf('\n')
      while (newlineIndex >= 0 && !earlyStopped) {
        const line = lineBuffer.slice(0, newlineIndex).trim()
        lineBuffer = lineBuffer.slice(newlineIndex + 1)
        if (line && input.onStdoutLine(line) === true) {
          earlyStopped = true
          killChild()
          break
        }
        newlineIndex = lineBuffer.indexOf('\n')
      }
    })
    child.stderr.on('data', (buf) => { stderr += String(buf) })
    child.on('error', (err) => {
      clearTimeoutTimer()
      clearFirstOutputTimer()
      clearIdleTimer()
      input.signal?.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      const reason = (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? '未找到 claude 命令：请确认本机已安装 Claude Code 且在 PATH 中'
        : (err as Error).message
      reject(new Error(reason))
    })
    child.on('close', (code) => {
      clearTimeoutTimer()
      clearFirstOutputTimer()
      clearIdleTimer()
      input.signal?.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      resolve({ stdout, stderr, code })
    })

    child.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE，由 close 统一收口 */ })
    child.stdin.write(input.stdin)
    child.stdin.end()
  })
}

/**
 * 原生 tool_use 拦截的入参剥壳（2026-07-08 真机修·writeTodo 连败根因）：
 * 桥的仿真提示词教模型「调用=\{name, arguments\}、arguments 是 JSON 字符串」（结构化输出通道契约），
 * 模型改走原生 tool_use 时常把这层协议一起带进 input——input 变成 \{ arguments: "<真实入参JSON串>" \}
 * 而不是真实入参对象；原样透传会让下游所有工具的 validateArgs 报「缺参」。
 * 只剥「键 ⊆ \{name, arguments\} 且带 arguments」的窄形状，正常 input（即真实入参）原样透传。
 */
export function unwrapNativeToolUseInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const record = input as Record<string, unknown>
  if (!('arguments' in record)) return input
  if (!Object.keys(record).every((key) => key === 'arguments' || key === 'name')) return input
  let args = record.arguments
  // arguments 是 JSON 字符串则解开（个别弱模型会双重编码，最多解两层）；解不动保留原 input 交下游精准报错。
  for (let round = 0; round < 2 && typeof args === 'string'; round += 1) {
    const text = args.trim()
    if (!text) return {}
    try {
      args = JSON.parse(text)
    } catch {
      return input
    }
  }
  return args ?? {}
}

/** 纯文本轮的整包 JSON 信封解析（--output-format json）：非法返回 null，由调用方统一报错。 */
function parseWholeJsonEnvelope(stdout: string): ClaudeCliEnvelope | null {
  try {
    const parsed = JSON.parse(stdout)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ClaudeCliEnvelope : null
  } catch {
    return null
  }
}

/** 工具轮兜底信封解析：stream-json 的 stdout 是 NDJSON——从末行倒着找 type:'result'；
 *  同时兼容整包 JSON（注入 runner 的测试/未逐行消费的执行器）。找不到返回 null。 */
function parseEnvelopeFromStdout(stdout: string): ClaudeCliEnvelope | null {
  const text = String(stdout || '').trim()
  if (!text) return null
  const whole = parseWholeJsonEnvelope(text)
  if (whole && (whole.type === 'result' || whole.result !== undefined || whole.structured_output !== undefined || whole.is_error !== undefined)) {
    return whole
  }
  const lines = text.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const lineText = lines[index].trim()
    if (!lineText) continue
    const parsed = parseWholeJsonEnvelope(lineText)
    if (parsed && parsed.type === 'result') return parsed
  }
  return null
}

/* ═════════════ --resume 前缀分流通道（批H·2026-07-12·总开关见 isClaudeCliResumeEnabled）═════════════
 * 讨论稿真值：docs/features/chat/CLAUDE_CLI_PERSISTENT_SESSION_DISCUSSION.md（E4/E5 实测：resume 协议层通、
 * 拦截杀进程后 resume 自愈）。核心矛盾（讨论稿 §2.3 结构冲突）：CLI 会话 append-only vs 引擎每轮全量重装配
 * ——解法即「前缀哈希自动分流」：纯追加命中才走 resume 增量投喂，其余一律回落全量路径（=旧行为，零退化）。
 * §2.3 语义代价（被拦截轮的 tool_use 不在 CLI 历史里）由增量回显缓解：追加的 assistant tool_calls / tool
 * 返回消息按现役 transcript 段式（【助手·调用工具】/【工具 返回】）原样投进增量；只有「CLI 自己刚说过的
 * 纯文本回复」（内容哈希与上轮返回一致）才跳过不回显（对应讨论稿 E4b「只发新消息」的方法）。
 * 隐私边界（用户拍板）：开启后对话明文落 ~/.claude/projects/<cwd-hash>/<sid>.jsonl，条件是用完即删——
 * 链 LRU 逐出 / TTL 过期 / 作废 / 进程正常退出时尽力删除对应文件（失败只记日志不抛错）。 */

/** resume 通道总开关（kill switch·批H规格⑥）：env LANGHUAN_CLAUDE_CLI_RESUME，默认开启；
 *  设 0 = 整体关闭新通道，桥行为与现役逐字节一致（--no-session-persistence 照传、无 --strict-mcp-config、
 *  无注册表、无 --resume）。真机若发现 resume 通道任何异样，先设 0 回退观察。 */
function isClaudeCliResumeEnabled(): boolean {
  const raw = process.env.LANGHUAN_CLAUDE_CLI_RESUME
  if (raw === undefined || raw.trim() === '') return true
  return raw.trim() !== '0'
}

/** 键序无关的稳定序列化（哈希用）：同一消息对象不论键序如何都得到同一哈希，防「内容相同、键序不同」误判非追加。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 逐条消息哈希链：纯追加判定的比较单元（前 N 条逐一等值 = 前缀命中）。 */
function computeBridgeMessageHashes(messages: unknown[]): string[] {
  const list = Array.isArray(messages) ? messages : []
  return list.map((message) => hashText(stableStringify(message)))
}

/** 链配置哈希：锁「system(含工具说明段)+模型+工具形态」逐字节稳定——讨论稿 §2.3：这些中途变化会作废
 *  CLI 前缀缓存（工具表在 system 之前），withTools 翻转/纲领重排一律当新会话，不硬 resume。 */
function computeBridgeConfigHash(model: string, withTools: boolean, finalSystemPrompt: string, continuityKey = ''): string {
  return hashText(stableStringify({ model, withTools, finalSystemPrompt, continuityKey }))
}

/** CLI 会话落盘路径：~/.claude/projects/<cwd 非字母数字→'-'>/<sid>.jsonl（讨论稿 §2.4 实测格式，
 *  例 C:\Users\86131\AppData\Local\Temp\ccb-probe → C--Users-86131-AppData-Local-Temp-ccb-probe）；
 *  runClaudeCli 固定 cwd=tmpdir()，故目录名由 tmpdir() 变换而来。 */
export function computeCliSessionFilePath(sessionId: string): string {
  const projectDirName = tmpdir().replace(/[^A-Za-z0-9]/g, '-')
  return path.join(homedir(), '.claude', 'projects', projectDirName, `${sessionId}.jsonl`)
}

/** 尽力删除 CLI 会话落盘（批H规格⑤）：失败只记日志不抛错（ENOENT 视为已删干净，静默）。 */
async function deleteCliSessionFileBestEffort(sessionId: string): Promise<void> {
  if (!sessionId) return
  try {
    await unlink(computeCliSessionFilePath(sessionId))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`【claude-code桥】resume 会话落盘清理失败（session=${sessionId}）：${(err as Error).message}`)
    }
  }
}

/** 对话链：一条可 --resume 续接的 CLI 会话及其「已发送内容」的哈希快照。 */
export interface ResumeChainEntry {
  cliSessionId: string
  configHash: string
  messageHashes: string[]
  /** 上次调用返回给引擎的 assistant 纯文本回复（无 tool_calls）的 flattenContent 哈希：
   *  下轮增量投喂时用于识别并跳过「CLI 自己刚说过的回复」回显（tool_calls 轮存空串=永不跳过）。 */
  lastAssistantContentHash: string
  lastUsedAt: number
  /** 并发保护（讨论稿 §2.4：禁止同一 session 并发 resume）：在飞的链不参与匹配、不被 TTL/LRU 逐出。 */
  inFlight: boolean
}

const RESUME_CHAIN_MAX_ENTRIES = 50
const RESUME_CHAIN_TTL_MS = 30 * 60_000

/** 链注册表（批H规格①）：LRU 上限 50 + TTL 30 分钟；逐出/作废时经 onEvict 尽力删盘。
 *  工厂形态导出仅供测试构造小容量实例；生产真值是下方模块级单例 resumeChainRegistry。 */
export function createResumeChainRegistry(options: {
  maxEntries?: number
  ttlMs?: number
  onEvict?: (entry: ResumeChainEntry) => void
} = {}) {
  const maxEntries = options.maxEntries ?? RESUME_CHAIN_MAX_ENTRIES
  const ttlMs = options.ttlMs ?? RESUME_CHAIN_TTL_MS
  const onEvict = options.onEvict ?? ((entry: ResumeChainEntry) => { void deleteCliSessionFileBestEffort(entry.cliSessionId) })
  // Map 迭代序=插入序，天然当 LRU 用：命中提交时 delete+set 刷新到队尾，逐出取队头。
  const chains = new Map<string, ResumeChainEntry>()

  const evictEntry = (entry: ResumeChainEntry): void => {
    chains.delete(entry.cliSessionId)
    try {
      onEvict(entry)
    } catch { /* 删盘回调失败不影响主流程 */ }
  }

  const pruneExpired = (): void => {
    const now = Date.now()
    for (const entry of Array.from(chains.values())) {
      if (!entry.inFlight && now - entry.lastUsedAt > ttlMs) evictEntry(entry)
    }
  }

  return {
    /** 纯追加匹配：config 全等 + 前 N 条哈希逐一等值 + 严格更长（有增量可投）；多链命中取前缀最长者。 */
    match(configHash: string, messageHashes: string[]): ResumeChainEntry | null {
      pruneExpired()
      let best: ResumeChainEntry | null = null
      for (const entry of chains.values()) {
        if (entry.inFlight || entry.configHash !== configHash) continue
        if (entry.messageHashes.length >= messageHashes.length) continue
        let prefixEqual = true
        for (let index = 0; index < entry.messageHashes.length; index += 1) {
          if (entry.messageHashes[index] !== messageHashes[index]) {
            prefixEqual = false
            break
          }
        }
        if (!prefixEqual) continue
        if (!best || entry.messageHashes.length > best.messageHashes.length) best = entry
      }
      return best
    },
    register(cliSessionId: string, configHash: string, messageHashes: string[], lastAssistantContentHash: string): void {
      if (!cliSessionId) return
      pruneExpired()
      chains.delete(cliSessionId)
      chains.set(cliSessionId, {
        cliSessionId,
        configHash,
        messageHashes,
        lastAssistantContentHash,
        lastUsedAt: Date.now(),
        inFlight: false
      })
      while (chains.size > maxEntries) {
        let victim: ResumeChainEntry | null = null
        for (const entry of chains.values()) {
          if (!entry.inFlight) {
            victim = entry
            break
          }
        }
        if (!victim) break // 全部在飞（理论不可能到 50 条）：宁可暂超限也不删在飞会话的盘上文件
        evictEntry(victim)
      }
    },
    /** resume 成功后提交：更新快照、刷新 LRU 位置、解除在飞；CLI 若换了 session id（防御，正常 resume 不换）跟着换键。 */
    commit(entry: ResumeChainEntry, messageHashes: string[], lastAssistantContentHash: string, cliSessionId: string): void {
      chains.delete(entry.cliSessionId)
      if (cliSessionId && cliSessionId !== entry.cliSessionId) entry.cliSessionId = cliSessionId
      entry.messageHashes = messageHashes
      entry.lastAssistantContentHash = lastAssistantContentHash
      entry.lastUsedAt = Date.now()
      entry.inFlight = false
      chains.set(entry.cliSessionId, entry)
    },
    /** 作废链（批H规格④·resume 失败时）：移出注册表 + 尽力删盘（会话可能已损坏，用完即删口径一致）。 */
    invalidate(entry: ResumeChainEntry): void {
      chains.delete(entry.cliSessionId)
      try {
        onEvict(entry)
      } catch { /* 同上 */ }
    },
    listSessionIds(): string[] {
      return Array.from(chains.keys())
    },
    size(): number {
      return chains.size
    },
    /** 仅测试/维护用：清空注册表（不删盘上文件）。 */
    clear(): void {
      chains.clear()
    }
  }
}

const resumeChainRegistry = createResumeChainRegistry()

/** 仅测试用：清空模块级链注册表（不触发删盘），保证用例间隔离。 */
export function clearClaudeCodeBridgeResumeChains(): void {
  resumeChainRegistry.clear()
}

/** 进程正常退出时尽力删掉仍在册的会话落盘（批H规格⑤）：exit 钩子只能同步，用 unlinkSync；
 *  首次注册链时才挂（避免模块加载即产生副作用）。SIGKILL/崩溃收不到 exit，属已知残留面（TTL 补偿不了
 *  进程已死的场景），交给下次同目录会话自然覆盖/人工清理。 */
let resumeExitCleanupInstalled = false
function installResumeExitCleanupOnce(): void {
  if (resumeExitCleanupInstalled) return
  resumeExitCleanupInstalled = true
  process.once('exit', () => {
    for (const sessionId of resumeChainRegistry.listSessionIds()) {
      try {
        unlinkSync(computeCliSessionFilePath(sessionId))
      } catch { /* 尽力而为 */ }
    }
  })
}

function registerResumeChain(cliSessionId: string, configHash: string, messageHashes: string[], lastAssistantContentHash: string): void {
  if (!cliSessionId) return
  resumeChainRegistry.register(cliSessionId, configHash, messageHashes, lastAssistantContentHash)
  installResumeExitCleanupOnce()
}

/** 从合成好的 completion 里取「返回给引擎的 assistant 纯文本回复」哈希（供下轮增量跳过回显）；
 *  带 tool_calls 的轮返回空串（CLI 历史里没有这轮 tool_use——拦截杀进程比落盘快，必须回显，绝不跳过）。 */
function extractAssistantEchoHash(completion: Record<string, unknown>): string {
  const choice = (completion.choices as Array<Record<string, unknown>> | undefined)?.[0]
  const message = (choice?.message ?? {}) as { content?: unknown; tool_calls?: unknown }
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) return ''
  const content = typeof message.content === 'string' ? message.content : ''
  return content ? hashText(flattenContent(content)) : ''
}

/**
 * 组 resume 增量投喂文本：把「链前缀之后追加的消息」按现役 transcript 段式渲染（复用 renderBridgePrompt，
 * 段式/中和/识图与全量路径同一套逻辑）。返回 null = 不满足增量投喂条件，调用方回全量路径：
 * - 追加段里混入 system 消息（config 哈希理论上已挡住，此处防御性双保险）；
 * - 跳过回显后没有剩余可投内容（resume 空投喂无意义）。
 * 跳过回显的唯一情形：追加的第一条是「无 tool_calls 的 assistant、内容哈希=上轮返回」——即 CLI 会话里
 * 已有的自家回复（讨论稿 E4b「只发新消息」）；拿不准（哈希不等/带 tool_calls）一律回显，宁可重复不可丢失。
 */
function buildResumeIncrementTranscript(messages: unknown[], entry: ResumeChainEntry): string | null {
  const list = Array.isArray(messages) ? (messages as ChatMessageLike[]) : []
  const appended = list.slice(entry.messageHashes.length)
  if (!appended.length) return null
  if (appended.some((message) => String(message?.role || '') === 'system')) return null
  let fed = appended
  const first = appended[0]
  const firstHasToolCalls = Array.isArray(first?.tool_calls) && first.tool_calls.length > 0
  if (
    String(first?.role || '') === 'assistant'
    && !firstHasToolCalls
    && entry.lastAssistantContentHash
    && hashText(flattenContent(first?.content)) === entry.lastAssistantContentHash
  ) {
    fed = appended.slice(1)
  }
  if (!fed.length) return null
  const rendered = renderBridgePrompt(fed)
  if (rendered.systemPrompt.trim()) return null
  if (rendered.transcript === '（无对话内容）') return null
  return rendered.transcript
}

/**
 * 桥主入口：翻译请求 → 跑 claude CLI → 合成 OpenAI 形状 Response。
 * 失败一律 throw Error（人话原因），由 callAIWithFallback 的既有 catch 走统一报错口径。
 */
export async function callClaudeCodeBridge(
  input: ClaudeCodeBridgeInput,
  runner: ClaudeCliRunner = runClaudeCli
): Promise<Response> {
  const model = String(input.model || '').trim()
  if (!MODEL_NAME_PATTERN.test(model)) {
    throw new Error(`订阅桥模型名不合法：${model}（可用：${CLAUDE_CODE_BRIDGE_MODELS.join(' / ')} 或 Claude 模型全名）`)
  }
  const effort = String(input.effort || '').trim()
  if (effort && !(CLAUDE_CODE_BRIDGE_EFFORTS as readonly string[]).includes(effort)) {
    throw new Error(`Claude Code 订阅桥努力程度不合法：${effort}（可用：${CLAUDE_CODE_BRIDGE_EFFORTS.join(' / ')}）`)
  }
  const captureReasoning = input.thinking === 'enabled'

  const withTools = Array.isArray(input.tools) && input.tools.length > 0 && input.toolChoice !== 'none'
  const { systemPrompt, transcript, imagePaths } = renderBridgePrompt(input.messages)
  const finalSystemPrompt = withTools
    ? [systemPrompt, renderToolInstruction(input.tools as BridgeToolDefinition[], input.toolChoice)].filter(Boolean).join('\n\n')
    : systemPrompt

  // --resume 前缀分流（批H）：哈希口径=configHash（system 全文+模型+工具形态）×逐条消息哈希链；
  // 通道关闭（env=0）时不算哈希、不碰注册表，下方 executeOnce 参数与现役逐字节一致。
  const resumeEnabled = isClaudeCliResumeEnabled()
  const configHash = resumeEnabled
    ? computeBridgeConfigHash(`${model}:${effort || 'default'}`, withTools, finalSystemPrompt, String(input.continuityKey || ''))
    : ''
  const messageHashes = resumeEnabled ? computeBridgeMessageHashes(input.messages) : []

  // system 提示词走临时文件（--system-prompt-file）：提调 0-6 层纲领动辄数万字，
  // 直接当命令行参数会撞 Windows 32K 上限。
  const workDir = await mkdtemp(path.join(tmpdir(), 'langhuan-ccb-'))
  const systemPromptFile = path.join(workDir, 'system-prompt.txt')

  try {
    // system 文件写一次、两次尝试共用（resume 失败回退全量重试时内容逐字节相同，不重写）。
    if (finalSystemPrompt.trim()) {
      await writeFile(systemPromptFile, finalSystemPrompt, 'utf8')
    }

    /** 单次 CLI 执行（现役逻辑原样迁入 + resume 参数化）：resumeSession=null 即全量路径（=旧行为）。 */
    const executeOnce = async (
      resumeSession: { sessionId: string; incrementTranscript: string } | null
    ): Promise<{ completion: Record<string, unknown>; cliSessionId: string }> => {
      const args = [
        '-p',
        '--setting-sources', '',
        '--tools', '',
        // resume 通道开启：不传 --no-session-persistence（否则没东西可 resume），必传 --strict-mcp-config
        // （讨论稿 §1.4 实证：账号级 MCP 连接器中途挂载会污染工具表+作废前缀缓存，--setting-sources '' 挡不住）。
        // 通道关闭（env LANGHUAN_CLAUDE_CLI_RESUME=0）：保持 --no-session-persistence，与现役逐字节一致。
        ...(resumeEnabled ? ['--strict-mcp-config'] : ['--no-session-persistence']),
        // 工具轮跑 stream-json 才能就地拦截原生 tool_use；需要回传思考摘要的纯文本轮也用 stream-json
        // 收 assistant thinking block。其余纯文本轮维持一次性 json 信封；--verbose 是 -p + stream-json 硬要求。
        ...((withTools || captureReasoning) ? ['--output-format', 'stream-json', '--verbose'] : ['--output-format', 'json']),
        ...(effort ? ['--effort', effort] : []),
        '--model', model
      ]
      if (resumeSession) {
        args.push('--resume', resumeSession.sessionId)
      }
      if (finalSystemPrompt.trim()) {
        // resume 轮也传同一份 system 文件（逐字节相同）：讨论稿小问号②未验证 CLI 在 resume 时是否自动带回
        // 会话 system——传相同内容是正确性占优的选择（丢纲领是灾难；若 CLI 重复注入只损缓存不损语义），待真机确认。
        args.push('--system-prompt-file', systemPromptFile)
      }
      if (withTools) {
        args.push('--json-schema', JSON.stringify(buildToolCallSchema()))
      }

      // 原生 tool_use 拦截通道：首条带业务 tool_use 的 assistant 消息即全量捕获并提前收束——
      // 不拦的话 CLI 会回模型 No such tool available，模型撞墙几轮后放弃并答「工具不可用」（2026-07-08 真机根因）。
      const streamState: {
        capture: BridgeNativeToolUseCapture | null
        envelope: ClaudeCliEnvelope | null
        sessionId: string
        reasoningParts: string[]
        reasoningSeen: Set<string>
      } = {
        capture: null,
        envelope: null,
        sessionId: '',
        reasoningParts: [],
        reasoningSeen: new Set<string>()
      }
      const onStdoutLine = (withTools || captureReasoning)
        ? (line: string): boolean | void => {
            let event: { type?: unknown; session_id?: unknown; message?: { content?: unknown; usage?: ClaudeCliEnvelope['usage'] } }
            try {
              event = JSON.parse(line)
            } catch {
              return // stream 里混入的非 JSON 行（告警等）直接跳过
            }
            // resume 链注册需要 session_id：init/result 等事件均携带，见到即记录（拦截杀进程的轮也能靠 init 拿到；
            // 只写 streamState，不改变拦截逻辑本身）。
            if (typeof event?.session_id === 'string' && event.session_id) {
              streamState.sessionId = event.session_id
            }
            if (event?.type === 'result') {
              streamState.envelope = event as ClaudeCliEnvelope
              return
            }
            if (event?.type !== 'assistant') return
            const blocks = Array.isArray(event?.message?.content)
              ? (event.message?.content as Array<{ type?: unknown; name?: unknown; input?: unknown; text?: unknown; thinking?: unknown }>)
              : []
            if (captureReasoning) {
              for (const block of blocks) {
                if (block?.type !== 'thinking') continue
                const thinking = String(block.thinking || '').trim()
                if (!thinking || streamState.reasoningSeen.has(thinking)) continue
                streamState.reasoningSeen.add(thinking)
                streamState.reasoningParts.push(thinking)
              }
            }
            if (!withTools) return
            const toolUses = blocks.filter((block) => block?.type === 'tool_use'
              && String(block?.name || '').trim()
              && block?.name !== STRUCTURED_OUTPUT_TOOL_NAME)
            if (!toolUses.length) return
            streamState.capture = {
              content: blocks.filter((block) => block?.type === 'text').map((block) => String(block?.text || '')).join('\n').trim(),
              ...(streamState.reasoningParts.length ? { reasoningContent: streamState.reasoningParts.join('\n\n') } : {}),
              toolCalls: toolUses.map((block, index) => ({
                id: `call_bridge_native_${index}`,
                type: 'function' as const,
                // input 先剥仿真协议包壳（{arguments:"..."}）再序列化，保证 arguments 是「真实入参对象」的 JSON 串
                function: { name: String(block.name), arguments: JSON.stringify(unwrapNativeToolUseInput(block.input) ?? {}) }
              })),
              usage: event.message?.usage
            }
            return true // 本轮工具调用已全量到手：杀子进程，不让模型再进「No such tool」撞墙轮
          }
        : undefined

      input.logger?.debug?.(`【调试】Claude Code 订阅桥启动：model=${model} tools=${withTools ? (input.tools as BridgeToolDefinition[]).length : 0} 图片=${imagePaths.length} 路径=${resumeSession ? 'resume增量' : '全量'}`)
      const started = Date.now()
      const run = await runner({
        args,
        stdin: resumeSession ? resumeSession.incrementTranscript : transcript,
        signal: input.signal,
        ...(onStdoutLine ? { onStdoutLine } : {})
      })
      input.logger?.debug?.(`【调试】Claude Code 订阅桥返回：exit=${run.code} 拦截=${streamState.capture ? 'native-tool-use' : '无'} 耗时=${Date.now() - started}ms`)

      let completion: Record<string, unknown>
      let cliSessionId = streamState.sessionId
      if (streamState.capture) {
        const message: Record<string, unknown> = {
          role: 'assistant',
          content: streamState.capture.content,
          tool_calls: streamState.capture.toolCalls
        }
        if (streamState.capture.reasoningContent) message.reasoning_content = streamState.capture.reasoningContent
        completion = buildBridgeCompletion(model, message, true, streamState.capture.usage)
      } else {
        const envelope = (withTools || captureReasoning)
          ? (streamState.envelope ?? parseEnvelopeFromStdout(run.stdout))
          : parseWholeJsonEnvelope(run.stdout)
        if (!envelope) {
          const detail = (run.stderr || run.stdout || '').trim().slice(0, 300)
          throw new Error(`claude 输出不是合法 JSON（exit=${run.code}）：${detail || '无输出'}`)
        }
        if (envelope.is_error) {
          throw new Error(`claude 执行失败：${String(envelope.result || '').slice(0, 300) || '未知原因'}`)
        }
        if (typeof envelope.session_id === 'string' && envelope.session_id) {
          cliSessionId = envelope.session_id
        }
        completion = envelopeToChatCompletion(envelope, model, withTools, streamState.reasoningParts.join('\n\n'))
      }
      return { completion, cliSessionId }
    }

    // 分流判定（批H规格②）：链命中且增量可构造 → resume 路径；任何异常作废链并全量重试一次（规格④）；
    // 其余（未命中/通道关闭/无增量）→ 全量路径（=旧行为），成功且拿到 session_id 时注册为新链（规格①）。
    const matchedChain = resumeEnabled ? resumeChainRegistry.match(configHash, messageHashes) : null
    const incrementTranscript = matchedChain ? buildResumeIncrementTranscript(input.messages, matchedChain) : null

    let outcome: { completion: Record<string, unknown>; cliSessionId: string }
    if (matchedChain && incrementTranscript !== null) {
      matchedChain.inFlight = true // 禁止同一 session 并发 resume（讨论稿 §2.4）
      try {
        outcome = await executeOnce({ sessionId: matchedChain.cliSessionId, incrementTranscript })
        resumeChainRegistry.commit(matchedChain, messageHashes, extractAssistantEchoHash(outcome.completion), outcome.cliSessionId)
      } catch (err) {
        // 回退保命（批H规格④）：作废链（含尽力删盘）→ 全量重试同一调用一次（只此一次），最坏情况=退回现役行为。
        resumeChainRegistry.invalidate(matchedChain)
        if (input.signal?.aborted) throw err // 用户取消不是 resume 故障，不做重试
        input.logger?.warn?.(`【claude-code桥】resume 路径失败（session=${matchedChain.cliSessionId}），已作废链并回退全量重试一次：${(err as Error).message}`)
        outcome = await executeOnce(null)
        registerResumeChain(outcome.cliSessionId, configHash, messageHashes, extractAssistantEchoHash(outcome.completion))
      }
    } else {
      outcome = await executeOnce(null)
      if (resumeEnabled) {
        registerResumeChain(outcome.cliSessionId, configHash, messageHashes, extractAssistantEchoHash(outcome.completion))
      }
    }

    const completion = outcome.completion
    if (input.stream) {
      return new Response(chatCompletionToSseBody(completion), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    }
    return new Response(JSON.stringify(completion), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => { /* 临时目录清理失败不致命 */ })
  }
}
