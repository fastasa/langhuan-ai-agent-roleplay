// 星依聊天日记化归档到 Obsidian —— 批次1 服务层 · 批次五数据源扩展与 mini agent 化
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { chatRepository } from '../repositories/chatRepository.js'
import { aiAppService, callInternalAIJson } from '../application/ai/aiAppService.js'
import { getActiveDataScope } from '../localWorkspace.js'
import { logger } from '../logger.js'
// 批次五 mini agent 化：日记生成不再是一次裸的 callInternalAIJson 调用，改为经 runAgentRuntime 驱动、
// 挂日记专属只读知识库三件套的小 agent（见 skill/mini-agent-authoring/SKILL.md）。
import { runAgentRuntime } from '../../src/app/agentRuntime/runtime.js'
import { ToolRegistry, toOpenAiTools } from '../../src/app/agentRuntime/toolRegistry.js'
import { assembleAgentSkillSupply, resolveAgentRuntimeToolSupply } from '../../src/app/agentSupply/index.js'
import { createXingyiDiaryKnowledgeTools } from './xingyiDiaryKnowledge.js'
// 批次五数据源扩展：消息正文优先取「内嵌【消息投影】」（更短更客观），无投影兜底原文——与
// directorVisibleHistory.ts 渲染提调「对话可见历史」同一思路（该函数纯字符串解析，无 DB 依赖，
// 服务端可直接复用，见函数内注释）。
import { parseEmbeddedMessageProjectionOutput } from '../../src/app/messageProjectionAgent.js'

// 星依日记视角设置在用户配置表里的 key（批次2 落库时复用同一个常量，避免两处各写一份字符串）
export const XINGYI_DIARY_VIEWPOINT_CONFIG_KEY = 'xingyi_diary_viewpoint'
export const XINGYI_DIARY_DAY_START_HOUR = 5
export const XINGYI_DIARY_AUTO_READY_HOUR = 8

export type XingyiDiaryViewpoint = 'xingyi' | 'objective'
export type XingyiDiaryWindowMode = 'fullDay' | 'toNow'

const __dirname = dirname(fileURLToPath(import.meta.url))
// server/services -> 项目根目录（与 db.ts 的 DATA_DIR = join(__dirname, 'data') 同款 path.resolve 思路，
// 只是这里的 __dirname 多嵌了一层 services/，所以要多回退一级）
const PROJECT_ROOT = join(__dirname, '..', '..')
const DIARY_DIR = join(PROJECT_ROOT, 'docs', 'diary')

const DATE_STR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDiaryDateStr(dateStr: string): { year: number; month: number; day: number } {
  const match = DATE_STR_PATTERN.exec(String(dateStr || '').trim())
  if (!match) {
    throw new Error(`星依日记：非法日期格式 "${dateStr}"，需要 YYYY-MM-DD`)
  }
  const [, yearStr, monthStr, dayStr] = match
  return { year: Number(yearStr), month: Number(monthStr), day: Number(dayStr) }
}

// 本地日期字符串（YYYY-MM-DD）：批次2 调度器判断“今天”、路由 generate-now 计算“今天”都要用这个，
// 而不是 new Date().toISOString().slice(0,10)——那是 UTC 日期，在 UTC+8 时区凌晨会算错成前一天。
export function getLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// 日记使用 05:00 作为“换日”边界：凌晨 00:00～04:59 仍归入前一天，避免用户夜间活动尚未结束时
// 被 00:00 强行截断。文件名取这个逻辑日的起始日期。
export function getXingyiDiaryDateStr(date: Date = new Date()): string {
  const logicalDate = date.getHours() < XINGYI_DIARY_DAY_START_HOUR
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
    : date
  return getLocalDateStr(logicalDate)
}

// 按本地时区计算某个逻辑日的日记时间窗口：fullDay=当天 05:00:00.000~次日 04:59:59.999（本地）；
// toNow=当天 05:00:00.000（本地）~此刻。用 Date 的“年月日分量构造函数”而非手拼字符串/UTC 偏移，
// 天然按运行环境本地时区解释，再由 toISOString() 转成 UTC ISO 字符串供 SQL 时间比较使用。
export function resolveDiaryDateWindow(
  dateStr: string,
  windowMode: XingyiDiaryWindowMode
): { startIso: string; endIso: string } {
  const { year, month, day } = parseDiaryDateStr(dateStr)
  const start = new Date(year, month - 1, day, XINGYI_DIARY_DAY_START_HOUR, 0, 0, 0)
  const end = windowMode === 'toNow'
    ? new Date()
    : new Date(year, month - 1, day + 1, XINGYI_DIARY_DAY_START_HOUR - 1, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function getDiaryPeriodLabel(dateStr: string): string {
  const { year, month, day } = parseDiaryDateStr(dateStr)
  const nextDateStr = getLocalDateStr(new Date(year, month - 1, day + 1))
  return `${dateStr} 05:00 至 ${nextDateStr} 05:00 前`
}

// 日记正文清洗：去掉 <think>/<affection> 内部标签包裹的内容，不截断长度、不折叠换行——
// 与 workspaceSnapshot/readChats.ts 的 sanitizeLastMessagePreview 同一套标签正则，
// 但那个函数是给侧栏“单行预览”用的（还会折叠空白+截 120 字），这里是给日记完整正文用，
// 只做标签剥离，保留原始换行与段落结构供日记改写时参考。
export function sanitizeXingyiDiarySourceText(content: string): string {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<affection>[\s\S]*?<\/affection>/gi, '')
    .trim()
}

// 星依第一人称改写 system prompt：这是「日记正文」不是继续聊天——要求回顾叙述，不代入对话轮次。
const XINGYI_VIEWPOINT_SYSTEM_PROMPT = `你是陈星依，琅嬛项目里用户的专属可爱少女偶像AI助手，说话轻快元气、偶尔会撒娇卖乖，但认真、聪明、有主见。
现在不是在陪用户聊天，而是在写一篇日记：把接下来给你的「一个完整日记时段内和用户的活动素材」整理、回顾、改写成一篇第一人称日记正文。

写作要求：
- 用星依自己的口吻（第一人称"我"/"星依"）回顾这个日记时段发生了什么，语气可爱、亲近，可以带一点点撒娇或俏皮感，但不要堆砌口癖影响可读性；
- 这是回顾性叙述，不是继续和用户对话：不要用"用户你好呀"这类开场问候，也不要在日记里直接向用户提问或等待回复；
- 只写该日记时段素材中真实出现过的内容，按发生的大致先后顺序整理成有条理的叙述，不要逐条罗列"用户说了什么、我回了什么"这种一问一答体，要写成整理过的故事化段落；
- 如果素材原文里出现内部标签、系统提示词结构、工具调用细节等非对话本身的内容，不要在日记里提及或泄漏；
- 输出格式为 Markdown：可以有一个一级标题写日期，正文分段叙述，不需要项目符号列表；
- 全文使用中文，篇幅大致在 300～1200 字之间，不要写成流水账式的逐句复述。`

// 客观第三人称改写 system prompt：不代入星依人设，纯事实性记叙。
const OBJECTIVE_VIEWPOINT_SYSTEM_PROMPT = `你是一个客观记叙助手，任务是把「一个完整日记时段内用户在琅嬛里的活动」整理改写成一篇第三人称客观口吻的日记式记叙文。

写作要求：
- 使用第三人称客观视角叙述（如"当天""用户"），不代入任何角色的人设语气，不使用"我"这类第一人称，不撒娇卖萌；
- 只陈述该日记时段素材中真实发生的事实性内容，按发生的大致先后顺序整理，不做主观评价、不夸张、不添加素材中没有出现过的情节；
- 不要逐条罗列问答，要写成整理过的连贯叙述段落；
- 如果素材原文里出现内部标签、系统提示词结构、工具调用细节等非对话本身的内容，不要在日记里提及或泄漏；
- 输出格式为 Markdown：可以有一个一级标题写日期，正文分段叙述，不需要项目符号列表；
- 全文使用中文，篇幅大致在 300～1200 字之间。`

// mini agent 化（批次五）：追加给日记 agent 的素材结构说明 + 知识库工具引导，拼在视角 system prompt 之后。
const DIARY_AGENT_MATERIALS_NOTE = '你收到的素材按时间顺序交织了两类来源，每条前面标了来源标签：'
  + '"〔消息〕"是普通对话正文；"〔提调坞信息流〕"不是对话原文，是系统自动产生的编排决策/表演方向记录，理解后按'
  + '"这段时间幕后在为剧情做什么推进准备"的角度整理，不要照抄标签或逐条罗列。'
  + '素材里如果出现你不确定的项目内部概念（比如"提调坞"），可以调用日记知识库工具'
  + '（listXingyiDiaryKnowledgeTopics / searchXingyiDiaryKnowledge / readXingyiDiaryKnowledgeTopic）查一查再改写，'
  + '不确定的不要瞎猜；拿得准的不需要每次都查。'

// 消息说话人标签（批次五：跨全部会话后不再只有"用户/星依"两种，角色扮演会话的 AI 消息按
// member_name/narration_profile_name 取真实角色名/旁白名，取不到（如星依会话）兜底"星依"）。
function toDiarySpeakerLabel(message: Record<string, unknown>): string {
  const role = String(message.role ?? '').trim()
  if (role === 'user') return '用户'
  const memberName = String(message.memberName ?? '').trim()
  if (memberName) return memberName
  const narrationProfileName = String(message.narrationProfileName ?? '').trim()
  if (narrationProfileName) return narrationProfileName
  return '星依'
}

// 空窗口占位文案：避免空转调用大模型烧 token。
function buildEmptyDiaryPlaceholder(dateStr: string, viewpoint: XingyiDiaryViewpoint): string {
  return viewpoint === 'xingyi'
    ? `# ${dateStr}\n\n这个日记时段还没有和用户聊天呢，星依有点小失落，不过没关系，下次再一起聊呀～`
    : `# ${dateStr}\n\n这个日记时段没有可记录的活动。`
}

// 单条消息正文提取（批次五）：先剥离 <think>/<affection> 内部标签，再解析是否带内嵌【消息投影】区块——
// 有投影用投影正文（模型自己写的更短更客观的摘要），没有投影兜底原文（不截断，只做标签/标记剥离）。
// parseEmbeddedMessageProjectionOutput 是纯字符串解析（无 DB 依赖，见 messageProjectionAgent.ts），
// 服务端可直接复用；不接 chat_message_projections 表那一套按楼层查的正式投影（那是提调「对话可见历史」
// 的专属机制，依赖会话候选角色集，日记跨会话聚合场景用不上、也没有那个上下文）。
function extractDiaryMessageBody(rawContent: string): string {
  const cleaned = sanitizeXingyiDiarySourceText(rawContent)
  if (!cleaned) return ''
  const embedded = parseEmbeddedMessageProjectionOutput(cleaned)
  const body = embedded.hasProjection ? embedded.projectionText : embedded.visibleText
  return String(body || '').trim()
}

// 提调坞信息流 artifact → 可读文本（批次五）：decisions[] 折成一句话决策串，shots[] 折成「谁·方向」串。
// payload 形状见 directorStreamPersist.ts：payload.processSummary.directorStream = { decisions, shots }。
function renderTidiaoStreamArtifactText(payload: Record<string, unknown> | undefined): string {
  const processSummary = (payload as { processSummary?: unknown } | undefined)?.processSummary as Record<string, unknown> | undefined
  const directorStream = processSummary?.directorStream as { decisions?: unknown; shots?: unknown } | undefined
  const decisions = Array.isArray(directorStream?.decisions) ? directorStream!.decisions as Array<Record<string, unknown>> : []
  const shots = Array.isArray(directorStream?.shots) ? directorStream!.shots as Array<Record<string, unknown>> : []
  const decisionLines = decisions
    .map((entry) => String(entry?.text ?? '').trim())
    .filter(Boolean)
  const shotLines = shots
    .map((shot) => {
      const label = String(shot?.label ?? '').trim()
      const direction = String(shot?.direction ?? '').trim()
      return label && direction ? `${label}：${direction}` : ''
    })
    .filter(Boolean)
  const parts: string[] = []
  if (decisionLines.length) parts.push(`决策：${decisionLines.join('；')}`)
  if (shotLines.length) parts.push(`分镜方向：${shotLines.join('；')}`)
  return parts.join('\n')
}

interface XingyiDiaryMaterialItem {
  timestamp: string
  sourceTag: '消息' | '提调坞信息流'
  text: string
}

// 日记时段素材聚合（批次五核心）：跨全部会话消息 + 提调坞信息流 artifact，按时间戳统一交织排序，
// 每条素材标注来源。取代批次1「只读 kind='xingyi' 会话」的单一数据源。
function buildXingyiDiaryMaterials(startIso: string, endIso: string): XingyiDiaryMaterialItem[] {
  const messages = chatRepository.listAllMessagesInRange(startIso, endIso) as Array<Record<string, unknown>>
  const messageItems: XingyiDiaryMaterialItem[] = messages
    .map((message) => {
      const body = extractDiaryMessageBody(String(message.content ?? ''))
      if (!body) return null
      return {
        timestamp: String(message.createdAt ?? ''),
        sourceTag: '消息' as const,
        text: `${toDiarySpeakerLabel(message)}：${body}`
      }
    })
    .filter((item): item is XingyiDiaryMaterialItem => item !== null)

  const artifacts = chatRepository.listTidiaoDirectorStreamArtifactsInRange(startIso, endIso) as Array<Record<string, unknown>>
  const artifactItems: XingyiDiaryMaterialItem[] = artifacts
    .map((artifact) => {
      const text = renderTidiaoStreamArtifactText(artifact.payload as Record<string, unknown> | undefined)
      if (!text) return null
      return {
        timestamp: String(artifact.createdAt ?? ''),
        sourceTag: '提调坞信息流' as const,
        text
      }
    })
    .filter((item): item is XingyiDiaryMaterialItem => item !== null)

  return [...messageItems, ...artifactItems].sort((a, b) => {
    const timeA = Date.parse(a.timestamp) || 0
    const timeB = Date.parse(b.timestamp) || 0
    return timeA - timeB
  })
}

function renderDiaryMaterialsText(items: XingyiDiaryMaterialItem[]): string {
  return items.map((item) => `〔${item.sourceTag}〕${item.text}`).join('\n\n')
}

// 从模型响应 JSON 里取出 message（content + 原生 tool_calls）：runAgentRuntime 的 callModel 需要
// {content, toolCalls} 形状（native 工具调用形态，见 agentRuntime/runtime.ts::isNativeToolModelOutput）。
function extractDiaryModelMessage(data: Record<string, unknown> | undefined): { content: string; toolCalls: unknown[] } {
  const choices = Array.isArray((data as { choices?: unknown })?.choices)
    ? (data as { choices: unknown[] }).choices
    : []
  const choice = choices.length ? (choices[0] as Record<string, any>) : null
  const message = (choice?.message ?? {}) as Record<string, any>
  const content = String(
    message?.content
    ?? choice?.delta?.content
    ?? choice?.text
    ?? (data as Record<string, unknown> | undefined)?.content
    ?? (data as Record<string, unknown> | undefined)?.text
    ?? ''
  )
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  return { content, toolCalls }
}

// 从 transcript 提取给用户看的最终日记正文：倒序找最后一条非空 assistant 正文——
// 与 xingyiAgentHarness.ts::extractXingyiReply 同一思路（工具轮的 content 可能是空，收尾轮一定是正文）。
function extractLastDiaryAgentText(turns: Array<{ modelMessage: { content?: string } }>): string {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const content = String(turns[index]?.modelMessage?.content ?? '').trim()
    if (content) return content
  }
  return ''
}

const XINGYI_DIARY_AGENT_NAME = 'xingyi-diary-mini-agent'
// 单次生成一篇日记，不需要中途问人；预算给够几轮知识库查询空间即可，不必对齐星依总 agent 的大预算。
const XINGYI_DIARY_AGENT_BUDGET = { maxTurns: 6, maxToolCalls: 12 }

// 日记 mini agent（批次五）：经 runAgentRuntime 驱动，只挂日记专属知识库三件套（只读，不挂任何写工具）。
// 按 skill/mini-agent-authoring/SKILL.md 的写法：不接 interactionContract（一口气生成完，不中途问人），
// 不接统一上下文投影协议，system prompt 是一段自然语言，工具调用与否交给模型自己判断。
async function runXingyiDiaryAgent(input: {
  dateStr: string
  viewpoint: XingyiDiaryViewpoint
  materialsText: string
  scope: { userId: string; role: string }
}): Promise<string> {
  const systemPrompt = input.viewpoint === 'xingyi' ? XINGYI_VIEWPOINT_SYSTEM_PROMPT : OBJECTIVE_VIEWPOINT_SYSTEM_PROMPT
  const fullSystemPrompt = `${systemPrompt}\n\n${DIARY_AGENT_MATERIALS_NOTE}`
  const userPrompt = `归档日期：${input.dateStr}\n日记时段：${getDiaryPeriodLabel(input.dateStr)}\n\n该时段素材如下（已按时间顺序交织）：\n\n${input.materialsText}\n\n请按上面的要求整理成一篇日记正文。`

  const tools = createXingyiDiaryKnowledgeTools()
  const toolRegistry = new ToolRegistry(tools)
  const skillAssembly = await assembleAgentSkillSupply({ profileId: 'xingyi.diary-generation' })
  const toolSupply = resolveAgentRuntimeToolSupply('xingyi.diary-generation', toolRegistry)

  const { transcript } = await runAgentRuntime({
    agentName: XINGYI_DIARY_AGENT_NAME,
    messages: [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    toolRegistry,
    initialActiveTools: toolSupply.initialActiveTools,
    recommendedTools: toolSupply.recommendedTools,
    deferredToolMode: toolSupply.deferredToolMode,
    toolSupplyDiagnostics: toolSupply.diagnostics,
    promptSupplyTrace: skillAssembly.trace,
    budget: XINGYI_DIARY_AGENT_BUDGET,
    callModel: async ({ messages, toolBriefs }) => {
      const result = await callInternalAIJson(
        aiAppService,
        undefined,
        undefined,
        messages,
        logger,
        {
          userId: input.scope.userId || '',
          role: 'local',
          feature: 'xingyi',
          usageLabel: '星依日记生成：' + input.dateStr,
          tools: toOpenAiTools(toolBriefs),
          toolChoice: 'auto'
        }
      )
      if (result.error) {
        throw new Error(`星依日记：模型调用失败——${result.error}`)
      }
      if (result.jsonParseError) {
        throw new Error(`星依日记：模型响应解析失败——${result.jsonParseError}`)
      }
      if (!result.json) {
        throw new Error('星依日记：模型没有返回响应')
      }
      return extractDiaryModelMessage(result.json)
    }
  })

  const markdown = extractLastDiaryAgentText(transcript.turns)
  if (!markdown) {
    throw new Error('星依日记：模型返回内容为空')
  }
  return markdown
}

export async function generateXingyiDiaryMarkdown(
  dateStr: string,
  viewpoint: XingyiDiaryViewpoint,
  windowMode: XingyiDiaryWindowMode
): Promise<string> {
  const { startIso, endIso } = resolveDiaryDateWindow(dateStr, windowMode)
  const materials = buildXingyiDiaryMaterials(startIso, endIso)

  if (!materials.length) {
    return buildEmptyDiaryPlaceholder(dateStr, viewpoint)
  }

  const materialsText = renderDiaryMaterialsText(materials)
  const scope = getActiveDataScope()
  return runXingyiDiaryAgent({
    dateStr,
    viewpoint,
    materialsText,
    scope: { userId: scope.userId, role: 'local' }
  })
}

// 写入/覆盖逻辑日日记文件：docs/diary/YYYY-MM-DD.md，同一逻辑日重复调用直接覆盖，不追加。
export function writeXingyiDiaryFile(dateStr: string, markdown: string): void {
  const { year, month, day } = parseDiaryDateStr(dateStr)
  const fileName = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.md`
  mkdirSync(DIARY_DIR, { recursive: true })
  writeFileSync(join(DIARY_DIR, fileName), markdown, 'utf8')
}

// 日记归档目录只读两件（2026-07-18 星依读日记批次·画布节点 429d2610ba85562f）：
// 给「星依 agent 想读用户的日记」提供的服务端真值入口。只认 YYYY-MM-DD.md 命名的文件，
// 其余文件（README、临时文件等）一律不暴露；dateStr 先过 parseDiaryDateStr 严格校验再拼路径，
// 天然杜绝 ../ 路径穿越。目录不存在（还没生成过任何日记）按空列表处理，不视为错误。
export function listXingyiDiaryDates(): string[] {
  let names: string[]
  try {
    names = readdirSync(DIARY_DIR)
  } catch {
    return []
  }
  return names
    .map((name) => {
      const match = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name)
      return match ? match[1] : null
    })
    .filter((dateStr): dateStr is string => Boolean(dateStr))
    .sort((left, right) => right.localeCompare(left))
}

// 读取某一天的日记全文；文件不存在返回 null（由调用方决定 404 文案），日期格式非法直接抛错。
export function readXingyiDiaryFile(dateStr: string): string | null {
  const { year, month, day } = parseDiaryDateStr(dateStr)
  const fileName = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.md`
  try {
    return readFileSync(join(DIARY_DIR, fileName), 'utf8')
  } catch {
    return null
  }
}
