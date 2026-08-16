/**
 * 星依「询问用户做选择」工具（内核统一批·批C·2026-07-09 用户真机反馈）——自包含工具工厂。
 *
 * 由来：星依遇到真正拿不准、需要用户拍板的岔路（如某个状态栏字段该不该加/删）时，应停下来问用户，
 * 给几个选项、每个选项附上星依的建议，并且总留一个「其他想法」让用户自由输入（选项都不合意时用）。
 * 参考提调 askUser 与 Claude 的 AskUserQuestion：结构化选项 + 自由输入兜底。
 *
 * 接缝：askUser 由浮坞注入（渲染选择卡片、等用户点选/输入，返回答复文本）；缺省不接入时工具如实说不可用
 * （硬门语义同 confirmWrite：不靠纲领口头约束）。工具把用户答复原样回给模型，模型据此继续把事做完（连续工作）。
 *
 * 契约对齐（2026-07-12 批C·C1）：工具内部以统一信封 InteractionRequest（kind=choice）/InteractionAnswer 表达
 * 请求与答复；浮坞通道仍是旧签名（XingyiAskUserRequest→string），适配映射收在本文件，不改 XingyiDock。
 */

import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import type { InteractionAnswer, InteractionOption, InteractionRequest } from './agentRuntime/interactionContract'

/** 一个待选项：label=给用户看的选项、note=星依对这个选项的建议/说明（可选但强烈建议给）。形状=统一契约 InteractionOption。 */
export type XingyiAskUserOption = InteractionOption
export const XINGYI_ASK_USER_TOOL_NAME = 'askUser'

/** 浮坞通道入参（旧签名保持·XingyiDock 消费）：allowOtherInput 在通道层必填，工具层缺省补 true。 */
export interface XingyiAskUserRequest {
  question: string
  options: XingyiAskUserOption[]
  /** 是否允许「其他想法」自由输入（缺省 true·选项都不合意时用户自己写）。 */
  allowOtherInput: boolean
}

/** 询问用户接缝：浮坞弹选择卡片，返回用户的答复文本（选中的选项 label 或自由输入）；用户关掉卡片=返回空串。 */
export type XingyiAskUser = (request: XingyiAskUserRequest) => Promise<string>

/** 统一信封 → 浮坞旧签名适配：choice 卡 title=问题本文；答复串归一为 InteractionAnswer（空串=dismissed）。 */
async function callAskUserChannel(channel: XingyiAskUser, request: InteractionRequest): Promise<InteractionAnswer> {
  const raw = await channel({
    question: request.title,
    options: request.options ?? [],
    allowOtherInput: request.allowOtherInput !== false
  })
  const answer = String(raw || '').trim()
  return answer ? { status: 'answered', answer } : { status: 'dismissed' }
}

export interface XingyiAskUserToolContext {
  askUser?: XingyiAskUser
}

function readOptions(raw: unknown): XingyiAskUserOption[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return { label: item.trim() }
      if (item && typeof item === 'object') {
        const label = String((item as Record<string, unknown>).label ?? '').trim()
        const note = String((item as Record<string, unknown>).note ?? (item as Record<string, unknown>).suggestion ?? '').trim()
        return label ? { label, ...(note ? { note } : {}) } : null
      }
      return null
    })
    .filter((item): item is XingyiAskUserOption => Boolean(item && item.label))
}

/** 询问用户做选择（不是写操作·不过 confirmWrite；但需要 askUser 通道在场）。 */
export function createAskUserTool(ctx: XingyiAskUserToolContext): ToolDefinition {
  return {
    name: XINGYI_ASK_USER_TOOL_NAME,
    // 内部 await ctx.askUser(...) 真阻塞等用户在卡片上点选/输入，耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '遇到真正拿不准、需要用户拍板的岔路时，停下来问用户：给一个问题 + 2~4 个选项（每个选项都附上你的建议 note），'
      + '系统会自动额外提供「其他想法」让用户自由输入。用户答复后你再据此继续把事做完。'
      + '只在确实需要用户决定时用，不要拿来替代你自己该做的判断。'
      + '本工具不受 confirmWrite 的「自动放行」影响；推荐项只是建议，绝不能视为用户已经选择。',
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题（必填，说清在纠结什么、为什么需要 ta 定）。' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '选项文字（给用户看的选择）。' },
              note: { type: 'string', description: '你对这个选项的建议/说明（强烈建议给，帮用户判断）。' }
            },
            required: ['label']
          },
          description: '2~4 个选项，每个都尽量附上 note（你的建议）。不用自己加「其他」选项——系统会自动提供「其他想法」自由输入。'
        },
        allowOtherInput: { type: 'boolean', description: '是否允许「其他想法」自由输入（缺省 true·几乎总是留着）。' }
      },
      required: ['question', 'options']
    },
    validateArgs: (args) => {
      if (!String(args.question || '').trim()) return 'askUser 缺少 question（要问用户的问题）'
      if (readOptions(args.options).length < 2) return 'askUser 需要至少 2 个 options（每个至少有 label）'
      return null
    },
    execute: async (toolCall) => {
      if (!ctx.askUser) {
        return {
          content: '询问用户的通道未接入，星依这轮没法弹选择卡片。请如实告知用户本工具暂不可用。',
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message: '询问用户通道未接入（askUser 缺失）', retryable: false }
        } satisfies ToolExecutionResult
      }
      // 统一信封（choice 卡）：title=问题本文，source 供 UI 展示与审计
      const request: InteractionRequest = {
        kind: 'choice',
        title: String(toolCall.args.question || '').trim(),
        options: readOptions(toolCall.args.options),
        allowOtherInput: toolCall.args.allowOtherInput === false ? false : true,
        source: { agent: 'xingyi', toolName: 'askUser' }
      }
      const reply = await callAskUserChannel(ctx.askUser, request)
      if (reply.status !== 'answered') {
        return {
          content: '用户没有做选择（关掉了卡片）。不要擅自替用户决定——可以换个方式再问，或如实说需要用户确认后才能继续。',
          details: { dismissed: true }
        }
      }
      return {
        content: `用户的答复：${reply.answer}。请据此继续把事情做完。`,
        details: { answer: reply.answer }
      }
    }
  }
}

/** 批C 询问用户工具：harness 一把装配（始终装配·askUser 通道缺省缺失时执行期如实报不可用）。 */
export function createXingyiAskUserTools(ctx: XingyiAskUserToolContext): ToolDefinition[] {
  return [createAskUserTool(ctx)]
}
