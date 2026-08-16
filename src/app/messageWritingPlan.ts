import {
  parseReplyPlanExpressionMix,
  parseReplyPlanWordCountAdvice,
  type ReplyPlanExpressionMix,
  type ReplyPlanWordCountAdvice
} from './personalityPlanOrchestrator'
import { buildTidiaoCharacterPlanningPriority } from './agentKnowledge/tidiaoKnowledge'

export type MessageWritingPlan = {
  content: string
  expressionMix: ReplyPlanExpressionMix
  wordCountAdvice: ReplyPlanWordCountAdvice
}

export type MessageWritingPlanPromptMessage = {
  role: 'system' | 'user'
  content: string
}

function requiredText(value: unknown, label: string): string {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label}不能为空`)
  return text
}

/**
 * 快速回复与动作输入共用的提调写作规划协议。
 * 提调只确定写什么、五类表达占比和建议字数，不负责最终措辞与正文成文。
 */
export function buildTidiaoMessageWritingPlanMessages(input: {
  mode: 'fast_reply' | 'focused_action'
  currentInput: string
  contextBlock: string
  taskInstruction: string
  focus?: string
  speakerName?: string
}): MessageWritingPlanPromptMessage[] {
  const currentInput = requiredText(input.currentInput, '当前输入')
  const contextBlock = String(input.contextBlock || '').trim() || '暂无更多已确认事实。'
  const taskInstruction = requiredText(input.taskInstruction, '当前任务')
  const modeLabel = input.mode === 'fast_reply' ? '快速回复' : '动作输入'
  const targetLine = input.mode === 'fast_reply'
    ? `规划${String(input.speakerName || '当前角色').trim() || '当前角色'}这一条角色消息。`
    : '规划这条动作输入对应的旁白或事实回答。'
  const characterPlanningPriority = buildTidiaoCharacterPlanningPriority()
  return [
    {
      role: 'system',
      content: [
        characterPlanningPriority,
        `你是提调的「${modeLabel}写作规划」环节。`,
        targetLine,
        '你只负责三件事：确定这条消息应该写什么、给出动作/语言/神态/心理/旁白五类表达占比、给出建议字数。',
        '你不写用户最终看到的正文，不替正式消息模型润色，不输出完整台词、成品段落或消息投影。',
        '计划必须是第三视角的表现指令，覆盖本条消息需要呈现的内容与边界；不要把计划写成可直接发送的文学正文。',
        '五项表达占比必须是 0–100 的整数且合计 100。建议字数 min/max 必须是 500–2000 的整数且 min 不大于 max。',
        '只输出一个 JSON 对象，不要 Markdown 代码块、标题、解释或额外文字：',
        '{"content":"第三视角写作计划","expressionMix":{"action":30,"dialogue":20,"expression":10,"innerState":10,"narration":30},"wordCountAdvice":{"min":500,"max":800}}'
      ].filter(Boolean).join('\n\n')
    },
    {
      role: 'user',
      content: [
        `【当前任务】\n${taskInstruction}`,
        String(input.focus || '').trim() ? `【重点】\n${String(input.focus || '').trim()}` : '',
        `【可用正式上下文】\n${contextBlock}`,
        `【当前输入】\n${currentInput}`
      ].filter(Boolean).join('\n\n')
    }
  ]
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  if (!text) throw new Error('提调写作计划为空')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('提调写作计划格式无效：必须只输出 JSON 对象')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('提调写作计划格式无效：顶层必须是对象')
  }
  return parsed as Record<string, unknown>
}

export function parseMessageWritingPlanOutput(value: unknown): MessageWritingPlan {
  const record = parseJsonObject(value)
  const content = String(record.content || '').replace(/\s+/g, ' ').trim()
  if (!content) throw new Error('提调写作计划缺少消息内容计划')
  if (content.length > 1000) throw new Error('提调写作计划内容过长')
  const expressionMix = parseReplyPlanExpressionMix(record.expressionMix ?? record.expression_mix)
  if (!expressionMix) throw new Error('提调写作计划的表达占比无效')
  const wordCountAdvice = parseReplyPlanWordCountAdvice(record.wordCountAdvice ?? record.word_count_advice)
  if (!wordCountAdvice) throw new Error('提调写作计划的建议字数无效')
  return { content, expressionMix, wordCountAdvice }
}

export function formatMessageWritingPlanMix(mix: ReplyPlanExpressionMix): string {
  return [
    `动作 ${mix.action}%`,
    `语言 ${mix.dialogue}%`,
    `神态 ${mix.expression}%`,
    `心理 ${mix.innerState}%`,
    `旁白 ${mix.narration}%`
  ].join('，')
}

export function formatMessageWritingPlanWordCount(advice: ReplyPlanWordCountAdvice): string {
  return advice.min === advice.max
    ? `${advice.min} 字左右`
    : `${advice.min}–${advice.max} 字`
}
