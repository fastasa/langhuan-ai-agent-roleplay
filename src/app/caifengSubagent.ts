/**
 * 「采风」知识钻取 subagent（状态系统融入提调计划批次2·2026-07-10 用户拍板定名）。
 *
 * 定位：提调统筹编排时发现三渠道（对话可见历史/资料池/状态栏 MD）不够写本轮，就用 dispatchResearch 把一个
 * 明确的钻取任务（标题+任务书+验收标准）派给采风；采风在自己的干净小上下文里多路取证，最后 submitFindings
 * 交回结论。统筹本体不再自己囤取料上下文（批次3 三件套下架，移交这里）。
 *
 * 形态边界：
 * - 采风「搜→读→再钻」多轮工具循环，走 runAgentRuntime 独立小 loop（先例=旁白独立 loop）。
 *   2026-07-10 剧本系统优化批次3 起编剧也升同款真 loop（runScriptwriterLoop·工具集复用 buildCaifengToolset），
 *   旧「编剧=runSubagent 单次结构化调用」的 subagentSpec 注册表已整套退役。
 * - UI 复用 subagentRunStatus（与编剧同一状态表·秒表/token/内部信息流）：手动 begin/end 埋点，
 *   subagentId=`caifeng:<taskKey>`——同轮并行多个钻取任务各占一张运行卡互不覆盖。
 * - 模型=balanced 校书档（modelTaskTiers 'caifengResearch'·统筹本体是 smart 掌阁），callModel 由管线注入
 *   （buildDeferredLoopModelCall taskId 复用·带 usage 透传供 token 卡显示）。
 *
 * 铁律：采风全只读（工具集不含任何写工具）；角色大脑资料必须标注归属（信息差=戏剧抓手，绝不混池）；
 * 命中落池走工具自身现有副作用（三件套→世界池、recallCharacterBrain→该角色池），采风不新增落池路径。
 */

import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import { formatSubagentElapsed } from './subagentTimeoutPolicy'
import {
  createFetchUnitDetailTool,
  createReadChatMessageTool,
  createReadMessageProjectionTool,
  createReadStatusPanelsTool,
  createRecallCharacterBrainTool,
  createRecallSemanticTool,
  createSearchWorldTextTool
} from './tidiaoGlobalTools'
import type {
  TidiaoMessageProjectionToolContext,
  TidiaoRetrievalToolContext,
  TidiaoStatusSystemToolContext
} from './tidiaoToolBusinessContext'
import type { TidiaoChatMessageReadContext } from './tidiaoChatMessageTools'
// type-only import（构建期擦除·无运行时循环）：harness 不 import 本模块，依赖单向。
import type { GroupDirectorRecallPoolAppend } from './groupDirectorHarness'
import { createReadChatProjectionTool, createSearchChatProjectionTool } from './xingyiProjectionTools'
import { assembleAgentSkillSupply, type AgentSkillSupplyAssembly } from './agentSupply'

export const CAIFENG_SUBAGENT_ID_PREFIX = 'caifeng'
export const CAIFENG_SUBAGENT_LABEL = '采风'
export const CAIFENG_SUBMIT_TOOL_NAME = 'submitFindings'

/** 采风预算：小 loop 干完就走（死循环兜底=超时）；与统筹「无限轮+20min」刻意不同——派遣任务必须收敛。 */
const CAIFENG_BUDGET = { maxTurns: 12, maxToolCalls: 24 }
const CAIFENG_NUDGE_MAX = 2

export interface CaifengResearchInput {
  /** 钻取任务短标题（显示在运行卡上，如「查元英的佩剑来历」）。 */
  task: string
  /** 任务书：要查什么、以什么为准算查到（逐条·即采风的验收标准）。 */
  instructions: string
  /** 建议钻取方向（可选，如「先搜投影再读原文」「文档库找组织设定」）。 */
  focus?: string
}

export interface CaifengCoverageItem {
  item: string
  status: 'found' | 'partial' | 'not_found'
  note?: string
}

export interface CaifengResearchResult {
  ok: boolean
  /** 给提调的综合结论（按任务逐条·注明出处；查不到也写明查过哪里）。 */
  answer: string
  coverage: CaifengCoverageItem[]
  /** 失败原因（ok=false 才有：超时/超预算/没交稿/被停止）。 */
  error?: string
  /** 失败的机器可读上下文；派遣者应把它随原始错误一并交回父 Agent。 */
  failure?: {
    kind: 'timeout' | 'aborted' | 'no-submit' | 'runtime-error'
    timeoutMs: number
    elapsedMs: number
    terminalReason?: string
    rawError: string
  }
}

export const CAIFENG_SYSTEM_PROMPT = [
  '你是「采风」——琅嬛聊天区提调（导演）派出的知识钻取员。提调统筹编排剧情时发现手头资料不够，把一个明确的钻取任务交给你；你的唯一职责是把任务书里每一条查透，然后交回一份提调可直接使用的结论。',
  '',
  '工作方式：',
  '1) 先读任务书：搞清每条要查什么、以什么为准算查到（这是你的验收标准）。',
  '2) 先使用随任务加载的统一原始可见上下文；只有任务仍有明确证据缺口时，才按《统一投影目录》选择只读详情工具继续钻取。',
  '3) 交稿：全部条目查完后调用 submitFindings 提交。answer 按任务逐条写结论并**注明出处**（第N层/单位名/某角色大脑/某状态栏）；查不到的条目也要写明「查过哪里、没有」，绝不编造。',
  '',
  '铁律：',
  '- 你只读不写：绝不改任何消息、状态栏、文档。',
  '- 角色知识必须隔离标注：来自某角色大脑的信息要标明归属（只有该角色自己知道）；来自文档库的是世界设定（不代表任何角色知道）。绝不把 A 角色的私有记忆说成 B 也知道。',
  '- 不要漫游：只查任务书要的，查到就收，不为凑步数反复取料；同一个查询别重复发。',
  '- 最后必须真调用 submitFindings 交稿——光在正文里写结论不算交稿；查不到也要交稿说明。'
].join('\n')

/** 运行卡任务名提取（UI 用）：从 status.input（=renderCaifengBrief 产物）首行「【钻取任务】xxx」抽标题。
 *  契约与 renderCaifengBrief 同文件维护不漂移；抽不到回退空串（UI 显示默认「钻取任务」）。 */
export function extractCaifengTaskTitle(input: string | undefined): string {
  const firstLine = String(input || '').split('\n', 1)[0] || ''
  const match = firstLine.match(/^【钻取任务】(.*)$/)
  return match ? match[1].trim() : ''
}

/** 任务书 → user 消息（也是运行卡「提调 → 采风」内部信息流原文）。 */
export function renderCaifengBrief(input: CaifengResearchInput): string {
  const lines = [`【钻取任务】${String(input.task || '').trim()}`, '', '【任务书（逐条完成·即验收标准）】', String(input.instructions || '').trim()]
  const focus = String(input.focus || '').trim()
  if (focus) lines.push('', `【建议方向】${focus}`)
  lines.push('', '完成所有条目后调用 submitFindings 交稿（answer 逐条给结论并注明出处；coverage 逐条标 found/partial/not_found）。')
  return lines.join('\n')
}

/** 采风工具集装配（复用提调全局池工厂·ctx 与统筹同一份接缝对象，命中落池副作用天然共享）。
 *  recordRetrievalDecision 不接（采风的取料留在自己 loop 内部，不回填统筹 script.retrieval）。 */
export interface CaifengToolsetDeps {
  sessionId: string
  sessionTitle?: string
  /** 本轮出场候选（recallCharacterBrain 范围受限铁律 + 投影会话上下文用）。 */
  candidates: Array<{ characterId: string; name: string }>
  chatMessageReadContext?: TidiaoChatMessageReadContext | null
  projectionContext?: TidiaoMessageProjectionToolContext['projectionContext'] | null
  retrievalContext?: TidiaoRetrievalToolContext['retrievalContext'] | null
  /** 与统筹同一份落池接缝（三件套命中→世界池、recallCharacter→该角色池·副作用共享）。 */
  recallPoolAppend?: GroupDirectorRecallPoolAppend | null
  statusSystem?: TidiaoStatusSystemToolContext | null
}

export function buildCaifengToolset(deps: CaifengToolsetDeps): ToolDefinition[] {
  const tools: ToolDefinition[] = []
  if (deps.chatMessageReadContext) tools.push(createReadChatMessageTool({ readContext: deps.chatMessageReadContext }))
  if (deps.projectionContext) tools.push(createReadMessageProjectionTool({ projectionContext: deps.projectionContext }))
  // 星依投影两件套复用（getSessionContext 注入固定会话·不走浮坞 chatSummary 桥）：读全貌/多关键词搜投影。
  const projectionSeam = {
    getSessionContext: () => ({
      sessionId: deps.sessionId,
      sessionTitle: String(deps.sessionTitle || '当前会话'),
      characterOptions: deps.candidates.map((c) => ({ id: c.characterId, name: c.name }))
    })
  }
  tools.push(createReadChatProjectionTool(projectionSeam), createSearchChatProjectionTool(projectionSeam))
  if (deps.retrievalContext) {
    const retrievalCtx = {
      retrievalContext: deps.retrievalContext,
      ...(deps.recallPoolAppend ? { recallPoolAppend: deps.recallPoolAppend } : {})
    }
    tools.push(createRecallSemanticTool(retrievalCtx), createSearchWorldTextTool(retrievalCtx), createFetchUnitDetailTool(retrievalCtx))
  }
  if (deps.recallPoolAppend?.recallCharacter) {
    tools.push(createRecallCharacterBrainTool({
      candidates: {
        set: new Set(deps.candidates.map((c) => c.characterId)),
        text: deps.candidates.map((c) => `${c.name}（characterId=${c.characterId}）`).join('、')
      },
      recallCharacter: deps.recallPoolAppend.recallCharacter
    }))
  }
  if (deps.statusSystem) tools.push(createReadStatusPanelsTool(deps.statusSystem))
  return tools
}

/** 交稿工具（采风私有·只活在采风 registry，不进提调语义表）。 */
function createSubmitFindingsTool(holder: { findings: CaifengResearchResult | null }, fallbackItem: string): ToolDefinition {
  return {
    name: CAIFENG_SUBMIT_TOOL_NAME,
    brief: '全部任务条目查完后交稿（唯一收尾方式）：answer=给提调的逐条结论（注明出处·查不到写明查过哪里），coverage=逐条覆盖情况。',
    schema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: '给提调的综合结论（必填）：按任务逐条写结果并注明出处（第N层/单位名/某角色大脑/某状态栏）；查不到的条目写明查过哪里、没有。' },
        coverage: {
          type: 'array',
          description: '逐条覆盖情况（必填）：每条任务一项。',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string', description: '任务条目（简短复述）。' },
              status: { type: 'string', enum: ['found', 'partial', 'not_found'], description: '查到/部分查到/没查到。' },
              note: { type: 'string', description: '补充说明（可选，如出处或没查到的原因）。' }
            },
            required: ['item', 'status']
          }
        }
      },
      required: ['answer', 'coverage']
    },
    validateArgs: (args) => (String(args.answer || '').trim() ? null : 'submitFindings 缺少 answer（给提调的结论正文）'),
    execute: (toolCall) => {
      const answer = String(toolCall.args.answer || '').trim()
      const rawCoverage = Array.isArray(toolCall.args.coverage) ? toolCall.args.coverage : []
      const coverage: CaifengCoverageItem[] = rawCoverage
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          item: String(item.item || '').trim() || fallbackItem,
          status: (['found', 'partial', 'not_found'].includes(String(item.status)) ? String(item.status) : 'partial') as CaifengCoverageItem['status'],
          ...(String(item.note || '').trim() ? { note: String(item.note).trim() } : {})
        }))
      // 模型漏 coverage 时宽容兜底为整任务一条（不为格式卡死交稿——answer 才是主产出）。
      holder.findings = { ok: true, answer, coverage: coverage.length ? coverage : [{ item: fallbackItem, status: 'partial' }] }
      return { content: '已收到钻取结论，任务结束。', details: { kind: 'caifengSubmit' } }
    }
  }
}

export interface RunCaifengResearchDeps {
  sessionId: string
  /** 运行卡键（并行多任务各不同，如 `caifeng:3`）。 */
  taskKey: string
  /** 采风工具集（buildCaifengToolset 产物·全只读）。 */
  tools: ToolDefinition[]
  /** 由统一投影服务按 caifeng 配方生成的本次作用域快照。 */
  contextBlock: string
  /** balanced 校书档模型调用（管线 buildDeferredLoopModelCall taskId='caifengResearch' 注入·返回带 usage）。 */
  callModel: (request: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  }) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>
  signal?: AbortSignal
  /** 父 Agent 为本次钻取声明的时限；缺省仍使用全局 30 分钟。 */
  timeoutMs?: number
}

/** 跑一次采风钻取小 loop：runSubagentLoop 收编骨架（begin/end 运行卡+空转续轮门+交稿即 terminate+usage 累加），
 *  submitFindings 交稿即 terminate → 回结论。永不抛错（派遣工具回执如实转达失败）；abort 时返回 ok:false。 */
export async function runCaifengResearch(
  input: CaifengResearchInput,
  deps: RunCaifengResearchDeps
): Promise<CaifengResearchResult> {
  const holder: { findings: CaifengResearchResult | null } = { findings: null }
  const brief = renderCaifengBrief(input)
  const contextBlock = String(deps.contextBlock || '').trim()
  if (!contextBlock) {
    return {
      ok: false,
      answer: '',
      coverage: [],
      error: '采风统一原始可见上下文为空，已拒绝在信息来源不明的情况下启动',
      failure: {
        kind: 'runtime-error',
        timeoutMs: deps.timeoutMs ?? SUBAGENT_LOOP_TIMEOUT_MS,
        elapsedMs: 0,
        rawError: '采风统一原始可见上下文为空'
      }
    }
  }
  let skillAssembly: AgentSkillSupplyAssembly
  try {
    skillAssembly = await assembleAgentSkillSupply({ profileId: 'caifeng.research' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      answer: '',
      coverage: [],
      error: `采风常驻知识装载失败：${message}`,
      failure: {
        kind: 'runtime-error',
        timeoutMs: deps.timeoutMs ?? SUBAGENT_LOOP_TIMEOUT_MS,
        elapsedMs: 0,
        rawError: message
      }
    }
  }
  const fallbackItem = String(input.task || '').trim() || '钻取任务'
  const skillAwareSystemPrompt = [
    CAIFENG_SYSTEM_PROMPT,
    skillAssembly.layers['0'],
    skillAssembly.layers['1'],
    skillAssembly.layers['4']
  ].filter(Boolean).join('\n\n')
  await runSubagentLoop({
    profileId: 'caifeng.research',
    sessionId: deps.sessionId,
    subagentId: `${CAIFENG_SUBAGENT_ID_PREFIX}:${deps.taskKey}`,
    loggedInput: brief,
    presentation: {
      label: '采风',
      icon: 'compass',
      runningVerb: '钻取中',
      title: extractCaifengTaskTitle(brief) || fallbackItem
    },
    agentName: 'CaifengResearchAgent',
    runtimeVersion: 'caifeng-research-runtime-v1',
    messages: [
      { role: 'system', content: skillAwareSystemPrompt },
      { role: 'user', content: `${brief}\n\n【本次作用域原始可见上下文】\n${contextBlock}` }
    ],
    skillAssembly,
    tools: deps.tools,
    submitTool: createSubmitFindingsTool(holder, fallbackItem),
    submitToolName: CAIFENG_SUBMIT_TOOL_NAME,
    isSubmitted: () => Boolean(holder.findings),
    nudgeId: 'caifeng-empty-turn-nudge',
    nudgeMaxCount: CAIFENG_NUDGE_MAX,
    buildNudgeText: () => '你这一步没有发起任何工具调用，而任务还没交稿：光在正文里写结论不算完成。资料够了就立刻调用 submitFindings 交稿（answer 逐条结论+出处，coverage 逐条覆盖情况）；还缺证据就继续用只读工具去查。',
    submitTerminateId: 'caifeng-submit-terminate',
    submitTerminateSummary: '采风已交稿，收束钻取 loop',
    // 交稿宽限轮（批K）：预算尽/超时/收束没交稿时，强制给一次"只许 submitFindings"的补救机会。
    submitGrace: {
      submitToolName: CAIFENG_SUBMIT_TOOL_NAME,
      buildNudge: (reason, failureHint) => [
        reason === 'budget' ? '钻取预算（轮数/工具调用数）已经用尽' : reason === 'timeout' ? '钻取时间已经用尽' : '你已经收束却始终没有交稿',
        '，这是最后的交稿机会：立即调用 submitFindings，用你目前已经查到的资料交稿——answer 写已确认的结论（逐条带出处），coverage 如实标注哪些点没查完。不要调用任何其他工具，不要再继续钻取。',
        ...(failureHint ? [`\n上次交稿失败原因：${failureHint}——修正参数后重新提交。`] : [])
      ].join('')
    },
    budget: CAIFENG_BUDGET,
    timeoutMs: deps.timeoutMs ?? SUBAGENT_LOOP_TIMEOUT_MS,
    ...(deps.signal ? { signal: deps.signal } : {}),
    callModel: deps.callModel,
    onNoSubmit: (reason, detail) => {
      const reasonText = (reason === 'timeout'
        ? `钻取超时（时限 ${Math.max(1, Math.round(detail.timeoutMs / 60_000))} 分钟，已运行 ${formatSubagentElapsed(detail.elapsedMs)}）`
        : reason === 'aborted'
          ? '钻取被停止'
          : '采风没有调用 submitFindings 交稿（结论未结构化提交）')
        + (detail?.graceFailed ? '；宽限轮补交稿也未成功' : '')
      holder.findings = {
        ok: false,
        answer: '',
        coverage: [],
        error: reasonText,
        failure: {
          kind: reason,
          timeoutMs: detail.timeoutMs,
          elapsedMs: detail.elapsedMs,
          ...(detail.terminalReason ? { terminalReason: detail.terminalReason } : {}),
          rawError: reasonText
        }
      }
    },
    onCatchError: (message, detail) => {
      const rawError = `钻取运行失败：${message}`
      holder.findings = {
        ok: false,
        answer: '',
        coverage: [],
        error: rawError,
        failure: { kind: 'runtime-error', timeoutMs: detail.timeoutMs, elapsedMs: detail.elapsedMs, rawError }
      }
    },
    buildEndPayload: () => {
      const findings = holder.findings as CaifengResearchResult
      return {
        ok: findings.ok,
        ...(findings.ok ? {} : { error: findings.error || '钻取失败' }),
        ...(findings.answer ? { output: findings.answer } : {})
      }
    }
  })
  return holder.findings as CaifengResearchResult
}

/** 派遣回执渲染（dispatchResearch 工具 content·给统筹看）：结论全文 + 覆盖清单。 */
export function renderCaifengDispatchOutcome(input: CaifengResearchInput, result: CaifengResearchResult): string {
  if (!result.ok) {
    const retry = result.failure?.kind === 'timeout'
      ? '这是超时，不等于没有资料。可提高 timeoutMinutes 后原任务重派，或缩小任务范围分批调查；也可以保留该缺口继续编排。'
      : '可换个更具体的任务书重派一次，或改用手头轻量工具（读楼层/读投影）自己核对。'
    return `采风任务「${input.task}」失败：${result.error || '未知原因'}。${retry}`
  }
  const lines = [`采风任务「${input.task}」已交稿：`, result.answer]
  if (result.coverage.length) {
    const statusLabel = { found: '✓查到', partial: '△部分', not_found: '✗没查到' } as const
    lines.push('', '覆盖情况：' + result.coverage.map((item) => `${statusLabel[item.status]} ${item.item}${item.note ? `（${item.note}）` : ''}`).join('；'))
  }
  return lines.join('\n')
}
