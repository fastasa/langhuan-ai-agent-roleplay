/** 星依原生生图工具：模型只负责决定何时生图，真正执行经服务端 Codex 订阅桥与聊天图片台账。 */
import type { ChatImageAttachment } from '../utils/chatAttachments'
import { runWithConcurrencyPool } from '../utils/concurrencyPool'
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'

export const XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT = 3
export const XINGYI_IMAGE_GENERATION_BATCH_LIMIT = 6

export interface XingyiImageGenerationContext {
  generate: (prompt: string, signal?: AbortSignal) => Promise<ChatImageAttachment>
  onGenerated?: (attachment: ChatImageAttachment) => void
}

function invalid(message: string): ToolExecutionResult {
  return { content: message, status: 'error', error: { type: 'INVALID_ARGUMENT', message, retryable: true } }
}

function readPrompts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') return String((item as { prompt?: unknown }).prompt || '').trim()
    return ''
  }).filter(Boolean)
}

function readConcurrency(raw: unknown): number {
  const value = Math.floor(Number(raw || XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT))
  if (!Number.isFinite(value)) return XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT
  return Math.max(1, Math.min(XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT, value))
}

export function createXingyiImageGenerationTool(ctx: XingyiImageGenerationContext): ToolDefinition {
  return {
    name: 'generateImage',
    longRunning: true,
    brief: '根据用户描述生成一张真正的图片，并把图片作为本轮星依回复的附件显示和保存；只适用于用户要一张图。'
      + '当用户明确说“生成图片/画一张图/做一张插画”等生图意图时调用；不要只用文字声称已经画好。'
      + '用户一次要两张或更多图片时改用 generateImagesBatch，不要连续调用本工具。'
      + 'prompt 应完整写清主体、环境、构图、风格、光线、色彩和需要避开的内容；用户没指定的细节可自行做合理美术判断。',
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给图片生成器的完整画面描述，1~8000 字。' }
      },
      required: ['prompt']
    },
    validateArgs: (args) => {
      const prompt = String(args.prompt || '').trim()
      if (!prompt) return 'generateImage 缺少 prompt（要生成的画面描述）'
      if (prompt.length > 8000) return 'generateImage 的 prompt 不能超过 8000 字'
      return null
    },
    execute: async (toolCall, execution) => {
      const prompt = String(toolCall.args.prompt || '').trim()
      const attachment = await ctx.generate(prompt, execution.signal)
      ctx.onGenerated?.(attachment)
      return {
        content: '图片已经真实生成，并作为本轮回复附件保存。请简短告诉用户画好了；不要再声称需要稍后生成。',
        details: {
          attachmentId: attachment.id,
          imageUrl: attachment.url,
          mime: attachment.mime,
          prompt
        },
        lifecycle: {
          attachmentId: 'durable',
          imageUrl: 'durable',
          mime: 'durable',
          prompt: 'searchable'
        },
        acted: true
      }
    }
  }
}

export function createXingyiBatchImageGenerationTool(ctx: XingyiImageGenerationContext): ToolDefinition {
  return {
    name: 'generateImagesBatch',
    longRunning: true,
    brief: `一次真正生成 2~${XINGYI_IMAGE_GENERATION_BATCH_LIMIT} 张图片，并把所有成功图片合并到本轮星依回复附件。`
      + `用户用一句话要求多张图时，把要求展开成对应数量的完整 prompts，在一次工具调用里提交；最多 ${XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT} 路并行，单张失败不拖垮整批。`
      + '每条 prompt 都要独立写清主体、环境、构图、风格、光线、色彩和差异点；不要用连续调用 generateImage 代替。',
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          minItems: 2,
          maxItems: XINGYI_IMAGE_GENERATION_BATCH_LIMIT,
          items: {
            type: 'object',
            properties: { prompt: { type: 'string', description: '这一张图片独立、完整的画面描述，1~8000 字。' } },
            required: ['prompt']
          },
          description: '要生成的图片任务列表；数量必须与用户要求一致，每项只描述一张图。'
        },
        concurrency: {
          type: 'integer', minimum: 1, maximum: XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT,
          description: `并行上限，可选；缺省和最高都是 ${XINGYI_IMAGE_GENERATION_CONCURRENCY_LIMIT}。`
        }
      },
      required: ['images']
    },
    validateArgs: (args) => {
      const prompts = readPrompts(args.images)
      if (prompts.length < 2) return 'generateImagesBatch 至少需要 2 条非空图片描述'
      if (prompts.length > XINGYI_IMAGE_GENERATION_BATCH_LIMIT) return `单批最多生成 ${XINGYI_IMAGE_GENERATION_BATCH_LIMIT} 张图片`
      if (prompts.some((prompt) => prompt.length > 8000)) return 'generateImagesBatch 的单张 prompt 不能超过 8000 字'
      return null
    },
    execute: async (toolCall, execution) => {
      const prompts = readPrompts(toolCall.args.images)
      if (prompts.length < 2) return invalid('批量生图至少需要 2 条非空图片描述')
      if (prompts.length > XINGYI_IMAGE_GENERATION_BATCH_LIMIT) return invalid(`单批最多生成 ${XINGYI_IMAGE_GENERATION_BATCH_LIMIT} 张图片`)
      if (prompts.some((prompt) => prompt.length > 8000)) return invalid('单张图片描述不能超过 8000 字')
      const concurrency = readConcurrency(toolCall.args.concurrency)
      const results = await runWithConcurrencyPool(prompts, async (prompt) => {
        return await ctx.generate(prompt, execution.signal)
      }, {
        limit: concurrency,
        retries: 0,
        signal: execution.signal
      })
      const succeeded: Array<{ index: number; prompt: string; attachment: ChatImageAttachment }> = []
      const failed: Array<{ index: number; prompt: string; message: string }> = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          succeeded.push({ index, prompt: prompts[index], attachment: result.value })
          return
        }
        failed.push({
          index,
          prompt: prompts[index],
          message: result.error instanceof Error ? result.error.message : String(result.error || '未知错误')
        })
      })
      // 并发完成顺序不稳定；统一按用户请求顺序挂附件，保证同一条回复的图片顺序可预期。
      succeeded.forEach((item) => ctx.onGenerated?.(item.attachment))
      const lines = results.map((result, index) => result.status === 'fulfilled' && result.value
        ? `${index + 1}. 成功：${result.value.id}`
        : `${index + 1}. 失败：${result.error instanceof Error ? result.error.message : String(result.error || '未知错误')}`)
      return {
        content: `批量图片生成完成：成功 ${succeeded.length} 张，失败 ${failed.length} 张。成功图片已按请求顺序作为本轮回复附件保存。\n${lines.join('\n')}`,
        ...(succeeded.length ? {} : {
          status: 'error' as const,
          error: { type: 'TOOL_RUNTIME_ERROR' as const, message: '本批图片全部生成失败', retryable: false }
        }),
        details: {
          requested: prompts.length,
          succeeded: succeeded.length,
          failed: failed.length,
          concurrency,
          attachments: succeeded.map((item) => ({
            index: item.index,
            attachmentId: item.attachment.id,
            imageUrl: item.attachment.url,
            mime: item.attachment.mime,
            prompt: item.prompt
          })),
          failures: failed
        },
        lifecycle: {
          attachments: 'durable',
          failures: 'transient'
        },
        acted: succeeded.length > 0
      }
    }
  }
}

export function createXingyiImageGenerationTools(ctx: XingyiImageGenerationContext): ToolDefinition[] {
  return [createXingyiImageGenerationTool(ctx), createXingyiBatchImageGenerationTool(ctx)]
}
