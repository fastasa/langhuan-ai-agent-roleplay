/** 星依批量角色生成：一次确认后，以受控并发运行多条彼此独立的角色生成链路。 */
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import {
  askConfirmWrite,
  requireConfirmWriteChannel,
  type ConfirmWriteChannel
} from './agentRuntime/interactionContract'
import { runWithConcurrencyPool } from '../utils/concurrencyPool'

export const XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT = 4
export const XINGYI_CHARACTER_GENERATION_BATCH_LIMIT = 12

export interface XingyiBatchCharacterOutcome {
  ok: boolean
  name: string
  characterId?: string
  message: string
  /** 角色本体已创建，但后续灵魂/轨迹写入失败。 */
  partiallyCreated?: boolean
}

export interface XingyiBatchCharacterProvider {
  listGroups: () => Array<{ id: string; name: string }>
  generateCharacter: (input: { brief: string; groupId: string; signal?: AbortSignal }) => Promise<XingyiBatchCharacterOutcome>
}

export interface XingyiBatchCharacterToolContext {
  provider: XingyiBatchCharacterProvider
  confirmWrite?: ConfirmWriteChannel
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function readBriefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') return String((item as { brief?: unknown }).brief || '').trim()
    return ''
  }).filter(Boolean)
}

function resolveGroup(groups: Array<{ id: string; name: string }>, raw: unknown): { id: string; name: string } | { error: string } {
  const value = String(raw || 'default').trim() || 'default'
  const byId = groups.find((group) => group.id === value)
  if (byId) return byId
  const exact = groups.filter((group) => group.name === value)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return { error: `「${value}」有多个同名分组，请改用 groupId：${exact.map((group) => group.id).join('、')}` }
  return { error: `没有找到角色分组「${value}」。可选：${groups.map((group) => `${group.name}(${group.id})`).join('、') || '（无）'}` }
}

function readConcurrency(raw: unknown): number {
  const value = Math.floor(Number(raw || XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT))
  if (!Number.isFinite(value)) return XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT
  return Math.max(1, Math.min(XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT, value))
}

export function createGenerateCharactersBatchTool(ctx: XingyiBatchCharacterToolContext): ToolDefinition {
  return {
    name: 'generateCharactersBatch',
    longRunning: true,
    brief: `并行生成多个正式角色，并把成功角色统一放进指定分组。用户用一句话要求多个角色时，把要求展开成对应数量的完整角色简述，在一次调用中提交 2~${XINGYI_CHARACTER_GENERATION_BATCH_LIMIT} 条；`
      + `工具会在最多 ${XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT} 条并行链路下执行，单项失败不拖垮整批（写操作，只弹一次整批确认）。`
      + '用户一次要求多个角色时优先用本工具，不要逐个调用 generateCharacter。',
    schema: {
      type: 'object',
      properties: {
        characters: {
          type: 'array',
          minItems: 2,
          maxItems: XINGYI_CHARACTER_GENERATION_BATCH_LIMIT,
          items: {
            type: 'object',
            properties: { brief: { type: 'string', description: '这个角色独立、完整的简要描述。' } },
            required: ['brief']
          },
          description: '要生成的角色任务书列表；每项只描述一个角色，彼此不要依赖生成结果。'
        },
        group: { type: 'string', description: '成功角色的目标分组名或 groupId；缺省为 default。' },
        concurrency: { type: 'integer', minimum: 1, maximum: XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT, description: `并行上限，可选；缺省和最高都是 ${XINGYI_CHARACTER_GENERATION_CONCURRENCY_LIMIT}。` }
      },
      required: ['characters']
    },
    validateArgs: (args) => {
      const briefs = readBriefs(args.characters)
      if (briefs.length < 2) return 'generateCharactersBatch 至少需要 2 条非空角色简述'
      if (briefs.length > XINGYI_CHARACTER_GENERATION_BATCH_LIMIT) return `单批最多生成 ${XINGYI_CHARACTER_GENERATION_BATCH_LIMIT} 个角色`
      return null
    },
    execute: async (call, executionContext) => {
      const briefs = readBriefs(call.args.characters)
      if (briefs.length < 2) return invalid('批量生成至少需要 2 条非空角色简述')
      if (briefs.length > XINGYI_CHARACTER_GENERATION_BATCH_LIMIT) return invalid(`单批最多生成 ${XINGYI_CHARACTER_GENERATION_BATCH_LIMIT} 个角色`)
      const group = resolveGroup(ctx.provider.listGroups(), call.args.group)
      if ('error' in group) return invalid(group.error)
      const concurrency = readConcurrency(call.args.concurrency)
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, '批量生成角色')!
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: '批量生成角色',
        lines: [
          `角色数量：${briefs.length} 个`,
          `目标分组：${group.name}（${group.id}）`,
          `并行上限：${concurrency} 条链路`,
          ...briefs.map((brief, index) => `${index + 1}. ${brief.length > 80 ? `${brief.slice(0, 80)}…` : brief}`)
        ]
      }, '批量生成角色')
      if (denied) return denied

      const results = await runWithConcurrencyPool(briefs, async (brief) => {
        return await ctx.provider.generateCharacter({ brief, groupId: group.id, signal: executionContext.signal })
      }, {
        limit: concurrency,
        retries: 0,
        signal: executionContext.signal
      })

      const outcomes: XingyiBatchCharacterOutcome[] = results.map((result, index) => {
        if (result.status === 'fulfilled' && result.value) return result.value
        const message = result.error instanceof Error ? result.error.message : String(result.error || '未知错误')
        return { ok: false, name: `第 ${index + 1} 个角色`, message }
      })
      const succeeded = outcomes.filter((item) => item.ok)
      const partial = outcomes.filter((item) => item.partiallyCreated)
      const failed = outcomes.filter((item) => !item.ok && !item.partiallyCreated)
      const lines = outcomes.map((item, index) => `${index + 1}. ${item.ok ? '成功' : item.partiallyCreated ? '部分成功' : '失败'}：${item.name}${item.characterId ? `（${item.characterId}）` : ''} - ${item.message}`)
      return {
        content: `批量角色生成完成：成功 ${succeeded.length} 个，部分成功 ${partial.length} 个，失败 ${failed.length} 个；目标分组「${group.name}」。\n${lines.join('\n')}`,
        ...(succeeded.length || partial.length ? {} : {
          status: 'error' as const,
          error: { type: 'TOOL_RUNTIME_ERROR' as const, message: '本批角色全部生成失败', retryable: false }
        }),
        details: {
          groupId: group.id,
          concurrency,
          requested: briefs.length,
          succeeded: succeeded.length,
          partiallyCreated: partial.length,
          failed: failed.length,
          characterIds: outcomes.flatMap((item) => item.characterId ? [item.characterId] : [])
        }
      }
    }
  }
}

export function createXingyiBatchCharacterTools(ctx: XingyiBatchCharacterToolContext): ToolDefinition[] {
  return [createGenerateCharactersBatchTool(ctx)]
}
