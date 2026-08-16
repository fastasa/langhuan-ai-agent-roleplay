import type { FocusedActionVisibility } from '../../shared/focusedAction'
import { buildCompactEmbeddedMessageProjectionInstruction } from './messageProjectionAgent'
import {
  formatMessageWritingPlanMix,
  formatMessageWritingPlanWordCount,
  type MessageWritingPlan
} from './messageWritingPlan'

export type FocusedActionResponseKind = 'narration' | 'answer'

export type FocusedActionJudgeDecision = {
  visibility: FocusedActionVisibility
  responseKind: FocusedActionResponseKind
  instruction: string
  focus: string
}

export type FocusedActionPromptMessage = { role: 'system' | 'user'; content: string }

function requiredAction(value: unknown): string {
  const action = String(value || '').trim()
  if (!action) throw new Error('动作输入不能为空')
  return action
}

function cleanDecisionField(value: unknown, label: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error(`书童动作判断缺少${label}`)
  if (text.length > 240) throw new Error(`书童动作判断${label}过长`)
  return text
}

/** 书童只做快速路由，不生成正文、不接触轮后编排资料。 */
export function buildFocusedActionJudgeMessages(actionText: string, contextBlock = ''): FocusedActionPromptMessage[] {
  const action = requiredAction(actionText)
  const context = String(contextBlock || '').trim()
  return [
    {
      role: 'system',
      content: [
        '你是动作输入书童，只做一次快速判断，不写正文。',
        '判断用户此刻想立刻看到的结果，并把任务交给提调规划；最终正文由正式消息模型生成。',
        '看不见、听不到的观察、窥探、内心意图、暗中检查或明确保密内容判为 private；现场角色能直接感知的外显动作判为 public；拿不准判 private。',
        '需要描写动作、观察结果或现场细节时选 narration；用户只需要一个简短事实回答时选 answer。',
        '只输出一行，严格按：private | narration | 立即任务 | 描写重点',
        '前两项只能使用 private/public 与 narration/answer；后两项用简短中文，不添加标题、解释或正文。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        context ? `【可用现场事实】\n${context}` : '',
        `【当前动作】\n${action}`
      ].filter(Boolean).join('\n\n')
    }
  ]
}

export function parseFocusedActionJudgeOutput(value: unknown): FocusedActionJudgeDecision {
  const text = String(value || '').replace(/^```[^\n]*\n?|```$/g, '').trim()
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length !== 1) throw new Error('书童动作判断格式无效：必须只输出一行')
  const fields = lines[0].split('|').map((field) => field.trim())
  if (fields.length !== 4) throw new Error('书童动作判断格式无效：必须包含四项')
  const visibility = fields[0].toLowerCase()
  if (visibility !== 'private' && visibility !== 'public') throw new Error('书童动作判断可见性无效')
  const responseKind = fields[1].toLowerCase()
  if (responseKind !== 'narration' && responseKind !== 'answer') throw new Error('书童动作判断回复形式无效')
  return {
    visibility,
    responseKind,
    instruction: cleanDecisionField(fields[2], '立即任务'),
    focus: cleanDecisionField(fields[3], '描写重点')
  }
}

/** 正式消息模型消费提示词库与提调计划生成动作输入正文；提调本身不在这里成文。 */
export function buildFocusedActionFinalMessages(input: {
  actionText: string
  contextBlock?: string
  decision: FocusedActionJudgeDecision
  writingPlan: MessageWritingPlan
  promptLibrarySystemPrompt?: string
}): FocusedActionPromptMessage[] {
  const action = requiredAction(input.actionText)
  const context = String(input.contextBlock || '').trim()
  const promptLibrarySystemPrompt = String(input.promptLibrarySystemPrompt || '').trim()
  const style = input.decision.responseKind === 'answer'
    ? '直接回答用户当前想确认的事实；答案必须来自可用现场事实。'
    : '写一段直接可见的旁白，把动作或观察结果具体写出来。'
  return [
    {
      role: 'system',
      content: [
        '你是正式消息生成模型。提调已经给出写作计划；你负责结合用户可编辑的提示词库生成最终可见消息。',
        promptLibrarySystemPrompt ? `【提示词库系统提示词】\n${promptLibrarySystemPrompt}` : '',
        style,
        '只使用下方已经发生或现场可确认的事实；无法确认的不猜造，也不替现场角色补出未发生的反应。',
        '只写眼前结果，不规划后续，不解释私密性、内部判断或工作过程。',
        buildCompactEmbeddedMessageProjectionInstruction('这条动作结果')
      ].filter(Boolean).join('\n\n')
    },
    {
      role: 'user',
      content: [
        context ? `【可用正式上下文】\n${context}` : '',
        `【回复计划】\n${input.writingPlan.content}`,
        `【表达占比】\n${formatMessageWritingPlanMix(input.writingPlan.expressionMix)}`,
        '回复计划是第三视角的表现指令；请按计划和表达占比生成这条消息，不要复述计划、比例或内部字段。',
        `【建议字数】\n${formatMessageWritingPlanWordCount(input.writingPlan.wordCountAdvice)}；这是篇幅建议，不是硬截断。`,
        `【任务边界】\n${input.decision.instruction}；${input.decision.focus}`,
        `【当前动作】\n${action}`
      ].filter(Boolean).join('\n\n')
    }
  ]
}
