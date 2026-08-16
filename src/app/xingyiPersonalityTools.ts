/**
 * 星依「角色人格」工具族（批次4 第二梯队·2026-07-04 陈星依总agent计划 §5.2 批次4）——自包含工厂范式（R1 工厂闭包）。
 *
 * 两件套（createXingyiPersonalityTools 一把装配，harness 在 personality 接缝在场时挂入星依池）：
 * - calibratePersonality（写·confirmWrite 硬门）：据训练弹窗已确认样本对照校准角色性格正文——
 *   样本派生走 buildCalibrationSamplesFromDataset（与训练弹窗 calibrationSamples 一处真值），
 *   内核即时解析（runPersonalityKernelParser·失败不阻断）+ runPersonalityCalibration 与弹窗
 *   PtwCalibrationPanel.run 同一套核心；写回只动 Character.personality 一个字段。
 * - generateTrainingQuestionnaire（写·confirmWrite 硬门）：新建训练数据集草稿并自动出题——
 *   与训练弹窗 createDatasetAndGenerate/runGeneration 同一套核心（createDatasetDraft →
 *   runPersonalityQuestionnaireGeneration → saveDatasetQuestionnaire/saveDatasetAnswers），
 *   失败诊断走 buildQuestionnaireFailurePromptSnapshot（与弹窗一处真值）。
 *
 * 与批次2 bridge 工具（xingyiFunctionTools）的关键区别：这两个功能的写路径是全局 store / 服务端
 * HTTP 真值（characterStore.updateCharacter / personalityTrainingApi），不碰组件内存态整包快照队列，
 * 页面不在场也能安全执行——所以自包含直挂，不要求训练弹窗打开（bridge 只为快照真值冲突而存在）。
 *
 * 写确认门（硬门）语义与 xingyiFunctionTools 一致，模板单一实现=interactionContract 统一 helper（2026-07-12 批C 收敛）：
 * confirmWrite 缺失一律拒绝执行；用户取消返回「已取消」的成功态结果（模型不重试）。
 */

import type { AgentModelConfig } from '../types'
import type { ToolDefinition, ToolExecutionResult } from './agentRuntime/toolRegistry'
import { askConfirmWrite, requireConfirmWriteChannel } from './agentRuntime/interactionContract'
import { runPersonalityCalibration } from './personalityCalibration'
import { runPersonalityKernelParser } from './personalityKernelParser'
import {
  buildCalibrationSamplesFromDataset,
  buildQuestionnaireCheckpointPromptSnapshot,
  buildQuestionnaireFailurePromptSnapshot,
  buildQuestionnaireResumeDraft,
  buildQuestionnaireSuccessPromptSnapshot,
  personalityTrainingApi,
  readQuestionnaireGenerationCheckpoint,
  runPersonalityQuestionnaireGeneration,
  type PersonalityTrainingDataset
} from './personalityTrainingWorkflow'
import type { XingyiWriteConfirm } from './xingyiFunctionTools'
import { logger } from '../utils/logger'

/** 模型调用接缝（浮坞注 useAI().callAI）：签名兼容校准/内核解析/出题三处核心的 callAI 形参。 */
export type XingyiPersonalityCallAI = (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: Record<string, unknown>
) => Promise<string | null>

export interface XingyiPersonalityCharacterEntry {
  id: string
  name: string
}

export interface XingyiPersonalityToolContext {
  /** 写确认门（同 xingyiFunctionTools 硬门语义：缺省一律拒绝执行）。 */
  confirmWrite?: XingyiWriteConfirm
  /** 模型调用（内核解析/校准对照/出题都用它；浮坞注 useAI().callAI）。 */
  callAI: XingyiPersonalityCallAI
  /** brain_agent 配置（与训练弹窗同口径：settingStore.getBrainAgentConfig）。 */
  loadAgentConfig: () => Partial<AgentModelConfig> | null
  /** 角色清单（名称→id 解析数据源；浮坞注 characterStore.characters）。 */
  listCharacters: () => XingyiPersonalityCharacterEntry[]
  /** 读角色（性格正文来源；浮坞注 characterStore.getCharacter）。 */
  readCharacter: (characterId: string) => Record<string, unknown> | null
  /** 性格正文写回（只动 personality 字段；浮坞注 characterStore.updateCharacter）。 */
  updateCharacterPersonality: (characterId: string, personality: string) => Promise<void>
  /** 可选：长任务过程活动播报（浮坞 activity 行）。 */
  notifyActivity?: (text: string) => void
}

const REVISED_PREVIEW_LIMIT = 160

function clipText(text: string, limit: number): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

function runFailureResult(action: string, error: unknown): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    content: `「${action}」执行失败：${message}`,
    status: 'error',
    error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
  }
}

function invalidArgumentResult(message: string): ToolExecutionResult {
  return {
    content: message,
    status: 'error',
    error: { type: 'INVALID_ARGUMENT', message, retryable: true }
  }
}

/** 角色名 → 角色解析：先精确 id，再精确名字，最后唯一子串；歧义/未命中给可读候选。
 *  （与 xingyiTidiaoDispatchTools.resolveXingyiChatContact 同一套解析心智，作用对象不同故各自实现。） */
export function resolveXingyiPersonalityCharacter(
  characters: XingyiPersonalityCharacterEntry[],
  rawName: string
): { character?: XingyiPersonalityCharacterEntry; error?: string } {
  const name = String(rawName || '').trim()
  if (!name) return { error: '缺少角色名字。' }
  const byId = characters.find((item) => item.id === name)
  if (byId) return { character: byId }
  const exact = characters.filter((item) => item.name === name)
  if (exact.length === 1) return { character: exact[0] }
  if (exact.length > 1) {
    return { error: `「${name}」有 ${exact.length} 个同名角色，请改用角色 id 指定：${exact.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  const partial = characters.filter((item) => item.name.includes(name))
  if (partial.length === 1) return { character: partial[0] }
  if (partial.length > 1) {
    return { error: `「${name}」匹配到多个角色，请用完整名字或角色 id：${partial.slice(0, 8).map((item) => `${item.name}(${item.id})`).join('、')}` }
  }
  return { error: `没有找到名为「${name}」的角色。` }
}

function readCharacterPersonalityText(character: Record<string, unknown> | null): string {
  return String(character?.personality ?? character?.personality_text ?? '').trim()
}

function datasetUpdatedAtMs(dataset: PersonalityTrainingDataset): number {
  const parsed = Date.parse(String(dataset.updatedAt || dataset.createdAt || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/** 挑校准依据数据集：按更新时间新→旧，取第一个能派生出已确认样本的数据集。 */
export function pickCalibrationDataset(datasets: PersonalityTrainingDataset[]): {
  dataset: PersonalityTrainingDataset
  samples: ReturnType<typeof buildCalibrationSamplesFromDataset>
} | null {
  const sorted = [...(datasets || [])].sort((a, b) => datasetUpdatedAtMs(b) - datasetUpdatedAtMs(a))
  for (const dataset of sorted) {
    const samples = buildCalibrationSamplesFromDataset({
      dimensionPlan: dataset.dimensionPlan || [],
      questionGroups: dataset.questionGroups || [],
      answers: dataset.answers || {}
    })
    if (samples.length) return { dataset, samples }
  }
  return null
}

/** 性格校准（写操作·经确认门）：读已确认样本→即时内核→对照校准→确认后写回性格正文。 */
export function createCalibratePersonalityTool(ctx: XingyiPersonalityToolContext): ToolDefinition {
  return {
    name: 'calibratePersonality',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，且多次模型调用耗时不可预测，免受默认单工具超时限制。
    longRunning: true,
    brief: '据人格训练弹窗里已确认的样本，对照校准指定角色的性格正文并写回（写操作，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        characterName: { type: 'string', description: '要校准的角色名或角色 id（必填）。' },
        reason: { type: 'string', description: '为何校准（可选，简短，供审计）。' }
      },
      required: ['characterName']
    },
    validateArgs: (args) => String(args.characterName || '').trim() ? null : 'calibratePersonality 缺少 characterName',
    execute: async (toolCall) => {
      const action = '校准角色性格'
      const resolved = resolveXingyiPersonalityCharacter(ctx.listCharacters(), String(toolCall.args.characterName || ''))
      if (resolved.error || !resolved.character) return invalidArgumentResult(resolved.error || '角色解析失败。')
      // 硬门（统一 helper）：缺通道 helper 必返回拒绝结果，断言非空
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, action)!
      const target = resolved.character
      try {
        ctx.notifyActivity?.(`正在读取「${target.name}」的已确认训练样本…`)
        const datasets = await personalityTrainingApi.listDatasets(target.id)
        const picked = pickCalibrationDataset(datasets)
        if (!picked) {
          return {
            content: `角色「${target.name}」还没有已确认的训练样本，没法校准。请先在人格训练弹窗「选择」步逐组确认样本，再让星依做一次。`,
            details: { noSamples: true }
          }
        }
        const personalityText = readCharacterPersonalityText(ctx.readCharacter(target.id))
        const agentConfig = ctx.loadAgentConfig()

        // 即时解析 8 维内核（与弹窗 PtwCalibrationPanel 同口径：不依赖持久化内核，解析失败不阻断）
        let kernel = null
        if (personalityText) {
          ctx.notifyActivity?.('正在解析角色性格内核…')
          const kernelResult = await runPersonalityKernelParser({
            characterId: target.id,
            characterName: target.name,
            personalityText,
            agentConfig,
            callAI: ctx.callAI
          })
          kernel = kernelResult.status === 'parsed' ? kernelResult.kernel : null
        }

        ctx.notifyActivity?.('正在对照已确认样本与性格正文…')
        const result = await runPersonalityCalibration({
          characterName: target.name,
          personalityText,
          samples: picked.samples,
          kernel,
          agentConfig,
          callAI: ctx.callAI
        })
        if (result.status !== 'ok') {
          return runFailureResult(action, new Error(result.reason || '模型未给出有效的对照建议。'))
        }
        const revised = result.revisedPersonality.trim()
        if (!revised || revised === personalityText) {
          return {
            content: `对照完成：${picked.samples.length} 条样本与「${target.name}」当前性格正文一致（调整 ${result.summary.adjust} · 新增 ${result.summary.new} · 保留 ${result.summary.keep}），无需修改。`,
            details: { unchanged: true, summary: result.summary }
          }
        }

        const denied = await askConfirmWrite(ctx.confirmWrite, {
          title: action,
          lines: [
            `角色：${target.name}`,
            `依据：${picked.samples.length} 条已确认样本（数据集「${picked.dataset.title || picked.dataset.datasetId}」）`,
            `建议：调整 ${result.summary.adjust} · 新增 ${result.summary.new} · 保留 ${result.summary.keep}`,
            `修改后性格正文：${clipText(revised, REVISED_PREVIEW_LIMIT)}`,
            '操作：覆盖该角色的性格正文（原文会被替换，之后仍可在角色编辑里手动修改）。'
          ]
        }, action)
        if (denied) return denied

        await ctx.updateCharacterPersonality(target.id, revised)
        const highlights = result.traits
          .filter((trait) => trait.status !== 'keep')
          .slice(0, 5)
          .map((trait) => `${trait.dim}：${clipText(trait.after, 60)}`)
        return {
          content: [
            `已据 ${picked.samples.length} 条样本校准「${target.name}」的性格正文（调整 ${result.summary.adjust} · 新增 ${result.summary.new} · 保留 ${result.summary.keep}）。`,
            ...(highlights.length ? [`主要变化：${highlights.join('；')}`] : [])
          ].join('\n'),
          details: { characterId: target.id, summary: result.summary, ok: true }
        }
      } catch (error) {
        return runFailureResult(action, error)
      }
    }
  }
}

/** 训练出题（写操作·经确认门）：优先续跑中断检查点，没有才新建草稿（多次模型调用，可能数分钟）。 */
export function createGenerateTrainingQuestionnaireTool(ctx: XingyiPersonalityToolContext): ToolDefinition {
  return {
    name: 'generateTrainingQuestionnaire',
    // 内部 await ctx.confirmWrite(...) 真阻塞等用户点确认卡片，且需多次模型调用可能持续几分钟，免受默认单工具超时限制。
    longRunning: true,
    brief: '为指定角色生成或续跑人格训练题（新问卷先生成 20 道训练题；每 10 题落库，会先弹确认）。',
    schema: {
      type: 'object',
      properties: {
        characterName: { type: 'string', description: '要出题的角色名或角色 id（必填）。' },
        reason: { type: 'string', description: '为何出题（可选，简短，供审计）。' }
      },
      required: ['characterName']
    },
    validateArgs: (args) => String(args.characterName || '').trim() ? null : 'generateTrainingQuestionnaire 缺少 characterName',
    execute: async (toolCall) => {
      const action = '生成人格训练题'
      const resolved = resolveXingyiPersonalityCharacter(ctx.listCharacters(), String(toolCall.args.characterName || ''))
      if (resolved.error || !resolved.character) return invalidArgumentResult(resolved.error || '角色解析失败。')
      if (!ctx.confirmWrite) return requireConfirmWriteChannel(ctx.confirmWrite, action)!
      const target = resolved.character
      const denied = await askConfirmWrite(ctx.confirmWrite, {
        title: action,
        lines: [
          `角色：${target.name}`,
          '操作：优先续跑未完成的人格问卷；没有检查点时新建数据集（先生成 20 道训练题，冻结评测题等人格稳定后单独生成）。',
          '注意：每 10 题落库一次，可能持续几分钟；每题带可修改的预设回答，仍需到人格训练弹窗逐组确认。'
        ]
      }, action)
      if (denied) return denied

      let dataset: PersonalityTrainingDataset
      try {
        ctx.notifyActivity?.(`正在检查「${target.name}」是否有可续跑的出题检查点…`)
        const existing = await personalityTrainingApi.listDatasets(target.id)
        const resumable = (existing || []).find((item) => readQuestionnaireGenerationCheckpoint(item.promptSnapshot))
        if (resumable) {
          dataset = resumable
          ctx.notifyActivity?.(`已找到检查点：从第 ${(dataset.questionGroups?.length || 0) + 1} 道训练题继续。`)
        } else {
          ctx.notifyActivity?.(`正在为「${target.name}」创建训练数据集草稿…`)
          dataset = await personalityTrainingApi.createDatasetDraft(target.id, {})
        }
      } catch (error) {
        return runFailureResult(action, error)
      }
      try {
        const draft = await runPersonalityQuestionnaireGeneration({
          finalPrompt: String((dataset.promptSnapshot as Record<string, unknown> | undefined)?.finalPrompt || ''),
          promptSnapshot: (dataset.promptSnapshot || {}) as Record<string, unknown>,
          characterName: target.name,
          agentConfig: ctx.loadAgentConfig(),
          callAI: ctx.callAI,
          resumeDraft: buildQuestionnaireResumeDraft(dataset),
          onProgress: (progress) => ctx.notifyActivity?.(`出题中：${progress.label}`),
          onCheckpoint: async (checkpointDraft, checkpoint) => {
            dataset = await personalityTrainingApi.saveDatasetQuestionnaire(target.id, dataset.datasetId, {
              dimensionPlan: checkpointDraft.dimensionPlan,
              questionGroups: checkpointDraft.questionGroups,
              promptSnapshot: buildQuestionnaireCheckpointPromptSnapshot(dataset, checkpoint),
              sourceSummary: dataset.sourceSummary
            })
          }
        })
        const updated = await personalityTrainingApi.saveDatasetQuestionnaire(target.id, dataset.datasetId, {
          dimensionPlan: draft.dimensionPlan,
          questionGroups: draft.questionGroups,
          evaluationQuestions: draft.evaluationQuestions,
          promptSnapshot: buildQuestionnaireSuccessPromptSnapshot(dataset, draft),
          sourceSummary: dataset.sourceSummary
        })
        return {
          content: `已为「${target.name}」生成 ${draft.questionGroups.length} 道训练题和 ${draft.evaluationQuestions.length} 道冻结评测题（数据集「${updated.title || dataset.datasetId}」）。每题已有可修改的预设回答，请到人格训练弹窗逐组确认。`,
          details: { characterId: target.id, datasetId: dataset.datasetId, ok: true }
        }
      } catch (error) {
        // 失败诊断落库（与弹窗 persistGenerationFailure 同口径），落库失败只记日志不盖住原错误
        try {
          await personalityTrainingApi.saveDatasetQuestionnaire(target.id, dataset.datasetId, {
            dimensionPlan: dataset.dimensionPlan || [],
            questionGroups: dataset.questionGroups || [],
            promptSnapshot: buildQuestionnaireFailurePromptSnapshot(dataset, error),
            sourceSummary: dataset.sourceSummary
          })
        } catch (persistError) {
          logger.warn('星依出题失败诊断落库失败:', persistError)
        }
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: `「${action}」执行失败：${message}\n已落库批次和续跑检查点仍保留，可到人格训练弹窗继续出题。`,
          status: 'error',
          error: { type: 'TOOL_RUNTIME_ERROR', message, retryable: false }
        }
      }
    }
  }
}

/** 批次4 角色人格工具全家桶：harness 在 personality 接缝在场时一把装配。 */
export function createXingyiPersonalityTools(ctx: XingyiPersonalityToolContext): ToolDefinition[] {
  return [
    createCalibratePersonalityTool(ctx),
    createGenerateTrainingQuestionnaireTool(ctx)
  ]
}
