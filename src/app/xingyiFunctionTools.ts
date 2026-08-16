/**
 * 星依功能工具（批次2 功能工具化）—— 把散落的按钮功能包成星依可调用的自包含工具工厂。
 *
 * 范式：R1 工厂闭包 createXxxTool(ctx)，由 xingyiAgentHarness 每轮装配进星依池。
 * execute 核心不在本文件：全部经 xingyiFunctionBridge 调用页面按钮的同款 handler（双入口一真值）。
 * 注：editUnitCompilePage 已于 2026-07-11 迁入 xingyiUnitCrudTools（适配器真值直写·页面无关），
 * 本文件只剩需要页面 handler 的四件（生成编译页/优化关系/生成角色/总结对话）。
 *
 * 写操作统一确认门（硬门·计划书 §5.3-2）：
 * 四个工具全是写操作，execute 前必须过 ctx.confirmWrite（浮坞弹确认卡片，用户点确认才放行）；
 * ctx.confirmWrite 未注入时一律拒绝执行——安全兜底，不靠纲领口头约束。
 * 用户拒绝返回「已取消」的成功态结果（不是 error），模型不应重试，转述并尊重即可。
 * 门模板单一实现=agentRuntime/interactionContract 的 requireConfirmWriteChannel/askConfirmWrite（2026-07-12 批C 收敛）。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel,
  type ConfirmWriteRequest
} from './agentRuntime/interactionContract'
import type {
  XingyiChatSummaryProvider,
  XingyiUnitToolProvider
} from './xingyiFunctionBridge'
import { getXingyiFunctionProvider } from './xingyiFunctionBridge'

/** 写确认门请求：浮坞渲染成确认卡片（标题+条目行+确认/取消）。与统一契约 ConfirmWriteRequest 同形状，直接复用。 */
export type XingyiWriteConfirmRequest = ConfirmWriteRequest

export type XingyiWriteConfirm = ConfirmWriteChannel

export interface XingyiFunctionToolContext {
  /** 写确认门（浮坞注入）。缺省=确认通道未接入，所有写工具拒绝执行。 */
  confirmWrite?: XingyiWriteConfirm
  /** 本轮是否已经成功读取关系提示专项 Skill。 */
  hasReadRelationHintSkill?: () => boolean
}

const UNIT_TARGETS = {
  worldbook: { providerKey: 'worldbookUnits', label: '世界书文档库', openHint: '请先打开文档库页面' },
  characterBrain: { providerKey: 'characterBrainUnits', label: '角色大脑', openHint: '请先打开某个角色的大脑页面' }
} as const

type UnitTargetKey = keyof typeof UNIT_TARGETS

function readUnitTarget(raw: unknown): UnitTargetKey | null {
  const value = String(raw || '').trim()
  return value === 'worldbook' || value === 'characterBrain' ? value : null
}

function readNameList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => String(item || '').trim()).filter(Boolean)
}

/** 对应页面未打开（成功态结果：如实转告用户去打开页面，不是故障）。 */
function providerMissingResult(openHint: string): ToolExecutionResult {
  return {
    content: `这个能力需要对应页面在场才能执行：${openHint}，然后再让星依做一次。`,
    details: { providerMissing: true }
  }
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

/** 单位名称/unitId → unitId 解析：先精确 unitId，再精确标题，最后唯一子串；歧义/未命中给可读候选。 */
export function resolveXingyiUnitIds(
  provider: Pick<XingyiUnitToolProvider, 'listUnits'>,
  names: string[]
): { unitIds: string[]; error?: string } {
  const units = provider.listUnits()
  const unitIds: string[] = []
  for (const name of names) {
    const byId = units.find((unit) => unit.unitId === name)
    if (byId) {
      unitIds.push(byId.unitId)
      continue
    }
    const exact = units.filter((unit) => unit.title === name)
    if (exact.length === 1) {
      unitIds.push(exact[0].unitId)
      continue
    }
    if (exact.length > 1) {
      return { unitIds: [], error: `「${name}」有 ${exact.length} 个同名单位，请改用 unitId 指定：${exact.slice(0, 8).map((unit) => `${unit.title}(${unit.unitId})`).join('、')}` }
    }
    const partial = units.filter((unit) => unit.title.includes(name))
    if (partial.length === 1) {
      unitIds.push(partial[0].unitId)
      continue
    }
    if (partial.length > 1) {
      return { unitIds: [], error: `「${name}」匹配到多个单位，请用完整标题或 unitId：${partial.slice(0, 8).map((unit) => `${unit.title}(${unit.unitId})`).join('、')}` }
    }
    return { unitIds: [], error: `没有找到名为「${name}」的单位。可先用 searchWorldText/recallSemantic 查到准确标题或 unitId 再试。` }
  }
  return { unitIds: Array.from(new Set(unitIds)) }
}

function buildUnitSourceLabel(units: Array<{ unitId: string; title: string }>, unitIds: string[]): string {
  const titles = unitIds
    .map((unitId) => units.find((unit) => unit.unitId === unitId)?.title || unitId)
  const first = titles[0] || '未标明'
  return titles.length > 1 ? `星依·${first} 等${titles.length}项` : `星依·${first}`
}

async function executeUnitWriteTool(input: {
  ctx: XingyiFunctionToolContext
  target: UnitTargetKey
  unitNames: string[]
  action: string
  confirmExtraLines: string[]
  requiresRelationHintSkill?: boolean
  run: (provider: XingyiUnitToolProvider, unitIds: string[], sourceLabel: string) => Promise<{ ok: boolean; message: string }>
}): Promise<ToolExecutionResult> {
  if (input.requiresRelationHintSkill && !input.ctx.hasReadRelationHintSkill?.()) {
    const message = `「${input.action}」会写入关系提示，必须先调用 readRelationHintSkill 读取现役语法、合法谓词、方向和复诊规则。`
    return {
      content: message,
      status: 'error',
      error: { type: 'EXPECTATION_MISMATCH', message, retryable: true }
    }
  }
  const targetMeta = UNIT_TARGETS[input.target]
  const provider = getXingyiFunctionProvider(targetMeta.providerKey)
  if (!provider) return providerMissingResult(targetMeta.openHint)
  // 硬门（统一 helper）：缺通道 helper 必返回拒绝结果，断言非空
  if (!input.ctx.confirmWrite) return requireConfirmWriteChannel(input.ctx.confirmWrite)!
  const resolved = resolveXingyiUnitIds(provider, input.unitNames)
  if (resolved.error) {
    return {
      content: resolved.error,
      status: 'error',
      error: { type: 'INVALID_ARGUMENT', message: resolved.error, retryable: true }
    }
  }
  const units = provider.listUnits()
  const titles = resolved.unitIds.map((unitId) => units.find((unit) => unit.unitId === unitId)?.title || unitId)
  const denied = await askConfirmWrite(input.ctx.confirmWrite, {
    title: input.action,
    lines: [
      `目标：${targetMeta.label}（${provider.contextLabel()}）`,
      `单位（${titles.length} 个）：${titles.join('、')}`,
      ...input.confirmExtraLines
    ]
  }, input.action)
  if (denied) return denied
  const sourceLabel = buildUnitSourceLabel(units, resolved.unitIds)
  try {
    const result = await input.run(provider, resolved.unitIds, sourceLabel)
    return {
      content: result.message,
      ...(result.ok ? {} : {
        status: 'error' as const,
        error: { type: 'TOOL_RUNTIME_ERROR' as const, message: result.message, retryable: false }
      }),
      details: { target: input.target, unitIds: resolved.unitIds, ok: result.ok }
    }
  } catch (error) {
    return runFailureResult(input.action, error)
  }
}

const UNIT_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      enum: ['worldbook', 'characterBrain'],
      description: '作用域：worldbook=世界书文档库页面；characterBrain=当前打开的角色大脑页面（必填）。'
    },
    unitNames: {
      type: 'array',
      items: { type: 'string' },
      description: '要处理的单位标题或 unitId 列表（必填，至少 1 个；不确定名字先用检索工具查证）。'
    },
    reason: { type: 'string', description: '为何做这次操作（可选，简短，供审计）。' }
  },
  required: ['target', 'unitNames']
} as const

function validateUnitToolArgs(args: Record<string, unknown>, toolLabel: string): string | null {
  if (!readUnitTarget(args.target)) return `${toolLabel} 的 target 必须是 worldbook 或 characterBrain`
  if (!readNameList(args.unitNames).length) return `${toolLabel} 缺少 unitNames（至少 1 个单位标题或 unitId）`
  return null
}

/** 生成编译页（写操作·经确认门）：对世界书/角色大脑选中单位跑按钮同款「AI 生成+导入落库」。 */
export function createGenerateCompilePageTool(ctx: XingyiFunctionToolContext): ToolDefinition {
  return {
    name: 'generateCompilePage',
    // executeUnitWriteTool 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '为世界书文档库或当前角色大脑的指定单位自动生成并导入编译页；会写关系提示，调用前必须先读 readRelationHintSkill（写操作，会先弹确认）。',
    schema: { ...UNIT_TOOL_SCHEMA },
    validateArgs: (args) => validateUnitToolArgs(args, 'generateCompilePage'),
    execute: (toolCall) => executeUnitWriteTool({
      ctx,
      target: readUnitTarget(toolCall.args.target) as UnitTargetKey,
      unitNames: readNameList(toolCall.args.unitNames),
      action: '生成编译页',
      requiresRelationHintSkill: true,
      confirmExtraLines: ['操作：AI 生成编译页并导入（有覆盖冲突时页面会再弹确认）。'],
      run: (provider, unitIds, sourceLabel) => provider.generateCompilePage(unitIds, sourceLabel)
    })
  }
}

/** 优化关系提示（写操作·经确认门）：导入前页面会弹 review 弹窗，需要用户在页面上二次确认。 */
export function createOptimizeUnitRelationsTool(ctx: XingyiFunctionToolContext): ToolDefinition {
  return {
    name: 'optimizeUnitRelations',
    // executeUnitWriteTool 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，免受默认单工具超时限制。
    longRunning: true,
    brief: '为世界书文档库或当前角色大脑的指定单位自动优化并导入关系提示；调用前必须先读 readRelationHintSkill（写操作，会先弹确认，导入前页面还会弹逐条 review）。',
    schema: { ...UNIT_TOOL_SCHEMA },
    validateArgs: (args) => validateUnitToolArgs(args, 'optimizeUnitRelations'),
    execute: (toolCall) => executeUnitWriteTool({
      ctx,
      target: readUnitTarget(toolCall.args.target) as UnitTargetKey,
      unitNames: readNameList(toolCall.args.unitNames),
      action: '优化关系提示',
      requiresRelationHintSkill: true,
      confirmExtraLines: ['操作：AI 优化关系提示；导入前页面会弹逐条 review 弹窗，请用户留在页面上确认。'],
      run: (provider, unitIds, sourceLabel) => provider.optimizeRelations(unitIds, sourceLabel)
    })
  }
}

/** 自动生成角色（写操作·经确认门）：按简要描述生成角色核心+灵魂+轨迹种子并直接创建正式角色。 */
export function createGenerateCharacterTool(ctx: XingyiFunctionToolContext): ToolDefinition {
  return {
    name: 'generateCharacter',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '按一段简要描述自动生成角色并创建为正式角色：核心字段+灵魂节点（稳定认知）+轨迹初始内容（出生日期与关键经历）（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '角色的简要描述（必填，AI 以它为核心约束生成完整角色核心）。' }
      },
      required: ['brief']
    },
    validateArgs: (args) => String(args.brief || '').trim() ? null : 'generateCharacter 缺少 brief（角色简要描述）',
    execute: async (toolCall) => {
      const provider = getXingyiFunctionProvider('characterCreate')
      if (!provider) return providerMissingResult('请等待桌面工作台加载完成（角色编辑组件未就绪）')
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const brief = String(toolCall.args.brief || '').trim()
      const briefPreview = brief.length > 120 ? `${brief.slice(0, 120)}…` : brief
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '自动生成角色',
        lines: [`简要描述：${briefPreview}`, '操作：AI 生成角色核心+灵魂节点+轨迹初始内容（出生日期与关键经历），并直接创建为正式角色。']
      }, '自动生成角色')
      if (denied) return denied
      try {
        const result = await provider.generateCharacter(brief)
        return {
          content: result.message,
          ...(result.ok ? {} : {
            status: 'error' as const,
            error: { type: 'TOOL_RUNTIME_ERROR' as const, message: result.message, retryable: false }
          }),
          details: { ok: result.ok }
        }
      } catch (error) {
        return runFailureResult('自动生成角色', error)
      }
    }
  }
}

function resolveSummaryCharacterIds(
  options: Array<{ id: string; name: string }>,
  names: string[]
): { characterIds: string[]; error?: string } {
  if (!names.length) return { characterIds: options.map((option) => option.id) }
  const characterIds: string[] = []
  for (const name of names) {
    const match = options.find((option) => option.id === name || option.name === name)
    if (!match) {
      return {
        characterIds: [],
        error: `当前会话没有可写入角色「${name}」。可选：${options.map((option) => option.name).join('、') || '（无）'}`
      }
    }
    characterIds.push(match.id)
  }
  return { characterIds: Array.from(new Set(characterIds)) }
}

/** 总结对话（写操作·经确认门）：对当前活动会话按角色可见投影写入轨迹（=总结对话按钮核心）。 */
export function createSummarizeChatTool(ctx: XingyiFunctionToolContext): ToolDefinition {
  return {
    name: 'summarizeChat',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '把当前打开的会话按角色可见投影总结并写入角色轨迹（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        characterNames: {
          type: 'array',
          items: { type: 'string' },
          description: '要写入轨迹的角色名（可选；缺省=会话内全部可写入角色）。'
        },
        reason: { type: 'string', description: '为何总结（可选，简短，供审计）。' }
      }
    },
    execute: async (toolCall) => {
      const provider = getXingyiFunctionProvider('chatSummary')
      if (!provider) return providerMissingResult('请等待桌面工作台加载完成（聊天面板未就绪）')
      const context = provider.getContext()
      if (!context) {
        return { content: '现在没有打开中的会话，先打开要总结的会话再让星依做一次。', details: { providerMissing: true } }
      }
      if (!context.characterOptions.length) {
        return { content: `会话「${context.sessionTitle}」没有可写入轨迹的角色，无法总结。`, details: { ok: false } }
      }
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite)!
      const resolved = resolveSummaryCharacterIds(context.characterOptions, readNameList(toolCall.args.characterNames))
      if (resolved.error) {
        return {
          content: resolved.error,
          status: 'error',
          error: { type: 'INVALID_ARGUMENT', message: resolved.error, retryable: true }
        }
      }
      const selectedNames = resolved.characterIds
        .map((id) => context.characterOptions.find((option) => option.id === id)?.name || id)
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '总结对话',
        lines: [
          `会话：${context.sessionTitle}`,
          `写入角色（${selectedNames.length} 个）：${selectedNames.join('、')}`,
          '操作：按角色可见投影整理对话并写入角色轨迹，已处理投影会从待写窗口隐藏。'
        ]
      }, '总结对话')
      if (denied) return denied
      try {
        const result = await provider.runSummary(resolved.characterIds)
        return {
          content: result.message,
          ...(result.ok ? {} : {
            status: 'error' as const,
            error: { type: 'TOOL_RUNTIME_ERROR' as const, message: result.message, retryable: false }
          }),
          details: { sessionId: context.sessionId, characterIds: resolved.characterIds, ok: result.ok }
        }
      } catch (error) {
        return runFailureResult('总结对话', error)
      }
    }
  }
}

/** 批次2 功能工具全家桶：harness 一把装配（editUnitCompilePage 已迁 xingyiUnitCrudTools）。 */
export function createXingyiFunctionTools(ctx: XingyiFunctionToolContext): ToolDefinition[] {
  return [
    createGenerateCompilePageTool(ctx),
    createOptimizeUnitRelationsTool(ctx),
    createGenerateCharacterTool(ctx),
    createSummarizeChatTool(ctx)
  ]
}

export type { XingyiChatSummaryProvider, XingyiUnitToolProvider }
