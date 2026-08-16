import type { ToolDefinition } from './agentRuntime/toolRegistry'
import type { SubagentRunUsage } from './subagentRunStatus'
import { runSubagentLoop, SUBAGENT_LOOP_TIMEOUT_MS } from './subagentLoop'
import type { DeferredScriptwriterReport } from './deferredAgentEventQueue'
import { assembleAgentSkillSupply, type AgentSkillSupplyAssembly } from './agentSupply'

export const NARRATIVE_SCRIPTWRITER_SUBAGENT_ID = 'scriptwriter-narrative-analysis'
export const NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME = 'submitNarrativeAnalysis'

const BUDGET = { maxTurns: 10, maxToolCalls: 20 }

export interface NarrativeScriptwriterInput {
  brief: string
  asks?: string
  /** 由统一投影服务按 scriptwriter 配方生成；不得由调用方另行手拼同类上下文。 */
  contextBlock: string
  pref?: string
}

/** 上游派遣只提交任务；统一上下文由会话接缝在真正执行前加载。 */
export type NarrativeScriptwriterDispatchInput = Omit<NarrativeScriptwriterInput, 'contextBlock'>

export interface NarrativeScriptwriterResult {
  ok: boolean
  report: DeferredScriptwriterReport
  error?: string
}

const SYSTEM_PROMPT = [
  '你是琅嬛的「编剧」异步分析 Agent。提调已经继续工作，不会停下来等你；你的交稿会在下一次模型边界进入提调的迟到结果收件箱。',
  '你的职责是分析本轮对既有叙事因果线的影响，不是预写用户下一步，不是重写 arc/threads/nextBeat，也不直接宣布世界已经变化。',
  '请区分三层：',
  '1) 已确认事实：只能写 brief 或取证材料明确显示已经发生的内容，并注明简短依据；没有就交空数组。',
  '2) 候选判断：特殊触发、冲突、失效、加速、延迟、新元素或可能相关的叙事种子；必须保留“候选”语气。',
  '3) 建议动作：提调下一步可以做的核对、人物调度、旁白安排或叙事种子写操作；它们不是已经执行的结果。',
  '遇到 ready_to_trigger（待引爆）种子时，先比较开始时间与当前帷幕时间，按已经过去的时长推演因果积累；逐项检查是否会引入新人物、改变人物关系、地点局势或更大世界状态。时间到只代表时间门越过，不代表预期后果已经发生。',
  '建议更新种子时要指出具体 seedId、应改字段与依据：描述/当前进展/预期后果可作为低风险维护建议；标题、类型、起因、开始时间、地点、影响范围、生命周期、可见性、参与者和关系属于高风险结构变更，必须建议走用户确认，不能在分析回报里冒充已执行。',
  '不得把计划写成事实，不得虚构用户行为，不得用旧路线约束开放式对话。资料不够时宁可留空并建议核对。',
  `完成后必须调用 ${NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME} 交稿，光在正文回答不算完成。`
].join('\n')

function renderInput(input: NarrativeScriptwriterInput): string {
  return [
    `【本轮必要信息】\n${String(input.brief || '').trim()}`,
    `【统一原始可见上下文】\n${String(input.contextBlock || '').trim()}`,
    String(input.pref || '').trim() ? `【用户剧情倾向（长期口味，不是已发生事实）】\n${String(input.pref).trim()}` : '',
    String(input.asks || '').trim() ? `【提调具体询问】\n${String(input.asks).trim()}` : '',
    `完成分析后调用 ${NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME}，严格分开已确认事实、候选判断、建议动作。`
  ].filter(Boolean).join('\n\n')
}

function cleanText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 800)
}

function createSubmitTool(holder: { result: NarrativeScriptwriterResult | null }): ToolDefinition {
  return {
    name: NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME,
    brief: '提交结构化异步编剧回报：已确认事实、候选判断、建议动作必须分栏，允许任一栏为空。',
    schema: {
      type: 'object',
      properties: {
        confirmedFacts: {
          type: 'array',
          items: { type: 'object', properties: { fact: { type: 'string' }, evidence: { type: 'string' } }, required: ['fact'] }
        },
        candidateJudgments: {
          type: 'array',
          items: {
            type: 'object',
            properties: { judgment: { type: 'string' }, reason: { type: 'string' }, seedIds: { type: 'array', items: { type: 'string' } } },
            required: ['judgment']
          }
        },
        suggestedActions: {
          type: 'array',
          items: {
            type: 'object',
            properties: { action: { type: 'string' }, reason: { type: 'string' }, seedIds: { type: 'array', items: { type: 'string' } } },
            required: ['action']
          }
        }
      },
      required: ['confirmedFacts', 'candidateJudgments', 'suggestedActions']
    },
    execute: (toolCall) => {
      const facts = Array.isArray(toolCall.args.confirmedFacts) ? toolCall.args.confirmedFacts : []
      const judgments = Array.isArray(toolCall.args.candidateJudgments) ? toolCall.args.candidateJudgments : []
      const actions = Array.isArray(toolCall.args.suggestedActions) ? toolCall.args.suggestedActions : []
      holder.result = {
        ok: true,
        report: {
          confirmedFacts: facts.map((item: any) => ({ fact: cleanText(item?.fact), ...(cleanText(item?.evidence) ? { evidence: cleanText(item.evidence) } : {}) })).filter((item) => item.fact).slice(0, 12),
          candidateJudgments: judgments.map((item: any) => ({
            judgment: cleanText(item?.judgment),
            ...(cleanText(item?.reason) ? { reason: cleanText(item.reason) } : {}),
            ...(Array.isArray(item?.seedIds) ? { seedIds: item.seedIds.map(cleanText).filter(Boolean).slice(0, 8) } : {})
          })).filter((item) => item.judgment).slice(0, 12),
          suggestedActions: actions.map((item: any) => ({
            action: cleanText(item?.action),
            ...(cleanText(item?.reason) ? { reason: cleanText(item.reason) } : {}),
            ...(Array.isArray(item?.seedIds) ? { seedIds: item.seedIds.map(cleanText).filter(Boolean).slice(0, 8) } : {})
          })).filter((item) => item.action).slice(0, 12)
        }
      }
      return { content: '异步编剧回报已结构化提交。', details: { kind: 'narrativeScriptwriterSubmit' } }
    }
  }
}

export interface RunNarrativeScriptwriterDeps {
  sessionId: string
  sourceCallId: string
  tools: ToolDefinition[]
  callModel: (request: {
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
    toolBriefs: Array<{ name: string; brief: string; schema?: Record<string, unknown> }>
    toolCatalog?: Array<{ name: string; brief: string; recommended: boolean }>
  }) => Promise<{ content: string; toolCalls: unknown[]; usage?: SubagentRunUsage }>
}

export async function runNarrativeScriptwriterAnalysis(
  input: NarrativeScriptwriterInput,
  deps: RunNarrativeScriptwriterDeps
): Promise<NarrativeScriptwriterResult> {
  const holder: { result: NarrativeScriptwriterResult | null } = { result: null }
  const emptyReport: DeferredScriptwriterReport = { confirmedFacts: [], candidateJudgments: [], suggestedActions: [] }
  if (!String(input.contextBlock || '').trim()) {
    return { ok: false, report: emptyReport, error: '异步编剧统一原始可见上下文为空，已拒绝启动' }
  }
  let skillAssembly: AgentSkillSupplyAssembly
  try {
    skillAssembly = await assembleAgentSkillSupply({ profileId: 'scriptwriter.narrative-analysis' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, report: emptyReport, error: `异步编剧 Skill 供给装载失败：${message}` }
  }
  await runSubagentLoop({
    profileId: 'scriptwriter.narrative-analysis',
    sessionId: deps.sessionId,
    subagentId: NARRATIVE_SCRIPTWRITER_SUBAGENT_ID,
    loggedInput: renderInput(input),
    presentation: {
      label: '编剧',
      icon: 'clapperboard',
      runningVerb: '编剧中',
      title: '异步叙事分析'
    },
    agentName: 'NarrativeScriptwriterAgent',
    runtimeVersion: 'narrative-scriptwriter-runtime-v1',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: renderInput(input) }],
    skillAssembly,
    tools: deps.tools,
    submitTool: createSubmitTool(holder),
    submitToolName: NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME,
    isSubmitted: () => Boolean(holder.result?.ok),
    nudgeId: 'narrative-scriptwriter-empty-turn',
    nudgeMaxCount: 2,
    buildNudgeText: () => `分析完成就调用 ${NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME} 交稿；还缺事实才继续用只读工具。不要预写下一拍。`,
    submitTerminateId: 'narrative-scriptwriter-submit-terminate',
    submitTerminateSummary: '异步编剧已交稿',
    submitGrace: {
      submitToolName: NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME,
      buildNudge: (_reason, failureHint) => `这是最后交稿机会：立即调用 ${NARRATIVE_SCRIPTWRITER_SUBMIT_TOOL_NAME}，资料不足的栏交空数组。${failureHint ? `上次失败：${failureHint}` : ''}`
    },
    budget: BUDGET,
    timeoutMs: SUBAGENT_LOOP_TIMEOUT_MS,
    callModel: deps.callModel,
    onNoSubmit: (reason) => { holder.result = { ok: false, report: emptyReport, error: reason === 'timeout' ? '异步编剧超时' : '异步编剧未结构化交稿' } },
    onCatchError: (message) => { holder.result = { ok: false, report: emptyReport, error: `异步编剧运行失败：${message}` } },
    buildEndPayload: () => ({ ok: Boolean(holder.result?.ok), ...(holder.result?.error ? { error: holder.result.error } : {}) })
  })
  return holder.result ?? { ok: false, report: emptyReport, error: '异步编剧没有返回结果' }
}
