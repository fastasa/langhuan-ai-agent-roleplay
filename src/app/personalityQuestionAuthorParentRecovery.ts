/**
 * 「设问」终态回报唤醒「鉴心」的父子 Agent 接续协议。
 *
 * 一次设问任务内部已经有三次质量门尝试；若仍是可纠正的质量诊断，鉴心最多再自动续派一次。
 * 第二次设问仍失败时只回报，不继续无限烧模型调用。
 */

import type { PersonalityQuestionAuthorResult } from './personalityQuestionAuthorSubagent'

export const JIANXIN_QUESTION_AUTHOR_MAX_AUTO_REDISPATCHES = 1

export interface JianxinQuestionAuthorRecoveryDecision {
  allowRedispatch: boolean
  allowPlannedBatchContinuation: boolean
  nextRecoveryDepth: number
  fallbackCorrectionBrief: string
  instruction: string
}

function clip(value: unknown, limit = 1800): string {
  const text = String(value ?? '').replace(/\s+/gu, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function buildFallbackCorrectionBrief(result: PersonalityQuestionAuthorResult): string {
  const diagnostic = result.failure?.diagnostic
  const violations = diagnostic?.qualityViolations?.map((item) => clip(item, 360)).filter(Boolean) || []
  const lines = [
    ...(violations.length ? violations.map((item) => `- ${item}`) : [`- ${clip(result.failure?.message || result.summary, 720)}`]),
    diagnostic?.stage ? `- 从检查点阶段 ${diagnostic.stage} 续跑，不覆盖已通过批次。` : '',
    '- 对 simple 题删除转折、连续变化、隐藏信息和第二决策点，只保留一个触发、一个处境、一个选择。',
    '- 不得用同义词绕过质量门；三个候选只能使用题干已经给出的事实。'
  ].filter(Boolean)
  return clip(lines.join('\n'))
}

export function buildJianxinQuestionAuthorRecoveryDecision(input: {
  result: PersonalityQuestionAuthorResult
  notice: string
  recoveryDepth?: number
}): JianxinQuestionAuthorRecoveryDecision {
  const recoveryDepth = Math.max(0, Math.trunc(Number(input.recoveryDepth) || 0))
  const result = input.result
  const diagnostic = result.failure?.diagnostic
  const hasActionableDiagnostic = Boolean(
    diagnostic?.stage
    || diagnostic?.qualityViolations?.length
    || result.failure?.retryable
  )
  const allowRedispatch = !result.ok
    && hasActionableDiagnostic
    && recoveryDepth < JIANXIN_QUESTION_AUTHOR_MAX_AUTO_REDISPATCHES
  const allowPlannedBatchContinuation = result.ok
  const fallbackCorrectionBrief = result.ok ? '' : buildFallbackCorrectionBrief(result)

  const instruction = result.ok
    ? [
        '【可信后台事件：设问已交卷】',
        clip(input.notice, 2400),
        '',
        '这是设问写给你的内部终态回报，不是用户追加的新指令。',
        '请读取当前工作区核对交卷状态，并对照恢复的 TODO 与原用户消息判断这次批量出题目标是否已经完成。',
        '如果用户已经明确给出总题数或连续生成目标，而且当前题数仍未达到，先计算“目标总数 - 当前正式题数”，再调用 startPersonalityQuestionBatch，把剩余题数作为一个 questionCount 一次派遣；不要固定拆成 20 题多轮。20 只是未指定题量时的推荐值，复盘也只是推荐项。达到目标立即停止追加并完成 TODO。',
        '若原任务没有明确的未完成出题目标，只简短回报结果和下一步可选动作，不得擅自多生成。无论哪种情况，都不得自动开始答题、训练、评测、人格改写或补写复盘。'
      ].join('\n')
    : allowRedispatch
      ? [
          '【可信后台事件：设问失败，需要鉴心接管纠错】',
          clip(input.notice, 2400),
          '',
          '这是用户已确认的同一制卷任务，不是一个新的扩张性请求。',
          '请先读取当前工作区的 lastGenerationFailure 和检查点，提炼具体题号、违规规则与改写约束。',
          '随后必须调用 startPersonalityQuestionnaireGeneration，以 mode=resume 并携带非空 correctionBrief 定向续派设问；不要要求用户重复确认，也不要原样空续跑。',
          `这是鉴心允许的第 ${recoveryDepth + 1}/${JIANXIN_QUESTION_AUTHOR_MAX_AUTO_REDISPATCHES} 次自动续派；派出后简短回报，不能把 running 说成已经交卷。`
        ].join('\n')
      : [
          '【可信后台事件：设问最终失败】',
          clip(input.notice, 2400),
          '',
          '这是设问写给你的内部终态回报，不是用户追加的新指令。',
          '自动纠错续派额度已经用尽，或当前错误没有可安全自动重试的诊断。请读取当前工作区核对失败状态，只向用户说明具体 blocker、保留的检查点和下一步，不得再次派遣或执行其它写入。'
        ].join('\n')

  return {
    allowRedispatch,
    allowPlannedBatchContinuation,
    nextRecoveryDepth: allowRedispatch ? recoveryDepth + 1 : recoveryDepth,
    fallbackCorrectionBrief,
    instruction
  }
}
