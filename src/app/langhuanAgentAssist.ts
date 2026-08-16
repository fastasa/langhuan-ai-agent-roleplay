import type { AgentModelConfig } from '../types'
import type { UnitView } from '../types/unitView'
import { buildTaskModelAiOptions } from '../utils/modelTaskTiers'
import { parseCharacterCoreMarkdown } from './characterCoreMarkdownTransfer'
import { buildCharacterCoreMarkdown, buildCharacterCoreMarkdownPrompt } from './characterCoreMarkdownTransfer'
import {
  buildCharacterBrainSeedPromptSection,
  parseCharacterBrainSeedMarkdown,
  type CharacterBrainSeed
} from './characterBrainSeedFromGeneration'
import { parseCompilePageMarkdownBatch } from './compilePageMarkdownImport'
import {
  buildCompactRelationMarkdown,
  parseCompactRelationMarkdown,
  type CompactRelationExportMapping
} from './unitRelationCompactMarkdown'
import { buildUnitTreeMarkdownWithCompilePrompt } from './unitTreeJsonExport'

export type LanghuanAgentAiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LanghuanAgentAiOptions = ReturnType<typeof buildTaskModelAiOptions> & {
  feature: 'agent'
  logLabel: string
  usageLabel?: string
  placeLabel?: string
  placeType?: 'single' | 'group' | 'other'
  registerAbortController?: boolean
}

export type LanghuanAgentAiCaller = (
  messages: LanghuanAgentAiMessage[],
  options: LanghuanAgentAiOptions
) => Promise<string | null>

export type LanghuanAgentUnitInput = {
  units: UnitView[]
  rootUnitIds: string[]
  sourceLabel?: string
  agentConfig: Partial<AgentModelConfig> | null | undefined
  callAI: LanghuanAgentAiCaller
}

export type LanghuanAgentCompilePageResult = {
  markdown: string
  entryCount: number
}

export type LanghuanAgentRelationResult = {
  markdown: string
  mapping: CompactRelationExportMapping
  relationCount: number
  warningCount: number
}

export type LanghuanAgentCharacterCoreResult = {
  markdown: string
  changes: Record<string, unknown>
  /** 大脑种子（2026-07-08）：出生日期+灵魂节点+关键经历，创建角色后由调用方写进灵魂/轨迹正式真值。 */
  seed: CharacterBrainSeed
}

export function buildLanghuanAgentCompilePagePrompt(input: Pick<LanghuanAgentUnitInput, 'units' | 'rootUnitIds' | 'sourceLabel'>) {
  return buildUnitTreeMarkdownWithCompilePrompt({
    units: input.units,
    rootUnitIds: input.rootUnitIds,
    sourceLabel: input.sourceLabel
  })
}

export async function runLanghuanAgentCompilePage(input: LanghuanAgentUnitInput): Promise<LanghuanAgentCompilePageResult> {
  const prompt = buildLanghuanAgentCompilePagePrompt(input)
  return callAgentMarkdownWithRepair(input.callAI, input.agentConfig, prompt, {
    logLabel: 'langhuan-agent-compile-page',
    usageLabel: 'Agent 生成编译页',
    placeLabel: input.sourceLabel || '未标明'
  }, (markdown) => validateLanghuanAgentCompilePageMarkdown(markdown))
}

export async function runLanghuanAgentRelationOptimize(input: LanghuanAgentUnitInput): Promise<LanghuanAgentRelationResult> {
  const exportResult = buildCompactRelationMarkdown({
    units: input.units,
    rootUnitIds: input.rootUnitIds,
    sourceLabel: input.sourceLabel,
    promptVersion: 'v2'
  })
  return callAgentMarkdownWithRepair(input.callAI, input.agentConfig, exportResult.markdown, {
    logLabel: 'langhuan-agent-relation-optimize',
    usageLabel: 'Agent 优化关系提示',
    placeLabel: input.sourceLabel || exportResult.mapping.sourceLabel || '未标明'
  }, (markdown) => {
    const parsed = parseCompactRelationMarkdown(markdown, exportResult.mapping)
    const relationCount = Array.from(parsed.relationHintsByUnitId.values()).reduce((total, hints) => total + hints.length, 0)
    if (!relationCount) {
      const reason = parsed.warnings.map((warning) => warning.message).filter(Boolean).join('；')
      throw new Error(reason || 'Agent 没有返回可导入的关系提示')
    }
    return {
      markdown,
      mapping: exportResult.mapping,
      relationCount,
      warningCount: parsed.warnings.length
    }
  })
}

export function buildLanghuanAgentCharacterCorePrompt(brief: string) {
  const safeBrief = String(brief || '').trim()
  const markdown = buildCharacterCoreMarkdown({
    name: '',
    desc: safeBrief
  })
  return buildCharacterCoreMarkdownPrompt([
    '用户对角色的简要描述：',
    safeBrief,
    '',
    '本次生成必须以这段简要描述为核心约束，不能忽略、反转或替换成无关设定。',
    // 2026-07-08：生成范围从「只有核心」扩为核心+灵魂+轨迹种子；关系视图、地点安排、待确认写入仍不生成
    buildCharacterBrainSeedPromptSection(),
    '不要生成关系视图、地点安排或待确认写入。',
    '',
    '角色资料模板：',
    '',
    markdown
  ].join('\n'), { allowSeedSections: true })
}

export async function runLanghuanAgentCharacterCore(input: {
  brief: string
  agentConfig: Partial<AgentModelConfig> | null | undefined
  callAI: LanghuanAgentAiCaller
}): Promise<LanghuanAgentCharacterCoreResult> {
  const prompt = buildLanghuanAgentCharacterCorePrompt(input.brief)
  return callAgentMarkdownWithRepair(input.callAI, input.agentConfig, prompt, {
    logLabel: 'langhuan-agent-character-core',
    usageLabel: 'Agent 生成角色核心',
    placeLabel: '新建角色'
  }, (markdown) => {
    const changes = parseCharacterCoreMarkdown(markdown)
    if (!String(changes.name || '').trim()) {
      throw new Error('Agent 输出缺少角色名称')
    }
    // 种子段落校验失败同样抛错，走同一条修正重跑链
    const seed = parseCharacterBrainSeedMarkdown(markdown)
    return { markdown, changes, seed }
  })
}

export function validateLanghuanAgentCompilePageMarkdown(markdown: string): LanghuanAgentCompilePageResult {
  const parsed = parseCompilePageMarkdownBatch(markdown)
  if (!parsed.entries.length) {
    const reason = parsed.warnings.map((warning) => warning.message).filter(Boolean).join('；')
    throw new Error(reason || 'Agent 输出不是可导入的批量编译页 Markdown')
  }
  return {
    markdown,
    entryCount: parsed.entries.length
  }
}

/**
 * 生成→校验→失败带报错自动修一轮（批次2.5-①）。
 * validate 抛错=格式/内容未过校验：把「失败原因+上一次输出」拼进修正提示重跑一次，第二次仍不过才向上抛。
 * 只修校验失败，不重试 API 调用失败（callAgentMarkdown 抛的错原样传播）。
 * 联动标注：本核心被页面按钮与星依功能工具双入口共用（经 xingyiFunctionBridge），改动这里两边同时生效。
 */
async function callAgentMarkdownWithRepair<T>(
  callAI: LanghuanAgentAiCaller,
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  prompt: string,
  meta: Pick<LanghuanAgentAiOptions, 'logLabel' | 'usageLabel' | 'placeLabel'>,
  validate: (markdown: string) => T
): Promise<T> {
  const first = await callAgentMarkdown(callAI, agentConfig, prompt, meta)
  try {
    return validate(first)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const repairPrompt = [
      prompt,
      '',
      '---',
      '【修正要求】你上一次的输出未通过格式校验，未被采纳。',
      `校验失败原因：${reason}`,
      '你上一次的输出（仅供修正参考，不要重复同样的错误）：',
      '```',
      first,
      '```',
      '请严格按上方原始要求的格式，重新输出完整、可通过校验的结果；只输出结果本身，不要解释。'
    ].join('\n')
    const second = await callAgentMarkdown(callAI, agentConfig, repairPrompt, {
      ...meta,
      logLabel: `${meta.logLabel}-repair`
    })
    return validate(second)
  }
}

async function callAgentMarkdown(
  callAI: LanghuanAgentAiCaller,
  agentConfig: Partial<AgentModelConfig> | null | undefined,
  prompt: string,
  meta: Pick<LanghuanAgentAiOptions, 'logLabel' | 'usageLabel' | 'placeLabel'>
) {
  const output = await callAI([{ role: 'user', content: prompt }], {
    // 批次3（2026-07-08 槽位收束）：高量槽退役归掌阁档；旧高量槽默认 0.8/8192/disabled 落调用点覆写（行为不变）。
    ...buildTaskModelAiOptions(agentConfig, 'langhuanAssist', { temperature: 0.8, maxTokens: 8192, thinking: 'disabled' }),
    feature: 'agent',
    logLabel: meta.logLabel,
    usageLabel: meta.usageLabel,
    placeLabel: meta.placeLabel,
    placeType: 'other',
    registerAbortController: false
  })
  const text = String(output || '').trim()
  if (!text) throw new Error('Agent 没有返回内容')
  if (/^\[API调用失败:/u.test(text)) {
    throw new Error(text.replace(/^\[|\]$/g, ''))
  }
  return text
}
