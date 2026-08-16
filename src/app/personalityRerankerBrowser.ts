// 人格模型 ReRanker 浏览器本地推理：在用户浏览器里跑 ONNX 序列分类模型，对「情境 + 单条候选计划」打原始分。
// 服务器只负责存储和下发模型，桌面端不承担神经网络推理（移动端改走服务端推理，见 server/application/personality）。
//
// 打分纯逻辑统一在 shared/personalityRerankerCore.ts（浏览器/服务端共用，保证两端逐条等价）。
// 本文件只保留浏览器平台相关部分：transformers.js 环境配置（同源 wasm/模型下发）+ 浏览器侧模型加载缓存 + 调试日志。
//
// 关键约束（改动前先核对）：
// - 模型文件由服务端按角色目录下发在 /personality-models/<safeId>/，含 config.json、onnx/model_quantized.onnx、tokenizer.*。
// - 'q8' 对应 onnx/model_quantized.onnx；wasm 运行时也必须同源下发（/ort-wasm），否则国内移动端建会话即失败。

import { env, AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers'
import { isClientDebugFlagEnabled } from '../utils/debugFlags'
import {
  normalizeModelId,
  buildEmptyScoreResult,
  scoreWithLoadedReranker,
  type LoadedReranker,
  type PersonalityRerankerDiagnostics,
  type PersonalityRerankerScoreResult
} from '../../shared/personalityRerankerCore'

export type { PersonalityRerankerDiagnostics, PersonalityRerankerScoreResult } from '../../shared/personalityRerankerCore'

let envConfigured = false

// transformers.js 的远程地址是全局配置；当前项目没有其它 transformers.js 用途，统一指向本站模型下发目录。
// 关键约束：REPO_ID_REGEX 只接受至多一个斜杠的 modelId，固定前缀 `personality-models/` 放进 remotePathTemplate，
// modelId 只保留相对前缀部分（安装态 0 斜杠、版本态 1 斜杠），两者都能通过校验。
function ensureEnvConfigured(): void {
  if (envConfigured) return
  env.allowLocalModels = false
  env.allowRemoteModels = true
  if (typeof window !== 'undefined' && window.location?.origin) {
    env.remoteHost = window.location.origin
    // ONNX 的 wasm 运行时也必须走本站下发（服务端 /ort-wasm 路由），否则默认指向 jsDelivr CDN，国内移动端拉不动。
    const onnxWasm = (env as any).backends?.onnx?.wasm
    if (onnxWasm) {
      onnxWasm.wasmPaths = `${window.location.origin}/ort-wasm/`
    }
  }
  env.remotePathTemplate = 'personality-models/{model}/'
  envConfigured = true
}

// 同一角色模型只加载一次：缓存 Promise，避免并发重复下载 ~77MB 包。
const loadCache = new Map<string, Promise<LoadedReranker>>()

// 释放某个模型的缓存与推理会话：影子模式按需加载第二个模型，观察结束必须释放，避免双模型常驻内存。
export async function releasePersonalityReranker(personalityModelPath: string): Promise<void> {
  const modelId = normalizeModelId(personalityModelPath)
  const cached = loadCache.get(modelId)
  if (!cached) return
  loadCache.delete(modelId)
  try {
    const loaded = await cached
    await (loaded.model as any)?.dispose?.()
  } catch {
    // 加载中失败或不支持 dispose 时静默放弃，缓存已移除
  }
}

function loadReranker(modelId: string): Promise<LoadedReranker> {
  const cached = loadCache.get(modelId)
  if (cached) return cached
  ensureEnvConfigured()
  const loading = (async (): Promise<LoadedReranker> => {
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(modelId),
      AutoModelForSequenceClassification.from_pretrained(modelId, { dtype: 'q8' })
    ])
    return { tokenizer, model }
  })()
  // 加载失败不缓存失败态，允许下次重试。
  loading.catch(() => loadCache.delete(modelId))
  loadCache.set(modelId, loading)
  return loading
}

function logDiagnostics(diagnostics: PersonalityRerankerDiagnostics): void {
  if (!isClientDebugFlagEnabled('personality-reranker')) return
  console.info('[personality-reranker] scoring diagnostics', {
    modelId: diagnostics.modelId,
    candidateCount: diagnostics.candidateCount,
    situationCharLength: diagnostics.situationCharLength,
    situationTokenCount: diagnostics.situationTokenCount,
    situationTruncated: diagnostics.situationTruncated,
    scoringSituationCharLength: diagnostics.scoringSituationCharLength,
    inputSequenceLength: diagnostics.inputSequenceLength,
    distinctEncodedInputCount: diagnostics.distinctEncodedInputCount,
    uniquePlanCount: diagnostics.uniquePlanCount,
    uniqueScoreCount: diagnostics.uniqueScoreCount,
    contextTokenBudget: diagnostics.contextTokenBudget,
    planTokenBudget: diagnostics.planTokenBudget,
    truncatedPlanCount: diagnostics.truncatedPlanCount
  })
}

/**
 * 对一批候选计划逐条打分。返回的分数顺序与 plans 一一对应。
 * @param personalityModelPath 角色已上传模型的存储相对路径（personality-models/<safeId>），为空直接报错由调用方门禁处理。
 */
export async function scorePersonalityPlans(input: {
  personalityModelPath: string
  situation: string
  plans: string[]
}): Promise<number[]> {
  const result = await scorePersonalityPlansDetailed(input)
  return result.scores
}

export async function scorePersonalityPlansDetailed(input: {
  personalityModelPath: string
  situation: string
  plans: string[]
}): Promise<PersonalityRerankerScoreResult> {
  const modelId = normalizeModelId(input.personalityModelPath)
  if (!modelId) {
    throw new Error('人格模型路径为空，无法进行浏览器本地推理')
  }
  const plans = Array.isArray(input.plans) ? input.plans.map((plan) => String(plan ?? '')) : []
  const situation = String(input.situation ?? '')
  if (!plans.length) {
    return buildEmptyScoreResult(modelId, situation)
  }
  const loaded = await loadReranker(modelId)
  const result = await scoreWithLoadedReranker(loaded, { modelId, situation, plans })
  logDiagnostics(result.diagnostics)
  return result
}
